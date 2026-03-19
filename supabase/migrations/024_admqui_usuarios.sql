-- ============================================================
-- SISTEMA ADM-QUI — Migración 024: Tabla admqui_usuarios
-- Fecha: 2026-03-19
-- ============================================================
-- PROBLEMA: La tabla "usuarios" fue reutilizada por el módulo
-- de enfermería con un schema distinto (nombre, apellido, 
-- matricula, rol, unidad). Las funciones RPC verify_login,
-- create_user y change_password fallaban con:
--   "column u.usuario does not exist"
--
-- SOLUCIÓN: Crear tabla "admqui_usuarios" independiente y
-- actualizar todas las funciones RPC para apuntar a ella.
-- ============================================================

CREATE TABLE IF NOT EXISTS admqui_usuarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario TEXT NOT NULL,
  nombre TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  iniciales TEXT,
  activo BOOLEAN DEFAULT TRUE,
  ultimo_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE admqui_usuarios
  DROP CONSTRAINT IF EXISTS uq_admqui_usuarios_usuario;
ALTER TABLE admqui_usuarios
  ADD CONSTRAINT uq_admqui_usuarios_usuario UNIQUE (usuario);

ALTER TABLE admqui_usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_admqui_usuarios ON admqui_usuarios;
CREATE POLICY allow_all_admqui_usuarios ON admqui_usuarios
  FOR ALL USING (true) WITH CHECK (true);

-- Recrear funciones RPC apuntando a admqui_usuarios
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION create_user(
  p_usuario TEXT,
  p_nombre TEXT,
  p_password TEXT,
  p_iniciales TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO admqui_usuarios (usuario, nombre, password_hash, iniciales)
  VALUES (
    LOWER(TRIM(p_usuario)),
    TRIM(p_nombre),
    crypt(p_password, gen_salt('bf')),
    COALESCE(p_iniciales, UPPER(LEFT(TRIM(p_nombre), 1)))
  )
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION verify_login(
  p_usuario TEXT,
  p_password TEXT
) RETURNS TABLE(id UUID, usuario TEXT, nombre TEXT, iniciales TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.usuario, u.nombre, u.iniciales
  FROM admqui_usuarios u
  WHERE u.usuario = LOWER(TRIM(p_usuario))
    AND u.password_hash = crypt(p_password, u.password_hash)
    AND u.activo = TRUE;

  UPDATE admqui_usuarios SET ultimo_login = NOW()
  WHERE admqui_usuarios.usuario = LOWER(TRIM(p_usuario))
    AND admqui_usuarios.password_hash = crypt(p_password, admqui_usuarios.password_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION change_password(
  p_user_id UUID,
  p_old_password TEXT,
  p_new_password TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  valid BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM admqui_usuarios
    WHERE id = p_user_id
    AND password_hash = crypt(p_old_password, password_hash)
    AND activo = TRUE
  ) INTO valid;

  IF NOT valid THEN
    RETURN FALSE;
  END IF;

  UPDATE admqui_usuarios
  SET password_hash = crypt(p_new_password, gen_salt('bf')),
      updated_at = NOW()
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recrear usuarios iniciales
SELECT create_user('admin', 'Administrador', 'admin123', 'AD');
SELECT create_user('frojo', 'F. Rojo', '123456', 'FR');
SELECT create_user('amedawar', 'A. Medawar', '123456', 'AM');
SELECT create_user('gacosta', 'G. Acosta', '123456', 'GA');
SELECT create_user('vfigueroa', 'V. Figueroa', '123456', 'VF');
SELECT create_user('mmoreno', 'M. Moreno', '123456', 'MM');
SELECT create_user('gcortez', 'G. Cortez', '123456', 'GC');
SELECT create_user('lsoto', 'L. Soto', '123456', 'LS');
SELECT create_user('ctorres', 'C. Torres', '123456', 'CT');
SELECT create_user('malvarado', 'M. Alvarado', '123456', 'MA');
