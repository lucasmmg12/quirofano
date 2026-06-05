-- =============================================
-- 041: Facturación Internada + extensión de altas_administrativas
-- =============================================
-- Tabla de detalle de facturación internada (líneas de concepto PDV 21/31)
-- Fuente: SALUS [TABLEAU_Detalle de ventas Facturadas con Gastos y Honorarios]
-- Cruce con altas_administrativas por numero_admision

-- 1. Tabla de detalle de facturación
CREATE TABLE IF NOT EXISTS facturacion_internada (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    numero_admision TEXT NOT NULL,
    numero_factura TEXT NOT NULL,
    fecha_factura DATE,
    paciente TEXT,
    paciente_nhc TEXT,
    paciente_nif TEXT,
    cliente TEXT,
    concepto TEXT,
    usuario_factura TEXT,
    pdv TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_fact_int_admision ON facturacion_internada(numero_admision);
CREATE INDEX IF NOT EXISTS idx_fact_int_factura ON facturacion_internada(numero_factura);
CREATE INDEX IF NOT EXISTS idx_fact_int_fecha ON facturacion_internada(fecha_factura DESC);

-- Unicidad: una línea de concepto por factura+admisión+concepto
CREATE UNIQUE INDEX IF NOT EXISTS idx_fact_int_unique 
    ON facturacion_internada(numero_factura, numero_admision, concepto);

-- RLS
ALTER TABLE facturacion_internada ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fact_int_full_access" ON facturacion_internada
    FOR ALL USING (true) WITH CHECK (true);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_fact_int_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fact_int_updated
    BEFORE UPDATE ON facturacion_internada
    FOR EACH ROW
    EXECUTE FUNCTION update_fact_int_timestamp();

-- 2. Extensión de altas_administrativas — campos de facturación
ALTER TABLE altas_administrativas ADD COLUMN IF NOT EXISTS facturada BOOLEAN DEFAULT FALSE;
ALTER TABLE altas_administrativas ADD COLUMN IF NOT EXISTS facturada_at TIMESTAMPTZ;
ALTER TABLE altas_administrativas ADD COLUMN IF NOT EXISTS usuario_facturo TEXT;
ALTER TABLE altas_administrativas ADD COLUMN IF NOT EXISTS cantidad_facturas INT DEFAULT 0;

-- Campos de traspaso (para Fase 2)
ALTER TABLE altas_administrativas ADD COLUMN IF NOT EXISTS traspaso_id UUID;
ALTER TABLE altas_administrativas ADD COLUMN IF NOT EXISTS traspasada_at TIMESTAMPTZ;
ALTER TABLE altas_administrativas ADD COLUMN IF NOT EXISTS traspasada_por TEXT;

-- Flag para el carrito de traspaso (pre-remito)
ALTER TABLE altas_administrativas ADD COLUMN IF NOT EXISTS en_carrito_traspaso BOOLEAN DEFAULT FALSE;

-- Campos editables por Facturación (para Fase 3)
ALTER TABLE altas_administrativas ADD COLUMN IF NOT EXISTS responsable_fac TEXT;
ALTER TABLE altas_administrativas ADD COLUMN IF NOT EXISTS estado_fac TEXT DEFAULT 'Pendiente';

-- Tabla de traspasos / remitos (para Fase 2)
CREATE TABLE IF NOT EXISTS altas_traspasos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE,
    fecha_traspaso TIMESTAMPTZ DEFAULT now(),
    responsable_entrega TEXT NOT NULL,
    responsable_recibe TEXT,
    cantidad_fichas INT NOT NULL,
    notas TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE altas_traspasos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "traspasos_full_access" ON altas_traspasos
    FOR ALL USING (true) WITH CHECK (true);

-- Índices para altas_administrativas
CREATE INDEX IF NOT EXISTS idx_altas_adm_facturada ON altas_administrativas(facturada);
CREATE INDEX IF NOT EXISTS idx_altas_adm_traspaso ON altas_administrativas(traspaso_id);
CREATE INDEX IF NOT EXISTS idx_altas_adm_estado_fac ON altas_administrativas(estado_fac);
