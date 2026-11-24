-- Migración 069: Gobernanza de Admisiones de Guardia Clínica (Dra. Paola García),
-- Ocupación Proporcional por Horas (Horas / 24 = Días Proporcionales) y Auditoría de Inconsistencias SALUS.

-- 1. Padrón nominal auditado de admisiones de Guardia Clínica (Doctor cabecera: Dra. Paola García)
CREATE TABLE IF NOT EXISTS public.gob_guardia_admisiones_paola (
    id_admision BIGINT PRIMARY KEY,
    numero_admision TEXT,
    paciente TEXT NOT NULL,
    nhc TEXT,
    dni TEXT,
    obra_social TEXT NOT NULL DEFAULT 'PARTICULAR',
    doctor_cabecera TEXT NOT NULL,
    servicio_salus TEXT,
    especialidad_salus TEXT,
    proceso_salus TEXT,
    motivo_alta TEXT,
    estado_salus TEXT,
    fecha_ingreso TIMESTAMPTZ NOT NULL,
    fecha_alta TIMESTAMPTZ,
    periodo TEXT NOT NULL,
    fecha_ingreso_date DATE NOT NULL,
    habitacion_salus TEXT,
    habitacion_inicial TEXT,
    habitacion_final TEXT,
    boxes_sr_utilizados TEXT[] NOT NULL DEFAULT '{}',
    camas_piso_utilizadas TEXT[] NOT NULL DEFAULT '{}',
    regimen_ubicacion TEXT NOT NULL DEFAULT 'SHOCK_ROOM',
    horas_brutas_salus NUMERIC(10, 2) NOT NULL DEFAULT 0,
    horas_shock_room NUMERIC(10, 2) NOT NULL DEFAULT 0,
    dias_proporcionales_sr NUMERIC(10, 4) NOT NULL DEFAULT 0,
    horas_piso NUMERIC(10, 2) NOT NULL DEFAULT 0,
    dias_proporcionales_piso NUMERIC(10, 4) NOT NULL DEFAULT 0,
    horas_sin_box_auditadas NUMERIC(10, 2) NOT NULL DEFAULT 0,
    dias_proporcionales_sin_box NUMERIC(10, 4) NOT NULL DEFAULT 0,
    horas_presupuesto_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
    dias_proporcionales_total NUMERIC(10, 4) NOT NULL DEFAULT 0,
    dias_cama_tradicional NUMERIC(10, 2) NOT NULL DEFAULT 0,
    tiene_inconsistencia BOOLEAN NOT NULL DEFAULT FALSE,
    inconsistencia_codigo TEXT NOT NULL DEFAULT 'OK',
    inconsistencia_severidad TEXT NOT NULL DEFAULT 'ok',
    inconsistencia_detalle TEXT,
    incluida_en_presupuesto BOOLEAN NOT NULL DEFAULT TRUE,
    visitas_hc_count INT NOT NULL DEFAULT 0,
    tiene_ficha_557 BOOLEAN NOT NULL DEFAULT FALSE,
    id_visita_557 BIGINT,
    tramos_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gob_gua_paola_periodo ON public.gob_guardia_admisiones_paola (periodo);
CREATE INDEX IF NOT EXISTS idx_gob_gua_paola_fecha ON public.gob_guardia_admisiones_paola (fecha_ingreso_date);
CREATE INDEX IF NOT EXISTS idx_gob_gua_paola_regimen ON public.gob_guardia_admisiones_paola (regimen_ubicacion);
CREATE INDEX IF NOT EXISTS idx_gob_gua_paola_inconsist ON public.gob_guardia_admisiones_paola (inconsistencia_codigo);

-- 2. Matriz diaria de Ocupación Proporcional por Hora y Unidad (BOX 1-SR, BOX 2-SR, BOX 3-SR, SIN_BOX_CON_ATENCION, PISO_PAOLA_GARCIA)
-- Criterio Gerencial: Días Proporcionales = Horas Netas Ocupadas / 24 (ej. 12 hs = 0.50 días sin importar cuántos pacientes rotaron)
CREATE TABLE IF NOT EXISTS public.gob_guardia_ocupacion_diaria_box (
    id BIGSERIAL PRIMARY KEY,
    fecha DATE NOT NULL,
    periodo TEXT NOT NULL,
    unidad TEXT NOT NULL,
    tipo_unidad TEXT NOT NULL,
    horas_disponibles NUMERIC(8, 2) NOT NULL DEFAULT 24,
    pacientes_distintos INT NOT NULL DEFAULT 0,
    horas_brutas_pacientes NUMERIC(10, 2) NOT NULL DEFAULT 0,
    horas_netas_ocupadas NUMERIC(10, 2) NOT NULL DEFAULT 0,
    minutos_solapados NUMERIC(10, 1) NOT NULL DEFAULT 0,
    dias_proporcionales NUMERIC(10, 4) NOT NULL DEFAULT 0,
    dias_conteo_tradicional NUMERIC(10, 2) NOT NULL DEFAULT 0,
    porcentaje_ocupacion NUMERIC(6, 2) NOT NULL DEFAULT 0,
    detalle_tramos_dia JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_gob_gua_ocup_diaria UNIQUE (fecha, unidad)
);

CREATE INDEX IF NOT EXISTS idx_gob_gua_ocup_fecha ON public.gob_guardia_ocupacion_diaria_box (fecha);
CREATE INDEX IF NOT EXISTS idx_gob_gua_ocup_periodo ON public.gob_guardia_ocupacion_diaria_box (periodo);
CREATE INDEX IF NOT EXISTS idx_gob_gua_ocup_unidad ON public.gob_guardia_ocupacion_diaria_box (unidad);

-- 3. Dotación parametrizable de Boxes de Shock Room (3 boxes operativos x 24 hs = 72 hs/día)
INSERT INTO public.gob_internacion_camas_config (sector, subsector, anio, camas_operativas, horas_mes_hdd)
VALUES
    ('SHOCK ROOM', 'GUARDIA CLINICA', 2025, 3, 2160),
    ('SHOCK ROOM', 'GUARDIA CLINICA', 2026, 3, 2160)
ON CONFLICT (sector, subsector, anio) DO NOTHING;

-- 4. Políticas RLS de lectura/escritura para el frontend y sync-server
ALTER TABLE public.gob_guardia_admisiones_paola ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gob_guardia_ocupacion_diaria_box ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_gob_guardia_adm_paola" ON public.gob_guardia_admisiones_paola;
CREATE POLICY "allow_all_gob_guardia_adm_paola" ON public.gob_guardia_admisiones_paola FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_gob_guardia_ocup_box" ON public.gob_guardia_ocupacion_diaria_box;
CREATE POLICY "allow_all_gob_guardia_ocup_box" ON public.gob_guardia_ocupacion_diaria_box FOR ALL USING (true) WITH CHECK (true);
