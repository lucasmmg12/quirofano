-- ================================================
-- RPC: execute_readonly_query
-- Permite a Beto ejecutar consultas SELECT seguras
-- Solo permite SELECT, bloquea escritura
-- ================================================

CREATE OR REPLACE FUNCTION execute_readonly_query(query_text text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result json;
    clean_query text;
BEGIN
    -- Normalize query
    clean_query := UPPER(TRIM(query_text));
    
    -- Only allow SELECT
    IF NOT clean_query LIKE 'SELECT%' THEN
        RAISE EXCEPTION 'Solo se permiten consultas SELECT';
    END IF;
    
    -- Block dangerous keywords
    IF clean_query ~ '\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXECUTE|EXEC)\b' THEN
        RAISE EXCEPTION 'Operación no permitida. Solo consultas SELECT.';
    END IF;
    
    -- Execute and return as JSON
    EXECUTE 'SELECT json_agg(row_to_json(t)) FROM (' || query_text || ') t'
    INTO result;
    
    -- Return empty array if null
    RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Grant access to service role (used by Edge Functions)
GRANT EXECUTE ON FUNCTION execute_readonly_query(text) TO service_role;

-- Also create a helper to introspect schema
CREATE OR REPLACE FUNCTION get_schema_info()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT json_agg(row_to_json(t))
    FROM (
        SELECT 
            table_name,
            column_name,
            data_type,
            is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name NOT LIKE 'pg_%'
        AND table_name NOT LIKE '_realtime%'
        ORDER BY table_name, ordinal_position
    ) t;
$$;

GRANT EXECUTE ON FUNCTION get_schema_info() TO service_role;
