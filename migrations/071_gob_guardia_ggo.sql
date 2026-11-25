-- Migración 071: Tablero de Gobernanza de Guardia Gineco-Obstétrica (GGO)
-- Foco: Tiempos de guardia, derivación a Ecografía de Guardia y análisis de cuello de botella Puerta GGO -> Quirófano.

-- 1. Resumen mensual consolidado de Guardia Gineco-Obstétrica (Agenda = 'GUARDIAS GINECOLOGIA')
CREATE TABLE IF NOT EXISTS public.gob_ggo_resumen_mensual (
    periodo TEXT PRIMARY KEY, -- 'YYYY-MM'
    anio INT NOT NULL,
    mes INT NOT NULL,
    total_consultas INT NOT NULL DEFAULT 0,
    consultas_ginecologia INT NOT NULL DEFAULT 0,
    consultas_obstetricia INT NOT NULL DEFAULT 0,
    consultas_n1 INT NOT NULL DEFAULT 0,
    consultas_n2 INT NOT NULL DEFAULT 0,
    consultas_n3 INT NOT NULL DEFAULT 0,
    -- Tiempos de Guardia (en minutos)
    mediana_puerta_medico_min NUMERIC(10, 1) NOT NULL DEFAULT 0,
    promedio_puerta_medico_min NUMERIC(10, 1) NOT NULL DEFAULT 0,
    p90_puerta_medico_min NUMERIC(10, 1) NOT NULL DEFAULT 0,
    mediana_atencion_ggo_min NUMERIC(10, 1) NOT NULL DEFAULT 0,
    mediana_permanencia_ggo_min NUMERIC(10, 1) NOT NULL DEFAULT 0,
    -- Derivaciones y Resoluciones
    derivaciones_eco_guardia INT NOT NULL DEFAULT 0,
    pct_eco_guardia NUMERIC(6, 2) NOT NULL DEFAULT 0,
    pases_internacion INT NOT NULL DEFAULT 0,
    pct_internacion NUMERIC(6, 2) NOT NULL DEFAULT 0,
    derivaciones_quirofano_total INT NOT NULL DEFAULT 0,
    derivaciones_quirofano_urgencia INT NOT NULL DEFAULT 0,
    derivaciones_quirofano_programadas_excluidas INT NOT NULL DEFAULT 0,
    pct_conversion_quirofano NUMERIC(6, 2) NOT NULL DEFAULT 0,
    -- Cuello de botella GGO -> Quirófano (medianas en minutos)
    mediana_qx_tramo1_espera_ggo_min NUMERIC(10, 1) NOT NULL DEFAULT 0,
    mediana_qx_tramo2_atencion_ggo_min NUMERIC(10, 1) NOT NULL DEFAULT 0,
    mediana_qx_tramo3_post_ggo_adm_min NUMERIC(10, 1) NOT NULL DEFAULT 0,
    mediana_qx_tramo4_adm_qx_min NUMERIC(10, 1) NOT NULL DEFAULT 0,
    mediana_qx_total_puerta_qx_min NUMERIC(10, 1) NOT NULL DEFAULT 0,
    p90_qx_total_puerta_qx_min NUMERIC(10, 1) NOT NULL DEFAULT 0,
    -- Calidad
    reconsultas_72h INT NOT NULL DEFAULT 0,
    pct_reconsultas_72h NUMERIC(6, 2) NOT NULL DEFAULT 0,
    -- Rankings JSONB para carga instantánea
    top_medicos_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    top_obras_sociales_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Detalle nominal caso por caso de pacientes GGO que derivan en Quirófano (0-48hs)
CREATE TABLE IF NOT EXISTS public.gob_ggo_quirofano_tiempos (
    id BIGSERIAL PRIMARY KEY,
    id_visita_ggo BIGINT NOT NULL,
    periodo TEXT NOT NULL, -- 'YYYY-MM'
    fecha_ggo DATE NOT NULL,
    nhc TEXT,
    dni TEXT,
    paciente TEXT NOT NULL,
    obra_social TEXT,
    rama TEXT NOT NULL DEFAULT 'GINECOLOGIA', -- 'OBSTETRICIA' | 'GINECOLOGIA'
    prioridad TEXT NOT NULL DEFAULT 'N3', -- 'N1' | 'N2' | 'N3'
    tipo_visita_ggo TEXT,
    medico_ggo TEXT,
    franja_horaria TEXT, -- '08 a 14' | '14 a 22' | '22 a 08'
    dia_semana TEXT,
    -- Timestamps de la cadena clínica (ISO)
    t0_entrada_ggo TIMESTAMPTZ,
    t2_inicio_medico_ggo TIMESTAMPTZ,
    t3_salida_ggo TIMESTAMPTZ,
    t4_admision_hosp TIMESTAMPTZ,
    t5_inicio_quirofano TIMESTAMPTZ,
    t6_fin_quirofano TIMESTAMPTZ,
    -- Tramos en minutos
    min_tramo1_puerta_medico NUMERIC(10, 1),
    min_tramo2_atencion_ggo NUMERIC(10, 1),
    min_tramo3_post_ggo_adm NUMERIC(10, 1),
    min_tramo4_adm_quirofano NUMERIC(10, 1),
    min_total_ggo NUMERIC(10, 1),       -- Tramo 1 + Tramo 2
    min_total_post_ggo NUMERIC(10, 1),  -- Tramo 3 + Tramo 4
    min_total_puerta_qx NUMERIC(10, 1), -- T0 -> T5
    cuello_botella_dominante TEXT,      -- 'ESPERA_MEDICO_GGO' | 'ATENCION_GGO' | 'ADMISION_PRE_QX' | 'ESPERA_QUIROFANO'
    cumple_meta BOOLEAN NOT NULL DEFAULT TRUE,
    -- Datos de la cirugía y admisión
    numero_admision TEXT,
    nombre_cirugia TEXT,
    especialidad_cx TEXT,
    cirujano TEXT,
    estado_cx TEXT,
    es_urgencia_real BOOLEAN NOT NULL DEFAULT TRUE,
    -- Derivación a Ecografía de Guardia (GUARDIAS ECOGRAFIAS en ventana 0-12h)
    tuvo_eco_guardia BOOLEAN NOT NULL DEFAULT FALSE,
    eco_guardia_tipo TEXT,
    eco_guardia_fecha TIMESTAMPTZ,
    min_ggo_a_eco NUMERIC(10, 1),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id_visita_ggo, nombre_cirugia, t5_inicio_quirofano)
);

