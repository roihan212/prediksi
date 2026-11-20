"""
Market Overview Endpoint — GET /api/v1/market/overview
Snapshot semua 5 saham: harga terakhir, % change, sinyal prediksi RF
"""
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import DailyPrice, ModelExperiment, Prediction, Stock
from app.schemas.market import MarketOverviewItem

router = APIRouter()


@router.get("/overview", response_model=List[MarketOverviewItem], summary="Market overview semua saham")
async def market_overview(db: AsyncSession = Depends(get_db)):
    """
    Mengembalikan snapshot singkat untuk semua 5 emiten:
    - Harga penutupan terakhir
    - Persentase perubahan hari ini
    - Sinyal prediksi model aktif (Random Forest)
    """
    stocks_result = await db.execute(select(Stock).order_by(Stock.ticker))
    stocks = stocks_result.scalars().all()

    # Cari model aktif (is_active = True, algorithm = RANDOM_FOREST)
    active_exp_result = await db.execute(
        select(ModelExperiment)
        .where(ModelExperiment.is_active == True)
        .order_by(ModelExperiment.created_at.desc())
        .limit(1)
    )
    active_exp = active_exp_result.scalar_one_or_none()

    overview = []
    for stock in stocks:
        # Ambil 2 harga terakhir untuk hitung % change
        prices_result = await db.execute(
            select(DailyPrice)
            .where(DailyPrice.stock_id == stock.id)
            .order_by(DailyPrice.date.desc())
            .limit(2)
        )
        prices = prices_result.scalars().all()

        last_close = float(prices[0].close) if prices else None
        prev_close = float(prices[1].close) if len(prices) > 1 else None
        change_pct = None
        if last_close and prev_close:
            change_pct = round(((last_close - prev_close) / prev_close) * 100, 2)

        # Ambil prediksi terbaru dari model aktif
        signal = None
        probability = None
        if active_exp:
            pred_result = await db.execute(
                select(Prediction)
                .where(
                    Prediction.stock_id == stock.id,
                    Prediction.experiment_id == active_exp.id,
                )
                .order_by(Prediction.prediction_date.desc())
                .limit(1)
            )
            pred = pred_result.scalar_one_or_none()
            if pred:
                signal = "NAIK" if pred.predicted_class == 1 else "STAGNAN/TURUN"
                probability = float(pred.probability) if pred.probability else None

        overview.append(MarketOverviewItem(
            ticker=stock.ticker,
            company_name=stock.company_name,
            last_close=last_close,
            change_pct=change_pct,
            signal=signal,
            probability=probability,
        ))

    return overview
