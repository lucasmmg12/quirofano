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
        connectionTimeout: 20000,
        tdsVersion: '7_4',
    },
};

async function analizarAsistencia() {
    console.log('--- CONECTANDO A SALUS ---');
    const pool = await sql.connect(SQL_CONFIG);
    console.log('--- CONECTADO A SALUS ---');

    // 1. Valores posibles de Asistencia y distribución general
    console.log('\n=== 1. DISTRIBUCIÓN GENERAL DEL CAMPO [Asistencia] ===');
    const q1 = await pool.request().query(`
        SELECT 
            ISNULL(Asistencia, 'NULL / VACÍO') AS ValorAsistencia,
            COUNT(*) AS Cantidad,
            CAST(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() AS DECIMAL(10,2)) AS Porcentaje
        FROM VLISE_PeticionesPruebas
        WHERE [Fecha Solicitud] >= '2025-06-01'
          AND [Fecha Solicitud] IS NOT NULL
        GROUP BY Asistencia
        ORDER BY Cantidad DESC
    `);
    console.table(q1.recordset);

    // 2. Cruce entre Asistencia y Origen
    console.log('\n=== 2. CRUCE ASISTENCIA vs ORIGEN ===');
    const q2 = await pool.request().query(`
        SELECT 
            Origen,
            ISNULL(Asistencia, 'NULL') AS Asistencia,
            COUNT(*) AS Cantidad,
            CAST(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(PARTITION BY Origen) AS DECIMAL(10,2)) AS PctEnEseOrigen
        FROM VLISE_PeticionesPruebas
        WHERE [Fecha Solicitud] >= '2025-06-01'
          AND [Fecha Solicitud] IS NOT NULL
        GROUP BY Origen, Asistencia
        ORDER BY Origen, Cantidad DESC
    `);
    console.table(q2.recordset);

    // 3. Cuando Asistencia IS NULL en Ambulatorio: ¿tienen datos de internación?
    // (IdHospitalizacion, N.Admision, HOSP_Habitacion, FechaIngresoHospitalizacion)
    console.log('\n=== 3. CUANDO ORIGEN="Ambulatorio" Y Asistencia IS NULL: ¿TIENEN RASTRO DE INTERNACIÓN? ===');
    const q3 = await pool.request().query(`
        SELECT 
            COUNT(*) AS TotalAmbulatorioAsistenciaNull,
            SUM(CASE WHEN IdHospitalizacion IS NOT NULL THEN 1 ELSE 0 END) AS ConIdHospitalizacion,
            SUM(CASE WHEN [N.Admision] IS NOT NULL AND [N.Admision] <> '' THEN 1 ELSE 0 END) AS ConNumeroAdmisionHosp,
            SUM(CASE WHEN HOSP_Habitacion IS NOT NULL AND HOSP_Habitacion <> '' THEN 1 ELSE 0 END) AS ConHabitacion,
            SUM(CASE WHEN FechaIngresoHospitalizacion IS NOT NULL THEN 1 ELSE 0 END) AS ConFechaIngresoHosp
        FROM VLISE_PeticionesPruebas
        WHERE [Fecha Solicitud] >= '2025-06-01'
          AND [Fecha Solicitud] IS NOT NULL
          AND Origen = 'Ambulatorio'
          AND Asistencia IS NULL
    `);
    console.table(q3.recordset);

    // 4. Enfoque en Estudios de Diagnóstico por Imágenes (Ecografías, Tomografías, Rayos, Resonancia, etc.)
    console.log('\n=== 4. ESTUDIOS DE IMÁGENES (ECOGRAFÍAS, TOMOGRAFÍAS, TAC, RX) Y ASISTENCIA ===');
    const q4 = await pool.request().query(`
        SELECT 
            CASE 
                WHEN Descripcion1 LIKE '%ECOGRAF%' OR Descripcion1 LIKE '%ECO%' THEN 'ECOGRAFÍA'
                WHEN Descripcion1 LIKE '%TOMOGRAF%' OR Descripcion1 LIKE '%TC %' OR Descripcion1 LIKE '%TAC%' THEN 'TOMOGRAFÍA'
                WHEN Descripcion1 LIKE '%RESONANC%' OR Descripcion1 LIKE '%RMN%' THEN 'RESONANCIA'
                WHEN Descripcion1 LIKE '%RADIOGRAF%' OR Descripcion1 LIKE '%RX %' OR Descripcion1 LIKE '%RAYOS%' THEN 'RADIOLOGÍA'
                WHEN Descripcion1 LIKE '%HEMOGRAM%' OR Descripcion1 LIKE '%IONO%' OR Descripcion1 LIKE '%LAB%' THEN 'LABORATORIO'
                ELSE 'OTROS ESTUDIOS'
            END AS TipoEstudioGrupo,
            Origen,
            ISNULL(Asistencia, 'NULL') AS Asistencia,
            COUNT(*) AS Cantidad
        FROM VLISE_PeticionesPruebas
        WHERE [Fecha Solicitud] >= '2025-06-01'
          AND [Fecha Solicitud] IS NOT NULL
          AND (
              Descripcion1 LIKE '%ECOGRAF%' 
              OR Descripcion1 LIKE '%TOMOGRAF%' 
              OR Descripcion1 LIKE '%TC %'
              OR Descripcion1 LIKE '%TAC%'
              OR Descripcion1 LIKE '%RESONANC%'
              OR Descripcion1 LIKE '%RADIOGRAF%'
              OR Descripcion1 LIKE '%RX %'
          )
        GROUP BY 
            CASE 
                WHEN Descripcion1 LIKE '%ECOGRAF%' OR Descripcion1 LIKE '%ECO%' THEN 'ECOGRAFÍA'
                WHEN Descripcion1 LIKE '%TOMOGRAF%' OR Descripcion1 LIKE '%TC %' OR Descripcion1 LIKE '%TAC%' THEN 'TOMOGRAFÍA'
                WHEN Descripcion1 LIKE '%RESONANC%' OR Descripcion1 LIKE '%RMN%' THEN 'RESONANCIA'
                WHEN Descripcion1 LIKE '%RADIOGRAF%' OR Descripcion1 LIKE '%RX %' OR Descripcion1 LIKE '%RAYOS%' THEN 'RADIOLOGÍA'
                WHEN Descripcion1 LIKE '%HEMOGRAM%' OR Descripcion1 LIKE '%IONO%' OR Descripcion1 LIKE '%LAB%' THEN 'LABORATORIO'
                ELSE 'OTROS ESTUDIOS'
            END,
            Origen,
            Asistencia
        ORDER BY TipoEstudioGrupo, Cantidad DESC
    `);
    console.table(q4.recordset);

    // 5. Muestra concreta de registros de Tomografía/Ecografía con Asistencia NULL
    console.log('\n=== 5. MUESTRA CONCRETA DE REGISTROS DE IMÁGENES CON Asistencia IS NULL ===');
    const q5 = await pool.request().query(`
        SELECT TOP 10
            CAST(IdPeticionDePrueba AS VARCHAR(30)) AS IdPeticion,
            [Fecha Solicitud] AS FechaSolicitud,
            Paciente,
            Descripcion1 AS Estudio,
            Origen,
            Asistencia,
            IdHospitalizacion,
            [N.Admision] AS AdmisionHosp,
            [N.Admision Ambulatoria] AS AdmisionAmb,
            HOSP_Habitacion,
            Cama,
            [Tipo Visita] AS TipoVisita
        FROM VLISE_PeticionesPruebas
        WHERE [Fecha Solicitud] >= '2025-06-01'
          AND Asistencia IS NULL
          AND (Descripcion1 LIKE '%TOMOGRAF%' OR Descripcion1 LIKE '%ECOGRAF%')
        ORDER BY [Fecha Solicitud] DESC
    `);
    console.table(q5.recordset);

    await pool.close();
}

analizarAsistencia().catch(console.error);
