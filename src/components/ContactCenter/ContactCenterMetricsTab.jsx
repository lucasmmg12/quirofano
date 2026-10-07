import React, { useState, useEffect, useMemo } from 'react';
import { 
    BarChart3, Users, MessageSquare, Bot, RefreshCw, CheckCircle2, 
    Sparkles, Activity, Calendar, ArrowUpRight, ArrowDownLeft, Send, 
    Inbox, Stethoscope, CalendarCheck, Clock, FileCheck, ShieldAlert,
    ChevronRight, ChevronDown, ChevronUp, Check, AlertCircle, AlertTriangle, 
    FileText, HelpCircle, PhoneCall, DollarSign, TrendingUp, X, 
    Calculator, Info, ShieldCheck, Zap, Award, UserCheck, Timer,
    CheckSquare, TrendingDown, Smile, UserX, Layers, Target, Cpu,
    ChevronLeft, Printer
} from 'lucide-react';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    BarChart,
    Bar,
    AreaChart,
    Area,
    PieChart,
    Pie,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    Legend,
    Cell
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { CONTACT_CENTER_AGENTS, isClosedOrArchived } from '../../services/contactCenterService';
import { INCENTIVO_CONFIG, calculateEscalon } from '../../services/incentivoContactCenterService';
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

export default function ContactCenterMetricsTab({ addToast, onNavigateToIncentivos }) {
    const [loading, setLoading] = useState(true);
    const [streamingProgress, setStreamingProgress] = useState(null);
    
    // Selector de vista: 'operativo' | 'ia_tokens'
    const [activeMetricsView, setActiveMetricsView] = useState('operativo');

    // Selector de mes a mes (Formato 'YYYY-MM')
    const getCurrentMonthKey = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };
    const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey);
    const [showMonthlyReportModal, setShowMonthlyReportModal] = useState(false);

    // Opciones de los últimos 12 meses para selector y reportes mes a mes
    const monthOptions = useMemo(() => {
        const list = [];
        const now = new Date();
        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const labelRaw = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
            const label = labelRaw.charAt(0).toUpperCase() + labelRaw.slice(1);
            list.push({ key, label, year: d.getFullYear(), month: d.getMonth() });
        }
        return list;
    }, []);

    const handlePrevMonth = () => {
        const idx = monthOptions.findIndex(m => m.key === selectedMonth);
        if (idx < monthOptions.length - 1) {
            setSelectedMonth(monthOptions[idx + 1].key);
            setTimeRange('this_month');
        }
    };

    const handleNextMonth = () => {
        const idx = monthOptions.findIndex(m => m.key === selectedMonth);
        if (idx > 0) {
            setSelectedMonth(monthOptions[idx - 1].key);
            setTimeRange('this_month');
        }
    };

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

    // Carga y cómputo de métricas desde Supabase con streaming en lotes (Optimizado para RAM < 5MB)
    const loadMetrics = async () => {
        setLoading(true);
        setStreamingProgress({ current: 0, text: 'Iniciando carga de datos...' });
        try {
            // 1. Determinar fechas de inicio y fin según el filtro seleccionado
            let filterStart = null;
            let filterEnd = null;
            const now = new Date();

            if (timeRange === 'this_month') {
                const [yStr, mStr] = (selectedMonth || getCurrentMonthKey()).split('-');
                const y = parseInt(yStr, 10);
                const m = parseInt(mStr, 10) - 1;
                filterStart = new Date(y, m, 1, 0, 0, 0);
                filterEnd = new Date(y, m + 1, 0, 23, 59, 59);
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

            // ── A. Estructuras de Acumulación Escalar (RAM ultrabaja < 5MB) ──
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
                    firstResponseTimesMin: [],
                    handleTimesMin: [],
                    categoriesTally: { turnos: 0, autorizaciones: 0, guardias: 0, informes: 0, otros: 0 }
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

            const hourlyIncomingCounts = Array(24).fill(0);
            const dailyOutTally = {};
            const responseTimesByDay = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
            const allFirstResponseTimes = [];
            const allHumanResponseTimes = [];

            // Tracker ultraliviano indexado por teléfono (solo timestamps primitivos: <100 KB total)
            const phoneTracker = new Map();

            // Triage en vuelo (sólo primer mensaje de cada paciente)
            const choicesTally = {
                solicitar_turno: 0,
                reprogramar_turno: 0,
                autorizar: 0,
                guardia: 0,
                informes: 0,
                otros: 0
            };
            const phoneTriageDone = new Set();

            // ── B. Streaming en Lotes de Mensajes (Paginación de a 1.000 para no saturar memoria) ──
            const pageSize = 1000;
            let offset = 0;
            let hasMore = true;
            let totalFetched = 0;

            while (hasMore) {
                let q = supabase
                    .from('whatsapp_messages')
                    .select('id, phone, direction, sender_name, content, created_at, raw_payload')
                    .eq('line_id', 'contact_center')
                    .order('created_at', { ascending: true })
                    .range(offset, offset + pageSize - 1);

                if (filterStart) q = q.gte('created_at', filterStart.toISOString());
                if (filterEnd) q = q.lte('created_at', filterEnd.toISOString());

                const { data: chunk, error: chunkErr } = await q;
                if (chunkErr) throw chunkErr;

                if (!chunk || chunk.length === 0) {
                    hasMore = false;
                    break;
                }

                totalFetched += chunk.length;
                setStreamingProgress({ current: totalFetched, text: `Procesando ${totalFetched.toLocaleString()} mensajes...` });

                for (let i = 0; i < chunk.length; i++) {
                    const m = chunk[i];
                    const mDate = new Date(m.created_at);
                    const mTime = mDate.getTime();
                    const normPhone = m.phone ? m.phone.trim() : null;

                    if (m.direction === 'outgoing') {
                        totalOut++;
                        const dayKey = mDate.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
                        dailyOutTally[dayKey] = (dailyOutTally[dayKey] || 0) + 1;

                        const sender = (m.sender_name || '').toLowerCase();
                        const rawAgent = (m.raw_payload?.agent || '').toLowerCase();
                        const isBot = !!(
                            m.raw_payload?.bot || 
                            m.raw_payload?.source === 'bot_triage' || 
                            sender.includes('bot') || 
                            sender.includes('sistema adm-qui')
                        );

                        let matchedAgId = null;
                        if (isBot) {
                            botCount++;
                        } else {
                            agentCount++;
                            for (const ag of ALL_AGENTS_METRICS) {
                                if (
                                    rawAgent === ag.id || 
                                    rawAgent === (ag.username || '').toLowerCase() ||
                                    (ag.legacyId && rawAgent === ag.legacyId) ||
                                    sender.includes(ag.id) ||
                                    (ag.legacyId && sender.includes(ag.legacyId)) ||
                                    sender.includes((ag.name || '').toLowerCase())
                                ) {
                                    matchedAgId = ag.id;
                                    break;
                                }
                            }
                            if (!matchedAgId) matchedAgId = 'otros_operadores';

                            agentDataMap[matchedAgId].count++;
                            agentDataMap[matchedAgId].hourlyMap[mDate.getHours()]++;
                            agentDataMap[matchedAgId].dayOfWeekMap[mDate.getDay()]++;
                        }

                        if (normPhone) {
                            let tracker = phoneTracker.get(normPhone);
                            if (!tracker) {
                                tracker = {
                                    firstInTime: null,
                                    firstHumanOutTime: null,
                                    firstHumanOutAgent: null,
                                    firstAnyOutTime: null,
                                    inDayOfWeek: null,
                                    incomingTimestamps: [],
                                    humanOutTimestamps: []
                                };
                                phoneTracker.set(normPhone, tracker);
                            }

                            if (!isBot) {
                                tracker.humanOutTimestamps.push(mTime);
                                if (tracker.firstInTime && !tracker.firstHumanOutTime && mTime >= tracker.firstInTime) {
                                    tracker.firstHumanOutTime = mTime;
                                    tracker.firstHumanOutAgent = matchedAgId;
                                }
                            }

                            if (tracker.firstInTime && !tracker.firstAnyOutTime && mTime >= tracker.firstInTime) {
                                tracker.firstAnyOutTime = mTime;
                            }
                        }
                    } else if (m.direction === 'incoming') {
                        totalIn++;
                        hourlyIncomingCounts[mDate.getHours()]++;

                        if (normPhone) {
                            let tracker = phoneTracker.get(normPhone);
                            if (!tracker) {
                                tracker = {
                                    firstInTime: mTime,
                                    firstHumanOutTime: null,
                                    firstHumanOutAgent: null,
                                    firstAnyOutTime: null,
                                    inDayOfWeek: mDate.getDay(),
                                    incomingTimestamps: [mTime],
                                    humanOutTimestamps: []
                                };
                                phoneTracker.set(normPhone, tracker);
                            } else {
                                if (!tracker.firstInTime) {
                                    tracker.firstInTime = mTime;
                                    tracker.inDayOfWeek = mDate.getDay();
                                }
                                tracker.incomingTimestamps.push(mTime);
                            }

                            // Triage inicial ultraliviano: sólo se analiza la 1ra vez por teléfono
                            if (!phoneTriageDone.has(normPhone) && m.content) {
                                phoneTriageDone.add(normPhone);
                                const txt = m.content.toLowerCase();
                                if (/\b(reprogramar|cambiar\s+turno|cambio\s+de\s+turno|otra\s+fecha|otro\s+dia|no\s+puedo\s+ir)\b/i.test(txt)) {
                                    choicesTally.reprogramar_turno++;
                                } else if (/\b(autoriz|estudio|orden|ecograf|laboratorio|pap|mamograf|tomograf|rayos|rx|resonanc)\b/i.test(txt) || txt.includes('2')) {
                                    choicesTally.autorizar++;
                                } else if (/\b(guardia|urgencia|emergencia)\b/i.test(txt) || txt.includes('3')) {
                                    choicesTally.guardia++;
                                } else if (/\b(informe|resultado|horario|telefono|web|direccion|consulta|donde\s+queda|atencion)\b/i.test(txt) || txt.includes('4')) {
                                    choicesTally.informes++;
                                } else if (/\b(turno|turnos|solicitar|nuevo|doctor|doctora|dr|dra|cita|consulta|atencion|especialidad|ginecolog|pediatr|cardiolog|oftalmolog)\b/i.test(txt) || txt.includes('1')) {
                                    choicesTally.solicitar_turno++;
                                } else {
                                    choicesTally.otros++;
                                }
                            }
                        }
                    }
                }

                if (chunk.length < pageSize) {
                    hasMore = false;
                } else {
                    offset += pageSize;
                }
            }

            // ── C. Calcular Tiempos de Respuesta de Asesoras desde phoneTracker ──
            for (const tracker of phoneTracker.values()) {
                if (tracker.firstInTime && tracker.firstHumanOutTime) {
                    const diffMin = (tracker.firstHumanOutTime - tracker.firstInTime) / 60000;
                    if (diffMin >= 0 && diffMin < 2880) { // menos de 48 hs
                        const valMin = Number(diffMin.toFixed(1));
                        allHumanResponseTimes.push(valMin);
                        if (tracker.inDayOfWeek !== null) {
                            responseTimesByDay[tracker.inDayOfWeek].push(valMin);
                        }
                        if (tracker.firstHumanOutAgent && agentDataMap[tracker.firstHumanOutAgent]) {
                            agentDataMap[tracker.firstHumanOutAgent].responseTimesMin.push(valMin);
                        }
                    }
                }
                if (tracker.firstInTime && tracker.firstAnyOutTime) {
                    const diffMin = Math.max(0, (tracker.firstAnyOutTime - tracker.firstInTime) / 60000);
                    if (diffMin < 2880) {
                        allFirstResponseTimes.push(Number(diffMin.toFixed(1)));
                    }
                }
            }

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
            // ── D. Carga Paginada de Conversaciones de Contact Center ──
            let convOffset = 0;
            let convHasMore = true;
            const filteredConvs = [];

            while (convHasMore) {
                let cq = supabase
                    .from('contact_center_conversations')
                    .select('phone, status, resolution_reason, motivo_consulta, closed_at, closed_by_agent_name, closed_by_agent_id, assigned_at, assigned_agent_id, assigned_agent_name, created_at, updated_at')
                    .order('created_at', { ascending: true })
                    .range(convOffset, convOffset + pageSize - 1);

                if (filterStart) cq = cq.gte('created_at', filterStart.toISOString());
                if (filterEnd) cq = cq.lte('created_at', filterEnd.toISOString());

                const { data: cChunk, error: cErr } = await cq;
                if (cErr) throw cErr;

                if (!cChunk || cChunk.length === 0) {
                    convHasMore = false;
                    break;
                }

                filteredConvs.push(...cChunk);
                if (cChunk.length < pageSize) {
                    convHasMore = false;
                } else {
                    convOffset += pageSize;
                }
            }

            // ── E. Métricas de Calidad de Atención al Paciente & Tipos de Consulta ──
            let closedCount = 0;
            let activeCount = 0;
            const reasonsMap = {};
            MOTIVOS_FINALIZACION_CATALOGO.forEach(c => { reasonsMap[c.key] = 0; });

            const inquiryTypesMap = {
                turnos: 0,
                reprogramaciones: 0,
                autorizaciones: 0,
                guardia: 0,
                informes: 0,
                asesora: 0,
                otros: 0
            };

            const allQueueWaitTimes = [];
            const allAgentFRTTimes = [];
            const allAgentHandleTimes = [];
            const allResolutionTimes = [];
            const hourlyWaitMap = Array.from({ length: 24 }, () => []);
            let abandonedCount = 0;
            const resolvedPhonesWithCloseDate = [];

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
                const normPhone = c.phone ? c.phone.trim() : null;
                const tracker = normPhone ? phoneTracker.get(normPhone) : null;

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
                if (!assignedDate && tracker?.firstHumanOutTime) {
                    assignedDate = new Date(tracker.firstHumanOutTime);
                }

                // ── 1. TIEMPO DE ESPERA EN COLA (QUEUE WAIT TIME) ──
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
                if (assignedDate && tracker?.humanOutTimestamps?.length > 0) {
                    const assignedTimeMs = assignedDate.getTime();
                    const firstOutAfterAssign = tracker.humanOutTimestamps.find(t => t >= (assignedTimeMs - 30000));
                    if (firstOutAfterAssign) {
                        const frtMin = Math.max(0, (firstOutAfterAssign - assignedTimeMs) / 60000);
                        if (frtMin < 1440) { // menos de 24 hs
                            const valFRT = Number(frtMin.toFixed(1));
                            allAgentFRTTimes.push(valFRT);
                            if (matchedAssignedAgentId) {
                                agentDataMap[matchedAssignedAgentId].firstResponseTimesMin.push(valFRT);
                            }
                        }
                    }
                }

                // ── CLASIFICACIÓN DE TIPO DE CONSULTA DEL PACIENTE (TRIAGE CLÍNICO) ──
                const mQuery = (c.motivo_consulta || '').toLowerCase();
                if (mQuery) {
                    if (mQuery.includes('reprogram') || mQuery.includes('cambio de turno') || mQuery.includes('cancel')) {
                        inquiryTypesMap.reprogramaciones++;
                    } else if (mQuery.includes('autoriz') || mQuery.includes('estudio') || mQuery.includes('orden') || mQuery.includes('ecograf') || mQuery.includes('laboratorio') || mQuery.includes('flebolog') || mQuery.includes('pap')) {
                        inquiryTypesMap.autorizaciones++;
                    } else if (mQuery.includes('guardia') || mQuery.includes('urgencia')) {
                        inquiryTypesMap.guardia++;
                    } else if (mQuery.includes('informe') || mQuery.includes('resultado') || mQuery.includes('precio') || mQuery.includes('costo') || mQuery.includes('horario')) {
                        inquiryTypesMap.informes++;
                    } else if (mQuery.includes('turno') || mQuery.includes('cita') || mQuery.includes('especialidad') || mQuery.includes('médico') || mQuery.includes('doctor') || mQuery.includes('clínica') || mQuery.includes('clinica')) {
                        inquiryTypesMap.turnos++;
                    } else if (mQuery.includes('agente') || mQuery.includes('asesora') || mQuery.includes('humano')) {
                        inquiryTypesMap.asesora++;
                    } else {
                        inquiryTypesMap.otros++;
                    }
                }

                // ── 3. RESOLUCIÓN DE CASOS & AHT NETO DEL AGENTE ──
                if (isClosed) {
                    closedCount++;
                    const r = (c.resolution_reason || 'Otro / Aclaración en Nota').toLowerCase();
                    let foundMatch = false;

                    for (const cat of MOTIVOS_FINALIZACION_CATALOGO) {
                        const catKeyLow = cat.key.toLowerCase();
                        if (r.includes(catKeyLow) || catKeyLow.includes(r) ||
                            (cat.key === 'Turno Coordinado' && (r.includes('turno') || r.includes('coordinado') || r.includes('otorgado'))) ||
                            (cat.key === 'Consulta Informativa Resuelta' && (r.includes('informativa') || r.includes('información') || r.includes('resuelta'))) ||
                            (cat.key === 'Auto-gestión Bot Completa (Inactividad)' && (r.includes('auto-gestión') || r.includes('inactividad') || r.includes('bot'))) ||
                            (cat.key === 'Paciente No Responde' && (r.includes('no responde') || r.includes('time-out'))) ||
                            (cat.key === 'Cierre masivo de cola' && (r.includes('masivo') || r.includes('cola')))
                        ) {
                            reasonsMap[cat.key] = (reasonsMap[cat.key] || 0) + 1;
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
                    if (c.closed_at && normPhone) {
                        resolvedPhonesWithCloseDate.push({
                            phone: normPhone,
                            closedAt: new Date(c.closed_at).getTime()
                        });
                    }
                } else {
                    activeCount++;
                }

                // ── 4. DETECCIÓN DE ABANDONO EN COLA ──
                const hasAgentMsg = tracker?.humanOutTimestamps?.length > 0;
                const isAbandonedTimeout = (c.resolution_reason || '').toLowerCase().includes('no responde');
                if ((!hasAgentMsg && isClosed) || (isAbandonedTimeout && !c.assigned_at)) {
                    abandonedCount++;
                }
            });

            // ── Cómputo de FCR (First Contact Resolution en 24h) ──
            let fcrSuccessCount = 0;
            resolvedPhonesWithCloseDate.forEach(item => {
                const tracker = phoneTracker.get(item.phone);
                const hasReentry = tracker?.incomingTimestamps?.some(
                    t => t > item.closedAt && t <= (item.closedAt + 24 * 3600 * 1000)
                );
                if (!hasReentry) {
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

            // ── H. Comparativa Histórica Mes a Mes (Bot vs Agentes + Desglose por Asesora: 0 Bytes RAM) ──
            const last6Months = [];
            for (let i = 5; i >= 0; i--) {
                const dStart = new Date(now.getFullYear(), now.getMonth() - i, 1, 0, 0, 0);
                const dEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
                last6Months.push({
                    label: dStart.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }),
                    startIso: dStart.toISOString(),
                    endIso: dEnd.toISOString()
                });
            }

            const monthlyComparisonData = await Promise.all(
                last6Months.map(async (m) => {
                    const [resTotal, resBot, resVirginia, resSofia, resDaniela, resErica] = await Promise.all([
                        supabase.from('whatsapp_messages').select('*', { count: 'exact', head: true })
                            .eq('line_id', 'contact_center').eq('direction', 'outgoing')
                            .gte('created_at', m.startIso).lte('created_at', m.endIso),
                        supabase.from('whatsapp_messages').select('*', { count: 'exact', head: true })
                            .eq('line_id', 'contact_center').eq('direction', 'outgoing')
                            .gte('created_at', m.startIso).lte('created_at', m.endIso)
                            .ilike('sender_name', '%bot%'),
                        supabase.from('whatsapp_messages').select('*', { count: 'exact', head: true })
                            .eq('line_id', 'contact_center').eq('direction', 'outgoing')
                            .gte('created_at', m.startIso).lte('created_at', m.endIso)
                            .ilike('sender_name', '%virginia%'),
                        supabase.from('whatsapp_messages').select('*', { count: 'exact', head: true })
                            .eq('line_id', 'contact_center').eq('direction', 'outgoing')
                            .gte('created_at', m.startIso).lte('created_at', m.endIso)
                            .ilike('sender_name', '%sofia%'),
                        supabase.from('whatsapp_messages').select('*', { count: 'exact', head: true })
                            .eq('line_id', 'contact_center').eq('direction', 'outgoing')
                            .gte('created_at', m.startIso).lte('created_at', m.endIso)
                            .ilike('sender_name', '%daniela%'),
                        supabase.from('whatsapp_messages').select('*', { count: 'exact', head: true })
                            .eq('line_id', 'contact_center').eq('direction', 'outgoing')
                            .gte('created_at', m.startIso).lte('created_at', m.endIso)
                            .ilike('sender_name', '%erica%')
                    ]);

                    const sent = resTotal.count || 0;
                    const botSent = resBot.count || 0;
                    const agentSent = Math.max(0, sent - botSent);
                    const billable = Math.max(0, sent - MENSAJES_GRATIS_MENSUALES);
                    const costoUsd = +(billable * COSTO_POR_MENSAJE_USD).toFixed(2);
                    const costoArs = Math.round(costoUsd * (arsRate || COTIZACION_DOLAR_REF));

                    return {
                        mes: m.label,
                        enviados: sent,
                        bot: botSent,
                        agentes: agentSent,
                        botPct: sent > 0 ? Math.round((botSent / sent) * 100) : 0,
                        agentPct: sent > 0 ? Math.round((agentSent / sent) * 100) : 0,
                        virginia: resVirginia.count || 0,
                        sofia: resSofia.count || 0,
                        daniela: resDaniela.count || 0,
                        erica: resErica.count || 0,
                        gratis: Math.min(sent, MENSAJES_GRATIS_MENSUALES),
                        facturables: billable,
                        costoUsd,
                        costoArs
                    };
                })
            );

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
            const queueWaitUnder5mPct = allQueueWaitTimes.length > 0 ? Math.round((queueUnder5m / allQueueWaitTimes.length) * 100) : 100;
            const queueUnder15m = allQueueWaitTimes.filter(t => t <= 15).length;
            const queueWaitUnder15mPct = allQueueWaitTimes.length > 0 ? Math.round((queueUnder15m / allQueueWaitTimes.length) * 100) : 100;

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
                inquiryTypes: inquiryTypesMap,
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
            setStreamingProgress(null);
        }
    };

    useEffect(() => {
        loadMetrics();
    }, [timeRange, selectedMonth, customStartDate, customEndDate]);

    // Cálculo en tiempo real de la Bolsa 1 de Incentivos (50% de Productividad Mensual)
    const incentivoBolsa1 = useMemo(() => {
        const bolsaConfig = INCENTIVO_CONFIG.bolsas.mensajes;
        const totalMsgs = metrics.agentMessages || 0;
        const res = calculateEscalon(totalMsgs, 'mensajes');
        return {
            ...res,
            config: bolsaConfig,
            totalMsgs,
            base: bolsaConfig.base,
            meta: bolsaConfig.meta,
            tope: bolsaConfig.tope,
            maxMonto: bolsaConfig.maxMonto
        };
    }, [metrics.agentMessages]);

    // Gráfico de Torta: Distribución de Mensajes Tomados por Asesora (Excluyendo expresamente al Agente Lucas Marinero)
    const pieAsesorasData = useMemo(() => {
        const operadoras = (metrics.byAgentList || []).filter(ag => {
            const n = (ag.name || '').toLowerCase();
            return ag.id !== 'lmarinero' && !n.includes('lucas') && !n.includes('marinero');
        });

        const totalOperadoras = operadoras.reduce((sum, ag) => sum + (ag.count || 0), 0);

        return operadoras.map(ag => {
            const count = ag.count || 0;
            const pct = totalOperadoras > 0 ? Math.round((count / totalOperadoras) * 100) : 0;
            return {
                id: ag.id,
                name: ag.name,
                nombreCorto: ag.name.split(' ')[0],
                value: count,
                percentage: pct,
                color: ag.color || '#0284C7',
                avatar: ag.avatar || ag.name.substring(0, 2).toUpperCase(),
                assignedCount: ag.assignedCount || 0,
                avgResponseTimeMin: ag.avgResponseTimeMin || 0,
                slaCumplimientoPct: ag.slaCumplimientoPct || 100
            };
        });
    }, [metrics.byAgentList]);

    // Resumen de Tipos de Consulta del Paciente (Triage Clínico)
    const inquiryBreakdown = useMemo(() => {
        const inq = metrics.inquiryTypes || { turnos: 0, reprogramaciones: 0, autorizaciones: 0, guardia: 0, informes: 0, asesora: 0, otros: 0 };
        const total = Object.values(inq).reduce((a, b) => a + b, 0) || 1;

        return [
            { key: 'turnos', label: 'Solicitud / Gestión de Turnos', count: inq.turnos, color: '#0284C7', pct: Math.round((inq.turnos / total) * 100) },
            { key: 'reprogramaciones', label: 'Reprogramación / Cambio de Cita', count: inq.reprogramaciones, color: '#8B5CF6', pct: Math.round((inq.reprogramaciones / total) * 100) },
            { key: 'autorizaciones', label: 'Autorizaciones y Estudios Médicos', count: inq.autorizaciones, color: '#059669', pct: Math.round((inq.autorizaciones / total) * 100) },
            { key: 'guardia', label: 'Guardia & Urgencias 24hs', count: inq.guardia, color: '#DC2626', pct: Math.round((inq.guardia / total) * 100) },
            { key: 'informes', label: 'Informes, Resultados y Costos', count: inq.informes, color: '#D97706', pct: Math.round((inq.informes / total) * 100) },
            { key: 'asesora', label: 'Pase Directo a Asesora Humana', count: inq.asesora, color: '#0F2942', pct: Math.round((inq.asesora / total) * 100) },
            { key: 'otros', label: 'Otras Consultas / General', count: inq.otros, color: '#64748B', pct: Math.round((inq.otros / total) * 100) }
        ];
    }, [metrics.inquiryTypes]);

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

                    {/* SELECTOR Y NAVEGACIÓN MES A MES (DISPONIBLE EN ESTE MES O AL REVISAR HISTÓRICO) */}
                    {timeRange === 'this_month' && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: '#F8FAFC',
                            padding: '3px 6px',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1'
                        }}>
                            <button
                                type="button"
                                onClick={handlePrevMonth}
                                title="Mes anterior"
                                style={{
                                    background: '#FFFFFF',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: '5px',
                                    padding: '4px 6px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    color: '#475569'
                                }}
                            >
                                <ChevronLeft size={13} />
                            </button>
                            <select
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(e.target.value)}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    color: '#0F2942',
                                    outline: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                {monthOptions.map(m => (
                                    <option key={m.key} value={m.key}>{m.label}</option>
                                ))}
                            </select>
                            <button
                                type="button"
                                onClick={handleNextMonth}
                                title="Mes siguiente"
                                style={{
                                    background: '#FFFFFF',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: '5px',
                                    padding: '4px 6px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    color: '#475569'
                                }}
                            >
                                <ChevronRight size={13} />
                            </button>
                        </div>
                    )}

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

                    {/* BOTÓN INFORME MENSUAL EJECUTIVO */}
                    <button
                        type="button"
                        onClick={() => setShowMonthlyReportModal(true)}
                        title="Generar e imprimir informe mensual ejecutivo"
                        style={{
                            padding: '8px 14px',
                            borderRadius: '8px',
                            border: '1px solid #BAE6FD',
                            background: '#F0F9FF',
                            color: '#0284C7',
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 1px 3px rgba(2, 132, 199, 0.08)',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <Printer size={13} />
                        Informe Mensual
                    </button>

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

            {/* BARRA INFORMATIVA DE STREAMING EN VIVO */}
            {streamingProgress && (
                <div style={{
                    background: '#F0F9FF',
                    border: '1px solid #BAE6FD',
                    borderRadius: '10px',
                    padding: '10px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    boxShadow: '0 1px 4px rgba(2, 132, 199, 0.08)'
                }}>
                    <RefreshCw size={15} className="spin" color="#0284C7" />
                    <span style={{ fontSize: '0.76rem', color: '#0369A1', fontWeight: 700 }}>
                        {streamingProgress.text || 'Descargando y procesando mensajes en memoria ultra-eficiente...'}
                    </span>
                </div>
            )}

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
            {/* 1. SECCIÓN INCENTIVOS & DISTRIBUCIÓN OPERATIVA DE ASESORAS        */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
                gap: '16px'
            }}>
                {/* ── TARJETA A: BOLSA 1 DE INCENTIVOS (50% PRODUCTIVIDAD) ── */}
                <div style={{
                    background: 'linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)',
                    border: '1.5px solid #BAE6FD',
                    borderRadius: '14px',
                    padding: '18px 20px',
                    boxShadow: '0 4px 12px rgba(2, 132, 199, 0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                                width: '38px', height: '38px', borderRadius: '10px',
                                background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                                color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 4px 10px rgba(2, 132, 199, 0.25)'
                            }}>
                                <Award size={20} />
                            </div>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0F2942' }}>
                                        Bolsa 1 — Mensajes Asesoras
                                    </h3>
                                    <span style={{
                                        background: incentivoBolsa1.escalon >= 5 ? '#ECFDF5' : '#FFFBEB',
                                        color: incentivoBolsa1.escalon >= 5 ? '#059669' : '#D97706',
                                        fontSize: '0.66rem', fontWeight: 800, padding: '2px 8px', borderRadius: '20px',
                                        border: `1px solid ${incentivoBolsa1.escalon >= 5 ? '#A7F3D0' : '#FDE68A'}`
                                    }}>
                                        {incentivoBolsa1.escalon === 10 ? '🏆 TOPE ALCANZADO' : incentivoBolsa1.escalon >= 5 ? '🎯 META SUPERADA' : `ESCALÓN ${incentivoBolsa1.escalon} / 10`}
                                    </span>
                                </div>
                                <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#64748B' }}>
                                    Base: 6.500 • Meta: 7.500 • Tope: 8.500 msgs (Máx: $69.735,29 ARS)
                                </p>
                            </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.64rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Monto Bolsa 1</div>
                            <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#059669', lineHeight: 1.1 }}>
                                ${incentivoBolsa1.monto.toLocaleString('es-AR')} <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>ARS</span>
                            </div>
                        </div>
                    </div>

                    {/* BARRA DE PROGRESO DE LA BOLSA 1 */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748B', marginBottom: '5px' }}>
                            <span>
                                Total Equipo: <strong style={{ color: '#0F2942' }}>{metrics.agentMessages.toLocaleString('es-AR')} msgs</strong>
                            </span>
                            <span>
                                {metrics.agentMessages >= 8500 
                                    ? '🎉 100% de la Bolsa 1 Logrado' 
                                    : `Faltan ${(Math.max(0, 7500 - metrics.agentMessages)).toLocaleString('es-AR')} msgs p/ Meta`}
                            </span>
                        </div>

                        <div style={{
                            width: '100%', height: '12px', background: '#E2E8F0', borderRadius: '6px',
                            overflow: 'hidden', position: 'relative'
                        }}>
                            <div style={{
                                width: `${Math.min(100, Math.max(0, (metrics.agentMessages / 8500) * 100))}%`,
                                height: '100%',
                                background: metrics.agentMessages >= 8500 
                                    ? 'linear-gradient(90deg, #10B981, #059669)'
                                    : metrics.agentMessages >= 7500
                                    ? 'linear-gradient(90deg, #0284C7, #059669)'
                                    : 'linear-gradient(90deg, #38BDF8, #0284C7)',
                                transition: 'width 0.4s ease'
                            }} />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px', fontSize: '0.66rem', color: '#94A3B8' }}>
                            <span>0</span>
                            <span style={{ color: metrics.agentMessages >= 6500 ? '#0284C7' : '#94A3B8', fontWeight: 600 }}>Base: 6.500</span>
                            <span style={{ color: metrics.agentMessages >= 7500 ? '#059669' : '#94A3B8', fontWeight: 700 }}>🎯 Meta: 7.500 ($34.867)</span>
                            <span style={{ color: metrics.agentMessages >= 8500 ? '#059669' : '#94A3B8', fontWeight: 800 }}>🏆 Tope: 8.500 ($69.735)</span>
                        </div>
                    </div>

                    {/* ENLACE AL TABLERO COMPLETO DE INCENTIVOS */}
                    {onNavigateToIncentivos && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '6px' }}>
                            <button
                                type="button"
                                onClick={onNavigateToIncentivos}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    padding: '6px 12px', borderRadius: '8px', border: 'none',
                                    background: '#0F2942', color: '#FFFFFF', fontSize: '0.72rem',
                                    fontWeight: 700, cursor: 'pointer'
                                }}
                            >
                                <Target size={12} />
                                Abrir Pestaña de Incentivos
                            </button>
                        </div>
                    )}
                </div>

                {/* ── TARJETA B: GRÁFICO DE TORTA DE MENSAJES POR ASESORA (EXCLUYE LUCAS MARINERO) ── */}
                <div style={{
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '14px',
                    padding: '18px 20px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '12px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                                width: '32px', height: '32px', borderRadius: '8px',
                                background: '#ECFDF5', color: '#059669',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <Users size={16} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 800, color: '#0F2942' }}>
                                    Distribución de Mensajes del Equipo
                                </h3>
                                <p style={{ margin: '1px 0 0', fontSize: '0.7rem', color: '#64748B' }}>
                                    Volumen despachado por operadora en el período
                                </p>
                            </div>
                        </div>

                        <span style={{
                            fontSize: '0.64rem', fontWeight: 700, padding: '3px 8px', borderRadius: '20px',
                            background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0'
                        }}>
                            Excluye supervisión (L. Marinero)
                        </span>
                    </div>

                    {/* GRÁFICO DE TORTA Y LISTA DE ASESORAS */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ width: '130px', height: '130px', flexShrink: 0, position: 'relative' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={pieAsesorasData}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={36}
                                        outerRadius={58}
                                        paddingAngle={3}
                                    >
                                        {pieAsesorasData.map((entry, index) => (
                                            <Cell key={`cell-pie-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip 
                                        formatter={(val, name, item) => [
                                            `${val.toLocaleString('es-AR')} msgs (${item.payload.percentage}%)`,
                                            item.payload.name
                                        ]}
                                        contentStyle={{ background: '#FFFFFF', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.72rem' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            <div style={{
                                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                textAlign: 'center', pointerEvents: 'none'
                            }}>
                                <div style={{ fontSize: '0.62rem', color: '#94A3B8', fontWeight: 600 }}>Total</div>
                                <div style={{ fontSize: '0.86rem', fontWeight: 900, color: '#0F2942', lineHeight: 1 }}>
                                    {pieAsesorasData.reduce((s, a) => s + a.value, 0).toLocaleString('es-AR')}
                                </div>
                            </div>
                        </div>

                        {/* LISTA RESUMEN DE ASESORAS */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {pieAsesorasData.map((ag) => (
                                <div key={ag.id} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    fontSize: '0.72rem', padding: '3px 6px', borderRadius: '6px',
                                    background: '#F8FAFC'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: ag.color, display: 'inline-block' }} />
                                        <span style={{ fontWeight: 700, color: '#0F2942' }}>{ag.nombreCorto}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <strong style={{ color: '#0F2942' }}>{ag.value.toLocaleString('es-AR')}</strong>
                                        <span style={{
                                            fontSize: '0.64rem', fontWeight: 800, color: ag.color,
                                            background: '#FFFFFF', padding: '1px 5px', borderRadius: '4px',
                                            border: `1px solid ${ag.color}40`
                                        }}>
                                            {ag.percentage}%
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* COMPARATIVA HISTÓRICA MES A MES: BOT VS ASESORAS Y COSTOS META   */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0',
                padding: '22px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: '16px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '34px', height: '34px', borderRadius: '8px',
                            background: '#F0F9FF', color: '#0284C7',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <BarChart3 size={18} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0F2942' }}>
                                Evolución Mensual: Automatización Bot vs Asesoras Humanas y Costos Meta
                            </h3>
                            <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#64748B' }}>
                                Comparativa histórica de los últimos 6 meses (Regla Meta: 1.000 msgs gratis/mes, luego $0.026 USD/msg saliente)
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                            fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: '20px',
                            background: '#EFF6FF', color: '#0284C7', border: '1px solid #BFDBFE'
                        }}>
                            🤖 Bot: {metrics.monthlyComparison?.[metrics.monthlyComparison.length - 1]?.botPct || 0}% de Automatización
                        </span>
                        <span style={{
                            fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: '20px',
                            background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0'
                        }}>
                            👩‍⚕️ Asesoras: {metrics.monthlyComparison?.[metrics.monthlyComparison.length - 1]?.agentPct || 0}% Atención Humana
                        </span>
                    </div>
                </div>

                {/* GRÁFICO DE BARRAS APILADAS MES A MES */}
                <div style={{ width: '100%', height: '220px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={metrics.monthlyComparison || []} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#64748B' }} />
                            <YAxis tick={{ fontSize: 11, fill: '#64748B' }} allowDecimals={false} />
                            <Tooltip 
                                cursor={{ fill: 'rgba(2, 132, 199, 0.05)' }}
                                contentStyle={{ background: '#FFFFFF', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.74rem' }}
                                formatter={(val, name) => [`${val.toLocaleString('es-AR')} msgs`, name]}
                            />
                            <Legend wrapperStyle={{ fontSize: '0.74rem', paddingTop: '6px' }} />
                            <Bar dataKey="bot" name="Bot Sanatorio (Automatizado)" stackId="a" fill="#38BDF8" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="agentes" name="Asesoras Humanas" stackId="a" fill="#0F2942" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* TABLA COMPARATIVA MES A MES CON DESGLOSE POR AGENTE Y COSTO META */}
                <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 800 }}>
                                <th style={{ padding: '10px 14px' }}>Mes</th>
                                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Total Enviados</th>
                                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Bot Sanatorio</th>
                                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Asesoras Totales</th>
                                <th style={{ padding: '10px 14px', textAlign: 'right', color: '#0284C7' }}>Virginia J.</th>
                                <th style={{ padding: '10px 14px', textAlign: 'right', color: '#8B5CF6' }}>Sofía O.</th>
                                <th style={{ padding: '10px 14px', textAlign: 'right', color: '#10B981' }}>Daniela A.</th>
                                <th style={{ padding: '10px 14px', textAlign: 'right', color: '#F59E0B' }}>Érica L.</th>
                                <th style={{ padding: '10px 14px', textAlign: 'right', color: '#059669' }}>Gratis Meta</th>
                                <th style={{ padding: '10px 14px', textAlign: 'right', color: '#DC2626' }}>Facturables</th>
                                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Costo USD</th>
                                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Costo ARS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(metrics.monthlyComparison || []).map((m, idx) => (
                                <tr key={m.mes || idx} style={{
                                    borderBottom: '1px solid #F1F5F9',
                                    background: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA'
                                }}>
                                    <td style={{ padding: '9px 14px', fontWeight: 800, color: '#0F2942' }}>{m.mes}</td>
                                    <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700 }}>{m.enviados?.toLocaleString('es-AR')}</td>
                                    <td style={{ padding: '9px 14px', textAlign: 'right', color: '#0284C7', fontWeight: 600 }}>
                                        {m.bot?.toLocaleString('es-AR')} ({m.botPct || 0}%)
                                    </td>
                                    <td style={{ padding: '9px 14px', textAlign: 'right', color: '#0F2942', fontWeight: 700 }}>
                                        {m.agentes?.toLocaleString('es-AR')} ({m.agentPct || 0}%)
                                    </td>
                                    <td style={{ padding: '9px 14px', textAlign: 'right', color: '#0284C7', fontWeight: 600 }}>{m.virginia?.toLocaleString('es-AR') || 0}</td>
                                    <td style={{ padding: '9px 14px', textAlign: 'right', color: '#8B5CF6', fontWeight: 600 }}>{m.sofia?.toLocaleString('es-AR') || 0}</td>
                                    <td style={{ padding: '9px 14px', textAlign: 'right', color: '#10B981', fontWeight: 600 }}>{m.daniela?.toLocaleString('es-AR') || 0}</td>
                                    <td style={{ padding: '9px 14px', textAlign: 'right', color: '#F59E0B', fontWeight: 600 }}>{m.erica?.toLocaleString('es-AR') || 0}</td>
                                    <td style={{ padding: '9px 14px', textAlign: 'right', color: '#059669', fontWeight: 600 }}>{m.gratis?.toLocaleString('es-AR')}</td>
                                    <td style={{ padding: '9px 14px', textAlign: 'right', color: '#DC2626', fontWeight: 700 }}>{m.facturables?.toLocaleString('es-AR')}</td>
                                    <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 800, color: '#0F2942' }}>${m.costoUsd?.toFixed(2)}</td>
                                    <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 800, color: '#059669' }}>${m.costoArs?.toLocaleString('es-AR')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* DEMANDA CLÍNICA Y TIPOS DE CONSULTA DEL PACIENTE (TRIAGE)         */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0',
                padding: '22px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: '16px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '34px', height: '34px', borderRadius: '8px',
                            background: '#ECFDF5', color: '#059669',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Stethoscope size={18} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0F2942' }}>
                                Tipos de Consulta del Paciente (Demanda y Triage Clínico)
                            </h3>
                            <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#64748B' }}>
                                Clasificación médica de requerimientos según el triage inicial y motivo de consulta registrado
                            </p>
                        </div>
                    </div>

                    <span style={{
                        fontSize: '0.74rem', fontWeight: 700, padding: '4px 10px', borderRadius: '20px',
                        background: '#F0F9FF', color: '#0284C7', border: '1px solid #BAE6FD'
                    }}>
                        🏥 Auditoría de Atención Sanatorio Argentino
                    </span>
                </div>

                {/* TARJETAS DE CATEGORÍAS CLÍNICAS */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                    gap: '12px'
                }}>
                    {inquiryBreakdown.map((item) => (
                        <div key={item.key} style={{
                            padding: '12px 14px', borderRadius: '10px',
                            background: '#FFFFFF', border: '1px solid #E2E8F0',
                            display: 'flex', flexDirection: 'column', gap: '6px'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#0F2942' }}>
                                    {item.label}
                                </span>
                                <span style={{
                                    fontSize: '0.66rem', fontWeight: 800, color: item.color,
                                    background: `${item.color}15`, padding: '2px 6px', borderRadius: '4px'
                                }}>
                                    {item.pct}%
                                </span>
                            </div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: item.color }}>
                                {item.count.toLocaleString('es-AR')} <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 500 }}>casos</span>
                            </div>
                            <div style={{ height: '4px', background: '#F1F5F9', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%',
                                    width: `${item.pct}%`,
                                    background: item.color,
                                    borderRadius: '2px',
                                    transition: 'width 0.4s ease'
                                }} />
                            </div>
                        </div>
                    ))}
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

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* MODAL INFORME MENSUAL EJECUTIVO IMPRIMIBLE                        */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            {showMonthlyReportModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 41, 66, 0.75)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1100, padding: '20px'
                }}>
                    <div style={{
                        background: '#FFFFFF', borderRadius: '16px', width: '100%', maxWidth: '880px',
                        maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 48px rgba(0,0,0,0.25)',
                        border: '1px solid #CBD5E1', display: 'flex', flexDirection: 'column'
                    }}>
                        {/* CABECERA DEL INFORME (NO IMPRIMIBLE LOS BOTONES) */}
                        <div style={{
                            padding: '20px 28px', borderBottom: '1px solid #E2E8F0',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            background: '#F8FAFC'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    width: '38px', height: '38px', borderRadius: '10px',
                                    background: '#0284C7', color: '#FFFFFF', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <FileText size={20} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F2942' }}>
                                        Informe Ejecutivo Mensual · Contact Center
                                    </h3>
                                    <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: '#64748B' }}>
                                        Sanatorio Argentino · Periodo: {monthOptions.find(m => m.key === selectedMonth)?.label || selectedMonth}
                                    </p>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => window.print()}
                                    style={{
                                        padding: '8px 16px', borderRadius: '8px', border: 'none',
                                        background: '#0284C7', color: '#FFFFFF', fontSize: '0.78rem',
                                        fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                    }}
                                >
                                    <Printer size={14} />
                                    Imprimir / Guardar PDF
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowMonthlyReportModal(false)}
                                    style={{
                                        padding: '8px', borderRadius: '8px', border: '1px solid #CBD5E1',
                                        background: '#FFFFFF', color: '#64748B', cursor: 'pointer', display: 'flex'
                                    }}
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        {/* CUERPO DEL INFORME */}
                        <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
                            {/* BLOQUE 1: RESUMEN DE VOLUMEN */}
                            <div>
                                <h4 style={{ margin: '0 0 10px', fontSize: '0.85rem', fontWeight: 800, color: '#0F2942', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    1. Resumen de Volumen y Capacidad
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                                    <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                        <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700 }}>TOTAL SALIENTES</div>
                                        <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#0F2942' }}>{metrics.totalOutgoing.toLocaleString('es-AR')}</div>
                                    </div>
                                    <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                        <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700 }}>TOTAL ENTRANTES</div>
                                        <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#059669' }}>{metrics.totalIncoming.toLocaleString('es-AR')}</div>
                                    </div>
                                    <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                        <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700 }}>ATENCIÓN ASESORAS</div>
                                        <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#0284C7' }}>{metrics.agentMessages.toLocaleString('es-AR')}</div>
                                        <div style={{ fontSize: '0.65rem', color: '#64748B' }}>{agentPct}% del total</div>
                                    </div>
                                    <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                        <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700 }}>AUTOMATIZACIÓN BOT</div>
                                        <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#8B5CF6' }}>{metrics.botMessages.toLocaleString('es-AR')}</div>
                                        <div style={{ fontSize: '0.65rem', color: '#64748B' }}>{botPct}% del total</div>
                                    </div>
                                </div>
                            </div>

                            {/* BLOQUE 2: CALIDAD Y TIEMPOS */}
                            <div>
                                <h4 style={{ margin: '0 0 10px', fontSize: '0.85rem', fontWeight: 800, color: '#0F2942', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    2. Indicadores de Calidad de Atención al Paciente
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                                    <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                        <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700 }}>ESPERA EN COLA (AVG)</div>
                                        <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#0F2942' }}>{metrics.patientQuality.queueWaitAvgMin} min</div>
                                        <div style={{ fontSize: '0.65rem', color: '#64748B' }}>Mediana: {metrics.patientQuality.queueWaitMedianMin} min</div>
                                    </div>
                                    <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                        <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700 }}>FRT ASESORA (AVG)</div>
                                        <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#0284C7' }}>{metrics.patientQuality.agentFRTAvgMin} min</div>
                                        <div style={{ fontSize: '0.65rem', color: '#64748B' }}>Mediana: {metrics.patientQuality.agentFRTMedianMin} min</div>
                                    </div>
                                    <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                        <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700 }}>FCR (RESOLUCIÓN 24H)</div>
                                        <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#059669' }}>{metrics.patientQuality.fcrPct}%</div>
                                        <div style={{ fontSize: '0.65rem', color: '#059669', fontWeight: 600 }}>Sin reingreso en 24h</div>
                                    </div>
                                    <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                        <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700 }}>CUMPLIMIENTO SLA (&le;15m)</div>
                                        <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#10B981' }}>{metrics.slaStats.cumplimientoPct}%</div>
                                        <div style={{ fontSize: '0.65rem', color: '#64748B' }}>{metrics.slaStats.optimo} de {metrics.slaStats.totalCasos} casos</div>
                                    </div>
                                </div>
                            </div>

                            {/* BLOQUE 3: INCENTIVOS - BOLSA 1 */}
                            <div style={{ background: '#F0F9FF', padding: '14px 18px', borderRadius: '10px', border: '1px solid #BAE6FD' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0369A1', textTransform: 'uppercase' }}>
                                            Incentivo Contact Center · Bolsa 1 (50% Productividad)
                                        </div>
                                        <div style={{ fontSize: '0.74rem', color: '#0F2942', marginTop: '2px' }}>
                                            Total mensajes humanos logrados: <strong>{metrics.agentMessages.toLocaleString('es-AR')}</strong> (Base: 6.500 • Meta: 7.500 • Tope: 8.500)
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.72rem', color: '#0369A1', fontWeight: 700 }}>
                                            Escalón: {incentivoBolsa1.escalon} / 10
                                        </div>
                                        <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#059669' }}>
                                            ${incentivoBolsa1.monto.toLocaleString('es-AR')} ARS
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* BLOQUE 4: TABLA DE ASESORAS */}
                            <div>
                                <h4 style={{ margin: '0 0 10px', fontSize: '0.85rem', fontWeight: 800, color: '#0F2942', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    3. Rendimiento Operativo por Asesora
                                </h4>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem' }}>
                                    <thead>
                                        <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                                            <th style={{ padding: '8px 10px', color: '#475569' }}>Asesora</th>
                                            <th style={{ padding: '8px 10px', color: '#475569', textAlign: 'right' }}>Mensajes</th>
                                            <th style={{ padding: '8px 10px', color: '#475569', textAlign: 'right' }}>Asignados</th>
                                            <th style={{ padding: '8px 10px', color: '#475569', textAlign: 'right' }}>Finalizados</th>
                                            <th style={{ padding: '8px 10px', color: '#475569', textAlign: 'right' }}>Demora Prom.</th>
                                            <th style={{ padding: '8px 10px', color: '#475569', textAlign: 'right' }}>SLA (&le;15m)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {metrics.byAgentList.map(ag => (
                                            <tr key={ag.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                                                <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0F2942' }}>{ag.name}</td>
                                                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#0284C7' }}>{ag.count.toLocaleString('es-AR')}</td>
                                                <td style={{ padding: '8px 10px', textAlign: 'right', color: '#475569' }}>{ag.assignedCount}</td>
                                                <td style={{ padding: '8px 10px', textAlign: 'right', color: '#059669', fontWeight: 700 }}>{ag.resolvedCount}</td>
                                                <td style={{ padding: '8px 10px', textAlign: 'right', color: '#475569' }}>{ag.avgResponseTimeMin} min</td>
                                                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: ag.slaCumplimientoPct >= 80 ? '#059669' : '#D97706' }}>
                                                    {ag.slaCumplimientoPct}%
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* BLOQUE 5: DEMANDA CLÍNICA / TRIAGE */}
                            <div>
                                <h4 style={{ margin: '0 0 10px', fontSize: '0.85rem', fontWeight: 800, color: '#0F2942', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    4. Tipos de Consulta del Paciente (Triage Clínico)
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                                    {inquiryBreakdown.map(item => (
                                        <div key={item.key} style={{ padding: '8px 10px', background: '#F8FAFC', borderRadius: '6px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.72rem', color: '#0F2942', fontWeight: 600 }}>{item.label}</span>
                                            <strong style={{ fontSize: '0.76rem', color: item.color }}>{item.count.toLocaleString('es-AR')} ({item.pct}%)</strong>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* BLOQUE 6: MOTIVOS DE CIERRE */}
                            <div>
                                <h4 style={{ margin: '0 0 10px', fontSize: '0.85rem', fontWeight: 800, color: '#0F2942', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    5. Distribución de Motivos de Finalización
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                                    {MOTIVOS_FINALIZACION_CATALOGO.map(motivo => {
                                        const count = metrics.byResolutionReason[motivo.key] || 0;
                                        const total = Math.max(metrics.closedConversationsCount, 1);
                                        const pct = metrics.closedConversationsCount > 0 ? Math.round((count / total) * 100) : 0;
                                        return (
                                            <div key={motivo.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#F8FAFC', borderRadius: '6px', fontSize: '0.72rem' }}>
                                                <span style={{ color: '#0F2942' }}>{motivo.label}</span>
                                                <strong style={{ color: motivo.color }}>{count} ({pct}%)</strong>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* BLOQUE 7: CONSUMO Y FACTURACIÓN WHATSAPP BUSINESS API (META) */}
                            <div style={{ background: '#F8FAFC', padding: '14px 18px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F2942', textTransform: 'uppercase', marginBottom: '8px' }}>
                                    6. Facturación y Consumo WhatsApp Business API (Meta)
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', fontSize: '0.74rem' }}>
                                    <div>
                                        <div style={{ color: '#64748B' }}>Mensajes Enviados:</div>
                                        <strong style={{ fontSize: '1rem', color: '#0F2942' }}>{costCalculations.totalEnviados.toLocaleString('es-AR')}</strong>
                                    </div>
                                    <div>
                                        <div style={{ color: '#64748B' }}>Franquicia Gratis:</div>
                                        <strong style={{ fontSize: '1rem', color: '#059669' }}>{costCalculations.franquiciaGratis} msgs</strong>
                                    </div>
                                    <div>
                                        <div style={{ color: '#64748B' }}>Facturables (&gt;1.000):</div>
                                        <strong style={{ fontSize: '1rem', color: '#DC2626' }}>{costCalculations.facturables.toLocaleString('es-AR')} msgs</strong>
                                    </div>
                                    <div>
                                        <div style={{ color: '#64748B' }}>Costo Estimado:</div>
                                        <strong style={{ fontSize: '1rem', color: '#B45309' }}>${costCalculations.totalUsd} USD (~${costCalculations.totalArs.toLocaleString('es-AR')} ARS)</strong>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* PIE DEL MODAL */}
                        <div style={{
                            padding: '14px 28px', borderTop: '1px solid #E2E8F0', background: '#F8FAFC',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '0 0 16px 16px'
                        }}>
                            <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>
                                Reporte generado automáticamente por Antigravity IDE · Sanatorio Argentino
                            </span>
                            <button
                                type="button"
                                onClick={() => setShowMonthlyReportModal(false)}
                                style={{
                                    padding: '8px 18px', borderRadius: '8px', border: 'none',
                                    background: '#0F2942', color: '#FFFFFF', fontSize: '0.76rem',
                                    fontWeight: 700, cursor: 'pointer'
                                }}
                            >
                                Cerrar Informe
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
