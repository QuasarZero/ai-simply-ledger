from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exception_handlers import http_exception_handler, request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.router import api_router
from app.log import audit_http, error_log, install_global_error_logging
from app.config import get_settings

settings = get_settings()

install_global_error_logging()

app = FastAPI(
    title="AI Expense Income",
    debug=settings.debug,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    openapi_url="/openapi.json" if settings.debug else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.middleware("http")
async def _error_logging_middleware(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as exc:
        # 4xx are logged via explicit exception handlers.
        if isinstance(exc, (StarletteHTTPException, RequestValidationError)):
            raise
        error_log(error=exc, request=request)
        raise


def _should_audit_http(request: Request, status_code: int) -> bool:
    if not str(request.url.path).startswith("/api"):
        return False
    if status_code not in {401, 403, 404, 405, 422}:
        return False
    # Avoid duplicating the explicit `auth.login_failed` audit line.
    if status_code == 401 and str(request.url.path) == "/api/auth/login":
        return False
    return True


def _actor_id_from_request(request: Request) -> int | None:
    try:
        return int(getattr(request.state, "actor_id", None))
    except Exception:
        return None


def _compact_validation_errors(exc: RequestValidationError) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for e in (exc.errors() or [])[:5]:
        out.append({"loc": e.get("loc"), "msg": e.get("msg"), "type": e.get("type")})
    return out


@app.exception_handler(RequestValidationError)
async def _validation_exception_handler(request: Request, exc: RequestValidationError):
    if _should_audit_http(request, 422):
        audit_http(
            request=request,
            status_code=422,
            actor_id=_actor_id_from_request(request),
            detail=_compact_validation_errors(exc),
        )
    return await request_validation_exception_handler(request, exc)


@app.exception_handler(StarletteHTTPException)
async def _http_exception_handler(request: Request, exc: StarletteHTTPException):
    status_code = int(getattr(exc, "status_code", 500))
    if _should_audit_http(request, status_code):
        audit_http(
            request=request,
            status_code=status_code,
            actor_id=_actor_id_from_request(request),
            detail=getattr(exc, "detail", None),
        )
    return await http_exception_handler(request, exc)


@app.get("/health")
def health():
    return {"ok": True}
