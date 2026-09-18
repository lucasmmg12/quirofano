import React, { useState, useEffect, useRef } from 'react';
import { 
    Search, Paperclip, Send, Lock, Tag, User, 
    Calendar, CheckCircle2, ChevronDown, Check, Star, 
    Phone, Mail, MapPin, Building, Bot, Shield, ExternalLink,
    Filter, Archive, UserCheck, MoreVertical, Eye, AlertTriangle,
    Unlock, ArrowRightLeft, Clock, MessageSquare, AlertCircle,
    Power, Sparkles, Stethoscope, DollarSign, CreditCard
} from 'lucide-react';
import { 
    CONTACT_CENTER_AGENTS, getAgentById, isChatLockedForUser, 
    MASTER_ADMINS, toggleBotActive, fetchDoctorParameters 
} from '../../services/contactCenterService';

export default function ContactCenterChatConsole({ 
    chats = [], 
    activeChatId, 
    activeAgent = CONTACT_CENTER_AGENTS[0],
    currentUser,
    onSelectChat, 
    onSendMessage, 
    onAssignChat,
    onUnassignChat,
    onTransferChat 
}) {
    const [filterTab, setFilterTab] = useState('sin_asignar');
    const [searchTerm, setSearchTerm] = useState('');
    const [messageInput, setMessageInput] = useState('');
    const [isPrivateNote, setIsPrivateNote] = useState(false);
    const [activeDetailTab, setActiveDetailTab] = useState('info');
    const [transferMenuOpen, setTransferMenuOpen] = useState(false);
    const [botActive, setBotActive] = useState(true);
    const [doctorQuery, setDoctorQuery] = useState('');
    const [doctorResults, setDoctorResults] = useState([]);
    const [isSearchingDoctor, setIsSearchingDoctor] = useState(false);
    const messagesEndRef = useRef(null);

    const isSupervisor = MASTER_ADMINS.includes((currentUser?.usuario || '').toLowerCase().trim());
    const selectedChat = chats.find(c => c.id === activeChatId) || chats[0] || {};

    // Sincronizar estado del bot al cambiar de chat
    useEffect(() => {
        if (selectedChat) {
            setBotActive(selectedChat.botActive !== false && !selectedChat.assignedTo);
        }
    }, [selectedChat?.id, selectedChat?.botActive, selectedChat?.assignedTo]);

    // Auto-scroll al final del chat para ver siempre el último mensaje y el compositor
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [selectedChat?.messages?.length, selectedChat?.id]);

    // Búsqueda de médicos en SALUS
    useEffect(() => {
        if (!doctorQuery || doctorQuery.trim().length < 2) {
            setDoctorResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setIsSearchingDoctor(true);
            try {
                const results = await fetchDoctorParameters(doctorQuery.trim());
                setDoctorResults(results);
            } catch (err) {
                console.error(err);
            } finally {
                setIsSearchingDoctor(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [doctorQuery]);

    const handleToggleBot = async () => {
        const newState = !botActive;
        setBotActive(newState);
        if (selectedChat?.phone) {
            await toggleBotActive(selectedChat.phone, newState);
        }
    };

    // Determinar bloqueo para el chat seleccionado
    const isLocked = isChatLockedForUser(selectedChat, activeAgent.id, currentUser);
    const isAssignedToMe = selectedChat.assignedTo && selectedChat.assignedTo.toLowerCase() === activeAgent.id.toLowerCase();
    const isUnassigned = !selectedChat.assignedTo;
    const assignedAgentObj = selectedChat.assignedTo ? getAgentById(selectedChat.assignedTo) : null;

    // Filtrar chats según pestaña activa
    const filteredChats = chats.filter(chat => {
        const chatAssigned = (chat.assignedTo || '').toLowerCase();
        const myId = activeAgent.id.toLowerCase();

        if (filterTab === 'sin_asignar') return !chat.assignedTo || chat.status === 'sin_asignar';
        if (filterTab === 'asignadas_mi') return chatAssigned === myId;
        if (filterTab === 'asignadas_otros') return chatAssigned && chatAssigned !== myId;
        if (filterTab === 'archivadas') return chat.status === 'archivado';
        return true;
    }).filter(chat => {
        if (!searchTerm) return true;
        const q = searchTerm.toLowerCase();
        return (chat.contactName || '').toLowerCase().includes(q) 
            || (chat.phone || '').includes(q)
            || (chat.id || '').toLowerCase().includes(q) 
            || (chat.lastMessage || '').toLowerCase().includes(q)
            || (chat.customFields?.dni || '').toLowerCase().includes(q)
            || (chat.customFields?.pacienteNombre || '').toLowerCase().includes(q)
            || (chat.customFields?.obraSocial || '').toLowerCase().includes(q);
    });

    const handleSend = (e) => {
        e.preventDefault();
        if (!messageInput.trim()) return;
        if (isLocked) {
            alert(`Esta conversación está asignada exclusivamente a ${assignedAgentObj?.name || 'otra agente'}.`);
            return;
        }
        if (isUnassigned && !isSupervisor) {
            // Auto-asignar al responder si no estaba asignado
            if (onAssignChat) {
                onAssignChat(selectedChat.id, activeAgent.id);
            }
        }
        onSendMessage(selectedChat.id, messageInput, isPrivateNote);
        setMessageInput('');
    };

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: '320px 1fr 340px',
            height: 'calc(100vh - 225px)',
            maxHeight: 'calc(100vh - 225px)',
            minHeight: '480px',
            background: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(0,0,0,0.04)'
        }}>
            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* COLUMNA 1: BANDEJA DE CONVERSACIONES Y FILTROS                  */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, borderRight: '1px solid #E2E8F0', background: '#FFFFFF' }}>
                {/* Pestañas de Filtros Superiores AsisteClick */}
                <div style={{ display: 'flex', gap: '4px', padding: '10px 8px', borderBottom: '1px solid #F1F5F9', overflowX: 'auto', background: '#FAFAFA' }}>
                    <button 
                        onClick={() => {
                            setFilterTab('sin_asignar');
                            const first = chats.find(c => !c.assignedTo || c.status === 'sin_asignar');
                            if (first && onSelectChat) onSelectChat(first.id);
                        }}
                        style={{
                            padding: '4px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                            border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                            background: filterTab === 'sin_asignar' ? '#0284C7' : '#FFFFFF',
                            color: filterTab === 'sin_asignar' ? '#FFFFFF' : '#475569',
                            boxShadow: filterTab === 'sin_asignar' ? '0 2px 4px rgba(2,132,199,0.25)' : 'none'
                        }}
                    >
                        Sin asignar ({chats.filter(c => !c.assignedTo || c.status === 'sin_asignar').length})
                    </button>
                    <button 
                        onClick={() => {
                            setFilterTab('asignadas_mi');
                            const first = chats.find(c => (c.assignedTo || '').toLowerCase() === activeAgent.id.toLowerCase());
                            if (first && onSelectChat) onSelectChat(first.id);
                        }}
                        style={{
                            padding: '4px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                            border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                            background: filterTab === 'asignadas_mi' ? '#0284C7' : '#FFFFFF',
                            color: filterTab === 'asignadas_mi' ? '#FFFFFF' : '#475569'
                        }}
                    >
                        Mis chats ({chats.filter(c => (c.assignedTo || '').toLowerCase() === activeAgent.id.toLowerCase()).length})
                    </button>
                    <button 
                        onClick={() => {
                            setFilterTab('asignadas_otros');
                            const first = chats.find(c => c.assignedTo && (c.assignedTo || '').toLowerCase() !== activeAgent.id.toLowerCase());
                            if (first && onSelectChat) onSelectChat(first.id);
                        }}
                        style={{
                            padding: '4px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                            border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                            background: filterTab === 'asignadas_otros' ? '#0284C7' : '#FFFFFF',
                            color: filterTab === 'asignadas_otros' ? '#FFFFFF' : '#475569'
                        }}
                    >
                        Otras ({chats.filter(c => c.assignedTo && (c.assignedTo || '').toLowerCase() !== activeAgent.id.toLowerCase()).length})
                    </button>
                    <button 
                        onClick={() => {
                            setFilterTab('todos');
                            if (chats.length > 0 && onSelectChat) onSelectChat(chats[0].id);
                        }}
                        style={{
                            padding: '4px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                            border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                            background: filterTab === 'todos' ? '#0284C7' : '#FFFFFF',
                            color: filterTab === 'todos' ? '#FFFFFF' : '#475569'
                        }}
                    >
                        Todos ({chats.length})
                    </button>
                </div>

                {/* Buscador de chat */}
                <div style={{ padding: '8px 12px', borderBottom: '1px solid #F1F5F9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '6px 10px' }}>
                        <Search size={14} color="#94A3B8" />
                        <input 
                            type="text"
                            placeholder="Buscar por paciente, teléfono o DNI..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.78rem', color: '#1E293B', width: '100%' }}
                        />
                    </div>
                </div>

                {/* Lista de Chats con Tags de Asignación y Último en Responder */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {filteredChats.map(chat => {
                        const isSelected = chat.id === selectedChat.id;
                        const assignedAgent = chat.assignedTo ? getAgentById(chat.assignedTo) : null;
                        const chatIsLocked = isChatLockedForUser(chat, activeAgent.id, currentUser);
                        const chatIsMine = chat.assignedTo && chat.assignedTo.toLowerCase() === activeAgent.id.toLowerCase();

                        return (
                            <div 
                                key={chat.id}
                                onClick={() => onSelectChat(chat.id)}
                                style={{
                                    padding: '12px 14px',
                                    borderBottom: '1px solid #F1F5F9',
                                    cursor: 'pointer',
                                    background: isSelected ? '#EFF6FF' : '#FFFFFF',
                                    borderLeft: isSelected ? '4px solid #1E40AF' : '4px solid transparent',
                                    transition: 'background 0.15s',
                                    position: 'relative'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{
                                            width: '28px', height: '28px', borderRadius: '50%',
                                            background: chat.avatarColor || '#1E40AF', color: '#FFF',
                                            fontSize: '0.7rem', fontWeight: 800, display: 'flex',
                                            alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            {(chat.contactName || 'P').substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: isSelected ? '#1E40AF' : '#0F172A' }}>
                                                {chat.contactName}
                                            </span>
                                            <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                                +{chat.phone}
                                            </div>
                                        </div>
                                    </div>
                                    <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>
                                        {chat.timeAgo}
                                    </span>
                                </div>

                                {/* TAGS DE TRAZABILIDAD: ASIGNADO Y LOCK */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', margin: '6px 0 4px' }}>
                                    {/* Tag de Asignación */}
                                    {assignedAgent ? (
                                        <span style={{
                                            fontSize: '0.66rem', fontWeight: 800, padding: '1px 6px', borderRadius: '6px',
                                            background: chatIsMine ? '#DCFCE7' : '#F1F5F9',
                                            color: chatIsMine ? '#15803D' : '#334155',
                                            border: `1px solid ${chatIsMine ? '#86EFAC' : '#CBD5E1'}`,
                                            display: 'flex', alignItems: 'center', gap: '3px'
                                        }}>
                                            <User size={10} />
                                            {assignedAgent.name} {chatIsMine ? '(Tú)' : ''}
                                        </span>
                                    ) : (
                                        <span style={{
                                            fontSize: '0.66rem', fontWeight: 800, padding: '1px 6px', borderRadius: '6px',
                                            background: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D'
                                        }}>
                                            ⚠️ Sin asignar
                                        </span>
                                    )}

                                    {/* Tag de Bloqueo Exclusivo */}
                                    {chatIsLocked && (
                                        <span style={{
                                            fontSize: '0.64rem', fontWeight: 800, padding: '1px 6px', borderRadius: '6px',
                                            background: '#FEE2E2', color: '#B91C1C', border: '1px solid #FCA5A5',
                                            display: 'flex', alignItems: 'center', gap: '2px'
                                        }}>
                                            <Lock size={9} /> Bloqueada
                                        </span>
                                    )}

                                    {/* Tag: Último en responder */}
                                    {chat.lastResponder && (
                                        <span style={{
                                            fontSize: '0.64rem', fontWeight: 700, padding: '1px 6px', borderRadius: '6px',
                                            background: chat.lastResponderRole === 'agent' ? '#EFF6FF' : '#FFF1F2',
                                            color: chat.lastResponderRole === 'agent' ? '#1E40AF' : '#E11D48',
                                            border: '1px solid #E2E8F0',
                                            display: 'flex', alignItems: 'center', gap: '3px'
                                        }}>
                                            {chat.lastResponderRole === 'agent' ? 'Resp: ' + chat.lastResponder : '🔴 Escribió Paciente'}
                                        </span>
                                    )}
                                </div>

                                <div style={{ fontSize: '0.76rem', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {chat.lastMessage}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* COLUMNA 2: VISOR DE CHAT Y COMPOSITOR                            */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden', background: '#F8FAFC' }}>
                {/* Barra Superior del Chat con Control de Asignación Exclusiva */}
                <div style={{
                    padding: '12px 20px',
                    flexShrink: 0,
                    background: '#FFFFFF',
                    borderBottom: '1px solid #E2E8F0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0F172A' }}>
                                    #{selectedChat.id} / <span style={{ color: '#0284C7' }}>{selectedChat.contactName}</span>
                                </span>
                                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#16A34A', background: '#DCFCE7', padding: '2px 8px', borderRadius: '10px' }}>
                                    WhatsApp
                                </span>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                                <span>Tel: {selectedChat.phone}</span>
                                <span>•</span>
                                <span>
                                    Última respuesta: <strong style={{ color: selectedChat.lastResponderRole === 'agent' ? '#1E40AF' : '#E11D48' }}>
                                        {selectedChat.lastResponder || 'Paciente'}
                                    </strong>
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* BOTONES DE ASIGNACIÓN / BLOQUEO EXCLUSIVO */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
                        {/* CASO 1: SIN ASIGNAR -> CUALQUIERA PUEDE ASIGNARSE */}
                        {isUnassigned && (
                            <button 
                                onClick={() => onAssignChat && onAssignChat(selectedChat.id, activeAgent.id)}
                                style={{
                                    padding: '7px 14px', borderRadius: '8px', border: 'none',
                                    background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                                    color: '#FFFFFF', fontWeight: 700, fontSize: '0.76rem',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                    boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)'
                                }}
                            >
                                <UserCheck size={14} /> Asignarme esta conversación
                            </button>
                        )}

                        {/* CASO 2: ASIGNADA A MÍ -> PUEDO LIBERAR O TRANSFERIR */}
                        {isAssignedToMe && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{
                                    fontSize: '0.72rem', fontWeight: 800, padding: '5px 10px', borderRadius: '8px',
                                    background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC',
                                    display: 'flex', alignItems: 'center', gap: '4px'
                                }}>
                                    <CheckCircle2 size={13} /> Asignada a ti ({activeAgent.name})
                                </span>

                                <button
                                    onClick={() => onUnassignChat && onUnassignChat(selectedChat.id)}
                                    title="Liberar chat a la cola general"
                                    style={{
                                        padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1',
                                        background: '#FFFFFF', color: '#475569', fontWeight: 600, fontSize: '0.72rem',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                                    }}
                                >
                                    <Unlock size={12} /> Liberar
                                </button>

                                <button
                                    onClick={() => setTransferMenuOpen(!transferMenuOpen)}
                                    title="Transferir a otra agente"
                                    style={{
                                        padding: '6px 10px', borderRadius: '6px', border: '1px solid #0284C7',
                                        background: '#F0F9FF', color: '#0284C7', fontWeight: 700, fontSize: '0.72rem',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                                    }}
                                >
                                    <ArrowRightLeft size={12} /> Transferir <ChevronDown size={12} />
                                </button>
                            </div>
                        )}

                        {/* CASO 3: ASIGNADA A OTRA AGENTE -> BLOQUEO ESTRICTO (NADIE SE LA PUEDE ASOCIAR) */}
                        {!isUnassigned && !isAssignedToMe && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '6px 12px', borderRadius: '8px',
                                    background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B',
                                    fontSize: '0.74rem', fontWeight: 800
                                }}>
                                    <Lock size={13} />
                                    Asignada a {assignedAgentObj?.name || selectedChat.assignedTo} (Bloqueada)
                                </div>

                                {/* Solo supervisor lmarinero puede forzar reasignación */}
                                {isSupervisor && (
                                    <button
                                        onClick={() => setTransferMenuOpen(!transferMenuOpen)}
                                        style={{
                                            padding: '6px 10px', borderRadius: '6px', border: '1px solid #DC2626',
                                            background: '#FFFFFF', color: '#DC2626', fontWeight: 700, fontSize: '0.72rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Supervisión: Reasignar
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Menú de Transferencia entre las 4 agentes */}
                        {transferMenuOpen && (
                            <div style={{
                                position: 'absolute', top: '100%', right: 0, marginTop: '6px',
                                background: '#FFFFFF', borderRadius: '10px', border: '1px solid #CBD5E1',
                                boxShadow: '0 10px 25px rgba(0,0,0,0.12)', width: '220px', zIndex: 50,
                                padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px'
                            }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748B', padding: '6px 8px', textTransform: 'uppercase' }}>
                                    Transferir conversación a:
                                </div>
                                {CONTACT_CENTER_AGENTS.filter(a => a.id !== (selectedChat.assignedTo || '').toLowerCase()).map(targetAgent => (
                                    <button
                                        key={targetAgent.id}
                                        onClick={() => {
                                            onTransferChat(selectedChat.id, targetAgent.id);
                                            setTransferMenuOpen(false);
                                        }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '8px',
                                            padding: '8px 10px', borderRadius: '6px', border: 'none',
                                            background: 'transparent', cursor: 'pointer', textAlign: 'left',
                                            width: '100%', transition: 'background 0.15s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = '#F1F5F9'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <div style={{
                                            width: '22px', height: '22px', borderRadius: '50%',
                                            background: targetAgent.color, color: '#FFF',
                                            fontSize: '0.68rem', fontWeight: 800, display: 'flex',
                                            alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            {targetAgent.avatar}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0F172A' }}>
                                                {targetAgent.fullName}
                                            </div>
                                            <div style={{ fontSize: '0.66rem', color: '#64748B' }}>
                                                {targetAgent.role}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Área de Mensajes con Estilo AsisteClick + Tags de Autoría */}
                <div style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    padding: '16px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    backgroundImage: 'radial-gradient(#E2E8F0 1px, transparent 1px)',
                    backgroundSize: '20px 20px'
                }}>
                    {selectedChat.messages?.map(msg => {
                        if (msg.sender === 'system') {
                            return (
                                <div key={msg.id} style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
                                    <span style={{
                                        background: '#FFFFFF', border: '1px solid #E2E8F0',
                                        color: '#475569', fontSize: '0.72rem', fontWeight: 600, padding: '4px 14px',
                                        borderRadius: '20px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                        display: 'flex', alignItems: 'center', gap: '6px'
                                    }}>
                                        <Clock size={12} color="#94A3B8" />
                                        {msg.text}
                                    </span>
                                </div>
                            );
                        }

                        const isPatient = msg.sender === 'patient';
                        const isNote = msg.isNote;
                        const agentObj = !isPatient ? getAgentById(msg.senderAgentId || msg.senderName) : null;

                        return (
                            <div 
                                key={msg.id}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: isPatient ? 'flex-start' : 'flex-end',
                                    maxWidth: '82%',
                                    alignSelf: isPatient ? 'flex-start' : 'flex-end'
                                }}
                            >
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '8px',
                                    flexDirection: isPatient ? 'row' : 'row-reverse'
                                }}>
                                    {/* Avatar circular con color de la agente o del paciente */}
                                    <div style={{
                                        width: '28px', height: '28px', borderRadius: '50%',
                                        background: isPatient 
                                            ? (selectedChat.avatarColor || '#E11D48') 
                                            : (isNote ? '#EA580C' : (agentObj?.color || '#0284C7')),
                                        color: '#FFFFFF', fontSize: '0.72rem', fontWeight: 800,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                    }}>
                                        {isPatient ? selectedChat.contactName.charAt(0) : (isNote ? '🔒' : (agentObj?.avatar || 'A'))}
                                    </div>

                                    {/* Burbuja de Mensaje con Tag de Autoría */}
                                    <div style={{
                                        background: isNote ? '#FFF7ED' : (isPatient ? '#DCFCE7' : '#FFFFFF'),
                                        border: isNote ? '1px solid #FED7AA' : '1px solid #E2E8F0',
                                        padding: '10px 14px',
                                        borderRadius: isPatient ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
                                        color: '#1E293B',
                                        fontSize: '0.86rem',
                                        lineHeight: 1.45
                                    }}>
                                        {/* TAG DE AUTORÍA CLARO */}
                                        {!isPatient && (
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                marginBottom: '6px', paddingBottom: '4px',
                                                borderBottom: isNote ? '1px dashed #FDBA74' : '1px solid #F1F5F9'
                                            }}>
                                                <span style={{
                                                    fontSize: '0.68rem', fontWeight: 800,
                                                    color: isNote ? '#C2410C' : (agentObj?.color || '#0284C7'),
                                                    background: isNote ? '#FFEDD5' : '#F8FAFC',
                                                    padding: '1px 6px', borderRadius: '4px', border: '1px solid #E2E8F0'
                                                }}>
                                                    {isNote ? `🔒 NOTA INTERNA • ${msg.senderName}` : `👤 ${msg.senderName} (${agentObj?.role || 'Agente'})`}
                                                </span>
                                            </div>
                                        )}

                                        {msg.type === 'image' && (
                                            <div style={{ marginBottom: '8px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E2E8F0', maxWidth: '320px' }}>
                                                <img src={msg.mediaUrl} alt={msg.caption || 'Foto'} style={{ width: '100%', height: '180px', objectFit: 'cover' }} />
                                                {msg.caption && (
                                                    <div style={{ padding: '6px 10px', background: '#F8FAFC', fontSize: '0.75rem', color: '#64748B' }}>
                                                        📄 {msg.caption}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div style={{ whiteSpace: 'pre-line' }}>
                                            {msg.text}
                                        </div>

                                        <div style={{
                                            fontSize: '0.68rem', color: '#94A3B8', marginTop: '6px',
                                            textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px'
                                        }}>
                                            {msg.timestamp} {!isPatient && !isNote && <Check size={12} color="#059669" />}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>

                {/* COMPOSITOR DE MENSAJE: CON CONTROL DE BLOQUEO (SIEMPRE VISIBLE) */}
                <div style={{ flexShrink: 0, padding: '12px 18px', background: '#FFFFFF', borderTop: '1px solid #E2E8F0' }}>
                    {/* Alerta si está bloqueado */}
                    {isLocked ? (
                        <div style={{
                            padding: '12px 16px', borderRadius: '10px',
                            background: '#FEF2F2', border: '1.5px solid #F87171', color: '#991B1B',
                            display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.84rem', fontWeight: 600
                        }}>
                            <Lock size={18} color="#DC2626" />
                            <div>
                                Conversación asignada exclusivamente a <strong>{assignedAgentObj?.name || selectedChat.assignedTo}</strong>.
                                <div style={{ fontSize: '0.75rem', fontWeight: 400, color: '#B91C1C', marginTop: '2px' }}>
                                    Mientras ella la tenga asignada, nadie más puede responder ni asociársela para evitar colisiones con el paciente.
                                </div>
                            </div>
                        </div>
                    ) : isUnassigned ? (
                        /* Alerta si no está asignado: sugerir asignarse */
                        <div style={{
                            marginBottom: '10px', padding: '8px 12px', borderRadius: '8px',
                            background: '#FEF3C7', border: '1px solid #FCD34D', color: '#92400E',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                                <AlertCircle size={15} /> Conversación libre en cola general.
                            </div>
                            <button
                                type="button"
                                onClick={() => onAssignChat && onAssignChat(selectedChat.id, activeAgent.id)}
                                style={{
                                    padding: '4px 10px', borderRadius: '6px', border: 'none',
                                    background: '#D97706', color: '#FFFFFF', fontSize: '0.74rem', fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                Asignarme para responder
                            </button>
                        </div>
                    ) : null}

                    {/* Formulario de redacción (solo habilitado si NO está bloqueado) */}
                    <form onSubmit={handleSend} style={{ opacity: isLocked ? 0.4 : 1, pointerEvents: isLocked ? 'none' : 'auto' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <button
                                type="button"
                                onClick={() => setIsPrivateNote(!isPrivateNote)}
                                style={{
                                    padding: '4px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                                    border: '1px solid', borderColor: isPrivateNote ? '#EA580C' : '#E2E8F0',
                                    background: isPrivateNote ? '#FFF7ED' : '#FFFFFF',
                                    color: isPrivateNote ? '#EA580C' : '#64748B', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '4px'
                                }}
                            >
                                {isPrivateNote ? <Lock size={12} /> : <MessageSquare size={12} />}
                                {isPrivateNote ? 'Modo: Nota Privada Interna' : 'Modo: Mensaje Público de WhatsApp'}
                            </button>

                            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                                Respondiendo como: <strong style={{ color: activeAgent.color }}>{activeAgent.name} ({activeAgent.role})</strong>
                            </span>
                        </div>

                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            background: isPrivateNote ? '#FFF7ED' : '#F8FAFC',
                            border: isPrivateNote ? '1.5px solid #F97316' : '1px solid #E2E8F0',
                            borderRadius: '12px', padding: '8px 12px'
                        }}>
                            <input 
                                type="text"
                                disabled={isLocked}
                                placeholder={isPrivateNote 
                                    ? `Escribe una nota interna que solo verá el equipo (autor: ${activeAgent.name})...` 
                                    : `Escribe respuesta a ${selectedChat.contactName} vía WhatsApp (autor: ${activeAgent.name})...`}
                                value={messageInput}
                                onChange={(e) => setMessageInput(e.target.value)}
                                style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '0.88rem', color: '#1E293B' }}
                            />

                            <button 
                                type="submit"
                                disabled={isLocked}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    background: isPrivateNote ? '#EA580C' : '#0284C7',
                                    color: '#FFFFFF', border: 'none', padding: '8px 16px',
                                    borderRadius: '8px', fontWeight: 700, fontSize: '0.8rem', cursor: isLocked ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {isPrivateNote ? <Lock size={14} /> : <Send size={14} />}
                                {isPrivateNote ? 'Guardar Nota' : 'Enviar WhatsApp'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* COLUMNA 3: FICHA DEL PACIENTE Y PARÁMETROS SALUS                */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, borderLeft: '1px solid #E2E8F0', background: '#FFFFFF', overflowY: 'auto' }}>
                <div style={{ display: 'flex', flexShrink: 0, borderBottom: '1px solid #F1F5F9', background: '#FAFAFA' }}>
                    <button 
                        onClick={() => setActiveDetailTab('info')}
                        style={{
                            flex: 1, padding: '12px 0', border: 'none', background: 'transparent',
                            fontWeight: 700, fontSize: '0.78rem',
                            color: activeDetailTab === 'info' ? '#0284C7' : '#64748B',
                            borderBottom: activeDetailTab === 'info' ? '2px solid #0284C7' : '2px solid transparent',
                            cursor: 'pointer'
                        }}
                    >
                        Ficha Paciente
                    </button>
                    <button 
                        onClick={() => setActiveDetailTab('prestadores')}
                        style={{
                            flex: 1, padding: '12px 0', border: 'none', background: 'transparent',
                            fontWeight: 700, fontSize: '0.78rem',
                            color: activeDetailTab === 'prestadores' ? '#0284C7' : '#64748B',
                            borderBottom: activeDetailTab === 'prestadores' ? '2px solid #0284C7' : '2px solid transparent',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                        }}
                    >
                        <Stethoscope size={13} />
                        Prestadores SALUS
                    </button>
                </div>

                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {activeDetailTab === 'info' ? (
                        <>
                            {/* WIDGET: ESTADO DEL CHATBOT Y CONTROL DE SILENCIADO */}
                            <div style={{
                                padding: '12px 14px', borderRadius: '10px',
                                background: botActive ? '#F0FDF4' : '#FFFBEB',
                                border: '1px solid', borderColor: botActive ? '#BBF7D0' : '#FDE68A',
                                display: 'flex', flexDirection: 'column', gap: '8px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 800, color: botActive ? '#15803D' : '#B45309' }}>
                                        <Bot size={15} />
                                        {botActive ? 'CHATBOT ACTIVO (TRIAGE)' : 'CHATBOT SILENCIADO'}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleToggleBot}
                                        style={{
                                            padding: '4px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700,
                                            border: 'none', cursor: 'pointer',
                                            background: botActive ? '#DC2626' : '#16A34A',
                                            color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '4px'
                                        }}
                                    >
                                        <Power size={11} />
                                        {botActive ? 'Silenciar Bot' : 'Reanudar Bot'}
                                    </button>
                                </div>
                                <div style={{ fontSize: '0.69rem', color: botActive ? '#166534' : '#92400E', lineHeight: 1.35 }}>
                                    {botActive 
                                        ? 'El bot responde preguntas de triage ahorrando mensajes. Se silencia al asignar una agente.'
                                        : 'El bot no responderá a este paciente para permitir atención humana exclusiva.'}
                                </div>
                            </div>

                            {/* CANALES Y ASIGNACIÓN */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#F8FAFC', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B' }}>AGENTE ASIGNADA</span>
                                    {assignedAgentObj ? (
                                        <span style={{
                                            fontSize: '0.72rem', fontWeight: 800, color: assignedAgentObj.color,
                                            background: '#FFFFFF', padding: '2px 8px', borderRadius: '6px', border: '1px solid #E2E8F0'
                                        }}>
                                            {assignedAgentObj.fullName}
                                        </span>
                                    ) : (
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#D97706' }}>
                                            En espera de agente
                                        </span>
                                    )}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B' }}>CONDICIÓN PADRÓN</span>
                                    <span style={{
                                        fontSize: '0.7rem', fontWeight: 800,
                                        padding: '1px 6px', borderRadius: '4px',
                                        background: selectedChat.customFields?.esPacienteExistente ? '#ECFDF5' : '#EFF6FF',
                                        color: selectedChat.customFields?.esPacienteExistente ? '#047857' : '#1D4ED8',
                                        border: '1px solid', borderColor: selectedChat.customFields?.esPacienteExistente ? '#A7F3D0' : '#BFDBFE'
                                    }}>
                                        {selectedChat.customFields?.esPacienteExistente ? '✓ Paciente Registrado' : '+ Nuevo Paciente'}
                                    </span>
                                </div>
                            </div>

                            {/* FICHA COMPLETA DE VARIABLES DEL PACIENTE */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        Variables del Paciente (IA)
                                    </span>
                                    <span style={{ fontSize: '0.68rem', color: '#0284C7', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px' }}>
                                        <Sparkles size={11} /> Auto-detectadas
                                    </span>
                                </div>

                                {/* DNI */}
                                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
                                    <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>DNI / IDENTIFICACIÓN</div>
                                    <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0F172A' }}>
                                        {selectedChat.customFields?.dni || 'A verificar'}
                                    </div>
                                </div>

                                {/* NOMBRE COMPLETO */}
                                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
                                    <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>NOMBRE COMPLETO</div>
                                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A' }}>
                                        {selectedChat.customFields?.pacienteNombre || selectedChat.contactName || 'Paciente'}
                                    </div>
                                </div>

                                {/* OBRA SOCIAL */}
                                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
                                    <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>OBRA SOCIAL / PREPAGA</div>
                                    <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0284C7' }}>
                                        {selectedChat.customFields?.obraSocial || 'A consultar'}
                                    </div>
                                </div>

                                {/* FECHA DE NACIMIENTO */}
                                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
                                    <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>FECHA DE NACIMIENTO</div>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>
                                        {selectedChat.customFields?.fechaNacimiento || 'No informada'}
                                    </div>
                                </div>

                                {/* EMAIL */}
                                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
                                    <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>EMAIL</div>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', wordBreak: 'break-all' }}>
                                        {selectedChat.customFields?.email || 'No informado'}
                                    </div>
                                </div>

                                {/* TELÉFONO DE CONTACTO */}
                                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
                                    <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>TELÉFONO DE CONTACTO</div>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F172A' }}>
                                        {selectedChat.customFields?.pacienteContacto || selectedChat.phone}
                                    </div>
                                </div>

                                {/* DEPARTAMENTO */}
                                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
                                    <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>DEPARTAMENTO / RESIDENCIA</div>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <MapPin size={12} color="#0284C7" />
                                        {selectedChat.customFields?.departamento || 'San Juan'}
                                    </div>
                                </div>

                                {/* MOTIVO DE CONSULTA / MÉDICO */}
                                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
                                    <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>SOLICITUD / MOTIVO</div>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0F172A' }}>
                                        {selectedChat.customFields?.motivoConsulta || selectedChat.customFields?.turnosDiaHora || 'Consulta general'}
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        /* TAB 2: PARÁMETROS Y HONORARIOS DE MÉDICOS SALUS */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase' }}>
                                Consultar Parámetros de Prestador
                            </div>

                            <div style={{ position: 'relative' }}>
                                <input
                                    type="text"
                                    placeholder="Buscar por médico o especialidad..."
                                    value={doctorQuery}
                                    onChange={(e) => setDoctorQuery(e.target.value)}
                                    style={{
                                        width: '100%', padding: '8px 12px 8px 30px',
                                        borderRadius: '8px', border: '1px solid #CBD5E1',
                                        fontSize: '0.8rem', outline: 'none'
                                    }}
                                />
                                <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
                            </div>

                            {isSearchingDoctor && (
                                <div style={{ fontSize: '0.72rem', color: '#64748B', textAlign: 'center', padding: '10px' }}>
                                    Buscando en SALUS...
                                </div>
                            )}

                            {doctorResults.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
                                    {doctorResults.map((doc) => (
                                        <div key={doc.id} style={{
                                            background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px'
                                        }}>
                                            <div style={{ fontWeight: 800, fontSize: '0.82rem', color: '#0F172A' }}>
                                                {doc.profesional_nombre}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#0284C7', fontWeight: 600 }}>
                                                {doc.especialidad || 'Consulta Médica'}
                                            </div>

                                            {doc.consultorio_actual && (
                                                <div style={{ marginTop: '4px', fontSize: '0.72rem', fontWeight: 700, color: '#059669' }}>
                                                    📍 {doc.consultorio_actual}
                                                </div>
                                            )}

                                            {doc.condiciones_consulta && (
                                                <div style={{
                                                    marginTop: '6px', fontSize: '0.7rem', color: '#475569',
                                                    background: '#FFFFFF', padding: '6px 8px', borderRadius: '6px',
                                                    border: '1px solid #E2E8F0', whiteSpace: 'pre-line'
                                                }}>
                                                    {doc.condiciones_consulta}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : doctorQuery.length >= 2 && !isSearchingDoctor ? (
                                <div style={{ fontSize: '0.72rem', color: '#94A3B8', textAlign: 'center', padding: '14px' }}>
                                    No se encontraron prestadores con ese criterio.
                                </div>
                            ) : (
                                <div style={{ fontSize: '0.72rem', color: '#64748B', background: '#F8FAFC', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                    💡 Escribe el apellido del médico (ej: <em>Marquez</em>, <em>Gomez</em>, <em>Borrego</em>) para ver sus honorarios particulares, plus de coseguro, alias de Mercado Pago y consultorio activo.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
