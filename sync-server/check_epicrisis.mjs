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
        requestTimeout: 60000,
        connectionTimeout: 20000,
        tdsVersion: '7_4',
    }
};

async function test() {
    try {
        const pool = await sql.connect(SQL_CONFIG);
        const qSinEpicrisis = await pool.request().query(`
            SELECT 
                NHC AS nhc,
                Paciente AS paciente,
                CONVERT(VARCHAR(10), [Fecha ingreso], 23) AS fecha_ingreso,
                CONVERT(VARCHAR(10), [Fecha alta], 23) AS fecha_alta,
                Doctor AS doctor,
                UsuarioAlta AS usuario_alta,
                [Motivo de alta] AS motivo_alta,
                Cliente AS obra_social,
                Habitación AS habitacion,
                Proceso AS proceso
            FROM [SALUS].[dbo].[TABLEAU_Admisiones]
            WHERE Procedencia = 'Derivado desde Urgencias'
              AND Especialidad = 'CLINICO '
              AND [Fecha ingreso] >= '2026-09-01'
              AND [Motivo de alta] IS NULL;
        `);
        console.log('Casos sin epicrisis en Septiembre (total ' + qSinEpicrisis.recordset.length + '):');
        console.log(qSinEpicrisis.recordset);

        await pool.close();
    } catch(err) {
        console.error(err);
    }
}
test();
