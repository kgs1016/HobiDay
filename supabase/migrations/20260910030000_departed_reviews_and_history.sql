-- 탈퇴한 작성자의 리뷰 본문은 지우고 추천은 유지한다.
-- 과거 탈퇴 건도 동일하게 정리하며 author_id SET NULL 경로 전체에 적용한다.
update reviews set body = null where author_id is null and body is not null;

create function clear_departed_review_body()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.author_id is null then new.body := null; end if;
  return new;
end $$;
revoke all on function clear_departed_review_body() from public, anon, authenticated;
create trigger reviews_clear_departed_body
before insert or update on reviews
for each row execute function clear_departed_review_body();
alter table reviews add constraint reviews_departed_body_empty
  check (author_id is not null or body is null);

-- 탈퇴 시 이미 시작한 성사 모임의 인원수만 보존한다. 신원·사진·닉네임은 남기지 않는다.
-- 이전에 cascade로 삭제된 참가자는 추측하여 복원하지 않는다.
alter table sessions add column departed_members integer not null default 0
  check (departed_members >= 0);
create function preserve_departed_attendance()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update sessions s set departed_members = s.departed_members + 1
   where s.status in ('confirmed','done') and s.starts_at <= now()
     and exists (select 1 from signups g where g.session_id = s.id
                   and g.user_id = old.id and g.status = 'confirmed');
  return old;
end $$;
revoke all on function preserve_departed_attendance() from public, anon, authenticated;
create trigger profiles_preserve_departed_attendance
before delete on profiles
for each row execute function preserve_departed_attendance();

create or replace function my_match_history()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.starts_at desc), '[]'::json) from (
    select s.id, s.gym, s.starts_at, s.ends_at, s.capacity,
           coalesce(s.host_id = auth.uid(), false) as i_am_host,
           (select count(*) from signups g2
             where g2.session_id = s.id and g2.status = 'confirmed') + s.departed_members as members,
           s.departed_members,
           coalesce((
             select json_agg(row_to_json(m) order by m.nickname) from (
               select p.id, p.nickname, p.gender, p.level, p.photo,
                      coalesce(p.id = s.host_id, false) as is_host
                 from signups g3 join profiles p on p.id = g3.user_id
                where g3.session_id = s.id and g3.status = 'confirmed'
                  and p.id <> auth.uid() and not blocked_with(p.id)
             ) m), '[]'::json) as people
      from sessions s
      join signups g on g.session_id = s.id and g.user_id = auth.uid()
     where g.status = 'confirmed' and s.status in ('confirmed','done')
       and s.ends_at < now()
     order by s.starts_at desc limit 200
  ) t;
$$;
revoke execute on function my_match_history() from public, anon;
grant execute on function my_match_history() to authenticated;
