import React, { useState } from 'react';
import { 
    Search, Paperclip, Send, Lock, Tag, User, 
    Calendar, CheckCircle2, ChevronDown, Check, Star, 
    Phone, Mail, MapPin, Building, Bot, Shield, ExternalLink,
    Filter, Archive, UserCheck, MoreVertical, Eye, AlertTriangle,
    Unlock, ArrowRightLeft, Clock, MessageSquare, AlertCircle
} from 'lucide-react';
import { 
    CONTACT_CENTER_AGENTS, getAgentById, isChatLockedForUser, 
    MASTER_ADMINS 
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

    const isSupervisor = MASTER_ADMINS.includes((currentUser?.usuario || '').toLowerCase().trim());
    const selectedChat = chats.find(c => c.id === activeChatId) || chats[0] || {};

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
            || (chat.lastMessage || '').toLowerCase().includes(q);
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
            gridTemplateColumns: '330px 1fr 340px',
            height: 'calc(100vh - 165px)',
            minHeight: '700px',
            background: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(0,0,0,0.04)'
        }}>
            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* COLUMNA 1: BANDEJA DE CONVERSACIONES Y FILTROS                  */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid #E2E8F0', background: '#FFFFFF' }}>
                {/* Pestañas de Filtros Superiores AsisteClick */}
                <div style={{ display: 'flex', gap: '4px', padding: '10px 8px', borderBottom: '1px solid #F1F5F9', overflowX: 'auto', background: '#FAFAFA' }}>
                    <button 
                        onClick={() => setFilterTab('sin_asignar')}
                        style={{
                            padding: '4px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                            border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                            background: filterTab === 'sin_asignar' ? '#0284C7' : '#FFFFFF',
                            color: filterTab === 'sin_asignar' ? '#FFFFFF' : '#475569',
                            boxShadow: filterTab === 'sin_asignar' ? '0 2px 4px rgba(2,132,199,0.25)' : 'none'
                        }}
                    >
                        Sin asignar ({chats.filter(c => !c.assignedTo).length})
                    </button>
                    <button 
                        onClick={() => setFilterTab('asignadas_mi')}
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
                        onClick={() => setFilterTab('asignadas_otros')}
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
                        onClick={() => setFilterTab('todos')}
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
            <div style={{ display: 'flex', flexDirection: 'column', background: '#F8FAFC' }}>
                {/* Barra Superior del Chat con Control de Asignación Exclusiva */}
                <div style={{
                    padding: '12px 20px',
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
                    overflowY: 'auto',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
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
                </div>

                {/* COMPOSITOR DE MENSAJE: CON CONTROL DE BLOQUEO */}
                <div style={{ padding: '14px 20px', background: '#FFFFFF', borderTop: '1px solid #E2E8F0' }}>
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
            {/* COLUMNA 3: FICHA DEL PACIENTE Y CAMPOS PERSONALIZADOS           */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid #E2E8F0', background: '#FFFFFF', overflowY: 'auto' }}>
                <div style={{ display: 'flex', borderBottom: '1px solid #F1F5F9', background: '#FAFAFA' }}>
                    <button 
                        onClick={() => setActiveDetailTab('info')}
                        style={{
                            flex: 1, padding: '12px 0', border: 'none', background: 'transparent',
                            fontWeight: 700, fontSize: '0.8rem',
                            color: activeDetailTab === 'info' ? '#0284C7' : '#64748B',
                            borderBottom: activeDetailTab === 'info' ? '2px solid #0284C7' : '2px solid transparent',
                            cursor: 'pointer'
                        }}
                    >
                        Información
                    </button>
                    <button 
                        onClick={() => setActiveDetailTab('campos')}
                        style={{
                            flex: 1, padding: '12px 0', border: 'none', background: 'transparent',
                            fontWeight: 700, fontSize: '0.8rem',
                            color: activeDetailTab === 'campos' ? '#0284C7' : '#64748B',
                            borderBottom: activeDetailTab === 'campos' ? '2px solid #0284C7' : '2px solid transparent',
                            cursor: 'pointer'
                        }}
                    >
                        Campos Clínicos
                    </button>
                </div>

                <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Canales y Asignación */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>CANAL</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#059669' }}>WHATSAPP</span>
                        </div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0F172A' }}>
                            {selectedChat.channelNumber || '5492645825637'}
                        </div>

                        <div style={{ height: '1px', background: '#E2E8F0', margin: '2px 0' }} />

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>ASIGNADO A</span>
                            {assignedAgentObj ? (
                                <span style={{
                                    fontSize: '0.74rem', fontWeight: 800, color: assignedAgentObj.color,
                                    background: '#FFFFFF', padding: '2px 8px', borderRadius: '6px', border: '1px solid #E2E8F0'
                                }}>
                                    {assignedAgentObj.fullName}
                                </span>
                            ) : (
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#D97706' }}>
                                    Sin asignar
                                </span>
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>ESTADO DE LOCK</span>
                            <span style={{
                                fontSize: '0.7rem', fontWeight: 800,
                                color: isLocked ? '#DC2626' : (isAssignedToMe ? '#16A34A' : '#D97706')
                            }}>
                                {isLocked ? '🔒 Bloqueado' : (isAssignedToMe ? '🔓 En tu atención' : '⚪ Disponible')}
                            </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>ÚLTIMO RESPONDIÓ</span>
                            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: selectedChat.lastResponderRole === 'agent' ? '#1E40AF' : '#E11D48' }}>
                                {selectedChat.lastResponder || 'Paciente'}
                            </span>
                        </div>
                    </div>

                    {/* Ficha Clínica y Campos Personalizados */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Datos del Paciente
                        </div>

                        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px' }}>
                            <div style={{ fontSize: '0.68rem', color: '#64748B' }}>DNI / Identificación</div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>
                                {selectedChat.customFields?.dni || '—'}
                            </div>
                        </div>

                        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px' }}>
                            <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Obra Social / Prepaga</div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0284C7' }}>
                                {selectedChat.customFields?.obraSocial || 'A verificar'}
                            </div>
                        </div>

                        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px' }}>
                            <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Turno / Solicitud</div>
                            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>
                                {selectedChat.customFields?.turnosDiaHora || 'Consulta general'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
