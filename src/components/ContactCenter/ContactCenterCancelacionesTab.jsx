import React, { useState, useEffect, useMemo } from 'react';
import { 
    CalendarX, CheckCircle2, Clock, Search, RefreshCw, 
    MessageSquare, Copy, Check, Filter, User, Calendar, 
    AlertCircle, Sparkles, ArrowLeft, ExternalLink, X, FileText,
    ShieldAlert, ChevronRight, UserCheck, Trash2
} from 'lucide-react';
import { 
    fetchCancelaciones, 
    marcarCanceladoEnSalus, 
    descartarCancelacion,
    subscribeToCancelaciones 
} from '../../services/cancelacionesService';

export default function ContactCenterCancelacionesTab({ 
    activeAgent, 
    currentUser, 
    addToast, 
    onOpenChatWithPhone, 
    onBackToConsole 
}) {
    const [loading, setLoading] = useState(false);
    const [casos, setCasos] = useState([]);
    const [stats, setStats] = useState({
        totalPendientes: 0,
        totalProcesados: 0,
        totalDescartados: 0,
        procesadosHoy: 0,
        promedioMinutos: 0,
        totalCasos: 0
    });

    const [filtroEstado, setFiltroEstado] = useState('pendiente'); // 'pendiente' | 'procesado_salus' | 'descartado' | 'todos'
    const [filtroFechaTurno, setFiltroFechaTurno] = useState('todos'); // 'todos' | 'hoy' | 'manana' | 'proximos7'
    const [searchTerm, setSearchTerm] = useState('');
    const [copiedDni, setCopiedDni] = useState(null);
    const [actionModal, setActionModal] = useState(null); // { caso, tipo: 'cancelar' | 'descartar', notas: '', saving: false }
    const [showGuia, setShowGuia] = useState(true);

    // Cargar datos
    const loadData = async (isSilent = false) => {
        if (!isSilent) setLoading(true);
        try {
            const res = await fetchCancelaciones({
                estado: 'todos', // Traemos todos y filtramos localmente para stats completas
                search: ''
            });

            if (res.success) {
                setCasos(res.casos || []);
                setStats(res.stats || {});
            } else {
                if (addToast) addToast(res.error || 'Error cargando cancelaciones', 'error');
            }
        } catch (err) {
            console.error('Error cargando cancelaciones:', err);
            if (addToast) addToast('Error de conexión al cargar cancelaciones', 'error');
        } finally {
            if (!isSilent) setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        // Suscripción Realtime a nuevas cancelaciones
        const unsubscribe = subscribeToCancelaciones(() => {
            loadData(true);
        });

        // Auto refresco cada 60 segundos
        const timer = setInterval(() => {
            loadData(true);
        }, 60000);

        return () => {
            unsubscribe();
            clearInterval(timer);
        };
    }, []);

    // Copiar DNI al portapapeles
    const handleCopyDni = (e, dni) => {
        e.stopPropagation();
        if (!dni) return;
        navigator.clipboard.writeText(dni);
        setCopiedDni(dni);
        if (addToast) addToast(`DNI ${dni} copiado para buscar en SALUS`, 'success');
        setTimeout(() => setCopiedDni(null), 2000);
    };

    // Copiar Ficha Completa para SALUS
    const handleCopyFicha = (e, caso) => {
        e.stopPropagation();
        const texto = `DNI: ${caso.dni || ''} | Paciente: ${caso.paciente_nombre || ''} | Turno: ${caso.fecha_turno || ''} ${caso.hora_turno || ''} | Prof: ${caso.medico || ''}`;
        navigator.clipboard.writeText(texto);
        if (addToast) addToast('Datos del turno copiados al portapapeles', 'info');
    };

    // Abrir modal de acción
    const handleOpenActionModal = (caso, tipo) => {
        setActionModal({
            caso,
            tipo,
            notas: tipo === 'descartar' ? 'Ya cancelado previamente en SALUS' : '',
            saving: false
        });
    };

    // Ejecutar acción de marcar o descartar
    const handleConfirmAction = async () => {
        if (!actionModal || !actionModal.caso) return;
        setActionModal(prev => ({ ...prev, saving: true }));

        const agenteId = activeAgent?.id || (currentUser?.usuario || 'agente').toLowerCase().trim();
        const agenteNombre = activeAgent?.name || currentUser?.nombre || 'Agente';

        try {
            let res;
            if (actionModal.tipo === 'cancelar') {
                res = await marcarCanceladoEnSalus({
                    id: actionModal.caso.id,
                    agenteId,
                    agenteNombre,
                    notas: actionModal.notas
                });
                if (res.success) {
                    if (addToast) addToast('✅ Turno marcado como Cancelado en SALUS', 'success');
                } else {
                    if (addToast) addToast(res.error || 'Error al actualizar', 'error');
                }
            } else {
                res = await descartarCancelacion({
                    id: actionModal.caso.id,
                    agenteId,
                    agenteNombre,
                    notas: actionModal.notas
                });
                if (res.success) {
                    if (addToast) addToast('Turno descartado de la bolsa', 'info');
                } else {
                    if (addToast) addToast(res.error || 'Error al descartar', 'error');
                }
            }

            if (res.success) {
                setActionModal(null);
                loadData(true);
            }
        } catch (err) {
            console.error('Error procesando acción:', err);
            if (addToast) addToast('Ocurrió un error al procesar el caso', 'error');
        } finally {
            setActionModal(prev => prev ? ({ ...prev, saving: false }) : null);
        }
    };

    // Filtrado de casos
    const casosFiltrados = useMemo(() => {
        const hoy = new Date();
        const hoyStr = hoy.toISOString().split('T')[0];
        
        const manana = new Date();
        manana.setDate(manana.getDate() + 1);
        const mananaStr = manana.toISOString().split('T')[0];

        const en7Dias = new Date();
        en7Dias.setDate(en7Dias.getDate() + 7);
        const en7DiasStr = en7Dias.toISOString().split('T')[0];

        return casos.filter(c => {
            // Filtro por estado
            if (filtroEstado !== 'todos' && c.estado !== filtroEstado) {
                return false;
            }

            // Filtro por fecha de turno
            if (filtroFechaTurno === 'hoy') {
                if (c.fecha_turno !== hoyStr) return false;
            } else if (filtroFechaTurno === 'manana') {
                if (c.fecha_turno !== mananaStr) return false;
            } else if (filtroFechaTurno === 'proximos7') {
                if (!c.fecha_turno || c.fecha_turno < hoyStr || c.fecha_turno > en7DiasStr) return false;
            }

            // Búsqueda
            if (searchTerm && searchTerm.trim()) {
                const s = searchTerm.toLowerCase().trim();
                const matchDni = c.dni && c.dni.includes(s);
                const matchNombre = c.paciente_nombre && c.paciente_nombre.toLowerCase().includes(s);
                const matchMed = c.medico && c.medico.toLowerCase().includes(s);
                const matchEsp = c.especialidad && c.especialidad.toLowerCase().includes(s);
                const matchPhone = c.phone && c.phone.includes(s);
                if (!matchDni && !matchNombre && !matchMed && !matchEsp && !matchPhone) {
                    return false;
                }
            }

            return true;
        });
    }, [casos, filtroEstado, filtroFechaTurno, searchTerm]);

    // Formateador de tiempo relativo
    const formatTiempo = (isoDate) => {
        if (!isoDate) return '';
        const diffMs = Date.now() - new Date(isoDate).getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        if (diffMins < 1) return 'Hace instantes';
        if (diffMins < 60) return `Hace ${diffMins} min`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `Hace ${diffHours} h`;
        const diffDays = Math.floor(diffHours / 24);
        return `Hace ${diffDays} d`;
    };

    return (
        <div style={{ maxWidth: '1440px', margin: '0 auto', paddingBottom: '40px' }}>
            {/* Header del Módulo */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                padding: '20px 24px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)',
                marginBottom: '20px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        {onBackToConsole && (
                            <button
                                onClick={onBackToConsole}
                                title="Volver a la consola de chats"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '38px',
                                    height: '38px',
                                    borderRadius: '10px',
                                    border: '1px solid #E2E8F0',
                                    background: '#F8FAFC',
                                    color: '#475569',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <ArrowLeft size={18} />
                            </button>
                        )}
                        <div style={{
                            width: '46px',
                            height: '46px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #DC2626 0%, #991B1B 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#FFFFFF',
                            boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)'
                        }}>
                            <CalendarX size={24} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#0F2942', margin: 0, letterSpacing: '-0.02em' }}>
                                    Bolsa de Turnos a Cancelar
                                </h1>
                                {stats.totalPendientes > 0 && (
                                    <span style={{
                                        background: '#FEE2E2',
                                        color: '#DC2626',
                                        fontSize: '12px',
                                        fontWeight: '700',
                                        padding: '2px 10px',
                                        borderRadius: '20px',
                                        border: '1px solid #FECACA'
                                    }}>
                                        {stats.totalPendientes} pendientes
                                    </span>
                                )}
                            </div>
                            <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>
                                Turnos confirmados para cancelar vía WhatsApp. Las agentes los dan de baja uno por uno en SALUS.
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                            onClick={() => loadData()}
                            disabled={loading}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '9px 16px',
                                borderRadius: '10px',
                                border: '1px solid #CBD5E1',
                                background: '#FFFFFF',
                                color: '#334155',
                                fontSize: '13px',
                                fontWeight: '600',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                            {loading ? 'Actualizando...' : 'Actualizar'}
                        </button>
                    </div>
                </div>

                {/* KPI Cards */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '14px',
                    marginTop: '20px'
                }}>
                    {/* Pendientes */}
                    <div style={{
                        background: '#FFFBEB',
                        border: '1px solid #FDE68A',
                        borderRadius: '12px',
                        padding: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div>
                            <div style={{ fontSize: '12px', fontWeight: '700', color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Pendientes en SALUS
                            </div>
                            <div style={{ fontSize: '26px', fontWeight: '800', color: '#92400E', marginTop: '4px' }}>
                                {stats.totalPendientes}
                            </div>
                            <div style={{ fontSize: '11px', color: '#B45309', marginTop: '2px' }}>
                                Por dar de baja
                            </div>
                        </div>
                        <div style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '10px',
                            background: '#FDE68A',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#B45309'
                        }}>
                            <Clock size={22} />
                        </div>
                    </div>

                    {/* Cancelados Hoy */}
                    <div style={{
                        background: '#ECFDF5',
                        border: '1px solid #A7F3D0',
                        borderRadius: '12px',
                        padding: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div>
                            <div style={{ fontSize: '12px', fontWeight: '700', color: '#047857', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Cancelados Hoy
                            </div>
                            <div style={{ fontSize: '26px', fontWeight: '800', color: '#065F46', marginTop: '4px' }}>
                                {stats.procesadosHoy}
                            </div>
                            <div style={{ fontSize: '11px', color: '#059669', marginTop: '2px' }}>
                                Dados de baja en SALUS
                            </div>
                        </div>
                        <div style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '10px',
                            background: '#A7F3D0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#047857'
                        }}>
                            <CheckCircle2 size={22} />
                        </div>
                    </div>

                    {/* Tiempo promedio */}
                    <div style={{
                        background: '#EFF6FF',
                        border: '1px solid #BFDBFE',
                        borderRadius: '12px',
                        padding: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div>
                            <div style={{ fontSize: '12px', fontWeight: '700', color: '#1D4ED8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Tiempo de Resolución
                            </div>
                            <div style={{ fontSize: '26px', fontWeight: '800', color: '#1E40AF', marginTop: '4px' }}>
                                {stats.promedioMinutos ? `${stats.promedioMinutos}m` : '—'}
                            </div>
                            <div style={{ fontSize: '11px', color: '#2563EB', marginTop: '2px' }}>
                                Promedio aviso a baja
                            </div>
                        </div>
                        <div style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '10px',
                            background: '#DBEAFE',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#1D4ED8'
                        }}>
                            <Sparkles size={22} />
                        </div>
                    </div>

                    {/* Total Histórico */}
                    <div style={{
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '12px',
                        padding: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div>
                            <div style={{ fontSize: '12px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Total Gestionados
                            </div>
                            <div style={{ fontSize: '26px', fontWeight: '800', color: '#0F2942', marginTop: '4px' }}>
                                {stats.totalProcesados}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                                Turnos liberados en SALUS
                            </div>
                        </div>
                        <div style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '10px',
                            background: '#E2E8F0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#475569'
                        }}>
                            <FileText size={22} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Banner de Guía Rápida para la Agente */}
            {showGuia && (
                <div style={{
                    background: 'linear-gradient(135deg, #0F2942 0%, #1E3A8A 100%)',
                    borderRadius: '14px',
                    padding: '16px 20px',
                    color: '#FFFFFF',
                    marginBottom: '20px',
                    boxShadow: '0 4px 14px rgba(15, 41, 66, 0.15)',
                    position: 'relative'
                }}>
                    <button
                        onClick={() => setShowGuia(false)}
                        title="Ocultar guía"
                        style={{
                            position: 'absolute',
                            top: '12px',
                            right: '12px',
                            background: 'rgba(255, 255, 255, 0.15)',
                            border: 'none',
                            color: '#FFFFFF',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer'
                        }}
                    >
                        <X size={14} />
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#93C5FD' }}>
                            Manual Rápido de Gestión para la Agente
                        </span>
                    </div>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '14px',
                        fontSize: '12px',
                        lineHeight: '1.4'
                    }}>
                        <div style={{ background: 'rgba(255, 255, 255, 0.08)', padding: '10px 12px', borderRadius: '8px' }}>
                            <strong style={{ color: '#FDE047' }}>1. Copiar DNI:</strong> Hacé clic en el botón 📋 del paciente para llevar el DNI al portapapeles.
                        </div>
                        <div style={{ background: 'rgba(255, 255, 255, 0.08)', padding: '10px 12px', borderRadius: '8px' }}>
                            <strong style={{ color: '#FDE047' }}>2. Buscar en SALUS:</strong> Pegá el DNI en SALUS, abrí la agenda del profesional y localizá el turno.
                        </div>
                        <div style={{ background: 'rgba(255, 255, 255, 0.08)', padding: '10px 12px', borderRadius: '8px' }}>
                            <strong style={{ color: '#FDE047' }}>3. Anular Turno:</strong> Cancelá el turno en SALUS con motivo <em>"Cancelado por paciente (WhatsApp)"</em>.
                        </div>
                        <div style={{ background: 'rgba(255, 255, 255, 0.08)', padding: '10px 12px', borderRadius: '8px' }}>
                            <strong style={{ color: '#FDE047' }}>4. Confirmar en Panel:</strong> Presioná <strong>"Marcar Cancelado en SALUS"</strong> ✅ para registrar tu autoría.
                        </div>
                    </div>
                </div>
            )}

            {/* Barra de Filtros y Búsqueda */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '14px',
                padding: '16px 20px',
                border: '1px solid #E2E8F0',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px'
            }}>
                {/* Selector de Estado */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#F1F5F9', padding: '4px', borderRadius: '10px' }}>
                    <button
                        onClick={() => setFiltroEstado('pendiente')}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '8px',
                            border: 'none',
                            fontSize: '12px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            background: filtroEstado === 'pendiente' ? '#FFFFFF' : 'transparent',
                            color: filtroEstado === 'pendiente' ? '#B45309' : '#64748B',
                            boxShadow: filtroEstado === 'pendiente' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        Pendientes ({stats.totalPendientes})
                    </button>
                    <button
                        onClick={() => setFiltroEstado('procesado_salus')}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '8px',
                            border: 'none',
                            fontSize: '12px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            background: filtroEstado === 'procesado_salus' ? '#FFFFFF' : 'transparent',
                            color: filtroEstado === 'procesado_salus' ? '#047857' : '#64748B',
                            boxShadow: filtroEstado === 'procesado_salus' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        Cancelados en SALUS ({stats.totalProcesados})
                    </button>
                    <button
                        onClick={() => setFiltroEstado('descartado')}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '8px',
                            border: 'none',
                            fontSize: '12px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            background: filtroEstado === 'descartado' ? '#FFFFFF' : 'transparent',
                            color: filtroEstado === 'descartado' ? '#475569' : '#64748B',
                            boxShadow: filtroEstado === 'descartado' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        Descartados ({stats.totalDescartados})
                    </button>
                    <button
                        onClick={() => setFiltroEstado('todos')}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '8px',
                            border: 'none',
                            fontSize: '12px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            background: filtroEstado === 'todos' ? '#FFFFFF' : 'transparent',
                            color: filtroEstado === 'todos' ? '#0F2942' : '#64748B',
                            boxShadow: filtroEstado === 'todos' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        Todos ({stats.totalCasos})
                    </button>
                </div>

                {/* Filtro Fecha de Turno y Buscador */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '600' }}>Fecha Turno:</span>
                        <select
                            value={filtroFechaTurno}
                            onChange={(e) => setFiltroFechaTurno(e.target.value)}
                            style={{
                                padding: '7px 12px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                background: '#FFFFFF',
                                fontSize: '12px',
                                color: '#334155',
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            <option value="todos">Cualquier fecha</option>
                            <option value="hoy">Turnos de Hoy</option>
                            <option value="manana">Turnos de Mañana</option>
                            <option value="proximos7">Próximos 7 días</option>
                        </select>
                    </div>

                    <div style={{ position: 'relative', width: '280px' }}>
                        <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                        <input
                            type="text"
                            placeholder="Buscar DNI, paciente, médico..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '7px 30px 7px 32px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                fontSize: '12px',
                                outline: 'none',
                                boxSizing: 'border-box'
                            }}
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                style={{
                                    position: 'absolute',
                                    right: '8px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    color: '#94A3B8'
                                }}
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Listado de Casos */}
            {casosFiltrados.length === 0 ? (
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '60px 20px',
                    textAlign: 'center',
                    border: '1px solid #E2E8F0',
                    color: '#64748B'
                }}>
                    <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        background: '#F1F5F9',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 16px auto',
                        color: '#94A3B8'
                    }}>
                        <CheckCircle2 size={32} />
                    </div>
                    <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0F2942', margin: '0 0 6px 0' }}>
                        {filtroEstado === 'pendiente' ? '¡Excelente! No hay turnos pendientes de cancelación' : 'No se encontraron cancelaciones'}
                    </h3>
                    <p style={{ fontSize: '13px', margin: 0, color: '#94A3B8' }}>
                        {filtroEstado === 'pendiente' 
                            ? 'Todos los turnos solicitados vía WhatsApp ya fueron dados de baja en SALUS.'
                            : 'Probá cambiando los filtros o el término de búsqueda.'}
                    </p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {casosFiltrados.map((caso) => {
                        const isPendiente = caso.estado === 'pendiente';
                        const isProcesado = caso.estado === 'procesado_salus';
                        const isDescartado = caso.estado === 'descartado';

                        return (
                            <div 
                                key={caso.id}
                                style={{
                                    background: '#FFFFFF',
                                    borderRadius: '12px',
                                    padding: '16px 20px',
                                    border: `1px solid ${isPendiente ? '#FDE68A' : '#E2E8F0'}`,
                                    boxShadow: isPendiente ? '0 2px 6px rgba(245, 158, 11, 0.08)' : '0 1px 3px rgba(0,0,0,0.02)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    flexWrap: 'wrap',
                                    gap: '16px',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                {/* Columna 1: Paciente y DNI */}
                                <div style={{ minWidth: '240px', flex: '1.2' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '8px',
                                            background: '#EFF6FF',
                                            color: '#1D4ED8',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontWeight: '700',
                                            fontSize: '12px'
                                        }}>
                                            {(caso.paciente_nombre || 'P').charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '14px', fontWeight: '800', color: '#0F2942' }}>
                                                {caso.paciente_nombre || 'Paciente'}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                                                {/* Botón rápido Copiar DNI */}
                                                <button
                                                    onClick={(e) => handleCopyDni(e, caso.dni)}
                                                    title="Copiar DNI para SALUS"
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        padding: '2px 8px',
                                                        borderRadius: '6px',
                                                        border: '1px solid #CBD5E1',
                                                        background: copiedDni === caso.dni ? '#DCFCE7' : '#F8FAFC',
                                                        color: copiedDni === caso.dni ? '#15803D' : '#334155',
                                                        fontSize: '11px',
                                                        fontWeight: '700',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                >
                                                    {copiedDni === caso.dni ? (
                                                        <>
                                                            <Check size={11} /> Copiado!
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Copy size={11} /> DNI {caso.dni || 'S/D'}
                                                        </>
                                                    )}
                                                </button>

                                                <span style={{ fontSize: '11px', color: '#64748B' }}>
                                                    Tel: +{caso.phone || 'S/D'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Columna 2: Datos del Turno a Cancelar */}
                                <div style={{ minWidth: '260px', flex: '1.5' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                        <Calendar size={13} style={{ color: '#DC2626' }} />
                                        <span style={{ fontSize: '13px', fontWeight: '700', color: '#DC2626' }}>
                                            {caso.fecha_turno 
                                                ? `${caso.fecha_turno.split('-').reverse().join('/')} ${caso.hora_turno ? `– ${caso.hora_turno.slice(0, 5)} hs` : ''}`
                                                : 'Fecha por verificar'}
                                        </span>
                                        {caso.sede && (
                                            <span style={{
                                                fontSize: '10px',
                                                fontWeight: '600',
                                                padding: '1px 6px',
                                                borderRadius: '4px',
                                                background: '#F1F5F9',
                                                color: '#475569'
                                            }}>
                                                {caso.sede}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '13px', color: '#1E293B', fontWeight: '600' }}>
                                        {caso.medico || 'Médico no especificado'}
                                    </div>
                                    {caso.especialidad && (
                                        <div style={{ fontSize: '11px', color: '#64748B' }}>
                                            {caso.especialidad}
                                        </div>
                                    )}
                                </div>

                                {/* Columna 3: Estado y Auditoría */}
                                <div style={{ minWidth: '180px', flex: '1' }}>
                                    {isPendiente && (
                                        <div>
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                padding: '3px 10px',
                                                borderRadius: '20px',
                                                background: '#FEF3C7',
                                                color: '#92400E',
                                                fontSize: '11px',
                                                fontWeight: '700',
                                                border: '1px solid #FDE68A'
                                            }}>
                                                <Clock size={11} /> Pendiente SALUS
                                            </span>
                                            <div style={{ fontSize: '11px', color: '#B45309', marginTop: '3px' }}>
                                                {formatTiempo(caso.created_at)}
                                            </div>
                                        </div>
                                    )}

                                    {isProcesado && (
                                        <div>
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                padding: '3px 10px',
                                                borderRadius: '20px',
                                                background: '#DCFCE7',
                                                color: '#166534',
                                                fontSize: '11px',
                                                fontWeight: '700',
                                                border: '1px solid #BBF7D0'
                                            }}>
                                                <CheckCircle2 size={11} /> Cancelado en SALUS
                                            </span>
                                            <div style={{ fontSize: '11px', color: '#475569', marginTop: '3px' }}>
                                                por <strong>{caso.agente_nombre || 'Agente'}</strong>
                                            </div>
                                            {caso.notas_agente && (
                                                <div style={{ fontSize: '10px', color: '#64748B', fontStyle: 'italic', marginTop: '2px' }}>
                                                    "{caso.notas_agente}"
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {isDescartado && (
                                        <div>
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                padding: '3px 10px',
                                                borderRadius: '20px',
                                                background: '#F1F5F9',
                                                color: '#64748B',
                                                fontSize: '11px',
                                                fontWeight: '700',
                                                border: '1px solid #CBD5E1'
                                            }}>
                                                Descartado
                                            </span>
                                            {caso.notas_agente && (
                                                <div style={{ fontSize: '10px', color: '#64748B', marginTop: '2px' }}>
                                                    {caso.notas_agente}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Columna 4: Botones de Acción */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                    {/* Botón Ver Chat */}
                                    {onOpenChatWithPhone && (
                                        <button
                                            onClick={() => onOpenChatWithPhone(caso.phone)}
                                            title="Ver conversación de WhatsApp donde canceló"
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '5px',
                                                padding: '8px 12px',
                                                borderRadius: '8px',
                                                border: '1px solid #CBD5E1',
                                                background: '#FFFFFF',
                                                color: '#0F2942',
                                                fontSize: '12px',
                                                fontWeight: '600',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            <MessageSquare size={13} /> Ver Chat
                                        </button>
                                    )}

                                    {/* Botón Copiar Ficha */}
                                    <button
                                        onClick={(e) => handleCopyFicha(e, caso)}
                                        title="Copiar datos completos para SALUS"
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            padding: '8px',
                                            borderRadius: '8px',
                                            border: '1px solid #CBD5E1',
                                            background: '#FFFFFF',
                                            color: '#64748B',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <Copy size={13} />
                                    </button>

                                    {/* Botón Principal: Marcar Cancelado en SALUS */}
                                    {isPendiente && (
                                        <>
                                            <button
                                                onClick={() => handleOpenActionModal(caso, 'cancelar')}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    padding: '8px 14px',
                                                    borderRadius: '8px',
                                                    border: 'none',
                                                    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                                                    color: '#FFFFFF',
                                                    fontSize: '12px',
                                                    fontWeight: '700',
                                                    cursor: 'pointer',
                                                    boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <CheckCircle2 size={14} /> Marcar Cancelado en SALUS
                                            </button>

                                            <button
                                                onClick={() => handleOpenActionModal(caso, 'descartar')}
                                                title="Descartar caso (ej: error o ya anulado)"
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    padding: '8px',
                                                    borderRadius: '8px',
                                                    border: '1px solid #E2E8F0',
                                                    background: '#F8FAFC',
                                                    color: '#94A3B8',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </>
                                    )}

                                    {/* Si ya está procesado, opción de reabrir */}
                                    {!isPendiente && (
                                        <button
                                            onClick={() => handleOpenActionModal(caso, 'cancelar')}
                                            style={{
                                                fontSize: '11px',
                                                color: '#64748B',
                                                background: 'transparent',
                                                border: 'none',
                                                cursor: 'pointer',
                                                textDecoration: 'underline'
                                            }}
                                        >
                                            Editar notas
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal de Acción (Confirmar Cancelación o Descarte) */}
            {actionModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(15, 23, 42, 0.6)',
                    backdropFilter: 'blur(3px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: '20px'
                }}>
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '480px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
                        overflow: 'hidden',
                        animation: 'fadeIn 0.2s ease-out'
                    }}>
                        {/* Header del Modal */}
                        <div style={{
                            padding: '18px 22px',
                            background: actionModal.tipo === 'cancelar' ? '#F0FDF4' : '#F8FAFC',
                            borderBottom: '1px solid #E2E8F0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '10px',
                                    background: actionModal.tipo === 'cancelar' ? '#DCFCE7' : '#E2E8F0',
                                    color: actionModal.tipo === 'cancelar' ? '#166534' : '#475569',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    {actionModal.tipo === 'cancelar' ? <CheckCircle2 size={20} /> : <Trash2 size={20} />}
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#0F2942' }}>
                                        {actionModal.tipo === 'cancelar' ? 'Confirmar Baja en SALUS' : 'Descartar Turno de la Bolsa'}
                                    </h3>
                                    <span style={{ fontSize: '11px', color: '#64748B' }}>
                                        {actionModal.caso.paciente_nombre} (DNI {actionModal.caso.dni})
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => setActionModal(null)}
                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94A3B8' }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Contenido del Modal */}
                        <div style={{ padding: '20px 22px' }}>
                            <div style={{
                                background: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                borderRadius: '10px',
                                padding: '12px 14px',
                                fontSize: '12px',
                                color: '#334155',
                                marginBottom: '16px'
                            }}>
                                <div style={{ fontWeight: '700', color: '#0F2942', marginBottom: '4px' }}>
                                    📅 {actionModal.caso.fecha_turno 
                                        ? `${actionModal.caso.fecha_turno.split('-').reverse().join('/')} ${actionModal.caso.hora_turno ? `a las ${actionModal.caso.hora_turno.slice(0, 5)} hs` : ''}` 
                                        : 'Fecha no especificada'}
                                </div>
                                <div>🩺 <strong>Profesional:</strong> {actionModal.caso.medico || 'No especificado'}</div>
                                {actionModal.caso.sede && <div>🏥 <strong>Sede:</strong> {actionModal.caso.sede}</div>}
                            </div>

                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                                Notas adicionales de la agente (opcional):
                            </label>
                            <textarea
                                value={actionModal.notas}
                                onChange={(e) => setActionModal(prev => ({ ...prev, notas: e.target.value }))}
                                placeholder="Ej: Dado de baja en SALUS por sobreturno, o paciente avisó cambio..."
                                rows={3}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '12px',
                                    outline: 'none',
                                    boxSizing: 'border-box'
                                }}
                            />

                            <div style={{
                                fontSize: '11px',
                                color: '#64748B',
                                marginTop: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}>
                                <UserCheck size={13} style={{ color: '#0284C7' }} />
                                Se registrará la acción a nombre de: <strong>{activeAgent?.name || currentUser?.nombre || 'Agente'}</strong>
                            </div>
                        </div>

                        {/* Footer del Modal */}
                        <div style={{
                            padding: '14px 22px',
                            background: '#F8FAFC',
                            borderTop: '1px solid #E2E8F0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: '10px'
                        }}>
                            <button
                                onClick={() => setActionModal(null)}
                                disabled={actionModal.saving}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    background: '#FFFFFF',
                                    color: '#475569',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmAction}
                                disabled={actionModal.saving}
                                style={{
                                    padding: '8px 18px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: actionModal.tipo === 'cancelar'
                                        ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
                                        : 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                                    color: '#FFFFFF',
                                    fontSize: '12px',
                                    fontWeight: '700',
                                    cursor: actionModal.saving ? 'not-allowed' : 'pointer',
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                                }}
                            >
                                {actionModal.saving 
                                    ? 'Guardando...' 
                                    : (actionModal.tipo === 'cancelar' ? 'Confirmar Cancelado en SALUS' : 'Descartar')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
