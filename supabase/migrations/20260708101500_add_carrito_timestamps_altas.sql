-- 052: Añadir columnas de timestamp para los carritos de altas administrativas
ALTER TABLE altas_administrativas ADD COLUMN IF NOT EXISTS carrito_traspaso_at timestamptz;
ALTER TABLE altas_administrativas ADD COLUMN IF NOT EXISTS carrito_devolucion_at timestamptz;
