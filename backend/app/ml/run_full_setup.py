"""
Pipeline Setup Script:
1. Seed emiten (stocks)
2. Ingest 10 tahun data historis dari Yahoo Finance
3. Hitung indikator teknikal (RSI, MACD, BB, SMA, dll.)
4. Train Model ML (Random Forest, Decision Tree, Logistic Regression)
5. Generate prediksi harian untuk semua 5 emiten
"""
import sys
import logging
from datetime import datetime
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.db.models import Stock, DailyPrice, TechnicalIndicator, ModelExperiment, Prediction
from app.ml.data.ingestion import run_full_ingestion, seed_stocks
from app.ml.features.engineering import save_indicators_to_db, load_features_from_db
from app.ml.models.trainer import (
    train_model,
    save_experiment_to_db,
    ALGORITHM_FOREST,
    ALGORITHM_DECISION,
    ALGORITHM_LOGISTIC,
)
from app.ml.models.inference import predict_latest

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("PipelineSetup")

def main():
    print("=" * 60)
    print("🚀 MEMULAI PIPELINE SETUP: DATA INGESTION & MODEL TRAINING")
    print("=" * 60)

    engine = create_engine(settings.DATABASE_URL_SYNC)
    Session = sessionmaker(bind=engine)
    session = Session()

    # ─── 1. Ingestion Data Historis ──────────────────────────────
    print("\n[1/4] Mengunduh data historis 10 tahun dari Yahoo Finance...")
    ingest_res = run_full_ingestion(session, period="10y")
    for ticker, info in ingest_res.items():
        print(f"  ✓ {ticker}: {info['rows_inserted']} baris harga baru (Total: {info['total_fetched']})")

    # ─── 2. Hitung Indikator Teknikal ────────────────────────────
    print("\n[2/4] Menghitung indikator teknikal (RSI, MACD, BB, Stoch, dll.)...")
    stocks = session.execute(select(Stock)).scalars().all()
    for stock in stocks:
        count = save_indicators_to_db(session, stock.id)
        print(f"  ✓ {stock.ticker}: {count} baris indikator disimpan")

    # ─── 3. Training Model ────────────────────────────────────────
    print("\n[3/4] Melatih model Machine Learning...")
    df_features = load_features_from_db(session)
    print(f"  Data training tersedia: {len(df_features)} baris")

    models_to_train = [
        (ALGORITHM_FOREST, "Random Forest (Model Utama)", True),
        (ALGORITHM_DECISION, "Decision Tree (Baseline)", False),
        (ALGORITHM_LOGISTIC, "Logistic Regression (Linear Baseline)", False),
    ]

    saved_experiments = []
    for algo, exp_name, is_prod in models_to_train:
        print(f"\n  Training {algo}...")
        res = train_model(
            df_features,
            algorithm=algo,
            experiment_name=exp_name,
            use_grid_search=False,  # Cepat & optimal dengan baseline params
        )
        exp_id = save_experiment_to_db(session, res, notes="Inisialisasi pipeline otomatis")
        
        # Set status aktif jika model utama
        exp = session.get(ModelExperiment, exp_id)
        if exp:
            exp.is_active = is_prod
            session.commit()
            
        saved_experiments.append((exp_id, algo, is_prod))
        m = res["metrics"]
        print(f"  ✓ {exp_name} Selesai!")
        print(f"    - Accuracy : {m.get('accuracy', 0)*100:.2f}%")
        print(f"    - Precision: {m.get('precision', 0)*100:.2f}%")
        print(f"    - Recall   : {m.get('recall', 0)*100:.2f}%")
        print(f"    - F1-Score : {m.get('f1_score', 0)*100:.2f}%")
        if m.get("auc_roc"):
            print(f"    - AUC-ROC  : {m.get('auc_roc', 0):.4f}")

    # ─── 4. Generate Prediksi ────────────────────────────────────
    print("\n[4/4] Menghasilkan sinyal prediksi untuk 5 emiten...")
    for exp_id, algo, is_prod in saved_experiments:
        for stock in stocks:
            try:
                pred = predict_latest(session, stock.id, exp_id)
                if pred and is_prod:
                    print(f"  ✓ {stock.ticker} [{algo}]: Sinyal={pred['signal']} (Prob: {pred['probability']*100:.1f}%)")
            except Exception as e:
                logger.warning(f"Error predicting {stock.ticker} for {algo}: {e}")

    session.close()
    print("\n" + "=" * 60)
    print("✅ PIPELINE BERHASIL DISELESAIKAN!")
    print("=" * 60)

if __name__ == "__main__":
    main()

