-- ============================================================
-- SISTEMA ADM-QUI — Migración 055: Gobernanza de Datos
-- ============================================================
-- Almacena plantillas de cuestionarios y las entrevistas 
-- generadas por la app móvil nativa de Gobernanza.
-- ============================================================

CREATE TABLE IF NOT EXISTS gobernanza_plantillas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre TEXT NOT NULL, -- ej: "Entrevista de Sector X"
    preguntas JSONB DEFAULT '[]'::jsonb, -- Array de strings con las preguntas
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar algunas plantillas de ejemplo
INSERT INTO gobernanza_plantillas (nombre, preguntas) VALUES 
('Entrevista Seguridad Informática', '["¿Cómo manejan los respaldos de datos?", "¿Quién tiene acceso físico a los servidores?", "¿Cada cuánto actualizan contraseñas?"]'::jsonb),
('Entrevista RRHH', '["¿Cómo es el proceso de onboarding digital?", "¿Dónde se guardan los contratos PDF?", "¿Tienen firma digital?"]'::jsonb);

CREATE TABLE IF NOT EXISTS gobernanza_entrevistas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    usuario_id UUID REFERENCES admqui_usuarios(id) ON DELETE SET NULL,
    plantilla_id UUID REFERENCES gobernanza_plantillas(id) ON DELETE SET NULL,
    titulo TEXT DEFAULT 'Nueva Entrevista',
    audio_url TEXT,
    duracion_segundos INTEGER,
    transcripcion TEXT,
    resumen TEXT,
    diapositivas_markdown TEXT,
    mapa_conceptual_mermaid TEXT,
    respuestas_cuestionario JSONB,
    estado TEXT DEFAULT 'grabando', -- 'grabando', 'procesando', 'completado', 'error'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE gobernanza_plantillas ENABLE ROW LEVEL SECURITY;
ALTER TABLE gobernanza_entrevistas ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso
DROP POLICY IF EXISTS "Todos pueden ver plantillas" ON gobernanza_plantillas;
CREATE POLICY "Todos pueden ver plantillas"
    ON gobernanza_plantillas FOR SELECT USING (true);

DROP POLICY IF EXISTS "Los usuarios pueden ver y editar sus propias entrevistas" ON gobernanza_entrevistas;
CREATE POLICY "Los usuarios pueden ver y editar sus propias entrevistas"
    ON gobernanza_entrevistas
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- STORAGE BUCKET: gobernanza_audios
-- ============================================================
INSERT INTO storage.buckets (id, name, public) 
VALUES ('gobernanza_audios', 'gobernanza_audios', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas para el bucket
DROP POLICY IF EXISTS "Todos los usuarios autenticados pueden ver audios" ON storage.objects;
CREATE POLICY "Todos los usuarios autenticados pueden ver audios"
ON storage.objects FOR SELECT USING (bucket_id = 'gobernanza_audios');

DROP POLICY IF EXISTS "Todos los usuarios autenticados pueden subir audios" ON storage.objects;
CREATE POLICY "Todos los usuarios autenticados pueden subir audios"
ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'gobernanza_audios');

DROP POLICY IF EXISTS "Todos los usuarios autenticados pueden actualizar audios" ON storage.objects;
CREATE POLICY "Todos los usuarios autenticados pueden actualizar audios"
ON storage.objects FOR UPDATE USING (bucket_id = 'gobernanza_audios');

DROP POLICY IF EXISTS "Todos los usuarios autenticados pueden eliminar audios" ON storage.objects;
CREATE POLICY "Todos los usuarios autenticados pueden eliminar audios"
ON storage.objects FOR DELETE USING (bucket_id = 'gobernanza_audios');
