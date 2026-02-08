@echo off
REM Start Spine AI backend services: API, Orthanc monitor, and Auto analyzer.
REM Run from backend folder or double-click this file (it cd's to its own directory).

cd /d "%~dp0"

set "ACTIVATE="
if exist "venv\Scripts\activate.bat" set "ACTIVATE=call venv\Scripts\activate.bat && "

echo Starting Spine API (port 8001)...
start "Spine API" cmd /k "cd /d "%~dp0" && %ACTIVATE%python -m uvicorn main:app --reload --host 127.0.0.1 --port 8001"

echo Starting Orthanc monitor...
start "Orthanc Monitor" cmd /k "cd /d "%~dp0" && %ACTIVATE%python orthanc_monitor.py"

echo Starting Auto Analyzer...
start "Auto Analyzer" cmd /k "cd /d "%~dp0" && %ACTIVATE%python auto_analyzer.py"

echo.
echo All three services started in new windows. Close each window to stop that service.
echo API: http://127.0.0.1:8001
pause
