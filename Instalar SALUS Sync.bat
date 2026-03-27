@echo off
title Instalando SALUS Sync como servicio
color 0A

echo =============================================
echo   Instalador SALUS Sync - Sanatorio Argentino
echo   Este script configura el sync-server para
echo   que se inicie automaticamente con Windows.
echo =============================================
echo.

:: Ruta completa al sync-server
set SCRIPT_DIR=%~dp0sync-server
set NODE_EXE=node
set TASK_NAME=SALUS_Sync_Server

:: 1. Instalar dependencias si es necesario
echo [1/3] Verificando dependencias...
if not exist "%SCRIPT_DIR%\node_modules" (
    echo      Instalando dependencias...
    cd /d "%SCRIPT_DIR%"
    call npm install
    echo.
)

:: 2. Crear tarea programada que se ejecuta al iniciar sesion
echo [2/3] Registrando inicio automatico en Windows...
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1
schtasks /create /tn "%TASK_NAME%" /tr "cmd /c cd /d \"%SCRIPT_DIR%\" && node index.js" /sc onlogon /rl highest /f

if %ERRORLEVEL% EQU 0 (
    echo      [OK] Tarea programada creada exitosamente.
) else (
    echo      [!] No se pudo crear la tarea. Intentando alternativa...
    :: Alternativa: copiar acceso directo a carpeta Startup
    set STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
    echo @echo off > "%STARTUP_FOLDER%\SALUS Sync.bat"
    echo cd /d "%SCRIPT_DIR%" >> "%STARTUP_FOLDER%\SALUS Sync.bat"
    echo start /min node index.js >> "%STARTUP_FOLDER%\SALUS Sync.bat"
    echo      [OK] Acceso directo creado en carpeta de Inicio.
)

:: 3. Iniciar ahora
echo [3/3] Iniciando sync-server ahora...
cd /d "%SCRIPT_DIR%"
start /min "SALUS Sync" node index.js

echo.
echo =============================================
echo   INSTALACION COMPLETADA
echo   El sync-server se iniciara automaticamente
echo   cada vez que se encienda la computadora.
echo.
echo   Puerto: 3456
echo   Estado: CORRIENDO (minimizado)
echo =============================================
echo.
pause
