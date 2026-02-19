-- ============================================================
-- SISTEMA ADM-QUI — Módulo Confirmación de Cirugías
-- Migración 005: Soporte para Upsert (carga periódica Excel)
-- Fecha: 2026-02-19
-- ============================================================

-- Campo para ID de paciente del sistema fuente (Excel)
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS id_paciente TEXT;

-- Campos adicionales del Excel
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS motivo TEXT;
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS ausente TEXT;
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS grupo_agendas TEXT;
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS descripcion TEXT;

-- Campo para almacenar el teléfono original (sin normalizar) como referencia
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS telefono_original TEXT;

-- Índice para búsqueda por id_paciente
CREATE INDEX IF NOT EXISTS idx_surgeries_id_paciente ON surgeries(id_paciente);

-- Eliminar el index antiguo si existe (no funciona con PostgREST)
DROP INDEX IF EXISTS idx_surgeries_upsert_key;

-- UNIQUE CONSTRAINT para UPSERT via PostgREST/Supabase
-- Esto previene duplicados cuando se recarga el Excel periódicamente
-- PostgREST requiere un CONSTRAINT (no un INDEX) para on_conflict
ALTER TABLE surgeries 
  DROP CONSTRAINT IF EXISTS uq_surgeries_upsert_key;

ALTER TABLE surgeries 
  ADD CONSTRAINT uq_surgeries_upsert_key 
  UNIQUE (id_paciente, fecha_cirugia, nombre);
