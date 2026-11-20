"""
Backfill Script — Isi data harga + prediksi yang terlewat
Jalankan dari folder backend/:
  python app/ml/backfill_predictions.py

Alur:
1. Fetch harga terbaru (Nov 11-hari ini) dari Yahoo Finance untuk 5 saham
2. Simpan harga baru ke daily_prices
3. Hitung indikator teknikal untuk harga baru
4. Generate prediksi untuk setiap hari kerja yang belum ada prediksinya
5. Update actual_class untuk prediksi yang sudah lewat tanggalnya
"""
import sys
import os
import logging
from datetime import date, datetime, timedelta
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import yfinance as yf
import ta

# Setup path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
os.chdir(Path(__file__).parent.parent.parent)  # cd ke backend/

from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from app.db.models import Stock, DailyPrice, TechnicalIndicator, ModelExperiment, Prediction
from app.ml.features.engineering import compute_indicators, FEATURE_COLS
from app.core.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

FEATURE_COLS_ORDERED = [
    "rsi_14", "macd_line", "macd_signal", "macd_histogram",
    "sma_20", "sma_50", "ema_20",
    "bb_upper", "bb_middle", "bb_lower",
    "stoch_k", "stoch_d", "atr_14", "obv"
]

def safe_float(val):
    if val is None: return None
    try:
        f = float(val)
        return None if (np.isnan(f) or np.isinf(f)) else f
    except: return None

def next_business_day(d: date) -> date:
    nd = d + timedelta(days=1)
    while nd.weekday() >= 5:
        nd += timedelta(days=1)
    return nd

def fetch_yahoo(ticker_jk: str, start: date, end: date) -> pd.DataFrame:
    """Fetch OHLCV dari Yahoo Finance untuk rentang tanggal tertentu."""
    logger.info(f"  Fetching {ticker_jk} dari {start} s/d {end}")
    df = yf.download(
        ticker_jk,
        start=start.strftime("%Y-%m-%d"),
        end=(end + timedelta(days=1)).strftime("%Y-%m-%d"),
        progress=False,
        auto_adjust=True
    )
    if df is None or df.empty:
        logger.warning(f"  Tidak ada data untuk {ticker_jk}")
        return pd.DataFrame()
    
    # Flatten MultiIndex
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [col[0].lower() for col in df.columns]
    else:
        df.columns = [c.lower() for c in df.columns]
    
    df = df.reset_index()
    df = df.rename(columns={
        "date": "date", "open": "open", "high": "high",
        "low": "low", "close": "close", "volume": "volume"
    })
    # Pastikan kolom date ada
    if "Date" in df.columns:
        df = df.rename(columns={"Date": "date"})
    
    df["date"] = pd.to_datetime(df["date"]).dt.date
    return df[["date", "open", "high", "low", "close", "volume"]].dropna(subset=["close"])


def step1_fetch_and_save_prices(session: Session):
    """Fetch harga baru dari Yahoo Finance dan simpan ke DB."""
    logger.info("=" * 60)
    logger.info("STEP 1: Fetch harga terbaru dari Yahoo Finance")
    
    stocks = session.execute(select(Stock)).scalars().all()
    today = date.today()
    
    total_inserted = 0
    for stock in stocks:
        # Cek tanggal terakhir di DB
        last_price = session.execute(
            select(DailyPrice.date)
            .where(DailyPrice.stock_id == stock.id)
            .order_by(DailyPrice.date.desc())
            .limit(1)
        ).scalar_one_or_none()
        
        if last_price is None:
            logger.warning(f"  {stock.ticker}: tidak ada data sama sekali, skip")
            continue
        
        fetch_start = last_price + timedelta(days=1)
        if fetch_start > today:
            logger.info(f"  {stock.ticker}: sudah up-to-date (last={last_price})")
            continue
        
        df = fetch_yahoo(stock.ticker, fetch_start, today)
        if df.empty:
            logger.warning(f"  {stock.ticker}: tidak ada data baru")
            continue
        
        # Ambil tanggal yang sudah ada di DB (hindari duplikat)
        existing_dates = {
            str(d) for d in session.execute(
                select(DailyPrice.date)
                .where(DailyPrice.stock_id == stock.id)
            ).scalars().all()
        }
        
        inserted = 0
        for _, row in df.iterrows():
            d_str = str(row["date"])
            if d_str in existing_dates:
                continue
            session.add(DailyPrice(
                stock_id=stock.id,
                date=row["date"],
                open=safe_float(row.get("open")),
                high=safe_float(row.get("high")),
                low=safe_float(row.get("low")),
                close=safe_float(row.get("close")),
                volume=int(row["volume"]) if pd.notna(row.get("volume")) else 0,
            ))
            existing_dates.add(d_str)
            inserted += 1
        
        session.commit()
        logger.info(f"  {stock.ticker}: +{inserted} harga baru (sampai {df['date'].max()})")
        total_inserted += inserted
    
    logger.info(f"STEP 1 selesai: total {total_inserted} harga baru disimpan")
    return total_inserted


