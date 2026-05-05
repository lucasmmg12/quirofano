-- Agregar columna n_admision a la tabla de anatomía patológica
-- Esta columna viene de VLISE_PeticionesPruebas.[N.Admision]
ALTER TABLE laboratorios_anatomia_patologica 
ADD COLUMN IF NOT EXISTS n_admision TEXT;

-- Comentario descriptivo
COMMENT ON COLUMN laboratorios_anatomia_patologica.n_admision IS 'Número de admisión del paciente (desde SALUS VLISE_PeticionesPruebas)';
