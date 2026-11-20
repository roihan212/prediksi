"""
Stocks Endpoints — GET /api/v1/stocks
"""
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import DailyPrice, Stock, TechnicalIndicator
from app.schemas.stock import StockOut, PriceOut, IndicatorOut

router = APIRouter()


def _ticker_variants(ticker: str):
    t = ticker.upper()
    return [t, f"{t}.JK"] if not t.endswith(".JK") else [t, t[:-3]]


@router.get("/", response_model=List[StockOut], summary="Daftar semua emiten")
async def list_stocks(db: AsyncSession = Depends(get_db)):
    """Mengembalikan daftar 5 emiten perbankan BEI."""
    result = await db.execute(select(Stock).order_by(Stock.ticker))
    return result.scalars().all()


@router.get("/{ticker}", response_model=StockOut, summary="Detail satu emiten")
async def get_stock(ticker: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Stock).where(Stock.ticker.in_(_ticker_variants(ticker)))
    )
    stock = result.scalar_one_or_none()
    if not stock:
        raise HTTPException(status_code=404, detail=f"Ticker {ticker} tidak ditemukan")
    return stock


@router.get("/{ticker}/prices", response_model=List[PriceOut], summary="Harga historis OHLCV")
async def get_prices(
    ticker: str,
    start: Optional[date] = Query(None, description="Tanggal mulai (YYYY-MM-DD)"),
    end: Optional[date] = Query(None, description="Tanggal akhir (YYYY-MM-DD)"),
    limit: int = Query(500, le=2000, description="Maks jumlah baris"),
    db: AsyncSession = Depends(get_db),
):
    """Mengembalikan data harga historis OHLCV untuk satu emiten."""
    # Cari stock_id
    stock_result = await db.execute(
        select(Stock).where(Stock.ticker.in_(_ticker_variants(ticker)))
    )
    stock = stock_result.scalar_one_or_none()
    if not stock:
        raise HTTPException(status_code=404, detail=f"Ticker {ticker} tidak ditemukan")

    query = (
        select(DailyPrice)
        .where(DailyPrice.stock_id == stock.id)
        .order_by(DailyPrice.date.desc())
        .limit(limit)
    )
    if start:
        query = query.where(DailyPrice.date >= start)
    if end:
        query = query.where(DailyPrice.date <= end)

    result = await db.execute(query)
    prices = result.scalars().all()
    return sorted(prices, key=lambda p: p.date)


@router.get("/{ticker}/indicators", response_model=List[IndicatorOut], summary="Indikator teknikal")
async def get_indicators(
    ticker: str,
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Mengembalikan indikator teknikal terbaru untuk satu emiten."""
    stock_result = await db.execute(
        select(Stock).where(Stock.ticker.in_(_ticker_variants(ticker)))
    )
    stock = stock_result.scalar_one_or_none()
    if not stock:
        raise HTTPException(status_code=404, detail=f"Ticker {ticker} tidak ditemukan")

    result = await db.execute(
        select(TechnicalIndicator, DailyPrice.date)
        .join(DailyPrice, TechnicalIndicator.price_id == DailyPrice.id)
        .where(DailyPrice.stock_id == stock.id)
        .order_by(DailyPrice.date.desc())
        .limit(limit)
    )
    rows = result.all()

    indicators = []
    for ind, d in sorted(rows, key=lambda r: r[1]):
        indicators.append(IndicatorOut(
            date=d,
            rsi_14=ind.rsi_14,
            macd_line=ind.macd_line,
            macd_signal=ind.macd_signal,
            macd_histogram=ind.macd_histogram,
            sma_20=ind.sma_20,
            sma_50=ind.sma_50,
            ema_20=ind.ema_20,
            bb_upper=ind.bb_upper,
            bb_middle=ind.bb_middle,
            bb_lower=ind.bb_lower,
            stoch_k=ind.stoch_k,
            stoch_d=ind.stoch_d,
            atr_14=ind.atr_14,
        ))
    return indicators
