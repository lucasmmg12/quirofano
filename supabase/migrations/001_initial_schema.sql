-- ============================================================
-- SISTEMA ADM-QUI — Optimizador de Pedidos Médicos
-- Migración inicial: Esquema de base de datos
-- Fecha: 2026-02-19
-- ============================================================

-- =========================
-- TABLA: patients
-- Pacientes registrados para reutilización de datos
-- =========================
CREATE TABLE IF NOT EXISTS patients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  obra_social TEXT,
  afiliado TEXT,
  diagnostico TEXT,
  tratamiento TEXT,
  medico TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsqueda rápida por nombre
CREATE INDEX idx_patients_nombre ON patients USING gin (to_tsvector('spanish', nombre));

-- =========================
-- TABLA: medical_orders
-- Pedidos médicos generados (cabecera)
-- =========================
CREATE TABLE IF NOT EXISTS medical_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  
  -- Datos del paciente al momento del pedido (snapshot)
  nombre_paciente TEXT NOT NULL,
  obra_social TEXT,
  afiliado TEXT,
  diagnostico TEXT,
  tratamiento TEXT,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  medico TEXT,
  
  -- Estado y trazabilidad
  status TEXT DEFAULT 'created' CHECK (status IN ('created', 'printed', 'sent', 'printed_and_sent')),
  printed_at TIMESTAMPTZ,
  
  -- WhatsApp
  whatsapp_sent BOOLEAN DEFAULT FALSE,
  whatsapp_number TEXT,
  whatsapp_sent_at TIMESTAMPTZ,
  
  -- Auditoría
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'system'
);

-- Índices para consultas frecuentes
CREATE INDEX idx_orders_fecha ON medical_orders(fecha DESC);
CREATE INDEX idx_orders_patient ON medical_orders(patient_id);
CREATE INDEX idx_orders_status ON medical_orders(status);

-- =========================
-- TABLA: order_items
-- Ítems individuales dentro de un pedido (prácticas/estudios)
-- =========================
CREATE TABLE IF NOT EXISTS order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES medical_orders(id) ON DELETE CASCADE,
  
  -- Datos de la práctica
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT, -- Nombre personalizado (ej: "Interconsulta de Cardiología")
  category TEXT,
  quantity INTEGER DEFAULT 1 CHECK (quantity >= 1),
  fecha DATE, -- Fecha específica por ítem (puede diferir del pedido)
  
  -- Campo personalizado (prórroga días, especialidad, etc.)
  custom_field TEXT,
  custom_value TEXT,
  
  -- Orden de aparición
  position INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para obtener ítems de un pedido rápidamente
CREATE INDEX idx_items_order ON order_items(order_id);

-- =========================
-- TABLA: nomenclador
-- Nomenclador de prácticas médicas (fuente de verdad)
-- =========================
CREATE TABLE IF NOT EXISTS nomenclador (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  custom_field TEXT,       -- Tipo de campo personalizado (days, specialty, roman)
  custom_label TEXT,       -- Label del campo personalizado
  is_active BOOLEAN DEFAULT TRUE,
  usage_count INTEGER DEFAULT 0, -- Para priorizar las más usadas
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsqueda
CREATE INDEX idx_nomenclador_code ON nomenclador(code);
CREATE INDEX idx_nomenclador_category ON nomenclador(category);
CREATE INDEX idx_nomenclador_search ON nomenclador USING gin (to_tsvector('spanish', name));

-- =========================
-- FUNCIÓN: update_updated_at
-- Actualiza automáticamente el campo updated_at
-- =========================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
CREATE TRIGGER trg_patients_updated
  BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_nomenclador_updated
  BEFORE UPDATE ON nomenclador
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =========================
-- FUNCIÓN: increment_usage_count
-- Incrementa el contador de uso cuando se agrega un ítem
-- =========================
CREATE OR REPLACE FUNCTION increment_usage_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE nomenclador 
  SET usage_count = usage_count + NEW.quantity 
  WHERE code = NEW.code;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_increment_usage
  AFTER INSERT ON order_items
  FOR EACH ROW EXECUTE FUNCTION increment_usage_count();

-- =========================
-- RLS (Row Level Security)
-- Para este MVP mantenemos acceso público ya que es interno
-- =========================
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE nomenclador ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas para uso interno
CREATE POLICY "Allow all for patients" ON patients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for medical_orders" ON medical_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for order_items" ON order_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for nomenclador" ON nomenclador FOR ALL USING (true) WITH CHECK (true);
