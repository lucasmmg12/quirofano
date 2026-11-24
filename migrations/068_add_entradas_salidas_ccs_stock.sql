-- Migración 068: Agregar Entradas y Salidas reales (30d y 90d) a gob_ccs_stock_actual
ALTER TABLE public.gob_ccs_stock_actual
    ADD COLUMN IF NOT EXISTS entradas_30d NUMERIC(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS entradas_90d NUMERIC(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS salidas_30d NUMERIC(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS salidas_90d NUMERIC(14, 2) NOT NULL DEFAULT 0;
