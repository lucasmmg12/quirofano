-- =============================================
-- Marcar line_b como línea Meta WhatsApp Business API
-- El número 9077 está vinculado a Meta API y requiere
-- plantillas para iniciar conversaciones > 24h
-- Sistema ADM-QUI — Mayo 2026
-- =============================================

-- line_b (9077) es una línea Meta API → debe tener is_meta = true
-- para que el sistema bloquee texto libre cuando la ventana de 24h expire
UPDATE whatsapp_lines 
SET is_meta = true 
WHERE id = 'line_b';

-- Verificar
SELECT id, label, phone, is_meta, is_active 
FROM whatsapp_lines 
WHERE id IN ('line_a', 'line_b', 'line_c', 'line_meta')
ORDER BY id;
