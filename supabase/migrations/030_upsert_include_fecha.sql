-- ============================================================
-- SISTEMA ADM-QUI — Módulo Confirmación de Cirugías
-- Migración 030: Restaurar fecha_cirugia en constraint de upsert
-- Fecha: 2026-03-27
-- ============================================================
-- PROBLEMA: La constraint UNIQUE(id_paciente, nombre) de migración 022
-- impedía que un paciente tuviera múltiples cirugías con fechas distintas.
-- Ejemplo: VEGA, ESTEBAN (300856) tiene:
--   - 27/03/2026 con Ausente=1 (suspendida/reprogramada)
--   - 30/03/2026 con Ausente=NULL (nueva fecha)
-- La constraint actual sobreescribe la primera con la segunda,
-- perdiendo el registro histórico de la suspensión.
--
-- SOLUCIÓN: Cambiar a UNIQUE(id_paciente, nombre, fecha_cirugia)
-- para que cada combinación paciente+nombre+fecha sea un registro único.
-- Así las reprogramaciones (Ausente=1) coexisten con la nueva fecha.
-- ============================================================

-- 1) Limpiar posibles duplicados exactos (mismo paciente, nombre Y fecha)
--    antes de crear la constraint más restrictiva
DELETE FROM surgeries a
USING surgeries b
WHERE a.id_paciente IS NOT NULL
  AND a.id_paciente = b.id_paciente
  AND UPPER(TRIM(a.nombre)) = UPPER(TRIM(b.nombre))
  AND a.fecha_cirugia = b.fecha_cirugia
  AND a.id < b.id;

-- 2) Eliminar la constraint vieja (id_paciente, nombre)
ALTER TABLE surgeries
  DROP CONSTRAINT IF EXISTS uq_surgeries_upsert_key;

-- 3) Crear la nueva constraint CON fecha_cirugia
ALTER TABLE surgeries
  ADD CONSTRAINT uq_surgeries_upsert_key
  UNIQUE (id_paciente, nombre, fecha_cirugia);
