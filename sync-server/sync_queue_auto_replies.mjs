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
        `📲 *Gestión de Turnos Online 24 hs:*\n` +
        `Recordá que desde la página web de Sanatorio Argentino también podés autogestionar tu turno médico en cualquier momento ingresando en:\n` +
        `👉 https://www.sanatorioargentino.com.ar/turnos-online.html\n\n` +
        `🚨 *Guardia Médica 24 hs:* Si presentás una urgencia, recordá que nuestra Guardia en Sede Central (San Luis 432 Oeste) atiende las *24 horas*.`;
}

export function getDelayWaitNoticeMessage() {
    return `¡Hola! 🏥 Estamos con algunas demoras en la atención debido a la alta demanda. Te pedimos disculpas por la espera.\n\n` +
        `En breve un agente estará respondiendo tu consulta por orden de llegada.\n\n` +
        `📲 *Gestión de Turnos Online:*\n` +
        `Si deseás solicitar o gestionar un turno médico de forma inmediata sin esperar, podés hacerlo desde la página web del Sanatorio:\n` +
        `👉 https://www.sanatorioargentino.com.ar/turnos-online.html\n\n` +
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

        // 1. Despachar a WhatsApp real vía Edge Function (primero enviar, luego registrar)
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

        let body = null;
        try { body = await res.json(); } catch { /* respuesta no JSON */ }
        if (!res.ok || body?.success === false) {
            console.error(`[QueueAutoReplies] ❌ Envío rechazado a ${phone} (${source}) | HTTP ${res.status}`, body?.error || '');
            return false;
        }

        // 2. Registrar mensaje saliente solo si el envío fue aceptado
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

        console.log(`[QueueAutoReplies] 📤 Mensaje enviado a ${phone} (${source}) | Status HTTP: ${res.status}`);
        return true;
    } catch (err) {
        console.error(`[QueueAutoReplies] ❌ Error enviando WhatsApp a ${phone}:`, err.message);
        return false;
    }
}

// Ventana de atención al cliente de WhatsApp (texto libre solo dentro de 24 h del último mensaje del paciente)
const WHATSAPP_SESSION_WINDOW_MS = 23.5 * 60 * 60 * 1000;

/**
 * Escanea la cola de Contact Center y despacha avisos de fuera de horario o de demora.
 * Salvaguardas de política WhatsApp:
 *  - Desactivado por defecto: requiere QUEUE_AUTO_REPLIES_ENABLED=true.
 *  - Solo dentro de la ventana de 24 h desde el último mensaje del paciente.
 *  - Máximo 1 aviso (fuera de horario o demora) por cada mensaje nuevo del paciente.
 *  - Excluye conversaciones en estado `bot` (las gestiona el chatbot).
 */
export async function processQueueWaitingAlerts({ supabaseClient, supabaseUrl, serviceKey }) {
    if (String(process.env.QUEUE_AUTO_REPLIES_ENABLED || '').toLowerCase() !== 'true') {
        return;
    }
    try {
        const schedule = getContactCenterScheduleInfo();
        const nowMs = Date.now();

        // 1. Obtener conversaciones activas que puedan estar esperando atención
        // Nota: la PK de contact_center_conversations es `phone` (no existe columna `id`)
        const { data: convs, error } = await supabaseClient
            .from('contact_center_conversations')
            .select('phone, status, last_message_at, ai_summary')
            .in('status', ['sin_asignar', 'abierto'])
            .gte('last_message_at', new Date(nowMs - WHATSAPP_SESSION_WINDOW_MS).toISOString())
            .order('last_message_at', { ascending: false })
            .limit(60);

        if (error) {
            console.error('[QueueAutoReplies] ⚠️ Error consultando cola:', error.message);
            return;
        }
        if (!convs || convs.length === 0) {
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

            // Fuera de la ventana de 24 h no se puede enviar texto libre (solo plantillas aprobadas)
            if (nowMs - patientMsgTimeMs >= WHATSAPP_SESSION_WINDOW_MS) continue;

            const aiSummary = typeof c.ai_summary === 'object' && c.ai_summary !== null ? { ...c.ai_summary } : {};

            // Máximo 1 aviso automático por cada mensaje nuevo del paciente
            const lastAfterHoursAt = Number(aiSummary.last_after_hours_notice_at || 0);
            const lastDelayAt = Number(aiSummary.last_delay_notice_at || 0);
            const lastAnyNoticeAt = Math.max(lastAfterHoursAt, lastDelayAt);
            if (lastAnyNoticeAt >= patientMsgTimeMs) continue;

            let noticeText = null;
            let source = null;
            let summaryKey = null;

            if (!schedule.isOpen) {
                // CASO 1: FUERA DE HORARIO — tras 2 min del mensaje del paciente
                if (nowMs - patientMsgTimeMs >= 2 * 60 * 1000) {
                    noticeText = getAfterHoursMessage(schedule.nextOpeningText);
                    source = 'queue_worker_after_hours';
                    summaryKey = 'last_after_hours_notice_at';
                }
            } else if (waitMinutes >= 20) {
                // CASO 2: EN HORARIO — demora de 20 min o más (una sola vez por espera)
                noticeText = getDelayWaitNoticeMessage();
                source = 'queue_worker_delay_notice';
                summaryKey = 'last_delay_notice_at';
            }

            if (!noticeText) continue;

            console.log(`[QueueAutoReplies] Aviso ${source} a ${c.phone} (Espera: ${Math.round(waitMinutes)} min)...`);
            const sent = await sendWhatsAppNotification({
                supabaseClient,
                supabaseUrl,
                serviceKey,
                phone: c.phone,
                text: noticeText,
                source
            });

            if (sent) {
                aiSummary[summaryKey] = nowMs;
                const { error: updErr } = await supabaseClient
                    .from('contact_center_conversations')
                    .update({
                        ai_summary: aiSummary,
                        updated_at: new Date().toISOString()
                    })
                    .eq('phone', c.phone);
                if (updErr) console.error(`[QueueAutoReplies] ⚠️ Error actualizando ${c.phone}:`, updErr.message);
            }
        }
    } catch (err) {
        console.error('[QueueAutoReplies] ⚠️ Error en ciclo de cola:', err.message);
    }
}
