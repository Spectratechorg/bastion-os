# Putting BastionOS online

Total time: about 30 minutes. You need a GitHub account, a Neon account and a Vercel account (all have free tiers).

## 1. Database (Neon)
1. neon.tech → New project → name it `bastionos`, pick the region closest to Lagos (Europe/Frankfurt is usually fastest from Nigeria).
2. On the project dashboard click **Connect**, tick **Pooled connection**, copy the string that starts with `postgresql://`. This is your `DATABASE_URL`.
3. Create a second **branch** called `staging` for testing, so real data is never touched while you experiment.

## 2. Run it on your computer first
1. In the folder with `package.json`, copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL` – from Neon
   - `BETTER_AUTH_SECRET` – run `openssl rand -base64 32` (or any random 32+ characters)
   - `BETTER_AUTH_URL` – `http://localhost:3000`
   - `NAPOLEON_API_URL`, `NAPOLEON_API_KEY` – your Napoleon service and READ key
2. `pnpm install`
3. `pnpm db:apply` – creates every BastionOS table (safe to re-run)
4. `pnpm auth:migrate` – creates the login tables (run once per database)
5. `pnpm test` – checks the payroll and patrol rules
6. `pnpm dev` → http://localhost:3000 → **Create account**

## 3. Deploy (Vercel)
1. Push the folder to a **private** GitHub repo (`.env.local` is git-ignored – never commit it).
2. vercel.com → Add New → Project → import the repo. Framework: Next.js (auto).
3. Settings → Environment Variables, add the same five variables. For production use the **main** Neon branch string and set `BETTER_AUTH_URL` to your live address (e.g. `https://app.yourdomain.com`).
4. Deploy. Then, once, from your computer, point `.env.local` at the production database and run `pnpm db:apply` and `pnpm auth:migrate`.
5. Check `https://your-site/api/health` shows `{"ok":true}`.
6. Settings → Domains → add your domain and follow the DNS instructions. Update `BETTER_AUTH_URL` to the final domain and redeploy.

## 4. First-time setup in the app
1. Open the site → **Create an account** → enter your company name. You become the owner.
2. Sites → add each site (use "Use my current location" while standing at the gate; set the geofence radius).
3. Guards → Register guard (photo, NIN, salary, site). Note the NFC tag code shown.
4. Write the tag code onto each guard's NFC card as a **plain text** record (free app "NFC Tools" on Android → Write → Add a record → Text).
5. Patrol checkpoints use the same cards. Guards open `/guard-app` on an Android phone in Chrome (HTTPS is required for NFC) and choose Add to Home screen.

## 5. Before real customers use it (commercial checklist)

**Already done in this version**
- Login with rate limiting; every API call is scoped to the user's own company
- Owner/admin/moderator-only: payroll approval, suspend/reactivate, salary changes, site deactivation
- Security headers, health check for uptime monitoring, error and 404 pages, installable guard app
- Payroll and patrol rules covered by automated tests; all migrations are re-runnable
- Activity log of important actions

**You still need to do (needs accounts or decisions only you can make)**
| Item | Why | How |
| --- | --- | --- |
| Backups | A guard company's payroll data is business-critical | Neon: Settings → Storage → enable point-in-time restore (paid plan); export a CSV of payroll monthly from Reports |
| Email: verification, password reset, staff invites | Needed before you give accounts to clients | Create a Resend account, then add Better Auth's `sendResetPassword` / `sendVerificationEmail` and organization `sendInvitationEmail` hooks in `lib/auth.ts` |
| Paid plans / billing | To charge clients | Paystack subscriptions, one plan per guard-count tier; gate features by plan in the API |
| Photo storage | Photos are currently stored inside the database (fine for a few hundred guards) | Move to Vercel Blob or Cloudflare R2 and save the URL in `guards.photo_url` |
| Map tiles | The free OpenStreetMap server forbids heavy commercial use | Create a MapTiler or Stadia key and set `NEXT_PUBLIC_MAP_TILES_URL` in Vercel |
| Monitoring | Know when it breaks | UptimeRobot on `/api/health`; add Sentry for error alerts |
| Legal | Guard NINs and photos are personal data (NDPA 2023) | Privacy policy, terms of service, a data-processing agreement for client companies, register with the NDPC if you pass the threshold |
| SMS / push for SOS and missed patrols | Supervisors must hear about emergencies immediately | Termii or Africa's Talking SMS from the scan route when an SOS alert is created |
| Offline guard app | Phones lose signal at some sites | Queue scans locally and send when back online (service worker) |
| Security review | Before enterprise customers | Penetration test; two-factor sign-in for owners (Better Auth `twoFactor` plugin) |

## Troubleshooting
- **"Sign in and select an organization"** – sign out and back in once.
- **NFC does nothing** – Android + Chrome + HTTPS only; iPhones cannot read NFC in a web page. Use the tag-code box instead.
- **Map blank** – no internet to the tile server; check `NEXT_PUBLIC_MAP_TILES_URL`.
- **Existing database from the old MVP** – use a new Neon branch; old organization ids are not UUIDs.
