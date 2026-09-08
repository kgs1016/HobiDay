/* db push 가 제대로 끝났는지 한 번에 보는 점검표.
   샌드박스든 본 DB든 SQL Editor 에 통째로 붙여넣고 Run.
   ok 열이 전부 true 여야 한다.

   가장 중요한 건 "차단+승인제 병합" 줄이다. create or replace function 은
   함수를 통째로 갈아치우기 때문에, 마이그레이션 순서가 꼬이면 나중 것이
   앞의 차단 필터를 조용히 지운다. 에러가 안 나서 눈치채기 어렵다. */

with fn as (
  select p.proname, pg_get_functiondef(p.oid) as src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
),
checks as (
  /* 1. 테이블이 다 섰는가 */
  select 1 as no, '테이블 8종' as 항목,
         count(*) = 8 as ok,
         count(*) || '/8' as 값
    from information_schema.tables
   where table_schema = 'public'
     and table_name in ('profiles','sessions','signups','matches',
                        'messages','reports','blocks','app_config')

  /* 2. 최신 기능들이 올라왔는가 */
  union all
  select 2, '함수 9종 (승인제·채팅·차단)',
         count(*) = 9, count(*) || '/9'
    from fn
   where proname in ('session_list','session_join','session_approve',
                     'my_hosted_requests','my_confirm_proposals','my_signups',
                     'session_chat_member','my_session_chats','inbox_counts')

  /* 3. ★ 차단 필터가 승인제 병합에서 살아남았는가 — 여기가 핵심 */
  union all
  select 3, '★ 차단 필터 생존 (9개 함수 전부)',
         count(*) = 9, count(*) || '/9'
    from fn
   where proname in ('session_list','session_join','session_approve',
                     'my_hosted_requests','my_confirm_proposals','my_signups',
                     'session_chat_member','my_session_chats','inbox_counts')
     and src like '%blocked_with%'

  /* 4. 호스트 정보·조기 확정이 session_list 에 함께 있는가 */
  union all
  select 4, '★ session_list 에 호스트+조기확정',
         bool_and(src like '%host_nickname%' and src like '%i_am_host%'
                  and src like '%early_confirm_at%'),
         '단일 함수'
    from fn where proname = 'session_list'

  /* 5. 단체 채팅 */
  union all
  select 5, '모임 채팅 4종', count(*) = 4, count(*) || '/4'
    from fn
   where proname in ('session_chat_send','session_chat_messages',
                     'session_chat_mark_read','session_try_confirm')

  /* 6. 조기 확정 */
  union all
  select 6, '조기 확정 3종', count(*) = 3, count(*) || '/3'
    from fn
   where proname in ('session_propose_confirm','session_withdraw_confirm',
                     'session_accept_confirm')

  /* 7. 가입 후 성별 잠금 */
  union all
  select 7, '성별 잠금 트리거', count(*) = 1, count(*)::text
    from pg_trigger
   where tgname = 'profiles_gender_is_fixed' and not tgisinternal

  /* 8. 프로필 기본 공개 */
  union all
  select 8, '프로필 기본 공개',
         column_default like '%true%', coalesce(column_default,'(없음)')
    from information_schema.columns
   where table_schema='public' and table_name='profiles' and column_name='is_public'

  /* 9. 운영 스위치 행이 있는가 — 없으면 화면이 대기 상태로 멈춘다 */
  union all
  select 9, 'app_config 존재', count(*) = 1, count(*)::text from app_config

  /* 10. RLS 가 켜져 있는가 — 꺼져 있으면 남의 데이터가 그대로 보인다 */
  union all
  select 10, 'RLS 활성', bool_and(rowsecurity), count(*) || '개 테이블'
    from pg_tables
   where schemaname='public'
     and tablename in ('profiles','sessions','signups','messages',
                       'blocks','reports','gyms')

  /* 11. 암장 마스터 — 폐업 35·중복 1 을 내린 뒤 운영 164곳 (20260908200000).
         200 이면 비활성 마이그레이션이 안 올라간 것이고, 그 사이 값이면
         누가 손으로 고친 행이 있다. */
  union all
  select 11, '운영 암장 164곳', count(*) = 164, count(*) || '곳'
    from gyms where is_active

  /* 12. 대표사진 — upload_gym_photos.mjs 를 돌린 뒤 156 이어야 한다.
         0 이면 아직 업로드 전(정상), 156 보다 크면 폐업 암장 사진까지 올라간 것. */
  union all
  select 12, '대표사진 156곳 (업로드 후)', count(*) in (0, 156), count(*) || '곳'
    from gyms where is_active and thumbnail_url is not null
  union all
  select 13, '전면 무료: 차감·적립·잔액 RPC 제거',
         not exists (select 1 from fn where proname in
           ('credit_rule','credit_grant','credit_balance','my_credits','claim_profile_bonus',
            'early_bird_status','early_bird_slots','request_daily_limit','session_fee_refund','request_fee_refund')),
         '크레딧 RPC 0개'

  union all
  select 14, '과거 원장 API 비공개',
         to_regclass('public.credit_ledger') is null
         and to_regclass('retired.credit_ledger') is not null
         and not has_schema_privilege('authenticated','retired','USAGE'),
         'retired 스키마'
)
select case when ok then '✅' else '❌' end as " ", 항목, 값
  from checks order by no;
