import React, { useState, useMemo } from 'react';
import { 
    X, Search, MessageSquare, Phone, User, Calendar, FileText, 
    RotateCcw, HelpCircle, AlertTriangle, MoreHorizontal, Check, 
    Copy, ArrowUpRight, Filter, ShieldCheck, CheckCircle2, Clock
} from 'lucide-react';

const CATEGORIA_ICONS = {
    turnosNuevos: Calendar,
    estudiosAutorizaciones: FileText,
    reprogramacionesCancelaciones: RotateCcw,
    consultasInformativas: HelpCircle,
    guardiaUrgencias: AlertTriangle,
    otros: MoreHorizontal
};

/**
 * Formatea número telefónico para visualización limpia
 */
function formatPhoneNumber(phone) {
    if (!phone) return '-';
    const clean = phone.replace(/\D/g, '');
    if (clean.startsWith('549')) {
        const codArea = clean.substring(3, 6);
        const numero = clean.substring(6);
        return `+54 9 ${codArea} ${numero.substring(0, 3)}-${numero.substring(3)}`;
    }
    if (clean.length === 10) {
        return `${clean.substring(0, 3)} ${clean.substring(3, 6)}-${clean.substring(6)}`;
    }
    return phone;
}

export default function AgentConsultasCategoriaModal({
    isOpen,
    onClose,
    categorias = {},
    initialCategoriaKey = 'turnosNuevos',
    selectedDate,
    agent,
    turnosSalusDetalle = [],
    onOpenChatWithPhone
}) {
    const [selectedKey, setSelectedKey] = useState(initialCategoriaKey);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('todos'); // 'todos' | 'abierto' | 'cerrado' | 'con_salus' | 'sin_salus'
    const [copiedPhone, setCopiedPhone] = useState(null);
    const [copiedDni, setCopiedDni] = useState(null);

    // Mapeo indexado de turnos de SALUS por DNI y Teléfono
    const salusMap = useMemo(() => {
        const byDni = new Map();
        const byPhone = new Map();
        (turnosSalusDetalle || []).forEach(t => {
            const cleanD = String(t.dni || '').replace(/\D/g, '');
            if (cleanD && cleanD.length >= 6) {
                byDni.set(cleanD, t);
            }
            const p1 = String(t.telefono1 || '').replace(/\D/g, '').slice(-8);
            if (p1 && p1.length >= 7) byPhone.set(p1, t);
            const p2 = String(t.telefono2 || '').replace(/\D/g, '').slice(-8);
            if (p2 && p2.length >= 7) byPhone.set(p2, t);
        });
        return { byDni, byPhone };
    }, [turnosSalusDetalle]);

    const getItemSalusMatch = (item) => {
        const cleanDni = String(item.dni || '').replace(/\D/g, '');
        const cleanPhone = String(item.phone || '').replace(/\D/g, '').slice(-8);
        return (cleanDni && salusMap.byDni.get(cleanDni)) || (cleanPhone && salusMap.byPhone.get(cleanPhone)) || null;
    };

    // Sincronizar clave inicial cuando se abre
    React.useEffect(() => {
        if (initialCategoriaKey && categorias[initialCategoriaKey]) {
            setSelectedKey(initialCategoriaKey);
        }
    }, [initialCategoriaKey, isOpen]);

    if (!isOpen) return null;

    const currentCat = categorias[selectedKey] || {
        label: 'Gestiones',
        color: '#0284C7',
        conversaciones: [],
        count: 0
    };

    const CurrentIcon = CATEGORIA_ICONS[selectedKey] || MessageSquare;

    const handleCopyPhone = (phone, e) => {
        e.stopPropagation();
        if (!phone) return;
        navigator.clipboard.writeText(phone).then(() => {
            setCopiedPhone(phone);
            setTimeout(() => setCopiedPhone(null), 2000);
        });
    };

    const handleCopyDni = (dni, e) => {
        e.stopPropagation();
        if (!dni) return;
        navigator.clipboard.writeText(dni).then(() => {
            setCopiedDni(dni);
            setTimeout(() => setCopiedDni(null), 2000);
        });
    };

    const handleGoToChat = (item) => {
        const phone = typeof item === 'object' ? item.phone : item;
        const patientName = typeof item === 'object' ? item.paciente : null;
        if (onOpenChatWithPhone) {
            onOpenChatWithPhone(phone, {
                agent,
                date: selectedDate,
                categoriaKey: selectedKey,
                categoriaLabel: currentCat.label,
                patientName: patientName
            });
        } else {
            // Fallback externo a WhatsApp Web
            const clean = (phone || '').replace(/\D/g, '');
            window.open(`https://wa.me/${clean}`, '_blank');
        }
    };

    // Estadísticas de SALUS en la categoría activa
    const salusStats = useMemo(() => {
        const list = currentCat.conversaciones || [];
        let conSalus = 0;
        let sinSalus = 0;
        list.forEach(item => {
            if (getItemSalusMatch(item)) conSalus++;
            else sinSalus++;
        });
        return { conSalus, sinSalus, total: list.length };
    }, [currentCat, salusMap]);

    // Filtrar conversaciones de la categoría activa
    const filteredConversaciones = useMemo(() => {
        const list = currentCat.conversaciones || [];
        return list.filter(item => {
            const hasSalus = !!getItemSalusMatch(item);

            // Filtro de estado / SALUS
            if (statusFilter === 'abierto' && item.status === 'cerrado') return false;
            if (statusFilter === 'cerrado' && item.status !== 'cerrado') return false;
            if (statusFilter === 'con_salus' && !hasSalus) return false;
            if (statusFilter === 'sin_salus' && hasSalus) return false;

            // Filtro por texto
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase().trim();
            const pac = (item.paciente || '').toLowerCase();
            const tel = (item.phone || '').toLowerCase();
            const dni = (item.dni || '').toString().toLowerCase();
            const mot = (item.motivo || '').toLowerCase();
            const res = (item.resumen || '').toLowerCase();

            return pac.includes(q) || tel.includes(q) || dni.includes(q) || mot.includes(q) || res.includes(q);
        });
    }, [currentCat, searchQuery, statusFilter, salusMap]);

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100000,
            background: 'rgba(15, 23, 42, 0.70)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            animation: 'fadeIn 0.2s ease-out'
        }}>
            <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '960px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '1px solid #E2E8F0',
                overflow: 'hidden'
            }}>
                {/* ── HEADER MODAL ── */}
                <div style={{
                    padding: '16px 22px',
                    borderBottom: '1px solid #E2E8F0',
                    background: 'linear-gradient(135deg, #0F2942 0%, #0369A1 100%)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '12px',
                            background: `${currentCat.color}25`,
                            border: `2px solid ${currentCat.color}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#FFFFFF'
                        }}>
                            <CurrentIcon size={22} style={{ color: currentCat.color }} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h2 style={{ margin: 0, fontSize: '1.12rem', fontWeight: 800, color: '#FFFFFF' }}>
                                    Pacientes por Intención: {currentCat.label}
                                </h2>
                                <span style={{
                                    fontSize: '0.70rem',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    background: 'rgba(255, 255, 255, 0.2)',
                                    color: '#FFFFFF'
                                }}>
                                    {currentCat.count || (currentCat.conversaciones || []).length} pacientes
                                </span>
                            </div>
                            <p style={{ margin: '2px 0 0 0', fontSize: '0.74rem', color: '#E0F2FE' }}>
                                Operadora: <strong>{agent?.fullName || agent?.name || 'Todo el Equipo'}</strong> · Fecha: <strong>{selectedDate}</strong>
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255, 255, 255, 0.15)',
                            border: '1px solid rgba(255, 255, 255, 0.25)',
                            borderRadius: '8px',
                            color: '#FFFFFF',
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                        }}
                        title="Cerrar ventana"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* ── SELECTOR HORIZONTAL DE CATEGORÍAS (TABS) ── */}
                <div style={{
                    padding: '10px 20px',
                    background: '#F8FAFC',
                    borderBottom: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    overflowX: 'auto'
                }}>
                    {Object.entries(categorias).map(([key, cat]) => {
                        const isSelected = selectedKey === key;
                        const IconComponent = CATEGORIA_ICONS[key] || MessageSquare;
                        const count = cat.count || (cat.conversaciones || []).length;

                        return (
                            <button
                                key={key}
                                onClick={() => setSelectedKey(key)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    border: isSelected ? `2px solid ${cat.color}` : '1px solid #E2E8F0',
                                    background: isSelected ? '#FFFFFF' : '#FFFFFF',
                                    color: isSelected ? '#0F172A' : '#64748B',
                                    fontWeight: isSelected ? 800 : 600,
                                    fontSize: '0.74rem',
                                    cursor: 'pointer',
                                    boxShadow: isSelected ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                                    transition: 'all 0.15s ease',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                <span style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    background: cat.color,
                                    flexShrink: 0
                                }} />
                                <span>{cat.label}</span>
                                <span style={{
                                    fontSize: '0.68rem',
                                    padding: '1px 6px',
                                    borderRadius: '10px',
                                    background: isSelected ? `${cat.color}20` : '#F1F5F9',
                                    color: isSelected ? cat.color : '#64748B',
                                    fontWeight: 800
                                }}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* ── BARRA DE BÚSQUEDA Y FILTRO DE ESTADO ── */}
                <div style={{
                    padding: '12px 20px',
                    borderBottom: '1px solid #E2E8F0',
                    background: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap'
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        flex: '1',
                        minWidth: '280px'
                    }}>
                        <Search size={15} color="#94A3B8" />
                        <input
                            type="text"
                            placeholder="Buscar paciente por nombre, DNI, teléfono o motivo..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                border: 'none',
                                background: 'transparent',
                                outline: 'none',
                                fontSize: '0.80rem',
                                color: '#0F172A',
                                width: '100%'
                            }}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 0 }}
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '8px', padding: '2px', border: '1px solid #E2E8F0', flexWrap: 'wrap', gap: '2px' }}>
                            <button
                                onClick={() => setStatusFilter('todos')}
                                style={{
                                    border: 'none',
                                    padding: '4px 9px',
                                    borderRadius: '6px',
                                    fontSize: '0.72rem',
                                    fontWeight: statusFilter === 'todos' ? 800 : 600,
                                    background: statusFilter === 'todos' ? '#FFFFFF' : 'transparent',
                                    color: statusFilter === 'todos' ? '#0F172A' : '#64748B',
                                    cursor: 'pointer',
                                    boxShadow: statusFilter === 'todos' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'
                                }}
                            >
                                Todos ({currentCat.conversaciones?.length || 0})
                            </button>
                            {selectedKey === 'turnosNuevos' && (
                                <>
                                    <button
                                        onClick={() => setStatusFilter('con_salus')}
                                        style={{
                                            border: 'none',
                                            padding: '4px 9px',
                                            borderRadius: '6px',
                                            fontSize: '0.72rem',
                                            fontWeight: statusFilter === 'con_salus' ? 800 : 600,
                                            background: statusFilter === 'con_salus' ? '#FFFFFF' : 'transparent',
                                            color: statusFilter === 'con_salus' ? '#059669' : '#64748B',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            boxShadow: statusFilter === 'con_salus' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'
                                        }}
                                    >
                                        <CheckCircle2 size={11} color="#059669" />
                                        <span>En SALUS ({salusStats.conSalus})</span>
                                    </button>
                                    <button
                                        onClick={() => setStatusFilter('sin_salus')}
                                        style={{
                                            border: 'none',
                                            padding: '4px 9px',
                                            borderRadius: '6px',
                                            fontSize: '0.72rem',
                                            fontWeight: statusFilter === 'sin_salus' ? 800 : 600,
                                            background: statusFilter === 'sin_salus' ? '#FFFFFF' : 'transparent',
                                            color: statusFilter === 'sin_salus' ? '#DC2626' : '#64748B',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            boxShadow: statusFilter === 'sin_salus' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'
                                        }}
                                    >
                                        <AlertTriangle size={11} color="#DC2626" />
                                        <span>Sin Carga en SALUS ({salusStats.sinSalus})</span>
                                    </button>
                                </>
                            )}
                            <button
                                onClick={() => setStatusFilter('abierto')}
                                style={{
                                    border: 'none',
                                    padding: '4px 9px',
                                    borderRadius: '6px',
                                    fontSize: '0.72rem',
                                    fontWeight: statusFilter === 'abierto' ? 800 : 600,
                                    background: statusFilter === 'abierto' ? '#FFFFFF' : 'transparent',
                                    color: statusFilter === 'abierto' ? '#16A34A' : '#64748B',
                                    cursor: 'pointer',
                                    boxShadow: statusFilter === 'abierto' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'
                                }}
                            >
                                En Atención
                            </button>
                            <button
                                onClick={() => setStatusFilter('cerrado')}
                                style={{
                                    border: 'none',
                                    padding: '4px 9px',
                                    borderRadius: '6px',
                                    fontSize: '0.72rem',
                                    fontWeight: statusFilter === 'cerrado' ? 800 : 600,
                                    background: statusFilter === 'cerrado' ? '#FFFFFF' : 'transparent',
                                    color: statusFilter === 'cerrado' ? '#0284C7' : '#64748B',
                                    cursor: 'pointer',
                                    boxShadow: statusFilter === 'cerrado' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'
                                }}
                            >
                                Finalizados
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── LISTADO NOMINAL DE PACIENTES ── */}
                <div style={{
                    padding: '16px 20px',
                    overflowY: 'auto',
                    flex: '1',
                    background: '#F8FAFC'
                }}>
                    {filteredConversaciones.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {filteredConversaciones.map((item, idx) => {
                                const isClosed = item.status === 'cerrado';
                                const initials = (item.paciente || 'P')
                                    .split(' ')
                                    .slice(0, 2)
                                    .map(w => w[0])
                                    .join('')
                                    .toUpperCase() || 'P';

                                const isTurnoCat = selectedKey === 'turnosNuevos' || (item.motivo || '').toLowerCase().includes('turno');
                                const salusMatch = getItemSalusMatch(item);

                                // Estilo dinámico de la card según alerta de SALUS
                                let cardBorder = '1px solid #E2E8F0';
                                let cardBorderLeft = '1px solid #E2E8F0';
                                let cardBg = '#FFFFFF';

                                if (isTurnoCat) {
                                    if (salusMatch) {
                                        cardBorder = '1px solid #A7F3D0';
                                        cardBorderLeft = '4px solid #10B981';
                                        cardBg = '#FFFFFF';
                                    } else if (isClosed) {
                                        cardBorder = '1.5px solid #FCA5A5';
                                        cardBorderLeft = '4px solid #EF4444';
                                        cardBg = '#FEF2F2';
                                    } else {
                                        cardBorder = '1px solid #FDE68A';
                                        cardBorderLeft = '4px solid #F59E0B';
                                        cardBg = '#FFFDF5';
                                    }
                                }

                                return (
                                    <div
                                        key={item.id || item.phone || idx}
                                        style={{
                                            background: cardBg,
                                            borderRadius: '10px',
                                            border: cardBorder,
                                            borderLeft: cardBorderLeft,
                                            padding: '12px 16px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '16px',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        {/* Avatar e Información Principal */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1', minWidth: 0 }}>
                                            <div style={{
                                                width: '40px',
                                                height: '40px',
                                                borderRadius: '50%',
                                                background: `${currentCat.color}15`,
                                                color: currentCat.color,
                                                border: `1px solid ${currentCat.color}30`,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontWeight: 800,
                                                fontSize: '0.85rem',
                                                flexShrink: 0
                                            }}>
                                                {initials}
                                            </div>

                                            <div style={{ minWidth: 0, flex: '1' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>
                                                        {item.paciente}
                                                    </span>

                                                    {item.dni && (
                                                        <span 
                                                            onClick={(e) => handleCopyDni(item.dni, e)}
                                                            title="Click para copiar DNI"
                                                            style={{
                                                                fontSize: '0.68rem',
                                                                fontWeight: 700,
                                                                padding: '1px 6px',
                                                                borderRadius: '4px',
                                                                background: '#F1F5F9',
                                                                color: '#475569',
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '3px'
                                                            }}
                                                        >
                                                            DNI: {item.dni}
                                                            {copiedDni === item.dni ? <Check size={11} color="#16A34A" /> : <Copy size={10} color="#94A3B8" />}
                                                        </span>
                                                    )}

                                                    <span 
                                                        onClick={(e) => handleCopyPhone(item.phone, e)}
                                                        title="Click para copiar teléfono"
                                                        style={{
                                                            fontSize: '0.70rem',
                                                            color: '#64748B',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '3px',
                                                            cursor: 'pointer',
                                                            background: '#F8FAFC',
                                                            padding: '1px 6px',
                                                            borderRadius: '4px',
                                                            border: '1px solid #E2E8F0'
                                                        }}
                                                    >
                                                        <Phone size={10} color="#64748B" />
                                                        {formatPhoneNumber(item.phone)}
                                                        {copiedPhone === item.phone ? <Check size={11} color="#16A34A" /> : <Copy size={10} color="#94A3B8" />}
                                                    </span>
                                                </div>

                                                {/* Motivo o Trámite */}
                                                <div style={{ marginTop: '4px', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                                                    <span style={{
                                                        fontSize: '0.68rem',
                                                        fontWeight: 700,
                                                        background: `${currentCat.color}15`,
                                                        color: currentCat.color,
                                                        padding: '1px 6px',
                                                        borderRadius: '4px',
                                                        whiteSpace: 'nowrap',
                                                        flexShrink: 0
                                                    }}>
                                                        {currentCat.label}
                                                    </span>
                                                    <span style={{
                                                        fontSize: '0.74rem',
                                                        color: '#334155',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                        maxWidth: '480px'
                                                    }} title={item.motivo || item.resumen}>
                                                        {item.motivo || item.resumen}
                                                    </span>
                                                </div>

                                                {/* Detalle secundario / Resolución */}
                                                <div style={{ marginTop: '2px', fontSize: '0.68rem', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    {item.agente && (
                                                        <span>Atendió: <strong style={{ color: '#64748B' }}>{item.agente}</strong></span>
                                                    )}
                                                    {item.resolution_reason && (
                                                        <span>· Cierre: <em>{item.resolution_reason}</em></span>
                                                    )}
                                                </div>

                                                {/* TRAZABILIDAD CON SALUS (Para solicitudes de turnos) */}
                                                {isTurnoCat && (
                                                    <div style={{ marginTop: '6px' }}>
                                                        {salusMatch ? (
                                                            <div style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '6px',
                                                                background: '#ECFDF5',
                                                                color: '#065F46',
                                                                border: '1px solid #A7F3D0',
                                                                borderRadius: '6px',
                                                                padding: '3px 8px',
                                                                fontSize: '0.70rem',
                                                                fontWeight: 700
                                                            }}>
                                                                <CheckCircle2 size={12} color="#10B981" />
                                                                <span>
                                                                    Cargado en SALUS: <strong>{salusMatch.fechaVisita} {salusMatch.horaVisita?.slice(0, 5)} hs</strong> · {salusMatch.especialidad} ({salusMatch.medico?.split(' ')[0]}) · {salusMatch.obraSocial || 'Sin obra social'}
                                                                </span>
                                                            </div>
                                                        ) : isClosed ? (
                                                            <div style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '6px',
                                                                background: '#FEE2E2',
                                                                color: '#991B1B',
                                                                border: '1px solid #F87171',
                                                                borderRadius: '6px',
                                                                padding: '3px 8px',
                                                                fontSize: '0.70rem',
                                                                fontWeight: 800
                                                            }}>
                                                                <AlertTriangle size={12} color="#DC2626" />
                                                                <span>ALERTA: Paciente solicitó turno y la conversación cerró pero NO figura turno registrado en SALUS</span>
                                                            </div>
                                                        ) : (
                                                            <div style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '6px',
                                                                background: '#FEF3C7',
                                                                color: '#92400E',
                                                                border: '1px solid #FCD34D',
                                                                borderRadius: '6px',
                                                                padding: '3px 8px',
                                                                fontSize: '0.70rem',
                                                                fontWeight: 700
                                                            }}>
                                                                <Clock size={12} color="#D97706" />
                                                                <span>Turno solicitado · Pendiente de cargar en agenda SALUS</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Estado y Botón de Ir al Chat */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                                            <span style={{
                                                fontSize: '0.68rem',
                                                fontWeight: 700,
                                                padding: '3px 8px',
                                                borderRadius: '6px',
                                                background: isClosed ? '#F1F5F9' : '#DCFCE7',
                                                color: isClosed ? '#64748B' : '#15803D',
                                                border: `1px solid ${isClosed ? '#E2E8F0' : '#86EFAC'}`
                                            }}>
                                                {isClosed ? 'Finalizado' : 'En Atención'}
                                            </span>

                                            <button
                                                onClick={() => handleGoToChat(item)}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    background: '#0284C7',
                                                    color: '#FFFFFF',
                                                    border: 'none',
                                                    borderRadius: '8px',
                                                    padding: '7px 12px',
                                                    fontSize: '0.78rem',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    boxShadow: '0 2px 4px rgba(2, 132, 199, 0.25)',
                                                    transition: 'all 0.15s ease'
                                                }}
                                                title={`Ir a la conversación activa de ${item.paciente}`}
                                            >
                                                <MessageSquare size={14} />
                                                <span>Ir al Chat</span>
                                                <ArrowUpRight size={13} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div style={{
                            padding: '48px 20px',
                            textAlign: 'center',
                            background: '#FFFFFF',
                            borderRadius: '12px',
                            border: '1px dashed #CBD5E1'
                        }}>
                            <div style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: '50%',
                                background: '#F1F5F9',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#94A3B8',
                                marginBottom: '12px'
                            }}>
                                <CurrentIcon size={24} />
                            </div>
                            <h4 style={{ margin: '0 0 6px 0', fontSize: '0.92rem', color: '#0F172A', fontWeight: 700 }}>
                                {searchQuery ? 'No se encontraron pacientes para esta búsqueda' : `No hay pacientes en "${currentCat.label}"`}
                            </h4>
                            <p style={{ margin: 0, fontSize: '0.76rem', color: '#64748B', maxWidth: '380px', display: 'inline-block' }}>
                                {searchQuery 
                                    ? 'Prueba modificando los términos de búsqueda o seleccionando otra categoría arriba.' 
                                    : 'Durante esta jornada no se clasificaron gestiones bajo este tipo de consulta.'}
                            </p>
                        </div>
                    )}
                </div>

                {/* ── FOOTER MODAL ── */}
                <div style={{
                    padding: '12px 22px',
                    borderTop: '1px solid #E2E8F0',
                    background: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ fontSize: '0.76rem', color: '#64748B' }}>
                        Mostrando <strong>{filteredConversaciones.length}</strong> de <strong>{currentCat.conversaciones?.length || 0}</strong> pacientes de <strong>{currentCat.label}</strong>
                    </div>

                    <button
                        onClick={onClose}
                        style={{
                            background: '#F1F5F9',
                            color: '#475569',
                            border: '1px solid #CBD5E1',
                            borderRadius: '8px',
                            padding: '7px 16px',
                            fontSize: '0.78rem',
                            fontWeight: 700,
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
