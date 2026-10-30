-- =====================================================================================
-- MIGRACIÓN 063: Garantía Estricta de los 3 Checkboxes de Seguridad de Usuario
-- 1. Elimina la sobrecarga duplicada de 11 parámetros de admin_save_user para evitar
--    ambigüedad en PostgREST.
-- 2. En admin_save_user:
--    - Respeta estrictamente p_must_change_password (TRUE/FALSE), p_mfa_enabled (TRUE/FALSE)
--      y p_activo (TRUE/FALSE).
--    - Si p_activo pasa a FALSE, revoca trusted_devices, limpia OTP y cierra sesiones
--      activas en user_sessions inmediatamente.
--    - Si p_mfa_enabled pasa de FALSE a TRUE, limpia trusted_devices para exigir 2FA en el
--      próximo login sin excepción.
-- 3. En verify_login_v2:
--    - Devuelve el campo activo para que el frontend pueda distinguir cuenta dada de baja
--      de contraseña incorrecta, sin actualizar ultimo_login cuando activo = FALSE.
-- =====================================================================================

-- 1. Eliminar sobrecarga antigua de 11 parámetros de admin_save_user
DROP FUNCTION IF EXISTS public.admin_save_user(
    uuid, text, text, text, text, text, text, text, boolean, boolean, boolean
);

