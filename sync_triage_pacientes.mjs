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

async function syncTriagePatients(periodo, desde, hasta) {
    console.log(`\n🔄 Sincronizando pacientes nominales con triage para ${periodo} (${desde} a ${hasta})...`);
    const pool = await sql.connect(SQL_CONFIG);

    const query = `
        DECLARE @FechaDesde DATETIME = '${desde} 00:00:00';
        DECLARE @FechaHasta DATETIME = '${hasta} 23:59:59';

        WITH TriageReal AS (
            SELECT 
                r.idEntrada,
                MAX(CASE WHEN r.idPreguntaPr = 13807 THEN CAST(r.valorM AS VARCHAR(MAX)) END) AS ObservacionTriage,
                MAX(CASE WHEN r.idPreguntaPr = 13802 THEN r.valorN END) AS TD,
                MAX(CASE WHEN r.idPreguntaPr = 13814 THEN r.valorN END) AS TS,
                MAX(CASE WHEN r.idPreguntaPr = 13803 THEN r.valorN END) AS FC,
                MAX(CASE WHEN r.idPreguntaPr = 13804 THEN r.valorN END) AS Temp,
                MAX(CASE WHEN r.idPreguntaPr = 13815 THEN r.valorN END) AS SAO2
            FROM [PR InstRespEntrada] r
            WHERE r.idPreguntaPr IN (13802, 13814, 13803, 13804, 13805, 13806, 13815, 13807)
              AND r.activo = 1
            GROUP BY r.idEntrada
        )
        SELECT 
            '${periodo}' AS periodo,
            LTRIM(RTRIM(v.NHC)) AS nhc,
            LTRIM(RTRIM(v.Paciente)) AS paciente,
            LTRIM(RTRIM(v.Cliente)) AS obra_social,
            LTRIM(RTRIM(v.Agenda)) AS agenda,
            LTRIM(RTRIM(v.[Tipo Visita])) AS tipo_visita,
            CONVERT(VARCHAR(10), v.[Fecha Visita], 23) AS fecha_visita,
            CONVERT(VARCHAR(8), v.[Fecha Entrada Real], 108) AS hora_llegada,
            CASE 
                WHEN UPPER(tr.ObservacionTriage) LIKE '%ROJO%' THEN 'N1 Rojo (Emergencia)'
                WHEN UPPER(tr.ObservacionTriage) LIKE '%NARANJA%' THEN 'N2 Naranja (Muy Urgente)'
                WHEN UPPER(tr.ObservacionTriage) LIKE '%AMARILLO%' THEN 'N3 Amarillo (Urgente)'
                WHEN UPPER(tr.ObservacionTriage) LIKE '%VERDE%' THEN 'N4 Verde (Poco Urgente)'
                WHEN UPPER(tr.ObservacionTriage) LIKE '%AZUL%' THEN 'N5 Azul (No Urgente)'
                ELSE 'Evaluado Clínico / Signos'
            END AS nivel_triage,
            ISNULL(CAST(tr.ObservacionTriage AS VARCHAR(500)), NULL) AS observacion_enfermeria,
            tr.TS AS ta_sistolica,
            tr.TD AS ta_diastolica,
            tr.FC AS fc,
            tr.Temp AS temperatura,
            tr.SAO2 AS sato2
        FROM VLISE_Visitas v
        INNER JOIN TriageReal tr ON v.idEntrada = tr.idEntrada
        WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
          AND v.[Fecha Visita] >= @FechaDesde 
          AND v.[Fecha Visita] <= @FechaHasta
          AND v.Asistencia = 'Presente'
        ORDER BY v.[Fecha Visita] ASC, v.[Fecha Entrada Real] ASC;
    `;

    const res = await pool.request().query(query);
    const rows = res.recordset;
    console.log(`   ✅ Extraídos ${rows.length} pacientes de SALUS.`);

    if (rows.length === 0) {
        await pool.close();
        return;
    }

    // Eliminar registros previos del período para evitar conflictos
    await supabase.from('guardia_triage_pacientes').delete().eq('periodo', periodo);

    // Deduplicar en memoria por clave única (nhc, fecha_visita, hora_llegada)
    const uniqueMap = new Map();
    for (const r of rows) {
        const key = `${r.periodo}_${r.nhc}_${r.fecha_visita}_${r.hora_llegada}`;
        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, r);
        }
    }
    const deduplicatedRows = Array.from(uniqueMap.values());
    console.log(`   🔎 Deduplicados: ${deduplicatedRows.length} registros únicos.`);

    // Insertar en lotes de 100 a Supabase
    const batchSize = 100;
    for (let i = 0; i < deduplicatedRows.length; i += batchSize) {
        const batch = deduplicatedRows.slice(i, i + batchSize);
        const { error } = await supabase
            .from('guardia_triage_pacientes')
            .insert(batch);
        
        if (error) {
            console.error(`   ❌ Error insert en batch ${i}:`, error.message);
        }
    }

    console.log(`   💾 ${deduplicatedRows.length} registros guardados en Supabase.`);
    await pool.close();
}

async function main() {
    await syncTriagePatients('2026-09', '2026-09-01', '2026-09-30');
    await syncTriagePatients('2026-08', '2026-08-01', '2026-08-31');
    await syncTriagePatients('2026-07', '2026-07-01', '2026-07-31');
    console.log('\n🏁 Sincronización nominal de Triage completada!');
}

main().catch(console.error);
