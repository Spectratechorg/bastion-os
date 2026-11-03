import re

from .models import TRACKED_SCREENS, Sample

REPLAY_RUN_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")


def normalise_screen(screen: str | None) -> str | None:
    if not screen:
        return None
    return screen if screen in TRACKED_SCREENS else "other"


def normalise_route(kind: str, route: str | None) -> str | None:
    if kind != "api":
        return route
    if not route or not route.startswith("/"):
        return "/unknown"
    return route[:160]


def replay_run_from_header(value: str | None) -> str | None:
    if value and REPLAY_RUN_PATTERN.match(value):
        return value
    return None


def to_stream_sample(sample: Sample, organization_id: str | None, replay_run: str | None) -> dict:
    """Builds the exact field map the Node worker decodes.

    Keys must stay in sync with lib/telemetry-stream.ts: the worker reads the `payload` field and
    validates `kind`, `metric`, `value` and `organizationId`.
    """
    payload = {
        "kind": sample.kind,
        "metric": sample.metric,
        "value": sample.value,
        "screen": normalise_screen(sample.screen),
        "route": normalise_route(sample.kind, sample.route),
        "rating": sample.rating,
        "device": sample.device,
        "navigationType": sample.navigationType,
        "organizationId": organization_id,
    }
    if replay_run:
        payload["replayRun"] = replay_run
    return {key: value for key, value in payload.items() if value is not None or key == "organizationId"}
