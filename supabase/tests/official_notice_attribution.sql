-- Run in the same transaction as the migration, after recording before-state.
do $$
declare n record; d json; actual_count int;
begin
  select count(*) into actual_count from posts where editorial_author_name='운영팀';
  if actual_count<>2 then raise exception 'Expected exactly two official notices, got %',actual_count; end if;
  for n in select id,author_id from posts where editorial_author_name='운영팀' loop
    d:=post_detail(n.id);
    if d->>'nickname' is distinct from '운영팀' or d->>'photo' is distinct from
      '5a0ad6a0-b07e-4cf8-973c-a14133668558/hobiday-logo-526d5675292f.png'
      or d->>'author_id' is distinct from n.author_id::text then
      raise exception 'Notice attribution failed: %',n.id;
    end if;
  end loop;
  if exists(select 1 from notice_before b where
    (select to_jsonb(p)-'editorial_author_name'-'editorial_author_photo' from posts p where p.id=b.id) is distinct from b.raw) then
    raise exception 'Existing post contents or ownership changed';
  end if;
  if exists(select 1 from notice_before b where b.id not in
    ('be301249-1702-4ff8-8956-998078cb443c','3bda1726-ae43-4289-be9a-ea7460334aa9')
    and post_detail(b.id)::jsonb is distinct from b.detail) then
    raise exception 'An unrelated post response changed';
  end if;
  if has_table_privilege('authenticated','public.posts','UPDATE') or
     has_table_privilege('anon','public.posts','UPDATE') then
    raise exception 'Clients must not be able to set official attribution';
  end if;
end $$;
