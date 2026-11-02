import { useState, useEffect, useMemo } from 'react';
import {
    Stethoscope, MessageCircle, DollarSign, AlertTriangle,
    Clock, TrendingUp, ArrowRight, RefreshCw,
    Phone, Users, Activity, ChevronRight,
    Zap, Shield, ClipboardCheck, Brain, Sparkles, CheckCircle2,
    FileCheck, History, Compass,
} from 'lucide-react';
import {
    fetchDashboardKPIs,
    fetchRecentActivity,
    fetchUrgentSurgeries,
    fetchUserPersonalCopilot,
} from '../services/dashboardService';
import { SkeletonKPI, SkeletonCard } from './SkeletonLoader';

const FRASES_MOTIVADORAS = [
    {
        frase: '¡Tú puedes con todo hoy! Cada gestión que resolvés acerca tranquilidad a un paciente y a su familia.',
        tag: 'Energía para tu jornada',
    },
    {
        frase: 'Un paso a la vez: lo que hoy parece un gran desafío, al final del día será otro logro cumplido.',
        tag: 'Enfoque y calma',
    },
    {
        frase: 'Tu compromiso, orden y calidez hacen que todo el Sanatorio funcione mejor. ¡Que tengas un gran día!',
        tag: 'Orgullo de equipo',
    },
    {
        frase: 'Confía en tu capacidad: tenés la experiencia y las herramientas para sacar adelante cualquier situación hoy.',
        tag: 'Confianza total',
    },
    {
        frase: 'Cada detalle cuenta. Cuando dejás un paciente al día, estás cerrando un círculo de calidad y cuidado.',
        tag: 'Excelencia diaria',
    },
    {
        frase: '¡Hoy va a ser un excelente día! Respirá hondo, organizá tus prioridades y avanzá a tu ritmo.',
        tag: 'Actitud positiva',
    },
    {
        frase: 'No importa cuán intensa venga la guardia o la mañana: vos tenés el talento para resolverlo todo con claridad.',
        tag: 'Fuerza y claridad',
    },
];

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

