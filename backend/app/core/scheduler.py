"""
Daily Automatic Scheduler Module
Menggunakan APScheduler untuk:
1. Sinkronisasi harga penutupan harian dari Yahoo Finance (Senin-Jumat 16:30 WIB)
2. Hitung indikator teknikal
3. Update actual_class pada prediksi yang sudah lewat
4. Buat prediksi otomatis untuk hari bursa berikutnya
"""
import logging
import asyncio
from datetime import datetime, date
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.ml.backfill_predictions import (
    step1_fetch_and_save_prices,
    step2_compute_indicators,
    step3_generate_missing_predictions,
    step4_update_actual_classes,
)
from app.core.config import settings
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


def run_daily_pipeline_sync():
    """Jalankan pipeline harian secara synchronous."""
    logger.info("🔄 [Scheduler] Menjalankan update harian otomatis...")
    db_url = str(settings.DATABASE_URL).replace("sqlite+aiosqlite", "sqlite")
    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    
    try:
        with Session(engine) as session:
            n1 = step1_fetch_and_save_prices(session)
            n2 = step2_compute_indicators(session)
            n3 = step3_generate_missing_predictions(session)
            n4 = step4_update_actual_classes(session)
            logger.info(
                f"✅ [Scheduler] Update harian selesai: "
                f"+{n1} harga, +{n2} indikator, +{n3} prediksi, {n4} aktual diupdate"
            )
    except Exception as e:
        logger.error(f"❌ [Scheduler] Gagal menjalankan update harian: {e}", exc_info=True)


async def run_daily_pipeline_job():
    """Wrapper async untuk APScheduler agar tidak memblokir event loop."""
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, run_daily_pipeline_sync)


def start_scheduler():
    """Mulai background scheduler."""
    if not scheduler.running:
        # Jadwalkan setiap Senin s/d Jumat pukul 16:30 WIB (Asia/Jakarta)
        scheduler.add_job(
            run_daily_pipeline_job,
            CronTrigger(day_of_week="mon-fri", hour=16, minute=30, timezone="Asia/Jakarta"),
            id="daily_stock_prediction_update",
            name="Daily Stock Ingestion & Prediction (16:30 WIB)",
            replace_existing=True,
        )
        scheduler.start()
        logger.info("⏰ APScheduler aktif: Berjalan setiap Senin-Jumat pukul 16:30 WIB")


def stop_scheduler():
    """Hentikan scheduler saat server shutdown."""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("🛑 APScheduler dimatikan")

