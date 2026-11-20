-- Migración 067: Derivaciones (Traspasos) y Pedidos Internos por Sector
-- Fuente: SALUS SQL Server (FM_PeticionesTraspaso, FM_Lineas_PeticionesTraspaso, FM_Traspasos, FM_Lineas_Traspasos)

-- 1. Resumen mensual por Sector (Pedidos realizados + Artículos/Unidades/Importe derivado)
CREATE TABLE IF NOT EXISTS public.gob_ccs_sectores_derivaciones_mensual (
    id BIGSERIAL PRIMARY KEY,
    anio INT NOT NULL,
    mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
    ym INT GENERATED ALWAYS AS (anio * 100 + mes) STORED,
    id_sector INT NOT NULL,
    sector TEXT NOT NULL,
    grupo_almacen TEXT NOT NULL DEFAULT 'CLINICO',
    pedidos_count INT NOT NULL DEFAULT 0,
    pedidos_servidos INT NOT NULL DEFAULT 0,
    pedidos_pendientes INT NOT NULL DEFAULT 0,
    unidades_pedidas NUMERIC(14, 2) NOT NULL DEFAULT 0,
    articulos_pedidos_unicos INT NOT NULL DEFAULT 0,
    traspasos_recibidos INT NOT NULL DEFAULT 0,
    unidades_derivadas NUMERIC(14, 2) NOT NULL DEFAULT 0,
    articulos_derivados_unicos INT NOT NULL DEFAULT 0,
    importe_derivado NUMERIC(16, 2) NOT NULL DEFAULT 0,
    lead_time_prom_hs NUMERIC(10, 1),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_gob_ccs_sec_der_mensual UNIQUE (anio, mes, id_sector)
);

CREATE INDEX IF NOT EXISTS idx_gob_ccs_sec_der_ym ON public.gob_ccs_sectores_derivaciones_mensual (ym);
CREATE INDEX IF NOT EXISTS idx_gob_ccs_sec_der_sector ON public.gob_ccs_sectores_derivaciones_mensual (sector);

-- 2. Detalle mensual por Sector × Artículo (para saber exactamente qué y cuántos artículos se derivan a cada sector)
CREATE TABLE IF NOT EXISTS public.gob_ccs_sectores_articulos_mensual (
    id BIGSERIAL PRIMARY KEY,
    anio INT NOT NULL,
    mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
    ym INT GENERATED ALWAYS AS (anio * 100 + mes) STORED,
    id_sector INT NOT NULL,
    sector TEXT NOT NULL,
    grupo_almacen TEXT NOT NULL DEFAULT 'CLINICO',
    id_articulo INT NOT NULL,
    articulo TEXT NOT NULL,
    pedidos_count INT NOT NULL DEFAULT 0,
    unidades_pedidas NUMERIC(14, 2) NOT NULL DEFAULT 0,
    traspasos_count INT NOT NULL DEFAULT 0,
    unidades_derivadas NUMERIC(14, 2) NOT NULL DEFAULT 0,
    importe_derivado NUMERIC(16, 2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_gob_ccs_sec_art_mensual UNIQUE (anio, mes, id_sector, id_articulo)
);

CREATE INDEX IF NOT EXISTS idx_gob_ccs_sec_art_ym ON public.gob_ccs_sectores_articulos_mensual (ym);
CREATE INDEX IF NOT EXISTS idx_gob_ccs_sec_art_sector ON public.gob_ccs_sectores_articulos_mensual (sector);

-- 3. Pedidos internos individuales (últimos 180 días + pendientes) para trazabilidad pedido por pedido
CREATE TABLE IF NOT EXISTS public.gob_ccs_pedidos_internos (
    id_peticion BIGINT PRIMARY KEY,
    fecha TIMESTAMPTZ NOT NULL,
    fecha_servido TIMESTAMPTZ,
    estado TEXT NOT NULL DEFAULT 'PENDIENTE', -- 'PENDIENTE' | 'SERVIDO'
    id_almacen_origen INT NOT NULL,
    almacen_origen TEXT NOT NULL,
    id_sector INT NOT NULL,
    sector TEXT NOT NULL,
    grupo_almacen TEXT NOT NULL DEFAULT 'CLINICO',
    items_count INT NOT NULL DEFAULT 0,
    unidades_pedidas NUMERIC(14, 2) NOT NULL DEFAULT 0,
    unidades_entregadas NUMERIC(14, 2) NOT NULL DEFAULT 0,
    observaciones TEXT,
    detalle_articulos JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gob_ccs_ped_fecha ON public.gob_ccs_pedidos_internos (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_gob_ccs_ped_sector ON public.gob_ccs_pedidos_internos (sector);
CREATE INDEX IF NOT EXISTS idx_gob_ccs_ped_estado ON public.gob_ccs_pedidos_internos (estado);

-- 4. RPC: Artículos derivados y pedidos por Sector en el período del Telar
CREATE OR REPLACE FUNCTION public.get_gob_ccs_derivaciones_articulos(
    p_desde_ym INT,
    p_hasta_ym INT,
    p_sector TEXT DEFAULT NULL
)
RETURNS TABLE (
    id_articulo INT,
    articulo TEXT,
    sector TEXT,
    pedidos_count BIGINT,
    unidades_pedidas NUMERIC,
    traspasos_count BIGINT,
    unidades_derivadas NUMERIC,
    importe_derivado NUMERIC
)
LANGUAGE SQL
STABLE
AS $$
    SELECT
        a.id_articulo,
        MAX(a.articulo) AS articulo,
        COALESCE(p_sector, 'TODOS LOS SECTORES') AS sector,
        SUM(a.pedidos_count)::BIGINT AS pedidos_count,
        ROUND(SUM(a.unidades_pedidas)::NUMERIC, 2) AS unidades_pedidas,
        SUM(a.traspasos_count)::BIGINT AS traspasos_count,
        ROUND(SUM(a.unidades_derivadas)::NUMERIC, 2) AS unidades_derivadas,
        ROUND(SUM(a.importe_derivado)::NUMERIC, 2) AS importe_derivado
    FROM public.gob_ccs_sectores_articulos_mensual a
    WHERE a.ym >= p_desde_ym AND a.ym <= p_hasta_ym
      AND (p_sector IS NULL OR p_sector = '' OR p_sector = 'TODOS' OR a.sector = p_sector)
    GROUP BY a.id_articulo
    ORDER BY unidades_derivadas DESC, unidades_pedidas DESC
    LIMIT 200;
$$;

-- RLS Policies
ALTER TABLE public.gob_ccs_sectores_derivaciones_mensual ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gob_ccs_sectores_articulos_mensual ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gob_ccs_pedidos_internos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_gob_ccs_sec_der" ON public.gob_ccs_sectores_derivaciones_mensual;
CREATE POLICY "allow_all_gob_ccs_sec_der" ON public.gob_ccs_sectores_derivaciones_mensual FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_gob_ccs_sec_art" ON public.gob_ccs_sectores_articulos_mensual;
CREATE POLICY "allow_all_gob_ccs_sec_art" ON public.gob_ccs_sectores_articulos_mensual FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_gob_ccs_ped_int" ON public.gob_ccs_pedidos_internos;
CREATE POLICY "allow_all_gob_ccs_ped_int" ON public.gob_ccs_pedidos_internos FOR ALL USING (true) WITH CHECK (true);

GRANT EXECUTE ON FUNCTION public.get_gob_ccs_derivaciones_articulos(INT, INT, TEXT) TO anon, authenticated, service_role;
