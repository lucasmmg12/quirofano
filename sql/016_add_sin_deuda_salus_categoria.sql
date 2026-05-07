-- =====================================================
-- 016: Agregar 'sin_deuda_salus' al CHECK constraint de categoría
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- 1. Eliminar el constraint existente
ALTER TABLE deudas_pacientes DROP CONSTRAINT IF EXISTS deudas_pacientes_categoria_check;

-- 2. Recrear con todos los valores (incluyendo el nuevo)
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
