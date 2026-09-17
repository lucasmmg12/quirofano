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

const STORAGE_ALLOWED_USERS_KEY = 'sa_contact_center_allowed_users';
const CONFIG_KEY = 'contact_center_allowed_users';

// Administradores con acceso maestro permanente
export const MASTER_ADMINS = ['lmarinero', 'admin'];

// 4 Agentes activas del Contact Center de Sanatorio Argentino
export const CONTACT_CENTER_AGENTS = [
    { id: 'daniela', name: 'Daniela', fullName: 'Daniela Calivar', role: 'Atención al Paciente', color: '#E11D48', avatar: 'D' },
    { id: 'sofia', name: 'Sofia', fullName: 'Sofia Morales', role: 'Atención al Paciente', color: '#8B5CF6', avatar: 'S' },
    { id: 'virginia', name: 'Virginia', fullName: 'Virginia Quiroga', role: 'Atención al Paciente', color: '#059669', avatar: 'V' },
    { id: 'erica', name: 'Erica', fullName: 'Erica Gonzalez', role: 'Atención al Paciente', color: '#D97706', avatar: 'E' },
];

/**
 * Obtiene el objeto de agente a partir de un identificador o nombre
 */
export function getAgentById(agentIdOrName) {
    if (!agentIdOrName) return null;
    const clean = String(agentIdOrName).toLowerCase().trim();
    return CONTACT_CENTER_AGENTS.find(a => a.id === clean || a.name.toLowerCase() === clean) || {
        id: clean,
        name: agentIdOrName,
        fullName: agentIdOrName,
        role: 'Operador Sanatorio',
        color: '#0284C7',
        avatar: (agentIdOrName[0] || 'A').toUpperCase()
    };
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

    // Si es una de las 4 agentes autorizadas
    if (['daniela', 'sofia', 'virginia', 'erica'].includes(username)) {
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

export const INITIAL_CHATS = [
    {
        id: '3CMI20',
        contactName: 'Johana',
        phone: '5492646020120',
        channel: 'WHATSAPP',
        channelNumber: '5492645825637',
        status: 'abierto',
        unread: false,
        lastMessage: 'Damos por finalizada esta conversación...',
        timeAgo: 'hace 2 minutos',
        department: 'Atención al cliente',
        assignedTo: 'daniela',
        assignedToName: 'Daniela',
        assignedAt: '2026-09-17T12:24:30.000Z',
        lastResponder: 'Daniela',
        lastResponderRole: 'agent',
        lastResponseAt: 'hace 2 min',
        chatbot: '#betina-encuesta2',
        avatarColor: '#E11D48',
        tags: ['Consulta Turnos', 'Citología'],
        customFields: {
            dni: '33289371',
            dniFotoUrl: 'https://asisteclick-media.sfo2.cdn.digitaloceanspaces.com/sample_dni.jpg',
            turnosDiaHora: 'Lunes a Viernes 08:00 a 13:00 hs',
            pedidoMedicoFoto: 'Foto adjunta en chat',
            pacienteNombre: 'Johana R.',
            pacienteContacto: '5492646020120',
            obraSocial: 'Obra Social Provincia (OSP)'
        },
        messages: [
            {
                id: 'm1',
                sender: 'patient',
                senderName: 'Johana',
                type: 'image',
                mediaUrl: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=600&auto=format&fit=crop&q=80',
                caption: 'Foto de orden médica',
                timestamp: '17-sep-26 12:23:50',
            },
            {
                id: 'm2',
                sender: 'system',
                text: '17-sep-26 12:23:55 Bot Betina asignó la conversación a Atención al cliente',
                timestamp: '17-sep-26 12:23:55'
            },
            {
                id: 'm3',
                sender: 'patient',
                senderName: 'Johana',
                type: 'text',
                text: '33289371',
                timestamp: '17-sep-26 12:24:11'
            },
            {
                id: 'm4',
                sender: 'system',
                text: 'Daniela se asignó la conversación exclusivamente',
                timestamp: '17-sep-26 12:24:30'
            },
            {
                id: 'm5',
                sender: 'agent',
                senderName: 'Daniela',
                senderAgentId: 'daniela',
                agentRole: 'Atención al Paciente',
                tagColor: '#E11D48',
                type: 'text',
                text: 'Hola soy Daniela de Sanatorio Argentino, gracias por tu contacto. Te escribo por tu consulta realizada, Usted debe comunicarse con citología al 2644552540.',
                timestamp: '12:25'
            },
            {
                id: 'm6',
                sender: 'agent',
                senderName: 'Daniela',
                senderAgentId: 'daniela',
                agentRole: 'Atención al Paciente',
                tagColor: '#E11D48',
                type: 'text',
                text: '¡Gracias por comunicarte con el Sanatorio Argentino! 🏥 Damos por finalizada esta conversación.\nSi nuestra atención te fue de ayuda hoy, nos sumarías un montón dejándonos 5 estrellas aquí: https://oqdslqa.s.gy/sede1 ⭐\n¡Que tengas un excelente día!',
                timestamp: '12:26'
            }
        ]
    },
    {
        id: '3CMJV0',
        contactName: 'VERÓNICA 💟',
        phone: '5492644123456',
        channel: 'WHATSAPP',
        channelNumber: '5492645825637',
        status: 'sin_asignar',
        unread: true,
        lastMessage: 'Hola, buenas tardes! Un turno con la Dra. Burgoa',
        timeAgo: 'hace 21 minutos',
        department: 'Atención al cliente',
        assignedTo: null,
        assignedToName: null,
        assignedAt: null,
        lastResponder: 'Paciente',
        lastResponderRole: 'patient',
        lastResponseAt: 'hace 21 min',
        chatbot: '#betina-encuesta2',
        avatarColor: '#8B5CF6',
        tags: ['Ginecología', 'Turnos'],
        customFields: {
            dni: '28456123',
            dniFotoUrl: null,
            turnosDiaHora: 'Solicita Dra. Burgoa',
            pedidoMedicoFoto: 'No requerido',
            pacienteNombre: 'Verónica M.',
            pacienteContacto: '5492644123456',
            obraSocial: 'Swiss Medical'
        },
        messages: [
            {
                id: 'mv1',
                sender: 'patient',
                senderName: 'VERÓNICA',
                type: 'text',
                text: 'Hola, buenas tardes! Un turno con la Dra. Burgoa',
                timestamp: '17-sep-26 12:02:15'
            }
        ]
    },
    {
        id: '3CMJGW',
        contactName: 'Anytapri',
        phone: '5492645987654',
        channel: 'WHATSAPP',
        channelNumber: '5492645825637',
        status: 'sin_asignar',
        unread: true,
        lastMessage: 'Hola estoy en la pagina web y quiero hacer una consulta sobre laboratorio',
        timeAgo: 'hace 22 minutos',
        department: 'Atención al cliente',
        assignedTo: null,
        assignedToName: null,
        assignedAt: null,
        lastResponder: 'Paciente',
        lastResponderRole: 'patient',
        lastResponseAt: 'hace 22 min',
        chatbot: '#betina-encuesta2',
        avatarColor: '#D97706',
        tags: ['Web Inquiry', 'Laboratorio'],
        customFields: {
            dni: '35123987',
            dniFotoUrl: null,
            turnosDiaHora: 'Urgente',
            pedidoMedicoFoto: 'Pendiente',
            pacienteNombre: 'Ana P.',
            pacienteContacto: '5492645987654',
            obraSocial: 'OSDE 210'
        },
        messages: [
            {
                id: 'ma1',
                sender: 'patient',
                senderName: 'Anytapri',
                type: 'text',
                text: 'Hola estoy en la pagina web y quiero hacer una consulta sobre laboratorio',
                timestamp: '17-sep-26 12:01:40'
            }
        ]
    },
    {
        id: '3CMJW6',
        contactName: 'Luchi',
        phone: '5492644876543',
        channel: 'WHATSAPP',
        channelNumber: '5492645825637',
        status: 'sin_asignar',
        unread: true,
        lastMessage: 'hola',
        timeAgo: 'hace 24 minutos',
        department: 'Atención al cliente',
        assignedTo: null,
        assignedToName: null,
        assignedAt: null,
        lastResponder: 'Paciente',
        lastResponderRole: 'patient',
        lastResponseAt: 'hace 24 min',
        chatbot: '#betina-encuesta2',
        avatarColor: '#10B981',
        tags: ['Recepción'],
        customFields: {
            dni: '41987654',
            dniFotoUrl: null,
            turnosDiaHora: '—',
            pedidoMedicoFoto: '—',
            pacienteNombre: 'Luciana F.',
            pacienteContacto: '5492644876543',
            obraSocial: 'Particular'
        },
        messages: [
            {
                id: 'ml1',
                sender: 'patient',
                senderName: 'Luchi',
                type: 'text',
                text: 'hola',
                timestamp: '17-sep-26 11:59:12'
            }
        ]
    },
    {
        id: '3CMJTQ',
        contactName: 'Cecilia Paez',
        phone: '5492645345678',
        channel: 'WHATSAPP',
        channelNumber: '5492645825637',
        status: 'sin_asignar',
        unread: true,
        lastMessage: 'Hola Buenos dias Solicito turno para chequeo ginec',
        timeAgo: 'hace 15 minutos',
        department: 'Atención al cliente',
        assignedTo: null,
        assignedToName: null,
        assignedAt: null,
        lastResponder: 'Paciente',
        lastResponderRole: 'patient',
        lastResponseAt: 'hace 15 min',
        chatbot: '#betina-encuesta2',
        avatarColor: '#0284C7',
        tags: ['Ginecología', 'Chequeo'],
        customFields: {
            dni: '29876543',
            dniFotoUrl: null,
            turnosDiaHora: 'Próxima semana por la tarde',
            pedidoMedicoFoto: '—',
            pacienteNombre: 'Cecilia Paez',
            pacienteContacto: '5492645345678',
            obraSocial: 'Sancor Salud'
        },
        messages: [
            {
                id: 'mc1',
                sender: 'patient',
                senderName: 'Cecilia Paez',
                type: 'text',
                text: 'Hola Buenos dias Solicito turno para chequeo ginec',
                timestamp: '17-sep-26 12:08:44'
            }
        ]
    },
    {
        id: '3CMIT9',
        contactName: 'Valeria Mercado',
        phone: '5492646234567',
        channel: 'WHATSAPP',
        channelNumber: '5492645825637',
        status: 'sin_asignar',
        unread: true,
        lastMessage: 'Buen dia',
        timeAgo: 'hace 49 minutos',
        department: 'Atención al cliente',
        assignedTo: null,
        assignedToName: null,
        assignedAt: null,
        lastResponder: 'Paciente',
        lastResponderRole: 'patient',
        lastResponseAt: 'hace 49 min',
        chatbot: '#betina-encuesta2',
        avatarColor: '#6366F1',
        tags: ['Consultas'],
        customFields: {
            dni: '36543210',
            dniFotoUrl: null,
            turnosDiaHora: '—',
            pedidoMedicoFoto: '—',
            pacienteNombre: 'Valeria Mercado',
            pacienteContacto: '5492646234567',
            obraSocial: 'Medifé'
        },
        messages: [
            {
                id: 'mv1',
                sender: 'patient',
                senderName: 'Valeria Mercado',
                type: 'text',
                text: 'Buen dia',
                timestamp: '17-sep-26 11:34:02'
            }
        ]
    }
];

export const SYSTEM_KNOWN_USERS = [
    { usuario: 'lmarinero', nombre: 'Lucas Marinero', rol: 'Supervisor General / Sistemas', avatar: 'LM' },
    { usuario: 'daniela', nombre: 'Daniela Calivar', rol: 'Atención al Paciente / Contact Center', avatar: 'DC' },
    { usuario: 'sofia', nombre: 'Sofia Morales', rol: 'Atención al Paciente / Contact Center', avatar: 'SM' },
    { usuario: 'virginia', nombre: 'Virginia Quiroga', rol: 'Atención al Paciente / Contact Center', avatar: 'VQ' },
    { usuario: 'erica', nombre: 'Erica Gonzalez', rol: 'Atención al Paciente / Contact Center', avatar: 'EG' },
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
    return chat.assignedTo.toLowerCase() !== currentAgentId.toLowerCase();
}

/**
 * Asigna una conversación a una agente.
 * Si ya está asignada a otra persona, arroja un error para evitar colisiones.
 */
export function assignChatExclusively(chat, targetAgent, currentUser) {
    const isSupervisor = MASTER_ADMINS.includes((currentUser?.usuario || '').toLowerCase().trim());
    
    // Si ya está asignado a otra persona y no es supervisor
    if (chat.assignedTo && chat.assignedTo.toLowerCase() !== targetAgent.id.toLowerCase() && !isSupervisor) {
        const currentOwner = getAgentById(chat.assignedTo);
        throw new Error(`Esta conversación ya está asignada a ${currentOwner.name}. Mientras la tenga asignada, nadie más puede asociársela.`);
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    const updatedChat = {
        ...chat,
        status: 'abierto',
        assignedTo: targetAgent.id,
        assignedToName: targetAgent.name,
        assignedAt: now.toISOString(),
        messages: [
            ...(chat.messages || []),
            {
                id: 'sys_' + Date.now(),
                sender: 'system',
                text: `${targetAgent.name} se asignó la conversación exclusivamente`,
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

    const updatedChat = {
        ...chat,
        status: 'abierto',
        assignedTo: toAgent.id,
        assignedToName: toAgent.name,
        assignedAt: now.toISOString(),
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
export async function fetchLiveAndDemoChats(existingChats = INITIAL_CHATS) {
    try {
        // Traer últimos 100 mensajes de whatsapp_messages
        const { data: realMessages, error } = await supabase
            .from('whatsapp_messages')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error || !realMessages || realMessages.length === 0) {
            return existingChats;
        }

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

        // Clonar chats existentes
        let mergedChats = [...existingChats];

        // Para cada teléfono real detectado
        Object.entries(realChatsMap).forEach(([phone, messages]) => {
            // Ordenar cronológicamente (asc)
            const chronological = [...messages].reverse();
            const lastMsg = messages[0]; // el más reciente

            const existingIdx = mergedChats.findIndex(c => normalizeArgentinePhone(c.phone) === phone);

            // Determinar último en responder
            let lastRespName = 'Paciente';
            let lastRespRole = 'patient';
            if (lastMsg.direction === 'outgoing') {
                const raw = lastMsg.raw_payload;
                lastRespName = lastMsg.sender_name || (raw?.agent ? getAgentById(raw.agent).name : 'Sanatorio');
                lastRespRole = 'agent';
            }

            // Mapear mensajes a formato Contact Center
            const formattedMessages = chronological.map(m => ({
                id: 'real_' + m.id,
                sender: m.direction === 'incoming' ? 'patient' : (m.direction === 'note' ? 'note' : 'agent'),
                senderName: m.direction === 'incoming' ? (m.sender_name || 'Paciente') : (m.sender_name || 'Sanatorio Argentino'),
                senderAgentId: m.raw_payload?.agent || (m.sender_name ? m.sender_name.toLowerCase() : null),
                agentRole: m.direction === 'incoming' ? null : 'Atención al Paciente',
                tagColor: m.direction === 'incoming' ? null : (getAgentById(m.sender_name)?.color || '#0284C7'),
                type: m.media_type || 'text',
                text: m.content || '',
                mediaUrl: m.media_url || null,
                isNote: m.direction === 'note',
                timestamp: new Date(m.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
            }));

            if (existingIdx >= 0) {
                // Actualizar chat existente con mensajes reales
                mergedChats[existingIdx] = {
                    ...mergedChats[existingIdx],
                    lastMessage: lastMsg.content || `[${lastMsg.media_type}]`,
                    timeAgo: 'hace instantes',
                    lastResponder: lastRespName,
                    lastResponderRole: lastRespRole,
                    messages: formattedMessages
                };
            } else {
                // Crear nueva conversación en vivo en la bandeja "sin_asignar" (ej: el teléfono de prueba del usuario)
                const newRealChat = {
                    id: 'REAL_' + phone.slice(-6),
                    contactName: lastMsg.sender_name || `Paciente (${phone.slice(-4)})`,
                    phone: phone,
                    channel: 'WHATSAPP',
                    channelNumber: '5492645825637',
                    status: 'sin_asignar',
                    unread: true,
                    lastMessage: lastMsg.content || `[${lastMsg.media_type}]`,
                    timeAgo: 'hace un momento',
                    department: 'Atención al cliente',
                    assignedTo: null,
                    assignedToName: null,
                    assignedAt: null,
                    lastResponder: lastRespName,
                    lastResponderRole: lastRespRole,
                    lastResponseAt: 'hace un momento',
                    chatbot: '#numero-de-prueba',
                    avatarColor: '#059669',
                    tags: ['En Vivo', 'WhatsApp Real'],
                    customFields: {
                        dni: 'A verificar',
                        turnosDiaHora: 'Consulta entrante',
                        pedidoMedicoFoto: lastMsg.media_type !== 'text' ? 'Adjunto en chat' : 'No adjuntado',
                        pacienteNombre: lastMsg.sender_name || 'Paciente',
                        pacienteContacto: phone,
                        obraSocial: 'A consultar'
                    },
                    messages: formattedMessages
                };
                mergedChats = [newRealChat, ...mergedChats];
            }
        });

        return mergedChats;
    } catch (err) {
        console.warn('Error al mezclar mensajes reales:', err);
        return existingChats;
    }
}

/**
 * Envía un mensaje desde la consola de Contact Center:
 * - Si es nota privada: se guarda en BD para uso interno sin enviar a WhatsApp.
 * - Si es mensaje público: se despacha por BuilderBot al teléfono y se guarda en BD.
 * Deja tag con el agente que respondió y actualiza lastResponder.
 */
export async function sendContactCenterMessage({ chat, text, isNote, activeAgent, currentUser }) {
    const isLocked = isChatLockedForUser(chat, activeAgent.id, currentUser);
    if (isLocked) {
        throw new Error(`No puedes responder. Esta conversación está asignada exclusivamente a ${chat.assignedToName || chat.assignedTo}.`);
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const normalizedPhone = normalizeArgentinePhone(chat.phone);

    // 1. Guardar en Supabase whatsapp_messages
    try {
        const { error: insertError } = await supabase
            .from('whatsapp_messages')
            .insert({
                phone: normalizedPhone,
                direction: isNote ? 'note' : 'outgoing',
                content: text,
                media_type: 'text',
                sender_name: activeAgent.name,
                is_read: true,
                raw_payload: {
                    source: 'contact_center',
                    agent: activeAgent.id,
                    agentName: activeAgent.name,
                    isNote: !!isNote
                }
            });

        if (insertError) {
            console.warn('Error al insertar en whatsapp_messages:', insertError.message);
        }
    } catch (err) {
        console.warn('Error en persistencia Supabase:', err);
    }

    // 2. Si NO es nota privada, despachar vía BuilderBot Edge Function
    if (!isNote && normalizedPhone) {
        try {
            await sendWhatsAppMessage({
                content: text,
                number: normalizedPhone
            });
            console.log(`[contact-center] ✅ Mensaje despachado a BuilderBot: ${normalizedPhone} por ${activeAgent.name}`);
        } catch (bbError) {
            console.error('[contact-center] Error despachando a BuilderBot:', bbError);
            // Non-fatal para testing, pero advertir
        }
    }

    // 3. Crear mensaje formateado para actualizar estado local
    const newMsg = {
        id: 'msg_' + Date.now(),
        sender: isNote ? 'note' : 'agent',
        senderName: activeAgent.name,
        senderAgentId: activeAgent.id,
        agentRole: activeAgent.role || 'Atención al Paciente',
        tagColor: activeAgent.color,
        type: 'text',
        text,
        isNote: !!isNote,
        timestamp: timeStr
    };

    const updatedChat = {
        ...chat,
        lastMessage: isNote ? `[Nota interna] ${text}` : text,
        timeAgo: 'hace unos segundos',
        lastResponder: activeAgent.name,
        lastResponderRole: 'agent',
        lastResponseAt: timeStr,
        messages: [...(chat.messages || []), newMsg]
    };

    return { newMsg, updatedChat };
}
