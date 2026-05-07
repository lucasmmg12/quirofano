-- ========================================
-- Agregar estado "sin_deuda_salus" a deudas_pacientes
-- Ejecutar en Supabase SQL Editor
-- ========================================

-- 1) Eliminar el CHECK constraint existente de la columna "categoria"
ALTER TABLE deudas_pacientes DROP CONSTRAINT IF EXISTS deudas_pacientes_categoria_check;

-- 2) Recrear el CHECK constraint con el nuevo valor incluido
ALTER TABLE deudas_pacientes ADD CONSTRAINT deudas_pacientes_categoria_check
CHECK (categoria IN (
    'sin_gestionar',
    'en_gestion',
    'comprometido',
    'cuenta_corriente',
    'incobrable',
    'descuento_liquidacion',
    'sin_deuda_salus'
));

-- Verificar que se aplicó correctamente
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'deudas_pacientes'::regclass 
  AND conname LIKE '%categoria%';