CREATE INDEX IF NOT EXISTS idx_gob_ggo_qx_periodo ON public.gob_ggo_quirofano_tiempos (periodo);
CREATE INDEX IF NOT EXISTS idx_gob_ggo_qx_fecha ON public.gob_ggo_quirofano_tiempos (fecha_ggo);
CREATE INDEX IF NOT EXISTS idx_gob_ggo_qx_rama ON public.gob_ggo_quirofano_tiempos (rama);
CREATE INDEX IF NOT EXISTS idx_gob_ggo_qx_urg ON public.gob_ggo_quirofano_tiempos (es_urgencia_real);

-- 3. Desglose mensual por franja horaria y día de semana para mapa de tiempos GGO
CREATE TABLE IF NOT EXISTS public.gob_ggo_franjas_tiempos (
    id BIGSERIAL PRIMARY KEY,
    periodo TEXT NOT NULL,
    franja_horaria TEXT NOT NULL, -- '08 a 14' | '14 a 22' | '22 a 08'
    dia_semana TEXT NOT NULL,     -- 'Lunes'..'Domingo' | 'TODOS'
    total_consultas INT NOT NULL DEFAULT 0,
    consultas_obstetricia INT NOT NULL DEFAULT 0,
    consultas_ginecologia INT NOT NULL DEFAULT 0,
    mediana_puerta_medico_min NUMERIC(10, 1) NOT NULL DEFAULT 0,
    promedio_puerta_medico_min NUMERIC(10, 1) NOT NULL DEFAULT 0,
    mediana_permanencia_min NUMERIC(10, 1) NOT NULL DEFAULT 0,
    derivaciones_eco INT NOT NULL DEFAULT 0,
    derivaciones_qx INT NOT NULL DEFAULT 0,
    mediana_puerta_qx_min NUMERIC(10, 1) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (periodo, franja_horaria, dia_semana)
);

CREATE INDEX IF NOT EXISTS idx_gob_ggo_franjas_periodo ON public.gob_ggo_franjas_tiempos (periodo);

-- RLS Policies (lectura pública autenticada / anon para tablero interno)
ALTER TABLE public.gob_ggo_resumen_mensual ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gob_ggo_quirofano_tiempos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gob_ggo_franjas_tiempos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gob_ggo_resumen_mensual' AND policyname = 'allow_all_gob_ggo_resumen') THEN
        CREATE POLICY allow_all_gob_ggo_resumen ON public.gob_ggo_resumen_mensual FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gob_ggo_quirofano_tiempos' AND policyname = 'allow_all_gob_ggo_qx') THEN
        CREATE POLICY allow_all_gob_ggo_qx ON public.gob_ggo_quirofano_tiempos FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gob_ggo_franjas_tiempos' AND policyname = 'allow_all_gob_ggo_franjas') THEN
        CREATE POLICY allow_all_gob_ggo_franjas ON public.gob_ggo_franjas_tiempos FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
