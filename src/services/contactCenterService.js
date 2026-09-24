/**
 * contactCenterService.js
 * Servicio de gestión de datos, conversaciones y control de acceso para Contact Center (AsisteClick)
 * Sanatorio Argentino.
 * 
 * Soporta:
 * - 4 Agentes oficiales: Daniela, Sofia, Virginia, Erica (y lmarinero como supervisora)
 * - Bloqueo de asignación exclusiva: Mientras una agente la tenga asignada, nadie más se la puede asociar.
 * - Trazabilidad total: Registra en cada mensaje qué persona respondió y el último en responder.
 * - Conexión híbrida en tiempo real con Supabase whatsapp_messages y BuilderBot.
 */
import { supabase } from '../lib/supabase';
import { getConfigValue, updateConfig } from './configService';
import { sendWhatsAppMessage, normalizeArgentinePhone } from './builderbotApi';
import { getSalusSyncBaseUrl } from './salusSync';

const STORAGE_ALLOWED_USERS_KEY = 'sa_contact_center_allowed_users';
const CONFIG_KEY = 'contact_center_allowed_users';

// Administradores con acceso maestro permanente
export const MASTER_ADMINS = ['lmarinero', 'admin', 'mrodriguez', 'dsantaella', 'jcorrea'];

// 4 Agentes canónicas del Contact Center de Sanatorio Argentino + Supervisor Lucas Marinero
export const CONTACT_CENTER_AGENTS = [
    { id: 'daguilera', username: 'daguilera', legacyId: 'daniela', name: 'Daniela Aguilera', fullName: 'Daniela Aguilera', role: 'Atención al Paciente', color: '#E11D48', avatar: 'DA' },
    { id: 'solivier', username: 'solivier', legacyId: 'sofia', name: 'Sofia Olivieri', fullName: 'Sofia Olivieri', role: 'Atención al Paciente', color: '#8B5CF6', avatar: 'SO' },
    { id: 'vjacques', username: 'vjacques', legacyId: 'virginia', name: 'Virginia Jacques', fullName: 'Virginia Jacques', role: 'Atención al Paciente', color: '#059669', avatar: 'VJ' },
    { id: 'eleal', username: 'eleal', legacyId: 'erica', name: 'Erica Leal', fullName: 'Erica Leal', role: 'Atención al Paciente', color: '#D97706', avatar: 'EL' },
    { id: 'lmarinero', username: 'lmarinero', legacyId: 'lucas', name: 'Lucas Marinero', fullName: 'Lucas Marinero', role: 'Supervisor Contact Center', color: '#0284C7', avatar: 'LM' },
];

export const CONTACT_CENTER_AUTHORIZED_USERNAMES = [
    'lmarinero', 'admin', 'mrodriguez', 'dsantaella', 'jcorrea',
    'daguilera', 'daniela',
    'solivier', 'sofia',
    'vjacques', 'virginia',
    'eleal', 'erica'
];

/**
 * Valida si el usuario actual es una de las 4 agentes o Lucas Marinero para autorizar envíos de mensajes
 */
export function isUserAuthorizedForContactCenter(user) {
    if (!user) return true; // Fallback permisivo si no hay sesión estricta
    const username = (user.usuario || user.username || user.email || user.id || '').toLowerCase().trim().split('@')[0];
    const nombre = (user.nombre || user.fullName || '').toLowerCase().trim();

    // 1. Lucas Marinero (Supervisor)
    if (
        username.includes('lucas') || 
        username.includes('marinero') || 
        username === 'lmarinero' || 
        username === 'admin' || 
        nombre.includes('lucas') || 
        nombre.includes('marinero')
    ) {
        return true;
    }

    // 2. Daniela Aguilera
    if (username.includes('daniela') || username.includes('aguilera') || username === 'daguilera' || nombre.includes('daniela')) {
        return true;
    }

    // 3. Sofia Olivieri
    if (username.includes('sofia') || username.includes('olivieri') || username.includes('solivier') || username.includes('olivier') || nombre.includes('sofia')) {
        return true;
    }

    // 4. Virginia Jacques
    if (username.includes('virginia') || username.includes('jacques') || username === 'vjacques' || nombre.includes('virginia')) {
        return true;
    }

    // 5. Erica Leal
    if (username.includes('erica') || username.includes('leal') || username === 'eleal' || nombre.includes('erica')) {
        return true;
    }

    return false;
}

/**
 * Obtiene el objeto de agente a partir de un identificador, username o nombre
 */
export function getAgentById(agentIdOrName) {
    if (!agentIdOrName) return null;
    const clean = String(agentIdOrName).toLowerCase().trim();
    return CONTACT_CENTER_AGENTS.find(a => 
        a.id === clean || 
        a.username === clean || 
        a.legacyId === clean || 
        a.name.toLowerCase() === clean
    ) || {
        id: clean,
        name: agentIdOrName,
        fullName: agentIdOrName,
        role: 'Operador Sanatorio',
        color: '#0284C7',
        avatar: (agentIdOrName[0] || 'A').toUpperCase()
    };
}

/**
 * Determina si el estado de un chat es cerrado, archivado o finalizado (sinónimos)
 */
export function isClosedOrArchived(statusOrChat) {
    if (!statusOrChat) return false;
    const s = typeof statusOrChat === 'object' ? (statusOrChat.status || '') : String(statusOrChat);
    const clean = s.toLowerCase().trim();
    return clean === 'archivado' || clean === 'cerrado' || clean === 'finalizado' || clean === 'resuelto';
}

/**
 * Determina si un usuario tiene autorización para acceder al Contact Center.
 */
export function canUserAccessContactCenter(user, allowedUsersList = null) {
    if (!user) return false;
    const username = (user.usuario || user.email || '').toLowerCase().trim().split('@')[0];
    
    // Master admin siempre tiene acceso
    if (MASTER_ADMINS.includes(username)) {
        return true;
    }

    // Si es una de las 4 agentes autorizadas del Contact Center
    if (['daguilera', 'vjacques', 'solivier', 'eleal', 'daniela', 'sofia', 'virginia', 'erica'].includes(username)) {
        return true;
    }

    // Si se pasa la lista en memoria
    if (Array.isArray(allowedUsersList)) {
        return allowedUsersList.map(u => u.toLowerCase().trim()).includes(username);
    }

    // Consultar caché local
    try {
        const cached = localStorage.getItem(STORAGE_ALLOWED_USERS_KEY);
        if (cached) {
            const list = JSON.parse(cached);
            if (Array.isArray(list) && list.map(u => u.toLowerCase().trim()).includes(username)) {
                return true;
            }
        }
    } catch {
        // ignore
    }

    return false;
}

/**
 * Determina si el usuario logueado es una de las 4 agentes exclusivas del Contact Center
 * (Sofia, Daniela, Erica, Virginia).
 * Estas agentes tienen la vista restringida exclusivamente a:
 * 1. Módulo Contact Center (Consola y Chats, Nueva Conversación, Turnos, Métricas)
 * 2. Módulo Simon IA ENTERO (Chat, Documentos, Gestión de Reglas, Simon Analytics)
 * Ningún otro módulo de la clínica debe estar disponible ni cargarse en memoria para ellas.
 */
export function isContactCenterExclusiveAgent(user) {
    if (!user) return false;
    const username = (user.usuario || user.email || '').toLowerCase().trim().split('@')[0];
    const nombre = (user.nombre || '').toLowerCase().trim();

    // Master admins and supervisors are NEVER restricted
    if (MASTER_ADMINS.includes(username) || username.includes('marinero') || username === 'admin' || username === 'lmarinero') {
        return false;
    }

    const ccUsernames = ['daguilera', 'vjacques', 'solivier', 'eleal', 'daniela', 'sofia', 'virginia', 'erica'];
    if (ccUsernames.includes(username)) return true;

    // Coincidencias por nombre y alias de agente
    if (
        nombre.includes('sofia') || username.includes('sofia') || username.includes('olivier') ||
        nombre.includes('daniela') || username.includes('daniela') || username.includes('aguilera') ||
        nombre.includes('virginia') || username.includes('virginia') || username.includes('jacques') ||
        nombre.includes('erica') || username.includes('erica') || username.includes('leal')
    ) {
        return true;
    }

    return false;
}

/**
 * Obtiene la lista de usuarios autorizados desde Supabase app_config
 */
export async function fetchAllowedUsers() {
    try {
        const value = await getConfigValue(CONFIG_KEY);
        if (value && Array.isArray(value)) {
            localStorage.setItem(STORAGE_ALLOWED_USERS_KEY, JSON.stringify(value));
            return value;
        }
    } catch (err) {
        console.warn('Error al leer allowed users desde app_config:', err);
    }

    try {
        const cached = localStorage.getItem(STORAGE_ALLOWED_USERS_KEY);
        if (cached) {
            return JSON.parse(cached);
        }
    } catch {
        // ignore
    }

    return ['lmarinero', 'daniela', 'sofia', 'virginia', 'erica'];
}

/**
 * Actualiza la lista de usuarios autorizados
 */
