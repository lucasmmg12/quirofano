import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hakysnqiryimxbwdslwe.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA0MjI3NCwiZXhwIjoyMDg1NjE4Mjc0fQ.v0Zw7yFjGKJX8xsMCZJPwRyhr2eNd1gjASsI7qSK0YM';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    db: { schema: 'public' },
    auth: { persistSession: false },
});

const statements = [
    `CREATE TABLE IF NOT EXISTS public.laboratorios_anatomia_patologica (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        id_visita TEXT UNIQUE NOT NULL,
        fecha_visita DATE NOT NULL,
        paciente TEXT,
        dni TEXT,
        cliente TEXT,
        laboratorio TEXT,
        biopsia_congelacion TEXT,
        biopsia_simple TEXT,
        material_biopsia_simple TEXT,
        biopsia_ampliada TEXT,
        material_biopsia_ampliada TEXT,
        modulo_asignado TEXT,
        clasificado_at TIMESTAMPTZ,
        clasificado_por TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `ALTER TABLE public.laboratorios_anatomia_patologica ENABLE ROW LEVEL SECURITY`,
    `CREATE POLICY "Laboratorios_read" ON public.laboratorios_anatomia_patologica FOR SELECT USING (true)`,
    `CREATE POLICY "Laboratorios_update" ON public.laboratorios_anatomia_patologica FOR UPDATE USING (true)`,
    `CREATE POLICY "Laboratorios_insert" ON public.laboratorios_anatomia_patologica FOR INSERT WITH CHECK (true)`,
    `CREATE POLICY "Laboratorios_delete" ON public.laboratorios_anatomia_patologica FOR DELETE USING (true)`
];

async function run() {
    console.log('Running migration 034 laboratorios_anatomia_patologica...\n');

    for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        const preview = stmt.replace(/\s+/g, ' ').substring(0, 70);
        console.log(`[${i + 1}/${statements.length}] ${preview}...`);
        
        try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SERVICE_KEY,
                    'Authorization': `Bearer ${SERVICE_KEY}`,
                },
                body: JSON.stringify({ sql: stmt }),
            });
            
            if (res.ok) {
                console.log('  ✅ OK');
            } else {
                const err = await res.text();
                console.log(`  ⚠️ ${res.status}: ${err.substring(0, 150)}`);
            }
        } catch (e) {
            console.log(`  ❌ ${e.message}`);
        }
    }

    console.log('\nVerifying table exists...');
    const { data, error } = await supabase
        .from('laboratorios_anatomia_patologica')
        .select('id')
        .limit(1);
    
    if (error) {
        console.error('Table NOT found:', error.message);
    } else {
        console.log('✅ Table laboratorios_anatomia_patologica exists!');
    }
}

run();
