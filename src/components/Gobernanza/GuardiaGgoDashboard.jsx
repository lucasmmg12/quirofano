import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Activity, Clock, AlertTriangle, CheckCircle2, RefreshCw, Download, Search,
    TrendingUp, ShieldCheck, Layers, Scissors, Stethoscope, Users, Calendar,
    Filter, ArrowRight, HeartPulse, BarChart3, FileSpreadsheet, Info, RotateCcw,
    Sparkles, ChevronLeft, ChevronRight
} from 'lucide-react';
import {
    ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis,
    CartesianGrid, Tooltip as RechartsTooltip, Legend, PieChart, Pie, Cell,
    ReferenceLine
} from 'recharts';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import GgoEmbudo3D from './GgoEmbudo3D';
import { AnilloToroidal3D } from './GobernanzaCharts3D';
import { GobernanzaBarraPulso, GobernanzaFlujoAnimado } from './GobernanzaPulseKit';

const SYNC_SERVER_URL = import.meta.env.VITE_SYNC_SERVER_URL || 'http://localhost:3001';

const TABS = [
    { id: 'resumen', label: 'Resumen Ejecutivo', icon: Activity },
    { id: 'cuello_botella', label: 'Cuello de Botella → Quirófano', icon: Scissors },
    { id: 'tiempos', label: 'Tiempos y Franjas', icon: Clock },
    { id: 'severidad', label: 'Severidad y Producción', icon: Layers },
    { id: 'calidad', label: 'Calidad y Eco Guardia', icon: ShieldCheck },
];

const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const DIAS_ORDEN = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const FRANJAS_ORDEN = ['08 a 14', '14 a 22', '22 a 08'];
const FRANJA_LABELS = {
    '08 a 14': 'Mañana (08–14 hs)',
    '14 a 22': 'Tarde (14–22 hs)',
    '22 a 08': 'Noche (22–08 hs)',
};

const CUELLO_LABELS = {
    ESPERA_MEDICO_GGO: { label: 'Espera Médico GGO', grupo: 'GGO', bg: '#DBEAFE', color: '#1E40AF' },
    ATENCION_GGO: { label: 'Atención GGO', grupo: 'GGO', bg: '#FCE7F3', color: '#9D174D' },
    ADMISION_PRE_QX: { label: 'Admisión Pre-Qx', grupo: 'POST_GGO', bg: '#FEF3C7', color: '#92400E' },
    ESPERA_QUIROFANO: { label: 'Espera Quirófano', grupo: 'POST_GGO', bg: '#FEE2E2', color: '#991B1B' },
};

function getCuelloMeta(val) {
    return CUELLO_LABELS[val] || { label: val || 'Post-GGO', grupo: 'POST_GGO', bg: '#FEF3C7', color: '#92400E' };
}

const TRAMO_COLORS = {
    t1: '#3B82F6', // Espera médico GGO
    t2: '#DB2777', // Atención médica GGO
    t3: '#F59E0B', // Post-GGO -> Admisión
    t4: '#DC2626', // Admisión -> Quirófano
};

