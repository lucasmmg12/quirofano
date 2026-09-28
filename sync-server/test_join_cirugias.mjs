import sql from 'mssql';

const SQL_CONFIG = {
    server: '128.223.16.29',
    port: 2450,
    user: 'SalusConsulta',
    password: 'ConsultaSALUS1234',
    database: 'SALUS',
    options: { encrypt: false, trustServerCertificate: true },
};

async function test() {
    let pool = await sql.connect(SQL_CONFIG);
    const topCir = await pool.request().query(`
        SELECT TOP 3 *
        FROM [SALUS].[dbo].[TABLEAU_Cirugias]
        ORDER BY [Fecha realización] DESC
    `);
    console.log("Sample Cirugia:", topCir.recordset[0]);

    // Let's test join between VLISE_Visitas (GUARDIA CLINICA) and TABLEAU_Cirugias
    // Let's see if v.NHC = c.Cliente OR v.NHC = c.DNI or c.idvisita = v.idVisita
    const joinTest = await pool.request().query(`
        SELECT TOP 10 
            v.NHC, v.Paciente, v.[Fecha Visita], v.[Fecha Entrada Real],
            c.Cliente, c.DNI, c.[Nombre Paciente], c.[Nombre cirugía], c.Especialidad, c.Cirujano,
            c.[Fecha realización], c.[Hora Inicio cirugía], c.[Fecha programada]
        FROM VLISE_Visitas v
        INNER JOIN [SALUS].[dbo].[TABLEAU_Cirugias] c 
            ON (v.NHC = c.Cliente OR v.NHC = c.DNI)
        WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
          AND v.[Fecha Visita] >= '2026-08-01'
          AND v.[Fecha Visita] <= '2026-08-31'
          AND c.[Fecha realización] >= '2026-08-01'
    `);
    console.log("Join by NHC=Cliente or NHC=DNI matches:", joinTest.recordset.length);
    if (joinTest.recordset.length > 0) {
        console.log("Match sample:", joinTest.recordset[0]);
    }

    pool.close();
}
test();
