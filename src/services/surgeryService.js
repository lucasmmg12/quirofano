/**
 * Servicio de Cirugías — Bot de Confirmación WhatsApp
 * Gestiona los estados: Lila → Amarillo → Verde → Azul (+ Rojo)
 * 
 * Flujo:
 *  1. LILA: Cirugía cargada, pendiente de notificación (72h/48h antes)
 *  2. AMARILLO: Documentación recibida, en revisión
 *  3. VERDE: Autorizada por admin, esperando confirmación del paciente
 *  4. AZUL: Paciente confirmó asistencia, indicaciones enviadas
 *  5. ROJO: Problema (documentación faltante, paciente no responde, etc.)
 */

import { supabase } from '../lib/supabase';
import { sendWhatsAppMessage } from './builderbotApi';

// Módulos excluidos del envío automático
const EXCLUDED_MODULES = ['Transferencia embrionaria', 'Fertilidad', 'Bloque Médico'];

// Prefijos de nombre que NO son cirugías reales (se descartan completamente)
const EXCLUDED_NAME_PREFIXES = ['BLOQUE'];

// =============================================
// CRUD DE CIRUGÍAS
// =============================================

/**
 * Obtiene cirugías filtradas por estado y/o fecha
 * @param {Object} options
 * @param {string} [options.status] - Filtrar por status (lila, amarillo, verde, etc.)
 * @param {string} [options.fromDate] - Fecha mínima (YYYY-MM-DD)
 * @param {string} [options.toDate] - Fecha máxima (YYYY-MM-DD)
 * @param {number} [options.limit] - Límite de registros
 * @param {string} [options.ausenteFilter] - 'pending' (NULL), 'completed' (0), 'suspended' (1), 'all'
 */
export async function fetchSurgeries({ status, fromDate, toDate, limit = 500, ausenteFilter = 'pending' } = {}) {
    let query = supabase
        .from('surgeries')
        .select('*, surgery_events(*)')
        .eq('excluido', false)
        .order('fecha_cirugia', { ascending: true });

    // Filtro por columna ausente
    // NULL/vacío = pendiente, '0' = realizada, '1' = suspendida
    if (ausenteFilter === 'pending') {
        // Pendientes = todo lo que NO sea '0' (realizada) ni '1' (suspendida)
        query = query.not('ausente', 'in', '("0","1")');
    } else if (ausenteFilter === 'completed') {
        query = query.eq('ausente', '0'); // Ya realizadas
    } else if (ausenteFilter === 'suspended') {
        query = query.eq('ausente', '1'); // Suspendidas
    } else if (ausenteFilter === 'history') {
        query = query.in('ausente', ['0', '1']); // Todas las finalizadas
    }
    // 'all' no aplica filtro

    if (status) query = query.eq('status', status);
    if (fromDate) query = query.gte('fecha_cirugia', fromDate);
    if (toDate) query = query.lte('fecha_cirugia', toDate);
    query = query.limit(limit);

    const { data, error } = await query;
    if (error) throw error;
    return data;
}

/**
 * Obtiene todas las cirugías (incluyendo excluidas) para vista de gestión
 */
export async function fetchAllSurgeries(limit = 200) {
    const { data, error } = await supabase
        .from('surgeries')
        .select('*')
        .order('fecha_cirugia', { ascending: true })
        .limit(limit);
    if (error) throw error;
    return data;
}

/**
 * Carga una cirugía individual
 */
