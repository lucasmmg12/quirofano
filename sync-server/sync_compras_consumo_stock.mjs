import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const SQL_CONFIG = {
    server: process.env.SALUS_HOST || '128.223.16.29',
    port: parseInt(process.env.SALUS_PORT || '2450', 10),
    user: process.env.SALUS_USER || 'SalusConsulta',
    password: process.env.SALUS_PASSWORD || 'ConsultaSALUS1234',
    database: process.env.SALUS_DATABASE || 'SALUS',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        requestTimeout: 240000,
        connectionTimeout: 20000,
        tdsVersion: '7_4',
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

function norm(s) {
    return String(s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim();
}

export function clasificarGrupoAlmacen(nombreAlmacen) {
    const n = norm(nombreAlmacen);
    if (!n) return 'SOPORTE';
    if (n.includes('COMPRAS') || n.includes('FARMACIA') || n.includes('TRANSITO')) {
        return 'CENTRAL';
    }
    const soporteTokens = [
        'ADMINISTRACION', 'AUXILIARES', 'CALIDAD', 'COCINA', 'CONTACTCENTER',
        'CONVENIOS', 'FACTURACION', 'FUNDACION', 'MANTENIMIENTO', 'PERSONAL',
        'RECEP', 'ROPERIA', 'RRHH', 'TESORERIA', 'TYS', 'SL S3 - AUX', 'SL S3 - RECEP'
    ];
    if (soporteTokens.some(tok => n.includes(tok))) {
        return 'SOPORTE';
    }
    return 'CLINICO';
}

export async function syncComprasConsumoStock({ startYear = 2024 } = {}) {
    console.log(`\n📦 [SYNC COMPRAS-CONSUMO-STOCK] Iniciando extracción SALUS (${startYear}–actualidad)...`);
    const pool = await sql.connect(SQL_CONFIG);
    const nowIso = new Date().toISOString();

    try {
        // 1. Catálogo de Almacenes
        const almRes = await pool.request().query(`SELECT id, ISNULL(descripcion, nombre) AS nombre FROM FM_Almacenes`);
        const almMap = new Map();
        for (const a of almRes.recordset) {
            const nombre = String(a.nombre || `ALMACEN ${a.id}`).trim();
            almMap.set(Number(a.id), { nombre, grupo: clasificarGrupoAlmacen(nombre) });
        }
        console.log(`   ✅ ${almMap.size} almacenes cargados.`);

        // 2. Último precio de compra real por artículo + catálogo maestro FM_Articulos
        console.log('📥 Obteniendo último precio de compra real por artículo...');
        const [artRes, ultPrecioRes] = await Promise.all([
            pool.request().query(`
                SELECT id, codigobarras, descripcion1, ISNULL(precioUnitario, 0) AS precioUnitario
                FROM FM_Articulos WITH (NOLOCK)
            `),
            pool.request().query(`
                SELECT idArticulo, precio FROM (
                    SELECT l.idArticulo, la.importeUnitario AS precio,
                           ROW_NUMBER() OVER (PARTITION BY l.idArticulo ORDER BY a.fecha DESC, la.Id DESC) AS rn
                    FROM FC_Lineas_AlbaranesC la WITH (NOLOCK)
                    INNER JOIN FC_AlbaranesC a WITH (NOLOCK) ON a.id = la.idAlbaran
                    INNER JOIN FM_Lotes l WITH (NOLOCK) ON l.id = la.idLote
                    WHERE la.importeUnitario > 0
                ) t WHERE rn = 1
            `)
        ]);

        const artMap = new Map();
        for (const a of artRes.recordset) {
            artMap.set(Number(a.id), {
                codigo: a.codigobarras ? String(a.codigobarras).trim() : String(a.id),
                nombre: (a.descripcion1 ? String(a.descripcion1).trim() : `ARTÍCULO ${a.id}`) || `ARTÍCULO ${a.id}`,
                precioFallback: Number(a.precioUnitario || 0),
            });
        }

        const precioMap = new Map();
        for (const p of ultPrecioRes.recordset) {
            precioMap.set(Number(p.idArticulo), Number(p.precio || 0));
        }
        const getPrecio = (idArt) => {
            const p = precioMap.get(idArt);
            if (p && p > 0) return p;
            return artMap.get(idArt)?.precioFallback || 0;
        };
        console.log(`   ✅ ${artMap.size} artículos y ${precioMap.size} últimos precios de compra resueltos.`);

        // 3. Compras agregadas por mes × proveedor × artículo × almacén (startYear+)
        console.log(`📥 Extrayendo compras (${startYear}+) desde FC_AlbaranesC / FC_Lineas_AlbaranesC...`);
        const compRes = await pool.request().query(`
            SELECT
                YEAR(a.fecha) AS anio,
                MONTH(a.fecha) AS mes,
                ISNULL(a.idProveedor, 0) AS id_proveedor,
                ISNULL(p.nombre, 'PROVEEDOR ' + CAST(ISNULL(a.idProveedor, 0) AS VARCHAR(20))) AS proveedor,
                l.idArticulo AS id_articulo,
                ISNULL(la.idAlmacen, 0) AS id_almacen,
                COUNT(DISTINCT a.id) AS remitos,
                SUM(ISNULL(la.cantidad, 0)) AS cantidad,
                SUM(ISNULL(la.cantidad, 0) * ISNULL(la.importeUnitario, 0) * (1.0 - ISNULL(la.descuento, 0) / 100.0)) AS importe_total,
                MIN(CASE WHEN la.importeUnitario > 0 THEN la.importeUnitario END) AS precio_min,
                MAX(ISNULL(la.importeUnitario, 0)) AS precio_max,
                AVG(CASE WHEN la.importeUnitario > 0 THEN la.importeUnitario END) AS precio_prom
            FROM FC_Lineas_AlbaranesC la WITH (NOLOCK)
            INNER JOIN FC_AlbaranesC a WITH (NOLOCK) ON a.id = la.idAlbaran
            INNER JOIN FM_Lotes l WITH (NOLOCK) ON l.id = la.idLote
            LEFT JOIN FC_Proveedores p WITH (NOLOCK) ON p.id = a.idProveedor
            WHERE a.fecha >= '${startYear}-01-01'
              AND a.fecha <= DATEADD(day, 1, GETDATE())
            GROUP BY YEAR(a.fecha), MONTH(a.fecha), ISNULL(a.idProveedor, 0),
                     ISNULL(p.nombre, 'PROVEEDOR ' + CAST(ISNULL(a.idProveedor, 0) AS VARCHAR(20))),
                     l.idArticulo, ISNULL(la.idAlmacen, 0)
        `);
        console.log(`   ✅ ${compRes.recordset.length} agrupaciones de compras extraídas.`);

        // Acumulador mensual por (anio, mes, id_almacen)
        const mensualMap = new Map();
        const getMensual = (anio, mes, idAlm) => {
            const k = `${anio}|${mes}|${idAlm}`;
            let b = mensualMap.get(k);
            if (!b) {
                const info = almMap.get(idAlm) || { nombre: `ALMACÉN ${idAlm}`, grupo: 'CENTRAL' };
                b = {
                    anio,
                    mes,
                    id_almacen: idAlm,
                    almacen: info.nombre,
                    grupo_almacen: info.grupo,
                    compras_unidades: 0,
                    compras_importe: 0,
                    compras_remitos: 0,
                    consumo_unidades: 0,
                    consumo_importe: 0,
                    traspasos_unidades: 0,
                    traspasos_importe: 0,
                    reg_positivas: 0,
                    reg_negativas: 0,
                    reg_importe_neto: 0,
                    updated_at: nowIso,
                };
                mensualMap.set(k, b);
            }
            return b;
        };

        const comprasDetalleRows = [];
        for (const r of compRes.recordset) {
            const anio = Number(r.anio);
            const mes = Number(r.mes);
            const idAlm = Number(r.id_almacen || 0);
            const idArt = Number(r.id_articulo);
            const infoAlm = almMap.get(idAlm) || { nombre: 'COMPRAS CENTRAL', grupo: 'CENTRAL' };
            const artNombre = artMap.get(idArt)?.nombre || `ARTÍCULO ${idArt}`;
            const cant = Math.round(Number(r.cantidad || 0) * 100) / 100;
            const imp = Math.round(Number(r.importe_total || 0) * 100) / 100;
            const rem = Number(r.remitos || 0);

            const mBucket = getMensual(anio, mes, idAlm);
            mBucket.compras_unidades = Math.round((mBucket.compras_unidades + cant) * 100) / 100;
            mBucket.compras_importe = Math.round((mBucket.compras_importe + imp) * 100) / 100;
            mBucket.compras_remitos += rem;

            comprasDetalleRows.push({
                anio,
                mes,
                id_proveedor: Number(r.id_proveedor || 0),
                proveedor: String(r.proveedor || 'SIN PROVEEDOR').trim(),
                id_articulo: idArt,
                articulo: artNombre,
                id_almacen: idAlm,
                almacen: infoAlm.nombre,
                grupo_almacen: infoAlm.grupo,
                remitos: rem,
                cantidad: cant,
                importe_total: imp,
                precio_min: Math.round(Number(r.precio_min || 0) * 100) / 100,
                precio_max: Math.round(Number(r.precio_max || 0) * 100) / 100,
                precio_prom: Math.round(Number(r.precio_prom || 0) * 100) / 100,
                updated_at: nowIso,
            });
        }

        // 4. Movimientos mensuales (VES, VEA, TRA, REG) agregados en SQL Server (startYear+)
        console.log(`📥 Extrayendo consumos, traspasos y regularizaciones (${startYear}+) desde FM_Movimientos...`);
        const movRes = await pool.request().query(`
            SELECT
                YEAR(m.Fecha) AS anio,
                MONTH(m.Fecha) AS mes,
                m.idAlmacen AS id_almacen,
                m.tipo,
                l.idArticulo AS id_articulo,
                SUM(ABS(ISNULL(m.cantidadVenta, 0))) AS cant_venta,
                SUM(ABS(ISNULL(m.stock, 0))) AS abs_stock,
                SUM(CASE WHEN m.stock > 0 THEN m.stock ELSE 0 END) AS pos_stock,
                SUM(CASE WHEN m.stock < 0 THEN ABS(m.stock) ELSE 0 END) AS neg_stock
            FROM FM_Movimientos m WITH (NOLOCK)
            INNER JOIN FM_Lotes l WITH (NOLOCK) ON l.id = m.IdLote
            WHERE m.Fecha >= '${startYear}-01-01'
              AND m.Fecha <= DATEADD(day, 1, GETDATE())
              AND m.tipo IN ('VES', 'VEA', 'TRA', 'REG')
            GROUP BY YEAR(m.Fecha), MONTH(m.Fecha), m.idAlmacen, m.tipo, l.idArticulo
        `);
        console.log(`   ✅ ${movRes.recordset.length} agrupaciones de movimientos extraídas.`);

        for (const m of movRes.recordset) {
            const anio = Number(m.anio);
            const mes = Number(m.mes);
            const idAlm = Number(m.id_almacen || 0);
            const idArt = Number(m.id_articulo);
            const precio = getPrecio(idArt);
            const b = getMensual(anio, mes, idAlm);

            if (m.tipo === 'VES' || m.tipo === 'VEA') {
                const u = Number(m.cant_venta || 0) > 0 ? Number(m.cant_venta) : Number(m.abs_stock || 0);
                b.consumo_unidades = Math.round((b.consumo_unidades + u) * 100) / 100;
                b.consumo_importe = Math.round((b.consumo_importe + u * precio) * 100) / 100;
            } else if (m.tipo === 'TRA') {
                const u = Number(m.pos_stock || 0); // contar solo entradas de traspaso para no duplicar origen+destino
                b.traspasos_unidades = Math.round((b.traspasos_unidades + u) * 100) / 100;
                b.traspasos_importe = Math.round((b.traspasos_importe + u * precio) * 100) / 100;
            } else if (m.tipo === 'REG') {
                const pos = Number(m.pos_stock || 0);
                const neg = Number(m.neg_stock || 0);
                b.reg_positivas = Math.round((b.reg_positivas + pos) * 100) / 100;
                b.reg_negativas = Math.round((b.reg_negativas + neg) * 100) / 100;
                b.reg_importe_neto = Math.round((b.reg_importe_neto + (pos - neg) * precio) * 100) / 100;
            }
        }

        // 5. Snapshot de Stock Actual + Consumo 30d/90d + Punto Pedido + Lotes Vencidos
        console.log('📥 Calculando snapshot actual de Stock, Cobertura y Reposición...');
        const [stkRes, cfgRes, cons90Res] = await Promise.all([
            pool.request().query(`
                SELECT
                    l.idArticulo AS id_articulo,
                    s.idAlmacen AS id_almacen,
                    SUM(ISNULL(s.cantidad, 0)) AS stock_actual,
                    SUM(CASE WHEN s.cantidad > 0 AND l.fechaCaducidad IS NOT NULL AND l.fechaCaducidad < GETDATE() THEN 1 ELSE 0 END) AS lotes_vencidos,
                    SUM(CASE WHEN s.cantidad > 0 AND l.fechaCaducidad IS NOT NULL AND l.fechaCaducidad >= GETDATE() AND l.fechaCaducidad <= DATEADD(day, 90, GETDATE()) THEN 1 ELSE 0 END) AS lotes_por_vencer_90d
                FROM FM_Stocks s WITH (NOLOCK)
                INNER JOIN FM_Lotes l WITH (NOLOCK) ON l.id = s.idLote
                GROUP BY l.idArticulo, s.idAlmacen
                HAVING SUM(ISNULL(s.cantidad, 0)) > 0
            `),
            pool.request().query(`
                SELECT IdArticulo, IdAlmacen, ISNULL(StockMinimo, 0) AS StockMinimo,
                       ISNULL(StockMaximo, 0) AS StockMaximo, ISNULL(PuntoPedido, 0) AS PuntoPedido
                FROM FM_AlmacenesStock WITH (NOLOCK)
            `),
            pool.request().query(`
                SELECT
                    l.idArticulo AS id_articulo,
                    m.idAlmacen AS id_almacen,
                    SUM(CASE WHEN m.tipo IN ('VES','VEA') AND m.Fecha >= DATEADD(day, -30, GETDATE()) THEN ABS(ISNULL(m.cantidadVenta, 0)) ELSE 0 END) AS consumo_30d,
                    SUM(CASE WHEN m.tipo IN ('VES','VEA') THEN ABS(ISNULL(m.cantidadVenta, 0)) ELSE 0 END) AS consumo_90d,
                    SUM(CASE WHEN m.stock > 0 AND m.Fecha >= DATEADD(day, -30, GETDATE()) THEN m.stock ELSE 0 END) AS entradas_30d,
                    SUM(CASE WHEN m.stock > 0 THEN m.stock ELSE 0 END) AS entradas_90d,
                    SUM(CASE WHEN m.stock < 0 AND m.Fecha >= DATEADD(day, -30, GETDATE()) THEN ABS(m.stock) ELSE 0 END) AS salidas_30d,
                    SUM(CASE WHEN m.stock < 0 THEN ABS(m.stock) ELSE 0 END) AS salidas_90d,
                    SUM(CASE WHEN m.tipo = 'REG' THEN ISNULL(m.stock, 0) ELSE 0 END) AS reg_90d_neto
                FROM FM_Movimientos m WITH (NOLOCK)
                INNER JOIN FM_Lotes l WITH (NOLOCK) ON l.id = m.IdLote
                WHERE m.Fecha >= DATEADD(day, -90, GETDATE())
                  AND m.Fecha <= DATEADD(day, 1, GETDATE())
                  AND m.tipo IN ('COM', 'VES', 'VEA', 'TRA', 'REG')
                GROUP BY l.idArticulo, m.idAlmacen
            `)
        ]);

        const cfgMap = new Map();
        for (const c of cfgRes.recordset) {
            cfgMap.set(`${c.IdArticulo}|${c.IdAlmacen}`, c);
        }

        const stockMap = new Map();
        for (const s of stkRes.recordset) {
            stockMap.set(`${s.id_articulo}|${s.id_almacen}`, {
                id_articulo: Number(s.id_articulo),
                id_almacen: Number(s.id_almacen),
                stock_actual: Number(s.stock_actual || 0),
                lotes_vencidos: Number(s.lotes_vencidos || 0),
                lotes_por_vencer_90d: Number(s.lotes_por_vencer_90d || 0),
                consumo_30d: 0,
                consumo_90d: 0,
                entradas_30d: 0,
                entradas_90d: 0,
                salidas_30d: 0,
                salidas_90d: 0,
                reg_90d_neto: 0,
            });
        }

        // Unir también artículos con salidas/entradas en los últimos 90 días aunque hoy tengan stock 0 (detecta QUIEBRES!)
        for (const c of cons90Res.recordset) {
            const k = `${c.id_articulo}|${c.id_almacen}`;
            let entry = stockMap.get(k);
            if (!entry) {
                entry = {
                    id_articulo: Number(c.id_articulo),
                    id_almacen: Number(c.id_almacen),
                    stock_actual: 0,
                    lotes_vencidos: 0,
                    lotes_por_vencer_90d: 0,
                    consumo_30d: 0,
                    consumo_90d: 0,
                    entradas_30d: 0,
                    entradas_90d: 0,
                    salidas_30d: 0,
                    salidas_90d: 0,
                    reg_90d_neto: 0,
                };
                stockMap.set(k, entry);
            }
            entry.consumo_30d = Number(c.consumo_30d || 0);
            entry.consumo_90d = Number(c.consumo_90d || 0);
            entry.entradas_30d = Number(c.entradas_30d || 0);
            entry.entradas_90d = Number(c.entradas_90d || 0);
            entry.salidas_30d = Number(c.salidas_30d || 0);
            entry.salidas_90d = Number(c.salidas_90d || 0);
            entry.reg_90d_neto = Number(c.reg_90d_neto || 0);
        }

        const stockActualRows = [];
        for (const item of stockMap.values()) {
            const almInfo = almMap.get(item.id_almacen);
            if (!almInfo) continue;
            const artInfo = artMap.get(item.id_articulo) || { codigo: String(item.id_articulo), nombre: `ARTÍCULO ${item.id_articulo}` };
            const cfg = cfgMap.get(`${item.id_articulo}|${item.id_almacen}`) || {};
            const precio = getPrecio(item.id_articulo);
            // Rotación real del almacén: usa Salidas Totales 90d (VES+VEA+TRA-+REG-)
            const salidasEfectivas90d = Math.max(item.salidas_90d, item.consumo_90d);
            const consumoDiario = salidasEfectivas90d / 90.0;
            const diasCob = consumoDiario > 0 ? Math.min(9999, Math.round((item.stock_actual / consumoDiario) * 10) / 10) : null;

            const stockMin = Number(cfg.StockMinimo || 0);
            const stockMax = Number(cfg.StockMaximo || 0);
            const puntoPed = Number(cfg.PuntoPedido || 0);

            let estado = 'OPTIMO';
            if (item.stock_actual <= 0 && salidasEfectivas90d > 0) estado = 'QUIEBRE';
            else if (diasCob !== null && diasCob < 7) estado = 'CRITICO';
            else if ((diasCob !== null && diasCob < 15) || (stockMin > 0 && item.stock_actual <= stockMin)) estado = 'REPONER';
            else if (item.stock_actual > 0 && salidasEfectivas90d <= 0 && item.entradas_90d <= 0) estado = 'SIN_MOVIMIENTO';
            else if (diasCob !== null && diasCob > 90) estado = 'SOBRESTOCK';

            // Sugerencia de compra para llevar a 30 días de cobertura (o stock_maximo)
            const targetStock = Math.max(consumoDiario * 30, stockMax, stockMin * 1.5);
            const sugerencia = (estado === 'QUIEBRE' || estado === 'CRITICO' || estado === 'REPONER')
                ? Math.max(0, Math.ceil(targetStock - item.stock_actual))
                : 0;

            stockActualRows.push({
                id_articulo: item.id_articulo,
                codigo: artInfo.codigo,
                articulo: artInfo.nombre,
                familia: 'GENERAL',
                id_almacen: item.id_almacen,
                almacen: almInfo.nombre,
                grupo_almacen: almInfo.grupo,
                stock_actual: Math.round(item.stock_actual * 100) / 100,
                stock_minimo: Math.round(stockMin * 100) / 100,
                stock_maximo: Math.round(stockMax * 100) / 100,
                punto_pedido: Math.round(puntoPed * 100) / 100,
                ultimo_precio_compra: Math.round(precio * 100) / 100,
                valor_stock: Math.round(item.stock_actual * precio * 100) / 100,
                consumo_30d: Math.round(item.consumo_30d * 100) / 100,
                consumo_90d: Math.round(item.consumo_90d * 100) / 100,
                entradas_30d: Math.round(item.entradas_30d * 100) / 100,
                entradas_90d: Math.round(item.entradas_90d * 100) / 100,
                salidas_30d: Math.round(item.salidas_30d * 100) / 100,
                salidas_90d: Math.round(item.salidas_90d * 100) / 100,
                consumo_diario_prom: Math.round(consumoDiario * 10000) / 10000,
                dias_cobertura: diasCob,
                sugerencia_compra: sugerencia,
                estado_stock: estado,
                lotes_vencidos: item.lotes_vencidos,
                lotes_por_vencer_90d: item.lotes_por_vencer_90d,
                reg_90d_neto: Math.round(item.reg_90d_neto * 100) / 100,
                updated_at: nowIso,
            });
        }

        const mensualList = Array.from(mensualMap.values());
        console.log(`📊 Listo para subir: ${mensualList.length} mensuales | ${stockActualRows.length} stock×almacén | ${comprasDetalleRows.length} compras×proveedor.`);

        // 6. Subir a Supabase
        const BATCH = 500;

        console.log('☁️ Actualizando gob_ccs_mensual_agg...');
        await supabase.from('gob_ccs_mensual_agg').delete().gte('anio', startYear);
        for (let i = 0; i < mensualList.length; i += BATCH) {
            const { error } = await supabase.from('gob_ccs_mensual_agg').insert(mensualList.slice(i, i + BATCH));
            if (error) console.error(`❌ Error mensual batch ${i}:`, error.message);
        }

        console.log('☁️ Actualizando gob_ccs_stock_actual...');
        await supabase.from('gob_ccs_stock_actual').delete().gte('id', 0);
        for (let i = 0; i < stockActualRows.length; i += BATCH) {
            const { error } = await supabase.from('gob_ccs_stock_actual').insert(stockActualRows.slice(i, i + BATCH));
            if (error) console.error(`❌ Error stock batch ${i}:`, error.message);
        }

        console.log('☁️ Actualizando gob_ccs_compras_detalle...');
        await supabase.from('gob_ccs_compras_detalle').delete().gte('anio', startYear);
        for (let i = 0; i < comprasDetalleRows.length; i += BATCH) {
            const { error } = await supabase.from('gob_ccs_compras_detalle').insert(comprasDetalleRows.slice(i, i + BATCH));
            if (error) console.error(`❌ Error compras batch ${i}:`, error.message);
        }

        // 7. Derivaciones (FM_Traspasos) y Pedidos Internos por Sector (FM_PeticionesTraspaso)
        const derRes = await syncDerivacionesYPedidosInterno(pool, almMap, artMap, getPrecio, startYear, nowIso);

        console.log('🏁 Sincronización Compras-Consumo-Stock completada con éxito.');
        return {
            mensual: mensualList.length,
            stock: stockActualRows.length,
            comprasDetalle: comprasDetalleRows.length,
            ...derRes,
        };
    } finally {
        await pool.close();
    }
}

const TRANSITO_ALMACEN_IDS = new Set([44, 47, 48]); // TRÁNSITO (SLS), (SLN), (SF)

async function syncDerivacionesYPedidosInterno(pool, almMap, artMap, getPrecio, startYear, nowIso) {
    console.log(`\n🚚 [SYNC DERIVACIONES Y PEDIDOS POR SECTOR] Extrayendo FM_PeticionesTraspaso y FM_Traspasos (${startYear}+)...`);
    const BATCH = 500;

    // A. Pedidos agregados por mes × sector solicitante (IdAlmacenDestino)
    const [pedMesRes, pedArtRes, traMesRes, traArtRes, pedRecientesRes] = await Promise.all([
        pool.request().query(`
            SELECT
                YEAR(p.Fecha) AS anio,
                MONTH(p.Fecha) AS mes,
                p.IdAlmacenDestino AS id_sector,
                COUNT(DISTINCT p.Id) AS pedidos_count,
                COUNT(DISTINCT CASE WHEN p.FechaServido IS NOT NULL THEN p.Id END) AS pedidos_servidos,
                COUNT(DISTINCT CASE WHEN p.FechaServido IS NULL THEN p.Id END) AS pedidos_pendientes,
                SUM(ISNULL(lp.Cantidad, 0)) AS unidades_pedidas,
                COUNT(DISTINCT lp.IdArticulo) AS articulos_pedidos_unicos,
                AVG(CASE WHEN p.FechaServido IS NOT NULL AND p.FechaServido >= p.Fecha
                    THEN DATEDIFF(MINUTE, p.Fecha, p.FechaServido) / 60.0 END) AS lead_time_prom_hs
            FROM FM_PeticionesTraspaso p WITH (NOLOCK)
            LEFT JOIN FM_Lineas_PeticionesTraspaso lp WITH (NOLOCK) ON lp.IdPeticion = p.Id
            WHERE p.Fecha >= '${startYear}-01-01'
              AND p.Fecha <= DATEADD(day, 1, GETDATE())
              AND p.IdAlmacenDestino IS NOT NULL
            GROUP BY YEAR(p.Fecha), MONTH(p.Fecha), p.IdAlmacenDestino
        `),
        pool.request().query(`
            SELECT
                YEAR(p.Fecha) AS anio,
                MONTH(p.Fecha) AS mes,
                p.IdAlmacenDestino AS id_sector,
                lp.IdArticulo AS id_articulo,
                COUNT(DISTINCT p.Id) AS pedidos_count,
                SUM(ISNULL(lp.Cantidad, 0)) AS unidades_pedidas
            FROM FM_PeticionesTraspaso p WITH (NOLOCK)
            INNER JOIN FM_Lineas_PeticionesTraspaso lp WITH (NOLOCK) ON lp.IdPeticion = p.Id
            WHERE p.Fecha >= '${startYear}-01-01'
              AND p.Fecha <= DATEADD(day, 1, GETDATE())
              AND p.IdAlmacenDestino IS NOT NULL
              AND lp.IdArticulo IS NOT NULL
            GROUP BY YEAR(p.Fecha), MONTH(p.Fecha), p.IdAlmacenDestino, lp.IdArticulo
        `),
        // Traspasos (Derivaciones efectivas) excluyendo destinos de TRÁNSITO para no duplicar entregas
        pool.request().query(`
            SELECT
                YEAR(t.fecha) AS anio,
                MONTH(t.fecha) AS mes,
                t.idAlmacenDestino AS id_sector,
                COUNT(DISTINCT t.id) AS traspasos_recibidos,
                SUM(ISNULL(lt.cantidad, 0)) AS unidades_derivadas,
                COUNT(DISTINCT l.idArticulo) AS articulos_derivados_unicos,
                SUM(ISNULL(lt.cantidad, 0) * ISNULL(lt.PrecioCoste, 0)) AS importe_coste
            FROM FM_Traspasos t WITH (NOLOCK)
            INNER JOIN FM_Lineas_Traspasos lt WITH (NOLOCK) ON lt.idTraspaso = t.id
            INNER JOIN FM_Lotes l WITH (NOLOCK) ON l.id = lt.idLote
            WHERE t.fecha >= '${startYear}-01-01'
              AND t.fecha <= DATEADD(day, 1, GETDATE())
              AND t.idAlmacenDestino IS NOT NULL
              AND t.idAlmacenDestino NOT IN (44, 47, 48)
            GROUP BY YEAR(t.fecha), MONTH(t.fecha), t.idAlmacenDestino
        `),
        pool.request().query(`
            SELECT
                YEAR(t.fecha) AS anio,
                MONTH(t.fecha) AS mes,
                t.idAlmacenDestino AS id_sector,
                l.idArticulo AS id_articulo,
                COUNT(DISTINCT t.id) AS traspasos_count,
                SUM(ISNULL(lt.cantidad, 0)) AS unidades_derivadas,
                SUM(ISNULL(lt.cantidad, 0) * ISNULL(lt.PrecioCoste, 0)) AS importe_coste
            FROM FM_Traspasos t WITH (NOLOCK)
            INNER JOIN FM_Lineas_Traspasos lt WITH (NOLOCK) ON lt.idTraspaso = t.id
            INNER JOIN FM_Lotes l WITH (NOLOCK) ON l.id = lt.idLote
            WHERE t.fecha >= '${startYear}-01-01'
              AND t.fecha <= DATEADD(day, 1, GETDATE())
              AND t.idAlmacenDestino IS NOT NULL
              AND t.idAlmacenDestino NOT IN (44, 47, 48)
            GROUP BY YEAR(t.fecha), MONTH(t.fecha), t.idAlmacenDestino, l.idArticulo
        `),
        // Pedidos individuales últimos 180 días + pendientes con detalle de líneas
        pool.request().query(`
            SELECT
                p.Id AS id_peticion,
                p.Fecha AS fecha,
                p.FechaServido AS fecha_servido,
                p.IdAlmacen AS id_almacen_origen,
                p.IdAlmacenDestino AS id_sector,
                p.Observaciones AS observaciones,
                lp.Id AS id_linea,
                lp.IdArticulo AS id_articulo,
                ISNULL(lp.Cantidad, 0) AS cantidad_pedida,
                ISNULL(ent.cant_entregada, 0) AS cantidad_entregada
            FROM FM_PeticionesTraspaso p WITH (NOLOCK)
            LEFT JOIN FM_Lineas_PeticionesTraspaso lp WITH (NOLOCK) ON lp.IdPeticion = p.Id
            LEFT JOIN (
                SELECT IdLineaPeticionTraspaso, SUM(ISNULL(cantidad, 0)) AS cant_entregada
                FROM FM_Lineas_Traspasos WITH (NOLOCK)
                WHERE IdLineaPeticionTraspaso IS NOT NULL
                GROUP BY IdLineaPeticionTraspaso
            ) ent ON ent.IdLineaPeticionTraspaso = lp.Id
            WHERE (p.Fecha >= DATEADD(day, -180, GETDATE()) OR p.FechaServido IS NULL)
              AND p.Fecha >= '2025-01-01'
              AND p.IdAlmacenDestino IS NOT NULL
            ORDER BY p.Fecha DESC
        `)
    ]);

    // 1. Consolidar gob_ccs_sectores_derivaciones_mensual
    const secMesMap = new Map();
    const getSecMes = (anio, mes, idSec) => {
        const k = `${anio}|${mes}|${idSec}`;
        let b = secMesMap.get(k);
        if (!b) {
            const info = almMap.get(idSec) || { nombre: `SECTOR ${idSec}`, grupo: 'CLINICO' };
            b = {
                anio,
                mes,
                id_sector: idSec,
                sector: info.nombre,
                grupo_almacen: info.grupo,
                pedidos_count: 0,
                pedidos_servidos: 0,
                pedidos_pendientes: 0,
                unidades_pedidas: 0,
                articulos_pedidos_unicos: 0,
                traspasos_recibidos: 0,
                unidades_derivadas: 0,
                articulos_derivados_unicos: 0,
                importe_derivado: 0,
                lead_time_prom_hs: null,
                updated_at: nowIso,
            };
            secMesMap.set(k, b);
        }
        return b;
    };

    for (const r of pedMesRes.recordset) {
        const idSec = Number(r.id_sector);
        if (TRANSITO_ALMACEN_IDS.has(idSec)) continue;
        const b = getSecMes(Number(r.anio), Number(r.mes), idSec);
        b.pedidos_count = Number(r.pedidos_count || 0);
        b.pedidos_servidos = Number(r.pedidos_servidos || 0);
        b.pedidos_pendientes = Number(r.pedidos_pendientes || 0);
        b.unidades_pedidas = Math.round(Number(r.unidades_pedidas || 0) * 100) / 100;
        b.articulos_pedidos_unicos = Number(r.articulos_pedidos_unicos || 0);
        b.lead_time_prom_hs = r.lead_time_prom_hs !== null && r.lead_time_prom_hs !== undefined
            ? Math.min(9999, Math.round(Number(r.lead_time_prom_hs) * 10) / 10)
            : null;
    }

    for (const r of traMesRes.recordset) {
        const idSec = Number(r.id_sector);
        if (TRANSITO_ALMACEN_IDS.has(idSec)) continue;
        const b = getSecMes(Number(r.anio), Number(r.mes), idSec);
        b.traspasos_recibidos = Number(r.traspasos_recibidos || 0);
        b.unidades_derivadas = Math.round(Number(r.unidades_derivadas || 0) * 100) / 100;
        b.articulos_derivados_unicos = Number(r.articulos_derivados_unicos || 0);
        b.importe_derivado = Math.round(Number(r.importe_coste || 0) * 100) / 100;
    }

    // 2. Consolidar gob_ccs_sectores_articulos_mensual
    const secArtMap = new Map();
    const getSecArt = (anio, mes, idSec, idArt) => {
        const k = `${anio}|${mes}|${idSec}|${idArt}`;
        let b = secArtMap.get(k);
        if (!b) {
            const info = almMap.get(idSec) || { nombre: `SECTOR ${idSec}`, grupo: 'CLINICO' };
            const artNombre = artMap.get(idArt)?.nombre || `ARTÍCULO ${idArt}`;
            b = {
                anio,
                mes,
                id_sector: idSec,
                sector: info.nombre,
                grupo_almacen: info.grupo,
                id_articulo: idArt,
                articulo: artNombre,
                pedidos_count: 0,
                unidades_pedidas: 0,
                traspasos_count: 0,
                unidades_derivadas: 0,
                importe_derivado: 0,
                updated_at: nowIso,
            };
            secArtMap.set(k, b);
        }
        return b;
    };

    for (const r of pedArtRes.recordset) {
        const idSec = Number(r.id_sector);
        if (TRANSITO_ALMACEN_IDS.has(idSec)) continue;
        const b = getSecArt(Number(r.anio), Number(r.mes), idSec, Number(r.id_articulo));
        b.pedidos_count = Number(r.pedidos_count || 0);
        b.unidades_pedidas = Math.round(Number(r.unidades_pedidas || 0) * 100) / 100;
    }

    for (const r of traArtRes.recordset) {
        const idSec = Number(r.id_sector);
        if (TRANSITO_ALMACEN_IDS.has(idSec)) continue;
        const idArt = Number(r.id_articulo);
        const b = getSecArt(Number(r.anio), Number(r.mes), idSec, idArt);
        const unid = Math.round(Number(r.unidades_derivadas || 0) * 100) / 100;
        const impSalus = Number(r.importe_coste || 0);
        const imp = impSalus > 0 ? impSalus : unid * getPrecio(idArt);
        b.traspasos_count = Number(r.traspasos_count || 0);
        b.unidades_derivadas = unid;
        b.importe_derivado = Math.round(imp * 100) / 100;

        // Si el importe_derivado mensual del sector vino en 0 por PrecioCoste=0, reforzar con precio fallback
        const sm = secMesMap.get(`${r.anio}|${r.mes}|${idSec}`);
        if (sm && impSalus <= 0 && imp > 0) {
            sm.importe_derivado = Math.round((sm.importe_derivado + imp) * 100) / 100;
        }
    }

    // 3. Consolidar gob_ccs_pedidos_internos (agrupando líneas por id_peticion)
    const pedIndMap = new Map();
    for (const r of pedRecientesRes.recordset) {
        const idPet = Number(r.id_peticion);
        const idSec = Number(r.id_sector);
        if (!idPet || TRANSITO_ALMACEN_IDS.has(idSec)) continue;
        let p = pedIndMap.get(idPet);
        if (!p) {
            const origInfo = almMap.get(Number(r.id_almacen_origen)) || { nombre: `ALMACÉN ${r.id_almacen_origen}` };
            const secInfo = almMap.get(idSec) || { nombre: `SECTOR ${idSec}`, grupo: 'CLINICO' };
            p = {
                id_peticion: idPet,
                fecha: new Date(r.fecha).toISOString(),
                fecha_servido: r.fecha_servido ? new Date(r.fecha_servido).toISOString() : null,
                estado: r.fecha_servido ? 'SERVIDO' : 'PENDIENTE',
                id_almacen_origen: Number(r.id_almacen_origen || 0),
                almacen_origen: origInfo.nombre,
                id_sector: idSec,
                sector: secInfo.nombre,
                grupo_almacen: secInfo.grupo,
                items_count: 0,
                unidades_pedidas: 0,
                unidades_entregadas: 0,
                observaciones: r.observaciones ? String(r.observaciones).trim() : null,
                detalle_articulos: [],
                updated_at: nowIso,
            };
            pedIndMap.set(idPet, p);
        }
        if (r.id_articulo) {
            const idArt = Number(r.id_articulo);
            const cantPed = Math.round(Number(r.cantidad_pedida || 0) * 100) / 100;
            const cantEnt = Math.round(Number(r.cantidad_entregada || 0) * 100) / 100;
            p.items_count += 1;
            p.unidades_pedidas = Math.round((p.unidades_pedidas + cantPed) * 100) / 100;
            p.unidades_entregadas = Math.round((p.unidades_entregadas + cantEnt) * 100) / 100;
            if (p.detalle_articulos.length < 40) {
                p.detalle_articulos.push({
                    id_articulo: idArt,
                    articulo: artMap.get(idArt)?.nombre || `ARTÍCULO ${idArt}`,
                    pedida: cantPed,
                    entregada: cantEnt,
                });
            }
        }
    }

    const secMesList = Array.from(secMesMap.values());
    const secArtList = Array.from(secArtMap.values());
    const pedIndList = Array.from(pedIndMap.values());
    console.log(`   📊 Derivaciones/Pedidos listos: ${secMesList.length} sector×mes | ${secArtList.length} sector×artículo×mes | ${pedIndList.length} pedidos individuales.`);

    console.log('☁️ Actualizando gob_ccs_sectores_derivaciones_mensual...');
    await supabase.from('gob_ccs_sectores_derivaciones_mensual').delete().gte('anio', startYear);
    for (let i = 0; i < secMesList.length; i += BATCH) {
        const { error } = await supabase.from('gob_ccs_sectores_derivaciones_mensual').insert(secMesList.slice(i, i + BATCH));
        if (error) console.error(`❌ Error sec_der batch ${i}:`, error.message);
    }

    console.log('☁️ Actualizando gob_ccs_sectores_articulos_mensual...');
    await supabase.from('gob_ccs_sectores_articulos_mensual').delete().gte('anio', startYear);
    for (let i = 0; i < secArtList.length; i += BATCH) {
        const { error } = await supabase.from('gob_ccs_sectores_articulos_mensual').insert(secArtList.slice(i, i + BATCH));
        if (error) console.error(`❌ Error sec_art batch ${i}:`, error.message);
    }

    console.log('☁️ Actualizando gob_ccs_pedidos_internos...');
    await supabase.from('gob_ccs_pedidos_internos').delete().gte('id_peticion', 0);
    for (let i = 0; i < pedIndList.length; i += BATCH) {
        const { error } = await supabase.from('gob_ccs_pedidos_internos').insert(pedIndList.slice(i, i + BATCH));
        if (error) console.error(`❌ Error pedidos_internos batch ${i}:`, error.message);
    }

    return {
        sectoresDerivaciones: secMesList.length,
        sectoresArticulos: secArtList.length,
        pedidosInternos: pedIndList.length,
    };
}

export async function syncSoloDerivacionesYPedidos({ startYear = 2024 } = {}) {
    const pool = await sql.connect(SQL_CONFIG);
    const nowIso = new Date().toISOString();
    try {
        const [almRes, artRes, ultPrecioRes] = await Promise.all([
            pool.request().query(`SELECT id, ISNULL(descripcion, nombre) AS nombre FROM FM_Almacenes`),
            pool.request().query(`SELECT id, descripcion1, ISNULL(precioUnitario, 0) AS precioUnitario FROM FM_Articulos WITH (NOLOCK)`),
            pool.request().query(`
                SELECT idArticulo, precio FROM (
                    SELECT l.idArticulo, la.importeUnitario AS precio,
                           ROW_NUMBER() OVER (PARTITION BY l.idArticulo ORDER BY a.fecha DESC, la.Id DESC) AS rn
                    FROM FC_Lineas_AlbaranesC la WITH (NOLOCK)
                    INNER JOIN FC_AlbaranesC a WITH (NOLOCK) ON a.id = la.idAlbaran
                    INNER JOIN FM_Lotes l WITH (NOLOCK) ON l.id = la.idLote
                    WHERE la.importeUnitario > 0
                ) t WHERE rn = 1
            `)
        ]);
        const almMap = new Map();
        for (const a of almRes.recordset) {
            const nombre = String(a.nombre || `ALMACEN ${a.id}`).trim();
            almMap.set(Number(a.id), { nombre, grupo: clasificarGrupoAlmacen(nombre) });
        }
        const artMap = new Map();
        for (const a of artRes.recordset) {
            artMap.set(Number(a.id), {
                nombre: (a.descripcion1 ? String(a.descripcion1).trim() : `ARTÍCULO ${a.id}`) || `ARTÍCULO ${a.id}`,
                precioFallback: Number(a.precioUnitario || 0),
            });
        }
        const precioMap = new Map();
        for (const p of ultPrecioRes.recordset) precioMap.set(Number(p.idArticulo), Number(p.precio || 0));
        const getPrecio = (idArt) => precioMap.get(idArt) || artMap.get(idArt)?.precioFallback || 0;

        return await syncDerivacionesYPedidosInterno(pool, almMap, artMap, getPrecio, startYear, nowIso);
    } finally {
        await pool.close();
    }
}

if (process.argv[1] && process.argv[1].endsWith('sync_compras_consumo_stock.mjs')) {
    const runner = process.argv.includes('--only-derivaciones')
        ? syncSoloDerivacionesYPedidos({ startYear: 2024 })
        : syncComprasConsumoStock({ startYear: 2024 });
    runner
        .then(() => process.exit(0))
        .catch(err => { console.error('❌ Error fatal:', err); process.exit(1); });
}
