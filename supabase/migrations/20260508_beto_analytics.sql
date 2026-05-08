-- #12 Beto Analytics — Tabla de interacciones del asistente IA
-- Registra cada consulta del usuario, herramientas usadas, tiempos de respuesta y éxito

CREATE TABLE IF NOT EXISTS beto_interactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    user_name TEXT NOT NULL DEFAULT 'unknown',
    user_id TEXT NOT NULL DEFAULT 'unknown',
    user_query TEXT NOT NULL,
    response_text TEXT,
    tools_used TEXT[] DEFAULT '{}',
    response_ms INTEGER DEFAULT 0,
    success BOOLEAN DEFAULT true,
    current_module TEXT DEFAULT 'inicio'
);

-- Índices para consultas eficientes del analytics panel
CREATE INDEX IF NOT EXISTS idx_beto_interactions_created_at ON beto_interactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_beto_interactions_user ON beto_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_beto_interactions_module ON beto_interactions(current_module);

-- RLS: permitir INSERT desde la Edge Function (service role) y SELECT para usuarios autenticados
ALTER TABLE beto_interactions ENABLE ROW LEVEL SECURITY;

-- Policy: cualquier usuario autenticado puede leer las analytics
CREATE POLICY "Users can read analytics" ON beto_interactions
    FOR SELECT USING (true);

-- Policy: service role puede insertar (desde la edge function)
CREATE POLICY "Service role can insert analytics" ON beto_interactions
    FOR INSERT WITH CHECK (true);

-- #18 Beto Memory — Memoria persistente para recordar preferencias del usuario
CREATE TABLE IF NOT EXISTS beto_memory (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    user_id TEXT NOT NULL,
    memory_key TEXT NOT NULL,
    memory_value TEXT NOT NULL,
    context TEXT DEFAULT 'general',
    UNIQUE(user_id, memory_key)
);

ALTER TABLE beto_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their memory" ON beto_memory
    FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_beto_memory_user ON beto_memory(user_id);
