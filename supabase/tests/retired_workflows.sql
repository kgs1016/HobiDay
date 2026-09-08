begin;
do $$
declare item text;
begin
  assert not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('selection_submit','my_matches','sync_matches',
      'mission_done','room_warmup_min','room_round_min','room_card_lead_min')), 'retired RPCs must be removed';
  assert to_regclass('public.matches') is not null and to_regclass('public.messages') is not null,
    'existing chat tables must remain';
  assert not has_schema_privilege('authenticated','retired','USAGE')
    and not has_schema_privilege('anon','retired','USAGE')
    and not has_schema_privilege('service_role','retired','USAGE'), 'archive must not be exposed';
  foreach item in array array['missions','selections'] loop
    assert to_regclass(format('public.%I',item)) is null, 'retired tables must leave the API schema';
    if to_regclass(format('retired.%I',item)) is not null then
      assert not has_table_privilege('authenticated',format('retired.%I',item),'SELECT')
        and not has_table_privilege('anon',format('retired.%I',item),'SELECT'), 'archived records must stay private';
    end if;
  end loop;
end $$;
rollback;
