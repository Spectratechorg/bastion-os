# BastionOS telemetry gateway

FastAPI service that accepts check-in telemetry and latency pings and appends them to the same
Redis Stream the Next.js gateway writes to (`bastion:telemetry:samples`). The existing worker then
writes them to Postgres, so both edges share one pipeline and one schema.

```bash
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
.venv/bin/uvicorn app.main:app --port 8090
```

```bash
curl -s localhost:8090/v1/pings -H 'content-type: application/json' \
  -d '{"value": 120, "screen": "guard-app"}'

curl -s localhost:8090/v1/check-ins -H 'content-type: application/json' -d '{
  "samples": [
    {"kind": "web-vital", "metric": "lcp", "value": 1800, "screen": "overview"},
    {"kind": "api", "metric": "api", "value": 42, "route": "/api/dashboard"}
  ]
}'
```

Endpoints: `POST /v1/check-ins`, `POST /v1/pings`, `GET /healthz`, `GET /readyz`,
`GET /v1/queue`. Configuration and the payload contract are in
[../../docs/telemetry-gateway.md](../../docs/telemetry-gateway.md).

Tests: `.venv/bin/python -m pytest -q`
