-- Tabla de importaciones
CREATE TABLE IF NOT EXISTS consultas_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mes TEXT NOT NULL,
  archivo TEXT,
  total_registros INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabla principal de consultas
CREATE TABLE IF NOT EXISTS consultas_guardia (
  id BIGSERIAL PRIMARY KEY,
  import_id UUID REFERENCES consultas_imports(id) ON DELETE CASCADE,
  id_visita BIGINT UNIQUE,
  id_paciente BIGINT,
  cliente TEXT,
  asistencia TEXT,
  paciente TEXT,
  nhc INT,
  nif TEXT,
  agenda TEXT,
  agrupacion_agenda TEXT,
  grupo_agenda TEXT,
  tipo_visita TEXT,
  tiempo_pred INT,
  fecha_visita DATE,
  visita_especialidad TEXT,
  mes_periodo TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_cg_fecha ON consultas_guardia(fecha_visita);
CREATE INDEX IF NOT EXISTS idx_cg_mes ON consultas_guardia(mes_periodo);
CREATE INDEX IF NOT EXISTS idx_cg_especialidad ON consultas_guardia(visita_especialidad);
CREATE INDEX IF NOT EXISTS idx_cg_cliente ON consultas_guardia(cliente);
CREATE INDEX IF NOT EXISTS idx_cg_import ON consultas_guardia(import_id);

-- RLS
ALTER TABLE consultas_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultas_guardia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consultas_imports_all" ON consultas_imports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "consultas_guardia_all" ON consultas_guardia FOR ALL USING (true) WITH CHECK (true);
