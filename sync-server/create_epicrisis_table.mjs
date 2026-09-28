import pg from 'pg';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

const { Client } = pg;
const connectionString = process.env.SUPABASE_DB_URL;

const client = new Client({ connectionString });

async function createTable() {
    await client.connect();
    console.log('Conectado a PostgreSQL de Supabase...');

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
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_guardia_epicrisis_periodo 
            ON public.guardia_epicrisis_altas (periodo);
        
        -- Grant permisos
        GRANT ALL ON TABLE public.guardia_epicrisis_altas TO anon, authenticated, service_role;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
    `;

    await client.query(sql);
    console.log('✅ Tabla public.guardia_epicrisis_altas creada correctamente con permisos.');
    await client.end();
}

createTable().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
