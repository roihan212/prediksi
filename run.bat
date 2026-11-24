@echo off
title StockPredict Launcher
echo ===================================================
echo   Menjalankan StockPredict (Backend, Frontend ^& Tunnel)
echo ===================================================

echo [1/3] Menjalankan Backend FastAPI (Port 8000)...
start "StockPredict - Backend API" cmd /k "cd /d "%~dp0backend" && venv\Scripts\activate.bat && uvicorn app.main:app --host 0.0.0.0 --port 8000"

echo [2/3] Menjalankan Frontend Web Lokal (Port 3000)...
start "StockPredict - Frontend" cmd /k "cd /d "%~dp0" && npm start"

echo [3/3] Menjalankan Tunnel Online HTTPS (GitHub Pages ^& HP)...
start "StockPredict - Cloud Tunnel" cmd /k "npx --yes localtunnel --port 8000 --subdomain tall-cats-flash"

echo.
echo Menunggu server siap...
timeout /t 4 /nobreak >nul

echo Membuka browser...
start http://localhost:3000

echo ===================================================
echo   Aplikasi aktif!
echo   Lokal Web    : http://localhost:3000
echo   GitHub Pages : https://roihan212.github.io/prediksi/
echo   Backend Live : https://tall-cats-flash.loca.lt/docs
echo ===================================================