const SLA_METAS = {
    N1: { label: 'N1 Emergencia', maxMin: 60, color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
    N2: { label: 'N2 Urgente', maxMin: 180, color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
    N3: { label: 'N3 Estándar', maxMin: 360, color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
};

function formatPeriodoLabel(ym) {
    if (!ym || ym.length < 7) return ym || '';
    const [y, m] = ym.split('-');
    const idx = parseInt(m, 10) - 1;
    return `${MESES_CORTO[idx] || m} ${y.slice(2)}`;
}

function fmtMin(val) {
    if (val === null || val === undefined || Number.isNaN(Number(val))) return '—';
    const n = Number(val);
    if (n >= 120) {
        const h = Math.floor(n / 60);
        const m = Math.round(n % 60);
        return `${h}h ${String(m).padStart(2, '0')}m`;
    }
    return `${Math.round(n)} min`;
}

function fmtNum(val, dec = 0) {
    if (val === null || val === undefined || Number.isNaN(Number(val))) return '—';
    return Number(val).toLocaleString('es-AR', {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
    });
}

function median(arr) {
    const valid = arr.filter(v => v !== null && v !== undefined && !Number.isNaN(Number(v))).map(Number).sort((a, b) => a - b);
    if (!valid.length) return null;
    const mid = Math.floor(valid.length / 2);
    return valid.length % 2 === 0 ? (valid[mid - 1] + valid[mid]) / 2 : valid[mid];
}

function percentile(arr, p) {
    const valid = arr.filter(v => v !== null && v !== undefined && !Number.isNaN(Number(v))).map(Number).sort((a, b) => a - b);
    if (!valid.length) return null;
    const idx = Math.min(valid.length - 1, Math.max(0, Math.ceil((p / 100) * valid.length) - 1));
    return valid[idx];
}

function formatDateTimeShort(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm} ${hh}:${mi}`;
}

async function fetchAllPaginated(table, queryBuilder, pageSize = 1000) {
    const all = [];
    let from = 0;
    while (true) {
        const { data, error } = await queryBuilder(supabase.from(table)).range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
    }
    return all;
}

export default function GuardiaGgoDashboard({
    fechaDesde,
    fechaHasta,
    datePresetMode,
    currentTab,
    onTabChange,
    addToast,
}) {
    const validTabIds = useMemo(() => TABS.map(t => t.id), []);
    const [activeTab, setActiveTab] = useState(() =>
        currentTab && validTabIds.includes(currentTab) ? currentTab : 'cuello_botella'
    );

    useEffect(() => {
        if (currentTab && validTabIds.includes(currentTab) && currentTab !== activeTab) {
            setActiveTab(currentTab);
        }
    }, [currentTab, validTabIds, activeTab]);

    const handleSelectTab = (tabId) => {
        setActiveTab(tabId);
        onTabChange?.(tabId);
    };

    // Estado de datos
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [resumenAll, setResumenAll] = useState([]);
    const [casosQx, setCasosQx] = useState([]);
    const [franjasRaw, setFranjasRaw] = useState([]);
    const [lastUpdated, setLastUpdated] = useState(null);

    // Filtros de Cuello de Botella
    const [soloUrgencias, setSoloUrgencias] = useState(true);
    const [filtroRama, setFiltroRama] = useState('TODAS');
    const [filtroPrioridad, setFiltroPrioridad] = useState('TODAS');
    const [filtroEco, setFiltroEco] = useState('TODAS');
    const [filtroCuello, setFiltroCuello] = useState('TODOS');
    const [busqueda, setBusqueda] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    // Período derivado del selector Telar
    const desdeYM = useMemo(() => (fechaDesde || '2026-01-01').slice(0, 7), [fechaDesde]);
    const hastaYM = useMemo(() => (fechaHasta || '2026-12-31').slice(0, 7), [fechaHasta]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [resumenRes, qxRows, franjasRows] = await Promise.all([
                supabase
                    .from('gob_ggo_resumen_mensual')
                    .select('*')
                    .order('periodo', { ascending: true }),
                fetchAllPaginated('gob_ggo_quirofano_tiempos', (q) =>
                    q.select('*')
                        .gte('periodo', desdeYM)
                        .lte('periodo', hastaYM)
                        .order('fecha_ggo', { ascending: false })
                ),
                fetchAllPaginated('gob_ggo_franjas_tiempos', (q) =>
                    q.select('*')
                        .gte('periodo', desdeYM)
                        .lte('periodo', hastaYM)
                ),
            ]);

            if (resumenRes.error) throw resumenRes.error;

            const resumenData = resumenRes.data || [];
            setResumenAll(resumenData);
            setCasosQx(qxRows || []);
            setFranjasRaw(franjasRows || []);

            const maxUpd = resumenData
                .map(r => r.updated_at)
                .filter(Boolean)
                .sort()
                .pop();
            setLastUpdated(maxUpd || null);
        } catch (err) {
            console.error('Error cargando datos de Guardia GGO:', err);
            addToast?.(`Error al cargar datos de Guardia GGO: ${err.message}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [desdeYM, hastaYM, addToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        setPage(1);
    }, [soloUrgencias, filtroRama, filtroPrioridad, filtroEco, filtroCuello, busqueda, desdeYM, hastaYM]);

    const handleSyncSalus = async () => {
        setSyncing(true);
        try {
            const resp = await fetch(`${SYNC_SERVER_URL}/api/salus/guardia-ggo/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ startYear: 2025 }),
            });
            const json = await resp.json();
            if (!resp.ok || !json.success) {
                throw new Error(json.error || 'Error al sincronizar con SALUS');
            }
            addToast?.(`Guardia GGO sincronizada: ${json.meses || 0} meses y ${json.casosQuirofano || 0} casos GGO→Qx.`, 'success');
            await loadData();
        } catch (err) {
            console.error('Sync GGO error:', err);
            addToast?.(`No se pudo sincronizar GGO: ${err.message}`, 'error');
        } finally {
            setSyncing(false);
        }
    };

    // Períodos filtrados por el Telar
    const resumenPeriodo = useMemo(
        () => resumenAll.filter(r => r.periodo >= desdeYM && r.periodo <= hastaYM),
        [resumenAll, desdeYM, hastaYM]
    );

    // Serie mensual para gráficos (si el rango es 1 solo mes, mostramos últimos 12 meses para contexto)
    const resumenGrafico = useMemo(() => {
        if (resumenPeriodo.length >= 2) return resumenPeriodo;
        return resumenAll.slice(-12);
    }, [resumenPeriodo, resumenAll]);

    // Casos base de Quirófano (con o sin programadas)
    const casosQxBase = useMemo(() => {
        return soloUrgencias ? casosQx.filter(c => c.es_urgencia_real) : casosQx;
    }, [casosQx, soloUrgencias]);

    // KPIs agregados del período
    const kpis = useMemo(() => {
        const totalConsultas = resumenPeriodo.reduce((s, r) => s + (r.total_consultas || 0), 0);
        const totalObst = resumenPeriodo.reduce((s, r) => s + (r.consultas_obstetricia || 0), 0);
        const totalGine = resumenPeriodo.reduce((s, r) => s + (r.consultas_ginecologia || 0), 0);
        const totalN1 = resumenPeriodo.reduce((s, r) => s + (r.consultas_n1 || 0), 0);
        const totalN2 = resumenPeriodo.reduce((s, r) => s + (r.consultas_n2 || 0), 0);
        const totalN3 = resumenPeriodo.reduce((s, r) => s + (r.consultas_n3 || 0), 0);
        const totalEco = resumenPeriodo.reduce((s, r) => s + (r.derivaciones_eco_guardia || 0), 0);
        const totalInt = resumenPeriodo.reduce((s, r) => s + (r.pases_internacion || 0), 0);
        const totalRecons = resumenPeriodo.reduce((s, r) => s + (r.reconsultas_72h || 0), 0);
        const totalQxUrg = resumenPeriodo.reduce((s, r) => s + (r.derivaciones_quirofano_urgencia || 0), 0);
        const totalQxProg = resumenPeriodo.reduce((s, r) => s + (r.derivaciones_quirofano_programadas_excluidas || 0), 0);

        const pctEco = totalConsultas > 0 ? (totalEco * 100) / totalConsultas : 0;
        const pctInt = totalConsultas > 0 ? (totalInt * 100) / totalConsultas : 0;
        const pctRecons = totalConsultas > 0 ? (totalRecons * 100) / totalConsultas : 0;
        const pctQxUrg = totalConsultas > 0 ? (totalQxUrg * 100) / totalConsultas : 0;

        // Tiempos GGO→Quirófano calculados directamente desde los casos nominales del universo activo
        const medT1 = median(casosQxBase.map(c => c.min_tramo1_puerta_medico)) ?? 0;
        const medT2 = median(casosQxBase.map(c => c.min_tramo2_atencion_ggo)) ?? 0;
        const medT3 = median(casosQxBase.map(c => c.min_tramo3_post_ggo_adm)) ?? 0;
        const medT4 = median(casosQxBase.map(c => c.min_tramo4_adm_quirofano)) ?? 0;
        const medGgo = median(casosQxBase.map(c => c.min_total_ggo)) ?? (medT1 + medT2);
        const medPostGgo = median(casosQxBase.map(c => c.min_total_post_ggo)) ?? (medT3 + medT4);
        const medPuertaQx = median(casosQxBase.map(c => c.min_total_puerta_qx));
        const p90PuertaQx = percentile(casosQxBase.map(c => c.min_total_puerta_qx), 90);

        const sumaTramos = medT1 + medT2 + medT3 + medT4;
        const pctGgoEnCuello = sumaTramos > 0 ? ((medT1 + medT2) * 100) / sumaTramos : 0;
        const pctPostGgoEnCuello = sumaTramos > 0 ? ((medT3 + medT4) * 100) / sumaTramos : 0;

        // Mediana de espera puerta->médico general de GGO (promedio ponderado de medianas mensuales)
        const medEsperaGgoGeneral = resumenPeriodo.length
            ? resumenPeriodo.reduce((s, r) => s + (Number(r.mediana_puerta_medico_min || 0) * (r.total_consultas || 0)), 0) / Math.max(1, totalConsultas)
            : 0;
        const medPermanenciaGgo = resumenPeriodo.length
            ? resumenPeriodo.reduce((s, r) => s + (Number(r.mediana_permanencia_ggo_min || 0) * (r.total_consultas || 0)), 0) / Math.max(1, totalConsultas)
            : 0;

        const casosConSla = casosQxBase.filter(c => c.cumple_meta !== null && c.cumple_meta !== undefined);
        const pctCumpleSla = casosConSla.length > 0
            ? (casosConSla.filter(c => c.cumple_meta).length * 100) / casosConSla.length
            : null;

        const casosConEco = casosQxBase.filter(c => c.tuvo_eco_guardia);
        const casosSinEco = casosQxBase.filter(c => !c.tuvo_eco_guardia);

        return {
            totalConsultas,
            totalObst,
            totalGine,
            totalN1,
            totalN2,
            totalN3,
            totalEco,
            pctEco,
            totalInt,
            pctInt,
            totalRecons,
            pctRecons,
            totalQxUrg,
            totalQxProg,
            pctQxUrg,
            medT1,
            medT2,
            medT3,
            medT4,
            medGgo,
            medPostGgo,
            medPuertaQx,
            p90PuertaQx,
            pctGgoEnCuello,
            pctPostGgoEnCuello,
            medEsperaGgoGeneral,
            medPermanenciaGgo,
            pctCumpleSla,
            casosConEcoCount: casosConEco.length,
            casosSinEcoCount: casosSinEco.length,
            medPuertaQxConEco: median(casosConEco.map(c => c.min_total_puerta_qx)),
            medPuertaQxSinEco: median(casosSinEco.map(c => c.min_total_puerta_qx)),
            medGgoConEco: median(casosConEco.map(c => c.min_total_ggo)),
            medGgoSinEco: median(casosSinEco.map(c => c.min_total_ggo)),
            medPostGgoConEco: median(casosConEco.map(c => c.min_total_post_ggo)),
            medPostGgoSinEco: median(casosSinEco.map(c => c.min_total_post_ggo)),
            medGgoAEco: median(casosConEco.map(c => c.min_ggo_a_eco)),
        };
    }, [resumenPeriodo, casosQxBase]);

    // Datos mensuales para gráficos
    const chartMensualData = useMemo(() => {
        return resumenGrafico.map(r => ({
            periodo: r.periodo,
            label: formatPeriodoLabel(r.periodo),
            ginecologia: r.consultas_ginecologia || 0,
            obstetricia: r.consultas_obstetricia || 0,
            total: r.total_consultas || 0,
            ecoGuardia: r.derivaciones_eco_guardia || 0,
            pctEco: Number(r.pct_eco_guardia || 0),
            qxUrgencia: r.derivaciones_quirofano_urgencia || 0,
            pctInt: Number(r.pct_internacion || 0),
            pctRecons: Number(r.pct_reconsultas_72h || 0),
            t1: Number(r.mediana_qx_tramo1_espera_ggo_min || 0),
            t2: Number(r.mediana_qx_tramo2_atencion_ggo_min || 0),
            t3: Number(r.mediana_qx_tramo3_post_ggo_adm_min || 0),
            t4: Number(r.mediana_qx_tramo4_adm_qx_min || 0),
            totalQxMin: Number(r.mediana_qx_total_puerta_qx_min || 0),
        }));
    }, [resumenGrafico]);

    // Desglose por Severidad (N1/N2/N3), Rama y Franja en casos GGO→Qx
    const desgloseSla = useMemo(() => {
        return ['N1', 'N2', 'N3'].map(prio => {
            const sub = casosQxBase.filter(c => c.prioridad === prio);
            const medTotal = median(sub.map(c => c.min_total_puerta_qx));
            const medGgo = median(sub.map(c => c.min_total_ggo));
            const medPost = median(sub.map(c => c.min_total_post_ggo));
            const cumplen = sub.filter(c => c.cumple_meta === true).length;
            const pctCumple = sub.length > 0 ? (cumplen * 100) / sub.length : null;
            return {
                prioridad: prio,
                ...SLA_METAS[prio],
                count: sub.length,
                medTotal,
                medGgo,
                medPost,
                cumplen,
                pctCumple,
            };
        });
    }, [casosQxBase]);

    const desgloseRama = useMemo(() => {
        return ['OBSTETRICIA', 'GINECOLOGIA'].map(rama => {
            const sub = casosQxBase.filter(c => c.rama === rama);
            return {
                rama,
                label: rama === 'OBSTETRICIA' ? 'Obstetricia' : 'Ginecología',
                count: sub.length,
                conEco: sub.filter(c => c.tuvo_eco_guardia).length,
                medGgo: median(sub.map(c => c.min_total_ggo)),
                medPost: median(sub.map(c => c.min_total_post_ggo)),
                medTotal: median(sub.map(c => c.min_total_puerta_qx)),
            };
        });
    }, [casosQxBase]);

    // Franjas horarias y días de la semana agregados (usando dia_semana === 'TODOS' para evitar doble conteo)
    const franjasAgg = useMemo(() => {
        return FRANJAS_ORDEN.map(franja => {
            const rowsTodos = franjasRaw.filter(r => r.franja_horaria === franja && r.dia_semana === 'TODOS');
            const rows = rowsTodos.length > 0 ? rowsTodos : franjasRaw.filter(r => r.franja_horaria === franja && r.dia_semana !== 'TODOS');
            const total = rows.reduce((s, r) => s + (r.total_consultas || 0), 0);
            const obst = rows.reduce((s, r) => s + (r.consultas_obstetricia || 0), 0);
            const gine = rows.reduce((s, r) => s + (r.consultas_ginecologia || 0), 0);
            const eco = rows.reduce((s, r) => s + (r.derivaciones_eco || 0), 0);
            const qx = rows.reduce((s, r) => s + (r.derivaciones_qx || 0), 0);
            const medEspera = total > 0
                ? rows.reduce((s, r) => s + Number(r.mediana_puerta_medico_min || 0) * (r.total_consultas || 0), 0) / total
                : 0;
            const medPerm = total > 0
                ? rows.reduce((s, r) => s + Number(r.mediana_permanencia_min || 0) * (r.total_consultas || 0), 0) / total
                : 0;
            const subQx = casosQxBase.filter(c => c.franja_horaria === franja);
            return {
                franja,
                label: FRANJA_LABELS[franja] || franja,
                total,
                obst,
                gine,
                eco,
                qx,
                medEspera,
                medPerm,
                qxCasos: subQx.length,
                medPuertaQx: median(subQx.map(c => c.min_total_puerta_qx)),
                medGgoQx: median(subQx.map(c => c.min_total_ggo)),
                medPostQx: median(subQx.map(c => c.min_total_post_ggo)),
            };
        });
    }, [franjasRaw, casosQxBase]);

    // Matriz Franja × Día de la Semana
    const matrizFranjaDia = useMemo(() => {
        const map = {};
        for (const f of FRANJAS_ORDEN) {
            map[f] = {};
            for (const d of DIAS_ORDEN) {
                const rows = franjasRaw.filter(r => r.franja_horaria === f && r.dia_semana === d);
                const total = rows.reduce((s, r) => s + (r.total_consultas || 0), 0);
                const perm = total > 0
                    ? rows.reduce((s, r) => s + Number(r.mediana_permanencia_min || 0) * (r.total_consultas || 0), 0) / total
                    : 0;
                map[f][d] = { total, perm };
            }
        }
        return map;
    }, [franjasRaw]);

    const diasAgg = useMemo(() => {
        return DIAS_ORDEN.map(dia => {
            const rows = franjasRaw.filter(r => r.dia_semana === dia);
            const total = rows.reduce((s, r) => s + (r.total_consultas || 0), 0);
            const eco = rows.reduce((s, r) => s + (r.derivaciones_eco || 0), 0);
            const qx = rows.reduce((s, r) => s + (r.derivaciones_qx || 0), 0);
            const medEspera = total > 0
                ? rows.reduce((s, r) => s + Number(r.mediana_puerta_medico_min || 0) * (r.total_consultas || 0), 0) / total
                : 0;
            const medPerm = total > 0
                ? rows.reduce((s, r) => s + Number(r.mediana_permanencia_min || 0) * (r.total_consultas || 0), 0) / total
                : 0;
            return {
                dia,
                diaCorto: dia.slice(0, 3),
                total,
                eco,
                qx,
                medEspera: Number(medEspera.toFixed(1)),
                medPerm: Number(medPerm.toFixed(1)),
            };
        });
    }, [franjasRaw]);

    // Rankings de médicos y obras sociales agregando los JSON del período (soportando { nombre, count } y fallback)
    const topMedicos = useMemo(() => {
        const map = new Map();
        for (const r of resumenPeriodo) {
            const arr = Array.isArray(r.top_medicos_json) ? r.top_medicos_json : [];
            for (const item of arr) {
                const key = item.nombre || item.medico || 'Sin especificar';
                const cnt = Number(item.count ?? item.consultas ?? 0);
                map.set(key, (map.get(key) || 0) + cnt);
            }
        }
        return Array.from(map.entries())
            .map(([medico, consultas]) => ({ medico, consultas }))
            .sort((a, b) => b.consultas - a.consultas)
            .slice(0, 12);
    }, [resumenPeriodo]);

    const topObrasSociales = useMemo(() => {
        const map = new Map();
        for (const r of resumenPeriodo) {
            const arr = Array.isArray(r.top_obras_sociales_json) ? r.top_obras_sociales_json : [];
            for (const item of arr) {
                const key = item.nombre || item.obra_social || 'Sin especificar';
                const cnt = Number(item.count ?? item.consultas ?? 0);
                map.set(key, (map.get(key) || 0) + cnt);
            }
        }
        return Array.from(map.entries())
            .map(([obra_social, consultas]) => ({ obra_social, consultas }))
            .sort((a, b) => b.consultas - a.consultas)
            .slice(0, 12);
    }, [resumenPeriodo]);

    // Tabla nominal filtrada de GGO → Quirófano
    const casosFiltrados = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        return casosQxBase.filter(c => {
            if (filtroRama !== 'TODAS' && c.rama !== filtroRama) return false;
            if (filtroPrioridad !== 'TODAS' && c.prioridad !== filtroPrioridad) return false;
            if (filtroEco === 'CON_ECO' && !c.tuvo_eco_guardia) return false;
            if (filtroEco === 'SIN_ECO' && c.tuvo_eco_guardia) return false;
            if (filtroCuello !== 'TODOS') {
                const metaC = getCuelloMeta(c.cuello_botella_dominante);
                if (filtroCuello === 'GGO' && metaC.grupo !== 'GGO') return false;
                if (filtroCuello === 'POST_GGO' && metaC.grupo !== 'POST_GGO') return false;
                if (filtroCuello !== 'GGO' && filtroCuello !== 'POST_GGO' && c.cuello_botella_dominante !== filtroCuello) return false;
            }
            if (q) {
                const hay = [
                    c.paciente, c.nhc, c.dni, c.obra_social, c.nombre_cirugia,
                    c.cirujano, c.medico_ggo, c.numero_admision, c.eco_guardia_tipo
                ].filter(Boolean).join(' ').toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [casosQxBase, filtroRama, filtroPrioridad, filtroEco, filtroCuello, busqueda]);

    const totalPages = Math.max(1, Math.ceil(casosFiltrados.length / pageSize));
    const casosPagina = useMemo(() => {
        const start = (page - 1) * pageSize;
        return casosFiltrados.slice(start, start + pageSize);
    }, [casosFiltrados, page, pageSize]);

    // Exportación Excel
    const handleExportExcelNominal = () => {
        if (!casosFiltrados.length) {
            addToast?.('No hay registros GGO → Quirófano para exportar con los filtros actuales.', 'info');
            return;
        }
        const rows = casosFiltrados.map(c => ({
            'Período': c.periodo,
            'Fecha GGO': formatDateTimeShort(c.t0_entrada_ggo || c.fecha_ggo),
            'Franja': c.franja_horaria,
            'Día': c.dia_semana,
            'Paciente': c.paciente,
            'NHC': c.nhc,
            'DNI': c.dni,
            'Obra Social': c.obra_social,
            'Rama': c.rama,
            'Prioridad': c.prioridad,
            'Tipo Visita GGO': c.tipo_visita_ggo,
            'Médico GGO': c.medico_ggo,
            'Tuvo Eco Guardia': c.tuvo_eco_guardia ? 'SÍ' : 'NO',
            'Tipo Eco Guardia': c.eco_guardia_tipo || '',
            'Min GGO → Eco': c.min_ggo_a_eco ?? '',
            'N° Admisión': c.numero_admision || '',
            'Cirugía': c.nombre_cirugia,
            'Cirujano': c.cirujano,
            'Es Urgencia Real': c.es_urgencia_real ? 'SÍ' : 'Programada',
            'T1 Puerta→Médico (min)': c.min_tramo1_puerta_medico ?? '',
            'T2 Atención GGO (min)': c.min_tramo2_atencion_ggo ?? '',
            'T3 Salida→Admisión (min)': c.min_tramo3_post_ggo_adm ?? '',
            'T4 Admisión→Quirófano (min)': c.min_tramo4_adm_quirofano ?? '',
            'Total GGO (min)': c.min_total_ggo ?? '',
            'Total Post-GGO (min)': c.min_total_post_ggo ?? '',
            'Total Puerta→Quirófano (min)': c.min_total_puerta_qx ?? '',
            'Cuello Dominante': c.cuello_botella_dominante || '',
            'Cumple SLA': c.cumple_meta === true ? 'CUMPLE' : c.cumple_meta === false ? 'EXCEDE' : 'S/D',
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'GGO_a_Quirofano');
        XLSX.writeFile(wb, `Guardia_GGO_CuelloBotella_Qx_${desdeYM}_a_${hastaYM}.xlsx`);
        addToast?.(`Exportados ${rows.length} casos GGO → Quirófano a Excel.`, 'success');
    };

    const handleExportResumenMensual = () => {
        if (!resumenPeriodo.length) return;
        const rows = resumenPeriodo.map(r => ({
            'Período': r.periodo,
            'Total Consultas GGO': r.total_consultas,
            'Obstetricia': r.consultas_obstetricia,
            'Ginecología': r.consultas_ginecologia,
            'N1': r.consultas_n1,
            'N2': r.consultas_n2,
            'N3': r.consultas_n3,
            'Derivaciones Eco Guardia': r.derivaciones_eco_guardia,
            '% Eco Guardia': r.pct_eco_guardia,
            'Pases Internación': r.pases_internacion,
            '% Internación': r.pct_internacion,
            'Qx Urgencia': r.derivaciones_quirofano_urgencia,
            'Qx Programadas Excluidas': r.derivaciones_quirofano_programadas_excluidas,
            '% Conversión Qx': r.pct_conversion_quirofano,
            'Mediana Espera GGO (min)': r.mediana_puerta_medico_min,
            'Mediana Permanencia GGO (min)': r.mediana_permanencia_ggo_min,
            'Qx T1 Espera GGO (min)': r.mediana_qx_tramo1_espera_ggo_min,
            'Qx T2 Atención GGO (min)': r.mediana_qx_tramo2_atencion_ggo_min,
            'Qx T3 Post-GGO Adm (min)': r.mediana_qx_tramo3_post_ggo_adm_min,
            'Qx T4 Adm→Qx (min)': r.mediana_qx_tramo4_adm_qx_min,
            'Qx Total Puerta→Qx (min)': r.mediana_qx_total_puerta_qx_min,
            'Reconsultas 72h': r.reconsultas_72h,
            '% Reconsultas 72h': r.pct_reconsultas_72h,
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Resumen_Mensual_GGO');
        XLSX.writeFile(wb, `Guardia_GGO_Resumen_${desdeYM}_a_${hastaYM}.xlsx`);
        addToast?.('Resumen mensual de Guardia GGO exportado a Excel.', 'success');
    };

    // Veredicto automático del cuello de botella
    const veredicto = useMemo(() => {
        if (kpis.medPuertaQx === null) {
            return {
                tipo: 'neutral',
                titulo: 'Sin datos quirúrgicos suficientes en el período',
                detalle: 'Amplía el rango de fechas en el selector superior para analizar el flujo GGO → Quirófano.',
            };
        }
        if (kpis.pctPostGgoEnCuello >= 60) {
            return {
                tipo: 'post_ggo',
                titulo: `El cuello de botella NO está en Guardia GGO: el ${fmtNum(kpis.pctPostGgoEnCuello, 1)}% del tiempo ocurre POST-GGO (Admisión + Espera de Quirófano)`,
                detalle: `Mediana total Puerta GGO → Inicio Quirófano: ${fmtMin(kpis.medPuertaQx)}. La guardia GGO resuelve su parte en ${fmtMin(kpis.medT1 + kpis.medT2)} (${fmtNum(kpis.pctGgoEnCuello, 1)}%), mientras que el tramo posterior insume ${fmtMin(kpis.medT3 + kpis.medT4)} (Admisión→Quirófano: ${fmtMin(kpis.medT4)}).`,
            };
        }
        if (kpis.pctGgoEnCuello >= 55) {
            return {
                tipo: 'ggo',
                titulo: `Alerta de Cuello de Botella en Guardia GGO: el ${fmtNum(kpis.pctGgoEnCuello, 1)}% del tiempo se concentra dentro de la Guardia`,
                detalle: `Mediana total Puerta GGO → Quirófano: ${fmtMin(kpis.medPuertaQx)}. Tiempo interno GGO: ${fmtMin(kpis.medT1 + kpis.medT2)} vs Post-GGO: ${fmtMin(kpis.medT3 + kpis.medT4)}.`,
            };
        }
        return {
            tipo: 'mixto',
            titulo: `Cuello de Botella Compartido (${fmtNum(kpis.pctGgoEnCuello, 1)}% GGO / ${fmtNum(kpis.pctPostGgoEnCuello, 1)}% Post-GGO)`,
            detalle: `Mediana total Puerta GGO → Quirófano: ${fmtMin(kpis.medPuertaQx)}. Se requiere coordinación conjunta entre Guardia GGO, Admisión y Centro Quirúrgico.`,
        };
    }, [kpis]);

    if (loading && resumenAll.length === 0) {
        return (
            <div style={{ padding: '48px', textAlign: 'center', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <RefreshCw className="animate-spin" size={28} style={{ color: '#003B73', margin: '0 auto 12px' }} />
                <p style={{ color: '#475569', fontSize: '14px', fontWeight: 500 }}>Cargando indicadores de Guardia Gineco-Obstétrica...</p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
            {/* ── HEADER CLÍNICO LIMPIO (Estética Calidad-QOAG · sin badges duplicados) ── */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '14px 18px',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        width: '36px', height: '36px', borderRadius: '9px',
                        background: '#EFF6FF', border: '1px solid #BFDBFE',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#003B73'
                    }}>
                        <HeartPulse size={19} />
                    </div>
                    <h2 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800, color: '#0F172A' }}>
                        Guardia Gineco-Obstétrica (GGO)
                    </h2>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={handleExportExcelNominal}
                        title="Exportar Excel GGO → Quirófano"
                        style={{
                            width: '34px', height: '34px', borderRadius: '8px',
                            border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#003B73',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                        }}
                    >
                        <FileSpreadsheet size={16} />
                    </button>
                    <button
                        type="button"
                        onClick={handleSyncSalus}
                        disabled={syncing}
                        title="Sincronizar datos desde SALUS"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            background: '#003B73', color: '#FFFFFF', border: 'none',
                            borderRadius: '8px', padding: '7px 12px', fontSize: '12px', fontWeight: 700,
                            cursor: syncing ? 'wait' : 'pointer', height: '34px'
                        }}
                    >
                        <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
                        {syncing ? 'Sincronizando...' : 'Sincronizar'}
                    </button>
                </div>
            </div>

            {/* ── BARRA DE PULSO ANIMADA (Estándar DxI) ── */}
            <GobernanzaBarraPulso
                loading={loading}
                items={[
                    {
                        key: 'ggo_total',
                        label: 'Consultas GGO',
                        value: Number(kpis.totalConsultas) || 0,
                        sub: `Obst: ${fmtNum(kpis.totalObst)} · Gine: ${fmtNum(kpis.totalGine)}`,
                        accentColor: '#003B73',
                    },
                    {
                        key: 'ggo_eco',
                        label: 'Derivación Eco Guardia',
                        value: Number(kpis.totalEco) || 0,
                        ringPct: Number(kpis.pctEco) || 0,
                        sub: `${fmtNum(kpis.pctEco, 1)}% del total`,
                        accentColor: '#0284C7',
                    },
                    {
                        key: 'ggo_qx',
                        label: 'Cirugías Urgencia ≤48h',
                        value: Number(kpis.totalQxUrg) || 0,
                        sub: `${fmtNum(kpis.pctQxUrg, 1)}% · Int: ${fmtNum(kpis.totalInt)}`,
                        accentColor: '#003B73',
                    },
                    {
                        key: 'ggo_med',
                        label: 'Mediana Puerta → Qx',
                        value: fmtMin(kpis.medPuertaQx),
                        sub: `GGO ${fmtNum(kpis.pctGgoEnCuello, 0)}% · Post ${fmtNum(kpis.pctPostGgoEnCuello, 0)}%`,
                        accentColor: '#1E40AF',
                    },
                ]}
            />

            {/* ── HERO #1 ANILLO 3D + FLUJO ANIMADO EN TAB RESUMEN ── */}
            {activeTab === 'resumen' && (Number(kpis.totalConsultas) || 0) > 0 && (
                <>
                    <AnilloToroidal3D
                        segments={[
                            {
                                label: 'Obstetricia',
                                value: Number(kpis.totalObst) || 0,
                                valueLabel: fmtNum(kpis.totalObst),
                                rgb: [0, 59, 115],
                                detail: `${((Number(kpis.totalObst || 0) * 100) / Math.max(1, Number(kpis.totalConsultas || 1))).toFixed(1)}% del total`,
                                narrative: `Obstetricia representa ${fmtNum(kpis.totalObst)} consultas en Guardia GGO durante el período analizado, concentrando el principal volumen asistencial materno-fetal.`,
                                onFilterBoard: () => handleSelectTab('cuello_botella'),
                            },
                            {
                                label: 'Ginecología',
                                value: Number(kpis.totalGine) || 0,
                                valueLabel: fmtNum(kpis.totalGine),
                                rgb: [2, 132, 199],
                                detail: `${((Number(kpis.totalGine || 0) * 100) / Math.max(1, Number(kpis.totalConsultas || 1))).toFixed(1)}% del total`,
                                narrative: `Ginecología registra ${fmtNum(kpis.totalGine)} consultas de urgencia en el período, con derivación selectiva a Ecografía de Guardia y Quirófano según severidad.`,
                                onFilterBoard: () => handleSelectTab('severidad'),
                            },
                        ].filter(s => s.value > 0)}
                    />
                    <GobernanzaFlujoAnimado
                        title="Flujo de Resolución GGO → Eco Guardia · Internación · Quirófano"
                        originLabel="CONSULTAS GGO"
                        originValue={Number(kpis.totalConsultas) || 0}
                        branches={[
                            { key: 'eco', label: 'Derivación a Ecografía de Guardia', count: Number(kpis.totalEco) || 0, color: '#0284C7' },
                            { key: 'int', label: 'Internaciones desde GGO', count: Number(kpis.totalInt) || 0, color: '#1E40AF' },
                            { key: 'qx', label: 'Cirugías de Urgencia (≤48h)', count: Number(kpis.totalQxUrg) || 0, color: '#003B73' },
                            { key: 'alta', label: 'Resolución Ambulatoria Directa', count: Math.max(0, (Number(kpis.totalConsultas) || 0) - (Number(kpis.totalInt) || 0) - (Number(kpis.totalQxUrg) || 0)), color: '#64748B' },
                        ]}
                    />
                </>
            )}

            {/* ── NAVEGACIÓN DE PESTAÑAS ── */}
            <div style={{
                display: 'flex', flexWrap: 'wrap', gap: '6px',
                background: '#FFFFFF', padding: '8px', borderRadius: '10px',
                border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
            }}>
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => handleSelectTab(tab.id)}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '7px',
                                padding: '8px 14px', borderRadius: '8px', fontSize: '13px',
                                fontWeight: isActive ? 700 : 600, cursor: 'pointer',
                                border: isActive ? '1px solid #003B73' : '1px solid transparent',
                                background: isActive ? '#003B73' : 'transparent',
                                color: isActive ? '#FFFFFF' : '#475569',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            <Icon size={15} />
                            {tab.label}
                            {tab.id === 'cuello_botella' && (
                                <span style={{
                                    fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '999px',
                                    background: isActive ? 'rgba(255,255,255,0.22)' : '#FCE7F3',
                                    color: isActive ? '#FFFFFF' : '#BE185D'
                                }}>
                                    CLAVE
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* TAB 1: RESUMEN EJECUTIVO                                        */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'resumen' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Banner Veredicto Cuello de Botella */}
                    <div style={{
                        background: veredicto.tipo === 'post_ggo' ? '#FFFBEB' : veredicto.tipo === 'ggo' ? '#FEF2F2' : '#F8FAFC',
                        border: `1px solid ${veredicto.tipo === 'post_ggo' ? '#FCD34D' : veredicto.tipo === 'ggo' ? '#FCA5A5' : '#CBD5E1'}`,
                        borderRadius: '10px', padding: '16px 20px',
                        display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '14px'
                    }}>
                        <div style={{ flex: '1 1 500px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <AlertTriangle size={18} style={{ color: veredicto.tipo === 'ggo' ? '#DC2626' : '#D97706' }} />
                                <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{veredicto.titulo}</span>
                            </div>
                            <p style={{ margin: 0, fontSize: '13px', color: '#334155', lineHeight: 1.5 }}>{veredicto.detalle}</p>
                        </div>
                        <button
                            onClick={() => handleSelectTab('cuello_botella')}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                background: '#003B73', color: '#FFFFFF', border: 'none',
                                borderRadius: '8px', padding: '9px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer'
                            }}
                        >
                            Ver Auditoría Cuello de Botella
                            <ArrowRight size={14} />
                        </button>
                    </div>

                    {/* Gráficos lado a lado */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: '16px' }}>
                        <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '18px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                                        Evolución Mensual: Consultas GGO vs Eco Guardia y Quirófano
                                    </h3>
                                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>
                                        Barras apiladas (Ginecología + Obstetricia) y líneas de derivación
                                    </p>
                                </div>
                            </div>
                            <div style={{ height: 290 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={chartMensualData} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#475569' }} />
                                        <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#475569' }} />
                                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#DB2777' }} />
                                        <RechartsTooltip />
                                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                                        <Bar yAxisId="left" dataKey="ginecologia" stackId="a" name="Ginecología" fill="#1E40AF" radius={[0, 0, 0, 0]} />
                                        <Bar yAxisId="left" dataKey="obstetricia" stackId="a" name="Obstetricia" fill="#EC4899" radius={[4, 4, 0, 0]} />
                                        <Line yAxisId="right" type="monotone" dataKey="ecoGuardia" name="Deriv. Eco Guardia" stroke="#7C3AED" strokeWidth={2.5} dot={{ r: 3 }} />
                                        <Line yAxisId="right" type="monotone" dataKey="qxUrgencia" name="Qx Urgencia" stroke="#DC2626" strokeWidth={2.5} dot={{ r: 3 }} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '18px' }}>
                            <div style={{ marginBottom: '12px' }}>
                                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                                    Descomposición Mensual Puerta GGO → Quirófano (Mediana min)
                                </h3>
                                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>
                                    Tiempo en GGO (Azul/Rosa) vs Post-GGO Admisión y Quirófano (Ámbar/Rojo)
                                </p>
                            </div>
                            <div style={{ height: 290 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartMensualData} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#475569' }} />
                                        <YAxis tick={{ fontSize: 11, fill: '#475569' }} unit="m" />
                                        <RechartsTooltip formatter={(v) => [`${fmtNum(v, 1)} min`]} />
                                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                                        <Bar dataKey="t1" stackId="qx" name="T1 Espera Médico GGO" fill={TRAMO_COLORS.t1} />
                                        <Bar dataKey="t2" stackId="qx" name="T2 Atención GGO" fill={TRAMO_COLORS.t2} />
                                        <Bar dataKey="t3" stackId="qx" name="T3 Salida → Admisión" fill={TRAMO_COLORS.t3} />
                                        <Bar dataKey="t4" stackId="qx" name="T4 Admisión → Quirófano" fill={TRAMO_COLORS.t4} radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Tabla Consolidada Mensual */}
                    <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '18px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                                Matriz Mensual Consolidada — Guardia GGO
                            </h3>
                            <button
                                onClick={handleExportResumenMensual}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    background: '#F1F5F9', color: '#0F172A', border: '1px solid #CBD5E1',
                                    borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
                                }}
                            >
                                <Download size={14} /> Exportar Resumen
                            </button>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                    <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#334155' }}>
                                        <th style={{ padding: '10px 8px', textAlign: 'left' }}>Período</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>Consultas</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>Obst / Gine</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>Eco Guardia</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>Internación</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>Qx Urgencia</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>T. GGO (Qx)</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>T. Post-GGO (Qx)</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>Med. Puerta→Qx</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>Recons. 72h</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...resumenPeriodo].reverse().map(r => {
                                        const ggoMin = Number(r.mediana_qx_tramo1_espera_ggo_min || 0) + Number(r.mediana_qx_tramo2_atencion_ggo_min || 0);
                                        const postMin = Number(r.mediana_qx_tramo3_post_ggo_adm_min || 0) + Number(r.mediana_qx_tramo4_adm_qx_min || 0);
                                        return (
                                            <tr key={r.periodo} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                <td style={{ padding: '9px 8px', fontWeight: 700, color: '#003B73' }}>{formatPeriodoLabel(r.periodo)}</td>
                                                <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 700 }}>{fmtNum(r.total_consultas)}</td>
                                                <td style={{ padding: '9px 8px', textAlign: 'right', color: '#475569' }}>
                                                    {fmtNum(r.consultas_obstetricia)} / {fmtNum(r.consultas_ginecologia)}
                                                </td>
                                                <td style={{ padding: '9px 8px', textAlign: 'right' }}>
                                                    <span style={{ background: '#F3E8FF', color: '#6D28D9', padding: '2px 7px', borderRadius: '6px', fontWeight: 700 }}>
                                                        {fmtNum(r.derivaciones_eco_guardia)} ({fmtNum(r.pct_eco_guardia, 1)}%)
                                                    </span>
                                                </td>
                                                <td style={{ padding: '9px 8px', textAlign: 'right' }}>
                                                    {fmtNum(r.pases_internacion)} ({fmtNum(r.pct_internacion, 1)}%)
                                                </td>
                                                <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 700, color: '#1E40AF' }}>
                                                    {fmtNum(r.derivaciones_quirofano_urgencia)}
                                                </td>
                                                <td style={{ padding: '9px 8px', textAlign: 'right', color: '#BE185D', fontWeight: 600 }}>
                                                    {fmtMin(ggoMin)}
                                                </td>
                                                <td style={{ padding: '9px 8px', textAlign: 'right', color: '#DC2626', fontWeight: 700 }}>
                                                    {fmtMin(postMin)}
                                                </td>
                                                <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 800, color: '#0F172A' }}>
                                                    {fmtMin(r.mediana_qx_total_puerta_qx_min)}
                                                </td>
                                                <td style={{ padding: '9px 8px', textAlign: 'right', color: Number(r.pct_reconsultas_72h) > 7 ? '#DC2626' : '#059669', fontWeight: 700 }}>
                                                    {fmtNum(r.pct_reconsultas_72h, 1)}%
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* TAB 2: CUELLO DE BOTELLA → QUIRÓFANO (PROTAGONISTA)             */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'cuello_botella' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Veredicto + Toggle Urgencias vs Todas */}
                    <div style={{
                        background: veredicto.tipo === 'post_ggo' ? '#FFFBEB' : veredicto.tipo === 'ggo' ? '#FEF2F2' : '#F8FAFC',
                        border: `1px solid ${veredicto.tipo === 'post_ggo' ? '#FCD34D' : veredicto.tipo === 'ggo' ? '#FCA5A5' : '#CBD5E1'}`,
                        borderRadius: '10px', padding: '16px 20px',
                    }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <AlertTriangle size={19} style={{ color: veredicto.tipo === 'ggo' ? '#DC2626' : '#D97706' }} />
                                <span style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{veredicto.titulo}</span>
                            </div>
                            <div style={{ display: 'inline-flex', background: '#FFFFFF', borderRadius: '8px', padding: '3px', border: '1px solid #CBD5E1' }}>
                                <button
                                    onClick={() => setSoloUrgencias(true)}
                                    style={{
                                        padding: '5px 11px', borderRadius: '6px', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                                        background: soloUrgencias ? '#003B73' : 'transparent',
                                        color: soloUrgencias ? '#FFFFFF' : '#475569'
                                    }}
                                >
                                    Solo Urgencias Reales ({casosQx.filter(c => c.es_urgencia_real).length})
                                </button>
                                <button
                                    onClick={() => setSoloUrgencias(false)}
                                    style={{
                                        padding: '5px 11px', borderRadius: '6px', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                                        background: !soloUrgencias ? '#003B73' : 'transparent',
                                        color: !soloUrgencias ? '#FFFFFF' : '#475569'
                                    }}
                                >
                                    Todas ≤48h ({casosQx.length})
                                </button>
                            </div>
                        </div>
                        <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#334155', lineHeight: 1.5 }}>{veredicto.detalle}</p>

                        {/* Embudo 3D Giratorio Interactivo de proporción GGO vs Post-GGO */}
                        {(kpis.medT1 + kpis.medT2 + kpis.medT3 + kpis.medT4) > 0 && (
                            <GgoEmbudo3D
                                t1={kpis.medT1}
                                t2={kpis.medT2}
                                t3={kpis.medT3}
                                t4={kpis.medT4}
                                pctGgo={kpis.pctGgoEnCuello}
                                pctPostGgo={kpis.pctPostGgoEnCuello}
                            />
                        )}
                    </div>

                    {/* 4 Tarjetas de Tramos */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
                        {[
                            { id: 'T1', title: 'Tramo 1 · Puerta → Médico', min: kpis.medT1, color: TRAMO_COLORS.t1, owner: 'Responsabilidad: GGO', desc: 'Espera en sala hasta inicio atención' },
                            { id: 'T2', title: 'Tramo 2 · Atención en GGO', min: kpis.medT2, color: TRAMO_COLORS.t2, owner: 'Responsabilidad: GGO', desc: 'Evaluación, estudios y conducta' },
                            { id: 'T3', title: 'Tramo 3 · Egreso → Admisión', min: kpis.medT3, color: TRAMO_COLORS.t3, owner: 'Responsabilidad: Admisión', desc: 'Trámite administrativo e ingreso' },
                            { id: 'T4', title: 'Tramo 4 · Admisión → Quirófano', min: kpis.medT4, color: TRAMO_COLORS.t4, owner: 'Responsabilidad: Quirófano', desc: 'Preparación y disponibilidad de sala' },
                        ].map(card => (
                            <div key={card.id} style={{
                                background: '#FFFFFF', borderRadius: '10px', padding: '14px 16px',
                                border: '1px solid #E2E8F0', borderTop: `4px solid ${card.color}`,
                                boxShadow: '0 1px 3px rgba(15,23,42,0.04)'
                            }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>{card.title}</div>
                                <div style={{ fontSize: '24px', fontWeight: 800, color: card.color, margin: '6px 0 4px' }}>{fmtMin(card.min)}</div>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: '#0F172A' }}>{card.owner}</div>
                                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>{card.desc}</div>
                            </div>
                        ))}
                    </div>

                    {/* Impacto Eco Guardia + Desglose SLA N1/N2/N3 + Rama */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                        {/* Impacto Ecografía de Guardia en Quirófano */}
                        <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                <Sparkles size={16} style={{ color: '#7C3AED' }} />
                                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                                    Impacto de Ecografía de Guardia en Tiempos a Quirófano
                                </h3>
                            </div>
                            <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#64748B' }}>
                                Compara pacientes que pasaron por <b>GUARDIAS ECOGRAFIAS</b> antes de operar vs ingreso directo.
                            </p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: '8px', padding: '12px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#6D28D9' }}>CON ECO GUARDIA</div>
                                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#4C1D95', marginTop: '4px' }}>
                                        {fmtMin(kpis.medPuertaQxConEco)}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#5B21B6', marginTop: '4px' }}>
                                        <b>{kpis.casosConEcoCount}</b> casos · GGO: {fmtMin(kpis.medGgoConEco)} · Post: {fmtMin(kpis.medPostGgoConEco)}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#6D28D9', marginTop: '2px' }}>
                                        Mediana GGO → Eco: <b>{fmtMin(kpis.medGgoAEco)}</b>
                                    </div>
                                </div>
                                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>SIN ECO GUARDIA</div>
                                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                                        {fmtMin(kpis.medPuertaQxSinEco)}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>
                                        <b>{kpis.casosSinEcoCount}</b> casos · GGO: {fmtMin(kpis.medGgoSinEco)} · Post: {fmtMin(kpis.medPostGgoSinEco)}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                                        Ingreso quirúrgico sin consulta previa en Eco Guardia
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Cumplimiento SLA por Prioridad */}
                        <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '16px' }}>
                            <h3 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                                Cumplimiento de Metas SLA (Puerta GGO → Quirófano)
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {desgloseSla.map(s => (
                                    <div key={s.prioridad} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '9px 12px', borderRadius: '8px',
                                        background: s.bg, border: `1px solid ${s.border}`
                                    }}>
                                        <div>
                                            <div style={{ fontSize: '12px', fontWeight: 800, color: s.color }}>
                                                {s.label} <span style={{ fontWeight: 600, opacity: 0.85 }}>(Meta ≤ {s.maxMin}m)</span>
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#334155' }}>
                                                {s.count} casos · Mediana: <b>{fmtMin(s.medTotal)}</b> (GGO {fmtMin(s.medGgo)} / Post {fmtMin(s.medPost)})
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '16px', fontWeight: 800, color: s.color }}>
                                                {s.pctCumple !== null ? `${fmtNum(s.pctCumple, 0)}%` : '—'}
                                            </div>
                                            <div style={{ fontSize: '10px', color: '#475569' }}>cumple meta</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Desglose por Rama */}
                        <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '16px' }}>
                            <h3 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                                Comparativa por Rama: Obstetricia vs Ginecología
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {desgloseRama.map(r => (
                                    <div key={r.rama} style={{
                                        padding: '11px 13px', borderRadius: '8px',
                                        background: '#F8FAFC', border: '1px solid #E2E8F0'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '13px', fontWeight: 800, color: r.rama === 'OBSTETRICIA' ? '#BE185D' : '#1E40AF' }}>
                                                {r.label}
                                            </span>
                                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>
                                                {r.count} cirugías ({r.conEco} c/Eco)
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '12px', color: '#475569' }}>
                                            <span>GGO: <b>{fmtMin(r.medGgo)}</b></span>
                                            <span>Post-GGO: <b>{fmtMin(r.medPost)}</b></span>
                                            <span>Total: <b style={{ color: '#0F172A' }}>{fmtMin(r.medTotal)}</b></span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Tabla Nominal Auditable */}
                    <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '18px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                                    Auditoría Nominal: Pacientes GGO → Quirófano ({fmtNum(casosFiltrados.length)})
                                </h3>
                                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>
                                    Trazabilidad minuto a minuto desde entrada a Guardia GGO hasta inicio efectivo en Quirófano
                                </p>
                            </div>
                            <button
                                onClick={handleExportExcelNominal}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    background: '#10B981', color: '#FFFFFF', border: 'none',
                                    borderRadius: '8px', padding: '7px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer'
                                }}
                            >
                                <Download size={14} /> Exportar Filtrados ({casosFiltrados.length})
                            </button>
                        </div>

                        {/* Barra de Filtros */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                            <div style={{ position: 'relative', flex: '1 1 240px' }}>
                                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} />
                                <input
                                    type="text"
                                    value={busqueda}
                                    onChange={(e) => setBusqueda(e.target.value)}
                                    placeholder="Buscar paciente, NHC, DNI, cirugía, cirujano..."
                                    style={{
                                        width: '100%', padding: '7px 10px 7px 32px', borderRadius: '8px',
                                        border: '1px solid #CBD5E1', fontSize: '12px', outline: 'none'
                                    }}
                                />
                            </div>
                            <select value={filtroRama} onChange={(e) => setFiltroRama(e.target.value)} style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12px' }}>
                                <option value="TODAS">Rama: Todas</option>
                                <option value="OBSTETRICIA">Obstetricia</option>
                                <option value="GINECOLOGIA">Ginecología</option>
                            </select>
                            <select value={filtroPrioridad} onChange={(e) => setFiltroPrioridad(e.target.value)} style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12px' }}>
                                <option value="TODAS">Prioridad: Todas</option>
                                <option value="N1">N1 Emergencia</option>
                                <option value="N2">N2 Urgente</option>
                                <option value="N3">N3 Estándar</option>
                            </select>
                            <select value={filtroEco} onChange={(e) => setFiltroEco(e.target.value)} style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12px' }}>
                                <option value="TODAS">Eco Guardia: Todas</option>
                                <option value="CON_ECO">Con Eco Guardia</option>
                                <option value="SIN_ECO">Sin Eco Guardia</option>
                            </select>
                            <select value={filtroCuello} onChange={(e) => setFiltroCuello(e.target.value)} style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12px' }}>
                                <option value="TODOS">Cuello: Todos</option>
                                <option value="GGO">Dominante: GGO (T1+T2)</option>
                                <option value="POST_GGO">Dominante: Post-GGO (T3+T4)</option>
                                <option value="ESPERA_QUIROFANO">↳ Espera Quirófano (T4)</option>
                                <option value="ADMISION_PRE_QX">↳ Admisión Pre-Qx (T3)</option>
                                <option value="ATENCION_GGO">↳ Atención GGO (T2)</option>
                                <option value="ESPERA_MEDICO_GGO">↳ Espera Médico GGO (T1)</option>
                            </select>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                    <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#334155' }}>
                                        <th style={{ padding: '9px 8px', textAlign: 'left' }}>Fecha GGO</th>
                                        <th style={{ padding: '9px 8px', textAlign: 'left' }}>Paciente / NHC</th>
                                        <th style={{ padding: '9px 8px', textAlign: 'left' }}>Rama / Prio</th>
                                        <th style={{ padding: '9px 8px', textAlign: 'left' }}>Cirugía / Cirujano</th>
                                        <th style={{ padding: '9px 8px', textAlign: 'center' }}>Eco Guardia</th>
                                        <th style={{ padding: '9px 8px', textAlign: 'left', minWidth: '210px' }}>Línea de Tiempo (T1 · T2 · T3 · T4)</th>
                                        <th style={{ padding: '9px 8px', textAlign: 'right' }}>Total Puerta→Qx</th>
                                        <th style={{ padding: '9px 8px', textAlign: 'center' }}>Cuello / SLA</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {casosPagina.map(c => {
                                        const t1 = Math.max(0, Number(c.min_tramo1_puerta_medico || 0));
                                        const t2 = Math.max(0, Number(c.min_tramo2_atencion_ggo || 0));
                                        const t3 = Math.max(0, Number(c.min_tramo3_post_ggo_adm || 0));
                                        const t4 = Math.max(0, Number(c.min_tramo4_adm_quirofano || 0));
                                        const sum = Math.max(1, t1 + t2 + t3 + t4);
                                        const prioMeta = SLA_METAS[c.prioridad] || SLA_METAS.N3;
                                        const cuelloMeta = getCuelloMeta(c.cuello_botella_dominante);
                                        return (
                                            <tr key={c.id || `${c.id_visita_ggo}-${c.t5_inicio_quirofano}`} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                                                    <div style={{ fontWeight: 700, color: '#0F172A' }}>{formatDateTimeShort(c.t0_entrada_ggo || c.fecha_ggo)}</div>
                                                    <div style={{ fontSize: '10px', color: '#64748B' }}>{c.franja_horaria} · {c.dia_semana}</div>
                                                </td>
                                                <td style={{ padding: '8px' }}>
                                                    <div style={{ fontWeight: 700, color: '#0F172A' }}>{c.paciente}</div>
                                                    <div style={{ fontSize: '11px', color: '#64748B' }}>
                                                        NHC: {c.nhc || '—'} · {c.obra_social || 'S/D'}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                                                    <span style={{
                                                        display: 'inline-block', fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '5px',
                                                        background: c.rama === 'OBSTETRICIA' ? '#FCE7F3' : '#DBEAFE',
                                                        color: c.rama === 'OBSTETRICIA' ? '#9D174D' : '#1E40AF',
                                                        marginRight: '4px'
                                                    }}>
                                                        {c.rama === 'OBSTETRICIA' ? 'OBST' : 'GINE'}
                                                    </span>
                                                    <span style={{
                                                        display: 'inline-block', fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '5px',
                                                        background: prioMeta.bg, color: prioMeta.color, border: `1px solid ${prioMeta.border}`
                                                    }}>
                                                        {c.prioridad}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '8px', maxWidth: '240px' }}>
                                                    <div style={{ fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.nombre_cirugia}>
                                                        {c.nombre_cirugia || 'Sin especificar'}
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: '#64748B' }}>
                                                        {c.cirujano || 'S/D'} {!c.es_urgencia_real && <span style={{ color: '#D97706', fontWeight: 700 }}>· Programada</span>}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '8px', textAlign: 'center' }}>
                                                    {c.tuvo_eco_guardia ? (
                                                        <div>
                                                            <span style={{
                                                                display: 'inline-block', fontSize: '10px', fontWeight: 800,
                                                                background: '#F3E8FF', color: '#6D28D9', padding: '2px 7px', borderRadius: '999px'
                                                            }}>
                                                                SÍ · {fmtMin(c.min_ggo_a_eco)}
                                                            </span>
                                                            {c.eco_guardia_tipo && (
                                                                <div style={{ fontSize: '10px', color: '#64748B', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '2px auto 0' }} title={c.eco_guardia_tipo}>
                                                                    {c.eco_guardia_tipo}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span style={{ fontSize: '11px', color: '#94A3B8' }}>No</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '8px' }}>
                                                    <div style={{ display: 'flex', height: '10px', borderRadius: '5px', overflow: 'hidden', background: '#E2E8F0', marginBottom: '4px' }}>
                                                        {t1 > 0 && <div style={{ width: `${(t1 * 100) / sum}%`, background: TRAMO_COLORS.t1 }} title={`T1: ${t1}m`} />}
                                                        {t2 > 0 && <div style={{ width: `${(t2 * 100) / sum}%`, background: TRAMO_COLORS.t2 }} title={`T2: ${t2}m`} />}
                                                        {t3 > 0 && <div style={{ width: `${(t3 * 100) / sum}%`, background: TRAMO_COLORS.t3 }} title={`T3: ${t3}m`} />}
                                                        {t4 > 0 && <div style={{ width: `${(t4 * 100) / sum}%`, background: TRAMO_COLORS.t4 }} title={`T4: ${t4}m`} />}
                                                    </div>
                                                    <div style={{ fontSize: '10px', color: '#475569', display: 'flex', gap: '6px' }}>
                                                        <span style={{ color: TRAMO_COLORS.t1 }}>T1:{Math.round(t1)}m</span>
                                                        <span style={{ color: TRAMO_COLORS.t2 }}>T2:{Math.round(t2)}m</span>
                                                        <span style={{ color: TRAMO_COLORS.t3 }}>T3:{Math.round(t3)}m</span>
                                                        <span style={{ color: TRAMO_COLORS.t4, fontWeight: 700 }}>T4:{Math.round(t4)}m</span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap' }}>
                                                    {fmtMin(c.min_total_puerta_qx)}
                                                </td>
                                                <td style={{ padding: '8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                    <div style={{
                                                        display: 'inline-block', fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '5px',
                                                        background: cuelloMeta.bg,
                                                        color: cuelloMeta.color,
                                                        marginBottom: '2px'
                                                    }}>
                                                        {cuelloMeta.label}
                                                    </div>
                                                    <div>
                                                        {c.cumple_meta === true ? (
                                                            <span style={{ fontSize: '10px', fontWeight: 700, color: '#059669' }}>✓ Cumple SLA</span>
                                                        ) : c.cumple_meta === false ? (
                                                            <span style={{ fontSize: '10px', fontWeight: 700, color: '#DC2626' }}>✕ Excede SLA</span>
                                                        ) : (
                                                            <span style={{ fontSize: '10px', color: '#94A3B8' }}>—</span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {casosPagina.length === 0 && (
                                        <tr>
                                            <td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#64748B' }}>
                                                No se encontraron casos con los filtros seleccionados.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Paginación */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', fontSize: '12px', color: '#475569' }}>
                            <div>
                                Mostrando {casosFiltrados.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, casosFiltrados.length)} de {casosFiltrados.length}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}>
                                    <option value={25}>25 / pág</option>
                                    <option value={50}>50 / pág</option>
                                    <option value={100}>100 / pág</option>
                                </select>
                                <button
                                    disabled={page <= 1}
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
                                >
                                    <ChevronLeft size={14} />
                                </button>
                                <span>Pág {page} / {totalPages}</span>
                                <button
                                    disabled={page >= totalPages}
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}
                                >
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* TAB 3: TIEMPOS Y FRANJAS HORARIAS                               */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'tiempos' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
                        {franjasAgg.map(f => (
                            <div key={f.franja} style={{
                                background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0',
                                padding: '16px', boxShadow: '0 1px 3px rgba(15,23,42,0.04)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#003B73' }}>{f.label}</span>
                                    <span style={{ fontSize: '12px', fontWeight: 700, background: '#EFF6FF', color: '#1E40AF', padding: '2px 8px', borderRadius: '999px' }}>
                                        {fmtNum(f.total)} consultas
                                    </span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                                    <div style={{ background: '#F8FAFC', padding: '8px', borderRadius: '6px' }}>
                                        <div style={{ color: '#64748B', fontSize: '11px' }}>Espera Médico</div>
                                        <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '15px' }}>{fmtMin(f.medEspera)}</div>
                                    </div>
                                    <div style={{ background: '#F8FAFC', padding: '8px', borderRadius: '6px' }}>
                                        <div style={{ color: '#64748B', fontSize: '11px' }}>Permanencia GGO</div>
                                        <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '15px' }}>{fmtMin(f.medPerm)}</div>
                                    </div>
                                    <div style={{ background: '#F5F3FF', padding: '8px', borderRadius: '6px' }}>
                                        <div style={{ color: '#6D28D9', fontSize: '11px' }}>Deriv. Eco Guardia</div>
                                        <div style={{ fontWeight: 800, color: '#4C1D95', fontSize: '15px' }}>{fmtNum(f.eco)}</div>
                                    </div>
                                    <div style={{ background: '#FEF2F2', padding: '8px', borderRadius: '6px' }}>
                                        <div style={{ color: '#B91C1C', fontSize: '11px' }}>Puerta → Qx ({f.qxCasos})</div>
                                        <div style={{ fontWeight: 800, color: '#991B1B', fontSize: '15px' }}>{fmtMin(f.medPuertaQx)}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '18px' }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                            Demanda y Espera Médica por Día de la Semana
                        </h3>
                        <div style={{ height: 300 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={diasAgg} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                                    <XAxis dataKey="dia" tick={{ fontSize: 12, fill: '#475569' }} />
                                    <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#475569' }} />
                                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#DB2777' }} unit="m" />
                                    <RechartsTooltip />
                                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                                    <Bar yAxisId="left" dataKey="total" name="Consultas GGO" fill="#1E40AF" radius={[4, 4, 0, 0]} />
                                    <Bar yAxisId="left" dataKey="eco" name="Deriv. Eco Guardia" fill="#7C3AED" radius={[4, 4, 0, 0]} />
                                    <Line yAxisId="right" type="monotone" dataKey="medPerm" name="Mediana Permanencia (min)" stroke="#DB2777" strokeWidth={2.5} dot={{ r: 4 }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Matriz Franja Horaria × Día de la Semana */}
                    <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '18px' }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                            Mapa de Demanda y Permanencia: Franja Horaria × Día de la Semana
                        </h3>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                    <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#334155' }}>
                                        <th style={{ padding: '9px 10px', textAlign: 'left' }}>Franja Horaria</th>
                                        {DIAS_ORDEN.map(d => (
                                            <th key={d} style={{ padding: '9px 8px', textAlign: 'center' }}>{d}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {FRANJAS_ORDEN.map(f => (
                                        <tr key={f} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                            <td style={{ padding: '10px', fontWeight: 700, color: '#003B73', whiteSpace: 'nowrap' }}>
                                                {FRANJA_LABELS[f]}
                                            </td>
                                            {DIAS_ORDEN.map(d => {
                                                const cell = matrizFranjaDia[f]?.[d] || { total: 0, perm: 0 };
                                                return (
                                                    <td key={d} style={{ padding: '8px', textAlign: 'center', background: cell.total > 0 ? '#F8FAFC' : '#FFFFFF' }}>
                                                        <div style={{ fontWeight: 800, color: '#0F172A' }}>{fmtNum(cell.total)}</div>
                                                        <div style={{ fontSize: '10px', color: '#64748B' }}>{cell.total > 0 ? fmtMin(cell.perm) : '—'}</div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* TAB 4: SEVERIDAD, RAMAS Y PRODUCCIÓN                            */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'severidad' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>
                        <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '18px' }}>
                            <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                                Distribución por Rama (Obstetricia vs Ginecología)
                            </h3>
                            <div style={{ height: 240 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={[
                                                { name: 'Ginecología', value: kpis.totalGine },
                                                { name: 'Obstetricia', value: kpis.totalObst },
                                            ]}
                                            dataKey="value"
                                            nameKey="name"
                                            cx="50%" cy="50%" innerRadius={55} outerRadius={88} paddingAngle={3}
                                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                                        >
                                            <Cell fill="#1E40AF" />
                                            <Cell fill="#DB2777" />
                                        </Pie>
                                        <RechartsTooltip formatter={(v) => fmtNum(v)} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '18px' }}>
                            <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                                Estratificación de Severidad Clínica (N1 / N2 / N3)
                            </h3>
                            <div style={{ height: 240 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={[
                                                { name: 'N1 Emergencia', value: kpis.totalN1 },
                                                { name: 'N2 Urgente', value: kpis.totalN2 },
                                                { name: 'N3 Estándar', value: kpis.totalN3 },
                                            ]}
                                            dataKey="value"
                                            nameKey="name"
                                            cx="50%" cy="50%" innerRadius={55} outerRadius={88} paddingAngle={3}
                                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                                        >
                                            <Cell fill="#DC2626" />
                                            <Cell fill="#F59E0B" />
                                            <Cell fill="#3B82F6" />
                                        </Pie>
                                        <RechartsTooltip formatter={(v) => fmtNum(v)} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '16px' }}>
                        {/* Top Médicos */}
                        <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '18px' }}>
                            <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                                Ranking de Médicos de Guardia GGO (Período)
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {topMedicos.map((m, i) => {
                                    const maxVal = topMedicos[0]?.consultas || 1;
                                    return (
                                        <div key={m.medico} style={{ fontSize: '12px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                                <span style={{ fontWeight: 600, color: '#1E293B' }}>{i + 1}. {m.medico}</span>
                                                <span style={{ fontWeight: 800, color: '#003B73' }}>{fmtNum(m.consultas)}</span>
                                            </div>
                                            <div style={{ height: '6px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                                                <div style={{ width: `${(m.consultas * 100) / maxVal}%`, height: '100%', background: '#1E40AF' }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Top Obras Sociales */}
                        <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '18px' }}>
                            <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                                Ranking de Obras Sociales / Financiadores (Período)
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {topObrasSociales.map((o, i) => {
                                    const maxVal = topObrasSociales[0]?.consultas || 1;
                                    return (
                                        <div key={o.obra_social} style={{ fontSize: '12px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                                <span style={{ fontWeight: 600, color: '#1E293B' }}>{i + 1}. {o.obra_social}</span>
                                                <span style={{ fontWeight: 800, color: '#BE185D' }}>{fmtNum(o.consultas)}</span>
                                            </div>
                                            <div style={{ height: '6px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                                                <div style={{ width: `${(o.consultas * 100) / maxVal}%`, height: '100%', background: '#DB2777' }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* TAB 5: CALIDAD Y ECOGRAFÍA DE GUARDIA                           */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'calidad' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                        <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '16px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Reconsultas ≤ 72 hs</div>
                            <div style={{ fontSize: '24px', fontWeight: 800, color: kpis.pctRecons > 7 ? '#DC2626' : '#059669', marginTop: '4px' }}>
                                {fmtNum(kpis.pctRecons, 2)}%
                            </div>
                            <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>
                                {fmtNum(kpis.totalRecons)} reconsultas · Meta Calidad: &lt; 7%
                            </div>
                        </div>

                        <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '16px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Derivación a Eco Guardia</div>
                            <div style={{ fontSize: '24px', fontWeight: 800, color: '#7C3AED', marginTop: '4px' }}>
                                {fmtNum(kpis.pctEco, 2)}%
                            </div>
                            <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>
                                {fmtNum(kpis.totalEco)} consultas GGO → GUARDIAS ECOGRAFIAS
                            </div>
                        </div>

                        <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '16px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Tasa de Internación</div>
                            <div style={{ fontSize: '24px', fontWeight: 800, color: '#1E40AF', marginTop: '4px' }}>
                                {fmtNum(kpis.pctInt, 2)}%
                            </div>
                            <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>
                                {fmtNum(kpis.totalInt)} pases a cama hospitalaria
                            </div>
                        </div>

                        <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '16px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Resolutividad Ambulatoria</div>
                            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F766E', marginTop: '4px' }}>
                                {fmtNum(Math.max(0, 100 - kpis.pctInt), 1)}%
                            </div>
                            <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>
                                Pacientes resueltas sin internación
                            </div>
                        </div>
                    </div>

                    <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '18px' }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                            Evolución Mensual de Indicadores de Calidad y Derivación (%)
                        </h3>
                        <div style={{ height: 300 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={chartMensualData} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#475569' }} />
                                    <YAxis tick={{ fontSize: 11, fill: '#475569' }} unit="%" />
                                    <RechartsTooltip formatter={(v) => [`${fmtNum(v, 2)}%`]} />
                                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                                    <ReferenceLine y={7} stroke="#DC2626" strokeDasharray="4 4" label={{ value: 'Meta Recons <7%', fontSize: 10, fill: '#DC2626' }} />
                                    <Line type="monotone" dataKey="pctRecons" name="% Reconsultas 72h" stroke="#DC2626" strokeWidth={2.5} dot={{ r: 3 }} />
                                    <Line type="monotone" dataKey="pctEco" name="% Derivación Eco Guardia" stroke="#7C3AED" strokeWidth={2.5} dot={{ r: 3 }} />
                                    <Line type="monotone" dataKey="pctInt" name="% Pases Internación" stroke="#1E40AF" strokeWidth={2.5} dot={{ r: 3 }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Nota Metodológica */}
                    <div style={{ background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '16px', fontSize: '12px', color: '#475569', lineHeight: 1.6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>
                            <Info size={15} style={{ color: '#003B73' }} /> Metodología de Fuentes SALUS (Calidad-QOAG)
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '18px' }}>
                            <li><b>Universo base:</b> Visitas de <code>VLISE_Visitas</code> con <code>Agenda = 'GUARDIAS GINECOLOGIA'</code> (excluyendo anuladas/canceladas).</li>
                            <li><b>Derivación a Ecografía de Guardia:</b> Se marca automáticamente cuando la misma paciente (NHC/DNI) registra una consulta en <code>Agenda = 'GUARDIAS ECOGRAFIAS'</code> dentro de la ventana de -30 min a +12 horas desde la visita GGO.</li>
                            <li><b>Cuello de Botella GGO → Quirófano:</b> Cruce con <code>TABLEAU_Admisiones</code> y <code>TABLEAU_Cirugias</code> (≤ 48 hs). Se separan los 4 tramos de reloj (T1 Espera Médico, T2 Atención GGO, T3 Egreso→Admisión, T4 Admisión→Inicio Quirófano) excluyendo por defecto cirugías programadas preexistentes.</li>
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}
