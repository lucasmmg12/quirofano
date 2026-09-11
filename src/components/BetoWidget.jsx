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
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Send, X, Maximize2, Minimize2, Sparkles, Loader2, Palette, BookOpen, FileSpreadsheet, Printer, Presentation, FileDown, ThumbsUp, ThumbsDown, Share2, History, RefreshCw, Search, ArrowUpRight, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { BetoStatsCard, BetoStatusPipeline, BetoModulePreview, BetoExportBar, BetoInsightCard, BetoExcelDownload, parseRichContent } from './BetoComponents';
import BetoChartCard from './BetoChartCard';
import BetoPresentationMode from './BetoPresentationMode';
import BetoTutorial from './BetoTutorial';
import { downloadBetoReportPdf, downloadBetoReportExcel, isReportMessage } from '../utils/betoReportPdf';
import { generateShare } from '../api/shareClient';
import { useTelarStore } from '../store/telarStore';
import { getCurrentUser } from '../services/authService';

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
    gobernanza_indicadores: [
        '🚑 Indicadores de Guardia Clínica (Septiembre 2026)',
        '⏱️ ¿Cuál es el tiempo de espera en Guardia?',
        '🔪 Tasa de conversión a cirugía de Guardia',
        '🛏️ Días cama y ocupación en UCI',
        '📥 Exportar resumen de Guardia a Excel'
    ],
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
    gobernanza_indicadores: [
        '🚑 ¿Querés que revisemos los indicadores de Guardia Clínica de este mes?',
        '⏱️ Puedo darte los tiempos de espera y permanencia en Guardia',
        '🛏️ ¿Necesitás un reporte de ocupación o días cama de UCI?',
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

/**
 * Transforma tablas markdown accidentales o dobles barras en listas ejecutivas limpias,
 * garantizando que los listados de pacientes siempre se vean impecables en el chat.
 */
function sanitizeChatText(text) {
    if (!text) return '';
    let result = text;

    // Normalizar dobles pipes accidentales "||" -> salto de línea
    result = result.replace(/\|{2,}/g, '\n');

    // Si tiene tablas markdown con separadores |---|
    if (result.includes('|') && result.includes('---')) {
        const lines = result.split('\n');
        let inTable = false;
        const newLines = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('|')) {
                if (trimmed.includes('---')) continue; // ignorar |---|---|
                const rawCells = trimmed.split('|').map(c => c.trim()).filter(c => c.length > 0);
                if (!inTable) {
                    inTable = true;
                    continue;
                }
                if (rawCells.length > 0) {
                    const primary = rawCells[0];
                    const meta = rawCells.slice(1).filter(c => c && c !== '—').join(' • ');
                    newLines.push(`- **${primary}** ${meta ? `— ${meta}` : ''}`);
                }
            } else {
                inTable = false;
                newLines.push(line);
            }
        }
        result = newLines.join('\n');
    }

    return result.trim();
}

