# BastionOS backend setup

BastionOS uses Neon PostgreSQL, Drizzle Kit for schema migrations, and Better Auth for accounts and organization membership. Operational records, client accounts, finance entries, generated reports, and workspace membership/activity views are scoped to the signed-in user's active organization.

## Configure Neon locally

1. Create a Neon project and copy its PostgreSQL connection string from **Project → Connect**. Keep it private.
2. In PowerShell at the repository root, create the ignored local environment file:

   ```powershell
   Copy-Item .env.example .env.local
   notepad .env.local
   ```

3. In `.env.local`, replace `DATABASE_URL` with the Neon connection string. Set `BETTER_AUTH_URL` to the exact origin you open in the browser — `http://localhost:3000` for desktop, or your HTTPS LAN origin such as `https://192.168.1.156:3000` when testing NFC on a phone. If you need both, keep one in `BETTER_AUTH_URL` and list the other in `BETTER_AUTH_TRUSTED_ORIGINS` (comma separated). Sign-in succeeds only for origins listed there, otherwise every page reports `Unauthorized`. Generate a private auth secret locally:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

   Put the generated value in `BETTER_AUTH_SECRET`. Do not paste it into chat or commit `.env.local`.

4. Apply the database schema:

   ```powershell
   pnpm db:migrate
   ```

   Drizzle loads `.env.local` and uses Neon’s direct `DATABASE_URL_UNPOOLED` for migrations. The app continues to use the pooled `DATABASE_URL`.

5. Restart the HTTPS dev server after saving `.env.local`. If it is already running, stop it with Ctrl+C, then run:

   ```powershell
   $https = Join-Path $env:LOCALAPPDATA 'BastionOS\https'
   pnpm dev --hostname 0.0.0.0 --experimental-https `
     --experimental-https-cert (Join-Path $https 'bastion-local.pem') `
     --experimental-https-key (Join-Path $https 'bastion-local-key.pem')
   ```

6. Open `/sign-up`. Registration creates a private organization and makes it active for the new account.

## Register and scan a guard

1. Sign in on the operations site, open **Sites**, and create a site with its latitude, longitude, and geofence radius.
2. Open **Guards**, add the guard, and assign the site. The generated `nfcToken` is shown in the guard table.
3. Write that exact token as an NDEF **Text** record on a compatible NFC tag.
4. On the Android phone, sign in to the same account, open `/guard-app`, allow location access, and scan the tag. Attendance scans check in or check out; patrol scans create a patrol record. The API verifies organization membership, the registered token, and the site geofence.

The app does not send invitation emails yet. For initial testing, use the same account on the computer and phone. A separate account will create its own organization until an invitation is issued and accepted.

## Schema changes

After changing `lib/db/schema.ts`, generate a migration and review it before applying:

```powershell
pnpm db:generate
pnpm db:migrate
```