export async function updateAllowedUsers(usersList, updatedBy = 'lmarinero') {
    const cleanList = Array.from(new Set([
        'lmarinero', 'daniela', 'sofia', 'virginia', 'erica',
        ...usersList.map(u => u.toLowerCase().trim())
    ]));
    
    localStorage.setItem(STORAGE_ALLOWED_USERS_KEY, JSON.stringify(cleanList));

    try {
        await updateConfig(CONFIG_KEY, cleanList);
    } catch (err) {
        console.warn('No se pudo persistir en app_config (se guardó en local):', err);
    }

    return cleanList;
}

// =========================================================================
// MOCK DATA BASE DE ALTA FIDELIDAD CON ASIGNACIÓN Y AUDITORÍA
// =========================================================================

export const INITIAL_CHATS = [];

export const SYSTEM_KNOWN_USERS = [
    { usuario: 'lmarinero', nombre: 'Lucas Marinero', rol: 'Supervisor General / Sistemas', avatar: 'LM' },
    { usuario: 'admin', nombre: 'Administrador', rol: 'Administrador General', avatar: 'AD' },
    { usuario: 'mrodriguez', nombre: 'M. Rodriguez', rol: 'Administrador General', avatar: 'MR' },
    { usuario: 'dsantaella', nombre: 'D. Santaella', rol: 'Administrador General', avatar: 'DS' },
    { usuario: 'daniela', nombre: 'Daniela Aguilera', rol: 'Atención al Paciente / Contact Center', avatar: 'DA' },
    { usuario: 'sofia', nombre: 'Sofia Olivieri', rol: 'Atención al Paciente / Contact Center', avatar: 'SO' },
    { usuario: 'virginia', nombre: 'Virginia Jacques', rol: 'Atención al Paciente / Contact Center', avatar: 'VJ' },
    { usuario: 'erica', nombre: 'Erica Leal', rol: 'Atención al Paciente / Contact Center', avatar: 'EL' },
    { usuario: 'jcorrea', nombre: 'Javier Correa', rol: 'Jefatura de Facturación y Altas', avatar: 'JC' },
    { usuario: 'frojo', nombre: 'Florencia Rojo', rol: 'Auditoría Médica y Gobernanza', avatar: 'FR' },
    { usuario: 'marcela', nombre: 'Marcela Quiroga', rol: 'Emisión y Despacho de Pedidos', avatar: 'MQ' }
];

// =========================================================================
// LÓGICA DE ASIGNACIÓN EXCLUSIVA Y CONTROL DE BLOQUEOS (LOCKS)
// =========================================================================

/**
 * Verifica si un chat está bloqueado para el usuario actual.
 * Retorna true si está asignado a otra persona y el usuario actual NO es supervisor (lmarinero).
 */
export function isChatLockedForUser(chat, currentAgentId, currentUser) {
    if (!chat || !chat.assignedTo) return false;
    const username = (currentUser?.usuario || '').toLowerCase().trim();
    if (MASTER_ADMINS.includes(username)) return false; // Supervisor nunca se bloquea
    
    const assigned = chat.assignedTo.toLowerCase();
    const current = (currentAgentId || username).toLowerCase();

    const agentAssigned = getAgentById(assigned);
    const agentCurrent = getAgentById(current);
    if (agentAssigned && agentCurrent && agentAssigned.id === agentCurrent.id) {
        return false;
    }

    return assigned !== current;
}

/**
 * Asigna una conversación a una agente.
 * Si ya está asignada a otra persona, arroja un error para evitar colisiones.
 */
