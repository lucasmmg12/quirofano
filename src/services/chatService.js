/**
 * Chat Service — Mini CRM WhatsApp
 * Maneja la lectura/escritura de mensajes en whatsapp_messages
 */

import { supabase } from '../lib/supabase';
import { normalizeArgentinePhone } from './builderbotApi';

/**
 * Obtiene lista de conversaciones agrupadas por teléfono.
 * Retorna: [{ phone, lastMessage, lastDate, unreadCount, senderName, direction }]
 */
export async function fetchConversations() {
    // Get messages excluding line_recepciones (sistema Recepciones separado)
    const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('phone, content, direction, sender_name, is_read, created_at, media_type, line_id')
        .or('line_id.in.(line_a,line_b,line_c),line_id.is.null')
        .order('created_at', { ascending: false })
        .limit(50000);

    if (error) {
        console.error('Error fetching conversations:', error);
        throw error;
    }

    // Group by phone — keep first (latest) as preview
    const map = {};
    (data || []).forEach(msg => {
        if (!map[msg.phone]) {
            map[msg.phone] = {
                phone: msg.phone,
                lastMessage: msg.media_type !== 'text' ? `📎 ${msg.media_type}` : (msg.content || ''),
                lastDate: msg.created_at,
                direction: msg.direction,
                senderName: '',
                unreadCount: 0,
                usedLines: new Set(),
            };
        }
        // Track all lines used for this phone
        if (msg.line_id) {
            map[msg.phone].usedLines.add(msg.line_id);
        }
        // Prefer sender_name from incoming messages (outgoing says "Sistema ADM-QUI")
        if (msg.direction === 'incoming' && msg.sender_name && !map[msg.phone].senderName) {
            map[msg.phone].senderName = msg.sender_name;
        }
        if (msg.direction === 'incoming' && !msg.is_read) {
            map[msg.phone].unreadCount += 1;
        }
    });

    // Convert Sets to Arrays for serialization
    Object.values(map).forEach(conv => {
        conv.usedLines = [...conv.usedLines];
    });

    // Sort by lastDate DESC
    return Object.values(map).sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate));
}

/**
 * Obtiene todos los mensajes de un teléfono, ordenados cronológicamente
 */
export async function fetchMessages(phone) {
    const normalized = normalizeArgentinePhone(phone);
    if (!normalized) return [];

    const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('phone', normalized)
        .or('line_id.in.(line_a,line_b,line_c),line_id.is.null')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching messages:', error);
        throw error;
    }
    return data || [];
}

/**
 * Marca todos los mensajes incoming de un teléfono como leídos
 */
export async function markAsRead(phone) {
    const normalized = normalizeArgentinePhone(phone);
    if (!normalized) return;

    const { error } = await supabase
        .from('whatsapp_messages')
        .update({ is_read: true })
        .eq('phone', normalized)
        .eq('direction', 'incoming')
        .eq('is_read', false)
        .or('line_id.in.(line_a,line_b,line_c),line_id.is.null');

    if (error) {
        console.error('Error marking messages as read:', error);
    }
}

/**
 * Marca TODOS los mensajes incoming no leídos como leídos (bulk)
 */
export async function markAllAsRead() {
    const { error } = await supabase
        .from('whatsapp_messages')
        .update({ is_read: true })
        .eq('direction', 'incoming')
        .eq('is_read', false)
        .or('line_id.in.(line_a,line_b,line_c),line_id.is.null');

    if (error) {
        console.error('Error marking all messages as read:', error);
        throw error;
    }
}

/**
 * Obtiene conteo de mensajes no leídos por teléfono
 * Retorna: { "5492645438114": 3, "5492641234567": 1 }
 * 
 * NOTA: Re-normaliza los phones con normalizeArgentinePhone para garantizar
 * consistencia con el match que hace SurgeryPanel (que también usa esa función).
 * Esto soluciona mismatch cuando el webhook guardó el phone en un formato
 * ligeramente diferente (ej: con 15 interno incluido, más de 13 dígitos, etc.)
 */
