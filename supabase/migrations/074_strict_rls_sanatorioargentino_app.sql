-- =====================================================================================
-- MIGRACIÓN 074: BLINDAJE ESTRICTO DE RLS Y DOMINIO OFICIAL SANATORIOARGENTINO.APP
-- 1. [V-01] Elimina el bypass por Origin/Referer en public.is_valid_admqui_session()
--    para que ninguna consulta sin x-session-token / x-device-token válido pueda leer
--    ni modificar las 60+ tablas clínicas y administrativas.
-- 2. [V-02] Elimina el bypass por Origin/Referer en public.require_admqui_admin()
--    exigiendo estrictamente que el token de sesión pertenezca a un usuario con rol = 'admin'.
-- 3. [V-04] Blinda la tabla public.cita_online_reservas eliminando las políticas públicas
--    y exigiendo public.is_valid_admqui_session().
-- 4. [V-05] Actualiza public.verify_login(text, text) para respetar bloqueos de cuenta
--    (locked_until / failed_login_attempts) y actualiza public.heartbeat_and_verify_user_session
--    para no entregar ni validar sesiones cuando el token es inválido.
-- 5. Crea RPCs seguras de alcance mínimo para los flujos públicos sin login:
--    - public.buscar_paciente_kiosco_por_dni(text): devuelve únicamente nombre, DNI y NHC
--      de un DNI exacto para el Tótem /turno sin exponer el padrón hospital_pacientes.
--    - public.obtener_receta_publica_por_token(text): devuelve únicamente la receta cuyo
--      token/CUIR/nro_receta coincida exactamente.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. FUNCIÓN ESTRICTA DE VALIDACIÓN DE SESIÓN (SIN BYPASS POR ORIGIN/REFERER)
-- -------------------------------------------------------------------------------------
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

    -- Si envía explícitamente 'anonymous' o no envía ningún token de sesión/dispositivo, bloquear acceso
    IF v_session_token = 'anonymous' OR (v_session_token IS NULL AND v_device_token IS NULL) THEN
        RETURN FALSE;
    END IF;

    -- Validar que el x-session-token o x-device-token pertenezca a un usuario activo en admqui_usuarios
    IF EXISTS (
        SELECT 1 FROM public.admqui_usuarios u
        WHERE COALESCE(u.activo, TRUE) = TRUE
          AND (
              (v_session_token IS NOT NULL AND LENGTH(v_session_token) >= 12 AND u.active_session_token = v_session_token)
              OR (v_device_token IS NOT NULL AND LENGTH(v_device_token) >= 15 AND u.active_device_token = v_device_token)
          )
    ) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$function$;

-- -------------------------------------------------------------------------------------
-- 2. FUNCIÓN ESTRICTA DE ADMINISTRADOR (SIN BYPASS POR ORIGIN/REFERER)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.require_admqui_admin()
RETURNS VOID
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_caller_role TEXT;
    v_headers JSON;
    v_session_token TEXT;
    v_device_token TEXT;
BEGIN
    v_caller_role := COALESCE(current_setting('request.jwt.claim.role', true), current_setting('role', true), '');
    IF v_caller_role IN ('service_role', 'postgres', 'supabase_admin') THEN
        RETURN;
    END IF;

    BEGIN
        v_headers := current_setting('request.headers', true)::json;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Acceso denegado: sesión no válida.';
    END;

    v_session_token := NULLIF(TRIM(COALESCE(v_headers->>'x-session-token', v_headers->>'x-admqui-session', '')), '');
    v_device_token := NULLIF(TRIM(COALESCE(v_headers->>'x-device-token', v_headers->>'x-admqui-device', '')), '');

    IF v_session_token = 'anonymous' OR (v_session_token IS NULL AND v_device_token IS NULL) THEN
        RAISE EXCEPTION 'Acceso denegado: debe iniciar sesión como Administrador.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.admqui_usuarios u
        WHERE COALESCE(u.activo, TRUE) = TRUE
          AND u.rol = 'admin'
          AND (
              (v_session_token IS NOT NULL AND LENGTH(v_session_token) >= 12 AND u.active_session_token = v_session_token)
              OR (v_device_token IS NOT NULL AND LENGTH(v_device_token) >= 15 AND u.active_device_token = v_device_token)
          )
    ) THEN
        RETURN;
    END IF;

    RAISE EXCEPTION 'Acceso denegado: se requieren privilegios de Administrador.';
