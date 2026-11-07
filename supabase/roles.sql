-- Roles, Robin (parts), supply requests, revision gate, hardware inventory (2026-11-06). Applied as migration gvc_roles_parts.
-- Roles: admin (Kyle), crew (Colton...), parts (Robin). The database now enforces who sees/changes what, not just the app.

-- who am I
create or replace function public.gvc_role() returns text language sql stable security definer set search_path=public as $$
  select m.role from gvc_members m where lower(m.email)=lower(coalesce(auth.jwt()->>'email','')) limit 1 $$;
create or replace function public.gvc_my_name() returns text language sql stable security definer set search_path=public as $$
  select m.name from gvc_members m where lower(m.email)=lower(coalesce(auth.jwt()->>'email','')) limit 1 $$;
grant execute on function public.gvc_role(), public.gvc_my_name() to authenticated;

-- Robin signs up herself with this email (Create account, confirm email), same as Colton
insert into gvc_members(email,name,role) values ('robin.gvc@hotmail.com','Robin','parts') on conflict do nothing;

-- ---------- time clock: your own punches; Kyle + Robin (payroll) see everyone's ----------
drop policy if exists gvc_punches_members on gvc_punches;
create policy gvc_punches_read on gvc_punches for select using (gvc_role() in ('admin','parts') or who = gvc_my_name());
create policy gvc_punches_ins on gvc_punches for insert with check (gvc_role()='admin' or who = gvc_my_name());
create policy gvc_punches_upd on gvc_punches for update using (gvc_role()='admin' or who = gvc_my_name()) with check (gvc_role()='admin' or who = gvc_my_name());
create policy gvc_punches_del on gvc_punches for delete using (gvc_role()='admin' or who = gvc_my_name());

create or replace function public.gvc_punch_in(p_who text, p_job text, p_task text, p_job_name text, p_task_name text) returns uuid
language plpgsql security definer set search_path=public as $$
declare nid uuid;
begin
  if not gvc_is_member() then raise exception 'not allowed'; end if;
  if gvc_role() <> 'admin' and p_who is distinct from gvc_my_name() then raise exception 'You can only punch yourself in'; end if;
  update gvc_punches set end_at=now() where who=p_who and end_at is null;
  insert into gvc_punches(who,job_id,task_id,job_name,task_name) values (p_who,p_job,p_task,p_job_name,p_task_name) returning id into nid;
  return nid;
