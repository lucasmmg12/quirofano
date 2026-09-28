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

async function syncPeriod(pool, periodo, desde, hasta) {
    console.log(`\n⏱️ [TIEMPOS] Extrayendo visitas y tiempos para ${periodo} (${desde} al ${hasta})...`);

    const query = `
        DECLARE @FechaDesde DATETIME = '${desde} 00:00:00';
        DECLARE @FechaHasta DATETIME = '${hasta} 23:59:59';

        WITH TriageReal AS (
            SELECT 
                r.idEntrada,
                MAX(CASE WHEN r.idPreguntaPr = 13807 THEN CAST(r.valorM AS VARCHAR(MAX)) END) AS ObservacionTriage
            FROM [PR InstRespEntrada] r
            WHERE r.idPreguntaPr IN (13802, 13814, 13803, 13804, 13805, 13806, 13815, 13807)
              AND r.activo = 1
            GROUP BY r.idEntrada
        ),
        AdmisionesDestino AS (
            SELECT 
                adm.NHC,
                adm.Procedencia,
                adm.Servicio,
                adm.Especialidad,
                adm.[Fecha ingreso] AS FechaIngreso,
                ROW_NUMBER() OVER(PARTITION BY adm.NHC ORDER BY adm.[Fecha ingreso] ASC) as rn
            FROM TABLEAU_Admisiones adm
            WHERE adm.Procedencia = 'Derivado desde Urgencias'
        )
        SELECT 
            '${periodo}' AS periodo,
            v.idVisita AS id_visita,
            LTRIM(RTRIM(v.NHC)) AS nhc,
            LTRIM(RTRIM(v.Paciente)) AS paciente,
            LTRIM(RTRIM(v.Cliente)) AS obra_social,
            LTRIM(RTRIM(v.Agenda)) AS agenda,
            LTRIM(RTRIM(v.[Tipo Visita])) AS tipo_visita,
            CONVERT(VARCHAR(10), v.[Fecha Visita], 23) AS fecha_visita,
            CONVERT(VARCHAR(8), v.[Fecha Entrada Real], 108) AS hora_llegada,
            CONVERT(VARCHAR(8), v.[Fecha Hora Entrada], 108) AS hora_atencion,
            CONVERT(VARCHAR(8), v.[Fecha Salida Real], 108) AS hora_egreso,
            CASE 
                WHEN v.[Fecha Entrada Real] IS NOT NULL AND v.[Fecha Hora Entrada] IS NOT NULL 
                     AND v.[Fecha Hora Entrada] >= v.[Fecha Entrada Real]
                THEN DATEDIFF(MINUTE, v.[Fecha Entrada Real], v.[Fecha Hora Entrada])
                ELSE NULL 
            END AS minutos_espera,
            CASE 
                WHEN v.[Fecha Entrada Real] IS NOT NULL AND v.[Fecha Salida Real] IS NOT NULL
                     AND v.[Fecha Salida Real] >= v.[Fecha Entrada Real]
                THEN DATEDIFF(MINUTE, v.[Fecha Entrada Real], v.[Fecha Salida Real])
                ELSE NULL 
            END AS minutos_permanencia,
            CASE 
                WHEN UPPER(tr.ObservacionTriage) LIKE '%ROJO%' THEN 'N1 Rojo (Emergencia)'
                WHEN UPPER(tr.ObservacionTriage) LIKE '%NARANJA%' THEN 'N2 Naranja (Muy Urgente)'
                WHEN UPPER(tr.ObservacionTriage) LIKE '%AMARILLO%' THEN 'N3 Amarillo (Urgente)'
                WHEN UPPER(tr.ObservacionTriage) LIKE '%VERDE%' THEN 'N4 Verde (Poco Urgente)'
                WHEN UPPER(tr.ObservacionTriage) LIKE '%AZUL%' THEN 'N5 Azul (No Urgente)'
                WHEN tr.idEntrada IS NOT NULL THEN 'Evaluado Clínico / Signos'
                ELSE 'Sin Triage'
            END AS nivel_triage,
            CASE 
                WHEN adm.NHC IS NOT NULL AND (adm.Servicio = 'UCI' OR adm.Especialidad LIKE '%TERAPIA%') THEN 'UCI / Cuidados Críticos'
                WHEN adm.NHC IS NOT NULL AND (adm.Especialidad LIKE '%CIRUGIA%' OR adm.Servicio LIKE '%QUIROF%') THEN 'Pase Directo a Quirófano'
                WHEN adm.NHC IS NOT NULL AND (adm.Especialidad = 'CLINICO ' OR adm.Servicio = 'INTERNADO') THEN 'Piso Clínico'
                WHEN adm.NHC IS NOT NULL THEN 'Internación General'
                ELSE 'Alta Médica a Domicilio'
            END AS destino
        FROM VLISE_Visitas v
        LEFT JOIN TriageReal tr ON v.idEntrada = tr.idEntrada
        LEFT JOIN AdmisionesDestino adm 
            ON adm.NHC = v.NHC 
           AND adm.rn = 1
           AND adm.FechaIngreso >= v.[Fecha Entrada Real]
           AND adm.FechaIngreso <= DATEADD(HOUR, 24, v.[Fecha Entrada Real])
        WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
          AND v.[Fecha Visita] >= @FechaDesde 
          AND v.[Fecha Visita] <= @FechaHasta
          AND v.Asistencia = 'Presente'
        ORDER BY v.[Fecha Visita] ASC, v.[Fecha Entrada Real] ASC;
    `;

    const res = await pool.request().query(query);
    const rows = res.recordset.map(r => ({
        ...r,
        es_outlier_espera: (r.minutos_espera != null && r.minutos_espera > 60),
        es_outlier_permanencia: (r.minutos_permanencia != null && r.minutos_permanencia > 180)
    }));

    console.log(`   ✅ Extraídas ${rows.length} visitas con tiempos.`);
    const outliersEspera = rows.filter(r => r.es_outlier_espera).length;
    const outliersPerm = rows.filter(r => r.es_outlier_permanencia).length;
    console.log(`   📊 Outliers: ${outliersEspera} con espera > 60min, ${outliersPerm} con permanencia > 3hs.`);

    if (rows.length === 0) return;

    const dedupedMap = new Map();
    for (const r of rows) {
        if (!dedupedMap.has(r.id_visita)) {
            dedupedMap.set(r.id_visita, r);
        }
    }
    const uniqueRows = Array.from(dedupedMap.values());
    console.log(`   📦 ${uniqueRows.length} visitas únicas deduplicadas (de ${rows.length}).`);

    // Limpiar período en Supabase e insertar en batches de 200
    await supabase.from('guardia_consultas_tiempos').delete().eq('periodo', periodo);
    const BATCH = 200;
    for (let i = 0; i < uniqueRows.length; i += BATCH) {
        const batch = uniqueRows.slice(i, i + BATCH);
        const { error } = await supabase.from('guardia_consultas_tiempos').insert(batch);
        if (error) {
            console.error(`   ❌ Error insert batch ${i}:`, error.message);
        }
    }
    console.log(`   💾 ${uniqueRows.length} registros guardados en guardia_consultas_tiempos.`);
}

async function main() {
    console.log('🚀 Sincronizando Tiempos y Outliers de Guardia Clínica...');
    const pool = await sql.connect(SQL_CONFIG);

    const periods = [
        { p: '2026-09', d: '2026-09-01', h: '2026-09-30' },
        { p: '2026-08', d: '2026-08-01', h: '2026-08-31' },
        { p: '2026-07', d: '2026-07-01', h: '2026-07-31' },
        { p: '2026-06', d: '2026-06-01', h: '2026-06-30' },
        { p: '2026-05', d: '2026-05-01', h: '2026-05-31' },
        { p: '2026-04', d: '2026-04-01', h: '2026-04-30' },
        { p: '2026-03', d: '2026-03-01', h: '2026-03-31' },
        { p: '2026-02', d: '2026-02-01', h: '2026-02-28' },
        { p: '2026-01', d: '2026-01-01', h: '2026-01-31' }
    ];

    for (const item of periods) {
        await syncPeriod(pool, item.p, item.d, item.h);
    }

    await pool.close();
    console.log('\n🏁 Sincronización de tiempos y outliers completada!');
}

main().catch(console.error);
