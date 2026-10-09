import React, { useState, useEffect, useMemo } from 'react';
import { 
    X, Search, Stethoscope, MessageSquare, CheckCircle2, AlertCircle, 
    Copy, Check, Users, ArrowUpRight, Filter, Phone, Calendar, Clock, 
    ExternalLink, ShieldCheck, UserCheck, Sparkles, RefreshCw
} from 'lucide-react';
import { mapTurnosWithWhatsApp } from '../../services/agentShiftService';

export default function AgentTurnosMappingModal({
    isOpen,
    onClose,
    agent,
    selectedDate,
    turnosRawList = [],
    onOpenChatWithPhone
}) {
    const [loading, setLoading] = useState(true);
    const [mappedTurnos, setMappedTurnos] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('todos'); // 'todos' | 'dni' | 'familiares' | 'sin_match'
    const [copiedDni, setCopiedDni] = useState(null);

    // Cargar el mapeo inteligente de turnos con WhatsApp
    useEffect(() => {
        if (!isOpen) return;

        let isMounted = true;
        setLoading(true);

        mapTurnosWithWhatsApp(turnosRawList, selectedDate)
            .then(data => {
                if (isMounted) {
                    setMappedTurnos(data);
                    setLoading(false);
                }
            })
            .catch(err => {
                console.error('[AgentTurnosMappingModal] Error mapeando turnos:', err);
                if (isMounted) {
                    setMappedTurnos(turnosRawList.map(t => ({ ...t, matchType: 'none' })));
                    setLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [isOpen, turnosRawList, selectedDate]);

    // Copiar DNI al portapapeles
    const handleCopyDni = (dni, e) => {
        e.stopPropagation();
        if (!dni) return;
        navigator.clipboard.writeText(dni).then(() => {
            setCopiedDni(dni);
            setTimeout(() => setCopiedDni(null), 2000);
        });
    };

    // Estadísticas
    const stats = useMemo(() => {
        const total = mappedTurnos.length;
        const dniMatches = mappedTurnos.filter(t => t.matchType === 'dni_message' || t.matchType === 'dni_conv').length;
        const familyMatches = mappedTurnos.filter(t => t.isFamilyBooking).length;
        const phoneMatches = mappedTurnos.filter(t => t.matchType === 'phone').length;
        const sinMatch = mappedTurnos.filter(t => t.matchType === 'none').length;
        const pctEfectividad = total > 0 ? Math.round(((dniMatches + phoneMatches) / total) * 100) : 0;

        return {
            total,
            dniMatches,
            familyMatches,
            phoneMatches,
            sinMatch,
            pctEfectividad
        };
    }, [mappedTurnos]);

    // Filtrar turnos
    const filteredTurnos = useMemo(() => {
        return mappedTurnos.filter(t => {
            // Filtro por tab activo
            if (activeFilter === 'dni' && !(t.matchType === 'dni_message' || t.matchType === 'dni_conv')) return false;
            if (activeFilter === 'familiares' && !t.isFamilyBooking) return false;
            if (activeFilter === 'sin_match' && t.matchType !== 'none') return false;

            // Filtro por texto de búsqueda
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase().trim();
            return (
                (t.paciente || '').toLowerCase().includes(q) ||
                (t.dni || '').includes(q) ||
                (t.especialidad || '').toLowerCase().includes(q) ||
                (t.medico || '').toLowerCase().includes(q) ||
                (t.telefono1 || '').includes(q) ||
                (t.matchedPhone || '').includes(q) ||
                (t.matchedSender || '').toLowerCase().includes(q) ||
                (t.matchedSnippet || '').toLowerCase().includes(q)
            );
        });
    }, [mappedTurnos, activeFilter, searchQuery]);

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100000,
            background: 'rgba(15, 23, 42, 0.70)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            animation: 'fadeIn 0.2s ease-out'
        }}>
            <div style={{
                background: '#FFFFFF',
                borderRadius: '18px',
                width: '100%',
                maxWidth: '1080px',
                maxHeight: '92vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 35px -5px rgba(0, 0, 0, 0.25), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                border: '1px solid #CBD5E1',
                overflow: 'hidden'
            }}>
                {/* ── CABECERA ── */}
                <div style={{
                    padding: '18px 24px',
                    borderBottom: '1px solid #E2E8F0',
                    background: 'linear-gradient(135deg, #003B71 0%, #0F2942 100%)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '12px',
                            background: 'rgba(255, 255, 255, 0.15)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid rgba(255, 255, 255, 0.2)'
                        }}>
                            <Stethoscope size={24} color="#38BDF8" />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <h2 style={{ margin: 0, fontSize: '1.20rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                                    Auditoría de Turnos SALUS y Mapeo con WhatsApp
                                </h2>
                                <span style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 800,
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    background: '#10B981',
                                    color: '#FFFFFF'
                                }}>
                                    Búsqueda por DNI
                                </span>
                            </div>
                            <p style={{ margin: '3px 0 0 0', fontSize: '0.78rem', color: '#BAE6FD', opacity: 0.95 }}>
                                Operadora: <strong>{agent?.fullName || agent?.name || 'Agente'}</strong> • Fecha: {selectedDate} • {mappedTurnos.length} turnos registrados
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255, 255, 255, 0.12)',
                            border: 'none',
                            color: '#FFFFFF',
                            width: '34px',
                            height: '34px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* ── BARRA RESUMEN DE INDICADORES (KPIs) ── */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '12px',
                    padding: '16px 24px',
                    background: '#F8FAFC',
                    borderBottom: '1px solid #E2E8F0'
                }}>
                    <div style={{ background: '#FFFFFF', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                        <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                            Total Citas SALUS
                        </span>
                        <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#0F2942', marginTop: '2px' }}>
                            {stats.total}
                        </div>
                        <span style={{ fontSize: '0.68rem', color: '#0284C7', fontWeight: 600 }}>
                            Creadas en el corte diario
                        </span>
                    </div>

                    <div style={{ background: '#FFFFFF', padding: '12px 14px', borderRadius: '10px', border: '1px solid #BBF7D0' }}>
                        <span style={{ fontSize: '0.68rem', color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>
                            Mapeados por DNI
                        </span>
                        <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#15803D', marginTop: '2px' }}>
                            {stats.dniMatches} <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#16A34A' }}>({stats.pctEfectividad}%)</span>
                        </div>
                        <span style={{ fontSize: '0.68rem', color: '#166534', fontWeight: 600 }}>
                            Chat WhatsApp identificado
                        </span>
                    </div>

                    <div style={{ background: '#FFFFFF', padding: '12px 14px', borderRadius: '10px', border: '1px solid #DDD6FE' }}>
                        <span style={{ fontSize: '0.68rem', color: '#6D28D9', fontWeight: 700, textTransform: 'uppercase' }}>
                            Gestiones de Familiares
                        </span>
                        <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#7C3AED', marginTop: '2px' }}>
                            {stats.familyMatches}
                        </div>
                        <span style={{ fontSize: '0.68rem', color: '#6D28D9', fontWeight: 600 }}>
                            Madre / Padre / Tercero pidió turno
                        </span>
                    </div>

                    <div style={{ background: '#FFFFFF', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                        <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                            Sin Chat Detectado
                        </span>
                        <div style={{ fontSize: '1.45rem', fontWeight: 900, color: stats.sinMatch > 0 ? '#D97706' : '#64748B', marginTop: '2px' }}>
                            {stats.sinMatch}
                        </div>
                        <span style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 600 }}>
                            Llamada o Presencial
                        </span>
                    </div>
                </div>

                {/* ── BUSCADOR Y PESTAÑAS DE FILTRO ── */}
                <div style={{
                    padding: '14px 24px',
                    borderBottom: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px'
                }}>
                    {/* Input de Búsqueda */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: '#F1F5F9',
                        padding: '8px 12px',
                        borderRadius: '10px',
                        border: '1px solid #CBD5E1',
                        flex: '1',
                        minWidth: '280px',
                        maxWidth: '450px'
                    }}>
                        <Search size={15} color="#64748B" />
                        <input
                            type="text"
                            placeholder="Buscar por Paciente, DNI, Médico, Especialidad o Chat..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                border: 'none',
                                background: 'transparent',
                                outline: 'none',
                                fontSize: '0.78rem',
                                color: '#1E293B',
                                width: '100%',
                                fontWeight: 500
                            }}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                            >
                                <X size={14} color="#94A3B8" />
                            </button>
                        )}
                    </div>

                    {/* Filtros por Píldoras */}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={() => setActiveFilter('todos')}
                            style={{
                                padding: '6px 12px', borderRadius: '8px', border: 'none',
                                fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                                background: activeFilter === 'todos' ? '#003B71' : '#F1F5F9',
                                color: activeFilter === 'todos' ? '#FFFFFF' : '#475569',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            Todos ({stats.total})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveFilter('dni')}
                            style={{
                                padding: '6px 12px', borderRadius: '8px', border: 'none',
                                fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                                background: activeFilter === 'dni' ? '#15803D' : '#F0FDF4',
                                color: activeFilter === 'dni' ? '#FFFFFF' : '#166534',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            🟢 Vinculados por DNI ({stats.dniMatches})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveFilter('familiares')}
                            style={{
                                padding: '6px 12px', borderRadius: '8px', border: 'none',
                                fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                                background: activeFilter === 'familiares' ? '#7C3AED' : '#F5F3FF',
                                color: activeFilter === 'familiares' ? '#FFFFFF' : '#6D28D9',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            👥 Familiares / Terceros ({stats.familyMatches})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveFilter('sin_match')}
                            style={{
                                padding: '6px 12px', borderRadius: '8px', border: 'none',
                                fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                                background: activeFilter === 'sin_match' ? '#D97706' : '#FFFBEB',
                                color: activeFilter === 'sin_match' ? '#FFFFFF' : '#92400E',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            ⚪ Sin Chat ({stats.sinMatch})
                        </button>
                    </div>
                </div>

                {/* ── CUERPO CON LA LISTA DE TURNOS ── */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                    {loading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '12px' }}>
                            <RefreshCw size={28} color="#0284C7" className="animate-spin" />
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F2942' }}>
                                Auditando y mapeando turnos con los chats de WhatsApp...
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                                Contrastando DNIs y mensajes enviados por familiares en tiempo real.
                            </div>
                        </div>
                    ) : filteredTurnos.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748B' }}>
                            <AlertCircle size={32} color="#94A3B8" style={{ margin: '0 auto 10px auto' }} />
                            <div style={{ fontSize: '0.90rem', fontWeight: 700, color: '#334155' }}>
                                No se encontraron turnos con los filtros seleccionados
                            </div>
                            <p style={{ margin: '4px 0 0 0', fontSize: '0.76rem' }}>
                                Prueba ajustando los términos de búsqueda o cambiando el filtro superior.
                            </p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {filteredTurnos.map((turno, idx) => {
                                const hasDniMatch = turno.matchType === 'dni_message' || turno.matchType === 'dni_conv';
                                const hasPhoneMatch = turno.matchType === 'phone';

                                return (
                                    <div
                                        key={turno.idVisita || idx}
                                        style={{
                                            background: '#FFFFFF',
                                            borderRadius: '12px',
                                            border: '1px solid #E2E8F0',
                                            padding: '14px 18px',
                                            display: 'grid',
                                            gridTemplateColumns: 'minmax(320px, 1.2fr) minmax(320px, 1.3fr)',
                                            gap: '16px',
                                            alignItems: 'start',
                                            transition: 'all 0.15s ease',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.borderColor = '#0284C7';
                                            e.currentTarget.style.boxShadow = '0 3px 8px rgba(2, 132, 199, 0.08)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.borderColor = '#E2E8F0';
                                            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.02)';
                                        }}
                                    >
                                        {/* COLUMNA 1: DATOS DEL TURNO EN SALUS */}
                                        <div style={{ borderRight: '1px solid #F1F5F9', paddingRight: '14px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{
                                                        width: '20px', height: '20px', borderRadius: '50%',
                                                        background: '#F1F5F9', color: '#475569',
                                                        fontSize: '0.65rem', fontWeight: 800,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                    }}>
                                                        {idx + 1}
                                                    </span>
                                                    <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0F2942' }}>
                                                        {turno.paciente}
                                                    </h3>
                                                </div>
                                                <span style={{ fontSize: '0.66rem', color: '#64748B', fontWeight: 600 }}>
                                                    Hora Creado: <strong>{turno.horaCreacion || 'Hoy'}</strong>
                                                </span>
                                            </div>

                                            {/* DNI Chip y Obra Social */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '6px 0', flexWrap: 'wrap' }}>
                                                <button
                                                    onClick={(e) => handleCopyDni(turno.dni, e)}
                                                    title="Copiar DNI del paciente"
                                                    style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                        background: '#EFF6FF', border: '1px solid #BAE6FD',
                                                        color: '#0369A1', padding: '2px 8px', borderRadius: '6px',
                                                        fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer'
                                                    }}
                                                >
                                                    <span>DNI: {turno.dni || 'Sin DNI'}</span>
                                                    {copiedDni === turno.dni ? <Check size={12} color="#16A34A" /> : <Copy size={11} />}
                                                </button>

                                                {turno.obraSocial && (
                                                    <span style={{
                                                        background: '#F8FAFC', border: '1px solid #E2E8F0',
                                                        color: '#475569', padding: '2px 8px', borderRadius: '6px',
                                                        fontSize: '0.68rem', fontWeight: 600
                                                    }}>
                                                        {turno.obraSocial}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Detalle Médico y Especialidad */}
                                            <div style={{ fontSize: '0.76rem', color: '#334155', marginTop: '6px' }}>
                                                <div>
                                                    <strong style={{ color: '#0284C7' }}>{turno.especialidad || 'CONSULTA MÉDICA'}</strong>
                                                    {turno.medico ? ` • ${turno.medico}` : ''}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', fontSize: '0.70rem', color: '#64748B' }}>
                                                    <span>📅 Fecha Cita: <strong>{turno.fechaVisita}</strong></span>
                                                    <span>⏰ Hora: <strong>{turno.horaVisita}</strong></span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* COLUMNA 2: MAPEO INTELIGENTE WHATSAPP */}
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    {hasDniMatch ? (
                                                        <span style={{
                                                            background: turno.isFamilyBooking ? '#FAF5FF' : '#F0FDF4',
                                                            border: `1px solid ${turno.isFamilyBooking ? '#DDD6FE' : '#BBF7D0'}`,
                                                            color: turno.isFamilyBooking ? '#7C3AED' : '#15803D',
                                                            padding: '2px 8px', borderRadius: '6px',
                                                            fontSize: '0.68rem', fontWeight: 800,
                                                            display: 'flex', alignItems: 'center', gap: '4px'
                                                        }}>
                                                            {turno.isFamilyBooking ? <Users size={12} /> : <CheckCircle2 size={12} />}
                                                            {turno.isFamilyBooking 
                                                                ? 'Solicitud Familiar / Tercero (Match DNI)'
                                                                : 'Vinculado por DNI en WhatsApp'
                                                            }
                                                        </span>
                                                    ) : hasPhoneMatch ? (
                                                        <span style={{
                                                            background: '#EFF6FF', border: '1px solid #BAE6FD', color: '#0369A1',
                                                            padding: '2px 8px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: 800,
                                                            display: 'flex', alignItems: 'center', gap: '4px'
                                                        }}>
                                                            <Phone size={12} />
                                                            Vinculado por Teléfono Directo
                                                        </span>
                                                    ) : (
                                                        <span style={{
                                                            background: '#FFFBEB', border: '1px solid #FDE68A', color: '#B45309',
                                                            padding: '2px 8px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: 800,
                                                            display: 'flex', alignItems: 'center', gap: '4px'
                                                        }}>
                                                            <AlertCircle size={12} />
                                                            Sin chat de WhatsApp detectado
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Botón de acción para abrir chat si existe */}
                                                {turno.matchedPhone && (
                                                    <button
                                                        onClick={() => {
                                                            if (onOpenChatWithPhone) {
                                                                onOpenChatWithPhone(turno.matchedPhone);
                                                                onClose();
                                                            }
                                                        }}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: '4px',
                                                            background: '#003B71', color: '#FFFFFF',
                                                            border: 'none', padding: '4px 10px', borderRadius: '6px',
                                                            fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer',
                                                            boxShadow: '0 1px 3px rgba(0, 59, 113, 0.2)',
                                                            transition: 'background 0.15s ease'
                                                        }}
                                                        onMouseEnter={(e) => e.currentTarget.style.background = '#0284C7'}
                                                        onMouseLeave={(e) => e.currentTarget.style.background = '#003B71'}
                                                    >
                                                        <MessageSquare size={11} />
                                                        Abrir Chat
                                                        <ExternalLink size={10} />
                                                    </button>
                                                )}
                                            </div>

                                            {/* Datos del contacto que escribió */}
                                            {turno.matchedPhone ? (
                                                <div style={{
                                                    background: '#F8FAFC',
                                                    borderRadius: '8px',
                                                    padding: '8px 10px',
                                                    border: '1px solid #E2E8F0',
                                                    fontSize: '0.72rem'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1E293B', fontWeight: 700 }}>
                                                            <span>💬 Contacto:</span>
                                                            <strong style={{ color: '#003B71' }}>{turno.matchedSender || 'Usuario WhatsApp'}</strong>
                                                            <span style={{ color: '#64748B', fontWeight: 600 }}>({turno.matchedPhone})</span>
                                                        </div>
                                                    </div>

                                                    {/* Fragmento del mensaje */}
                                                    {turno.matchedSnippet ? (
                                                        <div style={{
                                                            color: '#475569',
                                                            fontStyle: 'italic',
                                                            lineHeight: 1.4,
                                                            background: '#FFFFFF',
                                                            padding: '6px 8px',
                                                            borderRadius: '6px',
                                                            border: '1px solid #F1F5F9',
                                                            marginTop: '4px',
                                                            maxHeight: '60px',
                                                            overflowY: 'auto'
                                                        }}>
                                                            "{turno.matchedSnippet.length > 180 ? turno.matchedSnippet.substring(0, 180) + '...' : turno.matchedSnippet}"
                                                        </div>
                                                    ) : (
                                                        <div style={{ color: '#94A3B8', fontStyle: 'italic', marginTop: '2px' }}>
                                                            Conversación registrada con este DNI.
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div style={{
                                                    background: '#FAFAFA',
                                                    borderRadius: '8px',
                                                    padding: '8px 10px',
                                                    border: '1px dashed #CBD5E1',
                                                    fontSize: '0.70rem',
                                                    color: '#64748B',
                                                    lineHeight: 1.4
                                                }}>
                                                    El paciente o familiar gestionó la cita directamente por llamada telefónica o en mesón de recepción presencial. Teléfono SALUS: <strong>{turno.telefono1 || 'No informado'}</strong>.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── FOOTER DEL MODAL ── */}
                <div style={{
                    padding: '12px 24px',
                    borderTop: '1px solid #E2E8F0',
                    background: '#F8FAFC',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.74rem'
                }}>
                    <span style={{ color: '#64748B' }}>
                        Mostrando <strong>{filteredTurnos.length}</strong> de <strong>{mappedTurnos.length}</strong> citas médicas
                    </span>
                    <button
                        onClick={onClose}
                        style={{
                            background: '#FFFFFF',
                            border: '1px solid #CBD5E1',
                            padding: '6px 14px',
                            borderRadius: '8px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            color: '#334155',
                            cursor: 'pointer'
                        }}
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
