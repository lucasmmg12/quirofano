@echo off
title SALUS Sync Server - Sanatorio Argentino
color 0A

echo ========================================================
echo   SALUS Sync Server - Sanatorio Argentino
echo   Conectando a SQL Server SALUS y Supabase Cloud...
echo ========================================================
echo.

:: Desactivar QuickEdit para evitar que un clic en la consola congele Node.js
reg add HKCU\Console /v QuickEdit /t REG_DWORD /d 0 /f >nul 2>&1

:: 1. Verificar si Node.js esta instalado en el equipo
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
    echo ========================================================
    pause
    exit /b 1
)

:: 2. Actualizar repositorio si esta configurado con Git
if exist "%~dp0.git" (
    echo [*] Verificando actualizaciones del sistema desde GitHub...
    cd /d "%~dp0"
    call git pull origin main 2>nul
    echo.
)

:: 3. Verificar si la carpeta sync-server existe
if not exist "%~dp0sync-server" (
    color 0C
    echo.
    echo [ERROR] No se encontro la carpeta "sync-server".
    echo Asegurese de ejecutar este archivo desde la carpeta del proyecto.
    echo.
    pause
    exit /b 1
)

cd /d "%~dp0sync-server"

:: 4. Garantizar que .env exista con credenciales por defecto
if not exist ".env" (
    if exist "..\\.env" (
        copy /Y "..\\.env" ".env" >nul 2>&1
    ) else (
        echo [*] Generando archivo de configuracion local .env...
        echo VITE_SUPABASE_URL=https://hakysnqiryimxbwdslwe.supabase.co > .env
        echo SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA0MjI3NCwiZXhwIjoyMDg1NjE4Mjc0fQ.v0Zw7yFjGKJX8xsMCZJPwRyhr2eNd1gjASsI7qSK0YM >> .env
        echo VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNDIyNzQsImV4cCI6MjA4NTYxODI3NH0.-85OS1dohc9gh4U4qBhEBlqHi9Bq7l7H6JnzcUzrCIg >> .env
        echo SALUS_DB_SERVER=128.223.16.29 >> .env
        echo SALUS_DB_PORT=2450 >> .env
        echo SALUS_DB_USER=SalusConsulta >> .env
        echo SALUS_DB_PASSWORD=ConsultaSALUS1234 >> .env
        echo SALUS_DB_NAME=SALUS >> .env
    )
)

:: 5. Liberar puerto 3456 si habia una instancia previa
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :3456 ^| findstr LISTENING 2^>nul') do (
    echo [*] Liberando instancia previa en puerto 3456 (PID %%p)...
    taskkill /F /PID %%p >nul 2>&1
)

:: 6. Verificar si dependencias de sync-server estan instaladas
if not exist "node_modules\express" (
    echo [!] Instalando dependencias de Node.js por primera vez...
    call npm install --omit=dev
    if %ERRORLEVEL% NEQ 0 (
        color 0C
        echo.
        echo [ERROR] No se pudieron instalar las dependencias con npm.
        echo Verifique su conexion a Internet.
        echo.
        pause
        exit /b 1
    )
    echo.
)

:run_server
cls
echo ========================================================
echo   SALUS Sync Server - Sanatorio Argentino (ACTIVO)
echo ========================================================
echo.
echo   - Base de Datos SALUS : 128.223.16.29:2450 (LAN)
echo   - Servidor Central    : http://128.223.17.60:3456
echo   - Local               : http://localhost:3456
echo   - Destino Cloud       : Supabase Sanatorio Argentino
echo.
echo   Sincronizaciones automaticas activas:
echo     * Turnos Activos y Visitas   : cada 5 minutos
echo     * Turnos Online Duplicados   : cada 10 minutos
echo     * Diagnosticos y Evoluciones : cada 20 minutos
echo     * Parametros Medicos         : cada 30 minutos
echo     * Historial 360 Pacientes    : cada 4 minutos
echo.
echo   [*] No cierre esta ventana para mantener la sincronizacion.
echo ========================================================
echo.

node index.js

echo.
echo ========================================================
echo   El servidor SALUS Sync se ha detenido (Codigo: %ERRORLEVEL%).
echo ========================================================
echo.
echo  [R] Reiniciar servidor
echo  [S] Salir
echo.
set /p OPCION="Seleccione una opcion [R / S]: "
if /i "%OPCION%"=="R" goto run_server
exit /b 0
