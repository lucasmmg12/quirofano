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
        requestTimeout: 120000,
        connectionTimeout: 15000,
        tdsVersion: '7_4',
    },
};

async function test() {
    try {
        console.log('Conectando...');
        const pool = await sql.connect(SQL_CONFIG);
        console.log('Conectado. Consultando Álvarez Padilla...');

        const req = pool.request();
        const result = await req.query(`
            SELECT TOP 10 
                [Fecha albaran], Paciente, Paciente_NHC, 
                Tarifa, [Numero folio], [Deuda linea], [Cobrado linea]
            FROM [TABLEAU_Detalle de ventas Facturadas con Gastos y Honorarios]
            WHERE Paciente LIKE '%ALVAREZ%PADILLA%' 
               OR Paciente LIKE '%PADILLA%ALVAREZ%'
            ORDER BY [Fecha albaran] DESC
        `);

        console.table(result.recordset);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();
