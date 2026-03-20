-- =============================================
-- 025: Add WhatsApp Line C
-- Fecha: 2026-03-20
-- Tercera línea WhatsApp configurable desde ConfigPanel
-- =============================================

-- Insertar línea C (credenciales se configuran desde ConfigPanel)
INSERT INTO whatsapp_lines (id, label, phone, api_key, project_id, color, icon) VALUES
    ('line_c', 'WhatsApp Línea C', 'configurar-desde-panel', 'configurar-desde-panel', 'configurar-desde-panel', '#E11D48', 'phone')
ON CONFLICT (id) DO NOTHING;
