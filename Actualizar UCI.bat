@echo off
title SALUS - Sincronizador de Indicadores UCI
color 0B
echo ========================================================
echo   SINCRONIZADOR DE DATOS: TERAPIA INTENSIVA (UCI)
echo ========================================================
echo.
echo Iniciando sincronizacion manual con SALUS...
echo.

cd sync-server
node sync_uci.js

echo.
echo ========================================================
echo Proceso finalizado. Puedes cerrar esta ventana.
echo ========================================================
pause
