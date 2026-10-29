/**
 * BetoClickyCompanion.jsx — Compañero IA estilo "HeyClicky" para toda la plataforma (excepto Kiosco)
 *
 * Filosofía UX (Inspirada en HeyClicky):
 *  1. 100% No Invasivo: Vive discreto en la esquina inferior derecha y se activa bajo demanda con `Alt + Espacio` o 1 clic.
 *  2. Screen-Aware (Visión del DOM en vivo): Escanea en tiempo real los botones, filtros, KPIs, tablas y menús visibles en pantalla.
 *  3. Puntero Viajero Animado + Halo Spotlight: En vez de abrir un chat gigante que tapa el dashboard, el cursor de Beto
 *     viaja suavemente por la pantalla hasta el botón, KPI o tabla exacta, lo ilumina con un halo luminoso y muestra una
 *     burbuja compacta junto al puntero mientras te responde con voz.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Send, X, Volume2, VolumeX, Sparkles, MessageSquare, MousePointer, CornerDownLeft, Loader2, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { buildUnifiedBetoContext } from '../utils/betoContextSync';

const BETO_AVATAR = '/beto.jpg';

/**
 * Escanea los elementos relevantes y visibles actualmente en el DOM (botones, filtros, KPIs, títulos, tablas, navegación)
 * y les asigna un identificador `data-beto-clicky-id` para poder viajar hacia ellos.
 */
function scanVisibleScreenElements() {
    const candidates = [];
    const selectors = [
        'button:not([disabled])',
        '[role="tab"]',
        'select',
        'input[type="text"], input[type="search"], input[type="date"]',
        'h1, h2, h3, h4',
        'th',
        '.sidebar__item',
        '[data-kpi]',
        '.card, .stat-card, .kpi-card'
    ];

    const seenRects = [];
    let counter = 1;

    try {
        const nodes = document.querySelectorAll(selectors.join(', '));
        nodes.forEach((node) => {
            // Ignorar elementos del propio BetoClicky o BetoWidget
            if (node.closest('#beto-clicky-root') || node.closest('#beto-chat-panel') || node.closest('#beto-fab')) {
                return;
            }

            const rect = node.getBoundingClientRect();
            if (rect.width < 24 || rect.height < 18) return;
            if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
                return;
            }

            const style = window.getComputedStyle(node);
            if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.15) {
                return;
            }

            const rawText = (node.innerText || node.getAttribute('aria-label') || node.getAttribute('title') || node.getAttribute('placeholder') || '')
                .replace(/\s+/g, ' ')
                .trim();

            if (!rawText || rawText.length < 2 || rawText.length > 220) return;

            // Evitar duplicados superpuestos exactos
            const isDuplicate = seenRects.some(r =>
                Math.abs(r.left - rect.left) < 10 &&
                Math.abs(r.top - rect.top) < 10 &&
                r.text === rawText
            );
            if (isDuplicate) return;

            const id = `clicky-el-${counter++}`;
            node.setAttribute('data-beto-clicky-id', id);

            const tag = node.tagName.toLowerCase();
            const isClickable = tag === 'button' || tag === 'a' || tag === 'select' || node.getAttribute('role') === 'tab' || node.classList.contains('sidebar__item');

            seenRects.push({ left: rect.left, top: rect.top, text: rawText });
            candidates.push({
                id,
                tag,
                isClickable,
                text: rawText.slice(0, 140),
                rect: {
                    left: Math.round(rect.left),
                    top: Math.round(rect.top),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                }
            });
        });
    } catch (e) {
        console.warn('[BetoClicky] Error scanning DOM:', e);
    }

    return candidates.slice(0, 85);
}

/**
 * Encuentra el mejor elemento del DOM en caso de que la IA no devuelva un ID explícito o para respuesta instantánea
 */
