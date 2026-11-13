/**
 * MetricsPanel — Business Intelligence Dashboard
 * KPIs, charts, and analytics for ADM-QUI system
 * 
 * Data sources: surgeries, surgery_events, whatsapp_messages, crm_contacts, presupuestos
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    BarChart3, Calendar, ChevronDown, RefreshCw, FileSpreadsheet, FileText,
    Loader, TrendingUp, MessageSquare, Phone, Users, Stethoscope,
    Activity, CheckCircle, ArrowUpRight, ArrowDownRight, Clock, AlertTriangle,
    XCircle, ShieldCheck, Search,
} from 'lucide-react';
import { SkeletonChartGrid } from './SkeletonLoader';
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
    Area, AreaChart,
} from 'recharts';
import { supabase } from '../lib/supabase';

// ── Date Helpers ──
function getDateRange(preset) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const eod = new Date(today);
    eod.setDate(eod.getDate() + 1);

    switch (preset) {
        case 'hoy':
            return { from: today, to: eod, label: 'Hoy' };
        case 'ayer': {
            const y = new Date(today);
            y.setDate(y.getDate() - 1);
            return { from: y, to: today, label: 'Ayer' };
        }
        case 'semana': {
            const w = new Date(today);
            w.setDate(w.getDate() - 7);
            return { from: w, to: eod, label: 'Última semana' };
        }
        case 'mes': {
            const m = new Date(today);
            m.setDate(m.getDate() - 30);
            return { from: m, to: eod, label: 'Último mes' };
        }
        default:
            return { from: new Date(today.getTime() - 30 * 86400000), to: eod, label: 'Último mes' };
    }
}

function formatDateShort(d) {
    return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

// ── Colors ──
const COLORS = ['#6366F1', '#22C55E', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899', '#8B5CF6', '#14B8A6'];
const STATUS_COLORS = {
    lila: '#A855F7', amarillo: '#F59E0B', verde: '#22C55E', azul: '#3B82F6',
    rojo: '#EF4444', precaucion: '#F97316', fertilidad: '#EC4899',
    realizada: '#10B981', suspendida: '#6B7280',
};

export default function MetricsPanel({ addToast }) {
    const [loading, setLoading] = useState(true);
    const [preset, setPreset] = useState('mes');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [showPresetDropdown, setShowPresetDropdown] = useState(false);

    // Raw data
    const [surgeries, setSurgeries] = useState([]);
    const [events, setEvents] = useState([]);
    const [allSurgeryEvents, setAllSurgeryEvents] = useState([]);
    const [messages, setMessages] = useState([]);
    const [lookbackOutgoingMsgs, setLookbackOutgoingMsgs] = useState([]);
    const [lines, setLines] = useState([]);

    // Period comparison
    const [prevMessages, setPrevMessages] = useState([]);
    const [prevSurgeries, setPrevSurgeries] = useState([]);

    // 12h SLA Audit Filter & Search
    const [slaFilter, setSlaFilter] = useState('all'); // 'all' | 'on_time' | 'late' | 'no_contact'
    const [slaSearch, setSlaSearch] = useState('');
    const [slaPage, setSlaPage] = useState(1);
    const [showSlaTable, setShowSlaTable] = useState(false);

    const range = useMemo(() => {
        if (preset === 'custom' && customFrom && customTo) {
            return { from: new Date(customFrom), to: new Date(customTo + 'T23:59:59'), label: 'Personalizado' };
        }
        return getDateRange(preset);
    }, [preset, customFrom, customTo]);

    // Previous period for comparison
    const prevRange = useMemo(() => {
        const dur = range.to.getTime() - range.from.getTime();
        return { from: new Date(range.from.getTime() - dur), to: range.from };
    }, [range]);

    // ── Pagination helper: fetches ALL rows bypassing Supabase 1000-row limit ──
    const fetchAll = useCallback(async (table, columns, filters = {}) => {
        const PAGE_SIZE = 1000;
        let allData = [];
        let from = 0;
        let keepGoing = true;

        while (keepGoing) {
            let query = supabase.from(table).select(columns);
            if (filters.eq)  query = query.eq(filters.eq[0], filters.eq[1]);
            if (filters.neq) query = query.neq(filters.neq[0], filters.neq[1]);
            if (filters.gte) query = query.gte(filters.gte[0], filters.gte[1]);
            if (filters.lte) query = query.lte(filters.lte[0], filters.lte[1]);
            if (filters.lt)  query = query.lt(filters.lt[0], filters.lt[1]);
            query = query.range(from, from + PAGE_SIZE - 1);

            const { data, error } = await query;
            if (error) throw error;
            const rows = data || [];
            allData = allData.concat(rows);
            keepGoing = rows.length === PAGE_SIZE;
            from += PAGE_SIZE;
        }
        return allData;
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const fromISO = range.from.toISOString();
            const toISO = range.to.toISOString();
            const prevFromISO = prevRange.from.toISOString();
            const prevToISO = prevRange.to.toISOString();
            // Lookback de 30 días adicionales previos al inicio del período para captar notificaciones enviadas con anticipación
            const lookbackFromISO = new Date(prevRange.from.getTime() - 30 * 86400000).toISOString();

            const [surgeriesData, eventsData, allSurgEventsData, messagesData, lookbackOutData, linesRes, prevMsgData, prevSurgData] = await Promise.all([
                // Surgeries — ALL non-excluded (includes full history & SLA fields)
                fetchAll(
                    'surgeries',
                    'id, id_paciente, nombre, dni, telefono, status, medico, obra_social, ausente, excluido, created_at, updated_at, fecha_cirugia, modulo, grupo_agendas, descripcion, notificado_at, autorizado_at, confirmado_at, ultimo_mensaje_at',
                    { eq: ['excluido', false] }
                ),
                // Events — current period
                fetchAll('surgery_events', 'id, surgery_id, id_paciente, event_type, from_status, to_status, performed_by, created_at', {
                    gte: ['created_at', fromISO], lte: ['created_at', toISO],
                }),
                // All Surgery Events in lookback window for 12h SLA calculation
                fetchAll('surgery_events', 'id, surgery_id, id_paciente, event_type, from_status, to_status, performed_by, created_at', {
                    gte: ['created_at', lookbackFromISO], lte: ['created_at', toISO],
                }),
                // Messages — current period (Surgery/Admisión lines only: exclude contact_center bulk traffic)
                fetchAll('whatsapp_messages', 'id, phone, direction, line_id, created_at, media_type, is_read', {
                    neq: ['line_id', 'contact_center'],
                    gte: ['created_at', fromISO], lte: ['created_at', toISO],
                }),
                // Outgoing messages in lookback window for 12h pre-surgery contact verification
                fetchAll('whatsapp_messages', 'id, phone, direction, line_id, created_at', {
                    eq: ['direction', 'outgoing'],
                    neq: ['line_id', 'contact_center'],
                    gte: ['created_at', lookbackFromISO], lte: ['created_at', toISO],
                }),
                // Lines (small table, no pagination needed)
                supabase.from('whatsapp_lines').select('id, label, phone, color, is_active'),
                // Messages — previous period (Surgery/Admisión lines)
                fetchAll('whatsapp_messages', 'id, phone, direction, line_id, created_at', {
                    neq: ['line_id', 'contact_center'],
                    gte: ['created_at', prevFromISO], lt: ['created_at', prevToISO],
                }),
                // Surgeries — previous period
                fetchAll('surgeries', 'id, status, ausente, created_at, fecha_cirugia', {
                    eq: ['excluido', false],
                    gte: ['created_at', prevFromISO], lt: ['created_at', prevToISO],
                }),
            ]);

            setSurgeries(surgeriesData);
            setEvents(eventsData);
            setAllSurgeryEvents(allSurgEventsData);
            setMessages(messagesData);
            setLookbackOutgoingMsgs(lookbackOutData);
            setLines(linesRes.data || []);
            setPrevMessages(prevMsgData);
            setPrevSurgeries(prevSurgData);
            setSlaPage(1);
        } catch (err) {
            console.error('MetricsPanel load error:', err);
            addToast?.('Error al cargar métricas', 'error');
        } finally {
            setLoading(false);
        }
    }, [range, prevRange, addToast, fetchAll]);

    useEffect(() => { loadData(); }, [loadData]);

    // ═══════════════════════════
    //  COMPUTED METRICS
    // ═══════════════════════════

    // KPI 1: Surgery status distribution
    const surgeryStats = useMemo(() => {
        const stats = {};
        surgeries.forEach(s => {
            let key;
            if (s.ausente === '1') key = 'suspendida';
            else if (s.ausente === '0') key = 'realizada';
            else key = s.status || 'sin_estado';
            stats[key] = (stats[key] || 0) + 1;
        });
        return stats;
    }, [surgeries]);

    const totalSurgeries = surgeries.length;
    const realizadas = surgeryStats.realizada || 0;
    const suspendidas = surgeryStats.suspendida || 0;
    const confirmacionRate = totalSurgeries > 0 ? ((realizadas / (realizadas + suspendidas)) * 100).toFixed(1) : '0';

    // Previous period comparison
    const prevRealizadas = prevSurgeries.filter(s => s.ausente === '0').length;
    const prevSuspendidas = prevSurgeries.filter(s => s.ausente === '1').length;
    const prevConfRate = (prevRealizadas + prevSuspendidas) > 0
        ? ((prevRealizadas / (prevRealizadas + prevSuspendidas)) * 100) : 0;
    const confDelta = (parseFloat(confirmacionRate) - prevConfRate).toFixed(1);

    // KPI 2: Messages
    const totalMessages = messages.length;
    const outgoing = messages.filter(m => m.direction === 'outgoing').length;
    const incoming = messages.filter(m => m.direction === 'incoming').length;
    const prevTotalMsg = prevMessages.length;
    const msgDelta = prevTotalMsg > 0 ? (((totalMessages - prevTotalMsg) / prevTotalMsg) * 100).toFixed(1) : '0';

    // KPI 3: Unique patients contacted
    const uniquePhones = new Set(messages.map(m => m.phone)).size;
    const prevUniquePhones = new Set(prevMessages.map(m => m.phone)).size;
    const phonesDelta = prevUniquePhones > 0 ? (((uniquePhones - prevUniquePhones) / prevUniquePhones) * 100).toFixed(1) : '0';

    // KPI 4: Response rate (phones that have both incoming and outgoing)
    const phonesWithOutgoing = new Set(messages.filter(m => m.direction === 'outgoing').map(m => m.phone));
    const phonesWithIncoming = new Set(messages.filter(m => m.direction === 'incoming').map(m => m.phone));
    const phonesResponded = [...phonesWithOutgoing].filter(p => phonesWithIncoming.has(p)).length;
    const responseRate = phonesWithOutgoing.size > 0 ? ((phonesResponded / phonesWithOutgoing.size) * 100).toFixed(1) : '0';

    // KPI 5: Chats initiated by us (first msg to a phone is outgoing)
    const chatsInitiated = useMemo(() => {
        const firstByPhone = {};
        const sorted = [...messages].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        sorted.forEach(m => {
            if (!firstByPhone[m.phone]) firstByPhone[m.phone] = m;
        });
        return Object.values(firstByPhone).filter(m => m.direction === 'outgoing').length;
    }, [messages]);
    const prevChatsInitiated = useMemo(() => {
        const firstByPhone = {};
        const sorted = [...prevMessages].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        sorted.forEach(m => {
            if (!firstByPhone[m.phone]) firstByPhone[m.phone] = m;
        });
        return Object.values(firstByPhone).filter(m => m.direction === 'outgoing').length;
    }, [prevMessages]);
    const initDelta = prevChatsInitiated > 0 ? (((chatsInitiated - prevChatsInitiated) / prevChatsInitiated) * 100).toFixed(1) : '0';

    // ── Chart Data ──

    // Daily messages chart (outgoing initiated chats per day)
    const dailyMessagesData = useMemo(() => {
        const dayMap = {};
        const dayInitMap = {};
        // Track first msg per phone per day for "initiated" metric
        const phoneFirstByDay = {};
        const sorted = [...messages].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        sorted.forEach(m => {
            const day = new Date(m.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
            if (!dayMap[day]) dayMap[day] = { outgoing: 0, incoming: 0, initiated: 0 };
            if (m.direction === 'outgoing') dayMap[day].outgoing++;
            else dayMap[day].incoming++;

            // Track first message per phone
            const dayKey = day + '_' + m.phone;
            if (!phoneFirstByDay[dayKey]) {
                phoneFirstByDay[dayKey] = m.direction;
                if (m.direction === 'outgoing') {
                    dayMap[day].initiated++;
                }
            }
        });

        return Object.entries(dayMap).map(([day, data]) => ({
            day, ...data,
        }));
    }, [messages]);

    // Surgery pipeline pie chart
    const pipelineData = useMemo(() => {
        return Object.entries(surgeryStats)
            .filter(([k]) => k !== 'sin_estado')
            .map(([status, count]) => ({
                name: status.charAt(0).toUpperCase() + status.slice(1),
                value: count,
                color: STATUS_COLORS[status] || '#94A3B8',
            }))
            .sort((a, b) => b.value - a.value);
    }, [surgeryStats]);

    // Messages by line
    const messagesByLine = useMemo(() => {
        const map = {};
        messages.forEach(m => {
            const lid = m.line_id || 'sin_asignar';
            if (!map[lid]) map[lid] = { incoming: 0, outgoing: 0 };
            map[lid][m.direction]++;
        });
        return Object.entries(map).map(([lineId, counts]) => {
            const line = lines.find(l => l.id === lineId);
            return {
                name: line?.label?.replace('WhatsApp ', '') || lineId,
                incoming: counts.incoming,
                outgoing: counts.outgoing,
                color: line?.color || '#94A3B8',
            };
        });
    }, [messages, lines]);

    // Prefijos que NO son médicos reales (se excluyen del ranking)
    const EXCLUDED_MEDICO_PREFIXES = ['QUIRÓFANOS', 'QUIROFANOS', 'MEDICO GUARDIA', 'BLOQUE'];

    // Top médicos (filtrados: sin quirófanos ni guardia)
    const topMedicos = useMemo(() => {
        const map = {};
        surgeries.forEach(s => {
            if (!s.medico) return;
            const upper = s.medico.trim().toUpperCase();
            // Excluir entradas que no son médicos
            if (EXCLUDED_MEDICO_PREFIXES.some(p => upper.startsWith(p))) return;
            map[s.medico] = (map[s.medico] || 0) + 1;
        });
        return Object.entries(map)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([name, count]) => ({ name: name.length > 25 ? name.slice(0, 25) + '…' : name, fullName: name, count }));
    }, [surgeries]);

    // Top obras sociales
    const topOS = useMemo(() => {
        const map = {};
        surgeries.forEach(s => {
            if (s.obra_social) map[s.obra_social] = (map[s.obra_social] || 0) + 1;
        });
        return Object.entries(map)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([name, count]) => ({ name: name.length > 25 ? name.slice(0, 25) + '…' : name, count }));
    }, [surgeries]);

    // Events by type (top transitions)
    const topTransitions = useMemo(() => {
        const map = {};
        events.forEach(e => { map[e.event_type] = (map[e.event_type] || 0) + 1; });
        return Object.entries(map)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([type, count]) => ({ name: type.replace(/_/g, ' → ').replace('to', ''), count }));
    }, [events]);

    // ═══ NEW: Top Módulos (tipos de cirugía más realizados) ═══
    const topModulos = useMemo(() => {
        const map = {};
        surgeries.forEach(s => {
            const mod = (s.modulo || '').trim();
            if (mod && mod.length > 1) map[mod] = (map[mod] || 0) + 1;
        });
        return Object.entries(map)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, count]) => ({ name: name.length > 30 ? name.slice(0, 30) + '…' : name, fullName: name, count }));
    }, [surgeries]);

    // ═══ NEW: Tasa de realización por módulo ═══
    const moduloCompletionRate = useMemo(() => {
        const map = {};
        surgeries.forEach(s => {
            const mod = (s.modulo || '').trim();
            if (!mod || mod.length <= 1) return;
            if (!map[mod]) map[mod] = { realizadas: 0, suspendidas: 0, pendientes: 0, total: 0 };
            map[mod].total++;
            if (s.ausente === '0') map[mod].realizadas++;
            else if (s.ausente === '1') map[mod].suspendidas++;
            else map[mod].pendientes++;
        });
        return Object.entries(map)
            .filter(([, v]) => v.total >= 3) // solo módulos con al menos 3 cirugías
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 8)
            .map(([name, data]) => ({
                name: name.length > 22 ? name.slice(0, 22) + '…' : name,
                fullName: name,
                realizadas: data.realizadas,
                suspendidas: data.suspendidas,
                pendientes: data.pendientes,
                total: data.total,
                rate: data.total > 0 ? ((data.realizadas / data.total) * 100).toFixed(0) : 0,
            }));
    }, [surgeries]);

    // ═══ NEW: Evolución mensual de cirugías (por módulo top 5) ═══
    const monthlyModuloTrend = useMemo(() => {
        const top5Names = topModulos.slice(0, 5).map(m => m.fullName);
        const monthMap = {};

        surgeries.forEach(s => {
            const mod = (s.modulo || '').trim();
            if (!mod || !top5Names.includes(mod)) return;
            const dateStr = s.fecha_cirugia || s.created_at;
            if (!dateStr) return;
            const d = new Date(dateStr);
            const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!monthMap[monthKey]) {
                monthMap[monthKey] = {};
                top5Names.forEach(n => monthMap[monthKey][n] = 0);
            }
            monthMap[monthKey][mod]++;
        });

        return Object.entries(monthMap)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .slice(-12) // últimos 12 meses
            .map(([month, data]) => {
                const d = new Date(month + '-15');
                const label = d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
                return { month: label, ...data };
            });
    }, [surgeries, topModulos]);

    const top5ModuloNames = useMemo(() => topModulos.slice(0, 5).map(m => m.fullName), [topModulos]);
    const MODULO_COLORS = ['#6366F1', '#22C55E', '#F59E0B', '#EF4444', '#EC4899'];

    // ═══ NEW: Médico × Módulo (cross-tabulation) ═══
    const medicoModuloCross = useMemo(() => {
        const top6Medicos = topMedicos.slice(0, 6).map(m => m.fullName);
        const top6Modulos = topModulos.slice(0, 6).map(m => m.fullName);
        if (top6Medicos.length === 0 || top6Modulos.length === 0) return { medicos: [], modulos: [], matrix: [] };

        const matrix = top6Medicos.map(med => {
            const row = { medico: med.length > 20 ? med.slice(0, 20) + '…' : med };
            top6Modulos.forEach(mod => {
                row[mod] = surgeries.filter(s => {
                    const sMed = (s.medico || '').trim();
                    const sMod = (s.modulo || '').trim();
                    return sMed === med && sMod === mod;
                }).length;
            });
            return row;
        });

        return { medicos: top6Medicos, modulos: top6Modulos, matrix };
    }, [surgeries, topMedicos, topModulos]);

    // ═══ NEW: Volumen mensual total de cirugías ═══
    const monthlyVolume = useMemo(() => {
        const map = {};
        surgeries.forEach(s => {
            const dateStr = s.fecha_cirugia || s.created_at;
            if (!dateStr) return;
            const d = new Date(dateStr);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!map[key]) map[key] = { total: 0, realizadas: 0, suspendidas: 0 };
            map[key].total++;
            if (s.ausente === '0') map[key].realizadas++;
            else if (s.ausente === '1') map[key].suspendidas++;
        });
        return Object.entries(map)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .slice(-12)
            .map(([month, data]) => {
                const d = new Date(month + '-15');
                return {
                    month: d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }),
                    ...data,
                };
            });
    }, [surgeries]);

    // ═════════════════════════════════════════════════════════════════════════
    //  NUEVA MÉTRICA: COBERTURA DE CONTACTO PRE-QUIRÚRGICO (≥ 12 HS PREVIAS)
    //  Evalúa sobre todas las cirugías del período seleccionado si el paciente
    //  fue contactado con al menos 12 horas de anticipación a la cirugía.
    // ═════════════════════════════════════════════════════════════════════════
    const preSurgeryContactMetrics = useMemo(() => {
        const norm10 = (p) => {
            const d = String(p || '').replace(/\D/g, '');
            return d.length >= 8 ? d.slice(-10) : '';
        };

        const isFertilidadNoMsg = (s) => {
            const text = `${s.grupo_agendas || ''} ${s.descripcion || ''} ${s.modulo || ''}`.toUpperCase();
            return (
                s.status === 'fertilidad' ||
                text.includes('REPRODUCCION ASISTIDA') ||
                text.includes('FERTILIDAD') ||
                text.includes('CEMERA') ||
                text.includes('TRANSFERENCIA EMBRIONARIA')
            );
        };

        // Índices rápidos de eventos y mensajes salientes
        const eventsBySurgId = {};
        const eventsByPacId = {};
        allSurgeryEvents.forEach(ev => {
            if (!ev.created_at) return;
            const ts = new Date(ev.created_at).getTime();
            if (isNaN(ts)) return;
            if (ev.surgery_id) {
                if (!eventsBySurgId[ev.surgery_id] || ts < eventsBySurgId[ev.surgery_id].ts) {
                    eventsBySurgId[ev.surgery_id] = { ts, by: ev.performed_by || 'Sistema', type: ev.event_type };
                }
            }
            if (ev.id_paciente) {
                if (!eventsByPacId[ev.id_paciente]) eventsByPacId[ev.id_paciente] = [];
                eventsByPacId[ev.id_paciente].push({ ts, by: ev.performed_by || 'Sistema', type: ev.event_type });
            }
        });

        const msgsByPhone10 = {};
        lookbackOutgoingMsgs.forEach(m => {
            const p10 = norm10(m.phone);
            if (!p10 || !m.created_at) return;
            const ts = new Date(m.created_at).getTime();
            if (isNaN(ts)) return;
            if (!msgsByPhone10[p10]) msgsByPhone10[p10] = [];
            msgsByPhone10[p10].push({ ts, lineId: m.line_id });
        });

        const evaluateSurgeryList = (fromDate, toDate) => {
            const fromYMD = fromDate.toISOString().split('T')[0];
            // range.to puede ser inicio del día siguiente (eod); restamos 1ms para obtener el día límite inclusivo
            const toInclusive = new Date(Math.max(fromDate.getTime(), toDate.getTime() - 1000));
            const toYMD = toInclusive.toISOString().split('T')[0];

            const periodSurgeries = surgeries.filter(s => {
                if (!s.fecha_cirugia || s.excluido) return false;
                if (isFertilidadNoMsg(s)) return false;
                return s.fecha_cirugia >= fromYMD && s.fecha_cirugia <= toYMD;
            });

            let onTimeCount = 0;      // >= 12 hs antes
            let lateCount = 0;        // > 0 y < 12 hs antes (o el mismo día)
            let noContactCount = 0;   // sin contacto registrado
            let totalHoursLead = 0;
            let contactedTotal = 0;
            const byDayMap = {};
            const rows = [];

            periodSurgeries.forEach(cx => {
                // Hora estándar de ingreso quirúrgico: 07:00 hs Argentina (-03:00)
                // Por lo tanto, el límite de 12 hs previas equivale a las 19:00 hs del día anterior.
                const surgeryRefMs = new Date(`${cx.fecha_cirugia}T07:00:00-03:00`).getTime();
                const surgeryDayEndMs = new Date(`${cx.fecha_cirugia}T23:59:59-03:00`).getTime();
                const windowStartMs = surgeryRefMs - (30 * 24 * 3600 * 1000);

                const candidates = [];

                // 1. Timestamps directos en surgeries
                if (cx.notificado_at) {
                    candidates.push({ ts: new Date(cx.notificado_at).getTime(), source: 'Notificación Bot/Panel' });
                }
                if (cx.autorizado_at) {
                    candidates.push({ ts: new Date(cx.autorizado_at).getTime(), source: 'Autorización enviada' });
                }
                if (cx.confirmado_at) {
                    candidates.push({ ts: new Date(cx.confirmado_at).getTime(), source: 'Confirmación enviada' });
                }
                if (cx.ultimo_mensaje_at) {
                    candidates.push({ ts: new Date(cx.ultimo_mensaje_at).getTime(), source: 'Mensaje registrado' });
                }

                // 2. Eventos en surgery_events por surgery_id
                if (eventsBySurgId[cx.id]) {
                    candidates.push({
                        ts: eventsBySurgId[cx.id].ts,
                        source: `Gestión (${eventsBySurgId[cx.id].by})`,
                    });
                }

                // 3. Eventos en surgery_events por id_paciente dentro de la ventana quirúrgica
                if (cx.id_paciente && eventsByPacId[cx.id_paciente]) {
                    eventsByPacId[cx.id_paciente].forEach(ev => {
                        if (ev.ts >= windowStartMs && ev.ts <= surgeryDayEndMs) {
                            candidates.push({ ts: ev.ts, source: `Gestión (${ev.by})` });
                        }
                    });
                }

                // 4. Mensajes salientes de WhatsApp al teléfono normalizado del paciente
                const p10 = norm10(cx.telefono);
                if (p10 && msgsByPhone10[p10]) {
                    msgsByPhone10[p10].forEach(m => {
                        if (m.ts >= windowStartMs && m.ts <= surgeryDayEndMs) {
                            candidates.push({ ts: m.ts, source: 'WhatsApp saliente' });
                        }
                    });
                }

                // 5. Fallback: si el estado ya avanzó de 'lila' (Sin Mensaje) y tiene updated_at válido
                if (candidates.length === 0 && cx.status && cx.status !== 'lila' && cx.updated_at) {
                    const upTs = new Date(cx.updated_at).getTime();
                    if (!isNaN(upTs) && upTs <= surgeryDayEndMs) {
                        candidates.push({ ts: upTs, source: `Estado ${cx.status}` });
                    }
                }

                const validCandidates = candidates.filter(c => !isNaN(c.ts) && c.ts > 0);
                validCandidates.sort((a, b) => a.ts - b.ts);
                const firstContact = validCandidates[0] || null;

                let slaStatus = 'no_contact';
                let hoursBefore = null;

                if (firstContact) {
                    contactedTotal++;
                    hoursBefore = (surgeryRefMs - firstContact.ts) / (1000 * 3600);
                    totalHoursLead += Math.max(0, hoursBefore);
                    if (hoursBefore >= 12) {
                        slaStatus = 'on_time';
                        onTimeCount++;
                    } else {
                        slaStatus = 'late';
                        lateCount++;
                    }
                } else {
                    noContactCount++;
                }

                const dayLabel = formatDateShort(cx.fecha_cirugia + 'T12:00:00');
                if (!byDayMap[cx.fecha_cirugia]) {
                    byDayMap[cx.fecha_cirugia] = {
                        dateISO: cx.fecha_cirugia,
                        day: dayLabel,
                        onTime: 0,
                        late: 0,
                        noContact: 0,
                        total: 0,
                    };
                }
                byDayMap[cx.fecha_cirugia].total++;
                if (slaStatus === 'on_time') byDayMap[cx.fecha_cirugia].onTime++;
                else if (slaStatus === 'late') byDayMap[cx.fecha_cirugia].late++;
                else byDayMap[cx.fecha_cirugia].noContact++;

                rows.push({
                    id: cx.id,
                    nombre: cx.nombre || 'Sin nombre',
                    dni: cx.dni || '—',
                    telefono: cx.telefono || 'Sin tel.',
                    medico: cx.medico || '—',
                    obraSocial: cx.obra_social || '—',
                    modulo: cx.modulo || cx.descripcion || '—',
                    fechaCirugia: cx.fecha_cirugia,
                    status: cx.ausente === '0' ? 'realizada' : cx.ausente === '1' ? 'suspendida' : (cx.status || 'lila'),
                    slaStatus,
                    firstContactTs: firstContact?.ts || null,
                    firstContactSource: firstContact?.source || '—',
                    hoursBefore: hoursBefore !== null ? Number(hoursBefore.toFixed(1)) : null,
                });
            });

            const total = periodSurgeries.length;
            const onTimeRate = total > 0 ? ((onTimeCount / total) * 100).toFixed(1) : '0.0';
            const totalContactedRate = total > 0 ? (((onTimeCount + lateCount) / total) * 100).toFixed(1) : '0.0';
            const avgLeadHours = contactedTotal > 0 ? (totalHoursLead / contactedTotal).toFixed(1) : '0';

            const dailyChart = Object.values(byDayMap)
                .sort((a, b) => a.dateISO.localeCompare(b.dateISO))
                .map(d => ({
                    ...d,
                    cumplimientoPct: d.total > 0 ? Number(((d.onTime / d.total) * 100).toFixed(1)) : 0,
                }));

            // Ordenar filas: primero sin contacto, luego contacto tardío (<12hs), luego en tiempo (>=12hs)
            const orderWeight = { no_contact: 0, late: 1, on_time: 2 };
            rows.sort((a, b) => {
                if (orderWeight[a.slaStatus] !== orderWeight[b.slaStatus]) {
                    return orderWeight[a.slaStatus] - orderWeight[b.slaStatus];
                }
                return (b.fechaCirugia || '').localeCompare(a.fechaCirugia || '');
            });

            return {
                total,
                onTimeCount,
                lateCount,
                noContactCount,
                contactedTotal,
                onTimeRate,
                totalContactedRate,
                avgLeadHours,
                dailyChart,
                rows,
            };
        };

        const current = evaluateSurgeryList(range.from, range.to);
        const previous = evaluateSurgeryList(prevRange.from, prevRange.to);
        const deltaOnTime = (parseFloat(current.onTimeRate) - parseFloat(previous.onTimeRate)).toFixed(1);

        const pieData = [
            { name: 'Contactado ≥ 12hs antes', value: current.onTimeCount, color: '#22C55E' },
            { name: 'Contacto tardío (< 12hs)', value: current.lateCount, color: '#F59E0B' },
            { name: 'Sin contacto registrado', value: current.noContactCount, color: '#EF4444' },
        ].filter(d => d.value > 0);

        return {
            ...current,
            prevOnTimeRate: previous.onTimeRate,
            deltaOnTime,
            pieData,
        };
    }, [surgeries, allSurgeryEvents, lookbackOutgoingMsgs, range, prevRange]);

    const filteredSlaRows = useMemo(() => {
        let list = preSurgeryContactMetrics.rows;
        if (slaFilter !== 'all') {
            list = list.filter(r => r.slaStatus === slaFilter);
        }
        if (slaSearch.trim()) {
            const q = slaSearch.toLowerCase().trim();
            list = list.filter(r =>
                r.nombre.toLowerCase().includes(q) ||
                r.telefono.toLowerCase().includes(q) ||
                r.medico.toLowerCase().includes(q) ||
                r.obraSocial.toLowerCase().includes(q) ||
                r.fechaCirugia.includes(q)
            );
        }
        return list;
    }, [preSurgeryContactMetrics.rows, slaFilter, slaSearch]);

    // ── Export Functions ──
    const exportToExcel = useCallback(async () => {
        try {
            const XLSX = await import('xlsx');
            const wb = XLSX.utils.book_new();

            // KPIs sheet
            const kpis = [
                ['Métrica', 'Valor', 'Período anterior', 'Variación'],
                ['Contacto Pre-Quirúrgico (≥ 12hs antes)', preSurgeryContactMetrics.onTimeRate + '%', preSurgeryContactMetrics.prevOnTimeRate + '%', preSurgeryContactMetrics.deltaOnTime + '%'],
                ['Cirugías Contactadas ≥ 12hs antes', preSurgeryContactMetrics.onTimeCount, '', ''],
                ['Cirugías con Contacto Tardío (< 12hs)', preSurgeryContactMetrics.lateCount, '', ''],
                ['Cirugías Sin Contacto Registrado', preSurgeryContactMetrics.noContactCount, '', ''],
                ['Anticipación Promedio de Contacto (hs)', preSurgeryContactMetrics.avgLeadHours + ' hs', '', ''],
                ['Tasa Confirmación', confirmacionRate + '%', prevConfRate.toFixed(1) + '%', confDelta + '%'],
                ['Total Mensajes', totalMessages, prevTotalMsg, msgDelta + '%'],
                ['Pacientes Contactados', uniquePhones, prevUniquePhones, phonesDelta + '%'],
                ['Chats Iniciados', chatsInitiated, prevChatsInitiated, initDelta + '%'],
                ['Tasa Respuesta', responseRate + '%', '', ''],
                ['Cirugías Realizadas', realizadas, '', ''],
                ['Cirugías Suspendidas', suspendidas, '', ''],
            ];
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kpis), 'KPIs');

            // 12h Pre-Surgery Contact Audit sheet
            const slaSheet = [['Fecha Cirugía', 'Paciente', 'DNI', 'Teléfono', 'Médico', 'Obra Social', 'Estado', 'Cumplimiento 12hs', 'Fecha/Hora 1er Contacto', 'Anticipación (hs)', 'Fuente Evidencia']];
            preSurgeryContactMetrics.rows.forEach(r => {
                const slaLabel = r.slaStatus === 'on_time' ? 'CUMPLIÓ (≥ 12hs)' : r.slaStatus === 'late' ? 'TARDÍO (< 12hs)' : 'SIN CONTACTO';
                const contactStr = r.firstContactTs ? new Date(r.firstContactTs).toLocaleString('es-AR') : '—';
                slaSheet.push([
                    r.fechaCirugia,
                    r.nombre,
                    r.dni,
                    r.telefono,
                    r.medico,
                    r.obraSocial,
                    r.status,
                    slaLabel,
                    contactStr,
                    r.hoursBefore !== null ? `${r.hoursBefore} hs` : '—',
                    r.firstContactSource,
                ]);
            });
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(slaSheet), 'Contacto 12hs Previas');

            // Daily messages
            const dailyData = [['Día', 'Enviados', 'Recibidos', 'Chats Iniciados']];
            dailyMessagesData.forEach(d => dailyData.push([d.day, d.outgoing, d.incoming, d.initiated]));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dailyData), 'Mensajes Diarios');

            // Top médicos
            const medData = [['Médico', 'Cirugías']];
            topMedicos.forEach(m => medData.push([m.name, m.count]));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(medData), 'Top Médicos');

            // Top OS
            const osData = [['Obra Social', 'Cirugías']];
            topOS.forEach(o => osData.push([o.name, o.count]));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(osData), 'Top Obras Sociales');

            // Top Módulos
            const modData = [['Módulo / Tipo de Cirugía', 'Cantidad', 'Realizadas', 'Suspendidas', 'Tasa Realización']];
            topModulos.forEach(m => {
                const comp = moduloCompletionRate.find(c => c.fullName === m.fullName);
                modData.push([m.fullName, m.count, comp?.realizadas || 0, comp?.suspendidas || 0, (comp?.rate || 0) + '%']);
            });
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(modData), 'Top Módulos');

            XLSX.writeFile(wb, `metricas_admqui_${new Date().toISOString().split('T')[0]}.xlsx`);
            addToast?.('✅ Excel exportado correctamente', 'success');
        } catch (err) {
            console.error('Export error:', err);
            addToast?.('Error al exportar', 'error');
        }
    }, [preSurgeryContactMetrics, confirmacionRate, prevConfRate, confDelta, totalMessages, prevTotalMsg, msgDelta, uniquePhones, prevUniquePhones, phonesDelta, chatsInitiated, prevChatsInitiated, initDelta, responseRate, realizadas, suspendidas, dailyMessagesData, topMedicos, topOS, topModulos, moduloCompletionRate, addToast]);

    const exportToPDF = useCallback(async () => {
        try {
            const { default: jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');
            const doc = new jsPDF();
            const pageW = doc.internal.pageSize.getWidth();
            const margin = 14;
            const colW = (pageW - margin * 2);
            let y = 0;

            // ── Helper: Section title with colored bar ──
            const sectionTitle = (title, color = [99, 102, 241]) => {
                if (y > 250) { doc.addPage(); y = 20; }
                y += 6;
                doc.setFillColor(...color);
                doc.rect(margin, y, colW, 7, 'F');
                doc.setFontSize(10);
                doc.setTextColor(255, 255, 255);
                doc.text(title, margin + 4, y + 5.2);
                doc.setTextColor(0, 0, 0);
                y += 12;
            };

            // ══════════════════════════════════════════════
            //  PAGE 1: HEADER + KPIs
            // ══════════════════════════════════════════════
            // Header bar
            doc.setFillColor(99, 102, 241);
            doc.rect(0, 0, pageW, 32, 'F');
            doc.setFontSize(18);
            doc.setTextColor(255, 255, 255);
            doc.text('Reporte de Métricas — ADM-QUI', margin, 14);
            doc.setFontSize(9);
            doc.text('Sanatorio Argentino · Innovación y Transformación Digital', margin, 22);
            doc.text(`Generado: ${new Date().toLocaleString('es-AR')}`, margin, 28);
            doc.setTextColor(0, 0, 0);

            // Period info
            y = 38;
            doc.setFontSize(9);
            doc.setTextColor(100, 100, 100);
            doc.text(`Período analizado: ${range.label} — ${formatDateShort(range.from)} al ${formatDateShort(range.to)}`, margin, y);
            doc.text(`Período comparativo: ${formatDateShort(prevRange.from)} al ${formatDateShort(prevRange.to)}`, margin, y + 5);
            doc.setTextColor(0, 0, 0);
            y += 14;

            // ── 1. KPIs Principales ──
            sectionTitle('1. INDICADORES CLAVE DE RENDIMIENTO (KPIs)');
            autoTable(doc, {
                startY: y,
                head: [['Indicador', 'Valor actual', 'Período anterior', 'Variación %']],
                body: [
                    ['Contacto Pre-Quirúrgico (≥ 12hs antes)', preSurgeryContactMetrics.onTimeRate + '%', preSurgeryContactMetrics.prevOnTimeRate + '%', preSurgeryContactMetrics.deltaOnTime + '%'],
                    ['Cirugías Contactadas en Tiempo (≥ 12hs)', `${preSurgeryContactMetrics.onTimeCount} de ${preSurgeryContactMetrics.total}`, '—', '—'],
                    ['Cirugías con Contacto Tardío (< 12hs)', String(preSurgeryContactMetrics.lateCount), '—', '—'],
                    ['Cirugías Sin Contacto Registrado', String(preSurgeryContactMetrics.noContactCount), '—', '—'],
                    ['Anticipación Promedio de Contacto', `${preSurgeryContactMetrics.avgLeadHours} hs`, '—', '—'],
                    ['Tasa de Confirmación de Cirugías', confirmacionRate + '%', prevConfRate.toFixed(1) + '%', confDelta + '%'],
                    ['Total de Mensajes WhatsApp', String(totalMessages), String(prevTotalMsg), msgDelta + '%'],
                    ['Pacientes Contactados (únicos)', String(uniquePhones), String(prevUniquePhones), phonesDelta + '%'],
                    ['Chats Iniciados por SA', String(chatsInitiated), String(prevChatsInitiated), initDelta + '%'],
                    ['Tasa de Respuesta', responseRate + '%', '—', '—'],
                    ['Cirugías Realizadas', String(realizadas), String(prevRealizadas), '—'],
                    ['Cirugías Suspendidas', String(suspendidas), String(prevSuspendidas), '—'],
                    ['Total Cirugías en Sistema', String(totalSurgeries), '', '—'],
                    ['Eventos del Pipeline', String(events.length), '', '—'],
                ],
                theme: 'grid',
                headStyles: { fillColor: [99, 102, 241], fontSize: 8, fontStyle: 'bold' },
                bodyStyles: { fontSize: 8 },
                alternateRowStyles: { fillColor: [248, 250, 252] },
                columnStyles: { 0: { fontStyle: 'bold', cellWidth: 65 } },
                margin: { left: margin, right: margin },
            });
            y = doc.lastAutoTable.finalY + 4;

            // ── 2. Mensajes Diarios ──
            sectionTitle('2. DESGLOSE DE MENSAJES DIARIOS', [34, 197, 94]);
            const dailyBody = dailyMessagesData.map(d => [d.day, String(d.outgoing), String(d.incoming), String(d.outgoing + d.incoming), String(d.initiated)]);
            autoTable(doc, {
                startY: y,
                head: [['Día', 'Enviados', 'Recibidos', 'Total', 'Chats iniciados']],
                body: dailyBody,
                theme: 'striped',
                headStyles: { fillColor: [34, 197, 94], fontSize: 7.5 },
                bodyStyles: { fontSize: 7.5 },
                margin: { left: margin, right: margin },
            });
            y = doc.lastAutoTable.finalY + 4;

            // ── 3. Pipeline de Cirugías ──
            sectionTitle('3. PIPELINE DE CIRUGÍAS (distribución por estado)', [168, 85, 247]);
            const pipeBody = pipelineData.map(p => [p.name, String(p.value), totalSurgeries > 0 ? ((p.value / totalSurgeries) * 100).toFixed(1) + '%' : '0%']);
            autoTable(doc, {
                startY: y,
                head: [['Estado', 'Cantidad', '% del total']],
                body: pipeBody,
                theme: 'striped',
                headStyles: { fillColor: [168, 85, 247], fontSize: 8 },
                bodyStyles: { fontSize: 8 },
                margin: { left: margin, right: margin },
            });
            y = doc.lastAutoTable.finalY + 4;

            // ── 4. Mensajes por Línea WhatsApp ──
            sectionTitle('4. DISTRIBUCIÓN DE MENSAJES POR LÍNEA WHATSAPP', [59, 130, 246]);
            const lineBody = messagesByLine.map(l => [l.name, String(l.outgoing), String(l.incoming), String(l.outgoing + l.incoming)]);
            autoTable(doc, {
                startY: y,
                head: [['Línea', 'Enviados', 'Recibidos', 'Total']],
                body: lineBody,
                theme: 'striped',
                headStyles: { fillColor: [59, 130, 246], fontSize: 8 },
                bodyStyles: { fontSize: 8 },
                margin: { left: margin, right: margin },
            });
            y = doc.lastAutoTable.finalY + 4;

            // ── 5. Top Transiciones del Pipeline ──
            if (topTransitions.length > 0) {
                sectionTitle('5. TRANSICIONES MÁS FRECUENTES DEL PIPELINE', [20, 184, 166]);
                autoTable(doc, {
                    startY: y,
                    head: [['Transición', 'Cantidad']],
                    body: topTransitions.map(t => [t.name, String(t.count)]),
                    theme: 'striped',
                    headStyles: { fillColor: [20, 184, 166], fontSize: 8 },
                    bodyStyles: { fontSize: 8 },
                    margin: { left: margin, right: margin },
                });
                y = doc.lastAutoTable.finalY + 4;
            }

            // ── 6. Top Médicos ──
            sectionTitle('6. TOP MÉDICOS POR CANTIDAD DE CIRUGÍAS', [34, 197, 94]);
            autoTable(doc, {
                startY: y,
                head: [['#', 'Médico', 'Cirugías']],
                body: topMedicos.map((m, i) => [String(i + 1), m.fullName || m.name, String(m.count)]),
                theme: 'striped',
                headStyles: { fillColor: [34, 197, 94], fontSize: 8 },
                bodyStyles: { fontSize: 8 },
                columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 2: { cellWidth: 20, halign: 'center', fontStyle: 'bold' } },
                margin: { left: margin, right: margin },
            });
            y = doc.lastAutoTable.finalY + 4;

            // ── 7. Top Obras Sociales ──
            sectionTitle('7. TOP OBRAS SOCIALES', [59, 130, 246]);
            autoTable(doc, {
                startY: y,
                head: [['#', 'Obra Social', 'Cirugías']],
                body: topOS.map((o, i) => [String(i + 1), o.name, String(o.count)]),
                theme: 'striped',
                headStyles: { fillColor: [59, 130, 246], fontSize: 8 },
                bodyStyles: { fontSize: 8 },
                columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 2: { cellWidth: 20, halign: 'center', fontStyle: 'bold' } },
                margin: { left: margin, right: margin },
            });
            y = doc.lastAutoTable.finalY + 4;

            // ── 8. Top Módulos / Tipos de Cirugía ──
            if (topModulos.length > 0) {
                sectionTitle('8. TOP MÓDULOS / TIPOS DE CIRUGÍA MÁS FRECUENTES', [239, 68, 68]);
                autoTable(doc, {
                    startY: y,
                    head: [['#', 'Módulo', 'Total', 'Realizadas', 'Suspendidas', 'Pend.', 'Tasa Realiz.']],
                    body: topModulos.map((m, i) => {
                        const comp = moduloCompletionRate.find(c => c.fullName === m.fullName);
                        return [
                            String(i + 1), m.fullName, String(m.count),
                            String(comp?.realizadas || '—'), String(comp?.suspendidas || '—'),
                            String(comp?.pendientes || '—'), (comp?.rate || '—') + (comp?.rate ? '%' : ''),
                        ];
                    }),
                    theme: 'grid',
                    headStyles: { fillColor: [239, 68, 68], fontSize: 7.5, fontStyle: 'bold' },
                    bodyStyles: { fontSize: 7.5 },
                    alternateRowStyles: { fillColor: [254, 242, 242] },
                    columnStyles: {
                        0: { cellWidth: 8, halign: 'center' },
                        2: { halign: 'center', fontStyle: 'bold' },
                        3: { halign: 'center' }, 4: { halign: 'center' },
                        5: { halign: 'center' }, 6: { halign: 'center', fontStyle: 'bold' },
                    },
                    margin: { left: margin, right: margin },
                });
                y = doc.lastAutoTable.finalY + 4;
            }

            // ── 9. Médico × Módulo (cross-tabulation) ──
            if (medicoModuloCross.matrix.length > 0) {
                sectionTitle('9. CRUCE MÉDICO × TIPO DE CIRUGÍA', [236, 72, 153]);
                const crossHead = ['Médico', ...medicoModuloCross.modulos.map(m => m.length > 15 ? m.slice(0, 15) + '…' : m)];
                const crossBody = medicoModuloCross.matrix.map(row => {
                    const cells = [row.medico];
                    medicoModuloCross.modulos.forEach(mod => {
                        cells.push(row[mod] > 0 ? String(row[mod]) : '·');
                    });
                    return cells;
                });
                autoTable(doc, {
                    startY: y,
                    head: [crossHead],
                    body: crossBody,
                    theme: 'grid',
                    headStyles: { fillColor: [236, 72, 153], fontSize: 6.5, fontStyle: 'bold' },
                    bodyStyles: { fontSize: 7, halign: 'center' },
                    columnStyles: { 0: { halign: 'left', fontStyle: 'bold', cellWidth: 40 } },
                    alternateRowStyles: { fillColor: [253, 242, 248] },
                    margin: { left: margin, right: margin },
                });
                y = doc.lastAutoTable.finalY + 4;
            }

            // ── 10. Volumen Mensual de Cirugías ──
            if (monthlyVolume.length > 0) {
                sectionTitle('10. VOLUMEN MENSUAL DE CIRUGÍAS (últimos 12 meses)', [99, 102, 241]);
                autoTable(doc, {
                    startY: y,
                    head: [['Mes', 'Total cargadas', 'Realizadas', 'Suspendidas', '% Realización']],
                    body: monthlyVolume.map(m => [
                        m.month, String(m.total), String(m.realizadas), String(m.suspendidas),
                        m.total > 0 ? ((m.realizadas / m.total) * 100).toFixed(0) + '%' : '—',
                    ]),
                    theme: 'grid',
                    headStyles: { fillColor: [99, 102, 241], fontSize: 8 },
                    bodyStyles: { fontSize: 8 },
                    alternateRowStyles: { fillColor: [238, 242, 255] },
                    columnStyles: {
                        1: { halign: 'center', fontStyle: 'bold' },
                        2: { halign: 'center' }, 3: { halign: 'center' },
                        4: { halign: 'center', fontStyle: 'bold' },
                    },
                    margin: { left: margin, right: margin },
                });
                y = doc.lastAutoTable.finalY + 4;
            }

            // ── 11. Auditoría de Contacto Pre-Quirúrgico (≥ 12hs antes) ──
            if (preSurgeryContactMetrics.rows.length > 0) {
                sectionTitle('11. AUDITORÍA DE CONTACTO PRE-QUIRÚRGICO (REGLA ≥ 12 HS PREVIAS)', [16, 185, 129]);
                autoTable(doc, {
                    startY: y,
                    head: [['Fecha Cx', 'Paciente', 'Teléfono', 'Médico', 'SLA 12hs', '1er Contacto', 'Anticipación', 'Evidencia']],
                    body: preSurgeryContactMetrics.rows.slice(0, 150).map(r => [
                        r.fechaCirugia,
                        r.nombre.length > 24 ? r.nombre.slice(0, 24) + '…' : r.nombre,
                        r.telefono,
                        r.medico.length > 18 ? r.medico.slice(0, 18) + '…' : r.medico,
                        r.slaStatus === 'on_time' ? 'CUMPLIÓ (≥12h)' : r.slaStatus === 'late' ? 'TARDÍO (<12h)' : 'SIN CONTACTO',
                        r.firstContactTs ? new Date(r.firstContactTs).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—',
                        r.hoursBefore !== null ? `${r.hoursBefore} hs` : '—',
                        r.firstContactSource,
                    ]),
                    theme: 'grid',
                    headStyles: { fillColor: [16, 185, 129], fontSize: 7, fontStyle: 'bold' },
                    bodyStyles: { fontSize: 6.8 },
                    alternateRowStyles: { fillColor: [240, 253, 244] },
                    margin: { left: margin, right: margin },
                });
                y = doc.lastAutoTable.finalY + 4;
            }

            // ── Footer on every page ──
            const totalPages = doc.internal.getNumberOfPages();
            for (let p = 1; p <= totalPages; p++) {
                doc.setPage(p);
                doc.setFontSize(7);
                doc.setTextColor(150, 150, 150);
                doc.text(`Sanatorio Argentino — ADM-QUI · Página ${p} de ${totalPages}`, margin, doc.internal.pageSize.getHeight() - 8);
                doc.text('Documento generado automáticamente — Confidencial', pageW - margin - 75, doc.internal.pageSize.getHeight() - 8);
            }

            doc.save(`reporte_metricas_admqui_${new Date().toISOString().split('T')[0]}.pdf`);
            addToast?.('✅ PDF exportado correctamente', 'success');
        } catch (err) {
            console.error('PDF export error:', err);
            addToast?.('Error al exportar PDF', 'error');
        }
    }, [range, prevRange, preSurgeryContactMetrics, confirmacionRate, prevConfRate, confDelta, totalMessages, prevTotalMsg, msgDelta,
        uniquePhones, prevUniquePhones, phonesDelta, chatsInitiated, prevChatsInitiated, initDelta,
        responseRate, realizadas, prevRealizadas, suspendidas, prevSuspendidas, totalSurgeries, events,
        dailyMessagesData, pipelineData, messagesByLine, topTransitions, topMedicos, topOS,
        topModulos, moduloCompletionRate, medicoModuloCross, monthlyVolume, addToast]);

    // Custom tooltip
    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload?.length) return null;
        return (
            <div style={{
                background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px',
                padding: '10px 14px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                fontSize: '0.78rem',
            }}>
                <p style={{ fontWeight: 700, marginBottom: '4px', color: '#374151' }}>{label}</p>
                {payload.map((p, i) => (
                    <p key={i} style={{ color: p.color, margin: '2px 0' }}>
                        {p.name}: <strong>{p.value}</strong>
                    </p>
                ))}
            </div>
        );
    };

    const presets = [
        { id: 'hoy', label: 'Hoy' },
        { id: 'ayer', label: 'Ayer' },
        { id: 'semana', label: 'Semana' },
        { id: 'mes', label: 'Mes' },
        { id: 'custom', label: 'Personalizado' },
    ];

    return (
        <div className="metrics-panel no-print">
            {/* Header */}
            <div className="metrics-panel__header">
                <div className="metrics-panel__title-area">
                    <div className="metrics-panel__icon-badge">
                        <BarChart3 size={20} />
                    </div>
                    <div>
                        <h2 className="metrics-panel__title">Panel de Métricas</h2>
                        <p className="metrics-panel__subtitle">Business Intelligence — ADM-QUI</p>
                    </div>
                </div>

                <div className="metrics-panel__controls">
                    {/* Period Selector */}
                    <div className="metrics-panel__period-selector" style={{ position: 'relative' }}>
                        <button
                            className="metrics-panel__period-btn"
                            onClick={() => setShowPresetDropdown(!showPresetDropdown)}
                        >
                            <Calendar size={14} />
                            {presets.find(p => p.id === preset)?.label || 'Período'}
                            <ChevronDown size={13} />
                        </button>
                        {showPresetDropdown && (
                            <div className="metrics-panel__dropdown">
                                {presets.map(p => (
                                    <button
                                        key={p.id}
                                        className={`metrics-panel__dropdown-item ${preset === p.id ? 'metrics-panel__dropdown-item--active' : ''}`}
                                        onClick={() => {
                                            setPreset(p.id);
                                            if (p.id !== 'custom') setShowPresetDropdown(false);
                                        }}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                                {preset === 'custom' && (
                                    <div className="metrics-panel__custom-dates">
                                        <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                                        <span>a</span>
                                        <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} />
                                        <button onClick={() => { setShowPresetDropdown(false); loadData(); }}
                                            style={{ padding: '4px 10px', background: '#6366F1', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                                            Aplicar
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Export buttons */}
                    <button className="metrics-panel__export-btn" onClick={exportToExcel} title="Exportar Excel">
                        <FileSpreadsheet size={15} /> Excel
                    </button>
                    <button className="metrics-panel__export-btn metrics-panel__export-btn--pdf" onClick={exportToPDF} title="Exportar PDF">
                        <FileText size={15} /> PDF
                    </button>

                    <button className="metrics-panel__btn-refresh" onClick={loadData} title="Actualizar">
                        <RefreshCw size={15} className={loading ? 'metrics-spin' : ''} />
                    </button>
                </div>
            </div>

            {loading ? (
                <SkeletonChartGrid kpis={6} charts={4} />
            ) : (
                <>
                    {/* ═══ KPI Cards ═══ */}
                    <div className="metrics-panel__kpis">
                        <KPICard
                            icon={ShieldCheck}
                            label="Contacto ≥ 12hs Previas"
                            value={`${preSurgeryContactMetrics.onTimeRate}%`}
                            delta={preSurgeryContactMetrics.deltaOnTime}
                            color="#10B981"
                            subtext={`${preSurgeryContactMetrics.onTimeCount}/${preSurgeryContactMetrics.total} a tiempo · ${preSurgeryContactMetrics.lateCount} <12h · ${preSurgeryContactMetrics.noContactCount} sin cont.`}
                        />
                        <KPICard icon={CheckCircle} label="Tasa Confirmación" value={`${confirmacionRate}%`}
                            delta={confDelta} color="#22C55E" subtext={`${realizadas} realizadas / ${suspendidas} susp.`} />
                        <KPICard icon={MessageSquare} label="Total Mensajes" value={totalMessages}
                            delta={msgDelta} color="#6366F1" subtext={`${outgoing} enviados · ${incoming} recibidos`} />
                        <KPICard icon={Phone} label="Chats Iniciados" value={chatsInitiated}
                            delta={initDelta} color="#F59E0B" subtext="Conversaciones iniciadas por SA" />
                        <KPICard icon={Users} label="Pacientes Contactados" value={uniquePhones}
                            delta={phonesDelta} color="#3B82F6" subtext={`Tasa respuesta: ${responseRate}%`} />
                        <KPICard icon={Stethoscope} label="Total Cirugías" value={totalSurgeries}
                            delta="" color="#A855F7" subtext={`Anticipación prom.: ${preSurgeryContactMetrics.avgLeadHours} hs`} />
                        <KPICard icon={Activity} label="Eventos Pipeline" value={events.length}
                            delta="" color="#14B8A6" subtext="Transiciones de estado" />
                    </div>

                    {/* ═══════════════════════════════════════════════════════════════════════════
                        SECCIÓN DESTACADA: CONTROL DE CONTACTO PRE-QUIRÚRGICO (REGLA ≥ 12 HS ANTES)
                       ═══════════════════════════════════════════════════════════════════════════ */}
                    <div className="metrics-panel__row" style={{ marginBottom: '18px' }}>
                        <div className="metrics-panel__card metrics-panel__card--wide" style={{ flex: '1 1 100%', padding: '16px 20px', border: '1px solid #D1FAE5', background: 'linear-gradient(180deg, #ECFDF5 0%, #FFFFFF 95px)' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '12px' }}>
                                <div>
                                    <h3 className="metrics-panel__card-title" style={{ marginBottom: '2px', color: '#065F46', fontSize: '0.95rem' }}>
                                        <Clock size={17} style={{ color: '#059669' }} />
                                        Auditoría de Contacto Pre-Quirúrgico (Ventana ≥ 12 Horas Previas)
                                    </h3>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#475569' }}>
                                        Período {formatDateShort(range.from)} al {formatDateShort(new Date(Math.max(range.from.getTime(), range.to.getTime() - 1000)))} · Corte: <strong>12 hs antes</strong> (19:00 hs del día previo).
                                    </p>
                                </div>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <button
                                        type="button"
                                        onClick={() => { setSlaFilter('on_time'); setSlaPage(1); setShowSlaTable(true); }}
                                        title="Ver pacientes contactados ≥ 12hs antes"
                                        style={{ padding: '5px 10px', borderRadius: '8px', background: '#DCFCE7', border: '1px solid #86EFAC', fontSize: '0.73rem', color: '#166534', fontWeight: 700, cursor: 'pointer' }}
                                    >
                                        ✅ ≥ 12hs: {preSurgeryContactMetrics.onTimeCount} ({preSurgeryContactMetrics.onTimeRate}%)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setSlaFilter('late'); setSlaPage(1); setShowSlaTable(true); }}
                                        title="Ver pacientes con contacto tardío (< 12hs)"
                                        style={{ padding: '5px 10px', borderRadius: '8px', background: '#FEF3C7', border: '1px solid #FDE68A', fontSize: '0.73rem', color: '#92400E', fontWeight: 700, cursor: 'pointer' }}
                                    >
                                        ⚠️ &lt; 12hs: {preSurgeryContactMetrics.lateCount}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setSlaFilter('no_contact'); setSlaPage(1); setShowSlaTable(true); }}
                                        title="Ver pacientes sin contacto registrado"
                                        style={{ padding: '5px 10px', borderRadius: '8px', background: '#FEE2E2', border: '1px solid #FECACA', fontSize: '0.73rem', color: '#991B1B', fontWeight: 700, cursor: 'pointer' }}
                                    >
                                        🔴 Sin contacto: {preSurgeryContactMetrics.noContactCount}
                                    </button>
                                    <div style={{ padding: '5px 10px', borderRadius: '8px', background: '#EFF6FF', border: '1px solid #BFDBFE', fontSize: '0.73rem', color: '#1E40AF', fontWeight: 700 }}>
                                        ⏱️ Promedio: {preSurgeryContactMetrics.avgLeadHours} hs
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowSlaTable(prev => !prev)}
                                        style={{
                                            padding: '5px 11px',
                                            borderRadius: '8px',
                                            background: showSlaTable ? '#0F172A' : '#FFFFFF',
                                            color: showSlaTable ? '#FFFFFF' : '#0F172A',
                                            border: '1px solid #CBD5E1',
                                            fontSize: '0.73rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {showSlaTable ? '▲ Ocultar detalle' : `▼ Ver detalle (${preSurgeryContactMetrics.total})`}
                                    </button>
                                </div>
                            </div>

                            {/* Gráficos compactos de cobertura diaria y distribución */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 2fr) minmax(240px, 1fr)', gap: '14px', marginBottom: showSlaTable ? '14px' : '0px' }}>
                                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '10px 12px' }}>
                                    <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                        Evolución Diaria de Cirugías según Cumplimiento (≥ 12hs)
                                    </div>
                                    <div style={{ width: '100%', height: 165 }}>
                                        {preSurgeryContactMetrics.dailyChart.length === 0 ? (
                                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: '0.8rem' }}>
                                                No hay cirugías programadas en el período seleccionado
                                            </div>
                                        ) : (
                                            <ResponsiveContainer>
                                                <BarChart data={preSurgeryContactMetrics.dailyChart}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                                                    <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="#94A3B8" />
                                                    <YAxis tick={{ fontSize: 10 }} stroke="#94A3B8" />
                                                    <Tooltip content={<CustomTooltip />} />
                                                    <Legend wrapperStyle={{ fontSize: '0.7rem' }} />
                                                    <Bar dataKey="onTime" name="Contactado ≥ 12hs antes" stackId="sla" fill="#22C55E" radius={[0, 0, 0, 0]} barSize={20} />
                                                    <Bar dataKey="late" name="Contacto Tardío (< 12hs)" stackId="sla" fill="#F59E0B" radius={[0, 0, 0, 0]} barSize={20} />
                                                    <Bar dataKey="noContact" name="Sin Contacto" stackId="sla" fill="#EF4444" radius={[4, 4, 0, 0]} barSize={20} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        )}
                                    </div>
                                </div>

                                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '10px 12px' }}>
                                    <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                        Distribución del Período ({preSurgeryContactMetrics.total} cirugías)
                                    </div>
                                    <div style={{ width: '100%', height: 165 }}>
                                        {preSurgeryContactMetrics.pieData.length === 0 ? (
                                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: '0.8rem' }}>
                                                Sin datos en este rango
                                            </div>
                                        ) : (
                                            <ResponsiveContainer>
                                                <PieChart>
                                                    <Pie
                                                        data={preSurgeryContactMetrics.pieData}
                                                        dataKey="value"
                                                        nameKey="name"
                                                        cx="50%"
                                                        cy="48%"
                                                        outerRadius={56}
                                                        innerRadius={32}
                                                        paddingAngle={2}
                                                        strokeWidth={2}
                                                        stroke="#fff"
                                                    >
                                                        {preSurgeryContactMetrics.pieData.map((entry, idx) => (
                                                            <Cell key={idx} fill={entry.color} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip content={<CustomTooltip />} />
                                                    <Legend wrapperStyle={{ fontSize: '0.68rem' }} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Tabla de Auditoría Nominal por Paciente (colapsable para no ocupar toda la pantalla) */}
                            {showSlaTable && (
                            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px' }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '12px' }}>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        {[
                                            { id: 'all', label: `Todas (${preSurgeryContactMetrics.total})` },
                                            { id: 'no_contact', label: `🔴 Sin Contacto (${preSurgeryContactMetrics.noContactCount})` },
                                            { id: 'late', label: `⚠️ Tardío < 12hs (${preSurgeryContactMetrics.lateCount})` },
                                            { id: 'on_time', label: `✅ Cumplió ≥ 12hs (${preSurgeryContactMetrics.onTimeCount})` },
                                        ].map(tab => (
                                            <button
                                                key={tab.id}
                                                onClick={() => { setSlaFilter(tab.id); setSlaPage(1); }}
                                                style={{
                                                    padding: '5px 11px',
                                                    borderRadius: '6px',
                                                    fontSize: '0.74rem',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    border: slaFilter === tab.id ? '1px solid #0284C7' : '1px solid #E2E8F0',
                                                    background: slaFilter === tab.id ? '#E0F2FE' : '#F8FAFC',
                                                    color: slaFilter === tab.id ? '#0369A1' : '#475569',
                                                }}
                                            >
                                                {tab.label}
                                            </button>
                                        ))}
                                    </div>

                                    <div style={{ position: 'relative', minWidth: '220px' }}>
                                        <Search size={14} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                        <input
                                            type="text"
                                            placeholder="Buscar paciente, médico, tel..."
                                            value={slaSearch}
                                            onChange={e => { setSlaSearch(e.target.value); setSlaPage(1); }}
                                            style={{
                                                width: '100%',
                                                padding: '6px 10px 6px 28px',
                                                borderRadius: '6px',
                                                border: '1px solid #CBD5E1',
                                                fontSize: '0.75rem',
                                                outline: 'none',
                                            }}
                                        />
                                    </div>
                                </div>

                                <div style={{ overflowX: 'auto', maxHeight: '340px', overflowY: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                        <thead>
                                            <tr style={{ background: '#F8FAFC', position: 'sticky', top: 0, zIndex: 1 }}>
                                                <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '2px solid #E2E8F0', color: '#475569' }}>Fecha Cx</th>
                                                <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '2px solid #E2E8F0', color: '#475569' }}>Paciente</th>
                                                <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '2px solid #E2E8F0', color: '#475569' }}>Teléfono</th>
                                                <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '2px solid #E2E8F0', color: '#475569' }}>Médico / OS</th>
                                                <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '2px solid #E2E8F0', color: '#475569' }}>Cumplimiento 12hs</th>
                                                <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '2px solid #E2E8F0', color: '#475569' }}>1er Contacto Registrado</th>
                                                <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '2px solid #E2E8F0', color: '#475569' }}>Anticipación</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredSlaRows.length === 0 ? (
                                                <tr>
                                                    <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#94A3B8' }}>
                                                        No hay registros para el filtro seleccionado.
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredSlaRows.slice((slaPage - 1) * 15, slaPage * 15).map(r => {
                                                    const badgeStyle = r.slaStatus === 'on_time'
                                                        ? { bg: '#DCFCE7', color: '#166534', text: '✅ Contactado ≥ 12hs' }
                                                        : r.slaStatus === 'late'
                                                            ? { bg: '#FEF3C7', color: '#92400E', text: '⚠️ Tardío (< 12hs)' }
                                                            : { bg: '#FEE2E2', color: '#991B1B', text: '🔴 Sin Contacto' };
                                                    return (
                                                        <tr key={r.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                            <td style={{ padding: '7px 10px', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>
                                                                {formatDateShort(r.fechaCirugia + 'T12:00:00')}
                                                            </td>
                                                            <td style={{ padding: '7px 10px', fontWeight: 600, color: '#0F172A' }}>
                                                                {r.nombre}
                                                            </td>
                                                            <td style={{ padding: '7px 10px', color: '#475569', fontFamily: 'monospace', fontSize: '0.73rem' }}>
                                                                {r.telefono}
                                                            </td>
                                                            <td style={{ padding: '7px 10px', color: '#475569' }}>
                                                                <div style={{ fontWeight: 500, color: '#334155' }}>{r.medico}</div>
                                                                <div style={{ fontSize: '0.68rem', color: '#64748B' }}>{r.obraSocial}</div>
                                                            </td>
                                                            <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                                                                <span style={{
                                                                    display: 'inline-block',
                                                                    padding: '3px 8px',
                                                                    borderRadius: '999px',
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: 700,
                                                                    background: badgeStyle.bg,
                                                                    color: badgeStyle.color,
                                                                }}>
                                                                    {badgeStyle.text}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '7px 10px', color: '#334155', fontSize: '0.72rem' }}>
                                                                {r.firstContactTs ? (
                                                                    <>
                                                                        <div style={{ fontWeight: 600 }}>
                                                                            {new Date(r.firstContactTs).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                                        </div>
                                                                        <div style={{ fontSize: '0.67rem', color: '#64748B' }}>{r.firstContactSource}</div>
                                                                    </>
                                                                ) : (
                                                                    <span style={{ color: '#94A3B8' }}>Sin registro</span>
                                                                )}
                                                            </td>
                                                            <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: r.slaStatus === 'on_time' ? '#059669' : r.slaStatus === 'late' ? '#D97706' : '#DC2626' }}>
                                                                {r.hoursBefore !== null ? `${r.hoursBefore} hs` : '—'}
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {filteredSlaRows.length > 15 && (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px', fontSize: '0.73rem', color: '#64748B' }}>
                                        <span>
                                            Mostrando {(slaPage - 1) * 15 + 1}–{Math.min(slaPage * 15, filteredSlaRows.length)} de {filteredSlaRows.length} cirugías
                                        </span>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <button
                                                disabled={slaPage <= 1}
                                                onClick={() => setSlaPage(p => Math.max(1, p - 1))}
                                                style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', background: slaPage <= 1 ? '#F1F5F9' : '#FFF', cursor: slaPage <= 1 ? 'default' : 'pointer', fontSize: '0.72rem' }}
                                            >
                                                Anterior
                                            </button>
                                            <button
                                                disabled={slaPage * 15 >= filteredSlaRows.length}
                                                onClick={() => setSlaPage(p => p + 1)}
                                                style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', background: slaPage * 15 >= filteredSlaRows.length ? '#F1F5F9' : '#FFF', cursor: slaPage * 15 >= filteredSlaRows.length ? 'default' : 'pointer', fontSize: '0.72rem' }}
                                            >
                                                Siguiente
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            )}
                        </div>
                    </div>

                    {/* ═══ Row 1: Daily Messages + Pipeline ═══ */}
                    <div className="metrics-panel__row">
                        <div className="metrics-panel__card metrics-panel__card--wide">
                            <h3 className="metrics-panel__card-title">
                                <TrendingUp size={16} /> Mensajes Diarios & Chats Iniciados
                            </h3>
                            <div style={{ width: '100%', height: 280 }}>
                                <ResponsiveContainer>
                                    <AreaChart data={dailyMessagesData}>
                                        <defs>
                                            <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#6366F1" stopOpacity={0.2} />
                                                <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#22C55E" stopOpacity={0.2} />
                                                <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                                        <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#94A3B8" />
                                        <YAxis tick={{ fontSize: 11 }} stroke="#94A3B8" />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                                        <Area type="monotone" dataKey="outgoing" name="Enviados" stroke="#6366F1" fill="url(#colorOut)" strokeWidth={2} />
                                        <Area type="monotone" dataKey="incoming" name="Recibidos" stroke="#22C55E" fill="url(#colorIn)" strokeWidth={2} />
                                        <Line type="monotone" dataKey="initiated" name="Chats Iniciados" stroke="#F59E0B" strokeWidth={2.5} dot={{ fill: '#F59E0B', r: 3 }} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="metrics-panel__card">
                            <h3 className="metrics-panel__card-title">
                                <Activity size={16} /> Pipeline de Cirugías
                            </h3>
                            <div style={{ width: '100%', height: 280 }}>
                                <ResponsiveContainer>
                                    <PieChart>
                                        <Pie data={pipelineData} dataKey="value" nameKey="name"
                                            cx="50%" cy="50%" outerRadius={100} innerRadius={55}
                                            paddingAngle={2} strokeWidth={2} stroke="#fff">
                                            {pipelineData.map((entry, i) => (
                                                <Cell key={i} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend wrapperStyle={{ fontSize: '0.72rem' }}
                                            formatter={(value) => <span style={{ color: '#374151', fontWeight: 500 }}>{value}</span>} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* ═══ Row 2: Messages by Line + Top Transitions ═══ */}
                    <div className="metrics-panel__row">
                        <div className="metrics-panel__card">
                            <h3 className="metrics-panel__card-title">
                                <Phone size={16} /> Mensajes por Línea
                            </h3>
                            <div style={{ width: '100%', height: 260 }}>
                                <ResponsiveContainer>
                                    <BarChart data={messagesByLine} layout="vertical" barGap={2}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                                        <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94A3B8" />
                                        <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} stroke="#94A3B8" />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Bar dataKey="outgoing" name="Enviados" fill="#6366F1" radius={[0, 4, 4, 0]} barSize={16} />
                                        <Bar dataKey="incoming" name="Recibidos" fill="#22C55E" radius={[0, 4, 4, 0]} barSize={16} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="metrics-panel__card">
                            <h3 className="metrics-panel__card-title">
                                <TrendingUp size={16} /> Top Transiciones
                            </h3>
                            <div style={{ width: '100%', height: 260 }}>
                                <ResponsiveContainer>
                                    <BarChart data={topTransitions}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                                        <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={60} stroke="#94A3B8" />
                                        <YAxis tick={{ fontSize: 11 }} stroke="#94A3B8" />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Bar dataKey="count" name="Transiciones" fill="#14B8A6" radius={[6, 6, 0, 0]} barSize={28}>
                                            {topTransitions.map((_, i) => (
                                                <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* ═══ Row 3: Top Médicos + Top Obras Sociales ═══ */}
                    <div className="metrics-panel__row">
                        <div className="metrics-panel__card">
                            <h3 className="metrics-panel__card-title">
                                <Stethoscope size={16} /> Top Médicos
                            </h3>
                            <div className="metrics-panel__ranking">
                                {topMedicos.map((m, i) => (
                                    <div key={i} className="metrics-panel__ranking-item">
                                        <span className="metrics-panel__ranking-pos">#{i + 1}</span>
                                        <span className="metrics-panel__ranking-name">{m.name}</span>
                                        <div className="metrics-panel__ranking-bar-wrap">
                                            <div className="metrics-panel__ranking-bar"
                                                style={{ width: `${(m.count / topMedicos[0].count) * 100}%`, background: COLORS[i % COLORS.length] }} />
                                        </div>
                                        <span className="metrics-panel__ranking-value">{m.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="metrics-panel__card">
                            <h3 className="metrics-panel__card-title">
                                <Users size={16} /> Top Obras Sociales
                            </h3>
                            <div className="metrics-panel__ranking">
                                {topOS.map((o, i) => (
                                    <div key={i} className="metrics-panel__ranking-item">
                                        <span className="metrics-panel__ranking-pos">#{i + 1}</span>
                                        <span className="metrics-panel__ranking-name">{o.name}</span>
                                        <div className="metrics-panel__ranking-bar-wrap">
                                            <div className="metrics-panel__ranking-bar"
                                                style={{ width: `${(o.count / topOS[0].count) * 100}%`, background: COLORS[(i + 3) % COLORS.length] }} />
                                        </div>
                                        <span className="metrics-panel__ranking-value">{o.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ═══ Row 4: Top Módulos (Cirugías más realizadas) ═══ */}
                    <div className="metrics-panel__row">
                        <div className="metrics-panel__card">
                            <h3 className="metrics-panel__card-title">
                                <Stethoscope size={16} /> Top Cirugías / Módulos
                            </h3>
                            {topModulos.length === 0 ? (
                                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>
                                    Sin datos de módulos disponibles
                                </div>
                            ) : (
                                <div className="metrics-panel__ranking">
                                    {topModulos.map((m, i) => (
                                        <div key={i} className="metrics-panel__ranking-item">
                                            <span className="metrics-panel__ranking-pos"
                                                style={{ background: i < 3 ? ['#FFD700', '#C0C0C0', '#CD7F32'][i] + '20' : undefined,
                                                         color: i < 3 ? ['#B8860B', '#808080', '#8B4513'][i] : undefined }}>
                                                #{i + 1}
                                            </span>
                                            <span className="metrics-panel__ranking-name" title={m.fullName}>{m.name}</span>
                                            <div className="metrics-panel__ranking-bar-wrap">
                                                <div className="metrics-panel__ranking-bar"
                                                    style={{ width: `${(m.count / topModulos[0].count) * 100}%`, background: COLORS[i % COLORS.length] }} />
                                            </div>
                                            <span className="metrics-panel__ranking-value" style={{ fontWeight: 800, fontSize: '0.85rem' }}>{m.count}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="metrics-panel__card">
                            <h3 className="metrics-panel__card-title">
                                <CheckCircle size={16} /> Tasa Realización por Módulo
                            </h3>
                            {moduloCompletionRate.length === 0 ? (
                                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>
                                    Datos insuficientes (mín. 3 cirugías por módulo)
                                </div>
                            ) : (
                                <div style={{ width: '100%', height: 300 }}>
                                    <ResponsiveContainer>
                                        <BarChart data={moduloCompletionRate} layout="vertical" barGap={1}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                                            <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94A3B8" />
                                            <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 10 }} stroke="#94A3B8" />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
                                            <Bar dataKey="realizadas" name="Realizadas" stackId="a" fill="#22C55E" radius={[0, 0, 0, 0]} barSize={18} />
                                            <Bar dataKey="suspendidas" name="Suspendidas" stackId="a" fill="#EF4444" radius={[0, 0, 0, 0]} barSize={18} />
                                            <Bar dataKey="pendientes" name="Pendientes" stackId="a" fill="#94A3B8" radius={[0, 4, 4, 0]} barSize={18} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ═══ Row 5: Evolución mensual por módulo ═══ */}
                    {monthlyModuloTrend.length > 1 && (
                        <div className="metrics-panel__row">
                            <div className="metrics-panel__card metrics-panel__card--wide" style={{ flex: '1 1 100%' }}>
                                <h3 className="metrics-panel__card-title">
                                    <TrendingUp size={16} /> Evolución Mensual — Top 5 Cirugías
                                </h3>
                                <div style={{ width: '100%', height: 320 }}>
                                    <ResponsiveContainer>
                                        <AreaChart data={monthlyModuloTrend}>
                                            <defs>
                                                {top5ModuloNames.map((name, i) => (
                                                    <linearGradient key={name} id={`modGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor={MODULO_COLORS[i]} stopOpacity={0.2} />
                                                        <stop offset="95%" stopColor={MODULO_COLORS[i]} stopOpacity={0} />
                                                    </linearGradient>
                                                ))}
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                                            <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94A3B8" />
                                            <YAxis tick={{ fontSize: 11 }} stroke="#94A3B8" />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
                                            {top5ModuloNames.map((name, i) => (
                                                <Area
                                                    key={name}
                                                    type="monotone"
                                                    dataKey={name}
                                                    name={name.length > 25 ? name.slice(0, 25) + '…' : name}
                                                    stroke={MODULO_COLORS[i]}
                                                    fill={`url(#modGrad${i})`}
                                                    strokeWidth={2.5}
                                                    dot={{ fill: MODULO_COLORS[i], r: 3 }}
                                                />
                                            ))}
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ═══ Row 6: Médico × Módulo + Volumen Mensual ═══ */}
                    <div className="metrics-panel__row">
                        <div className="metrics-panel__card">
                            <h3 className="metrics-panel__card-title">
                                <Users size={16} /> Médico × Tipo de Cirugía
                            </h3>
                            {medicoModuloCross.matrix.length === 0 ? (
                                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>
                                    Sin datos cruzados disponibles
                                </div>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#374151',
                                                    borderBottom: '2px solid #E2E8F0', fontSize: '0.72rem' }}>Médico</th>
                                                {medicoModuloCross.modulos.map((mod, i) => (
                                                    <th key={i} style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 600,
                                                        color: '#6B7280', borderBottom: '2px solid #E2E8F0', fontSize: '0.65rem',
                                                        maxWidth: '90px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                                        title={mod}>
                                                        {mod.length > 12 ? mod.slice(0, 12) + '…' : mod}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {medicoModuloCross.matrix.map((row, ri) => (
                                                <tr key={ri} style={{ borderBottom: '1px solid #F1F5F9' }}
                                                    onMouseOver={e => e.currentTarget.style.background = '#F8FAFC'}
                                                    onMouseOut={e => e.currentTarget.style.background = ''}>
                                                    <td style={{ padding: '7px 10px', fontWeight: 600, color: '#374151', fontSize: '0.73rem' }}>
                                                        {row.medico}
                                                    </td>
                                                    {medicoModuloCross.modulos.map((mod, ci) => {
                                                        const val = row[mod] || 0;
                                                        const maxVal = Math.max(...medicoModuloCross.matrix.map(r => r[mod] || 0));
                                                        const intensity = maxVal > 0 ? val / maxVal : 0;
                                                        return (
                                                            <td key={ci} style={{
                                                                padding: '7px 6px', textAlign: 'center', fontWeight: val > 0 ? 700 : 400,
                                                                color: val > 0 ? '#1E293B' : '#CBD5E1',
                                                                background: val > 0 ? `rgba(99, 102, 241, ${0.08 + intensity * 0.25})` : 'transparent',
                                                                borderRadius: '4px',
                                                                transition: 'all 0.15s',
                                                            }}>
                                                                {val || '·'}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        <div className="metrics-panel__card">
                            <h3 className="metrics-panel__card-title">
                                <Calendar size={16} /> Volumen Mensual de Cirugías
                            </h3>
                            {monthlyVolume.length === 0 ? (
                                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>
                                    Sin datos mensuales
                                </div>
                            ) : (
                                <div style={{ width: '100%', height: 300 }}>
                                    <ResponsiveContainer>
                                        <BarChart data={monthlyVolume}>
                                            <defs>
                                                <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#6366F1" stopOpacity={0.9} />
                                                    <stop offset="100%" stopColor="#6366F1" stopOpacity={0.4} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                                            <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94A3B8" />
                                            <YAxis tick={{ fontSize: 11 }} stroke="#94A3B8" />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
                                            <Bar dataKey="realizadas" name="Realizadas" stackId="vol" fill="#22C55E" radius={[0, 0, 0, 0]} barSize={24} />
                                            <Bar dataKey="suspendidas" name="Suspendidas" stackId="vol" fill="#EF4444" radius={[0, 0, 0, 0]} barSize={24} />
                                            <Bar dataKey="total" name="Cargadas" fill="url(#volGrad)" radius={[6, 6, 0, 0]} barSize={24} opacity={0.3} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

// ── KPI Card Component ──
function KPICard({ icon: Icon, label, value, delta, color, subtext }) {
    const isPositive = parseFloat(delta) >= 0;
    const hasDelta = delta !== '' && delta !== '0' && delta !== '0.0';
    return (
        <div className="metrics-panel__kpi-card">
            <div className="metrics-panel__kpi-icon" style={{ background: `${color}15`, color }}>
                <Icon size={20} />
            </div>
            <div className="metrics-panel__kpi-data">
                <span className="metrics-panel__kpi-label">{label}</span>
                <span className="metrics-panel__kpi-value">{value}</span>
                <div className="metrics-panel__kpi-footer">
                    {hasDelta && (
                        <span className={`metrics-panel__kpi-delta ${isPositive ? 'metrics-panel__kpi-delta--up' : 'metrics-panel__kpi-delta--down'}`}>
                            {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                            {Math.abs(parseFloat(delta))}%
                        </span>
                    )}
                    <span className="metrics-panel__kpi-subtext">{subtext}</span>
                </div>
            </div>
        </div>
    );
}
