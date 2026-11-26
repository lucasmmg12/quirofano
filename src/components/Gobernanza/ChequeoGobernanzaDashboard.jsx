import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Activity, BarChart3, Calendar, CalendarCheck, CheckCircle2, ClipboardCheck,
    Clock, Download, FileSpreadsheet, FileText, HeartPulse, MessageSquare,
    Mic, RefreshCw, Search, ShieldCheck, Stethoscope, Table2, Target,
    ThumbsUp, TrendingUp, Trophy, UserCheck, Users
} from 'lucide-react';
import {
    ResponsiveContainer, ComposedChart, BarChart, Bar, LineChart, Line,
    PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine
} from 'recharts';
import * as XLSX from 'xlsx';
import {
    MONTH_NAMES,
    fetchChequeoVisitas,
    fetchRenovacionAnualCandidates,
    aggregateChequeoAnalytics,
    fetchConversionWhatsAppData,
    computeConversionWhatsApp,
    fetchEncuestasCalidadChequeo
} from '../../services/chequeoGobernanzaService';
import DxiSuperficieTopografica3D from './DxiSuperficieTopografica3D';
import { AnilloToroidal3D, EmbudoConversion3D, CapsulaBalance3D } from './GobernanzaCharts3D';

const COLOR_PRIMARY = '#003B73';
const SERIES_PALETTE = ['#003B73', '#0284C7', '#10B981', '#6366F1', '#F59E0B', '#EC4899', '#8B5CF6', '#64748B'];
const ASISTENCIA_PIE_COLORS = {
    Presente: '#10B981',
    'Futuro Pendiente': '#0284C7',
    'Ausencia Justificada': '#F59E0B',
    'Ausencia Injustificada': '#F43F5E',
    'Sin marcar': '#94A3B8',
};

const TOOLTIP_STYLE = {
    backgroundColor: '#FFFFFF',
    border: '1px solid #CBD5E1',
    borderRadius: '10px',
    boxShadow: '0 8px 20px rgba(15, 23, 42, 0.08)',
    fontSize: '0.78rem',
};

function fmtFrt(mins) {
    if (mins === null || mins === undefined) return '—';
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getTodayIso() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/San_Juan' });
}

function KpiCard({ label, value, subtext, pill, pillBg = '#EFF6FF', pillColor = COLOR_PRIMARY, icon: Icon, accent = COLOR_PRIMARY, bg = '#EFF6FF' }) {
    return (
        <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '16px 18px',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748B' }}>{label}</span>
                {Icon && (
                    <div style={{
                        width: '30px', height: '30px', borderRadius: '8px',
                        background: bg, color: accent,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}>
                        <Icon size={16} />
                    </div>
                )}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
                    {value}
                </span>
                {pill && (
                    <span style={{
                        fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px',
                        borderRadius: '999px', background: pillBg, color: pillColor
                    }}>
                        {pill}
                    </span>
                )}
            </div>
            {subtext && <div style={{ fontSize: '0.72rem', color: '#64748B', lineHeight: 1.35 }}>{subtext}</div>}
        </div>
    );
}

function SectionCard({ title, subtitle, rightNode, children, style = {} }) {
    return (
        <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '18px 20px',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            ...style,
        }}>
            {(title || subtitle || rightNode) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                    <div>
                        {title && <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0F172A' }}>{title}</h4>}
                        {subtitle && <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: '#64748B' }}>{subtitle}</p>}
                    </div>
                    {rightNode && <div>{rightNode}</div>}
                </div>
            )}
            <div>{children}</div>
        </div>
    );
}

