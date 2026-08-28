-- Add audios_partes column to gobernanza_entrevistas to save multiple audio parts
ALTER TABLE gobernanza_entrevistas ADD COLUMN IF NOT EXISTS audios_partes JSONB DEFAULT '[]'::jsonb;
