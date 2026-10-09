import React, { useState, useEffect } from 'react';
import { 
    MessageSquare, CalendarCheck, PlusCircle, ShieldCheck, 
    Headphones, RefreshCw, Layers, CheckCircle2, Lock, Sparkles,
    User, ChevronDown, AlertTriangle, BarChart3, Volume2, VolumeX, Radio, Settings, Award, CalendarX
} from 'lucide-react';
import ContactCenterChatConsole from './ContactCenterChatConsole';
import ContactCenterNuevaConversacion from './ContactCenterNuevaConversacion';
import ContactCenterPermisosTab from './ContactCenterPermisosTab';
import ContactCenterCancelacionesTab from './ContactCenterCancelacionesTab';
import ContactCenterTurnosOnlineTab from './ContactCenterTurnosOnlineTab';
import ContactCenterMetricsTab from './ContactCenterMetricsTab';
import ContactCenterConfigTab from './ContactCenterConfigTab';
import ContactCenterIncentivosTab from './ContactCenterIncentivosTab';
import ChatWindow from '../ChatWindow';
import { 
    INITIAL_CHATS, fetchAllowedUsers, updateAllowedUsers, 
    canUserAccessContactCenter, MASTER_ADMINS,
    CONTACT_CENTER_AGENTS, getAgentById, fetchLiveAndDemoChats,
    sendContactCenterMessage, sendContactCenterTemplate, assignChatExclusively, unassignChat,
    transferChatToAgent, closeConversationWithResolution,
    bulkCloseConversationsSilent, autoArchiveInactiveBotConversations,
    subscribeToContactCenterRealtime, playContactCenterChime,
    isClosedOrArchived, toggleMessageReaction
} from '../../services/contactCenterService';
import { normalizeArgentinePhone } from '../../services/builderbotApi';
import { supabase } from '../../lib/supabase';
import { getPendingCancelacionesCount, subscribeToCancelaciones } from '../../services/cancelacionesService';

