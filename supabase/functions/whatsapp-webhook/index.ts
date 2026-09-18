// Supabase Edge Function: whatsapp-webhook
// Recibe eventos de BuilderBot y guarda mensajes en whatsapp_messages
// PERSISTENCIA DE MEDIA: Descarga archivos de URLs temporales y los sube a Supabase Storage
// DUAL LINE: Soporta múltiples líneas WhatsApp via query param ?line=line_a|line_b|line_c
// URLs para BuilderBot:
//   Línea A (Business):  https://hakysnqiryimxbwdslwe.supabase.co/functions/v1/whatsapp-webhook?line=line_a
//   Línea B (Messenger): https://hakysnqiryimxbwdslwe.supabase.co/functions/v1/whatsapp-webhook?line=line_b
//   Línea C:             https://hakysnqiryimxbwdslwe.supabase.co/functions/v1/whatsapp-webhook?line=line_c

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
        // Detectar línea desde query param ?line=line_a|line_b
        const url = new URL(req.url);
        const lineId = url.searchParams.get('line') || null;

        const payload = await req.json();
        const { eventName, data } = payload;

        // Log completo del payload para debug (ver estructura de media)
        console.log(`[webhook] Evento: ${eventName}`, JSON.stringify(payload, null, 2));

        // =============================================
        // MANEJO DE EVENTOS DE STATUS (conexión/desconexión del bot)
        // Actualiza whatsapp_lines.is_active para reflejar estado en tiempo real
        // =============================================
        if (eventName === 'status.ready' || eventName === 'status.disconnect') {
            const isOnline = eventName === 'status.ready';
            const reason = data?.reason || null;

            console.log(`[webhook] Status event: ${eventName} | line: ${lineId} | online: ${isOnline} | reason: ${reason}`);

            if (lineId) {
                const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
                const { error: statusError } = await supabase
                    .from('whatsapp_lines')
                    .update({
                        is_active: isOnline,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', lineId);

                if (statusError) {
                    console.error(`[webhook] Error actualizando status de línea ${lineId}:`, statusError);
                } else {
                    console.log(`[webhook] ✅ Línea ${lineId} marcada como ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
                }
            }

            return new Response(
                JSON.stringify({ ok: true, event: eventName, lineId, isOnline, reason }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

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
        console.log(`[webhook] Parsed — line: ${lineId || 'unknown'}, direction: ${direction}, phone: ${phone}, mediaUrl: ${mediaUrl}, mediaType: ${mediaType}, content: ${content?.substring(0, 100)}`);

        // Preservar media_type incluso sin URL (para stickers sin URL descargable)
        // Esto permite al frontend mostrar un placeholder apropiado
        const finalMediaType = mediaType !== 'text' ? mediaType : (mediaUrl ? inferMediaType(mediaUrl, data.attachment?.[0]) : 'text');

        // Insertar en la tabla
        const { error: insertError } = await supabase
            .from('whatsapp_messages')
            .insert({
                phone,
                direction,
                content: content || (mediaUrl ? `[${finalMediaType}]` : (finalMediaType !== 'text' ? `[${finalMediaType}]` : '')),
                media_url: mediaUrl,
                media_type: finalMediaType,
                sender_name: senderName,
                is_read: direction === 'outgoing',
                raw_payload: payload,
                // Guardar la URL temporal original como referencia
                original_media_url: originalMediaUrl || null,
                // Línea WhatsApp que recibió el mensaje
                line_id: lineId,
            });

        if (insertError) {
            console.error('[webhook] Error insertando mensaje:', insertError);
            return new Response(
                JSON.stringify({ ok: false, error: insertError.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // =============================================
        // AUTO-ASIGNAR LÍNEA AL CONTACTO (CRM)
        // Cuando un paciente escribe por una línea, guardar esa línea
        // en crm_contacts.assigned_line_id para no perder la referencia
        // =============================================
        if (direction === 'incoming' && lineId && phone) {
            try {
                const { error: upsertError } = await supabase
                    .from('crm_contacts')
                    .upsert({
                        phone,
                        assigned_line_id: lineId,
                        nombre: senderName || phone,
                    }, { onConflict: 'phone' });

                if (upsertError) {
                    console.warn(`[webhook] Error auto-asignando línea al contacto ${phone}:`, upsertError.message);
                } else {
                    console.log(`[webhook] ✅ Línea ${lineId} auto-asignada al contacto ${phone}`);
                }
            } catch (crmError: any) {
                // Non-fatal: no queremos que falle el webhook por esto
                console.warn(`[webhook] Error en auto-asignación de línea:`, crmError?.message || crmError);
            }
        }

        console.log(`[webhook] Mensaje ${direction} guardado — line: ${lineId}, phone: ${phone}, media: ${finalMediaType}, persisted: ${mediaUrl !== originalMediaUrl}`);

        // =============================================
        // CHATBOT TRIAGE ULTRA-COST-SAVING (ASISTECLICK STYLE)
        // Solo para mensajes entrantes de pacientes
        // =============================================
        if (direction === 'incoming' && phone) {
            try {
                await handleChatbotTriage(supabase, phone, content, senderName, lineId);
            } catch (triageError: any) {
                console.error('[webhook] Error en handleChatbotTriage (non-fatal):', triageError?.message || triageError);
            }
        }

        return new Response(
            JSON.stringify({ ok: true, direction, phone, mediaType, hasMedia: !!mediaUrl, persisted: mediaUrl !== originalMediaUrl, lineId }),
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
 * Siempre retorna formato 549XXXXXXXXXX (exactamente 13 dígitos)
 */
function normalizePhone(phone) {
    if (!phone) return '';
    let clean = phone.replace(/\D/g, '');

    // Ya tiene formato internacional completo con 549 y exactamente 13 dígitos
    if (clean.startsWith('549') && clean.length === 13) return clean;

    // Si tiene 549 pero más de 13 dígitos, puede tener un 15 interno
    // Ej: 549264154XXXXX (15 digs) → quitar el 15 después del código de área
    if (clean.startsWith('549') && clean.length > 13) {
        const inner = clean.slice(3); // quitar 549
        // Buscar 15 en posición de cod. de área (posición 2-4)
        const idx15 = inner.indexOf('15');
        if (idx15 >= 2 && idx15 <= 4) {
            const cleaned = inner.slice(0, idx15) + inner.slice(idx15 + 2);
            if (cleaned.length === 10) return '549' + cleaned;
        }
        // Si aún es largo, truncar a 13 dígitos (tomar los primeros 10 después de 549)
        return '549' + inner.slice(0, 10);
    }

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
    // Quitar 15 interno (ej: 264-15-XXXXXX)
    if (clean.length > 10 && clean.includes('15')) {
        const idx = clean.indexOf('15');
        if (idx >= 2 && idx <= 4) {
            clean = clean.slice(0, idx) + clean.slice(idx + 2);
        }
    }

    // Asegurar que el resultado final tiene exactamente 10 dígitos locales
    if (clean.length > 10) {
        clean = clean.slice(0, 10);
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

// =============================================
// MOTOR DE TRIAGE DEL CHATBOT (AHORRO DE MENSAJES Y EXTRACCIÓN CON IA)
// =============================================

async function handleChatbotTriage(
    supabase: any,
    phone: string,
    incomingText: string,
    senderName: string | null,
    lineId: string | null
) {
    if (!phone || !incomingText) return;
    const cleanText = incomingText.trim();

    // 1. Obtener estado actual de la conversación
    const { data: conv } = await supabase
        .from('contact_center_conversations')
        .select('*')
        .eq('phone', phone)
        .maybeSingle();

    // Si ya está asignada a un agente humano (Daniela Aguilera, Sofia Olivieri, Virginia Jacques, Erica Leal)
    // O si el bot fue silenciado/pausado manualmente, NO responder
    if (conv) {
        if (conv.assigned_agent_id || conv.bot_active === false) {
            console.log(`[triage-bot] Chat ${phone} asignado a ${conv.assigned_agent_name || conv.assigned_agent_id} o bot_active=false. Bot en silencio.`);
            await supabase.from('contact_center_conversations').update({
                last_message_text: cleanText,
                last_message_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }).eq('phone', phone);
            return;
        }
    }

    const currentStage = conv?.bot_stage || 'inicio';
    let replyText = '';
    let nextStage = currentStage;
    let updates: Record<string, any> = {
        last_message_text: cleanText,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    // Helper de extracción de DNI rápido por expresión regular (7 u 8 dígitos, con o sin puntos)
    const normalizedText = cleanText.replace(/\./g, '');
    const dniMatch = cleanText.match(/\b\d{7,8}\b/) || normalizedText.match(/\b\d{7,8}\b/);
    const candidateDni = dniMatch ? dniMatch[0] : (conv?.dni || null);

    // Búsqueda en el padrón real de hospital_pacientes (columnas reales: id_paciente, nombre, dni, coseguro, telefono, email)
    let paciente = null;
    if (candidateDni) {
        const { data: pByDni, error: pacError } = await supabase
            .from('hospital_pacientes')
            .select('id_paciente, dni, nombre, coseguro, telefono, email')
            .eq('dni', candidateDni)
            .limit(1)
            .maybeSingle();

        if (pacError) {
            console.error('[triage-bot] Error consultando hospital_pacientes por DNI:', pacError);
        } else if (pByDni) {
            paciente = pByDni;
            console.log(`[triage-bot] Paciente encontrado por DNI ${candidateDni}: ${paciente.nombre} (${paciente.coseguro})`);
        }
    }

    // Fallback de búsqueda por teléfono si no se detectó DNI o no se encontró
    if (!paciente && phone) {
        const rawPhoneDigits = phone.replace(/\D/g, '').replace(/^549?/, '');
        if (rawPhoneDigits.length >= 8) {
            const { data: pByPhone } = await supabase
                .from('hospital_pacientes')
                .select('id_paciente, dni, nombre, coseguro, telefono, email')
                .ilike('telefono', `%${rawPhoneDigits}%`)
                .limit(1)
                .maybeSingle();
            if (pByPhone) {
                paciente = pByPhone;
                console.log(`[triage-bot] Paciente encontrado por Teléfono ${rawPhoneDigits}: ${paciente.nombre}`);
            }
        }
    }

    // ETAPA 1 & RE-EVALUACIÓN: Si el paciente está en el padrón, siempre darle la bienvenida de paciente registrado
    if (paciente && (currentStage === 'inicio' || currentStage === 'esperando_dni' || currentStage === 'esperando_datos_nuevo')) {
        // CASO A: PACIENTE EXISTENTE EN EL SANATORIO
        const fullName = (paciente.nombre || senderName || 'Paciente').trim();
        const os = (paciente.coseguro || 'Particular / A confirmar').trim();

        updates = {
            ...updates,
            dni: paciente.dni || candidateDni,
            nombre_completo: fullName,
            obra_social: os,
            email: paciente.email || updates.email || null,
            telefono_contacto: paciente.telefono || updates.telefono_contacto || phone,
            es_paciente_existente: true,
            bot_stage: 'menu_opciones'
        };
        nextStage = 'menu_opciones';

        // MENSAJE ÚNICO CONSOLIDADO: Reconocimiento del paciente + Cobertura + Menú de 3 opciones
        replyText = `¡Hola *${fullName}*! 🏥 Confirmamos tus datos como paciente registrado con cobertura *${os}*.\n\n¿En qué podemos ayudarte hoy?\n1️⃣ *Solicitar o reprogramar un turno*\n2️⃣ *Autorizaciones y cobertura*\n3️⃣ *Información institucional, sedes o estudios*\n\nResponde con el número *1*, *2* o *3*, o escríbenos qué médico o especialidad buscas.`;

    } else if (currentStage === 'inicio' || currentStage === 'esperando_dni') {
        if (!candidateDni) {
            // El paciente escribió un saludo o consulta sin DNI:
            // Solicitamos DNI y Nombre en UN SOLO mensaje consolidado para ahorrar costos
            replyText = `¡Hola! 👋 Te damos la bienvenida a *Sanatorio Argentino*.\n\nPara poder gestionar tu consulta de forma ágil y verificar tu cobertura médica, por favor indícanos en un solo mensaje tu número de *DNI* (sin puntos) y tu *Nombre Completo*.`;
            nextStage = 'esperando_dni';
        } else {
            // CASO B: PACIENTE NUEVO (No está registrado en el padrón hospital_pacientes)
            // Se piden las 6 variables indispensables en UN SOLO MENSAJE para no inflar la cantidad de mensajes
            updates = {
                ...updates,
                dni: candidateDni,
                es_paciente_existente: false,
                bot_stage: 'esperando_datos_nuevo'
            };
            nextStage = 'esperando_datos_nuevo';

            replyText = `¡Hola! 👋 Tu DNI *${candidateDni}* no figura en nuestro padrón activo, por lo que crearemos tu ficha de atención.\n\nPara completar tu solicitud en un solo paso, por favor responde este mensaje con:\n• *Nombre y apellido completo*\n• *Obra Social o Prepaga*\n• *Fecha de nacimiento* (DD/MM/AAAA)\n• *Email*\n• *Teléfono alternativo*\n• *Departamento donde vives* (San Juan)\n\n¡Puedes enviarnos todo junto en un solo mensaje!`;
        }
    } else if (currentStage === 'esperando_datos_nuevo') {
        // El paciente nuevo respondió con sus datos:
        // Extraer las variables clínicas estructuradas y guardarlas en la ficha
        const extracted = await extractPatientVariables(cleanText, candidateDni);
        updates = {
            ...updates,
            ...extracted,
            bot_stage: 'menu_opciones'
        };
        nextStage = 'menu_opciones';

        replyText = `¡Muchas gracias *${extracted.nombre_completo || 'por tu respuesta'}*! ✅ Ya registramos tus datos correctamente.\n\n¿En qué podemos ayudarte hoy?\n1️⃣ *Solicitar o reprogramar un turno*\n2️⃣ *Autorizaciones y cobertura*\n3️⃣ *Información institucional, sedes o estudios*\n\nPor favor responde *1*, *2* o *3*.`;
    } else if (currentStage === 'menu_opciones') {
        // Evaluar selección del menú o consulta abierta
        const isOpt1 = cleanText === '1' || /turno|reprogram|medico|doctor|agenda|cita/i.test(cleanText);
        const isOpt2 = cleanText === '2' || /autoriz|orden|coseguro|auditor/i.test(cleanText);
        const isOpt3 = cleanText === '3' || /info|web|sede|estudio|laboratorio|direccion|telefono/i.test(cleanText);

        if (isOpt1) {
            // Opción 1: Turnos y reprogramación
            let doctorNoteMsg = '';
            // Buscar si mencionó el nombre de algún médico o especialidad
            const tokens = cleanText.split(/\s+/).filter(w => w.length > 3 && !['quiero', 'turno', 'para', 'hola', 'favor'].includes(w.toLowerCase()));
            if (tokens.length > 0) {
                const searchKeyword = tokens[tokens.length - 1];
                const { data: doctors } = await supabase
                    .from('contact_center_doctor_parameters')
                    .select('profesional_nombre, especialidad, consultorio_actual, condiciones_consulta')
                    .ilike('profesional_nombre', `%${searchKeyword}%`)
                    .limit(1);

                if (doctors && doctors.length > 0) {
                    const doc = doctors[0];
                    doctorNoteMsg = `\n\n📌 *Información de ${doc.profesional_nombre}* (${doc.especialidad}):\n`;
                    if (doc.consultorio_actual) doctorNoteMsg += `• Consultorio habitual: ${doc.consultorio_actual}\n`;
                    if (doc.condiciones_consulta) {
                        const shortNote = doc.condiciones_consulta.replace(/[\r\n]+/g, ' ').substring(0, 160);
                        doctorNoteMsg += `• Parámetros de atención: ${shortNote}...\n`;
                    }
                }
            }

            replyText = `¡Perfecto! Hemos registrado tu solicitud de turno.${doctorNoteMsg}\nEn unos momentos, una agente de nuestro equipo (Daniela, Sofia, Virginia o Erica) tomará la conversación para coordinar fecha y horario disponible. 👩‍⚕️`;
            updates.motivo_consulta = 'Solicitud de Turno / Reprogramación';
            updates.status = 'sin_asignar';
            // Silenciamos el bot inmediatamente para la intervención del agente
            updates.bot_active = false;
            nextStage = 'esperando_agente';

        } else if (isOpt2) {
            // Opción 2: Autorizaciones
            replyText = `Para gestionar la autorización de tus estudios o prácticas médicas:\n\n📷 Por favor envíanos por aquí una *foto nítida de tu pedido médico* y de tu *credencial de obra social*.\n\nUna de nuestras asesoras revisará la documentación y te responderá a la brevedad.`;
            updates.motivo_consulta = 'Autorizaciones de Estudios / Cobertura';
            updates.status = 'sin_asignar';
            updates.bot_active = false;
            nextStage = 'esperando_agente';

        } else if (isOpt3) {
            // Opción 3: Otras consultas (Sitio Web Obligatorio)
            replyText = `Para consultar información institucional, cartilla de profesionales, sedes y servicios de Sanatorio Argentino, puedes ingresar a nuestro sitio web oficial:\n\n🌐 *www.sanatorioargentino.com.ar*\n\nSi necesitas asistencia personalizada, aguarda en línea y una de nuestras asesoras te responderá. ¡Muchas gracias!`;
            updates.motivo_consulta = 'Información General / Web';
            updates.bot_active = false;
            nextStage = 'esperando_agente';

        } else {
            // Consulta abierta no tipificada
            replyText = `Hemos recibido tu mensaje. Una agente de nuestro equipo de atención se pondrá en contacto contigo a la brevedad para asistirte. ¡Aguardá un momento por favor!`;
            updates.motivo_consulta = cleanText.substring(0, 100);
            updates.status = 'sin_asignar';
            updates.bot_active = false;
            nextStage = 'esperando_agente';
        }
    }

    // Persistir o actualizar en contact_center_conversations
    updates.bot_stage = nextStage;
    await supabase
        .from('contact_center_conversations')
        .upsert({
            phone,
            ...updates
        }, { onConflict: 'phone' });

    // Enviar el mensaje saliente al paciente vía WhatsApp
    if (replyText) {
        await sendBotWhatsAppReply(supabase, phone, replyText, lineId);
    }
}

/**
 * Extrae variables estructuradas del paciente nuevo
 */
async function extractPatientVariables(text: string, fallbackDni: string | null) {
    const vars: Record<string, any> = {};

    // 1. Extracción heurística rápida por patrones
    const dniMatch = text.match(/\b\d{7,8}\b/);
    if (dniMatch) vars.dni = dniMatch[0];
    else if (fallbackDni) vars.dni = fallbackDni;

    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) vars.email = emailMatch[0];

    const fnMatch = text.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/);
    if (fnMatch) vars.fecha_nacimiento = fnMatch[0];

    // Localidades de San Juan
    const dptos = [
        'Capital', 'Rawson', 'Rivadavia', 'Chimbas', 'Santa Lucía', 'Pocito',
        'Caucete', 'Albardón', 'Sarmiento', '25 de Mayo', 'San Martín',
        'Calingasta', 'Jáchal', 'Iglesia', 'Valle Fértil', 'Angaco', 'Ullum', 'Zonda', '9 de Julio'
    ];
    for (const d of dptos) {
        if (new RegExp(`\\b${d}\\b`, 'i').test(text)) {
            vars.departamento = d;
            break;
        }
    }

    // Teléfono alternativo
    const phoneMatch = text.match(/(?:tel|cel|telefono|contacto|whatsapp)?[:\s]*(\+?54\s?9?\s?\d{2,4}[\s-]?\d{6,8}|\b264\d{7}\b)/i);
    if (phoneMatch) {
        vars.telefono_contacto = phoneMatch[1].replace(/\D/g, '');
    }

    // 2. Extracción enriquecida con OpenAI si está disponible
    const openAiKey = Deno.env.get('OPENAI_API_KEY');
    if (openAiKey) {
        try {
            const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openAiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    response_format: { type: 'json_object' },
                    messages: [
                        {
                            role: 'system',
                            content: `Eres el extractor de datos del Contact Center de Sanatorio Argentino. Extrae del mensaje del paciente un JSON con:
                            - nombre_completo (string o null)
                            - obra_social (string o null, ej: OSDE, OSP, Swiss Medical, Particular)
                            - fecha_nacimiento (string o null, DD/MM/AAAA)
                            - email (string o null)
                            - telefono_contacto (string o null)
                            - departamento (string o null, ej: Rivadavia, Capital, Rawson)
                            Si un dato no fue provisto, indícalo como null.`
                        },
                        {
                            role: 'user',
                            content: text
                        }
                    ],
                    temperature: 0.1
                })
            });

            if (aiRes.ok) {
                const aiData = await aiRes.json();
                const parsed = JSON.parse(aiData.choices?.[0]?.message?.content || '{}');
                if (parsed.nombre_completo && !vars.nombre_completo) vars.nombre_completo = parsed.nombre_completo;
                if (parsed.obra_social) vars.obra_social = parsed.obra_social;
                if (parsed.fecha_nacimiento && !vars.fecha_nacimiento) vars.fecha_nacimiento = parsed.fecha_nacimiento;
                if (parsed.email && !vars.email) vars.email = parsed.email;
                if (parsed.telefono_contacto && !vars.telefono_contacto) vars.telefono_contacto = parsed.telefono_contacto;
                if (parsed.departamento && !vars.departamento) vars.departamento = parsed.departamento;
            }
        } catch (aiErr) {
            console.warn('[triage-bot] Fallback IA:', aiErr);
        }
    }

    // Fallback de nombre si no se obtuvo
    if (!vars.nombre_completo) {
        const lines = text.split(/[\r\n,]+/).map(l => l.trim()).filter(Boolean);
        if (lines.length > 0 && lines[0].length < 40 && !/\d/.test(lines[0])) {
            vars.nombre_completo = lines[0];
        }
    }

    return vars;
}

/**
 * Despacha la respuesta del bot hacia WhatsApp y la guarda en el historial
 */
async function sendBotWhatsAppReply(supabase: any, phone: string, text: string, lineId: string | null) {
    try {
        // 1. Guardar mensaje saliente en whatsapp_messages
        await supabase
            .from('whatsapp_messages')
            .insert({
                phone,
                direction: 'outgoing',
                content: text,
                media_type: 'text',
                sender_name: 'Bot Sanatorio',
                is_read: true,
                line_id: lineId,
                raw_payload: {
                    source: 'bot_triage',
                    bot: true
                }
            });

        // 2. Invocar Edge Function send-whatsapp para despachar a BuilderBot
        const sendUrl = `${SUPABASE_URL}/functions/v1/send-whatsapp`;
        const res = await fetch(sendUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
            },
            body: JSON.stringify({
                number: phone,
                content: text,
                ...(lineId && { lineId })
            })
        });

        console.log(`[triage-bot] ✅ Mensaje despachado a ${phone} | status: ${res.status}`);
    } catch (err: any) {
        console.error('[triage-bot] Error enviando respuesta WhatsApp:', err?.message || err);
    }
}

