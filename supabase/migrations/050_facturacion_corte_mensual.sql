-- =============================================
-- 050: Corte Mensual de Facturación
-- =============================================
-- Campo para registrar hasta qué fecha se cerró la facturación
-- de una internación que trasciende el mes.
-- Ejemplo: paciente ingresó 20/06, sigue en julio →
--   facturacion_cerrada_hasta = '2026-06-30'
--   Esto indica que junio ya fue facturado y cerrado.

ALTER TABLE altas_administrativas 
ADD COLUMN IF NOT EXISTS facturacion_cerrada_hasta DATE DEFAULT NULL;

-- Comentario para documentación
COMMENT ON COLUMN altas_administrativas.facturacion_cerrada_hasta IS 
'Fecha hasta la cual se cerró la facturación del período anterior. NULL = sin cierre previo.';
