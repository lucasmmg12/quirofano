-- =====================================================
-- 033_altas_asignacion.sql
-- Sistema de criterios de asignación para Altas Administrativas
-- Matching jerárquico: OS + Especialidad + Proceso → Responsable + Tutor
-- =====================================================

-- Tabla de criterios
CREATE TABLE IF NOT EXISTS altas_asignacion (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    obra_social TEXT NOT NULL,
    especialidad TEXT,           -- NULL = aplica a toda la OS
    proceso TEXT,                -- NULL = aplica a toda la especialidad
    responsable TEXT NOT NULL,
    tutor TEXT,
    -- Prioridad calculada automáticamente según especificidad
    prioridad INT GENERATED ALWAYS AS (
        CASE
            WHEN proceso IS NOT NULL AND proceso != '' THEN 3       -- Más específico
            WHEN especialidad IS NOT NULL AND especialidad != '' THEN 2  -- Medio
            ELSE 1                                                       -- General (solo OS)
        END
    ) STORED,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by TEXT
);

-- Índice para búsquedas de matching rápido
CREATE INDEX IF NOT EXISTS idx_asignacion_lookup 
    ON altas_asignacion(obra_social, especialidad, proceso);

-- Índice para filtrado por responsable
CREATE INDEX IF NOT EXISTS idx_asignacion_responsable
    ON altas_asignacion(responsable);

-- RLS
ALTER TABLE altas_asignacion ENABLE ROW LEVEL SECURITY;

-- Todos pueden leer
CREATE POLICY "asignacion_select_all" ON altas_asignacion
    FOR SELECT USING (true);

-- Solo jcorrea y lmarinero pueden escribir (insert/update/delete)
-- En producción usamos service_role key, así que dejamos permiso total
-- El control se hace en frontend por email del usuario
CREATE POLICY "asignacion_write_all" ON altas_asignacion
    FOR ALL USING (true);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_asignacion_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_asignacion_updated
    BEFORE UPDATE ON altas_asignacion
    FOR EACH ROW
    EXECUTE FUNCTION update_asignacion_timestamp();
