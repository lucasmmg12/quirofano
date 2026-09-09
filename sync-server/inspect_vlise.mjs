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

async function inspectVLISE() {
    try {
        await sql.connect(SQL_CONFIG);
        // Columnas de la vista VLISE_PeticionesPruebas
        const cols = await sql.query(`
            SELECT COLUMN_NAME, DATA_TYPE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'VLISE_PeticionesPruebas'
        `);
        console.log('--- COLUMNAS DE VLISE_PeticionesPruebas ---');
        console.table(cols.recordset);

        // Muestra de registros de Hospitalización
        const hospMuestra = await sql.query(`
            SELECT TOP 5 *
            FROM VLISE_PeticionesPruebas
            WHERE [Fecha Solicitud] >= '2025-06-01'
              AND Origen = 'Hospitalización'
        `);
        console.log('--- MUESTRA HOSPITALIZACION ---');
        console.log(JSON.stringify(hospMuestra.recordset, null, 2));

        await sql.close();
    } catch(err) {
        console.error(err);
    }
}
inspectVLISE();
