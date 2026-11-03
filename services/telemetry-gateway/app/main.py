import logging
import secrets
import time
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import Settings
from .models import CheckInBatch, Ping
from .normalize import replay_run_from_header, to_stream_sample
from .queue import RedisQueue

logger = logging.getLogger("telemetry_gateway")

MAX_BODY_BYTES = 256 * 1024


def create_app(settings: Settings | None = None, queue: RedisQueue | None = None) -> FastAPI:
    """Builds the app. Both collaborators are injectable so tests never touch Redis or the env."""
    config = settings or Settings.from_env()
    store: RedisQueue = queue or RedisQueue(config)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        logger.info("telemetry gateway listening on stream %s", config.stream)
        yield
        await store.aclose()

    app = FastAPI(
        title="BastionOS telemetry gateway",
        version="1.0.0",
        description="Accepts check-in telemetry and latency pings and appends them to the telemetry stream.",
        lifespan=lifespan,
    )
    app.state.settings = config
    app.state.queue = store

    if config.allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(config.allowed_origins),
            allow_methods=["POST", "GET"],
            allow_headers=["content-type", "authorization", "x-telemetry-replay"],
            max_age=600,
        )

    @app.exception_handler(RequestValidationError)
    async def invalid_payload(_: Request, __: RequestValidationError) -> JSONResponse:
        # Same contract as the Next.js route: 400, not FastAPI's default 422.
        return JSONResponse({"error": "That telemetry payload is not valid."}, status_code=400)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, error: StarletteHTTPException) -> JSONResponse:
        message = error.detail if isinstance(error.detail, str) else "Request failed."
        return JSONResponse({"error": message}, status_code=error.status_code, headers=error.headers)

    async def require_token(authorization: str | None = Header(default=None)) -> None:
        if not config.token:
            return
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="A valid gateway token is required.")
        if not secrets.compare_digest(authorization[7:], config.token):
            raise HTTPException(status_code=401, detail="A valid gateway token is required.")

    def _trusted_organization(requested: str | None) -> str | None:
        # A caller may only choose the organization when it authenticated with the gateway token.
        return requested if config.token else None

    async def _submit(samples, organization_id: str | None, replay_run: str | None, route: str) -> JSONResponse:
        started = time.perf_counter()
        payload = [to_stream_sample(sample, organization_id, replay_run) for sample in samples]
        try:
            await store.enqueue(payload)
        except Exception as error:  # noqa: BLE001 - any queue failure is a 503, never a silent drop
            logger.warning("enqueue failed on %s: %s", route, type(error).__name__)
            return JSONResponse(
                {"error": "Telemetry queue is unavailable. Retry later."},
                status_code=503,
                headers={"retry-after": "1"},
            )
        elapsed_ms = (time.perf_counter() - started) * 1000
        logger.info("%s accepted=%d replay=%s ms=%.2f", route, len(payload), replay_run or "-", elapsed_ms)
        return JSONResponse(
            {"accepted": len(payload), "rejected": 0, "mode": "redis"},
            status_code=202,
        )

    def _body_too_large(request: Request) -> bool:
        length = request.headers.get("content-length")
        return bool(length and length.isdigit() and int(length) > MAX_BODY_BYTES)

    @app.post("/v1/check-ins", status_code=202)
    async def check_ins(
        batch: CheckInBatch,
        request: Request,
        replay: str | None = Header(default=None, alias="x-telemetry-replay"),
        _: None = Depends(require_token),
    ):
        if _body_too_large(request):
            return JSONResponse({"error": "That telemetry payload is too large."}, status_code=413)
        if len(batch.samples) > config.max_batch:
            return JSONResponse({"error": f"A batch may carry at most {config.max_batch} samples."}, status_code=400)
        return await _submit(
            batch.samples,
            _trusted_organization(batch.organizationId),
            replay_run_from_header(replay),
            "/v1/check-ins",
        )

    @app.post("/v1/pings", status_code=202)
    async def pings(
        ping: Ping,
        request: Request,
        replay: str | None = Header(default=None, alias="x-telemetry-replay"),
        _: None = Depends(require_token),
    ):
        if _body_too_large(request):
            return JSONResponse({"error": "That telemetry payload is too large."}, status_code=413)
        return await _submit(
            [ping.as_sample()],
            _trusted_organization(ping.organizationId),
            replay_run_from_header(replay),
            "/v1/pings",
        )

    @app.get("/healthz")
    async def healthz():
        return {"ok": True}

    @app.get("/readyz")
    async def readyz():
        healthy = await store.ping()
        body = {"ok": healthy, "redis": healthy}
        if healthy:
            try:
                body["stream"] = await store.stats()
            except Exception:  # noqa: BLE001 - readiness must answer even when stats fail
                body["stream"] = None
        return JSONResponse(body, status_code=200 if healthy else 503)

    @app.get("/v1/queue")
    async def queue_stats(_: None = Depends(require_token)):
        try:
            return await store.stats()
        except Exception:  # noqa: BLE001
            return JSONResponse({"error": "Telemetry queue is unavailable. Retry later."}, status_code=503)

    return app


app = create_app()
