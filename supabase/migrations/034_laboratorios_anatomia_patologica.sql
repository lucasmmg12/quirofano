-- Migration: 034_laboratorios_anatomia_patologica.sql
-- Descripción: Tabla para alojar los estudios de anatomía patológica y la asignación manual de módulos por parte de los laboratorios.

CREATE TABLE IF NOT EXISTS public.laboratorios_anatomia_patologica (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_visita TEXT UNIQUE NOT NULL,
    fecha_visita DATE NOT NULL,
    paciente TEXT,
    dni TEXT,
    cliente TEXT,
    coseguro TEXT,
    laboratorio TEXT,
    biopsia_congelacion TEXT,
    biopsia_simple TEXT,
    material_biopsia_simple TEXT,
    biopsia_ampliada TEXT,
    material_biopsia_ampliada TEXT,
    
    -- Campos gestionados por la plataforma
    modulo_asignado TEXT, -- 'Módulo A', 'Módulo B', 'Módulo C', etc.
    clasificado_at TIMESTAMPTZ,
    clasificado_por TEXT, -- Puede conectarse con id de usuario o nombre
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.laboratorios_anatomia_patologica ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
CREATE POLICY "laboratorios_full_access" ON public.laboratorios_anatomia_patologica
    FOR ALL USING (true) WITH CHECK (true);

-- Función y Trigger para updated_at
CREATE OR REPLACE FUNCTION update_laboratorios_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_laboratorios_anatomia_patologica_updated_at ON public.laboratorios_anatomia_patologica;
CREATE TRIGGER trg_laboratorios_anatomia_patologica_updated_at
BEFORE UPDATE ON public.laboratorios_anatomia_patologica
FOR EACH ROW
EXECUTE FUNCTION update_laboratorios_timestamp();
