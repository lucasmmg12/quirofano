import React, { useState, useEffect } from 'react';
import { 
    MessageSquare, CalendarCheck, PlusCircle, ShieldCheck, 
    Headphones, RefreshCw, Layers, CheckCircle2, Lock, Sparkles,
    User, ChevronDown, AlertTriangle, BarChart3, Volume2, VolumeX, Radio, Settings, Award
} from 'lucide-react';
import ContactCenterChatConsole from './ContactCenterChatConsole';
import ContactCenterNuevaConversacion from './ContactCenterNuevaConversacion';
import ContactCenterPermisosTab from './ContactCenterPermisosTab';
import ContactCenterTurnosOnlineTab from './ContactCenterTurnosOnlineTab';
import ContactCenterMetricsTab from './ContactCenterMetricsTab';
import ContactCenterConfigTab from './ContactCenterConfigTab';
import ContactCenterIncentivosTab from './ContactCenterIncentivosTab';
import { 
    INITIAL_CHATS, fetchAllowedUsers, updateAllowedUsers, 
    canUserAccessContactCenter, MASTER_ADMINS,
    CONTACT_CENTER_AGENTS, getAgentById, fetchLiveAndDemoChats,
    sendContactCenterMessage, assignChatExclusively, unassignChat,
    transferChatToAgent, closeConversationWithResolution,
    bulkCloseConversationsSilent,
    subscribeToContactCenterRealtime, playContactCenterChime,
    isClosedOrArchived, invalidateMessageCache, appendToMessageCache
} from '../../services/contactCenterService';
import { normalizeArgentinePhone } from '../../services/builderbotApi';
import { supabase } from '../../lib/supabase';

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
    const [activeChatId, setActiveChatId] = useState(null);
    const [allowedUsers, setAllowedUsers] = useState(['lmarinero', 'daniela', 'sofia', 'virginia', 'erica']);
    const [savingPermisos, setSavingPermisos] = useState(false);
    const [loadingLive, setLoadingLive] = useState(false);

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

    // =========================================================================
    // applyMessageEvent: Función PURA que transforma el array de chats.
    // NO debe tener side-effects (audio, network, etc.) porque React puede
    // ejecutar updaters de setChats() múltiples veces en Strict Mode.
    // El sonido se dispara en flushMessageBatch ANTES de llamar setChats.
    // =========================================================================
    function applyMessageEvent(prevChats, newMsg, eventType) {
        if (!newMsg) return prevChats;
        const normPhone = normalizeArgentinePhone(newMsg.phone);
        const isIncoming = newMsg.direction === 'incoming';

        const matchesPhone = (phoneA, phoneB) => {
            const a = normalizeArgentinePhone(phoneA);
            const b = normalizeArgentinePhone(phoneB);
            if (a === b) return true;
            return a.length >= 8 && b.length >= 8 && a.slice(-8) === b.slice(-8);
        };

        // UPDATE: actualizar order_analysis de un mensaje existente
        if (eventType === 'UPDATE') {
            const chatIdx = prevChats.findIndex(c => matchesPhone(c.phone, normPhone));
            if (chatIdx < 0) return prevChats;
            const existingChat = prevChats[chatIdx];
            const updatedMessages = (existingChat.messages || []).map(m => {
                if (m.realId === newMsg.id || m.id === 'real_' + newMsg.id) {
                    return { ...m, orderAnalysis: newMsg.raw_payload?.order_analysis || m.orderAnalysis, rawPayload: newMsg.raw_payload || m.rawPayload };
                }
                return m;
            });
            const updated = [...prevChats];
            updated[chatIdx] = { ...existingChat, messages: updatedMessages };
            return updated;
        }

        const sanitizedRaw = newMsg.raw_payload ? {
            order_analysis: newMsg.raw_payload.order_analysis,
            audio_transcription: newMsg.raw_payload.audio_transcription || newMsg.raw_payload.transcription,
            audio_understanding: newMsg.raw_payload.audio_understanding,
            agent: newMsg.raw_payload.agent,
            bot: newMsg.raw_payload.bot
        } : null;

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
            timestamp: timeStr
        };

        const chatIdx = prevChats.findIndex(c => matchesPhone(c.phone, normPhone));
        if (chatIdx >= 0) {
            const existingChat = prevChats[chatIdx];
            const alreadyHasMsg = (existingChat.messages || []).some(m =>
                m.id === formattedMsg.id || (m.realId && m.realId === formattedMsg.realId)
            );
            const nextMsgs = alreadyHasMsg ? existingChat.messages : [...(existingChat.messages || []), formattedMsg];
            const updatedMessages = nextMsgs.length > 80 ? nextMsgs.slice(-80) : nextMsgs;
            const updatedChat = {
                ...existingChat,
                messages: updatedMessages,
                lastMessage: newMsg.content || `[${newMsg.media_type}]`,
                lastMessageTimestamp: now.getTime(),
                timeAgo: 'hace instantes',
                unread: isIncoming ? true : existingChat.unread,
                lastResponder: isIncoming ? (newMsg.sender_name || 'Paciente') : (newMsg.sender_name || 'Sanatorio Argentino'),
                lastResponderRole: isIncoming ? 'patient' : 'agent',
                isWaitingResponse: isIncoming,
                waitingMinutes: 0,
                waitingTimeText: isIncoming ? 'Sin responder hace instantes' : 'Respondido',
                badgeTimeText: isIncoming ? 'hace instantes' : 'Respondido'
            };
            const otherChats = prevChats.filter((_, idx) => idx !== chatIdx);
            return [updatedChat, ...otherChats].sort((a, b) => (b.lastMessageTimestamp || 0) - (a.lastMessageTimestamp || 0));
        } else {
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
    }

    // 1. Cargar permisos y sincronizar mensajes en vivo
    const reloadChats = async (isSilent = false) => {
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
                return;
            }

            setChats(prevChats => {
                // Comparar por ID (no por índice) para detectar cambios correctamente
                // aunque el orden del array haya variado entre reloads.
                if (isSilent && Array.isArray(prevChats) && prevChats.length === loaded.length) {
                    const prevMap = new Map(prevChats.map(c => [c.id, c]));
                    const hasChange = loaded.some(newChat => {
                        const oldChat = prevMap.get(newChat.id);
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
                return loaded;
            });
            
            // Mantener el chat actualmente seleccionado por el operador, o seleccionar el primer chat activo
            setActiveChatId(currentId => {
                if (currentId && loaded.some(c => c.id === currentId)) {
                    return currentId; // Preservar siempre la selección del usuario
                }
                const firstActive = loaded.find(c => !isClosedOrArchived(c.status));
                return firstActive?.id || loaded[0]?.id || null;
            });
        } catch (err) {
            // Error transitorio: NO limpiar el estado existente. Solo loguear.
            console.warn('[contact-center] Error cargando chats (estado preservado):', err?.message || err);
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

        // Retardo inicial de 800ms para evitar colisión con otras queries
        // que se lanzan al montar la app (altas_administrativas, auth, etc.).
        // Esto evita saturar el pool de conexiones de Supabase al inicio.
        const initialLoadTimer = setTimeout(() => {
            reloadChats().then(() => {
                // Red de seguridad: si el primer load trajo 0 chats,
                // reintentamos una vez a los 3 segundos (timeout transitorio).
                setChats(currentChats => {
                    if (currentChats.length === 0) {
                        setTimeout(() => reloadChats(), 3000);
                    }
                    return currentChats;
                });
            });
        }, 800);

        // FASE 2: Heartbeat adaptativo — solo hace polling si el WebSocket
        // lleva más de 2 minutos sin eventos (canal inactivo/caido).
        // En condiciones normales el WebSocket mantiene la BD sincronizada
        // y el polling es innecesario. Esto reduce un 90% las queries de heartbeat.
        const STALE_WS_THRESHOLD = 120_000; // 2 minutos sin eventos WebSocket
        let lastFetchTime = Date.now();
        const lastLivePingRef = React.useRef(new Date());

        const heartbeatInterval = setInterval(() => {
            if (document.hidden) return;
            const msSinceLastWSEvent = Date.now() - lastLivePingRef.current.getTime();
            if (msSinceLastWSEvent > STALE_WS_THRESHOLD) {
                console.log(`[contact-center] WebSocket inactivo ${Math.round(msSinceLastWSEvent/1000)}s — activando polling de recuperación`);
                reloadChats(true);
                lastFetchTime = Date.now();
            }
        }, 30_000); // Revisar cada 30s si el WS está activo

        const handleVisibilityChange = () => {
            if (!document.hidden && Date.now() - lastFetchTime > 120_000) {
                reloadChats(true);
                lastFetchTime = Date.now();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // FASE 4: Batch de eventos WebSocket con debounce de 80ms
        // En lugar de llamar setChats() para cada mensaje individual que llega
        // por RealTime (lo que causa renders en cascada bajo alta carga),
        // acumulamos los eventos en una cola y los procesamos juntos cada 80ms.
        let pendingMsgUpdates = [];
        let pendingConvUpdates = [];
        let batchMsgTimer = null;
        let batchConvTimer = null;

        function flushMessageBatch() {
            if (pendingMsgUpdates.length === 0) return;
            const batch = pendingMsgUpdates.splice(0);

            // IMPORTANTE: disparar sonido AQUI, antes del setChats updater.
            // applyMessageEvent es función pura — NO puede tener side-effects
            // porque React puede ejecutar updaters múltiples veces (Strict Mode / Concurrent).
            for (const { newMsg, eventType } of batch) {
                if (eventType !== 'UPDATE' && newMsg?.direction === 'incoming') {
                    const isUrgent = /\b(guardia|urgencia|emergencia|dolor|grave|hemorragia|urgente)\b/i
                        .test(newMsg.content || '');
                    if (soundEnabledRef.current) playContactCenterChime(isUrgent ? 'urgent' : 'normal');
                }
            }

            setChats(prevChats => {
                let updated = [...prevChats];
                for (const { newMsg, eventType } of batch) {
                    updated = applyMessageEvent(updated, newMsg, eventType);
                }
                return updated;
            });
        }

        function flushConvBatch() {
            if (pendingConvUpdates.length === 0) return;
            const batch = pendingConvUpdates.splice(0);
            setChats(prevChats => prevChats.map(c => {
                const conv = batch.find(b => normalizeArgentinePhone(b.phone) === normalizeArgentinePhone(c.phone));
                if (!conv) return c;
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
            }));
        }

        // 2. Suscripción OnLive en Tiempo Real (Exclusivo Línea Contact Center y Conversaciones)
        const unsubscribe = subscribeToContactCenterRealtime({
            onNewMessage: (newMsg, eventType) => {
                if (!newMsg) return;
                lastLivePingRef.current = new Date();
                setLastLivePing(new Date());

                // Invalidar caché de mensajes para este teléfono al recibir un nuevo mensaje
                // (para que el próximo fetchOlderMessagesForPhone traiga datos frescos)
                if (newMsg.phone) invalidateMessageCache(newMsg.phone);

                // FASE 4: encolar evento y procesar en batch cada 80ms
                pendingMsgUpdates.push({ newMsg, eventType });
                clearTimeout(batchMsgTimer);
                batchMsgTimer = setTimeout(flushMessageBatch, 80);
            },
            onConversationChange: (conv) => {
                console.log('[contact-center] ⚡ Evento Realtime Conversación cambiada:', conv);
                lastLivePingRef.current = new Date();
                setLastLivePing(new Date());

                // FASE 4: encolar y procesar en batch
                pendingConvUpdates.push(conv);
                clearTimeout(batchConvTimer);
                batchConvTimer = setTimeout(flushConvBatch, 80);
            }
        });
        return () => {
            clearTimeout(initialLoadTimer);
            clearInterval(heartbeatInterval);
            clearTimeout(batchMsgTimer);
            clearTimeout(batchConvTimer);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (unsubscribe) unsubscribe();
        };
    }, []);




    // Manejar envío de mensaje en la consola de chat (texto, notas y archivos multimedia)
    const handleSendMessage = async (chatId, text, isNote = false, mediaUrl = null, mediaType = null, fileName = null) => {
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
                fileName
            });

            setChats(prev => prev.map(c => c.id === chatId ? updatedChat : c));

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
        <div className="content no-print" style={{ padding: activeSubTab === 'conversaciones' ? '6px 10px 0 10px' : '16px 20px', background: '#F8FAFC', minHeight: 'calc(100vh - 70px)' }}>
            {/* Si NO estamos en conversaciones (ej: mi_semana, turnos_online, metricas), mostramos una barra compacta con las pestañas de navegación del módulo (sin el banner superior de Image 3) */}
            {activeSubTab !== 'conversaciones' && (
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px',
                    marginBottom: '12px',
                    padding: '8px 12px',
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}>
                    {/* Pestañas de Navegación del Módulo */}
                    <div style={{
                        display: 'flex',
                        background: '#F1F5F9',
                        borderRadius: '8px',
                        padding: '3px',
                        gap: '2px',
                        overflowX: 'auto'
                    }}>
                        <button
                            onClick={() => handleNavigateTab('conversaciones')}
                            style={{
                                padding: '6px 12px', borderRadius: '6px', border: 'none',
                                fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '5px',
                                background: activeSubTab === 'conversaciones' ? '#0F2942' : 'transparent',
                                color: activeSubTab === 'conversaciones' ? '#FFFFFF' : '#64748B',
                                transition: 'all 0.15s'
                            }}
                        >
                            <MessageSquare size={14} />
                            Conversaciones
                            <span style={{
                                background: activeSubTab === 'conversaciones' ? '#0284C7' : '#EFF6FF',
                                color: activeSubTab === 'conversaciones' ? '#FFFFFF' : '#1E40AF',
                                fontSize: '0.65rem', padding: '1px 5px', borderRadius: '8px', fontWeight: 800
                            }}>
                                {chats.filter(c => !c.assignedTo).length}
                            </span>
                        </button>

                        <button
                            onClick={() => handleNavigateTab('nueva_conversacion')}
                            style={{
                                padding: '6px 12px', borderRadius: '6px', border: 'none',
                                fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '5px',
                                background: activeSubTab === 'nueva_conversacion' ? '#0F2942' : 'transparent',
                                color: activeSubTab === 'nueva_conversacion' ? '#FFFFFF' : '#64748B',
                                transition: 'all 0.15s'
                            }}
                        >
                            <PlusCircle size={14} />
                            Crear Conversación
                        </button>

                        <button
                            onClick={() => handleNavigateTab('turnos_online')}
                            style={{
                                padding: '6px 12px', borderRadius: '6px', border: 'none',
                                fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '5px',
                                background: activeSubTab === 'turnos_online' ? '#0F2942' : 'transparent',
                                color: activeSubTab === 'turnos_online' ? '#FFFFFF' : '#DC2626',
                                transition: 'all 0.15s'
                            }}
                        >
                            <AlertTriangle size={14} />
                            Turnos Online
                            <span style={{
                                background: activeSubTab === 'turnos_online' ? '#DC2626' : '#FEE2E2',
                                color: activeSubTab === 'turnos_online' ? '#FFFFFF' : '#DC2626',
                                fontSize: '0.65rem', padding: '1px 5px', borderRadius: '8px', fontWeight: 800
                            }}>
                                Alertas
                            </span>
                        </button>

                        <button
                            onClick={() => handleNavigateTab('metricas')}
                            style={{
                                padding: '6px 12px', borderRadius: '6px', border: 'none',
                                fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '5px',
                                background: activeSubTab === 'metricas' ? '#0F2942' : 'transparent',
                                color: activeSubTab === 'metricas' ? '#FFFFFF' : '#0284C7',
                                transition: 'all 0.15s'
                            }}
                        >
                            <BarChart3 size={14} />
                            Métricas y Costos
                        </button>

                        <button
                            onClick={() => handleNavigateTab('incentivos')}
                            style={{
                                padding: '6px 12px', borderRadius: '6px', border: 'none',
                                fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '5px',
                                background: activeSubTab === 'incentivos' ? '#0F2942' : 'transparent',
                                color: activeSubTab === 'incentivos' ? '#FFFFFF' : '#0D9488',
                                transition: 'all 0.15s'
                            }}
                        >
                            <Award size={14} />
                            Incentivos Contact Center
                            <span style={{
                                background: activeSubTab === 'incentivos' ? '#0D9488' : '#CCFBF1',
                                color: activeSubTab === 'incentivos' ? '#FFFFFF' : '#0F766E',
                                fontSize: '0.65rem', padding: '1px 5px', borderRadius: '8px', fontWeight: 800
                            }}>
                                10 Esc.
                            </span>
                        </button>

                        <button
                            onClick={() => handleNavigateTab('configuracion')}
                            style={{
                                padding: '6px 12px', borderRadius: '6px', border: 'none',
                                fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '5px',
                                background: activeSubTab === 'configuracion' ? '#0F2942' : 'transparent',
                                color: activeSubTab === 'configuracion' ? '#FFFFFF' : '#64748B',
                                transition: 'all 0.15s'
                            }}
                        >
                            <Settings size={14} />
                            Configuración
                        </button>

                        {isLMarinero && (
                            <button
                                onClick={() => handleNavigateTab('permisos')}
                                style={{
                                    padding: '6px 12px', borderRadius: '6px', border: 'none',
                                    fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '5px',
                                    background: activeSubTab === 'permisos' ? '#1E40AF' : 'transparent',
                                    color: activeSubTab === 'permisos' ? '#FFFFFF' : '#1E40AF',
                                    transition: 'all 0.15s'
                                }}
                            >
                                <ShieldCheck size={14} />
                                Permisos
                            </button>
                        )}
                    </div>

                    {/* IDENTIFICACIÓN DEL OPERADOR CONECTADO */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px',
                            padding: '4px 10px'
                        }}>
                            <div style={{
                                width: '18px', height: '18px', borderRadius: '50%',
                                background: activeAgent.color || '#0284C7',
                                color: '#FFFFFF',
                                fontSize: '0.62rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                {activeAgent.avatar || 'OP'}
                            </div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1E293B' }}>
                                {activeAgent.fullName || activeAgent.name}
                            </span>
                            <span style={{
                                fontSize: '0.62rem', color: '#64748B', background: '#E2E8F0',
                                padding: '1px 6px', borderRadius: '4px', fontWeight: 600
                            }}>
                                {activeAgent.role}
                            </span>
                        </div>

                        {/* Sonido y Sync */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <button
                                onClick={toggleSound}
                                title={soundEnabled ? 'Silenciar avisos sonoros' : 'Activar sonido de nuevos mensajes'}
                                style={{
                                    padding: '3px 6px', borderRadius: '6px', border: '1px solid #CBD5E1',
                                    background: soundEnabled ? '#F0FDF4' : '#FFFFFF',
                                    color: soundEnabled ? '#16A34A' : '#94A3B8',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                                    fontSize: '0.68rem', fontWeight: 700
                                }}
                            >
                                {soundEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
                            </button>
                            <button
                                onClick={reloadChats}
                                disabled={loadingLive}
                                title="Forzar sincronización inmediata"
                                style={{
                                    padding: '3px 6px', borderRadius: '6px', border: '1px solid #CBD5E1',
                                    background: '#FFFFFF', color: '#0284C7', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center',
                                    fontSize: '0.68rem', fontWeight: 700
                                }}
                            >
                                <RefreshCw size={11} className={loadingLive ? 'spin' : ''} />
                            </button>
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
                    onBackToConsole={() => handleNavigateTab('conversaciones')}
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
                    onBulkCloseChats={handleBulkCloseChats}
                    onBulkTransferChats={handleBulkTransferChats}
                    onBulkAssignChats={handleBulkAssignChats}
                    activeSubTab={activeSubTab}

                    onNavigateTab={handleNavigateTab}
                    onSwitchAgent={setActiveAgent}
                    soundEnabled={soundEnabled}
                    onToggleSound={toggleSound}
                    onReloadChats={reloadChats}
                    loadingLive={loadingLive}
                    isLMarinero={isLMarinero}
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
        </div>
    );
}
