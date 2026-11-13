-- ==============================================================================
-- MIGRATION 075: FIX SUPABASE REALTIME & EXISTING SESSION COMPATIBILITY
-- Fecha: 2026-11-13
-- Propósito:
--   1. Permitir que las sesiones activas previas (cuyo token en localStorage
--      tiene prefijo institucional `sa_sess_%` o `sess_%` desde orígenes oficiales)
--      continúen operando sin corte brusco tras la rotación o recarga.
--   2. Permitir que Supabase Realtime (`postgres_changes` por WebSocket, que se
--      ejecuta en PostgreSQL sin cabeceras HTTP `request.headers`) entregue los
--      eventos en vivo de `whatsapp_messages` y `contact_center_conversations`,
--      manteniendo bloqueadas las consultas REST anónimas externas sin Origin/Token.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.is_valid_admqui_session()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_headers JSON;
    v_session_token TEXT;
    v_device_token TEXT;
    v_origin TEXT;
    v_referer TEXT;
BEGIN
    BEGIN
        v_headers := current_setting('request.headers', true)::json;
    EXCEPTION WHEN OTHERS THEN
        v_headers := NULL;
    END;

    -- Si no hay cabeceras HTTP en absoluto (contexto interno PostgreSQL / Supabase Realtime WAL),
    -- permitir para que la replicación WebSocket de Realtime funcione.
    IF v_headers IS NULL THEN
        RETURN TRUE;
    END IF;

    v_session_token := COALESCE(v_headers->>'x-session-token', '');
    v_device_token  := COALESCE(v_headers->>'x-device-token', '');
    v_origin        := COALESCE(v_headers->>'origin', '');
    v_referer       := COALESCE(v_headers->>'referer', '');

    -- 1. Validación por Token de Sesión o Dispositivo en admqui_usuarios
    IF v_session_token <> '' AND LENGTH(v_session_token) >= 10 THEN
        IF EXISTS (
            SELECT 1 FROM public.admqui_usuarios u
            WHERE u.activo = true
              AND (
                  u.active_session_token = v_session_token
                  OR (v_device_token <> '' AND u.active_device_token = v_device_token)
              )
        ) THEN
            RETURN TRUE;
        END IF;

        -- Compatibilidad para sesiones activas en pestañas abiertas con formato de token institucional
        -- enviadas desde dominios oficiales de Sanatorio Argentino
        IF (v_session_token LIKE 'sa_sess_%' OR v_session_token LIKE 'sess_%')
           AND (
               v_origin LIKE 'https://sanatorioargentino.app%'
               OR v_origin LIKE 'https://www.sanatorioargentino.app%'
               OR v_origin LIKE 'https://quirofano%.vercel.app%'
               OR v_origin LIKE 'https://recepciones%.vercel.app%'
               OR v_origin LIKE 'http://localhost:%'
               OR v_origin LIKE 'http://128.223.%'
           ) THEN
            RETURN TRUE;
        END IF;
    END IF;

    -- 2. Validación por Device Token válido registrado en un usuario activo
    IF v_device_token <> '' AND LENGTH(v_device_token) >= 10 THEN
        IF EXISTS (
            SELECT 1 FROM public.admqui_usuarios u
            WHERE u.activo = true
              AND u.active_device_token = v_device_token
        ) THEN
            RETURN TRUE;
        END IF;
    END IF;

    -- 3. Compatibilidad con apps satélite institucionales (Recepciones / Tótems / Apps internas)
    -- que operan desde los dominios oficiales de Sanatorio Argentino
    IF v_origin LIKE 'https://sanatorioargentino.app%'
       OR v_origin LIKE 'https://www.sanatorioargentino.app%'
       OR v_origin LIKE 'https://quirofano%.vercel.app%'
       OR v_origin LIKE 'https://recepciones%.vercel.app%'
       OR v_origin LIKE 'http://localhost:%'
       OR v_origin LIKE 'http://128.223.%'
       OR v_referer LIKE 'https://sanatorioargentino.app/%'
       OR v_referer LIKE 'https://quirofano%.vercel.app/%'
       OR v_referer LIKE 'https://recepciones%.vercel.app/%'
    THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

-- También sincronizar active_session_token automáticamente en verify_active_user_session
-- cuando el usuario presenta un device_token válido pero su pestaña tenía un session_token previo
CREATE OR REPLACE FUNCTION public.verify_active_user_session(
    p_user_id UUID,
    p_session_token TEXT,
    p_device_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user RECORD;
BEGIN
    SELECT id, activo, active_session_token, active_device_token, last_login_at
    INTO v_user
    FROM public.admqui_usuarios
    WHERE id = p_user_id;

    IF NOT FOUND OR v_user.activo IS NOT TRUE THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'USER_INACTIVE_OR_DELETED');
    END IF;

    -- Si la base no tenía token grabado aún, grabarlo ahora para no expulsar al usuario
    IF v_user.active_session_token IS NULL AND p_session_token IS NOT NULL AND p_session_token <> '' THEN
        UPDATE public.admqui_usuarios
        SET active_session_token = p_session_token,
            active_device_token = COALESCE(p_device_token, active_device_token)
        WHERE id = p_user_id;
        RETURN jsonb_build_object('valid', true, 'reason', 'OK_AUTO_REGISTERED');
    END IF;

    IF v_user.active_device_token IS NOT NULL
       AND p_device_token IS NOT NULL
       AND v_user.active_device_token <> p_device_token THEN
        RETURN jsonb_build_object(
            'valid', false,
            'reason', 'DISPLACED_BY_OTHER_DEVICE',
            'last_login_at', v_user.last_login_at
        );
    END IF;

    IF v_user.active_session_token IS NOT NULL
       AND p_session_token IS NOT NULL
       AND v_user.active_session_token <> p_session_token THEN
        -- Si es el mismo dispositivo (mismo device_token), sincronizar el session_token
        IF p_device_token IS NOT NULL AND v_user.active_device_token = p_device_token THEN
            UPDATE public.admqui_usuarios
            SET active_session_token = p_session_token
            WHERE id = p_user_id;
            RETURN jsonb_build_object('valid', true, 'reason', 'OK_SAME_DEVICE_SYNCED');
        END IF;

        RETURN jsonb_build_object(
            'valid', false,
            'reason', 'DISPLACED_BY_OTHER_SESSION',
            'last_login_at', v_user.last_login_at
        );
    END IF;

    RETURN jsonb_build_object('valid', true, 'reason', 'OK');
END;
$$;
