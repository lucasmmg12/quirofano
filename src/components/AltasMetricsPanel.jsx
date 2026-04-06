/**
 * AltasMetricsPanel.jsx — Dashboard BI de Altas Administrativas
 * 
 * Panel de métricas y visualizaciones para Business Intelligence.
 * Siguiendo principios de KPI Dashboard Design y Data Storytelling.
 */
import { useState, useMemo, useRef, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend, Area, AreaChart,
    RadialBarChart, RadialBar,
} from 'recharts';
import {
    TrendingUp, Users, Building2, Activity, Clock, Stethoscope,
    CheckCircle, AlertCircle, UserCheck, PieChart as PieIcon,
    Filter, X, Calendar, ChevronDown, Search,
} from 'lucide-react';
import { ALTA_ESTADOS } from '../services/altasService';

// ── Paleta Premium ──
const COLORS = ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#F97316', '#14B8A6', '#A855F7'];
const ESTADO_COLORS = {
    'Procesada': '#8B5CF6',
    'En auditoria': '#F59E0B',
    'Prórroga': '#F97316',
    'Con presupuesto': '#EC4899',
    'Alta Adm': '#10B981',
    'Suspendida': '#EF4444',
    'Particular': '#6B7280',
    'Interconsulta': '#3B82F6',
};

// ── Helpers ──
function daysBetween(from, to) {
    if (!from || !to) return null;
    const a = new Date(from + 'T12:00:00');
    const b = new Date(to + 'T12:00:00');
    return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function formatShortDate(d) {
    if (!d) return '';
    const dt = new Date(d + 'T12:00:00');
    return dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

// ── Custom Tooltip ──
const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: 'rgba(255,255,255,0.98)', borderRadius: '10px',
            padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            border: '1px solid rgba(0,0,0,0.06)', fontSize: '0.78rem',
        }}>
            <p style={{ fontWeight: 700, marginBottom: '4px', color: '#1F2937' }}>{label}</p>
            {payload.map((p, i) => (
                <p key={i} style={{ color: p.color || p.fill, margin: '2px 0', fontWeight: 600 }}>
                    {p.name}: {p.value}
                </p>
            ))}
        </div>
    );
};

// ── Searchable Multi-Select Dropdown ──
function FilterDropdown({ label, icon, options, selected, onChange, color = '#6366F1' }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtered = search
        ? options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
        : options;

    const count = selected.size;

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button
                onClick={() => setOpen(p => !p)}
                style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '7px 12px', borderRadius: '10px',
                    background: count > 0 ? color + '10' : '#fff',
                    color: count > 0 ? color : 'var(--neutral-600)',
                    border: `1px solid ${count > 0 ? color + '40' : 'var(--neutral-200)'}`,
                    cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                    transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}
            >
                {icon}
                {label}
                {count > 0 && (
                    <span style={{
                        background: color, color: '#fff', padding: '1px 7px',
                        borderRadius: '10px', fontSize: '0.68rem', fontWeight: 700,
                    }}>{count}</span>
                )}
                <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>

            {open && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, marginTop: '6px', zIndex: 1000,
                    background: '#fff', borderRadius: '12px',
                    boxShadow: '0 12px 32px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
                    padding: '8px', minWidth: '240px', maxHeight: '340px',
                    display: 'flex', flexDirection: 'column',
                    animation: 'fadeIn 0.15s ease-out',
                }}>
                    {/* Search */}
                    <div style={{ position: 'relative', marginBottom: '6px' }}>
                        <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--neutral-400)' }} />
                        <input
                            type="text" value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar..."
                            autoFocus
                            style={{
                                width: '100%', padding: '7px 10px 7px 30px', borderRadius: '8px',
                                border: '1px solid var(--neutral-200)', fontSize: '0.78rem',
                                outline: 'none',
                            }}
                            onFocus={e => e.currentTarget.style.borderColor = color}
                            onBlur={e => e.currentTarget.style.borderColor = 'var(--neutral-200)'}
                        />
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                        <button onClick={() => onChange(new Set(options))} style={{
                            flex: 1, padding: '4px', border: 'none', borderRadius: '6px',
                            background: '#F3F4F6', color: '#6B7280', cursor: 'pointer',
                            fontSize: '0.68rem', fontWeight: 600,
                        }}>Todos</button>
                        <button onClick={() => onChange(new Set())} style={{
                            flex: 1, padding: '4px', border: 'none', borderRadius: '6px',
                            background: '#FEF2F2', color: '#DC2626', cursor: 'pointer',
                            fontSize: '0.68rem', fontWeight: 600,
                        }}>Ninguno</button>
                    </div>

                    {/* Options */}
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        {filtered.map(opt => {
                            const isChecked = selected.has(opt);
                            return (
                                <label key={opt} style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '5px 8px', borderRadius: '6px', cursor: 'pointer',
                                    background: isChecked ? color + '08' : 'transparent',
                                    transition: 'background 0.1s', fontSize: '0.76rem',
                                    color: '#374151',
                                }}
                                    onMouseOver={e => { if (!isChecked) e.currentTarget.style.background = '#F9FAFB'; }}
                                    onMouseOut={e => { if (!isChecked) e.currentTarget.style.background = 'transparent'; }}
                                >
                                    <input
                                        type="checkbox" checked={isChecked}
                                        onChange={() => {
                                            const next = new Set(selected);
                                            if (next.has(opt)) next.delete(opt); else next.add(opt);
                                            onChange(next);
                                        }}
                                        style={{ accentColor: color, width: '14px', height: '14px' }}
                                    />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt}</span>
                                </label>
                            );
                        })}
                        {filtered.length === 0 && (
                            <div style={{ padding: '12px', textAlign: 'center', color: 'var(--neutral-400)', fontSize: '0.75rem' }}>
                                Sin resultados
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── KPI Card ──
function KpiCard({ icon, label, value, subtitle, color = '#6366F1' }) {
    return (
        <div style={{
            background: '#fff', borderRadius: '14px', padding: '18px 20px',
            border: '1px solid var(--neutral-100)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            display: 'flex', flexDirection: 'column', gap: '6px',
            minWidth: '160px', flex: 1,
            transition: 'transform 0.2s, box-shadow 0.2s',
        }}
            onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.08)'; }}
            onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{
                    width: '34px', height: '34px', borderRadius: '9px',
                    background: color + '12', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: color,
                }}>{icon}</div>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1F2937', letterSpacing: '-0.5px' }}>
                {value}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--neutral-400)', fontWeight: 600 }}>
                {label}
            </div>
            {subtitle && (
                <div style={{ fontSize: '0.68rem', color: 'var(--neutral-400)' }}>{subtitle}</div>
            )}
        </div>
    );
}

