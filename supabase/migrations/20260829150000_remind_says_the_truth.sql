-- ═══════════════════════════════════════════════════════════════
--  시작 한 시간 전에 사실대로 말한다 · 나간 사람은 이름으로 알린다
-- ═══════════════════════════════════════════════════════════════
-- 바로 앞 마이그레이션에서 시작 임박 알림을 확정된 모임에만 보내도록
-- 했다. 안 찬 모임을 "오늘 만나요" 라고 부르는 건 거짓말이라서였다.
-- 그런데 침묵도 답은 아니다 — 그 사람들은 여전히 오늘 그 시간을
-- 비워뒀고, 열리는지 아닌지를 모른 채로 둔다.
--
-- 그래서 둘 다 보낸다. 말만 다르게.
--
--   확정됨    "오늘 모임이 있어요 · B짐 19:00 에 만나요."
--   아직임    "아직 확정되지 않았어요 · B짐 19:00 모임이 정원을
--              채우지 못했어요. 시작할 때까지 안 차면 열리지 않아요."
--
-- 창도 좁힌다. 세 시간 창을 한 시간에 한 번 훑으면 어떤 사람은 세
-- 시간 전에, 어떤 사람은 오 분 전에 받았다. 십 분에 한 번 훑고 70분
-- 창을 보면 모두가 시작 한 시간쯤 전에 받는다.
--
-- 곁들여 "모임에서 한 자리가 비었어요" 를 손본다. 그 알림은 두 가지를
-- 한꺼번에 말하고 있었다 — 누가 나갔다는 사실과, 안 차면 취소된다는
-- 경고. 뒤엣것은 이제 위의 한 시간 전 알림이 맡는다. 자리가 빌 때마다
-- 겁을 주는 것보다, 정말 안 찼을 때 한 번 말하는 게 낫다.
-- 남는 것은 사실 하나다: 누가 나갔다.
--
-- ── 앞선 진단 정정 ──
-- 직전 마이그레이션에 "호스트는 signups 에 없다" 고 적었는데 틀렸다.
-- session_create 가 모임을 만들면서 호스트 몫의 signups 행을
-- confirmed 로 함께 넣는다. 그래서 시작 임박 알림도, 누가 나갔다는
-- 알림도 호스트는 원래 받고 있었다. 실제로 못 받던 것은 모임이 통째로
-- 무너졌을 때 하나뿐이고(session_collapse 가 호스트를 걸러낸다),
-- 그건 직전 마이그레이션에서 이미 고쳤다.
-- sessions_remind 에 넣었던 union 은 그래서 필요 없다 — 여기서 뺀다.

-- ───────────────────────────────────────────────────────────────
--  1. 시작 한 시간 전 — 확정됐든 아니든, 사실대로
-- ───────────────────────────────────────────────────────────────
create or replace function sessions_remind()
returns int language plpgsql security definer set search_path = public as $$
declare r record; g record; n int := 0; hm text;
begin
  for r in
    select s.* from sessions s
     where s.status in ('open','confirmed')
       and s.reminded_at is null
       and s.starts_at > now()
       and s.starts_at <= now() + interval '70 minutes'
  loop
    hm := to_char(r.starts_at at time zone 'Asia/Seoul', 'HH24:MI');
    for g in
      -- 호스트도 여기 들어 있다 (session_create 가 넣는다)
      select user_id from signups
       where session_id = r.id and status = 'confirmed'
    loop
      if r.status = 'confirmed' then
        perform notify_add(g.user_id, '오늘 모임이 있어요',
          r.gym || ' · ' || hm || ' 에 만나요.',
          '/session?id=' || r.id::text);
      else
        perform notify_add(g.user_id, '아직 확정되지 않았어요',
          r.gym || ' · ' || hm ||
          ' 모임이 아직 정원을 채우지 못했어요. 시작할 때까지 안 차면 열리지 않아요.',
          '/session?id=' || r.id::text);
      end if;
      n := n + 1;
    end loop;
    update sessions set reminded_at = now() where id = r.id;
  end loop;
  return n;
end $$;

revoke execute on function sessions_remind() from public, anon, authenticated;

