import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Package, ShoppingCart, Activity, AlertTriangle, TrendingUp, Building2,
    Layers, Search, Download, RefreshCw, Calendar, Filter, ArrowUpRight,
    CheckCircle2, Clock, ShieldAlert, BarChart3, FileSpreadsheet, Boxes,
    Truck, ClipboardList, ChevronDown, ChevronUp
} from 'lucide-react';
import {
    ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
    CartesianGrid, Tooltip, Legend, BarChart, Cell, ReferenceLine
} from 'recharts';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';

const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

const TABS = [
    { id: 'resumen', label: 'Resumen Integrado', icon: Layers },
    { id: 'sectores', label: 'Derivaciones y Pedidos por Sector', icon: Truck },
    { id: 'compras', label: 'Compras y Proveedores', icon: ShoppingCart },
    { id: 'consumo', label: 'Consumo por Servicio', icon: Activity },
    { id: 'stock', label: 'Stock y Reposición', icon: Boxes },
    { id: 'auditoria', label: 'Auditoría (REG & Lotes)', icon: ShieldAlert },
    { id: 'explorador', label: 'Explorador & Excel', icon: FileSpreadsheet },
];

const ESTADO_META = {
    QUIEBRE: { label: 'Quiebre (Stock 0)', color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5' },
    CRITICO: { label: 'Crítico (< 7d)', color: '#C2410C', bg: '#FFEDD5', border: '#FDBA74' },
    REPONER: { label: 'Reponer (< 15d)', color: '#B45309', bg: '#FEF3C7', border: '#FDE68A' },
    OPTIMO: { label: 'Óptimo', color: '#047857', bg: '#ECFDF5', border: '#A7F3D0' },
    SOBRESTOCK: { label: 'Sobrestock (> 90d)', color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
    SIN_MOVIMIENTO: { label: 'Sin Movimiento 90d', color: '#475569', bg: '#F1F5F9', border: '#CBD5E1' },
};

function fmtARS(n, compact = false) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    const num = Number(n);
    if (compact) {
        if (Math.abs(num) >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
        if (Math.abs(num) >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
        if (Math.abs(num) >= 1e3) return `$${(num / 1e3).toFixed(0)}k`;
    }
    return num.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
}

function fmtNum(n, dec = 0) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Number(n).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function dateToYM(str) {
    if (!str) return 202611;
    const [y, m] = String(str).slice(0, 7).split('-').map(Number);
    return (y || 2026) * 100 + (m || 1);
}

export default function ComprasConsumoStockDashboard({
    fechaDesde,
    fechaHasta,
    datePresetMode = 'este_mes',
    addToast,
}) {
    const effectiveDesde = useMemo(() => {
        if (fechaDesde) return fechaDesde;
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }, [fechaDesde]);

    const effectiveHasta = useMemo(() => {
        if (fechaHasta) return fechaHasta;
        const now = new Date();
        const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    }, [fechaHasta]);

    const desdeYM = useMemo(() => dateToYM(effectiveDesde), [effectiveDesde]);
    const hastaYM = useMemo(() => dateToYM(effectiveHasta), [effectiveHasta]);

    // UI States
    const [activeTab, setActiveTab] = useState('resumen');
    const [soloClinicos, setSoloClinicos] = useState(true); // Por defecto Clínicos + Central (Farmacia/Compras)
    const [filterAlmacen, setFilterAlmacen] = useState('TODOS');
    const [filterEstadoStock, setFilterEstadoStock] = useState('TODOS');
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    // Datasets
    const [mensualRows, setMensualRows] = useState([]);
    const [stockRows, setStockRows] = useState([]);
    const [proveedoresRows, setProveedoresRows] = useState([]);
    const [articulosComprasRows, setArticulosComprasRows] = useState([]);

    // Derivaciones y Pedidos por Sector
    const [derivacionesMensual, setDerivacionesMensual] = useState([]);
    const [selectedSectorDeriv, setSelectedSectorDeriv] = useState('TODOS');
    const [sectorSearch, setSectorSearch] = useState('');
    const [sectorArticulos, setSectorArticulos] = useState([]);
    const [loadingSectorArt, setLoadingSectorArt] = useState(false);
    const [pedidosInternos, setPedidosInternos] = useState([]);
    const [pedidoEstadoFilter, setPedidoEstadoFilter] = useState('TODOS'); // 'TODOS' | 'PENDIENTE' | 'SERVIDO'
    const [expandedPedidoId, setExpandedPedidoId] = useState(null);

    const loadAllData = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Mensual agg (compacto, ~1500 filas)
            let allMensual = [];
            let from = 0;
            while (true) {
                const { data, error } = await supabase
                    .from('gob_ccs_mensual_agg')
                    .select('*')
                    .order('ym', { ascending: true })
                    .range(from, from + 999);
                if (error) throw error;
                if (!data || data.length === 0) break;
                allMensual = allMensual.concat(data);
                if (data.length < 1000) break;
                from += 1000;
            }
            setMensualRows(allMensual);

            // 2. Stock actual (paginado)
            let allStock = [];
            from = 0;
            while (true) {
                const { data, error } = await supabase
                    .from('gob_ccs_stock_actual')
                    .select('*')
                    .order('valor_stock', { ascending: false })
                    .range(from, from + 999);
                if (error) throw error;
                if (!data || data.length === 0) break;
                allStock = allStock.concat(data);
                if (data.length < 1000 || allStock.length >= 15000) break;
                from += 1000;
            }
            setStockRows(allStock);

            // 3. Derivaciones y Pedidos por Sector (mensual ~1000 filas + pedidos individuales del período Telar)
            let allDer = [];
            from = 0;
            while (true) {
                const { data, error } = await supabase
                    .from('gob_ccs_sectores_derivaciones_mensual')
                    .select('*')
                    .order('ym', { ascending: true })
                    .range(from, from + 999);
                if (error) throw error;
                if (!data || data.length === 0) break;
                allDer = allDer.concat(data);
                if (data.length < 1000) break;
                from += 1000;
            }
            setDerivacionesMensual(allDer);

            const desdeIso = `${effectiveDesde}T00:00:00-03:00`;
            const hastaIso = `${effectiveHasta}T23:59:59-03:00`;
            const { data: pedData } = await supabase
                .from('gob_ccs_pedidos_internos')
                .select('*')
                .gte('fecha', desdeIso)
                .lte('fecha', hastaIso)
                .order('fecha', { ascending: false })
                .limit(1000);
            setPedidosInternos(pedData || []);

            // 4. RPCs de Proveedores y Curva ABC / Inflación para el período Telar
            const [provRes, artRes] = await Promise.all([
                supabase.rpc('get_gob_ccs_proveedores', {
                    p_desde_ym: desdeYM,
                    p_hasta_ym: hastaYM,
                    p_solo_clinicos: soloClinicos,
                }),
                supabase.rpc('get_gob_ccs_articulos_compras', {
                    p_desde_ym: desdeYM,
                    p_hasta_ym: hastaYM,
                    p_solo_clinicos: soloClinicos,
                }),
            ]);
            if (!provRes.error) setProveedoresRows(provRes.data || []);
            if (!artRes.error) setArticulosComprasRows(artRes.data || []);
        } catch (err) {
            console.error('[ComprasConsumoStockDashboard] Error:', err);
            addToast?.('Error al cargar datos de Compras, Consumo y Stock', 'error');
        } finally {
            setLoading(false);
        }
    }, [desdeYM, hastaYM, effectiveDesde, effectiveHasta, soloClinicos, addToast]);

    useEffect(() => { loadAllData(); }, [loadAllData]);

    // Cargar detalle de artículos derivados/pedidos al cambiar el sector seleccionado o el período del Telar
    useEffect(() => {
        let cancelled = false;
        async function fetchSectorArt() {
            setLoadingSectorArt(true);
            try {
                const { data, error } = await supabase.rpc('get_gob_ccs_derivaciones_articulos', {
                    p_desde_ym: desdeYM,
                    p_hasta_ym: hastaYM,
                    p_sector: selectedSectorDeriv === 'TODOS' ? null : selectedSectorDeriv,
                });
                if (!cancelled && !error) setSectorArticulos(data || []);
            } finally {
                if (!cancelled) setLoadingSectorArt(false);
            }
        }
        fetchSectorArt();
        return () => { cancelled = true; };
    }, [desdeYM, hastaYM, selectedSectorDeriv]);

    // Resumen de Derivaciones y Pedidos por Sector en el período activo del Telar (SIEMPRE incluye TODOS los sectores, ej. Contact Center)
    const resumenSectoresPeriodo = useMemo(() => {
        const bySec = new Map();
        for (const r of derivacionesMensual) {
            if (r.ym < desdeYM || r.ym > hastaYM) continue;
            let b = bySec.get(r.sector);
            if (!b) {
                b = {
                    sector: r.sector,
                    grupo: r.grupo_almacen,
                    pedidosCount: 0,
                    pedidosServidos: 0,
                    pedidosPendientes: 0,
                    unidadesPedidas: 0,
                    traspasosRecibidos: 0,
                    unidadesDerivadas: 0,
                    articulosDerivadosMax: 0,
                    importeDerivado: 0,
                    leadTimeSum: 0,
                    leadTimeCnt: 0,
                };
                bySec.set(r.sector, b);
            }
            b.pedidosCount += Number(r.pedidos_count || 0);
            b.pedidosServidos += Number(r.pedidos_servidos || 0);
            b.pedidosPendientes += Number(r.pedidos_pendientes || 0);
            b.unidadesPedidas += Number(r.unidades_pedidas || 0);
            b.traspasosRecibidos += Number(r.traspasos_recibidos || 0);
            b.unidadesDerivadas += Number(r.unidades_derivadas || 0);
            b.articulosDerivadosMax = Math.max(b.articulosDerivadosMax, Number(r.articulos_derivados_unicos || 0));
            b.importeDerivado += Number(r.importe_derivado || 0);
            if (r.lead_time_prom_hs !== null && r.lead_time_prom_hs !== undefined) {
                b.leadTimeSum += Number(r.lead_time_prom_hs);
                b.leadTimeCnt += 1;
            }
        }
        const q = sectorSearch.trim().toLowerCase();
        return Array.from(bySec.values())
            .filter(s => !q || s.sector.toLowerCase().includes(q) || s.grupo.toLowerCase().includes(q))
            .map(s => ({
                ...s,
                leadTimeProm: s.leadTimeCnt > 0 ? Math.round((s.leadTimeSum / s.leadTimeCnt) * 10) / 10 : null,
                cumplimientoPct: s.unidadesPedidas > 0 ? Math.min(200, Math.round((s.unidadesDerivadas / s.unidadesPedidas) * 1000) / 10) : null,
            }))
            .sort((a, b) => b.unidadesDerivadas - a.unidadesDerivadas || b.pedidosCount - a.pedidosCount);
    }, [derivacionesMensual, desdeYM, hastaYM, sectorSearch]);

    const pedidosFiltrados = useMemo(() => {
        return pedidosInternos.filter(p => {
            if (selectedSectorDeriv !== 'TODOS' && p.sector !== selectedSectorDeriv) return false;
            if (pedidoEstadoFilter !== 'TODOS' && p.estado !== pedidoEstadoFilter) return false;
            return true;
        });
    }, [pedidosInternos, selectedSectorDeriv, pedidoEstadoFilter]);

    const handleExportSectorExcel = () => {
        try {
            const rows = sectorArticulos.map(a => ({
                'Período Telar': `${effectiveDesde} a ${effectiveHasta}`,
                'Sector': selectedSectorDeriv === 'TODOS' ? 'TODOS LOS SECTORES' : selectedSectorDeriv,
                'Artículo': a.articulo,
                'Cant. Pedidos': a.pedidos_count,
                'Unidades Pedidas': a.unidades_pedidas,
                'Traspasos Recibidos': a.traspasos_count,
                'Unidades Derivadas': a.unidades_derivadas,
                'Importe Derivado ($)': a.importe_derivado,
            }));
            const ws = XLSX.utils.json_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Derivaciones Sector');
            const safeName = (selectedSectorDeriv || 'TODOS').replace(/[^a-zA-Z0-9_-]/g, '_');
            XLSX.writeFile(wb, `Derivaciones_${safeName}_${effectiveDesde}_a_${effectiveHasta}.xlsx`);
            addToast?.(`Excel exportado (${rows.length} artículos)`, 'success');
        } catch (err) {
            addToast?.('Error al exportar Excel del sector', 'error');
        }
    };

    // ─── FILTRO DE ALCANCE (CLÍNICOS/FARMACIA VS TODOS) ───
    const scopedMensual = useMemo(() => {
        return mensualRows.filter(r => {
            if (soloClinicos && r.grupo_almacen === 'SOPORTE') return false;
            if (filterAlmacen !== 'TODOS' && r.almacen !== filterAlmacen) return false;
            return true;
        });
    }, [mensualRows, soloClinicos, filterAlmacen]);

    const scopedStock = useMemo(() => {
        return stockRows.filter(r => {
            if (soloClinicos && r.grupo_almacen === 'SOPORTE') return false;
            if (filterAlmacen !== 'TODOS' && r.almacen !== filterAlmacen) return false;
            return true;
        });
    }, [stockRows, soloClinicos, filterAlmacen]);

    const almacenesUnicos = useMemo(() => {
        const set = new Set();
        mensualRows.forEach(r => {
            if (!soloClinicos || r.grupo_almacen !== 'SOPORTE') set.add(r.almacen);
        });
        return Array.from(set).sort();
    }, [mensualRows, soloClinicos]);

    // ─── KPIs DEL PERÍODO TELAR ───
    const kpis = useMemo(() => {
        const enPeriodo = scopedMensual.filter(r => r.ym >= desdeYM && r.ym <= hastaYM);
        let comprasImp = 0, comprasRem = 0, consumoImp = 0, consumoUnid = 0, traspImp = 0, regPos = 0, regNeg = 0, regNetoImp = 0;
        for (const r of enPeriodo) {
            comprasImp += Number(r.compras_importe || 0);
            comprasRem += Number(r.compras_remitos || 0);
            consumoImp += Number(r.consumo_importe || 0);
            consumoUnid += Number(r.consumo_unidades || 0);
            traspImp += Number(r.traspasos_importe || 0);
            regPos += Number(r.reg_positivas || 0);
            regNeg += Number(r.reg_negativas || 0);
            regNetoImp += Number(r.reg_importe_neto || 0);
        }

        let valorStock = 0, quiebres = 0, criticos = 0, reponer = 0, sobrestock = 0, vencidosTotal = 0;
        let sumCob = 0, cntCob = 0;
        const skusConStock = new Set();
        for (const s of scopedStock) {
            valorStock += Number(s.valor_stock || 0);
            if (s.stock_actual > 0) skusConStock.add(s.id_articulo);
            if (s.estado_stock === 'QUIEBRE') quiebres++;
            else if (s.estado_stock === 'CRITICO') criticos++;
            else if (s.estado_stock === 'REPONER') reponer++;
            else if (s.estado_stock === 'SOBRESTOCK') sobrestock++;
            vencidosTotal += Number(s.lotes_vencidos || 0);
            if (s.dias_cobertura !== null && s.dias_cobertura > 0 && s.dias_cobertura < 365) {
                sumCob += Number(s.dias_cobertura);
                cntCob++;
            }
        }

        const ratioCC = consumoImp > 0 ? (comprasImp / consumoImp) : null;
        return {
            comprasImp,
            comprasRem,
            consumoImp,
            consumoUnid,
            traspImp,
            regPos,
            regNeg,
            regNetoImp,
            valorStock,
            skusConStock: skusConStock.size,
            quiebres,
            criticos,
            reponer,
            sobrestock,
            vencidosTotal,
            coberturaProm: cntCob > 0 ? Math.round(sumCob / cntCob) : null,
            ratioCC,
            proveedoresActivos: proveedoresRows.length,
        };
    }, [scopedMensual, scopedStock, desdeYM, hastaYM, proveedoresRows]);

    // Sincronizar contexto para Beto IA
    useEffect(() => {
        if (typeof window !== 'undefined') {
            window.__ccs_active_context = {
                sectorId: 'COMPRAS_STOCK',
                periodo: `${effectiveDesde} a ${effectiveHasta}`,
                alcance: soloClinicos ? 'Clínicos y Farmacia' : 'Todos los Almacenes',
                comprasImporteARS: Math.round(kpis.comprasImp),
                consumoImporteARS: Math.round(kpis.consumoImp),
                stockValorizadoARS: Math.round(kpis.valorStock),
                quiebresStock: kpis.quiebres,
                criticosMenor7Dias: kpis.criticos,
            };
        }
    }, [effectiveDesde, effectiveHasta, soloClinicos, kpis]);

    // ─── SERIE MENSUAL 2024-2026 COMPRAS VS CONSUMO ───
    const serieMensual = useMemo(() => {
        const byYM = new Map();
        for (const r of scopedMensual) {
            let b = byYM.get(r.ym);
            if (!b) {
                b = {
                    ym: r.ym,
                    label: `${MESES_CORTO[r.mes - 1]} ${String(r.anio).slice(2)}`,
                    compras: 0,
                    consumo: 0,
                    traspasos: 0,
                    regNeto: 0,
                };
                byYM.set(r.ym, b);
            }
            b.compras += Number(r.compras_importe || 0);
            b.consumo += Number(r.consumo_importe || 0);
            b.traspasos += Number(r.traspasos_importe || 0);
            b.regNeto += Number(r.reg_importe_neto || 0);
        }
        return Array.from(byYM.values())
            .sort((a, b) => a.ym - b.ym)
            .map(x => ({
                ...x,
                comprasM: Math.round(x.compras / 1e5) / 10, // en millones ARS (1 decimal)
                consumoM: Math.round(x.consumo / 1e5) / 10,
            }));
    }, [scopedMensual]);

    // ─── RANKING POR ALMACÉN (PERÍODO TELAR) ───
    const rankingAlmacenes = useMemo(() => {
        const byAlm = new Map();
        for (const r of scopedMensual) {
            if (r.ym < desdeYM || r.ym > hastaYM) continue;
            let b = byAlm.get(r.almacen);
            if (!b) {
                b = {
                    almacen: r.almacen,
                    grupo: r.grupo_almacen,
                    comprasImp: 0,
                    consumoImp: 0,
                    consumoUnid: 0,
                    traspImp: 0,
                    regPos: 0,
                    regNeg: 0,
                    regNetoImp: 0,
                    valorStock: 0,
                    quiebres: 0,
                };
                byAlm.set(r.almacen, b);
            }
            b.comprasImp += Number(r.compras_importe || 0);
            b.consumoImp += Number(r.consumo_importe || 0);
            b.consumoUnid += Number(r.consumo_unidades || 0);
            b.traspImp += Number(r.traspasos_importe || 0);
            b.regPos += Number(r.reg_positivas || 0);
            b.regNeg += Number(r.reg_negativas || 0);
            b.regNetoImp += Number(r.reg_importe_neto || 0);
        }
        for (const s of scopedStock) {
            let b = byAlm.get(s.almacen);
            if (!b) {
                b = { almacen: s.almacen, grupo: s.grupo_almacen, comprasImp: 0, consumoImp: 0, consumoUnid: 0, traspImp: 0, regPos: 0, regNeg: 0, regNetoImp: 0, valorStock: 0, quiebres: 0 };
                byAlm.set(s.almacen, b);
            }
            b.valorStock += Number(s.valor_stock || 0);
            if (s.estado_stock === 'QUIEBRE' || s.estado_stock === 'CRITICO') b.quiebres++;
        }
        return Array.from(byAlm.values()).sort((a, b) => b.consumoImp - a.consumoImp);
    }, [scopedMensual, scopedStock, desdeYM, hastaYM]);

    // ─── TABLA FILTRADA DE STOCK Y REPOSICIÓN ───
    const stockFiltrado = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        return scopedStock.filter(s => {
            if (filterEstadoStock !== 'TODOS' && s.estado_stock !== filterEstadoStock) return false;
            if (q) {
                const hay = `${s.articulo} ${s.codigo || ''} ${s.almacen}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [scopedStock, filterEstadoStock, searchTerm]);

    // ─── EXPORTAR EXCEL (REPOSICIÓN O INVENTARIO COMPLETO) ───
    const handleExportExcel = (onlyReponer = false) => {
        try {
            const source = onlyReponer
                ? scopedStock.filter(s => s.sugerencia_compra > 0 || s.estado_stock === 'QUIEBRE' || s.estado_stock === 'CRITICO')
                : stockFiltrado;
            const rows = source.map(s => ({
                'Código': s.codigo || '',
                'Artículo': s.articulo,
                'Almacén': s.almacen,
                'Grupo': s.grupo_almacen,
                'Estado': ESTADO_META[s.estado_stock]?.label || s.estado_stock,
                'Stock Actual': s.stock_actual,
                'Entradas 30d': s.entradas_30d ?? 0,
                'Salidas 30d': s.salidas_30d ?? s.consumo_30d ?? 0,
                'Entradas 90d': s.entradas_90d ?? 0,
                'Salidas 90d': s.salidas_90d ?? s.consumo_90d ?? 0,
                'Consumo Pacientes 30d (VES/VEA)': s.consumo_30d ?? 0,
                'Días Cobertura': s.dias_cobertura ?? 'Sin salidas',
                'Stock Mínimo': s.stock_minimo,
                'Sugerencia Compra': s.sugerencia_compra,
                'Último Precio Compra ($)': s.ultimo_precio_compra,
                'Valor Stock ($)': s.valor_stock,
                'Lotes Vencidos': s.lotes_vencidos,
            }));
            const ws = XLSX.utils.json_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, onlyReponer ? 'Sugerencia Reposicion' : 'Stock y Cobertura');
            XLSX.writeFile(wb, `${onlyReponer ? 'Sugerencia_Compras' : 'Stock_Consumo'}_${effectiveDesde}_a_${effectiveHasta}.xlsx`);
            addToast?.(`Excel exportado (${rows.length} artículos)`, 'success');
        } catch (err) {
            addToast?.('Error exportando Excel', 'error');
        }
    };

    const telarLabelMes = `${MESES_CORTO[(desdeYM % 100) - 1]} ${String(Math.floor(desdeYM / 100)).slice(2)}`;
    const totalProveedoresImp = useMemo(() => proveedoresRows.reduce((acc, p) => acc + Number(p.importe_total || 0), 0), [proveedoresRows]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontFamily: 'Inter, system-ui, sans-serif' }}>
            {/* ═══ HEADER INSTITUCIONAL CALIDAD-QOAG ═══ */}
            <div style={{
                background: 'linear-gradient(135deg, #003B73 0%, #0369A1 60%, #0284C7 100%)',
                borderRadius: '14px',
                padding: '20px 24px',
                color: '#FFFFFF',
                boxShadow: '0 6px 20px -4px rgba(0, 59, 115, 0.25)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                            <span style={{
                                background: 'rgba(255,255,255,0.16)',
                                border: '1px solid rgba(255,255,255,0.28)',
                                borderRadius: '999px',
                                padding: '3px 10px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                            }}>
                                <Calendar size={12} /> Período Telar: {effectiveDesde} al {effectiveHasta}
                            </span>
                            <span style={{
                                background: soloClinicos ? 'rgba(16,185,129,0.22)' : 'rgba(255,255,255,0.16)',
                                border: '1px solid rgba(255,255,255,0.28)',
                                borderRadius: '999px',
                                padding: '3px 10px',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                            }}>
                                {soloClinicos ? '🏥 Clínicos & Farmacia' : '🏢 Todos los Almacenes'}
                            </span>
                        </div>
                        <h2 style={{ margin: 0, fontSize: '1.42rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
                            TABLERO INTEGRADO · COMPRAS – CONSUMO – STOCK
                        </h2>
                        <div style={{ fontSize: '0.79rem', opacity: 0.88, marginTop: '2px' }}>
                            Gobernanza Logística & Farmacia (SALUS · FC_AlbaranesC, FM_Movimientos, FM_Stocks & Lotes · 2024–2026)
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {/* Conmutador Clínicos vs Todos */}
                        <div style={{ display: 'inline-flex', background: 'rgba(0,0,0,0.22)', padding: '3px', borderRadius: '8px', gap: '2px' }}>
                            <button
                                type="button"
                                onClick={() => { setSoloClinicos(true); setFilterAlmacen('TODOS'); }}
                                style={{
                                    padding: '5px 10px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: soloClinicos ? '#FFFFFF' : 'transparent',
                                    color: soloClinicos ? '#003B73' : '#E2E8F0',
                                    fontSize: '0.72rem',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                }}
                            >
                                Clínicos / Farmacia
                            </button>
                            <button
                                type="button"
                                onClick={() => { setSoloClinicos(false); setFilterAlmacen('TODOS'); }}
                                style={{
                                    padding: '5px 10px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: !soloClinicos ? '#FFFFFF' : 'transparent',
                                    color: !soloClinicos ? '#003B73' : '#E2E8F0',
                                    fontSize: '0.72rem',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                }}
                            >
                                Todos (58+)
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => handleExportExcel(true)}
                            style={{
                                background: '#10B981',
                                border: 'none',
                                color: '#FFFFFF',
                                borderRadius: '8px',
                                padding: '7px 12px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                            }}
                        >
                            <Download size={14} /> Excel Reposición
                        </button>
                        <button
                            type="button"
                            onClick={loadAllData}
                            style={{
                                background: 'rgba(255,255,255,0.14)',
                                border: '1px solid rgba(255,255,255,0.28)',
                                color: '#FFFFFF',
                                borderRadius: '8px',
                                padding: '7px 10px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                            }}
                            title="Refrescar"
                        >
                            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                {/* 4 KPI CARDS */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
                    <div style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '10px', padding: '14px 16px' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', opacity: 0.85 }}>Compras (Período Telar)</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums', marginTop: '2px' }}>
                            {loading ? '...' : fmtARS(kpis.comprasImp, true)}
                        </div>
                        <div style={{ fontSize: '0.72rem', opacity: 0.88, marginTop: '2px' }}>
                            {fmtNum(kpis.comprasRem)} remitos · {fmtNum(kpis.proveedoresActivos)} proveedores
                        </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '10px', padding: '14px 16px' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', opacity: 0.85 }}>Consumo Valorizado (VES+VEA)</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums', marginTop: '2px', color: '#BAE6FD' }}>
                            {loading ? '...' : fmtARS(kpis.consumoImp, true)}
                        </div>
                        <div style={{ fontSize: '0.72rem', opacity: 0.88, marginTop: '2px' }}>
                            {fmtNum(kpis.consumoUnid)} unid. · Ratio C/Cons: {kpis.ratioCC ? `${kpis.ratioCC.toFixed(2)}x` : '—'}
                        </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '10px', padding: '14px 16px' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', opacity: 0.85 }}>Stock Valorizado Actual</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums', marginTop: '2px', color: '#A7F3D0' }}>
                            {loading ? '...' : fmtARS(kpis.valorStock, true)}
                        </div>
                        <div style={{ fontSize: '0.72rem', opacity: 0.88, marginTop: '2px' }}>
                            {fmtNum(kpis.skusConStock)} SKUs activos · Cobertura prom: {kpis.coberturaProm ?? '—'} días
                        </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '10px', padding: '14px 16px' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', opacity: 0.85 }}>Alertas Abastecimiento</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums', marginTop: '2px', color: '#FDE68A' }}>
                            {loading ? '...' : fmtNum(kpis.quiebres + kpis.criticos)}
                        </div>
                        <div style={{ fontSize: '0.72rem', opacity: 0.88, marginTop: '2px' }}>
                            🔴 {fmtNum(kpis.quiebres)} quiebres · 🟠 {fmtNum(kpis.criticos)} &lt;7d · 🟡 {fmtNum(kpis.reponer)} reponer
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ NAVEGACIÓN + FILTRO DE ALMACÉN ═══ */}
            <div style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '10px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px',
            }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {TABS.map(t => {
                        const Icon = t.icon;
                        const active = activeTab === t.id;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setActiveTab(t.id)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '7px 12px',
                                    borderRadius: '8px',
                                    border: active ? '1px solid #0284C7' : '1px solid #E2E8F0',
                                    background: active ? '#003B73' : '#F8FAFC',
                                    color: active ? '#FFFFFF' : '#475569',
                                    fontSize: '0.77rem',
                                    fontWeight: active ? 700 : 600,
                                    cursor: 'pointer',
                                }}
                            >
                                <Icon size={14} /> {t.label}
                            </button>
                        );
                    })}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Filter size={13} color="#64748B" />
                    <select
                        value={filterAlmacen}
                        onChange={e => setFilterAlmacen(e.target.value)}
                        style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #CBD5E1', fontSize: '0.76rem', maxWidth: '260px' }}
                    >
                        <option value="TODOS">Almacén: Todos ({almacenesUnicos.length})</option>
                        {almacenesUnicos.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                </div>
            </div>

            {/* ═══ 1. RESUMEN INTEGRADO ═══ */}
            {activeTab === 'resumen' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Evolución Mensual Compras vs Consumo */}
                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px 18px', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <div>
                                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#003B73' }}>
                                    Evolución Mensual: Compras vs. Consumo Valorizado (2024–2026)
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                    Expresado en Millones de $ ARS (valorizado al último precio de compra real de SALUS)
                                </div>
                            </div>
                        </div>
                        <div style={{ width: '100%', height: 300 }}>
                            <ResponsiveContainer>
                                <ComposedChart data={serieMensual} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} />
                                    <YAxis tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={v => `$${v}M`} width={58} />
                                    <Tooltip
                                        formatter={(val, name) => [`$${fmtNum(val, 1)}M`, name]}
                                        contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '0.78rem' }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '0.76rem' }} />
                                    <ReferenceLine x={telarLabelMes} stroke="#0284C7" strokeDasharray="4 4" strokeWidth={1.5} />
                                    <Bar dataKey="comprasM" name="Compras ($M)" fill="#003B73" radius={[4, 4, 0, 0]} maxBarSize={24} />
                                    <Line type="monotone" dataKey="consumoM" name="Consumo ($M)" stroke="#059669" strokeWidth={2.5} dot={{ r: 3 }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Matriz Rápida por Almacén */}
                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                        <div style={{ padding: '12px 16px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#003B73' }}>
                                Balance Integrado por Almacén / Servicio ({effectiveDesde} al {effectiveHasta})
                            </span>
                            <span style={{ fontSize: '0.72rem', color: '#64748B' }}>Top 15 almacenes por consumo valorizado</span>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem', fontVariantNumeric: 'tabular-nums' }}>
                                <thead>
                                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Almacén / Servicio</th>
                                        <th style={{ padding: '8px 8px', textAlign: 'center' }}>Grupo</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Compras ($)</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Traspasos Recib. ($)</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Consumo ($)</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Stock Actual ($)</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Alertas Críticas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rankingAlmacenes.slice(0, 15).map((a, idx) => (
                                        <tr key={a.almacen} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 ? '#F8FAFC' : '#FFFFFF' }}>
                                            <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0F172A' }}>{a.almacen}</td>
                                            <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                                                <span style={{
                                                    fontSize: '0.66rem', fontWeight: 700, padding: '2px 7px', borderRadius: '999px',
                                                    background: a.grupo === 'CENTRAL' ? '#EFF6FF' : a.grupo === 'CLINICO' ? '#ECFDF5' : '#F1F5F9',
                                                    color: a.grupo === 'CENTRAL' ? '#1D4ED8' : a.grupo === 'CLINICO' ? '#047857' : '#475569',
                                                }}>{a.grupo}</span>
                                            </td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#003B73', fontWeight: 700 }}>{fmtARS(a.comprasImp)}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#64748B' }}>{fmtARS(a.traspImp)}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#059669', fontWeight: 700 }}>{fmtARS(a.consumoImp)}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#0F172A', fontWeight: 700 }}>{fmtARS(a.valorStock)}</td>
                                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                                {a.quiebres > 0 ? (
                                                    <span style={{ background: '#FEE2E2', color: '#B91C1C', padding: '2px 8px', borderRadius: '999px', fontWeight: 800, fontSize: '0.7rem' }}>
                                                        {a.quiebres} críticos
                                                    </span>
                                                ) : <span style={{ color: '#94A3B8' }}>0</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ 1B. DERIVACIONES Y PEDIDOS POR SECTOR (TODOS LOS SECTORES, EJ. CONTACT CENTER) ═══ */}
            {activeTab === 'sectores' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Barra de control rápida: Buscador de sector + resumen global */}
                    <div style={{
                        background: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: '12px',
                        padding: '12px 16px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px',
                    }}>
                        <div>
                            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#003B73' }}>
                                Derivaciones (Traspasos) y Pedidos Internos por Sector — {effectiveDesde} al {effectiveHasta}
                            </div>
                            <div style={{ fontSize: '0.73rem', color: '#64748B' }}>
                                Incluye <strong>todos los sectores</strong> (Clínicos, Contact Center, Administración, Recepción, Mantenimiento, Ropería, Cocina, etc.). Hacé clic en cualquier sector para auditar sus artículos y pedidos.
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <div style={{ position: 'relative' }}>
                                <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    type="text"
                                    value={sectorSearch}
                                    onChange={e => setSectorSearch(e.target.value)}
                                    placeholder="Buscar sector (ej. Contact, UCI)..."
                                    style={{ padding: '6px 10px 6px 28px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.76rem', width: '230px' }}
                                />
                            </div>
                            {selectedSectorDeriv !== 'TODOS' && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedSectorDeriv('TODOS')}
                                    style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #0284C7', background: '#F0F9FF', color: '#003B73', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
                                >
                                    Ver Todos los Sectores
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleExportSectorExcel}
                                style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: '#059669', color: '#FFFFFF', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                            >
                                <Download size={13} /> Excel ({selectedSectorDeriv === 'TODOS' ? 'Todos' : selectedSectorDeriv})
                            </button>
                        </div>
                    </div>

                    {/* Grilla 2 columnas: Ranking de Sectores (izq) | Detalle de Artículos Derivados al Sector Seleccionado (der) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(420px, 1.15fr) minmax(420px, 1fr)', gap: '16px', alignItems: 'start' }}>
                        {/* Tabla de todos los sectores */}
                        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                            <div style={{ padding: '11px 14px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#003B73' }}>
                                    Artículos Derivados y Pedidos por Sector ({resumenSectoresPeriodo.length} sectores)
                                </span>
                                <span style={{ fontSize: '0.7rem', color: '#64748B' }}>Clic en una fila para filtrar</span>
                            </div>
                            <div style={{ maxHeight: '520px', overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.73rem', fontVariantNumeric: 'tabular-nums' }}>
                                    <thead style={{ position: 'sticky', top: 0, background: '#F1F5F9', zIndex: 2 }}>
                                        <tr style={{ borderBottom: '1px solid #CBD5E1', color: '#475569' }}>
                                            <th style={{ padding: '7px 10px', textAlign: 'left' }}>Sector</th>
                                            <th style={{ padding: '7px 6px', textAlign: 'right' }}>Pedidos</th>
                                            <th style={{ padding: '7px 6px', textAlign: 'right' }}>Pend.</th>
                                            <th style={{ padding: '7px 6px', textAlign: 'right' }}>Unid. Pedidas</th>
                                            <th style={{ padding: '7px 6px', textAlign: 'right' }}>Unid. Derivadas</th>
                                            <th style={{ padding: '7px 8px', textAlign: 'right' }}>Importe ($)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {resumenSectoresPeriodo.map((s, idx) => {
                                            const isSelected = selectedSectorDeriv === s.sector;
                                            return (
                                                <tr
                                                    key={s.sector}
                                                    onClick={() => setSelectedSectorDeriv(isSelected ? 'TODOS' : s.sector)}
                                                    style={{
                                                        borderBottom: '1px solid #F1F5F9',
                                                        background: isSelected ? '#DBEAFE' : (idx % 2 ? '#F8FAFC' : '#FFFFFF'),
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    <td style={{ padding: '7px 10px', fontWeight: 700, color: isSelected ? '#003B73' : '#0F172A' }}>
                                                        <div>{s.sector}</div>
                                                        <div style={{ fontSize: '0.64rem', color: '#64748B', fontWeight: 600 }}>
                                                            {s.grupo} · {fmtNum(s.traspasosRecibidos)} entregas{s.leadTimeProm !== null ? ` · ${s.leadTimeProm}h` : ''}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 700, color: '#334155' }}>{fmtNum(s.pedidosCount)}</td>
                                                    <td style={{ padding: '7px 6px', textAlign: 'right' }}>
                                                        {s.pedidosPendientes > 0 ? (
                                                            <span style={{ background: '#FEF3C7', color: '#B45309', padding: '1px 6px', borderRadius: '999px', fontWeight: 800, fontSize: '0.68rem' }}>
                                                                {s.pedidosPendientes}
                                                            </span>
                                                        ) : <span style={{ color: '#CBD5E1' }}>0</span>}
                                                    </td>
                                                    <td style={{ padding: '7px 6px', textAlign: 'right', color: '#64748B' }}>{fmtNum(s.unidadesPedidas)}</td>
                                                    <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 800, color: '#0284C7' }}>{fmtNum(s.unidadesDerivadas)}</td>
                                                    <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: '#003B73' }}>{fmtARS(s.importeDerivado)}</td>
                                                </tr>
                                            );
                                        })}
                                        {resumenSectoresPeriodo.length === 0 && (
                                            <tr>
                                                <td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#94A3B8' }}>
                                                    Sin derivaciones ni pedidos registrados para este período / búsqueda.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Detalle de artículos derivados al sector seleccionado */}
                        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                            <div style={{ padding: '11px 14px', background: '#EFF6FF', borderBottom: '1px solid #BFDBFE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#003B73' }}>
                                    Artículos Derivados → {selectedSectorDeriv === 'TODOS' ? 'Todos los Sectores (Top 200)' : selectedSectorDeriv}
                                </span>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0284C7' }}>
                                    {loadingSectorArt ? 'Cargando...' : `${fmtNum(sectorArticulos.length)} artículos`}
                                </span>
                            </div>
                            <div style={{ maxHeight: '520px', overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.73rem', fontVariantNumeric: 'tabular-nums' }}>
                                    <thead style={{ position: 'sticky', top: 0, background: '#F1F5F9', zIndex: 2 }}>
                                        <tr style={{ borderBottom: '1px solid #CBD5E1', color: '#475569' }}>
                                            <th style={{ padding: '7px 10px', textAlign: 'left' }}>Artículo</th>
                                            <th style={{ padding: '7px 6px', textAlign: 'right' }}>Pedida</th>
                                            <th style={{ padding: '7px 6px', textAlign: 'right' }}>Derivada</th>
                                            <th style={{ padding: '7px 10px', textAlign: 'right' }}>Importe ($)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sectorArticulos.map((a, idx) => (
                                            <tr key={a.id_articulo} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 ? '#F8FAFC' : '#FFFFFF' }}>
                                                <td style={{ padding: '7px 10px', fontWeight: 600, color: '#0F172A' }}>{a.articulo}</td>
                                                <td style={{ padding: '7px 6px', textAlign: 'right', color: '#64748B' }}>
                                                    {fmtNum(a.unidades_pedidas)}
                                                    {Number(a.unidades_pedidas) > 0 && Number(a.unidades_derivadas) >= Number(a.unidades_pedidas) * 5 && (
                                                        <span title="El sector solicita en bultos/cajas y Depósito entrega en unidades sueltas" style={{ display: 'block', fontSize: '0.6rem', color: '#B45309', fontWeight: 700 }}>
                                                            (bulto→unid)
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 800, color: '#0284C7' }}>{fmtNum(a.unidades_derivadas)}</td>
                                                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#003B73' }}>{fmtARS(a.importe_derivado)}</td>
                                            </tr>
                                        ))}
                                        {!loadingSectorArt && sectorArticulos.length === 0 && (
                                            <tr>
                                                <td colSpan={4} style={{ padding: '20px', textAlign: 'center', color: '#94A3B8' }}>
                                                    No hay artículos derivados en el período seleccionado.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* Monitor de Pedidos Internos Individuales (FM_PeticionesTraspaso) */}
                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                        <div style={{
                            padding: '12px 16px',
                            background: '#F8FAFC',
                            borderBottom: '1px solid #E2E8F0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '10px',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <ClipboardList size={16} color="#003B73" />
                                <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#003B73' }}>
                                    Pedidos Realizados por {selectedSectorDeriv === 'TODOS' ? 'Todos los Sectores' : selectedSectorDeriv} ({fmtNum(pedidosFiltrados.length)})
                                </span>
                            </div>
                            <div style={{ display: 'inline-flex', background: '#E2E8F0', padding: '3px', borderRadius: '8px', gap: '3px' }}>
                                {[
                                    { id: 'TODOS', label: 'Todos' },
                                    { id: 'PENDIENTE', label: 'Pendientes' },
                                    { id: 'SERVIDO', label: 'Servidos' },
                                ].map(st => (
                                    <button
                                        key={st.id}
                                        type="button"
                                        onClick={() => setPedidoEstadoFilter(st.id)}
                                        style={{
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            border: 'none',
                                            background: pedidoEstadoFilter === st.id ? '#FFFFFF' : 'transparent',
                                            color: pedidoEstadoFilter === st.id ? '#003B73' : '#475569',
                                            fontWeight: 700,
                                            fontSize: '0.73rem',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {st.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div style={{ maxHeight: '460px', overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem', fontVariantNumeric: 'tabular-nums' }}>
                                <thead style={{ position: 'sticky', top: 0, background: '#F1F5F9', zIndex: 2 }}>
                                    <tr style={{ borderBottom: '1px solid #CBD5E1', color: '#475569' }}>
                                        <th style={{ padding: '7px 10px', textAlign: 'left', width: '74px' }}># Pedido</th>
                                        <th style={{ padding: '7px 8px', textAlign: 'left' }}>Fecha Pedido</th>
                                        <th style={{ padding: '7px 8px', textAlign: 'left' }}>Sector Solicitante</th>
                                        <th style={{ padding: '7px 8px', textAlign: 'left' }}>Solicitado a</th>
                                        <th style={{ padding: '7px 8px', textAlign: 'center' }}>Estado</th>
                                        <th style={{ padding: '7px 8px', textAlign: 'right' }}>Ítems</th>
                                        <th style={{ padding: '7px 8px', textAlign: 'right' }}>Unid. Pedidas</th>
                                        <th style={{ padding: '7px 10px', textAlign: 'right' }}>Unid. Entregadas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pedidosFiltrados.slice(0, 150).map((p, idx) => {
                                        const isOpen = expandedPedidoId === p.id_peticion;
                                        const items = Array.isArray(p.detalle_articulos) ? p.detalle_articulos : [];
                                        return (
                                            <React.Fragment key={p.id_peticion}>
                                                <tr
                                                    onClick={() => setExpandedPedidoId(isOpen ? null : p.id_peticion)}
                                                    style={{ borderBottom: '1px solid #F1F5F9', background: isOpen ? '#EFF6FF' : (idx % 2 ? '#F8FAFC' : '#FFFFFF'), cursor: 'pointer' }}
                                                >
                                                    <td style={{ padding: '7px 10px', fontWeight: 800, color: '#003B73', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />} #{p.id_peticion}
                                                    </td>
                                                    <td style={{ padding: '7px 8px', color: '#475569' }}>
                                                        {new Date(p.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
                                                    </td>
                                                    <td style={{ padding: '7px 8px', fontWeight: 700, color: '#0F172A' }}>{p.sector}</td>
                                                    <td style={{ padding: '7px 8px', color: '#475569' }}>{p.almacen_origen}</td>
                                                    <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                                                        <span style={{
                                                            fontSize: '0.67rem', fontWeight: 800, padding: '2px 7px', borderRadius: '999px',
                                                            background: p.estado === 'PENDIENTE' ? '#FEF3C7' : '#ECFDF5',
                                                            color: p.estado === 'PENDIENTE' ? '#B45309' : '#047857',
                                                        }}>
                                                            {p.estado}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700 }}>{fmtNum(p.items_count)}</td>
                                                    <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: '#334155' }}>{fmtNum(p.unidades_pedidas)}</td>
                                                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: '#0284C7' }}>{fmtNum(p.unidades_entregadas)}</td>
                                                </tr>
                                                {isOpen && (
                                                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #CBD5E1' }}>
                                                        <td colSpan={8} style={{ padding: '10px 18px' }}>
                                                            {p.observaciones && (
                                                                <div style={{ fontSize: '0.72rem', color: '#475569', marginBottom: '6px' }}>
                                                                    <strong>Observaciones:</strong> {p.observaciones}
                                                                </div>
                                                            )}
                                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '6px' }}>
                                                                {items.map((it, iIdx) => (
                                                                    <div key={`${p.id_peticion}-${iIdx}`} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '5px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.71rem' }}>
                                                                        <span style={{ fontWeight: 600, color: '#1E293B', marginRight: '8px' }}>{it.articulo}</span>
                                                                        <span style={{ whiteSpace: 'nowrap', color: '#0284C7', fontWeight: 800 }}>
                                                                            Ped: {fmtNum(it.pedida)} · Ent: {fmtNum(it.entregada)}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                    {pedidosFiltrados.length === 0 && (
                                        <tr>
                                            <td colSpan={8} style={{ padding: '20px', textAlign: 'center', color: '#94A3B8' }}>
                                                No se registran pedidos internos para este sector en el período del Telar.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ 2. COMPRAS Y PROVEEDORES (RANKING + CURVA ABC + INFLACIÓN) ═══ */}
            {activeTab === 'compras' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(420px, 1.4fr)', gap: '16px', alignItems: 'start' }}>
                    {/* Ranking Proveedores */}
                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                        <div style={{ padding: '12px 14px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#003B73' }}>Ranking de Proveedores (Período Telar)</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0284C7' }}>{fmtARS(totalProveedoresImp, true)}</span>
                        </div>
                        <div style={{ maxHeight: '580px', overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem', fontVariantNumeric: 'tabular-nums' }}>
                                <thead style={{ position: 'sticky', top: 0, background: '#F1F5F9' }}>
                                    <tr style={{ borderBottom: '1px solid #CBD5E1', color: '#475569' }}>
                                        <th style={{ padding: '7px 10px', textAlign: 'left' }}>Proveedor</th>
                                        <th style={{ padding: '7px 6px', textAlign: 'right' }}>Rem.</th>
                                        <th style={{ padding: '7px 6px', textAlign: 'right' }}>%</th>
                                        <th style={{ padding: '7px 10px', textAlign: 'right' }}>Importe ($)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {proveedoresRows.map((p, idx) => {
                                        const pct = totalProveedoresImp > 0 ? (Number(p.importe_total) / totalProveedoresImp) * 100 : 0;
                                        return (
                                            <tr key={p.id_proveedor} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 ? '#F8FAFC' : '#FFFFFF' }}>
                                                <td style={{ padding: '7px 10px', fontWeight: 700, color: '#0F172A' }}>{p.proveedor}</td>
                                                <td style={{ padding: '7px 6px', textAlign: 'right', color: '#64748B' }}>{fmtNum(p.remitos)}</td>
                                                <td style={{ padding: '7px 6px', textAlign: 'right', color: '#64748B' }}>{fmtNum(pct, 1)}%</td>
                                                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: '#003B73' }}>{fmtARS(p.importe_total)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Curva ABC + Monitor de Inflación / Variación de Precios */}
                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                        <div style={{ padding: '12px 14px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#003B73' }}>Curva ABC de Compras & Monitor de Precios</span>
                            <span style={{ fontSize: '0.72rem', color: '#64748B' }}>Top 150 artículos por gasto</span>
                        </div>
                        <div style={{ maxHeight: '580px', overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.73rem', fontVariantNumeric: 'tabular-nums' }}>
                                <thead style={{ position: 'sticky', top: 0, background: '#F1F5F9' }}>
                                    <tr style={{ borderBottom: '1px solid #CBD5E1', color: '#475569' }}>
                                        <th style={{ padding: '7px 10px', textAlign: 'left' }}>Artículo</th>
                                        <th style={{ padding: '7px 6px', textAlign: 'right' }}>Cant.</th>
                                        <th style={{ padding: '7px 6px', textAlign: 'right' }}>Precio Prom.</th>
                                        <th style={{ padding: '7px 6px', textAlign: 'right' }}>Var. vs Mín Hist.</th>
                                        <th style={{ padding: '7px 10px', textAlign: 'right' }}>Gasto Total ($)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {articulosComprasRows.map((a, idx) => {
                                        const varPct = Number(a.variacion_pct || 0);
                                        return (
                                            <tr key={a.id_articulo} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 ? '#F8FAFC' : '#FFFFFF' }}>
                                                <td style={{ padding: '7px 10px', fontWeight: 600, color: '#0F172A' }}>{a.articulo}</td>
                                                <td style={{ padding: '7px 6px', textAlign: 'right', color: '#475569' }}>{fmtNum(a.cantidad)}</td>
                                                <td style={{ padding: '7px 6px', textAlign: 'right', color: '#334155', fontWeight: 600 }}>{fmtARS(a.precio_prom_periodo)}</td>
                                                <td style={{ padding: '7px 6px', textAlign: 'right' }}>
                                                    <span style={{
                                                        padding: '2px 6px', borderRadius: '5px', fontWeight: 700, fontSize: '0.68rem',
                                                        background: varPct >= 50 ? '#FEE2E2' : varPct >= 20 ? '#FEF3C7' : '#ECFDF5',
                                                        color: varPct >= 50 ? '#B91C1C' : varPct >= 20 ? '#B45309' : '#047857',
                                                    }}>
                                                        +{fmtNum(varPct, 1)}%
                                                    </span>
                                                </td>
                                                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: '#003B73' }}>{fmtARS(a.importe_total)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ 3. CONSUMO POR SERVICIO Y ALMACÉN ═══ */}
            {activeTab === 'consumo' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px 18px' }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#003B73', marginBottom: '10px' }}>
                            Consumo Valorizado por Almacén / Servicio (Período Telar)
                        </div>
                        <div style={{ width: '100%', height: 320 }}>
                            <ResponsiveContainer>
                                <BarChart data={rankingAlmacenes.slice(0, 12)} layout="vertical" margin={{ top: 4, right: 24, left: 10, bottom: 4 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                                    <XAxis type="number" tickFormatter={v => fmtARS(v, true)} tick={{ fontSize: 11, fill: '#64748B' }} />
                                    <YAxis type="category" dataKey="almacen" width={180} tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }} />
                                    <Tooltip formatter={v => [fmtARS(v), 'Consumo']} contentStyle={{ borderRadius: '8px', fontSize: '0.78rem' }} />
                                    <Bar dataKey="consumoImp" fill="#0284C7" radius={[0, 6, 6, 0]} maxBarSize={22} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Top 50 Artículos más consumidos (últimos 30 días) */}
                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                        <div style={{ padding: '12px 16px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '0.86rem', fontWeight: 800, color: '#003B73' }}>
                            Top 50 Artículos de Mayor Consumo Valorizado (Últimos 30 días)
                        </div>
                        <div style={{ maxHeight: '460px', overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums' }}>
                                <thead style={{ position: 'sticky', top: 0, background: '#F1F5F9' }}>
                                    <tr style={{ borderBottom: '1px solid #CBD5E1', color: '#475569' }}>
                                        <th style={{ padding: '7px 10px', textAlign: 'left' }}>Artículo</th>
                                        <th style={{ padding: '7px 8px', textAlign: 'left' }}>Almacén</th>
                                        <th style={{ padding: '7px 8px', textAlign: 'right' }}>Consumo 30d</th>
                                        <th style={{ padding: '7px 8px', textAlign: 'right' }}>Consumo 90d</th>
                                        <th style={{ padding: '7px 8px', textAlign: 'right' }}>Stock Actual</th>
                                        <th style={{ padding: '7px 10px', textAlign: 'right' }}>Consumo 30d ($)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...scopedStock]
                                        .sort((a, b) => (b.consumo_30d * b.ultimo_precio_compra) - (a.consumo_30d * a.ultimo_precio_compra))
                                        .slice(0, 50)
                                        .map((s, idx) => (
                                            <tr key={`${s.id_articulo}-${s.id_almacen}`} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 ? '#F8FAFC' : '#FFFFFF' }}>
                                                <td style={{ padding: '7px 10px', fontWeight: 700, color: '#0F172A' }}>{s.articulo}</td>
                                                <td style={{ padding: '7px 8px', color: '#475569' }}>{s.almacen}</td>
                                                <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700 }}>{fmtNum(s.consumo_30d)}</td>
                                                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#64748B' }}>{fmtNum(s.consumo_90d)}</td>
                                                <td style={{ padding: '7px 8px', textAlign: 'right', color: s.stock_actual <= 0 ? '#B91C1C' : '#0F172A', fontWeight: 700 }}>{fmtNum(s.stock_actual)}</td>
                                                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: '#059669' }}>{fmtARS(s.consumo_30d * s.ultimo_precio_compra)}</td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ 4. STOCK, COBERTURA Y REPOSICIÓN ═══ */}
            {activeTab === 'stock' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Chips de estado */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {[
                                { id: 'TODOS', label: `Todos (${fmtNum(scopedStock.length)})` },
                                ...Object.entries(ESTADO_META).map(([k, m]) => ({
                                    id: k,
                                    label: `${m.label} (${fmtNum(scopedStock.filter(s => s.estado_stock === k).length)})`,
                                    meta: m,
                                })),
                            ].map(chip => {
                                const active = filterEstadoStock === chip.id;
                                return (
                                    <button
                                        key={chip.id}
                                        type="button"
                                        onClick={() => setFilterEstadoStock(chip.id)}
                                        style={{
                                            padding: '6px 11px',
                                            borderRadius: '999px',
                                            border: `1px solid ${active ? '#003B73' : (chip.meta?.border || '#CBD5E1')}`,
                                            background: active ? '#003B73' : (chip.meta?.bg || '#FFFFFF'),
                                            color: active ? '#FFFFFF' : (chip.meta?.color || '#334155'),
                                            fontSize: '0.73rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {chip.label}
                                    </button>
                                );
                            })}
                        </div>

                        <div style={{ position: 'relative' }}>
                            <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)' }} />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder="Buscar artículo, código o almacén..."
                                style={{ padding: '6px 10px 6px 28px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.76rem', width: '240px' }}
                            />
                        </div>
                    </div>

                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                        <div style={{ maxHeight: '580px', overflow: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem', fontVariantNumeric: 'tabular-nums' }}>
                                <thead style={{ position: 'sticky', top: 0, background: '#F1F5F9', zIndex: 2 }}>
                                    <tr style={{ borderBottom: '1px solid #CBD5E1', color: '#334155' }}>
                                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Artículo</th>
                                        <th style={{ padding: '8px 8px', textAlign: 'left' }}>Almacén</th>
                                        <th style={{ padding: '8px 8px', textAlign: 'center' }}>Estado</th>
                                        <th style={{ padding: '8px 8px', textAlign: 'right' }}>Stock Actual</th>
                                        <th style={{ padding: '8px 8px', textAlign: 'right', color: '#047857' }}>Entradas 30d</th>
                                        <th style={{ padding: '8px 8px', textAlign: 'right', color: '#0369A1' }}>Salidas 30d</th>
                                        <th style={{ padding: '8px 8px', textAlign: 'right', color: '#475569' }}>Salidas 90d</th>
                                        <th style={{ padding: '8px 8px', textAlign: 'right' }}>Cobertura</th>
                                        <th style={{ padding: '8px 8px', textAlign: 'right' }}>Sugerencia Compra</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Valor Stock ($)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stockFiltrado.slice(0, 300).map((s, idx) => {
                                        const meta = ESTADO_META[s.estado_stock] || ESTADO_META.OPTIMO;
                                        return (
                                            <tr key={`${s.id_articulo}-${s.id_almacen}`} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 ? '#F8FAFC' : '#FFFFFF' }}>
                                                <td style={{ padding: '7px 10px', fontWeight: 700, color: '#0F172A' }}>{s.articulo}</td>
                                                <td style={{ padding: '7px 8px', color: '#475569' }}>{s.almacen}</td>
                                                <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                                                    <span style={{ fontSize: '0.67rem', fontWeight: 800, padding: '2px 7px', borderRadius: '999px', background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
                                                        {meta.label}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 800, color: s.stock_actual <= 0 ? '#B91C1C' : '#0F172A' }}>{fmtNum(s.stock_actual)}</td>
                                                <td style={{ padding: '7px 8px', textAlign: 'right', color: (s.entradas_30d || 0) > 0 ? '#047857' : '#CBD5E1', fontWeight: (s.entradas_30d || 0) > 0 ? 700 : 400 }}>
                                                    {(s.entradas_30d || 0) > 0 ? `+${fmtNum(s.entradas_30d)}` : '0'}
                                                </td>
                                                <td style={{ padding: '7px 8px', textAlign: 'right', color: (s.salidas_30d || 0) > 0 ? '#0369A1' : '#CBD5E1', fontWeight: (s.salidas_30d || 0) > 0 ? 700 : 400 }}>
                                                    {fmtNum(s.salidas_30d ?? s.consumo_30d ?? 0)}
                                                </td>
                                                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#475569' }}>
                                                    {fmtNum(s.salidas_90d ?? s.consumo_90d ?? 0)}
                                                </td>
                                                <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: meta.color }}>
                                                    {s.dias_cobertura !== null ? `${fmtNum(s.dias_cobertura, 1)} d` : '—'}
                                                </td>
                                                <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 800, color: s.sugerencia_compra > 0 ? '#0284C7' : '#CBD5E1' }}>
                                                    {s.sugerencia_compra > 0 ? `+${fmtNum(s.sugerencia_compra)}` : '—'}
                                                </td>
                                                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#003B73' }}>{fmtARS(s.valor_stock)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ 5. AUDITORÍA (REGULARIZACIONES REG & LOTES VENCIDOS) ═══ */}
            {activeTab === 'auditoria' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: '16px' }}>
                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                        <div style={{ padding: '12px 14px', background: '#FEF2F2', borderBottom: '1px solid #FECACA' }}>
                            <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#991B1B' }}>Regularizaciones y Ajustes de Inventario (REG — Período Telar)</div>
                            <div style={{ fontSize: '0.72rem', color: '#B91C1C' }}>
                                Diferencias entre stock físico y sistema (ajustes positivos vs. mermas/faltantes)
                            </div>
                        </div>
                        <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem', fontVariantNumeric: 'tabular-nums' }}>
                                <thead style={{ background: '#F8FAFC' }}>
                                    <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                                        <th style={{ padding: '7px 10px', textAlign: 'left' }}>Almacén</th>
                                        <th style={{ padding: '7px 8px', textAlign: 'right' }}>Ajustes (+)</th>
                                        <th style={{ padding: '7px 8px', textAlign: 'right' }}>Mermas (-)</th>
                                        <th style={{ padding: '7px 10px', textAlign: 'right' }}>Impacto Neto ($)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rankingAlmacenes
                                        .filter(a => a.regPos > 0 || a.regNeg > 0)
                                        .sort((a, b) => Math.abs(b.regNetoImp) - Math.abs(a.regNetoImp))
                                        .map((a, idx) => (
                                            <tr key={a.almacen} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 ? '#F8FAFC' : '#FFFFFF' }}>
                                                <td style={{ padding: '7px 10px', fontWeight: 700, color: '#0F172A' }}>{a.almacen}</td>
                                                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#059669' }}>+{fmtNum(a.regPos)}</td>
                                                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#DC2626' }}>-{fmtNum(a.regNeg)}</td>
                                                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: a.regNetoImp < 0 ? '#B91C1C' : '#047857' }}>
                                                    {fmtARS(a.regNetoImp)}
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                        <div style={{ padding: '12px 14px', background: '#FFFBEB', borderBottom: '1px solid #FDE68A' }}>
                            <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#92400E' }}>Saneamiento de Lotes con Caducidad Vencida en SALUS</div>
                            <div style={{ fontSize: '0.72rem', color: '#B45309' }}>
                                Total detectado: {fmtNum(kpis.vencidosTotal)} lotes con stock &gt; 0 y fecha vencida para revisión de Farmacia
                            </div>
                        </div>
                        <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem', fontVariantNumeric: 'tabular-nums' }}>
                                <thead style={{ background: '#F8FAFC' }}>
                                    <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                                        <th style={{ padding: '7px 10px', textAlign: 'left' }}>Artículo</th>
                                        <th style={{ padding: '7px 8px', textAlign: 'left' }}>Almacén</th>
                                        <th style={{ padding: '7px 8px', textAlign: 'right' }}>Lotes Venc.</th>
                                        <th style={{ padding: '7px 10px', textAlign: 'right' }}>Stock Actual</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {scopedStock
                                        .filter(s => s.lotes_vencidos > 0)
                                        .sort((a, b) => b.lotes_vencidos - a.lotes_vencidos)
                                        .slice(0, 100)
                                        .map((s, idx) => (
                                            <tr key={`${s.id_articulo}-${s.id_almacen}`} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 ? '#F8FAFC' : '#FFFFFF' }}>
                                                <td style={{ padding: '7px 10px', fontWeight: 700, color: '#0F172A' }}>{s.articulo}</td>
                                                <td style={{ padding: '7px 8px', color: '#475569' }}>{s.almacen}</td>
                                                <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 800, color: '#B45309' }}>{fmtNum(s.lotes_vencidos)}</td>
                                                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700 }}>{fmtNum(s.stock_actual)}</td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ 6. EXPLORADOR NOMINAL Y EXCEL ═══ */}
            {activeTab === 'explorador' && (
                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                            <div style={{ fontSize: '0.96rem', fontWeight: 800, color: '#003B73' }}>Centro de Exportación y Auditoría Logística</div>
                            <div style={{ fontSize: '0.76rem', color: '#64748B' }}>Descargá planillas listas para Compras, Farmacia y Dirección Médica.</div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={() => handleExportExcel(true)}
                                style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', background: '#0284C7', color: '#FFFFFF', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            >
                                <Download size={15} /> Descargar Planilla Sugerencia de Compras (.xlsx)
                            </button>
                            <button
                                type="button"
                                onClick={() => handleExportExcel(false)}
                                style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #059669', background: '#ECFDF5', color: '#065F46', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            >
                                <FileSpreadsheet size={15} /> Descargar Inventario Completo Valorizado (.xlsx)
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
