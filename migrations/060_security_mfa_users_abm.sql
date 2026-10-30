-- ============================================================================
-- MIGRACIÓN 060: CIBERSEGURIDAD, CAMBIO OBLIGATORIO DE CLAVE, 2FA HÍBRIDO Y ABM
-- Totalmente retrocompatible con sesiones activas y reversible.
-- ============================================================================

-- 1. Nuevas columnas de seguridad y gestión en admqui_usuarios
ALTER TABLE public.admqui_usuarios
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS telefono_whatsapp TEXT,
    ADD COLUMN IF NOT EXISTS rol TEXT DEFAULT 'operador',
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS mfa_method TEXT,
    ADD COLUMN IF NOT EXISTS totp_secret TEXT,
    ADD COLUMN IF NOT EXISTS otp_code_hash TEXT,
    ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS trusted_devices JSONB DEFAULT '[]'::jsonb;

-- 2. Poblar emails institucionales por defecto si están vacíos
UPDATE public.admqui_usuarios
SET email = CASE
    WHEN iniciales LIKE '%@%' THEN LOWER(TRIM(iniciales))
    WHEN usuario LIKE '%@%' THEN LOWER(TRIM(usuario))
    ELSE LOWER(TRIM(usuario)) || '@sanatorioargentino.com.ar'
END
WHERE email IS NULL;

-- 3. Poblar roles actuales según la configuración histórica del sistema
UPDATE public.admqui_usuarios
SET rol = CASE
    WHEN LOWER(TRIM(usuario)) IN ('lmarinero', 'admin', 'mrodriguez', 'dsantaella', 'jcorrea', 'sfemenia', 'paraya', 'smanzano') THEN 'admin'
    WHEN LOWER(TRIM(usuario)) IN ('daguilera', 'solivier', 'vjacques', 'eleal', 'macosta') THEN 'contact_center'
    WHEN LOWER(TRIM(usuario)) IN ('pgarcia') THEN 'gobernanza_dashboard'
    WHEN LOWER(TRIM(usuario)) IN ('gobernanza', 'mjpavia') THEN 'gobernanza'
    WHEN LOWER(TRIM(usuario)) IN ('naguilera') THEN 'uci'
    WHEN LOWER(TRIM(usuario)) IN ('aguero', 'cedap', 'cuyo') THEN 'laboratorio'
    WHEN LOWER(TRIM(usuario)) IN ('soribarale') THEN 'activos'
    ELSE 'operador'
END
WHERE rol IS NULL OR rol = 'operador';

-- 4. Marcar a TODOS los usuarios (excepto cuentas de portales externos de laboratorio)
-- para que en su próximo inicio de sesión actualicen su contraseña obligatoriamente y configuren 2FA
UPDATE public.admqui_usuarios
SET must_change_password = CASE
        WHEN LOWER(TRIM(usuario)) IN ('aguero', 'cedap', 'cuyo') THEN FALSE
        ELSE TRUE
    END,
    mfa_enabled = CASE
        WHEN LOWER(TRIM(usuario)) IN ('aguero', 'cedap', 'cuyo') THEN FALSE
        ELSE TRUE
    END,
    trusted_devices = COALESCE(trusted_devices, '[]'::jsonb);

