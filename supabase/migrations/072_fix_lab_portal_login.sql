-- =====================================================================================
-- MIGRACIÓN 072: SOPORTE DE LOGIN PARA PORTALES EXTERNOS DE LABORATORIO (aguero, cedap, cuyo)
-- Restaura public.verify_login(text, text) restringido exclusivamente a cuentas con
-- rol = 'laboratorio' para compatibilidad con pestañas abiertas del Portal de Anatomía
-- Patológica, manteniendo bloqueado cualquier intento de uso por cuentas internas.
-- =====================================================================================

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
    v_plain_password TEXT;
BEGIN
    v_plain_password := public.decode_transport_password(p_password);

    SELECT u.*
    INTO v_user
    FROM public.admqui_usuarios u
    WHERE (
            LOWER(TRIM(u.usuario)) = v_clean_user
            OR LOWER(SPLIT_PART(TRIM(COALESCE(u.email, '')), '@', 1)) = v_clean_user
          )
      AND COALESCE(u.rol, '') = 'laboratorio'
      AND COALESCE(u.activo, TRUE) = TRUE
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
        COALESCE(v_user.rol, 'laboratorio');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.verify_login(text, text) TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';

