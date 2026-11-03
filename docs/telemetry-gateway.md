# Telemetry gateway (FastAPI)

A standalone ingest edge for check-in telemetry and latency pings. It writes to the **same Redis
Stream** as the Next.js route, so both edges feed one worker and one schema:

```
web app  ──► POST /api/telemetry        ─┐
guard/other clients ──► POST /v1/check-ins ─┼─► bastion:telemetry:samples ─► worker ─► Postgres
                        POST /v1/pings     ─┘
```

Source: `services/telemetry-gateway/` (FastAPI + uvicorn, Python 3.12+).

## Run it

```bash
cd services/telemetry-gateway
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
REDIS_URL=redis://localhost:6379 .venv/bin/uvicorn app.main:app --port 8090
```

Or with Docker:

```bash
docker build -t bastion-telemetry-gateway services/telemetry-gateway
docker run --rm -p 8090:8090 -e REDIS_URL=redis://host.docker.internal:6379 bastion-telemetry-gateway
```

The worker is unchanged: `npm run telemetry:worker`.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/v1/check-ins` | Batch of check-in telemetry (page loads, route changes, guard-app scans) |
| `POST` | `/v1/pings` | One lightweight latency ping |
| `GET` | `/healthz` | Process is up (does not touch Redis) |
| `GET` | `/readyz` | Redis reachable + stream/backlog snapshot; `503` when not |
| `GET` | `/v1/queue` | Stream length, `lag`, `pending`, `consumers` |

```bash
curl -s localhost:8090/v1/check-ins -H 'content-type: application/json' -d '{
  "samples": [
    {"kind": "web-vital", "metric": "lcp", "value": 1800, "screen": "overview", "rating": "good"},
    {"kind": "api", "metric": "api", "value": 42, "route": "/api/dashboard"}
  ]
}'
# 202 {"accepted": 2, "rejected": 0, "mode": "redis"}

curl -s localhost:8090/v1/pings -H 'content-type: application/json' \
  -d '{"value": 120, "screen": "guard-app"}'
```

## Payload contract

Identical to `lib/telemetry-shared.ts`, so the Node worker decodes it without changes:

`kind` (`web-vital` | `route-transition` | `screen-load` | `api`), `metric` (≤40 chars), `value`
(0–600 000), optional `screen`, `route`, `rating`, `device`, `navigationType`.

The gateway normalises the same way the Next route does: unknown screens become `other`, and an
`api` route without a leading `/` becomes `/unknown`. `organizationId` is accepted only from a
token-authenticated caller; otherwise it is forced to `null`.

`x-telemetry-replay: <run id>` tags the rows as a dark-launch replay (same header as the replay
tool). Replayed rows are excluded from the dashboard.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `REDIS_URL` | `redis://localhost:6379` | Redis used by the shared stream |
| `TELEMETRY_STREAM` | `bastion:telemetry:samples` | Stream key |
| `TELEMETRY_STREAM_MAXLEN` | `200000` | Approximate stream cap |
| `TELEMETRY_MAX_BATCH` | `30` | Max samples per `/v1/check-ins` request |
| `TELEMETRY_GATEWAY_TOKEN` | empty | When set, writes require `Authorization: Bearer …` |
| `TELEMETRY_GATEWAY_ORIGINS` | empty | Comma-separated browser origins for CORS |

## Failure behaviour

| Situation | Response |
| --- | --- |
| Redis unreachable | `503` + `Retry-After: 1`; nothing acknowledged |
| Invalid payload | `400` `{"error": "That telemetry payload is not valid."}` (not FastAPI's 422) |
| Batch over the limit | `400` with the configured maximum |
| Body over 256 KiB | `413` |
| Missing/wrong token (when configured) | `401` |

Like the Next route, nothing is acknowledged before Redis accepts the entry, so the caller can
retry and no sample is silently dropped.

## Verified

Against local Redis 8.10 + Postgres 18 + the Node worker:

| Check | Result |
| --- | --- |
| `/v1/check-ins`, 3 samples | `202`; 3 rows written with the right screen/route normalisation (`brand-new-screen` → `other`) |
| `/v1/pings` | `202`; stored as `web-vital` / `ttfb` |
| `x-telemetry-replay: dark-gw1` | row stored with `replay_run = dark-gw1` |
| Token mode (port 8091) | no/wrong token `401`; correct token + `organizationId` stored with the organization set |
| Invalid kind / 31-sample batch | `400` each, nothing enqueued |
| Redis stopped | `503` + `Retry-After` and `readyz` `503`; after restart a ping was accepted and stored |
| Worker log after Redis restart | `NOGROUP` recreated the group and resumed |

Unit tests: `.venv/bin/python -m pytest -q` → 10 passed.

## Limits

- No rate limiting; Redis, the worker and the 256 KiB body cap are the only protection. Put the
  gateway behind the platform's rate limiter if it is public.
- Anonymous by default, matching the Next route. Set `TELEMETRY_GATEWAY_TOKEN` for
  service-to-service callers, and remember that any token holder may choose an `organizationId`.
- One stream, one worker group. Scaling the worker is fine (the group distributes entries); scaling
  the gateway is fine (it only appends).
- The gateway does not read Postgres. If the worker is down, `lag` grows and `readyz` still reports
  Redis as healthy — watch `lag` for delivery health.
