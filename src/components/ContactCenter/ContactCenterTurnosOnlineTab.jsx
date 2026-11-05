import React, { useState, useEffect, useMemo } from 'react';
import { 
    AlertTriangle, Calendar, Clock, User, Phone, Mail, 
    Send, CheckCircle2, XCircle, Search, RefreshCw, ChevronDown, 
    ChevronUp, MessageSquare, ShieldAlert, FileText, Check,
    ExternalLink, Sparkles, Filter, Info, ArrowLeft, HelpCircle, BookOpen,
    Copy, Columns, List
} from 'lucide-react';
import { 
    fetchTurnosOnlineDuplicados, 
    saveGestionTurnoOnline, 
    sendWhatsappAvisoTurno,
    sendTemplateTurnosMismoDia,
    buildVariablesTurnosMismoDia,
    renderTemplateBody,
    META_TEMPLATE_TURNOS_MISMO_DIA
} from '../../services/turnosOnlineService';

const META_OPTION_ID = 'meta_turnos_mismo_dia';
const META_VAR_LABELS = ['{{1}} Nombre del paciente', '{{2}} Fecha de los turnos', '{{3}} Horarios y profesional'];

const DIAS_SEMANA_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DIAS_SEMANA_LARGOS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function formatHumanDate(isoStr, short = false) {
    if (!isoStr || typeof isoStr !== 'string') return isoStr || '';
    const m = isoStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return isoStr;
    const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
    const dayName = short ? DIAS_SEMANA_CORTOS[dt.getDay()] : DIAS_SEMANA_LARGOS[dt.getDay()];
    return short ? `${dayName} ${m[3]}/${m[2]}` : `${dayName} ${m[3]}/${m[2]}/${m[1]}`;
}

function parseMinutesFromTimeStr(timeStr) {
    if (!timeStr) return null;
    const raw = String(timeStr).toLowerCase().trim();
    const isPm = raw.includes('p') && !raw.includes('a');
    const isAm = raw.includes('a') && !raw.includes('p');
    const match = raw.match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    let h = Number(match[1]);
    const min = Number(match[2]);
    if (isPm && h < 12) h += 12;
    if (isAm && h === 12) h = 0;
    return h * 60 + min;
}

function formatHumanTime24(timeStr) {
    const mins = parseMinutesFromTimeStr(timeStr);
    if (mins === null) return timeStr || '';
    const h = String(Math.floor(mins / 60)).padStart(2, '0');
    const m = String(mins % 60).padStart(2, '0');
    return `${h}:${m} hs`;
}

function formatPhoneClean(phone) {
    if (!phone) return '';
    const digits = String(phone).replace(/\D/g, '');
    const local10 = digits.startsWith('549') && digits.length === 13
        ? digits.slice(3)
        : digits.startsWith('54') && digits.length === 12
            ? digits.slice(2)
            : digits;
    if (local10.length === 10) {
        return `${local10.slice(0, 3)} ${local10.slice(3, 6)}-${local10.slice(6)}`;
    }
    return phone;
}

