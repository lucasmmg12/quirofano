import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Bed, Baby, HeartPulse, Activity, Clock, Table2, Users, FileSpreadsheet,
    Filter, RefreshCw, Search, Settings, CheckSquare, Square, ChevronRight,
    TrendingUp, TrendingDown, Building2, Stethoscope, Layers, BarChart3,
    Download, Plus, Trash2, X, Info, Calendar
} from 'lucide-react';
import {
    ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
    CartesianGrid, Tooltip, Legend, Cell, LabelList, ReferenceLine
} from 'recharts';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';

// ─── CONSTANTES VISUALES CALIDAD-QOAG ───
const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const YEAR_COLORS = {
    2021: '#14B8A6', // teal
    2022: '#16A34A', // green
    2023: '#EAB308', // amber/yellow
    2024: '#9333EA', // purple
    2025: '#F43F5E', // rose/pink
    2026: '#003B73', // institutional navy blue
};

const SECTORES_LISTA = [
    'HOSPITAL DE DIA',
    'INTERNADO',
    'NEONATOLOGIA',
    'PEDIATRIA',
    'TERAPIA INTERMEDIA',
    'UCI',
];

const SECTOR_META = {
    NEONATOLOGIA: { label: 'Neonatología', color: '#0284C7', bg: '#F0F9FF', icon: Baby },
    PEDIATRIA: { label: 'Pediatría', color: '#7C3AED', bg: '#F5F3FF', icon: HeartPulse },
    INTERNADO: { label: 'Internado Adultos', color: '#003B73', bg: '#EFF6FF', icon: Bed },
    UCI: { label: 'UCI Adultos', color: '#DC2626', bg: '#FEF2F2', icon: Activity },
    'TERAPIA INTERMEDIA': { label: 'Terapia Intermedia', color: '#EA580C', bg: '#FFF7ED', icon: Activity },
    'HOSPITAL DE DIA': { label: 'Hospital de Día', color: '#059669', bg: '#ECFDF5', icon: Clock },
};

const TABS = [
    { id: 'portal', label: 'Portal Resumen', icon: Layers },
    { id: 'neonatologia', label: 'Neonatología', icon: Baby },
    { id: 'pediatria', label: 'Pediatría', icon: HeartPulse },
    { id: 'internado', label: 'Internado', icon: Bed },
    { id: 'terapia', label: 'Terapia Adultos', icon: Activity },
    { id: 'hdd', label: 'Hospital de Día', icon: Clock },
    { id: 'tablas', label: 'Tablas Matriciales', icon: Table2 },
    { id: 'detalles', label: 'Detalles y Rankings', icon: BarChart3 },
    { id: 'pacientes', label: 'Detalle Pacientes', icon: Users },
];

// ─── HELPERS DE FECHA Y DÍAS CAMA (REGLA 0.5 SANATORIO ARGENTINO) ───
function dayNumberUTC(y, m, d) {
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function parseYMD(str) {
    if (!str) return null;
    const [y, m, d] = String(str).slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return null;
    return { y, m, d };
}

function toArgYMD(isoStr) {
    if (!isoStr) return null;
    const dt = new Date(isoStr);
    if (isNaN(dt.getTime())) return null;
    // Convertir a UTC-3 Argentina
    const arg = new Date(dt.getTime() - 3 * 3600000);
    return { y: arg.getUTCFullYear(), m: arg.getUTCMonth() + 1, d: arg.getUTCDate() };
}

/**
 * Calcula los Días Cama exactos de un paciente dentro de la ventana [desdeYMD .. hastaYMD] del Telar
 * aplicando la regla de medios días (0.5 ingreso, 1.0 intermedios, 0.5 egreso).
 */
function calcDiasCamaEnVentana(fechaIngresoIso, fechaAltaIso, desdeStr, hastaStr) {
    const s = toArgYMD(fechaIngresoIso);
    if (!s) return 0;
    const isOpen = !fechaAltaIso;
    const e = fechaAltaIso ? toArgYMD(fechaAltaIso) : toArgYMD(new Date().toISOString());
    const winStart = parseYMD(desdeStr);
    const winEnd = parseYMD(hastaStr);
    if (!e || !winStart || !winEnd) return 0;

    const sNum = dayNumberUTC(s.y, s.m, s.d);
    const eNum = dayNumberUTC(e.y, e.m, e.d);
    const wStartNum = dayNumberUTC(winStart.y, winStart.m, winStart.d);
    const wEndNum = dayNumberUTC(winEnd.y, winEnd.m, winEnd.d);

    if (sNum === eNum) {
        return (sNum >= wStartNum && sNum <= wEndNum) ? 0.5 : 0;
    }

    const cStart = Math.max(sNum, wStartNum);
    const cEnd = Math.min(eNum, wEndNum);
    if (cStart > cEnd) return 0;

    let days = (cEnd - cStart + 1);
    if (cStart === sNum) days -= 0.5;
    if (cEnd === eNum && !isOpen) days -= 0.5;
    return Math.max(0, Math.round(days * 100) / 100);
}

function fmtNum(n, dec = 0) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Number(n).toLocaleString('es-AR', {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
    });
}

function fmtDateTimeAR(isoStr) {
    if (!isoStr) return 'Internado';
    const dt = new Date(isoStr);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
    });
}

function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

// ─── SUBCOMPONENTE: TABLA MATRICIAL MULTIANUAL (AÑO x MES) ───
function MatrixTable({
    title,
    rowsByYear, // { [year]: { [mes 1..12]: number } }
    years,
    decimals = 0,
    suffix = '',
    showTotal = false,
    highlightYear = null,
    highlightMonth = null,
    colorScaleOccupancy = false,
    subtitle = null,
}) {
    const validYears = years.filter(y => rowsByYear[y] && Object.values(rowsByYear[y]).some(v => v > 0));
    if (validYears.length === 0) {
        return (
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px' }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#003B73', marginBottom: '6px' }}>{title}</div>
                <div style={{ fontSize: '0.78rem', color: '#94A3B8', padding: '12px 0' }}>Sin registros para los filtros seleccionados.</div>
            </div>
        );
    }

    return (
        <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '10px',
            boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
            overflow: 'hidden',
        }}>
            <div style={{
                padding: '10px 14px',
                borderBottom: '1px solid #E2E8F0',
                background: '#F8FAFC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
            }}>
                <div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#003B73' }}>{title}</div>
                    {subtitle && <div style={{ fontSize: '0.7rem', color: '#64748B' }}>{subtitle}</div>}
                </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums' }}>
                    <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                            <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, color: '#475569', width: '56px' }}>Año</th>
                            {MESES_CORTO.map((m, idx) => {
                                const isActiveMonth = highlightMonth === idx + 1;
                                return (
                                    <th
                                        key={m}
                                        style={{
                                            padding: '7px 6px',
                                            textAlign: 'right',
                                            fontWeight: isActiveMonth ? 800 : 600,
                                            color: isActiveMonth ? '#0284C7' : '#64748B',
                                            background: isActiveMonth ? '#F0F9FF' : 'transparent',
                                        }}
                                    >
                                        {m}
                                    </th>
                                );
                            })}
                            {showTotal && (
                                <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: '#003B73', background: '#F1F5F9' }}>
                                    Total
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {validYears.map((yr, rIdx) => {
                            const row = rowsByYear[yr] || {};
                            let total = 0;
                            for (let m = 1; m <= 12; m++) total += (row[m] || 0);
                            return (
                                <tr
                                    key={yr}
                                    style={{
                                        background: rIdx % 2 === 1 ? '#F8FAFC' : '#FFFFFF',
                                        borderBottom: '1px solid #F1F5F9',
                                    }}
                                >
                                    <td style={{ padding: '7px 10px', fontWeight: 800, color: YEAR_COLORS[yr] || '#0F172A' }}>
                                        {yr}
                                    </td>
                                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                                        const val = row[m] || 0;
                                        const isCellTelar = highlightYear === yr && highlightMonth === m;
                                        let cellBg = isCellTelar ? '#DBEAFE' : 'transparent';
                                        let cellColor = val > 0 ? '#1E293B' : '#CBD5E1';
                                        if (colorScaleOccupancy && val > 0 && !isCellTelar) {
                                            if (val >= 95) { cellBg = '#FEE2E2'; cellColor = '#B91C1C'; }
                                            else if (val >= 85) { cellBg = '#FEF3C7'; cellColor = '#B45309'; }
                                            else if (val >= 65) { cellBg = '#ECFDF5'; cellColor = '#047857'; }
                                        }
                                        return (
                                            <td
                                                key={m}
                                                style={{
                                                    padding: '7px 6px',
                                                    textAlign: 'right',
                                                    fontWeight: isCellTelar ? 800 : (val > 0 ? 600 : 400),
                                                    color: isCellTelar ? '#003B73' : cellColor,
                                                    background: cellBg,
                                                    borderRadius: isCellTelar ? '4px' : 0,
                                                }}
                                            >
                                                {val > 0 ? `${fmtNum(val, decimals)}${suffix}` : ''}
                                            </td>
                                        );
                                    })}
                                    {showTotal && (
                                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: '#003B73', background: '#F1F5F9' }}>
                                            {fmtNum(total, decimals)}{suffix}
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── SUBCOMPONENTE: GRÁFICO LÍNEAS MULTIANUAL + BARRAS PROMEDIO ANUAL ───
function MultiYearLineAndAvg({
    title,
    rowsByYear,
    years,
    decimals = 1,
    unitLabel = '',
    highlightMonth = null,
    height = 280,
}) {
    const activeYears = years.filter(y => rowsByYear[y] && Object.values(rowsByYear[y]).some(v => v > 0));

    const lineData = useMemo(() => {
        return MESES_LARGO.map((mesNombre, idx) => {
            const m = idx + 1;
            const pt = { mes: MESES_CORTO[idx], mesLargo: mesNombre };
            activeYears.forEach(yr => {
                const v = rowsByYear[yr]?.[m];
                if (v !== undefined && v > 0) pt[String(yr)] = Number(v.toFixed(decimals));
            });
            return pt;
        });
    }, [rowsByYear, activeYears, decimals]);

    const avgData = useMemo(() => {
        return activeYears.map(yr => {
            const vals = Object.values(rowsByYear[yr] || {}).filter(v => v > 0);
            const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
            return {
                anio: String(yr),
                promedio: Number(avg.toFixed(decimals)),
                color: YEAR_COLORS[yr] || '#0284C7',
            };
        });
    }, [rowsByYear, activeYears, decimals]);

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(220px, 1fr)', gap: '16px' }}>
            {/* Líneas mensuales */}
            <div style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '14px 16px',
                boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
            }}>
                <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#003B73', marginBottom: '10px' }}>
                    {title}
                </div>
                <div style={{ width: '100%', height }}>
                    <ResponsiveContainer>
                        <LineChart data={lineData} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#64748B' }} />
                            <YAxis tick={{ fontSize: 11, fill: '#64748B' }} width={46} />
                            <Tooltip
                                formatter={(value, name) => [`${fmtNum(value, decimals)}${unitLabel}`, `Año ${name}`]}
                                contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '0.78rem' }}
                            />
                            <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                            {highlightMonth && (
                                <ReferenceLine
                                    x={MESES_CORTO[highlightMonth - 1]}
                                    stroke="#0284C7"
                                    strokeDasharray="4 4"
                                    strokeWidth={1.5}
                                />
                            )}
                            {activeYears.map(yr => (
                                <Line
                                    key={yr}
                                    type="monotone"
                                    dataKey={String(yr)}
                                    stroke={YEAR_COLORS[yr] || '#0284C7'}
                                    strokeWidth={yr === 2026 ? 2.8 : 1.8}
                                    dot={{ r: yr === 2026 ? 3.5 : 2.5 }}
                                    activeDot={{ r: 5 }}
                                    connectNulls
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Barras Promedio Anual */}
            <div style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '14px 16px',
                boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
            }}>
                <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#003B73', marginBottom: '10px' }}>
                    Promedio Anual
                </div>
                <div style={{ width: '100%', height }}>
                    <ResponsiveContainer>
                        <BarChart data={avgData} margin={{ top: 18, right: 8, left: -12, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                            <XAxis dataKey="anio" tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} />
                            <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} />
                            <Tooltip
                                formatter={(value) => [`${fmtNum(value, decimals)}${unitLabel}`, 'Promedio mensual']}
                                contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '0.78rem' }}
                            />
                            <Bar dataKey="promedio" radius={[6, 6, 0, 0]} maxBarSize={42}>
                                {avgData.map((entry) => (
                                    <Cell key={entry.anio} fill={entry.color} />
                                ))}
                                <LabelList
                                    dataKey="promedio"
                                    position="top"
                                    formatter={(v) => fmtNum(v, decimals === 0 ? 0 : 1)}
                                    style={{ fontSize: 10, fontWeight: 700, fill: '#334155' }}
                                />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}

