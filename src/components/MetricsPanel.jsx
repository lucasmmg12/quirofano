/**
 * MetricsPanel — Business Intelligence Dashboard
 * KPIs, charts, and analytics for ADM-QUI system
 * 
 * Data sources: surgeries, surgery_events, whatsapp_messages, crm_contacts, presupuestos
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    BarChart3, TrendingUp, TrendingDown, Users, MessageSquare, Stethoscope,
    Calendar, Download, RefreshCw, Filter, ArrowUpRight, ArrowDownRight,
    Activity, Phone, CheckCircle, XCircle, Clock, FileSpreadsheet, FileText,
    ChevronDown, Loader,
} from 'lucide-react';
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
    const [messages, setMessages] = useState([]);
    const [lines, setLines] = useState([]);

    // Period comparison
    const [prevMessages, setPrevMessages] = useState([]);
    const [prevSurgeries, setPrevSurgeries] = useState([]);

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

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [surgeriesRes, eventsRes, messagesRes, linesRes, prevMsgRes, prevSurgRes] = await Promise.all([
                supabase.from('surgeries').select('id, status, medico, obra_social, ausente, created_at, fecha_cirugia, modulo').limit(10000),
                supabase.from('surgery_events').select('id, event_type, performed_by, created_at')
                    .gte('created_at', range.from.toISOString())
                    .lte('created_at', range.to.toISOString())
                    .limit(10000),
                supabase.from('whatsapp_messages').select('id, phone, direction, line_id, created_at, media_type, is_read')
                    .gte('created_at', range.from.toISOString())
                    .lte('created_at', range.to.toISOString())
                    .limit(10000),
                supabase.from('whatsapp_lines').select('id, label, phone, color, is_active'),
                // Previous period for comparison
                supabase.from('whatsapp_messages').select('id, phone, direction, line_id, created_at')
                    .gte('created_at', prevRange.from.toISOString())
                    .lt('created_at', prevRange.to.toISOString())
                    .limit(10000),
                supabase.from('surgeries').select('id, status, ausente, created_at')
                    .gte('created_at', prevRange.from.toISOString())
                    .lt('created_at', prevRange.to.toISOString())
                    .limit(10000),
            ]);

            setSurgeries(surgeriesRes.data || []);
            setEvents(eventsRes.data || []);
            setMessages(messagesRes.data || []);
            setLines(linesRes.data || []);
            setPrevMessages(prevMsgRes.data || []);
            setPrevSurgeries(prevSurgRes.data || []);
        } catch (err) {
            console.error('MetricsPanel load error:', err);
            addToast?.('Error al cargar métricas', 'error');
        } finally {
            setLoading(false);
        }
    }, [range, prevRange, addToast]);

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

    // ── Export Functions ──
    const exportToExcel = useCallback(async () => {
        try {
            const XLSX = await import('xlsx');
            const wb = XLSX.utils.book_new();

            // KPIs sheet
            const kpis = [
                ['Métrica', 'Valor', 'Período anterior', 'Variación'],
                ['Tasa Confirmación', confirmacionRate + '%', prevConfRate.toFixed(1) + '%', confDelta + '%'],
                ['Total Mensajes', totalMessages, prevTotalMsg, msgDelta + '%'],
                ['Pacientes Contactados', uniquePhones, prevUniquePhones, phonesDelta + '%'],
                ['Chats Iniciados', chatsInitiated, prevChatsInitiated, initDelta + '%'],
                ['Tasa Respuesta', responseRate + '%', '', ''],
                ['Cirugías Realizadas', realizadas, '', ''],
                ['Cirugías Suspendidas', suspendidas, '', ''],
            ];
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kpis), 'KPIs');

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
    }, [confirmacionRate, prevConfRate, confDelta, totalMessages, prevTotalMsg, msgDelta, uniquePhones, prevUniquePhones, phonesDelta, chatsInitiated, prevChatsInitiated, initDelta, responseRate, realizadas, suspendidas, dailyMessagesData, topMedicos, topOS, topModulos, moduloCompletionRate, addToast]);

    const exportToPDF = useCallback(async () => {
        try {
            const { default: jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');
            const doc = new jsPDF();

            doc.setFontSize(16);
            doc.text('Métricas ADM-QUI — Sanatorio Argentino', 14, 20);
            doc.setFontSize(10);
            doc.text(`Período: ${range.label} (${formatDateShort(range.from)} - ${formatDateShort(range.to)})`, 14, 28);
            doc.text(`Generado: ${new Date().toLocaleString('es-AR')}`, 14, 34);

            // KPIs table
            autoTable(doc, {
                startY: 42,
                head: [['Métrica', 'Valor', 'Variación vs período anterior']],
                body: [
                    ['Tasa de Confirmación', confirmacionRate + '%', confDelta + '%'],
                    ['Total Mensajes', String(totalMessages), msgDelta + '%'],
                    ['Pacientes Contactados', String(uniquePhones), phonesDelta + '%'],
                    ['Chats Iniciados por SA', String(chatsInitiated), initDelta + '%'],
                    ['Tasa de Respuesta', responseRate + '%', '—'],
                    ['Cirugías Realizadas', String(realizadas), '—'],
                    ['Cirugías Suspendidas', String(suspendidas), '—'],
                ],
                theme: 'grid',
                headStyles: { fillColor: [99, 102, 241] },
            });

            // Top médicos
            const medBody = topMedicos.map(m => [m.name, String(m.count)]);
            autoTable(doc, {
                startY: doc.lastAutoTable.finalY + 12,
                head: [['Médico', 'Cirugías']],
                body: medBody,
                theme: 'striped',
                headStyles: { fillColor: [34, 197, 94] },
            });

            // Top OS
            const osBody = topOS.map(o => [o.name, String(o.count)]);
            autoTable(doc, {
                startY: doc.lastAutoTable.finalY + 12,
                head: [['Obra Social', 'Cirugías']],
                body: osBody,
                theme: 'striped',
                headStyles: { fillColor: [59, 130, 246] },
            });

            doc.save(`metricas_admqui_${new Date().toISOString().split('T')[0]}.pdf`);
            addToast?.('✅ PDF exportado correctamente', 'success');
        } catch (err) {
            console.error('PDF export error:', err);
            addToast?.('Error al exportar PDF', 'error');
        }
    }, [range, confirmacionRate, confDelta, totalMessages, msgDelta, uniquePhones, phonesDelta, chatsInitiated, initDelta, responseRate, realizadas, suspendidas, topMedicos, topOS, addToast]);

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
                <div className="metrics-panel__loading">
                    <Loader size={28} className="metrics-spin" />
                    <span>Cargando métricas...</span>
                </div>
            ) : (
                <>
                    {/* ═══ KPI Cards ═══ */}
                    <div className="metrics-panel__kpis">
                        <KPICard icon={CheckCircle} label="Tasa Confirmación" value={`${confirmacionRate}%`}
                            delta={confDelta} color="#22C55E" subtext={`${realizadas} realizadas / ${suspendidas} susp.`} />
                        <KPICard icon={MessageSquare} label="Total Mensajes" value={totalMessages}
                            delta={msgDelta} color="#6366F1" subtext={`${outgoing} enviados · ${incoming} recibidos`} />
                        <KPICard icon={Phone} label="Chats Iniciados" value={chatsInitiated}
                            delta={initDelta} color="#F59E0B" subtext="Conversaciones iniciadas por SA" />
                        <KPICard icon={Users} label="Pacientes Contactados" value={uniquePhones}
                            delta={phonesDelta} color="#3B82F6" subtext={`Tasa respuesta: ${responseRate}%`} />
                        <KPICard icon={Stethoscope} label="Total Cirugías" value={totalSurgeries}
                            delta="" color="#A855F7" subtext="En el sistema completo" />
                        <KPICard icon={Activity} label="Eventos Pipeline" value={events.length}
                            delta="" color="#14B8A6" subtext="Transiciones de estado" />
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
