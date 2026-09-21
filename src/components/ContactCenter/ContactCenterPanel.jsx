import React, { useState, useEffect } from 'react';
import { 
    MessageSquare, CalendarCheck, PlusCircle, ShieldCheck, 
    Headphones, RefreshCw, Layers, CheckCircle2, Lock, Sparkles,
    User, ChevronDown, AlertTriangle, BarChart3, Volume2, VolumeX, Radio
} from 'lucide-react';
import ContactCenterMiSemana from './ContactCenterMiSemana';
import ContactCenterChatConsole from './ContactCenterChatConsole';
import ContactCenterNuevaConversacion from './ContactCenterNuevaConversacion';
import ContactCenterPermisosTab from './ContactCenterPermisosTab';
import ContactCenterTurnosOnlineTab from './ContactCenterTurnosOnlineTab';
import ContactCenterMetricsTab from './ContactCenterMetricsTab';
import { 
    INITIAL_CHATS, fetchAllowedUsers, updateAllowedUsers, 
    canUserAccessContactCenter, MASTER_ADMINS,
    CONTACT_CENTER_AGENTS, getAgentById, fetchLiveAndDemoChats,
    sendContactCenterMessage, assignChatExclusively, unassignChat,
    transferChatToAgent, closeConversationWithResolution,
    subscribeToContactCenterRealtime, playContactCenterChime,
    isClosedOrArchived
} from '../../services/contactCenterService';
import { normalizeArgentinePhone } from '../../services/builderbotApi';
import { supabase } from '../../lib/supabase';

