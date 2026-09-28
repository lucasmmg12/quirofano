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

async function investigateDifference() {
    const pool = await sql.connect(SQL_CONFIG);

    console.log('--- ANÁLISIS SEPTIEMBRE 2026 EN SALUS ---');
    const qSep = `
        SELECT 
            v.[Grupo Agenda] AS GrupoAgenda,
            v.Agenda,
            v.Asistencia,
            COUNT(*) AS Total
        FROM VLISE_Visitas v
        WHERE v.[Fecha Visita] >= '2026-09-01 00:00:00'
          AND v.[Fecha Visita] <= '2026-09-30 23:59:59'
          AND (v.[Grupo Agenda] = 'GUARDIA CLINICA' OR v.Agenda LIKE '%CLINICA%')
        GROUP BY v.[Grupo Agenda], v.Agenda, v.Asistencia
        ORDER BY v.[Grupo Agenda], v.Agenda, v.Asistencia;
    `;
    const resSep = await pool.request().query(qSep);
    console.table(resSep.recordset);

    console.log('--- ANÁLISIS AGOSTO 2026 EN SALUS ---');
    const qAgo = `
        SELECT 
            v.[Grupo Agenda] AS GrupoAgenda,
            v.Agenda,
            v.Asistencia,
            COUNT(*) AS Total
        FROM VLISE_Visitas v
        WHERE v.[Fecha Visita] >= '2026-08-01 00:00:00'
          AND v.[Fecha Visita] <= '2026-08-31 23:59:59'
          AND (v.[Grupo Agenda] = 'GUARDIA CLINICA' OR v.Agenda LIKE '%CLINICA%')
        GROUP BY v.[Grupo Agenda], v.Agenda, v.Asistencia
        ORDER BY v.[Grupo Agenda], v.Agenda, v.Asistencia;
    `;
    const resAgo = await pool.request().query(qAgo);
    console.table(resAgo.recordset);

    await pool.close();
}

investigateDifference().catch(console.error);
