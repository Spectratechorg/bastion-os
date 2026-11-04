-- Row-level security for tenant-owned business tables.
--
-- Every request that touches these tables runs inside a transaction that sets
--   set_config('app.organization_id', <active org>, true)
-- and each policy compares organization_id against that setting. FORCE makes the policies apply to
-- the table owner too; superusers (local development) still bypass RLS by design.
--
-- Deliberately not covered, with reasons in docs/rls.md:
--   * Better Auth tables (user, session, account, verification, organization, member, invitation):
--     the auth library reads them before a tenant context exists.
--   * role_permissions / org_settings: read while resolving permissions, before a tenant tx.
--   * telemetry_samples: written by the queue worker for many organizations per batch.

create or replace function app_current_organization_id() returns text
language sql stable as $$
  select nullif(current_setting('app.organization_id', true), '')
$$;

do $$
declare
  t text;
  tables text[] := array[
    'guards', 'sites', 'attendance', 'incidents', 'alerts', 'patrols',
    'patrol_checkpoints', 'payroll_records', 'finances', 'clients',
    'activity_events', 'staff', 'contracts', 'inventory_items'
  ];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I for all
         using (organization_id = app_current_organization_id())
         with check (organization_id = app_current_organization_id())',
      t
    );
  end loop;
end
$$;
