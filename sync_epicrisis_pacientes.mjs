import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '.env') });

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
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://hakysnqiryimxbwdslwe.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function syncEpicrisisPeriod(pool, periodo, desde, hasta) {
    console.log(`\n🔄 Sincronizando altas clínicas y epicrisis para ${periodo} (${desde} a ${hasta})...`);

    const query = `
        DECLARE @FechaDesde DATETIME = '${desde} 00:00:00';
        DECLARE @FechaHasta DATETIME = '${hasta} 23:59:59';

        SELECT 
            '${periodo}' AS periodo,
            adm.idAdmision AS id_admision,
            LTRIM(RTRIM(adm.[Número admisión])) AS numero_admision,
            LTRIM(RTRIM(adm.NHC)) AS nhc,
            LTRIM(RTRIM(adm.Paciente)) AS paciente,
            LTRIM(RTRIM(adm.Cliente)) AS obra_social,
            adm.[Fecha ingreso] AS fecha_ingreso,
            adm.[Fecha alta] AS fecha_alta,
            ISNULL(adm.Dias, DATEDIFF(DAY, adm.[Fecha ingreso], ISNULL(adm.[Fecha alta], GETDATE()))) AS dias_estada,
            LTRIM(RTRIM(adm.Doctor)) AS doctor,
            LTRIM(RTRIM(adm.UsuarioAlta)) AS usuario_alta,
            LTRIM(RTRIM(adm.Habitación)) AS habitacion,
            LTRIM(RTRIM(adm.Proceso)) AS proceso,
            LTRIM(RTRIM(adm.[Motivo de alta])) AS motivo_alta,
            CASE WHEN adm.[Motivo de alta] IS NOT NULL THEN 1 ELSE 0 END AS tiene_epicrisis
        FROM [SALUS].[dbo].[TABLEAU_Admisiones] adm
        WHERE adm.Procedencia = 'Derivado desde Urgencias'
          AND adm.Especialidad = 'CLINICO '
          AND adm.[Fecha ingreso] >= @FechaDesde
          AND adm.[Fecha ingreso] <= @FechaHasta
        ORDER BY adm.[Fecha ingreso] DESC;
    `;

    const res = await pool.request().query(query);
    const rows = res.recordset;
    console.log(`   ✅ Extraídas ${rows.length} admisiones clínicas de SALUS.`);

    if (rows.length === 0) return;

    // Eliminar previos del período
    await supabase.from('guardia_epicrisis_altas').delete().eq('periodo', periodo);

    // Deduplicar por id_admision
    const uniqueMap = new Map();
    for (const r of rows) {
        if (!uniqueMap.has(r.id_admision)) {
            uniqueMap.set(r.id_admision, r);
        }
    }
    const deduplicated = Array.from(uniqueMap.values());

    const batchSize = 100;
    for (let i = 0; i < deduplicated.length; i += batchSize) {
        const batch = deduplicated.slice(i, i + batchSize);
        const { error } = await supabase.from('guardia_epicrisis_altas').insert(batch);
        if (error) {
            console.error(`   ❌ Error insertando lote ${i} - ${i + batchSize}:`, error.message);
        } else {
            console.log(`   💾 Insertados ${batch.length} registros en Supabase.`);
        }
    }
}

async function run() {
    const pool = await sql.connect(SQL_CONFIG);
    try {
        await syncEpicrisisPeriod(pool, '2026-09', '2026-09-01', '2026-09-30');
        await syncEpicrisisPeriod(pool, '2026-08', '2026-08-01', '2026-08-31');
        await syncEpicrisisPeriod(pool, '2026-07', '2026-07-01', '2026-07-31');
        await syncEpicrisisPeriod(pool, '2026-06', '2026-06-01', '2026-06-30');
        await syncEpicrisisPeriod(pool, '2026-05', '2026-05-01', '2026-05-31');
        await syncEpicrisisPeriod(pool, '2026-04', '2026-04-01', '2026-04-30');
        await syncEpicrisisPeriod(pool, '2026-03', '2026-03-01', '2026-03-31');
        await syncEpicrisisPeriod(pool, '2026-02', '2026-02-01', '2026-02-28');
        await syncEpicrisisPeriod(pool, '2026-01', '2026-01-01', '2026-01-31');
    } finally {
        await pool.close();
    }
}

run().catch(console.error);
