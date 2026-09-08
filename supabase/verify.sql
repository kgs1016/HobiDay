-- 현재 제품의 읽기 전용 배포 점검표. ok가 모두 true인지 확인한다.
-- 폐지한 조기 확정·성비 규칙을 검사하면 정상 DB도 실패하므로 현행만 검사한다.
with fn as (
  select p.proname, pg_get_functiondef(p.oid) as src
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f'
), checks as (
  select 1 as no, '핵심 테이블 8종' as item, count(*)=8 as ok, count(*)||'/8' as detail
  from information_schema.tables where table_schema='public'
    and table_name in ('profiles','sessions','signups','matches','messages','reports','blocks','app_config')
  union all
  select 2,'승인·채팅·목록 RPC',count(*)=8,count(*)||'/8' from fn
    where proname in ('session_list','session_join','session_approve','my_hosted_requests',
      'my_signups','session_chat_member','my_session_chats','inbox_counts')
  union all
  select 3,'차단 필터 생존',count(*)=8 and bool_and(case
    when proname='session_approve' then src like '%join blocks%' and src like '%blocked_member%'
      and src like '%b.blocker_id = p_user%' and src like '%b.blocked_id = p_user%'
    when proname in ('session_chat_member','my_session_chats') then src like '%blocked_by_me%'
    else src like '%blocked_with%' end),count(*)||'/8' from fn
    where proname in ('session_list','session_join','session_approve','my_hosted_requests',
      'my_signups','session_chat_member','my_session_chats','inbox_counts')
  union all
  select 4,'모임 목록: 호스트·총 참여 인원',coalesce(bool_and(src like '%host_nickname%'
    and src like '%i_am_host%' and src like '%confirmed%' and src not like '%early_confirm_at%'),false),'현행 응답'
    from fn where proname='session_list'
  union all
  select 5,'정원은 총원 2~8명',exists(select 1 from pg_constraint
    where conrelid='public.sessions'::regclass and conname='sessions_capacity_check'
      and pg_get_constraintdef(oid) like '%capacity >= 2%' and pg_get_constraintdef(oid) like '%capacity <= 8%')
    and not exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='sessions' and column_name='gender_mode'),'성비 없음'
  union all
  select 6,'조기 확정 기능 제거',not exists(select 1 from fn where proname in
    ('session_propose_confirm','session_withdraw_confirm','session_accept_confirm','my_confirm_proposals'))
    and to_regclass('public.session_confirm_acks') is null
    and not exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='sessions' and column_name='early_confirm_at'),'2명부터 확정'
  union all
  select 7,'2명 이상 모임 상태 일치',not exists(select 1 from sessions s where s.status='open'
    and (select count(*) from signups g where g.session_id=s.id and g.status='confirmed')>=2),'누락된 상태 전환 없음'
  union all
  select 8,'성별 잠금 트리거',count(*)=1,count(*)::text from pg_trigger
    where tgname='profiles_gender_is_fixed' and not tgisinternal
  union all
  select 9,'app_config 존재',count(*)=1,count(*)::text from app_config
  union all
  select 10,'RLS 활성',count(*)=10 and bool_and(rowsecurity),count(*)||'/10' from pg_tables
    where schemaname='public' and tablename in
      ('profiles','sessions','signups','messages','blocks','reports','gyms','posts','post_comments','climbing_ascents')
  union all
  select 11,'운영 암장 마스터',count(*)>0,count(*)||'곳 (2026-09-08 검증: 164)' from gyms where is_active
  union all
  select 12,'대표사진 연결',count(*)>0,count(*)||'곳 (2026-09-08 검증: 156)'
    from gyms where is_active and nullif(thumbnail_url,'') is not null
  union all
  select 13,'전면 무료: 크레딧 RPC 제거',not exists(select 1 from fn where proname in
    ('credit_rule','credit_grant','credit_balance','my_credits','claim_profile_bonus','early_bird_status',
     'early_bird_slots','request_daily_limit','session_fee_refund','request_fee_refund')),'잔액·차감·보상 없음'
  union all
  select 14,'과거 원장 API 비공개',to_regclass('public.credit_ledger') is null
    and to_regclass('retired.credit_ledger') is not null
    and not has_schema_privilege('authenticated','retired','USAGE'),'원장 보존'
  union all
  select 15,'완등·공개 성취 RPC',count(*)=5,count(*)||'/5' from fn where proname in
    ('climbing_progress','climbing_ascent_list','climbing_ascent_save','climbing_ascent_delete','public_climbing_achievements')
  union all
  select 16,'상세 완등 기록 직접 접근 차단',not has_table_privilege('authenticated','public.climbing_ascents','SELECT'),
    'RPC에서 본인 기록만 제공'
  union all
  select 17,'영상 피드백·내 영상 RPC',count(*)=5,count(*)||'/5' from fn where proname in
    ('video_post_list','video_post_create','video_like_set','my_video_posts','my_video_count')
  union all
  select 18,'사진·영상 버킷 공개 범위',
    (select count(*)=3 and bool_and(not public) from storage.buckets where id in ('profile-photos','community-videos','mission-videos'))
    and (select coalesce(bool_and(public),false) from storage.buckets where id='gym-photos'),
    '암장 사진 공개 · 프로필/영상 비공개'
  union all
  select 19,'폐지한 최종선택·라운드 API 제거',not exists(select 1 from fn where proname in
    ('selection_submit','my_matches','sync_matches','mission_done','room_warmup_min','room_round_min','room_card_lead_min'))
    and to_regclass('public.selections') is null and to_regclass('public.missions') is null,'이력 정리 SQL 적용 후 통과'
)
select no,item,ok,detail from checks order by no;
