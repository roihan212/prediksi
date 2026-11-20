"""
Database Models (SQLAlchemy ORM)
Sesuai blueprint schema: stocks, daily_prices, technical_indicators,
model_experiments, predictions
"""
from datetime import date, datetime
from typing import Optional
from sqlalchemy import (
    BigInteger, Boolean, Column, Date, DateTime, ForeignKey,
    Integer, Numeric, SmallInteger, String, Text, UniqueConstraint, JSON
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.database import Base


# ─── Table: stocks ────────────────────────────────────────────
class Stock(Base):
    __tablename__ = "stocks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(String(10), unique=True, nullable=False, index=True)
    company_name = Column(String(100), nullable=False)
    sector = Column(String(50), default="Perbankan")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    daily_prices = relationship("DailyPrice", back_populates="stock", lazy="dynamic")
    predictions = relationship("Prediction", back_populates="stock", lazy="dynamic")

    def __repr__(self):
        return f"<Stock {self.ticker}>"


# ─── Table: daily_prices ─────────────────────────────────────
class DailyPrice(Base):
    __tablename__ = "daily_prices"
    __table_args__ = (
        UniqueConstraint("stock_id", "date", name="uq_stock_date"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    stock_id = Column(Integer, ForeignKey("stocks.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False, index=True)
    open = Column(Numeric(12, 2))
    high = Column(Numeric(12, 2))
    low = Column(Numeric(12, 2))
    close = Column(Numeric(12, 2), nullable=False)
    volume = Column(BigInteger)
    adjusted_close = Column(Numeric(12, 2))

    # Relationships
    stock = relationship("Stock", back_populates="daily_prices")
    technical_indicator = relationship(
        "TechnicalIndicator", back_populates="daily_price", uselist=False
    )


# ─── Table: technical_indicators ─────────────────────────────
class TechnicalIndicator(Base):
    __tablename__ = "technical_indicators"

    id = Column(Integer, primary_key=True, autoincrement=True)
    price_id = Column(
        Integer, ForeignKey("daily_prices.id", ondelete="CASCADE"),
        unique=True, nullable=False
    )

    # RSI
    rsi_14 = Column(Numeric(8, 4))

    # MACD
    macd_line = Column(Numeric(8, 4))
    macd_signal = Column(Numeric(8, 4))
    macd_histogram = Column(Numeric(8, 4))

    # Moving Averages
    sma_20 = Column(Numeric(12, 2))
    sma_50 = Column(Numeric(12, 2))
    ema_20 = Column(Numeric(12, 2))

    # Bollinger Bands
    bb_upper = Column(Numeric(12, 2))
    bb_middle = Column(Numeric(12, 2))
    bb_lower = Column(Numeric(12, 2))

    # Stochastic Oscillator
    stoch_k = Column(Numeric(8, 4))
    stoch_d = Column(Numeric(8, 4))

    # Volatility & Volume
    atr_14 = Column(Numeric(12, 4))
    obv = Column(BigInteger)

    # Target label (Y): 1 = naik, 0 = tidak naik
    target = Column(SmallInteger)

    # Relationship
    daily_price = relationship("DailyPrice", back_populates="technical_indicator")


# ─── Table: model_experiments ─────────────────────────────────
class ModelExperiment(Base):
    __tablename__ = "model_experiments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    experiment_name = Column(String(100), nullable=False)
    algorithm = Column(String(50), nullable=False)  # LOGISTIC_REGRESSION | DECISION_TREE | RANDOM_FOREST
    ticker = Column(String(10), nullable=True)       # None = all tickers
    parameters = Column(JSON)                        # Hyperparameters used
    train_start_date = Column(Date)
    train_end_date = Column(Date)
    test_start_date = Column(Date)
    test_end_date = Column(Date)

    # Metrics
    accuracy = Column(Numeric(6, 4))
    precision = Column(Numeric(6, 4))
    recall = Column(Numeric(6, 4))
    f1_score = Column(Numeric(6, 4))
    auc_roc = Column(Numeric(6, 4))
    confusion_matrix = Column(JSON)     # [[TN, FP], [FN, TP]]
    feature_importance = Column(JSON)   # {feature: importance_score}

    # Backtest results
    win_rate = Column(Numeric(6, 4))
    max_drawdown = Column(Numeric(8, 4))
    profitability_factor = Column(Numeric(8, 4))

    model_file_path = Column(String(255))
    is_active = Column(Boolean, default=False)  # Model aktif untuk prediksi publik
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    notes = Column(Text)

    # Relationship
    predictions = relationship("Prediction", back_populates="experiment", lazy="dynamic")

    def __repr__(self):
        return f"<Experiment {self.experiment_name} [{self.algorithm}]>"


# ─── Table: predictions ──────────────────────────────────────
class Prediction(Base):
    __tablename__ = "predictions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    stock_id = Column(Integer, ForeignKey("stocks.id", ondelete="CASCADE"), nullable=False)
    experiment_id = Column(Integer, ForeignKey("model_experiments.id", ondelete="CASCADE"), nullable=False)

    prediction_date = Column(Date, nullable=False, index=True)  # Tanggal target prediksi
    predicted_class = Column(SmallInteger, nullable=False)       # 1=Naik, 0=Tidak Naik
    probability = Column(Numeric(5, 4))                          # P(class=1)

    # Diisi D+1 setelah harga aktual tersedia
    actual_class = Column(SmallInteger, nullable=True)
    actual_close = Column(Numeric(12, 2), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    stock = relationship("Stock", back_populates="predictions")
    experiment = relationship("ModelExperiment", back_populates="predictions")
