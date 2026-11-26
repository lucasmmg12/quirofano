-- ==============================================================================
-- 072_gob_chequeo_mayores.sql
-- Tablas pre-agregadas ("Mayores") para el Tablero de Chequeo Preventivo
-- en Gobernanza de Datos (carga instantánea < 150ms en navegador).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.gob_chequeo_mensual (
    periodo TEXT NOT NULL,            -- 'YYYY-MM'
    sede TEXT NOT NULL,               -- 'TODAS' | 'SANTA FE' | 'SAN LUIS'
    chq_agendados INTEGER NOT NULL DEFAULT 0,
    chq_presentes INTEGER NOT NULL DEFAULT 0,
    chq_ausentes INTEGER NOT NULL DEFAULT 0,
    chq_pendientes INTEGER NOT NULL DEFAULT 0,
    inf_agendados INTEGER NOT NULL DEFAULT 0,
    inf_presentes INTEGER NOT NULL DEFAULT 0,
    inf_ausentes INTEGER NOT NULL DEFAULT 0,
    inf_pendientes INTEGER NOT NULL DEFAULT 0,
    tasa_asistencia_pct NUMERIC(5,1) NOT NULL DEFAULT 0,
    tasa_retorno_pct NUMERIC(5,1) NOT NULL DEFAULT 0,
    demora_dias_sum INTEGER NOT NULL DEFAULT 0,
    demora_dias_cnt INTEGER NOT NULL DEFAULT 0,
    edad_sum NUMERIC(10,1) NOT NULL DEFAULT 0,
    edad_cnt INTEGER NOT NULL DEFAULT 0,
    age_bins JSONB NOT NULL DEFAULT '[]'::jsonb,
    top_os JSONB NOT NULL DEFAULT '[]'::jsonb,
    top_medicos JSONB NOT NULL DEFAULT '[]'::jsonb,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (periodo, sede)
);

CREATE TABLE IF NOT EXISTS public.gob_chequeo_resumen (
    clave TEXT PRIMARY KEY,           -- 'renovacion_anual' | 'encuestas_calidad' | 'conversion_wa_mes' | 'conversion_wa_30d' | 'meta'
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gob_chequeo_mensual_periodo ON public.gob_chequeo_mensual (periodo);
CREATE INDEX IF NOT EXISTS idx_gob_chequeo_mensual_sede ON public.gob_chequeo_mensual (sede);

ALTER TABLE public.gob_chequeo_mensual ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gob_chequeo_resumen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_read_gob_chequeo_mensual" ON public.gob_chequeo_mensual;
CREATE POLICY "allow_read_gob_chequeo_mensual" ON public.gob_chequeo_mensual FOR SELECT USING (true);

DROP POLICY IF EXISTS "allow_read_gob_chequeo_resumen" ON public.gob_chequeo_resumen;
CREATE POLICY "allow_read_gob_chequeo_resumen" ON public.gob_chequeo_resumen FOR SELECT USING (true);
