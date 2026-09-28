import sql from 'mssql';

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
        requestTimeout: 60000,
        connectionTimeout: 20000,
        tdsVersion: '7_4',
    }
};

async function test() {
    try {
        const pool = await sql.connect(SQL_CONFIG);
        console.log('Connected to SALUS');

        // Check TABLEAU_Cirugias columns:
        const qCols = await pool.request().query(`
            SELECT TOP 3 * FROM TABLEAU_Cirugias;
        `);
        console.log('TABLEAU_Cirugias Columns:', Object.keys(qCols.recordset[0] || {}));
        console.log('Sample surgery:', qCols.recordset[0]);

        // Cross VLISE_Visitas (GUARDIA CLINICA) with TABLEAU_Cirugias within 48h for Agosto/Septiembre 2026:
        const qCross = await pool.request().query(`
            DECLARE @FechaDesde DATETIME = '2026-08-01 00:00:00';
            DECLARE @FechaHasta DATETIME = '2026-08-31 23:59:59';

            SELECT TOP 20
                v.NHC AS nhc,
                v.Paciente AS paciente,
                v.[Fecha Visita] AS fecha_guardia,
                v.[Fecha Entrada Real] AS hora_llegada_guardia,
                c.[Fecha cirugia] AS fecha_cirugia,
                c.[Hora de inicio cirugia] AS hora_cirugia,
                c.Cirugia AS cirugia_procedimiento,
                c.Especialidad AS especialidad_quirurgica,
                c.Cirujano AS cirujano,
                c.Tipo AS tipo_cirugia,
                c.Estado AS estado_cirugia,
                DATEDIFF(HOUR, v.[Fecha Entrada Real], c.[Fecha cirugia]) AS horas_hasta_cirugia
            FROM VLISE_Visitas v
            INNER JOIN TABLEAU_Cirugias c 
                ON v.NHC = c.NHC
               AND c.[Fecha cirugia] >= v.[Fecha Visita]
               AND c.[Fecha cirugia] <= DATEADD(HOUR, 48, v.[Fecha Visita])
            WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
              AND v.[Fecha Visita] >= @FechaDesde
              AND v.[Fecha Visita] <= @FechaHasta
              AND v.Asistencia = 'Presente'
            ORDER BY c.[Fecha cirugia] DESC;
        `);
        console.log('Cirugías derivadas de Guardia en Agosto 2026 (top 20):', qCross.recordset);

        // Agrupación por procedimiento y especialidad en Agosto 2026:
        const qStats = await pool.request().query(`
            DECLARE @FechaDesde DATETIME = '2026-08-01 00:00:00';
            DECLARE @FechaHasta DATETIME = '2026-08-31 23:59:59';

            SELECT 
                c.Especialidad AS especialidad,
                c.Cirugia AS procedimiento,
                COUNT(*) AS total_cirugias,
                AVG(DATEDIFF(HOUR, v.[Fecha Entrada Real], c.[Fecha cirugia])) AS avg_horas_espera
            FROM VLISE_Visitas v
            INNER JOIN TABLEAU_Cirugias c 
                ON v.NHC = c.NHC
               AND c.[Fecha cirugia] >= v.[Fecha Visita]
               AND c.[Fecha cirugia] <= DATEADD(HOUR, 48, v.[Fecha Visita])
            WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
              AND v.[Fecha Visita] >= @FechaDesde
              AND v.[Fecha Visita] <= @FechaHasta
              AND v.Asistencia = 'Presente'
            GROUP BY c.Especialidad, c.Cirugia
            ORDER BY total_cirugias DESC;
        `);
        console.log('Top Procedimientos Quirúrgicos de Guardia en Agosto:', qStats.recordset.slice(0, 15));

        await pool.close();
    } catch(err) {
        console.error('Error:', err);
    }
}
test();
