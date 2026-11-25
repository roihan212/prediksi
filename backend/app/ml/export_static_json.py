"""
Export Static JSON Snapshot for GitHub Pages (Offline / Serverless Fallback)
Jalankan dari folder backend/:
  python app/ml/export_static_json.py

Menghasilkan file JSON di ../frontend/data/ agar website di GitHub Pages
tetap menampilkan seluruh data, grafik, prediksi, backtesting, indikator,
eksperimen ML, dan sentimen berita walaupun server backend lokal sedang mati.
"""
import asyncio
import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
os.chdir(Path(__file__).parent.parent.parent)

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import DailyPrice, ModelExperiment, Prediction, Stock, TechnicalIndicator
from app.api.v1.endpoints.news import fetch_google_news

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

OUTPUT_DIR = Path("../frontend/data")


def _sf(val):
    if val is None:
        return None
    try:
        f = float(val)
        return None if (f != f) else f
    except Exception:
        return None


def export_all_sync(session: Session):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    stocks = session.execute(select(Stock).order_by(Stock.ticker)).scalars().all()
    experiments = session.execute(
        select(ModelExperiment).order_by(ModelExperiment.created_at.desc())
    ).scalars().all()

    active_exp = next((e for e in experiments if e.is_active), None)
    if not active_exp:
        active_exp = next((e for e in experiments if e.algorithm == "RANDOM_FOREST"), experiments[0] if experiments else None)

    # 1. stocks_list.json
    stocks_data = [
        {
            "id": s.id,
            "ticker": s.ticker,
            "company_name": s.company_name,
            "sector": s.sector,
        }
        for s in stocks
    ]
    (OUTPUT_DIR / "stocks_list.json").write_text(json.dumps(stocks_data, indent=2), encoding="utf-8")

    # 2. experiments.json
    exps_data = []
    for e in experiments:
        exps_data.append({
            "id": e.id,
            "experiment_name": e.experiment_name,
            "algorithm": e.algorithm,
            "ticker": getattr(e, "ticker", None),
            "parameters": e.parameters,
            "accuracy": _sf(e.accuracy),
            "precision": _sf(e.precision),
            "recall": _sf(e.recall),
            "f1_score": _sf(e.f1_score),
            "auc_roc": _sf(e.auc_roc),
            "confusion_matrix": e.confusion_matrix,
            "feature_importance": e.feature_importance,
            "win_rate": _sf(e.win_rate),
            "max_drawdown": _sf(e.max_drawdown),
            "profitability_factor": _sf(e.profitability_factor),
            "is_active": e.is_active,
            "train_start_date": str(e.train_start_date) if e.train_start_date else None,
            "train_end_date": str(e.train_end_date) if e.train_end_date else None,
            "created_at": str(e.created_at) if e.created_at else None,
            "notes": getattr(e, "notes", None),
        })
    (OUTPUT_DIR / "experiments.json").write_text(json.dumps(exps_data, indent=2), encoding="utf-8")

    # 3. market_overview.json & per-stock data
    market_overview = []

    for s in stocks:
        short_ticker = s.ticker.replace(".JK", "").upper()

        # Prices (last 500 days, sorted asc)
        prices = session.execute(
            select(DailyPrice)
            .where(DailyPrice.stock_id == s.id)
            .order_by(DailyPrice.date.desc())
            .limit(500)
        ).scalars().all()
        prices_sorted = sorted(prices, key=lambda p: p.date)

        prices_json = [
            {
                "date": str(p.date),
                "open": _sf(p.open),
                "high": _sf(p.high),
                "low": _sf(p.low),
                "close": _sf(p.close),
                "volume": int(p.volume) if p.volume is not None else 0,
            }
            for p in prices_sorted
        ]
        (OUTPUT_DIR / f"prices_{short_ticker}.json").write_text(json.dumps(prices_json), encoding="utf-8")

        # Stock detail
        stock_detail = {
            "id": s.id,
            "ticker": s.ticker,
            "company_name": s.company_name,
            "sector": s.sector,
        }
        (OUTPUT_DIR / f"stock_{short_ticker}.json").write_text(json.dumps(stock_detail, indent=2), encoding="utf-8")

        # Indicators (last 200 days, sorted asc)
        ind_rows = session.execute(
            select(TechnicalIndicator, DailyPrice.date)
            .join(DailyPrice, TechnicalIndicator.price_id == DailyPrice.id)
            .where(DailyPrice.stock_id == s.id)
            .order_by(DailyPrice.date.desc())
            .limit(200)
        ).all()
        ind_sorted = sorted(ind_rows, key=lambda r: r[1])
        ind_json = [
            {
                "date": str(d),
                "rsi_14": _sf(ti.rsi_14),
                "macd_line": _sf(ti.macd_line),
                "macd_signal": _sf(ti.macd_signal),
                "macd_histogram": _sf(ti.macd_histogram),
                "sma_20": _sf(ti.sma_20),
                "sma_50": _sf(ti.sma_50),
                "ema_20": _sf(ti.ema_20),
                "bb_upper": _sf(ti.bb_upper),
                "bb_middle": _sf(ti.bb_middle),
                "bb_lower": _sf(ti.bb_lower),
                "stoch_k": _sf(ti.stoch_k),
                "stoch_d": _sf(ti.stoch_d),
                "atr_14": _sf(ti.atr_14),
                "obv": int(ti.obv) if ti.obv is not None else None,
            }
            for ti, d in ind_sorted
        ]
        (OUTPUT_DIR / f"indicators_{short_ticker}.json").write_text(json.dumps(ind_json), encoding="utf-8")

        # Latest predictions per algorithm
        latest_preds = []
        seen_algos = set()
        for exp in experiments:
            if exp.algorithm in seen_algos:
                continue
            pred = session.execute(
                select(Prediction)
                .where(Prediction.stock_id == s.id, Prediction.experiment_id == exp.id)
                .order_by(Prediction.prediction_date.desc())
                .limit(1)
            ).scalar_one_or_none()
            if pred:
                latest_preds.append({
                    "algorithm": exp.algorithm,
                    "experiment_name": exp.experiment_name,
                    "prediction_date": str(pred.prediction_date),
                    "predicted_class": pred.predicted_class,
                    "signal": "NAIK" if pred.predicted_class == 1 else "STAGNAN/TURUN",
                    "probability": _sf(pred.probability),
                    "actual_class": pred.actual_class,
                    "latest_close": prices_json[-1]["close"] if prices_json else None,
                    "latest_date": prices_json[-1]["date"] if prices_json else None,
                })
                seen_algos.add(exp.algorithm)
        (OUTPUT_DIR / f"pred_latest_{short_ticker}.json").write_text(json.dumps(latest_preds, indent=2), encoding="utf-8")

        # Prediction history (last 600 rows across all algos, desc)
        hist_rows = session.execute(
            select(Prediction, ModelExperiment.algorithm, ModelExperiment.experiment_name)
            .join(ModelExperiment, Prediction.experiment_id == ModelExperiment.id)
            .where(Prediction.stock_id == s.id)
            .order_by(Prediction.prediction_date.desc())
            .limit(600)
        ).all()
        hist_json = [
            {
                "algorithm": alg,
                "experiment_name": exp_name,
                "prediction_date": str(pred.prediction_date),
                "predicted_class": pred.predicted_class,
                "signal": "NAIK" if pred.predicted_class == 1 else "STAGNAN/TURUN",
                "probability": _sf(pred.probability),
                "actual_class": pred.actual_class,
            }
            for pred, alg, exp_name in hist_rows
        ]
        (OUTPUT_DIR / f"pred_history_{short_ticker}.json").write_text(json.dumps(hist_json), encoding="utf-8")

        # Market overview entry
        last_close = prices_json[-1]["close"] if prices_json else None
        prev_close = prices_json[-2]["close"] if len(prices_json) >= 2 else last_close
        change_pct = round(((last_close - prev_close) / prev_close) * 100, 2) if (last_close and prev_close) else 0.0

        active_pred = next((p for p in latest_preds if active_exp and p["algorithm"] == active_exp.algorithm), None)
        if not active_pred and latest_preds:
            active_pred = latest_preds[0]

        market_overview.append({
            "ticker": s.ticker,
            "company_name": s.company_name,
            "last_close": last_close,
            "change_pct": change_pct,
            "signal": active_pred["signal"] if active_pred else "STAGNAN/TURUN",
            "probability": active_pred["probability"] if active_pred else None,
        })

        logger.info(f"Exported JSON data for {short_ticker}")

    (OUTPUT_DIR / "market_overview.json").write_text(json.dumps(market_overview, indent=2), encoding="utf-8")

    # Metadata
    meta = {"exported_at": datetime.now().isoformat()}
    (OUTPUT_DIR / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    logger.info("Static JSON export (DB) selesai.")


async def export_news():
    tickers = ["BBCA", "BBRI", "BBNI", "BMRI", "BRIS"]
    for t in tickers:
        try:
            news = await fetch_google_news(t, max_items=6)
            scores = [n["sentiment_score"] for n in news]
            avg_score = sum(scores) / len(scores) if scores else 0.0
            pos_count = sum(1 for n in news if n["sentiment_label"] == "POSITIF")
            neg_count = sum(1 for n in news if n["sentiment_label"] == "NEGATIF")
            net_count = sum(1 for n in news if n["sentiment_label"] == "NETRAL")

            if avg_score >= 0.15:
                overall_label, status_color = "BULLISH / POSITIF", "green"
            elif avg_score <= -0.15:
                overall_label, status_color = "BEARISH / NEGATIF", "red"
            else:
                overall_label, status_color = "NETRAL / KONSOLIDASI", "yellow"

            payload = {
                "ticker": t,
                "overall_sentiment": overall_label,
                "sentiment_score": round(avg_score, 2),
                "status_color": status_color,
                "distribution": {
                    "positif": pos_count,
                    "negatif": neg_count,
                    "netral": net_count,
                    "total_news": len(news),
                },
                "articles": news,
            }
            (OUTPUT_DIR / f"news_{t}.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
            logger.info(f"Exported news JSON for {t} ({len(news)} articles)")
        except Exception as e:
            logger.warning(f"Failed exporting news for {t}: {e}")


def main():
    db_url = str(settings.DATABASE_URL).replace("sqlite+aiosqlite", "sqlite")
    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    with Session(engine) as session:
        export_all_sync(session)
    asyncio.run(export_news())


if __name__ == "__main__":
    main()