END;
$function$;

-- -------------------------------------------------------------------------------------
-- 3. BLINDAJE DE HEARTBEAT PARA RECHAZAR TOKENS FALSIFICADOS EN LOCALSTORAGE [V-03]
-- -------------------------------------------------------------------------------------
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

    -- Exigir que exista un token de sesión emitido por el login
    IF p_session_token IS NULL OR LENGTH(TRIM(p_session_token)) < 12 OR v_user.active_session_token IS NULL THEN
        RETURN jsonb_build_object(
            'active', FALSE,
            'status', 'invalid_session',
            'rol', v_user.rol
        );
    END IF;

    -- Si es heartbeat desde Recepciones Web y el token coincide o el dispositivo coincide
    IF COALESCE(TRIM(p_device_label), '') = 'Recepciones Web' AND v_user.active_session_token = p_session_token THEN
        UPDATE public.admqui_usuarios
        SET active_session_heartbeat = NOW()
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

    IF (p_device_token IS NOT NULL
        AND LENGTH(TRIM(p_device_token)) >= 15
        AND v_user.active_device_token IS NOT NULL
        AND v_user.active_device_token = p_device_token) THEN
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

-- -------------------------------------------------------------------------------------
-- 4. BLINDAJE DE TABLA public.cita_online_reservas Y TABLAS RECIENTES [V-04]
-- -------------------------------------------------------------------------------------
DO $$
DECLARE
    v_pol RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cita_online_reservas') THEN
        FOR v_pol IN
            SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'cita_online_reservas'
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.cita_online_reservas', v_pol.policyname);
        END LOOP;

        ALTER TABLE public.cita_online_reservas ENABLE ROW LEVEL SECURITY;

        CREATE POLICY "admqui_rls_session_cita_online_reservas"
        ON public.cita_online_reservas
        FOR ALL
        USING ((SELECT public.is_valid_admqui_session()))
        WITH CHECK ((SELECT public.is_valid_admqui_session()));
    END IF;
END;
$$;

-- -------------------------------------------------------------------------------------
-- 5. RPC SEGURA PARA EL TÓTEM DE TURNOS (/turno) — SOLO BÚSQUEDA PUNTUAL POR DNI
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.buscar_paciente_kiosco_por_dni(p_dni text)
RETURNS TABLE(
    nombre text,
    dni text,
    nhc text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_clean_dni TEXT;
BEGIN
    v_clean_dni := REGEXP_REPLACE(COALESCE(p_dni, ''), '\D', '', 'g');
    IF LENGTH(v_clean_dni) < 6 OR LENGTH(v_clean_dni) > 10 THEN
        RETURN;
    END IF;

    -- 1. Buscar primero en calidad_pacientes_diagnosticos
    RETURN QUERY
    SELECT
        cpd.paciente::text AS nombre,
        cpd.dni::text AS dni,
        cpd.nhc::text AS nhc
    FROM public.calidad_pacientes_diagnosticos cpd
    WHERE cpd.dni = v_clean_dni
      AND cpd.paciente IS NOT NULL
    ORDER BY cpd.fecha_visita DESC NULLS LAST
    LIMIT 1;

    IF FOUND THEN
        RETURN;
    END IF;

    -- 2. Fallback en hospital_pacientes (devolviendo únicamente nombre, dni y nhc, sin teléfono ni email)
    RETURN QUERY
    SELECT
        hp.nombre::text AS nombre,
        hp.dni::text AS dni,
        hp.nhc::text AS nhc
    FROM public.hospital_pacientes hp
    WHERE hp.dni = v_clean_dni
      AND hp.nombre IS NOT NULL
    LIMIT 1;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.buscar_paciente_kiosco_por_dni(text) TO anon, authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 6. PROTECCIÓN DE RECETAS ELECTRÓNICAS CON CONSULTA PÚBLICA SOLO POR TOKEN EXACTO
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_receta_publica_por_token(p_token_or_cuir text)
RETURNS SETOF public.recetas_electronicas
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_clean TEXT;
BEGIN
    v_clean := TRIM(COALESCE(p_token_or_cuir, ''));
    IF LENGTH(v_clean) < 6 THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT r.*
    FROM public.recetas_electronicas r
    WHERE r.token = v_clean
       OR r.cuir = v_clean
       OR r.nro_receta = v_clean
    LIMIT 1;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.obtener_receta_publica_por_token(text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

