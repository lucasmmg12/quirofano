-- Tabla de audit log para Anatomía Patológica
-- Registra TODAS las acciones de usuarios internos y laboratorios externos

CREATE TABLE IF NOT EXISTS laboratorios_audit_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    accion TEXT NOT NULL,
    usuario TEXT NOT NULL,
    usuario_tipo TEXT NOT NULL DEFAULT 'interno',  -- 'interno' | 'laboratorio'
    id_visita TEXT,
    paciente TEXT,
    laboratorio TEXT,
    datos_antes TEXT,     -- JSON string del estado anterior
    datos_despues TEXT,   -- JSON string del estado nuevo
    detalle TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_audit_created ON laboratorios_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_usuario ON laboratorios_audit_log(usuario);
CREATE INDEX IF NOT EXISTS idx_audit_tipo ON laboratorios_audit_log(usuario_tipo);
CREATE INDEX IF NOT EXISTS idx_audit_id_visita ON laboratorios_audit_log(id_visita);
CREATE INDEX IF NOT EXISTS idx_audit_accion ON laboratorios_audit_log(accion);

-- RLS
ALTER TABLE laboratorios_audit_log ENABLE ROW LEVEL SECURITY;

-- Columna responsable_override en altas_administrativas (pendiente de sesión anterior)
ALTER TABLE altas_administrativas ADD COLUMN IF NOT EXISTS responsable_override TEXT;

-- Columna n_admision en laboratorios_anatomia_patologica (pendiente de sesión anterior)
ALTER TABLE laboratorios_anatomia_patologica ADD COLUMN IF NOT EXISTS n_admision TEXT;
