/**
 * LoginScreen — Pantalla de autenticación institucional
 * Diseño clínico limpio, réplica del Login de Calidad DORA
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
            triggerShake();
            return;
        }

        setLoading(true);
        setError('');

        const result = await login(usuario, password);

        if (result.success) {
            await logAction('login', { usuario: result.user.usuario });
            onLogin(result.user);
        } else {
            setError(result.error);
            triggerShake();
            setPassword('');
        }

        setLoading(false);
    };

    const triggerShake = () => {
        setShake(true);
        setTimeout(() => setShake(false), 500);
    };

    return (
        <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 99999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #EBF0F6 0%, #E8EDF5 30%, #F0F4FA 60%, #E6EBF3 100%)',
            fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        }}>
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

                    {/* Title */}
                    <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                        <h1 style={{
                            margin: '0 0 6px',
                            fontSize: '1.45rem',
                            fontWeight: 800,
                            color: '#1E293B',
                            letterSpacing: '-0.02em',
                        }}>
                            Acceso Administrativo
                        </h1>
                        <p style={{
                            margin: 0,
                            fontSize: '0.85rem',
                            color: '#94A3B8',
                            fontWeight: 500,
                        }}>
                            Panel de Administración Quirúrgica
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
                            <AlertCircle size={16} style={{ color: '#DC2626', flexShrink: 0 }} />
                            <span style={{ fontSize: '0.8rem', color: '#DC2626', fontWeight: 500 }}>{error}</span>
                        </div>
                    )}

                    {/* USUARIO */}
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
                            <input
                                ref={inputRef}
                                type="text"
                                value={usuario}
                                onChange={e => setUsuario(e.target.value)}
                                placeholder="lmarinero@sanatorioargentino.com.ar"
                                autoComplete="username"
                                style={{
                                    width: '100%',
                                    padding: '13px 14px 13px 44px',
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
                                onChange={e => setPassword(e.target.value)}
                                placeholder="••••••••"
                                autoComplete="current-password"
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

                    {/* SUBMIT */}
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
                            <>
                                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                                Ingresando...
                            </>
                        ) : (
                            'Iniciar Sesión'
                        )}
                    </button>

                    {/* Nota cuentas nuevas */}
                    <p style={{
                        textAlign: 'center',
                        marginTop: '18px',
                        marginBottom: 0,
                        fontSize: '0.75rem',
                        color: '#94A3B8',
                        fontWeight: 500,
                        lineHeight: 1.5,
                    }}>
                        ¿No tenés cuenta? Comunicáte con el{' '}
                        <a
                            href="mailto:lmarinero@sanatorioargentino.com.ar?subject=Solicitud%20de%20cuenta%20-%20Sistema%20Control%20de%20Cirug%C3%ADas"
                            style={{ color: '#1E4078', fontWeight: 600, textDecoration: 'none' }}
                            onMouseOver={e => e.currentTarget.style.textDecoration = 'underline'}
                            onMouseOut={e => e.currentTarget.style.textDecoration = 'none'}
                        >Administrador</a>
                    </p>
                </form>

                {/* Footer */}
                <p style={{
                    textAlign: 'center',
                    marginTop: '20px',
                    fontSize: '0.72rem',
                    color: '#94A3B8',
                    fontWeight: 500,
                }}>
                    Sistema ADM-QUI · Grow Labs © 2026
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
