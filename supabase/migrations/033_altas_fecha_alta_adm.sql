-- =============================================
-- 033: Agregar campo fecha_alta_adm para tracking de demora
-- =============================================
-- Timestamp que registra CUÁNDO se completó el alta administrativa
-- Permite calcular: demora = fecha_alta_adm - created_at

ALTER TABLE altas_administrativas
ADD COLUMN IF NOT EXISTS fecha_alta_adm TIMESTAMPTZ;

-- Índice para queries de demora
CREATE INDEX IF NOT EXISTS idx_altas_adm_fecha_alta_adm ON altas_administrativas(fecha_alta_adm);

-- Backfill: Para registros que ya tienen control_adm_finalizado = 'Sí'
-- usamos updated_at como aproximación del momento en que se completó
UPDATE altas_administrativas
SET fecha_alta_adm = updated_at
WHERE control_adm_finalizado = 'Sí'
  AND fecha_alta_adm IS NULL;
