import sql from 'mssql';
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

async function checkTriagePatients() {
    const pool = await sql.connect(SQL_CONFIG);
    const query = `
        DECLARE @FechaDesde DATETIME = '2026-09-01 00:00:00';
        DECLARE @FechaHasta DATETIME = '2026-09-30 23:59:59';

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
            v.NHC,
            v.Paciente,
            v.Cliente AS ObraSocial,
            v.Agenda,
            v.[Tipo Visita] AS TipoVisita,
            CONVERT(VARCHAR(10), v.[Fecha Visita], 103) AS FechaVisita,
            CONVERT(VARCHAR(8), v.[Fecha Entrada Real], 108) AS HoraLlegada,
            CASE 
                WHEN UPPER(tr.ObservacionTriage) LIKE '%ROJO%' THEN 'N1 Rojo (Emergencia)'
                WHEN UPPER(tr.ObservacionTriage) LIKE '%NARANJA%' THEN 'N2 Naranja (Muy Urgente)'
                WHEN UPPER(tr.ObservacionTriage) LIKE '%AMARILLO%' THEN 'N3 Amarillo (Urgente)'
                WHEN UPPER(tr.ObservacionTriage) LIKE '%VERDE%' THEN 'N4 Verde (Poco Urgente)'
                WHEN UPPER(tr.ObservacionTriage) LIKE '%AZUL%' THEN 'N5 Azul (No Urgente)'
                ELSE 'Evaluado Clínico / Signos'
            END AS NivelTriage,
            tr.ObservacionTriage,
            tr.TS, tr.TD, tr.FC, tr.Temp, tr.SAO2
        FROM VLISE_Visitas v
        INNER JOIN TriageReal tr ON v.idEntrada = tr.idEntrada
        WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
          AND v.[Fecha Visita] >= @FechaDesde 
          AND v.[Fecha Visita] <= @FechaHasta
          AND v.Asistencia = 'Presente'
        ORDER BY v.[Fecha Visita] ASC, v.[Fecha Entrada Real] ASC;
    `;

    console.log('Consultando SALUS...');
    const res = await pool.request().query(query);
    console.log(`Total pacientes encontrados con triage de enfermería: ${res.recordset.length}`);
    if (res.recordset.length > 0) {
        console.log('Muestra primeros 3:', res.recordset.slice(0, 3));
    }
    await pool.close();
}

checkTriagePatients().catch(console.error);
