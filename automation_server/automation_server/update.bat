@echo off
title Manual Updater
color 0B
cls

echo ================================================
echo   MANUAL UPDATER
echo ================================================
echo.
echo [*] Memaksa pengecekan dan download update...
echo.

node updater.js

if %ERRORLEVEL% == 2 (
    echo.
    echo [OK] Update berhasil dipasang!
)

if %ERRORLEVEL% == 0 (
    echo.
    echo [OK] Aplikasi sudah versi terbaru.
)

if %ERRORLEVEL% == 1 (
    echo.
    echo [!] Terjadi error saat update. Cek koneksi internet.
)

echo.
pause