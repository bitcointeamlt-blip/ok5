@echo off
echo Starting Colyseus server on port 2567...
start "Colyseus Server" cmd /k "cd colyseus-server && npm run dev"

timeout /t 3 /nobreak >nul

echo Starting Frontend server on port 7005...
start "Frontend Server" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo ========================================
echo   Servers are starting...
echo ========================================
echo   Frontend: http://localhost:7005
echo   Colyseus: http://localhost:2567
echo ========================================
echo.
echo Please wait ~10 seconds for servers to start.
echo Press any key to close this window...
pause >nul

