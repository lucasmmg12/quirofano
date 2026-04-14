-- Migración: Agregar columna NHC a presupuestos para cruce con deudas
-- Ejecutar en Supabase SQL Editor

-- 1. Agregar columna nhc a presupuestos
ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS nhc TEXT;

-- 2. Índice para búsqueda rápida por NHC
CREATE INDEX IF NOT EXISTS idx_presupuestos_nhc ON presupuestos(nhc);

-- 3. (Opcional) Agregar columnas extras a deudas_pacientes si no existen
ALTER TABLE deudas_pacientes ADD COLUMN IF NOT EXISTS dni TEXT;

-- 4. Verificación
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE (table_name = 'presupuestos' AND column_name = 'nhc')
   OR (table_name = 'deudas_pacientes' AND column_name = 'dni');
