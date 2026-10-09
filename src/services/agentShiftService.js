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

/**
 * Obtiene los turnos creados hoy por agente en SALUS
 * 1. Intenta consulta directa al sync-server local si está disponible
 * 2. Fallback a Supabase app_config (cc_turnos_hoy)
 */
export async function fetchTurnosSalusHoy(dateStr = null) {
    const today = dateStr || new Date().toISOString().substring(0, 10);

    // 1. Intento HTTP directo al sync-server (si estamos en red local / localhost)
    const base = getSalusSyncBaseUrl();
    if (base) {
        try {
            const url = `${base}/api/salus/turnos-agentes-hoy?fecha=${today}`;
            const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
            if (res.ok) {
                const json = await res.json();
                if (json.success && json.data) {
                    return json.data;
                }
            }
        } catch (_) {}
    }

    // 2. Consulta a Supabase app_config
    try {
        const { data: row } = await supabase
            .from('app_config')
            .select('value, updated_at')
            .eq('key', 'cc_turnos_hoy')
            .maybeSingle();

        if (row?.value) {
            const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
            return parsed;
        }
    } catch (err) {
        console.warn('[agentShiftService] Error leyendo app_config cc_turnos_hoy:', err);
    }

    return { fecha: today, total: 0, agentes: [] };
}

/**
 * Obtiene el resumen consolidado de Final de Turno de una operadora
 */
