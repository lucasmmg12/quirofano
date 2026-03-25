-- ============================================================
-- Migración 027: Campos extras + Políticas RLS para anon
-- El sistema ADM-QUI NO usa Supabase Auth (usa RPC custom),
-- por lo que el rol siempre es "anon". Todas las políticas
-- deben incluir anon para que funcionen.
-- ============================================================

-- Agregar columnas faltantes
ALTER TABLE turnos_cola ADD COLUMN IF NOT EXISTS atendido_por TEXT;
ALTER TABLE turnos_cola ADD COLUMN IF NOT EXISTS nombre_paciente TEXT;
ALTER TABLE turnos_cola ADD COLUMN IF NOT EXISTS motivo_cancelacion TEXT;
ALTER TABLE turnos_cola ADD COLUMN IF NOT EXISTS cancelado_por TEXT;

-- ═══ ARREGLAR POLÍTICAS: anon necesita UPDATE e INSERT en todo ═══

-- turnos_cola: anon necesita UPDATE (el admin opera como anon)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'turnos_cola_update_anon' AND tablename = 'turnos_cola') THEN
    CREATE POLICY "turnos_cola_update_anon" ON turnos_cola
        FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- turnos_atencion: anon necesita INSERT, SELECT y UPDATE
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'turnos_atencion_all_anon' AND tablename = 'turnos_atencion') THEN
    CREATE POLICY "turnos_atencion_all_anon" ON turnos_atencion
        FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- GRANT permisos de tabla
GRANT SELECT, INSERT, UPDATE ON turnos_cola TO anon;
GRANT SELECT, INSERT, UPDATE ON turnos_atencion TO anon;
GRANT SELECT ON turnos_config TO anon;
GRANT SELECT, INSERT, UPDATE ON turnos_contador TO anon;
