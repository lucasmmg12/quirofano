import React, { useState, useEffect, useMemo } from 'react';
import { 
    Activity, 
    Calendar, 
    Building2, 
    Users, 
    UserCheck, 
    UserPlus, 
    FileCheck2, 
    CreditCard, 
    MapPin, 
    Search, 
    RefreshCw, 
    Download, 
    Filter, 
    ChevronRight, 
    ArrowUpRight, 
    AlertCircle, 
    CheckCircle2, 
    Layers, 
    PieChart as PieIcon, 
    BarChart3, 
    SlidersHorizontal,
    FileSpreadsheet,
    HelpCircle,
    TrendingUp,
    ChevronDown,
    ChevronUp
} from 'lucide-react';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    Legend
} from 'recharts';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';

// Colores Institucionales Sanatorio Argentino (Calidad-QOAG)
const COLOR_PRIMARY = '#2563EB'; // Azul institucional
const COLOR_ACCENT = '#0284C7';  // Cyan quirúrgico
const COLOR_AMBULATORIO = '#10B981'; // Esmeralda clínico
const COLOR_HOSPITALIZADO = '#8B5CF6'; // Púrpura internado

const MODALIDADES_TABS = [
    { id: 'TODAS', label: 'Todas las Modalidades', icon: Layers, badgeColor: '#3B82F6' },
    { id: 'ECOGRAFIA', label: 'Ecografía (ECO)', icon: Activity, badgeColor: '#06B6D4' },
    { id: 'RADIOLOGIA', label: 'Radiología (RX)', icon: Activity, badgeColor: '#6366F1' },
    { id: 'MAMOGRAFIA', label: 'Mamografía', icon: Activity, badgeColor: '#EC4899' },
    { id: 'TOMOGRAFIA', label: 'Tomografía (TC)', icon: Activity, badgeColor: '#F59E0B', note: 'Sin contrastes' },
    { id: 'DENSITOMETRIA', label: 'Densitometría Ósea', icon: Activity, badgeColor: '#10B981' }
];

