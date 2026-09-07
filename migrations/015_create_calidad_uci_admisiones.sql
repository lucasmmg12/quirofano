CREATE TABLE IF NOT EXISTS public.calidad_uci_admisiones (
    id_admision BIGINT PRIMARY KEY,
    numero_admision VARCHAR(255),
    fecha_ingreso TIMESTAMPTZ,
    fecha_alta TIMESTAMPTZ,
    especialidad VARCHAR(255),
    procedencia VARCHAR(255),
    nhc VARCHAR(255),
    paciente VARCHAR(255),
    motivo_de_alta VARCHAR(255),
    cliente VARCHAR(255),
    estado_conceptos VARCHAR(255),
    servicio VARCHAR(255),
    proceso VARCHAR(255),
    edad INTEGER,
    motivo_alta_2 VARCHAR(255),
    control_adm_finalizado VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.calidad_uci_admisiones ENABLE ROW LEVEL SECURITY;

-- Politicas
CREATE POLICY "Allow read access for authenticated users" 
ON public.calidad_uci_admisiones 
FOR SELECT 
TO authenticated 
USING (true);

-- Permitir inserts y updates mediante anon key (por si el script usa anon key en lugar de service role) o roles autenticados
CREATE POLICY "Allow full access for anon and authenticated" 
ON public.calidad_uci_admisiones 
FOR ALL
USING (true)
WITH CHECK (true);
