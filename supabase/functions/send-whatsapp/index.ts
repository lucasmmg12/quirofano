// Supabase Edge Function: send-whatsapp
// Proxy server-side para BuilderBot API (evita CORS)
// Lee credenciales desde app_config en la DB

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://hakysnqiryimxbwdslwe.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA0MjI3NCwiZXhwIjoyMDg1NjE4Mjc0fQ.v0Zw7yFjGKJX8xsMCZJPwRyhr2eNd1gjASsI7qSK0YM';

// Cache para no leer la DB en cada request
let cachedConfig: { apiKey: string; projectId: string; cachedAt: number } | null = null;
const CACHE_TTL = 60 * 1000; // 1 minuto

async function getBuilderBotConfig() {
    // Si tenemos cache válido, usarlo
    if (cachedConfig && Date.now() - cachedConfig.cachedAt < CACHE_TTL) {
        return cachedConfig;
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
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
        throw new Error('Faltan credenciales de BuilderBot en app_config');
    }

    cachedConfig = { apiKey, projectId, cachedAt: Date.now() };
    return cachedConfig;
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
        const { content, number, mediaUrl } = await req.json();

        if (!content || !number) {
            return new Response(
                JSON.stringify({ error: 'content and number are required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Leer credenciales desde DB
        const config = await getBuilderBotConfig();
        const BUILDERBOT_URL = `https://app.builderbot.cloud/api/v2/${config.projectId}/messages`;

        const body = {
            messages: {
                content,
                ...(mediaUrl && { mediaUrl }),
            },
            number,
            checkIfExists: false,
        };

        console.log(`[send-whatsapp] Enviando a ${number}:`, content.substring(0, 50));

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
            JSON.stringify({ success: true, data }),
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