-- 5. Función verify_login_v2: Login con verificación de dispositivo de confianza (30 días) y estado de seguridad
CREATE OR REPLACE FUNCTION public.verify_login_v2(
    p_usuario TEXT,
    p_password TEXT,
    p_device_token TEXT DEFAULT NULL
)
RETURNS TABLE(
    id UUID,
    usuario TEXT,
    nombre TEXT,
    iniciales TEXT,
    rol TEXT,
    email TEXT,
    telefono_whatsapp TEXT,
    avatar_url TEXT,
    must_change_password BOOLEAN,
    mfa_enabled BOOLEAN,
    mfa_method TEXT,
    has_totp BOOLEAN,
    totp_secret TEXT,
    device_trusted BOOLEAN
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
      AND u.activo = TRUE
    LIMIT 1;

    IF NOT FOUND THEN
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
        COALESCE(v_user.must_change_password, FALSE),
        COALESCE(v_user.mfa_enabled, TRUE),
        v_user.mfa_method,
        (v_user.totp_secret IS NOT NULL AND LENGTH(v_user.totp_secret) > 0) AS has_totp,
        v_user.totp_secret,
        v_trusted;
END;
$function$;

-- 6. Actualizar change_password existente para limpiar must_change_password cuando el usuario cambia su clave
CREATE OR REPLACE FUNCTION public.change_password(
    p_user_id UUID,
    p_old_password TEXT,
    p_new_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    valid BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM public.admqui_usuarios
        WHERE id = p_user_id
          AND password_hash = crypt(p_old_password, password_hash)
          AND activo = TRUE
    ) INTO valid;

    IF NOT valid THEN
        RETURN FALSE;
    END IF;

    UPDATE public.admqui_usuarios
    SET password_hash = crypt(p_new_password, gen_salt('bf')),
        must_change_password = FALSE,
        password_changed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN TRUE;
END;
$function$;

-- 7. Función para generar OTP de 6 dígitos para WhatsApp / Email
CREATE OR REPLACE FUNCTION public.generate_user_otp(
    p_user_id UUID,
    p_telefono TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_code TEXT;
    v_user RECORD;
    v_phone TEXT;
BEGIN
    SELECT * INTO v_user
    FROM public.admqui_usuarios
    WHERE id = p_user_id AND activo = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuario no encontrado o inactivo';
    END IF;

    v_phone := COALESCE(NULLIF(TRIM(p_telefono), ''), v_user.telefono_whatsapp);
    IF v_phone IS NULL OR LENGTH(REGEXP_REPLACE(v_phone, '\D', '', 'g')) < 8 THEN
        RAISE EXCEPTION 'Ingrese un número de teléfono móvil válido para recibir el código por WhatsApp';
    END IF;

    -- Código aleatorio de 6 dígitos (100000 - 999999)
    v_code := LPAD((FLOOR(RANDOM() * 900000) + 100000)::INT::TEXT, 6, '0');

    UPDATE public.admqui_usuarios
    SET telefono_whatsapp = v_phone,
        otp_code_hash = crypt(v_code, gen_salt('bf')),
        otp_expires_at = NOW() + INTERVAL '10 minutes',
        mfa_method = COALESCE(mfa_method, 'whatsapp'),
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'code', v_code,
        'telefono_whatsapp', v_phone,
        'nombre', v_user.nombre,
        'usuario', v_user.usuario
    );
END;
$function$;

-- 8. Función para verificar OTP de WhatsApp y registrar dispositivo de confianza (30 días)
CREATE OR REPLACE FUNCTION public.verify_user_otp(
    p_user_id UUID,
    p_code TEXT,
    p_trust_device BOOLEAN DEFAULT TRUE,
    p_device_token TEXT DEFAULT NULL,
    p_device_label TEXT DEFAULT 'PC Sanatorio'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_user RECORD;
    v_devices JSONB;
BEGIN
    SELECT * INTO v_user
    FROM public.admqui_usuarios
    WHERE id = p_user_id AND activo = TRUE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF v_user.otp_code_hash IS NULL OR v_user.otp_expires_at IS NULL OR v_user.otp_expires_at < NOW() THEN
        RETURN FALSE;
    END IF;

    IF v_user.otp_code_hash <> crypt(TRIM(p_code), v_user.otp_code_hash) THEN
        RETURN FALSE;
    END IF;

    v_devices := COALESCE(v_user.trusted_devices, '[]'::jsonb);

    -- Filtrar dispositivos expirados o con el mismo token y agregar el nuevo si p_trust_device = true
    IF p_trust_device AND p_device_token IS NOT NULL AND LENGTH(TRIM(p_device_token)) > 10 THEN
        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
        INTO v_devices
        FROM jsonb_array_elements(v_devices) elem
        WHERE (elem->>'token') <> p_device_token
          AND (elem->>'expires_at')::timestamptz > NOW();

        v_devices := v_devices || jsonb_build_array(
            jsonb_build_object(
                'token', p_device_token,
                'label', COALESCE(p_device_label, 'PC Sanatorio'),
                'created_at', NOW(),
                'expires_at', NOW() + INTERVAL '30 days'
            )
        );
    END IF;

    UPDATE public.admqui_usuarios
    SET otp_code_hash = NULL,
        otp_expires_at = NULL,
        trusted_devices = v_devices,
        mfa_method = COALESCE(mfa_method, 'whatsapp'),
        ultimo_login = NOW(),
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN TRUE;
END;
$function$;

-- 9. Función para guardar secreto TOTP (Google Authenticator) y registrar dispositivo de confianza
CREATE OR REPLACE FUNCTION public.complete_totp_verification(
    p_user_id UUID,
    p_totp_secret TEXT DEFAULT NULL,
    p_trust_device BOOLEAN DEFAULT TRUE,
    p_device_token TEXT DEFAULT NULL,
    p_device_label TEXT DEFAULT 'PC Sanatorio'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_user RECORD;
    v_devices JSONB;
BEGIN
    SELECT * INTO v_user
    FROM public.admqui_usuarios
    WHERE id = p_user_id AND activo = TRUE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    v_devices := COALESCE(v_user.trusted_devices, '[]'::jsonb);

    IF p_trust_device AND p_device_token IS NOT NULL AND LENGTH(TRIM(p_device_token)) > 10 THEN
        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
        INTO v_devices
        FROM jsonb_array_elements(v_devices) elem
        WHERE (elem->>'token') <> p_device_token
          AND (elem->>'expires_at')::timestamptz > NOW();

        v_devices := v_devices || jsonb_build_array(
            jsonb_build_object(
                'token', p_device_token,
                'label', COALESCE(p_device_label, 'PC Sanatorio'),
                'created_at', NOW(),
                'expires_at', NOW() + INTERVAL '30 days'
            )
        );
    END IF;

    UPDATE public.admqui_usuarios
    SET totp_secret = COALESCE(NULLIF(TRIM(p_totp_secret), ''), totp_secret),
        mfa_method = 'totp',
        trusted_devices = v_devices,
        ultimo_login = NOW(),
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN TRUE;
END;
$function$;

-- 10. Funciones Administrativas (ABM de Usuarios y Seguridad)
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(
    id UUID,
    usuario TEXT,
    nombre TEXT,
    iniciales TEXT,
    email TEXT,
    telefono_whatsapp TEXT,
    rol TEXT,
    activo BOOLEAN,
    must_change_password BOOLEAN,
    password_changed_at TIMESTAMPTZ,
    mfa_enabled BOOLEAN,
    mfa_method TEXT,
    has_totp BOOLEAN,
    trusted_devices_count INT,
    ultimo_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    avatar_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        u.id,
        u.usuario,
        u.nombre,
        u.iniciales,
        u.email,
        u.telefono_whatsapp,
        COALESCE(u.rol, 'operador') AS rol,
        u.activo,
        COALESCE(u.must_change_password, FALSE) AS must_change_password,
        u.password_changed_at,
        COALESCE(u.mfa_enabled, TRUE) AS mfa_enabled,
        u.mfa_method,
        (u.totp_secret IS NOT NULL AND LENGTH(u.totp_secret) > 0) AS has_totp,
        jsonb_array_length(COALESCE(u.trusted_devices, '[]'::jsonb))::INT AS trusted_devices_count,
        u.ultimo_login,
        u.created_at,
        u.avatar_url
    FROM public.admqui_usuarios u
    ORDER BY u.activo DESC, u.nombre ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_save_user(
    p_id UUID DEFAULT NULL,
    p_usuario TEXT DEFAULT NULL,
    p_nombre TEXT DEFAULT NULL,
    p_password TEXT DEFAULT NULL,
    p_iniciales TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_telefono_whatsapp TEXT DEFAULT NULL,
    p_rol TEXT DEFAULT 'operador',
    p_activo BOOLEAN DEFAULT TRUE,
    p_must_change_password BOOLEAN DEFAULT TRUE,
    p_mfa_enabled BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_id UUID;
    v_clean_user TEXT;
BEGIN
    v_clean_user := LOWER(TRIM(COALESCE(p_usuario, '')));
    IF v_clean_user LIKE '%@%' THEN
        v_clean_user := SPLIT_PART(v_clean_user, '@', 1);
    END IF;

    IF p_id IS NULL THEN
        -- Crear nuevo usuario
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
            trusted_devices
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
            '[]'::jsonb
        )
        RETURNING id INTO v_id;
    ELSE
        -- Actualizar usuario existente
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
            password_hash = CASE
                WHEN p_password IS NOT NULL AND LENGTH(TRIM(p_password)) > 0
                THEN crypt(TRIM(p_password), gen_salt('bf'))
                ELSE password_hash
            END,
            updated_at = NOW()
        WHERE id = p_id
        RETURNING id INTO v_id;
    END IF;

    RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reset_user_security(
    p_user_id UUID,
    p_reset_password BOOLEAN DEFAULT FALSE,
    p_temp_password TEXT DEFAULT '123456',
    p_reset_mfa BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    UPDATE public.admqui_usuarios
    SET password_hash = CASE
            WHEN p_reset_password THEN crypt(COALESCE(NULLIF(TRIM(p_temp_password), ''), '123456'), gen_salt('bf'))
            ELSE password_hash
        END,
        must_change_password = CASE
            WHEN p_reset_password THEN TRUE
            ELSE must_change_password
        END,
        totp_secret = CASE
            WHEN p_reset_mfa THEN NULL
            ELSE totp_secret
        END,
        mfa_method = CASE
            WHEN p_reset_mfa THEN NULL
            ELSE mfa_method
        END,
        trusted_devices = CASE
            WHEN p_reset_mfa OR p_reset_password THEN '[]'::jsonb
            ELSE trusted_devices
        END,
        otp_code_hash = NULL,
        otp_expires_at = NULL,
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN FOUND;
END;
$function$;

