import json

from redis.asyncio import Redis

from .config import Settings


class RedisQueue:
    """Appends batches to the same Redis Stream the Next.js gateway uses.

    Nothing is acknowledged until Redis has accepted the entry, so a Redis outage surfaces as a
    503 instead of a silent drop.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: Redis | None = None

    def _connection(self) -> Redis:
        if self._client is None:
            self._client = Redis.from_url(self._settings.redis_url, decode_responses=True)
        return self._client

    async def enqueue(self, samples: list[dict]) -> str:
        if not samples:
            raise ValueError("empty batch")
        fields = {
            "v": "1",
            "count": str(len(samples)),
            "payload": json.dumps(samples, separators=(",", ":")),
        }
        return await self._connection().xadd(
            self._settings.stream,
            fields,
            maxlen=self._settings.stream_maxlen,
            approximate=True,
        )

    async def ping(self) -> bool:
        try:
            return bool(await self._connection().ping())
        except Exception:
            return False

    async def stats(self) -> dict:
        """Stream depth and consumer-group backlog, for /v1/queue and readiness."""
        client = self._connection()
        length = await client.xlen(self._settings.stream)
        groups = None
        try:
            groups = await client.xinfo_groups(self._settings.stream)
        except Exception:
            groups = None
        group = next((entry for entry in groups or [] if entry.get("name") == "bastion:telemetry:writers"), None)
        return {
            "stream": self._settings.stream,
            "length": length,
            "lag": group.get("lag") if group else None,
            "pending": group.get("pending") if group else None,
            "consumers": group.get("consumers") if group else None,
        }

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None