export function assignChatExclusively(chat, targetAgent, currentUser) {
    const isSupervisor = MASTER_ADMINS.includes((currentUser?.usuario || '').toLowerCase().trim());
    
    // Si ya está asignado a otra persona y no es supervisor
    const currentAssigned = chat.assignedTo ? chat.assignedTo.toLowerCase() : null;
    const currentOwner = currentAssigned ? getAgentById(currentAssigned) : null;
    const isSameAgent = currentOwner && currentOwner.id === targetAgent.id;

    if (currentAssigned && !isSameAgent && !isSupervisor) {
        const ownerName = currentOwner?.name || chat.assignedTo;
        throw new Error(`Esta conversación ya está asignada a ${ownerName}. Mientras la tenga asignada, nadie más puede asociársela.`);
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    // Persistir en Supabase contact_center_conversations y APAGAR BOT
    if (chat.phone) {
        const norm = normalizeArgentinePhone(chat.phone);
        supabase.from('contact_center_conversations').upsert({
            phone: norm,
            status: 'abierto',
            assigned_agent_id: targetAgent.id,
            assigned_agent_name: targetAgent.name,
            assigned_at: now.toISOString(),
            bot_active: false, // BOT MUTEADO INMEDIATAMENTE
            closed_at: null, // LIMPIAR CIERRE PREVIO SI EXISTÍA
            resolution_reason: null,
            closed_by_agent_id: null,
            closed_by_agent_name: null,
            updated_at: now.toISOString()
        }, { onConflict: 'phone' }).then(({ error }) => {
            if (error) console.warn('[contact-center] Error guardando asignación:', error.message);
        });
    }

    const updatedChat = {
        ...chat,
        status: 'abierto',
        assignedTo: targetAgent.id,
        assignedToName: targetAgent.name,
        assignedAt: now.toISOString(),
        botActive: false,
        closedAt: null,
        resolutionReason: null,
        closedByAgentId: null,
        closedByAgentName: null,
        messages: [
            ...(chat.messages || []),
            {
                id: 'sys_' + Date.now(),
                sender: 'system',
                text: `${targetAgent.name} se asignó la conversación. El chatbot se ha pausado.`,
                timestamp: timeStr
            }
        ]
    };

    return updatedChat;
}

/**
 * Libera una conversación (vuelve a "sin_asignar").
 * Solo permitido para la agente asignada o la supervisora.
 */
export function unassignChat(chat, currentAgent, currentUser) {
    const isSupervisor = MASTER_ADMINS.includes((currentUser?.usuario || '').toLowerCase().trim());
    
    if (chat.assignedTo && chat.assignedTo.toLowerCase() !== currentAgent.id.toLowerCase() && !isSupervisor) {
        throw new Error('Solo la agente asignada o la supervisora pueden liberar este chat.');
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    // Persistir liberación en Supabase
    if (chat.phone) {
        const norm = normalizeArgentinePhone(chat.phone);
        supabase.from('contact_center_conversations').upsert({
            phone: norm,
            status: 'sin_asignar',
            assigned_agent_id: null,
            assigned_agent_name: null,
            assigned_at: null,
            updated_at: now.toISOString()
        }, { onConflict: 'phone' }).then(({ error }) => {
            if (error) console.warn('[contact-center] Error liberando chat:', error.message);
        });
    }

    const updatedChat = {
        ...chat,
        status: 'sin_asignar',
        assignedTo: null,
        assignedToName: null,
        assignedAt: null,
        messages: [
            ...(chat.messages || []),
            {
                id: 'sys_' + Date.now(),
                sender: 'system',
                text: `${currentAgent.name} liberó la conversación a la cola general`,
                timestamp: timeStr
            }
        ]
    };

    return updatedChat;
}

/**
 * Transfiere una conversación directamente a otra agente.
 */
export function transferChatToAgent(chat, fromAgent, toAgent, currentUser) {
    const isSupervisor = MASTER_ADMINS.includes((currentUser?.usuario || '').toLowerCase().trim());
    
    if (chat.assignedTo && chat.assignedTo.toLowerCase() !== fromAgent.id.toLowerCase() && !isSupervisor) {
        throw new Error('Solo la agente asignada o la supervisora pueden transferir este chat.');
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    if (chat.phone) {
        const norm = normalizeArgentinePhone(chat.phone);
        supabase.from('contact_center_conversations').upsert({
            phone: norm,
            status: 'abierto',
            assigned_agent_id: toAgent.id,
            assigned_agent_name: toAgent.name,
            assigned_at: now.toISOString(),
            bot_active: false,
            updated_at: now.toISOString()
        }, { onConflict: 'phone' }).then(({ error }) => {
            if (error) console.warn('[contact-center] Error transfiriendo chat:', error.message);
        });
    }

    const updatedChat = {
        ...chat,
        status: 'abierto',
        assignedTo: toAgent.id,
        assignedToName: toAgent.name,
        assignedAt: now.toISOString(),
        botActive: false,
        messages: [
            ...(chat.messages || []),
            {
                id: 'sys_' + Date.now(),
                sender: 'system',
                text: `${fromAgent.name} transfirió la conversación a ${toAgent.name}`,
                timestamp: timeStr
            }
        ]
    };

    return updatedChat;
}

// =========================================================================
// CONEXIÓN EN TIEMPO REAL CON SUPABASE WHATSAPP_MESSAGES
// =========================================================================

/**
 * Consulta los mensajes reales de la base de datos y los unifica con los chats de demo.
 * Si el usuario envía un mensaje desde su número alternativo de prueba, se crea
 * dinámicamente un chat real en la bandeja "sin_asignar".
 */
export async function fetchLiveAndDemoChats() {
    try {
        // 1. Traer conversaciones estructuradas de contact_center_conversations
        // Optimización Alto Tráfico (190k msgs/mes): Traemos las 250 conversaciones más activas y recientes
        // ordenadas por updated_at desc para no sobrecargar el heap ni la red en PCs de baja RAM
        const { data: convData, error: convError } = await supabase
            .from('contact_center_conversations')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(250);

        const convByPhone = {};
        if (convData && !convError) {
            convData.forEach(c => {
                if (c.phone) convByPhone[normalizeArgentinePhone(c.phone)] = c;
            });
        }

        // 2. Traer mensajes EXCLUSIVOS de la línea de Contact Center
        // Para cuidar RAM y evitar congelamientos: limitamos a 600 mensajes y proyectamos solo columnas requeridas
        const { data: rawMessages, error } = await supabase
            .from('whatsapp_messages')
            .select('id, phone, content, direction, sender_name, media_url, media_type, created_at, line_id, raw_payload')
            .eq('line_id', 'contact_center')
            .order('created_at', { ascending: false })
            .limit(600);

        if (error) {
            console.warn('[contact-center] Error consultando mensajes:', error);
        }

        // Filtro estricto: solo mensajes de Contact Center (sin newsletters ni otras líneas)
        const realMessages = (rawMessages || []).filter(msg => {
            const rawJid = String(msg.raw_payload?.data?.key?.remoteJid || msg.raw_payload?.data?.from || '');
            if (
                rawJid.includes('newsletter') || 
                rawJid.includes('@g.us') || 
                rawJid.includes('@broadcast') ||
                (msg.phone && (msg.phone.startsWith('5491203') || msg.phone.startsWith('1203')))
            ) {
                return false;
            }
            if (['line_recepciones', 'line_b', 'line_a', 'line_c', 'line_meta'].includes(msg.line_id)) {
                return false;
            }
            return true;
        });

        // Agrupar mensajes reales por teléfono
        const realChatsMap = {};
        realMessages.forEach(msg => {
            if (!msg.phone) return;
            const normPhone = normalizeArgentinePhone(msg.phone);
            if (!realChatsMap[normPhone]) {
                realChatsMap[normPhone] = [];
            }
            realChatsMap[normPhone].push(msg);
        });

        function formatRelativeTime(dateStr) {
            if (!dateStr) return 'Reciente';
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return 'Reciente';
            const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
            if (diffMin < 1) return 'hace instantes';
            if (diffMin < 60) return `hace ${diffMin} min`;
            const diffHours = Math.round(diffMin / 60);
            if (diffHours < 24) return `hace ${diffHours} h`;
            return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
        }

        function isHumanAgentMessage(m) {
            if (!m) return false;
            if (m.direction === 'incoming' || m.sender === 'patient') return false;
            if (m.direction === 'note' || m.isNote) return false;
            const sender = String(m.sender_name || m.senderName || '').toLowerCase().trim();
            if (sender === 'bot sanatorio' || sender === 'bot' || sender.startsWith('bot ')) return false;
            if (m.raw_payload?.bot === true || m.rawPayload?.bot === true || m.raw_payload?.is_bot === true) return false;
            if (m.sender === 'system' || m.sender === 'bot') return false;
            return m.direction === 'outgoing' || m.sender === 'agent';
        }

        function calculateWaitingTime(messages, conv, lastDateMs) {
            if (isClosedOrArchived(conv?.status)) {
                return { isWaitingResponse: false, waitingMinutes: 0, waitingTimeText: 'Finalizado', badgeTimeText: 'Finalizado' };
            }
            if (!messages || messages.length === 0) {
                return { isWaitingResponse: false, waitingMinutes: 0, waitingTimeText: 'Sin mensajes', badgeTimeText: 'Sin mensajes' };
            }

            // messages[0] es el más reciente (orden DESC de created_at)
            const latestMsg = messages[0];
            if (isHumanAgentMessage(latestMsg)) {
                return {
                    isWaitingResponse: false,
                    waitingMinutes: 0,
                    waitingTimeText: 'Respondido',
                    badgeTimeText: 'Respondido',
                    lastHumanResponseAt: latestMsg.created_at
                };
            }

            // Encontrar el último mensaje respondido por un agente humano
            const lastHumanIdx = messages.findIndex(m => isHumanAgentMessage(m));
            const unansweredMessages = lastHumanIdx === -1 ? messages : messages.slice(0, lastHumanIdx);

            // Determinar cuándo comenzó la espera (primer mensaje del paciente en este bloque)
            const patientMsg = [...unansweredMessages].reverse().find(m => m.direction === 'incoming') || unansweredMessages[unansweredMessages.length - 1];
            const waitingSinceMs = patientMsg?.created_at ? new Date(patientMsg.created_at).getTime() : lastDateMs;

            const diffMs = Math.max(0, Date.now() - waitingSinceMs);
            const diffMinutes = Math.floor(diffMs / 60000);

            let waitingTimeText = '';
            if (diffMinutes < 1) {
                waitingTimeText = 'hace instantes';
            } else if (diffMinutes < 60) {
                waitingTimeText = `hace ${diffMinutes} min`;
            } else if (diffMinutes < 1440) {
                const hours = Math.floor(diffMinutes / 60);
                const mins = diffMinutes % 60;
                waitingTimeText = hours < 3 && mins > 0 
                    ? `hace ${hours} h ${mins} min` 
                    : `hace ${hours} h`;
            } else {
                const days = Math.floor(diffMinutes / 1440);
                waitingTimeText = `hace ${days} d`;
            }

            return {
                isWaitingResponse: true,
                waitingSinceMs,
                waitingMinutes: diffMinutes,
                waitingTimeText: `Sin responder ${waitingTimeText}`,
                badgeTimeText: waitingTimeText
            };
        }

        // Construir chats reales exclusivamente (CERO mocks / demos)
        const realChats = [];
        const allPhones = Array.from(new Set([
            ...Object.keys(convByPhone),
            ...Object.keys(realChatsMap)
        ])).filter(phone => !phone.startsWith('5491203') && !phone.startsWith('1203'));

        allPhones.forEach(phone => {
            const messages = realChatsMap[phone] || [];
            const conv = convByPhone[phone];
            if (messages.length === 0 && !conv) return;

            const chronological = [...messages].reverse();
            const lastMsg = messages[0] || {};
            
            // Garantizar timestamp absoluto más reciente entre conversación y mensaje
            const convDateMs = conv?.last_message_at ? new Date(conv.last_message_at).getTime() : 0;
            const msgDateMs = lastMsg?.created_at ? new Date(lastMsg.created_at).getTime() : 0;
            const lastDateMs = Math.max(convDateMs, msgDateMs) || Date.now();
            const lastDateRaw = new Date(lastDateMs).toISOString();

            let lastRespName = 'Paciente';
            let lastRespRole = 'patient';
            if (lastMsg.direction === 'outgoing') {
                const raw = lastMsg.raw_payload;
                lastRespName = lastMsg.sender_name || (raw?.agent ? getAgentById(raw.agent).name : 'Sanatorio');
                lastRespRole = isHumanAgentMessage(lastMsg) ? 'agent' : 'bot';
            }

            const waitingInfo = calculateWaitingTime(messages, conv, lastDateMs);

            // Optimización de Memoria: Limitar a los 60 mensajes más recientes por chat en memoria activa
            // para garantizar máxima fluidez y evitar fugas de memoria en PCs de 4GB/8GB RAM
            const recentMsgs = chronological.slice(-60);

            const formattedMessages = recentMsgs.map(m => {
                const isAudio = m.media_type === 'audio' || m.media_type === 'voice' || (m.content && m.content.startsWith('_event_voice_note_')) || (m.media_url && /\.(mp3|ogg|oga|opus|wav|m4a|aac|webm)($|\?)/i.test(m.media_url));
                const audioTrans = m.raw_payload?.audio_transcription || m.raw_payload?.transcription || (isAudio && m.content && !m.content.startsWith('[') && !m.content.startsWith('_event_') ? m.content.replace(/^🎤\s*"?/, '').replace(/"?$/, '') : null);
                const audioUnder = m.raw_payload?.audio_understanding || null;

                // Extraer únicamente los campos funcionales de raw_payload, desechando payloads pesados o binarios
                const sanitizedRaw = m.raw_payload ? {
                    order_analysis: m.raw_payload.order_analysis,
                    audio_transcription: audioTrans,
                    audio_understanding: audioUnder,
                    agent: m.raw_payload.agent,
                    bot: m.raw_payload.bot || m.raw_payload.is_bot
                } : null;

                return {
                    id: 'real_' + m.id,
                    realId: m.id,
                    sender: m.direction === 'incoming' ? 'patient' : (m.direction === 'note' ? 'note' : 'agent'),
                    senderName: m.direction === 'incoming' ? (m.sender_name || 'Paciente') : (m.sender_name || 'Sanatorio Argentino'),
                    senderAgentId: m.raw_payload?.agent || (m.sender_name ? m.sender_name.toLowerCase() : null),
                    agentRole: m.direction === 'incoming' ? null : 'Atención al Paciente',
                    tagColor: m.direction === 'incoming' ? null : (getAgentById(m.sender_name)?.color || '#0284C7'),
                    type: isAudio ? 'audio' : (m.media_type || 'text'),
                    text: (m.content && !m.content.startsWith('_event_')) ? m.content : '',
                    mediaUrl: m.media_url || null,
                    orderAnalysis: m.raw_payload?.order_analysis || null,
                    audioTranscription: audioTrans,
                    audioUnderstanding: audioUnder,
                    rawPayload: sanitizedRaw,
                    isNote: m.direction === 'note',
                    timestamp: new Date(m.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
                };
            });

            const formatBirthDate = (val) => {
                if (!val || val === 'No informada') return 'No informada';
                if (String(val).includes('/')) return String(val).trim();
                const parts = String(val).split('T')[0].split('-');
                if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
                return String(val).trim();
            };

            // Helper de validación de nombres genéricos que NUNCA deben mostrarse como contacto
            const isGenericName = (name) => {
                if (!name) return true;
                const norm = String(name).trim().toLowerCase();
                return (
                    norm === 'bot sanatorio' ||
                    norm === 'bot' ||
                    norm === 'sanatorio' ||
                    norm === 'sanatorio argentino' ||
                    norm === 'paciente' ||
                    norm.startsWith('paciente (') ||
                    norm === 'recepciones'
                );
            };

            // A. Remitente de mensajes entrantes de WhatsApp (pushName de la persona)
            const incomingWithName = messages.find(m => 
                m.direction === 'incoming' && 
                m.sender_name && 
                !isGenericName(m.sender_name)
            );
            const incomingSenderName = incomingWithName?.sender_name || null;

            // B. Determinar nombre de contacto:
            // Solo si en la conversación actual se identificó expresamente al paciente se usa conv.nombre_completo.
            // Si no, se usa el pushName de WhatsApp o el número de teléfono (tratado como nuevo usuario).
            let resolvedContactName = null;
            if (conv?.nombre_completo && !isGenericName(conv.nombre_completo)) {
                resolvedContactName = conv.nombre_completo.trim();
            } else if (incomingSenderName) {
                resolvedContactName = incomingSenderName.trim();
            } else {
                resolvedContactName = `+${phone.replace(/\D/g, '')}`;
            }

            const patientFields = {
                dni: conv?.dni || null,
                nhc: conv?.nhc || null,
                pacienteNombre: conv?.nombre_completo || resolvedContactName,
                obraSocial: conv?.obra_social || null,
                fechaNacimiento: formatBirthDate(conv?.fecha_nacimiento),
                email: conv?.email || null,
                pacienteContacto: conv?.telefono_contacto || phone,
                departamento: conv?.departamento || 'San Juan',
                esPacienteExistente: Boolean(conv?.es_paciente_existente),
                motivoConsulta: conv?.motivo_consulta || (messages.find(m => m.direction === 'incoming')?.content || 'Consulta general'),
                medicoOEspecialidad: conv?.medico_o_especialidad || null,
                botActive: conv?.bot_active ?? false,
                botStage: conv?.bot_stage || 'inicio',
                pedidoMedicoFoto: lastMsg.media_type && lastMsg.media_type !== 'text' ? 'Adjunto en chat' : 'No adjuntado'
            };

            realChats.push({
                id: 'REAL_' + phone.slice(-6),
                contactName: resolvedContactName,
                phone: phone,
                channel: 'WHATSAPP',
                channelNumber: '5492645825637',
                status: conv?.status || (conv?.bot_active !== false && !conv?.assigned_agent_id ? 'bot' : 'sin_asignar'),
                unread: lastMsg.direction === 'incoming',
                lastMessage: lastMsg.content || (lastMsg.media_type ? `[${lastMsg.media_type}]` : conv?.last_message_text || 'Conversación iniciada'),
                lastMessageTimestamp: lastDateMs,
                timeAgo: formatRelativeTime(lastDateRaw),
                department: 'Atención al cliente',
                assignedTo: conv?.assigned_agent_id || null,
                assignedToName: conv?.assigned_agent_name || null,
                assignedAt: conv?.assigned_at || null,
                botActive: conv?.bot_active ?? false,
                aiSummary: conv?.ai_summary || null,
                resolutionReason: conv?.resolution_reason || null,
                closedAt: conv?.closed_at || null,
                closedByAgentId: conv?.closed_by_agent_id || null,
                closedByAgentName: conv?.closed_by_agent_name || null,
                lastResponder: lastRespName,
                lastResponderRole: lastRespRole,
                lastResponseAt: formatRelativeTime(lastDateRaw),
                isWaitingResponse: waitingInfo.isWaitingResponse,
                waitingSinceMs: waitingInfo.waitingSinceMs || null,
                waitingMinutes: waitingInfo.waitingMinutes ?? 0,
                waitingTimeText: waitingInfo.waitingTimeText,
                badgeTimeText: waitingInfo.badgeTimeText,
                chatbot: '#triage-sanatorio',
                avatarColor: '#0284C7',
                tags: ['Contact Center', 'WhatsApp'],
                customFields: patientFields,
                messages: formattedMessages
            });
        });

        // Orden cronológico descendente (interacción más reciente arriba)
        realChats.sort((a, b) => (b.lastMessageTimestamp || 0) - (a.lastMessageTimestamp || 0));

        return realChats;
    } catch (err) {
        console.warn('[contact-center] Error al cargar mensajes:', err);
        return [];
    }
}

/**
 * Envía un mensaje desde la consola de Contact Center:
 * - Si es nota privada: se guarda en BD para uso interno sin enviar a WhatsApp.
 * - Si es mensaje público: se despacha por BuilderBot al teléfono y se guarda en BD.
 * Deja tag con el agente que respondió y actualiza lastResponder.
 * Inmediatamente pausa el chatbot para que no interfiera.
 */
/**
 * Sube cualquier tipo de archivo (Excel, Word, PDF, TXT, imágenes, audio) al bucket whatsapp-media
 */
export async function uploadContactCenterMedia(file, folder = 'attachments') {
    if (!file) throw new Error('No se seleccionó ningún archivo');
    
    const ext = file.name?.split('.').pop() || 'bin';
    const cleanName = (file.name || 'archivo')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .slice(0, 30);
    const fileName = `contact_center/${folder}/${Date.now()}_${cleanName}.${ext}`;

    const { data, error } = await supabase.storage
        .from('whatsapp-media')
        .upload(fileName, file, { contentType: file.type || 'application/octet-stream', upsert: false });

    if (error) {
        console.error('Error subiendo media a whatsapp-media:', error);
        throw error;
    }

    const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(data.path);
    return {
        publicUrl: urlData.publicUrl,
        storagePath: data.path,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type
    };
}

export async function sendContactCenterMessage({ 
    chat, 
    text, 
    isNote, 
    activeAgent, 
    currentUser,
    mediaUrl = null,
    mediaType = null,
    fileName = null
}) {
    if (!isUserAuthorizedForContactCenter(currentUser)) {
        throw new Error('No tienes autorización para responder en el Contact Center. Solo las 4 agentes asignadas y Lucas Marinero tienen permisos operativos de respuesta.');
    }

    const isLocked = isChatLockedForUser(chat, activeAgent.id, currentUser);
    if (isLocked) {
        throw new Error(`No puedes responder. Esta conversación está asignada exclusivamente a ${chat.assignedToName || chat.assignedTo}.`);
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const normalizedPhone = normalizeArgentinePhone(chat.phone);

    const finalMediaType = mediaType || (mediaUrl ? 'document' : 'text');
    const defaultContent = finalMediaType === 'image' 
        ? '📷 Imagen' 
        : finalMediaType === 'audio' 
            ? '🎤 Audio' 
            : finalMediaType === 'document' 
                ? (fileName ? `📎 ${fileName}` : '📎 Documento') 
                : text;

    const finalContent = (text && text.trim()) ? text.trim() : defaultContent;

    // 1. Guardar en Supabase whatsapp_messages
    try {
        const { error: insertError } = await supabase
            .from('whatsapp_messages')
            .insert({
                phone: normalizedPhone,
                direction: isNote ? 'note' : 'outgoing',
                content: finalContent,
                media_type: finalMediaType,
                media_url: mediaUrl || null,
                sender_name: activeAgent.name,
                is_read: true,
                line_id: 'contact_center', // Exclusivo de la línea oficial Contact Center
                raw_payload: {
                    source: 'contact_center',
                    line: 'contact_center',
                    agent: activeAgent.id,
                    agentName: activeAgent.name,
                    isNote: !!isNote,
                    mediaUrl: mediaUrl || null,
                    mediaType: finalMediaType,
                    fileName: fileName || null
                }
            });

        if (insertError) {
            console.warn('Error al insertar en whatsapp_messages:', insertError.message);
        }
    } catch (err) {
        console.warn('Error en persistencia Supabase:', err);
    }

    // 2. Si es respuesta de agente, silenciar el chatbot automáticamente en contact_center_conversations
    if (!isNote && normalizedPhone) {
        try {
            await supabase
                .from('contact_center_conversations')
                .update({
                    bot_active: false,
                    last_message_text: finalContent,
                    last_message_at: now.toISOString(),
                    updated_at: now.toISOString()
                })
                .eq('phone', normalizedPhone);
        } catch (botMuteErr) {
            console.warn('Error muting bot in DB:', botMuteErr);
        }
    }

    // 3. Si NO es nota privada, despachar vía BuilderBot Edge Function
    if (!isNote && normalizedPhone) {
        try {
            await sendWhatsAppMessage({
                content: finalContent,
                number: normalizedPhone,
                lineId: 'contact_center',
                ...(mediaUrl && { mediaUrl })
            });
            console.log(`[contact-center] ✅ Mensaje con media despachado a BuilderBot (Línea Contact Center): ${normalizedPhone} por ${activeAgent.name}`);
        } catch (bbError) {
            console.error('[contact-center] Error despachando a BuilderBot:', bbError);
        }
    }

    // 4. Crear mensaje formateado para actualizar estado local
    const newMsg = {
        id: 'msg_' + Date.now(),
        sender: isNote ? 'note' : 'agent',
        senderName: activeAgent.name,
        senderAgentId: activeAgent.id,
        agentRole: activeAgent.role || 'Atención al Paciente',
        tagColor: activeAgent.color,
        type: finalMediaType,
        text: finalContent,
        caption: finalContent,
        mediaUrl: mediaUrl || null,
        mediaType: finalMediaType,
        fileName: fileName || null,
        isNote: !!isNote,
        timestamp: timeStr
    };

    const updatedChat = {
        ...chat,
        botActive: false,
        lastMessage: isNote ? `[Nota interna] ${finalContent}` : finalContent,
        lastMessageTimestamp: now.getTime(),
        timeAgo: 'hace unos segundos',
        lastResponder: activeAgent.name,
        lastResponderRole: 'agent',
        lastResponseAt: timeStr,
        isWaitingResponse: isNote ? chat.isWaitingResponse : false,
        waitingMinutes: isNote ? chat.waitingMinutes : 0,
        waitingTimeText: isNote ? chat.waitingTimeText : 'Respondido',
        badgeTimeText: isNote ? chat.badgeTimeText : 'Respondido',
        messages: [...(chat.messages || []), newMsg]
    };

    return { newMsg, updatedChat };
}

/**
 * Alterna el estado del bot (Activo / Silenciado) para una conversación
 */
export async function toggleBotActive(phone, botActive) {
    if (!phone) return false;
    const norm = normalizeArgentinePhone(phone);
    try {
        const { error } = await supabase
            .from('contact_center_conversations')
            .update({
                bot_active: !!botActive,
                updated_at: new Date().toISOString()
            })
            .eq('phone', norm);
        return !error;
    } catch (err) {
        console.error('Error in toggleBotActive:', err);
        return false;
    }
}

/**
 * Reinicia el flujo del chatbot para una conversación completamente a cero
 */
export async function resetBotWorkflow(phone) {
    if (!phone) return false;
    const norm = normalizeArgentinePhone(phone);
    try {
        const { error } = await supabase
            .from('contact_center_conversations')
            .update({
                bot_active: true,
                bot_stage: 'inicio',
                assigned_agent_id: null,
                assigned_agent_name: null,
                assigned_at: null,
                closed_at: null,
                resolution_reason: null,
                closed_by_agent_id: null,
                closed_by_agent_name: null,
                motivo_consulta: null,
                medico_o_especialidad: null,
                status: 'bot',
                updated_at: new Date().toISOString()
            })
            .eq('phone', norm);
        return !error;
    } catch (err) {
        console.error('Error in resetBotWorkflow:', err);
        return false;
    }
}

/**
 * Reabre manualmente una conversación cerrada/finalizada
 */
export async function reopenClosedChat({ chat, activeAgent }) {
    if (!chat || !chat.phone) throw new Error('Chat o teléfono inválido');
    const norm = normalizeArgentinePhone(chat.phone);
    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    const updateFields = {
        closed_at: null,
        resolution_reason: null,
        closed_by_agent_id: null,
        closed_by_agent_name: null,
        status: activeAgent ? 'abierto' : 'sin_asignar',
        assigned_agent_id: activeAgent?.id || null,
        assigned_agent_name: activeAgent?.name || null,
        assigned_at: activeAgent ? now.toISOString() : null,
        bot_active: activeAgent ? false : true,
        bot_stage: 'inicio',
        updated_at: now.toISOString()
    };

    const { error } = await supabase
        .from('contact_center_conversations')
        .update(updateFields)
        .eq('phone', norm);

    if (error) {
        console.error('[contact-center] Error reabriendo chat:', error);
        throw error;
    }

    return {
        ...chat,
        status: activeAgent ? 'abierto' : 'sin_asignar',
        closedAt: null,
        resolutionReason: null,
        closedByAgentId: null,
        closedByAgentName: null,
        assignedTo: activeAgent?.id || null,
        assignedToName: activeAgent?.name || null,
        assignedAt: activeAgent ? now.toISOString() : null,
        botActive: activeAgent ? false : true,
        messages: [
            ...(chat.messages || []),
            {
                id: 'sys_' + Date.now(),
                sender: 'system',
                text: `${activeAgent?.name || 'Operador'} reabrió la conversación.`,
                timestamp: timeStr
            }
        ]
    };
}

/**
 * Actualiza los datos o variables clínicas del paciente
 */
export async function updatePatientVariables(phone, variables) {
    if (!phone) return false;
    const norm = normalizeArgentinePhone(phone);
    try {
        const { error } = await supabase
            .from('contact_center_conversations')
            .update({
                ...variables,
                updated_at: new Date().toISOString()
            })
            .eq('phone', norm);
        return !error;
    } catch (err) {
        console.error('Error in updatePatientVariables:', err);
        return false;
    }
}

/**
 * Consulta la base de parámetros y honorarios de médicos
 */
export async function fetchDoctorParameters(query = '') {
    try {
        let q = supabase
            .from('contact_center_doctor_parameters')
            .select('*')
            .order('profesional_nombre', { ascending: true })
            .limit(100);

        if (query && query.trim().length > 1) {
            q = q.or(`profesional_nombre.ilike.%${query}%,especialidad.ilike.%${query}%,condiciones_consulta.ilike.%${query}%`);
        }

        const { data, error } = await q;
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Error fetching doctor parameters:', err);
        return [];
    }
}

/**
 * Guarda y persiste la Ficha CRM del Paciente vinculada a la conversación y al módulo CRM
 */
export async function saveCrmPatientCard({ phone, dni, nombreCompleto, obraSocial, fechaNacimiento, email, departamento, notas, motivoConsulta }) {
    if (!phone) throw new Error('Teléfono requerido');
    const norm = normalizeArgentinePhone(phone);

    const convPayload = {
        dni: dni ? String(dni).trim() : null,
        nombre_completo: nombreCompleto ? String(nombreCompleto).trim() : null,
        obra_social: obraSocial ? String(obraSocial).trim() : null,
        fecha_nacimiento: fechaNacimiento ? String(fechaNacimiento).trim() : null,
        email: email ? String(email).trim() : null,
        departamento: departamento ? String(departamento).trim() : null,
        motivo_consulta: motivoConsulta ? String(motivoConsulta).trim() : null,
        updated_at: new Date().toISOString()
    };

    // 1. Persistir en contact_center_conversations
    const { error: convErr } = await supabase
        .from('contact_center_conversations')
        .upsert({
            phone: norm,
            ...convPayload
        }, { onConflict: 'phone' });

    if (convErr) {
        console.error('Error guardando en contact_center_conversations:', convErr);
    }

    // 2. Persistir en crm_contacts para sincronización global (Admisiones, Cirugías, etc.)
    try {
        await supabase
            .from('crm_contacts')
            .upsert({
                phone: norm,
                nombre: convPayload.nombre_completo || 'Paciente',
                dni: convPayload.dni,
                notas: notas !== undefined ? notas : null,
                updated_at: new Date().toISOString()
            }, { onConflict: 'phone' });
    } catch (crmErr) {
        console.warn('Advertencia actualizando crm_contacts:', crmErr);
    }

    return { ...convPayload, notas };
}

/**
 * Vinculación EXCLUSIVA por DNI: Se eliminó la resolución de pacientes y grupos familiares por número de teléfono
 * para evitar confusiones de identidad cuando múltiples familiares comparten una misma línea telefónica.
 */
export async function fetchFamilyMembersByPhone(phone) {
    // Deprecado: La vinculación de pacientes ahora es exclusivamente por DNI.
    return [];
}

export async function lookupPatientByPhone(phone) {
    // Deprecado: La vinculación de pacientes ahora es exclusivamente por DNI.
    return null;
}

/**
 * Busca datos del paciente en el padrón maestro de SALUS (hospital_pacientes)
 * Soporta búsqueda EXCLUSIVA por DNI o NHC (NO por teléfono para evitar confusiones familiares).
 * Realiza búsqueda en tiempo real en SQL Server de SALUS con fallback local.
 */
export async function lookupPatientFromSalus(query) {
    if (!query || String(query).trim().length < 4) return null;
    const rawStr = String(query).trim();
    const clean = rawStr.replace(/\D/g, '');

    if (!clean || clean.length < 5) return null;

    // 1. Prioridad: Búsqueda en tiempo real en SALUS SQL Server vía sync-server (timeout 2.5s)
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const baseUrl = getSalusSyncBaseUrl();
        const res = await fetch(`${baseUrl}/api/salus/paciente/${clean}`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) {
            const json = await res.json();
            if (json.success && json.paciente) {
                return json.paciente;
            }
        }
    } catch (_) {
        // Fallback a Supabase si sync-server no responde
    }

    // 2. Fallback: Búsqueda por DNI o NHC en Supabase hospital_pacientes
    try {
        const { data, error } = await supabase
            .from('hospital_pacientes')
            .select('*')
            .or(`dni.eq.${clean},nhc.eq.${clean}`)
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        if (data) {
            // Si no tiene email, buscar en contact_center_turnos_online
            if (!data.email && data.dni) {
                try {
                    const { data: toRow } = await supabase
                        .from('contact_center_turnos_online')
                        .select('email')
                        .eq('dni', data.dni)
                        .not('email', 'is', null)
                        .limit(1)
                        .maybeSingle();
                    if (toRow && toRow.email) {
                        data.email = toRow.email;
                    }
                } catch (_) {}
            }
            return data;
        }

        return null;
    } catch (err) {
        console.error('Error buscando paciente en hospital_pacientes:', err);
        return null;
    }
}

/**
 * Mensaje oficial obligatorio de finalización de atención y encuesta de satisfacción (5 estrellas)
 */
export const FINAL_ATTENTION_MESSAGE = `¡Gracias por comunicarte con el Sanatorio Argentino! 🏥
Damos por finalizada esta conversación.
Si nuestra atención te fue de ayuda hoy, nos sumarías un montón dejándonos 5 estrellas aquí: https://oqdslqa.s.gy/sede1 ⭐
¡Que tengas un excelente día!`;

/**
 * Cierra o archiva una conversación con motivo de resolución y auditoría de agente
 * Envía automáticamente el mensaje oficial de despedida y encuesta de satisfacción al paciente vía WhatsApp
 */
export async function closeConversationWithResolution({ chat, resolutionReason, activeAgent, currentUser }) {
    if (!chat || !chat.phone) throw new Error('Chat o teléfono inválido');
    const norm = normalizeArgentinePhone(chat.phone);
    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    // 1. Enviar el mensaje oficial de finalización y encuesta al paciente vía WhatsApp (Línea Contact Center)
    if (norm) {
        try {
            await sendWhatsAppMessage({
                content: FINAL_ATTENTION_MESSAGE,
                number: norm,
                lineId: 'contact_center'
            });
            console.log(`[contact-center] ✅ Mensaje final de atención despachado a WhatsApp: ${norm}`);
        } catch (sendErr) {
            console.warn('[contact-center] Error despachando mensaje final a WhatsApp:', sendErr);
        }

        // 2. Persistir el mensaje saliente en whatsapp_messages para auditoría y visualización en el chat
        try {
            await supabase
                .from('whatsapp_messages')
                .insert({
                    phone: norm,
                    direction: 'outgoing',
                    content: FINAL_ATTENTION_MESSAGE,
                    media_type: 'text',
                    sender_name: activeAgent?.name || 'Sanatorio Argentino',
                    is_read: true,
                    line_id: 'contact_center',
                    raw_payload: {
                        source: 'contact_center',
                        line: 'contact_center',
                        agent: activeAgent?.id || null,
                        agentName: activeAgent?.name || 'Sanatorio Argentino',
                        isFinalCloseMessage: true,
                        resolutionReason: resolutionReason || 'Resuelto'
                    }
                });
        } catch (insertErr) {
            console.warn('[contact-center] Error insertando mensaje de cierre en whatsapp_messages:', insertErr);
        }
    }

    // 3. Actualizar conversación en contact_center_conversations
    const updateFields = {
        status: 'archivado',
        resolution_reason: resolutionReason || 'Resuelto',
        closed_at: now.toISOString(),
        closed_by_agent_id: activeAgent?.id || null,
        closed_by_agent_name: activeAgent?.name || null,
        assigned_agent_id: null,
        assigned_agent_name: null,
        bot_active: true, // reactivar bot para futuros contactos
        bot_stage: 'inicio', // reiniciar flujo del bot
        last_message_text: FINAL_ATTENTION_MESSAGE,
        last_message_at: now.toISOString(),
        updated_at: now.toISOString()
    };

    const { error } = await supabase
        .from('contact_center_conversations')
        .upsert({
            phone: norm,
            ...updateFields
        }, { onConflict: 'phone' });

    if (error) {
        console.error('Error cerrando conversación:', error);
        throw error;
    }

    const finalOutMsg = {
        id: 'msg_final_' + Date.now(),
        sender: 'agent',
        senderName: activeAgent?.name || 'Sanatorio Argentino',
        senderAgentId: activeAgent?.id || null,
        agentRole: activeAgent?.role || 'Atención al Paciente',
        tagColor: activeAgent?.color || '#059669',
        type: 'text',
        text: FINAL_ATTENTION_MESSAGE,
        isNote: false,
        timestamp: timeStr
    };

    const sysMsg = {
        id: 'sys_' + Date.now(),
        sender: 'system',
        text: `${activeAgent?.name || 'Operador'} finalizó la atención con motivo: "${resolutionReason || 'Resuelto'}". Se envió mensaje de cierre y encuesta al paciente. Bot reactivado.`,
        timestamp: timeStr
    };

    return {
        ...chat,
        status: 'archivado',
        assignedTo: null,
        assignedToName: null,
        botActive: true,
        resolutionReason: resolutionReason || 'Resuelto',
        lastMessage: FINAL_ATTENTION_MESSAGE,
        timeAgo: 'hace unos segundos',
        messages: [
            ...(chat.messages || []),
            finalOutMsg,
            sysMsg
        ]
    };
}

/**
 * Finaliza o archiva múltiples conversaciones de forma MASIVA Y SILENCIOSA.
 * REGLA ESTRICTA: NO se envía ningún mensaje de WhatsApp a los pacientes.
 * Actualiza contact_center_conversations en Supabase con status: 'archivado',
 * resetea el agente asignado y reactiva el bot para futuros contactos.
 */
export async function bulkCloseConversationsSilent({ targetChats, resolutionReason = 'Cierre masivo de cola', activeAgent, currentUser }) {
    if (!targetChats || !targetChats.length) return [];
    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    const upsertRows = [];
    const updatedChats = [];

    for (const chat of targetChats) {
        if (!chat?.phone) continue;
        const norm = normalizeArgentinePhone(chat.phone);
        if (!norm) continue;

        upsertRows.push({
            phone: norm,
            status: 'archivado',
            resolution_reason: resolutionReason,
            closed_at: now.toISOString(),
            closed_by_agent_id: activeAgent?.id || null,
            closed_by_agent_name: activeAgent?.name || null,
            assigned_agent_id: null,
            assigned_agent_name: null,
            bot_active: true,
            bot_stage: 'inicio',
            updated_at: now.toISOString()
        });

        const sysMsg = {
            id: 'sys_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            sender: 'system',
            text: `${activeAgent?.name || 'Operador'} finalizó masivamente la conversación (${resolutionReason}). Cierre silencioso: sin envío de mensaje al paciente. Bot reactivado.`,
            timestamp: timeStr
        };

        updatedChats.push({
            ...chat,
            status: 'archivado',
            assignedTo: null,
            assignedToName: null,
            botActive: true,
            resolutionReason,
            messages: [
                ...(chat.messages || []),
                sysMsg
            ]
        });
    }

    if (upsertRows.length > 0) {
        const { error } = await supabase
            .from('contact_center_conversations')
            .upsert(upsertRows, { onConflict: 'phone' });

        if (error) {
            console.error('Error al finalizar conversaciones masivamente en Supabase:', error);
            throw error;
        }
    }

    return updatedChats;
}

/**
 * Sonido de notificación característico para nuevos mensajes entrantes (tipo WhatsApp Web)
 * Sintetizado con Web Audio API (no requiere archivos externos)
 */
export function playContactCenterChime() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();

        // Tono 1 (880Hz - A5)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, ctx.currentTime);
        gain1.gain.setValueAtTime(0.18, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.16);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 0.16);

        // Tono 2 (1175Hz - D6, ligeramente más agudo)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1175, ctx.currentTime + 0.13);
        gain2.gain.setValueAtTime(0.15, ctx.currentTime + 0.13);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(ctx.currentTime + 0.13);
        osc2.stop(ctx.currentTime + 0.35);

        setTimeout(() => {
            try { ctx.close(); } catch { }
        }, 600);
    } catch (e) {
        console.warn('[contact-center] Audio notification prevented:', e);
    }
}

/**
 * Suscripción en Tiempo Real (OnLive) para el CRM de Contact Center
 * - Escucha nuevos mensajes en whatsapp_messages para contact_center
 * - Escucha altas y modificaciones en contact_center_conversations (reasignaciones, ficha, estado)
 */
export function subscribeToContactCenterRealtime({ onNewMessage, onConversationChange }) {
    const channel = supabase
        .channel('contact-center-onlive-hub')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'whatsapp_messages'
            },
            (payload) => {
                const msg = payload.new;
                if (!msg) return;
                // Aislamiento estricto: ignorar mensajes de otras líneas de la clínica
                if (['line_recepciones', 'line_a', 'line_b', 'line_c', 'line_meta'].includes(msg.line_id)) {
                    return;
                }
                if (msg.line_id && msg.line_id !== 'contact_center') {
                    return;
                }
                if (msg.phone && (msg.phone.startsWith('5491203') || msg.phone.startsWith('1203'))) {
                    return;
                }
                if (onNewMessage) onNewMessage(msg, payload.eventType);
            }
        )
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'contact_center_conversations'
            },
            (payload) => {
                const changed = payload.new || payload.old;
                if (onConversationChange && changed) {
                    onConversationChange(changed, payload.eventType);
                }
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}

