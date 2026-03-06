-- ============================================
-- 015: Add original_media_url column
-- Almacena la URL temporal original antes de
-- persistir el archivo en Supabase Storage
-- ============================================

ALTER TABLE whatsapp_messages
ADD COLUMN IF NOT EXISTS original_media_url TEXT;

-- Comentario descriptivo
COMMENT ON COLUMN whatsapp_messages.original_media_url IS 
    'URL temporal original del archivo (urlTempFile de BuilderBot). Se preserva como referencia antes de reemplazar media_url con la URL permanente de Supabase Storage.';
