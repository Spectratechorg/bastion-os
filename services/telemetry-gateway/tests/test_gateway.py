import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.main import create_app


class FakeQueue:
    def __init__(self, failing: bool = False) -> None:
        self.batches: list[list[dict]] = []
        self.failing = failing
        self.closed = False

    async def enqueue(self, samples: list[dict]) -> str:
        if self.failing:
            raise RuntimeError("redis down")
        self.batches.append(samples)
        return "1-0"

    async def ping(self) -> bool:
        return not self.failing

    async def stats(self) -> dict:
        return {"stream": "stream", "length": 3, "lag": 0, "pending": 0, "consumers": 1}

    async def aclose(self) -> None:
        self.closed = True


def make_client(settings: Settings | None = None, queue: FakeQueue | None = None) -> tuple[AsyncClient, FakeQueue]:
    store = queue or FakeQueue()
    app = create_app(settings or Settings(redis_url="redis://unused"), store)
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://gateway"), store


async def test_check_ins_accept_and_reach_the_stream_shape():
    client, store = make_client()
    async with client:
        response = await client.post(
            "/v1/check-ins",
            json={"samples": [
                {"kind": "web-vital", "metric": "lcp", "value": 1234.5, "screen": "overview", "rating": "good", "device": "desktop"},
                {"kind": "api", "metric": "api", "value": 42, "route": "/api/dashboard"},
                {"kind": "web-vital", "metric": "lcp", "value": 900, "screen": "something-new"},
            ]},
        )

    assert response.status_code == 202
    assert response.json() == {"accepted": 3, "rejected": 0, "mode": "redis"}
    batch = store.batches[0]
    assert batch[0]["metric"] == "lcp"
    assert batch[0]["organizationId"] is None
    assert batch[1]["route"] == "/api/dashboard"
    assert batch[2]["screen"] == "other"


async def test_api_route_without_leading_slash_is_normalised():
    client, store = make_client()
    async with client:
        response = await client.post("/v1/check-ins", json={"samples": [{"kind": "api", "metric": "api", "value": 1, "route": "dashboard"}]})

    assert response.status_code == 202
    assert store.batches[0][0]["route"] == "/unknown"


async def test_batch_limit_is_enforced():
    client, store = make_client(Settings(max_batch=2))
    async with client:
        response = await client.post(
            "/v1/check-ins",
            json={"samples": [{"kind": "web-vital", "metric": "lcp", "value": i} for i in range(3)]},
        )

    assert response.status_code == 400
    assert "at most 2" in response.json()["error"]
    assert store.batches == []


async def test_invalid_payload_returns_400_with_the_error_contract():
    client, store = make_client()
    async with client:
        response = await client.post("/v1/check-ins", json={"samples": [{"kind": "nope", "metric": "x", "value": 1}]})

    assert response.status_code == 400
    assert response.json() == {"error": "That telemetry payload is not valid."}
    assert store.batches == []


async def test_token_is_required_when_configured():
    client, store = make_client(Settings(token="secret"))
    async with client:
        missing = await client.post("/v1/pings", json={"value": 10})
        wrong = await client.post("/v1/pings", json={"value": 10}, headers={"authorization": "Bearer nope"})
        ok = await client.post("/v1/pings", json={"value": 10}, headers={"authorization": "Bearer secret"})

    assert missing.status_code == 401
    assert missing.json() == {"error": "A valid gateway token is required."}
    assert wrong.status_code == 401
    assert ok.status_code == 202
    assert len(store.batches) == 1


async def test_organization_is_only_trusted_for_authenticated_callers():
    authed, authed_store = make_client(Settings(token="secret"))
    async with authed:
        await authed.post(
            "/v1/check-ins",
            json={"samples": [{"kind": "web-vital", "metric": "lcp", "value": 1}], "organizationId": "org-1"},
            headers={"authorization": "Bearer secret"},
        )

    anonymous, anonymous_store = make_client()
    async with anonymous:
        await anonymous.post(
            "/v1/check-ins",
            json={"samples": [{"kind": "web-vital", "metric": "lcp", "value": 1}], "organizationId": "org-1"},
        )

    assert authed_store.batches[0][0]["organizationId"] == "org-1"
    assert anonymous_store.batches[0][0]["organizationId"] is None


async def test_ping_defaults_and_replay_header():
    client, store = make_client()
    async with client:
        response = await client.post(
            "/v1/pings",
            json={"value": 87, "screen": "guard-app"},
            headers={"x-telemetry-replay": "dark-abc"},
        )

    assert response.status_code == 202
    sample = store.batches[0][0]
    assert sample["kind"] == "web-vital"
    assert sample["metric"] == "ttfb"
    assert sample["screen"] == "guard-app"
    assert sample["replayRun"] == "dark-abc"


async def test_invalid_replay_header_is_ignored():
    client, store = make_client()
    async with client:
        await client.post("/v1/pings", json={"value": 5}, headers={"x-telemetry-replay": "Not Valid!"})

    assert "replayRun" not in store.batches[0][0]


async def test_queue_failure_answers_503_and_never_acks():
    client, store = make_client(queue=FakeQueue(failing=True))
    async with client:
        response = await client.post("/v1/pings", json={"value": 5})
        ready = await client.get("/readyz")

    assert response.status_code == 503
    assert response.headers["retry-after"] == "1"
    assert ready.status_code == 503
    assert store.batches == []


async def test_health_endpoints():
    client, _ = make_client()
    async with client:
        health = await client.get("/healthz")
        ready = await client.get("/readyz")
        queue = await client.get("/v1/queue")

    assert health.status_code == 200
    assert health.json() == {"ok": True}
    assert ready.status_code == 200
    assert ready.json()["stream"]["lag"] == 0
    assert queue.json()["length"] == 3
