import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

const SQL_CONFIG = {
    server: '128.223.16.29',
    port: 2450,
    user: 'SalusConsulta',
    password: 'ConsultaSALUS1234',
    database: 'SALUS',
    options: { encrypt: false, trustServerCertificate: true },
};

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    // 1. Get count from Supabase
    const { count: sbCount, error } = await supabase
        .from('laboratorios_anatomia_patologica')
        .select('*', { count: 'exact', head: true })
        .gte('fecha_visita', '2026-03-01');

    if (error) {
        console.error('Supabase error:', error.message);
        return;
    }
    console.log('Total rows in Supabase (fecha_visita >= 2026-03-01):', sbCount);

    // 2. Connect to SALUS
    let pool = await sql.connect(SQL_CONFIG);

    // 3. Count total unique idvisita in VLIS_AnatomiaPatologica since 2026-03-01
    const salusUniqueRes = await pool.request().query(`
        SELECT COUNT(DISTINCT AP.idvisita) as cnt 
        FROM [SALUS].[dbo].[VLIS_AnatomiaPatologica] AP 
        WHERE AP.[Fecha visita] >= '20260301'
    `);
    const salusUnique = salusUniqueRes.recordset[0].cnt;
    console.log('Unique idvisita in SALUS (Fecha >= 2026-03-01):', salusUnique);

    // 4. Count with the current query join (PP.N.Admision IS NOT NULL)
    const currentQueryRes = await pool.request().query(`
        SELECT COUNT(DISTINCT AP.idvisita) as cnt 
        FROM [SALUS].[dbo].[VLIS_AnatomiaPatologica] AS AP
        LEFT JOIN [SALUS].[dbo].[VLISE_PeticionesPruebas] AS PP ON AP.[idvisita] = PP.[idVisita]
        WHERE AP.[Fecha visita] >= '20260301'
          AND PP.[N.Admision] IS NOT NULL
    `);
    const currentQuery = currentQueryRes.recordset[0].cnt;
    console.log('Unique idvisita returned by CURRENT sync query:', currentQuery);

    // 5. Check if there are rows in VLIS_AnatomiaPatologica where VLISE_Visitas (V) or VLISE_PeticionesPruebas (PP) has different cases or nulls
    const outerApplyRes = await pool.request().query(`
        SELECT COUNT(DISTINCT AP.idvisita) as cnt
        FROM [SALUS].[dbo].[VLIS_AnatomiaPatologica] AS AP
        OUTER APPLY (
            SELECT TOP 1 PP_Sub.[N.Admision] 
            FROM [SALUS].[dbo].[VLISE_PeticionesPruebas] AS PP_Sub
            WHERE PP_Sub.[idVisita] = AP.[idvisita]
              AND PP_Sub.[N.Admision] IS NOT NULL
        ) AS PP
        WHERE AP.[Fecha visita] >= '20260301'
    `);
    console.log('Unique idvisita with OUTER APPLY (no WHERE filter on N.Admision):', outerApplyRes.recordset[0].cnt);

    const outerApplyWithFilterRes = await pool.request().query(`
        SELECT COUNT(DISTINCT AP.idvisita) as cnt
        FROM [SALUS].[dbo].[VLIS_AnatomiaPatologica] AS AP
        OUTER APPLY (
            SELECT TOP 1 PP_Sub.[N.Admision] 
            FROM [SALUS].[dbo].[VLISE_PeticionesPruebas] AS PP_Sub
            WHERE PP_Sub.[idVisita] = AP.[idvisita]
              AND PP_Sub.[N.Admision] IS NOT NULL
        ) AS PP
        WHERE AP.[Fecha visita] >= '20260301'
          AND PP.[N.Admision] IS NOT NULL
    `);
    console.log('Unique idvisita with OUTER APPLY and PP.[N.Admision] IS NOT NULL:', outerApplyWithFilterRes.recordset[0].cnt);

    pool.close();
}

check();
