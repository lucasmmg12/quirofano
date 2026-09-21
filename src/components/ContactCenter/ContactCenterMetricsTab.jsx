import React, { useState, useEffect, useMemo } from 'react';
import { 
    BarChart3, Users, MessageSquare, Bot, RefreshCw, CheckCircle2, 
    Sparkles, Activity, Calendar, ArrowUpRight, ArrowDownLeft, Send, 
    Inbox, Stethoscope, CalendarCheck, Clock, FileCheck, ShieldAlert,
    ChevronRight, ChevronDown, ChevronUp, Check, AlertCircle, AlertTriangle, 
    FileText, HelpCircle, PhoneCall, DollarSign, TrendingUp, X, 
    Calculator, Info, ShieldCheck, Zap, Award
} from 'lucide-react';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    BarChart,
    Bar,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    Legend,
    Cell
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { CONTACT_CENTER_AGENTS, isClosedOrArchived } from '../../services/contactCenterService';

const COSTO_POR_MENSAJE_USD = 0.026; // $0.026 USD por mensaje enviado a partir del 1.001
const MENSAJES_GRATIS_MENSUALES = 1000; // Primeros 1.000 mensajes salientes sin costo (Meta Free Tier)
const COTIZACION_DOLAR_REF = 1380; // Cotización ARS referencial editable

const MOTIVOS_FINALIZACION_CATALOGO = [
    { key: 'Turno Otorgado con Éxito', label: 'Turno Otorgado con Éxito', icon: CheckCircle2, color: '#059669', bg: '#ECFDF5' },
    { key: 'Cancelación / Reprogramación Confirmada', label: 'Cancelación / Reprogramación Confirmada', icon: CalendarCheck, color: '#0284C7', bg: '#F0F9FF' },
    { key: 'Estudio / Autorización Tramitada', label: 'Estudio / Autorización Tramitada', icon: FileCheck, color: '#8B5CF6', bg: '#F5F3FF' },
    { key: 'Información Brindada / Consulta Respondida', label: 'Información Brindada / Consulta Respondida', icon: HelpCircle, color: '#D97706', bg: '#FFFBEB' },
    { key: 'Derivado a Guardia / Sector', label: 'Derivado a Guardia / Sector Específico', icon: ShieldAlert, color: '#DC2626', bg: '#FEF2F2' },
    { key: 'Paciente No Responde', label: 'Paciente No Responde (Time-out)', icon: Clock, color: '#64748B', bg: '#F8FAFC' },
    { key: 'Otro / Aclaración en Nota', label: 'Otro / Resuelto Interno', icon: FileText, color: '#475569', bg: '#F1F5F9' }
];