export default function HomePanel({ onNavigate, currentUser }) {
    const [kpis, setKpis] = useState(null);
    const [activity, setActivity] = useState([]);
    const [urgent, setUrgent] = useState([]);
    const [copilot, setCopilot] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Frase motivadora rotativa (inicia según el día del año, pero el usuario puede cambiarla con 1 clic)
    const [quoteIdx, setQuoteIdx] = useState(() => {
        const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
        return dayOfYear % FRASES_MOTIVADORAS.length;
    });

    const hora = new Date().getHours();
    const saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches';
    const primerNombre = useMemo(() => {
        const full = (currentUser?.nombre || currentUser?.usuario || '').trim();
        if (!full) return '';
        if (full.includes('@')) return full.split('@')[0];
        return full.split(/\s+/)[0];
    }, [currentUser]);

    const loadData = async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        try {
            const [k, a, u, cp] = await Promise.all([
                fetchDashboardKPIs(),
                fetchRecentActivity(),
                fetchUrgentSurgeries(),
                fetchUserPersonalCopilot(currentUser),
            ]);
            setKpis(k);
            setActivity(a);
            setUrgent(u);
            setCopilot(cp);
        } catch (e) {
            console.error('[HomePanel] Error loading dashboard:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser?.usuario]);

    const currentQuote = FRASES_MOTIVADORAS[quoteIdx % FRASES_MOTIVADORAS.length];

    const QUICK_LINKS = [
        { id: 'cirugias', label: 'Cirugías', icon: Stethoscope, color: '#10B981', bg: '#ECFDF5' },
        { id: 'mensajeria', label: 'Chat', icon: MessageCircle, color: '#3B82F6', bg: '#EFF6FF' },
        { id: 'deudas', label: 'Deudas', icon: DollarSign, color: '#F59E0B', bg: '#FFFBEB' },
        { id: 'altas', label: 'Altas', icon: ClipboardCheck, color: '#8B5CF6', bg: '#F5F3FF' },
        { id: 'beto', label: 'Simon IA', icon: Brain, color: '#6366F1', bg: '#EEF2FF' },
        { id: 'turnos', label: 'Turnos', icon: Users, color: '#EC4899', bg: '#FDF2F8' },
    ];

    return (
        <div className="content no-print view-transition-enter" style={{ maxWidth: '1120px', margin: '0 auto' }}>

            {/* ═══════ GREETING BAR + FRASE MOTIVADORA ═══════ */}
            <div style={{
                background: 'linear-gradient(135deg, #1E3A8A 0%, #1E4078 55%, #2563EB 100%)',
                borderRadius: '18px',
                padding: '22px 26px',
                color: '#FFFFFF',
                marginBottom: '18px',
                boxShadow: '0 10px 28px rgba(30, 64, 120, 0.18)',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
            }}>
                <div style={{ flex: '1 1 480px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <h1 style={{ fontSize: '1.55rem', fontWeight: 800, color: '#FFFFFF', margin: 0, letterSpacing: '-0.02em' }}>
                            {saludo}{primerNombre ? `, ${primerNombre}` : ''} 👋
                        </h1>
                        <span style={{
                            fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px',
                            borderRadius: '999px', background: 'rgba(255, 255, 255, 0.16)',
                            color: '#DBEAFE', letterSpacing: '0.02em',
                        }}>
                            {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </span>
                    </div>

                    {/* Frase motivadora del día */}
                    <div style={{
                        marginTop: '12px',
                        padding: '11px 14px',
                        borderRadius: '12px',
                        background: 'rgba(255, 255, 255, 0.11)',
                        border: '1px solid rgba(255, 255, 255, 0.18)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                            <Sparkles size={18} color="#FDE047" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <div>
                                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#FFFFFF', lineHeight: 1.4 }}>
                                    “{currentQuote.frase}”
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#BFDBFE', marginTop: '2px', fontWeight: 600 }}>
                                    ✨ {currentQuote.tag}
                                </div>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setQuoteIdx(i => i + 1)}
                            title="Ver otra frase motivadora"
                            style={{
                                background: 'rgba(255,255,255,0.14)',
                                border: '1px solid rgba(255,255,255,0.22)',
                                color: '#FFFFFF',
                                borderRadius: '8px',
                                padding: '6px 10px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                flexShrink: 0,
                                whiteSpace: 'nowrap',
                            }}
                        >
                            ✨ Otra frase
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                    <button
                        onClick={() => loadData(true)}
                        disabled={refreshing}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '9px 16px', borderRadius: '10px',
                            border: '1px solid rgba(255,255,255,0.28)',
                            background: 'rgba(255,255,255,0.14)',
                            fontSize: '0.78rem', fontWeight: 700, color: '#FFFFFF',
                            cursor: 'pointer', transition: 'all 0.15s',
                        }}
                    >
                        <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                        {refreshing ? 'Actualizando...' : 'Actualizar mi panel'}
                    </button>
                    {copilot?.minutosActivoHoy > 0 && (
                        <span style={{ fontSize: '0.73rem', color: '#DBEAFE', fontWeight: 600 }}>
                            ⏱️ Tiempo activo hoy: <strong>{copilot.minutosActivoHoy} min</strong>
                        </span>
                    )}
                </div>
            </div>

            {/* ═══════ COPILOTO PERSONAL DEL USUARIO: CONTINUIDAD Y PACIENTES VISTOS ═══════ */}
            {copilot && (copilot.consultaInsight || (copilot.misPacientes && copilot.misPacientes.length > 0)) && (
                <div style={{
                    background: 'var(--neutral-0)',
                    borderRadius: '16px',
                    border: '1.5px solid #BFDBFE',
                    padding: '18px 20px',
                    marginBottom: '18px',
                    boxShadow: '0 4px 16px rgba(37, 99, 235, 0.06)',
                }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        flexWrap: 'wrap', gap: '10px', marginBottom: '14px',
                        paddingBottom: '12px', borderBottom: '1px solid var(--neutral-100)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                                width: '34px', height: '34px', borderRadius: '10px',
                                background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Compass size={18} color="#2563EB" />
                            </div>
                            <div>
                                <div style={{ fontSize: '0.94rem', fontWeight: 800, color: 'var(--neutral-800)' }}>
                                    Tu Resumen Personal de Actividad y Continuidad
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--neutral-500)', fontWeight: 500 }}>
                                    Seguimiento inteligente de tus últimas consultas, extracciones y si dejaste al día los pacientes que estuviste viendo
                                </div>
                            </div>
                        </div>

                        {copilot.misPacientes?.length > 0 && (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <span style={{
                                    padding: '4px 10px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700,
                                    background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0',
                                }}>
                                    ✓ {copilot.alDiaCount} al día
                                </span>
                                {copilot.pendientesCount > 0 && (
                                    <span style={{
                                        padding: '4px 10px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700,
                                        background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A',
                                    }}>
                                        ⏳ {copilot.pendientesCount} con seguimiento pendiente
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: copilot.consultaInsight && copilot.misPacientes?.length > 0 ? '1fr 1.35fr' : '1fr',
                        gap: '16px',
                    }}>
                        {/* Columna izquierda: Último apartado consultado y extracción de información */}
                        {copilot.consultaInsight && (
                            <div style={{
                                background: copilot.consultaInsight.status === 'extracted' ? '#F0FDF4' : '#F8FAFC',
                                border: `1px solid ${copilot.consultaInsight.status === 'extracted' ? '#BBF7D0' : '#E2E8F0'}`,
                                borderRadius: '12px',
                                padding: '14px 16px',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                gap: '12px',
                            }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                                        <span style={{
                                            fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase',
                                            color: copilot.consultaInsight.status === 'extracted' ? '#15803D' : '#1E4078',
                                            display: 'flex', alignItems: 'center', gap: '5px',
                                        }}>
                                            {copilot.consultaInsight.status === 'extracted' ? (
                                                <><FileCheck size={14} /> Información extraída con éxito</>
                                            ) : (
                                                <><History size={14} /> Último apartado que estuviste consultando</>
                                            )}
                                        </span>
                                        <span style={{ fontSize: '0.68rem', color: 'var(--neutral-400)', fontWeight: 600 }}>
                                            {formatTimeAgo(copilot.consultaInsight.timestamp)}
                                        </span>
                                    </div>

                                    <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--neutral-800)', marginBottom: '4px' }}>
                                        {copilot.consultaInsight.title}
                                    </div>
                                    <p style={{ fontSize: '0.78rem', color: 'var(--neutral-600)', margin: 0, lineHeight: 1.45 }}>
                                        {copilot.consultaInsight.description}
                                    </p>

                                    {copilot.modulosFrecuentes?.length > 1 && (
                                        <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                            {copilot.modulosFrecuentes.map(mf => (
                                                <button
                                                    key={mf.module_id}
                                                    type="button"
                                                    onClick={() => onNavigate?.(mf.module_id)}
                                                    style={{
                                                        fontSize: '0.69rem', fontWeight: 600, padding: '3px 8px',
                                                        borderRadius: '6px', border: '1px solid #CBD5E1',
                                                        background: '#FFFFFF', color: '#334155', cursor: 'pointer',
                                                    }}
                                                >
                                                    {mf.module_label} ({mf.visitas})
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {copilot.consultaInsight.module_id && (
                                    <button
                                        type="button"
                                        onClick={() => onNavigate?.(copilot.consultaInsight.module_id)}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                            padding: '9px 14px', borderRadius: '9px', border: 'none',
                                            background: '#1E4078', color: '#FFFFFF',
                                            fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                                            alignSelf: 'flex-start',
                                        }}
                                    >
                                        Retomar {copilot.consultaInsight.module_label} <ArrowRight size={14} />
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Columna derecha: Últimos pacientes gestionados por el usuario ("¿Dejaste todo al día?") */}
                        {copilot.misPacientes?.length > 0 && (
                            <div style={{
                                background: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                borderRadius: '12px',
                                padding: '12px 14px',
                            }}>
                                <div style={{
                                    fontSize: '0.74rem', fontWeight: 800, color: '#334155',
                                    textTransform: 'uppercase', marginBottom: '8px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                }}>
                                    <span>🩺 Últimos pacientes que estuviste viendo — ¿Quedaron al día?</span>
                                    <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600, textTransform: 'none' }}>
                                        Clic para abrir ficha
                                    </span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '215px', overflowY: 'auto' }}>
                                    {copilot.misPacientes.map(p => (
                                        <div
                                            key={p.id}
                                            onClick={() => onNavigate?.(p.modulo)}
                                            style={{
                                                background: '#FFFFFF',
                                                borderRadius: '10px',
                                                padding: '9px 12px',
                                                border: `1px solid ${p.alDia ? '#DCFCE7' : '#FDE68A'}`,
                                                display: 'flex',
                                                alignItems: 'flex-start',
                                                justifyContent: 'space-between',
                                                gap: '10px',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s',
                                            }}
                                            onMouseOver={e => { e.currentTarget.style.borderColor = '#93C5FD'; e.currentTarget.style.transform = 'translateX(2px)'; }}
                                            onMouseOut={e => { e.currentTarget.style.borderColor = p.alDia ? '#DCFCE7' : '#FDE68A'; e.currentTarget.style.transform = 'translateX(0)'; }}
                                        >
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0F172A' }}>
                                                        {p.paciente}
                                                    </span>
                                                    <span style={{
                                                        fontSize: '0.67rem', fontWeight: 700, padding: '1px 6px',
                                                        borderRadius: '4px', background: '#F1F5F9', color: '#475569',
                                                    }}>
                                                        {p.identificador} · {p.moduloLabel}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '0.73rem', color: '#475569', marginTop: '3px', lineHeight: 1.35 }}>
                                                    {p.estadoTexto}
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                                                <span style={{
                                                    fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px',
                                                    borderRadius: '999px',
                                                    background: p.alDia ? '#DCFCE7' : '#FEF3C7',
                                                    color: p.alDia ? '#15803D' : '#B45309',
                                                }}>
                                                    {p.badgeLabel}
                                                </span>
                                                <span style={{ fontSize: '0.65rem', color: '#94A3B8' }}>
                                                    {formatTimeAgo(p.fechaAccion)}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ═══════ KPI GRID ═══════ */}
            {loading ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
                    {Array.from({ length: 3 }).map((_, i) => <SkeletonKPI key={i} />)}
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

                {/* Actividad reciente traducida */}
                <div style={{
                    background: 'var(--neutral-0)', borderRadius: '16px',
                    border: '1px solid var(--neutral-200)', overflow: 'hidden',
                    boxShadow: 'var(--shadow-sm)',
                }}>
                    <div style={{
                        padding: '16px 20px', borderBottom: '1px solid var(--neutral-100)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                                width: '28px', height: '28px', borderRadius: '8px',
                                background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Activity size={14} style={{ color: '#6366F1' }} />
                            </div>
                            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--neutral-800)' }}>
                                Actividad reciente del equipo
                            </span>
                        </div>
                        <CheckCircle2 size={15} color="#10B981" />
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
                                <div
                                    key={evt.id}
                                    onClick={() => evt.module_id && onNavigate?.(evt.module_id)}
                                    style={{
                                        padding: '10px 20px', borderBottom: '1px solid var(--neutral-50)',
                                        display: 'flex', alignItems: 'flex-start', gap: '10px',
                                        cursor: evt.module_id ? 'pointer' : 'default',
                                    }}
                                >
                                    <div style={{
                                        width: '6px', height: '6px', borderRadius: '50%',
                                        background: 'var(--primary-400)', flexShrink: 0, marginTop: '6px',
                                    }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--neutral-700)', lineHeight: 1.4 }}>
                                            <strong style={{ color: 'var(--neutral-800)' }}>{evt.user_name || 'Sistema'}</strong>
                                            {' — '}{evt.description || 'Actualización'}
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
