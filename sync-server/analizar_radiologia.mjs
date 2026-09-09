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

async function analizarRadiologia() {
    const pool = await sql.connect(SQL_CONFIG);
    console.log('Conectado a SALUS.');

    // 1. Distribución de [Tipo Articulo]
    console.log('\n=== 1. DISTRIBUCIÓN POR [Tipo Articulo] ===');
    const q1 = await pool.request().query(`
        SELECT 
            ISNULL([Tipo Articulo], 'NULL') AS TipoArticulo,
            COUNT(*) AS Cantidad,
            CAST(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() AS DECIMAL(10,2)) AS Porcentaje
        FROM VLISE_PeticionesPruebas
        WHERE [Fecha Solicitud] >= '2025-06-01'
        GROUP BY [Tipo Articulo]
        ORDER BY Cantidad DESC
    `);
    console.table(q1.recordset);

    // 2. En Petición Radiología (Ecografías, RX, TAC): Origen vs Asistencia
    console.log('\n=== 2. PETICIÓN RADIOLOGÍA: ORIGEN vs ASISTENCIA ===');
    const q2 = await pool.request().query(`
        SELECT 
            Origen,
            ISNULL(Asistencia, 'NULL') AS Asistencia,
            COUNT(*) AS Cantidad
        FROM VLISE_PeticionesPruebas
        WHERE [Fecha Solicitud] >= '2025-06-01'
          AND [Tipo Articulo] = 'Petición Radiologia'
        GROUP BY Origen, Asistencia
        ORDER BY Origen, Cantidad DESC
    `);
    console.table(q2.recordset);

    // 3. En Petición Analítica (Laboratorio): Origen vs Asistencia
    console.log('\n=== 3. PETICIÓN ANALÍTICA (LABORATORIO): ORIGEN vs ASISTENCIA ===');
    const q3 = await pool.request().query(`
        SELECT 
            Origen,
            ISNULL(Asistencia, 'NULL') AS Asistencia,
            COUNT(*) AS Cantidad
        FROM VLISE_PeticionesPruebas
        WHERE [Fecha Solicitud] >= '2025-06-01'
          AND [Tipo Articulo] = 'Petición Analitica'
        GROUP BY Origen, Asistencia
        ORDER BY Origen, Cantidad DESC
    `);
    console.table(q3.recordset);

    // 4. Ecografías específicas en Hospitalización vs Ambulatorio
    console.log('\n=== 4. ECOGRAFÍAS ([Tipo Visita] LIKE \'%ECO%\'): ASISTENCIA POR ORIGEN ===');
    const q4 = await pool.request().query(`
        SELECT 
            Origen,
            ISNULL(Asistencia, 'NULL') AS Asistencia,
            COUNT(*) AS Cantidad
        FROM VLISE_PeticionesPruebas
        WHERE [Fecha Solicitud] >= '2025-06-01'
          AND [Tipo Visita] LIKE '%ECO%'
        GROUP BY Origen, Asistencia
        ORDER BY Origen, Cantidad DESC
    `);
    console.table(q4.recordset);

    await pool.close();
}

analizarRadiologia().catch(console.error);
