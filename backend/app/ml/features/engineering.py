"""
Feature Engineering Module
Hitung 13 indikator teknikal dari data OHLCV dan buat label target biner.

Indikator yang dihitung:
- RSI(14)
- MACD (line, signal, histogram)
- SMA(20), SMA(50), EMA(20)
- Bollinger Bands (upper, middle, lower)
- Stochastic Oscillator (%K, %D)
- ATR(14)
- OBV (On-Balance Volume)

Target (Y):
- 1 = close[t+1] > close[t] * (1 + threshold)
- 0 = otherwise
"""
import logging
from typing import Optional

import numpy as np
import pandas as pd
import ta  # pip install ta (pure Python TA-Lib alternative)
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.config import settings

logger = logging.getLogger(__name__)


def compute_indicators(df: pd.DataFrame, threshold: float = 0.0) -> pd.DataFrame:
    """
    Hitung semua indikator teknikal dari DataFrame OHLCV.

    Args:
        df: DataFrame dengan kolom [date, open, high, low, close, volume]
        threshold: Threshold % kenaikan untuk label Y=1 (default 0.0 = naik apapun)

    Returns:
        DataFrame dengan kolom indikator + target label
    """
    df = df.copy().sort_values("date").reset_index(drop=True)

    close = df["close"].astype(float)
    high = df["high"].astype(float)
    low = df["low"].astype(float)
    volume = df["volume"].astype(float)

    # ─── RSI ──────────────────────────────────────────────
    df["rsi_14"] = ta.momentum.RSIIndicator(close=close, window=14).rsi()

    # ─── MACD ─────────────────────────────────────────────
    macd = ta.trend.MACD(close=close, window_slow=26, window_fast=12, window_sign=9)
    df["macd_line"] = macd.macd()
    df["macd_signal"] = macd.macd_signal()
    df["macd_histogram"] = macd.macd_diff()

    # ─── Moving Averages ───────────────────────────────────
    df["sma_20"] = ta.trend.SMAIndicator(close=close, window=20).sma_indicator()
    df["sma_50"] = ta.trend.SMAIndicator(close=close, window=50).sma_indicator()
    df["ema_20"] = ta.trend.EMAIndicator(close=close, window=20).ema_indicator()

    # ─── Bollinger Bands ───────────────────────────────────
    bb = ta.volatility.BollingerBands(close=close, window=20, window_dev=2)
    df["bb_upper"] = bb.bollinger_hband()
    df["bb_middle"] = bb.bollinger_mavg()
    df["bb_lower"] = bb.bollinger_lband()

    # ─── Stochastic Oscillator ─────────────────────────────
    stoch = ta.momentum.StochasticOscillator(
        high=high, low=low, close=close, window=14, smooth_window=3
    )
    df["stoch_k"] = stoch.stoch()
    df["stoch_d"] = stoch.stoch_signal()

    # ─── ATR ──────────────────────────────────────────────
    df["atr_14"] = ta.volatility.AverageTrueRange(
        high=high, low=low, close=close, window=14
    ).average_true_range()

    # ─── OBV ──────────────────────────────────────────────
    df["obv"] = ta.volume.OnBalanceVolumeIndicator(
        close=close, volume=volume
    ).on_balance_volume()

    # ─── Target Label ─────────────────────────────────────
    # Y[t] = 1 jika close[t+1] > close[t] * (1 + threshold), else 0
    # Shift(-1): close esok hari
    next_close = close.shift(-1)
    df["target"] = (next_close > close * (1 + threshold)).astype(int)

    # Row terakhir tidak memiliki target (tidak ada T+1) → hapus
    df = df.dropna(subset=["target"])

    logger.info(
        f"Computed indicators for {len(df)} rows. "
        f"Target dist: {df['target'].value_counts().to_dict()}"
    )
    return df