export default function BetoWidget({ currentUser, currentModule, onNavigate, hideFab = false, externalOpen = false, onExternalClose }) {
    const effectiveUser = currentUser || getCurrentUser();
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
    // Historial de consultas previas
    const [showHistory, setShowHistory] = useState(false);
    const [historyItems, setHistoryItems] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [historySearch, setHistorySearch] = useState('');
    const [expandedHistoryId, setExpandedHistoryId] = useState(null);
    // #14 Presentation
    const [presentationSlides, setPresentationSlides] = useState(null);
    // #19 Tutorial
    const [tutorialId, setTutorialId] = useState(null);
    // #6 Streaming
    const [streamingText, setStreamingText] = useState('');
    // Share Record
    const [isSharing, setIsSharing] = useState(false);
    const [shareUrl, setShareUrl] = useState(null);
    // Telar Context
    const { activeIndicators } = useTelarStore();
    // Proactive notifications
    const [proactiveNudge, setProactiveNudge] = useState(null);
    const nudgeTimerRef = useRef(null);
    const chatEndRef = useRef(null);
    const inputRef = useRef(null);
    const t = THEMES[theme] || THEMES.default;

    const fetchHistory = useCallback(async () => {
        setLoadingHistory(true);
        try {
            const userId = effectiveUser?.usuario;
            let query = supabase
                .from('beto_interactions')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);

            if (userId && userId !== 'admin') {
                query = query.eq('user_id', userId);
            }

            const { data, error } = await query;
            if (!error && data) {
                setHistoryItems(data);
            }
        } catch (err) {
            console.warn('[Beto] Error fetching history:', err);
        } finally {
            setLoadingHistory(false);
        }
    }, [effectiveUser?.usuario]);

    useEffect(() => {
        if (showHistory) {
            fetchHistory();
        }
    }, [showHistory, fetchHistory]);

    const filteredHistory = useMemo(() => {
        if (!historySearch.trim()) return historyItems;
        const q = historySearch.toLowerCase();
        return historyItems.filter(item => 
            item.user_query?.toLowerCase().includes(q) ||
            item.response_text?.toLowerCase().includes(q) ||
            item.current_module?.toLowerCase().includes(q)
        );
    }, [historyItems, historySearch]);

    const formatHistoryDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        if (isToday) return `Hoy, ${time}`;
        return `${d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}, ${time}`;
    };

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

    // External open trigger (from sidebar avatar)
    useEffect(() => {
        if (externalOpen && !isOpen) {
            setIsOpen(true);
            setShowGreeting(false);
        }
    }, [externalOpen]);

    // Custom window event 'open-beto' para dispararlo desde popups o botones
    useEffect(() => {
        const handleCustomOpen = (e) => {
            setIsOpen(true);
            setShowGreeting(false);
            if (e.detail?.query) {
                setInput(e.detail.query);
                if (e.detail?.autoSend) {
                    setTimeout(() => {
                        handleSend(e.detail.query);
                    }, 300);
                }
            }
        };
        window.addEventListener('open-beto', handleCustomOpen);
        return () => window.removeEventListener('open-beto', handleCustomOpen);
    }, [messages, currentModule, activeIndicators]);

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
                const userName = effectiveUser?.nombre?.includes('@')
                    ? effectiveUser.nombre.split('@')[0].replace(/^\w/, c => c.toUpperCase())
                    : effectiveUser?.nombre || 'usuario';
                setMessages([{
                    role: 'assistant',
                    content: `¡Hola **${userName}**! 👋 Soy **Beto**, tu asistente del Sanatorio Argentino.\n\nPodés preguntarme sobre:\n- 🔍 **Consultar datos** de cualquier módulo\n- 📊 **Generar reportes** (deudas, cirugías, asociaciones)\n- ✏️ **Modificar datos** (con tu confirmación)\n- 📲 **Enviar WhatsApp** a pacientes\n- 🧭 **Navegar** a cualquier módulo\n- 🔔 **Ver pendientes** y alertas\n- ❓ **Explicar** cómo funciona cada parte\n\n¿En qué te puedo ayudar?`,
                }]);
            }
        }, 2000);
    }, [messages.length, effectiveUser]);

    const handleClose = useCallback(() => {
        setIsOpen(false);
        setIsFullscreen(false);
        setShowGreeting(false);
        onExternalClose?.();
    }, [onExternalClose]);

    const handleSend = useCallback(async (overrideText) => {
        const text = (overrideText || input).trim();
        if (!text || isLoading) return;

        // #19 — Detect tutorial requests
        const tutorialMatch = text.match(/ense[ñn]ame|tutorial|como\s+(?:uso|funciona)|aprend/i);
        const moduleMatch = text.match(/cirug[ií]a|deuda|pedido|mensaje|whatsapp|auditor[ií]a|alta|facturaci[oó]n|garant[ií]a/i);
        if (tutorialMatch && moduleMatch) {
            const modMap = { cirug: 'cirugias', deuda: 'deudas', pedido: 'pedidos', mensaj: 'mensajeria', whatsapp: 'mensajeria', auditor: 'auditoria_historias', alta: 'altas', factur: 'facturacion', garantia: 'garantias' };
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
                    user: effectiveUser ? { nombre: effectiveUser.nombre, usuario: effectiveUser.usuario } : null,
                    currentModule: currentModule || 'inicio',
                    moduleContext: currentModule === 'gobernanza_indicadores' ? activeIndicators : null,
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
    }, [input, isLoading, messages, effectiveUser, currentModule, onNavigate]);

    // #10 — Theme change handler
    const changeTheme = useCallback((newTheme) => {
        setTheme(newTheme);
        localStorage.setItem('beto_theme', newTheme);
        setShowThemes(false);
    }, []);

    // Share Record Handler (Sider AI style)
    const handleShareRecord = useCallback(async () => {
        if (messages.length < 2) return; // Needs at least one user query
        setIsSharing(true);
        try {
            const { public_url } = await generateShare(messages);
            setShareUrl(public_url);
        } catch (e) {
            console.error(e);
        } finally {
            setIsSharing(false);
        }
    }, [messages]);

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
        if (hideFab) return null;
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
                    <button
                        onClick={handleShareRecord}
                        disabled={isSharing || messages.length < 2}
                        title="Compartir análisis profundo"
                        style={{
                            width: '32px', height: '32px', borderRadius: '8px',
                            border: 'none', background: 'rgba(255,255,255,0.15)',
                            color: 'white', cursor: (isSharing || messages.length < 2) ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'background 0.2s', opacity: (isSharing || messages.length < 2) ? 0.5 : 1
                        }}
                        onMouseOver={e => { if (!isSharing && messages.length >= 2) e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}}
                        onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                    >
                        {isSharing ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Share2 size={15} />}
                    </button>
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
                        onClick={() => setShowHistory(p => !p)}
                        title={showHistory ? 'Volver al chat activo' : 'Historial de consultas previas'}
                        style={{
                            width: '32px', height: '32px', borderRadius: '8px',
                            border: 'none', background: showHistory ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)',
                            color: 'white', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.2s',
                        }}
                        onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
                        onMouseOut={e => e.currentTarget.style.background = showHistory ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)'}
                    >
                        <History size={15} />
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
                {/* Share Link Overlay */}
                {shareUrl && (
                    <div style={{
                        position: 'absolute', top: '70px', left: '20px', right: '20px',
                        background: '#fff', borderRadius: '12px', padding: '16px',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.15)', zIndex: 20,
                        border: '1px solid #E2E8F0', animation: 'beto-slide-down 0.2s ease-out'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <h4 style={{ margin: 0, color: '#1E293B', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Share2 size={16} color="#4F46E5" /> Enlace de Compartición
                            </h4>
                            <button onClick={() => setShareUrl(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94A3B8' }}><X size={16} /></button>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '12px', lineHeight: 1.4 }}>
                            Cualquier persona con este enlace podrá ver el resumen profundo y los insights de esta charla.
                        </p>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input 
                                type="text" 
                                readOnly 
                                value={shareUrl} 
                                style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '0.75rem', background: '#F8FAFC', color: '#334155' }}
                            />
                            <button 
                                onClick={() => { navigator.clipboard.writeText(shareUrl); setShareUrl(null); }}
                                style={{ background: '#4F46E5', color: 'white', border: 'none', borderRadius: '6px', padding: '0 12px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                            >
                                Copiar
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Historial de Consultas Overlay */}
            {showHistory && (
                <div style={{
                    position: 'absolute',
                    top: '74px',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: '#F8FAFC',
                    zIndex: 30,
                    display: 'flex',
                    flexDirection: 'column',
                    animation: 'beto-fade-in 0.2s ease-out',
                }}>
                    {/* Header bar del historial */}
                    <div style={{
                        padding: '12px 16px',
                        background: '#FFFFFF',
                        borderBottom: '1px solid #E2E8F0',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{
                                    width: '28px', height: '28px', borderRadius: '8px',
                                    background: '#EEF2FF', color: '#4F46E5',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <History size={16} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#1E293B' }}>
                                        Historial de Consultas
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                        Registros de {effectiveUser?.nombre || effectiveUser?.usuario || 'usuario'}
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{
                                    fontSize: '0.7rem',
                                    background: '#F1F5F9',
                                    color: '#475569',
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    fontWeight: 600,
                                }}>
                                    {filteredHistory.length} {filteredHistory.length === 1 ? 'consulta' : 'consultas'}
                                </span>
                                <button
                                    onClick={fetchHistory}
                                    disabled={loadingHistory}
                                    title="Actualizar historial"
                                    style={{
                                        width: '28px', height: '28px', borderRadius: '6px',
                                        border: '1px solid #E2E8F0', background: '#FFFFFF',
                                        color: '#64748B', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                >
                                    <RefreshCw size={13} className={loadingHistory ? 'animate-spin' : ''} />
                                </button>
                                <button
                                    onClick={() => setShowHistory(false)}
                                    title="Cerrar y volver al chat"
                                    style={{
                                        width: '28px', height: '28px', borderRadius: '6px',
                                        border: '1px solid #E2E8F0', background: '#FFFFFF',
                                        color: '#64748B', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                >
                                    <X size={15} />
                                </button>
                            </div>
                        </div>

                        {/* Search input */}
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                            <input
                                type="text"
                                placeholder="Buscar en consultas o respuestas (ej: uci, junio, camas)..."
                                value={historySearch}
                                onChange={e => setHistorySearch(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '7px 12px 7px 30px',
                                    fontSize: '0.78rem',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    outline: 'none',
                                    background: '#F8FAFC',
                                    color: '#1E293B',
                                }}
                            />
                        </div>
                    </div>

                    {/* Contenido scrolleable */}
                    <div style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '12px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                    }}>
                        {loadingHistory ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', gap: '8px', color: '#64748B' }}>
                                <Loader2 size={24} className="animate-spin text-indigo-600" />
                                <span style={{ fontSize: '0.8rem' }}>Cargando consultas registradas...</span>
                            </div>
                        ) : filteredHistory.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8' }}>
                                <History size={36} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748B' }}>
                                    {historySearch ? 'No se encontraron consultas coincidentes' : 'No hay consultas registradas aún'}
                                </div>
                                <div style={{ fontSize: '0.74rem', marginTop: '4px' }}>
                                    {historySearch ? 'Probá con otra palabra clave.' : 'Cada pregunta que le hacés a Beto queda guardada para que nunca pierdas datos.'}
                                </div>
                            </div>
                        ) : (
                            filteredHistory.map((item) => {
                                const isExpanded = expandedHistoryId === item.id;
                                return (
                                    <div
                                        key={item.id}
                                        style={{
                                            background: '#FFFFFF',
                                            border: '1px solid #E2E8F0',
                                            borderRadius: '12px',
                                            padding: '12px',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '8px',
                                        }}
                                    >
                                        {/* Metadatos */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ fontWeight: 600, color: '#475569' }}>
                                                    {formatHistoryDate(item.created_at)}
                                                </span>
                                                {item.current_module && (
                                                    <span style={{
                                                        background: '#EEF2FF',
                                                        color: '#4F46E5',
                                                        padding: '1px 6px',
                                                        borderRadius: '4px',
                                                        fontWeight: 500,
                                                        fontSize: '0.67rem',
                                                    }}>
                                                        {item.current_module}
                                                    </span>
                                                )}
                                                {item.tools_used && item.tools_used.length > 0 && (
                                                    <span style={{
                                                        background: '#ECFDF5',
                                                        color: '#059669',
                                                        padding: '1px 6px',
                                                        borderRadius: '4px',
                                                        fontWeight: 500,
                                                        fontSize: '0.67rem',
                                                    }}>
                                                        🛠️ {item.tools_used.join(', ')}
                                                    </span>
                                                )}
                                            </div>
                                            {item.response_ms && (
                                                <span style={{ fontSize: '0.66rem', color: '#94A3B8' }}>
                                                    {(item.response_ms / 1000).toFixed(1)}s
                                                </span>
                                            )}
                                        </div>

                                        {/* Pregunta del usuario */}
                                        <div style={{
                                            fontSize: '0.82rem',
                                            fontWeight: 600,
                                            color: '#1E293B',
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: '6px',
                                            lineHeight: 1.4,
                                        }}>
                                            <span style={{ color: '#4F46E5', flexShrink: 0 }}>💬</span>
                                            <span>{item.user_query}</span>
                                        </div>

                                        {/* Respuesta de Beto */}
                                        {item.response_text && (
                                            <div
                                                onClick={() => setExpandedHistoryId(isExpanded ? null : item.id)}
                                                style={{
                                                    fontSize: '0.77rem',
                                                    color: '#334155',
                                                    background: '#F8FAFC',
                                                    border: '1px solid #F1F5F9',
                                                    borderRadius: '8px',
                                                    padding: '8px 10px',
                                                    lineHeight: 1.45,
                                                    cursor: 'pointer',
                                                }}
                                                title="Click para expandir o colapsar"
                                            >
                                                <div style={{
                                                    maxHeight: isExpanded ? 'none' : '65px',
                                                    overflow: 'hidden',
                                                    textOverflow: isExpanded ? 'unset' : 'ellipsis',
                                                    whiteSpace: 'pre-wrap',
                                                }}>
                                                    {item.response_text}
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px', fontSize: '0.67rem', color: '#6366F1', fontWeight: 600 }}>
                                                    {isExpanded ? 'Ver menos ▲' : 'Ver respuesta completa ▼'}
                                                </div>
                                            </div>
                                        )}

                                        {/* Botón de acción rápida: Usar en chat */}
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '2px' }}>
                                            <button
                                                onClick={() => {
                                                    setInput(item.user_query);
                                                    setShowHistory(false);
                                                    setTimeout(() => inputRef.current?.focus(), 150);
                                                }}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    background: '#F1F5F9',
                                                    border: 'none',
                                                    borderRadius: '6px',
                                                    padding: '4px 8px',
                                                    fontSize: '0.72rem',
                                                    fontWeight: 600,
                                                    color: '#475569',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s',
                                                }}
                                                onMouseOver={e => { e.currentTarget.style.background = '#EEF2FF'; e.currentTarget.style.color = '#4F46E5'; }}
                                                onMouseOut={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#475569'; }}
                                            >
                                                <ArrowUpRight size={12} />
                                                Cargar en chat
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}

            {/* Messages area */}
            <div style={{
                flex: 1, overflowY: 'auto', padding: '16px 20px',
                display: 'flex', flexDirection: 'column', gap: '12px',
            }}>
                {messages.map((msg, i) => {
                    // #2 — Parse rich content from assistant messages
                    const { text: parsedRawText, richBlocks } = msg.role === 'assistant'
                        ? parseRichContent(msg.content, onNavigate)
                        : { text: msg.content, richBlocks: [] };

                    // Sanitizar tablas rotas o tuberías para que siempre se vean limpias en chat
                    const cleanText = msg.role === 'assistant'
                        ? sanitizeChatText(parsedRawText)
                        : parsedRawText;

                    const effectiveExcelData = msg.excel_data || richBlocks.find(b => b.type === 'excel')?.data || null;
                    const isReport = isReportMessage(msg.content) || !!effectiveExcelData || /(reporte oficial|\(pdf\)|descargarlo en pdf|informe oficial)/i.test(msg.content);

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
                                    {/* Direct Excel download from API response — only if no action bar */}
                                    {msg.excel_data && !isReport && (
                                        <BetoExcelDownload excelData={msg.excel_data} />
                                    )}
                                    {/* #2 Rich blocks (text-parsed fallback) */}
                                    {richBlocks.map((block, j) => {
                                        if (block.type === 'chart') return <BetoChartCard key={j} chartData={block.data} />;
                                        if (block.type === 'stats') return <BetoStatsCard key={j} stats={block.data} />;
                                        if (block.type === 'pipeline') return <BetoStatusPipeline key={j} pipeline={block.data} />;
                                        if (block.type === 'insight') return <BetoInsightCard key={j} insight={block.data} />;
                                        if (block.type === 'modulePreview') return <BetoModulePreview key={j} moduleId={block.moduleId} onNavigate={onNavigate} />;
                                        if (block.type === 'excel' && !msg.excel_data && !isReport) return <BetoExcelDownload key={j} excelData={block.data} />;
                                        return null;
                                    })}
                                    {/* Action bar: (Pdf) y (Excel) oficiales con estilo institucional */}
                                    {isReport && (
                                        <div style={{
                                             display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginTop: '12px',
                                             paddingTop: '10px', borderTop: '1px solid rgba(0,0,0,0.08)',
                                         }}>
                                             <span style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600, marginRight: '2px' }}>
                                                 Descargar detalle:
                                             </span>
                                             <button
                                                 onClick={() => downloadBetoReportPdf(msg.content, null, effectiveExcelData)}
                                                 style={{
                                                     display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                     padding: '6px 13px', borderRadius: '8px',
                                                     border: '1px solid #BFDBFE',
                                                     background: '#EFF6FF', color: '#1D4ED8',
                                                     fontSize: '0.76rem', fontWeight: 700,
                                                     cursor: 'pointer', transition: 'all 0.15s',
                                                     boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                                 }}
                                                 onMouseOver={e => {
                                                     e.currentTarget.style.background = '#DBEAFE';
                                                     e.currentTarget.style.transform = 'translateY(-1px)';
                                                 }}
                                                 onMouseOut={e => {
                                                     e.currentTarget.style.background = '#EFF6FF';
                                                     e.currentTarget.style.transform = 'translateY(0)';
                                                 }}
                                                 title="Descargar reporte oficial en PDF con estética del Sanatorio Argentino y tipografía Montserrat"
                                             >
                                                 <FileDown size={14} />
                                                 Descargar PDF
                                             </button>

                                             <button
                                                 onClick={() => downloadBetoReportExcel(msg.content, effectiveExcelData)}
                                                 style={{
                                                     display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                     padding: '6px 13px', borderRadius: '8px',
                                                     border: '1px solid #A7F3D0',
                                                     background: '#ECFDF5', color: '#047857',
                                                     fontSize: '0.76rem', fontWeight: 700,
                                                     cursor: 'pointer', transition: 'all 0.15s',
                                                     boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                                 }}
                                                 onMouseOver={e => {
                                                     e.currentTarget.style.background = '#D1FAE5';
                                                     e.currentTarget.style.transform = 'translateY(-1px)';
                                                 }}
                                                 onMouseOut={e => {
                                                     e.currentTarget.style.background = '#ECFDF5';
                                                     e.currentTarget.style.transform = 'translateY(0)';
                                                 }}
                                                 title="Descargar planilla de cálculo en Excel (.xlsx)"
                                             >
                                                 <FileSpreadsheet size={14} />
                                                 Descargar Excel
                                             </button>

                                            <button
                                                onClick={() => {
                                                    const printW = window.open('', '_blank');
                                                    printW.document.write(`<html><head><title>Reporte Beto</title><style>body{font-family:'Montserrat',system-ui,sans-serif;padding:40px;max-width:800px;margin:0 auto;color:#1E293B}table{border-collapse:collapse;width:100%}th,td{border:1px solid #E2E8F0;padding:6px 10px;text-align:left;font-size:13px}th{background:#0D3B66;color:#fff}tr:nth-child(even){background:#F8FAFC}h1,h2,h3{color:#0D3B66}@media print{body{padding:20px}}</style></head><body>${document.querySelector('.beto-markdown')?.innerHTML || cleanText}</body></html>`);
                                                    printW.document.close();
                                                    printW.print();
                                                }}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                                                    padding: '6px 10px', borderRadius: '8px',
                                                    border: '1px solid #E2E8F0',
                                                    background: '#FFFFFF',
                                                    color: '#64748B',
                                                    fontSize: '0.72rem', fontWeight: 500,
                                                    cursor: 'pointer', transition: 'all 0.15s',
                                                }}
                                                onMouseOver={e => e.currentTarget.style.background = '#F1F5F9'}
                                                onMouseOut={e => e.currentTarget.style.background = '#FFFFFF'}
                                                title="Imprimir listado"
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
