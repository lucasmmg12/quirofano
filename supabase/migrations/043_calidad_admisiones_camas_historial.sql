-- ==============================================================================
-- Migración 043: Tabla de Historial Granular de Camas y Traslados (Gobernanza UCI)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.calidad_admisiones_camas_historial (
    id BIGSERIAL PRIMARY KEY,
    id_admision BIGINT NOT NULL,
    numero_admision TEXT,
    paciente TEXT NOT NULL,
    nhc TEXT,
    servicio TEXT,
    habitacion TEXT NOT NULL,
    cama TEXT,
    fecha_inicio TIMESTAMPTZ NOT NULL,
    fecha_fin TIMESTAMPTZ,
    especialidad TEXT,
    cliente TEXT,
    edad INTEGER,
    motivo_de_alta TEXT,
    procedencia TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_admision_cama_inicio UNIQUE(id_admision, habitacion, fecha_inicio)
);

CREATE INDEX IF NOT EXISTS idx_camas_hist_admision ON public.calidad_admisiones_camas_historial(id_admision);
CREATE INDEX IF NOT EXISTS idx_camas_hist_servicio ON public.calidad_admisiones_camas_historial(servicio);
CREATE INDEX IF NOT EXISTS idx_camas_hist_fechas ON public.calidad_admisiones_camas_historial(fecha_inicio, fecha_fin);
CREATE INDEX IF NOT EXISTS idx_camas_hist_habitacion ON public.calidad_admisiones_camas_historial(habitacion);

-- Seguridad a nivel de fila (RLS)
ALTER TABLE public.calidad_admisiones_camas_historial ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'calidad_admisiones_camas_historial' AND policyname = 'Permitir lectura general camas historial'
    ) THEN
        CREATE POLICY "Permitir lectura general camas historial" 
        ON public.calidad_admisiones_camas_historial 
        FOR SELECT 
        USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'calidad_admisiones_camas_historial' AND policyname = 'Permitir escritura servicio camas historial'
    ) THEN
        CREATE POLICY "Permitir escritura servicio camas historial" 
        ON public.calidad_admisiones_camas_historial 
        FOR ALL 
        USING (true) 
        WITH CHECK (true);
    END IF;
END $$;
