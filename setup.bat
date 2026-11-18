@echo off
chcp 65001 >nul
setlocal EnableExtensions
title TikTok Arena - Kurulum
cd /d "%~dp0"

echo.
echo  ============================================
echo    TIKTOK ARENA - KURULUM
echo  ============================================
echo.

where node >nul 2>nul
if errorlevel 1 goto :no_node
where npm >nul 2>nul
if errorlevel 1 goto :no_node

for /f "tokens=1 delims=." %%v in ('node -v') do set "NODE_MAJOR=%%v"
set "NODE_MAJOR=%NODE_MAJOR:v=%"
if not defined NODE_MAJOR set "NODE_MAJOR=0"
if %NODE_MAJOR% LSS 20 goto :old_node

echo  Node.js surumu:
node -v
echo.
echo  Gerekli paketler kuruluyor... Bu islem birkac dakika surebilir.
echo.
call npm install
if errorlevel 1 goto :npm_error

if not exist ".env" (
  if exist ".env.example" (
    copy /y ".env.example" ".env" >nul
    echo  .env dosyasi olusturuldu.
  )
)

echo.
echo  ============================================
echo    KURULUM TAMAMLANDI
echo  ============================================
echo.
echo  Simdi start.bat dosyasina cift tiklayarak oyunu baslatabilirsin.
echo.
pause
exit /b 0

:no_node
echo.
echo  [HATA] Node.js bulunamadi.
echo  Lutfen https://nodejs.org adresinden Node.js 20 veya uzerini kurun.
echo  Kurulumdan sonra bu pencereyi kapatip setup.bat dosyasini yeniden calistirin.
echo.
pause
exit /b 1

:old_node
echo.
echo  [HATA] Node.js surumu cok eski.
node -v
echo  Gerekli surum: Node.js 20 veya uzeri.
echo  Lutfen https://nodejs.org adresinden guncelleyin.
echo.
pause
exit /b 1

:npm_error
echo.
echo  [HATA] Paketler kurulamadi.
echo  Internet baglantinizi kontrol edip setup.bat dosyasini yeniden calistirin.
echo  Sorun devam ederse Node.js'i yeniden kurmayi deneyin.
echo.
pause
exit /b 1
