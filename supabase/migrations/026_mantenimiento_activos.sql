-- Migración 026: Módulo de Gestión de Activos y Mantenimiento (CMMS)
-- Solo visible para 'lmarinero'

-- 1. Tabla de Sedes Permitidas
CREATE TABLE activos_sedes (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    activo BOOLEAN DEFAULT true
);

INSERT INTO activos_sedes (id, nombre) VALUES
('san-juan', 'San Juan'),
('san-luis', 'San Luis'),
('santa-fe', 'Santa Fe');

-- 2. Tabla de Equipos (Activos)
CREATE TABLE activos_equipos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    marca TEXT,
    modelo TEXT,
    sede_id TEXT REFERENCES activos_sedes(id),
    estado_operativo TEXT NOT NULL DEFAULT 'Operativo', -- 'Operativo', 'Fuera de Servicio', 'En Mantenimiento', 'En Calibración'
    fecha_alta DATE NOT NULL DEFAULT CURRENT_DATE,
    proximo_mantenimiento DATE,
    observaciones TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT -- el nombre o id del usuario creador
);

-- 3. Tabla de Intervenciones (Historial/Mantenimiento)
CREATE TABLE activos_intervenciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipo_id UUID REFERENCES activos_equipos(id) ON DELETE CASCADE,
    tipo_tarea TEXT NOT NULL, -- 'Preventivo', 'Correctivo', 'Alta', 'Baja', 'Auditoría'
    responsable TEXT NOT NULL,
    fecha_intervencion DATE NOT NULL DEFAULT CURRENT_DATE,
    proximo_mantenimiento DATE, -- Para alertas programadas
    estado_post TEXT NOT NULL, -- El estado en el que quedó el equipo ('Operativo', etc.)
    notas TEXT,
    doc_url TEXT, -- Referencia al storage
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT
);

-- Habilitar RLS (Seguridad)
ALTER TABLE activos_sedes ENABLE ROW LEVEL SECURITY;
ALTER TABLE activos_equipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE activos_intervenciones ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
CREATE POLICY "activos_sedes_all" ON activos_sedes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "activos_equipos_all" ON activos_equipos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "activos_intervenciones_all" ON activos_intervenciones FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON TABLE activos_sedes TO anon, authenticated;
GRANT ALL ON TABLE activos_equipos TO anon, authenticated;
GRANT ALL ON TABLE activos_intervenciones TO anon, authenticated;

-- Insertar bucket de Storage
INSERT INTO storage.buckets (id, name, public) 
VALUES ('activos_documentos', 'activos_documentos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Documentos Activos select all" ON storage.objects FOR SELECT USING (bucket_id = 'activos_documentos');
CREATE POLICY "Documentos Activos insert all" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'activos_documentos');
CREATE POLICY "Documentos Activos update all" ON storage.objects FOR UPDATE USING (bucket_id = 'activos_documentos') WITH CHECK (bucket_id = 'activos_documentos');
CREATE POLICY "Documentos Activos delete all" ON storage.objects FOR DELETE USING (bucket_id = 'activos_documentos');
