@echo off
title SALUS Sync Server - Sanatorio Argentino
color 0A

echo =============================================
echo   SALUS Sync Server - Sanatorio Argentino
echo   Conectando a SQL Server local...
echo =============================================
echo.

reg add HKCU\Console /v QuickEdit /t REG_DWORD /d 0 /f >nul 2>&1

:: 1. Actualizar repositorio si esta configurado con Git
if exist "%~dp0.git" (
    echo [*] Verificando actualizaciones del sistema desde GitHub...
    cd /d "%~dp0"
    call git pull origin main
    echo.
)

:: 2. Liberar puerto 3456 si habia una instancia previa
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :3456 ^| findstr LISTENING 2^>nul') do (
    echo [*] Reiniciando instancia previa en puerto 3456 (PID %%p)...
    taskkill /F /PID %%p >nul 2>&1
)

cd /d "%~dp0sync-server"

:: 3. Verificar si node_modules existe
if not exist "node_modules" (
    echo [!] Instalando dependencias por primera vez...
    call npm install --omit=dev
    echo.
)

:run_server
echo [*] Iniciando servidor de sincronizacion en puerto 3456...
echo [*] NO CIERRE esta ventana mientras use el sistema.
echo.

node index.js

echo.
echo =============================================
echo   El servidor SALUS Sync se ha detenido.
echo =============================================
echo.
echo  [R] Reiniciar servidor
echo  [S] Salir
echo.
choice /C RS /N /M "Seleccione opcion [R / S]: "
if %ERRORLEVEL% EQU 1 goto run_server
exit /b 0