function findBestDomMatch(query, responseText, elements) {
    if (!elements || elements.length === 0) return null;
    const combined = `${query} ${responseText || ''}`.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const stopWords = new Set([
        'donde', 'como', 'para', 'este', 'esta', 'estos', 'estas', 'cual', 'cuales',
        'que', 'significa', 'mostrame', 'mostrar', 'ver', 'quiero', 'puedo', 'hacer',
        'clic', 'boton', 'pantalla', 'beto', 'explicame', 'explica', 'numero', 'datos',
        'del', 'las', 'los', 'una', 'uno', 'con', 'por', 'sobre', 'tiene', 'hay'
    ]);

    const keywords = combined
        .split(/[^a-z0-9$%]+/)
        .filter(w => w.length >= 3 && !stopWords.has(w));

    if (keywords.length === 0) return null;

    let bestEl = null;
    let bestScore = 0;

    for (const el of elements) {
        const elNorm = el.text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        let score = 0;
        for (const kw of keywords) {
            if (elNorm.includes(kw)) {
                score += kw.length >= 5 ? 3 : 1.5;
            }
        }
        // Bonus si el usuario pregunta "dónde" / "botón" / "exportar" / "descargar" y el elemento es clickeable
        if (score > 0 && el.isClickable && /donde|boton|export|descarg|filtr|cambi|ir|abrir|excel|pdf/.test(combined)) {
            score += 2.5;
        }
        if (score > bestScore) {
            bestScore = score;
            bestEl = el;
        }
    }

    return bestScore >= 2 ? bestEl : null;
}

