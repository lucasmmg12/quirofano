-- ============================================================
-- SISTEMA ADM-QUI — Módulo Usuarios + Auditoría
-- Migración 011: Tabla de usuarios y log de auditoría
-- Fecha: 2026-02-24
-- ============================================================

-- =========================
-- TABLA: usuarios
-- Máximo ~10 usuarios, todos con mismo acceso
-- Alta manual por admin
-- =========================
CREATE TABLE IF NOT EXISTS usuarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  usuario TEXT NOT NULL,              -- Login username (unique)
  nombre TEXT NOT NULL,               -- Display name
  password_hash TEXT NOT NULL,        -- Hashed password
  iniciales TEXT,                     -- Iniciales para avatar (ej: "LG")
  activo BOOLEAN DEFAULT TRUE,       -- Habilitado para login
  
  ultimo_login TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint para login
ALTER TABLE usuarios
  DROP CONSTRAINT IF EXISTS uq_usuarios_usuario;
ALTER TABLE usuarios
  ADD CONSTRAINT uq_usuarios_usuario UNIQUE (usuario);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_usuarios_updated ON usuarios;
CREATE TRIGGER trg_usuarios_updated
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =========================
-- TABLA: audit_log
-- Registro de todas las acciones de usuario
-- =========================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  user_id UUID REFERENCES usuarios(id),
  usuario TEXT,                       -- Denormalizado para queries rápidas
  nombre TEXT,                        -- Denormalizado
  
  accion TEXT NOT NULL,               -- Tipo de acción: 'login', 'upload_excel', 'cambio_estado', etc.
  detalle JSONB DEFAULT '{}',         -- Metadata de la acción (qué cambió, valores, etc.)
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para queries de auditoría
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_accion ON audit_log(accion);
CREATE INDEX IF NOT EXISTS idx_audit_log_fecha ON audit_log(created_at DESC);

-- =========================
-- RLS — Acceso abierto (igual que el resto del sistema)
-- =========================
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_usuarios ON usuarios;
CREATE POLICY allow_all_usuarios ON usuarios FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS allow_all_audit_log ON audit_log;
CREATE POLICY allow_all_audit_log ON audit_log FOR ALL USING (true) WITH CHECK (true);

-- =========================
-- FUNCIÓN: Verificar password (simple hash comparison via pgcrypto)
-- =========================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Función para crear usuario con password hasheada
CREATE OR REPLACE FUNCTION create_user(
  p_usuario TEXT,
  p_nombre TEXT,
  p_password TEXT,
  p_iniciales TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO usuarios (usuario, nombre, password_hash, iniciales)
  VALUES (
    LOWER(TRIM(p_usuario)),
    TRIM(p_nombre),
    crypt(p_password, gen_salt('bf')),
    COALESCE(p_iniciales, UPPER(LEFT(TRIM(p_nombre), 1) || COALESCE(SUBSTRING(TRIM(p_nombre) FROM POSITION(' ' IN TRIM(p_nombre)) + 1 FOR 1), '')))
  )
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para verificar login
CREATE OR REPLACE FUNCTION verify_login(
  p_usuario TEXT,
  p_password TEXT
) RETURNS TABLE(id UUID, usuario TEXT, nombre TEXT, iniciales TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.usuario, u.nombre, u.iniciales
  FROM usuarios u
  WHERE u.usuario = LOWER(TRIM(p_usuario))
    AND u.password_hash = crypt(p_password, u.password_hash)
    AND u.activo = TRUE;
    
  -- Actualizar último login si encontró usuario
  UPDATE usuarios SET ultimo_login = NOW()
  WHERE usuarios.usuario = LOWER(TRIM(p_usuario))
    AND usuarios.password_hash = crypt(p_password, usuarios.password_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================
-- USUARIO ADMIN INICIAL (password: admin123)
-- Cambiar después del primer login
-- =========================
SELECT create_user('admin', 'Administrador', 'admin123', 'AD');
