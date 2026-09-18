/**
 * turnosOnlineService.js
 * Servicio frontend para consulta, gestión y aviso por WhatsApp de turnos online duplicados.
 */
import { sendWhatsAppMessage, normalizeArgentinePhone } from './builderbotApi';
import { saveOutgoingMessage } from './chatService';

const SYNC_SERVER_URL = `http://${window.location.hostname}:3456`;

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

/**
 * Consulta los turnos online duplicados desde el sync-server
 */
export async function fetchTurnosOnlineDuplicados({ days = 1, date = null } = {}) {
    let url = `${SYNC_SERVER_URL}/api/salus/turnos-online/duplicados?days=${days}`;
    if (date) {
        url += `&date=${encodeURIComponent(date)}`;
    }

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Error en servidor sync (${response.status}): ${response.statusText}`);
    }
    return await response.json();
}

/**
 * Guarda o actualiza el estado de gestión de un caso
 */
export async function saveGestionTurnoOnline({ key, estado, agenteId, agenteNombre, notas, templateName }) {
    const response = await fetch(`${SYNC_SERVER_URL}/api/salus/turnos-online/gestion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, estado, agenteId, agenteNombre, notas, templateName })
    });

    if (!response.ok) {
        throw new Error(`Error guardando gestión (${response.status})`);
    }
    return await response.json();
}

/**
 * Envía un mensaje de WhatsApp directo al paciente
 */
export async function sendWhatsappAvisoTurno({ phone, text, agente, pacienteNombre }) {
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
                agenteId: agente?.id
            }
        });
    } catch (err) {
        console.warn('⚠️ No se pudo registrar en whatsapp_messages local:', err.message);
    }

    return result;
}