def save_indicators_to_db(
    session: Session,
    stock_id: int,
    df: Optional[pd.DataFrame] = None,
    threshold: float = 0.0
) -> int:
    """
    Hitung dan simpan indikator teknikal ke tabel technical_indicators.
    Hanya insert jika belum ada untuk price_id tersebut.

    Returns: jumlah baris yang diinsert
    """
    from app.db.models import DailyPrice, TechnicalIndicator

    # Ambil semua harga dari DB
    prices = session.execute(
        select(DailyPrice)
        .where(DailyPrice.stock_id == stock_id)
        .order_by(DailyPrice.date)
    ).scalars().all()

    if not prices:
        logger.warning(f"No price data for stock_id={stock_id}")
        return 0

    # Build DataFrame dari DB
    price_df = pd.DataFrame([
        {
            "id": p.id,
            "date": p.date,
            "open": float(p.open) if p.open else None,
            "high": float(p.high) if p.high else None,
            "low": float(p.low) if p.low else None,
            "close": float(p.close),
            "volume": int(p.volume) if p.volume else 0,
        }
        for p in prices
    ])

    # Hitung semua indikator
    indicator_df = compute_indicators(price_df, threshold=threshold)

    existing_price_ids = set(
        session.execute(
            select(TechnicalIndicator.price_id).where(
                TechnicalIndicator.price_id.in_([int(r["id"]) for _, r in indicator_df.iterrows()])
            )
        ).scalars().all()
    )

    inserted = 0
    for _, row in indicator_df.iterrows():
        price_id = int(row["id"])
        if price_id in existing_price_ids:
            continue

        ind = TechnicalIndicator(
            price_id=price_id,
            rsi_14=_safe_float(row.get("rsi_14")),
            macd_line=_safe_float(row.get("macd_line")),
            macd_signal=_safe_float(row.get("macd_signal")),
            macd_histogram=_safe_float(row.get("macd_histogram")),
            sma_20=_safe_float(row.get("sma_20")),
            sma_50=_safe_float(row.get("sma_50")),
            ema_20=_safe_float(row.get("ema_20")),
            bb_upper=_safe_float(row.get("bb_upper")),
            bb_middle=_safe_float(row.get("bb_middle")),
            bb_lower=_safe_float(row.get("bb_lower")),
            stoch_k=_safe_float(row.get("stoch_k")),
            stoch_d=_safe_float(row.get("stoch_d")),
            atr_14=_safe_float(row.get("atr_14")),
            obv=int(row["obv"]) if pd.notna(row.get("obv")) else None,
            target=int(row["target"]) if pd.notna(row.get("target")) else None,
        )
        session.add(ind)
        inserted += 1

    session.commit()
    logger.info(f"Saved {inserted} indicator rows for stock_id={stock_id}")
    return inserted


def load_features_from_db(
    session: Session,
    stock_id: Optional[int] = None,
    start_date=None,
    end_date=None
) -> pd.DataFrame:
    """
    Load fitur dari DB untuk training / inference.
    Returns DataFrame dengan semua kolom indikator + target.
    """
    from app.db.models import DailyPrice, TechnicalIndicator, Stock

    query = (
        select(
            DailyPrice.date,
            Stock.ticker,
            TechnicalIndicator.rsi_14,
            TechnicalIndicator.macd_line,
            TechnicalIndicator.macd_signal,
            TechnicalIndicator.macd_histogram,
            TechnicalIndicator.sma_20,
            TechnicalIndicator.sma_50,
            TechnicalIndicator.ema_20,
            TechnicalIndicator.bb_upper,
            TechnicalIndicator.bb_middle,
            TechnicalIndicator.bb_lower,
            TechnicalIndicator.stoch_k,
            TechnicalIndicator.stoch_d,
            TechnicalIndicator.atr_14,
            TechnicalIndicator.obv,
            TechnicalIndicator.target,
        )
        .join(DailyPrice, TechnicalIndicator.price_id == DailyPrice.id)
        .join(Stock, DailyPrice.stock_id == Stock.id)
    )

    if stock_id:
        query = query.where(DailyPrice.stock_id == stock_id)
    if start_date:
        query = query.where(DailyPrice.date >= start_date)
    if end_date:
        query = query.where(DailyPrice.date <= end_date)

    query = query.order_by(DailyPrice.date)
    rows = session.execute(query).fetchall()

    df = pd.DataFrame(rows, columns=[
        "date", "ticker",
        "rsi_14", "macd_line", "macd_signal", "macd_histogram",
        "sma_20", "sma_50", "ema_20",
        "bb_upper", "bb_middle", "bb_lower",
        "stoch_k", "stoch_d", "atr_14", "obv",
        "target"
    ])
    return df


# ─── Helpers ──────────────────────────────────────────────────
FEATURE_COLS = [
    "rsi_14", "macd_line", "macd_signal", "macd_histogram",
    "sma_20", "sma_50", "ema_20",
    "bb_upper", "bb_middle", "bb_lower",
    "stoch_k", "stoch_d", "atr_14", "obv"
]


def _safe_float(val) -> Optional[float]:
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None
    return float(val)
