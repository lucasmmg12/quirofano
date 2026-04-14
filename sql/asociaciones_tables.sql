-- ═══════════════════════════════════════════════════
-- Módulo: Entrega Asociaciones
-- Tablas para gestión de entrega de documentación
-- quirúrgica a las asociaciones médicas
-- ═══════════════════════════════════════════════════

-- Tabla de constancias de entrega (primero por FK)
CREATE TABLE IF NOT EXISTS asociaciones_constancias (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    codigo TEXT UNIQUE NOT NULL,              -- ENT-2026-0001
    asociacion TEXT NOT NULL,
    fecha_entrega TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responsable_entrega TEXT NOT NULL,         -- Carlos (configurable)
    nombre_cadete TEXT,                        -- Quien retira
    cantidad_expedientes INTEGER NOT NULL DEFAULT 0,
    notas TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de cirugías sincronizadas para entrega
CREATE TABLE IF NOT EXISTS asociaciones_cirugias (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    fecha_realizacion DATE NOT NULL,
    nombre_paciente TEXT NOT NULL,
    cliente TEXT,                              -- Obra social
    dni TEXT,
    especialidad TEXT NOT NULL,
    nombre_cirugia TEXT,
    estado TEXT,                               -- Presente / NO PROGRAMADA / URGENCIA
    cirujano TEXT,
    asociacion TEXT NOT NULL,                  -- Mapeado desde especialidad
    docs_completos BOOLEAN DEFAULT FALSE,
    en_carrito BOOLEAN DEFAULT FALSE,
    constancia_id UUID REFERENCES asociaciones_constancias(id),
    operador TEXT,                             -- Quién marcó el check
    checked_at TIMESTAMPTZ,
    entregado_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Dedup: misma cirugía no se puede repetir
    UNIQUE(fecha_realizacion, dni, nombre_cirugia)
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_asoc_cirug_asociacion ON asociaciones_cirugias(asociacion);
CREATE INDEX IF NOT EXISTS idx_asoc_cirug_docs ON asociaciones_cirugias(docs_completos, en_carrito);
CREATE INDEX IF NOT EXISTS idx_asoc_cirug_fecha ON asociaciones_cirugias(fecha_realizacion);
CREATE INDEX IF NOT EXISTS idx_asoc_cirug_constancia ON asociaciones_cirugias(constancia_id);
CREATE INDEX IF NOT EXISTS idx_asoc_const_codigo ON asociaciones_constancias(codigo);
CREATE INDEX IF NOT EXISTS idx_asoc_const_asociacion ON asociaciones_constancias(asociacion);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_asociaciones_cirugias_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_asociaciones_cirugias_updated ON asociaciones_cirugias;
CREATE TRIGGER trg_asociaciones_cirugias_updated
    BEFORE UPDATE ON asociaciones_cirugias
    FOR EACH ROW
    EXECUTE FUNCTION update_asociaciones_cirugias_updated_at();
