-- ============================================================
-- SISTEMA ADM-QUI — Módulo Confirmación de Cirugías
-- Migración 022: Cambiar constraint de upsert
-- Fecha: 2026-03-18
-- ============================================================
-- PROBLEMA: La constraint UNIQUE(id_paciente, fecha_cirugia, nombre)
-- causaba que una cirugía reprogramada (ej: 14/03 → 23/03) generara
-- un registro NUEVO en vez de actualizar el existente.
-- Esto duplicaba pacientes y perdía los estados de gestión.
--
-- SOLUCIÓN: Cambiar a UNIQUE(id_paciente, nombre) para que cada
-- paciente tenga UN solo registro activo a la vez.
-- Cuando el hospital reprograma, se actualiza la fecha en el mismo
-- registro, preservando status, notas, comentarios y eventos.
-- ============================================================

-- 1) Limpiar duplicados existentes: si hay dos registros con 
--    el mismo (id_paciente, nombre_normalizado), quedarse con el más reciente
DELETE FROM surgeries a
USING surgeries b
WHERE a.id_paciente IS NOT NULL
  AND a.id_paciente = b.id_paciente
  AND UPPER(TRIM(a.nombre)) = UPPER(TRIM(b.nombre))
  AND a.id < b.id;

-- 2) Eliminar la constraint vieja
ALTER TABLE surgeries
  DROP CONSTRAINT IF EXISTS uq_surgeries_upsert_key;

-- 3) Crear la nueva constraint SIN fecha_cirugia
ALTER TABLE surgeries
  ADD CONSTRAINT uq_surgeries_upsert_key
  UNIQUE (id_paciente, nombre);
