/**
 * LoginScreen — Pantalla de autenticación premium
 * 
 * Bloquea el acceso a la app hasta que el usuario se identifique.
 * Estilo clínico institucional Sanatorio Argentino.
 * 
 * Props:
 *   - onLogin: (user) => void — Callback cuando el login es exitoso
 */
import { useState, useRef, useEffect } from 'react';
import { Lock, User, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { login } from '../services/authService';
import { logAction } from '../services/auditService';


export default function LoginScreen({ onLogin }) {
    const [usuario, setUsuario] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [shake, setShake] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!usuario.trim() || !password) {
            setError('Completá usuario y contraseña');
            setShake(true);
            setTimeout(() => setShake(false), 500);
            return;
        }

        setLoading(true);
        setError('');

        const result = await login(usuario, password);

        if (result.success) {
            // Log the login action
            await logAction('login', { usuario: result.user.usuario });
            onLogin(result.user);
        } else {
            setError(result.error);
            setShake(true);
            setTimeout(() => setShake(false), 500);
            setPassword('');
        }

        setLoading(false);
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 40%, #334155 100%)',
            fontFamily: "'Inter', 'Segoe UI', sans-serif",
        }}>
            {/* Background pattern */}
            <div style={{
                position: 'absolute', inset: 0, opacity: 0.03,
                backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
                backgroundSize: '40px 40px',
            }} />

            {/* Glow effect */}
            <div style={{
                position: 'absolute',
                width: '600px', height: '600px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
                top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                filter: 'blur(60px)',
            }} />

            {/* Login Card */}
            <div style={{
                position: 'relative',
                width: '100%', maxWidth: '420px',
                margin: '0 20px',
                animation: 'scaleIn 0.4s ease-out',
            }}>
                {/* Logo / Header */}
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <div style={{
                        width: '72px', height: '72px',
                        borderRadius: '20px',
                        background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 20px 40px rgba(99,102,241,0.4)',
                        marginBottom: '16px',
                    }}>
                        <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff' }}>SA</span>
                    </div>
                    <h1 style={{
                        fontSize: '1.5rem', fontWeight: 800, color: '#F8FAFC',
                        margin: '0 0 6px', letterSpacing: '-0.02em',
                    }}>
                        Sanatorio Argentino
                    </h1>
                    <p style={{
                        fontSize: '0.85rem', color: '#94A3B8',
                        margin: 0, fontWeight: 500,
                    }}>
                        Sistema de Administración Quirúrgica
                    </p>
                </div>

                {/* Form Card */}
                <form
                    onSubmit={handleSubmit}
                    style={{
                        background: 'rgba(255,255,255,0.05)',
                        backdropFilter: 'blur(20px)',
                        borderRadius: '16px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        padding: '32px',
                        boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
                        animation: shake ? 'shakeX 0.4s ease-out' : 'none',
                    }}
                >
                    {/* Error message */}
                    {error && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '10px 14px', borderRadius: '10px',
                            background: 'rgba(239,68,68,0.1)',
                            border: '1px solid rgba(239,68,68,0.2)',
                            marginBottom: '20px',
                            animation: 'fadeIn 0.2s ease-out',
                        }}>
                            <AlertCircle size={16} style={{ color: '#EF4444', flexShrink: 0 }} />
                            <span style={{ fontSize: '0.8rem', color: '#FCA5A5' }}>{error}</span>
                        </div>
                    )}

                    {/* Usuario field */}
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{
                            display: 'block', fontSize: '0.75rem', fontWeight: 600,
                            color: '#94A3B8', marginBottom: '6px',
                            textTransform: 'uppercase', letterSpacing: '0.5px',
                        }}>
                            Usuario
                        </label>
                        <div style={{
                            position: 'relative',
                            display: 'flex', alignItems: 'center',
                        }}>
                            <User size={16} style={{
                                position: 'absolute', left: '14px',
                                color: '#64748B', pointerEvents: 'none',
                            }} />
                            <input
                                ref={inputRef}
                                type="text"
                                value={usuario}
                                onChange={e => setUsuario(e.target.value)}
                                placeholder="Ingresá tu usuario"
                                autoComplete="username"
                                style={{
                                    width: '100%',
                                    padding: '12px 14px 12px 42px',
                                    borderRadius: '10px',
                                    border: '1.5px solid rgba(255,255,255,0.1)',
                                    background: 'rgba(255,255,255,0.05)',
                                    color: '#F1F5F9',
                                    fontSize: '0.9rem',
                                    fontWeight: 500,
                                    outline: 'none',
                                    transition: 'all 0.2s',
                                }}
                                onFocus={e => {
                                    e.target.style.borderColor = '#6366F1';
                                    e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.15)';
                                }}
                                onBlur={e => {
                                    e.target.style.borderColor = 'rgba(255,255,255,0.1)';
                                    e.target.style.boxShadow = 'none';
                                }}
                            />
                        </div>
                    </div>

                    {/* Password field */}
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{
                            display: 'block', fontSize: '0.75rem', fontWeight: 600,
                            color: '#94A3B8', marginBottom: '6px',
                            textTransform: 'uppercase', letterSpacing: '0.5px',
                        }}>
                            Contraseña
                        </label>
                        <div style={{
                            position: 'relative',
                            display: 'flex', alignItems: 'center',
                        }}>
                            <Lock size={16} style={{
                                position: 'absolute', left: '14px',
                                color: '#64748B', pointerEvents: 'none',
                            }} />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Ingresá tu contraseña"
                                autoComplete="current-password"
                                style={{
                                    width: '100%',
                                    padding: '12px 44px 12px 42px',
                                    borderRadius: '10px',
                                    border: '1.5px solid rgba(255,255,255,0.1)',
                                    background: 'rgba(255,255,255,0.05)',
                                    color: '#F1F5F9',
                                    fontSize: '0.9rem',
                                    fontWeight: 500,
                                    outline: 'none',
                                    transition: 'all 0.2s',
                                }}
                                onFocus={e => {
                                    e.target.style.borderColor = '#6366F1';
                                    e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.15)';
                                }}
                                onBlur={e => {
                                    e.target.style.borderColor = 'rgba(255,255,255,0.1)';
                                    e.target.style.boxShadow = 'none';
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                style={{
                                    position: 'absolute', right: '12px',
                                    background: 'none', border: 'none',
                                    cursor: 'pointer', color: '#64748B',
                                    padding: '4px', display: 'flex',
                                }}
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    {/* Submit button */}
                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            width: '100%',
                            padding: '13px',
                            borderRadius: '10px',
                            border: 'none',
                            background: loading
                                ? '#4338CA'
                                : 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
                            color: '#fff',
                            fontSize: '0.9rem',
                            fontWeight: 700,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            transition: 'all 0.2s',
                            boxShadow: '0 4px 15px rgba(99,102,241,0.3)',
                        }}
                        onMouseOver={e => { if (!loading) e.currentTarget.style.transform = 'translateY(-1px)'; }}
                        onMouseOut={e => { e.currentTarget.style.transform = 'none'; }}
                    >
                        {loading ? (
                            <>
                                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                                Ingresando...
                            </>
                        ) : (
                            <>
                                <Lock size={16} />
                                Ingresar
                            </>
                        )}
                    </button>
                </form>

                {/* Footer */}
                <p style={{
                    textAlign: 'center', marginTop: '24px',
                    fontSize: '0.72rem', color: '#475569',
                }}>
                    Sistema ADM-QUI · Grow Labs © 2026
                </p>
            </div>

            {/* CSS Animations */}
            <style>{`
                @keyframes shakeX {
                    0%, 100% { transform: translateX(0); }
                    20% { transform: translateX(-8px); }
                    40% { transform: translateX(8px); }
                    60% { transform: translateX(-4px); }
                    80% { transform: translateX(4px); }
                }
                @keyframes scaleIn {
                    from { opacity: 0; transform: scale(0.95) translateY(10px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
        </div>
    );
}
