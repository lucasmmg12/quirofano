/**
 * Run migration 032 - Create altas_administrativas table
 * Uses the Supabase SQL HTTP endpoint (PostgREST workaround via creating a temporary RPC)
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hakysnqiryimxbwdslwe.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA0MjI3NCwiZXhwIjoyMDg1NjE4Mjc0fQ.v0Zw7yFjGKJX8xsMCZJPwRyhr2eNd1gjASsI7qSK0YM';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    db: { schema: 'public' },
    auth: { persistSession: false },
});

const statements = [
    // 1. Create table 
    `CREATE TABLE IF NOT EXISTS altas_administrativas (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        numero_admision TEXT,
        id_paciente TEXT,
        paciente TEXT NOT NULL,
        cliente TEXT,
        especialidad TEXT,
        proceso TEXT,
        doctor TEXT,
        motivo_alta TEXT,
        control_adm_finalizado TEXT,
        observaciones TEXT,
        fecha_ingreso DATE,
        fecha_alta DATE,
        estado TEXT DEFAULT 'Procesada',
        operador TEXT,
        notas_internas TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE(numero_admision)
    )`,
    // 2. Indexes
    `CREATE INDEX IF NOT EXISTS idx_altas_adm_fecha_alta ON altas_administrativas(fecha_alta DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_altas_adm_estado ON altas_administrativas(estado)`,
    `CREATE INDEX IF NOT EXISTS idx_altas_adm_paciente ON altas_administrativas(paciente)`,
    // 3. RLS
    `ALTER TABLE altas_administrativas ENABLE ROW LEVEL SECURITY`,
];

async function run() {
    console.log('Running migration 032_altas_administrativas...\n');

    // Execute via raw SQL using the Supabase PostgREST raw endpoint
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

    // Verify: try to query the table
    console.log('\nVerifying table exists...');
    const { data, error } = await supabase
        .from('altas_administrativas')
        .select('id')
        .limit(1);
    
    if (error) {
        console.error('Table NOT found:', error.message);
        console.log('\n⚠️ The table needs to be created manually.');
        console.log('Please run this SQL in the Supabase dashboard SQL editor:');
        console.log('─'.repeat(60));
        console.log(statements.join(';\n'));
    } else {
        console.log('✅ Table altas_administrativas exists!', data);
    }
}

run();
