"""Admin Auth Endpoint"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import timedelta
from jose import jwt
from datetime import datetime

from app.core.config import settings

router = APIRouter()

# Hardcoded admin untuk keperluan riset (ganti dengan DB user di production)
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "stockpredict2024"


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/login", response_model=TokenResponse, summary="Admin login")
async def admin_login(payload: LoginRequest):
    if payload.username != ADMIN_USERNAME or payload.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Kredensial tidak valid")

    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    token_data = {"sub": payload.username, "exp": expire, "role": "admin"}
    token = jwt.encode(token_data, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    return TokenResponse(access_token=token)
