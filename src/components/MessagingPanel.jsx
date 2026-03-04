/**
 * MessagingPanel — CRM WhatsApp integrado
 * Panel de dos columnas: lista de conversaciones + vista de chat
 * Comparte la misma BD (whatsapp_messages) con ChatWindow del panel de cirugías
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    MessageSquare, Search, Plus, Send, Phone, User, X,
    ArrowLeft, Smile, Image, Mic, MicOff, Square, Loader,
    RefreshCw, ChevronDown,
} from 'lucide-react';
import {
    fetchConversations, fetchMessages, saveOutgoingMessage,
    markAsRead, subscribeToMessages, subscribeToAllIncoming,
} from '../services/chatService';
import { sendWhatsAppMessage, normalizeArgentinePhone } from '../services/builderbotApi';
import { searchPatients } from '../services/patientService';
import { supabase } from '../lib/supabase';

const QUICK_EMOJIS = [
    '👍', '❤️', '😊', '🙏', '✅', '❌', '⚠️', '🏥', '📋', '📞',
    '💊', '🩺', '👋', '👌', '🤙', '📌', '⏰', '🗓️', '🎉', '💯',
];

export default function MessagingPanel({ addToast }) {
    // === STATE ===
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedPhone, setSelectedPhone] = useState(null);
    const [messages, setMessages] = useState([]);
    const [messagesLoading, setMessagesLoading] = useState(false);
    const [messageText, setMessageText] = useState('');
    const [sending, setSending] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showNewChat, setShowNewChat] = useState(false);
    const [newChatPhone, setNewChatPhone] = useState('');
    const [newChatName, setNewChatName] = useState('');
    const [patientResults, setPatientResults] = useState([]);
    const [patientSearching, setPatientSearching] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [showEmoji, setShowEmoji] = useState(false);
    // Contact names map: phone → name (from surgeries or manual)
    const [contactNames, setContactNames] = useState({});

    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    // === Load contact names from surgeries table ===
    useEffect(() => {
        async function loadContactNames() {
            try {
                const { data } = await supabase
                    .from('surgeries')
                    .select('telefono, paciente')
                    .not('telefono', 'is', null);

                const names = {};
                (data || []).forEach(s => {
                    if (s.telefono && s.paciente) {
                        const normalized = normalizeArgentinePhone(s.telefono);
                        if (normalized && !names[normalized]) {
                            names[normalized] = s.paciente;
                        }
                    }
                });
                setContactNames(names);
            } catch (e) {
                console.error('Error loading contact names:', e);
            }
        }
        loadContactNames();
    }, []);

    // === LOAD CONVERSATIONS ===
    const loadConversations = useCallback(async () => {
        try {
            setLoading(true);
            const data = await fetchConversations();
            setConversations(data);
        } catch (e) {
            console.error(e);
            addToast?.('Error al cargar conversaciones', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => { loadConversations(); }, [loadConversations]);

    // === REALTIME: new incoming messages update conversation list ===
    useEffect(() => {
        const unsub = subscribeToAllIncoming(() => {
            loadConversations();
        });
        return unsub;
    }, [loadConversations]);

    // === LOAD MESSAGES for selected conversation ===
    useEffect(() => {
        if (!selectedPhone) return;
        let cancelled = false;

        async function load() {
            setMessagesLoading(true);
            try {
                const data = await fetchMessages(selectedPhone);
                if (!cancelled) setMessages(data);
                await markAsRead(selectedPhone);
                // Update conversation unread count
                setConversations(prev =>
                    prev.map(c => c.phone === selectedPhone ? { ...c, unreadCount: 0 } : c)
                );
            } catch (e) {
                console.error(e);
            } finally {
                if (!cancelled) setMessagesLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [selectedPhone]);

    // === REALTIME: subscribe to selected conversation ===
    useEffect(() => {
        if (!selectedPhone) return;
        const unsub = subscribeToMessages(selectedPhone, (newMsg) => {
            setMessages(prev => [...prev, newMsg]);
            if (newMsg.direction === 'incoming') {
                markAsRead(selectedPhone);
            }
        });
        return unsub;
    }, [selectedPhone]);

    // === Auto scroll to bottom ===
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // === SEND MESSAGE ===
    const handleSend = useCallback(async () => {
        if (!messageText.trim() || !selectedPhone || sending) return;
        setSending(true);
        try {
            await sendWhatsAppMessage({ content: messageText, number: selectedPhone });
            await saveOutgoingMessage({ phone: selectedPhone, content: messageText });
            setMessageText('');
            inputRef.current?.focus();
        } catch (e) {
            addToast?.('Error al enviar mensaje: ' + e.message, 'error');
        } finally {
            setSending(false);
        }
    }, [messageText, selectedPhone, sending, addToast]);

    // === NEW CONVERSATION ===
    const handleStartNewChat = useCallback(() => {
        if (!newChatPhone.trim()) return;
        const normalized = normalizeArgentinePhone(newChatPhone);
        if (selectedPatient) {
            setContactNames(prev => ({ ...prev, [normalized]: selectedPatient.nombre }));
        } else if (newChatName.trim()) {
            setContactNames(prev => ({ ...prev, [normalized]: newChatName.trim() }));
        }
        setSelectedPhone(normalized);
        setShowNewChat(false);
        setNewChatPhone('');
        setNewChatName('');
        setSelectedPatient(null);
        setPatientResults([]);
        // Add to conversations if not present
        setConversations(prev => {
            const existing = prev.find(c => c.phone === normalized);
            if (existing) return prev;
            return [{
                phone: normalized,
                lastMessage: '',
                lastDate: new Date().toISOString(),
                direction: 'outgoing',
                senderName: '',
                unreadCount: 0,
            }, ...prev];
        });
    }, [newChatPhone, newChatName, selectedPatient]);

    // === PATIENT SEARCH ===
    const handlePatientSearch = useCallback(async (query) => {
        setNewChatName(query);
        setSelectedPatient(null);
        if (query.length < 2) {
            setPatientResults([]);
            return;
        }
        setPatientSearching(true);
        try {
            const results = await searchPatients(query);
            setPatientResults(results?.slice(0, 8) || []);
        } catch (e) {
            console.error(e);
        } finally {
            setPatientSearching(false);
        }
    }, []);

    const selectPatient = useCallback((patient) => {
        setSelectedPatient(patient);
        setNewChatName(patient.nombre || '');
        setPatientResults([]);
    }, []);

    // === FILTERED CONVERSATIONS ===
    const filtered = useMemo(() => {
        if (!searchQuery.trim()) return conversations;
        const q = searchQuery.toLowerCase();
        return conversations.filter(c => {
            const name = contactNames[c.phone] || c.senderName || '';
            return c.phone.includes(q) || name.toLowerCase().includes(q) ||
                c.lastMessage.toLowerCase().includes(q);
        });
    }, [conversations, searchQuery, contactNames]);

    // === HELPERS ===
    const formatTime = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (d.toDateString() === today.toDateString()) return 'Hoy';
        if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
        return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    };

    const formatFullDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('es-AR', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        });
    };

    // Group messages by date for date separators
    const groupedMessages = useMemo(() => {
        const groups = [];
        let lastDate = null;
        messages.forEach(msg => {
            const msgDate = new Date(msg.created_at).toDateString();
            if (msgDate !== lastDate) {
                groups.push({ type: 'date', date: msg.created_at });
                lastDate = msgDate;
            }
            groups.push({ type: 'message', ...msg });
        });
        return groups;
    }, [messages]);

    const selectedContactName = selectedPhone
        ? (contactNames[selectedPhone] || conversations.find(c => c.phone === selectedPhone)?.senderName || selectedPhone)
        : '';

    // ===========================
    //  RENDER
    // ===========================
    return (
        <div className="msg-panel">
            {/* ========== LEFT: Conversation List ========== */}
            <div className="msg-panel__sidebar">
                <div className="msg-panel__sidebar-header">
                    <h3 className="msg-panel__sidebar-title">
                        <MessageSquare size={18} />
                        Mensajería
                    </h3>
                    <button
                        className="msg-panel__btn-icon"
                        onClick={() => setShowNewChat(true)}
                        title="Nueva conversación"
                    >
                        <Plus size={18} />
                    </button>
                </div>

                {/* Search */}
                <div className="msg-panel__search">
                    <Search size={15} className="msg-panel__search-icon" />
                    <input
                        type="text"
                        placeholder="Buscar conversación..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="msg-panel__search-input"
                    />
                </div>

                {/* New Chat Form */}
                {showNewChat && (
                    <div className="msg-panel__new-chat animate-fade-in">
                        <div className="msg-panel__new-chat-header">
                            <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>Nueva conversación</span>
                            <button className="msg-panel__btn-icon" onClick={() => { setShowNewChat(false); setPatientResults([]); setSelectedPatient(null); }}>
                                <X size={15} />
                            </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ position: 'relative' }}>
                                <Phone size={14} style={{ position: 'absolute', left: '10px', top: '9px', color: '#94A3B8' }} />
                                <input
                                    type="tel"
                                    placeholder="Número de teléfono"
                                    value={newChatPhone}
                                    onChange={e => setNewChatPhone(e.target.value)}
                                    className="msg-panel__new-chat-input"
                                    style={{ paddingLeft: '32px' }}
                                />
                            </div>
                            <div style={{ position: 'relative' }}>
                                <User size={14} style={{ position: 'absolute', left: '10px', top: '9px', color: '#94A3B8' }} />
                                <input
                                    type="text"
                                    placeholder="Buscar paciente o ingresar nombre..."
                                    value={newChatName}
                                    onChange={e => handlePatientSearch(e.target.value)}
                                    className="msg-panel__new-chat-input"
                                    style={{ paddingLeft: '32px' }}
                                />
                                {/* Patient search results dropdown */}
                                {patientResults.length > 0 && (
                                    <div className="msg-panel__patient-results animate-fade-in">
                                        {patientResults.map(p => (
                                            <button
                                                key={p.id_paciente}
                                                className="msg-panel__patient-item"
                                                onClick={() => selectPatient(p)}
                                            >
                                                <span style={{ fontWeight: 600 }}>{p.nombre}</span>
                                                {p.dni && <span style={{ color: '#94A3B8', fontSize: '0.72rem' }}>DNI: {p.dni}</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {patientSearching && (
                                    <div style={{ position: 'absolute', right: '10px', top: '9px' }}>
                                        <Loader size={14} className="msg-panel__spinner" />
                                    </div>
                                )}
                            </div>
                            {selectedPatient && (
                                <div className="msg-panel__selected-patient animate-fade-in">
                                    <User size={13} />
                                    <span>{selectedPatient.nombre}</span>
                                    {selectedPatient.dni && <span style={{ color: '#64748B' }}>· DNI {selectedPatient.dni}</span>}
                                    <button onClick={() => { setSelectedPatient(null); setNewChatName(''); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>
                                        <X size={13} />
                                    </button>
                                </div>
                            )}
                            <button
                                className="msg-panel__new-chat-submit"
                                onClick={handleStartNewChat}
                                disabled={!newChatPhone.trim()}
                            >
                                <MessageSquare size={14} />
                                Iniciar Conversación
                            </button>
                        </div>
                    </div>
                )}

                {/* Conversation List */}
                <div className="msg-panel__conv-list">
                    {loading ? (
                        <div className="msg-panel__empty">
                            <Loader size={24} className="msg-panel__spinner" />
                            <span>Cargando...</span>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="msg-panel__empty">
                            <MessageSquare size={32} strokeWidth={1.2} />
                            <span>Sin conversaciones</span>
                        </div>
                    ) : (
                        filtered.map(conv => {
                            const name = contactNames[conv.phone] || conv.senderName || conv.phone;
                            const isActive = selectedPhone === conv.phone;
                            return (
                                <button
                                    key={conv.phone}
                                    className={`msg-panel__conv-item ${isActive ? 'msg-panel__conv-item--active' : ''}`}
                                    onClick={() => setSelectedPhone(conv.phone)}
                                >
                                    <div className="msg-panel__conv-avatar">
                                        {name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="msg-panel__conv-info">
                                        <div className="msg-panel__conv-top">
                                            <span className="msg-panel__conv-name">{name}</span>
                                            <span className="msg-panel__conv-time">{formatDate(conv.lastDate)}</span>
                                        </div>
                                        <div className="msg-panel__conv-bottom">
                                            <span className="msg-panel__conv-preview">
                                                {conv.direction === 'outgoing' && '✓ '}
                                                {conv.lastMessage.length > 45 ? conv.lastMessage.slice(0, 45) + '...' : conv.lastMessage}
                                            </span>
                                            {conv.unreadCount > 0 && (
                                                <span className="msg-panel__conv-badge">{conv.unreadCount}</span>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>

                <div className="msg-panel__sidebar-footer">
                    <button className="msg-panel__btn-icon" onClick={loadConversations} title="Actualizar">
                        <RefreshCw size={15} />
                    </button>
                    <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>
                        {conversations.length} conversación{conversations.length !== 1 ? 'es' : ''}
                    </span>
                </div>
            </div>

            {/* ========== RIGHT: Chat View ========== */}
            <div className="msg-panel__chat">
                {!selectedPhone ? (
                    /* Empty state */
                    <div className="msg-panel__chat-empty">
                        <div className="msg-panel__chat-empty-icon">
                            <MessageSquare size={56} strokeWidth={1} />
                        </div>
                        <h3>Centro de Mensajería</h3>
                        <p>Seleccione una conversación o inicie una nueva</p>
                    </div>
                ) : (
                    <>
                        {/* Chat Header */}
                        <div className="msg-panel__chat-header">
                            <button
                                className="msg-panel__btn-icon msg-panel__back-btn"
                                onClick={() => setSelectedPhone(null)}
                            >
                                <ArrowLeft size={18} />
                            </button>
                            <div className="msg-panel__chat-header-avatar">
                                {selectedContactName.charAt(0).toUpperCase()}
                            </div>
                            <div className="msg-panel__chat-header-info">
                                <span className="msg-panel__chat-header-name">{selectedContactName}</span>
                                <span className="msg-panel__chat-header-phone">
                                    <Phone size={11} /> {selectedPhone}
                                </span>
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="msg-panel__messages">
                            {messagesLoading ? (
                                <div className="msg-panel__empty" style={{ padding: '40px 0' }}>
                                    <Loader size={24} className="msg-panel__spinner" />
                                    <span>Cargando mensajes...</span>
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="msg-panel__empty" style={{ padding: '40px 0' }}>
                                    <MessageSquare size={32} strokeWidth={1.2} />
                                    <span>Sin mensajes aún. ¡Envía el primero!</span>
                                </div>
                            ) : (
                                groupedMessages.map((item, idx) => {
                                    if (item.type === 'date') {
                                        return (
                                            <div key={`date-${idx}`} className="msg-panel__date-separator">
                                                <span>{formatFullDate(item.date)}</span>
                                            </div>
                                        );
                                    }
                                    const isOutgoing = item.direction === 'outgoing';
                                    return (
                                        <div
                                            key={item.id || idx}
                                            className={`msg-panel__bubble ${isOutgoing ? 'msg-panel__bubble--out' : 'msg-panel__bubble--in'}`}
                                        >
                                            {!isOutgoing && item.sender_name && (
                                                <span className="msg-panel__bubble-sender">{item.sender_name}</span>
                                            )}
                                            {/* Media rendering */}
                                            {item.media_url && item.media_type === 'image' && (
                                                <img
                                                    src={item.media_url}
                                                    alt="Imagen"
                                                    className="msg-panel__bubble-image"
                                                    onClick={() => window.open(item.media_url, '_blank')}
                                                />
                                            )}
                                            {item.media_url && item.media_type === 'audio' && (
                                                <audio controls src={item.media_url} style={{ maxWidth: '240px' }} />
                                            )}
                                            {item.content && (
                                                <p className="msg-panel__bubble-text">{item.content}</p>
                                            )}
                                            <span className="msg-panel__bubble-time">
                                                {formatTime(item.created_at)}
                                                {isOutgoing && ' ✓'}
                                            </span>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Composer */}
                        <div className="msg-panel__composer">
                            {/* Emoji picker */}
                            {showEmoji && (
                                <div className="msg-panel__emoji-tray animate-fade-in">
                                    {QUICK_EMOJIS.map(e => (
                                        <button
                                            key={e}
                                            className="msg-panel__emoji-btn"
                                            onClick={() => { setMessageText(prev => prev + e); setShowEmoji(false); inputRef.current?.focus(); }}
                                        >
                                            {e}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="msg-panel__composer-row">
                                <button
                                    className="msg-panel__btn-icon"
                                    onClick={() => setShowEmoji(prev => !prev)}
                                    title="Emojis"
                                >
                                    <Smile size={18} />
                                </button>
                                <input
                                    ref={inputRef}
                                    type="text"
                                    className="msg-panel__composer-input"
                                    placeholder="Escribe un mensaje..."
                                    value={messageText}
                                    onChange={e => setMessageText(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                    disabled={sending}
                                />
                                <button
                                    className="msg-panel__send-btn"
                                    onClick={handleSend}
                                    disabled={!messageText.trim() || sending}
                                    title="Enviar"
                                >
                                    {sending ? <Loader size={16} className="msg-panel__spinner" /> : <Send size={16} />}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
