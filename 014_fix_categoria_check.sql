-- Actualiza el constraint de categorias en la tabla de deudas_pacientes para permitir el descuento por liquidación

ALTER TABLE deudas_pacientes DROP CONSTRAINT IF EXISTS deudas_pacientes_categoria_check;

ALTER TABLE deudas_pacientes ADD CONSTRAINT deudas_pacientes_categoria_check 
CHECK (categoria IN ('sin_gestionar', 'en_gestion', 'comprometido', 'cuenta_corriente', 'incobrable', 'descuento_liquidacion'));
