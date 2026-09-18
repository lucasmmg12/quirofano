import React, { useState, useEffect, useMemo } from 'react';
import { 
    AlertTriangle, Calendar, Clock, User, Phone, Mail, 
    Send, CheckCircle2, XCircle, Search, RefreshCw, ChevronDown, 
    ChevronUp, MessageSquare, ShieldAlert, FileText, Check,
    ExternalLink, Sparkles, Filter, Info, ArrowLeft
} from 'lucide-react';
import { 
    fetchTurnosOnlineDuplicados, 
    saveGestionTurnoOnline, 
    sendWhatsappAvisoTurno,
    PLANTILLAS_TURNOS_ONLINE 
} from '../../services/turnosOnlineService';

export default function ContactCenterTurnosOnlineTab({ activeAgent, currentUser, addToast, onOpenChatWithPhone, onBackToConsole }) {
    const [loading, setLoading] = useState(false);
    const [filtroDias, setFiltroDias] = useState(1); // 1 = ayer/hoy
    const [fechaCustom, setFechaCustom] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [filtroEstado, setFiltroEstado] = useState('todos'); // 'todos', 'pendiente', 'contactado', 'resuelto'
    
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

    // Modal de Envío de WhatsApp
    const [modalData, setModalData] = useState(null); // { caso, plantilla, texto, sending }
    const [savingKey, setSavingKey] = useState(null);

    // 1. Cargar turnos desde SALUS
    const loadData = async (days = filtroDias, customDate = fechaCustom) => {
        setLoading(true);
        try {
            const res = await fetchTurnosOnlineDuplicados({
                days,
                date: customDate || null
            });

            if (res && (res.success || Array.isArray(res.casos))) {
                setStats(res.stats || { totalPacientesConDuplicados: 0, totalTurnosEnConflicto: 0, totalPendientes: 0, totalContactados: 0, totalResueltos: 0 });
                setCasos(res.casos || []);
                // Si había uno expandido que ya no existe, limpiamos
                if (expandedKey && !res.casos?.some(c => c.key === expandedKey)) {
                    setExpandedKey(null);
                }
            } else {
                if (addToast) addToast(res?.error || 'Error al consultar turnos online', 'error');
            }
        } catch (err) {
            console.error('Error cargando turnos online:', err);
            if (addToast) addToast('No se pudo conectar con el servidor de sincronización SALUS', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData(filtroDias, fechaCustom);
    }, [filtroDias, fechaCustom]);

    // 2. Filtrado de casos
    const casosFiltrados = useMemo(() => {
        return casos.filter(c => {
            // Filtro de estado
            if (filtroEstado !== 'todos' && c.gestion.estado !== filtroEstado) {
                return false;
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
    }, [casos, filtroEstado, searchTerm]);

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
                setCasos(prev => prev.map(c => c.key === caso.key ? { ...c, gestion: res.gestion } : c));
                // Recalcular stats locales
                setStats(prev => {
                    const prevEstado = caso.gestion.estado;
                    const nextEstado = res.gestion.estado;
                    if (prevEstado === nextEstado) return prev;
                    return {
                        ...prev,
                        totalPendientes: prev.totalPendientes + (nextEstado === 'pendiente' ? 1 : prevEstado === 'pendiente' ? -1 : 0),
                        totalContactados: prev.totalContactados + (nextEstado === 'contactado' ? 1 : prevEstado === 'contactado' ? -1 : 0),
                        totalResueltos: prev.totalResueltos + (nextEstado === 'resuelto' ? 1 : prevEstado === 'resuelto' ? -1 : 0),
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

    // 4. Abrir modal de WhatsApp con plantilla adecuada
    const handleOpenWhatsappModal = (caso) => {
        // Seleccionar plantilla adecuada según si los turnos son el mismo día o no
        const defaultTemplate = caso.esMismoDia 
            ? PLANTILLAS_TURNOS_ONLINE[0] 
            : PLANTILLAS_TURNOS_ONLINE[1];

        const initialText = defaultTemplate.generateText(caso.nombre, caso.profesional, caso.turnos);

        setModalData({
            caso,
            plantillaId: defaultTemplate.id,
            texto: initialText,
            sending: false
        });
    };

    // 5. Cambiar plantilla en el modal
    const handleChangePlantilla = (tplId) => {
        if (!modalData) return;
        const tpl = PLANTILLAS_TURNOS_ONLINE.find(p => p.id === tplId) || PLANTILLAS_TURNOS_ONLINE[0];
        const newText = tpl.generateText(modalData.caso.nombre, modalData.caso.profesional, modalData.caso.turnos);
        setModalData(prev => ({
            ...prev,
            plantillaId: tplId,
            texto: newText
        }));
    };

    // 6. Enviar mensaje de WhatsApp
    const handleConfirmSendWhatsapp = async () => {
        if (!modalData) return;
        const { caso, texto } = modalData;

        setModalData(prev => ({ ...prev, sending: true }));
        try {
            await sendWhatsappAvisoTurno({
                phone: caso.telefono,
                text: texto,
                agente: activeAgent,
                pacienteNombre: caso.nombre,
                casoKey: caso.key
            });

            // Actualizar estado a "contactado"
            await handleUpdateEstado(caso, 'contactado', `Plantilla enviada por ${activeAgent?.name || 'Agente'}: "${modalData.plantillaId}"`);

            if (addToast) addToast(`Mensaje de WhatsApp enviado a ${caso.nombre}`, 'success');
            setModalData(null);
        } catch (err) {
            console.error('Error enviando WhatsApp:', err);
            if (addToast) addToast(err.message || 'Error al enviar WhatsApp', 'error');
            setModalData(prev => ({ ...prev, sending: false }));
        }
    };

    return (
        <div style={{ padding: '20px 24px', maxWidth: '1440px', margin: '0 auto' }}>
            
            {/* ═══ HEADER DE AUDITORÍA Y FILTROS ═══ */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '20px',
                padding: '20px 24px',
                border: '1.5px solid #E2E8F0',
                boxShadow: '0 2px 12px rgba(15, 23, 42, 0.04)',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px'
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                        <div style={{
                            width: '38px', height: '38px', borderRadius: '10px',
                            background: '#FEE2E2', color: '#DC2626',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <ShieldAlert size={22} />
                        </div>
                        <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#0F172A' }}>
                            Auditoría de Turnos Online Duplicados
                        </h2>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B' }}>
                        Detección automática de pacientes con múltiples turnos para el mismo prestador y gestión vía WhatsApp.
                    </p>
                </div>

                {/* Filtros temporales y navegación */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {onBackToConsole && (
                        <button
                            onClick={onBackToConsole}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 14px',
                                borderRadius: '10px',
                                border: '1.5px solid #CBD5E1',
                                background: '#FFFFFF',
                                color: '#334155',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                            }}
                            title="Volver a la consola de chats de Contact Center"
                        >
                            <ArrowLeft size={15} />
                            Volver a Chats
                        </button>
                    )}

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
                                padding: '6px 14px', borderRadius: '8px', border: 'none',
                                fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
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
                                padding: '6px 14px', borderRadius: '8px', border: 'none',
                                fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
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
                                padding: '6px 14px', borderRadius: '8px', border: 'none',
                                fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                                background: filtroDias === 7 && !fechaCustom ? '#0F2942' : 'transparent',
                                color: filtroDias === 7 && !fechaCustom ? '#FFFFFF' : '#475569',
                                transition: 'all 0.15s'
                            }}
                        >
                            Últimos 7 días
                        </button>
                    </div>

                    <button
                        onClick={() => loadData(filtroDias, fechaCustom)}
                        disabled={loading}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '8px 16px', borderRadius: '10px',
                            background: '#0F2942', color: '#FFFFFF',
                            border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                            fontSize: '0.84rem', fontWeight: 700,
                            boxShadow: '0 2px 8px rgba(15, 41, 66, 0.2)'
                        }}
                    >
                        <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                        {loading ? 'Consultando...' : 'Actualizar'}
                    </button>
                </div>
            </div>

            {/* ═══ TARJETAS KPI RESUMEN ═══ */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px',
                marginBottom: '24px'
            }}>
                <div style={{
                    background: '#FFFFFF', borderRadius: '18px', padding: '18px 20px',
                    border: '1.5px solid #CBD5E1', boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    display: 'flex', alignItems: 'center', gap: '16px'
                }}>
                    <div style={{
                        width: '46px', height: '46px', borderRadius: '14px',
                        background: '#FEF2F2', color: '#EF4444',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <AlertTriangle size={24} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                            Pacientes con Inconsistencias
                        </div>
                        <div style={{ fontSize: '1.85rem', fontWeight: 900, color: '#0F172A', lineHeight: 1.1 }}>
                            {stats.totalPacientesConDuplicados}
                        </div>
                    </div>
                </div>

                <div style={{
                    background: '#FFFFFF', borderRadius: '18px', padding: '18px 20px',
                    border: '1.5px solid #CBD5E1', boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    display: 'flex', alignItems: 'center', gap: '16px'
                }}>
                    <div style={{
                        width: '46px', height: '46px', borderRadius: '14px',
                        background: '#FFFBEB', color: '#D97706',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <Calendar size={24} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                            Turnos en Conflicto
                        </div>
                        <div style={{ fontSize: '1.85rem', fontWeight: 900, color: '#0F172A', lineHeight: 1.1 }}>
                            {stats.totalTurnosEnConflicto}
                        </div>
                    </div>
                </div>

                <div style={{
                    background: '#FFFFFF', borderRadius: '18px', padding: '18px 20px',
                    border: '1.5px solid #CBD5E1', boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    display: 'flex', alignItems: 'center', gap: '16px'
                }}>
                    <div style={{
                        width: '46px', height: '46px', borderRadius: '14px',
                        background: '#F0FDF4', color: '#16A34A',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <CheckCircle2 size={24} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                            Contactados / En Gestión
                        </div>
                        <div style={{ fontSize: '1.85rem', fontWeight: 900, color: '#16A34A', lineHeight: 1.1 }}>
                            {stats.totalContactados}
                        </div>
                    </div>
                </div>

                <div style={{
                    background: '#FFFFFF', borderRadius: '18px', padding: '18px 20px',
                    border: '1.5px solid #CBD5E1', boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    display: 'flex', alignItems: 'center', gap: '16px'
                }}>
                    <div style={{
                        width: '46px', height: '46px', borderRadius: '14px',
                        background: '#EFF6FF', color: '#1D4ED8',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <Clock size={24} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                            Pendientes de Acción
                        </div>
                        <div style={{ fontSize: '1.85rem', fontWeight: 900, color: '#1D4ED8', lineHeight: 1.1 }}>
                            {stats.totalPendientes}
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ BARRA DE BÚSQUEDA Y FILTRO DE ESTADO ═══ */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                marginBottom: '16px'
            }}>
                {/* Input de Búsqueda */}
                <div style={{
                    position: 'relative',
                    width: '360px',
                    maxWidth: '100%'
                }}>
                    <Search size={18} style={{
                        position: 'absolute',
                        left: '12px',
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
                            padding: '10px 14px 10px 38px',
                            borderRadius: '12px',
                            border: '1.5px solid #CBD5E1',
                            fontSize: '0.88rem',
                            outline: 'none',
                            background: '#FFFFFF',
                            boxSizing: 'border-box'
                        }}
                    />
                </div>

                {/* Filtro por estado */}
                <div style={{
                    display: 'flex',
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    padding: '3px',
                    border: '1.5px solid #CBD5E1'
                }}>
                    {[
                        { id: 'todos', label: 'Todos', count: casos.length },
                        { id: 'pendiente', label: 'Pendientes', count: stats.totalPendientes },
                        { id: 'contactado', label: 'Contactados', count: stats.totalContactados },
                        { id: 'resuelto', label: 'Resueltos', count: stats.totalResueltos },
                    ].map(f => (
                        <button
                            key={f.id}
                            onClick={() => setFiltroEstado(f.id)}
                            style={{
                                padding: '6px 14px', borderRadius: '8px', border: 'none',
                                fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
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
                                fontSize: '0.7rem', padding: '1px 6px', borderRadius: '8px'
                            }}>
                                {f.count}
                            </span>
                        </button>
                    ))}
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
                                    borderRadius: '18px',
                                    border: isExpanded ? '2px solid #1565C0' : '1.5px solid #E2E8F0',
                                    boxShadow: isExpanded ? '0 6px 20px rgba(21, 101, 192, 0.08)' : '0 2px 6px rgba(0,0,0,0.02)',
                                    transition: 'all 0.2s',
                                    overflow: 'hidden'
                                }}
                            >
                                {/* HEADER DE LA TARJETA (COLAPSABLE) */}
                                <div 
                                    onClick={() => setExpandedKey(isExpanded ? null : caso.key)}
                                    style={{
                                        padding: '16px 20px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        flexWrap: 'wrap',
                                        gap: '14px',
                                        background: isExpanded ? '#F8FAFC' : '#FFFFFF'
                                    }}
                                >
                                    {/* Paciente y Prestador */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: '280px' }}>
                                        <div style={{
                                            width: '44px', height: '44px', borderRadius: '12px',
                                            background: isPendiente ? '#FEE2E2' : isContactado ? '#EFF6FF' : '#DCFCE7',
                                            color: isPendiente ? '#DC2626' : isContactado ? '#1E40AF' : '#16A34A',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 900, fontSize: '1.1rem', flexShrink: 0
                                        }}>
                                            {caso.nombre[0] || 'P'}
                                        </div>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                                                    {caso.nombre}
                                                </span>
                                                <span style={{
                                                    fontSize: '0.74rem', fontWeight: 800,
                                                    background: '#F1F5F9', color: '#475569',
                                                    padding: '2px 8px', borderRadius: '6px'
                                                }}>
                                                    DNI: {caso.dni}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                                                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1565C0' }}>
                                                    Dr/a. {caso.profesional}
                                                </span>
                                                <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>•</span>
                                                <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
                                                    Agenda: {caso.agenda}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Badges de Conflicto y Estado */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                                            padding: '4px 10px', borderRadius: '10px',
                                            background: '#FEF2F2', border: '1px solid #FECACA',
                                            color: '#DC2626', fontSize: '0.78rem', fontWeight: 800
                                        }}>
                                            <AlertTriangle size={14} />
                                            {caso.cantidadTurnos} turnos reservados
                                            {caso.esMismoDia && ' (Mismo día)'}
                                        </div>

                                        {/* Pill de Estado */}
                                        <div style={{
                                            padding: '4px 12px', borderRadius: '10px',
                                            fontSize: '0.78rem', fontWeight: 800,
                                            background: isPendiente ? '#FEF3C7' : isContactado ? '#DBEAFE' : '#DCFCE7',
                                            color: isPendiente ? '#B45309' : isContactado ? '#1E40AF' : '#16A34A',
                                            border: `1px solid ${isPendiente ? '#FDE68A' : isContactado ? '#BFDBFE' : '#BBF7D0'}`
                                        }}>
                                            {isPendiente ? '⏳ Pendiente' : isContactado ? '💬 Contactado' : '✅ Resuelto'}
                                        </div>

                                        {/* Botón WhatsApp Rápido */}
                                        {caso.telefono && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenWhatsappModal(caso);
                                                }}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '6px',
                                                    padding: '6px 12px', borderRadius: '10px',
                                                    background: '#10B981', color: '#FFFFFF',
                                                    border: 'none', cursor: 'pointer',
                                                    fontSize: '0.8rem', fontWeight: 800,
                                                    boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)'
                                                }}
                                            >
                                                <MessageSquare size={14} />
                                                Enviar WhatsApp
                                            </button>
                                        )}

                                        <div style={{ color: '#94A3B8' }}>
                                            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
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
                                                        <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0D3B66', marginBottom: '4px' }}>
                                                            {t.fechaTurno} a las {t.horaInicio}
                                                        </div>
                                                        <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                                                            Agenda: <span style={{ fontWeight: 700 }}>{t.agenda}</span>
                                                        </div>
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
                                                        onClick={() => onOpenChatWithPhone(caso.telefono)}
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
                                                    Cambiar Estado:
                                                </span>
                                                <button
                                                    disabled={savingKey === caso.key}
                                                    onClick={() => handleUpdateEstado(caso, 'contactado')}
                                                    style={{
                                                        padding: '6px 12px', borderRadius: '8px',
                                                        border: isContactado ? '2px solid #1E40AF' : '1px solid #CBD5E1',
                                                        background: isContactado ? '#EFF6FF' : '#FFFFFF',
                                                        color: '#1E40AF', fontSize: '0.78rem', fontWeight: 800,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    💬 Contactado
                                                </button>
                                                <button
                                                    disabled={savingKey === caso.key}
                                                    onClick={() => handleUpdateEstado(caso, 'resuelto')}
                                                    style={{
                                                        padding: '6px 12px', borderRadius: '8px',
                                                        border: isResuelto ? '2px solid #16A34A' : '1px solid #CBD5E1',
                                                        background: isResuelto ? '#DCFCE7' : '#FFFFFF',
                                                        color: '#16A34A', fontSize: '0.78rem', fontWeight: 800,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    ✅ Resuelto en SALUS
                                                </button>
                                                <button
                                                    disabled={savingKey === caso.key}
                                                    onClick={() => handleUpdateEstado(caso, 'descartado')}
                                                    style={{
                                                        padding: '6px 12px', borderRadius: '8px',
                                                        border: '1px solid #E2E8F0',
                                                        background: '#FFFFFF', color: '#94A3B8',
                                                        fontSize: '0.78rem', fontWeight: 700,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Descartar
                                                </button>
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

                        {/* Selector de Plantilla */}
                        <div style={{ marginBottom: '14px' }}>
                            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>
                                Seleccionar Tipo de Plantilla / Mensaje:
                            </label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {PLANTILLAS_TURNOS_ONLINE.map(p => {
                                    const isSelected = modalData.plantillaId === p.id;
                                    return (
                                        <div
                                            key={p.id}
                                            onClick={() => handleChangePlantilla(p.id)}
                                            style={{
                                                padding: '10px 14px', borderRadius: '12px',
                                                border: isSelected ? '2px solid #10B981' : '1.5px solid #E2E8F0',
                                                background: isSelected ? '#F0FDF4' : '#FFFFFF',
                                                cursor: 'pointer', transition: 'all 0.15s',
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: isSelected ? '#065F46' : '#0F172A' }}>
                                                    {p.titulo}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                                    {p.descripcion}
                                                </div>
                                            </div>
                                            {isSelected && <Check size={18} color="#10B981" />}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Vista previa y edición del mensaje */}
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
                                Se despacha desde la línea oficial del Contact Center firmando como: <strong>{activeAgent?.fullName || activeAgent?.name}</strong>.
                            </div>
                        </div>

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
                                disabled={modalData.sending || !modalData.texto.trim()}
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
        </div>
    );
}
