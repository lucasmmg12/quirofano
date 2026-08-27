/**
 * TurnoAdminPanel.jsx — Panel del administrativo para gestionar cola de turnos
 * Se integra como vista dentro del sistema ADM-QUI (Sidebar)
 * Funciones: Ver cola, Llamar, Iniciar atención, Finalizar, Derivar, Métricas rápidas
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchBoxes, subscribeToBoxes } from '../services/boxService';
import {
    Users, PhoneCall, Play, Square, ArrowRightLeft,
    Clock, CheckCircle, XCircle, BarChart3, RefreshCw,
    User, FileText, Receipt, Microscope, HelpCircle,
    Building2, Baby, ShieldCheck, Monitor, Edit2, Timer, AlertTriangle,
    Download, FileSpreadsheet, RotateCcw
} from 'lucide-react';
import { SkeletonCardGrid } from './SkeletonLoader';
import { exportMetricasToExcel, generateMetricasPdf } from '../utils/metricsReport';
import {
    fetchColaActiva, fetchAtendidosHoy, fetchMetricasPorRango,
    llamarTurno, iniciarAtencion, finalizarAtencion,
    cancelarTurno, derivarTurno, cambiarTramiteTurno, subscribeToCola, fetchTurnoConfig,
    devolverAEspera
} from '../services/turnoService';
import BoxManagerPanel from './BoxManagerPanel';
import ChartsPanel from './metrics/ChartsPanel';
import FluidBackground3D from './metrics/FluidBackground3D';
import { supabase } from '../lib/supabase';

const ICON_MAP = { FileText, Receipt, Microscope, HelpCircle, Building2, Users, Baby, ShieldCheck };

const ESTADO_BADGES = {
    esperando: { label: 'Esperando', color: '#F59E0B', bg: '#FEF3C7', icon: Clock },
    llamando: { label: 'Llamando', color: '#3B82F6', bg: '#DBEAFE', icon: PhoneCall },
    en_atencion: { label: 'En atención', color: '#8B5CF6', bg: '#EDE9FE', icon: Play },
    atendido: { label: 'Atendido', color: '#16A34A', bg: '#DCFCE7', icon: CheckCircle },
    cancelado: { label: 'Cancelado', color: '#EF4444', bg: '#FEE2E2', icon: XCircle },
};

// Sonido de alerta para derivaciones (3 tonos ascendentes)
function playDerivAlert() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const notes = [523, 659, 784]; // C5, E5, G5
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.2);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.2 + 0.18);
            osc.start(ctx.currentTime + i * 0.2);
            osc.stop(ctx.currentTime + i * 0.2 + 0.2);
        });
    } catch (e) {
        console.warn('Audio alert failed:', e);
    }
}

function formatSeconds(secs) {
    if (!secs || isNaN(secs)) return '';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
}

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
    const [showBoxManager, setShowBoxManager] = useState(false);
    const [activeTimers, setActiveTimers] = useState({}); // turnoId → elapsed seconds
    const timerInterval = useRef(null);
    const [derivarModal, setDerivarModal] = useState(null); // turnoId
    const [cancelarModal, setCancelarModal] = useState(null); // turno object
    const [cambiarTramiteModal, setCambiarTramiteModal] = useState(null); // turno object
    const [finalizarModal, setFinalizarModal] = useState(null); // turno object
    const [allUsers, setAllUsers] = useState([]);
    const [myBoxNum, setMyBoxNum] = useState(null); // box asignado al usuario actual
    const [derivNotif, setDerivNotif] = useState(null); // { turnoNum, fromBox, toBox }
    const prevColaRef = useRef([]); // para detectar derivaciones comparando snapshots

    // Rango de fechas para métricas
    const [metricasRango, setMetricasRango] = useState('hoy'); // hoy, ayer, semana, mes, custom
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    const empleadoNombre = currentUser?.nombre || 'Administrador';
    const empleadoBox = boxFilter || 1;

    // ─── Cargar datos ───
    const loadData = useCallback(async () => {
        try {
            // Calcular fechas del filtro
            let start = new Date();
            start.setHours(0,0,0,0);
            let end = null;
            
            if (metricasRango === 'ayer') {
                start.setDate(start.getDate() - 1);
                end = new Date(start);
                end.setHours(23,59,59,999);
            } else if (metricasRango === 'semana') {
                start.setDate(start.getDate() - 7);
            } else if (metricasRango === 'mes') {
                start.setMonth(start.getMonth() - 1);
            } else if (metricasRango === 'custom' && customStart) {
                start = new Date(customStart + 'T00:00:00');
                if (customEnd) {
                    end = new Date(customEnd + 'T23:59:59');
                }
            }

            const [cfgData, colaData, atendidosData, metricasData] = await Promise.all([
                fetchTurnoConfig(),
                fetchColaActiva(),
                fetchAtendidosHoy(),
                fetchMetricasPorRango(start.toISOString(), end ? end.toISOString() : null),
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
    }, [addToast, metricasRango, customStart, customEnd]);

    useEffect(() => {
        loadData();
        // Cargar usuarios para BoxManagerPanel
        import('../lib/supabase').then(({ supabase }) => {
            supabase.from('admqui_usuarios').select('id, usuario, nombre, iniciales')
                .eq('activo', true).order('nombre')
                .then(({ data }) => setAllUsers(data || []));
        });
    }, [loadData]);

    useEffect(() => {
        const updateMyBox = () => {
            if (currentUser?.id) {
                fetchBoxes().then(boxes => {
                    const mine = boxes.find(b => b.usuario_id === currentUser.id);
                    setMyBoxNum(mine ? mine.numero : null);
                });
            } else {
                setMyBoxNum(null);
            }
        };
        updateMyBox();
        const unsub = subscribeToBoxes(updateMyBox);
        return () => unsub();
    }, [currentUser]);

    // ─── Realtime subscription con detección de derivaciones ───
    useEffect(() => {
        const unsub = subscribeToCola((payload) => {
            // Detectar derivación: UPDATE donde box_asignado cambió hacia MI box
            if (payload.eventType === 'UPDATE' && myBoxNum) {
                const newData = payload.new;
                const oldData = payload.old;
                if (
                    newData.box_asignado === myBoxNum &&
                    oldData.box_asignado !== myBoxNum &&
                    newData.estado === 'esperando'
                ) {
                    // ¡Me derivaron un turno!
                    setDerivNotif({
                        turnoNum: newData.numero_turno,
                        fromBox: oldData.box_asignado,
                        toBox: myBoxNum,
                        tipo: newData.tipo_tramite,
                    });
                    // Sonido de alerta
                    playDerivAlert();
                    // Auto-dismiss en 15s
                    setTimeout(() => setDerivNotif(null), 15000);
                }
            }
            loadData();
        });
        return () => unsub();
    }, [loadData, myBoxNum]);

    // ─── Timer para turnos en atención ───
    useEffect(() => {
        timerInterval.current = setInterval(() => {
            setActiveTimers(() => {
                const timers = {};
                cola.forEach(t => {
                    if (t.estado === 'en_atencion' && t.llamado_at) {
                        const elapsed = Math.floor((Date.now() - new Date(t.llamado_at).getTime()) / 1000);
                        timers[t.id] = Math.max(0, elapsed);
                    }
                });
                return timers;
            });
        }, 1000);
        return () => clearInterval(timerInterval.current);
    }, [cola]);

    // ─── Grupos de Filtros (Pestañas) ───
    const filterTabs = useMemo(() => {
        const tabs = [];
        const gruposProcessed = new Set();
        
        config.forEach(cfg => {
            if (cfg.grupo) {
                if (!gruposProcessed.has(cfg.grupo)) {
                    gruposProcessed.add(cfg.grupo);
                    tabs.push({ id: cfg.grupo, label: cfg.grupo_label || cfg.grupo, color: cfg.grupo_color || '#8B5CF6', isGroup: true });
                }
            } else {
                tabs.push({ id: cfg.tipo_tramite, label: cfg.label, color: cfg.color, isGroup: false });
            }
        });
        return tabs;
    }, [config]);

    // ─── Filtrado ───
    const colaFiltrada = useMemo(() => {
        let result = cola;
        if (boxFilter !== null) result = result.filter(t => t.box_asignado === boxFilter);
        if (tipoFilter) {
            const tab = filterTabs.find(t => t.id === tipoFilter);
            if (tab && tab.isGroup) {
                const tramitesEnGrupo = config.filter(c => c.grupo === tipoFilter).map(c => c.tipo_tramite);
                result = result.filter(t => tramitesEnGrupo.includes(t.tipo_tramite));
            } else {
                result = result.filter(t => t.tipo_tramite === tipoFilter);
            }
        }
        return result;
    }, [cola, boxFilter, tipoFilter, config, filterTabs]);

    // Agrupar por estado para vista de secciones
    const esperando = colaFiltrada.filter(t => t.estado === 'esperando');
    const llamando = colaFiltrada.filter(t => t.estado === 'llamando');
    const enAtencion = colaFiltrada.filter(t => t.estado === 'en_atencion');

    // ─── Acciones ───
    const handleLlamar = useCallback(async (turno) => {
        if (myBoxNum === null) {
            addToast?.('Debes asignarte un box para llamar a algún turno.', 'warning');
            return;
        }
        try {
            await llamarTurno(turno.id, empleadoNombre, myBoxNum);
            addToast?.(`Llamando turno ${turno.numero_turno}`, 'info');
            loadData();
        } catch (err) {
            addToast?.('Error al llamar turno', 'error');
        }
    }, [empleadoNombre, addToast, loadData, myBoxNum]);

    const handleIniciar = useCallback(async (turno) => {
        try {
            await iniciarAtencion(turno.id, empleadoNombre, turno.box_asignado);
            addToast?.(`Atendiendo turno ${turno.numero_turno}`, 'success');
            loadData();
        } catch (err) {
            addToast?.('Error al iniciar atención', 'error');
        }
    }, [empleadoNombre, addToast, loadData]);

    const handleFinalizar = useCallback((turno) => {
        // En lugar de finalizar directamente, obligamos a clasificar el trámite primero
        setFinalizarModal(turno);
    }, []);

    const handleConfirmFinalizar = useCallback(async (turnoId, nuevoTipo) => {
        try {
            // Actualizar tipo de trámite
            const { error: updErr } = await supabase
                .from('turnos_cola')
                .update({ tipo_tramite: nuevoTipo })
                .eq('id', turnoId);
            if (updErr) throw updErr;

            await finalizarAtencion(turnoId);
            const elapsed = activeTimers[turnoId];
            const timeStr = elapsed ? formatSeconds(elapsed) : '';
            addToast?.(`Turno finalizado exitosamente ${timeStr ? `(${timeStr})` : ''}`, 'success');
            setFinalizarModal(null);
            loadData();
        } catch (err) {
            console.error(err);
            addToast?.('Error al finalizar atención', 'error');
        }
    }, [activeTimers, addToast, loadData]);

    const handleDevolver = useCallback(async (turnoId) => {
        try {
            await devolverAEspera(turnoId);
            addToast?.('Turno devuelto a espera', 'info');
            loadData();
        } catch (err) {
            addToast?.('Error al devolver turno a espera', 'error');
        }
    }, [addToast, loadData]);

    const handleCancelar = useCallback(async (turnoId, motivo) => {
        try {
            await cancelarTurno(turnoId, motivo, empleadoNombre);
            setCancelarModal(null);
            addToast?.(`Turno cancelado: ${motivo}`, 'info');
            loadData();
        } catch (err) {
            addToast?.('Error al cancelar turno', 'error');
        }
    }, [empleadoNombre, addToast, loadData]);

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

    const handleCambiarTramite = useCallback(async (turnoId, nuevoTipo) => {
        try {
            await cambiarTramiteTurno(turnoId, nuevoTipo);
            setCambiarTramiteModal(null);
            addToast?.(`Trámite actualizado correctamente`, 'success');
            loadData();
        } catch (err) {
            addToast?.('Error al cambiar trámite', 'error');
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
            <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
                <SkeletonCardGrid cards={6} />
            </div>
        );
    }

    return (
        <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
            {/* ═══ NOTIFICACIÓN DE DERIVACIÓN ═══ */}
            {derivNotif && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
                    padding: '0 16px',
                    animation: 'slideDown 0.4s ease-out',
                }}>
                    <div style={{
                        maxWidth: '800px', margin: '16px auto',
                        padding: '18px 24px',
                        borderRadius: '16px',
                        background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                        boxShadow: '0 8px 40px rgba(245,158,11,0.45), 0 0 0 4px rgba(245,158,11,0.2)',
                        display: 'flex', alignItems: 'center', gap: '16px',
                        animation: 'pulse 2s ease-in-out infinite',
                    }}>
                        <div style={{
                            width: '52px', height: '52px', borderRadius: '14px',
                            background: 'rgba(255,255,255,0.25)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            <ArrowRightLeft size={26} color="#fff" />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{
                                fontSize: '1.1rem', fontWeight: 800, color: '#fff',
                                marginBottom: '2px',
                            }}>
                                🔔 Turno {derivNotif.turnoNum} derivado a tu {derivNotif.toBox === 99 ? 'Box UCI' : `Box ${derivNotif.toBox}`}
                            </div>
                            <div style={{
                                fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)',
                                fontWeight: 600,
                            }}>
                                Proviene del {derivNotif.fromBox === 99 ? 'Box UCI' : `Box ${derivNotif.fromBox}`} · Está esperando atención
                            </div>
                        </div>
                        <button
                            onClick={() => setDerivNotif(null)}
                            style={{
                                padding: '8px 18px', borderRadius: '10px',
                                border: '2px solid rgba(255,255,255,0.4)',
                                background: 'rgba(255,255,255,0.2)',
                                color: '#fff', fontWeight: 700, fontSize: '0.85rem',
                                cursor: 'pointer', transition: 'all 0.15s',
                            }}
                        >
                            Entendido
                        </button>
                    </div>
                </div>
            )}
            <style>{`
                @keyframes slideDown {
                    from { transform: translateY(-100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                @keyframes pulse {
                    0%, 100% { box-shadow: 0 8px 40px rgba(245,158,11,0.45), 0 0 0 4px rgba(245,158,11,0.2); }
                    50% { box-shadow: 0 8px 40px rgba(245,158,11,0.6), 0 0 0 8px rgba(245,158,11,0.15); }
                }
            `}</style>
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
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                            {[{id:'hoy', label:'Hoy'}, {id:'ayer', label:'Ayer'}, {id:'semana', label:'7 días'}, {id:'mes', label:'30 días'}, {id:'custom', label:'Custom'}].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setMetricasRango(tab.id)}
                                    style={{
                                        padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', border: 'none', cursor: 'pointer',
                                        background: metricasRango === tab.id ? '#DBEAFE' : 'transparent',
                                        color: metricasRango === tab.id ? '#2563EB' : '#94A3B8',
                                        fontWeight: metricasRango === tab.id ? '600' : '500',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                        {metricasRango === 'custom' && (
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', alignItems: 'center' }}>
                                <input 
                                    type="date" 
                                    value={customStart} 
                                    onChange={e => setCustomStart(e.target.value)} 
                                    style={{ padding: '2px 6px', fontSize: '0.75rem', borderRadius: '6px', border: '1px solid #CBD5E1', outline: 'none' }}
                                />
                                <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>-</span>
                                <input 
                                    type="date" 
                                    value={customEnd} 
                                    onChange={e => setCustomEnd(e.target.value)} 
                                    style={{ padding: '2px 6px', fontSize: '0.75rem', borderRadius: '6px', border: '1px solid #CBD5E1', outline: 'none' }}
                                />
                            </div>
                        )}
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
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px', alignSelf: 'flex-end' }}>
                        <button onClick={() => setShowBoxManager(p => !p)}
                            style={{
                                ...s.actionBtnSmall,
                                ...(showBoxManager ? { background: '#1565C0', color: '#fff', borderColor: '#1565C0' } : {}),
                            }}>
                            <Monitor size={14} /> {showBoxManager ? 'Ocultar' : 'Boxes'}
                        </button>
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

            {/* ═══ GESTIÓN DE BOXES ═══ */}
            {showBoxManager && (
                <div style={{
                    marginBottom: '16px', padding: '16px',
                    borderRadius: '14px',
                    background: 'rgba(255,255,255,0.85)',
                    border: '2px solid #1565C020',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        marginBottom: '14px', paddingBottom: '10px',
                        borderBottom: '1px solid #E2E8F0',
                    }}>
                        <div style={{
                            width: '32px', height: '32px', borderRadius: '8px',
                            background: '#1565C015', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Monitor size={16} color="#1565C0" />
                        </div>
                        <div>
                            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#0D3B66' }}>
                                Gestión de Boxes
                            </h4>
                            <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                Encender, apagar y asignar boxes de atención
                            </span>
                        </div>
                    </div>
                    <BoxManagerPanel
                        addToast={addToast}
                        currentUser={currentUser}
                        allUsers={allUsers}
                        cola={cola}
                    />
                </div>
            )}

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
                        {[1, 2, 3, 4, 99].map(b => (
                            <button key={b} onClick={() => setBoxFilter(b)}
                                style={{ ...s.filterBtn, ...(boxFilter === b ? s.filterBtnActive : {}) }}>
                                {b === 99 ? 'UCI' : `Box ${b}`}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Pestañas de Grupo */}
                <div style={s.filterGroup}>
                    <span style={s.filterLabel}>Grupo:</span>
                    <div style={s.filterBtns}>
                        <button onClick={() => setTipoFilter(null)}
                            style={{ ...s.filterBtn, ...(tipoFilter === null ? s.filterBtnActive : {}) }}>
                            Todos
                        </button>
                        {filterTabs.map(tab => (
                            <button key={tab.id} onClick={() => setTipoFilter(tab.id)}
                                style={{
                                    ...s.filterBtn,
                                    ...(tipoFilter === tab.id ? { ...s.filterBtnActive, background: tab.color + '18', borderColor: tab.color + '40', color: tab.color } : {}),
                                }}>
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ═══ MÉTRICAS EXPANDIDAS (PRO MAX 3D) ═══ */}
            {showMetricas && metricas && (
                <div style={{ position: 'relative', width: '100%', borderRadius: '24px', overflow: 'hidden', marginBottom: '24px' }}>
                    <FluidBackground3D workloadScore={Math.min((metricas.esperando + metricas.enAtencion) / 20, 1)} />
                    <div style={{ position: 'relative', zIndex: 1, padding: '24px' }}>
                        
                        {/* Selector de Fechas para Métricas */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '24px', background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(10px)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.4)', alignItems: 'center' }}>
                            <div style={{ fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Clock size={16} /> Filtro de Fechas:
                            </div>
                            {['hoy', 'ayer', 'semana', 'mes'].map(r => (
                                <button key={r} onClick={() => setMetricasRango(r)}
                                    style={{ 
                                        padding: '6px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                                        background: metricasRango === r ? '#3b82f6' : 'rgba(255,255,255,0.8)',
                                        color: metricasRango === r ? 'white' : '#475569',
                                        boxShadow: metricasRango === r ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none',
                                        textTransform: 'capitalize'
                                    }}>
                                    {r === 'semana' ? 'Últimos 7 días' : r === 'mes' ? 'Últimos 30 días' : r}
                                </button>
                            ))}
                            <button onClick={() => setMetricasRango('custom')}
                                style={{ 
                                    padding: '6px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                                    background: metricasRango === 'custom' ? '#8b5cf6' : 'rgba(255,255,255,0.8)',
                                    color: metricasRango === 'custom' ? 'white' : '#475569',
                                    boxShadow: metricasRango === 'custom' ? '0 4px 12px rgba(139, 92, 246, 0.3)' : 'none'
                                }}>
                                Personalizado
                            </button>
                            {metricasRango === 'custom' && (
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }} />
                                    <span style={{ color: '#64748b' }}>-</span>
                                    <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }} />
                                </div>
                            )}

                            {/* Botones de Exportación */}
                            <div style={{ display: 'flex', gap: '12px', marginLeft: 'auto' }}>
                                <button onClick={() => exportMetricasToExcel(metricas, config, metricasRango)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '13px',
                                        background: '#10b981', color: 'white', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)', transition: 'all 0.2s'
                                    }}>
                                    <FileSpreadsheet size={16} /> Excel
                                </button>
                                <button onClick={() => generateMetricasPdf(metricas, metricasRango, 'charts-panel-export')}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '13px',
                                        background: '#ef4444', color: 'white', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)', transition: 'all 0.2s'
                                    }}>
                                    <Download size={16} /> Reporte PDF
                                </button>
                            </div>
                        </div>

                        <div id="charts-panel-export" style={{ background: 'transparent' }}>
                            <ChartsPanel metricas={metricas} config={config} />
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ COLA PRINCIPAL ═══ */}
            <div style={s.queueContainer}>
                {myBoxNum === null && (
                    <div style={{
                        background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#DC2626',
                        padding: '14px 18px', borderRadius: '8px', marginBottom: '16px',
                        display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 500, fontSize: '0.95rem',
                        boxShadow: '0 2px 8px rgba(220, 38, 38, 0.1)'
                    }}>
                        <AlertTriangle size={20} />
                        <div>
                            <strong>No tienes asignado ningún box.</strong> Para poder llamar a algún turno debes asignarte un box y asegurarte de que el mismo esté encendido.
                        </div>
                    </div>
                )}

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
                                    onCancelar={() => setCancelarModal(turno)}
                                    onDerivar={() => setDerivarModal(turno.id)}
                                    onDevolver={() => handleDevolver(turno.id)}
                                    onChangeTramite={() => setCambiarTramiteModal(turno)}
                                    formatTime={formatTime}
                                    formatSeconds={formatSeconds}
                                    isLockedForMe={turno.estado !== 'esperando' && turno.box_asignado !== null && myBoxNum !== null && turno.box_asignado !== myBoxNum}
                                    myBoxNum={myBoxNum}
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
                                    onCancelar={() => setCancelarModal(turno)}
                                    onDerivar={() => setDerivarModal(turno.id)}
                                    onDevolver={() => handleDevolver(turno.id)}
                                    onChangeTramite={() => setCambiarTramiteModal(turno)}
                                    formatTime={formatTime}
                                    formatSeconds={formatSeconds}
                                    isLockedForMe={turno.estado !== 'esperando' && turno.box_asignado !== null && myBoxNum !== null && turno.box_asignado !== myBoxNum}
                                    myBoxNum={myBoxNum}
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
                            {atendidos.filter(t => {
                                if (!tipoFilter) return true;
                                const tab = filterTabs.find(ft => ft.id === tipoFilter);
                                if (tab && tab.isGroup) {
                                    const tramitesEnGrupo = config.filter(c => c.grupo === tipoFilter).map(c => c.tipo_tramite);
                                    return tramitesEnGrupo.includes(t.tipo_tramite);
                                }
                                return t.tipo_tramite === tipoFilter;
                            }).slice(0, 30).map(t => {
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
                            {[1, 2, 3, 4, 99].map(b => (
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
                                    {b === 99 ? 'UCI' : `Box ${b}`}
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setDerivarModal(null)} style={{
                            width: '100%', marginTop: '12px', padding: '12px', borderRadius: '10px',
                            border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#64748B',
                            cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
                        }}>
                            Volver
                        </button>
                    </div>
                </div>
            )}

            {/* ═══ MODAL: CANCELAR TURNO ═══ */}
            {cancelarModal && (
                <CancelarModal
                    turno={cancelarModal}
                    onConfirm={(motivo) => handleCancelar(cancelarModal.id, motivo)}
                    onClose={() => setCancelarModal(null)}
                />
            )}

            {/* Modal de Cambiar Trámite */}
            {cambiarTramiteModal && (
                <CambiarTramiteModal
                    turno={cambiarTramiteModal}
                    configList={config}
                    onClose={() => setCambiarTramiteModal(null)}
                    onConfirm={(nuevoTipo) => handleCambiarTramite(cambiarTramiteModal.id, nuevoTipo)}
                />
            )}

            {/* Modal de Finalizar (Clasificación obligatoria) */}
            {finalizarModal && (
                <CambiarTramiteModal
                    turno={finalizarModal}
                    configList={config}
                    isFinalizar={true}
                    onClose={() => setFinalizarModal(null)}
                    onConfirm={(nuevoTipo) => handleConfirmFinalizar(finalizarModal.id, nuevoTipo)}
                />
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
function TurnoCard({ turno, config, elapsed, onLlamar, onIniciar, onFinalizar, onCancelar, onDerivar, onDevolver, onChangeTramite, formatTime, getTimeSince, formatSeconds, isLockedForMe, myBoxNum }) {
    const estadoCfg = ESTADO_BADGES[turno.estado] || ESTADO_BADGES.esperando;
    const isActive = turno.estado === 'llamando' || turno.estado === 'en_atencion';

    // Calcular tiempo de espera individual
    const getWaitTime = () => {
        if (!turno.created_at) return null;
        const end = turno.llamado_at ? new Date(turno.llamado_at) : new Date();
        const mins = Math.floor((end - new Date(turno.created_at)) / 60000);
        return Math.max(0, mins);
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
                    <span style={{ ...s.infoCellValue, color: config.color, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {config.label || turno.tipo_tramite}
                        {!isLockedForMe && (
                            <button
                                onClick={onChangeTramite}
                                style={{ background: 'transparent', border: 'none', padding: '2px', cursor: 'pointer', color: '#64748B' }}
                                title="Cambiar Trámite"
                            >
                                <Edit2 size={12} />
                            </button>
                        )}
                    </span>
                </div>
                <div style={s.infoCell}>
                    <span style={s.infoCellLabel}>Box</span>
                    <span style={s.infoCellValue}>{turno.box_asignado === 99 ? 'UCI' : `Box ${turno.box_asignado}`}</span>
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
                {(() => {
                    const noBox = myBoxNum === null;
                    const isLocked = isLockedForMe || noBox;
                    const lockedStyle = isLocked ? { opacity: 0.4, pointerEvents: 'none' } : {};
                    let lockedTitle = undefined;
                    if (noBox) {
                        lockedTitle = "No tienes asignado ningún box. Asígnate un box para llamar turnos.";
                    } else if (isLockedForMe) {
                        lockedTitle = "Solo el Box asignado puede gestionar este turno";
                    }
                    return (
                        <>
                            {turno.estado === 'esperando' && (
                                <>
                                    <button onClick={() => onLlamar(turno)} style={{ ...s.turnoActionBtn, background: '#3B82F6', color: '#fff', ...lockedStyle }} title={lockedTitle}>
                                        <PhoneCall size={14} /> Llamar
                                    </button>
                                    <button onClick={onDerivar} style={{ ...s.turnoActionBtn, background: '#F0F4F8', color: '#475569', border: '1px solid #E2E8F0' }}>
                                        <ArrowRightLeft size={14} /> Derivar
                                    </button>
                                    <button onClick={() => onCancelar()} style={{ ...s.turnoActionBtn, background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA', ...lockedStyle }} title={lockedTitle || "Cancelar turno"}>
                                        <XCircle size={14} />
                                    </button>
                                </>
                            )}
                            {turno.estado === 'llamando' && (
                                <>
                                    <button onClick={() => onIniciar(turno)} style={{ ...s.turnoActionBtn, background: '#8B5CF6', color: '#fff', ...lockedStyle }} title={lockedTitle}>
                                        <Play size={14} /> Iniciar Atención
                                    </button>
                                    <button onClick={() => onLlamar(turno)} style={{ ...s.turnoActionBtn, background: '#DBEAFE', color: '#3B82F6', border: '1px solid #93C5FD', ...lockedStyle }} title={lockedTitle}>
                                        <PhoneCall size={14} /> Re-llamar
                                    </button>
                                    <button onClick={onDerivar} style={{ ...s.turnoActionBtn, background: '#F0F4F8', color: '#475569', border: '1px solid #E2E8F0' }}>
                                        <ArrowRightLeft size={14} /> Derivar
                                    </button>
                                    <button onClick={() => onDevolver()} style={{ ...s.turnoActionBtn, background: '#FEF3C7', color: '#D97706', border: '1px solid #FDE68A', ...lockedStyle }} title={lockedTitle || "Devolver a espera"}>
                                        <RotateCcw size={14} /> Devolver
                                    </button>
                                    <button onClick={() => onCancelar()} style={{ ...s.turnoActionBtn, background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA', ...lockedStyle }} title={lockedTitle || "Cancelar turno"}>
                                        <XCircle size={14} />
                                    </button>
                                </>
                            )}
                            {turno.estado === 'en_atencion' && (
                                <>
                                    <button onClick={() => onFinalizar(turno)} style={{
                                        ...s.turnoActionBtn,
                                        background: 'linear-gradient(135deg, #16A34A, #15803D)',
                                        color: '#fff', flex: 1, justifyContent: 'center',
                                        padding: '10px', fontSize: '0.88rem'
                                    }} title="Finalizar turno (Override permitido)">
                                        <Square size={14} /> Finalizar Atención
                                    </button>
                                    <button onClick={onDerivar} style={{ ...s.turnoActionBtn, background: '#F0F4F8', color: '#475569', border: '1px solid #E2E8F0', padding: '10px' }}>
                                        <ArrowRightLeft size={14} /> Derivar
                                    </button>
                                    <button onClick={() => onDevolver()} style={{ ...s.turnoActionBtn, background: '#FEF3C7', color: '#D97706', border: '1px solid #FDE68A', padding: '10px' }} title="Devolver a espera (Override permitido)">
                                        <RotateCcw size={14} /> Devolver
                                    </button>
                                </>
                            )}
                        </>
                    );
                })()}
            </div>
        </div>
    );
}

// ─── Componente: Modal de Cancelación ───
const MOTIVOS_CANCELACION = [
    { id: 'retiro', label: 'Paciente se retiró', icon: '🚶', color: '#F59E0B', desc: 'El paciente abandonó la espera' },
    { id: 'atendido', label: 'Ya fue atendido', icon: '✅', color: '#16A34A', desc: 'El paciente fue atendido por otra vía' },
    { id: 'duplicado', label: 'Turno duplicado', icon: '📋', color: '#6366F1', desc: 'Se generó un turno de más' },
    { id: 'error', label: 'Error de carga', icon: '⚠️', color: '#EF4444', desc: 'Se cargó el turno por error' },
];

// ─── Componente: Modal de Cambiar Trámite ───
function CambiarTramiteModal({ turno, configList, onConfirm, onClose, isFinalizar = false }) {
    // Agrupar las opciones por su grupo
    const groupedOptions = configList.reduce((acc, curr) => {
        const group = curr.grupo_label || curr.grupo || 'Otros';
        if (!acc[group]) acc[group] = [];
        acc[group].push(curr);
        return acc;
    }, {});

    return (
        <div style={s.modalOverlay} onClick={onClose}>
            <div style={{ ...s.modal, maxWidth: '600px', width: '95%' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <div style={{
                        width: '36px', height: '36px', borderRadius: '10px',
                        background: isFinalizar ? '#DCFCE7' : '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Edit2 size={18} style={{ color: isFinalizar ? '#16A34A' : '#3B82F6' }} />
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0D3B66' }}>
                            {isFinalizar ? 'Clasificar y Finalizar' : 'Cambiar Trámite'}
                        </h3>
                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                            Turno {turno.numero_turno} {turno.dni ? `· DNI ${turno.dni}` : ''}
                        </span>
                    </div>
                </div>

                <p style={{ fontSize: '0.88rem', color: '#475569', marginBottom: '20px' }}>
                    {isFinalizar 
                        ? 'Seleccione el trámite realizado para finalizar la atención de este turno.' 
                        : 'Seleccione el nuevo trámite correcto para este turno.'}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '55vh', overflowY: 'auto', paddingRight: '8px' }}>
                    {Object.entries(groupedOptions).map(([groupName, options]) => (
                        <div key={groupName}>
                            <h4 style={{ margin: '0 0 10px 4px', fontSize: '0.8rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                {groupName}
                            </h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
                                {options.map(m => {
                                    const isDisabled = !isFinalizar && m.tipo_tramite === turno.tipo_tramite;
                                    return (
                                        <button
                                            key={m.tipo_tramite}
                                            onClick={() => onConfirm(m.tipo_tramite)}
                                            disabled={isDisabled}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '10px',
                                                padding: '14px 16px', borderRadius: '12px',
                                                border: `2px solid ${isDisabled ? '#E2E8F0' : m.color}`,
                                                background: isDisabled ? '#F8FAFC' : m.color + '15',
                                                cursor: isDisabled ? 'not-allowed' : 'pointer',
                                                textAlign: 'left', opacity: isDisabled ? 0.6 : 1,
                                                transition: 'all 0.2s',
                                                boxShadow: isDisabled ? 'none' : `0 2px 8px ${m.color}20`,
                                            }}
                                            onMouseEnter={e => {
                                                if (!isDisabled) {
                                                    e.currentTarget.style.background = m.color + '25';
                                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                                    e.currentTarget.style.boxShadow = `0 4px 12px ${m.color}40`;
                                                }
                                            }}
                                            onMouseLeave={e => {
                                                if (!isDisabled) {
                                                    e.currentTarget.style.background = m.color + '15';
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                    e.currentTarget.style.boxShadow = `0 2px 8px ${m.color}20`;
                                                }
                                            }}
                                        >
                                            <div style={{ flex: 1 }}>
                                                <span style={{ display: 'block', fontSize: '0.95rem', fontWeight: 800, color: isDisabled ? '#94A3B8' : m.color }}>
                                                    {m.label}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                <button onClick={onClose} style={{
                    width: '100%', marginTop: '20px', padding: '12px', borderRadius: '10px',
                    border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#64748B',
                    cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
                }}>
                    Cancelar
                </button>
            </div>
        </div>
    );
}

function CancelarModal({ turno, onConfirm, onClose }) {
    const [motivoCustom, setMotivoCustom] = useState('');
    const [showCustom, setShowCustom] = useState(false);

    return (
        <div style={s.modalOverlay} onClick={onClose}>
            <div style={{ ...s.modal, maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <div style={{
                        width: '36px', height: '36px', borderRadius: '10px',
                        background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <XCircle size={18} style={{ color: '#DC2626' }} />
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0D3B66' }}>
                            Cancelar Turno
                        </h3>
                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                            {turno.numero_turno} {turno.nombre_paciente ? `· ${turno.nombre_paciente}` : turno.dni ? `· DNI ${turno.dni}` : ''}
                        </span>
                    </div>
                </div>

                <p style={{ margin: '12px 0 16px', fontSize: '0.82rem', color: '#64748B', lineHeight: 1.4 }}>
                    Seleccioná el motivo de la cancelación. Esto queda registrado para auditoría.
                </p>

                {/* Motivos predefinidos */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {MOTIVOS_CANCELACION.map(m => (
                        <button
                            key={m.id}
                            onClick={() => onConfirm(m.label)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '12px',
                                padding: '14px 16px', borderRadius: '12px',
                                border: `1.5px solid ${m.color}25`,
                                background: `${m.color}06`,
                                cursor: 'pointer', transition: 'all 0.15s',
                                textAlign: 'left',
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.background = `${m.color}12`;
                                e.currentTarget.style.borderColor = `${m.color}40`;
                                e.currentTarget.style.transform = 'translateX(4px)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.background = `${m.color}06`;
                                e.currentTarget.style.borderColor = `${m.color}25`;
                                e.currentTarget.style.transform = 'translateX(0)';
                            }}
                        >
                            <span style={{ fontSize: '1.3rem' }}>{m.icon}</span>
                            <div style={{ flex: 1 }}>
                                <span style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, color: '#0D3B66' }}>
                                    {m.label}
                                </span>
                                <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{m.desc}</span>
                            </div>
                        </button>
                    ))}

                    {/* Otro motivo */}
                    {!showCustom ? (
                        <button
                            onClick={() => setShowCustom(true)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '12px',
                                padding: '14px 16px', borderRadius: '12px',
                                border: '1.5px solid #E2E8F0',
                                background: '#FAFBFC',
                                cursor: 'pointer', transition: 'all 0.15s',
                                textAlign: 'left',
                            }}
                        >
                            <span style={{ fontSize: '1.3rem' }}>💬</span>
                            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#64748B' }}>
                                Otro motivo...
                            </span>
                        </button>
                    ) : (
                        <div style={{
                            padding: '14px', borderRadius: '12px',
                            border: '1.5px solid #3B82F630',
                            background: '#3B82F606',
                        }}>
                            <input
                                type="text"
                                autoFocus
                                placeholder="Describí el motivo..."
                                value={motivoCustom}
                                onChange={e => setMotivoCustom(e.target.value)}
                                style={{
                                    width: '100%', padding: '10px 12px', borderRadius: '8px',
                                    border: '1.5px solid #E2E8F0', fontSize: '0.88rem',
                                    color: '#0D3B66', outline: 'none', boxSizing: 'border-box',
                                    marginBottom: '8px',
                                }}
                            />
                            <button
                                onClick={() => motivoCustom.trim() && onConfirm(motivoCustom.trim())}
                                disabled={!motivoCustom.trim()}
                                style={{
                                    width: '100%', padding: '10px', borderRadius: '8px',
                                    border: 'none',
                                    background: motivoCustom.trim() ? '#DC2626' : '#E2E8F0',
                                    color: motivoCustom.trim() ? '#fff' : '#94A3B8',
                                    fontSize: '0.85rem', fontWeight: 700,
                                    cursor: motivoCustom.trim() ? 'pointer' : 'not-allowed',
                                    transition: 'all 0.15s',
                                }}
                            >
                                Confirmar cancelación
                            </button>
                        </div>
                    )}
                </div>

                {/* Botón volver */}
                <button onClick={onClose} style={{
                    width: '100%', marginTop: '12px', padding: '12px', borderRadius: '10px',
                    border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#64748B',
                    cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
                }}>
                    Volver
                </button>
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
        display: 'flex', gap: '8px', flexWrap: 'wrap',
        alignItems: 'center'
    },
    filterBtn: {
        padding: '6px 14px', borderRadius: '20px',
        border: '1px solid #E2E8F0', background: '#F8FAFC',
        color: '#64748B', fontSize: '0.76rem', fontWeight: 600,
        cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        whiteSpace: 'nowrap',
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
    },
    filterBtnActive: {
        background: '#EFF6FF', color: '#1D4ED8',
        borderColor: '#BFDBFE',
        boxShadow: '0 4px 12px rgba(37,99,235,0.15)',
        transform: 'translateY(-1px)'
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
