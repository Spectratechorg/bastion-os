# Telemetry load test

`scripts/load-test-telemetry.ts` checks the two acceptance criteria for the telemetry stack:

1. **Responses under 5 ms** — how fast `/api/telemetry` acknowledges.
2. **No lost messages** — every sample the server accepted (202) exists in Postgres.

## Run it

```bash
npm run dev            # or npm start
npm run perf:load      # 100 latency requests, then 1000 load requests x 10 samples, 20 in flight
```

Protected routes need a session cookie, otherwise everything answers 401 in about a millisecond:

```bash
BASE_URL=http://localhost:3000 \
COOKIE="better-auth.session_token=..." \
npm run perf:load
```

Tunable: `LATENCY_REQUESTS`, `REQUESTS`, `BATCH` (max 30), `CONCURRENCY`, `TARGET_MS`, `RUN_ID`.

## How it measures

- **Latency phase**: one request in flight, so the number is per-request ack time rather than
  queueing time.
- **Load phase**: many requests in flight; measures throughput and the loss guarantee.
- Every message carries a unique route (`/loadtest/<run-id>`), so the database count is exact and
  other telemetry written during the run cannot hide a missing sample.
- **Server handler time** is read back from the samples `timed()` recorded, which isolates the
  application from client and transport overhead.
- The run fails (exit 1) if the latency budget is missed or if any accepted message is missing.

## Measured on this machine

Local Postgres 18, `next start` (production build), Node 22, same host for client and server:

| Phase | p50 | p95 | p99 | max | Throughput |
| --- | --- | --- | --- | --- | --- |
| Latency (1 in flight) | 2.77 ms | **3.32 ms** | 3.61 ms | 3.75 ms | ~373 req/s |
| Load (20 in flight, 10 samples each) | 11.70 ms | 26.08 ms | 41.27 ms | 138 ms | ~1,381 req/s |
| Server handler only | 0.12 ms | **0.26 ms** | — | — | — |

Messages: 11,000 accepted, 0 rejected, 11,000 stored, **0 lost**.

The handler itself answers in well under a millisecond. At 20 concurrent requests the end-to-end
figure is dominated by the Next.js server and the HTTP client on one machine — a trivial
`/api/health` round-trip shows the same floor (p95 ~19 ms at 20 in flight). The 5 ms budget is
therefore asserted per request, plus a server-side p95 check that is independent of that overhead.

## What was fixed to get there

Ingest used to await the database insert. Moving the write behind `after()` dropped the handler to
~0.1 ms but exposed a real failure: a flush promise could be severed when its request context was
torn down, leaving the queue wedged and every later sample rejected. The buffer now:

- treats request-scoped flushes as a nudge and also flushes on a 25 ms process timer,
- abandons a write that has not settled within 5 s so the queue keeps moving
  (`abandonedFlushes` in the health snapshot),
- applies explicit backpressure — a full queue answers **429**, never a silent drop.

The browser reporter retries 429/5xx responses up to three times before giving up.

## Inspecting the buffer

```bash
curl -b cookies.txt "http://localhost:3000/api/telemetry/health?drain=1"
```

Returns `depth`, `accepted`, `persisted`, `rejected`, `flushErrors`, `abandonedFlushes`, `batches`,
`maxDepth`, `capacity` and whether the drain completed. Counters are per process: with several
serverless instances each reports its own, and queue contents are not shared.

## Limits worth knowing

- The queue lives in memory. A process that dies before a flush loses whatever it held; the
  timer and `after()` make that window small, but it is not a durable queue. If telemetry must
  survive an instance being killed, put a broker (or `POST` straight to the database) in front.
- On serverless, the 25 ms timer only runs while an instance is warm. `after()` is what flushes in
  practice; the timer covers long-lived servers.
- `drain=1` only proves the instance that answered is empty. With multiple instances, check the
  per-instance health endpoints or compare database counts.
