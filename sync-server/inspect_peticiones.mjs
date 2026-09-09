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
        requestTimeout: 180000,
        connectionTimeout: 15000,
        tdsVersion: '7_4',
    },
};

async function inspect() {
    try {
        await sql.connect(SQL_CONFIG);
        
        // 1. Columnas
        const cols = await sql.query(`
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'VLISE_PeticionesPruebas'
            ORDER BY ORDINAL_POSITION
        `);
        console.log('--- COLUMNAS EN VLISE_PeticionesPruebas ---');
        console.table(cols.recordset);

        // 2. Query 2 exacta del usuario
        const resQuery2 = await sql.query(`
            SELECT 
                Origen,
                COUNT(*) AS CantidadEstudios,
                CAST(
                    COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() 
                AS DECIMAL(10, 2)) AS PorcentajeProduccion
            FROM VLISE_PeticionesPruebas
            WHERE [Fecha Solicitud] >= '2025-06-01'
              AND [Fecha Solicitud] IS NOT NULL
            GROUP BY Origen
        `);
        console.log('--- RESULTADO QUERY 2 (PRODUCCIÓN POR ORIGEN) ---');
        console.table(resQuery2.recordset);

        // 3. Muestra de Hospitalización para ver qué campos identifican cama/servicio/habitación y nombre de estudio
        const hospMuestra = await sql.query(`
            SELECT TOP 5 *
            FROM VLISE_PeticionesPruebas
            WHERE [Fecha Solicitud] >= '2025-06-01'
              AND Origen = 'Hospitalización'
        `);
        console.log('--- MUESTRA HOSPITALIZACIÓN ---');
        console.log(Object.keys(hospMuestra.recordset[0]));
        console.log('Registro 0:', hospMuestra.recordset[0]);

        await sql.close();
    } catch(err) {
        console.error('Error:', err);
    }
}
inspect();
