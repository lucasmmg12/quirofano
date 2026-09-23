-- ==============================================================================
-- Migración 064: Tabla de Turnos y Visitas Activas para el Chatbot (Sanatorio Argentino)
-- Unifica visitas agendadas en SALUS (asistencia IS NULL, fecha >= HOY)
-- y turnos online para consulta ágil y segura por DNI o Teléfono.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.turnos_activos_pacientes (
    id TEXT PRIMARY KEY,
    dni VARCHAR(20) NOT NULL,
    paciente_nombre TEXT NOT NULL,
    nhc VARCHAR(50),
    telefono VARCHAR(50),
    telefono2 VARCHAR(50),
    email TEXT,
    fecha DATE NOT NULL,
    hora VARCHAR(20) NOT NULL,
    medico TEXT,
    especialidad TEXT,
    sede TEXT,
    obra_social TEXT,
    tipo_visita TEXT,
    motivo TEXT,
    tipo_agenda TEXT,
    origen VARCHAR(30) DEFAULT 'salus_visita', -- 'salus_visita' | 'turno_online'
    asistencia VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices de alta velocidad
CREATE INDEX IF NOT EXISTS idx_turnos_activos_dni ON public.turnos_activos_pacientes (dni);
CREATE INDEX IF NOT EXISTS idx_turnos_activos_telefono ON public.turnos_activos_pacientes (telefono);
CREATE INDEX IF NOT EXISTS idx_turnos_activos_fecha ON public.turnos_activos_pacientes (fecha);
CREATE INDEX IF NOT EXISTS idx_turnos_activos_dni_fecha ON public.turnos_activos_pacientes (dni, fecha);

-- Habilitar RLS
ALTER TABLE public.turnos_activos_pacientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura general turnos_activos_pacientes" ON public.turnos_activos_pacientes;
CREATE POLICY "Permitir lectura general turnos_activos_pacientes"
    ON public.turnos_activos_pacientes FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Permitir todo a service_role turnos_activos_pacientes" ON public.turnos_activos_pacientes;
CREATE POLICY "Permitir todo a service_role turnos_activos_pacientes"
    ON public.turnos_activos_pacientes FOR ALL
    USING (true)
    WITH CHECK (true);

-- Función RPC para búsqueda de turnos próximos por DNI o teléfono
CREATE OR REPLACE FUNCTION public.buscar_turnos_proximos(
    p_dni TEXT DEFAULT NULL,
    p_telefono TEXT DEFAULT NULL
)
RETURNS TABLE (
    id TEXT,
    dni VARCHAR,
    paciente_nombre TEXT,
    nhc VARCHAR,
    telefono VARCHAR,
    fecha DATE,
    hora VARCHAR,
    medico TEXT,
    especialidad TEXT,
    sede TEXT,
    obra_social TEXT,
    tipo_visita TEXT,
    motivo TEXT,
    tipo_agenda TEXT,
    origen VARCHAR
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_dni TEXT := NULL;
    v_clean_tel TEXT := NULL;
BEGIN
    IF p_dni IS NOT NULL AND length(trim(p_dni)) > 0 THEN
        v_clean_dni := regexp_replace(p_dni, '[^\d]', '', 'g');
    END IF;

    IF p_telefono IS NOT NULL AND length(trim(p_telefono)) > 0 THEN
        v_clean_tel := regexp_replace(p_telefono, '[^\d]', '', 'g');
        IF length(v_clean_tel) >= 7 THEN
            v_clean_tel := right(v_clean_tel, 8);
        END IF;
    END IF;

    RETURN QUERY
    SELECT 
        t.id,
        t.dni,
        t.paciente_nombre,
        t.nhc,
        t.telefono,
        t.fecha,
        t.hora,
        t.medico,
        t.especialidad,
        t.sede,
        t.obra_social,
        t.tipo_visita,
        t.motivo,
        t.tipo_agenda,
        t.origen
    FROM public.turnos_activos_pacientes t
    WHERE t.fecha >= CURRENT_DATE
      AND (
          (v_clean_dni IS NOT NULL AND length(v_clean_dni) >= 6 AND t.dni = v_clean_dni)
          OR
          (v_clean_dni IS NULL AND v_clean_tel IS NOT NULL AND (
              t.telefono ILIKE '%' || v_clean_tel || '%' OR
              t.telefono2 ILIKE '%' || v_clean_tel || '%'
          ))
      )
    ORDER BY t.fecha ASC, t.hora ASC
    LIMIT 10;
END;
$$;
