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

    console.log('\n--- 1. Columnas y muestra de [TABLEAU_Consumos Cirugias] ---');
    try {
        const resCons = await sql.query(`SELECT TOP 5 * FROM [TABLEAU_Consumos Cirugias]`);
        console.log('Columnas:', Object.keys(resCons.recordset[0] || {}));
        console.log('Muestra:', JSON.stringify(resCons.recordset.slice(0, 2), null, 2));
    } catch (e) {
        console.log('Error en TABLEAU_Consumos Cirugias:', e.message);
    }

    console.log('\n--- 2. Columnas y muestra de [TABLEAU_Cirugias] ---');
    try {
        const resCir = await sql.query(`SELECT TOP 5 * FROM [TABLEAU_Cirugias]`);
        console.log('Columnas:', Object.keys(resCir.recordset[0] || {}));
        console.log('Muestra:', JSON.stringify(resCir.recordset.slice(0, 2), null, 2));
    } catch (e) {
        console.log('Error en TABLEAU_Cirugias:', e.message);
    }

    console.log('\n--- 3. Tablas con ARTICULOS y PRECIOS en Salus ---');
    try {
        const resArt = await sql.query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME LIKE '%ARTICULO%' OR TABLE_NAME LIKE '%PRECIO%'
            ORDER BY TABLE_NAME
        `);
        console.log('Tablas artículos/precios:', resArt.recordset.map(r => r.TABLE_NAME));
    } catch (e) {
        console.log('Error:', e.message);
    }

    await sql.close();
}

main().catch(console.error);
