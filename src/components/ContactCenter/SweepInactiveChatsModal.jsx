import React, { useState, useEffect, useMemo } from 'react';
import { 
    Brush, 
    Clock, 
    AlertTriangle, 
    CheckCircle2, 
    X, 
    ShieldCheck, 
    Users, 
    User, 
    Sparkles, 
    Filter,
    Loader2
} from 'lucide-react';
import { sweepInactiveConversations } from '../../services/contactCenterService';

/**
 * Modal de Barrido Rápido de Conversaciones Inactivas
 * Permite archivar en bloque conversaciones sin actividad (+24h, +12h, etc.)
 * Estilo Clean Clinical - Calidad QOAG
 */
export default function SweepInactiveChatsModal({
    isOpen,
    onClose,
    activeAgent,
    chats = [],
    onSweepSuccess
}) {
    const [hoursThreshold, setHoursThreshold] = useState(24);
    const [scope, setScope] = useState('all'); // 'all' | 'mine'
    const [resolutionReason, setResolutionReason] = useState('Cierre automático por inactividad (+24h)');
    const [isSweeping, setIsSweeping] = useState(false);
    const [errorMsg, setErrorMsg] = useState(null);
    const [sweepResult, setSweepResult] = useState(null);

    // Actualizar motivo predeterminado al cambiar el umbral
    useEffect(() => {
        setResolutionReason(`Cierre automático por inactividad (+${hoursThreshold}h)`);
    }, [hoursThreshold]);

    // Resetear estado al abrir
    useEffect(() => {
        if (isOpen) {
            setSweepResult(null);
            setErrorMsg(null);
            setIsSweeping(false);
        }
    }, [isOpen]);

    // Calcular estadísticas en tiempo real sobre los chats activos en memoria
    const stats = useMemo(() => {
        const now = Date.now();
        const openChats = (chats || []).filter(c => {
            const st = (c.status || '').toLowerCase();
            return !['archivado', 'cerrado', 'finalizado', 'resuelto', 'archived', 'closed'].includes(st);
        });

        const getOlderCount = (hours, onlyMine = false) => {
            const cutoffMs = hours * 3600 * 1000;
            return openChats.filter(c => {
                if (onlyMine && c.assignedTo !== activeAgent?.id && c.assigned_agent_id !== activeAgent?.id) {
                    return false;
                }
                const time = c.lastMessageTimestamp || (c.updated_at ? new Date(c.updated_at).getTime() : 0);
                return (now - time) >= cutoffMs;
            }).length;
        };

        return {
            totalOpen: openChats.length,
            myOpen: openChats.filter(c => c.assignedTo === activeAgent?.id || c.assigned_agent_id === activeAgent?.id).length,
            over24hAll: getOlderCount(24, false),
            over24hMine: getOlderCount(24, true),
            over12hAll: getOlderCount(12, false),
            over12hMine: getOlderCount(12, true),
            over4hAll: getOlderCount(4, false),
            over4hMine: getOlderCount(4, true),
            selectedCount: getOlderCount(hoursThreshold, scope === 'mine')
        };
    }, [chats, activeAgent, hoursThreshold, scope]);

    if (!isOpen) return null;

    const handleExecuteSweep = async () => {
        setIsSweeping(true);
        setErrorMsg(null);
        try {
            const result = await sweepInactiveConversations({
                hoursThreshold,
                assignedAgentId: scope === 'mine' ? activeAgent?.id : null,
                closedByAgentId: activeAgent?.id || 'contact_center_agent',
                closedByAgentName: activeAgent?.name || 'Operadora',
                resolutionReason: resolutionReason.trim()
            });

            if (!result.success && result.error) {
                throw new Error(result.error);
            }

            setSweepResult(result);
            if (onSweepSuccess) {
                onSweepSuccess(result);
            }
        } catch (err) {
            console.error('[SweepModal] Error ejecutando barrido:', err);
            setErrorMsg(err.message || 'Error al procesar el barrido');
        } finally {
            setIsSweeping(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            fontFamily: 'Inter, system-ui, sans-serif'
        }}>
            <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '540px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                border: '1px solid #E2E8F0',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {/* Cabecera Clínica */}
                <div style={{
                    padding: '18px 24px',
                    borderBottom: '1px solid #F1F5F9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
                    color: '#FFFFFF'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '10px',
                            background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 10px rgba(2, 132, 199, 0.4)'
                        }}>
                            <Brush size={20} color="#FFFFFF" />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
                                Barrido Rápido de Inactivos
                            </h3>
                            <p style={{ margin: 0, fontSize: '0.74rem', color: '#94A3B8' }}>
                                Archivado masivo de conversaciones con ventana Meta expirada
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isSweeping}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#94A3B8',
                            cursor: 'pointer',
                            padding: '4px',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Contenido Principal */}
                <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {sweepResult ? (
                        /* Pantalla de Éxito */
                        <div style={{
                            padding: '24px',
                            borderRadius: '12px',
                            backgroundColor: '#F0FDF4',
                            border: '1.5px solid #86EFAC',
                            textAlign: 'center',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '10px'
                        }}>
                            <div style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: '50%',
                                backgroundColor: '#10B981',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#FFFFFF',
                                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                            }}>
                                <CheckCircle2 size={28} />
                            </div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#065F46' }}>
                                ¡Barrido Completado con Éxito!
                            </div>
                            <p style={{ fontSize: '0.82rem', color: '#047857', margin: 0, maxWidth: '380px' }}>
                                Se han finalizado y archivado <strong>{sweepResult.count} conversaciones</strong> inactivas. La bandeja quedó despejada y organizada.
                            </p>
                            <button
                                onClick={onClose}
                                style={{
                                    marginTop: '10px',
                                    padding: '8px 24px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    backgroundColor: '#059669',
                                    color: '#FFFFFF',
                                    fontSize: '0.84rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                Entendido y Cerrar
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Selector de Umbral de Tiempo */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                                    ⏱️ Seleccionar Antigüedad de Inactividad:
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                                    {[
                                        { h: 24, label: '+24 Horas', desc: 'Ventana Meta Vencida', badge: 'Recomendado' },
                                        { h: 12, label: '+12 Horas', desc: 'Turno Anterior', badge: null },
                                        { h: 4, label: '+4 Horas', desc: 'Sin Respuesta Hoy', badge: null }
                                    ].map(opt => {
                                        const isSel = hoursThreshold === opt.h;
                                        return (
                                            <div
                                                key={opt.h}
                                                onClick={() => setHoursThreshold(opt.h)}
                                                style={{
                                                    padding: '10px 12px',
                                                    borderRadius: '10px',
                                                    border: `2px solid ${isSel ? '#0284C7' : '#E2E8F0'}`,
                                                    backgroundColor: isSel ? '#F0F9FF' : '#F8FAFC',
                                                    cursor: 'pointer',
                                                    textAlign: 'center',
                                                    position: 'relative',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                {opt.badge && (
                                                    <span style={{
                                                        position: 'absolute',
                                                        top: '-8px',
                                                        right: '8px',
                                                        background: '#0284C7',
                                                        color: '#FFFFFF',
                                                        fontSize: '0.60rem',
                                                        fontWeight: 800,
                                                        padding: '1px 6px',
                                                        borderRadius: '6px',
                                                        textTransform: 'uppercase'
                                                    }}>
                                                        {opt.badge}
                                                    </span>
                                                )}
                                                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: isSel ? '#0284C7' : '#1E293B' }}>
                                                    {opt.label}
                                                </div>
                                                <div style={{ fontSize: '0.68rem', color: isSel ? '#0369A1' : '#64748B', marginTop: '2px' }}>
                                                    {opt.desc}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Selector de Alcance */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                                    🎯 Alcance del Barrido:
                                </label>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <div
                                        onClick={() => setScope('all')}
                                        style={{
                                            flex: 1,
                                            padding: '10px 14px',
                                            borderRadius: '10px',
                                            border: `1.5px solid ${scope === 'all' ? '#0284C7' : '#E2E8F0'}`,
                                            backgroundColor: scope === 'all' ? '#F0F9FF' : '#FFFFFF',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px'
                                        }}
                                    >
                                        <Users size={18} color={scope === 'all' ? '#0284C7' : '#64748B'} />
                                        <div>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: scope === 'all' ? '#0284C7' : '#1E293B' }}>
                                                Todas las bandejas
                                            </div>
                                            <div style={{ fontSize: '0.70rem', color: '#64748B' }}>
                                                Incluye sin asignar y otras operadoras
                                            </div>
                                        </div>
                                    </div>

                                    <div
                                        onClick={() => setScope('mine')}
                                        style={{
                                            flex: 1,
                                            padding: '10px 14px',
                                            borderRadius: '10px',
                                            border: `1.5px solid ${scope === 'mine' ? '#0284C7' : '#E2E8F0'}`,
                                            backgroundColor: scope === 'mine' ? '#F0F9FF' : '#FFFFFF',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px'
                                        }}
                                    >
                                        <User size={18} color={scope === 'mine' ? '#0284C7' : '#64748B'} />
                                        <div>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: scope === 'mine' ? '#0284C7' : '#1E293B' }}>
                                                Solo mis chats
                                            </div>
                                            <div style={{ fontSize: '0.70rem', color: '#64748B' }}>
                                                Asignados a {activeAgent?.name || 'mí'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Motivo de Cierre */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                    🏷️ Motivo de Resolución / Cierre:
                                </label>
                                <input
                                    type="text"
                                    value={resolutionReason}
                                    onChange={(e) => setResolutionReason(e.target.value)}
                                    placeholder="Motivo del archivado masivo..."
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.80rem',
                                        color: '#1E293B',
                                        boxSizing: 'border-box',
                                        outline: 'none'
                                    }}
                                />
                            </div>

                            {/* Banner de Garantía y Seguridad Clínica */}
                            <div style={{
                                padding: '10px 14px',
                                borderRadius: '10px',
                                backgroundColor: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '10px'
                            }}>
                                <ShieldCheck size={20} color="#059669" style={{ flexShrink: 0, marginTop: '2px' }} />
                                <div style={{ fontSize: '0.74rem', color: '#475569', lineHeight: 1.4 }}>
                                    <strong style={{ color: '#065F46' }}>Garantía de continuidad clínica:</strong> Si algún paciente responde en el futuro a este WhatsApp, el chat se <strong>desarchivará automáticamente</strong> y reingresará a la bandeja en tiempo real sin perder ningún dato.
                                </div>
                            </div>

                            {errorMsg && (
                                <div style={{
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    backgroundColor: '#FEF2F2',
                                    border: '1px solid #FECACA',
                                    color: '#DC2626',
                                    fontSize: '0.76rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}>
                                    <AlertTriangle size={14} />
                                    <span>{errorMsg}</span>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Pie de Acciones */}
                {!sweepResult && (
                    <div style={{
                        padding: '14px 24px',
                        borderTop: '1px solid #F1F5F9',
                        backgroundColor: '#F8FAFC',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSweeping}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                backgroundColor: '#FFFFFF',
                                color: '#475569',
                                fontSize: '0.80rem',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            Cancelar
                        </button>

                        <button
                            type="button"
                            onClick={handleExecuteSweep}
                            disabled={isSweeping}
                            style={{
                                padding: '8px 18px',
                                borderRadius: '8px',
                                border: 'none',
                                background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                                color: '#FFFFFF',
                                fontSize: '0.82rem',
                                fontWeight: 700,
                                cursor: isSweeping ? 'wait' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: '0 2px 6px rgba(2, 132, 199, 0.35)'
                            }}
                        >
                            {isSweeping ? (
                                <>
                                    <Loader2 size={15} className="animate-spin" />
                                    <span>Procesando barrido...</span>
                                </>
                            ) : (
                                <>
                                    <Brush size={15} />
                                    <span>Barrer Inactivos (+{hoursThreshold}h)</span>
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
