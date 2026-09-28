import sql from 'mssql';

const SQL_CONFIG = {
    server: '128.223.16.29',
    port: 2450,
    user: 'SalusConsulta',
    password: 'ConsultaSALUS1234',
    database: 'SALUS',
    options: { encrypt: false, trustServerCertificate: true, requestTimeout: 30000 },
};

async function test() {
    let pool = await sql.connect(SQL_CONFIG);

    // Let's test matching TABLEAU_Cirugias with VLISE_Visitas (GUARDIA CLINICA)
    // 1) Match on DNI = NIF
    const matchDniNif = await pool.request().query(`
        SELECT TOP 5
            v.NHC, v.NIF, v.Paciente, v.[Fecha Visita], v.[Fecha Entrada Real],
            c.DNI, c.[Nombre Paciente], c.[Nombre cirugía], c.Especialidad, c.Cirujano,
            c.[Fecha realización], c.[Hora Inicio cirugía], c.[Fecha programada], c.Estado
        FROM VLISE_Visitas v
        INNER JOIN TABLEAU_Cirugias c 
            ON v.NIF = c.DNI
        WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
          AND v.[Fecha Visita] >= '2026-08-01'
          AND v.[Fecha Visita] <= '2026-08-31'
          AND c.[Fecha programada] >= '2026-08-01'
          AND c.[Fecha programada] <= '2026-09-05'
    `);
    console.log("Match on v.NIF = c.DNI count:", matchDniNif.recordset.length);
    if (matchDniNif.recordset.length > 0) {
        console.log("Match sample DNI=NIF:", matchDniNif.recordset[0]);
    }

    // 2) Match on v.NHC = c.DNI
    const matchNhcDni = await pool.request().query(`
        SELECT TOP 5
            v.NHC, v.NIF, v.Paciente, v.[Fecha Visita],
            c.DNI, c.[Nombre Paciente], c.[Nombre cirugía]
        FROM VLISE_Visitas v
        INNER JOIN TABLEAU_Cirugias c 
            ON v.NHC = c.DNI
        WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
          AND v.[Fecha Visita] >= '2026-08-01'
          AND v.[Fecha Visita] <= '2026-08-31'
          AND c.[Fecha programada] >= '2026-08-01'
    `);
    console.log("Match on v.NHC = c.DNI count:", matchNhcDni.recordset.length);

    // 3) Match via TABLEAU_Admisiones:
    // In sync_guardia_indicadores.mjs:
    // cg.NHC = adm.NHC, and adm was: adm.Especialidad LIKE '%CIRUGIA%' OR adm.Servicio LIKE '%QUIROF%' OR adm.Procedencia = 'Derivado desde Urgencias'
    // Let's see if adm matches TABLEAU_Cirugias on adm.NIF = c.DNI or similar:
    const matchAdmCir = await pool.request().query(`
        SELECT TOP 10
            adm.NHC, adm.NIF, adm.Paciente, adm.[Fecha ingreso], adm.Servicio, adm.Especialidad AS AdmEsp,
            c.DNI, c.[Nombre Paciente], c.[Nombre cirugía], c.Especialidad AS CirEsp, c.Cirujano,
            c.[Fecha realización], c.[Fecha programada], c.[Hora Inicio cirugía]
        FROM TABLEAU_Admisiones adm
        INNER JOIN TABLEAU_Cirugias c 
            ON adm.NIF = c.DNI
           AND (
                (c.[Fecha realización] IS NOT NULL AND TRY_CONVERT(DATETIME, c.[Fecha realización], 103) >= CAST(adm.[Fecha ingreso] AS DATE))
                OR (c.[Fecha programada] >= CAST(adm.[Fecha ingreso] AS DATE))
           )
        WHERE adm.[Fecha ingreso] >= '2026-08-01'
          AND adm.[Fecha ingreso] <= '2026-08-31'
          AND (adm.Procedencia = 'Derivado desde Urgencias' OR adm.Servicio LIKE '%QUIROF%' OR adm.Especialidad LIKE '%CIRUGIA%')
    `);
    console.log("Match via TABLEAU_Admisiones NIF=DNI count:", matchAdmCir.recordset.length);
    if (matchAdmCir.recordset.length > 0) {
        console.log("Admision to Cirugia sample:", matchAdmCir.recordset[0]);
    }

    pool.close();
}
test();
