-- ═══════════════════════════════════════════════════════════════
--  등반 인증은 실제로 등반한 모임에서만
-- ═══════════════════════════════════════════════════════════════
-- session_video_add 가 "내 자리가 잡혔는가" 만 보고 모임이 어떤
-- 상태인지는 안 봤다. 그래서 취소된 모임에서도, 아직 시작도 안 한
-- 모임에서도 영상을 올려 크레딧을 받을 수 있었다.
--
-- 다음 달 모임을 만들어 확정만 시켜놓고 오늘 바로 인증하는 게 됐다.
-- 호스트는 신청비도 안 내니 밑천이 필요 없다.
--
-- 시작한 모임, 취소되지 않은 모임에서만 받는다.

create or replace function session_video_add(p_session uuid, p_video text)
returns json language plpgsql security definer set search_path = public as $$
declare me_id uuid := auth.uid(); earned int;
begin
  if me_id is null then return json_build_object('error','no_auth'); end if;
  if nullif(trim(coalesce(p_video,'')), '') is null then
    return json_build_object('error','no_video');
  end if;

  if not exists (
    select 1 from signups
     where session_id = p_session and user_id = me_id and status = 'confirmed'
  ) then
    return json_build_object('error','not_confirmed');
  end if;

  /* 등반 인증은 실제로 등반했을 때 하는 것이다. 내 자리가 잡혔는지만
     보고 모임이 어떤 상태인지는 안 봤다. 그래서 —
       · 취소된 모임에서도 인증하고 크레딧을 받을 수 있었다
       · 다음 달 모임을 만들어 확정만 시켜놓고 오늘 바로 인증할 수 있었다
     시작한 모임, 취소되지 않은 모임에서만 받는다. */
  if not exists (
    select 1 from sessions
     where id = p_session and status <> 'cancelled' and starts_at <= now()
  ) then
    return json_build_object('error','not_started');
  end if;

  insert into session_videos (session_id, user_id, video_url)
  values (p_session, me_id, trim(p_video));

  earned := credit_grant(me_id, 'session_video', p_session::text);

  return json_build_object('ok', true, 'earned', earned,
                           'balance', credit_balance(me_id));
end; $$;

revoke execute on function session_video_add(uuid,text) from public, anon;
grant  execute on function session_video_add(uuid,text) to authenticated;
