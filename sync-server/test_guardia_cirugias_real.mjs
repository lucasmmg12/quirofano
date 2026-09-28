import sql from 'mssql';

const SQL_CONFIG = {
    server: '128.223.16.29',
    port: 2450,
    user: 'SalusConsulta',
    password: 'ConsultaSALUS1234',
    database: 'SALUS',
    options: { encrypt: false, trustServerCertificate: true, requestTimeout: 60000 },
};

async function test() {
    let pool = await sql.connect(SQL_CONFIG);

    const queryCross = `
        WITH GuardiaConsultas AS (
            SELECT 
                v.idVisita,
                v.NHC,
                v.NIF,
                v.Paciente,
                v.[Fecha Visita] AS FechaVisita,
                v.[Fecha Entrada Real] AS FechaHoraLlegada
            FROM VLISE_Visitas v
            WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
              AND v.[Fecha Visita] >= '2026-08-01'
              AND v.[Fecha Visita] <= '2026-08-31'
              AND v.Asistencia = 'Presente'
        ),
        CirugiasGuardia AS (
            SELECT 
                g.idVisita AS idVisitaGuardia,
                g.NHC,
                g.NIF,
                g.Paciente,
                g.FechaVisita,
                g.FechaHoraLlegada,
                c.idvisita AS idVisitaCirugia,
                c.[Nombre cirugía] AS Cirugia,
                c.Especialidad AS EspecialidadCirugia,
                c.Cirujano,
                c.Estado AS EstadoCirugia,
                c.Tipo AS TipoCirugia,
                c.[Obra Social] AS ObraSocialCirugia,
                c.[Fecha programada] AS FechaProgramada,
                c.[Hora programada] AS HoraProgramada,
                c.[Fecha realización] AS FechaRealizacion,
                c.[Hora Inicio cirugía] AS HoraInicioCirugia,
                DATEDIFF(HOUR, g.FechaHoraLlegada, c.[Fecha programada]) AS HorasDesdeGuardia
            FROM GuardiaConsultas g
            INNER JOIN TABLEAU_Cirugias c
                ON g.NIF = c.DNI
               AND c.[Fecha programada] >= CAST(g.FechaVisita AS DATE)
               AND c.[Fecha programada] <= DATEADD(DAY, 2, CAST(g.FechaVisita AS DATE))
        )
        SELECT 
            Cirugia,
            EspecialidadCirugia,
            COUNT(*) AS Cantidad
        FROM CirugiasGuardia
        GROUP BY Cirugia, EspecialidadCirugia
        ORDER BY Cantidad DESC;
    `;

    console.log("Running query for Agosto 2026...");
    const res = await pool.request().query(queryCross);
    console.log("Top Cirugías desde Guardia (Agosto 2026):");
    console.table(res.recordset);

    const samplePacientes = await pool.request().query(`
        WITH GuardiaConsultas AS (
            SELECT 
                v.idVisita,
                v.NHC,
                v.NIF,
                v.Paciente,
                v.[Fecha Visita] AS FechaVisita,
                v.[Fecha Entrada Real] AS FechaHoraLlegada
            FROM VLISE_Visitas v
            WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
              AND v.[Fecha Visita] >= '2026-08-01'
              AND v.[Fecha Visita] <= '2026-08-31'
              AND v.Asistencia = 'Presente'
        )
        SELECT TOP 20
            g.NHC,
            g.Paciente,
            g.FechaHoraLlegada,
            c.[Nombre cirugía] AS Cirugia,
            c.Especialidad,
            c.Cirujano,
            c.[Fecha programada] AS FechaProgramada,
            c.[Hora programada] AS HoraProgramada,
            c.[Fecha realización] AS FechaRealizacion,
            c.[Hora Inicio cirugía] AS HoraInicio,
            c.Estado,
            c.[Obra Social] AS ObraSocial
        FROM GuardiaConsultas g
        INNER JOIN TABLEAU_Cirugias c
            ON g.NIF = c.DNI
           AND c.[Fecha programada] >= CAST(g.FechaVisita AS DATE)
           AND c.[Fecha programada] <= DATEADD(DAY, 2, CAST(g.FechaVisita AS DATE))
        ORDER BY g.FechaHoraLlegada DESC;
    `);
    console.log("Sample Pacientes:");
    console.table(samplePacientes.recordset);

    pool.close();
}
test();
