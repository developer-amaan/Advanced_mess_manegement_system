@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required. Install it from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)
for /f "tokens=1 delims=v." %%a in ('node --version') do set NODE_MAJOR=%%a
if %NODE_MAJOR% LSS 20 (
  echo Node.js 20 or newer is required. Your installed version is too old.
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo Installing app dependencies on first run...
  call npm install
  if errorlevel 1 (
    echo Dependency installation failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)
echo.
echo Starting Shivalik Mess Meter. Keep this window open while using the app.
echo When ready, open http://localhost:5173 in Chrome or Edge.
echo In Chrome or Edge, use the install icon in the address bar or browser menu to install the PWA.
echo.
call npm run demo
