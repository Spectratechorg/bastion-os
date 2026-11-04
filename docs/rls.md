# Row-level security

Tenant isolation is enforced by Postgres, not by remembering `organization_id = ...` in every
query. The application still sets the organization once per request; the database does the rest.

## How it works

```
request ─► actor() ─► withTenant(org) ─► BEGIN; set_config('app.organization_id', org, true)
                                        │
                                        ├─ every query on a protected table
                                        │   is filtered by the tenant_isolation policy
                                        └─ COMMIT
```

- `lib/db/index.ts` wraps `db` in an `AsyncLocalStorage` proxy. Inside `withTenant()` it resolves to
  a Drizzle instance bound to that request's transaction; outside it falls back to the pool, where
  the policies return nothing (a safe failure).
- `lib/tenant.ts` exports `tenantScoped(handler)`, which resolves the actor, opens the tenant
  transaction, caches the actor for the handler (so `actor()` is not queried twice) and runs it.
- `currentClient()` hands the same connection to raw SQL, so `pool.query` cannot accidentally run
  outside the tenant context.
- Migration `0012_rls_policies.sql` enables `ENABLE` **and** `FORCE ROW LEVEL SECURITY` on every
  protected table and installs one `tenant_isolation` policy (`USING` + `WITH CHECK`).

## Protected tables

`guards`, `sites`, `attendance`, `incidents`, `alerts`, `patrols`, `patrol_checkpoints`,
`payroll_records`, `finances`, `clients`, `activity_events`, `staff`, `contracts`,
`inventory_items`.

Deliberately **not** protected:

| Table | Why |
| --- | --- |
| `user`, `session`, `account`, `verification`, `organization`, `member`, `invitation` | Better Auth reads them before a tenant context exists (sign-in, active organization, membership). They are protected by the auth library's own checks. |
| `role_permissions`, `org_settings` | Read while resolving permissions, before the tenant transaction. Keyed by organization and only read through `organizationId` from the session. |
| `telemetry_samples` | Written by the queue worker for many organizations per batch (and anonymous rows for guard phones). The dashboard applies the organization filter explicitly. |

## What was removed

`organization_id = ...` predicates were removed from reads, updates and deletes across the
dashboard, operations, patrols, payroll, reports, export, clients, guards, workspace, team, the
finance CRUD helpers and the guard app. The policies enforce the same rule.

Kept on purpose:

- **Inserts still set `organization_id`.** The `WITH CHECK` clause requires it; it is not a
  duplicate filter.
- **Lookups of `organizations` by id** for shift settings, and joins inside a tenant scope.
- **Auth/config tables** above.

## Safety guard

Because the manual filters are gone, an application connection that bypasses RLS would expose
every tenant. `withTenant()` therefore checks `pg_roles` once per process and refuses to run when
the role is `superuser` or has `BYPASSRLS`:

```
The database role bypasses row-level security (superuser or BYPASSRLS). Use a normal role for
DATABASE_URL, or set RLS_ALLOW_BYPASS=true for a single-tenant local database.
```

`RLS_ALLOW_BYPASS=true` exists only for local, single-tenant development. Never set it in
production.

## Deploying

1. Run `npm run db:migrate` (migration 0012).
2. Point `DATABASE_URL` at a role that is **not** a superuser and does not have `BYPASSRLS`, with
   `SELECT, INSERT, UPDATE, DELETE` on the tables and `EXECUTE` on
   `app_current_organization_id()`.
   - Neon: the project owner role is not a superuser; `FORCE` makes the policies apply to it.
     Do not use a role granted `neondb_owner` with `BYPASSRLS`.
3. Migrations (`DATABASE_URL_UNPOOLED`) can stay on the owner role; they do not go through RLS.
4. The seed script and the telemetry worker use `DATABASE_URL`; the worker only writes
   `telemetry_samples` (not protected), so one role is enough.

## Verification

```bash
DATABASE_URL=<admin url> npm run db:rls-check
```

The script creates a throwaway non-superuser role, seeds two organizations, and asserts:

| Check | Result |
| --- | --- |
| No tenant context returns no rows | pass (0) |
| Tenant A sees only its own rows | pass (2 of 3) |
| Tenant A cannot see tenant B rows | pass (0) |
| `INSERT` for another organization | rejected by `WITH CHECK` |
| `UPDATE` / `DELETE` for another organization | 0 rows |
| Tenant B sees only its own row | pass |
| `INSERT` for the active organization | accepted |

Application smoke test, production build, `DATABASE_URL` = restricted role:

| Check | Result |
| --- | --- |
| Sign-in and 21 business endpoints (dashboard, operations × 9, patrols, payroll, clients, team, workspace, settings, me, reports, staff, contracts, inventory, export) | all `200` |
| Create / rename / delete an inventory item | `201`, `200`, `200` |
| Create / delete a site (also writes the activity log) | `201`, `200` |
| Guard app scan with only the shared code (no session) | `200`, attendance row written |
| Same endpoints as superuser vs restricted role | identical sets (only ordering/clock differences) |
| Superuser connection | refused with the message above |

A nested `db.transaction()` was removed from the delete paths: inside `withTenant()` it issued
`BEGIN`/`COMMIT` on the same connection, committing the tenant transaction and clearing
`app.organization_id`, which surfaced as an RLS violation on the follow-up activity insert.

## Limits worth knowing

- One transaction (and one pooled connection) per tenant-scoped request. Handlers hold it from
  auth to response; keep heavy work outside the request or raise `pool.max` if needed. The pool is
  intentionally small for the Neon pooled endpoint.
- Read-only endpoints also open a transaction; that is the price of a single enforcement point.
- Long-running transactions hold vacuum back on Postgres. Nothing in this app streams inside one.
- Raw SQL that bypasses `db`/`currentClient()` will not see the tenant context and will fail
  closed (no rows) rather than leak.
- The telemetry ingest path does not use `withTenant` (it is anonymous by design); its table is
  excluded from RLS and protected by explicit organization filters where it matters.
