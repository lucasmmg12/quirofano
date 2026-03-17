// Supabase Edge Function: send-whatsapp
// Proxy server-side para BuilderBot API (evita CORS)
// Soporta múltiples líneas WhatsApp: lee credenciales desde whatsapp_lines
// Fallback a app_config para retrocompatibilidad

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Cache para no leer la DB en cada request (por línea)
const cachedConfigs: Record<string, { apiKey: string; projectId: string; cachedAt: number }> = {};
const CACHE_TTL = 60 * 1000; // 1 minuto

async function getBuilderBotConfig(lineId?: string) {
    const cacheKey = lineId || '__legacy__';

    // Si tenemos cache válido, usarlo
    if (cachedConfigs[cacheKey] && Date.now() - cachedConfigs[cacheKey].cachedAt < CACHE_TTL) {
        return cachedConfigs[cacheKey];
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Intentar leer de whatsapp_lines si hay lineId
    if (lineId) {
        const { data: line, error: lineError } = await supabase
            .from('whatsapp_lines')
            .select('api_key, project_id')
            .eq('id', lineId)
            .eq('is_active', true)
            .single();

        if (!lineError && line?.api_key && line?.project_id
            && line.api_key !== 'configurar-desde-panel'
            && line.project_id !== 'configurar-desde-panel') {
            cachedConfigs[cacheKey] = {
                apiKey: line.api_key,
                projectId: line.project_id,
                cachedAt: Date.now(),
            };
            return cachedConfigs[cacheKey];
        }
    }

    // Fallback: leer de app_config (retrocompatibilidad)
    const { data, error } = await supabase
        .from('app_config')
        .select('key, value')
        .in('key', ['builderbot_api_key', 'builderbot_project_id']);

    if (error) throw new Error('Error leyendo config: ' + error.message);

    const configMap: Record<string, string> = {};
    (data || []).forEach((row: { key: string; value: string }) => {
        configMap[row.key] = row.value;
    });

    const apiKey = configMap['builderbot_api_key'];
    const projectId = configMap['builderbot_project_id'];

    if (!apiKey || !projectId) {
        throw new Error('Faltan credenciales de BuilderBot');
    }

    cachedConfigs[cacheKey] = { apiKey, projectId, cachedAt: Date.now() };
    return cachedConfigs[cacheKey];
}

Deno.serve(async (req) => {
    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { content, number, mediaUrl, lineId } = await req.json();

        if (!content || !number) {
            return new Response(
                JSON.stringify({ error: 'content and number are required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Leer credenciales según la línea
        const config = await getBuilderBotConfig(lineId);
        const BUILDERBOT_URL = `https://app.builderbot.cloud/api/v2/${config.projectId}/messages`;

        const body = {
            messages: {
                content,
                ...(mediaUrl && { mediaUrl }),
            },
            number,
            checkIfExists: false,
        };

        console.log(`[send-whatsapp] Línea: ${lineId || 'legacy'} | Enviando a ${number}:`, content.substring(0, 50));

        const response = await fetch(BUILDERBOT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-builderbot': config.apiKey,
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();

        return new Response(
            JSON.stringify({ success: true, data, lineId: lineId || 'legacy' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('[send-whatsapp] Error:', error.message);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
