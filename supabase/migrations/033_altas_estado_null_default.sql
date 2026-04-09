-- =============================================
-- 033: Estado de altas siempre vacío por defecto
-- =============================================
-- Cambia el DEFAULT de la columna estado de 'Procesada' a NULL.
-- Los usuarios asignan el estado manualmente.

-- 1. Cambiar el DEFAULT de la columna
ALTER TABLE altas_administrativas ALTER COLUMN estado SET DEFAULT NULL;

-- 2. Los registros que tienen 'Procesada' y nunca fueron tocados
--    manualmente deben quedar en blanco (NULL)
UPDATE altas_administrativas
SET estado = NULL
WHERE estado = 'Procesada';
