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
    const { indicators, engine = 'google', theme = 'institutional_blue' } = await req.json()

    if (!indicators || !Array.isArray(indicators) || indicators.length === 0) {
      throw new Error('No se enviaron indicadores activos para generar la infografía.')
    }

    const topics = indicators.map((ind: any) => `${ind.label}: ${ind.value || ''}`).join(', ')
    
    let colorPalette = "white backgrounds, subtle soft shadows, and deep institutional blue accents";
    if (theme === 'surgical_green') colorPalette = "white backgrounds, subtle soft shadows, and vibrant surgical green and teal accents";
    if (theme === 'minimalist') colorPalette = "pure white backgrounds, high contrast black typography, and sleek minimalist silver accents";

    const prompt = `A highly professional, sleek, and modern medical infographic for 'Sanatorio Argentino'. 
Visualizing the following exact healthcare data: ${topics}. 
The design MUST contain the exact numbers and text labels.
Aesthetic: clean, clinical, ${colorPalette}.
It should feature beautiful abstract charts, modern dashboards, and health icons. 
Ultra high resolution, 8k, data visualization art, no distorted text.`

    let imageBase64 = ""

    if (engine === 'openai') {
      throw new Error('DALL-E 3 (OpenAI) ha sido deshabilitado temporalmente.');
    } else if (engine === 'google') {
      const apiKey = Deno.env.get('GEMINI_API_KEY')
      if (!apiKey) throw new Error('GEMINI_API_KEY no configurada.')

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${apiKey}`

      const payload = {
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt }
            ]
          }
        ]
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
        throw new Error('La API de Gemini no devolvió ninguna predicción.')
      }

      const inlineData = data.candidates[0]?.content?.parts?.[0]?.inlineData
      if (!inlineData || !inlineData.data) {
        throw new Error('La respuesta de Gemini no incluyó una imagen válida.')
      }

      imageBase64 = inlineData.data
      
    } else {
      throw new Error(`Motor de IA no soportado: ${engine}`)
    }

    return new Response(
      JSON.stringify({ success: true, imageBase64, engine }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})
