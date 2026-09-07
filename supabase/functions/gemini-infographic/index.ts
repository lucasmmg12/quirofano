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
    const { indicators, engine = 'openai' } = await req.json()

    if (!indicators || !Array.isArray(indicators) || indicators.length === 0) {
      throw new Error('No se enviaron indicadores activos para generar la infografía.')
    }

    const topics = indicators.map((ind: any) => ind.label).join(', ')
    const prompt = `A highly professional, sleek, and modern medical infographic visualizing healthcare data related to: ${topics}. The design should have a clean, clinical aesthetic with white backgrounds, subtle soft shadows, and deep institutional blue accents. It should feature beautiful abstract charts, modern dashboards, and health icons. Ultra high resolution, 8k, data visualization art, no distorted text.`

    let imageBase64 = ""

    if (engine === 'openai') {
      const apiKey = Deno.env.get('OPENAI_API_KEY')
      if (!apiKey) throw new Error('OPENAI_API_KEY no configurada.')

      const response = await fetch(`https://api.openai.com/v1/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt: prompt,
          n: 1,
          size: "1024x1024"
        })
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Error de OpenAI: ${response.status} - ${errText}`)
      }

      const data = await response.json()
      if (!data.data || data.data.length === 0) throw new Error('La API de DALL-E no devolvió ninguna imagen.')
      
      const imageUrl = data.data[0].url
      if (!imageUrl) throw new Error('OpenAI no devolvió una URL válida.')

      const imgResponse = await fetch(imageUrl)
      const imgBlob = await imgResponse.blob()
      const arrayBuffer = await imgBlob.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      
      let binary = ''
      const len = uint8Array.byteLength
      for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(uint8Array[i])
      }
      imageBase64 = btoa(binary)

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
