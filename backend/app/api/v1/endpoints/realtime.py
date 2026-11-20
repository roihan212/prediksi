"""
Real-Time Prediction Endpoint
GET /api/v1/realtime/{ticker}/predict

Fetch harga terbaru dari Yahoo Finance → hitung indikator → prediksi langsung
tanpa perlu data tersimpan di DB (selalu up-to-date).
"""
import logging
from datetime import date, datetime, timedelta
from typing import List, Optional

import joblib
import numpy as np
import pandas as pd
import yfinance as yf
import ta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import ModelExperiment, Stock, Prediction, DailyPrice
from app.ml.features.engineering import FEATURE_COLS, compute_indicators
from app.schemas.prediction import PredictionOut

logger = logging.getLogger(__name__)
router = APIRouter()

FEATURE_COLS_ORDERED = [
    "rsi_14", "macd_line", "macd_signal", "macd_histogram",
    "sma_20", "sma_50", "ema_20",
    "bb_upper", "bb_middle", "bb_lower",
    "stoch_k", "stoch_d", "atr_14", "obv"
]


def _ticker_variants(ticker: str):
    t = ticker.upper()
    return [t, f"{t}.JK"] if not t.endswith(".JK") else [t, t[:-3]]


def _yf_ticker(ticker: str) -> str:
    """Pastikan format Yahoo Finance (pakai .JK)"""
    t = ticker.upper()
    return t if t.endswith(".JK") else f"{t}.JK"


def _next_business_day(d: date) -> date:
    next_day = d + timedelta(days=1)
    while next_day.weekday() >= 5:
        next_day += timedelta(days=1)
    return next_day


def _safe_json_float(val):
    """Konversi float ke JSON-safe value (ganti NaN/Inf dengan None)."""
    if val is None:
        return None
    try:
        f = float(val)
        if np.isnan(f) or np.isinf(f):
            return None
        return f
    except (TypeError, ValueError):
        return None


async def _fetch_realtime_features(ticker: str) -> dict:
    """
    Fetch 100 hari terakhir dari Yahoo Finance,
    hitung semua indikator, kembalikan baris terakhir sebagai dict fitur.
    """
    yf_sym = _yf_ticker(ticker)
    end   = datetime.today()
    start = end - timedelta(days=200)  # ambil cukup banyak agar indikator stabil

    df = yf.download(yf_sym, start=start.strftime("%Y-%m-%d"),
                     end=end.strftime("%Y-%m-%d"), progress=False, auto_adjust=True)

    if df is None or df.empty:
        raise HTTPException(status_code=503, detail=f"Gagal fetch data Yahoo Finance untuk {yf_sym}")

    # Flatten MultiIndex kolom jika ada
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [col[0].lower() for col in df.columns]
    else:
        df.columns = [c.lower() for c in df.columns]

    df = df.reset_index()
    df = df.rename(columns={"Date": "date", "Open": "open", "High": "high",
                             "Low": "low", "Close": "close", "Volume": "volume"})
    df["date"] = pd.to_datetime(df["date"]).dt.date

    # Hitung indikator (threshold=0, target tidak dipakai saat inference)
    indicator_df = compute_indicators(df.copy())

    if indicator_df.empty:
        raise HTTPException(status_code=503, detail="Tidak cukup data untuk hitung indikator")

    latest = indicator_df.iloc[-1]
    latest_date = latest["date"]

    # Ambil harga terakhir dari dataframe OHLCV asli (bukan indicator_df yang mungkin drop baris)
    raw_last_close = float(df.iloc[-1]["close"]) if "close" in df.columns else 0.0

    features = {}
    missing = []
    for col in FEATURE_COLS_ORDERED:
        val = latest.get(col)
        if val is None or (isinstance(val, float) and np.isnan(val)):
            missing.append(col)
        else:
            features[col] = float(val)

    if missing:
        logger.warning(f"Fitur kosong untuk {ticker}: {missing}")
        # isi dengan 0 agar tetap bisa prediksi
        for col in missing:
            features[col] = 0.0

    return {
        "features": features,
        "latest_date": latest_date,
        "latest_close": _safe_json_float(raw_last_close),
    }


