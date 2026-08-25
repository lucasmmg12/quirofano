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

        if (action === 'transcribe_and_analyze') {
            const { entrevista_id, plantilla_id, audio_path } = payload;
            
            // 1. Download audio from Supabase Storage
            const { data: audioData, error: downloadError } = await supabase.storage
                .from('gobernanza_audios')
                .download(audio_path);

            if (downloadError) throw new Error(`Error downloading audio: ${downloadError.message}`);

            // 2. Transcribe with Whisper
            const formData = new FormData();
            formData.append('file', new File([audioData], 'audio.webm', { type: 'audio/webm' }));
            formData.append('model', 'whisper-1');
            formData.append('language', 'es');

            const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                },
                body: formData
            });

            if (!whisperRes.ok) {
                const errText = await whisperRes.text();
                throw new Error(`Whisper Error: ${errText}`);
            }

            const whisperData = await whisperRes.json();
            const transcript = whisperData.text;

            // 3. Get Plantilla Questions
            const { data: plantilla } = await supabase
                .from('gobernanza_plantillas')
                .select('preguntas')
                .eq('id', plantilla_id)
                .single();

            const customQuestions = plantilla?.preguntas || [];

            // 4. Analyze with GPT-4o-mini
            const systemPrompt = `
Eres un asistente experto en auditoría y gobernanza de datos para el Sanatorio Argentino.
Te proveeré la transcripción literal de una entrevista y la lista de preguntas que se debían responder.
Tu tarea es:
1. Extraer las respuestas específicas que dio el usuario para cada una de las preguntas de la plantilla, basándote SOLO en la transcripción.
2. Si una pregunta no fue respondida, indícalo claramente (ej: "No especificado en el audio").
3. Redactar un 'resumen' gerencial (1 párrafo) de los hallazgos principales.

Responde estrictamente en este formato JSON:
{
  "resumen": "Resumen general...",
  "respuestas": [
    { "pregunta": "Pregunta 1", "respuesta": "Lo que dijo el usuario..." },
    { "pregunta": "Pregunta 2", "respuesta": "Lo que dijo..." }
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
                        { role: 'user', content: `PREGUNTAS:\n${JSON.stringify(customQuestions)}\n\nTRANSCRIPCIÓN:\n"${transcript}"` }
                    ],
                    response_format: { type: 'json_object' },
                    temperature: 0.2
                })
            });

            if (!gptRes.ok) throw new Error('GPT Error');
            const gptData = await gptRes.json();
            const aiResponse = JSON.parse(gptData.choices[0].message.content);

            // 5. Update Database
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
