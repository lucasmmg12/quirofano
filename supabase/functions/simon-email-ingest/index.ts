import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

// ==========================================
// Google / Gmail API - Configuración (OAuth2)
// ==========================================
const GCP_CLIENT_ID = Deno.env.get('GCP_CLIENT_ID')
const GCP_CLIENT_SECRET = Deno.env.get('GCP_CLIENT_SECRET')
const GCP_REFRESH_TOKEN = Deno.env.get('GCP_REFRESH_TOKEN')
const TARGET_MAILBOX = "me" 
const MELISSA_EMAIL = Deno.env.get('MELISSA_EMAIL') || 'melissa@example.com'

// ==========================================
// Supabase Configuración
// ==========================================
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

/**
 * Obtiene el token de acceso de Google usando el Refresh Token de OAuth2
 */
async function getGoogleAccessToken() {
    if (!GCP_CLIENT_ID || !GCP_CLIENT_SECRET || !GCP_REFRESH_TOKEN) {
        throw new Error("Faltan credenciales de Google OAuth (GCP_CLIENT_ID, GCP_CLIENT_SECRET, GCP_REFRESH_TOKEN)")
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: GCP_CLIENT_ID,
            client_secret: GCP_CLIENT_SECRET,
            refresh_token: GCP_REFRESH_TOKEN,
            grant_type: "refresh_token"
        }).toString()
    })

    if (!response.ok) {
        const err = await response.text()
        throw new Error(`Error obteniendo token de Google via Refresh Token: ${err}`)
    }

    const data = await response.json()
    return data.access_token
}

/**
 * Función principal (Sondeo de Emails y Procesamiento RAG vía Gmail API)
 */
serve(async (req) => {
    // Para invocaciones vía pg_cron o webhooks externos seguros
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
    }

    const authHeader = req.headers.get('Authorization')
    if (authHeader !== `Bearer ${Deno.env.get('CRON_SECRET_KEY')}`) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    try {
        console.log("Iniciando ingestión de correos desde Gmail (Simon IA)...")
        
        const token = await getGoogleAccessToken()
        
        // 1. Buscar correos NO LEÍDOS de Melissa
        const query = `is:unread from:${MELISSA_EMAIL}`
        const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/${TARGET_MAILBOX}/messages?q=${encodeURIComponent(query)}`
        
        const searchResp = await fetch(searchUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        })

        if (!searchResp.ok) {
            const err = await searchResp.text()
            throw new Error(`Error buscando correos en Gmail: ${err}`)
        }

        const searchData = await searchResp.json()
        const messages = searchData.messages || []

        console.log(`Se encontraron ${messages.length} correos nuevos de Melissa.`)

        const processedResults = []

        // 2. Procesar cada correo
        for (const msgMeta of messages) {
            const msgId = msgMeta.id
            
            // Obtener el correo completo
            const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/${TARGET_MAILBOX}/messages/${msgId}`
            const msgResp = await fetch(msgUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const msg = await msgResp.json()

            // Extraer asunto (Subject)
            const subjectHeader = msg.payload?.headers?.find((h: any) => h.name.toLowerCase() === 'subject')
            const subject = subjectHeader ? subjectHeader.value : 'Sin Asunto'
            
            console.log(`Procesando mensaje ID: ${msgId} | Asunto: ${subject}`)

            // Extraer el texto (body)
            let rawBody = ''
            const parts = msg.payload?.parts || [msg.payload]
            
            for (const part of parts) {
                if (part.mimeType === 'text/plain' && part.body?.data) {
                    rawBody += atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'))
                }
            }
            
            const cleanText = rawBody.replace(/<[^>]*>?/gm, '').trim()

            // Insertar como Regla en Supabase (estado pending para validación)
            if (cleanText.length > 10) {
                const { error: ruleError } = await supabase
                    .from('rag_rules')
                    .insert({
                        text: cleanText,
                        title: `Regla Automática: ${subject}`,
                        is_active: false,
                        status: 'pending_validation',
                        category: 'general',
                        author: 'Ingestión Automática (Melissa)',
                        original_text: cleanText
                    })
                
                if (ruleError) console.error("Error insertando regla:", ruleError)
            }

            // Procesar adjuntos (attachments)
            for (const part of (msg.payload?.parts || [])) {
                if (part.filename && part.body?.attachmentId) {
                    const fileName = part.filename
                    const attId = part.body.attachmentId
                    
                    const attUrl = `https://gmail.googleapis.com/gmail/v1/users/${TARGET_MAILBOX}/messages/${msgId}/attachments/${attId}`
                    const attResp = await fetch(attUrl, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    })
                    
                    if (attResp.ok) {
                        const attData = await attResp.json()
                        const contentBase64url = attData.data
                        if (contentBase64url) {
                            const binaryString = atob(contentBase64url.replace(/-/g, '+').replace(/_/g, '/'))
                            const bytes = new Uint8Array(binaryString.length)
                            for (let i = 0; i < binaryString.length; i++) {
                                bytes[i] = binaryString.charCodeAt(i)
                            }
                            
                            const filePath = `IngestaAutomatica/${Date.now()}_${fileName}`
                            const { error: storageError } = await supabase
                                .storage
                                .from('simon_documents')
                                .upload(filePath, bytes.buffer, { contentType: part.mimeType })
                                
                            if (storageError) {
                                console.error(`Error subiendo adjunto ${fileName}:`, storageError)
                            } else {
                                console.log(`Adjunto subido: ${fileName}`)
                            }
                        }
                    }
                }
            }

            // Marcar correo como Leído (remover etiqueta UNREAD)
            const modifyUrl = `https://gmail.googleapis.com/gmail/v1/users/${TARGET_MAILBOX}/messages/${msgId}/modify`
            await fetch(modifyUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    removeLabelIds: ['UNREAD']
                })
            })

            processedResults.push({ id: msgId, subject, success: true })
        }

        return new Response(JSON.stringify({ success: true, processed: processedResults.length, details: processedResults }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200
        })

    } catch (error) {
        console.error("Error en Edge Function simon-email-ingest:", error)
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            headers: { 'Content-Type': 'application/json' },
            status: 500
        })
    }
})
