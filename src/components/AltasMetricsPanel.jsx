/**
 * AltasMetricsPanel.jsx — Dashboard BI de Altas Administrativas
 * 
 * Panel de métricas y visualizaciones para Business Intelligence.
 * Siguiendo principios de KPI Dashboard Design y Data Storytelling.
 */
import { useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend, LineChart, Line, Area, AreaChart,
    RadialBarChart, RadialBar,
} from 'recharts';
import {
    TrendingUp, Users, Building2, Activity, Clock, Stethoscope,
    CheckCircle, AlertCircle, UserCheck, BarChart3, PieChart as PieIcon,
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

// ── KPI Card ──
function KpiCard({ icon, label, value, subtitle, color = '#6366F1', trend, trendLabel }) {
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
                {trend !== undefined && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '3px',
                        padding: '3px 8px', borderRadius: '20px',
                        background: trend >= 0 ? '#ECFDF5' : '#FEF2F2',
                        color: trend >= 0 ? '#059669' : '#DC2626',
                        fontSize: '0.68rem', fontWeight: 700,
                    }}>
                        <TrendingUp size={11} style={{ transform: trend < 0 ? 'rotate(180deg)' : 'none' }} />
                        {Math.abs(trend)}%
                    </div>
                )}
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

    // ── 1) KPIs Headline ──
    const kpis = useMemo(() => {
        const total = altas.length;
        const internados = altas.filter(a => !a.fecha_alta).length;
        const conAlta = total - internados;
        const controlSi = altas.filter(a => a.control_adm_finalizado === 'Sí').length;
        const controlNo = total - controlSi;

        // Días promedio de internación (solo con alta)
        const dias = altas
            .filter(a => a.fecha_alta && a.fecha_ingreso)
            .map(a => daysBetween(a.fecha_ingreso, a.fecha_alta))
            .filter(d => d !== null && d >= 0);
        const avgDias = dias.length > 0 ? (dias.reduce((s, d) => s + d, 0) / dias.length).toFixed(1) : '—';

        const responsables = new Set(altas.map(a => a._responsable).filter(Boolean));
        const obrasSociales = new Set(altas.map(a => a.cliente).filter(Boolean));

        return { total, internados, conAlta, controlSi, controlNo, avgDias, responsables: responsables.size, obrasSociales: obrasSociales.size };
    }, [altas]);

    // ── 2) Admisiones por Responsable ──
    const admisionesPorResponsable = useMemo(() => {
        const map = {};
        altas.forEach(a => {
            const resp = a._responsable || 'Sin asignar';
            map[resp] = (map[resp] || 0) + 1;
        });
        return Object.entries(map)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    }, [altas]);

    // ── 3) Obras Sociales por Responsable (top 5 responsables, top 5 OS cada uno) ──
    const osPorResponsable = useMemo(() => {
        const map = {};
        altas.forEach(a => {
            const resp = a._responsable || 'Sin asignar';
            const os = a.cliente || 'Sin OS';
            if (!map[resp]) map[resp] = {};
            map[resp][os] = (map[resp][os] || 0) + 1;
        });

        // Obtener todas las OS únicas (top 8)
        const allOs = {};
        altas.forEach(a => {
            const os = a.cliente || 'Sin OS';
            allOs[os] = (allOs[os] || 0) + 1;
        });
        const topOs = Object.entries(allOs).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);

        // Construir data para stacked bar
        const data = Object.entries(map)
            .sort((a, b) => Object.values(b[1]).reduce((s, v) => s + v, 0) - Object.values(a[1]).reduce((s, v) => s + v, 0))
            .slice(0, 8)
            .map(([resp, osMap]) => {
                const row = { name: resp.length > 14 ? resp.slice(0, 12) + '…' : resp };
                topOs.forEach(os => { row[os] = osMap[os] || 0; });
                return row;
            });

        return { data, keys: topOs };
    }, [altas]);

    // ── 4) Distribución por Estado ──
    const estadoDistribution = useMemo(() => {
        const map = {};
        altas.forEach(a => {
            const estado = a._effectiveEstado || 'Procesada';
            map[estado] = (map[estado] || 0) + 1;
        });
        return Object.entries(map)
            .map(([name, value]) => ({ name: ALTA_ESTADOS[name]?.label || name, value, fill: ESTADO_COLORS[name] || '#6B7280' }))
            .sort((a, b) => b.value - a.value);
    }, [altas]);

    // ── 5) Tendencia de Ingresos por día ──
    const tendenciaIngreso = useMemo(() => {
        const map = {};
        altas.forEach(a => {
            if (!a.fecha_ingreso) return;
            const key = a.fecha_ingreso;
            map[key] = (map[key] || 0) + 1;
        });
        return Object.entries(map)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, count]) => ({ date: formatShortDate(date), fullDate: date, ingresos: count }));
    }, [altas]);

    // ── 6) Top Obras Sociales ──
    const topObrasSociales = useMemo(() => {
        const map = {};
        altas.forEach(a => {
            const os = a.cliente || 'Sin OS';
            map[os] = (map[os] || 0) + 1;
        });
        return Object.entries(map)
            .map(([name, value]) => ({ name: name.length > 22 ? name.slice(0, 20) + '…' : name, value, fullName: name }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
    }, [altas]);

    // ── 7) Top Especialidades ──
    const topEspecialidades = useMemo(() => {
        const map = {};
        altas.forEach(a => {
            const esp = a.especialidad || 'Sin especialidad';
            map[esp] = (map[esp] || 0) + 1;
        });
        return Object.entries(map)
            .map(([name, value]) => ({ name: name.length > 22 ? name.slice(0, 20) + '…' : name, value, fullName: name }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
    }, [altas]);

    // ── 8) Días promedio por Obra Social (top 10) ──
    const diasPorOS = useMemo(() => {
        const map = {};
        altas.forEach(a => {
            if (!a.fecha_alta || !a.fecha_ingreso) return;
            const os = a.cliente || 'Sin OS';
            const d = daysBetween(a.fecha_ingreso, a.fecha_alta);
            if (d === null || d < 0) return;
            if (!map[os]) map[os] = { total: 0, count: 0 };
            map[os].total += d;
            map[os].count++;
        });
        return Object.entries(map)
            .filter(([, v]) => v.count >= 2)
            .map(([name, v]) => ({
                name: name.length > 18 ? name.slice(0, 16) + '…' : name,
                promedio: parseFloat((v.total / v.count).toFixed(1)),
                count: v.count,
                fullName: name,
            }))
            .sort((a, b) => b.promedio - a.promedio)
            .slice(0, 10);
    }, [altas]);

    // ── 9) Control ADM gauge ──
    const controlAdmData = useMemo(() => {
        const si = kpis.controlSi;
        const no = kpis.controlNo;
        const total = si + no;
        const pct = total > 0 ? Math.round((si / total) * 100) : 0;
        return [
            { name: 'Completado', value: pct, fill: '#10B981' },
        ];
    }, [kpis]);

    // ── 10) Top Médicos ──
    const topMedicos = useMemo(() => {
        const map = {};
        altas.forEach(a => {
            const doc = a.doctor || 'Sin médico';
            map[doc] = (map[doc] || 0) + 1;
        });
        return Object.entries(map)
            .map(([name, value]) => ({ name: name.length > 20 ? name.slice(0, 18) + '…' : name, value, fullName: name }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
    }, [altas]);

    // ════════════════════════════════════════════════
    // RENDER
    // ════════════════════════════════════════════════
    if (altas.length === 0) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '60px 20px', color: 'var(--neutral-400)', fontSize: '0.9rem',
            }}>
                No hay datos para mostrar métricas. Ajusta los filtros de fecha.
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* ── Row 1: KPI Cards ── */}
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '12px',
            }}>
                <KpiCard
                    icon={<Activity size={18} />}
                    label="Total Admisiones"
                    value={kpis.total}
                    color="#6366F1"
                />
                <KpiCard
                    icon={<AlertCircle size={18} />}
                    label="Pacientes Internados"
                    value={kpis.internados}
                    subtitle={`${kpis.total > 0 ? Math.round((kpis.internados / kpis.total) * 100) : 0}% del total`}
                    color="#F59E0B"
                />
                <KpiCard
                    icon={<CheckCircle size={18} />}
                    label="Con Alta"
                    value={kpis.conAlta}
                    color="#10B981"
                />
                <KpiCard
                    icon={<Clock size={18} />}
                    label="Prom. Días Internación"
                    value={kpis.avgDias}
                    subtitle="Sobre pacientes dados de alta"
                    color="#8B5CF6"
                />
                <KpiCard
                    icon={<Users size={18} />}
                    label="Responsables Activos"
                    value={kpis.responsables}
                    color="#3B82F6"
                />
                <KpiCard
                    icon={<Building2 size={18} />}
                    label="Obras Sociales"
                    value={kpis.obrasSociales}
                    color="#EC4899"
                />
            </div>

            {/* ── Row 2: Tendencia + Estado ── */}
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
                            <Pie
                                data={estadoDistribution}
                                cx="50%" cy="45%"
                                innerRadius={50} outerRadius={80}
                                paddingAngle={3}
                                dataKey="value"
                                stroke="none"
                            >
                                {estadoDistribution.map((entry, idx) => (
                                    <Cell key={idx} fill={entry.fill} />
                                ))}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                            <Legend
                                verticalAlign="bottom"
                                iconType="circle"
                                iconSize={8}
                                formatter={(value) => <span style={{ fontSize: '0.68rem', color: '#6B7280' }}>{value}</span>}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </SectionCard>
            </div>

            {/* ── Row 3: Admisiones por Responsable + OS por Responsable ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <SectionCard title="Admisiones por Responsable" icon={<UserCheck size={15} />}>
                    <ResponsiveContainer width="100%" height={Math.max(220, admisionesPorResponsable.length * 36)}>
                        <BarChart data={admisionesPorResponsable} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                            <XAxis type="number" fontSize={11} tick={{ fill: '#9CA3AF' }} allowDecimals={false} />
                            <YAxis type="category" dataKey="name" fontSize={11} tick={{ fill: '#6B7280' }} width={100} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="value" name="Admisiones" radius={[0, 6, 6, 0]} maxBarSize={24}>
                                {admisionesPorResponsable.map((_, idx) => (
                                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                                ))}
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
                                    maxBarSize={24}
                                />
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                </SectionCard>
            </div>

            {/* ── Row 4: Top OS + Top Especialidades ── */}
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

            {/* ── Row 5: Días por OS + Top Médicos + Control ADM ── */}
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
                            <RadialBarChart
                                cx="50%" cy="50%"
                                innerRadius="60%" outerRadius="90%"
                                startAngle={180} endAngle={0}
                                data={controlAdmData}
                            >
                                <RadialBar
                                    dataKey="value"
                                    cornerRadius={10}
                                    background={{ fill: '#F3F4F6' }}
                                />
                            </RadialBarChart>
                        </ResponsiveContainer>
                        <div style={{ textAlign: 'center', marginTop: '-40px' }}>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10B981' }}>
                                {controlAdmData[0]?.value || 0}%
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--neutral-400)', fontWeight: 600 }}>
                                Completado
                            </div>
                            <div style={{ display: 'flex', gap: '16px', marginTop: '8px', justifyContent: 'center' }}>
                                <span style={{ fontSize: '0.7rem', color: '#10B981', fontWeight: 700 }}>
                                    ✅ {kpis.controlSi} Sí
                                </span>
                                <span style={{ fontSize: '0.7rem', color: '#EF4444', fontWeight: 700 }}>
                                    ❌ {kpis.controlNo} No
                                </span>
                            </div>
                        </div>
                    </div>
                </SectionCard>
            </div>

        </div>
    );
}
