-- =============================================
-- 008: App Configuration (Key/Value Store)
-- =============================================

CREATE TABLE IF NOT EXISTS app_config (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    label       TEXT,                          -- Etiqueta legible (para UI)
    category    TEXT DEFAULT 'general',        -- Categoría: 'whatsapp', 'general', etc.
    is_secret   BOOLEAN DEFAULT FALSE,         -- Si es un dato sensible (se muestra enmascarado)
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_by  TEXT
);

-- Índice por categoría
CREATE INDEX IF NOT EXISTS idx_app_config_category ON app_config(category);

-- Valores iniciales (se configuran desde el panel de Configuración)
INSERT INTO app_config (key, value, label, category, is_secret) VALUES
    ('builderbot_api_key', 'configurar-desde-panel', 'API Key de BuilderBot', 'whatsapp', TRUE),
    ('builderbot_project_id', 'configurar-desde-panel', 'Project ID de BuilderBot', 'whatsapp', FALSE),
    ('whatsapp_phone', '5492645438114', 'Número de WhatsApp del Sanatorio', 'whatsapp', FALSE),
    ('area_code', '264', 'Código de área predeterminado', 'whatsapp', FALSE),
    ('clinic_name', 'Sanatorio Argentino', 'Nombre del Sanatorio', 'general', FALSE),
    ('webhook_url', 'https://hakysnqiryimxbwdslwe.supabase.co/functions/v1/whatsapp-webhook', 'URL del Webhook (solo lectura)', 'whatsapp', FALSE)
ON CONFLICT (key) DO NOTHING;

-- RLS: permitir lectura y escritura
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_app_config" ON app_config
    FOR ALL USING (true) WITH CHECK (true);
