-- Migración 044: Tabla para la Bolsa de Turnos a Cancelar (Contact Center)
CREATE TABLE IF NOT EXISTS contact_center_cancelaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT NOT NULL,
    dni TEXT NOT NULL,
    paciente_nombre TEXT NOT NULL,
    turno_id TEXT,
    fecha_turno DATE,
    hora_turno TEXT,
    medico TEXT,
    especialidad TEXT,
    sede TEXT,
    motivo_paciente TEXT,
    origen TEXT DEFAULT 'bot_whatsapp', -- 'bot_whatsapp', 'turnos_online', 'manual'
    estado TEXT NOT NULL DEFAULT 'pendiente', -- 'pendiente', 'procesado_salus', 'descartado'
    agente_id TEXT,
    agente_nombre TEXT,
    procesado_at TIMESTAMPTZ,
    notas_agente TEXT,
    conversation_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices de alto rendimiento para el tablero
CREATE INDEX IF NOT EXISTS idx_cancelaciones_estado ON contact_center_cancelaciones(estado);
CREATE INDEX IF NOT EXISTS idx_cancelaciones_dni ON contact_center_cancelaciones(dni);
CREATE INDEX IF NOT EXISTS idx_cancelaciones_fecha ON contact_center_cancelaciones(fecha_turno);
CREATE INDEX IF NOT EXISTS idx_cancelaciones_created ON contact_center_cancelaciones(created_at DESC);

-- Habilitar RLS y políticas
ALTER TABLE contact_center_cancelaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura para todos en cancelaciones" 
ON contact_center_cancelaciones FOR SELECT USING (true);

CREATE POLICY "Permitir insercion para todos en cancelaciones" 
ON contact_center_cancelaciones FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir actualizacion para todos en cancelaciones" 
ON contact_center_cancelaciones FOR UPDATE USING (true);
