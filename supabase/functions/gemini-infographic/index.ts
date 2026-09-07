import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

async function getVertexAccessToken(credentialsJsonStr: string) {
  const credentials = JSON.parse(credentialsJsonStr)
  
  const privateKeyEnv = credentials.private_key.replace(/\\n/g, '\n')
  const privateKey = await jose.importPKCS8(privateKeyEnv, 'RS256')

  const jwt = await new jose.SignJWT({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: credentials.token_uri,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)

  const response = await fetch(credentials.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Error obteniendo Google Access Token: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  return {
    accessToken: data.access_token,
    projectId: credentials.project_id
  }
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
      
      // Convert Uint8Array to base64 safely
      let binary = ''
      const len = uint8Array.byteLength
      for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(uint8Array[i])
      }
      imageBase64 = btoa(binary)

    } else if (engine === 'google') {
      const credsJson = Deno.env.get('VERTEX_AI_CREDENTIALS')
      if (!credsJson) throw new Error('VERTEX_AI_CREDENTIALS no configurada.')

      const { accessToken, projectId } = await getVertexAccessToken(credsJson)
      const location = "us-central1"
      
      // Imagen 3 on Vertex AI Endpoint
      const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/imagen-3.0-generate-001:predict`

      const payload = {
        instances: [ { prompt: prompt } ],
        parameters: {
          sampleCount: 1,
          aspectRatio: "3:4",
          outputOptions: { mimeType: "image/jpeg" }
        }
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Error de Vertex AI: ${response.status} - ${errText}`)
      }

      const data = await response.json()
      if (!data.predictions || data.predictions.length === 0) {
        throw new Error('La API de Imagen 3 no devolvió ninguna predicción.')
      }

      imageBase64 = data.predictions[0].bytesBase64Encoded
      
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
