/**
 * Meta WhatsApp Template Service — Sistema ADM-QUI
 * Gestiona el listado y envío de plantillas oficiales de Meta
 * via la Edge Function send-whatsapp (proxy server-side, sin CORS)
 */

import { supabase } from '../lib/supabase';

/**
 * Obtiene las plantillas oficiales de WhatsApp desde BuilderBot Cloud API
 * Usa la Edge Function como proxy para evitar CORS
 * @param {string} lineId — ID de la línea Meta (ej: 'line_meta')
 * @returns {Promise<Array>} — Lista de templates aprobadas
 */
export async function fetchMetaTemplates(lineId = 'line_b') {
    try {
        const { data, error } = await supabase.functions.invoke('send-whatsapp', {
            body: {
                action: 'list_templates',
                lineId,
            },
        });

        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Error desconocido');

        const templates = data.templates || [];
        // Ordenar: APPROVED primero, luego el resto (PENDING, REJECTED, etc.)
        const statusOrder = { APPROVED: 0, PENDING: 1, REJECTED: 2 };
        templates.sort((a, b) => {
            const orderA = statusOrder[a.status] ?? 3;
            const orderB = statusOrder[b.status] ?? 3;
            return orderA - orderB;
        });

        return templates;
    } catch (err) {
        console.error('[metaTemplateService] Error fetching templates:', err);
        throw err;
    }
}

/**
 * Envía una plantilla oficial de Meta WhatsApp vía Edge Function
 * @param {Object} params
 * @param {string} params.to — Número de destino (formato 549XXXXXXXXXX)
 * @param {string} params.templateName — Nombre de la plantilla aprobada
 * @param {string} [params.languageCode] — Código de idioma (default: 'es')
 * @param {Array} [params.components] — Componentes con variables dinámicas
 * @param {string} [params.lineId] — ID de la línea Meta (default: 'line_meta')
 * @returns {Promise<Object>} — Respuesta del envío
 */
export async function sendMetaTemplate({ to, templateName, languageCode = 'es', components, lineId = 'line_b' }) {
    try {
        const { data, error } = await supabase.functions.invoke('send-whatsapp', {
            body: {
                action: 'send_template',
                lineId,
                to,
                templateName,
                languageCode,
                components: components || undefined,
            },
        });

        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Error al enviar plantilla');

        return data;
    } catch (err) {
        console.error('[metaTemplateService] Error sending template:', err);
        throw err;
    }
}
