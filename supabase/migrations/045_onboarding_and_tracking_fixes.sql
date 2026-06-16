-- ============================================================
-- SISTEMA ADM-QUI — Migración 045: Onboarding Módulos + Tracking Fixes
-- Fecha: 2026-06-16
-- ============================================================
-- 1. Tabla user_module_preferences para personalización del sidebar
-- 2. Fix: guard contra sesiones duplicadas
-- 3. Fix: calcular duration_minutes correctamente en RPC
-- ============================================================

-- =========================
-- TABLA: user_module_preferences
-- Almacena qué módulos seleccionó cada usuario en su onboarding
-- =========================
CREATE TABLE IF NOT EXISTS user_module_preferences (
  user_id UUID PRIMARY KEY REFERENCES admqui_usuarios(id) ON DELETE CASCADE,
  usuario TEXT NOT NULL,
  selected_modules JSONB NOT NULL DEFAULT '[]'::JSONB,
  completed_onboarding BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_module_prefs_usuario ON user_module_preferences(usuario);

ALTER TABLE user_module_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_user_module_preferences ON user_module_preferences;
CREATE POLICY allow_all_user_module_preferences ON user_module_preferences FOR ALL USING (true) WITH CHECK (true);

-- =========================
-- FIX: Cerrar sesiones zombi antes de crear nueva
-- Cierra todas las sesiones abiertas de un usuario que llevan >5min sin heartbeat
-- =========================
CREATE OR REPLACE FUNCTION close_stale_sessions(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE user_sessions
  SET ended_at = last_heartbeat,
      duration_minutes = GREATEST(1, EXTRACT(EPOCH FROM (last_heartbeat - started_at)) / 60)::INT
  WHERE user_id = p_user_id
    AND ended_at IS NULL
    AND last_heartbeat < NOW() - INTERVAL '3 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================
-- FIX: Recalcular duración al cerrar sesión via heartbeat/endSession
-- Trigger que calcula duration_minutes automáticamente cuando se setea ended_at
-- =========================
CREATE OR REPLACE FUNCTION trg_calc_session_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
    NEW.duration_minutes := GREATEST(1, EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at)) / 60)::INT;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calc_session_duration ON user_sessions;
CREATE TRIGGER calc_session_duration
  BEFORE UPDATE ON user_sessions
  FOR EACH ROW
  EXECUTE FUNCTION trg_calc_session_duration();

-- =========================
-- FIX RPC: get_user_activity_summary — recalcular minutos correctamente
-- Ahora usa last_heartbeat como fin cuando ended_at es NULL
-- y el top_modules ya funcionaba, pero lo optimizamos
-- =========================
CREATE OR REPLACE FUNCTION get_user_activity_summary(
  p_desde TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  p_hasta TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE(
  usuario TEXT,
  nombre TEXT,
  iniciales TEXT,
  total_sessions BIGINT,
  total_minutes BIGINT,
  last_seen TIMESTAMPTZ,
  top_modules JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH session_stats AS (
    SELECT
      s.usuario,
      COUNT(*)::BIGINT AS total_sessions,
      COALESCE(SUM(
        GREATEST(1, EXTRACT(EPOCH FROM (COALESCE(s.ended_at, s.last_heartbeat) - s.started_at)) / 60)
      ), 0)::BIGINT AS total_minutes,
      MAX(COALESCE(s.ended_at, s.last_heartbeat)) AS last_seen
    FROM user_sessions s
    WHERE s.started_at >= p_desde
      AND s.started_at <= p_hasta
    GROUP BY s.usuario
  ),
  module_stats AS (
    SELECT
      m.usuario,
      jsonb_agg(
        jsonb_build_object('module_id', m.module_id, 'module_label', m.module_label, 'total_seconds', m.total_secs)
        ORDER BY m.total_secs DESC
      ) AS top_modules
    FROM (
      SELECT
        mu.usuario,
        mu.module_id,
        MAX(mu.module_label) AS module_label,
        COALESCE(SUM(mu.duration_seconds), 0)::BIGINT AS total_secs
      FROM user_module_usage mu
      WHERE mu.entered_at >= p_desde
        AND mu.entered_at <= p_hasta
        AND mu.duration_seconds > 0
      GROUP BY mu.usuario, mu.module_id
    ) m
    WHERE m.total_secs > 0
    GROUP BY m.usuario
  )
  SELECT
    ss.usuario,
    COALESCE(u.nombre, ss.usuario) AS nombre,
    COALESCE(u.iniciales, UPPER(LEFT(ss.usuario, 2))) AS iniciales,
    ss.total_sessions,
    ss.total_minutes,
    ss.last_seen,
    COALESCE(ms.top_modules, '[]'::JSONB) AS top_modules
  FROM session_stats ss
  LEFT JOIN admqui_usuarios u ON u.usuario = ss.usuario
  LEFT JOIN module_stats ms ON ms.usuario = ss.usuario
  ORDER BY ss.total_minutes DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================
-- Backfill: calcular duration_minutes para sesiones cerradas que tienen NULL
-- =========================
UPDATE user_sessions
SET duration_minutes = GREATEST(1, EXTRACT(EPOCH FROM (COALESCE(ended_at, last_heartbeat) - started_at)) / 60)::INT
WHERE duration_minutes IS NULL OR duration_minutes = 0;
