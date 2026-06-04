-- 038_documentos.sql
-- Tabla de metadatos para documentos centralizados + bucket de Supabase Storage

-- ═══════ TABLA DE METADATOS ═══════
CREATE TABLE IF NOT EXISTS documentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_original TEXT NOT NULL,
    nombre_storage TEXT NOT NULL,          -- key en el bucket (uuid-based)
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    categoria TEXT NOT NULL DEFAULT 'General',
    descripcion TEXT,
    subido_por TEXT NOT NULL DEFAULT 'sistema',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para búsqueda y filtrado
CREATE INDEX IF NOT EXISTS idx_documentos_categoria ON documentos (categoria);
CREATE INDEX IF NOT EXISTS idx_documentos_created_at ON documentos (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documentos_nombre ON documentos USING gin (nombre_original gin_trgm_ops);

-- RLS
ALTER TABLE documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documentos_select_anon" ON documentos
    FOR SELECT TO anon USING (true);

CREATE POLICY "documentos_insert_anon" ON documentos
    FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "documentos_update_anon" ON documentos
    FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "documentos_delete_anon" ON documentos
    FOR DELETE TO anon USING (true);

-- ═══════ BUCKET DE STORAGE ═══════
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de Storage para el bucket 'documentos'
CREATE POLICY "documentos_storage_select" ON storage.objects
    FOR SELECT TO anon
    USING (bucket_id = 'documentos');

CREATE POLICY "documentos_storage_insert" ON storage.objects
    FOR INSERT TO anon
    WITH CHECK (bucket_id = 'documentos');

CREATE POLICY "documentos_storage_delete" ON storage.objects
    FOR DELETE TO anon
    USING (bucket_id = 'documentos');
