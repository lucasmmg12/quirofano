-- =============================================
-- 014: Fix send_whatsapp — Leer credenciales desde app_config
-- Fecha: 2026-02-26
-- Problema: La función tenía API Key y Project ID hardcodeados (viejos)
-- Solución: Leer dinámicamente desde la tabla app_config
-- =============================================

CREATE OR REPLACE FUNCTION send_whatsapp(
    p_content TEXT,
    p_number TEXT,
    p_media_url TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    request_id BIGINT;
    v_api_key TEXT;
    v_project_id TEXT;
    v_url TEXT;
BEGIN
    -- Leer credenciales desde app_config (no hardcodeadas)
    SELECT value INTO v_api_key FROM app_config WHERE key = 'builderbot_api_key';
    SELECT value INTO v_project_id FROM app_config WHERE key = 'builderbot_project_id';

    IF v_api_key IS NULL OR v_project_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Faltan credenciales de BuilderBot en app_config');
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

    RETURN jsonb_build_object('success', true, 'request_id', request_id);
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
