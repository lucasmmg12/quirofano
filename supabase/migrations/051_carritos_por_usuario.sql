-- =============================================
-- 051: Carritos de Traspaso y Devolución por Usuario
-- =============================================
-- Añade columnas para identificar qué usuario tiene
-- una ficha en su carrito de traspaso o devolución.

ALTER TABLE altas_administrativas
ADD COLUMN IF NOT EXISTS carrito_traspaso_por TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS carrito_devolucion_por TEXT DEFAULT NULL;

COMMENT ON COLUMN altas_administrativas.carrito_traspaso_por IS 'Usuario que agregó la ficha al carrito de traspaso';
COMMENT ON COLUMN altas_administrativas.carrito_devolucion_por IS 'Usuario que agregó la ficha al carrito de devolución';
