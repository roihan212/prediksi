"""Schemas untuk Market Overview"""
from typing import Optional
from pydantic import BaseModel


class MarketOverviewItem(BaseModel):
    ticker: str
    company_name: str
    last_close: Optional[float] = None
    change_pct: Optional[float] = None
    signal: Optional[str] = None        # "NAIK" | "STAGNAN/TURUN" | None
    probability: Optional[float] = None

    class Config:
        from_attributes = True
