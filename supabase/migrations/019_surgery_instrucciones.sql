-- ============================================================
-- 019: Campo instrucciones de quirófano
-- Se importa desde el Excel y se muestra en RecepcionView
-- Vinculado por id_paciente para persistir entre re-importaciones
-- ============================================================

ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS instrucciones TEXT;
