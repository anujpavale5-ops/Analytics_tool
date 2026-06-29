@echo off
echo Starting Analytics Copilot...

:: Start the Python backend server in a new command window
cd /d "%~dp0\backend"
echo Starting Backend Server...
start "Analytics Copilot Backend" cmd /c "..\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

:: Start the Python frontend server in a new command window
cd /d "%~dp0\frontend"
echo Starting Frontend Server...
start "Analytics Copilot Frontend" cmd /c "..\venv\Scripts\python.exe -m http.server 8080"

:: Wait for a couple of seconds to ensure the servers start
timeout /t 3 /nobreak > nul

:: Open the frontend in the default web browser
echo Opening Frontend...
start "" "http://127.0.0.1:8080/index.html"

echo Application launched! You can close this black window.
