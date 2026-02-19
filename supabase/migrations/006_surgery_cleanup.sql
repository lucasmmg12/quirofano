-- ============================================
-- 006: Limpieza de datos de cirugías
-- Ejecutar UNA sola vez en Supabase SQL Editor
-- ============================================

-- 1. Eliminar registros "BLOQUE" (no son cirugías reales)
DELETE FROM surgeries WHERE UPPER(nombre) LIKE 'BLOQUE%';

-- 2. Eliminar duplicados por (id_paciente, fecha_cirugia, nombre)
--    Conserva el registro más reciente de cada grupo
DELETE FROM surgeries a
USING surgeries b
WHERE a.id_paciente IS NOT NULL 
  AND a.id_paciente = b.id_paciente
  AND a.fecha_cirugia = b.fecha_cirugia
  AND a.nombre = b.nombre
  AND a.created_at < b.created_at;

-- 3. Normalizar ausente vacío a NULL
UPDATE surgeries SET ausente = NULL WHERE ausente = '';

-- 4. Verificación: mostrar cuántos registros quedaron
SELECT 
  COUNT(*) AS total_registros,
  COUNT(*) FILTER (WHERE ausente IS NULL) AS pendientes,
  COUNT(*) FILTER (WHERE ausente = '0') AS realizadas,
  COUNT(*) FILTER (WHERE ausente = '1') AS suspendidas
FROM surgeries
WHERE excluido = false;
