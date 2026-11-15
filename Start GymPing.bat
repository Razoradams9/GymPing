@echo off
cd /d "%~dp0"
node backend\launch.js
if errorlevel 1 pause
