@echo off
python builder\optimize_images.py
if errorlevel 1 pause & exit /b 1
node builder\build.js
pause
