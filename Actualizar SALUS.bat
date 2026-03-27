@echo off
title SALUS Sync Server - Sanatorio Argentino
color 0A

echo =============================================
echo   SALUS Sync Server - Sanatorio Argentino
echo   Conectando a SQL Server local...
echo =============================================
echo.

cd /d "%~dp0sync-server"

:: Verificar si node_modules existe
if not exist "node_modules" (
    echo [!] Instalando dependencias por primera vez...
    call npm install
    echo.
)

echo [*] Iniciando servidor de sincronizacion en puerto 3456...
echo [*] NO CIERRE esta ventana mientras use el sistema.
echo.

node index.js

pause