export default function DiagnosticoImagenesDashboard({
    fechaDesde,
    fechaHasta,
    datePresetMode = 'este_mes',
    onDatePresetChange,
    onCustomDateChange,
    addToast
}) {
    // ─── ESTADOS LOCALES ───
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [data, setData] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [dataSource, setDataSource] = useState('cargando'); // 'salus_live' | 'supabase_cache'

    // Filtros de navegación
    const [selectedModalidad, setSelectedModalidad] = useState('TODAS');
    const [selectedAgenda, setSelectedAgenda] = useState('TODAS');
    const [filterAmbito, setFilterAmbito] = useState('TODOS'); // 'TODOS' | 'Ambulatorio' | 'Hospitalización'
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTabDetail, setActiveTabDetail] = useState('prestadores'); // 'prestadores' | 'solicitantes' | 'informantes' | 'obras_sociales' | 'centros'

    // Estados para el Gráfico de Progresión Temporal
    const [chartGranularity, setChartGranularity] = useState('auto'); // 'auto' | 'dia' | 'mes'
    const [chartCollapsed, setChartCollapsed] = useState(false);
    const [visibleSeries, setVisibleSeries] = useState({
        total: true,
        ECOGRAFIA: true,
        RADIOLOGIA: true,
        MAMOGRAFIA: true,
        TOMOGRAFIA: true,
        DENSITOMETRIA: true,
        ambulatorio: true,
        hospitalizacion: true
    });

    // Rango efectivo (supeditado al filtro superior del Telar)
    const effectiveDesde = fechaDesde || '2022-01-01';
    const effectiveHasta = fechaHasta || new Date().toISOString().substring(0, 10);

    // ─── CARGA DE DATOS (CON CACHÉ Y SALUS DIRECTO) ───
    const loadDxIData = async (forceRefresh = false) => {
        if (forceRefresh) setRefreshing(true);
        else setLoading(true);

        try {
            let loaded = false;

            // 1. Intentar endpoints de SALUS Sync Server (relativo vía Vite proxy y directo localhost)
            const qs = new URLSearchParams({
                desde: effectiveDesde,
                hasta: effectiveHasta,
                ...(forceRefresh ? { refresh: 'true' } : {})
            });
            const candidates = [
                `/api/salus/dxi-analytics?${qs.toString()}`,
                `http://localhost:3456/api/salus/dxi-analytics?${qs.toString()}`,
                `http://127.0.0.1:3456/api/salus/dxi-analytics?${qs.toString()}`
            ];

            for (const url of candidates) {
                try {
                    const res = await fetch(url, {
                        signal: AbortSignal.timeout(forceRefresh ? 90000 : 15000)
                    });
                    if (res.ok) {
                        const json = await res.json();
                        if (json.success && json.data) {
                            setData(json.data);
                            setLastUpdated(json.updated_at || new Date().toISOString());
                            setDataSource(json.fromCache ? 'supabase_cache' : 'salus_live');
                            loaded = true;
                            if (forceRefresh) {
                                addToast?.('Datos de Diagnóstico por Imágenes sincronizados desde SALUS', 'success');
                            }
                            break;
                        }
                    }
                } catch (_) {
                    // Probar siguiente candidato
                }
            }

            // 2. Fallback: Leer de Supabase app_config
            if (!loaded) {
                const { data: cfg, error } = await supabase
                    .from('app_config')
                    .select('value, updated_at')
                    .eq('key', 'dxi_analytics_cache')
                    .maybeSingle();

                if (cfg?.value) {
                    try {
                        const parsed = typeof cfg.value === 'string' ? JSON.parse(cfg.value) : cfg.value;
                        setData(parsed);
                        setLastUpdated(cfg.updated_at || new Date().toISOString());
                        setDataSource('supabase_cache');
                        loaded = true;
                    } catch (parseErr) {
                        console.error('[DxI] Error al parsear cache de app_config:', parseErr);
                    }
                }
            }

            if (!loaded) {
                addToast?.('No se pudieron obtener datos de imágenes para el período seleccionado', 'warning');
            }
        } catch (err) {
            console.error('[DxI] Error cargando datos de imágenes:', err);
            addToast?.(`Error: ${err.message}`, 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // Recargar cada vez que cambien las fechas del Telar arriba
    useEffect(() => {
        loadDxIData(false);
    }, [effectiveDesde, effectiveHasta]);

    // ─── PROCESAMIENTO Y AGREGACIÓN DE DATOS FILTRADOS ───

    // 1. Resumen de conteos globales por modalidad
    const modalidadCounts = useMemo(() => {
        if (!data?.agendas) return {};
        const counts = { TODAS: 0, ECOGRAFIA: 0, RADIOLOGIA: 0, MAMOGRAFIA: 0, TOMOGRAFIA: 0, DENSITOMETRIA: 0 };
        data.agendas.forEach(row => {
            const cant = row.Cantidad || 0;
            counts.TODAS += cant;
            if (counts[row.Modalidad] !== undefined) {
                counts[row.Modalidad] += cant;
            }
        });
        return counts;
    }, [data]);

    // 2. Agendas filtradas por modalidad seleccionada y búsqueda
    const filteredAgendasRows = useMemo(() => {
        if (!data?.agendas) return [];
        return data.agendas.filter(r => {
            if (selectedModalidad !== 'TODAS' && r.Modalidad !== selectedModalidad) return false;
            if (filterAmbito !== 'TODOS' && r.Ambito !== filterAmbito) return false;
            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase();
                const ag = (r.Agenda || '').toLowerCase();
                const c = (r.Centro || '').toLowerCase();
                if (!ag.includes(term) && !c.includes(term)) return false;
            }
            return true;
        });
    }, [data, selectedModalidad, filterAmbito, searchTerm]);

    // 3. Agrupación por Agenda Única (sumando centros y ámbitos)
    const agendasSummaryList = useMemo(() => {
        const map = new Map();
        filteredAgendasRows.forEach(r => {
            const key = r.Agenda;
            if (!map.has(key)) {
                map.set(key, {
                    agenda: r.Agenda,
                    modalidad: r.Modalidad,
                    total: 0,
                    ambulatorio: 0,
                    hospitalizacion: 0,
                    informados: 0,
                    pendientes: 0,
                    centros: new Set()
                });
            }
            const item = map.get(key);
            item.total += r.Cantidad || 0;
            if (r.Ambito === 'Hospitalización') item.hospitalizacion += r.Cantidad || 0;
            else item.ambulatorio += r.Cantidad || 0;
            item.informados += r.Informados || 0;
            item.pendientes += r.PendientesInforme || 0;
            if (r.Centro) item.centros.add(r.Centro);
        });

        return Array.from(map.values()).sort((a, b) => b.total - a.total);
    }, [filteredAgendasRows]);

    // 4. Totales del filtro activo
    const totals = useMemo(() => {
        const total = agendasSummaryList.reduce((acc, a) => acc + a.total, 0);
        const ambulatorio = agendasSummaryList.reduce((acc, a) => acc + a.ambulatorio, 0);
        const hospitalizacion = agendasSummaryList.reduce((acc, a) => acc + a.hospitalizacion, 0);
        const informados = agendasSummaryList.reduce((acc, a) => acc + a.informados, 0);
        const pendientes = agendasSummaryList.reduce((acc, a) => acc + a.pendientes, 0);

        return {
            total,
            ambulatorio,
            pctAmbulatorio: total > 0 ? ((ambulatorio / total) * 100).toFixed(1) : 0,
            hospitalizacion,
            pctHospitalizacion: total > 0 ? ((hospitalizacion / total) * 100).toFixed(1) : 0,
            informados,
            pctInformados: total > 0 ? ((informados / total) * 100).toFixed(1) : 0,
            pendientes,
            pctPendientes: total > 0 ? ((pendientes / total) * 100).toFixed(1) : 0,
            cantAgendas: agendasSummaryList.length
        };
    }, [agendasSummaryList]);

    // 5. Ranking de Prestadores Realizadores (filtrados por modalidad y agenda seleccionada)
    const realizadoresRanking = useMemo(() => {
        if (!data?.realizadores) return [];
        const map = new Map();
        data.realizadores.forEach(r => {
            if (selectedModalidad !== 'TODAS' && r.Modalidad !== selectedModalidad) return false;
            if (selectedAgenda !== 'TODAS' && r.Agenda !== selectedAgenda) return false;

            const prest = r.PrestadorRealiza || 'SIN ASIGNAR';
            map.set(prest, (map.get(prest) || 0) + (r.Cantidad || 0));
        });

        const totalRealizadores = Array.from(map.values()).reduce((a, b) => a + b, 0);
        return Array.from(map.entries())
            .map(([nombre, cantidad]) => ({
                nombre,
                cantidad,
                porcentaje: totalRealizadores > 0 ? ((cantidad / totalRealizadores) * 100).toFixed(1) : 0
            }))
            .sort((a, b) => b.cantidad - a.cantidad);
    }, [data, selectedModalidad, selectedAgenda]);

    // 6. Ranking de Prestadores Solicitantes (filtrados por modalidad y agenda)
    const solicitantesRanking = useMemo(() => {
        if (!data?.solicitantes) return [];
        const map = new Map();
        data.solicitantes.forEach(r => {
            if (selectedModalidad !== 'TODAS' && r.Modalidad !== selectedModalidad) return false;
            if (selectedAgenda !== 'TODAS' && r.Agenda !== selectedAgenda) return false;

            const prest = r.PrestadorSolicita || 'NO ESPECIFICADO';
            map.set(prest, (map.get(prest) || 0) + (r.Cantidad || 0));
        });

        const totalSolicitantes = Array.from(map.values()).reduce((a, b) => a + b, 0);
        return Array.from(map.entries())
            .map(([nombre, cantidad]) => ({
                nombre,
                cantidad,
                porcentaje: totalSolicitantes > 0 ? ((cantidad / totalSolicitantes) * 100).toFixed(1) : 0
            }))
            .sort((a, b) => b.cantidad - a.cantidad);
    }, [data, selectedModalidad, selectedAgenda]);

    // 7. Ranking de Prestadores Informantes (donde Fecha Informado IS NOT NULL)
    const informantesRanking = useMemo(() => {
        if (!data?.informantes) return [];
        const map = new Map();
        data.informantes.forEach(r => {
            if (selectedModalidad !== 'TODAS' && r.Modalidad !== selectedModalidad) return false;
            if (selectedAgenda !== 'TODAS' && r.Agenda !== selectedAgenda) return false;

            const prest = r.PrestadorInforma || 'PROFESIONAL INFORMANTE';
            map.set(prest, (map.get(prest) || 0) + (r.Cantidad || 0));
        });

        const totalInformados = Array.from(map.values()).reduce((a, b) => a + b, 0);
        return Array.from(map.entries())
            .map(([nombre, cantidad]) => ({
                nombre,
                cantidad,
                porcentaje: totalInformados > 0 ? ((cantidad / totalInformados) * 100).toFixed(1) : 0
            }))
            .sort((a, b) => b.cantidad - a.cantidad);
    }, [data, selectedModalidad, selectedAgenda]);

    // 8. Obras Sociales más utilizadas
    const obrasSocialesRanking = useMemo(() => {
        if (!data?.obrasSociales) return [];
        const map = new Map();
        data.obrasSociales.forEach(r => {
            if (selectedModalidad !== 'TODAS' && r.Modalidad !== selectedModalidad) return false;
            if (selectedAgenda !== 'TODAS' && r.Agenda !== selectedAgenda) return false;

            const os = r.ObraSocial || 'PARTICULAR / SIN FINANCIADOR';
            map.set(os, (map.get(os) || 0) + (r.Cantidad || 0));
        });

        const totalOS = Array.from(map.values()).reduce((a, b) => a + b, 0);
        return Array.from(map.entries())
            .map(([nombre, cantidad]) => ({
                nombre,
                cantidad,
                porcentaje: totalOS > 0 ? ((cantidad / totalOS) * 100).toFixed(1) : 0
            }))
            .sort((a, b) => b.cantidad - a.cantidad);
    }, [data, selectedModalidad, selectedAgenda]);

    // 9. Centros más utilizados
    const centrosRanking = useMemo(() => {
        if (!data?.agendas) return [];
        const map = new Map();
        data.agendas.forEach(r => {
            if (selectedModalidad !== 'TODAS' && r.Modalidad !== selectedModalidad) return false;
            if (selectedAgenda !== 'TODAS' && r.Agenda !== selectedAgenda) return false;

            const c = r.Centro || 'CENTRO NO ESPECIFICADO';
            map.set(c, (map.get(c) || 0) + (r.Cantidad || 0));
        });

        const totalCentros = Array.from(map.values()).reduce((a, b) => a + b, 0);
        return Array.from(map.entries())
            .map(([nombre, cantidad]) => ({
                nombre,
                cantidad,
                porcentaje: totalCentros > 0 ? ((cantidad / totalCentros) * 100).toFixed(1) : 0
            }))
            .sort((a, b) => b.cantidad - a.cantidad);
    }, [data, selectedModalidad, selectedAgenda]);

    // ─── CÁLCULOS PARA GRÁFICO DE PROGRESIÓN TEMPORAL ───
    const rangeDays = useMemo(() => {
        if (!effectiveDesde || !effectiveHasta) return 30;
        const d1 = new Date(effectiveDesde + 'T00:00:00');
        const d2 = new Date(effectiveHasta + 'T23:59:59');
        return Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
    }, [effectiveDesde, effectiveHasta]);

    const activeGranularity = useMemo(() => {
        if (chartGranularity !== 'auto') return chartGranularity;
        const hasDaily = data?.evolucion?.some(e => Boolean(e.FechaDia));
        return (rangeDays <= 65 && hasDaily) ? 'dia' : 'mes';
    }, [chartGranularity, rangeDays, data?.evolucion]);

    const progressionChartData = useMemo(() => {
        if (!data?.evolucion || !Array.isArray(data.evolucion) || data.evolucion.length === 0) return [];

        const map = new Map();

        // Si es granularidad diaria y rango moderado (<= 62 días), poblar todos los días con 0 para continuidad clínica
        if (activeGranularity === 'dia' && effectiveDesde && effectiveHasta && rangeDays <= 62) {
            const start = new Date(effectiveDesde + 'T00:00:00');
            const end = new Date(effectiveHasta + 'T00:00:00');
            const todayStr = new Date().toISOString().substring(0, 10);
            const cur = new Date(start);
            while (cur <= end) {
                const yyyy = cur.getFullYear();
                const mm = String(cur.getMonth() + 1).padStart(2, '0');
                const dd = String(cur.getDate()).padStart(2, '0');
                const dayKey = `${yyyy}-${mm}-${dd}`;
                if (dayKey > todayStr && dayKey > effectiveHasta) break;

                map.set(dayKey, {
                    key: dayKey,
                    label: `${dd}/${mm}`,
                    fullDate: dayKey,
                    total: 0,
                    ECOGRAFIA: 0,
                    RADIOLOGIA: 0,
                    MAMOGRAFIA: 0,
                    TOMOGRAFIA: 0,
                    DENSITOMETRIA: 0,
                    OTRAS: 0,
                    ambulatorio: 0,
                    hospitalizacion: 0
                });
                cur.setDate(cur.getDate() + 1);
            }
        }

        // Acumular registros
        data.evolucion.forEach(r => {
            // Filtro de Ámbito
            if (filterAmbito !== 'TODOS' && r.Ambito && r.Ambito !== filterAmbito) return;
            // Si hay una modalidad seleccionada puntual (que no sea TODAS)
            if (selectedModalidad !== 'TODAS' && r.Modalidad && r.Modalidad !== selectedModalidad) return;

            const timeKey = (activeGranularity === 'dia' && r.FechaDia) ? r.FechaDia : (r.PeriodoMes || r.FechaDia?.substring(0, 7));
            if (!timeKey) return;

            if (!map.has(timeKey)) {
                let label = timeKey;
                if (timeKey.length === 10) {
                    const parts = timeKey.split('-');
                    label = `${parts[2]}/${parts[1]}`;
                } else if (timeKey.length === 7) {
                    const [y, m] = timeKey.split('-');
                    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                    label = `${meses[parseInt(m, 10) - 1] || m} ${y.slice(2)}`;
                }

                map.set(timeKey, {
                    key: timeKey,
                    label,
                    fullDate: timeKey,
                    total: 0,
                    ECOGRAFIA: 0,
                    RADIOLOGIA: 0,
                    MAMOGRAFIA: 0,
                    TOMOGRAFIA: 0,
                    DENSITOMETRIA: 0,
                    OTRAS: 0,
                    ambulatorio: 0,
                    hospitalizacion: 0
                });
            }

            const point = map.get(timeKey);
            const cant = r.Cantidad || 0;
            point.total += cant;

            const mod = r.Modalidad || 'OTRAS';
            if (point[mod] !== undefined) {
                point[mod] += cant;
            } else {
                point.OTRAS += cant;
            }

            if (r.Ambito === 'Hospitalización') {
                point.hospitalizacion += cant;
            } else {
                point.ambulatorio += cant;
            }
        });

        return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
    }, [data?.evolucion, activeGranularity, effectiveDesde, effectiveHasta, rangeDays, filterAmbito, selectedModalidad]);

    const chartStats = useMemo(() => {
        if (!progressionChartData.length) return { total: 0, avg: 0, peak: null };
        const total = progressionChartData.reduce((acc, p) => acc + p.total, 0);
        const nonZeroPoints = progressionChartData.filter(p => p.total > 0);
        const avg = nonZeroPoints.length > 0 ? (total / nonZeroPoints.length).toFixed(1) : (total / progressionChartData.length).toFixed(1);
        const peak = progressionChartData.reduce((max, p) => p.total > (max?.total || 0) ? p : max, null);
        return { total, avg, peak };
    }, [progressionChartData]);

    // ─── EXPORTACIÓN A EXCEL MULTI-HOJA (.XLSX) ───
    const handleExportExcel = () => {
        if (!agendasSummaryList.length && !progressionChartData.length) {
            addToast?.('No hay datos disponibles para exportar a Excel', 'warning');
            return;
        }

        try {
            const wb = XLSX.utils.book_new();

            // 1. Hoja Resumen Ejecutivo
            const resumenData = [
                ['REPORTE EJECUTIVO DE ANALÍTICA — DIAGNÓSTICO POR IMÁGENES (DxI)'],
                ['Sanatorio Argentino — Sistema de Gobernanza y Gestión Hospitalaria'],
                [''],
                ['PARÁMETROS DEL REPORTE', ''],
                ['Período Desde:', effectiveDesde],
                ['Período Hasta:', effectiveHasta],
                ['Modalidad Seleccionada:', selectedModalidad],
                ['Filtro de Ámbito:', filterAmbito],
                ['Agenda Seleccionada:', selectedAgenda],
                ['Fecha de Generación:', new Date().toLocaleString('es-AR')],
                ['Origen de Datos:', dataSource === 'salus_live' ? 'SALUS Live SQL Server' : 'Caché Supabase'],
                [''],
                ['INDICADORES CLAVE (KPIs)', 'VALOR', 'PORCENTAJE / DETALLE'],
                ['Total Estudios Realizados', totals.total, '100%'],
                ['Estudios Ambulatorios', totals.ambulatorio, `${totals.pctAmbulatorio}%`],
                ['Estudios en Hospitalización', totals.hospitalizacion, `${totals.pctHospitalizacion}%`],
                ['Estudios con Informe Firmado', totals.informados, `${totals.pctInformados}%`],
                ['Estudios Pendientes de Informe', totals.pendientes, `${totals.pctPendientes}%`],
                ['Cantidad de Agendas con Producción', totals.cantAgendas, 'Agendas activas'],
                ['Promedio de Producción', chartStats.avg, activeGranularity === 'dia' ? 'Estudios / Día' : 'Estudios / Mes'],
                ['Pico Máximo de Producción', chartStats.peak ? chartStats.peak.total : 0, chartStats.peak ? `Fecha: ${chartStats.peak.label}` : '—']
            ];
            const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
            XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen_KPIs');

            // 2. Hoja Progresión Temporal (Evolución de Estudios)
            if (progressionChartData.length > 0) {
                const progresionRows = progressionChartData.map(p => ({
                    'Fecha / Período': p.fullDate || p.label,
                    'Etiqueta': p.label,
                    'Total Estudios': p.total,
                    'Ecografía (ECO)': p.ECOGRAFIA || 0,
                    'Radiología (RX)': p.RADIOLOGIA || 0,
                    'Mamografía': p.MAMOGRAFIA || 0,
                    'Tomografía (TC)': p.TOMOGRAFIA || 0,
                    'Densitometría': p.DENSITOMETRIA || 0,
                    'Otras Pruebas': p.OTRAS || 0,
                    'Ambulatorio': p.ambulatorio || 0,
                    'Hospitalización': p.hospitalizacion || 0
                }));
                const wsProgresion = XLSX.utils.json_to_sheet(progresionRows);
                XLSX.utils.book_append_sheet(wb, wsProgresion, 'Progresion_Temporal');
            }

            // 3. Hoja Ranking de Agendas
            if (agendasSummaryList.length > 0) {
                const agendasRows = agendasSummaryList.map(a => ({
                    'Modalidad': a.modalidad,
                    'Agenda / Tipo Visita': a.agenda,
                    'Total Estudios': a.total,
                    'Ambulatorio': a.ambulatorio,
                    '% Ambulatorio': a.total > 0 ? ((a.ambulatorio / a.total) * 100).toFixed(1) + '%' : '0%',
                    'Hospitalización': a.hospitalizacion,
                    '% Hospitalización': a.total > 0 ? ((a.hospitalizacion / a.total) * 100).toFixed(1) + '%' : '0%',
                    'Informados': a.informados,
                    '% Informados': a.total > 0 ? ((a.informados / a.total) * 100).toFixed(1) + '%' : '0%',
                    'Pendientes de Informe': a.pendientes,
                    'Centros': Array.from(a.centros).join(', ')
                }));
                const wsAgendas = XLSX.utils.json_to_sheet(agendasRows);
                XLSX.utils.book_append_sheet(wb, wsAgendas, 'Ranking_Agendas');
            }

            // 4. Hoja Prestadores Realizadores
            if (realizadoresRanking.length > 0) {
                const realRows = realizadoresRanking.map(r => ({
                    'Profesional Realizador': r.nombre,
                    'Cantidad Estudios': r.cantidad,
                    '% del Volumen': `${r.porcentaje}%`
                }));
                const wsReal = XLSX.utils.json_to_sheet(realRows);
                XLSX.utils.book_append_sheet(wb, wsReal, 'Prestadores_Realizan');
            }

            // 5. Hoja Prestadores Solicitantes
            if (solicitantesRanking.length > 0) {
                const solRows = solicitantesRanking.map(s => ({
                    'Profesional Solicitante': s.nombre,
                    'Cantidad Estudios': s.cantidad,
                    '% del Volumen': `${s.porcentaje}%`
                }));
                const wsSol = XLSX.utils.json_to_sheet(solRows);
                XLSX.utils.book_append_sheet(wb, wsSol, 'Prestadores_Solicitan');
            }

            // 6. Hoja Prestadores Informantes
            if (informantesRanking.length > 0) {
                const infRows = informantesRanking.map(i => ({
                    'Profesional Informante': i.nombre,
                    'Estudios Informados': i.cantidad,
                    '% del Total Informados': `${i.porcentaje}%`
                }));
                const wsInf = XLSX.utils.json_to_sheet(infRows);
                XLSX.utils.book_append_sheet(wb, wsInf, 'Prestadores_Informan');
            }

            // 7. Hoja Obras Sociales
            if (obrasSocialesRanking.length > 0) {
                const osRows = obrasSocialesRanking.map(o => ({
                    'Financiador / Obra Social': o.nombre,
                    'Cantidad Estudios': o.cantidad,
                    '% de Cobertura': `${o.porcentaje}%`
                }));
                const wsOs = XLSX.utils.json_to_sheet(osRows);
                XLSX.utils.book_append_sheet(wb, wsOs, 'Obras_Sociales');
            }

            const fileName = `DxI_Analitica_${selectedModalidad}_${effectiveDesde}_${effectiveHasta}.xlsx`;
            XLSX.writeFile(wb, fileName);
            addToast?.('Planilla Excel (.xlsx) generada exitosamente con todas las hojas', 'success');
        } catch (err) {
            console.error('Error al generar Excel DxI:', err);
            addToast?.('Error al generar archivo Excel: ' + err.message, 'error');
        }
    };

    // ─── EXPORTACIÓN RÁPIDA DE LA PROGRESIÓN TEMPORAL (.XLSX) ───
    const handleExportProgressionExcel = () => {
        if (!progressionChartData.length) {
            addToast?.('No hay datos de progresión para exportar', 'warning');
            return;
        }

        try {
            const wb = XLSX.utils.book_new();
            const progresionRows = progressionChartData.map(p => ({
                'Fecha / Período': p.fullDate || p.label,
                'Etiqueta': p.label,
                'Total Estudios': p.total,
                'Ecografía (ECO)': p.ECOGRAFIA || 0,
                'Radiología (RX)': p.RADIOLOGIA || 0,
                'Mamografía': p.MAMOGRAFIA || 0,
                'Tomografía (TC)': p.TOMOGRAFIA || 0,
                'Densitometría': p.DENSITOMETRIA || 0,
                'Otras Pruebas': p.OTRAS || 0,
                'Ambulatorio': p.ambulatorio || 0,
                'Hospitalización': p.hospitalizacion || 0
            }));
            const ws = XLSX.utils.json_to_sheet(progresionRows);
            XLSX.utils.book_append_sheet(wb, ws, `Progresion_${activeGranularity}`);
            XLSX.writeFile(wb, `DxI_Progresion_${selectedModalidad}_${effectiveDesde}_${effectiveHasta}.xlsx`);
            addToast?.('Excel de Progresión Temporal descargado exitosamente', 'success');
        } catch (err) {
            console.error('Error exportando progresión a Excel:', err);
            addToast?.('Error al descargar Excel: ' + err.message, 'error');
        }
    };

    // ─── EXPORTACIÓN A CSV ───
    const handleExportCsv = () => {
        if (!agendasSummaryList.length) {
            addToast?.('No hay datos para exportar', 'warning');
            return;
        }

        const headers = ['Modalidad', 'Agenda', 'Total Estudios', 'Ambulatorio', '% Ambulatorio', 'Hospitalización', '% Hospitalización', 'Informados', '% Informados', 'Pendientes', 'Centros'];
        const rows = agendasSummaryList.map(a => [
            `"${a.modalidad}"`,
            `"${a.agenda}"`,
            a.total,
            a.ambulatorio,
            a.total > 0 ? ((a.ambulatorio / a.total) * 100).toFixed(1) + '%' : '0%',
            a.hospitalizacion,
            a.total > 0 ? ((a.hospitalizacion / a.total) * 100).toFixed(1) + '%' : '0%',
            a.informados,
            a.total > 0 ? ((a.informados / a.total) * 100).toFixed(1) + '%' : '0%',
            a.pendientes,
            `"${Array.from(a.centros).join(', ')}"`
        ]);

        const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `DxI_Agendas_${selectedModalidad}_${effectiveDesde}_${effectiveHasta}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        addToast?.('Reporte CSV generado exitosamente', 'success');
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: 'Inter, sans-serif' }}>
            
            {/* ─── BANNER SUPERIOR DE INFORMACIÓN Y SINCRONIZACIÓN ─── */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                padding: '16px 20px',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '12px',
                        background: '#EFF6FF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: COLOR_PRIMARY
                    }}>
                        <Activity size={24} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0F172A' }}>
                                Diagnóstico por Imágenes (DxI)
                            </h2>
                            <span style={{
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                background: '#EFF6FF',
                                color: COLOR_PRIMARY,
                                padding: '2px 8px',
                                borderRadius: '999px',
                                border: '1px solid #BFDBFE'
                            }}>
                                2022 en adelante
                            </span>
                            <span style={{
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                background: '#F8FAFC',
                                color: '#64748B',
                                padding: '2px 8px',
                                borderRadius: '999px',
                                border: '1px solid #E2E8F0'
                            }}>
                                Sin contrastes en TC
                            </span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>Período Telar: <strong style={{ color: '#1E293B' }}>{effectiveDesde}</strong> al <strong style={{ color: '#1E293B' }}>{effectiveHasta}</strong></span>
                            <span>•</span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: dataSource === 'salus_live' ? '#10B981' : '#F59E0B' }}></span>
                                {dataSource === 'salus_live' ? 'SALUS Live (Directo)' : 'Caché Supabase'}
                            </span>
                            {lastUpdated && (
                                <>
                                    <span>•</span>
                                    <span>Act: {new Date(lastUpdated).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Botonera de Acciones Rápidas */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* Atajos de Filtro Rápido vinculados al Telar */}
                    <div style={{ display: 'flex', background: '#F1F5F9', padding: '3px', borderRadius: '10px', gap: '2px' }}>
                        {[
                            { label: 'Todo (2022+)', d: '2022-01-01', h: new Date().toISOString().substring(0, 10), mode: 'historico' },
                            { label: 'Este Año', d: `${new Date().getFullYear()}-01-01`, h: new Date().toISOString().substring(0, 10), mode: 'este_anio' },
                            { label: 'Mes Activo', d: fechaDesde, h: fechaHasta, mode: datePresetMode }
                        ].map((btn, idx) => (
                            <button
                                key={idx}
                                onClick={() => {
                                    if (btn.mode === 'historico' || btn.mode === 'este_anio') {
                                        onCustomDateChange?.(btn.d, btn.h);
                                    } else {
                                        onDatePresetChange?.(datePresetMode);
                                    }
                                }}
                                style={{
                                    border: 'none',
                                    padding: '5px 10px',
                                    borderRadius: '7px',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    background: effectiveDesde === btn.d ? '#FFFFFF' : 'transparent',
                                    color: effectiveDesde === btn.d ? COLOR_PRIMARY : '#64748B',
                                    boxShadow: effectiveDesde === btn.d ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                {btn.label}
                            </button>
                        ))}
                    </div>

                    {/* Botón Descargar Excel (.xlsx) */}
                    <button
                        onClick={handleExportExcel}
                        disabled={loading}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: '#ECFDF5',
                            border: '1px solid #A7F3D0',
                            borderRadius: '10px',
                            padding: '7px 14px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            color: '#065F46',
                            cursor: 'pointer',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                            transition: 'all 0.15s ease'
                        }}
                        title="Descargar reporte completo en Excel (.xlsx) con todas las hojas tabuladas"
                    >
                        <FileSpreadsheet size={16} color="#059669" />
                        Descargar Excel
                    </button>

                    {/* Botón Exportar CSV */}
                    <button
                        onClick={handleExportCsv}
                        disabled={loading}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: '#FFFFFF',
                            border: '1px solid #CBD5E1',
                            borderRadius: '10px',
                            padding: '7px 12px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: '#475569',
                            cursor: 'pointer',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                        }}
                        title="Exportar listado en formato CSV"
                    >
                        <Download size={14} />
                        CSV
                    </button>

                    {/* Botón Sincronizar SALUS */}
                    <button
                        onClick={() => loadDxIData(true)}
                        disabled={refreshing || loading}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: COLOR_PRIMARY,
                            border: 'none',
                            borderRadius: '10px',
                            padding: '7px 14px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: '#FFFFFF',
                            cursor: (refreshing || loading) ? 'not-allowed' : 'pointer',
                            boxShadow: '0 2px 4px rgba(37,99,235,0.2)'
                        }}
                    >
                        <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
                        {refreshing ? 'Extrayendo...' : 'Sincronizar SALUS'}
                    </button>
                </div>
            </div>

            {/* ─── PESTAÑAS SELECTORAS DE MODALIDAD (ECO, RX, MAM, TC, DE) ─── */}
            <div style={{
                display: 'flex',
                background: '#FFFFFF',
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                padding: '6px',
                gap: '6px',
                overflowX: 'auto',
                boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
            }}>
                {MODALIDADES_TABS.map(tab => {
                    const isSelected = selectedModalidad === tab.id;
                    const count = modalidadCounts[tab.id] || 0;
                    const TabIcon = tab.icon;

                    return (
                        <button
                            key={tab.id}
                            onClick={() => {
                                setSelectedModalidad(tab.id);
                                setSelectedAgenda('TODAS'); // Resetear agenda al cambiar modalidad
                            }}
                            style={{
                                flex: 1,
                                minWidth: '150px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '10px 14px',
                                borderRadius: '10px',
                                border: `1.5px solid ${isSelected ? tab.badgeColor : 'transparent'}`,
                                background: isSelected ? '#F8FAFC' : 'transparent',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '8px',
                                    background: isSelected ? `${tab.badgeColor}15` : '#F1F5F9',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: tab.badgeColor
                                }}>
                                    <TabIcon size={16} />
                                </div>
                                <div style={{ textAlign: 'left' }}>
                                    <div style={{ fontSize: '0.82rem', fontWeight: isSelected ? 700 : 600, color: isSelected ? '#0F172A' : '#475569' }}>
                                        {tab.label}
                                    </div>
                                    {tab.note && (
                                        <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>{tab.note}</div>
                                    )}
                                </div>
                            </div>
                            <span style={{
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                color: isSelected ? tab.badgeColor : '#64748B',
                                background: isSelected ? `${tab.badgeColor}20` : '#F1F5F9',
                                padding: '2px 8px',
                                borderRadius: '999px'
                            }}>
                                {count.toLocaleString('es-AR')}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* ─── INDICADORES EJECUTIVOS (KPI CARDS) ─── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '14px'
            }}>
                {/* 1. Total Estudios */}
                <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '16px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Total Estudios Realizados
                    </div>
                    <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                        {loading ? '...' : totals.total.toLocaleString('es-AR')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
                        En modalidad: <strong>{selectedModalidad}</strong>
                    </div>
                </div>

                {/* 2. Ambulatorio */}
                <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '16px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Ambulatorio
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: COLOR_AMBULATORIO, background: '#ECFDF5', padding: '2px 6px', borderRadius: '6px' }}>
                            {totals.pctAmbulatorio}%
                        </span>
                    </div>
                    <div style={{ fontSize: '1.85rem', fontWeight: 800, color: COLOR_AMBULATORIO, marginTop: '4px' }}>
                        {loading ? '...' : totals.ambulatorio.toLocaleString('es-AR')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
                        Consultas externas, sobreturnos y demanda espontánea
                    </div>
                </div>

                {/* 3. Hospitalización */}
                <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '16px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Hospitalización
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: COLOR_HOSPITALIZADO, background: '#F5F3FF', padding: '2px 6px', borderRadius: '6px' }}>
                            {totals.pctHospitalizacion}%
                        </span>
                    </div>
                    <div style={{ fontSize: '1.85rem', fontWeight: 800, color: COLOR_HOSPITALIZADO, marginTop: '4px' }}>
                        {loading ? '...' : totals.hospitalizacion.toLocaleString('es-AR')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
                        Pacientes en camas de piso, UCI y quirófano
                    </div>
                </div>

                {/* 4. Tasa de Informes Firmados */}
                <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '16px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Tasa de Informes
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#2563EB', background: '#EFF6FF', padding: '2px 6px', borderRadius: '6px' }}>
                            {totals.pctInformados}% firmados
                        </span>
                    </div>
                    <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                        {loading ? '...' : totals.informados.toLocaleString('es-AR')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#DC2626', marginTop: '4px' }}>
                        Pendientes de informe: <strong>{totals.pendientes.toLocaleString('es-AR')}</strong>
                    </div>
                </div>

                {/* 5. Agendas Activas */}
                <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '16px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Agendas Activas
                    </div>
                    <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                        {loading ? '...' : totals.cantAgendas}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
                        Tipos de Visita con producción en el período
                    </div>
                </div>
            </div>

            {/* ─── FILTROS DE TABLERO: ÁMBITO Y BÚSQUEDA ─── */}
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '12px 16px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Filter size={16} color="#64748B" />
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569' }}>Filtro Ámbito:</span>
                    <div style={{ display: 'flex', background: '#F1F5F9', padding: '2px', borderRadius: '8px', gap: '2px' }}>
                        {['TODOS', 'Ambulatorio', 'Hospitalización'].map(amb => (
                            <button
                                key={amb}
                                onClick={() => setFilterAmbito(amb)}
                                style={{
                                    border: 'none',
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    background: filterAmbito === amb ? '#FFFFFF' : 'transparent',
                                    color: filterAmbito === amb ? COLOR_PRIMARY : '#64748B',
                                    boxShadow: filterAmbito === amb ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                                }}
                            >
                                {amb}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {selectedAgenda !== 'TODAS' && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: '#EFF6FF',
                            border: '1px solid #BFDBFE',
                            padding: '4px 10px',
                            borderRadius: '8px',
                            fontSize: '0.78rem',
                            color: COLOR_PRIMARY,
                            fontWeight: 600
                        }}>
                            <span>Agenda: <strong>{selectedAgenda}</strong></span>
                            <button
                                onClick={() => setSelectedAgenda('TODAS')}
                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: COLOR_PRIMARY, fontWeight: 800 }}
                            >
                                ✕
                            </button>
                        </div>
                    )}

                    <div style={{ position: 'relative', width: '280px' }}>
                        <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Buscar por agenda o centro..."
                            style={{
                                width: '100%',
                                padding: '6px 10px 6px 32px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.8rem',
                                color: '#0F172A',
                                outline: 'none'
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* ─── GRÁFICO DE LÍNEAS: PROGRESIÓN DEL PERÍODO ─── */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                padding: '16px 20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
            }}>
                {/* Header del Gráfico */}
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            background: '#EFF6FF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: COLOR_PRIMARY
                        }}>
                            <TrendingUp size={20} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0F172A' }}>
                                    Progresión del Período — Evolución Temporal
                                </h3>
                                <span style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    color: COLOR_PRIMARY,
                                    background: '#EFF6FF',
                                    border: '1px solid #BFDBFE',
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    textTransform: 'uppercase'
                                }}>
                                    {activeGranularity === 'dia' ? 'Vista Diaria' : 'Vista Mensual'}
                                </span>
                            </div>
                            <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                                {selectedModalidad === 'TODAS' 
                                    ? 'Curva de estudios realizados por día/mes y desglose por modalidad diagnóstica'
                                    : `Curva evolutiva para modalidad ${selectedModalidad} desagregada por ámbito`}
                            </p>
                        </div>
                    </div>

                    {/* Controles de Granularidad y Resumen */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {/* Indicadores Clave */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{
                                background: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                padding: '4px 10px',
                                borderRadius: '8px',
                                fontSize: '0.75rem',
                                color: '#475569'
                            }}>
                                Promedio: <strong style={{ color: '#0F172A' }}>{chartStats.avg}</strong> {activeGranularity === 'dia' ? 'est/día' : 'est/mes'}
                            </div>

                            {chartStats.peak && (
                                <div style={{
                                    background: '#FEF3C7',
                                    border: '1px solid #FDE68A',
                                    padding: '4px 10px',
                                    borderRadius: '8px',
                                    fontSize: '0.75rem',
                                    color: '#92400E'
                                }}>
                                    Pico: <strong>{chartStats.peak.total.toLocaleString('es-AR')}</strong> ({chartStats.peak.label})
                                </div>
                            )}

                            <div style={{
                                background: '#EFF6FF',
                                border: '1px solid #BFDBFE',
                                padding: '4px 10px',
                                borderRadius: '8px',
                                fontSize: '0.75rem',
                                color: COLOR_PRIMARY
                            }}>
                                Total Período: <strong>{chartStats.total.toLocaleString('es-AR')}</strong>
                            </div>
                        </div>

                        {/* Switch Granularidad: Auto / Día / Mes */}
                        <div style={{ display: 'flex', background: '#F1F5F9', padding: '2px', borderRadius: '8px', gap: '2px' }}>
                            {[
                                { id: 'auto', label: 'Auto' },
                                { id: 'dia', label: 'Día' },
                                { id: 'mes', label: 'Mes' }
                            ].map(btn => (
                                <button
                                    key={btn.id}
                                    onClick={() => setChartGranularity(btn.id)}
                                    style={{
                                        border: 'none',
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        fontSize: '0.72rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        background: chartGranularity === btn.id ? '#FFFFFF' : 'transparent',
                                        color: chartGranularity === btn.id ? COLOR_PRIMARY : '#64748B',
                                        boxShadow: chartGranularity === btn.id ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                                    }}
                                >
                                    {btn.label}
                                </button>
                            ))}
                        </div>

                        {/* Botón Descargar Excel Progresión */}
                        <button
                            onClick={handleExportProgressionExcel}
                            disabled={loading || !progressionChartData.length}
                            title="Descargar datos de la curva de evolución en Excel (.xlsx)"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                border: '1px solid #CBD5E1',
                                background: '#FFFFFF',
                                borderRadius: '8px',
                                padding: '4px 9px',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                color: '#0F172A',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <FileSpreadsheet size={13} color="#059669" />
                            <span>Excel Progresión</span>
                        </button>

                        {/* Botón Colapsar / Expandir */}
                        <button
                            onClick={() => setChartCollapsed(!chartCollapsed)}
                            title={chartCollapsed ? 'Expandir gráfico' : 'Colapsar gráfico'}
                            style={{
                                border: '1px solid #E2E8F0',
                                background: '#FFFFFF',
                                borderRadius: '8px',
                                padding: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#64748B'
                            }}
                        >
                            {chartCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                        </button>
                    </div>
                </div>

                {!chartCollapsed && (
                    <>
                        {/* Selector / Leyenda interactiva de series */}
                        <div style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            gap: '8px',
                            paddingTop: '6px',
                            borderTop: '1px solid #F1F5F9',
                            fontSize: '0.75rem'
                        }}>
                            <span style={{ color: '#64748B', fontWeight: 600, marginRight: '4px' }}>Series visibles:</span>
                            
                            {/* Toggle Total */}
                            <button
                                onClick={() => setVisibleSeries(prev => ({ ...prev, total: !prev.total }))}
                                style={{
                                    borderRadius: '14px',
                                    padding: '3px 10px',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: visibleSeries.total ? '#EFF6FF' : '#F1F5F9',
                                    color: visibleSeries.total ? '#1D4ED8' : '#94A3B8',
                                    border: visibleSeries.total ? '1px solid #BFDBFE' : '1px solid #E2E8F0'
                                }}
                            >
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2563EB' }} />
                                Total {selectedModalidad === 'TODAS' ? 'General' : selectedModalidad}
                            </button>

                            {selectedModalidad === 'TODAS' ? (
                                <>
                                    {[
                                        { key: 'ECOGRAFIA', label: 'Ecografía (ECO)', color: '#06B6D4' },
                                        { key: 'RADIOLOGIA', label: 'Radiología (RX)', color: '#6366F1' },
                                        { key: 'MAMOGRAFIA', label: 'Mamografía', color: '#EC4899' },
                                        { key: 'TOMOGRAFIA', label: 'Tomografía (TC)', color: '#F59E0B' },
                                        { key: 'DENSITOMETRIA', label: 'Densitometría', color: '#10B981' }
                                    ].map(s => (
                                        <button
                                            key={s.key}
                                            onClick={() => setVisibleSeries(prev => ({ ...prev, [s.key]: !prev[s.key] }))}
                                            style={{
                                                borderRadius: '14px',
                                                padding: '3px 10px',
                                                fontSize: '0.72rem',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                background: visibleSeries[s.key] ? '#FFFFFF' : '#F8FAFC',
                                                color: visibleSeries[s.key] ? '#1E293B' : '#94A3B8',
                                                border: visibleSeries[s.key] ? `1px solid ${s.color}` : '1px solid #E2E8F0',
                                                opacity: visibleSeries[s.key] ? 1 : 0.6
                                            }}
                                        >
                                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color }} />
                                            {s.label}
                                        </button>
                                    ))}
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={() => setVisibleSeries(prev => ({ ...prev, ambulatorio: !prev.ambulatorio }))}
                                        style={{
                                            borderRadius: '14px',
                                            padding: '3px 10px',
                                            fontSize: '0.72rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            background: visibleSeries.ambulatorio ? '#ECFDF5' : '#F8FAFC',
                                            color: visibleSeries.ambulatorio ? '#047857' : '#94A3B8',
                                            border: visibleSeries.ambulatorio ? '1px solid #A7F3D0' : '1px solid #E2E8F0'
                                        }}
                                    >
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }} />
                                        Ambulatorio
                                    </button>

                                    <button
                                        onClick={() => setVisibleSeries(prev => ({ ...prev, hospitalizacion: !prev.hospitalizacion }))}
                                        style={{
                                            borderRadius: '14px',
                                            padding: '3px 10px',
                                            fontSize: '0.72rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            background: visibleSeries.hospitalizacion ? '#F5F3FF' : '#F8FAFC',
                                            color: visibleSeries.hospitalizacion ? '#6D28D9' : '#94A3B8',
                                            border: visibleSeries.hospitalizacion ? '1px solid #DDD6FE' : '1px solid #E2E8F0'
                                        }}
                                    >
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#8B5CF6' }} />
                                        Hospitalización
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Contenedor del Gráfico Recharts */}
                        <div style={{ width: '100%', height: '300px', marginTop: '6px' }}>
                            {loading ? (
                                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', gap: '8px' }}>
                                    <RefreshCw className="animate-spin" size={18} color={COLOR_PRIMARY} />
                                    <span style={{ fontSize: '0.85rem' }}>Cargando evolución temporal de estudios...</span>
                                </div>
                            ) : progressionChartData.length === 0 ? (
                                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }}>
                                    <Activity size={32} strokeWidth={1.5} style={{ marginBottom: '8px', opacity: 0.6 }} />
                                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>No hay datos de evolución temporal para el período seleccionado</span>
                                    <span style={{ fontSize: '0.75rem' }}>Verifique el rango de fechas seleccionado en la barra superior</span>
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={progressionChartData} margin={{ top: 12, right: 18, left: -10, bottom: 4 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                                        <XAxis 
                                            dataKey="label" 
                                            stroke="#94A3B8" 
                                            fontSize={11} 
                                            tickLine={false} 
                                            axisLine={{ stroke: '#E2E8F0' }} 
                                            minTickGap={14} 
                                        />
                                        <YAxis 
                                            stroke="#94A3B8" 
                                            fontSize={11} 
                                            tickLine={false} 
                                            axisLine={false} 
                                            tickFormatter={v => v.toLocaleString('es-AR')} 
                                        />
                                        <RechartsTooltip
                                            content={({ active, payload, label }) => {
                                                if (!active || !payload || !payload.length) return null;
                                                const pointData = payload[0]?.payload;
                                                return (
                                                    <div style={{
                                                        background: '#FFFFFF',
                                                        border: '1px solid #CBD5E1',
                                                        borderRadius: '10px',
                                                        padding: '10px 14px',
                                                        boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
                                                        fontSize: '0.78rem',
                                                        minWidth: '200px'
                                                    }}>
                                                        <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: '6px', borderBottom: '1px solid #F1F5F9', paddingBottom: '4px' }}>
                                                            {activeGranularity === 'dia' ? `Fecha: ${pointData?.fullDate || label}` : `Período: ${label}`}
                                                        </div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontWeight: 800, color: '#2563EB' }}>
                                                            <span>Total Estudios:</span>
                                                            <span>{(pointData?.total || 0).toLocaleString('es-AR')}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                            {payload.filter(p => p.dataKey !== 'total' && p.value > 0).map((p, idx) => (
                                                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', color: '#475569' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color || p.stroke }}></span>
                                                                        <span>{p.name}:</span>
                                                                    </div>
                                                                    <span style={{ fontWeight: 600, color: '#1E293B' }}>{p.value.toLocaleString('es-AR')}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            }}
                                        />

                                        {/* Series para TODAS LAS MODALIDADES */}
                                        {selectedModalidad === 'TODAS' && (
                                            <>
                                                {visibleSeries.total && (
                                                    <Line 
                                                        type="monotone" 
                                                        dataKey="total" 
                                                        name="Total General" 
                                                        stroke="#2563EB" 
                                                        strokeWidth={2.8} 
                                                        dot={{ r: 2.5, fill: '#2563EB' }} 
                                                        activeDot={{ r: 6 }} 
                                                    />
                                                )}
                                                {visibleSeries.ECOGRAFIA && (
                                                    <Line 
                                                        type="monotone" 
                                                        dataKey="ECOGRAFIA" 
                                                        name="Ecografía (ECO)" 
                                                        stroke="#06B6D4" 
                                                        strokeWidth={1.8} 
                                                        dot={false} 
                                                        activeDot={{ r: 5 }} 
                                                    />
                                                )}
                                                {visibleSeries.RADIOLOGIA && (
                                                    <Line 
                                                        type="monotone" 
                                                        dataKey="RADIOLOGIA" 
                                                        name="Radiología (RX)" 
                                                        stroke="#6366F1" 
                                                        strokeWidth={1.8} 
                                                        dot={false} 
                                                        activeDot={{ r: 5 }} 
                                                    />
                                                )}
                                                {visibleSeries.MAMOGRAFIA && (
                                                    <Line 
                                                        type="monotone" 
                                                        dataKey="MAMOGRAFIA" 
                                                        name="Mamografía" 
                                                        stroke="#EC4899" 
                                                        strokeWidth={1.8} 
                                                        dot={false} 
                                                        activeDot={{ r: 5 }} 
                                                    />
                                                )}
                                                {visibleSeries.TOMOGRAFIA && (
                                                    <Line 
                                                        type="monotone" 
                                                        dataKey="TOMOGRAFIA" 
                                                        name="Tomografía (TC)" 
                                                        stroke="#F59E0B" 
                                                        strokeWidth={1.8} 
                                                        dot={false} 
                                                        activeDot={{ r: 5 }} 
                                                    />
                                                )}
                                                {visibleSeries.DENSITOMETRIA && (
                                                    <Line 
                                                        type="monotone" 
                                                        dataKey="DENSITOMETRIA" 
                                                        name="Densitometría" 
                                                        stroke="#10B981" 
                                                        strokeWidth={1.8} 
                                                        dot={false} 
                                                        activeDot={{ r: 5 }} 
                                                    />
                                                )}
                                            </>
                                        )}

                                        {/* Series para MODALIDAD ESPECÍFICA */}
                                        {selectedModalidad !== 'TODAS' && (
                                            <>
                                                {visibleSeries.total && (
                                                    <Line 
                                                        type="monotone" 
                                                        dataKey="total" 
                                                        name={`Total ${selectedModalidad}`} 
                                                        stroke={MODALIDADES_TABS.find(t => t.id === selectedModalidad)?.badgeColor || '#2563EB'} 
                                                        strokeWidth={2.8} 
                                                        dot={{ r: 2.5, fill: MODALIDADES_TABS.find(t => t.id === selectedModalidad)?.badgeColor || '#2563EB' }} 
                                                        activeDot={{ r: 6 }} 
                                                    />
                                                )}
                                                {visibleSeries.ambulatorio && (
                                                    <Line 
                                                        type="monotone" 
                                                        dataKey="ambulatorio" 
                                                        name="Ambulatorio" 
                                                        stroke="#10B981" 
                                                        strokeWidth={1.8} 
                                                        dot={false} 
                                                        activeDot={{ r: 5 }} 
                                                    />
                                                )}
                                                {visibleSeries.hospitalizacion && (
                                                    <Line 
                                                        type="monotone" 
                                                        dataKey="hospitalizacion" 
                                                        name="Hospitalización" 
                                                        stroke="#8B5CF6" 
                                                        strokeWidth={1.8} 
                                                        dot={false} 
                                                        activeDot={{ r: 5 }} 
                                                    />
                                                )}
                                            </>
                                        )}
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* ─── GRID PRINCIPAL: TABLA DE AGENDAS + PANEL DE PROFUNDIZACIÓN ─── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', alignItems: 'start' }}>
                
                {/* 1. LISTA Y RANKING DE AGENDAS */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '14px',
                    border: '1px solid #E2E8F0',
                    padding: '16px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Calendar size={18} color={COLOR_PRIMARY} />
                            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0F172A' }}>
                                Ranking de Producción por Agenda
                            </h3>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                Mostrando {agendasSummaryList.length} agendas
                            </span>
                            <button
                                onClick={handleExportExcel}
                                disabled={loading || !agendasSummaryList.length}
                                title="Descargar reporte completo en Excel (.xlsx)"
                                style={{
                                    border: '1px solid #CBD5E1',
                                    background: '#F8FAFC',
                                    borderRadius: '6px',
                                    padding: '3px 8px',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    color: '#065F46',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                                }}
                            >
                                <FileSpreadsheet size={13} color="#059669" />
                                Excel
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
                            <RefreshCw className="animate-spin" size={24} style={{ margin: '0 auto 8px auto' }} />
                            <span>Cargando agendas de imágenes...</span>
                        </div>
                    ) : agendasSummaryList.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#94A3B8' }}>
                            <AlertCircle size={28} style={{ margin: '0 auto 8px auto' }} />
                            <span>No se encontraron agendas para los filtros seleccionados</span>
                        </div>
                    ) : (
                        <div style={{ maxHeight: '600px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {agendasSummaryList.map((item, idx) => {
                                const isSelected = selectedAgenda === item.agenda;
                                const pctTotal = totals.total > 0 ? ((item.total / totals.total) * 100).toFixed(1) : 0;
                                const pctAmb = item.total > 0 ? ((item.ambulatorio / item.total) * 100).toFixed(0) : 0;
                                const pctHosp = item.total > 0 ? ((item.hospitalizacion / item.total) * 100).toFixed(0) : 0;
                                const pctInf = item.total > 0 ? ((item.informados / item.total) * 100).toFixed(0) : 0;

                                return (
                                    <div
                                        key={item.agenda}
                                        onClick={() => setSelectedAgenda(isSelected ? 'TODAS' : item.agenda)}
                                        style={{
                                            padding: '12px 14px',
                                            borderRadius: '10px',
                                            border: `1.5px solid ${isSelected ? COLOR_PRIMARY : '#E2E8F0'}`,
                                            background: isSelected ? '#EFF6FF' : '#FFFFFF',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '8px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{
                                                    fontSize: '0.72rem',
                                                    fontWeight: 700,
                                                    color: '#64748B',
                                                    width: '20px'
                                                }}>
                                                    #{idx + 1}
                                                </span>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>
                                                    {item.agenda}
                                                </span>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <span style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0F172A' }}>
                                                    {item.total.toLocaleString('es-AR')}
                                                </span>
                                                <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                                    {pctTotal}% del volumen
                                                </div>
                                            </div>
                                        </div>

                                        {/* Barra comparativa Ambulatorio vs Hospitalización */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ flex: 1, height: '6px', background: '#F1F5F9', borderRadius: '999px', overflow: 'hidden', display: 'flex' }}>
                                                <div style={{ width: `${pctAmb}%`, background: COLOR_AMBULATORIO }}></div>
                                                <div style={{ width: `${pctHosp}%`, background: COLOR_HOSPITALIZADO }}></div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '6px', fontSize: '0.7rem', fontWeight: 600 }}>
                                                <span style={{ color: COLOR_AMBULATORIO }}>Amb: {pctAmb}%</span>
                                                <span style={{ color: COLOR_HOSPITALIZADO }}>Hosp: {pctHosp}%</span>
                                                <span style={{ color: COLOR_PRIMARY }}>Inf: {pctInf}%</span>
                                            </div>
                                        </div>

                                        {/* Sedes involucradas */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: '#64748B' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <MapPin size={12} />
                                                {Array.from(item.centros).slice(0, 3).join(', ') || 'Centro general'}
                                            </span>
                                            <span style={{ color: COLOR_PRIMARY, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                {isSelected ? 'Ocultar detalle' : 'Ver detalle'}
                                                <ChevronRight size={13} />
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 2. PANEL DE PROFUNDIZACIÓN (PRESTADORES, SOLICITANTES, INFORMANTES, OBRAS SOCIALES, CENTROS) */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '14px',
                    border: '1px solid #E2E8F0',
                    padding: '16px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0F172A' }}>
                                Desglose & Drill-down Clínico
                            </h3>
                            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px' }}>
                                {selectedAgenda === 'TODAS' ? (
                                    <span>Vista global para modalidad: <strong>{selectedModalidad}</strong></span>
                                ) : (
                                    <span style={{ color: COLOR_PRIMARY }}>Filtro activo: <strong>{selectedAgenda}</strong></span>
                                )}
                            </div>
                        </div>

                        {selectedAgenda !== 'TODAS' && (
                            <button
                                onClick={() => setSelectedAgenda('TODAS')}
                                style={{
                                    border: '1px solid #CBD5E1',
                                    background: '#FFFFFF',
                                    borderRadius: '6px',
                                    padding: '3px 8px',
                                    fontSize: '0.72rem',
                                    color: '#475569',
                                    cursor: 'pointer'
                                }}
                            >
                                Ver Todo
                            </button>
                        )}
                    </div>

                    {/* Sub-Pestañas de Detalle */}
                    <div style={{
                        display: 'flex',
                        background: '#F1F5F9',
                        padding: '3px',
                        borderRadius: '10px',
                        gap: '2px',
                        overflowX: 'auto'
                    }}>
                        {[
                            { id: 'prestadores', label: 'Realizan', icon: UserCheck },
                            { id: 'solicitantes', label: 'Solicitan', icon: UserPlus },
                            { id: 'informantes', label: 'Informan', icon: FileCheck2 },
                            { id: 'obras_sociales', label: 'Obras Sociales', icon: CreditCard },
                            { id: 'centros', label: 'Centros', icon: MapPin }
                        ].map(sub => {
                            const SubIcon = sub.icon;
                            const isSubActive = activeTabDetail === sub.id;
                            return (
                                <button
                                    key={sub.id}
                                    onClick={() => setActiveTabDetail(sub.id)}
                                    style={{
                                        flex: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '4px',
                                        border: 'none',
                                        padding: '6px 8px',
                                        borderRadius: '7px',
                                        fontSize: '0.74rem',
                                        fontWeight: isSubActive ? 700 : 600,
                                        cursor: 'pointer',
                                        background: isSubActive ? '#FFFFFF' : 'transparent',
                                        color: isSubActive ? COLOR_PRIMARY : '#64748B',
                                        boxShadow: isSubActive ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                                        transition: 'all 0.15s ease',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    <SubIcon size={13} />
                                    {sub.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Contenido según sub-pestaña */}
                    <div style={{ maxHeight: '530px', overflowY: 'auto' }}>
                        {/* A. PRESTADORES QUE LA REALIZAN */}
                        {activeTabDetail === 'prestadores' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                                    Profesionales médicos y técnicos que ejecutan la práctica:
                                </div>
                                {realizadoresRanking.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '30px', color: '#94A3B8' }}>
                                        Sin datos de prestadores realizadores
                                    </div>
                                ) : (
                                    realizadoresRanking.slice(0, 30).map((p, i) => (
                                        <div key={i} style={{ padding: '8px 10px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1E293B' }}>
                                                    {p.nombre}
                                                </span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>
                                                        {p.cantidad.toLocaleString('es-AR')}
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', color: '#64748B', marginLeft: '6px' }}>
                                                        ({p.porcentaje}%)
                                                    </span>
                                                </div>
                                            </div>
                                            <div style={{ width: '100%', height: '4px', background: '#E2E8F0', borderRadius: '999px', marginTop: '6px', overflow: 'hidden' }}>
                                                <div style={{ width: `${p.porcentaje}%`, height: '100%', background: COLOR_PRIMARY }}></div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {/* B. PRESTADORES QUE LA SOLICITAN */}
                        {activeTabDetail === 'solicitantes' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                                    Médicos derivadores que prescribieron el estudio:
                                </div>
                                {solicitantesRanking.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '30px', color: '#94A3B8' }}>
                                        Sin datos de médicos solicitantes
                                    </div>
                                ) : (
                                    solicitantesRanking.slice(0, 30).map((s, i) => (
                                        <div key={i} style={{ padding: '8px 10px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1E293B' }}>
                                                    {s.nombre}
                                                </span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>
                                                        {s.cantidad.toLocaleString('es-AR')}
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', color: '#64748B', marginLeft: '6px' }}>
                                                        ({s.porcentaje}%)
                                                    </span>
                                                </div>
                                            </div>
                                            <div style={{ width: '100%', height: '4px', background: '#E2E8F0', borderRadius: '999px', marginTop: '6px', overflow: 'hidden' }}>
                                                <div style={{ width: `${s.porcentaje}%`, height: '100%', background: '#6366F1' }}></div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {/* C. PRESTADORES QUE LA INFORMAN */}
                        {activeTabDetail === 'informantes' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                                    Especialistas que firman e informan el diagnóstico (Fecha Informado válida):
                                </div>
                                {informantesRanking.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '30px', color: '#94A3B8' }}>
                                        Sin informes firmados registrados en este filtro
                                    </div>
                                ) : (
                                    informantesRanking.slice(0, 30).map((inf, i) => (
                                        <div key={i} style={{ padding: '8px 10px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <CheckCircle2 size={14} color="#10B981" />
                                                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1E293B' }}>
                                                        {inf.nombre}
                                                    </span>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>
                                                        {inf.cantidad.toLocaleString('es-AR')}
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', color: '#64748B', marginLeft: '6px' }}>
                                                        ({inf.porcentaje}%)
                                                    </span>
                                                </div>
                                            </div>
                                            <div style={{ width: '100%', height: '4px', background: '#E2E8F0', borderRadius: '999px', marginTop: '6px', overflow: 'hidden' }}>
                                                <div style={{ width: `${inf.porcentaje}%`, height: '100%', background: '#10B981' }}></div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {/* D. OBRAS SOCIALES MÁS USADAS */}
                        {activeTabDetail === 'obras_sociales' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                                    Financiadores y convenios con mayor demanda:
                                </div>
                                {obrasSocialesRanking.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '30px', color: '#94A3B8' }}>
                                        Sin datos de financiadores
                                    </div>
                                ) : (
                                    obrasSocialesRanking.slice(0, 30).map((os, i) => (
                                        <div key={i} style={{ padding: '8px 10px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1E293B' }}>
                                                    {os.nombre}
                                                </span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>
                                                        {os.cantidad.toLocaleString('es-AR')}
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', color: '#64748B', marginLeft: '6px' }}>
                                                        ({os.porcentaje}%)
                                                    </span>
                                                </div>
                                            </div>
                                            <div style={{ width: '100%', height: '4px', background: '#E2E8F0', borderRadius: '999px', marginTop: '6px', overflow: 'hidden' }}>
                                                <div style={{ width: `${os.porcentaje}%`, height: '100%', background: '#F59E0B' }}></div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {/* E. CENTROS DONDE MÁS SE HACEN */}
                        {activeTabDetail === 'centros' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                                    Distribución física por centro o sede de atención:
                                </div>
                                {centrosRanking.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '30px', color: '#94A3B8' }}>
                                        Sin datos de centros
                                    </div>
                                ) : (
                                    centrosRanking.map((c, i) => (
                                        <div key={i} style={{ padding: '8px 10px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1E293B' }}>
                                                    {c.nombre}
                                                </span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>
                                                        {c.cantidad.toLocaleString('es-AR')}
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', color: '#64748B', marginLeft: '6px' }}>
                                                        ({c.porcentaje}%)
                                                    </span>
                                                </div>
                                            </div>
                                            <div style={{ width: '100%', height: '4px', background: '#E2E8F0', borderRadius: '999px', marginTop: '6px', overflow: 'hidden' }}>
                                                <div style={{ width: `${c.porcentaje}%`, height: '100%', background: '#0284C7' }}></div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>

            </div>

        </div>
    );
}
