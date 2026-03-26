-- ============================================================
-- 029: Sistema de Gestión de Deudas
-- Tablas para pacientes deudores y sus facturas pendientes
-- Importación periódica desde Excel (SALUS), match por NHC
-- ============================================================

-- 1. Tabla de pacientes deudores (1 fila por NHC)
CREATE TABLE IF NOT EXISTS deudas_pacientes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    nhc text UNIQUE NOT NULL,                        -- Nro Historia Clínica (clave de match)
    nombre text NOT NULL,                              -- Nombre del paciente/cliente
    telefono text,                                     -- Formato: 5492645438114 (se persiste entre imports)
    telefono_invalido BOOLEAN DEFAULT false,
    categoria text NOT NULL DEFAULT 'sin_gestionar'
        CHECK (categoria IN ('sin_gestionar', 'en_gestion', 'comprometido', 'incobrable')),
    deuda_total numeric(14,2) NOT NULL DEFAULT 0,      -- Suma de todas las facturas pendientes
    cantidad_facturas int NOT NULL DEFAULT 0,          -- Cantidad de facturas activas
    notas text,                                        -- Notas internas de seguimiento
    ultimo_contacto_at timestamptz,                    -- Cuándo se envió el último mensaje
    ultimo_contacto_por text,                          -- Quién envió el último mensaje
    ultima_respuesta_at timestamptz,                   -- Cuándo respondió por última vez el paciente
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deudas_pacientes_nhc ON deudas_pacientes(nhc);
CREATE INDEX IF NOT EXISTS idx_deudas_pacientes_categoria ON deudas_pacientes(categoria);
CREATE INDEX IF NOT EXISTS idx_deudas_pacientes_deuda ON deudas_pacientes(deuda_total DESC);
CREATE INDEX IF NOT EXISTS idx_deudas_pacientes_telefono ON deudas_pacientes(telefono);

-- 2. Tabla de facturas individuales (1 fila por Código de factura)
CREATE TABLE IF NOT EXISTS deudas_facturas (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    paciente_id uuid NOT NULL REFERENCES deudas_pacientes(id) ON DELETE CASCADE,
    codigo text NOT NULL,                              -- Código interno SALUS
    documento text,                                    -- Nro de documento/factura
    folio text,                                        -- Folio
    total numeric(14,2) NOT NULL DEFAULT 0,            -- Monto total de la factura
    cobrado numeric(14,2) NOT NULL DEFAULT 0,          -- Monto ya cobrado
    pendiente numeric(14,2) NOT NULL DEFAULT 0,        -- Saldo pendiente
    fecha_factura timestamptz,                         -- Fecha serial de Excel convertida
    responsable text,                                  -- Médico/responsable
    servicio text,                                     -- Servicio prestado
    tipo_hospitalizacion text,                         -- Tipo de internación
    n_admision text,                                   -- Nro de admisión
    fecha_hospitalizacion text,                        -- Fecha de internación (texto original)
    usuario_creacion text,                             -- Quien cargó en SALUS
    forma_pago text,                                   -- Forma de pago
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(codigo)                                     -- Evitar duplicados por código
);

CREATE INDEX IF NOT EXISTS idx_deudas_facturas_paciente ON deudas_facturas(paciente_id);
CREATE INDEX IF NOT EXISTS idx_deudas_facturas_codigo ON deudas_facturas(codigo);
CREATE INDEX IF NOT EXISTS idx_deudas_facturas_pendiente ON deudas_facturas(pendiente DESC);

-- 3. Tabla de seguimiento / timeline de gestión
CREATE TABLE IF NOT EXISTS deudas_seguimiento (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    paciente_id uuid NOT NULL REFERENCES deudas_pacientes(id) ON DELETE CASCADE,
    tipo text NOT NULL CHECK (tipo IN ('nota', 'llamada', 'whatsapp', 'pago', 'compromiso', 'cambio_categoria')),
    descripcion text NOT NULL,
    monto numeric(14,2),                               -- Si es un pago, cuánto
    usuario text NOT NULL,                             -- Quién hizo la acción
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deudas_seguimiento_paciente ON deudas_seguimiento(paciente_id);
CREATE INDEX IF NOT EXISTS idx_deudas_seguimiento_fecha ON deudas_seguimiento(created_at DESC);

-- 4. Tabla de importaciones (historial de uploads)
CREATE TABLE IF NOT EXISTS deudas_importaciones (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    archivo_nombre text NOT NULL,
    total_filas int NOT NULL DEFAULT 0,
    filas_importadas int NOT NULL DEFAULT 0,
    filas_ignoradas int NOT NULL DEFAULT 0,
    pacientes_nuevos int NOT NULL DEFAULT 0,
    pacientes_actualizados int NOT NULL DEFAULT 0,
    usuario text NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- 5. RLS Policies (anon-based como el resto del sistema)
ALTER TABLE deudas_pacientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE deudas_facturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE deudas_seguimiento ENABLE ROW LEVEL SECURITY;
ALTER TABLE deudas_importaciones ENABLE ROW LEVEL SECURITY;

-- Pacientes: lectura y escritura para todos
CREATE POLICY "deudas_pacientes_all" ON deudas_pacientes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "deudas_facturas_all" ON deudas_facturas FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "deudas_seguimiento_all" ON deudas_seguimiento FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "deudas_importaciones_all" ON deudas_importaciones FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- GRANT permisos para anon
GRANT ALL ON deudas_pacientes TO anon, authenticated;
GRANT ALL ON deudas_facturas TO anon, authenticated;
GRANT ALL ON deudas_seguimiento TO anon, authenticated;
GRANT ALL ON deudas_importaciones TO anon, authenticated;
