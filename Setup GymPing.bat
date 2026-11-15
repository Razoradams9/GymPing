@echo off
cd /d "%~dp0"
echo Setting up GymPing. This takes a few minutes the first time...
call npm run setup
if errorlevel 1 goto failed
node backend\launch.js --install
node backend\launch.js
echo.
echo Done. GymPing is open in your browser. Next time, use the GymPing icon on your Desktop.
pause
exit /b 0
:failed
echo.
echo Setup failed. Make sure Node.js 22.5 or newer is installed, then try again.
pause
exit /b 1
