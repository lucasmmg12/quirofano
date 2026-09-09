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

async function testPeticiones() {
    try {
        await sql.connect(SQL_CONFIG);
        console.log('Conectado a SALUS');
        
        // Probar la Query 2 primero para ver los orígenes
        const resOrigen = await sql.query(`
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
            ORDER BY CantidadEstudios DESC
        `);
        console.log('--- RESUMEN POR ORIGEN (Query 2) ---');
        console.table(resOrigen.recordset);

        // Muestra de registros de UCI o similares
        const muestra = await sql.query(`
            SELECT TOP 10
                CAST(IdPeticionDePrueba AS VARCHAR(50)) AS IdPeticion,
                [Fecha Solicitud],
                IdPaciente,
                Paciente,
                Solicitante,
                CAST([Paciente Edad] AS INT) AS PacienteEdad,
                Origen,
                [Tipo Visita] AS TipoVisita,
                [Tipo Articulo] AS TipoArticulo
            FROM VLISE_PeticionesPruebas
            WHERE [Fecha Solicitud] >= '2025-06-01'
              AND (Origen LIKE '%UCI%' OR Origen LIKE '%TERAPIA%' OR Origen LIKE '%UTI%')
        `);
        console.log('--- MUESTRA UCI EN PETICIONES ---');
        console.table(muestra.recordset);

        // Total de peticiones desde 2025-06-01
        const totalCount = await sql.query(`
            SELECT COUNT(*) as total
            FROM VLISE_PeticionesPruebas
            WHERE [Fecha Solicitud] >= '2025-06-01'
              AND [Fecha Solicitud] IS NOT NULL
        `);
        console.log('Total registros en VLISE_PeticionesPruebas:', totalCount.recordset[0].total);

        await sql.close();
    } catch(err) {
        console.error('Error:', err);
    }
}
testPeticiones();
