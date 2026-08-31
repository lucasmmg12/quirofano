-- ============================================================
-- SISTEMA ADM-QUI — Migración 058: Proyectos de Gobernanza
-- ============================================================

CREATE TABLE IF NOT EXISTS gobernanza_proyectos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    estado TEXT DEFAULT 'Activo',
    created_by UUID REFERENCES admqui_usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gobernanza_indicadores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    proyecto_id UUID REFERENCES gobernanza_proyectos(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    informacion_buscada TEXT,
    origen_informacion TEXT,
    ciclo_datos TEXT,
    query_sql TEXT,
    explicacion_query TEXT,
    estado TEXT DEFAULT 'Borrador',
    responsable_id UUID REFERENCES admqui_usuarios(id) ON DELETE SET NULL,
    created_by UUID REFERENCES admqui_usuarios(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES admqui_usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gobernanza_documentos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    proyecto_id UUID REFERENCES gobernanza_proyectos(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    url TEXT NOT NULL,
    tipo_archivo TEXT,
    uploaded_by UUID REFERENCES admqui_usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gobernanza_actividad (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    proyecto_id UUID REFERENCES gobernanza_proyectos(id) ON DELETE CASCADE,
    usuario_id UUID REFERENCES admqui_usuarios(id) ON DELETE SET NULL,
    accion TEXT NOT NULL,
    detalles JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Modificar tabla de entrevistas
ALTER TABLE gobernanza_entrevistas ADD COLUMN IF NOT EXISTS proyecto_id UUID REFERENCES gobernanza_proyectos(id) ON DELETE CASCADE;

-- Habilitar RLS
ALTER TABLE gobernanza_proyectos ENABLE ROW LEVEL SECURITY;
ALTER TABLE gobernanza_indicadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE gobernanza_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE gobernanza_actividad ENABLE ROW LEVEL SECURITY;

-- Políticas
DROP POLICY IF EXISTS "Todos los usuarios pueden ver y editar proyectos" ON gobernanza_proyectos;
CREATE POLICY "Todos los usuarios pueden ver y editar proyectos"
    ON gobernanza_proyectos FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Todos los usuarios pueden ver y editar indicadores" ON gobernanza_indicadores;
CREATE POLICY "Todos los usuarios pueden ver y editar indicadores"
    ON gobernanza_indicadores FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Todos los usuarios pueden ver y editar documentos" ON gobernanza_documentos;
CREATE POLICY "Todos los usuarios pueden ver y editar documentos"
    ON gobernanza_documentos FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Todos los usuarios pueden ver e insertar actividad" ON gobernanza_actividad;
CREATE POLICY "Todos los usuarios pueden ver e insertar actividad"
    ON gobernanza_actividad FOR ALL USING (true) WITH CHECK (true);

-- STORAGE BUCKET: gobernanza_documentos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('gobernanza_documentos', 'gobernanza_documentos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Todos pueden ver documentos" ON storage.objects;
CREATE POLICY "Todos pueden ver documentos"
ON storage.objects FOR SELECT USING (bucket_id = 'gobernanza_documentos');

DROP POLICY IF EXISTS "Todos pueden subir documentos" ON storage.objects;
CREATE POLICY "Todos pueden subir documentos"
ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'gobernanza_documentos');

DROP POLICY IF EXISTS "Todos pueden borrar documentos" ON storage.objects;
CREATE POLICY "Todos pueden borrar documentos"
ON storage.objects FOR DELETE USING (bucket_id = 'gobernanza_documentos');
