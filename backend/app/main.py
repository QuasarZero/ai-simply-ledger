from __future__ import annotations

from fastapi import FastAPI
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.audit import error_log, install_global_error_logging
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
        error_log(error=exc, request=request)
        raise


@app.get("/health")
def health():
    return {"ok": True}
