-- Migration: 035_laboratorios_carrito.sql
-- Descripción: Agrega sistema de carrito + constancias de entrega para Anatomía Patológica.

-- ═══════════════════════════════════════════════════
-- 1. Columnas de carrito en la tabla existente
-- ═══════════════════════════════════════════════════
ALTER TABLE public.laboratorios_anatomia_patologica
    ADD COLUMN IF NOT EXISTS en_carrito BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS constancia_id UUID,
    ADD COLUMN IF NOT EXISTS entregado_at TIMESTAMPTZ;

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_lab_en_carrito
    ON public.laboratorios_anatomia_patologica (en_carrito)
    WHERE en_carrito = TRUE;

CREATE INDEX IF NOT EXISTS idx_lab_constancia_id
    ON public.laboratorios_anatomia_patologica (constancia_id)
    WHERE constancia_id IS NOT NULL;

-- ═══════════════════════════════════════════════════
-- 2. Tabla de constancias de entrega
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.laboratorios_constancias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo TEXT NOT NULL,                   -- Ej: LAB-ENT-001
    laboratorio TEXT NOT NULL,              -- Agüero / CEDAP / Cuyo
    fecha_entrega TIMESTAMPTZ DEFAULT NOW(),
    responsable_entrega TEXT,
    nombre_cadete TEXT,
    cantidad_registros INTEGER DEFAULT 0,
    notas TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.laboratorios_constancias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lab_constancias_full_access" ON public.laboratorios_constancias
    FOR ALL USING (true) WITH CHECK (true);

-- FK entre labotarios y constancias
ALTER TABLE public.laboratorios_anatomia_patologica
    ADD CONSTRAINT fk_lab_constancia
    FOREIGN KEY (constancia_id) REFERENCES public.laboratorios_constancias(id)
    ON DELETE SET NULL;
