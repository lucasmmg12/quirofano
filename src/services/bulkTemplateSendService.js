/**
 * Bulk Template Send Service — Sistema ADM-QUI
 * 
 * Envío masivo de plantillas Meta WhatsApp desde Control de Cirugías
 * con protecciones anti-colapso:
 *   - Cola secuencial (nunca paralelo)
 *   - Rate limiting configurable (default: 3s entre envíos)
 *   - Máximo 30 destinatarios por lote
 *   - Señal de abort para cancelación
 *   - Auto-resolución de variables por paciente
 *   - Retry con backoff en caso de error
 *   - Logging en surgery_events + whatsapp_messages
 */

import { sendMetaTemplate } from './metaTemplateService';
import { saveOutgoingMessage } from './chatService';
import { normalizeArgentinePhone } from './builderbotApi';
import { supabase } from '../lib/supabase';

// ============================================================
// CONSTANTS
// ============================================================

const MAX_RECIPIENTS = 30;
const DEFAULT_DELAY_MS = 3000;  // 3 segundos entre envíos
const RETRY_DELAY_MS = 5000;    // 5 segundos antes de reintentar
const MAX_RETRIES = 1;          // 1 reintento por envío

// ============================================================
// VARIABLE RESOLUTION (mirrors MessagingPanel heuristics)
// ============================================================

const formatDateAR = (fecha) => {
    if (!fecha) return '';
    try {
        const d = new Date(fecha + 'T12:00:00');
        return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return fecha; }
};

/**
 * Resuelve el valor de un campo a partir de los datos de la cirugía
 */
function resolveFieldFromSurgery(fieldKey, surgery) {
    const map = {
        nombre: surgery.nombre || '',
        fecha_cirugia: formatDateAR(surgery.fecha_cirugia),
        medico: surgery.medico || '',
        obra_social: surgery.obra_social || '',
        presupuesto: '',
        deuda: '',
    };
    return map[fieldKey] ?? '';
}

/**
 * Detecta el campo correcto para una variable de plantilla basándose
 * en el contexto textual (misma heurística que MessagingPanel)
 */
function guessVariableFieldKey(index, templateText) {
    if (!templateText) return null;
    const placeholder = `{{${index}}}`;
    const placeholderPos = templateText.indexOf(placeholder);
    if (placeholderPos === -1) return null;

    const start = Math.max(0, placeholderPos - 80);
    const end = Math.min(templateText.length, placeholderPos + 80);
    const ctx = templateText.substring(start, end).toLowerCase();

    if (/hola|estimad[oa]|paciente|querid[oa]|bienvenid[oa]|se[ñn]or[a]?|nombre|sr[a]?\./.test(ctx)) return 'nombre';
    if (/cirug[íi]a|fecha|turno|d[íi]a|programad[oa]|procedimiento|intervenci[oó]n|agendad[oa]|cita|horario|estudio/.test(ctx)) return 'fecha_cirugia';
    if (/m[ée]dic[oa]|dr[a]?\.|doctor[a]?|profesional|cirujano|especialista/.test(ctx)) return 'medico';
    if (/obra social|prepaga|cobertura|mutual|osde|seguro|afiliaci[oó]n/.test(ctx)) return 'obra_social';
    if (/importe|\$|presupuesto|monto|factura|pago|abonar|costo|valor/.test(ctx)) return 'presupuesto';
    if (/deuda|saldo|pendiente|adeuda/.test(ctx)) return 'deuda';

    // Fallback por índice convencional
    if (index === 1) return 'nombre';
    if (index === 2) return 'fecha_cirugia';
    if (index === 3) return 'medico';

    return null;
}

/**
 * Resuelve las variables de una plantilla Meta para un paciente específico
 * @returns {{ components: Array|null, resolvedText: string, allResolved: boolean, unresolvedVars: number[] }}
 */
