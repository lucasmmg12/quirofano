import { connectToSqlServer } from './utils/db.js';

async function testQuery() {
    const db = await connectToSqlServer();
    const result = await db.request().query(`
        SELECT TOP (100) 
            TA.[Número admisión],
            TA.[Fecha ingreso],
            CAST(TA.[Fecha alta] AS DATE) AS [Fecha alta],
            TA.[Paciente]
        FROM [SALUS].[dbo].[TABLEAU_Admisiones] TA
        WHERE 
            TA.[Fecha ingreso] >= DATEADD(DAY, -60, CAST(GETDATE() AS DATE))
            OR TA.[Fecha alta] >= DATEADD(DAY, -60, CAST(GETDATE() AS DATE))
            OR TA.[Fecha alta] IS NULL
    `);
    console.log(result.recordset.length + ' rows found.');
    process.exit(0);
}
testQuery().catch(console.error);
