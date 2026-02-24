-- ============================================================
-- Alta de usuarios iniciales + función cambio de contraseña
-- Fecha: 2026-02-24
-- ============================================================

-- Función para cambiar contraseña
CREATE OR REPLACE FUNCTION change_password(
  p_user_id UUID,
  p_old_password TEXT,
  p_new_password TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_valid BOOLEAN;
BEGIN
  -- Verificar password actual
  SELECT EXISTS(
    SELECT 1 FROM usuarios
    WHERE id = p_user_id
      AND password_hash = crypt(p_old_password, password_hash)
  ) INTO v_valid;

  IF NOT v_valid THEN
    RETURN FALSE;
  END IF;

  -- Actualizar password
  UPDATE usuarios
  SET password_hash = crypt(p_new_password, gen_salt('bf')),
      updated_at = NOW()
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Alta de usuarios (password: 123456 para todos)
SELECT create_user('frojo', 'F. Rojo', '123456', 'FR');
SELECT create_user('amedawar', 'A. Medawar', '123456', 'AM');
SELECT create_user('gacosta', 'G. Acosta', '123456', 'GA');
SELECT create_user('vfigueroa', 'V. Figueroa', '123456', 'VF');
SELECT create_user('mmoreno', 'M. Moreno', '123456', 'MM');
SELECT create_user('gcortez', 'G. Cortez', '123456', 'GC');
SELECT create_user('lsoto', 'L. Soto', '123456', 'LS');
SELECT create_user('ctorres', 'C. Torres', '123456', 'CT');
SELECT create_user('malvarado', 'M. Alvarado', '123456', 'MA');
