"""Pydantic Schemas untuk Stock & Price responses"""
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel


class StockOut(BaseModel):
    id: int
    ticker: str
    company_name: str
    sector: Optional[str] = None

    class Config:
        from_attributes = True


class PriceOut(BaseModel):
    id: int
    date: date
    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    close: float
    volume: Optional[int] = None
    adjusted_close: Optional[float] = None

    class Config:
        from_attributes = True


class IndicatorOut(BaseModel):
    date: date
    rsi_14: Optional[float] = None
    macd_line: Optional[float] = None
    macd_signal: Optional[float] = None
    macd_histogram: Optional[float] = None
    sma_20: Optional[float] = None
    sma_50: Optional[float] = None
    ema_20: Optional[float] = None
    bb_upper: Optional[float] = None
    bb_middle: Optional[float] = None
    bb_lower: Optional[float] = None
    stoch_k: Optional[float] = None
    stoch_d: Optional[float] = None
    atr_14: Optional[float] = None

    class Config:
        from_attributes = True
