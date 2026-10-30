-- 062_user_access_requests_and_profile_fields.sql
-- Solicitudes de alta de usuario desde el Login + Campos extendidos de Perfil Personal

-- 1. Ampliar campos de perfil en admqui_usuarios
ALTER TABLE public.admqui_usuarios
    ADD COLUMN IF NOT EXISTS dni TEXT,
    ADD COLUMN IF NOT EXISTS area_sector TEXT,
    ADD COLUMN IF NOT EXISTS cargo TEXT,
    ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE;

-- 2. Tabla de Solicitudes de Alta de Usuario (desde "¡Comunicáte con el Administrador!" en Login)
CREATE TABLE IF NOT EXISTS public.admqui_solicitudes_usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    dni TEXT,
    usuario_sugerido TEXT NOT NULL,
    email TEXT NOT NULL,
    telefono_whatsapp TEXT NOT NULL,
    area_sector TEXT,
    cargo TEXT,
    rol_solicitado TEXT NOT NULL DEFAULT 'operador',
    motivo TEXT,
    avatar_url TEXT,
    estado TEXT NOT NULL DEFAULT 'pendiente', -- 'pendiente' | 'aprobada' | 'rechazada'
    notas_admin TEXT,
    resuelto_por TEXT,
    resuelto_at TIMESTAMPTZ,
    usuario_creado_id UUID REFERENCES public.admqui_usuarios(id) ON DELETE SET NULL,
    ip_origen TEXT,
    os_browser TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_usuarios_estado_created
    ON public.admqui_solicitudes_usuarios (estado, created_at DESC);

ALTER TABLE public.admqui_solicitudes_usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_public_insert_solicitudes_usuarios" ON public.admqui_solicitudes_usuarios;
CREATE POLICY "allow_public_insert_solicitudes_usuarios"
    ON public.admqui_solicitudes_usuarios
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (rol_solicitado <> 'admin');

DROP POLICY IF EXISTS "allow_select_solicitudes_usuarios" ON public.admqui_solicitudes_usuarios;
CREATE POLICY "allow_select_solicitudes_usuarios"
    ON public.admqui_solicitudes_usuarios
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "allow_update_solicitudes_usuarios" ON public.admqui_solicitudes_usuarios;
CREATE POLICY "allow_update_solicitudes_usuarios"
    ON public.admqui_solicitudes_usuarios
    FOR UPDATE
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 3. Actualizar admin_list_users para incluir los nuevos campos de perfil
DROP FUNCTION IF EXISTS public.admin_list_users();
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(
    id uuid,
    usuario text,
    nombre text,
    iniciales text,
    email text,
    telefono_whatsapp text,
    rol text,
    activo boolean,
    must_change_password boolean,
    password_changed_at timestamp with time zone,
    mfa_enabled boolean,
    mfa_method text,
    has_totp boolean,
    trusted_devices_count integer,
    ultimo_login timestamp with time zone,
    created_at timestamp with time zone,
    avatar_url text,
    dni text,
    area_sector text,
    cargo text
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
        u.avatar_url,
        u.dni,
        u.area_sector,
        u.cargo
    FROM public.admqui_usuarios u
    ORDER BY u.activo DESC, u.nombre ASC;
END;
$function$;

-- 4. Actualizar admin_save_user para soportar dni, area_sector, cargo y avatar_url
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
            updated_at = NOW()
        WHERE id = p_id
        RETURNING id INTO v_id;
    END IF;

    RETURN v_id;
END;
$function$;

-- 5. RPC para que cada usuario personalice su propio perfil (foto, celular estricto 10 dígitos, email, sector, cargo, dni)
CREATE OR REPLACE FUNCTION public.update_own_user_profile(
    p_user_id uuid,
    p_nombre text,
    p_iniciales text DEFAULT NULL::text,
    p_telefono_whatsapp text DEFAULT NULL::text,
    p_email text DEFAULT NULL::text,
    p_dni text DEFAULT NULL::text,
    p_area_sector text DEFAULT NULL::text,
    p_cargo text DEFAULT NULL::text,
    p_avatar_url text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_user RECORD;
BEGIN
    IF p_telefono_whatsapp IS NOT NULL AND TRIM(p_telefono_whatsapp) <> '' THEN
        IF TRIM(p_telefono_whatsapp) !~ '^[1-9][0-9]{9}$' OR LEFT(TRIM(p_telefono_whatsapp), 2) = '15' OR LEFT(TRIM(p_telefono_whatsapp), 2) = '54' THEN
            RAISE EXCEPTION 'El celular debe tener exactamente 10 dígitos sin +549, sin 0 y sin 15 (ej: 2645438114)';
        END IF;
    END IF;

    UPDATE public.admqui_usuarios
    SET nombre = COALESCE(NULLIF(TRIM(p_nombre), ''), nombre),
        iniciales = COALESCE(NULLIF(UPPER(TRIM(p_iniciales)), ''), iniciales),
        telefono_whatsapp = CASE WHEN p_telefono_whatsapp IS NOT NULL THEN NULLIF(TRIM(p_telefono_whatsapp), '') ELSE telefono_whatsapp END,
        email = COALESCE(NULLIF(TRIM(p_email), ''), email),
        dni = CASE WHEN p_dni IS NOT NULL THEN NULLIF(TRIM(p_dni), '') ELSE dni END,
        area_sector = CASE WHEN p_area_sector IS NOT NULL THEN NULLIF(TRIM(p_area_sector), '') ELSE area_sector END,
        cargo = CASE WHEN p_cargo IS NOT NULL THEN NULLIF(TRIM(p_cargo), '') ELSE cargo END,
        avatar_url = CASE WHEN p_avatar_url IS NOT NULL THEN NULLIF(TRIM(p_avatar_url), '') ELSE avatar_url END,
        updated_at = NOW()
    WHERE id = p_user_id
    RETURNING id, usuario, nombre, iniciales, email, telefono_whatsapp, rol, avatar_url, dni, area_sector, cargo
    INTO v_user;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuario no encontrado';
    END IF;

    RETURN to_jsonb(v_user);
END;
$function$;

