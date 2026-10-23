# Merged BastionOS (Gold's backend + Eddie's features)

Base: GoldOkereke's `origin/main` (Drizzle + text ids, Better Auth, guard app code, configurable shift, clients, invoices/expenses/profit statement).
Added on top: roles and permission switches, guard-only access, team add/edit/remove, per-guard metrics, delete guard/site, site reactivate,
calculated site risk, alert rules + de-duplication, incident assign, live map, Reports date range, contracts with due dates, stock inventory,
office staff payroll, guard login linking, SOS, Napoleon logo, grey and white theme. Pension is removed everywhere (stored as 0).

## Database
Only Drizzle migrations are used now (`drizzle/0000` to `drizzle/0009`). `0009` is additive: new tables `role_permissions`, `org_settings`, `staff`,
`contracts`, `inventory_items`; new columns `guards.login_user_id`, `alerts.dedupe_key`, `payroll_records.kind`, `sites.client_id`.

    pnpm db:migrate      # applies every migration that has not run yet

The old hand-written SQL migrations and `pnpm db:apply` are gone. This schema uses text ids for Better Auth tables, so point it at a NEW empty
Neon database (or Neon branch), never at a database created by the older uuid schema.
