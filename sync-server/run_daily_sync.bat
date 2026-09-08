@echo off
REM ============================================================================
REM run_daily_sync.bat — Script de Automatización Diaria (06:00 AM)
REM Sanatorio Argentino — Gobernanza de Camas y Estudios Clínicos
REM ============================================================================

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

if not exist "logs" mkdir "logs"

for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set CURR_DATE=%datetime:~0,8%_%datetime:~8,4%
set LOG_FILE=logs\daily_sync_%CURR_DATE%.log

echo [INFO] Iniciando Sincronizacion Diaria SALUS -> Supabase: %date% %time% >> "%LOG_FILE%" 2>&1
echo [INFO] Directorio: %SCRIPT_DIR% >> "%LOG_FILE%" 2>&1

node daily_sync_job.mjs >> "%LOG_FILE%" 2>&1

if %ERRORLEVEL% equ 0 (
    echo [SUCCESS] Sincronizacion finalizada exitosamente: %date% %time% >> "%LOG_FILE%" 2>&1
    exit /b 0
) else (
    echo [ERROR] La sincronizacion fallo con codigo %ERRORLEVEL%: %date% %time% >> "%LOG_FILE%" 2>&1
    exit /b %ERRORLEVEL%
)
