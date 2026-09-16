import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const SQL_CONFIG = {
    server: '128.223.16.29',
    port: 2450,
    user: 'SalusConsulta',
    password: 'ConsultaSALUS1234',
    database: 'SALUS',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        requestTimeout: 180000,
        connectionTimeout: 20000,
        tdsVersion: '7_4',
    },
};

const token = process.env.SUPABASE_ACCESS_TOKEN;
const project = process.env.SUPABASE_PROJECT_REF || 'hakysnqiryimxbwdslwe';

async function executeSql(query) {
    const uri = `https://api.supabase.com/v1/projects/${project}/database/query`;
    const res = await fetch(uri, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
    });
    if (!res.ok) {
        const t = await res.text();
        throw new Error(`Supabase query error (${res.status}): ${t}`);
    }
    return res.json();
}

async function backfill() {
    console.log('Connecting to SALUS...');
    const pool = await sql.connect(SQL_CONFIG);
    try {
        console.log('Fetching NHC -> sexo mapping from SALUS for active admissions...');
        const result = await pool.request().query(`
            SELECT DISTINCT 
                RTRIM(LTRIM(CAST(p.NHC AS VARCHAR(50)))) as nhc,
                CASE 
                    WHEN p.sexo = 'F' THEN 'F'
                    WHEN p.sexo = 'M' THEN 'M'
                    ELSE 'I'
                END as sexo
            FROM FE_Entidades p
            INNER JOIN TABLEAU_Admisiones a ON p.NHC = a.NHC
            WHERE (a.[Fecha alta] >= '2025-01-01' OR a.[Fecha alta] IS NULL)
              AND p.NHC IS NOT NULL
        `);
        const rows = result.recordset;
        console.log(`Fetched ${rows.length} patient sex records from SALUS.`);

        // Create a staging table in Supabase to do a fast bulk update
        console.log('Creating staging table in Supabase...');
        await executeSql(`
            CREATE TABLE IF NOT EXISTS public.staging_nhc_sexo (
                nhc TEXT PRIMARY KEY,
                sexo TEXT
            );
            TRUNCATE TABLE public.staging_nhc_sexo;
        `);

        // Insert in chunks of 5000
        const CHUNK_SIZE = 5000;
        console.log(`Inserting ${rows.length} rows into staging_nhc_sexo...`);
        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
            const chunk = rows.slice(i, i + CHUNK_SIZE);
            const values = chunk.map(r => `('${r.nhc.replace(/'/g, "''")}', '${r.sexo}')`).join(',\n');
            await executeSql(`
                INSERT INTO public.staging_nhc_sexo (nhc, sexo)
                VALUES ${values}
                ON CONFLICT (nhc) DO NOTHING;
            `);
            console.log(`Inserted ${Math.min(i + CHUNK_SIZE, rows.length)} / ${rows.length}...`);
        }

        console.log('Updating calidad_admisiones_ocupacion from staging_nhc_sexo...');
        const upd1 = await executeSql(`
            UPDATE public.calidad_admisiones_ocupacion c
            SET sexo = t.sexo
            FROM public.staging_nhc_sexo t
            WHERE c.nhc = t.nhc;
        `);
        console.log('calidad_admisiones_ocupacion updated.');

        console.log('Updating calidad_admisiones_camas_historial from staging_nhc_sexo...');
        await executeSql(`
            UPDATE public.calidad_admisiones_camas_historial c
            SET sexo = t.sexo
            FROM public.staging_nhc_sexo t
            WHERE c.nhc = t.nhc;
        `);
        console.log('calidad_admisiones_camas_historial updated.');

        console.log('Verifying UCI counts in calidad_admisiones_ocupacion:');
        const counts = await executeSql(`
            SELECT sexo, COUNT(DISTINCT id_admision) as admisiones, COUNT(*) as dias_cama
            FROM public.calidad_admisiones_ocupacion
            WHERE servicio IN ('UCI', 'TERAPIA INTERMEDIA')
            GROUP BY sexo;
        `);
        console.log('UCI distribution by sexo in Supabase:', counts);

    } finally {
        await pool.close();
    }
}

backfill().catch(console.error);
