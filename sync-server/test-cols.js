import sql from 'mssql';
import { config } from 'dotenv';
config({ path: 'c:\\Users\\Sanatorio Argentino\\Desktop\\Proyectos\\Sistema ADM-QUI\\.env' });

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
    const result = await pool.request().query(`
        SELECT TOP 1 *
        FROM [SALUS].[dbo].[TABLEAU_Cirugias]
        WHERE [Estado] IN ('URGENCIA', 'Urgencia', 'NO PROGRAMADA', 'No Programada')
        AND (LEN([Fecha realización]) < 10 OR [Fecha realización] IS NULL)
    `);
    console.log("Columns:", Object.keys(result.recordset[0]));
    console.log("Data:", result.recordset[0]);
    pool.close();
}
test();