export function resolveTemplateForPatient(template, surgery) {
    const bodyComponent = template.components?.find(c => c.type === 'BODY');
    const text = bodyComponent?.text || '';
    const matches = text.match(/\{\{(\d+)\}\}/g);

    if (!matches) {
        return { components: null, resolvedText: text, allResolved: true, unresolvedVars: [] };
    }

    const indices = [];
    matches.forEach(m => {
        const idx = Number(m.replace(/\{\{|\}\}/g, ''));
        if (!indices.includes(idx)) indices.push(idx);
    });
    indices.sort((a, b) => a - b);

    const resolvedVars = [];
    const unresolvedVars = [];
    let resolvedText = text;

    for (const idx of indices) {
        const fieldKey = guessVariableFieldKey(idx, text);
        const value = fieldKey ? resolveFieldFromSurgery(fieldKey, surgery) : '';

        if (value && value.trim() !== '') {
            resolvedVars.push({ index: idx, value: value.trim() });
            resolvedText = resolvedText.replace(`{{${idx}}}`, value.trim());
        } else {
            unresolvedVars.push(idx);
            resolvedVars.push({ index: idx, value: '' });
        }
    }

    const allResolved = unresolvedVars.length === 0;

    const components = allResolved ? [
        {
            type: 'body',
            parameters: resolvedVars.map(v => ({
                type: 'text',
                text: String(v.value || '').trim(),
            })),
        },
    ] : null;

    return { components, resolvedText, allResolved, unresolvedVars };
}

// ============================================================
// PRE-VALIDATION
// ============================================================

/**
 * Valida y filtra los destinatarios para envío masivo
 * @param {Array} surgeries - Cirugías seleccionadas
 * @returns {{ valid: Array, invalid: Array<{ surgery, reason: string }> }}
 */
export function validateBulkRecipients(surgeries) {
    const valid = [];
    const invalid = [];

    for (const surgery of surgeries) {
        // Sin teléfono
        if (!surgery.telefono) {
            invalid.push({ surgery, reason: 'Sin teléfono registrado' });
            continue;
        }

        // Teléfono inválido (no empieza con 549)
        const normalized = normalizeArgentinePhone(surgery.telefono);
        if (!normalized || !normalized.startsWith('549') || normalized.length !== 13) {
            invalid.push({ surgery, reason: `Teléfono inválido: ${surgery.telefono}` });
            continue;
        }

        // Suspendida o realizada
        if (surgery.ausente === '0') {
            invalid.push({ surgery, reason: 'Cirugía ya realizada' });
            continue;
        }
        if (surgery.ausente === '1') {
            invalid.push({ surgery, reason: 'Cirugía suspendida' });
            continue;
        }

        // Excluida
        if (surgery.excluido) {
            invalid.push({ surgery, reason: 'Módulo excluido' });
            continue;
        }

        valid.push({ ...surgery, _normalizedPhone: normalized });
    }

    return { valid, invalid };
}

// ============================================================
// BULK SEND — CORE
// ============================================================

/**
 * Envía una plantilla Meta WhatsApp a múltiples destinatarios de forma secuencial
 * con rate limiting y protecciones anti-colapso.
 * 
 * @param {Object} params
 * @param {Array} params.surgeries - Cirugías validadas (output de validateBulkRecipients.valid)
 * @param {Object} params.template - Plantilla Meta seleccionada
 * @param {string} params.lineId - ID de la línea WhatsApp
 * @param {function} params.onProgress - Callback(progress) llamado después de cada envío
 * @param {AbortSignal} [params.signal] - Señal de abort para cancelación
 * @param {number} [params.delayMs] - Delay entre envíos en ms (default: 3000)
 * @param {string} [params.senderName] - Nombre del usuario que envía
 * @returns {Promise<{ sent: number, failed: number, skipped: number, aborted: boolean, results: Array }>}
 */