export default function ContactCenterPanel({ currentUser, addToast, initialTab = 'conversaciones' }) {
    const [activeSubTab, setActiveSubTab] = useState(initialTab);

    useEffect(() => {
        if (initialTab) {
            setActiveSubTab(initialTab);
        }
    }, [initialTab]);
    const [chats, setChats] = useState([]);
    const [activeChatId, setActiveChatId] = useState(null);
    const [allowedUsers, setAllowedUsers] = useState(['lmarinero', 'daniela', 'sofia', 'virginia', 'erica']);
    const [savingPermisos, setSavingPermisos] = useState(false);
    const [loadingLive, setLoadingLive] = useState(false);

    // Estado OnLive: Sonido y último ping recibido
    const [soundEnabled, setSoundEnabled] = useState(() => {
        const saved = localStorage.getItem('sa_cc_sound_enabled');
        return saved === null ? true : saved === 'true';
    });
    const [lastLivePing, setLastLivePing] = useState(new Date());

    const toggleSound = () => {
        setSoundEnabled(prev => {
            const next = !prev;
            localStorage.setItem('sa_cc_sound_enabled', String(next));
            return next;
        });
    };

    // Agente activo: match con las credenciales del usuario logueado o primera agente por defecto
    const userLogin = (currentUser?.usuario || '').toLowerCase().trim().split('@')[0];
    const initialAgent = CONTACT_CENTER_AGENTS.find(a => 
        a.id === userLogin || 
        a.username === userLogin || 
        (a.aliases && a.aliases.includes(userLogin)) ||
        (a.legacyId && a.legacyId === userLogin)
    ) || CONTACT_CENTER_AGENTS[0];
    const [activeAgent, setActiveAgent] = useState(initialAgent);

    useEffect(() => {
        if (currentUser?.usuario) {
            const u = currentUser.usuario.toLowerCase().trim().split('@')[0];
            const matched = CONTACT_CENTER_AGENTS.find(a => 
                a.id === u || 
                a.username === u || 
                (a.aliases && a.aliases.includes(u)) ||
                (a.legacyId && a.legacyId === u)
            );
            if (matched) {
                setActiveAgent(matched);
            }
        }
    }, [currentUser?.usuario]);

    const isLMarinero = MASTER_ADMINS.includes((currentUser?.usuario || '').toLowerCase().trim().split('@')[0]);

    // 1. Cargar permisos y sincronizar mensajes en vivo
    const reloadChats = async (isSilent = false) => {
        if (!isSilent) setLoadingLive(true);
        try {
            const loaded = await fetchLiveAndDemoChats();
            setChats(loaded);
            
            // Mantener el chat actualmente seleccionado por el operador, o seleccionar el primer chat activo
            setActiveChatId(currentId => {
                if (currentId && loaded.some(c => c.id === currentId)) {
                    return currentId; // Preservar siempre la selección del usuario
                }
                const firstActive = loaded.find(c => !isClosedOrArchived(c.status));
                return firstActive?.id || loaded[0]?.id || null;
            });
        } catch (err) {
            console.warn('Error cargando chats:', err);
        } finally {
            if (!isSilent) setLoadingLive(false);
        }
    };

    useEffect(() => {
        fetchAllowedUsers().then(users => {
            if (Array.isArray(users)) {
                setAllowedUsers(users);
            }
        });

        reloadChats();

        // Heartbeat de sincronización continua (cada 3 segundos) para garantizar que si el socket parpadea,
        // la consola siempre esté 100% al día sin que el usuario deba tocar F5
        const heartbeatInterval = setInterval(() => {
            reloadChats(true);
        }, 3000);

        // 2. Suscripción OnLive en Tiempo Real (Exclusivo Línea Contact Center y Conversaciones)
        const unsubscribe = subscribeToContactCenterRealtime({
            onNewMessage: (newMsg, eventType) => {
                if (!newMsg) return;
                console.log('[contact-center] ⚡ Evento Realtime entrante (OnLive):', newMsg, eventType);
                setLastLivePing(new Date());

                const normPhone = normalizeArgentinePhone(newMsg.phone);
                const isIncoming = newMsg.direction === 'incoming';

                // Si es un UPDATE de mensaje (ej: resultado de análisis IA de orden médica)
                if (eventType === 'UPDATE') {
                    setChats(prevChats => {
                        const chatIdx = prevChats.findIndex(c => normalizeArgentinePhone(c.phone) === normPhone);
                        if (chatIdx < 0) return prevChats;
                        const existingChat = prevChats[chatIdx];
                        const updatedMessages = (existingChat.messages || []).map(m => {
                            if (m.realId === newMsg.id || m.id === 'real_' + newMsg.id) {
                                return {
                                    ...m,
                                    orderAnalysis: newMsg.raw_payload?.order_analysis || m.orderAnalysis,
                                    rawPayload: newMsg.raw_payload || m.rawPayload
                                };
                            }
                            return m;
                        });
                        const updatedChat = { ...existingChat, messages: updatedMessages };
                        const updated = [...prevChats];
                        updated[chatIdx] = updatedChat;
                        return updated;
                    });
                    return;
                }

                // Reproducir sonido y notificación si es entrante
                if (isIncoming) {
                    if (soundEnabled) {
                        playContactCenterChime();
                    }
                    if (addToast) {
                        const senderDisplay = newMsg.sender_name || normPhone || 'Paciente';
                        const preview = (newMsg.content || '').substring(0, 50);
                        addToast(`💬 ${senderDisplay}: ${preview || 'Archivo multimedia adjunto'}`, 'info');
                    }
                }

                // Inserción optimista sin esperar el re-fetch completo
                setChats(prevChats => {
                    const chatIdx = prevChats.findIndex(c => normalizeArgentinePhone(c.phone) === normPhone);
                    const now = new Date();
                    const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

                    const formattedMsg = {
                        id: 'real_' + (newMsg.id || Date.now()),
                        realId: newMsg.id,
                        sender: isIncoming ? 'patient' : (newMsg.direction === 'note' ? 'note' : 'agent'),
                        senderName: isIncoming ? (newMsg.sender_name || 'Paciente') : (newMsg.sender_name || 'Sanatorio Argentino'),
                        type: newMsg.media_type || 'text',
                        text: newMsg.content || '',
                        mediaUrl: newMsg.media_url || null,
                        orderAnalysis: newMsg.raw_payload?.order_analysis || null,
                        rawPayload: newMsg.raw_payload || null,
                        timestamp: timeStr
                    };

                    if (chatIdx >= 0) {
                        const existingChat = prevChats[chatIdx];
                        const alreadyHasMsg = (existingChat.messages || []).some(m => 
                            m.id === formattedMsg.id || (m.text === formattedMsg.text && m.timestamp === formattedMsg.timestamp)
                        );
                        const updatedMessages = alreadyHasMsg 
                            ? existingChat.messages 
                            : [...(existingChat.messages || []), formattedMsg];

                        const updatedChat = {
                            ...existingChat,
                            messages: updatedMessages,
                            lastMessage: newMsg.content || `[${newMsg.media_type}]`,
                            lastMessageTimestamp: now.getTime(),
                            timeAgo: 'hace instantes',
                            unread: isIncoming ? true : existingChat.unread
                        };

                        const otherChats = prevChats.filter((_, idx) => idx !== chatIdx);
                        return [updatedChat, ...otherChats];
                    } else {
                        // Nuevo chat en vivo no registrado previamente
                        const newRealChat = {
                            id: 'REAL_' + normPhone,
                            contactName: newMsg.sender_name || `Paciente (${normPhone.slice(-4)})`,
                            phone: normPhone,
                            channel: 'WHATSAPP',
                            channelNumber: '5492645825637',
                            status: 'sin_asignar',
                            unread: true,
                            lastMessage: newMsg.content || `[${newMsg.media_type}]`,
                            lastMessageTimestamp: now.getTime(),
                            timeAgo: 'hace instantes',
                            department: 'Atención al cliente',
                            assignedTo: null,
                            assignedToName: null,
                            assignedAt: null,
                            lastResponder: isIncoming ? 'Paciente' : 'Sanatorio',
                            lastResponderRole: isIncoming ? 'patient' : 'agent',
                            lastResponseAt: 'hace instantes',
                            chatbot: '#betina-triage',
                            avatarColor: '#0284C7',
                            tags: ['Mensaje Nuevo'],
                            customFields: {
                                dni: 'A verificar',
                                dniFotoUrl: null,
                                turnosDiaHora: 'Consulta entrante',
                                pedidoMedicoFoto: newMsg.media_type !== 'text' ? 'Adjunto' : '—',
                                pacienteNombre: newMsg.sender_name || 'Paciente',
                                pacienteContacto: normPhone,
                                obraSocial: 'A consultar'
                            },
                            messages: [formattedMsg]
                        };
                        return [newRealChat, ...prevChats];
                    }
                });

                // Sincronización de fondo
                reloadChats();
            },
            onConversationChange: (conv) => {
                console.log('[contact-center] ⚡ Evento Realtime Conversación cambiada:', conv);
                setLastLivePing(new Date());
                const normPhone = normalizeArgentinePhone(conv.phone);
                setChats(prevChats => prevChats.map(c => {
                    if (normalizeArgentinePhone(c.phone) === normPhone) {
                        return {
                            ...c,
                            contactName: conv.nombre_completo || c.contactName,
                            status: conv.status || c.status,
                            assignedTo: conv.assigned_agent_id || c.assignedTo,
                            assignedToName: conv.assigned_agent_name || c.assignedToName,
                            assignedAt: conv.assigned_at || c.assignedAt,
                            botActive: conv.bot_active ?? c.botActive,
                            aiSummary: conv.ai_summary !== undefined ? conv.ai_summary : c.aiSummary,
                            customFields: {
                                ...c.customFields,
                                dni: conv.dni || c.customFields?.dni,
                                pacienteNombre: conv.nombre_completo || c.customFields?.pacienteNombre,
                                obraSocial: conv.obra_social || c.customFields?.obraSocial,
                                fechaNacimiento: conv.fecha_nacimiento || c.customFields?.fechaNacimiento,
                                email: conv.email || c.customFields?.email,
                                departamento: conv.departamento || c.customFields?.departamento,
                                motivoConsulta: conv.motivo_consulta || c.customFields?.motivoConsulta,
                                medicoOEspecialidad: conv.medico_o_especialidad || c.customFields?.medicoOEspecialidad
                            }
                        };
                    }
                    return c;
                }));
            }
        });

        return () => {
            clearInterval(heartbeatInterval);
            if (unsubscribe) unsubscribe();
        };
    }, [soundEnabled]);

    // Manejar envío de mensaje en la consola de chat
    const handleSendMessage = async (chatId, text, isNote = false) => {
        const targetChat = chats.find(c => c.id === chatId);
        if (!targetChat) return;

        try {
            const { newMsg, updatedChat } = await sendContactCenterMessage({
                chat: targetChat,
                text,
                isNote,
                activeAgent,
                currentUser
            });

            setChats(prev => prev.map(c => c.id === chatId ? updatedChat : c));

            if (addToast) {
                addToast(
                    isNote 
                        ? `Nota interna registrada por ${activeAgent.name}` 
                        : `Mensaje WhatsApp enviado por ${activeAgent.name}`, 
                    'success'
                );
            }
        } catch (err) {
            console.error(err);
            if (addToast) addToast(err.message || 'Error al enviar', 'error');
        }
    };

    // Crear nueva conversación
    const handleCreateChat = (newChat) => {
        setChats(prev => [newChat, ...prev]);
        setActiveChatId(newChat.id);
        if (addToast) {
            addToast(`Conversación iniciada con ${newChat.contactName}`, 'success');
        }
    };

    // Asignar chat exclusivamente a una agente (bloqueo contra colisión)
    const handleAssignChat = (chatId, targetAgentId = activeAgent.id) => {
        const targetChat = chats.find(c => c.id === chatId);
        if (!targetChat) return;

        try {
            const targetAgent = getAgentById(targetAgentId);
            const updated = assignChatExclusively(targetChat, targetAgent, currentUser);
            setChats(prev => prev.map(c => c.id === chatId ? updated : c));
            if (addToast) {
                addToast(`Conversación asignada exclusivamente a ${targetAgent.name}`, 'success');
            }
        } catch (err) {
            if (addToast) addToast(err.message, 'error');
        }
    };

    // Liberar conversación a la cola general
    const handleUnassignChat = (chatId) => {
        const targetChat = chats.find(c => c.id === chatId);
        if (!targetChat) return;

        try {
            const updated = unassignChat(targetChat, activeAgent, currentUser);
            setChats(prev => prev.map(c => c.id === chatId ? updated : c));
            if (addToast) {
                addToast(`Conversación liberada a "Sin Asignar"`, 'info');
            }
        } catch (err) {
            if (addToast) addToast(err.message, 'error');
        }
    };

    // Transferir chat a otra agente
    const handleTransferChat = (chatId, toAgentId) => {
        const targetChat = chats.find(c => c.id === chatId);
        if (!targetChat) return;

        try {
            const toAgent = getAgentById(toAgentId);
            const updated = transferChatToAgent(targetChat, activeAgent, toAgent, currentUser);
            setChats(prev => prev.map(c => c.id === chatId ? updated : c));
            if (addToast) {
                addToast(`Conversación transferida a ${toAgent.name}`, 'success');
            }
        } catch (err) {
            if (addToast) addToast(err.message, 'error');
        }
    };

    // Finalizar y archivar chat con motivo de resolución
    const handleCloseChat = async (chatId, resolutionReason) => {
        const targetChat = chats.find(c => c.id === chatId);
        if (!targetChat) return;

        try {
            const updated = await closeConversationWithResolution({
                chat: targetChat,
                resolutionReason,
                activeAgent,
                currentUser
            });
            setChats(prev => prev.map(c => c.id === chatId ? updated : c));
            if (addToast) {
                addToast(`Atención finalizada y mensaje de despedida/encuesta enviado al paciente (${resolutionReason})`, 'success');
            }
        } catch (err) {
            if (addToast) addToast(err.message || 'Error al finalizar atención', 'error');
        }
    };

    // Cambiar permisos de un usuario (solo lmarinero)
    const handleToggleUser = async (username) => {
        if (!isLMarinero) return;
        setSavingPermisos(true);
        try {
            let updated;
            if (allowedUsers.includes(username)) {
                updated = allowedUsers.filter(u => u !== username);
            } else {
                updated = [...allowedUsers, username];
            }
            const clean = await updateAllowedUsers(updated, currentUser?.usuario || 'lmarinero');
            setAllowedUsers(clean);
            if (addToast) {
                addToast(`Permisos de @${username} actualizados`, 'success');
            }
        } catch (err) {
            console.error(err);
            if (addToast) addToast('Error al actualizar permisos', 'error');
        } finally {
            setSavingPermisos(false);
        }
    };

    const handleSelectChatFromSummary = (chatId) => {
        setActiveChatId(chatId);
        setActiveSubTab('conversaciones');
    };

    const handleOpenChatWithPhone = (phone) => {
        if (!phone) return;
        const cleanPhone = phone.replace(/\D/g, '');
        const existing = chats.find(c => {
            const p = (c.contactPhone || c.phone || '').replace(/\D/g, '');
            return p.includes(cleanPhone) || cleanPhone.includes(p);
        });

        if (existing) {
            setActiveChatId(existing.id);
            setActiveSubTab('conversaciones');
        } else {
            setActiveSubTab('nueva_conversacion');
        }
    };

    return (
        <div className="content no-print" style={{ padding: '20px 24px', background: '#F8FAFC', minHeight: 'calc(100vh - 70px)' }}>
            {/* Header del Módulo Contact Center (Oculto cuando se ve Turnos Online) */}
            {activeSubTab !== 'turnos_online' && (
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '16px',
                    marginBottom: '18px',
                    paddingBottom: '14px',
                    borderBottom: '1px solid #E2E8F0'
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                        width: '44px', height: '44px', borderRadius: '12px',
                        background: 'linear-gradient(135deg, #0F2942 0%, #0284C7 100%)',
                        color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 10px rgba(2, 132, 199, 0.25)'
                    }}>
                        <Headphones size={24} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#0F172A' }}>
                                Contact Center
                            </h1>
                            {/* ON LIVE STATUS BEACON */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                background: '#ECFDF5', border: '1px solid #A7F3D0',
                                padding: '3px 9px', borderRadius: '12px',
                                boxShadow: '0 1px 2px rgba(16, 185, 129, 0.15)'
                            }} title="Canal WebSocket Realtime conectado a Supabase">
                                <span style={{
                                    width: '8px', height: '8px', borderRadius: '50%',
                                    background: '#10B981',
                                    boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.25)',
                                    display: 'inline-block'
                                }} />
                                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#047857', letterSpacing: '0.5px' }}>
                                    ON LIVE
                                </span>
                            </div>

                            {/* TOGGLE DE SONIDO CHIME */}
                            <button
                                onClick={toggleSound}
                                title={soundEnabled ? 'Silenciar avisos sonoros' : 'Activar sonido de nuevos mensajes'}
                                style={{
                                    padding: '4px 8px', borderRadius: '8px', border: '1px solid #CBD5E1',
                                    background: soundEnabled ? '#F0FDF4' : '#FFFFFF',
                                    color: soundEnabled ? '#16A34A' : '#94A3B8',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                                    fontSize: '0.72rem', fontWeight: 700, transition: 'all 0.15s'
                                }}
                            >
                                {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
                                <span>{soundEnabled ? 'Sonido' : 'Mute'}</span>
                            </button>

                            {/* RECARGA MANUAL */}
                            <button
                                onClick={reloadChats}
                                disabled={loadingLive}
                                title="Forzar sincronización inmediata con SALUS y WhatsApp"
                                style={{
                                    padding: '4px 8px', borderRadius: '8px', border: '1px solid #CBD5E1',
                                    background: '#FFFFFF', color: '#0284C7', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '4px',
                                    fontSize: '0.72rem', fontWeight: 700
                                }}
                            >
                                <RefreshCw size={12} className={loadingLive ? 'spin' : ''} />
                                <span>{loadingLive ? 'Sync...' : 'Sync'}</span>
                            </button>
                        </div>
                        <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#64748B' }}>
                            Consola Multicanal de Sanatorio Argentino • 4 Agentes con Asignación Exclusiva
                        </p>
                    </div>
                </div>

                {/* SELECTOR DE AGENTE ACTIVA CON CONTEO DE MENSAJES ASIGNADOS */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '10px',
                        padding: '4px 8px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                    }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748B' }}>
                            Atendiendo como:
                        </span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {CONTACT_CENTER_AGENTS.map(agent => {
                                const isCurrent = activeAgent.id === agent.id || activeAgent.username === agent.username;
                                
                                // Cantidad de chats activos asignados a este agente
                                const assignedCount = chats.filter(c => {
                                    if (c.status === 'archivado') return false;
                                    const assigned = (c.assignedTo || '').toLowerCase();
                                    if (!assigned) return false;
                                    return (
                                        assigned === agent.id.toLowerCase() ||
                                        (agent.username && assigned === agent.username.toLowerCase()) ||
                                        (agent.legacyId && assigned === agent.legacyId.toLowerCase()) ||
                                        (c.assignedToName || '').toLowerCase().includes(agent.name.toLowerCase())
                                    );
                                }).length;

                                const canSwitch = isLMarinero;

                                return (
                                    <button
                                        key={agent.id}
                                        onClick={() => {
                                            if (canSwitch) {
                                                setActiveAgent(agent);
                                            } else if (!isCurrent) {
                                                addToast?.(`Estás autenticada como ${activeAgent.name}. Solo supervisores pueden conmutar de agente.`, 'info');
                                            }
                                        }}
                                        title={canSwitch ? `Cambiar a ${agent.fullName} (${assignedCount} asignados)` : `${agent.fullName}: ${assignedCount} chats asignados`}
                                        style={{
                                            padding: '4px 8px', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 700,
                                            border: 'none', cursor: canSwitch || isCurrent ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: '5px',
                                            background: isCurrent ? agent.color : '#F1F5F9',
                                            color: isCurrent ? '#FFFFFF' : '#475569',
                                            boxShadow: isCurrent ? `0 2px 5px ${agent.color}40` : 'none',
                                            transition: 'all 0.15s',
                                            opacity: (!isCurrent && !canSwitch) ? 0.85 : 1
                                        }}
                                    >
                                        <div style={{
                                            width: '16px', height: '16px', borderRadius: '50%',
                                            background: isCurrent ? '#FFFFFF' : agent.color,
                                            color: isCurrent ? agent.color : '#FFFFFF',
                                            fontSize: '0.62rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            {agent.avatar}
                                        </div>
                                        <span>{agent.name}</span>
                                        <span style={{
                                            background: isCurrent ? 'rgba(255, 255, 255, 0.3)' : (assignedCount > 0 ? '#E2E8F0' : '#E2E8F0'),
                                            color: isCurrent ? '#FFFFFF' : (assignedCount > 0 ? '#0F172A' : '#64748B'),
                                            padding: '1px 6px',
                                            borderRadius: '10px',
                                            fontSize: '0.66rem',
                                            fontWeight: 800,
                                            marginLeft: '1px'
                                        }} title={`${assignedCount} chats asignados`}>
                                            {assignedCount}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Badge de Sin Asignar */}
                    {(() => {
                        const unassignedCount = chats.filter(c => (!c.assignedTo || c.status === 'sin_asignar') && c.status !== 'archivado').length;
                        if (unassignedCount === 0) return null;
                        return (
                            <div style={{
                                fontSize: '0.72rem', fontWeight: 800,
                                background: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D',
                                padding: '4px 10px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '5px'
                            }} title="Conversaciones sin asignar en la cola general de Contact Center">
                                <span>⚠️ Sin asignar:</span>
                                <span style={{ background: '#B45309', color: '#FFF', borderRadius: '10px', padding: '1px 6px', fontSize: '0.66rem', fontWeight: 800 }}>
                                    {unassignedCount}
                                </span>
                            </div>
                        );
                    })()}

                    {/* Pestañas de Navegación del Módulo */}
                    <div style={{
                        display: 'flex',
                        background: '#FFFFFF',
                        borderRadius: '10px',
                        padding: '4px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                    }}>
                        <button
                            onClick={() => setActiveSubTab('conversaciones')}
                            style={{
                                padding: '8px 16px', borderRadius: '8px', border: 'none',
                                fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '6px',
                                background: activeSubTab === 'conversaciones' ? '#0F2942' : 'transparent',
                                color: activeSubTab === 'conversaciones' ? '#FFFFFF' : '#64748B',
                                transition: 'all 0.15s'
                            }}
                        >
                            <MessageSquare size={16} />
                            Conversaciones
                            <span style={{
                                background: activeSubTab === 'conversaciones' ? '#0284C7' : '#EFF6FF',
                                color: activeSubTab === 'conversaciones' ? '#FFFFFF' : '#1E40AF',
                                fontSize: '0.68rem', padding: '1px 6px', borderRadius: '10px', fontWeight: 800
                            }}>
                                {chats.filter(c => !c.assignedTo).length}
                            </span>
                        </button>

                        <button
                            onClick={() => setActiveSubTab('mi_semana')}
                            style={{
                                padding: '8px 16px', borderRadius: '8px', border: 'none',
                                fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '6px',
                                background: activeSubTab === 'mi_semana' ? '#0F2942' : 'transparent',
                                color: activeSubTab === 'mi_semana' ? '#FFFFFF' : '#64748B',
                                transition: 'all 0.15s'
                            }}
                        >
                            <CalendarCheck size={16} />
                            Mi Semana
                        </button>

                        <button
                            onClick={() => setActiveSubTab('nueva_conversacion')}
                            style={{
                                padding: '8px 16px', borderRadius: '8px', border: 'none',
                                fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '6px',
                                background: activeSubTab === 'nueva_conversacion' ? '#0F2942' : 'transparent',
                                color: activeSubTab === 'nueva_conversacion' ? '#FFFFFF' : '#64748B',
                                transition: 'all 0.15s'
                            }}
                        >
                            <PlusCircle size={16} />
                            Crear Conversación
                        </button>

                        {/* Nueva Pestaña: Turnos Online Duplicados */}
                        <button
                            onClick={() => setActiveSubTab('turnos_online')}
                            style={{
                                padding: '8px 16px', borderRadius: '8px', border: 'none',
                                fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '6px',
                                background: activeSubTab === 'turnos_online' ? '#0F2942' : 'transparent',
                                color: activeSubTab === 'turnos_online' ? '#FFFFFF' : '#DC2626',
                                transition: 'all 0.15s'
                            }}
                        >
                            <AlertTriangle size={16} />
                            Turnos Online
                            <span style={{
                                background: activeSubTab === 'turnos_online' ? '#DC2626' : '#FEE2E2',
                                color: activeSubTab === 'turnos_online' ? '#FFFFFF' : '#DC2626',
                                fontSize: '0.68rem', padding: '1px 6px', borderRadius: '10px', fontWeight: 800
                            }}>
                                Alertas
                            </span>
                        </button>

                        {/* Nueva Pestaña: Métricas y Control de Costos */}
                        <button
                            onClick={() => setActiveSubTab('metricas')}
                            style={{
                                padding: '8px 16px', borderRadius: '8px', border: 'none',
                                fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '6px',
                                background: activeSubTab === 'metricas' ? '#0F2942' : 'transparent',
                                color: activeSubTab === 'metricas' ? '#FFFFFF' : '#0284C7',
                                transition: 'all 0.15s'
                            }}
                        >
                            <BarChart3 size={16} />
                            Métricas y Costos
                        </button>

                        {/* Pestaña de Permisos (Visible EXCLUSIVAMENTE para lmarinero) */}
                        {isLMarinero && (
                            <button
                                onClick={() => setActiveSubTab('permisos')}
                                style={{
                                    padding: '8px 16px', borderRadius: '8px', border: 'none',
                                    fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    background: activeSubTab === 'permisos' ? '#1E40AF' : 'transparent',
                                    color: activeSubTab === 'permisos' ? '#FFFFFF' : '#1E40AF',
                                    transition: 'all 0.15s'
                                }}
                            >
                                <ShieldCheck size={16} />
                                Permisos
                            </button>
                        )}
                    </div>
                </div>
            </div>
            )}

            {/* Vistas del Módulo */}
            {activeSubTab === 'turnos_online' && (
                <ContactCenterTurnosOnlineTab 
                    activeAgent={activeAgent}
                    currentUser={currentUser}
                    addToast={addToast}
                    onOpenChatWithPhone={handleOpenChatWithPhone}
                    onBackToConsole={() => setActiveSubTab('conversaciones')}
                />
            )}

            {activeSubTab === 'metricas' && (
                <ContactCenterMetricsTab 
                    addToast={addToast}
                />
            )}

            {activeSubTab === 'conversaciones' && (
                <ContactCenterChatConsole 
                    chats={chats}
                    activeChatId={activeChatId}
                    activeAgent={activeAgent}
                    currentUser={currentUser}
                    onSelectChat={setActiveChatId}
                    onSendMessage={handleSendMessage}
                    onAssignChat={handleAssignChat}
                    onUnassignChat={handleUnassignChat}
                    onTransferChat={handleTransferChat}
                    onCloseChat={handleCloseChat}
                />
            )}

            {activeSubTab === 'mi_semana' && (
                <ContactCenterMiSemana 
                    chats={chats}
                    activeAgent={activeAgent}
                    onSelectChat={handleSelectChatFromSummary}
                    onNavigateTab={setActiveSubTab}
                />
            )}

            {activeSubTab === 'nueva_conversacion' && (
                <ContactCenterNuevaConversacion 
                    activeAgent={activeAgent}
                    onCreateChat={handleCreateChat}
                    onNavigateTab={setActiveSubTab}
                />
            )}

            {activeSubTab === 'permisos' && isLMarinero && (
                <ContactCenterPermisosTab 
                    allowedUsers={allowedUsers}
                    onToggleUser={handleToggleUser}
                    saving={savingPermisos}
                />
            )}
        </div>
    );
}
