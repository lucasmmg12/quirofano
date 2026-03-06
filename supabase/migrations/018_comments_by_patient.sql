-- ============================================================
-- 018: Vincular comments y events por id_paciente
-- Los comentarios y eventos ahora sobreviven a re-importaciones
-- de Excel porque se vinculan por id_paciente (inmutable) en
-- vez de surgery_id (UUID que puede cambiar)
-- ============================================================

-- =========================================
-- 1. SURGERY_COMMENTS: agregar id_paciente
-- =========================================

ALTER TABLE surgery_comments 
ADD COLUMN IF NOT EXISTS id_paciente TEXT;

-- Poblar id_paciente desde los registros existentes
UPDATE surgery_comments sc
SET id_paciente = s.id_paciente
FROM surgeries s
WHERE sc.surgery_id = s.id
  AND sc.id_paciente IS NULL;

-- Índice para búsqueda por id_paciente
CREATE INDEX IF NOT EXISTS idx_surgery_comments_paciente 
ON surgery_comments(id_paciente);

-- Reemplazar la FK CASCADE por SET NULL
-- Con SET NULL: al borrar una cirugía, el surgery_id se vuelve NULL
-- pero el comentario SOBREVIVE (vinculado por id_paciente)
-- PostgREST necesita la FK para los JOINs embebidos .select('*, surgery_events(*)')
ALTER TABLE surgery_comments ALTER COLUMN surgery_id DROP NOT NULL;
ALTER TABLE surgery_comments DROP CONSTRAINT IF EXISTS surgery_comments_surgery_id_fkey;
ALTER TABLE surgery_comments ADD CONSTRAINT surgery_comments_surgery_id_fkey 
    FOREIGN KEY (surgery_id) REFERENCES surgeries(id) ON DELETE SET NULL;

-- =========================================
-- 2. SURGERY_EVENTS: agregar id_paciente
-- =========================================

ALTER TABLE surgery_events 
ADD COLUMN IF NOT EXISTS id_paciente TEXT;

-- Poblar id_paciente desde los registros existentes
UPDATE surgery_events se
SET id_paciente = s.id_paciente
FROM surgeries s
WHERE se.surgery_id = s.id
  AND se.id_paciente IS NULL;

-- Índice para búsqueda por id_paciente  
CREATE INDEX IF NOT EXISTS idx_surgery_events_paciente 
ON surgery_events(id_paciente);

-- Reemplazar la FK CASCADE por SET NULL (misma lógica que comments)
ALTER TABLE surgery_events ALTER COLUMN surgery_id DROP NOT NULL;
ALTER TABLE surgery_events DROP CONSTRAINT IF EXISTS surgery_events_surgery_id_fkey;
ALTER TABLE surgery_events ADD CONSTRAINT surgery_events_surgery_id_fkey 
    FOREIGN KEY (surgery_id) REFERENCES surgeries(id) ON DELETE SET NULL;

-- =========================================
-- 3. RLS: Permitir acceso anon a surgery_events (para RecepcionView)
-- =========================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'surgery_events' 
        AND policyname = 'Allow select for anon events'
    ) THEN
        CREATE POLICY "Allow select for anon events"
        ON surgery_events
        FOR SELECT
        TO anon
        USING (true);
    END IF;
END $$;
