from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # App
    APP_NAME: str = "StockPredict API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    SECRET_KEY: str = "change-me-in-production"

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./stockpredict.db"
    DATABASE_URL_SYNC: str = "sqlite:///./stockpredict.db"

    # Redis / Celery
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

    # ML
    MODELS_DIR: str = "saved_models"
    DEFAULT_THRESHOLD: float = 0.0
    TRAIN_TEST_RATIO: float = 0.8

    # Stock Data
    TICKERS_RAW: str = "BBCA.JK,BBRI.JK,BBNI.JK,BMRI.JK,BRIS.JK"
    DATA_FETCH_PERIOD: str = "10y"
    FETCH_TIME_WIB: str = "16:45"

    # JWT
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    @property
    def TICKERS(self) -> List[str]:
        return [t.strip() for t in self.TICKERS_RAW.split(",")]

    @property
    def TICKER_NAMES(self) -> dict:
        """Mapping ticker → display name"""
        return {
            "BBCA.JK": "Bank Central Asia",
            "BBRI.JK": "Bank Rakyat Indonesia",
            "BBNI.JK": "Bank Negara Indonesia",
            "BMRI.JK": "Bank Mandiri",
            "BRIS.JK": "BRI Syariah",
        }

    class Config:
        env_file = ".env"


settings = Settings()
