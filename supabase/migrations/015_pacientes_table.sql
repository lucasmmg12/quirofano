-- ============================================================
-- 015: Tabla de pacientes para búsqueda rápida
-- ============================================================

CREATE TABLE IF NOT EXISTS pacientes (
    id_paciente   INTEGER PRIMARY KEY,
    nombre        TEXT NOT NULL,
    dni           TEXT,
    edad          TEXT,
    sexo          TEXT,
    email         TEXT,
    centro        TEXT
);

-- Índices para búsqueda rápida por nombre y DNI
CREATE INDEX IF NOT EXISTS idx_pacientes_nombre ON pacientes USING gin (nombre gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pacientes_dni    ON pacientes (dni);

-- Habilitar extensión pg_trgm para búsquedas fuzzy (si no existe)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- RLS: lectura para todos los usuarios autenticados
ALTER TABLE pacientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pacientes_read_all"
    ON pacientes FOR SELECT
    TO anon, authenticated
    USING (true);