-- 2. Reemplazar versión definitiva de 15 parámetros de admin_save_user
CREATE OR REPLACE FUNCTION public.admin_save_user(
    p_id uuid DEFAULT NULL::uuid,
    p_usuario text DEFAULT NULL::text,
    p_nombre text DEFAULT NULL::text,
    p_password text DEFAULT NULL::text,
    p_iniciales text DEFAULT NULL::text,
    p_email text DEFAULT NULL::text,
    p_telefono_whatsapp text DEFAULT NULL::text,
    p_rol text DEFAULT 'operador'::text,
    p_activo boolean DEFAULT true,
    p_must_change_password boolean DEFAULT true,
    p_mfa_enabled boolean DEFAULT true,
    p_dni text DEFAULT NULL::text,
    p_area_sector text DEFAULT NULL::text,
    p_cargo text DEFAULT NULL::text,
    p_avatar_url text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_id UUID;
    v_clean_user TEXT;
    v_prev_mfa BOOLEAN;
BEGIN
    v_clean_user := LOWER(TRIM(COALESCE(p_usuario, '')));
    IF v_clean_user LIKE '%@%' THEN
        v_clean_user := SPLIT_PART(v_clean_user, '@', 1);
    END IF;

    IF p_id IS NULL THEN
        IF v_clean_user = '' OR TRIM(COALESCE(p_nombre, '')) = '' THEN
            RAISE EXCEPTION 'Usuario y nombre son obligatorios';
        END IF;

        INSERT INTO public.admqui_usuarios (
            usuario,
            nombre,
            password_hash,
            iniciales,
            email,
            telefono_whatsapp,
            rol,
            activo,
            must_change_password,
            mfa_enabled,
            trusted_devices,
            dni,
            area_sector,
            cargo,
            avatar_url
        ) VALUES (
            v_clean_user,
            TRIM(p_nombre),
            crypt(COALESCE(NULLIF(p_password, ''), '123456'), gen_salt('bf')),
            COALESCE(NULLIF(TRIM(p_iniciales), ''), UPPER(LEFT(TRIM(p_nombre), 2))),
            COALESCE(NULLIF(TRIM(p_email), ''), v_clean_user || '@sanatorioargentino.com.ar'),
            NULLIF(TRIM(p_telefono_whatsapp), ''),
            COALESCE(p_rol, 'operador'),
            COALESCE(p_activo, TRUE),
            COALESCE(p_must_change_password, TRUE),
            COALESCE(p_mfa_enabled, TRUE),
            '[]'::jsonb,
            NULLIF(TRIM(COALESCE(p_dni, '')), ''),
            NULLIF(TRIM(COALESCE(p_area_sector, '')), ''),
            NULLIF(TRIM(COALESCE(p_cargo, '')), ''),
            NULLIF(TRIM(COALESCE(p_avatar_url, '')), '')
        )
        RETURNING id INTO v_id;
    ELSE
        SELECT COALESCE(mfa_enabled, TRUE)
        INTO v_prev_mfa
        FROM public.admqui_usuarios
        WHERE id = p_id;

        UPDATE public.admqui_usuarios
        SET usuario = COALESCE(NULLIF(v_clean_user, ''), usuario),
            nombre = COALESCE(NULLIF(TRIM(p_nombre), ''), nombre),
            iniciales = COALESCE(NULLIF(TRIM(p_iniciales), ''), iniciales),
            email = COALESCE(NULLIF(TRIM(p_email), ''), email),
            telefono_whatsapp = CASE WHEN p_telefono_whatsapp IS NOT NULL THEN NULLIF(TRIM(p_telefono_whatsapp), '') ELSE telefono_whatsapp END,
            rol = COALESCE(p_rol, rol),
            activo = COALESCE(p_activo, activo),
            must_change_password = COALESCE(p_must_change_password, must_change_password),
            mfa_enabled = COALESCE(p_mfa_enabled, mfa_enabled),
            dni = CASE WHEN p_dni IS NOT NULL THEN NULLIF(TRIM(p_dni), '') ELSE dni END,
            area_sector = CASE WHEN p_area_sector IS NOT NULL THEN NULLIF(TRIM(p_area_sector), '') ELSE area_sector END,
            cargo = CASE WHEN p_cargo IS NOT NULL THEN NULLIF(TRIM(p_cargo), '') ELSE cargo END,
            avatar_url = CASE WHEN p_avatar_url IS NOT NULL THEN NULLIF(TRIM(p_avatar_url), '') ELSE avatar_url END,
            password_hash = CASE
                WHEN p_password IS NOT NULL AND LENGTH(TRIM(p_password)) > 0
                THEN crypt(TRIM(p_password), gen_salt('bf'))
                ELSE password_hash
            END,
            -- Si se desactiva la cuenta o si se vuelve a activar 2FA, limpiar dispositivos recordados
            trusted_devices = CASE
                WHEN COALESCE(p_activo, TRUE) = FALSE THEN '[]'::jsonb
                WHEN COALESCE(v_prev_mfa, TRUE) = FALSE AND COALESCE(p_mfa_enabled, TRUE) = TRUE THEN '[]'::jsonb
                ELSE trusted_devices
            END,
            otp_code_hash = CASE
                WHEN COALESCE(p_activo, TRUE) = FALSE OR COALESCE(p_mfa_enabled, TRUE) = FALSE THEN NULL
                ELSE otp_code_hash
            END,
            otp_expires_at = CASE
                WHEN COALESCE(p_activo, TRUE) = FALSE OR COALESCE(p_mfa_enabled, TRUE) = FALSE THEN NULL
                ELSE otp_expires_at
            END,
            updated_at = NOW()
        WHERE id = p_id
        RETURNING id INTO v_id;

        -- Si se desmarcó "Cuenta Activa", cerrar inmediatamente cualquier sesión activa en curso
        IF COALESCE(p_activo, TRUE) = FALSE THEN
            UPDATE public.user_sessions
            SET ended_at = NOW()
            WHERE user_id = p_id AND ended_at IS NULL;
        END IF;
    END IF;

    RETURN v_id;
END;
$function$;

-- 3. Actualizar verify_login_v2 para incluir activo, dni, area_sector y cargo
DROP FUNCTION IF EXISTS public.verify_login_v2(text, text, text);

CREATE OR REPLACE FUNCTION public.verify_login_v2(
    p_usuario text,
    p_password text,
    p_device_token text DEFAULT NULL::text
)
RETURNS TABLE(
    id uuid,
    usuario text,
    nombre text,
    iniciales text,
    rol text,
    email text,
    telefono_whatsapp text,
    avatar_url text,
    dni text,
    area_sector text,
    cargo text,
    activo boolean,
    must_change_password boolean,
    mfa_enabled boolean,
    mfa_method text,
    has_totp boolean,
    totp_secret text,
    device_trusted boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_user RECORD;
    v_trusted BOOLEAN := FALSE;
    v_elem JSONB;
BEGIN
    SELECT u.*
    INTO v_user
    FROM public.admqui_usuarios u
    WHERE u.usuario = LOWER(TRIM(p_usuario))
      AND u.password_hash = crypt(p_password, u.password_hash)
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Si la cuenta está inactiva (activo = FALSE), devolver la fila con activo = FALSE
    -- sin actualizar ultimo_login para que el frontend informe que la cuenta está dada de baja
    IF COALESCE(v_user.activo, TRUE) = FALSE THEN
        RETURN QUERY
        SELECT
            v_user.id,
            v_user.usuario,
            v_user.nombre,
            v_user.iniciales,
            COALESCE(v_user.rol, 'operador'),
            v_user.email,
            v_user.telefono_whatsapp,
            v_user.avatar_url,
            v_user.dni,
            v_user.area_sector,
            v_user.cargo,
            FALSE AS activo,
            COALESCE(v_user.must_change_password, FALSE),
            COALESCE(v_user.mfa_enabled, FALSE),
            v_user.mfa_method,
            (v_user.totp_secret IS NOT NULL AND LENGTH(v_user.totp_secret) > 0) AS has_totp,
            NULL::TEXT AS totp_secret,
            FALSE AS device_trusted;
        RETURN;
    END IF;

    -- Verificar si el p_device_token está en trusted_devices y no ha expirado
    IF p_device_token IS NOT NULL AND LENGTH(TRIM(p_device_token)) > 10 AND v_user.trusted_devices IS NOT NULL THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(v_user.trusted_devices)
        LOOP
            IF (v_elem->>'token') = p_device_token
               AND (v_elem->>'expires_at')::timestamptz > NOW() THEN
                v_trusted := TRUE;
                EXIT;
            END IF;
        END LOOP;
    END IF;

    -- Actualizar último login si no requiere más pasos
    IF NOT COALESCE(v_user.must_change_password, FALSE) AND (NOT COALESCE(v_user.mfa_enabled, FALSE) OR v_trusted) THEN
        UPDATE public.admqui_usuarios
        SET ultimo_login = NOW()
        WHERE public.admqui_usuarios.id = v_user.id;
    END IF;

    RETURN QUERY
    SELECT
        v_user.id,
        v_user.usuario,
        v_user.nombre,
        v_user.iniciales,
        COALESCE(v_user.rol, 'operador'),
        v_user.email,
        v_user.telefono_whatsapp,
        v_user.avatar_url,
        v_user.dni,
        v_user.area_sector,
        v_user.cargo,
        COALESCE(v_user.activo, TRUE) AS activo,
        COALESCE(v_user.must_change_password, FALSE),
        COALESCE(v_user.mfa_enabled, FALSE),
        v_user.mfa_method,
        (v_user.totp_secret IS NOT NULL AND LENGTH(v_user.totp_secret) > 0) AS has_totp,
        v_user.totp_secret,
        v_trusted;
END;
$function$;

