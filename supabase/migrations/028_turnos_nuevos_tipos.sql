-- ============================================================
-- Migración 028: Nuevos tipos de trámite para turnos
-- Reemplaza los tipos originales (presupuestos, reintegros,
-- biopsias, otras) con la estructura real del sector:
--   1. Reintegros y Facturación
--   2. Autorizaciones de Internación y Cirugías
--      2.1 Obra Social Provincia
--      2.2 Otras Obras Sociales
--      2.3 Parto y Cesárea
--   3. Otras Consultas
-- Se agrega columna "grupo" para agrupar sub-opciones.
-- ============================================================

-- 1. Agregar columna grupo para sub-categorías
ALTER TABLE turnos_config ADD COLUMN IF NOT EXISTS grupo TEXT;
ALTER TABLE turnos_config ADD COLUMN IF NOT EXISTS grupo_label TEXT;
ALTER TABLE turnos_config ADD COLUMN IF NOT EXISTS grupo_icono TEXT;
ALTER TABLE turnos_config ADD COLUMN IF NOT EXISTS grupo_color TEXT;
ALTER TABLE turnos_config ADD COLUMN IF NOT EXISTS orden INT NOT NULL DEFAULT 0;

-- 2. Desactivar tipos anteriores (no borrar para mantener FK integrity)
UPDATE turnos_config SET activo = false WHERE tipo_tramite IN ('presupuestos', 'reintegros', 'biopsias', 'otras');

-- 3. Insertar nuevos tipos
INSERT INTO turnos_config (tipo_tramite, label, prefijo, box_default, color, icono, activo, grupo, grupo_label, grupo_icono, grupo_color, orden) VALUES
    -- Opción 1: Reintegros y Facturación (sin sub-opciones)
    ('reintegros_facturacion', 'Reintegros y Facturación', 'R', 1, '#3B82F6', 'Receipt', true, NULL, NULL, NULL, NULL, 1),

    -- Opción 2: Autorizaciones (con sub-opciones, agrupadas bajo "autorizaciones")
    ('aut_obra_social_prov', 'Obra Social Provincia', 'A', 2, '#8B5CF6', 'Building2', true, 'autorizaciones', 'Autorizaciones de Internación y Cirugías', 'ShieldCheck', '#8B5CF6', 2),
    ('aut_otras_obras_soc', 'Otras Obras Sociales', 'S', 2, '#6366F1', 'Users', true, 'autorizaciones', 'Autorizaciones de Internación y Cirugías', 'ShieldCheck', '#8B5CF6', 3),
    ('aut_parto_cesarea', 'Parto y Cesárea', 'C', 2, '#A855F7', 'Baby', true, 'autorizaciones', 'Autorizaciones de Internación y Cirugías', 'ShieldCheck', '#8B5CF6', 4),

    -- Opción 3: Otras Consultas (sin sub-opciones)
    ('otras_consultas', 'Otras Consultas', 'O', 3, '#F59E0B', 'HelpCircle', true, NULL, NULL, NULL, NULL, 5)
ON CONFLICT (tipo_tramite) DO UPDATE SET
    label = EXCLUDED.label,
    prefijo = EXCLUDED.prefijo,
    box_default = EXCLUDED.box_default,
    color = EXCLUDED.color,
    icono = EXCLUDED.icono,
    activo = EXCLUDED.activo,
    grupo = EXCLUDED.grupo,
    grupo_label = EXCLUDED.grupo_label,
    grupo_icono = EXCLUDED.grupo_icono,
    grupo_color = EXCLUDED.grupo_color,
    orden = EXCLUDED.orden;
