-- Migración 054: Agregar campo proximo_mantenimiento a activos_equipos para alertas de vencimiento a 30 días
ALTER TABLE public.activos_equipos 
ADD COLUMN IF NOT EXISTS proximo_mantenimiento DATE;

-- Indice para acelerar consultas de alerta de mantenimiento
CREATE INDEX IF NOT EXISTS idx_activos_equipos_proximo_maint ON public.activos_equipos(proximo_mantenimiento);
