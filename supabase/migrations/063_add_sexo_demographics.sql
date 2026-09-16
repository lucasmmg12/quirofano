-- ==============================================================================
-- Migration 063: Datos Demográficos por Sexo (Gobernanza QOAG - Sanatorio Argentino)
-- ==============================================================================
-- Agrega soporte para el seguimiento demográfico poblacional (% Mujer vs % Hombre)
-- tanto en UCI/internación hospitalaria como en Urgencias/Guardia Clínica.

-- 1. Tablas de Ocupación e Historial de Camas (UCI y Sectores de Internación)
ALTER TABLE public.calidad_admisiones_ocupacion ADD COLUMN IF NOT EXISTS sexo TEXT;
ALTER TABLE public.calidad_admisiones_camas_historial ADD COLUMN IF NOT EXISTS sexo TEXT;

-- 2. Consultas y Registros de Guardia Clínica
ALTER TABLE public.consultas_guardia ADD COLUMN IF NOT EXISTS sexo TEXT;

-- 3. Consolidado Mensual de Indicadores de Guardia Clínica
ALTER TABLE public.guardia_indicadores_resumen ADD COLUMN IF NOT EXISTS sexo_distribucion JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.guardia_indicadores_resumen ADD COLUMN IF NOT EXISTS mujeres_pct DECIMAL(5,2) DEFAULT 0.00;
ALTER TABLE public.guardia_indicadores_resumen ADD COLUMN IF NOT EXISTS hombres_pct DECIMAL(5,2) DEFAULT 0.00;
