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
    
    // Check TABLEAU_Admisiones columns
    const admCols = await pool.request().query(`SELECT TOP 1 * FROM TABLEAU_Admisiones;`);
    console.log("TABLEAU_Admisiones columns:", Object.keys(admCols.recordset[0] || {}));
    console.log("Sample Admision:", admCols.recordset[0]);

    // Check TABLEAU_Cirugias columns
    const cirCols = await pool.request().query(`SELECT TOP 1 * FROM TABLEAU_Cirugias;`);
    console.log("TABLEAU_Cirugias columns:", Object.keys(cirCols.recordset[0] || {}));
    console.log("Sample Cirugia:", cirCols.recordset[0]);

    // Check if TABLEAU_Cirugias has NHC or if DNI is DNI, or if idvisita connects to TABLEAU_Admisiones.idvisita or idEntrada
    const sampleCross = await pool.request().query(`
        SELECT TOP 5
            adm.NHC, adm.Paciente, adm.[Fecha ingreso], adm.Servicio, adm.Especialidad,
            cir.[Nombre Paciente], cir.DNI, cir.[Nombre cirugía], cir.Especialidad AS EspCir, cir.Cirujano,
            cir.[Fecha realización], cir.[Hora Inicio cirugía], cir.idvisita
        FROM TABLEAU_Admisiones adm
        INNER JOIN TABLEAU_Cirugias cir
            ON adm.idvisita = cir.idvisita
        WHERE adm.[Fecha ingreso] >= '2026-08-01'
    `);
    console.log("Cross adm.idvisita = cir.idvisita:", sampleCross.recordset);

    pool.close();
}
test();
