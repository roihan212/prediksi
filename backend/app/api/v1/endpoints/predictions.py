"""
Predictions Endpoints — GET /api/v1/predictions
"""
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import ModelExperiment, Prediction, Stock
from app.schemas.prediction import PredictionOut, PredictionCompare

router = APIRouter()


def _ticker_variants(ticker: str):
    t = ticker.upper()
    return [t, f"{t}.JK"] if not t.endswith(".JK") else [t, t[:-3]]


@router.get("/{ticker}/latest", response_model=List[PredictionOut], summary="Prediksi terbaru ketiga model")
async def get_latest_predictions(ticker: str, db: AsyncSession = Depends(get_db)):
    """
    Mengembalikan prediksi terbaru dari semua model aktif untuk satu emiten.
    Cocok untuk ditampilkan dalam Algorithm Comparison View.
    """
    stock_result = await db.execute(
        select(Stock).where(Stock.ticker.in_(_ticker_variants(ticker)))
    )
    stock = stock_result.scalar_one_or_none()
    if not stock:
        raise HTTPException(status_code=404, detail=f"Ticker {ticker} tidak ditemukan")

    # Semua model
    exps_result = await db.execute(
        select(ModelExperiment).order_by(ModelExperiment.created_at.desc())
    )
    experiments = exps_result.scalars().all()

    predictions = []
    seen_algorithms = set()

    for exp in experiments:
        if exp.algorithm in seen_algorithms:
            continue  # Hanya ambil model terbaru per algoritma

        pred_result = await db.execute(
            select(Prediction)
            .where(
                Prediction.stock_id == stock.id,
                Prediction.experiment_id == exp.id,
            )
            .order_by(Prediction.prediction_date.desc())
            .limit(1)
        )
        pred = pred_result.scalar_one_or_none()
        if pred:
            predictions.append(PredictionOut(
                algorithm=exp.algorithm,
                experiment_name=exp.experiment_name,
                prediction_date=pred.prediction_date,
                predicted_class=pred.predicted_class,
                signal="NAIK" if pred.predicted_class == 1 else "STAGNAN/TURUN",
                probability=float(pred.probability) if pred.probability else None,
                actual_class=pred.actual_class,
            ))
            seen_algorithms.add(exp.algorithm)

    return predictions


@router.get("/{ticker}/history", response_model=List[PredictionOut], summary="Riwayat prediksi")
async def get_prediction_history(
    ticker: str,
    algorithm: Optional[str] = Query(None, description="Filter by: LOGISTIC_REGRESSION | DECISION_TREE | RANDOM_FOREST"),
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Riwayat prediksi dengan filter algoritma dan tanggal."""
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
        PredictionOut(
            algorithm=alg,
            experiment_name=exp_name,
            prediction_date=pred.prediction_date,
            predicted_class=pred.predicted_class,
            signal="NAIK" if pred.predicted_class == 1 else "STAGNAN/TURUN",
            probability=float(pred.probability) if pred.probability else None,
            actual_class=pred.actual_class,
        )
        for pred, alg, exp_name in rows
    ]
