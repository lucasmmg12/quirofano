-- =============================================================================
-- Migración 073: Submódulo Transversal "Reuniones de Servicio" (Gobernanza)
-- Cubre los 3 pilares documentales para cada sector (DxI, UCI, Guardia, Quirófano, etc.):
--   1. gob_reuniones_informes  -> Informe Ejecutivo de Servicio Mensual (RDIR 04) + Fotos
--   2. gob_reuniones_revision  -> Revisión por la Dirección (Evaluación por período)
--   3. gob_reuniones_objetivos -> Propuesta y Gestión Accionable de Objetivos Anuales
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.gob_reuniones_informes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sector_id TEXT NOT NULL,
    servicio_nombre TEXT NOT NULL,
    periodo TEXT NOT NULL, -- YYYY-MM (ej. '2026-07')
    codigo_registro TEXT NOT NULL DEFAULT 'RDIR 04',
    objetivo_informe TEXT DEFAULT 'Presentar a la Dirección el estado mensual del servicio para facilitar el seguimiento del Plan de Acción, el análisis de oportunidades de mejora, la evaluación de los Indicadores del Servicio y la toma de decisiones.',
    responsable TEXT DEFAULT '',
    tutor TEXT DEFAULT '',
    fecha_reunion TEXT DEFAULT '',
    participantes TEXT DEFAULT '',
    estado_general TEXT DEFAULT 'Favorable, con oportunidades de mejora',
    resumen_ejecutivo TEXT DEFAULT '',
    compromisos_acordados JSONB NOT NULL DEFAULT '[]'::jsonb,
    compromisos_sugeridos JSONB NOT NULL DEFAULT '[]'::jsonb,
    plan_accion JSONB NOT NULL DEFAULT '[]'::jsonb,
    oportunidades_mejora JSONB NOT NULL DEFAULT '[]'::jsonb,
    indicadores JSONB NOT NULL DEFAULT '[]'::jsonb,
    necesidades_direccion JSONB NOT NULL DEFAULT '[]'::jsonb,
    hallazgos_notas JSONB NOT NULL DEFAULT '[]'::jsonb,
    fotos JSONB NOT NULL DEFAULT '[]'::jsonb,
    insights_clave JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (sector_id, periodo)
);

CREATE INDEX IF NOT EXISTS idx_gob_reuniones_informes_sector_periodo
    ON public.gob_reuniones_informes (sector_id, periodo);

CREATE TABLE IF NOT EXISTS public.gob_reuniones_revision (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sector_id TEXT NOT NULL,
    servicio_nombre TEXT NOT NULL,
    periodo_evaluado TEXT NOT NULL, -- ej. 'Julio - Octubre 2026'
    periodos_incluidos JSONB NOT NULL DEFAULT '[]'::jsonb, -- ej. ['2026-07','2026-08','2026-09','2026-10']
    sintesis_ejecutiva TEXT DEFAULT '',
    metodologia TEXT DEFAULT '',
    resultados_generales JSONB NOT NULL DEFAULT '[]'::jsonb,
    evaluacion_ejes JSONB NOT NULL DEFAULT '[]'::jsonb,
    evolucion_indicadores JSONB NOT NULL DEFAULT '[]'::jsonb,
    nota_validacion TEXT DEFAULT '',
    logros_periodo JSONB NOT NULL DEFAULT '[]'::jsonb,
    pendientes_alertas JSONB NOT NULL DEFAULT '[]'::jsonb,
    conclusion_direccion TEXT DEFAULT '',
    pedido_proximo_ejercicio JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (sector_id, periodo_evaluado)
);

CREATE INDEX IF NOT EXISTS idx_gob_reuniones_revision_sector
    ON public.gob_reuniones_revision (sector_id);

CREATE TABLE IF NOT EXISTS public.gob_reuniones_objetivos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sector_id TEXT NOT NULL,
    servicio_nombre TEXT NOT NULL,
    anio_ejercicio INTEGER NOT NULL DEFAULT 2027,
    periodo_etiqueta TEXT NOT NULL DEFAULT 'Noviembre 2026 - Octubre 2027',
    fecha_presentacion TEXT DEFAULT 'Noviembre 2026',
    orden INTEGER NOT NULL DEFAULT 1,
    objetivo TEXT NOT NULL,
    linea_base TEXT DEFAULT '',
    resultado_esperado TEXT DEFAULT '',
    indicador TEXT DEFAULT '',
    formula_medicion TEXT DEFAULT '',
    meta TEXT DEFAULT '',
    plazo TEXT DEFAULT '',
    responsable TEXT DEFAULT '',
    acciones_principales JSONB NOT NULL DEFAULT '[]'::jsonb,
    necesidades_apoyo TEXT DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'En ejecución',
    progreso_pct INTEGER NOT NULL DEFAULT 0,
    vinculo_bitrix TEXT DEFAULT '',
    valor_actual TEXT DEFAULT '',
    notas_seguimiento TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (sector_id, anio_ejercicio, orden)
);

CREATE INDEX IF NOT EXISTS idx_gob_reuniones_objetivos_sector_anio
    ON public.gob_reuniones_objetivos (sector_id, anio_ejercicio, orden);

-- Habilitar RLS con políticas institucionales abiertas para lectura y gestión
ALTER TABLE public.gob_reuniones_informes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gob_reuniones_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gob_reuniones_objetivos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gob_reuniones_informes' AND policyname = 'gob_reuniones_informes_all') THEN
        CREATE POLICY gob_reuniones_informes_all ON public.gob_reuniones_informes FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gob_reuniones_revision' AND policyname = 'gob_reuniones_revision_all') THEN
        CREATE POLICY gob_reuniones_revision_all ON public.gob_reuniones_revision FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gob_reuniones_objetivos' AND policyname = 'gob_reuniones_objetivos_all') THEN
        CREATE POLICY gob_reuniones_objetivos_all ON public.gob_reuniones_objetivos FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

GRANT ALL ON TABLE public.gob_reuniones_informes TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.gob_reuniones_revision TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.gob_reuniones_objetivos TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