/**
 * Invoca la Edge Function analyze-medical-order para analizar una orden médica enviada por imagen
 */
export async function analyzeMedicalOrderImage(imageUrl, messageId = null, phone = null) {
    if (!imageUrl) return null;
    try {
        const { data, error } = await supabase.functions.invoke('analyze-medical-order', {
            body: { imageUrl, messageId, phone }
        });
        if (error) {
            console.error('[contactCenterService] Error en analyzeMedicalOrderImage:', error);
            throw error;
        }
        return data?.analysis || null;
    } catch (err) {
        console.error('[contactCenterService] Error invocando analyze-medical-order:', err);
        throw err;
    }
}

/**
 * Invoca la Edge Function contact-center-chat-summary para resumir la solicitud del paciente y detectar doctor/parámetros
 */
export async function generateChatAiSummary(phone) {
    if (!phone) return null;
    try {
        const { data, error } = await supabase.functions.invoke('contact-center-chat-summary', {
            body: { phone }
        });
        if (error) {
            console.error('[contactCenterService] Error en generateChatAiSummary:', error);
            throw error;
        }
        return data?.summary || null;
    } catch (err) {
        console.error('[contactCenterService] Error invocando contact-center-chat-summary:', err);
        throw err;
    }
}

/**
 * Invoca la Edge Function transcribe-audio para transcribir y entender con IA (Whisper) un audio de paciente
 */
