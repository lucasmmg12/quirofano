-- Add chat_history column to gobernanza_entrevistas to save chat sessions
ALTER TABLE gobernanza_entrevistas ADD COLUMN IF NOT EXISTS chat_history JSONB DEFAULT '[]'::jsonb;
