-- 052_libre_de_deuda_certificados.sql
-- Tabla para registrar los certificados de libre deuda emitidos
CREATE TABLE IF NOT EXISTS public.libre_de_deuda_certificados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo TEXT UNIQUE NOT NULL,
    paciente_nombre TEXT NOT NULL,
    paciente_dni TEXT,
    n_internacion TEXT,
    garante_nombre TEXT,
    asesor_nombre TEXT NOT NULL,
    fecha_emision TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_texto TEXT,
    nhc TEXT,
    id_paciente UUID,
    observaciones TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ldd_certificados_nhc ON public.libre_de_deuda_certificados(nhc);
CREATE INDEX IF NOT EXISTS idx_ldd_certificados_dni ON public.libre_de_deuda_certificados(paciente_dni);
CREATE INDEX IF NOT EXISTS idx_ldd_certificados_codigo ON public.libre_de_deuda_certificados(codigo);

ALTER TABLE public.libre_de_deuda_certificados ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'libre_de_deuda_certificados' 
          AND policyname = 'libre_de_deuda_certificados_all'
    ) THEN 
        CREATE POLICY "libre_de_deuda_certificados_all" ON public.libre_de_deuda_certificados FOR ALL USING (true) WITH CHECK (true);
    END IF; 
END $$;

GRANT ALL ON public.libre_de_deuda_certificados TO anon, authenticated;
