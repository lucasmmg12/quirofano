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
CREATE TABLE IF NOT EXISTS public.consultas_guardia_recibidas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mes_periodo TEXT NOT NULL,
    especialidad TEXT NOT NULL,
    recibidas INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (mes_periodo, especialidad)
);

ALTER TABLE public.consultas_guardia_recibidas ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'consultas_guardia_recibidas' 
          AND policyname = 'consultas_guardia_recibidas_all'
    ) THEN 
        CREATE POLICY "consultas_guardia_recibidas_all" ON public.consultas_guardia_recibidas FOR ALL USING (true) WITH CHECK (true);
    END IF; 
END $$;
`;

async function run() {
    console.log(`Running migration for table public.consultas_guardia_recibidas via Supabase Management API...\n`);
    
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
        .from('consultas_guardia_recibidas')
        .select('id')
        .limit(1);
    
    if (error) {
        console.error('❌ Table verification FAILED:', error.message);
    } else {
        console.log('✅ Table verified successfully. It exists and is accessible!');
    }
}

run();
