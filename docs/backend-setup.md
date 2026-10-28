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

## Test NFC on an Android phone

Reading and writing NFC tags uses Web NFC, which only exists in **Chrome on Android** and only in a **secure context**. A plain `http://<ip>:<port>` address is not secure, so `NDEFReader` is unavailable and the app falls back to typing the tag code. HTTPS is required.

### 1. Find the laptop's current address

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' }
```

The address changes whenever you switch Wi-Fi or tether to a different phone, so check it every time.

### 2. Trust that origin

Auth rejects unknown origins with `Invalid origin`, which shows up as every page reporting *Unauthorized*. Add the phone's origin to `.env.local`:

```
BETTER_AUTH_TRUSTED_ORIGINS=https://192.168.1.156:3000,https://172.20.10.6:3000
```

Keep the entries comma separated and always include the port.

### 3. Start an HTTPS server bound to the network

```powershell
$https = Join-Path $env:LOCALAPPDATA 'BastionOS\https'
pnpm dev --hostname 0.0.0.0 --port 3000 --experimental-https `
  --experimental-https-cert (Join-Path $https 'bastion-local.pem') `
  --experimental-https-key (Join-Path $https 'bastion-local-key.pem')
```

### 4. Open it on the phone

Browse to `https://<laptop-ip>:3000` in Chrome on the Android phone. The bundled certificate was issued for a specific address, so Chrome warns about the hostname mismatch; choose **Advanced → Proceed**. The page is still served over HTTPS, so Web NFC works.

Allow **location** and **NFC** when prompted. Without location permission a scan cannot be recorded, because attendance stores the guard's coordinates and compares them with the site geofence.

### 5. Where tags are written

Register a guard at `/guards/new`; the success panel shows the tag code and a **Write tag** button. Hold a blank tag to the back of the phone, then use **Verify tag** to read it back and confirm the stored code matches. **Replace tag** on the Guards page offers the same buttons for a reissued card.

Web NFC cannot read a tag's hardware serial number — no browser can. The guard's tag code is written *onto* the card as an NDEF text record, which is what scans match against.
