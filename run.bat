@echo off
title StockPredict Launcher
echo ===================================================
echo   Menjalankan StockPredict (Backend ^& Frontend)
echo ===================================================

echo [1/2] Menjalankan Backend FastAPI (Port 8000)...
start "StockPredict - Backend API" cmd /k "cd /d "%~dp0backend" && venv\Scripts\activate.bat && uvicorn app.main:app --reload --port 8000"

echo [2/2] Menjalankan Frontend Web (Port 3000)...
start "StockPredict - Frontend" cmd /k "cd /d "%~dp0" && npm start"

echo.
echo Menunggu server siap...
timeout /t 3 /nobreak >nul

echo Membuka browser...
start http://localhost:3000

echo ===================================================
echo   Aplikasi aktif!
echo   Frontend : http://localhost:3000
echo   Backend  : http://localhost:8000/docs
echo ===================================================

