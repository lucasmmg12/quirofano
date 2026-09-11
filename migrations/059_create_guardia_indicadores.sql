-- Migration 059: Creación de tablas para Indicadores de Guardia Clínica (Gobernanza QOAG)

CREATE TABLE IF NOT EXISTS public.guardia_indicadores_resumen (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    periodo TEXT NOT NULL UNIQUE, -- '2026-05', '2026-06', '2026-ANUAL', etc.
    fecha_desde DATE,
    fecha_hasta DATE,
    total_consultas INT DEFAULT 0,
    
    -- Indicador 1: Conversión a Cirugía
    cantidad_pases_cirugia INT DEFAULT 0,
    conversion_cirugia_pct DECIMAL(5,2) DEFAULT 0.00,
    
    -- Indicador 2: Tiempos de Espera
    espera_medico_min_promedio DECIMAL(6,2) DEFAULT 0.00,
    permanencia_guardia_min_promedio DECIMAL(6,2) DEFAULT 0.00,
    
    -- Indicador 3: Cobertura Triage
    consultas_con_triage INT DEFAULT 0,
    cobertura_triage_pct DECIMAL(5,2) DEFAULT 0.00,
    triage_distribucion JSONB DEFAULT '[]'::jsonb,
    
    -- Indicador 4: Reconsulta a 72 hs
    cantidad_reconsultas_72h INT DEFAULT 0,
    reconsulta_72h_pct DECIMAL(5,2) DEFAULT 0.00,
    
    -- Indicador 5: Reinternación Temprana a 72 hs
    total_altas_clinicas INT DEFAULT 0,
    reinternaciones_72h INT DEFAULT 0,
    reinternacion_72h_pct DECIMAL(5,2) DEFAULT 0.00,
    
    -- Indicador 6: Volumen de TAC y Rx
    total_tac INT DEFAULT 0,
    total_rx INT DEFAULT 0,
    tasa_imagenes_100_consultas DECIMAL(6,2) DEFAULT 0.00,
    
    -- Indicador 7: Destinos Post-Guardia
    destinos_distribucion JSONB DEFAULT '[]'::jsonb,
    
    -- Indicador 8: Días de Estada Clínica
    promedio_dias_estada DECIMAL(5,2) DEFAULT 0.00,
    
    -- Indicador 9: Adherencia a Epicrisis
    altas_con_epicrisis INT DEFAULT 0,
    adherencia_epicrisis_pct DECIMAL(5,2) DEFAULT 0.00,
    
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Habilitado
ALTER TABLE public.guardia_indicadores_resumen ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'guardia_indicadores_resumen' AND policyname = 'guardia_indicadores_resumen_all'
    ) THEN
        CREATE POLICY "guardia_indicadores_resumen_all" ON public.guardia_indicadores_resumen 
        FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
