# Telemetry queue and worker

The gateway can hand samples to Redis instead of writing them in-process:

```
POST /api/telemetry  ->  Redis Stream  ->  worker  ->  Postgres
```

Set `REDIS_URL` to enable it. Without it the app keeps the previous in-process buffer, so local
development needs no Redis.

## Why a stream

Redis Streams give a consumer group, explicit acknowledgements and a pending list, which is the
machinery needed to promise "no lost messages":

- the gateway `XADD`s one entry per request batch and answers 202 only after Redis accepted it;
- the worker `XREADGROUP`s with a consumer group, writes the aggregated batch, then `XACK`s;
- a failed insert is **not** acknowledged, so the entry stays pending and is reclaimed;
- `XAUTOCLAIM` after 10 s rescues entries held by a worker that died.

Delivery is **at-least-once**. A crash between the insert and the ack can duplicate a batch; the
dashboard uses percentiles, so duplicates are harmless.

## Keys

| Key | Purpose |
| --- | --- |
| `bastion:telemetry:samples` | Stream, trimmed to ~200,000 entries |
| `bastion:telemetry:writers` | Consumer group used by the worker |
| `bastion:telemetry:worker:alive` | Heartbeat with a 15 s TTL |

## Running it

```bash
redis-server --port 6380 --daemonize yes
# .env.local
REDIS_URL=redis://localhost:6380

npm run telemetry:worker        # long-running
npm run telemetry:worker -- --once   # drain what is queued, then exit
```

`--once` is what the integration check uses. The worker logs a summary on shutdown and a warning
when a write fails (the batch stays pending).

## Health

```bash
curl -b cookies.txt http://localhost:3000/api/telemetry/health
```

Memory mode returns the buffer counters. Redis mode returns:

```json
{
  "mode": "redis",
  "redis": { "length": 12, "lag": 0, "pending": 0, "consumers": 1, "workerAlive": "2026-11-03T..." },
  "drained": false
}
```

`lag` is the real backlog: entries not yet delivered to the group. `length` is only what the stream
still retains, so it stays non-zero after successful delivery until trimming. A growing `lag` with
`workerAlive` older than 15 s (or `null`) means nothing is consuming. A growing `pending` means the
worker is failing to write. `?drain=1` only affects memory mode.

## Failure behaviour

| Situation | Gateway | Result |
| --- | --- | --- |
| Redis unreachable | `503` + `Retry-After: 1` | browser reporter retries; nothing acknowledged, nothing lost |
| Stream at max length | oldest entries trimmed | bounded memory; monitor `length` |
| Worker down | samples accumulate | delivered when a worker starts |
| Worker killed mid-write | entries stay pending | reclaimed after 10 s, at-least-once |
| Postgres down | worker leaves entries pending | retried on the next loop; no ack, no loss |
| Malformed entry | worker acks it | cannot block the stream |

The gateway never silently falls back to its local buffer when Redis is configured but unreachable —
that would split delivery and make loss invisible.

## Verified behaviour

Run against local Redis 8.10 + Postgres 18 with the production build:

| Scenario | Result |
| --- | --- |
| Gateway load (11,000 samples in, worker running) | 0 rejected, 0 lost, `lag` returns to 0 |
| Worker killed (SIGKILL), 50 batches queued | `lag` grows to 100 entries; worker restart drains it to 0 with all 500 samples stored |
| Entries delivered to a consumer that never acknowledges | 40 entries pending; worker's `XAUTOCLAIM` pass writes all 200 samples and clears the PEL |
| Redis stopped | `POST /api/telemetry` returns `503` with `Retry-After: 1`; nothing is acknowledged |
| Redis restarted (empty, no persistence) | worker logs `NOGROUP`, recreates the group, resumes; next batch is stored |

`consumers` in the health response can stay above 1 after a worker is killed: Redis keeps the dead
consumer's name until its pending entries are claimed and the consumer is cleaned up.

## Limits

- Trimming is approximate (`MAXLEN ~`). A stream that outgrows the cap loses its oldest entries;
  alert on `length` before that happens.
- The worker is a separate process. On a platform that only runs the web app, run it as a separate
  worker service with the same `DATABASE_URL` and `REDIS_URL`.
- Redis persistence (`appendonly`) is the operator's call. Without it, a Redis restart loses the
  queue; the stream is not a durable log by default.
