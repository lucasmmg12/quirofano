/**
 * WelcomeOnboarding.jsx — Modal de bienvenida post-login
 *
 * Se muestra una sola vez por sesión (sessionStorage flag).
 * Incluye: Logo del sanatorio, saludo personalizado, avatar de Beto animado.
 */
import React, { useState, useEffect } from 'react';
import { Sparkles, X, ArrowRight } from 'lucide-react';

const ONBOARDING_KEY = 'admqui_onboarding_shown';

export default function WelcomeOnboarding({ currentUser, onClose, onOpenBeto }) {
    const [visible, setVisible] = useState(false);
    const [closing, setClosing] = useState(false);

    useEffect(() => {
        // Solo mostrar si no se mostró en esta sesión
        const alreadyShown = sessionStorage.getItem(ONBOARDING_KEY);
        if (!alreadyShown) {
            // Pequeño delay para que la UI principal cargue primero
            const timer = setTimeout(() => setVisible(true), 400);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleClose = () => {
        setClosing(true);
        sessionStorage.setItem(ONBOARDING_KEY, '1');
        setTimeout(() => {
            setVisible(false);
            onClose?.();
        }, 300);
    };

    const handleOpenBeto = () => {
        sessionStorage.setItem(ONBOARDING_KEY, '1');
        setClosing(true);
        setTimeout(() => {
            setVisible(false);
            onClose?.();
            onOpenBeto?.();
        }, 200);
    };

    if (!visible) return null;

    const firstName = currentUser?.nombre?.split(' ')[0] || 'Usuario';

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={handleClose}
                style={{
                    position: 'fixed', inset: 0, zIndex: 100000,
                    background: 'rgba(0, 0, 0, 0.5)',
                    backdropFilter: 'blur(6px)',
                    animation: closing ? 'onb-fadeOut 0.3s ease-out forwards' : 'onb-fadeIn 0.4s ease-out',
                }}
            />

            {/* Modal */}
            <div style={{
                position: 'fixed', inset: 0, zIndex: 100001,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
            }}>
                <div
                    onClick={e => e.stopPropagation()}
                    style={{
                        pointerEvents: 'all',
                        position: 'relative',
                        width: '100%', maxWidth: '480px',
                        margin: '0 20px',
                        background: '#FFFFFF',
                        borderRadius: '24px',
                        padding: '0',
                        boxShadow: '0 25px 80px rgba(13, 59, 102, 0.2), 0 8px 24px rgba(0,0,0,0.1)',
                        overflow: 'hidden',
                        animation: closing
                            ? 'onb-slideOut 0.3s ease-in forwards'
                            : 'onb-slideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                >
                    {/* Close button */}
                    <button
                        onClick={handleClose}
                        style={{
                            position: 'absolute', top: '16px', right: '16px', zIndex: 3,
                            background: 'rgba(255,255,255,0.9)', border: 'none',
                            borderRadius: '50%', width: '32px', height: '32px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: '#64748B',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                            transition: 'all 0.2s',
                        }}
                        onMouseOver={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#1E293B'; }}
                        onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.9)'; e.currentTarget.style.color = '#64748B'; }}
                    >
                        <X size={16} />
                    </button>

                    {/* Header Gradient */}
                    <div style={{
                        background: 'linear-gradient(135deg, #0D3B66 0%, #1E5A8C 50%, #2980B9 100%)',
                        padding: '36px 32px 28px',
                        position: 'relative',
                        overflow: 'hidden',
                    }}>
                        {/* Decorative circles */}
                        <div style={{
                            position: 'absolute', top: '-30px', right: '-30px',
                            width: '120px', height: '120px', borderRadius: '50%',
                            background: 'rgba(255,255,255,0.06)',
                        }} />
                        <div style={{
                            position: 'absolute', bottom: '-20px', left: '-20px',
                            width: '80px', height: '80px', borderRadius: '50%',
                            background: 'rgba(255,255,255,0.04)',
                        }} />

                        {/* Logo */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', position: 'relative', zIndex: 1 }}>
                            <img
                                src="/logosanatorio.png"
                                alt="Sanatorio Argentino"
                                style={{
                                    width: '56px', height: '56px',
                                    objectFit: 'contain', borderRadius: '14px',
                                    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                                    background: '#fff', padding: '4px',
                                }}
                            />
                            <div>
                                <h2 style={{
                                    margin: 0, color: '#FFFFFF',
                                    fontSize: '1.3rem', fontWeight: 800,
                                    letterSpacing: '-0.02em',
                                }}>
                                    Sanatorio Argentino
                                </h2>
                                <p style={{
                                    margin: '2px 0 0', color: 'rgba(255,255,255,0.65)',
                                    fontSize: '0.78rem', fontWeight: 500,
                                }}>
                                    Sistema de Administración Quirúrgica
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Body */}
                    <div style={{ padding: '28px 32px 32px' }}>
                        {/* Greeting */}
                        <h3 style={{
                            margin: '0 0 8px',
                            fontSize: '1.35rem', fontWeight: 800,
                            color: '#1E293B', letterSpacing: '-0.01em',
                        }}>
                            ¡Bienvenido/a, {firstName}! 👋
                        </h3>
                        <p style={{
                            margin: '0 0 24px',
                            fontSize: '0.88rem', color: '#64748B',
                            lineHeight: 1.6,
                        }}>
                            Tu sesión está activa. Recordá que podés consultar a <strong style={{ color: '#0D3B66' }}>Beto</strong>, 
                            nuestro asistente de IA, para resolver dudas, generar documentos o navegar el sistema más rápido.
                        </p>

                        {/* Beto Card */}
                        <div
                            onClick={handleOpenBeto}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '16px',
                                padding: '16px',
                                background: 'linear-gradient(135deg, #EEF2FF 0%, #F0F9FF 100%)',
                                borderRadius: '16px',
                                border: '1px solid #E0E7FF',
                                cursor: 'pointer',
                                transition: 'all 0.25s ease',
                            }}
                            onMouseOver={e => {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 8px 24px rgba(99, 102, 241, 0.12)';
                                e.currentTarget.style.borderColor = '#C7D2FE';
                            }}
                            onMouseOut={e => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = 'none';
                                e.currentTarget.style.borderColor = '#E0E7FF';
                            }}
                        >
                            {/* Beto avatar */}
                            <div style={{
                                width: '64px', height: '64px', borderRadius: '16px',
                                overflow: 'hidden', flexShrink: 0,
                                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)',
                                border: '2px solid rgba(99, 102, 241, 0.3)',
                            }}>
                                <video
                                    src="/the_avatar_is_greetings_202606091123.mp4"
                                    autoPlay muted loop playsInline
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    marginBottom: '4px',
                                }}>
                                    <span style={{
                                        fontSize: '0.95rem', fontWeight: 700,
                                        color: '#1E293B',
                                    }}>Beto</span>
                                    <span style={{
                                        fontSize: '0.65rem', fontWeight: 700,
                                        background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                                        color: '#fff', padding: '2px 7px',
                                        borderRadius: '6px',
                                    }}>IA</span>
                                    <Sparkles size={14} style={{ color: '#F59E0B', animation: 'onb-sparkle 2s ease-in-out infinite' }} />
                                </div>
                                <p style={{
                                    margin: 0, fontSize: '0.8rem',
                                    color: '#64748B', lineHeight: 1.4,
                                }}>
                                    Asistente virtual listo para ayudarte. ¡Hacé click para empezar!
                                </p>
                            </div>
                            <ArrowRight size={20} style={{ color: '#6366F1', flexShrink: 0 }} />
                        </div>

                        {/* Skip button */}
                        <button
                            onClick={handleClose}
                            style={{
                                width: '100%', marginTop: '16px',
                                padding: '12px', borderRadius: '10px',
                                border: '1px solid #E2E8F0',
                                background: 'transparent',
                                color: '#94A3B8',
                                fontSize: '0.82rem', fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                            onMouseOver={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.color = '#64748B'; }}
                            onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94A3B8'; }}
                        >
                            Continuar al sistema
                        </button>
                    </div>
                </div>
            </div>

            {/* Animations */}
            <style>{`
                @keyframes onb-fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes onb-fadeOut {
                    from { opacity: 1; }
                    to { opacity: 0; }
                }
                @keyframes onb-slideIn {
                    from { opacity: 0; transform: scale(0.9) translateY(30px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                @keyframes onb-slideOut {
                    from { opacity: 1; transform: scale(1) translateY(0); }
                    to { opacity: 0; transform: scale(0.95) translateY(10px); }
                }
                @keyframes onb-sparkle {
                    0%, 100% { transform: scale(1) rotate(0deg); opacity: 1; }
                    50% { transform: scale(1.3) rotate(15deg); opacity: 0.7; }
                }
            `}</style>
        </>
    );
}
