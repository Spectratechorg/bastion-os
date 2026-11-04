# Telemetry dark launch

Replay real, already-stored telemetry through the new stack and check that what comes out is
identical to what went in. Nothing is shown to users and production metrics are untouched.

```
telemetry_samples (replay_run is null)
        │  read
        ▼
  replay tool ──► gateway ──► Redis stream ──► worker ──► telemetry_samples (replay_run = run id)
        │                                                        │
        └──────────────── compare multisets ◄────────────────────┘
```

## Run it

```bash
npm run dev                       # gateway
npm run telemetry:worker          # worker
```

Then, with the same session cookie you use for the app:

```bash
COOKIE="better-auth.session_token=..." LIMIT=500 npm run perf:replay
```

Options:

| Variable | Default | Meaning |
| --- | --- | --- |
| `VIA` | `gateway` | `gateway` exercises POST → Redis → worker → Postgres; `stream` writes straight to Redis |
| `LIMIT` | `500` | How many real rows to replay |
| `BATCH` | `10` | Samples per gateway request (max 30) |
| `RUN_ID` | `dark-<random>` | Tag written to `replay_run` |
| `TARGET_MS` | unset | Optional gateway ack p95 budget. Latency is only reported by default; use `perf:load` for the 5 ms gate |
| `TIMEOUT_MS` | `60000` | How long to wait for the worker to catch up |
| `CLEANUP` | `false` | Delete the replayed rows when finished |

## What is compared

`kind`, `screen`, `route`, `metric`, `value`, `rating`, `device` and `navigationType`, as a
multiset. Rows are matched exactly first, then leftovers are paired ignoring `value` so a changed
value is reported as **drift with a delta** instead of a loss plus a duplicate. Anything unpaired is
reported as **missing** or **extra**. Per-group counts and p50 are compared as well.

Deliberately excluded:

- `organizationId` — the gateway attributes a replay to the operator's session, not the original
  one. Stream mode preserves it, but the comparison ignores it so both modes report the same result.
- `id` and `createdAt` — new rows by definition.

The run fails (exit 1) if any sample is missing, extra or drifted, or if a batch was rejected.
Latency is printed for information; set `TARGET_MS` if the run should also fail on ack p95.

## Keeping production clean

- Replayed rows carry `replay_run = <run id>`.
- `GET /api/telemetry` (the dashboard) filters those rows out, so totals and percentiles do not move.
- The replay sends `x-telemetry-replay: <run id>`; the server-timing wrapper sees it and records
  nothing for those requests, so the replay adds no rows of its own to either production metrics or
  the comparison.
- The gateway only honours `replayRun` for authenticated callers; an anonymous request cannot hide
  samples from the dashboard.

## Verified

Against local Postgres 18 + Redis 8.10 with the production build:

| Check | Result |
| --- | --- |
| `VIA=gateway`, 200 real rows | 200 matched, 0 drift, 0 missing, 0 extra; ack p50 3.04 ms, p95 4.85 ms |
| `VIA=stream`, 100 real rows | 100 matched, 0 drift, 0 missing, 0 extra |
| Rejected batches | 0 |
| Dashboard total before / after | 20,000 / 20,000 (replay rows filtered) |
| Replay server timings | none written (suppressed) |
| Worker stopped, 100 rows replayed | reported 100 missing and exited 1; after the worker restarted all 100 were written from the stream |

## Limits

- The source is a snapshot taken at the start; rows written while the replay runs are not included.
- Replaying huge limits means a lot of tagged rows. Use `CLEANUP=true` or delete by `replay_run`
  afterwards; the 30-day prune removes them eventually.
- Throughput is bounded by the gateway/worker, so this checks correctness and per-request latency,
  not maximum throughput. Use `npm run perf:load` for that.
