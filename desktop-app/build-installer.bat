@echo off
echo ============================================
echo   Building Spine AI Installer
echo ============================================
echo.

echo [0/3] Cleaning old builds...
if exist installer rmdir /s /q installer
if exist dist rmdir /s /q dist

echo [1/3] Building React app...
call npm run build
if errorlevel 1 (
    echo ERROR: React build failed
    pause
    exit /b 1
)

echo [2/3] Creating Windows installer...
call npm run dist
if errorlevel 1 (
    echo ERROR: Installer creation failed
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Build complete
echo ============================================
echo.
echo Installer: installer\Spine-AI-Setup-*.exe
echo.
pause
