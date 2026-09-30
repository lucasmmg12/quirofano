/**
 * Gestor de Avisos Automáticos para Cola de Espera de Contact Center
 * =================================================================
 * Reglas de Negocio:
 * 1. FUERA DE HORARIO LABORAL (Prioridad Máxima):
 *    - Si un paciente escribe o espera fuera del horario de atención,
 *      se le informa que no estamos trabajando y cuándo retomamos la atención habitual.
 *    - Horarios: Lunes a Viernes 7:30 a 21:00 hs | Sábados 8:00 a 12:00 hs | Domingos y Feriados cerrado.
 * 2. DEMORAS EN COLA CADA 20 MINUTOS (Horario Laboral):
 *    - Si un paciente espera más de 20 minutos sin respuesta humana,
 *      se le envía un aviso automático cada 20 minutos informando demoras por alta demanda,
 *      nuestros horarios de atención y la opción de volver al Menú virtual.
 */

export function getContactCenterScheduleInfo(now = new Date()) {
    // San Juan, Argentina (UTC-3)
    const timeStr = now.toLocaleString('en-US', { timeZone: 'America/Argentina/San_Juan' });
    const local = new Date(timeStr);
    const day = local.getDay(); // 0 = Dom, 1 = Lun, ..., 6 = Sab
    const hour = local.getHours();
    const min = local.getMinutes();
    const currentMin = hour * 60 + min;

    let isOpen = false;
    let nextOpeningText = 'el próximo día hábil a partir de las 7:30 hs';

    if (day >= 1 && day <= 5) {
        // Lunes a Viernes: 7:30 a 21:00 hs (450 a 1260 minutos)
        if (currentMin >= 450 && currentMin < 1260) {
            isOpen = true;
        } else if (currentMin < 450) {
            nextOpeningText = 'hoy a partir de las 7:30 hs';
        } else {
            // Pasadas las 21:00 hs
            if (day === 5) {
                // Viernes noche -> Sábado 8:00 hs
                nextOpeningText = 'mañana sábado a partir de las 8:00 hs';
            } else {
                nextOpeningText = 'mañana a partir de las 7:30 hs';
            }
        }
    } else if (day === 6) {
        // Sábado: 8:00 a 12:00 hs (480 a 720 minutos)
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

export function getAfterHoursMessage(nextOpeningText) {
    return `¡Hola! 🏥 Te informamos que en este momento nuestro equipo de atención se encuentra *fuera del horario laboral*.\n\n` +
        `⏰ *Nuestros horarios de atención son:*\n` +
        `• *Lunes a Viernes:* 7:30 a 21:00 hs\n` +
        `• *Sábados:* 8:00 a 12:00 hs\n` +
        `_(Domingos y Feriados cerrado)_\n\n` +
        `Tu mensaje quedó registrado y un asesor te responderá *${nextOpeningText}* en nuestro horario habitual.\n\n` +
        `🚨 *Guardia Médica 24 hs:* Si presentás una urgencia, recordá que nuestra Guardia en Sede Central (San Luis 432 Oeste) atiende las *24 horas*.`;
}

export function getDelayWaitNoticeMessage() {
    return `¡Hola! 🏥 Estamos con algunas demoras en la atención debido a la alta demanda. Te pedimos disculpas por la espera.\n\n` +
        `En breve un agente estará respondiendo tu consulta por orden de llegada.\n\n` +
        `⏰ *Horarios de atención:* Lunes a Viernes de 7:30 a 21:00 hs y Sábados de 8:00 a 12:00 hs.\n\n` +
        `💡 _Si deseás volver a consultar opciones con el menú virtual, podés escribir *"Menú"* en cualquier momento._`;
}

function isHumanAgentMessage(m) {
    if (!m) return false;
    if (m.direction === 'incoming' || m.sender === 'patient') return false;
    if (m.direction === 'note' || m.isNote) return false;
    const sender = String(m.sender_name || m.senderName || '').toLowerCase().trim();
    if (sender === 'bot sanatorio' || sender === 'bot' || sender.startsWith('bot ')) return false;
    if (m.raw_payload?.bot === true || m.rawPayload?.bot === true || m.raw_payload?.is_bot === true) return false;
    if (m.sender === 'system' || m.sender === 'bot') return false;
    return m.direction === 'outgoing' || m.sender === 'agent';
}

async function sendWhatsAppNotification({ supabaseClient, supabaseUrl, serviceKey, phone, text, source }) {
    try {
        const lineId = 'contact_center';

        // 1. Guardar mensaje saliente en whatsapp_messages para reflejo inmediato en chat
        await supabaseClient
            .from('whatsapp_messages')
            .insert({
                phone,
                direction: 'outgoing',
                content: text,
                media_type: 'text',
                sender_name: 'Bot Sanatorio',
                is_read: true,
                line_id: lineId,
                raw_payload: {
                    source: source || 'queue_worker',
                    bot: true
                }
            });

        // 2. Despachar a WhatsApp real vía Edge Function
        const sendUrl = `${supabaseUrl}/functions/v1/send-whatsapp`;
        const res = await fetch(sendUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceKey}`
            },
            body: JSON.stringify({
                number: phone,
                content: text,
                lineId
            })
        });

        console.log(`[QueueAutoReplies] 📤 Mensaje enviado a ${phone} (${source}) | Status HTTP: ${res.status}`);
        return true;
    } catch (err) {
        console.error(`[QueueAutoReplies] ❌ Error enviando WhatsApp a ${phone}:`, err.message);
        return false;
    }
}

/**
 * Escanea la cola de Contact Center y despacha avisos de fuera de horario o de demora cada 20 min
 */
export async function processQueueWaitingAlerts({ supabaseClient, supabaseUrl, serviceKey }) {
    try {
        const schedule = getContactCenterScheduleInfo();
        const nowMs = Date.now();

        // 1. Obtener conversaciones activas que puedan estar esperando atención
        const { data: convs, error } = await supabaseClient
            .from('contact_center_conversations')
            .select('id, phone, status, bot_active, bot_stage, assigned_agent_id, assigned_agent_name, last_message_at, ai_summary, updated_at')
            .in('status', ['sin_asignar', 'abierto', 'bot'])
            .order('last_message_at', { ascending: false })
            .limit(60);

        if (error || !convs || convs.length === 0) {
            return;
        }

        for (const c of convs) {
            if (!c.phone) continue;

            // Obtener los últimos 8 mensajes del chat para validar el estado real
            const { data: msgs, error: msgErr } = await supabaseClient
                .from('whatsapp_messages')
                .select('id, direction, sender_name, created_at, raw_payload')
                .eq('phone', c.phone)
                .order('created_at', { ascending: false })
                .limit(8);

            if (msgErr || !msgs || msgs.length === 0) continue;

            // Si el mensaje más reciente fue enviado por un agente humano, el chat NO está en espera
            const latestMsg = msgs[0];
            if (isHumanAgentMessage(latestMsg)) {
                continue;
            }

            // Encontrar el último mensaje entrante del paciente
            const lastPatientMsg = msgs.find(m => m.direction === 'incoming');
            if (!lastPatientMsg) continue;

            const patientMsgTimeMs = new Date(lastPatientMsg.created_at).getTime();
            const waitMinutes = (nowMs - patientMsgTimeMs) / 60000;

            const aiSummary = typeof c.ai_summary === 'object' && c.ai_summary !== null ? { ...c.ai_summary } : {};

            // ========================================================
            // CASO 1: FUERA DE HORARIO LABORAL (Prioridad Máxima)
            // ========================================================
            if (!schedule.isOpen) {
                const lastAfterHoursAt = Number(aiSummary.last_after_hours_notice_at || 0);

                // Se envía si:
                // a) Nunca se le envió aviso de fuera de horario en este período (hace más de 4 horas)
                // b) O el paciente escribió después del último aviso de fuera de horario (y pasaron al menos 2 minutos)
                const shouldSendOffHours = (nowMs - lastAfterHoursAt >= 4 * 60 * 60 * 1000) ||
                    (patientMsgTimeMs > lastAfterHoursAt && (nowMs - patientMsgTimeMs) >= 2 * 60 * 1000 && (nowMs - lastAfterHoursAt) >= 30 * 60 * 1000);

                if (shouldSendOffHours) {
                    console.log(`[QueueAutoReplies] 🌙 Disparando aviso FUERA DE HORARIO a ${c.phone} (Espera: ${Math.round(waitMinutes)} min)...`);
                    const offHoursReply = getAfterHoursMessage(schedule.nextOpeningText);
                    const sent = await sendWhatsAppNotification({
                        supabaseClient,
                        supabaseUrl,
                        serviceKey,
                        phone: c.phone,
                        text: offHoursReply,
                        source: 'queue_worker_after_hours'
                    });

                    if (sent) {
                        aiSummary.last_after_hours_notice_at = nowMs;
                        await supabaseClient
                            .from('contact_center_conversations')
                            .update({
                                ai_summary: aiSummary,
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', c.id);
                    }
                }
            } else {
                // ========================================================
                // CASO 2: EN HORARIO LABORAL - DEMORA CADA 20 MINUTOS
                // ========================================================
                // Solo si el paciente lleva esperando 20 minutos o más
                if (waitMinutes >= 20) {
                    const lastDelayAt = Number(aiSummary.last_delay_notice_at || 0);
                    const referenceTime = lastDelayAt > 0 ? lastDelayAt : patientMsgTimeMs;
                    const elapsedSinceNotice = nowMs - referenceTime;

                    // Si pasaron al menos 20 minutos desde el último aviso de demora
                    if (elapsedSinceNotice >= 20 * 60 * 1000) {
                        console.log(`[QueueAutoReplies] ⏳ Disparando aviso de DEMORA CADA 20 MIN a ${c.phone} (Espera acumulada: ${Math.round(waitMinutes)} min)...`);
                        const delayReply = getDelayWaitNoticeMessage();
                        const sent = await sendWhatsAppNotification({
                            supabaseClient,
                            supabaseUrl,
                            serviceKey,
                            phone: c.phone,
                            text: delayReply,
                            source: 'queue_worker_delay_notice'
                        });

                        if (sent) {
                            aiSummary.last_delay_notice_at = nowMs;
                            await supabaseClient
                                .from('contact_center_conversations')
                                .update({
                                    ai_summary: aiSummary,
                                    updated_at: new Date().toISOString()
                                })
                                .eq('id', c.id);
                        }
                    }
                }
            }
        }
    } catch (err) {
        console.error('[QueueAutoReplies] ⚠️ Error en ciclo de cola:', err.message);
    }
}
