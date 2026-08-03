import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const sql = `
CREATE TABLE IF NOT EXISTS consultas_guardia_recibidas_diarias (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mes_periodo text NOT NULL,
    fecha date NOT NULL,
    os_categoria text NOT NULL CHECK (os_categoria IN ('OSP', 'Prepagas', 'Particulares')),
    recibidas integer NOT NULL DEFAULT 0,
    updated_at timestamptz DEFAULT now(),
    UNIQUE(fecha, os_categoria)
);

ALTER TABLE consultas_guardia_recibidas_diarias ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'consultas_guardia_recibidas_diarias' AND policyname = 'allow_all_consultas_recibidas_diarias') THEN
    CREATE POLICY "allow_all_consultas_recibidas_diarias" ON consultas_guardia_recibidas_diarias FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_recibidas_diarias_mes ON consultas_guardia_recibidas_diarias(mes_periodo);
`;

// Use the SQL endpoint directly (Supabase Management API)
const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
});

// Since RPC won't work, try direct SQL via the pg endpoint
// Supabase provides a /pg endpoint for running raw SQL with service role
const pgRes = await fetch(`${SUPABASE_URL}/pg`, {
    method: 'POST',
    headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
});

if (pgRes.ok) {
    console.log('✅ Table created via /pg endpoint');
} else {
    const status = pgRes.status;
    console.log(`/pg returned ${status}, trying Supabase SQL API...`);

    // Try the newer SQL API endpoint
    const sqlRes = await fetch(`${SUPABASE_URL}/sql`, {
        method: 'POST',
        headers: {
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
    });

    if (sqlRes.ok) {
        console.log('✅ Table created via /sql endpoint');
    } else {
        console.log(`\n⚠️  Automatic creation failed. Please run the SQL manually in Supabase Dashboard → SQL Editor.`);
        console.log(`\nCopy and paste this SQL:\n`);
        console.log(sql);
    }
}
