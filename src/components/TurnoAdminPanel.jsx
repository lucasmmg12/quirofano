/**
 * TurnoAdminPanel.jsx — Panel del administrativo para gestionar cola de turnos
 * Se integra como vista dentro del sistema ADM-QUI (Sidebar)
 * Funciones: Ver cola, Llamar, Iniciar atención, Finalizar, Derivar, Métricas rápidas
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Users, PhoneCall, Play, Square, ArrowRightLeft,
    Clock, CheckCircle, XCircle, BarChart3, RefreshCw,
    User, FileText, Receipt, Microscope, HelpCircle,
    ChevronDown, Timer, TrendingUp, Hash,
} from 'lucide-react';
import {
    fetchColaActiva, fetchAtendidosHoy, fetchMetricasHoy,
    llamarTurno, iniciarAtencion, finalizarAtencion,
    cancelarTurno, derivarTurno, subscribeToCola, fetchTurnoConfig,
} from '../services/turnoService';

const ICON_MAP = { FileText, Receipt, Microscope, HelpCircle };

const ESTADO_BADGES = {
    esperando: { label: 'Esperando', color: '#F59E0B', bg: '#FEF3C7', icon: Clock },
    llamando: { label: 'Llamando', color: '#3B82F6', bg: '#DBEAFE', icon: PhoneCall },
    en_atencion: { label: 'En atención', color: '#8B5CF6', bg: '#EDE9FE', icon: Play },
    atendido: { label: 'Atendido', color: '#16A34A', bg: '#DCFCE7', icon: CheckCircle },
    cancelado: { label: 'Cancelado', color: '#EF4444', bg: '#FEE2E2', icon: XCircle },
};

export default function TurnoAdminPanel({ addToast, currentUser }) {
    const [config, setConfig] = useState([]);
    const [cola, setCola] = useState([]);
    const [atendidos, setAtendidos] = useState([]);
    const [metricas, setMetricas] = useState(null);
    const [loading, setLoading] = useState(true);
    const [boxFilter, setBoxFilter] = useState(null); // null = todos
    const [tipoFilter, setTipoFilter] = useState(null);
    const [showMetricas, setShowMetricas] = useState(false);
    const [showAtendidos, setShowAtendidos] = useState(false);
    const [activeTimers, setActiveTimers] = useState({}); // turnoId → elapsed seconds
    const timerInterval = useRef(null);
    const [derivarModal, setDerivarModal] = useState(null); // turnoId

    const empleadoNombre = currentUser?.nombre || 'Administrador';
    const empleadoBox = boxFilter || 1;

    // ─── Cargar datos ───
    const loadData = useCallback(async () => {
        try {
            const [cfgData, colaData, atendidosData, metricasData] = await Promise.all([
                fetchTurnoConfig(),
                fetchColaActiva(),
                fetchAtendidosHoy(),
                fetchMetricasHoy(),
            ]);
            setConfig(cfgData);
            setCola(colaData);
            setAtendidos(atendidosData);
            setMetricas(metricasData);
        } catch (err) {
            console.error('Error loading turno data:', err);
            addToast?.('Error al cargar datos de turnos', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // ─── Realtime subscription ───
    useEffect(() => {
        const unsub = subscribeToCola(() => {
            // Refrescar datos cuando cambia la cola
            loadData();
        });
        return () => unsub();
    }, [loadData]);

    // ─── Timer para turnos en atención ───
    useEffect(() => {
        timerInterval.current = setInterval(() => {
            setActiveTimers(() => {
                const timers = {};
                cola.forEach(t => {
                    if (t.estado === 'en_atencion' && t.llamado_at) {
                        const elapsed = Math.floor((Date.now() - new Date(t.llamado_at).getTime()) / 1000);
                        timers[t.id] = elapsed;
                    }
                });
                return timers;
            });
        }, 1000);
        return () => clearInterval(timerInterval.current);
    }, [cola]);

    // ─── Filtrado ───
    const colaFiltrada = useMemo(() => {
        let result = cola;
        if (boxFilter) result = result.filter(t => t.box_asignado === boxFilter);
        if (tipoFilter) result = result.filter(t => t.tipo_tramite === tipoFilter);
        return result;
    }, [cola, boxFilter, tipoFilter]);

    // Agrupar por estado para vista de secciones
    const esperando = colaFiltrada.filter(t => t.estado === 'esperando');
    const llamando = colaFiltrada.filter(t => t.estado === 'llamando');
    const enAtencion = colaFiltrada.filter(t => t.estado === 'en_atencion');

    // ─── Acciones ───
    const handleLlamar = useCallback(async (turno) => {
        try {
            await llamarTurno(turno.id, empleadoNombre);
            addToast?.(`Llamando turno ${turno.numero_turno}`, 'info');
            loadData();
        } catch (err) {
            addToast?.('Error al llamar turno', 'error');
        }
    }, [empleadoNombre, addToast, loadData]);

    const handleIniciar = useCallback(async (turno) => {
        try {
            await iniciarAtencion(turno.id, empleadoNombre, turno.box_asignado);
            addToast?.(`Atendiendo turno ${turno.numero_turno}`, 'success');
            loadData();
        } catch (err) {
            addToast?.('Error al iniciar atención', 'error');
        }
    }, [empleadoNombre, addToast, loadData]);

    const handleFinalizar = useCallback(async (turno) => {
        try {
            await finalizarAtencion(turno.id);
            const elapsed = activeTimers[turno.id];
            const timeStr = elapsed ? formatSeconds(elapsed) : '';
            addToast?.(`Turno ${turno.numero_turno} finalizado ${timeStr ? `(${timeStr})` : ''}`, 'success');
            loadData();
        } catch (err) {
            addToast?.('Error al finalizar atención', 'error');
        }
    }, [activeTimers, addToast, loadData]);

    const handleCancelar = useCallback(async (turno) => {
        if (!window.confirm(`¿Cancelar el turno ${turno.numero_turno}?`)) return;
        try {
            await cancelarTurno(turno.id);
            addToast?.(`Turno ${turno.numero_turno} cancelado`, 'info');
            loadData();
        } catch (err) {
            addToast?.('Error al cancelar turno', 'error');
        }
    }, [addToast, loadData]);

    const handleDerivar = useCallback(async (turnoId, nuevoBox) => {
        try {
            await derivarTurno(turnoId, nuevoBox);
            setDerivarModal(null);
            addToast?.(`Turno derivado a Box ${nuevoBox}`, 'info');
            loadData();
        } catch (err) {
            addToast?.('Error al derivar turno', 'error');
        }
    }, [addToast, loadData]);

    // ─── Helpers ───
    function formatSeconds(s) {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${String(sec).padStart(2, '0')}`;
    }

    function formatTime(dateStr) {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    }

    function getTimeSince(dateStr) {
        if (!dateStr) return '—';
        const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
        if (mins < 1) return 'Ahora';
        if (mins === 1) return '1 min';
        return `${mins} min`;
    }

    const getCfgForType = (tipo) => config.find(c => c.tipo_tramite === tipo) || {};

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', color: '#94A3B8' }}>
                <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', marginRight: '8px' }} />
                Cargando cola de turnos...
            </div>
        );
    }

    return (
        <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
            {/* ═══ HEADER + MÉTRICAS RÁPIDAS ═══ */}
            <div style={s.header}>
                <div style={s.headerLeft}>
                    <div style={s.headerIcon}>
                        <Users size={22} />
                    </div>
                    <div>
                        <h2 style={s.headerTitle}>Cola de Turnos</h2>
                        <span style={s.headerSub}>Control de atención en tiempo real</span>
                    </div>
                </div>
                <div style={s.headerRight}>
                    {/* Quick stats */}
                    {metricas && (
                        <div style={s.quickStats}>
                            <div style={s.quickStat}>
                                <span style={s.quickStatLabel}>Esperando</span>
                                <span style={{ ...s.quickStatValue, color: '#F59E0B' }}>{metricas.esperando}</span>
                            </div>
                            <div style={s.quickStatDivider} />
                            <div style={s.quickStat}>
                                <span style={s.quickStatLabel}>Atendidos</span>
                                <span style={{ ...s.quickStatValue, color: '#16A34A' }}>{metricas.atendidos}</span>
                            </div>
                            <div style={s.quickStatDivider} />
                            <div style={s.quickStat}>
                                <span style={s.quickStatLabel}>T. Prom.</span>
                                <span style={{ ...s.quickStatValue, color: '#3B82F6' }}>{metricas.tiempoPromedio}m</span>
                            </div>
                            <div style={s.quickStatDivider} />
                            <div style={s.quickStat}>
                                <span style={s.quickStatLabel}>Espera Prom.</span>
                                <span style={{ ...s.quickStatValue, color: '#8B5CF6' }}>{metricas.esperaPromedio}m</span>
                            </div>
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                        <button onClick={() => setShowMetricas(p => !p)} style={s.actionBtnSmall}>
                            <BarChart3 size={14} /> {showMetricas ? 'Ocultar' : 'Métricas'}
                        </button>
                        <button onClick={() => setShowAtendidos(p => !p)} style={s.actionBtnSmall}>
                            <CheckCircle size={14} /> {showAtendidos ? 'Ocultar' : 'Atendidos'} ({atendidos.length})
                        </button>
                        <button onClick={loadData} style={s.actionBtnSmall}>
                            <RefreshCw size={14} /> Actualizar
                        </button>
                    </div>
                </div>
            </div>

            {/* ═══ FILTROS ═══ */}
            <div style={s.filters}>
                {/* Box filter */}
                <div style={s.filterGroup}>
                    <span style={s.filterLabel}>Box:</span>
                    <div style={s.filterBtns}>
                        <button onClick={() => setBoxFilter(null)}
                            style={{ ...s.filterBtn, ...(boxFilter === null ? s.filterBtnActive : {}) }}>
                            Todos
                        </button>
                        {[1, 2, 3, 4].map(b => (
                            <button key={b} onClick={() => setBoxFilter(b)}
                                style={{ ...s.filterBtn, ...(boxFilter === b ? s.filterBtnActive : {}) }}>
                                Box {b}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Type filter */}
                <div style={s.filterGroup}>
                    <span style={s.filterLabel}>Trámite:</span>
                    <div style={s.filterBtns}>
                        <button onClick={() => setTipoFilter(null)}
                            style={{ ...s.filterBtn, ...(tipoFilter === null ? s.filterBtnActive : {}) }}>
                            Todos
                        </button>
                        {config.map(cfg => (
                            <button key={cfg.tipo_tramite} onClick={() => setTipoFilter(cfg.tipo_tramite)}
                                style={{
                                    ...s.filterBtn,
                                    ...(tipoFilter === cfg.tipo_tramite ? { ...s.filterBtnActive, background: cfg.color + '18', borderColor: cfg.color + '40', color: cfg.color } : {}),
                                }}>
                                {cfg.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ═══ MÉTRICAS EXPANDIDAS ═══ */}
            {showMetricas && metricas && (
                <div style={s.metricasPanel}>
                    <h3 style={s.metricasTitle}><TrendingUp size={16} /> Métricas del Día</h3>
                    <div style={s.metricasGrid}>
                        {/* Por tipo */}
                        <div style={s.metricaCard}>
                            <h4 style={s.metricaCardTitle}>Por Tipo de Trámite</h4>
                            {Object.entries(metricas.porTipo).map(([tipo, data]) => {
                                const cfg = getCfgForType(tipo);
                                return (
                                    <div key={tipo} style={s.metricaRow}>
                                        <span style={{ ...s.metricaDot, background: cfg.color }} />
                                        <span style={s.metricaLabel}>{cfg.label || tipo}</span>
                                        <span style={s.metricaValue}>{data.atendidos}/{data.total}</span>
                                    </div>
                                );
                            })}
                        </div>
                        {/* Por empleado */}
                        <div style={s.metricaCard}>
                            <h4 style={s.metricaCardTitle}>Por Empleado</h4>
                            {Object.entries(metricas.porEmpleado).length === 0 ? (
                                <span style={s.metricaEmpty}>Sin atenciones registradas</span>
                            ) : (
                                Object.entries(metricas.porEmpleado).map(([nombre, data]) => (
                                    <div key={nombre} style={s.metricaRow}>
                                        <span style={{ ...s.metricaDot, background: '#6366F1' }} />
                                        <span style={s.metricaLabel}>{nombre}</span>
                                        <span style={s.metricaValue}>
                                            {data.cantidad} · {Math.round(data.tiempoTotal / data.cantidad)}m prom
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ COLA PRINCIPAL ═══ */}
            <div style={s.queueContainer}>
                {/* En atención (destacado arriba) */}
                {(llamando.length > 0 || enAtencion.length > 0) && (
                    <div style={s.section}>
                        <div style={s.sectionHeader}>
                            <Play size={15} style={{ color: '#8B5CF6' }} />
                            <span style={{ ...s.sectionTitle, color: '#8B5CF6' }}>En Atención / Llamando</span>
                            <span style={s.sectionCount}>{llamando.length + enAtencion.length}</span>
                        </div>
                        <div style={s.cardGrid}>
                            {[...llamando, ...enAtencion].map(turno => (
                                <TurnoCard
                                    key={turno.id}
                                    turno={turno}
                                    config={getCfgForType(turno.tipo_tramite)}
                                    elapsed={activeTimers[turno.id]}
                                    onLlamar={handleLlamar}
                                    onIniciar={handleIniciar}
                                    onFinalizar={handleFinalizar}
                                    onCancelar={handleCancelar}
                                    onDerivar={() => setDerivarModal(turno.id)}
                                    formatTime={formatTime}
                                    getTimeSince={getTimeSince}
                                    formatSeconds={formatSeconds}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Esperando */}
                <div style={s.section}>
                    <div style={s.sectionHeader}>
                        <Clock size={15} style={{ color: '#F59E0B' }} />
                        <span style={{ ...s.sectionTitle, color: '#F59E0B' }}>En Espera</span>
                        <span style={s.sectionCount}>{esperando.length}</span>
                    </div>
                    {esperando.length === 0 ? (
                        <div style={s.emptyState}>
                            <Users size={40} strokeWidth={1.2} style={{ color: '#CBD5E1', marginBottom: '8px' }} />
                            <p style={{ margin: 0, color: '#94A3B8', fontSize: '0.9rem' }}>No hay pacientes en espera</p>
                        </div>
                    ) : (
                        <div style={s.cardGrid}>
                            {esperando.map(turno => (
                                <TurnoCard
                                    key={turno.id}
                                    turno={turno}
                                    config={getCfgForType(turno.tipo_tramite)}
                                    elapsed={null}
                                    onLlamar={handleLlamar}
                                    onIniciar={handleIniciar}
                                    onFinalizar={handleFinalizar}
                                    onCancelar={handleCancelar}
                                    onDerivar={() => setDerivarModal(turno.id)}
                                    formatTime={formatTime}
                                    getTimeSince={getTimeSince}
                                    formatSeconds={formatSeconds}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ═══ ATENDIDOS HOY ═══ */}
            {showAtendidos && (
                <div style={s.atendidosPanel}>
                    <h3 style={s.metricasTitle}><CheckCircle size={16} style={{ color: '#16A34A' }} /> Atendidos Hoy</h3>
                    {atendidos.length === 0 ? (
                        <p style={{ color: '#94A3B8', textAlign: 'center' }}>Sin atenciones registradas hoy</p>
                    ) : (
                        <div style={s.atendidosTable}>
                            <div style={s.atTableHead}>
                                <span style={{ flex: '0 0 70px' }}>Turno</span>
                                <span style={{ flex: 1 }}>Paciente</span>
                                <span style={{ flex: '0 0 110px' }}>Trámite</span>
                                <span style={{ flex: '0 0 110px' }}>Atendido por</span>
                                <span style={{ flex: '0 0 75px' }}>Espera</span>
                                <span style={{ flex: '0 0 75px' }}>Atención</span>
                                <span style={{ flex: '0 0 60px' }}>Hora</span>
                            </div>
                            {atendidos.slice(0, 30).map(t => {
                                const cfg = getCfgForType(t.tipo_tramite);
                                const esperaMins = t.llamado_at && t.created_at
                                    ? Math.floor((new Date(t.llamado_at) - new Date(t.created_at)) / 60000)
                                    : null;
                                const atencionMins = t.finalizado_at && t.llamado_at
                                    ? Math.floor((new Date(t.finalizado_at) - new Date(t.llamado_at)) / 60000)
                                    : null;
                                const esperaColor = esperaMins > 10 ? '#EF4444' : esperaMins > 5 ? '#F59E0B' : '#16A34A';
                                const atencionColor = atencionMins > 15 ? '#EF4444' : atencionMins > 8 ? '#F59E0B' : '#3B82F6';
                                return (
                                    <div key={t.id} style={s.atTableRow}>
                                        <span style={{ flex: '0 0 70px', fontWeight: 700, color: cfg.color }}>{t.numero_turno}</span>
                                        <span style={{ flex: 1, color: '#0D3B66', fontWeight: t.nombre_paciente ? 600 : 400 }}>{t.nombre_paciente || '—'}</span>
                                        <span style={{ flex: '0 0 110px', color: '#475569' }}>{cfg.label}</span>
                                        <span style={{ flex: '0 0 110px', color: '#6366F1', fontWeight: 600, fontSize: '0.78rem' }}>{t.atendido_por || '—'}</span>
                                        <span style={{ flex: '0 0 75px', fontWeight: 700, color: esperaColor, fontSize: '0.8rem' }}>
                                            {esperaMins != null ? `${esperaMins}m` : '—'}
                                        </span>
                                        <span style={{ flex: '0 0 75px', fontWeight: 700, color: atencionColor, fontSize: '0.8rem' }}>
                                            {atencionMins != null ? `${atencionMins}m` : '—'}
                                        </span>
                                        <span style={{ flex: '0 0 60px', color: '#94A3B8', fontSize: '0.75rem' }}>{formatTime(t.finalizado_at)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ═══ MODAL: DERIVAR A OTRO BOX ═══ */}
            {derivarModal && (
                <div style={s.modalOverlay} onClick={() => setDerivarModal(null)}>
                    <div style={s.modal} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 16px', color: '#0D3B66', fontSize: '1.1rem', fontWeight: 700 }}>
                            Derivar a otro Box
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                            {[1, 2, 3, 4].map(b => (
                                <button
                                    key={b}
                                    onClick={() => handleDerivar(derivarModal, b)}
                                    style={{
                                        padding: '20px', borderRadius: '14px',
                                        border: '2px solid #E2E8F0', background: '#FAFBFC',
                                        fontSize: '1.1rem', fontWeight: 700, color: '#0D3B66',
                                        cursor: 'pointer', transition: 'all 0.2s',
                                    }}
                                >
                                    Box {b}
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setDerivarModal(null)} style={{
                            width: '100%', marginTop: '12px', padding: '12px', borderRadius: '10px',
                            border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#64748B',
                            cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
                        }}>
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes pulseBorder {
                    0%, 100% { border-color: rgba(59,130,246,0.3); box-shadow: 0 0 0 0 rgba(59,130,246,0.1); }
                    50% { border-color: rgba(59,130,246,0.6); box-shadow: 0 0 0 4px rgba(59,130,246,0.08); }
                }
                @keyframes pulseTimer {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.6; }
                }
            `}</style>
        </div>
    );
}

// ─── Componente Individual: TurnoCard ───
function TurnoCard({ turno, config, elapsed, onLlamar, onIniciar, onFinalizar, onCancelar, onDerivar, formatTime, getTimeSince, formatSeconds }) {
    const estadoCfg = ESTADO_BADGES[turno.estado] || ESTADO_BADGES.esperando;
    const isActive = turno.estado === 'llamando' || turno.estado === 'en_atencion';

    // Calcular tiempo de espera individual
    const getWaitTime = () => {
        if (!turno.created_at) return null;
        const end = turno.llamado_at ? new Date(turno.llamado_at) : new Date();
        const mins = Math.floor((end - new Date(turno.created_at)) / 60000);
        return mins;
    };
    const waitMins = getWaitTime();
    const waitColor = waitMins > 10 ? '#EF4444' : waitMins > 5 ? '#F59E0B' : '#16A34A';

    return (
        <div style={{
            background: 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(12px)',
            borderRadius: '16px',
            border: isActive ? `2px solid ${estadoCfg.color}40` : '1px solid rgba(226,232,240,0.6)',
            padding: '16px',
            boxShadow: isActive ? `0 4px 20px ${estadoCfg.color}15` : '0 2px 10px rgba(0,0,0,0.04)',
            transition: 'all 0.25s',
            animation: 'fadeIn 0.3s ease-out',
            ...(turno.estado === 'llamando' ? { animation: 'fadeIn 0.3s ease-out, pulseBorder 2s ease-in-out infinite' } : {}),
        }}>
            {/* Top: Number + Badge */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                        fontSize: '1.6rem', fontWeight: 900, color: config.color || '#0D3B66',
                        letterSpacing: '1px',
                    }}>
                        {turno.numero_turno}
                    </span>
                    <span style={{
                        padding: '3px 10px', borderRadius: '20px',
                        fontSize: '0.67rem', fontWeight: 700,
                        background: estadoCfg.bg, color: estadoCfg.color,
                        border: `1px solid ${estadoCfg.color}30`,
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>
                        {estadoCfg.label}
                    </span>
                </div>

                {/* Timer */}
                {isActive && elapsed != null && (
                    <span style={{
                        fontSize: '1.2rem', fontWeight: 800,
                        color: elapsed > 600 ? '#EF4444' : elapsed > 300 ? '#F59E0B' : '#3B82F6',
                        fontFamily: 'monospace',
                        animation: 'pulseTimer 2s ease-in-out infinite',
                        display: 'flex', alignItems: 'center', gap: '4px',
                    }}>
                        <Timer size={16} />
                        {formatSeconds(elapsed)}
                    </span>
                )}
            </div>

            {/* Info grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '12px' }}>
                {turno.nombre_paciente && (
                    <div style={{ ...s.infoCell, gridColumn: '1 / -1', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.1)' }}>
                        <span style={s.infoCellLabel}>Paciente</span>
                        <span style={{ ...s.infoCellValue, fontSize: '0.88rem' }}>
                            <User size={13} style={{ marginRight: '4px', verticalAlign: 'middle', color: '#3B82F6' }} />
                            {turno.nombre_paciente}
                        </span>
                    </div>
                )}
                <div style={s.infoCell}>
                    <span style={s.infoCellLabel}>Trámite</span>
                    <span style={{ ...s.infoCellValue, color: config.color }}>{config.label || turno.tipo_tramite}</span>
                </div>
                <div style={s.infoCell}>
                    <span style={s.infoCellLabel}>Box</span>
                    <span style={s.infoCellValue}>Box {turno.box_asignado}</span>
                </div>
                {turno.dni && (
                    <div style={s.infoCell}>
                        <span style={s.infoCellLabel}>DNI</span>
                        <span style={s.infoCellValue}>{turno.dni}</span>
                    </div>
                )}
                <div style={s.infoCell}>
                    <span style={s.infoCellLabel}>Llegó</span>
                    <span style={s.infoCellValue}>{formatTime(turno.created_at)}</span>
                </div>
                <div style={{
                    ...s.infoCell,
                    background: waitColor + '08',
                    border: `1px solid ${waitColor}20`,
                }}>
                    <span style={s.infoCellLabel}>
                        {turno.estado === 'esperando' ? '⏱ Esperando' : '⏱ Esperó'}
                    </span>
                    <span style={{ ...s.infoCellValue, color: waitColor, fontWeight: 800 }}>
                        {waitMins != null ? `${waitMins} min` : '—'}
                    </span>
                </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {turno.estado === 'esperando' && (
                    <>
                        <button onClick={() => onLlamar(turno)} style={{ ...s.turnoActionBtn, background: '#3B82F6', color: '#fff' }}>
                            <PhoneCall size={14} /> Llamar
                        </button>
                        <button onClick={onDerivar} style={{ ...s.turnoActionBtn, background: '#F0F4F8', color: '#475569', border: '1px solid #E2E8F0' }}>
                            <ArrowRightLeft size={14} /> Derivar
                        </button>
                        <button onClick={() => onCancelar(turno)} style={{ ...s.turnoActionBtn, background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
                            <XCircle size={14} />
                        </button>
                    </>
                )}
                {turno.estado === 'llamando' && (
                    <>
                        <button onClick={() => onIniciar(turno)} style={{ ...s.turnoActionBtn, background: '#8B5CF6', color: '#fff' }}>
                            <Play size={14} /> Iniciar Atención
                        </button>
                        <button onClick={() => onLlamar(turno)} style={{ ...s.turnoActionBtn, background: '#DBEAFE', color: '#3B82F6', border: '1px solid #93C5FD' }}>
                            <PhoneCall size={14} /> Re-llamar
                        </button>
                        <button onClick={() => onCancelar(turno)} style={{ ...s.turnoActionBtn, background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
                            <XCircle size={14} />
                        </button>
                    </>
                )}
                {turno.estado === 'en_atencion' && (
                    <button onClick={() => onFinalizar(turno)} style={{
                        ...s.turnoActionBtn,
                        background: 'linear-gradient(135deg, #16A34A, #15803D)',
                        color: '#fff', flex: 1, justifyContent: 'center',
                        padding: '10px', fontSize: '0.88rem',
                    }}>
                        <Square size={14} /> Finalizar Atención
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── Estilos ───
const s = {
    header: {
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '16px',
        marginBottom: '20px',
        padding: '20px 24px',
        background: 'rgba(255,255,255,0.8)',
        backdropFilter: 'blur(12px)',
        borderRadius: '18px',
        border: '1px solid rgba(226,232,240,0.5)',
        boxShadow: '0 2px 16px rgba(0,0,0,0.04)',
    },
    headerLeft: { display: 'flex', alignItems: 'center', gap: '14px' },
    headerIcon: {
        width: '44px', height: '44px', borderRadius: '14px',
        background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff',
    },
    headerTitle: { margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#0D3B66', letterSpacing: '-0.5px' },
    headerSub: { fontSize: '0.78rem', color: '#64748B', fontWeight: 500 },
    headerRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' },
    quickStats: {
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '8px 16px', borderRadius: '12px',
        background: 'rgba(241, 245, 249, 0.6)',
        border: '1px solid rgba(226,232,240,0.5)',
    },
    quickStat: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
    quickStatLabel: { fontSize: '0.62rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' },
    quickStatValue: { fontSize: '1.3rem', fontWeight: 900 },
    quickStatDivider: { width: '1px', height: '28px', background: '#E2E8F0' },
    actionBtnSmall: {
        display: 'flex', alignItems: 'center', gap: '5px',
        padding: '6px 12px', borderRadius: '8px',
        border: '1px solid #E2E8F0', background: '#FAFBFC',
        color: '#475569', fontSize: '0.75rem', fontWeight: 600,
        cursor: 'pointer', transition: 'all 0.15s',
    },

    // Filters
    filters: {
        display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap',
    },
    filterGroup: { display: 'flex', alignItems: 'center', gap: '8px' },
    filterLabel: { fontSize: '0.78rem', fontWeight: 700, color: '#64748B' },
    filterBtns: {
        display: 'flex', gap: '4px',
        background: 'rgba(241, 245, 249, 0.8)', borderRadius: '10px', padding: '3px',
        border: '1px solid rgba(226,232,240,0.5)',
    },
    filterBtn: {
        padding: '6px 12px', borderRadius: '8px',
        border: 'none', background: 'transparent',
        color: '#64748B', fontSize: '0.76rem', fontWeight: 600,
        cursor: 'pointer', transition: 'all 0.15s',
        whiteSpace: 'nowrap',
    },
    filterBtnActive: {
        background: '#fff', color: '#1565C0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    },

    // Sections
    queueContainer: { display: 'flex', flexDirection: 'column', gap: '20px' },
    section: {
        background: 'rgba(248, 250, 252, 0.5)',
        borderRadius: '18px', padding: '16px',
        border: '1px solid rgba(226,232,240,0.4)',
    },
    sectionHeader: {
        display: 'flex', alignItems: 'center', gap: '8px',
        marginBottom: '12px', paddingLeft: '4px',
    },
    sectionTitle: { fontSize: '0.85rem', fontWeight: 800, letterSpacing: '-0.3px' },
    sectionCount: {
        padding: '2px 8px', borderRadius: '8px',
        fontSize: '0.7rem', fontWeight: 700,
        background: '#F1F5F9', color: '#64748B',
        border: '1px solid #E2E8F0',
    },
    cardGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: '12px',
    },
    emptyState: {
        textAlign: 'center', padding: '32px 16px',
    },

    // Card inner
    infoCell: {
        padding: '6px 8px', borderRadius: '8px', background: 'rgba(241,245,249,0.6)',
    },
    infoCellLabel: {
        display: 'block', fontSize: '0.6rem', fontWeight: 600, color: '#94A3B8',
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1px',
    },
    infoCellValue: { fontSize: '0.8rem', fontWeight: 700, color: '#0D3B66' },

    turnoActionBtn: {
        display: 'flex', alignItems: 'center', gap: '5px',
        padding: '7px 14px', borderRadius: '10px',
        border: 'none', cursor: 'pointer',
        fontSize: '0.78rem', fontWeight: 700,
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
    },

    // Métricas
    metricasPanel: {
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(12px)',
        borderRadius: '18px', padding: '20px',
        border: '1px solid rgba(226,232,240,0.5)',
        marginBottom: '16px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        animation: 'fadeIn 0.3s ease-out',
    },
    metricasTitle: {
        margin: '0 0 14px', fontSize: '0.95rem', fontWeight: 800, color: '#0D3B66',
        display: 'flex', alignItems: 'center', gap: '6px',
    },
    metricasGrid: {
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px',
    },
    metricaCard: {
        padding: '14px', borderRadius: '12px',
        background: 'rgba(241,245,249,0.6)',
        border: '1px solid rgba(226,232,240,0.4)',
    },
    metricaCardTitle: {
        margin: '0 0 10px', fontSize: '0.78rem', fontWeight: 700, color: '#475569',
    },
    metricaRow: {
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '5px 0',
    },
    metricaDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
    metricaLabel: { flex: 1, fontSize: '0.82rem', color: '#475569', fontWeight: 500 },
    metricaValue: { fontSize: '0.82rem', fontWeight: 700, color: '#0D3B66' },
    metricaEmpty: { fontSize: '0.82rem', color: '#94A3B8', fontStyle: 'italic' },

    // Atendidos
    atendidosPanel: {
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(12px)',
        borderRadius: '18px', padding: '20px',
        border: '1px solid rgba(226,232,240,0.5)',
        marginTop: '16px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        animation: 'fadeIn 0.3s ease-out',
    },
    atendidosTable: {},
    atTableHead: {
        display: 'flex', gap: '8px', padding: '8px 10px',
        fontSize: '0.7rem', fontWeight: 700, color: '#94A3B8',
        textTransform: 'uppercase', letterSpacing: '0.04em',
        borderBottom: '1px solid #E2E8F0',
    },
    atTableRow: {
        display: 'flex', gap: '8px', padding: '8px 10px',
        fontSize: '0.82rem', borderBottom: '1px solid rgba(226,232,240,0.4)',
        alignItems: 'center',
    },

    // Modal
    modalOverlay: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 10000,
    },
    modal: {
        background: '#fff', borderRadius: '20px', padding: '28px',
        maxWidth: '380px', width: '90%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
    },
};