export async function transcribeAudioMessage(audioUrl, messageId = null, phone = null) {
    if (!audioUrl) return null;
    try {
        const { data, error } = await supabase.functions.invoke('transcribe-audio', {
            body: { audioUrl, messageId, phone }
        });
        if (error) {
            console.error('[contactCenterService] Error en transcribeAudioMessage:', error);
            throw error;
        }
        return data || null;
    } catch (err) {
        console.error('[contactCenterService] Error invocando transcribe-audio:', err);
        throw err;
    }
}

/**
 * =========================================================================
 * PRESENCIA EN TIEMPO REAL (QUIÉN ESTÁ VIENDO LA CONVERSACIÓN - "EL OJITO")
 * =========================================================================
 * Permite saber en vivo qué agentes tienen abierta y están leyendo una conversación.
 * Combina Supabase Realtime Channel Presence (cross-dispositivo) con BroadcastChannel
 * para sincronización inmediata entre pestañas en la misma máquina.
 */
const TAB_SESSION_ID = typeof window !== 'undefined' 
    ? (window.__cc_tab_id || (window.__cc_tab_id = Math.random().toString(36).substring(2, 9)))
    : 'srv';

export function subscribeToChatPresence({ activeAgent, currentUser, onPresenceChange }) {
    if (typeof window === 'undefined') {
        return { trackChat: () => {}, untrackChat: () => {}, cleanup: () => {} };
    }

    const myAgentId = (activeAgent?.id || activeAgent?.username || currentUser?.usuario || 'anon').toLowerCase();
    const myAgentName = activeAgent?.name || currentUser?.nombre || activeAgent?.fullName || 'Agente';
    const myAgentColor = activeAgent?.color || '#0284C7';
    const myAgentAvatar = activeAgent?.avatar || 'AG';
    const mySessionKey = `${myAgentId}_${TAB_SESSION_ID}`;

    const localPresences = new Map();
    let currentTrackedChat = { chatId: null, phone: null };

    const notify = () => {
        if (!onPresenceChange) return;
        const now = Date.now();
        // Filtrar entradas inactivas o sin chat asociado
        const activeList = Array.from(localPresences.values()).filter(p => {
            if (!p.chatId && !p.phone) return false;
            if (p.updatedAt && (now - p.updatedAt > 45000)) return false;
            return true;
        });
        onPresenceChange(activeList);
    };

    let broadcastCh = null;
    try {
        if ('BroadcastChannel' in window) {
            broadcastCh = new BroadcastChannel('cc_agent_presence_sync_hub');
            broadcastCh.onmessage = (event) => {
                const data = event.data;
                if (!data) return;
                if (data.type === 'TRACK') {
                    localPresences.set(data.sessionKey, { ...data.payload, updatedAt: Date.now() });
                    notify();
                } else if (data.type === 'UNTRACK') {
                    localPresences.delete(data.sessionKey);
                    notify();
                } else if (data.type === 'QUERY') {
                    if (currentTrackedChat.chatId || currentTrackedChat.phone) {
                        broadcastCh.postMessage({
                            type: 'TRACK',
                            sessionKey: mySessionKey,
                            payload: {
                                sessionKey: mySessionKey,
                                agentId: myAgentId,
                                agentName: myAgentName,
                                agentColor: myAgentColor,
                                agentAvatar: myAgentAvatar,
                                chatId: currentTrackedChat.chatId,
                                phone: currentTrackedChat.phone
                            }
                        });
                    }
                }
            };
            broadcastCh.postMessage({ type: 'QUERY' });
        }
    } catch (e) {
        console.warn('[presence] BroadcastChannel error:', e);
    }

    let realtimeChannel = null;
    try {
        realtimeChannel = supabase.channel('contact-center-presence-hub', {
            config: {
                presence: {
                    key: mySessionKey
                }
            }
        });

        const syncFromSupabase = () => {
            const state = realtimeChannel.presenceState();
            Object.entries(state).forEach(([key, presences]) => {
                if (Array.isArray(presences) && presences.length > 0) {
                    const latest = presences[presences.length - 1];
                    if (latest && (latest.chatId || latest.phone)) {
                        localPresences.set(key, { ...latest, updatedAt: Date.now() });
                    } else {
                        localPresences.delete(key);
                    }
                }
            });
            notify();
        };

        realtimeChannel
            .on('presence', { event: 'sync' }, syncFromSupabase)
            .on('presence', { event: 'join' }, ({ key, newPresences }) => {
                if (newPresences && newPresences.length > 0) {
                    const latest = newPresences[newPresences.length - 1];
                    localPresences.set(key, { ...latest, updatedAt: Date.now() });
                    notify();
                }
            })
            .on('presence', { event: 'leave' }, ({ key }) => {
                localPresences.delete(key);
                notify();
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED' && (currentTrackedChat.chatId || currentTrackedChat.phone)) {
                    try {
                        await realtimeChannel.track({
                            sessionKey: mySessionKey,
                            agentId: myAgentId,
                            agentName: myAgentName,
                            agentColor: myAgentColor,
                            agentAvatar: myAgentAvatar,
                            chatId: currentTrackedChat.chatId,
                            phone: currentTrackedChat.phone
                        });
                    } catch {}
                }
            });
    } catch (e) {
        console.warn('[presence] Supabase Realtime channel error:', e);
    }

    const trackChat = async (chatId, phone) => {
        const normPhone = phone ? normalizeArgentinePhone(phone) : null;
        currentTrackedChat = { chatId: chatId || null, phone: normPhone };

        const payload = {
            sessionKey: mySessionKey,
            agentId: myAgentId,
            agentName: myAgentName,
            agentColor: myAgentColor,
            agentAvatar: myAgentAvatar,
            chatId: chatId || null,
            phone: normPhone
        };

        localPresences.set(mySessionKey, { ...payload, updatedAt: Date.now() });
        notify();

        try {
            broadcastCh?.postMessage({
                type: 'TRACK',
                sessionKey: mySessionKey,
                payload
            });
        } catch {}

        try {
            if (realtimeChannel && realtimeChannel.state === 'joined') {
                await realtimeChannel.track(payload);
            }
        } catch {}
    };

    const untrackChat = async () => {
        currentTrackedChat = { chatId: null, phone: null };
        localPresences.delete(mySessionKey);
        notify();

        try {
            broadcastCh?.postMessage({
                type: 'UNTRACK',
                sessionKey: mySessionKey
            });
        } catch {}

        try {
            if (realtimeChannel && realtimeChannel.state === 'joined') {
                await realtimeChannel.untrack();
            }
        } catch {}
    };

    const intervalId = setInterval(() => {
        if (currentTrackedChat.chatId || currentTrackedChat.phone) {
            trackChat(currentTrackedChat.chatId, currentTrackedChat.phone);
        }
    }, 20000);

    const onBeforeUnload = () => {
        try {
            broadcastCh?.postMessage({
                type: 'UNTRACK',
                sessionKey: mySessionKey
            });
        } catch {}
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    return {
        trackChat,
        untrackChat,
        cleanup: () => {
            clearInterval(intervalId);
            window.removeEventListener('beforeunload', onBeforeUnload);
            untrackChat();
            try {
                if (broadcastCh) broadcastCh.close();
            } catch {}
            try {
                if (realtimeChannel) supabase.removeChannel(realtimeChannel);
            } catch {}
        }
    };
}

