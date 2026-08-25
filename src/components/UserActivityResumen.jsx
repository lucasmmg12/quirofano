/**
 * UserActivityPanel — Analytics de uso por usuario
 * 
 * Muestra:
 * - Usuarios online ahora
 * - Ranking de horas por usuario
 * - Módulos más usados globalmente
 * 
 * Visible solo para lmarinero.
 */
import { useState, useEffect, useCallback } from 'react';
import {
    Activity, Users, Clock, BarChart3, Monitor, ChevronDown, ChevronRight,
    RefreshCw, Calendar, Wifi, WifiOff,
} from 'lucide-react';
import { fetchUserActivitySummary, fetchModuleUsageGlobal, fetchActiveSessions } from '../services/activityService';

// ── Date range helpers ──
function getDateRange(preset) {
    const now = new Date();
    const hasta = now.toISOString();
    let desde;

    switch (preset) {
        case 'hoy': {
            const d = new Date(now);
            d.setHours(0, 0, 0, 0);
            desde = d.toISOString();
            break;
        }
        case 'semana': {
            const d = new Date(now);
            d.setDate(d.getDate() - 7);
            desde = d.toISOString();
            break;
        }
        case 'mes': {
            const d = new Date(now);
            d.setDate(d.getDate() - 30);
            desde = d.toISOString();
            break;
        }
        case '3meses': {
            const d = new Date(now);
            d.setDate(d.getDate() - 90);
            desde = d.toISOString();
            break;
        }
        default: {
            const d = new Date(now);
            d.setDate(d.getDate() - 30);
            desde = d.toISOString();
        }
    }

    return { desde, hasta };
}

