import React, { useState, useEffect } from 'react';
import { 
    BarChart3, Users, MessageSquare, Bot, RefreshCw, CheckCircle2, 
    Sparkles, Activity, Calendar, ArrowUpRight, ArrowDownLeft, Send, 
    Inbox, Stethoscope, CalendarCheck, Clock, FileCheck, ShieldAlert,
    ChevronRight, Check, AlertCircle, AlertTriangle, FileText, HelpCircle,
    PhoneCall
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { CONTACT_CENTER_AGENTS, isClosedOrArchived } from '../../services/contactCenterService';

const MOTIVOS_FINALIZACION_CATALOGO = [
    { key: 'Turno Otorgado con Éxito', label: 'Turno Otorgado con Éxito', icon: CheckCircle2, color: '#059669', bg: '#ECFDF5' },
    { key: 'Cancelación / Reprogramación Confirmada', label: 'Cancelación / Reprogramación Confirmada', icon: CalendarCheck, color: '#0284C7', bg: '#F0F9FF' },
    { key: 'Estudio / Autorización Tramitada', label: 'Estudio / Autorización Tramitada', icon: FileCheck, color: '#8B5CF6', bg: '#F5F3FF' },
    { key: 'Información Brindada / Consulta Respondida', label: 'Información Brindada / Consulta Respondida', icon: HelpCircle, color: '#D97706', bg: '#FFFBEB' },
    { key: 'Derivado a Guardia / Sector', label: 'Derivado a Guardia / Sector Específico', icon: ShieldAlert, color: '#DC2626', bg: '#FEF2F2' },
    { key: 'Paciente No Responde', label: 'Paciente No Responde (Time-out)', icon: Clock, color: '#64748B', bg: '#F8FAFC' },
    { key: 'Otro / Aclaración en Nota', label: 'Otro / Resuelto Interno', icon: FileText, color: '#475569', bg: '#F1F5F9' }
];

export default function ContactCenterMetricsTab({ addToast }) {
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState('today'); // 'today', 'week', 'month', 'all'
    
    const [metrics, setMetrics] = useState({
        // 1. Mensajes totales enviados (salientes)
        totalOutgoing: 0,
        // 2. Mensajes enviados por agente
        agentMessages: 0,
        // 3. Mensajes enviados por bot
        botMessages: 0,
        // 4. Mensajes recibidos (entrantes)
        totalIncoming: 0,
        // Desglose de mensajes por cada agente
        byAgentList: [],
        // 5. Conversaciones finalizadas y motivos
        totalConversations: 0,
        closedConversationsCount: 0,
        activeConversationsCount: 0,
        byResolutionReason: {},
        // 6. Elecciones del usuario en el primer mensaje
        firstMessageChoices: {
            solicitar_turno: 0,
            reprogramar_turno: 0,
            autorizar: 0,
            guardia: 0,
            informes: 0,
            otros: 0
        },
        totalTriageCases: 0
    });

    const loadMetrics = async () => {
        setLoading(true);
        try {
            // 1. Cargar mensajes EXCLUSIVOS de la línea de Contact Center
            let msgQuery = supabase
                .from('whatsapp_messages')
                .select('id, phone, direction, sender_name, content, created_at, raw_payload')
                .eq('line_id', 'contact_center')
                .order('created_at', { ascending: false });

            // 2. Cargar conversaciones de contact_center_conversations
            let convQuery = supabase
                .from('contact_center_conversations')
                .select('phone, status, resolution_reason, closed_at, closed_by_agent_name, motivo_consulta, ai_summary, created_at')
                .order('created_at', { ascending: false });

            // Filtro por rango temporal en base de datos
            if (timeRange === 'today') {
                const startToday = new Date();
                startToday.setHours(0, 0, 0, 0);
                msgQuery = msgQuery.gte('created_at', startToday.toISOString());
                convQuery = convQuery.gte('created_at', startToday.toISOString());
            } else if (timeRange === 'week') {
                const startWeek = new Date();
                startWeek.setDate(startWeek.getDate() - 7);
                msgQuery = msgQuery.gte('created_at', startWeek.toISOString());
                convQuery = convQuery.gte('created_at', startWeek.toISOString());
            } else if (timeRange === 'month') {
                const startMonth = new Date();
                startMonth.setDate(startMonth.getDate() - 30);
                msgQuery = msgQuery.gte('created_at', startMonth.toISOString());
                convQuery = convQuery.gte('created_at', startMonth.toISOString());
            }

            const [{ data: messages, error: msgErr }, { data: convs, error: convErr }] = await Promise.all([
                msgQuery,
                convQuery
            ]);

            if (msgErr) throw msgErr;
            if (convErr) throw convErr;

            const filteredMessages = messages || [];

            // ── Métricas de Mensajes ──
            let totalOut = 0;
            let totalIn = 0;
            let botCount = 0;
            let agentCount = 0;

            const ALL_AGENTS_METRICS = [
                ...CONTACT_CENTER_AGENTS,
                { id: 'lmarinero', username: 'lmarinero', legacyId: 'lucas', name: 'Lucas Marinero', fullName: 'Lucas Marinero', role: 'Supervisor Contact Center', color: '#0284C7', avatar: 'LM' }
            ];

            const agentCounts = {};
            ALL_AGENTS_METRICS.forEach(ag => {
                agentCounts[ag.id] = {
                    id: ag.id,
                    name: ag.fullName || ag.name,
                    role: ag.role || 'Atención al Paciente',
                    color: ag.color,
                    avatar: ag.avatar,
                    count: 0
                };
            });
            agentCounts['otros_operadores'] = {
                id: 'otros_operadores',
                name: 'Otros Operadores / Admisión',
                role: 'Recepción y Soporte',
                color: '#64748B',
                avatar: 'OP',
                count: 0
            };

            filteredMessages.forEach(m => {
                if (m.direction === 'outgoing') {
                    totalOut++;
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
                        // Matching agente humano
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
                                agentCounts[ag.id].count++;
                                matched = true;
                                break;
                            }
                        }
                        if (!matched) {
                            agentCounts['otros_operadores'].count++;
                        }
                    }
                } else if (m.direction === 'incoming') {
                    totalIn++;
                }
            });

            // Ordenar agentes por cantidad de despachos (ocultando 'otros_operadores' si no tiene envíos)
            const agentList = Object.values(agentCounts)
                .filter(a => a.id !== 'otros_operadores' || a.count > 0)
                .sort((a, b) => b.count - a.count);

            // ── Conversaciones Finalizadas y Motivos de Finalización ──
            let closedCount = 0;
            let activeCount = 0;
            const reasonsMap = {};
            MOTIVOS_FINALIZACION_CATALOGO.forEach(c => {
                reasonsMap[c.key] = 0;
            });

            (convs || []).forEach(c => {
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
                } else {
                    activeCount++;
                }
            });

            // ── Elección del usuario en el primer mensaje ──
            // Analizamos los primeros mensajes de cada teléfono para detectar la intención inicial
            const msgsByPhone = {};
            filteredMessages.forEach(m => {
                if (m.direction === 'incoming' && m.phone) {
                    if (!msgsByPhone[m.phone]) msgsByPhone[m.phone] = [];
                    msgsByPhone[m.phone].push(m.content || '');
                }
            });

            const choicesTally = {
                solicitar_turno: 0,
                reprogramar_turno: 0,
                autorizar: 0,
                guardia: 0,
                informes: 0,
                otros: 0
            };

            Object.entries(msgsByPhone).forEach(([phone, msgList]) => {
                const combined = msgList.slice(0, 3).join(' ').toLowerCase();

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

            const totalChoices = Object.values(choicesTally).reduce((a, b) => a + b, 0);

            setMetrics({
                totalOutgoing: totalOut,
                agentMessages: agentCount,
                botMessages: botCount,
                totalIncoming: totalIn,
                byAgentList: agentList,
                totalConversations: (convs || []).length,
                closedConversationsCount: closedCount,
                activeConversationsCount: activeCount,
                byResolutionReason: reasonsMap,
                firstMessageChoices: choicesTally,
                totalTriageCases: totalChoices
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
    }, [timeRange]);

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
                padding: '20px 24px',
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
                            Métricas Operativas de Contact Center
                        </h2>
                        <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                            Auditoría de despachos por agente y bot, volumen entrante, resolución de casos y triage inicial
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {/* Selector de Rango */}
                    <div style={{
                        display: 'flex', background: '#F1F5F9', borderRadius: '8px', padding: '3px', gap: '2px'
                    }}>
                        {[
                            { id: 'all', label: 'Todo el Histórico' },
                            { id: 'month', label: '30 Días' },
                            { id: 'week', label: '7 Días' },
                            { id: 'today', label: 'Hoy' }
                        ].map(t => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setTimeRange(t.id)}
                                style={{
                                    padding: '5px 12px', borderRadius: '6px', border: 'none',
                                    fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer',
                                    background: timeRange === t.id ? '#0F2942' : 'transparent',
                                    color: timeRange === t.id ? '#FFFFFF' : '#64748B',
                                    transition: 'all 0.15s'
                                }}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={loadMetrics}
                        disabled={loading}
                        title="Actualizar métricas"
                        style={{
                            padding: '8px 16px', borderRadius: '8px', border: 'none',
                            background: '#0284C7', color: '#FFFFFF', fontSize: '0.78rem', fontWeight: 700,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: '6px',
                            boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)'
                        }}
                    >
                        <RefreshCw size={14} className={loading ? 'spin' : ''} />
                        Actualizar
                    </button>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* 1. KPI CARDS PRINCIPALES: MENSAJES Y CONVERSACIONES               */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '14px'
            }}>
                {/* 1. MENSAJES TOTALES ENVIADOS */}
                <div style={{
                    background: '#FFFFFF', borderRadius: '12px', padding: '18px 20px',
                    border: '1px solid #E2E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                Total Enviados
                            </span>
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
                        Mensajes entrantes de pacientes
                    </div>
                </div>

                {/* 3. MENSAJES POR BOT */}
                <div style={{
                    background: '#FFFFFF', borderRadius: '12px', padding: '18px 20px',
                    border: '1px solid #E2E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                Enviados por Bot
                            </span>
                            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#0284C7', marginTop: '4px' }}>
                                {loading ? '...' : metrics.botMessages.toLocaleString()}
                            </div>
                        </div>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '10px', background: '#F0F9FF',
                            color: '#0284C7', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Bot size={18} />
                        </div>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '10px' }}>
                        Triage automático y derivación
                    </div>
                </div>

                {/* 4. MENSAJES POR AGENTE */}
                <div style={{
                    background: '#FFFFFF', borderRadius: '12px', padding: '18px 20px',
                    border: '1px solid #E2E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                Enviados por Agente
                            </span>
                            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#059669', marginTop: '4px' }}>
                                {loading ? '...' : metrics.agentMessages.toLocaleString()}
                            </div>
                        </div>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '10px', background: '#ECFDF5',
                            color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Users size={18} />
                        </div>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '10px' }}>
                        Respuestas personalizadas
                    </div>
                </div>

                {/* 5. CONVERSACIONES FINALIZADAS */}
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
                        {metrics.activeConversationsCount} conversaciones activas
                    </div>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* 2. GRILLA CENTRAL: ELECCIONES EN PRIMER MENSAJE Y DESGLOSE AGENTES*/}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))',
                gap: '18px'
            }}>
                {/* ── PANEL A: ELECCIONES DEL USUARIO EN EL PRIMER MENSAJE (TRIAGE) ── */}
                <div style={{
                    background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0',
                    padding: '22px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#EFF6FF', color: '#0284C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Sparkles size={16} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0F2942' }}>
                                    Elección del Paciente en el Primer Mensaje
                                </h3>
                                <p style={{ margin: '1px 0 0', fontSize: '0.74rem', color: '#64748B' }}>
                                    Intención inicial detectada al contactar al Sanatorio ({metrics.totalTriageCases} pacientes auditados)
                                </p>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
                        {[
                            {
                                key: 'solicitar_turno',
                                label: '1️⃣ Solicitar Turno Nuevo',
                                sub: 'Turnos nuevos con especialistas o consultas generales',
                                count: metrics.firstMessageChoices.solicitar_turno,
                                color: '#0284C7',
                                icon: Stethoscope
                            },
                            {
                                key: 'reprogramar_turno',
                                label: '🔄 Reprogramar Turno',
                                sub: 'Cambios de día/hora de turnos existentes o cancelaciones',
                                count: metrics.firstMessageChoices.reprogramar_turno,
                                color: '#D97706',
                                icon: CalendarCheck
                            },
                            {
                                key: 'autorizar',
                                label: '📑 Autorizar Estudios / Órdenes Médicas',
                                sub: 'Envío de fotos de órdenes médicas, ecografías y laboratorio',
                                count: metrics.firstMessageChoices.autorizar,
                                color: '#059669',
                                icon: FileCheck
                            },
                            {
                                key: 'guardia',
                                label: '🚨 Guardias y Urgencias 24hs',
                                sub: 'Consultas sobre guardia activa en Sede 01 (San Luis 432 O)',
                                count: metrics.firstMessageChoices.guardia,
                                color: '#DC2626',
                                icon: ShieldAlert
                            },
                            {
                                key: 'informes',
                                label: '📋 Informes, Resultados y Horarios',
                                sub: 'Resultados de laboratorio, horarios de sedes y contacto web',
                                count: metrics.firstMessageChoices.informes,
                                color: '#8B5CF6',
                                icon: FileText
                            },
                            {
                                key: 'otros',
                                label: '💬 Otras Consultas Generales',
                                sub: 'Mensajes con consultas administrativas u operativas varias',
                                count: metrics.firstMessageChoices.otros,
                                color: '#64748B',
                                icon: HelpCircle
                            }
                        ].map(item => {
                            const total = Math.max(metrics.totalTriageCases, 1);
                            const pct = Math.round((item.count / total) * 100);
                            const IconComponent = item.icon;

                            return (
                                <div key={item.key} style={{
                                    padding: '10px 12px',
                                    borderRadius: '10px',
                                    background: '#F8FAFC',
                                    border: '1px solid #F1F5F9'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <IconComponent size={16} color={item.color} />
                                            <div>
                                                <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F2942' }}>
                                                    {item.label}
                                                </div>
                                                <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                                    {item.sub}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F2942' }}>
                                                {item.count} <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>({pct}%)</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ height: '6px', background: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                                        <div style={{
                                            height: '100%',
                                            width: `${pct}%`,
                                            background: item.color,
                                            borderRadius: '3px',
                                            transition: 'width 0.4s ease'
                                        }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── PANEL B: CANTIDAD DE MENSAJES ENVIADOS POR AGENTE ── */}
                <div style={{
                    background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0',
                    padding: '22px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Users size={16} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0F2942' }}>
                                    Despachos por Agente Operativo
                                </h3>
                                <p style={{ margin: '1px 0 0', fontSize: '0.74rem', color: '#64748B' }}>
                                    Mensajes manuales salientes emitidos por cada asesora ({metrics.agentMessages} mensajes)
                                </p>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                        {metrics.byAgentList.map(ag => {
                            const total = Math.max(metrics.agentMessages, 1);
                            const pct = Math.round((ag.count / total) * 100);

                            return (
                                <div key={ag.id} style={{
                                    padding: '10px 14px',
                                    borderRadius: '10px',
                                    background: '#F8FAFC',
                                    border: '1px solid #F1F5F9'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                                            <span style={{
                                                width: '24px', height: '24px', borderRadius: '50%', background: ag.color,
                                                color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '0.68rem', fontWeight: 800, flexShrink: 0
                                            }}>
                                                {ag.avatar}
                                            </span>
                                            <div>
                                                <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F2942' }}>
                                                    {ag.name}
                                                </div>
                                                <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                                    {ag.role}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F2942' }}>
                                                {ag.count} msgs
                                            </div>
                                            <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>
                                                {pct}% del total humano
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ height: '6px', background: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                                        <div style={{
                                            height: '100%',
                                            width: `${pct}%`,
                                            background: ag.color,
                                            borderRadius: '3px',
                                            transition: 'width 0.4s ease'
                                        }} />
                                    </div>
                                </div>
                            );
                        })}

                        {/* Fila Especial: Automatización por Bot */}
                        <div style={{
                            marginTop: 'auto',
                            padding: '12px 14px',
                            borderRadius: '10px',
                            background: '#F0F9FF',
                            border: '1px solid #BAE6FD'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Bot size={16} color="#0284C7" />
                                    <div>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0284C7' }}>
                                            Bot Sanatorio Argentino (Automatizado)
                                        </div>
                                        <div style={{ fontSize: '0.68rem', color: '#0369A1' }}>
                                            Respuestas de triage, bienvenida e instrucciones
                                        </div>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0284C7' }}>
                                        {metrics.botMessages} msgs
                                    </div>
                                    <div style={{ fontSize: '0.68rem', color: '#0369A1', fontWeight: 600 }}>
                                        {botPct}% de todos los salientes
                                    </div>
                                </div>
                            </div>
                            <div style={{ height: '6px', background: '#BAE6FD', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%',
                                    width: `${botPct}%`,
                                    background: '#0284C7',
                                    borderRadius: '3px',
                                    transition: 'width 0.4s ease'
                                }} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* 3. CONVERSACIONES FINALIZADAS Y DISTRIBUCIÓN DE MOTIVOS DE CIERRE */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                padding: '22px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.02)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#F5F3FF', color: '#8B5CF6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CheckCircle2 size={18} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0F2942' }}>
                                Conversaciones Finalizadas y Motivos de Resolución
                            </h3>
                            <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#64748B' }}>
                                Auditoría de cierre de casos clínicos y derivaciones con encuesta de satisfacción
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                            fontSize: '0.76rem', fontWeight: 800, padding: '4px 10px', borderRadius: '20px',
                            background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0'
                        }}>
                            ✅ {metrics.closedConversationsCount} Casos Finalizados
                        </span>
                        <span style={{
                            fontSize: '0.76rem', fontWeight: 800, padding: '4px 10px', borderRadius: '20px',
                            background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE'
                        }}>
                            💬 {metrics.activeConversationsCount} En Curso
                        </span>
                    </div>
                </div>

                {/* Grid de Motivos de Finalización */}
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
                                padding: '12px 14px',
                                borderRadius: '10px',
                                background: '#FFFFFF',
                                border: '1px solid #E2E8F0',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
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

                <div style={{
                    marginTop: '16px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    fontSize: '0.73rem',
                    color: '#64748B',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <AlertCircle size={14} color="#0284C7" />
                    <span>
                        <strong>Auditoría de Calidad:</strong> Cada vez que una asesora presiona "Finalizar Atención", se almacena el motivo correspondiente y se envía de forma automática el mensaje oficial con el enlace de satisfacción al paciente.
                    </span>
                </div>
            </div>

        </div>
    );
}