// ================================================
// CONFIGURACIÓN DINÁMICA DEL CHATBOT / SYSTEM PROMPT
// ================================================

export const DEFAULT_CHATBOT_SYSTEM_PROMPT = `Eres el Asistente Virtual Inteligente oficial de Sanatorio Argentino (San Juan, Argentina), una prestigiosa institución de salud fundada en 1957.
Tu misión es mantener una conversación natural, cálida, empática, ágil y resolutiva con los pacientes a través de WhatsApp.

DATOS DEL PACIENTE:
- Nombre: {nombre}
- DNI: {dni}
- Cobertura / Obra Social: {cobertura}
{turnos}

DIRECTIVAS PRINCIPALES:
1. TONO: Cercano, humano, cordial, respetuoso y profesional (español argentino rioplatense educado: "¡Hola {nombre}!", "te comento", "contanos").
2. CONVERSACIONAL REAL: Responde de forma directa, útil e inteligente al mensaje del paciente.
3. CONSULTA DE TURNOS EXISTENTES:
   - Si el paciente pregunta por un turno ya agendado y NO tenemos su DNI, pídeselo amablemente ("Por favor indícanos el número de DNI del paciente, sin puntos ni espacios").
   - Si ya figuran turnos en sus datos arriba, confírmale los detalles (día, hora, profesional, sede).
4. PEDIDO DE AGENTE O HORARIOS DE ATENCIÓN (MÁXIMA PRIORIDAD):
   - Horario de atención de agentes (Contact Center): Lunes a Viernes de 7:30 a 21:00 hs y Sábados de 8:00 a 12:00 hs.
   - Guardias 24 hs: Sede 01 (San Luis 432 Oeste) activa para urgencias.
   - Si el paciente pide que lo atienda una persona, un agente, un operador, o manifiesta que el bot no le sirve o no comprende:
     - Confirma con calidez y amabilidad que lo estás comunicando con un agente del equipo de atención e informa el horario de atención.
     - Establece obligatoriamente "transferToAgent": true y "intent": "derivacion_agente".
5. SOLICITUD DE NUEVOS TURNOS Y GESTIONES MÉDICAS (LOS DOS CAMINOS DE ADMISIÓN):
   - CAMINO 1 (PACIENTE REGISTRADO EN SALUS):
     Si el paciente ya cuenta con historia clínica y DNI verificado en el Sanatorio, confirma su Nombre y DNI y solicítale validar o especificar su Obra Social / Prepaga y Plan actual (ej: OSP Plan Tradicional, OSDE 210, Particular). Luego consulta especialidad o profesional y días/horarios preferidos.
   - CAMINO 2 (PACIENTE NUEVO / NO REGISTRADO EN SALUS):
     Si el paciente no figura registrado en el sistema SALUS, explícale con amabilidad que para abrir su ficha digital de admisión y gestionar su turno o trámite se requieren los datos obligatorios: Nombre y Apellido completo (tal como figura en el DNI), DNI, Fecha de Nacimiento (DD/MM/AAAA) o edad, Obra Social / Prepaga y Plan (o Particular), y Departamento de residencia en San Juan.
6. INFORMACIÓN INSTITUCIONAL VERÍDICA:
   - Sede San Luis (San Luis 432 Oeste, Capital): Maternidad, Quirófanos, Internación, Consultorios externos, Guardias Médicas 24 horas (Clínica médica adultos, Pediatría 24hs activa, Ginecología/Obstetricia, Cardiología). Por orden de llegada con triage de urgencia.
   - Sede Santa Fe (Santa Fe 263 Este, Capital): Consultorios externos, Vacunatorio, Chequeo Preventivo de Salud, Programa Prevenir (OSP), Diagnóstico por Imágenes (Ecografía, Rayos, Tomografía, Resonancia, Mamografía), Kinesiología.
   - Laboratorio: Resultados online en la web oficial con usuario y contraseña entregados en la extracción.
   - Obras Sociales: Atendemos OSP, OSDE, Swiss Medical, Galeno, Medifé, Jerárquicos y la gran mayoría de prepagas y obras sociales, y atención Particular.
7. VOLVER ATRÁS O MENÚ PRINCIPAL:
   - Si el paciente manifiesta que se equivocó, desea cambiar de opción o volver, o si le das opciones informativas, recuérdale que puede escribir "Menú" o "Atrás" para regresar al inicio.
8. FORMATO: Breve y claro, optimizado para lectura en WhatsApp (máximo 2 párrafos cortos, uso de *negrita* para resaltar datos clave, emojis médicos sobrios 🏥 🩺). Al final de respuestas orientativas puedes agregar: "\\n\\n🔙 *Volver:* Escribí *\\"Menú\\"* | 👤 *Agente:* Escribí *\\"Agente\\"*".`;