function formatMinutes(mins) {
    if (!mins || mins < 1) return '< 1 min';
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatSeconds(secs) {
    if (!secs || secs < 60) return '< 1 min';
    return formatMinutes(Math.round(secs / 60));
}

function timeAgo(dateStr) {
    if (!dateStr) return '—';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Ahora';
    if (mins < 60) return `hace ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `hace ${hours}h`;
    const days = Math.floor(hours / 24);
    return `hace ${days}d`;
}

// ── Color palette for avatars ──
const AVATAR_COLORS = [
    'linear-gradient(135deg, #6366F1, #4F46E5)',
    'linear-gradient(135deg, #EC4899, #DB2777)',
    'linear-gradient(135deg, #14B8A6, #0D9488)',
    'linear-gradient(135deg, #F59E0B, #D97706)',
    'linear-gradient(135deg, #8B5CF6, #7C3AED)',
    'linear-gradient(135deg, #EF4444, #DC2626)',
    'linear-gradient(135deg, #06B6D4, #0891B2)',
    'linear-gradient(135deg, #10B981, #059669)',
];

function getAvatarColor(index) {
    return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

// ── Preset labels ──
const PRESETS = [
    { key: 'hoy', label: 'Hoy' },
    { key: 'semana', label: 'Semana' },
    { key: 'mes', label: '30 días' },
    { key: '3meses', label: '90 días' },
];

export default function UserActivityResumen() {
    const [datePreset, setDatePreset] = useState('mes');
    const [loading, setLoading] = useState(true);
    const [userSummary, setUserSummary] = useState([]);
    const [moduleUsage, setModuleUsage] = useState([]);
    const [activeSessions, setActiveSessions] = useState([]);
    const [expandedUser, setExpandedUser] = useState(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        const { desde, hasta } = getDateRange(datePreset);

        const [users, modules, active] = await Promise.all([
            fetchUserActivitySummary(desde, hasta),
            fetchModuleUsageGlobal(desde, hasta),
            fetchActiveSessions(),
        ]);

        setUserSummary(users);
        setModuleUsage(modules);
        setActiveSessions(active);
        setLoading(false);
    }, [datePreset]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Auto-refresh active sessions every 2 min
    useEffect(() => {
        const timer = setInterval(async () => {
            const active = await fetchActiveSessions();
            setActiveSessions(active);
        }, 120_000);
        return () => clearInterval(timer);
    }, []);

    const maxMinutes = userSummary.length > 0
        ? Math.max(...userSummary.map(u => u.total_minutes || 0), 1)
        : 1;

    const maxModuleSeconds = moduleUsage.length > 0
        ? Math.max(...moduleUsage.map(m => m.total_seconds || 0), 1)
        : 1;

    return (
        <div className="content no-print" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            {/* ── Header ── */}
            <div className="animate-fade-in" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '24px', flexWrap: 'wrap', gap: '12px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '44px', height: '44px', borderRadius: '14px',
                        background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 14px rgba(99, 102, 241, 0.3)',
                    }}>
                        <Activity size={22} color="#fff" />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: 'var(--neutral-800)' }}>
                            Actividad de Usuarios
                        </h2>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--neutral-500)' }}>
                            Sesiones, horas y módulos más usados
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* Date preset pills */}
                    <div style={{
                        display: 'flex', gap: '4px', padding: '3px',
                        background: 'var(--neutral-100)', borderRadius: '10px',
                    }}>
                        {PRESETS.map(p => (
                            <button
                                key={p.key}
                                onClick={() => setDatePreset(p.key)}
                                style={{
                                    padding: '5px 12px', borderRadius: '8px', border: 'none',
                                    fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    background: datePreset === p.key ? '#fff' : 'transparent',
                                    color: datePreset === p.key ? 'var(--primary-600)' : 'var(--neutral-500)',
                                    boxShadow: datePreset === p.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                                }}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={loadData}
                        disabled={loading}
                        style={{
                            width: '34px', height: '34px', borderRadius: '10px',
                            background: 'var(--neutral-50)', border: '1px solid var(--neutral-200)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: 'var(--neutral-500)', transition: 'all 0.2s',
                        }}
                        title="Refrescar"
                    >
                        <RefreshCw size={15} className={loading ? 'spin' : ''} />
                    </button>
                </div>
            </div>

            {loading ? (
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    minHeight: '300px', color: 'var(--neutral-400)', gap: '8px',
                }}>
                    <RefreshCw size={20} className="spin" />
                    <span style={{ fontSize: '0.85rem' }}>Cargando datos...</span>
                </div>
            ) : (
                <>
                    {/* ── Summary Cards ── */}
                    <div className="animate-fade-in" style={{
                        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '16px', marginBottom: '24px',
                    }}>
                        {[
                            {
                                label: 'Online Ahora',
                                value: activeSessions.length,
                                icon: Wifi,
                                color: '#10B981',
                                bg: '#ECFDF5',
                            },
                            {
                                label: 'Usuarios Activos',
                                value: userSummary.length,
                                icon: Users,
                                color: '#6366F1',
                                bg: '#EEF2FF',
                            },
                            {
                                label: 'Sesiones Totales',
                                value: userSummary.reduce((s, u) => s + (u.total_sessions || 0), 0),
                                icon: Monitor,
                                color: '#F59E0B',
                                bg: '#FFFBEB',
                            },
                            {
                                label: 'Horas Totales',
                                value: formatMinutes(userSummary.reduce((s, u) => s + (u.total_minutes || 0), 0)),
                                icon: Clock,
                                color: '#EC4899',
                                bg: '#FDF2F8',
                            },
                        ].map((card, idx) => (
                            <div key={idx} style={{
                                padding: '18px 20px', borderRadius: '14px',
                                background: '#fff', border: '1px solid var(--neutral-100)',
                                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                                display: 'flex', alignItems: 'center', gap: '14px',
                            }}>
                                <div style={{
                                    width: '42px', height: '42px', borderRadius: '12px',
                                    background: card.bg, display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                }}>
                                    <card.icon size={20} color={card.color} />
                                </div>
                                <div>
                                    <p style={{
                                        margin: 0, fontSize: '1.25rem', fontWeight: 700,
                                        color: 'var(--neutral-800)',
                                    }}>{card.value}</p>
                                    <p style={{
                                        margin: 0, fontSize: '0.72rem', color: 'var(--neutral-500)',
                                        fontWeight: 500,
                                    }}>{card.label}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* ── Online Now ── */}
                    {activeSessions.length > 0 && (
                        <div className="animate-fade-in" style={{
                            padding: '18px 20px', borderRadius: '14px',
                            background: '#fff', border: '1px solid var(--neutral-100)',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: '20px',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                <Wifi size={16} color="#10B981" />
                                <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: 'var(--neutral-700)' }}>
                                    Usuarios Online
                                </h3>
                                <span style={{
                                    padding: '2px 8px', borderRadius: '8px',
                                    background: '#ECFDF5', color: '#059669',
                                    fontSize: '0.7rem', fontWeight: 700,
                                }}>{activeSessions.length}</span>
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                {activeSessions.map((s, idx) => (
                                    <div key={s.id} style={{
                                        display: 'flex', alignItems: 'center', gap: '10px',
                                        padding: '10px 14px', borderRadius: '10px',
                                        background: 'var(--neutral-50)', border: '1px solid var(--neutral-100)',
                                        minWidth: '200px',
                                    }}>
                                        <div style={{ position: 'relative' }}>
                                            <div style={{
                                                width: '34px', height: '34px', borderRadius: '50%',
                                                background: getAvatarColor(idx),
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '0.65rem', fontWeight: 800, color: '#fff',
                                            }}>
                                                {(s.usuario || '??').substring(0, 2).toUpperCase()}
                                            </div>
                                            <div style={{
                                                position: 'absolute', bottom: -1, right: -1,
                                                width: '10px', height: '10px', borderRadius: '50%',
                                                background: '#10B981', border: '2px solid #fff',
                                            }} />
                                        </div>
                                        <div>
                                            <p style={{
                                                margin: 0, fontSize: '0.8rem', fontWeight: 600,
                                                color: 'var(--neutral-700)',
                                            }}>{s.usuario}</p>
                                            <p style={{
                                                margin: 0, fontSize: '0.68rem', color: 'var(--neutral-400)',
                                            }}>
                                                {s.current_module
                                                    ? `📍 ${s.current_module.module_label}`
                                                    : `Sesión: ${timeAgo(s.started_at)}`
                                                }
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Two column layout: Users + Modules ── */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 1fr',
                        gap: '20px',
                    }}>
                        {/* ── User Ranking ── */}
                        <div className="animate-fade-in" style={{
                            padding: '18px 20px', borderRadius: '14px',
                            background: '#fff', border: '1px solid var(--neutral-100)',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                <BarChart3 size={16} color="#6366F1" />
                                <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: 'var(--neutral-700)' }}>
                                    Ranking por Horas
                                </h3>
                            </div>

                            {userSummary.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--neutral-400)' }}>
                                    <Users size={32} strokeWidth={1.2} />
                                    <p style={{ fontSize: '0.82rem', marginTop: '8px' }}>Sin datos para este período</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {userSummary.map((user, idx) => (
                                        <div key={user.usuario}>
                                            <button
                                                onClick={() => setExpandedUser(expandedUser === user.usuario ? null : user.usuario)}
                                                style={{
                                                    width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                                                    padding: '10px 12px', borderRadius: '10px',
                                                    background: expandedUser === user.usuario ? 'var(--neutral-50)' : 'transparent',
                                                    border: '1px solid',
                                                    borderColor: expandedUser === user.usuario ? 'var(--neutral-200)' : 'transparent',
                                                    cursor: 'pointer', transition: 'all 0.15s',
                                                    textAlign: 'left',
                                                }}
                                            >
                                                {/* Rank */}
                                                <span style={{
                                                    fontSize: '0.72rem', fontWeight: 700, color: 'var(--neutral-400)',
                                                    width: '20px', textAlign: 'center', flexShrink: 0,
                                                }}>
                                                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                                                </span>

                                                {/* Avatar */}
                                                <div style={{
                                                    width: '32px', height: '32px', borderRadius: '50%',
                                                    background: getAvatarColor(idx),
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: '0.6rem', fontWeight: 800, color: '#fff', flexShrink: 0,
                                                }}>
                                                    {user.iniciales || (user.usuario ? user.usuario.substring(0, 2).toUpperCase() : '??')}
                                                </div>

                                                {/* Name + Stats */}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p style={{
                                                        margin: 0, fontSize: '0.8rem', fontWeight: 600,
                                                        color: 'var(--neutral-700)', whiteSpace: 'nowrap',
                                                        overflow: 'hidden', textOverflow: 'ellipsis',
                                                    }}>{user.nombre}</p>
                                                    <div style={{
                                                        display: 'flex', alignItems: 'center', gap: '8px',
                                                        marginTop: '3px',
                                                    }}>
                                                        <span style={{ fontSize: '0.68rem', color: 'var(--neutral-400)' }}>
                                                            {user.total_sessions} sesiones
                                                        </span>
                                                        <span style={{ fontSize: '0.68rem', color: 'var(--neutral-400)' }}>
                                                            · Último: {timeAgo(user.last_seen)}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Hours badge */}
                                                <span style={{
                                                    padding: '3px 10px', borderRadius: '8px',
                                                    background: idx === 0 ? '#EEF2FF' : 'var(--neutral-50)',
                                                    color: idx === 0 ? '#4F46E5' : 'var(--neutral-600)',
                                                    fontSize: '0.75rem', fontWeight: 700, flexShrink: 0,
                                                }}>
                                                    {formatMinutes(user.total_minutes)}
                                                </span>

                                                {/* Expand indicator */}
                                                {expandedUser === user.usuario
                                                    ? <ChevronDown size={14} color="var(--neutral-400)" />
                                                    : <ChevronRight size={14} color="var(--neutral-400)" />
                                                }
                                            </button>

                                            {/* Progress bar */}
                                            <div style={{
                                                height: '3px', borderRadius: '2px',
                                                background: 'var(--neutral-100)', margin: '0 12px',
                                                overflow: 'hidden',
                                            }}>
                                                <div style={{
                                                    height: '100%', borderRadius: '2px',
                                                    background: `linear-gradient(90deg, #6366F1, #818CF8)`,
                                                    width: `${Math.max((user.total_minutes / maxMinutes) * 100, 2)}%`,
                                                    transition: 'width 0.6s ease',
                                                }} />
                                            </div>

                                            {/* Expanded: user's top modules */}
                                            {expandedUser === user.usuario && user.top_modules && user.top_modules.length > 0 && (
                                                <div className="animate-fade-in" style={{
                                                    padding: '10px 12px 10px 52px',
                                                    display: 'flex', flexDirection: 'column', gap: '4px',
                                                }}>
                                                    <p style={{
                                                        margin: '0 0 6px', fontSize: '0.7rem', fontWeight: 600,
                                                        color: 'var(--neutral-500)', textTransform: 'uppercase',
                                                        letterSpacing: '0.04em',
                                                    }}>Módulos más usados</p>
                                                    {user.top_modules.slice(0, 5).map((mod, mi) => (
                                                        <div key={mi} style={{
                                                            display: 'flex', alignItems: 'center', gap: '8px',
                                                            fontSize: '0.75rem',
                                                        }}>
                                                            <span style={{
                                                                padding: '2px 8px', borderRadius: '6px',
                                                                background: 'var(--neutral-100)',
                                                                color: 'var(--neutral-600)', fontWeight: 500,
                                                                fontSize: '0.72rem', minWidth: '55px', textAlign: 'right',
                                                            }}>
                                                                {formatSeconds(mod.total_seconds)}
                                                            </span>
                                                            <span style={{ color: 'var(--neutral-700)' }}>
                                                                {mod.module_label || mod.module_id}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* ── Module Usage ── */}
                        <div className="animate-fade-in" style={{
                            padding: '18px 20px', borderRadius: '14px',
                            background: '#fff', border: '1px solid var(--neutral-100)',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                <Monitor size={16} color="#F59E0B" />
                                <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: 'var(--neutral-700)' }}>
                                    Módulos Más Usados
                                </h3>
                            </div>

                            {moduleUsage.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--neutral-400)' }}>
                                    <Monitor size={32} strokeWidth={1.2} />
                                    <p style={{ fontSize: '0.82rem', marginTop: '8px' }}>Sin datos para este período</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {moduleUsage.map((mod, idx) => (
                                        <div key={mod.module_id} style={{
                                            display: 'flex', alignItems: 'center', gap: '10px',
                                        }}>
                                            {/* Module name */}
                                            <span style={{
                                                fontSize: '0.78rem', fontWeight: 500,
                                                color: 'var(--neutral-700)', minWidth: '140px',
                                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                            }}>
                                                {mod.module_label || mod.module_id}
                                            </span>

                                            {/* Bar */}
                                            <div style={{
                                                flex: 1, height: '22px', borderRadius: '6px',
                                                background: 'var(--neutral-50)', overflow: 'hidden',
                                                position: 'relative',
                                            }}>
                                                <div style={{
                                                    height: '100%', borderRadius: '6px',
                                                    background: idx === 0
                                                        ? 'linear-gradient(90deg, #F59E0B, #FBBF24)'
                                                        : idx === 1
                                                            ? 'linear-gradient(90deg, #6366F1, #818CF8)'
                                                            : 'linear-gradient(90deg, #94A3B8, #CBD5E1)',
                                                    width: `${Math.max((mod.total_seconds / maxModuleSeconds) * 100, 3)}%`,
                                                    transition: 'width 0.6s ease',
                                                    display: 'flex', alignItems: 'center', paddingLeft: '8px',
                                                }}>
                                                    <span style={{
                                                        fontSize: '0.65rem', fontWeight: 700, color: '#fff',
                                                        whiteSpace: 'nowrap',
                                                    }}>
                                                        {formatSeconds(mod.total_seconds)}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Users count */}
                                            <span style={{
                                                fontSize: '0.68rem', color: 'var(--neutral-400)',
                                                whiteSpace: 'nowrap', minWidth: '55px', textAlign: 'right',
                                            }}>
                                                {mod.unique_users} user{mod.unique_users !== 1 ? 's' : ''}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
