-- ============================================================
-- Migración 027: Agregar campo atendido_por a turnos_cola
-- Registra qué usuario atendió cada turno
-- ============================================================

ALTER TABLE turnos_cola ADD COLUMN IF NOT EXISTS atendido_por TEXT;

-- Permitir lectura de turnos_cola para anon (el kiosco necesita ver counts)
CREATE POLICY IF NOT EXISTS "turnos_cola_select_anon" ON turnos_cola 
    FOR SELECT TO anon USING (true);

CREATE POLICY IF NOT EXISTS "turnos_cola_select_auth" ON turnos_cola 
    FOR SELECT TO authenticated USING (true);

CREATE POLICY IF NOT EXISTS "turnos_atencion_select" ON turnos_atencion 
    FOR SELECT TO authenticated USING (true);

CREATE POLICY IF NOT EXISTS "turnos_config_select" ON turnos_config 
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY IF NOT EXISTS "turnos_contador_select" ON turnos_contador 
    FOR SELECT TO anon, authenticated USING (true);