export default function ContactCenterPanel({ currentUser, addToast, initialTab = 'conversaciones', onTabChange }) {
    const sanitizedInitialTab = initialTab === 'mi_semana' ? 'conversaciones' : initialTab;
    const [activeSubTab, setActiveSubTab] = useState(sanitizedInitialTab);

    useEffect(() => {
        const next = initialTab === 'mi_semana' ? 'conversaciones' : initialTab;
        if (next && next !== activeSubTab) {
            setActiveSubTab(next);
        }
    }, [initialTab]);

    const handleNavigateTab = (newTab) => {
        setActiveSubTab(newTab);
        if (onTabChange) {
            onTabChange(newTab);
        }
    };
    const [chats, setChats] = useState([]);
    const [panelChatOpen, setPanelChatOpen] = useState(false);
    const [panelChatPatient, setPanelChatPatient] = useState({ name: '', phone: '', dni: '' });
    const [activeChatId, setActiveChatId] = useState(() => {
        try {
            return localStorage.getItem('sa_cc_active_chat_id') || null;
        } catch (_) {
            return null;
        }
    });

    const handleSelectChat = (id) => {
        setActiveChatId(id);
        try {
            if (id) {
                localStorage.setItem('sa_cc_active_chat_id', String(id));
            } else {
                localStorage.removeItem('sa_cc_active_chat_id');
            }
        } catch (_) {}
    };

    useEffect(() => {
        try {
            if (activeChatId) {
                localStorage.setItem('sa_cc_active_chat_id', String(activeChatId));
            }
        } catch (_) {}
    }, [activeChatId]);

    const [allowedUsers, setAllowedUsers] = useState(['lmarinero', 'daniela', 'sofia', 'virginia', 'erica']);
    const [savingPermisos, setSavingPermisos] = useState(false);
    const [loadingLive, setLoadingLive] = useState(false);

    // Conteo de Cancelaciones Pendientes en SALUS para badges en vivo
    const [pendingCancelacionesCount, setPendingCancelacionesCount] = useState(0);

    useEffect(() => {
        getPendingCancelacionesCount().then(c => setPendingCancelacionesCount(c));
        const unsubCancel = subscribeToCancelaciones(() => {
            getPendingCancelacionesCount().then(c => setPendingCancelacionesCount(c));
        });
        return () => {
            if (unsubCancel) unsubCancel();
        };
    }, []);

    // Estado OnLive: Sonido y último ping recibido
    const [soundEnabled, setSoundEnabled] = useState(() => {
        const saved = localStorage.getItem('sa_cc_sound_enabled');
        return saved === null ? true : saved === 'true';
    });
    const soundEnabledRef = React.useRef(soundEnabled);
    useEffect(() => {
        soundEnabledRef.current = soundEnabled;
    }, [soundEnabled]);

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
    // Guard anti-apilamiento: si una recarga sigue en curso (base lenta), no lanzar otra encima.
    const reloadInFlightRef = React.useRef(false);
    const reloadChats = async (isSilent = false) => {
        if (reloadInFlightRef.current) return;
        reloadInFlightRef.current = true;
        if (!isSilent) setLoadingLive(true);
        try {
            const loaded = await fetchLiveAndDemoChats();

            // PROTECCIÓN CRÍTICA: Si el fetch retorna vacío pero ya teníamos chats cargados,
            // es un error transitorio (timeout / sobrecarga del servidor). NO sobreescribir.
            if (Array.isArray(loaded) && loaded.length === 0) {
                setChats(prevChats => {
                    if (prevChats.length > 0) {
                        console.warn('[contact-center] fetch devolvió 0 chats pero hay datos previos — manteniendo estado actual.');
                        return prevChats; // Proteger estado
                    }
                    return loaded;
                });
                if (!isSilent) setLoadingLive(false);
                reloadInFlightRef.current = false;
                return;
            }

            setChats(prevChats => {
                const prevMap = new Map();
                (prevChats || []).forEach(c => {
                    if (c.id) prevMap.set(String(c.id), c);
                    const digits = String(c.phone || c.id || '').replace(/\D/g, '');
                    if (digits.length >= 8) prevMap.set(digits.slice(-10), c);
                });

                // Fusionar historial: la recarga trae como máximo los últimos N mensajes por chat.
                // Si en memoria ya había más (historial cargado al abrir el chat), se conservan
                // y se agregan solo los nuevos, para que los mensajes no "aparezcan y desaparezcan".
                const msgKey = (m) => String(m?.realId || m?.id || '');
                const merged = loaded.map(newChat => {
                    const newDigits = String(newChat.phone || newChat.id || '').replace(/\D/g, '');
                    const oldChat = prevMap.get(String(newChat.id)) || (newDigits.length >= 8 ? prevMap.get(newDigits.slice(-10)) : null);
                    const oldMsgs = oldChat?.messages || [];
                    const newMsgs = newChat.messages || [];
                    if (oldMsgs.length === 0) return newChat;
                    const newKeys = new Set(newMsgs.map(msgKey));
                    const onlyInOld = oldMsgs.filter(m => {
                        const k = msgKey(m);
                        // Mensajes optimistas locales (sin realId) se descartan si ya llegó su versión real
                        return k && !newKeys.has(k) && (m.realId || !String(m.id || '').startsWith('msg_'));
                    });
                    if (onlyInOld.length === 0) return newChat;
                    const combined = [...onlyInOld, ...newMsgs].sort((a, b) => {
                        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
                        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
                        return ta - tb;
                    });
                    return { ...newChat, messages: combined };
                });

                // Comparar por ID (no por índice) para detectar cambios correctamente
                // aunque el orden del array haya variado entre reloads.
                if (isSilent && Array.isArray(prevChats) && prevChats.length === merged.length) {
                    const hasChange = merged.some(newChat => {
                        const newDigits = String(newChat.phone || newChat.id || '').replace(/\D/g, '');
                        const oldChat = prevMap.get(String(newChat.id)) || (newDigits.length >= 8 ? prevMap.get(newDigits.slice(-10)) : null);
                        if (!oldChat) return true; // Chat nuevo o con ID diferente
                        if (oldChat.messages?.length !== newChat.messages?.length) return true;
                        if (oldChat.status !== newChat.status) return true;
                        if (oldChat.unreadCount !== newChat.unreadCount) return true;
                        if (oldChat.assignedTo !== newChat.assignedTo) return true;
                        if (oldChat.botActive !== newChat.botActive) return true;
                        if (oldChat.lastMessageTimestamp !== newChat.lastMessageTimestamp) return true;
                        if (oldChat.customFields?.dni !== newChat.customFields?.dni) return true;
                        if (oldChat.customFields?.pacienteNombre !== newChat.customFields?.pacienteNombre) return true;
                        return false;
                    });
                    if (!hasChange) return prevChats;
                }
                return merged;
            });
            
            // Mantener SIEMPRE el chat actualmente seleccionado por el operador
            setActiveChatId(currentId => {
                const savedId = (() => {
                    try { return localStorage.getItem('sa_cc_active_chat_id'); } catch (_) { return null; }
                })();
                const targetId = currentId || savedId;
                if (targetId) {
                    // Buscar coincidencia robusta en loaded (por ID o por sufijo de 10 dígitos del teléfono)
                    const found = loaded.find(c => {
                        if (c.id === targetId || String(c.id) === String(targetId)) return true;
                        const targetDigits = String(targetId).replace(/\D/g, '');
                        if (targetDigits.length >= 8) {
                            const cDigits = String(c.id || '').replace(/\D/g, '');
                            const cPhone = String(c.phone || '').replace(/\D/g, '');
                            return (cDigits.length >= 8 && cDigits.slice(-10) === targetDigits.slice(-10)) ||
                                   (cPhone.length >= 8 && cPhone.slice(-10) === targetDigits.slice(-10));
                        }
                        return false;
                    });
                    if (found) {
                        return found.id; // Actualizar con el ID canónico
                    }
                    // Si el operador ya estaba en un chat y no está en loaded (ej: conversación archivada o en triage),
                    // CONSERVAR targetId. NUNCA cambiarle el chat de forma arbitraria.
                    return targetId;
                }
                const firstActive = loaded.find(c => !isClosedOrArchived(c.status));
                const fallbackId = firstActive?.id || loaded[0]?.id || null;
                if (fallbackId) {
                    try { localStorage.setItem('sa_cc_active_chat_id', String(fallbackId)); } catch (_) {}
                }
                return fallbackId;
            });
        } catch (err) {
            // Error transitorio: NO limpiar el estado existente. Solo loguear.
            console.warn('[contact-center] Error cargando chats (estado preservado):', err?.message || err);
        } finally {
            reloadInFlightRef.current = false;
            if (!isSilent) setLoadingLive(false);
        }
    };

    useEffect(() => {
        fetchAllowedUsers().then(users => {
            if (Array.isArray(users)) {
                setAllowedUsers(users);
            }
        });

        // Retardo inicial de 600ms para evitar colisión con otras queries
        // que se lanzan al montar la app (altas_administrativas, auth, etc.).
        // Esto evita saturar el pool de conexiones de Supabase al inicio.
        const initialLoadTimer = setTimeout(() => {
            reloadChats().then(() => {
                // Red de seguridad: si el primer load trajo 0 chats por latencia de red,
                // reintentamos de forma escalonada (1.5s y 4s) para recuperar la bandeja sin requerir F5 manual
                setChats(currentChats => {
                    if (currentChats.length === 0) {
                        setTimeout(() => reloadChats(), 1500);
                        setTimeout(() => reloadChats(), 4000);
                    }
                    return currentChats;
                });
            });
        }, 600);

        // Auto-archivar conversaciones inactivas del Bot (> 20 min) al montar y en heartbeat
        autoArchiveInactiveBotConversations(20);

        // Heartbeat adaptativo: cada 90 segundos para verificar consistencia si la pestaña está visible.
        // Los mensajes nuevos llegan por Realtime; el heartbeat es solo red de seguridad.
        // Pausado automáticamente si el operador minimiza o cambia de pestaña.
        const HEARTBEAT_MS = 90000;
        let lastFetchTime = Date.now();
        const heartbeatInterval = setInterval(() => {
            if (document.hidden) return; // Suspender en segundo plano para proteger la RAM del equipo
            autoArchiveInactiveBotConversations(20);
            reloadChats(true);
            lastFetchTime = Date.now();
        }, HEARTBEAT_MS);

        const handleVisibilityChange = () => {
            if (!document.hidden && Date.now() - lastFetchTime > HEARTBEAT_MS) {
                reloadChats(true);
                lastFetchTime = Date.now();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // 2. Suscripción OnLive en Tiempo Real (Exclusivo Línea Contact Center y Conversaciones)
        const unsubscribe = subscribeToContactCenterRealtime({
            onNewMessage: (newMsg, eventType) => {
                if (!newMsg) return;
                setLastLivePing(new Date());

                const normPhone = normalizeArgentinePhone(newMsg.phone);
                const isIncoming = newMsg.direction === 'incoming';

                const matchesPhone = (phoneA, phoneB) => {
                    const a = normalizeArgentinePhone(phoneA);
                    const b = normalizeArgentinePhone(phoneB);
                    if (a === b) return true;
                    return a.length >= 8 && b.length >= 8 && a.slice(-8) === b.slice(-8);
                };

                // Si es un UPDATE de mensaje (ej: resultado de análisis IA de orden médica)
                if (eventType === 'UPDATE') {
                    setChats(prevChats => {
                        const chatIdx = prevChats.findIndex(c => matchesPhone(c.phone, normPhone));
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

                // Reproducir sonido si es entrante (con detección de prioridad para triage auditivo)
                if (isIncoming) {
                    const isUrgent = /\b(guardia|urgencia|emergencia|dolor|grave|hemorragia|urgente)\b/i.test(newMsg.content || '');
                    if (soundEnabledRef.current) {
                        playContactCenterChime(isUrgent ? 'urgent' : 'normal');
                    }
                }

                // Sanitizar payload para que no retenga binarios pesados en memoria
                const sanitizedRaw = newMsg.raw_payload ? {
                    order_analysis: newMsg.raw_payload.order_analysis,
                    audio_transcription: newMsg.raw_payload.audio_transcription || newMsg.raw_payload.transcription,
                    audio_understanding: newMsg.raw_payload.audio_understanding,
                    agent: newMsg.raw_payload.agent,
                    bot: newMsg.raw_payload.bot
                } : null;

                // Inserción optimista sin esperar el re-fetch completo
                setChats(prevChats => {
                    const chatIdx = prevChats.findIndex(c => matchesPhone(c.phone, normPhone));
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
                        rawPayload: sanitizedRaw,
                        created_at: newMsg.created_at || new Date().toISOString(),
                        timestamp: timeStr
                    };

                    if (chatIdx >= 0) {
                        const existingChat = prevChats[chatIdx];
                        const alreadyHasMsg = (existingChat.messages || []).some(m => 
                            m.id === formattedMsg.id || (m.realId && m.realId === formattedMsg.realId)
                        );
                        const nextMsgs = alreadyHasMsg 
                            ? existingChat.messages 
                            : [...(existingChat.messages || []), formattedMsg];
                        
                        // Capping en memoria activa: mantener máximo 80 mensajes por chat
                        const updatedMessages = nextMsgs.length > 80 ? nextMsgs.slice(-80) : nextMsgs;

                        const updatedChat = {
                            ...existingChat,
                            messages: updatedMessages,
                            lastMessage: newMsg.content || `[${newMsg.media_type}]`,
                            lastMessageTimestamp: now.getTime(),
                            lastIncomingTimestamp: isIncoming ? now.getTime() : (existingChat.lastIncomingTimestamp || 0),
                            lastIncomingAt: isIncoming ? now.toISOString() : (existingChat.lastIncomingAt || null),
                            timeAgo: 'hace instantes',
                            unread: isIncoming ? true : existingChat.unread,
                            lastResponder: isIncoming ? (newMsg.sender_name || 'Paciente') : (newMsg.sender_name || 'Sanatorio Argentino'),
                            lastResponderRole: isIncoming ? 'patient' : 'agent',
                            isWaitingResponse: isIncoming ? true : false,
                            waitingMinutes: 0,
                            waitingTimeText: isIncoming ? 'Sin responder hace instantes' : 'Respondido',
                            badgeTimeText: isIncoming ? 'hace instantes' : 'Respondido'
                        };

                        // Toda actividad reciente (mensajes del paciente o respuestas del agente)
                        // posiciona el chat al inicio de la bandeja (orden cronológico por actividad reciente).
                        const otherChats = prevChats.filter((_, idx) => idx !== chatIdx);
                        return [updatedChat, ...otherChats].sort((a, b) => {
                            const aKey = Math.max(Number(a.lastMessageTimestamp) || 0, Number(a.lastIncomingTimestamp) || 0);
                            const bKey = Math.max(Number(b.lastMessageTimestamp) || 0, Number(b.lastIncomingTimestamp) || 0);
                            if (bKey !== aKey) return bKey - aKey;
                            return String(b.id || '').localeCompare(String(a.id || ''));
                        });
                    } else {
                        // Nuevo chat en vivo no registrado previamente
                        const newRealChat = {
                            id: 'REAL_' + normPhone,
                            contactName: newMsg.sender_name || `Paciente (${normPhone.slice(-4)})`,
                            phone: normPhone,
                            channel: 'WHATSAPP',
                            channelNumber: '5492645825637',
                            status: 'bot',
                            botActive: true,
                            unread: true,
                            lastMessage: newMsg.content || `[${newMsg.media_type}]`,
                            lastMessageTimestamp: now.getTime(),
                            timeAgo: 'hace instantes',
                            department: 'Atención al cliente',
                            assignedTo: null,
                            assignedToName: null,
                            assignedAt: null,
                            lastResponder: isIncoming ? (newMsg.sender_name || 'Paciente') : 'Sanatorio',
                            lastResponderRole: isIncoming ? 'patient' : 'agent',
                            lastResponseAt: 'hace instantes',
                            isWaitingResponse: isIncoming,
                            waitingMinutes: 0,
                            waitingTimeText: isIncoming ? 'Sin responder hace instantes' : 'Respondido',
                            badgeTimeText: isIncoming ? 'hace instantes' : 'Respondido',
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
                        return [newRealChat, ...prevChats].sort((a, b) => (b.lastMessageTimestamp || 0) - (a.lastMessageTimestamp || 0));
                    }
                });

                // NO disparamos reloadChats() aquí: la inserción optimista ya actualizó la interfaz de forma inmediata y ligera.
            },
            onConversationChange: (conv) => {
                console.log('[contact-center] ⚡ Evento Realtime Conversación cambiada:', conv);
                setLastLivePing(new Date());
                const normPhone = normalizeArgentinePhone(conv.phone);
                setChats(prevChats => {
                    let changed = false;
                    const next = prevChats.map(c => {
                        if (normalizeArgentinePhone(c.phone) !== normPhone) return c;
                        const isClosing = isClosedOrArchived(conv.status) || Boolean(conv.closed_at);
                        const updated = {
                            ...c,
                            contactName: conv.nombre_completo || c.contactName,
                            status: conv.status || c.status,
                            assignedTo: conv.assigned_agent_id !== undefined ? conv.assigned_agent_id : (isClosing ? null : c.assignedTo),
                            assignedToName: conv.assigned_agent_name !== undefined ? conv.assigned_agent_name : (isClosing ? null : c.assignedToName),
                            assignedAt: conv.assigned_at !== undefined ? conv.assigned_at : (isClosing ? null : c.assignedAt),
                            botActive: conv.bot_active ?? c.botActive,
                            closedAt: conv.closed_at !== undefined ? conv.closed_at : c.closedAt,
                            closed_at: conv.closed_at !== undefined ? conv.closed_at : c.closed_at,
                            resolutionReason: conv.resolution_reason !== undefined ? conv.resolution_reason : c.resolutionReason,
                            closedByAgentId: conv.closed_by_agent_id !== undefined ? conv.closed_by_agent_id : c.closedByAgentId,
                            closedByAgentName: conv.closed_by_agent_name !== undefined ? conv.closed_by_agent_name : c.closedByAgentName,
                            lastMessageTimestamp: conv.closed_at ? Math.max(c.lastMessageTimestamp || 0, new Date(conv.closed_at).getTime()) : c.lastMessageTimestamp,
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
                        changed = true;
                        return updated;
                    });
                    return changed ? next : prevChats;
                });
            }
        });

        return () => {
            clearTimeout(initialLoadTimer);
            clearInterval(heartbeatInterval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (unsubscribe) unsubscribe();
        };
    }, []);


    // Manejar envío de mensaje en la consola de chat (texto, notas, archivos multimedia y citas)
    const handleSendMessage = async (chatId, text, isNote = false, mediaUrl = null, mediaType = null, fileName = null, quotedMessage = null) => {
        const targetChat = chats.find(c => c.id === chatId);
        if (!targetChat) return;

        try {
            const { newMsg, updatedChat } = await sendContactCenterMessage({
                chat: targetChat,
                text,
                isNote,
                activeAgent,
                currentUser,
                mediaUrl,
                mediaType,
                fileName,
                quotedMessage
            });

            setChats(prev => {
                const remaining = prev.filter(c => c.id !== chatId);
                return [updatedChat, ...remaining].sort((a, b) => {
                    const aKey = Math.max(Number(a.lastMessageTimestamp) || 0, Number(a.lastIncomingTimestamp) || 0);
                    const bKey = Math.max(Number(b.lastMessageTimestamp) || 0, Number(b.lastIncomingTimestamp) || 0);
                    if (bKey !== aKey) return bKey - aKey;
                    return String(b.id || '').localeCompare(String(a.id || ''));
                });
            });

            if (addToast) {
                const label = isNote 
                    ? `Nota interna registrada por ${activeAgent.name}` 
                    : mediaType === 'audio' 
                        ? `Audio enviado por ${activeAgent.name}` 
                        : mediaType === 'image' 
                            ? `Imagen enviada por ${activeAgent.name}` 
                            : mediaUrl 
                                ? `Archivo enviado por ${activeAgent.name}` 
                                : `Mensaje WhatsApp enviado por ${activeAgent.name}`;
                addToast(label, 'success');
            }
        } catch (err) {
            console.error(err);
            if (addToast) addToast(err.message || 'Error al enviar', 'error');
        }
    };

    // Alternar reacción emoji en un mensaje de la consola de chat
    const handleToggleReaction = async (message, emoji) => {
        if (!message || !activeChatId) return;
        const agentName = activeAgent?.name || 'Operador';

        // Actualización optimista inmediata en memoria para respuesta instantánea de la UI
        setChats(prev => prev.map(c => {
            if (c.id !== activeChatId) return c;
            const updatedMsgs = (c.messages || []).map(m => {
                if (m.id !== message.id) return m;
                const cur = Array.isArray(m.reactions) ? [...m.reactions] : [];
                const exists = cur.find(r => r.emoji === emoji && r.agentName === agentName);
                const next = exists
                    ? cur.filter(r => !(r.emoji === emoji && r.agentName === agentName))
                    : [...cur, { emoji, agentName, from: 'agent', at: new Date().toISOString() }];
                return { ...m, reactions: next };
            });
            return { ...c, messages: updatedMsgs };
        }));

        // Persistir en Supabase en background (no bloqueante para la fluidez operativa)
        toggleMessageReaction({
            messageId: message.id,
            realId: message.realId,
            emoji,
            agentName
        }).catch(err => console.warn('[ContactCenterPanel] Error en toggleMessageReaction:', err));
    };

    // Manejar envío de plantilla oficial de Meta WhatsApp
    const handleSendTemplate = async (chatId, template, variables) => {
        const targetChat = chats.find(c => c.id === chatId);
        if (!targetChat) return;

        try {
            const { newMsg, updatedChat } = await sendContactCenterTemplate({
                chat: targetChat,
                template,
                variables,
                activeAgent,
                currentUser
            });

            setChats(prev => {
                const remaining = prev.filter(c => c.id !== chatId);
                return [updatedChat, ...remaining].sort((a, b) => {
                    const aKey = Math.max(Number(a.lastMessageTimestamp) || 0, Number(a.lastIncomingTimestamp) || 0);
                    const bKey = Math.max(Number(b.lastMessageTimestamp) || 0, Number(b.lastIncomingTimestamp) || 0);
                    if (bKey !== aKey) return bKey - aKey;
                    return String(b.id || '').localeCompare(String(a.id || ''));
                });
            });

            if (addToast) {
                addToast(`Plantilla "${template?.name || 'Meta'}" enviada por ${activeAgent.name} ✅`, 'success');
            }
            return { success: true, newMsg };
        } catch (err) {
            console.error('Error enviando plantilla en Contact Center:', err);
            if (addToast) addToast(err.message || 'Error al enviar plantilla', 'error');
            throw err;
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

    // Asignar chat exclusivamente a una agente (bloqueo contra colisión o reasignación confirmada)
    const handleAssignChat = async (chatId, targetAgentId = activeAgent.id, options = {}) => {
        const targetChat = chats.find(c => c.id === chatId);
        if (!targetChat) return;

        try {
            const targetAgent = getAgentById(targetAgentId);
            const fromAgentName = targetChat.assignedToName || (targetChat.assignedTo ? getAgentById(targetChat.assignedTo)?.name : null);
            const isReassign = !!(fromAgentName && fromAgentName.toLowerCase() !== targetAgent.name.toLowerCase());

            // 1. Generar texto de auditoría según contexto
            let auditNote = '';
            if (isReassign) {
                auditNote = `🔄 [Reasignación de Atención]: Conversación reasignada de ${fromAgentName} a ${targetAgent.name}.${options.reassignNote ? ` Motivo: ${options.reassignNote}` : ''}`;
            } else if (targetChat.status === 'finalizados' || targetChat.status === 'archivado' || targetChat.closedAt) {
                auditNote = `🔄 [Reapertura de Atención]: Conversación reabierta y asignada a ${targetAgent.name}.`;
            } else if (targetChat.status === 'bot' || targetChat.botActive) {
                auditNote = `🤖 [Toma de Chat]: ${targetAgent.name} tomó la conversación del asistente virtual (Bot pausado).`;
            } else {
                auditNote = `👤 [Asignación de Atención]: Conversación asignada a ${targetAgent.name}.`;
            }

            // 2. Registrar nota privada de auditoría (persiste en Supabase whatsapp_messages con direction note y agrega a mensajes)
            await handleSendMessage(chatId, auditNote, true);

            // 3. Persistir asignación en base de datos y actualizar estado local
            const updated = assignChatExclusively(targetChat, targetAgent, currentUser, options);
            setChats(prev => prev.map(c => {
                if (c.id !== chatId) return c;
                return {
                    ...updated,
                    messages: c.messages // preserva los mensajes que ya tienen la nota privada agregada por handleSendMessage
                };
            }));

            if (addToast) {
                const toastMsg = options?.forceReassign || isReassign
                    ? `Conversación reasignada exitosamente a ${targetAgent.name}` 
                    : `Conversación asignada exclusivamente a ${targetAgent.name}`;
                addToast(toastMsg, 'success');
            }
        } catch (err) {
            if (addToast) addToast(err.message, 'error');
        }
    };


    // Liberar conversación a la cola general
    const handleUnassignChat = async (chatId, note = '') => {
        const targetChat = chats.find(c => c.id === chatId);
        if (!targetChat) return;

        try {
            const fromName = activeAgent?.name || currentUser?.nombre || 'Agente';
            const auditNote = `🔓 [Liberación de Atención]: ${fromName} liberó la conversación a la cola general (Sin Asignar).${note ? ` Motivo: ${note}` : ''}`;
            await handleSendMessage(chatId, auditNote, true);

            const updated = unassignChat(targetChat, activeAgent, currentUser);
            setChats(prev => prev.map(c => {
                if (c.id !== chatId) return c;
                return {
                    ...updated,
                    messages: c.messages
                };
            }));
            if (addToast) {
                addToast(`Conversación liberada a "Sin Asignar"`, 'info');
            }
        } catch (err) {
            if (addToast) addToast(err.message, 'error');
        }
    };

    // Transferir chat a otra agente
    const handleTransferChat = async (chatId, toAgentId, note = '') => {
        const targetChat = chats.find(c => c.id === chatId);
        if (!targetChat) return;

        try {
            const toAgent = getAgentById(toAgentId);
            const fromName = activeAgent?.name || currentUser?.nombre || 'Agente';
            const auditNote = `🔄 [Transferencia de Chat]: Conversación transferida de ${fromName} a ${toAgent.name}.${note ? ` Motivo: ${note}` : ''}`;
            await handleSendMessage(chatId, auditNote, true);

            const updated = transferChatToAgent(targetChat, activeAgent, toAgent, currentUser);
            setChats(prev => prev.map(c => {
                if (c.id !== chatId) return c;
                return {
                    ...updated,
                    messages: c.messages
                };
            }));
            if (addToast) {
                addToast(`Conversación transferida a ${toAgent.name}`, 'success');
            }
        } catch (err) {
            if (addToast) addToast(err.message, 'error');
        }
    };


    // Finalizar y archivar chat con motivo de resolución
    const handleCloseChat = async (chatId, resolutionReason, sendFarewell = true, preferredNextChatId = undefined) => {
        const targetChat = chats.find(c => c.id === chatId);
        if (!targetChat) return;

        try {
            const updated = await closeConversationWithResolution({
                chat: targetChat,
                resolutionReason,
                activeAgent,
                currentUser,
                silent: !sendFarewell
            });
            setChats(prev => prev.map(c => c.id === chatId ? updated : c));
            setActiveChatId(currentId => {
                if (currentId === chatId || currentId === targetChat.id) {
                    if (preferredNextChatId !== undefined) {
                        return preferredNextChatId;
                    }
                    return null;
                }
                return currentId;
            });
            if (preferredNextChatId === null) {
                try {
                    localStorage.removeItem('sa_cc_active_chat_id');
                } catch (_) {}
            }
            if (addToast) {
                addToast(
                    sendFarewell
                        ? `Atención finalizada y mensaje de despedida/encuesta enviado al paciente (${resolutionReason})`
                        : `Conversación finalizada y archivada (${resolutionReason})`,
                    'success'
                );
            }
        } catch (err) {
            if (addToast) addToast(err.message || 'Error al finalizar atención', 'error');
        }
    };

    // Finalización masiva de chats (SILENCIOSA: sin envío de ningún mensaje de WhatsApp)
    const handleBulkCloseChats = async (chatIds, resolutionReason = 'Cierre masivo de cola') => {
        if (!chatIds || !chatIds.length) return;
        const targetChats = chats.filter(c => chatIds.includes(c.id));
        if (!targetChats.length) return;

        try {
            const updatedList = await bulkCloseConversationsSilent({
                targetChats,
                resolutionReason,
                activeAgent,
                currentUser
            });

            const updatedMap = new Map(updatedList.map(u => [u.id, u]));
            setChats(prev => prev.map(c => updatedMap.get(c.id) || c));

            const closedSet = new Set(chatIds);
            setActiveChatId(currentId => {
                if (closedSet.has(currentId)) {
                    const agentId = (activeAgent?.id || '').toLowerCase();
                    const agentName = (activeAgent?.name || '').toLowerCase();
                    const nextMyChat = chats.find(c => 
                        !closedSet.has(c.id) && !isClosedOrArchived(c) && (
                            (c.assignedTo || '').toLowerCase() === agentId ||
                            (c.assignedToName || '').toLowerCase().includes(agentName)
                        )
                    );
                    return nextMyChat?.id || null;
                }
                return currentId;
            });

            if (addToast) {
                addToast(`Se finalizaron ${updatedList.length} conversaciones masivamente (sin enviar mensajes)`, 'success');
            }
            return updatedList;
        } catch (err) {
            console.error('Error en cierre masivo:', err);
            if (addToast) addToast(err.message || 'Error al finalizar conversaciones masivamente', 'error');
            throw err;
        }
    };

    // Traspaso masivo de conversaciones / Pase de guardia entre agentes o a cola general
    const handleBulkTransferChats = async (chatIds, toAgentIdOrUnassign, note = '') => {
        if (!chatIds || !chatIds.length) return;
        const targetChats = chats.filter(c => chatIds.includes(c.id));
        if (!targetChats.length) return;

        const isUnassign = toAgentIdOrUnassign === 'unassign' || !toAgentIdOrUnassign;
        const targetAgent = !isUnassign ? getAgentById(toAgentIdOrUnassign) : null;
        const now = new Date();
        const fromAgentName = activeAgent?.name || currentUser?.nombre || 'Agente';
        const targetAgentName = targetAgent ? targetAgent.name : 'Cola General (Sin Asignar)';

        const noteText = isUnassign
            ? `🔓 [Pase de Guardia - Fin de Turno]: ${fromAgentName} liberó la conversación a la cola general por cambio de turno.${note ? ` Detalle: ${note}` : ''}`
            : `🔄 [Pase de Guardia - Fin de Turno]: Conversación traspasada por fin de turno de ${fromAgentName} a ${targetAgentName}.${note ? ` Detalle: ${note}` : ''}`;

        try {
            for (const chat of targetChats) {
                // 1. Registrar nota privada interna en cada conversación
                try {
                    await handleSendMessage(chat.id, noteText, true);
                } catch (e) {
                    console.warn('[bulk-transfer] Error registrando nota interna:', e);
                }

                // 2. Persistir en Supabase
                if (chat.phone) {
                    const norm = normalizeArgentinePhone(chat.phone);
                    const updatePayload = isUnassign ? {
                        phone: norm,
                        status: 'sin_asignar',
                        assigned_agent_id: null,
                        assigned_agent_name: null,
                        assigned_at: null,
                        bot_active: false,
                        updated_at: now.toISOString()
                    } : {
                        phone: norm,
                        status: 'abierto',
                        assigned_agent_id: targetAgent.id,
                        assigned_agent_name: targetAgent.name,
                        assigned_at: now.toISOString(),
                        bot_active: false,
                        updated_at: now.toISOString()
                    };

                    await supabase.from('contact_center_conversations').upsert(updatePayload, { onConflict: 'phone' });
                }
            }

            // 3. Actualizar estado local de los chats
            setChats(prev => prev.map(c => {
                if (!chatIds.includes(c.id)) return c;
                if (isUnassign) {
                    return {
                        ...c,
                        status: 'sin_asignar',
                        assignedTo: null,
                        assignedToName: null,
                        assignedAt: null
                    };
                } else {
                    return {
                        ...c,
                        status: 'abierto',
                        assignedTo: targetAgent.id,
                        assignedToName: targetAgent.name,
                        assignedAt: now.toISOString()
                    };
                }
            }));

            if (addToast) {
                addToast(`Pase de guardia exitoso: ${targetChats.length} conversaciones traspasadas a ${targetAgentName}`, 'success');
            }
        } catch (err) {
            console.error('Error en traspaso masivo de guardia:', err);
            if (addToast) addToast('Error al traspasar conversaciones: ' + (err.message || 'Error'), 'error');
            throw err;
        }
    };

    // Asignación masiva de conversaciones seleccionadas al agente actual ("Asignármelos a todos")
    const handleBulkAssignChats = async (chatIds) => {
        if (!chatIds || !chatIds.length) return;
        const targetChats = chats.filter(c => chatIds.includes(c.id));
        if (!targetChats.length) return;

        const now = new Date();
        const targetAgent = activeAgent;
        let assignedCount = 0;

        try {
            for (const chat of targetChats) {
                // 1. Auditoría interna
                const fromAgentName = chat.assignedToName || (chat.assignedTo ? getAgentById(chat.assignedTo)?.name : null);
                const isReassign = !!(fromAgentName && fromAgentName.toLowerCase() !== targetAgent.name.toLowerCase());
                const noteText = isReassign
                    ? `🔄 [Asignación Masiva]: Reasignada de ${fromAgentName} a ${targetAgent.name}.`
                    : `👤 [Asignación Masiva]: ${targetAgent.name} se asignó esta conversación.`;

                try {
                    await handleSendMessage(chat.id, noteText, true);
                } catch (e) {
                    console.warn('[bulk-assign] Error registrando nota interna:', e);
                }

                // 2. Persistir en Supabase contact_center_conversations
                if (chat.phone) {
                    const norm = normalizeArgentinePhone(chat.phone);
                    await supabase.from('contact_center_conversations').upsert({
                        phone: norm,
                        status: 'abierto',
                        assigned_agent_id: targetAgent.id,
                        assigned_agent_name: targetAgent.name,
                        assigned_at: now.toISOString(),
                        bot_active: false,
                        closed_at: null,
                        resolution_reason: null,
                        closed_by_agent_id: null,
                        closed_by_agent_name: null,
                        updated_at: now.toISOString()
                    }, { onConflict: 'phone' });
                }
                assignedCount++;
            }

            // 3. Actualizar estado local de los chats
            setChats(prev => prev.map(c => {
                if (!chatIds.includes(c.id)) return c;
                return {
                    ...c,
                    status: 'abierto',
                    assignedTo: targetAgent.id,
                    assignedToName: targetAgent.name,
                    assignedAt: now.toISOString(),
                    botActive: false,
                    closedAt: null,
                    resolutionReason: null
                };
            }));

            if (addToast) {
                addToast(`Te asignaste exitosamente ${assignedCount} ${assignedCount === 1 ? 'conversación' : 'conversaciones'}`, 'success');
            }
        } catch (err) {
            console.error('Error en asignación masiva:', err);
            if (addToast) addToast('Error al asignarte conversaciones: ' + (err.message || 'Error'), 'error');
            throw err;
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

    const handleOpenChatWithPhone = (phone, patientData = {}) => {
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
            setPanelChatPatient({
                name: patientData.name || patientData.paciente || '',
                phone: phone,
                dni: patientData.dni || ''
            });
            setPanelChatOpen(true);
        }
    };

    // Conversación iniciada con plantilla Meta desde Turnos Online:
    // recarga la bandeja (para traer la conversación ya asignada) y la abre en la consola.
    const handleTemplateConversationStarted = async (phone) => {
        if (!phone) return;
        const cleanPhone = String(phone).replace(/\D/g, '');
        await reloadChats(true);
        setChats(current => {
            const found = current.find(c => {
                const p = (c.contactPhone || c.phone || '').replace(/\D/g, '');
                return p && (p.includes(cleanPhone) || cleanPhone.includes(p));
            });
            if (found) {
                setActiveChatId(found.id);
                try { localStorage.setItem('sa_cc_active_chat_id', String(found.id)); } catch (_) {}
            }
            return current;
        });
        setActiveSubTab('conversaciones');
    };

    return (
        <div className="content no-print" style={{ padding: activeSubTab === 'conversaciones' ? '0' : '16px 20px', background: '#F8FAFC', minHeight: 'calc(100vh - 70px)' }}>
            {/* Vistas del Módulo */}
            {activeSubTab === 'cancelaciones' && (
                <ContactCenterCancelacionesTab 
                    activeAgent={activeAgent}
                    currentUser={currentUser}
                    addToast={addToast}
                    onOpenChatWithPhone={handleOpenChatWithPhone}
                    onBackToConsole={() => handleNavigateTab('conversaciones')}
                />
            )}

            {activeSubTab === 'turnos_online' && (
                <ContactCenterTurnosOnlineTab 
                    activeAgent={activeAgent}
                    currentUser={currentUser}
                    addToast={addToast}
                    onOpenChatWithPhone={handleOpenChatWithPhone}
                    onConversationStarted={handleTemplateConversationStarted}
                    onBackToConsole={() => handleNavigateTab('conversaciones')}
                />
            )}

            {activeSubTab === 'metricas' && (
                <ContactCenterMetricsTab 
                    addToast={addToast}
                    onNavigateToIncentivos={() => handleNavigateTab('incentivos')}
                />
            )}

            {activeSubTab === 'conversaciones' && (
                <ContactCenterChatConsole 
                    chats={chats}
                    activeChatId={activeChatId}
                    activeAgent={activeAgent}
                    currentUser={currentUser}
                    onSelectChat={handleSelectChat}
                    onSendMessage={handleSendMessage}
                    onSendTemplate={handleSendTemplate}
                    onAssignChat={handleAssignChat}
                    onUnassignChat={handleUnassignChat}
                    onTransferChat={handleTransferChat}
                    onCloseChat={handleCloseChat}
                    onBulkCloseChats={handleBulkCloseChats}
                    onBulkTransferChats={handleBulkTransferChats}
                    onBulkAssignChats={handleBulkAssignChats}
                    activeSubTab={activeSubTab}
                    pendingCancelacionesCount={pendingCancelacionesCount}
                    onNavigateTab={handleNavigateTab}
                    onSwitchAgent={setActiveAgent}
                    soundEnabled={soundEnabled}
                    onToggleSound={toggleSound}
                    onReloadChats={reloadChats}
                    loadingLive={loadingLive}
                    isLMarinero={isLMarinero}
                    onToggleReaction={handleToggleReaction}
                />
            )}

            {activeSubTab === 'nueva_conversacion' && (
                <ContactCenterNuevaConversacion 
                    activeAgent={activeAgent}
                    onCreateChat={handleCreateChat}
                    onNavigateTab={handleNavigateTab}
                />
            )}

            {activeSubTab === 'configuracion' && (
                <ContactCenterConfigTab 
                    currentUser={currentUser}
                    activeAgent={activeAgent}
                    addToast={addToast}
                />
            )}

            {activeSubTab === 'incentivos' && (
                <ContactCenterIncentivosTab 
                    currentUser={currentUser}
                    activeAgent={activeAgent}
                    addToast={addToast}
                    onBackToConsole={() => handleNavigateTab('conversaciones')}
                />
            )}

            {activeSubTab === 'permisos' && isLMarinero && (
                <ContactCenterPermisosTab 
                    allowedUsers={allowedUsers}
                    onToggleUser={handleToggleUser}
                    saving={savingPermisos}
                />
            )}

            {/* Ventana Flotante de Chat estilo Cirugías / MSN Messenger */}
            <ChatWindow
                open={panelChatOpen}
                onClose={() => setPanelChatOpen(false)}
                patientName={panelChatPatient.name}
                patientPhone={panelChatPatient.phone}
                patientContext={{ dni: panelChatPatient.dni }}
                addToast={addToast}
            />
        </div>
    );
}
