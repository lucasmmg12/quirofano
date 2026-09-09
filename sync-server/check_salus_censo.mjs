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

async function check() {
    try {
        await sql.connect(SQL_CONFIG);
        console.log('Conectado a SALUS');

        // Buscar tablas o vistas con 'cama', 'censo', 'habitacion'
        const res = await sql.query(`
            SELECT TABLE_NAME
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_NAME LIKE '%cama%' 
               OR TABLE_NAME LIKE '%censo%' 
               OR TABLE_NAME LIKE '%habitac%'
               OR TABLE_NAME LIKE '%internac%'
               OR TABLE_NAME LIKE '%ocupac%'
            ORDER BY TABLE_NAME
        `);
        console.table(res.recordset);

        // Buscar en TABLEAU_Admisiones las columnas disponibles
        const cols = await sql.query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'TABLEAU_Admisiones'
        `);
        console.log('Cols TABLEAU_Admisiones:', cols.recordset.map(c => c.COLUMN_NAME));

        await sql.close();
    } catch(err) {
        console.error(err);
    }
}
check();
