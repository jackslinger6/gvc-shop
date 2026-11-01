-- Widget feed v2: one call returns everything the home-screen widget shows.
-- Same read-only key as gvc_widget_feed (gvc_settings.widget_key); nothing is writable through it.
--   { jobs:[{id,...job data}], todos:[{id,text,job_id,source,from_name,created_at}], hidden:[text,...],
--     plan:{sched,off,extra,hours,start}, review:n, at:iso }
create or replace function public.gvc_widget_feed2(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public.gvc_settings s where s.k = 'widget_key' and s.v = p_key) then
    jsonb_build_object(
      'jobs', coalesce((select jsonb_agg(jsonb_build_object('id', j.id) || j.data) from public.gvc_jobs j
                        where coalesce((j.data->>'archived')::boolean,false) = false), '[]'::jsonb),
      'todos', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'text', t.text, 'job_id', t.job_id, 'source', t.source,
                        'from_name', t.from_name, 'created_at', t.created_at) order by t.created_at)
                        from public.gvc_todos t where t.done_at is null and coalesce(t.source,'') <> 'auto'), '[]'::jsonb),
      'hidden', coalesce((select jsonb_agg(t.text) from public.gvc_todos t where t.source = 'auto'), '[]'::jsonb),
      'plan', coalesce((select p.data - 'time' - 'tiMap' from public.gvc_plan p where p.id = 'main'), '{}'::jsonb),
      'review', (select count(*) from public.gvc_suggestions g where g.status = 'new'),
      'at', to_jsonb(now()))
  else null end;
$$;
revoke all on function public.gvc_widget_feed2(text) from public;
grant execute on function public.gvc_widget_feed2(text) to anon, authenticated;
