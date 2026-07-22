@echo off
title AeroVision Startup
color 0A

echo.
echo  ==========================================
echo   AeroVision - Starting all services...
echo  ==========================================
echo.

:: Kill any existing node/vite processes on our ports
echo [1/4] Stopping old processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000 " 2^>nul') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " 2^>nul') do taskkill /PID %%a /F >nul 2>&1
timeout /t 2 /nobreak >nul

:: Start backend
echo [2/4] Starting backend on port 5000...
start "AeroVision Backend" cmd /k "cd /d %~dp0backend && node app.js"

:: Wait for backend to be ready
echo       Waiting for backend to start...
timeout /t 5 /nobreak >nul

:: Start frontend
echo [3/4] Starting frontend on port 5173...
start "AeroVision Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

:: Wait for Vite to compile
echo       Waiting for frontend to compile...
timeout /t 8 /nobreak >nul

:: Open browser
echo [4/4] Opening browser...
start http://localhost:5173

echo.
echo  ==========================================
echo   AeroVision is running!
echo   Backend:  http://localhost:5000
echo   Frontend: http://localhost:5173
echo  ==========================================
echo.
echo  Two terminal windows are open.
echo  Close them to stop the servers.
echo.
echo  If the page looks empty, wait 5 seconds
echo  then press Ctrl+Shift+R to hard refresh.
echo.
pause
