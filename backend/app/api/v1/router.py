from fastapi import APIRouter

from app.api.v1.endpoints import stocks, predictions, market, admin, experiments, realtime, news

api_router = APIRouter()

# ─── Public Endpoints ─────────────────────────────────────────
api_router.include_router(market.router,      prefix="/market",      tags=["Market"])
api_router.include_router(stocks.router,      prefix="/stocks",      tags=["Stocks"])
api_router.include_router(predictions.router, prefix="/predictions",  tags=["Predictions"])
api_router.include_router(realtime.router,    prefix="/realtime",     tags=["Real-Time Prediction"])
api_router.include_router(news.router,        prefix="/news",         tags=["Market News & Sentiment"])

# ─── Admin Endpoints ──────────────────────────────────────────
api_router.include_router(admin.router,       prefix="/admin",       tags=["Admin"])
api_router.include_router(experiments.router, prefix="/experiments",  tags=["Experiments"])
