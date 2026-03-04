-- ============================================
-- 016: CRM Contacts (Vinculación persistente teléfono ↔ paciente)
-- ============================================
-- Esta tabla asegura que el historial de chat nunca se pierda
-- aunque las cirugías se actualicen en la carga diaria de Excel.
-- El mapeo phone → id_paciente es independiente de surgeries.

CREATE TABLE IF NOT EXISTS crm_contacts (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    phone           TEXT NOT NULL UNIQUE,                    -- Teléfono normalizado (ej: 5492645438114)
    id_paciente     INTEGER,                                 -- FK a pacientes.id_paciente (puede ser NULL si manual)
    nombre          TEXT NOT NULL,                            -- Nombre del contacto (del paciente o manual)
    dni             TEXT,                                     -- DNI del paciente (copia para referencia rápida)
    notas           TEXT,                                     -- Notas adicionales del operador
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_crm_contacts_phone ON crm_contacts(phone);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_paciente ON crm_contacts(id_paciente);

-- RLS
ALTER TABLE crm_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated users" ON crm_contacts
    FOR ALL TO authenticated
    USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Allow all for service role" ON crm_contacts
    FOR ALL TO service_role
    USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Allow select for anon" ON crm_contacts
    FOR SELECT TO anon
    USING (TRUE);

-- Función trigger para auto-actualizar updated_at
CREATE OR REPLACE FUNCTION update_crm_contacts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_crm_contacts_updated
    BEFORE UPDATE ON crm_contacts
    FOR EACH ROW
    EXECUTE FUNCTION update_crm_contacts_updated_at();
