"""
Inference Module
Load model .joblib dan buat prediksi harian untuk 5 emiten.
"""
import logging
from datetime import date, datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd
from sqlalchemy import select

from app.core.config import settings
from app.ml.features.engineering import FEATURE_COLS

logger = logging.getLogger(__name__)

# ─── Cache model di memory ────────────────────────────────────
_MODEL_CACHE: Dict[int, object] = {}  # experiment_id → loaded model


def load_model(model_path: str, experiment_id: int):
    """Load model dari file .joblib ke memory cache."""
    if experiment_id not in _MODEL_CACHE:
        if not Path(model_path).exists():
            raise FileNotFoundError(f"Model file not found: {model_path}")
        _MODEL_CACHE[experiment_id] = joblib.load(model_path)
        logger.info(f"Loaded model: {model_path} (experiment_id={experiment_id})")
    return _MODEL_CACHE[experiment_id]


def predict_latest(
    session,
    stock_id: int,
    experiment_id: int,
) -> Optional[Dict]:
    """
    Buat prediksi untuk hari kerja berikutnya berdasarkan fitur terbaru.

    Returns:
        dict dengan predicted_class, probability, prediction_date, features
    """
    from app.db.models import DailyPrice, ModelExperiment, Prediction, TechnicalIndicator

    # Ambil eksperimen
    exp = session.get(ModelExperiment, experiment_id)
    if not exp:
        logger.error(f"Experiment {experiment_id} not found")
        return None

    # Load model
    model = load_model(exp.model_file_path, experiment_id)

    # Ambil fitur terbaru (baris terakhir dengan indikator lengkap)
    result = session.execute(
        select(DailyPrice.date, *[
            getattr(TechnicalIndicator, col) for col in FEATURE_COLS
        ])
        .join(TechnicalIndicator, TechnicalIndicator.price_id == DailyPrice.id)
        .where(DailyPrice.stock_id == stock_id)
        .order_by(DailyPrice.date.desc())
        .limit(1)
    ).fetchone()

    if not result:
        logger.warning(f"No indicator data for stock_id={stock_id}")
        return None

    latest_date = result[0]
    feature_values = list(result[1:])

    if any(v is None for v in feature_values):
        logger.warning(f"Null features for stock_id={stock_id} on {latest_date}")
        return None

    X = np.array([[float(v) for v in feature_values]])

    # Prediksi
    predicted_class = int(model.predict(X)[0])
    probability = None
    try:
        probability = float(model.predict_proba(X)[0][1])
    except Exception:
        pass

    # Tentukan tanggal prediksi (hari kerja berikutnya)
    prediction_date = _next_business_day(latest_date)

    # Simpan ke DB (upsert)
    existing = session.execute(
        select(Prediction).where(
            Prediction.stock_id == stock_id,
            Prediction.experiment_id == experiment_id,
            Prediction.prediction_date == prediction_date,
        )
    ).scalar_one_or_none()

    if existing is None:
        pred = Prediction(
            stock_id=stock_id,
            experiment_id=experiment_id,
            prediction_date=prediction_date,
            predicted_class=predicted_class,
            probability=probability,
        )
        session.add(pred)
        session.commit()
        logger.info(
            f"Saved prediction: stock={stock_id} date={prediction_date} "
            f"class={predicted_class} prob={probability:.4f}"
        )

    return {
        "stock_id": stock_id,
        "experiment_id": experiment_id,
        "prediction_date": str(prediction_date),
        "predicted_class": predicted_class,
        "probability": probability,
        "signal": "NAIK" if predicted_class == 1 else "STAGNAN/TURUN",
    }


def run_daily_inference(session, active_experiments: List) -> List[Dict]:
    """
    Jalankan inferensi untuk semua saham × semua model aktif.
    Dipanggil oleh Celery beat setiap hari.
    """
    from app.db.models import Stock

    stocks = session.execute(select(Stock)).scalars().all()
    results = []

    for stock in stocks:
        for exp in active_experiments:
            try:
                result = predict_latest(session, stock.id, exp.id)
                if result:
                    results.append(result)
            except Exception as e:
                logger.error(f"Inference failed for stock={stock.ticker} exp={exp.id}: {e}")

    logger.info(f"Daily inference complete: {len(results)} predictions generated")
    return results


def update_actual_classes(session, reference_date: date) -> int:
    """
    Update actual_class pada prediksi untuk tanggal tertentu.
    Dipanggil D+1 setelah harga aktual tersedia.
    """
    from app.db.models import DailyPrice, Prediction

    predictions = session.execute(
        select(Prediction).where(
            Prediction.prediction_date == reference_date,
            Prediction.actual_class.is_(None),
        )
    ).scalars().all()

    updated = 0
    for pred in predictions:
        actual_price = session.execute(
            select(DailyPrice.close).where(
                DailyPrice.stock_id == pred.stock_id,
                DailyPrice.date == reference_date,
            )
        ).scalar_one_or_none()

        if actual_price is None:
            continue

        # Hitung actual_class dari close sebelumnya (T-1)
        prev_price = session.execute(
            select(DailyPrice.close)
            .where(DailyPrice.stock_id == pred.stock_id)
            .order_by(DailyPrice.date.desc())
            .where(DailyPrice.date < reference_date)
            .limit(1)
        ).scalar_one_or_none()

        if prev_price:
            pred.actual_class = 1 if float(actual_price) > float(prev_price) else 0
            pred.actual_close = float(actual_price)
            updated += 1

    session.commit()
    logger.info(f"Updated {updated} actual_class values for date={reference_date}")
    return updated


def _next_business_day(d: date) -> date:
    """Hitung hari kerja berikutnya (skip Sabtu/Minggu)."""
    import datetime as dt
    next_day = d + dt.timedelta(days=1)
    while next_day.weekday() >= 5:  # 5=Sabtu, 6=Minggu
        next_day += dt.timedelta(days=1)
    return next_day
