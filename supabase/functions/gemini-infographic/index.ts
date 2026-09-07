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
    const { indicators } = await req.json()
    const apiKey = Deno.env.get('GEMINI_API_KEY')

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY no configurada en las variables de entorno de Supabase.')
    }

    if (!indicators || !Array.isArray(indicators) || indicators.length === 0) {
      throw new Error('No se enviaron indicadores activos para generar la infografía.')
    }

    // Build the visual prompt for Imagen 3 based on the indicators
    const topics = indicators.map(ind => ind.label).join(', ')
    const prompt = `A highly professional, sleek, and modern medical infographic visualizing healthcare data related to: ${topics}. The design should have a clean, clinical aesthetic with white backgrounds, subtle soft shadows, and deep institutional blue accents. It should feature beautiful abstract charts, modern dashboards, and health icons. Ultra high resolution, 8k, data visualization art, no distorted text.`

    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${apiKey}`
    
    const payload = {
      instances: [
        {
          prompt: prompt
        }
      ],
      parameters: {
        sampleCount: 1,
        aspectRatio: "3:4",
        outputOptions: {
          mimeType: "image/jpeg"
        }
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
    
    if (!data.predictions || data.predictions.length === 0) {
      throw new Error('La API de Imagen no devolvió ninguna predicción.')
    }

    const imageBase64 = data.predictions[0].bytesBase64Encoded
    
    return new Response(
      JSON.stringify({ success: true, imageBase64 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
