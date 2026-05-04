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
        SELECT COUNT(*) as c
        FROM [SALUS].[dbo].[TABLEAU_Cirugias]
        WHERE [Estado] IN ('URGENCIA', 'Urgencia', 'NO PROGRAMADA', 'No Programada')
        AND (LEN([Fecha realización]) < 10 OR [Fecha realización] IS NULL)
        AND [Especialidad] IN ('CIRUGIA', 'OTORRINOLARINGOLOGIA', 'CIRUGIA PEDIATRICA', 'ORTOPEDIA / TRAUMATOLOGIA', 'GINECOLOGIA')
    `);
    console.log("Urgencias without Fecha realizacion AND valid Especialidad:", result.recordset);
    pool.close();
}
test();
