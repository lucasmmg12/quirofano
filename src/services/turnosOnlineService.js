/**
 * turnosOnlineService.js
 * Servicio frontend para consulta, gestión y aviso por WhatsApp de turnos online duplicados.
 * Conectado de forma directa y segura a Supabase (HTTPS / Vercel friendly, sin Mixed Content).
 */
import { supabase } from '../lib/supabase';
import { getAdmQuiHeaders } from './salusSync';
import { sendWhatsAppMessage, normalizeArgentinePhone } from './builderbotApi';
import { saveOutgoingMessage } from './chatService';
import { sendMetaTemplate } from './metaTemplateService';

/**
 * Plantilla oficial aprobada por Meta para iniciar conversación con pacientes
 * que tienen varios turnos online el mismo día.
 * Body: {{1}} nombre · {{2}} fecha · {{3}} detalle de turnos. Botones Quick Reply sin parámetros.
 */
export const META_TEMPLATE_TURNOS_MISMO_DIA = {
    name: 'turnos_duplicados',
    language: 'en',
    header: 'Sanatorio Argentino Contact Center',
    body: 'Hola {{1}}, nos comunicamos de *Sanatorio Argentino*.\n\n*Registramos en nuestro sistema que tenés más de un turno agendado para el día {{2}}:*\n{{3}}\n\nTe consultamos si vas a asistir a todas las consultas o si deseás anular o reprogramar alguna para liberar el lugar a otros pacientes.\n\n*Por favor, seleccioná una de las siguientes opciones o respondé a este mensaje. ¡Muchas gracias!*',
    buttons: ['Gestionar']
};

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function toTitle(str) {
    return String(str || '').toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase()).trim();
}

/** "CARRIZO CARRIZO, GABRIELA" -> "Gabriela" */
export function formatNombrePaciente(nombreSalus) {
    const raw = String(nombreSalus || '').trim();
    if (!raw) return 'Paciente';
    const nombres = raw.includes(',') ? raw.split(',')[1] : raw;
    return toTitle(nombres) || toTitle(raw);
}

