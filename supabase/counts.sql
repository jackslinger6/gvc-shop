-- Count sheets for orders (2026-11-02): one row per order (job + supplier line). Applied as migration gvc_counts.
create table if not exists public.gvc_counts (
  id uuid primary key default gen_random_uuid(),
  job_id text not null,
  sup_id text not null,
  items jsonb not null default '[]'::jsonb,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, sup_id)
);
alter table public.gvc_counts enable row level security;
create policy gvc_counts_members on public.gvc_counts for all using (public.gvc_is_member()) with check (public.gvc_is_member());
grant select, insert, update, delete on public.gvc_counts to authenticated;
revoke all on public.gvc_counts from anon;
