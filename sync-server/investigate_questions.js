import sql from 'mssql';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

const dbConfig = {
    server: '128.223.16.29',
    port: 2450,
    user: 'SalusConsulta',
    password: 'ConsultaSALUS1234',
    database: 'SALUS',
    options: {
        encrypt: false,
        trustServerCertificate: true,
    }
};

async function test() {
    try {
        const pool = await sql.connect(dbConfig);
        
        console.log("=== Preguntas en PR InstRespHospi con respuestas conteniendo 'alta' ===");
        const q1 = await pool.request().query(`
            SELECT DISTINCT TOP 20
                O.idPreguntaPr, 
                COUNT(*) AS Cantidad,
                MAX(CAST(O.ValorM AS NVARCHAR(200))) AS EjemploValor
            FROM [SALUS].[dbo].[PR InstRespHospi] O
            WHERE O.activo = 1
              AND O.ValorM IS NOT NULL
              AND CAST(O.ValorM AS NVARCHAR(MAX)) LIKE '%alta%'
            GROUP BY O.idPreguntaPr
            ORDER BY Cantidad DESC
        `);
        console.table(q1.recordset);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
test();
