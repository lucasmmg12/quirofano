-- ==============================================================================
-- Migración 062: Tabla de Kinesiología y Terapia Respiratoria en UCI
-- Sanatorio Argentino - Sistema de Calidad y Gobernanza de Datos
-- ==============================================================================

CREATE TABLE IF NOT EXISTS calidad_uci_kinesiologia (
    id BIGSERIAL PRIMARY KEY,
    id_registro_salus BIGINT UNIQUE,
    nhc TEXT NOT NULL,
    dni TEXT,
    paciente TEXT NOT NULL,
    id_paciente_salus BIGINT,
    id_visita BIGINT,
    id_hospitalizacion BIGINT,
    fecha_hora TIMESTAMPTZ NOT NULL,
    protocolo_id INT NOT NULL,
    protocolo_nombre TEXT NOT NULL,
    grupo_nombre TEXT,
    parametro TEXT NOT NULL,
    valor_numerico NUMERIC,
    valor_texto TEXT,
    valor_combo TEXT,
    unidades TEXT,
    profesional TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices de alto rendimiento para búsqueda inmediata en dashboards
CREATE INDEX IF NOT EXISTS idx_calidad_uci_kine_nhc ON calidad_uci_kinesiologia (nhc);
CREATE INDEX IF NOT EXISTS idx_calidad_uci_kine_paciente ON calidad_uci_kinesiologia (id_paciente_salus);
CREATE INDEX IF NOT EXISTS idx_calidad_uci_kine_fecha ON calidad_uci_kinesiologia (fecha_hora DESC);
CREATE INDEX IF NOT EXISTS idx_calidad_uci_kine_proto ON calidad_uci_kinesiologia (protocolo_id);
CREATE INDEX IF NOT EXISTS idx_calidad_uci_kine_hospi ON calidad_uci_kinesiologia (id_hospitalizacion);

-- RLS
ALTER TABLE calidad_uci_kinesiologia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read on calidad_uci_kinesiologia"
    ON calidad_uci_kinesiologia
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Allow service_role all on calidad_uci_kinesiologia"
    ON calidad_uci_kinesiologia
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
