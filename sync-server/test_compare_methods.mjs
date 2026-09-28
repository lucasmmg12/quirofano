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

    const query = `
        DECLARE @FechaDesde DATETIME = '2026-08-01 00:00:00';
        DECLARE @FechaHasta DATETIME = '2026-08-31 23:59:59';

        WITH ConsultasGuardia AS (
            SELECT 
                v.idVisita,
                v.NHC,
                v.NIF,
                v.Paciente,
                v.[Fecha Visita] AS FechaVisita,
                v.[Fecha Entrada Real] AS FechaHoraLlegada
            FROM VLISE_Visitas v
            WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
              AND v.[Fecha Visita] >= @FechaDesde 
              AND v.[Fecha Visita] <= @FechaHasta
              AND v.Asistencia = 'Presente'
        ),
        -- Metodo 1: Directo por DNI (dentro de 48hs)
        CirugiasDirectas AS (
            SELECT DISTINCT
                cg.idVisita AS idVisitaGuardia,
                cg.NHC,
                cg.NIF,
                cg.Paciente,
                cg.FechaHoraLlegada,
                c.idvisita AS idVisitaCirugia,
                c.[Nombre cirugía] AS Cirugia,
                c.Especialidad,
                c.Cirujano,
                c.Estado,
                c.[Fecha programada] AS FechaProgramada,
                c.[Hora programada] AS HoraProgramada,
                c.[Fecha realización] AS FechaRealizacion,
                c.[Hora Inicio cirugía] AS HoraInicioCirugia,
                c.[Obra Social] AS ObraSocial
            FROM ConsultasGuardia cg
            INNER JOIN TABLEAU_Cirugias c
                ON cg.NIF = c.DNI
               AND c.[Fecha programada] >= CAST(cg.FechaHoraLlegada AS DATE)
               AND c.[Fecha programada] <= DATEADD(HOUR, 48, cg.FechaHoraLlegada)
        ),
        -- Metodo 2: Vía TABLEAU_Admisiones (dentro de 48hs de guardia)
        CirugiasViaAdmision AS (
            SELECT DISTINCT
                cg.idVisita AS idVisitaGuardia,
                cg.NHC,
                cg.NIF,
                cg.Paciente,
                cg.FechaHoraLlegada,
                c.idvisita AS idVisitaCirugia,
                c.[Nombre cirugía] AS Cirugia,
                c.Especialidad,
                c.Cirujano,
                c.Estado,
                c.[Fecha programada] AS FechaProgramada,
                c.[Hora programada] AS HoraProgramada,
                c.[Fecha realización] AS FechaRealizacion,
                c.[Hora Inicio cirugía] AS HoraInicioCirugia,
                c.[Obra Social] AS ObraSocial
            FROM ConsultasGuardia cg
            INNER JOIN TABLEAU_Admisiones adm
                ON adm.NHC = cg.NHC
               AND adm.[Fecha ingreso] >= cg.FechaHoraLlegada
               AND adm.[Fecha ingreso] <= DATEADD(HOUR, 48, cg.FechaHoraLlegada)
            INNER JOIN TABLEAU_Cirugias c
                ON adm.NIF = c.DNI
               AND (
                    (c.[Fecha programada] >= CAST(adm.[Fecha ingreso] AS DATE) AND c.[Fecha programada] <= DATEADD(DAY, 3, CAST(adm.[Fecha ingreso] AS DATE)))
               )
        )
        SELECT 
            (SELECT COUNT(*) FROM CirugiasDirectas) AS TotalDirectas,
            (SELECT COUNT(*) FROM CirugiasViaAdmision) AS TotalViaAdmision;
    `;

    const res = await pool.request().query(query);
    console.log("Totales Agosto 2026:", res.recordset[0]);

    // Let's also check Septiembre 2026:
    const resSep = await pool.request().query(query.replace(/2026-08/g, '2026-09'));
    console.log("Totales Septiembre 2026:", resSep.recordset[0]);

    // Let's also check Julio 2026:
    const resJul = await pool.request().query(query.replace(/2026-08/g, '2026-07'));
    console.log("Totales Julio 2026:", resJul.recordset[0]);

    pool.close();
}
test();
