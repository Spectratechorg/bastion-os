# BastionOS

Operational command centre for guards, sites, attendance, patrols, and incidents.

## Setup

1. Copy `.env.example` to `.env.local` and provide `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL`.
2. Run `pnpm install`.
3. Generate migrations with `pnpm db:generate` and review them.
4. Run `pnpm db:migrate` only against the intended database.
5. Start the app with `pnpm dev`.

## Checks

- `pnpm lint` runs TypeScript validation.
- `pnpm build` makes a production build.

Database migrations are never run automatically. Confirm the target database before using `pnpm db:migrate`.
