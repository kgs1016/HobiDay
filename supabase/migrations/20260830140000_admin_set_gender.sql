-- ═══════════════════════════════════════════════════════════════
--  운영자만 쓰는 성별 변경 — 홍보 화면용 계정을 위해
-- ═══════════════════════════════════════════════════════════════
-- 성별은 20260816203000_lock_gender 에서 트리거로 잠갔다. 표시용이
-- 아니라 판정 기준이라서다 (모임 확정 · 사람 찾기 · 관심 · signups).
-- 그 잠금은 그대로 둔다 — 유저에게는 여전히 못 바꾸는 값이다.
--
-- 다만 홍보 화면을 찍으려고 만든 운영자 계정은 성별을 옮겨야 할 때가
-- 있다. 대시보드에서 profiles 를 직접 update 하면 두 가지가 어긋난다.
--
--   ① signups.gender 는 신청하던 시점의 값이라 그대로 남는다.
--      남녀 수를 세는 자리가 전부 그 값을 보므로, 프로필은 남자인데
--      확정 인원은 여자로 세어지는 모임이 생긴다.
--   ② 아직 안 끝난 모임에 얽혀 있으면 그 모임의 성비가 그 자리에서
--      깨진다. 1:1 로 확정된 방이 실제로는 같은 성별 둘이 된다.
--
-- 그래서 창구를 하나 만들어 둘을 함께 처리한다. 실행 권한은 아무에게도
-- 주지 않는다 — 대시보드(service role)에서만 부른다.
--
--   select admin_set_gender('<user id>', 'm');
--
-- 사람 찾기와 관심은 손댈 게 없다. 둘 다 profiles.gender 를 그때그때
-- 읽어서 반대 성별만 고르므로, 바꾸는 순간 알아서 따라온다.

-- ───────────────────────────────────────────────────────────────
--  1. 잠금은 "누가 부르느냐" 로 가른다
-- ───────────────────────────────────────────────────────────────
-- 앱에서 오는 요청은 anon 아니면 authenticated 로 들어온다. 그 둘만
-- 막으면 된다. 대시보드(postgres)와 security definer 함수 안쪽은
-- 그 역할이 아니라 자연히 통과한다.
--
-- 처음엔 세션 설정(GUC)으로 잠깐 여는 방식을 썼는데, 그러면 잠금이
-- "클라이언트가 그 설정을 못 건드린다" 는 가정 위에 서게 된다.
-- 역할로 가르면 가정이 필요 없다.
create or replace function profiles_gender_is_fixed()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.gender is distinct from old.gender
     and current_user in ('anon', 'authenticated') then
    raise exception '성별은 바꿀 수 없어요'
      using errcode = 'check_violation',
            hint = '잘못 고르셨다면 탈퇴 후 다시 가입해주세요';
  end if;
  return new;
end $$;

-- ───────────────────────────────────────────────────────────────
--  2. 운영자용 창구
-- ───────────────────────────────────────────────────────────────
create or replace function admin_set_gender(p_user uuid, p_gender text)
returns json language plpgsql security definer set search_path = public as $$
declare live int; old_gender text;
begin
  if p_gender not in ('m','f') then
    return json_build_object('error','bad_gender');
  end if;

  select gender into old_gender from profiles where id = p_user;
  if not found then return json_build_object('error','no_profile'); end if;
  if old_gender = p_gender then
    return json_build_object('ok', true, 'changed', false);
  end if;

  /* 아직 끝나지 않은 모임에 얽혀 있으면 안 바꾼다. 바꾸는 순간 그
     모임의 성비 판정이 달라져서, 이미 확정된 자리가 조용히 어긋난다.
     끝난 모임은 더 셀 일이 없으니 상관없다. */
  select count(*) into live
    from signups g join sessions s on s.id = g.session_id
   where g.user_id = p_user
     and g.status in ('waiting','confirmed')
     and s.status <> 'cancelled'
     and s.ends_at > now();
  if live > 0 then
    return json_build_object('error','busy', 'sessions', live);
  end if;

  /* security definer 라 이 안에서 current_user 는 함수 주인(postgres)이다.
     위 트리거의 검사를 자연히 지나간다. */
  update profiles set gender = p_gender where id = p_user;

  /* 지난 신청 기록도 함께 옮긴다. 안 옮기면 프로필과 다른 값이 남아서,
     매칭 기록처럼 옛 모임을 다시 그리는 화면에서 어긋난다. */
  update signups set gender = p_gender where user_id = p_user;

  return json_build_object('ok', true, 'changed', true,
                           'from', old_gender, 'to', p_gender);
end $$;

-- 앱에서 부를 수 있는 길은 만들지 않는다. 대시보드에서만 쓴다.
revoke execute on function admin_set_gender(uuid, text) from public, anon, authenticated;
