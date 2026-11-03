-- ============================================================
-- SISTEMA ADM-QUI — Migración 070: Control de Sesión por PC (Multi-Ventana en la misma PC)
-- Permite abrir múltiples ventanas o pestañas en la MISMA PC (mismo p_device_token)
-- y bloquea/alerta únicamente cuando hay una sesión activa en OTRA PC distinta.
-- ============================================================

DROP FUNCTION IF EXISTS public.check_or_claim_user_session(UUID, TEXT, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.heartbeat_and_verify_user_session(UUID, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.check_or_claim_user_session(
    p_user_id UUID,
    p_session_token TEXT,
    p_device_token TEXT DEFAULT NULL,
    p_device_label TEXT DEFAULT NULL,
    p_force_takeover BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_user RECORD;
    v_has_other_pc_active BOOLEAN := FALSE;
    v_is_same_pc BOOLEAN := FALSE;
    v_effective_session_token TEXT;
BEGIN
    SELECT *
    INTO v_user
    FROM public.admqui_usuarios
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'account_disabled',
            'error', 'Usuario no encontrado'
        );
    END IF;

    IF COALESCE(v_user.activo, TRUE) = FALSE THEN
        RETURN jsonb_build_object(
            'status', 'account_disabled',
            'error', 'Esta cuenta de usuario se encuentra deshabilitada por el Administrador.'
        );
    END IF;

    -- Determinar si la solicitud proviene de la MISMA PC (mismo device_token)
    IF p_device_token IS NOT NULL
       AND LENGTH(TRIM(p_device_token)) > 0
       AND v_user.active_device_token IS NOT NULL
       AND v_user.active_device_token = p_device_token THEN
        v_is_same_pc := TRUE;
    END IF;

    -- Evaluar si hay otra sesión viva en OTRA PC distinta (heartbeat en los últimos 90 segundos)
    IF v_user.active_session_token IS NOT NULL
       AND v_user.active_session_heartbeat IS NOT NULL
       AND v_user.active_session_heartbeat > (NOW() - INTERVAL '90 seconds')
       AND NOT v_is_same_pc
       AND v_user.active_session_token <> COALESCE(p_session_token, '') THEN
        v_has_other_pc_active := TRUE;
    END IF;

    -- Si hay otra PC activa y todavía no eligió forzar el cierre de la otra PC, informar conflicto
    IF v_has_other_pc_active AND NOT COALESCE(p_force_takeover, FALSE) THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'other_device_label', COALESCE(v_user.active_device_label, 'Otra PC / Dispositivo'),
            'other_started_at', v_user.active_session_started_at,
            'other_last_heartbeat', v_user.active_session_heartbeat
        );
    END IF;

    -- Si es la MISMA PC y ya tenía un session_token activo (< 90s), reutilizar o unificar el token sin cerrar sesiones de esta PC
    IF v_is_same_pc
       AND v_user.active_session_token IS NOT NULL
       AND v_user.active_session_heartbeat IS NOT NULL
       AND v_user.active_session_heartbeat > (NOW() - INTERVAL '90 seconds')
       AND NOT COALESCE(p_force_takeover, FALSE) THEN
        v_effective_session_token := v_user.active_session_token;
    ELSE
        v_effective_session_token := p_session_token;
        -- Si cambia de PC o fuerza takeover desde otra PC, cerrar sesiones previas en user_sessions
        IF NOT v_is_same_pc AND v_user.active_session_token IS DISTINCT FROM p_session_token THEN
            UPDATE public.user_sessions
            SET ended_at = NOW()
            WHERE user_id = p_user_id AND ended_at IS NULL;
        END IF;
    END IF;

    -- Registrar/actualizar la sesión autorizada para esta PC
    UPDATE public.admqui_usuarios
    SET active_session_token = v_effective_session_token,
        active_device_token = p_device_token,
        active_device_label = COALESCE(NULLIF(TRIM(p_device_label), ''), 'PC Sanatorio'),
        active_session_started_at = CASE
            WHEN v_is_same_pc OR active_session_token = v_effective_session_token
                THEN COALESCE(active_session_started_at, NOW())
            ELSE NOW()
        END,
        active_session_heartbeat = NOW(),
        ultimo_login = NOW(),
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'status', 'ok',
        'session_token', v_effective_session_token,
        'device_label', COALESCE(NULLIF(TRIM(p_device_label), ''), 'PC Sanatorio')
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.heartbeat_and_verify_user_session(
    p_user_id UUID,
    p_session_token TEXT DEFAULT NULL,
    p_device_token TEXT DEFAULT NULL,
    p_device_label TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_user RECORD;
    v_is_same_pc BOOLEAN := FALSE;
BEGIN
    SELECT *
    INTO v_user
    FROM public.admqui_usuarios
    WHERE id = p_user_id;

    IF NOT FOUND OR COALESCE(v_user.activo, TRUE) = FALSE THEN
        RETURN jsonb_build_object(
            'active', FALSE,
            'status', 'account_disabled',
            'rol', v_user.rol
        );
    END IF;

    -- Si no había token registrado aún, registrarlo para esta PC
    IF v_user.active_session_token IS NULL AND p_session_token IS NOT NULL THEN
        UPDATE public.admqui_usuarios
        SET active_session_token = p_session_token,
            active_device_token = p_device_token,
            active_device_label = COALESCE(NULLIF(TRIM(p_device_label), ''), 'PC Sanatorio'),
            active_session_started_at = COALESCE(active_session_started_at, NOW()),
            active_session_heartbeat = NOW()
        WHERE id = p_user_id;

        RETURN jsonb_build_object(
            'active', TRUE,
            'status', 'ok',
            'session_token', p_session_token,
            'rol', v_user.rol,
            'must_change_password', COALESCE(v_user.must_change_password, FALSE),
            'mfa_enabled', COALESCE(v_user.mfa_enabled, FALSE)
        );
    END IF;

    -- Verificar si es la misma PC autorizada (mismo device_token) o el mismo session_token
    IF p_device_token IS NOT NULL
       AND LENGTH(TRIM(p_device_token)) > 0
       AND v_user.active_device_token IS NOT NULL
       AND v_user.active_device_token = p_device_token THEN
        v_is_same_pc := TRUE;
    END IF;

    IF v_user.active_session_token = p_session_token OR v_is_same_pc THEN
        UPDATE public.admqui_usuarios
        SET active_session_heartbeat = NOW(),
            active_device_label = COALESCE(NULLIF(TRIM(p_device_label), ''), active_device_label)
        WHERE id = p_user_id;

        RETURN jsonb_build_object(
            'active', TRUE,
            'status', 'ok',
            'session_token', v_user.active_session_token,
            'rol', v_user.rol,
            'must_change_password', COALESCE(v_user.must_change_password, FALSE),
            'mfa_enabled', COALESCE(v_user.mfa_enabled, FALSE)
        );
    END IF;

    -- Si ni el session_token ni el device_token coinciden, la sesión fue tomada desde OTRA PC
    RETURN jsonb_build_object(
        'active', TRUE,
        'status', 'displaced',
        'other_device_label', COALESCE(v_user.active_device_label, 'Otra PC / Dispositivo'),
        'other_started_at', v_user.active_session_started_at,
        'other_last_heartbeat', v_user.active_session_heartbeat,
        'rol', v_user.rol
    );
END;
$function$;
