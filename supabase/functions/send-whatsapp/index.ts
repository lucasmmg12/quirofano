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
        const body = await req.json();
        console.log(`[send-whatsapp] === INCOMING REQUEST ===`);
        console.log(`[send-whatsapp] Full body:`, JSON.stringify(body));
        console.log(`[send-whatsapp] body.to:`, body.to, `| body.action:`, body.action, `| body.lineId:`, body.lineId);
        const { action, lineId } = body;

        // ========================================
        // ACTION: list_templates — Listar plantillas Meta
        // ========================================
        if (action === 'list_templates') {
            const config = await getBuilderBotConfig(lineId);
            const url = `https://app.builderbot.cloud/api/v2/${config.projectId}/whatsapp-template?limit=50`;
            
            console.log(`[send-whatsapp] list_templates | Línea: ${lineId}`);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'x-api-builderbot': config.apiKey },
            });
            
            const data = await response.json();
            
            // Check for API errors (BuilderBot returns {success: false, error: "..."} on config issues)
            if (!response.ok || data?.success === false) {
                const errorMsg = data?.error || `HTTP ${response.status}`;
                console.error(`[send-whatsapp] list_templates ERROR: ${errorMsg}`);
                return new Response(
                    JSON.stringify({ success: false, error: errorMsg, templates: [] }),
                    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
            
            const templates = Array.isArray(data) ? data : data?.templates || data?.data || [];
            
            return new Response(
                JSON.stringify({ success: true, templates }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // ========================================
        // ACTION: send_template — Enviar plantilla Meta
        // ========================================
        if (action === 'send_template') {
            // Force string coercion to prevent Zod validation issues in BuilderBot
            const to = String(body.to || '').trim();
            const templateName = String(body.templateName || '').trim();
            const languageCode = String(body.languageCode || 'es').trim();
            const components = body.components;
            
            console.log(`[send-whatsapp] send_template parsed | to: "${to}" | template: "${templateName}" | lang: "${languageCode}"`);
            
            if (!to || !templateName) {
                return new Response(
                    JSON.stringify({ error: 'to and templateName are required' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
            
            const config = await getBuilderBotConfig(lineId);
            const url = `https://app.builderbot.cloud/api/v2/${config.projectId}/whatsapp-template`;
            
            const templateBody: Record<string, unknown> = {
                to,
                templateName,
                languageCode: languageCode || 'es',
            };
            if (components) templateBody.components = components;
            
            console.log(`[send-whatsapp] send_template | Línea: ${lineId} | Template: ${templateName} | Lang: ${languageCode || 'es'} → ${to}`);
            console.log(`[send-whatsapp] Request URL: ${url}`);
            console.log(`[send-whatsapp] Request body:`, JSON.stringify(templateBody));
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-builderbot': config.apiKey,
                },
                body: JSON.stringify(templateBody),
            });
            
            const rawText = await response.text();
            console.log(`[send-whatsapp] Response status: ${response.status}`);
            console.log(`[send-whatsapp] Response body: ${rawText}`);
            
            let data;
            try {
                data = JSON.parse(rawText);
            } catch {
                data = { rawResponse: rawText };
            }
            
            if (!response.ok) {
                console.error('[send-whatsapp] Template send FAILED:', response.status, data);
                return new Response(
                    JSON.stringify({ 
                        success: false, 
                        error: data?.message || data?.error || data?.rawResponse || `HTTP ${response.status}`,
                        details: data,
                        sentPayload: templateBody,
                    }),
                    { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
            
            return new Response(
                JSON.stringify({ success: true, data }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // ========================================
        // DEFAULT: Enviar mensaje de texto (lógica existente)
        // ========================================
        const { content, number, mediaUrl } = body;

        if (!content || !number) {
            return new Response(
                JSON.stringify({ error: 'content and number are required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Leer credenciales según la línea
        const config = await getBuilderBotConfig(lineId);
        const BUILDERBOT_URL = `https://app.builderbot.cloud/api/v2/${config.projectId}/messages`;

        const msgBody = {
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
            body: JSON.stringify(msgBody),
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

