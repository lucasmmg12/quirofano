-- Migración: Agregar campos notas_traido y hora_visita a consultas_guardia
-- notas_traido: registrar qué trajo el paciente
-- hora_visita: hora extraída del Excel para identificar turnos de residencia

ALTER TABLE consultas_guardia ADD COLUMN IF NOT EXISTS notas_traido TEXT DEFAULT NULL;
ALTER TABLE consultas_guardia ADD COLUMN IF NOT EXISTS hora_visita TIME DEFAULT NULL;

COMMENT ON COLUMN consultas_guardia.notas_traido IS 'Notas sobre qué trajo el paciente (estudios, documentación, etc.)';
COMMENT ON COLUMN consultas_guardia.hora_visita IS 'Hora de la visita extraída del Excel. Usado para identificar turnos de residencia (7-14hs).';
