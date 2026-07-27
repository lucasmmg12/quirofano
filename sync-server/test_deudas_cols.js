import sql from 'mssql';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

async function test() {
    try {
        const pool = await sql.connect({
            user: process.env.SALUS_DB_USER || 'SalusConsulta',
            password: process.env.SALUS_DB_PASSWORD || 'ConsultaSALUS1234',
            server: process.env.SALUS_DB_SERVER || '128.223.16.29',
            database: 'SALUS',
            options: { encrypt: false, trustServerCertificate: true },
            port: 2450
        });
        
        const result = await pool.request().query(`
            SELECT TOP 1 *
            FROM [SALUS].[dbo].[TABLEAU_Detalle de ventas Facturadas con Gastos y Honorarios]
        `);
        console.log(Object.keys(result.recordset[0] || {}));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
test();
