-- GVC Vault: read-only "viewer" login for Saad (Kyle, 2026-11-15)
-- Run once in Supabase > SQL Editor. Nobody else's access changes:
--   * every new rule only applies to members whose role is 'viewer'.
-- Undo: see the bottom of this file.

-- 1) Viewers can't insert, update or delete on any GVC table.
--    Restrictive rules are ANDed with the existing ones, so admin/crew/parts are untouched.
do $$ declare t text; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relkind='r' and c.relrowsecurity and c.relname like 'gvc\_%' loop
    execute format('create policy %I on public.%I as restrictive for insert to public with check (public.gvc_role() is distinct from ''viewer'')', t||'_noview_ins', t);
    execute format('create policy %I on public.%I as restrictive for update to public using (public.gvc_role() is distinct from ''viewer'') with check (public.gvc_role() is distinct from ''viewer'')', t||'_noview_upd', t);
    execute format('create policy %I on public.%I as restrictive for delete to public using (public.gvc_role() is distinct from ''viewer'')', t||'_noview_del', t);
  end loop; end $$;

-- 2) Viewers can READ the lists that are otherwise Kyle/office-only, so they see what Kyle sees.
--    (Private messages between people stay private.)
do $$ declare t text; begin
  foreach t in array array['gvc_todos','gvc_punches','gvc_requests','gvc_porders','gvc_prices','gvc_quote_parts','gvc_doc_text','gvc_recaps','gvc_widget_state','gvc_history'] loop
    execute format('create policy %I on public.%I for select to public using (public.gvc_role() = ''viewer'')', t||'_viewer_read', t);
  end loop; end $$;

-- 3) Punch in/out skip the table rules (they run as the owner), so refuse viewers inside them.
create or replace function public.gvc_punch_in(p_who text, p_job text, p_task text, p_job_name text, p_task_name text)
 returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare nid uuid;
begin
  if not gvc_is_member() then raise exception 'not allowed'; end if;
  if gvc_role() = 'viewer' then raise exception 'View only - this login can''t change anything'; end if;
  if gvc_role() <> 'admin' and p_who is distinct from gvc_my_name() then raise exception 'You can only punch yourself in'; end if;
  update gvc_punches set end_at=now() where who=p_who and end_at is null;
  insert into gvc_punches(who,job_id,task_id,job_name,task_name) values (p_who,p_job,p_task,p_job_name,p_task_name) returning id into nid;
  return nid;
end $function$;

create or replace function public.gvc_punch_out(p_who text)
 returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if not gvc_is_member() then raise exception 'not allowed'; end if;
  if gvc_role() = 'viewer' then raise exception 'View only - this login can''t change anything'; end if;
  if gvc_role() <> 'admin' and p_who is distinct from gvc_my_name() then raise exception 'You can only punch yourself out'; end if;
  update gvc_punches set end_at=now() where who=p_who and end_at is null;
end $function$;

-- 4) Put Saad on the shop list as a viewer.
--    Use the same email you give his login in Authentication > Users > Add user.
insert into public.gvc_members(email, name, role) values ('saad@gvcvault.test', 'Saad', 'viewer')
  on conflict (email) do update set role = 'viewer', name = 'Saad';

-- ---------------------------------------------------------------------------
-- UNDO (shut Saad out and remove the viewer rules):
--   delete from public.gvc_members where role = 'viewer';
--   then delete his user in Authentication > Users.
--   The viewer rules do nothing once no one has the role; to drop them anyway:
--   do $$ declare p record; begin for p in select tablename, policyname from pg_policies
--     where schemaname='public' and (policyname like '%\_noview\_%' or policyname like '%\_viewer\_read') loop
--     execute format('drop policy %I on public.%I', p.policyname, p.tablename); end loop; end $$;
