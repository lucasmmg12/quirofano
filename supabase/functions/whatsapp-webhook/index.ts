// Supabase Edge Function: whatsapp-webhook
// Recibe eventos de BuilderBot y guarda mensajes en whatsapp_messages
// URL para colocar en BuilderBot: https://hakysnqiryimxbwdslwe.supabase.co/functions/v1/whatsapp-webhook

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(async (req) => {
    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    // Solo aceptar POST
    if (req.method !== 'POST') {
        return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    try {
        const payload = await req.json();
        const { eventName, data } = payload;

        console.log(`[webhook] Evento recibido: ${eventName}`, JSON.stringify(data));

        // Solo procesar mensajes incoming y outgoing
        if (eventName !== 'message.incoming' && eventName !== 'message.outgoing') {
            return new Response(
                JSON.stringify({ ok: true, skipped: true, event: eventName }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Crear cliente Supabase con service_role para bypass de RLS
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const direction = eventName === 'message.incoming' ? 'incoming' : 'outgoing';

        // Extraer datos según la dirección
        // incoming: { body, name, from, attachment, projectId }
        // outgoing: { answer, from, attachment, projectId }
        const content = direction === 'incoming' ? (data.body || '') : (data.answer || '');
        const phone = normalizePhone(data.from || '');
        const senderName = data.name || null;
        const attachments = data.attachment || [];

        // Determinar tipo de media
        let mediaUrl = null;
        let mediaType = 'text';

        if (attachments && attachments.length > 0) {
            // BuilderBot envía attachments como array de URLs o objetos
            const firstAttach = attachments[0];
            if (typeof firstAttach === 'string') {
                mediaUrl = firstAttach;
            } else if (firstAttach?.url) {
                mediaUrl = firstAttach.url;
            } else if (firstAttach?.payload?.url) {
                mediaUrl = firstAttach.payload.url;
            }

            // Inferir tipo por extensión o mime
            if (mediaUrl) {
                mediaType = inferMediaType(mediaUrl, firstAttach);
            }
        }

        // Insertar en la tabla
        const { error: insertError } = await supabase
            .from('whatsapp_messages')
            .insert({
                phone,
                direction,
                content: content || (mediaUrl ? `[${mediaType}]` : ''),
                media_url: mediaUrl,
                media_type: mediaType,
                sender_name: senderName,
                is_read: direction === 'outgoing', // Outgoing ya están "leídos"
                raw_payload: payload,
            });

        if (insertError) {
            console.error('[webhook] Error insertando mensaje:', insertError);
            return new Response(
                JSON.stringify({ ok: false, error: insertError.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log(`[webhook] Mensaje ${direction} guardado — phone: ${phone}`);

        return new Response(
            JSON.stringify({ ok: true, direction, phone }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('[webhook] Error fatal:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});

/**
 * Normaliza número argentino para consistencia
 * Siempre retorna formato 549XXXXXXXXXX
 */
function normalizePhone(phone) {
    if (!phone) return '';
    let clean = phone.replace(/\D/g, '');

    if (clean.startsWith('549') && clean.length >= 12) return clean;
    if (clean.startsWith('54') && !clean.startsWith('549')) {
        clean = clean.slice(2);
    }
    if (clean.startsWith('0')) {
        clean = clean.slice(1);
    }
    if (clean.startsWith('15') && clean.length <= 10) {
        clean = '264' + clean.slice(2);
        return '549' + clean;
    }
    if (clean.length > 10 && clean.includes('15')) {
        const idx = clean.indexOf('15');
        if (idx >= 2 && idx <= 4) {
            clean = clean.slice(0, idx) + clean.slice(idx + 2);
        }
    }

    return '549' + clean;
}

/**
 * Infiere el tipo de media según la URL o metadata del attachment
 */
function inferMediaType(url, attachment) {
    const lower = url.toLowerCase();

    if (attachment?.type) {
        const type = attachment.type.toLowerCase();
        if (type.includes('audio')) return 'audio';
        if (type.includes('image')) return 'image';
        if (type.includes('video')) return 'video';
        if (type.includes('sticker')) return 'sticker';
        if (type.includes('document')) return 'document';
    }

    // Por extensión
    if (/\.(jpg|jpeg|png|gif|webp|bmp)/.test(lower)) return 'image';
    if (/\.(mp3|ogg|opus|wav|m4a|aac)/.test(lower)) return 'audio';
    if (/\.(mp4|mov|avi|mkv|webm)/.test(lower)) return 'video';
    if (/\.(pdf|doc|docx|xls|xlsx|csv|txt)/.test(lower)) return 'document';
    if (/\.(webp)/.test(lower) && attachment?.type === 'sticker') return 'sticker';

    return 'text';
}
