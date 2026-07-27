-- 1. Eliminar columnas de garantías de la tabla surgeries
ALTER TABLE public.surgeries DROP COLUMN IF EXISTS requiere_garantia;
ALTER TABLE public.surgeries DROP COLUMN IF EXISTS garantia_estado;
ALTER TABLE public.surgeries DROP COLUMN IF EXISTS rendicion_garantia_id;
ALTER TABLE public.surgeries DROP COLUMN IF EXISTS en_carrito_rendicion;
ALTER TABLE public.surgeries DROP COLUMN IF EXISTS carrito_rendicion_por;
ALTER TABLE public.surgeries DROP COLUMN IF EXISTS carrito_rendicion_at;
ALTER TABLE public.surgeries DROP COLUMN IF EXISTS garantia_ubicacion;

-- 2. Añadir columnas de garantías a altas_administrativas
ALTER TABLE public.altas_administrativas ADD COLUMN IF NOT EXISTS garantia_estado text;
ALTER TABLE public.altas_administrativas ADD COLUMN IF NOT EXISTS garantia_ubicacion text;
ALTER TABLE public.altas_administrativas ADD COLUMN IF NOT EXISTS garantia_fecha_archivada date;
ALTER TABLE public.altas_administrativas ADD COLUMN IF NOT EXISTS en_carrito_rendicion boolean DEFAULT false;
ALTER TABLE public.altas_administrativas ADD COLUMN IF NOT EXISTS carrito_rendicion_por text;
ALTER TABLE public.altas_administrativas ADD COLUMN IF NOT EXISTS carrito_rendicion_at timestamptz;
ALTER TABLE public.altas_administrativas ADD COLUMN IF NOT EXISTS rendicion_garantia_id uuid REFERENCES public.rendiciones_garantias(id);

-- 3. Crear función para archivar garantías a los 60 días
CREATE OR REPLACE FUNCTION public.check_garantias_destruccion()
RETURNS void AS $$
BEGIN
    UPDATE public.altas_administrativas
    SET garantia_estado = 'Destruida'
    WHERE garantia_estado = 'Archivada'
      AND garantia_fecha_archivada IS NOT NULL
      AND garantia_fecha_archivada <= CURRENT_DATE - INTERVAL '60 days';
END;
$$ LANGUAGE plpgsql;

-- 4. Nota: el job de pg_cron no se puede crear directamente aquí sin la extensión pg_cron activa
-- y privilegios de postgres (rol de servicio), pero la función check_garantias_destruccion() puede 
-- llamarse manual o mediante un webhook de supabase.
