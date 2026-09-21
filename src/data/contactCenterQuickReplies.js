/**
 * contactCenterQuickReplies.js
 * Catálogo exclusivo de Atajos y Respuestas Rápidas para el CONTACT CENTER.
 * 
 * NOTA DE ARQUITECTURA:
 * Totalmente aislado del sistema de Control de Cirugías (ADM-QUI).
 * Optimizado para máxima velocidad y mínimo consumo de RAM con indexación O(1).
 */

import { supabase } from '../lib/supabase';

// Catálogo inmutable institucional precargado en memoria (0 ms latencia)
export const DEFAULT_QUICK_REPLIES = Object.freeze([
    // Saludos de agentes de Contact Center
    {
        id: 'dan',
        shortcut: 'dan',
        title: 'Saludo Daniela Aguilera',
        content: '¡Hola! Mi nombre es Daniela Aguilera de Sanatorio Argentino, ¿en qué puedo ayudarte hoy?',
        category: 'saludo',
        agentId: 'daguilera'
    },
    {
        id: 'dani',
        shortcut: 'dani',
        title: 'Saludo Daniela Aguilera (alt)',
        content: '¡Hola! Mi nombre es Daniela Aguilera de Sanatorio Argentino, ¿en qué puedo ayudarte hoy?',
        category: 'saludo',
        agentId: 'daguilera'
    },
    {
        id: 'vic',
        shortcut: 'vic',
        title: 'Saludo Victoria Jacques',
        content: '¡Hola! Mi nombre es Victoria Jacques de Sanatorio Argentino, ¿en qué puedo ayudarte hoy?',
        category: 'saludo',
        agentId: 'vjacques'
    },
    {
        id: 'vicky',
        shortcut: 'vicky',
        title: 'Saludo Victoria Jacques (alt)',
        content: '¡Hola! Mi nombre es Victoria Jacques de Sanatorio Argentino, ¿en qué puedo ayudarte hoy?',
        category: 'saludo',
        agentId: 'vjacques'
    },
    {
        id: 'sil',
        shortcut: 'sil',
        title: 'Saludo Silvina Olivier',
        content: '¡Hola! Mi nombre es Silvina Olivier de Sanatorio Argentino, ¿en qué puedo ayudarte hoy?',
        category: 'saludo',
        agentId: 'solivier'
    },
    {
        id: 'silvina',
        shortcut: 'silvina',
        title: 'Saludo Silvina Olivier (alt)',
        content: '¡Hola! Mi nombre es Silvina Olivier de Sanatorio Argentino, ¿en qué puedo ayudarte hoy?',
        category: 'saludo',
        agentId: 'solivier'
    },
    {
        id: 'emi',
        shortcut: 'emi',
        title: 'Saludo Emilce Leal',
        content: '¡Hola! Mi nombre es Emilce Leal de Sanatorio Argentino, ¿en qué puedo ayudarte hoy?',
        category: 'saludo',
        agentId: 'eleal'
    },
    {
        id: 'emilce',
        shortcut: 'emilce',
        title: 'Saludo Emilce Leal (alt)',
        content: '¡Hola! Mi nombre es Emilce Leal de Sanatorio Argentino, ¿en qué puedo ayudarte hoy?',
        category: 'saludo',
        agentId: 'eleal'
    },

    // Respuestas médicas de Contact Center (según panel institucional)
    {
        id: 'psiquiatras',
        shortcut: 'psiquiatras',
        title: 'Psiquiatras',
        content: '*En Sede 3 (calle San Luis 463 oeste)* - Dra Diaz Mariangeles: Consulta $90.000 atiende los dias miercoles, jueves y viernes - Dr Varea. Consulta $90.000 debe solicitar turno de manera personal en Sede 3 (calle San Luis 463 oeste) *En Sede Santa Fe (Santa Fe 263 este)* - Dra Vidal: Consulta $60.000 Atiende los dias martes en la mañana.',
        category: 'medicos'
    },
    {
        id: 'psi',
        shortcut: 'psi',
        title: 'Psiquiatras (corto)',
        content: '*En Sede 3 (calle San Luis 463 oeste)* - Dra Diaz Mariangeles: Consulta $90.000 atiende los dias miercoles, jueves y viernes - Dr Varea. Consulta $90.000 debe solicitar turno de manera personal en Sede 3 (calle San Luis 463 oeste) *En Sede Santa Fe (Santa Fe 263 este)* - Dra Vidal: Consulta $60.000 Atiende los dias martes en la mañana.',
        category: 'medicos'
    },
    {
        id: 'bosi',
        shortcut: 'bosi',
        title: 'Bosi',
        content: 'El Dr Bosi trabaja en Sede 2 (calle San Luis 433 oeste) los días miércoles de 17 a 20 hs, jueves de 9 a 12 hs y viernes de 13 a 16 hs.',
        category: 'medicos'
    },
    {
        id: 'depositolab',
        shortcut: 'depositolab',
        title: 'deposito lab',
        content: 'Su obra social requiere autorización previa en laboratorio, por lo tanto para evitar demoras en el circuito de chequeo le solicitaremos un depósito ($30.000) para realizar la extracción. Al finalizar el chequeo se verificara la autorización.',
        category: 'laboratorio'
    },
    {
        id: 'lab',
        shortcut: 'lab',
        title: 'deposito lab (corto)',
        content: 'Su obra social requiere autorización previa en laboratorio, por lo tanto para evitar demoras en el circuito de chequeo le solicitaremos un depósito ($30.000) para realizar la extracción. Al finalizar el chequeo se verificara la autorización.',
        category: 'laboratorio'
    },
    {
        id: 'despedida',
        shortcut: 'despedida',
        title: 'despedida',
        content: 'Apreciamos mucho tu tiempo y confianza. En este momento, damos por finalizada la conversación con nuestro agente. Si necesitas ayuda nuevamente, no dudes en escribirnos! ¡Gracias por elegirnos!',
        category: 'cierre'
    },
    {
        id: 'varea',
        shortcut: 'varea',
        title: 'Varea',
        content: 'Por nueva disposicion del Dr ya no se otorgan turnos por este medio. Debera solicitarlo de manera presencial por Sede 3 (calle San Luis 463 oeste). Disculpe.',
        category: 'medicos'
    },
    {
        id: 'stolsing',
        shortcut: 'stolsing',
        title: 'Stolsing Carlos',
        content: 'Para solicitar turnos con Dr Stolsing Carlos debe comunicarse al siguiente numero 2645470600 y sera atendido por su secretaria.',
        category: 'medicos'
    },

    // Atajos generales de Contact Center
    {
        id: 'turnos',
        shortcut: 'turnos',
        title: 'Gestión de Turnos',
        content: 'Para solicitar o reprogramar un turno, por favor indícanos el nombre del profesional o la especialidad que buscas, junto con tu franja horaria de preferencia.',
        category: 'general'
    },
    {
        id: 'autorizaciones',
        shortcut: 'autorizaciones',
        title: 'Autorizaciones y Cobertura',
        content: 'Para gestionar autorizaciones de estudios, por favor envíanos una foto nítida de la orden médica donde se observe el diagnóstico, firma y sello profesional, junto con tu DNI.',
        category: 'general'
    },
    {
        id: 'sedes',
        shortcut: 'sedes',
        title: 'Sedes y Direcciones',
        content: '*Nuestras Sedes en San Juan:*\n• Sede Central: San Luis 432 Oeste\n• Sede 2: San Luis 433 Oeste\n• Sede 3: San Luis 463 Oeste\n• Sede Santa Fe: Santa Fe 263 Este',
        category: 'general'
    }
]);

