import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '.env') });

const projectRef = 'hakysnqiryimxbwdslwe';
const token = process.env.SUPABASE_ACCESS_TOKEN;

async function runSql() {
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
            created_at TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT uq_guardia_cirugias_conv UNIQUE (periodo, id_visita_guardia, id_visita_cirugia)
        );

        CREATE INDEX IF NOT EXISTS idx_guardia_cirugias_periodo 
            ON public.guardia_cirugias_conversion (periodo);
        CREATE INDEX IF NOT EXISTS idx_guardia_cirugias_nhc 
            ON public.guardia_cirugias_conversion (nhc);
        CREATE INDEX IF NOT EXISTS idx_guardia_cirugias_esp 
            ON public.guardia_cirugias_conversion (especialidad);

        ALTER TABLE public.guardia_cirugias_conversion ENABLE ROW LEVEL SECURITY;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies 
                WHERE tablename = 'guardia_cirugias_conversion' AND policyname = 'allow_all_guardia_cirugias'
            ) THEN
                CREATE POLICY "allow_all_guardia_cirugias" ON public.guardia_cirugias_conversion FOR ALL USING (true) WITH CHECK (true);
            END IF;
        END $$;

        GRANT ALL ON TABLE public.guardia_cirugias_conversion TO anon, authenticated, service_role;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
    `;

    console.log('Enviando SQL a Supabase Management API...');
    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ query: sql })
    });

    const resJson = await response.json();
    console.log('Respuesta Supabase Management API:', resJson);
}

runSql();
