import sql from 'mssql';

const SQL_CONFIG = {
    server: '128.223.16.29',
    port: 2450,
    user: 'SalusConsulta',
    password: 'ConsultaSALUS1234',
    database: 'SALUS',
    options: { encrypt: false, trustServerCertificate: true },
};

async function check() {
    let pool = await sql.connect(SQL_CONFIG);

    // Total rows in AP since 2026-03-01
    const totalRes = await pool.request().query(`
        SELECT COUNT(*) as cnt FROM [SALUS].[dbo].[VLIS_AnatomiaPatologica] WHERE [Fecha visita] >= '20260301'
    `);
    const total = totalRes.recordset[0].cnt;
    console.log('Total AP rows:', total);

    // Rows with NO matching idVisita in PP
    const noPpRes = await pool.request().query(`
        SELECT COUNT(*) as cnt FROM [SALUS].[dbo].[VLIS_AnatomiaPatologica] AP 
        WHERE AP.[Fecha visita] >= '20260301'
          AND NOT EXISTS (
              SELECT 1 FROM [SALUS].[dbo].[VLISE_PeticionesPruebas] PP 
              WHERE PP.idVisita = AP.idvisita
          )
    `);
    const noPp = noPpRes.recordset[0].cnt;
    console.log('AP rows with NO matching PP (idVisita not in PeticionesPruebas):', noPp);

    // Rows with matching PP but ALL N.Admision are NULL
    const nullAdmRes = await pool.request().query(`
        SELECT COUNT(*) as cnt FROM [SALUS].[dbo].[VLIS_AnatomiaPatologica] AP 
        WHERE AP.[Fecha visita] >= '20260301'
          AND EXISTS (
              SELECT 1 FROM [SALUS].[dbo].[VLISE_PeticionesPruebas] PP 
              WHERE PP.idVisita = AP.idvisita
          )
          AND NOT EXISTS (
              SELECT 1 FROM [SALUS].[dbo].[VLISE_PeticionesPruebas] PP 
              WHERE PP.idVisita = AP.idvisita AND PP.[N.Admision] IS NOT NULL
          )
    `);
    const nullAdm = nullAdmRes.recordset[0].cnt;
    console.log('AP rows with matching PP but ALL N.Admision are NULL:', nullAdm);

    // Let's print some examples of biopsies that have NO PP matching, or where PP matching has no N.Admision
    if (noPp > 0) {
        console.log('\n--- Sample AP rows with NO PP match ---');
        const sampleNoPp = await pool.request().query(`
            SELECT TOP 5 AP.idvisita, AP.[Fecha visita], AP.Paciente, AP.Laboratorio
            FROM [SALUS].[dbo].[VLIS_AnatomiaPatologica] AP
            WHERE AP.[Fecha visita] >= '20260301'
              AND NOT EXISTS (
                  SELECT 1 FROM [SALUS].[dbo].[VLISE_PeticionesPruebas] PP 
                  WHERE PP.idVisita = AP.idvisita
              )
        `);
        console.table(sampleNoPp.recordset);
    }

    if (nullAdm > 0) {
        console.log('\n--- Sample AP rows where PP matching has no N.Admision ---');
        const sampleNullAdm = await pool.request().query(`
            SELECT TOP 5 AP.idvisita, AP.[Fecha visita], AP.Paciente, AP.Laboratorio
            FROM [SALUS].[dbo].[VLIS_AnatomiaPatologica] AP
            WHERE AP.[Fecha visita] >= '20260301'
              AND EXISTS (
                  SELECT 1 FROM [SALUS].[dbo].[VLISE_PeticionesPruebas] PP 
                  WHERE PP.idVisita = AP.idvisita
              )
              AND NOT EXISTS (
                  SELECT 1 FROM [SALUS].[dbo].[VLISE_PeticionesPruebas] PP 
                  WHERE PP.idVisita = AP.idvisita AND PP.[N.Admision] IS NOT NULL
              )
        `);
        console.table(sampleNullAdm.recordset);
    }

    pool.close();
}

check();
