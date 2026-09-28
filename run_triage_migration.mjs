import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '.env') });

const token = process.env.SUPABASE_ACCESS_TOKEN;
const project = process.env.SUPABASE_PROJECT_REF || 'hakysnqiryimxbwdslwe';

console.log('Token exists?', !!token);

const sql = `
CREATE TABLE IF NOT EXISTS public.guardia_triage_pacientes (
    id BIGSERIAL PRIMARY KEY,
    periodo TEXT NOT NULL,
    nhc TEXT,
    paciente TEXT NOT NULL,
    obra_social TEXT,
    agenda TEXT,
    tipo_visita TEXT,
    fecha_visita DATE,
    hora_llegada TEXT,
    nivel_triage TEXT,
    observacion_enfermeria TEXT,
    ta_sistolica NUMERIC,
    ta_diastolica NUMERIC,
    fc NUMERIC,
    temperatura NUMERIC,
    sato2 NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_guardia_triage_paciente UNIQUE (periodo, nhc, fecha_visita, hora_llegada)
);

CREATE INDEX IF NOT EXISTS idx_guardia_triage_periodo ON public.guardia_triage_pacientes(periodo);
CREATE INDEX IF NOT EXISTS idx_guardia_triage_nivel ON public.guardia_triage_pacientes(nivel_triage);
CREATE INDEX IF NOT EXISTS idx_guardia_triage_fecha ON public.guardia_triage_pacientes(fecha_visita);

ALTER TABLE public.guardia_triage_pacientes ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'guardia_triage_pacientes' 
          AND policyname = 'allow_all_guardia_triage'
    ) THEN 
        CREATE POLICY "allow_all_guardia_triage" ON public.guardia_triage_pacientes FOR ALL USING (true) WITH CHECK (true);
    END IF; 
END $$;
`;

async function run() {
    const uri = `https://api.supabase.com/v1/projects/${project}/database/query`;
    const res = await fetch(uri, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: sql })
    });
    console.log('Status:', res.status);
    const txt = await res.text();
    console.log('Response:', txt);
}

run().catch(console.error);
