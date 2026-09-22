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

        // Filtrar y descartar canales de noticias de WhatsApp (newsletters), grupos y transmisiones
        const rawFrom = String(data.from || data.key?.remoteJid || '');
        if (
            rawFrom.endsWith('@newsletter') || 
            rawFrom.includes('newsletter') || 
            rawFrom.endsWith('@g.us') || 
            rawFrom.endsWith('@broadcast') || 
            rawFrom === 'status@broadcast' ||
            data.broadcast === true ||
            rawFrom.startsWith('120363')
        ) {
            console.log(`[webhook] ⏭️ Ignorando actualización de Canal/Grupo/Newsletter (${rawFrom})`);
            return new Response(
                JSON.stringify({ ok: true, skipped: true, reason: 'channel_or_group_ignored', from: rawFrom }),
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

        // Extraer nombre original de documento si existe (Word, Excel, PDF, etc.)
        const docFileName = data.message?.documentMessage?.fileName || 
            data.message?.documentWithCaptionMessage?.message?.documentMessage?.fileName || 
            data.fileName || data.filename || null;

        // Limpiar contenido: si es un _event_media__ y tenemos mediaUrl, usar caption o nombre de archivo
        let content = rawContent;
        if (content && content.startsWith('_event_media__')) {
            // El body es solo el ID del media, no texto real
            content = data.caption || data.message?.imageMessage?.caption ||
                data.message?.videoMessage?.caption ||
                docFileName || '';
        }
        if (!content && docFileName) {
            content = docFileName;
        }

        // =============================================
        // PERSISTIR MEDIA EN SUPABASE STORAGE
        // Descarga el archivo temporal y lo sube al bucket
        // para tener una URL permanente
        // =============================================
        const originalMediaUrl = mediaUrl; // Guardar URL temporal original
        if (mediaUrl) {
            try {
                const persistedUrl = await persistMediaToStorage(supabase, mediaUrl, mediaType, phone, docFileName);
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

        // Insertar en la tabla y obtener ID para posibles enriquecimientos de IA
        const { data: insertedData, error: insertError } = await supabase
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
            })
            .select('id')
            .maybeSingle();

        if (insertError) {
            console.error('[webhook] Error insertando mensaje:', insertError);
            return new Response(
                JSON.stringify({ ok: false, error: insertError.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // =============================================
        // ANÁLISIS DE ORDEN MÉDICA CON IA (EDGE FUNCTION)
        // Si el paciente envía una imagen, disparar análisis de visión en background
        // NO se envía el análisis al paciente: se guarda en raw_payload para el operador
        // =============================================
        if (direction === 'incoming' && mediaUrl && finalMediaType === 'image') {
            const insertedId = insertedData?.id;
            console.log(`[webhook] 🩺 Disparando analyze-medical-order para msg ${insertedId}...`);
            fetch(`${SUPABASE_URL}/functions/v1/analyze-medical-order`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                },
                body: JSON.stringify({
                    imageUrl: mediaUrl,
                    messageId: insertedId,
                    phone: phone,
                }),
            }).catch(aiErr => console.error('[webhook] Error triggering analyze-medical-order:', aiErr));
        }

        // =============================================
        // AUTO-ASIGNAR LÍNEA AL CONTACTO (CRM)
        // Cuando un paciente escribe por una línea, guardar esa línea
        // en crm_contacts.assigned_line_id para no perder la referencia
        // SOLO para líneas quirúrgicas/admisión (no pisar con contact_center ni recepciones)
        // =============================================
        const admQuiLines = ['line_a', 'line_b', 'line_c', 'line_meta'];
        if (direction === 'incoming' && lineId && admQuiLines.includes(lineId) && phone) {
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
        // Solo para mensajes entrantes de pacientes EXCLUSIVAMENTE en la línea de Contact Center
        // NUNCA ejecutar en line_a, line_b, line_c (Cirugías / Admisión) ni line_recepciones
        // =============================================
        if (direction === 'incoming' && phone && lineId === 'contact_center') {
            try {
                const textToTriage = content || (mediaUrl ? `[${finalMediaType}]` : '');
                await handleChatbotTriage(supabase, phone, textToTriage, senderName, lineId, finalMediaType, mediaUrl);
            } catch (triageError: any) {
                console.error('[webhook] Error en handleChatbotTriage (non-fatal):', triageError?.message || triageError);
            }

            // Actualizar automáticamente el Resumen IA de la Consulta para la pantalla del operador
            const summaryPromise = fetch(`${SUPABASE_URL}/functions/v1/contact-center-chat-summary`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
                },
                body: JSON.stringify({ phone })
            }).then(async r => {
                const text = await r.text();
                console.log(`[webhook] ✅ Resumen IA generado automáticamente para ${phone}:`, text.slice(0, 120));
            }).catch(aiErr => console.warn('[webhook] Background chat summary error:', aiErr?.message || aiErr));

            if (typeof (globalThis as any).EdgeRuntime !== 'undefined' && (globalThis as any).EdgeRuntime?.waitUntil) {
                (globalThis as any).EdgeRuntime.waitUntil(summaryPromise);
            } else {
                await summaryPromise;
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
async function persistMediaToStorage(
    supabase: any, 
    tempUrl: string, 
    mediaType: string, 
    phone: string, 
    originalFilename?: string | null
): Promise<string | null> {
    // Descargar el archivo desde la URL temporal
    console.log(`[storage] Descargando media desde: ${tempUrl}${originalFilename ? ` (nombre: ${originalFilename})` : ''}`);
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

    // Deducir mime type específico si se conoce el nombre de archivo del documento
    let detectedMime: string | null = null;
    if (originalFilename) {
        const lowerName = originalFilename.toLowerCase();
        if (lowerName.endsWith('.pdf')) detectedMime = 'application/pdf';
        else if (lowerName.endsWith('.docx')) detectedMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        else if (lowerName.endsWith('.doc')) detectedMime = 'application/msword';
        else if (lowerName.endsWith('.xlsx')) detectedMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        else if (lowerName.endsWith('.xls')) detectedMime = 'application/vnd.ms-excel';
        else if (lowerName.endsWith('.csv')) detectedMime = 'text/csv';
    }

    // Determinar content-type: priorizar tipo detectado o tipo conocido de WhatsApp
    const contentType = detectedMime || (getMimeForMediaType(mediaType) !== 'application/octet-stream'
        ? getMimeForMediaType(mediaType)
        : (responseContentType || getMimeForMediaType(mediaType)));

    let extension = originalFilename ? getExtensionFromMime(contentType, originalFilename, mediaType) : '';
    if (!extension || extension === 'bin') {
        extension = getExtensionFromMime(contentType, tempUrl, mediaType);
    }

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
// DETECCIÓN INTELIGENTE DE INTENCIONES Y PROFESIONALES (AHORRO MÁXIMO DE MENSAJES)
// =============================================

interface IntentDetectionResult {
    intent: 
        | 'turno' 
        | 'autorizacion' 
        | 'gestion_familiar'
        | 'gestion_propia'
        | 'info' 
        | 'chequeo' 
        | 'prevenir' 
        | 'guardia' 
        | 'informes_laboratorio'
        | 'informes_imagenes'
        | 'informes_biopsia_pap'
        | 'informes_general'
        | 'servicio_laboratorio'
        | 'vacunatorio'
        | 'curso_embarazadas'
        | 'registro_civil'
        | 'administracion_presupuestos'
        | 'horarios_sedes'
        | 'telefonos_sedes'
        | 'reclamos_calidad'
        | 'fundacion'
        | 'confirmar_turno_online'
        | 'cancelar_turno_online'
        | 'reprogramar_turno_online'
        | 'agradecimiento_cierre'
        | 'seguimiento_asesor'
        | 'general';
    doctorCandidate: string | null;
    doctorRecord: any | null;
    isExplicitNumberOption: string | null;
    sectorKey?: string | null;
}

interface ConversationContext {
    history?: any[];
    lastBotMessage?: any;
    lastAgentMessage?: any;
    hasAgentIntervened?: boolean;
    agentName?: string | null;
    turnoOnlineProximo?: any;
    patientName?: string | null;
    resolvedDni?: string | null;
    previousResolutionReason?: string | null;
    botStage?: string | null;
}

const STOPWORDS_MEDICOS = new Set([
    'hacer', 'hacerme', 'hacerse', 'sacar', 'sacarme', 'sacarse', 'pedir', 'pedirme',
    'ver', 'verme', 'verse', 'saber', 'consultar', 'chequeo', 'chequeos', 'control',
    'controles', 'estudio', 'estudios', 'turno', 'turnos', 'consulta', 'atencion',
    'atención', 'manana', 'mañana', 'tarde', 'hoy', 'lunes', 'martes', 'miercoles', 'miércoles',
    'jueves', 'viernes', 'sabado', 'sábado', 'domingo', 'semana', 'mes', 'algun', 'alguna',
    'alguno', 'favor', 'hola', 'buenas', 'buenos', 'ustedes', 'sanatorio', 'argentino',
    'salud', 'clinica', 'clínica', 'medico', 'médico', 'medica', 'médica', 'doctor', 'doctora',
    'profesional', 'especialista', 'analisis', 'análisis', 'laboratorio', 'ecografia', 'ecografía',
    'radiografia', 'radiografía', 'orden', 'receta', 'como', 'para', 'buen', 'dia', 'días', 'bienvenido',
    'prevenir', 'prevencion', 'prevención', 'guardia', 'guardias', 'vacuna', 'vacunas', 'registro',
    'presupuesto', 'presupuestos', 'informe', 'informes', 'reclamo', 'reclamos'
]);

/**
 * Verifica si el Contact Center se encuentra dentro del horario de atención:
 * Lunes a Viernes de 7:30 a 21:00 hs
 * Sábados de 8:00 a 12:00 hs
 * Hora oficial de San Juan, Argentina (UTC-3)
 */
function isContactCenterOpen(now: Date = new Date()): boolean {
    const timeStr = now.toLocaleString('en-US', { timeZone: 'America/Argentina/San_Juan' });
    const local = new Date(timeStr);
    const day = local.getDay(); // 0 = Dom, 1 = Lun, ..., 6 = Sab
    const hour = local.getHours();
    const min = local.getMinutes();
    const currentMin = hour * 60 + min;

    if (day >= 1 && day <= 5) {
        // Lunes a Viernes: 7:30 a 21:00 hs
        return currentMin >= 450 && currentMin < 1260;
    } else if (day === 6) {
        // Sábados: 8:00 a 12:00 hs
        return currentMin >= 480 && currentMin < 720;
    }
    return false; // Domingos y fuera de horario
}

/**
 * Mensaje institucional cuando el bot se frena y transfiere a las asesoras humanas
 */
function getAgentHandoffNotice(): string {
    const open = isContactCenterOpen();
    if (open) {
        return `👩‍⚕️ Un asesor te responderá a la brevedad. El bot quedará en pausa.`;
    } else {
        return `🕒 Nuestro horario de atención es de lunes a viernes de 7:30 a 21:00 hs y sábados de 8:00 a 12:00 hs. El bot queda en pausa y un asesor te responderá al inicio del próximo día hábil.\n🚨 *Guardias 24 hs:* Sede 01 (San Luis 432 O) activa.`;
    }
}

/**
 * Analiza la obra social registrada en Salus o ficha previa del paciente
 * y determina si es una cobertura real activa o un genérico/particular
 */
function getRegisteredOsInfo(osRaw?: string | null): { hasRegisteredOs: boolean; cleanOsName: string } {
    if (!osRaw) return { hasRegisteredOs: false, cleanOsName: '' };
    const trimmed = osRaw.trim();
    const lower = trimmed.toLowerCase();

    if (
        !trimmed ||
        lower === 'particular' ||
        lower === 'particular / a confirmar' ||
        lower === 'a confirmar' ||
        lower === 'a consultar' ||
        lower === 'sin obra social' ||
        lower === 'no informada' ||
        lower === 'no informado' ||
        lower === 'no' ||
        lower === 'ninguna'
    ) {
        return { hasRegisteredOs: false, cleanOsName: '' };
    }

    let clean = trimmed.replace(/^\d+\s*[-–]\s*/, '').trim();
    if (clean.toUpperCase() === 'PROVINCIA') {
        clean = 'Obra Social Provincia (OSP)';
    }

    return { hasRegisteredOs: true, cleanOsName: clean };
}

async function detectIntentAndEntities(supabase: any, text: string, context?: ConversationContext): Promise<IntentDetectionResult> {
    const clean = text.toLowerCase().trim();

    // 0.1 CORTESÍA / AGRADECIMIENTO EN BASE AL CONTEXTO PREVIO
    const isGratitude = /^(muchas\s+gracias|gracias|much[ií]simas\s+gracias|dale\s+gracias|perfecto\s+gracias|genial\s+gracias|buen[ií]simo|ok\s+gracias|chau|listo\s+gracias|muy\s+amable|graciass)[!.\s]*$/i.test(clean);
    if (isGratitude && context?.history && context.history.length > 0) {
        return { intent: 'agradecimiento_cierre', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 0.2 ACCIÓN DIRECTA SOBRE TURNO ONLINE (SI EL BOT O ASESOR PREGUNTÓ O EXISTE TURNO)
    const lastBotContent = (context?.lastBotMessage?.content || '').toLowerCase();
    const isBotAskingAboutTurnoOnline = lastBotContent.includes('turno online agendado') || lastBotContent.includes('deseás confirmar') || /albacar/i.test(lastBotContent);

    if (isBotAskingAboutTurnoOnline || context?.turnoOnlineProximo) {
        if (/^(si|sí|confirmar|confirmo|si\s*confirmo|por\s+favor\s+confirmo|dale\s+confirmo|voy\s+a\s+ir|confirmamelo|ok\s+confirmo|si\s+voy|confirmado)[!.\s]*$/i.test(clean)) {
            return { intent: 'confirmar_turno_online', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
        }
        if (/\b(cancelar|cancelo|no\s+voy\s+a\s+poder|anular|dar\s+de\s+baja|no\s+puedo\s+ir|cancela\s+el\s+turno)\b/i.test(clean)) {
            return { intent: 'cancelar_turno_online', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
        }
        if (/\b(reprogramar|cambiar|otro\s+dia|otro\s+horario|otra\s+fecha|reprogramamelo)\b/i.test(clean)) {
            return { intent: 'reprogramar_turno_online', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
        }
    }

    // 0.3 SEGUIMIENTO DE CASO CON ASESOR HUMANO (SI EL ASESOR PIDIÓ DOCUMENTACIÓN O PREGUNTÓ ALGO)
    if (context?.hasAgentIntervened && context?.lastAgentMessage) {
        const lastAgentText = (context.lastAgentMessage.content || '').toLowerCase();
        if ((lastAgentText.includes('orden') || lastAgentText.includes('foto') || lastAgentText.includes('estudio') || lastAgentText.includes('dni')) &&
            /\b(te\s+mando|te\s+paso|aca\s+esta|adjunto|foto|orden|comprobante|mando|paso)\b/i.test(clean)) {
            return { intent: 'seguimiento_asesor', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
        }
    }

    // 0.4 DETECCIÓN POR OPCIÓN DIRECTA DEL MENÚ HISTÓRICO (LETRAS A..M o NÚMEROS 1..4)
    if (/^[a|a️⃣]$/i.test(clean) || /^opci[oó]n\s*a$/i.test(clean)) {
        return { intent: 'informes_general', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: 'A' };
    }
    if (/^[b|b️⃣]$/i.test(clean) || /^opci[oó]n\s*b$/i.test(clean)) {
        return { intent: 'curso_embarazadas', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: 'B' };
    }
    if (/^[c|c️⃣]$/i.test(clean) || /^opci[oó]n\s*c$/i.test(clean)) {
        return { intent: 'vacunatorio', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: 'C' };
    }
    if (/^[d|d️⃣]$/i.test(clean) || /^opci[oó]n\s*d$/i.test(clean)) {
        return { intent: 'registro_civil', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: 'D' };
    }
    if (/^[e|e️⃣]$/i.test(clean) || /^opci[oó]n\s*e$/i.test(clean)) {
        return { intent: 'administracion_presupuestos', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: 'E' };
    }
    if (/^[f|f️⃣]$/i.test(clean) || /^opci[oó]n\s*f$/i.test(clean)) {
        return { intent: 'horarios_sedes', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: 'F' };
    }
    if (/^[g|g️⃣]$/i.test(clean) || /^opci[oó]n\s*g$/i.test(clean)) {
        return { intent: 'telefonos_sedes', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: 'G' };
    }
    if (/^[h|h️⃣]$/i.test(clean) || /^opci[oó]n\s*h$/i.test(clean)) {
        return { intent: 'reclamos_calidad', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: 'H' };
    }
    if (/^[i|i️⃣]$/i.test(clean) || /^opci[oó]n\s*i$/i.test(clean)) {
        return { intent: 'chequeo', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: 'I' };
    }
    if (/^[j|j️⃣]$/i.test(clean) || /^opci[oó]n\s*j$/i.test(clean)) {
        return { intent: 'servicio_laboratorio', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: 'J' };
    }
    if (/^[k|k️⃣]$/i.test(clean) || /^opci[oó]n\s*k$/i.test(clean)) {
        return { intent: 'fundacion', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: 'K' };
    }
    if (/^[l|l️⃣]$/i.test(clean) || /^opci[oó]n\s*l$/i.test(clean)) {
        return { intent: 'turno', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: 'L' };
    }
    const isLastBotImageMenu = lastBotContent.includes('recibimos tu imagen') || lastBotContent.includes('presupuesto o aranceles particulares');
    const isLastBotGreetingMenu = 
        context?.botStage === 'menu_opciones' ||
        lastBotContent.includes('otro paciente / familiar') || 
        lastBotContent.includes('el turno o autorización es para mí') ||
        lastBotContent.includes('¿el trámite es para vos') ||
        lastBotContent.includes('estás gestionando para otro paciente');

    if (/^[1|1️⃣]$/.test(clean) || /^opci[oó]n\s*1$/i.test(clean)) {
        if (isLastBotGreetingMenu) {
            return { intent: 'gestion_propia', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: '1' };
        }
        return { intent: 'turno', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: '1' };
    }
    if (/^[2|2️⃣]$/.test(clean) || /^opci[oó]n\s*2$/i.test(clean)) {
        if (isLastBotGreetingMenu) {
            return { intent: 'gestion_familiar', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: '2' };
        }
        return { intent: 'autorizacion', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: '2' };
    }
    if (/^[3|3️⃣]$/.test(clean) || /^opci[oó]n\s*3$/i.test(clean)) {
        if (isLastBotImageMenu) {
            return { intent: 'administracion_presupuestos', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: '3' };
        }
        return { intent: 'guardia', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: '3' };
    }
    if (/^[4|4️⃣]$/.test(clean) || /^opci[oó]n\s*4$/i.test(clean)) {
        if (isLastBotImageMenu) {
            return { intent: 'derivacion_agente', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: '4' };
        }
        return { intent: 'informes_general', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: '4' };
    }

    // 1. GUARDIAS MÉDICAS 24 HORAS
    const isGuardia = /\b(guardia|guardias|urgencia|urgencias|emergencia|emergencias|medico\s+de\s+guardia|pediatra\s+de\s+guardia|clinico\s+de\s+guardia)\b/i.test(clean);
    if (isGuardia) {
        return { intent: 'guardia', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 2. CHEQUEO PREVENTIVO DE SALUD
    const isChequeo = /\b(chequeo|chequeos|chequeo\s+preventivo|circuito\s+preventivo|chequeo\s+de\s+salud|control\s+anual|chequeo\s+anual|estudios\s+preventivos)\b/i.test(clean);
    if (isChequeo) {
        return { intent: 'chequeo', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 3. PROGRAMA PREVENIR (OSP)
    const isPrevenir = /\b(programa\s+prevenir|prevenir|el\s+prevenir|turno\s+(?:para\s+)?prevenir|hacerme\s+(?:el\s+)?prevenir|sacar\s+(?:el\s+)?prevenir|estudios?\s+(?:de\s+|del\s+)?prevenir)\b/i.test(clean);
    if (isPrevenir) {
        return { intent: 'prevenir', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 4. INFORMES Y RESULTADOS DE ESTUDIOS
    const isInfLab = /\b(resultados?\s+(?:de\s+)?(?:los\s+|mis\s+|el\s+)?(?:analisis|laboratorio|sangre|orina)|ver\s+(?:mis\s+|los\s+)?(?:analisis|laboratorio)|portal\s+laboratorio|clave\s+laboratorio|informes?\s+(?:de\s+)?(?:laboratorio|analisis))\b/i.test(clean);
    if (isInfLab) {
        return { intent: 'informes_laboratorio', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    const isInfImg = /\b(resultados?\s+(?:de\s+)?(?:la\s+|el\s+|mis\s+|las\s+)?(?:ecografia|resonancia|radiografia|tomografia|mamografia|imagenes|estudios?)|ver\s+(?:mi\s+|mis\s+)?(?:ecografia|resonancia|radiografia|tomografia|mamografia|estudio)|portal\s+imagenes|informes?\s+(?:de\s+)?(?:imagenes|diagnostico\s+por\s+imagen))\b/i.test(clean);
    if (isInfImg) {
        return { intent: 'informes_imagenes', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    const isInfPap = /\b(biopsia|biopsias|pap\b|papanicolau|citologia|resultado\s+(?:de\s+)?(?:la\s+)?biopsia|resultado\s+(?:del\s+)?pap)\b/i.test(clean);
    if (isInfPap) {
        return { intent: 'informes_biopsia_pap', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    const isInfGen = /\b(solicitar\s+informes?|mis\s+informes?|mis\s+estudios?|resultados?\s+de\s+estudios?|entrega\s+de\s+informes?)\b/i.test(clean);
    if (isInfGen) {
        return { intent: 'informes_general', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 5. ATENCIÓN Y EXTRACCIÓN DE LABORATORIO (IR A HACERSE LOS ANÁLISIS)
    const isServicioLab = /\b(hacerme\s+(?:un\s+|el\s+)?(?:analisis|laboratorio|estudio\s+de\s+sangre)|sacar\s+sangre|extraccion(?:es)?|ayuno\s+(?:para\s+)?analisis|horario\s+(?:de\s+)?laboratorio|guardia\s+de\s+laboratorio)\b/i.test(clean);
    if (isServicioLab) {
        return { intent: 'servicio_laboratorio', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 6. VACUNATORIO
    const isVacunatorio = /\b(vacuna|vacunas|vacunatorio|vacunacion|vacunarse|calendario\s+(?:de\s+)?vacunacion)\b/i.test(clean);
    if (isVacunatorio) {
        return { intent: 'vacunatorio', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 7. CURSO DE EMBARAZADAS Y YOGA
    const isCursoEmb = /\b(embarazada|embarazadas|preparto|gimnasia\s+(?:para\s+)?embarazadas|curso\s+(?:de\s+|para\s+)?embarazadas|yoga\s+(?:para\s+)?embarazadas)\b/i.test(clean);
    if (isCursoEmb) {
        return { intent: 'curso_embarazadas', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 8. REGISTRO CIVIL (INSCRIPCIÓN DE NACIMIENTOS)
    const isRegistroCivil = /\b(registro\s+civil|inscribir\s+(?:a\s+mi\s+)?(?:bebe|hijo|hija|nacimiento|recien\s+nacido)|partida\s+(?:de\s+)?nacimiento|acta\s+(?:de\s+)?nacimiento|inscripcion\s+(?:de\s+)?nacimiento)\b/i.test(clean);
    if (isRegistroCivil) {
        return { intent: 'registro_civil', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 9. ADMINISTRACIÓN, CIRUGÍAS Y PRESUPUESTOS
    const isAdminPresup = /\b(presupuesto|presupuestos|costo\s+(?:de\s+)?(?:cirugia|operacion)|precio\s+(?:de\s+)?(?:cirugia|operacion)|administracion\s+internado|cobertura\s+(?:de\s+)?cirugia)\b/i.test(clean);
    if (isAdminPresup) {
        return { intent: 'administracion_presupuestos', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 10. HORARIOS DE SEDES Y VISITAS
    const isHorarios = /\b(horarios?\s+(?:de\s+)?(?:atencion|sedes?)|a\s+que\s+hora\s+(?:abren|cierran|atienden)|horarios?\s+(?:de\s+)?visita|visitas?\s+(?:de\s+)?internad[oa]s?)\b/i.test(clean);
    if (isHorarios) {
        return { intent: 'horarios_sedes', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 11. TELÉFONOS Y WHATSAPPS DE SEDES Y SECTORES
    const isTelefonos = /\b(telefonos?|whatsapps?|wa\.link|numeros?\s+(?:de\s+)?(?:telefono|contacto)|contactos?\s+(?:de\s+)?(?:whatsapp|telefono|las\s+sedes|sede)|contacto\s+sede)\b/i.test(clean);
    if (isTelefonos) {
        let sectorKey: string | null = null;
        if (/fertilidad|reproductiva/i.test(clean)) sectorKey = 'fertilidad';
        else if (/administracion|presupuesto/i.test(clean)) sectorKey = 'administracion';
        else if (/internacion/i.test(clean)) sectorKey = 'internacion';
        else if (/citologia/i.test(clean)) sectorKey = 'citologia';
        else if (/imagen|radiologia|ecografia|mamografia/i.test(clean)) sectorKey = 'imagenes';
        else if (/laboratorio/i.test(clean)) sectorKey = 'laboratorio';
        else if (/fundacion/i.test(clean)) sectorKey = 'fundacion';
        return { intent: 'telefonos_sedes', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null, sectorKey };
    }

    // 12. RECLAMOS, SUGERENCIAS Y ENCUESTAS DE CALIDAD
    const isReclamos = /\b(reclamo|reclamos|queja|quejas|sugerencia|sugerencias|encuesta|encuestas|area\s+de\s+calidad|disconforme|mala\s+atencion)\b/i.test(clean);
    if (isReclamos) {
        return { intent: 'reclamos_calidad', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 13. FUNDACIÓN SANATORIO ARGENTINO
    const isFundacion = /\b(fundacion|fsa\b|campañas?\s+(?:de\s+)?salud\s+(?:ginecologica|pediatrica)|charlas\s+de\s+la\s+fundacion)\b/i.test(clean);
    if (isFundacion) {
        return { intent: 'fundacion', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 14. DERIVACIÓN EXPLÍCITA A ASESOR HUMANO / OPERADOR
    const isAgente = /\b(hablar\s+con\s+(?:un\s+|una\s+)?(?:asesor|asesora|persona|operador|operadora|humano|agente|representante|alguien)|atencion\s+humana|comunicarme\s+con\s+(?:alguien|un\s+agente)|pasame\s+con\s+(?:un\s+|una\s+)?(?:asesor|asesora|operador|agente))\b/i.test(clean);
    if (isAgente) {
        return { intent: 'derivacion_agente', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 15. DETECCIÓN DE TURNO / DOCTOR / AUTORIZACIÓN
    const isTurno = /\b(turno|turnos|cita|citas|reprogramar|reprogramacion|atencion|consulta|consultar|agendar|doctor|doctora|dr\b|dra\b|medico|medica|especialista|clinico|cardiolog|pediatr|ginecolog|traumatolog|dermatolog|neurolog|urolog|oftalmolog)\b/i.test(clean);
    const isAutoriz = /\b(autoriz|autorizar|orden|ordenes|pedido|pedidos|receta|recetas|cobertura|coseguro|auditoria)\b/i.test(clean);
    const isInfo = /\b(informacion|donde\s+queda|ubicacion|direccion|sede|sedes|web|portal|precios?|particular|cartilla|servicios)\b/i.test(clean);

    // Extracción inteligente de nombre de doctor/médico
    let doctorCandidate: string | null = null;
    const docRegexes = [
        /(?:doctor|doctora|dr|dra)\.?\s+([a-záéíóúñ]+)/i,
        /(?:con|para)\s+(?:el\s+|la\s+)?(?:dr\.?|doctor|dra\.?|doctora)\s+([a-záéíóúñ]{3,})/i
    ];

    for (const reg of docRegexes) {
        const m = clean.match(reg);
        if (m && m[1]) {
            const word = m[1].toLowerCase().trim();
            if (!STOPWORDS_MEDICOS.has(word) && word.length >= 3) {
                doctorCandidate = word;
                break;
            }
        }
    }

    // Buscar en la base de datos de parámetros médicos de Sanatorio Argentino
    let doctorRecord: any = null;
    if (doctorCandidate) {
        try {
            const isDoctorFemale = /\b(doctora|dra\.?|la\s+doctora)\b/i.test(clean);
            const isDoctorMale = /\b(doctor|dr\.?|el\s+doctor)\b/i.test(clean) && !isDoctorFemale;

            const { data: docs } = await supabase
                .from('contact_center_doctor_parameters')
                .select('id, profesional_nombre, especialidad, consultorio_actual, condiciones_consulta')
                .ilike('profesional_nombre', `%${doctorCandidate}%`)
                .limit(10);

            if (docs && docs.length > 0) {
                if (isDoctorMale) {
                    doctorRecord = docs.find((d: any) => !d.profesional_nombre.toUpperCase().includes('DRA.')) || docs[0];
                } else if (isDoctorFemale) {
                    doctorRecord = docs.find((d: any) => d.profesional_nombre.toUpperCase().includes('DRA.')) || docs[0];
                } else {
                    doctorRecord = docs[0];
                }
            }
        } catch (e) {
            console.warn('[intent-detector] Error consultando doctor parameters:', e);
        }
    }

    // Si no se detectó doctor en el mensaje actual, buscar si se mencionó en el contexto reciente (Bot o Asesor)
    if (!doctorCandidate && context?.history && context.history.length > 0) {
        const lastBotText = (context.lastBotMessage?.content || '').toLowerCase();
        const lastAgentText = (context.lastAgentMessage?.content || '').toLowerCase();
        for (const reg of docRegexes) {
            const m = lastBotText.match(reg) || lastAgentText.match(reg);
            if (m && m[1]) {
                const word = m[1].toLowerCase().trim();
                if (!STOPWORDS_MEDICOS.has(word) && word.length >= 3) {
                    doctorCandidate = word;
                    break;
                }
            }
        }
    }

    const isGestionFamiliar = /\b(otro\s+paciente|otra\s+persona|familiar|familiares|mi\s+hijo|mi\s+hija|mi\s+bebe|mi\s+mam[aá]|mi\s+pap[aá]|mi\s+espos[oa]|mi\s+marido|mi\s+se[nñ]ora|para\s+alguien\s+mas)\b/i.test(clean);
    const isGestionPropia = /\b(para\s+m[ií]|es\s+para\s+m[ií]|tr[aá]mite\s+para\s+m[ií]|a\s+mi\s+nombre|para\s+mi\s+persona)\b/i.test(clean);

    let intent: IntentDetectionResult['intent'] = 'general';
    if (isTurno || doctorRecord) {
        intent = 'turno';
    } else if (isAutoriz) {
        intent = 'autorizacion';
    } else if (isGestionFamiliar) {
        intent = 'gestion_familiar';
    } else if (isGestionPropia) {
        intent = 'gestion_propia';
    } else if (isInfo) {
        intent = 'info';
    }

    // Si aún no se determinó la intención y hay historial conversacional, usar OpenAI con contexto
    if (intent === 'general' && context?.history && context.history.length > 0) {
        const openAiKey = Deno.env.get('OPENAI_API_KEY');
        if (openAiKey) {
            try {
                const thread = context.history.slice(-6).map((m: any) => {
                    const role = m.direction === 'incoming' 
                        ? (context.patientName || 'Paciente') 
                        : (m.sender_name === 'Bot Sanatorio' || m.raw_payload?.bot ? 'Bot' : `Asesor_Humano (${m.sender_name || 'Agente'})`);
                    return `${role}: ${m.content}`;
                }).join('\n');

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
                                content: `Eres el clasificador contextual del Contact Center de Sanatorio Argentino.
Analiza la intención del último mensaje del paciente considerando el hilo de la conversación previa con el Bot o con el Asesor Humano.
Intenciones posibles:
- "turno": solicitud o consulta sobre turnos médicos
- "confirmar_turno_online": el paciente confirma su turno
- "cancelar_turno_online": el paciente cancela su turno
- "reprogramar_turno_online": el paciente pide cambiar fecha/horario de su turno
- "autorizacion": orden médica, autorización o coseguro
- "gestion_familiar": el paciente indica que gestiona para otro paciente o familiar (hijo, cónyuge, etc.)
- "gestion_propia": el paciente indica que el trámite es para sí mismo
- "guardia": consulta sobre guardias o urgencias
- "chequeo": circuito de chequeo preventivo
- "informes_laboratorio": ver o consultar análisis clínicos
- "informes_imagenes": estudios de imágenes
- "seguimiento_asesor": responde a lo acordado con el asesor humano
- "agradecimiento_cierre": agradece o se despide
- "general": si no encaja en ninguna
Devuelve un JSON con:
{
  "intent": string,
  "doctor": string o null
}`
                            },
                            {
                                role: 'user',
                                content: `Historial reciente:\n${thread}\n\nÚltimo mensaje del paciente:\n"${text}"`
                            }
                        ],
                        temperature: 0.1,
                        max_tokens: 150
                    })
                });

                if (aiRes.ok) {
                    const aiData = await aiRes.json();
                    const parsed = JSON.parse(aiData.choices?.[0]?.message?.content || '{}');
                    if (parsed.intent && parsed.intent !== 'general') {
                        intent = parsed.intent as any;
                    }
                    if (parsed.doctor && !doctorCandidate) {
                        doctorCandidate = parsed.doctor.toLowerCase().trim();
                    }
                }
            } catch (err) {
                console.warn('[intent-detector] Fallback OpenAI contextual error:', err);
            }
        }
    }

    return {
        intent,
        doctorCandidate,
        doctorRecord,
        isExplicitNumberOption: null
    };
}

// =============================================
// MOTOR DE TRIAGE DEL CHATBOT (AHORRO DE MENSAJES Y EXTRACCIÓN CON IA)
// =============================================

async function handleChatbotTriage(
    supabase: any,
    phone: string,
    incomingText: string,
    senderName: string | null,
    lineId: string | null,
    mediaType?: string | null,
    mediaUrl?: string | null
) {
    if (!phone || (!incomingText && !mediaUrl)) return;
    const cleanText = (incomingText || '').trim();
    const isIncomingMedia = (mediaType === 'image' || mediaType === 'document' || cleanText === '[image]' || cleanText === '[document]' || Boolean(mediaUrl));

    // 1. Obtener estado actual de la conversación
    const { data: conv } = await supabase
        .from('contact_center_conversations')
        .select('*')
        .eq('phone', phone)
        .maybeSingle();

    // Comprobar si la conversación previa estaba cerrada, finalizada o archivada
    const wasClosed = Boolean(
        conv?.closed_at || 
        conv?.resolution_reason || 
        ['archivado', 'finalizado', 'cerrado'].includes(conv?.status) ||
        conv?.closed_by_agent_id
    );

    // Si el chat estaba cerrado y el paciente vuelve a escribir:
    // REACTIVAR TODO A CERO para que el paciente hable con el bot desde 'inicio'
    if (wasClosed) {
        console.log(`[triage-bot] Chat ${phone} estaba cerrado (${conv?.resolution_reason || conv?.status}). REACTIVANDO TODO A CERO para nueva atención.`);
        await supabase
            .from('contact_center_conversations')
            .update({
                closed_at: null,
                resolution_reason: null,
                closed_by_agent_id: null,
                closed_by_agent_name: null,
                assigned_agent_id: null,
                assigned_agent_name: null,
                assigned_at: null,
                status: 'sin_asignar',
                bot_active: true,
                bot_stage: 'inicio',
                motivo_consulta: null,
                medico_o_especialidad: null,
                updated_at: new Date().toISOString()
            })
            .eq('phone', phone);

        if (conv) {
            conv.assigned_agent_id = null;
            conv.assigned_agent_name = null;
            conv.assigned_at = null;
            conv.closed_at = null;
            conv.resolution_reason = null;
            conv.closed_by_agent_id = null;
            conv.closed_by_agent_name = null;
            conv.status = 'sin_asignar';
            conv.bot_active = true;
            conv.bot_stage = 'inicio';
        }
    }

    // Si la conversación NO estaba cerrada y ya está asignada a un agente humano en vivo
    // O si el bot fue silenciado/pausado manualmente o ya está esperando a un asesor, NO responder
    if (conv && !wasClosed) {
        if (conv.assigned_agent_id || conv.bot_active === false || conv.bot_stage === 'esperando_agente') {
            console.log(`[triage-bot] Chat ${phone} asignado a ${conv.assigned_agent_name || conv.assigned_agent_id}, bot_active=false o bot_stage=${conv.bot_stage}. Bot en silencio.`);
            
            const silentUpdates: Record<string, any> = {
                last_message_text: cleanText,
                last_message_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                bot_active: false // asegurar que permanezca en silencio
            };
            const candidateDni = cleanText.match(/\b\d{7,8}\b/)?.[0];
            if (candidateDni && !conv.dni) {
                silentUpdates.dni = candidateDni;
            }
            await supabase.from('contact_center_conversations').update(silentUpdates).eq('phone', phone);
            return;
        }
    }

    let currentStage = (wasClosed ? 'inicio' : (conv?.bot_stage || 'inicio'));
    let replyText = '';
    let nextStage = currentStage;
    let updates: Record<string, any> = {
        last_message_text: cleanText,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    if (wasClosed) {
        updates.closed_at = null;
        updates.resolution_reason = null;
        updates.closed_by_agent_id = null;
        updates.closed_by_agent_name = null;
        updates.assigned_agent_id = null;
        updates.assigned_agent_name = null;
        updates.assigned_at = null;
        updates.status = 'sin_asignar';
        updates.bot_active = true;
        updates.bot_stage = 'inicio';
        updates.motivo_consulta = null;
        updates.medico_o_especialidad = null;
    }

    // Helper de extracción de DNI rápido por expresión regular (7 u 8 dígitos)
    const normalizedText = cleanText.replace(/\./g, '');
    const dniMatch = cleanText.match(/\b\d{7,8}\b/) || normalizedText.match(/\b\d{7,8}\b/);
    const candidateDni = dniMatch ? dniMatch[0] : (conv?.dni || null);

    // Búsqueda en el padrón maestro de SALUS (hospital_pacientes)
    // 1. Prioridad: Mapeo automático por TELÉFONO (+549..., 549..., 264..., 15..., 54..., etc.)
    // Si hay varios pacientes vinculados al mismo teléfono (ej: madre e hijos), la RPC devuelve primero al de MAYOR EDAD (madre/titular).
    let paciente: any = null;
    let familiaresDetectados: any[] = [];
    if (phone) {
        try {
            const { data: rpcRes, error: rpcErr } = await supabase.rpc('buscar_paciente_por_telefono', { p_telefono: phone });
            if (!rpcErr && rpcRes && rpcRes.length > 0) {
                familiaresDetectados = rpcRes;
                // Por defecto: persona de mayor edad (madre / titular a cargo)
                paciente = rpcRes[0];
                console.log(`[triage-bot] Paciente principal (mayor edad/madre) por Teléfono ${phone}: ${paciente.nombre} (${paciente.edad} años)`);

                // Si hay más de un miembro familiar en la misma línea telefónica:
                if (familiaresDetectados.length > 1) {
                    const textLower = cleanText.toLowerCase();

                    // A. ¿El usuario escribió el DNI de algún familiar específico?
                    const matchDniFam = familiaresDetectados.find(f => f.dni && textLower.includes(String(f.dni).trim()));
                    if (matchDniFam) {
                        paciente = matchDniFam;
                        console.log(`[triage-bot] Conmutado a familiar por DNI explícito en mensaje: ${paciente.nombre} (DNI: ${paciente.dni})`);
                    } else {
                        // B. ¿El usuario menciona el nombre de pila de algún familiar? (ej: "Felipe", "Sofia", etc.)
                        const matchNombreFam = familiaresDetectados.find(f => {
                            const raw = (f.nombre || '').toLowerCase();
                            // Si formato es "APELLIDO, NOMBRE" extraer NOMBRE
                            const pName = raw.includes(',') ? raw.split(',')[1].trim().split(' ')[0] : raw.split(' ')[0];
                            return pName && pName.length >= 3 && new RegExp(`\\b${pName}\\b`, 'i').test(textLower);
                        });

                        if (matchNombreFam) {
                            paciente = matchNombreFam;
                            console.log(`[triage-bot] Conmutado a familiar por mención de nombre ("${matchNombreFam.nombre}") en mensaje.`);
                        } else if (/\b(hijo|hija|nene|nena|bebe|bebé|niño|niña|pediatra|pediatria|pediatría)\b/i.test(textLower)) {
                            // C. Si menciona que es para su hijo/a o pediatría, y hay un menor de edad en el grupo familiar
                            const menorFam = familiaresDetectados.find(f => {
                                const ed = parseInt(String(f.edad || '99').replace(/\D/g, ''), 10);
                                return !isNaN(ed) && ed < 18;
                            });
                            if (menorFam) {
                                paciente = menorFam;
                                console.log(`[triage-bot] Conmutado a hijo/menor familiar por palabra clave de pediatría/hijo: ${paciente.nombre} (${paciente.edad} años)`);
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[triage-bot] Error llamando buscar_paciente_por_telefono:', e);
        }
    }

    // 2. Si se detectó un DNI en el mensaje (candidateDni):
    // Un contacto/paciente puede gestionar un turno o autorización para OTRO paciente (hijo, cónyuge, familiar, etc.)
    // Por lo tanto, si hay candidateDni y no coincide con el paciente del teléfono, priorizamos el paciente del DNI aportado
    if (candidateDni && (!paciente || String(paciente.dni) !== String(candidateDni))) {
        const { data: pByDni, error: pacError } = await supabase
            .from('hospital_pacientes')
            .select('id_paciente, dni, nombre, coseguro, telefono, email, nhc, centro, edad, fecha_nacimiento')
            .eq('dni', candidateDni)
            .limit(1)
            .maybeSingle();

        if (pacError) {
            console.error('[triage-bot] Error consultando hospital_pacientes por DNI:', pacError);
        } else if (pByDni) {
            paciente = pByDni;
            console.log(`[triage-bot] Paciente conmutado a beneficiario por DNI provisto ${candidateDni}: ${paciente.nombre} (${paciente.coseguro})`);
        }
    }

    // 3. Fallback de búsqueda textual en teléfono si falló la RPC (ordenando por edad descendente para priorizar a la madre)
    if (!paciente && phone) {
        const rawPhoneDigits = phone.replace(/\D/g, '');
        const last7 = rawPhoneDigits.slice(-7);
        if (last7.length >= 6) {
            const { data: pByPhoneList } = await supabase
                .from('hospital_pacientes')
                .select('id_paciente, dni, nombre, coseguro, telefono, email, nhc, centro, edad, fecha_nacimiento')
                .ilike('telefono', `%${last7}%`)
                .order('edad', { ascending: false })
                .limit(5);

            if (pByPhoneList && pByPhoneList.length > 0) {
                familiaresDetectados = pByPhoneList;
                paciente = pByPhoneList[0];
                console.log(`[triage-bot] Paciente encontrado por fallback Teléfono ${last7} (prioridad edad): ${paciente.nombre} (${paciente.edad} años)`);
            }
        }
    }

    // Datos del paciente identificado
    const isExistingPatient = !!(paciente || conv?.dni);
    const rawFullName = (paciente?.nombre || conv?.nombre_completo || senderName || 'Paciente').trim();
    let displayName = rawFullName;
    if (rawFullName.includes(',')) {
        const parts = rawFullName.split(',').map(p => p.trim()).filter(Boolean);
        if (parts.length === 2) {
            displayName = `${parts[1]} ${parts[0]}`;
        }
    }
    const fullName = displayName;
    const os = (paciente?.coseguro || conv?.obra_social || 'Particular / A confirmar').trim();

    if (isExistingPatient) {
        updates = {
            ...updates,
            dni: paciente?.dni || candidateDni || conv?.dni,
            nombre_completo: fullName,
            obra_social: os,
            nhc: paciente?.nhc || conv?.nhc || null,
            fecha_nacimiento: paciente?.fecha_nacimiento || updates.fecha_nacimiento || conv?.fecha_nacimiento || null,
            email: paciente?.email || updates.email || conv?.email || null,
            telefono_contacto: paciente?.telefono || updates.telefono_contacto || phone,
            departamento: paciente?.centro || updates.departamento || conv?.departamento || 'San Juan',
            es_paciente_existente: true
        };
    }

    // 2. VINCULAR TURNOS ONLINE AGENDADOS DEL PACIENTE USANDO SU DNI
    const resolvedDni = updates.dni || paciente?.dni || candidateDni || conv?.dni || null;
    let turnoOnlineProximo: any = null;
    if (resolvedDni) {
        try {
            const todayIso = new Date().toISOString().split('T')[0];
            const { data: turnosOn } = await supabase
                .from('contact_center_turnos_online')
                .select('*')
                .eq('dni', resolvedDni)
                .gte('fechas_resumen', todayIso)
                .order('fechas_resumen', { ascending: true })
                .limit(1);

            if (turnosOn && turnosOn.length > 0) {
                const tRow = turnosOn[0];
                if (tRow.email && !updates.email) {
                    updates.email = tRow.email;
                }
                const primerTurno = Array.isArray(tRow.turnos) && tRow.turnos.length > 0 ? tRow.turnos[0] : null;
                turnoOnlineProximo = {
                    profesional: tRow.prestador_nombre || primerTurno?.profesional || 'Profesional Asignado',
                    fecha: primerTurno?.fechaTurno || tRow.fechas_resumen,
                    hora: primerTurno?.horaInicio || '16:30',
                    agenda: tRow.agenda_nombre || primerTurno?.agenda || 'Agenda de Consultorios',
                    motivo: primerTurno?.motivo || tRow.notas || ''
                };
                console.log(`[triage-bot] Turno online vinculado para DNI ${resolvedDni}:`, turnoOnlineProximo);
            }
        } catch (tErr) {
            console.warn('[triage-bot] Error vinculando turnos online:', tErr);
        }
    }

    // 2.1 RECUPERAR HISTORIAL RECIENTE PARA BRINDAR CONTEXTO CONVERSACIONAL (BOT Y ASESORES HUMANOS)
    const { data: rawHistory } = await supabase
        .from('whatsapp_messages')
        .select('id, direction, sender_name, content, created_at, raw_payload, media_type')
        .eq('phone', phone)
        .order('created_at', { ascending: false })
        .limit(15);

    const recentHistory = (rawHistory || []).reverse();

    // Detectar si el paciente envió recientemente una imagen o documento (en este mensaje o en los últimos 2)
    const patientSentImageRecently = isIncomingMedia || recentHistory.slice(-3).some((m: any) => 
        m.direction === 'incoming' && (m.media_type === 'image' || m.content === '[image]' || (m.raw_payload && m.raw_payload.media_type === 'image'))
    );

    // Detectar si un asesor humano intervino previamente en el chat
    const agentInterventions = recentHistory.filter((m: any) => 
        m.direction === 'outgoing' && 
        m.sender_name !== 'Bot Sanatorio' && 
        !m.raw_payload?.bot
    );
    const hasAgentIntervened = agentInterventions.length > 0;
    const lastAgentMessage = hasAgentIntervened ? agentInterventions[agentInterventions.length - 1] : null;

    // Detectar último mensaje del bot
    const botMessages = recentHistory.filter((m: any) => 
        m.direction === 'outgoing' && 
        (m.sender_name === 'Bot Sanatorio' || m.raw_payload?.bot)
    );
    const lastBotMessage = botMessages.length > 0 ? botMessages[botMessages.length - 1] : null;
    const lastBotContent = (lastBotMessage?.content || '').toLowerCase();

    // ¿El bot estaba esperando activamente una foto de orden médica?
    const wasWaitingForPhoto = 
        conv?.bot_stage === 'esperando_orden_foto' ||
        lastBotContent.includes('foto clara de la orden') ||
        (lastBotContent.includes('envíanos:') && lastBotContent.includes('orden'));

    // ¿La imagen fue enviada de la nada (sin contexto previo del bot ni indicación de trámite en el texto)?
    const isImageWithoutContext = !wasWaitingForPhoto && (
        (isIncomingMedia && (
            cleanText === '[image]' || 
            cleanText === '[document]' || 
            cleanText === '' ||
            /^(hola|buenas|buen\s+dia|buenas\s+tardes|buenas\s+noches|doc|doctor|hola\s+buenas|foto|orden|aca\s+esta|te\s+paso)[!.\s]*$/i.test(cleanText)
        )) ||
        (patientSentImageRecently && /^(hola|buenas|buen\s+dia|buenas\s+tardes|buenas\s+noches|doc|doctor|hola\s+buenas)[!.\s]*$/i.test(cleanText) && (conv?.bot_stage === 'inicio' || wasClosed || !conv))
    );

    // 3. DETECTAR INTENCIÓN Y ENTIDADES (CON MEMORIA CONVERSACIONAL Y SEGUIMIENTO DE ASESORES)
    const conversationContext: ConversationContext = {
        history: recentHistory,
        lastBotMessage,
        lastAgentMessage,
        hasAgentIntervened,
        agentName: lastAgentMessage?.sender_name || conv?.closed_by_agent_name || null,
        turnoOnlineProximo,
        patientName: fullName,
        resolvedDni,
        previousResolutionReason: wasClosed ? conv?.resolution_reason : null,
        botStage: conv?.bot_stage || null
    };

    const analysis = await detectIntentAndEntities(supabase, cleanText, conversationContext);
    console.log(`[triage-bot] Análisis contextual para "${cleanText}":`, analysis);

    // Construir etiqueta de doctor SOLO si fue verificado en base de datos o venía con Dr./Dra. explícito y no es stopword
    let rawDocName = analysis.doctorRecord?.profesional_nombre || null;
    if (!rawDocName && analysis.doctorCandidate && !STOPWORDS_MEDICOS.has(analysis.doctorCandidate.toLowerCase())) {
        if (/\b(doctor|doctora|dr|dra)\.?\s+/i.test(cleanText)) {
            rawDocName = analysis.doctorCandidate.charAt(0).toUpperCase() + analysis.doctorCandidate.slice(1).toLowerCase();
        }
    }
    if (rawDocName) {
        rawDocName = rawDocName.replace(/^\([^)]+\)\s*/, '').replace(/\s*\([^)]+\)$/, '').replace(/\s+SSLN$/i, '').trim();
    }
    const hasHonorific = rawDocName && /^(dr|dra)\.?/i.test(rawDocName);
    const doctorDisplay = rawDocName ? (hasHonorific ? rawDocName : `Dr. ${rawDocName}`) : null;
    const doctorSpecialty = analysis.doctorRecord?.especialidad ? ` (${analysis.doctorRecord.especialidad})` : '';

    // =============================================
    // FLUJO ESPECIAL: IMAGEN U ORDEN MÉDICA ENVIADA SIN CONTEXTO PREVIO
    // Si el paciente envía una foto/documento sin que el bot la haya pedido previamente,
    // o saluda inmediatamente después de haberla enviado, consultarle qué gestión desea realizar.
    // =============================================
    if (isImageWithoutContext) {
        console.log(`[triage-bot] Chat ${phone}: Imagen/orden médica enviada sin contexto previo. Preguntando al paciente qué desea realizar.`);
        updates.motivo_consulta = 'Imagen / Orden médica recibida (aguardando selección de trámite)';
        updates.bot_stage = 'menu_opciones';
        updates.bot_active = true;
        nextStage = 'menu_opciones';

        if (isExistingPatient) {
            replyText = `¡Hola *${fullName}*! 🏥 Recibimos tu imagen / orden médica.\n\n` +
                `Para orientarte con la gestión correspondiente, por favor indícanos qué deseás realizar:\n\n` +
                `1️⃣ *Solicitar un turno* para el estudio o práctica médica\n` +
                `2️⃣ *Autorización de orden médica* (para presentar a tu obra social o coseguro)\n` +
                `3️⃣ *Presupuesto o aranceles particulares*\n` +
                `4️⃣ *Hablar con un asesor humano*\n\n` +
                `Podés responder directamente con el número *1*, *2*, *3* o *4*, o detallarnos tu consulta por escrito.`;
        } else {
            replyText = `¡Hola! 👋 Te damos la bienvenida a *Sanatorio Argentino*. Recibimos tu imagen / orden médica.\n\n` +
                `Para orientarte con la gestión correspondiente, por favor indícanos qué deseás realizar:\n\n` +
                `1️⃣ *Solicitar un turno* para el estudio o práctica médica\n` +
                `2️⃣ *Autorización de orden médica* (para presentar a tu obra social o cobertura)\n` +
                `3️⃣ *Presupuesto o aranceles particulares*\n` +
                `4️⃣ *Hablar con un asesor humano*\n\n` +
                `Podés responder directamente con el número *1*, *2*, *3* o *4*, o escribirnos tu consulta junto a tu *Nombre completo* y *DNI*.`;
        }
    }
    // =============================================
    // FLUJO 1: PACIENTE RESPONDIENDO DNI O DATOS DESDE NÚMERO NUEVO/NO REGISTRADO
    // =============================================
    else if (currentStage === 'esperando_dni' || currentStage === 'esperando_datos_nuevo') {
        // ¿El DNI provisto coincide con un paciente existente en SALUS?
        if (candidateDni && (!paciente || String(paciente.dni) !== String(candidateDni))) {
            const { data: pFound } = await supabase
                .from('hospital_pacientes')
                .select('id_paciente, dni, nombre, coseguro, telefono, email, nhc, centro, edad, fecha_nacimiento')
                .eq('dni', candidateDni)
                .limit(1)
                .maybeSingle();
            if (pFound) {
                paciente = pFound;
                console.log(`[triage-bot] Paciente encontrado en SALUS por DNI provisto: ${paciente.nombre}`);
            }
        }

        if (paciente) {
            updates = {
                ...updates,
                dni: paciente.dni || candidateDni,
                nombre_completo: paciente.nombre,
                obra_social: paciente.coseguro || 'Particular / A confirmar',
                nhc: paciente.nhc || null,
                email: paciente.email || updates.email || null,
                telefono_contacto: paciente.telefono || phone,
                departamento: paciente.centro || 'San Juan',
                es_paciente_existente: true,
                status: 'sin_asignar',
                bot_active: false
            };
            nextStage = 'esperando_agente';
            updates.ai_summary = buildTriageSummary(updates, analysis.intent, analysis.doctorRecord, true, paciente.edad);

            replyText = `¡Muchas gracias *${paciente.nombre}*! ✅ Encontramos tu historia clínica en Sanatorio Argentino.\n\n${getAgentHandoffNotice()}`;
        } else {
            // Paciente no registrado en SALUS -> Onboarding express de los 6 datos obligatorios
            const res = await handleNewPatientIntake(
                cleanText,
                candidateDni,
                conv,
                phone,
                updates,
                analysis.intent,
                analysis.doctorRecord,
                doctorDisplay
            );
            nextStage = res.nextStage;
            replyText = res.replyText;
        }
    } 
    // =============================================
    // FLUJO: GUARDIAS MÉDICAS 24 HORAS
    // =============================================
    else if (analysis.intent === 'guardia') {
        updates.motivo_consulta = 'Guardia Médica 24hs / Urgencias';
        replyText = `🚨 *Guardias Médicas las 24 Horas — Sanatorio Argentino*\n\n` +
            `Contamos con un servicio permanente de guardia médica activa las 24 horas, todos los días del año, por orden de llegada con triage de urgencia en nuestra *SEDE 01*:\n\n` +
            `📍 *Lugar de atención:* San Luis 432 Oeste, Capital, San Juan.\n\n` +
            `🩺 *Especialidades disponibles de guardia:*\n` +
            `• *Clínica Médica* (Adultos)\n` +
            `• *Pediatría* (Guardia Pediátrica activa 24 hs)\n` +
            `• *Ginecología y Obstetricia* (Maternidad y urgencias)\n` +
            `• *Guardia Cardiológica*\n` +
            `• *Cirugía General* (Guardia pasiva especializada)\n\n` +
            `🌐 Para más información institucional podés ingresar a:\n👉 https://www.sanatorioargentino.com.ar/`;
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: CHEQUEO PREVENTIVO DE SALUD
    // =============================================
    else if (analysis.intent === 'chequeo') {
        updates.motivo_consulta = 'Chequeo Preventivo de Salud';
        updates.medico_o_especialidad = 'Circuito Chequeo Preventivo';

        const infoChequeo = `El *Chequeo Preventivo de Salud* te permite realizar todos tus estudios de rutina en una sola mañana (laboratorio, imágenes, cardiología y clínica) sin traslados.\n\n` +
            `👉 Más detalles: https://www.sanatorioargentino.com.ar/chequeo-preventivo-de-salud.html\n\n` +
            `Nuestro equipo coordina todos los especialistas por vos.`;

        if (isExistingPatient) {
            replyText = `¡Hola *${fullName}*! 🏥\n\n${infoChequeo}\n\n${getAgentHandoffNotice()}`;
            updates.status = 'sin_asignar';
            updates.bot_active = false;
            nextStage = 'esperando_agente';
            updates.ai_summary = buildTriageSummary(updates, 'chequeo', analysis.doctorRecord, true, paciente?.edad);
        } else {
            const res = await handleNewPatientIntake(
                cleanText,
                candidateDni,
                conv,
                phone,
                updates,
                'chequeo',
                analysis.doctorRecord,
                doctorDisplay,
                infoChequeo
            );
            nextStage = res.nextStage;
            replyText = res.replyText;
        }
    }
    // =============================================
    // FLUJO: PROGRAMA PREVENIR (OSP)
    // =============================================
    else if (analysis.intent === 'prevenir') {
        updates.motivo_consulta = 'Programa Prevenir (OSP)';
        updates.medico_o_especialidad = 'Programa Prevenir';

        const infoPrevenir = `El *Programa Prevenir* de Sanatorio Argentino, a través del convenio con *Obra Social Provincia (OSP)*, tiene como finalidad la *detección precoz del cáncer de mama y cáncer de cuello uterino*.\n\n` +
            `🩺 *¿Qué incluye el programa?*\n` +
            `• Coordinación integrada de consulta ginecológica y mamografía\n` +
            `• Controles periódicos en *Sede Santa Fe* (Santa Fe 263 Este)\n\n` +
            `👉 Más info: https://www.sanatorioargentino.com.ar/especialidades-medicas/programa-prevenir.html\n\n` +
            `Nuestro equipo coordina los turnos del programa por vos.`;

        if (isExistingPatient) {
            replyText = `¡Hola *${fullName}*! 🏥\n\n${infoPrevenir}\n\n${getAgentHandoffNotice()}`;
            updates.status = 'sin_asignar';
            updates.bot_active = false;
            nextStage = 'esperando_agente';
            updates.ai_summary = buildTriageSummary(updates, 'prevenir', analysis.doctorRecord, true, paciente?.edad);
        } else {
            const res = await handleNewPatientIntake(
                cleanText,
                candidateDni,
                conv,
                phone,
                updates,
                'prevenir',
                analysis.doctorRecord,
                doctorDisplay,
                infoPrevenir
            );
            nextStage = res.nextStage;
            replyText = res.replyText;
        }
    }
    // =============================================
    // FLUJO: INFORMES Y RESULTADOS DE LABORATORIO (WEB GLIMS)
    // =============================================
    else if (analysis.intent === 'informes_laboratorio') {
        updates.motivo_consulta = 'Informes: Laboratorio (Portal Web)';
        replyText = `🔬 *Consulta de Resultados de Laboratorio*\n\n` +
            `Para consultar los resultados de tus análisis clínicos de laboratorio:\n\n` +
            `🔑 *Acceso Web:*\n` +
            `Al momento de la extracción, el laboratorio te entrega tu *usuario y contraseña*. Esta clave es permanente y no es necesario gestionarla cada vez que concurras.\n\n` +
            `👉 *Ingresá a consultar tus resultados aquí:*\n` +
            `http://6430052dd12b.sn.myname.net:8082/glymsweb?tipo_u=4\n\n` +
            `⚠️ *Prácticas confidenciales:* Aquellos estudios que requieran estricta confidencialidad médica no se publican por web y deben ser retirados personalmente en el laboratorio.\n\n` +
            `🌐 Para más información sobre el Sanatorio visitá:\n👉 https://www.sanatorioargentino.com.ar/`;
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: INFORMES DE DIAGNÓSTICO POR IMÁGENES (PORTAL ITS)
    // =============================================
    else if (analysis.intent === 'informes_imagenes') {
        updates.motivo_consulta = 'Informes: Diagnóstico por Imágenes';
        replyText = `🖼️ *Portal de Diagnóstico por Imágenes*\n\n` +
            `Para consultar y descargar tus estudios de imágenes (radiografías, ecografías, tomografías, resonancias, mamografías):\n\n` +
            `👉 *Portal de Pacientes ITS - Diagnóstico por Imágenes:*\n` +
            `https://imagenes.itsanarg.com.ar/patientportal/index.php\n\n` +
            `Podés acceder con tu número de DNI y la contraseña provista al momento de realizar la práctica médica.\n\n` +
            `🌐 Para conocer sedes y servicios podés ingresar a:\n👉 https://www.sanatorioargentino.com.ar/`;
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: CITOLOGÍA (PAP) Y BIOPSIAS
    // =============================================
    else if (analysis.intent === 'informes_biopsia_pap') {
        updates.motivo_consulta = 'Informes: Citología / Biopsia';
        replyText = `📄 *Entrega de Resultados de Citología (PAP) y Biopsias*\n\n` +
            `Por favor tené en cuenta las siguientes indicaciones institucionales:\n\n` +
            `👨‍⚕️ *Si tu médico atiende en Consultorios del Sanatorio:*\n` +
            `• NO es necesario retirar el informe en papel: queda registrado en tu *Historia Clínica Digital* y el profesional te indicará el resultado en tu próxima consulta médica.\n\n` +
            `🏢 *Si tu médico es externo (no atiende en consultorios de Sanatorio Argentino):*\n` +
            `• *Biopsias:* Se retiran personalmente en Administración (Sede 02: San Luis 433 Oeste, 1° Piso).\n` +
            `• *Citología (PAP):* Podés solicitar tu informe por WhatsApp en el siguiente link:\n` +
            `👉 https://wa.me/5492644552540?text=Hola%20quiero%20solicitar%20un%20informe\n\n` +
            `🌐 Para más información institucional visitá:\n👉 https://www.sanatorioargentino.com.ar/`;
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: INFORMES GENERAL (MENÚ DE INFORMES)
    // =============================================
    else if (analysis.intent === 'informes_general') {
        updates.motivo_consulta = 'Informes: Menú General';
        replyText = `📁 *Consulta y Retiro de Informes Médicos*\n\n` +
            `Seleccioná o escribí qué tipo de informe necesitás consultar:\n\n` +
            `1️⃣ *Diagnóstico por Imágenes* (Radiografía, Ecografía, Resonancia, Tomografía, Mamografía):\n` +
            `👉 Portal Web: https://imagenes.itsanarg.com.ar/patientportal/index.php\n\n` +
            `2️⃣ *Laboratorio de Análisis Clínicos:*\n` +
            `👉 Portal Web: http://6430052dd12b.sn.myname.net:8082/glymsweb?tipo_u=4\n\n` +
            `3️⃣ *Citología (PAP) o Biopsias:*\n` +
            `• Médico interno: Se visualiza en tu Historia Clínica Digital en consulta.\n` +
            `• Médico externo: Biopsias en San Luis 433 Oeste (1° Piso) o Citología por WhatsApp al: https://wa.me/5492644552540\n\n` +
            `🌐 Más detalles en: https://www.sanatorioargentino.com.ar/`;
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: SERVICIO DE LABORATORIO (ATENCIÓN PRESENCIAL Y EXTRACCIONES)
    // =============================================
    else if (analysis.intent === 'servicio_laboratorio') {
        updates.motivo_consulta = 'Laboratorio: Atención Presencial y Extracciones';
        replyText = `🩸 *Laboratorio de Análisis Clínicos — Sanatorio Argentino*\n\n` +
            `Contamos con laboratorio de análisis clínicos en:\n` +
            `📍 *Sede 01 (San Luis 432 Oeste):* Guardias activas las *24 horas*.\n` +
            `📍 *Sede Santa Fe (Santa Fe 263 Este):* Horario de atención de *7:30 a 21:00 hs*.\n\n` +
            `📋 *Pautas para la atención:*\n` +
            `• La atención en ambas sedes es *por orden de llegada* (no se saca turno previo).\n` +
            `• *Extracciones de sangre:* Hasta las 10:00 am (por condiciones de ayuno).\n\n` +
            `📲 *Líneas de WhatsApp para consultas de preparación / ayuno:*\n` +
            `• Sede 01: https://wa.me/5492644867408\n` +
            `• Sede Santa Fe: https://wa.me/5492644609384\n\n` +
            `🌐 Para más información visitá: https://www.sanatorioargentino.com.ar/`;
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: VACUNATORIO
    // =============================================
    else if (analysis.intent === 'vacunatorio') {
        updates.motivo_consulta = 'Información: Vacunatorio';
        replyText = `💉 *Vacunatorio Oficial y Extraoficial — Sanatorio Argentino*\n\n` +
            `📍 *Ubicación:* Sede 02 — Calle San Luis 433 Oeste.\n\n` +
            `🕒 *Horarios de atención:*\n` +
            `• Lunes a viernes de 7:30 a 20:30 hs.\n` +
            `• Sábados de 8:30 a 12:30 hs.\n\n` +
            `📋 *Detalles del servicio:*\n` +
            `• Cuenta con todas las vacunas oficiales del Calendario Nacional (gratuitas) y vacunas extraoficiales.\n` +
            `• Adhesión a campañas nacionales de vacunación.\n` +
            `• Para la compra de vacunas extraoficiales se reciben obras sociales, tarjetas de débito y crédito.\n\n` +
            `🌐 Para conocer más ingresá a: https://www.sanatorioargentino.com.ar/`;
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: CURSO DE EMBARAZADAS Y YOGA
    // =============================================
    else if (analysis.intent === 'curso_embarazadas') {
        updates.motivo_consulta = 'Información: Preparto y Yoga para Embarazadas';
        replyText = `🤰 *Espacio para Futuras Mamás — Sanatorio Argentino*\n\n` +
            `1️⃣ *Curso y Gimnasia para Embarazadas:*\n` +
            `• Todos los sábados a las 10:00 hs en la Sala de Ateneos de Sede 02 (San Luis 433 Oeste).\n` +
            `• Las temáticas varían cada fin de semana y se difunden en nuestras redes: Facebook e Instagram (@sanatorioargentino).\n\n` +
            `2️⃣ *Clases de Yoga para Embarazadas:*\n` +
            `• De martes a viernes de 18:00 a 19:00 hs.\n` +
            `• Más información e inscripción por WhatsApp:\n` +
            `👉 https://wa.me/5492644117778\n` +
            `• Web: https://www.sanatorioargentino.com.ar/novedades/actualidad/clases-de-yoga-para-embarazadas.html\n\n` +
            `🌐 Portal oficial: https://www.sanatorioargentino.com.ar/`;
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: REGISTRO CIVIL (NACIMIENTOS)
    // =============================================
    else if (analysis.intent === 'registro_civil') {
        updates.motivo_consulta = 'Información: Registro Civil / Nacimientos';
        replyText = `👶 *Delegación Registro Civil — Sanatorio Argentino*\n\n` +
            `📍 *Ubicación:* 1° Piso de Sede 02 (San Luis 433 Oeste).\n` +
            `🕒 *Horario de atención:* Lunes a viernes de 7:30 a 12:30 hs.\n\n` +
            `📝 *Inscripción de Nacimiento (Plazo: 40 días corridos desde el parto):*\n\n` +
            `• *Primer bebé:* Deben presentarse obligatoriamente ambos padres.\n` +
            `• *Mamá soltera:* Fotocopia del DNI de la madre.\n` +
            `• *Padres no casados:* Ambos padres presentes sin excepción + Fotocopia DNI de ambos.\n` +
            `• *Padres casados:* Fotocopia DNI de ambos + Libreta o Acta de Matrimonio (puede concurrir cualquiera de los cónyuges).\n\n` +
            `🌐 Para más información institucional visitá: https://www.sanatorioargentino.com.ar/`;
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: ADMINISTRACIÓN, CIRUGÍAS Y PRESUPUESTOS
    // =============================================
    else if (analysis.intent === 'administracion_presupuestos') {
        if (patientSentImageRecently) {
            updates.motivo_consulta = 'Presupuesto de Estudio / Práctica Médica';
            replyText = `¡Hola *${fullName}*! 🏥 Te ayudamos con el *presupuesto y aranceles* de tu estudio.\n\n` +
                `Un asesor revisará la orden médica que nos enviaste y te informará los valores y cobertura de tu obra social a la brevedad.\n\n` +
                `${getAgentHandoffNotice()}`;
            updates.status = 'sin_asignar';
            updates.bot_active = false;
            nextStage = 'esperando_agente';
        } else {
            updates.motivo_consulta = 'Administración: Presupuestos e Internación';
            replyText = `💼 *Administración de Cirugías, Presupuestos e Internación*\n\n` +
                `Si te vas a realizar una cirugía en Sanatorio Argentino y necesitas presupuesto o consultar cobertura:\n\n` +
                `📍 *Atención Presencial:* Oficina de Administración en Sede 02 (San Luis 433 Oeste). De lunes a viernes de 7:30 a 20:00 hs.\n` +
                `📧 *Email:* administracion@sanatorioargentino.com.ar\n` +
                `📞 *Teléfono:* 2644303040\n` +
                `📲 *WhatsApp:* https://wa.me/5492644809396?text=Hola%20necesito\n\n` +
                `🌐 Para más información institucional visitá: https://www.sanatorioargentino.com.ar/`;
            nextStage = 'informacion_respondida';
        }
    }
    // =============================================
    // FLUJO: HORARIOS DE SEDES Y VISITAS
    // =============================================
    else if (analysis.intent === 'horarios_sedes') {
        updates.motivo_consulta = 'Información: Horarios de Sedes y Visitas';
        replyText = `🕒 *Horarios de Atención de Sedes y Visitas — Sanatorio Argentino*\n\n` +
            `🏢 *SEDE 01 (San Luis 432 Oeste - Capital):*\n` +
            `• Lunes a viernes de 7:30 a 21:00 hs | Sábados de 8:00 a 13:00 hs.\n` +
            `• *Horario de Visitas de Internados:* 18:00 a 21:00 hs.\n\n` +
            `🏢 *SEDE 02 (San Luis 433 Oeste - Capital):*\n` +
            `• Lunes a viernes de 7:30 a 21:00 hs | Sábados de 8:00 a 13:00 hs.\n\n` +
            `🏢 *SEDE 03 (San Luis 463 Oeste - Capital):*\n` +
            `• Lunes a viernes de 7:30 a 21:00 hs | Sábados de 8:00 a 12:00 hs.\n\n` +
            `🏢 *SEDE SANTA FE (Santa Fe 263 Este - Capital):*\n` +
            `• Lunes a viernes de 7:30 a 21:00 hs | Sábados de 8:00 a 12:00 hs.\n\n` +
            `🚨 *Guardia Médica:* Sede 01 activa las 24 horas.\n\n` +
            `🌐 Más información en: https://www.sanatorioargentino.com.ar/`;
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: TELÉFONOS Y WHATSAPPS DE SEDES Y SECTORES
    // =============================================
    else if (analysis.intent === 'telefonos_sedes') {
        updates.motivo_consulta = 'Información: Directorio Telefónico y WhatsApps';
        if (analysis.sectorKey === 'fertilidad') {
            replyText = `📲 *Contacto de Medicina Reproductiva / Fertilidad:*\nPodés comunicarte por WhatsApp directamente con el sector al siguiente enlace:\n👉 https://wa.link/kfqzc2\n\n🌐 Más información: https://www.sanatorioargentino.com.ar/`;
        } else if (analysis.sectorKey === 'administracion') {
            replyText = `📲 *Contacto de Administración:* https://wa.link/4po00r\nTeléfono: 2644303040\nMail: administracion@sanatorioargentino.com.ar\n\n🌐 Más información: https://www.sanatorioargentino.com.ar/`;
        } else if (analysis.sectorKey === 'internacion') {
            replyText = `📲 *Recepción de Internación (Sede 01):* https://wa.link/xpsjx4\n\n🌐 Más información: https://www.sanatorioargentino.com.ar/`;
        } else if (analysis.sectorKey === 'citologia') {
            replyText = `📲 *Citología (Sede Santa Fe):* https://wa.link/nxmj56\n\n🌐 Más información: https://www.sanatorioargentino.com.ar/`;
        } else if (analysis.sectorKey === 'imagenes') {
            replyText = `📲 *Diagnóstico por Imágenes:*\n• Sede 01 (1° Piso): https://wa.link/ori86c\n• Sede Santa Fe: https://wa.link/dcx4bz\n• Portal Web: https://imagenes.itsanarg.com.ar/patientportal/index.php\n\n🌐 Más información: https://www.sanatorioargentino.com.ar/`;
        } else if (analysis.sectorKey === 'laboratorio') {
            replyText = `📲 *Laboratorio de Análisis Clínicos:*\n• Sede 01: https://wa.link/17bfdt (o https://wa.me/5492644867408)\n• Sede Santa Fe: https://wa.link/9l2ix4 (o https://wa.me/5492644609384)\n\n🌐 Más información: https://www.sanatorioargentino.com.ar/`;
        } else if (analysis.sectorKey === 'fundacion') {
            replyText = `📲 *Fundación Sanatorio Argentino:* https://wa.link/iazmw0 (o https://wa.me/5492644867318)\nWeb: https://fundacion.sanatorioargentino.com.ar\n\n🌐 Más información: https://www.sanatorioargentino.com.ar/`;
        } else {
            replyText = `📞 *Directorio de WhatsApps por Sede y Sector — Sanatorio Argentino:*\n\n` +
                `🏢 *SEDE 01 (San Luis 432 Oeste):*\n` +
                `• 1° Piso (Consultorios, Imágenes, Recién nacido): https://wa.link/ori86c\n` +
                `• Chequeo: https://wa.link/a6pumc\n` +
                `• Laboratorio: https://wa.link/17bfdt\n` +
                `• Recepción Internación: https://wa.link/xpsjx4\n\n` +
                `🏢 *SEDE 02 (San Luis 433 Oeste):*\n` +
                `• Recepción de Consultorios: https://wa.link/x0ov0y\n` +
                `• Administración: https://wa.link/4po00r\n` +
                `• Fertilidad / Medicina Reproductiva: https://wa.link/kfqzc2\n` +
                `• Fundación: https://wa.link/iazmw0\n\n` +
                `🏢 *SEDE 03 (San Luis 463 Oeste):*\n` +
                `• Recepción de Consultorios: https://wa.link/q1khuw\n\n` +
                `🏢 *SEDE SANTA FE (Santa Fe 263 Este):*\n` +
                `• Sector 1: https://wa.link/hs438c\n` +
                `• Sector 2: https://wa.link/ssl628\n` +
                `• Citología: https://wa.link/nxmj56\n` +
                `• Laboratorio: https://wa.link/9l2ix4\n` +
                `• Diagnóstico por Imágenes: https://wa.link/dcx4bz\n` +
                `• Chequeo Preventivo: https://wa.link/mvuq3g\n\n` +
                `🌐 Web oficial: https://www.sanatorioargentino.com.ar/`;
        }
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: RECLAMOS, SUGERENCIAS Y CALIDAD
    // =============================================
    else if (analysis.intent === 'reclamos_calidad') {
        updates.motivo_consulta = 'Reclamos y Sugerencias / Calidad';
        replyText = `⚠️ *Gestión de Sugerencias, Reclamos y Calidad*\n\n` +
            `¡Tu opinión nos interesa para seguir mejorando! Todos los datos son confidenciales.\n\n` +
            `📝 *Encuestas de satisfacción por servicio:*\n` +
            `• Paciente Ambulatorio: https://forms.gle/yCkvJ8EutPeZ7tVY6\n` +
            `• Internación Adultos: https://forms.gle/sKjtM3xRuxCiPvmG9\n` +
            `• Internación Neonatal y Pediátrica: https://forms.gle/2LjgybCQdHQhhdev9\n` +
            `• Guardia Pediátrica: https://forms.gle/hq3t6fZfYD6evVnw8\n` +
            `• Chequeo de Salud: https://forms.gle/vab2nNeuUAHTRLKbA\n` +
            `• Medicina Reproductiva: https://forms.gle/VffF2zcgyujXckPi7\n` +
            `• Curso para Embarazadas: https://forms.gle/1h55LBQxvjUA442X9\n\n` +
            `📧 *Canal formal para comentarios o reclamos:* calidad@sanatorioargentino.com.ar\n\n` +
            `🌐 Para más información ingresá a: https://www.sanatorioargentino.com.ar/`;
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: FUNDACIÓN SANATORIO ARGENTINO
    // =============================================
    else if (analysis.intent === 'fundacion') {
        updates.motivo_consulta = 'Información: Fundación Sanatorio Argentino';
        replyText = `💓 *Fundación Sanatorio Argentino (FSA)*\n\n` +
            `FSA tiene como misión la prevención y detección de enfermedades de la mujer y del niño en zonas alejadas y de difícil acceso a centros de salud de San Juan, mediante campañas de atención directa y estudios médicos necesarios.\n\n` +
            `✅ *Capacitaciones y Charlas:* Programas formativos diseñados para nuestra comunidad a lo largo del año.\n` +
            `✅ *Actividades y Eventos:* Eventos y encuentros solidarios para promover la salud.\n\n` +
            `🗓️ *Conocer actividades:* https://fundacion.sanatorioargentino.com.ar\n` +
            `📲 *WhatsApp directo con un asistente de la Fundación:* https://wa.me/5492644867318\n\n` +
            `🌐 Para más información visitá: https://www.sanatorioargentino.com.ar/`;
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: CONFIRMACIÓN DE TURNO ONLINE (CONTEXTUAL)
    // =============================================
    else if (analysis.intent === 'confirmar_turno_online') {
        const doc = turnoOnlineProximo?.profesional || 'tu profesional';
        const f = turnoOnlineProximo?.fecha || '';
        const h = turnoOnlineProximo?.hora ? ` a las ${turnoOnlineProximo.hora} hs` : '';
        replyText = `¡Muchas gracias *${fullName}*! ✅ Registramos tu confirmación del turno con ${doc}${f ? ` para el ${f}${h}` : ''}.\n\n${getAgentHandoffNotice()}`;
        updates.motivo_consulta = `Confirmación Turno Online: ${doc}`;
        updates.status = 'sin_asignar';
        updates.bot_active = false;
        nextStage = 'esperando_agente';
    }
    // =============================================
    // FLUJO: CANCELACIÓN DE TURNO ONLINE (CONTEXTUAL)
    // =============================================
    else if (analysis.intent === 'cancelar_turno_online') {
        const doc = turnoOnlineProximo?.profesional || 'tu profesional';
        const f = turnoOnlineProximo?.fecha || '';
        replyText = `Registramos tu solicitud para *cancelar* el turno con ${doc}${f ? ` del ${f}` : ''}. Un asesor gestionará la baja en el sistema.\n\n${getAgentHandoffNotice()}`;
        updates.motivo_consulta = `Solicita Cancelar Turno Online: ${doc}`;
        updates.status = 'sin_asignar';
        updates.bot_active = false;
        nextStage = 'esperando_agente';
    }
    // =============================================
    // FLUJO: REPROGRAMACIÓN DE TURNO ONLINE (CONTEXTUAL)
    // =============================================
    else if (analysis.intent === 'reprogramar_turno_online') {
        const doc = turnoOnlineProximo?.profesional || 'tu profesional';
        replyText = `Te ayudamos a *reprogramar* tu turno con ${doc}.\nPor favor indícanos qué día o preferencia horaria te quedaría mejor.\n\n${getAgentHandoffNotice()}`;
        updates.motivo_consulta = `Solicita Reprogramar Turno Online: ${doc}`;
        updates.status = 'sin_asignar';
        updates.bot_active = false;
        nextStage = 'esperando_agente';
    }
    // =============================================
    // FLUJO: SEGUIMIENTO DE CASO CON ASESOR HUMANO (CONTEXTUAL)
    // =============================================
    else if (analysis.intent === 'seguimiento_asesor') {
        replyText = `¡Muchas gracias *${fullName}*! Registramos tu respuesta en el chat para que el equipo continúe tu atención.\n\n${getAgentHandoffNotice()}`;
        updates.motivo_consulta = `Seguimiento de conversación con asesor`;
        updates.status = 'sin_asignar';
        updates.bot_active = false;
        nextStage = 'esperando_agente';
    }
    // =============================================
    // FLUJO: AGRADECIMIENTO O CIERRE CORDIAL (CONTEXTUAL)
    // =============================================
    else if (analysis.intent === 'agradecimiento_cierre') {
        replyText = `¡De nada *${fullName}*! Que tengas un excelente día. Estamos a tu entera disposición ante cualquier otra consulta. 🏥`;
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: TURNOS / REPROGRAMACIÓN
    // =============================================
    else if (analysis.intent === 'turno') {
        let doctorNoteMsg = '';
        if (doctorDisplay) {
            doctorNoteMsg = ` con el *${doctorDisplay}*${doctorSpecialty}`;
            updates.medico_o_especialidad = analysis.doctorRecord?.profesional_nombre || doctorDisplay;
            updates.motivo_consulta = `Solicitud de Turno: ${doctorDisplay}`;
        } else {
            updates.motivo_consulta = 'Solicitud de Turno / Consulta';
        }

        const alreadyAskedTurno = lastBotMessage?.content?.includes('Te ayudamos a coordinar tu turno');
        if (alreadyAskedTurno) {
            console.log(`[triage-bot] Chat ${phone}: Ya se enviaron pautas de turno previamente. Bot en silencio.`);
            replyText = '';
            updates.status = 'sin_asignar';
            updates.bot_active = false;
            nextStage = 'esperando_agente';
            updates.ai_summary = buildTriageSummary(updates, 'turno', analysis.doctorRecord, isExistingPatient, paciente?.edad);
        } else if (turnoOnlineProximo) {
            replyText = `¡Hola *${fullName}*! 🏥\n\n` +
                `📅 *Tenés un turno online agendado:*\n` +
                `• *Profesional:* ${turnoOnlineProximo.profesional}\n` +
                `• *Fecha y Hora:* ${turnoOnlineProximo.fecha} a las ${turnoOnlineProximo.hora} hs\n` +
                `• *Agenda:* ${turnoOnlineProximo.agenda}\n\n` +
                `¿Deseás confirmar, reprogramar o cancelar tu turno?\n\n${getAgentHandoffNotice()}`;
            updates.motivo_consulta = `Turno Online: ${turnoOnlineProximo.profesional} (${turnoOnlineProximo.fecha} ${turnoOnlineProximo.hora} hs)`;
            updates.medico_o_especialidad = turnoOnlineProximo.profesional;
            updates.status = 'sin_asignar';
            updates.bot_active = false;
            nextStage = 'esperando_agente';
            updates.ai_summary = buildTriageSummary(updates, 'turno', analysis.doctorRecord, true, paciente?.edad);
        } else if (isExistingPatient) {
            const hasOrderImageMsg = patientSentImageRecently ? '\n\n✅ *Ya recibimos la foto de tu orden médica.*' : '';
            const otherFams = (familiaresDetectados || []).filter(f => String(f.dni) !== String(paciente?.dni)).map(f => (f.nombre || '').split(',')[0].trim());
            const famNote = otherFams.length > 0 ? ` (o para ${otherFams.join(', ')})` : '';

            const osTurnoInfo = getRegisteredOsInfo(paciente?.coseguro || conv?.obra_social);
            const osTurnoBullet = osTurnoInfo.hasRegisteredOs
                ? `• *Obra Social y Plan:* En tu ficha figura *${osTurnoInfo.cleanOsName}*. Confirmános si seguís teniendo cobertura allí y qué *plan* tenés (o si es otra/particular).`
                : `• *Obra Social y Plan:* ¿Con qué obra social o prepaga te atendés (y qué plan posees), o es Particular?`;

            replyText = `¡Hola *${fullName}*! 🏥 Te ayudamos a coordinar tu turno${doctorNoteMsg}.${hasOrderImageMsg}\n\n` +
                `Por favor indícanos:\n` +
                `• ¿El turno es para vos (*${fullName}*), o estás gestionando para otro paciente / familiar${famNote}?\n` +
                `• Si es para vos: indícanos preferencia de día/horario y si es primera consulta o control.\n` +
                `• Si es para otra persona: indícanos el *DNI* (sin puntos) y *Nombre Completo* del paciente que se va a atender.\n` +
                `${osTurnoBullet}\n\n` +
                `${getAgentHandoffNotice()}`;
            updates.status = 'sin_asignar';
            updates.bot_active = false;
            nextStage = 'esperando_agente';
            updates.ai_summary = buildTriageSummary(updates, 'turno', analysis.doctorRecord, true, paciente?.edad);
        } else {
            const intro = `¡Hola! 👋 Te damos la bienvenida a *Sanatorio Argentino*.\nCon gusto te ayudamos a coordinar tu turno${doctorNoteMsg}.`;
            const res = await handleNewPatientIntake(
                cleanText,
                candidateDni,
                conv,
                phone,
                updates,
                'turno',
                analysis.doctorRecord,
                doctorDisplay,
                intro
            );
            nextStage = res.nextStage;
            replyText = res.replyText;
        }
    }
    // =============================================
    // FLUJO: AUTORIZACIONES
    // =============================================
    else if (analysis.intent === 'autorizacion') {
        updates.motivo_consulta = 'Autorizaciones de Estudios / Cobertura';

        const alreadyAskedAutorizacion = lastBotMessage?.content?.includes('Te ayudamos con la *autorización* de tu orden médica');
        if (alreadyAskedAutorizacion) {
            console.log(`[triage-bot] Chat ${phone}: Ya se enviaron pautas de autorización previamente. Bot en silencio esperando al asesor.`);
            replyText = '';
            updates.status = 'sin_asignar';
            updates.bot_active = false;
            nextStage = 'esperando_agente';
            updates.ai_summary = buildTriageSummary(updates, 'autorizacion', analysis.doctorRecord, isExistingPatient, paciente?.edad);
        } else if (isExistingPatient) {
            const hasOrderImageMsg = patientSentImageRecently 
                ? '✅ *Ya recibimos la foto de tu orden médica.*' 
                : '📸 *Foto clara de la orden médica*';
            replyText = `¡Hola *${fullName}*! 🏥 Te ayudamos con la *autorización* de tu orden médica.\n\n` +
                `Por favor indícanos:\n` +
                `• ¿La orden médica es a tu nombre (*${fullName}*), o de otro paciente/familiar?\n` +
                `• *DNI* y *Nombre Completo* del paciente titular de la orden médica.\n` +
                `• ${hasOrderImageMsg}\n\n` +
                `*(Vigencia de órdenes: 30 días).* ${getAgentHandoffNotice()}`;
            updates.status = 'sin_asignar';
            updates.bot_active = false;
            nextStage = 'esperando_agente';
            updates.ai_summary = buildTriageSummary(updates, 'autorizacion', analysis.doctorRecord, true, paciente?.edad);
        } else {
            const intro = `¡Hola! 👋 Te damos la bienvenida a *Sanatorio Argentino*.\nCon gusto te ayudamos con tu trámite de *autorización de orden médica*.`;
            const res = await handleNewPatientIntake(
                cleanText,
                candidateDni,
                conv,
                phone,
                updates,
                'autorizacion',
                analysis.doctorRecord,
                doctorDisplay,
                intro
            );
            nextStage = res.nextStage;
            replyText = res.replyText;
        }
    }
    // =============================================
    // FLUJO: GESTIÓN PARA OTRO PACIENTE / FAMILIAR (TURNO O AUTORIZACIÓN)
    // =============================================
    else if (analysis.intent === 'gestion_familiar') {
        updates.motivo_consulta = 'Gestión para Tercero / Familiar (Turno o Autorización)';
        
        const otherFams = (familiaresDetectados || []).filter(f => String(f.dni) !== String(paciente?.dni)).map(f => `${f.nombre} (DNI ${f.dni})`);
        const famSuggesMsg = otherFams.length > 0 
            ? `\n\n👥 *Familiares vinculados a tu línea:*\n${otherFams.map(f => `• ${f}`).join('\n')}\n*(Podés escribir directamente el nombre o DNI de la persona a atender)*` 
            : '';

        replyText = `¡Entendido *${fullName}*! 🏥 Te ayudamos a gestionar el *turno o autorización* para tu familiar u otro paciente.\n\n` +
            `Por favor indícanos en un solo mensaje:\n` +
            `• *¿Qué trámite necesitás?* (Solicitar un *turno médico* o *autorizar una orden médica*)\n` +
            `• *DNI* (sin puntos) y *Nombre Completo* del paciente que se atenderá.\n` +
            `• *Obra Social o Prepaga* y qué *plan* posee (o si es Particular).\n` +
            `• Si es turno: médico, especialidad o estudio requerido, y preferencia horaria.\n` +
            `• Si es autorización: envíanos la *foto clara de la orden médica*.${famSuggesMsg}\n\n` +
            `*(Si el paciente ya está registrado en Sanatorio Argentino, con su DNI lo localizamos de inmediato)*.\n\n` +
            `${getAgentHandoffNotice()}`;

        updates.status = 'sin_asignar';
        updates.bot_active = false;
        nextStage = 'esperando_agente';
        updates.ai_summary = buildTriageSummary(updates, 'gestion_familiar', analysis.doctorRecord, isExistingPatient, paciente?.edad);
    }
    // =============================================
    // FLUJO: GESTIÓN PROPIA (TURNO O AUTORIZACIÓN A NOMBRE DEL TITULAR)
    // =============================================
    else if (analysis.intent === 'gestion_propia') {
        updates.motivo_consulta = 'Gestión Propia (Turno o Autorización)';
        
        const osCandidate = paciente?.coseguro || conv?.obra_social || null;
        const osInfo = getRegisteredOsInfo(osCandidate);

        const osBullet = osInfo.hasRegisteredOs
            ? `• *Obra Social y Plan:* Tenemos registrada tu cobertura en *${osInfo.cleanOsName}*. ¿Seguís teniendo cobertura con esta obra social? De ser así, ¿qué *plan* tenés? (o avísanos si contás con otra cobertura o te atendés de forma *Particular*).`
            : `• *Obra Social y Plan:* Por favor indícanos qué *obra social o prepaga* tenés y qué *plan* posees (o si tu atención será de forma *Particular*).`;

        replyText = `¡Excelente *${fullName}*! 🏥 Te ayudamos a coordinar tu trámite.\n\n` +
            `Por favor indícanos:\n` +
            `• *¿Qué trámite necesitás realizar?* (Solicitar un *turno médico* o *autorizar una orden médica*)\n` +
            `• Si es turno: especialidad, práctica o profesional de tu preferencia, y preferencia de horario (mañana o tarde).\n` +
            `• Si es autorización: envíanos una *foto clara de tu orden médica*.\n` +
            `${osBullet}\n\n` +
            `${getAgentHandoffNotice()}`;

        updates.status = 'sin_asignar';
        updates.bot_active = false;
        nextStage = 'esperando_agente';
        updates.ai_summary = buildTriageSummary(updates, 'gestion_propia', analysis.doctorRecord, isExistingPatient, paciente?.edad);
    }
    // =============================================
    // FLUJO: DERIVACIÓN DIRECTA A AGENTE HUMANO
    // =============================================
    else if (analysis.intent === 'derivacion_agente') {
        updates.motivo_consulta = 'Solicitud de Atención con Asesor Humano';
        if (isExistingPatient) {
            replyText = `¡Hola *${fullName}*! 🏥\n\n${getAgentHandoffNotice()}`;
            updates.status = 'sin_asignar';
            updates.bot_active = false;
            nextStage = 'esperando_agente';
            updates.ai_summary = buildTriageSummary(updates, 'derivacion_agente', analysis.doctorRecord, true, paciente?.edad);
        } else {
            const intro = `¡Hola! 👋 Te comunicamos con el equipo de atención de *Sanatorio Argentino*.`;
            const res = await handleNewPatientIntake(
                cleanText,
                candidateDni,
                conv,
                phone,
                updates,
                'derivacion_agente',
                analysis.doctorRecord,
                doctorDisplay,
                intro
            );
            nextStage = res.nextStage;
            replyText = res.replyText;
        }
    }
    // =============================================
    // FLUJO: INFORMACIÓN GENERAL / WEB
    // =============================================
    else if (analysis.intent === 'info') {
        replyText = `Para consultar información institucional, cartilla de profesionales, sedes y servicios de Sanatorio Argentino, podés ingresar a nuestro sitio web oficial:\n\n🌐 *https://www.sanatorioargentino.com.ar/*\n\nSi necesitás realizar un trámite en particular, indícanos si buscás turnos, autorizaciones, guardias o resultados de estudios.`;
        updates.motivo_consulta = 'Información General / Web';
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: SALUDO GENERAL O SOLICITUD ABIERTA
    // =============================================
    else {
        if (isExistingPatient) {
            replyText = `¡Hola *${fullName}*! 🏥 ¿En qué podemos ayudarte hoy?\n\n` +
                `¿El trámite es para vos (*${fullName}*) o estás gestionando para otro paciente / familiar?\n\n` +
                `1️⃣ *El turno o autorización es para mí*\n` +
                `2️⃣ *Estoy gestionando para otro paciente / familiar*\n` +
                `3️⃣ *Guardias médicas las 24 horas*\n` +
                `4️⃣ *Informes, estudios, horarios y sedes*\n\n` +
                `• Si es para vos: indícanos qué especialidad o práctica necesitás.\n` +
                `• Si es para otra persona: indícanos el *DNI* (sin puntos) y *Nombre Completo* del paciente a atender.`;
            updates.bot_stage = 'menu_opciones';
            updates.bot_active = true;
            nextStage = 'menu_opciones';
        } else {
            const intro = `¡Hola! 👋 Te damos la bienvenida a *Sanatorio Argentino*.`;
            const res = await handleNewPatientIntake(
                cleanText,
                candidateDni,
                conv,
                phone,
                updates,
                'inicio',
                analysis.doctorRecord,
                doctorDisplay,
                intro
            );
            nextStage = res.nextStage;
            replyText = res.replyText;
        }
    }

    // Columnas válidas estrictas de contact_center_conversations para evitar fallos de schema cache en Supabase
    const VALID_CONVERSATION_COLUMNS = new Set([
        'phone', 'status', 'assigned_agent_id', 'assigned_agent_name', 'assigned_at',
        'bot_active', 'bot_stage', 'dni', 'nombre_completo', 'obra_social',
        'fecha_nacimiento', 'email', 'telefono_contacto', 'departamento',
        'es_paciente_existente', 'motivo_consulta', 'medico_o_especialidad',
        'last_message_text', 'last_message_at', 'created_at', 'updated_at',
        'ai_summary', 'nhc', 'resolution_reason', 'closed_at',
        'closed_by_agent_id', 'closed_by_agent_name'
    ]);

    // Persistir o actualizar en contact_center_conversations
    updates.bot_stage = nextStage;

    const cleanUpdates: Record<string, any> = {};
    for (const [key, val] of Object.entries(updates)) {
        if (VALID_CONVERSATION_COLUMNS.has(key)) {
            cleanUpdates[key] = val;
        }
    }

    const { error: upsertErr } = await supabase
        .from('contact_center_conversations')
        .upsert({
            phone,
            ...cleanUpdates
        }, { onConflict: 'phone' });

    if (upsertErr) {
        console.error('[triage-bot] ❌ Error actualizando contact_center_conversations:', upsertErr);
    } else {
        console.log(`[triage-bot] ✅ Conversación ${phone} persistida (stage: ${nextStage}, bot_active: ${cleanUpdates.bot_active})`);
    }

    // Enviar el mensaje saliente al paciente vía WhatsApp SOLO si hay respuesta explícita
    if (replyText) {
        await sendBotWhatsAppReply(supabase, phone, replyText, lineId);
    }
}

/**
 * Calcula la edad en años a partir de una fecha de nacimiento (DD/MM/AAAA o AAAA-MM-DD)
 */
function calculateAgeFromBirthDate(birthDateStr: string | null): number | null {
    if (!birthDateStr) return null;
    try {
        const parts = birthDateStr.split(/[\/\-]/);
        let day = 1, month = 1, year = 1990;
        if (parts[0].length === 4) {
            year = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10);
            day = parseInt(parts[2], 10);
        } else if (parts.length === 3) {
            day = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10);
            year = parseInt(parts[2], 10);
            if (year < 100) year += year > 26 ? 1900 : 2000;
        } else {
            return null;
        }
        if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
        const today = new Date();
        let age = today.getFullYear() - year;
        const m = (today.getMonth() + 1) - month;
        if (m < 0 || (m === 0 && today.getDate() < day)) {
            age--;
        }
        return (age >= 0 && age <= 120) ? age : null;
    } catch {
        return null;
    }
}

/**
 * Determina cuáles de los 6 datos obligatorios están pendientes para admisión de un nuevo paciente
 */
function getMissingPatientFields(data: Record<string, any>): string[] {
    const missing: string[] = [];

    // 1. Nombre completo (al menos 3 caracteres y letras reales)
    const name = (data.nombre_completo || '').trim();
    const GENERIC_NAMES = ['paciente', 'usuario', 'hola', 'doctor', 'doctora', 'buenas', 'sanatorio'];
    if (!name || name.length < 3 || GENERIC_NAMES.some(g => name.toLowerCase() === g) || !/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(name)) {
        missing.push('nombre_completo');
    }

    // 2. DNI (7 u 8 dígitos numéricos)
    const dni = String(data.dni || '').replace(/\D/g, '');
    if (!dni || dni.length < 7 || dni.length > 8) {
        missing.push('dni');
    }

    // 3. Fecha de nacimiento o Edad
    const fn = (data.fecha_nacimiento || '').trim();
    const ed = data.edad;
    if (!fn && (!ed || isNaN(Number(ed)))) {
        missing.push('fecha_nacimiento_edad');
    }

    // 4. Obra Social o Cobertura
    const os = (data.obra_social || '').trim();
    const GENERIC_OS = ['particular / a confirmar', 'a confirmar', 'a consultar', 'no informada', 'no informado'];
    if (!os || GENERIC_OS.some(g => os.toLowerCase().includes(g))) {
        missing.push('obra_social');
    }

    // 5. Departamento de residencia en San Juan
    const dep = (data.departamento || '').trim();
    const GENERIC_DEP = ['san juan', 'no informado', 'no informada', 'a confirmar'];
    if (!dep || GENERIC_DEP.some(g => dep.toLowerCase() === g)) {
        missing.push('departamento');
    }

    return missing;
}

/**
 * Genera el mensaje amigable de repregunta solicitando ÚNICAMENTE los campos que faltan
 */
function buildMissingFieldsPrompt(patientName: string | null, missing: string[], currentData: Record<string, any>): string {
    const labelsMap: Record<string, string> = {
        nombre_completo: '• *Nombre y Apellido completo*',
        dni: '• *Número de DNI* (sin puntos ni letras)',
        fecha_nacimiento_edad: '• *Fecha de Nacimiento* (DD/MM/AAAA) o *Edad*',
        obra_social: '• *Obra Social o Prepaga* (si no posees cobertura, indicanos "Particular")',
        departamento: '• *Departamento de residencia* (ej: Capital, Rivadavia, Rawson, Santa Lucía, Chimbas, Pocito, Caucete, etc.)'
    };

    let intro = '';
    const cleanName = (patientName && !patientName.toLowerCase().startsWith('paciente')) ? patientName : null;

    if (cleanName) {
        intro = `¡Muchas gracias *${cleanName}*! 🏥\n\n`;
    } else if (currentData.dni) {
        intro = `¡Muchas gracias! 🏥 Registramos tu DNI (${currentData.dni}).\n\n`;
    } else {
        intro = `¡Hola! 👋 Te damos la bienvenida a *Sanatorio Argentino*.\n\n`;
    }

    intro += `Para poder abrir tu ficha digital de admisión y que el asesor cuente con toda tu información, por favor indícanos:\n\n`;

    const bulletList = missing.map(m => labelsMap[m] || `• *${m}*`).join('\n');
    const footer = `\n\nPodés responder con los datos en un solo mensaje. Una vez recibidos, te comunicaremos de inmediato con el equipo de atención.`;

    return intro + bulletList + footer;
}

/**
 * Construye la Ficha Resumen de Triage que se guarda en conv.ai_summary para el Cockpit del operador
 */
function buildTriageSummary(
    data: Record<string, any>,
    intent: string,
    doctorRecord: any,
    isExisting: boolean,
    calculatedAge?: number | null
): Record<string, any> {
    const intentMap: Record<string, string> = {
        turno: 'Solicitud de Turno',
        autorizacion: 'Autorización de Estudio / Cobertura',
        chequeo: 'Chequeo Preventivo de Salud',
        prevenir: 'Programa Prevenir (OSP)',
        guardia: 'Consulta por Guardia 24hs',
        informes_laboratorio: 'Resultados de Laboratorio',
        informes_imagenes: 'Informes de Diagnóstico por Imágenes',
        derivacion_agente: 'Solicitud de Asesor Humano',
        gestion_familiar: 'Gestión para Tercero / Familiar (Turno o Autorización)',
        gestion_propia: 'Gestión Propia (Turno o Autorización)'
    };

    const tramite = intentMap[intent] || 'Consulta General de Atención';
    const age = calculatedAge || (data.fecha_nacimiento ? calculateAgeFromBirthDate(data.fecha_nacimiento) : data.edad) || null;

    let docName = doctorRecord?.profesional_nombre || data.medico_o_especialidad || null;
    if (docName && docName.includes('(')) docName = docName.split('(')[0].trim();

    return {
        resumen_solicitud: data.motivo_consulta || `Gestión de ${tramite.toLowerCase()} para ${data.nombre_completo || 'el paciente'}.`,
        tipo_tramite: tramite,
        datos_paciente: {
            nombre_completo: data.nombre_completo || null,
            dni: data.dni || null,
            obra_social: data.obra_social || 'Particular',
            fecha_nacimiento: data.fecha_nacimiento || null,
            edad: age,
            departamento: data.departamento || 'San Juan',
            telefono: data.telefono_contacto || data.phone || null,
            nhc: data.nhc || null,
            es_paciente_existente: isExisting
        },
        doctor_detectado: {
            nombre_aproximado: docName,
            especialidad_mencionada: doctorRecord?.especialidad || null,
            estudio_solicitado: null
        },
        prestador_matched: doctorRecord ? {
            profesional_nombre: doctorRecord.profesional_nombre,
            especialidad: doctorRecord.especialidad,
            consultorio_actual: doctorRecord.consultorio_actual,
            condiciones_consulta: doctorRecord.condiciones_consulta
        } : null,
        generated_at: new Date().toISOString()
    };
}

/**
 * Procesa el onboarding express para pacientes no registrados en SALUS
 */
async function handleNewPatientIntake(
    cleanText: string,
    candidateDni: string | null,
    conv: any,
    phone: string,
    updates: Record<string, any>,
    intent: string,
    doctorRecord: any,
    doctorDisplay: string | null,
    intentPromptPrefix?: string
): Promise<{ nextStage: string; replyText: string }> {
    const extracted = await extractPatientVariables(cleanText, candidateDni);

    const mergedPatientData: Record<string, any> = {
        dni: candidateDni || extracted.dni || conv?.dni || null,
        nombre_completo: extracted.nombre_completo || (conv?.nombre_completo && !conv?.nombre_completo.startsWith('Paciente') ? conv.nombre_completo : null),
        obra_social: extracted.obra_social || (conv?.obra_social && conv?.obra_social !== 'Particular / A confirmar' && conv?.obra_social !== 'A consultar' ? conv.obra_social : null),
        fecha_nacimiento: extracted.fecha_nacimiento || conv?.fecha_nacimiento || null,
        edad: extracted.edad || (conv?.fecha_nacimiento ? calculateAgeFromBirthDate(conv.fecha_nacimiento) : null),
        departamento: extracted.departamento || (conv?.departamento && conv?.departamento !== 'San Juan' ? conv.departamento : null),
        telefono_contacto: extracted.telefono_contacto || conv?.telefono_contacto || phone,
        motivo_consulta: extracted.motivo_consulta || updates.motivo_consulta || conv?.motivo_consulta || null,
        medico_o_especialidad: extracted.medico_o_especialidad || updates.medico_o_especialidad || conv?.medico_o_especialidad || null
    };

    if (mergedPatientData.fecha_nacimiento && !mergedPatientData.edad) {
        mergedPatientData.edad = calculateAgeFromBirthDate(mergedPatientData.fecha_nacimiento);
    }

    if (mergedPatientData.dni) updates.dni = mergedPatientData.dni;
    if (mergedPatientData.nombre_completo) updates.nombre_completo = mergedPatientData.nombre_completo;
    if (mergedPatientData.obra_social) updates.obra_social = mergedPatientData.obra_social;
    if (mergedPatientData.fecha_nacimiento) updates.fecha_nacimiento = mergedPatientData.fecha_nacimiento;
    if (mergedPatientData.departamento) updates.departamento = mergedPatientData.departamento;
    if (mergedPatientData.telefono_contacto) updates.telefono_contacto = mergedPatientData.telefono_contacto;
    if (mergedPatientData.motivo_consulta) updates.motivo_consulta = mergedPatientData.motivo_consulta;
    if (mergedPatientData.medico_o_especialidad) updates.medico_o_especialidad = mergedPatientData.medico_o_especialidad;

    const missing = getMissingPatientFields(mergedPatientData);

    if (missing.length > 0) {
        updates.bot_stage = 'esperando_datos_nuevo';
        updates.bot_active = true;
        const nextStage = 'esperando_datos_nuevo';
        let reply = buildMissingFieldsPrompt(mergedPatientData.nombre_completo, missing, mergedPatientData);
        if (intentPromptPrefix) {
            reply = intentPromptPrefix + '\n\n' + reply;
        }
        return { nextStage, replyText: reply };
    } else {
        const resolvedName = mergedPatientData.nombre_completo || 'Paciente';
        updates.dni = mergedPatientData.dni;
        updates.nombre_completo = resolvedName;
        updates.obra_social = mergedPatientData.obra_social || 'Particular';
        updates.fecha_nacimiento = mergedPatientData.fecha_nacimiento;
        updates.departamento = mergedPatientData.departamento;
        updates.telefono_contacto = mergedPatientData.telefono_contacto || phone;
        updates.es_paciente_existente = false;
        updates.status = 'sin_asignar';
        updates.bot_active = false;
        updates.bot_stage = 'esperando_agente';
        const nextStage = 'esperando_agente';

        updates.ai_summary = buildTriageSummary(updates, intent, doctorRecord, false, mergedPatientData.edad);

        const ageNote = mergedPatientData.edad ? ` (${mergedPatientData.edad} años)` : '';
        const docNote = doctorDisplay ? `\n• *Profesional solicitado:* ${doctorDisplay}` : '';
        const reply = `¡Excelente *${resolvedName}*! ✅ Registramos todos tus datos de admisión:\n\n` +
            `📋 *Ficha de Admisión Digital:*\n` +
            `• *DNI:* ${updates.dni}\n` +
            `• *Obra Social / Prepaga:* ${updates.obra_social}\n` +
            `• *Nacimiento:* ${updates.fecha_nacimiento || '—'}${ageNote}\n` +
            `• *Departamento:* ${updates.departamento}\n` +
            `• *Contacto:* ${updates.telefono_contacto}${docNote}\n\n` +
            `Tu ficha ya está disponible en la pantalla del equipo de atención. Un asesor tomará tu conversación a la brevedad para coordinar tu trámite.\n\n` +
            `${getAgentHandoffNotice()}`;

        return { nextStage, replyText: reply };
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
    if (fnMatch) {
        vars.fecha_nacimiento = fnMatch[0];
        const age = calculateAgeFromBirthDate(fnMatch[0]);
        if (age !== null) vars.edad = age;
    }

    // Extracción de edad explícita (ej: "tengo 32 años", "edad: 4 años", "28 años")
    const ageMatch = text.match(/\b(?:tengo|edad|de)\s*[:\s]*(\d{1,2})\s*(?:años)?\b/i) || text.match(/\b(\d{1,2})\s*años\b/i);
    if (ageMatch && !vars.edad) {
        const parsedAge = parseInt(ageMatch[1], 10);
        if (parsedAge >= 0 && parsedAge <= 115) {
            vars.edad = parsedAge;
        }
    }

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

    // Obras Sociales frecuentes en San Juan
    const commonOs = [
        'OSP', 'Obra Social Provincia', 'OSDE', 'Swiss Medical', 'DAMSUP', 'PAMI',
        'Medifé', 'Galeno', 'Sancor Salud', 'OMINT', 'Jerárquicos', 'Particular'
    ];
    for (const o of commonOs) {
        if (new RegExp(`\\b${o}\\b`, 'i').test(text)) {
            vars.obra_social = o === 'Obra Social Provincia' ? 'OSP' : o;
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
                            content: `Eres el extractor clínico y administrativo del Contact Center de Sanatorio Argentino en San Juan, Argentina.
Extrae del mensaje del paciente un JSON con los siguientes campos:
- nombre_completo: Nombre y apellido del paciente a atender (string o null). No incluyas palabras como "Hola", "Doctor", "Turno", etc.
- dni: Número de DNI (solo 7 u 8 dígitos numéricos) o null.
- fecha_nacimiento: Fecha de nacimiento en formato DD/MM/AAAA o null.
- edad: Edad del paciente en años como número entero o null. Si menciona fecha de nacimiento, calcula también la edad actual.
- obra_social: Nombre de la obra social, prepaga o si es Particular (ej: OSP, OSDE, Swiss Medical, DAMSUP, Particular) o null.
- departamento: Localidad o departamento de San Juan donde reside (ej: Capital, Rawson, Rivadavia, Santa Lucía, Chimbas, Pocito, Caucete, etc.) o null.
- telefono_contacto: Número de teléfono alternativo o null.
- motivo_consulta: Breve síntesis de lo que necesita o null.
- medico_o_especialidad: Profesional o especialidad requerida o null.
Si un dato no fue aportado en el texto, indícalo como null.`
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
                if (parsed.dni && !vars.dni) vars.dni = parsed.dni;
                if (parsed.obra_social && !vars.obra_social) vars.obra_social = parsed.obra_social;
                if (parsed.fecha_nacimiento && !vars.fecha_nacimiento) vars.fecha_nacimiento = parsed.fecha_nacimiento;
                if (parsed.edad !== undefined && parsed.edad !== null && !vars.edad) vars.edad = parsed.edad;
                if (parsed.email && !vars.email) vars.email = parsed.email;
                if (parsed.telefono_contacto && !vars.telefono_contacto) vars.telefono_contacto = parsed.telefono_contacto;
                if (parsed.departamento && !vars.departamento) vars.departamento = parsed.departamento;
                if (parsed.motivo_consulta && !vars.motivo_consulta) vars.motivo_consulta = parsed.motivo_consulta;
                if (parsed.medico_o_especialidad && !vars.medico_o_especialidad) vars.medico_o_especialidad = parsed.medico_o_especialidad;
            }
        } catch (aiErr) {
            console.warn('[triage-bot] Fallback IA:', aiErr);
        }
    }

    // Si tiene fecha de nacimiento y no tiene edad, calcularla
    if (vars.fecha_nacimiento && !vars.edad) {
        vars.edad = calculateAgeFromBirthDate(vars.fecha_nacimiento);
    }

    // Fallback de nombre si no se obtuvo
    if (!vars.nombre_completo) {
        const lines = text.split(/[\r\n,]+/).map(l => l.trim()).filter(Boolean);
        if (lines.length > 0 && lines[0].length < 40 && !/\d/.test(lines[0]) && !/^(hola|buenas|buen dia|turno|consulta)/i.test(lines[0])) {
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
        const targetLine = lineId || 'contact_center';
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
                line_id: targetLine,
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
                lineId: targetLine
            })
        });

        console.log(`[triage-bot] ✅ Mensaje despachado a ${phone} | status: ${res.status}`);
    } catch (err: any) {
        console.error('[triage-bot] Error enviando respuesta WhatsApp:', err?.message || err);
    }
}

