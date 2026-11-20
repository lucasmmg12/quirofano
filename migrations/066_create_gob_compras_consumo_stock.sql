-- Migración 066: Tablas y RPCs para Tablero Integrado (Compras - Consumo - Stock)
-- Fuente: SALUS SQL Server (FM_Almacenes, FM_Stocks, FM_AlmacenesStock, FM_Lotes, FM_Movimientos, FC_AlbaranesC, VLISE_COMPRAS, FM_Articulos)

-- 1. Resumen mensual por almacén (2024-2026+)
CREATE TABLE IF NOT EXISTS public.gob_ccs_mensual_agg (
    id BIGSERIAL PRIMARY KEY,
    anio INT NOT NULL,
    mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
    ym INT GENERATED ALWAYS AS (anio * 100 + mes) STORED,
    id_almacen INT NOT NULL,
    almacen TEXT NOT NULL,
    grupo_almacen TEXT NOT NULL DEFAULT 'CLINICO', -- 'CENTRAL' | 'CLINICO' | 'SOPORTE'
    compras_unidades NUMERIC(14, 2) NOT NULL DEFAULT 0,
    compras_importe NUMERIC(16, 2) NOT NULL DEFAULT 0,
    compras_remitos INT NOT NULL DEFAULT 0,
    consumo_unidades NUMERIC(14, 2) NOT NULL DEFAULT 0,
    consumo_importe NUMERIC(16, 2) NOT NULL DEFAULT 0,
    traspasos_unidades NUMERIC(14, 2) NOT NULL DEFAULT 0,
    traspasos_importe NUMERIC(16, 2) NOT NULL DEFAULT 0,
    reg_positivas NUMERIC(14, 2) NOT NULL DEFAULT 0,
    reg_negativas NUMERIC(14, 2) NOT NULL DEFAULT 0,
    reg_importe_neto NUMERIC(16, 2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_gob_ccs_mensual UNIQUE (anio, mes, id_almacen)
);

CREATE INDEX IF NOT EXISTS idx_gob_ccs_mensual_ym ON public.gob_ccs_mensual_agg (ym);
CREATE INDEX IF NOT EXISTS idx_gob_ccs_mensual_grupo ON public.gob_ccs_mensual_agg (grupo_almacen);

-- 2. Snapshot actual de Stock, Cobertura, Reposición y Vencimientos por Artículo x Almacén
CREATE TABLE IF NOT EXISTS public.gob_ccs_stock_actual (
    id BIGSERIAL PRIMARY KEY,
    id_articulo INT NOT NULL,
    codigo TEXT,
    articulo TEXT NOT NULL,
    familia TEXT NOT NULL DEFAULT 'GENERAL',
    id_almacen INT NOT NULL,
    almacen TEXT NOT NULL,
    grupo_almacen TEXT NOT NULL DEFAULT 'CLINICO',
    stock_actual NUMERIC(14, 2) NOT NULL DEFAULT 0,
    stock_minimo NUMERIC(14, 2) NOT NULL DEFAULT 0,
    stock_maximo NUMERIC(14, 2) NOT NULL DEFAULT 0,
    punto_pedido NUMERIC(14, 2) NOT NULL DEFAULT 0,
    ultimo_precio_compra NUMERIC(14, 2) NOT NULL DEFAULT 0,
    valor_stock NUMERIC(16, 2) NOT NULL DEFAULT 0,
    consumo_30d NUMERIC(14, 2) NOT NULL DEFAULT 0,
    consumo_90d NUMERIC(14, 2) NOT NULL DEFAULT 0,
    consumo_diario_prom NUMERIC(14, 4) NOT NULL DEFAULT 0,
    dias_cobertura NUMERIC(10, 1),
    sugerencia_compra NUMERIC(14, 2) NOT NULL DEFAULT 0,
    estado_stock TEXT NOT NULL DEFAULT 'OPTIMO', -- QUIEBRE | CRITICO | REPONER | OPTIMO | SOBRESTOCK | SIN_MOVIMIENTO
    lotes_vencidos INT NOT NULL DEFAULT 0,
    lotes_por_vencer_90d INT NOT NULL DEFAULT 0,
    reg_90d_neto NUMERIC(14, 2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_gob_ccs_stock UNIQUE (id_articulo, id_almacen)
);

CREATE INDEX IF NOT EXISTS idx_gob_ccs_stock_estado ON public.gob_ccs_stock_actual (estado_stock);
CREATE INDEX IF NOT EXISTS idx_gob_ccs_stock_grupo ON public.gob_ccs_stock_actual (grupo_almacen);
CREATE INDEX IF NOT EXISTS idx_gob_ccs_stock_almacen ON public.gob_ccs_stock_actual (almacen);
CREATE INDEX IF NOT EXISTS idx_gob_ccs_stock_valor ON public.gob_ccs_stock_actual (valor_stock DESC);

-- 3. Resumen mensual de Compras por Proveedor x Artículo (para Ranking Proveedores, ABC e Inflación)
CREATE TABLE IF NOT EXISTS public.gob_ccs_compras_detalle (
    id BIGSERIAL PRIMARY KEY,
    anio INT NOT NULL,
    mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
    ym INT GENERATED ALWAYS AS (anio * 100 + mes) STORED,
    id_proveedor INT NOT NULL,
    proveedor TEXT NOT NULL,
    id_articulo INT NOT NULL,
    articulo TEXT NOT NULL,
    id_almacen INT NOT NULL DEFAULT 0,
    almacen TEXT NOT NULL DEFAULT 'SIN ALMACEN',
    grupo_almacen TEXT NOT NULL DEFAULT 'CENTRAL',
    remitos INT NOT NULL DEFAULT 0,
    cantidad NUMERIC(14, 2) NOT NULL DEFAULT 0,
    importe_total NUMERIC(16, 2) NOT NULL DEFAULT 0,
    precio_min NUMERIC(14, 2) NOT NULL DEFAULT 0,
    precio_max NUMERIC(14, 2) NOT NULL DEFAULT 0,
    precio_prom NUMERIC(14, 2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_gob_ccs_comp_det UNIQUE (anio, mes, id_proveedor, id_articulo, id_almacen)
);

CREATE INDEX IF NOT EXISTS idx_gob_ccs_comp_ym ON public.gob_ccs_compras_detalle (ym);
CREATE INDEX IF NOT EXISTS idx_gob_ccs_comp_prov ON public.gob_ccs_compras_detalle (proveedor);
CREATE INDEX IF NOT EXISTS idx_gob_ccs_comp_art ON public.gob_ccs_compras_detalle (id_articulo);

-- 4. RPC: Ranking de Proveedores acotado al período del Telar
CREATE OR REPLACE FUNCTION public.get_gob_ccs_proveedores(
    p_desde_ym INT,
    p_hasta_ym INT,
    p_solo_clinicos BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    id_proveedor INT,
    proveedor TEXT,
    remitos BIGINT,
    articulos_unicos BIGINT,
    unidades NUMERIC,
    importe_total NUMERIC
)
LANGUAGE SQL
STABLE
AS $$
    SELECT
        c.id_proveedor,
        c.proveedor,
        SUM(c.remitos)::BIGINT AS remitos,
        COUNT(DISTINCT c.id_articulo)::BIGINT AS articulos_unicos,
        ROUND(SUM(c.cantidad)::NUMERIC, 2) AS unidades,
        ROUND(SUM(c.importe_total)::NUMERIC, 2) AS importe_total
    FROM public.gob_ccs_compras_detalle c
    WHERE c.ym >= p_desde_ym AND c.ym <= p_hasta_ym
      AND (NOT p_solo_clinicos OR c.grupo_almacen IN ('CENTRAL', 'CLINICO'))
    GROUP BY c.id_proveedor, c.proveedor
    ORDER BY importe_total DESC
    LIMIT 100;
$$;

-- 5. RPC: Curva ABC de Compras y Monitor de Inflación de Precios (período Telar + referencia histórica)
CREATE OR REPLACE FUNCTION public.get_gob_ccs_articulos_compras(
    p_desde_ym INT,
    p_hasta_ym INT,
    p_solo_clinicos BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    id_articulo INT,
    articulo TEXT,
    proveedores_count BIGINT,
    cantidad NUMERIC,
    importe_total NUMERIC,
    precio_prom_periodo NUMERIC,
    precio_min_hist NUMERIC,
    precio_max_hist NUMERIC,
    variacion_pct NUMERIC
)
LANGUAGE SQL
STABLE
AS $$
    WITH periodo AS (
        SELECT
            c.id_articulo,
            MAX(c.articulo) AS articulo,
            COUNT(DISTINCT c.id_proveedor)::BIGINT AS proveedores_count,
            SUM(c.cantidad) AS cantidad,
            SUM(c.importe_total) AS importe_total,
            CASE WHEN SUM(c.cantidad) > 0 THEN SUM(c.importe_total) / SUM(c.cantidad) ELSE AVG(c.precio_prom) END AS precio_prom_periodo
        FROM public.gob_ccs_compras_detalle c
        WHERE c.ym >= p_desde_ym AND c.ym <= p_hasta_ym
          AND (NOT p_solo_clinicos OR c.grupo_almacen IN ('CENTRAL', 'CLINICO'))
        GROUP BY c.id_articulo
    ),
    hist AS (
        SELECT
            c.id_articulo,
            MIN(NULLIF(c.precio_min, 0)) AS precio_min_hist,
            MAX(c.precio_max) AS precio_max_hist
        FROM public.gob_ccs_compras_detalle c
        WHERE c.precio_prom > 0
        GROUP BY c.id_articulo
    )
    SELECT
        p.id_articulo,
        p.articulo,
        p.proveedores_count,
        ROUND(p.cantidad::NUMERIC, 2) AS cantidad,
        ROUND(p.importe_total::NUMERIC, 2) AS importe_total,
        ROUND(COALESCE(p.precio_prom_periodo, 0)::NUMERIC, 2) AS precio_prom_periodo,
        ROUND(COALESCE(h.precio_min_hist, 0)::NUMERIC, 2) AS precio_min_hist,
        ROUND(COALESCE(h.precio_max_hist, 0)::NUMERIC, 2) AS precio_max_hist,
        CASE
            WHEN COALESCE(h.precio_min_hist, 0) > 0 THEN
                ROUND(((p.precio_prom_periodo - h.precio_min_hist) / h.precio_min_hist * 100)::NUMERIC, 1)
            ELSE 0
        END AS variacion_pct
    FROM periodo p
    LEFT JOIN hist h ON h.id_articulo = p.id_articulo
    ORDER BY p.importe_total DESC
    LIMIT 150;
$$;

-- RLS Policies
ALTER TABLE public.gob_ccs_mensual_agg ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gob_ccs_stock_actual ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gob_ccs_compras_detalle ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_gob_ccs_mensual" ON public.gob_ccs_mensual_agg;
CREATE POLICY "allow_all_gob_ccs_mensual" ON public.gob_ccs_mensual_agg FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_gob_ccs_stock" ON public.gob_ccs_stock_actual;
CREATE POLICY "allow_all_gob_ccs_stock" ON public.gob_ccs_stock_actual FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_gob_ccs_comp" ON public.gob_ccs_compras_detalle;
CREATE POLICY "allow_all_gob_ccs_comp" ON public.gob_ccs_compras_detalle FOR ALL USING (true) WITH CHECK (true);

GRANT EXECUTE ON FUNCTION public.get_gob_ccs_proveedores(INT, INT, BOOLEAN) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_gob_ccs_articulos_compras(INT, INT, BOOLEAN) TO anon, authenticated, service_role;
