"""
Celery Application & Task Definitions
Scheduled tasks: fetch data harian + inferensi harian
"""
from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

# ─── Celery App ───────────────────────────────────────────────
celery_app = Celery(
    "stockpredict",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.core.celery_app"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Jakarta",
    enable_utc=True,
)

# ─── Beat Schedule (Cron) ─────────────────────────────────────
celery_app.conf.beat_schedule = {
    # Fetch data harian setelah bursa tutup (16:45 WIB)
    "fetch-daily-stock-data": {
        "task": "app.core.celery_app.task_fetch_daily_data",
        "schedule": crontab(hour=16, minute=45, day_of_week="1-5"),
    },
    # Jalankan inferensi setelah data tersedia (17:00 WIB)
    "run-daily-inference": {
        "task": "app.core.celery_app.task_run_inference",
        "schedule": crontab(hour=17, minute=0, day_of_week="1-5"),
    },
    # Update actual_class pagi hari berikutnya (08:00 WIB)
    "update-actual-classes": {
        "task": "app.core.celery_app.task_update_actuals",
        "schedule": crontab(hour=8, minute=0, day_of_week="2-6"),
    },
}


# ─── Tasks ────────────────────────────────────────────────────
@celery_app.task(name="app.core.celery_app.task_fetch_daily_data")
def task_fetch_daily_data():
    """Fetch OHLCV harian untuk semua 5 emiten."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.ml.data.ingestion import run_full_ingestion

    engine = create_engine(settings.DATABASE_URL_SYNC)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        result = run_full_ingestion(session, period="5d")
        return result
    finally:
        session.close()
        engine.dispose()


@celery_app.task(name="app.core.celery_app.task_run_inference")
def task_run_inference():
    """Jalankan inferensi harian dengan semua model aktif."""
    from datetime import date
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import sessionmaker
    from app.db.models import ModelExperiment
    from app.ml.models.inference import run_daily_inference

    engine = create_engine(settings.DATABASE_URL_SYNC)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        active_exps = session.execute(
            select(ModelExperiment).where(ModelExperiment.is_active == True)
        ).scalars().all()
        results = run_daily_inference(session, active_exps)
        return {"predictions_generated": len(results)}
    finally:
        session.close()
        engine.dispose()


@celery_app.task(name="app.core.celery_app.task_update_actuals")
def task_update_actuals():
    """Update actual_class setelah harga aktual tersedia."""
    from datetime import date, timedelta
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.ml.models.inference import update_actual_classes

    yesterday = date.today() - timedelta(days=1)
    engine = create_engine(settings.DATABASE_URL_SYNC)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        updated = update_actual_classes(session, yesterday)
        return {"updated": updated, "date": str(yesterday)}
    finally:
        session.close()
        engine.dispose()


@celery_app.task(name="app.core.celery_app.run_training_task")
def run_training_task(
    algorithm: str,
    experiment_name: str,
    ticker=None,
    use_grid_search: bool = True,
    custom_params=None,
):
    """Background task untuk training model baru."""
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import sessionmaker
    from app.ml.features.engineering import load_features_from_db
    from app.ml.models.trainer import train_model, save_experiment_to_db
    from app.db.models import Stock

    engine = create_engine(settings.DATABASE_URL_SYNC)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        # Load fitur
        stock_id = None
        if ticker:
            stock = session.execute(
                select(Stock).where(Stock.ticker == ticker)
            ).scalar_one_or_none()
            if stock:
                stock_id = stock.id

        df = load_features_from_db(session, stock_id=stock_id)
        if df.empty:
            return {"error": "No feature data available"}

        # Training
        result = train_model(
            df=df,
            algorithm=algorithm,
            experiment_name=experiment_name,
            use_grid_search=use_grid_search,
            param_grid=custom_params,
        )

        # Simpan ke DB
        exp_id = save_experiment_to_db(
            session, result, ticker=ticker,
            notes=f"Triggered via API | grid_search={use_grid_search}"
        )
        return {"experiment_id": exp_id, "metrics": result["metrics"]}
    finally:
        session.close()
        engine.dispose()
