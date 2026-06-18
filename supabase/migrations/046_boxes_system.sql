-- ============================================================
-- 046: Sistema de Gestión de Boxes para Cola de Turnos
-- 4 boxes físicos, asignación a usuario, horarios de bloqueo
-- ============================================================

-- 1. Tabla principal de boxes
CREATE TABLE IF NOT EXISTS turnos_boxes (
    id serial PRIMARY KEY,
    numero int NOT NULL UNIQUE,
    usuario_id uuid REFERENCES admqui_usuarios(id) ON DELETE SET NULL,
    usuario_nombre text,
    activo boolean NOT NULL DEFAULT false,
    updated_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now()
);

-- Seed: 4 boxes sin usuario, apagados por defecto
INSERT INTO turnos_boxes (numero, activo) VALUES
    (1, false),
    (2, false),
    (3, false),
    (4, false)
ON CONFLICT (numero) DO NOTHING;

-- 2. Horarios de no-atención por box
CREATE TABLE IF NOT EXISTS turnos_boxes_horarios (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    box_id int NOT NULL REFERENCES turnos_boxes(id) ON DELETE CASCADE,
    dia_semana int CHECK (dia_semana IS NULL OR (dia_semana >= 0 AND dia_semana <= 6)),
    hora_inicio time NOT NULL,
    hora_fin time NOT NULL,
    motivo text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT horario_valido CHECK (hora_inicio < hora_fin)
);

CREATE INDEX IF NOT EXISTS idx_boxes_horarios_box ON turnos_boxes_horarios(box_id);

-- 3. Horario global fuera de servicio (20:00 - 07:00) para todos los boxes
-- Se implementa como bloqueo en todos los boxes, todos los días
INSERT INTO turnos_boxes_horarios (box_id, dia_semana, hora_inicio, hora_fin, motivo)
SELECT b.id, NULL, '20:00'::time, '23:59'::time, 'Fuera de horario (noche)'
FROM turnos_boxes b
ON CONFLICT DO NOTHING;

INSERT INTO turnos_boxes_horarios (box_id, dia_semana, hora_inicio, hora_fin, motivo)
SELECT b.id, NULL, '00:00'::time, '07:00'::time, 'Fuera de horario (madrugada)'
FROM turnos_boxes b
ON CONFLICT DO NOTHING;

-- 4. RLS
ALTER TABLE turnos_boxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE turnos_boxes_horarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "turnos_boxes_all" ON turnos_boxes
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "turnos_boxes_horarios_all" ON turnos_boxes_horarios
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 5. Permisos para anon (el sistema opera como anon)
GRANT SELECT, INSERT, UPDATE, DELETE ON turnos_boxes TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON turnos_boxes_horarios TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE turnos_boxes_id_seq TO anon, authenticated;

-- 6. Habilitar Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE turnos_boxes;
