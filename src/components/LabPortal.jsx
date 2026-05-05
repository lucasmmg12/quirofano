/**
 * LabPortal.jsx — Portal aislado para laboratorios externos
 *
 * Cada laboratorio accede a su propia URL:
 *   /lab/aguero  → Lab Agüero
 *   /lab/cedap   → Lab CEDAP
 *   /lab/cuyo    → Lab Cuyo
 *
 * Incluye login dedicado + vista de datos filtrada solo al laboratorio.
 * NO tiene acceso al sistema general ADM-QUI.
 */
import React, { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Microscope, Lock, User, Eye, EyeOff, LogOut, Loader2 } from 'lucide-react';
import PublicLabView from './PublicLabView';

// ═══════════════════════════════════════════
// Lab configuration mapping
// ═══════════════════════════════════════════
const LAB_CONFIG = {
    aguero: {
        usuario: 'aguero',
        labName: 'LDA - Dra. Aguero o Dra Rios',
        displayName: 'Laboratorio Agüero',
        shortName: 'Agüero',
        color: '#8B5CF6',
        gradient: 'linear-gradient(135deg, #7C3AED, #8B5CF6, #A78BFA)',
    },
    cedap: {
        usuario: 'cedap',
        labName: 'LAB. CEDAP',
        displayName: 'Laboratorio CEDAP',
        shortName: 'CEDAP',
        color: '#0EA5E9',
        gradient: 'linear-gradient(135deg, #0284C7, #0EA5E9, #38BDF8)',
    },
    cuyo: {
        usuario: 'cuyo',
        labName: 'LAB.INST.PATOLOG.CUYO',
        displayName: 'Laboratorio Cuyo',
        shortName: 'Cuyo',
        color: '#F59E0B',
        gradient: 'linear-gradient(135deg, #D97706, #F59E0B, #FBBF24)',
    },
};

const SESSION_KEY_PREFIX = 'labportal_session_';

