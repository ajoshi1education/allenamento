@echo off
rem Starts the Italian app on http://localhost:8010 and opens it in your browser.
rem Keep this window open while you use the app; close it to stop.
cd /d "%~dp0"
start "" http://localhost:8010
powershell -NoProfile -ExecutionPolicy Bypass -File tools\serve.ps1 -Port 8010