/** "2026-09-29" -> "martes 29 de septiembre" (sin desfase de zona horaria) */
export function formatFechaTurno(isoDate) {
    const m = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return String(isoDate || '');
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

/** "08:15 a. m." -> "08:15 hs" ; "01:30 p. m." -> "13:30 hs" */
function formatHora(hora) {
    const m = String(hora || '').match(/(\d{1,2}):(\d{2})\s*([ap])?/i);
    if (!m) return String(hora || '').trim();
    let h = Number(m[1]);
    const ap = (m[3] || '').toLowerCase();
    if (ap === 'p' && h < 12) h += 12;
    if (ap === 'a' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m[2]} hs`;
}

/**
 * Arma las 3 variables de la plantilla a partir de un caso de Turnos Online.
 * IMPORTANTE: Meta rechaza parámetros con saltos de línea, tabs o 4+ espacios seguidos (error 132018),
 * por eso el detalle de turnos va en una sola línea.
 */
export function buildVariablesTurnosMismoDia(caso) {
    const turnos = (caso?.turnos || []).slice().sort((a, b) => formatHora(a.horaInicio).localeCompare(formatHora(b.horaInicio)));
    const fecha = formatFechaTurno(turnos[0]?.fechaTurno || caso?.fechasTurnos?.[0]);
    const profesional = toTitle(caso?.profesional || caso?.agenda || '');
    const horas = turnos.map(t => formatHora(t.horaInicio)).filter(Boolean);
    const listaHoras = horas.length > 1
        ? `${horas.slice(0, -1).join(', ')} y ${horas[horas.length - 1]}`
        : (horas[0] || '');
    const detalle = `${listaHoras}${profesional ? ` con ${profesional}` : ''}`;
    return [formatNombrePaciente(caso?.nombre), fecha, detalle].map(v => String(v).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim());
}

export function renderTemplateBody(body, variables) {
    return variables.reduce((txt, val, idx) => txt.replace(new RegExp(`\\{\\{${idx + 1}\\}\\}`, 'g'), val), body);
}

/**
 * Inicia una conversación nueva en el Contact Center enviando la plantilla oficial de Meta
 * `turnos_multiples_mismo_dia`. Funciona aunque la ventana de 24h esté cerrada.
 * - Envía por la línea contact_center
 * - Registra el mensaje en whatsapp_messages (aparece en la consola)
 * - Crea/actualiza la conversación asignada a la agente que envía (Mis Chats), bot pausado
 * - Marca el caso como "contactado"
 */
export async function sendTemplateTurnosMismoDia({ caso, variables, agente }) {
    if (!caso?.telefono) throw new Error('El paciente no posee número de teléfono registrado.');
    const phone = normalizeArgentinePhone(caso.telefono);
    if (!phone || phone.length !== 13) throw new Error(`Número de teléfono inválido: ${caso.telefono}`);

    const vars = (variables && variables.length === 3 ? variables : buildVariablesTurnosMismoDia(caso))
        .map(v => String(v || '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim());
    if (vars.some(v => !v)) throw new Error('Completá las 3 variables de la plantilla antes de enviar.');

    const now = new Date().toISOString();
    const agenteId = agente?.id || 'daniela';
    const agenteNombre = agente?.fullName || agente?.name || 'Contact Center';
    const agenteFirstName = String(agente?.shortName || agente?.name || agente?.fullName || '').trim().split(/\s+/)[0] || 'Contact Center';

    const tpl = META_TEMPLATE_TURNOS_MISMO_DIA;
    let metaResult;
    let templateUsedName = tpl.name;
    let resolvedText = renderTemplateBody(tpl.body, vars);

    const fallbackParam2 = `${agenteFirstName} del Contact Center (registramos más de un turno agendado para el ${vars[1]}: ${vars[2]}; por favor respondé a este mensaje confirmando a cuál vas a asistir para liberar el otro lugar)`
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
    const fallbackResolvedText = `Hola ${vars[0]} soy ${fallbackParam2} de *Sanatorio Argentino* , gracias por contactarnos. Te escribo por tu consulta realizada.`;

    // 1. Envío oficial a Meta (si turnos_duplicados falla con #131009 por tener botón FLOW en Meta, aplica fallback a ojonoscobran)
    try {
        metaResult = await sendMetaTemplate({
            to: phone,
            templateName: tpl.name,
            languageCode: tpl.language,
            components: [{ type: 'body', parameters: vars.map(text => ({ type: 'text', text })) }],
            lineId: 'contact_center',
            agentName: agenteFirstName
        });
        if (metaResult?.fallbackUsed) {
            templateUsedName = metaResult.fallbackUsed;
            resolvedText = fallbackResolvedText;
        }
    } catch (metaErr) {
        const msg = String(metaErr?.message || '');
        if (msg.includes('131009') || msg.toLowerCase().includes('sub_type invalid')) {
            console.warn('[turnosOnline] Plantilla turnos_duplicados rechazada por botón FLOW (#131009). Reintentando con plantilla aprobada ojonoscobran...');
            metaResult = await sendMetaTemplate({
                to: phone,
                templateName: 'ojonoscobran',
                languageCode: 'es_AR',
                components: [
                    {
                        type: 'body',
                        parameters: [
                            { type: 'text', text: vars[0] },
                            { type: 'text', text: fallbackParam2 }
                        ]
                    }
                ],
                lineId: 'contact_center',
                agentName: agenteFirstName
            });
            templateUsedName = 'ojonoscobran';
            resolvedText = fallbackResolvedText;
        } else {
            throw metaErr;
        }
    }

    const displayContent = `📋 [Plantilla Meta: ${templateUsedName}] ${resolvedText}`;

    // 2. Registrar en whatsapp_messages (línea Contact Center)
    const { error: msgErr } = await supabase.from('whatsapp_messages').insert({
        phone,
        direction: 'outgoing',
        content: displayContent,
        media_type: 'text',
        sender_name: agenteNombre,
        is_read: true,
        line_id: 'contact_center',
        raw_payload: {
            source: 'contact_center',
            line: 'contact_center',
            type: 'meta_template',
            templateName: templateUsedName,
            variables: vars,
            agent: agenteId,
            agentName: agenteNombre,
            origen: 'turnos_online_mismo_dia',
            casoKey: caso.key,
            metaResult
        }
    });
    if (msgErr) console.warn('[turnosOnline] No se pudo registrar el mensaje en whatsapp_messages:', msgErr.message);

    // 3. Crear o actualizar la conversación asignada exclusivamente a la agente que escribió (bot pausado)
    const convPayload = {
        status: 'abierto',
        assigned_agent_id: agenteId,
        assigned_agent_name: agenteNombre,
        assigned_at: now,
        bot_active: false,
        bot_stage: 'esperando_agente',
        dni: caso.dni ? String(caso.dni).trim() : null,
        nombre_completo: caso.nombre ? String(caso.nombre).trim() : null,
        telefono_contacto: phone,
        email: caso.email || null,
        motivo_consulta: caso.esMismoDia ? 'Turnos online múltiples el mismo día' : 'Auditoría de turnos online duplicados',
        last_message_text: displayContent,
        last_message_at: now,
        updated_at: now,
        resolution_reason: null,
        closed_at: null,
        closed_by_agent_id: null,
        closed_by_agent_name: null
    };

    const { data: existing } = await supabase
        .from('contact_center_conversations')
        .select('phone')
        .eq('phone', phone)
        .maybeSingle();

    const convRes = existing
        ? await supabase.from('contact_center_conversations').update(convPayload).eq('phone', phone)
        : await supabase.from('contact_center_conversations').insert({
            phone,
            ...convPayload,
            created_at: now
        });
    if (convRes.error) console.warn('[turnosOnline] No se pudo crear/actualizar la conversación:', convRes.error.message);

    // Si existía un registro previo con el teléfono sin normalizar (ej: 10 dígitos), sincronizar su asignación también
    const rawDigits = String(caso.telefono || '').replace(/\D/g, '');
    if (rawDigits && rawDigits !== phone) {
        await supabase
            .from('contact_center_conversations')
            .update({
                status: 'abierto',
                assigned_agent_id: agenteId,
                assigned_agent_name: agenteNombre,
                assigned_at: now,
                bot_active: false,
                bot_stage: 'esperando_agente',
                motivo_consulta: caso.esMismoDia ? 'Turnos online múltiples el mismo día' : 'Auditoría de turnos online duplicados',
                last_message_text: displayContent,
                updated_at: now
            })
            .eq('phone', rawDigits);
    }

    // 4. Marcar el caso como contactado con el nombre e ID real de la agente
    if (caso.key) {
        try {
            await saveGestionTurnoOnline({
                key: caso.key,
                estado: 'contactado',
                agenteId,
                agenteNombre,
                notas: `Plantilla Meta "${templateUsedName}" enviada por ${agenteNombre}`
            });
        } catch (e) {
            console.warn('Error auto-marcando contactado:', e.message);
        }
    }

    return { success: true, phone, variables: vars, metaResult, displayContent, agenteId, agenteNombre };
}

export const PLANTILLAS_TURNOS_ONLINE = [
    {
        id: 'aviso_duplicado_mismo_dia',
        titulo: 'Mismo día (Múltiples horarios)',
        descripcion: 'El paciente reservó más de un horario el mismo día con el profesional',
        generateText: (paciente, medico, turnos) => {
            const horas = turnos.map(t => t.horaInicio).filter(Boolean).join(', ');
            const fecha = turnos[0]?.fechaTurno || 'la fecha seleccionada';
            return `Hola ${paciente}, te escribimos de Sanatorio Argentino 👋. Registramos que reservaste ${turnos.length} turnos online para el día ${fecha} con el/la profesional ${medico} (horarios: ${horas}). ¿Nos confirmás cuál de los horarios vas a ocupar para liberar el otro a otros pacientes? Muchas gracias.`;
        }
    },
    {
        id: 'aviso_duplicado_dias_distintos',
        titulo: 'Diferentes fechas (Mismo médico)',
        descripcion: 'El paciente reservó turnos en diferentes fechas con el mismo médico',
        generateText: (paciente, medico, turnos) => {
            const detalleFechas = turnos.map(t => `${t.fechaTurno} a las ${t.horaInicio}`).join(' y ');
            return `Hola ${paciente}, te contactamos desde Sanatorio Argentino 👋. Vemos que tenés registrados varios turnos online con el/la Dr/a. ${medico} para: ${detalleFechas}. ¿Nos confirmás con cuál de las fechas vas a asistir para cancelar la otra y coordinar la atención? Saludos cordiales.`;
        }
    },
    {
        id: 'consulta_confirmacion_general',
        titulo: 'Confirmación y coordinación general',
        descripcion: 'Mensaje abierto para coordinar los turnos activos',
        generateText: (paciente, medico, turnos) => {
            return `Hola ${paciente}, desde el Contact Center de Sanatorio Argentino queremos ayudarte con tus reservas para ${medico}. Vemos ${turnos.length} turnos registrados a tu nombre. Por favor respondenos este mensaje para coordinar la fecha que te resulte más conveniente. ¡Muchas gracias!`;
        }
    }
];

function getSalusCandidateUrls() {
    const isLocal = typeof window !== 'undefined' && 
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    if (isLocal && window.location.protocol !== 'https:') {
        return ['http://127.0.0.1:3456/api/salus', 'http://localhost:3456/api/salus'];
    }
    return [];
}

/**
 * Sincroniza y reconcilia los turnos online directamente contra SALUS en tiempo real.
 * Ejecuta la comprobación activa de visitas existentes en el SQL Server de SALUS,
 * purga registros obsoletos/eliminados de Supabase y retorna la lista reconciliada.
 */
export async function syncTurnosOnlineWithSalus({ days = 1, date = null } = {}) {
    const candidateUrls = getSalusCandidateUrls();

    for (const baseUrl of candidateUrls) {
        try {
            let url = `${baseUrl}/turnos-online/duplicados?days=${days}`;
            if (date) url += `&date=${encodeURIComponent(date)}`;

            const response = await fetch(url, { headers: getAdmQuiHeaders(), signal: AbortSignal.timeout(8000) });
            if (response.ok) {
                const data = await response.json();
                if (data && (data.success || Array.isArray(data.casos))) {
                    console.log(`[turnosOnlineService] ✅ Sincronización en vivo con SALUS exitosa (${data.casos?.length || 0} casos) vía ${baseUrl}`);
                    return { success: true, ...data };
                }
            }
        } catch (_) {
            // Probar siguiente candidato si este no respondió
        }
    }

    console.warn('[turnosOnlineService] No se pudo conectar al sync-server en red LAN ni local, usando datos de Supabase.');
    // Fallback a consulta directa en Supabase
    return fetchTurnosOnlineDuplicados({ days, date, forceSync: false });
}

/**
 * Consulta los turnos online duplicados desde Supabase (100% HTTPS, sin errores de Mixed Content)
 * Si forceSync es true, intenta primero reconciliar en tiempo real con el servidor SALUS.
 */
export async function fetchTurnosOnlineDuplicados({ days = 1, date = null, forceSync = false } = {}) {
    if (forceSync) {
        return syncTurnosOnlineWithSalus({ days, date });
    }

    const cacheKey = `sa_turnos_online_cache_${days}_${date || 'all'}`;
    let lastError = null;

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            let query = supabase
                .from('contact_center_turnos_online')
                .select('*')
                .order('fecha_creacion', { ascending: false });

            if (date) {
                query = query.eq('fecha_creacion', date);
            } else if (days && Number(days) > 0) {
                const d = new Date();
                d.setDate(d.getDate() - Number(days));
                const minDate = d.toISOString().split('T')[0];
                query = query.gte('fecha_creacion', minDate);
            }

            const { data, error } = await query;

            if (error) {
                console.error(`Error consultando Supabase contact_center_turnos_online (intento ${attempt + 1}):`, error);
                lastError = error;
                await new Promise(r => setTimeout(r, 400));
                continue;
            }

            if (Array.isArray(data)) {
                const casos = data.map(row => ({
                    key: row.id,
                    dni: row.dni,
                    nombre: row.paciente_nombre,
                    telefono: row.telefono,
                    email: row.email,
                    idPersonal: row.prestador_id,
                    profesional: row.prestador_nombre,
                    idAgenda: row.agenda_id,
                    agenda: row.agenda_nombre,
                    turnos: row.turnos || [],
                    cantidadTurnos: row.total_turnos || (row.turnos?.length || 2),
                    esMismoDia: row.mismo_dia,
                    fechasTurnos: row.fechas_resumen ? row.fechas_resumen.split(', ') : [],
                    severidad: row.total_turnos >= 3 ? 'alta' : row.mismo_dia ? 'alta' : 'media',
                    gestion: {
                        estado: row.estado || 'pendiente',
                        agenteId: row.agente_id,
                        agenteNombre: row.agente_nombre,
                        notas: row.notas || '',
                        fechaContacto: row.fecha_contacto,
                        updatedAt: row.updated_at
                    }
                }));

                const totalTurnosAnalizados = casos.length * 15; // Estimado visual
                const totalPacientesConDuplicados = casos.length;
                const totalTurnosEnConflicto = casos.reduce((acc, c) => acc + c.cantidadTurnos, 0);
                const totalPendientes = casos.filter(c => c.gestion.estado === 'pendiente').length;
                const totalContactados = casos.filter(c => c.gestion.estado === 'contactado').length;
                const totalResueltos = casos.filter(c => c.gestion.estado === 'resuelto').length;

                const result = {
                    success: true,
                    rango: { days, targetDate: date },
                    stats: {
                        totalTurnosAnalizados,
                        totalPacientesConDuplicados,
                        totalTurnosEnConflicto,
                        totalPendientes,
                        totalContactados,
                        totalResueltos
                    },
                    casos
                };

                try {
                    if (typeof window !== 'undefined' && window.sessionStorage) {
                        window.sessionStorage.setItem(cacheKey, JSON.stringify(result));
                    }
                } catch (_) {}

                return result;
            }
        } catch (err) {
            lastError = err;
            console.warn(`⚠️ Consulta directa Supabase falló (intento ${attempt + 1}):`, err?.message || err);
            if (attempt === 0) {
                await new Promise(r => setTimeout(r, 450));
            }
        }
    }

    // Si hubo caída de red transitoria (ERR_CONNECTION_TIMED_OUT), recuperar caché de sesión si existe
    try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
            const cachedRaw = window.sessionStorage.getItem(cacheKey);
            if (cachedRaw) {
                const cached = JSON.parse(cachedRaw);
                if (cached && Array.isArray(cached.casos) && cached.casos.length > 0) {
                    console.info('[turnosOnlineService] Usando caché de sesión por timeout de red transitorio.');
                    return { ...cached, fromCache: true };
                }
            }
        }
    } catch (_) {}

    // Fallback opcional local
    const isLocal = typeof window !== 'undefined' && 
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    if (isLocal && window.location.protocol !== 'https:') {
        const fallbackUrls = ['http://127.0.0.1:3456/api/salus', 'http://localhost:3456/api/salus'];
        for (const base of fallbackUrls) {
            try {
                let url = `${base}/turnos-online/duplicados?days=${days}`;
                if (date) url += `&date=${encodeURIComponent(date)}`;
                const response = await fetch(url, { headers: getAdmQuiHeaders(), signal: AbortSignal.timeout(3000) });
                if (response.ok) return await response.json();
            } catch (_) {}
        }
    }

    return {
        success: false,
        error: lastError?.message || 'Timeout de conexión con la base de datos. Reintentando...',
        rango: { days, targetDate: date },
        stats: {
            totalTurnosAnalizados: 0,
            totalPacientesConDuplicados: 0,
            totalTurnosEnConflicto: 0,
            totalPendientes: 0,
            totalContactados: 0,
            totalResueltos: 0
        },
        casos: []
    };
}

/**
 * Guarda o actualiza el estado de gestión de un caso directamente en Supabase
 */
export async function saveGestionTurnoOnline({ key, estado, agenteId, agenteNombre, notas, templateName }) {
    if (!key) throw new Error('Key de caso requerida');

    const updatePayload = {
        estado: estado || 'pendiente',
        agente_id: agenteId || null,
        agente_nombre: agenteNombre || null,
        updated_at: new Date().toISOString()
    };

    if (notas !== undefined) {
        updatePayload.notas = notas;
    }
    if (estado === 'contactado') {
        updatePayload.fecha_contacto = new Date().toISOString();
    }

    const { error } = await supabase
        .from('contact_center_turnos_online')
        .update(updatePayload)
        .eq('id', key);

    if (error) {
        console.error('Error actualizando gestión en Supabase:', error);
        throw new Error(error.message);
    }

    // Si estamos en local, notificar también al daemon sync-server
    const isLocal = typeof window !== 'undefined' && 
        (window.location.protocol === 'http:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    if (isLocal) {
        try {
            await fetch('http://127.0.0.1:3456/api/salus/turnos-online/gestion', {
                method: 'POST',
                headers: getAdmQuiHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ key, estado, agenteId, agenteNombre, notas, templateName })
            });
        } catch {
            // Silencioso
        }
    }

    const returnGestion = {
        ...updatePayload,
        agenteId: updatePayload.agente_id,
        agenteNombre: updatePayload.agente_nombre,
        fechaContacto: updatePayload.fecha_contacto,
        updatedAt: updatePayload.updated_at
    };

    return { success: true, gestion: returnGestion };
}

/**
 * Envía un mensaje de WhatsApp directo al paciente
 */
export async function sendWhatsappAvisoTurno({ phone, text, agente, pacienteNombre, pacienteDni, casoKey }) {
    if (!phone) {
        throw new Error('El paciente no posee número de teléfono registrado.');
    }

    // normalizeArgentinePhone devuelve un string (ej: 5492645438114)
    const normalized = normalizeArgentinePhone(phone);
    if (!normalized || normalized.length < 10) {
        throw new Error(`Número de teléfono inválido: ${phone}`);
    }

    const recipientPhone = normalized.startsWith('549') ? normalized : `549${normalized}`;
    const now = new Date().toISOString();
    const agenteId = agente?.id || 'daniela';
    const agenteNombre = agente?.fullName || agente?.name || 'Contact Center';

    // 1. Envío vía BuilderBot / WhatsApp API (línea Contact Center)
    const result = await sendWhatsAppMessage({
        content: text,
        number: recipientPhone,
        lineId: 'contact_center'
    });

    // 2. Registro en tabla whatsapp_messages para trazabilidad y consola de Contact Center
    try {
        await supabase.from('whatsapp_messages').insert({
            phone: recipientPhone,
            direction: 'outgoing',
            content: text,
            media_type: 'text',
            sender_name: agenteNombre,
            is_read: true,
            line_id: 'contact_center',
            raw_payload: {
                source: 'contact_center',
                line: 'contact_center',
                tipo: 'aviso_turnos_online_duplicados',
                paciente: pacienteNombre,
                agent: agenteId,
                agentName: agenteNombre,
                casoKey
            }
        });
    } catch (err) {
        console.warn('⚠️ No se pudo registrar en whatsapp_messages:', err.message);
    }

    // 2b. Asociar conversación en contact_center_conversations a la agente emisora
    try {
        const convPayload = {
            status: 'abierto',
            assigned_agent_id: agenteId,
            assigned_agent_name: agenteNombre,
            assigned_at: now,
            bot_active: false,
            bot_stage: 'esperando_agente',
            dni: pacienteDni ? String(pacienteDni).trim() : undefined,
            nombre_completo: pacienteNombre ? String(pacienteNombre).trim() : undefined,
            telefono_contacto: recipientPhone,
            motivo_consulta: 'Auditoría de turnos online duplicados',
            last_message_text: text,
            last_message_at: now,
            updated_at: now,
            resolution_reason: null,
            closed_at: null,
            closed_by_agent_id: null,
            closed_by_agent_name: null
        };
        const { data: existing } = await supabase
            .from('contact_center_conversations')
            .select('phone')
            .eq('phone', recipientPhone)
            .maybeSingle();

        if (existing) {
            await supabase.from('contact_center_conversations').update(convPayload).eq('phone', recipientPhone);
        } else {
            await supabase.from('contact_center_conversations').insert({
                phone: recipientPhone,
                ...convPayload,
                created_at: now
            });
        }
    } catch (convErr) {
        console.warn('⚠️ No se pudo asociar conversación a la agente:', convErr.message);
    }

    // 3. Marcar automáticamente el caso como "contactado" en Supabase si se proveyó la clave
    if (casoKey) {
        try {
            await saveGestionTurnoOnline({
                key: casoKey,
                estado: 'contactado',
                agenteId,
                agenteNombre,
                notas: `WhatsApp enviado por ${agenteNombre}: "${text.substring(0, 80)}..."`
            });
        } catch (e) {
            console.warn('Error auto-marcando contactado:', e.message);
        }
    }

    return { ...result, phone: recipientPhone, displayContent: text, agenteId, agenteNombre };
}

/**
 * Consulta la Base de Datos Maestra de TODOS los Turnos Online realizados (public.cita_online_reservas)
 */
export async function fetchBaseDatosTurnosOnline({ days = 1, date = null, limit = 1500 } = {}) {
    try {
        let query = supabase
            .from('cita_online_reservas')
            .select('*')
            .order('fecha_creacion_salus', { ascending: false })
            .limit(limit);

        if (date) {
            query = query
                .gte('fecha_creacion_salus', `${date}T00:00:00`)
                .lte('fecha_creacion_salus', `${date}T23:59:59`);
        } else if (days && Number(days) > 0) {
            const d = new Date();
            d.setDate(d.getDate() - Number(days));
            const minIso = d.toISOString().split('T')[0] + 'T00:00:00';
            query = query.gte('fecha_creacion_salus', minIso);
        }

        const { data, error } = await query;
        if (error) {
            console.error('[turnosOnlineService] Error consultando cita_online_reservas:', error);
            return { success: false, error: error.message, reservas: [] };
        }

        return {
            success: true,
            reservas: Array.isArray(data) ? data : []
        };
    } catch (err) {
        console.error('[turnosOnlineService] Excepción consultando cita_online_reservas:', err);
        return { success: false, error: err?.message || 'Error consultando base de datos de turnos online', reservas: [] };
    }
}

/**
 * Envía (o reenvía) la plantilla oficial aprobada 'confirmacion_turno_online' (es_AR) para un turno online individual
 */
export async function sendConfirmacionTurnoOnlineIndividual(reserva) {
    if (!reserva?.telefono && !reserva?.whatsapp_phone) {
        throw new Error('El turno no posee número de teléfono registrado.');
    }

    const fechaHoraFormatted = reserva.fecha_turno
        ? `${reserva.fecha_turno.split('-').reverse().join('/')}${reserva.hora_inicio ? ` a las ${reserva.hora_inicio}` : ''}`
        : (reserva.fecha_hora_texto || '');

    const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
            action: 'notify_cita_online_reservation',
            lineId: 'contact_center',
            templateName: 'confirmacion_turno_online',
            languageCode: 'es_AR',
            phone: reserva.telefono || reserva.whatsapp_phone,
            nombre: formatNombrePaciente(reserva.paciente_nombre),
            dni: reserva.dni || '',
            email: reserva.email || '',
            fechaHora: fechaHoraFormatted,
            profesional: reserva.profesional || reserva.agenda || '',
            especialidad: reserva.especialidad || reserva.tipo_visita || '',
            obraSocial: reserva.obra_social || '',
            visitId: reserva.id_visita || null
        }
    });

    if (error) {
        throw new Error(error.message || 'Error invocando send-whatsapp');
    }
    if (data && data.success === false) {
        throw new Error(data.error || 'No se pudo enviar la plantilla confirmacion_turno_online');
    }

    return data;
}

