"""
FastAPI Application Entry Point
"""
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.v1.router import api_router
from app.db.database import engine, Base
from app.core.scheduler import start_scheduler, stop_scheduler, run_daily_pipeline_job


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ─── Startup ──────────────────────────────────────────
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print(f"✅ {settings.APP_NAME} v{settings.APP_VERSION} started")

    # Jalankan background scheduler harian
    start_scheduler()

    # Jalankan 1x auto-sync di latar belakang saat server start untuk cek tanggal tertinggal
    asyncio.create_task(run_daily_pipeline_job())

    yield
    # ─── Shutdown ─────────────────────────────────────────
    stop_scheduler()
    await engine.dispose()
    print("🛑 Database engine closed")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="""
## 📈 Stock Prediction API — Saham Perbankan BEI

REST API untuk prediksi pergerakan harga saham sektor perbankan Indonesia
menggunakan machine learning (Logistic Regression, Decision Tree, Random Forest).

**Saham yang Didukung**: BBCA · BBRI · BBNI · BMRI · BRIS
    """,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ─── CORS ─────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # Ganti dengan domain spesifik di production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routes ───────────────────────────────────────────────────
app.include_router(api_router, prefix="/api/v1")


@app.get("/", tags=["Health"])
async def root():
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "status": "running",
    }


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy"}
