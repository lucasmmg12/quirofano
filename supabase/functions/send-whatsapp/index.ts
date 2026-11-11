// Supabase Edge Function: send-whatsapp
// Proxy server-side para BuilderBot API (evita CORS)
// Soporta múltiples líneas WhatsApp: lee credenciales desde whatsapp_lines
// Fallback a app_config para retrocompatibilidad

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Cache para no leer la DB en cada request (por línea)
const cachedConfigs: Record<string, { apiKey: string; projectId: string; cachedAt: number }> = {};
const CACHE_TTL = 60 * 1000; // 1 minuto

async function getBuilderBotConfig(lineId?: string) {
    const cacheKey = lineId || '__legacy__';

    // Si tenemos cache válido, usarlo
    if (cachedConfigs[cacheKey] && Date.now() - cachedConfigs[cacheKey].cachedAt < CACHE_TTL) {
        return cachedConfigs[cacheKey];
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Intentar leer de whatsapp_lines si hay lineId
    if (lineId) {
        const { data: line, error: lineError } = await supabase
            .from('whatsapp_lines')
            .select('api_key, project_id')
            .eq('id', lineId)
            .eq('is_active', true)
            .single();

        if (!lineError && line?.api_key && line?.project_id
            && line.api_key !== 'configurar-desde-panel'
            && line.project_id !== 'configurar-desde-panel') {
            cachedConfigs[cacheKey] = {
                apiKey: line.api_key,
                projectId: line.project_id,
                cachedAt: Date.now(),
            };
            return cachedConfigs[cacheKey];
        }
    }

    // Fallback: leer de app_config (retrocompatibilidad)
    const { data, error } = await supabase
        .from('app_config')
        .select('key, value')
        .in('key', ['builderbot_api_key', 'builderbot_project_id']);

    if (error) throw new Error('Error leyendo config: ' + error.message);

    const configMap: Record<string, string> = {};
    (data || []).forEach((row: { key: string; value: string }) => {
        configMap[row.key] = row.value;
    });

    const apiKey = configMap['builderbot_api_key'];
    const projectId = configMap['builderbot_project_id'];

    if (!apiKey || !projectId) {
        throw new Error('Faltan credenciales de BuilderBot');
    }

    cachedConfigs[cacheKey] = { apiKey, projectId, cachedAt: Date.now() };
    return cachedConfigs[cacheKey];
}

Deno.serve(async (req) => {
    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token, x-device-token',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };

    // Helper para formatear teléfono para WhatsApp (Argentina 549...)
    // Limpia ceros iniciales (ej: 02645438114 -> 2645438114 -> 5492645438114) y 15 intermedio
    function formatPhoneForWhatsApp(rawPhone: string): string {
        let clean = String(rawPhone || '').replace(/\D/g, '');
        if (!clean) return '';

        // Quitar prefijo internacional 549 o 54 si viene al inicio para normalizar los 10 dígitos locales
        if (clean.startsWith('549') && clean.length >= 13) {
            clean = clean.slice(3);
        } else if (clean.startsWith('54') && clean.length >= 12) {
            clean = clean.slice(2);
        }

        // Eliminar siempre el primer cero (o ceros iniciales, ej: 02645438114 -> 2645438114)
        clean = clean.replace(/^0+/, '');

        // Si ingresó solo "15xxxxxxx" (9 dígitos, sin característica de San Juan)
        if (clean.startsWith('15') && clean.length === 9) {
            clean = '264' + clean.substring(2);
        }

        // Si ingresó característica + 15 + número (ej: 264155438114 -> 12 dígitos)
        if (clean.length > 10 && clean.includes('15')) {
            const idx = clean.indexOf('15');
            if (idx >= 2 && idx <= 4) {
                clean = clean.slice(0, idx) + clean.slice(idx + 2);
            }
        }

        if (clean.length > 10) {
            clean = clean.slice(0, 10);
        }

        if (clean.length === 10 && !clean.startsWith('54')) {
            clean = '549' + clean;
        }
        return clean;
    }

    async function sendDirectBuilderBotMessage(number: string, content: string): Promise<boolean> {
        const tryLine = async (targetLine?: string) => {
            const cfg = await getBuilderBotConfig(targetLine);
            const url = `https://app.builderbot.cloud/api/v2/${cfg.projectId}/messages`;
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-builderbot': cfg.apiKey,
                },
                body: JSON.stringify({
                    messages: { content },
                    number,
                    checkIfExists: false,
                }),
            });
            return res.ok;
        };
        try {
            const ok = await tryLine(undefined);
            if (ok) return true;
        } catch (e) {
            console.warn('[send-whatsapp] Primary line failed for OTP, trying line_c:', e);
        }
        try {
            return await tryLine('line_c');
        } catch (e2) {
            console.error('[send-whatsapp] Fallback line_c failed for OTP:', e2);
            return false;
        }
    }

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        console.log(`[send-whatsapp] === INCOMING REQUEST ===`);
        console.log(`[send-whatsapp] Full body:`, JSON.stringify(body));
        console.log(`[send-whatsapp] body.to:`, body.to, `| body.action:`, body.action, `| body.lineId:`, body.lineId);
        const { action, lineId } = body;

        // ========================================
        // ACTION: send_login_otp — Genera y envía OTP de Login 100% en Backend (nunca expone code al navegador)
        // ========================================
        if (action === 'send_login_otp') {
            const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
            const userId = body.userId;
            const telefono = body.telefono ? String(body.telefono).trim() : null;

            if (!userId) {
                return new Response(
                    JSON.stringify({ success: false, error: 'userId es requerido' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            const { data: otpData, error: otpErr } = await supabaseAdmin.rpc('generate_user_otp', {
                p_user_id: userId,
                p_telefono: telefono,
            });

            if (otpErr || !otpData?.success) {
                return new Response(
                    JSON.stringify({
                        success: false,
                        error: otpData?.error || otpErr?.message || 'No se pudo generar el código OTP',
                    }),
                    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            const rawTel = otpData.telefono_whatsapp || otpData.telefono || telefono || '';
            const targetPhone = formatPhoneForWhatsApp(rawTel);
            if (!targetPhone || targetPhone.length < 10) {
                return new Response(
                    JSON.stringify({ success: false, error: 'Número de WhatsApp inválido.' }),
                    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            const msg = `🔐 *Sanatorio Argentino — Sistema ADM-QUI*\n\nHola *${otpData.nombre || otpData.usuario}*, tu código de verificación de seguridad (2FA) es:\n\n👉 *${otpData.code}*\n\n⏱️ _Este código expira en 10 minutos. No lo compartas con nadie._`;
            const sent = await sendDirectBuilderBotMessage(targetPhone, msg);

            if (!sent) {
                return new Response(
                    JSON.stringify({ success: false, error: 'Error al enviar el mensaje por WhatsApp.' }),
                    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            const cleanDigits = String(rawTel).replace(/\D/g, '');
            const maskedWhatsapp = cleanDigits.length >= 4 ? '***' + cleanDigits.slice(-4) : cleanDigits;

            return new Response(
                JSON.stringify({
                    success: true,
                    masked_whatsapp: maskedWhatsapp,
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // ========================================
        // ACTION: send_recovery_otp — Genera y envía OTP de Recuperación 100% en Backend (nunca expone code al navegador)
        // ========================================
        if (action === 'send_recovery_otp') {
            const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
            const userId = body.userId;
            const channel = body.channel === 'email' ? 'email' : 'whatsapp';

            if (!userId) {
                return new Response(
                    JSON.stringify({ success: false, error: 'userId es requerido' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            const { data: otpData, error: otpErr } = await supabaseAdmin.rpc('generate_recovery_otp', {
                p_user_id: userId,
                p_channel: channel,
            });

            if (otpErr || !otpData?.success) {
                return new Response(
                    JSON.stringify({
                        success: false,
                        error: otpData?.error || otpErr?.message || 'No se pudo generar el código de recuperación',
                    }),
                    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            const rawRecoveryPhone = otpData.telefono_whatsapp || otpData.whatsapp || '';
            const cleanDigits = String(rawRecoveryPhone).replace(/\D/g, '');
            const maskedWhatsapp = otpData.masked_whatsapp || (cleanDigits.length >= 4 ? '***' + cleanDigits.slice(-4) : cleanDigits);
            const maskedEmail = otpData.masked_email || '';

            if (channel === 'whatsapp') {
                const targetPhone = formatPhoneForWhatsApp(rawRecoveryPhone);
                const msg = `🔐 *Sanatorio Argentino — Recuperación de Contraseña*\n\nHola *${otpData.nombre || otpData.usuario}*, recibimos una solicitud para restablecer tu contraseña en el Sistema ADM-QUI.\n\nTu código de seguridad es:\n👉 *${otpData.code}*\n\n⏱️ _Expira en 10 minutos. Si no solicitaste este cambio, ignora este mensaje._`;
                const sent = await sendDirectBuilderBotMessage(targetPhone, msg);
                if (!sent) {
                    return new Response(
                        JSON.stringify({ success: false, error: 'Error al enviar el código por WhatsApp.' }),
                        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }
                return new Response(
                    JSON.stringify({
                        success: true,
                        channel: 'whatsapp',
                        masked_whatsapp: maskedWhatsapp,
                    }),
                    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            if (channel === 'email') {
                let emailSent = false;
                try {
                    const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/send-security-email`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                        },
                        body: JSON.stringify({
                            to: otpData.email,
                            nombre: otpData.nombre || otpData.usuario,
                            usuario: otpData.usuario,
                            code: otpData.code,
                            type: 'password_recovery',
                        }),
                    });
                    const emailData = await emailRes.json().catch(() => ({}));
                    if (emailRes.ok && emailData?.success) {
                        emailSent = true;
                    }
                } catch (e) {
                    console.warn('[send-whatsapp] send-security-email failed:', e);
                }

                if (emailSent) {
                    return new Response(
                        JSON.stringify({
                            success: true,
                            channel: 'email',
                            masked_email: maskedEmail,
                        }),
                        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                // Fallback automático a WhatsApp si tiene teléfono registrado
                if (rawRecoveryPhone) {
                    const targetPhone = formatPhoneForWhatsApp(rawRecoveryPhone);
                    const msg = `🔐 *Sanatorio Argentino — Recuperación de Contraseña*\n\nHola *${otpData.nombre || otpData.usuario}*, el envío por correo electrónico demoró y te enviamos tu código de recuperación por WhatsApp:\n\n👉 *${otpData.code}*\n\n⏱️ _Expira en 10 minutos._`;
                    const sent = await sendDirectBuilderBotMessage(targetPhone, msg);
                    if (sent) {
                        return new Response(
                            JSON.stringify({
                                success: true,
                                channel: 'whatsapp_fallback',
                                masked_whatsapp: maskedWhatsapp,
                                fallback_message: 'El servidor de correo no está disponible en este momento. Te enviamos el código automáticamente a tu WhatsApp registrado.',
                            }),
                            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                        );
                    }
                }

                return new Response(
                    JSON.stringify({
                        success: false,
                        error: 'No se pudo enviar el correo electrónico de recuperación. Por favor elige la opción de WhatsApp.',
                    }),
                    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
        }

        // ========================================
        // ACTION: notify_cita_online_reservation — Envía Plantilla Oficial Meta desde Contact Center al confirmar reserva en CitaOnline
        // ========================================
        if (action === 'notify_cita_online_reservation') {
            const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
            let rawPhone = String(body.phone || body.PatientPhone || '').trim();
            const dni = String(body.dni || body.NIF || '').replace(/\D/g, '');
            const nombre = String(body.nombre || body.PatientName || '').trim();
            const apellido = String(body.apellido || body.PatientSurname || '').trim();
            const segundoApellido = String(body.segundoApellido || body.PatientSecondSurname || '').trim();
            const email = String(body.email || body.PatientEMail || '').trim();
            const fechaHora = String(body.fechaHora || body.Date || body.Hour || '').trim();
            const profesional = String(body.profesional || '').trim();
            const especialidad = String(body.especialidad || '').trim();
            const obraSocial = String(body.obraSocial || '').trim();
            const visitId = body.visitId || body.VisitId || null;

            // Si el paciente reservó logueado y no vino teléfono en el form, buscar en padrón por DNI
            if (!rawPhone && dni) {
                const { data: patRow } = await supabaseAdmin
                    .from('patients')
                    .select('telefono')
                    .eq('dni', dni)
                    .maybeSingle();
                if (patRow?.telefono) rawPhone = String(patRow.telefono).trim();
            }

            const targetPhone = formatPhoneForWhatsApp(rawPhone);
            if (!targetPhone || targetPhone.length < 12) {
                return new Response(
                    JSON.stringify({ success: false, error: 'Número de teléfono vacío o inválido para WhatsApp', rawPhone }),
                    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            const fullPatientName = [nombre, apellido, segundoApellido].filter(Boolean).join(' ').trim() || 'Paciente';
            const cleanFirstName = (nombre || fullPatientName.split(' ')[0] || 'Paciente')
                .replace(/[\r\n\t]+/g, ' ')
                .trim();

            const turnoInfoParts: string[] = [];
            if (fechaHora) turnoInfoParts.push(`el ${fechaHora}`);
            if (profesional) {
                const profClean = profesional.replace(/\s*\([^)]*\)\s*/g, '').trim();
                turnoInfoParts.push(`con ${profClean}`);
            }
            if (especialidad) {
                const espClean = especialidad.replace(/\s*\([^)]*\)\s*/g, '').trim();
                if (espClean) turnoInfoParts.push(`(${espClean})`);
            }
            const turnoSummary = turnoInfoParts.length > 0
                ? turnoInfoParts.join(' ')
                : 'en nuestro portal de Turnos Online';

            // Parámetro 2 para la plantilla oficial aprobada 'ojonoscobran' (es_AR) de la línea contact_center
            // Meta no permite saltos de línea ni tabs dentro de los parámetros de variables
            const param2Confirmacion = `el Contact Center — ✅ Confirmamos que tu turno ${turnoSummary} ya quedó reservado con éxito. IMPORTANTE: Si ya tenés tu turno asignado, por favor NO saques más turnos adicionales en la web para liberar agenda a otros pacientes`
                .replace(/[\r\n\t]+/g, ' ')
                .replace(/\s{2,}/g, ' ')
                .trim();

            const targetLine = 'contact_center';
            const config = await getBuilderBotConfig(targetLine);
            const useFreeText = Boolean(body.useFreeText);

            if (useFreeText) {
                const directUrl = `https://app.builderbot.cloud/api/v2/${config.projectId}/messages`;
                const directTextMessage =
                    `🏥 *Sanatorio Argentino — Confirmación de Turno Online*\n\n` +
                    `¡Hola *${cleanFirstName}*! ✅ Te confirmamos que tu turno *${turnoSummary}* ya quedó reservado con éxito en nuestro sistema.\n\n` +
                    `⚠️ *IMPORTANTE:* Si ya tenés tu turno asignado, por favor *NO saques más turnos adicionales* en la página web para el mismo profesional o especialidad, así evitamos turnos duplicados y liberamos agenda para otros pacientes.\n\n` +
                    `📌 _Si necesitás consultar, reprogramar o cancelar tu turno, podés escribirnos directamente por este medio._`;

                console.log(`[send-whatsapp] notify_cita_online_reservation (FREE TEXT 24h) → ${targetPhone} | Paciente: ${fullPatientName} | Turno: ${turnoSummary}`);

                const directRes = await fetch(directUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-builderbot': config.apiKey,
                    },
                    body: JSON.stringify({
                        messages: { content: directTextMessage },
                        number: targetPhone,
                        checkIfExists: false,
                    }),
                });

                const rawDirect = await directRes.text();
                let directData;
                try {
                    directData = JSON.parse(rawDirect);
                } catch {
                    directData = { rawResponse: rawDirect };
                }

                try {
                    await supabaseAdmin.from('whatsapp_messages').insert({
                        phone: targetPhone,
                        direction: 'outgoing',
                        content: directTextMessage,
                        media_type: 'text',
                        sender_name: 'Cita Online Web (Auto)',
                        is_read: true,
                        line_id: targetLine,
                        raw_payload: {
                            source: 'cita_online_web',
                            line: targetLine,
                            type: 'free_text_24h',
                            visitId,
                            dni: dni || null,
                            paciente: fullPatientName,
                            email: email || null,
                            fechaHora: fechaHora || null,
                            profesional: profesional || null,
                            especialidad: especialidad || null,
                            obraSocial: obraSocial || null,
                            builderbotResponse: directData
                        }
                    });
                } catch (dbErr) {
                    console.warn('[send-whatsapp] No se pudo insertar en whatsapp_messages:', dbErr);
                }

                return new Response(
                    JSON.stringify({
                        success: directRes.ok,
                        mode: 'free_text_24h',
                        phone: targetPhone,
                        visitId,
                        data: directData
                    }),
                    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            const url = `https://app.builderbot.cloud/api/v2/${config.projectId}/whatsapp-template`;
            const requestedTemplate = String(body.templateName || 'confirmacion_turno_web').trim();
            const requestedLang = String(body.languageCode || 'es_AR').trim();

            const profCleanForVar = (profesional || 'Profesional asignado').replace(/\s*\([^)]*\)\s*/g, '').trim();
            const espCleanForVar = (especialidad || '').replace(/\s*\([^)]*\)\s*/g, '').trim();
            const profAndEspVar = espCleanForVar ? `${profCleanForVar} (${espCleanForVar})` : profCleanForVar;
            const fechaHoraVar = (fechaHora || 'Fecha y hora seleccionadas').replace(/[\r\n\t]+/g, ' ').trim();

            // Intentar primero con la plantilla específica 'confirmacion_turno_web' (3 variables: {{1}} Paciente, {{2}} Profesional/Especialidad, {{3}} Fecha y Hora)
            // Si aún no está aprobada en Meta, hacer fallback automático e inmediato a 'ojonoscobran'
            let usedTemplate = requestedTemplate;
            let response: Response;
            let data: any;

            const buildPayloadForTemplate = (tplName: string) => {
                if (tplName === 'confirmacion_turno_web') {
                    return {
                        to: targetPhone,
                        templateName: 'confirmacion_turno_web',
                        languageCode: requestedLang,
                        components: [
                            {
                                type: 'body',
                                parameters: [
                                    { type: 'text', text: cleanFirstName },
                                    { type: 'text', text: profAndEspVar },
                                    { type: 'text', text: fechaHoraVar }
                                ]
                            }
                        ]
                    };
                }
                return {
                    to: targetPhone,
                    templateName: tplName,
                    languageCode: requestedLang,
                    components: [
                        {
                            type: 'body',
                            parameters: [
                                { type: 'text', text: cleanFirstName },
                                { type: 'text', text: param2Confirmacion }
                            ]
                        }
                    ]
                };
            };

            console.log(`[send-whatsapp] notify_cita_online_reservation → ${targetPhone} | Paciente: ${fullPatientName} | Turno: ${turnoSummary} | Plantilla: ${usedTemplate}`);

            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-builderbot': config.apiKey,
                },
                body: JSON.stringify(buildPayloadForTemplate(usedTemplate)),
            });

            const rawText = await response.text();
            try {
                data = JSON.parse(rawText);
            } catch {
                data = { rawResponse: rawText };
            }

            // Fallback automático a 'ojonoscobran' si 'confirmacion_turno_web' aún no está activa/aprobada en Meta
            if ((!response.ok || data?.success === false || data?.error) && usedTemplate === 'confirmacion_turno_web') {
                console.warn(`[send-whatsapp] Plantilla confirmacion_turno_web aún no disponible (${rawText}). Usando fallback 'ojonoscobran'...`);
                usedTemplate = 'ojonoscobran';
                response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-builderbot': config.apiKey,
                    },
                    body: JSON.stringify(buildPayloadForTemplate('ojonoscobran')),
                });
                const rawFallback = await response.text();
                try {
                    data = JSON.parse(rawFallback);
                } catch {
                    data = { rawResponse: rawFallback };
                }
            }

            const resolvedDisplayMessage = usedTemplate === 'confirmacion_turno_web'
                ? `📋 [Plantilla Meta: confirmacion_turno_web] ¡Hola ${cleanFirstName}! ✅ Te confirmamos que tu turno en Sanatorio Argentino con ${profAndEspVar} para el día ${fechaHoraVar} ya quedó reservado con éxito. ⚠️ IMPORTANTE: Si ya tenés tu turno asignado, por favor NO saques más turnos adicionales en la web.`
                : `📋 [Plantilla Meta CitaOnline: ${usedTemplate}] Hola ${cleanFirstName} soy ${param2Confirmacion} de *Sanatorio Argentino* , gracias por contactarnos. Te escribo por tu consulta realizada.`;
            const nowIso = new Date().toISOString();

            // Registrar en whatsapp_messages para trazabilidad en la consola del Contact Center
            try {
                await supabaseAdmin.from('whatsapp_messages').insert({
                    phone: targetPhone,
                    direction: 'outgoing',
                    content: resolvedDisplayMessage,
                    media_type: 'text',
                    sender_name: 'Cita Online Web (Auto)',
                    is_read: true,
                    line_id: targetLine,
                    raw_payload: {
                        source: 'cita_online_web',
                        line: targetLine,
                        type: 'meta_template',
                        templateName: usedTemplate,
                        visitId,
                        dni: dni || null,
                        paciente: fullPatientName,
                        email: email || null,
                        fechaHora: fechaHora || null,
                        profesional: profesional || null,
                        especialidad: especialidad || null,
                        obraSocial: obraSocial || null,
                        metaResponse: data
                    }
                });
            } catch (dbErr) {
                console.warn('[send-whatsapp] No se pudo insertar en whatsapp_messages:', dbErr);
            }

            return new Response(
                JSON.stringify({
                    success: response.ok && data?.success !== false,
                    phone: targetPhone,
                    templateName: usedTemplate,
                    visitId,
                    data
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // ========================================
        // ACTION: list_templates — Listar plantillas Meta
        // ========================================
        if (action === 'list_templates') {
            const config = await getBuilderBotConfig(lineId);
            const url = `https://app.builderbot.cloud/api/v2/${config.projectId}/whatsapp-template?limit=50`;
            
            console.log(`[send-whatsapp] list_templates | Línea: ${lineId}`);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'x-api-builderbot': config.apiKey },
            });
            
            const data = await response.json();
            
            // Check for API errors (BuilderBot returns {success: false, error: "..."} on config issues)
            if (!response.ok || data?.success === false) {
                const errorMsg = data?.error || `HTTP ${response.status}`;
                console.error(`[send-whatsapp] list_templates ERROR: ${errorMsg}`);
                return new Response(
                    JSON.stringify({ success: false, error: errorMsg, templates: [] }),
                    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
            
            const templates = Array.isArray(data) ? data : data?.templates || data?.data || [];
            
            return new Response(
                JSON.stringify({ success: true, templates }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // ========================================
        // ACTION: send_template — Enviar plantilla Meta
        // ========================================
        if (action === 'send_template') {
            // Force string coercion to prevent Zod validation issues in BuilderBot
            const to = String(body.to || body.number || '').trim();
            const templateName = String(body.templateName || '').trim();
            const languageCode = String(body.languageCode || 'es').trim();
            const components = body.components || body.templateVariables ? (
                body.components || [
                    {
                        type: 'body',
                        parameters: (body.templateVariables || []).map(text => ({ type: 'text', text: String(text) }))
                    }
                ]
            ) : undefined;
            
            console.log(`[send-whatsapp] send_template parsed | to: "${to}" | template: "${templateName}" | lang: "${languageCode}"`);
            
            if (!to || !templateName) {
                return new Response(
                    JSON.stringify({ error: 'to and templateName are required' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
            
            const config = await getBuilderBotConfig(lineId);
            const url = `https://app.builderbot.cloud/api/v2/${config.projectId}/whatsapp-template`;
            
            const templateBody: Record<string, unknown> = {
                to,
                templateName,
                languageCode: languageCode || 'es',
            };
            if (components) templateBody.components = components;
            
            console.log(`[send-whatsapp] send_template | Línea: ${lineId} | Template: ${templateName} | Lang: ${languageCode || 'es'} → ${to}`);
            console.log(`[send-whatsapp] Request URL: ${url}`);
            console.log(`[send-whatsapp] Request body:`, JSON.stringify(templateBody));
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-builderbot': config.apiKey,
                },
                body: JSON.stringify(templateBody),
            });
            
            const rawText = await response.text();
            console.log(`[send-whatsapp] Response status: ${response.status}`);
            console.log(`[send-whatsapp] Response body: ${rawText}`);
            
            let data;
            try {
                data = JSON.parse(rawText);
            } catch {
                data = { rawResponse: rawText };
            }
            
            if (!response.ok) {
                console.error('[send-whatsapp] Template send FAILED:', response.status, data);
                const errStr = String(data?.message || data?.error || rawText || '');

                // Fallback automático cuando Meta/BuilderBot rechaza una plantilla por tener botón FLOW (#131009 Components sub_type invalid)
                if (
                    (errStr.includes('131009') || errStr.toLowerCase().includes('sub_type invalid')) &&
                    (lineId === 'contact_center' || templateName === 'turnos_duplicados')
                ) {
                    console.warn(`[send-whatsapp] Detectado error #131009 (botón FLOW en ${templateName}). Aplicando fallback automático con plantilla aprobada 'ojonoscobran' (es_AR)...`);
                    const bodyComp = Array.isArray(components)
                        ? components.find((c: { type?: string }) => String(c?.type || '').toLowerCase() === 'body')
                        : null;
                    const bodyParams: string[] = Array.isArray(bodyComp?.parameters)
                        ? bodyComp.parameters.map((p: { text?: string }) => String(p?.text || '').trim())
                        : [];

                    const pacienteNombre = bodyParams[0] || 'Paciente';
                    const fechaTexto = bodyParams[1] || 'los próximos días';
                    const detalleTurnos = bodyParams[2] || 'más de un horario reservado';
                    const rawAgentFirst = body.agentName
                        ? String(body.agentName).trim().split(/\s+/)[0]
                        : '';
                    const agentLabel = rawAgentFirst
                        ? `${rawAgentFirst} del Contact Center`
                        : 'el equipo de Contact Center';

                    const fallbackParam2 = `${agentLabel} (registramos más de un turno agendado para el ${fechaTexto}: ${detalleTurnos}; por favor respondé a este mensaje confirmando a cuál vas a asistir para liberar el otro lugar)`
                        .replace(/[\r\n\t]+/g, ' ')
                        .replace(/\s{2,}/g, ' ')
                        .trim();

                    const fallbackPayload = {
                        to,
                        templateName: 'ojonoscobran',
                        languageCode: 'es_AR',
                        components: [
                            {
                                type: 'body',
                                parameters: [
                                    { type: 'text', text: pacienteNombre },
                                    { type: 'text', text: fallbackParam2 }
                                ]
                            }
                        ]
                    };

                    const fbRes = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-builderbot': config.apiKey,
                        },
                        body: JSON.stringify(fallbackPayload),
                    });

                    const fbRaw = await fbRes.text();
                    let fbData;
                    try {
                        fbData = JSON.parse(fbRaw);
                    } catch {
                        fbData = { rawResponse: fbRaw };
                    }

                    if (fbRes.ok && fbData?.success !== false) {
                        console.log(`[send-whatsapp] ✅ Fallback 'ojonoscobran' enviado con éxito a ${to}`);
                        return new Response(
                            JSON.stringify({
                                success: true,
                                data: fbData,
                                fallbackUsed: 'ojonoscobran',
                                originalTemplate: templateName
                            }),
                            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                        );
                    }
                }

                return new Response(
                    JSON.stringify({ 
                        success: false, 
                        error: data?.message || data?.error || data?.rawResponse || `HTTP ${response.status}`,
                        details: data,
                        sentPayload: templateBody,
                    }),
                    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
            
            return new Response(
                JSON.stringify({ success: true, data }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // ========================================
        // DEFAULT: Enviar mensaje de texto (lógica existente)
        // ========================================
        const { content, number, mediaUrl } = body;

        if (!content || !number) {
            return new Response(
                JSON.stringify({ error: 'content and number are required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Leer credenciales según la línea
        const config = await getBuilderBotConfig(lineId);
        const BUILDERBOT_URL = `https://app.builderbot.cloud/api/v2/${config.projectId}/messages`;

        const msgBody = {
            messages: {
                content,
                ...(mediaUrl && { mediaUrl }),
            },
            number,
            checkIfExists: false,
        };

        console.log(`[send-whatsapp] Línea: ${lineId || 'legacy'} | Enviando a ${number}:`, content.substring(0, 50));

        const response = await fetch(BUILDERBOT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-builderbot': config.apiKey,
            },
            body: JSON.stringify(msgBody),
        });

        const data = await response.json();

        return new Response(
            JSON.stringify({ success: true, data, lineId: lineId || 'legacy' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('[send-whatsapp] Error:', error.message);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});

