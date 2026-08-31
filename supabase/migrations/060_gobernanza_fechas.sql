ALTER TABLE public.gobernanza_proyectos
ADD COLUMN IF NOT EXISTS fecha_desde DATE,
ADD COLUMN IF NOT EXISTS fecha_hasta DATE;