export default function BetoClickyCompanion({
    currentUser,
    currentModule,
    onNavigate,
    onOpenFullChat,
}) {
    const [isBarOpen, setIsBarOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [voiceEnabled, setVoiceEnabled] = useState(true);

    // Estado del puntero viajero y elemento señalado
    const [pointerState, setPointerState] = useState(null);
    // pointerState = { targetId, rect, answer, isClickable, label, x, y }

    const inputRef = useRef(null);
    const recognitionRef = useRef(null);

    const speakText = useCallback((text) => {
        if (!voiceEnabled || !text) return;
        try {
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                const clean = text
                    .replace(/[*#_`~>\-[\]]/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                const utterance = new SpeechSynthesisUtterance(clean);
                utterance.lang = 'es-AR';
                utterance.rate = 1.02;
                window.speechSynthesis.speak(utterance);
            }
        } catch (_) {}
    }, [voiceEnabled]);

    const stopSpeech = useCallback(() => {
        try {
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        } catch (_) {}
    }, []);

    // Actualizar coordenadas del elemento iluminado si el usuario hace scroll o resize
    useEffect(() => {
        if (!pointerState?.targetId) return;
        const updateRect = () => {
            const node = document.querySelector(`[data-beto-clicky-id="${pointerState.targetId}"]`);
            if (node) {
                const r = node.getBoundingClientRect();
                setPointerState(prev => prev ? ({
                    ...prev,
                    rect: {
                        left: Math.round(r.left),
                        top: Math.round(r.top),
                        width: Math.round(r.width),
                        height: Math.round(r.height),
                    },
                    x: Math.round(r.left + Math.min(r.width * 0.65, 140)),
                    y: Math.round(r.top + Math.min(r.height * 0.65, 36)),
                }) : null);
            }
        };
        window.addEventListener('scroll', updateRect, true);
        window.addEventListener('resize', updateRect);
        return () => {
            window.removeEventListener('scroll', updateRect, true);
            window.removeEventListener('resize', updateRect);
        };
    }, [pointerState?.targetId]);

    // Atajo global Alt + B (o Ctrl + Espacio) para invocar a Beto Clicky sin disparar el menú de ventana de Windows (Alt+Space)
    useEffect(() => {
        const handleKeyDown = (e) => {
            const isAltB = e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyB' || e.key?.toLowerCase() === 'b');
            const isCtrlSpace = e.ctrlKey && !e.altKey && e.code === 'Space';
            if (isAltB || isCtrlSpace) {
                e.preventDefault();
                e.stopPropagation();
                setIsBarOpen(prev => {
                    const next = !prev;
                    if (next) {
                        setTimeout(() => inputRef.current?.focus(), 60);
                    } else {
                        stopSpeech();
                    }
                    return next;
                });
            } else if (e.key === 'Escape') {
                if (pointerState) {
                    setPointerState(null);
                    stopSpeech();
                } else if (isBarOpen) {
                    setIsBarOpen(false);
                    stopSpeech();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [isBarOpen, pointerState, stopSpeech]);

    // Cerrar puntero al cambiar de módulo
    useEffect(() => {
        setPointerState(null);
        stopSpeech();
    }, [currentModule, stopSpeech]);

    // Ejecutar consulta Screen-Aware y mover el puntero de Beto
    const executeClickyQuery = useCallback(async (rawQuestion) => {
        const q = (rawQuestion || query || '').trim();
        if (!q || isThinking) return;

        setIsThinking(true);
        stopSpeech();

        // 1. Escanear los elementos visibles en pantalla en este instante
        const domElements = scanVisibleScreenElements();
        const domCatalogSummary = domElements
            .slice(0, 50)
            .map(el => `[ID:${el.id}] (${el.isClickable ? 'BOTÓN/FILTRO' : 'DATO/KPI'}) "${el.text}"`)
            .join('\n');

        try {
            const supabaseUrl = supabase.supabaseUrl || import.meta.env.VITE_SUPABASE_URL;
            const supabaseKey = supabase.supabaseKey || import.meta.env.VITE_SUPABASE_ANON_KEY;
            const { data: { session } } = await supabase.auth.getSession();
            const authToken = session?.access_token || supabaseKey;

            const unifiedContext = buildUnifiedBetoContext(currentModule || 'inicio');
            const computedModuleContext = {
                ...unifiedContext,
                quirofano_gobernanza: (typeof window !== 'undefined' && window.__quirofano_active_context) || null,
                dxi_gobernanza: (typeof window !== 'undefined' && window.__dxi_active_context) || null,
                indicadores_gobernanza: (typeof window !== 'undefined' && window.__indicadores_active_context) || null,
            };

            const clickySystemInstruction = `MODO BETO CLICKY (GUÍA VISUAL EN PANTALLA ESTILO HEYCLICKY):
El usuario te está consultando en vivo mientras mira la pantalla del módulo "${currentModule || 'inicio'}".
Tu objetivo es:
1. Responder en MÁXIMO 2 ORACIONES CORTAS, directas, cálidas y precisas (con el dato exacto o la indicación visual).
2. Elegir el elemento exacto de la lista de ELEMENTOS VISIBLES EN PANTALLA hacia donde debe viajar tu cursor animado e incluir al final la etiqueta: [POINT:clicky-el-X]
3. Si el usuario pide cambiar a otro módulo (ej: cirugias, deudas, gobernanza_indicadores, facturacion, turnos, contact_center), incluí también [ACTION:navigate:nombre_modulo].

ELEMENTOS VISIBLES AHORA MISMO EN LA PANTALLA DEL USUARIO:
${domCatalogSummary || '(Sin elementos específicos detectados)'}

PREGUNTA DEL USUARIO: "${q}"`;

            const response = await fetch(`${supabaseUrl}/functions/v1/beto-assistant`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    'apikey': supabaseKey,
                },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: clickySystemInstruction }],
                    user: currentUser ? { nombre: currentUser.nombre, usuario: currentUser.usuario } : null,
                    currentModule: currentModule || 'inicio',
                    moduleContext: computedModuleContext,
                    stream: false,
                }),
            });

            let rawAnswer = '';
            if (response.ok) {
                const contentType = response.headers.get('content-type') || '';
                if (contentType.includes('text/event-stream')) {
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
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
                                    if (parsed.content) rawAnswer += parsed.content;
                                    if (parsed.message) rawAnswer = parsed.message;
                                } catch (_) {}
                            }
                        }
                    }
                } else {
                    const data = await response.json();
                    rawAnswer = data?.message || '';
                }
            }

            // Extraer [POINT:clicky-el-X] y [ACTION:navigate:...]
            const pointMatch = rawAnswer.match(/\[POINT:(clicky-el-\d+)\]/i);
            const navMatch = rawAnswer.match(/\[ACTION:navigate:(\w+)\]/i);

            let cleanAnswer = rawAnswer
                .replace(/\[POINT:[^\]]+\]/gi, '')
                .replace(/\[ACTION:[^\]]+\]/gi, '')
                .trim();

            // Si la respuesta es demasiado larga, resumir a las primeras 2-3 oraciones para la burbuja flotante
            const sentences = cleanAnswer.split(/(?<=[.!?])\s+/);
            if (sentences.length > 3) {
                cleanAnswer = sentences.slice(0, 3).join(' ');
            }

            // Determinar el elemento objetivo en el DOM
            let matchedElement = null;
            if (pointMatch && pointMatch[1]) {
                matchedElement = domElements.find(el => el.id === pointMatch[1]) || null;
            }
            if (!matchedElement) {
                matchedElement = findBestDomMatch(q, cleanAnswer, domElements);
            }

            if (matchedElement) {
                const liveNode = document.querySelector(`[data-beto-clicky-id="${matchedElement.id}"]`);
                let finalRect = matchedElement.rect;
                if (liveNode) {
                    const r = liveNode.getBoundingClientRect();
                    finalRect = {
                        left: Math.round(r.left),
                        top: Math.round(r.top),
                        width: Math.round(r.width),
                        height: Math.round(r.height),
                    };
                }

                setPointerState({
                    targetId: matchedElement.id,
                    rect: finalRect,
                    answer: cleanAnswer || `Acá tenés "${matchedElement.text}".`,
                    isClickable: matchedElement.isClickable,
                    label: matchedElement.text,
                    x: Math.round(finalRect.left + Math.min(finalRect.width * 0.65, 140)),
                    y: Math.round(finalRect.top + Math.min(finalRect.height * 0.65, 36)),
                });
            } else {
                // Si no hay un elemento puntual que señalar, mostrar la respuesta en el centro-derecha superior del puntero
                setPointerState({
                    targetId: null,
                    rect: null,
                    answer: cleanAnswer || 'Listo, revisá los datos en pantalla.',
                    isClickable: false,
                    label: null,
                    x: Math.round(window.innerWidth - 380),
                    y: Math.round(window.innerHeight - 180),
                });
            }

            if (cleanAnswer) {
                speakText(cleanAnswer);
            }

            if (navMatch && onNavigate) {
                setTimeout(() => onNavigate(navMatch[1]), 1200);
            }

            setQuery('');
        } catch (err) {
            console.error('[BetoClicky] Error:', err);
            const fallbackEl = findBestDomMatch(q, '', domElements);
            if (fallbackEl) {
                setPointerState({
                    targetId: fallbackEl.id,
                    rect: fallbackEl.rect,
                    answer: `Te señalo en pantalla: "${fallbackEl.text}".`,
                    isClickable: fallbackEl.isClickable,
                    label: fallbackEl.text,
                    x: Math.round(fallbackEl.rect.left + Math.min(fallbackEl.rect.width * 0.6, 120)),
                    y: Math.round(fallbackEl.rect.top + Math.min(fallbackEl.rect.height * 0.6, 32)),
                });
                speakText(`Te señalo en pantalla ${fallbackEl.text}`);
            }
        } finally {
            setIsThinking(false);
        }
    }, [query, isThinking, currentModule, currentUser, onNavigate, speakText, stopSpeech]);

    // Reconocimiento de voz directo en 1 clic (Push-to-Talk)
    const toggleVoiceListening = useCallback(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setIsBarOpen(true);
            setTimeout(() => inputRef.current?.focus(), 60);
            return;
        }

        if (isListening && recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (_) {}
            setIsListening(false);
            return;
        }

        stopSpeech();
        setIsBarOpen(true);
        const recognition = new SpeechRecognition();
        recognition.lang = 'es-AR';
        recognition.continuous = false;
        recognition.interimResults = true;

        let transcriptAccum = '';

        recognition.onstart = () => {
            setIsListening(true);
        };

        recognition.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const t = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    transcriptAccum += t + ' ';
                } else {
                    interim += t;
                }
            }
            setQuery((transcriptAccum + interim).trim());
        };

        recognition.onerror = () => {
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
            const finalQ = transcriptAccum.trim();
            if (finalQ) {
                executeClickyQuery(finalQ);
            }
        };

        recognitionRef.current = recognition;
        recognition.start();
    }, [isListening, executeClickyQuery, stopSpeech]);

    // Ejecutar clic real sobre el elemento señalado si el usuario lo pide desde la burbuja
    const handleTriggerTargetClick = useCallback(() => {
        if (!pointerState?.targetId) return;
        const node = document.querySelector(`[data-beto-clicky-id="${pointerState.targetId}"]`);
        if (node) {
            node.click();
            node.focus?.();
            setPointerState(null);
            stopSpeech();
        }
    }, [pointerState, stopSpeech]);

    // Calcular posición segura de la burbuja junto al puntero para que nunca se salga de la pantalla
    const getBubblePosition = () => {
        if (!pointerState) return { left: 0, top: 0 };
        const bubbleW = 340;
        const bubbleH = 150;
        let left = pointerState.x + 28;
        let top = pointerState.y - 12;

        if (left + bubbleW > window.innerWidth - 16) {
            left = Math.max(16, pointerState.x - bubbleW - 18);
        }
        if (top + bubbleH > window.innerHeight - 16) {
            top = Math.max(16, window.innerHeight - bubbleH - 24);
        }
        if (top < 16) top = 16;

        return { left, top };
    };

    const bubblePos = getBubblePosition();

    return (
        <div id="beto-clicky-root" className="no-print">
            {/* ═══ 1. HALO LUMINOSO SPOTLIGHT SOBRE EL ELEMENTO DEL DOM SEÑALADO ═══ */}
            {pointerState?.rect && (
                <div
                    onClick={() => { setPointerState(null); stopSpeech(); }}
                    style={{
                        position: 'fixed',
                        left: `${pointerState.rect.left - 6}px`,
                        top: `${pointerState.rect.top - 6}px`,
                        width: `${pointerState.rect.width + 12}px`,
                        height: `${pointerState.rect.height + 12}px`,
                        borderRadius: '12px',
                        border: '2.5px solid #2563EB',
                        boxShadow: '0 0 0 6px rgba(37, 99, 235, 0.22), 0 0 28px rgba(37, 99, 235, 0.45)',
                        pointerEvents: 'none',
                        zIndex: 99990,
                        transition: 'all 0.55s cubic-bezier(0.22, 1, 0.36, 1)',
                        animation: 'betoClickyHaloPulse 1.6s infinite',
                    }}
                />
            )}

            {/* ═══ 2. PUNTERO VIAJERO DE BETO + BURBUJA COMPACTA (ESTILO HEYCLICKY) ═══ */}
            {pointerState && (
                <>
                    {/* Cursor animado de Beto que viaja hacia el elemento */}
                    <div
                        style={{
                            position: 'fixed',
                            left: `${pointerState.x}px`,
                            top: `${pointerState.y}px`,
                            zIndex: 99995,
                            pointerEvents: 'none',
                            transition: 'left 0.65s cubic-bezier(0.22, 1, 0.36, 1), top 0.65s cubic-bezier(0.22, 1, 0.36, 1)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            filter: 'drop-shadow(0 6px 16px rgba(13, 59, 102, 0.38))',
                        }}
                    >
                        {/* Flecha de cursor azul institucional */}
                        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" style={{ transform: 'rotate(-8deg)', animation: 'betoPointerFloat 1.5s ease-in-out infinite' }}>
                            <path
                                d="M4 3L11.5 20L14.2 13.2L21 10.5L4 3Z"
                                fill="#1565C0"
                                stroke="#FFFFFF"
                                strokeWidth="2.2"
                                strokeLinejoin="round"
                            />
                        </svg>
                        {/* Mini Avatar Circular pegado al cursor */}
                        <img
                            src={BETO_AVATAR}
                            alt="Beto"
                            style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                objectFit: 'cover',
                                objectPosition: 'top',
                                border: '2px solid #FFFFFF',
                                boxShadow: '0 2px 8px rgba(13,59,102,0.35)',
                                marginLeft: '-6px',
                                marginTop: '10px',
                            }}
                        />
                    </div>

                    {/* Burbuja de Respuesta Compacta al lado del cursor */}
                    <div
                        style={{
                            position: 'fixed',
                            left: `${bubblePos.left}px`,
                            top: `${bubblePos.top}px`,
                            width: '336px',
                            maxWidth: 'calc(100vw - 32px)',
                            background: 'rgba(15, 23, 42, 0.96)',
                            backdropFilter: 'blur(12px)',
                            color: '#F8FAFC',
                            borderRadius: '16px',
                            padding: '14px 16px',
                            boxShadow: '0 16px 40px rgba(15, 23, 42, 0.38), 0 0 0 1px rgba(148, 163, 184, 0.22)',
                            zIndex: 99996,
                            transition: 'left 0.65s cubic-bezier(0.22, 1, 0.36, 1), top 0.65s cubic-bezier(0.22, 1, 0.36, 1)',
                            fontFamily: "'Inter', system-ui, sans-serif",
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{
                                    width: '7px', height: '7px', borderRadius: '50%',
                                    background: '#38BDF8', display: 'inline-block',
                                }} />
                                <span style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.6px', color: '#93C5FD', textTransform: 'uppercase' }}>
                                    Beto Guía Visual
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => { setPointerState(null); stopSpeech(); }}
                                title="Cerrar (Esc)"
                                style={{
                                    background: 'rgba(255,255,255,0.1)', border: 'none', color: '#CBD5E1',
                                    width: '22px', height: '22px', borderRadius: '6px', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                            >
                                <X size={13} />
                            </button>
                        </div>

                        <div style={{ fontSize: '0.88rem', lineHeight: 1.45, color: '#F1F5F9', fontWeight: 500, marginBottom: '10px' }}>
                            {pointerState.answer}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            {pointerState.isClickable && pointerState.targetId && (
                                <button
                                    type="button"
                                    onClick={handleTriggerTargetClick}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '8px',
                                        background: '#2563EB',
                                        color: '#FFFFFF',
                                        border: 'none',
                                        fontSize: '0.76rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                    }}
                                >
                                    <MousePointer size={12} /> Hacer clic aquí
                                </button>
                            )}
                            {onOpenFullChat && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPointerState(null);
                                        stopSpeech();
                                        onOpenFullChat();
                                    }}
                                    style={{
                                        padding: '6px 10px',
                                        borderRadius: '8px',
                                        background: 'rgba(255,255,255,0.1)',
                                        color: '#E2E8F0',
                                        border: '1px solid rgba(255,255,255,0.15)',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                    }}
                                >
                                    <ExternalLink size={12} /> Abrir Chat Completo
                                </button>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* ═══ 3. MINI BARRA FLOTANTE DISCRETA EN ESQUINA INFERIOR DERECHA (ALT + ESPACIO) ═══ */}
            <div
                style={{
                    position: 'fixed',
                    right: '74px',
                    bottom: '18px',
                    zIndex: 99985,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontFamily: "'Inter', system-ui, sans-serif",
                }}
            >
                {isBarOpen ? (
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            executeClickyQuery(query);
                        }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'rgba(15, 23, 42, 0.95)',
                            backdropFilter: 'blur(12px)',
                            border: '1.5px solid rgba(59, 130, 246, 0.45)',
                            borderRadius: '999px',
                            padding: '6px 10px 6px 12px',
                            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.28)',
                            width: '370px',
                            maxWidth: 'calc(100vw - 96px)',
                            animation: 'betoClickyFadeIn 0.18s ease-out',
                        }}
                    >
                        <button
                            type="button"
                            onClick={toggleVoiceListening}
                            title={isListening ? 'Detener micrófono' : 'Hablarle a Beto'}
                            style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                border: 'none',
                                background: isListening ? '#EF4444' : 'rgba(59, 130, 246, 0.2)',
                                color: isListening ? '#FFFFFF' : '#60A5FA',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                flexShrink: 0,
                                animation: isListening ? 'betoClickyHaloPulse 1.2s infinite' : 'none',
                            }}
                        >
                            {isListening ? <MicOff size={15} /> : <Mic size={15} />}
                        </button>

                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={isListening ? 'Escuchando tu voz...' : 'Preguntale qué señalar en pantalla...'}
                            style={{
                                flex: 1,
                                background: 'transparent',
                                border: 'none',
                                outline: 'none',
                                color: '#F8FAFC',
                                fontSize: '0.84rem',
                                fontWeight: 500,
                                minWidth: 0,
                            }}
                        />

                        <button
                            type="button"
                            onClick={() => {
                                setVoiceEnabled(v => !v);
                                if (voiceEnabled) stopSpeech();
                            }}
                            title={voiceEnabled ? 'Voz activada' : 'Voz silenciada'}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: voiceEnabled ? '#93C5FD' : '#64748B',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                            }}
                        >
                            {voiceEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
                        </button>

                        <button
                            type="submit"
                            disabled={isThinking || !query.trim()}
                            style={{
                                width: '30px',
                                height: '30px',
                                borderRadius: '50%',
                                border: 'none',
                                background: query.trim() ? '#2563EB' : 'rgba(255,255,255,0.08)',
                                color: '#FFFFFF',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: query.trim() ? 'pointer' : 'default',
                                flexShrink: 0,
                            }}
                        >
                            {isThinking ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CornerDownLeft size={14} />}
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setIsBarOpen(false);
                                setPointerState(null);
                                stopSpeech();
                            }}
                            title="Cerrar (Esc)"
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#94A3B8',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                            }}
                        >
                            <X size={15} />
                        </button>
                    </form>
                ) : null}
            </div>

            <style>{`
                @keyframes betoClickyHaloPulse {
                    0%, 100% {
                        box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.28), 0 0 24px rgba(37, 99, 235, 0.45);
                    }
                    50% {
                        box-shadow: 0 0 0 9px rgba(37, 99, 235, 0.08), 0 0 34px rgba(37, 99, 235, 0.65);
                    }
                }
                @keyframes betoPointerFloat {
                    0%, 100% { transform: rotate(-8deg) translate(0, 0); }
                    50% { transform: rotate(-8deg) translate(-3px, -4px); }
                }
                @keyframes betoClickyFadeIn {
                    from { opacity: 0; transform: translateY(6px) scale(0.97); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </div>
    );
}

