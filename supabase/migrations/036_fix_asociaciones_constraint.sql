-- ============================================================
-- SISTEMA ADM-QUI — Módulo Asociaciones
-- Migración 036: Fix constraint UNIQUE en asociaciones_cirugias
-- Fecha: 2026-04-22
-- ============================================================
-- PROBLEMA: La constraint UNIQUE(fecha_realizacion, dni, nombre_cirugia)
-- falla silenciosamente cuando dni es NULL, porque en PostgreSQL
-- NULL != NULL en constraints UNIQUE. Esto provoca que cirugías
-- con estado URGENCIA (que frecuentemente no tienen DNI) no puedan
-- hacer upsert correctamente.
--
-- SOLUCIÓN: Cambiar a UNIQUE(fecha_realizacion, nombre_paciente, nombre_cirugia)
-- ya que nombre_paciente es NOT NULL y siempre está presente.
-- ============================================================

-- 1) Limpiar duplicados exactos por la nueva clave antes de crear constraint
DELETE FROM asociaciones_cirugias a
USING asociaciones_cirugias b
WHERE UPPER(TRIM(a.nombre_paciente)) = UPPER(TRIM(b.nombre_paciente))
  AND a.fecha_realizacion = b.fecha_realizacion
  AND COALESCE(a.nombre_cirugia, '') = COALESCE(b.nombre_cirugia, '')
  AND a.id < b.id;

-- 2) Eliminar la constraint vieja (fecha_realizacion, dni, nombre_cirugia)
ALTER TABLE asociaciones_cirugias
  DROP CONSTRAINT IF EXISTS asociaciones_cirugias_fecha_realizacion_dni_nombre_cirugia_key;

-- 3) Crear la nueva constraint usando nombre_paciente (siempre NOT NULL)
ALTER TABLE asociaciones_cirugias
  ADD CONSTRAINT uq_asoc_cirug_key
  UNIQUE (fecha_realizacion, nombre_paciente, nombre_cirugia);
