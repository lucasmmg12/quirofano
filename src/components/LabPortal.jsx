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
import { Microscope, Lock, Eye, EyeOff, LogOut, Loader2 } from 'lucide-react';
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
// Login Screen — branded per laboratory
// ═══════════════════════════════════════════
function LabLoginScreen({ config, onLogin }) {
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!password.trim()) {
            setError('Ingrese su contraseña');
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
                setLoading(false);
                return;
            }

            if (!data || data.length === 0) {
                setError('Contraseña incorrecta');
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
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #F8FAFC 0%, #E2E8F0 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            padding: '20px',
        }}>
            {/* Background decorative elements */}
            <div style={{
                position: 'fixed', top: '-200px', right: '-200px',
                width: '500px', height: '500px', borderRadius: '50%',
                background: config.gradient, opacity: 0.06, filter: 'blur(80px)',
            }} />
            <div style={{
                position: 'fixed', bottom: '-150px', left: '-150px',
                width: '400px', height: '400px', borderRadius: '50%',
                background: config.gradient, opacity: 0.04, filter: 'blur(60px)',
            }} />

            <div style={{
                background: '#fff', borderRadius: '20px', padding: '48px 40px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.03)',
                width: '100%', maxWidth: '420px', position: 'relative',
            }}>
                {/* Top accent bar */}
                <div style={{
                    position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                    width: '60%', height: '4px', borderRadius: '0 0 4px 4px',
                    background: config.gradient,
                }} />

                {/* Logo + branding */}
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <img src="/logosanatorio.png" alt="Sanatorio Argentino"
                        style={{ height: '52px', objectFit: 'contain', marginBottom: '20px', opacity: 0.9 }}
                    />
                    <div style={{
                        width: '56px', height: '56px', borderRadius: '14px',
                        background: config.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 16px',
                        boxShadow: `0 8px 20px ${config.color}30`,
                    }}>
                        <Microscope size={26} color="#fff" />
                    </div>
                    <h1 style={{
                        margin: '0 0 6px', fontSize: '1.4rem', fontWeight: 800,
                        color: '#1F2937', letterSpacing: '-0.02em',
                    }}>
                        Bienvenido
                    </h1>
                    <h2 style={{
                        margin: '0 0 8px', fontSize: '1.15rem', fontWeight: 700,
                        color: config.color,
                    }}>
                        {config.displayName}
                    </h2>
                    <p style={{
                        margin: 0, color: '#94A3B8', fontSize: '0.85rem',
                    }}>
                        Por favor ingrese sus credenciales
                    </p>
                </div>

                {/* Login form */}
                <form onSubmit={handleSubmit}>
                    {/* Username (readonly, pre-filled) */}
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{
                            display: 'block', fontSize: '0.75rem', fontWeight: 600,
                            color: '#64748B', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px',
                        }}>
                            Usuario
                        </label>
                        <div style={{
                            padding: '12px 14px', borderRadius: '10px',
                            border: '1px solid #E2E8F0', background: '#F8FAFC',
                            fontSize: '0.9rem', color: '#64748B', fontWeight: 500,
                        }}>
                            {config.usuario}@sanatorioargentino.com.ar
                        </div>
                    </div>

                    {/* Password */}
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{
                            display: 'block', fontSize: '0.75rem', fontWeight: 600,
                            color: '#64748B', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px',
                        }}>
                            Contraseña
                        </label>
                        <div style={{ position: 'relative' }}>
                            <Lock size={16} style={{
                                position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
                                color: '#94A3B8',
                            }} />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={e => { setPassword(e.target.value); setError(''); }}
                                placeholder="Ingrese su contraseña"
                                autoFocus
                                style={{
                                    width: '100%', padding: '12px 44px 12px 40px',
                                    borderRadius: '10px', border: `1.5px solid ${error ? '#FECACA' : '#E2E8F0'}`,
                                    fontSize: '0.9rem', outline: 'none',
                                    transition: 'border-color 0.2s, box-shadow 0.2s',
                                    background: error ? '#FEF2F2' : '#fff',
                                }}
                                onFocus={e => { e.target.style.borderColor = config.color; e.target.style.boxShadow = `0 0 0 3px ${config.color}15`; }}
                                onBlur={e => { e.target.style.borderColor = error ? '#FECACA' : '#E2E8F0'; e.target.style.boxShadow = 'none'; }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                style={{
                                    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                                    background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '4px',
                                }}
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    {/* Error message */}
                    {error && (
                        <div style={{
                            padding: '10px 14px', borderRadius: '8px',
                            background: '#FEF2F2', color: '#DC2626',
                            fontSize: '0.8rem', fontWeight: 600,
                            marginBottom: '16px', border: '1px solid #FECACA',
                            animation: 'fadeIn 0.2s ease-out',
                        }}>
                            {error}
                        </div>
                    )}

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            width: '100%', padding: '14px',
                            borderRadius: '12px', border: 'none',
                            background: loading ? '#94A3B8' : config.gradient,
                            color: '#fff', fontSize: '0.95rem', fontWeight: 700,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                            boxShadow: loading ? 'none' : `0 4px 16px ${config.color}30`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        }}
                    >
                        {loading ? (
                            <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Verificando...</>
                        ) : (
                            'Ingresar al Portal'
                        )}
                    </button>
                </form>

                {/* Footer */}
                <div style={{
                    marginTop: '28px', textAlign: 'center',
                    color: '#CBD5E1', fontSize: '0.72rem', fontWeight: 500,
                }}>
                    Portal Seguro • Sanatorio Argentino<br />
                    Anatomía Patológica
                </div>
            </div>
        </div>
    );
}
