-- ============================================================
-- SISTEMA ADM-QUI — Migración 025: Corregir FK audit_log
-- Fecha: 2026-03-19
-- ============================================================
-- PROBLEMA: La tabla audit_log tiene una FK a la tabla "usuarios"
-- (migración 011), pero el sistema de autenticación fue migrado
-- a "admqui_usuarios" (migración 024). La FK apunta a una tabla
-- obsoleta que podría causar errores de integridad referencial.
--
-- SOLUCIÓN: Limpiar user_ids huérfanos (IDs de la tabla vieja
-- que no existen en admqui_usuarios), eliminar la FK vieja y
-- crear una nueva apuntando a admqui_usuarios.
-- ============================================================

-- 1) Limpiar user_ids que apuntan a IDs de la tabla vieja "usuarios"
--    que no existen en "admqui_usuarios" (setear a NULL para no perder el log)
UPDATE audit_log
SET user_id = NULL
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM admqui_usuarios);

-- 2) Eliminar la FK vieja a "usuarios"
ALTER TABLE audit_log
  DROP CONSTRAINT IF EXISTS audit_log_user_id_fkey;

-- 3) Crear la FK nueva a "admqui_usuarios"
--    Usamos ON DELETE SET NULL para que al borrar un usuario,
--    el registro de auditoría sobreviva (solo pierde el link)
ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES admqui_usuarios(id)
  ON DELETE SET NULL;
