/**
 * BetoWidget — Asistente personal AI del Sanatorio Argentino
 * 
 * Widget flotante (bottom-right) con chat expansible a pantalla completa.
 * Usa Supabase Edge Function "beto-assistant" (OpenAI GPT-4.1 + Function Calling).
 * 
 * Features: Smart Suggestions (#1), Rich Responses (#2), Streaming (#6),
 * Module Preview (#8), Export (#9), Themes (#10), Presentation (#14),
 * Memory (#18), Tutorials (#19)
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Send, X, Maximize2, Minimize2, Sparkles, Loader2, Palette, BookOpen, FileSpreadsheet, Printer, Presentation, FileDown, ThumbsUp, ThumbsDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { BetoStatsCard, BetoStatusPipeline, BetoModulePreview, BetoExportBar, BetoInsightCard, BetoExcelDownload, parseRichContent } from './BetoComponents';
import BetoPresentationMode from './BetoPresentationMode';
import BetoTutorial from './BetoTutorial';
import { downloadBetoReportPdf, isReportMessage } from '../utils/betoReportPdf';

const BETO_AVATAR = '/beto.jpg';
const BETO_GIF = '/The_avatar_is_greetings.gif';

// #1 — Smart Suggestions per module
const SMART_SUGGESTIONS = {
    inicio: ['🔔 ¿Qué hay pendiente hoy?', '📊 Reporte rápido del día', '📚 Enseñame a usar el sistema', '🧭 Llevame a Cirugías'],
    cirugias: ['📊 Estado de cirugías de hoy', '🔴 Cirugías sin confirmar', '📈 Tendencias del mes', '📥 Exportar cirugías a Excel'],
    deudas: ['💰 Top 10 deudores', '📋 Pacientes sin contactar', '📥 Exportar deudas a Excel', '📊 Resumen de deudas'],
    mensajeria: ['📨 Mensajes sin responder', '📊 Resumen de conversaciones', '📋 Plantillas más usadas', '🔔 Pendientes de hoy'],
    pedidos: ['📋 Últimos pedidos generados', '📊 Prácticas más solicitadas', '🔍 Buscar paciente', '📚 Ver nomenclador'],
    altas: ['📋 Altas pendientes de hoy', '📊 Resumen de altas del día', '👤 Buscar paciente internado', '📥 Exportar altas a Excel'],
    turnos: ['📊 Cola de turnos actual', '⏰ Próximos turnos', '📈 Estadísticas de espera', '🔔 Turnos demorados'],
    metricas: ['📊 Resumen mensual', '📈 Comparar con mes anterior', '🏥 Métricas por especialidad', '📥 Exportar métricas a Excel'],
    auditoria_historias: ['📊 ¿Cómo auditar historias clínicas?', '📋 Explicar pipeline de auditoría', '💡 ¿Qué significa Sin Fecha de Alta?', '🧭 Llevame a Inicio'],
    facturacion: ['🧾 Fichas pendientes de facturar', '📊 Resumen de facturación del mes', '🔙 Fichas devueltas', '📚 Enseñame facturación'],
    default: ['🔔 ¿Qué hay pendiente?', '📊 Reporte del día', '📥 Exportar datos a Excel', '❓ ¿Cómo funciona esto?'],
};

// Proactive notifications — contextual nudges per module + time
const PROACTIVE_NUDGES = {
    cirugias: [
        '📋 ¿Querés que revise las cirugías de hoy?',
        '🔔 Puedo verificar si hay cirugías sin confirmar',
        '📊 Te armo un reporte rápido de cirugías si querés',
    ],
    deudas: [
        '💰 ¿Necesitás un reporte de deudas pendientes?',
        '📲 Puedo ayudarte a enviar recordatorios de pago',
        '📊 ¿Querés ver el top 10 de deudores?',
    ],
    mensajeria: [
        '📨 ¿Hay mensajes que necesités responder?',
        '📋 Puedo sugerirte plantillas para responder rápido',
    ],
    pedidos: [
        '📝 ¿Necesitás generar un pedido nuevo?',
        '🔍 Puedo buscar prácticas o pacientes por vos',
    ],
    altas: [
        '🏥 ¿Querés ver las altas pendientes de hoy?',
        '📋 Puedo armar un resumen de altas del día',
    ],
    turnos: [
        '⏰ ¿Querés ver el estado de la cola de turnos?',
        '📊 Puedo mostrarte estadísticas de espera',
    ],
    auditoria_historias: [
        '🔍 ¿Necesitás ayuda auditando las planillas de historias clínicas?',
        '📊 Puedo explicarte cómo funciona la auditoría de evolución y altas',
    ],
    facturacion: [
        '🧾 ¿Querés ver las fichas pendientes de facturar?',
        '📊 Puedo armar un resumen de estado de facturación',
        '🔙 ¿Necesitás devolver fichas a Control de Altas?',
    ],
    default: [
        '👋 ¡Hola! ¿Sabías que puedo generar reportes en PDF?',
        '🚀 Probá preguntarme algo con Ctrl+K',
        '💡 Puedo ayudarte con cualquier dato del sistema',
        '📊 Pedime un reporte y te lo armo al instante',
        '🧭 Decime a dónde querés ir y te llevo',
    ],
};
const TIME_NUDGES = {
    morning: ['☀️ ¡Buen día! ¿Arrancamos revisando los pendientes?', '📋 Buenos días — ¿querés un resumen del día?'],
    afternoon: ['☕ ¿Necesitás ayuda con algo esta tarde?', '📊 ¿Te armo un reporte del avance del día?'],
    evening: ['🌙 Último tramo del día — ¿cerramos algo pendiente?'],
};

// #10 — Theme presets
const THEMES = {
    default: { name: 'Clásico', bg: '#FAFBFF', bubble: '#FFFFFF', accent: '#4F46E5', gradient: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 50%, #818CF8 100%)' },
    dark: { name: 'Oscuro', bg: '#1E1E2E', bubble: '#2A2A3E', accent: '#818CF8', gradient: 'linear-gradient(135deg, #312E81 0%, #4338CA 50%, #6366F1 100%)' },
    clinical: { name: 'Clínico', bg: '#F0F9FF', bubble: '#FFFFFF', accent: '#0369A1', gradient: 'linear-gradient(135deg, #0369A1 0%, #0284C7 50%, #38BDF8 100%)' },
    warm: { name: 'Cálido', bg: '#FFFBF5', bubble: '#FFFFFF', accent: '#B45309', gradient: 'linear-gradient(135deg, #B45309 0%, #D97706 50%, #FBBF24 100%)' },
};

export default function BetoWidget({ currentUser, currentModule, onNavigate }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showGreeting, setShowGreeting] = useState(false);
    const [hasNewMessage, setHasNewMessage] = useState(false);
    // #10 Theme
    const [theme, setTheme] = useState(() => localStorage.getItem('beto_theme') || 'default');
    const [showThemes, setShowThemes] = useState(false);
    // #14 Presentation
    const [presentationSlides, setPresentationSlides] = useState(null);
    // #19 Tutorial
    const [tutorialId, setTutorialId] = useState(null);
    // #6 Streaming
    const [streamingText, setStreamingText] = useState('');
    // Proactive notifications
    const [proactiveNudge, setProactiveNudge] = useState(null);
    const nudgeTimerRef = useRef(null);
    const chatEndRef = useRef(null);
    const inputRef = useRef(null);
    const t = THEMES[theme] || THEMES.default;

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

    // ─── Proactive nudge system ───
    useEffect(() => {
        // Don't show nudges if chat is open
        if (isOpen || showGreeting) { setProactiveNudge(null); return; }

        const scheduleNudge = () => {
            // Check cooldown — don't nudge more than every 3 minutes
            const lastNudge = parseInt(localStorage.getItem('beto_last_nudge') || '0', 10);
            const elapsed = Date.now() - lastNudge;
            if (elapsed < 180000) return; // 3 min cooldown

            // Pick a nudge: prefer module-specific, fallback to time-based, then generic
            const hour = new Date().getHours();
            let pool = [];

            // Module-specific nudges
            const modulePool = PROACTIVE_NUDGES[currentModule] || [];
            pool.push(...modulePool);

            // Time-based nudges
            if (hour >= 6 && hour < 12) pool.push(...TIME_NUDGES.morning);
            else if (hour >= 12 && hour < 18) pool.push(...TIME_NUDGES.afternoon);
            else pool.push(...TIME_NUDGES.evening);

            // Generic fallbacks
            pool.push(...PROACTIVE_NUDGES.default);

            // Don't repeat last nudge
            const lastText = localStorage.getItem('beto_last_nudge_text') || '';
            pool = pool.filter(n => n !== lastText);
            if (pool.length === 0) pool = PROACTIVE_NUDGES.default;

            const chosen = pool[Math.floor(Math.random() * pool.length)];
            setProactiveNudge(chosen);
            setHasNewMessage(true);
            localStorage.setItem('beto_last_nudge', Date.now().toString());
            localStorage.setItem('beto_last_nudge_text', chosen);

            // Auto-dismiss after 8 seconds
            setTimeout(() => {
                setProactiveNudge(null);
                setHasNewMessage(false);
            }, 8000);
        };

        // First nudge after 45 seconds, then every 5 minutes
        const initialDelay = setTimeout(scheduleNudge, 45000);
        nudgeTimerRef.current = setInterval(scheduleNudge, 300000);

        return () => {
            clearTimeout(initialDelay);
            if (nudgeTimerRef.current) clearInterval(nudgeTimerRef.current);
        };
    }, [isOpen, showGreeting, currentModule]);

    const dismissNudge = useCallback((e) => {
        e?.stopPropagation();
        setProactiveNudge(null);
        setHasNewMessage(false);
    }, []);

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
                    content: `¡Hola **${userName}**! 👋 Soy **Beto**, tu asistente del Sanatorio Argentino.\n\nPodés preguntarme sobre:\n- 🔍 **Consultar datos** de cualquier módulo\n- 📊 **Generar reportes** (deudas, cirugías, asociaciones)\n- ✏️ **Modificar datos** (con tu confirmación)\n- 📲 **Enviar WhatsApp** a pacientes\n- 🧭 **Navegar** a cualquier módulo\n- 🔔 **Ver pendientes** y alertas\n- ❓ **Explicar** cómo funciona cada parte\n\n¿En qué te puedo ayudar?`,
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

        // #19 — Detect tutorial requests
        const tutorialMatch = text.match(/ense[ñn]ame|tutorial|como\s+(?:uso|funciona)|aprend/i);
        const moduleMatch = text.match(/cirug[ií]a|deuda|pedido|mensaje|whatsapp|auditor[ií]a|alta|facturaci[oó]n/i);
        if (tutorialMatch && moduleMatch) {
            const modMap = { cirug: 'cirugias', deuda: 'deudas', pedido: 'pedidos', mensaj: 'mensajeria', whatsapp: 'mensajeria', auditor: 'auditoria_historias', alta: 'altas', factur: 'facturacion' };
            const key = Object.keys(modMap).find(k => moduleMatch[0].toLowerCase().startsWith(k));
            if (key) { setTutorialId(modMap[key]); setInput(''); return; }
        }

        const userMessage = { role: 'user', content: text };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);
        setStreamingText('');

        try {
            const apiMessages = [...messages, userMessage].map(m => ({ role: m.role, content: m.content }));

            // #6 — Streaming via fetch to edge function
            const supabaseUrl = supabase.supabaseUrl || import.meta.env.VITE_SUPABASE_URL;
            const supabaseKey = supabase.supabaseKey || import.meta.env.VITE_SUPABASE_ANON_KEY;
            const { data: { session } } = await supabase.auth.getSession();
            const authToken = session?.access_token || supabaseKey;

            const response = await fetch(`${supabaseUrl}/functions/v1/beto-assistant`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    'apikey': supabaseKey,
                },
                body: JSON.stringify({
                    messages: apiMessages,
                    user: currentUser ? { nombre: currentUser.nombre, usuario: currentUser.usuario } : null,
                    currentModule: currentModule || 'inicio',
                    stream: true,
                }),
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const contentType = response.headers.get('content-type') || '';

            if (contentType.includes('text/event-stream')) {
                // SSE streaming response
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let fullText = '';
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const payload = line.slice(6);
                            if (payload === '[DONE]') break;
                            try {
                                const parsed = JSON.parse(payload);
                                if (parsed.content) { fullText += parsed.content; setStreamingText(fullText); }
                                if (parsed.message) { fullText = parsed.message; }
                            } catch { /* skip bad JSON */ }
                        }
                    }
                }

                // Finalize streamed message
                let content = fullText;
                const navMatch = content.match(/\[ACTION:navigate:(\w+)\]/);
                if (navMatch && onNavigate) { content = content.replace(/\[ACTION:navigate:\w+\]/g, ''); setTimeout(() => onNavigate(navMatch[1]), 500); }
                content = content.replace(/\[ACTION:[^\]]+\]/g, '').trim();
                setStreamingText('');
                setMessages(prev => [...prev, { role: 'assistant', content, interaction_id: null }]);
            } else {
                // Fallback: JSON response (non-streaming)
                const data = await response.json();
                if (data?.message) {
                    let content = data.message;
                    const navMatch = content.match(/\[ACTION:navigate:(\w+)\]/);
                    if (navMatch && onNavigate) { content = content.replace(/\[ACTION:navigate:\w+\]/g, ''); setTimeout(() => onNavigate(navMatch[1]), 500); }
                    content = content.replace(/\[ACTION:[^\]]+\]/g, '').trim();
                    setMessages(prev => [...prev, {
                        role: 'assistant',
                        content,
                        interaction_id: data.interaction_id || null,
                        excel_data: data.excel_data || null,
                    }]);
                } else if (data?.error) {
                    setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${data.message || data.error}` }]);
                }
            }
        } catch (err) {
            console.error('[BetoWidget] Error:', err);
            setStreamingText('');
            setMessages(prev => [...prev, { role: 'assistant', content: `❌ No pude conectarme al servidor. Error: ${err.message}` }]);
        } finally {
            setIsLoading(false);
            setStreamingText('');
        }
    }, [input, isLoading, messages, currentUser, currentModule, onNavigate]);

    // #10 — Theme change handler
    const changeTheme = useCallback((newTheme) => {
        setTheme(newTheme);
        localStorage.setItem('beto_theme', newTheme);
        setShowThemes(false);
    }, []);

    // Feedback — thumbs up/down
    const [feedbackGiven, setFeedbackGiven] = useState({});
    const sendFeedback = useCallback(async (msgIndex, interactionId, feedback) => {
        setFeedbackGiven(prev => ({ ...prev, [msgIndex]: feedback }));
        if (!interactionId) return;
        try {
            await supabase.from('beto_interactions').update({
                feedback,
                feedback_at: new Date().toISOString(),
            }).eq('id', interactionId);
        } catch (err) {
            console.warn('[BetoWidget] Feedback save failed:', err.message);
        }
    }, []);

    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

    // ─── RENDER ───

    // Floating button (minimized state) + proactive nudge bubble
    if (!isOpen && !showGreeting) {
        return (
            <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9998, display: 'flex', alignItems: 'flex-end', gap: '10px' }}>
                {/* Proactive notification bubble */}
                {proactiveNudge && (
                    <div
                        onClick={() => { dismissNudge(); handleOpen(); }}
                        style={{
                            background: '#fff',
                            border: '1px solid #E2E8F0',
                            borderRadius: '16px 16px 4px 16px',
                            padding: '10px 14px',
                            maxWidth: '240px',
                            boxShadow: '0 8px 24px rgba(79, 70, 229, 0.15), 0 2px 8px rgba(0,0,0,0.06)',
                            cursor: 'pointer',
                            animation: 'beto-nudge-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                            position: 'relative',
                            transition: 'transform 0.2s',
                        }}
                        onMouseOver={e => e.currentTarget.style.transform = 'scale(1.03)'}
                        onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                        {/* Close button */}
                        <button
                            onClick={dismissNudge}
                            style={{
                                position: 'absolute', top: '-6px', right: '-6px',
                                width: '18px', height: '18px', borderRadius: '50%',
                                background: '#EF4444', border: '2px solid #fff',
                                color: '#fff', fontSize: '10px', fontWeight: 700,
                                cursor: 'pointer', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', lineHeight: 1, padding: 0,
                            }}
                        >
                            ×
                        </button>
                        <div style={{ fontSize: '0.78rem', color: '#1E293B', lineHeight: 1.4, fontWeight: 500 }}>
                            {proactiveNudge}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: '#94A3B8', marginTop: '4px', fontWeight: 600 }}>
                            Click para hablar con Beto →
                        </div>
                        {/* Progress bar (auto-dismiss timer visual) */}
                        <div style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0,
                            height: '3px', borderRadius: '0 0 16px 16px', overflow: 'hidden',
                        }}>
                            <div style={{
                                width: '100%', height: '100%',
                                background: 'linear-gradient(90deg, #4F46E5, #818CF8)',
                                animation: 'beto-nudge-timer 8s linear forwards',
                            }} />
                        </div>
                    </div>
                )}
                {/* FAB button */}
                <button
                    id="beto-fab"
                    onClick={handleOpen}
                    style={{
                        width: '60px',
                        height: '60px',
                        borderRadius: '50%',
                        border: 'none',
                        padding: '0',
                        cursor: 'pointer',
                        background: '#fff',
                        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08)',
                        transition: 'all 0.3s ease',
                        overflow: 'hidden',
                        flexShrink: 0,
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
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                    />
                    {/* Notification dot */}
                    {proactiveNudge && (
                        <div style={{
                            position: 'absolute', top: '-2px', right: '-2px',
                            width: '14px', height: '14px', borderRadius: '50%',
                            background: '#EF4444', border: '2px solid #fff',
                            animation: 'beto-pulse 1.5s infinite',
                        }} />
                    )}
                </button>
            </div>
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
        <>
        <div
            id="beto-chat-panel"
            style={{
                ...panelStyle,
                background: t.bg,
                boxShadow: isFullscreen
                    ? 'none'
                    : `0 12px 48px rgba(0,0,0,0.15), 0 0 0 1px ${t.accent}15`,
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
                background: t.gradient,
                color: 'white',
                flexShrink: 0,
                position: 'relative',
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
                    {/* #10 Theme Toggle */}
                    <button
                        onClick={() => setShowThemes(p => !p)}
                        title="Cambiar tema"
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
                        <Palette size={15} />
                    </button>
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
                {/* #10 Theme Picker Dropdown */}
                {showThemes && (
                    <div style={{
                        position: 'absolute', top: '100%', right: '20px',
                        background: '#fff', borderRadius: '12px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.15)', padding: '8px',
                        zIndex: 10, display: 'flex', flexDirection: 'column', gap: '4px',
                        minWidth: '160px', animation: 'beto-fade-in 0.15s',
                    }}>
                        {Object.entries(THEMES).map(([key, th]) => (
                            <button key={key} onClick={() => changeTheme(key)} style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                padding: '8px 12px', borderRadius: '8px', border: 'none',
                                background: theme === key ? '#EEF2FF' : 'transparent',
                                cursor: 'pointer', fontSize: '0.8rem', fontWeight: theme === key ? 700 : 500,
                                color: '#334155', textAlign: 'left', width: '100%',
                            }}>
                                <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: th.gradient, border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                                {th.name}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Messages area */}
            <div style={{
                flex: 1, overflowY: 'auto', padding: '16px 20px',
                display: 'flex', flexDirection: 'column', gap: '12px',
            }}>
                {messages.map((msg, i) => {
                    // #2 — Parse rich content from assistant messages
                    const { text: cleanText, richBlocks } = msg.role === 'assistant'
                        ? parseRichContent(msg.content, onNavigate)
                        : { text: msg.content, richBlocks: [] };
                    return (
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
                                ? t.gradient
                                : t.bubble,
                            color: msg.role === 'user' ? '#fff' : (theme === 'dark' ? '#E2E8F0' : '#1E293B'),
                            fontSize: '0.85rem',
                            lineHeight: '1.5',
                            boxShadow: msg.role === 'user'
                                ? `0 2px 8px ${t.accent}40`
                                : '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
                            wordBreak: 'break-word',
                        }}>
                            {msg.role === 'assistant' ? (
                                <div className="beto-markdown">
                                    <ReactMarkdown>{cleanText}</ReactMarkdown>
                                    {/* Direct Excel download from API response (primary mechanism) */}
                                    {msg.excel_data && (
                                        <BetoExcelDownload excelData={msg.excel_data} />
                                    )}
                                    {/* #2 Rich blocks (text-parsed fallback) */}
                                    {richBlocks.map((block, j) => {
                                        if (block.type === 'stats') return <BetoStatsCard key={j} stats={block.data} />;
                                        if (block.type === 'pipeline') return <BetoStatusPipeline key={j} pipeline={block.data} />;
                                        if (block.type === 'insight') return <BetoInsightCard key={j} insight={block.data} />;
                                        if (block.type === 'modulePreview') return <BetoModulePreview key={j} moduleId={block.moduleId} onNavigate={onNavigate} />;
                                        if (block.type === 'excel' && !msg.excel_data) return <BetoExcelDownload key={j} excelData={block.data} />;
                                        return null;
                                    })}
                                    {/* PDF Download bar — visible on report messages */}
                                    {isReportMessage(msg.content) && (
                                        <div style={{
                                            display: 'flex', gap: '6px', marginTop: '10px',
                                            paddingTop: '8px', borderTop: `1px solid ${t.accent}15`,
                                        }}>
                                            <button
                                                onClick={() => downloadBetoReportPdf(msg.content)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '5px',
                                                    padding: '5px 10px', borderRadius: '8px',
                                                    border: `1px solid ${t.accent}25`,
                                                    background: `${t.accent}08`, color: t.accent,
                                                    fontSize: '0.72rem', fontWeight: 600,
                                                    cursor: 'pointer', transition: 'all 0.15s',
                                                }}
                                                onMouseOver={e => {
                                                    e.currentTarget.style.background = `${t.accent}18`;
                                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                                }}
                                                onMouseOut={e => {
                                                    e.currentTarget.style.background = `${t.accent}08`;
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                }}
                                            >
                                                <FileDown size={13} />
                                                Descargar PDF
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const printW = window.open('', '_blank');
                                                    printW.document.write(`<html><head><title>Reporte Beto</title><style>body{font-family:system-ui,sans-serif;padding:40px;max-width:800px;margin:0 auto;color:#1E293B}table{border-collapse:collapse;width:100%}th,td{border:1px solid #E2E8F0;padding:6px 10px;text-align:left;font-size:13px}th{background:#4F46E5;color:#fff}tr:nth-child(even){background:#F8FAFC}h1,h2,h3{color:#4F46E5}@media print{body{padding:20px}}</style></head><body>${document.querySelector('.beto-markdown')?.innerHTML || cleanText}</body></html>`);
                                                    printW.document.close();
                                                    printW.print();
                                                }}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '5px',
                                                    padding: '5px 10px', borderRadius: '8px',
                                                    border: '1px solid #E2E8F020',
                                                    background: 'transparent',
                                                    color: theme === 'dark' ? '#94A3B8' : '#64748B',
                                                    fontSize: '0.72rem', fontWeight: 500,
                                                    cursor: 'pointer', transition: 'all 0.15s',
                                                }}
                                                onMouseOver={e => e.currentTarget.style.background = '#F1F5F9'}
                                                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <Printer size={13} />
                                                Imprimir
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <span>{msg.content}</span>
                            )}
                        </div>
                        {/* Thumbs up/down feedback — assistant messages only */}
                        {msg.role === 'assistant' && i > 0 && (
                            <div style={{
                                display: 'flex', flexDirection: 'column', gap: '2px',
                                alignSelf: 'flex-end', marginBottom: '2px', opacity: feedbackGiven[i] ? 1 : 0.4,
                                transition: 'opacity 0.2s',
                            }}
                            onMouseOver={e => e.currentTarget.style.opacity = 1}
                            onMouseOut={e => { if (!feedbackGiven[i]) e.currentTarget.style.opacity = 0.4; }}
                            >
                                <button
                                    onClick={() => sendFeedback(i, msg.interaction_id, 'up')}
                                    title="Buena respuesta"
                                    style={{
                                        border: 'none', background: 'none', cursor: 'pointer',
                                        padding: '3px', borderRadius: '6px',
                                        color: feedbackGiven[i] === 'up' ? '#10B981' : (theme === 'dark' ? '#64748B' : '#94A3B8'),
                                        transition: 'all 0.15s',
                                        transform: feedbackGiven[i] === 'up' ? 'scale(1.2)' : 'scale(1)',
                                    }}
                                    disabled={!!feedbackGiven[i]}
                                >
                                    <ThumbsUp size={13} fill={feedbackGiven[i] === 'up' ? '#10B981' : 'none'} />
                                </button>
                                <button
                                    onClick={() => sendFeedback(i, msg.interaction_id, 'down')}
                                    title="Mala respuesta"
                                    style={{
                                        border: 'none', background: 'none', cursor: 'pointer',
                                        padding: '3px', borderRadius: '6px',
                                        color: feedbackGiven[i] === 'down' ? '#EF4444' : (theme === 'dark' ? '#64748B' : '#94A3B8'),
                                        transition: 'all 0.15s',
                                        transform: feedbackGiven[i] === 'down' ? 'scale(1.2)' : 'scale(1)',
                                    }}
                                    disabled={!!feedbackGiven[i]}
                                >
                                    <ThumbsDown size={13} fill={feedbackGiven[i] === 'down' ? '#EF4444' : 'none'} />
                                </button>
                            </div>
                        )}
                    </div>
                    );
                })}

                {/* #6 — Streaming text indicator */}
                {isLoading && (
                    <div style={{
                        display: 'flex', gap: '8px', alignItems: 'flex-start',
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
                            maxWidth: isFullscreen ? '65%' : '82%',
                            padding: '12px 16px', borderRadius: '16px 16px 16px 4px',
                            background: t.bubble, boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                            fontSize: '0.82rem', color: theme === 'dark' ? '#E2E8F0' : '#1E293B',
                        }}>
                            {streamingText ? (
                                <div className="beto-markdown">
                                    <ReactMarkdown>{streamingText}</ReactMarkdown>
                                    <span style={{ display: 'inline-block', width: '6px', height: '14px', background: t.accent, borderRadius: '1px', animation: 'beto-cursor-blink 1s infinite', verticalAlign: 'middle', marginLeft: '2px' }} />
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: t.accent }}>
                                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                    Beto está pensando...
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div ref={chatEndRef} />
            </div>

            {/* #1 — Smart Suggestions (context-aware) */}
            {messages.length <= 1 && (
                <div style={{
                    padding: '0 20px 8px',
                    display: 'flex', flexWrap: 'wrap', gap: '6px',
                }}>
                    {(SMART_SUGGESTIONS[currentModule] || SMART_SUGGESTIONS.default).map((q, i) => (
                        <button
                            key={i}
                            onClick={() => handleSend(q)}
                            style={{
                                padding: '6px 12px', borderRadius: '20px',
                                border: `1px solid ${t.accent}25`,
                                background: `${t.accent}08`, color: t.accent,
                                fontSize: '0.75rem', fontWeight: 500,
                                cursor: 'pointer', transition: 'all 0.2s',
                                whiteSpace: 'nowrap',
                            }}
                            onMouseOver={e => {
                                e.currentTarget.style.background = `${t.accent}18`;
                                e.currentTarget.style.borderColor = `${t.accent}40`;
                            }}
                            onMouseOut={e => {
                                e.currentTarget.style.background = `${t.accent}08`;
                                e.currentTarget.style.borderColor = `${t.accent}25`;
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

        {/* #14 — Presentation Mode */}
        <BetoPresentationMode
            isOpen={!!presentationSlides}
            onClose={() => setPresentationSlides(null)}
            slides={presentationSlides || []}
        />

        {/* #19 — Tutorial overlay */}
        <BetoTutorial
            isOpen={!!tutorialId}
            onClose={() => setTutorialId(null)}
            tutorialId={tutorialId}
            onNavigate={onNavigate}
        />

        {/* #6 — Cursor blink animation */}
        <style>{`
            @keyframes beto-cursor-blink { 0%,50% { opacity: 1; } 51%,100% { opacity: 0; } }
        `}</style>
        </>
    );
}
