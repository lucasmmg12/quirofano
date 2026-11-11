-- Tabla maestra de todos los turnos online realizados (en tiempo real desde CitaOnline Web + sincronización SALUS v.Internet = 1)
CREATE TABLE IF NOT EXISTS public.cita_online_reservas (
    id TEXT PRIMARY KEY,
    id_visita BIGINT UNIQUE,
    dni TEXT,
    paciente_nombre TEXT,
    telefono TEXT,
    whatsapp_phone TEXT,
    email TEXT,
    profesional TEXT,
    id_personal BIGINT,
    especialidad TEXT,
    agenda TEXT,
    id_agenda BIGINT,
    tipo_visita TEXT,
    centro TEXT,
    obra_social TEXT,
    motivo TEXT,
    fecha_turno DATE,
    hora_inicio TEXT,
    hora_fin TEXT,
    fecha_hora_texto TEXT,
    fecha_creacion_salus TIMESTAMPTZ,
    asistencia TEXT,
    origen_captura TEXT DEFAULT 'salus_sync',
    whatsapp_enviado BOOLEAN DEFAULT FALSE,
    whatsapp_plantilla TEXT,
    whatsapp_enviado_at TIMESTAMPTZ,
    whatsapp_respuesta JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cita_online_reservas_fecha_creacion ON public.cita_online_reservas (fecha_creacion_salus DESC);
CREATE INDEX IF NOT EXISTS idx_cita_online_reservas_fecha_turno ON public.cita_online_reservas (fecha_turno DESC);
CREATE INDEX IF NOT EXISTS idx_cita_online_reservas_dni ON public.cita_online_reservas (dni);
CREATE INDEX IF NOT EXISTS idx_cita_online_reservas_id_visita ON public.cita_online_reservas (id_visita);

ALTER TABLE public.cita_online_reservas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'cita_online_reservas' AND policyname = 'Allow read all cita_online_reservas'
    ) THEN
        CREATE POLICY "Allow read all cita_online_reservas" ON public.cita_online_reservas FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'cita_online_reservas' AND policyname = 'Allow insert all cita_online_reservas'
    ) THEN
        CREATE POLICY "Allow insert all cita_online_reservas" ON public.cita_online_reservas FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'cita_online_reservas' AND policyname = 'Allow update all cita_online_reservas'
    ) THEN
        CREATE POLICY "Allow update all cita_online_reservas" ON public.cita_online_reservas FOR UPDATE USING (true);
    END IF;
END
$$;