def step2_compute_indicators(session: Session):
    """Hitung indikator teknikal untuk harga yang belum ada indikatornya."""
    logger.info("=" * 60)
    logger.info("STEP 2: Hitung indikator teknikal")
    
    stocks = session.execute(select(Stock)).scalars().all()
    total_inserted = 0
    
    for stock in stocks:
        # Load semua harga dari DB
        prices = session.execute(
            select(DailyPrice)
            .where(DailyPrice.stock_id == stock.id)
            .order_by(DailyPrice.date)
        ).scalars().all()
        
        if not prices:
            continue
        
        price_df = pd.DataFrame([{
            "id": p.id, "date": p.date,
            "open": float(p.open) if p.open else 0,
            "high": float(p.high) if p.high else 0,
            "low": float(p.low) if p.low else 0,
            "close": float(p.close),
            "volume": int(p.volume) if p.volume else 0,
        } for p in prices])
        
        # Hitung indikator
        indicator_df = compute_indicators(price_df.copy(), threshold=0.0)
        
        # Ambil price_id yang sudah punya indikator
        all_price_ids = [int(r["id"]) for _, r in indicator_df.iterrows()]
        existing_ids = set(
            session.execute(
                select(TechnicalIndicator.price_id)
                .where(TechnicalIndicator.price_id.in_(all_price_ids))
            ).scalars().all()
        )
        
        inserted = 0
        for _, row in indicator_df.iterrows():
            pid = int(row["id"])
            if pid in existing_ids:
                continue
            session.add(TechnicalIndicator(
                price_id=pid,
                rsi_14=safe_float(row.get("rsi_14")),
                macd_line=safe_float(row.get("macd_line")),
                macd_signal=safe_float(row.get("macd_signal")),
                macd_histogram=safe_float(row.get("macd_histogram")),
                sma_20=safe_float(row.get("sma_20")),
                sma_50=safe_float(row.get("sma_50")),
                ema_20=safe_float(row.get("ema_20")),
                bb_upper=safe_float(row.get("bb_upper")),
                bb_middle=safe_float(row.get("bb_middle")),
                bb_lower=safe_float(row.get("bb_lower")),
                stoch_k=safe_float(row.get("stoch_k")),
                stoch_d=safe_float(row.get("stoch_d")),
                atr_14=safe_float(row.get("atr_14")),
                obv=int(row["obv"]) if pd.notna(row.get("obv")) else None,
                target=int(row["target"]) if pd.notna(row.get("target")) else None,
            ))
            inserted += 1
        
        session.commit()
        logger.info(f"  {stock.ticker}: +{inserted} indikator baru")
        total_inserted += inserted
    
    logger.info(f"STEP 2 selesai: total {total_inserted} indikator baru")
    return total_inserted