export async function fetchUnreadCounts() {
    const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('phone')
        .eq('direction', 'incoming')
        .eq('is_read', false)
        .or('line_id.in.(line_a,line_b,line_c),line_id.is.null')
        .limit(5000);

    if (error) {
        console.error('Error fetching unread counts:', error);
        return {};
    }

    // Contar por teléfono — re-normalizar para consistencia con el frontend
    const counts = {};
    (data || []).forEach(msg => {
        const normalizedPhone = normalizeArgentinePhone(msg.phone);
        const key = normalizedPhone || msg.phone;
        counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
}

/**
 * Guarda un mensaje saliente en la tabla (cuando enviamos desde el panel)
 */
export async function saveOutgoingMessage({ phone, content, mediaUrl, mediaType, lineId }) {
    const normalized = normalizeArgentinePhone(phone);
    if (!normalized) return null;

    const { data, error } = await supabase
        .from('whatsapp_messages')
        .insert({
            phone: normalized,
            direction: 'outgoing',
            content: content || '',
            media_url: mediaUrl || null,
            media_type: mediaType || 'text',
            sender_name: 'Sistema ADM-QUI',
            is_read: true,
            line_id: lineId || null,
        })
        .select()
        .single();

    if (error) {
        console.error('Error saving outgoing message:', error);
        throw error;
    }
    return data;
}

/**
 * Suscribe a cambios en tiempo real en whatsapp_messages
 * para un teléfono específico. Llama callback cuando llega un nuevo mensaje.
 * Retorna función de cleanup para desuscribirse.
 */
export function subscribeToMessages(phone, callback) {
    const normalized = normalizeArgentinePhone(phone);
    if (!normalized) return () => { };

    const channel = supabase
        .channel(`chat-${normalized}`)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'whatsapp_messages',
                filter: `phone=eq.${normalized}`,
            },
            (payload) => {
                callback(payload.new);
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}

/**
 * Suscribe a TODOS los mensajes entrantes nuevos (para el badge global)
 * Retorna función de cleanup.
 */
export function subscribeToAllIncoming(callback) {
    const channel = supabase
        .channel('all-incoming')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'whatsapp_messages',
                filter: 'direction=eq.incoming',
            },
            (payload) => {
                // Excluir mensajes de line_recepciones (sistema Recepciones separado)
                if (payload.new.line_id === 'line_recepciones') return;
                callback(payload.new);
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}

// ================================================
// CRM CONTACTS — Vinculación persistente teléfono ↔ paciente
// ================================================

/**
 * Obtiene todos los contactos CRM (mapeo phone → nombre/id_paciente)
 * @returns {Promise<Object>} — Mapa { phone: { nombre, id_paciente, dni, notas, assigned_line_id } }
 */
export async function fetchCrmContacts() {
    const { data, error } = await supabase
        .from('crm_contacts')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(10000);

    if (error) {
        console.error('Error fetching CRM contacts:', error);
        return {};
    }

    const map = {};
    (data || []).forEach(c => {
        map[c.phone] = c;
    });
    return map;
}

/**
 * Crea o actualiza un contacto CRM (upsert por phone)
 * @param {Object} contact — { phone, nombre, id_paciente?, dni?, notas? }
 */
export async function upsertCrmContact({ phone, nombre, id_paciente, dni, notas }) {
    const normalized = normalizeArgentinePhone(phone);
    if (!normalized || !nombre) return null;

    const { data, error } = await supabase
        .from('crm_contacts')
        .upsert({
            phone: normalized,
            nombre,
            id_paciente: id_paciente || null,
            dni: dni || null,
            notas: notas || null,
        }, { onConflict: 'phone' })
        .select()
        .single();

    if (error) {
        console.error('Error upserting CRM contact:', error);
        throw error;
    }
    return data;
}

/**
 * Obtiene un contacto CRM por teléfono
 */
export async function getCrmContactByPhone(phone) {
    const normalized = normalizeArgentinePhone(phone);
    if (!normalized) return null;

    const { data, error } = await supabase
        .from('crm_contacts')
        .select('*')
        .eq('phone', normalized)
        .maybeSingle();

    if (error) {
        console.error('Error fetching CRM contact:', error);
        return null;
    }
    return data;
}

// ================================================
// WHATSAPP LINES — Sistema dual de líneas
// ================================================

/**
 * Obtiene todas las líneas WhatsApp disponibles
 * @returns {Promise<Array>} — [{ id, label, phone, is_active, color, icon }]
 */
export async function fetchWhatsAppLines() {
    const { data, error } = await supabase
        .from('whatsapp_lines')
        .select('id, label, phone, is_active, color, icon')
        .eq('is_active', true)
        .in('id', ['line_a', 'line_b', 'line_c'])
        .order('id', { ascending: true });

    if (error) {
        console.error('Error fetching WhatsApp lines:', error);
        return [];
    }
    return data || [];
}

/**
 * Obtiene la línea asignada a un paciente por su teléfono
 * @param {string} phone - Teléfono del paciente
 * @returns {Promise<string|null>} — line_id o null
 */
export async function getAssignedLine(phone) {
    const normalized = normalizeArgentinePhone(phone);
    if (!normalized) return null;

    const { data, error } = await supabase
        .from('crm_contacts')
        .select('assigned_line_id')
        .eq('phone', normalized)
        .maybeSingle();

    if (error || !data) return null;
    return data.assigned_line_id;
}

/**
 * Asigna una línea WhatsApp a un paciente
 * @param {string} phone - Teléfono del paciente
 * @param {string} lineId - ID de la línea ('line_a' o 'line_b')
 * @returns {Promise<void>}
 */
export async function assignLine(phone, lineId) {
    const normalized = normalizeArgentinePhone(phone);
    if (!normalized || !lineId) return;

    const { error } = await supabase
        .from('crm_contacts')
        .update({ assigned_line_id: lineId })
        .eq('phone', normalized);

    if (error) {
        console.error('Error assigning line:', error);
        throw error;
    }
}

