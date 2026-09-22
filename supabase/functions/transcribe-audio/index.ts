// Supabase Edge Function: transcribe-audio
// Sanatorio Argentino - Contact Center AI Audio Transcriber & Interpreter
// Transcribe audios de pacientes usando OpenAI Whisper y extrae intención médica con GPT-4o-mini.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';

function normalizeArgentinePhone(phone: string): string {
    if (!phone) return '';
    let digits = phone.replace(/\D/g, '');
    if (digits.startsWith('549') && digits.length === 13) return digits;
    if (digits.startsWith('54') && !digits.startsWith('549') && digits.length === 12) {
        return '549' + digits.substring(2);
    }
    if (digits.length === 10) return '549' + digits;
    if (digits.length === 11 && digits.startsWith('0')) return '549' + digits.substring(1);
    if (digits.length === 8) return '549264' + digits;
    return digits;
}

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
        const { audioUrl, messageId, phone } = body;

        if (!audioUrl) {
            return new Response(JSON.stringify({ ok: false, error: 'audioUrl is required' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (!OPENAI_API_KEY) {
            return new Response(JSON.stringify({ ok: false, error: 'OPENAI_API_KEY not configured' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        console.log(`[transcribe-audio] 🎙️ Descargando audio para transcribir: ${audioUrl} (msg: ${messageId || 'direct'})`);

        // 1. Descargar el archivo de audio
        const audioRes = await fetch(audioUrl);
        if (!audioRes.ok) {
            throw new Error(`No se pudo descargar el audio (${audioRes.status}): ${audioUrl}`);
        }

        const audioBlob = await audioRes.blob();
        const contentType = audioRes.headers.get('content-type') || 'audio/ogg';

        // Determinar extensión adecuada
        let filename = 'audio.ogg';
        const cleanUrl = audioUrl.toLowerCase();
        if (contentType.includes('mp3') || cleanUrl.includes('.mp3')) filename = 'audio.mp3';
        else if (contentType.includes('wav') || cleanUrl.includes('.wav')) filename = 'audio.wav';
        else if (contentType.includes('m4a') || cleanUrl.includes('.m4a')) filename = 'audio.m4a';
        else if (contentType.includes('webm') || cleanUrl.includes('.webm')) filename = 'audio.webm';
        else if (contentType.includes('aac') || cleanUrl.includes('.aac')) filename = 'audio.aac';
        else if (contentType.includes('ogg') || contentType.includes('opus') || cleanUrl.includes('.ogg') || cleanUrl.includes('.opus')) filename = 'audio.ogg';

        // 2. Enviar a OpenAI Whisper-1
        const formData = new FormData();
        const file = new File([audioBlob], filename, { type: contentType });
        formData.append('file', file);
        formData.append('model', 'whisper-1');
        formData.append('language', 'es');
        formData.append('prompt', 'Sanatorio Argentino, paciente, turnos médicos, doctores, obras sociales, consultas clínicas');

        console.log(`[transcribe-audio] 🤖 Enviando a OpenAI Whisper-1 (${filename}, ${audioBlob.size} bytes)...`);

        const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
            },
            body: formData,
        });

        if (!whisperRes.ok) {
            const errText = await whisperRes.text();
            console.error(`[transcribe-audio] Error OpenAI Whisper: HTTP ${whisperRes.status}`, errText);
            throw new Error(`OpenAI Whisper error: ${errText}`);
        }

        const whisperData = await whisperRes.json();
        const transcriptionText = (whisperData.text || '').trim();

        console.log(`[transcribe-audio] ✅ Transcripción obtenida: "${transcriptionText}"`);

        // 3. Extracción de entendimiento clínico e intención con GPT-4o-mini
        let understanding: any = null;
        if (transcriptionText) {
            try {
                const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        temperature: 0.1,
                        response_format: { type: 'json_object' },
                        messages: [
                            {
                                role: 'system',
                                content: `Eres el asistente de triage inteligente del Contact Center de Sanatorio Argentino.
Analiza la siguiente transcripción de un audio enviado por un paciente por WhatsApp. Extrae un JSON estricto con:
{
  "resumen": "Resumen claro de 1 oración sobre qué solicita o consulta el paciente",
  "intencion": "Categoría (ej: Turno Médico, Consulta Cobertura/Obra Social, Pedido de Presupuesto, Indicaciones de Estudio, Urgencia Médica, Reclamo, Consulta General)",
  "medico_mencionado": "Nombre del médico o profesional si fue mencionado, o null",
  "especialidad": "Especialidad médica mencionada o inferida, o null",
  "obra_social": "Obra social o prepaga mencionada, o null",
  "paciente_nombre": "Si el paciente dice su nombre o el de su familiar, o null",
  "urgencia": "normal" | "moderada" | "alta"
}`
                            },
                            {
                                role: 'user',
                                content: `Transcripción del audio del paciente:\n"${transcriptionText}"`
                            }
                        ]
                    })
                });

                if (aiRes.ok) {
                    const aiData = await aiRes.json();
                    const rawContent = aiData.choices?.[0]?.message?.content;
                    if (rawContent) {
                        understanding = JSON.parse(rawContent);
                    }
                }
            } catch (aiErr) {
                console.warn('[transcribe-audio] Non-fatal understanding error:', aiErr);
            }
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // 4. Si se proporcionó messageId, actualizar whatsapp_messages
        if (messageId) {
            const { data: existingMsg } = await supabase
                .from('whatsapp_messages')
                .select('content, raw_payload')
                .eq('id', messageId)
                .maybeSingle();

            const currentPayload = existingMsg?.raw_payload || {};
            const updatedPayload = {
                ...currentPayload,
                audio_transcription: transcriptionText,
                audio_understanding: understanding,
                transcribed_at: new Date().toISOString()
            };

            let updatedContent = existingMsg?.content || '';
            // Si el contenido era genérico o marcador de evento, reemplazarlo con el texto del audio
            if (!updatedContent || updatedContent === '[audio]' || updatedContent.startsWith('_event_media__')) {
                updatedContent = `🎤 "${transcriptionText}"`;
            }

            const { error: updateErr } = await supabase
                .from('whatsapp_messages')
                .update({
                    content: updatedContent,
                    raw_payload: updatedPayload
                })
                .eq('id', messageId);

            if (updateErr) {
                console.error('[transcribe-audio] Error actualizando whatsapp_messages:', updateErr);
            } else {
                console.log(`[transcribe-audio] ✅ whatsapp_messages ${messageId} enriquecido con transcripción e intención.`);
            }
        }

        // 5. Si se proporcionó teléfono, actualizar última actividad en contact_center_conversations
        if (phone && transcriptionText) {
            try {
                const norm = normalizeArgentinePhone(phone);
                await supabase
                    .from('contact_center_conversations')
                    .update({
                        last_message: `🎤 ${transcriptionText.slice(0, 85)}...`,
                        updated_at: new Date().toISOString()
                    })
                    .eq('phone', norm);
            } catch (convErr) {
                console.warn('[transcribe-audio] Non-fatal conv update:', convErr);
            }
        }

        return new Response(
            JSON.stringify({
                ok: true,
                transcription: transcriptionText,
                understanding: understanding,
                summary: understanding?.resumen || transcriptionText,
                transcribedAt: new Date().toISOString()
            }),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    } catch (error: any) {
        console.error('[transcribe-audio] Error general:', error);
        return new Response(
            JSON.stringify({ ok: false, error: error.message || 'Error transcribiendo audio' }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    }
});