export const DEFAULT_HANDOFF_NORMAL = `👩‍⚕️ Un agente te responderá a la brevedad. El bot quedará en pausa.\n⏰ *Horario de atención:* Lunes a Viernes de 7:30 a 21:00 hs y Sábados de 8:00 a 12:00 hs.`;

export const DEFAULT_HANDOFF_DELAY = `⚠️ En este momento estamos experimentando una alta demanda en nuestro canal de atención y presentamos algunas demoras. Un asesor te responderá a la brevedad por orden de llegada. El bot quedará en pausa.\n⏰ *Horario de atención:* Lunes a Viernes de 7:30 a 21:00 hs y Sábados de 8:00 a 12:00 hs.`;

/**
 * Obtiene la configuración activa del chatbot desde app_config y el estado de la cola
 */
export async function fetchChatbotConfig() {
    try {
        const [configRes, queueRes] = await Promise.all([
            supabase
                .from('app_config')
                .select('key, value, updated_at, updated_by')
                .in('key', [
                    'contact_center_system_prompt',
                    'contact_center_ai_model',
                    'contact_center_ai_temperature',
                    'contact_center_bot_name',
                    'contact_center_handoff_normal',
                    'contact_center_handoff_delay',
                    'contact_center_delay_threshold'
                ]),
            supabase
                .from('contact_center_conversations')
                .select('phone', { count: 'exact', head: true })
                .eq('status', 'sin_asignar')
        ]);

        const data = configRes.data || [];
        const unassignedQueueCount = queueRes.count || 0;

        const map = {};
        let latestUpdate = null;
        let lastUser = null;

        data.forEach(row => {
            map[row.key] = row.value;
            if (row.updated_at && (!latestUpdate || new Date(row.updated_at) > new Date(latestUpdate))) {
                latestUpdate = row.updated_at;
                lastUser = row.updated_by;
            }
        });

        return {
            systemPrompt: map['contact_center_system_prompt'] || DEFAULT_CHATBOT_SYSTEM_PROMPT,
            model: map['contact_center_ai_model'] || 'gpt-4o',
            temperature: map['contact_center_ai_temperature'] || '0.3',
            botName: map['contact_center_bot_name'] || 'Dora',
            handoffNormal: map['contact_center_handoff_normal'] || DEFAULT_HANDOFF_NORMAL,
            handoffDelay: map['contact_center_handoff_delay'] || DEFAULT_HANDOFF_DELAY,
            delayThreshold: map['contact_center_delay_threshold'] ? parseInt(map['contact_center_delay_threshold'], 10) : 5,
            unassignedQueueCount,
            updatedAt: latestUpdate,
            updatedBy: lastUser
        };
    } catch (err) {
        console.error('[contactCenterService] Exception fetching chatbot config:', err);
        return {
            systemPrompt: DEFAULT_CHATBOT_SYSTEM_PROMPT,
            model: 'gpt-4o',
            temperature: '0.3',
            botName: 'Dora',
            handoffNormal: DEFAULT_HANDOFF_NORMAL,
            handoffDelay: DEFAULT_HANDOFF_DELAY,
            delayThreshold: 5,
            unassignedQueueCount: 0,
            updatedAt: null,
            updatedBy: null
        };
    }
}