export async function createSurgery(surgeryData) {
    const excluido = EXCLUDED_MODULES.some(mod =>
        surgeryData.modulo?.toLowerCase().includes(mod.toLowerCase())
    );

    const { data, error } = await supabase
        .from('surgeries')
        .insert({
            nombre: surgeryData.nombre,
            dni: surgeryData.dni || null,
            telefono: surgeryData.telefono || '',
            obra_social: surgeryData.obraSocial || surgeryData.obra_social || null,
            fecha_cirugia: surgeryData.fechaCirugia || surgeryData.fecha_cirugia,
            medico: surgeryData.medico || null,
            modulo: surgeryData.modulo || null,
            excluido,
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

/**
 * Actualiza una cirugía existente
 */
export async function updateSurgery(surgeryId, updates) {
    const excluido = updates.modulo
        ? EXCLUDED_MODULES.some(mod => updates.modulo.toLowerCase().includes(mod.toLowerCase()))
        : undefined;

    const cleanUpdates = {
        ...(updates.nombre !== undefined && { nombre: updates.nombre }),
        ...(updates.dni !== undefined && { dni: updates.dni || null }),
        ...(updates.telefono !== undefined && { telefono: updates.telefono || '' }),
        ...(updates.obra_social !== undefined && { obra_social: updates.obra_social || null }),
        ...(updates.fecha_cirugia !== undefined && { fecha_cirugia: updates.fecha_cirugia }),
        ...(updates.medico !== undefined && { medico: updates.medico || null }),
        ...(updates.modulo !== undefined && { modulo: updates.modulo || null }),
        ...(excluido !== undefined && { excluido }),
    };

    const { data, error } = await supabase
        .from('surgeries')
        .update(cleanUpdates)
        .eq('id', surgeryId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

/**
 * Elimina una cirugía y sus eventos asociados
 */
export async function deleteSurgery(surgeryId) {
    // Los eventos se borran por CASCADE (FK con ON DELETE CASCADE)
    const { error } = await supabase
        .from('surgeries')
        .delete()
        .eq('id', surgeryId);
    if (error) throw error;
    return { deleted: true };
}

/**
 * Carga múltiples cirugías desde un listado (JSON/Excel parsed)
 * Filtra automáticamente módulos excluidos
 * @deprecated Usar bulkUpsertSurgeries para carga periódica con deduplicación
 */
export async function bulkCreateSurgeries(list) {
    const records = list.map(item => ({
        nombre: item.nombre || item.Nombre,
        dni: item.dni || item.DNI,
        telefono: item.telefono || item.Telefono || item['Teléfono'],
        obra_social: item.obra_social || item['Obra Social'] || item.obraSocial,
        fecha_cirugia: item.fecha_cirugia || item['Fecha de Cirugía'] || item.fechaCirugia,
        medico: item.medico || item['Médico'] || item.Medico,
        modulo: item.modulo || item['Módulo'] || item.Modulo,
        excluido: EXCLUDED_MODULES.some(mod =>
            (item.modulo || item['Módulo'] || item.Modulo || '').toLowerCase().includes(mod.toLowerCase())
        ),
    }));

    const { data, error } = await supabase
        .from('surgeries')
        .insert(records)
        .select();
    if (error) throw error;

    return {
        total: records.length,
        activas: records.filter(r => !r.excluido).length,
        excluidas: records.filter(r => r.excluido).length,
        data,
    };
}

/**
 * UPSERT masivo de cirugías desde Excel con normalización de teléfonos
 * 
 * - Si el registro tiene id_paciente y ya existe (id_paciente + fecha_cirugia + nombre) → ACTUALIZA
 * - Si es nuevo o no tiene id_paciente → INSERTA
 * - Normaliza teléfonos al formato 549XXXXXXXXXX para WhatsApp
 * 
 * @param {Array} mappedRecords - Registros ya mapeados del Excel (via mapExcelToSurgeries)
 * @param {string} defaultAreaCode - Código de área por defecto para números sin código
 * @param {function} onProgress - Callback(current, total, results) llamado después de cada lote
 * @returns {{ inserted: number, updated: number, skipped: number, errors: Array, phoneStats: Object }}
 */
export async function bulkUpsertSurgeries(mappedRecords, defaultAreaCode = '', onProgress = null) {
    const results = { inserted: 0, updated: 0, skipped: 0, errors: [], phoneStats: { valid: 0, invalid: 0 } };
    const total = mappedRecords.length;

    // Importar normalizePhone dinámicamente para evitar dependencia circular
    const { normalizePhone } = await import('../utils/phoneUtils.js');

    // Preparar todos los registros
    const withId = [];   // Tienen id_paciente → pueden usar upsert
    const withoutId = []; // Sin id_paciente → insert directo

    for (let i = 0; i < mappedRecords.length; i++) {
        const record = mappedRecords[i];

        // Descartar nombres que empiezan con prefijos excluidos (ej: BLOQUE)
        const nombreUpper = (record.nombre || '').toUpperCase().trim();
        if (EXCLUDED_NAME_PREFIXES.some(prefix => nombreUpper.startsWith(prefix))) {
            results.skippedByName = (results.skippedByName || 0) + 1;
            continue;
        }

        const phoneResult = normalizePhone(record.telefono_raw, defaultAreaCode);

        if (phoneResult.valid) {
            results.phoneStats.valid++;
        } else {
            results.phoneStats.invalid++;
        }

        const excluido = EXCLUDED_MODULES.some(mod =>
            (record.modulo || '').toLowerCase().includes(mod.toLowerCase())
        );

        const row = {
            id_paciente: record.id_paciente || null,
            nombre: record.nombre,
            dni: record.dni || null,
            fecha_cirugia: record.fecha_cirugia,
            telefono: phoneResult.normalized || record.telefono_raw,
            telefono_original: phoneResult.original,
            medico: record.medico || null,
            modulo: record.modulo || null,
            obra_social: record.obra_social || null,
            descripcion: record.descripcion || null,
            motivo: record.motivo || null,
            ausente: record.ausente && record.ausente.trim() !== '' ? record.ausente.trim() : null,
            grupo_agendas: record.grupo_agendas || null,
            excluido,
            _rowIndex: record._rowIndex,
        };

        if (row.id_paciente && row.nombre && row.fecha_cirugia) {
            withId.push(row);
        } else {
            withoutId.push(row);
        }
    }

    // Deduplicar registros con id_paciente (el Excel puede traer duplicados)
    // PostgreSQL ON CONFLICT DO UPDATE no permite la misma fila 2 veces en un mismo comando
    const deduped = new Map();
    for (const row of withId) {
        const key = `${row.id_paciente}|${row.fecha_cirugia}|${row.nombre}`;
        deduped.set(key, row); // Último gana (datos más completos)
    }
    const dedupedCount = withId.length - deduped.size;
    if (dedupedCount > 0) {
        console.log(`🔄 Deduplicados ${dedupedCount} registros repetidos en el Excel`);
        results.deduplicated = dedupedCount;
    }
    const uniqueWithId = Array.from(deduped.values());

    // BATCH SIZE
    const BATCH = 50;

    // 1) UPSERT en lotes para registros CON id_paciente (deduplicados)
    for (let i = 0; i < uniqueWithId.length; i += BATCH) {
        const batch = uniqueWithId.slice(i, i + BATCH);
        const cleanBatch = batch.map(({ _rowIndex, ...rest }) => rest);

        try {
            const { data, error } = await supabase
                .from('surgeries')
                .upsert(cleanBatch, {
                    onConflict: 'id_paciente,fecha_cirugia,nombre',
                    ignoreDuplicates: false,
                })
                .select('id, created_at, updated_at');

            if (error) {
                console.error('❌ Batch upsert falló:', error.message, error.details, error.hint);
                // Si el batch falla, intentar uno por uno
                for (const row of batch) {
                    const { _rowIndex, ...cleanRow } = row;
                    const { data: d, error: e } = await supabase
                        .from('surgeries')
                        .upsert(cleanRow, {
                            onConflict: 'id_paciente,fecha_cirugia,nombre',
                            ignoreDuplicates: false,
                        })
                        .select('id, created_at, updated_at')
                        .single();

                    if (e) {
                        console.error(`❌ Record fallback falló [${row.nombre}]:`, e.message, e.details);
                        results.errors.push({ row: _rowIndex, nombre: row.nombre, error: e.message });
                        results.skipped++;
                    } else {
                        const isNew = d.created_at === d.updated_at;
                        isNew ? results.inserted++ : results.updated++;
                    }
                }
            } else if (data) {
                data.forEach(d => {
                    const isNew = d.created_at === d.updated_at;
                    isNew ? results.inserted++ : results.updated++;
                });
            }
        } catch (e) {
            batch.forEach(row => {
                results.errors.push({ row: row._rowIndex, nombre: row.nombre, error: e.message });
                results.skipped++;
            });
        }

        // Reportar progreso
        if (onProgress) {
            const processed = Math.min(i + BATCH, uniqueWithId.length);
            onProgress(processed, total, { ...results });
        }
    }

    // 2) INSERT en lotes para registros SIN id_paciente
    for (let i = 0; i < withoutId.length; i += BATCH) {
        const batch = withoutId.slice(i, i + BATCH);
        const cleanBatch = batch.map(({ _rowIndex, ...rest }) => rest);

        try {
            const { data, error } = await supabase
                .from('surgeries')
                .insert(cleanBatch)
                .select('id');

            if (error) {
                batch.forEach(row => {
                    results.errors.push({ row: row._rowIndex, nombre: row.nombre, error: error.message });
                    results.skipped++;
                });
            } else {
                results.inserted += (data ? data.length : batch.length);
            }
        } catch (e) {
            batch.forEach(row => {
                results.errors.push({ row: row._rowIndex, nombre: row.nombre, error: e.message });
                results.skipped++;
            });
        }

        // Reportar progreso
        if (onProgress) {
            const processed = uniqueWithId.length + Math.min(i + BATCH, withoutId.length);
            onProgress(processed, total, { ...results });
        }
    }

    console.log(`📊 Bulk upsert finalizado:`, {
        total: mappedRecords.length,
        conIdPaciente: withId.length,
        sinIdPaciente: withoutId.length,
        ...results,
        primerosErrores: results.errors.slice(0, 5),
    });

    return results;
}

// =============================================
// MACHINE DE ESTADOS
// =============================================

/**
 * Cambia el estado de una cirugía y registra el evento
 */
async function transitionStatus(surgeryId, toStatus, { details, performedBy = 'bot', extraFields = {} } = {}) {
    // Get current status
    const { data: current, error: fetchError } = await supabase
        .from('surgeries')
        .select('status')
        .eq('id', surgeryId)
        .single();
    if (fetchError) throw fetchError;

    const fromStatus = current.status;

    // Update surgery
    const { error: updateError } = await supabase
        .from('surgeries')
        .update({ status: toStatus, ...extraFields })
        .eq('id', surgeryId);
    if (updateError) throw updateError;

    // Log event
    await supabase.from('surgery_events').insert({
        surgery_id: surgeryId,
        event_type: `${fromStatus}_to_${toStatus}`,
        from_status: fromStatus,
        to_status: toStatus,
        details: details || `Transición de ${fromStatus} a ${toStatus}`,
        performed_by: performedBy,
    });

    return { from: fromStatus, to: toStatus };
}

// =============================================
// MENSAJERÍA
// =============================================

/**
 * Obtiene la plantilla adecuada según obra social y tipo
 */
async function getTemplate(obraSocial, templateType) {
    // Try specific match first
    const { data: specific } = await supabase
        .from('surgery_templates')
        .select('content')
        .eq('obra_social_pattern', obraSocial)
        .eq('template_type', templateType)
        .eq('is_active', true)
        .limit(1)
        .single();

    if (specific) return specific.content;

    // Fallback to default
    const { data: fallback } = await supabase
        .from('surgery_templates')
        .select('content')
        .eq('obra_social_pattern', '*')
        .eq('template_type', templateType)
        .eq('is_active', true)
        .limit(1)
        .single();

    return fallback?.content || null;
}

/**
 * Reemplaza placeholders en una plantilla
 */
function fillTemplate(template, surgery) {
    if (!template) return '';
    return template
        .replace(/{nombre}/g, surgery.nombre || '')
        .replace(/{fecha}/g, formatDate(surgery.fecha_cirugia))
        .replace(/{medico}/g, surgery.medico || '')
        .replace(/{obra_social}/g, surgery.obra_social || '')
        .replace(/{dni}/g, surgery.dni || '');
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Determina si una cirugía debe notificarse HOY
 * Regla: 72h antes (3 días), o 48h (2 días) si la cirugía es lunes (se notifica sábado)
 */
export function shouldNotifyToday(fechaCirugia) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const surgery = new Date(fechaCirugia + 'T12:00:00');
    surgery.setHours(0, 0, 0, 0);

    const diffMs = surgery.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    // Si la cirugía es lunes (1), notificar el sábado (2 días antes)
    if (surgery.getDay() === 1 && diffDays === 2) return true;
    // Default: notificar 3 días antes
    if (diffDays === 3) return true;

    return false;
}

// =============================================
// ACCIONES DEL BOT
// =============================================

/**
 * PASO 1: Enviar notificación inicial (Lila → Amarillo)
 */
export async function sendInitialNotification(surgeryId) {
    const { data: surgery, error } = await supabase
        .from('surgeries')
        .select('*')
        .eq('id', surgeryId)
        .single();
    if (error) throw error;
    if (surgery.excluido) return { skipped: true, reason: 'Módulo excluido' };

    let whatsappOk = true;
    let whatsappError = null;
    let docType = '*';

    try {
        // Get notification template
        const notifTemplate = await getTemplate(surgery.obra_social, 'notificacion');
        const notifMessage = fillTemplate(notifTemplate, surgery);

        // Send notification
        await sendWhatsAppMessage({
            content: notifMessage,
            number: surgery.telefono,
        });

        // Determine document request based on obra social
        const obraSocialUpper = (surgery.obra_social || '').toUpperCase();

        if (obraSocialUpper.includes('PROVINCIA') || obraSocialUpper.includes('JERÁRQUICOS') || obraSocialUpper.includes('JERARQUICOS')) {
            docType = obraSocialUpper.includes('PROVINCIA') ? 'Provincia' : 'Jerárquicos';
        } else if (obraSocialUpper.includes('PREPAGA') || obraSocialUpper.includes('SWISS') || obraSocialUpper.includes('GALENO') || obraSocialUpper.includes('OSDE')) {
            docType = 'Prepaga';
        }

        // Send doc request (after a small delay to avoid flooding)
        const docTemplate = await getTemplate(docType, 'solicitud_doc');
        const docMessage = fillTemplate(docTemplate, surgery);

        await new Promise(r => setTimeout(r, 2000));

        await sendWhatsAppMessage({
            content: docMessage,
            number: surgery.telefono,
        });
    } catch (waError) {
        console.warn('⚠️ WhatsApp falló, pero se transiciona igualmente:', waError.message);
        whatsappOk = false;
        whatsappError = waError.message;
    }

    // SIEMPRE transicionar el status (no depende de WhatsApp)
    await supabase.from('surgeries').update({
        status: 'amarillo',
        notificado_at: new Date().toISOString(),
        ultimo_mensaje_at: new Date().toISOString(),
    }).eq('id', surgeryId);

    // Log event
    await supabase.from('surgery_events').insert({
        surgery_id: surgeryId,
        event_type: 'notificacion',
        from_status: 'lila',
        to_status: 'amarillo',
        details: whatsappOk
            ? `Notificación enviada a ${surgery.telefono}. Tipo doc: ${docType}`
            : `Transición sin WA (error: ${whatsappError}). Tel: ${surgery.telefono}`,
        performed_by: 'bot',
    });

    return { sent: whatsappOk, telefono: surgery.telefono, docType, whatsappError };
}

/**
 * PASO 2: Marcar documentación recibida (Lila → Amarillo)
 */
export async function markDocumentReceived(surgeryId, fileInfo = {}) {
    const { data: surgery } = await supabase
        .from('surgeries')
        .select('archivos')
        .eq('id', surgeryId)
        .single();

    const archivos = surgery?.archivos || [];
    archivos.push({
        ...fileInfo,
        recibido_at: new Date().toISOString(),
    });

    await transitionStatus(surgeryId, 'amarillo', {
        details: `Documentación recibida: ${fileInfo.filename || 'archivo'}`,
        extraFields: {
            archivos,
            documentacion_recibida_at: new Date().toISOString(),
        },
    });

    return { status: 'amarillo' };
}

/**
 * PASO 3: Autorizar (Amarillo → Verde) — el admin aprueba
 */
export async function authorizeSurgery(surgeryId, operador = 'admin') {
    const { data: surgery } = await supabase
        .from('surgeries')
        .select('*')
        .eq('id', surgeryId)
        .single();

    // Send authorization message
    const template = await getTemplate(surgery.obra_social, 'autorizacion');
    const message = fillTemplate(template, surgery);

    await sendWhatsAppMessage({
        content: message,
        number: surgery.telefono,
    });

    await transitionStatus(surgeryId, 'verde', {
        details: `Autorizado por ${operador}`,
        performedBy: operador,
        extraFields: {
            autorizado_at: new Date().toISOString(),
            operador,
            ultimo_mensaje_at: new Date().toISOString(),
        },
    });

    return { status: 'verde', messageSent: true };
}

/**
 * PASO 4: Confirmar asistencia (Verde → Azul) — paciente confirma
 */
export async function confirmAttendance(surgeryId) {
    const { data: surgery } = await supabase
        .from('surgeries')
        .select('*')
        .eq('id', surgeryId)
        .single();

    // Send admission instructions
    const template = await getTemplate(surgery.obra_social, 'indicaciones');
    const message = fillTemplate(template, surgery);

    await sendWhatsAppMessage({
        content: message,
        number: surgery.telefono,
    });

    await transitionStatus(surgeryId, 'azul', {
        details: 'Paciente confirmó asistencia. Indicaciones enviadas.',
        extraFields: {
            confirmado_at: new Date().toISOString(),
            ultimo_mensaje_at: new Date().toISOString(),
        },
    });

    return { status: 'azul', indicacionesSent: true };
}

/**
 * Marcar problema (Cualquier estado → Rojo)
 */
export async function flagProblem(surgeryId, reason, operador = 'admin') {
    await transitionStatus(surgeryId, 'rojo', {
        details: `Problema: ${reason}`,
        performedBy: operador,
        extraFields: { notas: reason, operador },
    });
    return { status: 'rojo' };
}

/**
 * Intervención manual: cambiar estado directamente
 */
export async function manualOverride(surgeryId, newStatus, reason, operador) {
    await transitionStatus(surgeryId, newStatus, {
        details: `Intervención manual: ${reason}`,
        performedBy: operador,
    });
    return { status: newStatus };
}

/**
 * Actualiza el resultado/ausencia de una cirugía
 * @param {string} surgeryId
 * @param {'0'|'1'|null} ausenteValue - '0' = Realizada, '1' = Suspendida, null = Pendiente
 */
export async function updateAusenteStatus(surgeryId, ausenteValue) {
    const { data, error } = await supabase
        .from('surgeries')
        .update({ ausente: ausenteValue })
        .eq('id', surgeryId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

/**
 * Envía notificaciones masivas para cirugías programadas
 * Ejecutar como cron job o desde el panel
 */
export async function processScheduledNotifications() {
    const { data: pending } = await supabase
        .from('surgeries')
        .select('*')
        .eq('status', 'lila')
        .eq('excluido', false)
        .is('notificado_at', null);

    if (!pending || pending.length === 0) return { processed: 0 };

    const results = [];
    for (const surgery of pending) {
        if (shouldNotifyToday(surgery.fecha_cirugia)) {
            try {
                const result = await sendInitialNotification(surgery.id);
                results.push({ id: surgery.id, nombre: surgery.nombre, ...result });
                // Rate limiting: 3 second delay between messages
                await new Promise(r => setTimeout(r, 3000));
            } catch (e) {
                results.push({ id: surgery.id, nombre: surgery.nombre, error: e.message });
            }
        }
    }

    return { processed: results.length, results };
}

// =============================================
// ESTADÍSTICAS
// =============================================

export async function getSurgeryStats() {
    const { data } = await supabase
        .from('surgeries')
        .select('status, excluido, ausente')
        .eq('excluido', false);

    if (!data) return {};

    const stats = { lila: 0, amarillo: 0, verde: 0, azul: 0, rojo: 0, realizada: 0, suspendida: 0, total: data.length };
    data.forEach(s => {
        // Determinar status efectivo basado en ausente
        if (s.ausente === '0') {
            stats.realizada++;
        } else if (s.ausente === '1') {
            stats.suspendida++;
        } else {
            stats[s.status] = (stats[s.status] || 0) + 1;
        }
    });
    return stats;
}
