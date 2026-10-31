-- GVC shop app (tables prefixed gvc_, separate from time-invoice)
create table if not exists public.gvc_members (email text primary key);
-- add shop members: insert into public.gvc_members(email) values ('you@example.com');
alter table public.gvc_members enable row level security;

create or replace function public.gvc_is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.gvc_members m where lower(m.email) = lower(coalesce(auth.jwt()->>'email','')));
$$;
grant execute on function public.gvc_is_member() to authenticated;

create table if not exists public.gvc_jobs (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.gvc_jobs enable row level security;
drop policy if exists gvc_jobs_members on public.gvc_jobs;
create policy gvc_jobs_members on public.gvc_jobs for all to authenticated
  using (public.gvc_is_member()) with check (public.gvc_is_member());

create or replace function public.gvc_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists gvc_jobs_touch on public.gvc_jobs;
create trigger gvc_jobs_touch before update on public.gvc_jobs for each row execute function public.gvc_touch();

do $$ begin
  begin alter publication supabase_realtime add table public.gvc_jobs; exception when duplicate_object then null; end;
end $$;

-- (jobs were copied over from the GVC Order Board prototype)

select id, data->>'name' as name, data->>'stage' as stage from public.gvc_jobs order by id;
