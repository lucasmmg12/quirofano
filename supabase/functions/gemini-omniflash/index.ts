import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { indicators, exportType } = await req.json()
    const apiKey = Deno.env.get('GEMINI_API_KEY')

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY no configurada en las variables de entorno de Supabase.')
    }

    if (!indicators || !Array.isArray(indicators) || indicators.length === 0) {
      throw new Error('No se enviaron indicadores activos para exportar.')
    }

    if (!['conceptual_map', 'speech_script', 'presentation'].includes(exportType)) {
      throw new Error('Tipo de exportación inválido.')
    }

    // Preparar el contexto de datos (JSON en string)
    const dataContext = JSON.stringify(indicators, null, 2);

    let systemInstruction = "";
    if (exportType === 'conceptual_map') {
        systemInstruction = "Eres un experto en estructuración de información. Tu objetivo es generar UNICAMENTE código Mermaid JS (diagrama de flujo o grafo conceptual) que represente las relaciones, métricas y conceptos clave de los datos proporcionados. No devuelvas NADA MÁS que el bloque de código Mermaid empezando por 'graph TD' o similar. No uses comillas tipográficas dentro de los nodos de mermaid.";
    } else if (exportType === 'speech_script') {
        systemInstruction = "Eres un orador experto y consultor de salud. Escribe un guión de discurso persuasivo, elocuente y formal en formato Markdown basado en los datos proporcionados. Dirígete a la junta directiva del sanatorio. Destaca los hallazgos críticos. Usa encabezados, viñetas y texto en negrita. Mantén un tono profesional e institucional.";
    } else if (exportType === 'presentation') {
        systemInstruction = "Eres un analista de datos diseñando una presentación ejecutiva. Genera un esquema estructurado diapositiva por diapositiva en formato Markdown. Para cada diapositiva indica: Título, Puntos Clave, y Datos de soporte. Hazlo profesional y listo para ser trasladado a PowerPoint.";
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`
    
    const payload = {
      system_instruction: {
        parts: { text: systemInstruction }
      },
      contents: [
        {
          role: "user",
          parts: [
            { text: `Aquí están los datos del dashboard:\n${dataContext}` }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.3
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Error de Google AI Studio: ${response.status} - ${errText}`)
    }

    const data = await response.json()
    
    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('La API de Gemini no devolvió contenido.')
    }

    let textContent = data.candidates[0].content.parts[0].text;
    
    // Si es mermaid, limpiar backticks
    if (exportType === 'conceptual_map') {
        textContent = textContent.replace(/```mermaid\n/g, '').replace(/```/g, '').trim();
    }

    return new Response(
      JSON.stringify({ success: true, textContent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
