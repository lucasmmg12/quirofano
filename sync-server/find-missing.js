import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: 'c:\\Users\\Sanatorio Argentino\\Desktop\\Proyectos\\Sistema ADM-QUI\\.env' });

const SQL_CONFIG = {
    server: '128.223.16.29',
    port: 2450,
    user: 'SalusConsulta',
    password: 'ConsultaSALUS1234',
    database: 'SALUS',
    options: { encrypt: false, trustServerCertificate: true },
};

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

async function findMissing() {
    console.log("Fetching from Supabase...");
    const { data: supaData } = await supabase.from('asociaciones_cirugias').select('fecha_realizacion, nombre_paciente, estado').in('estado', ['URGENCIA', 'NO PROGRAMADA']);
    const supaSet = new Set(supaData.map(r => `${r.fecha_realizacion}|${r.nombre_paciente.toUpperCase()}`));

    console.log("Fetching from SALUS...");
    let pool = await sql.connect(SQL_CONFIG);
    const result = await pool.request().query(`
        SELECT 
            RIGHT(LEFT([Fecha realización], 10), 4) + '-' + SUBSTRING(LEFT([Fecha realización], 10), 4, 2) + '-' + LEFT([Fecha realización], 2) AS fecha,
            [Nombre Paciente] as nombre,
            [Especialidad] as especialidad,
            [Estado] as estado
        FROM [SALUS].[dbo].[TABLEAU_Cirugias]
        WHERE (RIGHT(LEFT([Fecha realización], 10), 4) + SUBSTRING(LEFT([Fecha realización], 10), 4, 2) + LEFT([Fecha realización], 2)) >= '20260301'
        AND [Estado] IN ('URGENCIA', 'Urgencia', 'NO PROGRAMADA', 'No Programada')
        AND [Especialidad] IN ('CIRUGIA', 'OTORRINOLARINGOLOGIA', 'CIRUGIA PEDIATRICA', 'ORTOPEDIA / TRAUMATOLOGIA', 'GINECOLOGIA')
    `);

    let missing = [];
    for (const r of result.recordset) {
        if (!r.nombre) continue;
        const key = `${r.fecha}|${r.nombre.trim().toUpperCase()}`;
        if (!supaSet.has(key)) {
            missing.push(r);
        }
    }

    console.log(`Found ${missing.length} missing urgencias!`);
    if (missing.length > 0) {
        console.table(missing.slice(0, 10));
    }
    pool.close();
}
findMissing();
