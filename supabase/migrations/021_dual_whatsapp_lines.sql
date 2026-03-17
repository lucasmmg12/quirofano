-- =============================================
-- 021: Dual WhatsApp Lines
-- Fecha: 2026-03-17
-- Soporte para dos líneas WhatsApp (Business + Messenger)
-- Cada paciente se asigna a una línea fija.
-- =============================================

-- 1. Tabla de líneas WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_lines (
    id              TEXT PRIMARY KEY,               -- 'line_a', 'line_b'
    label           TEXT NOT NULL,                   -- Nombre visible: 'WA Business', 'WA Messenger'
    phone           TEXT NOT NULL,                   -- Número completo: '5492644861691'
    api_key         TEXT NOT NULL,                   -- BuilderBot API Key
    project_id      TEXT NOT NULL,                   -- BuilderBot Project ID
    is_active       BOOLEAN DEFAULT TRUE,            -- Si está habilitada
    color           TEXT DEFAULT '#25D366',           -- Color para diferenciar en UI
    icon            TEXT DEFAULT 'phone',             -- Ícono en UI
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar las dos líneas (credenciales se configuran luego desde ConfigPanel o Supabase)
INSERT INTO whatsapp_lines (id, label, phone, api_key, project_id, color, icon) VALUES
    ('line_a', 'WhatsApp Business', '5492644861691', 'configurar-desde-panel', 'configurar-desde-panel', '#25D366', 'briefcase'),
    ('line_b', 'WhatsApp Messenger', '5492644809077', 'configurar-desde-panel', 'configurar-desde-panel', '#0088CC', 'smartphone')
ON CONFLICT (id) DO NOTHING;

-- RLS para whatsapp_lines
ALTER TABLE whatsapp_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_whatsapp_lines" ON whatsapp_lines
    FOR ALL USING (true) WITH CHECK (true);

-- 2. Agregar columna line_id a whatsapp_messages
ALTER TABLE whatsapp_messages
    ADD COLUMN IF NOT EXISTS line_id TEXT REFERENCES whatsapp_lines(id);

-- Índice para filtrar por línea
CREATE INDEX IF NOT EXISTS idx_wam_line_id ON whatsapp_messages(line_id);

-- 3. Agregar columna assigned_line_id a crm_contacts
ALTER TABLE crm_contacts
    ADD COLUMN IF NOT EXISTS assigned_line_id TEXT REFERENCES whatsapp_lines(id);

-- 4. Actualizar función send_whatsapp con soporte de línea
CREATE OR REPLACE FUNCTION send_whatsapp(
    p_content TEXT,
    p_number TEXT,
    p_media_url TEXT DEFAULT NULL,
    p_line_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    request_id BIGINT;
    v_api_key TEXT;
    v_project_id TEXT;
    v_url TEXT;
    v_line_id TEXT;
BEGIN
    -- Si se pasa line_id, leer de whatsapp_lines
    -- Si no, intentar obtener la línea asignada al contacto
    IF p_line_id IS NOT NULL THEN
        v_line_id := p_line_id;
    ELSE
        SELECT assigned_line_id INTO v_line_id
        FROM crm_contacts
        WHERE phone = p_number;
    END IF;

    -- Si tenemos línea, leer credenciales de whatsapp_lines
    IF v_line_id IS NOT NULL THEN
        SELECT api_key, project_id INTO v_api_key, v_project_id
        FROM whatsapp_lines
        WHERE id = v_line_id AND is_active = TRUE;
    END IF;

    -- Fallback: leer de app_config (retrocompatibilidad)
    IF v_api_key IS NULL OR v_project_id IS NULL THEN
        SELECT value INTO v_api_key FROM app_config WHERE key = 'builderbot_api_key';
        SELECT value INTO v_project_id FROM app_config WHERE key = 'builderbot_project_id';
    END IF;

    IF v_api_key IS NULL OR v_project_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Faltan credenciales de BuilderBot');
    END IF;

    v_url := 'https://app.builderbot.cloud/api/v2/' || v_project_id || '/messages';

    SELECT net.http_post(
        url := v_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-api-builderbot', v_api_key
        ),
        body := jsonb_build_object(
            'messages', CASE
                WHEN p_media_url IS NOT NULL THEN
                    jsonb_build_object('content', p_content, 'mediaUrl', p_media_url)
                ELSE
                    jsonb_build_object('content', p_content)
                END,
            'number', p_number,
            'checkIfExists', false
        )
    ) INTO request_id;

    RETURN jsonb_build_object('success', true, 'request_id', request_id, 'line_id', COALESCE(v_line_id, 'legacy'));
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Actualizar webhook_url en app_config para indicar que ahora hay dos
UPDATE app_config
SET value = 'https://hakysnqiryimxbwdslwe.supabase.co/functions/v1/whatsapp-webhook?line=line_a (Business) | ?line=line_b (Messenger)',
    label = 'URLs del Webhook (una por línea)'
WHERE key = 'webhook_url';
