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
        SELECT [Especialidad], COUNT(*) as count
        FROM [SALUS].[dbo].[TABLEAU_Cirugias]
        WHERE [Estado] IN ('URGENCIA', 'Urgencia', 'NO PROGRAMADA', 'No Programada')
        AND (RIGHT(LEFT([Fecha realización], 10), 4) + SUBSTRING(LEFT([Fecha realización], 10), 4, 2) + LEFT([Fecha realización], 2)) >= '20260301'
        GROUP BY [Especialidad]
        ORDER BY count DESC
    `);
    console.log("URGENCIAS POR ESPECIALIDAD:");
    console.table(result.recordset);
    pool.close();
}
test();
