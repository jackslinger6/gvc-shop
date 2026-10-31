-- Read-only feed for the home-screen widget
create table if not exists public.gvc_settings (k text primary key, v text not null);
alter table public.gvc_settings enable row level security;
insert into public.gvc_settings(k, v) values ('widget_key', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
  on conflict (k) do nothing;

create or replace function public.gvc_widget_key() returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.gvc_is_member() then raise exception 'not allowed'; end if;
  return (select v from public.gvc_settings where k = 'widget_key');
end $$;

create or replace function public.gvc_widget_feed(p_key text) returns setof jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', j.id) || j.data
  from public.gvc_jobs j
  where exists (select 1 from public.gvc_settings s where s.k = 'widget_key' and s.v = p_key);
$$;

revoke all on function public.gvc_widget_key() from public, anon;
revoke all on function public.gvc_widget_feed(text) from public;
grant execute on function public.gvc_widget_key() to authenticated;
grant execute on function public.gvc_widget_feed(text) to anon, authenticated;

select count(*) as jobs_in_feed from public.gvc_widget_feed((select v from public.gvc_settings where k = 'widget_key'));
