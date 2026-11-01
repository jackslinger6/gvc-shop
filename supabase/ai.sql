-- GVC Shop: AI suggestions inbox + audio storage
create table if not exists public.gvc_suggestions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null,              -- 'sms' | 'recording' | 'manual'
  source_ref text unique,            -- e.g. 'sms:12345' so a text is only processed once
  from_name text,
  source_at timestamptz,
  source_text text,
  job_id text,
  summary text,
  changes jsonb not null default '{}'::jsonb,
  status text not null default 'new' -- 'new' | 'accepted' | 'dismissed' | 'none'
);
alter table public.gvc_suggestions enable row level security;
drop policy if exists gvc_sugg_members on public.gvc_suggestions;
create policy gvc_sugg_members on public.gvc_suggestions for all to authenticated
  using (public.gvc_is_member()) with check (public.gvc_is_member());
do $$ begin
  begin alter publication supabase_realtime add table public.gvc_suggestions; exception when duplicate_object then null; end;
end $$;

insert into storage.buckets (id, name, public) values ('gvc-audio', 'gvc-audio', false)
on conflict (id) do nothing;
drop policy if exists gvc_audio_members on storage.objects;
create policy gvc_audio_members on storage.objects for all to authenticated
  using (bucket_id = 'gvc-audio' and public.gvc_is_member())
  with check (bucket_id = 'gvc-audio' and public.gvc_is_member());

select 'ok' as result, (select count(*) from public.gvc_suggestions) as suggestions;
