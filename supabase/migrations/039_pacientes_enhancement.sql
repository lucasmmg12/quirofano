-- ============================================================
-- 039: Enhancement de hospital_pacientes para módulo Pacientes 360°
-- Agrega campos de cruce (nhc, telefono) y metadata
-- ============================================================

-- Campos adicionales para cruce con deudas_pacientes, surgeries, etc.
ALTER TABLE hospital_pacientes ADD COLUMN IF NOT EXISTS nhc TEXT;
ALTER TABLE hospital_pacientes ADD COLUMN IF NOT EXISTS telefono TEXT;
ALTER TABLE hospital_pacientes ADD COLUMN IF NOT EXISTS notas TEXT;
ALTER TABLE hospital_pacientes ADD COLUMN IF NOT EXISTS manual BOOLEAN DEFAULT false;
ALTER TABLE hospital_pacientes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE hospital_pacientes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Índices para búsqueda
CREATE INDEX IF NOT EXISTS idx_hosp_pac_nhc ON hospital_pacientes(nhc);
CREATE INDEX IF NOT EXISTS idx_hosp_pac_telefono ON hospital_pacientes(telefono);
