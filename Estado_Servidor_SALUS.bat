@echo off
title Estado Servidor SALUS - Sanatorio Argentino
color 0B
echo ========================================================
echo   Comprobando Estado del Servidor SALUS Sync...
echo ========================================================
echo.

netstat -ano | findstr :3456 | findstr LISTENING >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    color 0A
    echo   [ACTIVO] El servidor esta escuchando en el puerto 3456.
    echo   Direcciones:
    echo     - Red LAN : http://128.223.17.60:3456
    echo     - Local   : http://localhost:3456
    echo.
    echo   Probando respuesta HTTP (/api/salus/health)...
    curl -s http://127.0.0.1:3456/api/salus/health 2>nul || echo (Respuesta recibida)
) else (
    color 0C
    echo   [DETENIDO] El servidor SALUS Sync NO esta corriendo.
    echo   Para iniciarlo en consola: ejecute "Actualizar SALUS.bat"
    echo   Para segundo plano       : ejecute "Iniciar_Servicio_Automatico_SALUS.vbs"
)

echo.
echo ========================================================
pause
exit /b 0