function getUrgencyBadge(isoDate, todayStr) {
    if (!isoDate || !todayStr) return null;
    if (isoDate < todayStr) {
        return { label: 'Fecha pasada', bg: '#F1F5F9', color: '#64748B', border: '#CBD5E1' };
    }
    if (isoDate === todayStr) {
        return { label: '🚨 Hoy', bg: '#FEE2E2', color: '#B91C1C', border: '#FECACA' };
    }
    const d1 = new Date(todayStr + 'T12:00:00');
    const d2 = new Date(isoDate + 'T12:00:00');
    const diffDays = Math.round((d2 - d1) / 86400000);
    if (diffDays === 1) {
        return { label: '⚡ Mañana', bg: '#FFEDD5', color: '#C2410C', border: '#FED7AA' };
    }
    if (diffDays <= 4) {
        return { label: `⏳ En ${diffDays} días`, bg: '#FEF3C7', color: '#B45309', border: '#FDE68A' };
    }
    return { label: `En ${diffDays} días`, bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' };
}

function buildConflictDiagnosis(caso) {
    const turnos = caso?.turnos || [];
    if (turnos.length < 2) return null;
    const t1 = turnos[0];
    const t2 = turnos[turnos.length - 1];

    if (caso.esMismoDia) {
        const m1 = parseMinutesFromTimeStr(t1.horaInicio);
        const m2 = parseMinutesFromTimeStr(t2.horaInicio);
        const diffMin = m1 !== null && m2 !== null ? Math.abs(m2 - m1) : null;
        const diffLabel = diffMin !== null
            ? (diffMin === 0 ? 'en el mismo horario exacto' : `con ${diffMin} min de diferencia (${formatHumanTime24(t1.horaInicio)} y ${formatHumanTime24(t2.horaInicio)})`)
            : `el mismo día (${formatHumanDate(t1.fechaTurno, true)})`;
        return {
            tone: 'danger',
            bg: '#FEF2F2',
            border: '#FECACA',
            color: '#991B1B',
            badge: 'DOBLE RESERVA MISMO DÍA',
            text: `Reservó ${turnos.length} turnos para el ${formatHumanDate(t1.fechaTurno, false)} ${diffLabel}. Probable doble intento web.`,
        };
    }

    const d1 = t1.fechaTurno ? new Date(t1.fechaTurno + 'T12:00:00') : null;
    const d2 = t2.fechaTurno ? new Date(t2.fechaTurno + 'T12:00:00') : null;
    const diffDays = d1 && d2 ? Math.abs(Math.round((d2 - d1) / 86400000)) : null;

    return {
        tone: 'warning',
        bg: '#FFFBEB',
        border: '#FDE68A',
        color: '#92400E',
        badge: 'TURNOS EN DISTINTOS DÍAS',
        text: `Tiene ${turnos.length} turnos activos en fechas diferentes (${formatHumanDate(t1.fechaTurno, true)} y ${formatHumanDate(t2.fechaTurno, true)}${diffDays ? ` · ${diffDays} días de diferencia` : ''}). Probable reprogramación sin anular el turno anterior.`,
    };
}

export default function ContactCenterTurnosOnlineTab({ activeAgent, currentUser, addToast, onOpenChatWithPhone, onConversationStarted, onBackToConsole }) {
    const [loading, setLoading] = useState(false);
    const [filtroDias, setFiltroDias] = useState(1); // 1 = ayer/hoy
    const [fechaCustom, setFechaCustom] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [filtroEstado, setFiltroEstado] = useState('pendiente'); // 'pendiente' por defecto para bandeja Inbox Zero
    const [filtroGravedad, setFiltroGravedad] = useState('todos'); // 'todos' | 'mismo_dia' | 'distinto_dia'
    const [ocultarPasados, setOcultarPasados] = useState(true); // Ocultar automáticamente turnos con fechas transcurridas
    const [showGuiaModal, setShowGuiaModal] = useState(false);
    const [showQuickTips, setShowQuickTips] = useState(true);
    const [inlineNoteDraft, setInlineNoteDraft] = useState('');
    const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
    
    const [stats, setStats] = useState({
        totalTurnosAnalizados: 0,
        totalPacientesConDuplicados: 0,
        totalTurnosEnConflicto: 0,
        totalPendientes: 0,
        totalContactados: 0,
        totalResueltos: 0
    });
    const [casos, setCasos] = useState([]);
    const [expandedKey, setExpandedKey] = useState(null);
    const [viewMode, setViewMode] = useState('split'); // 'split' (Master-Detail por defecto) | 'list' (Acordeón)
    const [inlineVarsMap, setInlineVarsMap] = useState({}); // { [casoKey]: [v1, v2, v3] }
    const [inlineSendingKey, setInlineSendingKey] = useState(null);
    const [copiedText, setCopiedText] = useState(null);

    const handleCopyQuick = (e, text, label = 'Copiado') => {
        if (e) e.stopPropagation();
        if (!text) return;
        navigator.clipboard?.writeText(String(text));
        setCopiedText(String(text));
        if (addToast) addToast(`${label}: ${text}`, 'info');
        setTimeout(() => setCopiedText(null), 1800);
    };

    // Modal de Envío de WhatsApp
    const [modalData, setModalData] = useState(null); // { caso, plantilla, texto, sending }
    const [savingKey, setSavingKey] = useState(null);

    // 1. Cargar turnos desde SALUS
    const [syncStatus, setSyncStatus] = useState(null); // 'idle', 'syncing', 'success', 'error'
    const [loadError, setLoadError] = useState(null);

    const loadData = async (days = filtroDias, customDate = fechaCustom, forceSync = false) => {
        setLoading(true);
        if (forceSync) setSyncStatus('syncing');
        try {
            const res = await fetchTurnosOnlineDuplicados({
                days,
                date: customDate || null,
                forceSync
            });

            if (res && res.success && Array.isArray(res.casos)) {
                setLoadError(null);
                setStats(res.stats || { totalPacientesConDuplicados: 0, totalTurnosEnConflicto: 0, totalPendientes: 0, totalContactados: 0, totalResueltos: 0 });
                setCasos(res.casos || []);
                if (forceSync) {
                    setSyncStatus('success');
                    if (addToast) addToast('Sincronizado y reconciliado con SALUS', 'success');
                }
                // Si había uno expandido que ya no existe, limpiamos
                if (expandedKey && !res.casos?.some(c => c.key === expandedKey)) {
                    setExpandedKey(null);
                }
            } else {
                const errMsg = res?.error || 'Demora de red al consultar turnos online. Reintentando automáticamente...';
                setLoadError(errMsg);
                if (forceSync) {
                    setSyncStatus('error');
                    if (addToast) addToast(errMsg, 'error');
                }
                // Auto-reintento rápido en 2.5s si aún no tenemos datos cargados
                setTimeout(() => {
                    fetchTurnosOnlineDuplicados({ days, date: customDate || null, forceSync: false })
                        .then(retryRes => {
                            if (retryRes && retryRes.success && Array.isArray(retryRes.casos)) {
                                setLoadError(null);
                                setStats(retryRes.stats || { totalPacientesConDuplicados: 0, totalTurnosEnConflicto: 0, totalPendientes: 0, totalContactados: 0, totalResueltos: 0 });
                                setCasos(retryRes.casos || []);
                            }
                        })
                        .catch(() => {});
                }, 2500);
            }
        } catch (err) {
            console.error('Error cargando turnos online:', err);
            setLoadError('Demora de conexión con el servidor. Reintentando...');
            if (forceSync) {
                setSyncStatus('error');
                if (addToast) addToast('No se pudo conectar con el servidor de sincronización SALUS', 'error');
            }
        } finally {
            setLoading(false);
            if (forceSync) setTimeout(() => setSyncStatus(null), 3000);
        }
    };

    useEffect(() => {
        loadData(filtroDias, fechaCustom);
        // Auto-refresco en segundo plano cada 2 minutos
        const interval = setInterval(() => {
            loadData(filtroDias, fechaCustom);
        }, 120000);
        return () => clearInterval(interval);
    }, [filtroDias, fechaCustom]);

    // 2. Filtrado y ordenamiento inteligente de casos (Urgentes / Mismo Día y fecha más próxima primero)
    const casosFiltrados = useMemo(() => {
        const list = casos.filter(c => {
            // Filtro de estado
            if (filtroEstado !== 'todos' && c.gestion.estado !== filtroEstado) {
                return false;
            }

            // Filtro de gravedad (Mismo Día vs Distinto Día)
            if (filtroGravedad === 'mismo_dia' && !c.esMismoDia) return false;
            if (filtroGravedad === 'distinto_dia' && c.esMismoDia) return false;

            // Ocultar turnos cuya fecha ya pasó (si está activo el toggle y no hay término de búsqueda manual)
            if (ocultarPasados && !searchTerm.trim() && filtroEstado === 'pendiente') {
                const fechas = (c.turnos || []).map(t => t.fechaTurno).filter(Boolean);
                const todosPasados = fechas.length > 0 && fechas.every(f => f < todayStr);
                if (todosPasados) return false;
            }

            // Filtro de búsqueda
            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase().trim();
                const matchDni = c.dni.includes(term);
                const matchNombre = c.nombre.toLowerCase().includes(term);
                const matchProf = c.profesional.toLowerCase().includes(term);
                const matchAgenda = c.agenda.toLowerCase().includes(term);
                if (!matchDni && !matchNombre && !matchProf && !matchAgenda) return false;
            }
            return true;
        });

        // Ordenar: 1) Mismo Día primero, 2) Fecha de turno más cercana primero
        return [...list].sort((a, b) => {
            if (Boolean(a.esMismoDia) !== Boolean(b.esMismoDia)) {
                return a.esMismoDia ? -1 : 1;
            }
            const nextA = (a.turnos || []).map(t => t.fechaTurno).filter(Boolean).sort()[0] || '9999-99-99';
            const nextB = (b.turnos || []).map(t => t.fechaTurno).filter(Boolean).sort()[0] || '9999-99-99';
            return nextA.localeCompare(nextB);
        });
    }, [casos, filtroEstado, filtroGravedad, searchTerm, ocultarPasados, todayStr]);

    // Caso activo en Split View (mantiene selección o toma el primero de la lista filtrada)
    const selectedCaso = useMemo(() => {
        if (!casosFiltrados.length) return null;
        if (expandedKey) {
            const found = casosFiltrados.find(c => c.key === expandedKey);
            if (found) return found;
        }
        return casosFiltrados[0];
    }, [casosFiltrados, expandedKey]);

    useEffect(() => {
        setInlineNoteDraft(selectedCaso?.gestion?.notas || '');
    }, [selectedCaso?.key, selectedCaso?.gestion?.notas]);

    // Variables editables en el panel derecho del Split View para el caso seleccionado
    const currentInlineVars = useMemo(() => {
        if (!selectedCaso) return ['', '', ''];
        return inlineVarsMap[selectedCaso.key] || buildVariablesTurnosMismoDia(selectedCaso);
    }, [selectedCaso, inlineVarsMap]);

    const handleSendInlineWhatsapp = async (casoTarget) => {
        if (!casoTarget || inlineSendingKey) return;
        const vars = inlineVarsMap[casoTarget.key] || buildVariablesTurnosMismoDia(casoTarget);
        if (vars.some(v => !String(v || '').trim())) {
            if (addToast) addToast('Completá las 3 variables de la plantilla antes de enviar.', 'error');
            return;
        }

        setInlineSendingKey(casoTarget.key);
        try {
            const nowIso = new Date().toISOString();
            const agentLabel = activeAgent?.fullName || activeAgent?.name || currentUser?.nombre || 'Agente';
            const agentId = activeAgent?.id || 'daniela';

            const res = await sendTemplateTurnosMismoDia({
                caso: casoTarget,
                variables: vars,
                agente: activeAgent
            });

            setCasos(prev => prev.map(c => c.key === casoTarget.key
                ? {
                    ...c,
                    gestion: {
                        ...c.gestion,
                        estado: 'contactado',
                        agenteId: agentId,
                        agenteNombre: agentLabel,
                        fechaContacto: nowIso,
                        updatedAt: nowIso
                    }
                }
                : c));

            setStats(prev => {
                const prevEstado = casoTarget.gestion?.estado;
                if (prevEstado === 'contactado') return prev;
                return {
                    ...prev,
                    totalPendientes: Math.max(0, prev.totalPendientes - (prevEstado === 'pendiente' ? 1 : 0)),
                    totalContactados: prev.totalContactados + 1
                };
            });

            if (addToast) addToast(`Aviso enviado a ${casoTarget.nombre}. El chat quedó asociado a ${agentLabel} en Mis Chats.`, 'success');
            if (onConversationStarted) {
                onConversationStarted(res.phone, {
                    caso: casoTarget,
                    agente: activeAgent,
                    displayContent: res.displayContent
                });
            }
        } catch (err) {
            console.error('Error enviando WhatsApp desde Split View:', err);
            if (addToast) addToast(err.message || 'Error al enviar WhatsApp', 'error');
        } finally {
            setInlineSendingKey(null);
        }
    };

    // 3. Manejar cambio de estado de gestión
    const handleUpdateEstado = async (caso, nuevoEstado, notaText = null) => {
        setSavingKey(caso.key);
        try {
            const res = await saveGestionTurnoOnline({
                key: caso.key,
                estado: nuevoEstado,
                agenteId: activeAgent?.id,
                agenteNombre: activeAgent?.fullName || activeAgent?.name,
                notas: notaText !== null ? notaText : caso.gestion.notas
            });

            if (res.success) {
                setCasos(prev => prev.map(c => c.key === caso.key ? { ...c, gestion: { ...c.gestion, ...res.gestion } } : c));
                // Recalcular stats locales
                setStats(prev => {
                    const prevEstado = caso.gestion.estado;
                    const nextEstado = res.gestion.estado;
                    if (prevEstado === nextEstado) return prev;
                    return {
                        ...prev,
                        totalPendientes: Math.max(0, prev.totalPendientes + (nextEstado === 'pendiente' ? 1 : prevEstado === 'pendiente' ? -1 : 0)),
                        totalContactados: Math.max(0, prev.totalContactados + (nextEstado === 'contactado' ? 1 : prevEstado === 'contactado' ? -1 : 0)),
                        totalResueltos: Math.max(0, prev.totalResueltos + (nextEstado === 'resuelto' ? 1 : prevEstado === 'resuelto' ? -1 : 0)),
                    };
                });
                if (addToast) addToast(`Caso actualizado a "${nuevoEstado}"`, 'success');
            }
        } catch (err) {
            console.error('Error guardando estado:', err);
            if (addToast) addToast('Error al actualizar el estado', 'error');
        } finally {
            setSavingKey(null);
        }
    };

    // 4. Abrir modal de WhatsApp con plantilla oficial de Meta
    const handleOpenWhatsappModal = (caso) => {
        setModalData({
            caso,
            plantillaId: META_OPTION_ID,
            metaVars: buildVariablesTurnosMismoDia(caso),
            texto: '',
            sending: false
        });
    };

    const isMetaSelected = true;
    const canSendModal = modalData && !modalData.sending && (
        isMetaSelected
            ? (modalData.metaVars || []).every(v => String(v || '').trim())
            : Boolean(modalData.texto?.trim())
    );

    // 6. Enviar mensaje de WhatsApp
    const handleConfirmSendWhatsapp = async () => {
        if (!modalData) return;
        const { caso, texto } = modalData;

        setModalData(prev => ({ ...prev, sending: true }));
        try {
            const nowIso = new Date().toISOString();
            const agentLabel = activeAgent?.fullName || activeAgent?.name || currentUser?.nombre || 'Agente';
            const agentId = activeAgent?.id || 'daniela';

            if (modalData.plantillaId === META_OPTION_ID) {
                const res = await sendTemplateTurnosMismoDia({
                    caso,
                    variables: modalData.metaVars,
                    agente: activeAgent
                });
                setCasos(prev => prev.map(c => c.key === caso.key
                    ? {
                        ...c,
                        gestion: {
                            ...c.gestion,
                            estado: 'contactado',
                            agenteId: agentId,
                            agenteNombre: agentLabel,
                            fechaContacto: nowIso,
                            updatedAt: nowIso
                        }
                    }
                    : c));
                setStats(prev => {
                    const prevEstado = caso.gestion?.estado;
                    if (prevEstado === 'contactado') return prev;
                    return {
                        ...prev,
                        totalPendientes: Math.max(0, prev.totalPendientes - (prevEstado === 'pendiente' ? 1 : 0)),
                        totalContactados: prev.totalContactados + 1
                    };
                });
                if (addToast) addToast(`Aviso enviado a ${caso.nombre}. El chat quedó asociado a ${agentLabel} en Mis Chats.`, 'success');
                setModalData(null);
                if (onConversationStarted) {
                    onConversationStarted(res.phone, {
                        caso,
                        agente: activeAgent,
                        displayContent: res.displayContent
                    });
                }
                return;
            }

            const res = await sendWhatsappAvisoTurno({
                phone: caso.telefono,
                text: texto,
                agente: activeAgent,
                pacienteNombre: caso.nombre,
                pacienteDni: caso.dni,
                casoKey: caso.key
            });

            // Actualizar estado a "contactado"
            await handleUpdateEstado(caso, 'contactado', `Plantilla enviada por ${agentLabel}: "${modalData.plantillaId}"`);

            if (addToast) addToast(`Mensaje de WhatsApp enviado a ${caso.nombre} y asociado a ${agentLabel}`, 'success');
            setModalData(null);
            if (onConversationStarted && res?.phone) {
                onConversationStarted(res.phone, {
                    caso,
                    agente: activeAgent,
                    displayContent: res.displayContent || texto
                });
            }
        } catch (err) {
            console.error('Error enviando WhatsApp:', err);
            if (addToast) addToast(err.message || 'Error al enviar WhatsApp', 'error');
            setModalData(prev => ({ ...prev, sending: false }));
        }
    };

    const totalCasosActivos = casos.length;
    const totalMismoDia = useMemo(() => casos.filter(c => c.esMismoDia).length, [casos]);
    const totalDistintoDia = useMemo(() => casos.filter(c => !c.esMismoDia).length, [casos]);
    const progresoPct = useMemo(() => {
        if (!totalCasosActivos) return 100;
        const gestionados = (stats.totalContactados || 0) + (stats.totalResueltos || 0);
        return Math.min(100, Math.round((gestionados / totalCasosActivos) * 100));
    }, [totalCasosActivos, stats.totalContactados, stats.totalResueltos]);

    return (
        <div style={{ padding: '16px 22px', maxWidth: '1460px', margin: '0 auto' }}>
            
            {/* ═══ HEADER DE AUDITORÍA, PROGRESO INBOX ZERO Y FILTROS ═══ */}
            <div style={{
                background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                borderRadius: '18px',
                padding: '16px 24px 0 22px',
                border: '1.5px solid #E2E8F0',
                boxShadow: '0 2px 12px rgba(15, 23, 42, 0.04)',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'stretch',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px',
                position: 'relative',
                overflow: 'hidden'
            }}>
                <div style={{
                    flex: '1 1 540px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: '12px',
                    paddingBottom: '16px',
                    zIndex: 1
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '3px' }}>
                                <div style={{
                                    width: '36px', height: '36px', borderRadius: '10px',
                                    background: '#FEE2E2', color: '#DC2626',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <ShieldAlert size={20} />
                                </div>
                                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>
                                    Auditoría de Turnos Online Duplicados
                                </h2>
                            </div>
                            <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748B' }}>
                                Detección automática de pacientes con múltiples turnos para el mismo prestador y gestión vía WhatsApp.
                            </p>
                        </div>

                        {/* Mini Panel de Progreso Inbox Zero */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            background: '#FFFFFF',
                            border: '1px solid #E2E8F0',
                            borderRadius: '12px',
                            padding: '8px 14px',
                            boxShadow: '0 1px 4px rgba(15, 23, 42, 0.03)'
                        }}>
                            <div style={{ minWidth: '135px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>
                                    <span>Avance del período</span>
                                    <span style={{ color: '#059669' }}>{progresoPct}%</span>
                                </div>
                                <div style={{ width: '100%', height: '6px', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${progresoPct}%`,
                                        height: '100%',
                                        background: 'linear-gradient(90deg, #3B82F6 0%, #10B981 100%)',
                                        transition: 'width 0.3s ease'
                                    }} />
                                </div>
                            </div>
                            <div style={{ width: '1px', height: '26px', background: '#E2E8F0' }} />
                            <div style={{ display: 'flex', gap: '10px', fontSize: '0.73rem', fontWeight: 700 }}>
                                <span style={{ color: '#B91C1C', background: '#FEF2F2', padding: '3px 8px', borderRadius: '6px', border: '1px solid #FECACA' }}>
                                    🔴 {totalMismoDia} Mismo día
                                </span>
                                <span style={{ color: '#B45309', background: '#FFFBEB', padding: '3px 8px', borderRadius: '6px', border: '1px solid #FDE68A' }}>
                                    🗓️ {totalDistintoDia} Distinto día
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Filtros temporales, sincronización en vivo y navegación */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {onBackToConsole && (
                            <button
                                onClick={onBackToConsole}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '6px 12px',
                                    borderRadius: '9px',
                                    border: '1.5px solid #CBD5E1',
                                    background: '#FFFFFF',
                                    color: '#334155',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                }}
                                title="Volver a la consola de chats de Contact Center"
                            >
                                <ArrowLeft size={14} />
                                Volver a Chats
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={() => setShowGuiaModal(true)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 12px',
                                borderRadius: '9px',
                                border: '1.5px solid #BFDBFE',
                                background: '#EFF6FF',
                                color: '#1E40AF',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                            }}
                            title="Ver guía operativa paso a paso para operadoras"
                        >
                            <BookOpen size={14} />
                            Ver Instructivo Completo
                        </button>

                        <div style={{
                            display: 'flex',
                            background: '#F1F5F9',
                            borderRadius: '10px',
                            padding: '3px',
                            border: '1px solid #CBD5E1'
                        }}>
                            <button
                                onClick={() => { setFiltroDias(1); setFechaCustom(''); }}
                                style={{
                                    padding: '5px 12px', borderRadius: '7px', border: 'none',
                                    fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                                    background: filtroDias === 1 && !fechaCustom ? '#0F2942' : 'transparent',
                                    color: filtroDias === 1 && !fechaCustom ? '#FFFFFF' : '#475569',
                                    transition: 'all 0.15s'
                                }}
                            >
                                Ayer (Día -1)
                            </button>
                            <button
                                onClick={() => { setFiltroDias(2); setFechaCustom(''); }}
                                style={{
                                    padding: '5px 12px', borderRadius: '7px', border: 'none',
                                    fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                                    background: filtroDias === 2 && !fechaCustom ? '#0F2942' : 'transparent',
                                    color: filtroDias === 2 && !fechaCustom ? '#FFFFFF' : '#475569',
                                    transition: 'all 0.15s'
                                }}
                            >
                                Últimas 48 hs
                            </button>
                            <button
                                onClick={() => { setFiltroDias(7); setFechaCustom(''); }}
                                style={{
                                    padding: '5px 12px', borderRadius: '7px', border: 'none',
                                    fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                                    background: filtroDias === 7 && !fechaCustom ? '#0F2942' : 'transparent',
                                    color: filtroDias === 7 && !fechaCustom ? '#FFFFFF' : '#475569',
                                    transition: 'all 0.15s'
                                }}
                            >
                                Últimos 7 días
                            </button>
                        </div>

                        <button
                            type="button"
                            disabled={loading || syncStatus === 'syncing'}
                            onClick={() => loadData(filtroDias, fechaCustom, true)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 12px',
                                borderRadius: '9px',
                                border: '1.5px solid #A7F3D0',
                                background: '#ECFDF5',
                                color: '#047857',
                                fontSize: '0.78rem',
                                fontWeight: 800,
                                cursor: loading ? 'wait' : 'pointer',
                                transition: 'all 0.15s',
                            }}
                            title="Volver a consultar la agenda SALUS en vivo para verificar si ya se anuló o reprogramó el turno"
                        >
                            <RefreshCw size={14} style={{ animation: (loading || syncStatus === 'syncing') ? 'spin 1s linear infinite' : 'none' }} />
                            {syncStatus === 'syncing' ? 'Sincronizando SALUS...' : 'Sincronizar SALUS'}
                        </button>
                    </div>
                </div>

                {/* Ilustración Dr. Beto — Turnos Online (Sin Fondo) */}
                <div style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    marginTop: '-10px',
                    marginRight: '4px',
                    pointerEvents: 'none',
                    userSelect: 'none'
                }}>
                    <img
                        src="/turnos-online-beto.png"
                        alt="Dr. Beto - Turnos Online"
                        style={{
                            height: '118px',
                            width: 'auto',
                            objectFit: 'contain',
                            objectPosition: 'bottom center',
                            display: 'block',
                            filter: 'drop-shadow(0 6px 14px rgba(15, 41, 66, 0.14))'
                        }}
                    />
                </div>
            </div>

            {/* ═══ BARRA DE BÚSQUEDA, FILTRO DE GRAVEDAD Y FILTRO DE ESTADO ═══ */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
                marginBottom: '14px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {/* Input de Búsqueda */}
                    <div style={{
                        position: 'relative',
                        width: '300px',
                        maxWidth: '100%'
                    }}>
                        <Search size={16} style={{
                            position: 'absolute',
                            left: '11px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: '#94A3B8'
                        }} />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Buscar por DNI, paciente o médico..."
                            style={{
                                width: '100%',
                                padding: '8px 12px 8px 34px',
                                borderRadius: '10px',
                                border: '1.5px solid #CBD5E1',
                                fontSize: '0.82rem',
                                outline: 'none',
                                background: '#FFFFFF',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    {/* Filtro Rápido por Tipo de Conflicto (Mismo Día vs Distinto Día) */}
                    <div style={{
                        display: 'flex',
                        background: '#FFFFFF',
                        borderRadius: '10px',
                        padding: '3px',
                        border: '1.5px solid #CBD5E1'
                    }}>
                        {[
                            { id: 'todos', label: 'Todos los tipos' },
                            { id: 'mismo_dia', label: '🔴 Mismo Día' },
                            { id: 'distinto_dia', label: '🗓️ Distinto Día' },
                        ].map(g => (
                            <button
                                key={g.id}
                                type="button"
                                onClick={() => setFiltroGravedad(g.id)}
                                style={{
                                    padding: '5px 10px', borderRadius: '7px', border: 'none',
                                    fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer',
                                    background: filtroGravedad === g.id ? '#EFF6FF' : 'transparent',
                                    color: filtroGravedad === g.id ? '#1D4ED8' : '#64748B',
                                    transition: 'all 0.15s'
                                }}
                            >
                                {g.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Filtro por estado y toggle de fechas pasadas */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{
                        display: 'flex',
                        background: '#FFFFFF',
                        borderRadius: '10px',
                        padding: '3px',
                        border: '1.5px solid #CBD5E1'
                    }}>
                        {[
                            { id: 'pendiente', label: 'Pendientes', count: stats.totalPendientes },
                            { id: 'contactado', label: 'Contactados', count: stats.totalContactados },
                            { id: 'resuelto', label: 'Resueltos', count: stats.totalResueltos },
                            { id: 'todos', label: 'Todos', count: casos.length },
                        ].map(f => (
                            <button
                                key={f.id}
                                onClick={() => setFiltroEstado(f.id)}
                                style={{
                                    padding: '5px 12px', borderRadius: '7px', border: 'none',
                                    fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                                    background: filtroEstado === f.id ? '#0F2942' : 'transparent',
                                    color: filtroEstado === f.id ? '#FFFFFF' : '#64748B',
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    transition: 'all 0.15s'
                                }}
                            >
                                {f.label}
                                <span style={{
                                    background: filtroEstado === f.id ? 'rgba(255,255,255,0.2)' : '#F1F5F9',
                                    color: filtroEstado === f.id ? '#FFFFFF' : '#64748B',
                                    fontSize: '0.68rem', padding: '1px 6px', borderRadius: '8px'
                                }}>
                                    {f.count}
                                </span>
                            </button>
                        ))}
                    </div>

                    {filtroEstado === 'pendiente' && (
                        <button
                            type="button"
                            onClick={() => setOcultarPasados(prev => !prev)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '6px 11px',
                                borderRadius: '9px',
                                border: '1px solid #CBD5E1',
                                background: ocultarPasados ? '#EFF6FF' : '#FFFFFF',
                                color: ocultarPasados ? '#1D4ED8' : '#64748B',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.15s'
                            }}
                            title="Oculta o muestra casos donde todas las fechas de los turnos ya transcurrieron"
                        >
                            <Calendar size={13} />
                            {ocultarPasados ? 'Ocultando fechas pasadas' : 'Mostrando todas las fechas'}
                        </button>
                    )}

                    {/* Selector de Vista: Split View (Master-Detail) vs Lista */}
                    <div style={{
                        display: 'flex',
                        background: '#FFFFFF',
                        borderRadius: '9px',
                        padding: '3px',
                        border: '1.5px solid #CBD5E1'
                    }}>
                        <button
                            type="button"
                            onClick={() => setViewMode('split')}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '5px 10px',
                                borderRadius: '6px',
                                border: 'none',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                background: viewMode === 'split' ? '#0F2942' : 'transparent',
                                color: viewMode === 'split' ? '#FFFFFF' : '#64748B',
                                transition: 'all 0.15s'
                            }}
                            title="Vista dividida (Lista a la izquierda + Detalle y envío a la derecha)"
                        >
                            <Columns size={13} />
                            Split View
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('list')}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '5px 10px',
                                borderRadius: '6px',
                                border: 'none',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                background: viewMode === 'list' ? '#0F2942' : 'transparent',
                                color: viewMode === 'list' ? '#FFFFFF' : '#64748B',
                                transition: 'all 0.15s'
                            }}
                            title="Vista en lista desplegable"
                        >
                            <List size={13} />
                            Lista
                        </button>
                    </div>
                </div>
            </div>

            {/* ═══ LISTADO DE PACIENTES CON INCONSISTENCIAS ═══ */}
            {loading && casos.length === 0 ? (
                <div style={{
                    background: '#FFFFFF', borderRadius: '20px', padding: '48px 24px',
                    textAlign: 'center', border: '1.5px solid #E2E8F0'
                }}>
                    <RefreshCw size={36} style={{ animation: 'spin 1s linear infinite', color: '#1565C0', marginBottom: '12px' }} />
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>
                        Analizando agendas y turnos en SALUS...
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748B' }}>
                        Extrayendo comentarios estructurados y cruzando pacientes con turnos duplicados.
                    </p>
                </div>
            ) : loadError && casos.length === 0 ? (
                <div style={{
                    background: '#FFFBEB', borderRadius: '20px', padding: '42px 24px',
                    textAlign: 'center', border: '1.5px solid #FDE68A'
                }}>
                    <RefreshCw size={38} style={{ color: '#D97706', marginBottom: '12px' }} />
                    <div style={{ fontSize: '1.12rem', fontWeight: 800, color: '#92400E' }}>
                        Demora temporal de conexión con la base de datos
                    </div>
                    <p style={{ margin: '6px auto 16px', fontSize: '0.86rem', color: '#B45309', maxWidth: '520px' }}>
                        {loadError}
                    </p>
                    <button
                        type="button"
                        onClick={() => loadData(filtroDias, fechaCustom, false)}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '8px',
                            padding: '9px 18px', borderRadius: '10px', border: 'none',
                            background: '#0F2942', color: '#FFFFFF', fontSize: '0.84rem',
                            fontWeight: 700, cursor: 'pointer'
                        }}
                    >
                        <RefreshCw size={15} />
                        Reintentar ahora
                    </button>
                </div>
            ) : casosFiltrados.length === 0 ? (
                <div style={{
                    background: '#FFFFFF', borderRadius: '20px', padding: '48px 24px',
                    textAlign: 'center', border: '1.5px solid #E2E8F0'
                }}>
                    <CheckCircle2 size={44} style={{ color: '#10B981', marginBottom: '12px' }} />
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0F172A' }}>
                        ¡Sin inconsistencias pendientes!
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: '0.88rem', color: '#64748B' }}>
                        No se detectaron pacientes con turnos duplicados para los filtros seleccionados.
                    </p>
                </div>
            ) : viewMode === 'split' ? (
                /* ═════════════════════════════════════════════════════════════════ */
                /* MODO SPLIT VIEW (BANDEJA IZQUIERDA + CONSOLA DE AUDITORÍA DERECHA) */
                /* ═════════════════════════════════════════════════════════════════ */
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(340px, 395px) minmax(0, 1fr)',
                    gap: '16px',
                    alignItems: 'start'
                }}>
                    {/* COLUMNA IZQUIERDA: LISTA DE PACIENTES EN CONFLICTO */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        maxHeight: 'calc(100vh - 210px)',
                        overflowY: 'auto',
                        paddingRight: '4px'
                    }}>
                        {casosFiltrados.map(caso => {
                            const isSelected = selectedCaso?.key === caso.key;
                            const isPendiente = caso.gestion.estado === 'pendiente';
                            const isContactado = caso.gestion.estado === 'contactado';
                            const isResuelto = caso.gestion.estado === 'resuelto';
                            const proximoTurno = (caso.turnos || [])[0] || null;
                            const urgencia = proximoTurno ? getUrgencyBadge(proximoTurno.fechaTurno, todayStr) : null;

                            return (
                                <div
                                    key={caso.key}
                                    onClick={() => setExpandedKey(caso.key)}
                                    style={{
                                        background: isSelected ? '#F0F9FF' : '#FFFFFF',
                                        borderRadius: '14px',
                                        border: isSelected ? '2px solid #0284C7' : '1px solid #E2E8F0',
                                        borderLeft: caso.esMismoDia ? '4px solid #EF4444' : isResuelto ? '4px solid #10B981' : isContactado ? '4px solid #3B82F6' : '4px solid #F59E0B',
                                        padding: '11px 13px',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                        boxShadow: isSelected ? '0 6px 16px rgba(2, 132, 199, 0.12)' : '0 1px 2px rgba(15, 23, 42, 0.03)'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
                                            <div style={{
                                                width: '32px', height: '32px', borderRadius: '8px',
                                                background: isSelected ? '#0284C7' : isResuelto ? '#ECFDF5' : isContactado ? '#EFF6FF' : '#F1F5F9',
                                                color: isSelected ? '#FFFFFF' : isResuelto ? '#059669' : isContactado ? '#1D4ED8' : '#334155',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontWeight: 800, fontSize: '0.84rem', flexShrink: 0
                                            }}>
                                                {caso.nombre[0] || 'P'}
                                            </div>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{
                                                    fontSize: '0.85rem', fontWeight: 800, color: '#0F172A',
                                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                                                }}>
                                                    {caso.nombre}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                                                    <span
                                                        onClick={(e) => handleCopyQuick(e, caso.dni, 'DNI copiado')}
                                                        title="Clic para copiar DNI"
                                                        style={{
                                                            fontSize: '0.67rem', fontWeight: 700,
                                                            background: copiedText === String(caso.dni) ? '#DCFCE7' : '#F1F5F9',
                                                            color: copiedText === String(caso.dni) ? '#15803D' : '#475569',
                                                            padding: '1px 6px', borderRadius: '5px',
                                                            border: '1px solid #E2E8F0', fontFamily: 'monospace',
                                                            display: 'inline-flex', alignItems: 'center', gap: '3px'
                                                        }}
                                                    >
                                                        DNI {caso.dni}
                                                        <Copy size={9} />
                                                    </span>
                                                    {caso.telefono && (
                                                        <span
                                                            onClick={(e) => handleCopyQuick(e, caso.telefono, 'Teléfono copiado')}
                                                            title="Clic para copiar teléfono"
                                                            style={{ fontSize: '0.67rem', color: '#475569', fontWeight: 600 }}
                                                        >
                                                            📞 {formatPhoneClean(caso.telefono)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Estado compacto */}
                                        <span style={{
                                            fontSize: '0.65rem', fontWeight: 800, padding: '2px 7px', borderRadius: '6px',
                                            background: isPendiente ? '#FFFBEB' : isContactado ? '#EFF6FF' : '#ECFDF5',
                                            color: isPendiente ? '#92400E' : isContactado ? '#1E40AF' : '#065F46',
                                            border: `1px solid ${isPendiente ? '#FDE68A' : isContactado ? '#BFDBFE' : '#A7F3D0'}`,
                                            flexShrink: 0
                                        }}>
                                            {isPendiente ? 'Pendiente' : isContactado ? 'Contactado' : 'Resuelto'}
                                        </span>
                                    </div>

                                    {/* Fila intermedia: Fecha del próximo turno y urgencia */}
                                    {proximoTurno && (
                                        <div style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            marginTop: '7px', gap: '6px', flexWrap: 'wrap'
                                        }}>
                                            <span style={{
                                                fontSize: '0.7rem', fontWeight: 700, color: '#1E3A8A',
                                                background: '#EFF6FF', padding: '2px 7px', borderRadius: '5px',
                                                border: '1px solid #DBEAFE', display: 'inline-flex', alignItems: 'center', gap: '4px'
                                            }}>
                                                📅 {formatHumanDate(proximoTurno.fechaTurno, true)} · {formatHumanTime24(proximoTurno.horaInicio)}
                                            </span>
                                            {urgencia && (
                                                <span style={{
                                                    fontSize: '0.64rem', fontWeight: 800, padding: '1px 6px',
                                                    borderRadius: '5px', background: urgencia.bg, color: urgencia.color,
                                                    border: `1px solid ${urgencia.border}`
                                                }}>
                                                    {urgencia.label}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    <div style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        marginTop: '7px', paddingTop: '6px', borderTop: '1px dashed #E2E8F0', gap: '6px'
                                    }}>
                                        <div style={{
                                            fontSize: '0.73rem', fontWeight: 700, color: '#0F2942',
                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                                        }}>
                                            Dr/a. {caso.profesional}
                                        </div>

                                        <div style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                                            padding: '2px 7px', borderRadius: '6px',
                                            background: caso.esMismoDia ? '#FEF2F2' : '#F8FAFC',
                                            border: `1px solid ${caso.esMismoDia ? '#FECACA' : '#E2E8F0'}`,
                                            fontSize: '0.67rem', fontWeight: 800,
                                            color: caso.esMismoDia ? '#991B1B' : '#334155', flexShrink: 0
                                        }}>
                                            <span>{caso.cantidadTurnos} turnos</span>
                                            {caso.esMismoDia ? (
                                                <span style={{
                                                    background: '#EF4444', color: '#FFFFFF',
                                                    fontSize: '0.57rem', padding: '1px 4px', borderRadius: '3px',
                                                    textTransform: 'uppercase'
                                                }}>
                                                    Mismo Día
                                                </span>
                                            ) : (
                                                <span style={{
                                                    background: '#F59E0B', color: '#FFFFFF',
                                                    fontSize: '0.57rem', padding: '1px 4px', borderRadius: '3px',
                                                    textTransform: 'uppercase'
                                                }}>
                                                    Distinto Día
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* COLUMNA DERECHA: PANEL DE DETALLE, COMPARADOR DE TURNOS Y DESPACHO WHATSAPP EN 2 COLUMNAS */}
                    {selectedCaso && (() => {
                        const isPendiente = selectedCaso.gestion.estado === 'pendiente';
                        const isContactado = selectedCaso.gestion.estado === 'contactado';
                        const isResuelto = selectedCaso.gestion.estado === 'resuelto';
                        const isSendingInline = inlineSendingKey === selectedCaso.key;
                        const diagnosis = buildConflictDiagnosis(selectedCaso);

                        return (
                            <div style={{
                                background: '#FFFFFF',
                                borderRadius: '18px',
                                border: '1.5px solid #CBD5E1',
                                boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
                                padding: '18px 20px',
                                position: 'sticky',
                                top: '12px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '14px'
                            }}>
                                {/* 1. Cabecera del Caso Seleccionado + Stepper Guiado de 3 Pasos */}
                                <div style={{
                                    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                                    flexWrap: 'wrap', gap: '12px', paddingBottom: '12px', borderBottom: '1px solid #E2E8F0'
                                }}>
                                    <div style={{ flex: '1 1 360px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            <h3 style={{ margin: 0, fontSize: '1.14rem', fontWeight: 900, color: '#0F172A' }}>
                                                {selectedCaso.nombre}
                                            </h3>
                                            <button
                                                type="button"
                                                onClick={(e) => handleCopyQuick(e, selectedCaso.dni, 'DNI copiado para SALUS')}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                                                    fontSize: '0.76rem', fontWeight: 800, fontFamily: 'monospace',
                                                    background: copiedText === String(selectedCaso.dni) ? '#DCFCE7' : '#EFF6FF',
                                                    color: copiedText === String(selectedCaso.dni) ? '#15803D' : '#1D4ED8',
                                                    border: '1px solid #BFDBFE', borderRadius: '7px', padding: '2px 8px',
                                                    cursor: 'pointer'
                                                }}
                                                title="Copiar DNI para buscar en SALUS"
                                            >
                                                DNI {selectedCaso.dni}
                                                <Copy size={11} />
                                            </button>
                                            {selectedCaso.esMismoDia ? (
                                                <span style={{
                                                    background: '#FEE2E2', color: '#B91C1C', border: '1px solid #FECACA',
                                                    fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px'
                                                }}>
                                                    ⚠️ {selectedCaso.cantidadTurnos} TURNOS EL MISMO DÍA
                                                </span>
                                            ) : (
                                                <span style={{
                                                    background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A',
                                                    fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px'
                                                }}>
                                                    🗓️ {selectedCaso.cantidadTurnos} TURNOS EN DISTINTO DÍA
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.82rem', color: '#334155', marginTop: '4px', fontWeight: 700 }}>
                                            Dr/a. {selectedCaso.profesional} <span style={{ color: '#94A3B8', fontWeight: 500 }}>• Agenda: {selectedCaso.agenda}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '5px', flexWrap: 'wrap', fontSize: '0.78rem', color: '#475569' }}>
                                            <span
                                                onClick={(e) => handleCopyQuick(e, selectedCaso.telefono, 'Teléfono copiado')}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: 700, color: '#0F172A' }}
                                                title="Clic para copiar teléfono"
                                            >
                                                <Phone size={13} color="#0284C7" />
                                                {formatPhoneClean(selectedCaso.telefono) || 'Sin teléfono'}
                                                <Copy size={10} color="#64748B" />
                                            </span>
                                            {selectedCaso.email && (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <Mail size={13} color="#0284C7" />
                                                    {selectedCaso.email}
                                                </span>
                                            )}
                                            {selectedCaso.gestion.updatedAt && (
                                                <span style={{ fontSize: '0.72rem', color: '#64748B', background: '#F8FAFC', padding: '2px 8px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                                                    Última gestión: {new Date(selectedCaso.gestion.updatedAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} por <strong>{selectedCaso.gestion.agenteNombre || 'Agente'}</strong>
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Stepper Guiado de Estado SALUS (1 -> 2 -> 3) */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap',
                                        background: '#F8FAFC', padding: '4px', borderRadius: '10px', border: '1px solid #E2E8F0'
                                    }}>
                                        <button
                                            disabled={savingKey === selectedCaso.key}
                                            onClick={() => handleUpdateEstado(selectedCaso, 'pendiente')}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                padding: '5px 10px', borderRadius: '7px',
                                                border: isPendiente ? '1.5px solid #F59E0B' : '1px solid transparent',
                                                background: isPendiente ? '#FFFBEB' : 'transparent',
                                                color: isPendiente ? '#B45309' : '#64748B', fontSize: '0.73rem', fontWeight: 800,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            1. Pendiente
                                        </button>
                                        <span style={{ color: '#CBD5E1', fontSize: '0.7rem' }}>→</span>
                                        <button
                                            disabled={savingKey === selectedCaso.key}
                                            onClick={() => handleUpdateEstado(selectedCaso, 'contactado')}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                padding: '5px 10px', borderRadius: '7px',
                                                border: isContactado ? '1.5px solid #2563EB' : '1px solid transparent',
                                                background: isContactado ? '#EFF6FF' : 'transparent',
                                                color: isContactado ? '#1D4ED8' : '#64748B', fontSize: '0.73rem', fontWeight: 800,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <MessageSquare size={12} />
                                            2. Contactado
                                        </button>
                                        <span style={{ color: '#CBD5E1', fontSize: '0.7rem' }}>→</span>
                                        <button
                                            disabled={savingKey === selectedCaso.key}
                                            onClick={() => handleUpdateEstado(selectedCaso, 'resuelto')}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                padding: '5px 11px', borderRadius: '7px',
                                                border: isResuelto ? '1.5px solid #059669' : '1px solid #A7F3D0',
                                                background: isResuelto ? '#059669' : '#ECFDF5',
                                                color: isResuelto ? '#FFFFFF' : '#047857', fontSize: '0.74rem', fontWeight: 800,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <CheckCircle2 size={13} />
                                            3. Resuelto en SALUS
                                        </button>
                                        <button
                                            disabled={savingKey === selectedCaso.key}
                                            onClick={() => handleUpdateEstado(selectedCaso, 'descartado')}
                                            title="Descartar si el paciente confirmó que asistirá a ambos turnos válidamente"
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '3px',
                                                padding: '5px 8px', borderRadius: '7px',
                                                border: '1px solid transparent',
                                                background: 'transparent', color: '#94A3B8',
                                                fontSize: '0.71rem', fontWeight: 700,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <XCircle size={12} />
                                            Descartar
                                        </button>
                                    </div>
                                </div>

                                {/* 2. Diagnóstico Inteligente + Comparador de Turnos Reservados en Conflicto */}
                                <div>
                                    {diagnosis && (
                                        <div style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            gap: '10px', flexWrap: 'wrap',
                                            background: diagnosis.bg, border: `1px solid ${diagnosis.border}`,
                                            borderRadius: '10px', padding: '7px 12px', marginBottom: '9px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.76rem', color: diagnosis.color, fontWeight: 700 }}>
                                                <span style={{
                                                    fontSize: '0.64rem', fontWeight: 900, padding: '2px 6px',
                                                    borderRadius: '4px', background: '#FFFFFF', border: `1px solid ${diagnosis.border}`
                                                }}>
                                                    {diagnosis.badge}
                                                </span>
                                                <span>{diagnosis.text}</span>
                                            </div>
                                        </div>
                                    )}

                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                                        gap: '10px'
                                    }}>
                                        {selectedCaso.turnos.map((t, tIdx) => {
                                            const urg = getUrgencyBadge(t.fechaTurno, todayStr);
                                            return (
                                                <div
                                                    key={t.idVisita}
                                                    style={{
                                                        border: '1.5px solid #BFDBFE',
                                                        borderRadius: '12px',
                                                        padding: '10px 13px',
                                                        background: '#F8FBFF',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '4px'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                                                        <span
                                                            onClick={(e) => handleCopyQuick(e, t.idVisita, 'ID SALUS copiado')}
                                                            style={{
                                                                fontSize: '0.68rem', fontWeight: 800,
                                                                background: '#1565C0', color: '#FFFFFF',
                                                                padding: '2px 8px', borderRadius: '6px', cursor: 'pointer',
                                                                display: 'inline-flex', alignItems: 'center', gap: '4px'
                                                            }}
                                                            title="Clic para copiar ID SALUS"
                                                        >
                                                            Turno #{tIdx + 1} · ID SALUS: {t.idVisita}
                                                            <Copy size={10} />
                                                        </span>
                                                        <span style={{ fontSize: '0.66rem', color: '#64748B', fontWeight: 600 }}>
                                                            Reservado: {new Date(t.fechaCreacion).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>

                                                    <div style={{
                                                        fontSize: '0.96rem', fontWeight: 900, color: '#0D3B66',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', flexWrap: 'wrap', marginTop: '2px'
                                                    }}>
                                                        <span>📅 {formatHumanDate(t.fechaTurno, false)} · {formatHumanTime24(t.horaInicio)}</span>
                                                        {urg && (
                                                            <span style={{
                                                                fontSize: '0.64rem', fontWeight: 800, background: urg.bg,
                                                                color: urg.color, border: `1px solid ${urg.border}`,
                                                                padding: '1px 6px', borderRadius: '5px'
                                                            }}>
                                                                {urg.label}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', flexWrap: 'wrap' }}>
                                                        <span style={{ fontSize: '0.73rem', color: '#475569' }}>
                                                            Agenda: <strong>{t.agenda}</strong>
                                                        </span>
                                                        {t.tipoVisita && (
                                                            <span style={{
                                                                padding: '1px 7px', borderRadius: '5px', background: '#EFF6FF',
                                                                border: '1px solid #BFDBFE', fontSize: '0.68rem', fontWeight: 800, color: '#1E40AF'
                                                            }}>
                                                                {t.tipoVisita}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* 3. Consola Integrada de Envío WhatsApp en 2 Columnas (Variables + Nota a la izquierda | Burbuja + Botón Enviar a la derecha) */}
                                <div style={{
                                    background: '#F8FAFC',
                                    borderRadius: '14px',
                                    border: '1.5px solid #E2E8F0',
                                    padding: '13px 15px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '10px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            <MessageSquare size={15} color="#16A34A" />
                                            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>
                                                Aviso Oficial WhatsApp ({META_TEMPLATE_TURNOS_MISMO_DIA.name})
                                            </span>
                                            <span style={{ fontSize: '0.66rem', fontWeight: 800, padding: '2px 7px', borderRadius: '5px', background: '#DCFCE7', color: '#15803D' }}>
                                                Se asocia a {activeAgent?.fullName || activeAgent?.name || 'tu bandeja'}
                                            </span>
                                        </div>
                                        {onOpenChatWithPhone && selectedCaso.telefono && (
                                            <button
                                                type="button"
                                                onClick={() => onOpenChatWithPhone(selectedCaso.telefono, { name: selectedCaso.nombre, dni: selectedCaso.dni })}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                                                    padding: '4px 10px', borderRadius: '7px',
                                                    background: '#EFF6FF', color: '#1E40AF',
                                                    border: '1px solid #BFDBFE', cursor: 'pointer',
                                                    fontSize: '0.74rem', fontWeight: 700
                                                }}
                                            >
                                                <ExternalLink size={12} />
                                                Abrir en Chat
                                            </button>
                                        )}
                                    </div>

                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                                        gap: '12px',
                                        alignItems: 'stretch'
                                    }}>
                                        {/* Mitad Izquierda: Variables editables + Nota interna rápida */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', justifyContent: 'space-between' }}>
                                            {META_VAR_LABELS.map((label, idx) => (
                                                <div key={label}>
                                                    <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 800, color: '#475569', marginBottom: '2px' }}>
                                                        {label}
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={currentInlineVars[idx] || ''}
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            setInlineVarsMap(prev => {
                                                                const base = prev[selectedCaso.key] || buildVariablesTurnosMismoDia(selectedCaso);
                                                                const next = [...base];
                                                                next[idx] = val;
                                                                return { ...prev, [selectedCaso.key]: next };
                                                            });
                                                        }}
                                                        style={{
                                                            width: '100%', padding: '5px 9px', borderRadius: '7px',
                                                            border: '1px solid #CBD5E1', background: '#FFFFFF',
                                                            fontSize: '0.78rem', outline: 'none', boxSizing: 'border-box'
                                                        }}
                                                    />
                                                </div>
                                            ))}

                                            {/* Nota interna rápida de auditoría */}
                                            <div style={{ marginTop: '2px' }}>
                                                <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 800, color: '#475569', marginBottom: '2px' }}>
                                                    📝 Nota interna de auditoría (opcional)
                                                </label>
                                                <div style={{ display: 'flex', gap: '5px' }}>
                                                    <input
                                                        type="text"
                                                        value={inlineNoteDraft}
                                                        onChange={e => setInlineNoteDraft(e.target.value)}
                                                        placeholder="Ej: Anulé el de las 14:00 hs en SALUS / Paciente reprogramó..."
                                                        style={{
                                                            flex: 1, padding: '5px 9px', borderRadius: '7px',
                                                            border: '1px solid #CBD5E1', background: '#FFFFFF',
                                                            fontSize: '0.76rem', outline: 'none'
                                                        }}
                                                    />
                                                    <button
                                                        type="button"
                                                        disabled={savingKey === selectedCaso.key}
                                                        onClick={() => handleUpdateEstado(selectedCaso, selectedCaso.gestion.estado, inlineNoteDraft)}
                                                        style={{
                                                            padding: '5px 10px', borderRadius: '7px',
                                                            border: '1px solid #CBD5E1', background: '#FFFFFF',
                                                            color: '#0F2942', fontSize: '0.72rem', fontWeight: 800,
                                                            cursor: 'pointer', whiteSpace: 'nowrap'
                                                        }}
                                                    >
                                                        Guardar nota
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Mitad Derecha: Vista Previa WhatsApp + Botón Enviar Directo siempre visible */}
                                        <div style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'space-between',
                                            gap: '8px',
                                            background: '#EFEAE2',
                                            borderRadius: '11px',
                                            padding: '10px 12px',
                                            border: '1px solid #E2E8F0'
                                        }}>
                                            <div style={{
                                                background: '#FFFFFF', borderRadius: '8px', padding: '9px 11px',
                                                fontSize: '0.75rem', lineHeight: 1.38, color: '#0F172A', whiteSpace: 'pre-wrap',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.06)'
                                            }}>
                                                <div style={{ fontWeight: 800, color: '#0F172A', marginBottom: '3px', fontSize: '0.77rem' }}>
                                                    {META_TEMPLATE_TURNOS_MISMO_DIA.header || 'Sanatorio Argentino Contact Center'}
                                                </div>
                                                {renderTemplateBody(META_TEMPLATE_TURNOS_MISMO_DIA.body, currentInlineVars.map(v => v || '—')).replace(/\*/g, '')}
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: '0.68rem', color: '#475569', fontWeight: 600 }}>
                                                    👉 Queda en <strong>Mis Chats ({activeAgent?.fullName || activeAgent?.name})</strong>
                                                </span>
                                                <button
                                                    type="button"
                                                    disabled={isSendingInline || !selectedCaso.telefono}
                                                    onClick={() => handleSendInlineWhatsapp(selectedCaso)}
                                                    style={{
                                                        padding: '8px 16px', borderRadius: '9px', border: 'none',
                                                        background: isSendingInline ? '#94A3B8' : 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                                                        color: '#FFFFFF', fontSize: '0.82rem', fontWeight: 800,
                                                        cursor: isSendingInline ? 'not-allowed' : 'pointer',
                                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                        boxShadow: '0 3px 10px rgba(16, 185, 129, 0.28)'
                                                    }}
                                                >
                                                    {isSendingInline ? (
                                                        <>
                                                            <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                                            Enviando...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Send size={14} />
                                                            Enviar Aviso WhatsApp
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {casosFiltrados.map((caso, index) => {
                        const isExpanded = expandedKey === caso.key;
                        const isPendiente = caso.gestion.estado === 'pendiente';
                        const isContactado = caso.gestion.estado === 'contactado';
                        const isResuelto = caso.gestion.estado === 'resuelto';

                        return (
                            <div 
                                key={caso.key}
                                style={{
                                    background: '#FFFFFF',
                                    borderRadius: '16px',
                                    border: isExpanded ? '1.5px solid #0F2942' : '1px solid #E2E8F0',
                                    borderLeft: caso.esMismoDia ? '4px solid #EF4444' : isResuelto ? '4px solid #10B981' : isContactado ? '4px solid #3B82F6' : '4px solid #F59E0B',
                                    boxShadow: isExpanded ? '0 10px 25px -5px rgba(15, 41, 66, 0.08)' : '0 1px 3px rgba(0,0,0,0.02)',
                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                    overflow: 'hidden'
                                }}
                            >
                                {/* HEADER DE LA TARJETA (COLAPSABLE) */}
                                <div 
                                    onClick={() => setExpandedKey(isExpanded ? null : caso.key)}
                                    style={{
                                        padding: '14px 18px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        flexWrap: 'wrap',
                                        gap: '14px',
                                        background: isExpanded ? '#F8FAFC' : '#FFFFFF',
                                        transition: 'background 0.15s ease'
                                    }}
                                >
                                    {/* Paciente y Prestador */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '280px' }}>
                                        <div style={{
                                            width: '40px', height: '40px', borderRadius: '10px',
                                            background: isResuelto 
                                                ? 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)' 
                                                : isContactado
                                                ? 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)'
                                                : 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
                                            border: '1px solid',
                                            borderColor: isResuelto ? '#A7F3D0' : isContactado ? '#BFDBFE' : '#CBD5E1',
                                            color: isResuelto ? '#059669' : isContactado ? '#1D4ED8' : '#334155',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 800, fontSize: '0.95rem', flexShrink: 0
                                        }}>
                                            {caso.nombre[0] || 'P'}
                                        </div>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.01em' }}>
                                                    {caso.nombre}
                                                </span>
                                                <span style={{
                                                    fontSize: '0.72rem', fontWeight: 700,
                                                    background: '#F1F5F9', color: '#475569',
                                                    padding: '2px 7px', borderRadius: '5px',
                                                    border: '1px solid #E2E8F0',
                                                    fontFamily: 'monospace'
                                                }}>
                                                    DNI {caso.dni}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F2942' }}>
                                                    Dr/a. {caso.profesional}
                                                </span>
                                                <span style={{ color: '#CBD5E1', fontSize: '0.75rem' }}>•</span>
                                                <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                                                    Agenda: {caso.agenda}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Indicadores Clínicos y Acción Táctica */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        {/* HUD Chip: Contador Clínico de Conflicto */}
                                        <div style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '7px',
                                            padding: '4px 10px',
                                            borderRadius: '8px',
                                            background: caso.esMismoDia ? '#FEF2F2' : '#F8FAFC',
                                            border: `1px solid ${caso.esMismoDia ? '#FECACA' : '#E2E8F0'}`,
                                            color: caso.esMismoDia ? '#991B1B' : '#334155',
                                            fontSize: '0.76rem',
                                            fontWeight: 700
                                        }}>
                                            <span style={{
                                                display: 'inline-block',
                                                width: '6px',
                                                height: '6px',
                                                borderRadius: '50%',
                                                backgroundColor: caso.esMismoDia ? '#DC2626' : '#F59E0B'
                                            }} />
                                            <span style={{ color: '#0F172A', fontWeight: 800 }}>
                                                {caso.cantidadTurnos}
                                            </span>
                                            <span style={{ color: '#64748B', fontWeight: 600 }}>turnos</span>

                                            {caso.esMismoDia && (
                                                <span style={{
                                                    background: '#EF4444',
                                                    color: '#FFFFFF',
                                                    fontSize: '0.62rem',
                                                    fontWeight: 800,
                                                    padding: '1px 5px',
                                                    borderRadius: '4px',
                                                    letterSpacing: '0.04em',
                                                    textTransform: 'uppercase'
                                                }}>
                                                    Mismo Día
                                                </span>
                                            )}
                                        </div>

                                        {/* Pill de Estado Estilo Monitor Clínico */}
                                        <div style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '4px 10px',
                                            borderRadius: '8px',
                                            fontSize: '0.74rem',
                                            fontWeight: 700,
                                            background: isPendiente ? '#FFFBEB' : isContactado ? '#EFF6FF' : '#ECFDF5',
                                            color: isPendiente ? '#92400E' : isContactado ? '#1E40AF' : '#065F46',
                                            border: `1px solid ${isPendiente ? '#FDE68A' : isContactado ? '#BFDBFE' : '#A7F3D0'}`
                                        }}>
                                            <span style={{
                                                width: '6px',
                                                height: '6px',
                                                borderRadius: '50%',
                                                backgroundColor: isPendiente ? '#F59E0B' : isContactado ? '#2563EB' : '#10B981'
                                            }} />
                                            <span>
                                                {isPendiente ? 'Pendiente' : isContactado ? 'Contactado' : 'Auditado'}
                                            </span>
                                        </div>

                                        {/* Botón Acción Táctica WhatsApp */}
                                        {caso.telefono && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenWhatsappModal(caso);
                                                }}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    padding: '5px 12px',
                                                    borderRadius: '8px',
                                                    background: '#F0FDF4',
                                                    color: '#15803D',
                                                    border: '1px solid #BBF7D0',
                                                    cursor: 'pointer',
                                                    fontSize: '0.76rem',
                                                    fontWeight: 800,
                                                    transition: 'all 0.15s ease-in-out',
                                                    boxShadow: '0 1px 2px rgba(16, 185, 129, 0.06)'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = '#DCFCE7';
                                                    e.currentTarget.style.borderColor = '#86EFAC';
                                                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.18)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = '#F0FDF4';
                                                    e.currentTarget.style.borderColor = '#BBF7D0';
                                                    e.currentTarget.style.boxShadow = '0 1px 2px rgba(16, 185, 129, 0.06)';
                                                }}
                                                title={`Contactar a ${caso.nombre} vía WhatsApp`}
                                            >
                                                <MessageSquare size={13} style={{ color: '#16A34A' }} />
                                                <span>Contactar</span>
                                            </button>
                                        )}

                                        <div style={{ 
                                            color: '#94A3B8',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '24px',
                                            height: '24px',
                                            borderRadius: '6px',
                                            background: isExpanded ? '#F1F5F9' : 'transparent',
                                            transition: 'all 0.15s'
                                        }}>
                                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </div>
                                    </div>
                                </div>

                                {/* DETALLE EXPANDIDO (TURNOS Y ACCIONES) */}
                                {isExpanded && (
                                    <div style={{
                                        padding: '16px 20px 20px',
                                        borderTop: '1px solid #E2E8F0',
                                        background: '#FFFFFF'
                                    }}>
                                        {/* Datos de contacto */}
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: '20px',
                                            padding: '10px 14px', borderRadius: '12px',
                                            background: '#F8FAFC', border: '1px solid #E2E8F0',
                                            marginBottom: '16px', flexWrap: 'wrap'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                                                <Phone size={15} color="#1565C0" />
                                                <span style={{ fontWeight: 700, color: '#0F172A' }}>Teléfono:</span>
                                                <span style={{ color: '#475569' }}>{caso.telefono || 'Sin teléfono'}</span>
                                            </div>
                                            {caso.email && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                                                    <Mail size={15} color="#1565C0" />
                                                    <span style={{ fontWeight: 700, color: '#0F172A' }}>Email:</span>
                                                    <span style={{ color: '#475569' }}>{caso.email}</span>
                                                </div>
                                            )}
                                            {caso.mutua && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                                                    <span style={{ fontWeight: 700, color: '#0F172A' }}>Obra Social:</span>
                                                    <span style={{ color: '#475569' }}>{caso.mutua}</span>
                                                </div>
                                            )}
                                            {caso.gestion.updatedAt && (
                                                <div style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#64748B' }}>
                                                    Última gestión: {new Date(caso.gestion.updatedAt).toLocaleString('es-AR')} por {caso.gestion.agenteNombre || 'Agente'}
                                                </div>
                                            )}
                                        </div>

                                        {/* Comparador de Turnos en Conflicto */}
                                        <div style={{ marginBottom: '16px' }}>
                                            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>
                                                📅 Turnos Reservados en Conflicto ({caso.turnos.length}):
                                            </div>
                                            <div style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                                                gap: '12px'
                                            }}>
                                                {caso.turnos.map((t, tIdx) => (
                                                    <div 
                                                        key={t.idVisita}
                                                        style={{
                                                            border: '1.5px solid #BFDBFE',
                                                            borderRadius: '14px',
                                                            padding: '12px 16px',
                                                            background: '#F0F7FF',
                                                            position: 'relative'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                            <span style={{
                                                                fontSize: '0.72rem', fontWeight: 800,
                                                                background: '#1565C0', color: '#FFFFFF',
                                                                padding: '2px 8px', borderRadius: '6px'
                                                            }}>
                                                                Turno #{tIdx + 1} · ID SALUS: {t.idVisita}
                                                            </span>
                                                            <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                                Pedido: {new Date(t.fechaCreacion).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        </div>
                                                        <div style={{ fontSize: '1.02rem', fontWeight: 900, color: '#0D3B66', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                            <span>📅 {formatHumanDate(t.fechaTurno)} · {formatHumanTime24(t.horaInicio)}</span>
                                                            {t.fechaTurno && t.fechaTurno < todayStr && (
                                                                <span style={{ fontSize: '0.68rem', fontWeight: 700, background: '#FEE2E2', color: '#B91C1C', padding: '2px 6px', borderRadius: '4px' }}>
                                                                    Fecha pasada
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                                                            Agenda: <span style={{ fontWeight: 700 }}>{t.agenda}</span>
                                                        </div>
                                                        {t.tipoVisita && (
                                                            <div style={{
                                                                marginTop: '6px',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '6px',
                                                                padding: '3px 9px',
                                                                borderRadius: '6px',
                                                                background: '#EFF6FF',
                                                                border: '1px solid #BFDBFE',
                                                                fontSize: '0.78rem',
                                                                fontWeight: 700,
                                                                color: '#1E40AF'
                                                            }}>
                                                                <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: '#2563EB' }}>
                                                                    Estudio:
                                                                </span>
                                                                <span>{t.tipoVisita}</span>
                                                            </div>
                                                        )}
                                                        {t.motivo && (
                                                            <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: '4px' }}>
                                                                Motivo: {t.motivo}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Barra de Acciones de Gestión */}
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            flexWrap: 'wrap',
                                            gap: '12px',
                                            paddingTop: '12px',
                                            borderTop: '1px solid #F1F5F9'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <button
                                                    onClick={() => handleOpenWhatsappModal(caso)}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: '6px',
                                                        padding: '8px 16px', borderRadius: '10px',
                                                        background: '#10B981', color: '#FFFFFF',
                                                        border: 'none', cursor: 'pointer',
                                                        fontSize: '0.84rem', fontWeight: 800,
                                                        boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)'
                                                    }}
                                                >
                                                    <MessageSquare size={16} />
                                                    Enviar Aviso WhatsApp
                                                </button>

                                                {onOpenChatWithPhone && caso.telefono && (
                                                    <button
                                                        onClick={() => onOpenChatWithPhone(caso.telefono, { name: caso.nombre, dni: caso.dni })}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: '6px',
                                                            padding: '8px 14px', borderRadius: '10px',
                                                            background: '#EFF6FF', color: '#1E40AF',
                                                            border: '1.5px solid #BFDBFE', cursor: 'pointer',
                                                            fontSize: '0.82rem', fontWeight: 700
                                                        }}
                                                    >
                                                        <ExternalLink size={15} />
                                                        Abrir en Chat
                                                    </button>
                                                )}
                                            </div>

                                            {/* Estados de resolución */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B' }}>
                                                    Estado:
                                                </span>
                                                <button
                                                    disabled={savingKey === caso.key}
                                                    onClick={() => handleUpdateEstado(caso, 'contactado')}
                                                    style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                                                        padding: '5px 12px', borderRadius: '8px',
                                                        border: isContactado ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
                                                        background: isContactado ? '#EFF6FF' : '#FFFFFF',
                                                        color: isContactado ? '#1D4ED8' : '#475569', fontSize: '0.76rem', fontWeight: 800,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <MessageSquare size={13} />
                                                    Contactado
                                                </button>
                                                <button
                                                    disabled={savingKey === caso.key}
                                                    onClick={() => handleUpdateEstado(caso, 'resuelto')}
                                                    style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                                                        padding: '5px 12px', borderRadius: '8px',
                                                        border: isResuelto ? '1.5px solid #10B981' : '1px solid #CBD5E1',
                                                        background: isResuelto ? '#ECFDF5' : '#FFFFFF',
                                                        color: isResuelto ? '#047857' : '#475569', fontSize: '0.76rem', fontWeight: 800,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <CheckCircle2 size={13} />
                                                    Resuelto en SALUS
                                                </button>
                                                <button
                                                    disabled={savingKey === caso.key}
                                                    onClick={() => handleUpdateEstado(caso, 'descartado')}
                                                    style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                        padding: '5px 10px', borderRadius: '8px',
                                                        border: '1px solid #E2E8F0',
                                                        background: '#FFFFFF', color: '#94A3B8',
                                                        fontSize: '0.76rem', fontWeight: 700,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <XCircle size={13} />
                                                    Descartar
                                                </button>

                                                {isPendiente && caso.turnos?.length > 0 && caso.turnos.every(t => t.fechaTurno && t.fechaTurno < todayStr) && (
                                                    <button
                                                        disabled={savingKey === caso.key}
                                                        onClick={() => handleUpdateEstado(caso, 'resuelto', 'Archivado automáticamente (Fecha del turno transcurrida)')}
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                            padding: '5px 10px', borderRadius: '8px',
                                                            border: '1px solid #CBD5E1',
                                                            background: '#F8FAFC', color: '#475569',
                                                            fontSize: '0.76rem', fontWeight: 700,
                                                            cursor: 'pointer'
                                                        }}
                                                        title="Las fechas de estos turnos ya pasaron. Archivar como resuelto."
                                                    >
                                                        <Check size={13} />
                                                        Archivar vencido
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ═══ MODAL ENVIAR PLANTILLA WHATSAPP ═══ */}
            {modalData && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, padding: '20px'
                }}>
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '24px',
                        width: '100%',
                        maxWidth: '620px',
                        padding: '24px 28px',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                        border: '1.5px solid #E2E8F0',
                        animation: 'fadeInUp 0.2s ease-out'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                    width: '38px', height: '38px', borderRadius: '12px',
                                    background: '#DCFCE7', color: '#16A34A',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <MessageSquare size={20} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                                        Enviar Aviso WhatsApp de Turnos Online
                                    </h3>
                                    <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                                        Paciente: <strong style={{ color: '#0F172A' }}>{modalData.caso.nombre}</strong> · Tel: {modalData.caso.telefono}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setModalData(null)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '4px' }}
                            >
                                <XCircle size={22} />
                            </button>
                        </div>

                        {/* Plantilla Oficial Meta */}
                        <div style={{ marginBottom: '14px' }}>
                            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>
                                Plantilla Oficial Meta:
                            </label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div
                                    style={{
                                        padding: '12px 14px', borderRadius: '12px',
                                        border: '2px solid #0284C7',
                                        background: '#F0F9FF',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                    }}
                                >
                                    <div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#075985', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            Plantilla oficial Meta · {META_TEMPLATE_TURNOS_MISMO_DIA.name}
                                            <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '1px 6px', borderRadius: '4px', background: '#DCFCE7', color: '#15803D' }}>Aprobada</span>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px' }}>
                                            Inicia la conversación aunque el paciente nunca haya escrito. Incluye botones de respuesta rápida.
                                        </div>
                                    </div>
                                    <Check size={18} color="#0284C7" />
                                </div>
                            </div>
                        </div>

                        {/* Vista previa y edición del mensaje */}
                        {isMetaSelected ? (
                            <div style={{ marginBottom: '18px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                                    {META_VAR_LABELS.map((label, idx) => (
                                        <div key={label} style={{ gridColumn: idx === 2 ? '1 / span 2' : 'auto' }}>
                                            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>{label}</label>
                                            <input
                                                type="text"
                                                value={modalData.metaVars?.[idx] || ''}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    setModalData(prev => {
                                                        const next = [...(prev.metaVars || ['', '', ''])];
                                                        next[idx] = val;
                                                        return { ...prev, metaVars: next };
                                                    });
                                                }}
                                                style={{
                                                    width: '100%', padding: '8px 10px', borderRadius: '8px',
                                                    border: `1.5px solid ${String(modalData.metaVars?.[idx] || '').trim() ? '#CBD5E1' : '#FCA5A5'}`,
                                                    fontSize: '0.84rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit'
                                                }}
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div style={{ background: '#EFEAE2', borderRadius: '10px', padding: '12px' }}>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748B', marginBottom: '6px', textTransform: 'uppercase' }}>Vista previa del mensaje que recibirá el paciente</div>
                                    <div style={{ background: '#FFFFFF', borderRadius: '8px', padding: '12px 14px', fontSize: '0.84rem', lineHeight: 1.45, color: '#0F172A', whiteSpace: 'pre-wrap', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
                                        <div style={{ fontWeight: 800, color: '#0F172A', marginBottom: '8px', fontSize: '0.86rem' }}>
                                            {META_TEMPLATE_TURNOS_MISMO_DIA.header || 'Sanatorio Argentino Contact Center'}
                                        </div>
                                        {renderTemplateBody(META_TEMPLATE_TURNOS_MISMO_DIA.body, (modalData.metaVars || []).map(v => v || '—')).replace(/\*/g, '')}
                                    </div>
                                    <div style={{ display: 'flex', marginTop: '6px' }}>
                                        {META_TEMPLATE_TURNOS_MISMO_DIA.buttons.map(b => (
                                            <div key={b} style={{
                                                flex: 1,
                                                textAlign: 'center',
                                                background: '#FFFFFF',
                                                borderRadius: '8px',
                                                padding: '9px 12px',
                                                fontSize: '0.84rem',
                                                fontWeight: 700,
                                                color: '#008069',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.06)'
                                            }}>
                                                <span style={{ fontSize: '0.9rem' }}>📋</span>
                                                <span>{b}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '6px' }}>
                                    La conversación se abre asignada a <strong>{activeAgent?.fullName || activeAgent?.name}</strong> y aparece en "Mis Chats".
                                </div>
                            </div>
                        ) : (
                        <div style={{ marginBottom: '18px' }}>
                            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>
                                Mensaje a enviar (personalizable antes de despachar):
                            </label>
                            <textarea
                                rows={5}
                                value={modalData.texto}
                                onChange={e => setModalData(prev => ({ ...prev, texto: e.target.value }))}
                                style={{
                                    width: '100%',
                                    padding: '12px 14px',
                                    borderRadius: '12px',
                                    border: '1.5px solid #CBD5E1',
                                    fontSize: '0.86rem',
                                    lineHeight: 1.45,
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                    fontFamily: 'inherit',
                                    resize: 'vertical'
                                }}
                            />
                            <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '4px' }}>
                                Se despacha desde la línea oficial del Contact Center firmando como: <strong>{activeAgent?.fullName || activeAgent?.name}</strong>. Solo llega si el paciente escribió en las últimas 24 hs.
                            </div>
                        </div>
                        )}

                        {/* Botones de acción */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button
                                type="button"
                                onClick={() => setModalData(null)}
                                style={{
                                    padding: '10px 18px', borderRadius: '12px',
                                    border: '1.5px solid #CBD5E1', background: '#FFFFFF',
                                    color: '#475569', fontSize: '0.86rem', fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={!canSendModal}
                                onClick={handleConfirmSendWhatsapp}
                                style={{
                                    padding: '10px 22px', borderRadius: '12px',
                                    border: 'none',
                                    background: modalData.sending ? '#94A3B8' : 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                                    color: '#FFFFFF', fontSize: '0.88rem', fontWeight: 800,
                                    cursor: modalData.sending ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                                }}
                            >
                                {modalData.sending ? (
                                    <>
                                        <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                        Despachando...
                                    </>
                                ) : (
                                    <>
                                        <Send size={16} />
                                        Enviar WhatsApp al Paciente
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ MODAL GUÍA DE OPERACIÓN PARA OPERADORAS ═══ */}
            {showGuiaModal && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px'
                }}>
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '20px',
                        width: '740px',
                        maxWidth: '100%',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        border: '1.5px solid #CBD5E1'
                    }}>
                        {/* Header del Modal */}
                        <div style={{
                            padding: '20px 24px',
                            borderBottom: '1.5px solid #F1F5F9',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: 'linear-gradient(135deg, #0F2942 0%, #1E4E79 100%)',
                            color: '#FFFFFF',
                            borderTopLeftRadius: '18px',
                            borderTopRightRadius: '18px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    width: '38px', height: '38px', borderRadius: '10px',
                                    background: 'rgba(255, 255, 255, 0.15)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <BookOpen size={20} color="#FFFFFF" />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
                                        Guía de Operación: Auditoría de Turnos Duplicados
                                    </h3>
                                    <div style={{ fontSize: '0.78rem', color: '#93C5FD', marginTop: '2px' }}>
                                        Instructivo operativo para Daniela Aguilera, Sofia Olivier, Virginia Jacques y Erica Leal
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowGuiaModal(false)}
                                style={{
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    border: 'none',
                                    color: '#FFFFFF',
                                    borderRadius: '8px',
                                    padding: '6px',
                                    cursor: 'pointer',
                                    display: 'flex', alignItems: 'center'
                                }}
                            >
                                <XCircle size={20} />
                            </button>
                        </div>

                        {/* Cuerpo de la Guía */}
                        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {/* 1. Objetivo */}
                            <div style={{
                                background: '#F8FAFC', borderRadius: '14px',
                                padding: '14px 18px', border: '1px solid #E2E8F0'
                            }}>
                                <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0F2942', marginBottom: '4px' }}>
                                    🎯 ¿Por qué es vital esta tarea?
                                </div>
                                <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569', lineHeight: 1.5 }}>
                                    Muchos pacientes reservan <strong>2 o más turnos para el mismo médico</strong> a través de la web "por si acaso", bloqueando horarios a otros pacientes y generando ausentismo. El objetivo de este módulo es <strong>contactar al paciente, definir con qué turno se queda, y anular en SALUS el turno sobrante</strong> para liberar la agenda médica.
                                </p>
                            </div>

                            {/* 2. Código de Colores de Triage */}
                            <div>
                                <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0F2942', marginBottom: '10px' }}>
                                    🚦 Identificación Visual de Prioridades (Triage)
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
                                    <div style={{
                                        border: '1px solid #FECACA', borderLeft: '4px solid #EF4444',
                                        borderRadius: '10px', padding: '10px 12px', background: '#FEF2F2'
                                    }}>
                                        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#991B1B' }}>
                                            🔴 Mismo Día (Urgente)
                                        </div>
                                        <div style={{ fontSize: '0.74rem', color: '#7F1D1D', marginTop: '2px' }}>
                                            2 horarios reservados en la misma fecha. Prioridad 1 de contacto.
                                        </div>
                                    </div>

                                    <div style={{
                                        border: '1px solid #FDE68A', borderLeft: '4px solid #F59E0B',
                                        borderRadius: '10px', padding: '10px 12px', background: '#FFFBEB'
                                    }}>
                                        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#92400E' }}>
                                            🟡 Pendiente
                                        </div>
                                        <div style={{ fontSize: '0.74rem', color: '#78350F', marginTop: '2px' }}>
                                            Turnos duplicados en fechas separadas sin auditar aún.
                                        </div>
                                    </div>

                                    <div style={{
                                        border: '1px solid #BFDBFE', borderLeft: '4px solid #3B82F6',
                                        borderRadius: '10px', padding: '10px 12px', background: '#EFF6FF'
                                    }}>
                                        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1E40AF' }}>
                                            🔵 Contactado
                                        </div>
                                        <div style={{ fontSize: '0.74rem', color: '#1E3A8A', marginTop: '2px' }}>
                                            Se le envió WhatsApp al paciente y estamos esperando su respuesta.
                                        </div>
                                    </div>

                                    <div style={{
                                        border: '1px solid #A7F3D0', borderLeft: '4px solid #10B981',
                                        borderRadius: '10px', padding: '10px 12px', background: '#ECFDF5'
                                    }}>
                                        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#065F46' }}>
                                            🟢 Auditado / Resuelto
                                        </div>
                                        <div style={{ fontSize: '0.74rem', color: '#047857', marginTop: '2px' }}>
                                            Turno excedente anulado en SALUS. Caso cerrado.
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 3. Paso a Paso del Flujo de Trabajo */}
                            <div>
                                <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0F2942', marginBottom: '12px' }}>
                                    📋 Protocolo Paso a Paso para la Operadora
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                        <div style={{
                                            width: '26px', height: '26px', borderRadius: '50%',
                                            background: '#0F2942', color: '#FFFFFF',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 800, fontSize: '0.78rem', flexShrink: 0
                                        }}>
                                            1
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0F172A' }}>
                                                Identificar y desplegar el caso
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                                                Haz clic sobre la tarjeta del paciente. Se abrirá el comparador con los datos de contacto y cada uno de los turnos con su <strong>ID de Visita en SALUS</strong>, fecha y hora.
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                        <div style={{
                                            width: '26px', height: '26px', borderRadius: '50%',
                                            background: '#10B981', color: '#FFFFFF',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 800, fontSize: '0.78rem', flexShrink: 0
                                        }}>
                                            2
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0F172A' }}>
                                                Hacer clic en "Contactar"
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                                                Se abrirá la ventana con el mensaje de WhatsApp redactado automáticamente con el nombre del paciente y las opciones de sus turnos. Puedes revisarlo, personalizarlo y presionar <strong>"Enviar WhatsApp al Paciente"</strong>.
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                        <div style={{
                                            width: '26px', height: '26px', borderRadius: '50%',
                                            background: '#2563EB', color: '#FFFFFF',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 800, fontSize: '0.78rem', flexShrink: 0
                                        }}>
                                            3
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0F172A' }}>
                                                Ingresar a SALUS y anular el turno duplicado
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                                                Una vez acordado con el paciente cuál turno conserva, entra en SALUS con el número de ID de Visita y <strong>anula el turno que no utilizará</strong>, dejando la agenda libre para otro paciente.
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                        <div style={{
                                            width: '26px', height: '26px', borderRadius: '50%',
                                            background: '#059669', color: '#FFFFFF',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 800, fontSize: '0.78rem', flexShrink: 0
                                        }}>
                                            4
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0F172A' }}>
                                                Marcar como "Resuelto en SALUS"
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                                                En el detalle de la tarjeta, presiona el botón verde <strong>"Resuelto en SALUS"</strong>. La tarjeta cambiará a verde y quedará registrada tu firma como operadora responsable.
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 4. Tips Adicionales */}
                            <div style={{
                                background: '#EFF6FF', borderRadius: '14px',
                                padding: '12px 16px', border: '1px solid #BFDBFE'
                            }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#1E40AF', marginBottom: '4px' }}>
                                    💡 Atajos útiles para el equipo:
                                </div>
                                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.78rem', color: '#1E3A8A', lineHeight: 1.5 }}>
                                    <li>Puedes filtrar arriba por <strong>"Pendientes"</strong> para enfocarte solo en los que requieren acción inmediata.</li>
                                    <li>Si el paciente te responde por WhatsApp, puedes presionar <strong>"Abrir en Chat"</strong> para chatear en tiempo real desde la consola de Contact Center.</li>
                                    <li>Usa el buscador para localizar a un paciente por su <strong>DNI, apellido o médico</strong> en segundos.</li>
                                </ul>
                            </div>
                        </div>

                        {/* Footer del Modal */}
                        <div style={{
                            padding: '16px 24px',
                            borderTop: '1px solid #F1F5F9',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            background: '#F8FAFC',
                            borderBottomLeftRadius: '18px',
                            borderBottomRightRadius: '18px'
                        }}>
                            <button
                                onClick={() => setShowGuiaModal(false)}
                                style={{
                                    padding: '8px 20px', borderRadius: '10px',
                                    background: '#0F2942', color: '#FFFFFF',
                                    border: 'none', cursor: 'pointer',
                                    fontSize: '0.84rem', fontWeight: 800
                                }}
                            >
                                Entendido, volver a la auditoría
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
