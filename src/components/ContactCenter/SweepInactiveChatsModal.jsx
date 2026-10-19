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
import { supabase } from '../../lib/supabase';

/**
 * Modal de Barrido Rápido de Conversaciones Inactivas
 * Permite archivar en bloque conversaciones sin actividad (+24h, +8h, +4h, +2h)
 * Estilo Clean Clinical - Calidad QOAG
 */
export default function SweepInactiveChatsModal({
    isOpen,
    onClose,
    activeAgent,
    currentUser,
    chats = [],
    onSweepSuccess
}) {
    const [hoursThreshold, setHoursThreshold] = useState(24);
    const [scope, setScope] = useState('all'); // 'all' | 'mine'
    const [resolutionReason, setResolutionReason] = useState('Cierre automático por inactividad (+24h)');
    const [isSweeping, setIsSweeping] = useState(false);
    const [errorMsg, setErrorMsg] = useState(null);
    const [sweepResult, setSweepResult] = useState(null);
    const [dbConvs, setDbConvs] = useState(null);
    const [loadingDbStats, setLoadingDbStats] = useState(false);

    // Actualizar motivo predeterminado al cambiar el umbral
    useEffect(() => {
        setResolutionReason(`Cierre automático por inactividad (+${hoursThreshold}h)`);
    }, [hoursThreshold]);

    // Cargar estadísticas globales en vivo desde Supabase al abrir el modal
    useEffect(() => {
        if (isOpen) {
            setSweepResult(null);
            setErrorMsg(null);
            setIsSweeping(false);
            setLoadingDbStats(true);

            supabase
                .from('contact_center_conversations')
                .select('phone, last_message_at, updated_at, created_at, assigned_agent_id, status, nombre_completo')
                .not('status', 'in', '("archivado","cerrado","finalizado","resuelto","archived","closed")')
                .then(({ data, error }) => {
                    if (!error && Array.isArray(data)) {
                        setDbConvs(data);
                        // Si no hay conversaciones de +24h, auto-seleccionar el umbral con inactividad disponible
                        const now = Date.now();
                        const count24 = data.filter(c => {
                            const timeStr = c.last_message_at || c.updated_at || c.created_at;
                            return (now - (timeStr ? new Date(timeStr).getTime() : 0)) >= 24 * 3600 * 1000;
                        }).length;
                        if (count24 === 0) {
                            const count4 = data.filter(c => {
                                const timeStr = c.last_message_at || c.updated_at || c.created_at;
                                return (now - (timeStr ? new Date(timeStr).getTime() : 0)) >= 4 * 3600 * 1000;
                            }).length;
                            if (count4 > 0) {
                                setHoursThreshold(4);
                            } else {
                                const count2 = data.filter(c => {
                                    const timeStr = c.last_message_at || c.updated_at || c.created_at;
                                    return (now - (timeStr ? new Date(timeStr).getTime() : 0)) >= 2 * 3600 * 1000;
                                }).length;
                                if (count2 > 0) setHoursThreshold(2);
                            }
                        }
                    }
                })
                .catch((err) => {
                    console.warn('[SweepModal] Error consultando conversaciones abiertas:', err);
                })
                .finally(() => {
                    setLoadingDbStats(false);
                });
        }
    }, [isOpen]);

    // Calcular estadísticas en tiempo real: priorizar el padrón completo de la BD
    const stats = useMemo(() => {
        const now = Date.now();

        // Si ya cargaron los datos directos de Supabase, usarlos; de lo contrario fallback a los de memoria
        if (dbConvs && Array.isArray(dbConvs)) {
            const openList = dbConvs.filter(c => {
                const st = (c.status || '').toLowerCase();
                return !['archivado', 'cerrado', 'finalizado', 'resuelto', 'archived', 'closed'].includes(st);
            });

            const getOlderCount = (hours, onlyMine = false) => {
                const cutoffMs = hours * 3600 * 1000;
                return openList.filter(c => {
                    if (onlyMine && c.assigned_agent_id !== activeAgent?.id) {
                        return false;
                    }
                    const timeStr = c.last_message_at || c.updated_at || c.created_at;
                    const time = timeStr ? new Date(timeStr).getTime() : 0;
                    return (now - time) >= cutoffMs;
                }).length;
            };

            return {
                totalOpen: openList.length,
                myOpen: openList.filter(c => c.assigned_agent_id === activeAgent?.id).length,
                over24hAll: getOlderCount(24, false),
                over24hMine: getOlderCount(24, true),
                over8hAll: getOlderCount(8, false),
                over8hMine: getOlderCount(8, true),
                over4hAll: getOlderCount(4, false),
                over4hMine: getOlderCount(4, true),
                over2hAll: getOlderCount(2, false),
                over2hMine: getOlderCount(2, true),
                selectedCount: getOlderCount(hoursThreshold, scope === 'mine'),
                getCount: (h) => getOlderCount(h, scope === 'mine')
            };
        }

        // Fallback memoria local si la consulta aún está en tránsito
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
            over8hAll: getOlderCount(8, false),
            over8hMine: getOlderCount(8, true),
            over4hAll: getOlderCount(4, false),
            over4hMine: getOlderCount(4, true),
            over2hAll: getOlderCount(2, false),
            over2hMine: getOlderCount(2, true),
            selectedCount: getOlderCount(hoursThreshold, scope === 'mine'),
            getCount: (h) => getOlderCount(h, scope === 'mine')
        };
    }, [dbConvs, chats, activeAgent, hoursThreshold, scope]);

    if (!isOpen) return null;

    const handleExecuteSweep = async () => {
        const u = String(currentUser?.usuario || currentUser?.email || activeAgent?.username || activeAgent?.id || '').toLowerCase().trim().split('@')[0];
        const isAllowed = u === 'lmarinero' || u === 'lucas' || u.includes('marinero');
        if (!isAllowed) {
            setErrorMsg('Acceso restringido: Esta acción de nivel supervisor solo puede ser ejecutada por el perfil de @lmarinero.');
            return;
        }

        setIsSweeping(true);
        setErrorMsg(null);
        try {
            const now = Date.now();
            const cutoffMs = hoursThreshold * 3600 * 1000;

            let targetPhones = [];
            let targetChatIds = [];

            if (dbConvs && Array.isArray(dbConvs) && dbConvs.length > 0) {
                const targetConvs = dbConvs.filter(c => {
                    const st = (c.status || '').toLowerCase();
                    if (['archivado', 'cerrado', 'finalizado', 'resuelto', 'archived', 'closed'].includes(st)) return false;
                    if (scope === 'mine' && c.assigned_agent_id !== activeAgent?.id) return false;
                    const timeStr = c.last_message_at || c.updated_at || c.created_at;
                    const time = timeStr ? new Date(timeStr).getTime() : 0;
                    return (now - time) >= cutoffMs;
                });
                targetPhones = targetConvs.map(c => c.phone).filter(Boolean);
            } else {
                const openChats = (chats || []).filter(c => {
                    const st = (c.status || '').toLowerCase();
                    return !['archivado', 'cerrado', 'finalizado', 'resuelto', 'archived', 'closed'].includes(st);
                });
                const targetChats = openChats.filter(c => {
                    if (scope === 'mine' && c.assignedTo !== activeAgent?.id && c.assigned_agent_id !== activeAgent?.id) return false;
                    const time = c.lastMessageTimestamp || (c.updated_at ? new Date(c.updated_at).getTime() : 0);
                    return (now - time) >= cutoffMs;
                });
                targetChatIds = targetChats.map(c => c.id).filter(Boolean);
                targetPhones = targetChats.map(c => c.phone).filter(Boolean);
            }

            const result = await sweepInactiveConversations({
                hoursThreshold,
                assignedAgentId: scope === 'mine' ? activeAgent?.id : null,
                closedByAgentId: 'lmarinero',
                closedByAgentName: 'Lucas Marinero (Supervisor)',
                resolutionReason: resolutionReason.trim(),
                targetPhones: targetPhones.length > 0 ? targetPhones : null
            });

            if (!result.success && result.error) {
                throw new Error(result.error);
            }

            setSweepResult(result);
            if (onSweepSuccess) {
                onSweepSuccess({
                    ...result,
                    targetChatIds,
                    resolutionReason: resolutionReason.trim()
                });
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
                                    Barrido Rápido de Inactivos
                                </h3>
                                <span style={{
                                    fontSize: '0.62rem',
                                    fontWeight: 800,
                                    background: 'rgba(2, 132, 199, 0.25)',
                                    border: '1px solid rgba(56, 189, 248, 0.5)',
                                    color: '#38BDF8',
                                    padding: '2px 8px',
                                    borderRadius: '12px'
                                }}>
                                    Exclusivo @lmarinero
                                </span>
                            </div>
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
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
                                        ⏱️ Seleccionar Antigüedad de Inactividad:
                                    </label>
                                    {loadingDbStats && (
                                        <span style={{ fontSize: '0.68rem', color: '#0284C7', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                            <Loader2 size={12} className="animate-spin" /> Escaneando base de datos...
                                        </span>
                                    )}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                                    {[
                                        { h: 24, label: '+24 Horas', desc: 'Meta Vencida (Ayer)', badge: 'Ayer' },
                                        { h: 8, label: '+8 Horas', desc: 'Turno Mañana', badge: null },
                                        { h: 4, label: '+4 Horas', desc: 'Sin Resp. (+4h)', badge: 'Recomendado' },
                                        { h: 2, label: '+2 Horas', desc: 'Inactivos (+2h)', badge: 'Hoy' }
                                    ].map(opt => {
                                        const isSel = hoursThreshold === opt.h;
                                        const count = stats?.getCount ? stats.getCount(opt.h) : 0;
                                        return (
                                            <div
                                                key={opt.h}
                                                onClick={() => setHoursThreshold(opt.h)}
                                                style={{
                                                    padding: '8px 8px',
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
                                                        right: '4px',
                                                        background: opt.badge === 'Recomendado' ? '#0284C7' : (opt.badge === 'Hoy' ? '#059669' : '#64748B'),
                                                        color: '#FFFFFF',
                                                        fontSize: '0.55rem',
                                                        fontWeight: 800,
                                                        padding: '1px 5px',
                                                        borderRadius: '6px',
                                                        textTransform: 'uppercase'
                                                    }}>
                                                        {opt.badge}
                                                    </span>
                                                )}
                                                <div style={{ fontSize: '0.84rem', fontWeight: 800, color: isSel ? '#0284C7' : '#1E293B' }}>
                                                    {opt.label}
                                                </div>
                                                <div style={{ fontSize: '0.64rem', color: isSel ? '#0369A1' : '#64748B', marginTop: '2px', lineHeight: 1.2 }}>
                                                    {opt.desc}
                                                </div>
                                                <div style={{ marginTop: '6px' }}>
                                                    <span style={{
                                                        fontSize: '0.68rem',
                                                        fontWeight: 800,
                                                        padding: '1px 6px',
                                                        borderRadius: '8px',
                                                        backgroundColor: isSel ? '#0284C7' : (count > 0 ? '#E2E8F0' : '#F1F5F9'),
                                                        color: isSel ? '#FFFFFF' : (count > 0 ? '#0F172A' : '#94A3B8')
                                                    }}>
                                                        {count} {count === 1 ? 'chat' : 'chats'}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div style={{
                                    marginTop: '8px',
                                    padding: '6px 10px',
                                    borderRadius: '8px',
                                    backgroundColor: (stats?.selectedCount || 0) > 0 ? '#F0FDF4' : '#FFFBEB',
                                    border: `1px solid ${(stats?.selectedCount || 0) > 0 ? '#BBF7D0' : '#FDE68A'}`,
                                    color: (stats?.selectedCount || 0) > 0 ? '#166534' : '#B45309',
                                    fontSize: '0.74rem',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between'
                                }}>
                                    <span>
                                        {(stats?.selectedCount || 0) > 0 
                                            ? `🎯 Se archivarán ${stats.selectedCount} ${stats.selectedCount === 1 ? 'conversación inactiva' : 'conversaciones inactivas'} (+${hoursThreshold}h).`
                                            : `ℹ️ No hay conversaciones con más de ${hoursThreshold}h de inactividad (${scope === 'mine' ? 'en tus chats' : 'en la bandeja general'}).`
                                        }
                                    </span>
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
                                padding: '12px 14px',
                                borderRadius: '10px',
                                backgroundColor: '#F0FDF4',
                                border: '1px solid #BBF7D0',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '10px'
                            }}>
                                <ShieldCheck size={22} color="#16A34A" style={{ flexShrink: 0, marginTop: '2px' }} />
                                <div style={{ fontSize: '0.74rem', color: '#166534', lineHeight: 1.45 }}>
                                    <strong style={{ color: '#14532D', display: 'block', marginBottom: '2px' }}>
                                        🛡️ Garantía de Integridad: ¡Ningún mensaje se borra!
                                    </strong>
                                    Esta acción solo <strong>archiva y cambia el estado</strong> de las conversaciones inactivas en la bandeja. Todo el historial de mensajes de WhatsApp queda <strong>100% preservado</strong> en la base de datos. Si un paciente vuelve a escribir, la conversación se <strong>desarchivará automáticamente</strong> reingresando a la bandeja en tiempo real con todo su historial.
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
                            disabled={isSweeping || (stats?.selectedCount || 0) === 0}
                            style={{
                                padding: '8px 18px',
                                borderRadius: '8px',
                                border: 'none',
                                background: (stats?.selectedCount || 0) === 0 ? '#94A3B8' : 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                                color: '#FFFFFF',
                                fontSize: '0.82rem',
                                fontWeight: 700,
                                cursor: isSweeping ? 'wait' : ((stats?.selectedCount || 0) === 0 ? 'not-allowed' : 'pointer'),
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: (stats?.selectedCount || 0) === 0 ? 'none' : '0 2px 6px rgba(2, 132, 199, 0.35)',
                                opacity: (stats?.selectedCount || 0) === 0 ? 0.75 : 1
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
                                    <span>
                                        {(stats?.selectedCount || 0) > 0 
                                            ? `Barrer Inactivos (+${hoursThreshold}h) · ${stats.selectedCount}`
                                            : `Sin inactivos (+${hoursThreshold}h)`}
                                    </span>
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
