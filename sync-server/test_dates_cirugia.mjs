import sql from 'mssql';

const SQL_CONFIG = {
    server: '128.223.16.29',
    port: 2450,
    user: 'SalusConsulta',
    password: 'ConsultaSALUS1234',
    database: 'SALUS',
    options: { encrypt: false, trustServerCertificate: true, requestTimeout: 60000 },
};

async function testDates() {
    let pool = await sql.connect(SQL_CONFIG);

    const q = await pool.request().query(`
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
        SELECT TOP 10
            g.NHC,
            g.Paciente,
            g.FechaHoraLlegada,
            c.[Nombre cirugía] AS Cirugia,
            c.Especialidad,
            c.Cirujano,
            c.[Fecha programada] AS FechaProg,
            c.[Hora programada] AS HoraProg,
            c.[Fecha realización] AS FechaReal,
            c.[Hora Inicio cirugía] AS HoraInicio,
            c.[Hora fin cirugía] AS HoraFin,
            c.[Duracion Minutos Cirugia] AS DuracionMin,
            c.Estado,
            c.[Obra Social] AS ObraSocial
        FROM GuardiaConsultas g
        INNER JOIN TABLEAU_Cirugias c
            ON g.NIF = c.DNI
           AND c.[Fecha programada] >= CAST(g.FechaVisita AS DATE)
           AND c.[Fecha programada] <= DATEADD(DAY, 2, CAST(g.FechaVisita AS DATE))
        ORDER BY g.FechaHoraLlegada DESC;
    `);

    console.log("Sample records with both dates:");
    q.recordset.forEach((r, idx) => {
        console.log(`[#${idx+1}] Paciente: ${r.Paciente} | Cirugia: ${r.Cirugia}`);
        console.log(`     Guardia: ${r.FechaHoraLlegada?.toISOString()}`);
        console.log(`     Prog: ${r.FechaProg?.toISOString()} ${r.HoraProg} | Real: ${r.FechaReal} ${r.HoraInicio}`);
    });

    pool.close();
}
testDates();
