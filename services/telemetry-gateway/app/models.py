from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SampleKind = Literal["web-vital", "route-transition", "screen-load", "api"]

# Mirrors lib/telemetry-shared.ts. Unknown screens are folded into "other" rather than rejected.
TRACKED_SCREENS = frozenset(
    {
        "overview", "guards", "sites", "attendance", "patrols", "incidents", "alerts",
        "clients", "finance", "reports", "performance", "settings", "profile", "guard-app",
    }
)

MAX_VALUE = 600_000.0


class Sample(BaseModel):
    """One telemetry observation, matching the payload the Next.js gateway produces."""

    model_config = ConfigDict(extra="forbid")

    kind: SampleKind
    metric: str = Field(min_length=1, max_length=40)
    value: float = Field(ge=0, le=MAX_VALUE)
    screen: str | None = Field(default=None, max_length=80)
    route: str | None = Field(default=None, max_length=160)
    rating: str | None = Field(default=None, max_length=20)
    device: str | None = Field(default=None, max_length=40)
    navigationType: str | None = Field(default=None, max_length=30)


class CheckInBatch(BaseModel):
    """A batch of check-in telemetry (page loads, route changes, guard-app scans)."""

    model_config = ConfigDict(extra="forbid")

    samples: list[Sample] = Field(min_length=1)
    # Only honoured for token-authenticated callers; see the route.
    organizationId: str | None = Field(default=None, max_length=100)


class Ping(BaseModel):
    """A single lightweight latency ping."""

    model_config = ConfigDict(extra="forbid")

    value: float = Field(ge=0, le=MAX_VALUE)
    metric: str = Field(default="ttfb", min_length=1, max_length=40)
    kind: SampleKind = "web-vital"
    screen: str | None = Field(default=None, max_length=80)
    route: str | None = Field(default=None, max_length=160)
    rating: str | None = Field(default=None, max_length=20)
    device: str | None = Field(default=None, max_length=40)
    navigationType: str | None = Field(default=None, max_length=30)
    # Only honoured for token-authenticated callers.
    organizationId: str | None = Field(default=None, max_length=100)

    def as_sample(self) -> Sample:
        return Sample(
            kind=self.kind,
            metric=self.metric,
            value=self.value,
            screen=self.screen,
            route=self.route,
            rating=self.rating,
            device=self.device,
            navigationType=self.navigationType,
        )
