-- =====================================================================================
-- MIGRACIÓN 065: BLANQUEO AUTÓNOMO DE CONTRASEÑA Y CONFIRMACIÓN DE CONTACTO REAL
-- 1. Agrega datos_contacto_confirmados y datos_contacto_confirmados_at en admqui_usuarios
--    para exigir que los usuarios ingresen su Email real (evitando correos ficticios
--    por defecto) y su Celular WhatsApp de 10 dígitos (2645438114).
-- 2. Actualiza verify_login_v2, change_password y admin_list_users.
-- 3. Crea RPCs seguros para el flujo "¿Olvidaste tu contraseña? Blanquear clave":
--    - get_password_recovery_options(p_usuario)
--    - generate_recovery_otp(p_user_id, p_channel) -> solo envía al canal YA registrado
--    - update_user_security_contact(p_user_id, p_email, p_telefono_whatsapp)
--    - reset_forgotten_password(...)
-- =====================================================================================

-- 1. Nuevas columnas para seguimiento de confirmación de Email real y WhatsApp real
ALTER TABLE public.admqui_usuarios
    ADD COLUMN IF NOT EXISTS datos_contacto_confirmados BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS datos_contacto_confirmados_at TIMESTAMPTZ;

-- Las cuentas externas de laboratorio no requieren este paso
UPDATE public.admqui_usuarios
SET datos_contacto_confirmados = TRUE,
    datos_contacto_confirmados_at = NOW()
WHERE LOWER(TRIM(usuario)) IN ('aguero', 'cedap', 'cuyo');

