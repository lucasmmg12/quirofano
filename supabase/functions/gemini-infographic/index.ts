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
    const apiKey = Deno.env.get('OPENAI_API_KEY')

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY no configurada en las variables de entorno de Supabase.')
    }

    if (!indicators || !Array.isArray(indicators) || indicators.length === 0) {
      throw new Error('No se enviaron indicadores activos para generar la infografía.')
    }

    // Build the visual prompt for DALL-E 3 based on the indicators
    const topics = indicators.map((ind: any) => ind.label).join(', ')
    const prompt = `A highly professional, sleek, and modern medical infographic visualizing healthcare data related to: ${topics}. The design should have a clean, clinical aesthetic with white backgrounds, subtle soft shadows, and deep institutional blue accents. It should feature beautiful abstract charts, modern dashboards, and health icons. Ultra high resolution, 8k, data visualization art, no distorted text.`

    const url = `https://api.openai.com/v1/images/generations`
    
    const payload = {
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json"
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Error de OpenAI: ${response.status} - ${errText}`)
    }

    const data = await response.json()
    
    if (!data.data || data.data.length === 0) {
      throw new Error('La API de DALL-E no devolvió ninguna imagen.')
    }

    const imageBase64 = data.data[0].b64_json
    
    return new Response(
      JSON.stringify({ success: true, imageBase64 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})
