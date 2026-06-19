-- =============================================
-- 047: Foja Quirúrgica — Triage de Facturación
-- =============================================
-- Agrega campos a altas_administrativas para almacenar
-- la cantidad de procedimientos quirúrgicos y el nivel
-- de dificultad de facturación (triage).
-- Datos originados en TABLEAU_FojaQuirurgica de SALUS.

ALTER TABLE altas_administrativas 
ADD COLUMN IF NOT EXISTS cantidad_procedimientos INT DEFAULT 0;

ALTER TABLE altas_administrativas 
ADD COLUMN IF NOT EXISTS triage_facturacion TEXT;
-- Valores: 'Fácil' (1 proc), 'Media' (2 proc), 'Difícil' (3+ proc), NULL (sin foja)

ALTER TABLE altas_administrativas 
ADD COLUMN IF NOT EXISTS procedimientos_detalle JSONB;
-- Array con los nombres de los procedimientos: ["Proc 1", "Proc 2", ...]

-- Índice para filtros rápidos por triage
CREATE INDEX IF NOT EXISTS idx_altas_adm_triage ON altas_administrativas(triage_facturacion);
