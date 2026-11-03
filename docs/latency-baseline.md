# Latency measurement and baseline

BastionOS records real-user latency for the key screens and for the API routes behind them, then
compares the result with a committed baseline. The dashboard lives at **Performance** (`/performance`).

## What is measured

| Signal | Where it comes from | Metric names |
| --- | --- | --- |
| Core Web Vitals | Browser, via `web-vitals` | `lcp`, `inp`, `cls`, `ttfb`, `fcp` |
| Initial page load | Navigation Timing | `screen-load` |
| In-app route change | Time from pathname change to the next painted frame | `route-transition` |
| API response | Server wrapper around the route handler | `api` |

Screens tracked: overview, guards, sites, attendance, patrols, incidents, alerts, clients, finance,
reports, performance, settings, profile and the guard app. Any other path is grouped as `other`.

Instrumented endpoints: `/api/dashboard`, `/api/operations`, `/api/patrols`, `/api/guard/scan`,
`/api/guard/me`, `/api/guard/access` and `/api/telemetry`.

## How the data flows

1. `components/latency-reporter.tsx` (mounted in the root layout) batches samples and posts them to
   `POST /api/telemetry`. It uses `sendBeacon` when the page is being hidden and `fetch` with
   `keepalive` otherwise.
2. `app/api/telemetry/route.ts` validates each sample with Zod, caps the batch at 30, attaches the
   signed-in organization when there is one, and writes to `telemetry_samples`.
3. Server timings come from `lib/timing.ts`, which wraps the instrumented handlers and records the
   duration in `finally`, after the response exists.
4. `GET /api/telemetry?window=1h|24h|7d|30d` aggregates samples for the active organization and
   returns p50/p95/p99 per screen/metric and per endpoint.

Writes are best-effort: a missing database or a failed insert never breaks the request being
measured. Samples older than 30 days are pruned opportunistically (about 1% of ingests).

## Recording the baseline

`latency-baseline.json` holds the endpoint numbers the dashboard compares against. It ships with
`generatedAt: null`, which makes every budget **provisional**.

```bash
npm run dev                                    # in one terminal
npm run perf:baseline                          # 20 samples per endpoint, localhost:3000
```

Protected routes need a session cookie or they answer 401 in about a millisecond:

```bash
BASE_URL=http://localhost:3000 \
COOKIE="better-auth.session_token=..." \
ITERATIONS=30 \
npm run perf:baseline
```

The script warms up, measures, writes `latency-baseline.json`, and prints a table. Commit the file
so the next person sees the measured numbers and any regression shows up as a diff.

Screen budgets cannot be measured from a script: they need real browsers. They live as targets in
`lib/telemetry-baseline.ts` and are adjusted by hand once enough samples exist.

## Reading the dashboard

Each row shows sample count, p50, p95, p99, the budget p95 and a status. **Over budget** means the
p95 in the selected window is above the budget. Rows are sorted worst-first.

A window with very few samples is noise. Treat anything under roughly 20 samples as indicative only.

## Adding a screen or endpoint

- Screen: add the route prefix to `routeToScreen` in `lib/telemetry-shared.ts`, add it to
  `TRACKED_SCREENS`, and give it a budget in `lib/telemetry-baseline.ts`.
- Endpoint: wrap the handler with `timed('/api/your-route', handler)` and add a budget under
  `targetEndpoints`.

## Privacy

Samples carry no cookies, user ids, IP addresses or free text. Only the organization id (when a
session exists), the screen or route name, the metric, the value, a coarse device class (mobile,
tablet, desktop) and the navigation type are stored. Do Not Track disables reporting, and
`NEXT_PUBLIC_TELEMETRY_DISABLED=true` turns the browser reporter off entirely;
`TELEMETRY_DISABLED=true` makes the ingest endpoint answer `204` and store nothing.
