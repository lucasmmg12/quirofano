import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '.env') });

const token = process.env.SUPABASE_ACCESS_TOKEN;
const project = process.env.SUPABASE_PROJECT_REF || 'hakysnqiryimxbwdslwe';

const sql = `
CREATE TABLE IF NOT EXISTS public.guardia_consultas_tiempos (
    id BIGSERIAL PRIMARY KEY,
    periodo TEXT NOT NULL,
    id_visita BIGINT,
    nhc TEXT,
    paciente TEXT NOT NULL,
    obra_social TEXT,
    agenda TEXT,
    tipo_visita TEXT,
    fecha_visita DATE,
    hora_llegada TEXT,
    hora_atencion TEXT,
    hora_egreso TEXT,
    minutos_espera INT,
    minutos_permanencia INT,
    es_outlier_espera BOOLEAN DEFAULT FALSE,
    es_outlier_permanencia BOOLEAN DEFAULT FALSE,
    nivel_triage TEXT,
    destino TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_guardia_consultas_tiempos UNIQUE (periodo, id_visita)
);

CREATE INDEX IF NOT EXISTS idx_gct_periodo ON public.guardia_consultas_tiempos(periodo);
CREATE INDEX IF NOT EXISTS idx_gct_espera ON public.guardia_consultas_tiempos(minutos_espera);
CREATE INDEX IF NOT EXISTS idx_gct_outlier ON public.guardia_consultas_tiempos(es_outlier_espera);
CREATE INDEX IF NOT EXISTS idx_gct_fecha ON public.guardia_consultas_tiempos(fecha_visita);

ALTER TABLE public.guardia_consultas_tiempos ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'guardia_consultas_tiempos' 
          AND policyname = 'allow_all_guardia_consultas_tiempos'
    ) THEN 
        CREATE POLICY "allow_all_guardia_consultas_tiempos" ON public.guardia_consultas_tiempos FOR ALL USING (true) WITH CHECK (true);
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
    console.log('Status creación tabla tiempos:', res.status);
    const txt = await res.text();
    console.log('Response:', txt);
}

run().catch(console.error);
