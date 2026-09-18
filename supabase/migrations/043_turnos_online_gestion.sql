-- Migración 043: Tabla para gestión de turnos online duplicados (Contact Center)
CREATE TABLE IF NOT EXISTS contact_center_turnos_online_gestion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dni TEXT NOT NULL,
    paciente_nombre TEXT NOT NULL,
    telefono TEXT,
    prestador_id INTEGER,
    prestador_nombre TEXT,
    agenda_id INTEGER,
    agenda_nombre TEXT,
    turnos_ids JSONB DEFAULT '[]'::jsonb,
    estado TEXT NOT NULL DEFAULT 'pendiente', -- 'pendiente', 'contactado', 'resuelto', 'descartado'
    agente_id TEXT, -- 'daniela', 'sofia', 'virginia', 'erica'
    agente_nombre TEXT,
    canal_contacto TEXT DEFAULT 'whatsapp',
    template_name TEXT,
    notas TEXT,
    fecha_deteccion DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_turnos_online_dni ON contact_center_turnos_online_gestion(dni);
CREATE INDEX IF NOT EXISTS idx_turnos_online_estado ON contact_center_turnos_online_gestion(estado);
CREATE INDEX IF NOT EXISTS idx_turnos_online_fecha ON contact_center_turnos_online_gestion(fecha_deteccion);

-- Habilitar RLS y políticas públicas / anónimas
ALTER TABLE contact_center_turnos_online_gestion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura para todos" 
ON contact_center_turnos_online_gestion FOR SELECT USING (true);

CREATE POLICY "Permitir insercion para todos" 
ON contact_center_turnos_online_gestion FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir actualizacion para todos" 
ON contact_center_turnos_online_gestion FOR UPDATE USING (true);
