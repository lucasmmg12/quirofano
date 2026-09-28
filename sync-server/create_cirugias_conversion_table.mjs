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
        CREATE TABLE IF NOT EXISTS public.guardia_cirugias_conversion (
            id BIGSERIAL PRIMARY KEY,
            periodo TEXT NOT NULL,
            id_visita_guardia BIGINT,
            id_visita_cirugia BIGINT,
            nhc TEXT,
            dni TEXT,
            paciente TEXT NOT NULL,
            obra_social TEXT,
            fecha_guardia DATE,
            hora_guardia TEXT,
            fecha_hora_guardia TIMESTAMPTZ,
            fecha_cirugia DATE,
            hora_cirugia TEXT,
            fecha_hora_cirugia TIMESTAMPTZ,
            horas_espera_qx NUMERIC(6,2),
            rango_espera TEXT,
            cirugia_procedimiento TEXT NOT NULL,
            especialidad TEXT,
            cirujano TEXT,
            tipo_cirugia TEXT,
            estado_cirugia TEXT,
            duracion_minutos INT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_guardia_cirugias_periodo 
            ON public.guardia_cirugias_conversion (periodo);
        CREATE INDEX IF NOT EXISTS idx_guardia_cirugias_nhc 
            ON public.guardia_cirugias_conversion (nhc);
        
        -- Grant permisos
        GRANT ALL ON TABLE public.guardia_cirugias_conversion TO anon, authenticated, service_role;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
    `;

    await client.query(sql);
    console.log('✅ Tabla public.guardia_cirugias_conversion creada correctamente con permisos.');
    await client.end();
}

createTable().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
