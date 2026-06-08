-- =============================================
-- 042: Facturación Devoluciones + Firmas digitales
-- =============================================
-- Sistema bidireccional: Control de Altas ↔ Facturación
-- Devoluciones desde facturación, firmas digitales (canvas base64)

-- 1. Tabla de devoluciones (Facturación → Control de Altas)
CREATE TABLE IF NOT EXISTS facturacion_devoluciones (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE,
    fecha_devolucion TIMESTAMPTZ DEFAULT now(),
    responsable_devuelve TEXT NOT NULL,
    responsable_recibe TEXT,
    motivo TEXT,
    cantidad_fichas INT NOT NULL,
    firma_devuelve TEXT,          -- firma base64 (PNG dataURL)
    firma_recibe TEXT,            -- firma base64 (PNG dataURL)
    firmado_sistema BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE facturacion_devoluciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fac_dev_full_access" ON facturacion_devoluciones
    FOR ALL USING (true) WITH CHECK (true);

-- 2. Campos de devolución en altas_administrativas
ALTER TABLE altas_administrativas ADD COLUMN IF NOT EXISTS devolucion_id UUID;
ALTER TABLE altas_administrativas ADD COLUMN IF NOT EXISTS devuelta_at TIMESTAMPTZ;
ALTER TABLE altas_administrativas ADD COLUMN IF NOT EXISTS devuelta_por TEXT;
ALTER TABLE altas_administrativas ADD COLUMN IF NOT EXISTS en_carrito_devolucion BOOLEAN DEFAULT FALSE;

-- Índices
CREATE INDEX IF NOT EXISTS idx_altas_adm_devolucion ON altas_administrativas(devolucion_id);
CREATE INDEX IF NOT EXISTS idx_altas_adm_carrito_dev ON altas_administrativas(en_carrito_devolucion) WHERE en_carrito_devolucion = true;

-- 3. Campos de firma digital en altas_traspasos (mejora traspaso existente)
ALTER TABLE altas_traspasos ADD COLUMN IF NOT EXISTS firma_entrega TEXT;
ALTER TABLE altas_traspasos ADD COLUMN IF NOT EXISTS firma_recibe TEXT;
ALTER TABLE altas_traspasos ADD COLUMN IF NOT EXISTS firmado_sistema BOOLEAN DEFAULT FALSE;
