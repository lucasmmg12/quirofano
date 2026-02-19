-- ============================================================
-- SISTEMA ADM-QUI — Módulo Confirmación de Cirugías
-- Migración 003: Schema de cirugías y estados
-- Fecha: 2026-02-19
-- ============================================================

-- =========================
-- TABLA: surgeries
-- Cirugías programadas con estado de confirmación
-- Estados: lila (pendiente), amarillo (en revisión), 
--          verde (autorizado), azul (confirmado), rojo (problema)
-- =========================
CREATE TABLE IF NOT EXISTS surgeries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Datos del paciente
  nombre TEXT NOT NULL,
  dni TEXT,
  telefono TEXT NOT NULL,
  obra_social TEXT,
  
  -- Datos de la cirugía
  fecha_cirugia DATE NOT NULL,
  medico TEXT,
  modulo TEXT,               -- Tipo de módulo/procedimiento
  
  -- Estado de confirmación (código de colores)
  status TEXT DEFAULT 'lila' CHECK (status IN ('lila', 'amarillo', 'verde', 'azul', 'rojo')),
  
  -- Tracking de eventos
  notificado_at TIMESTAMPTZ,          -- Cuándo se envió el primer mensaje
  documentacion_recibida_at TIMESTAMPTZ,
  autorizado_at TIMESTAMPTZ,
  confirmado_at TIMESTAMPTZ,
  
  -- Archivos recibidos (fotos de autorizaciones)
  archivos JSONB DEFAULT '[]',        -- Array de { url, tipo, filename, recibido_at }
  
  -- WhatsApp
  whatsapp_message_id TEXT,
  ultimo_mensaje_at TIMESTAMPTZ,
  
  -- Notas del operador
  notas TEXT,
  operador TEXT,
  
  -- Filtro de exclusión
  excluido BOOLEAN DEFAULT FALSE,     -- TRUE si el módulo es Transferencia/Fertilidad/Bloque
  
  -- Auditoría
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_surgeries_fecha ON surgeries(fecha_cirugia);
CREATE INDEX IF NOT EXISTS idx_surgeries_status ON surgeries(status);
CREATE INDEX IF NOT EXISTS idx_surgeries_telefono ON surgeries(telefono);
CREATE INDEX IF NOT EXISTS idx_surgeries_dni ON surgeries(dni);

-- Trigger updated_at (reutiliza la función existente)
DROP TRIGGER IF EXISTS trg_surgeries_updated ON surgeries;
CREATE TRIGGER trg_surgeries_updated
  BEFORE UPDATE ON surgeries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =========================
-- TABLA: surgery_events
-- Historial de eventos/transiciones de estado
-- =========================
CREATE TABLE IF NOT EXISTS surgery_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  surgery_id UUID NOT NULL REFERENCES surgeries(id) ON DELETE CASCADE,
  
  event_type TEXT NOT NULL,     -- 'notificacion', 'doc_recibida', 'autorizacion', 'confirmacion', 'intervencion_manual', 'error'
  from_status TEXT,
  to_status TEXT,
  details TEXT,                 -- Descripción del evento
  performed_by TEXT DEFAULT 'bot',  -- 'bot' o nombre del operador
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_surgery ON surgery_events(surgery_id);

-- =========================
-- TABLA: surgery_templates
-- Plantillas de mensajes por obra social
-- =========================
CREATE TABLE IF NOT EXISTS surgery_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_social_pattern TEXT NOT NULL,  -- Patrón: 'Provincia', 'Jerárquicos', 'Prepaga', '*' (default)
  template_type TEXT NOT NULL,        -- 'notificacion', 'solicitud_doc', 'autorizacion', 'confirmacion', 'indicaciones'
  content TEXT NOT NULL,              -- Texto con placeholders: {nombre}, {fecha}, {medico}, {obra_social}
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE surgeries ENABLE ROW LEVEL SECURITY;
ALTER TABLE surgery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE surgery_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_surgeries ON surgeries;
CREATE POLICY allow_all_surgeries ON surgeries FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS allow_all_surgery_events ON surgery_events;
CREATE POLICY allow_all_surgery_events ON surgery_events FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS allow_all_surgery_templates ON surgery_templates;
CREATE POLICY allow_all_surgery_templates ON surgery_templates FOR ALL USING (true) WITH CHECK (true);