export async function getAgentDailyShiftMetrics({
    agentId,
    agentName,
    dateStr = null
}) {
    const targetDate = dateStr || new Date().toISOString().substring(0, 10); // YYYY-MM-DD
    const startIso = `${targetDate}T00:00:00`;
    const endIso = `${targetDate}T23:59:59.999`;

    const cleanFirstName = (agentName || '').split(' ')[0].trim();
    const normalizedAgentName = normalizeAgentName(agentName);

    // Ejecución en paralelo de consultas clave
    const [
        turnosSalusData,
        outgoingMessagesRes,
        closedConversationsRes,
        attendedConversationsRes
    ] = await Promise.all([
        fetchTurnosSalusHoy(targetDate),

        // 1. Mensajes salientes enviados por la agente hoy
        supabase
            .from('whatsapp_messages')
            .select('id, created_at, content, sender_name, phone')
            .gte('created_at', startIso)
            .lte('created_at', endIso)
            .eq('direction', 'outgoing'),

        // 2. Conversaciones cerradas/finalizadas hoy por la agente
        supabase
            .from('contact_center_conversations')
            .select('phone, closed_at, closed_by_agent_id, closed_by_agent_name, resolution_reason, motivo_consulta, ai_summary, tags')
            .gte('closed_at', startIso)
            .lte('closed_at', endIso),

        // 3. Conversaciones asignadas o actualizadas donde intervino la agente hoy
        supabase
            .from('contact_center_conversations')
            .select('phone, status, assigned_agent_id, assigned_agent_name, closed_by_agent_name, motivo_consulta, ai_summary, tags, updated_at, resolution_reason')
            .gte('updated_at', startIso)
            .lte('updated_at', endIso)
    ]);

    // Filtrar mensajes de esta agente específica
    const agentOutgoingMessages = (outgoingMessagesRes.data || []).filter(msg => {
        const sender = normalizeAgentName(msg.sender_name);
        return (
            (cleanFirstName && sender.includes(normalizeAgentName(cleanFirstName))) ||
            (agentId && sender.includes(agentId.toLowerCase())) ||
            (normalizedAgentName && sender.includes(normalizedAgentName))
        );
    });

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

    // Filtrar conversaciones finalizadas por esta agente
    const agentClosedConversations = (closedConversationsRes.data || []).filter(conv => {
        const closerName = normalizeAgentName(conv.closed_by_agent_name);
        const closerId = (conv.closed_by_agent_id || '').toLowerCase();
        return (
            (cleanFirstName && closerName.includes(normalizeAgentName(cleanFirstName))) ||
            (agentId && closerId === agentId.toLowerCase()) ||
            (normalizedAgentName && closerName.includes(normalizedAgentName))
        );
    });

    // Filtrar conversaciones gestionadas/atendidas hoy
    const agentAttendedConversations = (attendedConversationsRes.data || []).filter(conv => {
        const assignedName = normalizeAgentName(conv.assigned_agent_name);
        const assignedId = (conv.assigned_agent_id || '').toLowerCase();
        const closerName = normalizeAgentName(conv.closed_by_agent_name);
        return (
            (cleanFirstName && (assignedName.includes(normalizeAgentName(cleanFirstName)) || closerName.includes(normalizeAgentName(cleanFirstName)))) ||
            (agentId && assignedId === agentId.toLowerCase()) ||
            (normalizedAgentName && (assignedName.includes(normalizedAgentName) || closerName.includes(normalizedAgentName)))
        );
    });

    // Turnos otorgados en SALUS por esta operadora
    const agSalus = (turnosSalusData?.agentes || []).find(a => {
        const salusName = normalizeAgentName(a.name);
        const salusId = (a.id || '').toLowerCase();
        return (
            salusId === (agentId || '').toLowerCase() ||
            (cleanFirstName && salusName.includes(normalizeAgentName(cleanFirstName))) ||
            (normalizedAgentName && salusName.includes(normalizedAgentName))
        );
    });
    const turnosSalusCount = agSalus ? agSalus.turnos : 0;

    // Categorización de tipos de consultas recibidas
    const categorias = {
        turnosNuevos: { label: 'Turnos Nuevos y Citas Médicas', count: 0, color: '#0284C7', icon: 'Calendar' },
        estudiosAutorizaciones: { label: 'Estudios y Autorizaciones', count: 0, color: '#8B5CF6', icon: 'FileText' },
        reprogramacionesCancelaciones: { label: 'Reprogramación y Cancelación', count: 0, color: '#F59E0B', icon: 'RotateCcw' },
        consultasInformativas: { label: 'Consultas Generales y Asesoría', count: 0, color: '#10B981', icon: 'HelpCircle' },
        guardiaUrgencias: { label: 'Guardia y Urgencias', count: 0, color: '#EF4444', icon: 'AlertTriangle' },
        otros: { label: 'Otras Gestiones', count: 0, color: '#64748B', icon: 'MoreHorizontal' }
    };

    // Analizar consultas entre las gestionadas y finalizadas
    const uniqueConsultasMap = new Map();
    [...agentAttendedConversations, ...agentClosedConversations].forEach(c => {
        if (!uniqueConsultasMap.has(c.phone)) {
            uniqueConsultasMap.set(c.phone, c);
        }
    });

    uniqueConsultasMap.forEach(conv => {
        const text = `${conv.motivo_consulta || ''} ${conv.ai_summary?.tipo_tramite || ''} ${(conv.tags || []).join(' ')}`.toLowerCase();

        if (text.includes('reprogram') || text.includes('cancel')) {
            categorias.reprogramacionesCancelaciones.count++;
        } else if (text.includes('guardia') || text.includes('urgenc') || text.includes('mord')) {
            categorias.guardiaUrgencias.count++;
        } else if (text.includes('autoriz') || text.includes('estudio') || text.includes('ecograf') || text.includes('radiograf') || text.includes('laboratorio') || text.includes('orden')) {
            categorias.estudiosAutorizaciones.count++;
        } else if (text.includes('turno') || text.includes('cita') || text.includes('solicitud') || text.includes('medico') || text.includes('doctor')) {
            categorias.turnosNuevos.count++;
        } else if (text.includes('consulta') || text.includes('asesor') || text.includes('inform') || text.includes('horario') || text.includes('precio')) {
            categorias.consultasInformativas.count++;
        } else {
            categorias.otros.count++;
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
    const chatsActivosSinCerrar = agentAttendedConversations.filter(c => c.status !== 'cerrado' && c.status !== 'archivado');

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

    if (totalFinalizadas >= 40 || turnosSalusCount >= 20 || totalMensajes >= 150) {
        scoreNivel = 'Sobresaliente / Alto Impacto';
        scoreColor = '#059669';
        scoreDiagnostico = `Jornada de máxima productividad. Mantuviste un ritmo de respuesta continuo con ${totalMensajes} mensajes y un volumen destacado de ${turnosSalusCount} turnos efectivos cargados en SALUS.`;
    } else if (totalFinalizadas >= 20 || turnosSalusCount >= 10 || totalMensajes >= 80) {
        scoreNivel = 'Muy Buena / Ritmo Estable';
        scoreColor = '#0284C7';
        scoreDiagnostico = `Turno fluido y ordenado. Lograste resolver el ${tasaResolucion}% de las gestiones tomadas, cerrando ${totalFinalizadas} conversaciones sin acumular demoras críticas.`;
    } else {
        scoreNivel = 'Moderada / En Seguimiento';
        scoreColor = '#D97706';
        scoreDiagnostico = `Jornada con volumen balanceado o enfoque en gestiones complejas. Se registraron ${totalMensajes} mensajes y ${turnosSalusCount} turnos agendados.`;
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
            mensajesEnviados: totalMensajes,
            conversacionesFinalizadas: totalFinalizadas,
            conversacionesGestionadas: totalGestionadas,
            turnosSalus: turnosSalusCount,
            tasaResolucion,
            promMensajesPorChat,
            chatsPendientes: chatsActivosSinCerrar.length,
            archivedOver24h: agentArchivedOver24h
        },
        turnosSalusDetalle: agSalus?.turnosDetalle || [],
        resolutionHistogram: agentResolutionHistogram,
        hourlyDistribution,
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
        `• 💬 *Mensajes Enviados:* ${kpis.mensajesEnviados}`,
        `• ✅ *Conversaciones Finalizadas:* ${kpis.conversacionesFinalizadas}`,
        `• 🩺 *Turnos Agendados en SALUS:* ${kpis.turnosSalus}`,
        `• 🎯 *Efectividad Resolutiva:* ${kpis.tasaResolucion}% (${kpis.conversacionesFinalizadas}/${kpis.conversacionesGestionadas} gestionadas)`,
        `• 💬 *Promedio de Mensajes/Caso:* ${kpis.promMensajesPorChat}`,
        `• 📥 *Chats Asignados Pendientes:* ${kpis.chatsPendientes}`,
        ``,
        `📋 *TIPOS DE CONSULTAS GESTIONADAS:*`,
        `• 🩺 Turnos Nuevos y Citas: ${categorias.turnosNuevos.count}`,
        `• 📄 Estudios y Autorizaciones: ${categorias.estudiosAutorizaciones.count}`,
        `• 🔄 Reprogramaciones y Cancelaciones: ${categorias.reprogramacionesCancelaciones.count}`,
        `• ℹ️ Consultas Generales: ${categorias.consultasInformativas.count}`,
        `• 🚨 Guardia y Urgencias: ${categorias.guardiaUrgencias.count}`,
        ``,
        `💡 *DIAGNÓSTICO DEL TURNO:*`,
        `✨ *Desempeño:* ${score.nivel}`,
        `📝 ${score.diagnostico}`,
        ``,
        `Generado automáticamente desde la Consola de Contact Center.`
    ];

    return lines.join('\n');
}
