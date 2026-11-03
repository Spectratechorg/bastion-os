import os
from dataclasses import dataclass, field


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    """Environment-driven configuration. Injectable so tests never read the process environment."""

    redis_url: str = "redis://localhost:6379"
    stream: str = "bastion:telemetry:samples"
    stream_maxlen: int = 200_000
    max_batch: int = 30
    # Bearer token for writes. When empty the gateway accepts anonymous beacons, like the Next route.
    token: str = ""
    # Extra origins allowed to call the gateway from a browser. Empty means no CORS headers.
    allowed_origins: tuple[str, ...] = field(default_factory=tuple)

    @classmethod
    def from_env(cls) -> "Settings":
        origins = tuple(
            origin.strip()
            for origin in os.environ.get("TELEMETRY_GATEWAY_ORIGINS", "").split(",")
            if origin.strip()
        )
        return cls(
            redis_url=os.environ.get("REDIS_URL", "redis://localhost:6379"),
            stream=os.environ.get("TELEMETRY_STREAM", "bastion:telemetry:samples"),
            stream_maxlen=_int("TELEMETRY_STREAM_MAXLEN", 200_000),
            max_batch=_int("TELEMETRY_MAX_BATCH", 30),
            token=os.environ.get("TELEMETRY_GATEWAY_TOKEN", ""),
            allowed_origins=origins,
        )
