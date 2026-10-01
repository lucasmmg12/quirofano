import sql from 'mssql';
import fs from 'fs';
import path from 'path';

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

// Función para calcular la moda de un array de números
function calcularModa(arr) {
    if (!arr || arr.length === 0) return 0;
    const frecuencias = {};
    let maxFrec = 0;
    let moda = arr[0];

    for (const val of arr) {
        frecuencias[val] = (frecuencias[val] || 0) + 1;
        if (frecuencias[val] > maxFrec) {
            maxFrec = frecuencias[val];
            moda = val;
        }
    }
    return moda;
}

async function main() {
    console.log('Iniciando conexión a SALUS...');
    const pool = await sql.connect(salusConfig);

    // 1. Obtener el Top 50 de Cirugías más realizadas (2024 a 2026)
    console.log('Consultando Top 50 cirugías más realizadas...');
    const top50Res = await pool.request().query(`
        SELECT TOP 50 
            [Nombre cirugía] as nombre_cirugia,
            COUNT(*) as total_intervenciones
        FROM dbo.[TABLEAU_Cirugias]
        WHERE [Fecha realización] >= '2024-01-01'
          AND [Nombre cirugía] IS NOT NULL 
          AND RTRIM(LTRIM([Nombre cirugía])) <> ''
          AND [Nombre cirugía] NOT LIKE '%CONSULTA%'
        GROUP BY [Nombre cirugía]
        ORDER BY total_intervenciones DESC
    `);

    const top50 = top50Res.recordset;
    console.log(`Top 50 obtenido con éxito. Top 1: ${top50[0].nombre_cirugia} (${top50[0].total_intervenciones} casos)`);

    // 2. Pre-cargar el catálogo de artículos de FM_Articulos para matching en memoria (mucho más rápido que queries individuales)
    console.log('Cargando catálogo de artículos y precios de FM_Articulos...');
    const articulosCatalogoRes = await pool.request().query(`
        SELECT 
            a.id,
            RTRIM(LTRIM(a.descripcion1)) as descripcion,
            a.UltimoPrecioCompra as costo_compra,
            a.Coste as costo_estandar,
            (SELECT TOP 1 pa.precioUnitario 
             FROM dbo.FM_Precios_Articulo pa 
             WHERE pa.idArticulo = a.id AND pa.precioUnitario > 0 
             ORDER BY pa.FechaActualizacionPrecio DESC) as precio_venta
        FROM dbo.FM_Articulos a
        WHERE a.activo = 1
    `);

    // Indexar por descripción normalizada
    const catalogoMap = new Map();
    for (const art of articulosCatalogoRes.recordset) {
        if (art.descripcion) {
            catalogoMap.set(art.descripcion.toUpperCase(), art);
        }
    }
    console.log(`Catálogo indexado: ${catalogoMap.size} artículos activos.`);

    // Función auxiliar para buscar precio
    function obtenerPreciosArticulo(concepto) {
        if (!concepto) return { id: null, costo_compra: 0, precio_venta: 0 };
        const clean = concepto.trim().toUpperCase();
        
        // Match exacto
        if (catalogoMap.has(clean)) {
            const a = catalogoMap.get(clean);
            return {
                id: a.id,
                costo_compra: a.costo_compra || a.costo_estandar || 0,
                precio_venta: a.precio_venta || (a.costo_compra ? a.costo_compra * 1.4 : 0)
            };
        }

        // Match aproximado (primeras 3 palabras)
        const parts = clean.split(' ').filter(p => p.length > 2);
        if (parts.length >= 2) {
            const prefix = parts.slice(0, 2).join(' ');
            for (const [key, a] of catalogoMap.entries()) {
                if (key.includes(prefix)) {
                    return {
                        id: a.id,
                        costo_compra: a.costo_compra || a.costo_estandar || 0,
                        precio_venta: a.precio_venta || (a.costo_compra ? a.costo_compra * 1.4 : 0)
                    };
                }
            }
        }

        return { id: null, costo_compra: 0, precio_venta: 0 };
    }

    // 3. Procesar cada una de las 50 cirugías
    const resultadoTop50 = [];

    for (let i = 0; i < top50.length; i++) {
        const cirugia = top50[i];
        console.log(`[${i + 1}/50] Procesando: ${cirugia.nombre_cirugia} (${cirugia.total_intervenciones} casos)...`);

        const safeNombreCirugia = cirugia.nombre_cirugia.replace(/'/g, "''");

        // Obtenemos los consumos de descartables para esta cirugía en 2024-2026
        // Limitamos a una muestra representativa de hasta 200 cirugías más recientes para velocidad extrema
        const consumosRes = await pool.request().query(`
            SELECT 
                c.idvisita,
                RTRIM(LTRIM(c.Concepto)) as concepto,
                c.Cantidad
            FROM dbo.[TABLEAU_Consumos Cirugias] c
            WHERE c.[Tipo visita] = '${safeNombreCirugia}'
              AND c.Fecha >= '2024-01-01'
              AND c.Sección = 'Descartable'
              AND c.Cantidad > 0
              AND c.Concepto IS NOT NULL
        `);

        const consumos = consumosRes.recordset;

        // Número de cirugías únicas analizadas con consumos
        const visitasUnicas = new Set(consumos.map(c => c.idvisita));
        const totalVisitasConConsumo = visitasUnicas.size;

        if (totalVisitasConConsumo === 0) {
            resultadoTop50.push({
                ranking: i + 1,
                nombre_cirugia: cirugia.nombre_cirugia,
                total_intervenciones_historico: cirugia.total_intervenciones,
                casos_analizados: 0,
                costo_total_estimado_moda: 0,
                costo_total_estimado_promedio: 0,
                precio_venta_total_moda: 0,
                precio_venta_total_promedio: 0,
                descartables: []
            });
            continue;
        }

        // Agrupar consumos por concepto
        // Por cada concepto guardamos: lista de cantidades (una por visita donde se usó) y conteo de visitas
        const conceptosMap = {};

        for (const row of consumos) {
            const concepto = row.concepto.toUpperCase();
            if (!conceptosMap[concepto]) {
                conceptosMap[concepto] = {
                    concepto_original: row.concepto,
                    visitas: new Set(),
                    cantidadesPorVisita: {}
                };
            }
            conceptosMap[concepto].visitas.add(row.idvisita);
            conceptosMap[concepto].cantidadesPorVisita[row.idvisita] = 
                (conceptosMap[concepto].cantidadesPorVisita[row.idvisita] || 0) + Number(row.Cantidad);
        }

        // Para cada concepto calcular: frecuencia %, promedio, moda, y costos
        const listaDescartables = [];
        let sumaCostoModa = 0;
        let sumaCostoPromedio = 0;
        let sumaVentaModa = 0;
        let sumaVentaPromedio = 0;

        for (const [conceptoKey, data] of Object.entries(conceptosMap)) {
            const vecesUsado = data.visitas.size;
            const porcentajeUso = (vecesUsado / totalVisitasConConsumo) * 100;

            // Filtramos descartables con al menos un 5% de frecuencia de uso para descartar consumos atípicos/accidentales
            if (porcentajeUso < 5 && vecesUsado < 3) continue;

            const cantidades = Object.values(data.cantidadesPorVisita);
            const sumaCant = cantidades.reduce((a, b) => a + b, 0);
            const promedioCant = parseFloat((sumaCant / cantidades.length).toFixed(2));
            const modaCant = parseFloat(Number(calcularModa(cantidades)).toFixed(2));

            const precios = obtenerPreciosArticulo(data.concepto_original);

            const costoModa = parseFloat((modaCant * precios.costo_compra).toFixed(2));
            const costoPromedio = parseFloat((promedioCant * precios.costo_compra).toFixed(2));
            const ventaModa = parseFloat((modaCant * precios.precio_venta).toFixed(2));
            const ventaPromedio = parseFloat((promedioCant * precios.precio_venta).toFixed(2));

            // Si el artículo se usa en más del 25% de las cirugías, lo consideramos parte del "Módulo Base de Descartables"
            const esArticuloBase = porcentajeUso >= 25;

            if (esArticuloBase) {
                sumaCostoModa += costoModa;
                sumaCostoPromedio += costoPromedio;
                sumaVentaModa += ventaModa;
                sumaVentaPromedio += ventaPromedio;
            }

            listaDescartables.push({
                concepto: data.concepto_original,
                frecuencia_uso_pct: parseFloat(porcentajeUso.toFixed(1)),
                cirugias_usado: vecesUsado,
                cantidad_promedio: promedioCant,
                cantidad_moda: modaCant,
                costo_unitario: precios.costo_compra,
                precio_unitario: precios.precio_venta,
                costo_subtotal_moda: costoModa,
                costo_subtotal_promedio: costoPromedio,
                precio_subtotal_moda: ventaModa,
                precio_subtotal_promedio: ventaPromedio,
                es_modulo_base: esArticuloBase
            });
        }

        // Ordenar descartables: primero los del módulo base (mayor frecuencia), luego por frecuencia desc
        listaDescartables.sort((a, b) => b.frecuencia_uso_pct - a.frecuencia_uso_pct);

        resultadoTop50.push({
            ranking: i + 1,
            nombre_cirugia: cirugia.nombre_cirugia,
            total_intervenciones_historico: cirugia.total_intervenciones,
            casos_analizados: totalVisitasConConsumo,
            cantidad_articulos_modulo: listaDescartables.filter(d => d.es_modulo_base).length,
            costo_total_estimado_moda: parseFloat(sumaCostoModa.toFixed(2)),
            costo_total_estimado_promedio: parseFloat(sumaCostoPromedio.toFixed(2)),
            precio_venta_total_moda: parseFloat(sumaVentaModa.toFixed(2)),
            precio_venta_total_promedio: parseFloat(sumaVentaPromedio.toFixed(2)),
            descartables: listaDescartables
        });
    }

    console.log('\n--- PROCESAMIENTO COMPLETADO EXITOSAMENTE ---');

    // Guardar archivo JSON con los resultados
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    const outputPath = path.join(dataDir, 'modulos_descartables_top50.json');
    fs.writeFileSync(outputPath, JSON.stringify(resultadoTop50, null, 2), 'utf-8');
    console.log(`Resultados guardados en: ${outputPath}`);

    // Mostrar resumen de las 10 cirugías principales
    console.log('\n=== TOP 10 CIRUGÍAS: MÓDULO DE DESCARTABLES (MODA Y PROMEDIO) ===');
    console.table(resultadoTop50.slice(0, 10).map(r => ({
        Ranking: r.ranking,
        Cirugia: r.nombre_cirugia.substring(0, 35),
        Casos: r.casos_analizados,
        ItemsBase: r.cantidad_articulos_modulo,
        CostoModa: `$${r.costo_total_estimado_moda.toLocaleString('es-AR')}`,
        CostoProm: `$${r.costo_total_estimado_promedio.toLocaleString('es-AR')}`,
        VentaModa: `$${r.precio_venta_total_moda.toLocaleString('es-AR')}`,
        VentaProm: `$${r.precio_venta_total_promedio.toLocaleString('es-AR')}`
    })));

    await pool.close();
}

main().catch(console.error);
