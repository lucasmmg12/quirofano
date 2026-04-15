-- ═══════════════════════════════════════════════════
-- FIX: Limpiar registros con fechas día/mes invertido
-- Bug: TRY_CONVERT(DATETIME, [Fecha realización], 103) 
--      invertía día y mes cuando la columna ya era DATETIME
-- Ejemplo: 12/Marzo → se guardaba como 03/Diciembre
-- ═══════════════════════════════════════════════════

-- 1. Verificar registros sospechosos (fechas futuras = invertidas)
-- Hoy es Abril 2026, cualquier fecha > Abril 2026 es sospechosa
SELECT 
    id, 
    fecha_realizacion, 
    nombre_paciente, 
    dni, 
    nombre_cirugia, 
    asociacion,
    constancia_id,
    docs_completos,
    en_carrito
FROM asociaciones_cirugias
WHERE fecha_realizacion > '2026-04-15'
ORDER BY fecha_realizacion;

-- 2. Eliminar registros con fechas invertidas (sin constancia)
-- Estos se van a re-crear correctamente en el próximo sync
DELETE FROM asociaciones_cirugias
WHERE fecha_realizacion > '2026-04-15'
  AND constancia_id IS NULL;

-- 3. Verificar que quedó limpio
SELECT COUNT(*) AS registros_restantes,
       MIN(fecha_realizacion) AS fecha_min,
       MAX(fecha_realizacion) AS fecha_max
FROM asociaciones_cirugias;
