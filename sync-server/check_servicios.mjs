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

async function checkServicios() {
    try {
        await sql.connect(SQL_CONFIG);
        const res = await sql.query(`
            SELECT Servicio, COUNT(*) as cantidad, COUNT(DISTINCT [idAdmision]) as admisiones
            FROM TABLEAU_Admisiones
            WHERE ([Fecha alta] >= '2025-06-01' OR [Fecha alta] IS NULL)
            GROUP BY Servicio
            ORDER BY cantidad DESC
        `);
        console.log('=== SERVICIOS EN SALUS ===');
        res.recordset.forEach(r => {
            console.log(`${r.Servicio || 'NULL'}: ${r.cantidad} filas (${r.admisiones} admisiones)`);
        });

        const terapiaDetail = await sql.query(`
            SELECT Servicio, Especialidad, COUNT(*) as total_filas, COUNT(DISTINCT idAdmision) as admisiones
            FROM TABLEAU_Admisiones
            WHERE Servicio IN ('UCI', 'TERAPIA INTERMEDIA', 'TERAPIA PEDIÁTRICA')
              AND ([Fecha alta] >= '2025-06-01' OR [Fecha alta] IS NULL)
            GROUP BY Servicio, Especialidad
            ORDER BY Servicio, total_filas DESC
        `);
        console.log('=== DETALLE TERAPIAS (UCI / INTERMEDIA / PEDIÁTRICA) ===');
        console.table(terapiaDetail.recordset);

        await sql.close();
    } catch (e) {
        console.error(e);
    }
}
checkServicios();
