-- ═══════════════════════════════════════════════════════════════
--  시작한 모임은 더 이상 신청받지 않는다
-- ═══════════════════════════════════════════════════════════════
-- 지금은 시작 3시간 뒤까지 목록에 남는다. 이미 등반이 시작된 모임에
-- 남이 신청할 수 있다는 뜻이고, session_join 에는 시각 검사가 아예
-- 없어서 실제로 신청이 들어간다.
--
--   session_list  남에게는 시작 전까지만 보인다
--                 나(호스트·신청자)에게는 3시간까지 그대로 (아래 이유)
--   session_join  시작한 모임은 'started' 로 거절
--
-- 목록에서 감추는 것만으로는 부족하다. 상세 화면을 미리 열어둔 사람은
-- 목록과 무관하게 신청 버튼을 누를 수 있어서, 서버에서 막아야 한다.
--
-- 내 모임을 남겨두는 이유: 모임 상세 화면이 자체 조회 없이 이 목록에서
-- 찾아 쓴다. 여기서 빼면 '내가 만든 모임'·'신청함' 의 링크와 모임 채팅
-- 열기·진행 화면 버튼까지 한꺼번에 "모임을 찾을 수 없어요" 가 된다.
--
-- ⚠️ 두 함수 모두 이전 본문(20260817130000 · 20260821140000)을 그대로
--    들고 온 뒤 조건만 더했다. create or replace 는 통째로 갈아치운다.

create or replace function session_join(p_session uuid)
returns json language plpgsql security definer set search_path = public as $$
declare me profiles; s sessions; confirmed_cnt int; existing signups;
        cost int := -credit_rule('session_join'); bal int;
begin
  select * into me from profiles where id = auth.uid();
  if not found then return json_build_object('error','no_profile'); end if;

  select * into s from sessions where id = p_session for update;
  if not found or s.status not in ('open','confirmed') then
    return json_build_object('error','not_open');
  end if;
  -- 시작한 모임에는 못 들어간다. 목록에서 감추는 것만으로는 부족하다 —
  -- 이미 상세 화면을 열어둔 사람은 그대로 신청 버튼을 누를 수 있다.
  if s.starts_at <= now() then
    return json_build_object('error','started');
  end if;
  if s.host_id = me.id then return json_build_object('error','is_host'); end if;

  if (s.host_id is not null and blocked_with(s.host_id))
     or exists (select 1 from signups g
                 where g.session_id = s.id and g.status = 'confirmed'
                   and blocked_with(g.user_id)) then
    return json_build_object('error','blocked');
  end if;

  -- 자리가 이미 다 찼으면 신청 자체를 받지 않는다
  select count(*) into confirmed_cnt from signups
   where session_id = s.id and gender = me.gender and status = 'confirmed';
  if confirmed_cnt >= s.capacity then
    return json_build_object('error','full');
  end if;

  -- 이미 신청 중이면 차감 없이 상태만 돌려준다
  select * into existing from signups
   where session_id = s.id and user_id = me.id;
  if found and existing.status in ('waiting','confirmed') then
    return json_build_object('status', existing.status);
  end if;

  -- 같은 유저의 동시 요청이 잔액을 함께 넘기지 못하게 잠근다
  perform pg_advisory_xact_lock(hashtext(me.id::text));

  bal := credit_balance(me.id);
  if bal < cost then
    return json_build_object('error','no_credits', 'cost', cost, 'balance', bal);
  end if;

  -- ref 를 매번 다르게 둬야 취소 후 재신청 때 다시 차감된다
  insert into credit_ledger (user_id, delta, reason, ref)
  values (me.id, -cost, 'session_join',
          s.id::text || ':' || (extract(epoch from clock_timestamp()) * 1000000)::bigint::text);

  insert into signups (session_id, user_id, gender, status)
  values (s.id, me.id, me.gender, 'waiting')
  on conflict (session_id, user_id) do update
    set status = case when signups.status in ('cancelled','cut') then 'waiting'
                      else signups.status end;

  return json_build_object(
    'status', (select status from signups where session_id = s.id and user_id = me.id),
    'cost', cost, 'balance', credit_balance(me.id));
end; $$;

create or replace function session_list()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.starts_at), '[]'::json) from (
    select s.id, s.gym, s.starts_at, s.ends_at, s.capacity,
           s.level_min, s.level_max, s.age_min, s.age_max,
           s.intensity, s.after_meal, s.note, s.status,
           s.host_id,
           h.nickname as host_nickname,
           h.photo    as host_photo,
           h.age      as host_age,
           h.area     as host_area,
           h.level    as host_level,
           (s.host_id = auth.uid()) as i_am_host,
           s.early_confirm_at,
           exists (select 1 from session_confirm_acks a
                    where a.session_id = s.id and a.user_id = auth.uid()) as my_ack,
           (select count(*) from signups g
             where g.session_id = s.id and g.gender = 'm' and g.status = 'confirmed') as m_confirmed,
           (select count(*) from signups g
             where g.session_id = s.id and g.gender = 'f' and g.status = 'confirmed') as f_confirmed,
           (select g.status from signups g
             where g.session_id = s.id and g.user_id = auth.uid()) as my_status
      from sessions s
      left join profiles h on h.id = s.host_id
     where s.status in ('open','confirmed')
       and s.starts_at > now() - interval '3 hours'
       -- 시작한 모임은 남에게 안 보인다 → 더 신청할 수 없다.
       -- 나(호스트·신청자)에게는 시작 뒤에도 3시간까지 남긴다.
       -- 이 목록이 모임 상세 화면의 유일한 데이터원이라, 여기서 빼면
       -- '내가 만든 모임'·'신청함'의 링크가 전부 "찾을 수 없어요" 가 된다.
       and (s.starts_at > now()
         or s.host_id = auth.uid()
         or exists (select 1 from signups g
                     where g.session_id = s.id
                       and g.user_id = auth.uid()
                       and g.status in ('waiting','confirmed')))
       -- 내 모임은 항상 — 안 보이면 삭제·관리(환불)를 못 한다.
       -- 남의 모임은 차단 관계가 있으면 감춘다.
       and (s.host_id = auth.uid()
         or ((s.host_id is null or not blocked_with(s.host_id))
             and not exists (
               select 1 from signups g
                where g.session_id = s.id and g.status = 'confirmed'
                  and blocked_with(g.user_id))))
  ) t;
$$;

revoke execute on function session_join(uuid) from public, anon;
revoke execute on function session_list()     from public, anon;
grant execute on function session_join(uuid), session_list() to authenticated;
