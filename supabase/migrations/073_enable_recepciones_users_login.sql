-- =====================================================================================
-- MIGRACIÓN 073: HABILITAR INGRESO DE TODOS LOS USUARIOS ACTIVOS EN EL PROYECTO RECEPCIONES
-- 1. Actualiza public.verify_login(text, text) para permitir el ingreso de TODOS los
--    usuarios activos de admqui_usuarios (incluyendo ggodoy, recepcion, operadores y admins)
--    que se conectan desde el proyecto Recepciones y portales asociados.
-- 2. Actualiza public.is_valid_admqui_session() para reconocer el dominio de Recepciones
--    (https://recepciones*.vercel.app) y permitir el funcionamiento de vistas de kiosco/recepción.
-- 3. Sincroniza check_or_claim_user_session y heartbeat_and_verify_user_session para que
--    tener abierto Recepciones Web y ADM-QUI al mismo tiempo no cierre la sesión del usuario.
-- =====================================================================================

-- 1. Permitir login en public.verify_login para todos los usuarios activos (Recepciones + Laboratorios)
CREATE OR REPLACE FUNCTION public.verify_login(
    p_usuario text,
    p_password text
)
RETURNS TABLE(
    id uuid,
    usuario text,
    nombre text,
    iniciales text,
    rol text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_user RECORD;
    v_clean_user TEXT := LOWER(TRIM(COALESCE(p_usuario, '')));
    v_digits TEXT := REGEXP_REPLACE(COALESCE(p_usuario, ''), '\D', '', 'g');
    v_plain_password TEXT;
BEGIN
    v_plain_password := public.decode_transport_password(p_password);

    SELECT u.*
    INTO v_user
    FROM public.admqui_usuarios u
    WHERE (
            LOWER(TRIM(u.usuario)) = v_clean_user
            OR LOWER(TRIM(COALESCE(u.email, ''))) = v_clean_user
            OR LOWER(SPLIT_PART(TRIM(COALESCE(u.email, '')), '@', 1)) = v_clean_user
            OR (LENGTH(v_digits) >= 8 AND REGEXP_REPLACE(COALESCE(u.telefono_whatsapp, ''), '\D', '', 'g') = v_digits)
          )
      AND COALESCE(u.activo, TRUE) = TRUE
    ORDER BY u.activo DESC, u.created_at ASC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF NOT (
        v_user.password_hash = extensions.crypt(v_plain_password, v_user.password_hash)
        OR v_user.password_hash = extensions.crypt(TRIM(v_plain_password), v_user.password_hash)
    ) THEN
        RETURN;
    END IF;

    UPDATE public.admqui_usuarios
    SET ultimo_login = NOW()
    WHERE public.admqui_usuarios.id = v_user.id;

    RETURN QUERY
    SELECT
        v_user.id,
        v_user.usuario,
        v_user.nombre,
        v_user.iniciales,
        COALESCE(v_user.rol, 'operador');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.verify_login(text, text) TO anon, authenticated, service_role;

-- 2. Actualizar is_valid_admqui_session para autorizar tanto ADM-QUI como Recepciones
CREATE OR REPLACE FUNCTION public.is_valid_admqui_session()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_caller_role TEXT;
    v_headers JSON;
    v_session_token TEXT;
    v_device_token TEXT;
    v_origin TEXT;
BEGIN
    v_caller_role := COALESCE(current_setting('request.jwt.claim.role', true), current_setting('role', true), '');
    IF v_caller_role IN ('service_role', 'postgres', 'supabase_admin') THEN
        RETURN TRUE;
    END IF;

    BEGIN
        v_headers := current_setting('request.headers', true)::json;
    EXCEPTION WHEN OTHERS THEN
        RETURN FALSE;
    END;

    v_session_token := NULLIF(TRIM(COALESCE(v_headers->>'x-session-token', v_headers->>'x-admqui-session', '')), '');
    v_device_token := NULLIF(TRIM(COALESCE(v_headers->>'x-device-token', v_headers->>'x-admqui-device', '')), '');
    v_origin := LOWER(TRIM(COALESCE(v_headers->>'origin', v_headers->>'referer', '')));

    -- Si proviene del proyecto Recepciones (recepciones*.vercel.app), permitir operación
    IF v_origin LIKE 'https://recepciones%.vercel.app%' THEN
        RETURN TRUE;
    END IF;

    -- Si envía explícitamente 'anonymous' desde ADM-QUI sin sesión iniciada, bloquear acceso a tablas
    IF v_session_token = 'anonymous' THEN
        RETURN FALSE;
    END IF;

    -- Si envía x-session-token o x-device-token, validar contra admqui_usuarios activo
    IF v_session_token IS NOT NULL OR v_device_token IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.admqui_usuarios u
            WHERE COALESCE(u.activo, TRUE) = TRUE
              AND (
                  (v_session_token IS NOT NULL AND u.active_session_token = v_session_token)
                  OR (v_device_token IS NOT NULL AND LENGTH(v_device_token) >= 15 AND u.active_device_token = v_device_token)
              )
        ) THEN
            RETURN TRUE;
        END IF;

        -- Si trae formato de token institucional válido desde dominios oficiales, permitir acceso
        IF (v_session_token LIKE 'sa_sess_%' OR v_session_token LIKE 'sess_%' OR v_device_token LIKE 'sa_dev_%') AND (
            v_origin LIKE 'https://quirofano%.vercel.app%'
            OR v_origin LIKE 'https://recepciones%.vercel.app%'
            OR v_origin LIKE 'https://%vercel.app%'
            OR v_origin LIKE 'http://localhost%'
            OR v_origin LIKE 'http://127.0.0.1%'
            OR v_origin LIKE 'http://128.223.%'
        ) THEN
            RETURN TRUE;
        END IF;
    END IF;

    -- Compatibilidad para orígenes oficiales del Sanatorio
    IF (
        v_origin LIKE 'https://quirofano%.vercel.app%'
        OR v_origin LIKE 'https://recepciones%.vercel.app%'
        OR v_origin LIKE 'https://%vercel.app%'
        OR v_origin LIKE 'http://localhost%'
        OR v_origin LIKE 'http://127.0.0.1%'
        OR v_origin LIKE 'http://128.223.%'
    ) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$function$;

-- 3. Evitar que Recepciones Web y ADM-QUI se desplacen mutuamente cuando el mismo usuario usa ambos sistemas
CREATE OR REPLACE FUNCTION public.check_or_claim_user_session(
    p_user_id uuid,
    p_session_token text,
    p_device_token text DEFAULT NULL::text,
    p_device_label text DEFAULT NULL::text,
    p_force_takeover boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

    -- Si la solicitud viene desde Recepciones Web y el usuario ya tiene una sesión activa en ADM-QUI,
    -- compartir el mismo session_token sin pisar el device_token de ADM-QUI para que ambos convivan
    IF COALESCE(TRIM(p_device_label), '') = 'Recepciones Web'
       AND v_user.active_session_token IS NOT NULL
       AND v_user.active_session_heartbeat IS NOT NULL
       AND v_user.active_session_heartbeat > (NOW() - INTERVAL '10 minutes') THEN
        UPDATE public.admqui_usuarios
        SET active_session_heartbeat = NOW()
        WHERE id = p_user_id;

        RETURN jsonb_build_object(
            'status', 'ok',
            'session_token', v_user.active_session_token
        );
    END IF;

    -- Determinar si la solicitud proviene de la MISMA PC (mismo device_token) o si la sesión previa era de Recepciones Web
    IF (p_device_token IS NOT NULL
        AND LENGTH(TRIM(p_device_token)) > 0
        AND v_user.active_device_token IS NOT NULL
        AND v_user.active_device_token = p_device_token)
       OR COALESCE(v_user.active_device_label, '') = 'Recepciones Web' THEN
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

    IF v_has_other_pc_active AND NOT COALESCE(p_force_takeover, FALSE) THEN
        RETURN jsonb_build_object(
            'status', 'conflict',
            'other_device_label', COALESCE(v_user.active_device_label, 'Otra PC / Dispositivo'),
            'other_started_at', v_user.active_session_started_at,
            'other_last_heartbeat', v_user.active_session_heartbeat
        );
    END IF;

    IF v_is_same_pc
       AND NOT COALESCE(p_force_takeover, FALSE)
       AND v_user.active_session_token IS NOT NULL
       AND v_user.active_session_heartbeat IS NOT NULL
       AND v_user.active_session_heartbeat > (NOW() - INTERVAL '90 seconds') THEN
        v_effective_session_token := v_user.active_session_token;
    ELSE
        v_effective_session_token := p_session_token;
    END IF;

    UPDATE public.admqui_usuarios
    SET active_session_token = v_effective_session_token,
        active_device_token = COALESCE(NULLIF(TRIM(p_device_token), ''), active_device_token),
        active_device_label = COALESCE(NULLIF(TRIM(p_device_label), ''), 'PC Sanatorio'),
        active_session_started_at = CASE
            WHEN v_effective_session_token = v_user.active_session_token THEN COALESCE(active_session_started_at, NOW())
            ELSE NOW()
        END,
        active_session_heartbeat = NOW()
    WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'status', 'ok',
        'session_token', v_effective_session_token
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.heartbeat_and_verify_user_session(
    p_user_id uuid,
    p_session_token text DEFAULT NULL::text,
    p_device_token text DEFAULT NULL::text,
    p_device_label text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

    -- Si es heartbeat desde Recepciones Web, mantener viva la sesión y devolver el session_token activo
    IF COALESCE(TRIM(p_device_label), '') = 'Recepciones Web' THEN
        UPDATE public.admqui_usuarios
        SET active_session_heartbeat = NOW(),
            active_session_token = COALESCE(active_session_token, p_session_token)
        WHERE id = p_user_id;

        RETURN jsonb_build_object(
            'active', TRUE,
            'status', 'ok',
            'session_token', COALESCE(v_user.active_session_token, p_session_token),
            'rol', v_user.rol,
            'must_change_password', COALESCE(v_user.must_change_password, FALSE),
            'mfa_enabled', COALESCE(v_user.mfa_enabled, FALSE)
        );
    END IF;

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

    IF (p_device_token IS NOT NULL
        AND LENGTH(TRIM(p_device_token)) > 0
        AND v_user.active_device_token IS NOT NULL
        AND v_user.active_device_token = p_device_token)
       OR COALESCE(v_user.active_device_label, '') = 'Recepciones Web' THEN
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

NOTIFY pgrst, 'reload schema';
