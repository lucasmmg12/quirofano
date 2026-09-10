-- Migration 056: Tabla de Diagnósticos Clínicos y Motivos de Consulta desde SALUS
-- Almacena los diagnósticos codificados (CIE-9/10), formularios de internación y motivos clínicos

CREATE TABLE IF NOT EXISTS calidad_pacientes_diagnosticos (
    id BIGSERIAL PRIMARY KEY,
    nhc TEXT NOT NULL,
    dni TEXT,
    paciente TEXT NOT NULL,
    id_visita BIGINT NOT NULL,
    fecha_visita TIMESTAMPTZ,
    motivo TEXT,
    diagnostico TEXT NOT NULL,
    formulario TEXT,
    centro TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_paciente_visita_diag UNIQUE (id_visita, diagnostico)
);

CREATE INDEX IF NOT EXISTS idx_calidad_diag_nhc ON calidad_pacientes_diagnosticos (nhc);
CREATE INDEX IF NOT EXISTS idx_calidad_diag_dni ON calidad_pacientes_diagnosticos (dni);
CREATE INDEX IF NOT EXISTS idx_calidad_diag_paciente ON calidad_pacientes_diagnosticos (paciente);
CREATE INDEX IF NOT EXISTS idx_calidad_diag_fecha ON calidad_pacientes_diagnosticos (fecha_visita DESC);
CREATE INDEX IF NOT EXISTS idx_calidad_diag_formulario ON calidad_pacientes_diagnosticos (formulario);

-- Habilitar RLS si es necesario o dar permisos de lectura
ALTER TABLE calidad_pacientes_diagnosticos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read on calidad_pacientes_diagnosticos"
    ON calidad_pacientes_diagnosticos
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Allow service_role all on calidad_pacientes_diagnosticos"
    ON calidad_pacientes_diagnosticos
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
