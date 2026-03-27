@echo off
chcp 65001 >nul
title SALUS Sync Server - Sanatorio Argentino
color 0A

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║  SALUS Sync Server - Sanatorio Argentino ║
echo  ║  Instalador y Launcher Automatico        ║
echo  ╚══════════════════════════════════════════╝
echo.

:: Carpeta de instalación local
set INSTALL_DIR=%USERPROFILE%\SALUS_Sync
set REPO_RAW=https://raw.githubusercontent.com/lucasmmg12/quirofano/main

:: 1. Verificar Node.js
echo [1/5] Verificando Node.js...
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  ERROR: Node.js no esta instalado.
    echo  Descargue e instale Node.js desde: https://nodejs.org
    echo  Luego ejecute este archivo de nuevo.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo      Node.js %%v encontrado

:: 2. Crear carpeta de instalación
echo [2/5] Preparando carpeta de instalacion...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: 3. Descargar archivos del repositorio
echo [3/5] Descargando archivos desde GitHub...
echo      Descargando index.js...
curl -sL "%REPO_RAW%/sync-server/index.js" -o "%INSTALL_DIR%\index.js"
if %ERRORLEVEL% NEQ 0 (
    echo  ERROR: No se pudo descargar index.js
    pause
    exit /b 1
)

echo      Descargando package.json...
curl -sL "%REPO_RAW%/sync-server/package.json" -o "%INSTALL_DIR%\package.json"

echo      Descargando .env...
curl -sL "%REPO_RAW%/.env" -o "%INSTALL_DIR%\.env"

:: 4. Instalar dependencias
echo [4/5] Instalando dependencias (primera vez puede demorar)...
cd /d "%INSTALL_DIR%"

:: Ajustar dotenv path: el index.js busca ../.env, copiar a carpeta padre
if not exist "%INSTALL_DIR%\..\SALUS_Sync\.env" (
    copy /y "%INSTALL_DIR%\.env" "%INSTALL_DIR%\.env" >nul
)

:: Modificar la ruta del .env en index.js para que use la carpeta actual
powershell -NoProfile -Command "(Get-Content '%INSTALL_DIR%\index.js') -replace \"resolve\(__dirname, '\.\.', '\.env'\)\", \"resolve(__dirname, '.env')\" | Set-Content '%INSTALL_DIR%\index.js'"

call npm install --production 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo  ERROR: Fallo la instalacion de dependencias.
    pause
    exit /b 1
)

:: 5. Iniciar servidor
echo [5/5] Iniciando SALUS Sync Server...
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║  Servidor INICIADO en puerto 3456        ║
echo  ║                                          ║
echo  ║  Vuelva al navegador y presione          ║
echo  ║  el boton "Sync SALUS"                   ║
echo  ║                                          ║
echo  ║  NO CIERRE esta ventana mientras         ║
echo  ║  use el sistema.                         ║
echo  ╚══════════════════════════════════════════╝
echo.

node index.js

echo.
echo El servidor se ha detenido.
pause
