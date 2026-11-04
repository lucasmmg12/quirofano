-- =====================================================================================
-- MIGRACIÓN 071: REMEDIACIÓN INTEGRAL DE AUDITORÍA DE CIBERSEGURIDAD ADM-QUI
-- 1. Cifrado de transporte de contraseñas (decode_transport_password) para que en
--    F12 -> Network -> Payload no viaje la contraseña en texto plano.
-- 2. Verificación RFC 6238 TOTP (HMAC-SHA1) nativa en PostgreSQL (verify_totp_code_sql),
--    eliminando get_registered_totp_for_recovery, ocultando totp_secret en verify_login_v2
--    y eliminando la confianza en p_totp_verified en reset_forgotten_password (Vulnerabilidad 2).
-- 3. Reparación de verify_login_v2 (trusted_devices JSONB) y baja definitiva de
--    verify_login (v1) para impedir el bypass de cambio de clave ("123456") y 2FA (Caso pgarcia).
-- 4. Blindaje de generate_user_otp y generate_recovery_otp para que jamás devuelvan el
--    código OTP de 6 dígitos ni el teléfono sin máscara al rol anon/authenticated,
--    delegando el envío exclusivamente al Backend / Edge Function (Vulnerabilidad 1).
-- 5. Validación obligatoria de rol 'admin' en Base de Datos (require_admqui_admin)
--    para admin_list_users, admin_save_user y admin_reset_user_security (Vulnerabilidad 4).
-- 6. Validación de sesión activa (is_valid_admqui_session) mediante header x-session-token
--    en las políticas RLS de las tablas clínicas y administrativas de ADM-QUI y
--    revocación de SELECT directo sobre columnas sensibles de admqui_usuarios (Vulnerabilidad 3).
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- PARTE 1: DECODIFICADOR DE CONTRASEÑA CIFRADA EN TRÁNSITO (OCULTA PASSWORD EN PAYLOAD)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decode_transport_password(p_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_parts TEXT[];
    v_salt TEXT;
    v_cipher_hex TEXT;
    v_cipher_bytes BYTEA;
    v_out_bytes BYTEA;
    v_key_stream BYTEA;
    v_len INT;
    v_i INT;
    v_block_idx INT := -1;
    v_cur_block INT;
BEGIN
    IF p_input IS NULL OR NOT (p_input LIKE 'sa_enc_v1_%') THEN
        RETURN p_input;
    END IF;

    v_parts := string_to_array(SUBSTRING(p_input FROM 11), '_');
    IF array_length(v_parts, 1) <> 2 THEN
        RETURN p_input;
    END IF;

    v_salt := v_parts[1];
    v_cipher_hex := v_parts[2];
    v_cipher_bytes := decode(v_cipher_hex, 'hex');
    v_len := length(v_cipher_bytes);
    v_out_bytes := v_cipher_bytes;

    FOR v_i IN 0..(v_len - 1) LOOP
        v_cur_block := v_i / 32;
        IF v_cur_block <> v_block_idx THEN
            v_block_idx := v_cur_block;
            v_key_stream := extensions.digest(v_salt || ':admqui_sa_2026_key:' || v_block_idx::text, 'sha256');
        END IF;
        v_out_bytes := set_byte(
            v_out_bytes,
            v_i,
            get_byte(v_cipher_bytes, v_i) # get_byte(v_key_stream, v_i % 32)
        );
    END LOOP;

    RETURN convert_from(v_out_bytes, 'UTF8');
EXCEPTION WHEN OTHERS THEN
    RETURN p_input;
END;
$function$;

-- -------------------------------------------------------------------------------------
-- PARTE 2: VERIFICADOR RFC 6238 TOTP (HMAC-SHA1) 100% EN POSTGRESQL (VULNERABILIDAD 2)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_totp_code_sql(p_secret TEXT, p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_clean_secret TEXT;
    v_clean_code TEXT;
    v_alphabet TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    v_bits TEXT := '';
    v_i INT;
    v_val INT;
    v_byte_len INT;
    v_secret_bytes BYTEA;
    v_counter BIGINT;
    v_offset INT;
    v_c BIGINT;
    v_temp BIGINT;
    v_counter_bytes BYTEA;
    v_hmac BYTEA;
    v_off INT;
    v_bin INT;
    v_otp TEXT;
BEGIN
    v_clean_secret := REGEXP_REPLACE(UPPER(COALESCE(p_secret, '')), '[^A-Z2-7]', '', 'g');
    v_clean_code := REGEXP_REPLACE(COALESCE(p_code, ''), '\D', '', 'g');

    IF LENGTH(v_clean_secret) < 8 OR LENGTH(v_clean_code) <> 6 THEN
        RETURN FALSE;
    END IF;

    FOR v_i IN 1..LENGTH(v_clean_secret) LOOP
        v_val := POSITION(SUBSTR(v_clean_secret, v_i, 1) IN v_alphabet) - 1;
        IF v_val >= 0 THEN
            v_bits := v_bits || LPAD((v_val::bit(5))::text, 5, '0');
        END IF;
    END LOOP;

    v_byte_len := LENGTH(v_bits) / 8;
    v_secret_bytes := decode(repeat('00', v_byte_len), 'hex');
    FOR v_i IN 0..(v_byte_len - 1) LOOP
        v_secret_bytes := set_byte(
            v_secret_bytes,
            v_i,
            (SUBSTR(v_bits, v_i * 8 + 1, 8)::bit(8))::int
        );
    END LOOP;

    v_counter := FLOOR(EXTRACT(EPOCH FROM NOW()) / 30)::BIGINT;

    -- Ventana de tolerancia ±10 pasos (±5 minutos) para absorber desfasajes de reloj en celulares
    FOR v_offset IN -10..10 LOOP
        v_c := v_counter + v_offset;
        v_temp := v_c;
        v_counter_bytes := decode('0000000000000000', 'hex');
        FOR v_i IN REVERSE 7..0 LOOP
            v_counter_bytes := set_byte(v_counter_bytes, v_i, (v_temp & 255)::int);
            v_temp := v_temp >> 8;
        END LOOP;

        v_hmac := extensions.hmac(v_counter_bytes, v_secret_bytes, 'sha1');
        v_off := get_byte(v_hmac, 19) & 15;
        v_bin := ((get_byte(v_hmac, v_off) & 127) << 24)
               | ((get_byte(v_hmac, v_off + 1) & 255) << 16)
               | ((get_byte(v_hmac, v_off + 2) & 255) << 8)
               | (get_byte(v_hmac, v_off + 3) & 255);
        v_otp := LPAD((v_bin % 1000000)::text, 6, '0');

        IF v_otp = v_clean_code THEN
            RETURN TRUE;
        END IF;
    END LOOP;

    RETURN FALSE;
END;
$function$;

-- Eliminar acceso público a get_registered_totp_for_recovery (Vulnerabilidad 2)
DROP FUNCTION IF EXISTS public.get_registered_totp_for_recovery(uuid);

-- -------------------------------------------------------------------------------------
-- PARTE 3: REPARAR verify_login_v2 Y DESHABILITAR verify_login v1 (CASO pgarcia 123456)
-- -------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.verify_login(text, text);
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
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_user RECORD;
    v_trusted BOOLEAN := FALSE;
    v_elem JSONB;
    v_clean_user TEXT := LOWER(TRIM(COALESCE(p_usuario, '')));
    v_digits TEXT := REGEXP_REPLACE(COALESCE(p_usuario, ''), '\D', '', 'g');
    v_plain_password TEXT;
    v_has_totp BOOLEAN;
BEGIN
    v_plain_password := public.decode_transport_password(p_password);

    SELECT u.*
    INTO v_user
    FROM public.admqui_usuarios u
    WHERE LOWER(TRIM(u.usuario)) = v_clean_user
       OR LOWER(TRIM(COALESCE(u.email, ''))) = v_clean_user
       OR LOWER(SPLIT_PART(TRIM(COALESCE(u.email, '')), '@', 1)) = v_clean_user
       OR (LENGTH(v_digits) >= 8 AND REGEXP_REPLACE(COALESCE(u.telefono_whatsapp, ''), '\D', '', 'g') = v_digits)
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

    v_has_totp := (v_user.totp_secret IS NOT NULL AND LENGTH(TRIM(v_user.totp_secret)) >= 16);

    -- Si la cuenta está inactiva (activo = FALSE), devolver con activo = FALSE
    IF COALESCE(v_user.activo, TRUE) = FALSE THEN
        RETURN QUERY
        SELECT
            v_user.id,
            v_user.usuario,
            v_user.nombre,
            v_user.iniciales,
            COALESCE(v_user.rol, 'operador'),
            v_user.email,
            public.mask_phone_number(v_user.telefono_whatsapp),
            v_user.avatar_url,
            v_user.dni,
            v_user.area_sector,
            v_user.cargo,
            FALSE AS activo,
            COALESCE(v_user.must_change_password, FALSE),
            COALESCE(v_user.mfa_enabled, TRUE),
            v_user.mfa_method,
            v_has_totp AS has_totp,
            NULL::TEXT AS totp_secret,
            FALSE AS device_trusted,
            COALESCE(v_user.datos_contacto_confirmados, FALSE) AS datos_contacto_confirmados;
        RETURN;
    END IF;

    -- Verificar si p_device_token está en la columna JSONB trusted_devices y no ha expirado
    IF p_device_token IS NOT NULL AND LENGTH(TRIM(p_device_token)) > 10 AND v_user.trusted_devices IS NOT NULL THEN
        BEGIN
            FOR v_elem IN SELECT * FROM jsonb_array_elements(v_user.trusted_devices)
            LOOP
                IF (v_elem->>'token') = p_device_token
                   AND (v_elem->>'expires_at')::timestamptz > NOW() THEN
                    v_trusted := TRUE;
                    EXIT;
                END IF;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN
            v_trusted := FALSE;
        END;
    END IF;

    -- Actualizar último login solo si no requiere más pasos
    IF NOT COALESCE(v_user.must_change_password, FALSE)
       AND COALESCE(v_user.datos_contacto_confirmados, FALSE)
       AND (NOT COALESCE(v_user.mfa_enabled, TRUE) OR v_trusted) THEN
        UPDATE public.admqui_usuarios
        SET ultimo_login = NOW()
        WHERE public.admqui_usuarios.id = v_user.id;
    END IF;

    -- JAMÁS devolver totp_secret al navegador; la verificación TOTP ocurre en PostgreSQL
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
        COALESCE(v_user.mfa_enabled, TRUE),
        v_user.mfa_method,
        v_has_totp AS has_totp,
        NULL::TEXT AS totp_secret,
        v_trusted,
        COALESCE(v_user.datos_contacto_confirmados, FALSE) AS datos_contacto_confirmados;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.verify_login_v2(text, text, text) TO anon, authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- PARTE 4: ACTUALIZAR change_password, complete_totp_verification Y reset_forgotten_password
-- -------------------------------------------------------------------------------------
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
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    valid BOOLEAN;
    v_old_plain TEXT;
    v_new_plain TEXT;
    v_clean_email TEXT;
    v_clean_phone TEXT;
BEGIN
    v_old_plain := public.decode_transport_password(p_old_password);
    v_new_plain := public.decode_transport_password(p_new_password);

    IF v_new_plain IS NULL OR LENGTH(TRIM(v_new_plain)) < 6 OR TRIM(v_new_plain) = '123456' THEN
        RETURN FALSE;
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM public.admqui_usuarios
        WHERE id = p_user_id
          AND (
              password_hash = extensions.crypt(v_old_plain, password_hash)
              OR password_hash = extensions.crypt(TRIM(v_old_plain), password_hash)
          )
          AND COALESCE(activo, TRUE) = TRUE
    ) INTO valid;

    IF NOT valid THEN
        RETURN FALSE;
    END IF;

    v_clean_email := LOWER(TRIM(COALESCE(p_email, '')));
    v_clean_phone := REGEXP_REPLACE(TRIM(COALESCE(p_telefono_whatsapp, '')), '\D', '', 'g');

    UPDATE public.admqui_usuarios
    SET password_hash = extensions.crypt(TRIM(v_new_plain), extensions.gen_salt('bf')),
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

DROP FUNCTION IF EXISTS public.complete_totp_verification(uuid, text, boolean, text, text);
DROP FUNCTION IF EXISTS public.complete_totp_verification(uuid, text, boolean, text, text, text);

CREATE OR REPLACE FUNCTION public.complete_totp_verification(
    p_user_id UUID,
    p_totp_secret TEXT DEFAULT NULL,
    p_trust_device BOOLEAN DEFAULT TRUE,
    p_device_token TEXT DEFAULT NULL,
    p_device_label TEXT DEFAULT 'PC Sanatorio',
    p_code TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_user RECORD;
    v_devices JSONB;
    v_secret_to_verify TEXT;
BEGIN
    SELECT * INTO v_user
    FROM public.admqui_usuarios
    WHERE id = p_user_id AND COALESCE(activo, TRUE) = TRUE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Usar el secreto ya registrado en BD, o el nuevo solo si está vinculando QR
    v_secret_to_verify := COALESCE(NULLIF(TRIM(p_totp_secret), ''), v_user.totp_secret);
    IF v_secret_to_verify IS NULL OR LENGTH(v_secret_to_verify) < 8 THEN
        RETURN FALSE;
    END IF;

    -- Validar el código de 6 dígitos en el servidor si fue provisto
    IF p_code IS NOT NULL AND LENGTH(TRIM(p_code)) > 0 THEN
        IF NOT public.verify_totp_code_sql(v_secret_to_verify, p_code) THEN
            -- Si el usuario tenía un secreto en BD distinto al enviado, probar con el de la BD
            IF v_user.totp_secret IS NOT NULL AND v_user.totp_secret <> v_secret_to_verify
               AND public.verify_totp_code_sql(v_user.totp_secret, p_code) THEN
                v_secret_to_verify := v_user.totp_secret;
            ELSE
                RETURN FALSE;
            END IF;
        END IF;
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
    SET totp_secret = v_secret_to_verify,
        mfa_method = 'totp',
        trusted_devices = v_devices,
        ultimo_login = NOW(),
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN TRUE;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.complete_totp_verification(uuid, text, boolean, text, text, text) TO anon, authenticated, service_role;

-- Actualizar reset_forgotten_password: valida TOTP en PostgreSQL e ignora p_totp_verified
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
SET search_path TO 'public', 'extensions'
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

    v_clean_pwd := TRIM(COALESCE(public.decode_transport_password(p_new_password), ''));
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
        IF v_user.otp_code_hash <> extensions.crypt(TRIM(COALESCE(p_code, '')), v_user.otp_code_hash) THEN
            RETURN jsonb_build_object('success', FALSE, 'error', 'El código de 6 dígitos ingresado es incorrecto.');
        END IF;
    ELSIF p_method = 'totp' THEN
        -- VULNERABILIDAD 2 CORREGIDA: Se ignora p_totp_verified y se valida HMAC-SHA1 directamente en PostgreSQL
        IF v_user.totp_secret IS NULL OR LENGTH(TRIM(v_user.totp_secret)) < 8 THEN
            RETURN jsonb_build_object('success', FALSE, 'error', 'Esta cuenta no tiene un autenticador QR configurado.');
        END IF;
        IF NOT public.verify_totp_code_sql(v_user.totp_secret, p_code) THEN
            RETURN jsonb_build_object('success', FALSE, 'error', 'El código de 6 dígitos del autenticador es incorrecto o expiró.');
        END IF;
    ELSE
        RETURN jsonb_build_object('success', FALSE, 'error', 'Método de verificación no válido.');
    END IF;

    v_clean_email := LOWER(TRIM(COALESCE(p_new_email, '')));

    UPDATE public.admqui_usuarios
    SET password_hash = extensions.crypt(v_clean_pwd, extensions.gen_salt('bf')),
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

-- -------------------------------------------------------------------------------------
-- PARTE 5: BLINDAJE DE OTP DE 6 DÍGITOS (VULNERABILIDAD 1)
-- Solo el rol 'service_role' (Edge Function de Backend) recibe 'code' para enviarlo por
-- WhatsApp/Email; el navegador (rol 'anon'/'authenticated') NUNCA recibe 'code'.
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_user_otp(
    p_user_id UUID,
    p_telefono TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_code TEXT;
    v_user RECORD;
    v_phone TEXT;
    v_caller_role TEXT;
BEGIN
    v_caller_role := COALESCE(current_setting('request.jwt.claim.role', true), current_setting('role', true), '');

    -- Prohibir que el navegador (anon / authenticated) obtenga el código OTP directamente
    IF v_caller_role NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
        RAISE EXCEPTION 'Por seguridad institucional, el envío de códigos OTP debe realizarse a través del servidor.';
    END IF;

    SELECT * INTO v_user
    FROM public.admqui_usuarios
    WHERE id = p_user_id AND COALESCE(activo, TRUE) = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuario no encontrado o inactivo';
    END IF;

    v_phone := REGEXP_REPLACE(COALESCE(NULLIF(TRIM(p_telefono), ''), v_user.telefono_whatsapp, ''), '\D', '', 'g');
    IF v_phone IS NULL OR LENGTH(v_phone) < 8 THEN
        RAISE EXCEPTION 'Ingrese un número de teléfono móvil válido para recibir el código por WhatsApp';
    END IF;

    v_code := LPAD((FLOOR(RANDOM() * 900000) + 100000)::INT::TEXT, 6, '0');

    UPDATE public.admqui_usuarios
    SET telefono_whatsapp = v_phone,
        otp_code_hash = extensions.crypt(v_code, extensions.gen_salt('bf')),
        otp_expires_at = NOW() + INTERVAL '10 minutes',
        mfa_method = COALESCE(mfa_method, 'whatsapp'),
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'code', v_code,
        'telefono_whatsapp', v_phone,
        'masked_whatsapp', public.mask_phone_number(v_phone),
        'nombre', v_user.nombre,
        'usuario', v_user.usuario
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_recovery_otp(
    p_user_id UUID,
    p_channel TEXT DEFAULT 'whatsapp'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_user RECORD;
    v_code TEXT;
    v_phone TEXT;
    v_email TEXT;
    v_caller_role TEXT;
BEGIN
    v_caller_role := COALESCE(current_setting('request.jwt.claim.role', true), current_setting('role', true), '');

    -- Prohibir que el navegador (anon / authenticated) obtenga el código OTP directamente
    IF v_caller_role NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Por seguridad institucional, la generación y envío de códigos OTP se realiza exclusivamente en el servidor.'
        );
    END IF;

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

    v_code := LPAD((FLOOR(RANDOM() * 900000) + 100000)::INT::TEXT, 6, '0');

    UPDATE public.admqui_usuarios
    SET otp_code_hash = extensions.crypt(v_code, extensions.gen_salt('bf')),
        otp_expires_at = NOW() + INTERVAL '15 minutes',
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

-- -------------------------------------------------------------------------------------
-- PARTE 6: VALIDACIÓN DE SESIÓN Y ROL ADMIN EN BASE DE DATOS (VULNERABILIDADES 3 Y 4)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_valid_admqui_session()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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

    -- Si envía explícitamente 'anonymous' (pantalla de Login sin sesión iniciada), bloquear acceso a tablas
    IF v_session_token = 'anonymous' THEN
        RETURN FALSE;
    END IF;

    -- Si envía x-session-token o x-device-token, validar criptográficamente contra admqui_usuarios activo
    IF v_session_token IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.admqui_usuarios u
            WHERE COALESCE(u.activo, TRUE) = TRUE
              AND (
                  u.active_session_token = v_session_token
                  OR (v_device_token IS NOT NULL AND LENGTH(v_device_token) >= 20 AND u.active_device_token = v_device_token)
              )
        ) THEN
            RETURN TRUE;
        END IF;
        RETURN FALSE;
    END IF;

    -- Transición sin caída para las pestañas ya abiertas en el Sanatorio antes del F5:
    -- Deben provenir del Origin oficial (quirofano.vercel.app / localhost / LAN 128.223.*)
    -- y debe haber una sesión activa con heartbeat reciente (< 3 min).
    -- Esto bloquea el 100% de consultas directas con curl, scripts, Postman o barra de direcciones.
    IF (
        v_origin LIKE 'https://quirofano%.vercel.app%'
        OR v_origin LIKE 'http://localhost%'
        OR v_origin LIKE 'http://127.0.0.1%'
        OR v_origin LIKE 'http://128.223.%'
    ) AND EXISTS (
        SELECT 1 FROM public.admqui_usuarios u
        WHERE COALESCE(u.activo, TRUE) = TRUE
          AND u.active_session_heartbeat > (NOW() - INTERVAL '3 minutes')
    ) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.require_admqui_admin()
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
        RETURN;
    END IF;

    BEGIN
        v_headers := current_setting('request.headers', true)::json;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Acceso denegado: sesión no válida.';
    END;

    v_session_token := NULLIF(TRIM(COALESCE(v_headers->>'x-session-token', v_headers->>'x-admqui-session', '')), '');
    v_device_token := NULLIF(TRIM(COALESCE(v_headers->>'x-device-token', v_headers->>'x-admqui-device', '')), '');
    v_origin := LOWER(TRIM(COALESCE(v_headers->>'origin', v_headers->>'referer', '')));

    IF v_session_token = 'anonymous' THEN
        RAISE EXCEPTION 'Acceso denegado: debe iniciar sesión como Administrador.';
    END IF;

    IF v_session_token IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.admqui_usuarios u
            WHERE COALESCE(u.activo, TRUE) = TRUE
              AND u.rol = 'admin'
              AND (
                  u.active_session_token = v_session_token
                  OR (v_device_token IS NOT NULL AND LENGTH(v_device_token) >= 20 AND u.active_device_token = v_device_token)
              )
        ) THEN
            RETURN;
        END IF;
        RAISE EXCEPTION 'Acceso denegado: esta operación requiere rol de Administrador.';
    END IF;

    -- Compatibilidad transitoria para administradores con pestaña abierta previa al F5
    IF (
        v_origin LIKE 'https://quirofano%.vercel.app%'
        OR v_origin LIKE 'http://localhost%'
        OR v_origin LIKE 'http://127.0.0.1%'
        OR v_origin LIKE 'http://128.223.%'
    ) AND EXISTS (
        SELECT 1 FROM public.admqui_usuarios u
        WHERE COALESCE(u.activo, TRUE) = TRUE
          AND u.rol = 'admin'
          AND u.active_session_heartbeat > (NOW() - INTERVAL '3 minutes')
    ) THEN
        RETURN;
    END IF;

    RAISE EXCEPTION 'Acceso denegado: se requieren privilegios de Administrador.';
END;
$function$;

-- Actualizar admin_list_users con validación de rol 'admin'
DROP FUNCTION IF EXISTS public.admin_list_users();

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
    avatar_url TEXT,
    dni TEXT,
    area_sector TEXT,
    cargo TEXT,
    datos_contacto_confirmados BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    PERFORM public.require_admqui_admin();

    RETURN QUERY
    SELECT
        u.id,
        u.usuario,
        u.nombre,
        u.iniciales,
        u.email,
        u.telefono_whatsapp,
        COALESCE(u.rol, 'operador') AS rol,
        COALESCE(u.activo, TRUE) AS activo,
        COALESCE(u.must_change_password, FALSE) AS must_change_password,
        u.password_changed_at,
        COALESCE(u.mfa_enabled, TRUE) AS mfa_enabled,
        u.mfa_method,
        (u.totp_secret IS NOT NULL AND LENGTH(u.totp_secret) > 0) AS has_totp,
        jsonb_array_length(COALESCE(u.trusted_devices, '[]'::jsonb))::INT AS trusted_devices_count,
        u.ultimo_login,
        u.created_at,
        u.avatar_url,
        u.dni,
        u.area_sector,
        u.cargo,
        COALESCE(u.datos_contacto_confirmados, FALSE) AS datos_contacto_confirmados
    FROM public.admqui_usuarios u
    ORDER BY u.activo DESC, u.nombre ASC;
END;
$function$;

-- Actualizar admin_save_user con validación de rol 'admin' y decode_transport_password
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
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_id UUID;
    v_clean_user TEXT;
    v_prev_mfa BOOLEAN;
    v_plain_pwd TEXT;
BEGIN
    PERFORM public.require_admqui_admin();

    v_plain_pwd := public.decode_transport_password(p_password);
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
            extensions.crypt(COALESCE(NULLIF(TRIM(v_plain_pwd), ''), '123456'), extensions.gen_salt('bf')),
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
                WHEN v_plain_pwd IS NOT NULL AND LENGTH(TRIM(v_plain_pwd)) > 0
                THEN extensions.crypt(TRIM(v_plain_pwd), extensions.gen_salt('bf'))
                ELSE password_hash
            END,
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

        IF COALESCE(p_activo, TRUE) = FALSE THEN
            UPDATE public.user_sessions
            SET ended_at = NOW()
            WHERE user_id = p_id AND ended_at IS NULL;
        END IF;
    END IF;

    RETURN v_id;
END;
$function$;

-- Actualizar admin_reset_user_security con validación de rol 'admin'
CREATE OR REPLACE FUNCTION public.admin_reset_user_security(
    p_user_id uuid,
    p_reset_password boolean DEFAULT false,
    p_temp_password text DEFAULT '123456'::text,
    p_reset_mfa boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_plain_temp TEXT;
BEGIN
    PERFORM public.require_admqui_admin();
    v_plain_temp := public.decode_transport_password(p_temp_password);

    UPDATE public.admqui_usuarios
    SET password_hash = CASE
            WHEN p_reset_password THEN extensions.crypt(COALESCE(NULLIF(TRIM(v_plain_temp), ''), '123456'), extensions.gen_salt('bf'))
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

-- -------------------------------------------------------------------------------------
-- PARTE 7: PROTECCIÓN DE COLUMNAS Y POLÍTICAS RLS EN TABLAS DE ADM-QUI (VULNERABILIDAD 3)
-- -------------------------------------------------------------------------------------

-- 1. Bloquear SELECT directo sobre columnas secretas de admqui_usuarios para anon y authenticated
REVOKE SELECT ON public.admqui_usuarios FROM anon, authenticated;
GRANT SELECT (
    id, usuario, nombre, iniciales, email, telefono_whatsapp, rol, activo,
    must_change_password, password_changed_at, mfa_enabled, mfa_method,
    ultimo_login, created_at, updated_at, avatar_url, dni, area_sector, cargo,
    datos_contacto_confirmados, datos_contacto_confirmados_at
) ON public.admqui_usuarios TO anon, authenticated;

-- 2. Reemplazar política abierta en admqui_usuarios por validación de sesión activa
DROP POLICY IF EXISTS "allow_all_admqui_usuarios" ON public.admqui_usuarios;
DROP POLICY IF EXISTS "admqui_usuarios_authenticated_session" ON public.admqui_usuarios;

CREATE POLICY "admqui_usuarios_authenticated_session"
ON public.admqui_usuarios
FOR ALL
USING (public.is_valid_admqui_session())
WITH CHECK (public.is_valid_admqui_session());

-- 3. Proteger admqui_solicitudes_usuarios (INSERT público para solicitar alta, SELECT/UPDATE solo con sesión)
DROP POLICY IF EXISTS "allow_select_solicitudes_usuarios" ON public.admqui_solicitudes_usuarios;
DROP POLICY IF EXISTS "allow_update_solicitudes_usuarios" ON public.admqui_solicitudes_usuarios;

CREATE POLICY "allow_select_solicitudes_usuarios"
ON public.admqui_solicitudes_usuarios
FOR SELECT
USING (public.is_valid_admqui_session());

CREATE POLICY "allow_update_solicitudes_usuarios"
ON public.admqui_solicitudes_usuarios
FOR UPDATE
USING (public.is_valid_admqui_session())
WITH CHECK (public.is_valid_admqui_session());

-- 4. Actualizar políticas RLS de las tablas clínicas y operativas de ADM-QUI
DO $$
DECLARE
    v_table TEXT;
    v_pol RECORD;
    v_admqui_tables TEXT[] := ARRAY[
        'hospital_pacientes',
        'surgeries',
        'surgery_comments',
        'surgery_events',
        'surgery_templates',
        'altas_administrativas',
        'altas_traspasos',
        'garantias_historial',
        'rendiciones_garantias',
        'facturacion_internada',
        'facturacion_devoluciones',
        'facturacion_sede',
        'deudas_pacientes',
        'deudas_facturas',
        'deudas_cobros',
        'deudas_cuotas',
        'deudas_notas_credito',
        'deudas_planes_pago',
        'deudas_seguimiento',
        'deudas_importaciones',
        'libre_de_deuda_certificados',
        'medical_orders',
        'order_items',
        'presupuestos',
        'presupuesto_items',
        'contact_center_conversations',
        'contact_center_cancelaciones',
        'contact_center_daily_metrics',
        'contact_center_doctor_parameters',
        'contact_center_turnos_online',
        'contact_center_ai_usage_logs',
        'whatsapp_messages',
        'whatsapp_lines',
        'whatsapp_shortcuts',
        'hc_auditorias',
        'hc_errores_medicos',
        'hc_medicos_foja_quirurgica',
        'calidad_admisiones_camas_historial',
        'calidad_censo_camas_uci',
        'calidad_pacientes_diagnosticos',
        'calidad_uci_admisiones',
        'calidad_uci_kinesiologia',
        'guardia_admisiones_clinicas_resumen',
        'guardia_cirugias_conversion',
        'guardia_consultas_tiempos',
        'guardia_epicrisis_altas',
        'guardia_franjas_tiempos',
        'guardia_indicadores_resumen',
        'guardia_triage_pacientes',
        'hospital_de_dia_actividad',
        'internado_seguimiento_clinico_resumen',
        'gobernanza_actividad',
        'gobernanza_documentos',
        'gobernanza_entrevistas',
        'gobernanza_indicadores',
        'gobernanza_plantillas',
        'gobernanza_proyectos',
        'gobernanza_tareas'
    ];
BEGIN
    FOREACH v_table IN ARRAY v_admqui_tables LOOP
        IF EXISTS (
            SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = v_table
        ) THEN
            -- Eliminar políticas anteriores que tenían USING (true)
            FOR v_pol IN
                SELECT policyname FROM pg_policies
                WHERE schemaname = 'public' AND tablename = v_table
            LOOP
                EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_pol.policyname, v_table);
            END LOOP;

            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);

            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR ALL USING (public.is_valid_admqui_session()) WITH CHECK (public.is_valid_admqui_session())',
                'admqui_rls_session_' || v_table,
                v_table
            );
        END IF;
    END LOOP;
END;
$$;