export default function LabPortal({ labSlug }) {
    const config = LAB_CONFIG[labSlug];

    // Session management per-lab
    const sessionKey = SESSION_KEY_PREFIX + labSlug;
    const [labUser, setLabUser] = useState(() => {
        try {
            const raw = localStorage.getItem(sessionKey);
            if (!raw) return null;
            const session = JSON.parse(raw);
            // Validate user matches this lab
            if (session?.usuario !== config?.usuario) {
                localStorage.removeItem(sessionKey);
                return null;
            }
            return session;
        } catch { return null; }
    });

    const handleLogin = useCallback((user) => {
        localStorage.setItem(sessionKey, JSON.stringify(user));
        setLabUser(user);
    }, [sessionKey]);

    const handleLogout = useCallback(() => {
        localStorage.removeItem(sessionKey);
        setLabUser(null);
    }, [sessionKey]);

    if (!config) {
        return (
            <div style={{
                minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#F1F5F9', fontFamily: 'system-ui, -apple-system, sans-serif',
            }}>
                <div style={{
                    background: '#fff', borderRadius: '16px', padding: '48px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)', textAlign: 'center', maxWidth: '400px',
                }}>
                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🚫</div>
                    <h2 style={{ margin: '0 0 8px', color: '#1F2937', fontSize: '1.3rem' }}>Portal no encontrado</h2>
                    <p style={{ color: '#6B7280', fontSize: '0.9rem' }}>El enlace al que intentas acceder no es válido.</p>
                </div>
            </div>
        );
    }

    if (!labUser) {
        return <LabLoginScreen config={config} onLogin={handleLogin} />;
    }

    return (
        <div style={{ minHeight: '100vh', background: '#F1F5F9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            {/* Top bar with lab branding + logout */}
            <div style={{
                background: '#fff', borderBottom: '1px solid #E2E8F0',
                padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img src="/logosanatorio.png" alt="Sanatorio Argentino" style={{ height: '36px', objectFit: 'contain' }} />
                    <div style={{ width: '1px', height: '28px', background: '#E2E8F0' }} />
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                    }}>
                        <div style={{
                            width: '32px', height: '32px', borderRadius: '8px',
                            background: config.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Microscope size={16} color="#fff" />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1F2937' }}>
                                {config.displayName}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>
                                Portal de Anatomía Patológica
                            </div>
                        </div>
                    </div>
                </div>
                <button
                    onClick={handleLogout}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '8px 14px', borderRadius: '8px',
                        background: '#FEF2F2', color: '#DC2626',
                        border: '1px solid #FECACA', cursor: 'pointer',
                        fontSize: '0.78rem', fontWeight: 600,
                        transition: 'all 0.15s',
                    }}
                    onMouseOver={e => { e.currentTarget.style.background = '#FEE2E2'; }}
                    onMouseOut={e => { e.currentTarget.style.background = '#FEF2F2'; }}
                >
                    <LogOut size={14} /> Cerrar Sesión
                </button>
            </div>

            {/* Lab data view — same PublicLabView but isolated to this lab only */}
            <PublicLabView labName={config.labName} labUser={labUser} />
        </div>
    );
}


// ═══════════════════════════════════════════
// Login Screen — identical to main LoginScreen, branded per lab
// ═══════════════════════════════════════════
function LabLoginScreen({ config, onLogin }) {
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [shake, setShake] = useState(false);

    const triggerShake = () => {
        setShake(true);
        setTimeout(() => setShake(false), 500);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!password.trim()) {
            setError('Ingrese su contraseña');
            triggerShake();
            return;
        }

        setLoading(true);
        setError('');

        try {
            const { data, error: rpcError } = await supabase.rpc('verify_login', {
                p_usuario: config.usuario,
                p_password: password,
            });

            if (rpcError) {
                setError('Error de conexión. Intente nuevamente.');
                triggerShake();
                setLoading(false);
                return;
            }

            if (!data || data.length === 0) {
                setError('Contraseña incorrecta');
                triggerShake();
                setPassword('');
                setLoading(false);
                return;
            }

            const user = data[0];
            const session = {
                id: user.id,
                usuario: user.usuario,
                nombre: user.nombre,
                iniciales: user.iniciales || config.shortName.charAt(0),
                loginAt: new Date().toISOString(),
            };

            onLogin(session);
        } catch (err) {
            setError('Error inesperado: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 99999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#fff',
            fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        }}>
            {/* Background image at 50% opacity — same as main login */}
            <div style={{
                position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
                backgroundImage: "url('/SANARG2021_fondo.webp')",
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                opacity: 0.5,
            }} />
            {/* Subtle decorative blobs */}
            <div style={{
                position: 'absolute', width: '400px', height: '400px', borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(30,64,120,0.04) 0%, transparent 70%)',
                top: '-5%', right: '-5%',
            }} />
            <div style={{
                position: 'absolute', width: '350px', height: '350px', borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(30,64,120,0.03) 0%, transparent 70%)',
                bottom: '-5%', left: '-5%',
            }} />

            {/* Login Card */}
            <div style={{
                position: 'relative',
                width: '100%', maxWidth: '440px',
                margin: '0 20px',
                animation: 'loginFadeIn 0.5s ease-out',
            }}>
                <form
                    onSubmit={handleSubmit}
                    style={{
                        background: '#FFFFFF',
                        borderRadius: '20px',
                        padding: '40px 36px 36px',
                        boxShadow: '0 8px 40px rgba(30,64,120,0.08), 0 2px 8px rgba(0,0,0,0.04)',
                        animation: shake ? 'shakeX 0.4s ease-out' : 'none',
                    }}
                >
                    {/* Logo */}
                    <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                        <img
                            src="/logosanatorio.png"
                            alt="Sanatorio Argentino"
                            style={{
                                width: '68px', height: '68px',
                                objectFit: 'contain',
                                borderRadius: '14px',
                                boxShadow: '0 4px 12px rgba(30,64,120,0.12)',
                            }}
                        />
                    </div>

                    {/* Title — lab branded */}
                    <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                        <h1 style={{
                            margin: '0 0 6px',
                            fontSize: '1.45rem',
                            fontWeight: 800,
                            color: '#1E293B',
                            letterSpacing: '-0.02em',
                        }}>
                            {config.displayName}
                        </h1>
                        <p style={{
                            margin: 0,
                            fontSize: '0.85rem',
                            color: '#94A3B8',
                            fontWeight: 500,
                        }}>
                            Portal de Anatomía Patológica
                        </p>
                    </div>

                    {/* Error */}
                    {error && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '10px 14px', borderRadius: '10px',
                            background: '#FEF2F2',
                            border: '1px solid #FECACA',
                            marginBottom: '20px',
                            animation: 'loginFadeIn 0.2s ease-out',
                        }}>
                            <span style={{ fontSize: '0.8rem', color: '#DC2626', fontWeight: 500 }}>{error}</span>
                        </div>
                    )}

                    {/* USUARIO — readonly pre-filled */}
                    <div style={{ marginBottom: '18px' }}>
                        <label style={{
                            display: 'block',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: '#374151',
                            marginBottom: '8px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.8px',
                        }}>
                            Usuario
                        </label>
                        <div style={{ position: 'relative' }}>
                            <User size={17} style={{
                                position: 'absolute', left: '14px', top: '50%',
                                transform: 'translateY(-50%)',
                                color: '#94A3B8', pointerEvents: 'none',
                            }} />
                            <div style={{
                                width: '100%',
                                padding: '13px 14px 13px 44px',
                                borderRadius: '10px',
                                border: '1.5px solid #E5E7EB',
                                background: '#F9FAFB',
                                color: '#64748B',
                                fontSize: '0.9rem',
                                fontWeight: 500,
                                boxSizing: 'border-box',
                            }}>
                                {config.usuario}@sanatorioargentino.com.ar
                            </div>
                        </div>
                    </div>

                    {/* CONTRASEÑA */}
                    <div style={{ marginBottom: '28px' }}>
                        <label style={{
                            display: 'block',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: '#374151',
                            marginBottom: '8px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.8px',
                        }}>
                            Contraseña
                        </label>
                        <div style={{ position: 'relative' }}>
                            <Lock size={17} style={{
                                position: 'absolute', left: '14px', top: '50%',
                                transform: 'translateY(-50%)',
                                color: '#94A3B8', pointerEvents: 'none',
                            }} />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={e => { setPassword(e.target.value); setError(''); }}
                                placeholder="••••••••"
                                autoComplete="current-password"
                                autoFocus
                                style={{
                                    width: '100%',
                                    padding: '13px 44px 13px 44px',
                                    borderRadius: '10px',
                                    border: '1.5px solid #E5E7EB',
                                    background: '#F9FAFB',
                                    color: '#1E293B',
                                    fontSize: '0.9rem',
                                    fontWeight: 500,
                                    outline: 'none',
                                    transition: 'all 0.2s ease',
                                    boxSizing: 'border-box',
                                }}
                                onFocus={e => {
                                    e.target.style.borderColor = '#1E4078';
                                    e.target.style.boxShadow = '0 0 0 3px rgba(30,64,120,0.08)';
                                    e.target.style.background = '#FFFFFF';
                                }}
                                onBlur={e => {
                                    e.target.style.borderColor = '#E5E7EB';
                                    e.target.style.boxShadow = 'none';
                                    e.target.style.background = '#F9FAFB';
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                style={{
                                    position: 'absolute', right: '12px', top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'none', border: 'none',
                                    cursor: 'pointer', color: '#94A3B8',
                                    padding: '4px', display: 'flex',
                                    transition: 'color 0.2s',
                                }}
                                onMouseOver={e => e.currentTarget.style.color = '#64748B'}
                                onMouseOut={e => e.currentTarget.style.color = '#94A3B8'}
                            >
                                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                            </button>
                        </div>
                    </div>

                    {/* SUBMIT — same institutional blue */}
                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            width: '100%',
                            padding: '14px',
                            borderRadius: '10px',
                            border: 'none',
                            background: loading ? '#2C5282' : '#1E4078',
                            color: '#FFFFFF',
                            fontSize: '0.95rem',
                            fontWeight: 700,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 4px 12px rgba(30,64,120,0.25)',
                            letterSpacing: '0.3px',
                        }}
                        onMouseOver={e => { if (!loading) { e.currentTarget.style.background = '#163560'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(30,64,120,0.35)'; } }}
                        onMouseOut={e => { e.currentTarget.style.background = loading ? '#2C5282' : '#1E4078'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(30,64,120,0.25)'; }}
                    >
                        {loading ? (
                            <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Ingresando...</>
                        ) : (
                            'Iniciar Sesión'
                        )}
                    </button>
                </form>

                {/* Footer */}
                <p style={{
                    textAlign: 'center',
                    marginTop: '20px',
                    fontSize: '0.72rem',
                    color: '#94A3B8',
                    fontWeight: 500,
                }}>
                    Portal de Laboratorios · Sanatorio Argentino © 2026
                </p>
            </div>

            {/* Animations */}
            <style>{`
                @keyframes shakeX {
                    0%, 100% { transform: translateX(0); }
                    20% { transform: translateX(-8px); }
                    40% { transform: translateX(8px); }
                    60% { transform: translateX(-4px); }
                    80% { transform: translateX(4px); }
                }
                @keyframes loginFadeIn {
                    from { opacity: 0; transform: translateY(12px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}

