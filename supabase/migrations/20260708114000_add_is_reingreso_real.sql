-- Agregar flag para indicar si una internación en el mismo día es un reingreso real (y no debe fusionarse visualmente)
ALTER TABLE altas_administrativas ADD COLUMN IF NOT EXISTS is_reingreso_real BOOLEAN DEFAULT false;