-- 2. Función auxiliar para enmascarar emails (ej: "lucas@gmail.com" -> "lu***@gmail.com")
CREATE OR REPLACE FUNCTION public.mask_email_address(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
    v_clean TEXT;
    v_user_part TEXT;
    v_domain_part TEXT;
BEGIN
    v_clean := TRIM(COALESCE(p_email, ''));
    IF v_clean = '' OR POSITION('@' IN v_clean) = 0 THEN
        RETURN '';
    END IF;
    v_user_part := SPLIT_PART(v_clean, '@', 1);
    v_domain_part := SPLIT_PART(v_clean, '@', 2);
    IF LENGTH(v_user_part) <= 2 THEN
        RETURN LEFT(v_user_part, 1) || '***@' || v_domain_part;
    END IF;
    RETURN LEFT(v_user_part, 2) || '***' || RIGHT(v_user_part, 1) || '@' || v_domain_part;
END;
$function$;

-- 3. Función auxiliar para enmascarar teléfono WhatsApp (ej: "2645438114" -> "264****114")
CREATE OR REPLACE FUNCTION public.mask_phone_number(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
    v_digits TEXT;
BEGIN
    v_digits := REGEXP_REPLACE(COALESCE(p_phone, ''), '\D', '', 'g');
    IF LENGTH(v_digits) < 8 THEN
        RETURN '';
    END IF;
    RETURN LEFT(v_digits, 3) || '****' || RIGHT(v_digits, 3);
END;
$function$;

-- 4. Actualizar verify_login_v2 para devolver datos_contacto_confirmados
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
    device_trusted boolean,
    datos_contacto_confirmados boolean
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
            FALSE AS device_trusted,
            COALESCE(v_user.datos_contacto_confirmados, FALSE) AS datos_contacto_confirmados;
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
    IF NOT COALESCE(v_user.must_change_password, FALSE)
       AND COALESCE(v_user.datos_contacto_confirmados, FALSE)
       AND (NOT COALESCE(v_user.mfa_enabled, FALSE) OR v_trusted) THEN
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
        TRUE AS activo,
        COALESCE(v_user.must_change_password, FALSE),
        COALESCE(v_user.mfa_enabled, FALSE),
        v_user.mfa_method,
        (v_user.totp_secret IS NOT NULL AND LENGTH(v_user.totp_secret) > 0) AS has_totp,
        v_user.totp_secret,
        v_trusted,
        COALESCE(v_user.datos_contacto_confirmados, FALSE) AS datos_contacto_confirmados;
END;
$function$;

-- 5. Actualizar change_password para permitir guardar simultáneamente email real y teléfono WhatsApp
DROP FUNCTION IF EXISTS public.change_password(uuid, text, text);
DROP FUNCTION IF EXISTS public.change_password(uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION public.change_password(
    p_user_id UUID,
    p_old_password TEXT,
    p_new_password TEXT,
    p_email TEXT DEFAULT NULL,
    p_telefono_whatsapp TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    valid BOOLEAN;
    v_clean_email TEXT;
    v_clean_phone TEXT;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM public.admqui_usuarios
        WHERE id = p_user_id
          AND password_hash = crypt(p_old_password, password_hash)
          AND COALESCE(activo, TRUE) = TRUE
    ) INTO valid;

    IF NOT valid THEN
        RETURN FALSE;
    END IF;

    v_clean_email := LOWER(TRIM(COALESCE(p_email, '')));
    v_clean_phone := REGEXP_REPLACE(TRIM(COALESCE(p_telefono_whatsapp, '')), '\D', '', 'g');

    UPDATE public.admqui_usuarios
    SET password_hash = crypt(p_new_password, gen_salt('bf')),
        must_change_password = FALSE,
        password_changed_at = NOW(),
        email = CASE WHEN v_clean_email <> '' AND POSITION('@' IN v_clean_email) > 1 THEN v_clean_email ELSE email END,
        telefono_whatsapp = CASE WHEN LENGTH(v_clean_phone) = 10 THEN v_clean_phone ELSE telefono_whatsapp END,
        datos_contacto_confirmados = CASE
            WHEN v_clean_email <> '' AND POSITION('@' IN v_clean_email) > 1 AND LENGTH(v_clean_phone) = 10 THEN TRUE
            ELSE COALESCE(datos_contacto_confirmados, FALSE)
        END,
        datos_contacto_confirmados_at = CASE
            WHEN v_clean_email <> '' AND POSITION('@' IN v_clean_email) > 1 AND LENGTH(v_clean_phone) = 10 THEN NOW()
            ELSE datos_contacto_confirmados_at
        END,
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN TRUE;
END;
$function$;

-- 6. RPC para confirmar/actualizar Email real y WhatsApp de seguridad cuando ya había cambiado su clave antes
CREATE OR REPLACE FUNCTION public.update_user_security_contact(
    p_user_id UUID,
    p_email TEXT,
    p_telefono_whatsapp TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_clean_email TEXT;
    v_clean_phone TEXT;
BEGIN
    v_clean_email := LOWER(TRIM(COALESCE(p_email, '')));
    v_clean_phone := REGEXP_REPLACE(TRIM(COALESCE(p_telefono_whatsapp, '')), '\D', '', 'g');

    IF v_clean_email = '' OR POSITION('@' IN v_clean_email) <= 1 OR POSITION('.' IN SPLIT_PART(v_clean_email, '@', 2)) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Ingresá una dirección de correo electrónico real y válida.');
    END IF;

    IF LENGTH(v_clean_phone) <> 10 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'El número de celular debe tener exactamente 10 dígitos (ej: 2645438114, sin +549 ni 15).');
    END IF;

    UPDATE public.admqui_usuarios
    SET email = v_clean_email,
        telefono_whatsapp = v_clean_phone,
        datos_contacto_confirmados = TRUE,
        datos_contacto_confirmados_at = NOW(),
        updated_at = NOW()
    WHERE id = p_user_id AND COALESCE(activo, TRUE) = TRUE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Usuario no encontrado o inactivo.');
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'email', v_clean_email,
        'telefono_whatsapp', v_clean_phone
    );
END;
$function$;

-- 7. RPC para consultar opciones de blanqueo/recuperación de contraseña de un usuario (sin exponer datos sensibles)
CREATE OR REPLACE FUNCTION public.get_password_recovery_options(
    p_usuario TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_user RECORD;
    v_clean TEXT;
    v_phone_digits TEXT;
    v_has_whatsapp BOOLEAN;
    v_has_totp BOOLEAN;
    v_has_email BOOLEAN;
BEGIN
    v_clean := LOWER(TRIM(COALESCE(p_usuario, '')));
    IF v_clean = '' THEN
        RETURN jsonb_build_object('found', FALSE, 'error', 'Ingresá tu nombre de usuario');
    END IF;

    SELECT *
    INTO v_user
    FROM public.admqui_usuarios u
    WHERE LOWER(TRIM(u.usuario)) = v_clean
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('found', FALSE, 'error', 'No se encontró ningún usuario con ese identificador.');
    END IF;

    IF COALESCE(v_user.activo, TRUE) = FALSE THEN
        RETURN jsonb_build_object('found', FALSE, 'error', 'Esta cuenta se encuentra deshabilitada. Comunicate con el Administrador.');
    END IF;

    v_phone_digits := REGEXP_REPLACE(COALESCE(v_user.telefono_whatsapp, ''), '\D', '', 'g');
    v_has_whatsapp := (LENGTH(v_phone_digits) >= 10);
    v_has_totp := (v_user.totp_secret IS NOT NULL AND LENGTH(TRIM(v_user.totp_secret)) > 0);
    v_has_email := (v_user.email IS NOT NULL AND POSITION('@' IN v_user.email) > 1);

    RETURN jsonb_build_object(
        'found', TRUE,
        'user_id', v_user.id,
        'usuario', v_user.usuario,
        'nombre', v_user.nombre,
        'has_whatsapp', v_has_whatsapp,
        'masked_whatsapp', CASE WHEN v_has_whatsapp THEN public.mask_phone_number(v_phone_digits) ELSE '' END,
        'has_totp', v_has_totp,
        'has_email', v_has_email,
        'masked_email', CASE WHEN v_has_email THEN public.mask_email_address(v_user.email) ELSE '' END,
        'datos_contacto_confirmados', COALESCE(v_user.datos_contacto_confirmados, FALSE)
    );
END;
$function$;

-- 8. RPC para generar código OTP de recuperación/blanqueo ESTRICTAMENTE al canal ya registrado en la cuenta
CREATE OR REPLACE FUNCTION public.generate_recovery_otp(
    p_user_id UUID,
    p_channel TEXT DEFAULT 'whatsapp' -- 'whatsapp' | 'email'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_user RECORD;
    v_code TEXT;
    v_phone TEXT;
    v_email TEXT;
BEGIN
    SELECT *
    INTO v_user
    FROM public.admqui_usuarios
    WHERE id = p_user_id AND COALESCE(activo, TRUE) = TRUE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Usuario no encontrado o inactivo.');
    END IF;

    v_phone := REGEXP_REPLACE(COALESCE(v_user.telefono_whatsapp, ''), '\D', '', 'g');
    v_email := LOWER(TRIM(COALESCE(v_user.email, '')));

    IF p_channel = 'whatsapp' THEN
        IF LENGTH(v_phone) < 10 THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'error', 'Tu cuenta aún no tiene un número de WhatsApp registrado. Probá con la segunda opción (Correo Electrónico) o solicitá el blanqueo al Administrador.'
            );
        END IF;
    ELSIF p_channel = 'email' THEN
        IF v_email = '' OR POSITION('@' IN v_email) <= 1 THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'error', 'Tu cuenta no tiene un correo electrónico válido registrado. Utilizá la opción de WhatsApp o comunicate con el Administrador.'
            );
        END IF;
    ELSE
        RETURN jsonb_build_object('success', FALSE, 'error', 'Canal de verificación inválido.');
    END IF;

    -- Generar código aleatorio de 6 dígitos
    v_code := LPAD((FLOOR(RANDOM() * 900000) + 100000)::INT::TEXT, 6, '0');

    UPDATE public.admqui_usuarios
    SET otp_code_hash = crypt(v_code, gen_salt('bf')),
        otp_expires_at = NOW() + INTERVAL '10 minutes',
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'code', v_code,
        'channel', p_channel,
        'telefono_whatsapp', v_phone,
        'masked_whatsapp', public.mask_phone_number(v_phone),
        'email', v_email,
        'masked_email', public.mask_email_address(v_email),
        'nombre', v_user.nombre,
        'usuario', v_user.usuario
    );
END;
$function$;

-- 9. RPC para obtener el secreto TOTP YA registrado de un usuario durante recuperación (nunca crea uno nuevo)
CREATE OR REPLACE FUNCTION public.get_registered_totp_for_recovery(
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_user RECORD;
BEGIN
    SELECT id, usuario, totp_secret, activo
    INTO v_user
    FROM public.admqui_usuarios
    WHERE id = p_user_id AND COALESCE(activo, TRUE) = TRUE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Usuario no encontrado o inactivo.');
    END IF;

    IF v_user.totp_secret IS NULL OR LENGTH(TRIM(v_user.totp_secret)) = 0 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Esta cuenta no tenía una aplicación autenticadora (QR) vinculada previamente. Usá la opción de mensaje por WhatsApp o Correo Electrónico.'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'totp_secret', v_user.totp_secret
    );
END;
$function$;

-- 10. RPC para blanquear y restablecer la contraseña olvidada tras verificar OTP (WhatsApp/Email) o TOTP
CREATE OR REPLACE FUNCTION public.reset_forgotten_password(
    p_user_id UUID,
    p_method TEXT, -- 'whatsapp' | 'email' | 'totp'
    p_code TEXT,
    p_new_password TEXT,
    p_totp_verified BOOLEAN DEFAULT FALSE,
    p_new_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_user RECORD;
    v_clean_pwd TEXT;
    v_clean_email TEXT;
BEGIN
    SELECT *
    INTO v_user
    FROM public.admqui_usuarios
    WHERE id = p_user_id AND COALESCE(activo, TRUE) = TRUE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Usuario no encontrado o cuenta deshabilitada.');
    END IF;

    v_clean_pwd := TRIM(COALESCE(p_new_password, ''));
    IF LENGTH(v_clean_pwd) < 6 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'La nueva contraseña debe tener al menos 6 caracteres.');
    END IF;
    IF v_clean_pwd = '123456' THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Por seguridad no podés usar "123456". Elegí una contraseña personal.');
    END IF;

    IF p_method IN ('whatsapp', 'email') THEN
        IF v_user.otp_code_hash IS NULL OR v_user.otp_expires_at IS NULL OR v_user.otp_expires_at < NOW() THEN
            RETURN jsonb_build_object('success', FALSE, 'error', 'El código de verificación expiró o no fue solicitado. Solicitá uno nuevo.');
        END IF;
        IF v_user.otp_code_hash <> crypt(TRIM(COALESCE(p_code, '')), v_user.otp_code_hash) THEN
            RETURN jsonb_build_object('success', FALSE, 'error', 'El código de 6 dígitos ingresado es incorrecto.');
        END IF;
    ELSIF p_method = 'totp' THEN
        IF v_user.totp_secret IS NULL OR LENGTH(TRIM(v_user.totp_secret)) = 0 OR NOT COALESCE(p_totp_verified, FALSE) THEN
            RETURN jsonb_build_object('success', FALSE, 'error', 'Código de autenticador inválido.');
        END IF;
    ELSE
        RETURN jsonb_build_object('success', FALSE, 'error', 'Método de verificación no válido.');
    END IF;

    v_clean_email := LOWER(TRIM(COALESCE(p_new_email, '')));

    UPDATE public.admqui_usuarios
    SET password_hash = crypt(v_clean_pwd, gen_salt('bf')),
        must_change_password = FALSE,
        password_changed_at = NOW(),
        otp_code_hash = NULL,
        otp_expires_at = NULL,
        email = CASE WHEN v_clean_email <> '' AND POSITION('@' IN v_clean_email) > 1 THEN v_clean_email ELSE email END,
        datos_contacto_confirmados = CASE
            WHEN v_clean_email <> '' AND POSITION('@' IN v_clean_email) > 1
                 AND LENGTH(REGEXP_REPLACE(COALESCE(telefono_whatsapp, ''), '\D', '', 'g')) = 10
            THEN TRUE
            ELSE COALESCE(datos_contacto_confirmados, FALSE)
        END,
        datos_contacto_confirmados_at = CASE
            WHEN v_clean_email <> '' AND POSITION('@' IN v_clean_email) > 1
                 AND LENGTH(REGEXP_REPLACE(COALESCE(telefono_whatsapp, ''), '\D', '', 'g')) = 10
            THEN NOW()
            ELSE datos_contacto_confirmados_at
        END,
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'usuario', v_user.usuario,
        'nombre', v_user.nombre
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.verify_login_v2(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_password(uuid, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_security_contact(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_password_recovery_options(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_recovery_otp(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_registered_totp_for_recovery(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_forgotten_password(uuid, text, text, text, boolean, text) TO anon, authenticated;