-- 십 분에 한 번. 같은 이름으로 다시 걸면 pg_cron 이 갈아끼운다.
create extension if not exists pg_cron;
select cron.schedule('sessions-remind', '*/10 * * * *',
                     'select public.sessions_remind()');

-- ───────────────────────────────────────────────────────────────
--  2. 나간 사람은 이름으로 알린다
-- ───────────────────────────────────────────────────────────────
create or replace function session_cancel(p_session uuid)
returns json language plpgsql security definer set search_path = public as $$
declare me_id uuid := auth.uid(); my signups; me profiles; s sessions;
        left_cnt int; affected uuid[] := '{}'; g_id uuid;
begin
  select * into my from signups
   where session_id = p_session and user_id = me_id for update;
  if not found or my.status = 'cancelled' then
    return json_build_object('error','not_joined');
  end if;

  select * into s from sessions where id = p_session;
  if not found then return json_build_object('error','not_found'); end if;

  /* 호스트는 자기 모임에서 나갈 수 없다. 남은 사람들의 방을 만든 게
     호스트라서, 빠지는 게 아니라 지우는 것뿐이다 (session_delete). */
  if s.host_id = me_id then
    return json_build_object('error','host');
  end if;

  if s.starts_at <= now() then
    return json_build_object('error','started');
  end if;

  update signups set status = 'cancelled'
   where session_id = p_session and user_id = me_id;

  -- 승인 전이면 잡힌 자리가 없다. 승인 뒤면 그 자리 값은 안 돌려준다.
  if my.status = 'waiting' then
    perform session_fee_refund(p_session, me_id);
  end if;

  /* 방이 열려 있으면 누가 빠졌는지 남긴다. 취소로 이어지더라도 방은
     24시간 더 열려 있어서 남은 사람이 이 줄을 본다. */
  if my.status = 'confirmed' and session_chat_open(p_session) then
    select * into me from profiles where id = me_id;
    insert into messages (session_id, sender_id, body, kind)
    values (p_session, me_id,
            coalesce(nullif(me.nickname,''), '참가자') || '님이 나갔어요', 'system');
  end if;

  /* 확정이 1명까지 떨어지면 모임이 무너진 것이다. 호스트 혼자 남은 방은
     이야기할 상대가 없다 — 모임을 취소로 넘긴다. */
  select count(*) into left_cnt from signups
   where session_id = p_session and status = 'confirmed';

  if left_cnt < 2 then
    affected := session_collapse(p_session);
    return json_build_object('ok', true, 'cancelled', true, 'notify', affected);
  end if;

  /* 자리가 비었으면 다시 모집이다. 시작 시각까지 채우면 그대로 가고,
     못 채우면 그때 취소된다.

     status 를 되돌리는 게 핵심이다. 예전엔 confirmed 로 남아서, 자리가
     비었는데도 상세 화면은 "✓ 모임이 확정됐어요", 내가 만든 모임은
     "확정 · 채팅방 열림" 이라고 했다. 목록에는 빈자리가 보이는데
     말만 확정이었다. */
  if not session_is_filled(p_session) then
    update sessions set status = 'open' where id = p_session and status = 'confirmed';
  end if;

  /* 남은 사람에게 알린다. 채팅방에도 "○○님이 나갔어요" 가 뜨지만,
     채팅을 안 열어보면 모른다.

     "시작 전까지 안 차면 취소돼요" 는 여기서 뺐다. 자리가 빌 때마다
     겁을 주는 대신, 정말 안 찼는지는 시작 한 시간 전에 sessions_remind
     가 한 번 말해준다. 여기서는 누가 나갔는지만 알린다 — 그게 이
     알림이 실제로 전하는 소식이다. */
  select * into me from profiles where id = me_id;
  for g_id in
    select user_id from signups
     where session_id = p_session and status = 'confirmed' and user_id <> me_id
  loop
    perform notify_add(g_id,
      coalesce(nullif(me.nickname,''), '참가자') || '님이 모임에서 나갔어요',
      s.gym || ' 모임이에요.',
      '/session?id=' || p_session::text);
  end loop;

  return json_build_object('ok', true);
end; $$;

revoke execute on function session_cancel(uuid) from public, anon;
grant  execute on function session_cancel(uuid) to authenticated;
