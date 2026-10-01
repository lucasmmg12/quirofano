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
        requestTimeout: 120000
    }
};

async function main() {
    await sql.connect(salusConfig);

    console.log('\n--- 1. Muestra de consumos no nulos recientes ---');
    const resCons = await sql.query(`
        SELECT TOP 10 
            idvisita, Fecha, Concepto, Cantidad, Almacen, Sección, Servicio
        FROM [TABLEAU_Consumos Cirugias]
        WHERE Concepto IS NOT NULL AND Cantidad > 0 AND Fecha >= '2025-01-01'
        ORDER BY Fecha DESC
    `);
    console.log('Muestra consumos recientes:', resCons.recordset);

    console.log('\n--- 2. Top 50 Cirugías más realizadas (2025-2026) ---');
    const resTopCir = await sql.query(`
        SELECT TOP 50 
            [Nombre cirugía] as nombre_cirugia, 
            COUNT(*) as total_realizadas
        FROM [TABLEAU_Cirugias]
        WHERE [Fecha realización] IS NOT NULL 
          AND [Nombre cirugía] IS NOT NULL 
          AND [Fecha realización] >= '2025-01-01'
        GROUP BY [Nombre cirugía]
        ORDER BY COUNT(*) DESC
    `);
    console.log('Top 10 de las 50 más realizadas:', resTopCir.recordset.slice(0, 10));
    console.log('Total cirugías en ranking:', resTopCir.recordset.length);

    console.log('\n--- 3. Ver cruce Cirugías con Consumos para una Cesárea ---');
    const resJoin = await sql.query(`
        SELECT TOP 15
            c.[Nombre cirugía],
            con.Concepto,
            con.Cantidad,
            con.Fecha
        FROM [TABLEAU_Cirugias] c
        INNER JOIN [TABLEAU_Consumos Cirugias] con ON c.idvisita = con.idvisita
        WHERE c.[Nombre cirugía] LIKE '%CESAREA%'
          AND con.Concepto IS NOT NULL
          AND con.Cantidad > 0
          AND con.Fecha >= '2025-01-01'
        ORDER BY con.Fecha DESC
    `);
    console.log('Ejemplo de consumos en Cesárea:', resJoin.recordset);

    console.log('\n--- 4. Muestra de AA_PreciosMedicamentos ---');
    try {
        const resPrecios = await sql.query(`SELECT TOP 5 * FROM AA_PreciosMedicamentos_20260930`);
        console.log('Columnas AA_PreciosMedicamentos:', Object.keys(resPrecios.recordset[0] || {}));
        console.log('Muestra precios:', resPrecios.recordset.slice(0, 2));
    } catch (e) {
        console.log('Error en AA_PreciosMedicamentos:', e.message);
        const resPreciosAlt = await sql.query(`SELECT TOP 5 * FROM AA_PreciosMedicamentos`);
        console.log('Columnas AA_PreciosMedicamentos:', Object.keys(resPreciosAlt.recordset[0] || {}));
        console.log('Muestra precios alt:', resPreciosAlt.recordset.slice(0, 2));
    }

    await sql.close();
}

main().catch(console.error);
