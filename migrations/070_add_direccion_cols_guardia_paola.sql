-- Migración 070: Agregar columnas exactas del reporte de Dirección (Serie Admisión, Días SALUS, Edad, Procedencia)
-- a gob_guardia_admisiones_paola para conciliación 1 a 1 en formato Excel.

ALTER TABLE public.gob_guardia_admisiones_paola
    ADD COLUMN IF NOT EXISTS serie_admision TEXT,
    ADD COLUMN IF NOT EXISTS dias_salus INT,
    ADD COLUMN IF NOT EXISTS edad_salus INT,
    ADD COLUMN IF NOT EXISTS procedencia_salus TEXT;
