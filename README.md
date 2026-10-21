# BastionOS

Security operations for guard companies: guards, sites, attendance, patrols, incidents, alerts, clients, payroll and reports. Grey and white theme, mobile-first, every page connected to Postgres through the API routes.

## Run it (full online guide: DEPLOYMENT.md)

1. Copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL` – your Neon connection string (use a Neon *branch* if the database already has data)
   - `BETTER_AUTH_SECRET` – any random 32+ character string
   - `BETTER_AUTH_URL` – `http://localhost:3000` locally, your Vercel URL in production
   - `NAPOLEON_API_URL`, `NAPOLEON_API_KEY` – for Ask Napoleon
2. `pnpm install`
3. `pnpm db:apply` – creates/updates all BastionOS tables. Safe to run again.
4. `pnpm auth:migrate` – creates the login tables (user, session, organization, member). Run once.
5. `pnpm dev`, open http://localhost:3000, **Create an account**. You enter your company name and become its owner.
6. Optional demo data: `SEED_USER_ID=<your user id> pnpm db:seed`

## How the rules work

- **Patrols**: one patrol per guard per day. Window 09:00–12:59 (Lagos time). Scans sign the 10:00, 11:00 and 12:00 checkpoints; all three signed = completed. Unfinished patrols show as missed after 13:00.
- **Payroll** (`/finance/payroll`): net pay = base salary − (base ÷ days in month × days absent) − 8% pension. Days absent = days since the guard's start date with no attendance record. No overtime. Rows are Pending until an owner/admin/moderator ticks them as Paid; paid rows are frozen.
- **Attendance**: NFC scan records the check-in and compares the phone's location to the site geofence. Outside = flagged plus an alert.
- **Guard photo**: captured on the Register guard page and stored with the guard.
- **SOS**: the guard app scans the tag and raises a critical alert.

## Checks

`pnpm lint` (types) · `pnpm build`
