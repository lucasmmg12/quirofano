-- ============================================================
-- SISTEMA ADM-QUI — Módulo Presupuestos Quirúrgicos
-- Migración 010: Schema de presupuestos y detalle de ítems
-- Fecha: 2026-02-24
-- ============================================================

-- =========================
-- TABLA: presupuestos
-- Cabecera de presupuestos (1 fila por idPresupuesto)
-- Se vincula a surgeries vía id_paciente
-- =========================
CREATE TABLE IF NOT EXISTS presupuestos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Identifiers del sistema fuente (Excel)
  id_presupuesto INT NOT NULL,           -- ID del presupuesto en el sistema fuente
  id_paciente TEXT NOT NULL,             -- Vinculación con surgeries.id_paciente

  -- Datos del paciente (denormalizados del Excel)
  paciente TEXT,

  -- Datos del presupuesto
  fecha DATE,
  observaciones TEXT,
  aceptado TEXT,                          -- 'si' / 'no' / NULL
  fecha_caducidad TIMESTAMPTZ,
  presup_descripcion TEXT,               -- Descripción general del presupuesto

  -- Totales calculados al importar
  total_items INT DEFAULT 0,             -- Cantidad de líneas/ítems
  importe_total NUMERIC(14,2) DEFAULT 0, -- Suma de todos los ítems
  importe_cobrado NUMERIC(14,2) DEFAULT 0, -- Suma de cobrados

  -- Auditoría
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- UNIQUE constraint para upsert en cargas periódicas
ALTER TABLE presupuestos
  DROP CONSTRAINT IF EXISTS uq_presupuestos_id;
ALTER TABLE presupuestos
  ADD CONSTRAINT uq_presupuestos_id UNIQUE (id_presupuesto);

-- Índices
CREATE INDEX IF NOT EXISTS idx_presupuestos_paciente ON presupuestos(id_paciente);
CREATE INDEX IF NOT EXISTS idx_presupuestos_fecha ON presupuestos(fecha);
CREATE INDEX IF NOT EXISTS idx_presupuestos_aceptado ON presupuestos(aceptado);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_presupuestos_updated ON presupuestos;
CREATE TRIGGER trg_presupuestos_updated
  BEFORE UPDATE ON presupuestos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =========================
-- TABLA: presupuesto_items
-- Líneas de detalle de cada presupuesto
-- =========================
CREATE TABLE IF NOT EXISTS presupuesto_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- FK al presupuesto padre
  id_presupuesto INT NOT NULL,

  -- Datos del ítem
  linea INT,                              -- Número de línea dentro del presupuesto
  id_articulo TEXT,                       -- Código del artículo/práctica
  descripcion TEXT,                       -- Nombre del artículo
  cantidad INT DEFAULT 1,
  importe_unitario NUMERIC(14,2) DEFAULT 0,
  importe_total NUMERIC(14,2) DEFAULT 0,
  importe_cobrado NUMERIC(14,2) DEFAULT 0,

  -- Auditoría
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- UNIQUE constraint para evitar duplicar líneas en recargas
ALTER TABLE presupuesto_items
  DROP CONSTRAINT IF EXISTS uq_presupuesto_item;
ALTER TABLE presupuesto_items
  ADD CONSTRAINT uq_presupuesto_item UNIQUE (id_presupuesto, id_articulo, linea);

-- Índices
CREATE INDEX IF NOT EXISTS idx_presupuesto_items_presupuesto ON presupuesto_items(id_presupuesto);

-- =========================
-- RLS — Acceso abierto (igual que surgeries)
-- =========================
ALTER TABLE presupuestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuesto_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_presupuestos ON presupuestos;
CREATE POLICY allow_all_presupuestos ON presupuestos FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS allow_all_presupuesto_items ON presupuesto_items;
CREATE POLICY allow_all_presupuesto_items ON presupuesto_items FOR ALL USING (true) WITH CHECK (true);
