-- 1. ALTAS ADMINISTRATIVAS
ALTER TABLE altas_administrativas ADD COLUMN IF NOT EXISTS carrito_por text;
ALTER TABLE altas_administrativas ADD COLUMN IF NOT EXISTS carrito_at timestamptz;
ALTER TABLE altas_administrativas ADD COLUMN IF NOT EXISTS traspaso_at timestamptz;
ALTER TABLE altas_administrativas ADD COLUMN IF NOT EXISTS devolucion_at timestamptz;

-- 2. ASOCIACIONES Y CIRUGIAS
ALTER TABLE asociaciones_cirugias ADD COLUMN IF NOT EXISTS carrito_por text;
ALTER TABLE asociaciones_cirugias ADD COLUMN IF NOT EXISTS carrito_at timestamptz;

-- 3. LABORATORIOS Y ANATOMIA PATOLOGICA
ALTER TABLE laboratorios_anatomia_patologica ADD COLUMN IF NOT EXISTS clasificado_por text;
ALTER TABLE laboratorios_anatomia_patologica ADD COLUMN IF NOT EXISTS clasificado_at timestamptz;
ALTER TABLE laboratorios_anatomia_patologica ADD COLUMN IF NOT EXISTS carrito_por text;
ALTER TABLE laboratorios_anatomia_patologica ADD COLUMN IF NOT EXISTS carrito_at timestamptz;
