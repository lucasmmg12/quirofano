-- 067_auto_archive_inactive_bot.sql
-- Función RPC para auto-archivar conversaciones inactivas del Bot tras X minutos de inactividad

CREATE OR REPLACE FUNCTION auto_archive_inactive_bot_conversations(
    p_inactivity_minutes INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_archived_count INT := 0;
    v_now TIMESTAMPTZ := NOW();
    v_cutoff TIMESTAMPTZ := v_now - (p_inactivity_minutes || ' minutes')::interval;
BEGIN
    UPDATE contact_center_conversations
    SET 
        status = 'archivado',
        resolution_reason = 'Auto-gestión Bot Completa (Inactividad)',
        closed_at = v_now,
        closed_by_agent_name = 'Sistema Automático (Bot)',
        bot_active = true,
        bot_stage = 'inicio',
        updated_at = v_now
    WHERE status = 'bot'
      AND assigned_agent_id IS NULL
      AND (
          last_message_at < v_cutoff 
          OR (last_message_at IS NULL AND updated_at < v_cutoff)
      );

    GET DIAGNOSTICS v_archived_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'archived_count', v_archived_count,
        'cutoff', v_cutoff,
        'timestamp', v_now
    );
END;
$$;
