-- Migration 068: Contact Center Daily Pre-Aggregated Metrics
-- Optimización de alto rendimiento para evitar escaneo secuencial de 100.000+ filas en el navegador

CREATE TABLE IF NOT EXISTS public.contact_center_daily_metrics (
    fecha DATE PRIMARY KEY,
    total_mensajes INT DEFAULT 0,
    entrantes INT DEFAULT 0,
    salientes INT DEFAULT 0,
    salientes_bot INT DEFAULT 0,
    salientes_agentes INT DEFAULT 0,
    agentes_detalle JSONB DEFAULT '{}'::jsonb,
    hourly_incoming JSONB DEFAULT '[]'::jsonb,
    hourly_bot JSONB DEFAULT '[]'::jsonb,
    hourly_agents JSONB DEFAULT '[]'::jsonb,
    conversaciones_nuevas INT DEFAULT 0,
    conversaciones_cerradas INT DEFAULT 0,
    motivos_cierre JSONB DEFAULT '{}'::jsonb,
    pacientes_unicos INT DEFAULT 0,
    avg_wait_min NUMERIC(8,1) DEFAULT 0,
    avg_resolution_min NUMERIC(8,1) DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies
ALTER TABLE public.contact_center_daily_metrics ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'contact_center_daily_metrics' AND policyname = 'Allow read contact_center_daily_metrics'
    ) THEN
        CREATE POLICY "Allow read contact_center_daily_metrics"
        ON public.contact_center_daily_metrics
        FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'contact_center_daily_metrics' AND policyname = 'Allow all service_role contact_center_daily_metrics'
    ) THEN
        CREATE POLICY "Allow all service_role contact_center_daily_metrics"
        ON public.contact_center_daily_metrics
        FOR ALL USING (true);
    END IF;
END $$;

