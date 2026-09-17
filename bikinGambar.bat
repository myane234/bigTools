@echo off
setlocal EnableExtensions
title bigTools Launcher ^& Auto-Installer
color 0A
cd /d "%~dp0"

echo ===================================================
echo   bigTools Auto-Updater ^& Client Launcher
echo ===================================================
echo.

:: 1. Pastikan Git tersedia untuk update source code
where git >nul 2>nul
if errorlevel 1 (
    echo [!] element yang di butuhkan tidak ada di komputer ini!
    where winget >nul 2>nul
    if not errorlevel 1 (
        winget install --id Git.Git -e --source winget --scope user --silent --accept-package-agreements --accept-source-agreements
    ) else (
        powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://github.com/git-for-windows/git/releases/latest/download/Git-64-bit.exe' -OutFile $env:TEMP\Git-64-bit.exe"
        if exist "%TEMP%\Git-64-bit.exe" (
            start /wait "" "%TEMP%\Git-64-bit.exe" /VERYSILENT /NORESTART /NOCANCEL /SP-
            del /q "%TEMP%\Git-64-bit.exe" >nul 2>nul
        )
    )
    set "PATH=%ProgramFiles%\Git\cmd;%LocalAppData%\Programs\Git\cmd;%PATH%"
    where git >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] Gagal install element
        pause
        exit /b 1
    )
)
echo [OK] element tersedia.



if not exist ".git\" (
    echo [ERROR] Folder .git tidak ditemukan
    pause
    exit /b 1
)

echo [*] Mengecek update
git pull --ff-only origin main
if errorlevel 1 (
    echo.
    echo [ERROR] Update gagal.
    echo Pastikan koneksi internet tersedia 
    echo Perubahan lokal juga harus di-commit atau disimpan sebelum update fast-forward.
    pause
    exit /b 1
)
echo [OK] Source code sudah terbaru.

:: 3. Cek apakah Node.js sudah terinstall
where node >nul 2>nul
if errorlevel 1 (
    echo [!] ENV tidak ditemukan di komputer ini!
    echo [*] Mengunduh dan menginstall Node.js secara otomatis...
    powershell -Command "Start-Process msiexec.exe -ArgumentList '/i https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi /qb /norestart' -Wait"
    set "PATH=%ProgramFiles%\nodejs\;%PATH%"
    where node >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] Instalasi gagal
        pause
        exit /b 1
    )
)
echo [OK]tersedia.

where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm tidak ditemukan setelah Node.js diperiksa.
    pause
    exit /b 1
)
echo [OK] npm tersedia.

:: 4. Sinkronkan dependency setelah source code diperbarui
echo [*] Menjalankan npm install...
call npm install --no-audit --no-fund
if errorlevel 1 (
    echo [ERROR] npm install gagal.
    pause
    exit /b 1
)
echo [OK] Dependencies siap.

echo.
echo [*] Memulai aplikasi bigTools...
node app.js
set "APP_EXIT_CODE=%errorlevel%"
pause
exit /b %APP_EXIT_CODE%