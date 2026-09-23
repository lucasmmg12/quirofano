-- 065_create_contact_center_wallpapers_bucket.sql
-- Creación de bucket y políticas para fondos personalizados de Contact Center

-- 1. Crear el bucket si no existe
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'contact-center-wallpapers',
    'contact-center-wallpapers',
    true,
    10485760, -- 10MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET 
    public = true,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- 2. Eliminar políticas anteriores si existían
DROP POLICY IF EXISTS "Wallpapers de Contact Center son publicos" ON storage.objects;
DROP POLICY IF EXISTS "Permitir subida de wallpapers de contact center" ON storage.objects;
DROP POLICY IF EXISTS "Permitir actualizacion de wallpapers de contact center" ON storage.objects;
DROP POLICY IF EXISTS "Permitir eliminacion de wallpapers de contact center" ON storage.objects;

-- 3. Crear políticas de lectura pública y subida/gestión
CREATE POLICY "Wallpapers de Contact Center son publicos"
ON storage.objects FOR SELECT
USING (bucket_id = 'contact-center-wallpapers');

CREATE POLICY "Permitir subida de wallpapers de contact center"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'contact-center-wallpapers');

CREATE POLICY "Permitir actualizacion de wallpapers de contact center"
ON storage.objects FOR UPDATE
USING (bucket_id = 'contact-center-wallpapers');

CREATE POLICY "Permitir eliminacion de wallpapers de contact center"
ON storage.objects FOR DELETE
USING (bucket_id = 'contact-center-wallpapers');
