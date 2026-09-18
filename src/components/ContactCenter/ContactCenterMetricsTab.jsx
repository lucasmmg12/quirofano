import React, { useState, useEffect } from 'react';
import { 
    BarChart3, TrendingDown, DollarSign, Users, MessageSquare, 
    Bot, RefreshCw, CheckCircle2, ShieldAlert, Sparkles, Activity,
    Calendar, ArrowUpRight, Check
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { CONTACT_CENTER_AGENTS } from '../../services/contactCenterService';

export default function ContactCenterMetricsTab({ addToast }) {
    const [loading, setLoading] = useState(true);
    const [syncingSalus, setSyncingSalus] = useState(false);
    const [stats, setStats] = useState({
        totalOutgoing: 0,
        totalIncoming: 0,
        botMessages: 0,
        agentMessages: 0,
        savedMessagesEst: 0,
        savedCostEstUsd: 0,
        byAgent: {
            daniela: 0,
            sofia: 0,
            virginia: 0,
            erica: 0,
            bot: 0,
            otros: 0
        },
        byIntent: {
            turnos: 0,
            autorizaciones: 0,
            web_info: 0,
            otros: 0
        },
        activeDoctorsCount: 0,
        activeConsultoriosToday: 0
    });

    const loadMetrics = async () => {
        setLoading(true);
        try {
            // 1. Mensajes de whatsapp_messages
            const { data: messages, error: msgErr } = await supabase
                .from('whatsapp_messages')
                .select('id, direction, sender_name, created_at, raw_payload');

            // 2. Conversaciones estructuradas
            const { data: convs, error: convErr } = await supabase
                .from('contact_center_conversations')
                .select('phone, motivo_consulta, assigned_agent_id, es_paciente_existente');

            // 3. Doctores sincronizados
            const { count: docCount } = await supabase
                .from('contact_center_doctor_parameters')
                .select('*', { count: 'exact', head: true });

            // 4. Consultorios con ocupación
            const { data: consultoriosData } = await supabase
                .from('contact_center_doctor_parameters')
                .select('consultorio_actual')
                .not('consultorio_actual', 'is', null);

            let outgoing = 0;
            let incoming = 0;
            let botCount = 0;
            let agentCount = 0;
            const agentMap = {
                daniela: 0,
                sofia: 0,
                virginia: 0,
                erica: 0,
                bot: 0,
                otros: 0
            };

            (messages || []).forEach(m => {
                if (m.direction === 'outgoing') {
                    outgoing++;
                    const sender = (m.sender_name || '').toLowerCase();
                    const rawAgent = (m.raw_payload?.agent || '').toLowerCase();
                    const isBot = m.raw_payload?.bot || sender.includes('bot') || sender.includes('sanatorio');

                    if (isBot) {
                        botCount++;
                        agentMap.bot++;
                    } else if (rawAgent === 'daniela' || sender.includes('daniela')) {
                        agentCount++;
                        agentMap.daniela++;
                    } else if (rawAgent === 'sofia' || sender.includes('sofia')) {
                        agentCount++;
                        agentMap.sofia++;
                    } else if (rawAgent === 'virginia' || sender.includes('virginia')) {
                        agentCount++;
                        agentMap.virginia++;
                    } else if (rawAgent === 'erica' || sender.includes('erica')) {
                        agentCount++;
                        agentMap.erica++;
                    } else {
                        agentCount++;
                        agentMap.otros++;
                    }
                } else if (m.direction === 'incoming') {
                    incoming++;
                }
            });

            // Intenciones
            const intentMap = { turnos: 0, autorizaciones: 0, web_info: 0, otros: 0 };
            (convs || []).forEach(c => {
                const motivo = (c.motivo_consulta || '').toLowerCase();
                if (motivo.includes('turno') || motivo.includes('reprogram')) intentMap.turnos++;
                else if (motivo.includes('autoriz')) intentMap.autorizaciones++;
                else if (motivo.includes('web') || motivo.includes('institucional')) intentMap.web_info++;
                else intentMap.otros++;
            });

            // Estimación de ahorro comparado con el modelo anterior de ~14 preguntas individuales
            // En el modelo anterior se enviaban ~14 mensajes por paciente; en el nuevo modelo ~2 mensajes
            const patientInteractions = Math.max(convs?.length || 0, Math.round(incoming / 2));
            const oldModelMessages = patientInteractions * 14;
            const newModelMessages = outgoing;
            const savedMsgs = Math.max(0, oldModelMessages - newModelMessages);
            const savedCost = (savedMsgs * 0.05).toFixed(2); // ~0.05 USD por plantilla/conversación WA

            setStats({
                totalOutgoing: outgoing,
                totalIncoming: incoming,
                botMessages: botCount,
                agentMessages: agentCount,
                savedMessagesEst: savedMsgs,
                savedCostEstUsd: savedCost,
                byAgent: agentMap,
                byIntent: intentMap,
                activeDoctorsCount: docCount || 0,
                activeConsultoriosToday: consultoriosData ? new Set(consultoriosData.map(c => c.consultorio_actual)).size : 0
            });

        } catch (err) {
            console.error('Error cargando métricas:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadMetrics();
    }, []);

    const triggerSalusSync = async () => {
        setSyncingSalus(true);
        try {
            const res = await fetch('http://localhost:3456/api/contact-center/sync-doctor-parameters');
            const data = await res.json();
            if (data.success) {
                if (addToast) addToast(`Sincronizados ${data.count} parámetros y honorarios de médicos desde SALUS`, 'success');
                loadMetrics();
            } else {
                throw new Error(data.error || 'Error desconocido');
            }
        } catch (err) {
            if (addToast) addToast(`Error al sincronizar SALUS: ${err.message}`, 'error');
        } finally {
            setSyncingSalus(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header de Métricas y Control de Costos */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                padding: '24px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.02)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px'
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '40px', height: '40px', borderRadius: '10px',
                            background: 'linear-gradient(135deg, #0F2942 0%, #0284C7 100%)',
                            color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <BarChart3 size={22} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>
                                Métricas y Control de Costos — Contact Center
                            </h2>
                            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                                Optimización de mensajes WhatsApp, triage bifurcado y distribución por agente
                            </p>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                        onClick={triggerSalusSync}
                        disabled={syncingSalus}
                        style={{
                            padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1',
                            background: '#FFFFFF', color: '#0F172A', fontSize: '0.78rem', fontWeight: 700,
                            cursor: syncingSalus ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                    >
                        <RefreshCw size={14} className={syncingSalus ? 'spin' : ''} />
                        {syncingSalus ? 'Sincronizando SALUS...' : 'Sincronizar SALUS'}
                    </button>

                    <button
                        onClick={loadMetrics}
                        disabled={loading}
                        style={{
                            padding: '8px 16px', borderRadius: '8px', border: 'none',
                            background: '#0284C7', color: '#FFFFFF', fontSize: '0.78rem', fontWeight: 700,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                    >
                        <RefreshCw size={14} className={loading ? 'spin' : ''} />
                        Actualizar
                    </button>
                </div>
            </div>

            {/* KPI Cards de Ahorro y Volumen */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '16px'
            }}>
                {/* CARD 1: Reducción de Mensajes */}
                <div style={{
                    background: 'linear-gradient(135deg, #0F2942 0%, #1E3A8A 100%)',
                    borderRadius: '14px', padding: '20px', color: '#FFFFFF',
                    boxShadow: '0 4px 15px rgba(15, 41, 66, 0.15)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#93C5FD', textTransform: 'uppercase' }}>
                            Ahorro vs Modelo Antiguo
                        </span>
                        <TrendingDown size={18} color="#4ADE80" />
                    </div>
                    <div style={{ fontSize: '1.9rem', fontWeight: 800 }}>
                        ~{stats.savedMessagesEst} msgs
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#E2E8F0', marginTop: '6px' }}>
                        Pasamos de ~14 preguntas en mensajes individuales a <strong>1-2 mensajes consolidados</strong>.
                    </div>
                </div>

                {/* CARD 2: Costo Ahorrado Estimado */}
                <div style={{
                    background: '#FFFFFF', borderRadius: '14px', padding: '20px',
                    border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                            Ahorro Facturación WA
                        </span>
                        <DollarSign size={18} color="#16A34A" />
                    </div>
                    <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#16A34A' }}>
                        ${stats.savedCostEstUsd} USD
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: '6px' }}>
                        Costo evitado por reducción del 85% en despachos por paciente.
                    </div>
                </div>

                {/* CARD 3: Mensajes Salientes Reales */}
                <div style={{
                    background: '#FFFFFF', borderRadius: '14px', padding: '20px',
                    border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                            Total Salientes
                        </span>
                        <MessageSquare size={18} color="#0284C7" />
                    </div>
                    <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#0F172A' }}>
                        {stats.totalOutgoing}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: '6px', display: 'flex', gap: '8px' }}>
                        <span>🤖 Bot: <strong>{stats.botMessages}</strong></span>
                        <span>•</span>
                        <span>👩‍⚕️ Agentes: <strong>{stats.agentMessages}</strong></span>
                    </div>
                </div>

                {/* CARD 4: Doctores y Consultorios Activos SALUS */}
                <div style={{
                    background: '#FFFFFF', borderRadius: '14px', padding: '20px',
                    border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                            Prestadores SALUS
                        </span>
                        <Activity size={18} color="#8B5CF6" />
                    </div>
                    <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#0F172A' }}>
                        {stats.activeDoctorsCount}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: '6px' }}>
                        {stats.activeConsultoriosToday} consultorios activos con notas de honorarios y MP.
                    </div>
                </div>
            </div>

            {/* Grilla de Distribución: Agentes e Intenciones */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
                {/* PANEL: Mensajes por Agente */}
                <div style={{
                    background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '22px'
                }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '0.98rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Users size={18} color="#0284C7" />
                        Despachos por Agente Oficial
                    </h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {CONTACT_CENTER_AGENTS.map(ag => {
                            const count = stats.byAgent[ag.id] || 0;
                            const total = Math.max(stats.agentMessages, 1);
                            const pct = Math.round((count / total) * 100);

                            return (
                                <div key={ag.id}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{
                                                width: '20px', height: '20px', borderRadius: '50%', background: ag.color,
                                                color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '0.68rem', fontWeight: 800
                                            }}>
                                                {ag.avatar}
                                            </span>
                                            <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A' }}>
                                                {ag.fullName}
                                            </span>
                                        </div>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>
                                            {count} msgs <span style={{ color: '#64748B', fontWeight: 500 }}>({pct}%)</span>
                                        </span>
                                    </div>
                                    <div style={{ height: '7px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${pct}%`, background: ag.color, borderRadius: '4px' }} />
                                    </div>
                                </div>
                            );
                        })}

                        {/* Bot Triage row */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{
                                        width: '20px', height: '20px', borderRadius: '50%', background: '#0284C7',
                                        color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '0.68rem', fontWeight: 800
                                    }}>
                                        🤖
                                    </span>
                                    <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A' }}>
                                        Bot Triage Sanatorio (Automatizado)
                                    </span>
                                </div>
                                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>
                                    {stats.botMessages} msgs
                                </span>
                            </div>
                            <div style={{ height: '7px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${Math.min(100, Math.round((stats.botMessages / Math.max(stats.totalOutgoing, 1)) * 100))}%`, background: '#0284C7', borderRadius: '4px' }} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* PANEL: Distribución por Motivo / Consulta */}
                <div style={{
                    background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '22px'
                }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '0.98rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Sparkles size={18} color="#8B5CF6" />
                        Distribución por Tipo de Consulta
                    </h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A' }}>
                                    1️⃣ Turnos y Reprogramaciones
                                </span>
                                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0284C7' }}>
                                    {stats.byIntent.turnos} casos
                                </span>
                            </div>
                            <div style={{ height: '7px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: '70%', background: '#0284C7', borderRadius: '4px' }} />
                            </div>
                        </div>

                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A' }}>
                                    2️⃣ Autorizaciones de Estudios
                                </span>
                                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#059669' }}>
                                    {stats.byIntent.autorizaciones} casos
                                </span>
                            </div>
                            <div style={{ height: '7px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: '20%', background: '#059669', borderRadius: '4px' }} />
                            </div>
                        </div>

                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A' }}>
                                    3️⃣ Información General (Web www.sanatorioargentino.com.ar)
                                </span>
                                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#D97706' }}>
                                    {stats.byIntent.web_info} casos
                                </span>
                            </div>
                            <div style={{ height: '7px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: '10%', background: '#D97706', borderRadius: '4px' }} />
                            </div>
                        </div>
                    </div>

                    <div style={{
                        marginTop: '20px', padding: '12px 14px', borderRadius: '10px',
                        background: '#F8FAFC', border: '1px solid #E2E8F0', fontSize: '0.75rem', color: '#475569'
                    }}>
                        ℹ️ <strong>Regla de Negocio Calidad-QOAG:</strong> Cuando el paciente selecciona la opción 3 o solicita información de servicios, el bot envía de forma mandatoria el enlace oficial <strong>www.sanatorioargentino.com.ar</strong> para evitar redundancia de mensajes.
                    </div>
                </div>
            </div>
        </div>
    );
}
