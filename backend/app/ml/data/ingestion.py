"""
Data Ingestion Module
Fetch data historis OHLCV dari Yahoo Finance untuk 5 emiten perbankan BEI.
"""
import logging
from datetime import date, datetime, timedelta
from typing import Optional

import pandas as pd
import yfinance as yf
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.config import settings

logger = logging.getLogger(__name__)


EMITEN_MAP = {
    "BBCA.JK": {"company_name": "Bank Central Asia", "sector": "Perbankan"},
    "BBRI.JK": {"company_name": "Bank Rakyat Indonesia", "sector": "Perbankan"},
    "BBNI.JK": {"company_name": "Bank Negara Indonesia", "sector": "Perbankan"},
    "BMRI.JK": {"company_name": "Bank Mandiri", "sector": "Perbankan"},
    "BRIS.JK": {"company_name": "BRI Syariah", "sector": "Perbankan"},
}


def fetch_ohlcv(ticker: str, period: str = "10y") -> pd.DataFrame:
    """
    Fetch OHLCV data dari Yahoo Finance.
    Returns DataFrame dengan kolom: Date, Open, High, Low, Close, Volume, Adj Close
    """
    logger.info(f"Fetching data for {ticker} (period={period})")
    try:
        tk = yf.Ticker(ticker)
        df = tk.history(period=period, auto_adjust=False)

        if df.empty:
            logger.warning(f"No data returned for {ticker}")
            return pd.DataFrame()

        df = df.reset_index()
        df.columns = [c.lower().replace(" ", "_") for c in df.columns]

        # Pastikan kolom yang dibutuhkan ada
        required = {"date", "open", "high", "low", "close", "volume"}
        if not required.issubset(set(df.columns)):
            logger.error(f"Missing columns for {ticker}: {df.columns.tolist()}")
            return pd.DataFrame()

        # Normalize date (hilangkan timezone)
        df["date"] = pd.to_datetime(df["date"]).dt.date

        # Pilih kolom utama
        cols = ["date", "open", "high", "low", "close", "volume"]
        if "adj_close" in df.columns:
            cols.append("adj_close")

        df = df[cols].dropna(subset=["close"])
        logger.info(f"Fetched {len(df)} rows for {ticker}")
        return df

    except Exception as e:
        logger.error(f"Error fetching {ticker}: {e}")
        return pd.DataFrame()


def save_prices_to_db(
    session: Session, stock_id: int, df: pd.DataFrame
) -> int:
    """
    Simpan data harga ke DB dengan upsert (skip jika sudah ada).
    Returns jumlah baris yang diinsert.
    """
    from app.db.models import DailyPrice

    if df.empty:
        return 0

    existing_dates = set(
        session.execute(
            select(DailyPrice.date).where(DailyPrice.stock_id == stock_id)
        ).scalars().all()
    )

    inserted = 0
    for _, row in df.iterrows():
        if row["date"] in existing_dates:
            continue

        price = DailyPrice(
            stock_id=stock_id,
            date=row["date"],
            open=float(row["open"]) if pd.notna(row.get("open")) else None,
            high=float(row["high"]) if pd.notna(row.get("high")) else None,
            low=float(row["low"]) if pd.notna(row.get("low")) else None,
            close=float(row["close"]),
            volume=int(row["volume"]) if pd.notna(row.get("volume")) else None,
            adjusted_close=float(row["adj_close"]) if pd.notna(row.get("adj_close", None)) else None,
        )
        session.add(price)
        existing_dates.add(row["date"])
        inserted += 1

    session.commit()
    logger.info(f"Inserted {inserted} new price rows for stock_id={stock_id}")
    return inserted


def seed_stocks(session: Session) -> dict:
    """
    Seed 5 emiten ke tabel stocks jika belum ada.
    Returns mapping ticker → stock_id
    """
    from app.db.models import Stock

    ticker_id_map = {}
    for ticker, info in EMITEN_MAP.items():
        existing = session.execute(
            select(Stock).where(Stock.ticker == ticker)
        ).scalar_one_or_none()

        if existing is None:
            stock = Stock(
                ticker=ticker,
                company_name=info["company_name"],
                sector=info["sector"],
            )
            session.add(stock)
            session.flush()
            ticker_id_map[ticker] = stock.id
            logger.info(f"Seeded stock: {ticker}")
        else:
            ticker_id_map[ticker] = existing.id

    session.commit()
    return ticker_id_map


def run_full_ingestion(session: Session, period: str = "10y") -> dict:
    """
    Main function: seed stocks + fetch + simpan semua data.
    """
    logger.info("=== Starting full data ingestion ===")
    ticker_id_map = seed_stocks(session)
    results = {}

    for ticker, stock_id in ticker_id_map.items():
        df = fetch_ohlcv(ticker, period=period)
        count = save_prices_to_db(session, stock_id, df)
        results[ticker] = {"rows_inserted": count, "total_fetched": len(df)}

    logger.info(f"=== Ingestion complete: {results} ===")
    return results
