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

        // Consultar admisiones activas (sin fecha de alta) en UCI o intermedias o por habitacion
        const res = await sql.query(`
            SELECT TOP 30
                [Habitación] as HAB,
                CAST([Fecha ingreso] AS DATE) as [F ING],
                [Paciente] as [APELLIDO Y NOMBRE],
                CAST([fechaNacimiento] AS DATE) as [F NAC],
                [NIF] as [DNI],
                [Cliente] as [O SOCIAL],
                [Núm. Autorización] as [Nº O SOCIAL],
                [Edad] as [EDAD],
                COALESCE([telefono1], [telefono2]) as [Nº TELEFONO],
                [Servicio] as [TIPO INTER]
            FROM TABLEAU_Admisiones
            WHERE [Fecha alta] IS NULL
               OR [Fecha alta] >= CAST(GETDATE() AS DATE)
            ORDER BY [Habitación]
        `);
        console.table(res.recordset);

        // Ver qué habitaciones existen para las que están activas
        const uciHab = await sql.query(`
            SELECT 
                [Habitación] as HAB,
                [Paciente],
                [Servicio],
                [Fecha ingreso],
                [Fecha alta]
            FROM TABLEAU_Admisiones
            WHERE [Habitación] LIKE '%22%' OR [Habitación] LIKE '%BOX%'
            ORDER BY [Fecha ingreso] DESC
        `);
        console.log('Habitaciones 22x o BOX:');
        console.table(uciHab.recordset.slice(0, 20));

        await sql.close();
    } catch(err) {
        console.error(err);
    }
}
check();
