-- ============================================================================
-- Migración 076: RPC para conteo real de Contactos / Sesiones Recibidas
-- en Contact Center (cuenta múltiples contactos de un mismo paciente si
-- vuelven a escribir tras >= p_gap_hours horas de inactividad, por defecto 4h).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_contact_center_session_counts(
    p_start TIMESTAMPTZ,
    p_end TIMESTAMPTZ,
    p_gap_hours INTEGER DEFAULT 4
)
RETURNS TABLE (
    total_sessions BIGINT,
    unique_patients BIGINT,
    multi_session_patients BIGINT,
    total_incoming_msgs BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_gap_seconds NUMERIC := GREATEST(1, COALESCE(p_gap_hours, 4)) * 3600;
BEGIN
    RETURN QUERY
    WITH ordered_msgs AS (
        SELECT
            REGEXP_REPLACE(COALESCE(m.phone, ''), '\D', '', 'g') AS clean_phone,
            m.created_at,
            LAG(m.created_at) OVER (
                PARTITION BY REGEXP_REPLACE(COALESCE(m.phone, ''), '\D', '', 'g')
                ORDER BY m.created_at
            ) AS prev_created_at
        FROM public.whatsapp_messages m
        WHERE m.line_id = 'contact_center'
          AND m.direction = 'incoming'
          AND m.created_at >= p_start
          AND m.created_at <= p_end
          AND COALESCE(m.phone, '') <> ''
    ),
    flagged AS (
        SELECT
            clean_phone,
            CASE
                WHEN prev_created_at IS NULL THEN 1
                WHEN EXTRACT(EPOCH FROM (created_at - prev_created_at)) >= v_gap_seconds THEN 1
                ELSE 0
            END AS is_new_session
        FROM ordered_msgs
        WHERE LENGTH(clean_phone) >= 8
    ),
    per_phone AS (
        SELECT
            clean_phone,
            SUM(is_new_session)::BIGINT AS session_count,
            COUNT(*)::BIGINT AS msg_count
        FROM flagged
        GROUP BY clean_phone
    )
    SELECT
        COALESCE(SUM(session_count), 0)::BIGINT AS total_sessions,
        COUNT(*)::BIGINT AS unique_patients,
        COUNT(*) FILTER (WHERE session_count > 1)::BIGINT AS multi_session_patients,
        COALESCE(SUM(msg_count), 0)::BIGINT AS total_incoming_msgs
    FROM per_phone;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_contact_center_session_counts(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO anon, authenticated, service_role;
