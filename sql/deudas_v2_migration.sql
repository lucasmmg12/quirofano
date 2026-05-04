-- ============================================
-- MIGRACIÓN: Módulo de Deudas v2
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- PASO 3: Columna de obra social en deudas_pacientes
ALTER TABLE deudas_pacientes ADD COLUMN IF NOT EXISTS obra_social TEXT;

-- PASO 6: Tablas para planes de pago
CREATE TABLE IF NOT EXISTS deudas_planes_pago (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    paciente_id UUID REFERENCES deudas_pacientes(id) ON DELETE CASCADE,
    monto_original DECIMAL(12,2) NOT NULL,
    tipo_interes TEXT DEFAULT 'porcentaje',
    tasa_interes DECIMAL(8,4) DEFAULT 0,
    cantidad_cuotas INT NOT NULL,
    monto_cuota DECIMAL(12,2) NOT NULL,
    monto_total_financiado DECIMAL(12,2) NOT NULL,
    estado TEXT DEFAULT 'activo',
    notas TEXT,
    usuario TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deudas_cuotas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    plan_id UUID REFERENCES deudas_planes_pago(id) ON DELETE CASCADE,
    numero_cuota INT NOT NULL,
    monto DECIMAL(12,2) NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    pagada BOOLEAN DEFAULT FALSE,
    fecha_pago DATE,
    comprobante TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies
ALTER TABLE deudas_planes_pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE deudas_cuotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deudas_planes_pago_all" ON deudas_planes_pago FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "deudas_cuotas_all" ON deudas_cuotas FOR ALL USING (true) WITH CHECK (true);
