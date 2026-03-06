// Supabase Edge Function: whatsapp-webhook
// Recibe eventos de BuilderBot y guarda mensajes en whatsapp_messages
// PERSISTENCIA DE MEDIA: Descarga archivos de URLs temporales y los sube a Supabase Storage
// URL para colocar en BuilderBot: https://hakysnqiryimxbwdslwe.supabase.co/functions/v1/whatsapp-webhook

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Bucket de Supabase Storage para media persistente
const STORAGE_BUCKET = 'whatsapp-media';

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

        // Log completo del payload para debug (ver estructura de media)
        console.log(`[webhook] Evento: ${eventName}`, JSON.stringify(payload, null, 2));

        // Solo procesar mensajes incoming
        // Los outgoing se guardan desde el frontend via saveOutgoingMessage()
        // Procesar ambos causaba mensajes duplicados
        if (eventName !== 'message.incoming') {
            return new Response(
                JSON.stringify({ ok: true, skipped: true, event: eventName }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Crear cliente Supabase con service_role para bypass de RLS
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const direction = eventName === 'message.incoming' ? 'incoming' : 'outgoing';

        // Extraer datos según la dirección
        const rawContent = direction === 'incoming' ? (data.body || '') : (data.answer || '');
        // Para incoming, data.from = who sent (paciente). 
        // Para outgoing, data.from = bot number, data.to = destinatario (paciente)
        const phone = normalizePhone(direction === 'incoming' ? (data.from || '') : (data.to || data.from || ''));
        const senderName = data.name || null;

        // =============================================
        // EXTRAER MEDIA — búsqueda exhaustiva en el payload
        // BuilderBot puede enviar media en múltiples formatos:
        //   - data.attachment (array de URLs o objetos)
        //   - data.media (URL directa o objeto)
        //   - data.message.imageMessage.url
        //   - data.message.audioMessage.url
        //   - data.message.videoMessage.url
        //   - data.message.documentMessage.url
        //   - data.message.stickerMessage.url
        //   - Contenido con patrón _event_media__ (ID interno, necesita resolverse)
        // =============================================
        let mediaUrl = null;
        let mediaType = 'text';

        // 1. PRIORIDAD: urlTempFile / urlsTempsFiles (BuilderBot Cloud guarda el archivo aquí)
        if (data.urlTempFile && typeof data.urlTempFile === 'string' && data.urlTempFile.startsWith('http')) {
            mediaUrl = data.urlTempFile;
        } else if (data.urlsTempsFiles && Array.isArray(data.urlsTempsFiles) && data.urlsTempsFiles.length > 0) {
            const first = data.urlsTempsFiles[0];
            if (typeof first === 'string' && first.startsWith('http')) {
                mediaUrl = first;
            }
        }

        // 2. Detectar tipo desde data.message (Baileys/WAWebJS message keys)
        if (data.message) {
            const msg = data.message;
            if (msg.imageMessage) mediaType = 'image';
            else if (msg.audioMessage) mediaType = 'audio';
            else if (msg.videoMessage) mediaType = 'video';
            else if (msg.stickerMessage) mediaType = 'sticker';
            else if (msg.documentMessage || msg.documentWithCaptionMessage) mediaType = 'document';
        }

        // 3. Si no tenemos URL aún, buscar en data.media
        if (!mediaUrl && data.media) {
            if (typeof data.media === 'string' && data.media.startsWith('http')) {
                mediaUrl = data.media;
            } else if (data.media?.url) {
                mediaUrl = data.media.url;
            }
        }

        // 4. Si no tenemos URL, buscar en attachment (solo si parece URL completa)
        if (!mediaUrl) {
            const attachments = data.attachment || data.attachments || [];
            if (attachments && attachments.length > 0) {
                const firstAttach = attachments[0];
                if (typeof firstAttach === 'string' && firstAttach.startsWith('http')) {
                    mediaUrl = firstAttach;
                } else if (firstAttach?.url) {
                    mediaUrl = firstAttach.url;
                } else if (firstAttach?.payload?.url) {
                    mediaUrl = firstAttach.payload.url;
                }
            }
        }

        // 5. Buscar en otros campos directos
        if (!mediaUrl) {
            mediaUrl = data.url || data.mediaUrl || data.fileUrl || null;
        }

        // 6. Fallback: buscar recursivamente
        if (!mediaUrl) {
            mediaUrl = findMediaUrl(data);
        }

        // Inferir tipo de media si encontramos URL pero no tipo
        if (mediaUrl && mediaType === 'text') {
            mediaType = inferMediaType(mediaUrl, data.attachment?.[0]);
        }

        // Limpiar contenido: si es un _event_media__ y tenemos mediaUrl, usar caption o tipo
        let content = rawContent;
        if (content && content.startsWith('_event_media__')) {
            // El body es solo el ID del media, no texto real
            content = data.caption || data.message?.imageMessage?.caption ||
                data.message?.videoMessage?.caption || '';
        }

        // =============================================
        // PERSISTIR MEDIA EN SUPABASE STORAGE
        // Descarga el archivo temporal y lo sube al bucket
        // para tener una URL permanente
        // =============================================
        const originalMediaUrl = mediaUrl; // Guardar URL temporal original
        if (mediaUrl) {
            try {
                const persistedUrl = await persistMediaToStorage(supabase, mediaUrl, mediaType, phone);
                if (persistedUrl) {
                    mediaUrl = persistedUrl; // Reemplazar con URL permanente
                    console.log(`[webhook] Media persistida: ${originalMediaUrl} → ${persistedUrl}`);
                } else {
                    console.warn(`[webhook] No se pudo persistir media, usando URL temporal: ${mediaUrl}`);
                }
            } catch (storageError) {
                // Si falla la persistencia, seguimos con la URL temporal
                // Es mejor guardar algo que nada
                console.error(`[webhook] Error persistiendo media (usando URL temporal):`, storageError.message);
            }
        }

        // Log de lo encontrado
        console.log(`[webhook] Parsed — direction: ${direction}, phone: ${phone}, mediaUrl: ${mediaUrl}, mediaType: ${mediaType}, content: ${content?.substring(0, 100)}`);

        // Insertar en la tabla
        const { error: insertError } = await supabase
            .from('whatsapp_messages')
            .insert({
                phone,
                direction,
                content: content || (mediaUrl ? `[${mediaType}]` : ''),
                media_url: mediaUrl,
                media_type: mediaUrl ? mediaType : 'text',
                sender_name: senderName,
                is_read: direction === 'outgoing',
                raw_payload: payload,
                // Guardar la URL temporal original como referencia
                original_media_url: originalMediaUrl || null,
            });

        if (insertError) {
            console.error('[webhook] Error insertando mensaje:', insertError);
            return new Response(
                JSON.stringify({ ok: false, error: insertError.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log(`[webhook] Mensaje ${direction} guardado — phone: ${phone}, media: ${mediaType}, persisted: ${mediaUrl !== originalMediaUrl}`);

        return new Response(
            JSON.stringify({ ok: true, direction, phone, mediaType, hasMedia: !!mediaUrl, persisted: mediaUrl !== originalMediaUrl }),
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

// =============================================
// FUNCIÓN: Persistir media en Supabase Storage
// =============================================

/**
 * Descarga un archivo desde una URL temporal y lo sube al bucket de Supabase Storage.
 * Retorna la URL pública permanente, o null si falla.
 */
async function persistMediaToStorage(supabase: any, tempUrl: string, mediaType: string, phone: string): Promise<string | null> {
    // Descargar el archivo desde la URL temporal
    console.log(`[storage] Descargando media desde: ${tempUrl}`);
    const response = await fetch(tempUrl);

    if (!response.ok) {
        console.error(`[storage] Error descargando media: HTTP ${response.status} ${response.statusText}`);
        return null;
    }

    // Verificar que el response no sea una página de error (JSON/HTML en vez de media real)
    const responseContentType = (response.headers.get('content-type') || '').toLowerCase();
    if (responseContentType.includes('text/html') || responseContentType.includes('application/json')) {
        console.warn(`[storage] URL temporal devolvió ${responseContentType} (probablemente expiró), no se persiste`);
        return null;
    }

    // Obtener el contenido como ArrayBuffer
    const fileBuffer = await response.arrayBuffer();
    const fileSize = fileBuffer.byteLength;

    // Limitar archivos a 50MB para no llenar el storage
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    if (fileSize > MAX_FILE_SIZE) {
        console.warn(`[storage] Archivo demasiado grande (${(fileSize / 1024 / 1024).toFixed(1)}MB), no se persiste`);
        return null;
    }

    // Determinar content-type: priorizar el tipo conocido de WhatsApp sobre el header del response
    // (los servidores temporales a veces devuelven content-types genéricos como application/octet-stream)
    const contentType = getMimeForMediaType(mediaType) !== 'application/octet-stream'
        ? getMimeForMediaType(mediaType)
        : (responseContentType || getMimeForMediaType(mediaType));
    const extension = getExtensionFromMime(contentType, tempUrl, mediaType);

    // Generar nombre único: phone/timestamp_random.ext
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filePath = `incoming/${phone}/${timestamp}_${random}.${extension}`;

    console.log(`[storage] Subiendo a ${STORAGE_BUCKET}/${filePath} (${(fileSize / 1024).toFixed(1)}KB, ${contentType})`);

    // Subir a Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, fileBuffer, {
            contentType: contentType,
            cacheControl: '31536000', // 1 año de cache
            upsert: false,
        });

    if (uploadError) {
        console.error(`[storage] Error subiendo archivo:`, uploadError.message);
        return null;
    }

    // Obtener URL pública permanente
    const { data: publicUrlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(filePath);

    if (!publicUrlData?.publicUrl) {
        console.error(`[storage] No se pudo obtener URL pública`);
        return null;
    }

    console.log(`[storage] ✅ Archivo persistido: ${publicUrlData.publicUrl}`);
    return publicUrlData.publicUrl;
}

/**
 * Determina el MIME type basado en el tipo de media
 */
function getMimeForMediaType(mediaType: string): string {
    switch (mediaType) {
        case 'image': return 'image/jpeg';
        case 'audio': return 'audio/ogg';
        case 'video': return 'video/mp4';
        case 'sticker': return 'image/webp';
        case 'document': return 'application/octet-stream';
        default: return 'application/octet-stream';
    }
}

/**
 * Determina la extensión del archivo a partir del MIME type, URL o tipo de media
 */
function getExtensionFromMime(contentType: string, url: string, mediaType: string): string {
    // Intentar extraer extensión de la URL original
    const urlExtMatch = url.match(/\.([a-zA-Z0-9]{2,5})(?:\?|$)/);
    if (urlExtMatch) {
        const ext = urlExtMatch[1].toLowerCase();
        // Validar que sea una extensión conocida
        const validExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg',
            'mp3', 'ogg', 'opus', 'wav', 'm4a', 'aac', 'weba', 'webm',
            'mp4', 'mov', 'avi', 'mkv', '3gp',
            'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'ppt', 'pptx'];
        if (validExts.includes(ext)) return ext;
    }

    // Mapeo de MIME a extensión
    const mimeMap: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/svg+xml': 'svg',
        'audio/ogg': 'ogg',
        'audio/opus': 'opus',
        'audio/mpeg': 'mp3',
        'audio/mp4': 'm4a',
        'audio/wav': 'wav',
        'audio/webm': 'weba',
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'video/3gpp': '3gp',
        'application/pdf': 'pdf',
        'application/msword': 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/vnd.ms-excel': 'xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
        'text/plain': 'txt',
        'text/csv': 'csv',
    };

    const mime = contentType.split(';')[0].trim().toLowerCase();
    if (mimeMap[mime]) return mimeMap[mime];

    // Fallback por tipo de media
    switch (mediaType) {
        case 'image': return 'jpg';
        case 'audio': return 'ogg';
        case 'video': return 'mp4';
        case 'sticker': return 'webp';
        case 'document': return 'bin';
        default: return 'bin';
    }
}

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
    if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(lower)) return 'image';
    if (/\.(mp3|ogg|opus|wav|m4a|aac|weba|webm)(\?|$)/i.test(lower) && !lower.includes('video')) return 'audio';
    if (/\.(mp4|mov|avi|mkv|3gp)(\?|$)/i.test(lower)) return 'video';
    if (/\.(pdf|doc|docx|xls|xlsx|csv|txt|ppt|pptx)(\?|$)/i.test(lower)) return 'document';

    // Por MIME en el attachment
    if (attachment?.mimetype || attachment?.mime) {
        const mime = (attachment.mimetype || attachment.mime).toLowerCase();
        if (mime.startsWith('image/')) return 'image';
        if (mime.startsWith('audio/')) return 'audio';
        if (mime.startsWith('video/')) return 'video';
        if (mime.startsWith('application/')) return 'document';
    }

    // Si la URL contiene indicios
    if (lower.includes('/image') || lower.includes('img')) return 'image';
    if (lower.includes('/audio') || lower.includes('ptt')) return 'audio';
    if (lower.includes('/video')) return 'video';

    return 'image'; // Default para media sin tipo claro
}

/**
 * Busca recursivamente en un objeto cualquier campo que parezca una URL de media
 */
function findMediaUrl(obj, depth = 0) {
    if (depth > 5 || !obj || typeof obj !== 'object') return null;

    // Campos que probablemente contengan URLs de media
    const urlFields = [
        'url', 'mediaUrl', 'media_url', 'fileUrl', 'file_url',
        'directPath', 'link', 'href', 'src', 'thumbnail',
        'jpegThumbnail', 'image', 'audio', 'video',
    ];

    for (const key of urlFields) {
        if (obj[key] && typeof obj[key] === 'string' &&
            (obj[key].startsWith('http') || obj[key].startsWith('//'))) {
            return obj[key];
        }
    }

    // Buscar en sub-objetos (no arrays para evitar loops)
    for (const [key, val] of Object.entries(obj)) {
        if (val && typeof val === 'object' && !Array.isArray(val)) {
            const found = findMediaUrl(val, depth + 1);
            if (found) return found;
        }
    }

    return null;
}
