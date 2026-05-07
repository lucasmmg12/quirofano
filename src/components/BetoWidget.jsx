/**
 * BetoWidget — Asistente personal AI del Sanatorio Argentino
 * 
 * Widget flotante (bottom-right) con chat expansible a pantalla completa.
 * Usa Supabase Edge Function "beto-assistant" (OpenAI GPT-4.1 + Function Calling).
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Send, X, Maximize2, Minimize2, Sparkles, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const BETO_AVATAR = '/beto.jpg';
const BETO_GIF = '/The_avatar_is_greetings.gif';

export default function BetoWidget({ currentUser }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showGreeting, setShowGreeting] = useState(false);
    const [hasNewMessage, setHasNewMessage] = useState(false);
    const chatEndRef = useRef(null);
    const inputRef = useRef(null);

    // Scroll to bottom when new messages arrive
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Focus input when opening chat
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [isOpen]);

    // Welcome message when first opened
    const handleOpen = useCallback(() => {
        setShowGreeting(true);
        setHasNewMessage(false);
        setTimeout(() => {
            setShowGreeting(false);
            setIsOpen(true);
            if (messages.length === 0) {
                const userName = currentUser?.nombre?.includes('@')
                    ? currentUser.nombre.split('@')[0].replace(/^\w/, c => c.toUpperCase())
                    : currentUser?.nombre || 'usuario';
                setMessages([{
                    role: 'assistant',
                    content: `¡Hola **${userName}**! 👋 Soy **Beto**, tu asistente del Sanatorio Argentino.\n\nPodés preguntarme sobre:\n- 💰 **Deudas** de pacientes\n- 🏥 **Asociaciones** y cirugías\n- 🔬 **Laboratorios** de anatomía\n- 📊 **Métricas** del sistema\n- ❓ **Cómo funciona** cualquier módulo\n\n¿En qué te puedo ayudar?`,
                }]);
            }
        }, 2000);
    }, [messages.length, currentUser]);

    const handleClose = useCallback(() => {
        setIsOpen(false);
        setIsFullscreen(false);
        setShowGreeting(false);
    }, []);

    const handleSend = useCallback(async (overrideText) => {
        const text = (overrideText || input).trim();
        if (!text || isLoading) return;

        const userMessage = { role: 'user', content: text };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            // Build messages for API (only role + content)
            const apiMessages = [...messages, userMessage].map(m => ({
                role: m.role,
                content: m.content,
            }));

            const { data, error } = await supabase.functions.invoke('beto-assistant', {
                body: {
                    messages: apiMessages,
                    user: currentUser ? {
                        nombre: currentUser.nombre,
                        usuario: currentUser.usuario,
                    } : null,
                },
            });

            if (error) throw error;

            if (data?.message) {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: data.message,
                }]);
            } else if (data?.error) {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `⚠️ Error: ${data.error}`,
                }]);
            }
        } catch (err) {
            console.error('[BetoWidget] Error:', err);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `❌ No pude conectarme al servidor. Error: ${err.message}`,
            }]);
        } finally {
            setIsLoading(false);
        }
    }, [input, isLoading, messages, currentUser]);

    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

    // ─── RENDER ───

    // Floating button (minimized state)
    if (!isOpen && !showGreeting) {
        return (
            <button
                id="beto-fab"
                onClick={handleOpen}
                style={{
                    position: 'fixed',
                    bottom: '24px',
                    right: '24px',
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    border: 'none',
                    padding: '0',
                    cursor: 'pointer',
                    zIndex: 9998,
                    background: '#fff',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08)',
                    transition: 'all 0.3s ease',
                    overflow: 'hidden',
                    animation: hasNewMessage ? 'beto-pulse 2s infinite' : 'none',
                }}
                onMouseOver={e => {
                    e.currentTarget.style.transform = 'scale(1.1)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.18)';
                }}
                onMouseOut={e => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08)';
                }}
                title="Hablar con Beto"
            >
                <img
                    src={BETO_AVATAR}
                    alt="Beto"
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: '50%',
                    }}
                />
            </button>
        );
    }

    // Greeting animation (GIF)
    if (showGreeting && !isOpen) {
        return (
            <div style={{
                position: 'fixed',
                bottom: '24px',
                right: '24px',
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                animation: 'beto-entrance 0.5s ease-out',
            }}>
                <div style={{
                    background: 'white',
                    borderRadius: '20px',
                    padding: '6px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                    marginBottom: '8px',
                }}>
                    <img
                        src={BETO_GIF}
                        alt="Beto saludando"
                        style={{
                            width: '180px',
                            height: '180px',
                            borderRadius: '16px',
                            objectFit: 'cover',
                        }}
                    />
                </div>
                <div style={{
                    background: '#4F46E5',
                    color: 'white',
                    padding: '8px 16px',
                    borderRadius: '12px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.4)',
                    animation: 'beto-fade-in 0.5s ease-out 0.3s both',
                }}>
                    ¡Hola! Cargando... ✨
                </div>
            </div>
        );
    }

    // Chat panel (open state)
    const panelStyle = isFullscreen
        ? {
            position: 'fixed', top: '3px', left: 'var(--sidebar-width)', right: '0', bottom: '0',
            width: 'auto', height: 'auto',
            borderRadius: '0', zIndex: 10000,
        }
        : {
            position: 'fixed', bottom: '24px', right: '24px',
            width: '420px', height: '600px',
            maxHeight: 'calc(100vh - 48px)',
            borderRadius: '20px', zIndex: 9999,
        };

    return (
        <div
            id="beto-chat-panel"
            style={{
                ...panelStyle,
                background: '#FAFBFF',
                boxShadow: isFullscreen
                    ? 'none'
                    : '0 12px 48px rgba(0,0,0,0.15), 0 0 0 1px rgba(79,70,229,0.1)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                animation: 'beto-slide-up 0.3s ease-out',
                fontFamily: "'Inter', -apple-system, sans-serif",
            }}
        >
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '16px 20px',
                background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 50%, #818CF8 100%)',
                color: 'white',
                flexShrink: 0,
            }}>
                <div style={{
                    width: '42px', height: '42px', borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.5)',
                    overflow: 'hidden', flexShrink: 0,
                }}>
                    <img src={BETO_AVATAR} alt="Beto" style={{
                        width: '100%', height: '100%', objectFit: 'cover',
                    }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontSize: '1rem', fontWeight: 700,
                        display: 'flex', alignItems: 'center', gap: '6px',
                    }}>
                        Beto <Sparkles size={14} style={{ opacity: 0.8 }} />
                    </div>
                    <div style={{
                        fontSize: '0.72rem', opacity: 0.85,
                        display: 'flex', alignItems: 'center', gap: '4px',
                    }}>
                        <span style={{
                            width: '6px', height: '6px', borderRadius: '50%',
                            background: '#4ADE80', display: 'inline-block',
                        }} />
                        Asistente IA — Sanatorio Argentino
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                        onClick={() => setIsFullscreen(prev => !prev)}
                        title={isFullscreen ? 'Minimizar' : 'Pantalla completa'}
                        style={{
                            width: '32px', height: '32px', borderRadius: '8px',
                            border: 'none', background: 'rgba(255,255,255,0.15)',
                            color: 'white', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'background 0.2s',
                        }}
                        onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
                        onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                    >
                        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </button>
                    <button
                        onClick={handleClose}
                        title="Cerrar"
                        style={{
                            width: '32px', height: '32px', borderRadius: '8px',
                            border: 'none', background: 'rgba(255,255,255,0.15)',
                            color: 'white', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'background 0.2s',
                        }}
                        onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
                        onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Messages area */}
            <div style={{
                flex: 1, overflowY: 'auto', padding: '16px 20px',
                display: 'flex', flexDirection: 'column', gap: '12px',
            }}>
                {messages.map((msg, i) => (
                    <div
                        key={i}
                        style={{
                            display: 'flex',
                            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            gap: '8px',
                            animation: 'beto-fade-in 0.3s ease-out',
                        }}
                    >
                        {msg.role === 'assistant' && (
                            <div style={{
                                width: '28px', height: '28px', borderRadius: '50%',
                                overflow: 'hidden', flexShrink: 0, marginTop: '2px',
                            }}>
                                <img src={BETO_AVATAR} alt="" style={{
                                    width: '100%', height: '100%', objectFit: 'cover',
                                }} />
                            </div>
                        )}
                        <div style={{
                            maxWidth: isFullscreen ? '65%' : '82%',
                            padding: '10px 14px',
                            borderRadius: msg.role === 'user'
                                ? '16px 16px 4px 16px'
                                : '16px 16px 16px 4px',
                            background: msg.role === 'user'
                                ? 'linear-gradient(135deg, #4F46E5, #6366F1)'
                                : '#FFFFFF',
                            color: msg.role === 'user' ? '#fff' : '#1E293B',
                            fontSize: '0.85rem',
                            lineHeight: '1.5',
                            boxShadow: msg.role === 'user'
                                ? '0 2px 8px rgba(79,70,229,0.25)'
                                : '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
                            wordBreak: 'break-word',
                        }}>
                            {msg.role === 'assistant' ? (
                                <div className="beto-markdown">
                                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                                </div>
                            ) : (
                                <span>{msg.content}</span>
                            )}
                        </div>
                    </div>
                ))}

                {/* Loading indicator */}
                {isLoading && (
                    <div style={{
                        display: 'flex', gap: '8px', alignItems: 'center',
                        animation: 'beto-fade-in 0.3s ease-out',
                    }}>
                        <div style={{
                            width: '28px', height: '28px', borderRadius: '50%',
                            overflow: 'hidden', flexShrink: 0,
                        }}>
                            <img src={BETO_GIF} alt="" style={{
                                width: '100%', height: '100%', objectFit: 'cover',
                            }} />
                        </div>
                        <div style={{
                            padding: '12px 16px', borderRadius: '16px 16px 16px 4px',
                            background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                            display: 'flex', alignItems: 'center', gap: '8px',
                            fontSize: '0.82rem', color: '#6366F1',
                        }}>
                            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                            Beto está pensando...
                        </div>
                    </div>
                )}

                <div ref={chatEndRef} />
            </div>

            {/* Quick suggestions (only when few messages) */}
            {messages.length <= 1 && (
                <div style={{
                    padding: '0 20px 8px',
                    display: 'flex', flexWrap: 'wrap', gap: '6px',
                }}>
                    {[
                        '📊 ¿Cómo está la deuda general?',
                        '🏥 ¿Qué hace el módulo de Asociaciones?',
                        '📈 Dame las métricas del sistema',
                    ].map((q, i) => (
                        <button
                            key={i}
                            onClick={() => handleSend(q)}
                            style={{
                                padding: '6px 12px', borderRadius: '20px',
                                border: '1px solid #E0E7FF',
                                background: '#EEF2FF', color: '#4338CA',
                                fontSize: '0.75rem', fontWeight: 500,
                                cursor: 'pointer', transition: 'all 0.2s',
                                whiteSpace: 'nowrap',
                            }}
                            onMouseOver={e => {
                                e.currentTarget.style.background = '#C7D2FE';
                                e.currentTarget.style.borderColor = '#A5B4FC';
                            }}
                            onMouseOut={e => {
                                e.currentTarget.style.background = '#EEF2FF';
                                e.currentTarget.style.borderColor = '#E0E7FF';
                            }}
                        >
                            {q}
                        </button>
                    ))}
                </div>
            )}

            {/* Input area */}
            <div style={{
                padding: '12px 16px',
                borderTop: '1px solid #E2E8F0',
                background: '#fff',
                display: 'flex', gap: '8px', alignItems: 'flex-end',
                flexShrink: 0,
                borderRadius: isFullscreen ? '0' : '0 0 20px 20px',
            }}>
                <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Escribí tu pregunta..."
                    rows={1}
                    style={{
                        flex: 1, resize: 'none',
                        padding: '10px 14px',
                        border: '1.5px solid #E2E8F0',
                        borderRadius: '14px',
                        fontSize: '0.85rem',
                        fontFamily: 'inherit',
                        lineHeight: '1.4',
                        outline: 'none',
                        transition: 'border-color 0.2s, box-shadow 0.2s',
                        maxHeight: '120px',
                        overflowY: 'auto',
                    }}
                    onFocus={e => {
                        e.target.style.borderColor = '#818CF8';
                        e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)';
                    }}
                    onBlur={e => {
                        e.target.style.borderColor = '#E2E8F0';
                        e.target.style.boxShadow = 'none';
                    }}
                    onInput={e => {
                        e.target.style.height = 'auto';
                        e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                    }}
                />
                <button
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
                    style={{
                        width: '40px', height: '40px',
                        borderRadius: '12px', border: 'none',
                        background: input.trim() && !isLoading
                            ? 'linear-gradient(135deg, #4F46E5, #6366F1)'
                            : '#E2E8F0',
                        color: input.trim() && !isLoading ? '#fff' : '#94A3B8',
                        cursor: input.trim() && !isLoading ? 'pointer' : 'default',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.2s',
                        flexShrink: 0,
                    }}
                >
                    <Send size={18} />
                </button>
            </div>
        </div>
    );
}
