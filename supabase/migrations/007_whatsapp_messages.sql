-- ============================================
-- 007: WhatsApp Messages (Mini CRM Chat)
-- ============================================

-- Tabla principal de mensajes WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    phone           TEXT NOT NULL,                          -- Número normalizado (ej: 5492645438114)
    direction       TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
    content         TEXT,                                    -- Texto del mensaje
    media_url       TEXT,                                    -- URL del adjunto (audio/imagen/video/doc)
    media_type      TEXT DEFAULT 'text' CHECK (media_type IN ('text', 'audio', 'image', 'video', 'document', 'sticker')),
    sender_name     TEXT,                                    -- Nombre del remitente (del payload)
    is_read         BOOLEAN DEFAULT FALSE,                   -- Para notificaciones (globito rojo)
    raw_payload     JSONB,                                   -- Payload completo del webhook
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsquedas rápidas por teléfono y orden cronológico
CREATE INDEX IF NOT EXISTS idx_wam_phone ON whatsapp_messages(phone);
CREATE INDEX IF NOT EXISTS idx_wam_phone_created ON whatsapp_messages(phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wam_unread ON whatsapp_messages(phone, is_read) WHERE direction = 'incoming' AND is_read = FALSE;

-- Función para contar mensajes no leídos por teléfono
CREATE OR REPLACE FUNCTION get_unread_counts()
RETURNS TABLE(phone TEXT, unread_count BIGINT)
LANGUAGE sql STABLE
AS $$
    SELECT phone, COUNT(*) as unread_count
    FROM whatsapp_messages
    WHERE direction = 'incoming' AND is_read = FALSE
    GROUP BY phone;
$$;

-- Función para marcar todos los mensajes de un teléfono como leídos
CREATE OR REPLACE FUNCTION mark_messages_read(p_phone TEXT)
RETURNS void
LANGUAGE sql
AS $$
    UPDATE whatsapp_messages
    SET is_read = TRUE
    WHERE phone = p_phone AND direction = 'incoming' AND is_read = FALSE;
$$;

-- RLS: Permitir acceso completo a usuarios autenticados y al service role
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated users" ON whatsapp_messages
    FOR ALL
    TO authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

CREATE POLICY "Allow all for service role" ON whatsapp_messages
    FOR ALL
    TO service_role
    USING (TRUE)
    WITH CHECK (TRUE);

-- Permitir acceso anon para el webhook (edge function usa service_role pero por si acaso)
CREATE POLICY "Allow insert for anon" ON whatsapp_messages
    FOR INSERT
    TO anon
    WITH CHECK (TRUE);

CREATE POLICY "Allow select for anon" ON whatsapp_messages
    FOR SELECT
    TO anon
    USING (TRUE);
