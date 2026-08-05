import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '.env') });

const token = process.env.SUPABASE_ACCESS_TOKEN;
const project = process.env.SUPABASE_PROJECT_REF || 'hakysnqiryimxbwdslwe';
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://hakysnqiryimxbwdslwe.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!token) {
    console.error('❌ ERROR: SUPABASE_ACCESS_TOKEN not found in .env');
    process.exit(1);
}

const sql = `
CREATE TABLE IF NOT EXISTS public.libre_de_deuda_certificados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo TEXT UNIQUE NOT NULL,
    paciente_nombre TEXT NOT NULL,
    paciente_dni TEXT,
    n_internacion TEXT,
    garante_nombre TEXT,
    asesor_nombre TEXT NOT NULL,
    fecha_emision TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_texto TEXT,
    nhc TEXT,
    id_paciente UUID,
    observaciones TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ldd_certificados_nhc ON public.libre_de_deuda_certificados(nhc);
CREATE INDEX IF NOT EXISTS idx_ldd_certificados_dni ON public.libre_de_deuda_certificados(paciente_dni);
CREATE INDEX IF NOT EXISTS idx_ldd_certificados_codigo ON public.libre_de_deuda_certificados(codigo);

ALTER TABLE public.libre_de_deuda_certificados ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'libre_de_deuda_certificados' 
          AND policyname = 'libre_de_deuda_certificados_all'
    ) THEN 
        CREATE POLICY "libre_de_deuda_certificados_all" ON public.libre_de_deuda_certificados FOR ALL USING (true) WITH CHECK (true);
    END IF; 
END $$;

GRANT ALL ON public.libre_de_deuda_certificados TO anon, authenticated;
`;

async function run() {
    console.log(`Running migration for table public.libre_de_deuda_certificados via Supabase Management API...\n`);
    
    const uri = `https://api.supabase.com/v1/projects/${project}/database/query`;
    
    try {
        const response = await fetch(uri, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: sql })
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ Migration SUCCESSFUL!');
            console.log(JSON.stringify(result, null, 2));
        } else {
            const errText = await response.text();
            console.error(`❌ Migration FAILED status ${response.status}:`, errText);
            process.exit(1);
        }
    } catch (err) {
        console.error('❌ Request error:', err.message);
        process.exit(1);
    }

    console.log('\nVerifying table exists...');
    const supabase = createClient(supabaseUrl, supabaseKey, {
        db: { schema: 'public' },
        auth: { persistSession: false },
    });
    
    const { data, error } = await supabase
        .from('libre_de_deuda_certificados')
        .select('id')
        .limit(1);
    
    if (error) {
        console.error('❌ Table verification FAILED:', error.message);
    } else {
        console.log('✅ Table verified successfully. It exists and is accessible!');
    }
}

run();
