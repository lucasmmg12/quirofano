@echo off
title SALUS Sync Server - Sanatorio Argentino
color 0A

echo ========================================================
echo   SALUS Sync Server - Sanatorio Argentino
echo   Conectando a SQL Server SALUS y Supabase Cloud...
echo ========================================================
echo.

reg add HKCU\Console /v QuickEdit /t REG_DWORD /d 0 /f >nul 2>&1

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo.
    echo ========================================================
    echo   ERROR: Node.js no esta instalado en esta computadora.
    echo ========================================================
    echo.
    echo   Para ejecutar el servidor local de sincronizacion,
    echo   debe tener instalado Node.js (version 18 o superior).
    echo   Descarguelo gratis desde: https://nodejs.org
    echo.
    pause
    exit /b 1
)

if exist "%~dp0.git" (
    echo [*] Verificando actualizaciones del sistema desde GitHub...
    cd /d "%~dp0"
    call git pull origin main 2>nul
    echo.
)

if not exist "%~dp0sync-server" (
    color 0C
    echo [ERROR] No se encontro la carpeta "sync-server".
    pause
    exit /b 1
)

cd /d "%~dp0sync-server"

for /f "tokens=5" %%p in ('netstat -ano ^| findstr :3456 ^| findstr LISTENING 2^>nul') do (
    taskkill /F /PID %%p >nul 2>&1
)

if not exist "node_modules\express" (
    echo [!] Instalando dependencias de Node.js...
    call npm install --omit=dev
)

:run_server
cls
echo ========================================================
echo   SALUS Sync Server - Sanatorio Argentino (ACTIVO)
echo ========================================================
echo   - Base de Datos SALUS : 128.223.16.29:2450 (LAN)
echo   - Servidor Central    : http://128.223.17.60:3456
echo   - Destino Cloud       : Supabase Sanatorio Argentino
echo.
echo   Sincronizaciones automaticas activas:
echo     * Turnos Activos y Visitas   : cada 5 minutos
echo     * Turnos Online Duplicados   : cada 10 minutos
echo     * Diagnosticos y Evoluciones : cada 20 minutos
echo     * Parametros Medicos         : cada 30 minutos
echo     * Historial 360 Pacientes    : cada 4 minutos
echo ========================================================
echo.

node index.js

set /p OPCION="Seleccione [R] Reiniciar / [S] Salir: "
if /i "%OPCION%"=="R" goto run_server
exit /b 0