// Mapa O(1) en memoria para coincidencia ultra veloz por comando
const SHORTCUT_MAP = new Map();
DEFAULT_QUICK_REPLIES.forEach(item => {
    SHORTCUT_MAP.set(item.shortcut.toLowerCase(), item);
});

// Cache reactivo en memoria
let cachedQuickReplies = [...DEFAULT_QUICK_REPLIES];

/**
 * Busca coincidencia exacta O(1) de atajo (ej: "dan" -> objeto Daniela)
 */
export function findQuickReplyByShortcut(cmd) {
    if (!cmd) return null;
    const cleanCmd = cmd.replace(/^\//, '').toLowerCase().trim();
    return SHORTCUT_MAP.get(cleanCmd) || null;
}

/**
 * Obtiene la lista actual de respuestas rápidas
 */
export function getContactCenterQuickReplies() {
    return cachedQuickReplies;
}

/**
 * Filtra respuestas rápidas en memoria con cero asignación pesada
 */
export function filterQuickReplies(query) {
    if (!query) return cachedQuickReplies;
    const clean = query.replace(/^\//, '').toLowerCase().trim();
    if (!clean) return cachedQuickReplies;

    return cachedQuickReplies.filter(r => 
        r.shortcut.toLowerCase().startsWith(clean) ||
        r.shortcut.toLowerCase().includes(clean) ||
        r.title.toLowerCase().includes(clean) ||
        r.content.toLowerCase().includes(clean)
    );
}

/**
 * Sincroniza en background con la tabla contact_center_quick_replies si existe
 */
export async function syncQuickRepliesFromDb() {
    try {
        const { data, error } = await supabase
            .from('contact_center_quick_replies')
            .select('*')
            .order('title', { ascending: true });

        if (!error && data && data.length > 0) {
            const mapped = data.map(d => ({
                id: String(d.id || d.shortcut),
                shortcut: d.shortcut,
                title: d.title,
                content: d.content,
                category: d.category || 'general',
                agentId: d.agent_id || null
            }));

            // Actualizar mapa O(1)
            mapped.forEach(item => {
                SHORTCUT_MAP.set(item.shortcut.toLowerCase(), item);
            });

            cachedQuickReplies = mapped;
            return mapped;
        }
    } catch (e) {
        console.warn('[QuickReplies] Fallback a respuestas en memoria estática:', e);
    }
    return cachedQuickReplies;
}
