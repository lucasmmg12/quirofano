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
-- Para lectura (todas las lecturas son públicas o permitidas para usuarios logueados, para que el QR funcione)
CREATE POLICY "Activos Sedes select public" ON activos_sedes FOR SELECT USING (true);
CREATE POLICY "Activos Equipos select public" ON activos_equipos FOR SELECT USING (true);
CREATE POLICY "Activos Intervenciones select public" ON activos_intervenciones FOR SELECT USING (true);

-- Para escritura: Solo usuarios permitidos
CREATE POLICY "Activos Equipos insert auth" ON activos_equipos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Activos Equipos update auth" ON activos_equipos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Activos Intervenciones insert auth" ON activos_intervenciones FOR INSERT TO authenticated WITH CHECK (true);

-- Insertar bucket de Storage
INSERT INTO storage.buckets (id, name, public) 
VALUES ('activos_documentos', 'activos_documentos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Documentos Activos public read" ON storage.objects FOR SELECT USING (bucket_id = 'activos_documentos');
CREATE POLICY "Documentos Activos auth insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'activos_documentos');
CREATE POLICY "Documentos Activos auth update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'activos_documentos');
CREATE POLICY "Documentos Activos auth delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'activos_documentos');
