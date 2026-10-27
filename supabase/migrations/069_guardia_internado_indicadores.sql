-- 069: Indicadores de Guardia Clínica (Franjas Puerta-Médico, Admisiones Clínicas Destinos, Reinternaciones y Seguimiento Internado)
-- Sanatorio Argentino · Gobernanza y Calidad QOAG · Octubre 2026

-- 1. Tabla de Tiempos Puerta-Médico por Franjas Horarias (08-13, 13-21, 21-08)
CREATE TABLE IF NOT EXISTS public.guardia_franjas_tiempos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    periodo TEXT NOT NULL,                     -- Ej: '2026-10'
    fecha DATE,                               -- NULL para acumulado mensual o fecha YYYY-MM-DD
    franja TEXT NOT NULL,                     -- '08 a 13', '13 a 21', '21 a 08'
    consultas_total INTEGER NOT NULL DEFAULT 0,
    espera_min NUMERIC(6,2) DEFAULT 0,
    espera_max NUMERIC(6,2) DEFAULT 0,
    espera_avg NUMERIC(6,2) DEFAULT 0,
    espera_mediana NUMERIC(6,2) DEFAULT 0,
    cumplimiento_meta_pct NUMERIC(5,2) DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_guardia_franjas_uniq 
ON public.guardia_franjas_tiempos (periodo, franja, COALESCE(fecha, '1970-01-01'::date));

CREATE INDEX IF NOT EXISTS idx_guardia_franjas_periodo 
ON public.guardia_franjas_tiempos(periodo);

-- 2. Trazabilidad de Admisiones Médicas Clínicas (Total, Destinos: Quirófano/Internado/UCI, Reinternaciones <= 72h)
CREATE TABLE IF NOT EXISTS public.guardia_admisiones_clinicas_resumen (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    periodo TEXT NOT NULL UNIQUE,              -- Ej: '2026-10'
    total_admisiones_clinicas INTEGER NOT NULL DEFAULT 0,
    destino_quirofano_count INTEGER NOT NULL DEFAULT 0,
    destino_quirofano_pct NUMERIC(5,2) DEFAULT 0,
    destino_internado_count INTEGER NOT NULL DEFAULT 0,
    destino_internado_pct NUMERIC(5,2) DEFAULT 0,
    destino_uci_count INTEGER NOT NULL DEFAULT 0,
    destino_uci_pct NUMERIC(5,2) DEFAULT 0,
    destino_otros_count INTEGER NOT NULL DEFAULT 0,
    destino_otros_pct NUMERIC(5,2) DEFAULT 0,
    reinternaciones_72h_count INTEGER NOT NULL DEFAULT 0,
    reinternaciones_72h_pct NUMERIC(5,2) DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adm_clinicas_periodo 
ON public.guardia_admisiones_clinicas_resumen(periodo);

-- 3. Registro de Seguimiento Clínico en Internado
-- Auditando evoluciones diarias del plantel médico (Dra. Garcia, Benavidez, Torres, Verni, Padilla, Jofre, Maldonado)
CREATE TABLE IF NOT EXISTS public.internado_seguimiento_clinico_resumen (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    periodo TEXT NOT NULL,                     -- Ej: '2026-10'
    fecha DATE,                               -- NULL para acumulado mensual o fecha YYYY-MM-DD
    censo_total_internados INTEGER NOT NULL DEFAULT 0,
    pacientes_bajo_seguimiento_clinico INTEGER NOT NULL DEFAULT 0,
    cobertura_seguimiento_pct NUMERIC(5,2) DEFAULT 0,
    unicos_clinico INTEGER NOT NULL DEFAULT 0,
    unicos_postquirurgico INTEGER NOT NULL DEFAULT 0,
    unicos_traumatologico INTEGER NOT NULL DEFAULT 0,
    evoluciones_plan_documentado_pct NUMERIC(5,2) DEFAULT 0,
    evoluciones_por_medico JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_internado_seguimiento_uniq 
ON public.internado_seguimiento_clinico_resumen (periodo, COALESCE(fecha, '1970-01-01'::date));

CREATE INDEX IF NOT EXISTS idx_internado_seguimiento_periodo 
ON public.internado_seguimiento_clinico_resumen(periodo);

-- 4. Habilitar RLS y Permisos de Acceso Público / Autenticado
ALTER TABLE public.guardia_franjas_tiempos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardia_admisiones_clinicas_resumen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internado_seguimiento_clinico_resumen ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'guardia_franjas_tiempos' AND policyname = 'guardia_franjas_tiempos_all') THEN 
        CREATE POLICY "guardia_franjas_tiempos_all" ON public.guardia_franjas_tiempos FOR ALL USING (true) WITH CHECK (true);
    END IF; 

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'guardia_admisiones_clinicas_resumen' AND policyname = 'guardia_admisiones_clinicas_all') THEN 
        CREATE POLICY "guardia_admisiones_clinicas_all" ON public.guardia_admisiones_clinicas_resumen FOR ALL USING (true) WITH CHECK (true);
    END IF; 

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'internado_seguimiento_clinico_resumen' AND policyname = 'internado_seguimiento_clinico_all') THEN 
        CREATE POLICY "internado_seguimiento_clinico_all" ON public.internado_seguimiento_clinico_resumen FOR ALL USING (true) WITH CHECK (true);
    END IF; 
END $$;

GRANT ALL ON public.guardia_franjas_tiempos TO anon, authenticated, service_role;
GRANT ALL ON public.guardia_admisiones_clinicas_resumen TO anon, authenticated, service_role;
GRANT ALL ON public.internado_seguimiento_clinico_resumen TO anon, authenticated, service_role;
