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
        requestTimeout: 30000
    }
};

async function main() {
    await sql.connect(salusConfig);

    // 1. Ver cómo están cargados los descartables comunes en FM_Articulos
    const sampleDescartables = await sql.query(`
        SELECT TOP 20 
            id,
            descripcion1,
            precioUnitario,
            Coste,
            UltimoPrecioCompra
        FROM dbo.FM_Articulos
        WHERE activo = 1 
          AND (descripcion1 LIKE '%JERINGA%' OR descripcion1 LIKE '%AGUJA%' OR descripcion1 LIKE '%GUANTE%' OR descripcion1 LIKE '%BISTURI%' OR descripcion1 LIKE '%ELECTRODO%')
        ORDER BY id DESC
    `);
    console.log('Muestra Descartables en FM_Articulos:');
    console.table(sampleDescartables.recordset);

    // 2. Ver si estos artículos están en AA_PreciosMedicamentos_20260930
    const ids = sampleDescartables.recordset.map(r => r.id).join(',');
    const preciosAA = await sql.query(`
        SELECT idarticulo, [Precio venta], codigokairos
        FROM dbo.AA_PreciosMedicamentos_20260930
        WHERE idarticulo IN (${ids})
    `);
    console.log('\nPrecios en AA_PreciosMedicamentos_20260930 para estos descartables:');
    console.table(preciosAA.recordset);

    // 3. Ver si están en FM_Precios_Articulo
    const preciosTarifa = await sql.query(`
        SELECT TOP 20 idArticulo, precioUnitario, precioUnitarioPaciente, idTarifa, FechaActualizacionPrecio
        FROM dbo.FM_Precios_Articulo
        WHERE idArticulo IN (${ids}) AND precioUnitario > 0
        ORDER BY FechaActualizacionPrecio DESC
    `);
    console.log('\nPrecios en FM_Precios_Articulo para estos descartables:');
    console.table(preciosTarifa.recordset);

    // 4. Ver si en FV_Lineas_Albaranes están los precios facturados/cobrados
    const preciosFacturados = await sql.query(`
        SELECT TOP 10 
            idArticulo,
            descripcion,
            precioUnitario,
            importeTotal,
            cantidad,
            Fecha
        FROM dbo.FV_Lineas_Albaranes
        WHERE idArticulo IN (${ids})
        ORDER BY Fecha DESC
    `);
    console.log('\nPrecios en FV_Lineas_Albaranes (últimos facturados):');
    console.table(preciosFacturados.recordset);

    await sql.close();
}

main().catch(console.error);
