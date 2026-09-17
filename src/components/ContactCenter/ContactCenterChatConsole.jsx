import React, { useState } from 'react';
import { 
    Search, Paperclip, Mic, Send, Lock, Tag, User, 
    Calendar, CheckCircle2, ChevronDown, Check, Star, 
    Phone, Mail, MapPin, Building, Bot, Shield, ExternalLink,
    Filter, Archive, UserCheck, MoreVertical, Eye
} from 'lucide-react';

export default function ContactCenterChatConsole({ chats = [], activeChatId, onSelectChat, onSendMessage, onAssignChat }) {
    const [filterTab, setFilterTab] = useState('sin_asignar');
    const [searchTerm, setSearchTerm] = useState('');
    const [messageInput, setMessageInput] = useState('');
    const [isPrivateNote, setIsPrivateNote] = useState(false);
    const [activeDetailTab, setActiveDetailTab] = useState('info');

    const selectedChat = chats.find(c => c.id === activeChatId) || chats[0];

    // Filtrar chats según la pestaña activa
    const filteredChats = chats.filter(chat => {
        if (filterTab === 'sin_asignar') return chat.status === 'sin_asignar';
        if (filterTab === 'asignadas_mi') return chat.assignedTo === 'Daniela';
        if (filterTab === 'archivadas') return chat.status === 'archivado';
        return true;
    }).filter(chat => {
        if (!searchTerm) return true;
        const q = searchTerm.toLowerCase();
        return chat.contactName.toLowerCase().includes(q) || chat.id.toLowerCase().includes(q) || (chat.lastMessage || '').toLowerCase().includes(q);
    });

    const handleSend = (e) => {
        e.preventDefault();
        if (!messageInput.trim()) return;
        onSendMessage(selectedChat.id, messageInput, isPrivateNote);
        setMessageInput('');
    };

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: '320px 1fr 340px',
            height: 'calc(100vh - 160px)',
            minHeight: '680px',
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
                <div style={{ display: 'flex', gap: '4px', padding: '12px 10px', borderBottom: '1px solid #F1F5F9', overflowX: 'auto', background: '#FAFAFA' }}>
                    <button 
                        onClick={() => setFilterTab('sin_asignar')}
                        style={{
                            padding: '4px 10px', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 700,
                            border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                            background: filterTab === 'sin_asignar' ? '#0284C7' : '#FFFFFF',
                            color: filterTab === 'sin_asignar' ? '#FFFFFF' : '#475569',
                            boxShadow: filterTab === 'sin_asignar' ? '0 2px 4px rgba(2,132,199,0.25)' : 'none'
                        }}
                    >
                        Sin asignar {chats.filter(c => c.status === 'sin_asignar').length}
                    </button>
                    <button 
                        onClick={() => setFilterTab('asignadas_mi')}
                        style={{
                            padding: '4px 10px', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 700,
                            border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                            background: filterTab === 'asignadas_mi' ? '#0284C7' : '#FFFFFF',
                            color: filterTab === 'asignadas_mi' ? '#FFFFFF' : '#475569'
                        }}
                    >
                        Asignadas a mí
                    </button>
                    <button 
                        onClick={() => setFilterTab('todos')}
                        style={{
                            padding: '4px 10px', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 700,
                            border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                            background: filterTab === 'todos' ? '#0284C7' : '#FFFFFF',
                            color: filterTab === 'todos' ? '#FFFFFF' : '#475569'
                        }}
                    >
                        Todos ({chats.length})
                    </button>
                </div>

                {/* Buscador de chat */}
                <div style={{ padding: '10px 12px', borderBottom: '1px solid #F1F5F9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '6px 10px' }}>
                        <Search size={14} color="#94A3B8" />
                        <input 
                            type="text"
                            placeholder="Buscar conversación..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.8rem', color: '#1E293B', width: '100%' }}
                        />
                    </div>
                </div>

                {/* Lista de Chats */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {filteredChats.map(chat => {
                        const isSelected = chat.id === selectedChat.id;
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
                                    transition: 'background 0.15s'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{
                                            width: '26px', height: '26px', borderRadius: '50%',
                                            background: chat.avatarColor || '#1E40AF', color: '#FFF',
                                            fontSize: '0.7rem', fontWeight: 800, display: 'flex',
                                            alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            {chat.contactName.substring(0, 2).toUpperCase()}
                                        </div>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: isSelected ? '#1E40AF' : '#0F172A' }}>
                                            {chat.contactName}
                                        </span>
                                    </div>
                                    <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>
                                        {chat.timeAgo}
                                    </span>
                                </div>

                                <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600, marginBottom: '4px' }}>
                                    WHATSAPP - ID #{chat.id}
                                </div>

                                <div style={{ fontSize: '0.78rem', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                {/* Barra Superior del Chat */}
                <div style={{
                    padding: '12px 20px',
                    background: '#FFFFFF',
                    borderBottom: '1px solid #E2E8F0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0F172A' }}>
                            Chat #{selectedChat.id} / <span style={{ color: '#0284C7' }}>{selectedChat.contactName}</span>
                        </span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#16A34A', background: '#DCFCE7', padding: '2px 8px', borderRadius: '10px' }}>
                            WhatsApp Abierto
                        </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button 
                            onClick={() => onAssignChat && onAssignChat(selectedChat.id, 'Daniela')}
                            style={{
                                padding: '6px 12px', borderRadius: '6px', border: '1px solid #0284C7',
                                background: '#F0F9FF', color: '#0284C7', fontWeight: 700, fontSize: '0.76rem',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                            }}
                        >
                            <UserCheck size={14} /> Asignarme
                        </button>
                        <button style={{
                            padding: '6px 12px', borderRadius: '6px', border: '1px solid #E2E8F0',
                            background: '#FFFFFF', color: '#64748B', fontWeight: 600, fontSize: '0.76rem',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                        }}>
                            <Archive size={14} /> Archivar
                        </button>
                    </div>
                </div>

                {/* Área de Mensajes con Estilo WhatsApp / AsisteClick */}
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
                                        color: '#64748B', fontSize: '0.74rem', padding: '4px 14px',
                                        borderRadius: '20px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                                    }}>
                                        {msg.text}
                                    </span>
                                </div>
                            );
                        }

                        const isPatient = msg.sender === 'patient';
                        const isNote = msg.isNote;

                        return (
                            <div 
                                key={msg.id}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: isPatient ? 'flex-start' : 'flex-end',
                                    maxWidth: '80%',
                                    alignSelf: isPatient ? 'flex-start' : 'flex-end'
                                }}
                            >
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '8px',
                                    flexDirection: isPatient ? 'row' : 'row-reverse'
                                }}>
                                    {/* Avatar circular */}
                                    <div style={{
                                        width: '28px', height: '28px', borderRadius: '50%',
                                        background: isPatient ? selectedChat.avatarColor || '#E11D48' : (isNote ? '#EA580C' : '#059669'),
                                        color: '#FFFFFF', fontSize: '0.72rem', fontWeight: 800,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                    }}>
                                        {isPatient ? selectedChat.contactName.charAt(0) : (isNote ? '🔒' : 'D')}
                                    </div>

                                    {/* Burbuja de Mensaje */}
                                    <div style={{
                                        background: isNote ? '#FFF7ED' : (isPatient ? '#DCFCE7' : '#FFFFFF'),
                                        border: isNote ? '1px solid #FED7AA' : '1px solid #E2E8F0',
                                        padding: '12px 16px',
                                        borderRadius: isPatient ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
                                        color: '#1E293B',
                                        fontSize: '0.86rem',
                                        lineHeight: 1.45
                                    }}>
                                        {isNote && (
                                            <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#EA580C', marginBottom: '4px', textTransform: 'uppercase' }}>
                                                🔒 Nota Privada de Equipo
                                            </div>
                                        )}

                                        {msg.type === 'image' && (
                                            <div style={{ marginBottom: '8px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E2E8F0', maxWidth: '320px' }}>
                                                <img src={msg.mediaUrl} alt={msg.caption} style={{ width: '100%', height: '180px', objectFit: 'cover' }} />
                                                <div style={{ padding: '6px 10px', background: '#F8FAFC', fontSize: '0.75rem', color: '#64748B' }}>
                                                    📄 {msg.caption}
                                                </div>
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

                {/* Compositor de Mensaje AsisteClick */}
                <form onSubmit={handleSend} style={{ padding: '14px 20px', background: '#FFFFFF', borderTop: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <button
                            type="button"
                            onClick={() => setIsPrivateNote(!isPrivateNote)}
                            style={{
                                padding: '4px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                                border: '1px solid', borderColor: isPrivateNote ? '#EA580C' : '#E2E8F0',
                                background: isPrivateNote ? '#FFF7ED' : '#FFFFFF',
                                color: isPrivateNote ? '#EA580C' : '#64748B', cursor: 'pointer'
                            }}
                        >
                            {isPrivateNote ? '🔒 Modo: Nota Privada' : '💬 Mensaje al Paciente'}
                        </button>
                    </div>

                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        background: isPrivateNote ? '#FFF7ED' : '#F8FAFC',
                        border: isPrivateNote ? '1.5px solid #F97316' : '1px solid #E2E8F0',
                        borderRadius: '12px', padding: '8px 12px'
                    }}>
                        <input 
                            type="text"
                            placeholder={isPrivateNote ? 'Escribe una nota interna para el equipo médico...' : 'Escribe tu mensaje por WhatsApp...'}
                            value={messageInput}
                            onChange={(e) => setMessageInput(e.target.value)}
                            style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '0.88rem', color: '#1E293B' }}
                        />

                        <button 
                            type="submit"
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                background: isPrivateNote ? '#EA580C' : '#0284C7',
                                color: '#FFFFFF', border: 'none', padding: '8px 16px',
                                borderRadius: '8px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer'
                            }}
                        >
                            {isPrivateNote ? <Lock size={14} /> : <Send size={14} />}
                            {isPrivateNote ? 'Nota privada' : 'Enviar'}
                        </button>
                    </div>
                </form>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* COLUMNA 3: FICHA DEL PACIENTE Y CAMPOS PERSONALIZADOS           */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid #E2E8F0', background: '#FFFFFF', overflowY: 'auto' }}>
                {/* Selector de Pestañas de Detalle */}
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
                        Info
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
                        Campos
                    </button>
                </div>

                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Canales y Asignación */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>CANAL</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#059669' }}>WHATSAPP</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0F172A' }}>
                            {selectedChat.channelNumber}
                        </div>

                        <div style={{ height: '1px', background: '#E2E8F0', margin: '4px 0' }} />

                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>ESTADO</span>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#059669', background: '#DCFCE7', padding: '2px 8px', borderRadius: '6px' }}>
                                Abierto
                            </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>CHATBOT</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0284C7' }}>{selectedChat.chatbot}</span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>DEPARTAMENTO</span>
                            <span style={{ fontSize: '0.75rem', color: '#1E293B' }}>{selectedChat.department}</span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>ASIGNADO A</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#1E40AF', color: '#FFF', fontSize: '0.65rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>D</span>
                                {selectedChat.assignedTo || 'Sin asignar'}
                            </span>
                        </div>
                    </div>

                    {/* Etiquetas */}
                    <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Tag size={13} /> Etiquetas
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {selectedChat.tags?.map((t, idx) => (
                                <span key={idx} style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF', padding: '3px 8px', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 600 }}>
                                    {t}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Datos de la Conversación */}
                    <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '8px' }}>
                            Datos de esta Conversación
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.78rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#64748B' }}>Teléfono:</span>
                                <span style={{ fontWeight: 600, color: '#0F172A' }}>{selectedChat.phone}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#64748B' }}>Ubicación:</span>
                                <span style={{ fontWeight: 600, color: '#0F172A' }}>Argentina (San Juan)</span>
                            </div>
                        </div>
                    </div>

                    {/* Campos Personalizados de Salud */}
                    <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '8px' }}>
                            Campos Personalizados (Salud)
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ background: '#F8FAFC', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700 }}>DNI PACIENTE</div>
                                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>
                                    {selectedChat.customFields?.dni || '—'}
                                </div>
                            </div>
                            <div style={{ background: '#F8FAFC', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700 }}>OBRA SOCIAL / COBERTURA</div>
                                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0284C7' }}>
                                    {selectedChat.customFields?.obraSocial || '—'}
                                </div>
                            </div>
                            <div style={{ background: '#F8FAFC', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700 }}>TURNOS DÍA Y HORA</div>
                                <div style={{ fontSize: '0.78rem', color: '#334155' }}>
                                    {selectedChat.customFields?.turnosDiaHora || '—'}
                                </div>
                            </div>
                            <div style={{ background: '#F8FAFC', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700 }}>PEDIDO MÉDICO</div>
                                <div style={{ fontSize: '0.78rem', color: '#334155' }}>
                                    {selectedChat.customFields?.pedidoMedicoFoto || '—'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
