// Supabase Edge Function: persist-existing-media
// Script de migración one-time para persistir media de URLs temporales existentes
// Busca mensajes con media_url temporales y las persiste en Storage
// EJECUCIÓN: POST /functions/v1/persist-existing-media (con authorization header)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const STORAGE_BUCKET = 'whatsapp-media';

Deno.serve(async (req) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Obtener la URL base de nuestro storage para detectar qué ya fue persistido
    const { data: testUrl } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl('test');
    const storageBaseUrl = testUrl?.publicUrl?.replace('/test', '') || '';

    console.log(`[persist] Storage base URL: ${storageBaseUrl}`);

    // Buscar mensajes con media que NO estén ya en nuestro Storage
    const { data: messages, error: fetchError } = await supabase
        .from('whatsapp_messages')
        .select('id, phone, media_url, media_type, created_at')
        .not('media_url', 'is', null)
        .not('media_type', 'eq', 'text')
        .order('created_at', { ascending: false });

    if (fetchError) {
        return new Response(
            JSON.stringify({ error: fetchError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Filtrar: solo los que NO tienen URL de nuestro storage
    const pending = (messages || []).filter(m =>
        m.media_url && !m.media_url.includes(storageBaseUrl)
    );

    console.log(`[persist] Total mensajes con media: ${messages?.length}, Pendientes de persistir: ${pending.length}`);

    const results = {
        total: pending.length,
        persisted: 0,
        failed: 0,
        skipped: 0,
        details: [] as any[],
    };

    // Procesar en lotes de 5 para no saturar
    for (let i = 0; i < pending.length; i++) {
        const msg = pending[i];
        try {
            console.log(`[persist] (${i + 1}/${pending.length}) Procesando msg ${msg.id}...`);

            // Descargar archivo temporal
            const response = await fetch(msg.media_url);
            if (!response.ok) {
                console.warn(`[persist] msg ${msg.id}: HTTP ${response.status} — URL expirada o inaccesible`);
                results.failed++;
                results.details.push({ id: msg.id, status: 'expired', httpStatus: response.status });
                continue;
            }

            const fileBuffer = await response.arrayBuffer();
            const fileSize = fileBuffer.byteLength;

            // Skip archivos muy grandes (>50MB)
            if (fileSize > 50 * 1024 * 1024) {
                results.skipped++;
                results.details.push({ id: msg.id, status: 'too_large', size: fileSize });
                continue;
            }

            const contentType = response.headers.get('content-type') || 'application/octet-stream';
            const extension = getExtensionFromMime(contentType, msg.media_url, msg.media_type);
            const timestamp = new Date(msg.created_at).getTime();
            const random = Math.random().toString(36).substring(2, 8);
            const filePath = `incoming/${msg.phone}/${timestamp}_${random}.${extension}`;

            // Subir a Storage
            const { error: uploadError } = await supabase.storage
                .from(STORAGE_BUCKET)
                .upload(filePath, fileBuffer, {
                    contentType,
                    cacheControl: '31536000',
                    upsert: false,
                });

            if (uploadError) {
                console.error(`[persist] msg ${msg.id}: Error upload:`, uploadError.message);
                results.failed++;
                results.details.push({ id: msg.id, status: 'upload_error', error: uploadError.message });
                continue;
            }

            // Obtener URL pública
            const { data: publicUrlData } = supabase.storage
                .from(STORAGE_BUCKET)
                .getPublicUrl(filePath);

            const permanentUrl = publicUrlData?.publicUrl;
            if (!permanentUrl) {
                results.failed++;
                results.details.push({ id: msg.id, status: 'no_public_url' });
                continue;
            }

            // Actualizar el registro: guardar URL permanente y preservar original
            const { error: updateError } = await supabase
                .from('whatsapp_messages')
                .update({
                    media_url: permanentUrl,
                    original_media_url: msg.media_url,
                })
                .eq('id', msg.id);

            if (updateError) {
                console.error(`[persist] msg ${msg.id}: Error update:`, updateError.message);
                results.failed++;
                results.details.push({ id: msg.id, status: 'update_error', error: updateError.message });
                continue;
            }

            results.persisted++;
            results.details.push({ id: msg.id, status: 'ok', url: permanentUrl });
            console.log(`[persist] ✅ msg ${msg.id} persistido`);

        } catch (err) {
            console.error(`[persist] msg ${msg.id}: Error:`, err.message);
            results.failed++;
            results.details.push({ id: msg.id, status: 'error', error: err.message });
        }

        // Esperar 200ms entre archivos para no saturar
        await new Promise(r => setTimeout(r, 200));
    }

    console.log(`[persist] Completo: ${results.persisted} persistidos, ${results.failed} fallidos, ${results.skipped} omitidos`);

    return new Response(
        JSON.stringify(results),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
});

function getExtensionFromMime(contentType: string, url: string, mediaType: string): string {
    const urlExtMatch = url.match(/\.([a-zA-Z0-9]{2,5})(?:\?|$)/);
    if (urlExtMatch) {
        const ext = urlExtMatch[1].toLowerCase();
        const validExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp3', 'ogg', 'opus', 'wav',
            'mp4', 'mov', 'webm', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt'];
        if (validExts.includes(ext)) return ext;
    }

    const mimeMap: Record<string, string> = {
        'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
        'audio/ogg': 'ogg', 'audio/opus': 'opus', 'audio/mpeg': 'mp3',
        'video/mp4': 'mp4', 'video/webm': 'webm',
        'application/pdf': 'pdf',
    };

    const mime = contentType.split(';')[0].trim().toLowerCase();
    if (mimeMap[mime]) return mimeMap[mime];

    switch (mediaType) {
        case 'image': return 'jpg';
        case 'audio': return 'ogg';
        case 'video': return 'mp4';
        case 'document': return 'bin';
        default: return 'bin';
    }
}
