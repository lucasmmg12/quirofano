import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '.env') });

const token = process.env.SUPABASE_ACCESS_TOKEN;
const project = process.env.SUPABASE_PROJECT_REF || 'hakysnqiryimxbwdslwe';

const sql = `
CREATE TABLE IF NOT EXISTS public.guardia_epicrisis_altas (
    id BIGSERIAL PRIMARY KEY,
    periodo TEXT NOT NULL,
    id_admision INT,
    numero_admision TEXT,
    nhc TEXT,
    paciente TEXT NOT NULL,
    obra_social TEXT,
    fecha_ingreso TIMESTAMPTZ,
    fecha_alta TIMESTAMPTZ,
    dias_estada INT,
    doctor TEXT,
    usuario_alta TEXT,
    habitacion TEXT,
    proceso TEXT,
    motivo_alta TEXT,
    tiene_epicrisis BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_guardia_epicrisis_admision UNIQUE (periodo, id_admision)
);

CREATE INDEX IF NOT EXISTS idx_guardia_epicrisis_periodo ON public.guardia_epicrisis_altas(periodo);
CREATE INDEX IF NOT EXISTS idx_guardia_epicrisis_tiene ON public.guardia_epicrisis_altas(tiene_epicrisis);

ALTER TABLE public.guardia_epicrisis_altas ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'guardia_epicrisis_altas' 
          AND policyname = 'allow_all_guardia_epicrisis'
    ) THEN 
        CREATE POLICY "allow_all_guardia_epicrisis" ON public.guardia_epicrisis_altas FOR ALL USING (true) WITH CHECK (true);
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