end $$;
create or replace function public.gvc_punch_out(p_who text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not gvc_is_member() then raise exception 'not allowed'; end if;
  if gvc_role() <> 'admin' and p_who is distinct from gvc_my_name() then raise exception 'You can only punch yourself out'; end if;
  update gvc_punches set end_at=now() where who=p_who and end_at is null;
end $$;

-- ---------- messages: only your own conversations ----------
drop policy if exists gvc_messages_members on gvc_messages;
create policy gvc_messages_read on gvc_messages for select using (gvc_is_member() and (from_name = gvc_my_name() or to_name = gvc_my_name()));
create policy gvc_messages_ins on gvc_messages for insert with check (gvc_is_member() and from_name = gvc_my_name());
create policy gvc_messages_upd on gvc_messages for update using (gvc_is_member() and to_name = gvc_my_name()) with check (to_name = gvc_my_name());

-- ---------- prices / quotes: Kyle + Robin ----------
do $$ declare t text; begin
  foreach t in array array['gvc_prices','gvc_quote_parts','gvc_doc_text'] loop
    execute format('drop policy if exists %I on %I', t||'_members', t);
    execute format('create policy %I on %I for all using (gvc_role() in (''admin'',''parts'')) with check (gvc_role() in (''admin'',''parts''))', t||'_office', t);
  end loop;
end $$;

-- ---------- Kyle-only: his to-do list (anyone may add to it), recordings, app ideas, widget, undo history ----------
drop policy if exists gvc_todos_members on gvc_todos;
create policy gvc_todos_read on gvc_todos for select using (gvc_role()='admin');
create policy gvc_todos_ins on gvc_todos for insert with check (gvc_is_member());
create policy gvc_todos_upd on gvc_todos for update using (gvc_role()='admin') with check (gvc_role()='admin');
create policy gvc_todos_del on gvc_todos for delete using (gvc_role()='admin');
drop policy if exists gvc_recaps_members on gvc_recaps;
create policy gvc_recaps_admin on gvc_recaps for all using (gvc_role()='admin') with check (gvc_role()='admin');
drop policy if exists gvc_feedback_all on gvc_feedback;
create policy gvc_feedback_admin on gvc_feedback for all using (gvc_role()='admin') with check (gvc_role()='admin');
drop policy if exists gvc_widget_state_members on gvc_widget_state;
create policy gvc_widget_state_admin on gvc_widget_state for all using (gvc_role()='admin') with check (gvc_role()='admin');
drop policy if exists gvc_history_read on gvc_history;
create policy gvc_history_admin on gvc_history for select using (gvc_role()='admin');

-- apply/undo board suggestions and the widget key: Kyle (or the scheduled email check, which has no login) only
do $$ declare f text; d text; begin
  foreach f in array array['gvc_apply_suggestion','gvc_undo_suggestion','gvc_widget_key'] loop
    select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=f limit 1;
    d := replace(replace(d, 'not public.gvc_is_member()', 'coalesce(public.gvc_role(),'''') <> ''admin'''), 'not gvc_is_member()', 'coalesce(gvc_role(),'''') <> ''admin''');
    execute d;
  end loop;
end $$;

-- ---------- supply requests: crew -> Kyle approves -> Robin orders ----------
create table if not exists public.gvc_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  who text,                       -- who asked
  what text not null,
  how text,                       -- 'low' | 'out' | null
  qty text,
  note text,
  job_id text,
  consumable_id uuid,
  hardware_key text,
  status text not null default 'approved',   -- review (waiting for Kyle) | approved (Robin to order) | rejected | ordered | received | cancelled
  reviewed_by text, reviewed_at timestamptz, reason text,
  vendor text, ordered_at timestamptz, eta text, received_at timestamptz,
  log jsonb not null default '[]'::jsonb
);
alter table public.gvc_requests enable row level security;
create policy gvc_requests_read on gvc_requests for select using (gvc_role() in ('admin','parts') or who = gvc_my_name());
create policy gvc_requests_ins on gvc_requests for insert with check (gvc_is_member());
create policy gvc_requests_upd on gvc_requests for update using (gvc_role() in ('admin','parts')) with check (gvc_role() in ('admin','parts'));
create policy gvc_requests_del on gvc_requests for delete using (gvc_role()='admin' or (who = gvc_my_name() and status='review'));
grant select, insert, update, delete on public.gvc_requests to authenticated;
revoke all on public.gvc_requests from anon;

create or replace function public.gvc_requests_guard() returns trigger language plpgsql security definer set search_path=public as $$
declare r text := gvc_role(); n text := gvc_my_name();
begin
  if r is null then return new; end if;           -- scheduled tasks / server
  if tg_op='INSERT' then
    new.who := coalesce(n, new.who);
    if r='crew' then new.status := 'review'; new.reviewed_by := null; new.reviewed_at := null;
    elsif new.status is null or new.status not in ('approved','ordered','received') then new.status := 'approved'; end if;
    if r='admin' and new.status='approved' then new.reviewed_by := n; new.reviewed_at := now(); end if;
  else
    new.updated_at := now();
    if r<>'admin' and (old.status='review' or new.status in ('review','rejected')) and new.status is distinct from old.status then
      raise exception 'Only Kyle approves or rejects requests';
    end if;
    if new.status in ('approved','rejected') and old.status='review' then new.reviewed_by := n; new.reviewed_at := now(); end if;
    if new.status='ordered' and old.status is distinct from 'ordered' and new.ordered_at is null then new.ordered_at := now(); end if;
    if new.status='received' and old.status is distinct from 'received' and new.received_at is null then new.received_at := now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists gvc_requests_guard on gvc_requests;
create trigger gvc_requests_guard before insert or update on gvc_requests for each row execute function gvc_requests_guard();
alter publication supabase_realtime add table public.gvc_requests;