function HorizontalBarItem({ label, count, total, color }) {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.77rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                <span>{label}</span>
                <span style={{ fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                    {count.toLocaleString('es-AR')} ({pct}%)
                </span>
            </div>
            <div style={{ width: '100%', height: '8px', background: '#F1F5F9', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '999px', transition: 'width 0.35s ease' }} />
            </div>
        </div>
    );
}

export default function ChequeoGobernanzaDashboard() {
    const todayIso = useMemo(() => getTodayIso(), []);
    const [activeTab, setActiveTab] = useState('circuito'); // 'circuito' | 'asistencia' | 'conversion' | 'calidad' | 'renovacion'

    // Filtros globales
    const [datePreset, setDatePreset] = useState('2026'); // 'mes' | '30d' | '2026' | 'all' | 'custom'
    const [fechaDesde, setFechaDesde] = useState('2026-01-01');
    const [fechaHasta, setFechaHasta] = useState(todayIso);
    const [sedeFilter, setSedeFilter] = useState('TODAS'); // 'TODAS' | 'SANTA FE' | 'SAN LUIS'
    const [viewType, setViewType] = useState('comparativa'); // 'comparativa' | 'preventivo' | 'informe'

    // Modos 3D/2D
    const [evolChartMode, setEvolChartMode] = useState('3d'); // '3d' | '2d'
    const [yoyChartMode, setYoyChartMode] = useState('2d'); // '3d' | '2d'

    // Datos Pestañas 1 & 2 (recepciones_visitas CHQ)
    const [rawVisitas, setRawVisitas] = useState([]);
    const [loadingVisitas, setLoadingVisitas] = useState(true);
    const [progressText, setProgressText] = useState('');

    // Datos Pestaña 3 (Conversión WA → SALUS)
    const [convRaw, setConvRaw] = useState(null);
    const [loadingConv, setLoadingConv] = useState(false);
    const [convLoadedKey, setConvLoadedKey] = useState('');
    const [attributionMode, setAttributionMode] = useState('strict');
    const [attributionDays, setAttributionDays] = useState(14);
    const [categoriaFilter, setCategoriaFilter] = useState('all');
    const [auditSearch, setAuditSearch] = useState('');
    const [auditStatusFilter, setAuditStatusFilter] = useState('all');

    // Datos Pestaña 4 (Calidad & NPS)
    const [encuestas, setEncuestas] = useState([]);
    const [loadingEncuestas, setLoadingEncuestas] = useState(false);
    const [encuestasLoaded, setEncuestasLoaded] = useState(false);
    const [encuestaSubTab, setEncuestaSubTab] = useState('respondidas');
    const [encuestaSearch, setEncuestaSearch] = useState('');

    // Datos Pestaña 5 (Renovación Anual)
    const [renovacionData, setRenovacionData] = useState([]);
    const [loadingRenovacion, setLoadingRenovacion] = useState(false);
    const [renovacionLoaded, setRenovacionLoaded] = useState(false);

    const applyDatePreset = (preset) => {
        setDatePreset(preset);
        const now = new Date();
        const end = getTodayIso();
        if (preset === 'mes') {
            setFechaDesde(`${end.slice(0, 7)}-01`);
            setFechaHasta(end);
        } else if (preset === '30d') {
            const d = new Date(now);
            d.setDate(d.getDate() - 29);
            setFechaDesde(d.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/San_Juan' }));
            setFechaHasta(end);
        } else if (preset === '2026') {
            setFechaDesde('2026-01-01');
            setFechaHasta(end);
        } else if (preset === 'all') {
            setFechaDesde('2024-01-01');
            setFechaHasta('2026-12-31');
        }
    };

    const loadVisitas = useCallback(async () => {
        setLoadingVisitas(true);
        try {
            const data = await fetchChequeoVisitas((msg) => setProgressText(msg));
            setRawVisitas(data || []);
        } catch (err) {
            console.error('[ChequeoGobernanza] Error cargando visitas:', err);
        } finally {
            setLoadingVisitas(false);
            setProgressText('');
        }
    }, []);

    useEffect(() => { loadVisitas(); }, [loadVisitas]);

    // Lazy load Pestaña 3: Conversión WA
    const convRange = useMemo(() => {
        // Para conversión WA limitar por defecto a máximo 90d si el usuario está en histórico 2024-2026
        const start = fechaDesde < '2026-01-01' ? `${todayIso.slice(0, 7)}-01` : fechaDesde;
        const end = fechaHasta > todayIso ? todayIso : fechaHasta;
        return { startDate: start <= end ? start : end, endDate: end };
    }, [fechaDesde, fechaHasta, todayIso]);

    useEffect(() => {
        if (activeTab !== 'conversion') return;
        const key = `${convRange.startDate}_${convRange.endDate}`;
        if (convLoadedKey === key && convRaw) return;
        let active = true;
        setLoadingConv(true);
        fetchConversionWhatsAppData(convRange)
            .then(data => {
                if (active) {
                    setConvRaw(data);
                    setConvLoadedKey(key);
                }
            })
            .catch(err => console.error('[ChequeoGobernanza] Error conversión WA:', err))
            .finally(() => { if (active) setLoadingConv(false); });
        return () => { active = false; };
    }, [activeTab, convRange, convLoadedKey, convRaw]);

    // Lazy load Pestaña 4: Encuestas
    useEffect(() => {
        if (activeTab !== 'calidad' || encuestasLoaded) return;
        let active = true;
        setLoadingEncuestas(true);
        fetchEncuestasCalidadChequeo()
            .then(data => {
                if (active) {
                    setEncuestas(data || []);
                    setEncuestasLoaded(true);
                }
            })
            .catch(err => console.error('[ChequeoGobernanza] Error encuestas:', err))
            .finally(() => { if (active) setLoadingEncuestas(false); });
        return () => { active = false; };
    }, [activeTab, encuestasLoaded]);

    // Lazy load Pestaña 5: Renovación Anual
    useEffect(() => {
        if (activeTab !== 'renovacion' || renovacionLoaded) return;
        let active = true;
        setLoadingRenovacion(true);
        fetchRenovacionAnualCandidates()
            .then(data => {
                if (active) {
                    setRenovacionData(data || []);
                    setRenovacionLoaded(true);
                }
            })
            .catch(err => console.error('[ChequeoGobernanza] Error renovación:', err))
            .finally(() => { if (active) setLoadingRenovacion(false); });
        return () => { active = false; };
    }, [activeTab, renovacionLoaded]);

    // Agregados principales (Pestañas 1 y 2)
    const agg = useMemo(() => aggregateChequeoAnalytics(rawVisitas, {
        fechaDesde,
        fechaHasta,
        sede: sedeFilter,
        viewType
    }), [rawVisitas, fechaDesde, fechaHasta, sedeFilter, viewType]);

    // Agregados Pestaña 3 (Conversión WA)
    const convAnalytics = useMemo(() => {
        if (!convRaw) return null;
        return computeConversionWhatsApp(convRaw, {
            startDate: convRange.startDate,
            endDate: convRange.endDate,
            attributionMode,
            attributionDays,
            categoriaFilter
        });
    }, [convRaw, convRange, attributionMode, attributionDays, categoriaFilter]);

    const filteredAuditRows = useMemo(() => {
        if (!convAnalytics?.auditRows) return [];
        const q = auditSearch.trim().toLowerCase();
        return convAnalytics.auditRows.filter(r => {
            if (auditStatusFilter === 'concretado' && r.estadoPaciente !== 'Concretado') return false;
            if (auditStatusFilter === 'pendiente' && r.estadoPaciente !== 'Pendiente Futuro') return false;
            if (auditStatusFilter === 'ausente' && !r.estadoPaciente.startsWith('Ausen')) return false;
            if (auditStatusFilter === 'sin_turno' && r.tieneTurno) return false;
            if (!q) return true;
            return (
                (r.paciente || '').toLowerCase().includes(q) ||
                (r.phone || '').includes(q) ||
                (r.dni || '').includes(q) ||
                (r.obraSocial || '').toLowerCase().includes(q)
            );
        });
    }, [convAnalytics, auditSearch, auditStatusFilter]);

    // Agregados Pestaña 4 (Encuestas Calidad & NPS)
    const calidadMetrics = useMemo(() => {
        const filtered = encuestas.filter(e => {
            if (sedeFilter !== 'TODAS') {
                const c = String(e.centro || e.tipo_visita || '').toUpperCase();
                if (sedeFilter === 'SAN LUIS' && !c.includes('SAN LUIS')) return false;
                if (sedeFilter === 'SANTA FE' && c.includes('SAN LUIS')) return false;
            }
            if (encuestaSearch.trim()) {
                const q = encuestaSearch.trim().toLowerCase();
                const hit = [e.nombre_paciente, e.telefono, e.dni, e.obra_social, e.cierre_comentario]
                    .some(v => String(v || '').toLowerCase().includes(q));
                if (!hit) return false;
            }
            return true;
        });

        const totalEnviadas = filtered.length;
        const respondidas = filtered.filter(
            e => (e.q1_nps !== null && e.q1_nps !== undefined) || e.q2_claridad || e.q3_agilidad || e.estado === 'COMPLETADA' || e.cierre_audio_url || (e.cierre_comentario && e.cierre_comentario.trim())
        );
        const pendientes = filtered.filter(e => e.estado === 'INVITADO');
        const comentarios = respondidas.filter(e => (e.cierre_comentario && e.cierre_comentario.trim()) || Boolean(e.cierre_audio_url));
        const audios = respondidas.filter(e => Boolean(e.cierre_audio_url));
        const alertas = respondidas.filter(e => (e.q1_nps !== null && Number(e.q1_nps) <= 6) || e.q2_claridad === 'C' || e.q3_agilidad === 'C' || e.q3_agilidad === 'D');

        let promotores = 0, neutros = 0, detractores = 0, validNps = 0, sumNps = 0;
        const q2 = { A: 0, B: 0, C: 0 }; let q2Total = 0;
        const q3 = { A: 0, B: 0, C: 0, D: 0 }; let q3Total = 0;

        filtered.forEach(e => {
            if (e.q1_nps !== null && e.q1_nps !== undefined) {
                const sc = Number(e.q1_nps);
                validNps++; sumNps += sc;
                if (sc >= 9) promotores++;
                else if (sc <= 6) detractores++;
                else neutros++;
            }
            if (e.q2_claridad && q2[e.q2_claridad] !== undefined) { q2[e.q2_claridad]++; q2Total++; }
            if (e.q3_agilidad && q3[e.q3_agilidad] !== undefined) { q3[e.q3_agilidad]++; q3Total++; }
        });

        const nps = validNps > 0 ? Math.round(((promotores / validNps) - (detractores / validNps)) * 100) : 0;
        const avgNps = validNps > 0 ? (sumNps / validNps).toFixed(1) : '0.0';
        const responseRate = totalEnviadas > 0 ? ((respondidas.length / totalEnviadas) * 100).toFixed(1) : '0.0';
        const q2PctA = q2Total > 0 ? Math.round((q2.A / q2Total) * 100) : 0;
        const q3PosPct = q3Total > 0 ? Math.round(((q3.A + q3.B) / q3Total) * 100) : 0;

        return {
            totalEnviadas, respondidas, pendientes, comentarios, audios, alertas,
            promotores, neutros, detractores, validNps, nps, avgNps, responseRate,
            q2, q2Total, q2PctA, q3, q3Total, q3PosPct,
            npsSegments: [
                { label: 'Promotores (9–10)', value: promotores, color: '#10B981' },
                { label: 'Neutros (7–8)', value: neutros, color: '#F59E0B' },
                { label: 'Detractores (1–6)', value: detractores, color: '#F43F5E' },
            ].filter(s => s.value > 0)
        };
    }, [encuestas, sedeFilter, encuestaSearch]);

    // Agregados Pestaña 5 (Renovación Anual)
    const renovacionProjection = useMemo(() => {
        const filtered = renovacionData.filter(p => {
            if (sedeFilter === 'TODAS') return true;
            const c = String(p.centro || '').toUpperCase();
            return sedeFilter === 'SAN LUIS' ? c.includes('SAN LUIS') : c.includes('SANTA FE');
        });
        const now = new Date();
        const vencidosTotal = filtered.filter(p => p.meses_desde_ultima >= 12).length;
        const vencidosContactables = filtered.filter(p => p.meses_desde_ultima >= 12 && p.telefono1).length;
        const bars = [{ name: 'Ya Vencidos (≥12m)', total: vencidosTotal, contactables: vencidosContactables }];
        let prox6Total = 0, prox6Contactables = 0;

        for (let i = 1; i <= 6; i++) {
            const targetMeses = 12 - i;
            const dt = new Date(now.getFullYear(), now.getMonth() + i, 1);
            const label = `${MONTH_NAMES[dt.getMonth()]} ${String(dt.getFullYear()).slice(2)}`;
            const tot = filtered.filter(p => p.meses_desde_ultima === targetMeses).length;
            const cont = filtered.filter(p => p.meses_desde_ultima === targetMeses && p.telefono1).length;
            prox6Total += tot;
            prox6Contactables += cont;
            bars.push({ name: label, total: tot, contactables: cont });
        }

        const totalUniverso = vencidosTotal + prox6Total;
        const totalContactables = vencidosContactables + prox6Contactables;
        const sinTelefono = Math.max(0, totalUniverso - totalContactables);

        return {
            bars,
            vencidosTotal,
            vencidosContactables,
            prox6Total,
            totalUniverso,
            totalContactables,
            sinTelefono,
            pctContactable: totalUniverso > 0 ? Math.round((totalContactables / totalUniverso) * 100) : 0,
        };
    }, [renovacionData, sedeFilter]);

    // Exportar Excel consolidado
    const handleExportExcel = () => {
        const wb = XLSX.utils.book_new();
        const wsMes = XLSX.utils.json_to_sheet(agg.months.map(m => ({
            Mes: m.labelFull,
            CHQ_Agendados: m.agendados,
            CHQ_Presentes: m.presentes,
            CHQ_Ausentes: m.ausentes,
            Inf_Agendados: m.infAgendados,
            Inf_Presentes: m.infPresentes,
            Inf_Ausentes: m.infAusentes,
            Tasa_Asistencia_Pct: m.tasaAsistenciaMes,
            Tasa_Retorno_Informe_Pct: m.tasaRetornoMes,
        })));
        XLSX.utils.book_append_sheet(wb, wsMes, 'Circuito_Mensual');

        const wsYoy = XLSX.utils.json_to_sheet(agg.yoyData.map(r => ({
            Mes: r.label, '2024': r.y2024, '2025': r.y2025, '2026': r.y2026
        })));
        XLSX.utils.book_append_sheet(wb, wsYoy, 'Interanual_2024_2026');

        if (renovacionProjection.bars.length) {
            const wsRen = XLSX.utils.json_to_sheet(renovacionProjection.bars);
            XLSX.utils.book_append_sheet(wb, wsRen, 'Renovacion_Anual');
        }
        XLSX.writeFile(wb, `Gobernanza_Chequeo_Preventivo_${fechaDesde}_${fechaHasta}.xlsx`);
    };

    const handleExportAuditCsv = () => {
        if (!filteredAuditRows.length) return;
        const headers = ['Teléfono', 'Paciente', 'DNI', 'Fecha Consulta WA', 'Respondida', 'FRT (min)', 'Turno SALUS', 'Fecha Turno', 'Tipo Turno', 'Obra Social', 'Sede', 'Estado'];
        const lines = [
            headers.join(';'),
            ...filteredAuditRows.map(r => [
                r.phone, `"${(r.paciente || '').replace(/"/g, '""')}"`, r.dni || '',
                r.fechaConsulta ? new Date(r.fechaConsulta).toLocaleString('es-AR') : '',
                r.respondida ? 'Sí' : 'No', r.frtMinutes ?? '', r.tieneTurno ? 'Sí' : 'No',
                r.fechaVisita, `"${r.tipoTurno}"`, `"${r.obraSocial}"`, `"${r.centro}"`, r.estadoPaciente
            ].join(';'))
        ];
        const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Conversion_WA_Chequeo_${convRange.startDate}_${convRange.endDate}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const TABS = [
        { id: 'circuito', label: '1. Circuito Preventivo vs. Informe', icon: ClipboardCheck },
        { id: 'asistencia', label: '2. Asistencia, Interanual y Edad', icon: TrendingUp },
        { id: 'conversion', label: '3. Conversión WhatsApp → SALUS', icon: MessageSquare },
        { id: 'calidad', label: '4. Calidad & NPS Post-Chequeo', icon: Trophy },
        { id: 'renovacion', label: '5. Renovación Anual (6 Meses)', icon: CalendarCheck },
    ];

    const evol3DSeries = useMemo(() => {
        const list = [];
        if (viewType !== 'informe') list.push({ key: 'presentes', label: 'Chequeos Realizados', shortLabel: 'Chequeos', color: '#10B981' });
        if (viewType !== 'preventivo') list.push({ key: 'infPresentes', label: 'Consultas de Informe', shortLabel: 'Informes', color: '#0284C7' });
        if (viewType === 'informe') list.push({ key: 'infAusentes', label: 'Ausentes a Informe', shortLabel: 'Ausentes Inf.', color: '#F43F5E' });
        else list.push({ key: 'ausentes', label: 'Ausentes Chequeo', shortLabel: 'Ausentes CHQ', color: '#F59E0B' });
        return list;
    }, [viewType]);

    const yoy3DSeries = useMemo(() => ([
        { key: 'y2024', label: 'Año 2024', shortLabel: '2024', color: '#64748B' },
        { key: 'y2025', label: 'Año 2025', shortLabel: '2025', color: '#0284C7' },
        { key: 'y2026', label: 'Año 2026', shortLabel: '2026', color: '#10B981' },
    ]), []);

    const displayedEncuestas = useMemo(() => {
        if (encuestaSubTab === 'comentarios') return calidadMetrics.comentarios;
        if (encuestaSubTab === 'audios') return calidadMetrics.audios;
        if (encuestaSubTab === 'alertas') return calidadMetrics.alertas;
        if (encuestaSubTab === 'pendientes') return calidadMetrics.pendientes;
        return calidadMetrics.respondidas;
    }, [encuestaSubTab, calidadMetrics]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
            {/* ── HEADER Y CONTROLES GLOBALES (Estética Calidad-QOAG) ── */}
            <div style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '14px',
                padding: '16px 20px',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
            }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '40px', height: '40px', borderRadius: '10px',
                            background: '#EFF6FF', color: COLOR_PRIMARY,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <HeartPulse size={22} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <h2 style={{ margin: 0, fontSize: '1.12rem', fontWeight: 800, color: '#0F172A' }}>
                                    Gobernanza · Chequeo Preventivo y Medicina Preventiva
                                </h2>
                                <span style={{
                                    fontSize: '0.68rem', fontWeight: 800, padding: '2px 9px', borderRadius: '999px',
                                    background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0'
                                }}>
                                    EN VIVO · {rawVisitas.length.toLocaleString('es-AR')} reg. CHQ
                                </span>
                            </div>
                            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                                Circuito Preventivo vs. Informe · Asistencia Interanual 2024–2026 · Conversión WhatsApp → SALUS · NPS Calidad · Renovación Anual
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                        {/* Presets de fecha */}
                        <div style={{ display: 'flex', background: '#F1F5F9', padding: '3px', borderRadius: '8px', gap: '2px' }}>
                            {[
                                { id: 'mes', label: 'Mes Actual' },
                                { id: '30d', label: '30 días' },
                                { id: '2026', label: 'Año 2026' },
                                { id: 'all', label: 'Histórico 24–26' }
                            ].map(p => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => applyDatePreset(p.id)}
                                    style={{
                                        border: 'none', borderRadius: '6px', padding: '5px 9px',
                                        fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                                        background: datePreset === p.id ? COLOR_PRIMARY : 'transparent',
                                        color: datePreset === p.id ? '#FFFFFF' : '#475569'
                                    }}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        <input
                            type="date"
                            value={fechaDesde}
                            onChange={e => { setDatePreset('custom'); setFechaDesde(e.target.value); }}
                            style={{ padding: '5px 8px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.75rem', color: '#0F172A' }}
                        />
                        <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>a</span>
                        <input
                            type="date"
                            value={fechaHasta}
                            onChange={e => { setDatePreset('custom'); setFechaHasta(e.target.value); }}
                            style={{ padding: '5px 8px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.75rem', color: '#0F172A' }}
                        />

                        <select
                            value={sedeFilter}
                            onChange={e => setSedeFilter(e.target.value)}
                            style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.75rem', fontWeight: 600, color: '#0F172A', background: '#FFFFFF' }}
                        >
                            <option value="TODAS">Todas las Sedes</option>
                            <option value="SANTA FE">Sede Santa Fe</option>
                            <option value="SAN LUIS">Sede San Luis</option>
                        </select>

                        <button
                            type="button"
                            onClick={handleExportExcel}
                            disabled={loadingVisitas}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '5px',
                                padding: '6px 11px', borderRadius: '8px', border: '1px solid #CBD5E1',
                                background: '#FFFFFF', color: '#0F172A', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer'
                            }}
                        >
                            <FileSpreadsheet size={14} color="#059669" /> Excel
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                loadVisitas();
                                setConvLoadedKey('');
                                setEncuestasLoaded(false);
                                setRenovacionLoaded(false);
                            }}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '5px',
                                padding: '6px 11px', borderRadius: '8px', border: 'none',
                                background: COLOR_PRIMARY, color: '#FFFFFF', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer'
                            }}
                        >
                            <RefreshCw size={13} className={loadingVisitas ? 'animate-spin' : ''} /> Actualizar
                        </button>
                    </div>
                </div>

                {/* Navegación por 5 pestañas temáticas */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', borderTop: '1px solid #F1F5F9', paddingTop: '12px' }}>
                    {TABS.map(t => {
                        const Icon = t.icon;
                        const active = activeTab === t.id;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setActiveTab(t.id)}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    padding: '7px 13px', borderRadius: '9px',
                                    border: active ? `1px solid ${COLOR_PRIMARY}` : '1px solid #E2E8F0',
                                    background: active ? COLOR_PRIMARY : '#F8FAFC',
                                    color: active ? '#FFFFFF' : '#475569',
                                    fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <Icon size={14} />
                                {t.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── CONTENIDO POR PESTAÑA ── */}
            {loadingVisitas && (activeTab === 'circuito' || activeTab === 'asistencia') ? (
                <div style={{
                    background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0',
                    padding: '64px 20px', textAlign: 'center', color: '#64748B'
                }}>
                    <RefreshCw size={28} color={COLOR_PRIMARY} className="animate-spin" style={{ margin: '0 auto 12px' }} />
                    <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.92rem' }}>Cargando registros de Chequeo Preventivo...</div>
                    {progressText && <div style={{ fontSize: '0.76rem', marginTop: '4px' }}>{progressText}</div>}
                </div>
            ) : activeTab === 'circuito' ? (
                <>
                    {/* Selector de vista Preventivo vs Informe */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <div style={{ display: 'inline-flex', background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '3px', borderRadius: '9px', gap: '3px' }}>
                            {[
                                { id: 'comparativa', label: 'Chequeo vs. Informe' },
                                { id: 'preventivo', label: 'Solo Preventivo' },
                                { id: 'informe', label: 'Solo Informe' },
                            ].map(o => (
                                <button
                                    key={o.id}
                                    type="button"
                                    onClick={() => setViewType(o.id)}
                                    style={{
                                        border: 'none', borderRadius: '7px', padding: '5px 11px',
                                        fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer',
                                        background: viewType === o.id ? COLOR_PRIMARY : 'transparent',
                                        color: viewType === o.id ? '#FFFFFF' : '#475569'
                                    }}
                                >
                                    {o.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 4 KPIs Circuito */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                        <KpiCard
                            label="Chequeos Realizados (Presentes)"
                            value={agg.uniquePatients.toLocaleString('es-AR')}
                            subtext={`de ${agg.totalAgendados.toLocaleString('es-AR')} pacientes agendados`}
                            icon={Users} accent="#10B981" bg="#ECFDF5"
                        />
                        <KpiCard
                            label="Consultas de Informe (CHQ INF)"
                            value={agg.uniqueInfPresentes.toLocaleString('es-AR')}
                            subtext={`Presentes de ${agg.totalInfAgendados.toLocaleString('es-AR')} agendados`}
                            icon={FileText} accent="#0284C7" bg="#F0F9FF"
                        />
                        <KpiCard
                            label="Tasa de Retorno a Informe"
                            value={`${agg.tasaRetornoInforme}%`}
                            subtext={`${agg.uniqueInfPresentes.toLocaleString('es-AR')} pacientes vieron su devolución médica`}
                            icon={ClipboardCheck} accent="#6366F1" bg="#EEF2FF"
                        />
                        <KpiCard
                            label="Demora Promedio al Informe"
                            value={agg.avgDiasInforme > 0 ? `${agg.avgDiasInforme} días` : '—'}
                            pill={agg.centrosInf.length > 0 ? agg.centrosInf.map(c => `${c.name === 'San Luis' ? 'SL' : 'SF'}: ${c.value}`).join(' · ') : null}
                            subtext="Días promedio entre el chequeo y la consulta de informe"
                            icon={Clock} accent="#D97706" bg="#FFFBEB"
                        />
                    </div>

                    {/* GRÁFICO 1: Evolución Mensual Chequeo vs Informe (3D / 2D) */}
                    <SectionCard
                        title="Gráfico 1 · Evolución Mensual: Chequeos Realizados vs. Consultas de Informe"
                        subtitle="Pacientes únicos presentes mes a mes. Alterná entre vista 3D interactiva (multi-selección con flujo de carga) y 2D clásica."
                        rightNode={
                            <div style={{ display: 'inline-flex', background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '2px', borderRadius: '8px', gap: '2px' }}>
                                {[
                                    { id: '3d', label: '3D Interactivo' },
                                    { id: '2d', label: '2D Barras' }
                                ].map(m => (
                                    <button
                                        key={m.id}
                                        type="button"
                                        onClick={() => setEvolChartMode(m.id)}
                                        style={{
                                            border: 'none', borderRadius: '6px', padding: '4px 10px',
                                            fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                                            background: evolChartMode === m.id ? COLOR_PRIMARY : 'transparent',
                                            color: evolChartMode === m.id ? '#FFFFFF' : COLOR_PRIMARY
                                        }}
                                    >
                                        {m.label}
                                    </button>
                                ))}
                            </div>
                        }
                    >
                        {agg.months.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#94A3B8', fontSize: '0.84rem' }}>Sin datos para el rango seleccionado.</div>
                        ) : evolChartMode === '3d' ? (
                            <DxiSuperficieTopografica3D
                                data={agg.months}
                                series={evol3DSeries}
                                granularity="mes"
                                height={420}
                            />
                        ) : (
                            <div style={{ height: '310px', width: '100%' }}>
                                <ResponsiveContainer>
                                    <ComposedChart data={agg.months} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} tickLine={false} axisLine={false} />
                                        <YAxis tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} />
                                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                                        <Legend wrapperStyle={{ fontSize: '0.76rem', paddingTop: '8px' }} />
                                        {viewType !== 'informe' && <Bar dataKey="presentes" name="Chequeos Realizados" fill="#10B981" radius={[5, 5, 0, 0]} maxBarSize={30} />}
                                        {viewType !== 'preventivo' && <Bar dataKey="infPresentes" name="Consultas de Informe" fill="#0284C7" radius={[5, 5, 0, 0]} maxBarSize={30} />}
                                        {viewType === 'informe' && <Bar dataKey="infAusentes" name="Ausentes a Informe" fill="#F43F5E" radius={[5, 5, 0, 0]} maxBarSize={24} />}
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </SectionCard>

                    {/* GRÁFICO 2 (Anillo 3D Obras Sociales) + GRÁFICO 3 (Ranking Médicos de Informe) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>
                        <AnilloToroidal3D
                            title="Gráfico 2 · Mix de Obras Sociales (3D Giratorio)"
                            subtitle="Distribución de pacientes presentes por cobertura médica"
                            badgeRightLabel="Top Cobertura"
                            badgeRightValue={agg.topOS[0]?.value?.toLocaleString('es-AR') || '0'}
                            badgeRightSub={agg.topOS[0]?.name || '—'}
                            segments={agg.topOS.map((os, i) => ({
                                label: os.name,
                                value: os.value,
                                color: SERIES_PALETTE[i % SERIES_PALETTE.length]
                            }))}
                            height={275}
                        />

                        <SectionCard
                            title="Gráfico 3 · Ranking de Médicos en Consultas de Informe"
                            subtitle="Profesionales con mayor volumen de entregas de informe médico (CHQ INF)"
                        >
                            {agg.topMedicosInf.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px 0', color: '#94A3B8', fontSize: '0.82rem' }}>Sin consultas de informe registradas en el período.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '280px', overflowY: 'auto' }}>
                                    {agg.topMedicosInf.map((m, idx) => {
                                        const pct = Math.round((m.value / (agg.topMedicosInf[0]?.value || 1)) * 100);
                                        return (
                                            <div key={idx}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{idx + 1}. {m.name}</span>
                                                    <span style={{ fontWeight: 800, color: COLOR_PRIMARY, fontVariantNumeric: 'tabular-nums' }}>{m.value.toLocaleString('es-AR')}</span>
                                                </div>
                                                <div style={{ width: '100%', height: '7px', background: '#F1F5F9', borderRadius: '999px', overflow: 'hidden' }}>
                                                    <div style={{ width: `${pct}%`, height: '100%', background: '#0284C7', borderRadius: '999px' }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </SectionCard>
                    </div>

                    {/* Tabla Mensual Auditada */}
                    <SectionCard
                        title={`Detalle Mensual Auditado (${agg.months.length} meses)`}
                        subtitle="Consolidado mes a mes entre estudios preventivos realizados y consultas de devolución de informe"
                    >
                        <div style={{ overflowX: 'auto', border: '1px solid #F1F5F9', borderRadius: '10px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.80rem' }}>
                                <thead>
                                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                        {['Mes', 'CHQ Agendados', 'CHQ Presentes', 'CHQ Ausentes', 'Inf. Agendados', 'Inf. Presentes', 'Inf. Ausentes', '% Asistencia', '% Retorno Inf.'].map(h => (
                                            <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Mes' ? 'left' : 'right', fontWeight: 700, color: '#64748B', fontSize: '0.70rem', textTransform: 'uppercase' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...agg.months].reverse().map(m => (
                                        <tr key={m.month} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                            <td style={{ padding: '9px 12px', fontWeight: 700, color: '#0F172A' }}>{m.labelFull}</td>
                                            <td style={{ padding: '9px 12px', textAlign: 'right', color: '#64748B' }}>{m.agendados.toLocaleString('es-AR')}</td>
                                            <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#10B981' }}>{m.presentes.toLocaleString('es-AR')}</td>
                                            <td style={{ padding: '9px 12px', textAlign: 'right', color: '#F43F5E' }}>{m.ausentes.toLocaleString('es-AR')}</td>
                                            <td style={{ padding: '9px 12px', textAlign: 'right', color: '#64748B' }}>{m.infAgendados.toLocaleString('es-AR')}</td>
                                            <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#0284C7' }}>{m.infPresentes.toLocaleString('es-AR')}</td>
                                            <td style={{ padding: '9px 12px', textAlign: 'right', color: '#F43F5E' }}>{m.infAusentes.toLocaleString('es-AR')}</td>
                                            <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>{m.tasaAsistenciaMes}%</td>
                                            <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                                                <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '0.71rem', fontWeight: 700, background: m.tasaRetornoMes >= 35 ? '#E0F2FE' : '#F1F5F9', color: m.tasaRetornoMes >= 35 ? '#0369A1' : '#475569' }}>
                                                    {m.tasaRetornoMes}%
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>
                </>
            ) : activeTab === 'asistencia' ? (
                <>
                    {/* 4 KPIs Asistencia & Demografía */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                        <KpiCard label="Pacientes Agendados" value={agg.totalAgendados.toLocaleString('es-AR')} subtext="En el período seleccionado" icon={Calendar} accent={COLOR_PRIMARY} bg="#EFF6FF" />
                        <KpiCard label="Tasa de Asistencia Efectiva" value={`${agg.tasaAsistenciaGlobal}%`} subtext={`${agg.uniquePatients.toLocaleString('es-AR')} presentes sobre turnos resueltos`} icon={UserCheck} accent="#10B981" bg="#ECFDF5" />
                        <KpiCard label="Ausentismo Acumulado" value={agg.uniqueAusentes.toLocaleString('es-AR')} subtext="Pacientes con ausencia registrada o vencida" icon={Activity} accent="#F43F5E" bg="#FFF1F2" />
                        <KpiCard label="Edad Promedio" value={agg.avgAge > 0 ? `${agg.avgAge} años` : '—'} subtext={`Sobre ${agg.ageValidCount.toLocaleString('es-AR')} pacientes con edad registrada`} icon={Users} accent="#7C3AED" bg="#F5F3FF" />
                    </div>

                    {/* GRÁFICO 4 (Asistencia Mensual Apilada) + GRÁFICO 5 (Tasa de Asistencia %) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '16px' }}>
                        <SectionCard
                            title="Gráfico 4 · Asistencia Mensual Apilada"
                            subtitle="Desglose mensual en Presentes, Ausentes y Pendientes futuros"
                        >
                            <div style={{ height: '270px', width: '100%' }}>
                                <ResponsiveContainer>
                                    <BarChart data={agg.months} margin={{ top: 6, right: 10, left: -12, bottom: 4 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} tickLine={false} axisLine={false} />
                                        <YAxis tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} />
                                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                                        <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '6px' }} />
                                        <Bar dataKey="presentes" stackId="a" name="Presentes" fill="#10B981" maxBarSize={32} />
                                        <Bar dataKey="ausentes" stackId="a" name="Ausentes" fill="#F43F5E" maxBarSize={32} />
                                        <Bar dataKey="pendientes" stackId="a" name="Pendientes Futuros" fill="#93C5FD" radius={[5, 5, 0, 0]} maxBarSize={32} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </SectionCard>

                        <SectionCard
                            title="Gráfico 5 · Tasa de Asistencia Mensual (%)"
                            subtitle="Porcentaje de asistencia efectiva con meta institucional del 80%"
                        >
                            <div style={{ height: '270px', width: '100%' }}>
                                <ResponsiveContainer>
                                    <LineChart data={agg.months} margin={{ top: 10, right: 14, left: -14, bottom: 4 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} tickLine={false} axisLine={false} />
                                        <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} />
                                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [`${v}%`, 'Asistencia']} />
                                        <ReferenceLine y={80} stroke="#059669" strokeDasharray="4 4" label={{ value: 'Meta 80%', position: 'right', fill: '#059669', fontSize: 10 }} />
                                        <Line type="monotone" dataKey="tasaAsistenciaMes" name="Asistencia %" stroke={COLOR_PRIMARY} strokeWidth={2.6} dot={{ r: 3.5, fill: COLOR_PRIMARY }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </SectionCard>
                    </div>

                    {/* GRÁFICO 6: Comparativa Interanual 2024–2026 (3D / 2D) */}
                    <SectionCard
                        title="Gráfico 6 · Comparativa Interanual 2024 vs. 2025 vs. 2026"
                        subtitle="Estacionalidad mes a mes (Enero–Diciembre) independiente del filtro de fechas superior"
                        rightNode={
                            <div style={{ display: 'inline-flex', background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '2px', borderRadius: '8px', gap: '2px' }}>
                                {[
                                    { id: '2d', label: '2D Líneas' },
                                    { id: '3d', label: '3D Multi-Año' }
                                ].map(m => (
                                    <button
                                        key={m.id}
                                        type="button"
                                        onClick={() => setYoyChartMode(m.id)}
                                        style={{
                                            border: 'none', borderRadius: '6px', padding: '4px 10px',
                                            fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                                            background: yoyChartMode === m.id ? COLOR_PRIMARY : 'transparent',
                                            color: yoyChartMode === m.id ? '#FFFFFF' : COLOR_PRIMARY
                                        }}
                                    >
                                        {m.label}
                                    </button>
                                ))}
                            </div>
                        }
                    >
                        {yoyChartMode === '3d' ? (
                            <DxiSuperficieTopografica3D data={agg.yoyData} series={yoy3DSeries} granularity="mes" height={390} />
                        ) : (
                            <div style={{ height: '290px', width: '100%' }}>
                                <ResponsiveContainer>
                                    <LineChart data={agg.yoyData} margin={{ top: 8, right: 16, left: -12, bottom: 4 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} tickLine={false} axisLine={false} />
                                        <YAxis tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} />
                                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                                        <Legend wrapperStyle={{ fontSize: '0.76rem', paddingTop: '6px' }} />
                                        <Line type="monotone" dataKey="y2024" name="Año 2024" stroke="#94A3B8" strokeWidth={2} dot={{ r: 3 }} />
                                        <Line type="monotone" dataKey="y2025" name="Año 2025" stroke="#0284C7" strokeWidth={2.4} dot={{ r: 3.5 }} />
                                        <Line type="monotone" dataKey="y2026" name="Año 2026" stroke="#10B981" strokeWidth={3} dot={{ r: 4 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </SectionCard>

                    {/* GRÁFICO 7: Histograma de Rangos Etarios */}
                    <SectionCard
                        title="Gráfico 7 · Histograma de Rangos Etarios de Pacientes Presentes"
                        subtitle={`Distribución demográfica por franja de edad (${agg.ageValidCount.toLocaleString('es-AR')} pacientes con edad registrada · promedio ${agg.avgAge} años)`}
                    >
                        <div style={{ height: '260px', width: '100%' }}>
                            <ResponsiveContainer>
                                <BarChart data={agg.ageDistribution} barCategoryGap="12%" margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#475569', fontWeight: 700 }} tickLine={false} axisLine={false} />
                                    <YAxis tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} />
                                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [`${v} pacientes`, 'Cantidad']} />
                                    <Bar dataKey="count" name="Pacientes" fill={COLOR_PRIMARY} radius={[6, 6, 0, 0]} maxBarSize={54} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </SectionCard>
                </>
            ) : activeTab === 'conversion' ? (
                <>
                    {/* Controles de atribución WA → SALUS */}
                    <div style={{
                        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                        padding: '12px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px'
                    }}>
                        <div style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>
                            Período analizado en WhatsApp (`line_recepciones`): <strong style={{ color: '#0F172A' }}>{convRange.startDate}</strong> a <strong style={{ color: '#0F172A' }}>{convRange.endDate}</strong>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                            <select value={categoriaFilter} onChange={e => setCategoriaFilter(e.target.value)} style={{ padding: '5px 9px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.74rem', fontWeight: 600 }}>
                                <option value="all">Todas las categorías</option>
                                <option value="Chequeo Preventivo">Chequeo Preventivo</option>
                                <option value="Chequeo Informe">Chequeo Informe</option>
                                <option value="Ecografía">Ecografía</option>
                            </select>
                            <select value={attributionMode} onChange={e => setAttributionMode(e.target.value)} style={{ padding: '5px 9px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.74rem', fontWeight: 600 }}>
                                <option value="strict">Atribución Estricta (post-consulta)</option>
                                <option value="broad">Atribución Amplia (cita ≥ consulta)</option>
                            </select>
                            <select value={attributionDays} onChange={e => setAttributionDays(Number(e.target.value))} style={{ padding: '5px 9px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.74rem', fontWeight: 600 }}>
                                <option value={7}>Ventana 7 días</option>
                                <option value={14}>Ventana 14 días</option>
                                <option value={30}>Ventana 30 días</option>
                            </select>
                            <button type="button" onClick={handleExportAuditCsv} disabled={!filteredAuditRows.length} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}>
                                <Download size={13} /> CSV
                            </button>
                        </div>
                    </div>

                    {loadingConv || !convAnalytics ? (
                        <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '54px 20px', textAlign: 'center', color: '#64748B' }}>
                            <RefreshCw size={26} color={COLOR_PRIMARY} className="animate-spin" style={{ margin: '0 auto 10px' }} />
                            <div style={{ fontWeight: 700, color: '#0F172A' }}>Cruzando chats de WhatsApp con turnos reales en SALUS...</div>
                        </div>
                    ) : (
                        <>
                            {/* 4 KPIs Conversión */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                                <KpiCard label="Consultas Ingresadas WA" value={convAnalytics.kpis.ingresadas.toLocaleString('es-AR')} subtext="Teléfonos únicos en line_recepciones" icon={MessageSquare} accent="#0284C7" bg="#F0F9FF" />
                                <KpiCard label="Consultas Respondidas" value={convAnalytics.kpis.respondidas.toLocaleString('es-AR')} pill={`${convAnalytics.kpis.tasaRespuesta}% · FRT ${fmtFrt(convAnalytics.kpis.medianFrtMinutes)}`} subtext="Mediana de tiempo de 1ra respuesta" icon={Clock} accent="#6366F1" bg="#EEF2FF" />
                                <KpiCard label="Turnos Asignados en SALUS" value={convAnalytics.kpis.asignados.toLocaleString('es-AR')} pill={`${convAnalytics.kpis.tasaConversion}% conv.`} subtext="Cruces confirmados por teléfono" icon={CalendarCheck} accent="#0EA5E9" bg="#E0F2FE" />
                                <KpiCard label="Turnos Concretados (Presente)" value={convAnalytics.kpis.concretados.toLocaleString('es-AR')} pill={`${convAnalytics.kpis.tasaConcrecion}% s/vencidos`} subtext={`${convAnalytics.kpis.futurosPendientes} turnos futuros pendientes`} icon={CheckCircle2} accent="#10B981" bg="#ECFDF5" />
                            </div>

                            {/* GRÁFICO 8: Embudo de Conversión 3D + GRÁFICO 9: Serie Temporal */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '16px' }}>
                                <EmbudoConversion3D
                                    title="Gráfico 8 · Embudo de Conversión 3D (WA → SALUS → Asistencia)"
                                    subtitle="Retención paso a paso giratoria 360°"
                                    badgeRightLabel="Conversión Global"
                                    badgeRightValue={`${convAnalytics.kpis.tasaConversion}%`}
                                    badgeRightSub="WA → Turno SALUS"
                                    stages={convAnalytics.funnelStages}
                                    height={295}
                                />

                                <SectionCard
                                    title={`Gráfico 9 · Evolución ${convAnalytics.granularity} de Conversión`}
                                    subtitle="Consultas ingresadas vs. respondidas vs. turnos asignados y concretados"
                                >
                                    <div style={{ height: '270px', width: '100%' }}>
                                        <ResponsiveContainer>
                                            <LineChart data={convAnalytics.dailySeries} margin={{ top: 8, right: 14, left: -14, bottom: 4 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                                <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: '#64748B' }} tickLine={false} axisLine={false} />
                                                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} />
                                                <Tooltip contentStyle={TOOLTIP_STYLE} />
                                                <Legend wrapperStyle={{ fontSize: '0.73rem' }} />
                                                <Line type="monotone" dataKey="ingresadas" name="Ingresadas" stroke="#0284C7" strokeWidth={2.2} dot={false} />
                                                <Line type="monotone" dataKey="respondidas" name="Respondidas" stroke="#6366F1" strokeWidth={2} dot={false} />
                                                <Line type="monotone" dataKey="asignados" name="Turno SALUS" stroke="#0EA5E9" strokeWidth={2.2} dot={false} />
                                                <Line type="monotone" dataKey="concretados" name="Asistió" stroke="#10B981" strokeWidth={2.4} dot={false} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </SectionCard>
                            </div>

                            {/* GRÁFICO 10 (Asistencia + Tipo de Turno) y GRÁFICO 11 (Sede + Top 8 OS) */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
                                <SectionCard title="Gráfico 10a · Estado de Asistencia (SALUS)" subtitle="Desglose real de turnos originados en WhatsApp">
                                    <div style={{ height: '240px', width: '100%' }}>
                                        <ResponsiveContainer>
                                            <PieChart>
                                                <Pie data={convAnalytics.asistenciaPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={84} paddingAngle={3}>
                                                    {convAnalytics.asistenciaPie.map((e, i) => <Cell key={i} fill={ASISTENCIA_PIE_COLORS[e.name] || SERIES_PALETTE[i % SERIES_PALETTE.length]} />)}
                                                </Pie>
                                                <Tooltip contentStyle={TOOLTIP_STYLE} />
                                                <Legend wrapperStyle={{ fontSize: '0.73rem' }} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </SectionCard>

                                <SectionCard title="Gráfico 10b · Composición por Tipo de Turno" subtitle="Servicios agendados por pacientes que consultaron por WA">
                                    <div style={{ height: '240px', width: '100%' }}>
                                        <ResponsiveContainer>
                                            <PieChart>
                                                <Pie data={convAnalytics.tipoTurnoPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={84} paddingAngle={3}>
                                                    {convAnalytics.tipoTurnoPie.map((_, i) => <Cell key={i} fill={SERIES_PALETTE[i % SERIES_PALETTE.length]} />)}
                                                </Pie>
                                                <Tooltip contentStyle={TOOLTIP_STYLE} />
                                                <Legend wrapperStyle={{ fontSize: '0.73rem' }} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </SectionCard>

                                <SectionCard title="Gráfico 11a · Efectividad por Sede" subtitle="Turnos asignados vs. concretados en Santa Fe y San Luis">
                                    <div style={{ height: '240px', width: '100%' }}>
                                        <ResponsiveContainer>
                                            <BarChart data={convAnalytics.sedeBars} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                                <XAxis dataKey="sede" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} tickLine={false} axisLine={false} />
                                                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} />
                                                <Tooltip contentStyle={TOOLTIP_STYLE} />
                                                <Legend wrapperStyle={{ fontSize: '0.73rem' }} />
                                                <Bar dataKey="asignados" name="Asignados" fill="#0284C7" radius={[5, 5, 0, 0]} maxBarSize={36} />
                                                <Bar dataKey="concretados" name="Concretados" fill="#10B981" radius={[5, 5, 0, 0]} maxBarSize={36} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </SectionCard>

                                <SectionCard title="Gráfico 11b · Top 8 Obras Sociales Convertidas" subtitle="Financiadores con mayor conversión desde WhatsApp">
                                    <div style={{ height: '240px', width: '100%' }}>
                                        <ResponsiveContainer>
                                            <BarChart data={convAnalytics.obraSocialBars} layout="vertical" margin={{ top: 4, right: 16, left: 10, bottom: 4 }}>
                                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                                                <XAxis type="number" tick={{ fontSize: 10.5, fill: '#64748B' }} tickLine={false} axisLine={false} />
                                                <YAxis type="category" dataKey="obraSocial" width={110} tick={{ fontSize: 10, fill: '#334155', fontWeight: 600 }} tickLine={false} axisLine={false} />
                                                <Tooltip contentStyle={TOOLTIP_STYLE} />
                                                <Bar dataKey="asignados" name="Asignados" fill={COLOR_PRIMARY} radius={[0, 4, 4, 0]} barSize={14} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </SectionCard>
                            </div>

                            {/* Tabla de Trazabilidad */}
                            <SectionCard
                                title={`Trazabilidad Paciente por Paciente (${filteredAuditRows.length} registros)`}
                                subtitle="Auditoría directa de cada consulta ingresada por WhatsApp y su resolución en SALUS"
                                rightNode={
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        <input
                                            type="text"
                                            placeholder="Buscar paciente, DNI o teléfono..."
                                            value={auditSearch}
                                            onChange={e => setAuditSearch(e.target.value)}
                                            style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.75rem', width: '210px' }}
                                        />
                                        <select value={auditStatusFilter} onChange={e => setAuditStatusFilter(e.target.value)} style={{ padding: '5px 8px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.74rem' }}>
                                            <option value="all">Todos los estados</option>
                                            <option value="concretado">Concretados</option>
                                            <option value="pendiente">Pendientes futuros</option>
                                            <option value="ausente">Ausentes</option>
                                            <option value="sin_turno">Sin turno SALUS</option>
                                        </select>
                                    </div>
                                }
                            >
                                <div style={{ overflowX: 'auto', maxHeight: '340px', border: '1px solid #F1F5F9', borderRadius: '10px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                        <thead style={{ position: 'sticky', top: 0, background: '#F8FAFC', zIndex: 1 }}>
                                            <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                                                {['Paciente', 'Teléfono', 'Consulta WA', 'FRT', 'Fecha Turno', 'Tipo', 'Obra Social', 'Estado'].map(h => (
                                                    <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontSize: '0.68rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredAuditRows.slice(0, 120).map((r, i) => (
                                                <tr key={`${r.phone}_${i}`} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                    <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0F172A' }}>{r.paciente}</td>
                                                    <td style={{ padding: '8px 10px', color: '#475569', fontVariantNumeric: 'tabular-nums' }}>{r.phone}</td>
                                                    <td style={{ padding: '8px 10px', color: '#64748B' }}>{r.fechaConsulta ? new Date(r.fechaConsulta).toLocaleDateString('es-AR') : '—'}</td>
                                                    <td style={{ padding: '8px 10px', color: '#475569' }}>{fmtFrt(r.frtMinutes)}</td>
                                                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{r.fechaVisita}</td>
                                                    <td style={{ padding: '8px 10px', color: '#475569' }}>{r.tipoTurno}</td>
                                                    <td style={{ padding: '8px 10px', color: '#475569' }}>{r.obraSocial}</td>
                                                    <td style={{ padding: '8px 10px' }}>
                                                        <span style={{
                                                            padding: '2px 8px', borderRadius: '999px', fontSize: '0.69rem', fontWeight: 700,
                                                            background: r.estadoPaciente === 'Concretado' ? '#DCFCE7' : r.estadoPaciente === 'Pendiente Futuro' ? '#E0F2FE' : r.estadoPaciente === 'Sin turno' ? '#F1F5F9' : '#FEE2E2',
                                                            color: r.estadoPaciente === 'Concretado' ? '#15803D' : r.estadoPaciente === 'Pendiente Futuro' ? '#0369A1' : r.estadoPaciente === 'Sin turno' ? '#475569' : '#B91C1C'
                                                        }}>
                                                            {r.estadoPaciente}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </SectionCard>
                        </>
                    )}
                </>
            ) : activeTab === 'calidad' ? (
                loadingEncuestas ? (
                    <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '54px 20px', textAlign: 'center', color: '#64748B' }}>
                        <RefreshCw size={26} color={COLOR_PRIMARY} className="animate-spin" style={{ margin: '0 auto 10px' }} />
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>Cargando encuestas de calidad post-chequeo...</div>
                    </div>
                ) : (
                    <>
                        {/* 4 KPIs Calidad */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                            <KpiCard label="Tasa de Respuesta" value={`${calidadMetrics.responseRate}%`} pill={`${calidadMetrics.respondidas.length} / ${calidadMetrics.totalEnviadas}`} subtext={`${calidadMetrics.pendientes.length} sin responder`} icon={Target} accent="#0284C7" bg="#F0F9FF" />
                            <KpiCard label="NPS & Calificación (Q1)" value={calidadMetrics.nps > 0 ? `+${calidadMetrics.nps}` : calidadMetrics.nps} pill={`${calidadMetrics.avgNps}/10`} pillBg={calidadMetrics.nps >= 50 ? '#DCFCE7' : '#FEF3C7'} pillColor={calidadMetrics.nps >= 50 ? '#15803D' : '#B45309'} subtext={`Promotores: ${calidadMetrics.promotores} · Neutros: ${calidadMetrics.neutros} · Detractores: ${calidadMetrics.detractores}`} icon={Trophy} accent="#10B981" bg="#ECFDF5" />
                            <KpiCard label="Claridad Médica (Q2)" value={`${calidadMetrics.q2PctA}%`} pill={`${calidadMetrics.q2.A} / ${calidadMetrics.q2Total}`} subtext={`Con dudas: ${calidadMetrics.q2.B} · Faltó claridad: ${calidadMetrics.q2.C}`} icon={ThumbsUp} accent="#6366F1" bg="#EEF2FF" />
                            <KpiCard label="Agilidad Positiva (Q3)" value={`${calidadMetrics.q3PosPct}%`} pill={`${calidadMetrics.alertas.length} alertas`} pillBg={calidadMetrics.alertas.length > 0 ? '#FEE2E2' : '#ECFDF5'} pillColor={calidadMetrics.alertas.length > 0 ? '#B91C1C' : '#15803D'} subtext={`Excelente: ${calidadMetrics.q3.A} · Buena: ${calidadMetrics.q3.B} · Reg/Mala: ${calidadMetrics.q3.C + calidadMetrics.q3.D}`} icon={ShieldCheck} accent="#D97706" bg="#FFFBEB" />
                        </div>

                        {/* GRÁFICO 12 (Anillo 3D NPS) + GRÁFICO 13 (Barras Q2 y Q3) */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
                            <AnilloToroidal3D
                                title="Gráfico 12 · Distribución NPS Post-Chequeo (3D)"
                                subtitle="Del 1 al 10, ¿qué tan probable es que nos recomiendes?"
                                badgeRightLabel="NPS Score"
                                badgeRightValue={calidadMetrics.nps > 0 ? `+${calidadMetrics.nps}` : `${calidadMetrics.nps}`}
                                badgeRightSub={`${calidadMetrics.validNps} respuestas`}
                                segments={calidadMetrics.npsSegments}
                                height={265}
                            />

                            <SectionCard title="Gráfico 13a · Claridad de Explicaciones Médicas (Q2)" subtitle="¿Las explicaciones médicas fueron claras y útiles?">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '6px' }}>
                                    <HorizontalBarItem label="A. Sí, todo fue muy claro" count={calidadMetrics.q2.A} total={calidadMetrics.q2Total} color="#10B981" />
                                    <HorizontalBarItem label="B. Entendí, pero quedaron algunas dudas" count={calidadMetrics.q2.B} total={calidadMetrics.q2Total} color="#F59E0B" />
                                    <HorizontalBarItem label="C. No, faltó información o claridad" count={calidadMetrics.q2.C} total={calidadMetrics.q2Total} color="#F43F5E" />
                                </div>
                            </SectionCard>

                            <SectionCard title="Gráfico 13b · Agilidad y Tiempos de Espera (Q3)" subtitle="¿Cómo calificarías la agilidad y atención en el circuito?">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '6px' }}>
                                    <HorizontalBarItem label="A. Excelente" count={calidadMetrics.q3.A} total={calidadMetrics.q3Total} color="#10B981" />
                                    <HorizontalBarItem label="B. Buena" count={calidadMetrics.q3.B} total={calidadMetrics.q3Total} color="#0284C7" />
                                    <HorizontalBarItem label="C. Regular" count={calidadMetrics.q3.C} total={calidadMetrics.q3Total} color="#F59E0B" />
                                    <HorizontalBarItem label="D. Mala" count={calidadMetrics.q3.D} total={calidadMetrics.q3Total} color="#F43F5E" />
                                </div>
                            </SectionCard>
                        </div>

                        {/* Escucha Activa */}
                        <SectionCard
                            title="Escucha Activa del Paciente (Q4 — Comentarios, Audios y Alertas)"
                            subtitle="Feedback directo recibido por WhatsApp tras finalizar el chequeo preventivo"
                            rightNode={
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <input
                                        type="text"
                                        placeholder="Buscar paciente o comentario..."
                                        value={encuestaSearch}
                                        onChange={e => setEncuestaSearch(e.target.value)}
                                        style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.74rem', width: '190px' }}
                                    />
                                    {[
                                        { id: 'respondidas', label: `Respondidas (${calidadMetrics.respondidas.length})` },
                                        { id: 'comentarios', label: `Comentarios (${calidadMetrics.comentarios.length})` },
                                        { id: 'audios', label: `Audios (${calidadMetrics.audios.length})` },
                                        { id: 'alertas', label: `Alertas (${calidadMetrics.alertas.length})` },
                                    ].map(t => (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => setEncuestaSubTab(t.id)}
                                            style={{
                                                border: '1px solid #CBD5E1', borderRadius: '8px', padding: '4px 9px',
                                                fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                                                background: encuestaSubTab === t.id ? COLOR_PRIMARY : '#FFFFFF',
                                                color: encuestaSubTab === t.id ? '#FFFFFF' : '#475569'
                                            }}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            }
                        >
                            {displayedEncuestas.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '30px', color: '#94A3B8', fontSize: '0.82rem' }}>No hay respuestas en esta categoría.</div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '12px', maxHeight: '380px', overflowY: 'auto' }}>
                                    {displayedEncuestas.slice(0, 40).map((e, idx) => (
                                        <div key={e.id || idx} style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', background: '#FAFCFF', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                                <strong style={{ fontSize: '0.82rem', color: '#0F172A' }}>{e.nombre_paciente || e.telefono || 'Paciente'}</strong>
                                                {e.q1_nps !== null && e.q1_nps !== undefined && (
                                                    <span style={{
                                                        padding: '2px 8px', borderRadius: '999px', fontSize: '0.70rem', fontWeight: 800,
                                                        background: Number(e.q1_nps) >= 9 ? '#DCFCE7' : Number(e.q1_nps) <= 6 ? '#FEE2E2' : '#FEF3C7',
                                                        color: Number(e.q1_nps) >= 9 ? '#15803D' : Number(e.q1_nps) <= 6 ? '#B91C1C' : '#B45309'
                                                    }}>
                                                        NPS {e.q1_nps}/10
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '0.70rem', color: '#64748B' }}>
                                                {e.centro || 'Sede N/D'} · {e.obra_social || 'Sin OS'} · {e.created_at ? new Date(e.created_at).toLocaleDateString('es-AR') : ''}
                                            </div>
                                            {e.cierre_comentario && (
                                                <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: '#1E293B', background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: '8px', padding: '8px' }}>
                                                    “{e.cierre_comentario}”
                                                </p>
                                            )}
                                            {e.cierre_audio_url && (
                                                <audio controls src={e.cierre_audio_url} style={{ width: '100%', height: '32px', marginTop: '4px' }} />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </SectionCard>
                    </>
                )
            ) : (
                loadingRenovacion ? (
                    <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '54px 20px', textAlign: 'center', color: '#64748B' }}>
                        <RefreshCw size={26} color={COLOR_PRIMARY} className="animate-spin" style={{ margin: '0 auto 10px' }} />
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>Calculando proyección de renovación anual (12 meses)...</div>
                    </div>
                ) : (
                    <>
                        {/* 3 KPIs Renovación */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '14px' }}>
                            <KpiCard label="Ya Vencidos (≥12 meses)" value={renovacionProjection.vencidosTotal.toLocaleString('es-AR')} pill={`${renovacionProjection.vencidosContactables.toLocaleString('es-AR')} con teléfono`} subtext="Pacientes listos para recontacto inmediato" icon={CalendarCheck} accent="#D97706" bg="#FFFBEB" />
                            <KpiCard label="Vencen en Próximos 6 Meses" value={renovacionProjection.prox6Total.toLocaleString('es-AR')} subtext="Demanda proyectada de renovación preventiva" icon={TrendingUp} accent="#0284C7" bg="#F0F9FF" />
                            <KpiCard label="Cobertura Contactable" value={`${renovacionProjection.pctContactable}%`} pill={`${renovacionProjection.totalContactables.toLocaleString('es-AR')} / ${renovacionProjection.totalUniverso.toLocaleString('es-AR')}`} subtext="Cuentan con teléfono válido para campañas WhatsApp" icon={CheckCircle2} accent="#10B981" bg="#ECFDF5" />
                        </div>

                        {/* GRÁFICO 14: Proyección Renovación Anual + Cápsula 3D de Cobertura */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(320px, 1fr)', gap: '16px' }}>
                            <SectionCard
                                title="Gráfico 14 · Proyección de Renovación Anual de Chequeos (Próximos 6 Meses)"
                                subtitle="Pacientes que cumplen 12 meses desde su último chequeo preventivo vs. aquellos contactables por teléfono"
                            >
                                <div style={{ height: '300px', width: '100%' }}>
                                    <ResponsiveContainer>
                                        <BarChart data={renovacionProjection.bars} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} tickLine={false} axisLine={false} />
                                            <YAxis tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} />
                                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                                            <Legend wrapperStyle={{ fontSize: '0.76rem', paddingTop: '6px' }} />
                                            <Bar dataKey="total" name="Total que vencen" fill="#CBD5E1" radius={[6, 6, 0, 0]} maxBarSize={36} />
                                            <Bar dataKey="contactables" name="Contactables (Con Teléfono)" fill="#10B981" radius={[6, 6, 0, 0]} maxBarSize={36} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </SectionCard>

                            <CapsulaBalance3D
                                title="Cobertura Contactable (Cápsula 3D)"
                                subtitle="Proporción de pacientes renovables con teléfono válido"
                                badgeRightLabel="Contactables"
                                badgeRightValue={`${renovacionProjection.pctContactable}%`}
                                badgeRightSub={`${renovacionProjection.totalContactables.toLocaleString('es-AR')} pacientes`}
                                segments={[
                                    { label: 'Vencidos Contactables', value: renovacionProjection.vencidosContactables, color: '#10B981' },
                                    { label: 'Próx. 6m Contactables', value: Math.max(0, renovacionProjection.totalContactables - renovacionProjection.vencidosContactables), color: '#0284C7' },
                                    { label: 'Sin Teléfono', value: renovacionProjection.sinTelefono, color: '#F59E0B' },
                                ].filter(s => s.value > 0)}
                                height={275}
                            />
                        </div>
                    </>
                )
            )}
        </div>
    );
}
