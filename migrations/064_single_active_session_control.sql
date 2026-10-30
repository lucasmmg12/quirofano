-- =====================================================================================
-- MIGRACIÓN 064: Control de Sesión Única (Bloqueo de Sesiones Simultáneas)
-- Impide que un mismo usuario opere en 2 dispositivos/navegadores en simultáneo.
-- Permite detectar sesiones activas y ofrece al usuario elegir obligatoriamente:
-- 1) Cerrar la sesión en el otro dispositivo y permanecer en este
-- 2) Salir de este dispositivo y mantener la otra sesión
-- =====================================================================================

-- 1. Columnas de control de sesión activa en admqui_usuarios
ALTER TABLE public.admqui_usuarios
    ADD COLUMN IF NOT EXISTS active_session_token TEXT,
    ADD COLUMN IF NOT EXISTS active_device_token TEXT,
    ADD COLUMN IF NOT EXISTS active_device_label TEXT,
    ADD COLUMN IF NOT EXISTS active_session_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS active_session_heartbeat TIMESTAMPTZ;

-- 2. RPC: check_or_claim_user_session
-- Verifica si existe otra sesión activa (< 90 seg de último heartbeat).
-- Si p_force_takeover = FALSE y hay otra sesión activa distinta de p_session_token,
-- devuelve { status: 'conflict', ... } sin pisar la otra sesión.
-- Si p_force_takeover = TRUE o no hay conflicto, registra esta sesión como la única activa.
CREATE OR REPLACE FUNCTION public.check_or_claim_user_session(
    p_user_id uuid,
    p_session_token text,
    p_device_token text DEFAULT NULL::text,
    p_device_label text DEFAULT 'PC Sanatorio'::text,
    p_force_takeover boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_user RECORD;
    v_has_other_active BOOLEAN := FALSE;
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

    -- Evaluar si hay otra sesión viva distinta a la actual (heartbeat en los últimos 90 segundos)
    IF v_user.active_session_token IS NOT NULL
       AND v_user.active_session_token <> COALESCE(p_session_token, '')
       AND v_user.active_session_heartbeat IS NOT NULL
       AND v_user.active_session_heartbeat > (NOW() - INTERVAL '90 seconds') THEN
        v_has_other_active := TRUE;
    END IF;

    -- Si hay otra sesión activa y todavía no eligió forzar el cierre de la otra, informar conflicto
    IF v_has_other_active AND NOT COALESCE(p_force_takeover, FALSE) THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'other_device_label', COALESCE(v_user.active_device_label, 'Otro equipo / navegador'),
            'other_started_at', v_user.active_session_started_at,
            'other_last_heartbeat', v_user.active_session_heartbeat
        );
    END IF;

    -- Si toma el control o es una sesión nueva distinta, cerrar sesiones previas en user_sessions
    IF v_user.active_session_token IS DISTINCT FROM p_session_token THEN
        UPDATE public.user_sessions
        SET ended_at = NOW()
        WHERE user_id = p_user_id AND ended_at IS NULL;
    END IF;

    -- Registrar esta sesión como la única sesión activa autorizada
    UPDATE public.admqui_usuarios
    SET active_session_token = p_session_token,
        active_device_token = p_device_token,
        active_device_label = COALESCE(NULLIF(TRIM(p_device_label), ''), 'PC Sanatorio'),
        active_session_started_at = CASE
            WHEN active_session_token = p_session_token THEN COALESCE(active_session_started_at, NOW())
            ELSE NOW()
        END,
        active_session_heartbeat = NOW(),
        ultimo_login = NOW(),
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'status', 'ok',
        'session_token', p_session_token,
        'device_label', COALESCE(NULLIF(TRIM(p_device_label), ''), 'PC Sanatorio')
    );
END;
$function$;

-- 3. RPC: heartbeat_and_verify_user_session
-- Llamada periódicamente por el cliente activo para:
-- a) Verificar que la cuenta sigue activa (activo = TRUE)
-- b) Verificar que otro dispositivo no haya tomado la sesión ni esté conectado en simultáneo
-- c) Actualizar active_session_heartbeat = NOW() si esta sesión sigue siendo la titular
CREATE OR REPLACE FUNCTION public.heartbeat_and_verify_user_session(
    p_user_id uuid,
    p_session_token text,
    p_device_token text DEFAULT NULL::text,
    p_device_label text DEFAULT 'PC Sanatorio'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_user RECORD;
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

    -- Si no había token registrado aún (ej. sesión iniciada antes de esta actualización), registrarlo
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
            'rol', v_user.rol,
            'must_change_password', COALESCE(v_user.must_change_password, FALSE),
            'mfa_enabled', COALESCE(v_user.mfa_enabled, FALSE)
        );
    END IF;

    -- Si el token coincide con la sesión titular actual, renovar heartbeat
    IF v_user.active_session_token = p_session_token THEN
        UPDATE public.admqui_usuarios
        SET active_session_heartbeat = NOW(),
            active_device_label = COALESCE(NULLIF(TRIM(p_device_label), ''), active_device_label)
        WHERE id = p_user_id;

        RETURN jsonb_build_object(
            'active', TRUE,
            'status', 'ok',
            'rol', v_user.rol,
            'must_change_password', COALESCE(v_user.must_change_password, FALSE),
            'mfa_enabled', COALESCE(v_user.mfa_enabled, FALSE)
        );
    END IF;

    -- Si el token en base de datos es DIFERENTE al de este dispositivo, otra sesión está abierta
    RETURN jsonb_build_object(
        'active', TRUE,
        'status', 'displaced',
        'other_device_label', COALESCE(v_user.active_device_label, 'Otro dispositivo / navegador'),
        'other_started_at', v_user.active_session_started_at,
        'other_last_heartbeat', v_user.active_session_heartbeat,
        'rol', v_user.rol
    );
END;
$function$;

-- 4. RPC: release_user_session
-- Libera la sesión activa al cerrar sesión (logout)
CREATE OR REPLACE FUNCTION public.release_user_session(
    p_user_id uuid,
    p_session_token text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    UPDATE public.admqui_usuarios
    SET active_session_token = NULL,
        active_device_token = NULL,
        active_device_label = NULL,
        active_session_started_at = NULL,
        active_session_heartbeat = NULL
    WHERE id = p_user_id
      AND (p_session_token IS NULL OR active_session_token = p_session_token);

    IF FOUND THEN
        UPDATE public.user_sessions
        SET ended_at = NOW()
        WHERE user_id = p_user_id AND ended_at IS NULL;
    END IF;

    RETURN TRUE;
END;
$function$;
