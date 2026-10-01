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
        requestTimeout: 45000
    }
};

async function main() {
    await sql.connect(salusConfig);

    // Tomemos los consumos de las últimas 50 cesáreas de 2026
    const sampleConsumos = await sql.query(`
        SELECT TOP 200 
            c.Concepto,
            c.Cantidad,
            c.Fecha,
            c.[Tipo visita]
        FROM dbo.[TABLEAU_Consumos Cirugias] c
        WHERE c.Fecha >= '2026-01-01' 
          AND c.[Tipo visita] LIKE '%CESAREA%'
          AND c.Sección = 'Descartable'
    `);
    console.log(`Leídos ${sampleConsumos.recordset.length} consumos de cesáreas 2026`);

    // Obtener los distintos conceptos
    const distinctConceptos = [...new Set(sampleConsumos.recordset.map(r => r.Concepto.trim()))];
    console.log(`Conceptos únicos (${distinctConceptos.length}):`);

    // Probar JOIN con FM_Articulos
    let matched = 0;
    const matches = [];

    for (const concepto of distinctConceptos.slice(0, 25)) {
        const cleanConcepto = concepto.replace(/'/g, "''");
        const res = await sql.query(`
            SELECT TOP 1 
                a.id,
                a.descripcion1,
                a.UltimoPrecioCompra as costo_compra,
                a.Coste,
                (SELECT TOP 1 pa.precioUnitario 
                 FROM dbo.FM_Precios_Articulo pa 
                 WHERE pa.idArticulo = a.id AND pa.precioUnitario > 0 
                 ORDER BY pa.FechaActualizacionPrecio DESC) as precio_venta
            FROM dbo.FM_Articulos a
            WHERE RTRIM(LTRIM(a.descripcion1)) = '${cleanConcepto}'
               OR RTRIM(LTRIM(a.descripcion2)) = '${cleanConcepto}'
        `);

        if (res.recordset.length > 0) {
            matched++;
            matches.push({
                concepto,
                id: res.recordset[0].id,
                costo_compra: res.recordset[0].costo_compra,
                precio_venta: res.recordset[0].precio_venta
            });
        } else {
            // Probar LIKE
            const searchPart = cleanConcepto.split(' ').slice(0, 3).join(' ');
            const resLike = await sql.query(`
                SELECT TOP 1 a.id, a.descripcion1, a.UltimoPrecioCompra,
                    (SELECT TOP 1 pa.precioUnitario FROM dbo.FM_Precios_Articulo pa WHERE pa.idArticulo = a.id AND pa.precioUnitario > 0 ORDER BY pa.FechaActualizacionPrecio DESC) as precio_venta
                FROM dbo.FM_Articulos a
                WHERE a.descripcion1 LIKE '%${searchPart}%'
            `);
            matches.push({
                concepto,
                matchedLike: resLike.recordset[0]?.descripcion1 || 'NO MATCH',
                costo_compra: resLike.recordset[0]?.UltimoPrecioCompra || 0,
                precio_venta: resLike.recordset[0]?.precio_venta || 0
            });
        }
    }

    console.table(matches);

    await sql.close();
}

main().catch(console.error);
