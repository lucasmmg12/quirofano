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
    // Get all messages ordered by created_at DESC
    const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('phone, content, direction, sender_name, is_read, created_at, media_type')
        .order('created_at', { ascending: false });

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
                senderName: msg.sender_name || '',
                unreadCount: 0,
            };
        }
        if (msg.direction === 'incoming' && !msg.is_read) {
            map[msg.phone].unreadCount += 1;
        }
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
        .eq('is_read', false);

    if (error) {
        console.error('Error marking messages as read:', error);
    }
}

/**
 * Obtiene conteo de mensajes no leídos por teléfono
 * Retorna: { "5492645438114": 3, "5492641234567": 1 }
 */
export async function fetchUnreadCounts() {
    const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('phone')
        .eq('direction', 'incoming')
        .eq('is_read', false);

    if (error) {
        console.error('Error fetching unread counts:', error);
        return {};
    }

    // Contar por teléfono
    const counts = {};
    (data || []).forEach(msg => {
        counts[msg.phone] = (counts[msg.phone] || 0) + 1;
    });
    return counts;
}

/**
 * Guarda un mensaje saliente en la tabla (cuando enviamos desde el panel)
 */
export async function saveOutgoingMessage({ phone, content, mediaUrl, mediaType }) {
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
                callback(payload.new);
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}
