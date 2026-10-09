import React, { useState, useEffect, useMemo } from 'react';
import { 
    X, Calendar, Clock, MessageSquare, CheckCircle2, 
    Stethoscope, FileText, RotateCcw, AlertTriangle, HelpCircle, 
    TrendingUp, Award, Zap, Copy, Check, RefreshCw, ArrowRightLeft,
    Sparkles, ShieldCheck, User, BarChart2, Info
} from 'lucide-react';
import { getAgentDailyShiftMetrics, buildShiftSummaryClipboardText } from '../../services/agentShiftService';
import { CONTACT_CENTER_AGENTS } from '../../services/contactCenterService';

export default function AgentShiftSummaryModal({
    isOpen,
    onClose,
    activeAgent = CONTACT_CENTER_AGENTS[0],
    onOpenHandoverModal,
    myAssignedChatsCount = 0
}) {
    const [selectedAgent, setSelectedAgent] = useState(activeAgent);
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().substring(0, 10));
    const [loading, setLoading] = useState(true);
    const [metrics, setMetrics] = useState(null);
    const [copied, setCopied] = useState(false);
    const [errorMsg, setErrorMsg] = useState(null);

    // Actualizar agente seleccionado si cambia la prop
    useEffect(() => {
        if (activeAgent) {
            setSelectedAgent(activeAgent);
        }
    }, [activeAgent]);

    // Cargar métricas al abrir o cambiar de agente / fecha
    const loadMetrics = async (agent = selectedAgent, date = selectedDate) => {
        if (!agent) return;
        setLoading(true);
        setErrorMsg(null);
        try {
            const data = await getAgentDailyShiftMetrics({
                agentId: agent.id,
                agentName: agent.fullName || agent.name,
                dateStr: date
            });
            setMetrics(data);
        } catch (err) {
            console.error('Error cargando métricas de final de turno:', err);
            setErrorMsg('No se pudieron obtener las métricas del turno. Intenta nuevamente.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            loadMetrics(selectedAgent, selectedDate);
        }
    }, [isOpen, selectedAgent?.id, selectedDate]);

    // Copiar reporte al portapapeles
    const handleCopyReport = async () => {
        if (!metrics) return;
        const text = buildShiftSummaryClipboardText(metrics);
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch (_) {
            // Fallback con textarea
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        }
    };

    if (!isOpen) return null;

    const kpis = metrics?.kpis || {
        mensajesEnviados: 0,
        conversacionesFinalizadas: 0,
        conversacionesGestionadas: 0,
        turnosSalus: 0,
        tasaResolucion: 0,
        promMensajesPorChat: '0',
        chatsPendientes: 0
    };

    const categorias = metrics?.categorias || {};
    const totalConsultas = metrics?.totalConsultasClasificadas || 0;
    const score = metrics?.score || { nivel: 'Calculando...', color: '#0284C7', diagnostico: '' };
    const hourlyDistribution = metrics?.hourlyDistribution || {};

    // Obtener el valor máximo para escalar el mini gráfico horario
    const maxHourVal = Math.max(1, ...Object.values(hourlyDistribution));

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            animation: 'fadeIn 0.2s ease-out'
        }}>
            <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '920px',
                maxHeight: '92vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                border: '1px solid #E2E8F0',
                overflow: 'hidden'
            }}>
                {/* ── HEADER MODAL ── */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid #E2E8F0',
                    background: 'linear-gradient(135deg, #0F2942 0%, #0369A1 100%)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '12px',
                            background: 'rgba(255, 255, 255, 0.15)',
                            backdropFilter: 'blur(8px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
                        }}>
                            <BarChart2 size={24} color="#38BDF8" />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h2 style={{ margin: 0, fontSize: '1.18rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                                    Resumen de Final de Turno
                                </h2>
                                <span style={{
                                    fontSize: '0.66rem',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    background: 'rgba(56, 189, 248, 0.2)',
                                    color: '#BAE6FD',
                                    border: '1px solid rgba(56, 189, 248, 0.3)'
                                }}>
                                    Live Insights
                                </span>
                            </div>
                            <p style={{ margin: 0, fontSize: '0.76rem', color: '#E0F2FE', opacity: 0.9 }}>
                                Métricas de productividad, consultas recibidas y turnos agendados en SALUS
                            </p>
                        </div>
                    </div>

                    {/* Selector de Agente y Selector de Fecha */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <select
                            value={selectedAgent?.id || ''}
                            onChange={(e) => {
                                const found = CONTACT_CENTER_AGENTS.find(a => a.id === e.target.value);
                                if (found) setSelectedAgent(found);
                            }}
                            style={{
                                background: 'rgba(255, 255, 255, 0.12)',
                                border: '1px solid rgba(255, 255, 255, 0.25)',
                                color: '#FFFFFF',
                                borderRadius: '8px',
                                padding: '6px 10px',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            {CONTACT_CENTER_AGENTS.map(ag => (
                                <option key={ag.id} value={ag.id} style={{ color: '#0F172A', background: '#FFFFFF' }}>
                                    {ag.fullName || ag.name}
                                </option>
                            ))}
                        </select>

                        <input 
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            max={new Date().toISOString().substring(0, 10)}
                            style={{
                                background: 'rgba(255, 255, 255, 0.12)',
                                border: '1px solid rgba(255, 255, 255, 0.25)',
                                color: '#FFFFFF',
                                borderRadius: '8px',
                                padding: '5px 8px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                        />

                        <button
                            type="button"
                            onClick={() => loadMetrics()}
                            disabled={loading}
                            title="Recargar métricas"
                            style={{
                                background: 'rgba(255, 255, 255, 0.15)',
                                border: '1px solid rgba(255, 255, 255, 0.25)',
                                color: '#FFFFFF',
                                borderRadius: '8px',
                                padding: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <RefreshCw size={15} className={loading ? 'spin' : ''} />
                        </button>

                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                background: 'rgba(255, 255, 255, 0.15)',
                                border: 'none',
                                color: '#FFFFFF',
                                borderRadius: '8px',
                                width: '32px',
                                height: '32px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* ── CUERPO DEL MODAL (SCROLLABLE) ── */}
                <div style={{
                    padding: '20px',
                    overflowY: 'auto',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '18px',
                    background: '#F8FAFC'
                }}>
                    {loading ? (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '60px 20px',
                            gap: '12px'
                        }}>
                            <RefreshCw size={32} color="#0284C7" className="spin" />
                            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#475569' }}>
                                Consolidando mensajes, cierres y turnos en SALUS de {selectedAgent?.name}...
                            </span>
                        </div>
                    ) : errorMsg ? (
                        <div style={{
                            background: '#FEF2F2',
                            border: '1px solid #FECACA',
                            borderRadius: '10px',
                            padding: '16px',
                            color: '#991B1B',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px'
                        }}>
                            <AlertTriangle size={20} />
                            <span>{errorMsg}</span>
                        </div>
                    ) : (
                        <>
                            {/* ── DIAGNÓSTICO DESTACADO DEL TURNO ── */}
                            <div style={{
                                background: '#FFFFFF',
                                borderRadius: '12px',
                                padding: '16px 20px',
                                border: `1px solid ${score.color}30`,
                                borderLeft: `5px solid ${score.color}`,
                                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '16px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                    <div style={{
                                        width: '42px',
                                        height: '42px',
                                        borderRadius: '10px',
                                        background: `${score.color}15`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0
                                    }}>
                                        <Sparkles size={22} color={score.color} />
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.05em' }}>
                                                Diagnóstico General del Turno
                                            </span>
                                            <span style={{
                                                fontSize: '0.7rem',
                                                fontWeight: 800,
                                                padding: '2px 8px',
                                                borderRadius: '6px',
                                                background: `${score.color}20`,
                                                color: score.color
                                            }}>
                                                {score.nivel}
                                            </span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#1E293B', lineHeight: 1.4, fontWeight: 500 }}>
                                            {score.diagnostico}
                                        </p>
                                    </div>
                                </div>

                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <span style={{ fontSize: '0.68rem', color: '#64748B', display: 'block' }}>Operadora</span>
                                    <span style={{ fontSize: '0.92rem', fontWeight: 800, color: selectedAgent?.color || '#0284C7' }}>
                                        {selectedAgent?.fullName || selectedAgent?.name}
                                    </span>
                                </div>
                            </div>

                            {/* ── 4 KPIS HERO DEL FINAL DE TURNO ── */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(4, 1fr)',
                                gap: '12px'
                            }}>
                                {/* 1. Mensajes Enviados */}
                                <div style={{
                                    background: '#FFFFFF',
                                    borderRadius: '12px',
                                    padding: '14px 16px',
                                    border: '1px solid #E2E8F0',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>
                                            Mensajes Enviados
                                        </span>
                                        <div style={{
                                            width: '28px',
                                            height: '28px',
                                            borderRadius: '8px',
                                            background: '#EFF6FF',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            <MessageSquare size={15} color="#0284C7" />
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>
                                            {kpis.mensajesEnviados}
                                        </div>
                                        <span style={{ fontSize: '0.7rem', color: '#0284C7', fontWeight: 600 }}>
                                            ~{kpis.promMensajesPorChat} msgs / conversación
                                        </span>
                                    </div>
                                </div>

                                {/* 2. Conversaciones Finalizadas */}
                                <div style={{
                                    background: '#FFFFFF',
                                    borderRadius: '12px',
                                    padding: '14px 16px',
                                    border: '1px solid #E2E8F0',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>
                                            Casos Finalizados
                                        </span>
                                        <div style={{
                                            width: '28px',
                                            height: '28px',
                                            borderRadius: '8px',
                                            background: '#F0FDF4',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            <CheckCircle2 size={15} color="#16A34A" />
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>
                                            {kpis.conversacionesFinalizadas}
                                        </div>
                                        <span style={{ fontSize: '0.7rem', color: '#16A34A', fontWeight: 600 }}>
                                            {kpis.tasaResolucion}% tasa resolutiva
                                        </span>
                                    </div>
                                </div>

                                {/* 3. Turnos Agendados SALUS */}
                                <div style={{
                                    background: '#FFFFFF',
                                    borderRadius: '12px',
                                    padding: '14px 16px',
                                    border: '1px solid #E2E8F0',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>
                                            Turnos en SALUS
                                        </span>
                                        <div style={{
                                            width: '28px',
                                            height: '28px',
                                            borderRadius: '8px',
                                            background: '#FAF5FF',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            <Stethoscope size={15} color="#8B5CF6" />
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>
                                            {kpis.turnosSalus}
                                        </div>
                                        <span style={{ fontSize: '0.7rem', color: '#8B5CF6', fontWeight: 600 }}>
                                            Citas creadas hoy
                                        </span>
                                    </div>
                                </div>

                                {/* 4. Total Casos Gestionados */}
                                <div style={{
                                    background: '#FFFFFF',
                                    borderRadius: '12px',
                                    padding: '14px 16px',
                                    border: '1px solid #E2E8F0',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>
                                            Total Gestionados
                                        </span>
                                        <div style={{
                                            width: '28px',
                                            height: '28px',
                                            borderRadius: '8px',
                                            background: '#FFFBEB',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            <TrendingUp size={15} color="#D97706" />
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>
                                            {kpis.conversacionesGestionadas}
                                        </div>
                                        <span style={{ fontSize: '0.7rem', color: kpis.chatsPendientes > 0 ? '#D97706' : '#16A34A', fontWeight: 600 }}>
                                            {kpis.chatsPendientes > 0 ? `${kpis.chatsPendientes} pendientes de cierre` : 'Bandeja limpia al 100%'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* ── DISTRIBUCIÓN HORARIA DEL RITMO DE MENSAJES (MINI-BAR-CHART) ── */}
                            <div style={{
                                background: '#FFFFFF',
                                borderRadius: '12px',
                                padding: '16px 20px',
                                border: '1px solid #E2E8F0',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '0.86rem', fontWeight: 800, color: '#0F172A' }}>
                                            Curva de Respuestas por Hora (Ritmo del Turno)
                                        </h3>
                                        <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                            Evolución del volumen de interacción de la operadora a lo largo de su jornada
                                        </span>
                                    </div>
                                    <span style={{
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                        padding: '2px 8px',
                                        borderRadius: '6px',
                                        background: '#F1F5F9',
                                        color: '#334155'
                                    }}>
                                        7:00 a 21:00 hs
                                    </span>
                                </div>

                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: `repeat(${Object.keys(hourlyDistribution).length}, 1fr)`,
                                    gap: '6px',
                                    alignItems: 'flex-end',
                                    height: '75px',
                                    paddingTop: '8px'
                                }}>
                                    {Object.entries(hourlyDistribution).map(([hora, cant]) => {
                                        const pct = (cant / maxHourVal) * 100;
                                        const isHigh = cant === maxHourVal && cant > 0;
                                        return (
                                            <div key={hora} style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                height: '100%',
                                                justifyContent: 'flex-end',
                                                gap: '4px'
                                            }}>
                                                <span style={{
                                                    fontSize: '0.62rem',
                                                    fontWeight: 700,
                                                    color: isHigh ? '#0284C7' : cant > 0 ? '#475569' : '#CBD5E1'
                                                }}>
                                                    {cant > 0 ? cant : ''}
                                                </span>
                                                <div 
                                                    title={`${hora}: ${cant} mensajes enviados`}
                                                    style={{
                                                        width: '100%',
                                                        maxWidth: '28px',
                                                        height: `${Math.max(4, pct)}%`,
                                                        borderRadius: '4px 4px 0 0',
                                                        background: isHigh 
                                                            ? 'linear-gradient(180deg, #0284C7 0%, #0369A1 100%)' 
                                                            : cant > 0 
                                                                ? '#93C5FD' 
                                                                : '#E2E8F0',
                                                        transition: 'all 0.3s ease'
                                                    }} 
                                                />
                                                <span style={{ fontSize: '0.58rem', color: '#94A3B8', fontWeight: 600 }}>
                                                    {hora.split(':')[0]}h
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ── HISTOGRAMA DE TIEMPOS DE RESOLUCIÓN DEL TURNO (SLA) ── */}
                            <div style={{
                                background: '#FFFFFF',
                                borderRadius: '12px',
                                padding: '16px 20px',
                                border: '1px solid #E2E8F0',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '0.86rem', fontWeight: 800, color: '#0F172A' }}>
                                            Histograma de Tiempos de Resolución de Hoy
                                        </h3>
                                        <p style={{ margin: '2px 0 0', fontSize: '0.70rem', color: '#64748B' }}>
                                            Velocidad con la que resolviste las consultas en tu turno
                                        </p>
                                    </div>
                                    {kpis.archivedOver24h > 0 && (
                                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', background: '#F1F5F9', border: '1px solid #CBD5E1', padding: '2px 8px', borderRadius: '6px' }}>
                                            {kpis.archivedOver24h} archivados por inactividad (+24h)
                                        </span>
                                    )}
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px' }}>
                                    {(metrics?.resolutionHistogram || []).map((b, i) => (
                                        <div key={i} style={{
                                            padding: '8px 10px',
                                            borderRadius: '8px',
                                            border: `1.5px solid ${b.color}33`,
                                            background: `${b.color}0D`,
                                            textAlign: 'center'
                                        }}>
                                            <div style={{ fontSize: '0.66rem', fontWeight: 800, color: b.color }}>{b.range}</div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#0F172A', margin: '2px 0' }}>{b.count}</div>
                                            <div style={{ fontSize: '0.60rem', color: '#64748B' }}>conversaciones</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* ── TIPOS DE CONSULTAS RECIBIDAS (DISTRIBUCIÓN Y DESGLOSE) ── */}
                            <div style={{
                                background: '#FFFFFF',
                                borderRadius: '12px',
                                padding: '16px 20px',
                                border: '1px solid #E2E8F0',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '0.86rem', fontWeight: 800, color: '#0F172A' }}>
                                            Tipos de Consultas Gestionadas
                                        </h3>
                                        <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                            Clasificación automática por intención del paciente atendida en la jornada
                                        </span>
                                    </div>
                                    <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#0284C7' }}>
                                        {totalConsultas} {totalConsultas === 1 ? 'gestión clasificada' : 'gestiones clasificadas'}
                                    </span>
                                </div>

                                {/* Barra Segmentada */}
                                {totalConsultas > 0 ? (
                                    <>
                                        <div style={{
                                            display: 'flex',
                                            height: '10px',
                                            borderRadius: '6px',
                                            overflow: 'hidden',
                                            background: '#F1F5F9',
                                            marginBottom: '14px'
                                        }}>
                                            {Object.entries(categorias).map(([key, cat]) => {
                                                if (cat.count === 0) return null;
                                                const pct = (cat.count / totalConsultas) * 100;
                                                return (
                                                    <div 
                                                        key={key}
                                                        title={`${cat.label}: ${cat.count} (${pct.toFixed(0)}%)`}
                                                        style={{
                                                            width: `${pct}%`,
                                                            background: cat.color,
                                                            transition: 'width 0.3s ease'
                                                        }}
                                                    />
                                                );
                                            })}
                                        </div>

                                        {/* Grid de Cards de Categorías */}
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(3, 1fr)',
                                            gap: '10px'
                                        }}>
                                            {Object.entries(categorias).map(([key, cat]) => {
                                                const pct = totalConsultas > 0 ? ((cat.count / totalConsultas) * 100).toFixed(0) : '0';
                                                return (
                                                    <div key={key} style={{
                                                        padding: '10px 12px',
                                                        borderRadius: '8px',
                                                        border: '1px solid #E2E8F0',
                                                        background: '#F8FAFC',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        gap: '8px'
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                                            <div style={{
                                                                width: '10px',
                                                                height: '10px',
                                                                borderRadius: '3px',
                                                                background: cat.color,
                                                                flexShrink: 0
                                                            }} />
                                                            <span style={{
                                                                fontSize: '0.74rem',
                                                                color: '#334155',
                                                                fontWeight: 600,
                                                                whiteSpace: 'nowrap',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis'
                                                            }}>
                                                                {cat.label}
                                                            </span>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                                            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>
                                                                {cat.count}
                                                            </span>
                                                            <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>
                                                                ({pct}%)
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ padding: '20px', textAlign: 'center', color: '#94A3B8', fontSize: '0.78rem' }}>
                                        No se registran gestiones para clasificar en la fecha seleccionada.
                                    </div>
                                )}
                            </div>

                            {/* ── SMART INSIGHTS GRID ── */}
                            <div style={{
                                background: '#FFFFFF',
                                borderRadius: '12px',
                                padding: '16px 20px',
                                border: '1px solid #E2E8F0',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                    <Sparkles size={16} color="#0284C7" />
                                    <h3 style={{ margin: 0, fontSize: '0.86rem', fontWeight: 800, color: '#0F172A' }}>
                                        Insights y Métricas Cualitativas del Turno
                                    </h3>
                                </div>

                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(2, 1fr)',
                                    gap: '10px'
                                }}>
                                    {(metrics?.insights || []).map(ins => {
                                        const isAlert = ins.tipo === 'alert';
                                        const isSuccess = ins.tipo === 'success';
                                        return (
                                            <div key={ins.id} style={{
                                                padding: '12px 14px',
                                                borderRadius: '10px',
                                                border: `1px solid ${isAlert ? '#FECACA' : isSuccess ? '#BBF7D0' : '#E2E8F0'}`,
                                                background: isAlert ? '#FEF2F2' : isSuccess ? '#F0FDF4' : '#F8FAFC',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '4px'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>
                                                        {ins.titulo}
                                                    </span>
                                                    <span style={{
                                                        fontSize: '0.64rem',
                                                        fontWeight: 800,
                                                        padding: '1px 6px',
                                                        borderRadius: '4px',
                                                        background: isAlert ? '#FEE2E2' : isSuccess ? '#DCFCE7' : '#E2E8F0',
                                                        color: isAlert ? '#B91C1C' : isSuccess ? '#15803D' : '#475569'
                                                    }}>
                                                        {ins.badge}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: isAlert ? '#991B1B' : isSuccess ? '#166534' : '#0F172A' }}>
                                                    {ins.valor}
                                                </div>
                                                <p style={{ margin: 0, fontSize: '0.72rem', color: '#475569', lineHeight: 1.35 }}>
                                                    {ins.descripcion}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* ── FOOTER DE ACCIONES ── */}
                <div style={{
                    padding: '12px 20px',
                    borderTop: '1px solid #E2E8F0',
                    background: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {kpis.chatsPendientes > 0 && onOpenHandoverModal && (
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    onOpenHandoverModal();
                                }}
                                style={{
                                    padding: '7px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid #F59E0B',
                                    background: '#FEF3C7',
                                    color: '#B45309',
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <ArrowRightLeft size={13} />
                                <span>Pase de Guardia ({kpis.chatsPendientes} pendientes)</span>
                            </button>
                        )}
                        <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                            Datos sincronizados en tiempo real con Supabase y SALUS
                        </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={handleCopyReport}
                            disabled={loading || !metrics}
                            style={{
                                padding: '8px 14px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                background: copied ? '#F0FDF4' : '#FFFFFF',
                                color: copied ? '#16A34A' : '#334155',
                                fontSize: '0.76rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            {copied ? <Check size={14} color="#16A34A" /> : <Copy size={14} />}
                            <span>{copied ? '¡Reporte Copiado!' : 'Copiar Reporte de Turno'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                padding: '8px 18px',
                                borderRadius: '8px',
                                border: 'none',
                                background: '#0284C7',
                                color: '#FFFFFF',
                                fontSize: '0.76rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                                boxShadow: '0 1px 3px rgba(2, 132, 199, 0.3)'
                            }}
                        >
                            Cerrar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
