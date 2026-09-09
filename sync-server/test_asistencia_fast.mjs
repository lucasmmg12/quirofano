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

async function testFast() {
    const pool = await sql.connect(SQL_CONFIG);
    console.log('Conectado a SALUS.');

    // 1. ¿A qué Origen pertenecen los que tienen Asistencia IS NULL?
    console.log('\n--- 1. ORIGEN CUANDO Asistencia IS NULL ---');
    const r1 = await pool.request().query(`
        SELECT Origen, COUNT(*) AS Cantidad
        FROM VLISE_PeticionesPruebas
        WHERE [Fecha Solicitud] >= '2025-06-01'
          AND Asistencia IS NULL
        GROUP BY Origen
    `);
    console.table(r1.recordset);

    // 2. ¿Y cuando Asistencia IS NOT NULL?
    console.log('\n--- 2. ORIGEN CUANDO Asistencia IS NOT NULL ---');
    const r2 = await pool.request().query(`
        SELECT Origen, COUNT(*) AS Cantidad
        FROM VLISE_PeticionesPruebas
        WHERE [Fecha Solicitud] >= '2025-06-01'
          AND Asistencia IS NOT NULL
        GROUP BY Origen
    `);
    console.table(r2.recordset);

    // 3. En Hospitalización: ¿qué valores toma Asistencia?
    console.log('\n--- 3. VALORES DE Asistencia EN Hospitalización ---');
    const r3 = await pool.request().query(`
        SELECT ISNULL(Asistencia, 'NULL') AS Asistencia, COUNT(*) AS Cantidad
        FROM VLISE_PeticionesPruebas
        WHERE [Fecha Solicitud] >= '2025-06-01'
          AND Origen = 'Hospitalización'
        GROUP BY Asistencia
        ORDER BY Cantidad DESC
    `);
    console.table(r3.recordset);

    // 4. Ecografías y Tomografías: Origen vs Asistencia
    console.log('\n--- 4. ECOGRAFÍAS Y TOMOGRAFÍAS: ORIGEN vs ASISTENCIA ---');
    const r4 = await pool.request().query(`
        SELECT 
            Origen,
            CASE 
                WHEN Asistencia IS NULL THEN 'NULL'
                WHEN Asistencia = 'Presente' THEN 'Presente'
                WHEN Asistencia LIKE '%INTERN%' THEN 'INTERNADO'
                WHEN Asistencia LIKE '%URGENC%' THEN 'URGENCIA'
                ELSE 'OTRO ESTADO'
            END AS AsistenciaAgrupada,
            COUNT(*) AS Cantidad
        FROM VLISE_PeticionesPruebas
        WHERE [Fecha Solicitud] >= '2025-06-01'
          AND (
              Descripcion1 LIKE '%ECOGRAF%' 
              OR Descripcion1 LIKE '%TOMOGRAF%' 
              OR Descripcion1 LIKE '%TAC %'
              OR Descripcion1 LIKE '%TC %'
          )
        GROUP BY 
            Origen,
            CASE 
                WHEN Asistencia IS NULL THEN 'NULL'
                WHEN Asistencia = 'Presente' THEN 'Presente'
                WHEN Asistencia LIKE '%INTERN%' THEN 'INTERNADO'
                WHEN Asistencia LIKE '%URGENC%' THEN 'URGENCIA'
                ELSE 'OTRO ESTADO'
            END
        ORDER BY Origen, Cantidad DESC
    `);
    console.table(r4.recordset);

    // 5. En Ambulatorio donde Asistencia IS NULL: ¿tienen rastro de internación o cama?
    console.log('\n--- 5. AMBULATORIO CON Asistencia IS NULL: ¿HAY HUELLA DE HOSPITALIZACIÓN? ---');
    const r5 = await pool.request().query(`
        SELECT 
            COUNT(*) AS TotalAmbNull,
            SUM(CASE WHEN IdHospitalizacion IS NOT NULL THEN 1 ELSE 0 END) AS ConIdHosp,
            SUM(CASE WHEN HOSP_Habitacion IS NOT NULL AND HOSP_Habitacion <> '' THEN 1 ELSE 0 END) AS ConHabitacion,
            SUM(CASE WHEN [N.Admision] IS NOT NULL AND [N.Admision] <> '' THEN 1 ELSE 0 END) AS ConAdmisionHosp,
            SUM(CASE WHEN FechaIngresoHospitalizacion IS NOT NULL THEN 1 ELSE 0 END) AS ConFechaIngresoHosp
        FROM VLISE_PeticionesPruebas
        WHERE [Fecha Solicitud] >= '2025-06-01'
          AND Origen = 'Ambulatorio'
          AND Asistencia IS NULL
    `);
    console.table(r5.recordset);

    await pool.close();
}

testFast().catch(console.error);
