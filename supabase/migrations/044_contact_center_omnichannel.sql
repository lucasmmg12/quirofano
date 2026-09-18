-- Migración 044: Contact Center Omnicanal, Conversaciones, Bot Triage y Parámetros Clínicos
CREATE TABLE IF NOT EXISTS contact_center_conversations (
    phone TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'sin_asignar', -- 'sin_asignar', 'abierto', 'cerrado'
    assigned_agent_id TEXT, -- 'daniela', 'sofia', 'virginia', 'erica'
    assigned_agent_name TEXT,
    assigned_at TIMESTAMPTZ,
    bot_active BOOLEAN NOT NULL DEFAULT true,
    bot_stage TEXT NOT NULL DEFAULT 'awaiting_dni', -- 'awaiting_dni', 'awaiting_new_patient_data', 'menu', 'transferred'
    
    -- Variables extraídas de la Ficha del Paciente
    dni TEXT,
    nombre_completo TEXT,
    obra_social TEXT,
    fecha_nacimiento TEXT,
    email TEXT,
    telefono_contacto TEXT,
    departamento TEXT,
    es_paciente_existente BOOLEAN DEFAULT false,
    motivo_consulta TEXT, -- 'turnos', 'autorizaciones', 'otras_consultas'
    medico_o_especialidad TEXT,
    
    last_message_text TEXT,
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cc_conv_status ON contact_center_conversations(status);
CREATE INDEX IF NOT EXISTS idx_cc_conv_agent ON contact_center_conversations(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_cc_conv_dni ON contact_center_conversations(dni);
CREATE INDEX IF NOT EXISTS idx_cc_conv_updated ON contact_center_conversations(updated_at DESC);

ALTER TABLE contact_center_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir lectura para todos cc_conv" ON contact_center_conversations FOR SELECT USING (true);
CREATE POLICY "Permitir insercion para todos cc_conv" ON contact_center_conversations FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir actualizacion para todos cc_conv" ON contact_center_conversations FOR UPDATE USING (true);
CREATE POLICY "Permitir eliminacion para todos cc_conv" ON contact_center_conversations FOR DELETE USING (true);

-- Tabla de Parámetros de Doctores y Consultorios (SALUS)
CREATE TABLE IF NOT EXISTS contact_center_doctor_parameters (
    id TEXT PRIMARY KEY, -- id_agenda
    id_agenda INTEGER,
    id_personal INTEGER,
    profesional_nombre TEXT NOT NULL,
    especialidad TEXT,
    consultorio_actual TEXT,
    condiciones_consulta TEXT, -- Notas diarias, precios, obras sociales, etc.
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cc_doc_esp ON contact_center_doctor_parameters(especialidad);
CREATE INDEX IF NOT EXISTS idx_cc_doc_nom ON contact_center_doctor_parameters(profesional_nombre);

ALTER TABLE contact_center_doctor_parameters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir lectura para todos cc_doc" ON contact_center_doctor_parameters FOR SELECT USING (true);
CREATE POLICY "Permitir insercion para todos cc_doc" ON contact_center_doctor_parameters FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir actualizacion para todos cc_doc" ON contact_center_doctor_parameters FOR UPDATE USING (true);
CREATE POLICY "Permitir eliminacion para todos cc_doc" ON contact_center_doctor_parameters FOR DELETE USING (true);
