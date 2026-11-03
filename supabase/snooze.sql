-- Snooze ("Later") for the To do tab (2026-11-02).
--   Own to-dos: gvc_todos.snooze_until set on the row; hidden until then.
--   Board reminders: a row with source='snooze', text = the reminder text, done_at set (so it never counts as an open to-do), snooze_until.
--   snooze_until far in the future (2099) = "Someday".
alter table public.gvc_todos add column if not exists snooze_until timestamptz;

create or replace function public.gvc_widget_feed2(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public.gvc_settings s where s.k = 'widget_key' and s.v = p_key) then
    jsonb_build_object(
      'jobs', coalesce((select jsonb_agg(jsonb_build_object('id', j.id) || j.data) from public.gvc_jobs j
                        where coalesce((j.data->>'archived')::boolean,false) = false), '[]'::jsonb),
      'todos', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'text', t.text, 'job_id', t.job_id, 'source', t.source,
                        'from_name', t.from_name, 'created_at', t.created_at) order by t.created_at)
                        from public.gvc_todos t where t.done_at is null and coalesce(t.source,'') not in ('auto','snooze')
                          and (t.snooze_until is null or t.snooze_until <= now())), '[]'::jsonb),
      'hidden', coalesce((select jsonb_agg(t.text) from public.gvc_todos t
                          where t.source = 'auto' or (t.source = 'snooze' and t.snooze_until > now())), '[]'::jsonb),
      'plan', coalesce((select p.data - 'time' - 'tiMap' from public.gvc_plan p where p.id = 'main'), '{}'::jsonb),
      'review', (select count(*) from public.gvc_suggestions g where g.status = 'new'),
      'at', to_jsonb(now()))
  else null end;
$$;
revoke all on function public.gvc_widget_feed2(text) from public;
grant execute on function public.gvc_widget_feed2(text) to anon, authenticated;
