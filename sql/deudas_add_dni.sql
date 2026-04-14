-- Migración: Agregar columnas DNI e id_paciente_salus a deudas_pacientes
-- para cruce con presupuestos
-- Ejecutar en Supabase SQL Editor

-- 1. Agregar columna DNI (NIF)
ALTER TABLE deudas_pacientes ADD COLUMN IF NOT EXISTS dni TEXT;

-- 2. Agregar columna id_paciente_salus (idPaciente de VIS_Pacientes)
ALTER TABLE deudas_pacientes ADD COLUMN IF NOT EXISTS id_paciente_salus TEXT;

-- 3. Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_deudas_pacientes_dni ON deudas_pacientes(dni);
CREATE INDEX IF NOT EXISTS idx_deudas_pacientes_id_paciente_salus ON deudas_pacientes(id_paciente_salus);

-- 4. Verificación
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'deudas_pacientes' 
AND column_name IN ('dni', 'id_paciente_salus');
