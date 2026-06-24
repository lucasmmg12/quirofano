-- 048_add_avatars_bucket.sql
-- Add avatar_url to users and create a storage bucket for user avatars

-- 1. Add avatar_url column if it doesn't exist
ALTER TABLE public.admqui_usuarios ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Create the storage bucket 'avatars' if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
SELECT 'avatars', 'avatars', true
WHERE NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'avatars'
);

-- 3. Storage Policies for 'avatars' bucket

-- Drop existing policies just in case to be idempotent
DROP POLICY IF EXISTS "Avatares son publicos" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios pueden subir sus propios avatares" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios pueden actualizar sus propios avatares" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios pueden borrar sus propios avatares" ON storage.objects;

-- Policy: Everyone can view avatars
CREATE POLICY "Avatares son publicos"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Policy: Authenticated users can insert avatars
CREATE POLICY "Usuarios pueden subir sus propios avatares"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'avatars' 
    AND auth.role() = 'authenticated'
);

-- Policy: Authenticated users can update avatars
CREATE POLICY "Usuarios pueden actualizar sus propios avatares"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'avatars' 
    AND auth.role() = 'authenticated'
);

-- Policy: Authenticated users can delete avatars
CREATE POLICY "Usuarios pueden borrar sus propios avatares"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'avatars' 
    AND auth.role() = 'authenticated'
);
