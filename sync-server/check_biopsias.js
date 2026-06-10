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
        requestTimeout: 30000 
    },
};

async function check() {
    console.log('Connecting to SALUS...');
    let pool = await sql.connect(SQL_CONFIG);

    // 1. Check a few rows from VLISE_Visitas for idVisita 576964
    console.log('\n--- VLISE_Visitas sample for idVisita 576964 ---');
    const sampleV = await pool.request().query(`
        SELECT TOP 1 * FROM [SALUS].[dbo].[VLISE_Visitas] WHERE [idVisita] = 576964
    `);
    console.log(sampleV.recordset[0]);

    // 2. Search for admission number fields in VLISE_Visitas
    console.log('\n--- Columns of VLISE_Visitas ---');
    const colsV = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'VLISE_Visitas'
    `);
    const filteredCols = colsV.recordset.filter(c => 
        c.COLUMN_NAME.toLowerCase().includes('adm') || 
        c.COLUMN_NAME.toLowerCase().includes('nif') || 
        c.COLUMN_NAME.toLowerCase().includes('nhc') || 
        c.COLUMN_NAME.toLowerCase().includes('dni')
    );
    console.table(filteredCols);

    // 3. Let's see some samples of VLIS_AnatomiaPatologica since 2026-03-01 to see if we can join VLISE_Visitas
    console.log('\n--- Sample of VLIS_AnatomiaPatologica + VLISE_Visitas (no PP join) ---');
    const sampleAPJoinV = await pool.request().query(`
        SELECT TOP 5 AP.[idvisita], AP.[Fecha visita], AP.[Paciente], V.[NIF], V.[Cliente]
        FROM [SALUS].[dbo].[VLIS_AnatomiaPatologica] AS AP
        LEFT JOIN [SALUS].[dbo].[VLISE_Visitas] AS V ON AP.[idvisita] = V.[idVisita]
        WHERE AP.[Fecha visita] >= '20260301'
    `);
    console.table(sampleAPJoinV.recordset);

    // 4. Do a query to find out if VLISE_Visitas has any field that contains the N.Admision or if we can get it from VLISE_PeticionesPruebas with a better query
    console.log('\n--- Check if VLISE_PeticionesPruebas can be joined faster or if we can filter by date first ---');
    const fastJoin = await pool.request().query(`
        SELECT TOP 5 AP.[idvisita], AP.[Paciente], PP.[N.Admision]
        FROM [SALUS].[dbo].[VLIS_AnatomiaPatologica] AS AP
        LEFT JOIN [SALUS].[dbo].[VLISE_PeticionesPruebas] AS PP 
            ON AP.[idvisita] = PP.[idVisita] AND PP.[Fecha Solicitud] >= '20260201'
        WHERE AP.[Fecha visita] >= '20260301'
    `);
    console.table(fastJoin.recordset);

    pool.close();
}

check();
