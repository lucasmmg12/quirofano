import sql from 'mssql';

const SQL_CONFIG = {
    server: '128.223.16.29',
    port: 2450,
    user: 'SalusConsulta',
    password: 'ConsultaSALUS1234',
    database: 'SALUS',
    options: { encrypt: false, trustServerCertificate: true, requestTimeout: 60000 },
};

async function testAll2026() {
    let pool = await sql.connect(SQL_CONFIG);

    // Let's count matching surgeries from Guardia Clínica by month in 2026
    const qCountByMonth = `
        WITH GuardiaConsultas AS (
            SELECT 
                v.idVisita,
                v.NHC,
                v.NIF,
                v.Paciente,
                v.[Fecha Visita] AS FechaVisita,
                v.[Fecha Entrada Real] AS FechaHoraLlegada,
                v.[Grupo Agenda]
            FROM VLISE_Visitas v
            WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
              AND v.[Fecha Visita] >= '2026-01-01'
              AND v.[Fecha Visita] < '2026-10-01'
              AND v.Asistencia = 'Presente'
        ),
        CirugiasConexion AS (
            SELECT 
                MONTH(g.FechaVisita) AS Mes,
                g.idVisita AS idVisitaGuardia,
                c.idvisita AS idVisitaCirugia,
                c.[Nombre cirugía] AS Cirugia,
                c.Especialidad,
                c.Cirujano
            FROM GuardiaConsultas g
            INNER JOIN TABLEAU_Cirugias c
                ON g.NIF = c.DNI
               AND c.[Fecha programada] >= CAST(g.FechaVisita AS DATE)
               AND c.[Fecha programada] <= DATEADD(HOUR, 48, g.FechaHoraLlegada)
        )
        SELECT 
            Mes,
            COUNT(*) AS TotalCirugias,
            COUNT(DISTINCT idVisitaGuardia) AS TotalPacientesUnicos
        FROM CirugiasConexion
        GROUP BY Mes
        ORDER BY Mes;
    `;

    const res = await pool.request().query(qCountByMonth);
    console.log("Cirugías desde Guardia Clínica por mes en 2026:");
    console.table(res.recordset);

    pool.close();
}
testAll2026();
