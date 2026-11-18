@echo off
chcp 65001 >nul
setlocal EnableExtensions
title TikTok Arena - Sunucu
cd /d "%~dp0"

echo.
echo  ============================================
echo    TIKTOK ARENA - SUNUCU
echo  ============================================
echo.

where node >nul 2>nul
if errorlevel 1 goto :no_node

if not exist "node_modules" goto :no_setup

if not exist ".env" (
  if exist ".env.example" copy /y ".env.example" ".env" >nul
)

where curl >nul 2>nul
if not errorlevel 1 (
  curl -f -s -o nul --max-time 2 http://localhost:3000/api/status
  if not errorlevel 1 (
    echo  [!] Sunucu zaten calisiyor.
    if /i not "%~1"=="--no-browser" (
      echo      Panel tarayicida aciliyor...
      start "" "http://localhost:3000"
    )
    ping -n 4 127.0.0.1 >nul
    exit /b 0
  )
)

echo  Sunucu baslatiliyor...
echo.
echo  Panel       : http://localhost:3000
echo  OBS overlay : http://localhost:3000/?overlay=1
echo.
echo  Oyunu kapatmak icin bu pencereyi kapatabilir veya Ctrl+C kullanabilirsin.
echo.

if /i not "%~1"=="--no-browser" (
  start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:3000'"
)

node server.js

echo.
echo  Sunucu durdu.
pause
exit /b 0

:no_setup
echo  [HATA] Gerekli paketler kurulu degil.
echo  Once setup.bat dosyasini calistirin, ardindan start.bat dosyasina tekrar tiklayin.
echo.
pause
exit /b 1

:no_node
echo.
echo  [HATA] Node.js bulunamadi.
echo  Lutfen https://nodejs.org adresinden Node.js 20 veya uzerini kurun.
echo  Kurulumdan sonra start.bat dosyasini yeniden calistirin.
echo.
pause
exit /b 1
