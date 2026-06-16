-- ============================================================
-- SISTEMA ADM-QUI — Migración 044: User Activity Tracking Fixes
-- Fecha: 2026-06-16
-- ============================================================

-- RPC: heartbeat_session
-- Actualiza last_heartbeat de una sesión usando la hora del servidor
CREATE OR REPLACE FUNCTION heartbeat_session(p_session_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE user_sessions
  SET last_heartbeat = NOW()
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: get_active_sessions
-- Retorna las sesiones activas en base a la hora del servidor
CREATE OR REPLACE FUNCTION get_active_sessions()
RETURNS TABLE(
  id UUID,
  user_id UUID,
  usuario TEXT,
  started_at TIMESTAMPTZ,
  last_heartbeat TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.user_id, s.usuario, s.started_at, s.last_heartbeat
  FROM user_sessions s
  WHERE s.ended_at IS NULL
    AND s.last_heartbeat >= NOW() - INTERVAL '3 minutes'
  ORDER BY s.started_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: get_user_activity_summary (Actualizado para incluir módulos activos y duraciones de sesiones hasta NOW())
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
        CASE
          WHEN s.ended_at IS NOT NULL THEN
            EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 60
          ELSE
            EXTRACT(EPOCH FROM (NOW() - s.started_at)) / 60
        END
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
        SUM(
          CASE
            WHEN mu.left_at IS NOT NULL THEN mu.duration_seconds
            ELSE EXTRACT(EPOCH FROM (COALESCE(s.ended_at, s.last_heartbeat, NOW()) - mu.entered_at))::INT
          END
        )::BIGINT AS total_secs
      FROM user_module_usage mu
      JOIN user_sessions s ON s.id = mu.session_id
      WHERE mu.entered_at >= p_desde
        AND mu.entered_at <= p_hasta
      GROUP BY mu.usuario, mu.module_id
    ) m
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

-- RPC: get_module_usage_global (Actualizado para incluir módulos activos)
CREATE OR REPLACE FUNCTION get_module_usage_global(
  p_desde TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  p_hasta TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE(
  module_id TEXT,
  module_label TEXT,
  total_seconds BIGINT,
  unique_users BIGINT,
  visit_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    mu.module_id,
    MAX(mu.module_label) AS module_label,
    COALESCE(SUM(
      CASE
        WHEN mu.left_at IS NOT NULL THEN mu.duration_seconds
        ELSE EXTRACT(EPOCH FROM (COALESCE(s.ended_at, s.last_heartbeat, NOW()) - mu.entered_at))::INT
      END
    ), 0)::BIGINT AS total_seconds,
    COUNT(DISTINCT mu.usuario)::BIGINT AS unique_users,
    COUNT(*)::BIGINT AS visit_count
  FROM user_module_usage mu
  JOIN user_sessions s ON s.id = mu.session_id
  WHERE mu.entered_at >= p_desde
    AND mu.entered_at <= p_hasta
  GROUP BY mu.module_id
  ORDER BY total_seconds DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