export async function sendBulkTemplates({
    surgeries,
    template,
    lineId = 'line_b',
    onProgress,
    signal,
    delayMs = DEFAULT_DELAY_MS,
    senderName = 'Sistema ADM-QUI',
}) {
    // Enforce max recipients
    const recipients = surgeries.slice(0, MAX_RECIPIENTS);
    const total = recipients.length;

    const summary = {
        sent: 0,
        failed: 0,
        skipped: 0,
        aborted: false,
        results: [],
    };

    const templateName = template.name || template.templateName || '';
    const templateBody = template.components?.find(c => c.type === 'BODY')?.text || templateName;

    for (let i = 0; i < recipients.length; i++) {
        // Check abort
        if (signal?.aborted) {
            summary.aborted = true;
            // Mark remaining as skipped
            for (let j = i; j < recipients.length; j++) {
                summary.results.push({
                    surgery: recipients[j],
                    status: 'aborted',
                    message: 'Cancelado por el usuario',
                });
                summary.skipped++;
            }
            break;
        }

        const surgery = recipients[i];
        const phone = surgery._normalizedPhone || normalizeArgentinePhone(surgery.telefono);

        // Resolve template variables for this patient
        const { components, resolvedText, allResolved, unresolvedVars } = resolveTemplateForPatient(template, surgery);

        if (!allResolved) {
            summary.results.push({
                surgery,
                status: 'skipped',
                message: `Variables sin resolver: {{${unresolvedVars.join('}}, {{')}}}`,
            });
            summary.skipped++;
            onProgress?.({
                current: i + 1,
                total,
                surgery,
                status: 'skipped',
                message: `Variables sin resolver`,
                summary: { ...summary },
            });
            continue;
        }

        // Attempt send with retry
        let sent = false;
        let lastError = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                // Send via Edge Function
                await sendMetaTemplate({
                    to: phone,
                    templateName,
                    languageCode: template.language || 'es',
                    components: components || undefined,
                    lineId,
                });

                // Save to whatsapp_messages for chat history
                try {
                    await saveOutgoingMessage({
                        phone,
                        content: `📋 [Plantilla Masiva] ${resolvedText}`,
                        mediaType: 'text',
                        lineId,
                        senderName,
                    });
                } catch (_) { /* webhook outgoing también lo guarda */ }

                // Log in surgery_events for audit
                try {
                    await supabase.from('surgery_events').insert({
                        surgery_id: surgery.id,
                        id_paciente: surgery.id_paciente || null,
                        event_type: 'bulk_template_sent',
                        from_status: surgery.status,
                        to_status: surgery.status, // no cambia el status
                        details: `Plantilla masiva "${templateName}" enviada a ${phone}. Mensaje: ${resolvedText.substring(0, 200)}`,
                        performed_by: senderName,
                    });
                } catch (logErr) {
                    console.warn('[bulkSend] Error logging event:', logErr.message);
                }

                sent = true;
                break;

            } catch (err) {
                lastError = err;
                console.warn(`[bulkSend] Error enviando a ${surgery.nombre} (intento ${attempt + 1}):`, err.message);

                if (attempt < MAX_RETRIES) {
                    // Wait before retry
                    await sleep(RETRY_DELAY_MS);
                }
            }
        }

        if (sent) {
            summary.sent++;
            summary.results.push({
                surgery,
                status: 'sent',
                message: `Plantilla enviada a ${phone}`,
            });
        } else {
            summary.failed++;
            summary.results.push({
                surgery,
                status: 'failed',
                message: lastError?.message || 'Error desconocido',
            });
        }

        // Progress callback
        onProgress?.({
            current: i + 1,
            total,
            surgery,
            status: sent ? 'sent' : 'failed',
            message: sent ? `Enviado a ${surgery.nombre}` : `Error: ${lastError?.message}`,
            summary: { ...summary },
        });

        // Rate limiting delay (skip on last item or abort)
        if (i < recipients.length - 1 && !signal?.aborted) {
            await sleep(delayMs);
        }
    }

    console.log(`📤 Envío masivo finalizado:`, {
        template: templateName,
        sent: summary.sent,
        failed: summary.failed,
        skipped: summary.skipped,
        aborted: summary.aborted,
    });

    return summary;
}

// ============================================================
// HELPERS
// ============================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** Max recipients constant exported for UI validation */
export { MAX_RECIPIENTS, DEFAULT_DELAY_MS };
