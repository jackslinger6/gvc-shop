-- Locks down the time-invoice tables (jobs, time_entries, settings, invoices, fixed_items, fixed_item_templates).
-- They currently have RLS OFF with full anon grants, so anyone holding the publishable key (it's in this public repo,
-- the APK and the web page) can read your invoices/settings and edit or delete your time entries.
--
-- DO NOT RUN THIS until the time invoice app (kyle-invoice.vercel.app) signs in with Supabase Auth
-- (same email/password login as the shop app, same account kyle.gvc@hotmail.com).
-- Today it calls these tables with no signed-in user, so running this first would make it go blank.
-- The GVC Shop app's "Send to time invoice app" keeps working: it is already signed in as a member.

do $$ declare t text; begin
  foreach t in array array['jobs','time_entries','settings','invoices','fixed_items','fixed_item_templates'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists ti_members on public.%I', t);
    execute format('create policy ti_members on public.%I for all to authenticated using (public.gvc_is_member()) with check (public.gvc_is_member())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- check: should list the 6 tables with rls on and one policy each
select c.relname, c.relrowsecurity, (select count(*) from pg_policies p where p.tablename=c.relname) as policies
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('jobs','time_entries','settings','invoices','fixed_items','fixed_item_templates');
