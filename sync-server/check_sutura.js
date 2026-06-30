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
    try {
        let pool = await sql.connect(SQL_CONFIG);
        
        console.log("Buscando registros del 15/06/2026 en TABLEAU_Visitas...");
        const resultVisitas = await pool.request().query(`
            SELECT TOP 50
                *
            FROM [SALUS].[dbo].[TABLEAU_Visitas]
            WHERE [Fecha] LIKE '15/06/2026%' OR [Fecha Visita] LIKE '15/06/2026%'
        `);
        console.table(resultVisitas.recordset);

        pool.close();
    } catch (err) {
        console.error(err);
    }
}
test();