const DIAS_SEMANA_NOMBRES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export default function ContactCenterMetricsTab({ addToast }) {
    const [loading, setLoading] = useState(true);
    
    // Filtros temporales requeridos: este_mes, mes_pasado, personalizado, hoy, semana
    const [timeRange, setTimeRange] = useState('this_month');
    const [customStartDate, setCustomStartDate] = useState(() => {
        const d = new Date();
        d.setDate(1);
        return d.toISOString().split('T')[0];
    });
    const [customEndDate, setCustomEndDate] = useState(() => {
        return new Date().toISOString().split('T')[0];
    });

    // Control de Modal de Costos de WhatsApp
    const [costModalOpen, setCostModalOpen] = useState(false);
    const [arsRate, setArsRate] = useState(COTIZACION_DOLAR_REF);

    // Acordeón de Agentes desplegables
    const [expandedAgents, setExpandedAgents] = useState({});

    const toggleAgentExpanded = (agentId) => {
        setExpandedAgents(prev => ({
            ...prev,
            [agentId]: !prev[agentId]
        }));
    };

    // Estado principal de métricas procesadas
    const [metrics, setMetrics] = useState({
        totalOutgoing: 0,
        agentMessages: 0,
        botMessages: 0,
        totalIncoming: 0,
        totalConversations: 0,
        closedConversationsCount: 0,
        activeConversationsCount: 0,
        byResolutionReason: {},
        firstMessageChoices: {
            solicitar_turno: 0,
            reprogramar_turno: 0,
            autorizar: 0,
            guardia: 0,
            informes: 0,
            otros: 0
        },
        totalTriageCases: 0,
        byAgentList: [],
        hourlyDemand: [],
        peakHourInfo: null,
        dailyTrend: [],
        monthlyComparison: [],
        firstResponseTimeAvgMin: 0,
        resolutionTimeAvgMin: 0,
        dayOfWeekDelays: [],
        highestDelayDay: null
    });

    // Carga y cómputo de métricas desde Supabase
    const loadMetrics = async () => {
        setLoading(true);
        try {
            // 1. Determinar fechas de inicio y fin según el filtro seleccionado
            let filterStart = null;
            let filterEnd = null;
            const now = new Date();

            if (timeRange === 'this_month') {
                filterStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
                filterEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            } else if (timeRange === 'last_month') {
                filterStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
                filterEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
            } else if (timeRange === 'today') {
                filterStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
                filterEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
            } else if (timeRange === 'week') {
                filterStart = new Date(now);
                filterStart.setDate(filterStart.getDate() - 7);
                filterStart.setHours(0, 0, 0, 0);
                filterEnd = new Date(now);
            } else if (timeRange === 'custom') {
                if (customStartDate) {
                    filterStart = new Date(customStartDate + 'T00:00:00');
                }
                if (customEndDate) {
                    filterEnd = new Date(customEndDate + 'T23:59:59');
                }
            }

            // Consultar mensajes de la línea de Contact Center
            let msgQuery = supabase
                .from('whatsapp_messages')
                .select('id, phone, direction, sender_name, content, created_at, raw_payload')
                .eq('line_id', 'contact_center')
                .order('created_at', { ascending: true });

            // Consultar conversaciones
            let convQuery = supabase
                .from('contact_center_conversations')
                .select('phone, status, resolution_reason, closed_at, closed_by_agent_name, motivo_consulta, ai_summary, created_at, last_message_at')
                .order('created_at', { ascending: true });

            if (filterStart) {
                msgQuery = msgQuery.gte('created_at', filterStart.toISOString());
                convQuery = convQuery.gte('created_at', filterStart.toISOString());
            }
            if (filterEnd) {
                msgQuery = msgQuery.lte('created_at', filterEnd.toISOString());
                convQuery = convQuery.lte('created_at', filterEnd.toISOString());
            }

            // También consultamos historial ampliado de los últimos 6 meses para la comparativa mes a mes
            const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0);
            const { data: monthlyRawMsgs } = await supabase
                .from('whatsapp_messages')
                .select('id, direction, created_at')
                .eq('line_id', 'contact_center')
                .gte('created_at', sixMonthsAgo.toISOString());

            const [{ data: messages, error: msgErr }, { data: convs, error: convErr }] = await Promise.all([
                msgQuery,
                convQuery
            ]);

            if (msgErr) throw msgErr;
            if (convErr) throw convErr;

            const filteredMessages = messages || [];
            const filteredConvs = convs || [];

            // ── A. Métricas de Volumen de Mensajes ──
            let totalOut = 0;
            let totalIn = 0;
            let botCount = 0;
            let agentCount = 0;

            const ALL_AGENTS_METRICS = [
                ...CONTACT_CENTER_AGENTS,
                { id: 'lmarinero', username: 'lmarinero', legacyId: 'lucas', name: 'Lucas Marinero', fullName: 'Lucas Marinero', role: 'Supervisor Contact Center', color: '#0284C7', avatar: 'LM' }
            ];

            const agentDataMap = {};
            ALL_AGENTS_METRICS.forEach(ag => {
                agentDataMap[ag.id] = {
                    id: ag.id,
                    name: ag.fullName || ag.name,
                    role: ag.role || 'Atención al Paciente',
                    color: ag.color,
                    avatar: ag.avatar,
                    count: 0,
                    resolvedCount: 0,
                    hourlyMap: Array(24).fill(0),
                    dayOfWeekMap: Array(7).fill(0),
                    responseTimesMin: [],
                    categoriesTally: {
                        turnos: 0,
                        autorizaciones: 0,
                        guardias: 0,
                        informes: 0,
                        otros: 0
                    }
                };
            });
            agentDataMap['otros_operadores'] = {
                id: 'otros_operadores',
                name: 'Otros Operadores / Admisión',
                role: 'Recepción y Soporte',
                color: '#64748B',
                avatar: 'OP',
                count: 0,
                resolvedCount: 0,
                hourlyMap: Array(24).fill(0),
                dayOfWeekMap: Array(7).fill(0),
                responseTimesMin: [],
                categoriesTally: { turnos: 0, autorizaciones: 0, guardias: 0, informes: 0, otros: 0 }
            };

            // Estructuras temporales para Demanda Horaria y Días de la Semana
            const hourlyIncomingCounts = Array(24).fill(0);
            const dailyOutTally = {};
            const responseTimesByDay = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
            const allFirstResponseTimes = [];
            const allResolutionTimes = [];

            // Agrupar mensajes por teléfono para analizar conversaciones y tiempos
            const msgsByPhone = {};
            filteredMessages.forEach(m => {
                if (!m.phone) return;
                if (!msgsByPhone[m.phone]) msgsByPhone[m.phone] = [];
                msgsByPhone[m.phone].push(m);

                const mDate = new Date(m.created_at);
                const dayKey = mDate.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });

                if (m.direction === 'outgoing') {
                    totalOut++;
                    dailyOutTally[dayKey] = (dailyOutTally[dayKey] || 0) + 1;

                    const sender = (m.sender_name || '').toLowerCase();
                    const rawAgent = (m.raw_payload?.agent || '').toLowerCase();
                    const isBot = m.raw_payload?.bot || 
                                  m.raw_payload?.source === 'bot_triage' || 
                                  sender.includes('bot') || 
                                  sender.includes('sistema adm-qui');

                    if (isBot) {
                        botCount++;
                    } else {
                        agentCount++;
                        let matched = false;
                        for (const ag of ALL_AGENTS_METRICS) {
                            if (
                                rawAgent === ag.id || 
                                rawAgent === (ag.username || '').toLowerCase() ||
                                (ag.legacyId && rawAgent === ag.legacyId) ||
                                sender.includes(ag.id) ||
                                (ag.legacyId && sender.includes(ag.legacyId)) ||
                                sender.includes((ag.name || '').toLowerCase())
                            ) {
                                agentDataMap[ag.id].count++;
                                agentDataMap[ag.id].hourlyMap[mDate.getHours()]++;
                                agentDataMap[ag.id].dayOfWeekMap[mDate.getDay()]++;
                                matched = true;
                                break;
                            }
                        }
                        if (!matched) {
                            agentDataMap['otros_operadores'].count++;
                            agentDataMap['otros_operadores'].hourlyMap[mDate.getHours()]++;
                            agentDataMap['otros_operadores'].dayOfWeekMap[mDate.getDay()]++;
                        }
                    }
                } else if (m.direction === 'incoming') {
                    totalIn++;
                    hourlyIncomingCounts[mDate.getHours()]++;
                }
            });

            // ── B. Cálculo de Tiempos de Demora y Respuestas por Conversación ──
            Object.values(msgsByPhone).forEach(pMsgs => {
                // pMsgs ya viene ordenado cronológicamente (ascending: true)
                for (let i = 0; i < pMsgs.length; i++) {
                    const m = pMsgs[i];
                    if (m.direction === 'incoming') {
                        const inDate = new Date(m.created_at);
                        // Buscar la respuesta saliente inmediata posterior
                        const nextOut = pMsgs.slice(i + 1).find(x => x.direction === 'outgoing');
                        if (nextOut) {
                            const outDate = new Date(nextOut.created_at);
                            const diffMin = Math.round((outDate - inDate) / 60000);
                            if (diffMin >= 0 && diffMin < 2880) { // filtrar outliers mayores a 48hs
                                allFirstResponseTimes.push(diffMin);
                                responseTimesByDay[inDate.getDay()].push(diffMin);

                                // Si la respuesta fue de una agente humana, acumular a sus estadísticas
                                const sender = (nextOut.sender_name || '').toLowerCase();
                                const rawAgent = (nextOut.raw_payload?.agent || '').toLowerCase();
                                for (const ag of ALL_AGENTS_METRICS) {
                                    if (rawAgent === ag.id || sender.includes(ag.id) || sender.includes((ag.name || '').toLowerCase())) {
                                        agentDataMap[ag.id].responseTimesMin.push(diffMin);
                                        break;
                                    }
                                }
                            }
                        }
                        break; // Solo contabilizar la primera respuesta de la conversación
                    }
                }
            });

            // ── C. Demora por Día de la Semana y Detección del Día Crítico ──
            let maxDelayDayName = 'No determinado';
            let maxDelayValue = -1;

            const dayOfWeekDelays = DIAS_SEMANA_NOMBRES.map((name, dayIdx) => {
                const times = responseTimesByDay[dayIdx];
                const avgMin = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
                
                if (times.length > 0 && avgMin > maxDelayValue) {
                    maxDelayValue = avgMin;
                    maxDelayDayName = name;
                }

                return {
                    dia: name,
                    diaCorto: name.slice(0, 3),
                    demoraPromedioMin: avgMin,
                    muestras: times.length
                };
            });

            // ── D. Tiempos Totales de Resolución ──
            let closedCount = 0;
            let activeCount = 0;
            const reasonsMap = {};
            MOTIVOS_FINALIZACION_CATALOGO.forEach(c => { reasonsMap[c.key] = 0; });

            filteredConvs.forEach(c => {
                const isClosed = isClosedOrArchived(c) || !!c.closed_at || !!c.resolution_reason;
                if (isClosed) {
                    closedCount++;
                    const r = c.resolution_reason || 'Otro / Aclaración en Nota';
                    let foundMatch = false;
                    for (const cat of MOTIVOS_FINALIZACION_CATALOGO) {
                        if (r.toLowerCase().includes(cat.key.toLowerCase()) || cat.key.toLowerCase().includes(r.toLowerCase())) {
                            reasonsMap[cat.key]++;
                            foundMatch = true;
                            break;
                        }
                    }
                    if (!foundMatch) {
                        reasonsMap['Otro / Aclaración en Nota'] = (reasonsMap['Otro / Aclaración en Nota'] || 0) + 1;
                    }

                    // Tiempos de resolución total
                    if (c.created_at && c.closed_at) {
                        const totalResMin = Math.round((new Date(c.closed_at) - new Date(c.created_at)) / 60000);
                        if (totalResMin > 0 && totalResMin < 10080) { // menos de 7 días
                            allResolutionTimes.push(totalResMin);
                        }
                    }

                    // Contabilizar resoluciones por agente
                    const closedAgent = (c.closed_by_agent_name || '').toLowerCase();
                    for (const ag of ALL_AGENTS_METRICS) {
                        if (closedAgent.includes(ag.id) || closedAgent.includes((ag.name || '').toLowerCase())) {
                            agentDataMap[ag.id].resolvedCount++;
                            break;
                        }
                    }
                } else {
                    activeCount++;
                }
            });

            // ── E. Triage Inicial de Pacientes ──
            const choicesTally = {
                solicitar_turno: 0,
                reprogramar_turno: 0,
                autorizar: 0,
                guardia: 0,
                informes: 0,
                otros: 0
            };

            Object.entries(msgsByPhone).forEach(([phone, msgList]) => {
                const incomingMsgs = msgList.filter(m => m.direction === 'incoming').map(m => m.content || '');
                const combined = incomingMsgs.slice(0, 3).join(' ').toLowerCase();

                if (/\b(reprogramar|cambiar\s+turno|cambio\s+de\s+turno|otra\s+fecha|otro\s+dia|no\s+puedo\s+ir)\b/i.test(combined)) {
                    choicesTally.reprogramar_turno++;
                } else if (/\b(autoriz|estudio|orden|ecograf|laboratorio|pap|mamograf|tomograf|rayos|rx|resonanc)\b/i.test(combined) || combined.includes('2')) {
                    choicesTally.autorizar++;
                } else if (/\b(guardia|urgencia|emergencia)\b/i.test(combined) || combined.includes('3')) {
                    choicesTally.guardia++;
                } else if (/\b(informe|resultado|horario|telefono|web|direccion|consulta|donde\s+queda|atencion)\b/i.test(combined) || combined.includes('4')) {
                    choicesTally.informes++;
                } else if (/\b(turno|turnos|solicitar|nuevo|doctor|doctora|dr|dra|cita|consulta|atencion|especialidad|ginecolog|pediatr|cardiolog|oftalmolog)\b/i.test(combined) || combined.includes('1')) {
                    choicesTally.solicitar_turno++;
                } else {
                    choicesTally.otros++;
                }
            });

            // ── F. Gráfico de Demanda por Horarios ──
            let peakHourIndex = 0;
            let peakHourVal = 0;
            const hourlyDemandData = hourlyIncomingCounts.map((count, hour) => {
                if (count > peakHourVal) {
                    peakHourVal = count;
                    peakHourIndex = hour;
                }
                return {
                    hora: `${hour.toString().padStart(2, '0')}:00`,
                    pacientes: count,
                    esPico: hour === peakHourIndex
                };
            });

            const peakHourInfo = {
                hora: `${peakHourIndex.toString().padStart(2, '0')}:00 hs`,
                cantidad: peakHourVal
            };

            // ── G. Tendencia Diaria de Mensajes y Gasto ──
            let runningOut = 0;
            const dailyTrendData = Object.entries(dailyOutTally).map(([fecha, enviados]) => {
                runningOut += enviados;
                // Costo: a partir del mensaje 1001 se factura $0.026 USD
                const billableAcc = Math.max(0, runningOut - MENSAJES_GRATIS_MENSUALES);
                const costoAccUsd = +(billableAcc * COSTO_POR_MENSAJE_USD).toFixed(2);
                
                return {
                    fecha,
                    enviados,
                    acumulados: runningOut,
                    costoAccUsd,
                    limiteGratis: MENSAJES_GRATIS_MENSUALES
                };
            });

            // ── H. Comparativa Histórica Mes a Mes ──
            const monthsMap = {};
            (monthlyRawMsgs || []).forEach(m => {
                if (m.direction === 'outgoing') {
                    const d = new Date(m.created_at);
                    const mKey = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
                    const label = d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
                    if (!monthsMap[mKey]) {
                        monthsMap[mKey] = { mes: label, enviados: 0 };
                    }
                    monthsMap[mKey].enviados++;
                }
            });

            const monthlyComparisonData = Object.values(monthsMap).map(item => {
                const billable = Math.max(0, item.enviados - MENSAJES_GRATIS_MENSUALES);
                return {
                    ...item,
                    costoUsd: +(billable * COSTO_POR_MENSAJE_USD).toFixed(2),
                    gratis: Math.min(item.enviados, MENSAJES_GRATIS_MENSUALES)
                };
            });

            // Promedios generales
            const firstResponseAvg = allFirstResponseTimes.length > 0 
                ? Math.round(allFirstResponseTimes.reduce((a, b) => a + b, 0) / allFirstResponseTimes.length) 
                : 0;

            const resolutionAvg = allResolutionTimes.length > 0 
                ? Math.round(allResolutionTimes.reduce((a, b) => a + b, 0) / allResolutionTimes.length) 
                : 0;

            const agentList = Object.values(agentDataMap)
                .filter(a => a.id !== 'otros_operadores' || a.count > 0)
                .map(a => {
                    const avgTime = a.responseTimesMin.length > 0
                        ? Math.round(a.responseTimesMin.reduce((x, y) => x + y, 0) / a.responseTimesMin.length)
                        : 0;
                    // Encontrar su horario pico
                    let maxH = 0;
                    let maxHIdx = 0;
                    a.hourlyMap.forEach((cnt, idx) => {
                        if (cnt > maxH) { maxH = cnt; maxHIdx = idx; }
                    });

                    return {
                        ...a,
                        avgResponseTimeMin: avgTime,
                        peakHour: `${maxHIdx.toString().padStart(2, '0')}:00 hs`
                    };
                })
                .sort((a, b) => b.count - a.count);

            setMetrics({
                totalOutgoing: totalOut,
                agentMessages: agentCount,
                botMessages: botCount,
                totalIncoming: totalIn,
                totalConversations: filteredConvs.length,
                closedConversationsCount: closedCount,
                activeConversationsCount: activeCount,
                byResolutionReason: reasonsMap,
                firstMessageChoices: choicesTally,
                totalTriageCases: Object.values(choicesTally).reduce((a, b) => a + b, 0),
                byAgentList: agentList,
                hourlyDemand: hourlyDemandData,
                peakHourInfo,
                dailyTrend: dailyTrendData,
                monthlyComparison: monthlyComparisonData,
                firstResponseTimeAvgMin: firstResponseAvg,
                resolutionTimeAvgMin: resolutionAvg,
                dayOfWeekDelays,
                highestDelayDay: maxDelayDayName
            });

        } catch (err) {
            console.error('[metrics] Error cargando métricas:', err);
            if (addToast) addToast('Error al cargar métricas del Contact Center: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadMetrics();
    }, [timeRange, customStartDate, customEndDate]);

    // Cálculos de costo derivados de la regla de Meta
    const costCalculations = useMemo(() => {
        const out = metrics.totalOutgoing || 0;
        const gratis = Math.min(out, MENSAJES_GRATIS_MENSUALES);
        const facturables = Math.max(0, out - MENSAJES_GRATIS_MENSUALES);
        const totalUsd = +(facturables * COSTO_POR_MENSAJE_USD).toFixed(2);
        const totalArs = Math.round(totalUsd * arsRate);
        const ahorroUsd = +(gratis * COSTO_POR_MENSAJE_USD).toFixed(2);
        const ahorroArs = Math.round(ahorroUsd * arsRate);

        return {
            totalEnviados: out,
            franquiciaGratis: gratis,
            restantesGratis: Math.max(0, MENSAJES_GRATIS_MENSUALES - out),
            facturables,
            totalUsd,
            totalArs,
            ahorroUsd,
            ahorroArs,
            costoUnitario: COSTO_POR_MENSAJE_USD
        };
    }, [metrics.totalOutgoing, arsRate]);

    const botPct = metrics.totalOutgoing > 0 ? Math.round((metrics.botMessages / metrics.totalOutgoing) * 100) : 0;
    const agentPct = metrics.totalOutgoing > 0 ? Math.round((metrics.agentMessages / metrics.totalOutgoing) * 100) : 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', paddingBottom: '30px' }}>
            
            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* CABECERA INSTITUCIONAL CON FILTROS TEMPORALES                    */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                padding: '18px 24px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                        width: '44px', height: '44px', borderRadius: '12px',
                        background: 'linear-gradient(135deg, #0F2942 0%, #0284C7 100%)',
                        color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)'
                    }}>
                        <BarChart3 size={24} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0F2942' }}>
                            Métricas & Monitoreo Contact Center
                        </h2>
                        <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                            Plataforma Sanatorio Argentino · Línea WhatsApp Oficial y Análisis Operativo
                        </p>
                    </div>
                </div>

                {/* FILTROS TEMPORALES: ESTE MES, MES PASADO, PERSONALIZADO, HOY, SEMANA */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{
                        display: 'inline-flex',
                        background: '#F1F5F9',
                        padding: '3px',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0'
                    }}>
                        {[
                            { key: 'this_month', label: 'Este Mes' },
                            { key: 'last_month', label: 'Mes Pasado' },
                            { key: 'today', label: 'Hoy' },
                            { key: 'week', label: 'Últimos 7 días' },
                            { key: 'custom', label: 'Personalizado' },
                        ].map(t => (
                            <button
                                key={t.key}
                                type="button"
                                onClick={() => setTimeRange(t.key)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '7px',
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    border: 'none',
                                    background: timeRange === t.key ? '#FFFFFF' : 'transparent',
                                    color: timeRange === t.key ? '#0284C7' : '#64748B',
                                    cursor: 'pointer',
                                    boxShadow: timeRange === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* SELECTORES DE FECHA PARA RANGO PERSONALIZADO */}
                    {timeRange === 'custom' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#F8FAFC', padding: '3px 8px', borderRadius: '8px', border: '1px solid #CBD5E1' }}>
                            <Calendar size={13} color="#0284C7" />
                            <input 
                                type="date"
                                value={customStartDate}
                                onChange={(e) => setCustomStartDate(e.target.value)}
                                style={{ border: 'none', background: 'transparent', fontSize: '0.74rem', color: '#1E293B', fontWeight: 600, outline: 'none' }}
                            />
                            <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>al</span>
                            <input 
                                type="date"
                                value={customEndDate}
                                onChange={(e) => setCustomEndDate(e.target.value)}
                                style={{ border: 'none', background: 'transparent', fontSize: '0.74rem', color: '#1E293B', fontWeight: 600, outline: 'none' }}
                            />
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={loadMetrics}
                        disabled={loading}
                        title="Actualizar métricas"
                        style={{
                            padding: '8px 14px', borderRadius: '8px', border: 'none',
                            background: '#0284C7', color: '#FFFFFF', fontSize: '0.76rem', fontWeight: 700,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: '6px',
                            boxShadow: '0 2px 6px rgba(2, 132, 199, 0.25)'
                        }}
                    >
                        <RefreshCw size={13} className={loading ? 'spin' : ''} />
                        Actualizar
                    </button>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* 1. KPI CARDS PRINCIPALES (CON TOTAL ENVIADOS CLICKEABLE)          */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '14px'
            }}>
                {/* 1. MENSAJES TOTALES ENVIADOS (CLICKEABLE -> ABRE CÁLCULO DE COSTOS) */}
                <div 
                    onClick={() => setCostModalOpen(true)}
                    title="Toca aquí para calcular y auditar el gasto de WhatsApp (Free Tier 1.000 msgs + $0.026 USD)"
                    style={{
                        background: '#FFFFFF', borderRadius: '12px', padding: '18px 20px',
                        border: '1.5px solid #BAE6FD', boxShadow: '0 2px 8px rgba(2, 132, 199, 0.08)',
                        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                        cursor: 'pointer', position: 'relative', transition: 'all 0.2s ease',
                        transform: 'translateY(0)'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(2, 132, 199, 0.16)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(2, 132, 199, 0.08)';
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0284C7', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                    Total Enviados
                                </span>
                                <span style={{ background: '#E0F2FE', color: '#0369A1', fontSize: '0.65rem', fontWeight: 800, padding: '1px 6px', borderRadius: '4px' }}>
                                    Ver Costo 💰
                                </span>
                            </div>
                            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#0F2942', marginTop: '4px' }}>
                                {loading ? '...' : metrics.totalOutgoing.toLocaleString()}
                            </div>
                        </div>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '10px', background: '#EFF6FF',
                            color: '#0284C7', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Send size={18} />
                        </div>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '10px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span style={{ color: '#0284C7', fontWeight: 700 }}>🤖 {botPct}% Bot</span>
                        <span>•</span>
                        <span style={{ color: '#059669', fontWeight: 700 }}>👩‍⚕️ {agentPct}% Agentes</span>
                    </div>
                    {/* Badge de estimación rápida de costo */}
                    <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #E2E8F0', display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                        <span style={{ color: '#64748B' }}>Gasto Meta est.:</span>
                        <strong style={{ color: costCalculations.totalUsd > 0 ? '#DC2626' : '#059669' }}>
                            {costCalculations.totalUsd > 0 ? `$${costCalculations.totalUsd} USD` : 'GRATIS (en cupo)'}
                        </strong>
                    </div>
                </div>

                {/* 2. MENSAJES RECIBIDOS */}
                <div style={{
                    background: '#FFFFFF', borderRadius: '12px', padding: '18px 20px',
                    border: '1px solid #E2E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                Mensajes Recibidos
                            </span>
                            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#0F2942', marginTop: '4px' }}>
                                {loading ? '...' : metrics.totalIncoming.toLocaleString()}
                            </div>
                        </div>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '10px', background: '#ECFDF5',
                            color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Inbox size={18} />
                        </div>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#059669', marginTop: '10px', fontWeight: 600 }}>
                        Mensajes entrantes de pacientes (sin costo)
                    </div>
                </div>

                {/* 3. DEMORA PROMEDIO 1RA RESPUESTA */}
                <div style={{
                    background: '#FFFFFF', borderRadius: '12px', padding: '18px 20px',
                    border: '1px solid #E2E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                1ra Respuesta Promedio
                            </span>
                            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#0284C7', marginTop: '4px' }}>
                                {loading ? '...' : `${metrics.firstResponseTimeAvgMin} min`}
                            </div>
                        </div>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '10px', background: '#EFF6FF',
                            color: '#0284C7', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Clock size={18} />
                        </div>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '10px' }}>
                        Tiempo hasta primer contacto (Bot o Agente)
                    </div>
                </div>

                {/* 4. DÍA CON MAYOR DEMORA */}
                <div style={{
                    background: '#FFFFFF', borderRadius: '12px', padding: '18px 20px',
                    border: '1px solid #E2E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                Día de Mayor Demora
                            </span>
                            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#DC2626', marginTop: '4px' }}>
                                {loading ? '...' : (metrics.highestDelayDay || 'Sin datos')}
                            </div>
                        </div>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '10px', background: '#FEF2F2',
                            color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <AlertTriangle size={18} />
                        </div>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '10px' }}>
                        Cuello de botella semanal a reforzar
                    </div>
                </div>

                {/* 5. CASOS FINALIZADOS */}
                <div style={{
                    background: '#FFFFFF', borderRadius: '12px', padding: '18px 20px',
                    border: '1px solid #E2E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                Casos Finalizados
                            </span>
                            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#8B5CF6', marginTop: '4px' }}>
                                {loading ? '...' : metrics.closedConversationsCount.toLocaleString()}
                            </div>
                        </div>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '10px', background: '#F5F3FF',
                            color: '#8B5CF6', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <CheckCircle2 size={18} />
                        </div>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '10px' }}>
                        {metrics.activeConversationsCount} conversaciones en curso
                    </div>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* 2. GRÁFICOS: DEMANDA POR HORARIOS Y GASTO DÍA A DÍA               */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
                gap: '18px'
            }}>
                {/* ── GRÁFICO 1: DEMANDA DE PACIENTES POR HORARIOS ── */}
                <div style={{
                    background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0',
                    padding: '22px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#EFF6FF', color: '#0284C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Clock size={16} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0F2942' }}>
                                    Demanda por Horarios (¿Cuándo escriben los pacientes?)
                                </h3>
                                <p style={{ margin: '1px 0 0', fontSize: '0.72rem', color: '#64748B' }}>
                                    Distribución de mensajes entrantes a lo largo de las 24 hs
                                </p>
                            </div>
                        </div>

                        {metrics.peakHourInfo && metrics.peakHourInfo.cantidad > 0 && (
                            <span style={{
                                fontSize: '0.72rem', fontWeight: 800, padding: '3px 10px', borderRadius: '20px',
                                background: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D'
                            }}>
                                ⚡ Pico: {metrics.peakHourInfo.hora} ({metrics.peakHourInfo.cantidad} msgs)
                            </span>
                        )}
                    </div>

                    <div style={{ width: '100%', height: '240px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={metrics.hourlyDemand} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorPacientes" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#0284C7" stopOpacity={0.8}/>
                                        <stop offset="95%" stopColor="#0284C7" stopOpacity={0.05}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                                <XAxis dataKey="hora" tick={{ fontSize: 10, fill: '#64748B' }} interval={2} />
                                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} allowDecimals={false} />
                                <Tooltip 
                                    contentStyle={{ background: '#FFFFFF', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.75rem' }}
                                    formatter={(val) => [`${val} mensajes de pacientes`, 'Volumen']}
                                />
                                <Area type="monotone" dataKey="pacientes" stroke="#0284C7" strokeWidth={2.5} fillOpacity={1} fill="url(#colorPacientes)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    <div style={{ marginTop: '12px', fontSize: '0.72rem', color: '#64748B', background: '#F8FAFC', padding: '8px 12px', borderRadius: '8px' }}>
                        💡 <strong>Recomendación operativa:</strong> Concentrar las agentes de respuesta inmediata en las franjas de mayor concurrencia para mantener el tiempo de respuesta bajo.
                    </div>
                </div>

                {/* ── GRÁFICO 2: MONITOREO DE GASTO EN WHATSAPP (DÍA A DÍA) ── */}
                <div style={{
                    background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0',
                    padding: '22px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <DollarSign size={16} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0F2942' }}>
                                    Monitoreo de Gasto Día a Día ($ USD)
                                </h3>
                                <p style={{ margin: '1px 0 0', fontSize: '0.72rem', color: '#64748B' }}>
                                    Evolución de mensajes salientes vs Free Tier de 1.000 msgs
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => setCostModalOpen(true)}
                            style={{
                                padding: '4px 10px', borderRadius: '6px', border: '1px solid #BAE6FD',
                                background: '#F0F9FF', color: '#0284C7', fontSize: '0.72rem', fontWeight: 700,
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                            }}
                        >
                            <Calculator size={12} /> Ver Detalle
                        </button>
                    </div>

                    <div style={{ width: '100%', height: '240px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={metrics.dailyTrend} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                                <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: '#64748B' }} />
                                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} allowDecimals={false} />
                                <Tooltip 
                                    contentStyle={{ background: '#FFFFFF', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.75rem' }}
                                    formatter={(val, name) => [
                                        name === 'costoAccUsd' ? `$${val} USD` : val, 
                                        name === 'costoAccUsd' ? 'Gasto Acumulado' : 'Mensajes Enviados'
                                    ]}
                                />
                                <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
                                <Line type="monotone" dataKey="enviados" name="Enviados por día" stroke="#0284C7" strokeWidth={2} dot={{ r: 3 }} />
                                <Line type="monotone" dataKey="costoAccUsd" name="Gasto Acumulado (USD)" stroke="#DC2626" strokeWidth={2.5} dot={{ r: 4 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    <div style={{ marginTop: '12px', fontSize: '0.72rem', color: '#64748B', background: '#F8FAFC', padding: '8px 12px', borderRadius: '8px' }}>
                        📊 <strong>Regla Meta:</strong> Cuota gratuita mensual: <strong>1.000 msgs</strong>. Superado el cupo: <strong>$0.026 USD/mensaje</strong> saliente.
                    </div>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* 3. GRÁFICO: DEMORA PROMEDIO POR DÍA DE LA SEMANA (LUNES A DOM)    */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0',
                padding: '22px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#FEF2F2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <TrendingUp size={16} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0F2942' }}>
                                Demora Promedio por Día de la Semana (¿Qué día se espera más?)
                            </h3>
                            <p style={{ margin: '1px 0 0', fontSize: '0.72rem', color: '#64748B' }}>
                                Comparativa de minutos promedio de espera desde el mensaje del paciente hasta la respuesta
                            </p>
                        </div>
                    </div>

                    {metrics.highestDelayDay && (
                        <div style={{
                            padding: '6px 14px', borderRadius: '8px', background: '#FEF2F2',
                            border: '1px solid #FECACA', display: 'flex', alignItems: 'center', gap: '6px'
                        }}>
                            <AlertTriangle size={14} color="#DC2626" />
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#991B1B' }}>
                                Día Crítico: {metrics.highestDelayDay}
                            </span>
                        </div>
                    )}
                </div>

                <div style={{ width: '100%', height: '220px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={metrics.dayOfWeekDelays} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                            <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#64748B' }} />
                            <YAxis tick={{ fontSize: 10, fill: '#64748B' }} unit="m" />
                            <Tooltip 
                                contentStyle={{ background: '#FFFFFF', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.75rem' }}
                                formatter={(val) => [`${val} minutos promedio`, 'Demora']}
                            />
                            <Bar dataKey="demoraPromedioMin" name="Minutos de Demora" radius={[6, 6, 0, 0]}>
                                {metrics.dayOfWeekDelays.map((entry, index) => (
                                    <Cell 
                                        key={`cell-${index}`} 
                                        fill={entry.dia === metrics.highestDelayDay ? '#DC2626' : '#0284C7'} 
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* 4. MÉTRICAS DESPLEGABLES POR CADA AGENTE OPERATIVO                */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0',
                padding: '22px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Users size={18} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0F2942' }}>
                                Rendimiento Desplegable por Asesora y Automatización del Bot
                            </h3>
                            <p style={{ margin: '1px 0 0', fontSize: '0.74rem', color: '#64748B' }}>
                                Despliega cada asesora para inspeccionar su actividad detallada, tiempos y casos resueltos
                            </p>
                        </div>
                    </div>

                    <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>
                        {metrics.byAgentList.length} Asesoras Activas
                    </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {metrics.byAgentList.map(ag => {
                        const isExp = !!expandedAgents[ag.id];
                        const totalHumano = Math.max(metrics.agentMessages, 1);
                        const pct = Math.round((ag.count / totalHumano) * 100);

                        return (
                            <div 
                                key={ag.id}
                                style={{
                                    borderRadius: '10px',
                                    border: isExp ? `1.5px solid ${ag.color}` : '1px solid #E2E8F0',
                                    background: '#FFFFFF',
                                    overflow: 'hidden',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                {/* HEADER DESPLEGABLE DE LA AGENTE */}
                                <div 
                                    onClick={() => toggleAgentExpanded(ag.id)}
                                    style={{
                                        padding: '12px 16px',
                                        background: isExp ? '#F8FAFC' : '#FFFFFF',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        userSelect: 'none'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{
                                            width: '32px', height: '32px', borderRadius: '50%',
                                            background: ag.color, color: '#FFFFFF',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.76rem', fontWeight: 800, flexShrink: 0
                                        }}>
                                            {ag.avatar}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F2942' }}>
                                                {ag.name}
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                                {ag.role}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F2942' }}>
                                                {ag.count} msgs
                                            </div>
                                            <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                                {pct}% del total humano
                                            </div>
                                        </div>

                                        <div style={{
                                            padding: '4px 8px', borderRadius: '6px', background: '#F1F5F9',
                                            color: '#475569', fontSize: '0.7rem', fontWeight: 700
                                        }}>
                                            ⏱ {ag.avgResponseTimeMin} min promedio
                                        </div>

                                        <div style={{ color: '#94A3B8' }}>
                                            {isExp ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                        </div>
                                    </div>
                                </div>

                                {/* CONTENIDO EXPANDIBLE DE LA AGENTE */}
                                {isExp && (
                                    <div style={{
                                        padding: '16px 20px',
                                        borderTop: '1px solid #E2E8F0',
                                        background: '#FAFAFA',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '14px'
                                    }}>
                                        {/* TARJETAS INTERNAS */}
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                                            gap: '10px'
                                        }}>
                                            <div style={{ background: '#FFFFFF', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>Total Despachos</div>
                                                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0F2942', marginTop: '2px' }}>{ag.count}</div>
                                            </div>
                                            <div style={{ background: '#FFFFFF', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>Casos Finalizados</div>
                                                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#059669', marginTop: '2px' }}>{ag.resolvedCount}</div>
                                            </div>
                                            <div style={{ background: '#FFFFFF', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>Demora Respuesta</div>
                                                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0284C7', marginTop: '2px' }}>{ag.avgResponseTimeMin} min</div>
                                            </div>
                                            <div style={{ background: '#FFFFFF', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>Horario de Pico</div>
                                                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#8B5CF6', marginTop: '2px' }}>{ag.peakHour}</div>
                                            </div>
                                        </div>

                                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                            Asesora asignada a la línea de atención al paciente del Sanatorio Argentino con permisos de respuesta y cierre de consultas.
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* TARJETA DESTACADA: BOT SANATORIO (AUTOMATIZACIÓN) */}
                    <div style={{
                        marginTop: '10px',
                        padding: '16px 20px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)',
                        border: '1.5px solid #BAE6FD',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '14px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                                width: '40px', height: '40px', borderRadius: '10px',
                                background: '#0284C7', color: '#FFFFFF',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <Bot size={22} />
                            </div>
                            <div>
                                <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0369A1' }}>
                                    Bot Sanatorio Argentino (Automatizado)
                                </div>
                                <div style={{ fontSize: '0.74rem', color: '#0284C7' }}>
                                    Triage inteligente, bienvenida, validación de DNI y derivaciones instantáneas 24/7
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#0369A1' }}>
                                    {metrics.botMessages} msgs
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#0284C7', fontWeight: 700 }}>
                                    {botPct}% de todos los salientes
                                </div>
                            </div>
                            <div style={{
                                padding: '6px 12px', borderRadius: '8px', background: '#FFFFFF',
                                border: '1px solid #BAE6FD', color: '#0369A1', fontSize: '0.75rem', fontWeight: 800
                            }}>
                                🛡️ Ahorro Humano: ~{Math.round(metrics.botMessages * 2.5)} min de trabajo
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* 5. DISTRIBUCIÓN DE MOTIVOS DE CIERRE                              */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0',
                padding: '22px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#F5F3FF', color: '#8B5CF6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CheckCircle2 size={18} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0F2942' }}>
                                Motivos de Finalización de Casos
                            </h3>
                            <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#64748B' }}>
                                Auditoría de cierre de casos clínicos y encuestas de calidad enviadas
                            </p>
                        </div>
                    </div>

                    <span style={{
                        fontSize: '0.76rem', fontWeight: 800, padding: '4px 10px', borderRadius: '20px',
                        background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0'
                    }}>
                        ✅ {metrics.closedConversationsCount} Casos Resueltos
                    </span>
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                    gap: '12px'
                }}>
                    {MOTIVOS_FINALIZACION_CATALOGO.map(motivo => {
                        const count = metrics.byResolutionReason[motivo.key] || 0;
                        const total = Math.max(metrics.closedConversationsCount, 1);
                        const pct = metrics.closedConversationsCount > 0 ? Math.round((count / total) * 100) : 0;
                        const MotivoIcon = motivo.icon;

                        return (
                            <div key={motivo.key} style={{
                                padding: '12px 14px', borderRadius: '10px',
                                background: '#FFFFFF', border: '1px solid #E2E8F0',
                                display: 'flex', flexDirection: 'column', gap: '8px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{
                                            width: '26px', height: '26px', borderRadius: '6px',
                                            background: motivo.bg, color: motivo.color,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            <MotivoIcon size={14} />
                                        </div>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F2942' }}>
                                            {motivo.label}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.84rem', fontWeight: 800, color: motivo.color }}>
                                        {count} <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 500 }}>({pct}%)</span>
                                    </div>
                                </div>
                                <div style={{ height: '5px', background: '#F1F5F9', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${pct}%`,
                                        background: motivo.color,
                                        borderRadius: '3px',
                                        transition: 'width 0.4s ease'
                                    }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* MODAL INTERACTIVO DE CÁLCULO DE COSTO DE WHATSAPP (META API)     */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            {costModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 41, 66, 0.65)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, padding: '20px'
                }}>
                    <div style={{
                        background: '#FFFFFF', borderRadius: '16px', width: '100%', maxWidth: '750px',
                        maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                        border: '1px solid #CBD5E1', display: 'flex', flexDirection: 'column'
                    }}>
                        {/* CABECERA DEL MODAL */}
                        <div style={{
                            padding: '18px 24px', borderBottom: '1px solid #E2E8F0',
                            background: '#F8FAFC', display: 'flex', justifyContent: 'space-between',
                            alignItems: 'center', borderRadius: '16px 16px 0 0'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                    width: '36px', height: '36px', borderRadius: '10px',
                                    background: '#ECFDF5', color: '#059669',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <Calculator size={20} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F2942' }}>
                                        Cálculo de Costos WhatsApp Business API
                                    </h3>
                                    <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#64748B' }}>
                                        Regla oficial Meta: 1.000 mensajes salientes gratis/mes • $0.026 USD por mensaje adicional
                                    </p>
                                </div>
                            </div>

                            <button 
                                type="button"
                                onClick={() => setCostModalOpen(false)}
                                style={{
                                    border: 'none', background: '#F1F5F9', color: '#64748B',
                                    width: '30px', height: '30px', borderRadius: '8px', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* CUERPO DEL MODAL */}
                        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            
                            {/* BANNER INFORMATIVO META FREE TIER */}
                            <div style={{
                                padding: '12px 16px', borderRadius: '10px', background: '#EFF6FF',
                                border: '1px solid #BAE6FD', display: 'flex', alignItems: 'center', gap: '10px'
                            }}>
                                <Info size={20} color="#0284C7" style={{ flexShrink: 0 }} />
                                <div style={{ fontSize: '0.76rem', color: '#0369A1', lineHeight: 1.4 }}>
                                    <strong>¿Cómo factura WhatsApp?:</strong> Solo se cobra por mensaje <strong>enviado (outgoing)</strong>. Los mensajes entrantes recibidos de pacientes son <strong>100% gratuitos</strong>. Cada mes el Sanatorio cuenta con <strong>1.000 mensajes sin cargo</strong>; a partir del mensaje número 1.001, cada despacho tiene una tarifa oficial de <strong>$0.026 USD</strong>.
                                </div>
                            </div>

                            {/* GRID DE RESULTADOS DE CÁLCULO */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                gap: '12px'
                            }}>
                                <div style={{ background: '#F8FAFC', padding: '14px 16px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                    <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Total Enviados</span>
                                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0F2942', marginTop: '2px' }}>
                                        {costCalculations.totalEnviados.toLocaleString()}
                                    </div>
                                    <span style={{ fontSize: '0.68rem', color: '#0284C7' }}>Mensajes salientes del período</span>
                                </div>

                                <div style={{ background: '#ECFDF5', padding: '14px 16px', borderRadius: '10px', border: '1px solid #A7F3D0' }}>
                                    <span style={{ fontSize: '0.7rem', color: '#065F46', fontWeight: 700, textTransform: 'uppercase' }}>Cupo Gratuito (Free Tier)</span>
                                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#059669', marginTop: '2px' }}>
                                        {costCalculations.franquiciaGratis} / 1.000
                                    </div>
                                    <span style={{ fontSize: '0.68rem', color: '#047857' }}>
                                        {costCalculations.restantesGratis > 0 ? `Quedan ${costCalculations.restantesGratis} gratis` : 'Cupo consumido'}
                                    </span>
                                </div>

                                <div style={{ background: costCalculations.facturables > 0 ? '#FEF2F2' : '#F8FAFC', padding: '14px 16px', borderRadius: '10px', border: costCalculations.facturables > 0 ? '1px solid #FECACA' : '1px solid #E2E8F0' }}>
                                    <span style={{ fontSize: '0.7rem', color: costCalculations.facturables > 0 ? '#991B1B' : '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Excedente Facturable</span>
                                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: costCalculations.facturables > 0 ? '#DC2626' : '#64748B', marginTop: '2px' }}>
                                        {costCalculations.facturables.toLocaleString()}
                                    </div>
                                    <span style={{ fontSize: '0.68rem', color: '#64748B' }}>A $0.026 USD c/u</span>
                                </div>
                            </div>

                            {/* TOTAL FINAL EN USD Y ARS */}
                            <div style={{
                                padding: '18px 22px', borderRadius: '12px',
                                background: costCalculations.totalUsd > 0 ? '#FFFBEB' : '#F0FDF4',
                                border: costCalculations.totalUsd > 0 ? '1.5px solid #FCD34D' : '1.5px solid #86EFAC',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px'
                            }}>
                                <div>
                                    <div style={{ fontSize: '0.76rem', fontWeight: 800, color: costCalculations.totalUsd > 0 ? '#92400E' : '#166534', textTransform: 'uppercase' }}>
                                        Gasto Total Facturado a Pagar
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginTop: '4px' }}>
                                        <span style={{ fontSize: '2.4rem', fontWeight: 900, color: costCalculations.totalUsd > 0 ? '#B45309' : '#16A34A' }}>
                                            ${costCalculations.totalUsd} USD
                                        </span>
                                        <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#64748B' }}>
                                            ≈ ${costCalculations.totalArs.toLocaleString('es-AR')} ARS
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px' }}>
                                        Ahorro obtenido por el Free Tier de 1.000 msgs: <strong>${costCalculations.ahorroUsd} USD (${costCalculations.ahorroArs.toLocaleString('es-AR')} ARS)</strong>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                    <label style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>Cotización Dólar ARS:</label>
                                    <input 
                                        type="number" 
                                        value={arsRate}
                                        onChange={(e) => setArsRate(Number(e.target.value) || 1)}
                                        style={{
                                            width: '100px', padding: '4px 8px', borderRadius: '6px',
                                            border: '1px solid #CBD5E1', fontSize: '0.78rem', fontWeight: 700,
                                            textAlign: 'right', outline: 'none'
                                        }}
                                    />
                                </div>
                            </div>

                            {/* GRÁFICO DE PROYECCIÓN EN EL MODAL */}
                            <div>
                                <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0F2942', marginBottom: '8px' }}>
                                    Curva de Consumo Acumulado vs Límite de 1.000 Mensajes
                                </div>
                                <div style={{ width: '100%', height: '180px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '10px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={metrics.dailyTrend}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                                            <XAxis dataKey="fecha" tick={{ fontSize: 9 }} />
                                            <YAxis tick={{ fontSize: 9 }} />
                                            <Tooltip formatter={(val, name) => [val, name === 'limiteGratis' ? 'Límite Gratuito' : 'Mensajes Acumulados']} />
                                            <Line type="monotone" dataKey="acumulados" name="Acumulados" stroke="#0284C7" strokeWidth={2.5} dot={{ r: 3 }} />
                                            <Line type="monotone" dataKey="limiteGratis" name="Límite Gratis" stroke="#10B981" strokeDasharray="4 4" strokeWidth={2} dot={false} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        {/* PIE DEL MODAL */}
                        <div style={{
                            padding: '14px 24px', borderTop: '1px solid #E2E8F0', background: '#F8FAFC',
                            display: 'flex', justifyContent: 'flex-end', borderRadius: '0 0 16px 16px'
                        }}>
                            <button
                                type="button"
                                onClick={() => setCostModalOpen(false)}
                                style={{
                                    padding: '8px 20px', borderRadius: '8px', border: 'none',
                                    background: '#0F2942', color: '#FFFFFF', fontSize: '0.78rem',
                                    fontWeight: 700, cursor: 'pointer'
                                }}
                            >
                                Entendido / Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