def step3_generate_missing_predictions(session: Session):
    """Generate prediksi untuk semua tanggal kerja yang belum ada prediksinya."""
    logger.info("=" * 60)
    logger.info("STEP 3: Generate prediksi untuk tanggal yang terlewat")
    
    stocks = session.execute(select(Stock)).scalars().all()
    
    # Ambil semua model (1 per algoritma, terbaru)
    all_exps = session.execute(
        select(ModelExperiment).order_by(ModelExperiment.created_at.desc())
    ).scalars().all()
    
    seen_algos = {}
    for exp in all_exps:
        if exp.algorithm not in seen_algos:
            seen_algos[exp.algorithm] = exp
    
    experiments = list(seen_algos.values())
    logger.info(f"  Menggunakan {len(experiments)} model: {[e.algorithm for e in experiments]}")
    
    # Load semua model ke cache
    model_cache = {}
    for exp in experiments:
        try:
            model_path = Path("saved_models") / Path(exp.model_file_path).name
            if not model_path.exists():
                model_path = Path(exp.model_file_path)
            model_cache[exp.id] = joblib.load(str(model_path))
            logger.info(f"  Model loaded: {exp.algorithm}")
        except Exception as e:
            logger.error(f"  Gagal load {exp.algorithm}: {e}")
    
    today = date.today()
    total_new = 0
    
    for stock in stocks:
        logger.info(f"  Processing {stock.ticker}...")
        
        # Load semua fitur dari DB (semua harga + indikator)
        rows = session.execute(
            text("""
                SELECT dp.date, dp.id as price_id, dp.close,
                       ti.rsi_14, ti.macd_line, ti.macd_signal, ti.macd_histogram,
                       ti.sma_20, ti.sma_50, ti.ema_20,
                       ti.bb_upper, ti.bb_middle, ti.bb_lower,
                       ti.stoch_k, ti.stoch_d, ti.atr_14, ti.obv
                FROM daily_prices dp
                JOIN technical_indicators ti ON ti.price_id = dp.id
                WHERE dp.stock_id = :sid
                ORDER BY dp.date
            """),
            {"sid": stock.id}
        ).fetchall()
        
        if not rows:
            logger.warning(f"  {stock.ticker}: tidak ada fitur di DB")
            continue
        
        # Konversi ke dict: date → features
        date_features = {}
        for row in rows:
            # d bisa berupa string "2026-11-10" atau objek date
            d = row[0]
            if isinstance(d, str):
                d = datetime.strptime(d, "%Y-%m-%d").date()
            features = [safe_float(row[i+3]) or 0.0 for i in range(len(FEATURE_COLS_ORDERED))]
            date_features[d] = {"close": safe_float(row[2]), "features": features}
        
        # Ambil semua tanggal harga yang ada
        all_dates = sorted(date_features.keys())
        
        for exp in experiments:
            if exp.id not in model_cache:
                continue
            
            model = model_cache[exp.id]
            
            # Ambil prediksi yang sudah ada
            existing_pred_dates = {
                str(d) for d in session.execute(
                    select(Prediction.prediction_date)
                    .where(Prediction.stock_id == stock.id)
                    .where(Prediction.experiment_id == exp.id)
                ).scalars().all()
            }
            
            new_preds = 0
            # Untuk setiap tanggal harga, buat prediksi untuk hari berikutnya
            for price_date in all_dates:
                pred_date = next_business_day(price_date)
                pred_date_str = str(pred_date)
                
                # Skip jika prediksi sudah ada atau pred_date > hari ini
                if pred_date_str in existing_pred_dates:
                    continue
                if pred_date > today:
                    continue
                # Hanya backfill dari 11 Nov ke hari ini
                if pred_date < date(2026, 11, 11):
                    continue
                
                features = date_features[price_date]["features"]
                
                # Skip jika semua fitur = 0 (data tidak valid)
                if all(f == 0.0 for f in features):
                    continue
                
                X = np.array([features])
                try:
                    predicted_class = int(model.predict(X)[0])
                    probability = None
                    try:
                        probability = float(model.predict_proba(X)[0][1])
                    except: pass
                    
                    session.add(Prediction(
                        stock_id=stock.id,
                        experiment_id=exp.id,
                        prediction_date=pred_date,
                        predicted_class=predicted_class,
                        probability=probability,
                    ))
                    existing_pred_dates.add(pred_date)
                    new_preds += 1
                except Exception as e:
                    logger.error(f"    Error prediksi {pred_date}: {e}")
            
            if new_preds > 0:
                logger.info(f"    {exp.algorithm}: +{new_preds} prediksi baru")
                total_new += new_preds
        
        session.commit()
    
    logger.info(f"STEP 3 selesai: total {total_new} prediksi baru")
    return total_new


def step4_update_actual_classes(session: Session):
    """Update actual_class untuk prediksi yang tanggalnya sudah lewat."""
    logger.info("=" * 60)
    logger.info("STEP 4: Update actual_class untuk prediksi yang sudah lewat")
    
    today = date.today()
    updated = 0
    
    # Ambil semua prediksi yang belum ada actual_class dan tanggalnya <= hari ini
    preds = session.execute(
        select(Prediction)
        .where(Prediction.actual_class.is_(None))
        .where(Prediction.prediction_date <= today)
    ).scalars().all()
    
    logger.info(f"  Ditemukan {len(preds)} prediksi yang perlu di-update")
    
    for pred in preds:
        # Harga aktual pada prediction_date
        actual_price = session.execute(
            select(DailyPrice.close, DailyPrice.date)
            .where(DailyPrice.stock_id == pred.stock_id)
            .where(DailyPrice.date == pred.prediction_date)
        ).first()
        
        if not actual_price:
            continue  # Harga belum tersedia (weekend/libur)
        
        # Harga sehari sebelum prediction_date
        prev_price = session.execute(
            select(DailyPrice.close)
            .where(DailyPrice.stock_id == pred.stock_id)
            .where(DailyPrice.date < pred.prediction_date)
            .order_by(DailyPrice.date.desc())
            .limit(1)
        ).scalar_one_or_none()
        
        if prev_price is None:
            continue
        
        actual_close = float(actual_price[0])
        prev_close   = float(prev_price)
        
        pred.actual_class = 1 if actual_close > prev_close else 0
        updated += 1
    
    session.commit()
    logger.info(f"STEP 4 selesai: {updated} actual_class di-update")
    return updated


def main():
    logger.info("🚀 Backfill dimulai: " + datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    
    # Buat engine synchronous (script standalone, bukan async)
    db_url = str(settings.DATABASE_URL).replace("sqlite+aiosqlite", "sqlite")
    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    
    with Session(engine) as session:
        n1 = step1_fetch_and_save_prices(session)
        n2 = step2_compute_indicators(session)
        n3 = step3_generate_missing_predictions(session)
        n4 = step4_update_actual_classes(session)
    
    logger.info("=" * 60)
    logger.info(f"✅ Backfill selesai!")
    logger.info(f"   Harga baru:      {n1}")
    logger.info(f"   Indikator baru:  {n2}")
    logger.info(f"   Prediksi baru:   {n3}")
    logger.info(f"   Aktual di-update:{n4}")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
