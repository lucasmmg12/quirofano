@echo off
title Detener Servidor SALUS - Sanatorio Argentino
color 0C
echo ========================================================
echo   Deteniendo Servidor de Sincronizacion SALUS...
echo ========================================================
echo.

set KILLED=0
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :3456 ^| findstr LISTENING 2^>nul') do (
    echo [*] Finalizando proceso en puerto 3456 (PID %%p)...
    taskkill /F /PID %%p >nul 2>&1
    set KILLED=1
)

if "%KILLED%"=="1" (
    echo.
    echo [OK] El servidor SALUS Sync fue detenido con exito.
) else (
    echo.
    echo [INFO] No habia ninguna instancia ejecutandose en el puerto 3456.
)

echo.
timeout /t 3 >nul
exit /b 0
