-- 로컬 회귀 검사. 운영 사용자 대신 격리된 테스트 DB에서 실행한다.
begin;
create function pg_temp.uid(n integer) returns uuid language sql immutable as $$
 select ('de1e0000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
$$;
insert into auth.users(id) select pg_temp.uid(n) from generate_series(1,5) n;
insert into profiles(id,nickname,gender,age,area,level,career,home_gym,is_public)
select pg_temp.uid(n),'member-'||n,'m',25,'서울',3,3,'test-gym',false from generate_series(1,5) n;
insert into sessions(id,host_id,gym,starts_at,ends_at,capacity,level_min,level_max,age_min,age_max,status)
select pg_temp.uid(100+n),pg_temp.uid(case when n=2 then 5 else 1 end),'test-gym',
 case when n=2 then now()+interval '1 day' else now()-interval '2 days' end,
 case when n=2 then now()+interval '1 day 2 hours' else now()-interval '1 day' end,
 4,1,2,20,39,case when n=3 then 'cancelled' when n=4 then 'open' else 'done' end
from generate_series(1,4) n;
insert into signups(session_id,user_id,gender,status)
select pg_temp.uid(100+s),pg_temp.uid(u),'m','confirmed' from generate_series(1,4) s cross join generate_series(1,4) u;
insert into reviews(session_id,author_id,target_id,liked,body) values
(pg_temp.uid(101),null,pg_temp.uid(3),true,'legacy deleted author text'),
(pg_temp.uid(101),pg_temp.uid(2),pg_temp.uid(3),true,'departing author text'),
(pg_temp.uid(101),pg_temp.uid(4),pg_temp.uid(3),false,'active author text'),
(pg_temp.uid(101),pg_temp.uid(1),pg_temp.uid(3),true,null);

-- APPLY MIGRATION HERE (runner applies the new migration between the two sections)
do $$ declare history jsonb; profile jsonb; result jsonb; begin
  assert not exists(select 1 from reviews where author_id is null and body is not null), 'backfill removes old text';
  assert (select count(*) from reviews where target_id=pg_temp.uid(3) and liked)=3, 'backfill preserves recommendations';
  perform set_config('request.jwt.claim.sub',pg_temp.uid(2)::text,true);
  assert account_delete()->>'ok'='true', 'normal account deletion succeeds';
  assert not exists(select 1 from auth.users where id=pg_temp.uid(2)), 'identity deleted';
  assert not exists(select 1 from reviews where body='departing author text'), 'body removed through FK set-null';
  assert (select count(*) from reviews where target_id=pg_temp.uid(3) and liked)=3, 'likes survive deletion';
  assert (select departed_members from sessions where id=pg_temp.uid(102))=0, 'future attendance not counted';
  assert (select departed_members from sessions where id=pg_temp.uid(103))=0, 'cancelled attendance not counted';
  assert (select departed_members from sessions where id=pg_temp.uid(104))=0, 'unconfirmed meetup not counted';

  perform set_config('request.jwt.claim.sub',pg_temp.uid(3)::text,true);
  history:=my_match_history()::jsonb;
  assert jsonb_array_length(history)=1, 'only completed confirmed attendance';
  assert (history->0->>'members')::int=4, 'original four member count preserved';
  assert (history->0->>'departed_members')::int=1, 'only one departed member';
  assert jsonb_array_length(history->0->'people')=2, 'other two peers remain visible, self excluded';
  assert profile_visible(pg_temp.uid(4)), 'active private peer remains accessible';
  profile:=user_profile(pg_temp.uid(3),null)::jsonb;
  assert (profile->>'likes')::int=3 and (profile->>'reviews')::int=1, 'profile counters agree';
  result:=profile_reviews(pg_temp.uid(3))::jsonb;
  assert jsonb_array_length(result)=1 and result->0->>'body'='active author text', 'only active author text returned';

  insert into blocks(blocker_id,blocked_id) values(pg_temp.uid(3),pg_temp.uid(4));
  history:=my_match_history()::jsonb;
  assert jsonb_array_length(history->0->'people')=1, 'blocked peer still hidden';
  assert (history->0->>'departed_members')::int=1, 'blocking is not labelled withdrawal';
  assert not profile_visible(pg_temp.uid(4)), 'blocked profile still protected';

  perform set_config('request.jwt.claim.sub',pg_temp.uid(1)::text,true);
  assert account_delete()->>'ok'='true', 'past meetup host can leave';
  perform set_config('request.jwt.claim.sub',pg_temp.uid(3)::text,true);
  delete from blocks where blocker_id=pg_temp.uid(3);
  history:=my_match_history()::jsonb;
  assert (history->0->>'members')::int=4 and (history->0->>'departed_members')::int=2, 'host departure preserves history';
  assert jsonb_array_length(history->0->'people')=1, 'remaining peer survives host departure';
  assert not (history->0->>'i_am_host')::boolean, 'null host not treated as current user';
  update reviews set body='must stay removed' where author_id is null;
  assert not exists(select 1 from reviews where author_id is null and body is not null), 'body cannot reappear on orphaned reviews';
  assert (select count(*) from reviews where target_id=pg_temp.uid(3) and liked)=3, 'recommendations unchanged after repeated cleanup';

  perform set_config('request.jwt.claim.sub',pg_temp.uid(5)::text,true);
  assert json_array_length(my_match_history())=0, 'unrelated member has no history';
  perform set_config('request.jwt.claim.sub','',true);
  assert json_array_length(my_match_history())=0, 'anonymous callers have no history';
  assert not has_function_privilege('anon','my_match_history()','execute'), 'history not publicly executable';
  assert not has_function_privilege('authenticated','preserve_departed_attendance()','execute'), 'counter cannot be called directly';
end $$;
rollback;
