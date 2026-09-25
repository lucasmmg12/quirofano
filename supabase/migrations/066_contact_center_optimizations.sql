-- Migration 066: Contact Center Optimizations
-- Indices, Transaccionalidad de Cierre Masivo y Triggers de Sincronización

-- 1. Extensión pg_trgm para búsquedas fuzzy y rápidas de médicos y parámetros
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Índices de Alto Rendimiento para WhatsApp Messages
CREATE INDEX IF NOT EXISTS idx_wm_line_created 
ON whatsapp_messages (line_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wm_phone_created 
ON whatsapp_messages (phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wm_line_direction_created 
ON whatsapp_messages (line_id, direction, created_at DESC);

-- 3. Índices para Contact Center Conversations
CREATE INDEX IF NOT EXISTS idx_ccc_status_updated 
ON contact_center_conversations (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ccc_assigned_status 
ON contact_center_conversations (assigned_agent_id, status);

CREATE INDEX IF NOT EXISTS idx_ccc_phone 
ON contact_center_conversations (phone);

-- 4. Índice Trigram para parámetros médicos
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'contact_center_doctor_parameters'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_cc_doc_params_trgm 
        ON contact_center_doctor_parameters 
        USING gin (profesional_nombre gin_trgm_ops, especialidad gin_trgm_ops);
    END IF;
END $$;

-- 5. RPC: Cierre masivo atómico y silencioso de conversaciones (ACID)
CREATE OR REPLACE FUNCTION bulk_close_contact_center_chats(
    p_phones TEXT[],
    p_reason TEXT DEFAULT 'Cierre masivo de cola',
    p_agent_id TEXT DEFAULT NULL,
    p_agent_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_closed_count INT := 0;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    IF p_phones IS NULL OR array_length(p_phones, 1) = 0 THEN
        RETURN jsonb_build_object('success', true, 'count', 0);
    END IF;

    -- Actualización atómica en una sola transacción
    UPDATE contact_center_conversations
    SET 
        status = 'archivado',
        resolution_reason = p_reason,
        closed_at = v_now,
        closed_by_agent_id = p_agent_id,
        closed_by_agent_name = p_agent_name,
        assigned_agent_id = NULL,
        assigned_agent_name = NULL,
        bot_active = true,
        bot_stage = 'inicio',
        updated_at = v_now
    WHERE phone = ANY(p_phones);

    GET DIAGNOSTICS v_closed_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true, 
        'count', v_closed_count,
        'timestamp', v_now
    );
END;
$$;
