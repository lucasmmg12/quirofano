-- ============================================================
-- 040: Tabla de categorías para módulo Documentos
-- Permite al usuario crear/gestionar categorías de documentos
-- ============================================================

CREATE TABLE IF NOT EXISTS documento_categorias (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    color TEXT,
    orden INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default category
INSERT INTO documento_categorias (nombre, color, orden) 
VALUES ('General', '#6366F1', 0)
ON CONFLICT (nombre) DO NOTHING;

-- Seed existing categories from documents
INSERT INTO documento_categorias (nombre, orden)
SELECT DISTINCT categoria, ROW_NUMBER() OVER (ORDER BY categoria)
FROM documentos
WHERE categoria IS NOT NULL AND categoria != 'General'
ON CONFLICT (nombre) DO NOTHING;

-- Enable RLS
ALTER TABLE documento_categorias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documento_categorias_select" ON documento_categorias FOR SELECT USING (true);
CREATE POLICY "documento_categorias_insert" ON documento_categorias FOR INSERT WITH CHECK (true);
CREATE POLICY "documento_categorias_update" ON documento_categorias FOR UPDATE USING (true);
CREATE POLICY "documento_categorias_delete" ON documento_categorias FOR DELETE USING (true);
