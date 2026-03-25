-- ============================================================
-- Migración 027: Agregar campo atendido_por a turnos_cola
-- Registra qué usuario atendió cada turno
-- ============================================================

ALTER TABLE turnos_cola ADD COLUMN IF NOT EXISTS atendido_por TEXT;
ALTER TABLE turnos_cola ADD COLUMN IF NOT EXISTS nombre_paciente TEXT;

-- Políticas SELECT (DROP IF EXISTS + CREATE)
DO $$ BEGIN
  -- turnos_cola: anon
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'turnos_cola_select_anon' AND tablename = 'turnos_cola') THEN
    DROP POLICY "turnos_cola_select_anon" ON turnos_cola;
  END IF;
  -- turnos_cola: auth
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'turnos_cola_select_auth' AND tablename = 'turnos_cola') THEN
    DROP POLICY "turnos_cola_select_auth" ON turnos_cola;
  END IF;
  -- turnos_atencion
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'turnos_atencion_select' AND tablename = 'turnos_atencion') THEN
    DROP POLICY "turnos_atencion_select" ON turnos_atencion;
  END IF;
  -- turnos_config
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'turnos_config_select' AND tablename = 'turnos_config') THEN
    DROP POLICY "turnos_config_select" ON turnos_config;
  END IF;
  -- turnos_contador
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'turnos_contador_select' AND tablename = 'turnos_contador') THEN
    DROP POLICY "turnos_contador_select" ON turnos_contador;
  END IF;
END $$;

CREATE POLICY "turnos_cola_select_anon" ON turnos_cola
    FOR SELECT TO anon USING (true);

CREATE POLICY "turnos_cola_select_auth" ON turnos_cola
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "turnos_atencion_select" ON turnos_atencion
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "turnos_config_select" ON turnos_config
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "turnos_contador_select" ON turnos_contador
    FOR SELECT TO anon, authenticated USING (true);
