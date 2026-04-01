-- =============================================
-- 032: Control de Altas Administrativas
-- =============================================
-- Tabla para almacenar el estado de altas administrativas
-- sincronizadas desde SALUS (TABLEAU_Admisiones)

CREATE TABLE IF NOT EXISTS altas_administrativas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Datos de SALUS
    numero_admision TEXT,
    id_paciente TEXT,
    paciente TEXT NOT NULL,
    cliente TEXT,                       -- Obra social / cliente
    especialidad TEXT,
    proceso TEXT,                       -- Tipo de proceso (ej: Hospitalización)
    doctor TEXT,
    motivo_alta TEXT,                   -- Motivo/causa del alta
    control_adm_finalizado TEXT,        -- ¿Control ADM finalizado? (Sí/No)
    observaciones TEXT,                 -- Campo extenso de observaciones del checklist
    fecha_ingreso DATE,
    fecha_alta DATE,
    
    -- Estado del control administrativo
    -- Valores: 'Procesada', 'En auditoria', 'Prórroga', 'Con presupuesto', 
    --          'Alta Adm', 'Suspendida', 'Particular', 'Interconsulta'
    estado TEXT DEFAULT 'Procesada',
    
    -- Metadata
    operador TEXT,                      -- Quién realizó el último cambio
    notas_internas TEXT,                -- Notas del operador
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Constraint de unicidad para upsert (un registro por admisión)
    UNIQUE(numero_admision)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_altas_adm_fecha_alta ON altas_administrativas(fecha_alta DESC);
CREATE INDEX IF NOT EXISTS idx_altas_adm_estado ON altas_administrativas(estado);
CREATE INDEX IF NOT EXISTS idx_altas_adm_paciente ON altas_administrativas(paciente);

-- RLS
ALTER TABLE altas_administrativas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "altas_adm_full_access" ON altas_administrativas
    FOR ALL USING (true) WITH CHECK (true);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_altas_adm_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_altas_adm_updated
    BEFORE UPDATE ON altas_administrativas
    FOR EACH ROW
    EXECUTE FUNCTION update_altas_adm_timestamp();
