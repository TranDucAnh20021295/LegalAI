@echo off
title Cap nhat VBPL moi tu vbpl.vn
chcp 65001 >nul

echo ================================================
echo   CAP NHAT VAN BAN PHAP LUAT MOI (vbpl.vn)
echo ================================================
echo.

REM === Chuyen den thu muc du lieu ===
cd /d "%~dp0..\..\..\legal-crawler"

REM === Kiem tra venv ===
if not exist "..\services\chat-service\crawler\venv\Scripts\python.exe" (
    echo [LOI] Khong tim thay venv tai chat-service/crawler/venv. Hay chay setup moi truong truoc.
    pause & exit /b 1
)

REM === Chay script tong hop ===
REM --max 50    : Lay toi da 50 van ban moi tu vbpl.vn (tang/giam tuy nhu cau)
REM --dry-run   : Chi xem danh sach, khong tai file (bo comment de test truoc)
REM --no-embed  : Bo qua buoc tao embedding (neu muon lam rieng sau)

"..\services\chat-service\crawler\venv\Scripts\python.exe" "..\services\chat-service\crawler\update_vbpl.py" --max 50

echo.
echo ================================================
echo   HOAN TAT!
echo ================================================
pause
