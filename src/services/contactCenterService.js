/**
 * contactCenterService.js
 * Servicio de gestión de datos, conversaciones y control de acceso para Contact Center (AsisteClick Demo)
 * en Sanatorio Argentino.
 */
import { supabase } from '../lib/supabase';
import { getConfigValue, updateConfig } from './configService';

const STORAGE_ALLOWED_USERS_KEY = 'sa_contact_center_allowed_users';
const CONFIG_KEY = 'contact_center_allowed_users';

// Administradores con acceso maestro permanente
export const MASTER_ADMINS = ['lmarinero', 'admin'];

/**
 * Determina si un usuario tiene autorización para acceder al Contact Center.
 * Por regla: 'lmarinero' (y administradores maestros) siempre tienen acceso.
 * El resto requiere haber sido explícitamente aprobado por lmarinero.
 */
export function canUserAccessContactCenter(user, allowedUsersList = null) {
    if (!user) return false;
    const username = (user.usuario || user.email || '').toLowerCase().trim().split('@')[0];
    
    // Master admin siempre tiene acceso
    if (MASTER_ADMINS.includes(username)) {
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
 * Obtiene la lista de usuarios autorizados desde Supabase app_config (con fallback en localStorage)
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

    // Fallback a localStorage
    try {
        const cached = localStorage.getItem(STORAGE_ALLOWED_USERS_KEY);
        if (cached) {
            return JSON.parse(cached);
        }
    } catch {
        // ignore
    }

    return ['lmarinero'];
}

/**
 * Actualiza la lista de usuarios autorizados (solo permitido para lmarinero)
 */
export async function updateAllowedUsers(usersList, updatedBy = 'lmarinero') {
    const cleanList = Array.from(new Set(['lmarinero', ...usersList.map(u => u.toLowerCase().trim())]));
    
    // Persistir localmente
    localStorage.setItem(STORAGE_ALLOWED_USERS_KEY, JSON.stringify(cleanList));

    // Persistir en app_config
    try {
        await updateConfig(CONFIG_KEY, cleanList);
    } catch (err) {
        console.warn('No se pudo persistir en app_config (se guardó en local):', err);
    }

    return cleanList;
}

// =========================================================================
// MOCK DATA DE ALTA FIDELIDAD BASADO EN LAS CAPTURAS DE ASISTECLICK
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
        assignedTo: 'Daniela',
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
                text: '17-sep-26 12:23:55 Betina asignó la conversación a Atención al cliente',
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
                text: 'Hace unos segundos Daniela se asignó la conversación a sí mismo',
                timestamp: '17-sep-26 12:24:30'
            },
            {
                id: 'm5',
                sender: 'agent',
                senderName: 'Daniela',
                agentRole: 'Sanatorio Argentino',
                type: 'text',
                text: 'Hola soy Daniela de Sanatorio Argentino, gracias por tu contacto. Te escribo por tu consulta realizada, Usted debe comunicarse con citología al 2644552540.',
                timestamp: 'Hace unos segundos'
            },
            {
                id: 'm6',
                sender: 'agent',
                senderName: 'Daniela',
                agentRole: 'Sanatorio Argentino',
                type: 'text',
                text: '¡Gracias por comunicarte con el Sanatorio Argentino! 🏥 Damos por finalizada esta conversación.\nSi nuestra atención te fue de ayuda hoy, nos sumarías un montón dejándonos 5 estrellas aquí: https://oqdslqa.s.gy/sede1 ⭐\n¡Que tengas un excelente día!',
                timestamp: 'Hace unos segundos'
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
    { usuario: 'lmarinero', nombre: 'Lucas Marinero', rol: 'Administrador General / Sistemas', avatar: 'LM' },
    { usuario: 'daniela', nombre: 'Daniela Calivar', rol: 'Atención al Cliente / Contact Center', avatar: 'DC' },
    { usuario: 'jcorrea', nombre: 'Javier Correa', rol: 'Jefatura de Facturación y Altas', avatar: 'JC' },
    { usuario: 'frojo', nombre: 'Florencia Rojo', rol: 'Auditoría Médica y Gobernanza', avatar: 'FR' },
    { usuario: 'soribarale', nombre: 'Soraya Ibarzabal', rol: 'Gestión de Activos y Equipamiento', avatar: 'SI' },
    { usuario: 'marcela', nombre: 'Marcela Quiroga', rol: 'Emisión y Despacho de Pedidos', avatar: 'MQ' },
    { usuario: 'recepcion', nombre: 'Recepción Central', rol: 'Admisión y Atención Presencial', avatar: 'RC' }
];
