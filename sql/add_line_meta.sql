-- =============================================
-- Agregar línea Meta WhatsApp Business API
-- Sistema ADM-QUI — Mayo 2026
-- =============================================

-- 1. Agregar columna is_meta si no existe
ALTER TABLE whatsapp_lines ADD COLUMN IF NOT EXISTS is_meta boolean DEFAULT false;

-- 2. Insertar la línea Meta con credenciales BuilderBot
INSERT INTO whatsapp_lines (id, label, phone, api_key, project_id, is_active, color, icon, is_meta)
VALUES (
  'line_meta',
  'Meta Business',
  '264809077',
  '2bf4fc78-5564-4b9c-9d7b-26e328db06c7',
  'bb-7d60ff9c-e467-4b0f-b95e-a1f056918cc0',
  true,
  '#25D366',
  'shield',
  true
)
ON CONFLICT (id) DO UPDATE SET
  api_key = EXCLUDED.api_key,
  project_id = EXCLUDED.project_id,
  is_meta = EXCLUDED.is_meta,
  is_active = true;

-- 3. Asegurar que las demás líneas NO sean Meta
UPDATE whatsapp_lines SET is_meta = false WHERE id != 'line_meta' AND is_meta IS NULL;