/**
 * Guarda y actualiza la configuración del chatbot en app_config
 */
export async function saveChatbotConfig({
    systemPrompt,
    model = 'gpt-4o',
    temperature = '0.3',
    botName = 'Dora',
    handoffNormal = DEFAULT_HANDOFF_NORMAL,
    handoffDelay = DEFAULT_HANDOFF_DELAY,
    delayThreshold = 5,
    user = 'admin'
}) {
    const now = new Date().toISOString();
    const rows = [
        {
            key: 'contact_center_system_prompt',
            value: systemPrompt,
            label: 'System Prompt del Chatbot (Contact Center)',
            category: 'contact_center',
            updated_at: now,
            updated_by: user
        },
        {
            key: 'contact_center_ai_model',
            value: model,
            label: 'Modelo OpenAI del Chatbot',
            category: 'contact_center',
            updated_at: now,
            updated_by: user
        },
        {
            key: 'contact_center_ai_temperature',
            value: String(temperature),
            label: 'Temperatura del Chatbot (0.0 - 1.0)',
            category: 'contact_center',
            updated_at: now,
            updated_by: user
        },
        {
            key: 'contact_center_bot_name',
            value: botName,
            label: 'Nombre del Asistente Virtual',
            category: 'contact_center',
            updated_at: now,
            updated_by: user
        },
        {
            key: 'contact_center_handoff_normal',
            value: handoffNormal,
            label: 'Mensaje de derivación estándar (Cola normal)',
            category: 'contact_center',
            updated_at: now,
            updated_by: user
        },
        {
            key: 'contact_center_handoff_delay',
            value: handoffDelay,
            label: 'Mensaje de derivación por alta demanda (Demoras)',
            category: 'contact_center',
            updated_at: now,
            updated_by: user
        },
        {
            key: 'contact_center_delay_threshold',
            value: String(delayThreshold),
            label: 'Umbral de chats sin asignar para activar aviso de demoras',
            category: 'contact_center',
            updated_at: now,
            updated_by: user
        }
    ];

    const { data, error } = await supabase
        .from('app_config')
        .upsert(rows, { onConflict: 'key' })
        .select();

    if (error) {
        console.error('[contactCenterService] Error saving chatbot config:', error);
        throw error;
    }

    return data;
}
