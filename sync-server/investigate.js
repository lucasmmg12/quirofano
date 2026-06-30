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
        // Buscar el paciente
        const result = await pool.request().query(`
            SELECT TOP 1 TA.idAdmision
            FROM [SALUS].[dbo].[TABLEAU_Admisiones] TA
            WHERE TA.Paciente LIKE '%ALARRIBERA%'
            ORDER BY TA.[Fecha ingreso] DESC
        `);
        if (result.recordset.length === 0) {
            console.log("Paciente no encontrado");
            return;
        }
        const idAdmision = result.recordset[0].idAdmision;
        console.log("idAdmision:", idAdmision);

        // Buscar en PR InstRespHospi
        const resp = await pool.request().query(`
            SELECT TOP 10 *
            FROM [SALUS].[dbo].[PR InstRespHospi]
            WHERE idHospi = ${idAdmision}
        `);
        console.dir(resp.recordset, {depth: null});
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
test();
