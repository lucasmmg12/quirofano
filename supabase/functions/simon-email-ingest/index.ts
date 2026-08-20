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

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Función principal (Sondeo de Emails y Procesamiento RAG vía Gmail API)
 */
serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    try {
        console.log("Iniciando ingestión de correos desde Gmail (Simon IA)...")
        
        const token = await getGoogleAccessToken()
        
        // 1. Cargar historial de correos procesados
        let processedIds = []
        try {
            const { data: fileData, error: dlError } = await supabase.storage.from('simon_documents').download('_system/processed_emails.json')
            if (!dlError && fileData) {
                const text = await fileData.text()
                processedIds = JSON.parse(text)
            }
        } catch (e) {
            console.error('Error leyendo historial de procesados', e)
        }

        // 2. Buscar últimos correos en la bandeja (Filtrados por remitente)
        const query = `from:lucasmmarinero@gmail.com OR from:malbarracin@sanatorioargentino.com.ar`
        const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/${TARGET_MAILBOX}/messages?q=${encodeURIComponent(query)}&maxResults=10`
        
        const searchResp = await fetch(searchUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        })

        if (!searchResp.ok) {
            const err = await searchResp.text()
            throw new Error(`Error buscando correos en Gmail: ${err}`)
        }

        const searchData = await searchResp.json()
        let messages = searchData.messages || []
        
        // Filtrar los que ya procesamos
        messages = messages.filter(m => !processedIds.includes(m.id))

        console.log(`Se encontraron ${messages.length} correos nuevos.`)

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

            // Procesar adjuntos (attachments)
            let attachmentNotes = ''
            const ragApiUrl = Deno.env.get('RAG_API_URL')
            
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
                                attachmentNotes += `\n⚠️ [ERROR DE ALMACENAMIENTO]: No se pudo guardar ${fileName} en Supabase.\n`
                            } else {
                                console.log(`Adjunto subido a Supabase: ${fileName}`)
                                
                                // Intentar vectorizar en Simon IA
                                if (!ragApiUrl) {
                                    attachmentNotes += `\n⚠️ [ATENCIÓN]: El archivo '${fileName}' se guardó, pero NO fue vectorizado. Falta configurar el secreto RAG_API_URL.\n`
                                } else {
                                    try {
                                        const formData = new FormData()
                                        const blob = new Blob([bytes.buffer], { type: part.mimeType })
                                        formData.append('file', blob, fileName)
                                        formData.append('folder', 'IngestaAutomatica')
                                        formData.append('tag', 'email-attachment')

                                        const ragResp = await fetch(`${ragApiUrl}/upload`, {
                                            method: 'POST',
                                            body: formData
                                        })

                                        if (ragResp.ok) {
                                            attachmentNotes += `\n✅ [ADJUNTO VECTORIZADO]: '${fileName}' fue ingresado exitosamente a Simon IA.\n`
                                        } else {
                                            const errText = await ragResp.text()
                                            attachmentNotes += `\n❌ [ERROR DE VECTORIZACIÓN]: Falló al enviar '${fileName}' a Simon IA. Detalle: ${errText}\n`
                                        }
                                    } catch (ragErr) {
                                        attachmentNotes += `\n❌ [ERROR DE CONEXIÓN]: No se pudo contactar al motor de Simon IA para vectorizar '${fileName}'. Detalle: ${ragErr.message}\n`
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Insertar como Regla en el RAG API (estado pending para validación embebido en el texto)
            const baseText = cleanText || '(Correo solo con adjuntos)'
            const finalRuleText = `[ESTADO: pendiente]\n[AUTOR: Ingestión Automática (Melissa)]\n${baseText}${attachmentNotes ? '\n\n--- Reporte de Adjuntos ---\n' + attachmentNotes : ''}`
            
            if (ragApiUrl && finalRuleText.length > 10) {
                try {
                    const ruleResp = await fetch(`${ragApiUrl}/rules`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            text: finalRuleText,
                            category: 'general'
                        })
                    })
                    if (!ruleResp.ok) {
                        console.error('Error insertando regla en RAG API:', await ruleResp.text())
                    }
                } catch (e) {
                    console.error('Excepción al insertar regla en RAG API:', e)
                }
            }

            // Actualizar historial de procesados
            processedIds.push(msgId)
            processedResults.push({ id: msgId, subject, success: true })
        }

        // Guardar historial actualizado si procesamos algo
        if (processedResults.length > 0) {
            try {
                // Keep only last 500 ids to avoid huge files
                if (processedIds.length > 500) {
                    processedIds = processedIds.slice(processedIds.length - 500)
                }
                const blob = new Blob([JSON.stringify(processedIds)], { type: 'application/json' })
                await supabase.storage.from('simon_documents').upload('_system/processed_emails.json', blob, { upsert: true })
            } catch (e) {
                console.error('Error guardando historial', e)
            }
        }

        return new Response(JSON.stringify({
            success: true,
            message: `Ingestión completada. ${messages.length} mensajes revisados.`,
            processed: processedResults.length,
            details: processedResults
        }), { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
        })

    } catch (error: any) {
        console.error("Error en ingestión de correos:", error)
        return new Response(JSON.stringify({ error: error.message }), { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500 
        })
    }
})
