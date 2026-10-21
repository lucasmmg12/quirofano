/**
 * agentShiftService.js
 * Servicio de métricas de Final de Turno e Insights Diarios para las operadoras
 * del Contact Center de Sanatorio Argentino.
 * 
 * Extrae:
 *  1. Mensajes enviados en el día (whatsapp_messages)
 *  2. Conversaciones finalizadas en el día (contact_center_conversations)
 *  3. Tipos de consultas recibidas y gestionadas
 *  4. Turnos agendados en SALUS en tiempo real
 *  5. Insights inteligentes de desempeño, franja horaria pico y diagnóstico de turno
 */

import { supabase } from '../lib/supabase';
import { getSalusSyncBaseUrl } from './salusSync';

/**
 * Normaliza nombres de agente para matching flexible
 */
function normalizeAgentName(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

export const getLocalDateString = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const getUtcRangeForLocalDate = (dateStr) => {
    const cleanStr = dateStr || getLocalDateString();
    const [y, m, d] = cleanStr.split('-').map(Number);
    // San Juan / Argentina es UTC-3 (00:00:00 local = 03:00:00 UTC)
    const startDate = new Date(Date.UTC(y, m - 1, d, 3, 0, 0, 0));
    const nextD = new Date(Date.UTC(y, m - 1, d + 1, 2, 59, 59, 999));
    return {
        startIso: startDate.toISOString(),
        endIso: nextD.toISOString()
    };
};

async function fetchAllRows(buildQueryFn, pageSize = 1000, maxTotal = 6000) {
    let allRows = [];
    let from = 0;
    while (allRows.length < maxTotal) {
        const query = buildQueryFn().range(from, from + pageSize - 1);
        const { data, error } = await query;
        if (error) {
            console.warn('[agentShiftService] Error en fetchAllRows:', error);
            break;
        }
        if (!data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
    }
    return allRows;
}

/**
 * Obtiene los turnos creados hoy por agente en SALUS
 * 1. Intenta consulta directa al sync-server local si está disponible
 * 2. Fallback a Supabase app_config (cc_turnos_hoy)
 */
export async function fetchTurnosSalusHoy(dateStr = null) {
    const currentToday = getLocalDateString();
    const targetDate = dateStr || currentToday;
    const isToday = targetDate === currentToday;

    // 1. Consulta optimizada en batch a Supabase (claves hoy, específica de fecha y fallback general)
    try {
        const keysToTry = [
            `cc_turnos_contact_center_${targetDate}`,
            'cc_turnos_contact_center_hoy',
            'cc_turnos_hoy'
        ];

        const { data: rows, error } = await supabase
            .from('app_config')
            .select('key, value, updated_at')
            .in('key', keysToTry);

        if (!error && Array.isArray(rows) && rows.length > 0) {
            // Prioridad 1: Clave histórica exacta de la fecha solicitada
            const exactHist = rows.find(r => r.key === `cc_turnos_contact_center_${targetDate}`);
            if (exactHist?.value) {
                const parsed = typeof exactHist.value === 'string' ? JSON.parse(exactHist.value) : exactHist.value;
                if (parsed && Array.isArray(parsed.agentes)) {
                    return parsed;
                }
            }

            // Prioridad 2: Claves de hoy si la fecha solicitada es hoy (o si el payload coincide con targetDate)
            for (const k of ['cc_turnos_contact_center_hoy', 'cc_turnos_hoy']) {
                const row = rows.find(r => r.key === k);
                if (row?.value) {
                    const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
                    if (parsed && (!parsed.fecha || parsed.fecha === targetDate || isToday) && Array.isArray(parsed.agentes)) {
                        return parsed;
                    }
                }
            }
        }
    } catch (err) {
        console.warn(`[agentShiftService] Error leyendo turnos de Supabase app_config (${targetDate}):`, err);
    }

    // 2. Intento HTTP directo al sync-server (solo si estamos en red local / dev / localhost)
    const base = getSalusSyncBaseUrl();
    if (base) {
        try {
            const url = `${base}/api/salus/turnos-agentes-hoy?fecha=${targetDate}`;
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timeoutId = controller ? setTimeout(() => controller.abort(), 4000) : null;
            const res = await fetch(url, { signal: controller ? controller.signal : undefined });
            if (timeoutId) clearTimeout(timeoutId);
            if (res.ok) {
                const json = await res.json();
                if (json.success && json.data) {
                    // Guardar asíncronamente en Supabase para persistir en Vercel y otras PCs
                    try {
                        supabase.from('app_config').upsert({
                            key: `cc_turnos_contact_center_${targetDate}`,
                            value: JSON.stringify(json.data),
                            label: `Turnos y Cancelaciones Contact Center (${targetDate})`,
                            category: 'contact_center_diario',
                            updated_at: new Date().toISOString(),
                            updated_by: 'agentShiftService_auto_cache'
                        }).then(() => {});
                    } catch (_) {}
                    return json.data;
                }
            }
        } catch (_) {}
    }

    return { fecha: targetDate, total: 0, agentes: [] };
}

/**
 * Obtiene el resumen consolidado de Final de Turno de una operadora
 */
export async function getAgentDailyShiftMetrics({
    agentId,
    agentName,
    dateStr = null
}) {
    const targetDate = dateStr || getLocalDateString();
    const { startIso, endIso } = getUtcRangeForLocalDate(targetDate);

    const isTeamOverview = agentId === 'todos' || agentId === 'equipo' || agentId === 'all';
    const cleanFirstName = isTeamOverview ? 'Equipo' : (agentName || '').split(' ')[0].trim();
    const normalizedAgentName = normalizeAgentName(agentName);

    // Ejecución en paralelo de consultas clave con paginación para evitar el límite de 1000 filas de PostgREST
    const [
        turnosSalusData,
        outgoingMessages,
        incomingMessages,
        closedConversations,
        attendedConversations,
        createdConversations
    ] = await Promise.all([
        fetchTurnosSalusHoy(targetDate),

        // 1. Mensajes salientes enviados por la agente o equipo en la jornada (filtrado en DB + paginado)
        fetchAllRows(() => {
            let q = supabase
                .from('whatsapp_messages')
                .select('id, created_at, content, sender_name, phone, line_id')
                .gte('created_at', startIso)
                .lte('created_at', endIso)
                .eq('direction', 'outgoing');

            if (!isTeamOverview && cleanFirstName) {
                q = q.ilike('sender_name', `%${cleanFirstName}%`);
            } else if (isTeamOverview) {
                q = q.neq('sender_name', 'Bot Sanatorio');
            }
            return q;
        }),

        // 2. Mensajes entrantes recibidos en la jornada (para cuantificar ingresos reales de pacientes)
        fetchAllRows(() => {
            return supabase
                .from('whatsapp_messages')
                .select('id, created_at, phone, line_id')
                .gte('created_at', startIso)
                .lte('created_at', endIso)
                .eq('direction', 'incoming');
        }),

        // 3. Conversaciones cerradas/finalizadas en la jornada
        fetchAllRows(() => {
            return supabase
                .from('contact_center_conversations')
                .select('phone, nombre_completo, dni, closed_at, closed_by_agent_id, closed_by_agent_name, resolution_reason, motivo_consulta, ai_summary, tags, created_at, updated_at')
                .gte('closed_at', startIso)
                .lte('closed_at', endIso);
        }),

        // 4. Conversaciones asignadas o actualizadas donde intervino en la jornada
        fetchAllRows(() => {
            return supabase
                .from('contact_center_conversations')
                .select('phone, nombre_completo, dni, status, assigned_agent_id, assigned_agent_name, closed_by_agent_name, motivo_consulta, ai_summary, tags, updated_at, created_at, resolution_reason')
                .gte('updated_at', startIso)
                .lte('updated_at', endIso);
        }),

        // 5. Conversaciones creadas/iniciadas en la jornada (nuevos ingresos)
        fetchAllRows(() => {
            return supabase
                .from('contact_center_conversations')
                .select('phone, nombre_completo, dni, status, assigned_agent_id, assigned_agent_name, created_at')
                .gte('created_at', startIso)
                .lte('created_at', endIso);
        })
    ]);

    // Filtrar mensajes de esta agente específica (o de todo el equipo si es resumen del día)
    const agentOutgoingMessages = outgoingMessages.filter(msg => {
        if (isTeamOverview) {
            const sName = (msg.sender_name || '').toLowerCase();
            return msg.sender_name && sName !== 'bot sanatorio' && !sName.includes('bot');
        }
        const sender = normalizeAgentName(msg.sender_name);
        return (
            (cleanFirstName && sender.includes(normalizeAgentName(cleanFirstName))) ||
            (agentId && sender.includes(agentId.toLowerCase())) ||
            (normalizedAgentName && sender.includes(normalizedAgentName))
        );
    });

    const agentOutgoingPhonesSet = new Set(
        agentOutgoingMessages.map(m => m.phone).filter(Boolean)
    );

    // Desglose de mensajes por hora (para ritmo y curva de actividad)
    const hourlyDistribution = {};
    for (let h = 7; h <= 21; h++) {
        const hourLabel = `${String(h).padStart(2, '0')}:00`;
        hourlyDistribution[hourLabel] = 0;
    }

    let peakHour = null;
    let peakHourCount = 0;

    agentOutgoingMessages.forEach(msg => {
        const d = new Date(msg.created_at);
        const hour = d.getHours();
        const label = `${String(hour).padStart(2, '0')}:00`;
        hourlyDistribution[label] = (hourlyDistribution[label] || 0) + 1;
        if (hourlyDistribution[label] > peakHourCount) {
            peakHourCount = hourlyDistribution[label];
            peakHour = label;
        }
    });

    // Filtrar conversaciones finalizadas por esta agente (o todas si es resumen del día)
    const agentClosedConversations = (closedConversations || []).filter(conv => {
        if (isTeamOverview) return true;
        const closerName = normalizeAgentName(conv.closed_by_agent_name);
        const closerId = (conv.closed_by_agent_id || '').toLowerCase();
        const isClosedByAgent = (
            (cleanFirstName && closerName.includes(normalizeAgentName(cleanFirstName))) ||
            (agentId && closerId === agentId.toLowerCase()) ||
            (normalizedAgentName && closerName.includes(normalizedAgentName))
        );
        if (isClosedByAgent) return true;
        if (agentOutgoingPhonesSet.has(conv.phone)) return true;
        return false;
    });

    // Filtrar conversaciones gestionadas/atendidas hoy
    const agentAttendedConversations = (attendedConversations || []).filter(conv => {
        if (isTeamOverview) return true;
        if (agentOutgoingPhonesSet.has(conv.phone)) return true;
        const assignedName = normalizeAgentName(conv.assigned_agent_name);
        const assignedId = (conv.assigned_agent_id || '').toLowerCase();
        const closerName = normalizeAgentName(conv.closed_by_agent_name);
        return (
            (cleanFirstName && (assignedName.includes(normalizeAgentName(cleanFirstName))) || closerName.includes(normalizeAgentName(cleanFirstName))) ||
            (agentId && assignedId === agentId.toLowerCase()) ||
            (normalizedAgentName && (assignedName.includes(normalizedAgentName) || closerName.includes(normalizedAgentName)))
        );
    });

    // Turnos otorgados en SALUS (por esta operadora o por todo el equipo)
    let turnosSalusCount = 0;
    let turnosCanceladosCount = 0;
    let turnosSalusDetalle = [];
    let canceladosSalusDetalle = [];

    if (isTeamOverview) {
        turnosSalusCount = turnosSalusData?.total || 0;
        turnosCanceladosCount = turnosSalusData?.totalCancelados || 0;
        (turnosSalusData?.agentes || []).forEach(a => {
            if (Array.isArray(a.turnosDetalle)) turnosSalusDetalle.push(...a.turnosDetalle);
            if (Array.isArray(a.canceladosDetalle)) canceladosSalusDetalle.push(...a.canceladosDetalle);
        });
        // Ordenar por hora de creación descendente
        turnosSalusDetalle.sort((a, b) => (b.horaCreacion || '').localeCompare(a.horaCreacion || ''));
        canceladosSalusDetalle.sort((a, b) => (b.horaVisita || '').localeCompare(a.horaVisita || ''));
    } else {
        const agSalus = (turnosSalusData?.agentes || []).find(a => {
            const salusName = normalizeAgentName(a.name);
            const salusId = (a.id || '').toLowerCase();
            return (
                salusId === (agentId || '').toLowerCase() ||
                (cleanFirstName && salusName.includes(normalizeAgentName(cleanFirstName))) ||
                (normalizedAgentName && salusName.includes(normalizedAgentName))
            );
        });
        turnosSalusCount = agSalus ? agSalus.turnos : 0;
        turnosCanceladosCount = agSalus ? (agSalus.cancelados || 0) : 0;
        turnosSalusDetalle = agSalus?.turnosDetalle || [];
        canceladosSalusDetalle = agSalus?.canceladosDetalle || [];
    }

    // Categorización de tipos de consultas recibidas
    // Categorización de tipos de consultas recibidas (con detalle nominal de pacientes)
    const categorias = {
        turnosNuevos: { label: 'Turnos', count: 0, color: '#0284C7', icon: 'Calendar', conversaciones: [] },
        estudiosAutorizaciones: { label: 'Autorizaciones', count: 0, color: '#8B5CF6', icon: 'FileText', conversaciones: [] },
        reprogramacionesCancelaciones: { label: 'Reprogramaciones', count: 0, color: '#F59E0B', icon: 'RotateCcw', conversaciones: [] },
        consultasInformativas: { label: 'Consultas Generales', count: 0, color: '#10B981', icon: 'HelpCircle', conversaciones: [] },
        guardiaUrgencias: { label: 'Guardias', count: 0, color: '#EF4444', icon: 'AlertTriangle', conversaciones: [] },
        otros: { label: 'Otras Gestiones', count: 0, color: '#64748B', icon: 'MoreHorizontal', conversaciones: [] }
    };

    // Analizar consultas entre las gestionadas y finalizadas
    const uniqueConsultasMap = new Map();
    [...agentAttendedConversations, ...agentClosedConversations].forEach(c => {
        if (!uniqueConsultasMap.has(c.phone)) {
            uniqueConsultasMap.set(c.phone, c);
        }
    });

    // Resolver remitentes/nombres desde mensajes salientes/entrantes si faltan en conversaciones
    const phoneToSenderMap = {};
    (outgoingMessages || []).forEach(m => {
        if (m.phone && m.sender_name && !phoneToSenderMap[m.phone]) {
            const sn = m.sender_name.trim();
            if (!sn.toLowerCase().includes('bot') && sn !== 'Sanatorio Argentino') {
                phoneToSenderMap[m.phone] = sn;
            }
        }
    });

    uniqueConsultasMap.forEach(conv => {
        const text = `${conv.motivo_consulta || ''} ${conv.ai_summary?.tipo_tramite || ''} ${(conv.tags || []).join(' ')}`.toLowerCase();

        // Resolver el mejor nombre del paciente
        const aiName = conv.ai_summary?.paciente || conv.ai_summary?.nombre_paciente || conv.ai_summary?.titular?.nombre;
        let pacienteNombre = conv.nombre_completo?.trim();
        if (!pacienteNombre && aiName && typeof aiName === 'string' && aiName.trim().length > 1) {
            pacienteNombre = aiName.trim();
        }
        if (!pacienteNombre && phoneToSenderMap[conv.phone]) {
            pacienteNombre = phoneToSenderMap[conv.phone];
        }
        if (!pacienteNombre) {
            pacienteNombre = 'Paciente WhatsApp';
        }

        const consultaItem = {
            id: conv.id || conv.phone,
            phone: conv.phone,
            paciente: pacienteNombre,
            dni: conv.dni || conv.ai_summary?.dni || null,
            motivo: conv.motivo_consulta || conv.ai_summary?.tipo_tramite || conv.ai_summary?.motivo || 'Consulta general recibida por WhatsApp',
            resumen: conv.ai_summary?.resumen || conv.ai_summary?.motivo || conv.motivo_consulta || 'Sin detalle adicional',
            status: conv.status || (conv.closed_at ? 'cerrado' : 'abierto'),
            resolution_reason: conv.resolution_reason || null,
            closed_at: conv.closed_at || null,
            updated_at: conv.updated_at || conv.created_at || null,
            agente: conv.assigned_agent_name || conv.closed_by_agent_name || null,
            tags: Array.isArray(conv.tags) ? conv.tags : []
        };

        if (text.includes('reprogram') || text.includes('cancel')) {
            categorias.reprogramacionesCancelaciones.count++;
            categorias.reprogramacionesCancelaciones.conversaciones.push(consultaItem);
        } else if (text.includes('guardia') || text.includes('urgenc') || text.includes('mord')) {
            categorias.guardiaUrgencias.count++;
            categorias.guardiaUrgencias.conversaciones.push(consultaItem);
        } else if (text.includes('autoriz') || text.includes('estudio') || text.includes('ecograf') || text.includes('radiograf') || text.includes('laboratorio') || text.includes('orden')) {
            categorias.estudiosAutorizaciones.count++;
            categorias.estudiosAutorizaciones.conversaciones.push(consultaItem);
        } else if (text.includes('turno') || text.includes('cita') || text.includes('solicitud') || text.includes('medico') || text.includes('doctor')) {
            categorias.turnosNuevos.count++;
            categorias.turnosNuevos.conversaciones.push(consultaItem);
        } else if (text.includes('consulta') || text.includes('asesor') || text.includes('inform') || text.includes('horario') || text.includes('precio')) {
            categorias.consultasInformativas.count++;
            categorias.consultasInformativas.conversaciones.push(consultaItem);
        } else {
            categorias.otros.count++;
            categorias.otros.conversaciones.push(consultaItem);
        }
    });

    const totalConsultasClasificadas = Object.values(categorias).reduce((acc, cat) => acc + cat.count, 0);

    // Histograma de resolución del turno del agente (<5m, 5-30m, 30-60m, 1-4h, 4-12h, +24h)
    const agentResHistogramCounts = {
        under5m: 0,
        de5a30m: 0,
        de30a60m: 0,
        de1a4h: 0,
        de4a12h: 0,
        mas24h: 0
    };
    let agentArchivedOver24h = 0;

    // Desglose de motivos de resolución
    const resolucionesMap = {};
    agentClosedConversations.forEach(c => {
        const r = c.resolution_reason || 'Finalizado sin motivo especificado';
        resolucionesMap[r] = (resolucionesMap[r] || 0) + 1;

        const rLower = r.toLowerCase();
        const is24h = rLower.includes('24h') || rLower.includes('inactividad') || rLower.includes('barrido') || rLower.includes('expir');

        let totalMin = null;
        if (c.created_at && c.closed_at) {
            totalMin = Math.round((new Date(c.closed_at) - new Date(c.created_at)) / 60000);
        }

        if (is24h || (totalMin !== null && totalMin >= 1440)) {
            agentArchivedOver24h++;
            agentResHistogramCounts.mas24h++;
        } else if (totalMin !== null && totalMin >= 0) {
            if (totalMin < 5) agentResHistogramCounts.under5m++;
            else if (totalMin < 30) agentResHistogramCounts.de5a30m++;
            else if (totalMin < 60) agentResHistogramCounts.de30a60m++;
            else if (totalMin < 240) agentResHistogramCounts.de1a4h++;
            else if (totalMin < 720) agentResHistogramCounts.de4a12h++;
            else {
                agentArchivedOver24h++;
                agentResHistogramCounts.mas24h++;
            }
        } else {
            agentResHistogramCounts.de5a30m++;
        }
    });

    const agentResolutionHistogram = [
        { range: '< 5 min', count: agentResHistogramCounts.under5m, color: '#10B981' },
        { range: '5-30 min', count: agentResHistogramCounts.de5a30m, color: '#059669' },
        { range: '30-60 min', count: agentResHistogramCounts.de30a60m, color: '#0284C7' },
        { range: '1-4 hs', count: agentResHistogramCounts.de1a4h, color: '#F59E0B' },
        { range: '4-12 hs', count: agentResHistogramCounts.de4a12h, color: '#F97316' },
        { range: '+24 hs (Inactivos)', count: agentResHistogramCounts.mas24h, color: '#64748B' }
    ];

    // Chats actualmente asignados sin cerrar (para verificar si la bandeja queda limpia)
    const chatsActivosSinCerrar = agentAttendedConversations.filter(c => !['cerrado', 'archivado', 'finalizado', 'resuelto'].includes(c.status));

    // === CALCULO DE INGRESADOS VS ATENDIDOS DEL DIA ===
    let conversacionesIngresadas = 0;
    let conversacionesAtendidas = 0;
    let ingresadosHoyAtendidos = 0;
    let arrastreAnteriorAtendido = 0;
    let totalAtendidasJornada = 0;
    let conversacionesPendientes = 0;
    let tasaAtencion = 100;

    if (isTeamOverview) {
        // Enfoque Global del Equipo:
        // 1. Ingresados Hoy: Teléfonos únicos con mensajes entrantes de Contact Center + nuevas conversaciones creadas en la jornada
        const validIncoming = (incomingMessages || []).filter(m => !m.line_id || m.line_id === 'contact_center');
        const inPhonesSet = new Set(validIncoming.map(m => m.phone).filter(Boolean));
        const createdPhonesSet = new Set((createdConversations || []).map(c => c.phone).filter(Boolean));
        const ingresadosPhonesSet = new Set([...inPhonesSet, ...createdPhonesSet]);

        // 2. Atendidos: Teléfonos que recibieron respuesta humana (operadora) o fueron finalizados/cerrados en el día
        const humanOutPhonesSet = new Set(agentOutgoingMessages.map(m => m.phone).filter(Boolean));
        const closedPhonesSet = new Set((closedConversations || []).map(c => c.phone).filter(Boolean));
        const atendidosPhonesSet = new Set([...humanOutPhonesSet, ...closedPhonesSet]);

        conversacionesIngresadas = ingresadosPhonesSet.size;

        // Cuántos de los ingresados hoy fueron efectivamente atendidos hoy
        ingresadosPhonesSet.forEach(p => {
            if (atendidosPhonesSet.has(p)) ingresadosHoyAtendidos++;
        });

        // Cuántos de los atendidos hoy corresponden a arrastre de días anteriores (noche o días previos)
        atendidosPhonesSet.forEach(p => {
            if (!ingresadosPhonesSet.has(p)) arrastreAnteriorAtendido++;
        });

        totalAtendidasJornada = atendidosPhonesSet.size;
        conversacionesPendientes = Math.max(0, conversacionesIngresadas - ingresadosHoyAtendidos);
        tasaAtencion = conversacionesIngresadas > 0
            ? Math.min(100, Math.round((ingresadosHoyAtendidos / conversacionesIngresadas) * 100))
            : 100;
        conversacionesAtendidas = totalAtendidasJornada;
    } else {
        // Enfoque Operadora Individual:
        const validIncoming = (incomingMessages || []).filter(m => !m.line_id || m.line_id === 'contact_center');
        const inPhonesSet = new Set(validIncoming.map(m => m.phone).filter(Boolean));
        const createdPhonesSet = new Set((createdConversations || []).map(c => c.phone).filter(Boolean));
        const ingresadosHoyGeneralSet = new Set([...inPhonesSet, ...createdPhonesSet]);

        const assignedPhones = new Set((agentAttendedConversations || []).map(c => c.phone).filter(Boolean));
        const closedByAgentPhones = new Set(agentClosedConversations.map(c => c.phone).filter(Boolean));
        const agentHandledPhonesSet = new Set([...agentOutgoingPhonesSet, ...closedByAgentPhones, ...assignedPhones]);
        const agentAtendidasSet = new Set([...agentOutgoingPhonesSet, ...closedByAgentPhones]);

        // Teléfonos que ingresaron hoy en los que intervino o que le fueron asignados a la operadora
        const agentIngresadosHoySet = new Set();
        agentHandledPhonesSet.forEach(p => {
            if (ingresadosHoyGeneralSet.has(p)) {
                agentIngresadosHoySet.add(p);
            }
        });

        conversacionesIngresadas = agentIngresadosHoySet.size > 0 ? agentIngresadosHoySet.size : Math.max(assignedPhones.size, 1);

        agentIngresadosHoySet.forEach(p => {
            if (agentAtendidasSet.has(p)) ingresadosHoyAtendidos++;
        });

        agentAtendidasSet.forEach(p => {
            if (!agentIngresadosHoySet.has(p)) arrastreAnteriorAtendido++;
        });

        totalAtendidasJornada = agentAtendidasSet.size;
        conversacionesPendientes = Math.max(0, chatsActivosSinCerrar.length);
        tasaAtencion = conversacionesIngresadas > 0
            ? Math.min(100, Math.round((ingresadosHoyAtendidos / conversacionesIngresadas) * 100))
            : 100;
        conversacionesAtendidas = totalAtendidasJornada;
    }

    // === DISTRIBUCIÓN HORARIA DE INGRESOS DE PACIENTES (DEMANDA) ===
    // Identificar el primer mensaje entrante o momento de creación de cada paciente en la jornada
    const validIncomingForHourly = (incomingMessages || []).filter(m => !m.line_id || m.line_id === 'contact_center');
    const patientFirstSeenMap = new Map();

    validIncomingForHourly.forEach(m => {
        if (!m.phone) return;
        const t = new Date(m.created_at).getTime();
        if (!patientFirstSeenMap.has(m.phone) || t < patientFirstSeenMap.get(m.phone)) {
            patientFirstSeenMap.set(m.phone, t);
        }
    });

    (createdConversations || []).forEach(c => {
        if (!c.phone) return;
        const t = new Date(c.created_at).getTime();
        if (!patientFirstSeenMap.has(c.phone) || t < patientFirstSeenMap.get(c.phone)) {
            patientFirstSeenMap.set(c.phone, t);
        }
    });

    const hourlyIncomingDistribution = {};
    for (let h = 7; h <= 21; h++) {
        const hourLabel = `${String(h).padStart(2, '0')}:00`;
        hourlyIncomingDistribution[hourLabel] = 0;
    }

    let peakIncomingHour = null;
    let peakIncomingCount = 0;

    // Si es visión del equipo: todos los pacientes que escribieron hoy
    // Si es visión individual: pacientes que ingresaron hoy asignados o gestionados por la operadora
    const incomingPhonesToDistribute = isTeamOverview
        ? Array.from(patientFirstSeenMap.keys())
        : (typeof agentIngresadosHoySet !== 'undefined' && agentIngresadosHoySet && agentIngresadosHoySet.size > 0 
            ? Array.from(agentIngresadosHoySet) 
            : Array.from(patientFirstSeenMap.keys()));

    incomingPhonesToDistribute.forEach(phone => {
        const timestamp = patientFirstSeenMap.get(phone);
        if (!timestamp) return;
        const d = new Date(timestamp);
        const hour = d.getHours();
        const label = `${String(hour).padStart(2, '0')}:00`;
        if (hourlyIncomingDistribution[label] !== undefined) {
            hourlyIncomingDistribution[label] = (hourlyIncomingDistribution[label] || 0) + 1;
            if (hourlyIncomingDistribution[label] > peakIncomingCount) {
                peakIncomingCount = hourlyIncomingDistribution[label];
                peakIncomingHour = label;
            }
        }
    });

    // === GENERACIÓN DE SMART INSIGHTS ===
    const totalMensajes = agentOutgoingMessages.length;
    const totalFinalizadas = agentClosedConversations.length;
    const totalGestionadas = uniqueConsultasMap.size;

    // 1. Tasa resolutiva (%)
    const tasaResolucion = totalGestionadas > 0 
        ? Math.min(100, Math.round((totalFinalizadas / totalGestionadas) * 100)) 
        : 100;

    // 2. Promedio de mensajes por conversación finalizada
    const promMensajesPorChat = totalFinalizadas > 0 
        ? (totalMensajes / totalFinalizadas).toFixed(1) 
        : '0';

    // 3. Categoría predominante
    let maxCategoriaKey = 'turnosNuevos';
    let maxCategoriaCount = 0;
    Object.entries(categorias).forEach(([key, val]) => {
        if (val.count > maxCategoriaCount) {
            maxCategoriaCount = val.count;
            maxCategoriaKey = key;
        }
    });
    const categoriaPredominante = categorias[maxCategoriaKey];
    const pctCategoriaPredominante = totalConsultasClasificadas > 0 
        ? Math.round((maxCategoriaCount / totalConsultasClasificadas) * 100) 
        : 0;

    // 4. Diagnóstico cualitativo del turno
    let scoreNivel = 'Excelente';
    let scoreColor = '#10B981';
    let scoreDiagnostico = '';

    if (isTeamOverview) {
        scoreNivel = 'Operación Global del Día';
        scoreColor = '#003B71';
        scoreDiagnostico = `Balance diario del equipo: ${conversacionesIngresadas} consultas ingresadas hoy (${ingresadosHoyAtendidos} atendidas, ${conversacionesPendientes} pendientes de hoy) más ${arrastreAnteriorAtendido} casos de arrastre resueltos de días anteriores. Total atendidas en la jornada: ${totalAtendidasJornada} (${totalFinalizadas} cerradas). Se emitieron ${totalMensajes} mensajes y se agendaron ${turnosSalusCount} turnos en SALUS (${turnosCanceladosCount} cancelaciones procesadas).`;
    } else if (totalFinalizadas >= 40 || turnosSalusCount >= 20 || totalMensajes >= 150) {
        scoreNivel = 'Sobresaliente / Alto Impacto';
        scoreColor = '#059669';
        scoreDiagnostico = `Jornada de máxima productividad: ${conversacionesIngresadas} consultas ingresadas hoy (${ingresadosHoyAtendidos} atendidas de hoy + ${arrastreAnteriorAtendido} de arrastre previo = ${totalAtendidasJornada} atendidas, ${totalFinalizadas} cerradas). Mantuviste un ritmo de respuesta continuo con ${totalMensajes} mensajes y ${turnosSalusCount} turnos efectivos cargados en SALUS.`;
    } else if (totalFinalizadas >= 20 || turnosSalusCount >= 10 || totalMensajes >= 80) {
        scoreNivel = 'Muy Buena / Ritmo Estable';
        scoreColor = '#0284C7';
        scoreDiagnostico = `Turno fluido y ordenado: ${totalAtendidasJornada} consultas atendidas (${ingresadosHoyAtendidos} de hoy + ${arrastreAnteriorAtendido} de días previos, ${totalFinalizadas} resueltas). Tasa resolutiva del ${tasaResolucion}% y ${turnosSalusCount} turnos en SALUS agendados.`;
    } else {
        scoreNivel = 'Moderada / En Seguimiento';
        scoreColor = '#D97706';
        scoreDiagnostico = `Jornada con volumen balanceado: ${totalAtendidasJornada} consultas atendidas (${ingresadosHoyAtendidos} de hoy, ${arrastreAnteriorAtendido} de arrastre). Se registraron ${totalMensajes} mensajes y ${turnosSalusCount} turnos agendados.`;
    }

    const insights = [
        {
            id: 'pico_actividad',
            titulo: 'Franja Horaria Pico',
            valor: peakHour ? `${peakHour} hs` : 'Uniforme',
            descripcion: peakHourCount > 0 
                ? `Mayor concentración de respuestas con ${peakHourCount} mensajes emitidos en esa hora.` 
                : 'El flujo de respuestas se mantuvo homogéneo a lo largo del turno.',
            tipo: 'info',
            badge: 'Ritmo Horario'
        },
        {
            id: 'efectividad',
            titulo: 'Efectividad Resolutiva',
            valor: `${tasaResolucion}%`,
            descripcion: `${totalFinalizadas} de ${totalGestionadas} casos asignados fueron completamente resueltos y cerrados hoy.`,
            tipo: tasaResolucion >= 80 ? 'success' : 'warning',
            badge: 'Resolución'
        },
        {
            id: 'salus_conversion',
            titulo: 'Impacto Asistencial SALUS',
            valor: `${turnosSalusCount} Turnos`,
            descripcion: turnosSalusCount > 0 
                ? `Generaste ${turnosSalusCount} citas médicas confirmadas en el sistema SALUS durante tu horario.`
                : 'No se registraron turnos creados bajo tu usuario SALUS en el corte actual.',
            tipo: turnosSalusCount >= 10 ? 'success' : 'neutral',
            badge: 'Agenda SALUS'
        },
        {
            id: 'perfil_demanda',
            titulo: 'Predominio de Consultas',
            valor: categoriaPredominante ? categoriaPredominante.label.split(' ')[0] + ' (' + pctCategoriaPredominante + '%)' : 'Variado',
            descripcion: `El foco principal de los pacientes atendidos fue "${categoriaPredominante?.label || 'General'}" (${maxCategoriaCount} casos).`,
            tipo: 'neutral',
            badge: 'Tipología'
        },
        {
            id: 'estado_bandeja',
            titulo: 'Estado para Fin de Turno',
            valor: chatsActivosSinCerrar.length === 0 ? 'Bandeja Limpia ✨' : `${chatsActivosSinCerrar.length} Activos`,
            descripcion: chatsActivosSinCerrar.length === 0 
                ? '¡Excelente! No dejas conversaciones asignadas pendientes de respuesta.'
                : `Tienes ${chatsActivosSinCerrar.length} conversación(es) abierta(s). Recuerda transferirlas en el Pase de Guardia antes de retirarte.`,
            tipo: chatsActivosSinCerrar.length === 0 ? 'success' : 'alert',
            badge: 'Pase de Guardia'
        }
    ];

    return {
        fecha: targetDate,
        agente: {
            id: agentId,
            name: agentName,
            firstName: cleanFirstName
        },
        kpis: {
            conversacionesIngresadas,
            conversacionesAtendidas: totalAtendidasJornada,
            totalAtendidasJornada,
            ingresadosHoyAtendidos,
            arrastreAnteriorAtendido,
            conversacionesPendientes,
            tasaAtencion,
            mensajesEnviados: totalMensajes,
            conversacionesFinalizadas: totalFinalizadas,
            conversacionesGestionadas: totalGestionadas,
            turnosSalus: turnosSalusCount,
            turnosCancelados: turnosCanceladosCount,
            tasaResolucion,
            promMensajesPorChat,
            chatsPendientes: chatsActivosSinCerrar.length,
            archivedOver24h: agentArchivedOver24h
        },
        turnosSalusDetalle,
        canceladosSalusDetalle,
        resolutionHistogram: agentResolutionHistogram,
        hourlyDistribution,
        hourlyIncomingDistribution,
        peakIncomingHour,
        peakIncomingCount,
        categorias,
        totalConsultasClasificadas,
        resolucionesMap,
        score: {
            nivel: scoreNivel,
            color: scoreColor,
            diagnostico: scoreDiagnostico
        },
        insights
    };
}

/**
 * Mapea los turnos creados en SALUS con los mensajes y conversaciones de WhatsApp
 * utilizando el DNI del paciente como clave primordial (vital para turnos pedidos por familiares/madres/padres),
 * y secundariamente el teléfono si el DNI no arroja coincidencia directa.
 */
export async function mapTurnosWithWhatsApp(turnosList = [], targetDate = null) {
    if (!turnosList || turnosList.length === 0) return [];

    const familyKeywords = [
        'hijo', 'hija', 'hije', 'nene', 'nena', 'bebe', 'bebé', 'bebes',
        'mama', 'mamá', 'madre', 'papa', 'papá', 'padre', 'esposo', 'esposa',
        'marido', 'pareja', 'suegro', 'suegra', 'hermano', 'hermana',
        'sobrino', 'sobrina', 'nieto', 'nieta', 'para mi', 'para mí'
    ];

    const batchSize = 6;
    const mappedResults = [];

    for (let i = 0; i < turnosList.length; i += batchSize) {
        const batch = turnosList.slice(i, i + batchSize);
        const batchPromises = batch.map(async (turno) => {
            const rawDni = String(turno.dni || '').trim();
            const cleanDni = rawDni.replace(/\D/g, '');

            let matchFound = null;

            // 1. Búsqueda primordial por DNI en el contenido de los mensajes de WhatsApp
            if (cleanDni && cleanDni.length >= 6) {
                try {
                    const { data: msgs } = await supabase
                        .from('whatsapp_messages')
                        .select('phone, sender_name, content, created_at')
                        .ilike('content', `%${cleanDni}%`)
                        .order('created_at', { ascending: false })
                        .limit(1);

                    if (msgs && msgs.length > 0) {
                        const m = msgs[0];
                        matchFound = {
                            matchType: 'dni_message',
                            matchedPhone: m.phone,
                            matchedSender: m.sender_name || 'Paciente / Familiar',
                            matchedSnippet: m.content || '',
                            matchedAt: m.created_at
                        };
                    }
                } catch (e) {
                    console.warn(`[mapTurnosWithWhatsApp] Error buscando DNI ${cleanDni} en mensajes:`, e);
                }

                // 2. Si no encontró en whatsapp_messages, buscar en contact_center_conversations
                if (!matchFound) {
                    try {
                        const { data: convs } = await supabase
                            .from('contact_center_conversations')
                            .select('phone, contact_name, ai_summary, motivo_consulta, created_at')
                            .or(`dni.eq.${cleanDni},contact_name.ilike.%${cleanDni}%`)
                            .order('created_at', { ascending: false })
                            .limit(1);

                        if (convs && convs.length > 0) {
                            const c = convs[0];
                            matchFound = {
                                matchType: 'dni_conv',
                                matchedPhone: c.phone,
                                matchedSender: c.contact_name || 'Contacto WhatsApp',
                                matchedSnippet: c.motivo_consulta || c.ai_summary?.tipo_tramite || 'Turno solicitado',
                                matchedAt: c.created_at
                            };
                        }
                    } catch (_) {}
                }
            }

            // 3. Fallback: Búsqueda por Teléfono si no hubo coincidencia por DNI
            if (!matchFound) {
                const p1 = (turno.telefono1 || turno.telefono2 || '').replace(/\D/g, '').slice(-8);
                if (p1 && p1.length >= 7) {
                    try {
                        const { data: msgsPhone } = await supabase
                            .from('whatsapp_messages')
                            .select('phone, sender_name, content, created_at')
                            .ilike('phone', `%${p1}%`)
                            .order('created_at', { ascending: false })
                            .limit(1);

                        if (msgsPhone && msgsPhone.length > 0) {
                            const m = msgsPhone[0];
                            matchFound = {
                                matchType: 'phone',
                                matchedPhone: m.phone,
                                matchedSender: m.sender_name || 'Paciente',
                                matchedSnippet: m.content || '',
                                matchedAt: m.created_at
                            };
                        }
                    } catch (_) {}
                }
            }

            // 4. Determinar si es gestión de un familiar o tercero
            let isFamily = false;
            if (matchFound) {
                const snippetLower = (matchFound.matchedSnippet || '').toLowerCase();
                const hasFamilyKeyword = familyKeywords.some(kw => snippetLower.includes(kw));

                // Comparar nombre del paciente en SALUS vs nombre del remitente en WhatsApp
                const pacienteParts = (turno.paciente || '').toLowerCase().split(/[\s,]+/).filter(p => p.length > 2);
                const senderLower = (matchFound.matchedSender || '').toLowerCase();
                const senderHasPatientName = pacienteParts.some(part => senderLower.includes(part));

                if (hasFamilyKeyword || (!senderHasPatientName && senderLower !== 'paciente / familiar' && senderLower !== 'paciente' && senderLower !== 'desconocido')) {
                    isFamily = true;
                }
            }

            return {
                ...turno,
                matchType: matchFound ? matchFound.matchType : 'none',
                isFamilyBooking: isFamily,
                matchedPhone: matchFound ? matchFound.matchedPhone : null,
                matchedSender: matchFound ? matchFound.matchedSender : null,
                matchedSnippet: matchFound ? matchFound.matchedSnippet : null,
                matchedAt: matchFound ? matchFound.matchedAt : null
            };
        });

        const batchResolved = await Promise.all(batchPromises);
        mappedResults.push(...batchResolved);
    }

    return mappedResults;
}

/**
 * Genera el texto formateado del Reporte de Final de Turno para copiar al portapapeles
 */
export function buildShiftSummaryClipboardText(metrics) {
    if (!metrics) return '';
    const { agente, fecha, kpis, score, categorias } = metrics;

    const fechaFormat = new Date(fecha + 'T12:00:00').toLocaleDateString('es-AR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });

    const lines = [
        `📊 *INFORME DE FINAL DE TURNO — CONTACT CENTER*`,
        `🏥 *Sanatorio Argentino*`,
        `👤 *Operadora:* ${agente.name}`,
        `📅 *Fecha:* ${fechaFormat}`,
        ``,
        `📈 *MÉTRICAS PRINCIPALES DEL DÍA:*`,
        `• 📥 *Nuevas Ingresadas Hoy:* ${kpis.conversacionesIngresadas || 0}`,
        `• 🔄 *Arrastre Días Previos (Atendidas hoy):* ${kpis.arrastreAnteriorAtendido || 0}`,
        `• 🎧 *Total Atendidas en la Jornada:* ${kpis.totalAtendidasJornada || kpis.conversacionesAtendidas || 0} (${kpis.ingresadosHoyAtendidos || 0} de hoy + ${kpis.arrastreAnteriorAtendido || 0} arrastre)`,
        `• 📊 *Tasa de Atención de Hoy:* ${kpis.tasaAtencion || 100}% (${kpis.ingresadosHoyAtendidos || 0} de ${kpis.conversacionesIngresadas || 0})`,
        `• ⏳ *Pendientes de Hoy:* ${kpis.conversacionesPendientes || 0}`,
        `• 💬 *Mensajes Enviados:* ${kpis.mensajesEnviados}`,
        `• ✅ *Conversaciones Finalizadas:* ${kpis.conversacionesFinalizadas}`,
        `• 🩺 *Turnos Agendados en SALUS:* ${kpis.turnosSalus}`,
        `• 🎯 *Efectividad Resolutiva:* ${kpis.tasaResolucion}%`,
        `• 💬 *Promedio de Mensajes/Caso:* ${kpis.promMensajesPorChat}`,
        ``,
        `📋 *TIPOS DE CONSULTAS GESTIONADAS:*`,
        `• 🩺 Turnos: ${categorias.turnosNuevos.count}`,
        `• 📄 Autorizaciones: ${categorias.estudiosAutorizaciones.count}`,
        `• 🔄 Reprogramaciones: ${categorias.reprogramacionesCancelaciones.count}`,
        `• ℹ️ Consultas Generales: ${categorias.consultasInformativas.count}`,
        `• 🚨 Guardias: ${categorias.guardiaUrgencias.count}`,
        `• 📁 Otras Gestiones: ${categorias.otros?.count || 0}`,
        ``,
        `💡 *DIAGNÓSTICO DEL TURNO:*`,
        `✨ *Desempeño:* ${score.nivel}`,
        `📝 ${score.diagnostico}`,
        ``,
        `Generado automáticamente desde la Consola de Contact Center.`
    ];

    return lines.join('\n');
}
