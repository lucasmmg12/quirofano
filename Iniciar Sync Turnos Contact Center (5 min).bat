@echo off
title Sync Turnos y Cancelaciones Contact Center (SALUS - Cada 5 min)
color 0B
echo ==============================================================================
echo   SANATORIO ARGENTINO - SINCRONIZADOR DE TURNOS CONTACT CENTER (CADA 5 MIN)
echo ==============================================================================
echo.
cd /d "%~dp0sync-server"

echo [1/2] Verificando dependencias...
if not exist "node_modules" (
    echo Instalando paquetes de sync-server...
    call npm install
)

echo.
echo [2/2] Iniciando sincronizador autonomo de turnos y cancelaciones cada 5 minutos...
echo.
node sync_turnos_contact_center.mjs --daemon

if %errorlevel% neq 0 (
    echo.
    echo Ocurrio un error al ejecutar el sincronizador de turnos.
    pause
)