// ─── COMPONENTE PRINCIPAL: TABLERO DE INTERNACIÓN (GOBERNANZA DE DATOS) ───
export default function InternacionDashboard({
    fechaDesde,
    fechaHasta,
    datePresetMode = 'este_mes',
    addToast,
}) {
    // Fechas efectivas 100% supeditadas al filtro maestro del Telar
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

    const telarYMD = useMemo(() => parseYMD(effectiveDesde) || { y: 2026, m: 11, d: 1 }, [effectiveDesde]);

    // Navegación interna
    const [activeTab, setActiveTab] = useState('portal');
    const [tablaSubTab, setTablaSubTab] = useState('dias_cama'); // 'dias_cama' | 'ingresos' | 'ocupacion'

    // Filtros no temporales (Obra Social, Especialidad, Sector, Proceso)
    const [filterCliente, setFilterCliente] = useState('');
    const [filterEspecialidad, setFilterEspecialidad] = useState('');
    const [filterProceso, setFilterProceso] = useState('');
    const [selectedSectoresDetalles, setSelectedSectoresDetalles] = useState([...SECTORES_LISTA]);
    const [pacientesSectorFilter, setPacientesSectorFilter] = useState('TODOS');
    const [pacientesSearch, setPacientesSearch] = useState('');

    // Datos cargados desde Supabase
    const [loadingAgg, setLoadingAgg] = useState(true);
    const [loadingNominal, setLoadingNominal] = useState(false);
    const [aggRows, setAggRows] = useState([]);
    const [filtrosMeta, setFiltrosMeta] = useState({ clientes: [], especialidades: [], last_sync: null });
    const [nominalRows, setNominalRows] = useState([]);
    const [camasConfig, setCamasConfig] = useState([]);
    const [inquilinos, setInquilinos] = useState([]);

    // Modales de configuración (Dotación de Camas / Nómina de Inquilinos)
    const [showCamasModal, setShowCamasModal] = useState(false);
    const [showInquilinosModal, setShowInquilinosModal] = useState(false);
    const [newInquilinoName, setNewInquilinoName] = useState('');
    const [savingConfig, setSavingConfig] = useState(false);

    // 1. Cargar metadatos (clientes, especialidades, camas_config, inquilinos)
    const loadMetadata = useCallback(async () => {
        const [fRes, cRes, iRes] = await Promise.all([
            supabase.rpc('get_gob_internacion_filtros'),
            supabase.from('gob_internacion_camas_config').select('*').order('sector').order('anio'),
            supabase.from('gob_internacion_inquilinos').select('*').order('doctor_nombre'),
        ]);
        if (!fRes.error && fRes.data) setFiltrosMeta(fRes.data);
        if (!cRes.error && cRes.data) setCamasConfig(cRes.data);
        if (!iRes.error && iRes.data) setInquilinos(iRes.data);
    }, []);

    // 2. Cargar agregados multianuales (vía RPC ultra-rápido)
    const loadAggData = useCallback(async () => {
        setLoadingAgg(true);
        try {
            const { data, error } = await supabase.rpc('get_gob_internacion_mensual', {
                p_cliente: filterCliente || null,
                p_especialidad: filterEspecialidad || null,
            });
            if (error) throw error;
            setAggRows(data || []);
        } catch (err) {
            console.error('[InternacionDashboard] Error cargando agregados:', err);
            addToast?.('Error al cargar métricas de Internación', 'error');
        } finally {
            setLoadingAgg(false);
        }
    }, [filterCliente, filterEspecialidad, addToast]);

    // 3. Cargar registros nominales acotados 100% al filtro del Telar (overlap de estadía)
    const loadNominalData = useCallback(async () => {
        setLoadingNominal(true);
        try {
            const desdeIso = `${effectiveDesde}T00:00:00-03:00`;
            const hastaIso = `${effectiveHasta}T23:59:59-03:00`;

            // Traer admisiones que se solapan con el período Telar (paginado si supera 1000)
            let all = [];
            let from = 0;
            const PAGE = 1000;
            while (true) {
                const { data, error } = await supabase
                    .from('gob_internacion_admisiones')
                    .select('*')
                    .lte('fecha_ingreso', hastaIso)
                    .or(`fecha_alta.is.null,fecha_alta.gte.${desdeIso}`)
                    .order('fecha_ingreso', { ascending: false })
                    .range(from, from + PAGE - 1);
                if (error) throw error;
                if (!data || data.length === 0) break;
                all = all.concat(data);
                if (data.length < PAGE || all.length >= 15000) break;
                from += PAGE;
            }
            setNominalRows(all);
        } catch (err) {
            console.error('[InternacionDashboard] Error cargando nominales:', err);
        } finally {
            setLoadingNominal(false);
        }
    }, [effectiveDesde, effectiveHasta]);

    useEffect(() => { loadMetadata(); }, [loadMetadata]);
    useEffect(() => { loadAggData(); }, [loadAggData]);
    useEffect(() => { loadNominalData(); }, [loadNominalData]);

    // ─── CONSTRUCCIÓN DE MATRICES POR SECTOR ───
    const matrices = useMemo(() => {
        const makeGrid = () => ({});
        const add = (grid, anio, mes, val) => {
            if (!grid[anio]) grid[anio] = {};
            grid[anio][mes] = Math.round(((grid[anio][mes] || 0) + Number(val || 0)) * 100) / 100;
        };

        const neoDias = makeGrid(), neoIng = makeGrid(), neoEgr = makeGrid();
        const pedPisoDias = makeGrid(), pedTerDias = makeGrid(), pedIng = makeGrid();
        const intIng = makeGrid(), intDias = makeGrid(), intEgr = makeGrid();
        const uciIng = makeGrid(), uciEgr = makeGrid(), uciDias = makeGrid();
        const tiIng = makeGrid(), tiEgr = makeGrid(), tiDias = makeGrid();
        const hddHorasConHierro = makeGrid(), hddIngSinHierro = makeGrid(), hddIngTotal = makeGrid();

        for (const r of aggRows) {
            const { anio, mes, sector, subsector, es_hierro, ingresos, egresos, dias_cama, horas_ocupacion } = r;
            if (sector === 'NEONATOLOGIA') {
                add(neoDias, anio, mes, dias_cama);
                add(neoIng, anio, mes, ingresos);
                add(neoEgr, anio, mes, egresos);
            } else if (sector === 'PEDIATRIA') {
                if (subsector === 'TERAPIA') add(pedTerDias, anio, mes, dias_cama);
                else add(pedPisoDias, anio, mes, dias_cama);
                add(pedIng, anio, mes, ingresos);
            } else if (sector === 'INTERNADO') {
                add(intIng, anio, mes, ingresos);
                add(intDias, anio, mes, dias_cama);
                add(intEgr, anio, mes, egresos);
            } else if (sector === 'UCI') {
                add(uciIng, anio, mes, ingresos);
                add(uciEgr, anio, mes, egresos);
                add(uciDias, anio, mes, dias_cama);
            } else if (sector === 'TERAPIA INTERMEDIA') {
                add(tiIng, anio, mes, ingresos);
                add(tiEgr, anio, mes, egresos);
                add(tiDias, anio, mes, dias_cama);
            } else if (sector === 'HOSPITAL DE DIA') {
                add(hddHorasConHierro, anio, mes, horas_ocupacion);
                add(hddIngTotal, anio, mes, ingresos);
                if (!es_hierro) add(hddIngSinHierro, anio, mes, ingresos);
            }
        }

        return {
            neoDias, neoIng, neoEgr,
            pedPisoDias, pedTerDias, pedIng,
            intIng, intDias, intEgr,
            uciIng, uciEgr, uciDias,
            tiIng, tiEgr, tiDias,
            hddHorasConHierro, hddIngSinHierro, hddIngTotal,
        };
    }, [aggRows]);

    // ─── CÁLCULO DE % DE OCUPACIÓN POR SECTOR (USANDO DOTACIÓN CONFIGURABLE) ───
    const getCamasOperativas = useCallback((sector, subsector, anio) => {
        const exact = camasConfig.find(c => c.sector === sector && (c.subsector || '') === (subsector || '') && c.anio === anio);
        if (exact) return exact;
        const fallback = camasConfig.filter(c => c.sector === sector && (c.subsector || '') === (subsector || '')).sort((a, b) => b.anio - a.anio)[0];
        if (fallback) return fallback;
        // Defaults de seguridad
        if (sector === 'INTERNADO') return { camas_operativas: 40 };
        if (sector === 'NEONATOLOGIA') return { camas_operativas: 18 };
        if (sector === 'PEDIATRIA' && subsector === 'TERAPIA') return { camas_operativas: 4 };
        if (sector === 'PEDIATRIA') return { camas_operativas: 9 };
        if (sector === 'UCI' || sector === 'TERAPIA INTERMEDIA') return { camas_operativas: 8 };
        if (sector === 'HOSPITAL DE DIA') return { camas_operativas: 11, horas_mes_hdd: 1200 };
        return { camas_operativas: 10 };
    }, [camasConfig]);

    const ocupacionMatrices = useMemo(() => {
        const calcGrid = (sourceGrid, sector, subsector = '', isHdd = false) => {
            const out = {};
            for (const yrStr of Object.keys(sourceGrid)) {
                const yr = Number(yrStr);
                out[yr] = {};
                const cfg = getCamasOperativas(sector, subsector, yr);
                for (let m = 1; m <= 12; m++) {
                    const val = sourceGrid[yr][m] || 0;
                    if (val <= 0) continue;
                    const denom = isHdd
                        ? Number(cfg.horas_mes_hdd || 1200)
                        : Number(cfg.camas_operativas || 1) * getDaysInMonth(yr, m);
                    out[yr][m] = denom > 0 ? Math.round((val / denom) * 1000) / 10 : 0;
                }
            }
            return out;
        };

        return {
            internado: calcGrid(matrices.intDias, 'INTERNADO'),
            neonatologia: calcGrid(matrices.neoDias, 'NEONATOLOGIA'),
            hdd: calcGrid(matrices.hddHorasConHierro, 'HOSPITAL DE DIA', '', true),
            pedPiso: calcGrid(matrices.pedPisoDias, 'PEDIATRIA', 'PISO'),
            pedTerapia: calcGrid(matrices.pedTerDias, 'PEDIATRIA', 'TERAPIA'),
            uci: calcGrid(matrices.uciDias, 'UCI'),
            ti: calcGrid(matrices.tiDias, 'TERAPIA INTERMEDIA'),
        };
    }, [matrices, getCamasOperativas]);

    // ─── KPIs DEL PERÍODO ACTIVO DEL TELAR ───
    const telarKpis = useMemo(() => {
        const desdeIso = `${effectiveDesde}T00:00:00-03:00`;
        const hastaIso = `${effectiveHasta}T23:59:59-03:00`;

        let ingresosPeriodo = 0;
        let diasCamaPeriodo = 0;
        let horasHddPeriodo = 0;
        let ingresosHddSinHierro = 0;
        const bySector = {};

        for (const r of nominalRows) {
            if (filterCliente && r.cliente !== filterCliente) continue;
            if (filterEspecialidad && r.especialidad !== filterEspecialidad) continue;

            const sec = r.sector_arreglado;
            if (!bySector[sec]) bySector[sec] = { ingresos: 0, diasCama: 0, horas: 0, activos: 0 };

            const ingresóEnVentana = r.fecha_ingreso >= desdeIso && r.fecha_ingreso <= hastaIso;
            if (ingresóEnVentana) {
                ingresosPeriodo++;
                bySector[sec].ingresos++;
                if (sec === 'HOSPITAL DE DIA' && !r.es_hierro) ingresosHddSinHierro++;
            }
            if (!r.fecha_alta) bySector[sec].activos++;

            if (sec === 'HOSPITAL DE DIA') {
                if (ingresóEnVentana) {
                    const hrs = Number(r.horas_ocupacion || 0);
                    horasHddPeriodo += hrs;
                    bySector[sec].horas += hrs;
                }
            } else {
                const dc = calcDiasCamaEnVentana(r.fecha_ingreso, r.fecha_alta, effectiveDesde, effectiveHasta);
                diasCamaPeriodo += dc;
                bySector[sec].diasCama += dc;
            }
        }

        // Ocupación Internado en el mes del Telar
        const ocupIntMes = ocupacionMatrices.internado[telarYMD.y]?.[telarYMD.m] ?? null;
        const ocupNeoMes = ocupacionMatrices.neonatologia[telarYMD.y]?.[telarYMD.m] ?? null;

        return {
            ingresosPeriodo,
            diasCamaPeriodo: Math.round(diasCamaPeriodo * 10) / 10,
            horasHddPeriodo: Math.round(horasHddPeriodo * 10) / 10,
            ingresosHddSinHierro,
            ocupIntMes,
            ocupNeoMes,
            bySector,
        };
    }, [nominalRows, effectiveDesde, effectiveHasta, filterCliente, filterEspecialidad, ocupacionMatrices, telarYMD]);

    // Sincronizar contexto global para Beto / Telar
    useEffect(() => {
        if (typeof window !== 'undefined') {
            window.__internacion_active_context = {
                sectorId: 'INTERNACION',
                periodo: `${effectiveDesde} a ${effectiveHasta}`,
                ingresosPeriodo: telarKpis.ingresosPeriodo,
                diasCamaPeriodo: telarKpis.diasCamaPeriodo,
                horasHddPeriodo: telarKpis.horasHddPeriodo,
                ocupacionInternadoPct: telarKpis.ocupIntMes,
                ocupacionNeoPct: telarKpis.ocupNeoMes,
            };
        }
    }, [effectiveDesde, effectiveHasta, telarKpis]);

    // ─── RANKINGS Y DETALLES DE INTERNACIONES (PERÍODO TELAR) ───
    const inquilinosSet = useMemo(() => {
        return new Set(
            inquilinos
                .filter(i => i.activo)
                .map(i => String(i.doctor_nombre || '').toUpperCase().trim())
        );
    }, [inquilinos]);

    const detallesData = useMemo(() => {
        const desdeIso = `${effectiveDesde}T00:00:00-03:00`;
        const hastaIso = `${effectiveHasta}T23:59:59-03:00`;

        // Filtrar ingresos dentro del período Telar + filtros de sector/cliente/proceso
        const filtered = nominalRows.filter(r => {
            if (r.fecha_ingreso < desdeIso || r.fecha_ingreso > hastaIso) return false;
            if (!selectedSectoresDetalles.includes(r.sector_arreglado)) return false;
            if (filterCliente && r.cliente !== filterCliente) return false;
            if (filterProceso && r.proceso !== filterProceso) return false;
            return true;
        });

        const total = filtered.length;
        const countBy = (keyFn) => {
            const m = new Map();
            for (const r of filtered) {
                const k = keyFn(r) || 'SIN DATO';
                m.set(k, (m.get(k) || 0) + 1);
            }
            return Array.from(m.entries())
                .map(([name, count]) => ({ name, count, pct: total > 0 ? (count / total) * 100 : 0 }))
                .sort((a, b) => b.count - a.count);
        };

        let inqSi = 0;
        let inqNull = 0;
        for (const r of filtered) {
            const docUpper = String(r.doctor || '').toUpperCase().trim();
            if (inquilinosSet.has(docUpper)) inqSi++;
            else inqNull++;
        }

        const procesosUnicos = Array.from(new Set(nominalRows.map(r => r.proceso).filter(Boolean))).sort();

        return {
            total,
            medicos: countBy(r => r.doctor),
            obrasSociales: countBy(r => r.cliente),
            especialidades: countBy(r => r.especialidad),
            inquilinosSi: inqSi,
            inquilinosNull: inqNull,
            inquilinosSiPct: total > 0 ? (inqSi / total) * 100 : 0,
            inquilinosNullPct: total > 0 ? (inqNull / total) * 100 : 0,
            procesosUnicos,
        };
    }, [nominalRows, effectiveDesde, effectiveHasta, selectedSectoresDetalles, filterCliente, filterProceso, inquilinosSet]);

    // ─── DETALLE NOMINAL DE PACIENTES (PERÍODO TELAR) ───
    const pacientesTabla = useMemo(() => {
        const q = pacientesSearch.trim().toLowerCase();
        const list = [];
        for (const r of nominalRows) {
            if (pacientesSectorFilter !== 'TODOS' && r.sector_arreglado !== pacientesSectorFilter) continue;
            if (filterCliente && r.cliente !== filterCliente) continue;
            const diasVentana = r.sector_arreglado === 'HOSPITAL DE DIA'
                ? Number(r.horas_ocupacion || 0)
                : calcDiasCamaEnVentana(r.fecha_ingreso, r.fecha_alta, effectiveDesde, effectiveHasta);

            if (diasVentana <= 0 && r.sector_arreglado !== 'HOSPITAL DE DIA') continue;

            if (q) {
                const hay = `${r.paciente || ''} ${r.nhc || ''} ${r.nif || ''} ${r.cliente || ''} ${r.doctor || ''} ${r.numero_admision || ''}`.toLowerCase();
                if (!hay.includes(q)) continue;
            }
            list.push({ ...r, dias_cama_ventana: diasVentana });
        }
        return list.sort((a, b) => (a.paciente || '').localeCompare(b.paciente || ''));
    }, [nominalRows, pacientesSectorFilter, filterCliente, pacientesSearch, effectiveDesde, effectiveHasta]);

    // ─── EXPORTAR EXCEL NOMINAL ───
    const handleExportExcel = () => {
        try {
            const rows = pacientesTabla.map(r => ({
                'Período Telar': `${effectiveDesde} a ${effectiveHasta}`,
                'Admisión': r.numero_admision || '',
                'Paciente': r.paciente,
                'NHC': r.nhc || '',
                'DNI': r.nif || '',
                'Sector': r.sector_arreglado,
                'Subsector': r.subsector || '',
                'Fecha Ingreso': fmtDateTimeAR(r.fecha_ingreso),
                'Fecha Alta': fmtDateTimeAR(r.fecha_alta),
                'Obra Social': r.cliente,
                'Médico Responsable': r.doctor,
                'Especialidad': r.especialidad,
                'Proceso': r.proceso || '',
                'Días Cama / Horas HdD': r.dias_cama_ventana,
            }));
            const ws = XLSX.utils.json_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Detalle Pacientes');
            XLSX.writeFile(wb, `Internacion_Pacientes_${effectiveDesde}_a_${effectiveHasta}.xlsx`);
            addToast?.(`Excel exportado con ${rows.length} registros`, 'success');
        } catch (err) {
            console.error(err);
            addToast?.('Error al exportar Excel', 'error');
        }
    };

    // ─── GUARDAR DOTACIÓN DE CAMAS ───
    const handleUpdateCamaConfig = async (row, field, val) => {
        const num = parseFloat(val);
        if (isNaN(num) || num <= 0) return;
        setSavingConfig(true);
        try {
            const { error } = await supabase
                .from('gob_internacion_camas_config')
                .update({ [field]: num, updated_at: new Date().toISOString() })
                .eq('id', row.id);
            if (error) throw error;
            setCamasConfig(prev => prev.map(c => c.id === row.id ? { ...c, [field]: num } : c));
            addToast?.('Dotación actualizada', 'success');
        } catch (err) {
            addToast?.('Error guardando dotación', 'error');
        } finally {
            setSavingConfig(false);
        }
    };

    // ─── GESTIÓN DE MÉDICOS INQUILINOS ───
    const handleAddInquilino = async () => {
        const nombre = newInquilinoName.trim().toUpperCase();
        if (!nombre) return;
        setSavingConfig(true);
        try {
            const { data, error } = await supabase
                .from('gob_internacion_inquilinos')
                .upsert({ doctor_nombre: nombre, activo: true, updated_at: new Date().toISOString() }, { onConflict: 'doctor_nombre' })
                .select()
                .single();
            if (error) throw error;
            setInquilinos(prev => {
                const exists = prev.some(i => i.doctor_nombre === nombre);
                return exists ? prev.map(i => i.doctor_nombre === nombre ? data : i) : [...prev, data].sort((a, b) => a.doctor_nombre.localeCompare(b.doctor_nombre));
            });
            setNewInquilinoName('');
            addToast?.(`Médico inquilino agregado: ${nombre}`, 'success');
        } catch (err) {
            addToast?.('Error agregando inquilino', 'error');
        } finally {
            setSavingConfig(false);
        }
    };

    const handleDeleteInquilino = async (id) => {
        const { error } = await supabase.from('gob_internacion_inquilinos').delete().eq('id', id);
        if (!error) {
            setInquilinos(prev => prev.filter(i => i.id !== id));
            addToast?.('Médico removido de nómina de inquilinos', 'info');
        }
    };

    const goToDetallesWithSector = (sectoresArr) => {
        setSelectedSectoresDetalles(sectoresArr);
        setActiveTab('detalles');
    };

    const yearsAll = [2021, 2022, 2023, 2024, 2025, 2026];
    const years22 = [2022, 2023, 2024, 2025, 2026];
    const years23 = [2023, 2024, 2025, 2026];
    const years25 = [2025, 2026];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontFamily: 'Inter, system-ui, sans-serif' }}>
            {/* ═══ HEADER INSTITUCIONAL CALIDAD-QOAG (SINCRONIZADO AL TELAR) ═══ */}
            <div style={{
                background: 'linear-gradient(135deg, #003B73 0%, #0284C7 100%)',
                borderRadius: '14px',
                padding: '20px 24px',
                color: '#FFFFFF',
                boxShadow: '0 6px 20px -4px rgba(0, 59, 115, 0.25)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
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
                            {filtrosMeta.last_sync && (
                                <span style={{ fontSize: '0.7rem', opacity: 0.85 }}>
                                    Base SALUS: {fmtDateTimeAR(filtrosMeta.last_sync)}
                                </span>
                            )}
                        </div>
                        <h2 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
                            TABLERO DE INTERNACIÓN
                        </h2>
                        <div style={{ fontSize: '0.8rem', opacity: 0.88, marginTop: '2px' }}>
                            Gobernanza de Datos · Neonatología, Pediatría (Piso & UTIP), Internado Adultos, Terapia Adultos y Hospital de Día
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={() => setShowCamasModal(true)}
                            style={{
                                background: 'rgba(255,255,255,0.14)',
                                border: '1px solid rgba(255,255,255,0.28)',
                                color: '#FFFFFF',
                                borderRadius: '8px',
                                padding: '7px 12px',
                                fontSize: '0.76rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                            }}
                        >
                            <Settings size={14} /> Dotación Camas
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowInquilinosModal(true)}
                            style={{
                                background: 'rgba(255,255,255,0.14)',
                                border: '1px solid rgba(255,255,255,0.28)',
                                color: '#FFFFFF',
                                borderRadius: '8px',
                                padding: '7px 12px',
                                fontSize: '0.76rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                            }}
                        >
                            <Building2 size={14} /> Inquilinos ({inquilinos.filter(i => i.activo).length})
                        </button>
                        <button
                            type="button"
                            onClick={handleExportExcel}
                            style={{
                                background: '#10B981',
                                border: 'none',
                                color: '#FFFFFF',
                                borderRadius: '8px',
                                padding: '7px 12px',
                                fontSize: '0.76rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                            }}
                        >
                            <FileSpreadsheet size={14} /> Excel Pacientes
                        </button>
                        <button
                            type="button"
                            onClick={() => { loadAggData(); loadNominalData(); loadMetadata(); }}
                            style={{
                                background: 'rgba(255,255,255,0.14)',
                                border: '1px solid rgba(255,255,255,0.28)',
                                color: '#FFFFFF',
                                borderRadius: '8px',
                                padding: '7px 10px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                            }}
                            title="Refrescar datos"
                        >
                            <RefreshCw size={14} className={loadingAgg || loadingNominal ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                {/* 4 KPI CARDS DEL PERÍODO TELAR */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                    <div style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '10px', padding: '14px 16px' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', opacity: 0.85, letterSpacing: '0.04em' }}>
                            Ingresos (Período Telar)
                        </div>
                        <div style={{ fontSize: '1.9rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums', marginTop: '2px' }}>
                            {loadingNominal ? '...' : fmtNum(telarKpis.ingresosPeriodo)}
                        </div>
                        <div style={{ fontSize: '0.72rem', opacity: 0.85, marginTop: '2px' }}>
                            Internado: {fmtNum(telarKpis.bySector.INTERNADO?.ingresos || 0)} · Neo: {fmtNum(telarKpis.bySector.NEONATOLOGIA?.ingresos || 0)} · Ped: {fmtNum(telarKpis.bySector.PEDIATRIA?.ingresos || 0)}
                        </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '10px', padding: '14px 16px' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', opacity: 0.85, letterSpacing: '0.04em' }}>
                            Días Cama (Regla 0,5)
                        </div>
                        <div style={{ fontSize: '1.9rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums', marginTop: '2px', color: '#BAE6FD' }}>
                            {loadingNominal ? '...' : fmtNum(telarKpis.diasCamaPeriodo, 1)}
                        </div>
                        <div style={{ fontSize: '0.72rem', opacity: 0.85, marginTop: '2px' }}>
                            Int: {fmtNum(telarKpis.bySector.INTERNADO?.diasCama || 0, 1)} · Neo: {fmtNum(telarKpis.bySector.NEONATOLOGIA?.diasCama || 0, 1)} · UCI: {fmtNum((telarKpis.bySector.UCI?.diasCama || 0) + (telarKpis.bySector['TERAPIA INTERMEDIA']?.diasCama || 0), 1)}
                        </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '10px', padding: '14px 16px' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', opacity: 0.85, letterSpacing: '0.04em' }}>
                            % Ocupación ({MESES_CORTO[telarYMD.m - 1]} {telarYMD.y})
                        </div>
                        <div style={{ fontSize: '1.9rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums', marginTop: '2px', color: '#FDE68A' }}>
                            {telarKpis.ocupIntMes !== null ? `${fmtNum(telarKpis.ocupIntMes, 1)}%` : '—'}
                        </div>
                        <div style={{ fontSize: '0.72rem', opacity: 0.85, marginTop: '2px' }}>
                            Internado Adultos · Neonatología: {telarKpis.ocupNeoMes !== null ? `${fmtNum(telarKpis.ocupNeoMes, 1)}%` : '—'}
                        </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '10px', padding: '14px 16px' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', opacity: 0.85, letterSpacing: '0.04em' }}>
                            Hospital de Día (Horas)
                        </div>
                        <div style={{ fontSize: '1.9rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums', marginTop: '2px', color: '#A7F3D0' }}>
                            {loadingNominal ? '...' : `${fmtNum(telarKpis.horasHddPeriodo, 1)} hs`}
                        </div>
                        <div style={{ fontSize: '0.72rem', opacity: 0.85, marginTop: '2px' }}>
                            C/Hierro · Ingresos s/Hierro: {fmtNum(telarKpis.ingresosHddSinHierro)}
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ BARRA DE PESTAÑAS + FILTROS NO TEMPORALES ═══ */}
            <div style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '10px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                boxShadow: '0 1px 2px rgba(15,23,42,0.03)',
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
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                <Icon size={14} />
                                {t.label}
                            </button>
                        );
                    })}
                </div>

                {/* Filtros globales de Obra Social y Especialidad (sin duplicar fechas del Telar) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', paddingTop: '6px', borderTop: '1px solid #F1F5F9' }}>
                    <span style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748B', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Filter size={13} /> Filtros:
                    </span>
                    <select
                        value={filterCliente}
                        onChange={e => setFilterCliente(e.target.value)}
                        style={{
                            padding: '5px 10px',
                            borderRadius: '7px',
                            border: '1px solid #CBD5E1',
                            fontSize: '0.76rem',
                            color: '#1E293B',
                            background: '#FFFFFF',
                            maxWidth: '280px',
                        }}
                    >
                        <option value="">Obra Social: Todas</option>
                        {(filtrosMeta.clientes || []).map(c => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>

                    <select
                        value={filterEspecialidad}
                        onChange={e => setFilterEspecialidad(e.target.value)}
                        style={{
                            padding: '5px 10px',
                            borderRadius: '7px',
                            border: '1px solid #CBD5E1',
                            fontSize: '0.76rem',
                            color: '#1E293B',
                            background: '#FFFFFF',
                            maxWidth: '240px',
                        }}
                    >
                        <option value="">Especialidad: Todas</option>
                        {(filtrosMeta.especialidades || []).map(esp => (
                            <option key={esp} value={esp}>{esp}</option>
                        ))}
                    </select>

                    {(filterCliente || filterEspecialidad || filterProceso) && (
                        <button
                            type="button"
                            onClick={() => { setFilterCliente(''); setFilterEspecialidad(''); setFilterProceso(''); }}
                            style={{
                                padding: '5px 10px',
                                borderRadius: '7px',
                                border: '1px solid #FCA5A5',
                                background: '#FEF2F2',
                                color: '#B91C1C',
                                fontSize: '0.73rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                            }}
                        >
                            Limpiar filtros
                        </button>
                    )}
                </div>
            </div>

            {/* ═══ CONTENIDO POR PESTAÑA ═══ */}

            {/* 1. PORTAL RESUMEN (EQUIVALENTE A PANTALLA INICIO TABLEAU) */}
            {activeTab === 'portal' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                    {[
                        { tab: 'neonatologia', title: 'Neonatología', desc: 'Terapia Neonatal · Días Cama multianual, Promedio Anual, Ingresos y Egresos', metric: `${fmtNum(telarKpis.bySector.NEONATOLOGIA?.diasCama || 0, 1)} días cama`, sub: `${fmtNum(telarKpis.bySector.NEONATOLOGIA?.ingresos || 0)} ingresos en período Telar`, color: '#0284C7', icon: Baby },
                        { tab: 'pediatria', title: 'Pediatría', desc: 'Internación Pediátrica desglosada en PISO y TERAPIA (UTIP)', metric: `${fmtNum(telarKpis.bySector.PEDIATRIA?.diasCama || 0, 1)} días cama`, sub: `${fmtNum(telarKpis.bySector.PEDIATRIA?.ingresos || 0)} ingresos en período Telar`, color: '#7C3AED', icon: HeartPulse },
                        { tab: 'internado', title: 'Internado Adultos', desc: 'Ingresos multianuales, Promedio Anual y matriz Días Cama 2021–2026', metric: `${fmtNum(telarKpis.bySector.INTERNADO?.diasCama || 0, 1)} días cama`, sub: `${fmtNum(telarKpis.bySector.INTERNADO?.ingresos || 0)} ingresos en período Telar`, color: '#003B73', icon: Bed },
                        { tab: 'terapia', title: 'Terapia Adultos', desc: 'Matrices separadas de UCI y Terapia Intermedia (Ingresos, Egresos, Días Cama)', metric: `${fmtNum((telarKpis.bySector.UCI?.diasCama || 0) + (telarKpis.bySector['TERAPIA INTERMEDIA']?.diasCama || 0), 1)} días cama`, sub: `UCI: ${fmtNum(telarKpis.bySector.UCI?.ingresos || 0)} · Intermedia: ${fmtNum(telarKpis.bySector['TERAPIA INTERMEDIA']?.ingresos || 0)} ing.`, color: '#DC2626', icon: Activity },
                        { tab: 'hdd', title: 'Hospital de Día', desc: 'Ocupación expresada en Horas (c/Hierro) e Ingresos (s/colocación Hierro)', metric: `${fmtNum(telarKpis.horasHddPeriodo, 1)} horas`, sub: `${fmtNum(telarKpis.ingresosHddSinHierro)} ingresos s/Hierro`, color: '#059669', icon: Clock },
                        { tab: 'tablas', title: 'Tablas Días Cama / Ingresos / % Ocupación', desc: 'Consolidado multianual por servicio con semáforo de ocupación', metric: telarKpis.ocupIntMes !== null ? `${fmtNum(telarKpis.ocupIntMes, 1)}%` : 'Ver tablas', sub: 'Ocupación Internado mes activo', color: '#0F766E', icon: Table2 },
                        { tab: 'detalles', title: 'Detalles de Internaciones', desc: 'Rankings por Médico Responsable, Obra Social, Especialidad e Inquilinos', metric: `${fmtNum(detallesData.total)} admisiones`, sub: `Inquilinos: ${fmtNum(detallesData.inquilinosSiPct, 1)}%`, color: '#4F46E5', icon: BarChart3 },
                        { tab: 'pacientes', title: 'Detalle de Pacientes', desc: 'Auditoría nominal paciente por paciente con cálculo 0,5 y descarga Excel', metric: `${fmtNum(pacientesTabla.length)} pacientes`, sub: 'En ventana activa del Telar', color: '#334155', icon: Users },
                    ].map(card => {
                        const Icon = card.icon;
                        return (
                            <button
                                key={card.tab}
                                type="button"
                                onClick={() => setActiveTab(card.tab)}
                                style={{
                                    textAlign: 'left',
                                    background: '#FFFFFF',
                                    border: '1px solid #E2E8F0',
                                    borderTop: `4px solid ${card.color}`,
                                    borderRadius: '10px',
                                    padding: '16px',
                                    cursor: 'pointer',
                                    boxShadow: '0 1px 3px rgba(15,23,42,0.05)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    gap: '10px',
                                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(15,23,42,0.08)'; }}
                                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(15,23,42,0.05)'; }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ padding: '7px', borderRadius: '8px', background: `${card.color}15`, color: card.color, display: 'inline-flex' }}>
                                            <Icon size={18} />
                                        </span>
                                        <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0F172A' }}>{card.title}</span>
                                    </div>
                                    <ChevronRight size={16} color="#94A3B8" />
                                </div>
                                <div style={{ fontSize: '0.76rem', color: '#64748B', lineHeight: 1.4 }}>{card.desc}</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: '8px', borderTop: '1px solid #F1F5F9' }}>
                                    <span style={{ fontSize: '1.1rem', fontWeight: 900, color: card.color, fontVariantNumeric: 'tabular-nums' }}>{card.metric}</span>
                                    <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>{card.sub}</span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* 2. NEONATOLOGÍA */}
            {activeTab === 'neonatologia' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#003B73' }}>Terapia Neonatal</h3>
                        <button
                            type="button"
                            onClick={() => goToDetallesWithSector(['NEONATOLOGIA'])}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #0284C7', background: '#F0F9FF', color: '#003B73', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                            Más Detalles (Rankings Neo) →
                        </button>
                    </div>
                    <MultiYearLineAndAvg
                        title="Días Cama — Terapia Neonatal (2022–2026)"
                        rowsByYear={matrices.neoDias}
                        years={years22}
                        decimals={1}
                        highlightMonth={telarYMD.m}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '16px' }}>
                        <MatrixTable
                            title="Ingresos - Neo"
                            rowsByYear={matrices.neoIng}
                            years={yearsAll}
                            decimals={0}
                            showTotal
                            highlightYear={telarYMD.y}
                            highlightMonth={telarYMD.m}
                        />
                        <MatrixTable
                            title="Egresos - Neo"
                            rowsByYear={matrices.neoEgr}
                            years={years22}
                            decimals={0}
                            highlightYear={telarYMD.y}
                            highlightMonth={telarYMD.m}
                        />
                    </div>
                </div>
            )}

            {/* 3. PEDIATRÍA (PISO vs TERAPIA UTIP) */}
            {activeTab === 'pediatria' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#003B73' }}>Internación Pediátrica (Piso vs. Terapia UTIP)</h3>
                        <button
                            type="button"
                            onClick={() => goToDetallesWithSector(['PEDIATRIA'])}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #7C3AED', background: '#F5F3FF', color: '#5B21B6', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                            Más Detalles (Rankings Pediatría) →
                        </button>
                    </div>
                    <MultiYearLineAndAvg
                        title="Días Cama — PISO Pediátrico"
                        rowsByYear={matrices.pedPisoDias}
                        years={years23}
                        decimals={1}
                        highlightMonth={telarYMD.m}
                        height={240}
                    />
                    <MultiYearLineAndAvg
                        title="Días Cama — TERAPIA Pediátrica (UTIP)"
                        rowsByYear={matrices.pedTerDias}
                        years={years23}
                        decimals={1}
                        highlightMonth={telarYMD.m}
                        height={240}
                    />
                </div>
            )}

            {/* 4. INTERNADO DE ADULTOS */}
            {activeTab === 'internado' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#003B73' }}>Internado de Adultos</h3>
                        <button
                            type="button"
                            onClick={() => goToDetallesWithSector(['INTERNADO'])}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #003B73', background: '#EFF6FF', color: '#003B73', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                            Más Detalles (Rankings Internado) →
                        </button>
                    </div>
                    <MultiYearLineAndAvg
                        title="Ingresos - Internado (2021–2026)"
                        rowsByYear={matrices.intIng}
                        years={yearsAll}
                        decimals={0}
                        highlightMonth={telarYMD.m}
                    />
                    <MatrixTable
                        title="Días Cama — Internado Adultos"
                        rowsByYear={matrices.intDias}
                        years={yearsAll}
                        decimals={1}
                        showTotal
                        highlightYear={telarYMD.y}
                        highlightMonth={telarYMD.m}
                    />
                </div>
            )}

            {/* 5. TERAPIA DE ADULTOS (UCI vs TERAPIA INTERMEDIA) */}
            {activeTab === 'terapia' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#003B73' }}>Terapia de Adultos (UCI & Terapia Intermedia)</h3>
                        <button
                            type="button"
                            onClick={() => goToDetallesWithSector(['UCI', 'TERAPIA INTERMEDIA'])}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #DC2626', background: '#FEF2F2', color: '#991B1B', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                            Más Detalles (UCI & Intermedia) →
                        </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '14px' }}>
                        <MatrixTable title="Ingresos - UCI" rowsByYear={matrices.uciIng} years={years25} decimals={0} highlightYear={telarYMD.y} highlightMonth={telarYMD.m} />
                        <MatrixTable title="Ingresos - Terapia Intermedia" rowsByYear={matrices.tiIng} years={years25} decimals={0} highlightYear={telarYMD.y} highlightMonth={telarYMD.m} />
                        <MatrixTable title="Egresos - UCI" rowsByYear={matrices.uciEgr} years={years25} decimals={0} highlightYear={telarYMD.y} highlightMonth={telarYMD.m} />
                        <MatrixTable title="Egresos - Terapia Intermedia" rowsByYear={matrices.tiEgr} years={years25} decimals={0} highlightYear={telarYMD.y} highlightMonth={telarYMD.m} />
                        <MatrixTable title="Días Cama UCI" rowsByYear={matrices.uciDias} years={years25} decimals={1} highlightYear={telarYMD.y} highlightMonth={telarYMD.m} />
                        <MatrixTable title="Días Cama Terapia Intermedia" rowsByYear={matrices.tiDias} years={years25} decimals={1} highlightYear={telarYMD.y} highlightMonth={telarYMD.m} />
                    </div>
                </div>
            )}

            {/* 6. HOSPITAL DE DÍA */}
            {activeTab === 'hdd' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#003B73' }}>Hospital de Día (HdD)</h3>
                        <button
                            type="button"
                            onClick={() => goToDetallesWithSector(['HOSPITAL DE DIA'])}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #059669', background: '#ECFDF5', color: '#065F46', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                            Más Detalles (Rankings HdD) →
                        </button>
                    </div>
                    <MultiYearLineAndAvg
                        title="Días cama: expresado en Horas (C/ colocación de Hierro)"
                        rowsByYear={matrices.hddHorasConHierro}
                        years={years22}
                        decimals={1}
                        unitLabel=" hs"
                        highlightMonth={telarYMD.m}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '16px' }}>
                        <MatrixTable
                            title="Ingresos - HdD (s/colocación Hierro)"
                            rowsByYear={matrices.hddIngSinHierro}
                            years={years22}
                            decimals={0}
                            showTotal
                            highlightYear={telarYMD.y}
                            highlightMonth={telarYMD.m}
                        />
                        <MatrixTable
                            title="Horas de ocupación - HdD (C/ colocación de Hierro)"
                            rowsByYear={matrices.hddHorasConHierro}
                            years={years22}
                            decimals={1}
                            highlightYear={telarYMD.y}
                            highlightMonth={telarYMD.m}
                        />
                    </div>
                </div>
            )}

            {/* 7. TABLAS MATRICIALES CONSOLIDADAS (DÍA CAMA / INGRESOS / % OCUPACIÓN) */}
            {activeTab === 'tablas' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{ display: 'inline-flex', background: '#F1F5F9', padding: '4px', borderRadius: '10px', gap: '4px' }}>
                            {[
                                { id: 'dias_cama', label: 'Días Cama por Servicio' },
                                { id: 'ingresos', label: 'Ingresos por Servicio' },
                                { id: 'ocupacion', label: '% de Ocupación' },
                            ].map(st => (
                                <button
                                    key={st.id}
                                    type="button"
                                    onClick={() => setTablaSubTab(st.id)}
                                    style={{
                                        padding: '7px 14px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: tablaSubTab === st.id ? '#FFFFFF' : 'transparent',
                                        color: tablaSubTab === st.id ? '#003B73' : '#64748B',
                                        fontWeight: tablaSubTab === st.id ? 800 : 600,
                                        fontSize: '0.78rem',
                                        cursor: 'pointer',
                                        boxShadow: tablaSubTab === st.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                    }}
                                >
                                    {st.label}
                                </button>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                            {tablaSubTab === 'ocupacion' && (
                                <button
                                    type="button"
                                    onClick={() => setShowCamasModal(true)}
                                    style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#334155', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                                >
                                    ⚙️ Ajustar dotación de camas
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setActiveTab('pacientes')}
                                style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #0284C7', background: '#F0F9FF', color: '#003B73', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                            >
                                Detalle paciente →
                            </button>
                        </div>
                    </div>

                    {tablaSubTab === 'dias_cama' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(520px, 1fr))', gap: '16px' }}>
                            <MatrixTable title="Internado — Días Cama" rowsByYear={matrices.intDias} years={years22} decimals={1} highlightYear={telarYMD.y} highlightMonth={telarYMD.m} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <MatrixTable title="Pediatría — PISO (Días Cama)" rowsByYear={matrices.pedPisoDias} years={years22} decimals={1} highlightYear={telarYMD.y} highlightMonth={telarYMD.m} />
                                <MatrixTable title="Pediatría — TERAPIA / UTIP (Días Cama)" rowsByYear={matrices.pedTerDias} years={years22} decimals={1} highlightYear={telarYMD.y} highlightMonth={telarYMD.m} />
                            </div>
                            <MatrixTable title="Neonatología — Días Cama" rowsByYear={matrices.neoDias} years={years22} decimals={1} highlightYear={telarYMD.y} highlightMonth={telarYMD.m} />
                            <MatrixTable title="Horas de ocupación - HdD (C/ colocación de Hierro)" rowsByYear={matrices.hddHorasConHierro} years={years22} decimals={1} highlightYear={telarYMD.y} highlightMonth={telarYMD.m} />
                        </div>
                    )}

                    {tablaSubTab === 'ingresos' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(520px, 1fr))', gap: '16px' }}>
                            <MatrixTable title="Ingresos - Internado" rowsByYear={matrices.intIng} years={years22} decimals={0} showTotal highlightYear={telarYMD.y} highlightMonth={telarYMD.m} />
                            <MatrixTable title="Ingresos - Pediatría" rowsByYear={matrices.pedIng} years={years22} decimals={0} showTotal highlightYear={telarYMD.y} highlightMonth={telarYMD.m} />
                            <MatrixTable title="Ingresos - Neo" rowsByYear={matrices.neoIng} years={yearsAll} decimals={0} showTotal highlightYear={telarYMD.y} highlightMonth={telarYMD.m} />
                            <MatrixTable title="Ingresos - HdD (s/colocación Hierro)" rowsByYear={matrices.hddIngSinHierro} years={years22} decimals={0} showTotal highlightYear={telarYMD.y} highlightMonth={telarYMD.m} />
                        </div>
                    )}

                    {tablaSubTab === 'ocupacion' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(520px, 1fr))', gap: '16px' }}>
                            <MatrixTable title="% Ocupación — Internado" rowsByYear={ocupacionMatrices.internado} years={years22} decimals={1} suffix="%" colorScaleOccupancy highlightYear={telarYMD.y} highlightMonth={telarYMD.m} />
                            <MatrixTable title="% Ocupación — Horas HdD (C/ colocación de Hierro)" rowsByYear={ocupacionMatrices.hdd} years={years22} decimals={1} suffix="%" colorScaleOccupancy highlightYear={telarYMD.y} highlightMonth={telarYMD.m} />
                            <MatrixTable title="% Ocupación — Neonatología" rowsByYear={ocupacionMatrices.neonatologia} years={years22} decimals={1} suffix="%" colorScaleOccupancy highlightYear={telarYMD.y} highlightMonth={telarYMD.m} />
                            <MatrixTable title="% Ocupación — UCI Adultos" rowsByYear={ocupacionMatrices.uci} years={years25} decimals={1} suffix="%" colorScaleOccupancy highlightYear={telarYMD.y} highlightMonth={telarYMD.m} />
                        </div>
                    )}
                </div>
            )}

            {/* 8. DETALLES DE INTERNACIONES (RANKINGS + INQUILINOS, PERÍODO TELAR) */}
            {activeTab === 'detalles' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Barra de filtros Sector Arreglado + Proceso */}
                    <div style={{
                        background: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: '10px',
                        padding: '12px 14px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.73rem', fontWeight: 800, color: '#003B73', marginRight: '4px' }}>SECTOR Arreglado:</span>
                            {SECTORES_LISTA.map(sec => {
                                const checked = selectedSectoresDetalles.includes(sec);
                                return (
                                    <button
                                        key={sec}
                                        type="button"
                                        onClick={() => {
                                            setSelectedSectoresDetalles(prev =>
                                                prev.includes(sec) ? prev.filter(x => x !== sec) : [...prev, sec]
                                            );
                                        }}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            padding: '4px 9px',
                                            borderRadius: '6px',
                                            border: checked ? '1px solid #0284C7' : '1px solid #CBD5E1',
                                            background: checked ? '#EFF6FF' : '#FFFFFF',
                                            color: checked ? '#003B73' : '#64748B',
                                            fontSize: '0.71rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {checked ? <CheckSquare size={12} /> : <Square size={12} />}
                                        {sec}
                                    </button>
                                );
                            })}
                        </div>

                        <select
                            value={filterProceso}
                            onChange={e => setFilterProceso(e.target.value)}
                            style={{
                                padding: '5px 10px',
                                borderRadius: '7px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.75rem',
                                maxWidth: '280px',
                            }}
                        >
                            <option value="">Proceso: Todos</option>
                            {detallesData.procesosUnicos.map(p => (
                                <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                    </div>

                    {/* Grilla 3 columnas como Tableau: Ranking Médico | Ranking Obra Social | (Inquilinos + Ranking Especialidad) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(260px, 1fr) minmax(320px, 1.35fr)', gap: '14px', alignItems: 'start' }}>
                        {/* Ranking Médico Resp. */}
                        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
                            <div style={{ padding: '10px 14px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#003B73' }}>Ranking Médico Resp.</span>
                                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0284C7' }}>Total: {fmtNum(detallesData.total)}</span>
                            </div>
                            <div style={{ maxHeight: '560px', overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.73rem', fontVariantNumeric: 'tabular-nums' }}>
                                    <tbody>
                                        {detallesData.medicos.map((m, idx) => (
                                            <tr key={m.name} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 ? '#F8FAFC' : '#FFFFFF' }}>
                                                <td style={{ padding: '6px 10px', color: '#1E293B', fontWeight: 600 }}>{m.name}</td>
                                                <td style={{ padding: '6px 6px', textAlign: 'right', color: '#64748B', width: '52px' }}>{fmtNum(m.pct, 2)}%</td>
                                                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 800, color: '#003B73', width: '44px' }}>{fmtNum(m.count)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Ranking Obra Social */}
                        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
                            <div style={{ padding: '10px 14px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#003B73' }}>Ranking Obra Social</span>
                                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0284C7' }}>Total: {fmtNum(detallesData.total)}</span>
                            </div>
                            <div style={{ maxHeight: '560px', overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.73rem', fontVariantNumeric: 'tabular-nums' }}>
                                    <tbody>
                                        {detallesData.obrasSociales.map((o, idx) => (
                                            <tr key={o.name} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 ? '#F8FAFC' : '#FFFFFF' }}>
                                                <td style={{ padding: '6px 10px', color: '#1E293B', fontWeight: 600 }}>{o.name}</td>
                                                <td style={{ padding: '6px 6px', textAlign: 'right', color: '#64748B', width: '52px' }}>{fmtNum(o.pct, 2)}%</td>
                                                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 800, color: '#003B73', width: '44px' }}>{fmtNum(o.count)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Derecha: Internación de Inquilinos + Ranking Especialidad */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px 16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#003B73' }}>Internación de Inquilinos</span>
                                    <button
                                        type="button"
                                        onClick={() => setShowInquilinosModal(true)}
                                        style={{ padding: '4px 9px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#F8FAFC', fontSize: '0.7rem', fontWeight: 700, color: '#334155', cursor: 'pointer' }}
                                    >
                                        Editar Nómina ({inquilinos.filter(i => i.activo).length})
                                    </button>
                                </div>
                                <div style={{ display: 'flex', height: '38px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E2E8F0', fontSize: '0.78rem', fontWeight: 800 }}>
                                    <div style={{
                                        width: `${detallesData.inquilinosNullPct}%`,
                                        background: '#E2E8F0',
                                        color: '#334155',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        minWidth: detallesData.inquilinosNullPct > 10 ? 'auto' : 0,
                                    }}>
                                        {detallesData.inquilinosNullPct > 12 && `No Inquilino: ${fmtNum(detallesData.inquilinosNullPct, 2)}%`}
                                    </div>
                                    <div style={{
                                        width: `${detallesData.inquilinosSiPct}%`,
                                        background: '#0284C7',
                                        color: '#FFFFFF',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        minWidth: detallesData.inquilinosSiPct > 10 ? 'auto' : 0,
                                    }}>
                                        {detallesData.inquilinosSiPct > 12 && `SI: ${fmtNum(detallesData.inquilinosSiPct, 2)}%`}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.72rem', color: '#64748B' }}>
                                    <span>NULL (Externo / Staff): <strong>{fmtNum(detallesData.inquilinosNull)}</strong> ({fmtNum(detallesData.inquilinosNullPct, 2)}%)</span>
                                    <span>SI (Inquilino): <strong style={{ color: '#0284C7' }}>{fmtNum(detallesData.inquilinosSi)}</strong> ({fmtNum(detallesData.inquilinosSiPct, 2)}%)</span>
                                </div>
                            </div>

                            {/* Ranking Especialidad */}
                            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
                                <div style={{ padding: '10px 14px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#003B73' }}>Ranking Especialidad</span>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0284C7' }}>Total: {fmtNum(detallesData.total)}</span>
                                </div>
                                <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.73rem', fontVariantNumeric: 'tabular-nums' }}>
                                        <tbody>
                                            {detallesData.especialidades.map((e, idx) => (
                                                <tr key={e.name} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 ? '#F8FAFC' : '#FFFFFF' }}>
                                                    <td style={{ padding: '6px 10px', color: '#1E293B', fontWeight: 600 }}>{e.name}</td>
                                                    <td style={{ padding: '6px 6px', textAlign: 'right', color: '#64748B', width: '52px' }}>{fmtNum(e.pct, 2)}%</td>
                                                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 800, color: '#003B73', width: '44px' }}>{fmtNum(e.count)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 9. DETALLE NOMINAL DE PACIENTES (CON DESCARGA EXCEL) */}
            {activeTab === 'pacientes' && (
                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
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
                        <div>
                            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#003B73' }}>
                                DETALLE DE PACIENTES — {effectiveDesde} al {effectiveHasta}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                {fmtNum(pacientesTabla.length)} registros · Días Cama prorrateados exactos (regla 0,50) en ventana Telar
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <div style={{ position: 'relative' }}>
                                <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    type="text"
                                    value={pacientesSearch}
                                    onChange={e => setPacientesSearch(e.target.value)}
                                    placeholder="Buscar paciente, NHC, obra social..."
                                    style={{
                                        padding: '6px 10px 6px 28px',
                                        borderRadius: '7px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.76rem',
                                        width: '230px',
                                    }}
                                />
                            </div>
                            <select
                                value={pacientesSectorFilter}
                                onChange={e => setPacientesSectorFilter(e.target.value)}
                                style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #CBD5E1', fontSize: '0.76rem' }}
                            >
                                <option value="TODOS">Sector: Todos</option>
                                {SECTORES_LISTA.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <button
                                type="button"
                                onClick={handleExportExcel}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '7px',
                                    border: 'none',
                                    background: '#059669',
                                    color: '#FFFFFF',
                                    fontSize: '0.76rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                }}
                            >
                                <Download size={14} /> Descarga Excel
                            </button>
                        </div>
                    </div>

                    <div style={{ maxHeight: '600px', overflow: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums' }}>
                            <thead style={{ position: 'sticky', top: 0, background: '#F1F5F9', zIndex: 2 }}>
                                <tr style={{ borderBottom: '1px solid #CBD5E1', color: '#334155' }}>
                                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>Paciente</th>
                                    <th style={{ padding: '8px 8px', textAlign: 'left' }}>Sector</th>
                                    <th style={{ padding: '8px 8px', textAlign: 'left' }}>Fecha Ingreso</th>
                                    <th style={{ padding: '8px 8px', textAlign: 'left' }}>Fecha Alta</th>
                                    <th style={{ padding: '8px 8px', textAlign: 'left' }}>Obra Social</th>
                                    <th style={{ padding: '8px 8px', textAlign: 'left' }}>Médico Resp.</th>
                                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Días Cama / Hs</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pacientesTabla.slice(0, 500).map((r, idx) => (
                                    <tr key={r.id_admision} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 ? '#F8FAFC' : '#FFFFFF' }}>
                                        <td style={{ padding: '7px 10px', fontWeight: 700, color: '#0F172A' }}>
                                            {r.paciente}
                                            {r.nhc && <span style={{ marginLeft: '6px', fontSize: '0.68rem', color: '#94A3B8', fontWeight: 500 }}>NHC {r.nhc}</span>}
                                        </td>
                                        <td style={{ padding: '7px 8px' }}>
                                            <span style={{
                                                fontSize: '0.68rem',
                                                fontWeight: 700,
                                                padding: '2px 6px',
                                                borderRadius: '5px',
                                                background: SECTOR_META[r.sector_arreglado]?.bg || '#F1F5F9',
                                                color: SECTOR_META[r.sector_arreglado]?.color || '#334155',
                                            }}>
                                                {r.sector_arreglado}{r.subsector ? ` (${r.subsector})` : ''}
                                            </span>
                                        </td>
                                        <td style={{ padding: '7px 8px', color: '#475569' }}>{fmtDateTimeAR(r.fecha_ingreso)}</td>
                                        <td style={{ padding: '7px 8px', color: r.fecha_alta ? '#475569' : '#0284C7', fontWeight: r.fecha_alta ? 400 : 700 }}>{fmtDateTimeAR(r.fecha_alta)}</td>
                                        <td style={{ padding: '7px 8px', color: '#334155' }}>{r.cliente}</td>
                                        <td style={{ padding: '7px 8px', color: '#475569' }}>{r.doctor}</td>
                                        <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 800, color: '#003B73' }}>
                                            {fmtNum(r.dias_cama_ventana, 2)}{r.sector_arreglado === 'HOSPITAL DE DIA' ? ' hs' : ''}
                                        </td>
                                    </tr>
                                ))}
                                {pacientesTabla.length > 500 && (
                                    <tr>
                                        <td colSpan={7} style={{ padding: '10px', textAlign: 'center', color: '#64748B', fontSize: '0.74rem' }}>
                                            Mostrando los primeros 500 de {fmtNum(pacientesTabla.length)} registros. Usá el buscador o <strong>Descarga Excel</strong> para obtener el 100%.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ═══ MODAL: CONFIGURACIÓN DE DOTACIÓN DE CAMAS POR AÑO ═══ */}
            {showCamasModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div style={{ background: '#FFFFFF', borderRadius: '14px', width: '100%', maxWidth: '640px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
                        <div style={{ padding: '16px 20px', background: '#003B73', color: '#FFFFFF', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontSize: '0.95rem', fontWeight: 800 }}>Dotación Operativa de Camas (% Ocupación)</div>
                                <div style={{ fontSize: '0.73rem', opacity: 0.85 }}>Ajustá las camas/cunas operativas por año para calibrar exactamente el % de Ocupación.</div>
                            </div>
                            <button type="button" onClick={() => setShowCamasModal(false)} style={{ background: 'transparent', border: 'none', color: '#FFFFFF', cursor: 'pointer' }}><X size={18} /></button>
                        </div>
                        <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                                        <th style={{ padding: '6px', textAlign: 'left' }}>Sector</th>
                                        <th style={{ padding: '6px', textAlign: 'center' }}>Año</th>
                                        <th style={{ padding: '6px', textAlign: 'right' }}>Camas / Boxes</th>
                                        <th style={{ padding: '6px', textAlign: 'right' }}>Horas/Mes (HdD)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {camasConfig.map(c => (
                                        <tr key={c.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                            <td style={{ padding: '6px', fontWeight: 700, color: '#0F172A' }}>{c.sector}{c.subsector ? ` (${c.subsector})` : ''}</td>
                                            <td style={{ padding: '6px', textAlign: 'center', fontWeight: 700, color: '#0284C7' }}>{c.anio}</td>
                                            <td style={{ padding: '6px', textAlign: 'right' }}>
                                                <input
                                                    type="number"
                                                    defaultValue={c.camas_operativas}
                                                    onBlur={e => {
                                                        if (Number(e.target.value) !== Number(c.camas_operativas)) {
                                                            handleUpdateCamaConfig(c, 'camas_operativas', e.target.value);
                                                        }
                                                    }}
                                                    style={{ width: '74px', padding: '4px 6px', borderRadius: '6px', border: '1px solid #CBD5E1', textAlign: 'right', fontWeight: 700 }}
                                                />
                                            </td>
                                            <td style={{ padding: '6px', textAlign: 'right' }}>
                                                {c.sector === 'HOSPITAL DE DIA' ? (
                                                    <input
                                                        type="number"
                                                        defaultValue={c.horas_mes_hdd || 1200}
                                                        onBlur={e => {
                                                            if (Number(e.target.value) !== Number(c.horas_mes_hdd)) {
                                                                handleUpdateCamaConfig(c, 'horas_mes_hdd', e.target.value);
                                                            }
                                                        }}
                                                        style={{ width: '84px', padding: '4px 6px', borderRadius: '6px', border: '1px solid #CBD5E1', textAlign: 'right', fontWeight: 700 }}
                                                    />
                                                ) : <span style={{ color: '#CBD5E1' }}>—</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ MODAL: NÓMINA DE MÉDICOS INQUILINOS ═══ */}
            {showInquilinosModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div style={{ background: '#FFFFFF', borderRadius: '14px', width: '100%', maxWidth: '540px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
                        <div style={{ padding: '16px 20px', background: '#003B73', color: '#FFFFFF', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontSize: '0.95rem', fontWeight: 800 }}>Nómina de Médicos Inquilinos</div>
                                <div style={{ fontSize: '0.73rem', opacity: 0.85 }}>Ingresá el nombre exactamente como figura en el Ranking Médico de SALUS.</div>
                            </div>
                            <button type="button" onClick={() => setShowInquilinosModal(false)} style={{ background: 'transparent', border: 'none', color: '#FFFFFF', cursor: 'pointer' }}><X size={18} /></button>
                        </div>
                        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="text"
                                    list="salus-medicos-datalist"
                                    value={newInquilinoName}
                                    onChange={e => setNewInquilinoName(e.target.value)}
                                    placeholder="Ej: FLORES RETA, CECILIA ANDREA"
                                    style={{ flex: 1, padding: '8px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
                                />
                                <datalist id="salus-medicos-datalist">
                                    {detallesData.medicos.map(m => <option key={m.name} value={m.name} />)}
                                </datalist>
                                <button
                                    type="button"
                                    disabled={savingConfig}
                                    onClick={handleAddInquilino}
                                    style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#0284C7', color: '#FFFFFF', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                >
                                    <Plus size={14} /> Agregar
                                </button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {inquilinos.length === 0 ? (
                                    <div style={{ fontSize: '0.78rem', color: '#94A3B8', textAlign: 'center', padding: '16px' }}>
                                        Todavía no cargaste médicos inquilinos. Usá el autocompletado arriba para sumarlos.
                                    </div>
                                ) : inquilinos.map(inq => (
                                    <div key={inq.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0F172A' }}>{inq.doctor_nombre}</span>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteInquilino(inq.id)}
                                            style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer' }}
                                            title="Quitar"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
