-- Migración: Tabla para recibidas diarias de consultas de guardia
-- Permite registrar manualmente cuántas consultas se recibieron por día y categoría de OS

CREATE TABLE IF NOT EXISTS consultas_guardia_recibidas_diarias (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mes_periodo text NOT NULL,
    fecha date NOT NULL,
    os_categoria text NOT NULL CHECK (os_categoria IN ('OSP', 'Prepagas', 'Particulares')),
    recibidas integer NOT NULL DEFAULT 0,
    updated_at timestamptz DEFAULT now(),
    UNIQUE(fecha, os_categoria)
);

-- RLS
ALTER TABLE consultas_guardia_recibidas_diarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_consultas_recibidas_diarias"
ON consultas_guardia_recibidas_diarias
FOR ALL
USING (true)
WITH CHECK (true);

-- Index for fast lookups by month
CREATE INDEX IF NOT EXISTS idx_recibidas_diarias_mes ON consultas_guardia_recibidas_diarias(mes_periodo);

COMMENT ON TABLE consultas_guardia_recibidas_diarias IS 'Registro manual de consultas de guardia recibidas por día y categoría de obra social (OSP/Prepagas/Particulares)';
