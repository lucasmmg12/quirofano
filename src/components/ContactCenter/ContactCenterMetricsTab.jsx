import React, { useState, useEffect, useMemo } from 'react';
import { 
    BarChart3, Users, MessageSquare, Bot, RefreshCw, CheckCircle2, 
    Sparkles, Activity, Calendar, ArrowUpRight, ArrowDownLeft, Send, 
    Inbox, Stethoscope, CalendarCheck, Clock, FileCheck, ShieldAlert,
    ChevronRight, ChevronDown, ChevronUp, Check, AlertCircle, AlertTriangle, 
    FileText, HelpCircle, PhoneCall, DollarSign, TrendingUp, X, 
    Calculator, Info, ShieldCheck, Zap, Award, UserCheck, Timer,
    CheckSquare, TrendingDown, Smile, UserX, Layers, Target, Cpu
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
import ContactCenterAiCostTab from './ContactCenterAiCostTab';

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
    
    // Selector de vista: 'operativo' | 'ia_tokens'
    const [activeMetricsView, setActiveMetricsView] = useState('operativo');

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
        agentFirstResponseAvgMin: 0,
        resolutionTimeAvgMin: 0,
        dayOfWeekDelays: [],
        highestDelayDay: null,
        highestDelayValue: 0,
        slaStats: {
            optimo: 0,
            aceptable: 0,
            demorado: 0,
            totalCasos: 0,
            cumplimientoPct: 100
        },
        queueAging: {
            menos15m: 0,
            de15ma1h: 0,
            de1ha4h: 0,
            mas4h: 0,
            totalActivas: 0
        },
        // ── Métricas de Calidad de Atención al Paciente ──
        patientQuality: {
            // 1. Tiempo de Espera en Cola (Queue Wait Time: desde solicitud hasta toma de asesora)
            queueWaitAvgMin: 0,
            queueWaitMedianMin: 0,
            queueWaitUnder5mPct: 100,
            queueWaitUnder15mPct: 100,
            totalQueuedCases: 0,

            // 2. Tiempo hasta 1er Contacto con la Asesora (FRT: tiempo de redacción tras asignación)
            agentFRTAvgMin: 0,
            agentFRTMedianMin: 0,
            agentFRTUnder3mPct: 100,
            totalFRTCases: 0,

            // 3. Tiempo Promedio de Resolución neta por Chat (AHT: entre que lo toma y lo finaliza)
            handleTimeAvgMin: 0,
            handleTimeMedianMin: 0,
            handleTimeUnder10mPct: 0,
            totalHandleCases: 0,

            // 4. Retención y Resolución
            fcrPct: 100, // First Contact Resolution (% resueltos sin reingreso en 24h)
            abandonmentRate: 0, // % de abandono de pacientes en cola
            totalAbandoned: 0,

            // 5. Curva horaria de minutos de espera promedio por hora
            hourlyWaitCurve: [],
            peakWaitHour: null,
            peakWaitValMin: 0
        }
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

            // Consultar mensajes de la línea de Contact Center (Optimizado para RAM)
            let msgQuery = supabase
                .from('whatsapp_messages')
                .select('id, phone, direction, sender_name, content, created_at, raw_payload')
                .eq('line_id', 'contact_center')
                .order('created_at', { ascending: true })
                .limit(4000); // Límite de seguridad para no agotar la RAM

            // Consultar conversaciones con datos completos de asignación y cierre
            let convQuery = supabase
                .from('contact_center_conversations')
                .select('phone, status, resolution_reason, closed_at, closed_by_agent_name, closed_by_agent_id, assigned_at, assigned_agent_id, assigned_agent_name, motivo_consulta, ai_summary, created_at, updated_at, last_message_at')
                .order('created_at', { ascending: true })
                .limit(2500);

            if (filterStart) {
                msgQuery = msgQuery.gte('created_at', filterStart.toISOString());
                convQuery = convQuery.gte('created_at', filterStart.toISOString());
            }
            if (filterEnd) {
                msgQuery = msgQuery.lte('created_at', filterEnd.toISOString());
                convQuery = convQuery.lte('created_at', filterEnd.toISOString());
            }

            // Historial ampliado de los últimos 6 meses para la comparativa mes a mes (Solo salientes y con proyección ligera)
            const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0);
            const monthlyPromise = supabase
                .from('whatsapp_messages')
                .select('id, direction, created_at')
                .eq('line_id', 'contact_center')
                .eq('direction', 'outgoing')
                .gte('created_at', sixMonthsAgo.toISOString())
                .limit(10000);

            const [{ data: messages, error: msgErr }, { data: convs, error: convErr }, { data: monthlyRawMsgs }] = await Promise.all([
                msgQuery,
                convQuery,
                monthlyPromise
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
                    assignedCount: 0,
                    resolvedCount: 0,
                    hourlyMap: Array(24).fill(0),
                    dayOfWeekMap: Array(7).fill(0),
                    responseTimesMin: [],
                    firstResponseTimesMin: [], // Desde toma de caso hasta 1er mensaje saliente
                    handleTimesMin: [],        // Desde toma de caso hasta finalización (AHT)
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
                assignedCount: 0,
                resolvedCount: 0,
                hourlyMap: Array(24).fill(0),
                dayOfWeekMap: Array(7).fill(0),
                responseTimesMin: [],
                firstResponseTimesMin: [],
                handleTimesMin: [],
                categoriesTally: { turnos: 0, autorizaciones: 0, guardias: 0, informes: 0, otros: 0 }
            };

            // Estructuras temporales para Demanda Horaria y Días de la Semana
            const hourlyIncomingCounts = Array(24).fill(0);
            const dailyOutTally = {};
            const responseTimesByDay = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
            const allFirstResponseTimes = [];
            const allResolutionTimes = [];

            // ── Estructuras para Métricas de Calidad de Atención al Paciente ──
            const allQueueWaitTimes = [];     // Minutos en cola (solicitud -> toma asesora)
            const allAgentFRTTimes = [];      // Minutos hasta 1er contacto de la asesora (toma -> 1er msg)
            const allAgentHandleTimes = [];   // Minutos netos de gestión de chat (toma -> cierre)
            const hourlyWaitMap = Array.from({ length: 24 }, () => []); // Espera por hora del día
            let abandonedCount = 0;           // Pacientes que abandonaron en cola sin atención
            const resolvedPhonesWithCloseDate = []; // Registro para verificar FCR (sin reingreso en 24h)

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

            // Helper para identificar mensajes automáticos del Bot
            const isBotMsg = (msg) => {
                if (!msg) return false;
                const s = (msg.sender_name || '').toLowerCase();
                const r = (msg.raw_payload?.agent || '').toLowerCase();
                return !!(
                    msg.raw_payload?.bot || 
                    msg.raw_payload?.source === 'bot_triage' || 
                    s.includes('bot') || 
                    s.includes('sistema adm-qui')
                );
            };

            // ── B. Cálculo de Tiempos de Demora y Respuestas por Conversación ──
            const allHumanResponseTimes = [];

            Object.values(msgsByPhone).forEach(pMsgs => {
                // pMsgs ya viene ordenado cronológicamente (ascending: true)
                for (let i = 0; i < pMsgs.length; i++) {
                    const m = pMsgs[i];
                    if (m.direction === 'incoming') {
                        const inDate = new Date(m.created_at);
                        const subsequentOuts = pMsgs.slice(i + 1).filter(x => x.direction === 'outgoing');

                        // 1. Primera respuesta humana (asesora)
                        const nextHumanOut = subsequentOuts.find(x => !isBotMsg(x));
                        if (nextHumanOut) {
                            const outDate = new Date(nextHumanOut.created_at);
                            const diffMin = (outDate - inDate) / 60000;
                            if (diffMin >= 0 && diffMin < 2880) { // filtrar outliers mayores a 48hs
                                const valMin = Number(diffMin.toFixed(1));
                                allHumanResponseTimes.push(valMin);
                                responseTimesByDay[inDate.getDay()].push(valMin);

                                // Atribuir a la asesora correspondiente
                                const sender = (nextHumanOut.sender_name || '').toLowerCase();
                                const rawAgent = (nextHumanOut.raw_payload?.agent || '').toLowerCase();
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
                                        agentDataMap[ag.id].responseTimesMin.push(valMin);
                                        matched = true;
                                        break;
                                    }
                                }
                                if (!matched) {
                                    agentDataMap['otros_operadores'].responseTimesMin.push(valMin);
                                }
                            }
                        }

                        // 2. Primera respuesta general (Bot o Humana)
                        const nextAnyOut = subsequentOuts[0];
                        if (nextAnyOut) {
                            const outDate = new Date(nextAnyOut.created_at);
                            const diffMin = Math.max(0, (outDate - inDate) / 60000);
                            if (diffMin < 2880) {
                                const valMin = Number(diffMin.toFixed(1));
                                allFirstResponseTimes.push(valMin);
                                // Si en este día NO hubo respuesta humana aún, registrar la muestra del bot
                                if (!nextHumanOut) {
                                    responseTimesByDay[inDate.getDay()].push(valMin);
                                }
                            }
                        }

                        break; // Solo contabilizar el primer ciclo de respuesta de la conversación
                    }
                }
            });

            // ── C. Demora por Día de la Semana y Detección del Día Crítico ──
            let maxDelayDayName = null;
            let maxDelayValue = 0;

            const dayOfWeekDelays = DIAS_SEMANA_NOMBRES.map((name, dayIdx) => {
                const times = responseTimesByDay[dayIdx];
                const avgMin = times.length > 0 
                    ? Number((times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)) 
                    : 0;
                
                // Solo si la demora promedio es al menos de 1 minuto se considera cuello de botella
                if (times.length > 0 && avgMin >= 1 && avgMin > maxDelayValue) {
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

            // Helper estadístico para mediana (P50)
            const calcMedian = (arr) => {
                if (!arr || arr.length === 0) return 0;
                const sorted = [...arr].sort((a, b) => a - b);
                const mid = Math.floor(sorted.length / 2);
                return sorted.length % 2 !== 0 
                    ? Number(sorted[mid].toFixed(1)) 
                    : Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1));
            };

            filteredConvs.forEach(c => {
                const isClosed = isClosedOrArchived(c) || !!c.closed_at || !!c.resolution_reason;
                const normPhone = c.phone;
                const pMsgs = msgsByPhone[normPhone] || [];

                // Identificar agente asignado
                const assignedAgentId = (c.assigned_agent_id || '').toLowerCase();
                const assignedAgentName = (c.assigned_agent_name || '').toLowerCase();
                let matchedAssignedAgentId = null;
                for (const ag of ALL_AGENTS_METRICS) {
                    if (
                        assignedAgentId === ag.id || 
                        assignedAgentId === (ag.username || '').toLowerCase() ||
                        (ag.legacyId && assignedAgentId === ag.legacyId) ||
                        assignedAgentName.includes(ag.id) ||
                        assignedAgentName.includes((ag.name || '').toLowerCase())
                    ) {
                        matchedAssignedAgentId = ag.id;
                        agentDataMap[ag.id].assignedCount++;
                        break;
                    }
                }

                // Determinar fecha de asignación efectiva
                let assignedDate = c.assigned_at ? new Date(c.assigned_at) : null;
                if (!assignedDate) {
                    // Fallback para chats anteriores: primer mensaje saliente humano
                    const firstHumanMsg = pMsgs.find(m => m.direction === 'outgoing' && !isBotMsg(m));
                    if (firstHumanMsg) assignedDate = new Date(firstHumanMsg.created_at);
                }

                // ── 1. TIEMPO DE ESPERA EN COLA (QUEUE WAIT TIME) ──
                // Desde que entra la consulta hasta que un agente toma/se asigna el chat
                if (assignedDate && c.created_at) {
                    const createdDate = new Date(c.created_at);
                    const waitMin = (assignedDate - createdDate) / 60000;
                    if (waitMin >= 0 && waitMin < 2880) { // filtrar outliers > 48hs
                        const valWait = Number(waitMin.toFixed(1));
                        allQueueWaitTimes.push(valWait);
                        const hr = createdDate.getHours();
                        if (hr >= 0 && hr < 24) {
                            hourlyWaitMap[hr].push(valWait);
                        }
                    }
                }

                // ── 2. TIEMPO HASTA 1ER CONTACTO CON LA ASESORA (AGENT FRT) ──
                // Desde que la asesora toma el chat (assigned_at) hasta que emite su 1er mensaje humano
                if (assignedDate) {
                    const assignedTimeMs = assignedDate.getTime();
                    const firstOutAfterAssign = pMsgs.find(m => 
                        m.direction === 'outgoing' && 
                        !isBotMsg(m) && 
                        new Date(m.created_at).getTime() >= (assignedTimeMs - 30000)
                    );
                    if (firstOutAfterAssign) {
                        const frtMin = Math.max(0, (new Date(firstOutAfterAssign.created_at).getTime() - assignedTimeMs) / 60000);
                        if (frtMin < 1440) { // menos de 24 hs
                            const valFRT = Number(frtMin.toFixed(1));
                            allAgentFRTTimes.push(valFRT);
                            if (matchedAssignedAgentId) {
                                agentDataMap[matchedAssignedAgentId].firstResponseTimesMin.push(valFRT);
                            }
                        }
                    }
                }

                // ── 3. RESOLUCIÓN DE CASOS & AHT NETO DEL AGENTE ──
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

                    // AHT Neto: Específicamente entre que lo agarra el agente y lo finaliza
                    if (assignedDate && c.closed_at) {
                        const closedDate = new Date(c.closed_at);
                        const handleMin = (closedDate - assignedDate) / 60000;
                        if (handleMin >= 0 && handleMin < 1440) { // menos de 24 hs
                            const valHandle = Number(handleMin.toFixed(1));
                            allAgentHandleTimes.push(valHandle);
                            
                            // Atribuir a la asesora que cerró o a la que estuvo asignada
                            const closedAgent = (c.closed_by_agent_name || c.assigned_agent_name || '').toLowerCase();
                            for (const ag of ALL_AGENTS_METRICS) {
                                if (closedAgent.includes(ag.id) || closedAgent.includes((ag.name || '').toLowerCase())) {
                                    agentDataMap[ag.id].handleTimesMin.push(valHandle);
                                    break;
                                }
                            }
                        }
                    }

                    // Tiempos de resolución total histórica (desde created_at hasta closed_at)
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

                    // Guardar para cálculo de First Contact Resolution (FCR)
                    if (c.closed_at) {
                        resolvedPhonesWithCloseDate.push({
                            phone: normPhone,
                            closedAt: new Date(c.closed_at).getTime()
                        });
                    }
                } else {
                    activeCount++;
                }

                // ── 4. DETECCIÓN DE ABANDONO EN COLA ──
                // Paciente que nunca fue atendido por un humano o timeout sin asignación
                const hasAgentMsg = pMsgs.some(m => m.direction === 'outgoing' && !isBotMsg(m));
                const isAbandonedTimeout = (c.resolution_reason || '').toLowerCase().includes('no responde');
                if ((!hasAgentMsg && isClosed) || (isAbandonedTimeout && !c.assigned_at)) {
                    abandonedCount++;
                }
            });

            // ── Cómputo de FCR (First Contact Resolution en 24h) ──
            let fcrSuccessCount = 0;
            resolvedPhonesWithCloseDate.forEach(item => {
                const pMsgs = msgsByPhone[item.phone] || [];
                const nextIncomingWithin24h = pMsgs.find(m => {
                    if (m.direction !== 'incoming') return false;
                    const msgTime = new Date(m.created_at).getTime();
                    return msgTime > item.closedAt && msgTime <= (item.closedAt + 24 * 3600 * 1000);
                });
                if (!nextIncomingWithin24h) {
                    fcrSuccessCount++;
                }
            });
            const fcrPct = resolvedPhonesWithCloseDate.length > 0
                ? Math.round((fcrSuccessCount / resolvedPhonesWithCloseDate.length) * 100)
                : 100;

            const abandonmentRate = filteredConvs.length > 0
                ? Number(((abandonedCount / filteredConvs.length) * 100).toFixed(1))
                : 0;

            // ── Cómputo de Curva Horaria de Espera ──
            let peakWaitHour = null;
            let peakWaitValMin = 0;
            const hourlyWaitCurveData = hourlyWaitMap.map((times, hour) => {
                const avg = times.length > 0 ? Number((times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)) : 0;
                if (avg > peakWaitValMin && times.length >= 2) {
                    peakWaitValMin = avg;
                    peakWaitHour = `${hour.toString().padStart(2, '0')}:00 hs`;
                }
                return {
                    hora: `${hour.toString().padStart(2, '0')}:00`,
                    esperaMin: avg,
                    casos: times.length
                };
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

            // Promedios y Medianas Generales
            const firstResponseAvg = allFirstResponseTimes.length > 0 
                ? Number((allFirstResponseTimes.reduce((a, b) => a + b, 0) / allFirstResponseTimes.length).toFixed(1)) 
                : 0;

            const agentFirstResponseAvg = allHumanResponseTimes.length > 0
                ? Number((allHumanResponseTimes.reduce((a, b) => a + b, 0) / allHumanResponseTimes.length).toFixed(1))
                : 0;

            const resolutionAvg = allResolutionTimes.length > 0 
                ? Math.round(allResolutionTimes.reduce((a, b) => a + b, 0) / allResolutionTimes.length) 
                : 0;

            // Estadísticos de Calidad al Paciente
            const queueWaitAvg = allQueueWaitTimes.length > 0
                ? Number((allQueueWaitTimes.reduce((a, b) => a + b, 0) / allQueueWaitTimes.length).toFixed(1))
                : 0;
            const queueWaitMedian = calcMedian(allQueueWaitTimes);
            const queueUnder5m = allQueueWaitTimes.filter(t => t <= 5).length;
            const queueUnder5mPct = allQueueWaitTimes.length > 0 ? Math.round((queueUnder5m / allQueueWaitTimes.length) * 100) : 100;
            const queueUnder15m = allQueueWaitTimes.filter(t => t <= 15).length;
            const queueUnder15mPct = allQueueWaitTimes.length > 0 ? Math.round((queueUnder15m / allQueueWaitTimes.length) * 100) : 100;

            const agentFRTAvg = allAgentFRTTimes.length > 0
                ? Number((allAgentFRTTimes.reduce((a, b) => a + b, 0) / allAgentFRTTimes.length).toFixed(1))
                : 0;
            const agentFRTMedian = calcMedian(allAgentFRTTimes);
            const agentFRTUnder3m = allAgentFRTTimes.filter(t => t <= 3).length;
            const agentFRTUnder3mPct = allAgentFRTTimes.length > 0 ? Math.round((agentFRTUnder3m / allAgentFRTTimes.length) * 100) : 100;

            const handleTimeAvg = allAgentHandleTimes.length > 0
                ? Number((allAgentHandleTimes.reduce((a, b) => a + b, 0) / allAgentHandleTimes.length).toFixed(1))
                : 0;
            const handleTimeMedian = calcMedian(allAgentHandleTimes);
            const handleUnder10m = allAgentHandleTimes.filter(t => t <= 10).length;
            const handleUnder10mPct = allAgentHandleTimes.length > 0 ? Math.round((handleUnder10m / allAgentHandleTimes.length) * 100) : 0;

            // Rendimiento detallado por asesora
            const agentList = Object.values(agentDataMap)
                .filter(a => a.id !== 'otros_operadores' || a.count > 0)
                .map(a => {
                    const avgTime = a.responseTimesMin.length > 0
                        ? Number((a.responseTimesMin.reduce((x, y) => x + y, 0) / a.responseTimesMin.length).toFixed(1))
                        : 0;
                    const avgFRT = a.firstResponseTimesMin.length > 0
                        ? Number((a.firstResponseTimesMin.reduce((x, y) => x + y, 0) / a.firstResponseTimesMin.length).toFixed(1))
                        : 0;
                    const avgHandle = a.handleTimesMin.length > 0
                        ? Number((a.handleTimesMin.reduce((x, y) => x + y, 0) / a.handleTimesMin.length).toFixed(1))
                        : 0;
                    const medianHandle = calcMedian(a.handleTimesMin);

                    // Encontrar su horario pico
                    let maxH = 0;
                    let maxHIdx = 0;
                    a.hourlyMap.forEach((cnt, idx) => {
                        if (cnt > maxH) { maxH = cnt; maxHIdx = idx; }
                    });

                    const withinSla = a.responseTimesMin.filter(x => x <= 15).length;
                    const agentSlaPct = a.responseTimesMin.length > 0 ? Math.round((withinSla / a.responseTimesMin.length) * 100) : 100;

                    return {
                        ...a,
                        avgResponseTimeMin: avgTime,
                        avgAgentFRTMin: avgFRT,
                        avgHandleTimeMin: avgHandle,
                        medianHandleTimeMin: medianHandle,
                        peakHour: `${maxHIdx.toString().padStart(2, '0')}:00 hs`,
                        slaCumplimientoPct: agentSlaPct,
                        totalAtendidos: a.responseTimesMin.length,
                        assignedCount: a.assignedCount || a.resolvedCount || a.responseTimesMin.length
                    };
                })
                .sort((a, b) => b.count - a.count);

            // ── C2. Cómputo de Niveles de SLA & Distribución de Demoras ──
            let slaOptimo = 0;
            let slaAceptable = 0;
            let slaDemorado = 0;
            allHumanResponseTimes.forEach(t => {
                if (t <= 15) slaOptimo++;
                else if (t <= 60) slaAceptable++;
                else slaDemorado++;
            });
            const totalSlaCases = allHumanResponseTimes.length;
            const slaCumplimientoPct = totalSlaCases > 0 ? Math.round((slaOptimo / totalSlaCases) * 100) : 100;

            // Envejecimiento de la cola de chats activos (Queue Aging)
            const currentTimeMs = Date.now();
            const queueAging = { menos15m: 0, de15ma1h: 0, de1ha4h: 0, mas4h: 0, totalActivas: 0 };
            filteredConvs.forEach(c => {
                if (!isClosedOrArchived(c)) {
                    queueAging.totalActivas++;
                    const lastActivity = new Date(c.updated_at || c.created_at).getTime();
                    const waitMin = Math.max(0, (currentTimeMs - lastActivity) / 60000);
                    if (waitMin <= 15) queueAging.menos15m++;
                    else if (waitMin <= 60) queueAging.de15ma1h++;
                    else if (waitMin <= 240) queueAging.de1ha4h++;
                    else queueAging.mas4h++;
                }
            });

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
                agentFirstResponseAvgMin: agentFirstResponseAvg,
                resolutionTimeAvgMin: resolutionAvg,
                dayOfWeekDelays,
                highestDelayDay: maxDelayDayName,
                highestDelayValue: maxDelayValue,
                slaStats: {
                    optimo: slaOptimo,
                    aceptable: slaAceptable,
                    demorado: slaDemorado,
                    totalCasos: totalSlaCases,
                    cumplimientoPct: slaCumplimientoPct
                },
                queueAging,
                patientQuality: {
                    queueWaitAvgMin: queueWaitAvg,
                    queueWaitMedianMin: queueWaitMedian,
                    queueWaitUnder5mPct,
                    queueWaitUnder15mPct,
                    totalQueuedCases: allQueueWaitTimes.length,
                    agentFRTAvgMin: agentFRTAvg,
                    agentFRTMedianMin: agentFRTMedian,
                    agentFRTUnder3mPct,
                    totalFRTCases: allAgentFRTTimes.length,
                    handleTimeAvgMin: handleTimeAvg,
                    handleTimeMedianMin: handleTimeMedian,
                    handleTimeUnder10mPct: handleUnder10mPct,
                    totalHandleCases: allAgentHandleTimes.length,
                    fcrPct,
                    abandonmentRate,
                    totalAbandoned: abandonedCount,
                    hourlyWaitCurve: hourlyWaitCurveData,
                    peakWaitHour,
                    peakWaitValMin
                }
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
            {/* SUB-NAVEGACIÓN: OPERATIVO vs AUDITORÍA & PROYECCIONES IA        */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                display: 'flex',
                gap: '8px',
                background: '#FFFFFF',
                padding: '6px',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                width: 'fit-content',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
            }}>
                <button
                    type="button"
                    onClick={() => setActiveMetricsView('operativo')}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 18px',
                        borderRadius: '9px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        border: 'none',
                        background: activeMetricsView === 'operativo' ? '#0F2942' : 'transparent',
                        color: activeMetricsView === 'operativo' ? '#FFFFFF' : '#475569',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <Users size={16} />
                    Métricas Operativas & Agentes
                </button>

                <button
                    type="button"
                    onClick={() => setActiveMetricsView('ia_tokens')}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 18px',
                        borderRadius: '9px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        border: 'none',
                        background: activeMetricsView === 'ia_tokens' ? '#0284C7' : 'transparent',
                        color: activeMetricsView === 'ia_tokens' ? '#FFFFFF' : '#475569',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <Cpu size={16} />
                    Auditoría de Tokens & Proyecciones IA
                    <span style={{
                        background: activeMetricsView === 'ia_tokens' ? '#FFFFFF' : '#E0F2FE',
                        color: activeMetricsView === 'ia_tokens' ? '#0284C7' : '#0369A1',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontSize: '0.64rem',
                        fontWeight: 800
                    }}>
                        Control de Costos
                    </span>
                </button>
            </div>

            {activeMetricsView === 'ia_tokens' ? (
                <ContactCenterAiCostTab
                    timeRange={timeRange}
                    setTimeRange={setTimeRange}
                    customStartDate={customStartDate}
                    setCustomStartDate={setCustomStartDate}
                    customEndDate={customEndDate}
                    setCustomEndDate={setCustomEndDate}
                    arsRate={arsRate}
                    setArsRate={setArsRate}
                    addToast={addToast}
                />
            ) : (
                <>
                    {/* BANNER INFORMATIVO EN VISTA OPERATIVA HACIA TOKENS */}
                    <div 
                        onClick={() => setActiveMetricsView('ia_tokens')}
                        style={{
                            background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: '10px',
                            padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            cursor: 'pointer', transition: 'all 0.15s'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Cpu size={18} color="#0284C7" />
                            <span style={{ fontSize: '0.78rem', color: '#0369A1', fontWeight: 600 }}>
                                <strong>Control de Costos de IA:</strong> Se ha habilitado la auditoría en tiempo real de tokens consumidos por el Bot y proyecciones de gasto en USD/ARS.
                            </span>
                        </div>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', color: '#0284C7', fontWeight: 800 }}>
                            Ver Auditoría & Proyecciones <ChevronRight size={14} />
                        </span>
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
                                {loading ? '...' : (metrics.firstResponseTimeAvgMin === 0 ? '< 1 min' : `${metrics.firstResponseTimeAvgMin} min`)}
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
                        {metrics.agentFirstResponseAvgMin > 0 
                            ? `👩‍⚕️ Asesoras: ${metrics.agentFirstResponseAvgMin} min • 🤖 Bot: < 5 seg`
                            : 'Tiempo hasta primer contacto (Inmediato por Bot)'}
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
                            <span style={{ 
                                fontSize: '0.72rem', 
                                fontWeight: 800, 
                                color: metrics.highestDelayDay ? '#DC2626' : '#059669', 
                                textTransform: 'uppercase', 
                                letterSpacing: '0.4px' 
                            }}>
                                {metrics.highestDelayDay ? 'Día de Mayor Demora' : 'Demora Semanal'}
                            </span>
                            <div style={{ 
                                fontSize: metrics.highestDelayDay ? '1.5rem' : '1.35rem', 
                                fontWeight: 900, 
                                color: metrics.highestDelayDay ? '#DC2626' : '#059669', 
                                marginTop: '4px' 
                            }}>
                                {loading ? '...' : (
                                    metrics.highestDelayDay 
                                        ? `${metrics.highestDelayDay} (${metrics.highestDelayValue || 0}m)` 
                                        : 'Óptima (< 1 min)'
                                )}
                            </div>
                        </div>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '10px', 
                            background: metrics.highestDelayDay ? '#FEF2F2' : '#ECFDF5',
                            color: metrics.highestDelayDay ? '#DC2626' : '#059669', 
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            {metrics.highestDelayDay ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
                        </div>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '10px' }}>
                        {metrics.highestDelayDay 
                            ? 'Cuello de botella semanal a reforzar' 
                            : 'Sin cuellos de botella detectados en la semana'}
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
                        <div style={{ 
                            width: '32px', height: '32px', borderRadius: '8px', 
                            background: metrics.highestDelayDay ? '#FEF2F2' : '#EFF6FF', 
                            color: metrics.highestDelayDay ? '#DC2626' : '#0284C7', 
                            display: 'flex', alignItems: 'center', justifyContent: 'center' 
                        }}>
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

                    {metrics.highestDelayDay ? (
                        <div style={{
                            padding: '6px 14px', borderRadius: '8px', background: '#FEF2F2',
                            border: '1px solid #FECACA', display: 'flex', alignItems: 'center', gap: '6px'
                        }}>
                            <AlertTriangle size={14} color="#DC2626" />
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#991B1B' }}>
                                Día Crítico: {metrics.highestDelayDay} ({metrics.highestDelayValue || 0} min)
                            </span>
                        </div>
                    ) : (
                        <div style={{
                            padding: '6px 14px', borderRadius: '8px', background: '#ECFDF5',
                            border: '1px solid #A7F3D0', display: 'flex', alignItems: 'center', gap: '6px'
                        }}>
                            <CheckCircle2 size={14} color="#059669" />
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#065F46' }}>
                                Flujo Fluido: Sin demoras críticas
                            </span>
                        </div>
                    )}
                </div>

                <div style={{ width: '100%', height: '220px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={metrics.dayOfWeekDelays} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                            <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#64748B' }} />
                            <YAxis tick={{ fontSize: 10, fill: '#64748B' }} unit="m" domain={[0, 'auto']} />
                            <Tooltip 
                                cursor={{ fill: 'rgba(2, 132, 199, 0.06)', radius: 6 }}
                                contentStyle={{ background: '#FFFFFF', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.75rem', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
                                formatter={(val) => {
                                    const num = Number(val) || 0;
                                    if (num === 0) return ['Respuesta inmediata (< 1 min)', 'Demora Promedio'];
                                    if (num < 1) return [`${Math.round(num * 60)} segundos`, 'Demora Promedio'];
                                    return [`${num} minutos promedio`, 'Demora Promedio'];
                                }}
                                labelFormatter={(label, payload) => {
                                    const m = payload?.[0]?.payload?.muestras || 0;
                                    return `${label} (${m} ${m === 1 ? 'consulta analizada' : 'consultas analizadas'})`;
                                }}
                            />
                            <Bar dataKey="demoraPromedioMin" name="Minutos de Demora" radius={[6, 6, 0, 0]} minPointSize={6}>
                                {metrics.dayOfWeekDelays.map((entry, index) => (
                                    <Cell 
                                        key={`cell-${index}`} 
                                        fill={entry.dia === metrics.highestDelayDay && metrics.highestDelayDay ? '#DC2626' : (entry.muestras > 0 ? '#0284C7' : '#E2E8F0')} 
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* 3.B PANEL DE CALIDAD DE ATENCIÓN AL PACIENTE & TIEMPOS OPERATIVOS */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0',
                padding: '22px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: '20px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '38px', height: '38px', borderRadius: '10px',
                            background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                            color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 2px 8px rgba(2, 132, 199, 0.25)'
                        }}>
                            <ShieldCheck size={22} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F2942' }}>
                                    Panel Clínico de Tiempos & Calidad de Atención al Paciente
                                </h3>
                                <span style={{
                                    fontSize: '0.66rem', fontWeight: 800, padding: '2px 8px', borderRadius: '12px',
                                    background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0'
                                }}>
                                    Meta SLA: &lt; 15 min
                                </span>
                            </div>
                            <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#64748B' }}>
                                Medición exhaustiva de tiempos de espera en cola, velocidad de 1er contacto humano, resolución neta (AHT) y retención del paciente
                            </p>
                        </div>
                    </div>

                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '8px 14px', borderRadius: '10px',
                        background: metrics.slaStats?.cumplimientoPct >= 85 ? '#F0FDF4' : '#FFFBEB',
                        border: `1px solid ${metrics.slaStats?.cumplimientoPct >= 85 ? '#86EFAC' : '#FDE68A'}`
                    }}>
                        {metrics.slaStats?.cumplimientoPct >= 85 ? (
                            <CheckCircle2 size={16} color="#059669" />
                        ) : (
                            <AlertTriangle size={16} color="#D97706" />
                        )}
                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: metrics.slaStats?.cumplimientoPct >= 85 ? '#166534' : '#92400E' }}>
                            {metrics.slaStats?.cumplimientoPct || 0}% Cumplimiento General de SLA
                        </span>
                    </div>
                </div>

                {/* ── CUADRÍCULA DE 4 TARJETAS PRINCIPALES DE CALIDAD AL PACIENTE ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                    
                    {/* 1. TIEMPO DE ESPERA EN COLA (QUEUE WAIT TIME) */}
                    <div style={{
                        background: '#FFFFFF', borderRadius: '12px', padding: '16px 18px',
                        border: '1.5px solid #BAE6FD', display: 'flex', flexDirection: 'column', gap: '8px',
                        boxShadow: '0 2px 6px rgba(2, 132, 199, 0.05)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0369A1', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                Espera en Cola (Cola a Asesora)
                            </span>
                            <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: '#F0F9FF', color: '#0284C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Clock size={16} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#0F2942' }}>
                                {loading ? '...' : (metrics.patientQuality?.queueWaitAvgMin === 0 ? '< 1 min' : `${metrics.patientQuality?.queueWaitAvgMin} min`)}
                            </div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0284C7' }}>
                                Promedio
                            </span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#475569', background: '#F8FAFC', padding: '4px 8px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                            Mediana: <strong>{metrics.patientQuality?.queueWaitMedianMin || 0} min</strong> • {metrics.patientQuality?.queueWaitUnder5mPct || 0}% en &lt; 5 min
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                            Desde que el paciente pide atención hasta que una asesora toma el chat
                        </div>
                    </div>

                    {/* 2. TIEMPO HASTA 1ER CONTACTO CON LA ASESORA (AGENT FRT) */}
                    <div style={{
                        background: '#FFFFFF', borderRadius: '12px', padding: '16px 18px',
                        border: '1.5px solid #A7F3D0', display: 'flex', flexDirection: 'column', gap: '8px',
                        boxShadow: '0 2px 6px rgba(5, 150, 105, 0.05)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#065F46', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                1er Contacto con Asesora (FRT)
                            </span>
                            <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <UserCheck size={16} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#0F2942' }}>
                                {loading ? '...' : (metrics.patientQuality?.agentFRTAvgMin === 0 ? '< 1 min' : `${metrics.patientQuality?.agentFRTAvgMin} min`)}
                            </div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#059669' }}>
                                Promedio
                            </span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#166534', background: '#F0FDF4', padding: '4px 8px', borderRadius: '6px', border: '1px solid #BBF7D0' }}>
                            Mediana: <strong>{metrics.patientQuality?.agentFRTMedianMin || 0} min</strong> • {metrics.patientQuality?.agentFRTUnder3mPct || 0}% en &lt; 3 min
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                            Tiempo de respuesta de la operadora tras auto-asignarse la ficha
                        </div>
                    </div>

                    {/* 3. TIEMPO PROMEDIO DE RESOLUCIÓN POR CHAT (AHT - HANDLE TIME) */}
                    <div style={{
                        background: '#FFFFFF', borderRadius: '12px', padding: '16px 18px',
                        border: '1.5px solid #DDD6FE', display: 'flex', flexDirection: 'column', gap: '8px',
                        boxShadow: '0 2px 6px rgba(139, 92, 246, 0.05)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#5B21B6', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                Resolución Neta (AHT Operativo)
                            </span>
                            <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: '#F5F3FF', color: '#8B5CF6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <CheckSquare size={16} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#0F2942' }}>
                                {loading ? '...' : (metrics.patientQuality?.handleTimeAvgMin === 0 ? '< 5 min' : `${metrics.patientQuality?.handleTimeAvgMin} min`)}
                            </div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#8B5CF6' }}>
                                Promedio
                            </span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#5B21B6', background: '#F5F3FF', padding: '4px 8px', borderRadius: '6px', border: '1px solid #DDD6FE' }}>
                            Mediana: <strong>{metrics.patientQuality?.handleTimeMedianMin || 0} min</strong> • {metrics.patientQuality?.totalHandleCases || 0} casos analizados
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                            Específicamente entre que lo agarra el agente y lo finaliza
                        </div>
                    </div>

                    {/* 4. CALIDAD, RETENCIÓN & FCR */}
                    <div style={{
                        background: '#FFFFFF', borderRadius: '12px', padding: '16px 18px',
                        border: '1.5px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '8px',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                Resolución 1er Contacto (FCR)
                            </span>
                            <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: '#F8FAFC', color: '#0284C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Target size={16} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#059669' }}>
                                {loading ? '...' : `${metrics.patientQuality?.fcrPct || 100}%`}
                            </div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#059669' }}>
                                Éxito FCR
                            </span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#475569', background: '#F8FAFC', padding: '4px 8px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                            Abandono en Cola: <strong style={{ color: (metrics.patientQuality?.abandonmentRate || 0) > 8 ? '#DC2626' : '#059669' }}>{metrics.patientQuality?.abandonmentRate || 0}%</strong> ({metrics.patientQuality?.totalAbandoned || 0} casos)
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                            Pacientes cuya consulta fue resuelta sin reingreso en 24 hs
                        </div>
                    </div>

                </div>

                {/* ── GRÁFICO: CURVA HORARIA DE DEMORA DE ESPERA (¿A QUÉ HORA ESPERAN MÁS?) ── */}
                <div style={{
                    background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0',
                    padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#EFF6FF', color: '#0284C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Timer size={16} />
                            </div>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 800, color: '#0F2942' }}>
                                    Curva Horaria de Demora del Paciente (Minutos de Espera en Cola según Hora de Ingreso)
                                </h4>
                                <p style={{ margin: '1px 0 0', fontSize: '0.72rem', color: '#64748B' }}>
                                    Permite detectar en qué franjas horarias se generan los cuellos de botella para reasignar turnos de operadoras
                                </p>
                            </div>
                        </div>

                        {metrics.patientQuality?.peakWaitHour && (
                            <span style={{
                                fontSize: '0.72rem', fontWeight: 800, padding: '4px 10px', borderRadius: '20px',
                                background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', display: 'flex', alignItems: 'center', gap: '6px'
                            }}>
                                <AlertTriangle size={13} />
                                Pico de Demora: {metrics.patientQuality.peakWaitHour} (~{metrics.patientQuality.peakWaitValMin} min)
                            </span>
                        )}
                    </div>

                    <div style={{ width: '100%', height: '210px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={metrics.patientQuality?.hourlyWaitCurve || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                                <XAxis dataKey="hora" tick={{ fontSize: 10, fill: '#64748B' }} interval={1} />
                                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} unit="m" allowDecimals={false} />
                                <Tooltip 
                                    cursor={{ fill: 'rgba(2, 132, 199, 0.06)', radius: 4 }}
                                    contentStyle={{ background: '#FFFFFF', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.74rem' }}
                                    formatter={(val, name, item) => [`${val} minutos promedio (${item.payload.casos || 0} pacientes)`, 'Espera en Cola']}
                                />
                                <Bar dataKey="esperaMin" name="Minutos de Espera" radius={[4, 4, 0, 0]}>
                                    {(metrics.patientQuality?.hourlyWaitCurve || []).map((entry, index) => (
                                        <Cell 
                                            key={`bar-${index}`} 
                                            fill={entry.esperaMin >= 15 ? '#DC2626' : (entry.esperaMin >= 8 ? '#D97706' : '#0284C7')} 
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '0.7rem', color: '#64748B', borderTop: '1px dashed #CBD5E1', paddingTop: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0284C7', display: 'inline-block' }}></span>
                                &lt; 8 min (Excelente)
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#D97706', display: 'inline-block' }}></span>
                                8 - 15 min (Atención)
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#DC2626', display: 'inline-block' }}></span>
                                &gt; 15 min (Refuerzo necesario)
                            </span>
                        </div>
                        <span>Cómputo en base a {metrics.patientQuality?.totalQueuedCases || 0} esperas registradas</span>
                    </div>
                </div>

                {/* ── ENVEJECIMIENTO DE COLA ACTIVA (QUEUE AGING EN TIEMPO REAL) ── */}
                <div style={{
                    background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0',
                    padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Zap size={14} color="#0284C7" />
                            <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0F2942' }}>
                                Envejecimiento de la Cola Activa ({metrics.queueAging?.totalActivas || 0} conversaciones abiertas en este instante)
                            </span>
                        </div>
                        <span style={{ fontSize: '0.68rem', color: '#64748B' }}>
                            Tiempos de inactividad de chats no archivados
                        </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                        <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '8px', padding: '8px 10px', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#047857' }}>&lt; 15 min</div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#065F46' }}>{metrics.queueAging?.menos15m || 0}</div>
                            <div style={{ fontSize: '0.62rem', color: '#047857' }}>Al día</div>
                        </div>
                        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '8px 10px', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#1D4ED8' }}>15 a 60 min</div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#1E40AF' }}>{metrics.queueAging?.de15ma1h || 0}</div>
                            <div style={{ fontSize: '0.62rem', color: '#1D4ED8' }}>En curso</div>
                        </div>
                        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '8px 10px', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#B45309' }}>1 a 4 horas</div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#92400E' }}>{metrics.queueAging?.de1ha4h || 0}</div>
                            <div style={{ fontSize: '0.62rem', color: '#B45309' }}>Atención requerida</div>
                        </div>
                        <div style={{ background: metrics.queueAging?.mas4h > 0 ? '#FEF2F2' : '#F8FAFC', border: `1px solid ${metrics.queueAging?.mas4h > 0 ? '#FECACA' : '#E2E8F0'}`, borderRadius: '8px', padding: '8px 10px', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.66rem', fontWeight: 800, color: metrics.queueAging?.mas4h > 0 ? '#DC2626' : '#64748B' }}>&gt; 4 horas</div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: metrics.queueAging?.mas4h > 0 ? '#991B1B' : '#64748B' }}>{metrics.queueAging?.mas4h || 0}</div>
                            <div style={{ fontSize: '0.62rem', color: metrics.queueAging?.mas4h > 0 ? '#DC2626' : '#64748B' }}>Demorado</div>
                        </div>
                    </div>
                </div>

                {/* ── CUMPLIMIENTO DE SLA POR ASESORA ── */}
                {metrics.byAgentList && metrics.byAgentList.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                            Cumplimiento de SLA (&lt; 15 min) por Asesora
                        </span>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '8px' }}>
                            {metrics.byAgentList.map(ag => (
                                <div key={ag.id} style={{
                                    background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px',
                                    padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{
                                            width: '28px', height: '28px', borderRadius: '50%',
                                            background: '#EFF6FF', color: '#0284C7', fontWeight: 800, fontSize: '0.72rem',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            {ag.name.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#0F2942' }}>{ag.name}</div>
                                            <div style={{ fontSize: '0.65rem', color: '#64748B' }}>
                                                {ag.avgResponseTimeMin > 0 ? `Promedio: ${ag.avgResponseTimeMin}m` : 'Respuesta inmediata'} • {ag.assignedCount || 0} tomados
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <span style={{
                                            fontSize: '0.74rem', fontWeight: 800,
                                            color: (ag.slaCumplimientoPct || 100) >= 85 ? '#059669' : '#D97706',
                                            background: (ag.slaCumplimientoPct || 100) >= 85 ? '#ECFDF5' : '#FFFBEB',
                                            padding: '2px 8px', borderRadius: '6px',
                                            border: `1px solid ${(ag.slaCumplimientoPct || 100) >= 85 ? '#A7F3D0' : '#FDE68A'}`
                                        }}>
                                            {ag.slaCumplimientoPct || 100}% SLA
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
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
                                Rendimiento Desplegable por Asesora y Tiempos de Atención
                            </h3>
                            <p style={{ margin: '1px 0 0', fontSize: '0.74rem', color: '#64748B' }}>
                                Despliega cada asesora para auditar su volumen, velocidad de 1er contacto (FRT) y tiempo neto de resolución (AHT)
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
                                            width: '34px', height: '34px', borderRadius: '50%',
                                            background: ag.color, color: '#FFFFFF',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.78rem', fontWeight: 800, flexShrink: 0
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

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F2942' }}>
                                                {ag.count} msgs
                                            </div>
                                            <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                                {pct}% del total
                                            </div>
                                        </div>

                                        <div style={{
                                            padding: '4px 8px', borderRadius: '6px', background: '#F0F9FF',
                                            color: '#0369A1', fontSize: '0.7rem', fontWeight: 700, border: '1px solid #BAE6FD'
                                        }}>
                                            📥 {ag.assignedCount || ag.resolvedCount} tomados
                                        </div>

                                        <div style={{
                                            padding: '4px 8px', borderRadius: '6px', background: '#F1F5F9',
                                            color: '#475569', fontSize: '0.7rem', fontWeight: 700
                                        }}>
                                            ⚡ FRT: {ag.avgAgentFRTMin || ag.avgResponseTimeMin}m
                                        </div>

                                        <div style={{
                                            padding: '4px 8px', borderRadius: '6px', background: '#F5F3FF',
                                            color: '#6D28D9', fontSize: '0.7rem', fontWeight: 700, border: '1px solid #DDD6FE'
                                        }}>
                                            🎯 AHT: {ag.avgHandleTimeMin > 0 ? `${ag.avgHandleTimeMin}m` : '< 5m'}
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
                                            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                                            gap: '10px'
                                        }}>
                                            <div style={{ background: '#FFFFFF', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>Total Despachos</div>
                                                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0F2942', marginTop: '2px' }}>{ag.count}</div>
                                            </div>
                                            <div style={{ background: '#FFFFFF', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>Chats Tomados</div>
                                                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0284C7', marginTop: '2px' }}>{ag.assignedCount || ag.resolvedCount}</div>
                                            </div>
                                            <div style={{ background: '#FFFFFF', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>Casos Finalizados</div>
                                                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#059669', marginTop: '2px' }}>{ag.resolvedCount}</div>
                                            </div>
                                            <div style={{ background: '#FFFFFF', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>1er Contacto (FRT)</div>
                                                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#059669', marginTop: '2px' }}>{ag.avgAgentFRTMin || ag.avgResponseTimeMin} min</div>
                                            </div>
                                            <div style={{ background: '#FFFFFF', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>Resolución Neta AHT</div>
                                                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#8B5CF6', marginTop: '2px' }}>
                                                    {ag.avgHandleTimeMin > 0 ? `${ag.avgHandleTimeMin}m` : '< 5m'}
                                                </div>
                                                <div style={{ fontSize: '0.62rem', color: '#64748B' }}>Mediana: {ag.medianHandleTimeMin || 0}m</div>
                                            </div>
                                            <div style={{ background: '#FFFFFF', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>Cumplimiento SLA</div>
                                                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: ag.slaCumplimientoPct >= 85 ? '#059669' : '#D97706', marginTop: '2px' }}>
                                                    {ag.slaCumplimientoPct}%
                                                </div>
                                                <div style={{ fontSize: '0.62rem', color: '#64748B' }}>Pico: {ag.peakHour}</div>
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
            </>
            )}

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
