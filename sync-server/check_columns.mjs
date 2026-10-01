import sql from 'mssql';

const salusConfig = {
    server: '128.223.16.29',
    port: 2450,
    user: 'SalusConsulta',
    password: 'ConsultaSALUS1234',
    database: 'SALUS',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        requestTimeout: 60000
    }
};

async function main() {
    await sql.connect(salusConfig);

    const cols = await sql.query(`
        SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME IN ('FM_Articulos', 'AA_PreciosMedicamentos_20260930', 'FM_Precios_Articulo')
        ORDER BY TABLE_NAME, ORDINAL_POSITION
    `);
    
    const byTable = {};
    cols.recordset.forEach(r => {
        if (!byTable[r.TABLE_NAME]) byTable[r.TABLE_NAME] = [];
        byTable[r.TABLE_NAME].push(`${r.COLUMN_NAME} (${r.DATA_TYPE})`);
    });

    for (const [tbl, colList] of Object.entries(byTable)) {
        console.log(`\n=== Columnas de ${tbl} ===`);
        console.log(colList.join(', '));
    }

    // Muestra de FM_Articulos
    const sampleArt = await sql.query(`SELECT TOP 3 * FROM FM_Articulos`);
    console.log('\nMuestra FM_Articulos:', sampleArt.recordset[0]);

    await sql.close();
}

main().catch(console.error);
