-- ============================================================
-- 015: Triple Base de Deudas — Cobros + Notas de Crédito
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1) Tabla de Cobros (fuente: PR_COBROS_QRY)
CREATE TABLE IF NOT EXISTS deudas_cobros (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    paciente_id   UUID REFERENCES deudas_pacientes(id) ON DELETE CASCADE,
    nhc           TEXT NOT NULL,
    id_cobro      TEXT UNIQUE,
    nombre        TEXT,
    nombre_fiscal TEXT,
    nif           TEXT,
    descripcion   TEXT,
    importe       NUMERIC(12,2) DEFAULT 0,
    comentario    TEXT,
    fecha         DATE,
    fecha_cobro   TIMESTAMPTZ,
    telefono      TEXT,
    centro        TEXT,
    paciente_nombre TEXT,
    forma_pago    TEXT,
    caja          TEXT,
    clasificacion TEXT,
    usuario_cobro TEXT,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cobros_nhc ON deudas_cobros(nhc);
CREATE INDEX IF NOT EXISTS idx_cobros_paciente ON deudas_cobros(paciente_id);

-- 2) Tabla de Notas de Crédito (fuente: PR_FACTURAS_QRY filtro Nota Crédito)
CREATE TABLE IF NOT EXISTS deudas_notas_credito (
    id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    paciente_id       UUID REFERENCES deudas_pacientes(id) ON DELETE CASCADE,
    nhc               TEXT NOT NULL,
    id_factura        TEXT UNIQUE,
    fecha             DATE,
    paciente_nombre   TEXT,
    descripcion       TEXT,
    id_paciente_salus TEXT,
    centro            TEXT,
    nif               TEXT,
    nombre_serie      TEXT,
    importe_total     NUMERIC(12,2) DEFAULT 0,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nc_nhc ON deudas_notas_credito(nhc);
CREATE INDEX IF NOT EXISTS idx_nc_paciente ON deudas_notas_credito(paciente_id);

-- 3) Nuevas columnas en deudas_pacientes para balance
ALTER TABLE deudas_pacientes
    ADD COLUMN IF NOT EXISTS total_cobros         NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_notas_credito  NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS balance_neto         NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cantidad_cobros      INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cantidad_notas_credito INT DEFAULT 0;

-- 4) Inicializar balance_neto con deuda_total actual
UPDATE deudas_pacientes
SET balance_neto = deuda_total
WHERE balance_neto = 0 AND deuda_total > 0;

-- 5) RLS (Row Level Security) — políticas abiertas (mismo patrón del proyecto)
ALTER TABLE deudas_cobros ENABLE ROW LEVEL SECURITY;
ALTER TABLE deudas_notas_credito ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deudas_cobros_all" ON deudas_cobros FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "deudas_notas_credito_all" ON deudas_notas_credito FOR ALL USING (true) WITH CHECK (true);

-- Verificar
SELECT 'deudas_cobros' AS tabla, count(*) FROM deudas_cobros
UNION ALL
SELECT 'deudas_notas_credito', count(*) FROM deudas_notas_credito
UNION ALL
SELECT 'deudas_pacientes (con balance)', count(*) FROM deudas_pacientes WHERE balance_neto IS NOT NULL;
