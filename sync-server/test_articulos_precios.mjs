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

    console.log('\n--- 1. Estructura de FM_Articulos ---');
    const resArt = await sql.query(`
        SELECT TOP 5 
            IdArticulo, Codigo, Descripcion, Tipo, Subtipo, Activo
        FROM FM_Articulos
        WHERE Descripcion LIKE '%ABBOCATH%' OR Descripcion LIKE '%CLAMP%' OR Descripcion LIKE '%ELECTRODOS%'
    `);
    console.log('Muestra FM_Articulos:', resArt.recordset);

    console.log('\n--- 2. Estructura de FM_Precios_Articulo ---');
    const resPre = await sql.query(`
        SELECT TOP 5 * 
        FROM FM_Precios_Articulo
        WHERE IdArticulo IN (SELECT TOP 5 IdArticulo FROM FM_Articulos WHERE Descripcion LIKE '%ABBOCATH%')
    `);
    console.log('Columnas FM_Precios_Articulo:', Object.keys(resPre.recordset[0] || {}));
    console.log('Muestra FM_Precios_Articulo:', resPre.recordset);

    console.log('\n--- 3. Ver cómo se relacionan Concepto de Consumos con FM_Articulos ---');
    const resMatch = await sql.query(`
        SELECT TOP 10
            con.Concepto,
            art.IdArticulo,
            art.Descripcion as Articulo_Descripcion,
            p.Precio
        FROM [TABLEAU_Consumos Cirugias] con
        INNER JOIN FM_Articulos art ON LTRIM(RTRIM(art.Descripcion)) = LTRIM(RTRIM(con.Concepto))
        LEFT JOIN (
            SELECT IdArticulo, MAX(Importe) as Precio 
            FROM FM_Precios_Articulo 
            GROUP BY IdArticulo
        ) p ON art.IdArticulo = p.IdArticulo
        WHERE con.Concepto IS NOT NULL AND con.Fecha >= '2026-01-01'
    `);
    console.log('Match Concepto <-> Articulo y Precio:', resMatch.recordset);

    console.log('\n--- 4. Ver si hay tabla de precios alternativa más directa (ej. AA_PreciosMedicamentos_20260930) ---');
    const resMatch2 = await sql.query(`
        SELECT TOP 10
            art.Descripcion,
            pm.[Precio venta],
            pm.idarticulo
        FROM AA_PreciosMedicamentos_20260930 pm
        INNER JOIN FM_Articulos art ON pm.idarticulo = art.IdArticulo
        WHERE art.Descripcion LIKE '%ABBOCATH%' OR art.Descripcion LIKE '%BISTURI%'
    `);
    console.log('Match AA_PreciosMedicamentos:', resMatch2.recordset);

    await sql.close();
}

main().catch(console.error);
