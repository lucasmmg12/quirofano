-- Migration 053: Fix RLS permissions for activos_intervenciones and activos_equipos
-- Permite inserción, lectura y actualización para roles 'anon' y 'authenticated' en el módulo de activos

-- 1. Permisos para activos_equipos
DROP POLICY IF EXISTS "Activos Equipos select public" ON public.activos_equipos;
DROP POLICY IF EXISTS "Activos Equipos insert auth" ON public.activos_equipos;
DROP POLICY IF EXISTS "Activos Equipos update auth" ON public.activos_equipos;

CREATE POLICY "activos_equipos_all" ON public.activos_equipos FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.activos_equipos TO anon, authenticated;

-- 2. Permisos para activos_intervenciones
DROP POLICY IF EXISTS "Activos Intervenciones select public" ON public.activos_intervenciones;
DROP POLICY IF EXISTS "Activos Intervenciones insert auth" ON public.activos_intervenciones;

CREATE POLICY "activos_intervenciones_all" ON public.activos_intervenciones FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.activos_intervenciones TO anon, authenticated;

-- 3. Permisos para activos_sedes
DROP POLICY IF EXISTS "Activos Sedes select public" ON public.activos_sedes;

CREATE POLICY "activos_sedes_all" ON public.activos_sedes FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.activos_sedes TO anon, authenticated;

-- 4. Permisos para Storage Bucket 'activos_documentos'
DROP POLICY IF EXISTS "Documentos Activos public read" ON storage.objects;
DROP POLICY IF EXISTS "Documentos Activos auth insert" ON storage.objects;
DROP POLICY IF EXISTS "Documentos Activos auth update" ON storage.objects;
DROP POLICY IF EXISTS "Documentos Activos auth delete" ON storage.objects;

CREATE POLICY "Documentos Activos select all" ON storage.objects FOR SELECT USING (bucket_id = 'activos_documentos');
CREATE POLICY "Documentos Activos insert all" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'activos_documentos');
CREATE POLICY "Documentos Activos update all" ON storage.objects FOR UPDATE USING (bucket_id = 'activos_documentos') WITH CHECK (bucket_id = 'activos_documentos');
CREATE POLICY "Documentos Activos delete all" ON storage.objects FOR DELETE USING (bucket_id = 'activos_documentos');
