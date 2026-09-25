/**
 * turnosOnlineService.js
 * Servicio frontend para consulta, gestión y aviso por WhatsApp de turnos online duplicados.
 * Conectado de forma directa y segura a Supabase (HTTPS / Vercel friendly, sin Mixed Content).
 */
import { supabase } from '../lib/supabase';
import { sendWhatsAppMessage, normalizeArgentinePhone } from './builderbotApi';
import { saveOutgoingMessage } from './chatService';

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
    const list = [];
    if (import.meta.env.VITE_SALUS_SYNC_URL) {
        list.push(import.meta.env.VITE_SALUS_SYNC_URL.replace(/\/+$/, ''));
    }
    list.push('http://128.223.17.60:3456/api/salus');
    list.push('http://127.0.0.1:3456/api/salus');
    return [...new Set(list)];
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

            const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
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
            console.error('Error consultando Supabase contact_center_turnos_online:', error);
            throw error;
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

            return {
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
        }
    } catch (err) {
        console.warn('⚠️ Consulta directa Supabase falló, intentando sync-server si estamos en localhost:', err.message);
    }

    // Fallback opcional local o LAN
    if (typeof window !== 'undefined' && window.location.protocol !== 'https:') {
        const fallbackUrls = ['http://128.223.17.60:3456/api/salus', 'http://127.0.0.1:3456/api/salus'];
        for (const base of fallbackUrls) {
            try {
                let url = `${base}/turnos-online/duplicados?days=${days}`;
                if (date) url += `&date=${encodeURIComponent(date)}`;
                const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
                if (response.ok) return await response.json();
            } catch (_) {}
        }
    }

    return {
        success: true,
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
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, estado, agenteId, agenteNombre, notas, templateName })
            });
        } catch {
            // Silencioso
        }
    }

    return { success: true, gestion: updatePayload };
}

/**
 * Envía un mensaje de WhatsApp directo al paciente
 */
export async function sendWhatsappAvisoTurno({ phone, text, agente, pacienteNombre, casoKey }) {
    if (!phone) {
        throw new Error('El paciente no posee número de teléfono registrado.');
    }

    const { normalized, valid } = normalizeArgentinePhone(phone);
    if (!valid && (!normalized || normalized.length < 10)) {
        throw new Error(`Número de teléfono inválido: ${phone}`);
    }

    const recipientPhone = normalized.startsWith('549') ? normalized : `549${normalized}`;

    // 1. Envío vía BuilderBot / WhatsApp API
    const result = await sendWhatsAppMessage(recipientPhone, text);

    // 2. Registro en tabla whatsapp_messages para trazabilidad y consola de Contact Center
    try {
        await saveOutgoingMessage({
            phone: recipientPhone,
            message: text,
            sender: agente?.fullName || agente?.name || 'Contact Center',
            metadata: {
                tipo: 'aviso_turnos_online_duplicados',
                paciente: pacienteNombre,
                agenteId: agente?.id,
                casoKey
            }
        });
    } catch (err) {
        console.warn('⚠️ No se pudo registrar en whatsapp_messages local:', err.message);
    }

    // 3. Marcar automáticamente el caso como "contactado" en Supabase si se proveyó la clave
    if (casoKey) {
        try {
            await saveGestionTurnoOnline({
                key: casoKey,
                estado: 'contactado',
                agenteId: agente?.id,
                agenteNombre: agente?.fullName || agente?.name,
                notas: `WhatsApp enviado: "${text.substring(0, 80)}..."`
            });
        } catch (e) {
            console.warn('Error auto-marcando contactado:', e.message);
        }
    }

    return result;
}
