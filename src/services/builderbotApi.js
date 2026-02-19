/**
 * BuilderBot WhatsApp API Service
 * Envía mensajes a través de Supabase RPC → pg_net → BuilderBot
 * Esto evita problemas de CORS al hacer la llamada server-side
 */

import { supabase } from '../lib/supabase';

/**
 * Normaliza un número argentino para WhatsApp
 * Input: 2645438114 → Output: 5492645438114
 * Maneja: con/sin 0, con/sin 15, con/sin 549
 * Código de área por defecto: 264 (San Juan)
 */
const DEFAULT_AREA_CODE = '264';

export function normalizeArgentinePhone(phone) {
    if (!phone) return '';
    // Solo dígitos
    let clean = phone.replace(/\D/g, '');

    // Ya tiene formato internacional completo
    if (clean.startsWith('549') && clean.length >= 12) return clean;

    // Tiene código de país sin 9 (54...)
    if (clean.startsWith('54') && !clean.startsWith('549')) {
        clean = clean.slice(2);
    }

    // Quitar 0 inicial (códigos de área: 0264...)
    if (clean.startsWith('0')) {
        clean = clean.slice(1);
    }

    // Caso especial: empieza con 15 sin código de área (155438114 → 2645438114)
    if (clean.startsWith('15') && clean.length <= 10) {
        clean = DEFAULT_AREA_CODE + clean.slice(2);
        return '549' + clean;
    }

    // Quitar 15 después del código de área (264-15-XXXXXX → 264XXXXXX)
    if (clean.length > 10 && clean.includes('15')) {
        const idx = clean.indexOf('15');
        if (idx >= 2 && idx <= 4) {
            clean = clean.slice(0, idx) + clean.slice(idx + 2);
        }
    }

    return '549' + clean;
}

/**
 * Envía un mensaje de WhatsApp via Supabase RPC (server-side, sin CORS)
 * @param {Object} params
 * @param {string} params.content - Contenido del mensaje
 * @param {string} params.number - Número de teléfono destino
 * @param {string} [params.mediaUrl] - URL opcional de media adjunta
 * @returns {Promise<Object>} Respuesta
 */
export async function sendWhatsAppMessage({ content, number, mediaUrl }) {
    try {
        const normalizedNumber = normalizeArgentinePhone(number);
        const { data, error } = await supabase.rpc('send_whatsapp', {
            p_content: content,
            p_number: normalizedNumber,
            p_media_url: mediaUrl || null,
        });

        if (error) throw error;

        if (data && !data.success) {
            throw new Error(data.error || 'Error desconocido al enviar WhatsApp');
        }

        return data;
    } catch (error) {
        console.error('Error enviando WhatsApp:', error);
        throw error;
    }
}

/**
 * Genera el texto formateado del pedido para enviar por WhatsApp
 * @param {Object} patientData - Datos del paciente
 * @param {Array} cartItems - Items del carrito
 * @returns {string} Texto formateado
 */
export function formatOrderForWhatsApp(patientData, cartItems) {
    const header = `🏥 *SANATORIO ARGENTINO*\n📋 *PEDIDO MÉDICO*\n${'─'.repeat(30)}`;

    const patient = [
        `👤 *Paciente:* ${patientData.nombre || 'Sin especificar'}`,
        `🏛️ *Obra Social:* ${patientData.obraSocial || 'Sin especificar'}`,
        `🔢 *N° Afiliado:* ${patientData.afiliado || 'Sin especificar'}`,
        `🩺 *Diagnóstico:* ${patientData.diagnostico || 'Sin especificar'}`,
        `📅 *Fecha:* ${patientData.fecha || 'Sin especificar'}`,
        `👨‍⚕️ *Médico:* ${patientData.medico || 'Sin especificar'}`,
    ].join('\n');

    const items = cartItems.map((item, i) =>
        `${i + 1}. [${item.code}] ${item.name} × ${item.quantity} (${item.date || patientData.fecha})`
    ).join('\n');

    const footer = `\n${'─'.repeat(30)}\n📌 Total: ${cartItems.length} práctica(s)\n🖨️ Generado por Sistema ADM-QUI`;

    return `${header}\n\n${patient}\n\n📋 *Prácticas solicitadas:*\n${items}${footer}`;
}
