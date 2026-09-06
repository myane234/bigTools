@echo off
title bigTools Launcher & Auto-Installer
color 0A
cd /d "%~dp0"

echo ===================================================
echo   bigTools Auto-Installer & Client Launcher
echo ===================================================
echo.

:: 1. Cek Apakah Node.js Sudah Terinstall
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] Node.js tidak ditemukan di komputer ini!
    echo [*] Mengunduh & Menginstall Node.js secara otomatis...
    powershell -Command "Start-Process msiexec.exe -ArgumentList '/i https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi /qb /norestart' -Wait"
    echo [OK] Node.js berhasil dipasang!
    set "PATH=%ProgramFiles%\nodejs\;%PATH%"
) else (
    echo [OK] Node.js sudah terpasang.
)

:: 2. Cek npm i (Install Module jika node_modules belum ada)
if not exist "node_modules\" (
    echo [*] Folder node_modules belum ada. Menjalankan npm install...
    call npm i
) else (
    echo [OK] Dependencies node_modules ditemukan.
)

echo.
echo [*] Memulai aplikasi bigTools...
node app.js
pause