-- Función de consolidación diaria en PostgreSQL
CREATE OR REPLACE FUNCTION refresh_contact_center_daily_metrics(
    p_start_date DATE DEFAULT CURRENT_DATE,
    p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    curr_d DATE;
    v_total_updated INT := 0;
    
    v_total INT;
    v_in INT;
    v_out INT;
    v_bot INT;
    v_agent INT;
    v_agentes_json JSONB;
    v_hourly_in JSONB;
    v_hourly_bot JSONB;
    v_hourly_agent JSONB;
    v_convs_nuevas INT;
    v_convs_cerradas INT;
    v_motivos_json JSONB;
    v_unique_phones INT;
    v_avg_wait NUMERIC;
    v_avg_res NUMERIC;
    
    start_ts TIMESTAMPTZ;
    end_ts TIMESTAMPTZ;
BEGIN
    curr_d := p_start_date;
    WHILE curr_d <= p_end_date LOOP
        start_ts := curr_d::text || ' 00:00:00-03';
        end_ts   := (curr_d + 1)::text || ' 00:00:00-03';

        -- 1. Métricas de Mensajes, Asesoras y Curvas Horarias (Single Pass)
        WITH msgs AS (
            SELECT 
                direction,
                phone,
                EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Argentina/San_Juan')::int as local_hour,
                CASE 
                    WHEN COALESCE(raw_payload->>'bot', '') = 'true' 
                        OR COALESCE(raw_payload->>'source', '') = 'bot_triage' 
                        OR COALESCE(sender_name, '') ILIKE '%bot%' 
                        OR COALESCE(sender_name, '') ILIKE '%sistema adm-qui%' 
                    THEN 'bot'
                    WHEN raw_payload->>'agent' ILIKE '%daguilera%' OR raw_payload->>'agent' ILIKE '%daniela%' OR sender_name ILIKE '%daniela%' OR sender_name ILIKE '%daguilera%' THEN 'daguilera'
                    WHEN raw_payload->>'agent' ILIKE '%solivier%' OR raw_payload->>'agent' ILIKE '%sofia%' OR sender_name ILIKE '%sofia%' OR sender_name ILIKE '%solivier%' THEN 'solivier'
                    WHEN raw_payload->>'agent' ILIKE '%vjacques%' OR raw_payload->>'agent' ILIKE '%virginia%' OR sender_name ILIKE '%virginia%' OR sender_name ILIKE '%vjacques%' THEN 'vjacques'
                    WHEN raw_payload->>'agent' ILIKE '%eleal%' OR raw_payload->>'agent' ILIKE '%erica%' OR sender_name ILIKE '%erica%' OR sender_name ILIKE '%eleal%' THEN 'eleal'
                    WHEN raw_payload->>'agent' ILIKE '%macosta%' OR raw_payload->>'agent' ILIKE '%antonella%' OR sender_name ILIKE '%antonella%' OR sender_name ILIKE '%macosta%' THEN 'macosta'
                    ELSE 'otros'
                END as actor
            FROM whatsapp_messages
            WHERE line_id = 'contact_center'
              AND created_at >= start_ts 
              AND created_at < end_ts
        ),
        hours AS (
            SELECT generate_series(0, 23) AS h
        ),
        hr_counts AS (
            SELECT 
                local_hour,
                COUNT(*) FILTER (WHERE direction = 'incoming') as in_cnt,
                COUNT(*) FILTER (WHERE direction = 'outgoing' AND actor = 'bot') as bot_cnt,
                COUNT(*) FILTER (WHERE direction = 'outgoing' AND actor != 'bot') as agent_cnt
            FROM msgs
            GROUP BY 1
        ),
        hr_agg AS (
            SELECT 
                jsonb_agg(COALESCE(c.in_cnt, 0) ORDER BY h.h) as h_in,
                jsonb_agg(COALESCE(c.bot_cnt, 0) ORDER BY h.h) as h_bot,
                jsonb_agg(COALESCE(c.agent_cnt, 0) ORDER BY h.h) as h_agent
            FROM hours h
            LEFT JOIN hr_counts c ON c.local_hour = h.h
        )
        SELECT 
            COUNT(*),
            COUNT(*) FILTER (WHERE direction = 'incoming'),
            COUNT(*) FILTER (WHERE direction = 'outgoing'),
            COUNT(*) FILTER (WHERE direction = 'outgoing' AND actor = 'bot'),
            COUNT(*) FILTER (WHERE direction = 'outgoing' AND actor != 'bot'),
            jsonb_build_object(
                'daguilera', COUNT(*) FILTER (WHERE direction = 'outgoing' AND actor = 'daguilera'),
                'solivier',  COUNT(*) FILTER (WHERE direction = 'outgoing' AND actor = 'solivier'),
                'vjacques',  COUNT(*) FILTER (WHERE direction = 'outgoing' AND actor = 'vjacques'),
                'eleal',     COUNT(*) FILTER (WHERE direction = 'outgoing' AND actor = 'eleal'),
                'macosta',   COUNT(*) FILTER (WHERE direction = 'outgoing' AND actor = 'macosta'),
                'otros',     COUNT(*) FILTER (WHERE direction = 'outgoing' AND actor = 'otros')
            ),
            COUNT(DISTINCT phone),
            (SELECT h_in FROM hr_agg),
            (SELECT h_bot FROM hr_agg),
            (SELECT h_agent FROM hr_agg)
        INTO 
            v_total, v_in, v_out, v_bot, v_agent, v_agentes_json, v_unique_phones,
            v_hourly_in, v_hourly_bot, v_hourly_agent
        FROM msgs;

        -- 3. Conversaciones y Tiempos de Atención
        SELECT 
            COUNT(*) FILTER (WHERE created_at >= start_ts AND created_at < end_ts),
            COUNT(*) FILTER (WHERE closed_at >= start_ts AND closed_at < end_ts),
            ROUND(AVG(EXTRACT(EPOCH FROM (assigned_at - created_at)) / 60.0) FILTER (WHERE assigned_at IS NOT NULL AND assigned_at >= created_at AND assigned_at <= created_at + interval '48 hours')::numeric, 1),
            ROUND(AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 60.0) FILTER (WHERE closed_at IS NOT NULL AND closed_at >= created_at AND closed_at <= created_at + interval '48 hours')::numeric, 1)
        INTO 
            v_convs_nuevas, v_convs_cerradas, v_avg_wait, v_avg_res
        FROM contact_center_conversations
        WHERE (created_at >= start_ts AND created_at < end_ts) 
           OR (closed_at >= start_ts AND closed_at < end_ts);

        -- 4. Motivos de Cierre
        SELECT COALESCE(jsonb_object_agg(COALESCE(resolution_reason, 'Sin motivo'), cnt), '{}'::jsonb)
        INTO v_motivos_json
        FROM (
            SELECT resolution_reason, count(*) as cnt
            FROM contact_center_conversations
            WHERE closed_at >= start_ts AND closed_at < end_ts
            GROUP BY resolution_reason
        ) s;

        -- 5. Insertar / Actualizar Registro Pre-Agregado
        INSERT INTO public.contact_center_daily_metrics (
            fecha,
            total_mensajes,
            entrantes,
            salientes,
            salientes_bot,
            salientes_agentes,
            agentes_detalle,
            hourly_incoming,
            hourly_bot,
            hourly_agents,
            conversaciones_nuevas,
            conversaciones_cerradas,
            motivos_cierre,
            pacientes_unicos,
            avg_wait_min,
            avg_resolution_min,
            updated_at
        ) VALUES (
            curr_d,
            COALESCE(v_total, 0),
            COALESCE(v_in, 0),
            COALESCE(v_out, 0),
            COALESCE(v_bot, 0),
            COALESCE(v_agent, 0),
            COALESCE(v_agentes_json, '{}'::jsonb),
            COALESCE(v_hourly_in, '[]'::jsonb),
            COALESCE(v_hourly_bot, '[]'::jsonb),
            COALESCE(v_hourly_agent, '[]'::jsonb),
            COALESCE(v_convs_nuevas, 0),
            COALESCE(v_convs_cerradas, 0),
            COALESCE(v_motivos_json, '{}'::jsonb),
            COALESCE(v_unique_phones, 0),
            COALESCE(v_avg_wait, 0),
            COALESCE(v_avg_res, 0),
            NOW()
        )
        ON CONFLICT (fecha) DO UPDATE SET
            total_mensajes = EXCLUDED.total_mensajes,
            entrantes = EXCLUDED.entrantes,
            salientes = EXCLUDED.salientes,
            salientes_bot = EXCLUDED.salientes_bot,
            salientes_agentes = EXCLUDED.salientes_agentes,
            agentes_detalle = EXCLUDED.agentes_detalle,
            hourly_incoming = EXCLUDED.hourly_incoming,
            hourly_bot = EXCLUDED.hourly_bot,
            hourly_agents = EXCLUDED.hourly_agents,
            conversaciones_nuevas = EXCLUDED.conversaciones_nuevas,
            conversaciones_cerradas = EXCLUDED.conversaciones_cerradas,
            motivos_cierre = EXCLUDED.motivos_cierre,
            pacientes_unicos = EXCLUDED.pacientes_unicos,
            avg_wait_min = EXCLUDED.avg_wait_min,
            avg_resolution_min = EXCLUDED.avg_resolution_min,
            updated_at = NOW();

        v_total_updated := v_total_updated + 1;
        curr_d := curr_d + 1;
    END LOOP;

    RETURN v_total_updated;
END;
$$;
