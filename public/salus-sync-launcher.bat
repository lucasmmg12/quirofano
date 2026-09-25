@echo off
title SALUS Sync Server - Sanatorio Argentino
color 0A

echo.
echo ==================================================
echo   SALUS Sync Server - Sanatorio Argentino
echo   Instalador y Launcher Automatico
echo ==================================================
echo.

:: Carpeta de instalacion local
set INSTALL_DIR=%USERPROFILE%\SALUS_Sync
set REPO_RAW=https://raw.githubusercontent.com/lucasmmg12/quirofano/main

:: 1. Verificar Node.js
echo [1/4] Verificando Node.js...
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  ERROR: Node.js no esta instalado en este equipo.
    echo  Descargue e instale Node.js desde: https://nodejs.org
    echo  Luego ejecute este archivo de nuevo.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo      Node.js %%v detectado correctamente.

:: Desactivar QuickEdit mode para evitar que clics en la consola congelen Node.js
reg add HKCU\Console /v QuickEdit /t REG_DWORD /d 0 /f >nul 2>&1

:: 2. Liberar puerto 3456 si habia una instancia previa
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :3456 ^| findstr LISTENING 2^>nul') do (
    echo      Reiniciando instancia previa de sync-server (PID %%p)...
    taskkill /F /PID %%p >nul 2>&1
)

:: 3. Preparar carpeta y descargar archivos actualizados
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
cd /d "%INSTALL_DIR%"

echo [2/4] Descargando componentes del servidor desde GitHub...
set MODULES=index.js package.json sync_censo_camas.mjs sync_diagnosticos.mjs sync_kinesiologia_uci.mjs sync_pacientes.mjs sync_turnos_online.mjs sync_doctor_parameters.mjs sync_turnos_activos.mjs sync_ocupacion.mjs daily_sync_job.mjs sync_uci.js

for %%F in (%MODULES%) do (
    echo      - %%F
    where curl.exe >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        curl.exe -4 -sL --connect-timeout 10 "%REPO_RAW%/sync-server/%%F" -o "%INSTALL_DIR%\%%F"
    ) else (
        powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('%REPO_RAW%/sync-server/%%F', '%INSTALL_DIR%\%%F')" >nul 2>&1
    )
)

if not exist "%INSTALL_DIR%\index.js" (
    echo.
    echo  ======================================================
    echo  ERROR: No se pudo descargar index.js y no hay version local previa.
    echo  Verifique su conexion a Internet o con el repositorio.
    echo  ======================================================
    echo.
    pause
    exit /b 1
)

:: Generar .env local seguro
echo VITE_SUPABASE_URL=https://hakysnqiryimxbwdslwe.supabase.co > "%INSTALL_DIR%\.env"
echo SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA0MjI3NCwiZXhwIjoyMDg1NjE4Mjc0fQ.v0Zw7yFjGKJX8xsMCZJPwRyhr2eNd1gjASsI7qSK0YM >> "%INSTALL_DIR%\.env"
echo VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNDIyNzQsImV4cCI6MjA4NTYxODI3NH0.-85OS1dohc9gh4U4qBhEBlqHi9Bq7l7H6JnzcUzrCIg >> "%INSTALL_DIR%\.env"
echo SALUS_DB_SERVER=128.223.16.29 >> "%INSTALL_DIR%\.env"
echo SALUS_DB_PORT=2450 >> "%INSTALL_DIR%\.env"
echo SALUS_DB_USER=SalusConsulta >> "%INSTALL_DIR%\.env"
echo SALUS_DB_PASSWORD=ConsultaSALUS1234 >> "%INSTALL_DIR%\.env"
echo SALUS_DB_NAME=SALUS >> "%INSTALL_DIR%\.env"

:: 4. Verificar dependencias
if not exist "%INSTALL_DIR%\node_modules\express" (
    echo [3/4] Instalando librerias de conexion (primera vez, espere unos segundos)...
    call npm install --omit=dev
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo  ======================================================
        echo  ERROR: Fallo la instalacion de dependencias npm.
        echo  ======================================================
        echo.
        pause
        exit /b 1
    )
) else (
    echo [3/4] Librerias verificadas correctamente.
)

:: 5. Iniciar servidor con bucle de proteccion
:run_server
echo [4/4] Iniciando SALUS Sync Server...
echo.
echo ==================================================
echo   Servidor SALUS Sync INICIADO en puerto 3456
echo.
echo   Vuelva a su navegador y presione el boton:
echo   "Sync Rápido" o "Sync SALUS"
echo.
echo   NO CIERRE esta ventana mientras use el sistema.
echo ==================================================
echo.

node index.js

echo.
echo ==================================================
echo  El servidor se ha detenido (Codigo: %ERRORLEVEL%).
echo ==================================================
echo.
echo  [R] Reiniciar el servidor
echo  [S] Salir
echo.
set /p OPCION="Seleccione opcion [R / S]: "
if /i "%OPCION%"=="R" goto run_server
echo.
echo Presione cualquier tecla para cerrar esta ventana...
pause >nul
exit /b 0