@router.get("/{ticker}/predict", summary="Prediksi real-time dari data Yahoo Finance terbaru")
async def realtime_predict(
    ticker: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch harga terkini dari Yahoo Finance → hitung indikator teknikal →
    jalankan semua model aktif → kembalikan prediksi untuk hari berikutnya.
    
    **Real-time**: selalu pakai data harga terbaru dari internet.
    """
    # 1. Ambil stock dari DB
    stock_result = await db.execute(
        select(Stock).where(Stock.ticker.in_(_ticker_variants(ticker)))
    )
    stock = stock_result.scalar_one_or_none()
    if not stock:
        raise HTTPException(status_code=404, detail=f"Ticker {ticker} tidak ditemukan")

    # 2. Fetch data real-time dari Yahoo Finance
    try:
        realtime = await _fetch_realtime_features(ticker)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error fetch real-time: {str(e)}")

    features    = realtime["features"]
    latest_date = realtime["latest_date"]
    latest_close = realtime["latest_close"]
    prediction_date = _next_business_day(latest_date)

    X = np.array([[features[col] for col in FEATURE_COLS_ORDERED]])

    # 3. Load semua model aktif (1 per algoritma)
    exps_result = await db.execute(
        select(ModelExperiment).order_by(ModelExperiment.created_at.desc())
    )
    all_exps = exps_result.scalars().all()

    seen = set()
    results = []

    for exp in all_exps:
        if exp.algorithm in seen:
            continue
        seen.add(exp.algorithm)

        try:
            from pathlib import Path
            model_path = Path("saved_models") / Path(exp.model_file_path).name
            if not model_path.exists():
                model_path = Path(exp.model_file_path)
            if not model_path.exists():
                logger.warning(f"Model file tidak ditemukan: {exp.model_file_path}")
                continue

            model = joblib.load(str(model_path))
            predicted_class = int(model.predict(X)[0])
            probability = None
            try:
                probability = float(model.predict_proba(X)[0][1])
            except Exception:
                pass

            # Simpan prediksi real-time ke DB (upsert)
            existing = await db.execute(
                select(Prediction).where(
                    Prediction.stock_id == stock.id,
                    Prediction.experiment_id == exp.id,
                    Prediction.prediction_date == prediction_date,
                )
            )
            existing_pred = existing.scalar_one_or_none()
            if existing_pred is None:
                new_pred = Prediction(
                    stock_id=stock.id,
                    experiment_id=exp.id,
                    prediction_date=prediction_date,
                    predicted_class=predicted_class,
                    probability=probability,
                )
                db.add(new_pred)

            results.append({
                "algorithm": exp.algorithm,
                "experiment_name": exp.experiment_name,
                "prediction_date": str(prediction_date),
                "predicted_class": predicted_class,
                "signal": "NAIK" if predicted_class == 1 else "STAGNAN/TURUN",
                "probability": _safe_json_float(probability),
                "actual_class": None,
                # Metadata tambahan
                "latest_date": str(latest_date),
                "latest_close": _safe_json_float(latest_close),
            })

        except Exception as e:
            logger.error(f"Error inference {exp.algorithm} for {ticker}: {e}")

    await db.commit()

    if not results:
        raise HTTPException(status_code=503, detail="Semua model gagal dijalankan")

    return {
        "ticker": ticker.upper(),
        "data_tanggal": str(latest_date),
        "harga_terakhir": _safe_json_float(latest_close),
        "prediksi_untuk": str(prediction_date),
        "timestamp": datetime.now().isoformat(),
        "predictions": results,
    }


@router.get("/{ticker}/history-by-date", summary="Riwayat prediksi dengan filter tanggal")
async def prediction_history_by_date(
    ticker: str,
    start: Optional[date] = Query(None, description="Tanggal mulai (YYYY-MM-DD)"),
    end:   Optional[date] = Query(None, description="Tanggal akhir (YYYY-MM-DD)"),
    algorithm: Optional[str] = Query(None, description="RANDOM_FOREST | DECISION_TREE | LOGISTIC_REGRESSION"),
    limit: int = Query(200, le=1000),
    db: AsyncSession = Depends(get_db),
):
    """
    Riwayat prediksi dengan filter tanggal dari/sampai.
    Diurutkan dari terbaru ke terlama.
    """
    stock_result = await db.execute(
        select(Stock).where(Stock.ticker.in_(_ticker_variants(ticker)))
    )
    stock = stock_result.scalar_one_or_none()
    if not stock:
        raise HTTPException(status_code=404, detail=f"Ticker {ticker} tidak ditemukan")

    query = (
        select(Prediction, ModelExperiment.algorithm, ModelExperiment.experiment_name)
        .join(ModelExperiment, Prediction.experiment_id == ModelExperiment.id)
        .where(Prediction.stock_id == stock.id)
        .order_by(Prediction.prediction_date.desc())
        .limit(limit)
    )

    if algorithm:
        query = query.where(ModelExperiment.algorithm == algorithm.upper())
    if start:
        query = query.where(Prediction.prediction_date >= start)
    if end:
        query = query.where(Prediction.prediction_date <= end)

    rows = (await db.execute(query)).all()

    return [
        {
            "algorithm": alg,
            "experiment_name": exp_name,
            "prediction_date": str(pred.prediction_date),
            "predicted_class": pred.predicted_class,
            "signal": "NAIK" if pred.predicted_class == 1 else "STAGNAN/TURUN",
            "probability": float(pred.probability) if pred.probability else None,
            "actual_class": pred.actual_class,
        }
        for pred, alg, exp_name in rows
    ]
