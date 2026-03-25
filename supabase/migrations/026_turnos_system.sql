-- ============================================================
-- 026: Sistema de Turnos / Cola de Atención
-- ============================================================

-- 1. Configuración de tipos de trámite
CREATE TABLE IF NOT EXISTS turnos_config (
    id serial PRIMARY KEY,
    tipo_tramite text UNIQUE NOT NULL,
    label text NOT NULL,
    prefijo char(1) NOT NULL,
    box_default int NOT NULL DEFAULT 1,
    color text NOT NULL DEFAULT '#3B82F6',
    icono text NOT NULL DEFAULT 'HelpCircle',
    activo boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- Seed: 4 tipos de trámite
INSERT INTO turnos_config (tipo_tramite, label, prefijo, box_default, color, icono) VALUES
    ('presupuestos', 'Presupuestos', 'P', 1, '#3B82F6', 'FileText'),
    ('reintegros', 'Reintegros', 'R', 2, '#8B5CF6', 'Receipt'),
    ('biopsias', 'Resultados de Biopsias', 'B', 3, '#10B981', 'Microscope'),
    ('otras', 'Otras Consultas', 'O', 4, '#F59E0B', 'HelpCircle')
ON CONFLICT (tipo_tramite) DO NOTHING;

-- 2. Cola de turnos
CREATE TABLE IF NOT EXISTS turnos_cola (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    numero_turno text NOT NULL,
    tipo_tramite text NOT NULL REFERENCES turnos_config(tipo_tramite),
    dni text,
    nombre_paciente text,
    box_asignado int NOT NULL DEFAULT 1,
    estado text NOT NULL DEFAULT 'esperando'
        CHECK (estado IN ('esperando', 'llamando', 'en_atencion', 'atendido', 'cancelado')),
    created_at timestamptz DEFAULT now(),
    llamado_at timestamptz,
    finalizado_at timestamptz
);

-- Índices para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_turnos_cola_estado ON turnos_cola(estado);
CREATE INDEX IF NOT EXISTS idx_turnos_cola_fecha ON turnos_cola(created_at);
CREATE INDEX IF NOT EXISTS idx_turnos_cola_tipo ON turnos_cola(tipo_tramite);
CREATE INDEX IF NOT EXISTS idx_turnos_cola_box ON turnos_cola(box_asignado);

-- 3. Registro de atención (métricas)
CREATE TABLE IF NOT EXISTS turnos_atencion (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    turno_id uuid NOT NULL REFERENCES turnos_cola(id) ON DELETE CASCADE,
    empleado_id uuid,
    empleado_nombre text NOT NULL,
    box_numero int NOT NULL,
    hora_llamado timestamptz NOT NULL DEFAULT now(),
    hora_inicio timestamptz,
    hora_fin timestamptz,
    notas text,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_turnos_atencion_turno ON turnos_atencion(turno_id);
CREATE INDEX IF NOT EXISTS idx_turnos_atencion_empleado ON turnos_atencion(empleado_nombre);
CREATE INDEX IF NOT EXISTS idx_turnos_atencion_fecha ON turnos_atencion(created_at);

-- 4. Contador diario para números de turno secuenciales
CREATE TABLE IF NOT EXISTS turnos_contador (
    fecha date NOT NULL DEFAULT CURRENT_DATE,
    tipo_tramite text NOT NULL REFERENCES turnos_config(tipo_tramite),
    ultimo_numero int NOT NULL DEFAULT 0,
    PRIMARY KEY (fecha, tipo_tramite)
);

-- Función para obtener el próximo número de turno
CREATE OR REPLACE FUNCTION next_turno_number(p_tipo text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    v_prefijo char(1);
    v_numero int;
BEGIN
    -- Obtener prefijo
    SELECT prefijo INTO v_prefijo FROM turnos_config WHERE tipo_tramite = p_tipo;
    IF v_prefijo IS NULL THEN
        RAISE EXCEPTION 'Tipo de trámite no encontrado: %', p_tipo;
    END IF;

    -- Incrementar contador atómicamente (upsert)
    INSERT INTO turnos_contador (fecha, tipo_tramite, ultimo_numero)
    VALUES (CURRENT_DATE, p_tipo, 1)
    ON CONFLICT (fecha, tipo_tramite)
    DO UPDATE SET ultimo_numero = turnos_contador.ultimo_numero + 1
    RETURNING ultimo_numero INTO v_numero;

    -- Retornar formatted: P001, B012, etc.
    RETURN v_prefijo || lpad(v_numero::text, 3, '0');
END;
$$;

-- 5. RLS Policies
ALTER TABLE turnos_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE turnos_cola ENABLE ROW LEVEL SECURITY;
ALTER TABLE turnos_atencion ENABLE ROW LEVEL SECURITY;
ALTER TABLE turnos_contador ENABLE ROW LEVEL SECURITY;

-- Config: todos leen
CREATE POLICY "turnos_config_read" ON turnos_config FOR SELECT TO anon, authenticated USING (true);

-- Cola: anon puede insertar (kiosco), todos leen, authenticated actualiza
CREATE POLICY "turnos_cola_read" ON turnos_cola FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "turnos_cola_insert_anon" ON turnos_cola FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "turnos_cola_insert_auth" ON turnos_cola FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "turnos_cola_update" ON turnos_cola FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Atención: solo authenticated
CREATE POLICY "turnos_atencion_read" ON turnos_atencion FOR SELECT TO authenticated USING (true);
CREATE POLICY "turnos_atencion_insert" ON turnos_atencion FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "turnos_atencion_update" ON turnos_atencion FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Contador: anon puede insertar/actualizar (el kiosco necesita generar números)
CREATE POLICY "turnos_contador_read" ON turnos_contador FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "turnos_contador_upsert_anon" ON turnos_contador FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "turnos_contador_update_anon" ON turnos_contador FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "turnos_contador_upsert_auth" ON turnos_contador FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "turnos_contador_update_auth" ON turnos_contador FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Permisos para ejecutar la función
GRANT EXECUTE ON FUNCTION next_turno_number(text) TO anon, authenticated;
-- Permisos de tabla para anon (kiosco)
GRANT SELECT ON turnos_config TO anon;
GRANT SELECT, INSERT ON turnos_cola TO anon;
GRANT SELECT, INSERT, UPDATE ON turnos_contador TO anon;
-- Secuencias
GRANT USAGE, SELECT ON SEQUENCE turnos_config_id_seq TO anon, authenticated;

-- Habilitar Realtime para la cola
ALTER PUBLICATION supabase_realtime ADD TABLE turnos_cola;
