// Supabase Edge Function: whatsapp-webhook
// Recibe eventos de BuilderBot y guarda mensajes en whatsapp_messages
// PERSISTENCIA DE MEDIA: Descarga archivos de URLs temporales y los sube a Supabase Storage
// DUAL LINE: Soporta múltiples líneas WhatsApp via query param ?line=line_a|line_b|line_c
// URLs para BuilderBot:
//   Línea A (Business):  https://hakysnqiryimxbwdslwe.supabase.co/functions/v1/whatsapp-webhook?line=line_a
//   Línea B (Messenger): https://hakysnqiryimxbwdslwe.supabase.co/functions/v1/whatsapp-webhook?line=line_b
//   Línea C:             https://hakysnqiryimxbwdslwe.supabase.co/functions/v1/whatsapp-webhook?line=line_c

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Bucket de Supabase Storage para media persistente
const STORAGE_BUCKET = 'whatsapp-media';

// =============================================
// RETRY HELPER: Protección contra PGRST002 (schema cache unavailable)
// Reintenta operaciones de DB con backoff exponencial cuando PostgREST
// no puede conectar a la base de datos (saturación de pool o restart)
// =============================================
async function supabaseRetry<T>(
    operation: () => Promise<{ data: T | null; error: any }>,
    label: string = 'operation',
    maxRetries: number = 3
): Promise<{ data: T | null; error: any }> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const result = await operation();
        if (!result.error) return result;

        const isRetryable = result.error.code === 'PGRST002' ||
            (result.error.message && result.error.message.includes('schema cache'));

        if (isRetryable && attempt < maxRetries) {
            const delayMs = attempt * 1500; // 1.5s, 3s, 4.5s
            console.warn(`[webhook-retry] ⚠️ ${label}: PGRST002 en intento ${attempt}/${maxRetries}. Reintentando en ${delayMs}ms...`);
            await new Promise(r => setTimeout(r, delayMs));
            continue;
        }

        // Error no-retriable o último intento
        if (isRetryable) {
            console.error(`[webhook-retry] ❌ ${label}: PGRST002 persistió tras ${maxRetries} intentos.`);
        }
        return result;
    }
    return { data: null, error: { message: `${label}: max retries exceeded`, code: 'RETRY_EXHAUSTED' } };
}

// =============================================
// VALIDACIÓN Y EXTRACCIÓN INFALIBLE DE DNI ARGENTINO
// Evita confusiones con fechas de nacimiento (DD/MM/AAAA) o números telefónicos
// =============================================
function isValidArgentineDni(str: string | null | undefined): boolean {
    if (!str) return false;
    const clean = String(str).replace(/\D/g, '');
    // Un DNI argentino tiene entre 7 y 8 dígitos y NUNCA empieza con 0
    if (!/^[1-9]\d{6,7}$/.test(clean)) return false;
    const num = parseInt(clean, 10);
    return num >= 1000000 && num <= 65000000;
}

function extractDniFromText(text: string | null | undefined): string | null {
    if (!text) return null;
    const clean = text.trim();
    
    // Si el mensaje completo es únicamente un número (con o sin puntos/espacios)
    const strippedMsg = clean.replace(/[\s.-]/g, '');
    if (/^\d{7,8}$/.test(strippedMsg) && isValidArgentineDni(strippedMsg)) {
        return strippedMsg;
    }

    // Remover fechas de nacimiento con barras o guiones para que sus dígitos (ej: 04/07/2002 -> 04072002) nunca se confundan con un DNI
    const textWithoutDates = clean.replace(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g, ' ');

    // 1. Buscar si hay una etiqueta explícita de DNI (ej: "DNI: 44316298", "dni 44.316.298", "documento: 44316298")
    const explicitTagMatch = textWithoutDates.match(/\b(?:dni|documento|doc|nro)\s*[:.\s#]*([1-9]\d{1,2}\.?\d{3}\.?\d{3}|[1-9]\d{6,7})\b/i);
    if (explicitTagMatch && explicitTagMatch[1]) {
        const cleanTagDni = explicitTagMatch[1].replace(/\D/g, '');
        if (isValidArgentineDni(cleanTagDni)) return cleanTagDni;
    }

    // 2. Buscar número de 7 u 8 dígitos que empiece con 1-9 en el texto libre sin fechas
    const normalized = textWithoutDates.replace(/\./g, '');
    const candidateMatch = normalized.match(/\b[1-9]\d{6,7}\b/);
    if (candidateMatch && isValidArgentineDni(candidateMatch[0])) {
        return candidateMatch[0];
    }

    return null;
}

// =============================================
// DETECCIÓN INFALIBLE DE MENÚ / VOLVER ATRÁS (TOLERANTE A TILDES Y RÁFAGAS)
// =============================================
export function isNavigationBackOrMenu(text: string | null | undefined): boolean {
    if (!text) return false;
    const clean = text.toLowerCase().trim();
    const norm = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return (
        /\b(menu|atras|atrs|volver|regresar|inicio|reiniciar|comenzar|empezar)\b/i.test(norm) ||
        /^(volver|atras|atrs|regresar|menu|inicio|reiniciar|cancelar|opciones|salir)[!.\s]*$/im.test(norm) ||
        /\b(?:volver|regresar|ir)\s+(?:al\s+|a\s+)?(?:menu|inicio|atras)\b/i.test(norm) ||
        clean.includes('menú') || clean.includes('menu') || clean.includes('atrás') || clean.includes('atras') || clean.includes('volver')
    );
}

Deno.serve(async (req) => {
    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region, prefer, cache-control',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
    };

    if (req.method === 'OPTIONS') {
        return new Response('ok', { status: 200, headers: corsHeaders });
    }

    // Solo aceptar POST
    if (req.method !== 'POST') {
        return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    try {
        // Detectar línea desde query param ?line=line_a|line_b o payload
        const url = new URL(req.url);
        let lineId = url.searchParams.get('line') || null;

        const payload = await req.json();
        const { eventName, data } = payload;

        // Auto-resolver lineId por projectId si no vino en el query param del URL
        if (!lineId) {
            const incomingProjectId = payload.projectId || data?.projectId;
            if (incomingProjectId === 'ddaeae5f-7204-4205-bc37-31236f277539' || incomingProjectId === 'c3fd918b-b736-40dc-a841-cbb73d3b2a8d') lineId = 'contact_center';
            else if (incomingProjectId === '2bf4fc78-5564-4b9c-9d7b-26e328db06c7') lineId = 'line_b';
            else if (incomingProjectId === 'f6c7b99b-88ec-46c4-bcd2-6a3457a36ca3') lineId = 'line_c';
            else if (incomingProjectId === 'c42aa354-f1a3-44a6-b95b-5ccb24562254') lineId = 'line_a';
            else if (incomingProjectId === 'e03a7adc-28de-4be3-99b9-fee02de099e0') lineId = 'line_recepciones';
            else {
                // Fallback por defecto a contact_center para asegurar que el chatbot nunca quede inactivo por falta de parámetro
                lineId = 'contact_center';
            }
        }

        // Log completo del payload para debug (ver estructura de media)
        console.log(`[webhook] Evento: ${eventName} | Line: ${lineId}`, JSON.stringify(payload, null, 2));

        // =============================================
        // MANEJO DE EVENTOS DE STATUS (conexión/desconexión del bot)
        // Actualiza whatsapp_lines.is_active para reflejar estado en tiempo real
        // =============================================
        if (eventName === 'status.ready' || eventName === 'status.disconnect') {
            const isOnline = eventName === 'status.ready';
            const reason = data?.reason || null;

            console.log(`[webhook] Status event: ${eventName} | line: ${lineId} | online: ${isOnline} | reason: ${reason}`);

            if (lineId) {
                const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
                const { error: statusError } = await supabase
                    .from('whatsapp_lines')
                    .update({
                        is_active: isOnline,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', lineId);

                if (statusError) {
                    console.error(`[webhook] Error actualizando status de línea ${lineId}:`, statusError);
                } else {
                    console.log(`[webhook] ✅ Línea ${lineId} marcada como ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
                }
            }

            return new Response(
                JSON.stringify({ ok: true, event: eventName, lineId, isOnline, reason }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // =============================================
        // SIMULADOR DE CHATBOT / PACIENTE (Testing Sandbox desde Contact Center Config)
        // Permite probar respuestas, prompts compilados y los dos caminos de admisión
        // sin enviar mensajes reales por WhatsApp
        // =============================================
        if (payload.action === 'simulate' || eventName === 'bot.simulate') {
            const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
            const userMessage = payload.message || 'Hola';
            const patientData = payload.patient || {};
            const overrideConfig = payload.overrideConfig || null;
            const history = payload.history || [];

            // 1. Resolver configuración dinámica (o usar override si se está probando borrador)
            const dynamicConfig = await getDynamicChatbotConfig(supabase);
            const activePrompt = (overrideConfig?.systemPrompt && overrideConfig.systemPrompt.trim().length > 10)
                ? overrideConfig.systemPrompt
                : (dynamicConfig.systemPrompt || '');
            const activeModel = overrideConfig?.model || dynamicConfig.model || 'gpt-4o';
            const activeTemp = overrideConfig?.temperature !== undefined ? parseFloat(overrideConfig.temperature) : dynamicConfig.temperature;
            const activeBotName = overrideConfig?.botName || dynamicConfig.botName || 'Dora';

            // 2. Extraer DNI candidato del mensaje actual, historial o del preset del paciente
            const userDniMatch = extractDniFromText(userMessage) || 
                (Array.isArray(history) && [...history].reverse().map((h: any) => h.sender === 'user' ? extractDniFromText(h.text) : null).find(Boolean));
            const targetDni = userDniMatch || (isValidArgentineDni(patientData.dni) ? String(patientData.dni).replace(/\D/g, '') : null);

            // 3. Verificar si el DNI existe en la base hospital_pacientes (SALUS)
            let isExistingInDb = false;
            let dbRecord: any = null;
            if (targetDni) {
                const { data: pFound } = await supabase
                    .from('hospital_pacientes')
                    .select('id_paciente, nombre, dni, coseguro, fecha_nacimiento, edad, nhc, centro, telefono')
                    .eq('dni', targetDni)
                    .maybeSingle();
                if (pFound) {
                    isExistingInDb = true;
                    dbRecord = pFound;
                }
            }

            // Consultar turnos activos si el paciente existe en SALUS
            let turnosStr = '';
            if (targetDni) {
                const { data: activeTurnos } = await supabase
                    .from('hospital_turnos')
                    .select('fecha, hora, medico, especialidad, sede, obra_social')
                    .eq('dni', targetDni)
                    .gte('fecha', new Date().toISOString().split('T')[0])
                    .order('fecha', { ascending: true })
                    .limit(3);
                
                if (activeTurnos && activeTurnos.length > 0) {
                    turnosStr = '\nTURNOS PRÓXIMOS AGENDADOS DEL PACIENTE EN EL SANATORIO:\n' +
                        activeTurnos.map((t: any, idx: number) => 
                            `${idx + 1}. Fecha: ${t.fecha} | Hora: ${t.hora} hs | Profesional: ${t.medico} | Especialidad: ${t.especialidad} | Cobertura: ${t.obra_social || 'A confirmar'}`
                        ).join('\n');
                }
            }

            // Compilar variables del paciente
            const pName = dbRecord?.nombre || patientData.nombre || 'Paciente';
            const pDni = targetDni || (patientData.esRegistrado ? '28475561' : 'Sin DNI');
            const pOs = dbRecord?.coseguro || patientData.obraSocial || patientData.cobertura || (patientData.esRegistrado ? 'OSP (Obra Social Provincia) - Plan Tradicional' : 'A confirmar');
            const pTurnos = turnosStr || patientData.turnos || (isExistingInDb ? 'Sin turnos próximos agendados.' : 'No registra turnos previos.');

            let compiledPrompt = activePrompt
                .replace(/\{nombre\}/g, pName)
                .replace(/\{dni\}/g, pDni)
                .replace(/\{cobertura\}/g, pOs)
                .replace(/\{turnos\}/g, pTurnos)
                .replace(/\{bot_name\}|\{nombre_bot\}|\{asistente\}/gi, activeBotName);

            // Inyectar el estado real de SALUS en las directivas del modelo para que la IA responda exactamente con los datos de SALUS
            if (targetDni && isExistingInDb && dbRecord) {
                compiledPrompt += `\n\n[ESTADO SALUS EN TIEMPO REAL - CAMINO 1]:
El DNI ${targetDni} CORRESPONDE A UN PACIENTE YA REGISTRADO EN SANATORIO ARGENTINO:
- Nombre: ${dbRecord.nombre}
- DNI: ${dbRecord.dni}
- Obra Social / Prepaga registrada: ${dbRecord.coseguro || 'A confirmar'}
${pTurnos}

DIRECTIVAS CLÍNICAS OBLIGATORIAS:
1. CONFIRMA CON CLARIDAD QUE ENCONTRASTE LA FICHA DE "${dbRecord.nombre}" (DNI ${dbRecord.dni}) EN SANATORIO ARGENTINO.
2. NO LE PIDAS LOS 5 DATOS DE ALTA/ADMISIÓN (el paciente ya tiene historia clínica en Sanatorio Argentino).
3. Consúltale para qué especialidad médica o profesional solicita el turno y qué preferencia de días y horarios tiene (mañana o tarde), o confirma si mantiene la cobertura ${dbRecord.coseguro || 'registrada'}.
4. Si el paciente ya menciona profesional o especialidad, sugiere 2 opciones de turnos en días hábiles próximos como disponibilidad tentativa del sanatorio y avisa que una asesora confirmará la reserva formal.`;
            } else if (targetDni && !isExistingInDb) {
                compiledPrompt += `\n\n[ESTADO SALUS EN TIEMPO REAL - CAMINO 2]:
El DNI ${targetDni} NO FIGURA REGISTRADO EN NUESTRA BASE DE PACIENTES (PACIENTE NUEVO).
DIRECTIVAS CLÍNICAS OBLIGATORIAS:
1. Informa amablemente que con el DNI ${targetDni} no figura ficha previa en Sanatorio Argentino.
2. Solicita en un solo mensaje los datos obligatorios de admisión para abrir su ficha digital: Nombre y Apellido completo, Fecha de Nacimiento (DD/MM/AAAA) o edad, Obra Social/Prepaga y Plan (o Particular), Departamento de San Juan donde reside, y la Especialidad médica o profesional requerido.`;
            } else {
                if (!compiledPrompt.includes('{nombre}') && !compiledPrompt.includes(pName)) {
                    compiledPrompt += `\n\nDATOS DEL PACIENTE ACTUAL:\n- Nombre: ${pName}\n- DNI: ${pDni}\n- Cobertura: ${pOs}\n${pTurnos}`;
                }
            }

            // Asegurar formato JSON de salida si no está
            if (!compiledPrompt.includes('"replyText"') || !compiledPrompt.includes('"transferToAgent"')) {
                compiledPrompt += `\n\nDevuelve OBLIGATORIAMENTE un JSON con esta estructura exacta:\n{\n  "replyText": "Texto de la respuesta en WhatsApp...",\n  "intent": "derivacion_agente | turno | autorizacion | guardia | chequeo | informes | agradecimiento | general",\n  "transferToAgent": boolean,\n  "summary": "Resumen breve de la consulta en 1 línea para el equipo"\n}`;
            }

            // 3. Ejecutar llamada real a OpenAI
            const openAiKey = Deno.env.get('OPENAI_API_KEY');
            let aiResult = {
                replyText: '',
                intent: 'general',
                transferToAgent: false,
                summary: 'Simulación'
            };

            if (openAiKey) {
                try {
                    const isGpt5Series = activeModel.startsWith('gpt-5');
                    const isReasoningModel = activeModel.startsWith('o1') || activeModel.startsWith('o3') || activeModel.startsWith('o4');
                    const messagesPayload: any[] = [
                        { role: isReasoningModel ? 'developer' : 'system', content: compiledPrompt }
                    ];

                    if (Array.isArray(history) && history.length > 0) {
                        for (const h of history.slice(-6)) {
                            messagesPayload.push({
                                role: h.sender === 'user' ? 'user' : 'assistant',
                                content: typeof h.text === 'string' ? h.text : JSON.stringify(h.text)
                            });
                        }
                    }

                    messagesPayload.push({ role: 'user', content: userMessage });

                    const requestPayload: any = {
                        model: activeModel,
                        response_format: { type: 'json_object' },
                        messages: messagesPayload
                    };

                    if (isGpt5Series || isReasoningModel) {
                        requestPayload.max_completion_tokens = 800;
                        if (!isReasoningModel && !activeModel.includes('5.5') && !activeModel.includes('5.4')) {
                            requestPayload.temperature = activeTemp;
                        }
                    } else {
                        requestPayload.temperature = activeTemp;
                        requestPayload.max_tokens = 800;
                    }

                    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${openAiKey}`
                        },
                        body: JSON.stringify(requestPayload)
                    });

                    if (aiRes.ok) {
                        const json = await aiRes.json();
                        const rawContent = json.choices?.[0]?.message?.content || '{}';
                        const parsed = JSON.parse(rawContent);
                        aiResult = {
                            replyText: parsed.replyText || 'Hola, ¿en qué puedo ayudarte?',
                            intent: parsed.intent || 'general',
                            transferToAgent: Boolean(parsed.transferToAgent),
                            summary: parsed.summary || 'Consulta simulada'
                        };
                    } else {
                        const errText = await aiRes.text();
                        console.warn('[simulate] Error OpenAI:', errText);
                        aiResult.replyText = `(Aviso: Error conectando con OpenAI: ${errText.substring(0, 100)})`;
                    }
                } catch (e: any) {
                    console.warn('[simulate] Exception OpenAI:', e);
                    aiResult.replyText = `(Aviso: Excepción invocando OpenAI: ${e.message})`;
                }
            } else {
                aiResult.replyText = `¡Hola ${pName}! Soy ${activeBotName}, asistente virtual de Sanatorio Argentino. (Atención simulada: OpenAI API Key no detectada en backend)`;
            }

            // 4. Calcular aviso de handoff según estado de la cola
            const queueCount = await refreshQueueAndHandoffConfig(supabase);
            let handoffNotice = null;
            if (aiResult.transferToAgent || aiResult.intent === 'derivacion_agente') {
                handoffNotice = getAgentHandoffNotice(queueCount);
            }

            return new Response(
                JSON.stringify({
                    ok: true,
                    result: {
                        replyText: aiResult.replyText,
                        intent: aiResult.intent,
                        transferToAgent: aiResult.transferToAgent,
                        summary: aiResult.summary,
                        handoffNotice,
                        compiledPrompt,
                        isExistingInDb,
                        dbRecord,
                        modelUsed: activeModel,
                        temperatureUsed: activeTemp,
                        botNameUsed: activeBotName,
                        queueCount
                    }
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Solo procesar mensajes incoming
        // Los outgoing se guardan desde el frontend via saveOutgoingMessage()
        // Procesar ambos causaba mensajes duplicados
        if (eventName !== 'message.incoming') {
            return new Response(
                JSON.stringify({ ok: true, skipped: true, event: eventName }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Filtrar y descartar canales de noticias de WhatsApp (newsletters), grupos y transmisiones
        const rawFrom = String(data.from || data.key?.remoteJid || '');
        if (
            rawFrom.endsWith('@newsletter') || 
            rawFrom.includes('newsletter') || 
            rawFrom.endsWith('@g.us') || 
            rawFrom.endsWith('@broadcast') || 
            rawFrom === 'status@broadcast' ||
            data.broadcast === true ||
            rawFrom.startsWith('120363')
        ) {
            console.log(`[webhook] ⏭️ Ignorando actualización de Canal/Grupo/Newsletter (${rawFrom})`);
            return new Response(
                JSON.stringify({ ok: true, skipped: true, reason: 'channel_or_group_ignored', from: rawFrom }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Crear cliente Supabase con service_role para bypass de RLS
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Detectar si el mensaje fue enviado por NOSOTROS desde WhatsApp Web o el dispositivo conectado
        const isFromMe = Boolean(
            data?.fromMe === true ||
            data?.key?.fromMe === true ||
            payload?.fromMe === true ||
            payload?.data?.fromMe === true
        );

        // Teléfonos conocidos de las líneas institucionales del Sanatorio
        const KNOWN_LINE_PHONES = new Set([
            '5492645825637', '2645825637',
            '5492644182603', '2644182603',
            '5492644827166', '2644827166',
            '5492644809077', '2644809077',
            '5492644774612', '2644774612',
        ]);

        // Si es fromMe, es un mensaje saliente enviado por el equipo humano desde WhatsApp Web
        const direction = isFromMe ? 'outgoing' : (eventName === 'message.incoming' ? 'incoming' : 'outgoing');

        // Extraer datos según la dirección
        const rawContent = (direction === 'incoming' || isFromMe) ? (data.body || '') : (data.answer || '');

        // Resolver el teléfono del PACIENTE:
        // Cuando es fromMe, data.from o data.to es el paciente y el otro es la línea del Sanatorio.
        let targetPhoneRaw = direction === 'incoming' ? (data.from || '') : (data.to || data.from || '');
        if (isFromMe) {
            const normFrom = normalizePhone(data.from || '');
            const normTo = normalizePhone(data.to || '');
            if (KNOWN_LINE_PHONES.has(normFrom) && normTo) {
                targetPhoneRaw = normTo;
            } else if (normFrom && !KNOWN_LINE_PHONES.has(normFrom)) {
                targetPhoneRaw = normFrom;
            } else {
                targetPhoneRaw = normTo || normFrom;
            }
        }
        const phone = normalizePhone(targetPhoneRaw);

        // Resolver nombre del remitente:
        // Si es fromMe (enviado por operador desde WhatsApp Web), detectar el nombre del agente en el texto si existe
        let senderName: string | null = null;
        let extractedAgentName: string | null = null;
        if (isFromMe) {
            const matchName = String(rawContent).match(/(?:soy|habla|te saluda|comunica)\s+\*?([A-Za-zÁ-ú]+)\*?/i);
            if (matchName && matchName[1]) {
                const rawMatch = matchName[1].trim();
                if (!['de', 'el', 'la', 'un', 'una', 'sanatorio', 'asistente', 'bot'].includes(rawMatch.toLowerCase())) {
                    extractedAgentName = `${rawMatch.charAt(0).toUpperCase() + rawMatch.slice(1).toLowerCase()} (WhatsApp Web)`;
                }
            }
            senderName = extractedAgentName || 'Operador (WhatsApp Web)';
        } else {
            // Mensaje entrante de paciente: NUNCA usar "Unknown"
            const rawName = String(data.name || data.pushName || '').trim();
            senderName = (rawName && rawName.toLowerCase() !== 'unknown') ? rawName : null;
        }

        // =============================================
        // 0. DETECTAR Y REGISTRAR REACCIONES EMOJI DE WHATSAPP
        // =============================================
        const reactionMsg = data.message?.reactionMessage || data.reactionMessage || (data.type === 'reaction' ? data : null);
        if (reactionMsg && (reactionMsg.key || reactionMsg.text !== undefined)) {
            const targetKeyId = reactionMsg.key?.id;
            const emoji = reactionMsg.text || ''; // Cadena vacía = paciente quitó la reacción
            console.log(`[webhook] Reacción recibida: "${emoji}" para mensaje key: ${targetKeyId} de ${phone}`);
            if (phone) {
                try {
                    const { data: targetRows } = await supabase
                        .from('whatsapp_messages')
                        .select('id, raw_payload')
                        .eq('phone', phone)
                        .order('created_at', { ascending: false })
                        .limit(25);

                    const targetRow = targetRows?.find((r: any) => 
                        r.raw_payload?.data?.key?.id === targetKeyId ||
                        r.raw_payload?.key?.id === targetKeyId ||
                        String(r.id) === String(targetKeyId)
                    ) || (targetKeyId ? null : targetRows?.[0]);

                    if (targetRow) {
                        const currentPayload = targetRow.raw_payload || {};
                        let currentReactions = Array.isArray(currentPayload.reactions) ? [...currentPayload.reactions] : [];

                        if (!emoji) {
                            currentReactions = currentReactions.filter((r: any) => r.from !== 'patient');
                        } else {
                            const existingIdx = currentReactions.findIndex((r: any) => r.from === 'patient');
                            const rxObj = { emoji, from: 'patient', name: senderName || 'Paciente', at: new Date().toISOString() };
                            if (existingIdx >= 0) {
                                currentReactions[existingIdx] = rxObj;
                            } else {
                                currentReactions.push(rxObj);
                            }
                        }

                        await supabase
                            .from('whatsapp_messages')
                            .update({
                                raw_payload: {
                                    ...currentPayload,
                                    reactions: currentReactions
                                }
                            })
                            .eq('id', targetRow.id);
                        console.log(`[webhook] ✅ Reacción actualizada con éxito en mensaje ${targetRow.id}`);
                    }
                } catch (rxErr) {
                    console.warn('[webhook] Error actualizando reacción:', rxErr);
                }
            }
            return new Response(JSON.stringify({ ok: true, reaction: true }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // =============================================
        // 0B. DETECTAR MENSAJES ELIMINADOS (REVOKE / PROTOCOL MESSAGE)
        // NUNCA borrar de la base de datos: marcar para auditoría médica
        // =============================================
        const protocolMsg = data.message?.protocolMessage || data.protocolMessage;
        if (protocolMsg && (protocolMsg.type === 0 || protocolMsg.type === 'REVOKE' || protocolMsg.key?.id)) {
            const revokeKeyId = protocolMsg.key?.id;
            console.log(`[webhook] Solicitud de revocación / borrado recibida para key: ${revokeKeyId} de ${phone}`);
            if (phone && revokeKeyId) {
                try {
                    const { data: revokeRows } = await supabase
                        .from('whatsapp_messages')
                        .select('id, raw_payload')
                        .eq('phone', phone)
                        .order('created_at', { ascending: false })
                        .limit(25);

                    const revokeRow = revokeRows?.find((r: any) => 
                        r.raw_payload?.data?.key?.id === revokeKeyId ||
                        r.raw_payload?.key?.id === revokeKeyId ||
                        String(r.id) === String(revokeKeyId)
                    );

                    if (revokeRow) {
                        await supabase
                            .from('whatsapp_messages')
                            .update({
                                raw_payload: {
                                    ...(revokeRow.raw_payload || {}),
                                    is_deleted: true,
                                    revoked: true,
                                    deleted_at: new Date().toISOString()
                                }
                            })
                            .eq('id', revokeRow.id);
                        console.log(`[webhook] ✅ Mensaje ${revokeRow.id} marcado como revocado por paciente (conservado en base de datos para auditoría médica).`);
                    }
                } catch (revErr) {
                    console.warn('[webhook] Error marcando mensaje como revocado:', revErr);
                }
            }
            return new Response(JSON.stringify({ ok: true, revoked: true }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Extraer mensaje citado si el paciente respondió a uno en WhatsApp
        const contextInfo = data.message?.extendedTextMessage?.contextInfo;
        let incomingQuote = null;
        if (contextInfo?.quotedMessage) {
            const qMsg = contextInfo.quotedMessage;
            const qText = qMsg.conversation || qMsg.extendedTextMessage?.text || (qMsg.imageMessage ? '📷 Foto' : qMsg.audioMessage ? '🎤 Audio' : qMsg.stickerMessage ? '🏷️ Sticker' : '');
            incomingQuote = {
                senderName: contextInfo.participant ? 'Remitente' : 'Mensaje',
                text: qText
            };
        }

        // =============================================
        // EXTRAER MEDIA — búsqueda exhaustiva en el payload
        // BuilderBot puede enviar media en múltiples formatos:
        //   - data.attachment (array de URLs o objetos)
        //   - data.media (URL directa o objeto)
        //   - data.message.imageMessage.url
        //   - data.message.audioMessage.url
        //   - data.message.videoMessage.url
        //   - data.message.documentMessage.url
        //   - data.message.stickerMessage.url
        //   - Contenido con patrón _event_media__ (ID interno, necesita resolverse)
        // =============================================
        let mediaUrl = null;
        let mediaType = 'text';

        // 1. PRIORIDAD: urlTempFile / urlsTempsFiles (BuilderBot Cloud guarda el archivo aquí)
        if (data.urlTempFile && typeof data.urlTempFile === 'string' && data.urlTempFile.startsWith('http')) {
            mediaUrl = data.urlTempFile;
        } else if (data.urlsTempsFiles && Array.isArray(data.urlsTempsFiles) && data.urlsTempsFiles.length > 0) {
            const first = data.urlsTempsFiles[0];
            if (typeof first === 'string' && first.startsWith('http')) {
                mediaUrl = first;
            }
        }

        // 2. Detectar tipo desde data.message (Baileys/WAWebJS message keys)
        if (data.message) {
            const msg = data.message;
            if (msg.imageMessage) mediaType = 'image';
            else if (msg.audioMessage) mediaType = 'audio';
            else if (msg.videoMessage) mediaType = 'video';
            else if (msg.stickerMessage) mediaType = 'sticker';
            else if (msg.documentMessage || msg.documentWithCaptionMessage) mediaType = 'document';
        }

        // 3. Si no tenemos URL aún, buscar en data.media
        if (!mediaUrl && data.media) {
            if (typeof data.media === 'string' && data.media.startsWith('http')) {
                mediaUrl = data.media;
            } else if (data.media?.url) {
                mediaUrl = data.media.url;
            }
        }

        // 4. Si no tenemos URL, buscar en attachment (solo si parece URL completa)
        if (!mediaUrl) {
            const attachments = data.attachment || data.attachments || [];
            if (attachments && attachments.length > 0) {
                const firstAttach = attachments[0];
                if (typeof firstAttach === 'string' && firstAttach.startsWith('http')) {
                    mediaUrl = firstAttach;
                } else if (firstAttach?.url) {
                    mediaUrl = firstAttach.url;
                } else if (firstAttach?.payload?.url) {
                    mediaUrl = firstAttach.payload.url;
                }
            }
        }

        // 5. Buscar en otros campos directos
        if (!mediaUrl) {
            mediaUrl = data.url || data.mediaUrl || data.fileUrl || null;
        }

        // 6. Fallback: buscar recursivamente
        if (!mediaUrl) {
            mediaUrl = findMediaUrl(data);
        }

        // Inferir tipo de media si encontramos URL pero no tipo
        if (mediaUrl && mediaType === 'text') {
            mediaType = inferMediaType(mediaUrl, data.attachment?.[0]);
        }

        // Extraer nombre original de documento si existe (Word, Excel, PDF, etc.)
        const docFileName = data.message?.documentMessage?.fileName || 
            data.message?.documentWithCaptionMessage?.message?.documentMessage?.fileName || 
            data.fileName || data.filename || null;

        // Limpiar contenido: si es un _event_media__ y tenemos mediaUrl, usar caption o nombre de archivo
        let content = rawContent;
        if (content && content.startsWith('_event_media__')) {
            // El body es solo el ID del media, no texto real
            content = data.caption || data.message?.imageMessage?.caption ||
                data.message?.videoMessage?.caption ||
                docFileName || '';
        }
        if (!content && docFileName) {
            content = docFileName;
        }

        // =============================================
        // PERSISTIR MEDIA EN SUPABASE STORAGE
        // Descarga el archivo temporal y lo sube al bucket
        // para tener una URL permanente
        // =============================================
        const originalMediaUrl = mediaUrl; // Guardar URL temporal original
        if (mediaUrl) {
            try {
                const persistedUrl = await persistMediaToStorage(supabase, mediaUrl, mediaType, phone, docFileName);
                if (persistedUrl) {
                    mediaUrl = persistedUrl; // Reemplazar con URL permanente
                    console.log(`[webhook] Media persistida: ${originalMediaUrl} → ${persistedUrl}`);
                } else {
                    console.warn(`[webhook] No se pudo persistir media, usando URL temporal: ${mediaUrl}`);
                }
            } catch (storageError) {
                // Si falla la persistencia, seguimos con la URL temporal
                // Es mejor guardar algo que nada
                console.error(`[webhook] Error persistiendo media (usando URL temporal):`, storageError.message);
            }
        }

        // Log de lo encontrado
        console.log(`[webhook] Parsed — line: ${lineId || 'unknown'}, direction: ${direction}, phone: ${phone}, mediaUrl: ${mediaUrl}, mediaType: ${mediaType}, content: ${content?.substring(0, 100)}`);

        // Preservar media_type incluso sin URL (para stickers sin URL descargable)
        // Esto permite al frontend mostrar un placeholder apropiado
        const finalMediaType = mediaType !== 'text' ? mediaType : (mediaUrl ? inferMediaType(mediaUrl, data.attachment?.[0]) : 'text');

        // Insertar en la tabla y obtener ID para posibles enriquecimientos de IA
        // PROTECCIÓN: Retry con backoff para PGRST002 (schema cache unavailable)
        const { data: insertedData, error: insertError } = await supabaseRetry(
            () => supabase
                .from('whatsapp_messages')
                .insert({
                    phone,
                    direction,
                    content: content || (mediaUrl ? `[${finalMediaType}]` : (finalMediaType !== 'text' ? `[${finalMediaType}]` : '')),
                    media_url: mediaUrl,
                    media_type: finalMediaType,
                    sender_name: senderName,
                    is_read: direction === 'outgoing',
                    raw_payload: incomingQuote ? { ...payload, quoted_message: incomingQuote } : payload,
                    // Guardar la URL temporal original como referencia
                    original_media_url: originalMediaUrl || null,
                    // Línea WhatsApp que recibió el mensaje
                    line_id: lineId,
                })
                .select('id')
                .maybeSingle(),
            `insert whatsapp_messages (${phone} ${direction})`
        );

        if (insertError) {
            console.error('[webhook] Error insertando mensaje (tras reintentos):', insertError);
            return new Response(
                JSON.stringify({ ok: false, error: insertError.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // =============================================
        // ANÁLISIS DE ORDEN MÉDICA CON IA (EDGE FUNCTION)
        // Si el paciente envía una imagen, disparar análisis de visión en background
        // NO se envía el análisis al paciente: se guarda en raw_payload para el operador
        // =============================================
        if (direction === 'incoming' && mediaUrl && finalMediaType === 'image') {
            const insertedId = insertedData?.id;
            console.log(`[webhook] 🩺 Disparando analyze-medical-order para msg ${insertedId}...`);
            fetch(`${SUPABASE_URL}/functions/v1/analyze-medical-order`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                },
                body: JSON.stringify({
                    imageUrl: mediaUrl,
                    messageId: insertedId,
                    phone: phone,
                }),
            }).catch(aiErr => console.error('[webhook] Error triggering analyze-medical-order:', aiErr));
        }

        // =============================================
        // TRANSCRIPCIÓN Y ENTENDIMIENTO DE AUDIO CON IA (OPENAI WHISPER)
        // Si el paciente envía un audio/nota de voz, transcribir y analizar antes del triage
        // para que el bot responda al contenido real del audio y la agente lo lea en consola
        // =============================================
        let audioTranscriptionText = '';
        if (direction === 'incoming' && mediaUrl && (finalMediaType === 'audio' || finalMediaType === 'voice')) {
            const insertedId = insertedData?.id;
            console.log(`[webhook] 🎙️ Disparando y esperando transcribe-audio para msg ${insertedId}...`);
            try {
                const transRes = await fetch(`${SUPABASE_URL}/functions/v1/transcribe-audio`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    },
                    body: JSON.stringify({
                        audioUrl: mediaUrl,
                        messageId: insertedId,
                        phone: phone,
                    }),
                });
                if (transRes.ok) {
                    const transData = await transRes.json();
                    if (transData?.transcription) {
                        audioTranscriptionText = transData.transcription.trim();
                        console.log(`[webhook] 🎙️ Audio transcrito con éxito para triage: "${audioTranscriptionText}"`);
                    }
                } else {
                    console.warn(`[webhook] transcribe-audio devolvió HTTP ${transRes.status}`);
                }
            } catch (audioErr) {
                console.error('[webhook] Error en transcribe-audio:', audioErr);
            }
        }

        // =============================================
        // AUTO-ASIGNAR LÍNEA AL CONTACTO (CRM)
        // Cuando un paciente escribe por una línea, guardar esa línea
        // en crm_contacts.assigned_line_id para no perder la referencia
        // SOLO para líneas quirúrgicas/admisión (no pisar con contact_center ni recepciones)
        // =============================================
        const admQuiLines = ['line_a', 'line_b', 'line_c', 'line_meta'];
        if (direction === 'incoming' && lineId && admQuiLines.includes(lineId) && phone) {
            try {
                const { error: upsertError } = await supabase
                    .from('crm_contacts')
                    .upsert({
                        phone,
                        assigned_line_id: lineId,
                        nombre: senderName || phone,
                    }, { onConflict: 'phone' });

                if (upsertError) {
                    console.warn(`[webhook] Error auto-asignando línea al contacto ${phone}:`, upsertError.message);
                } else {
                    console.log(`[webhook] ✅ Línea ${lineId} auto-asignada al contacto ${phone}`);
                }
            } catch (crmError: any) {
                // Non-fatal: no queremos que falle el webhook por esto
                console.warn(`[webhook] Error en auto-asignación de línea:`, crmError?.message || crmError);
            }
        }

        console.log(`[webhook] Mensaje ${direction} guardado — line: ${lineId}, phone: ${phone}, media: ${finalMediaType}, persisted: ${mediaUrl !== originalMediaUrl}`);

        // =============================================
        // MANEJO DE MENSAJES SALIENTES DE WHATSAPP WEB (isFromMe)
        // Registra la respuesta del operador humano y pausa el bot
        // para que no interfiera en la atención ni le responda al operador
        // =============================================
        if (isFromMe) {
            console.log(`[webhook] 📤 Mensaje saliente de WhatsApp Web detectado (${senderName}) hacia ${phone}. Omitiendo bot triage.`);
            if (phone) {
                try {
                    const nowIso = new Date().toISOString();
                    const { data: existingConv } = await supabase
                        .from('contact_center_conversations')
                        .select('phone, nombre_completo, status, assigned_agent_name, bot_active, closed_at')
                        .eq('phone', phone)
                        .maybeSingle();

                    // Comprobar si la conversación ya estaba archivada o cerrada
                    const isAlreadyClosed = Boolean(
                        existingConv?.closed_at || 
                        ['archivado', 'cerrado', 'finalizado', 'resuelto', 'closed', 'archived'].includes(existingConv?.status)
                    );

                    const convUpdates: Record<string, any> = {
                        phone,
                        last_message_at: nowIso,
                        last_message_text: content,
                        bot_active: false, // PAUSAR BOT porque el operador humano está respondiendo en WhatsApp Web
                        updated_at: nowIso
                    };

                    if (!isAlreadyClosed) {
                        if (!existingConv || existingConv.status === 'bot' || existingConv.status === 'sin_asignar') {
                            convUpdates.status = 'asignado';
                        }

                        if (extractedAgentName && (!existingConv?.assigned_agent_name || existingConv.assigned_agent_name === 'Bot Sanatorio')) {
                            convUpdates.assigned_agent_name = extractedAgentName.replace(' (WhatsApp Web)', '');
                            convUpdates.assigned_at = nowIso;
                        }
                    } else {
                        // Preservar estado archivado/cerrado para que el mensaje de cierre no la desarchive
                        convUpdates.status = existingConv?.status || 'archivado';
                    }

                    // Asegurar que no quede como 'Unknown'
                    if (!existingConv?.nombre_completo || existingConv.nombre_completo.toLowerCase() === 'unknown') {
                        const { data: dbPac } = await supabase
                            .from('hospital_pacientes')
                            .select('nombre')
                            .eq('telefono', phone)
                            .maybeSingle();
                        if (dbPac?.nombre) {
                            convUpdates.nombre_completo = dbPac.nombre;
                        }
                    }

                    const { error: waWebUpsertErr } = await supabaseRetry(
                        () => supabase
                            .from('contact_center_conversations')
                            .upsert(convUpdates, { onConflict: 'phone' }),
                        `upsert conversation WA Web (${phone})`
                    );

                    if (waWebUpsertErr) {
                        console.error(`[webhook] Error actualizando conversación WA Web (${phone}):`, waWebUpsertErr);
                    } else {
                        console.log(`[webhook] ✅ Conversación actualizada para ${phone} por mensaje de WhatsApp Web (status: ${convUpdates.status}).`);
                    }
                } catch (convErr: any) {
                    console.error('[webhook] Error actualizando conversación por mensaje WhatsApp Web:', convErr?.message || convErr);
                }
            }

            return new Response(
                JSON.stringify({ ok: true, outgoing_from_me: true, phone, senderName, lineId }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // =============================================
        // =============================================
        // CHATBOT TRIAGE & AI SUMMARY EN SEGUNDO PLANO (NON-BLOCKING)
        // Para que BuilderBot reciba HTTP 200 en ~50ms y NO encole ni demore los mensajes entrantes
        // =============================================
        const nonContactCenterLines = ['line_a', 'line_b', 'line_c', 'line_recepciones', 'line_meta'];
        const isTargetContactCenter = lineId === 'contact_center' || (!nonContactCenterLines.includes(lineId || ''));

        if (direction === 'incoming' && phone && isTargetContactCenter) {
            const backgroundTriagePromise = (async () => {
                try {
                    // =========================================================
                    // DEBOUNCE & MESSAGE BUFFERING (COALESCING DE MENSAJES RÁFAGA)
                    // Espera 3.5 segundos por si el paciente envía varios mensajes seguidos
                    // =========================================================
                    const DEBOUNCE_WAIT_MS = 3500;
                    await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_WAIT_MS));

                    // Verificar si entró otro mensaje más nuevo para este mismo teléfono
                    const currentMsgId = insertedData?.id;
                    if (currentMsgId) {
                        const { data: latestMsg } = await supabase
                            .from('whatsapp_messages')
                            .select('id')
                            .eq('phone', phone)
                            .eq('direction', 'incoming')
                            .order('created_at', { ascending: false })
                            .order('id', { ascending: false })
                            .limit(1)
                            .maybeSingle();

                        if (latestMsg && latestMsg.id !== currentMsgId) {
                            console.log(`[webhook-debounce] ⏭️ Se detectó mensaje entrante posterior (${latestMsg.id} vs actual ${currentMsgId}) para ${phone}. Cediendo procesamiento al mensaje final.`);
                            return;
                        }
                    }

                    // Si este es el mensaje ganador (último de la ráfaga), recopilar todos los mensajes
                    // entrantes no respondidos del paciente desde la última respuesta saliente del bot
                    const { data: lastOutgoing } = await supabase
                        .from('whatsapp_messages')
                        .select('created_at')
                        .eq('phone', phone)
                        .eq('direction', 'outgoing')
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                    const lastOutgoingTime = lastOutgoing?.created_at 
                        ? new Date(lastOutgoing.created_at).toISOString() 
                        : new Date(Date.now() - 60000).toISOString();

                    const { data: burstMessages } = await supabase
                        .from('whatsapp_messages')
                        .select('id, content, media_type, media_url, created_at')
                        .eq('phone', phone)
                        .eq('direction', 'incoming')
                        .gt('created_at', lastOutgoingTime)
                        .order('created_at', { ascending: true });

                    let consolidatedText = '';
                    let consolidatedMediaType = finalMediaType;
                    let consolidatedMediaUrl = mediaUrl;

                    if (burstMessages && burstMessages.length > 0) {
                        const fragments: string[] = [];
                        for (const m of burstMessages) {
                            const t = (m.content || '').trim();
                            if (m.id === currentMsgId && audioTranscriptionText) {
                                fragments.push(audioTranscriptionText);
                            } else if (t && !t.startsWith('[image]') && !t.startsWith('[document]') && !t.startsWith('[audio]') && !t.startsWith('[voice]')) {
                                fragments.push(t);
                            }
                            if (m.media_url && !consolidatedMediaUrl) {
                                consolidatedMediaUrl = m.media_url;
                                consolidatedMediaType = m.media_type || 'image';
                            }
                        }
                        const lastFragment = fragments[fragments.length - 1] || '';
                        if (isNavigationBackOrMenu(lastFragment) || fragments.some(f => isNavigationBackOrMenu(f))) {
                            consolidatedText = 'Menú';
                        } else {
                            consolidatedText = fragments.join('\n').trim();
                        }
                    }

                    if (!consolidatedText) {
                        consolidatedText = audioTranscriptionText || content || (consolidatedMediaUrl ? `[${consolidatedMediaType}]` : '');
                    }

                    console.log(`[webhook-debounce] 📦 Ráfaga consolidada para ${phone} (${burstMessages?.length || 1} msgs agrupados):\n"${consolidatedText}"`);

                    await handleChatbotTriage(
                        supabase, 
                        phone, 
                        consolidatedText, 
                        senderName, 
                        lineId || 'contact_center', 
                        consolidatedMediaType, 
                        consolidatedMediaUrl
                    );
                } catch (triageError: any) {
                    console.error('[webhook] Error en handleChatbotTriage (non-fatal):', triageError?.message || triageError);
                }

                // Actualizar automáticamente el Resumen IA de la Consulta para la pantalla del operador
                try {
                    const r = await fetch(`${SUPABASE_URL}/functions/v1/contact-center-chat-summary`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
                        },
                        body: JSON.stringify({ phone })
                    });
                    const text = await r.text();
                    console.log(`[webhook] ✅ Resumen IA generado automáticamente para ${phone}:`, text.slice(0, 120));
                } catch (aiErr: any) {
                    console.warn('[webhook] Background chat summary error:', aiErr?.message || aiErr);
                }
            })();

            if (typeof (globalThis as any).EdgeRuntime !== 'undefined' && (globalThis as any).EdgeRuntime?.waitUntil) {
                (globalThis as any).EdgeRuntime.waitUntil(backgroundTriagePromise);
            }
        }

        return new Response(
            JSON.stringify({ ok: true, direction, phone, mediaType: finalMediaType, hasMedia: !!mediaUrl, persisted: mediaUrl !== originalMediaUrl, lineId }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('[webhook] Error fatal:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});

// =============================================
// FUNCIÓN: Persistir media en Supabase Storage
// =============================================

/**
 * Descarga un archivo desde una URL temporal y lo sube al bucket de Supabase Storage.
 * Retorna la URL pública permanente, o null si falla.
 */
async function persistMediaToStorage(
    supabase: any, 
    tempUrl: string, 
    mediaType: string, 
    phone: string, 
    originalFilename?: string | null
): Promise<string | null> {
    // Descargar el archivo desde la URL temporal
    console.log(`[storage] Descargando media desde: ${tempUrl}${originalFilename ? ` (nombre: ${originalFilename})` : ''}`);
    const response = await fetch(tempUrl);

    if (!response.ok) {
        console.error(`[storage] Error descargando media: HTTP ${response.status} ${response.statusText}`);
        return null;
    }

    // Verificar que el response no sea una página de error (JSON/HTML en vez de media real)
    const responseContentType = (response.headers.get('content-type') || '').toLowerCase();
    if (responseContentType.includes('text/html') || responseContentType.includes('application/json')) {
        console.warn(`[storage] URL temporal devolvió ${responseContentType} (probablemente expiró), no se persiste`);
        return null;
    }

    // Obtener el contenido como ArrayBuffer
    const fileBuffer = await response.arrayBuffer();
    const fileSize = fileBuffer.byteLength;

    // Limitar archivos a 50MB para no llenar el storage
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    if (fileSize > MAX_FILE_SIZE) {
        console.warn(`[storage] Archivo demasiado grande (${(fileSize / 1024 / 1024).toFixed(1)}MB), no se persiste`);
        return null;
    }

    // Deducir mime type específico si se conoce el nombre de archivo del documento
    let detectedMime: string | null = null;
    if (originalFilename) {
        const lowerName = originalFilename.toLowerCase();
        if (lowerName.endsWith('.pdf')) detectedMime = 'application/pdf';
        else if (lowerName.endsWith('.docx')) detectedMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        else if (lowerName.endsWith('.doc')) detectedMime = 'application/msword';
        else if (lowerName.endsWith('.xlsx')) detectedMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        else if (lowerName.endsWith('.xls')) detectedMime = 'application/vnd.ms-excel';
        else if (lowerName.endsWith('.csv')) detectedMime = 'text/csv';
    }

    // Determinar content-type: priorizar tipo detectado o tipo conocido de WhatsApp
    const contentType = detectedMime || (getMimeForMediaType(mediaType) !== 'application/octet-stream'
        ? getMimeForMediaType(mediaType)
        : (responseContentType || getMimeForMediaType(mediaType)));

    let extension = originalFilename ? getExtensionFromMime(contentType, originalFilename, mediaType) : '';
    if (!extension || extension === 'bin') {
        extension = getExtensionFromMime(contentType, tempUrl, mediaType);
    }

    // Generar nombre único: phone/timestamp_random.ext
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filePath = `incoming/${phone}/${timestamp}_${random}.${extension}`;

    console.log(`[storage] Subiendo a ${STORAGE_BUCKET}/${filePath} (${(fileSize / 1024).toFixed(1)}KB, ${contentType})`);

    // Subir a Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, fileBuffer, {
            contentType: contentType,
            cacheControl: '31536000', // 1 año de cache
            upsert: false,
        });

    if (uploadError) {
        console.error(`[storage] Error subiendo archivo:`, uploadError.message);
        return null;
    }

    // Obtener URL pública permanente
    const { data: publicUrlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(filePath);

    if (!publicUrlData?.publicUrl) {
        console.error(`[storage] No se pudo obtener URL pública`);
        return null;
    }

    console.log(`[storage] ✅ Archivo persistido: ${publicUrlData.publicUrl}`);
    return publicUrlData.publicUrl;
}

/**
 * Determina el MIME type basado en el tipo de media
 */
function getMimeForMediaType(mediaType: string): string {
    switch (mediaType) {
        case 'image': return 'image/jpeg';
        case 'audio': return 'audio/ogg';
        case 'video': return 'video/mp4';
        case 'sticker': return 'image/webp';
        case 'document': return 'application/octet-stream';
        default: return 'application/octet-stream';
    }
}

/**
 * Determina la extensión del archivo a partir del MIME type, URL o tipo de media
 */
function getExtensionFromMime(contentType: string, url: string, mediaType: string): string {
    // Intentar extraer extensión de la URL original
    const urlExtMatch = url.match(/\.([a-zA-Z0-9]{2,5})(?:\?|$)/);
    if (urlExtMatch) {
        const ext = urlExtMatch[1].toLowerCase();
        // Validar que sea una extensión conocida
        const validExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg',
            'mp3', 'ogg', 'opus', 'wav', 'm4a', 'aac', 'weba', 'webm',
            'mp4', 'mov', 'avi', 'mkv', '3gp',
            'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'ppt', 'pptx'];
        if (validExts.includes(ext)) return ext;
    }

    // Mapeo de MIME a extensión
    const mimeMap: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/svg+xml': 'svg',
        'audio/ogg': 'ogg',
        'audio/opus': 'opus',
        'audio/mpeg': 'mp3',
        'audio/mp4': 'm4a',
        'audio/wav': 'wav',
        'audio/webm': 'weba',
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'video/3gpp': '3gp',
        'application/pdf': 'pdf',
        'application/msword': 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/vnd.ms-excel': 'xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
        'text/plain': 'txt',
        'text/csv': 'csv',
    };

    const mime = contentType.split(';')[0].trim().toLowerCase();
    if (mimeMap[mime]) return mimeMap[mime];

    // Fallback por tipo de media
    switch (mediaType) {
        case 'image': return 'jpg';
        case 'audio': return 'ogg';
        case 'video': return 'mp4';
        case 'sticker': return 'webp';
        case 'document': return 'bin';
        default: return 'bin';
    }
}

/**
 * Normaliza número argentino para consistencia
 * Siempre retorna formato 549XXXXXXXXXX (exactamente 13 dígitos)
 */
function normalizePhone(phone) {
    if (!phone) return '';
    let clean = phone.replace(/\D/g, '');

    // Ya tiene formato internacional completo con 549 y exactamente 13 dígitos
    if (clean.startsWith('549') && clean.length === 13) return clean;

    // Si tiene 549 pero más de 13 dígitos, puede tener un 15 interno
    // Ej: 549264154XXXXX (15 digs) → quitar el 15 después del código de área
    if (clean.startsWith('549') && clean.length > 13) {
        const inner = clean.slice(3); // quitar 549
        // Buscar 15 en posición de cod. de área (posición 2-4)
        const idx15 = inner.indexOf('15');
        if (idx15 >= 2 && idx15 <= 4) {
            const cleaned = inner.slice(0, idx15) + inner.slice(idx15 + 2);
            if (cleaned.length === 10) return '549' + cleaned;
        }
        // Si aún es largo, truncar a 13 dígitos (tomar los primeros 10 después de 549)
        return '549' + inner.slice(0, 10);
    }

    if (clean.startsWith('54') && !clean.startsWith('549')) {
        clean = clean.slice(2);
    }
    if (clean.startsWith('0')) {
        clean = clean.slice(1);
    }
    if (clean.startsWith('15') && clean.length <= 10) {
        clean = '264' + clean.slice(2);
        return '549' + clean;
    }
    // Quitar 15 interno (ej: 264-15-XXXXXX)
    if (clean.length > 10 && clean.includes('15')) {
        const idx = clean.indexOf('15');
        if (idx >= 2 && idx <= 4) {
            clean = clean.slice(0, idx) + clean.slice(idx + 2);
        }
    }

    // Asegurar que el resultado final tiene exactamente 10 dígitos locales
    if (clean.length > 10) {
        clean = clean.slice(0, 10);
    }

    return '549' + clean;
}

/**
 * Infiere el tipo de media según la URL o metadata del attachment
 */
function inferMediaType(url, attachment) {
    const lower = url.toLowerCase();

    if (attachment?.type) {
        const type = attachment.type.toLowerCase();
        if (type.includes('audio')) return 'audio';
        if (type.includes('image')) return 'image';
        if (type.includes('video')) return 'video';
        if (type.includes('sticker')) return 'sticker';
        if (type.includes('document')) return 'document';
    }

    // Por extensión
    if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(lower)) return 'image';
    if (/\.(mp3|ogg|opus|wav|m4a|aac|weba|webm)(\?|$)/i.test(lower) && !lower.includes('video')) return 'audio';
    if (/\.(mp4|mov|avi|mkv|3gp)(\?|$)/i.test(lower)) return 'video';
    if (/\.(pdf|doc|docx|xls|xlsx|csv|txt|ppt|pptx)(\?|$)/i.test(lower)) return 'document';

    // Por MIME en el attachment
    if (attachment?.mimetype || attachment?.mime) {
        const mime = (attachment.mimetype || attachment.mime).toLowerCase();
        if (mime.startsWith('image/')) return 'image';
        if (mime.startsWith('audio/')) return 'audio';
        if (mime.startsWith('video/')) return 'video';
        if (mime.startsWith('application/')) return 'document';
    }

    // Si la URL contiene indicios
    if (lower.includes('/image') || lower.includes('img')) return 'image';
    if (lower.includes('/audio') || lower.includes('ptt')) return 'audio';
    if (lower.includes('/video')) return 'video';

    return 'image'; // Default para media sin tipo claro
}

/**
 * Busca recursivamente en un objeto cualquier campo que parezca una URL de media
 */
function findMediaUrl(obj, depth = 0) {
    if (depth > 5 || !obj || typeof obj !== 'object') return null;

    // Campos que probablemente contengan URLs de media
    const urlFields = [
        'url', 'mediaUrl', 'media_url', 'fileUrl', 'file_url',
        'directPath', 'link', 'href', 'src', 'thumbnail',
        'jpegThumbnail', 'image', 'audio', 'video',
    ];

    for (const key of urlFields) {
        if (obj[key] && typeof obj[key] === 'string' &&
            (obj[key].startsWith('http') || obj[key].startsWith('//'))) {
            return obj[key];
        }
    }

    // Buscar en sub-objetos (no arrays para evitar loops)
    for (const [key, val] of Object.entries(obj)) {
        if (val && typeof val === 'object' && !Array.isArray(val)) {
            const found = findMediaUrl(val, depth + 1);
            if (found) return found;
        }
    }

    return null;
}

// =============================================
// DETECCIÓN INTELIGENTE DE INTENCIONES Y PROFESIONALES (AHORRO MÁXIMO DE MENSAJES)
// =============================================

interface IntentDetectionResult {
    intent: 
        | 'saludo_inicial'
        | 'volver_atras'
        | 'consultar_turno'
        | 'turno' 
        | 'autorizacion' 
        | 'gestion_familiar'
        | 'gestion_propia'
        | 'info' 
        | 'chequeo' 
        | 'prevenir' 
        | 'guardia' 
        | 'informes_laboratorio'
        | 'informes_imagenes'
        | 'informes_biopsia_pap'
        | 'informes_general'
        | 'servicio_laboratorio'
        | 'vacunatorio'
        | 'curso_embarazadas'
        | 'registro_civil'
        | 'administracion_presupuestos'
        | 'horarios_sedes'
        | 'telefonos_sedes'
        | 'reclamos_calidad'
        | 'fundacion'
        | 'confirmar_turno_online'
        | 'cancelar_turno_online'
        | 'reprogramar_turno_online'
        | 'gestion_turno_flujo'
        | 'agradecimiento_cierre'
        | 'seguimiento_asesor'
        | 'derivacion_agente'
        | 'saludo_en_flujo'
        | 'seleccion_medico'
        | 'general';
    doctorCandidate: string | null;
    doctorRecord: any | null;
    multipleDoctors?: any[] | null;
    isExplicitNumberOption: string | null;
    sectorKey?: string | null;
    specialtyCandidate?: string | null;
    isForOtherPatient?: boolean;
}

interface ConversationContext {
    history?: any[];
    lastBotMessage?: any;
    lastAgentMessage?: any;
    hasAgentIntervened?: boolean;
    agentName?: string | null;
    turnoOnlineProximo?: any;
    turnosActivosProximos?: any[];
    patientName?: string | null;
    resolvedDni?: string | null;
    previousResolutionReason?: string | null;
    botStage?: string | null;
}


const STOPWORDS_MEDICOS = new Set([
    'hacer', 'hacerme', 'hacerse', 'sacar', 'sacarme', 'sacarse', 'pedir', 'pedirme',
    'ver', 'verme', 'verse', 'saber', 'consultar', 'chequeo', 'chequeos', 'control',
    'controles', 'estudio', 'estudios', 'turno', 'turnos', 'consulta', 'atencion',
    'atención', 'manana', 'mañana', 'tarde', 'hoy', 'lunes', 'martes', 'miercoles', 'miércoles',
    'jueves', 'viernes', 'sabado', 'sábado', 'domingo', 'semana', 'mes', 'algun', 'alguna',
    'alguno', 'algunos', 'algunas', 'favor', 'hola', 'buenas', 'buenos', 'ustedes', 'sanatorio', 'argentino',
    'salud', 'clinica', 'clínica', 'medico', 'médico', 'medica', 'médica', 'doctor', 'doctora',
    'profesional', 'especialista', 'analisis', 'análisis', 'laboratorio', 'ecografia', 'ecografía',
    'radiografia', 'radiografía', 'orden', 'receta', 'como', 'cómo', 'para', 'buen', 'dia', 'días', 'bienvenido',
    'prevenir', 'prevencion', 'prevención', 'guardia', 'guardias', 'vacuna', 'vacunas', 'registro',
    'presupuesto', 'presupuestos', 'informe', 'informes', 'reclamo', 'reclamos',
    'familiar', 'familiares', 'paciente', 'pacientes', 'tercero', 'persona', 'personas',
    'quiero', 'queria', 'quería', 'quisiera', 'deseo', 'necesito', 'busco', 'tengo', 'puedo',
    'otra', 'otro', 'otras', 'otros', 'cambiar', 'cambio', 'ningun', 'ninguna', 'ninguno',
    'cualquiera', 'quien', 'quién', 'cuando', 'cuándo', 'dame', 'pasame', 'mandame', 'enviame',
    'atender', 'atenderme', 'coordinar', 'agendar', 'cita', 'citas', 'nueva', 'nuevo', 'nuevos',
    'que', 'qué', 'paso', 'pasó', 'esto', 'esta', 'este', 'estos', 'estas', 'cual', 'cuál',
    'donde', 'dónde', 'por', 'con', 'del', 'los', 'las', 'una', 'uno', 'unos', 'unas',
    'sino', 'pero', 'mas', 'más', 'porque', 'hacia', 'desde', 'hasta', 'sobre', 'tras',
    'nada', 'nadie', 'algo', 'alguien', 'bien', 'mal', 'chau', 'adios', 'adiós',
    // Expresiones conversacionales, verbos y marcadores discursivos comunes en español
    'mira', 'mirá', 'mire', 'miren', 'miras', 'mirás', 'mirando', 'mirar',
    'sabes', 'sabés', 'sabe', 'saben', 'sabemos', 'sabia', 'sabía',
    'autorizar', 'autorizacion', 'autorización', 'autorizarme', 'autorizarse', 'autorizo', 'autorizame', 'autoriza',
    'pedido', 'pedidos',
    'fijate', 'fíjate', 'fijense', 'fíjense', 've', 'ves', 'veo', 'vemos', 'viendo',
    'decir', 'dice', 'dijo', 'digo', 'decime', 'decíme', 'decia', 'decía',
    'mandar', 'mando', 'mandó', 'mande', 'mandé', 'mandas', 'mandás', 'enviar', 'envio', 'envió', 'envie', 'envié',
    'foto', 'fotos', 'imagen', 'imagenes', 'imágenes', 'captura', 'capturas', 'adjunto', 'adjuntos', 'archivo', 'archivos',
    'comprobante', 'comprobantes', 'papel', 'papeles',
    'tambien', 'también', 'ademas', 'además', 'igualmente', 'igual',
    'bueno', 'buena', 'che', 'dale', 'listo', 'oka', 'okay', 'ok',
    'poder', 'puedo', 'puede', 'pueden', 'podria', 'podría', 'podrian', 'podrían', 'podemos',
    'tener', 'tengo', 'tiene', 'tienen', 'tenia', 'tenía', 'tenemos', 'tenes', 'tenés',
    'haber', 'hay', 'habia', 'había', 'hubo',
    'estar', 'estoy', 'estan', 'están', 'estaba', 'estaban',
    'dejar', 'dejo', 'dejó', 'deja', 'dejan', 'dejame', 'dejáme',
    'quedar', 'quedo', 'quedó', 'queda', 'quedan',
    'pasar', 'pasa', 'pasas', 'pasás', 'pasan', 'pasale', 'pasalo',
    'avisar', 'aviso', 'avisó', 'avisa', 'avisan', 'avisame', 'avisáme',
    'ah', 'eh', 'oh', 'uh', 'em',
    // Calles, Sedes, Zonas y Departamentos de San Juan (evitan confusión geográfica con médicos)
    'santa', 'fe', 'santa fe', 'san', 'luis', 'san luis', 'san juan', 'juan',
    'calle', 'avenida', 'sede', 'sedes', 'sucursal', 'centro', 'escuela', 'colegio',
    'departamento', 'capital', 'chimbas', 'rawson', 'rivadavia', 'pocito', 'caucete',
    'albardon', 'albardón', 'angaco', 'iglesia', 'jachal', 'jáchal', 'valle',
    'fertil', 'fértil', 'valle fértil', 'valle fertil', 'calingasta', 'barreal',
    'sarmiento', 'ullum', 'zonda', '25 de mayo', '9 de julio', 'villa', 'krause',
    'lucia', 'lucía', 'santa lucia', 'santa lucía', 'lab', 'laboratorios', 'convenio'
]);

const SPECIALTY_MAP: [RegExp, string][] = [
    [/\b(cl[ií]nic[ao]s?|m[eé]dic[ao]\s+cl[ií]nic[ao]|cl[ií]nica\s+m[eé]dica|medicina\s+interna)\b/i, 'Clínica Médica'],
    [/\b(pediatr[ií]a|pediatras?)\b/i, 'Pediatría'],
    [/\b(ginecolog[ií]a|ginec[oó]log[ao]s?|obstetricia|obstetras?|tocoginecolog[ií]a)\b/i, 'Ginecología y Obstetricia'],
    [/\b(cardiolog[ií]a|cardi[oó]log[ao]s?)\b/i, 'Cardiología'],
    [/\b(traumatolog[ií]a|traumat[oó]log[ao]s?|ortopedia)\b/i, 'Traumatología'],
    [/\b(dermatolog[ií]a|dermat[oó]log[ao]s?)\b/i, 'Dermatología'],
    [/\b(neurolog[ií]a|neur[oó]log[ao]s?)\b/i, 'Neurología'],
    [/\b(urolog[ií]a|ur[oó]log[ao]s?)\b/i, 'Urología'],
    [/\b(oftalmolog[ií]a|oftalm[oó]log[ao]s?|oculistas?)\b/i, 'Oftalmología'],
    [/\b(otorrino|otorrinolaringolog[ií]a|otorrinolaring[oó]log[ao]s?)\b/i, 'Otorrinolaringología'],
    [/\b(gastroenterolog[ií]a|gastroenter[oó]log[ao]s?|gastro)\b/i, 'Gastroenterología'],
    [/\b(endocrinolog[ií]a|endocrin[oó]log[ao]s?)\b/i, 'Endocrinología'],
    [/\b(reumatolog[ií]a|reumat[oó]log[ao]s?)\b/i, 'Reumatología'],
    [/\b(neumonolog[ií]a|neumon[oó]log[ao]s?|neumolog[ií]a|pulmonar)\b/i, 'Neumonología'],
    [/\b(nefrolog[ií]a|nefr[oó]log[ao]s?)\b/i, 'Nefrología'],
    [/\b(hematolog[ií]a|hemat[oó]log[ao]s?)\b/i, 'Hematología'],
    [/\b(infectolog[ií]a|infect[oó]log[ao]s?)\b/i, 'Infectología'],
    [/\b(nutrici[oó]n|nutricionistas?)\b/i, 'Nutrición'],
    [/\b(kinesiolog[ií]a|kinesi[oó]log[ao]s?|fisioterapia)\b/i, 'Kinesiología'],
    [/\b(psicolog[ií]a|psic[oó]log[ao]s?)\b/i, 'Psicología'],
    [/\b(psiquiatr[ií]a|psiquiatras?)\b/i, 'Psiquiatría'],
    [/\b(cirug[ií]a|cirujan[ao]s?)\b/i, 'Cirugía General'],
    [/\b(flebolog[ií]a|fleb[oó]log[ao]s?)\b/i, 'Flebología'],
    [/\b(alergia|alergistas?|inmunolog[ií]a)\b/i, 'Alergia e Inmunología'],
    [/\b(mastolog[ií]a|mast[oó]log[ao]s?)\b/i, 'Mastología'],
    [/\b(fertilidad|reproducci[oó]n\s+asistida)\b/i, 'Medicina Reproductiva / Fertilidad'],
    [/\b(ecograf[ií]a|ecograf[ií]as|ecografistas?|transvaginal|doppler|ecodoppler|ecocardiograma|eco\b)\b/i, 'Ecografía'],
    [/\b(tomograf[ií]a|tomograf[ií]as|tac\b|tc\b|tomograf[ií]a\s+computada)\b/i, 'Tomografía'],
    [/\b(radiograf[ií]a|radiograf[ií]as|rayos\s*x|espinograf[ií]a|placa[s]?\b|rx\b)\b/i, 'Radiografía'],
    [/\b(densitometr[ií]a|densitometr[ií]as|densitometr[ií]a\s+[oó]sea)\b/i, 'Densitometría Ósea'],
    [/\b(mamograf[ií]a|mamograf[ií]as|mamograf[ií]a\s+digital|mamograf[ií]a\s+bilateral|mamo\b)\b/i, 'Mamografía'],
    [/\b(resonancia|resonancias|resonancia\s+magn[eé]tica|rmn\b|mri\b)\b/i, 'Resonancia Magnética']
];

// Estudios de Diagnóstico por Imágenes que exigen obligatoriamente la presentación de Orden / Pedido Médico
export const ESTUDIOS_CON_ORDEN_MAPPING: [RegExp, string][] = [
    [/\b(ecograf[ií]a[s]?|ecografistas?|transvaginal|doppler|ecodoppler|ecocardiograma|ecogr[aá]fic[ao]s?|eco\b)\b/i, 'Ecografía'],
    [/\b(tomograf[ií]a[s]?|tac\b|tc\b|tomogr[aá]fic[ao]s?)\b/i, 'Tomografía'],
    [/\b(radiograf[ií]a[s]?|rayos\s*x|espinograf[ií]a[s]?|placa[s]?\b|rx\b)\b/i, 'Radiografía'],
    [/\b(densitometr[ií]a[s]?|densitometr[ií]a\s+[oó]sea)\b/i, 'Densitometría Ósea'],
    [/\b(mamograf[ií]a[s]?|mamogr[aá]fic[ao]s?|mamo\b)\b/i, 'Mamografía'],
    [/\b(resonancia[s]?|resonancia\s+magn[eé]tica|rmn\b|mri\b)\b/i, 'Resonancia Magnética']
];

export function detectEstudiosConOrden(text: string | null | undefined): string[] {
    if (!text) return [];
    const clean = text.trim();
    if (!clean) return [];
    const matches: string[] = [];
    for (const [rx, label] of ESTUDIOS_CON_ORDEN_MAPPING) {
        if (rx.test(clean) && !matches.includes(label)) {
            matches.push(label);
        }
    }
    return matches;
}

export function detectEstudioConOrden(text: string | null | undefined): string | null {
    const list = detectEstudiosConOrden(text);
    return list.length > 0 ? list.join(' y ') : null;
}

function detectSpecialty(text: string): string | null {
    if (!text) return null;
    for (const [regex, name] of SPECIALTY_MAP) {
        if (regex.test(text)) return name;
    }
    return null;
}

/**
 * Determina si un texto representa una especialidad médica o servicio hospitalario en lugar de un profesional
 */
function isMedicalSpecialty(text: string): boolean {
    if (!text) return false;
    const clean = text.trim();
    if (/^dr[a]?\.\s*/i.test(clean) || /^(doctor|doctora)\b/i.test(clean)) {
        return false;
    }
    for (const [_, name] of SPECIALTY_MAP) {
        if (name.toLowerCase() === clean.toLowerCase()) return true;
    }
    return /\b(especialidad|servicio|departamento|traumatolog[ií]a|pediatr[ií]a|ginecolog[ií]a|obstetricia|cardiolog[ií]a|dermatolog[ií]a|neurolog[ií]a|urolog[ií]a|oftalmolog[ií]a|otorrino|otorrinolaringolog[ií]a|gastroenterolog[ií]a|endocrinolog[ií]a|reumatolog[ií]a|neumonolog[ií]a|nefrolog[ií]a|hematolog[ií]a|infectolog[ií]a|nutrici[oó]n|kinesiolog[ií]a|psicolog[ií]a|psiquiatr[ií]a|cirug[ií]a|flebolog[ií]a|alergia|mastolog[ií]a|fertilidad|ecograf[ií]a|radiograf[ií]a|tomograf[ií]a|densitometr[ií]a|mamograf[ií]a|resonancia|cl[ií]nica\s+m[eé]dica|salud\s+mental|medicina\s+interna)\b/i.test(clean);
}

/**
 * Formatea la cláusula gramatical para coordinar el turno, distinguiendo limpiamente entre:
 *  - Estudios que requieren orden: "para tu estudio de *Ecografía*"
 *  - Especialidad médica: "en la especialidad de *Traumatología*"
 *  - Doctora: "con la *Dra. Apellido*"
 *  - Doctor: "con el *Dr. Apellido*"
 *  - Programas / Circuitos: "para el *Programa Prevenir*"
 *  - Profesional genérico sin título: "con *Nombre*"
 */
function formatTurnoTargetPhrase(target: string | null | undefined): string {
    if (!target) return '';
    const clean = target.trim();
    if (!clean) return '';

    if (/\b(programa|circuito|chequeo)\b/i.test(clean)) {
        return ` para el *${clean}*`;
    }

    if (detectEstudioConOrden(clean)) {
        return ` para tu estudio de *${clean}*`;
    }

    if (isMedicalSpecialty(clean)) {
        if (/^(en\s+la\s+especialidad|especialidad|servicio)\b/i.test(clean)) {
            return ` en ${clean.replace(/^[eE]n\s+/, '')}`;
        }
        return ` en la especialidad de *${clean}*`;
    }

    if (/^dra\.?\s*/i.test(clean) || /\b(doctora)\b/i.test(clean)) {
        return ` con la *${clean}*`;
    }

    if (/^dr\.?\s*/i.test(clean) || /\b(doctor)\b/i.test(clean)) {
        return ` con el *${clean}*`;
    }

    if (clean.includes('(')) {
        const isDra = /\b(dra\.?|doctora)\b/i.test(clean);
        return isDra ? ` con la *${clean}*` : ` con el *${clean}*`;
    }

    return ` con *${clean}*`;
}

function formatDoctorDisplay(rawDoc: any): { displayName: string; specialty: string; cleanSurnameAndName: string } {
    if (!rawDoc) return { displayName: 'Profesional', specialty: 'Consultorios', cleanSurnameAndName: 'Profesional' };
    let name = (rawDoc.profesional_nombre || '').trim();

    // Si el nombre corresponde a una institución, centro, escuela o servicio operativo (no a una persona médica)
    const isInstitution = /\b(escuela|colegio|instituto|lab\b|laboratorio|guardia|vacunatorio|preadmision|admisiones|curaciones|citologia|tamberias|barreal|sarmiento|chimbas|albardon|jachal|astica|rivadavia|calingasta|santa lucia|encon|ullum|zonda|caucete|rawson|pocito|capital|hemodinamia|radiologia|tomografia)\b/i.test(name);
    if (isInstitution) {
        return {
            displayName: name,
            specialty: rawDoc.especialidad && rawDoc.especialidad !== 'Consulta Médica' ? rawDoc.especialidad : 'Atención Externa',
            cleanSurnameAndName: name
        };
    }

    const isFemale = /\b(dra\.?|doctora|agustina|ana|sonia|laura|silvia|lucia|lucía|julieta|marisa|cintia|paulina|daniela|mariana|maria|valeria|patricia|carolina|veronica|romina|natalia|vanesa|gabriela|lorena|cecilia|marcela|andrea|elena|claudia|bertha)\b/i.test(name);
    const prefix = isFemale ? 'Dra.' : 'Dr.';
    
    let cleanName = name
        .replace(/^\([A-Z0-9\s-]+\)\s*/i, '')
        .replace(/\s*\([A-Z0-9\s-]+\)$/i, '')
        .replace(/\b(DRA?\.?|DOCTORA?)\b/gi, '')
        .replace(/\b(SEDE\s*\d+|SLS|SSLN|SSL\d+|Fertilidad|Sede San Luis)\b/gi, '')
        .trim();
        
    let cleanSurnameAndName = cleanName;
    if (cleanName.includes(',')) {
        const parts = cleanName.split(',').map((p: string) => p.trim());
        cleanSurnameAndName = `${parts[0]} ${parts[1]}`;
        cleanName = `${parts[1]} ${parts[0]}`;
    } else {
        const words = cleanName.split(/\s+/);
        if (words.length >= 2) {
            const first = words[0];
            const rest = words.slice(1).join(' ');
            cleanSurnameAndName = `${first} ${rest}`;
            cleanName = `${rest} ${first}`;
        }
    }
    
    cleanName = cleanName
        .toLowerCase()
        .split(' ')
        .filter(Boolean)
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
        
    cleanSurnameAndName = cleanSurnameAndName
        .toLowerCase()
        .split(' ')
        .filter(Boolean)
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
        
    const displayName = `${prefix} ${cleanName}`;
    
    let esp = (rawDoc.especialidad || '').trim();
    const cond = (rawDoc.condiciones_consulta || '').toLowerCase();
    
    if (!esp || esp.toLowerCase() === 'consulta médica' || esp.toLowerCase() === 'consulta medica') {
        if (/traumato|cadera|rodilla|columna/i.test(cond)) esp = 'Traumatología';
        else if (/cardio/i.test(cond)) esp = 'Cardiología';
        else if (/gineco|obstet|asog|pap|colpo/i.test(cond)) esp = 'Ginecología y Obstetricia';
        else if (/pediatr|niñ/i.test(cond)) esp = 'Pediatría';
        else if (/dermatolog/i.test(cond)) esp = 'Dermatología';
        else if (/urolog/i.test(cond)) esp = 'Urología';
        else if (/neurolog/i.test(cond)) esp = 'Neurología';
        else if (/oftalmolog/i.test(cond)) esp = 'Oftalmología';
        else if (/ecograf/i.test(cond)) esp = 'Ecografía';
        else if (/cirug/i.test(cond)) esp = 'Cirugía';
        else if (/nutrici/i.test(cond)) esp = 'Nutrición';
        else if (/diabet|endocrin/i.test(cond)) esp = 'Endocrinología';
        else if (/\(neo\)/i.test(name)) esp = 'Neonatología';
        else if (/\(fer\)/i.test(name)) esp = 'Fertilidad y Reproducción';
        else esp = 'Consultorios Externos';
    } else {
        if (/ginec/i.test(esp) && /ferti/i.test(esp)) esp = 'Fertilidad y Ginecología';
        else if (/ginec/i.test(esp) && /obstet/i.test(esp)) esp = 'Ginecología y Obstetricia';
        else if (/ginec/i.test(esp)) esp = 'Ginecología';
        else if (/traumat/i.test(esp)) esp = 'Traumatología';
        else if (/cardio/i.test(esp)) esp = 'Cardiología';
        else if (/pediatr/i.test(esp)) esp = 'Pediatría';
        else if (/ecograf/i.test(esp)) esp = 'Diagnóstico por Imágenes (Ecografía)';
        else if (/ciruj|cirug/i.test(esp)) {
            if (/pediat/i.test(esp)) esp = 'Cirugía Pediátrica';
            else if (/plast/i.test(esp)) esp = 'Cirugía Plástica';
            else esp = 'Cirugía General';
        }
    }
    esp = esp.charAt(0).toUpperCase() + esp.slice(1);
    return { displayName, specialty: esp, cleanSurnameAndName };
}

/**
 * Verifica si el Contact Center se encuentra dentro del horario de atención:
 * Lunes a Viernes de 7:30 a 21:00 hs
/**
 * Determina el estado del Contact Center y el próximo horario de apertura:
 * - Lunes a Viernes de 7:30 a 21:00 hs
 * - Sábados de 8:00 a 12:00 hs
 * Hora oficial de San Juan, Argentina (UTC-3)
 */
function getContactCenterScheduleInfo(now: Date = new Date()): {
    isOpen: boolean;
    nextOpeningText: string;
} {
    const timeStr = now.toLocaleString('en-US', { timeZone: 'America/Argentina/San_Juan' });
    const local = new Date(timeStr);
    const day = local.getDay(); // 0 = Dom, 1 = Lun, ..., 6 = Sab
    const hour = local.getHours();
    const min = local.getMinutes();
    const currentMin = hour * 60 + min;

    let isOpen = false;
    let nextOpeningText = 'el próximo día hábil a partir de las 7:30 hs';

    if (day >= 1 && day <= 5) {
        // Lunes a Viernes: 7:30 a 21:00 hs
        if (currentMin >= 450 && currentMin < 1260) {
            isOpen = true;
        } else if (currentMin < 450) {
            nextOpeningText = 'hoy a partir de las 7:30 hs';
        } else {
            // Pasadas las 21:00 hs
            if (day === 5) {
                // Viernes a la noche -> Sábado 8:00 hs
                nextOpeningText = 'mañana sábado a partir de las 8:00 hs';
            } else {
                nextOpeningText = 'mañana a partir de las 7:30 hs';
            }
        }
    } else if (day === 6) {
        // Sábado: 8:00 a 12:00 hs
        if (currentMin >= 480 && currentMin < 720) {
            isOpen = true;
        } else if (currentMin < 480) {
            nextOpeningText = 'hoy sábado a partir de las 8:00 hs';
        } else {
            // Sábado después de las 12:00 hs -> Lunes 7:30 hs
            nextOpeningText = 'el próximo lunes a partir de las 7:30 hs';
        }
    } else {
        // Domingo -> Lunes 7:30 hs
        nextOpeningText = 'el próximo lunes a partir de las 7:30 hs';
    }

    return { isOpen, nextOpeningText };
}

function isContactCenterOpen(now: Date = new Date()): boolean {
    return getContactCenterScheduleInfo(now).isOpen;
}

function getAfterHoursMessage(nextOpeningText: string): string {
    return `¡Hola! 🏥 Te informamos que en este momento nuestro equipo de atención se encuentra *fuera del horario laboral*.\n\n` +
        `⏰ *Nuestros horarios de atención son:*\n` +
        `• *Lunes a Viernes:* 7:30 a 21:00 hs\n` +
        `• *Sábados:* 8:00 a 12:00 hs\n` +
        `_(Domingos y Feriados cerrado)_\n\n` +
        `Tu mensaje quedó registrado y un asesor te responderá *${nextOpeningText}* en nuestro horario habitual.\n\n` +
        `🚨 *Guardia Médica 24 hs:* Si presentás una urgencia, recordá que nuestra Guardia en Sede Central (San Luis 432 Oeste) atiende las *24 horas*.`;
}

function getDelayWaitNoticeMessage(): string {
    return `¡Hola! 🏥 Estamos con algunas demoras en la atención debido a la alta demanda. Te pedimos disculpas por la espera.\n\n` +
        `En breve un agente estará respondiendo tu consulta por orden de llegada.\n\n` +
        `⏰ *Horarios de atención:* Lunes a Viernes de 7:30 a 21:00 hs y Sábados de 8:00 a 12:00 hs.\n\n` +
        `💡 _Si deseás volver a consultar opciones con el menú virtual, podés escribir *"Menú"* en cualquier momento._`;
}

let cachedHandoffSettings: {
    normalMessage: string;
    delayMessage: string;
    threshold: number;
    timestamp: number;
} | null = null;

let cachedInactivityTimeoutMinutes = 15;
let currentQueueCount = 0;
let lastQueueCheck = 0;

/**
 * Consulta la cantidad de conversaciones sin asignar en la cola y la configuración de avisos de demora
 */
async function refreshQueueAndHandoffConfig(supabaseClient: any): Promise<number> {
    const now = Date.now();
    // Cache de 15 segundos para no saturar la base de datos en tráfico alto
    if (now - lastQueueCheck < 15000 && cachedHandoffSettings) {
        return currentQueueCount;
    }
    lastQueueCheck = now;

    try {
        if (supabaseClient) {
            // 1. Obtener cantidad de chats sin asignar en espera
            const { count, error: countErr } = await supabaseClient
                .from('contact_center_conversations')
                .select('phone', { count: 'exact', head: true })
                .eq('status', 'sin_asignar');

            if (!countErr && typeof count === 'number') {
                currentQueueCount = count;
            }

            // 2. Obtener textos personalizados de derivación, umbral de demoras y tiempo de inactividad desde app_config
            const { data: configData, error: cfgErr } = await supabaseClient
                .from('app_config')
                .select('key, value')
                .in('key', [
                    'contact_center_handoff_normal',
                    'contact_center_handoff_delay',
                    'contact_center_delay_threshold',
                    'contact_center_inactivity_timeout_minutes'
                ]);

            if (!cfgErr && configData && configData.length > 0) {
                const map: Record<string, string> = {};
                for (const row of configData) {
                    map[row.key] = row.value;
                }
                cachedHandoffSettings = {
                    normalMessage: map['contact_center_handoff_normal'] || '',
                    delayMessage: map['contact_center_handoff_delay'] || '',
                    threshold: map['contact_center_delay_threshold'] ? parseInt(map['contact_center_delay_threshold'], 10) : 5,
                    timestamp: now
                };
                if (map['contact_center_inactivity_timeout_minutes']) {
                    const parsedTimeout = parseInt(map['contact_center_inactivity_timeout_minutes'], 10);
                    if (!isNaN(parsedTimeout) && parsedTimeout > 0) {
                        cachedInactivityTimeoutMinutes = parsedTimeout;
                    }
                }
            }
        }
    } catch (err) {
        console.warn('[queue-status] Error consultando cola sin asignar o configuración de handoff:', err);
    }

    return currentQueueCount;
}

/**
 * Mensaje institucional cuando el bot se frena y transfiere a los agentes de atención.
 * Si hay muchas conversaciones sin asignar esperando (umbral >= 5 o configurado),
 * advierte empáticamente al paciente sobre la demora.
 */
function getAgentHandoffNotice(queueCountOverride?: number): string {
    const open = isContactCenterOpen();
    if (!open) {
        return `🕒 *Fuera de horario de atención:*\nNuestro horario de Contact Center es de Lunes a Viernes de 7:30 a 21:00 hs y Sábados de 8:00 a 12:00 hs.\nTu mensaje quedó registrado y un agente te responderá al inicio del próximo día hábil.\n\n🚨 *Guardias 24 hs:* Sede 01 (San Luis 432 Oeste) activa para urgencias.`;
    }

    const count = typeof queueCountOverride === 'number' ? queueCountOverride : currentQueueCount;
    const threshold = (cachedHandoffSettings && cachedHandoffSettings.threshold > 0) ? cachedHandoffSettings.threshold : 5;

    // Si la cantidad de mensajes sin asignar supera o iguala el umbral, avisar sobre demoras
    if (count >= threshold) {
        if (cachedHandoffSettings?.delayMessage && cachedHandoffSettings.delayMessage.trim().length > 10) {
            return cachedHandoffSettings.delayMessage.replace(/\{cola\}/g, String(count));
        }
        return `⚠️ *Aviso de Demora:* En este momento estamos experimentando una alta demanda en nuestro canal de atención y presentamos algunas demoras. Un asesor te responderá a la brevedad por orden de llegada. \n⏰ *Horario de atención:* Lunes a Viernes de 7:30 a 21:00 hs y Sábados de 8:00 a 12:00 hs.\n\n💡 _Si deseás volver a consultar con el asistente virtual en cualquier momento, escribí *"Menú"*._`;
    }

    // Flujo normal sin demoras críticas
    if (cachedHandoffSettings?.normalMessage && cachedHandoffSettings.normalMessage.trim().length > 10) {
        return cachedHandoffSettings.normalMessage.replace(/\{cola\}/g, String(count));
    }
    return `👩‍⚕️ Un agente te responderá a la brevedad. \n⏰ *Horario de atención:* Lunes a Viernes de 7:30 a 21:00 hs y Sábados de 8:00 a 12:00 hs.\n\n💡 _Si deseás volver a consultar con el asistente virtual en cualquier momento, escribí *"Menú"*._`;
}

/**
 * Analiza la obra social registrada en Salus o ficha previa del paciente
 * y determina si es una cobertura real activa o un genérico/particular
 */
function getRegisteredOsInfo(osRaw?: string | null): { hasRegisteredOs: boolean; cleanOsName: string } {
    if (!osRaw) return { hasRegisteredOs: false, cleanOsName: '' };
    const trimmed = osRaw.trim();
    const lower = trimmed.toLowerCase();

    if (
        !trimmed ||
        lower === 'particular' ||
        lower === 'particular / a confirmar' ||
        lower === 'a confirmar' ||
        lower === 'a consultar' ||
        lower === 'sin obra social' ||
        lower === 'no informada' ||
        lower === 'no informado' ||
        lower === 'no' ||
        lower === 'ninguna'
    ) {
        return { hasRegisteredOs: false, cleanOsName: '' };
    }

    let clean = trimmed.replace(/^\d+\s*[-–]\s*/, '').trim();
    if (clean.toUpperCase() === 'PROVINCIA') {
        clean = 'Obra Social Provincia (OSP)';
    }

    return { hasRegisteredOs: true, cleanOsName: clean };
}

/**
 * Genera el mensaje del menú de bienvenida con las opciones institucionales principales.
 */
function getWelcomeMenuMessage(pacienteNombre?: string): string {
    const raw = (pacienteNombre || '').trim();
    let firstName = '';
    if (raw && raw !== 'Paciente' && raw !== 'Usuario' && raw !== 'WhatsApp User') {
        const clean = raw.includes(',') ? raw.split(',')[1].trim().split(' ')[0] : raw.split(' ')[0];
        if (clean && clean.length >= 2) firstName = ` *${clean}*`;
    }

    return `¡Hola${firstName}! 🏥 Te damos la bienvenida a *Sanatorio Argentino*.\n\n` +
        `¿En qué podemos ayudarte hoy? Por favor seleccioná una opción:\n\n` +
        `1️⃣ *Solicitar un nuevo turno médico* 🩺\n` +
        `2️⃣ *Consultar mi próximo turno o visita agendada* 📅\n` +
        `3️⃣ *Autorizaciones y órdenes médicas* 📋\n` +
        `4️⃣ *Guardia médica 24 horas y urgencias* 🚨\n` +
        `5️⃣ *Hablar con un agente* 👤 _(Lun a Vie 7:30 a 21 hs, Sáb 8 a 12 hs)_\n\n` +
        `Podés responder con el número (*1*, *2*, *3*, *4* o *5*) o escribirnos tu consulta.\n` +
        `💡 _Si en cualquier momento deseás volver, escribí *\"Menú\"* o *\"Atrás\"*._`;
}

/**
 * Formatea los turnos activos encontrados para mostrárselos al paciente en WhatsApp.
 */
function formatTurnosActivosReply(turnos: any[], pacienteNombre?: string, isOtherPatient: boolean = false, pacienteDni?: string): string {
    const raw = (pacienteNombre || '').trim();
    let firstName = 'Estimado/a';
    if (raw && raw !== 'Paciente') {
        firstName = raw.includes(',') ? raw.split(',')[1].trim().split(' ')[0] : raw.split(' ')[0];
    }

    if (!turnos || turnos.length === 0) {
        if (isOtherPatient) {
            return `No registramos turnos o visitas próximas agendadas para el paciente *${pacienteNombre || 'solicitado'}*${pacienteDni ? ` (DNI: *${pacienteDni}*)` : ''} en nuestro sistema.\n\n` +
                `¿Deseás que te ayudemos a *solicitar un nuevo turno médico* o preferís hablar con un agente?\n\n` +
                `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"* | 👤 *Agente:* Escribí *"Agente"*`;
        }
        return `¡Hola *${firstName}*! 🏥\n\n` +
            `No registramos turnos o visitas próximas pendientes a tu nombre en nuestro sistema.\n\n` +
            `¿Deseás que te ayudemos a *solicitar un nuevo turno médico* o preferís hablar con un agente?\n\n` +
            `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"* | 👤 *Agente:* Escribí *"Agente"*`;
    }

    const formatFechaAmigable = (fStr: string) => {
        if (!fStr) return '';
        try {
            const [y, m, d] = fStr.split('-').map(Number);
            const date = new Date(y, m - 1, d);
            const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
            const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
            return `${dias[date.getDay()]} ${d} de ${meses[date.getMonth()]}`;
        } catch {
            return fStr;
        }
    };

    let reply = isOtherPatient
        ? `¡Hola! 🏥 Encontramos la próxima cita agendada para *${pacienteNombre}*${pacienteDni ? ` (DNI: *${pacienteDni}*)` : ''} en *Sanatorio Argentino*:\n\n`
        : `¡Hola *${firstName}*! 🏥 Encontramos tu próxima cita agendada en *Sanatorio Argentino*:\n\n`;

    const turnosAMostrar = turnos.slice(0, 2);
    for (let i = 0; i < turnosAMostrar.length; i++) {
        const t = turnosAMostrar[i];
        const num = turnosAMostrar.length > 1 ? `*Turno ${i + 1}:*\n` : '';
        reply += `${num}📅 *Fecha:* ${formatFechaAmigable(t.fecha)}\n`;
        reply += `⏰ *Horario:* ${t.hora} hs\n`;
        reply += `🩺 *Especialidad:* ${t.especialidad || t.tipo_visita || 'Consulta Médica'}\n`;
        reply += `👨‍⚕️ *Profesional:* ${t.medico || 'Profesional Asignado'}\n`;
        if (t.obra_social && t.obra_social !== 'Particular / A confirmar') {
            reply += `📋 *Cobertura:* ${t.obra_social}\n`;
        }
        reply += `\n`;
    }

    reply += `ℹ️ *Recomendación:* Recordar presentarse 15 minutos antes con el DNI físico y credencial de la obra social o cobertura médica.\n\n`;
    reply += `¿Deseás *confirmar la asistencia*, *reprogramar* o *cancelar* algún turno?\n\n`;
    reply += isOtherPatient
        ? `💡 *¿Deseás averiguar sobre el turno de otro paciente?* Podés escribir directamente su número de DNI.`
        : `💡 *¿Consultás por el turno de otro paciente o familiar?* Indícanos su número de *DNI*.`;
    reply += `\n\n🔙 *Volver:* Escribí *"Menú"* o *"Atrás"* | 👤 *Agente:* Escribí *"Agente"*`;

    return reply;
}

let cachedChatbotConfig: {
    systemPrompt: string;
    model: string;
    temperature: number;
    botName: string;
    timestamp: number;
} | null = null;

async function getDynamicChatbotConfig(supabaseClient: any): Promise<{
    systemPrompt: string;
    model: string;
    temperature: number;
    botName: string;
}> {
    const now = Date.now();
    // Cache de 30 segundos en memoria para máxima velocidad sin sobrecargar la base de datos
    if (cachedChatbotConfig && (now - cachedChatbotConfig.timestamp < 30000)) {
        return cachedChatbotConfig;
    }

    try {
        if (supabaseClient) {
            const { data, error } = await supabaseClient
                .from('app_config')
                .select('key, value')
                .in('key', [
                    'contact_center_system_prompt',
                    'contact_center_ai_model',
                    'contact_center_ai_temperature',
                    'contact_center_bot_name'
                ]);

            if (!error && data && data.length > 0) {
                const map: Record<string, string> = {};
                for (const row of data) {
                    map[row.key] = row.value;
                }
                const resolved = {
                    systemPrompt: map['contact_center_system_prompt'] || '',
                    model: map['contact_center_ai_model'] || 'gpt-4o',
                    temperature: map['contact_center_ai_temperature'] ? parseFloat(map['contact_center_ai_temperature']) : 0.3,
                    botName: map['contact_center_bot_name'] || 'Dora',
                    timestamp: now
                };
                cachedChatbotConfig = resolved;
                return resolved;
            }
        }
    } catch (err) {
        console.warn('[chatbot-config] Error obteniendo configuración dinámica desde app_config:', err);
    }

    return {
        systemPrompt: '',
        model: 'gpt-4o',
        temperature: 0.3,
        botName: 'Dora'
    };
}

/**
 * Motor Conversacional Inteligente para WhatsApp potenciado por ChatGPT (OpenAI GPT-4o).
 * Permite mantener conversaciones fluidas, empáticas y naturales, responder consultas institucionales
 * y transferir de inmediato al equipo humano si el paciente lo solicita o se frustra con el bot.
 */
async function generateChatGptConversationalResponse(
    userText: string,
    context?: ConversationContext,
    patientInfo?: {
        fullName: string;
        phone: string;
        isExistingPatient: boolean;
        dni: string | null;
        obraSocial: string | null;
    },
    supabaseClient?: any
): Promise<{
    replyText: string;
    intent: string;
    transferToAgent: boolean;
    summary: string | null;
}> {
    const openAiKey = Deno.env.get('OPENAI_API_KEY');
    const pName = patientInfo?.fullName || 'Paciente';
    const pDni = patientInfo?.dni || 'No informado';
    const pOs = patientInfo?.obraSocial || 'A confirmar';

    if (!openAiKey) {
        console.warn('[conversational-bot] OPENAI_API_KEY no configurada');
        return {
            replyText: getWelcomeMenuMessage(pName),
            intent: 'general',
            transferToAgent: false,
            summary: 'Consulta general'
        };
    }

    try {
        const thread = (context?.history || []).slice(-8).map((m: any) => {
            const role = m.direction === 'incoming' 
                ? (pName || 'Paciente') 
                : (m.sender_name === 'Bot Sanatorio' || m.raw_payload?.bot ? 'Asistente_Virtual' : `Agente_Humano (${m.sender_name || 'Agente'})`);
            return `${role}: ${m.content}`;
        }).join('\n');

        const turnosContextStr = (context?.turnosActivosProximos && context.turnosActivosProximos.length > 0)
            ? `\nTURNOS PRÓXIMOS AGENDADOS DEL PACIENTE EN EL SANATORIO:\n` +
              context.turnosActivosProximos.map((t, idx) => 
                `${idx + 1}. Fecha: ${t.fecha} | Hora: ${t.hora} hs | Profesional: ${t.medico} | Especialidad: ${t.especialidad} | Cobertura: ${t.obra_social}`
              ).join('\n') + `\n(Si el paciente consulta sobre su cita o detalles de su turno, bríndale esta información de forma cálida, clara y completa).\n`
            : '';

        // Obtener configuración dinámica (System Prompt editable desde el Contact Center)
        const dynamicConfig = await getDynamicChatbotConfig(supabaseClient);

        let finalSystemPrompt = '';
        if (dynamicConfig.systemPrompt && dynamicConfig.systemPrompt.trim().length > 20) {
            finalSystemPrompt = dynamicConfig.systemPrompt
                .replace(/\{nombre\}/g, pName)
                .replace(/\{dni\}/g, pDni)
                .replace(/\{cobertura\}/g, pOs)
                .replace(/\{turnos\}/g, turnosContextStr)
                .replace(/\{bot_name\}|\{nombre_bot\}|\{asistente\}/gi, dynamicConfig.botName || 'Dora');

            if (!dynamicConfig.systemPrompt.includes('{nombre}') && !dynamicConfig.systemPrompt.includes(pName)) {
                finalSystemPrompt += `\n\nDATOS DEL PACIENTE ACTUAL:\n- Nombre: ${pName}\n- DNI: ${pDni}\n- Cobertura: ${pOs}\n${turnosContextStr}`;
            }

            if (!finalSystemPrompt.includes('"replyText"') || !finalSystemPrompt.includes('"transferToAgent"')) {
                finalSystemPrompt += `\n\nDevuelve OBLIGATORIAMENTE un JSON con esta estructura exacta:\n{\n  "replyText": "Texto de la respuesta en WhatsApp...",\n  "intent": "derivacion_agente | turno | autorizacion | guardia | chequeo | informes | agradecimiento | general",\n  "transferToAgent": boolean,\n  "summary": "Resumen breve de la consulta en 1 línea para el equipo"\n}`;
            }
        } else {
            finalSystemPrompt = `Eres el Asistente Virtual Inteligente oficial de Sanatorio Argentino (San Juan, Argentina), una prestigiosa institución de salud fundada en 1957.
Tu misión es mantener una conversación natural, cálida, empática, ágil y resolutiva con los pacientes a través de WhatsApp.

DATOS DEL PACIENTE:
- Nombre: ${pName}
- DNI: ${pDni}
- Cobertura / Obra Social: ${pOs}
${turnosContextStr}
DIRECTIVAS PRINCIPALES:
1. TONO: Cercano, humano, cordial, respetuoso y profesional (español argentino rioplatense educado: "¡Hola ${pName.split(' ')[0]}!", "te comento", "contanos").
2. CONVERSACIONAL REAL: Responde de forma directa, útil e inteligente al mensaje del paciente.
3. CONSULTA DE TURNOS EXISTENTES:
   - Si el paciente pregunta por un turno ya agendado y NO tenemos su DNI, pídeselo amablemente ("Por favor indícanos el número de DNI del paciente, sin puntos ni espacios").
   - Si ya figuran turnos en sus datos arriba, confírmale los detalles (día, hora, profesional, sede).
4. PEDIDO DE AGENTE O HORARIOS DE ATENCIÓN (MÁXIMA PRIORIDAD):
   - Horario de atención de agentes (Contact Center): Lunes a Viernes de 7:30 a 21:00 hs y Sábados de 8:00 a 12:00 hs.
   - Guardias 24 hs: Sede 01 (San Luis 432 Oeste) activa para urgencias.
   - Si el paciente pide que lo atienda una persona, un agente, un operador, o manifiesta que el bot no le sirve o no comprende:
     - Confirma con calidez y amabilidad que lo estás comunicando con un agente del equipo de atención e informa el horario de atención.
     - Establece obligatoriamente "transferToAgent": true y "intent": "derivacion_agente".
5. SOLICITUD DE NUEVOS TURNOS MÉDICOS:
   - Para agendar un nuevo turno, consulta qué especialidad o profesional busca, su cobertura/obra social y su preferencia horaria.
   - Si es para un hijo o familiar, solicita el Nombre y DNI del paciente a atender.
6. INFORMACIÓN INSTITUCIONAL VERÍDICA:
   - Sede San Luis (San Luis 432 Oeste, Capital): Maternidad, Quirófanos, Internación, Consultorios externos, Guardias Médicas 24 horas (Clínica médica adultos, Pediatría 24hs activa, Ginecología/Obstetricia, Cardiología). Por orden de llegada con triage de urgencia.
   - Sede Santa Fe (Santa Fe 263 Este, Capital): Consultorios externos, Vacunatorio, Chequeo Preventivo de Salud, Programa Prevenir (OSP), Diagnóstico por Imágenes (Ecografía, Rayos, Tomografía, Resonancia, Mamografía), Kinesiología.
   - Laboratorio: Resultados online en la web oficial con usuario y contraseña entregados en la extracción.
   - Obras Sociales: Atendemos OSP, OSDE, Swiss Medical, Galeno, Medifé, Jerárquicos y la gran mayoría de prepagas y obras sociales, y atención Particular.
7. VOLVER ATRÁS O MENÚ PRINCIPAL:
   - Si el paciente manifiesta que se equivocó, desea cambiar de opción o volver, o si le das opciones informativas, recuérdale que puede escribir "Menú" o "Atrás" para regresar al inicio.
8. FORMATO: Breve y claro, optimizado para lectura en WhatsApp (máximo 2 párrafos cortos, uso de *negrita* para resaltar datos clave, emojis médicos sobrios 🏥 🩺). Al final de respuestas orientativas puedes agregar: "\n\n🔙 *Volver:* Escribí *\"Menú\"* | 👤 *Agente:* Escribí *\"Agente\"*".
9. AUDIOS Y NOTAS DE VOZ:
   - Los mensajes de voz de los pacientes son transcriptos automáticamente por el sistema de IA y recibes su contenido en texto.
   - NUNCA digas que no puedes escuchar o procesar audios ni le pidas al paciente que escriba por texto en lugar de enviar audios. Atiende su consulta con total naturalidad como si fuera un mensaje de texto.
10. IMÁGENES Y AUTORIZACIÓN DE ÓRDENES MÉDICAS:
   - Si un paciente envió previamente una imagen o documento, NUNCA asumas automáticamente que corresponde a una orden médica a autorizar (pudo haber sido su DNI, credencial, comprobante o foto personal).
   - Si el paciente solicita autorizar una orden médica:
     - Solicita DNI, Nombre y Apellido del titular de la orden, y Obra Social/Prepaga y Plan.
     - Pide explícitamente la foto clara y legible de la orden médica a autorizar: "📸 Envianos la foto clara y legible de la orden médica que deseás autorizar (si la imagen que enviaste anteriormente corresponde a esta orden médica, confirmánoslo escribiendo 'es la foto anterior'; si era de otro trámite o documento, por favor adjuntá aquí la foto de la orden a autorizar)".
     - Recuerda que la vigencia de las órdenes médicas es de 30 días corridos.
11. DESAMBIGUACIÓN DE MÉDICOS HOMÓNIMOS:
   - Si el paciente menciona a un médico solo por su apellido (ej: "dr buteler", "dra gonzalez") y existen múltiples profesionales con ese apellido en la institución, NUNCA asumas arbitrariamente uno ni descartes profesionales por género ("dr" es usado genéricamente por los pacientes).
   - El bot debe preguntar de forma clara y ordenada con opciones con viñeta de letra minúscula (a-, b-...):
     "Por favor, ¿qué doctor/a [Apellido]?"
     "*a-* [Apellido Nombre] ([Especialidad])"
     "*b-* [Apellido Nombre] ([Especialidad])"
     "Podés responder con la letra (*a*, *b*...) o escribir el nombre."
12. DISTINCIÓN OBLIGATORIA ENTRE DNI Y FECHA DE NACIMIENTO:
   - NUNCA confundas una fecha de nacimiento (DD/MM/AAAA, ej: 04/07/2002 o 04072002) con un número de DNI.
   - Los DNI argentinos tienen 7 u 8 dígitos y NUNCA comienzan con 0 (rango 1.000.000 a 65.000.000).
   - Si el paciente en un mensaje posterior envía sus datos personales de admisión (ej: "Ramiro Javier Gutiérrez\n04/07/2002\nDepartamento rawson"), la fecha 04/07/2002 es su fecha de nacimiento y NUNCA debe sobreescribir ni sustituir el DNI ya informado en el mensaje anterior.

Devuelve OBLIGATORIAMENTE un JSON con esta estructura exacta:
{
  "replyText": "Texto de la respuesta en WhatsApp...",
  "intent": "derivacion_agente | turno | autorizacion | guardia | chequeo | informes | agradecimiento | general",
  "transferToAgent": boolean,
  "summary": "Resumen breve de la consulta en 1 línea para el equipo"
}`;
        }

        const selectedModel = dynamicConfig.model || 'gpt-5.5';
        const selectedTemp = Number.isFinite(dynamicConfig.temperature) ? dynamicConfig.temperature : 0.3;
        const isGpt5Series = selectedModel.startsWith('gpt-5');
        const isReasoningModel = selectedModel.startsWith('o1') || selectedModel.startsWith('o3') || selectedModel.startsWith('o4');

        console.log(`[conversational-bot] Invocando OpenAI con System Prompt dinámico (Modelo: ${selectedModel}, Temp: ${selectedTemp}, Caracteres: ${finalSystemPrompt.length})`);

        const requestPayload: any = {
            model: selectedModel,
            response_format: { type: 'json_object' },
            messages: [
                { role: isReasoningModel ? 'developer' : 'system', content: finalSystemPrompt },
                { role: 'user', content: `Historial de la conversación reciente:\n${thread || '(Sin mensajes previos)'}\n\nÚltimo mensaje recibido del paciente:\n"${userText}"` }
            ]
        };

        if (isGpt5Series || isReasoningModel) {
            requestPayload.max_completion_tokens = 600;
            if (!isReasoningModel && !selectedModel.includes('5.5') && !selectedModel.includes('5.4')) {
                requestPayload.temperature = selectedTemp;
            }
        } else {
            requestPayload.temperature = selectedTemp;
            requestPayload.max_tokens = 450;
        }

        const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openAiKey}`
            },
            body: JSON.stringify(requestPayload)
        });

        if (aiRes.ok) {
            const aiData = await aiRes.json();
            const content = aiData.choices?.[0]?.message?.content || '{}';
            const parsed = JSON.parse(content);
            return {
                replyText: parsed.replyText || `¡Hola *${pName}*! 🏥 ¿En qué podemos ayudarte hoy?`,
                intent: parsed.intent || 'general',
                transferToAgent: Boolean(parsed.transferToAgent),
                summary: parsed.summary || null
            };
        } else {
            console.error('[conversational-bot] Error en respuesta de OpenAI:', await aiRes.text());
        }
    } catch (err: any) {
        console.error('[conversational-bot] Excepción llamando a OpenAI:', err?.message || err);
    }

    // Fallback defensivo
    const isHumanRequest = /\b(persona|humano|agente|asesor|asesora|operador|operadora|alguien)\b/i.test(userText);
    if (isHumanRequest) {
        return {
            replyText: `¡Hola *${pName}*! 🏥 Te pido sinceras disculpas por la molestia.\n\nYa mismo te comunico con un agente de nuestro equipo de atención para que continúe asistiéndote personalmente.\n\n📌 *Por favor aguardá unos instantes.*`,
            intent: 'derivacion_agente',
            transferToAgent: true,
            summary: 'Solicitud de atención humana'
        };
    }

    return {
        replyText: `¡Hola *${pName}*! 🏥 ¿En qué podemos orientarte hoy en *Sanatorio Argentino*? Podés consultarnos por turnos, autorizaciones, guardias 24hs o pedir hablar con un agente.`,
        intent: 'general',
        transferToAgent: false,
        summary: 'Consulta general'
    };
}

async function detectIntentAndEntities(supabase: any, text: string, context?: ConversationContext): Promise<IntentDetectionResult> {
    const clean = text.toLowerCase().trim();

    // 0.0a SALUDO INICIAL (con guarda de flujo activo para no resetear)
    const isPureGreeting = /^(hola|buenas|buen\s+d[ií]a|buenas\s+tardes|buenas\s+noches|hola\s+buenas|buenas\s+como\s+va|hola\s+como\s+estas|hola\s+buen\s+dia|iniciar|comenzar)[!.\s]*$/i.test(clean);
    const isInActiveFlow = 
        context?.botStage === 'esperando_datos_turno' ||
        context?.botStage === 'esperando_dni_turno' ||
        context?.botStage === 'esperando_obra_social_paciente' ||
        context?.botStage === 'esperando_seleccion_medico' ||
        context?.botStage === 'esperando_orden_foto' ||
        context?.botStage === 'esperando_datos_nuevo';

    if (isPureGreeting) {
        if (isInActiveFlow) {
            return { intent: 'saludo_en_flujo', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
        }
        return { intent: 'saludo_inicial', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 0.0a-bis GESTIÓN DE TURNOS (CANCELAR / REPROGRAMAR)
    // Se evalúa ANTES de "volver" porque la palabra "cancelar" también figura como sinónimo de volver al menú.
    {
        const stage = context?.botStage || '';
        const enGestionTurno = GESTION_TURNO_STAGES.has(stage);
        const esVolverExplicito = /\b(volver|atr[aá]s|atrs|regresar|men[uú]|inicio|reiniciar|salir)\b/i.test(clean);
        const pideAgente = /\b(agente|asesor|asesora|operador|operadora|persona|humano)\b/i.test(clean);
        const turnoCtx = enGestionTurno ||
            stage === 'turno_consultado' ||
            stage === 'esperando_confirmacion_turno' ||
            /pr[oó]xima cita|turnos pr[oó]ximos|turno online agendado|reprogramar\* o \*cancelar/i.test(context?.lastBotMessage?.content || '');
        const mencionaTurno = /\b(turno|turnos|cita|citas|consulta|visita|estudio|pr[aá]ctica)\b/i.test(clean);
        const reprogFuerte = /\b(reprogram\w*|re\s*programar|cambiar\s+(?:el\s+|mi\s+|la\s+|de\s+)?(?:turno|cita)|mover\s+(?:el\s+|mi\s+)?(?:turno|cita)|pasar\s+(?:el\s+|mi\s+)(?:turno|cita)|postergar\s+(?:el\s+|mi\s+)?(?:turno|cita))\b/i.test(clean);
        const reprogDebil = /\b(cambiar|posponer|postergar|otro\s+d[ií]a|otra\s+fecha|otro\s+horario)\b/i.test(clean);
        const verboCancelar = /\b(cancel\w*|anul\w*|dar\s+de\s+baja|darlo\s+de\s+baja|suspender)\b/i.test(clean);
        const noAsistire = /\bno\s+(?:voy\s+a\s+poder|puedo|podr[eé]|vamos\s+a\s+poder|podemos)\s+(?:ir|asistir|concurrir|llegar)\b/i.test(clean) || /\bno\s+voy\s+a\s+(?:ir|asistir)\b/i.test(clean);
        const R = (intent: IntentDetectionResult['intent']): IntentDetectionResult => ({ intent, doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null });

        if (enGestionTurno && !esVolverExplicito && !pideAgente) {
            if (stage === 'esperando_preferencia_reprogramacion' || stage === 'esperando_profesional_reprogramacion') {
                // La respuesta libre ("otro día por la tarde") es la preferencia: solo se cambia de acción si pide cancelar explícitamente
                return R(verboCancelar ? 'cancelar_turno_online' : 'gestion_turno_flujo');
            }
            if (stage === 'esperando_confirmacion_cancelacion') {
                return R((reprogFuerte || reprogDebil) ? 'reprogramar_turno_online' : 'gestion_turno_flujo');
            }
            if (reprogFuerte) return R('reprogramar_turno_online');
            if (verboCancelar) return R('cancelar_turno_online');
            return R('gestion_turno_flujo');
        }

        if (!enGestionTurno && !esVolverExplicito) {
            if (reprogFuerte && (mencionaTurno || turnoCtx || /\breprogram/i.test(clean))) return R('reprogramar_turno_online');
            if ((verboCancelar || noAsistire) && (mencionaTurno || turnoCtx || /\b(lo\s+quiero|quiero|deseo|necesito|para)\s+cancel\w*/i.test(clean) || stage === 'esperando_datos_turno')) return R('cancelar_turno_online');
            if (reprogDebil && turnoCtx) return R('reprogramar_turno_online');
        }
    }

    // 0.0b VOLVER ATRÁS / MENÚ PRINCIPAL / REINICIO DE GESTIÓN
    if (isNavigationBackOrMenu(clean)) {
        return { intent: 'volver_atras', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 0.1 CORTESÍA / AGRADECIMIENTO EN BASE AL CONTEXTO PREVIO
    const isGratitude = /^(muchas\s+gracias|gracias|much[ií]simas\s+gracias|dale\s+gracias|perfecto\s+gracias|genial\s+gracias|buen[ií]simo|ok\s+gracias|chau|listo\s+gracias|muy\s+amable|graciass)[!.\s]*$/i.test(clean);
    if (isGratitude && context?.history && context.history.length > 0) {
        return { intent: 'agradecimiento_cierre', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 0.2 ACCIÓN DIRECTA SOBRE TURNO ONLINE (SI EL BOT O ASESOR PREGUNTÓ O EXISTE TURNO)
    const lastBotContent = (context?.lastBotMessage?.content || '').toLowerCase();
    const isBotAskingAboutTurnoOnline = lastBotContent.includes('turno online agendado') || lastBotContent.includes('deseás confirmar') || /albacar/i.test(lastBotContent);

    if (isBotAskingAboutTurnoOnline || context?.turnoOnlineProximo) {
        if (/^(si|sí|confirmar|confirmo|si\s*confirmo|por\s+favor\s+confirmo|dale\s+confirmo|voy\s+a\s+ir|confirmamelo|ok\s+confirmo|si\s+voy|confirmado)[!.\s]*$/i.test(clean)) {
            return { intent: 'confirmar_turno_online', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
        }
        if (/\b(cancelar|cancelo|no\s+voy\s+a\s+poder|anular|dar\s+de\s+baja|no\s+puedo\s+ir|cancela\s+el\s+turno)\b/i.test(clean)) {
            return { intent: 'cancelar_turno_online', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
        }
        if (/\b(reprogramar|cambiar|otro\s+dia|otro\s+horario|otra\s+fecha|reprogramamelo)\b/i.test(clean)) {
            return { intent: 'reprogramar_turno_online', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
        }
    }

    // 0.3 SEGUIMIENTO DE CASO CON ASESOR HUMANO (SI EL ASESOR PIDIÓ DOCUMENTACIÓN O PREGUNTÓ ALGO)
    if (context?.hasAgentIntervened && context?.lastAgentMessage) {
        const lastAgentText = (context.lastAgentMessage.content || '').toLowerCase();
        if ((lastAgentText.includes('orden') || lastAgentText.includes('foto') || lastAgentText.includes('estudio') || lastAgentText.includes('dni')) &&
            /\b(te\s+mando|te\s+paso|aca\s+esta|adjunto|foto|orden|comprobante|mando|paso)\b/i.test(clean)) {
            return { intent: 'seguimiento_asesor', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
        }
    }

    // 0.4 DETECCIÓN POR OPCIÓN DIRECTA DEL MENÚ HISTÓRICO (LETRAS A..M o NÚMEROS 1..4)
    if (/^[a|a️⃣]$/i.test(clean) || /^opci[oó]n\s*a$/i.test(clean)) {
        return { intent: 'informes_general', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: 'A' };
    }
    if (/^[b|b️⃣]$/i.test(clean) || /^opci[oó]n\s*b$/i.test(clean)) {
        return { intent: 'curso_embarazadas', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: 'B' };
    }
    if (/^[c|c️⃣]$/i.test(clean) || /^opci[oó]n\s*c$/i.test(clean)) {
        return { intent: 'vacunatorio', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: 'C' };
    }
    if (/^[d|d️⃣]$/i.test(clean) || /^opci[oó]n\s*d$/i.test(clean)) {
        return { intent: 'registro_civil', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: 'D' };
    }
    if (/^[e|e️⃣]$/i.test(clean) || /^opci[oó]n\s*e$/i.test(clean)) {
        return { intent: 'administracion_presupuestos', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: 'E' };
    }
    if (/^[f|f️⃣]$/i.test(clean) || /^opci[oó]n\s*f$/i.test(clean)) {
        return { intent: 'horarios_sedes', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: 'F' };
    }
    if (/^[g|g️⃣]$/i.test(clean) || /^opci[oó]n\s*g$/i.test(clean)) {
        return { intent: 'telefonos_sedes', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: 'G' };
    }
    if (/^[h|h️⃣]$/i.test(clean) || /^opci[oó]n\s*h$/i.test(clean)) {
        return { intent: 'reclamos_calidad', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: 'H' };
    }
    if (/^[i|i️⃣]$/i.test(clean) || /^opci[oó]n\s*i$/i.test(clean)) {
        return { intent: 'chequeo', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: 'I' };
    }
    if (/^[j|j️⃣]$/i.test(clean) || /^opci[oó]n\s*j$/i.test(clean)) {
        return { intent: 'servicio_laboratorio', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: 'J' };
    }
    if (/^[k|k️⃣]$/i.test(clean) || /^opci[oó]n\s*k$/i.test(clean)) {
        return { intent: 'fundacion', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: 'K' };
    }
    if (/^[l|l️⃣]$/i.test(clean) || /^opci[oó]n\s*l$/i.test(clean)) {
        return { intent: 'turno', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: 'L' };
    }
    const isWaitingForUserData = 
        context?.botStage === 'esperando_datos_turno' ||
        context?.botStage === 'esperando_dni_turno' ||
        context?.botStage === 'esperando_dni' ||
        context?.botStage === 'esperando_datos_nuevo' ||
        context?.botStage === 'esperando_orden_foto';

    // GUARDA ESTRICTA DE CONTEXTO: Si el bot está esperando datos específicos del paciente,
    // los dígitos aislados NO deben disparar opciones del menú principal.
    const isLastBotWelcomeMenu = 
        !isWaitingForUserData && (
            context?.botStage === 'menu_bienvenida' ||
            context?.botStage === 'inicio' ||
            (!context?.botStage && (lastBotContent.includes('consultar mi próximo turno') || lastBotContent.includes('en qué podemos ayudarte hoy')))
        );

    const isLastBotImageMenu = !isWaitingForUserData && (lastBotContent.includes('recibimos tu imagen') || lastBotContent.includes('presupuesto o aranceles particulares'));
    const isLastBotGreetingMenu = 
        !isWaitingForUserData && (
            context?.botStage === 'menu_opciones' ||
            lastBotContent.includes('otro paciente / familiar') || 
            lastBotContent.includes('el turno o autorización es para mí') ||
            lastBotContent.includes('¿el trámite es para vos') ||
            lastBotContent.includes('estás gestionando para otro paciente')
        );

    if (!isWaitingForUserData) {
        if (/^[1|1️⃣]$/.test(clean) || /^opci[oó]n\s*1$/i.test(clean)) {
            if (isLastBotWelcomeMenu) {
                return { intent: 'turno', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: '1' };
            }
            if (isLastBotGreetingMenu) {
                return { intent: 'gestion_propia', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: '1' };
            }
            if (isLastBotImageMenu) {
                return { intent: 'turno', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: '1' };
            }
            return { intent: 'turno', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: '1' };
        }
        if (/^[2|2️⃣]$/.test(clean) || /^opci[oó]n\s*2$/i.test(clean)) {
            if (isLastBotWelcomeMenu) {
                return { intent: 'consultar_turno', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: '2' };
            }
            if (isLastBotGreetingMenu) {
                return { intent: 'gestion_familiar', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: '2' };
            }
            if (isLastBotImageMenu) {
                return { intent: 'autorizacion', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: '2' };
            }
            return { intent: 'general', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: '2' };
        }
        if (/^[3|3️⃣]$/.test(clean) || /^opci[oó]n\s*3$/i.test(clean)) {
            if (isLastBotWelcomeMenu) {
                return { intent: 'autorizacion', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: '3' };
            }
            if (isLastBotImageMenu) {
                return { intent: 'administracion_presupuestos', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: '3' };
            }
            return { intent: 'general', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: '3' };
        }
        if (/^[4|4️⃣]$/.test(clean) || /^opci[oó]n\s*4$/i.test(clean)) {
            if (isLastBotWelcomeMenu) {
                return { intent: 'guardia', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: '4' };
            }
            if (isLastBotImageMenu) {
                return { intent: 'derivacion_agente', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: '4' };
            }
            return { intent: 'general', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: '4' };
        }
        if (/^[5|5️⃣]$/.test(clean) || /^opci[oó]n\s*5$/i.test(clean) || /^[0|0️⃣]$/.test(clean) || /^opci[oó]n\s*0$/i.test(clean)) {
            return { intent: 'derivacion_agente', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: clean.includes('0') ? '0' : '5' };
        }
    }

    // 0.4 RECONOCER INTENCIÓN EXPLÍCITA DE NUEVO TURNO (PARA NO CONFUNDIR CON CONSULTA DE TURNO EXISTENTE)
    const isExplicitNewTurnoPhrases = 
        /\b(nuevo\s+turno|turno\s+nuevo|otra\s+cita|cita\s+nueva)\b/i.test(clean) ||
        /\b(sacar|pedir|solicitar|agendar|conseguir|darme|sacarme|reservar)\s+(?:un\s+|el\s+)?(?:nuevo\s+)?(?:turno|cita)\b/i.test(clean) ||
        /\b(?:quiero|quisiera|necesito|podr[ií]a|podr[ií]as|deseo)\s+(?:sacar|pedir|solicitar|agendar|reservar)\s+(?:un\s+|el\s+)?(?:nuevo\s+)?(?:turno|cita)\b/i.test(clean) ||
        /\b(?:quiero|quisiera|necesito|deseo)\s+(?:un\s+)?(?:turno\s+nuevo|nuevo\s+turno)\b/i.test(clean);

    // 0.5 CONSULTAR TURNO O VISITA PRÓXIMA POR TEXTO LIBRE (PROPIO O DE OTRO PACIENTE)
    const isConsultarTurno = !isExplicitNewTurnoPhrases && (
        // 1. Preguntar si tiene turno o cita agendada (propio o en general)
        /\b(?:tengo|ten[ií]a|hay)\s+(?:un\s+|el\s+|alg[uú]n\s+|mis?\s+)?turnos?\b/i.test(clean) ||
        /\b(?:turnos?|citas?|visitas?)\s+(?:pr[oó]xim[oa]s?|agendad[oa]s?|pendientes?)\b/i.test(clean) ||
        /\bpr[oó]xim[oa]s?\s+(?:turnos?|citas?|visitas?)\b/i.test(clean) ||
        /\bmis\s+(?:turnos?|citas?|visitas?)\b/i.test(clean) ||
        /\bturnos?\s+(?:a\s+mi\s+nombre|para\s+m[ií])\b/i.test(clean) ||
        // 2. Olvido de fecha/hora o pregunta por cuándo era
        /\b(?:me\s+)?olvid[eé]\s+(?:cu[aá]ndo|qu[eé]\s+d[ií]a|a\s+qu[eé]\s+hora|la\s+fecha|el\s+horario|de\s+mi\s+turno|cuando)\b/i.test(clean) ||
        /\b(?:no\s+recuerdo|no\s+me\s+acuerdo)\s+(?:cu[aá]ndo|qu[eé]\s+d[ií]a|a\s+qu[eé]\s+hora|la\s+fecha|el\s+horario|si\s+tengo)\b/i.test(clean) ||
        /\b(?:cu[aá]ndo|qu[eé]\s+d[ií]a|a\s+qu[eé]\s+hora)\s+(?:es|era|ten[ií]a|tengo|qued[oó])\s+(?:el\s+|mi\s+|el\s+d[ií]a\s+de\s+|el\s+horario\s+de\s+)?(?:mi\s+)?(?:turnos?|citas?)\b/i.test(clean) ||
        // 3. Verbos de consulta + turno/cita
        /\b(consultar|averiguar|ver|saber|recordar|buscar|revisar|fijarte|fijarse|conocer|informaci[oó]n|acordar|acordarme|preguntar)\s+(?:por\s+|sobre\s+)?(?:el\s+|un\s+|mi\s+|los?\s+|mis\s+)?(?:turnos?|citas?|visitas?)\b/i.test(clean) ||
        /\b(?:necesito|quiero|quisiera|podr[ií]a|podr[ií]as)\s+(?:consultar|averiguar|saber|ver|preguntar|buscar|recordar)\s+(?:por\s+|sobre\s+)?(?:el\s+|un\s+|mi\s+|los?\s+|mis\s+)?(?:turnos?|citas?|visitas?)\b/i.test(clean) ||
        // 4. Turnos de terceros o familiares
        /\b(?:turnos?|citas?|visitas?)\s+(?:de|para|sobre)\s+(?:otro\s+paciente|otra\s+persona|un\s+paciente|familiar|familiares|mi\s+hijo|mi\s+hija|mi\s+mama|mi\s+mamá|mi\s+papa|mi\s+papá|mi\s+madre|mi\s+padre|alguien\s+m[aá]s)\b/i.test(clean) ||
        /\b(?:averiguar|consultar|saber)\s+(?:sobre\s+)?turnos?\s+de\s+(?:otros?\s+pacientes?|otra\s+persona)\b/i.test(clean) ||
        // 5. Expresiones directas
        /\b(consultar\s+turno|averiguar\s+turno|ver\s+turno|saber\s+turno|turno\s+agendado|visita\s+agendada)\b/i.test(clean)
    );
    if (isConsultarTurno) {
        return { intent: 'consultar_turno', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }


    // 1. GUARDIAS MÉDICAS 24 HORAS
    const isGuardia = /\b(guardia|guardias|urgencia|urgencias|emergencia|emergencias|medico\s+de\s+guardia|pediatra\s+de\s+guardia|clinico\s+de\s+guardia)\b/i.test(clean);
    if (isGuardia) {
        return { intent: 'guardia', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 2. CHEQUEO PREVENTIVO DE SALUD
    const isChequeo = /\b(chequeo|chequeos|chequeo\s+preventivo|circuito\s+preventivo|chequeo\s+de\s+salud|control\s+anual|chequeo\s+anual|estudios\s+preventivos)\b/i.test(clean);
    if (isChequeo) {
        return { intent: 'chequeo', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 3. PROGRAMA PREVENIR (OSP)
    const isPrevenir = /\b(programa\s+prevenir|prevenir|el\s+prevenir|turno\s+(?:para\s+)?prevenir|hacerme\s+(?:el\s+)?prevenir|sacar\s+(?:el\s+)?prevenir|estudios?\s+(?:de\s+|del\s+)?prevenir)\b/i.test(clean);
    if (isPrevenir) {
        return { intent: 'prevenir', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 4. INFORMES Y RESULTADOS DE ESTUDIOS
    const isInfLab = /\b(resultados?\s+(?:de\s+)?(?:los\s+|mis\s+|el\s+)?(?:analisis|laboratorio|sangre|orina)|ver\s+(?:mis\s+|los\s+)?(?:analisis|laboratorio)|portal\s+laboratorio|clave\s+laboratorio|informes?\s+(?:de\s+)?(?:laboratorio|analisis))\b/i.test(clean);
    if (isInfLab) {
        return { intent: 'informes_laboratorio', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    const isInfImg = /\b(resultados?\s+(?:de\s+)?(?:la\s+|el\s+|mis\s+|las\s+)?(?:ecografia|resonancia|radiografia|tomografia|mamografia|imagenes|estudios?)|ver\s+(?:mi\s+|mis\s+)?(?:ecografia|resonancia|radiografia|tomografia|mamografia|estudio)|portal\s+imagenes|informes?\s+(?:de\s+)?(?:imagenes|diagnostico\s+por\s+imagen))\b/i.test(clean);
    if (isInfImg) {
        return { intent: 'informes_imagenes', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    const isInfPap = /\b(biopsia|biopsias|pap\b|papanicolau|citologia|resultado\s+(?:de\s+)?(?:la\s+)?biopsia|resultado\s+(?:del\s+)?pap)\b/i.test(clean);
    if (isInfPap) {
        return { intent: 'informes_biopsia_pap', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    const isInfGen = /\b(solicitar\s+informes?|mis\s+informes?|mis\s+estudios?|resultados?\s+de\s+estudios?|entrega\s+de\s+informes?)\b/i.test(clean);
    if (isInfGen) {
        return { intent: 'informes_general', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 5. ATENCIÓN Y EXTRACCIÓN DE LABORATORIO (IR A HACERSE LOS ANÁLISIS)
    const isServicioLab = /\b(hacerme\s+(?:un\s+|el\s+)?(?:analisis|laboratorio|estudio\s+de\s+sangre)|sacar\s+sangre|extraccion(?:es)?|ayuno\s+(?:para\s+)?analisis|horario\s+(?:de\s+)?laboratorio|guardia\s+de\s+laboratorio)\b/i.test(clean);
    if (isServicioLab) {
        return { intent: 'servicio_laboratorio', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 6. VACUNATORIO
    const isVacunatorio = /\b(vacuna|vacunas|vacunatorio|vacunacion|vacunarse|calendario\s+(?:de\s+)?vacunacion)\b/i.test(clean);
    if (isVacunatorio) {
        return { intent: 'vacunatorio', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 7. CURSO DE EMBARAZADAS Y YOGA
    const isCursoEmb = /\b(embarazada|embarazadas|preparto|gimnasia\s+(?:para\s+)?embarazadas|curso\s+(?:de\s+|para\s+)?embarazadas|yoga\s+(?:para\s+)?embarazadas)\b/i.test(clean);
    if (isCursoEmb) {
        return { intent: 'curso_embarazadas', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 8. REGISTRO CIVIL (INSCRIPCIÓN DE NACIMIENTOS)
    const isRegistroCivil = /\b(registro\s+civil|inscribir\s+(?:a\s+mi\s+)?(?:bebe|hijo|hija|nacimiento|recien\s+nacido)|partida\s+(?:de\s+)?nacimiento|acta\s+(?:de\s+)?nacimiento|inscripcion\s+(?:de\s+)?nacimiento)\b/i.test(clean);
    if (isRegistroCivil) {
        return { intent: 'registro_civil', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 9. ADMINISTRACIÓN, CIRUGÍAS Y PRESUPUESTOS
    const isAdminPresup = /\b(presupuesto|presupuestos|costo\s+(?:de\s+)?(?:cirugia|operacion)|precio\s+(?:de\s+)?(?:cirugia|operacion)|administracion\s+internado|cobertura\s+(?:de\s+)?cirugia)\b/i.test(clean);
    if (isAdminPresup) {
        return { intent: 'administracion_presupuestos', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 10. HORARIOS DE SEDES Y VISITAS
    const isHorarios = /\b(horarios?\s+(?:de\s+)?(?:atencion|sedes?)|a\s+que\s+hora\s+(?:abren|cierran|atienden)|horarios?\s+(?:de\s+)?visita|visitas?\s+(?:de\s+)?internad[oa]s?)\b/i.test(clean);
    if (isHorarios) {
        return { intent: 'horarios_sedes', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 11. TELÉFONOS Y WHATSAPPS DE SEDES Y SECTORES
    const isTelefonos = /\b(telefonos?|whatsapps?|wa\.link|numeros?\s+(?:de\s+)?(?:telefono|contacto)|contactos?\s+(?:de\s+)?(?:whatsapp|telefono|las\s+sedes|sede)|contacto\s+sede)\b/i.test(clean);
    if (isTelefonos) {
        let sectorKey: string | null = null;
        if (/fertilidad|reproductiva/i.test(clean)) sectorKey = 'fertilidad';
        else if (/administracion|presupuesto/i.test(clean)) sectorKey = 'administracion';
        else if (/internacion/i.test(clean)) sectorKey = 'internacion';
        else if (/citologia/i.test(clean)) sectorKey = 'citologia';
        else if (/imagen|radiologia|ecografia|mamografia/i.test(clean)) sectorKey = 'imagenes';
        else if (/laboratorio/i.test(clean)) sectorKey = 'laboratorio';
        else if (/fundacion/i.test(clean)) sectorKey = 'fundacion';
        return { intent: 'telefonos_sedes', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null, sectorKey };
    }

    // 12. RECLAMOS, SUGERENCIAS Y ENCUESTAS DE CALIDAD
    const isReclamos = /\b(reclamo|reclamos|queja|quejas|sugerencia|sugerencias|encuesta|encuestas|area\s+de\s+calidad|disconforme|mala\s+atencion)\b/i.test(clean);
    if (isReclamos) {
        return { intent: 'reclamos_calidad', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 13. FUNDACIÓN SANATORIO ARGENTINO
    const isFundacion = /\b(fundacion|fsa\b|campañas?\s+(?:de\s+)?salud\s+(?:ginecologica|pediatrica)|charlas\s+de\s+la\s+fundacion)\b/i.test(clean);
    if (isFundacion) {
        return { intent: 'fundacion', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 14. DERIVACIÓN EXPLÍCITA A ASESOR HUMANO / OPERADOR
    const isAgente = 
        /^(asesor[ao]?s?|operador[ao]?s?|agentes?|representantes?|humano|persona)[!.\s]*$/i.test(clean) ||
        /\b(atienda\s+(?:un[ao]?\s+)?(?:persona|humano|alguien|asesor[ao]?|operador[ao]?)|hablar\s+con\s+(?:un[ao]?\s+)?(?:asesor|asesora|persona|operador|operadora|humano|agente|representante|alguien)|comunicarme\s+con\s+(?:un[ao]?\s+)?(?:asesor|asesora|persona|humano|alguien|un\s+agente)|pasame\s+con\s+(?:un[ao]?\s+)?(?:asesor|asesora|operador|agente|alguien)|atenci[oó]n\s+humana|asistencia\s+humana|persona\s+real|humano\s+por\s+favor|quiero\s+(?:una\s+persona|un\s+asesor|hablar\s+con\s+alguien|comunicarme\s+con\s+un\s+asesor)|(?:el\s+)?bot\s+(?:no\s+sirve|no\s+funciona|nunca\s+funciona|no\s+entiende|es\s+in[uú]til)|no\s+quiero\s+(?:hablar\s+con\s+)?(?:un\s+)?bot|como\s+hago\s+para\s+que\s+me\s+atienda\s+un[ao]?\s+(?:persona|humano|alguien)|asesor\s+humano|necesito\s+(?:un\s+)?asesor|quiero\s+(?:un\s+)?asesor)\b/i.test(clean);
    if (isAgente) {
        return { intent: 'derivacion_agente', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
    }

    // 15. DETECCIÓN DE TURNO / DOCTOR / AUTORIZACIÓN / ESPECIALIDAD
    const specialtyCandidate = detectSpecialty(clean);
    const isTurno = Boolean(specialtyCandidate) || /\b(turno|turnos|cita|citas|reprogramar|reprogramacion|atencion|consulta|consultar|agendar|doctor|doctora|dr\b|dra\b|medico|medica|especialista|clinico|cardiolog|pediatr|ginecolog|traumatolog|dermatolog|neurolog|urolog|oftalmolog)\b/i.test(clean);
    const isAutoriz = /\b(autoriz|autorizar|orden|ordenes|pedido|pedidos|receta|recetas|cobertura|coseguro|auditoria)\b/i.test(clean);
    const isInfo = /\b(informacion|donde\s+queda|ubicacion|direccion|sede|sedes|web|portal|precios?|particular|cartilla|servicios)\b/i.test(clean);

    // Extracción inteligente de nombre de doctor/médico
    let doctorCandidate: string | null = null;
    const docRegexes = [
        /(?:doctor|doctora|dr|dra)\.?\s+([a-záéíóúñ]+)/i,
        /(?:con|para)\s+(?:el\s+|la\s+)?(?:dr\.?|doctor|dra\.?|doctora)\s+([a-záéíóúñ]{3,})/i,
        /(?:turno\s+)?(?:con|para)\s+(?:el\s+|la\s+)?([a-záéíóúñ]{3,})/i,
        /(?:atenderse|atenderme|ver)\s+(?:con|al|a\s+la)\s+([a-záéíóúñ]{3,})/i
    ];

    for (const reg of docRegexes) {
        const m = clean.match(reg);
        if (m && m[1]) {
            const word = m[1].toLowerCase().trim();
            if (!STOPWORDS_MEDICOS.has(word) && word.length >= 3) {
                doctorCandidate = word;
                break;
            }
        }
    }

    // Si no se detectó por regex con prefijo "Dr./con/para", buscar si alguna palabra del mensaje coincide directamente con un apellido de médico
    if (!doctorCandidate) {
        const wordsInText = clean.split(/[\s,.\-_/]+/).map(w => w.trim()).filter(w => w.length >= 3 && !STOPWORDS_MEDICOS.has(w));
        const nonDoctorWords = new Set([
            'turno', 'turnos', 'cita', 'citas', 'para', 'por', 'con', 'del', 'las', 'los', 'una', 'uno',
            'mañana', 'tarde', 'siesta', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado',
            'sancor', 'osde', 'osp', 'omint', 'swiss', 'medical', 'particular', 'provincia', 'damsup',
            'hola', 'buen', 'dia', 'buenas', 'tardes', 'noches', 'favor', 'gracias', 'atencion', 'consulta',
            'solicito', 'quiero', 'necesito', 'agendar', 'pedir', 'sacar', 'familiar', 'tercero', 'nombre'
        ]);

        const INSTITUTION_FILTER = /\b(escuela|colegio|instituto|lab\b|laboratorio|guardia|vacunatorio|preadmision|admisiones|curaciones|citologia|tamberias|barreal|sarmiento|chimbas|albardon|jachal|astica|rivadavia|calingasta|santa lucia|encon|ullum|zonda|caucete|rawson|pocito|capital|hemodinamia|radiologia|tomografia)\b/i;

        for (const w of wordsInText) {
            if (!nonDoctorWords.has(w) && !STOPWORDS_MEDICOS.has(w) && w.length >= 4) {
                try {
                    const { data: dMatch } = await supabase
                        .from('contact_center_doctor_parameters')
                        .select('id, profesional_nombre, especialidad, consultorio_actual, condiciones_consulta')
                        .ilike('profesional_nombre', `${w} %`)
                        .limit(10);

                    const validMatch = (dMatch || []).filter((d: any) => !INSTITUTION_FILTER.test(d.profesional_nombre || ''));

                    if (validMatch.length > 0) {
                        doctorCandidate = w;
                        break;
                    }
                } catch (_) {}
            }
        }
    }

    // Buscar en la base de datos de parámetros médicos de Sanatorio Argentino
    let doctorRecord: any = null;
    let multipleDoctors: any[] | null = null;
    if (doctorCandidate) {
        try {
            const isDoctorFemale = /\b(doctora|dra\.?|la\s+doctora)\b/i.test(clean);
            const isDoctorMale = /\b(doctor|dr\.?|el\s+doctor)\b/i.test(clean) && !isDoctorFemale;

            const { data: rawDocs } = await supabase
                .from('contact_center_doctor_parameters')
                .select('id, profesional_nombre, especialidad, consultorio_actual, condiciones_consulta')
                .ilike('profesional_nombre', `%${doctorCandidate}%`)
                .limit(15);

            const docs = (rawDocs || []).filter((d: any) => !/\b(escuela|colegio|instituto|lab\b|laboratorio|guardia|vacunatorio|preadmision|admisiones|curaciones|citologia|tamberias|barreal|sarmiento|chimbas|albardon|jachal|astica|rivadavia|calingasta|santa lucia|encon|ullum|zonda|caucete|rawson|pocito|capital|hemodinamia|radiologia|tomografia)\b/i.test(d.profesional_nombre || ''));

            if (docs && docs.length > 0) {
                // Formatear y asociar metadata de presentación clara a cada doctor
                const enrichedDocs = docs.map((d: any) => {
                    const info = formatDoctorDisplay(d);
                    return {
                        ...d,
                        formattedInfo: info,
                        displayName: info.displayName,
                        cleanSpecialty: info.specialty
                    };
                });

                // Deduplicar registros homónimos idénticos (ej: misma doctora en diferentes sedes o agendas)
                const uniqueDocsMap = new Map<string, any>();
                for (const d of enrichedDocs) {
                    const key = d.displayName.toLowerCase();
                    if (!uniqueDocsMap.has(key)) {
                        uniqueDocsMap.set(key, d);
                    } else {
                        const existing = uniqueDocsMap.get(key);
                        if ((d.condiciones_consulta?.length || 0) > (existing.condiciones_consulta?.length || 0)) {
                            uniqueDocsMap.set(key, d);
                        }
                    }
                }
                const uniqueDocs = Array.from(uniqueDocsMap.values());

                // Verificar si en el texto del paciente se incluye además un nombre de pila o especialidad específica
                const matchingByNameOrSpec = uniqueDocs.find((d: any) => {
                    const docText = `${d.profesional_nombre} ${d.displayName} ${d.cleanSpecialty} ${d.formattedInfo?.cleanSurnameAndName || ''}`.toLowerCase();
                    const words = clean.split(/[\s,]+/);
                    return words.some((w: string) => w.length >= 4 && docText.includes(w) && w !== doctorCandidate?.toLowerCase());
                });

                if (matchingByNameOrSpec) {
                    doctorRecord = matchingByNameOrSpec;
                    multipleDoctors = null;
                } else if (uniqueDocs.length === 1) {
                    doctorRecord = uniqueDocs[0];
                    multipleDoctors = null;
                } else {
                    // Múltiples profesionales con el mismo apellido (ej: Buteler Carlos, Buteler Agustina, Buteler Lucía).
                    // Si el paciente no indicó nombre de pila o especialidad específica, preguntar siempre cuál necesita
                    // mediante el menú interactivo (a-, b-, c-).
                    multipleDoctors = uniqueDocs.slice(0, 5);
                    doctorRecord = null;
                }
            }
        } catch (e) {
            console.warn('[intent-detector] Error consultando doctor parameters:', e);
        }
    }

    // Si no se detectó doctor en el mensaje actual, buscar si se mencionó en el contexto reciente (Bot o Asesor)
    if (!doctorCandidate && context?.history && context.history.length > 0) {
        const lastBotText = (context.lastBotMessage?.content || '').toLowerCase();
        const lastAgentText = (context.lastAgentMessage?.content || '').toLowerCase();
        for (const reg of docRegexes) {
            const m = lastBotText.match(reg) || lastAgentText.match(reg);
            if (m && m[1]) {
                const word = m[1].toLowerCase().trim();
                if (!STOPWORDS_MEDICOS.has(word) && word.length >= 3) {
                    doctorCandidate = word;
                    break;
                }
            }
        }
    }

    const isGestionFamiliar = /\b(otro\s+paciente|otra\s+persona|no\s+es\s+para\s+m[ií]|para\s+otro|para\s+otra|para\s+un\s+familiar|es\s+para\s+un\s+familiar|familiar|familiares|mi\s+hijo|mi\s+hija|mi\s+bebe|mi\s+mam[aá]|mi\s+pap[aá]|mi\s+espos[oa]|mi\s+marido|mi\s+se[nñ]ora|para\s+alguien\s+mas|tercero|tercera\s+persona)\b/i.test(clean);
    const isForOtherPatient = isGestionFamiliar;
    const isGestionPropia = /\b(para\s+m[ií]|es\s+para\s+m[ií]|tr[aá]mite\s+para\s+m[ií]|a\s+mi\s+nombre|para\s+mi\s+persona)\b/i.test(clean);
    const isConfirmingOrCanceling = context?.botStage === 'esperando_confirmacion_turno' || context?.botStage === 'turno_consultado' || (context?.lastBotMessage?.content?.includes('confirmar, reprogramar o cancelar') || context?.lastBotMessage?.content?.includes('confirmar la asistencia') || context?.lastBotMessage?.content?.includes('confirmar tu asistencia'));
    if (isConfirmingOrCanceling) {
        if (/\b(confirmar|confirmo|confirmado|asisto|voy\s+a\s+ir|voy|si\s+confirmo|dale\s+confirmo)\b/i.test(clean)) {
            return { intent: 'confirmar_turno_online', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
        }
        if (/\b(cancelar|cancelo|cancelar\s+turno|no\s+voy\s+a\s+ir|dar\s+de\s+baja|baja|anular)\b/i.test(clean)) {
            return { intent: 'cancelar_turno_online', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
        }
        if (/\b(reprogramar|reprogramo|cambiar\s+fecha|cambiar\s+dia|otro\s+dia|cambiar\s+turno|mover\s+turno|cambiar\s+horario)\b/i.test(clean)) {
            return { intent: 'reprogramar_turno_online', doctorCandidate: null, doctorRecord: null, isExplicitNumberOption: null };
        }
    }

    let intent: IntentDetectionResult['intent'] = 'general';
    if (context?.botStage === 'esperando_datos_turno' || isTurno || doctorRecord) {
        intent = 'turno';
    } else if (context?.botStage === 'esperando_dni_turno') {
        intent = 'consultar_turno';
    } else if (isAutoriz) {
        intent = 'autorizacion';
    } else if (isGestionFamiliar) {
        intent = 'gestion_familiar';
    } else if (isGestionPropia) {
        intent = 'gestion_propia';
    } else if (isInfo) {
        intent = 'info';
    }

    // Si aún no se determinó la intención y hay historial conversacional, usar OpenAI con contexto
    if (intent === 'general' && context?.history && context.history.length > 0) {
        const openAiKey = Deno.env.get('OPENAI_API_KEY');
        if (openAiKey) {
            try {
                const thread = context.history.slice(-6).map((m: any) => {
                    const role = m.direction === 'incoming' 
                        ? (context.patientName || 'Paciente') 
                        : (m.sender_name === 'Bot Sanatorio' || m.raw_payload?.bot ? 'Bot' : `Asesor_Humano (${m.sender_name || 'Agente'})`);
                    return `${role}: ${m.content}`;
                }).join('\n');

                const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${openAiKey}`
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        response_format: { type: 'json_object' },
                        messages: [
                            {
                                role: 'system',
                                content: `Eres el clasificador contextual del Contact Center de Sanatorio Argentino.
Analiza la intención del último mensaje del paciente considerando el hilo de la conversación previa con el Bot o con el Asesor Humano.
Intenciones posibles:
- "turno": solicitud o consulta sobre turnos médicos
- "confirmar_turno_online": el paciente confirma su turno
- "cancelar_turno_online": el paciente cancela su turno
- "reprogramar_turno_online": el paciente pide cambiar fecha/horario de su turno
- "autorizacion": orden médica, autorización o coseguro
- "gestion_familiar": el paciente indica que gestiona para otro paciente o familiar (hijo, cónyuge, etc.)
- "gestion_propia": el paciente indica que el trámite es para sí mismo
- "guardia": consulta sobre guardias o urgencias (médica, clínica, pediátrica, ginecológica, traumatológica, etc.)
- "chequeo": circuito de chequeo preventivo
- "informes_laboratorio": ver o consultar análisis clínicos
- "informes_imagenes": estudios de imágenes
- "seguimiento_asesor": responde a lo acordado con el asesor humano
- "derivacion_agente": el paciente solicita ser atendido por una persona, asesor humano, operador, o se queja del bot
- "general": si no encaja en ninguna
Devuelve un JSON con:
{
  "intent": string,
  "doctor": string o null (SOLO si el paciente menciona un nombre o apellido real de persona. Si dice "quiero con otra", "otra doctora", "otro", "cualquiera", "no esa", devuelve null)
}`
                            },
                            {
                                role: 'user',
                                content: `Historial reciente:\n${thread}\n\nÚltimo mensaje del paciente:\n"${text}"`
                            }
                        ],
                        temperature: 0.1,
                        max_tokens: 150
                    })
                });

                if (aiRes.ok) {
                    const aiData = await aiRes.json();
                    const parsed = JSON.parse(aiData.choices?.[0]?.message?.content || '{}');
                    if (parsed.intent && parsed.intent !== 'general') {
                        intent = parsed.intent as any;
                    }
                    if (parsed.doctor && !doctorCandidate) {
                        const docWord = parsed.doctor.toLowerCase().trim();
                        const isOnlyDigits = /^\d+$/.test(clean.replace(/[\s.-]/g, ''));
                        // NUNCA aceptar un doctor retornado por OpenAI si es stopword, verbo, o si son solo números
                        if (!isOnlyDigits && docWord.length >= 3 && !STOPWORDS_MEDICOS.has(docWord) && clean.toLowerCase().includes(docWord)) {
                            doctorCandidate = docWord;
                        }
                    }
                }
            } catch (err) {
                console.warn('[intent-detector] Fallback OpenAI contextual error:', err);
            }

        }
    }

    return {
        intent,
        doctorCandidate,
        doctorRecord,
        multipleDoctors: multipleDoctors || null,
        isExplicitNumberOption: null,
        specialtyCandidate,
        isForOtherPatient: Boolean(isForOtherPatient)
    };
}

// =============================================
// GESTIÓN DE TURNOS: CANCELACIÓN Y REPROGRAMACIÓN
// El bot identifica al paciente, lista sus turnos, confirma la acción y recolecta preferencias.
// La baja / reprogramación en SALUS la realiza SIEMPRE un agente (el bot solo registra la solicitud).
// =============================================
const GESTION_TURNO_STAGES = new Set([
    'esperando_dni_gestion',
    'esperando_seleccion_turno_gestion',
    'esperando_confirmacion_cancelacion',
    'esperando_preferencia_reprogramacion',
    'esperando_profesional_reprogramacion'
]);

const GESTION_FOOTER = `\n\n🔙 *Volver:* Escribí *"Menú"* | 👤 *Agente:* Escribí *"Agente"*`;
const GESTION_MAX_REINTENTOS = 2;
const GESTION_MAX_TURNOS_LISTADOS = 8;

function toTitleCaseNombre(raw?: string | null): string {
    if (!raw) return '';
    let s = String(raw).trim();
    if (s.includes(',')) {
        const [ap, nom] = s.split(',').map((p) => p.trim());
        s = `${nom} ${ap}`;
    }
    return s.toLowerCase().split(/\s+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function formatFechaCortaTurno(fStr?: string | null): string {
    if (!fStr) return '';
    const [y, m, d] = String(fStr).slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return String(fStr);
    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const date = new Date(y, m - 1, d);
    return `${dias[date.getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function describeTurnoGestion(t: any): string {
    if (!t) return '';
    const hora = t.hora ? ` – ${String(t.hora).slice(0, 5)} hs` : '';
    const prof = t.medico || 'Profesional asignado';
    const esp = t.especialidad;
    return `${formatFechaCortaTurno(t.fecha)}${hora} – ${prof}${esp ? ` (${esp})` : ''}`;
}

function snapshotTurnoGestion(t: any) {
    return {
        id: t?.id ?? null,
        fecha: t?.fecha ?? null,
        hora: t?.hora ?? null,
        medico: t?.medico || null,
        especialidad: t?.especialidad || t?.tipo_visita || null,
        sede: t?.sede || null,
        origen: t?.origen || null
    };
}

/** Motivo estructurado para que el agente opere en SALUS sin volver a preguntar */
function buildGestionMotivo(g: any): string {
    const accion = g?.accion === 'reprogramar' ? 'REPROGRAMAR TURNO' : 'CANCELAR TURNO';
    const sel = (g?.seleccion || []).map((i: number) => g?.turnos?.[i]).filter(Boolean);
    const turnosTxt = sel.length
        ? sel.map((t: any) => `${describeTurnoGestion(t)}${t.id ? ` [ID ${t.id}]` : ''}`).join('; ')
        : 'Turno no identificado';
    let txt = `${accion} | ${toTitleCaseNombre(g?.paciente_nombre) || 'Paciente'} (DNI ${g?.dni || 'no informado'}) | ${turnosTxt}`;
    if (g?.accion === 'reprogramar' && sel.length) {
        const prof = g?.mismo_profesional === false ? 'Cualquiera de la especialidad' : (g?.mismo_profesional === true ? 'Mismo profesional' : 'Sin indicar');
        txt += ` | Preferencia: ${g?.preferencia || 'Sin indicar'} | Profesional: ${prof}`;
    }
    return txt.slice(0, 900);
}

interface GestionTurnoResult {
    reply: string;
    stage: string;
    updates: Record<string, any>;
}

/**
 * Máquina de estados del flujo de cancelación / reprogramación de turnos.
 * Estado temporal persistido en conv.ai_summary.gestion_turno.
 */
async function handleGestionTurnoFlow(params: {
    supabase: any;
    cleanText: string;
    intent: string;
    currentStage: string;
    conv: any;
    knownDni: string | null;
    dniInMessage: string | null;
    turnosDni: string | null;
    turnosConocidos: any[];
    whatsappName: string;
}): Promise<GestionTurnoResult> {
    const { supabase, cleanText, intent, currentStage, conv, knownDni, dniInMessage, turnosDni, turnosConocidos, whatsappName } = params;
    const clean = cleanText.toLowerCase().trim();
    const prevSummary = (conv?.ai_summary && typeof conv.ai_summary === 'object') ? conv.ai_summary : {};
    const inFlow = GESTION_TURNO_STAGES.has(currentStage);
    const isActionIntent = intent === 'cancelar_turno_online' || intent === 'reprogramar_turno_online';
    const saludo = whatsappName && whatsappName !== 'Paciente' ? ` *${whatsappName}*` : '';

    let g: any = inFlow && prevSummary.gestion_turno ? { ...prevSummary.gestion_turno } : {};
    if (intent === 'cancelar_turno_online') g.accion = 'cancelar';
    else if (intent === 'reprogramar_turno_online') g.accion = 'reprogramar';
    if (!g.accion) g.accion = 'cancelar';
    const verbo = () => (g.accion === 'reprogramar' ? 'reprogramar' : 'cancelar');
    const nombrePaciente = () => toTitleCaseNombre(g.paciente_nombre);
    const seleccionados = () => (g.seleccion || []).map((i: number) => g.turnos?.[i]).filter(Boolean);
    const detalleSeleccion = () => seleccionados().map((t: any) => `📅 ${describeTurnoGestion(t)}`).join('\n');

    const persist = (reply: string, stage: string, extra: Record<string, any> = {}): GestionTurnoResult => ({
        reply,
        stage,
        updates: {
            status: 'bot',
            bot_active: true,
            motivo_consulta: `Gestión de turno (${verbo()}) en curso`,
            tags: [g.accion === 'reprogramar' ? 'Reprogramación' : 'Cancelación'],
            ai_summary: { ...prevSummary, gestion_turno: { ...g, updated_at: Date.now() } },
            ...extra
        }
    });

    const handoff = (reply: string): GestionTurnoResult => ({
        reply: `${reply}\n\n${getAgentHandoffNotice()}`,
        stage: 'esperando_agente',
        updates: {
            status: 'sin_asignar',
            bot_active: false,
            motivo_consulta: buildGestionMotivo(g),
            tags: [g.accion === 'reprogramar' ? 'Reprogramación' : 'Cancelación'],
            medico_o_especialidad: seleccionados()[0]?.medico || seleccionados()[0]?.especialidad || null,
            ai_summary: { ...prevSummary, gestion_turno: { ...g, estado: 'derivado_agente', updated_at: Date.now() } }
        }
    });

    const retry = (reply: string, stage: string): GestionTurnoResult => {
        g.intentos = (g.intentos || 0) + 1;
        if (g.intentos > GESTION_MAX_REINTENTOS) {
            return handoff(`No logramos interpretar tu respuesta 🙏. Te comunicamos con un agente para que continúe la gestión de tu turno.`);
        }
        return persist(reply, stage);
    };

    const askDni = (prefix = ''): GestionTurnoResult => persist(
        `${prefix}Para ${verbo()} tu turno necesitamos el *DNI del paciente* (solo números, sin puntos). 🪪\n\n` +
        `Si el turno es de un familiar, escribí el DNI de esa persona.` + GESTION_FOOTER,
        'esperando_dni_gestion'
    );

    // Paso siguiente una vez elegido el/los turno/s
    const askAfterSelection = (unicoTurno: boolean): GestionTurnoResult => {
        g.intentos = 0;
        const sel = seleccionados();
        const nombre = nombrePaciente();
        const encabezado = unicoTurno
            ? `Encontramos este turno${nombre ? ` de *${nombre}*` : ''}:`
            : (sel.length > 1 ? `Turnos seleccionados:` : `Turno seleccionado:`);
        const tipEsOtro = unicoTurno ? `\n\n💡 Si el turno es de otro paciente, escribí su *DNI*.` : '';

        if (g.accion === 'cancelar') {
            return persist(
                `${encabezado}\n\n${detalleSeleccion()}\n\n` +
                `¿Confirmás que querés *cancelar* ${sel.length > 1 ? 'estos turnos' : 'este turno'}? Respondé *Sí* o *No*.` +
                tipEsOtro + GESTION_FOOTER,
                'esperando_confirmacion_cancelacion'
            );
        }
        return persist(
            `${encabezado}\n\n${detalleSeleccion()}\n\n` +
            `¿Qué días u horarios te quedan mejor para el nuevo turno? Podés escribirlo libremente (ej.: *"martes o jueves por la tarde"*) o elegir una opción:\n\n` +
            `1️⃣ Lo antes posible\n2️⃣ Por la mañana\n3️⃣ Por la tarde\n4️⃣ La semana próxima` +
            tipEsOtro + GESTION_FOOTER,
            'esperando_preferencia_reprogramacion'
        );
    };

    const loadTurnos = async (dni: string): Promise<any[]> => {
        if (turnosDni && dni === turnosDni && Array.isArray(turnosConocidos) && turnosConocidos.length > 0) {
            return turnosConocidos;
        }
        try {
            const { data, error } = await supabase.rpc('buscar_turnos_proximos', { p_dni: dni, p_telefono: null });
            if (!error && Array.isArray(data)) return data;
            if (error) console.warn('[gestion-turno] Error RPC buscar_turnos_proximos:', error);
        } catch (e) {
            console.warn('[gestion-turno] Excepción buscando turnos:', e);
        }
        return [];
    };

    const presentTurnos = async (dni: string): Promise<GestionTurnoResult> => {
        const turnos = await loadTurnos(dni);
        g.dni = dni;
        g.turnos = turnos.slice(0, GESTION_MAX_TURNOS_LISTADOS).map(snapshotTurnoGestion);
        g.seleccion = [];
        g.intentos = 0;
        g.paciente_nombre = turnos[0]?.paciente_nombre || (conv?.dni === dni ? conv?.nombre_completo : null) || null;

        if (g.turnos.length === 0) {
            return persist(
                `No encontramos turnos próximos agendados para el DNI *${dni}*. 🔎\n\n` +
                `Es posible que el turno ya haya sido dado de baja o que esté a nombre de otro paciente.\n\n` +
                `• Si es de otro paciente o familiar, escribí su *DNI*.\n` +
                `• Para solicitar un turno nuevo, escribí *"Menú"* y elegí la opción 1.` + GESTION_FOOTER,
                'esperando_dni_gestion'
            );
        }
        if (g.turnos.length === 1) {
            g.seleccion = [0];
            return askAfterSelection(true);
        }
        const nombre = nombrePaciente();
        const lista = g.turnos.map((t: any, i: number) => `*${i + 1})* ${describeTurnoGestion(t)}`).join('\n');
        return persist(
            `Encontramos *${g.turnos.length} turnos* próximos${nombre ? ` de *${nombre}*` : ''}:\n\n${lista}\n\n` +
            `¿Cuál querés *${verbo()}*? Respondé con el número (podés indicar varios, ej.: *1 y 3*) o escribí *Todos*.\n\n` +
            `💡 Si es de otro paciente, escribí su *DNI*.` + GESTION_FOOTER,
            'esperando_seleccion_turno_gestion'
        );
    };

    // ---- ENTRADA NUEVA AL FLUJO ----
    if (!inFlow) {
        g = { accion: g.accion };
        const dni = dniInMessage || knownDni;
        if (!dni) return askDni();
        return await presentTurnos(dni);
    }

    // ---- DNI NUEVO DENTRO DEL FLUJO (otro paciente / familiar) ----
    const aceptaDni = currentStage === 'esperando_dni_gestion' || currentStage === 'esperando_seleccion_turno_gestion' || currentStage === 'esperando_confirmacion_cancelacion';
    if (dniInMessage && aceptaDni) {
        return await presentTurnos(dniInMessage);
    }

    // ---- CAMBIO DE ACCIÓN A MITAD DE FLUJO (ej.: "mejor reprogramalo") ----
    if (isActionIntent) {
        if (currentStage === 'esperando_dni_gestion' && !g.turnos?.length) return askDni();
        if (currentStage === 'esperando_seleccion_turno_gestion' && g.dni) return await presentTurnos(g.dni);
        if ((g.seleccion || []).length > 0) return askAfterSelection(false);
        if (g.dni) return await presentTurnos(g.dni);
        return askDni();
    }

    switch (currentStage) {
        case 'esperando_dni_gestion': {
            return retry(`Por favor escribí el *DNI* del paciente (solo números, sin puntos). 🪪` + GESTION_FOOTER, 'esperando_dni_gestion');
        }

        case 'esperando_seleccion_turno_gestion': {
            const n = (g.turnos || []).length;
            if (/^(ninguno|ninguna|no|nada|ninguno\s+de\s+esos|no\s+gracias)[!.\s]*$/i.test(clean)) {
                g.estado = 'sin_cambios';
                return persist(
                    `Perfecto${saludo}, *no realizamos ningún cambio* en tus turnos. 👍\n\nSi necesitás otra cosa, escribí *"Menú"*.`,
                    'informacion_respondida',
                    { motivo_consulta: 'Gestión de turno: sin cambios (paciente desistió)' }
                );
            }
            let idx: number[] = [];
            if (/\b(todos|todas|ambos|ambas|los\s+dos|las\s+dos|los\s+tres|las\s+tres|todo)\b/i.test(clean)) {
                idx = Array.from({ length: n }, (_, i) => i);
            } else {
                const nums = (clean.match(/\b\d{1,2}\b/g) || []).map(Number).filter((x) => x >= 1 && x <= n);
                idx = [...new Set(nums.map((x) => x - 1))];
                if (idx.length === 0) {
                    // Selección por apellido del profesional u horario escrito
                    (g.turnos || []).forEach((t: any, i: number) => {
                        const apellido = String(t.medico || '').toLowerCase().replace(/^\(?[a-z]{2,4}\)?\s+/i, '').replace(/^(dr|dra)\.?\s*/i, '')
                            .split(/[\s,]+/).find((w: string) => w.length >= 4 && !STOPWORDS_MEDICOS.has(w));
                        const hora = t.hora ? String(t.hora).slice(0, 5) : '';
                        if ((apellido && clean.includes(apellido)) || (hora && clean.includes(hora))) idx.push(i);
                    });
                }
            }
            if (idx.length === 0) {
                return retry(
                    `No identificamos el turno 🤔. Respondé con el *número* de la lista (ej.: *1*), varios (ej.: *1 y 2*) o *Todos*.` + GESTION_FOOTER,
                    'esperando_seleccion_turno_gestion'
                );
            }
            g.seleccion = idx.sort((a, b) => a - b);
            return askAfterSelection(false);
        }

        case 'esperando_confirmacion_cancelacion': {
            const noAsistire = /\bno\s+(?:voy\s+a\s+poder|puedo|podr[eé]|vamos\s+a\s+poder|voy\s+a\s+ir|voy\s+a\s+asistir)\b/i.test(clean);
            const esSi = noAsistire || /^(s[ií]+|sii+|dale|confirm\w*|correcto|ok(ey|ay)?|de\s+acuerdo|afirmativo|exacto|claro|perfecto|cancel\w*|anul\w*|por\s+favor)\b/i.test(clean);
            const esNo = !noAsistire && /^(no+|nop|nah|mejor\s+no|dej[aá]\w*|mantener|lo\s+mantengo|la\s+mantengo|me\s+arrepent\w*)\b/i.test(clean);
            if (esSi && !esNo) {
                const sel = seleccionados();
                return handoff(
                    `✅ Listo${saludo}, registramos tu solicitud de *cancelación*:\n\n${detalleSeleccion()}\n\n` +
                    `Un agente ${sel.length > 1 ? 'dará de baja los turnos' : 'dará de baja el turno'} en el sistema y te confirmará por este medio. ` +
                    `Si además necesitás un *nuevo turno*, podés indicárselo en este mismo chat.\n\n` +
                    `¡Gracias por avisarnos! Liberar el turno permite que otro paciente pueda atenderse. 🏥`
                );
            }
            if (esNo) {
                g.estado = 'sin_cambios';
                const sel = seleccionados();
                return persist(
                    `Perfecto${saludo}, *no realizamos cambios*: ${sel.length > 1 ? 'tus turnos se mantienen' : 'tu turno se mantiene'}. 👍\n\n${detalleSeleccion()}\n\n` +
                    `ℹ️ Recordá presentarte 15 minutos antes con tu DNI y credencial de la obra social.\n\n` +
                    `Si necesitás otra cosa, escribí *"Menú"*.`,
                    'informacion_respondida',
                    { motivo_consulta: 'Gestión de turno: paciente mantiene su turno' }
                );
            }
            return retry(`Por favor respondé *Sí* para confirmar la cancelación o *No* para mantener el turno.` + GESTION_FOOTER, 'esperando_confirmacion_cancelacion');
        }

        case 'esperando_preferencia_reprogramacion': {
            const opciones: Record<string, string> = { '1': 'Lo antes posible', '2': 'Por la mañana', '3': 'Por la tarde', '4': 'La semana próxima' };
            const opt = clean.match(/^([1-4])\s*[-.)️⃣]*\s*$/);
            let pref: string | null = opt ? opciones[opt[1]] : null;
            if (!pref && clean.replace(/[^a-z0-9áéíóúñ]/gi, '').length >= 3) pref = cleanText.trim().slice(0, 200);
            if (!pref) {
                return retry(`Contanos qué días u horarios te quedan mejor (ej.: *"lunes por la mañana"*) o elegí una opción del *1* al *4*.` + GESTION_FOOTER, 'esperando_preferencia_reprogramacion');
            }
            g.preferencia = pref;
            g.intentos = 0;
            const profs = [...new Set(seleccionados().map((t: any) => t.medico).filter(Boolean))];
            if (profs.length === 0) {
                g.mismo_profesional = null;
                return handoff(
                    `📋 Listo${saludo}, registramos tu solicitud de *reprogramación*:\n\n${detalleSeleccion()}\n🗓️ *Preferencia:* ${pref}\n\n` +
                    `Un agente buscará disponibilidad y te propondrá las nuevas opciones por este medio.`
                );
            }
            return persist(
                `¿Querés mantener ${profs.length === 1 ? `al profesional *${profs[0]}*` : 'los mismos profesionales'}?\n\n` +
                `1️⃣ Sí, mismo profesional\n2️⃣ Me da igual, cualquiera de la especialidad` + GESTION_FOOTER,
                'esperando_profesional_reprogramacion'
            );
        }

        case 'esperando_profesional_reprogramacion': {
            const mismo = /^(1|s[ií]+|mismo|misma|el\s+mismo|la\s+misma|mantener|dale|prefiero\s+(el|la)\s+mism[oa])\b/i.test(clean);
            const cualquiera = /^(2|no|cualquier\w*|me\s+da\s+igual|da\s+igual|igual|indistint\w*|otro|otra)\b/i.test(clean);
            if (!mismo && !cualquiera) {
                return retry(`Respondé *1* para mantener el mismo profesional o *2* si te da igual.` + GESTION_FOOTER, 'esperando_profesional_reprogramacion');
            }
            g.mismo_profesional = mismo && !/^(2|no)\b/i.test(clean);
            return handoff(
                `📋 Listo${saludo}, registramos tu solicitud de *reprogramación*:\n\n${detalleSeleccion()}\n` +
                `🗓️ *Preferencia:* ${g.preferencia || 'Sin indicar'}\n` +
                `👨‍⚕️ *Profesional:* ${g.mismo_profesional ? 'Mismo profesional' : 'Cualquiera de la especialidad'}\n\n` +
                `Un agente buscará disponibilidad y te propondrá las nuevas opciones por este medio.`
            );
        }
    }

    // Estado inconsistente: reiniciar el flujo de forma segura
    return knownDni ? await presentTurnos(knownDni) : askDni();
}

// Columnas válidas estrictas de contact_center_conversations para evitar fallos de schema cache en Supabase
const VALID_CONVERSATION_COLUMNS = new Set([
    'phone', 'status', 'assigned_agent_id', 'assigned_agent_name', 'assigned_at',
    'bot_active', 'bot_stage', 'dni', 'nombre_completo', 'obra_social',
    'fecha_nacimiento', 'email', 'telefono_contacto', 'departamento',
    'es_paciente_existente', 'motivo_consulta', 'medico_o_especialidad',
    'last_message_text', 'last_message_at', 'created_at', 'updated_at',
    'ai_summary', 'nhc', 'resolution_reason', 'closed_at',
    'closed_by_agent_id', 'closed_by_agent_name', 'tags'
]);

/**
 * Determina las etiquetas institucionales asignadas por el bot:
 * - 'Autorización' (cuando el paciente no está pidiendo turno, solamente está pidiendo autorización)
 * - 'Cancelación' (cuando el paciente expresa de forma explícita que quiere cancelar un turno)
 * - 'Reprogramación' (cuando el paciente expresa de forma explícita que quiere cambiar, modificar o reprogramar un turno)
 */
function resolveBotTags(
    cleanText: string,
    existingTags: string[] = [],
    context?: {
        intent?: string | null;
        botStage?: string | null;
        motivoConsulta?: string | null;
        gestionTurno?: any;
    }
): string[] {
    const tagsSet = new Set<string>();

    if (Array.isArray(existingTags)) {
        for (const t of existingTags) {
            if (!t || typeof t !== 'string') continue;
            const norm = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
            if (norm === 'autorizacion') tagsSet.add('Autorización');
            else if (norm === 'cancelacion') tagsSet.add('Cancelación');
            else if (norm === 'reprogramacion') tagsSet.add('Reprogramación');
            else tagsSet.add(t);
        }
    }

    const norm = (cleanText || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const motivoNorm = (context?.motivoConsulta || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const intent = context?.intent || '';
    const stage = context?.botStage || '';
    const accion = context?.gestionTurno?.accion || '';

    // 1. CANCELACIÓN: cuando el paciente expresa de forma explícita que quiere cancelar un turno
    const isExplicitCancel = 
        accion === 'cancelar' ||
        intent === 'cancelar_turno_online' ||
        stage === 'esperando_confirmacion_cancelacion' ||
        /\b(cancel\w*|cancelae|anular\s+(?:el\s+|mi\s+|la\s+)?turno|dar\s+de\s+baja\s+(?:el\s+|mi\s+|la\s+)?turno|baja\s+(?:de|del)\s*turno|no\s+voy\s+a\s+poder\s+ir|no\s+puedo\s+asistir|no\s+voy\s+a\s+asistir)\b/i.test(norm) ||
        motivoNorm.includes('cancelar') || 
        motivoNorm.includes('cancelacion') ||
        motivoNorm.includes('baja de turno');

    if (isExplicitCancel) {
        tagsSet.add('Cancelación');
        tagsSet.delete('Reprogramación');
    }

    // 2. REPROGRAMACIÓN: cuando el paciente expresa de forma explícita que quiere cambiar, modificar o reprogramar un turno
    const isExplicitReprog = 
        accion === 'reprogramar' ||
        intent === 'reprogramar_turno_online' ||
        stage === 'esperando_preferencia_reprogramacion' ||
        stage === 'esperando_profesional_reprogramacion' ||
        /\b(reprogram\w*|re\s*programar|cambiar\s+(?:el\s+|mi\s+|la\s+|de\s+)?(?:turno|cita|fecha|dia|horario)|modificar\s+(?:el\s+|mi\s+)?(?:turno|cita|fecha|dia|horario)|mover\s+(?:el\s+|mi\s+)?(?:turno|cita)|pasar\s+(?:el\s+|mi\s+)?(?:turno|cita)\s+(?:para|a)|postergar\s+(?:el\s+|mi\s+)?(?:turno|cita)|otro\s+dia|otra\s+fecha)\b/i.test(norm) ||
        motivoNorm.includes('reprogramar') || 
        motivoNorm.includes('reprogramacion') ||
        motivoNorm.includes('modificar turno');

    if (isExplicitReprog && !isExplicitCancel) {
        tagsSet.add('Reprogramación');
        tagsSet.delete('Cancelación');
    }

    // 3. AUTORIZACIÓN: cuando el paciente no está pidiendo turno, solamente está pidiendo autorización
    const isTurnoRequest = 
        motivoNorm.includes('solicitud de turno') ||
        /\b(nuevo\s+turno|sacar\s+turno|pedir\s+turno|solicitar\s+turno|quiero\s+un\s+turno|dar\s+un\s+turno|agendar\s+turno|turno\s+con\s+(?:el|la|doctor|dra?)|turno\s+para\s+(?:clinico|medico|doctor))\b/i.test(norm);
    
    const isExplicitAutoriz = 
        (intent === 'autorizacion' ||
        stage === 'esperando_foto_autorizacion' ||
        /\b(autoriz\w*|autorizacion|auditar|auditoria|pedido\s+medico\s+para\s+autorizar|orden\s+para\s+autorizar|orden\s+medica\s+para\s+autorizar|saber\s+si\s+(?:esta\s+)?autorizada)\b/i.test(norm) ||
        (motivoNorm.includes('autorizacion') && !motivoNorm.includes('turno'))) &&
        !isTurnoRequest &&
        !isExplicitCancel &&
        !isExplicitReprog;

    if (isExplicitAutoriz) {
        tagsSet.add('Autorización');
    }

    return Array.from(tagsSet);
}

// =============================================
// MOTOR DE TRIAGE DEL CHATBOT (AHORRO DE MENSAJES Y EXTRACCIÓN CON IA)
// =============================================

async function handleChatbotTriage(
    supabase: any,
    phone: string,
    incomingText: string,
    senderName: string | null,
    lineId: string | null,
    mediaType?: string | null,
    mediaUrl?: string | null
) {
    if (!phone || (!incomingText && !mediaUrl)) return;
    const cleanText = (incomingText || '').trim();
    const isIncomingMedia = (mediaType === 'image' || mediaType === 'document' || cleanText === '[image]' || cleanText === '[document]' || Boolean(mediaUrl));

    // Guardar referencia del cliente de Supabase para helpers internos
    (globalThis as any)._lastSupabaseClient = supabase;

    // Refrescar cola de espera y configuración de avisos de demora en caliente
    await refreshQueueAndHandoffConfig(supabase);

    // 1. Obtener estado actual de la conversación
    const { data: conv } = await supabase
        .from('contact_center_conversations')
        .select('*')
        .eq('phone', phone)
        .maybeSingle();

    // Comprobar si la conversación previa estaba cerrada, finalizada o archivada
    const wasClosed = Boolean(
        conv?.closed_at || 
        conv?.resolution_reason || 
        ['archivado', 'finalizado', 'cerrado', 'resuelto', 'closed', 'archived'].includes(conv?.status) ||
        conv?.closed_by_agent_id
    );

    const closedAtMs = conv?.closed_at ? new Date(conv.closed_at).getTime() : 0;
    const minutesSinceClosed = closedAtMs > 0 ? (Date.now() - closedAtMs) / (1000 * 60) : Infinity;

    // Saludo o reinicio explícito del usuario ("hola", "menu", "atras", "volver", etc.),
    // selección numérica o intención clara que deba despertar al bot si no hay operador asignado
    const isExplicitGreetingOrMenu = 
        isNavigationBackOrMenu(cleanText) ||
        /^[1-5]$/.test(cleanText.trim()) ||
        /\b(hola+|buenas+|buen\s+d[ií]a+|buenas?\s+tardes?|buenas?\s+noches?)\b/i.test(cleanText) ||
        /\b(turno|cita|consulta|ecograf[ií]a|radiograf[ií]a|tomograf[ií]a|mamograf[ií]a|resonancia|densitometr[ií]a|m[eé]dico|doctor|dra?|especialidad|guardia|urgencia|autorizaci[oó]n|estudio|agente|operador|humano|cancel\w*|reprogram\w*)\b/i.test(cleanText);

    // Detección de cortesía, agradecimiento o calificación en chat ya finalizado
    // Evita desarchivar el chat si el paciente responde "muchas gracias", "👍", "5 estrellas", etc.
    const isCourtesyOrRating = 
        /^(gracias+|muchas\s+gracias|mil\s+gracias|muchisimas\s+gracias|much[ií]simas\s+gracias|gracias\s+por\s+todo|gracias\s+por\s+la\s+atenci[oó]n|gracias\s+a\s+vos|gracias\s+a\s+ustedes|gracias\s+chicos?|gracias\s+chicas?|muy\s+amable|muy\s+atentos?|de\s+nada|por\s+nada|ok+|okei|okay|dale|listo|perfecto|joya|genial|buenisimo|buen[ií]simo|excelente|impecable|de\s+diez|de\s+10|chau+|adi[oó]s|adios|hasta\s+luego|saludos|que\s+tengas?\s+buen\s+d[ií]a|buen\s+d[ií]a\s+gracias|igualmente|[1-5](\s*estrellas?)?|10|[👍👌🙏❤️👏⭐]+)[!.\s]*$/i.test(cleanText.trim()) ||
        (/\b(gracias|muchas gracias|mil gracias|muchisimas gracias|excelente atencion|muy amable|saludos|gracias a vos|gracias chicos)\b/i.test(cleanText.trim()) && cleanText.trim().length <= 70);

    // Ventana de gracia pos-cierre (15 minutos):
    // Si la conversación fue finalizada hace menos de 15 minutos y el paciente envía cortesías o mensajes cortos,
    // NO despertar al bot de inmediato (evita que el bot le hable con el menú de bienvenida tras un 'gracias').
    if (wasClosed && (isCourtesyOrRating || (minutesSinceClosed < 15 && !isExplicitGreetingOrMenu && cleanText.length <= 45))) {
        console.log(`[triage-bot] Chat ${phone} finalizado hace ${minutesSinceClosed.toFixed(1)} min. Mensaje de cortesía pos-cierre ("${cleanText}"). Manteniendo estado ARCHIVADO sin activar bot.`);
        await supabase
            .from('contact_center_conversations')
            .update({
                last_message_text: cleanText,
                last_message_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('phone', phone);
        return;
    }

    // Comprobar si la sesión expiró por tiempo de inactividad
    // Umbral de inactividad: 15 minutos sin mensajes nuevos (configurable en app_config)
    // CRÍTICO: La expiración por inactividad SOLO aplica si la conversación NO está asignada a un agente humano.
    // Si la conversación tiene una agente asignada (conv.assigned_agent_id), NUNCA debe expirar ni desasignarse automáticamente.
    const INACTIVITY_TIMEOUT_MINUTES = cachedInactivityTimeoutMinutes || 15;
    const lastMsgTime = conv?.last_message_at ? new Date(conv.last_message_at).getTime() : 0;
    const minutesSinceLastMsg = lastMsgTime > 0 ? (Date.now() - lastMsgTime) / (1000 * 60) : 0;
    const isSessionExpiredByInactivity = Boolean(
        conv && 
        !conv.assigned_agent_id &&
        lastMsgTime > 0 && 
        minutesSinceLastMsg >= INACTIVITY_TIMEOUT_MINUTES
    );

    // Si el chat estaba cerrado o una sesión NO asignada expiró por inactividad:
    // REACTIVAR TODO A CERO para que el paciente hable con el bot desde 'inicio' como NUEVA SESIÓN
    if (wasClosed || (isSessionExpiredByInactivity && !conv?.assigned_agent_id)) {
        console.log(`[triage-bot] Chat ${phone} ${wasClosed ? 'estaba cerrado' : `inactivo por ${minutesSinceLastMsg.toFixed(1)} min (umbral ${INACTIVITY_TIMEOUT_MINUTES} min)`}. REACTIVANDO SESIÓN A CERO.`);
        await supabase
            .from('contact_center_conversations')
            .update({
                closed_at: null,
                resolution_reason: null,
                closed_by_agent_id: null,
                closed_by_agent_name: null,
                assigned_agent_id: null,
                assigned_agent_name: null,
                assigned_at: null,
                status: 'bot',
                bot_active: true,
                bot_stage: 'inicio',
                motivo_consulta: null,
                medico_o_especialidad: null,
                ai_summary: null,
                updated_at: new Date().toISOString()
            })
            .eq('phone', phone);

        if (conv) {
            conv.assigned_agent_id = null;
            conv.assigned_agent_name = null;
            conv.assigned_at = null;
            conv.closed_at = null;
            conv.resolution_reason = null;
            conv.closed_by_agent_id = null;
            conv.closed_by_agent_name = null;
            conv.status = 'bot';
            conv.bot_active = true;
            conv.bot_stage = 'inicio';
            conv.motivo_consulta = null;
            conv.medico_o_especialidad = null;
            conv.ai_summary = null;
        }
    }

    // 1.1 Si la conversación está asignada a un agente humano en vivo (NUNCA expira por inactividad ni por saludos)
    if (conv && !wasClosed && conv.assigned_agent_id) {
        console.log(`[triage-bot] Chat ${phone} asignado a ${conv.assigned_agent_name || conv.assigned_agent_id}.`);
        const schedule = getContactCenterScheduleInfo();
        const silentUpdates: Record<string, any> = {
            last_message_text: cleanText,
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            bot_active: false
        };
        const candidateDni = extractDniFromText(cleanText);
        if (candidateDni && isValidArgentineDni(candidateDni) && !conv.dni) {
            silentUpdates.dni = candidateDni;
        }

        // Si el paciente escribe fuera de horario laboral, notificarle cuándo retoma la atención
        if (!schedule.isOpen) {
            const aiSummary = typeof conv?.ai_summary === 'object' && conv?.ai_summary !== null ? { ...conv.ai_summary } : {};
            const lastAfterHoursAt = aiSummary.last_after_hours_notice_at ? Number(aiSummary.last_after_hours_notice_at) : 0;
            if (Date.now() - lastAfterHoursAt >= 60 * 60 * 1000) {
                const offHoursReply = getAfterHoursMessage(schedule.nextOpeningText);
                aiSummary.last_after_hours_notice_at = Date.now();
                silentUpdates.ai_summary = aiSummary;
                await supabase.from('contact_center_conversations').update(silentUpdates).eq('phone', phone);
                await sendBotWhatsAppReply(supabase, phone, offHoursReply, lineId);
                console.log(`[triage-bot] 🌙 Chat ${phone} (asignado): Enviado aviso de FUERA DE HORARIO LABORAL.`);
                return;
            }
        }

        await supabase.from('contact_center_conversations').update(silentUpdates).eq('phone', phone);
        return;
    }

    // 1.2 Si el bot fue silenciado o está esperando agente (y no expiró por inactividad)
    if (conv && !wasClosed && !isSessionExpiredByInactivity && (conv.bot_active === false || conv.bot_stage === 'esperando_agente')) {
        if (!isExplicitGreetingOrMenu) {
            console.log(`[triage-bot] Chat ${phone} en espera de asesor (bot_active=false o bot_stage=${conv.bot_stage}).`);
            const silentUpdates: Record<string, any> = {
                last_message_text: cleanText,
                last_message_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            const additionalTags = resolveBotTags(
                cleanText,
                Array.isArray(conv?.tags) ? conv.tags : [],
                {
                    botStage: conv.bot_stage,
                    motivoConsulta: conv.motivo_consulta
                }
            );
            if (additionalTags.length > 0) {
                silentUpdates.tags = additionalTags;
            }
            const extractedDni = extractDniFromText(cleanText);
            if (extractedDni && isValidArgentineDni(extractedDni) && !conv.dni) {
                silentUpdates.dni = extractedDni;
                try {
                    const { data: pFound } = await supabase
                        .from('hospital_pacientes')
                        .select('dni, nombre, coseguro, nhc')
                        .eq('dni', extractedDni)
                        .limit(1)
                        .maybeSingle();
                    if (pFound) {
                        silentUpdates.nombre_completo = pFound.nombre;
                        silentUpdates.obra_social = pFound.coseguro || conv?.obra_social;
                        silentUpdates.nhc = pFound.nhc || conv?.nhc;
                        silentUpdates.es_paciente_existente = true;
                    }
                } catch (_) {}
            }

            const schedule = getContactCenterScheduleInfo();
            const nowMs = Date.now();
            const aiSummary = typeof conv?.ai_summary === 'object' && conv?.ai_summary !== null ? { ...conv.ai_summary } : {};

            // 1.2.A: REGLA FUERA DE HORARIO LABORAL (MÁS IMPORTANTE)
            // Si el paciente escribe fuera del horario de atención, notificarle de inmediato
            if (!schedule.isOpen) {
                const lastAfterHoursAt = aiSummary.last_after_hours_notice_at ? Number(aiSummary.last_after_hours_notice_at) : 0;
                // Si nunca se le avisó o pasaron más de 60 minutos desde el último aviso de fuera de horario:
                if (nowMs - lastAfterHoursAt >= 60 * 60 * 1000) {
                    const offHoursReply = getAfterHoursMessage(schedule.nextOpeningText);
                    aiSummary.last_after_hours_notice_at = nowMs;
                    silentUpdates.ai_summary = aiSummary;
                    await supabase.from('contact_center_conversations').update(silentUpdates).eq('phone', phone);
                    await sendBotWhatsAppReply(supabase, phone, offHoursReply, lineId);
                    console.log(`[triage-bot] 🌙 Chat ${phone}: Enviado aviso de FUERA DE HORARIO LABORAL.`);
                    return;
                }
            } else {
                // 1.2.B: REGLA DE ESPERA / DEMORA EN HORARIO LABORAL (CADA 20 MIN)
                // Se envía si pasaron al menos 20 minutos desde el último aviso de demora o mensaje saliente
                const lastDelayAt = aiSummary.last_delay_notice_at ? Number(aiSummary.last_delay_notice_at) : 0;
                const DELAY_INTERVAL_MS = 20 * 60 * 1000; // 20 minutos

                // También verificar cuándo fue el último mensaje de la conversación si no hay last_delay_at
                const lastConvMsgAt = conv?.last_message_at ? new Date(conv.last_message_at).getTime() : 0;
                const referenceTime = lastDelayAt > 0 ? lastDelayAt : lastConvMsgAt;

                if (nowMs - referenceTime >= DELAY_INTERVAL_MS) {
                    const delayReply = getDelayWaitNoticeMessage();
                    aiSummary.last_delay_notice_at = nowMs;
                    silentUpdates.ai_summary = aiSummary;
                    await supabase.from('contact_center_conversations').update(silentUpdates).eq('phone', phone);
                    await sendBotWhatsAppReply(supabase, phone, delayReply, lineId);
                    console.log(`[triage-bot] ⏳ Chat ${phone}: Enviado aviso de DEMORA EN ATENCIÓN (intervalo 20m cumplido).`);
                    return;
                }
            }

            await supabase.from('contact_center_conversations').update(silentUpdates).eq('phone', phone);
            return;
        } else {
            console.log(`[triage-bot] Chat ${phone} reactivado por saludo o solicitud de menú ("${cleanText}"). Tratando como nueva consulta.`);
            conv.bot_active = true;
            conv.bot_stage = 'inicio';
            conv.medico_o_especialidad = null;
            conv.motivo_consulta = null;
            conv.ai_summary = null;
            conv.status = 'bot';
            conv.assigned_agent_id = null;
            conv.assigned_agent_name = null;
            conv.assigned_at = null;
            conv.closed_at = null;
            conv.resolution_reason = null;
            conv.closed_by_agent_id = null;
            conv.closed_by_agent_name = null;
        }
    }

    let currentIntent: string | null = null;
    let currentStage = (wasClosed || isSessionExpiredByInactivity ? 'inicio' : (conv?.bot_stage || 'inicio'));
    let replyText = '';
    let nextStage = currentStage;
    let updates: Record<string, any> = {
        last_message_text: cleanText,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    /**
     * Helper unificado para garantizar que CUALQUIER salida o bifurcación del chatbot:
     * 1. Persista el estado limpio en contact_center_conversations
     * 2. Despache el mensaje por WhatsApp al paciente vía sendBotWhatsAppReply
     * 3. Evite que el bot quede en silencio o "colgado"
     */
    const finalizeAndSend = async (reply: string, stage: string, extraUpdates: Record<string, any> = {}) => {
        const merged = { ...updates, ...extraUpdates };
        let finalStage = stage || nextStage || currentStage;

        if (!conv?.assigned_agent_id) {
            if (merged.bot_active === false || finalStage === 'esperando_agente' || merged.status === 'sin_asignar') {
                merged.status = 'sin_asignar';
                merged.bot_active = false;
                if (!finalStage || finalStage === currentStage || finalStage === 'inicio') {
                    finalStage = 'esperando_agente';
                }
            } else {
                merged.status = 'bot';
                merged.bot_active = true;
            }
        }
        merged.bot_stage = finalStage;

        // Asignación de etiquetas inteligentes institucionales (Autorización, Cancelación, Reprogramación)
        const computedTags = resolveBotTags(
            cleanText,
            merged.tags || conv?.tags || [],
            {
                intent: currentIntent || merged.intent || extraUpdates.intent,
                botStage: finalStage,
                motivoConsulta: merged.motivo_consulta || conv?.motivo_consulta,
                gestionTurno: extraUpdates.gestion_turno || merged.gestion_turno
            }
        );

        if (finalStage === 'esperando_datos_turno' || merged.bot_stage === 'esperando_datos_turno') {
            merged.tags = computedTags.filter(t => t !== 'Cancelación' && t !== 'Reprogramación');
        } else if (isNavigationBackOrMenu(cleanText)) {
            merged.tags = [];
        } else {
            merged.tags = computedTags;
        }

        const cleanUpdates: Record<string, any> = {};
        for (const [key, val] of Object.entries(merged)) {
            if (VALID_CONVERSATION_COLUMNS.has(key)) {
                cleanUpdates[key] = val;
            }
        }

        const { error: upsertErr } = await supabaseRetry(
            () => supabase
                .from('contact_center_conversations')
                .upsert({
                    phone,
                    ...cleanUpdates
                }, { onConflict: 'phone' }),
            `upsert conversation triage (${phone})`
        );

        if (upsertErr) {
            console.error('[triage-bot] ❌ Error actualizando contact_center_conversations (tras reintentos):', upsertErr);
        } else {
            console.log(`[triage-bot] ✅ Conversación ${phone} persistida (stage: ${finalStage}, bot_active: ${cleanUpdates.bot_active})`);
        }

        // Enviar el mensaje saliente al paciente vía WhatsApp SOLO si hay respuesta explícita
        if (reply) {
            await sendBotWhatsAppReply(supabase, phone, reply, lineId);
        }

        return { replyText: reply, nextStage: finalStage };
    };

    if (wasClosed || isSessionExpiredByInactivity || isExplicitGreetingOrMenu) {
        updates.closed_at = null;
        updates.resolution_reason = null;
        updates.closed_by_agent_id = null;
        updates.closed_by_agent_name = null;
        updates.assigned_agent_id = null;
        updates.assigned_agent_name = null;
        updates.assigned_at = null;
        updates.status = 'bot';
        updates.bot_active = true;
        updates.bot_stage = 'inicio';
        updates.motivo_consulta = null;
        updates.medico_o_especialidad = null;
        updates.ai_summary = null;
        if (conv) {
            conv.medico_o_especialidad = null;
            conv.motivo_consulta = null;
            conv.ai_summary = null;
            conv.bot_stage = 'inicio';
            conv.status = 'bot';
            conv.bot_active = true;
        }
    }

    // 1. Identificar al paciente EXCLUSIVAMENTE por DNI en el mensaje actual (nunca pre-mapear por teléfono)
    // Se utiliza extractDniFromText para evitar falsos positivos con fechas de nacimiento (DD/MM/AAAA) o teléfonos
    const candidateDni: string | null = extractDniFromText(cleanText);
    const dniInMessage = candidateDni;

    // Persistencia y memoria: DNI en el mensaje actual O DNI previamente validado y registrado en la conversación
    const establishedConvDni = (conv?.dni && isValidArgentineDni(conv.dni)) ? conv.dni : null;
    const effectiveDni = dniInMessage || establishedConvDni || null;

    let paciente: any = null;

    if (effectiveDni) {
        try {
            const { data: pByDni, error: pacError } = await supabase
                .from('hospital_pacientes')
                .select('id_paciente, dni, nombre, coseguro, telefono, email, nhc, centro, edad, fecha_nacimiento')
                .eq('dni', effectiveDni)
                .limit(1)
                .maybeSingle();

            if (pByDni) {
                paciente = pByDni;
                console.log(`[triage-bot] Paciente identificado por DNI ${effectiveDni}: ${paciente.nombre} (HC: ${paciente.nhc})`);
            } else {
                console.log(`[triage-bot] DNI ${effectiveDni} no figura en padrón institucional (usuario nuevo)`);
            }
        } catch (e) {
            console.warn('[triage-bot] Error consultando paciente por DNI:', e);
        }
    }

    // Mapeo del grupo familiar asociado a la línea telefónica
    const cleanLocalPhone = phone.replace(/\D/g, '').replace(/^(?:549|54)/, '');
    let pacientesGrupoFamiliar: any[] = [];
    if (cleanLocalPhone.length >= 8) {
        try {
            const { data: pList } = await supabase
                .from('hospital_pacientes')
                .select('id_paciente, dni, nombre, coseguro, telefono, email, nhc, centro, edad, fecha_nacimiento')
                .ilike('telefono', `%${cleanLocalPhone}%`)
                .order('id_paciente', { ascending: false })
                .limit(5);

            if (pList && pList.length > 0) {
                pacientesGrupoFamiliar = pList;
                console.log(`[triage-bot] ${pList.length} paciente(s) vinculados a la línea ${cleanLocalPhone} en grupo familiar.`);
            }
        } catch (e) {
            console.warn('[triage-bot] Error consultando grupo familiar por teléfono:', e);
        }
    }

    // Inteligencia institucional: Si no se identificó por DNI en el mensaje ni por DNI previo en conversación,
    // pero la línea telefónica pertenece a un paciente del Sanatorio, resolver automáticamente al paciente titular
    if (!paciente && pacientesGrupoFamiliar.length > 0) {
        const titular = pacientesGrupoFamiliar.find(p => Number(p.edad || 0) >= 18) || pacientesGrupoFamiliar[0];
        if (titular && titular.dni) {
            paciente = titular;
            console.log(`[triage-bot] 🔍 Paciente titular resuelto por línea telefónica (${cleanLocalPhone}): ${paciente.nombre} (DNI: ${paciente.dni}, Coseguro: ${paciente.coseguro})`);
        }
    }

    // REGLA INSTITUCIONAL OBLIGATORIA:
    // A la persona en WhatsApp SIEMPRE se le habla por su {name} de WhatsApp (senderName),
    // NUNCA por el nombre legal de SALUS ni en mayúsculas de padrón médico.
    let rawSender = (senderName || '').trim();
    if (!rawSender || rawSender === 'WhatsApp User' || rawSender === 'User' || /^\+?\d+$/.test(rawSender)) {
        rawSender = 'Paciente';
    }
    let whatsappFirstName = rawSender.includes(',') ? rawSender.split(',')[1].trim().split(' ')[0] : rawSender.split(' ')[0];
    if (!whatsappFirstName || whatsappFirstName.length < 2) whatsappFirstName = rawSender;
    
    // whatsappName es el nombre con el que saludamos y conversamos con el usuario
    const whatsappName = whatsappFirstName;

    // patientLegalName es el nombre formal para registrar en la historia clínica / ficha técnica del turno
    const patientLegalName = paciente?.nombre || conv?.nombre_completo || rawSender;
    const fullName = whatsappName; // Mantener compatibilidad interna llamando al usuario por su {name}
    const os = (paciente?.coseguro || 'Particular / A confirmar').trim();
    const dniTitular = paciente?.dni || dniInMessage || null;

    const isExistingPatient = Boolean(paciente);

    if (paciente) {
        updates = {
            ...updates,
            dni: dniTitular,
            nombre_completo: patientLegalName,
            obra_social: os,
            nhc: paciente?.nhc || null,
            fecha_nacimiento: paciente?.fecha_nacimiento || null,
            email: paciente?.email || null,
            telefono_contacto: phone,
            departamento: paciente?.centro || 'San Juan',
            es_paciente_existente: true
        };
    } else if (dniInMessage) {
        updates = {
            ...updates,
            dni: dniInMessage,
            nombre_completo: fullName,
            es_paciente_existente: false
        };
    }

    // 2. VINCULAR TURNOS Y VISITAS PRÓXIMAS (SALUS + ONLINE) EXCLUSIVAMENTE POR DNI EXPLÍCITO
    const resolvedDni = dniTitular || null;
    let turnosActivosProximos: any[] = [];
    let turnoOnlineProximo: any = null;

    if (resolvedDni) {
        try {
            const { data: turnosRes, error: tErr } = await supabase.rpc('buscar_turnos_proximos', {
                p_dni: resolvedDni,
                p_telefono: null
            });
            if (!tErr && Array.isArray(turnosRes) && turnosRes.length > 0) {
                turnosActivosProximos = turnosRes;
                const topTurno = turnosRes[0];
                turnoOnlineProximo = {
                    profesional: topTurno.medico,
                    fecha: topTurno.fecha,
                    hora: topTurno.hora,
                    agenda: topTurno.tipo_agenda || topTurno.especialidad || 'Consultorios',
                    motivo: topTurno.motivo || topTurno.tipo_visita || '',
                    sede: topTurno.sede,
                    obra_social: topTurno.obra_social
                };
                console.log(`[triage-bot] Turnos próximos activos vinculados para ${resolvedDni || phone}: ${turnosRes.length}`);
            }
        } catch (tErr) {
            console.warn('[triage-bot] Error vinculando turnos próximos vía RPC:', tErr);
        }
    }


    // 2.1 RECUPERAR HISTORIAL RECIENTE PARA BRINDAR CONTEXTO CONVERSACIONAL (BOT Y ASESORES HUMANOS)
    const { data: rawHistory } = await supabase
        .from('whatsapp_messages')
        .select('id, direction, sender_name, content, created_at, raw_payload, media_type')
        .eq('phone', phone)
        .order('created_at', { ascending: false })
        .limit(15);

    // Filtrar historial para que contenga ÚNICAMENTE mensajes de la sesión activa:
    // - Si la sesión expiró por inactividad o el chat estaba cerrado: historial vacío para nueva sesión
    // - Descartar mensajes más antiguos que el umbral de inactividad
    // - Si el usuario envió un comando de reinicio ("menú", "hola"), descartar los mensajes previos a ese reinicio
    let activeSessionHistory: any[] = [];
    if (!wasClosed && !isSessionExpiredByInactivity && rawHistory && rawHistory.length > 0) {
        const sessionCutoffTime = Date.now() - (INACTIVITY_TIMEOUT_MINUTES * 60 * 1000);
        const filtered = rawHistory.filter((m: any) => new Date(m.created_at).getTime() >= sessionCutoffTime).reverse();
        const lastRestartIdx = filtered.map((m: any) => 
            m.direction === 'incoming' && /^(hola+|buenas+|buen\s+d[ií]a+|buenas?\s+tardes?|buenas?\s+noches?|menu+|men[uú]+|inicio|comenzar|empezar|reiniciar)[!.\s]*$/i.test(m.content || '')
        ).lastIndexOf(true);
        activeSessionHistory = lastRestartIdx >= 0 ? filtered.slice(lastRestartIdx) : filtered;
    }
    const recentHistory = activeSessionHistory;

    // Detectar si el paciente envió recientemente una imagen o documento (en este mensaje o en los últimos 2)
    const patientSentImageRecently = isIncomingMedia || recentHistory.slice(-3).some((m: any) => 
        m.direction === 'incoming' && (m.media_type === 'image' || m.content === '[image]' || (m.raw_payload && m.raw_payload.media_type === 'image'))
    );

    // Detectar si un asesor humano intervino previamente en el chat
    const agentInterventions = recentHistory.filter((m: any) => 
        m.direction === 'outgoing' && 
        m.sender_name !== 'Bot Sanatorio' && 
        !m.raw_payload?.bot
    );
    const hasAgentIntervened = agentInterventions.length > 0;
    const lastAgentMessage = hasAgentIntervened ? agentInterventions[agentInterventions.length - 1] : null;

    // Detectar último mensaje del bot
    const botMessages = recentHistory.filter((m: any) => 
        m.direction === 'outgoing' && 
        (m.sender_name === 'Bot Sanatorio' || m.raw_payload?.bot)
    );
    const lastBotMessage = botMessages.length > 0 ? botMessages[botMessages.length - 1] : null;
    const lastBotContent = (lastBotMessage?.content || '').toLowerCase();

    // ¿El bot estaba esperando activamente una foto de orden médica / autorización?
    const wasWaitingForPhoto = 
        conv?.bot_stage === 'esperando_orden_foto' ||
        conv?.bot_stage === 'esperando_foto_autorizacion' ||
        lastBotContent.includes('foto clara de la orden') ||
        lastBotContent.includes('foto de la orden médica') ||
        (lastBotContent.includes('envíanos:') && lastBotContent.includes('orden'));

    // ¿La imagen fue enviada de la nada (sin contexto previo del bot ni indicación de trámite en el texto)?
    const isImageWithoutContext = !wasWaitingForPhoto && (
        (isIncomingMedia && (
            cleanText === '[image]' || 
            cleanText === '[document]' || 
            cleanText === '' ||
            /^(hola|buenas|buen\s+dia|buenas\s+tardes|buenas\s+noches|doc|doctor|hola\s+buenas|foto|orden|aca\s+esta|te\s+paso)[!.\s]*$/i.test(cleanText)
        )) ||
        (patientSentImageRecently && /^(hola|buenas|buen\s+dia|buenas\s+tardes|buenas\s+noches|doc|doctor|hola\s+buenas)[!.\s]*$/i.test(cleanText) && (conv?.bot_stage === 'inicio' || wasClosed || !conv))
    );

    // 3. DETECTAR INTENCIÓN Y ENTIDADES (CON MEMORIA CONVERSACIONAL Y SEGUIMIENTO DE ASESORES)
    const conversationContext: ConversationContext = {
        history: recentHistory,
        lastBotMessage,
        lastAgentMessage,
        hasAgentIntervened,
        agentName: lastAgentMessage?.sender_name || conv?.closed_by_agent_name || null,
        turnoOnlineProximo,
        turnosActivosProximos,
        patientName: fullName,
        resolvedDni,
        previousResolutionReason: wasClosed ? conv?.resolution_reason : null,
        botStage: conv?.bot_stage || null
    };

    const analysis = await detectIntentAndEntities(supabase, cleanText, conversationContext);
    currentIntent = analysis?.intent || null;
    console.log(`[triage-bot] Análisis contextual para "${cleanText}":`, analysis);

    // =============================================
    // FLUJO: GESTIÓN DE TURNOS (CANCELAR / REPROGRAMAR) — el bot registra, el agente opera en SALUS
    // =============================================
    const isGestionTurnoIntent =
        analysis.intent === 'cancelar_turno_online' ||
        analysis.intent === 'reprogramar_turno_online' ||
        (analysis.intent === 'gestion_turno_flujo' && GESTION_TURNO_STAGES.has(currentStage));
    if (isGestionTurnoIntent && !isExplicitGreetingOrMenu && !isIncomingMedia) {
        const gestion = await handleGestionTurnoFlow({
            supabase,
            cleanText,
            intent: analysis.intent,
            currentStage,
            conv,
            knownDni: resolvedDni || conv?.dni || null,
            dniInMessage: dniMatch ? dniMatch[0] : null,
            turnosDni: resolvedDni,
            turnosConocidos: turnosActivosProximos,
            whatsappName
        });
        console.log(`[triage-bot] Gestión de turno (${analysis.intent}) ${currentStage} → ${gestion.stage}`);
        return await finalizeAndSend(gestion.reply, gestion.stage, { ...updates, ...gestion.updates });
    }

    // Construir etiqueta de doctor SOLO si fue verificado en base de datos o venía con Dr./Dra. explícito y no es stopword
    let rawDocName = analysis.doctorRecord?.profesional_nombre || null;
    if (!rawDocName && analysis.doctorCandidate && !STOPWORDS_MEDICOS.has(analysis.doctorCandidate.toLowerCase())) {
        const explicitDocRegex = new RegExp(`\\b(?:doctor|doctora|dr|dra)\\.?\\s+${analysis.doctorCandidate}\\b`, 'i');
        if (explicitDocRegex.test(cleanText)) {
            rawDocName = analysis.doctorCandidate.charAt(0).toUpperCase() + analysis.doctorCandidate.slice(1).toLowerCase();
        }
    }
    if (rawDocName) {
        rawDocName = rawDocName.replace(/^\([^)]+\)\s*/, '').replace(/\s*\([^)]+\)$/, '').replace(/\s+SSLN$/i, '').replace(/\s+SEDE\s+\d+/i, '').trim();
    }
    const isDocFemale = rawDocName && /\b(dra\.?|doctora|agustina|ana|sonia|laura|silvia|lucia|lucía|julieta|marisa|cintia|paulina|daniela|mariana|maria|valeria|patricia|carolina|veronica|romina|natalia|vanesa|gabriela|lorena|cecilia|marcela|andrea|elena|claudia|bertha)\b/i.test(rawDocName);
    const hasHonorific = rawDocName && /^(dr|dra)\.?/i.test(rawDocName);
    const doctorDisplay = rawDocName ? (hasHonorific ? rawDocName : (isDocFemale ? `Dra. ${rawDocName}` : `Dr. ${rawDocName}`)) : null;
    const doctorSpecialty = analysis.doctorRecord?.especialidad ? ` (${analysis.doctorRecord.especialidad})` : '';


    // Si encontramos múltiples doctores homónimos, consultar al paciente cuál necesita con opciones a-, b-, c-...
    if (analysis.multipleDoctors && analysis.multipleDoctors.length > 1 && analysis.intent !== 'volver_atras') {
        const docList = analysis.multipleDoctors;
        const letters = ['a', 'b', 'c', 'd', 'e'];
        const capSurname = analysis.doctorCandidate 
            ? (analysis.doctorCandidate.charAt(0).toUpperCase() + analysis.doctorCandidate.slice(1).toLowerCase())
            : '';
        
        let menuDocs = `Por favor, ¿qué doctor/a ${capSurname}?\n\n`;
        
        docList.forEach((d: any, idx: number) => {
            const letter = letters[idx] || `${idx + 1}`;
            const info = d.formattedInfo || formatDoctorDisplay(d);
            const nameFormatted = info.cleanSurnameAndName || info.displayName.replace(/^Dr[a]?\.\s*/i, '');
            menuDocs += `*${letter}-* ${nameFormatted} (${info.specialty})\n`;
        });
        
        menuDocs += `\nPodés responder con la letra (*a*, *b*...) o escribir el nombre.\n\n` +
            `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"* | 👤 *Agente:* Escribí *"Agente"*`;
        
        replyText = menuDocs;
        updates.status = 'bot';
        updates.bot_active = true;
        updates.bot_stage = 'esperando_seleccion_medico';
        nextStage = 'esperando_seleccion_medico';
        updates.motivo_consulta = `Selección de Médico (${analysis.doctorCandidate ? analysis.doctorCandidate.toUpperCase() : 'Homónimo'})`;
        updates.medico_o_especialidad = `Homónimos: ${capSurname || 'Buteler'}`;

        // Preservar datos aportados en el mismo mensaje para no volver a pedirlos
        if (candidateDni) updates.dni = candidateDni;
        const autoOs = (await extractPatientVariables(cleanText, candidateDni))?.obra_social;
        if (autoOs) updates.obra_social = autoOs;

        updates.ai_summary = {
            ...(conv?.ai_summary || {}),
            candidates_medicos: docList,
            pending_os: autoOs || updates.obra_social || conv?.obra_social || null,
            preferencia_horaria: /mañana|tarde|siesta/i.exec(cleanText)?.[0] || null
        };
        return await finalizeAndSend(replyText, nextStage, updates);
    }

    // =============================================
    // FLUJO ESPECIAL: AUDIO SIN TRANSCRIPCIÓN DETECTABLE (RUIDO O SILENCIO)
    // Si el paciente envía un audio pero no se pudo transcribir texto perceptible
    // =============================================
    if (cleanText === '[audio]' || cleanText === '[voice]' || (!cleanText.trim() && (mediaType === 'audio' || mediaType === 'voice'))) {
        console.log(`[triage-bot] Chat ${phone}: Audio recibido sin texto perceptible.`);
        replyText = `Disculpá, no pudimos escuchar con claridad tu audio por el ruido de fondo o volumen bajo 🎧.\n\n` +
            `Por favor, ¿nos podrías reenviar tu consulta o escribirla por este medio para poder orientarte?\n\n` +
            `🔙 *Volver:* Escribí *"Menú"* | 👤 *Agente:* Escribí *"Agente"*`;
        updates.status = 'bot';
        updates.bot_active = true;
        updates.bot_stage = 'menu_opciones';
        nextStage = 'menu_opciones';
        updates.motivo_consulta = 'Audio no perceptible (solicitud de reenvío)';
        return await finalizeAndSend(replyText, nextStage, updates);
    }

    // =============================================
    // FLUJO ESPECIAL: IMAGEN U ORDEN MÉDICA ENVIADA SIN CONTEXTO PREVIO
    // Si el paciente envía una foto/documento sin que el bot la haya pedido previamente,
    // o saluda inmediatamente después de haberla enviado, consultarle qué gestión desea realizar.
    // =============================================
    if (isImageWithoutContext) {
        console.log(`[triage-bot] Chat ${phone}: Imagen/orden médica enviada sin contexto previo. Preguntando al paciente qué desea realizar.`);
        updates.motivo_consulta = 'Imagen / Orden médica recibida (aguardando selección de trámite)';
        updates.bot_stage = 'menu_opciones';
        updates.bot_active = true;
        nextStage = 'menu_opciones';

        if (isExistingPatient) {
            replyText = `¡Hola *${fullName}*! 🏥 Recibimos tu imagen / orden médica.\n\n` +
                `Para orientarte con la gestión correspondiente, por favor indícanos qué deseás realizar:\n\n` +
                `1️⃣ *Solicitar un turno* para el estudio o práctica médica\n` +
                `2️⃣ *Autorización de orden médica* (para presentar a tu obra social o coseguro)\n` +
                `3️⃣ *Presupuesto o aranceles particulares*\n` +
                `4️⃣ *Hablar con un agente*\n\n` +
                `Podés responder directamente con el número *1*, *2*, *3* o *4*, o detallarnos tu consulta por escrito.`;
        } else {
            replyText = `¡Hola! 👋 Te damos la bienvenida a *Sanatorio Argentino*. Recibimos tu imagen / orden médica.\n\n` +
                `Para orientarte con la gestión correspondiente, por favor indícanos qué deseás realizar:\n\n` +
                `1️⃣ *Solicitar un turno* para el estudio o práctica médica\n` +
                `2️⃣ *Autorización de orden médica* (para presentar a tu obra social o cobertura)\n` +
                `3️⃣ *Presupuesto o aranceles particulares*\n` +
                `4️⃣ *Hablar con un agente*\n\n` +
                `Podés responder directamente con el número *1*, *2*, *3* o *4*, o escribirnos tu consulta junto a tu *Nombre y Apellido* y *DNI*.`;
        }
    }
    // =============================================
    // FLUJO 0A: SALUDO INICIAL / MENÚ DE BIENVENIDA
    // =============================================
    else if (analysis.intent === 'saludo_inicial') {
        replyText = getWelcomeMenuMessage(fullName);
        updates.status = 'bot';
        updates.bot_stage = 'menu_bienvenida';
        updates.bot_active = true;
        nextStage = 'menu_bienvenida';
        updates.motivo_consulta = 'Menú de Bienvenida (esperando selección)';
        return await finalizeAndSend(replyText, nextStage, updates);
    }
    // =============================================
    // FLUJO 0A-1: SALUDO DENTRO DE FLUJO ACTIVO (SIN RESETEAR)
    // =============================================
    else if (analysis.intent === 'saludo_en_flujo') {
        replyText = `¡Hola *${whatsappName}*! 😊 Continuamos coordinando tu consulta.\n\n` +
            `Por favor indícanos los datos que te solicitamos para avanzar con tu trámite (o si deseás volver a ver todas las opciones, escribí *"Menú"*).`;
        updates.status = 'bot';
        updates.bot_active = true;
        nextStage = currentStage;
        return await finalizeAndSend(replyText, nextStage, updates);
    }
    // =============================================
    // FLUJO 0A-2: VOLVER ATRÁS / MENÚ PRINCIPAL (REACTIVACIÓN OBLIGATORIA A ESTADO 'BOT')
    // =============================================
    else if (analysis.intent === 'volver_atras' || isNavigationBackOrMenu(cleanText)) {
        replyText = `¡Entendido! Te muestro nuevamente nuestras opciones principales de atención:\n\n` + getWelcomeMenuMessage(whatsappName);
        updates.status = 'bot'; // OBLIGATORIO: volver al estado 'bot', NUNCA 'sin_asignar'
        updates.bot_active = true;
        updates.bot_stage = 'menu_bienvenida';
        updates.assigned_agent_id = null;
        updates.assigned_agent_name = null;
        updates.assigned_at = null;
        updates.medico_o_especialidad = null;
        updates.motivo_consulta = 'Menú Principal (solicitado por usuario)';
        updates.ai_summary = null;
        if (conv) {
            conv.medico_o_especialidad = null;
            conv.motivo_consulta = null;
            conv.ai_summary = null;
            conv.bot_stage = 'menu_bienvenida';
            conv.status = 'bot';
            conv.bot_active = true;
        }
        nextStage = 'menu_bienvenida';
        return await finalizeAndSend(replyText, nextStage, updates);
    }
    // =============================================
    // FLUJO 0A-2B: SELECCIÓN DE MÉDICO HOMÓNIMO
    // =============================================
    else if (currentStage === 'esperando_seleccion_medico') {
        let storedDocs = (conv?.ai_summary as any)?.candidates_medicos || [];

        // Recuperación resiliente si candidates_medicos no está en memoria o fue sobrescrito
        if (!Array.isArray(storedDocs) || storedDocs.length === 0) {
            const surnameMatch = conv?.medico_o_especialidad?.replace(/^Homónimos:\s*/i, '') || 
                                 conv?.motivo_consulta?.match(/Selección de Médico \(([^)]+)\)/i)?.[1] || 
                                 lastBotMessage?.content?.match(/doctor\/a\s+([^\n?]+)/i)?.[1]?.trim() || 
                                 'Buteler';

            if (surnameMatch) {
                try {
                    const { data: fallbackDocs } = await supabase
                        .from('contact_center_doctor_parameters')
                        .select('id, profesional_nombre, especialidad, consultorio_actual, condiciones_consulta')
                        .ilike('profesional_nombre', `%${surnameMatch.trim()}%`)
                        .limit(15);
                    
                    if (fallbackDocs && fallbackDocs.length > 0) {
                        const enriched = fallbackDocs.map((d: any) => {
                            const info = formatDoctorDisplay(d);
                            return { ...d, formattedInfo: info, displayName: info.displayName, cleanSpecialty: info.specialty };
                        });
                        const uniqueMap = new Map();
                        for (const d of enriched) {
                            const k = d.displayName.toLowerCase();
                            if (!uniqueMap.has(k)) {
                                uniqueMap.set(k, d);
                            } else {
                                const ex = uniqueMap.get(k);
                                if ((d.condiciones_consulta?.length || 0) > (ex.condiciones_consulta?.length || 0)) {
                                    uniqueMap.set(k, d);
                                }
                            }
                        }
                        storedDocs = Array.from(uniqueMap.values()).slice(0, 5);
                        console.log(`[triage-bot] 🔄 Fallback de homónimos reconstruyó ${storedDocs.length} médicos para '${surnameMatch}'`);
                    }
                } catch (fbErr) {
                    console.warn('[triage-bot] Error reconstruyendo candidatos homónimos:', fbErr);
                }
            }
        }

        let selectedDoc: any = null;
        const trimmed = cleanText.trim().toLowerCase();

        // 1. Selección por letra (a, b, c, d, e) o número (1, 2, 3, 4, 5)
        const isLetterA = /^(a|opci[oó]n\s*a|la\s*a|con\s*a|el\s*a|letra\s*a)[\).\-_]?(\s+.*)?$/i.test(trimmed) || /^(1|1️⃣|opci[oó]n\s*1|la\s*1|el\s*1)[\).\-_]?(\s+.*)?$/i.test(trimmed);
        const isLetterB = /^(b|opci[oó]n\s*b|la\s*b|con\s*b|el\s*b|letra\s*b)[\).\-_]?(\s+.*)?$/i.test(trimmed) || /^(2|2️⃣|opci[oó]n\s*2|la\s*2|el\s*2)[\).\-_]?(\s+.*)?$/i.test(trimmed);
        const isLetterC = /^(c|opci[oó]n\s*c|la\s*c|con\s*c|el\s*c|letra\s*c)[\).\-_]?(\s+.*)?$/i.test(trimmed) || /^(3|3️⃣|opci[oó]n\s*3|la\s*3|el\s*3)[\).\-_]?(\s+.*)?$/i.test(trimmed);
        const isLetterD = /^(d|opci[oó]n\s*d|la\s*d|con\s*d|el\s*d|letra\s*d)[\).\-_]?(\s+.*)?$/i.test(trimmed) || /^(4|4️⃣|opci[oó]n\s*4|la\s*4|el\s*4)[\).\-_]?(\s+.*)?$/i.test(trimmed);
        const isLetterE = /^(e|opci[oó]n\s*e|la\s*e|con\s*e|el\s*e|letra\s*e)[\).\-_]?(\s+.*)?$/i.test(trimmed) || /^(5|5️⃣|opci[oó]n\s*5|la\s*5|el\s*5)[\).\-_]?(\s+.*)?$/i.test(trimmed);

        if (isLetterA && storedDocs[0]) selectedDoc = storedDocs[0];
        else if (isLetterB && storedDocs[1]) selectedDoc = storedDocs[1];
        else if (isLetterC && storedDocs[2]) selectedDoc = storedDocs[2];
        else if (isLetterD && storedDocs[3]) selectedDoc = storedDocs[3];
        else if (isLetterE && storedDocs[4]) selectedDoc = storedDocs[4];
        else {
            // 2. Búsqueda por nombre de pila o especialidad dentro de los médicos ofrecidos
            const words = trimmed.split(/[\s,.\-_/]+/).filter((w: string) => w.length >= 3 && !STOPWORDS_MEDICOS.has(w));
            
            selectedDoc = storedDocs.find((d: any) => {
                const info = d.formattedInfo || formatDoctorDisplay(d);
                const docText = `${d.profesional_nombre} ${info.displayName} ${info.specialty} ${d.condiciones_consulta || ''}`.toLowerCase();
                return words.some((w: string) => {
                    const rx = new RegExp(`\\b${w}\\b`, 'i');
                    return rx.test(docText);
                });
            });
            
            // Si no se encontró en storedDocs, buscar coincidencia por palabras completas en el nombre
            if (!selectedDoc && words.length > 0) {
                for (const w of words) {
                    const rx = new RegExp(`\\b${w}\\b`, 'i');
                    const found = storedDocs.find((d: any) => rx.test(d.profesional_nombre));
                    if (found) { selectedDoc = found; break; }
                }
            }
        }

        if (selectedDoc) {
            const info = selectedDoc.formattedInfo || formatDoctorDisplay(selectedDoc);
            updates.medico_o_especialidad = `${info.displayName} (${info.specialty})`;
            updates.motivo_consulta = `Solicitud de Turno: ${info.displayName} (${info.specialty})`;
            
            const effectiveDni = candidateDni || updates.dni || conv?.dni || paciente?.dni || null;
            const extractedOs = (await extractPatientVariables(cleanText, candidateDni))?.obra_social;
            const effectiveOs = extractedOs || updates.obra_social || conv?.obra_social || paciente?.coseguro || null;

            if (effectiveDni && effectiveOs && !effectiveOs.toLowerCase().includes('a confirmar')) {
                const estudioRequiereOrden = detectEstudioConOrden(info.specialty) || detectEstudioConOrden(cleanText);
                const hasSentOrderPhoto = isIncomingMedia || patientSentImageRecently || Boolean(conv?.order_analysis) || Boolean((conv?.ai_summary as any)?.medical_order);

                if (estudioRequiereOrden && !hasSentOrderPhoto) {
                    replyText = `¡Muchas gracias *${whatsappName}*! 🏥 Registramos tu solicitud para *${info.displayName}* (${info.specialty}).\n\n` +
                        `• *DNI:* ${effectiveDni}\n` +
                        `• *Cobertura:* ${effectiveOs}\n\n` +
                        `📋 *Paso necesario:* Para poder autorizar y coordinar estudios de diagnóstico por imágenes (*${estudioRequiereOrden}*), es requisito indispensable contar con el pedido médico prescripto por el profesional.\n\n` +
                        `📸 Por favor, *envíanos una foto clara o archivo PDF de la orden médica / pedido médico* por este medio.\n\n` +
                        `_(En cuanto nos envíes la foto, un agente agendará tu turno en nuestro sistema institucional con la orden correspondiente)._\n\n` +
                        `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"*`;
                    updates.status = 'bot';
                    updates.bot_active = true;
                    updates.bot_stage = 'esperando_orden_foto';
                    nextStage = 'esperando_orden_foto';
                    updates.motivo_consulta = `Solicitud de Turno: ${info.displayName} (${info.specialty}) [Aguardando pedido médico]`;
                    updates.ai_summary = {
                        ...buildTriageSummary(updates, 'turno', selectedDoc, Boolean(paciente), paciente?.edad),
                        estudio_requiere_orden: estudioRequiereOrden,
                        esperando_pedido_medico: true
                    };
                } else {
                    // YA TENEMOS DNI Y OBRA SOCIAL -> CONFIRMACIÓN INMEDIATA
                    replyText = `¡Muchas gracias *${whatsappName}*! 🏥 Registramos tu turno con *${info.displayName}* (${info.specialty}).\n\n` +
                        `• *DNI:* ${effectiveDni}\n` +
                        `• *Cobertura:* ${effectiveOs}\n\n` +
                        `Un agente del equipo de Sanatorio Argentino agendará tu turno en nuestro sistema institucional y te confirmará los detalles a la brevedad.\n\n` +
                        `${getAgentHandoffNotice()}\n\n` +
                        `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"*`;
                    updates.status = 'sin_asignar';
                    updates.bot_active = false;
                    nextStage = 'esperando_agente';
                    updates.ai_summary = buildTriageSummary(updates, 'turno', selectedDoc, Boolean(paciente), paciente?.edad);
                }
            } else if (effectiveDni && (!effectiveOs || effectiveOs.toLowerCase().includes('a confirmar'))) {
                // TENEMOS DNI PERO FALTA OBRA SOCIAL -> PREGUNTAR OBRA SOCIAL
                replyText = `¡Perfecto *${whatsappName}*! 🏥 Registramos tu preferencia para atenderte con *${info.displayName}* (${info.specialty}) y tu DNI *${effectiveDni}*.\n\n` +
                    `📋 Para verificar tu cobertura en nuestro sistema y confirmar la cita, por favor indícanos tu *Obra Social / Prepaga y Plan* (ej: OSP Plan Tradicional, OSDE 210, Swiss Medical, o Particular):\n\n` +
                    `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"* | 👤 *Agente:* Escribí *"Agente"*`;
                updates.status = 'bot';
                updates.bot_active = true;
                nextStage = 'esperando_obra_social_paciente';
                updates.bot_stage = 'esperando_obra_social_paciente';
            } else {
                // FALTA DNI (Y/O OBRA SOCIAL) -> PREGUNTAR DNI Y PREFERENCIA HORARIA
                replyText = `¡Perfecto *${whatsappName}*! Registramos tu preferencia para atenderte con *${info.displayName}* (${info.specialty}).\n\n` +
                    `Para coordinar tu cita, por favor indícanos:\n` +
                    (effectiveDni ? '' : `• Número de *DNI del paciente* (sin puntos ni espacios)\n`) +
                    (effectiveOs ? '' : `• *Obra Social / Prepaga* y plan (o si tu atención será Particular)\n`) +
                    `• Preferencia de *días y horarios* (mañana o tarde)\n\n` +
                    `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"* | 👤 *Agente:* Escribí *"Agente"*`;
                updates.status = 'bot';
                updates.bot_active = true;
                nextStage = 'esperando_datos_turno';
                updates.bot_stage = 'esperando_datos_turno';
            }
        } else {
            // VERIFICACIÓN INTELIGENTE DE RESPUESTAS DISTINTAS A LAS OPCIONES OFRECIDAS:
            
            // A) El paciente indica que es para otra persona / familiar (ej: "Es para otro", "para un familiar", etc.)
            const isFamiliarOTercero = /\b(otro\s+paciente|otra\s+persona|no\s+es\s+para\s+m[ií]|es\s+para\s+otro|es\s+para\s+otra|para\s+otro|para\s+otra|para\s+un\s+familiar|es\s+para\s+un\s+familiar|familiar|familiares|mi\s+hijo|mi\s+hija|mi\s+bebe|mi\s+mam[aá]|mi\s+pap[aá]|mi\s+espos[oa]|mi\s+marido|mi\s+se[nñ]ora|para\s+alguien\s+mas)\b/i.test(trimmed);
            
            // B) El paciente rechaza las opciones ofrecidas (ej: "ninguno", "no es ninguno", "otro médico", "no figura", etc.)
            const isRechazoOpciones = /\b(ningun[ao]s?|no\s+es\s+ningun[ao]|ninguna\s+de\s+las\s+opciones|ninguna\s+opcion|otro\s+m[eé]dico|otra\s+doctora|otro\s+doctor|busco\s+a\s+otro|no\s+est[aá]|no\s+figura|no\s+aparece|no\s+es\s+ese|no\s+es\s+esa|no\s+es\s+el|no\s+es\s+la|no\s+era\s+ese|no\s+era\s+esa)\b/i.test(trimmed) || /^(no|no\s+se|ninguno|ninguna|otro|otra)$/i.test(trimmed);

            // C) El paciente pide explícitamente un agente o ayuda
            const isPideAgente = /\b(agente|asesor|asesora|operador|operadora|humano|persona|hablar\s+con\s+alguien)\b/i.test(trimmed);

            // Contador de intentos fallidos en esta etapa
            const previousAttempts = Number(conv?.ai_summary?.intentos_seleccion_medico || 0);

            if (isPideAgente || previousAttempts >= 2) {
                // Derivación directa a asesor humano tras 2 intentos o pedido explícito
                replyText = `¡Comprendido${whatsappName ? ` *${whatsappName}*` : ''}! 👤 Para que puedas coordinar tu turno sin demoras y con el profesional exacto que necesitás, ya mismo te comunico con un asesor de nuestro equipo de atención.\n\n` +
                    `${getAgentHandoffNotice()}\n\n` +
                    `🔙 *Volver:* Escribí *"Menú"*`;
                updates.status = 'sin_asignar';
                updates.bot_active = false;
                nextStage = 'esperando_agente';
                updates.motivo_consulta = `Solicitud de Turno: Derivación tras selección de profesional (${cleanText.substring(0, 50)})`;
                updates.ai_summary = {
                    ...(conv?.ai_summary || {}),
                    triage_reason: 'Derivación por profesional no encontrado en opciones de homónimos',
                    texto_paciente: cleanText
                };
            } else if (isFamiliarOTercero) {
                // El turno es para otra persona / familiar
                replyText = `¡Comprendido${whatsappName ? ` *${whatsappName}*` : ''}! 🏥 Si el turno es para otra persona o un familiar, por favor indícanos:\n\n` +
                    `• *Nombre y Apellido* del paciente\n` +
                    `• *DNI* del paciente (sin puntos ni espacios)\n` +
                    `• *Profesional o Especialidad* que necesita\n` +
                    `• *Obra Social / Prepaga*\n\n` +
                    `🔙 *Volver:* Escribí *"Menú"* | 👤 *Agente:* Escribí *"Agente"*`;
                updates.status = 'bot';
                updates.bot_active = true;
                nextStage = 'esperando_datos_nuevo';
                updates.bot_stage = 'esperando_datos_nuevo';
                updates.motivo_consulta = 'Solicitud de Turno para Tercero / Familiar';
                updates.ai_summary = {
                    ...(conv?.ai_summary || {}),
                    es_familiar: true,
                    intentos_seleccion_medico: 0
                };
            } else if (isRechazoOpciones) {
                // Ninguno de los profesionales ofrecidos coincide
                replyText = `¡Entendido! Si el profesional que buscás no figura en la lista anterior, por favor escribí el *Nombre y Apellido* del médico o la *Especialidad* médica que necesitás.\n\n` +
                    `👤 _Si preferís coordinarlo directamente con nuestro equipo, escribí *\"Agente\"* y te derivamos de inmediato._\n\n` +
                    `🔙 *Volver:* Escribí *"Menú"*`;
                updates.status = 'bot';
                updates.bot_active = true;
                nextStage = 'esperando_seleccion_medico';
                updates.ai_summary = {
                    ...(conv?.ai_summary || {}),
                    intentos_seleccion_medico: previousAttempts + 1,
                    rechazo_opciones_previas: true
                };
            } else if (/\b(autoriz|autorizar|orden|ordenes|órdenes|pedido|pedidos|receta|recetas|coseguro|auditoria|estudio|ecograf[ií]a|laboratorio)\b/i.test(trimmed)) {
                // El paciente solicita autorizar una orden médica o estudio mientras estaba en el menú de médicos
                const capDoc = conv?.medico_o_especialidad?.replace(/^Homónimos:\s*/i, '') || '';
                replyText = `¡Comprendido${whatsappName ? ` *${whatsappName}*` : ''}! 📄 Para tramitar la *autorización de tu orden médica o estudio*, por favor envíanos la *foto clara y legible de la orden* 📸.\n\n` +
                    (capDoc ? `_(Un asesor de nuestro equipo gestionará la orden y la coordinación de tu turno con ${capDoc})._\n\n` : `_(Un asesor de nuestro equipo de autorizaciones revisará la orden con tu cobertura)._\n\n`) +
                    `🔙 *Volver:* Escribí *"Menú"* | 👤 *Agente:* Escribí *"Agente"*`;
                updates.status = 'bot';
                updates.bot_active = true;
                nextStage = 'esperando_foto_autorizacion';
                updates.bot_stage = 'esperando_foto_autorizacion';
                updates.motivo_consulta = `Autorización de Orden Médica / Estudio${capDoc ? ` (${capDoc})` : ''}`;
            } else {
                // Intentar búsqueda abierta de médico con el texto que escribió el paciente (únicamente por apellido)
                let newFoundDoc: any = null;
                const searchWords = trimmed.split(/[\s,.\-_/]+/).filter((w: string) => w.length >= 4 && !STOPWORDS_MEDICOS.has(w));
                
                if (searchWords.length > 0) {
                    try {
                        for (const sw of searchWords) {
                            const { data: altDocs } = await supabase
                                .from('contact_center_doctor_parameters')
                                .select('id, profesional_nombre, especialidad, consultorio_actual, condiciones_consulta')
                                .ilike('profesional_nombre', `${sw} %`)
                                .limit(5);

                            if (altDocs && altDocs.length === 1) {
                                newFoundDoc = altDocs[0];
                                break;
                            }
                        }
                    } catch (_) {}
                }

                if (newFoundDoc) {
                    // Encontró un nuevo médico
                    const info = formatDoctorDisplay(newFoundDoc);
                    updates.medico_o_especialidad = `${info.displayName} (${info.specialty})`;
                    updates.motivo_consulta = `Solicitud de Turno: ${info.displayName} (${info.specialty})`;
                    
                    const effectiveDni = candidateDni || updates.dni || conv?.dni || paciente?.dni || null;
                    const extractedOs = (await extractPatientVariables(cleanText, candidateDni))?.obra_social;
                    const effectiveOs = extractedOs || updates.obra_social || conv?.obra_social || paciente?.coseguro || null;

                    replyText = `¡Perfecto *${whatsappName}*! Registramos tu preferencia para atenderte con *${info.displayName}* (${info.specialty}).\n\n` +
                        `Para coordinar tu cita, por favor indícanos:\n` +
                        (effectiveDni ? '' : `• Número de *DNI del paciente* (sin puntos ni espacios)\n`) +
                        (effectiveOs ? '' : `• *Obra Social / Prepaga* y plan (o si tu atención será Particular)\n`) +
                        `• Preferencia de *días y horarios* (mañana o tarde)\n\n` +
                        `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"* | 👤 *Agente:* Escribí *"Agente"*`;
                    updates.status = 'bot';
                    updates.bot_active = true;
                    nextStage = 'esperando_datos_turno';
                    updates.bot_stage = 'esperando_datos_turno';
                } else {
                    const letters = ['A', 'B', 'C', 'D', 'E'];
                    const count = storedDocs.length;
                    const letterRange = count > 0 ? `*A* o *${letters[count - 1] || 'B'}*` : `*A* o *B*`;
                    replyText = `Por favor seleccioná una de las opciones respondiendo con la letra (${letterRange}), o escribí el nombre del profesional que buscás.\n\n` +
                        `💡 _Si el turno es para otra persona o no encontrás el médico, escribí *\"Es para otro\"* o *\"Agente\"*._\n\n` +
                        `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"* | 👤 *Agente:* Escribí *"Agente"*`;
                    updates.status = 'bot';
                    updates.bot_active = true;
                    nextStage = 'esperando_seleccion_medico';
                    updates.ai_summary = {
                        ...(conv?.ai_summary || {}),
                        intentos_seleccion_medico: previousAttempts + 1
                    };
                }
            }
        }
    }
    // =============================================
    // FLUJO 0A-2C: ESPERANDO FOTO DE AUTORIZACIÓN DE ORDEN MÉDICA
    // =============================================
    else if (currentStage === 'esperando_foto_autorizacion') {
        const isReferencingPreviousPhoto = /\b(es\s+la\s+(?:foto\s+)?que\s+mand[eé]|ya\s+la\s+mand[eé]|la\s+foto\s+anterior|la\s+que\s+mand[eé]\s+antes|la\s+de\s+arriba|te\s+la\s+mand[eé]\s+reci[eé]n)\b/i.test(cleanText);

        if (isIncomingMedia) {
            // El paciente envió la foto o documento de la orden médica a autorizar
            replyText = `¡Muchas gracias${fullName ? ` *${fullName}*` : ''}! 📄 Recibimos la foto de tu orden médica para autorizar.\n\n` +
                `Un asesor de nuestro equipo de autorizaciones revisará la orden con tu obra social/prepaga y te confirmará la gestión a la brevedad.\n\n` +
                `${getAgentHandoffNotice()}\n\n` +
                `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"*`;
            updates.status = 'sin_asignar';
            updates.bot_active = false;
            nextStage = 'esperando_agente';
            updates.motivo_consulta = 'Foto de Orden Médica Recibida (para Autorización)';
            updates.ai_summary = buildTriageSummary(updates, 'autorizacion', analysis.doctorRecord, isExistingPatient, paciente?.edad);
            return await finalizeAndSend(replyText, nextStage, updates);
        } else if (isReferencingPreviousPhoto) {
            // El paciente aclara que la foto enviada previamente es la orden a autorizar
            replyText = `¡Perfecto${fullName ? ` *${fullName}*` : ''}! 📄 Tomamos la imagen que nos enviaste anteriormente para tramitar tu autorización.\n\n` +
                `Un asesor de nuestro equipo de autorizaciones gestionará la orden con tu obra social/prepaga y te responderá a la brevedad.\n\n` +
                `${getAgentHandoffNotice()}\n\n` +
                `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"*`;
            updates.status = 'sin_asignar';
            updates.bot_active = false;
            nextStage = 'esperando_agente';
            updates.motivo_consulta = 'Autorización de Orden Médica (orden identificada en foto previa)';
            updates.ai_summary = buildTriageSummary(updates, 'autorizacion', analysis.doctorRecord, isExistingPatient, paciente?.edad);
            return await finalizeAndSend(replyText, nextStage, updates);
        } else {
            // El paciente envió datos por texto (ej: DNI, Obra Social) pero aún no la foto
            const extractedDni = candidateDni || updates.dni || conv?.dni;
            const dniMsg = extractedDni ? ` Registramos tu DNI *${extractedDni}*.` : '';
            replyText = `¡Recibido!${dniMsg} Para poder tramitar la autorización con tu obra social, por favor envíanos la *foto clara y legible de la orden médica* 📸.\n\n` +
                `_(Si la imagen que enviaste anteriormente es la orden que deseás autorizar, simplemente escribí *"es la foto anterior"*)._\n\n` +
                `🔙 *Volver:* Escribí *"Menú"* | 👤 *Agente:* Escribí *"Agente"*`;
            updates.status = 'bot';
            updates.bot_active = true;
            nextStage = 'esperando_foto_autorizacion';
            return await finalizeAndSend(replyText, nextStage, updates);
        }
    }
    // =============================================
    // FLUJO 0A-2D: ESPERANDO FOTO DE PEDIDO MÉDICO PARA TURNO DE ESTUDIO (ECOGRAFÍA, TOMOGRAFÍA, ETC.)
    // =============================================
    else if (
        currentStage === 'esperando_orden_foto' &&
        analysis.intent !== 'derivacion_agente' &&
        analysis.intent !== 'volver_atras'
    ) {
        const targetStudy = conv?.medico_o_especialidad || updates.medico_o_especialidad || 'Diagnóstico por Imágenes';
        const isReferencingPreviousPhoto = /\b(es\s+la\s+(?:foto\s+)?que\s+mand[eé]|ya\s+la\s+mand[eé]|la\s+foto\s+anterior|la\s+que\s+mand[eé]\s+antes|la\s+de\s+arriba|te\s+la\s+mand[eé]\s+reci[eé]n)\b/i.test(cleanText);
        const saysNoOrder = /\b(no\s+tengo\s+(?:orden|pedido|receta)|no\s+tengo|no\s+me\s+dieron|sin\s+orden|sin\s+pedido|todav[ií]a\s+no\s+tengo|a[uú]n\s+no\s+tengo|no\s+poseo|no\s+la\s+tengo|no\s+lo\s+tengo|es\s+necesari[ao]\s+orden|hace\s+falta\s+orden|es\s+obligatori[ao])\b/i.test(cleanText);

        if (isIncomingMedia || isReferencingPreviousPhoto) {
            replyText = `¡Muchas gracias *${whatsappName}*! 📄📸 Recibimos el pedido médico para tu turno de *${targetStudy}*.\n\n` +
                `Un agente del equipo de Sanatorio Argentino verificará la orden médica y agendará la cita en nuestro sistema institucional para confirmarte los detalles a la brevedad.\n\n` +
                `${getAgentHandoffNotice()}\n\n` +
                `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"*`;
            updates.status = 'sin_asignar';
            updates.bot_active = false;
            nextStage = 'esperando_agente';
            updates.bot_stage = 'esperando_agente';
            const prevMotivo = conv?.motivo_consulta || updates.motivo_consulta || `Solicitud de Turno: ${targetStudy}`;
            updates.motivo_consulta = prevMotivo.includes('[Aguardando pedido médico]')
                ? prevMotivo.replace('[Aguardando pedido médico]', '[Pedido médico adjuntado]')
                : `${prevMotivo} [Pedido médico adjuntado]`;
            updates.ai_summary = {
                ...(conv?.ai_summary || {}),
                pedido_medico_recibido: true,
                estudio: targetStudy
            };
            return await finalizeAndSend(replyText, nextStage, updates);
        } else if (saysNoOrder) {
            replyText = `¡Comprendido *${whatsappName}*! 📋 Para la realización de estudios de diagnóstico por imágenes (*${targetStudy}*), tanto las obras sociales como los protocolos médicos institucionales exigen contar obligatoriamente con el pedido médico u orden prescripta por un profesional.\n\n` +
                `• *Si el médico te envió la orden digital:* Podés reenviarnos el archivo PDF o captura de pantalla cuando la tengas.\n` +
                `• *Si necesitás primero una consulta médica para que te indiquen el estudio:* Escribinos para coordinarte una consulta previa con el especialista.\n` +
                `• *Si deseás consultar con un asesor humano:* Escribí *"Agente"* y te comunicamos de inmediato.\n\n` +
                `🔙 *Volver:* Escribí *"Menú"* | 👤 *Agente:* Escribí *"Agente"*`;
            updates.status = 'bot';
            updates.bot_active = true;
            nextStage = 'esperando_orden_foto';
            return await finalizeAndSend(replyText, nextStage, updates);
        } else {
            // El paciente envió texto adicional (ej: horario, DNI, comentarios) pero aún no la foto
            const extractedDni = candidateDni || updates.dni || conv?.dni;
            const dniMsg = extractedDni ? ` Registramos tu DNI *${extractedDni}*.` : '';
            replyText = `¡Recibido *${whatsappName}*! 🏥${dniMsg} Para poder coordinar tu turno de *${targetStudy}*, únicamente nos falta la *foto clara o archivo de tu pedido médico / orden médica* 📸.\n\n` +
                `Por favor adjuntala por este medio para que un agente verifique la prescripción y confirme tu cita.\n\n` +
                `_(Si la imagen que enviaste anteriormente es el pedido médico, respondé *"es la foto anterior"*; si preferís ayuda de un asesor, escribí *"Agente"*)._\n\n` +
                `🔙 *Volver:* Escribí *"Menú"* | 👤 *Agente:* Escribí *"Agente"*`;
            updates.status = 'bot';
            updates.bot_active = true;
            nextStage = 'esperando_orden_foto';
            return await finalizeAndSend(replyText, nextStage, updates);
        }
    }
    // =============================================
    // FLUJO 0A-2E: ESPERANDO DATOS OBLIGATORIOS PARA DERIVACIÓN A AGENTE
    // (El paciente solicitó hablar con un operador pero el sistema exige DNI, Nombre y Motivo antes de pasar a 'sin_asignar')
    // =============================================
    else if (
        currentStage === 'esperando_datos_agente' &&
        analysis.intent !== 'volver_atras'
    ) {
        const candidateDniInMsg = candidateDni || extractDniFromText(cleanText);
        const effectiveDni = (candidateDniInMsg && isValidArgentineDni(candidateDniInMsg))
            ? candidateDniInMsg
            : ((paciente?.dni && isValidArgentineDni(String(paciente.dni))) ? String(paciente.dni) : (conv?.dni && isValidArgentineDni(String(conv.dni)) ? String(conv.dni) : null));

        if (effectiveDni) {
            let resolvedName = updates.nombre_completo || paciente?.nombre || conv?.nombre_completo || null;
            let salusFound = Boolean(paciente?.id_paciente);

            if (!salusFound) {
                const { data: pFound } = await supabase
                    .from('hospital_pacientes')
                    .select('id_paciente, dni, nombre, coseguro, telefono, email, nhc, centro, edad, fecha_nacimiento')
                    .eq('dni', effectiveDni)
                    .limit(1)
                    .maybeSingle();

                if (pFound) {
                    paciente = pFound;
                    resolvedName = pFound.nombre;
                    updates.dni = pFound.dni;
                    updates.nombre_completo = pFound.nombre;
                    updates.nhc = pFound.nhc;
                    updates.fecha_nacimiento = pFound.fecha_nacimiento;
                    updates.es_paciente_existente = true;
                    salusFound = true;
                } else {
                    updates.dni = effectiveDni;
                    updates.es_paciente_existente = false;
                }
            } else {
                updates.dni = effectiveDni;
                updates.es_paciente_existente = true;
            }

            if (!resolvedName) {
                resolvedName = analysis.patientNameCandidate || whatsappName || 'Paciente';
                updates.nombre_completo = resolvedName;
            }

            const isJustDniOrShort = /^[0-9\s.-]+$/.test(cleanText.trim()) || cleanText.trim().length <= 8;
            const motivoDesc = isJustDniOrShort
                ? (conv?.motivo_consulta && !conv.motivo_consulta.includes('aguardando datos') && !conv.motivo_consulta.includes('esperando datos') ? conv.motivo_consulta : 'Atención General con Asesor')
                : cleanText.trim();

            const targetStudy = detectEstudioConOrden(cleanText);
            const studyTag = targetStudy ? ` [Estudio: ${targetStudy}]` : '';

            updates.motivo_consulta = `Consulta con Agente: ${resolvedName} (DNI ${effectiveDni})${studyTag} - ${motivoDesc.slice(0, 90)}`;
            updates.status = 'sin_asignar';
            updates.bot_active = false;
            updates.bot_stage = 'esperando_agente';
            nextStage = 'esperando_agente';

            updates.ai_summary = {
                ...buildTriageSummary(updates, 'derivacion_agente', analysis.doctorRecord, updates.es_paciente_existente, paciente?.edad),
                dni_aportado: effectiveDni,
                paciente_identificado: resolvedName,
                motivo_explicitado: motivoDesc
            };

            replyText = `¡Muchas gracias *${resolvedName}*! 🏥 Ya registramos tus datos (DNI: *${effectiveDni}*) y el motivo de tu consulta.\n\n` +
                `Un agente de nuestro equipo de atención tomará tu conversación a la brevedad para asistirte de forma personalizada.\n\n` +
                `${getAgentHandoffNotice()}\n\n` +
                `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"*`;

            return await finalizeAndSend(replyText, nextStage, updates);
        } else {
            // El paciente escribió pero NO brindó un DNI válido
            // BLOQUEO ESTRICTO: NO PASA A 'sin_asignar'
            console.log(`[triage-bot] Chat ${phone} está en esperando_datos_agente y aún NO proporcionó DNI válido. Manteniendo en bot.`);
            updates.status = 'bot';
            updates.bot_active = true;
            updates.bot_stage = 'esperando_datos_agente';
            nextStage = 'esperando_datos_agente';

            replyText = `Para poder derivar tu caso a un asesor de nuestro equipo, *es indispensable que nos indiques tus datos mínimos*:\n\n` +
                `• Número de *DNI del paciente* (solo números, sin puntos ni espacios)\n` +
                `• *Nombre y Apellido*\n` +
                `• *Motivo de tu consulta* (¿qué gestión o trámite precisás realizar?)\n\n` +
                `⚠️ *Sin tu número de DNI el sistema no puede asignar un operador a tu chat.* Por favor escribí tu DNI para continuar.\n\n` +
                `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"*`;

            return await finalizeAndSend(replyText, nextStage, updates);
        }
    }
    // =============================================
    // FLUJO 0A-3: DERIVACIÓN DIRECTA A AGENTE HUMANO (OPCIÓN 5)
    // =============================================
    else if (analysis.intent === 'derivacion_agente') {
        const candidateDniInMsg = candidateDni || extractDniFromText(cleanText);
        const effectiveDni = (candidateDniInMsg && isValidArgentineDni(candidateDniInMsg)) 
            ? candidateDniInMsg 
            : ((paciente?.dni && isValidArgentineDni(String(paciente.dni))) ? String(paciente.dni) : (conv?.dni && isValidArgentineDni(String(conv.dni)) ? String(conv.dni) : null));

        const isSimpleAgentTrigger = /^(5|opcion\s*5|agente|asesor|operador|humano|persona|hablar\s+con\s+(un\s+)?(agente|asesor|humano|operador|alguien))$/i.test(cleanText.trim());

        // Si ya cuenta con DNI válido Y el mensaje contiene el motivo detallado (no es un simple "5" o "agente"):
        if (effectiveDni && !isSimpleAgentTrigger && cleanText.length >= 15) {
            updates.dni = effectiveDni;
            const patientName = paciente?.nombre || conv?.nombre_completo || whatsappName || 'Paciente';
            updates.nombre_completo = patientName;
            updates.motivo_consulta = `Consulta con Agente: ${patientName} (DNI ${effectiveDni}) - ${cleanText.slice(0, 90)}`;
            updates.status = 'sin_asignar';
            updates.bot_active = false;
            nextStage = 'esperando_agente';
            updates.ai_summary = buildTriageSummary(updates, 'derivacion_agente', analysis.doctorRecord, isExistingPatient, paciente?.edad);

            replyText = `¡Muchas gracias *${patientName}*! 🏥 Registramos tus datos y tu solicitud.\n\n` +
                `Ya mismo te comunicamos con un agente de nuestro equipo de atención para asistirte.\n\n` +
                `${getAgentHandoffNotice()}\n\n` +
                `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"*`;
        } else {
            // SI EL PACIENTE NO BRINDÓ SUS DATOS O ES UN SIMPLE DISPARADOR ("5", "agente"):
            // EL CHAT NO PASA A 'sin_asignar'. SE QUEDA EN EL BOT PIDIENDO LOS DATOS OBLIGATORIOS.
            updates.status = 'bot';
            updates.bot_active = true;
            updates.bot_stage = 'esperando_datos_agente';
            nextStage = 'esperando_datos_agente';
            updates.motivo_consulta = 'Solicitud de Atención con Agente (aguardando datos)';

            if (effectiveDni && (paciente?.nombre || conv?.nombre_completo)) {
                const pName = paciente?.nombre || conv?.nombre_completo;
                replyText = `¡Hola *${pName}*! 🏥 Con gusto te comunicamos con un asesor de nuestro equipo.\n\n` +
                    `Para que el operador pueda tomar tu caso y ayudarte de inmediato, por favor indícanos:\n` +
                    `• *Motivo de tu consulta:* ¿Qué trámite, estudio o consulta médica precisás realizar?\n` +
                    `• ¿La atención es para vos (*DNI ${effectiveDni}*) o para otra persona/familiar? (si es para otra persona, indícanos su DNI, Nombre y Apellido).\n` +
                    `• _Podés adjuntar fotos o archivos si disponés de órdenes médicas o comprobantes._\n\n` +
                    `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"*`;
            } else {
                replyText = `¡Hola! 👋 Te damos la bienvenida a *Sanatorio Argentino*.\n\n` +
                    `Con gusto te comunicamos con un agente de nuestro equipo de atención. Para que el sistema pueda derivar tu conversación a un operador, *es obligatorio que nos indiques tus datos*:\n\n` +
                    `• Número de *DNI del paciente* (sin puntos ni espacios)\n` +
                    `• *Nombre y Apellido*\n` +
                    `• *Motivo de tu consulta* (¿qué trámite, estudio o consulta precisás gestionar?)\n` +
                    `• _Podés adjuntar fotos o archivos si disponés de órdenes médicas o credenciales._\n\n` +
                    `⚠️ *Importante:* Es indispensable que nos brindes estos datos para que un agente pueda atenderte.\n\n` +
                    `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"*`;
            }
        }
    }
    // =============================================
    // FLUJO 0C: PACIENTE RESPONDIENDO DATOS O PREFERENCIAS DE NUEVO TURNO (PRIORIDAD DE CONTEXTO)
    // =============================================
    else if (
        currentStage === 'esperando_datos_turno' && 
        analysis.intent !== 'derivacion_agente' && 
        analysis.intent !== 'volver_atras' && 
        analysis.intent !== 'cancelar_turno_online'
    ) {
        // 1. Si el paciente incluyó DNI en la respuesta, verificar en SALUS (Bifurcación de los Dos Caminos)
        if (candidateDni && isValidArgentineDni(candidateDni) && (!paciente || String(paciente.dni) !== String(candidateDni))) {
            const { data: pFound } = await supabase
                .from('hospital_pacientes')
                .select('id_paciente, dni, nombre, coseguro, telefono, email, nhc, centro, edad, fecha_nacimiento')
                .eq('dni', candidateDni)
                .limit(1)
                .maybeSingle();

            if (pFound) {
                // CAMINO 1: PACIENTE REGISTRADO EN SALUS
                paciente = pFound;
                updates.dni = paciente.dni;
                updates.nombre_completo = paciente.nombre;
                updates.nhc = paciente.nhc;
                updates.fecha_nacimiento = paciente.fecha_nacimiento;
                updates.es_paciente_existente = true;
                console.log(`[triage-bot] ✅ CAMINO 1 (Registrado en SALUS) para DNI ${candidateDni}: ${paciente.nombre}`);
            } else {
                // CAMINO 2: PACIENTE NO REGISTRADO EN SALUS
                updates.dni = candidateDni;
                updates.es_paciente_existente = false;
                console.log(`[triage-bot] ⚠️ CAMINO 2 (No registrado en SALUS) para DNI ${candidateDni}`);
            }
        }

        // Si se detectó que es un paciente NO registrado en SALUS y aportó DNI:
        // Se activa inmediatamente la recolección de los datos obligatorios para el alta en SALUS
        if (candidateDni && isValidArgentineDni(candidateDni) && !paciente) {
            const res = await handleNewPatientIntake(
                cleanText,
                candidateDni,
                conv,
                phone,
                updates,
                'turno',
                analysis.doctorRecord,
                doctorDisplay
            );
            nextStage = res.nextStage;
            replyText = res.replyText;
            return await finalizeAndSend(replyText, nextStage, updates);
        }
            // 2. Extraer o preservar especialidad o doctor
            const specialtyFromMsg = analysis.specialtyCandidate || detectSpecialty(cleanText);
            const isForOtherPatient = 
                Boolean(analysis.isForOtherPatient) ||
                /\b(otro\s+paciente|otra\s+persona|no\s+es\s+para\s+m[ií]|para\s+otro|para\s+otra|para\s+un\s+familiar|es\s+para\s+un\s+familiar|familiar|familiares|mi\s+hijo|mi\s+hija|mi\s+bebe|mi\s+mam[aá]|mi\s+pap[aá]|mi\s+espos[oa]|tercero|tercera\s+persona|alguien\s+m[aá]s)\b/i.test(cleanText) ||
                Boolean(conv?.motivo_consulta?.toLowerCase().includes('familiar') || conv?.motivo_consulta?.toLowerCase().includes('tercero'));

            // Detección de rechazo o cambio de profesional ("no quiero turno esa doctora quiero con otra", "otra doctora", "otro médico", "cambiar de médico")
            const isRechazoOCambioDoc = 
                /\b(no\s+(?:la\s+|lo\s+)?quiero|no\s+con\s+(?:esa|ese|ella|el|este|esta)|con\s+otr[ao]|otr[ao]\s+(?:doctor[ao]?|m[eé]dic[ao]|profesional)|cambiar\s+(?:de\s+)?(?:doctor[ao]?|m[eé]dic[ao]|profesional)|no\s+deseo\s+(?:con\s+)?(?:esa|ese|ella|el)|no\s+(?:es\s+)?con\s+esa|otra\s+opci[oó]n|buscar\s+otr[ao]|alg[uú]n\s+otr[ao]|otra\s+profesional|otro\s+profesional|con\s+otra|con\s+otro)\b/i.test(cleanText);

            if (isRechazoOCambioDoc) {
                console.log(`[triage-bot] Chat ${phone}: Paciente solicitó cambio o rechazo del profesional previo.`);
                const newDoc = (doctorDisplay && !STOPWORDS_MEDICOS.has(doctorDisplay.replace(/^Dr[a]?\.\s*/i, '').toLowerCase())) ? doctorDisplay : null;
                const newSpec = specialtyFromMsg;

                if (newDoc || newSpec) {
                    updates.medico_o_especialidad = newDoc || newSpec;
                    if (conv) conv.medico_o_especialidad = updates.medico_o_especialidad;
                } else {
                    updates.medico_o_especialidad = null;
                    if (conv) conv.medico_o_especialidad = null;
                    
                    const pFirstName = fullName ? ` *${fullName}*` : (whatsappName ? ` *${whatsappName}*` : '');
                    replyText = `¡Entendido${pFirstName}! 🏥 Con gusto te ayudamos a coordinar con otra profesional o médico.\n\n` +
                        `Por favor indícanos:\n` +
                        `• ¿Con qué *profesional* o para qué *especialidad médica* preferís tu atención?\n` +
                        `• Preferencia de *días y horarios* (mañana o tarde)\n\n` +
                        `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"* | 👤 *Agente:* Escribí *"Agente"*`;
                    updates.status = 'bot';
                    updates.bot_active = true;
                    updates.bot_stage = 'esperando_datos_turno';
                    nextStage = 'esperando_datos_turno';
                    updates.motivo_consulta = 'Solicitud de Turno: Cambio de profesional requerido';
                    return await finalizeAndSend(replyText, nextStage, updates);
                }
            }

            // Acumulación de médico/especialidad: si vino en este mensaje o ya estaba guardado en la conversación previa dentro de este mismo flujo
            const effectiveDocOrSpec = 
                (!isRechazoOCambioDoc && doctorDisplay && !STOPWORDS_MEDICOS.has(doctorDisplay.replace(/^Dr[a]?\.\s*/i, '').toLowerCase()) ? doctorDisplay : null) || 
                specialtyFromMsg || 
                updates.medico_o_especialidad || 
                (!isRechazoOCambioDoc && conv?.bot_stage === 'esperando_datos_turno' && conv?.medico_o_especialidad ? conv.medico_o_especialidad : null) ||
                null;

            if (effectiveDocOrSpec) {
                updates.medico_o_especialidad = effectiveDocOrSpec;
            }


            // 3. Extraer obra social y plan si vino en el texto o preservar de la previa
            const extractedOs = (await extractPatientVariables(cleanText, candidateDni))?.obra_social;
            const effectiveOs = 
                extractedOs || 
                updates.obra_social || 
                conv?.obra_social || 
                paciente?.coseguro || 
                null;

            if (effectiveOs && !effectiveOs.toLowerCase().includes('a confirmar')) {
                updates.obra_social = effectiveOs;
            }

            // 4. Extraer preferencias de horario si se mencionan o preservar de la previa
            let preferenciaHoraria = '';
            if (/\b(ma[nñ]ana|ma[nñ]anas|temprano)\b/i.test(cleanText)) {
                preferenciaHoraria = 'Turno Mañana';
            } else if (/\b(tarde|tardes|siesta)\b/i.test(cleanText)) {
                preferenciaHoraria = 'Turno Tarde';
            } else if (conv?.motivo_consulta?.includes('Turno Mañana')) {
                preferenciaHoraria = 'Turno Mañana';
            } else if (conv?.motivo_consulta?.includes('Turno Tarde')) {
                preferenciaHoraria = 'Turno Tarde';
            }

            // DNI definitivo acumulado
            const targetDni = candidateDni || conv?.dni || paciente?.dni || null;
            if (targetDni) updates.dni = targetDni;

            const mappedName = paciente?.nombre || patientLegalName || whatsappName;
            let cleanName = mappedName;
            if (mappedName && mappedName.includes(',')) {
                const parts = mappedName.split(',').map((p: string) => p.trim());
                cleanName = `${parts[1]} ${parts[0]}`;
            }

            // COMPROBACIÓN INTELIGENTE DE VARIABLES OBLIGATORIAS:
            // Tenemos 3 variables clave: DNI, Médico/Especialidad, Obra Social.
            const hasDni = Boolean(targetDni);
            const hasDoctor = Boolean(effectiveDocOrSpec);
            const hasOs = Boolean(updates.obra_social && !updates.obra_social.toLowerCase().includes('a confirmar') && !updates.obra_social.toLowerCase().includes('a consultar'));

            // CASO A: SI TENEMOS TODAS LAS VARIABLES (DNI + Médico + Obra Social)
            if (hasDni && hasDoctor && hasOs) {
                const docMsg = formatTurnoTargetPhrase(effectiveDocOrSpec);
                const osMsg = `\n• *Cobertura informada:* ${updates.obra_social}`;
                const horMsg = preferenciaHoraria ? `\n• *Preferencia horaria:* ${preferenciaHoraria}` : '';

                const estudioRequiereOrden = detectEstudioConOrden(effectiveDocOrSpec) || detectEstudioConOrden(cleanText) || detectEstudioConOrden(conv?.medico_o_especialidad);
                const hasSentOrderPhoto = isIncomingMedia || patientSentImageRecently || Boolean(conv?.order_analysis) || Boolean((conv?.ai_summary as any)?.medical_order);

                if (estudioRequiereOrden && !hasSentOrderPhoto) {
                    if (isForOtherPatient) {
                        replyText = `¡Muchas gracias *${whatsappName}*! 🏥 Registramos la solicitud y preferencias para coordinar el turno de *${cleanName}* (DNI: *${targetDni}*)${docMsg}.${osMsg}${horMsg}\n\n` +
                            `📋 *Paso necesario:* Para poder autorizar y coordinar estudios de diagnóstico por imágenes (*${estudioRequiereOrden}*), es requisito indispensable contar con el pedido médico prescripto por el profesional.\n\n` +
                            `📸 Por favor, *envíanos una foto clara o archivo PDF de la orden médica / pedido médico* por este medio.\n\n` +
                            `_(En cuanto nos envíes la foto, un agente agendará el turno en nuestro sistema institucional con la orden correspondiente)._\n\n` +
                            `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"*`;
                        updates.motivo_consulta = `Solicitud de Turno (Tercero): ${cleanName} (DNI ${targetDni}) - ${effectiveDocOrSpec}${preferenciaHoraria ? ` (${preferenciaHoraria})` : ''} [Aguardando pedido médico]`;
                        updates.es_gestion_tercero = true;
                        updates.titular_nombre = whatsappName;
                        updates.paciente_nombre = cleanName;
                        updates.paciente_dni = targetDni;
                    } else {
                        replyText = `¡Muchas gracias *${whatsappName}*! 🏥 Registramos tus datos y preferencias para coordinar tu turno${docMsg}.${osMsg}${horMsg}\n\n` +
                            `📋 *Paso necesario:* Para poder autorizar y coordinar estudios de diagnóstico por imágenes (*${estudioRequiereOrden}*), es requisito indispensable contar con el pedido médico prescripto por el profesional.\n\n` +
                            `📸 Por favor, *envíanos una foto clara o archivo PDF de tu orden médica / pedido médico* por este medio.\n\n` +
                            `_(En cuanto nos envíes la foto, un agente agendará la cita en nuestro sistema institucional con la orden correspondiente)._\n\n` +
                            `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"*`;
                        updates.motivo_consulta = updates.motivo_consulta || `Solicitud de Turno: ${cleanName} - ${effectiveDocOrSpec}${preferenciaHoraria ? ` (${preferenciaHoraria})` : ''} [Aguardando pedido médico]`;
                    }

                    updates.status = 'bot';
                    updates.bot_active = true;
                    updates.bot_stage = 'esperando_orden_foto';
                    nextStage = 'esperando_orden_foto';
                    updates.ai_summary = {
                        ...buildTriageSummary(updates, 'turno', analysis.doctorRecord, Boolean(paciente), paciente?.edad),
                        estudio_requiere_orden: estudioRequiereOrden,
                        esperando_pedido_medico: true
                    };
                } else {
                    if (isForOtherPatient) {
                        replyText = `¡Muchas gracias *${whatsappName}*! 🏥 Registramos la solicitud y preferencias para coordinar el turno de *${cleanName}* (DNI: *${targetDni}*)${docMsg}.${osMsg}${horMsg}\n\n` +
                            `Un agente del equipo de Sanatorio Argentino agendará la cita en nuestro sistema institucional para el paciente y te confirmará los detalles a la brevedad.\n\n` +
                            `${getAgentHandoffNotice()}\n\n` +
                            `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"*`;
                        updates.motivo_consulta = `Solicitud de Turno (Tercero): ${cleanName} (DNI ${targetDni}) - ${effectiveDocOrSpec}${preferenciaHoraria ? ` (${preferenciaHoraria})` : ''}`;
                        updates.es_gestion_tercero = true;
                        updates.titular_nombre = whatsappName;
                        updates.paciente_nombre = cleanName;
                        updates.paciente_dni = targetDni;
                    } else {
                        replyText = `¡Muchas gracias *${whatsappName}*! 🏥 Registramos tus datos y preferencias para coordinar tu turno${docMsg}.${osMsg}${horMsg}\n\n` +
                            `Un agente del equipo de Sanatorio Argentino agendará la cita en nuestro sistema institucional y te confirmará los detalles a la brevedad.\n\n` +
                            `${getAgentHandoffNotice()}\n\n` +
                            `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"*`;
                        updates.motivo_consulta = updates.motivo_consulta || `Solicitud de Turno: ${cleanName} - ${effectiveDocOrSpec}${preferenciaHoraria ? ` (${preferenciaHoraria})` : ''}`;
                    }

                    updates.status = 'sin_asignar';
                    updates.bot_active = false;
                    nextStage = 'esperando_agente';
                    updates.ai_summary = buildTriageSummary(updates, 'turno', analysis.doctorRecord, Boolean(paciente), paciente?.edad);
                }
            }
            // CASO B: TENEMOS DNI Y MÉDICO/ESTUDIO, PERO FALTA OBRA SOCIAL -> PREGUNTAR SOLO POR LA OBRA SOCIAL
            else if (hasDni && hasDoctor && !hasOs) {
                const estudioRequiere = detectEstudioConOrden(effectiveDocOrSpec) || detectEstudioConOrden(cleanText);
                const hasSentOrderPhoto = isIncomingMedia || patientSentImageRecently || Boolean(conv?.order_analysis) || Boolean((conv?.ai_summary as any)?.medical_order);
                const orderBullet = (estudioRequiere && !hasSentOrderPhoto)
                    ? `\n• 📸 *Pedido médico:* Por favor adjuntanos la *foto clara o archivo de tu orden médica* (${estudioRequiere}).`
                    : '';
                const targetPhrase = estudioRequiere
                    ? `para tu estudio de *${estudioRequiere}*`
                    : (isMedicalSpecialty(effectiveDocOrSpec)
                        ? `para la especialidad de *${effectiveDocOrSpec}*`
                        : (effectiveDocOrSpec.startsWith('Dra.') ? `con la *${effectiveDocOrSpec}*` : `con el *${effectiveDocOrSpec}*`));
                replyText = `¡Muchas gracias *${whatsappName}*! 🏥 Ya registramos tu DNI *${targetDni}* y tu solicitud ${targetPhrase}.` +
                    (preferenciaHoraria ? ` (${preferenciaHoraria})` : '') +
                    `\n\n📋 Para verificar tu cobertura en nuestro sistema y confirmar la cita, por favor indícanos tu *Obra Social / Prepaga y Plan* (ej: OSP Plan Tradicional, OSDE 210, Swiss Medical, o Particular):` +
                    `${orderBullet}\n\n` +
                    `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"* | 👤 *Agente:* Escribí *"Agente"*`;
                updates.status = 'bot';
                updates.bot_active = true;
                nextStage = 'esperando_obra_social_paciente';
                updates.bot_stage = 'esperando_obra_social_paciente';
            }
            // CASO C: TENEMOS DNI (Y TAL VEZ OS), PERO FALTA EL MÉDICO/ESPECIALIDAD -> PREGUNTAR SOLO POR MÉDICO Y HORARIO
            else if (hasDni && !hasDoctor) {
                const osInfo = updates.obra_social ? ` (${updates.obra_social})` : '';
                replyText = `¡Muchas gracias *${whatsappName}*! 🏥 Registramos tu DNI *${targetDni}*${osInfo}.\n\n` +
                    `Por favor indícanos:\n` +
                    `• ¿Con qué *profesional* o para qué *especialidad médica* solicitás la atención?\n` +
                    `• Preferencia de *días y horarios* (mañana o tarde)\n\n` +
                    `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"* | 👤 *Agente:* Escribí *"Agente"*`;
                updates.status = 'bot';
                updates.bot_active = true;
                nextStage = 'esperando_datos_turno';
                updates.motivo_consulta = `Solicitud de Turno: ${cleanName} (DNI ${targetDni}, esperando especialidad)`;
            }
            // CASO D: TENEMOS MÉDICO/ESTUDIO PERO FALTA DNI -> PREGUNTAR SOLO POR EL DNI Y PEDIDO MÉDICO SI ES ESTUDIO
            else if (!hasDni && hasDoctor) {
                const estudioRequiere = detectEstudioConOrden(effectiveDocOrSpec) || detectEstudioConOrden(cleanText);
                const orderBullet = estudioRequiere
                    ? `• 📸 *Pedido médico:* Por favor adjuntanos la *foto clara o archivo de tu orden médica* (obligatoria para coordinar estudios de ${estudioRequiere}).\n`
                    : '';
                const targetPhrase = estudioRequiere
                    ? `para tu estudio de *${estudioRequiere}*`
                    : (isMedicalSpecialty(effectiveDocOrSpec)
                        ? `para la especialidad de *${effectiveDocOrSpec}*`
                        : (effectiveDocOrSpec.startsWith('Dra.') ? `con la *${effectiveDocOrSpec}*` : `con el *${effectiveDocOrSpec}*`));

                replyText = `¡Perfecto *${whatsappName}*! Registramos tu solicitud ${targetPhrase}.` +
                    (preferenciaHoraria ? ` (${preferenciaHoraria})` : '') +
                    `\n\nPor favor indícanos:\n` +
                    `• Número de *DNI del paciente* (sin puntos ni espacios)\n` +
                    (!hasOs ? `• *Obra Social / Prepaga* y plan (o si tu atención será Particular)\n` : '') +
                    `${orderBullet}\n` +
                    `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"* | 👤 *Agente:* Escribí *"Agente"*`;
                updates.status = 'bot';
                updates.bot_active = true;
                nextStage = 'esperando_datos_turno';
            }
            // CASO E: NO TENEMOS NINGÚN DATO AÚN
            else {
                replyText = `¡Entendido *${whatsappName}*! 🏥 Para poder verificar la historia clínica en Sanatorio Argentino o registrar tu atención en nuestro sistema, por favor indícanos:\n\n` +
                    `• Número de *DNI del paciente* (solo números, sin puntos ni espacios)\n` +
                    `• ¿Con qué *profesional* o para qué *especialidad médica* solicitás la atención?\n` +
                    `• Preferencia de *días y horarios* (mañana o tarde)\n` +
                    `• *Obra Social / Prepaga* y plan (o Particular)\n\n` +
                    `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"* | 👤 *Agente:* Escribí *"Agente"*`;
                updates.status = 'bot';
                updates.bot_active = true;
                nextStage = 'esperando_datos_turno';
                updates.motivo_consulta = 'Solicitud de Turno (esperando datos)';
            }
        }
    // =============================================
    // FLUJO 0B: CONSULTA DE PRÓXIMO TURNO O VISITA AGENDADA
    // =============================================
    else if (
        (analysis.intent === 'consultar_turno' || 
        currentStage === 'esperando_dni_turno' ||
        ((currentStage === 'turno_consultado' || currentStage === 'esperando_confirmacion_turno') && cleanText.replace(/\./g, '').match(/\b\d{7,8}\b/)))
    ) {
        const isExplicitlyForSelf = /\b(para\s+m[ií]|a\s+mi\s+nombre|mis\s+turnos?|yo\s+tengo|tengo\s+yo|para\s+mi\s+persona|el\s+m[ií]o|los\s+m[ií]os|mi\s+turno|mi\s+cita)\b/i.test(cleanText) || cleanText.trim() === '2' || cleanText.trim() === 'consultar mi próximo turno o visita agendada';
        const isAskingForOtherPatient = !isExplicitlyForSelf && /\b(otro\s+paciente|otra\s+persona|un\s+paciente|del\s+paciente|de\s+un\s+paciente|de\s+otro\s+paciente|otros?\s+pacientes?|algun\s+paciente|familiar|familiares|mi\s+hijo|mi\s+hija|mi\s+mama|mi\s+mamá|mi\s+papa|mi\s+papá|mi\s+madre|mi\s+padre|mi\s+esposo|mi\s+esposa|mi\s+bebe|mi\s+bebé|mi\s+abuelo|mi\s+abuela|alguien\s+m[aá]s)\b/i.test(cleanText);

        // Detectar si en el mensaje actual vino un DNI explícito (sin considerar la memoria del usuario que envió el chat)
        const dniInCurrentMsg = extractDniFromText(cleanText);

        // Caso 1: El usuario pide averiguar por otro paciente y NO incluyó el DNI en este mensaje
        if (isAskingForOtherPatient && !dniInCurrentMsg) {
            replyText = `¡Con gusto te ayudo a consultar el turno del paciente! 🏥\n\n` +
                `Por favor, indícanos su número de *DNI* (solo números, sin puntos ni espacios) para que busquemos su cita agendada en el sistema:` +
                `\n\n🔙 *Volver:* Escribí *"Menú"* o *"Atrás"* | 👤 *Agente:* Escribí *"Agente"*`;
            updates.bot_stage = 'esperando_dni_turno';
            updates.bot_active = true;
            nextStage = 'esperando_dni_turno';
            updates.motivo_consulta = 'Consulta de Turno de otro paciente (esperando DNI)';
        } else {
            let dniToSearch: string | null = (isExplicitlyForSelf ? null : dniInCurrentMsg);
            let isConsultingOther = !isExplicitlyForSelf && (isAskingForOtherPatient || currentStage === 'esperando_dni_turno' || (dniInCurrentMsg && dniTitular && dniInCurrentMsg !== dniTitular));

            if (!dniToSearch || isExplicitlyForSelf) {
                if (currentStage === 'esperando_dni_turno' && !isExplicitlyForSelf) {
                    replyText = `Por favor, indícanos el número de *DNI del paciente* (solo números, sin puntos ni espacios) para poder buscar su turno agendado en el sistema:` +
                        `\n\n🔙 *Volver:* Escribí *"Menú"* o *"Atrás"* | 👤 *Agente:* Escribí *"Agente"*`;
                    updates.bot_stage = 'esperando_dni_turno';
                    updates.bot_active = true;
                    nextStage = 'esperando_dni_turno';
                } else {
                    // Consulta propia o general (ej: "consultar mi turno", "tengo un turno para mi?", o presionó opción 1)
                    if (turnosActivosProximos && turnosActivosProximos.length > 0) {
                        replyText = formatTurnosActivosReply(turnosActivosProximos, fullName, false, resolvedDni || undefined);
                        updates.motivo_consulta = `Consulta de Turno Propio: ${turnosActivosProximos[0].medico || turnosActivosProximos[0].especialidad} (${turnosActivosProximos[0].fecha})`;
                        updates.medico_o_especialidad = turnosActivosProximos[0].medico || turnosActivosProximos[0].especialidad;
                        updates.bot_active = true;
                        nextStage = 'turno_consultado';
                    } else if (resolvedDni) {
                        dniToSearch = resolvedDni;
                        isConsultingOther = false;
                    } else {
                        const firstName = (fullName || '').includes(',') ? fullName.split(',')[1].trim().split(' ')[0] : fullName.split(' ')[0];
                        replyText = `¡Hola${firstName && firstName !== 'Paciente' ? ` *${firstName}*` : ''}! 🏥\n\n` +
                            `Para verificar si tenés citas o turnos próximos agendados a tu nombre en Sanatorio Argentino, por favor indícanos tu número de *DNI* (solo números, sin puntos ni espacios):` +
                            `\n\n🔙 *Volver:* Escribí *"Menú"* o *"Atrás"* | 👤 *Agente:* Escribí *"Agente"*`;
                        updates.bot_stage = 'esperando_dni_turno';
                        updates.bot_active = true;
                        nextStage = 'esperando_dni_turno';
                        updates.motivo_consulta = 'Consulta de Turno Propio (esperando DNI)';
                    }
                }
            }

            if (dniToSearch) {
                console.log(`[triage-bot] Consultando turnos y visitas próximas para DNI ${dniToSearch} (isOther=${isConsultingOther})...`);
                const { data: turnosDni, error: turnosErr } = await supabase.rpc('buscar_turnos_proximos', {
                    p_dni: dniToSearch
                });

                let pacInfo: any = null;
                const { data: pFound } = await supabase
                    .from('hospital_pacientes')
                    .select('nombre, coseguro, dni, nhc, telefono')
                    .eq('dni', dniToSearch)
                    .maybeSingle();

                if (pFound) {
                    pacInfo = pFound;
                }

                const nombreFinal = turnosDni?.[0]?.paciente_nombre || pacInfo?.nombre || (isConsultingOther ? `Paciente DNI ${dniToSearch}` : fullName);

                if (turnosDni && turnosDni.length > 0) {
                    replyText = formatTurnosActivosReply(turnosDni, nombreFinal, isConsultingOther, dniToSearch);
                    updates.motivo_consulta = isConsultingOther
                        ? `Consulta Turno DNI ${dniToSearch}: ${turnosDni[0].medico || turnosDni[0].especialidad} (${turnosDni[0].fecha})`
                        : `Consulta de Turno Propio: ${turnosDni[0].medico || turnosDni[0].especialidad} (${turnosDni[0].fecha})`;
                    updates.medico_o_especialidad = turnosDni[0].medico || turnosDni[0].especialidad;
                    updates.bot_active = true;
                    nextStage = 'turno_consultado';
                } else if (pacInfo) {
                    const pFirstName = (pacInfo.nombre || '').includes(',') ? pacInfo.nombre.split(',')[1].trim().split(' ')[0] : pacInfo.nombre.split(' ')[0];
                    if (isConsultingOther) {
                        replyText = `Encontramos la ficha de *${pacInfo.nombre}* (DNI: *${dniToSearch}*) en Sanatorio Argentino, pero actualmente *no registra turnos ni visitas próximas agendadas* en el sistema.\n\n` +
                            `¿Deseás que te ayudemos a *solicitar un nuevo turno médico* para este paciente o preferís comunicarte con un agente?\n\n` +
                            `💡 *¿Querés averiguar sobre otro paciente?* Podés escribir directamente su número de DNI.` +
                            `\n\n🔙 *Volver:* Escribí *"Menú"* o *"Atrás"* | 👤 *Agente:* Escribí *"Agente"*`;
                    } else {
                        replyText = `¡Hola *${pFirstName}*! 🏥 Encontramos tu ficha en Sanatorio Argentino, pero actualmente *no registrás visitas ni turnos próximos pendientes* en el sistema.\n\n` +
                            `¿Deseás que te ayudemos a *solicitar un nuevo turno médico* o preferís comunicarte con un agente?\n\n` +
                            `💡 *¿Consultás por otro paciente o familiar?* Indícanos su número de *DNI*.` +
                            `\n\n🔙 *Volver:* Escribí *"Menú"* o *"Atrás"* | 👤 *Agente:* Escribí *"Agente"*`;
                    }
                    updates.bot_active = true;
                    nextStage = 'turno_consultado';
                } else {
                    replyText = `No registramos visitas ni turnos próximos agendados para el DNI *${dniToSearch}*.\n\n` +
                        `¿Deseás que te ayudemos a *solicitar un nuevo turno médico* o preferís comunicarte con un agente?\n\n` +
                        `💡 *¿Querés averiguar sobre otro paciente?* Podés escribir directamente su número de DNI.` +
                        `\n\n🔙 *Volver:* Escribí *"Menú"* o *"Atrás"* | 👤 *Agente:* Escribí *"Agente"*`;
                    updates.bot_active = true;
                    nextStage = 'turno_consultado';
                }
            }
        }
    }
    // =============================================
    // FLUJO 1: PACIENTE RESPONDIENDO DNI, OBRA SOCIAL O DATOS OBLIGATORIOS DE ADMISIÓN
    // =============================================
    else if (
        currentStage === 'esperando_dni' || 
        currentStage === 'esperando_datos_nuevo' || 
        currentStage === 'esperando_obra_social_paciente'
    ) {
        // CASO 1A: Paciente respondiendo su Obra Social y Plan (Camino 1: Paciente Registrado)
        if (currentStage === 'esperando_obra_social_paciente') {
            const isGreetingOrReset = /^(hola+|buenas+|buen\s+d[ií]a+|menu+|men[uú]+|inicio|comenzar|empezar|reiniciar|atras|atrás)[!.\s]*$/i.test(cleanText);
            if (isGreetingOrReset) {
                replyText = getWelcomeMenuMessage(whatsappName);
                updates.status = 'bot';
                updates.bot_active = true;
                updates.bot_stage = 'menu_bienvenida';
                updates.medico_o_especialidad = null;
                updates.motivo_consulta = 'Menú de Bienvenida (esperando selección)';
                updates.ai_summary = null;
                if (conv) {
                    conv.medico_o_especialidad = null;
                    conv.motivo_consulta = null;
                    conv.ai_summary = null;
                    conv.bot_stage = 'menu_bienvenida';
                    conv.status = 'bot';
                    conv.bot_active = true;
                }
                nextStage = 'menu_bienvenida';
                return await finalizeAndSend(replyText, nextStage, updates);
            }

            const osPlanText = cleanText.trim();
            updates.obra_social = osPlanText;
            console.log(`[triage-bot] Obra Social y Plan registrado para paciente en SALUS: ${osPlanText}`);

            // Extraer o verificar si también aportó especialidad o doctor
            const specialtyFromMsg = analysis.specialtyCandidate || detectSpecialty(cleanText);
            const effectiveDocOrSpec = doctorDisplay || specialtyFromMsg || updates.medico_o_especialidad || (conv?.bot_stage === 'esperando_obra_social_paciente' && conv?.medico_o_especialidad ? conv.medico_o_especialidad : null) || null;

            if (effectiveDocOrSpec) {
                updates.medico_o_especialidad = effectiveDocOrSpec;
                const estudioRequiereOrden = detectEstudioConOrden(effectiveDocOrSpec) || detectEstudioConOrden(cleanText) || detectEstudioConOrden(conv?.medico_o_especialidad);
                const hasSentOrderPhoto = isIncomingMedia || patientSentImageRecently || Boolean(conv?.order_analysis) || Boolean((conv?.ai_summary as any)?.medical_order);

                if (estudioRequiereOrden && !hasSentOrderPhoto) {
                    replyText = `¡Muchas gracias *${fullName}*! 🏥 Registramos tu cobertura (*${osPlanText}*) y tu solicitud para *${effectiveDocOrSpec}*.\n\n` +
                        `📋 *Paso necesario:* Para poder autorizar y coordinar estudios de diagnóstico por imágenes (*${estudioRequiereOrden}*), es requisito indispensable contar con el pedido médico prescripto por el profesional.\n\n` +
                        `📸 Por favor, *envíanos una foto clara o archivo PDF de tu orden médica / pedido médico* por este medio.\n\n` +
                        `_(En cuanto nos envíes la foto, un agente agendará tu cita en nuestro sistema institucional con la orden correspondiente)._\n\n` +
                        `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"*`;
                    updates.status = 'bot';
                    updates.bot_active = true;
                    updates.bot_stage = 'esperando_orden_foto';
                    nextStage = 'esperando_orden_foto';
                    updates.motivo_consulta = `Solicitud de Turno: ${fullName} - ${effectiveDocOrSpec} [Aguardando pedido médico]`;
                    updates.ai_summary = {
                        ...buildTriageSummary(updates, 'turno', analysis.doctorRecord, true, paciente?.edad),
                        estudio_requiere_orden: estudioRequiereOrden,
                        esperando_pedido_medico: true
                    };
                } else {
                    replyText = `¡Muchas gracias *${fullName}*! 🏥 Registramos tu cobertura (*${osPlanText}*) y tu solicitud para *${effectiveDocOrSpec}*.\n\n` +
                        `Un agente del equipo de Sanatorio Argentino agendará la cita en nuestro sistema institucional y te confirmará los detalles a la brevedad.\n\n` +
                        `${getAgentHandoffNotice()}`;
                    updates.status = 'sin_asignar';
                    updates.bot_active = false;
                    nextStage = 'esperando_agente';
                    updates.ai_summary = buildTriageSummary(updates, 'turno', analysis.doctorRecord, true, paciente?.edad);
                }
            } else {
                replyText = `¡Muchas gracias *${fullName}*! 🏥 Registramos tu cobertura (*${osPlanText}*).\n\n` +
                    `Por favor indícanos:\n` +
                    `• ¿Con qué *profesional* o para qué *especialidad médica* solicitás la atención?\n` +
                    `• Preferencia de *días y horarios* (mañana o tarde)\n\n` +
                    `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"* | 👤 *Agente:* Escribí *"Agente"*`;
                updates.status = 'bot';
                updates.bot_active = true;
                nextStage = 'esperando_datos_turno';
                updates.bot_stage = 'esperando_datos_turno';
            }
        }
        // CASO 1B: Paciente en espera de datos de admisión nuevo paciente (Nombre, Fecha Nac, Dpto)
        // Se ejecuta directamente handleNewPatientIntake preservando el DNI previamente verificado en conv.dni
        else if (currentStage === 'esperando_datos_nuevo') {
            const res = await handleNewPatientIntake(
                cleanText,
                candidateDni,
                conv,
                phone,
                updates,
                analysis.intent,
                analysis.doctorRecord,
                doctorDisplay
            );
            nextStage = res.nextStage;
            replyText = res.replyText;
        }
        // CASO 1C: Paciente respondiendo DNI (Bifurcación Camino 1 vs Camino 2)
        else if (candidateDni && isValidArgentineDni(candidateDni)) {
            const { data: pFound } = await supabase
                .from('hospital_pacientes')
                .select('id_paciente, dni, nombre, coseguro, telefono, email, nhc, centro, edad, fecha_nacimiento')
                .eq('dni', candidateDni)
                .limit(1)
                .maybeSingle();

            if (pFound) {
                // CAMINO 1: Paciente Registrado en SALUS
                paciente = pFound;
                updates.dni = paciente.dni;
                updates.nombre_completo = paciente.nombre;
                updates.nhc = paciente.nhc;
                updates.es_paciente_existente = true;

                // Extraer si en el mismo mensaje ya informó su obra social y plan
                const extractedOs = (await extractPatientVariables(cleanText, candidateDni))?.obra_social;
                if (extractedOs && !extractedOs.toLowerCase().includes('a confirmar')) {
                    updates.obra_social = extractedOs;
                    replyText = `¡Muchas gracias *${paciente.nombre}*! ✅ Encontramos tu historia clínica en Sanatorio Argentino (DNI: *${candidateDni}*) con cobertura *${extractedOs}*.\n\n` +
                        `${getAgentHandoffNotice()}`;
                    updates.status = 'sin_asignar';
                    updates.bot_active = false;
                    nextStage = 'esperando_agente';
                    updates.ai_summary = buildTriageSummary(updates, analysis.intent, analysis.doctorRecord, true, paciente.edad);
                } else {
                    replyText = `¡Muchas gracias *${paciente.nombre}*! ✅ Encontramos tu historia clínica en Sanatorio Argentino (DNI: *${candidateDni}*).\n\n` +
                        `📋 Para verificar tu cobertura institucional y registrar tu solicitud correctamente, por favor indícanos tu *Obra Social / Prepaga y Plan actual* (ej: OSP Plan Tradicional, OSDE 210, Swiss Medical, o Particular):`;
                    updates.status = 'bot';
                    updates.bot_active = true;
                    nextStage = 'esperando_obra_social_paciente';
                    updates.bot_stage = 'esperando_obra_social_paciente';
                }
            } else {
                // CAMINO 2: Paciente No Registrado en SALUS -> Pedir datos obligatorios
                const res = await handleNewPatientIntake(
                    cleanText,
                    candidateDni,
                    conv,
                    phone,
                    updates,
                    analysis.intent,
                    analysis.doctorRecord,
                    doctorDisplay
                );
                nextStage = res.nextStage;
                replyText = res.replyText;
            }
        } else {
            // CASO 1D: Paciente continuando con la carga de datos obligatorios para el alta
            const res = await handleNewPatientIntake(
                cleanText,
                candidateDni,
                conv,
                phone,
                updates,
                analysis.intent,
                analysis.doctorRecord,
                doctorDisplay
            );
            nextStage = res.nextStage;
            replyText = res.replyText;
        }
    } 
    // =============================================
    // FLUJO: GUARDIAS MÉDICAS 24 HORAS
    // =============================================
    else if (analysis.intent === 'guardia') {
        updates.motivo_consulta = 'Guardia Médica 24hs / Urgencias';
        replyText = `🚨 *Guardias Médicas las 24 Horas — Sanatorio Argentino*\n\n` +
            `Contamos con un servicio permanente de guardia médica activa las 24 horas, todos los días del año, por orden de llegada con triage de urgencia en nuestra *SEDE 01*:\n\n` +
            `📍 *Lugar de atención:* San Luis 432 Oeste, Capital, San Juan.\n\n` +
            `🩺 *Especialidades disponibles de guardia:*\n` +
            `• *Clínica Médica Adultos*\n` +
            `• *Pediatría*\n` +
            `• *Ginecología y Obstetricia*\n` +
            `• *Cardiología*\n` +
            `• *Traumatología* (Guardia pasiva especializada)\n` +
            `• *Cirugía General* (Guardia pasiva especializada)\n` +
            `• *Urología* (Guardia pasiva especializada)\n\n` +
            `🌐 Para más información institucional podés ingresar a:\n👉 https://www.sanatorioargentino.com.ar/\n\n` +
            `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"* | 👤 *Agente:* Escribí *"Agente"*`;
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: CHEQUEO PREVENTIVO DE SALUD
    // =============================================
    else if (analysis.intent === 'chequeo') {
        const isBookingChequeo = /\b(quiero\s+(?:un\s+)?turno|sacar\s+turno|coordinar\s+turno|pedir\s+turno|agendar|anotame|dame\s+turno|solicitar\s+turno|turno\s+para\s+el\s+chequeo|coordinar\s+fecha)\b/i.test(cleanText);

        if (!isBookingChequeo) {
            // CONSULTA INFORMATIVA: El paciente consulta información, días, horarios o cómo funciona el circuito.
            // NO se envía a los agentes humanos; el bot permanece ACTIVO.
            updates.motivo_consulta = 'Información: Chequeo Preventivo de Salud';
            replyText = `¡Hola *${fullName}*! 🏥 Te contamos en detalle cómo funciona el *Circuito de Chequeo Preventivo de Salud*:\n\n` +
                `🕒 *¿Cuándo y cómo se realiza?*\n` +
                `• Se realiza de *lunes a viernes por la mañana* (ingreso a partir de las 7:30 hs en ayunas).\n` +
                `• Es un circuito completo y coordinado en una sola jornada (aproximadamente 4 horas de duración, sin traslados ni demoras).\n\n` +
                `🏢 *Sedes disponibles:*\n` +
                `• *Sede Santa Fe* (Santa Fe 263 Este)\n` +
                `• *Sede San Luis* (San Luis 432 Oeste)\n\n` +
                `🩺 *¿Qué estudios incluye?*\n` +
                `• Análisis de laboratorio completos (sangre y orina)\n` +
                `• Evaluación cardiológica con Electrocardiograma (ECG)\n` +
                `• Radiografía de tórax y ecografías de control\n` +
                `• Estudios complementarios según edad y perfil (mamografía, etc.)\n` +
                `• Consulta médica clínica integral de apertura y cierre\n\n` +
                `🌐 Más detalles: https://www.sanatorioargentino.com.ar/chequeo-preventivo-de-salud.html\n\n` +
                `💬 *¿Deseas coordinar un turno para realizarte el circuito?*\n` +
                `Escribinos *'Quiero coordinar turno'* indicando tu sede de preferencia (*Santa Fe* o *San Luis*).`;

            updates.bot_active = true;
            nextStage = 'informacion_respondida';
        } else {
            // SOLICITUD DE TURNO / COORDINACIÓN: El paciente desea agendar efectivamente
            updates.motivo_consulta = 'Chequeo Preventivo de Salud (Coordinación)';
            updates.medico_o_especialidad = 'Circuito Chequeo Preventivo';

            const infoChequeoTurno = `¡Excelente *${fullName}*! 🏥 Te ayudamos a coordinar tu fecha para el *Circuito de Chequeo Preventivo de Salud*.\n\n` +
                `Por favor indícanos:\n` +
                `• *Sede de preferencia:* Sede Santa Fe (Santa Fe 263 Este) o Sede San Luis (San Luis 432 Oeste).\n` +
                `• *Preferencia de fecha o día de la semana* (de lunes a viernes por la mañana).\n\n` +
                `${getAgentHandoffNotice()}`;

            if (isExistingPatient) {
                replyText = infoChequeoTurno;
                updates.status = 'sin_asignar';
                updates.bot_active = false;
                nextStage = 'esperando_agente';
                updates.ai_summary = buildTriageSummary(updates, 'chequeo', analysis.doctorRecord, true, paciente?.edad);
            } else {
                const res = await handleNewPatientIntake(
                    cleanText,
                    candidateDni,
                    conv,
                    phone,
                    updates,
                    'chequeo',
                    analysis.doctorRecord,
                    doctorDisplay,
                    infoChequeoTurno
                );
                nextStage = res.nextStage;
                replyText = res.replyText;
            }
        }
    }
    // =============================================
    // FLUJO: PROGRAMA PREVENIR (OSP)
    // =============================================
    else if (analysis.intent === 'prevenir') {
        const isBookingPrevenir = /\b(quiero\s+(?:un\s+)?turno|sacar\s+turno|coordinar\s+turno|pedir\s+turno|agendar|anotame|dame\s+turno|solicitar\s+turno)\b/i.test(cleanText);

        if (!isBookingPrevenir) {
            // CONSULTA INFORMATIVA: No se envía a los agentes humanos; el bot permanece ACTIVO
            updates.motivo_consulta = 'Información: Programa Prevenir (OSP)';
            replyText = `¡Hola *${fullName}*! 🏥 Te brindamos información sobre el *Programa Prevenir* de Obra Social Provincia (OSP):\n\n` +
                `🩺 *¿De qué se trata?*\n` +
                `Es un circuito coordinado para la detección precoz del cáncer de mama y cuello uterino destinado a afiliadas de OSP.\n\n` +
                `📋 *¿Qué incluye?*\n` +
                `• Consulta con especialista en Ginecología\n` +
                `• Mamografía digital bilateral\n` +
                `• Se realiza de manera integrada en *Sede Santa Fe* (Santa Fe 263 Este).\n\n` +
                `👉 Más información: https://www.sanatorioargentino.com.ar/especialidades-medicas/programa-prevenir.html\n\n` +
                `💬 *¿Deseas solicitar turno para el Programa Prevenir?*\n` +
                `Escribinos *'Quiero turno para Prevenir'* para que un agente te coordine la fecha.`;

            updates.bot_active = true;
            nextStage = 'informacion_respondida';
        } else {
            // SOLICITUD DE TURNO / COORDINACIÓN
            updates.motivo_consulta = 'Programa Prevenir (OSP) (Coordinación)';
            updates.medico_o_especialidad = 'Programa Prevenir';

            const infoPrevenirTurno = `¡Excelente *${fullName}*! 🏥 Te ayudamos a coordinar tu turno para el *Programa Prevenir (OSP)* en Sede Santa Fe.\n\n` +
                `Por favor indícanos tu preferencia de día y horario (mañana o tarde).\n\n` +
                `${getAgentHandoffNotice()}`;

            if (isExistingPatient) {
                replyText = infoPrevenirTurno;
                updates.status = 'sin_asignar';
                updates.bot_active = false;
                nextStage = 'esperando_agente';
                updates.ai_summary = buildTriageSummary(updates, 'prevenir', analysis.doctorRecord, true, paciente?.edad);
            } else {
                const res = await handleNewPatientIntake(
                    cleanText,
                    candidateDni,
                    conv,
                    phone,
                    updates,
                    'prevenir',
                    analysis.doctorRecord,
                    doctorDisplay,
                    infoPrevenirTurno
                );
                nextStage = res.nextStage;
                replyText = res.replyText;
            }
        }
    }
    // =============================================
    // FLUJO: INFORMES Y RESULTADOS DE LABORATORIO (WEB GLIMS)
    // =============================================
    else if (analysis.intent === 'informes_laboratorio') {
        updates.motivo_consulta = 'Informes: Laboratorio (Portal Web)';
        replyText = `🔬 *Consulta de Resultados de Laboratorio*\n\n` +
            `Para consultar los resultados de tus análisis clínicos de laboratorio:\n\n` +
            `🔑 *Acceso Web:*\n` +
            `Al momento de la extracción, el laboratorio te entrega tu *usuario y contraseña*. Esta clave es permanente y no es necesario gestionarla cada vez que concurras.\n\n` +
            `👉 *Ingresá a consultar tus resultados aquí:*\n` +
            `http://6430052dd12b.sn.myname.net:8082/glymsweb?tipo_u=4\n\n` +
            `⚠️ *Prácticas confidenciales:* Aquellos estudios que requieran estricta confidencialidad médica no se publican por web y deben ser retirados personalmente en el laboratorio.\n\n` +
            `🌐 Para más información sobre el Sanatorio visitá:\n👉 https://www.sanatorioargentino.com.ar/`;
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: INFORMES DE DIAGNÓSTICO POR IMÁGENES (PORTAL ITS)
    // =============================================
    else if (analysis.intent === 'informes_imagenes') {
        updates.motivo_consulta = 'Informes: Diagnóstico por Imágenes';
        replyText = `🖼️ *Portal de Diagnóstico por Imágenes*\n\n` +
            `Para consultar y descargar tus estudios de imágenes (radiografías, ecografías, tomografías, resonancias, mamografías):\n\n` +
            `👉 *Portal de Pacientes ITS - Diagnóstico por Imágenes:*\n` +
            `https://imagenes.itsanarg.com.ar/patientportal/index.php\n\n` +
            `Podés acceder con tu número de DNI y la contraseña provista al momento de realizar la práctica médica.\n\n` +
            `🌐 Para conocer sedes y servicios podés ingresar a:\n👉 https://www.sanatorioargentino.com.ar/`;
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: CITOLOGÍA (PAP) Y BIOPSIAS
    // =============================================
    else if (analysis.intent === 'informes_biopsia_pap') {
        updates.motivo_consulta = 'Informes: Citología / Biopsia';
        replyText = `📄 *Entrega de Resultados de Citología (PAP) y Biopsias*\n\n` +
            `Por favor tené en cuenta las siguientes indicaciones institucionales:\n\n` +
            `👨‍⚕️ *Si tu médico atiende en Consultorios del Sanatorio:*\n` +
            `• NO es necesario retirar el informe en papel: queda registrado en tu *Historia Clínica Digital* y el profesional te indicará el resultado en tu próxima consulta médica.\n\n` +
            `🏢 *Si tu médico es externo (no atiende en consultorios de Sanatorio Argentino):*\n` +
            `• *Biopsias:* Se retiran personalmente en Administración (Sede 02: San Luis 433 Oeste, 1° Piso).\n` +
            `• *Citología (PAP):* Podés solicitar tu informe por WhatsApp en el siguiente link:\n` +
            `👉 https://wa.me/5492644552540?text=Hola%20quiero%20solicitar%20un%20informe\n\n` +
            `🌐 Para más información institucional visitá:\n👉 https://www.sanatorioargentino.com.ar/`;
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: INFORMES GENERAL (MENÚ DE INFORMES)
    // =============================================
    else if (analysis.intent === 'informes_general') {
        updates.motivo_consulta = 'Informes: Menú General';
        replyText = `📁 *Consulta y Retiro de Informes Médicos*\n\n` +
            `Seleccioná o escribí qué tipo de informe necesitás consultar:\n\n` +
            `1️⃣ *Diagnóstico por Imágenes* (Radiografía, Ecografía, Resonancia, Tomografía, Mamografía):\n` +
            `👉 Portal Web: https://imagenes.itsanarg.com.ar/patientportal/index.php\n\n` +
            `2️⃣ *Laboratorio de Análisis Clínicos:*\n` +
            `👉 Portal Web: http://6430052dd12b.sn.myname.net:8082/glymsweb?tipo_u=4\n\n` +
            `3️⃣ *Citología (PAP) o Biopsias:*\n` +
            `• Médico interno: Se visualiza en tu Historia Clínica Digital en consulta.\n` +
            `• Médico externo: Biopsias en San Luis 433 Oeste (1° Piso) o Citología por WhatsApp al: https://wa.me/5492644552540\n\n` +
            `🌐 Más detalles en: https://www.sanatorioargentino.com.ar/`;
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: SERVICIO DE LABORATORIO (ATENCIÓN PRESENCIAL Y EXTRACCIONES)
    // =============================================
    else if (analysis.intent === 'servicio_laboratorio') {
        updates.motivo_consulta = 'Laboratorio: Atención Presencial y Extracciones';
        replyText = `🩸 *Laboratorio de Análisis Clínicos — Sanatorio Argentino*\n\n` +
            `Contamos con laboratorio de análisis clínicos en:\n` +
            `📍 *Sede 01 (San Luis 432 Oeste):* Guardias activas las *24 horas*.\n` +
            `📍 *Sede Santa Fe (Santa Fe 263 Este):* Horario de atención de *7:30 a 21:00 hs*.\n\n` +
            `📋 *Pautas para la atención:*\n` +
            `• La atención en ambas sedes es *por orden de llegada* (no se saca turno previo).\n` +
            `• *Extracciones de sangre:* Hasta las 10:00 am (por condiciones de ayuno).\n\n` +
            `📲 *Líneas de WhatsApp para consultas de preparación / ayuno:*\n` +
            `• Sede 01: https://wa.me/5492644867408\n` +
            `• Sede Santa Fe: https://wa.me/5492644609384\n\n` +
            `🌐 Para más información visitá: https://www.sanatorioargentino.com.ar/`;
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: VACUNATORIO
    // =============================================
    else if (analysis.intent === 'vacunatorio') {
        updates.motivo_consulta = 'Información: Vacunatorio';
        replyText = `💉 *Vacunatorio Oficial y Extraoficial — Sanatorio Argentino*\n\n` +
            `📍 *Ubicación:* Sede 02 — Calle San Luis 433 Oeste.\n\n` +
            `🕒 *Horarios de atención:*\n` +
            `• Lunes a viernes de 7:30 a 20:30 hs.\n` +
            `• Sábados de 8:30 a 12:30 hs.\n\n` +
            `📋 *Detalles del servicio:*\n` +
            `• Cuenta con todas las vacunas oficiales del Calendario Nacional (gratuitas) y vacunas extraoficiales.\n` +
            `• Adhesión a campañas nacionales de vacunación.\n` +
            `• Para la compra de vacunas extraoficiales se reciben obras sociales, tarjetas de débito y crédito.\n\n` +
            `🌐 Para conocer más ingresá a: https://www.sanatorioargentino.com.ar/`;
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: CURSO DE EMBARAZADAS Y YOGA
    // =============================================
    else if (analysis.intent === 'curso_embarazadas') {
        updates.motivo_consulta = 'Información: Preparto y Yoga para Embarazadas';
        replyText = `🤰 *Espacio para Futuras Mamás — Sanatorio Argentino*\n\n` +
            `1️⃣ *Curso y Gimnasia para Embarazadas:*\n` +
            `• Todos los sábados a las 10:00 hs en la Sala de Ateneos de Sede 02 (San Luis 433 Oeste).\n` +
            `• Las temáticas varían cada fin de semana y se difunden en nuestras redes: Facebook e Instagram (@sanatorioargentino).\n\n` +
            `2️⃣ *Clases de Yoga para Embarazadas:*\n` +
            `• De martes a viernes de 18:00 a 19:00 hs.\n` +
            `• Más información e inscripción por WhatsApp:\n` +
            `👉 https://wa.me/5492644117778\n` +
            `• Web: https://www.sanatorioargentino.com.ar/novedades/actualidad/clases-de-yoga-para-embarazadas.html\n\n` +
            `🌐 Portal oficial: https://www.sanatorioargentino.com.ar/`;
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: REGISTRO CIVIL (NACIMIENTOS)
    // =============================================
    else if (analysis.intent === 'registro_civil') {
        updates.motivo_consulta = 'Información: Registro Civil / Nacimientos';
        replyText = `👶 *Delegación Registro Civil — Sanatorio Argentino*\n\n` +
            `📍 *Ubicación:* 1° Piso de Sede 02 (San Luis 433 Oeste).\n` +
            `🕒 *Horario de atención:* Lunes a viernes de 7:30 a 12:30 hs.\n\n` +
            `📝 *Inscripción de Nacimiento (Plazo: 40 días corridos desde el parto):*\n\n` +
            `• *Primer bebé:* Deben presentarse obligatoriamente ambos padres.\n` +
            `• *Mamá soltera:* Fotocopia del DNI de la madre.\n` +
            `• *Padres no casados:* Ambos padres presentes sin excepción + Fotocopia DNI de ambos.\n` +
            `• *Padres casados:* Fotocopia DNI de ambos + Libreta o Acta de Matrimonio (puede concurrir cualquiera de los cónyuges).\n\n` +
            `🌐 Para más información institucional visitá: https://www.sanatorioargentino.com.ar/`;
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: ADMINISTRACIÓN, CIRUGÍAS Y PRESUPUESTOS
    // =============================================
    else if (analysis.intent === 'administracion_presupuestos') {
        if (patientSentImageRecently) {
            updates.motivo_consulta = 'Presupuesto de Estudio / Práctica Médica';
            replyText = `¡Hola *${fullName}*! 🏥 Te ayudamos con el *presupuesto y aranceles* de tu estudio.\n\n` +
                `Un agente revisará la orden médica que nos enviaste y te informará los valores y cobertura de tu obra social a la brevedad.\n\n` +
                `${getAgentHandoffNotice()}`;
            updates.status = 'sin_asignar';
            updates.bot_active = false;
            nextStage = 'esperando_agente';
        } else {
            updates.motivo_consulta = 'Administración: Presupuestos e Internación';
            replyText = `💼 *Administración de Cirugías, Presupuestos e Internación*\n\n` +
                `Si te vas a realizar una cirugía en Sanatorio Argentino y necesitas presupuesto o consultar cobertura:\n\n` +
                `📍 *Atención Presencial:* Oficina de Administración en Sede 02 (San Luis 433 Oeste). De lunes a viernes de 7:30 a 20:00 hs.\n` +
                `📧 *Email:* administracion@sanatorioargentino.com.ar\n` +
                `📞 *Teléfono:* 2644303040\n` +
                `📲 *WhatsApp:* https://wa.me/5492644809396?text=Hola%20necesito\n\n` +
                `🌐 Para más información institucional visitá: https://www.sanatorioargentino.com.ar/`;
            nextStage = 'informacion_respondida';
        }
    }
    // =============================================
    // FLUJO: HORARIOS DE SEDES Y VISITAS
    // =============================================
    else if (analysis.intent === 'horarios_sedes') {
        updates.motivo_consulta = 'Información: Horarios de Sedes y Visitas';
        replyText = `🕒 *Horarios de Atención de Sedes y Visitas — Sanatorio Argentino*\n\n` +
            `🏢 *SEDE 01 (San Luis 432 Oeste - Capital):*\n` +
            `• Lunes a viernes de 7:30 a 21:00 hs | Sábados de 8:00 a 13:00 hs.\n` +
            `• *Horario de Visitas de Internados:* 18:00 a 21:00 hs.\n\n` +
            `🏢 *SEDE 02 (San Luis 433 Oeste - Capital):*\n` +
            `• Lunes a viernes de 7:30 a 21:00 hs | Sábados de 8:00 a 13:00 hs.\n\n` +
            `🏢 *SEDE 03 (San Luis 463 Oeste - Capital):*\n` +
            `• Lunes a viernes de 7:30 a 21:00 hs | Sábados de 8:00 a 12:00 hs.\n\n` +
            `🏢 *SEDE SANTA FE (Santa Fe 263 Este - Capital):*\n` +
            `• Lunes a viernes de 7:30 a 21:00 hs | Sábados de 8:00 a 12:00 hs.\n\n` +
            `🚨 *Guardia Médica:* Sede 01 activa las 24 horas.\n\n` +
            `🌐 Más información en: https://www.sanatorioargentino.com.ar/`;
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: TELÉFONOS Y WHATSAPPS DE SEDES Y SECTORES
    // =============================================
    else if (analysis.intent === 'telefonos_sedes') {
        updates.motivo_consulta = 'Información: Directorio Telefónico y WhatsApps';
        if (analysis.sectorKey === 'fertilidad') {
            replyText = `📲 *Contacto de Medicina Reproductiva / Fertilidad:*\nPodés comunicarte por WhatsApp directamente con el sector al siguiente enlace:\n👉 https://wa.link/kfqzc2\n\n🌐 Más información: https://www.sanatorioargentino.com.ar/`;
        } else if (analysis.sectorKey === 'administracion') {
            replyText = `📲 *Contacto de Administración:* https://wa.link/4po00r\nTeléfono: 2644303040\nMail: administracion@sanatorioargentino.com.ar\n\n🌐 Más información: https://www.sanatorioargentino.com.ar/`;
        } else if (analysis.sectorKey === 'internacion') {
            replyText = `📲 *Recepción de Internación (Sede 01):* https://wa.link/xpsjx4\n\n🌐 Más información: https://www.sanatorioargentino.com.ar/`;
        } else if (analysis.sectorKey === 'citologia') {
            replyText = `📲 *Citología (Sede Santa Fe):* https://wa.link/nxmj56\n\n🌐 Más información: https://www.sanatorioargentino.com.ar/`;
        } else if (analysis.sectorKey === 'imagenes') {
            replyText = `📲 *Diagnóstico por Imágenes:*\n• Sede 01 (1° Piso): https://wa.link/ori86c\n• Sede Santa Fe: https://wa.link/dcx4bz\n• Portal Web: https://imagenes.itsanarg.com.ar/patientportal/index.php\n\n🌐 Más información: https://www.sanatorioargentino.com.ar/`;
        } else if (analysis.sectorKey === 'laboratorio') {
            replyText = `📲 *Laboratorio de Análisis Clínicos:*\n• Sede 01: https://wa.link/17bfdt (o https://wa.me/5492644867408)\n• Sede Santa Fe: https://wa.link/9l2ix4 (o https://wa.me/5492644609384)\n\n🌐 Más información: https://www.sanatorioargentino.com.ar/`;
        } else if (analysis.sectorKey === 'fundacion') {
            replyText = `📲 *Fundación Sanatorio Argentino:* https://wa.link/iazmw0 (o https://wa.me/5492644867318)\nWeb: https://fundacion.sanatorioargentino.com.ar\n\n🌐 Más información: https://www.sanatorioargentino.com.ar/`;
        } else {
            replyText = `📞 *Directorio de WhatsApps por Sede y Sector — Sanatorio Argentino:*\n\n` +
                `🏢 *SEDE 01 (San Luis 432 Oeste):*\n` +
                `• 1° Piso (Consultorios, Imágenes, Recién nacido): https://wa.link/ori86c\n` +
                `• Chequeo: https://wa.link/a6pumc\n` +
                `• Laboratorio: https://wa.link/17bfdt\n` +
                `• Recepción Internación: https://wa.link/xpsjx4\n\n` +
                `🏢 *SEDE 02 (San Luis 433 Oeste):*\n` +
                `• Recepción de Consultorios: https://wa.link/x0ov0y\n` +
                `• Administración: https://wa.link/4po00r\n` +
                `• Fertilidad / Medicina Reproductiva: https://wa.link/kfqzc2\n` +
                `• Fundación: https://wa.link/iazmw0\n\n` +
                `🏢 *SEDE 03 (San Luis 463 Oeste):*\n` +
                `• Recepción de Consultorios: https://wa.link/q1khuw\n\n` +
                `🏢 *SEDE SANTA FE (Santa Fe 263 Este):*\n` +
                `• Sector 1: https://wa.link/hs438c\n` +
                `• Sector 2: https://wa.link/ssl628\n` +
                `• Citología: https://wa.link/nxmj56\n` +
                `• Laboratorio: https://wa.link/9l2ix4\n` +
                `• Diagnóstico por Imágenes: https://wa.link/dcx4bz\n` +
                `• Chequeo Preventivo: https://wa.link/mvuq3g\n\n` +
                `🌐 Web oficial: https://www.sanatorioargentino.com.ar/\n\n` +
                `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"* | 👤 *Agente:* Escribí *"Agente"*`;
        }
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: RECLAMOS, SUGERENCIAS Y CALIDAD
    // =============================================
    else if (analysis.intent === 'reclamos_calidad') {
        updates.motivo_consulta = 'Reclamos y Sugerencias / Calidad';
        replyText = `⚠️ *Gestión de Sugerencias, Reclamos y Calidad*\n\n` +
            `¡Tu opinión nos interesa para seguir mejorando! Todos los datos son confidenciales.\n\n` +
            `📝 *Encuestas de satisfacción por servicio:*\n` +
            `• Paciente Ambulatorio: https://forms.gle/yCkvJ8EutPeZ7tVY6\n` +
            `• Internación Adultos: https://forms.gle/sKjtM3xRuxCiPvmG9\n` +
            `• Internación Neonatal y Pediátrica: https://forms.gle/2LjgybCQdHQhhdev9\n` +
            `• Guardia Pediátrica: https://forms.gle/hq3t6fZfYD6evVnw8\n` +
            `• Chequeo de Salud: https://forms.gle/vab2nNeuUAHTRLKbA\n` +
            `• Medicina Reproductiva: https://forms.gle/VffF2zcgyujXckPi7\n` +
            `• Curso para Embarazadas: https://forms.gle/1h55LBQxvjUA442X9\n\n` +
            `📧 *Canal formal para comentarios o reclamos:* calidad@sanatorioargentino.com.ar\n\n` +
            `🌐 Para más información ingresá a: https://www.sanatorioargentino.com.ar/\n\n` +
            `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"* | 👤 *Agente:* Escribí *"Agente"*`;
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: FUNDACIÓN SANATORIO ARGENTINO
    // =============================================
    else if (analysis.intent === 'fundacion') {
        updates.motivo_consulta = 'Información: Fundación Sanatorio Argentino';
        replyText = `💓 *Fundación Sanatorio Argentino (FSA)*\n\n` +
            `FSA tiene como misión la prevención y detección de enfermedades de la mujer y del niño en zonas alejadas y de difícil acceso a centros de salud de San Juan, mediante campañas de atención directa y estudios médicos necesarios.\n\n` +
            `✅ *Capacitaciones y Charlas:* Programas formativos diseñados para nuestra comunidad a lo largo del año.\n` +
            `✅ *Actividades y Eventos:* Eventos y encuentros solidarios para promover la salud.\n\n` +
            `🗓️ *Conocer actividades:* https://fundacion.sanatorioargentino.com.ar\n` +
            `📲 *WhatsApp directo con un asistente de la Fundación:* https://wa.me/5492644867318\n\n` +
            `🌐 Para más información visitá: https://www.sanatorioargentino.com.ar/\n\n` +
            `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"* | 👤 *Agente:* Escribí *"Agente"*`;
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: CONFIRMACIÓN DE TURNO ONLINE (CONTEXTUAL)
    // =============================================
    else if (analysis.intent === 'confirmar_turno_online') {
        const doc = turnoOnlineProximo?.profesional || turnosActivosProximos?.[0]?.medico || 'tu profesional';
        const f = turnoOnlineProximo?.fecha || turnosActivosProximos?.[0]?.fecha || '';
        const h = turnoOnlineProximo?.hora ? ` a las ${turnoOnlineProximo.hora} hs` : (turnosActivosProximos?.[0]?.hora ? ` a las ${turnosActivosProximos[0].hora} hs` : '');
        replyText = `¡Muchas gracias *${fullName}*! ✅ Registramos tu confirmación del turno con ${doc}${f ? ` para el ${f}${h}` : ''}.\n\n${getAgentHandoffNotice()}`;
        updates.motivo_consulta = `Confirmación Turno: ${doc}`;
        updates.status = 'sin_asignar';
        updates.bot_active = false;
        nextStage = 'esperando_agente';
    }
    // (Cancelación / reprogramación: gestionadas por handleGestionTurnoFlow antes de este bloque)
    // =============================================
    // FLUJO: SEGUIMIENTO DE CASO CON ASESOR HUMANO (CONTEXTUAL)
    // =============================================
    else if (analysis.intent === 'seguimiento_asesor') {
        replyText = `¡Muchas gracias *${fullName}*! Registramos tu respuesta en el chat para que el equipo continúe tu atención.\n\n${getAgentHandoffNotice()}`;
        updates.motivo_consulta = `Seguimiento de conversación con agente`;
        updates.status = 'sin_asignar';
        updates.bot_active = false;
        nextStage = 'esperando_agente';
    }
    // =============================================
    // FLUJO: AGRADECIMIENTO O CIERRE CORDIAL (CONTEXTUAL)
    // =============================================
    else if (analysis.intent === 'agradecimiento_cierre') {
        replyText = `¡De nada *${fullName}*! Que tengas un excelente día. Estamos a tu entera disposición ante cualquier otra consulta. 🏥`;
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO: TURNOS / REPROGRAMACIÓN
    // =============================================
    else if (analysis.intent === 'turno') {
        let doctorNoteMsg = '';
        const effectiveSpecialty = analysis.specialtyCandidate || detectSpecialty(cleanText) || null;
        if (doctorDisplay) {
            doctorNoteMsg = ` con el *${doctorDisplay}*${doctorSpecialty}`;
            updates.medico_o_especialidad = analysis.doctorRecord?.profesional_nombre || doctorDisplay;
            updates.motivo_consulta = `Solicitud de Turno: ${doctorDisplay}`;
        } else if (effectiveSpecialty) {
            doctorNoteMsg = ` para *${effectiveSpecialty}*`;
            updates.medico_o_especialidad = effectiveSpecialty;
            updates.motivo_consulta = `Solicitud de Turno: ${effectiveSpecialty}`;
        } else {
            updates.medico_o_especialidad = null; // Limpiar para no arrastrar consultas viejas
            updates.motivo_consulta = 'Solicitud de Turno / Consulta';
            if (conv) {
                conv.medico_o_especialidad = null;
                conv.motivo_consulta = 'Solicitud de Turno / Consulta';
            }
        }

        const isAskingOtherInTurno = 
            Boolean(analysis.isForOtherPatient) ||
            /\b(otro\s+paciente|otra\s+persona|no\s+es\s+para\s+m[ií]|para\s+otro|para\s+otra|para\s+un\s+familiar|es\s+para\s+un\s+familiar|un\s+paciente|del\s+paciente|de\s+un\s+paciente|de\s+otro\s+paciente|otros?\s+pacientes?|algun\s+paciente|familiar|familiares|mi\s+hijo|mi\s+hija|mi\s+mama|mi\s+mamá|mi\s+papa|mi\s+papá|mi\s+madre|mi\s+padre|mi\s+esposo|mi\s+esposa|mi\s+bebe|mi\s+bebé|mi\s+abuelo|mi\s+abuela|alguien\s+m[aá]s|tercero|tercera\s+persona)\b/i.test(cleanText);

        const isAskingNewTurno = 
            analysis.isExplicitNumberOption === '1' ||
            analysis.isExplicitNumberOption === '2' ||
            currentStage === 'turno_consultado' ||
            currentStage === 'esperando_confirmacion_turno' ||
            currentStage === 'esperando_datos_turno' ||
            Boolean(doctorDisplay) ||
            Boolean(effectiveSpecialty) ||
            Boolean(analysis.doctorRecord) ||
            Boolean(analysis.doctorCandidate) ||
            /\b(nuevo\s+turno|turno\s+nuevo|otro\s+turno|nueva\s+cita|cita\s+nueva|otra\s+cita|nuevo|otra)\b/i.test(cleanText) ||
            /\b(sacar|pedir|solicitar|agendar|conseguir|darme|sacarme|dar|reservar)\s+(?:un\s+|el\s+)?(?:nuevo\s+)?(?:turno|cita)\b/i.test(cleanText) ||
            /\b(?:quiero|quisiera|necesito|podr[ií]a|podr[ií]as|deseo)\s+(?:sacar|pedir|solicitar|agendar|reservar)\s+(?:un\s+|el\s+)?(?:nuevo\s+)?(?:turno|cita)\b/i.test(cleanText) ||
            /\b(?:quiero|quisiera|necesito|deseo)\s+(?:un\s+)?(?:turno\s+nuevo|nuevo\s+turno|otro\s+turno)\b/i.test(cleanText);

        if (isAskingOtherInTurno && isAskingNewTurno) {
            const specOrDocLine = (doctorDisplay || effectiveSpecialty)
                ? `• *Especialidad / Profesional:* Registramos *${doctorDisplay || effectiveSpecialty}* ✅\n`
                : `• ¿Con qué *profesional* o para qué *especialidad médica* solicita la atención?\n`;

            const isEstudioTurnoOther = detectEstudioConOrden(doctorDisplay) || detectEstudioConOrden(effectiveSpecialty) || detectEstudioConOrden(cleanText) || detectEstudioConOrden(conv?.medico_o_especialidad);
            const estudioBulletOther = isEstudioTurnoOther
                ? `• 📸 *Pedido médico:* Por favor adjuntanos la *foto clara o archivo de la orden médica* (obligatoria para agendar estudios de ${isEstudioTurnoOther}).\n`
                : '';

            replyText = `¡Hola! 🏥 Con gusto te ayudamos a coordinar el turno para tu familiar u otra persona.\n\n` +
                `Por favor indícanos:\n` +
                `• Número de *DNI del paciente* (sin puntos ni espacios)\n` +
                `• *Nombre y Apellido* del paciente\n` +
                `${specOrDocLine}` +
                `• *Obra Social / Prepaga y Plan* del paciente (o si la atención será Particular)\n` +
                `• Preferencia de *días y horarios* (mañana o tarde)\n` +
                `${estudioBulletOther}\n` +
                `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"* | 👤 *Agente:* Escribí *"Agente"*`;
            updates.bot_stage = 'esperando_datos_turno';
            updates.bot_active = true;
            nextStage = 'esperando_datos_turno';
            updates.motivo_consulta = 'Solicitud de Turno para familiar/tercero';
            updates.es_paciente_existente = false;
        } else if (isAskingOtherInTurno) {
            replyText = `¡Con gusto te ayudamos a consultar sobre el turno de otro paciente! 🏥\n\n` +
                `Por favor indícanos el número de *DNI del paciente* (solo números, sin puntos ni espacios):`;
            updates.bot_stage = 'esperando_dni_turno';
            updates.bot_active = true;
            nextStage = 'esperando_dni_turno';
            updates.motivo_consulta = 'Consulta Turno para otro paciente (esperando DNI)';
        } else if (!isAskingNewTurno && turnosActivosProximos && turnosActivosProximos.length > 0) {
            replyText = formatTurnosActivosReply(turnosActivosProximos, fullName, false, resolvedDni || undefined);
            updates.motivo_consulta = `Consulta Turno: ${turnosActivosProximos[0].medico || turnosActivosProximos[0].especialidad} (${turnosActivosProximos[0].fecha})`;
            updates.medico_o_especialidad = turnosActivosProximos[0].medico || turnosActivosProximos[0].especialidad;
            updates.bot_active = true;
            nextStage = 'turno_consultado';
        } else if (!isAskingNewTurno && turnoOnlineProximo) {
            replyText = `¡Hola *${fullName}*! 🏥\n\n` +
                `📅 *Tenés un turno online agendado:*\n` +
                `• *Profesional:* ${turnoOnlineProximo.profesional}\n` +
                `• *Fecha y Hora:* ${turnoOnlineProximo.fecha} a las ${turnoOnlineProximo.hora} hs\n` +
                `• *Agenda:* ${turnoOnlineProximo.agenda}\n\n` +
                `¿Deseás confirmar, reprogramar o cancelar tu turno?\n\n` +
                `💡 *¿Deseás averiguar sobre el turno de otro paciente o familiar?* Indícanos su número de *DNI*.\n\n` +
                `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"* | 👤 *Agente:* Escribí *"Agente"*`;
            updates.motivo_consulta = `Turno Online: ${turnoOnlineProximo.profesional} (${turnoOnlineProximo.fecha} ${turnoOnlineProximo.hora} hs)`;
            updates.medico_o_especialidad = turnoOnlineProximo.profesional;
            updates.bot_active = true;
            nextStage = 'esperando_confirmacion_turno';
            updates.ai_summary = buildTriageSummary(updates, 'turno', analysis.doctorRecord, true, paciente?.edad);
        } else if (lastBotContent.includes('te ayudamos a coordinar tu turno') || lastBotContent.includes('¿el turno es para vos') || currentStage === 'esperando_datos_turno') {
            const validDisplay = (doctorDisplay && !STOPWORDS_MEDICOS.has(doctorDisplay.replace(/^Dr[a]?\.\s*/i, '').toLowerCase())) ? doctorDisplay : '';
            const targetForMsg = updates.medico_o_especialidad || validDisplay || null;
            const docMsg = formatTurnoTargetPhrase(targetForMsg);

            const estudioRequiereOrden = detectEstudioConOrden(targetForMsg) || detectEstudioConOrden(effectiveSpecialty) || detectEstudioConOrden(cleanText) || detectEstudioConOrden(conv?.medico_o_especialidad);
            const hasSentOrderPhoto = isIncomingMedia || patientSentImageRecently || Boolean(conv?.order_analysis) || Boolean((conv?.ai_summary as any)?.medical_order);

            if (estudioRequiereOrden && !hasSentOrderPhoto) {
                replyText = `¡Muchas gracias *${fullName}*! 🏥 Registramos tus datos y preferencias para coordinar tu turno${docMsg}.\n\n` +
                    `📋 *Paso necesario:* Para poder autorizar y coordinar estudios de diagnóstico por imágenes (*${estudioRequiereOrden}*), es requisito indispensable contar con el pedido médico prescripto por el profesional.\n\n` +
                    `📸 Por favor, *envíanos una foto clara o archivo PDF de tu orden médica / pedido médico* por este medio.\n\n` +
                    `_(En cuanto nos envíes la foto, un agente agendará tu turno en nuestro sistema institucional con la orden correspondiente)._\n\n` +
                    `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"*`;
                updates.status = 'bot';
                updates.bot_active = true;
                updates.bot_stage = 'esperando_orden_foto';
                nextStage = 'esperando_orden_foto';
                updates.motivo_consulta = `Solicitud de Turno: ${fullName} - ${targetForMsg || estudioRequiereOrden} [Aguardando pedido médico]`;
                updates.ai_summary = {
                    ...buildTriageSummary(updates, 'turno', analysis.doctorRecord, isExistingPatient, paciente?.edad),
                    estudio_requiere_orden: estudioRequiereOrden,
                    esperando_pedido_medico: true
                };
            } else {
                replyText = `¡Muchas gracias *${fullName}*! 🏥 Ya registramos todos tus datos y preferencias para coordinar tu turno${docMsg}.\n\n` +
                    `Un agente del equipo de Sanatorio Argentino agendará tu turno en nuestro sistema institucional y te confirmará los detalles a la brevedad.\n\n` +
                    `${getAgentHandoffNotice()}\n\n` +
                    `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"*`;

                updates.status = 'sin_asignar';
                updates.bot_active = false;
                nextStage = 'esperando_agente';
                updates.ai_summary = buildTriageSummary(updates, 'turno', analysis.doctorRecord, isExistingPatient, paciente?.edad);
            }
        } else {
            const osTurnoInfo = getRegisteredOsInfo(paciente?.coseguro || conv?.obra_social);
            const osTurnoBullet = osTurnoInfo.hasRegisteredOs
                ? `• *Obra Social y Plan:* En tu ficha figura *${osTurnoInfo.cleanOsName}*. Confirmános si seguís teniendo cobertura allí y qué *plan* tenés (o si es otra/particular).`
                : `• *Obra Social / Prepaga* y plan (o si tu atención será Particular)`;

            const dniPrompt = paciente?.dni 
                ? `• *DNI:* En tu ficha figura *${paciente.dni}* (si el turno es para otra persona, indícanos su DNI, Nombre y Apellido)\n` 
                : `• Número de *DNI del paciente* (sin puntos ni espacios)\n`;

            const isEstudioTurno = detectEstudioConOrden(doctorDisplay) || 
                                   detectEstudioConOrden(effectiveSpecialty) || 
                                   detectEstudioConOrden(cleanText) || 
                                   detectEstudioConOrden(conv?.medico_o_especialidad);

            const specOrDocLine = isEstudioTurno
                ? `• *Estudio solicitado:* Registramos *${isEstudioTurno}* ✅\n`
                : ((doctorDisplay || effectiveSpecialty)
                    ? `• *Especialidad / Profesional:* Registramos *${doctorDisplay || effectiveSpecialty}* ✅\n`
                    : `• ¿Con qué *profesional* o para qué *especialidad médica* solicitás la atención?\n`);

            const estudioBullet = isEstudioTurno
                ? `• 📸 *Pedido médico:* Por favor adjuntanos la *foto clara o archivo de tu orden/pedido médico* (obligatoria para coordinar estudios de ${isEstudioTurno}).\n`
                : '';

            replyText = `¡Hola${paciente ? ` *${fullName}*` : ''}! 🏥 Te ayudamos a coordinar tu nuevo turno médico${doctorNoteMsg}.\n\n` +
                `Por favor indícanos:\n` +
                `${dniPrompt}` +
                `${specOrDocLine}` +
                `• ¿El turno es para vos o para un familiar / otra persona?\n` +
                `• Preferencia de *días y horarios* (mañana o tarde)\n` +
                `${osTurnoBullet}\n` +
                `${estudioBullet}\n` +
                `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"* | 👤 *Agente:* Escribí *"Agente"*`;
            updates.status = 'bot';
            updates.bot_active = true;
            nextStage = 'esperando_datos_turno';
            updates.ai_summary = buildTriageSummary(updates, 'turno', analysis.doctorRecord, isExistingPatient, paciente?.edad);
        }
    }
    // =============================================
    // FLUJO: AUTORIZACIONES
    // =============================================
    else if (analysis.intent === 'autorizacion') {
        updates.motivo_consulta = 'Autorizaciones de Estudios / Cobertura';

        // Si ya estábamos esperando la foto y el paciente acaba de enviar una imagen
        if (currentStage === 'esperando_foto_autorizacion' && isIncomingMedia) {
            replyText = `¡Muchas gracias${fullName ? ` *${fullName}*` : ''}! 📄 Recibimos la foto de tu orden médica para autorizar.\n\n` +
                `Un asesor de nuestro equipo de autorizaciones revisará la orden con tu obra social/prepaga y te confirmará la gestión a la brevedad.\n\n` +
                `${getAgentHandoffNotice()}\n\n` +
                `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"*`;
            updates.status = 'sin_asignar';
            updates.bot_active = false;
            nextStage = 'esperando_agente';
            updates.motivo_consulta = 'Foto de Orden Médica Recibida (para Autorización)';
            updates.ai_summary = buildTriageSummary(updates, 'autorizacion', analysis.doctorRecord, isExistingPatient, paciente?.edad);
            return await finalizeAndSend(replyText, nextStage, updates);
        }

        const alreadyAskedAutorizacion = lastBotMessage?.content?.includes('Te ayudamos con la *autorización* de tu orden médica');
        if (alreadyAskedAutorizacion && conv?.bot_stage === 'esperando_agente' && !isIncomingMedia) {
            console.log(`[triage-bot] Chat ${phone}: Ya se enviaron pautas de autorización previamente. Bot en silencio esperando al agente.`);
            replyText = '';
            updates.status = 'sin_asignar';
            updates.bot_active = false;
            nextStage = 'esperando_agente';
            updates.ai_summary = buildTriageSummary(updates, 'autorizacion', analysis.doctorRecord, isExistingPatient, paciente?.edad);
        } else if (isExistingPatient) {
            // NUNCA asumir que una imagen enviada con anterioridad es necesariamente la orden médica a autorizar.
            // Siempre solicitar la foto clara de la orden médica a autorizar.
            const orderPhotoPrompt = patientSentImageRecently
                ? `• 📸 *Foto clara de la orden médica a autorizar:* Si la imagen que enviaste anteriormente corresponde a esta orden médica, confirmánoslo escribiendo *"es la foto anterior"*; si era de otro trámite o documento, por favor envíanos aquí la *foto clara y legible de la orden médica* que precisás autorizar.`
                : `• 📸 Envianos la *foto clara y legible de la orden médica* que deseás autorizar.`;

            replyText = `¡Hola *${fullName}*! 🏥 Te ayudamos con la *autorización* de tu orden médica.\n\n` +
                `Por favor indícanos:\n` +
                `• ¿La orden médica es a tu nombre (*${fullName}*), o de otro paciente/familiar?\n` +
                `• *DNI*, *Nombre y Apellido* del paciente titular de la orden médica.\n` +
                `• *Obra Social o Prepaga* y qué *plan* posee (o si es Particular).\n` +
                `${orderPhotoPrompt}\n\n` +
                `*(Vigencia de órdenes médicas: 30 días corridos).*`;

            updates.status = 'bot';
            updates.bot_active = true;
            updates.bot_stage = 'esperando_foto_autorizacion';
            nextStage = 'esperando_foto_autorizacion';
            updates.ai_summary = buildTriageSummary(updates, 'autorizacion', analysis.doctorRecord, true, paciente?.edad);
        } else {
            const intro = `¡Hola! 👋 Te damos la bienvenida a *Sanatorio Argentino*.\nCon gusto te ayudamos con tu trámite de *autorización de orden médica*.\n📸 _(Recordá que te solicitaremos también la foto clara de la orden médica a autorizar)._`;
            const res = await handleNewPatientIntake(
                cleanText,
                candidateDni,
                conv,
                phone,
                updates,
                'autorizacion',
                analysis.doctorRecord,
                doctorDisplay,
                intro
            );
            nextStage = res.nextStage;
            replyText = res.replyText;
        }
    }
    // =============================================
    // FLUJO: GESTIÓN PARA OTRO PACIENTE / FAMILIAR (TURNO O AUTORIZACIÓN)
    // =============================================
    else if (analysis.intent === 'gestion_familiar') {
        updates.motivo_consulta = 'Gestión para Tercero / Familiar (Turno o Autorización)';

        replyText = `¡Entendido *${fullName}*! 🏥 Te ayudamos a gestionar el *turno o autorización* para tu familiar u otro paciente.\n\n` +
            `Por favor indícanos en un solo mensaje:\n` +
            `• *¿Qué trámite necesitás?* (Solicitar un *turno médico* o *autorizar una orden médica*)\n` +
            `• *DNI* (sin puntos), *Nombre y Apellido* del paciente que se atenderá.\n` +
            `• *Obra Social o Prepaga* y qué *plan* posee (o si es Particular).\n` +
            `• Si es turno: médico, especialidad o estudio requerido, y preferencia horaria.\n` +
            `• Si es autorización: envíanos la *foto clara de la orden médica*.\n\n` +
            `*(Si el paciente ya está registrado en Sanatorio Argentino, con su DNI lo localizamos de inmediato)*.\n\n` +
            `${getAgentHandoffNotice()}`;

        updates.status = 'sin_asignar';
        updates.bot_active = false;
        nextStage = 'esperando_agente';
        updates.ai_summary = buildTriageSummary(updates, 'gestion_familiar', analysis.doctorRecord, isExistingPatient, paciente?.edad);
    }
    // =============================================
    // FLUJO: GESTIÓN PROPIA (TURNO O AUTORIZACIÓN A NOMBRE DEL TITULAR)
    // =============================================
    else if (analysis.intent === 'gestion_propia') {
        updates.motivo_consulta = 'Gestión Propia (Turno o Autorización)';
        
        const osCandidate = paciente?.coseguro || conv?.obra_social || null;
        const osInfo = getRegisteredOsInfo(osCandidate);

        const osBullet = osInfo.hasRegisteredOs
            ? `• *Obra Social y Plan:* Tenemos registrada tu cobertura en *${osInfo.cleanOsName}*. ¿Seguís teniendo cobertura con esta obra social? De ser así, ¿qué *plan* tenés? (o avísanos si contás con otra cobertura o te atendés de forma *Particular*).`
            : `• *Obra Social y Plan:* Por favor indícanos qué *obra social o prepaga* tenés y qué *plan* posees (o si tu atención será de forma *Particular*).`;

        replyText = `¡Excelente *${fullName}*! 🏥 Te ayudamos a coordinar tu trámite.\n\n` +
            `Por favor indícanos:\n` +
            `• *¿Qué trámite necesitás realizar?* (Solicitar un *turno médico* o *autorizar una orden médica*)\n` +
            `• Si es turno: especialidad, práctica o profesional de tu preferencia, y preferencia de horario (mañana o tarde).\n` +
            `• Si es autorización: envíanos una *foto clara de tu orden médica*.\n` +
            `${osBullet}\n\n` +
            `${getAgentHandoffNotice()}`;

        updates.status = 'sin_asignar';
        updates.bot_active = false;
        nextStage = 'esperando_agente';
        updates.ai_summary = buildTriageSummary(updates, 'gestion_propia', analysis.doctorRecord, isExistingPatient, paciente?.edad);
    }
    // =============================================
    // FLUJO: DERIVACIÓN DIRECTA A AGENTE HUMANO
    // =============================================
    else if ((analysis.intent as any) === 'derivacion_agente_legacy') {
        updates.motivo_consulta = 'Solicitud de Atención con Agente';
        if (isExistingPatient) {
            replyText = `¡Hola *${fullName}*! 🏥 Te pido sinceras disculpas por cualquier inconveniente.\n\n` +
                `Ya mismo te comunico con un agente de nuestro equipo de atención para que continúe asistiéndote de forma personalizada.\n\n` +
                `📝 *Por favor, indícanos el motivo de tu consulta y detallanos qué necesitas* (podés enviarnos mensajes de texto o fotos/imágenes de pedidos médicos, estudios o credenciales) para que en breve te respondamos con la gestión lista.\n\n` +
                `${getAgentHandoffNotice()}`;
            updates.status = 'sin_asignar';
            updates.bot_active = false;
            nextStage = 'esperando_agente';
            updates.ai_summary = buildTriageSummary(updates, 'derivacion_agente', analysis.doctorRecord, true, paciente?.edad);
        } else {
            const intro = `¡Hola! 👋 Te pido disculpas por la molestia. Ya mismo te comunicamos con un agente de *Sanatorio Argentino*.`;
            const res = await handleNewPatientIntake(
                cleanText,
                candidateDni,
                conv,
                phone,
                updates,
                'derivacion_agente',
                analysis.doctorRecord,
                doctorDisplay,
                intro
            );
            nextStage = res.nextStage;
            replyText = res.replyText;
        }
    }
    // =============================================
    // FLUJO: INFORMACIÓN GENERAL / WEB
    // =============================================
    else if (analysis.intent === 'info') {
        replyText = `Para consultar información institucional, cartilla de profesionales, sedes y servicios de Sanatorio Argentino, podés ingresar a nuestro sitio web oficial:\n\n🌐 *https://www.sanatorioargentino.com.ar/*\n\nSi necesitás realizar un trámite en particular, indícanos si buscás turnos, autorizaciones, guardias o resultados de estudios.`;
        updates.motivo_consulta = 'Información General / Web';
        nextStage = 'informacion_respondida';
    }
    // =============================================
    // FLUJO CONVERSACIONAL INTELIGENTE POTENCIADO POR CHATGPT (OPENAI GPT-4o)
    // =============================================
    else {
        console.log(`[triage-bot] 🤖 Invocando Motor Conversacional ChatGPT (GPT-4o) para "${cleanText}"`);
        const convResult = await generateChatGptConversationalResponse(
            cleanText,
            conversationContext,
            {
                fullName,
                phone,
                isExistingPatient,
                dni: resolvedDni,
                obraSocial: paciente?.coseguro || updates.obra_social || conv?.obra_social || null
            },
            supabase
        );

        replyText = convResult.replyText;

        if (convResult.transferToAgent) {
            updates.status = 'sin_asignar';
            updates.bot_active = false;
            nextStage = 'esperando_agente';
            updates.motivo_consulta = convResult.summary || 'Solicitud de atención con agente';
            updates.ai_summary = buildTriageSummary(updates, 'derivacion_agente', analysis.doctorRecord, isExistingPatient, paciente?.edad);
        } else {
            updates.bot_active = true;
            nextStage = 'conversacion_activa';
            if (convResult.summary) {
                updates.motivo_consulta = convResult.summary;
            }
        }
    }

    return await finalizeAndSend(replyText, nextStage, updates);
}

/**
 * Calcula la edad en años a partir de una fecha de nacimiento (DD/MM/AAAA o AAAA-MM-DD)
 */
function calculateAgeFromBirthDate(birthDateStr: string | null): number | null {
    if (!birthDateStr) return null;
    try {
        const parts = birthDateStr.split(/[\/\-]/);
        let day = 1, month = 1, year = 1990;
        if (parts[0].length === 4) {
            year = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10);
            day = parseInt(parts[2], 10);
        } else if (parts.length === 3) {
            day = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10);
            year = parseInt(parts[2], 10);
            if (year < 100) year += year > 26 ? 1900 : 2000;
        } else {
            return null;
        }
        if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
        const today = new Date();
        let age = today.getFullYear() - year;
        const m = (today.getMonth() + 1) - month;
        if (m < 0 || (m === 0 && today.getDate() < day)) {
            age--;
        }
        return (age >= 0 && age <= 120) ? age : null;
    } catch {
        return null;
    }
}


/**
 * Determina cuáles de los 6 datos obligatorios están pendientes para admisión de un nuevo paciente
 */
function getMissingPatientFields(data: Record<string, any>): string[] {
    const missing: string[] = [];

    // 1. Nombre y Apellido (mínimo 2 palabras con letras reales: nombre + apellido)
    const name = (data.nombre_completo || '').trim();
    const GENERIC_NAMES = ['paciente', 'usuario', 'hola', 'doctor', 'doctora', 'buenas', 'sanatorio'];
    const nameWords = name.replace(/[,.]/g, ' ').split(/\s+/).filter((w: string) => /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ'-]{2,}$/.test(w));
    if (!name || name.length < 3 || GENERIC_NAMES.some(g => name.toLowerCase() === g) || nameWords.length < 2) {
        missing.push('nombre_completo');
    }

    // 2. DNI (7 u 8 dígitos numéricos)
    const dni = String(data.dni || '').replace(/\D/g, '');
    if (!dni || dni.length < 7 || dni.length > 8) {
        missing.push('dni');
    }

    // 3. Fecha de nacimiento o Edad
    const fn = (data.fecha_nacimiento || '').trim();
    const ed = data.edad;
    if (!fn && (!ed || isNaN(Number(ed)))) {
        missing.push('fecha_nacimiento_edad');
    }

    // 4. Obra Social o Cobertura
    const os = (data.obra_social || '').trim();
    const GENERIC_OS = ['particular / a confirmar', 'a confirmar', 'a consultar', 'no informada', 'no informado'];
    if (!os || GENERIC_OS.some(g => os.toLowerCase().includes(g))) {
        missing.push('obra_social');
    }

    // 5. Departamento de residencia en San Juan
    const dep = (data.departamento || '').trim();
    const GENERIC_DEP = ['san juan', 'no informado', 'no informada', 'a confirmar'];
    if (!dep || GENERIC_DEP.some(g => dep.toLowerCase() === g)) {
        missing.push('departamento');
    }

    return missing;
}

/**
 * Genera el mensaje amigable de repregunta solicitando ÚNICAMENTE los campos que faltan para el alta en SALUS
 */
function buildMissingFieldsPrompt(patientName: string | null, missing: string[], currentData: Record<string, any>): string {
    const labelsMap: Record<string, string> = {
        nombre_completo: '1️⃣ *Nombre y Apellido* (tal como figuran en tu DNI)',
        dni: '2️⃣ *Número de DNI* (solo números, sin puntos ni espacios)',
        fecha_nacimiento_edad: '3️⃣ *Fecha de Nacimiento* (DD/MM/AAAA) o *Edad*',
        obra_social: '4️⃣ *Obra Social / Prepaga y Plan* (o aclará "Particular" si no poseés cobertura médica)',
        departamento: '5️⃣ *Departamento / Localidad de residencia en San Juan* (ej: Capital, Rivadavia, Rawson, Santa Lucía, Chimbas, Pocito, Caucete, etc.)'
    };

    let intro = '';
    const cleanName = (patientName && !patientName.toLowerCase().startsWith('paciente')) ? patientName : null;

    if (cleanName) {
        intro = `¡Muchas gracias *${cleanName}*! 🏥\n\n` +
            `Constatamos que *no registrás una ficha previa de paciente en Sanatorio Argentino*.\n\n` +
            `Para poder abrir tu ficha de paciente en nuestro sistema institucional y coordinar tu atención, necesitamos los siguientes datos obligatorios de admisión:\n\n`;
    } else if (currentData.dni) {
        intro = `¡Hola! 🏥 Verificamos el DNI *${currentData.dni}* y constatamos que *no registrás una ficha previa de paciente en Sanatorio Argentino*.\n\n` +
            `Para poder abrir tu ficha de paciente en nuestro sistema institucional y coordinar tu atención, necesitamos los siguientes datos obligatorios de admisión:\n\n`;
    } else {
        intro = `¡Hola! 👋 Te damos la bienvenida a *Sanatorio Argentino*.\n\n` +
            `Para poder abrir tu ficha de paciente en nuestro sistema institucional y coordinar tu atención, necesitamos los siguientes datos obligatorios de admisión:\n\n`;
    }

    const bulletList = missing.map(m => labelsMap[m] || `• *${m}*`).join('\n');
    const footer = `\n\n_Podés responder con los datos en un solo mensaje o por partes._ Una vez recibidos, te comunicaremos de inmediato con el equipo de atención.`;

    return intro + bulletList + footer;
}

/**
 * Construye la Ficha Resumen de Triage que se guarda en conv.ai_summary para el Cockpit del operador
 */
function buildTriageSummary(
    data: Record<string, any>,
    intent: string,
    doctorRecord: any,
    isExisting: boolean,
    calculatedAge?: number | null
): Record<string, any> {
    const intentMap: Record<string, string> = {
        turno: 'Solicitud de Turno',
        autorizacion: 'Autorización de Estudio / Cobertura',
        chequeo: 'Chequeo Preventivo de Salud',
        prevenir: 'Programa Prevenir (OSP)',
        guardia: 'Consulta por Guardia 24hs',
        informes_laboratorio: 'Resultados de Laboratorio',
        informes_imagenes: 'Informes de Diagnóstico por Imágenes',
        derivacion_agente: 'Solicitud de Agente',
        gestion_familiar: 'Gestión para Tercero / Familiar (Turno o Autorización)',
        gestion_propia: 'Gestión Propia (Turno o Autorización)'
    };

    const tramite = intentMap[intent] || 'Consulta General de Atención';
    const age = calculatedAge || (data.fecha_nacimiento ? calculateAgeFromBirthDate(data.fecha_nacimiento) : data.edad) || null;

    let docName = doctorRecord?.profesional_nombre || (intent !== 'autorizacion' ? data.medico_o_especialidad : null);
    if (docName && docName.includes('(')) docName = docName.split('(')[0].trim();

    const isThirdParty = Boolean(data.es_gestion_tercero || data.parentesco || intent === 'gestion_familiar');

    return {
        resumen_solicitud: data.motivo_consulta || `Gestión de ${tramite.toLowerCase()} para ${data.nombre_completo || 'el paciente'}.`,
        tipo_tramite: tramite,
        ficha_dual: {
            es_gestion_tercero: isThirdParty,
            parentesco: data.parentesco || (isThirdParty ? 'Familiar' : null),
            titular: {
                nombre: data.titular_nombre || 'Titular de la Línea WhatsApp',
                telefono: data.telefono_contacto || data.phone || null
            },
            paciente: {
                nombre: data.paciente_nombre || data.nombre_completo || null,
                dni: data.paciente_dni || data.dni || null,
                obra_social: data.paciente_obra_social || data.obra_social || 'Particular',
                nhc: data.nhc || null,
                es_paciente_existente: isExisting
            }
        },

        datos_paciente: {
            nombre_completo: data.nombre_completo || null,
            dni: data.dni || null,
            obra_social: data.obra_social || 'Particular',
            fecha_nacimiento: data.fecha_nacimiento || null,
            edad: age,
            departamento: data.departamento || 'San Juan',
            telefono: data.telefono_contacto || data.phone || null,
            nhc: data.nhc || null,
            es_paciente_existente: isExisting
        },
        doctor_detectado: {
            nombre_aproximado: docName,
            especialidad_mencionada: doctorRecord?.especialidad || null,
            estudio_solicitado: null
        },
        prestador_matched: doctorRecord ? {
            profesional_nombre: doctorRecord.profesional_nombre,
            especialidad: doctorRecord.especialidad,
            consultorio_actual: doctorRecord.consultorio_actual,
            condiciones_consulta: doctorRecord.condiciones_consulta
        } : null,
        generated_at: new Date().toISOString()
    };
}

/**
 * Procesa el onboarding express para pacientes no registrados en SALUS
 */
async function handleNewPatientIntake(
    cleanText: string,
    candidateDni: string | null,
    conv: any,
    phone: string,
    updates: Record<string, any>,
    intent: string,
    doctorRecord: any,
    doctorDisplay: string | null,
    intentPromptPrefix?: string
): Promise<{ nextStage: string; replyText: string }> {
    const extracted = await extractPatientVariables(cleanText, candidateDni);

    // Prioridad DNI: Si la conversación ya tiene un DNI válido confirmado, se PRESERVA obligatoriamente.
    // Solo si no existe DNI previo se acepta candidateDni o extracted.dni (siempre que sean DNI válidos argentinos).
    const establishedConvDni = (conv?.dni && isValidArgentineDni(conv.dni)) ? conv.dni : null;
    const validCandidateDni = (candidateDni && isValidArgentineDni(candidateDni)) ? candidateDni : null;
    const validExtractedDni = (extracted.dni && isValidArgentineDni(extracted.dni)) ? extracted.dni : null;
    const finalDni = establishedConvDni || validCandidateDni || validExtractedDni || null;

    const mergedPatientData: Record<string, any> = {
        dni: finalDni,
        nombre_completo: extracted.nombre_completo || (conv?.nombre_completo && !conv?.nombre_completo.startsWith('Paciente') ? conv.nombre_completo : null),
        obra_social: extracted.obra_social || (conv?.obra_social && conv?.obra_social !== 'Particular / A confirmar' && conv?.obra_social !== 'A consultar' ? conv.obra_social : null),
        fecha_nacimiento: extracted.fecha_nacimiento || conv?.fecha_nacimiento || null,
        edad: extracted.edad || (conv?.fecha_nacimiento ? calculateAgeFromBirthDate(conv.fecha_nacimiento) : null),
        departamento: extracted.departamento || (conv?.departamento && conv?.departamento !== 'San Juan' ? conv.departamento : null),
        telefono_contacto: extracted.telefono_contacto || conv?.telefono_contacto || phone,
        motivo_consulta: extracted.motivo_consulta || updates.motivo_consulta || conv?.motivo_consulta || null,
        medico_o_especialidad: extracted.medico_o_especialidad || updates.medico_o_especialidad || conv?.medico_o_especialidad || null
    };

    if (mergedPatientData.fecha_nacimiento && !mergedPatientData.edad) {
        mergedPatientData.edad = calculateAgeFromBirthDate(mergedPatientData.fecha_nacimiento);
    }

    if (mergedPatientData.dni) updates.dni = mergedPatientData.dni;
    if (mergedPatientData.nombre_completo) updates.nombre_completo = mergedPatientData.nombre_completo;
    if (mergedPatientData.obra_social) updates.obra_social = mergedPatientData.obra_social;
    if (mergedPatientData.fecha_nacimiento) updates.fecha_nacimiento = mergedPatientData.fecha_nacimiento;
    if (mergedPatientData.departamento) updates.departamento = mergedPatientData.departamento;
    if (mergedPatientData.telefono_contacto) updates.telefono_contacto = mergedPatientData.telefono_contacto;
    if (mergedPatientData.motivo_consulta) updates.motivo_consulta = mergedPatientData.motivo_consulta;
    if (mergedPatientData.medico_o_especialidad) updates.medico_o_especialidad = mergedPatientData.medico_o_especialidad;

    const missing = getMissingPatientFields(mergedPatientData);

    if (missing.length > 0) {
        updates.bot_stage = 'esperando_datos_nuevo';
        updates.bot_active = true;
        const nextStage = 'esperando_datos_nuevo';
        let reply = buildMissingFieldsPrompt(mergedPatientData.nombre_completo, missing, mergedPatientData);
        if (intentPromptPrefix) {
            reply = intentPromptPrefix + '\n\n' + reply;
        }
        return { nextStage, replyText: reply };
    } else {
        const resolvedName = mergedPatientData.nombre_completo || 'Paciente';
        updates.dni = mergedPatientData.dni;
        updates.nombre_completo = resolvedName;
        updates.obra_social = mergedPatientData.obra_social || 'Particular';
        updates.fecha_nacimiento = mergedPatientData.fecha_nacimiento;
        updates.departamento = mergedPatientData.departamento;
        updates.telefono_contacto = mergedPatientData.telefono_contacto || phone;
        updates.es_paciente_existente = false;
        const targetDocOrStudy = mergedPatientData.medico_o_especialidad || updates.medico_o_especialidad || cleanText;
        const estudioRequiereOrden = detectEstudioConOrden(targetDocOrStudy);
        const hasSentOrderPhoto = Boolean(conv?.order_analysis) || Boolean((conv?.ai_summary as any)?.medical_order);

        let nextStage = 'esperando_agente';
        if (estudioRequiereOrden && !hasSentOrderPhoto) {
            updates.status = 'bot';
            updates.bot_active = true;
            updates.bot_stage = 'esperando_orden_foto';
            nextStage = 'esperando_orden_foto';
            updates.motivo_consulta = `Alta de Paciente + Turno: ${resolvedName} - ${estudioRequiereOrden} [Aguardando pedido médico]`;
        } else {
            updates.status = 'sin_asignar';
            updates.bot_active = false;
            updates.bot_stage = 'esperando_agente';
            nextStage = 'esperando_agente';
        }

        // Pre-registrar en hospital_pacientes para que quede dado de alta en el padrón de SALUS
        if (updates.dni && updates.nombre_completo) {
            try {
                const supabaseClient = (globalThis as any)._lastSupabaseClient;
                if (supabaseClient) {
                    const cleanDni = String(updates.dni).trim();
                    const { data: existingPac } = await supabaseClient
                        .from('hospital_pacientes')
                        .select('id_paciente')
                        .eq('dni', cleanDni)
                        .maybeSingle();

                    if (existingPac?.id_paciente) {
                        await supabaseClient.from('hospital_pacientes').update({
                            nombre: updates.nombre_completo.toUpperCase().trim(),
                            coseguro: updates.obra_social || 'Particular',
                            fecha_nacimiento: updates.fecha_nacimiento || null,
                            centro: updates.departamento || 'San Juan',
                            telefono: phone,
                            manual: true,
                            updated_at: new Date().toISOString()
                        }).eq('id_paciente', existingPac.id_paciente);
                    } else {
                        await supabaseClient.from('hospital_pacientes').insert({
                            dni: cleanDni,
                            nombre: updates.nombre_completo.toUpperCase().trim(),
                            coseguro: updates.obra_social || 'Particular',
                            fecha_nacimiento: updates.fecha_nacimiento || null,
                            centro: updates.departamento || 'San Juan',
                            telefono: phone,
                            manual: true,
                            updated_at: new Date().toISOString()
                        });
                    }
                    console.log(`[triage-bot] ✅ Paciente nuevo pre-registrado en hospital_pacientes para SALUS: ${updates.nombre_completo} (DNI ${updates.dni})`);
                }
            } catch (err) {
                console.warn('[triage-bot] Advertencia pre-registrando en hospital_pacientes:', err);
            }
        }

        updates.ai_summary = {
            ...buildTriageSummary(updates, intent, doctorRecord, false, mergedPatientData.edad),
            estudio_requiere_orden: estudioRequiereOrden || null,
            esperando_pedido_medico: Boolean(estudioRequiereOrden && !hasSentOrderPhoto)
        };

        const ageNote = mergedPatientData.edad ? ` (${mergedPatientData.edad} años)` : '';
        const docNote = doctorDisplay ? `\n• *Profesional solicitado:* ${doctorDisplay}` : '';
        const orderNote = (intent === 'autorizacion' || (estudioRequiereOrden && !hasSentOrderPhoto))
            ? `\n\n📸 *Pedido médico:* Por favor envíanos la *foto clara o archivo PDF de tu orden médica / pedido médico* para poder coordinar tu estudio de *${estudioRequiereOrden || 'diagnóstico por imágenes'}*.` 
            : '';
        const reply = `¡Excelente *${resolvedName}*! ✅ Registramos todos tus datos para tu alta en Sanatorio Argentino:\n\n` +
            `📋 *Ficha de Admisión Digital:*\n` +
            `• *DNI:* ${updates.dni}\n` +
            `• *Paciente:* ${updates.nombre_completo}\n` +
            `• *Obra Social y Plan:* ${updates.obra_social}\n` +
            `• *Nacimiento:* ${updates.fecha_nacimiento || '—'}${ageNote}\n` +
            `• *Departamento:* ${updates.departamento}\n` +
            `• *Contacto:* ${updates.telefono_contacto}${docNote}${orderNote}\n\n` +
            (estudioRequiereOrden && !hasSentOrderPhoto
                ? `_(En cuanto nos envíes la foto del pedido médico, un asesor agendará tu turno con la prescripción correspondiente)._\n\n` +
                  `🔙 *Volver:* Escribí *"Menú"* o *"Atrás"*`
                : `Tu ficha ya fue cargada para el equipo de atención. Un agente tomará tu conversación a la brevedad para coordinar tu trámite.\n\n${getAgentHandoffNotice()}`);

        return { nextStage, replyText: reply };
    }
}

/**
 * Extrae variables estructuradas del paciente nuevo
 */
async function extractPatientVariables(text: string, fallbackDni: string | null) {
    const vars: Record<string, any> = {};

    // 1. Extracción heurística rápida por patrones
    const extractedDni = extractDniFromText(text);
    if (extractedDni && isValidArgentineDni(extractedDni)) {
        vars.dni = extractedDni;
    } else if (fallbackDni && isValidArgentineDni(fallbackDni)) {
        vars.dni = fallbackDni;
    }

    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) vars.email = emailMatch[0];

    const fnMatch = text.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/);
    if (fnMatch) {
        vars.fecha_nacimiento = fnMatch[0];
        const age = calculateAgeFromBirthDate(fnMatch[0]);
        if (age !== null) vars.edad = age;
    }

    // Extracción de edad explícita (ej: "tengo 32 años", "edad: 4 años", "28 años")
    const ageMatch = text.match(/\b(?:tengo|edad|de)\s*[:\s]*(\d{1,2})\s*(?:años)?\b/i) || text.match(/\b(\d{1,2})\s*años\b/i);
    if (ageMatch && !vars.edad) {
        const parsedAge = parseInt(ageMatch[1], 10);
        if (parsedAge >= 0 && parsedAge <= 115) {
            vars.edad = parsedAge;
        }
    }

    // Localidades de San Juan
    const dptos = [
        'Capital', 'Rawson', 'Rivadavia', 'Chimbas', 'Santa Lucía', 'Pocito',
        'Caucete', 'Albardón', 'Sarmiento', '25 de Mayo', 'San Martín',
        'Calingasta', 'Jáchal', 'Iglesia', 'Valle Fértil', 'Angaco', 'Ullum', 'Zonda', '9 de Julio'
    ];
    for (const d of dptos) {
        if (new RegExp(`\\b${d}\\b`, 'i').test(text)) {
            vars.departamento = d;
            break;
        }
    }

    // Obras Sociales frecuentes en San Juan y Plan
    const commonOs = [
        'OSP', 'Obra Social Provincia', 'OSDE', 'Swiss Medical', 'DAMSUP', 'PAMI',
        'Medifé', 'Galeno', 'Sancor Salud', 'OMINT', 'Jerárquicos', 'Particular',
        'Poder Judicial', 'Prevención Salud', 'Andar', 'Bramed', 'Osdepym', 'Unión Personal', 'Accord'
    ];
    for (const o of commonOs) {
        if (new RegExp(`\\b${o}\\b`, 'i').test(text)) {
            let matched = o === 'Obra Social Provincia' ? 'OSP' : o;
            // Buscar si en el texto especifica plan (ej: "plan 210", "plan tradicional", "plan plata")
            const planMatch = text.match(new RegExp(`${o}\\s+(?:plan\\s+)?([a-zA-Z0-9]+)`, 'i')) || text.match(/\bplan\s+([a-zA-Z0-9]+)\b/i);
            if (planMatch && planMatch[1] && !['medico', 'salud', 'de', 'para'].includes(planMatch[1].toLowerCase())) {
                matched += ` (Plan ${planMatch[1]})`;
            }
            vars.obra_social = matched;
            break;
        }
    }

    // Teléfono alternativo
    const phoneMatch = text.match(/(?:tel|cel|telefono|contacto|whatsapp)?[:\s]*(\+?54\s?9?\s?\d{2,4}[\s-]?\d{6,8}|\b264\d{7}\b)/i);
    if (phoneMatch) {
        vars.telefono_contacto = phoneMatch[1].replace(/\D/g, '');
    }

    // Detección heurística de gestión para tercero / familiar
    const thirdPartyRegex = /\b(?:para\s+mi\s+(hijo|hija|nene|nena|mama|mamá|papa|papá|esposo|esposa|marido|mujer|pareja|abuelo|abuela|hermano|hermana|familiar|sobrino|sobrina)|para\s+otra\s+persona|para\s+un\s+familiar|es\s+para\s+mi\s+(hijo|hija|mama|mamá|papa|papá)|es\s+para\s+otra\s+persona|a\s+nombre\s+de\s+mi\s+(hijo|hija|mama|mamá|papa|papá))\b/i;
    const thirdPartyMatch = text.match(thirdPartyRegex);
    if (thirdPartyMatch) {
        vars.es_gestion_tercero = true;
        vars.parentesco = (thirdPartyMatch[1] || thirdPartyMatch[2] || thirdPartyMatch[3] || 'familiar').toLowerCase();
    }

    // 2. Extracción enriquecida con OpenAI si está disponible
    const openAiKey = Deno.env.get('OPENAI_API_KEY');
    if (openAiKey) {
        try {
            const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openAiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    response_format: { type: 'json_object' },
                    messages: [
                        {
                            role: 'system',
                            content: `Eres el extractor clínico y administrativo del Contact Center de Sanatorio Argentino en San Juan, Argentina.
Extrae del mensaje del paciente un JSON con los siguientes campos:
- nombre_completo: Nombre y apellido del paciente a atender (string o null). No incluyas palabras como "Hola", "Doctor", "Turno", etc.
- dni: Número de Documento Nacional de Identidad del paciente (solo 7 u 8 dígitos numéricos válidos en Argentina, que comiencen del 1 al 9) o null.
  ¡REGLA ABSOLUTA DE SEGURIDAD CLÍNICA!: NUNCA extraigas una fecha de nacimiento (ej: "04/07/2002", "04-07-2002", "04072002") como DNI. Un DNI argentino NUNCA comienza con 0.
  Si el paciente envía únicamente su nombre, fecha de nacimiento y localidad (ej: "Ramiro Javier Gutiérrez\\n04/07/2002\\nDepartamento rawson"), el campo "dni" DEBE SER OBLIGATORIAMENTE null.
  Las fechas van EXCLUSIVAMENTE en el campo "fecha_nacimiento".
- es_gestion_tercero: boolean (true si el solicitante indica que el turno o trámite es para otra persona o familiar como hijo, mamá, etc., false si es para sí mismo).
- parentesco: relación del paciente a atender con el remitente (hijo/a, madre/padre, cónyuge, familiar, otro) o null.
- paciente_nombre: nombre del paciente a atender si es para otra persona o null.
- paciente_dni: DNI del paciente a atender si es para otra persona o null.
- fecha_nacimiento: Fecha de nacimiento en formato DD/MM/AAAA o null. Si el paciente escribe una fecha (ej: "04/07/2002"), colócala aquí en formato DD/MM/AAAA y NUNCA en dni.
- edad: Edad del paciente en años como número entero o null. Si menciona fecha de nacimiento, calcula también la edad actual.
- obra_social: Nombre de la obra social, prepaga y plan (ej: OSP Plan Tradicional, OSDE 210, Swiss Medical, Particular) o null.
- departamento: Localidad o departamento de San Juan donde reside (ej: Capital, Rawson, Rivadavia, Santa Lucía, Chimbas, Pocito, Caucete, etc.) o null.
- telefono_contacto: Número de teléfono alternativo o null.
- motivo_consulta: Breve síntesis de lo que necesita o null.
- medico_o_especialidad: Profesional o especialidad requerida o null.
Si un dato no fue aportado en el texto, indícalo como null.`
                        },
                        {
                            role: 'user',
                            content: text
                        }
                    ],
                    temperature: 0.1
                })
            });

            if (aiRes.ok) {
                const aiData = await aiRes.json();
                const parsed = JSON.parse(aiData.choices?.[0]?.message?.content || '{}');
                if (parsed.nombre_completo && !vars.nombre_completo) vars.nombre_completo = parsed.nombre_completo;
                if (parsed.dni && isValidArgentineDni(parsed.dni)) {
                    const fnDigits = (parsed.fecha_nacimiento || vars.fecha_nacimiento || '').replace(/\D/g, '');
                    // Descartar si el DNI retornado por la IA coincide exactamente con los números de la fecha de nacimiento
                    if (parsed.dni !== fnDigits) {
                        if (!vars.dni) vars.dni = parsed.dni;
                    }
                }
                if (parsed.es_gestion_tercero !== undefined) vars.es_gestion_tercero = Boolean(parsed.es_gestion_tercero);
                if (parsed.parentesco) vars.parentesco = parsed.parentesco;
                if (parsed.paciente_nombre) vars.paciente_nombre = parsed.paciente_nombre;
                if (parsed.paciente_dni) vars.paciente_dni = parsed.paciente_dni;
                if (parsed.obra_social && !vars.obra_social) vars.obra_social = parsed.obra_social;
                if (parsed.fecha_nacimiento && !vars.fecha_nacimiento) vars.fecha_nacimiento = parsed.fecha_nacimiento;
                if (parsed.edad !== undefined && parsed.edad !== null && !vars.edad) vars.edad = parsed.edad;
                if (parsed.email && !vars.email) vars.email = parsed.email;
                if (parsed.telefono_contacto && !vars.telefono_contacto) vars.telefono_contacto = parsed.telefono_contacto;
                if (parsed.departamento && !vars.departamento) vars.departamento = parsed.departamento;
                if (parsed.motivo_consulta && !vars.motivo_consulta) vars.motivo_consulta = parsed.motivo_consulta;
                if (parsed.medico_o_especialidad && !vars.medico_o_especialidad) vars.medico_o_especialidad = parsed.medico_o_especialidad;
            }
        } catch (aiErr) {
            console.warn('[triage-bot] Fallback IA:', aiErr);
        }
    }

    // Si tiene fecha de nacimiento y no tiene edad, calcularla
    if (vars.fecha_nacimiento && !vars.edad) {
        vars.edad = calculateAgeFromBirthDate(vars.fecha_nacimiento);
    }

    // Fallback de nombre si no se obtuvo
    if (!vars.nombre_completo) {
        const lines = text.split(/[\r\n,]+/).map(l => l.trim()).filter(Boolean);
        if (lines.length > 0 && lines[0].length < 40 && !/\d/.test(lines[0]) && !/^(hola|buenas|buen dia|turno|consulta)/i.test(lines[0])) {
            vars.nombre_completo = lines[0];
        }
    }

    return vars;
}

/**
 * Despacha la respuesta del bot hacia WhatsApp y la guarda en el historial
 */
async function sendBotWhatsAppReply(supabase: any, phone: string, text: string, lineId: string | null) {
    try {
        const targetLine = lineId || 'contact_center';
        const finalContent = text;

        // 1. Guardar mensaje saliente en whatsapp_messages
        await supabase
            .from('whatsapp_messages')
            .insert({
                phone,
                direction: 'outgoing',
                content: finalContent,
                media_type: 'text',
                sender_name: 'Bot Sanatorio',
                is_read: true,
                line_id: targetLine,
                raw_payload: {
                    source: 'bot_triage',
                    bot: true
                }
            });

        // 2. Invocar Edge Function send-whatsapp para despachar a BuilderBot
        const sendUrl = `${SUPABASE_URL}/functions/v1/send-whatsapp`;
        const res = await fetch(sendUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
            },
            body: JSON.stringify({
                number: phone,
                content: finalContent,
                lineId: targetLine
            })
        });

        console.log(`[triage-bot] ✅ Mensaje despachado a ${phone} | status: ${res.status}`);
    } catch (err: any) {
        console.error('[triage-bot] Error enviando respuesta WhatsApp:', err?.message || err);
    }
}

