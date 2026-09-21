// Supabase Edge Function: analyze-medical-order
// Sanatorio Argentino - Contact Center AI Vision Auditor
// Analiza fotos de órdenes médicas/recetas y extrae los datos clave para el operador.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';

Deno.serve(async (req) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    try {
        const body = await req.json();
        const { imageUrl, messageId, phone } = body;

        if (!imageUrl) {
            return new Response(JSON.stringify({ error: 'imageUrl is required' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (!OPENAI_API_KEY) {
            return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        console.log(`[analyze-medical-order] Procesando imagen: ${imageUrl} (messageId: ${messageId})`);

        // 1. Descargar imagen y convertir a Base64 para máxima confiabilidad con OpenAI
        const imgRes = await fetch(imageUrl);
        if (!imgRes.ok) {
            throw new Error(`No se pudo descargar la imagen: HTTP ${imgRes.status}`);
        }

        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
        const imgBuffer = await imgRes.arrayBuffer();
        const uint8Array = new Uint8Array(imgBuffer);
        
        // Convert to Base64 chunks (avoiding call stack size exceeded)
        let binary = '';
        const len = uint8Array.byteLength;
        const chunkSize = 8192;
        for (let i = 0; i < len; i += chunkSize) {
            const sub = uint8Array.subarray(i, Math.min(i + chunkSize, len));
            binary += String.fromCharCode.apply(null, sub as unknown as number[]);
        }
        const base64Data = btoa(binary);
        const dataUrl = `data:${contentType};base64,${base64Data}`;

        // 2. Llamada a OpenAI Vision (gpt-4o-mini o gpt-4o)
        const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                temperature: 0.1,
                response_format: { type: 'json_object' },
                messages: [
                    {
                        role: 'system',
                        content: `Eres un auditor médico y administrativo experto de Sanatorio Argentino (San Juan, Argentina).
Tu tarea es examinar con precisión la imagen de una orden médica, prescripción, pedido médico o receta enviada por un paciente para gestionar una autorización.

Debes extraer los datos específicos y responder ÚNICAMENTE un JSON con este formato exacto:
{
  "es_orden_medica": true,
  "estudio": "Nombre del estudio o práctica solicitada (ej: ecodoppler de vasos de cuello, resonancia magnética lumbar, hemograma completo)",
  "solicitante": "Nombre y apellido del médico solicitante, identificado estrictamente a partir del SELLO del médico o firma aclarada (ej: Dr. Correa Gustavo)",
  "matricula": "Número de matrícula profesional extraído estrictamente del sello médico (ej: 3322 o M.P. 3322)",
  "diagnostico": "Diagnóstico, sospecha clínica o motivo consignado en la orden (ej: HT, HTA, control postoperatorio)",
  "fecha_solicitud": "Fecha de solicitud/prescripción que suele figurar al pie de la orden cerca del sello (ej: 30/08/2026)",
  "obra_social": "Obra social o prepaga si figura en la orden (ej: OSP, DAMSUP, OSDE, Particular)",
  "observaciones": "Detalles adicionales como si es urgente, con contraste, bilateral, etc."
}

Reglas estrictas:
1. El "solicitante" es el profesional médico que firma y sella la orden, NO el paciente.
2. La "matricula" es la M.P. o M.N. del médico obtenida de su sello.
3. La "fecha_solicitud" es la fecha de emisión del pedido médico (fundamental para validar los 30 días de vigencia).
4. Si la imagen NO es una orden médica o pedido de salud (ej: selfie, meme, comprobante de pago no médico), pon "es_orden_medica": false y explica en "estudio".
5. Si algún dato no figura o es ilegible, coloca "No especificado" o "Ilegible".`,
                    },
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: 'Analiza esta orden médica y extrae estudio a autorizar, solicitante por sello, matrícula por sello, diagnóstico y fecha de solicitud:',
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: dataUrl,
                                    detail: 'high',
                                },
                            },
                        ],
                    },
                ],
            }),
        });

        if (!openAiRes.ok) {
            const errText = await openAiRes.text();
            throw new Error(`OpenAI Vision error: HTTP ${openAiRes.status} - ${errText}`);
        }

        const aiJson = await openAiRes.json();
        const rawContent = aiJson.choices?.[0]?.message?.content || '{}';
        const parsedAnalysis = JSON.parse(rawContent);

        // 3. Formatear la descripción concisa requerida para el operador
        const formattedSummary = [
            `Estudio a autorizar: ${parsedAnalysis.estudio || 'No especificado'}`,
            `Solicitante: ${parsedAnalysis.solicitante || 'No especificado'}`,
            `Matricula: ${parsedAnalysis.matricula || 'No especificada'}`,
            `Diagnostico: ${parsedAnalysis.diagnostico || 'No especificado'}`,
            `Fecha de solicitud: ${parsedAnalysis.fecha_solicitud || 'No especificada'}`,
        ].join('\n');

        const finalPayload = {
            ...parsedAnalysis,
            raw_summary: formattedSummary,
            analyzed_at: new Date().toISOString(),
        };

        console.log('[analyze-medical-order] ✅ Análisis completado:', formattedSummary);

        // 4. Si se proporcionó messageId, actualizar whatsapp_messages
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        if (messageId) {
            const { data: existingMsg } = await supabase
                .from('whatsapp_messages')
                .select('raw_payload')
                .eq('id', messageId)
                .maybeSingle();

            const currentPayload = existingMsg?.raw_payload || {};
            const updatedPayload = {
                ...currentPayload,
                order_analysis: finalPayload,
            };

            const { error: updateErr } = await supabase
                .from('whatsapp_messages')
                .update({ raw_payload: updatedPayload })
                .eq('id', messageId);

            if (updateErr) {
                console.error('[analyze-medical-order] Error actualizando whatsapp_messages:', updateErr);
            } else {
                console.log(`[analyze-medical-order] Mensaje ${messageId} actualizado con order_analysis.`);
            }
        }

        // 5. Si es orden médica y se pasó el teléfono, actualizar motivo en contact_center_conversations
        if (phone && parsedAnalysis.es_orden_medica && parsedAnalysis.estudio) {
            try {
                await supabase
                    .from('contact_center_conversations')
                    .update({
                        motivo_consulta: `Autorización: ${parsedAnalysis.estudio.substring(0, 100)}`,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('phone', phone);
            } catch (convErr) {
                console.warn('[analyze-medical-order] Non-fatal updating conv:', convErr);
            }
        }

        return new Response(
            JSON.stringify({
                ok: true,
                analysis: finalPayload,
                summary: formattedSummary,
            }),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    } catch (error: any) {
        console.error('[analyze-medical-order] Error:', error);
        return new Response(
            JSON.stringify({ ok: false, error: error.message || 'Error analizando la orden' }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    }
});
