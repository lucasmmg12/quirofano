/**
 * BetoWidget — Núcleo Clínico y Asistente AI Multimodal del Sanatorio Argentino
 *
 * Estética: Futurista y Clínica priorizando el Azul Oscuro Institucional (#071E36 / #0D3B66)
 * Capacidades:
 *  - Consulta universal desde todos los módulos de la plataforma (FAB + Sidebar + Ctrl+K)
 *  - Sincronización 1:1 en tiempo real con todos los Dashboards de Gobernanza (UCI, Guardia, Quirófano, DxI, Epidemiología y 29 Sectores)
 *  - Comprensión Multimodal: Grabación de Voz en vivo, Audios (.mp3/.wav/.ogg/.m4a), Imágenes (.png/.jpg/.webp), Word (.docx), Excel (.xlsx/.csv) y PDF (.pdf)
 *  - Exportación Universal en 1 clic a PDF Oficial (tipografía limpia y segura) y Excel (.xlsx)
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
    Send, X, Maximize2, Minimize2, Sparkles, Loader2, Palette,
    FileSpreadsheet, Printer, FileDown, ThumbsUp, ThumbsDown,
    Share2, History, RefreshCw, Search, ArrowUpRight,
    Paperclip, Mic, Square, Image as ImageIcon, FileText, Volume2, Activity, ShieldCheck
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import {
    BetoStatsCard, BetoStatusPipeline, BetoModulePreview,
    BetoInsightCard, BetoExcelDownload, parseRichContent
} from './BetoComponents';
import BetoChartCard from './BetoChartCard';
import BetoPresentationMode from './BetoPresentationMode';
import BetoTutorial from './BetoTutorial';
import { downloadBetoReportPdf, downloadBetoReportExcel, isReportMessage } from '../utils/betoReportPdf';
import { buildUnifiedBetoContext } from '../utils/betoContextSync';
import { parseAttachedFile, transcribeAudioBlob } from '../utils/betoMultimodalParser';
import { generateShare } from '../api/shareClient';
import { useTelarStore } from '../store/telarStore';
import { getCurrentUser } from '../services/authService';

const BETO_AVATAR = '/beto.jpg';
const BETO_GIF = '/The_avatar_is_greetings.gif';

// #1 — Sugerencias inteligentes contextualizadas por módulo y Gobernanza
const SMART_SUGGESTIONS = {
    inicio: [
        '📊 Resumen ejecutivo de Gobernanza (5 Servicios)',
        '🔔 ¿Qué hay pendiente hoy en el Sanatorio?',
        '🗺️ Estado del Proyecto de Gobernanza (29 Sectores)',
        '📥 Generar reporte general en PDF y Excel'
    ],
    cirugias: [
        '📊 Estado de cirugías programadas y realizadas',
        '🔴 Auditoría de suspensiones (Catálogo 1 al 13)',
        '🏥 Comparativa Quirófano Central vs Hospital de Día',
        '📥 Exportar cirugías a Excel'
    ],
    deudas: [
        '💰 Top 10 deudores',
        '📋 Pacientes sin contactar',
        '📥 Exportar deudas a Excel',
        '📊 Resumen de deudas por cobertura'
    ],
    mensajeria: [
        '📨 Mensajes sin responder',
        '📊 Resumen de conversaciones',
        '📋 Plantillas más usadas',
        '🔔 Pendientes de hoy'
    ],
    pedidos: [
        '📋 Últimos pedidos generados',
        '📊 Prácticas más solicitadas',
        '🔍 Buscar paciente',
        '📚 Ver nomenclador'
    ],
    altas: [
        '📋 Altas pendientes de hoy',
        '📊 Resumen de altas por analista',
        '👤 Buscar paciente internado',
        '📥 Exportar altas a Excel'
    ],
    turnos: [
        '📊 Cola de turnos actual',
        '⏰ Próximos turnos',
        '📈 Estadísticas de espera',
        '🔔 Turnos demorados'
    ],
    metricas: [
        '📊 Resumen mensual',
        '📈 Comparar con mes anterior',
        '🏥 Métricas por especialidad',
        '📥 Exportar métricas a Excel'
    ],
    auditoria_historias: [
        '📊 ¿Cómo auditar historias clínicas?',
        '📋 Explicar pipeline de auditoría',
        '💡 ¿Qué significa Sin Fecha de Alta?',
        '🧭 Llevame a Gobernanza'
    ],
    facturacion: [
        '🧾 Fichas en proceso y facturadas del mes',
        '👩‍💼 Carga de trabajo por responsable de facturación',
        '🔙 Fichas devueltas a Control de Altas',
        '📥 Exportar estado de facturación a Excel'
    ],
    gobernanza: [
        '🗺️ ¿Cómo avanzamos con los 29 sectores (Pamela, Matías y Lucas)?',
        '🏛️ Resumen del Informe Técnico y Contable (Gobierno SJ)',
        '🏥 ¿Qué hicimos en los 5 servicios activos de Gobernanza?',
        '🔬 Resumen de Diagnóstico por Imágenes (7.438 estudios)',
        '🦠 Vigilancia Epidemiológica Planilla C2 (Dr. Romano)',
        '🚑 Curva de espera y Outliers en Guardia Clínica'
    ],
    gobernanza_indicadores: [
        '📊 Explicame los números exactos que veo en pantalla',
        '🛏️ Ocupación y mortalidad en las 16 camas de UCI',
        '🚑 Guardia Clínica: Espera <=30m, Outliers y Conversión Qx',
        '🔪 Quirófano Central y HdD: Ocupación y Suspensiones',
        '🔬 Diagnóstico por Imágenes: 5 modalidades y depuración TC',
        '🦠 Epidemiología SNVS Planilla C2 y Neurocirugía',
        '📥 Exportar reporte del dashboard actual en PDF/Excel'
    ],
    default: [
        '📊 Resumen de los 5 Dashboards de Gobernanza',
        '🗺️ Estado del Proyecto de Gobernanza (29 Sectores)',
        '📥 Generar reporte exportable en PDF/Excel',
        '❓ ¿Qué archivos o audios te puedo enviar?'
    ],
};

const PROACTIVE_NUDGES = {
    cirugias: [
        '📋 ¿Querés que revise las cirugías y suspensiones del período?',
        '📊 Te armo un reporte quirúrgico exportable a PDF/Excel',
    ],
    deudas: [
        '💰 ¿Necesitás un reporte de deudas pendientes en Excel?',
        '📊 ¿Querés ver el top 10 de deudores?',
    ],
    altas: [
        '🏥 ¿Querés ver las altas administrativas del período?',
        '📋 Puedo armar un resumen exportable de altas',
    ],
    facturacion: [
        '🧾 ¿Querés auditar las fichas traspasadas y facturadas?',
        '📊 Puedo armarte una tabla por analista en PDF o Excel',
    ],
    gobernanza: [
        '🗺️ ¿Revisamos la hoja de ruta de los 29 sectores de Gobernanza?',
        '📄 Podés adjuntarme cualquier PDF, Word, Excel, imagen o audio para analizarlo',
    ],
    gobernanza_indicadores: [
        '🎯 Estoy sincronizado 1:1 con los números de tu pantalla en el Telar',
        '📥 Pedime cualquier cruce de UCI, Guardia, Quirófano, Imágenes o Epidemiología y descargalo en PDF/Excel',
    ],
    default: [
        '🎙️ Podés hablarme por micrófono o enviarme PDFs, Word, Excel e imágenes',
        '📊 Estoy conectado en vivo con todos los módulos y Gobernanza de Datos',
    ],
};

const TIME_NUDGES = {
    morning: ['☀️ ¡Buen día! Núcleo Clínico Beto sincronizado y listo.'],
    afternoon: ['⚡ ¿Te armo un reporte oficial en PDF o Excel de tu sector?'],
    evening: ['🌙 Último tramo del día — ¿exportamos el cierre de indicadores?'],
};

// #10 — Paletas Institucionales (Priorizando Azul Oscuro Futurista y Clínico del Sanatorio Argentino)
const THEMES = {
    sanatorio_futurista: {
        name: 'Azul Sanatorio Futurista (Oficial)',
        bg: '#F2F6FB',
        bubble: '#FFFFFF',
        accent: '#0D3B66',
        cyan: '#38BDF8',
        headerBg: 'linear-gradient(135deg, #041222 0%, #071E36 40%, #0D3B66 80%, #155E95 100%)',
        gradient: 'linear-gradient(135deg, #071E36 0%, #0D3B66 60%, #1D4ED8 100%)',
        hudBg: 'linear-gradient(90deg, #06182C 0%, #0A2540 50%, #0D3B66 100%)',
    },
    clinical_navy: {
        name: 'Clínico Quirúrgico Navy',
        bg: '#F8FAFC',
        bubble: '#FFFFFF',
        accent: '#0A2540',
        cyan: '#0EA5E9',
        headerBg: 'linear-gradient(135deg, #061629 0%, #0A2540 55%, #0284C7 100%)',
        gradient: 'linear-gradient(135deg, #0A2540 0%, #0D3B66 55%, #0284C7 100%)',
        hudBg: 'linear-gradient(90deg, #071A30 0%, #0D3B66 100%)',
    },
    dark: {
        name: 'Nocturno HUD Profundo',
        bg: '#071324',
        bubble: '#0D213B',
        accent: '#38BDF8',
        cyan: '#38BDF8',
        headerBg: 'linear-gradient(135deg, #020813 0%, #071A33 55%, #0D3B66 100%)',
        gradient: 'linear-gradient(135deg, #0D3B66 0%, #1D4ED8 60%, #0284C7 100%)',
        hudBg: 'linear-gradient(90deg, #040D1A 0%, #091D36 100%)',
    }
};

function sanitizeChatText(text) {
    if (!text) return '';
    let result = text;
    result = result.replace(/\|{2,}/g, '\n');

    if (result.includes('|') && result.includes('---')) {
        const lines = result.split('\n');
        let inTable = false;
        const newLines = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('|')) {
                if (trimmed.includes('---')) continue;
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

export default function BetoWidget({
    currentUser,
    currentModule,
    onNavigate,
    hideFab = false,
    externalOpen = false,
    onExternalClose
}) {
    const effectiveUser = currentUser || getCurrentUser();
    const [isOpen, setIsOpen] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showGreeting, setShowGreeting] = useState(false);
    const [hasNewMessage, setHasNewMessage] = useState(false);

    // Tema predeterminado: Azul Oscuro Institucional Futurista y Clínico del Sanatorio Argentino
    const [theme, setTheme] = useState(() => {
        const saved = localStorage.getItem('beto_theme_v3');
        return saved && THEMES[saved] ? saved : 'sanatorio_futurista';
    });
    const [showThemes, setShowThemes] = useState(false);

    // Historial de consultas previas
    const [showHistory, setShowHistory] = useState(false);
    const [historyItems, setHistoryItems] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [historySearch, setHistorySearch] = useState('');
    const [expandedHistoryId, setExpandedHistoryId] = useState(null);

    // Modos especiales
    const [presentationSlides, setPresentationSlides] = useState(null);
    const [tutorialId, setTutorialId] = useState(null);
    const [streamingText, setStreamingText] = useState('');
    const [isSharing, setIsSharing] = useState(false);
    const [shareUrl, setShareUrl] = useState(null);

    // ─── ESTADOS MULTIMODALES (ARCHIVOS: IMÁGENES, WORD, EXCEL, PDF, AUDIO + GRABACIÓN DE VOZ) ───
    const [attachedFiles, setAttachedFiles] = useState([]);
    const [isParsingFiles, setIsParsingFiles] = useState(false);
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [isRecordingVoice, setIsRecordingVoice] = useState(false);
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const [liveVoiceTranscript, setLiveVoiceTranscript] = useState('');
    const [isTranscribingAudio, setIsTranscribingAudio] = useState(false);

    const fileInputRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const recognitionRef = useRef(null);
    const recordingTimerRef = useRef(null);
    const liveSpeechTextRef = useRef('');

    // Telar Context & Sincronización en vivo
    const { activeIndicators } = useTelarStore();
    const [activeSyncLabel, setActiveSyncLabel] = useState('Ecosistema Global SALUS + Gobernanza');

    // Proactive notifications
    const [proactiveNudge, setProactiveNudge] = useState(null);
    const nudgeTimerRef = useRef(null);
    const chatEndRef = useRef(null);
    const inputRef = useRef(null);
    const t = THEMES[theme] || THEMES.sanatorio_futurista;

    // Actualizar etiqueta del módulo/dashboard sincronizado en tiempo real
    useEffect(() => {
        const updateSyncLabel = () => {
            if (typeof window === 'undefined') return;
            const sector = window.__telar_active_sector || 'UCI';
            const sectorNames = {
                UCI: 'Telar · UCI (16 Camas)',
                GUARDIA: 'Telar · Guardia Clínica e Internado',
                QUIROFANO: 'Telar · Quirófano Central y HdD',
                DXI: 'Telar · Diagnóstico por Imágenes (DxI)',
                EPIDEMIOLOGIA: 'Telar · Epidemiología (Planilla C2 SNVS)'
            };
            const modNames = {
                inicio: 'Dashboard Principal + Gobernanza',
                gobernanza_indicadores: sectorNames[sector] || `Telar · ${sector}`,
                gobernanza: 'Proyectos de Gobernanza (29 Sectores)',
                facturacion: 'Facturación & Liquidaciones',
                altas: 'Control de Altas Administrativas',
                cirugias: 'Gestión Quirúrgica & WhatsApp',
                deudas: 'Gestión de Deudas y Cobranzas',
                auditoria_historias: 'Auditoría de Historias Clínicas'
            };
            setActiveSyncLabel(modNames[currentModule] || 'Conectado a SALUS & Gobernanza');
        };
        updateSyncLabel();
        const interval = setInterval(updateSyncLabel, 1500);
        return () => clearInterval(interval);
    }, [currentModule]);

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

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, attachedFiles]);

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 250);
        }
    }, [isOpen]);

    // Apertura externa desde el avatar del sidebar o botones globales
    useEffect(() => {
        if (externalOpen && !isOpen) {
            setIsOpen(true);
            setShowGreeting(false);
            if (messages.length === 0) {
                initWelcomeMessage();
            }
        }
    }, [externalOpen]);

    const initWelcomeMessage = useCallback(() => {
        const userName = effectiveUser?.nombre?.includes('@')
            ? effectiveUser.nombre.split('@')[0].replace(/^\w/, c => c.toUpperCase())
            : effectiveUser?.nombre || 'usuario';
        setMessages([{
            role: 'assistant',
            content:
                `¡Hola **${userName}**! 👋 Soy **Beto**, el Núcleo de Inteligencia Clínica y Gobernanza de Datos del **Sanatorio Argentino**.\n\n` +
                `Estoy **sincronizado 1:1 en tiempo real** con todos los módulos del sistema y los **5 Servicios Activos de Gobernanza** (UCI 16 Camas, Guardia Clínica e Internado, Quirófano Central y Hospital de Día, Diagnóstico por Imágenes DxI y Vigilancia Epidemiológica SNVS/C2 + los 29 Sectores).\n\n` +
                `Además, podés enviarme:\n` +
                `- 🎙️ **Audios o notas de voz** (con el micrófono o subiendo archivos de audio)\n` +
                `- 🖼️ **Imágenes y capturas de pantalla** (análisis visual clínico/administrativo)\n` +
                `- 📝 **Documentos Word (.docx)**, 📊 **Planillas Excel (.xlsx/.csv)** y 📄 **Archivos PDF (.pdf)**\n` +
                `- 📥 **Exportar cualquier respuesta** directamente a **PDF Oficial** o **Excel (.xlsx)**\n\n` +
                `¿Qué datos, indicador o documento analizamos ahora?`
        }]);
    }, [effectiveUser]);

    const handleOpen = useCallback(() => {
        setHasNewMessage(false);
        setShowGreeting(false);
        setIsOpen(true);
        if (messages.length === 0) {
            initWelcomeMessage();
        }
    }, [messages.length, initWelcomeMessage]);

    const handleClose = useCallback(() => {
        setIsOpen(false);
        setIsFullscreen(false);
        setShowGreeting(false);
        onExternalClose?.();
    }, [onExternalClose]);

    // ─── PROCESAMIENTO DE ARCHIVOS ADJUNTOS (IMÁGENES, WORD, EXCEL, PDF, AUDIO) ───
    const handleFilesSelected = useCallback(async (fileList) => {
        if (!fileList || fileList.length === 0) return;
        const filesArray = Array.from(fileList);
        setIsParsingFiles(true);
        try {
            const parsedResults = [];
            for (const file of filesArray) {
                const parsed = await parseAttachedFile(file);
                parsedResults.push(parsed);
            }
            setAttachedFiles(prev => [...prev, ...parsedResults]);
        } catch (err) {
            console.error('[Beto Multimodal] Error procesando archivos:', err);
        } finally {
            setIsParsingFiles(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }, []);

    const removeAttachedFile = useCallback((fileId) => {
        setAttachedFiles(prev => prev.filter(f => f.id !== fileId));
    }, []);

    // ─── GRABACIÓN DE VOZ EN VIVO (MICRÓFONO + WEB SPEECH API + DEEPGRAM / WHISPER) ───
    const startVoiceRecording = useCallback(async () => {
        if (isRecordingVoice || isLoading) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunksRef.current = [];
            liveSpeechTextRef.current = '';
            setLiveVoiceTranscript('');
            setRecordingSeconds(0);
            setIsRecordingVoice(true);

            // 1. Iniciar reconocimiento en vivo del navegador (instantáneo mientras habla)
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SpeechRecognition) {
                try {
                    const recognition = new SpeechRecognition();
                    recognition.lang = 'es-AR';
                    recognition.continuous = true;
                    recognition.interimResults = true;
                    recognition.onresult = (event) => {
                        let transcript = '';
                        for (let i = 0; i < event.results.length; i++) {
                            transcript += event.results[i][0].transcript + ' ';
                        }
                        const clean = transcript.trim();
                        liveSpeechTextRef.current = clean;
                        setLiveVoiceTranscript(clean);
                    };
                    recognition.start();
                    recognitionRef.current = recognition;
                } catch (_) {
                    // Fallback a MediaRecorder puro
                }
            }

            // 2. Iniciar MediaRecorder para transcripción neuronal (Deepgram Nova-2 / Whisper)
            const recorder = new MediaRecorder(stream);
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    audioChunksRef.current.push(e.data);
                }
            };
            recorder.start(250);
            mediaRecorderRef.current = { recorder, stream };

            recordingTimerRef.current = setInterval(() => {
                setRecordingSeconds(prev => prev + 1);
            }, 1000);
        } catch (err) {
            console.error('[Beto Voice] No se pudo acceder al micrófono:', err);
            alert('No se pudo acceder al micrófono. Verificá los permisos del navegador.');
        }
    }, [isRecordingVoice, isLoading]);

    const cancelVoiceRecording = useCallback(() => {
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (_) {}
            recognitionRef.current = null;
        }
        if (mediaRecorderRef.current) {
            try {
                if (mediaRecorderRef.current.recorder.state !== 'inactive') {
                    mediaRecorderRef.current.recorder.stop();
                }
                mediaRecorderRef.current.stream.getTracks().forEach(tr => tr.stop());
            } catch (_) {}
            mediaRecorderRef.current = null;
        }
        audioChunksRef.current = [];
        liveSpeechTextRef.current = '';
        setLiveVoiceTranscript('');
        setIsRecordingVoice(false);
        setRecordingSeconds(0);
    }, []);

    // ─── ENVÍO DE MENSAJES (CON CONTEXTO 1:1 UNIFICADO + ARCHIVOS MULTIMODALES) ───
    const handleSend = useCallback(async (overrideText, customAttachments = null) => {
        const rawText = (typeof overrideText === 'string' ? overrideText : input).trim();
        const filesToUse = customAttachments || attachedFiles;

        if ((!rawText && filesToUse.length === 0) || isLoading) return;

        // #19 — Detectar solicitud de tutorial
        if (rawText && filesToUse.length === 0) {
            const tutorialMatch = rawText.match(/ense[ñn]ame|tutorial|como\s+(?:uso|funciona)|aprend/i);
            const moduleMatch = rawText.match(/cirug[ií]a|deuda|pedido|mensaje|whatsapp|auditor[ií]a|alta|facturaci[oó]n|garant[ií]a/i);
            if (tutorialMatch && moduleMatch) {
                const modMap = { cirug: 'cirugias', deuda: 'deudas', pedido: 'pedidos', mensaj: 'mensajeria', whatsapp: 'mensajeria', auditor: 'auditoria_historias', alta: 'altas', factur: 'facturacion', garantia: 'garantias' };
                const key = Object.keys(modMap).find(k => moduleMatch[0].toLowerCase().startsWith(k));
                if (key) { setTutorialId(modMap[key]); setInput(''); return; }
            }
        }

        // Construir mensaje visual para el usuario y prompt enriquecido con los adjuntos
        const displayUserText = rawText || (filesToUse.length === 1
            ? `Analizá en detalle el archivo adjunto: ${filesToUse[0].name}`
            : `Analizá en detalle los ${filesToUse.length} archivos adjuntos`);

        const attachmentBlocks = filesToUse.map(f => f.extractedText).filter(Boolean);
        const promptForBackend = attachmentBlocks.length > 0
            ? `${displayUserText}\n\n══════════════════════════════════════════\n📎 ARCHIVOS Y MEDIOS ADJUNTADOS POR EL USUARIO:\n${attachmentBlocks.join('\n\n')}\n══════════════════════════════════════════`
            : displayUserText;

        const imagesPayload = filesToUse
            .filter(f => f.kind === 'image' && f.dataUrl)
            .map(f => ({ name: f.name, dataUrl: f.dataUrl }));

        const userMessage = {
            role: 'user',
            content: displayUserText,
            apiContent: promptForBackend,
            attachments: filesToUse.map(f => ({
                id: f.id,
                name: f.name,
                kind: f.kind,
                badge: f.badge,
                previewUrl: f.previewUrl || null,
                audioPreviewUrl: f.audioPreviewUrl || null,
                transcript: f.transcript || null
            }))
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setAttachedFiles([]);
        setIsLoading(true);
        setStreamingText('');

        try {
            const apiMessages = [...messages, userMessage].map(m => ({
                role: m.role,
                content: m.apiContent || m.content
            }));

            const supabaseUrl = supabase.supabaseUrl || import.meta.env.VITE_SUPABASE_URL;
            const supabaseKey = supabase.supabaseKey || import.meta.env.VITE_SUPABASE_ANON_KEY;
            const { data: { session } } = await supabase.auth.getSession();
            const authToken = session?.access_token || supabaseKey;

            // Sincronización Maestra 1:1 con todos los Dashboards y los 5 Dossiers de Gobernanza
            const unifiedContext = buildUnifiedBetoContext(currentModule || 'inicio');
            const computedModuleContext = {
                ...unifiedContext,
                quirofano_gobernanza: (typeof window !== 'undefined' && window.__quirofano_active_context) || null,
                indicadores_gobernanza: (typeof window !== 'undefined' && window.__indicadores_active_context) || null,
                indicadores_telar: activeIndicators && activeIndicators.length > 0 ? activeIndicators : null
            };

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
                    moduleContext: computedModuleContext,
                    images: imagesPayload.length > 0 ? imagesPayload : undefined,
                    stream: true,
                }),
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const contentType = response.headers.get('content-type') || '';

            if (contentType.includes('text/event-stream')) {
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

                let content = fullText;
                const navMatch = content.match(/\[ACTION:navigate:(\w+)\]/);
                if (navMatch && onNavigate) {
                    content = content.replace(/\[ACTION:navigate:\w+\]/g, '');
                    setTimeout(() => onNavigate(navMatch[1]), 500);
                }
                content = content.replace(/\[ACTION:[^\]]+\]/g, '').trim();
                setStreamingText('');
                setMessages(prev => [...prev, { role: 'assistant', content, interaction_id: null }]);
            } else {
                const data = await response.json();
                if (data?.message) {
                    let content = data.message;
                    const navMatch = content.match(/\[ACTION:navigate:(\w+)\]/);
                    if (navMatch && onNavigate) {
                        content = content.replace(/\[ACTION:navigate:\w+\]/g, '');
                        setTimeout(() => onNavigate(navMatch[1]), 500);
                    }
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
    }, [input, attachedFiles, isLoading, messages, effectiveUser, currentModule, activeIndicators, onNavigate]);

    // Finalizar grabación de voz, transcribir y enviar o insertar en el chat
    const finishVoiceRecording = useCallback(async (autoSendAfterTranscribe = true) => {
        if (!isRecordingVoice) return;
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);

        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (_) {}
            recognitionRef.current = null;
        }

        const currentSpeech = liveSpeechTextRef.current;
        setIsRecordingVoice(false);
        setIsTranscribingAudio(true);

        try {
            let audioBlob = null;
            if (mediaRecorderRef.current) {
                const { recorder, stream } = mediaRecorderRef.current;
                await new Promise((resolve) => {
                    if (recorder.state === 'inactive') {
                        resolve();
                    } else {
                        recorder.onstop = () => resolve();
                        recorder.stop();
                    }
                });
                stream.getTracks().forEach(tr => tr.stop());
                mediaRecorderRef.current = null;
                if (audioChunksRef.current.length > 0) {
                    audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                }
            }

            const finalTranscript = await transcribeAudioBlob(audioBlob, 'consulta_voz_beto.webm', currentSpeech);
            const cleanTranscript = (finalTranscript || currentSpeech || '').trim();

            if (cleanTranscript) {
                if (autoSendAfterTranscribe) {
                    await handleSend(cleanTranscript);
                } else {
                    setInput(prev => (prev ? `${prev} ${cleanTranscript}` : cleanTranscript));
                }
            } else {
                alert('No se detectó voz en la grabación. Intentá hablar más cerca del micrófono.');
            }
        } catch (err) {
            console.error('[Beto Voice] Error al transcribir grabación:', err);
        } finally {
            setIsTranscribingAudio(false);
            setRecordingSeconds(0);
            setLiveVoiceTranscript('');
        }
    }, [isRecordingVoice, handleSend]);

    // Evento global 'open-beto' para abrir y consultar desde cualquier lugar (Ctrl+K, botones, tarjetas)
    useEffect(() => {
        const handleCustomOpen = (e) => {
            setIsOpen(true);
            setShowGreeting(false);
            if (messages.length === 0) {
                initWelcomeMessage();
            }
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
    }, [messages.length, initWelcomeMessage, handleSend]);

    // Sistema de nudges automáticos desactivado para que Beto sea 100% discreto y no invasivo
    useEffect(() => {
        setProactiveNudge(null);
        setHasNewMessage(false);
    }, [isOpen, showGreeting, currentModule]);

    const dismissNudge = useCallback((e) => {
        e?.stopPropagation();
        setProactiveNudge(null);
        setHasNewMessage(false);
    }, []);

    const changeTheme = useCallback((newTheme) => {
        setTheme(newTheme);
        localStorage.setItem('beto_theme_v3', newTheme);
        setShowThemes(false);
    }, []);

    const handleShareRecord = useCallback(async () => {
        if (messages.length < 2) return;
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

    const formatSeconds = (secs) => {
        const m = String(Math.floor(secs / 60)).padStart(2, '0');
        const s = String(secs % 60).padStart(2, '0');
        return `${m}:${s}`;
    };

    // ─── RENDER 1: BOTÓN FLOTANTE FUTURISTA CLÍNICO (ACCESIBLE DESDE TODOS LADOS) ───
    if (!isOpen && !showGreeting) {
        if (hideFab) return null;
        return (
            <div style={{
                position: 'fixed', bottom: '18px', right: '18px', zIndex: 9990,
                display: 'flex', alignItems: 'center'
            }}>
                {/* Botón Flotante Compacto y Discreto en Azul Oscuro Sanatorio Argentino */}
                <button
                    id="beto-fab"
                    onClick={handleOpen}
                    style={{
                        width: '48px',
                        height: '48px',
                        padding: 0,
                        borderRadius: '50%',
                        border: '2px solid rgba(56, 189, 248, 0.65)',
                        cursor: 'pointer',
                        background: 'linear-gradient(135deg, #041324 0%, #0A2540 50%, #0D3B66 100%)',
                        boxShadow: '0 6px 18px rgba(7, 30, 54, 0.38)',
                        transition: 'all 0.2s ease',
                        color: '#FFFFFF',
                        position: 'relative',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                    onMouseOver={e => {
                        e.currentTarget.style.transform = 'scale(1.06)';
                        e.currentTarget.style.boxShadow = '0 8px 24px rgba(7, 30, 54, 0.5), 0 0 14px rgba(56, 189, 248, 0.35)';
                    }}
                    onMouseOut={e => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = '0 6px 18px rgba(7, 30, 54, 0.38)';
                    }}
                    title="Abrir Beto IA — Asistente Clínico y de Gobernanza"
                >
                    <img
                        src={BETO_AVATAR}
                        alt="Beto IA"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                </button>
            </div>
        );
    }

    // ─── RENDER 2: PANEL DE CHAT PRINCIPAL FUTURISTA Y CLÍNICO (AZUL OSCURO SANATORIO) ───
    const panelStyle = isFullscreen
        ? {
            position: 'fixed', top: '0', left: 'var(--sidebar-width, 0px)', right: '0', bottom: '0',
            width: 'auto', height: 'auto',
            borderRadius: '0', zIndex: 10000,
        }
        : {
            position: 'fixed', bottom: '20px', right: '20px',
            width: '460px', height: '660px',
            maxWidth: 'calc(100vw - 32px)',
            maxHeight: 'calc(100vh - 40px)',
            borderRadius: '20px', zIndex: 9999,
        };

    return (
        <>
            <div
                id="beto-chat-panel"
                onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                onDragLeave={() => setIsDraggingOver(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingOver(false);
                    if (e.dataTransfer?.files?.length) {
                        handleFilesSelected(e.dataTransfer.files);
                    }
                }}
                style={{
                    ...panelStyle,
                    background: t.bg,
                    boxShadow: isFullscreen
                        ? 'none'
                        : '0 20px 60px rgba(4, 19, 36, 0.45), 0 0 0 1.5px rgba(13, 59, 102, 0.35)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    fontFamily: "'Inter', -apple-system, sans-serif",
                }}
            >
                {/* Overlay Drag & Drop Multimodal */}
                {isDraggingOver && (
                    <div style={{
                        position: 'absolute', inset: 0, zIndex: 50,
                        background: 'rgba(7, 30, 54, 0.92)',
                        border: '2px dashed #38BDF8',
                        borderRadius: isFullscreen ? '0' : '20px',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        gap: '12px', color: '#FFFFFF', padding: '24px', textAlign: 'center'
                    }}>
                        <Sparkles size={42} color="#38BDF8" />
                        <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>
                            Soltá tus archivos para que Beto los analice
                        </div>
                        <div style={{ fontSize: '0.82rem', color: '#BAE6FD', maxWidth: '320px' }}>
                            Soporta Audios (.mp3, .wav, .ogg), Imágenes (.png, .jpg), Word (.docx), Excel (.xlsx, .csv) y PDF (.pdf)
                        </div>
                    </div>
                )}

                {/* HEADER FUTURISTA CLÍNICO AZUL OSCURO SANATORIO ARGENTINO */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '14px 18px',
                    background: t.headerBg || t.gradient,
                    color: 'white',
                    flexShrink: 0,
                    position: 'relative',
                    borderBottom: '1px solid rgba(56, 189, 248, 0.28)'
                }}>
                    <div style={{
                        width: '44px', height: '44px', borderRadius: '50%',
                        border: '2px solid #38BDF8',
                        boxShadow: '0 0 12px rgba(56, 189, 248, 0.4)',
                        overflow: 'hidden', flexShrink: 0, position: 'relative'
                    }}>
                        <img src={BETO_AVATAR} alt="Beto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                            fontSize: '0.98rem', fontWeight: 800, letterSpacing: '0.2px',
                            display: 'flex', alignItems: 'center', gap: '7px',
                        }}>
                            <span>BETO</span>
                            <span style={{
                                fontSize: '0.62rem', fontWeight: 800,
                                padding: '2px 7px', borderRadius: '999px',
                                background: 'rgba(56, 189, 248, 0.18)',
                                border: '1px solid rgba(56, 189, 248, 0.5)',
                                color: '#7DD3FC', letterSpacing: '0.4px'
                            }}>
                                NÚCLEO CLÍNICO IA
                            </span>
                        </div>
                        <div style={{
                            fontSize: '0.71rem', color: '#BAE6FD',
                            display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                        }}>
                            <span style={{
                                width: '6px', height: '6px', borderRadius: '50%',
                                background: '#38BDF8', boxShadow: '0 0 6px #38BDF8', display: 'inline-block', flexShrink: 0
                            }} />
                            <span>Sanatorio Argentino · Gobernanza & Operaciones</span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                            onClick={handleShareRecord}
                            disabled={isSharing || messages.length < 2}
                            title="Compartir análisis"
                            style={{
                                width: '31px', height: '31px', borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.08)',
                                color: 'white', cursor: (isSharing || messages.length < 2) ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                opacity: (isSharing || messages.length < 2) ? 0.45 : 1
                            }}
                        >
                            {isSharing ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Share2 size={14} />}
                        </button>
                        <button
                            onClick={() => setShowThemes(p => !p)}
                            title="Cambiar estética clínica"
                            style={{
                                width: '31px', height: '31px', borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.08)',
                                color: 'white', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            <Palette size={14} />
                        </button>
                        <button
                            onClick={() => setShowHistory(p => !p)}
                            title={showHistory ? 'Volver al chat activo' : 'Historial de consultas'}
                            style={{
                                width: '31px', height: '31px', borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.14)',
                                background: showHistory ? 'rgba(56, 189, 248, 0.3)' : 'rgba(255,255,255,0.08)',
                                color: 'white', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            <History size={14} />
                        </button>
                        <button
                            onClick={() => setIsFullscreen(prev => !prev)}
                            title={isFullscreen ? 'Modo ventana' : 'Expandir a pantalla completa'}
                            style={{
                                width: '31px', height: '31px', borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.08)',
                                color: 'white', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                        </button>
                        <button
                            onClick={handleClose}
                            title="Cerrar"
                            style={{
                                width: '31px', height: '31px', borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.08)',
                                color: 'white', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            <X size={15} />
                        </button>
                    </div>

                    {/* Selector de Temas */}
                    {showThemes && (
                        <div style={{
                            position: 'absolute', top: '100%', right: '18px',
                            background: '#071E36', borderRadius: '12px',
                            border: '1px solid rgba(56, 189, 248, 0.35)',
                            boxShadow: '0 12px 28px rgba(0,0,0,0.35)', padding: '8px',
                            zIndex: 25, display: 'flex', flexDirection: 'column', gap: '4px',
                            minWidth: '220px',
                        }}>
                            {Object.entries(THEMES).map(([key, th]) => (
                                <button key={key} onClick={() => changeTheme(key)} style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    padding: '8px 12px', borderRadius: '8px', border: 'none',
                                    background: theme === key ? 'rgba(56, 189, 248, 0.18)' : 'transparent',
                                    cursor: 'pointer', fontSize: '0.78rem', fontWeight: theme === key ? 700 : 500,
                                    color: '#F8FAFC', textAlign: 'left', width: '100%',
                                }}>
                                    <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: th.gradient, border: '1.5px solid #38BDF8' }} />
                                    {th.name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* BARRA HUD DE TELEMETRÍA Y SINCRONIZACIÓN 1:1 EN TIEMPO REAL */}
                <div style={{
                    background: t.hudBg || '#071E36',
                    padding: '7px 16px',
                    borderBottom: '1px solid rgba(13, 59, 102, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    flexWrap: 'wrap',
                    color: '#E0F2FE',
                    fontSize: '0.68rem',
                    flexShrink: 0
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
                        <Activity size={12} color="#38BDF8" />
                        <span style={{ color: '#7DD3FC' }}>SYNC 1:1:</span>
                        <span style={{ color: '#FFFFFF', fontWeight: 800 }}>{activeSyncLabel}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#BAE6FD', fontWeight: 600 }}>
                        <ShieldCheck size={12} color="#34D399" />
                        <span>Voz · Imagen · Word · Excel · PDF</span>
                    </div>
                </div>

                {/* OVERLAY DE COMPARTICIÓN */}
                {shareUrl && (
                    <div style={{
                        padding: '12px 16px', background: '#EFF6FF', borderBottom: '1px solid #BFDBFE',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px'
                    }}>
                        <input
                            type="text"
                            readOnly
                            value={shareUrl}
                            style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid #93C5FD', fontSize: '0.74rem', background: '#FFFFFF', color: '#0D3B66' }}
                        />
                        <button
                            onClick={() => { navigator.clipboard.writeText(shareUrl); setShareUrl(null); }}
                            style={{ background: '#0D3B66', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                            Copiar enlace
                        </button>
                    </div>
                )}

                {/* OVERLAY DE HISTORIAL */}
                {showHistory && (
                    <div style={{
                        position: 'absolute',
                        top: '104px',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: '#F8FAFC',
                        zIndex: 30,
                        display: 'flex',
                        flexDirection: 'column',
                    }}>
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
                                        background: '#EFF6FF', color: '#0D3B66',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <History size={16} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0D3B66' }}>
                                            Historial de Consultas Clínicas
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                            Registros de {effectiveUser?.nombre || effectiveUser?.usuario || 'usuario'}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <button
                                        onClick={fetchHistory}
                                        disabled={loadingHistory}
                                        style={{
                                            width: '28px', height: '28px', borderRadius: '6px',
                                            border: '1px solid #E2E8F0', background: '#FFFFFF',
                                            color: '#0D3B66', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}
                                    >
                                        <RefreshCw size={13} className={loadingHistory ? 'animate-spin' : ''} />
                                    </button>
                                    <button
                                        onClick={() => setShowHistory(false)}
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
                            <div style={{ position: 'relative' }}>
                                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                <input
                                    type="text"
                                    placeholder="Buscar en consultas (ej: uci, guardia, imágenes, quirófano)..."
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
                                    <Loader2 size={24} className="animate-spin" />
                                    <span style={{ fontSize: '0.8rem' }}>Cargando historial...</span>
                                </div>
                            ) : filteredHistory.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8' }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748B' }}>
                                        No se encontraron consultas
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
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '8px',
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem' }}>
                                                <span style={{ fontWeight: 600, color: '#475569' }}>
                                                    {formatHistoryDate(item.created_at)}
                                                </span>
                                                {item.current_module && (
                                                    <span style={{
                                                        background: '#EFF6FF',
                                                        color: '#0D3B66',
                                                        padding: '1px 6px',
                                                        borderRadius: '4px',
                                                        fontWeight: 700,
                                                        fontSize: '0.67rem',
                                                    }}>
                                                        {item.current_module}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F172A' }}>
                                                💬 {item.user_query}
                                            </div>
                                            {item.response_text && (
                                                <div
                                                    onClick={() => setExpandedHistoryId(isExpanded ? null : item.id)}
                                                    style={{
                                                        fontSize: '0.76rem',
                                                        color: '#334155',
                                                        background: '#F8FAFC',
                                                        border: '1px solid #E2E8F0',
                                                        borderRadius: '8px',
                                                        padding: '8px 10px',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    <div style={{
                                                        maxHeight: isExpanded ? 'none' : '60px',
                                                        overflow: 'hidden',
                                                        whiteSpace: 'pre-wrap',
                                                    }}>
                                                        {item.response_text}
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px', fontSize: '0.67rem', color: '#0D3B66', fontWeight: 700 }}>
                                                        {isExpanded ? 'Ver menos ▲' : 'Ver completa ▼'}
                                                    </div>
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                <button
                                                    onClick={() => {
                                                        setInput(item.user_query);
                                                        setShowHistory(false);
                                                        setTimeout(() => inputRef.current?.focus(), 150);
                                                    }}
                                                    style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                        background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '6px',
                                                        padding: '4px 9px', fontSize: '0.72rem', fontWeight: 700,
                                                        color: '#0D3B66', cursor: 'pointer',
                                                    }}
                                                >
                                                    <ArrowUpRight size={12} /> Cargar en chat
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}

                {/* ÁREA DE MENSAJES */}
                <div style={{
                    flex: 1, overflowY: 'auto', padding: '16px 18px',
                    display: 'flex', flexDirection: 'column', gap: '12px',
                }}>
                    {messages.map((msg, i) => {
                        const { text: parsedRawText, richBlocks } = msg.role === 'assistant'
                            ? parseRichContent(msg.content, onNavigate)
                            : { text: msg.content, richBlocks: [] };

                        const cleanText = msg.role === 'assistant'
                            ? sanitizeChatText(parsedRawText)
                            : parsedRawText;

                        const effectiveExcelData = msg.excel_data || richBlocks.find(b => b.type === 'excel')?.data || null;
                        // Garantizar que toda respuesta informativa/analítica de Beto (más allá del saludo inicial i===0) tenga barra de exportación PDF y Excel
                        const isExportable = msg.role === 'assistant' && i > 0 && (
                            isReportMessage(msg.content) ||
                            !!effectiveExcelData ||
                            msg.content.length > 120 ||
                            msg.content.includes('|') ||
                            msg.content.includes('- ') ||
                            /\d/.test(msg.content)
                        );

                        return (
                            <div
                                key={i}
                                style={{
                                    display: 'flex',
                                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                    gap: '8px',
                                }}
                            >
                                {msg.role === 'assistant' && (
                                    <div style={{
                                        width: '30px', height: '30px', borderRadius: '50%',
                                        border: '1.5px solid #0D3B66',
                                        overflow: 'hidden', flexShrink: 0, marginTop: '2px',
                                    }}>
                                        <img src={BETO_AVATAR} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    </div>
                                )}

                                <div style={{
                                    maxWidth: isFullscreen ? '68%' : '85%',
                                    padding: '11px 15px',
                                    borderRadius: msg.role === 'user'
                                        ? '16px 16px 4px 16px'
                                        : '16px 16px 16px 4px',
                                    background: msg.role === 'user'
                                        ? t.gradient
                                        : t.bubble,
                                    color: msg.role === 'user' ? '#FFFFFF' : (theme === 'dark' ? '#E2E8F0' : '#0F172A'),
                                    fontSize: '0.84rem',
                                    lineHeight: '1.52',
                                    boxShadow: msg.role === 'user'
                                        ? '0 4px 14px rgba(13, 59, 102, 0.35)'
                                        : '0 2px 8px rgba(13, 59, 102, 0.06), 0 0 0 1px rgba(13, 59, 102, 0.1)',
                                    wordBreak: 'break-word',
                                }}>
                                    {/* Tarjetas de adjuntos multimodales enviados por el usuario */}
                                    {msg.role === 'user' && msg.attachments && msg.attachments.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                                            {msg.attachments.map((att) => (
                                                <div key={att.id} style={{
                                                    background: 'rgba(255, 255, 255, 0.14)',
                                                    border: '1px solid rgba(56, 189, 248, 0.45)',
                                                    borderRadius: '10px',
                                                    padding: '7px 10px',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '6px'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.73rem', fontWeight: 700, color: '#E0F2FE' }}>
                                                        {att.kind === 'image' ? <ImageIcon size={13} color="#38BDF8" /> : att.kind === 'audio' ? <Volume2 size={13} color="#38BDF8" /> : <FileText size={13} color="#38BDF8" />}
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
                                                        <span style={{ marginLeft: 'auto', fontSize: '0.62rem', background: 'rgba(56, 189, 248, 0.25)', padding: '1px 6px', borderRadius: '4px', color: '#BAE6FD' }}>
                                                            {att.badge}
                                                        </span>
                                                    </div>
                                                    {att.previewUrl && (
                                                        <img
                                                            src={att.previewUrl}
                                                            alt={att.name}
                                                            style={{ maxHeight: '150px', borderRadius: '8px', objectFit: 'contain', background: '#041222' }}
                                                        />
                                                    )}
                                                    {att.audioPreviewUrl && (
                                                        <audio controls src={att.audioPreviewUrl} style={{ width: '100%', height: '32px' }} />
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {msg.role === 'assistant' ? (
                                        <div className="beto-markdown">
                                            <ReactMarkdown>{cleanText}</ReactMarkdown>

                                            {richBlocks.map((block, j) => {
                                                if (block.type === 'chart') return <BetoChartCard key={j} chartData={block.data} />;
                                                if (block.type === 'stats') return <BetoStatsCard key={j} stats={block.data} />;
                                                if (block.type === 'pipeline') return <BetoStatusPipeline key={j} pipeline={block.data} />;
                                                if (block.type === 'insight') return <BetoInsightCard key={j} insight={block.data} />;
                                                if (block.type === 'modulePreview') return <BetoModulePreview key={j} moduleId={block.moduleId} onNavigate={onNavigate} />;
                                                return null;
                                            })}

                                            {/* BARRA UNIVERSAL DE EXPORTACIÓN OFICIAL (PDF / EXCEL / IMPRIMIR) */}
                                            {isExportable && (
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '7px', marginTop: '12px',
                                                    paddingTop: '10px', borderTop: '1px solid rgba(13, 59, 102, 0.12)',
                                                }}>
                                                    <span style={{ fontSize: '0.7rem', color: '#0D3B66', fontWeight: 800, marginRight: '2px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                                        Exportar:
                                                    </span>
                                                    <button
                                                        onClick={() => downloadBetoReportPdf(msg.content, null, effectiveExcelData)}
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                                                            padding: '5px 11px', borderRadius: '8px',
                                                            border: '1px solid #0D3B66',
                                                            background: 'linear-gradient(135deg, #071E36 0%, #0D3B66 100%)',
                                                            color: '#FFFFFF',
                                                            fontSize: '0.73rem', fontWeight: 700,
                                                            cursor: 'pointer', transition: 'all 0.15s',
                                                            boxShadow: '0 2px 6px rgba(13, 59, 102, 0.22)',
                                                        }}
                                                        title="Descargar informe oficial en PDF con membrete del Sanatorio Argentino"
                                                    >
                                                        <FileDown size={13} color="#38BDF8" />
                                                        PDF Oficial
                                                    </button>

                                                    <button
                                                        onClick={() => downloadBetoReportExcel(msg.content, effectiveExcelData)}
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                                                            padding: '5px 11px', borderRadius: '8px',
                                                            border: '1px solid #059669',
                                                            background: '#ECFDF5', color: '#065F46',
                                                            fontSize: '0.73rem', fontWeight: 700,
                                                            cursor: 'pointer', transition: 'all 0.15s',
                                                        }}
                                                        title="Descargar datos estructurados en Excel (.xlsx)"
                                                    >
                                                        <FileSpreadsheet size={13} color="#059669" />
                                                        Excel (.xlsx)
                                                    </button>

                                                    <button
                                                        onClick={() => {
                                                            const printW = window.open('', '_blank');
                                                            printW.document.write(`<html><head><title>Reporte Oficial Beto IA — Sanatorio Argentino</title><style>body{font-family:'Inter',system-ui,sans-serif;padding:36px;max-width:820px;margin:0 auto;color:#0F172A}table{border-collapse:collapse;width:100%;margin:14px 0}th,td{border:1px solid #CBD5E1;padding:7px 10px;text-align:left;font-size:12.5px}th{background:#0D3B66;color:#fff}tr:nth-child(even){background:#F8FAFC}h1,h2,h3{color:#0D3B66}</style></head><body><h2>Sanatorio Argentino — Reporte Beto IA</h2><div>${cleanText.replace(/\n/g, '<br/>')}</div></body></html>`);
                                                            printW.document.close();
                                                            printW.print();
                                                        }}
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                            padding: '5px 9px', borderRadius: '8px',
                                                            border: '1px solid #CBD5E1',
                                                            background: '#F8FAFC',
                                                            color: '#475569',
                                                            fontSize: '0.71rem', fontWeight: 600,
                                                            cursor: 'pointer',
                                                        }}
                                                        title="Imprimir reporte"
                                                    >
                                                        <Printer size={12} />
                                                        Imprimir
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <span>{msg.content}</span>
                                    )}
                                </div>

                                {msg.role === 'assistant' && i > 0 && (
                                    <div style={{
                                        display: 'flex', flexDirection: 'column', gap: '2px',
                                        alignSelf: 'flex-end', marginBottom: '2px', opacity: feedbackGiven[i] ? 1 : 0.45,
                                    }}>
                                        <button
                                            onClick={() => sendFeedback(i, msg.interaction_id, 'up')}
                                            title="Respuesta exacta"
                                            style={{
                                                border: 'none', background: 'none', cursor: 'pointer',
                                                padding: '3px', borderRadius: '6px',
                                                color: feedbackGiven[i] === 'up' ? '#10B981' : '#94A3B8',
                                            }}
                                            disabled={!!feedbackGiven[i]}
                                        >
                                            <ThumbsUp size={13} fill={feedbackGiven[i] === 'up' ? '#10B981' : 'none'} />
                                        </button>
                                        <button
                                            onClick={() => sendFeedback(i, msg.interaction_id, 'down')}
                                            title="Reportar diferencia"
                                            style={{
                                                border: 'none', background: 'none', cursor: 'pointer',
                                                padding: '3px', borderRadius: '6px',
                                                color: feedbackGiven[i] === 'down' ? '#EF4444' : '#94A3B8',
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

                    {/* Indicador de procesamiento / streaming */}
                    {(isLoading || isTranscribingAudio) && (
                        <div style={{
                            display: 'flex', gap: '8px', alignItems: 'flex-start',
                        }}>
                            <div style={{
                                width: '30px', height: '30px', borderRadius: '50%',
                                border: '1.5px solid #38BDF8',
                                overflow: 'hidden', flexShrink: 0,
                            }}>
                                <img src={BETO_GIF} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                            <div style={{
                                maxWidth: isFullscreen ? '68%' : '85%',
                                padding: '12px 16px', borderRadius: '16px 16px 16px 4px',
                                background: t.bubble,
                                border: '1px solid rgba(13, 59, 102, 0.15)',
                                fontSize: '0.82rem', color: theme === 'dark' ? '#E2E8F0' : '#0D3B66',
                            }}>
                                {streamingText ? (
                                    <div className="beto-markdown">
                                        <ReactMarkdown>{streamingText}</ReactMarkdown>
                                        <span style={{ display: 'inline-block', width: '6px', height: '14px', background: '#0D3B66', borderRadius: '1px', animation: 'beto-cursor-blink 1s infinite', verticalAlign: 'middle', marginLeft: '2px' }} />
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0D3B66', fontWeight: 700 }}>
                                        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} color="#0284C7" />
                                        <span>
                                            {isTranscribingAudio
                                                ? 'Transcribiendo audio clínico con IA...'
                                                : 'Beto está procesando datos sincronizados...'}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div ref={chatEndRef} />
                </div>

                {/* SUGERENCIAS CONTEXTUALES */}
                {messages.length <= 1 && attachedFiles.length === 0 && !isRecordingVoice && (
                    <div style={{
                        padding: '0 16px 8px',
                        display: 'flex', flexWrap: 'wrap', gap: '6px',
                    }}>
                        {(SMART_SUGGESTIONS[currentModule] || SMART_SUGGESTIONS.default).map((q, i) => (
                            <button
                                key={i}
                                onClick={() => handleSend(q)}
                                style={{
                                    padding: '6px 11px', borderRadius: '999px',
                                    border: '1px solid #BFDBFE',
                                    background: '#EFF6FF', color: '#0D3B66',
                                    fontSize: '0.73rem', fontWeight: 700,
                                    cursor: 'pointer', transition: 'all 0.15s',
                                    whiteSpace: 'nowrap',
                                }}
                                onMouseOver={e => {
                                    e.currentTarget.style.background = '#DBEAFE';
                                    e.currentTarget.style.borderColor = '#38BDF8';
                                }}
                                onMouseOut={e => {
                                    e.currentTarget.style.background = '#EFF6FF';
                                    e.currentTarget.style.borderColor = '#BFDBFE';
                                }}
                            >
                                {q}
                            </button>
                        ))}
                    </div>
                )}

                {/* BANDEJA DE ARCHIVOS MULTIMODALES ADJUNTOS (IMÁGENES, WORD, EXCEL, PDF, AUDIO) */}
                {(attachedFiles.length > 0 || isParsingFiles) && (
                    <div style={{
                        padding: '8px 14px',
                        background: '#EFF6FF',
                        borderTop: '1px solid #BFDBFE',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '8px',
                        alignItems: 'center',
                        maxHeight: '130px',
                        overflowY: 'auto'
                    }}>
                        {isParsingFiles && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#0D3B66', fontWeight: 700 }}>
                                <Loader2 size={14} className="animate-spin" />
                                <span>Leyendo y estructurando archivo adjunto...</span>
                            </div>
                        )}
                        {attachedFiles.map((f) => (
                            <div key={f.id} style={{
                                display: 'flex', alignItems: 'center', gap: '7px',
                                background: '#FFFFFF', border: '1px solid #93C5FD',
                                borderRadius: '10px', padding: '5px 9px',
                                boxShadow: '0 1px 3px rgba(13, 59, 102, 0.08)',
                                maxWidth: '100%'
                            }}>
                                {f.previewUrl ? (
                                    <img src={f.previewUrl} alt={f.name} style={{ width: '26px', height: '26px', borderRadius: '5px', objectFit: 'cover' }} />
                                ) : (
                                    <div style={{
                                        width: '26px', height: '26px', borderRadius: '6px',
                                        background: '#0D3B66', color: '#38BDF8',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                    }}>
                                        {f.kind === 'audio' ? <Volume2 size={14} /> : f.kind === 'excel' ? <FileSpreadsheet size={14} /> : <FileText size={14} />}
                                    </div>
                                )}
                                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                    <span style={{ fontSize: '0.73rem', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '170px' }}>
                                        {f.name}
                                    </span>
                                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#0284C7' }}>
                                        {f.badge}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeAttachedFile(f.id)}
                                    style={{
                                        border: 'none', background: '#FEE2E2', color: '#DC2626',
                                        width: '20px', height: '20px', borderRadius: '50%',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0
                                    }}
                                    title="Quitar archivo"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* BARRA DE GRABACIÓN DE VOZ EN VIVO */}
                {isRecordingVoice && (
                    <div style={{
                        padding: '10px 16px',
                        background: 'linear-gradient(90deg, #06182C 0%, #0D3B66 100%)',
                        borderTop: '1px solid #38BDF8',
                        color: '#FFFFFF',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                    width: '10px', height: '10px', borderRadius: '50%',
                                    background: '#EF4444', boxShadow: '0 0 10px #EF4444',
                                    animation: 'beto-cursor-blink 1s infinite'
                                }} />
                                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#F8FAFC' }}>
                                    Grabando audio... {formatSeconds(recordingSeconds)}
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <button
                                    type="button"
                                    onClick={cancelVoiceRecording}
                                    style={{
                                        padding: '4px 10px', borderRadius: '7px',
                                        border: '1px solid rgba(255,255,255,0.25)',
                                        background: 'transparent', color: '#FCA5A5',
                                        fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer'
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => finishVoiceRecording(false)}
                                    style={{
                                        padding: '4px 10px', borderRadius: '7px',
                                        border: '1px solid #38BDF8',
                                        background: 'rgba(56, 189, 248, 0.15)', color: '#BAE6FD',
                                        fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer'
                                    }}
                                >
                                    Pasar a texto
                                </button>
                                <button
                                    type="button"
                                    onClick={() => finishVoiceRecording(true)}
                                    style={{
                                        padding: '4px 12px', borderRadius: '7px',
                                        border: 'none',
                                        background: '#38BDF8', color: '#041222',
                                        fontSize: '0.73rem', fontWeight: 800, cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '4px'
                                    }}
                                >
                                    <Square size={11} fill="#041222" /> Enviar Audio
                                </button>
                            </div>
                        </div>
                        {liveVoiceTranscript && (
                            <div style={{ fontSize: '0.74rem', color: '#BAE6FD', fontStyle: 'italic' }}>
                                "{liveVoiceTranscript}"
                            </div>
                        )}
                    </div>
                )}

                {/* BARRA DE ENTRADA MULTIMODAL (ADJUNTAR ARCHIVOS + MICRÓFONO + TEXTO + ENVIAR) */}
                <div style={{
                    padding: '10px 14px',
                    borderTop: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    display: 'flex', gap: '7px', alignItems: 'flex-end',
                    flexShrink: 0,
                    borderRadius: isFullscreen ? '0' : '0 0 20px 20px',
                }}>
                    {/* Input oculto para adjuntar Imágenes, Audios, Word, Excel y PDF */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                        onChange={(e) => handleFilesSelected(e.target.files)}
                        style={{ display: 'none' }}
                    />

                    {/* Botón Adjuntar Archivos (Imagen, Word, Excel, PDF, Audio) */}
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isLoading || isParsingFiles}
                        title="Adjuntar Imagen, Audio, Word (.docx), Excel (.xlsx) o PDF (.pdf)"
                        style={{
                            width: '38px', height: '38px',
                            borderRadius: '11px',
                            border: '1.5px solid #BFDBFE',
                            background: '#F0F7FF',
                            color: '#0D3B66',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                            transition: 'all 0.15s',
                        }}
                    >
                        <Paperclip size={17} />
                    </button>

                    {/* Botón Micrófono (Grabar Audio en Vivo) */}
                    <button
                        type="button"
                        onClick={isRecordingVoice ? () => finishVoiceRecording(true) : startVoiceRecording}
                        disabled={isLoading || isTranscribingAudio}
                        title={isRecordingVoice ? 'Detener y enviar audio' : 'Hablar con Beto por micrófono'}
                        style={{
                            width: '38px', height: '38px',
                            borderRadius: '11px',
                            border: isRecordingVoice ? '1.5px solid #EF4444' : '1.5px solid #BFDBFE',
                            background: isRecordingVoice ? '#FEF2F2' : '#F0F7FF',
                            color: isRecordingVoice ? '#DC2626' : '#0D3B66',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                            transition: 'all 0.15s',
                        }}
                    >
                        <Mic size={17} />
                    </button>

                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Consultá cualquier indicador o adjuntá audio, imagen, Word, Excel o PDF..."
                        rows={1}
                        style={{
                            flex: 1, resize: 'none',
                            padding: '9px 12px',
                            border: '1.5px solid #CBD5E1',
                            borderRadius: '12px',
                            fontSize: '0.83rem',
                            fontFamily: 'inherit',
                            lineHeight: '1.4',
                            outline: 'none',
                            color: '#0F172A',
                            maxHeight: '110px',
                            overflowY: 'auto',
                        }}
                        onFocus={e => {
                            e.target.style.borderColor = '#0D3B66';
                            e.target.style.boxShadow = '0 0 0 3px rgba(13, 59, 102, 0.12)';
                        }}
                        onBlur={e => {
                            e.target.style.borderColor = '#CBD5E1';
                            e.target.style.boxShadow = 'none';
                        }}
                        onInput={e => {
                            e.target.style.height = 'auto';
                            e.target.style.height = Math.min(e.target.scrollHeight, 110) + 'px';
                        }}
                    />

                    <button
                        type="button"
                        onClick={() => handleSend()}
                        disabled={(!input.trim() && attachedFiles.length === 0) || isLoading || isParsingFiles}
                        style={{
                            width: '38px', height: '38px',
                            borderRadius: '11px', border: 'none',
                            background: (input.trim() || attachedFiles.length > 0) && !isLoading
                                ? 'linear-gradient(135deg, #071E36 0%, #0D3B66 60%, #0284C7 100%)'
                                : '#E2E8F0',
                            color: (input.trim() || attachedFiles.length > 0) && !isLoading ? '#FFFFFF' : '#94A3B8',
                            cursor: (input.trim() || attachedFiles.length > 0) && !isLoading ? 'pointer' : 'default',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.2s',
                            flexShrink: 0,
                        }}
                        title="Enviar consulta a Beto"
                    >
                        <Send size={17} />
                    </button>
                </div>
            </div>

            <BetoPresentationMode
                isOpen={!!presentationSlides}
                onClose={() => setPresentationSlides(null)}
                slides={presentationSlides || []}
            />

            <BetoTutorial
                isOpen={!!tutorialId}
                onClose={() => setTutorialId(null)}
                tutorialId={tutorialId}
                onNavigate={onNavigate}
            />

            <style>{`
                @keyframes beto-cursor-blink { 0%,50% { opacity: 1; } 51%,100% { opacity: 0; } }
            `}</style>
        </>
    );
}
