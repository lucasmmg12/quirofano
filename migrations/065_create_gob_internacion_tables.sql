-- Migración 065: Tablas y RPCs para Tablero de Internación (Gobernanza de Datos)
-- Fuente: SALUS SQL Server (TABLEAU_Admisiones, TABLEAU_Admisiones con historial de camas2, VLISE_HabitacionesCamas)

-- 1. Tabla pre-agregada mensual (2021-2026+) para gráficos multianuales y matrices instantáneas
CREATE TABLE IF NOT EXISTS public.gob_internacion_mensual_agg (
    id BIGSERIAL PRIMARY KEY,
    anio INT NOT NULL,
    mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
    sector TEXT NOT NULL,
    subsector TEXT NOT NULL DEFAULT '',
    cliente TEXT NOT NULL DEFAULT 'PARTICULAR',
    especialidad TEXT NOT NULL DEFAULT 'SIN ESPECIALIDAD',
    es_hierro BOOLEAN NOT NULL DEFAULT FALSE,
    ingresos INT NOT NULL DEFAULT 0,
    egresos INT NOT NULL DEFAULT 0,
    dias_cama NUMERIC(10, 2) NOT NULL DEFAULT 0,
    horas_ocupacion NUMERIC(10, 2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_gob_int_mensual UNIQUE (anio, mes, sector, subsector, cliente, especialidad, es_hierro)
);

CREATE INDEX IF NOT EXISTS idx_gob_int_agg_anio_mes ON public.gob_internacion_mensual_agg (anio, mes);
CREATE INDEX IF NOT EXISTS idx_gob_int_agg_sector ON public.gob_internacion_mensual_agg (sector, subsector);
CREATE INDEX IF NOT EXISTS idx_gob_int_agg_cliente ON public.gob_internacion_mensual_agg (cliente);
CREATE INDEX IF NOT EXISTS idx_gob_int_agg_esp ON public.gob_internacion_mensual_agg (especialidad);

-- 2. Tabla nominal de admisiones para Detalles de Internaciones, Detalle de Pacientes y Exportación Excel
CREATE TABLE IF NOT EXISTS public.gob_internacion_admisiones (
    id_admision BIGINT PRIMARY KEY,
    numero_admision TEXT,
    paciente TEXT NOT NULL,
    nhc TEXT,
    nif TEXT,
    fecha_ingreso TIMESTAMPTZ NOT NULL,
    fecha_alta TIMESTAMPTZ,
    sector_arreglado TEXT NOT NULL,
    subsector TEXT NOT NULL DEFAULT '',
    servicio_salus TEXT,
    habitacion TEXT,
    cliente TEXT NOT NULL DEFAULT 'PARTICULAR',
    doctor TEXT NOT NULL DEFAULT 'SIN MÉDICO',
    especialidad TEXT NOT NULL DEFAULT 'SIN ESPECIALIDAD',
    proceso TEXT,
    motivo_alta TEXT,
    es_hierro BOOLEAN NOT NULL DEFAULT FALSE,
    dias_cama_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
    horas_ocupacion NUMERIC(10, 2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gob_int_adm_ingreso ON public.gob_internacion_admisiones (fecha_ingreso);
CREATE INDEX IF NOT EXISTS idx_gob_int_adm_alta ON public.gob_internacion_admisiones (fecha_alta);
CREATE INDEX IF NOT EXISTS idx_gob_int_adm_sector ON public.gob_internacion_admisiones (sector_arreglado);
CREATE INDEX IF NOT EXISTS idx_gob_int_adm_cliente ON public.gob_internacion_admisiones (cliente);
CREATE INDEX IF NOT EXISTS idx_gob_int_adm_doctor ON public.gob_internacion_admisiones (doctor);

-- 3. Configuración editable de dotación de camas/boxes operativas por sector y año
CREATE TABLE IF NOT EXISTS public.gob_internacion_camas_config (
    id SERIAL PRIMARY KEY,
    sector TEXT NOT NULL,
    subsector TEXT NOT NULL DEFAULT '',
    anio INT NOT NULL,
    camas_operativas NUMERIC(6, 2) NOT NULL,
    horas_mes_hdd NUMERIC(8, 2),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_gob_int_camas_cfg UNIQUE (sector, subsector, anio)
);

-- Seed inicial de dotaciones operativas (calibradas con SALUS VLISE_HabitacionesCamas y editables en UI)
INSERT INTO public.gob_internacion_camas_config (sector, subsector, anio, camas_operativas, horas_mes_hdd)
VALUES
    ('INTERNADO', '', 2021, 32, NULL),
    ('INTERNADO', '', 2022, 32, NULL),
    ('INTERNADO', '', 2023, 32, NULL),
    ('INTERNADO', '', 2024, 32, NULL),
    ('INTERNADO', '', 2025, 38, NULL),
    ('INTERNADO', '', 2026, 40, NULL),
    ('NEONATOLOGIA', '', 2021, 12, NULL),
    ('NEONATOLOGIA', '', 2022, 12, NULL),
    ('NEONATOLOGIA', '', 2023, 12, NULL),
    ('NEONATOLOGIA', '', 2024, 12, NULL),
    ('NEONATOLOGIA', '', 2025, 15, NULL),
    ('NEONATOLOGIA', '', 2026, 18, NULL),
    ('PEDIATRIA', 'PISO', 2022, 9, NULL),
    ('PEDIATRIA', 'PISO', 2023, 9, NULL),
    ('PEDIATRIA', 'PISO', 2024, 9, NULL),
    ('PEDIATRIA', 'PISO', 2025, 9, NULL),
    ('PEDIATRIA', 'PISO', 2026, 9, NULL),
    ('PEDIATRIA', 'TERAPIA', 2022, 4, NULL),
    ('PEDIATRIA', 'TERAPIA', 2023, 4, NULL),
    ('PEDIATRIA', 'TERAPIA', 2024, 4, NULL),
    ('PEDIATRIA', 'TERAPIA', 2025, 4, NULL),
    ('PEDIATRIA', 'TERAPIA', 2026, 4, NULL),
    ('UCI', '', 2025, 8, NULL),
    ('UCI', '', 2026, 8, NULL),
    ('TERAPIA INTERMEDIA', '', 2025, 8, NULL),
    ('TERAPIA INTERMEDIA', '', 2026, 8, NULL),
    ('HOSPITAL DE DIA', '', 2022, 11, 1200),
    ('HOSPITAL DE DIA', '', 2023, 11, 1200),
    ('HOSPITAL DE DIA', '', 2024, 11, 1200),
    ('HOSPITAL DE DIA', '', 2025, 11, 1200),
    ('HOSPITAL DE DIA', '', 2026, 11, 1200)
ON CONFLICT (sector, subsector, anio) DO NOTHING;

-- 4. Nómina editable de Médicos Inquilinos (para gráfico Internación de Inquilinos SI vs NULL)
CREATE TABLE IF NOT EXISTS public.gob_internacion_inquilinos (
    id SERIAL PRIMARY KEY,
    doctor_nombre TEXT NOT NULL UNIQUE,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    observaciones TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. RPC de agregación ultra-rápida para gráficos multianuales y matrices
CREATE OR REPLACE FUNCTION public.get_gob_internacion_mensual(
    p_cliente TEXT DEFAULT NULL,
    p_especialidad TEXT DEFAULT NULL
)
RETURNS TABLE (
    anio INT,
    mes INT,
    sector TEXT,
    subsector TEXT,
    es_hierro BOOLEAN,
    ingresos BIGINT,
    egresos BIGINT,
    dias_cama NUMERIC,
    horas_ocupacion NUMERIC
)
LANGUAGE SQL
STABLE
AS $$
    SELECT
        a.anio,
        a.mes,
        a.sector,
        a.subsector,
        a.es_hierro,
        SUM(a.ingresos)::BIGINT AS ingresos,
        SUM(a.egresos)::BIGINT AS egresos,
        ROUND(SUM(a.dias_cama)::NUMERIC, 2) AS dias_cama,
        ROUND(SUM(a.horas_ocupacion)::NUMERIC, 2) AS horas_ocupacion
    FROM public.gob_internacion_mensual_agg a
    WHERE (p_cliente IS NULL OR p_cliente = '' OR a.cliente = p_cliente)
      AND (p_especialidad IS NULL OR p_especialidad = '' OR a.especialidad = p_especialidad)
    GROUP BY a.anio, a.mes, a.sector, a.subsector, a.es_hierro
    ORDER BY a.anio ASC, a.mes ASC;
$$;

-- RPC para obtener listas únicas de Clientes (Obras Sociales) y Especialidades para los selectores
CREATE OR REPLACE FUNCTION public.get_gob_internacion_filtros()
RETURNS JSON
LANGUAGE SQL
STABLE
AS $$
    SELECT json_build_object(
        'clientes', (SELECT COALESCE(json_agg(c ORDER BY c), '[]'::json) FROM (SELECT DISTINCT cliente AS c FROM public.gob_internacion_mensual_agg WHERE cliente IS NOT NULL AND cliente <> '') t),
        'especialidades', (SELECT COALESCE(json_agg(e ORDER BY e), '[]'::json) FROM (SELECT DISTINCT especialidad AS e FROM public.gob_internacion_mensual_agg WHERE especialidad IS NOT NULL AND especialidad <> '') t),
        'last_sync', (SELECT MAX(updated_at) FROM public.gob_internacion_mensual_agg)
    );
$$;

-- RLS Policies
ALTER TABLE public.gob_internacion_mensual_agg ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gob_internacion_admisiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gob_internacion_camas_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gob_internacion_inquilinos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_gob_int_agg" ON public.gob_internacion_mensual_agg;
CREATE POLICY "allow_all_gob_int_agg" ON public.gob_internacion_mensual_agg FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_gob_int_adm" ON public.gob_internacion_admisiones;
CREATE POLICY "allow_all_gob_int_adm" ON public.gob_internacion_admisiones FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_gob_int_camas" ON public.gob_internacion_camas_config;
CREATE POLICY "allow_all_gob_int_camas" ON public.gob_internacion_camas_config FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_gob_int_inq" ON public.gob_internacion_inquilinos;
CREATE POLICY "allow_all_gob_int_inq" ON public.gob_internacion_inquilinos FOR ALL USING (true) WITH CHECK (true);

GRANT EXECUTE ON FUNCTION public.get_gob_internacion_mensual(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_gob_internacion_filtros() TO anon, authenticated, service_role;
