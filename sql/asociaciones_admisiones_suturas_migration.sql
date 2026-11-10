-- Migración: Entrega Asociaciones — Soporte de Admisiones, Todas las Suturas y Asignación Manual de Asociación
ALTER TABLE public.asociaciones_cirugias
  ADD COLUMN IF NOT EXISTS numero_admision TEXT,
  ADD COLUMN IF NOT EXISTS es_sutura BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tipo_origen TEXT DEFAULT 'CIRUGIA',
  ADD COLUMN IF NOT EXISTS asociacion_manual BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_asoc_cirug_admision ON public.asociaciones_cirugias(numero_admision);
CREATE INDEX IF NOT EXISTS idx_asoc_cirug_sutura ON public.asociaciones_cirugias(es_sutura);
CREATE INDEX IF NOT EXISTS idx_asoc_cirug_tipo_origen ON public.asociaciones_cirugias(tipo_origen);

