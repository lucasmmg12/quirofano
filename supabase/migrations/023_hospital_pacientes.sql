-- ============================================================
-- SISTEMA ADM-QUI — Módulo Confirmación de Cirugías
-- Migración 023: Tabla hospital_pacientes (padrón maestro)
-- Fecha: 2026-03-19
-- ============================================================
-- PROBLEMA: La tabla "pacientes" fue reutilizada por el módulo de
-- enfermería (handover) con un schema distinto. Los DNIs dejaron
-- de estar disponibles para el sistema de cirugías.
--
-- SOLUCIÓN: Crear tabla "hospital_pacientes" independiente, que
-- contiene el padrón maestro del hospital (IdPaciente, DNI, etc.)
-- El sistema de cirugías la usa para enriquecer datos vía id_paciente.
-- ============================================================

-- 1) Crear tabla con el schema del padrón hospitalario
CREATE TABLE IF NOT EXISTS hospital_pacientes (
    id_paciente   INTEGER PRIMARY KEY,
    nombre        TEXT NOT NULL,
    dni           TEXT,
    edad          TEXT,
    sexo          TEXT,
    email         TEXT,
    centro        TEXT
);

-- 2) Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_hosp_pac_nombre ON hospital_pacientes USING gin (nombre gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_hosp_pac_dni    ON hospital_pacientes (dni);

-- 3) Habilitar extensión pg_trgm (si no existe)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 4) RLS: lectura para todos
ALTER TABLE hospital_pacientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hospital_pacientes_read_all"
    ON hospital_pacientes FOR SELECT
    TO anon, authenticated
    USING (true);

-- Política de escritura (para el import masivo)
CREATE POLICY "hospital_pacientes_write_all"
    ON hospital_pacientes FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);
