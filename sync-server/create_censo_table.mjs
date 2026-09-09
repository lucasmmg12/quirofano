import dotenv from 'dotenv';
dotenv.config();

async function runSql() {
    const sql = `
        CREATE TABLE IF NOT EXISTS public.calidad_censo_camas_uci (
            id SERIAL PRIMARY KEY,
            hab TEXT NOT NULL UNIQUE,
            orden INT NOT NULL,
            fecha_ingreso TEXT DEFAULT '',
            paciente TEXT DEFAULT '',
            fecha_nacimiento TEXT DEFAULT '',
            dni TEXT DEFAULT '',
            obra_social TEXT DEFAULT '',
            numero_afiliado TEXT DEFAULT '',
            edad TEXT DEFAULT '',
            telefono TEXT DEFAULT '',
            tipo_internacion TEXT DEFAULT '',
            numero_admision TEXT DEFAULT '',
            estado TEXT DEFAULT 'LIBRE',
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        ALTER TABLE public.calidad_censo_camas_uci ENABLE ROW LEVEL SECURITY;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies WHERE tablename = 'calidad_censo_camas_uci' AND policyname = 'Allow read to all'
            ) THEN
                CREATE POLICY "Allow read to all" ON public.calidad_censo_camas_uci FOR SELECT USING (true);
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies WHERE tablename = 'calidad_censo_camas_uci' AND policyname = 'Allow all to service_role'
            ) THEN
                CREATE POLICY "Allow all to service_role" ON public.calidad_censo_camas_uci FOR ALL USING (true);
            END IF;
        END
        $$;

        GRANT ALL ON public.calidad_censo_camas_uci TO anon, authenticated, service_role;
    `;

    const res = await fetch('https://api.supabase.com/v1/projects/hakysnqiryimxbwdslwe/database/query', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: sql })
    });
    const json = await res.json();
    console.log('Create table result:', json);
}
runSql();
