import { useState, useEffect } from 'react';
import {
    Home, Stethoscope, MessageCircle, DollarSign, AlertTriangle,
    Clock, TrendingUp, ArrowRight, RefreshCw, Loader2,
    Calendar, Phone, Users, Activity, ChevronRight,
    Zap, Shield, BookOpen, ClipboardCheck, Brain,
} from 'lucide-react';
import { fetchDashboardKPIs, fetchRecentActivity, fetchUrgentSurgeries } from '../services/dashboardService';
import { SkeletonKPI, SkeletonCard } from './SkeletonLoader';

const VIEW_LABELS = {
    cirugias: 'Control de Cirugías',
    mensajeria: 'Mensajería',
    deudas: 'Deudas',
    altas: 'Altas Adm',
    turnos: 'Cola de Turnos',
    beto: 'Simon IA',
};

const STATUS_LABELS = {
    lila: { label: 'Sin mensaje', color: '#A78BFA' },
    rosado: { label: 'Doc. recibida', color: '#F472B6' },
    amarillo: { label: 'En revisión', color: '#FBBF24' },
    verde: { label: 'Autorizada', color: '#34D399' },
    azul: { label: 'Confirmada', color: '#60A5FA' },
    rojo: { label: 'Problema', color: '#F87171' },
};

function formatCurrency(n) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
}

function formatTimeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Hace instantes';
    if (mins < 60) return `Hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `Hace ${hrs}h`;
    return `Hace ${Math.floor(hrs / 24)}d`;
}

function KPICard({ icon: Icon, label, value, subtext, color, bg, onClick }) {
    return (
        <button
            onClick={onClick}
            style={{
                background: 'var(--neutral-0)', borderRadius: '16px',
                border: '1px solid var(--neutral-200)', padding: '20px',
                display: 'flex', flexDirection: 'column', gap: '8px',
                cursor: onClick ? 'pointer' : 'default',
                transition: 'all 0.2s', textAlign: 'left', width: '100%',
                boxShadow: 'var(--shadow-sm)',
            }}
            onMouseOver={e => { if (onClick) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.borderColor = color + '60'; } }}
            onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; e.currentTarget.style.borderColor = 'var(--neutral-200)'; }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{
                    width: '36px', height: '36px', borderRadius: '10px',
                    background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Icon size={18} style={{ color }} />
                </div>
                {onClick && <ChevronRight size={14} style={{ color: 'var(--neutral-300)' }} />}
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--neutral-800)', letterSpacing: '-0.02em', lineHeight: 1 }}>
                {value}
            </div>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--neutral-500)' }}>{label}</div>
            {subtext && (
                <div style={{ fontSize: '0.72rem', color, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <TrendingUp size={12} /> {subtext}
                </div>
            )}
        </button>
    );
}

export default function HomePanel({ onNavigate }) {
    const [kpis, setKpis] = useState(null);
    const [activity, setActivity] = useState([]);
    const [urgent, setUrgent] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const hora = new Date().getHours();
    const saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches';

    const loadData = async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        try {
            const [k, a, u] = await Promise.all([
                fetchDashboardKPIs(),
                fetchRecentActivity(),
                fetchUrgentSurgeries(),
            ]);
            setKpis(k);
            setActivity(a);
            setUrgent(u);
        } catch (e) {
            console.error('[HomePanel] Error loading dashboard:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const QUICK_LINKS = [
        { id: 'cirugias', label: 'Cirugías', icon: Stethoscope, color: '#10B981', bg: '#ECFDF5' },
        { id: 'mensajeria', label: 'Chat', icon: MessageCircle, color: '#3B82F6', bg: '#EFF6FF' },
        { id: 'deudas', label: 'Deudas', icon: DollarSign, color: '#F59E0B', bg: '#FFFBEB' },
        { id: 'altas', label: 'Altas', icon: ClipboardCheck, color: '#8B5CF6', bg: '#F5F3FF' },
        { id: 'beto', label: 'Simon IA', icon: Brain, color: '#6366F1', bg: '#EEF2FF' },
        { id: 'turnos', label: 'Turnos', icon: Users, color: '#EC4899', bg: '#FDF2F8' },
    ];

    return (
        <div className="content no-print view-transition-enter" style={{ maxWidth: '1100px', margin: '0 auto' }}>

            {/* ═══════ GREETING BAR ═══════ */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 0',
            }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--neutral-800)', margin: 0, letterSpacing: '-0.02em' }}>
                        {saludo} 👋
                    </h1>
                    <p style={{ fontSize: '0.85rem', color: 'var(--neutral-500)', margin: '4px 0 0', fontWeight: 500 }}>
                        Panel de control — {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                </div>
                <button
                    onClick={() => loadData(true)}
                    disabled={refreshing}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '8px 16px', borderRadius: '10px',
                        border: '1px solid var(--neutral-200)', background: 'var(--neutral-0)',
                        fontSize: '0.78rem', fontWeight: 600, color: 'var(--neutral-600)',
                        cursor: 'pointer', transition: 'all 0.15s',
                    }}
                    onMouseOver={e => { e.currentTarget.style.background = 'var(--neutral-50)'; e.currentTarget.style.borderColor = 'var(--neutral-300)'; }}
                    onMouseOut={e => { e.currentTarget.style.background = 'var(--neutral-0)'; e.currentTarget.style.borderColor = 'var(--neutral-200)'; }}
                >
                    <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                    {refreshing ? 'Actualizando...' : 'Actualizar'}
                </button>
            </div>

            {/* ═══════ KPI GRID ═══════ */}
            {loading ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
                    {Array.from({ length: 4 }).map((_, i) => <SkeletonKPI key={i} />)}
                </div>
            ) : kpis && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
                    <KPICard
                        icon={Stethoscope} label="Cirugías hoy" value={kpis.cirugias_hoy}
                        subtext={`${kpis.cirugias_semana} esta semana`}
                        color="#10B981" bg="#ECFDF5"
                        onClick={onNavigate ? () => onNavigate('cirugias') : undefined}
                    />
                    <KPICard
                        icon={AlertTriangle} label="Sin confirmar" value={kpis.cirugias_sin_confirmar}
                        subtext={kpis.cirugias_sin_confirmar > 0 ? 'Requieren atención' : 'Todo al día'}
                        color={kpis.cirugias_sin_confirmar > 0 ? '#F59E0B' : '#10B981'}
                        bg={kpis.cirugias_sin_confirmar > 0 ? '#FFFBEB' : '#ECFDF5'}
                        onClick={onNavigate ? () => onNavigate('cirugias') : undefined}
                    />
                    <KPICard
                        icon={MessageCircle} label="Mensajes sin leer" value={kpis.mensajes_sin_leer}
                        subtext={kpis.mensajes_sin_leer > 0 ? 'Pendientes de respuesta' : 'Inbox limpio'}
                        color={kpis.mensajes_sin_leer > 0 ? '#3B82F6' : '#10B981'}
                        bg={kpis.mensajes_sin_leer > 0 ? '#EFF6FF' : '#ECFDF5'}
                        onClick={onNavigate ? () => onNavigate('mensajeria') : undefined}
                    />
                    <KPICard
                        icon={DollarSign} label="Deuda activa" value={formatCurrency(kpis.deuda_total)}
                        subtext={`${kpis.deudores_activos} deudores activos`}
                        color="#F59E0B" bg="#FFFBEB"
                        onClick={onNavigate ? () => onNavigate('deudas') : undefined}
                    />
                </div>
            )}

            {/* ═══════ CONTENT ROW: URGENT + ACTIVITY ═══════ */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', marginTop: '4px' }}>

                {/* Alertas urgentes */}
                <div style={{
                    background: 'var(--neutral-0)', borderRadius: '16px',
                    border: '1px solid var(--neutral-200)', overflow: 'hidden',
                    boxShadow: 'var(--shadow-sm)',
                }}>
                    <div style={{
                        padding: '16px 20px', borderBottom: '1px solid var(--neutral-100)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                                width: '28px', height: '28px', borderRadius: '8px',
                                background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <AlertTriangle size={14} style={{ color: '#F59E0B' }} />
                            </div>
                            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--neutral-800)' }}>
                                Cirugías sin confirmar
                            </span>
                        </div>
                        <span style={{
                            padding: '2px 10px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 700,
                            background: urgent.length > 0 ? '#FEF3C7' : '#ECFDF5',
                            color: urgent.length > 0 ? '#D97706' : '#059669',
                        }}>
                            {urgent.length > 0 ? `${urgent.length} pendientes` : '✓ Al día'}
                        </span>
                    </div>

                    {loading ? (
                        <div style={{ padding: '20px' }}>
                            <SkeletonCard height={120} />
                        </div>
                    ) : urgent.length === 0 ? (
                        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                            <Shield size={32} style={{ color: 'var(--neutral-300)', marginBottom: '8px' }} />
                            <p style={{ fontSize: '0.85rem', color: 'var(--neutral-400)', fontWeight: 500 }}>
                                Todas las cirugías próximas están confirmadas
                            </p>
                        </div>
                    ) : (
                        <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                            {urgent.map(s => {
                                const scfg = STATUS_LABELS[s.status] || { label: s.status, color: '#94A3B8' };
                                return (
                                    <div key={s.id} style={{
                                        padding: '12px 20px', borderBottom: '1px solid var(--neutral-50)',
                                        display: 'flex', alignItems: 'center', gap: '12px',
                                        cursor: 'pointer', transition: 'background 0.1s',
                                    }}
                                        onMouseOver={e => e.currentTarget.style.background = 'var(--neutral-50)'}
                                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                        onClick={() => onNavigate?.('cirugias')}
                                    >
                                        <div style={{
                                            width: '8px', height: '8px', borderRadius: '50%',
                                            background: scfg.color, flexShrink: 0,
                                        }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--neutral-800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {s.nombre}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--neutral-500)', display: 'flex', gap: '8px' }}>
                                                <span>{s.fecha_cirugia}</span>
                                                <span>·</span>
                                                <span>{s.medico || 'Sin médico'}</span>
                                            </div>
                                        </div>
                                        <span style={{
                                            padding: '2px 8px', borderRadius: '6px', fontSize: '0.68rem',
                                            fontWeight: 600, background: scfg.color + '20', color: scfg.color,
                                        }}>
                                            {scfg.label}
                                        </span>
                                        {!s.telefono && (
                                            <Phone size={12} style={{ color: '#EF4444' }} title="Sin teléfono" />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Actividad reciente */}
                <div style={{
                    background: 'var(--neutral-0)', borderRadius: '16px',
                    border: '1px solid var(--neutral-200)', overflow: 'hidden',
                    boxShadow: 'var(--shadow-sm)',
                }}>
                    <div style={{
                        padding: '16px 20px', borderBottom: '1px solid var(--neutral-100)',
                        display: 'flex', alignItems: 'center', gap: '8px',
                    }}>
                        <div style={{
                            width: '28px', height: '28px', borderRadius: '8px',
                            background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Activity size={14} style={{ color: '#6366F1' }} />
                        </div>
                        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--neutral-800)' }}>
                            Actividad reciente
                        </span>
                    </div>

                    {loading ? (
                        <div style={{ padding: '20px' }}>
                            <SkeletonCard height={200} />
                        </div>
                    ) : activity.length === 0 ? (
                        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                            <Clock size={32} style={{ color: 'var(--neutral-300)', marginBottom: '8px' }} />
                            <p style={{ fontSize: '0.85rem', color: 'var(--neutral-400)', fontWeight: 500 }}>
                                Sin actividad reciente
                            </p>
                        </div>
                    ) : (
                        <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                            {activity.map(evt => (
                                <div key={evt.id} style={{
                                    padding: '10px 20px', borderBottom: '1px solid var(--neutral-50)',
                                    display: 'flex', alignItems: 'flex-start', gap: '10px',
                                }}>
                                    <div style={{
                                        width: '6px', height: '6px', borderRadius: '50%',
                                        background: 'var(--primary-400)', flexShrink: 0, marginTop: '6px',
                                    }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--neutral-700)', lineHeight: 1.4 }}>
                                            <strong style={{ color: 'var(--neutral-800)' }}>{evt.user_name || 'Sistema'}</strong>
                                            {' '}{evt.event_type?.replace(/_/g, ' ') || 'evento'}
                                        </div>
                                        <div style={{ fontSize: '0.68rem', color: 'var(--neutral-400)', marginTop: '2px' }}>
                                            {formatTimeAgo(evt.created_at)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ═══════ QUICK ACCESS ═══════ */}
            <div>
                <h3 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--neutral-800)', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Zap size={15} style={{ color: 'var(--primary-500)' }} /> Acceso rápido
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
                    {QUICK_LINKS.map(link => (
                        <button
                            key={link.id}
                            onClick={() => onNavigate?.(link.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                padding: '14px 16px', borderRadius: '12px',
                                border: '1px solid var(--neutral-200)',
                                background: 'var(--neutral-0)', cursor: 'pointer',
                                transition: 'all 0.15s', textAlign: 'left',
                            }}
                            onMouseOver={e => { e.currentTarget.style.borderColor = link.color + '60'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
                            onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--neutral-200)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                        >
                            <div style={{
                                width: '32px', height: '32px', borderRadius: '8px',
                                background: link.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                <link.icon size={16} style={{ color: link.color }} />
                            </div>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--neutral-700)' }}>
                                {link.label}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* ═══════ KEYBOARD SHORTCUT ═══════ */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                background: 'var(--neutral-50)', borderRadius: '12px',
                padding: '12px 20px', border: '1px solid var(--neutral-100)',
            }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--neutral-500)', fontWeight: 500 }}>
                    💡 Presioná <kbd style={{ background: 'var(--neutral-0)', padding: '1px 6px', borderRadius: '4px', border: '1px solid var(--neutral-200)', fontWeight: 700, fontSize: '0.72rem' }}>Ctrl</kbd> + <kbd style={{ background: 'var(--neutral-0)', padding: '1px 6px', borderRadius: '4px', border: '1px solid var(--neutral-200)', fontWeight: 700, fontSize: '0.72rem' }}>K</kbd> para abrir la paleta de comandos desde cualquier módulo
                </span>
            </div>
        </div>
    );
}
