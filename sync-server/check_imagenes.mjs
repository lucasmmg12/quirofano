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

async function checkImagenes() {
    const pool = await sql.connect(SQL_CONFIG);
    console.log('Conectado a SALUS.');

    // 1. Ver qué secciones y tipos de visita existen en la vista
    console.log('\n--- 1. SECCIONES (Articulo_Sección) ---');
    const sec = await pool.request().query(`
        SELECT TOP 20 [Articulo_Sección], COUNT(*) as cnt
        FROM VLISE_PeticionesPruebas
        WHERE [Fecha Solicitud] >= '2025-06-01'
        GROUP BY [Articulo_Sección]
        ORDER BY cnt DESC
    `);
    console.table(sec.recordset);

    console.log('\n--- 2. TIPOS DE VISITA ([Tipo Visita]) ---');
    const vis = await pool.request().query(`
        SELECT TOP 20 [Tipo Visita], COUNT(*) as cnt
        FROM VLISE_PeticionesPruebas
        WHERE [Fecha Solicitud] >= '2025-06-01'
        GROUP BY [Tipo Visita]
        ORDER BY cnt DESC
    `);
    console.table(vis.recordset);

    console.log('\n--- 3. MUESTRA DE ESTUDIOS QUE CONTENGAN ECO, TOMO, TAC O RX ---');
    const est = await pool.request().query(`
        SELECT TOP 10
            [Tipo Visita],
            [Tipo Articulo],
            [Articulo_Sección],
            Prueba,
            Descripcion1,
            Origen,
            Asistencia,
            IdHospitalizacion,
            HOSP_Habitacion
        FROM VLISE_PeticionesPruebas
        WHERE [Fecha Solicitud] >= '2025-06-01'
          AND (
              [Tipo Visita] LIKE '%ECO%' 
              OR [Tipo Visita] LIKE '%TOMO%' 
              OR [Tipo Visita] LIKE '%TAC%' 
              OR [Tipo Visita] LIKE '%RX%' 
              OR [Tipo Visita] LIKE '%IMG%'
              OR [Tipo Visita] LIKE '%RADIO%'
              OR Prueba LIKE '%ECO%'
              OR Prueba LIKE '%TOMO%'
          )
    `);
    console.table(est.recordset);

    await pool.close();
}

checkImagenes().catch(console.error);
