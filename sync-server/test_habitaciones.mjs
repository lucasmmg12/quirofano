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
        requestTimeout: 120000,
        connectionTimeout: 15000,
        tdsVersion: '7_4',
    },
};

async function check() {
    await sql.connect(SQL_CONFIG);
    const res = await sql.query(`
        SELECT TOP 30 HOSP_Habitacion, COUNT(*) as cnt
        FROM VLISE_PeticionesPruebas
        WHERE [Fecha Solicitud] >= '2025-06-01' AND Origen = 'Hospitalización'
        GROUP BY HOSP_Habitacion
        ORDER BY cnt DESC
    `);
    console.table(res.recordset);
    await sql.close();
}
check();
