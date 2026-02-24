-- Tabla de comentarios internos de cirugía
-- Seguimiento de pacientes sin envío de WhatsApp

CREATE TABLE IF NOT EXISTS surgery_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    surgery_id UUID NOT NULL REFERENCES surgeries(id) ON DELETE CASCADE,
    user_name TEXT NOT NULL,
    comment TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para búsqueda rápida por cirugía
CREATE INDEX IF NOT EXISTS idx_surgery_comments_surgery ON surgery_comments(surgery_id);

-- RLS: habilitar para acceso autenticado
ALTER TABLE surgery_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated users"
ON surgery_comments
FOR ALL
USING (true)
WITH CHECK (true);