// ── Section Card ──
function SectionCard({ title, icon, children, minHeight = '280px' }) {
    return (
        <div style={{
            background: '#fff', borderRadius: '14px', padding: '18px 20px',
            border: '1px solid var(--neutral-100)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            minHeight, display: 'flex', flexDirection: 'column',
        }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                marginBottom: '14px', paddingBottom: '10px',
                borderBottom: '1px solid var(--neutral-100)',
            }}>
                <div style={{
                    width: '28px', height: '28px', borderRadius: '7px',
                    background: '#6366F112', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#6366F1',
                }}>{icon}</div>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1F2937' }}>{title}</span>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
                {children}
            </div>
        </div>
    );
}

// ════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════
export default function AltasMetricsPanel({ altas = [] }) {

    // ── Filter State ──
    const [filterOS, setFilterOS] = useState(new Set());
    const [filterResponsable, setFilterResponsable] = useState(new Set());
    const [filterEspecialidad, setFilterEspecialidad] = useState(new Set());
    const [filterFrom, setFilterFrom] = useState('');
    const [filterTo, setFilterTo] = useState('');

    // ── Available Options (from raw data) ──
    const availableOptions = useMemo(() => {
        const os = new Set(), resp = new Set(), esp = new Set();
        altas.forEach(a => {
            if (a.cliente) os.add(a.cliente);
            if (a._responsable) resp.add(a._responsable);
            if (a.especialidad) esp.add(a.especialidad);
        });
        return {
            obrasSociales: [...os].sort(),
            responsables: [...resp].sort(),
            especialidades: [...esp].sort(),
        };
    }, [altas]);

    // ── Filtered Data ──
    const filteredAltas = useMemo(() => {
        return altas.filter(a => {
            if (filterOS.size > 0 && !filterOS.has(a.cliente)) return false;
            if (filterResponsable.size > 0 && !filterResponsable.has(a._responsable)) return false;
            if (filterEspecialidad.size > 0 && !filterEspecialidad.has(a.especialidad)) return false;
            if (filterFrom && a.fecha_ingreso && a.fecha_ingreso < filterFrom) return false;
            if (filterTo && a.fecha_ingreso && a.fecha_ingreso > filterTo) return false;
            return true;
        });
    }, [altas, filterOS, filterResponsable, filterEspecialidad, filterFrom, filterTo]);

    const hasActiveFilters = filterOS.size > 0 || filterResponsable.size > 0 || filterEspecialidad.size > 0 || filterFrom || filterTo;

    const clearAllFilters = () => {
        setFilterOS(new Set());
        setFilterResponsable(new Set());
        setFilterEspecialidad(new Set());
        setFilterFrom('');
        setFilterTo('');
    };

    // ── All metrics computed from filteredAltas ──
    const data = filteredAltas;

    // ── 1) KPIs ──
    const kpis = useMemo(() => {
        const total = data.length;
        const internados = data.filter(a => !a.fecha_alta).length;
        const conAlta = total - internados;
        const controlSi = data.filter(a => a.control_adm_finalizado === 'Sí').length;
        const controlNo = total - controlSi;
        const dias = data
            .filter(a => a.fecha_alta && a.fecha_ingreso)
            .map(a => daysBetween(a.fecha_ingreso, a.fecha_alta))
            .filter(d => d !== null && d >= 0);
        const avgDias = dias.length > 0 ? (dias.reduce((s, d) => s + d, 0) / dias.length).toFixed(1) : '—';
        const responsables = new Set(data.map(a => a._responsable).filter(Boolean));
        const obrasSociales = new Set(data.map(a => a.cliente).filter(Boolean));
        return { total, internados, conAlta, controlSi, controlNo, avgDias, responsables: responsables.size, obrasSociales: obrasSociales.size };
    }, [data]);

    // ── 2) Admisiones por Responsable ──
    const admisionesPorResponsable = useMemo(() => {
        const map = {};
        data.forEach(a => { const r = a._responsable || 'Sin asignar'; map[r] = (map[r] || 0) + 1; });
        return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    }, [data]);

    // ── 3) OS por Responsable ──
    const osPorResponsable = useMemo(() => {
        const map = {};
        data.forEach(a => {
            const r = a._responsable || 'Sin asignar', os = a.cliente || 'Sin OS';
            if (!map[r]) map[r] = {};
            map[r][os] = (map[r][os] || 0) + 1;
        });
        const allOs = {};
        data.forEach(a => { const os = a.cliente || 'Sin OS'; allOs[os] = (allOs[os] || 0) + 1; });
        const topOs = Object.entries(allOs).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);
        const chartData = Object.entries(map)
            .sort((a, b) => Object.values(b[1]).reduce((s, v) => s + v, 0) - Object.values(a[1]).reduce((s, v) => s + v, 0))
            .slice(0, 8)
            .map(([resp, osMap]) => {
                const row = { name: resp.length > 14 ? resp.slice(0, 12) + '…' : resp };
                topOs.forEach(os => { row[os] = osMap[os] || 0; });
                return row;
            });
        return { data: chartData, keys: topOs };
    }, [data]);

    // ── 4) Estado ──
    const estadoDistribution = useMemo(() => {
        const map = {};
        data.forEach(a => { const e = a._effectiveEstado || 'Procesada'; map[e] = (map[e] || 0) + 1; });
        return Object.entries(map).map(([name, value]) => ({ name: ALTA_ESTADOS[name]?.label || name, value, fill: ESTADO_COLORS[name] || '#6B7280' })).sort((a, b) => b.value - a.value);
    }, [data]);

    // ── 5) Tendencia ──
    const tendenciaIngreso = useMemo(() => {
        const map = {};
        data.forEach(a => { if (!a.fecha_ingreso) return; map[a.fecha_ingreso] = (map[a.fecha_ingreso] || 0) + 1; });
        return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date: formatShortDate(date), fullDate: date, ingresos: count }));
    }, [data]);

    // ── 6) Top OS ──
    const topObrasSociales = useMemo(() => {
        const map = {};
        data.forEach(a => { const os = a.cliente || 'Sin OS'; map[os] = (map[os] || 0) + 1; });
        return Object.entries(map).map(([name, value]) => ({ name: name.length > 22 ? name.slice(0, 20) + '…' : name, value, fullName: name })).sort((a, b) => b.value - a.value).slice(0, 10);
    }, [data]);

    // ── 7) Top Especialidades ──
    const topEspecialidades = useMemo(() => {
        const map = {};
        data.forEach(a => { const e = a.especialidad || 'Sin especialidad'; map[e] = (map[e] || 0) + 1; });
        return Object.entries(map).map(([name, value]) => ({ name: name.length > 22 ? name.slice(0, 20) + '…' : name, value, fullName: name })).sort((a, b) => b.value - a.value).slice(0, 10);
    }, [data]);

    // ── 8) Días por OS ──
    const diasPorOS = useMemo(() => {
        const map = {};
        data.forEach(a => {
            if (!a.fecha_alta || !a.fecha_ingreso) return;
            const os = a.cliente || 'Sin OS', d = daysBetween(a.fecha_ingreso, a.fecha_alta);
            if (d === null || d < 0) return;
            if (!map[os]) map[os] = { total: 0, count: 0 };
            map[os].total += d; map[os].count++;
        });
        return Object.entries(map).filter(([, v]) => v.count >= 2)
            .map(([name, v]) => ({ name: name.length > 18 ? name.slice(0, 16) + '…' : name, promedio: parseFloat((v.total / v.count).toFixed(1)), count: v.count, fullName: name }))
            .sort((a, b) => b.promedio - a.promedio).slice(0, 10);
    }, [data]);

    // ── 9) Control ADM ──
    const controlAdmData = useMemo(() => {
        const total = kpis.controlSi + kpis.controlNo;
        const pct = total > 0 ? Math.round((kpis.controlSi / total) * 100) : 0;
        return [{ name: 'Completado', value: pct, fill: '#10B981' }];
    }, [kpis]);

    // ── 10) Top Médicos ──
    const topMedicos = useMemo(() => {
        const map = {};
        data.forEach(a => { const d = a.doctor || 'Sin médico'; map[d] = (map[d] || 0) + 1; });
        return Object.entries(map).map(([name, value]) => ({ name: name.length > 20 ? name.slice(0, 18) + '…' : name, value, fullName: name })).sort((a, b) => b.value - a.value).slice(0, 10);
    }, [data]);

    // ════════════════════════════════════════════════
    // RENDER
    // ════════════════════════════════════════════════
    if (altas.length === 0) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', color: 'var(--neutral-400)', fontSize: '0.9rem' }}>
                No hay datos para mostrar métricas. Ajusta los filtros de fecha.
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* ══════ FILTER BAR ══════ */}
            <div style={{
                display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap',
                padding: '12px 16px', borderRadius: '14px',
                background: '#fff', border: '1px solid var(--neutral-100)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    color: '#6366F1', fontSize: '0.8rem', fontWeight: 700,
                }}>
                    <Filter size={15} />
                    Filtros
                </div>

                <div style={{ width: '1px', height: '24px', background: 'var(--neutral-200)' }} />

                {/* OS Filter */}
                <FilterDropdown
                    label="Obra Social"
                    icon={<Building2 size={13} />}
                    options={availableOptions.obrasSociales}
                    selected={filterOS}
                    onChange={setFilterOS}
                    color="#EC4899"
                />

                {/* Responsable Filter */}
                <FilterDropdown
                    label="Responsable"
                    icon={<UserCheck size={13} />}
                    options={availableOptions.responsables}
                    selected={filterResponsable}
                    onChange={setFilterResponsable}
                    color="#3B82F6"
                />

                {/* Especialidad Filter */}
                <FilterDropdown
                    label="Especialidad"
                    icon={<Stethoscope size={13} />}
                    options={availableOptions.especialidades}
                    selected={filterEspecialidad}
                    onChange={setFilterEspecialidad}
                    color="#8B5CF6"
                />

                <div style={{ width: '1px', height: '24px', background: 'var(--neutral-200)' }} />

                {/* Date Filters */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Calendar size={13} color="var(--neutral-400)" />
                    <span style={{ fontSize: '0.72rem', color: 'var(--neutral-500)', fontWeight: 600 }}>Ingreso:</span>
                    <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                        style={{
                            padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--neutral-200)',
                            fontSize: '0.76rem', color: 'var(--neutral-700)', outline: 'none',
                        }}
                    />
                    <span style={{ fontSize: '0.72rem', color: 'var(--neutral-400)' }}>a</span>
                    <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                        style={{
                            padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--neutral-200)',
                            fontSize: '0.76rem', color: 'var(--neutral-700)', outline: 'none',
                        }}
                    />
                </div>

                {/* Clear + Counter */}
                {hasActiveFilters && (
                    <>
                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                                fontSize: '0.72rem', color: '#6366F1', fontWeight: 700,
                                padding: '3px 10px', borderRadius: '20px',
                                background: '#EEF2FF',
                            }}>
                                {data.length} de {altas.length} registros
                            </span>
                            <button
                                onClick={clearAllFilters}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '4px',
                                    padding: '5px 10px', borderRadius: '8px',
                                    background: '#FEF2F2', color: '#DC2626',
                                    border: 'none', cursor: 'pointer',
                                    fontSize: '0.72rem', fontWeight: 600,
                                }}
                            >
                                <X size={12} /> Limpiar
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* ══════ KPI CARDS ══════ */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                <KpiCard icon={<Activity size={18} />} label="Total Admisiones" value={kpis.total} color="#6366F1" />
                <KpiCard icon={<AlertCircle size={18} />} label="Pacientes Internados" value={kpis.internados}
                    subtitle={`${kpis.total > 0 ? Math.round((kpis.internados / kpis.total) * 100) : 0}% del total`} color="#F59E0B" />
                <KpiCard icon={<CheckCircle size={18} />} label="Con Alta" value={kpis.conAlta} color="#10B981" />
                <KpiCard icon={<Clock size={18} />} label="Prom. Días Internación" value={kpis.avgDias}
                    subtitle="Sobre pacientes dados de alta" color="#8B5CF6" />
                <KpiCard icon={<Users size={18} />} label="Responsables Activos" value={kpis.responsables} color="#3B82F6" />
                <KpiCard icon={<Building2 size={18} />} label="Obras Sociales" value={kpis.obrasSociales} color="#EC4899" />
            </div>

            {/* ══════ TENDENCIA + ESTADO ══════ */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                <SectionCard title="Tendencia de Ingresos" icon={<TrendingUp size={15} />} minHeight="300px">
                    <ResponsiveContainer width="100%" height={240}>
                        <AreaChart data={tendenciaIngreso} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                            <defs>
                                <linearGradient id="gradIngreso" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.25} />
                                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                            <XAxis dataKey="date" fontSize={11} tick={{ fill: '#9CA3AF' }} />
                            <YAxis fontSize={11} tick={{ fill: '#9CA3AF' }} allowDecimals={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area type="monotone" dataKey="ingresos" stroke="#6366F1" strokeWidth={2.5}
                                fill="url(#gradIngreso)" name="Ingresos" dot={{ r: 3, fill: '#6366F1' }} />
                        </AreaChart>
                    </ResponsiveContainer>
                </SectionCard>

                <SectionCard title="Distribución por Estado" icon={<PieIcon size={15} />} minHeight="300px">
                    <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                            <Pie data={estadoDistribution} cx="50%" cy="45%" innerRadius={50} outerRadius={80}
                                paddingAngle={3} dataKey="value" stroke="none">
                                {estadoDistribution.map((entry, idx) => (<Cell key={idx} fill={entry.fill} />))}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                            <Legend verticalAlign="bottom" iconType="circle" iconSize={8}
                                formatter={(value) => <span style={{ fontSize: '0.68rem', color: '#6B7280' }}>{value}</span>} />
                        </PieChart>
                    </ResponsiveContainer>
                </SectionCard>
            </div>

            {/* ══════ RESPONSABLE + OS POR RESPONSABLE ══════ */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <SectionCard title="Admisiones por Responsable" icon={<UserCheck size={15} />}>
                    <ResponsiveContainer width="100%" height={Math.max(220, admisionesPorResponsable.length * 36)}>
                        <BarChart data={admisionesPorResponsable} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                            <XAxis type="number" fontSize={11} tick={{ fill: '#9CA3AF' }} allowDecimals={false} />
                            <YAxis type="category" dataKey="name" fontSize={11} tick={{ fill: '#6B7280' }} width={100} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="value" name="Admisiones" radius={[0, 6, 6, 0]} maxBarSize={24}>
                                {admisionesPorResponsable.map((_, idx) => (<Cell key={idx} fill={COLORS[idx % COLORS.length]} />))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </SectionCard>

                <SectionCard title="Obras Sociales por Responsable" icon={<Building2 size={15} />}>
                    <ResponsiveContainer width="100%" height={Math.max(220, osPorResponsable.data.length * 36)}>
                        <BarChart data={osPorResponsable.data} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                            <XAxis type="number" fontSize={11} tick={{ fill: '#9CA3AF' }} allowDecimals={false} />
                            <YAxis type="category" dataKey="name" fontSize={11} tick={{ fill: '#6B7280' }} width={100} />
                            <Tooltip content={<CustomTooltip />} />
                            {osPorResponsable.keys.map((os, idx) => (
                                <Bar key={os} dataKey={os} name={os} stackId="stack"
                                    fill={COLORS[idx % COLORS.length]}
                                    radius={idx === osPorResponsable.keys.length - 1 ? [0, 6, 6, 0] : [0, 0, 0, 0]}
                                    maxBarSize={24} />
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                </SectionCard>
            </div>

            {/* ══════ TOP OS + TOP ESPECIALIDADES ══════ */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <SectionCard title="Top 10 Obras Sociales" icon={<Building2 size={15} />}>
                    <ResponsiveContainer width="100%" height={Math.max(220, topObrasSociales.length * 30)}>
                        <BarChart data={topObrasSociales} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                            <XAxis type="number" fontSize={11} tick={{ fill: '#9CA3AF' }} allowDecimals={false} />
                            <YAxis type="category" dataKey="name" fontSize={10} tick={{ fill: '#6B7280' }} width={150} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="value" name="Admisiones" fill="#EC4899" radius={[0, 6, 6, 0]} maxBarSize={20} />
                        </BarChart>
                    </ResponsiveContainer>
                </SectionCard>

                <SectionCard title="Top 10 Especialidades" icon={<Stethoscope size={15} />}>
                    <ResponsiveContainer width="100%" height={Math.max(220, topEspecialidades.length * 30)}>
                        <BarChart data={topEspecialidades} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                            <XAxis type="number" fontSize={11} tick={{ fill: '#9CA3AF' }} allowDecimals={false} />
                            <YAxis type="category" dataKey="name" fontSize={10} tick={{ fill: '#6B7280' }} width={150} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="value" name="Admisiones" fill="#8B5CF6" radius={[0, 6, 6, 0]} maxBarSize={20} />
                        </BarChart>
                    </ResponsiveContainer>
                </SectionCard>
            </div>

            {/* ══════ DÍAS POR OS + MÉDICOS + CONTROL ADM ══════ */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 280px', gap: '12px' }}>
                <SectionCard title="Promedio Días Internación por OS" icon={<Clock size={15} />}>
                    {diasPorOS.length > 0 ? (
                        <ResponsiveContainer width="100%" height={Math.max(220, diasPorOS.length * 30)}>
                            <BarChart data={diasPorOS} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                                <XAxis type="number" fontSize={11} tick={{ fill: '#9CA3AF' }} />
                                <YAxis type="category" dataKey="name" fontSize={10} tick={{ fill: '#6B7280' }} width={130} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="promedio" name="Prom. Días" fill="#F59E0B" radius={[0, 6, 6, 0]} maxBarSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--neutral-400)', fontSize: '0.8rem' }}>
                            Datos insuficientes (min. 2 registros por OS con alta)
                        </div>
                    )}
                </SectionCard>

                <SectionCard title="Top 10 Médicos" icon={<Stethoscope size={15} />}>
                    <ResponsiveContainer width="100%" height={Math.max(220, topMedicos.length * 30)}>
                        <BarChart data={topMedicos} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                            <XAxis type="number" fontSize={11} tick={{ fill: '#9CA3AF' }} allowDecimals={false} />
                            <YAxis type="category" dataKey="name" fontSize={10} tick={{ fill: '#6B7280' }} width={140} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="value" name="Admisiones" fill="#3B82F6" radius={[0, 6, 6, 0]} maxBarSize={20} />
                        </BarChart>
                    </ResponsiveContainer>
                </SectionCard>

                <SectionCard title="Control ADM" icon={<CheckCircle size={15} />} minHeight="280px">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                        <ResponsiveContainer width="100%" height={180}>
                            <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="90%"
                                startAngle={180} endAngle={0} data={controlAdmData}>
                                <RadialBar dataKey="value" cornerRadius={10} background={{ fill: '#F3F4F6' }} />
                            </RadialBarChart>
                        </ResponsiveContainer>
                        <div style={{ textAlign: 'center', marginTop: '-40px' }}>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10B981' }}>
                                {controlAdmData[0]?.value || 0}%
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--neutral-400)', fontWeight: 600 }}>Completado</div>
                            <div style={{ display: 'flex', gap: '16px', marginTop: '8px', justifyContent: 'center' }}>
                                <span style={{ fontSize: '0.7rem', color: '#10B981', fontWeight: 700 }}>✅ {kpis.controlSi} Sí</span>
                                <span style={{ fontSize: '0.7rem', color: '#EF4444', fontWeight: 700 }}>❌ {kpis.controlNo} No</span>
                            </div>
                        </div>
                    </div>
                </SectionCard>
            </div>

        </div>
    );
}
