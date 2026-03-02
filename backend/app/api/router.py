from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import admin, auth, categories, category_fields, currencies, fx, stats, tags, transactions

api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router, tags=["auth"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(categories.router, tags=["categories"])
api_router.include_router(category_fields.router, tags=["category-fields"])
api_router.include_router(tags.router, tags=["tags"])
api_router.include_router(currencies.router, tags=["currencies"])
api_router.include_router(transactions.router, tags=["transactions"])
api_router.include_router(stats.router, tags=["stats"])
api_router.include_router(fx.router, tags=["fx"])
