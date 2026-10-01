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
        SELECT COLUMN_NAME, DATA_TYPE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'TABLEAU_Consumos Cirugias'
        ORDER BY ORDINAL_POSITION
    `);
    console.log('Columnas TABLEAU_Consumos Cirugias:', cols.recordset);

    const sample = await sql.query(`SELECT TOP 5 * FROM dbo.[TABLEAU_Consumos Cirugias] WHERE Sección = 'Descartable'`);
    console.log('Muestra Consumos Descartables:', sample.recordset);

    // Intentar match con FM_Articulos
    const testMatch = await sql.query(`
        SELECT TOP 5 
            c.Concepto,
            c.Cantidad,
            c.Sección,
            a.id as idArticulo,
            a.descripcion1,
            a.precioUnitario as precioArticulo,
            a.Coste,
            a.UltimoPrecioCompra,
            p.[Precio venta] as precioVentaMed
        FROM dbo.[TABLEAU_Consumos Cirugias] c
        LEFT JOIN dbo.FM_Articulos a ON RTRIM(LTRIM(a.descripcion1)) = RTRIM(LTRIM(c.Concepto))
        LEFT JOIN dbo.AA_PreciosMedicamentos_20260930 p ON p.idarticulo = a.id
        WHERE c.Sección = 'Descartable'
    `);
    console.log('Test Match Consumos <-> FM_Articulos:', testMatch.recordset);

    await sql.close();
}

main().catch(console.error);
