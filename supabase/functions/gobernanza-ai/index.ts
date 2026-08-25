// Supabase Edge Function: gobernanza-ai
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

        if (action === 'analyze') {
            const transcript = payload.transcript;
            const customQuestions = payload.customQuestions || []; // El usuario carga las preguntas previas aquí.
            
            // System prompt dinámico basado en las preguntas del usuario
            const systemPrompt = `
Eres un experto en gobernanza de datos analizando la transcripción de una entrevista técnica.

OBJETIVOS:
1. "Resumen": Redacta un resumen ejecutivo de los puntos tratados.
2. "Diapositivas": Crea un texto formateado en Markdown estructurado para armar diapositivas de presentación.
3. "Mapa Conceptual": Crea un diagrama Mermaid.js que muestre las entidades y relaciones mencionadas.
4. "Cuestionario": El usuario ha definido las siguientes preguntas clave a evaluar durante la charla:
${customQuestions.map((q, i) => `   - Pregunta ${i + 1}: ${q}`).join('\n')}

INSTRUCCIONES PARA EL CUESTIONARIO:
- Busca en la transcripción los momentos exactos donde el entrevistador dice "Pregunta número X" o menciona explícitamente el texto de una de estas preguntas.
- Analiza lo que el entrevistado responde a continuación.
- Sintetiza y redacta la respuesta de manera profesional, extrayendo la intención y el contenido real de la charla.
- Si una pregunta no fue mencionada o respondida, márcala como null o vacía.

Debes devolver obligatoriamente un objeto JSON con la siguiente estructura exacta:
{
  "resumen": "texto del resumen",
  "diapositivas_markdown": "texto para las diapositivas",
  "mapa_conceptual_mermaid": "codigo mermaid",
  "respuestas_cuestionario": [
      { "pregunta": "texto de la pregunta 1", "respuesta": "texto interpretado por la IA o null si no se respondió" }
  ]
}
`;

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: `TRANSCRIPCIÓN DE LA ENTREVISTA:\n\n${transcript}` }
                    ],
                    response_format: { type: 'json_object' }
                })
            });

            const data = await response.json();
            const aiResponse = JSON.parse(data.choices[0].message.content);

            return new Response(JSON.stringify({ result: aiResponse }), {
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
