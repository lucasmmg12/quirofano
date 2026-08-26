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

                // 2. Transcribe with Whisper
                const formData = new FormData();
                // Determine mime type from extension
                const isMp3 = audio_path.endsWith('.mp3');
                const isWav = audio_path.endsWith('.wav');
                const mimeType = isMp3 ? 'audio/mpeg' : isWav ? 'audio/wav' : 'audio/webm';
                const filename = `audio.${isMp3 ? 'mp3' : isWav ? 'wav' : 'webm'}`;
                
                formData.append('file', new File([audioData], filename, { type: mimeType }));
                formData.append('model', 'whisper-1');
                formData.append('language', 'es');
                formData.append('prompt', 'Esta es una entrevista formal de auditoría y gobernanza de datos para el Sanatorio Argentino.');
                formData.append('temperature', '0.2');

                const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
                    body: formData
                });

                if (!whisperRes.ok) {
                    const errText = await whisperRes.text();
                    throw new Error(`Whisper Error: ${errText}`);
                }

                const whisperData = await whisperRes.json();
                transcript = whisperData.text;
            } else {
                // Manual text analysis
                transcript = payload.transcript_text;
            }

            // 3. Get Plantilla Questions
            const { data: plantilla } = await supabase
                .from('gobernanza_plantillas')
                .select('preguntas')
                .eq('id', plantilla_id)
                .single();

            const customQuestions = plantilla?.preguntas || [];
            
            // Format questions as a numbered list for GPT-4
            const numberedQuestions = customQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n');

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
3. "mapa_conceptual_mermaid": Crea un diagrama en código Mermaid.js que muestre las entidades y procesos técnicos mencionados en la charla (ej: graph TD; A-->B).
4. "respuestas": Analiza qué dijo el entrevistado respecto a cada pregunta de la plantilla. Si no respondió, escribe "No especificado en el audio".

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

            if (!gptRes.ok) throw new Error('GPT Error');
            const gptData = await gptRes.json();
            const aiResponse = JSON.parse(gptData.choices[0].message.content);

            // 5. Update Database
            if (entrevista_id) {
                const { error: updateError } = await supabase
                    .from('gobernanza_entrevistas')
                    .update({
                        transcripcion: transcript,
                        resumen: aiResponse.resumen,
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