-- ---------- revisions: crew's wait for Kyle; only Jessie marks Done / asks a question (through his link page) ----------
-- statuses: review (waiting for Kyle) -> open (approved, not sent) -> sent -> done (Jessie) | question (Jessie) -> checked ; dropped
create or replace function public.gvc_revisions_guard() returns trigger language plpgsql security definer set search_path=public as $$
declare r text := gvc_role();
begin
  if r is null then return new; end if;           -- Jessie's link page (server) / scheduled tasks
  if tg_op='INSERT' then
    if r<>'admin' then new.status := 'review'; elsif new.status is null or new.status in ('done','question') then new.status := 'open'; end if;
    new.done_at := null;
    return new;
  end if;
  if new.status is distinct from old.status then
    if r<>'admin' then raise exception 'Only Kyle changes a revision''s status'; end if;
    if new.status in ('done','question') then raise exception 'Only Jessie marks a revision done - he does it from his link'; end if;
  end if;
  if new.done_at is distinct from old.done_at and new.status is not distinct from old.status then new.done_at := old.done_at; end if;
  return new;
end $$;
drop trigger if exists gvc_revisions_guard on gvc_revisions;
create trigger gvc_revisions_guard before insert or update on gvc_revisions for each row execute function gvc_revisions_guard();

-- Jessie's private link key (kept in gvc_secret, which only the server can read). Kyle's app asks for it when emailing him.
create or replace function public.gvc_jessie_key() returns text language plpgsql security definer set search_path=public as $$
declare k text;
begin
  if coalesce(gvc_role(),'') <> 'admin' then raise exception 'not allowed'; end if;
  select v into k from gvc_secret where gvc_secret.k='jessie_key';
  if k is null then k := encode(extensions.gen_random_bytes(18),'hex'); insert into gvc_secret(k,v) values ('jessie_key',k); end if;
  return k;
end $$;
grant execute on function public.gvc_jessie_key() to authenticated;

-- ---------- hardware inventory: Robin's "Complete Inventory" sheet, synced daily (her sheet stays the master) ----------
create table if not exists public.gvc_hardware (
  key text primary key,          -- vendor|part number (or description when no part number)
  grp text, section text, sub text,
  kind text,                     -- Bolts & screws / Nuts / Washers / Lights & electrical / Hydraulic / Shop supplies / Safety / Grill parts / Hardware
  vendor text, vendor_raw text, part_no text, description text, size text, spec text, category text,
  qty numeric, unit text, pack_qty numeric, unit_cost numeric, per_truck numeric,
  min_qty numeric,               -- set in the app (not in the sheet)
  note text,                     -- set in the app
  sort int, in_sheet boolean not null default true, seen_run text,
  updated_at timestamptz not null default now()
);
alter table public.gvc_hardware enable row level security;
create policy gvc_hardware_read on gvc_hardware for select using (gvc_is_member());
create policy gvc_hardware_write on gvc_hardware for update using (gvc_role() in ('admin','parts')) with check (gvc_role() in ('admin','parts'));
grant select, update on public.gvc_hardware to authenticated;
revoke all on public.gvc_hardware from anon;

create or replace function public.gvc_hw_kind(p_section text, p_grp text, p_desc text) returns text language sql immutable as $$
  select case
    when coalesce(p_section,'') ilike 'grill%' or coalesce(p_grp,'') ilike 'grill%' then 'Grill parts'
    when coalesce(p_section,'') ilike 'safety%' or coalesce(p_grp,'') ilike 'safety%' then 'Safety'
    when coalesce(p_section,'') ilike 'hydraul%' or coalesce(p_grp,'') ~* '^(jic|hoses)' or coalesce(p_desc,'') ~* 'hydraulic|\mjic\M' then 'Hydraulic'
    when coalesce(p_desc,'') ~* 'washer' then 'Washers'
    when coalesce(p_desc,'') ~* '\mnuts?\M|weld nut' then 'Nuts'
    when coalesce(p_desc,'') ~* 'screw|bolt' or coalesce(p_grp,'') ~* 'screw|grade [58]' then 'Bolts & screws'
    when coalesce(p_section,'') ilike 'electrical%' or coalesce(p_desc,'') ~* 'light|\mwire\M|plug|fuse|relay|terminal|connector|heat shrink|battery|alarm|junction|strain relief|led' then 'Lights & electrical'
    when coalesce(p_section,'') ~* 'shop supplies|drill' or coalesce(p_desc,'') ~* 'drill|disc|disk|cutter|zip tie|rivet|earplug|tape' then 'Shop supplies'
    else 'Hardware' end $$;

