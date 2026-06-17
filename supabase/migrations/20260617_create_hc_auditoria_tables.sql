/*
  # Módulo Auditoría HC por PDF - Migración Consolidada
  
  Crea las tablas necesarias para el sistema de auditoría de historias clínicas por PDF.
  Tablas prefijadas con hc_ para evitar conflictos con tablas existentes.
*/

-- ══════════════════════════════════════════════════════════════
-- 1. TABLA PRINCIPAL: hc_auditorias
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS hc_auditorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  nombre_archivo text NOT NULL,
  nombre_paciente text DEFAULT 'No encontrado',
  dni_paciente text DEFAULT 'No encontrado',
  obra_social text DEFAULT 'No encontrada',
  habitacion text DEFAULT 'No encontrada',
  fecha_ingreso timestamptz,
  fecha_alta timestamptz,
  total_errores integer DEFAULT 0,
  errores_admision integer DEFAULT 0,
  errores_evoluciones integer DEFAULT 0,
  errores_foja_quirurgica integer DEFAULT 0,
  errores_alta integer DEFAULT 0,
  errores_alta_medica integer DEFAULT 0,
  errores_epicrisis integer DEFAULT 0,
  bisturi_armonico text DEFAULT 'No determinado',
  estado text DEFAULT 'En Revisión',
  pdf_url text,
  errores_detalle jsonb DEFAULT '[]'::jsonb,
  comunicaciones jsonb DEFAULT '[]'::jsonb,
  datos_adicionales jsonb DEFAULT '{}'::jsonb,
  -- Estudios
  estudios_total integer DEFAULT 0,
  estudios_imagenes integer DEFAULT 0,
  estudios_laboratorio integer DEFAULT 0,
  estudios_procedimientos integer DEFAULT 0,
  sesiones_kinesiologia integer DEFAULT 0,
  estudios jsonb DEFAULT '[]'::jsonb,
  errores_estudios jsonb DEFAULT '[]'::jsonb
);

ALTER TABLE hc_auditorias ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (acceso público con anon key, como usa ADM-QUI)
CREATE POLICY "hc_auditorias_select" ON hc_auditorias FOR SELECT TO public USING (true);
CREATE POLICY "hc_auditorias_insert" ON hc_auditorias FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "hc_auditorias_update" ON hc_auditorias FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "hc_auditorias_delete" ON hc_auditorias FOR DELETE TO public USING (true);

-- Índices
CREATE INDEX IF NOT EXISTS idx_hc_auditorias_created_at ON hc_auditorias(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hc_auditorias_nombre_paciente ON hc_auditorias(nombre_paciente);
CREATE INDEX IF NOT EXISTS idx_hc_auditorias_dni_paciente ON hc_auditorias(dni_paciente);
CREATE INDEX IF NOT EXISTS idx_hc_auditorias_estado ON hc_auditorias(estado);
CREATE INDEX IF NOT EXISTS idx_hc_auditorias_bisturi_armonico ON hc_auditorias(bisturi_armonico);
CREATE INDEX IF NOT EXISTS idx_hc_auditorias_updated_at ON hc_auditorias(updated_at DESC);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION hc_update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_hc_auditorias_updated_at ON hc_auditorias;
CREATE TRIGGER update_hc_auditorias_updated_at
  BEFORE UPDATE ON hc_auditorias
  FOR EACH ROW
  EXECUTE FUNCTION hc_update_updated_at_column();

-- ══════════════════════════════════════════════════════════════
-- 2. TABLA: hc_medicos_foja_quirurgica
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS hc_medicos_foja_quirurgica (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auditoria_id uuid REFERENCES hc_auditorias(id) ON DELETE CASCADE,
  nombre_completo text NOT NULL,
  rol text,
  fecha_cirugia text,
  nombre_archivo text,
  paciente_dni text,
  paciente_nombre text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE hc_medicos_foja_quirurgica ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hc_medicos_select" ON hc_medicos_foja_quirurgica FOR SELECT TO public USING (true);
CREATE POLICY "hc_medicos_insert" ON hc_medicos_foja_quirurgica FOR INSERT TO public WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════
-- 3. TABLA: hc_errores_medicos
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS hc_errores_medicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auditoria_id uuid REFERENCES hc_auditorias(id) ON DELETE CASCADE,
  medico_id uuid REFERENCES hc_medicos_foja_quirurgica(id) ON DELETE CASCADE,
  nombre_medico text,
  rol_medico text,
  tipo_error text,
  descripcion text,
  severidad text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE hc_errores_medicos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hc_errores_select" ON hc_errores_medicos FOR SELECT TO public USING (true);
CREATE POLICY "hc_errores_insert" ON hc_errores_medicos FOR INSERT TO public WITH CHECK (true);
