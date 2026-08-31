import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { action, payload } = await req.json();

        // ---------------------------------------------------------
        // LIVE TRANSCRIPTION (Chunks) - FAST WHISPER
        // ---------------------------------------------------------
        if (action === 'transcribe_chunk') {
            const { chunkBase64, isMp3, isWav } = payload;
            if (!chunkBase64) throw new Error("Falta chunkBase64");
            
            // Convert base64 to File
            const byteCharacters = atob(chunkBase64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'audio/webm' });
            
            const formData = new FormData();
            formData.append('file', new File([blob], 'chunk.webm', { type: 'audio/webm' }));
            formData.append('model', 'whisper-1');
            formData.append('language', 'es');
            formData.append('temperature', '0');
            formData.append('prompt', 'Entrevista de Gobernanza de Datos en español. (Por favor, ignora el silencio o ruido de fondo).');
            
            const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
                body: formData
            });

            if (!whisperRes.ok) {
                const errorText = await whisperRes.text();
                // OpenAI often returns 400 for audio that is too short (only silence).
                // Instead of failing the edge function and returning a 400 to the client, we just return empty text.
                console.error("Whisper Error:", errorText);
                return new Response(JSON.stringify({ success: true, text: "" }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
            const whisperData = await whisperRes.json();
            
            return new Response(JSON.stringify({ success: true, text: whisperData.text }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // ---------------------------------------------------------
        // FULL AUDIO ANALYSIS - DEEPGRAM DIARIZATION
        // ---------------------------------------------------------
        if (action === 'transcribe_and_analyze' || action === 'analyze_text') {
            const { entrevista_id, plantilla_id, participantes } = payload;
            let transcript = "";

            if (action === 'transcribe_and_analyze') {
                const { audio_path } = payload;
                // 1. Download audio from Supabase Storage
                const { data: audioData, error: downloadError } = await supabase.storage
                    .from('gobernanza_audios')
                    .download(audio_path);

                if (downloadError) throw new Error(`Error downloading audio: ${downloadError.message}`);

                const DEEPGRAM_API_KEY = "896c8da735b5edce67498d67fc58422f11962dce";
                
                const deepgramRes = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=es&diarize=true&smart_format=true', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Token ${DEEPGRAM_API_KEY}`,
                        'Content-Type': 'audio/webm'
                    },
                    body: audioData
                });

                if (!deepgramRes.ok) {
                    const errText = await deepgramRes.text();
                    throw new Error(`Deepgram Error: ${errText}`);
                }

                const dgData = await deepgramRes.json();
                
                // Parse diarization
                const words = dgData?.results?.channels?.[0]?.alternatives?.[0]?.words || [];
                let formattedTranscript = "";
                let currentSpeaker = null;
                let currentText = "";
                
                if (words.length > 0) {
                    for (const w of words) {
                        const speaker = w.speaker || 0;
                        const word = w.punctuated_word || w.word;
                        if (speaker !== currentSpeaker) {
                            if (currentSpeaker !== null) {
                                formattedTranscript += `\n[Participante ${currentSpeaker}]: ${currentText.trim()} `;
                            }
                            currentSpeaker = speaker;
                            currentText = word;
                        } else {
                            currentText += ` ${word}`;
                        }
                    }
                    if (currentSpeaker !== null) {
                        formattedTranscript += `\n[Participante ${currentSpeaker}]: ${currentText.trim()} `;
                    }
                    transcript = formattedTranscript.trim();
                } else {
                    transcript = dgData?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
                }
            } else {
                // Manual text analysis
                transcript = payload.transcript_text;
            }

            const manual_answers = payload.manual_answers || {};

            // 3. Get Plantilla Questions
            let customQuestions = [];
            if (plantilla_id) {
                const { data: plantilla } = await supabase
                    .from('gobernanza_plantillas')
                    .select('preguntas')
                    .eq('id', plantilla_id)
                    .single();
                customQuestions = plantilla?.preguntas || [];
            }
            
            // Format questions as a numbered list for GPT-4, injecting manual answers if provided
            const numberedQuestions = customQuestions.map((q, i) => {
                const manualAnswer = manual_answers[i];
                if (manualAnswer && manualAnswer.trim().length > 0) {
                    return `${i + 1}. ${q}\n   -> [BORRADOR MANUAL MAPEADO EN VIVO]: ${manualAnswer}`;
                }
                return `${i + 1}. ${q}`;
            }).join('\n');

            // 4. Analyze with GPT-4o-mini
            const systemPrompt = `
Eres un asistente experto en auditoría y gobernanza de datos para el Sanatorio Argentino.
Te proveeré la transcripción de una entrevista y la lista de preguntas que se debían responder.

${participantes ? `INFORMACIÓN DE PARTICIPANTES (DIARIZACIÓN):
Se ha detectado audio de distintos locutores. El sistema enumera a los participantes como [Participante 0], [Participante 1], etc. 
La lista esperada de personas en la sala es: ${participantes}.
INSTRUCCIÓN VITAL: Al leer el texto inicial, detecta cómo se presenta cada uno. Si el [Participante 0] se presenta como "soy Lucas", a partir de ahí asume que siempre es Lucas. En tu resumen, minutas y mapa usa sus NOMBRES REALES basándote en la lista proporcionada y el contexto de las presentaciones, NUNCA uses "Participante X".` : ''}

OBJETIVOS OBLIGATORIOS:
1. "resumen": Redacta un resumen ejecutivo de los puntos tratados (1 párrafo).
2. "minutas": Redacta los puntos clave (bullet points) para armar diapositivas de presentación. Si se menciona a alguien, indica su nombre.
3. "mapa_conceptual_mermaid": Crea un diagrama en código Mermaid.js que resuma TODA la charla de forma global (no te limites a las respuestas de las preguntas). Relaciona los conceptos principales, áreas, problemas y decisiones que surgieron espontáneamente en la conversación. (ej: graph TD; A-->B).
4. "respuestas": Analiza qué dijo el entrevistado respecto a cada pregunta de la plantilla. Si hay un [BORRADOR MANUAL MAPEADO EN VIVO] adjunto a una pregunta, úsalo como la base principal (es el borrador que el usuario marcó en vivo como la respuesta). Pule su redacción y complétalo con la transcripción si hay más detalles. Si no respondió ni hay borrador, escribe "No especificado en el audio".

PREGUNTAS DE LA PLANTILLA:
${numberedQuestions}

Responde ESTRICTAMENTE en este formato JSON:
{
  "resumen": "Resumen general...",
  "minutas": ["Punto 1", "Punto 2"],
  "mapa_conceptual_mermaid": "graph TD\\n  A[Entidad] --> B[Proceso]",
  "respuestas": [
    { "pregunta": "Pregunta 1", "respuesta": "Lo que dijo el usuario..." }
  ]
}`;

            const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: `PREGUNTAS DE LA PLANTILLA:\n${numberedQuestions}\n\nTRANSCRIPCIÓN:\n"${transcript}"` }
                    ],
                    response_format: { type: 'json_object' },
                    temperature: 0.2
                })
            });

            if (!gptRes.ok) {
                const errText = await gptRes.text();
                throw new Error(`GPT Error: ${gptRes.status} - ${errText}`);
            }
            const gptData = await gptRes.json();
            const aiResponse = JSON.parse(gptData.choices[0].message.content);

            // 5. Update Database
            if (entrevista_id) {
                const { error: updateError } = await supabase
                    .from('gobernanza_entrevistas')
                    .update({
                        transcripcion: transcript,
                        resumen: aiResponse.resumen,
                        minutas: aiResponse.minutas,
                        mapa_conceptual_mermaid: aiResponse.mapa_conceptual_mermaid,
                        respuestas_cuestionario: aiResponse.respuestas,
                        estado: 'completado',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', entrevista_id);

                if (updateError) throw new Error(`DB Update Error: ${updateError.message}`);
            }

            return new Response(JSON.stringify({ 
                success: true, 
                transcript, 
                aiResponse 
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        throw new Error('Action not supported');
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