-- p_rows: [{key,grp,section,sub,vendor,vendor_raw,part_no,description,size,spec,category,qty,unit,pack_qty,unit_cost,per_truck,sort}, ...]
-- call once per chunk with the same p_run; p_last=true on the final chunk marks rows no longer in the sheet.
create or replace function public.gvc_hardware_sync(p_rows jsonb, p_run text, p_last boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare n int; gone int := 0; tot int;
begin
  if auth.role() is not null and auth.role() <> 'service_role' and coalesce(gvc_role(),'') not in ('admin','parts') then raise exception 'not allowed'; end if;
  insert into gvc_hardware(key,grp,section,sub,kind,vendor,vendor_raw,part_no,description,size,spec,category,qty,unit,pack_qty,unit_cost,per_truck,sort,in_sheet,seen_run,updated_at)
  select x->>'key', x->>'grp', nullif(x->>'section',''), nullif(x->>'sub',''),
         gvc_hw_kind(x->>'section', x->>'grp', x->>'description'),
         nullif(x->>'vendor',''), nullif(x->>'vendor_raw',''), nullif(x->>'part_no',''), nullif(x->>'description',''), nullif(x->>'size',''), nullif(x->>'spec',''), nullif(x->>'category',''),
         (x->>'qty')::numeric, nullif(x->>'unit',''), (x->>'pack_qty')::numeric, (x->>'unit_cost')::numeric, (x->>'per_truck')::numeric, (x->>'sort')::int, true, p_run, now()
  from jsonb_array_elements(p_rows) x
  on conflict (key) do update set grp=excluded.grp, section=excluded.section, sub=excluded.sub, kind=excluded.kind, vendor=excluded.vendor, vendor_raw=excluded.vendor_raw,
    part_no=excluded.part_no, description=excluded.description, size=excluded.size, spec=excluded.spec, category=excluded.category, qty=excluded.qty, unit=excluded.unit,
    pack_qty=excluded.pack_qty, unit_cost=excluded.unit_cost, per_truck=excluded.per_truck, sort=excluded.sort, in_sheet=true, seen_run=excluded.seen_run, updated_at=now();
  get diagnostics n = row_count;
  if p_last then
    update gvc_hardware set in_sheet=false where seen_run is distinct from p_run and in_sheet; get diagnostics gone = row_count;
    select count(*) into tot from gvc_hardware where in_sheet;
    insert into gvc_meta(key,value) values ('hardware_sync', jsonb_build_object('at',now(),'source','New_Shop_Master_Inventory.xlsx (Complete Inventory)','items',tot,'removed',gone))
      on conflict (key) do update set value=excluded.value;
  end if;
  return jsonb_build_object('upserted',n,'no_longer_in_sheet',gone);
end $$;

-- follow-up migration gvc_widget_key_members: sign-in calls gvc_widget_key for everyone - members pass, only Kyle gets the key
create or replace function public.gvc_widget_key() returns text language plpgsql stable security definer set search_path=public as $$
begin
  if not public.gvc_is_member() then raise exception 'not allowed'; end if;
  if coalesce(public.gvc_role(),'') <> 'admin' then return null; end if;
  return (select v from public.gvc_settings where k = 'widget_key');
end $$;

-- migration gvc_hardware_buckets (Nov 6): daily hardware sync sends only changed buckets (scripts/hw_sync.py computes the same fingerprints)
-- gvc_hw_bucket(key) = first byte of md5(key) % 32; gvc_hardware_buckets() = {bucket: md5(concat of row h ordered by key collate "C")}
-- gvc_hardware_sync2(p_rows [[key,grp,section,sub,vendor,vendor_raw,part_no,description,size,spec,category,qty,unit,pack_qty,unit_cost,per_truck,sort,h]], p_run, p_buckets, p_last)
-- (full SQL as applied is in the Supabase migration history)
