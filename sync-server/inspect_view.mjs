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
    
    // Ver artículos con precios en FM_Articulos vs FM_Precios_Articulo vs AA_PreciosMedicamentos
    console.log('--- Muestra de FM_Articulos con precios ---');
    const arts = await sql.query(`
        SELECT TOP 10 
            id, descripcion1, precioUnitario, Coste, UltimoPrecioCompra
        FROM dbo.FM_Articulos
        WHERE activo = 1 AND (precioUnitario > 0 OR UltimoPrecioCompra > 0 OR Coste > 0)
    `);
    console.log(arts.recordset);

    console.log('\n--- Muestra de FM_Precios_Articulo ---');
    const pArts = await sql.query(`
        SELECT TOP 10 
            p.idArticulo, a.descripcion1, p.precioUnitario, p.precioUnitarioPaciente, p.idTarifa
        FROM dbo.FM_Precios_Articulo p
        JOIN dbo.FM_Articulos a ON a.id = p.idArticulo
        WHERE p.precioUnitario > 0
    `);
    console.log(pArts.recordset);

    console.log('\n--- Muestra de AA_PreciosMedicamentos_20260930 ---');
    const aaArts = await sql.query(`
        SELECT TOP 10 
            p.idarticulo, a.descripcion1, p.[Precio venta], p.codigokairos
        FROM dbo.AA_PreciosMedicamentos_20260930 p
        JOIN dbo.FM_Articulos a ON a.id = p.idarticulo
        WHERE p.[Precio venta] > 0
    `);
    console.log(aaArts.recordset);

    await sql.close();
}

main().catch(console.error);
