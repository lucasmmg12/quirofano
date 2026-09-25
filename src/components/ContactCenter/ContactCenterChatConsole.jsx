import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
    Search, Paperclip, Send, Lock, Tag, User, 
    Calendar, CheckCircle2, ChevronDown, Check, Star, 
    Phone, Mail, MapPin, Building, Bot, Shield, ExternalLink,
    Filter, Archive, UserCheck, MoreVertical, Eye, AlertTriangle,
    Unlock, ArrowRightLeft, Clock, MessageSquare, AlertCircle,
    Power, Sparkles, Stethoscope, DollarSign, CreditCard,
    Edit3, Save, X, History, Activity, FileCheck, RefreshCw,
    Zap, CalendarCheck, PlusCircle, ShieldCheck, BarChart3, Volume2, VolumeX,
    GripVertical, Download, ZoomIn, ZoomOut, RotateCw, Copy, ArrowUpDown,
    FileText, FileSpreadsheet, File, Maximize2, Palette,
    Mic, Square, Trash2, Loader2, Upload
} from 'lucide-react';

/**
 * Detecta metadata y tipo de archivo para documentos y medios (PDF, Word, Excel, Imágenes)
 */
function getDocumentMeta(url, explicitType = '', caption = '', text = '') {
    if (!url && !explicitType) return null;
    const cleanUrl = String(url || '').toLowerCase();
    const cleanCaption = String(caption || '').trim();
    const cleanText = String(text || '').trim();
    
    const isVoiceNoteEvent = cleanText.startsWith('_event_voice_note_') || cleanCaption.startsWith('_event_voice_note_');
    const isAudio = explicitType === 'audio' || explicitType === 'voice' || isVoiceNoteEvent || /\.(mp3|ogg|oga|opus|wav|m4a|aac|webm)($|\?)/i.test(cleanUrl) || cleanUrl.includes('/audio') || cleanUrl.includes('audio_') || cleanUrl.includes('voice');
    const isImage = !isAudio && (explicitType === 'image' || /\.(jpe?g|png|webp|gif|bmp|svg)($|\?)/i.test(cleanUrl));
    const isPdf = !isAudio && !isImage && (cleanUrl.includes('.pdf') || explicitType === 'pdf' || cleanCaption.toLowerCase().endsWith('.pdf') || cleanText.toLowerCase().endsWith('.pdf'));
    const isWord = !isAudio && !isImage && (cleanUrl.includes('.docx') || cleanUrl.includes('.doc') || explicitType === 'word' || cleanCaption.toLowerCase().includes('.doc') || cleanText.toLowerCase().includes('.doc'));
    const isExcel = !isAudio && !isImage && (cleanUrl.includes('.xlsx') || cleanUrl.includes('.xls') || cleanUrl.includes('.csv') || explicitType === 'excel' || cleanCaption.toLowerCase().includes('.xls') || cleanText.toLowerCase().includes('.xls') || cleanCaption.toLowerCase().includes('.csv'));
    const isTxt = !isAudio && !isImage && !isPdf && !isWord && !isExcel && (cleanUrl.includes('.txt') || cleanCaption.toLowerCase().endsWith('.txt') || cleanText.toLowerCase().endsWith('.txt'));
    
    let fileType = 'document';
    let label = 'Documento Adjunto';
    let color = '#2563EB';
    let bgColor = '#EFF6FF';
    let borderColor = '#BFDBFE';
    let ext = 'DOC';
    
    if (isAudio) {
        fileType = 'audio';
        label = 'Audio / Mensaje de Voz';
        color = '#7C3AED';
        bgColor = '#FAF5FF';
        borderColor = '#DDD6FE';
        ext = 'AUDIO';
    } else if (isImage) {
        fileType = 'image';
        label = 'Imagen Médica / Orden';
        color = '#0284C7';
        bgColor = '#F0F9FF';
        borderColor = '#BAE6FD';
        ext = 'IMG';
    } else if (isPdf) {
        fileType = 'pdf';
        label = 'Documento PDF';
        color = '#DC2626';
        bgColor = '#FEF2F2';
        borderColor = '#FECACA';
        ext = 'PDF';
    } else if (isWord) {
        fileType = 'word';
        label = 'Documento Word';
        color = '#2563EB';
        bgColor = '#EFF6FF';
        borderColor = '#BFDBFE';
        ext = 'DOCX';
    } else if (isExcel) {
        fileType = 'excel';
        label = 'Planilla Excel';
        color = '#16A34A';
        bgColor = '#F0FDF4';
        borderColor = '#BBF7D0';
        ext = 'XLSX';
    } else if (isTxt) {
        fileType = 'txt';
        label = 'Archivo de Texto';
        color = '#475569';
        bgColor = '#F8FAFC';
        borderColor = '#CBD5E1';
        ext = 'TXT';
    }
    
    let filename = cleanCaption || (cleanText && !cleanText.startsWith('[') && !cleanText.startsWith('_event_') && cleanText.length < 80 ? cleanText : '');
    if (!filename && url) {
        try {
            const pathname = new URL(url).pathname;
            const parts = pathname.split('/');
            const lastPart = parts[parts.length - 1];
            if (lastPart && !lastPart.startsWith('_event_')) {
                filename = decodeURIComponent(lastPart);
            }
        } catch {
            filename = '';
        }
    }
    if (isAudio && (!filename || filename.startsWith('_event_'))) {
        filename = 'audio_whatsapp.ogg';
    } else if (!filename) {
        filename = `${label}.${ext.toLowerCase()}`;
    }
    
    return {
        fileType,
        label,
        color,
        bgColor,
        borderColor,
        ext,
        filename
    };
}
import { 
    CONTACT_CENTER_AGENTS, getAgentById, isChatLockedForUser, 
    MASTER_ADMINS, toggleBotActive, fetchDoctorParameters,
    saveCrmPatientCard, lookupPatientFromSalus, resetBotWorkflow,
    analyzeMedicalOrderImage, generateChatAiSummary,
    FINAL_ATTENTION_MESSAGE, isClosedOrArchived,
    isUserAuthorizedForContactCenter, subscribeToChatPresence,
    transcribeAudioMessage, uploadContactCenterMedia
} from '../../services/contactCenterService';
import { normalizeArgentinePhone } from '../../services/builderbotApi';
import { fetchPacienteDetalle } from '../../services/pacienteUnificadoService';
import { 
    getContactCenterQuickReplies, 
    findQuickReplyByShortcut, 
    filterQuickReplies, 
    syncQuickRepliesFromDb,
    interpolateQuickReplyVariables
} from '../../data/contactCenterQuickReplies';
import { getStoredTheme } from '../../services/contactCenterThemeService';
import ContactCenterThemeModal from './ContactCenterThemeModal';

// =========================================================================
// 🧪 [MODO PRUEBA TEMPORAL] INDICADOR DE AUTO-REINICIO CADA 3 MINUTOS
// Para quitar o desactivar: cambiar a false
// =========================================================================
const TEST_BOT_RESET_INDICATOR_ENABLED = false;

export default function ContactCenterChatConsole({ 
    chats = [], 
    activeChatId, 
    activeAgent = CONTACT_CENTER_AGENTS[0],
    currentUser,
    onSelectChat, 
    onSendMessage, 
    onAssignChat,
    onUnassignChat,
    onTransferChat,
    onCloseChat,
    onBulkCloseChats,
    activeSubTab = 'conversaciones',
    onNavigateTab,
    onSwitchAgent,
    soundEnabled = true,
    onToggleSound,
    onReloadChats,
    loadingLive = false,
    isLMarinero = false
}) {
    // Selección múltiple y cierre masivo silencioso
    const [selectedChatIds, setSelectedChatIds] = useState(new Set());
    const [bulkCloseModalOpen, setBulkCloseModalOpen] = useState(false);
    const [bulkResolutionReason, setBulkResolutionReason] = useState('Cierre masivo de cola');
    const [isBulkClosing, setIsBulkClosing] = useState(false);

    // Personalización de Temas y Ergonomía Visual (Presets, Fondos, Nano Banana, Sidebars)
    const [ccTheme, setCcTheme] = useState(getStoredTheme);
    const [themeModalOpen, setThemeModalOpen] = useState(false);

    // Colores adaptativos de tarjetas para sidebars (soporte para modo pastel y oscuro con contraste garantizado)
    const themeCardBg = ccTheme.cardBg || (ccTheme.isDark ? '#1E293B' : '#FFFFFF');
    const themeCardBorder = ccTheme.cardBorder || (ccTheme.isDark ? '#334155' : '#E2E8F0');
    const themeCardText = ccTheme.cardText || (ccTheme.isDark ? '#F8FAFC' : '#0F172A');
    const themeCardSubtext = ccTheme.cardSubtext || (ccTheme.isDark ? '#94A3B8' : '#64748B');
    const themeCardHoverBg = ccTheme.cardHoverBg || (ccTheme.isDark ? '#334155' : '#F8FAFC');
    const themeCardSelectedBg = ccTheme.cardSelectedBg || (ccTheme.isDark ? '#1E3A5F' : '#EFF6FF');
    const rightCardBg = ccTheme.rightSidebarCardBg || themeCardBg;
    const rightCardBorder = ccTheme.rightSidebarCardBorder || themeCardBorder;

    // Panel de Información Resizable (con límites min 260px, max 550px)
    const consoleContainerRef = useRef(null);
    const [rightPanelWidth, setRightPanelWidth] = useState(() => {
        const saved = localStorage.getItem('cc_right_panel_width');
        const parsed = saved ? parseInt(saved, 10) : 340;
        return isNaN(parsed) ? 340 : Math.min(Math.max(parsed, 260), 550);
    });
    const [isDraggingRight, setIsDraggingRight] = useState(false);

    const handleMouseDownRight = (e) => {
        e.preventDefault();
        setIsDraggingRight(true);
    };

    useEffect(() => {
        if (!isDraggingRight) return;

        const handleMouseMove = (e) => {
            if (consoleContainerRef.current) {
                const rect = consoleContainerRef.current.getBoundingClientRect();
                const calculatedWidth = rect.right - e.clientX;
                const boundedWidth = Math.min(Math.max(calculatedWidth, 260), 550);
                setRightPanelWidth(boundedWidth);
            }
        };

        const handleMouseUp = () => {
            setIsDraggingRight(false);
            setRightPanelWidth(current => {
                localStorage.setItem('cc_right_panel_width', current.toString());
                return current;
            });
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDraggingRight]);
    const [filterTab, setFilterTab] = useState('sin_asignar');
    const [searchTerm, setSearchTerm] = useState('');
    const [searchScope, setSearchScope] = useState('all'); // 'all' (todas las carpetas) o 'tab' (en esta pestaña)
    const searchInputRef = useRef(null);

    // Atajo de teclado global: '/' o 'Ctrl+K' para activar el buscador al instante
    useEffect(() => {
        const handleGlobalKeyDown = (e) => {
            const tag = e.target?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) {
                if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
                    setSearchTerm('');
                    searchInputRef.current?.blur();
                }
                return;
            }

            if (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
                e.preventDefault();
                searchInputRef.current?.focus();
                searchInputRef.current?.select();
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, []);
    const [messageInput, setMessageInput] = useState('');
    const [isPrivateNote, setIsPrivateNote] = useState(false);

    // Estado para adjuntos (Excel, Word, PDF, TXT, imágenes, audio)
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploadingMedia, setUploadingMedia] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    const attachmentInputRef = useRef(null);

    // Estado para grabación de notas de voz (audio)
    const [isRecordingAudio, setIsRecordingAudio] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef(null);
    const recordingChunksRef = useRef([]);
    const recordingTimerRef = useRef(null);
    const [activeDetailTab, setActiveDetailTab] = useState('info'); // 'info', 'historial', 'prestadores'
    const [transferMenuOpen, setTransferMenuOpen] = useState(false);
    const transferMenuRef = useRef(null);

    // Presencia en tiempo real (Quién está leyendo la conversación - "El Ojito")
    const [activePresences, setActivePresences] = useState([]);
    const presenceTrackerRef = useRef(null);

    const [botActive, setBotActive] = useState(true);
    const [doctorQuery, setDoctorQuery] = useState('');
    const [doctorResults, setDoctorResults] = useState([]);
    const [isSearchingDoctor, setIsSearchingDoctor] = useState(false);
    const [analyzingMsgId, setAnalyzingMsgId] = useState(null);
    const [transcribingMsgId, setTranscribingMsgId] = useState(null);
    const [copiedAudioMsgId, setCopiedAudioMsgId] = useState(null);
    const [, setForceUpdate] = useState(0);
    const [messageSortOrder, setMessageSortOrder] = useState(() => {
        return localStorage.getItem('cc_message_sort_order') || 'chronological';
    }); // 'chronological' (estándar WhatsApp/AsisteClick) o 'newest_first'
    // Optimización RAM: Renderizar inicialmente 50 mensajes en el thread para computadoras de bajo rendimiento
    const [visibleMessageCount, setVisibleMessageCount] = useState(50);
    const messagesEndRef = useRef(null);
    const messagesContainerRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        setVisibleMessageCount(50);
    }, [activeChatId]);

    // Estado del Visor Profesional de Documentos y Órdenes Médicas
    const [viewerImage, setViewerImage] = useState(null); 
    const [viewerZoom, setViewerZoom] = useState(1);
    const [viewerRotation, setViewerRotation] = useState(0);
    const [isDownloadingImage, setIsDownloadingImage] = useState(false);
    const [copiedViewerData, setCopiedViewerData] = useState(false);

    // Atajos de teclado en el visor profesional
    useEffect(() => {
        if (!viewerImage) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setViewerImage(null);
            } else if (e.key === '+' || e.key === '=') {
                setViewerZoom(z => Math.min(4, +(z + 0.25).toFixed(2)));
            } else if (e.key === '-') {
                setViewerZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)));
            } else if (e.key === 'r' || e.key === 'R') {
                setViewerRotation(r => (r + 90) % 360);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [viewerImage]);

    // Descarga profesional directa sin redirigir a enlaces externos
    const handleDownloadViewerImage = async () => {
        if (!viewerImage?.url) return;
        try {
            setIsDownloadingImage(true);
            const res = await fetch(viewerImage.url);
            const blob = await res.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const safeName = (viewerImage.senderName || 'documento')
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '_')
                .replace(/_+/g, '_');
            const ext = viewerImage.ext ? viewerImage.ext.toLowerCase() : 'pdf';
            const filename = viewerImage.filename || `${safeName}_${Date.now().toString().slice(-6)}.${ext}`;
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(blobUrl);
        } catch (err) {
            console.error('Error descargando archivo vía blob:', err);
            const a = document.createElement('a');
            a.href = viewerImage.url;
            a.download = viewerImage.filename || 'documento';
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } finally {
            setIsDownloadingImage(false);
        }
    };

    // Suscripción a la presencia en tiempo real de agentes ("El Ojito")
    useEffect(() => {
        const tracker = subscribeToChatPresence({
            activeAgent,
            currentUser,
            onPresenceChange: (presences) => {
                setActivePresences(presences || []);
            }
        });
        presenceTrackerRef.current = tracker;

        return () => {
            tracker.cleanup();
        };
    }, [activeAgent?.id, activeAgent?.name, currentUser?.usuario]);

    // Cerrar menú de transferencia al hacer click afuera
    useEffect(() => {
        if (!transferMenuOpen) return;
        const handleClickOutside = (e) => {
            if (transferMenuRef.current && !transferMenuRef.current.contains(e.target)) {
                setTransferMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [transferMenuOpen]);

    // Helper de validación de nombres genéricos que NUNCA deben mostrarse como contacto
    const isGenericName = (name) => {
        if (!name) return true;
        const norm = String(name).trim().toLowerCase();
        return (
            norm === 'bot sanatorio' ||
            norm === 'bot' ||
            norm === 'sanatorio' ||
            norm === 'sanatorio argentino' ||
            norm === 'paciente' ||
            norm.startsWith('paciente (') ||
            norm === 'recepciones'
        );
    };

    const getCleanChatName = (c) => {
        if (!c) return 'Paciente';
        if (c.customFields?.pacienteNombre && !isGenericName(c.customFields.pacienteNombre)) {
            return c.customFields.pacienteNombre;
        }
        if (c.contactName && !isGenericName(c.contactName)) {
            return c.contactName;
        }
        // Extraer de saludo del bot en mensajes
        const msgs = c.messages || [];
        for (const m of msgs) {
            const text = m.content || m.text || '';
            const match = text.match(/¡Hola\s+\*([^*]+)\*!/i);
            if (match && match[1] && !isGenericName(match[1])) {
                return match[1].trim();
            }
        }
        // Extraer de pushName entrante de WhatsApp
        const inc = msgs.find(m => (m.direction === 'incoming' || m.sender === 'patient') && m.sender_name && !isGenericName(m.sender_name));
        if (inc?.sender_name) return inc.sender_name;

        return c.phone ? `+${c.phone.replace(/\D/g, '')}` : 'Paciente';
    };

    const getChatAvatarInitials = (c) => {
        const name = getCleanChatName(c);
        if (!name || name === 'Paciente') return 'P';
        if (name.startsWith('+')) return '#';
        const clean = name.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '').trim();
        const parts = clean.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
        }
        return clean.substring(0, 2).toUpperCase();
    };

    // Estados Atajos y Respuestas Rápidas (Exclusivo Contact Center)
    const [quickRepliesOpen, setQuickRepliesOpen] = useState(false);
    const [quickRepliesModalOpen, setQuickRepliesModalOpen] = useState(false);
    const [quickReplyFilter, setQuickReplyFilter] = useState('');
    const [selectedQuickReplyIndex, setSelectedQuickReplyIndex] = useState(0);
    const [quickRepliesList, setQuickRepliesList] = useState(() => getContactCenterQuickReplies());

    // Resuelve variables como {{name}}, {{agent_name}}, {{tipo_consulta}}
    const resolveQuickReplyText = (content) => {
        return interpolateQuickReplyVariables(content, {
            patientName: selectedChat?.contactName && !selectedChat.contactName.startsWith('+') ? selectedChat.contactName : (crmForm?.pacienteNombre || 'Paciente'),
            agentName: activeAgent?.name || currentUser?.nombre || 'Sanatorio Argentino',
            queryType: selectedChat?.customFields?.motivoConsulta || 'por tu consulta'
        });
    };

    // Estados CRM: Edición de Ficha y Búsqueda en Padrón SALUS
    const [isEditingCrm, setIsEditingCrm] = useState(false);
    const [crmForm, setCrmForm] = useState({
        dni: '',
        pacienteNombre: '',
        obraSocial: '',
        fechaNacimiento: '',
        email: '',
        departamento: '',
        motivoConsulta: '',
        notas: ''
    });
    const [isSavingCrm, setIsSavingCrm] = useState(false);
    const [isSearchingSalus, setIsSearchingSalus] = useState(false);
    const [isSearchingThirdParty, setIsSearchingThirdParty] = useState(false);
    const [thirdPartyDniInput, setThirdPartyDniInput] = useState('');
    const [activeDualTab, setActiveDualTab] = useState('paciente'); // 'paciente' | 'titular'

    // Estados Historial Clínico 360°
    const [patientHistory, setPatientHistory] = useState(null);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // Modal de Cierre / Finalización de Atención
    const [closeModalOpen, setCloseModalOpen] = useState(false);
    const [resolutionReason, setResolutionReason] = useState('Turno Coordinado');
    const [isClosingChat, setIsClosingChat] = useState(false);

    // Modal Institucional de Reinicio de Bot y Notificaciones Toast
    const [resetBotModalOpen, setResetBotModalOpen] = useState(false);
    const [isResettingBot, setIsResettingBot] = useState(false);
    const [systemToast, setSystemToast] = useState(null);

    const showToast = (message, type = 'success') => {
        setSystemToast({ message, type });
        setTimeout(() => {
            setSystemToast(null);
        }, 4500);
    };

    // Estados Resumen IA del Paciente y Prestador
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    const [aiSummaryData, setAiSummaryData] = useState(null);
    const patientHistoryCache = useRef({});

    const isSupervisor = MASTER_ADMINS.includes((currentUser?.usuario || '').toLowerCase().trim());
    const selectedChat = chats.find(c => c.id === activeChatId) || chats[0] || {};

    // Sincronizar formulario CRM y Resumen IA cuando cambia el chat activo (Vinculación EXCLUSIVA por DNI)
    useEffect(() => {
        if (selectedChat) {
            const initialDni = (selectedChat.customFields?.dni && selectedChat.customFields?.dni !== 'A verificar') ? selectedChat.customFields?.dni : '';
            const initialNombre = selectedChat.customFields?.pacienteNombre || selectedChat.contactName || '';

            setCrmForm({
                dni: initialDni,
                pacienteNombre: initialNombre,
                obraSocial: (selectedChat.customFields?.obraSocial && selectedChat.customFields?.obraSocial !== 'A consultar') ? selectedChat.customFields?.obraSocial : '',
                fechaNacimiento: selectedChat.customFields?.fechaNacimiento && selectedChat.customFields?.fechaNacimiento !== 'No informada' ? selectedChat.customFields?.fechaNacimiento : '',
                email: (selectedChat.customFields?.email && selectedChat.customFields?.email !== 'No informado') ? selectedChat.customFields?.email : '',
                departamento: selectedChat.customFields?.departamento || 'San Juan',
                motivoConsulta: selectedChat.customFields?.motivoConsulta || selectedChat.customFields?.turnosDiaHora || '',
                notas: selectedChat.customFields?.notas || ''
            });
            setIsEditingCrm(false);
            setAiSummaryData(selectedChat.aiSummary || null);

            // Si ya tiene un DNI específico pero faltan datos esenciales (fecha de nacimiento, email), resolver en background con SALUS
            const currentFechaNac = selectedChat.customFields?.fechaNacimiento;
            const currentEmail = selectedChat.customFields?.email;
            const needsLookup = initialDni && (!currentFechaNac || currentFechaNac === 'No informada' || !currentEmail || currentEmail === 'No informado');

            if (needsLookup) {
                lookupPatientFromSalus(initialDni).then(found => {
                    if (found && String(found.dni) === String(initialDni)) {
                        const birth = found.fecha_nacimiento || '';
                        const formattedBirth = birth.includes('/') ? birth : (birth.includes('-') ? `${birth.split('-')[2]}/${birth.split('-')[1]}/${birth.split('-')[0]}` : birth);

                        setCrmForm(prev => {
                            if (String(prev.dni) !== String(initialDni)) return prev;
                            return {
                                ...prev,
                                obraSocial: prev.obraSocial && prev.obraSocial !== 'A consultar' ? prev.obraSocial : (found.coseguro || ''),
                                fechaNacimiento: prev.fechaNacimiento && prev.fechaNacimiento !== 'No informada' ? prev.fechaNacimiento : formattedBirth,
                                email: prev.email && prev.email !== 'No informado' ? prev.email : (found.email || ''),
                                departamento: prev.departamento || found.centro || 'San Juan'
                            };
                        });
                        if (selectedChat.customFields && String(selectedChat.customFields.dni) === String(initialDni)) {
                            if (found.nhc) selectedChat.customFields.nhc = found.nhc;
                            if (found.coseguro) selectedChat.customFields.obraSocial = found.coseguro;
                            if (formattedBirth) selectedChat.customFields.fechaNacimiento = formattedBirth;
                            if (found.email) selectedChat.customFields.email = found.email;
                            selectedChat.customFields.esPacienteExistente = true;
                        }
                    }
                }).catch(() => {});
            }
        }
    }, [selectedChat?.id]);

    // Rastrear en tiempo real qué conversación está mirando este agente ("El Ojito")
    useEffect(() => {
        if (selectedChat?.id) {
            presenceTrackerRef.current?.trackChat(selectedChat.id, selectedChat.phone);
        } else {
            presenceTrackerRef.current?.untrackChat();
        }
    }, [selectedChat?.id, selectedChat?.phone]);

    // Sincronizar catálogo institucional de respuestas rápidas de Contact Center
    useEffect(() => {
        syncQuickRepliesFromDb().then(list => {
            if (list && list.length > 0) setQuickRepliesList(list);
        }).catch(() => {});
    }, []);

    const handleRunAiSummary = async (isAuto = false) => {
        if (!selectedChat?.phone || isGeneratingSummary) return;
        try {
            setIsGeneratingSummary(true);
            const summary = await generateChatAiSummary(selectedChat.phone);
            if (summary) {
                setAiSummaryData(summary);
                selectedChat.aiSummary = summary;
                // Autocompletar datos del paciente en el formulario si están vacíos
                if (summary.datos_paciente) {
                    setCrmForm(prev => ({
                        ...prev,
                        dni: prev.dni || summary.datos_paciente.dni || '',
                        pacienteNombre: prev.pacienteNombre || summary.datos_paciente.nombre_completo || '',
                        obraSocial: prev.obraSocial || summary.datos_paciente.obra_social || '',
                        fechaNacimiento: prev.fechaNacimiento || summary.datos_paciente.fecha_nacimiento || '',
                        departamento: prev.departamento || summary.datos_paciente.departamento || 'San Juan'
                    }));
                }
            }
        } catch (err) {
            if (!isAuto) {
                alert('Error al generar resumen IA: ' + (err.message || 'Error'));
            } else {
                console.warn('[auto-ai-summary] Actualización automática de IA en progreso...');
            }
        } finally {
            setIsGeneratingSummary(false);
        }
    };

    // Auto-generar Resumen IA automáticamente tras cada mensaje entrante del paciente
    const lastMsgInChat = selectedChat?.messages && selectedChat.messages.length > 0 
        ? selectedChat.messages[selectedChat.messages.length - 1] 
        : null;
    const lastMsgId = lastMsgInChat?.id || lastMsgInChat?.realId;
    const lastMsgSender = lastMsgInChat?.sender || (lastMsgInChat?.direction === 'incoming' ? 'patient' : 'agent');

    useEffect(() => {
        if (!selectedChat?.phone || !lastMsgInChat) return;

        // Si el último mensaje es del paciente, actualizar el análisis IA automáticamente (debounce 1.2s)
        if (lastMsgSender === 'patient') {
            const timer = setTimeout(() => {
                console.log('[auto-ai-summary] ⚡ Mensaje entrante del paciente detectado. Ejecutando análisis IA automático...');
                handleRunAiSummary(true);
            }, 1200);
            return () => clearTimeout(timer);
        }
    }, [lastMsgId, lastMsgSender, selectedChat?.phone]);

    // Control de desplazamiento según orden de mensajes (cronológico clásico abajo o más recientes arriba)
    useEffect(() => {
        const timer = setTimeout(() => {
            if (messageSortOrder === 'chronological') {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            } else if (messagesContainerRef.current) {
                messagesContainerRef.current.scrollTop = 0;
            }
        }, 50);
        return () => clearTimeout(timer);
    }, [selectedChat?.id, selectedChat?.messages?.length, messageSortOrder]);

    // Si el chat activo no tiene análisis IA generado pero tiene mensajes del paciente, analizar automáticamente
    useEffect(() => {
        if (selectedChat?.phone && !aiSummaryData && selectedChat.messages && selectedChat.messages.length > 0) {
            const hasPatientMsg = selectedChat.messages.some(m => m.sender === 'patient' || m.direction === 'incoming');
            if (hasPatientMsg && !isGeneratingSummary) {
                const initTimer = setTimeout(() => {
                    handleRunAiSummary(true);
                }, 800);
                return () => clearTimeout(initTimer);
            }
        }
    }, [selectedChat?.id, selectedChat?.phone, selectedChat?.messages?.length]);

    // Cargar Historial 360° y Turnos Próximos del paciente
    // Cargar Historial 360° y Turnos Próximos del paciente EXCLUSIVAMENTE por DNI o NHC
    useEffect(() => {
        const targetDni = (crmForm.dni || selectedChat?.customFields?.dni || '').replace(/\D/g, '');
        const targetNhc = selectedChat?.customFields?.nhc || '';
        const targetNombre = crmForm.pacienteNombre || selectedChat?.contactName || '';

        // Vinculación exclusiva por DNI: NO buscar nunca por teléfono
        if (targetDni.length >= 6 || targetNhc) {
            const cacheKey = targetNhc ? `nhc_${targetNhc}` : `dni_${targetDni}`;
            if (patientHistoryCache.current[cacheKey]) {
                setPatientHistory(patientHistoryCache.current[cacheKey]);
                setLoadingHistory(false);
                return;
            }

            setLoadingHistory(true);
            fetchPacienteDetalle({ 
                dni: targetDni || null, 
                nhc: targetNhc || null, 
                telefono: null, 
                nombre: targetNombre 
            })
                .then(det => {
                    if (det) {
                        patientHistoryCache.current[cacheKey] = det;
                    }
                    setPatientHistory(det);
                    // Si encontramos NHC o DNI en el historial y no estaban en crmForm, enriquecer ficha
                    if (det?.nhc && !crmForm.dni && det.dni) {
                        setCrmForm(prev => ({ ...prev, dni: det.dni }));
                    }
                })
                .catch(err => console.warn('Error al cargar historial 360:', err))
                .finally(() => setLoadingHistory(false));
        } else {
            setPatientHistory(null);
        }
    }, [crmForm.dni, selectedChat?.id]);

    // Búsqueda en Padrón SALUS (EXCLUSIVA por DNI o NHC)
    const handleLookupSalus = async () => {
        const queryToSearch = (crmForm.dni || '').trim();
        if (!queryToSearch || queryToSearch.length < 5) {
            alert('Ingresa al menos 5 dígitos del DNI para buscar en SALUS');
            return;
        }
        setIsSearchingSalus(true);
        try {
            const found = await lookupPatientFromSalus(queryToSearch);
            if (found) {
                setCrmForm(prev => ({
                    ...prev,
                    dni: found.dni || prev.dni,
                    pacienteNombre: found.nombre || prev.pacienteNombre,
                    obraSocial: found.coseguro || prev.obraSocial,
                    email: found.email || prev.email,
                    departamento: found.centro || prev.departamento,
                    notas: (prev.notas ? prev.notas + '\n' : '') + `[Padrón SALUS] NHC: ${found.nhc || 'N/A'} - Centro: ${found.centro || 'Sanatorio Argentino'}`
                }));

                if (selectedChat?.customFields) {
                    selectedChat.customFields.dni = found.dni || selectedChat.customFields.dni;
                    selectedChat.customFields.nhc = found.nhc || selectedChat.customFields.nhc;
                    selectedChat.customFields.pacienteNombre = found.nombre || selectedChat.customFields.pacienteNombre;
                    selectedChat.customFields.obraSocial = found.coseguro || selectedChat.customFields.obraSocial;
                    selectedChat.customFields.esPacienteExistente = true;
                }
            } else {
                alert('No se encontró paciente en el Padrón de SALUS con el DNI provisto (' + queryToSearch + ').');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsSearchingSalus(false);
        }
    };

    // Vincular o conmutar ficha médica a otro paciente buscando por su DNI en SALUS (gestión a nombre de terceros)
    const handleLinkThirdPartyDni = async () => {
        const queryToSearch = (thirdPartyDniInput || '').trim();
        if (!queryToSearch || queryToSearch.length < 5) {
            alert('Ingresa un número de DNI válido de al menos 5 dígitos para buscar en SALUS');
            return;
        }
        setIsSearchingSalus(true);
        try {
            const found = await lookupPatientFromSalus(queryToSearch);
            if (found) {
                const birth = found.fecha_nacimiento || '';
                const formattedBirth = birth.includes('/') ? birth : (birth.includes('-') ? `${birth.split('-')[2]}/${birth.split('-')[1]}/${birth.split('-')[0]}` : birth);

                const currentTitularName = selectedChat.customFields?.fichaDual?.titularNombre || selectedChat.contactName || `+${selectedChat.phone}`;

                setCrmForm(prev => ({
                    ...prev,
                    dni: found.dni || prev.dni,
                    pacienteNombre: found.nombre || prev.pacienteNombre,
                    obraSocial: found.coseguro || prev.obraSocial,
                    fechaNacimiento: formattedBirth || prev.fechaNacimiento,
                    email: found.email || prev.email,
                    departamento: found.centro || prev.departamento,
                    notas: (prev.notas ? prev.notas + '\n' : '') + `[Gestión para Tercero] Titular WhatsApp: ${currentTitularName} | Paciente a atender: ${found.nombre} (DNI ${found.dni})`
                }));

                if (selectedChat?.customFields) {
                    selectedChat.customFields.dni = found.dni || selectedChat.customFields.dni;
                    selectedChat.customFields.nhc = found.nhc || selectedChat.customFields.nhc;
                    selectedChat.customFields.pacienteNombre = found.nombre || selectedChat.customFields.pacienteNombre;
                    selectedChat.customFields.obraSocial = found.coseguro || selectedChat.customFields.obraSocial;
                    selectedChat.customFields.fechaNacimiento = formattedBirth || selectedChat.customFields.fechaNacimiento;
                    selectedChat.customFields.email = found.email || selectedChat.customFields.email;
                    selectedChat.customFields.esPacienteExistente = true;
                    selectedChat.customFields.fichaDual = {
                        esGestionTercero: true,
                        parentesco: 'Familiar',
                        titularNombre: currentTitularName,
                        titularTelefono: selectedChat.phone,
                        pacienteNombre: found.nombre,
                        pacienteDni: found.dni,
                        pacienteObraSocial: found.coseguro,
                        pacienteNhc: found.nhc
                    };
                }

                await saveCrmPatientCard({
                    phone: selectedChat.phone,
                    dni: found.dni,
                    nombreCompleto: found.nombre,
                    obraSocial: found.coseguro,
                    fechaNacimiento: formattedBirth,
                    email: found.email,
                    departamento: found.centro || 'San Juan',
                    motivoConsulta: crmForm.motivoConsulta,
                    esGestionTercero: true,
                    titularNombre: currentTitularName,
                    parentesco: 'Familiar',
                    pacienteNombre: found.nombre,
                    pacienteDni: found.dni,
                    pacienteObraSocial: found.coseguro
                });

                showToast(`Ficha Dual vinculada: Titular ${currentTitularName} ➔ Paciente ${found.nombre} (DNI ${found.dni})`, 'success');
                setIsSearchingThirdParty(false);
                setThirdPartyDniInput('');
                setActiveDualTab('paciente');

                if (typeof onReloadChats === 'function') {
                    onReloadChats();
                }
            } else {
                alert(`No se encontró paciente en el padrón de SALUS con el DNI ${queryToSearch}.`);
            }
        } catch (err) {
            console.error(err);
            alert('Error al buscar paciente en SALUS: ' + (err.message || 'Error'));
        } finally {
            setIsSearchingSalus(false);
        }
    };

    // Guardar Ficha CRM
    const handleSaveCrm = async (e) => {
        e?.preventDefault();
        if (!selectedChat?.phone) return;
        setIsSavingCrm(true);
        try {
            await saveCrmPatientCard({
                phone: selectedChat.phone,
                dni: crmForm.dni,
                nombreCompleto: crmForm.pacienteNombre,
                obraSocial: crmForm.obraSocial,
                fechaNacimiento: crmForm.fechaNacimiento,
                email: crmForm.email,
                departamento: crmForm.departamento,
                motivoConsulta: crmForm.motivoConsulta,
                notas: crmForm.notas
            });

            if (selectedChat.customFields) {
                selectedChat.customFields.dni = crmForm.dni;
                selectedChat.customFields.pacienteNombre = crmForm.pacienteNombre;
                selectedChat.customFields.obraSocial = crmForm.obraSocial;
                selectedChat.customFields.fechaNacimiento = crmForm.fechaNacimiento;
                selectedChat.customFields.email = crmForm.email;
                selectedChat.customFields.departamento = crmForm.departamento;
                selectedChat.customFields.motivoConsulta = crmForm.motivoConsulta;
                selectedChat.customFields.notas = crmForm.notas;
                selectedChat.contactName = crmForm.pacienteNombre || selectedChat.contactName;
            }
            setIsEditingCrm(false);
        } catch (err) {
            console.error('Error guardando CRM:', err);
            alert('Error al guardar datos CRM: ' + err.message);
        } finally {
            setIsSavingCrm(false);
        }
    };

    // Confirmar Cierre / Finalización
    const handleConfirmClose = async () => {
        if (!selectedChat?.id || !onCloseChat) return;
        setIsClosingChat(true);
        try {
            await onCloseChat(selectedChat.id, resolutionReason);
            setCloseModalOpen(false);
        } catch (err) {
            console.error('Error cerrando:', err);
        } finally {
            setIsClosingChat(false);
        }
    };

    // Sincronizar estado del bot al cambiar de chat
    useEffect(() => {
        if (selectedChat) {
            setBotActive(selectedChat.botActive !== false && !selectedChat.assignedTo);
        }
    }, [selectedChat?.id, selectedChat?.botActive, selectedChat?.assignedTo]);

    // Búsqueda de médicos en SALUS
    useEffect(() => {
        if (!doctorQuery || doctorQuery.trim().length < 2) {
            setDoctorResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setIsSearchingDoctor(true);
            try {
                const results = await fetchDoctorParameters(doctorQuery.trim());
                setDoctorResults(results);
            } catch (err) {
                console.error(err);
            } finally {
                setIsSearchingDoctor(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [doctorQuery]);

    const handleToggleBot = async () => {
        const newState = !botActive;
        setBotActive(newState);
        if (selectedChat?.phone) {
            await toggleBotActive(selectedChat.phone, newState);
            if (newState && onUnassignChat) {
                onUnassignChat(selectedChat.id);
            }
        }
    };

    const handleOpenResetBotModal = () => {
        if (!selectedChat?.phone) return;
        setResetBotModalOpen(true);
    };

    const handleConfirmResetBot = async () => {
        if (!selectedChat?.phone) return;
        try {
            setIsResettingBot(true);
            setBotActive(true);
            await resetBotWorkflow(selectedChat.phone);
            if (onUnassignChat) onUnassignChat(selectedChat.id);
            setResetBotModalOpen(false);
            showToast(`Flujo del bot reiniciado para ${selectedChat.contactName}. El bot volverá a responder desde el inicio cuando el paciente escriba.`, 'success');
        } catch (err) {
            console.error('Error al reiniciar bot:', err);
            showToast('Error al reiniciar el flujo: ' + (err.message || 'Error'), 'error');
        } finally {
            setIsResettingBot(false);
        }
    };

    // Determinar autorización para responder y bloqueo de chat
    const isAuthorized = isUserAuthorizedForContactCenter(currentUser);
    const isLocked = isChatLockedForUser(selectedChat, activeAgent.id, currentUser);
    const myAliases = [activeAgent.id, activeAgent.username, activeAgent.legacyId].filter(Boolean).map(a => a.toLowerCase());
    const isAssignedToMe = selectedChat.assignedTo && (
        myAliases.includes(selectedChat.assignedTo.toLowerCase()) ||
        (selectedChat.assignedToName || '').toLowerCase().includes(activeAgent.name.toLowerCase())
    );
    const isBot = (selectedChat.status === 'bot' || (selectedChat.botActive && selectedChat.status !== 'sin_asignar' && !selectedChat.assignedTo));
    const isUnassigned = !selectedChat.assignedTo && selectedChat.status === 'sin_asignar';
    const assignedAgentObj = selectedChat.assignedTo ? getAgentById(selectedChat.assignedTo) : null;

    // Regla estricta: Dos agentes no pueden escribir a la vez. Siempre sí o sí deben asignárselo.
    const canWriteMessage = isAssignedToMe && !isClosedOrArchived(selectedChat.status);

    // Detección de otros agentes leyendo la conversación actual ("El Ojito")
    const otherViewersForCurrentChat = useMemo(() => {
        if (!selectedChat?.id && !selectedChat?.phone) return [];
        const normSelectedPhone = selectedChat.phone ? normalizeArgentinePhone(selectedChat.phone) : null;
        const myId = (activeAgent?.id || '').toLowerCase();
        const myName = (activeAgent?.name || '').toLowerCase();

        return activePresences.filter(p => {
            const pAgentId = (p.agentId || '').toLowerCase();
            const pAgentName = (p.agentName || '').toLowerCase();
            const isMe = pAgentId === myId || (myName && pAgentName.includes(myName));
            if (isMe) return false;

            const matchId = p.chatId && selectedChat.id && String(p.chatId) === String(selectedChat.id);
            const matchPhone = p.phone && normSelectedPhone && p.phone === normSelectedPhone;
            return matchId || matchPhone;
        });
    }, [activePresences, selectedChat?.id, selectedChat?.phone, activeAgent?.id, activeAgent?.name]);

    // Helper para detectar qué agentes están leyendo cualquier chat de la lista
    const getViewersForChat = (chat) => {
        if (!chat) return [];
        const normChatPhone = chat.phone ? normalizeArgentinePhone(chat.phone) : null;
        const myId = (activeAgent?.id || '').toLowerCase();
        const myName = (activeAgent?.name || '').toLowerCase();

        return activePresences.filter(p => {
            const pAgentId = (p.agentId || '').toLowerCase();
            const pAgentName = (p.agentName || '').toLowerCase();
            const isMe = pAgentId === myId || (myName && pAgentName.includes(myName));
            if (isMe) return false;

            const matchId = p.chatId && chat.id && String(p.chatId) === String(chat.id);
            const matchPhone = p.phone && normChatPhone && p.phone === normChatPhone;
            return matchId || matchPhone;
        });
    };

    // ── BUSCADOR INTELIGENTE DE CHATS (NOMBRE, DNI, TELÉFONO, MENSAJES Y ANÁLISIS IA) ──
    const normalizeSearch = (s) => {
        if (!s) return '';
        return String(s)
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
    };

    const getSearchMatchInfo = (chat, term) => {
        if (!term || !term.trim()) return { isMatch: true, matchType: null, snippet: null };

        const q = normalizeSearch(term);
        const digits = term.replace(/\D/g, '');
        const tokens = q.split(/\s+/).filter(t => t.length >= 2);

        // 1. DNI (coincidencia con o sin puntos/guiones)
        const dniRaw = chat.customFields?.dni || '';
        const dniDigits = dniRaw.replace(/\D/g, '');
        if (digits && digits.length >= 4 && dniDigits.includes(digits)) {
            return { isMatch: true, matchType: 'dni', matchText: `DNI: ${dniRaw || digits}` };
        }
        if (dniRaw && normalizeSearch(dniRaw).includes(q)) {
            return { isMatch: true, matchType: 'dni', matchText: `DNI: ${dniRaw}` };
        }

        // 2. Nombre de Paciente / Contacto / Familiar
        const cleanName = getCleanChatName(chat);
        const normCleanName = normalizeSearch(cleanName);
        const normPaciente = normalizeSearch(chat.customFields?.pacienteNombre);
        const normContact = normalizeSearch(chat.contactName);
        if (normCleanName.includes(q) || normPaciente.includes(q) || normContact.includes(q)) {
            return { isMatch: true, matchType: 'nombre', matchText: cleanName };
        }
        if (tokens.length > 1 && (tokens.every(t => normCleanName.includes(t)) || tokens.every(t => normPaciente.includes(t)))) {
            return { isMatch: true, matchType: 'nombre', matchText: cleanName };
        }

        // 3. Teléfono
        const phoneDigits = (chat.phone || '').replace(/\D/g, '');
        if (digits && digits.length >= 4 && phoneDigits.includes(digits)) {
            return { isMatch: true, matchType: 'telefono', matchText: `+${chat.phone}` };
        }

        // 4. Búsqueda profunda en CADA mensaje del historial
        const msgs = chat.messages || [];
        for (let i = msgs.length - 1; i >= 0; i--) {
            const m = msgs[i];
            const mText = m.text || m.content || '';
            const normMText = normalizeSearch(mText);
            const mCaption = m.caption || '';
            const normCaption = normalizeSearch(mCaption);
            const orderStudy = m.orderAnalysis?.estudioDetectado || '';
            const normStudy = normalizeSearch(orderStudy);
            const orderDiag = m.orderAnalysis?.diagnostico || '';
            const normDiag = normalizeSearch(orderDiag);

            // DNI escrito en el cuerpo del mensaje por el paciente o bot
            if (digits && digits.length >= 6) {
                const msgDigits = mText.replace(/\D/g, '');
                if (msgDigits.includes(digits)) {
                    const idx = mText.indexOf(digits);
                    const start = Math.max(0, idx - 15);
                    const end = Math.min(mText.length, idx + digits.length + 20);
                    const snippet = (start > 0 ? '...' : '') + mText.substring(start, end).replace(/\n+/g, ' ').trim() + (end < mText.length ? '...' : '');
                    return { isMatch: true, matchType: 'dni_en_mensaje', snippet, messageDate: m.timestamp };
                }
            }

            // Coincidencia de texto dentro del mensaje
            if (normMText && (normMText.includes(q) || (tokens.length > 1 && tokens.every(t => normMText.includes(t))))) {
                const matchWord = tokens.length > 0 && !normMText.includes(q) ? tokens[0] : q;
                const matchIdx = normMText.indexOf(matchWord);
                const start = Math.max(0, matchIdx - 20);
                const end = Math.min(mText.length, matchIdx + matchWord.length + 40);
                const snippet = (start > 0 ? '...' : '') + mText.substring(start, end).replace(/\n+/g, ' ').trim() + (end < mText.length ? '...' : '');
                return {
                    isMatch: true,
                    matchType: 'mensaje',
                    snippet,
                    sender: m.senderName || (m.sender === 'patient' ? 'Paciente' : 'Sanatorio'),
                    messageDate: m.timestamp
                };
            }

            if (normCaption && normCaption.includes(q)) {
                return { isMatch: true, matchType: 'adjunto', snippet: `Adjunto: "${mCaption.slice(0, 45)}"`, messageDate: m.timestamp };
            }

            if (normStudy && normStudy.includes(q)) {
                return { isMatch: true, matchType: 'orden_medica', snippet: `Orden Médica: "${orderStudy}"`, messageDate: m.timestamp };
            }

            if (normDiag && normDiag.includes(q)) {
                return { isMatch: true, matchType: 'orden_medica', snippet: `Diagnóstico: "${orderDiag}"`, messageDate: m.timestamp };
            }
        }

        // 5. Último mensaje, motivo de consulta, resumen IA u obra social
        if (normalizeSearch(chat.lastMessage).includes(q)) {
            return { isMatch: true, matchType: 'mensaje', snippet: chat.lastMessage };
        }
        if (normalizeSearch(chat.customFields?.motivoConsulta).includes(q)) {
            return { isMatch: true, matchType: 'motivo', matchText: `Motivo: ${chat.customFields.motivoConsulta}` };
        }
        if (normalizeSearch(chat.customFields?.obraSocial).includes(q)) {
            return { isMatch: true, matchType: 'obra_social', matchText: `OS: ${chat.customFields.obraSocial}` };
        }
        if (normalizeSearch(chat.aiSummary).includes(q)) {
            return { isMatch: true, matchType: 'resumen_ia', snippet: `IA: ${chat.aiSummary.slice(0, 55)}...` };
        }

        return { isMatch: false, matchType: null, snippet: null };
    };

    const isSearching = !!searchTerm.trim();

    // Evaluar todas las conversaciones con el buscador
    const searchedChats = useMemo(() => {
        if (!isSearching) return [];
        return chats.map(chat => {
            const matchInfo = getSearchMatchInfo(chat, searchTerm);
            return matchInfo.isMatch ? { ...chat, _searchMatch: matchInfo } : null;
        }).filter(Boolean);
    }, [chats, searchTerm]);

    // Filtrar chats según pestaña activa o alcance de búsqueda
    const filteredChats = useMemo(() => {
        if (isSearching) {
            if (searchScope === 'all') {
                return [...searchedChats].sort((a, b) => (b.lastMessageTimestamp || 0) - (a.lastMessageTimestamp || 0));
            } else {
                return searchedChats.filter(chat => {
                    const chatAssigned = (chat.assignedTo || '').toLowerCase();
                    const isMine = chatAssigned && (
                        myAliases.includes(chatAssigned) ||
                        (chat.assignedToName || '').toLowerCase().includes(activeAgent.name.toLowerCase())
                    );
                    const closed = isClosedOrArchived(chat.status);
                    const isChatBot = (chat.status === 'bot' || (chat.botActive && chat.status !== 'sin_asignar' && !chat.assignedTo)) && !closed;
                    const isChatUnassigned = !chat.assignedTo && chat.status === 'sin_asignar' && !closed;

                    if (filterTab === 'bot') return isChatBot;
                    if (filterTab === 'sin_asignar') return isChatUnassigned;
                    if (filterTab === 'asignadas_mi') return isMine && !closed;
                    if (filterTab === 'asignadas_otros') return chatAssigned && !isMine && !closed;
                    if (filterTab === 'finalizados' || filterTab === 'archivadas' || filterTab === 'cerrados') return closed;
                    if (filterTab === 'todos') return true;
                    return !closed;
                }).sort((a, b) => (b.lastMessageTimestamp || 0) - (a.lastMessageTimestamp || 0));
            }
        }

        return chats.filter(chat => {
            const chatAssigned = (chat.assignedTo || '').toLowerCase();
            const isMine = chatAssigned && (
                myAliases.includes(chatAssigned) ||
                (chat.assignedToName || '').toLowerCase().includes(activeAgent.name.toLowerCase())
            );
            const closed = isClosedOrArchived(chat.status);
            const isChatBot = (chat.status === 'bot' || (chat.botActive && chat.status !== 'sin_asignar' && !chat.assignedTo)) && !closed;
            const isChatUnassigned = !chat.assignedTo && chat.status === 'sin_asignar' && !closed;

            if (filterTab === 'bot') return isChatBot;
            if (filterTab === 'sin_asignar') return isChatUnassigned;
            if (filterTab === 'asignadas_mi') return isMine && !closed;
            if (filterTab === 'asignadas_otros') return chatAssigned && !isMine && !closed;
            if (filterTab === 'finalizados' || filterTab === 'archivadas' || filterTab === 'cerrados') return closed;
            if (filterTab === 'todos') return true;
            return !closed;
        }).sort((a, b) => (b.lastMessageTimestamp || 0) - (a.lastMessageTimestamp || 0));
    }, [chats, isSearching, searchScope, searchedChats, filterTab, myAliases, activeAgent.name]);

    // Conversaciones seleccionables para cierre masivo (excluye las ya finalizadas)
    const selectableChats = useMemo(() => {
        return filteredChats.filter(c => !isClosedOrArchived(c.status));
    }, [filteredChats]);

    const toggleSelectChat = (chatId) => {
        setSelectedChatIds(prev => {
            const next = new Set(prev);
            if (next.has(chatId)) {
                next.delete(chatId);
            } else {
                next.add(chatId);
            }
            return next;
        });
    };

    const handleSelectAllVisible = () => {
        if (!selectableChats.length) return;
        const allSelected = selectableChats.every(c => selectedChatIds.has(c.id));
        if (allSelected) {
            setSelectedChatIds(prev => {
                const next = new Set(prev);
                selectableChats.forEach(c => next.delete(c.id));
                return next;
            });
        } else {
            setSelectedChatIds(prev => {
                const next = new Set(prev);
                selectableChats.forEach(c => next.add(c.id));
                return next;
            });
        }
    };

    const handleClearSelection = () => {
        setSelectedChatIds(new Set());
    };

    const handleConfirmBulkClose = async () => {
        if (!selectedChatIds.size || !onBulkCloseChats) return;
        setIsBulkClosing(true);
        try {
            await onBulkCloseChats(Array.from(selectedChatIds), bulkResolutionReason);
            setSelectedChatIds(new Set());
            setBulkCloseModalOpen(false);
        } catch (err) {
            console.error('Error cerrando masivamente:', err);
        } finally {
            setIsBulkClosing(false);
        }
    };

    // === Gestión de archivos adjuntos (Excel, Word, PDF, TXT, Imágenes, Audios) ===
    const handleFileSelected = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';

        if (file.size > 50 * 1024 * 1024) {
            alert('El archivo seleccionado supera el límite de 50 MB.');
            return;
        }

        let detectedType = 'document';
        if (file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(file.name)) {
            detectedType = 'image';
        } else if (file.type.startsWith('audio/') || /\.(mp3|wav|ogg|oga|m4a|aac|webm)$/i.test(file.name)) {
            detectedType = 'audio';
        }

        setSelectedFile({
            file,
            name: file.name,
            size: (file.size / 1024).toFixed(1) + ' KB',
            type: detectedType,
            previewUrl: detectedType === 'image' ? URL.createObjectURL(file) : null
        });
    };

    const handleRemoveSelectedFile = () => {
        if (selectedFile?.previewUrl) {
            URL.revokeObjectURL(selectedFile.previewUrl);
        }
        setSelectedFile(null);
    };

    // === Grabación de notas de voz (Audio) ===
    const startAudioRecording = async () => {
        if (!canWriteMessage) {
            alert('Debes asignarte la conversación antes de enviar un audio.');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
                ? 'audio/webm;codecs=opus' 
                : MediaRecorder.isTypeSupported('audio/webm') 
                    ? 'audio/webm' 
                    : 'audio/ogg';
            const mediaRecorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = mediaRecorder;
            recordingChunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    recordingChunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                const blob = new Blob(recordingChunksRef.current, { type: mimeType });
                if (blob.size < 1000) {
                    setUploadError('Audio demasiado corto');
                    setTimeout(() => setUploadError(null), 3000);
                    return;
                }
                await sendAudioRecording(blob, mimeType);
            };

            mediaRecorder.start(250);
            setIsRecordingAudio(true);
            setRecordingTime(0);
            recordingTimerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);
        } catch (err) {
            console.error('Error al acceder al micrófono:', err);
            setUploadError('No se pudo acceder al micrófono. Verifique los permisos del navegador.');
            setTimeout(() => setUploadError(null), 4000);
        }
    };

    const stopAudioRecording = () => {
        if (mediaRecorderRef.current && isRecordingAudio) {
            mediaRecorderRef.current.stop();
            setIsRecordingAudio(false);
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
                recordingTimerRef.current = null;
            }
        }
    };

    const cancelAudioRecording = () => {
        if (mediaRecorderRef.current && isRecordingAudio) {
            mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
            mediaRecorderRef.current.stop();
            recordingChunksRef.current = [];
            setIsRecordingAudio(false);
            setRecordingTime(0);
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
                recordingTimerRef.current = null;
            }
        }
    };

    const sendAudioRecording = async (blob, mimeType) => {
        try {
            setUploadingMedia(true);
            const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
            const audioFile = new File([blob], `audio_${Date.now()}.${ext}`, { type: mimeType });
            const uploaded = await uploadContactCenterMedia(audioFile, 'audios');
            
            onSendMessage(
                selectedChat.id,
                '🎤 Audio',
                isPrivateNote,
                uploaded.publicUrl,
                'audio',
                audioFile.name
            );
        } catch (err) {
            console.error('Error subiendo audio:', err);
            setUploadError('Error al subir o enviar la nota de voz');
            setTimeout(() => setUploadError(null), 4000);
        } finally {
            setUploadingMedia(false);
            setRecordingTime(0);
        }
    };

    const sendDirectMessage = async (text, isNote = false) => {
        if (!isAuthorized) {
            alert('No tienes autorización para responder en el Contact Center. Solo las 4 agentes asignadas y Lucas Marinero tienen permisos de respuesta.');
            return;
        }
        if (!canWriteMessage) {
            alert('Debes asignarte la conversación antes de responder para evitar que dos agentes escriban a la vez.');
            return;
        }
        if (isLocked) {
            alert(`Esta conversación está asignada exclusivamente a ${assignedAgentObj?.name || 'otra agente'}. Modo solo lectura.`);
            return;
        }

        // Si hay un archivo adjunto seleccionado
        if (selectedFile) {
            try {
                setUploadingMedia(true);
                const folder = selectedFile.type === 'image' ? 'images' : selectedFile.type === 'audio' ? 'audios' : 'documents';
                const uploaded = await uploadContactCenterMedia(selectedFile.file, folder);

                onSendMessage(
                    selectedChat.id,
                    (text || '').trim(),
                    isNote,
                    uploaded.publicUrl,
                    selectedFile.type,
                    selectedFile.name
                );

                handleRemoveSelectedFile();
                setMessageInput('');
                setQuickRepliesOpen(false);
                setQuickRepliesModalOpen(false);
                return;
            } catch (err) {
                console.error('Error enviando archivo adjunto:', err);
                alert(`Error al enviar adjunto: ${err.message || 'Fallo de subida'}`);
                return;
            } finally {
                setUploadingMedia(false);
            }
        }

        if (!text || !text.trim()) return;

        onSendMessage(selectedChat.id, text.trim(), isNote);
        setMessageInput('');
        setQuickRepliesOpen(false);
        setQuickRepliesModalOpen(false);
    };

    const handleSend = (e) => {
        e?.preventDefault?.();
        if (!canWriteMessage) {
            alert('Debes asignarte la conversación antes de responder para evitar que dos agentes escriban a la vez.');
            return;
        }
        if (!messageInput.trim() && !selectedFile) return;

        let textToSend = messageInput.trim();
        // Si el usuario escribió un atajo (ej: /dan o /bosi), resolverlo de inmediato
        if (textToSend.startsWith('/')) {
            const found = findQuickReplyByShortcut(textToSend);
            if (found) {
                textToSend = found.content;
            }
        }

        sendDirectMessage(textToSend, isPrivateNote);
    };

    const handleInputChange = (e) => {
        const val = e.target.value;
        setMessageInput(val);

        if (val.startsWith('/')) {
            const query = val.slice(1);
            setQuickReplyFilter(query);
            setQuickRepliesOpen(true);
            setSelectedQuickReplyIndex(0);
        } else {
            setQuickRepliesOpen(false);
        }
    };

    const handleInputKeyDown = (e) => {
        if (!quickRepliesOpen) {
            if (e.key === 'Enter' && !e.shiftKey) {
                if (!canWriteMessage) {
                    e.preventDefault();
                    return;
                }
                handleSend(e);
            }
            return;
        }

        const currentMatches = filterQuickReplies(quickReplyFilter);

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedQuickReplyIndex(prev => (prev + 1) % Math.max(1, currentMatches.length));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedQuickReplyIndex(prev => (prev - 1 + Math.max(1, currentMatches.length)) % Math.max(1, currentMatches.length));
        } else if (e.key === 'Escape') {
            setQuickRepliesOpen(false);
        } else if (e.key === 'Tab') {
            // Tab autocompleta el texto en el input para poder editarlo
            e.preventDefault();
            const targetItem = currentMatches[selectedQuickReplyIndex] || currentMatches[0];
            if (targetItem) {
                setMessageInput(resolveQuickReplyText(targetItem.content));
                setQuickRepliesOpen(false);
            }
        } else if (e.key === 'Enter' && !e.shiftKey) {
            // Enter envía inmediatamente el atajo
            e.preventDefault();
            const matchedByDirectCmd = findQuickReplyByShortcut(messageInput);
            const targetItem = matchedByDirectCmd || currentMatches[selectedQuickReplyIndex] || currentMatches[0];

            if (targetItem) {
                sendDirectMessage(resolveQuickReplyText(targetItem.content), isPrivateNote);
            } else {
                handleSend(e);
            }
        }
    };

    return (
        <div 
            ref={consoleContainerRef}
            style={{
                display: 'grid',
                gridTemplateColumns: `330px 1fr 6px ${rightPanelWidth}px`,
                height: 'calc(100vh - 78px)',
                maxHeight: 'calc(100vh - 78px)',
                minHeight: '480px',
                background: ccTheme.leftSidebarBg || '#FFFFFF',
                borderRadius: '14px',
                border: `1px solid ${ccTheme.leftSidebarBorder || '#E2E8F0'}`,
                overflow: 'hidden',
                boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
                userSelect: isDraggingRight ? 'none' : 'auto'
            }}
        >
            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* COLUMNA 1: SIDEBAR DE CONTACT CENTER (MÓDULOS + AGENTES + FILTROS) */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                minHeight: 0,
                borderRight: `1px solid ${ccTheme.leftSidebarBorder || '#E2E8F0'}`,
                background: ccTheme.leftSidebarBg || '#FFFFFF',
                color: ccTheme.leftSidebarText || '#0F172A'
            }}>

                {/* 1. NAVEGACIÓN DEL MÓDULO (IMAGEN 2) Y SELECTOR DE AGENTES */}
                <div style={{
                    padding: '8px 8px 6px',
                    borderBottom: `1px solid ${ccTheme.leftSidebarBorder || '#F1F5F9'}`,
                    background: ccTheme.leftSidebarHeaderBg || '#F8FAFC',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                }}>
                    {/* Identificación de Operador y Controles de Sonido / Sincronización */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '6px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                color: '#475569',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                background: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                padding: '3px 8px',
                                borderRadius: '6px'
                            }}>
                                <span style={{
                                    width: '7px',
                                    height: '7px',
                                    borderRadius: '50%',
                                    background: isAuthorized ? '#10B981' : '#94A3B8'
                                }} />
                                <span>Operador:</span>
                                <strong style={{ color: activeAgent.color || '#0F2942' }}>{activeAgent.fullName || activeAgent.name}</strong>
                            </span>
                        </div>

                        {/* Sonido, Tema y Sync */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                            <button
                                type="button"
                                onClick={() => setThemeModalOpen(true)}
                                title="Personalizar tema, imagen de fondo y colores"
                                style={{
                                    padding: '3px 7px', borderRadius: '5px',
                                    border: `1px solid ${ccTheme.id !== 'default' ? '#0284C7' : '#CBD5E1'}`,
                                    background: ccTheme.id !== 'default' ? '#0284C7' : '#FFFFFF',
                                    color: ccTheme.id !== 'default' ? '#FFFFFF' : '#0284C7',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px',
                                    fontSize: '0.66rem', fontWeight: 700
                                }}
                            >
                                <Palette size={12} />
                                <span>Tema</span>
                            </button>
                            <button
                                type="button"
                                onClick={onToggleSound}
                                title={soundEnabled ? 'Silenciar avisos sonoros' : 'Activar sonido de nuevos mensajes'}
                                style={{
                                    padding: '3px 6px', borderRadius: '5px', border: '1px solid #CBD5E1',
                                    background: soundEnabled ? '#F0FDF4' : '#FFFFFF',
                                    color: soundEnabled ? '#16A34A' : '#94A3B8',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center'
                                }}
                            >
                                {soundEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
                            </button>
                            <button
                                type="button"
                                onClick={onReloadChats}
                                disabled={loadingLive}
                                title="Forzar sincronización inmediata"
                                style={{
                                    padding: '3px 6px', borderRadius: '5px', border: '1px solid #CBD5E1',
                                    background: '#FFFFFF', color: '#0284C7',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center'
                                }}
                            >
                                <RefreshCw size={12} className={loadingLive ? 'spin' : ''} />
                            </button>
                        </div>
                    </div>
                </div>
                {/* BUSCADOR DE CHATS A MANO (NOMBRE, DNI, TELÉFONO O TEXTO EN MENSAJES) */}
                <div style={{ padding: '8px 10px', borderBottom: `1px solid ${ccTheme.leftSidebarBorder || '#E2E8F0'}`, background: ccTheme.leftSidebarBg || '#FFFFFF' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: isSearching ? (ccTheme.isDark ? '#1E3A5F' : '#F0F9FF') : themeCardBg,
                        border: `1.5px solid ${isSearching ? (ccTheme.accentColor || '#0284C7') : themeCardBorder}`,
                        borderRadius: '8px',
                        padding: '6px 10px',
                        transition: 'all 0.15s ease',
                        boxShadow: isSearching ? '0 0 0 2px rgba(2, 132, 199, 0.15)' : 'none'
                    }}>
                        <Search size={15} color={isSearching ? (ccTheme.accentColor || '#0284C7') : themeCardSubtext} style={{ flexShrink: 0 }} />
                        <input 
                            ref={searchInputRef}
                            type="text"
                            placeholder="Buscar por nombre, DNI o texto en mensajes... (Atajo: /)"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                border: 'none',
                                background: 'transparent',
                                outline: 'none',
                                fontSize: '0.78rem',
                                color: ccTheme.leftSidebarText || '#0F172A',
                                width: '100%',
                                fontWeight: 500
                            }}
                        />
                        {searchTerm ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setSearchTerm('');
                                    searchInputRef.current?.focus();
                                }}
                                title="Limpiar búsqueda (Esc)"
                                style={{
                                    border: 'none',
                                    background: '#E2E8F0',
                                    borderRadius: '50%',
                                    width: '18px',
                                    height: '18px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    color: '#475569',
                                    padding: 0,
                                    flexShrink: 0
                                }}
                            >
                                <X size={11} />
                            </button>
                        ) : (
                            <span 
                                title="Atajo de teclado: presiona / o Ctrl+K para buscar"
                                style={{
                                    fontSize: '0.62rem',
                                    color: '#94A3B8',
                                    background: '#F1F5F9',
                                    border: '1px solid #CBD5E1',
                                    borderRadius: '4px',
                                    padding: '1px 5px',
                                    fontWeight: 700,
                                    userSelect: 'none',
                                    flexShrink: 0
                                }}
                            >
                                /
                            </span>
                        )}
                    </div>

                    {/* Selector de Alcance y Contador al Buscar */}
                    {isSearching && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginTop: '6px',
                            padding: '2px 2px 0 2px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <button
                                    type="button"
                                    onClick={() => setSearchScope('all')}
                                    style={{
                                        fontSize: '0.66rem',
                                        fontWeight: 700,
                                        padding: '2px 7px',
                                        borderRadius: '4px',
                                        border: 'none',
                                        cursor: 'pointer',
                                        background: searchScope === 'all' ? '#0284C7' : '#F1F5F9',
                                        color: searchScope === 'all' ? '#FFFFFF' : '#475569'
                                    }}
                                >
                                    🌐 Todos ({searchedChats.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSearchScope('tab')}
                                    style={{
                                        fontSize: '0.66rem',
                                        fontWeight: 700,
                                        padding: '2px 7px',
                                        borderRadius: '4px',
                                        border: 'none',
                                        cursor: 'pointer',
                                        background: searchScope === 'tab' ? '#0284C7' : '#F1F5F9',
                                        color: searchScope === 'tab' ? '#FFFFFF' : '#475569'
                                    }}
                                >
                                    📂 En esta pestaña ({filteredChats.length})
                                </button>
                            </div>
                            <span style={{ fontSize: '0.66rem', color: '#0284C7', fontWeight: 700 }}>
                                {filteredChats.length} {filteredChats.length === 1 ? 'coincidencia' : 'coincidencias'}
                            </span>
                        </div>
                    )}
                </div>

                {/* Pestañas de Filtros Superiores AsisteClick */}
                <div style={{
                    display: 'flex',
                    gap: '4px',
                    padding: '8px 8px',
                    borderBottom: `1px solid ${ccTheme.leftSidebarBorder || '#F1F5F9'}`,
                    overflowX: 'auto',
                    background: ccTheme.leftSidebarHeaderBg || (ccTheme.isDark ? '#0F172A' : '#FAFAFA')
                }}>
                    <button 
                        onClick={() => {
                            setFilterTab('bot');
                            const first = chats.find(c => (c.status === 'bot' || (c.botActive && c.status !== 'sin_asignar' && !c.assignedTo)) && !isClosedOrArchived(c.status));
                            if (first && onSelectChat) onSelectChat(first.id);
                        }}
                        style={{
                            padding: '4px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                            border: filterTab === 'bot' ? 'none' : `1px solid ${themeCardBorder}`,
                            cursor: 'pointer', whiteSpace: 'nowrap',
                            background: filterTab === 'bot' ? '#7C3AED' : themeCardBg,
                            color: filterTab === 'bot' ? '#FFFFFF' : themeCardText,
                            boxShadow: filterTab === 'bot' ? '0 2px 4px rgba(124, 58, 237, 0.25)' : 'none',
                            display: 'flex', alignItems: 'center', gap: '4px'
                        }}
                    >
                        🤖 Bot ({chats.filter(c => (c.status === 'bot' || (c.botActive && c.status !== 'sin_asignar' && !c.assignedTo)) && !isClosedOrArchived(c.status)).length})
                    </button>
                    <button 
                        onClick={() => {
                            setFilterTab('sin_asignar');
                            const first = chats.find(c => (!c.assignedTo && c.status === 'sin_asignar') && !isClosedOrArchived(c.status));
                            if (first && onSelectChat) onSelectChat(first.id);
                        }}
                        style={{
                            padding: '4px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                            border: filterTab === 'sin_asignar' ? 'none' : `1px solid ${themeCardBorder}`,
                            cursor: 'pointer', whiteSpace: 'nowrap',
                            background: filterTab === 'sin_asignar' ? (ccTheme.accentColor || '#0284C7') : themeCardBg,
                            color: filterTab === 'sin_asignar' ? '#FFFFFF' : themeCardText,
                            boxShadow: filterTab === 'sin_asignar' ? '0 2px 4px rgba(2,132,199,0.25)' : 'none'
                        }}
                    >
                        Sin asignar ({chats.filter(c => (!c.assignedTo && c.status === 'sin_asignar') && !isClosedOrArchived(c.status)).length})
                    </button>
                    <button 
                        onClick={() => {
                            setFilterTab('asignadas_mi');
                            const first = chats.find(c => {
                                const a = (c.assignedTo || '').toLowerCase();
                                return (myAliases.includes(a) || (c.assignedToName || '').toLowerCase().includes(activeAgent.name.toLowerCase())) && !isClosedOrArchived(c.status);
                            });
                            if (first && onSelectChat) onSelectChat(first.id);
                        }}
                        style={{
                            padding: '4px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                            border: filterTab === 'asignadas_mi' ? 'none' : `1px solid ${themeCardBorder}`,
                            cursor: 'pointer', whiteSpace: 'nowrap',
                            background: filterTab === 'asignadas_mi' ? (ccTheme.accentColor || '#0284C7') : themeCardBg,
                            color: filterTab === 'asignadas_mi' ? '#FFFFFF' : themeCardText
                        }}
                    >
                        Mis chats ({chats.filter(c => {
                            const a = (c.assignedTo || '').toLowerCase();
                            return (myAliases.includes(a) || (c.assignedToName || '').toLowerCase().includes(activeAgent.name.toLowerCase())) && !isClosedOrArchived(c.status);
                        }).length})
                    </button>
                    <button 
                        onClick={() => {
                            setFilterTab('asignadas_otros');
                            const first = chats.find(c => {
                                const a = (c.assignedTo || '').toLowerCase();
                                return a && !myAliases.includes(a) && !(c.assignedToName || '').toLowerCase().includes(activeAgent.name.toLowerCase()) && !isClosedOrArchived(c.status);
                            });
                            if (first && onSelectChat) onSelectChat(first.id);
                        }}
                        style={{
                            padding: '4px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                            border: filterTab === 'asignadas_otros' ? 'none' : `1px solid ${themeCardBorder}`,
                            cursor: 'pointer', whiteSpace: 'nowrap',
                            background: filterTab === 'asignadas_otros' ? (ccTheme.accentColor || '#0284C7') : themeCardBg,
                            color: filterTab === 'asignadas_otros' ? '#FFFFFF' : themeCardText
                        }}
                    >
                        Otras ({chats.filter(c => {
                            const a = (c.assignedTo || '').toLowerCase();
                            return a && !myAliases.includes(a) && !(c.assignedToName || '').toLowerCase().includes(activeAgent.name.toLowerCase()) && !isClosedOrArchived(c.status);
                        }).length})
                    </button>
                    <button 
                        onClick={() => {
                            setFilterTab('finalizados');
                            const first = chats.find(c => isClosedOrArchived(c.status));
                            if (first && onSelectChat) onSelectChat(first.id);
                        }}
                        style={{
                            padding: '4px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                            border: filterTab === 'finalizados' ? 'none' : `1px solid ${themeCardBorder}`,
                            cursor: 'pointer', whiteSpace: 'nowrap',
                            background: filterTab === 'finalizados' ? '#059669' : themeCardBg,
                            color: filterTab === 'finalizados' ? '#FFFFFF' : themeCardText,
                            boxShadow: filterTab === 'finalizados' ? '0 2px 4px rgba(5,150,105,0.25)' : 'none',
                            display: 'flex', alignItems: 'center', gap: '3px'
                        }}
                    >
                        <Archive size={11} /> Finalizados ({chats.filter(c => isClosedOrArchived(c.status)).length})
                    </button>
                    <button 
                        onClick={() => {
                            setFilterTab('todos');
                            if (chats.length > 0 && onSelectChat) onSelectChat(chats[0].id);
                        }}
                        style={{
                            padding: '4px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                            border: filterTab === 'todos' ? 'none' : `1px solid ${themeCardBorder}`,
                            cursor: 'pointer', whiteSpace: 'nowrap',
                            background: filterTab === 'todos' ? (ccTheme.accentColor || '#0284C7') : themeCardBg,
                            color: filterTab === 'todos' ? '#FFFFFF' : themeCardText
                        }}
                    >
                        Todos ({chats.length})
                    </button>
                </div>

                {/* BARRA DE SELECCIÓN Y CIERRE MASIVO SILENCIOSO */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: selectedChatIds.size > 0 
                        ? themeCardSelectedBg 
                        : (ccTheme.leftSidebarHeaderBg || (ccTheme.isDark ? '#0F172A' : '#F8FAFC')),
                    borderBottom: `1px solid ${ccTheme.leftSidebarBorder || '#E2E8F0'}`,
                    transition: 'background 0.15s ease',
                    fontSize: '0.74rem'
                }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 700, color: themeCardText, userSelect: 'none' }}>
                        <input
                            type="checkbox"
                            checked={selectableChats.length > 0 && selectableChats.every(c => selectedChatIds.has(c.id))}
                            onChange={handleSelectAllVisible}
                            disabled={selectableChats.length === 0}
                            style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: ccTheme.accentColor || '#2563EB' }}
                        />
                        <span>
                            {selectedChatIds.size > 0 
                                ? `${selectedChatIds.size} seleccionados` 
                                : `Seleccionar todos (${selectableChats.length})`}
                        </span>
                    </label>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {selectedChatIds.size > 0 ? (
                            <>
                                <button
                                    type="button"
                                    onClick={handleClearSelection}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: themeCardSubtext,
                                        fontSize: '0.72rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        padding: '3px 6px'
                                    }}
                                >
                                    Deseleccionar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setBulkCloseModalOpen(true)}
                                    style={{
                                        background: '#DC2626',
                                        color: '#FFFFFF',
                                        border: 'none',
                                        borderRadius: '6px',
                                        padding: '4px 10px',
                                        fontSize: '0.72rem',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        boxShadow: '0 2px 4px rgba(220, 38, 38, 0.25)'
                                    }}
                                    title="Finalizar todas las conversaciones seleccionadas sin enviar mensajes"
                                >
                                    <CheckCircle2 size={13} />
                                    Finalizar ({selectedChatIds.size})
                                </button>
                            </>
                        ) : (
                            <span style={{ fontSize: '0.68rem', color: themeCardSubtext }}>
                                {filteredChats.length} {filteredChats.length === 1 ? 'chat' : 'chats'}
                            </span>
                        )}
                    </div>
                </div>

                {/* Lista de Chats con Tags de Asignación y Último en Responder */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {filteredChats.length === 0 ? (
                        <div style={{ padding: '36px 16px', textAlign: 'center', color: themeCardSubtext }}>
                            {isSearching ? (
                                <>
                                    <Search size={28} color={themeCardSubtext} style={{ margin: '0 auto 8px', opacity: 0.6 }} />
                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: themeCardText, marginBottom: '4px' }}>
                                        Sin resultados para "{searchTerm}"
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: themeCardSubtext, lineHeight: '1.4', maxWidth: '240px', margin: '0 auto 12px' }}>
                                        Verifica el DNI, apellido del paciente o busca palabras clave dentro de los mensajes.
                                    </div>
                                    {searchScope === 'tab' && searchedChats.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setSearchScope('all')}
                                            style={{
                                                fontSize: '0.72rem', fontWeight: 700, padding: '5px 12px',
                                                background: themeCardSelectedBg, color: ccTheme.accentColor || '#1E40AF', border: `1px solid ${themeCardBorder}`,
                                                borderRadius: '6px', cursor: 'pointer', marginBottom: '8px'
                                            }}
                                        >
                                            Ver {searchedChats.length} coincidencias en otras carpetas
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setSearchTerm('')}
                                        style={{
                                            display: 'block', margin: '6px auto 0',
                                            fontSize: '0.72rem', color: ccTheme.accentColor || '#0284C7', background: 'transparent',
                                            border: 'none', cursor: 'pointer', textDecoration: 'underline'
                                        }}
                                    >
                                        Limpiar búsqueda
                                    </button>
                                </>
                            ) : (
                                <>
                                    <MessageSquare size={24} color={themeCardSubtext} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: themeCardSubtext }}>No hay conversaciones en esta carpeta</div>
                                </>
                            )}
                        </div>
                    ) : (
                        filteredChats.map(chat => {
                            const isSelected = chat.id === selectedChat.id;
                            const isChecked = selectedChatIds.has(chat.id);
                            const isClosed = isClosedOrArchived(chat.status);
                            const assignedAgent = chat.assignedTo ? getAgentById(chat.assignedTo) : null;
                            const chatIsLocked = isChatLockedForUser(chat, activeAgent.id, currentUser);
                            const chatIsMine = chat.assignedTo && chat.assignedTo.toLowerCase() === activeAgent.id.toLowerCase();

                            return (
                                <div 
                                    key={chat.id}
                                    onClick={() => onSelectChat(chat.id)}
                                    style={{
                                        padding: '12px 14px',
                                        borderBottom: `1px solid ${themeCardBorder}`,
                                        cursor: 'pointer',
                                        background: isSelected 
                                            ? themeCardSelectedBg 
                                            : isChecked 
                                                ? (ccTheme.isDark ? '#064E3B' : '#F0FDF4') 
                                                : themeCardBg,
                                        borderLeft: isSelected 
                                            ? `4px solid ${ccTheme.accentColor || '#1E40AF'}` 
                                            : isChecked 
                                                ? '4px solid #16A34A' 
                                                : '4px solid transparent',
                                        transition: 'background 0.15s',
                                        position: 'relative'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {/* Checkbox de selección para finalización masiva */}
                                            {!isClosed && (
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={(e) => {
                                                        e.stopPropagation();
                                                        toggleSelectChat(chat.id);
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                    style={{
                                                        cursor: 'pointer',
                                                        width: '16px',
                                                        height: '16px',
                                                        accentColor: '#16A34A',
                                                        flexShrink: 0
                                                    }}
                                                    title="Seleccionar para finalizar masivamente"
                                                />
                                            )}
                                            <div style={{
                                                width: '28px', height: '28px', borderRadius: '50%',
                                                background: chat.avatarColor || '#1E40AF', color: '#FFF',
                                                fontSize: '0.7rem', fontWeight: 800, display: 'flex',
                                                alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                {getChatAvatarInitials(chat)}
                                            </div>
                                            <div>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: isSelected ? (ccTheme.accentColor || (ccTheme.isDark ? '#38BDF8' : '#1E40AF')) : themeCardText }}>
                                                    {getCleanChatName(chat)}
                                                </span>
                                                <div style={{ fontSize: '0.68rem', color: themeCardSubtext }}>
                                                    +{chat.phone}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                            <span style={{ fontSize: '0.68rem', color: themeCardSubtext }}>
                                                {chat.timeAgo}
                                            </span>
                                            {isSearching && searchScope === 'all' && (
                                                <span style={{
                                                    fontSize: '0.6rem',
                                                    fontWeight: 700,
                                                    padding: '1px 5px',
                                                    borderRadius: '4px',
                                                    background: isClosedOrArchived(chat.status) ? (ccTheme.isDark ? '#064E3B' : '#ECFDF5') : themeCardSelectedBg,
                                                    color: isClosedOrArchived(chat.status) ? (ccTheme.isDark ? '#6EE7B7' : '#047857') : themeCardText,
                                                    border: `1px solid ${isClosedOrArchived(chat.status) ? (ccTheme.isDark ? '#047857' : '#A7F3D0') : themeCardBorder}`
                                                }}>
                                                    {isClosedOrArchived(chat.status) ? '📁 Finalizado' : (chat.assignedToName ? `👤 ${chat.assignedToName}` : ((chat.status === 'bot' || (chat.botActive && chat.status !== 'sin_asignar')) ? '🤖 Bot' : '⚠️ Sin asignar'))}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* TAGS DE TRAZABILIDAD: ASIGNADO Y LOCK */}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', margin: '6px 0 4px' }}>
                                        {isClosedOrArchived(chat.status) ? (
                                            <span style={{
                                                fontSize: '0.66rem', fontWeight: 800, padding: '1px 6px', borderRadius: '6px',
                                                background: ccTheme.isDark ? '#064E3B' : '#ECFDF5', color: ccTheme.isDark ? '#6EE7B7' : '#047857', border: `1px solid ${ccTheme.isDark ? '#047857' : '#A7F3D0'}`,
                                                display: 'flex', alignItems: 'center', gap: '3px'
                                            }}>
                                                <CheckCircle2 size={10} color={ccTheme.isDark ? '#6EE7B7' : '#047857'} /> Finalizado {chat.resolutionReason ? `• ${chat.resolutionReason}` : ''}
                                            </span>
                                        ) : assignedAgent ? (
                                            <span style={{
                                                fontSize: '0.66rem', fontWeight: 800, padding: '1px 6px', borderRadius: '6px',
                                                background: chatIsMine ? (ccTheme.isDark ? '#064E3B' : '#DCFCE7') : (ccTheme.isDark ? '#1E293B' : '#F1F5F9'),
                                                color: chatIsMine ? (ccTheme.isDark ? '#6EE7B7' : '#15803D') : (ccTheme.isDark ? '#E2E8F0' : '#334155'),
                                                border: `1px solid ${chatIsMine ? (ccTheme.isDark ? '#047857' : '#86EFAC') : (ccTheme.isDark ? '#334155' : '#CBD5E1')}`,
                                                display: 'flex', alignItems: 'center', gap: '3px'
                                            }}>
                                                <User size={10} />
                                                {assignedAgent.name} {chatIsMine ? '(Tú)' : ''}
                                            </span>
                                        ) : (chat.status === 'bot' || (chat.botActive && chat.status !== 'sin_asignar')) ? (
                                            <span style={{
                                                fontSize: '0.66rem', fontWeight: 800, padding: '1px 6px', borderRadius: '6px',
                                                background: ccTheme.isDark ? '#3B0764' : '#F3E8FF', color: ccTheme.isDark ? '#D8B4FE' : '#7E22CE', border: `1px solid ${ccTheme.isDark ? '#6B21A8' : '#D8B4FE'}`,
                                                display: 'flex', alignItems: 'center', gap: '3px'
                                            }}>
                                                🤖 Bot (Auto-gestión)
                                            </span>
                                        ) : (
                                            <span style={{
                                                fontSize: '0.66rem', fontWeight: 800, padding: '1px 6px', borderRadius: '6px',
                                                background: ccTheme.isDark ? '#451A03' : '#FEF3C7', color: ccTheme.isDark ? '#FDE68A' : '#B45309', border: `1px solid ${ccTheme.isDark ? '#78350F' : '#FCD34D'}`
                                            }}>
                                                ⚠️ Sin asignar
                                            </span>
                                        )}

                                        {/* Tag de Bloqueo Exclusivo */}
                                        {chatIsLocked && !isClosedOrArchived(chat.status) && (
                                            <span style={{
                                                fontSize: '0.64rem', fontWeight: 800, padding: '1px 6px', borderRadius: '6px',
                                                background: ccTheme.isDark ? '#450A0A' : '#FEE2E2', color: ccTheme.isDark ? '#FCA5A5' : '#B91C1C', border: `1px solid ${ccTheme.isDark ? '#7F1D1D' : '#FCA5A5'}`,
                                                display: 'flex', alignItems: 'center', gap: '2px'
                                            }}>
                                                <Lock size={9} /> Bloqueada
                                            </span>
                                        )}

                                        {/* Tag: Ojito si otro agente está leyendo este chat */}
                                        {(() => {
                                            const viewers = getViewersForChat(chat);
                                            if (!viewers.length) return null;
                                            return (
                                                <span 
                                                    title={`${viewers.map(v => v.agentName).join(', ')} está viendo este chat ahora mismo`}
                                                    style={{
                                                        fontSize: '0.64rem',
                                                        fontWeight: 800,
                                                        padding: '1px 6px',
                                                        borderRadius: '6px',
                                                        background: ccTheme.isDark ? '#1E3A5F' : '#EFF6FF',
                                                        color: ccTheme.isDark ? '#93C5FD' : '#1D4ED8',
                                                        border: `1px solid ${ccTheme.isDark ? '#1D4ED8' : '#93C5FD'}`,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '3px'
                                                    }}
                                                >
                                                    <Eye size={10} color={ccTheme.isDark ? '#93C5FD' : '#2563EB'} />
                                                    {viewers.map(v => v.agentName.split(' ')[0]).join(', ')} viendo
                                                </span>
                                            );
                                        })()}

                                        {/* Tag: Último en responder */}
                                        {chat.lastResponder && (
                                            <span style={{
                                                fontSize: '0.64rem', fontWeight: 700, padding: '1px 6px', borderRadius: '6px',
                                                background: chat.lastResponderRole === 'agent' ? (ccTheme.isDark ? '#1E3A5F' : '#EFF6FF') : (ccTheme.isDark ? '#450A0A' : '#FFF1F2'),
                                                color: chat.lastResponderRole === 'agent' ? (ccTheme.isDark ? '#93C5FD' : '#1E40AF') : (ccTheme.isDark ? '#FCA5A5' : '#E11D48'),
                                                border: `1px solid ${themeCardBorder}`,
                                                display: 'flex', alignItems: 'center', gap: '3px'
                                            }}>
                                                {chat.lastResponderRole === 'agent' ? 'Resp: ' + chat.lastResponder : '🔴 Escribió Paciente'}
                                            </span>
                                        )}

                                        {/* Tag: Tiempo de Espera sin Respuesta */}
                                        {!isClosedOrArchived(chat.status) && (
                                            chat.isWaitingResponse ? (
                                                <span 
                                                    title={`Lleva ${chat.waitingTimeText || 'un tiempo'} esperando respuesta`}
                                                    style={{
                                                        fontSize: '0.64rem', fontWeight: 800, padding: '1px 6px', borderRadius: '6px',
                                                        background: chat.waitingMinutes >= 30 
                                                            ? (ccTheme.isDark ? '#450A0A' : '#FEF2F2') 
                                                            : (chat.waitingMinutes >= 10 ? (ccTheme.isDark ? '#451A03' : '#FFFBEB') : (ccTheme.isDark ? '#064E3B' : '#F0FDF4')),
                                                        color: chat.waitingMinutes >= 30 
                                                            ? (ccTheme.isDark ? '#FCA5A5' : '#DC2626') 
                                                            : (chat.waitingMinutes >= 10 ? (ccTheme.isDark ? '#FDE68A' : '#D97706') : (ccTheme.isDark ? '#6EE7B7' : '#15803D')),
                                                        border: `1px solid ${chat.waitingMinutes >= 30 
                                                            ? (ccTheme.isDark ? '#7F1D1D' : '#FECACA') 
                                                            : (chat.waitingMinutes >= 10 ? (ccTheme.isDark ? '#78350F' : '#FDE68A') : (ccTheme.isDark ? '#047857' : '#BBF7D0'))}`,
                                                        display: 'flex', alignItems: 'center', gap: '3px'
                                                    }}
                                                >
                                                    <Clock size={9} />
                                                    {chat.waitingMinutes >= 30 ? '🚨 ' : (chat.waitingMinutes >= 10 ? '⚠️ ' : '⏳ ')}
                                                    {chat.waitingTimeText || 'Sin responder'}
                                                </span>
                                            ) : (
                                                <span 
                                                    title="Esta conversación ya fue respondida por un operador"
                                                    style={{
                                                        fontSize: '0.64rem', fontWeight: 700, padding: '1px 6px', borderRadius: '6px',
                                                        background: ccTheme.isDark ? '#064E3B' : '#F8FAFC', color: ccTheme.isDark ? '#6EE7B7' : '#15803D', border: `1px solid ${ccTheme.isDark ? '#047857' : '#DCFCE7'}`,
                                                        display: 'flex', alignItems: 'center', gap: '2px'
                                                    }}
                                                >
                                                    <Check size={9} color={ccTheme.isDark ? '#6EE7B7' : '#16A34A'} /> Respondido
                                                </span>
                                            )
                                        )}
                                    </div>

                                    {/* Snippet de Coincidencia de Búsqueda */}
                                    {chat._searchMatch && chat._searchMatch.matchType === 'mensaje' && chat._searchMatch.snippet && (
                                        <div style={{
                                            margin: '5px 0 3px 0',
                                            padding: '4px 7px',
                                            background: ccTheme.isDark ? '#451A03' : '#FFFBEB',
                                            border: `1px solid ${ccTheme.isDark ? '#78350F' : '#FDE68A'}`,
                                            borderRadius: '5px',
                                            fontSize: '0.68rem',
                                            color: ccTheme.isDark ? '#FDE68A' : '#92400E',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            overflow: 'hidden'
                                        }}>
                                            <MessageSquare size={11} style={{ flexShrink: 0, color: '#D97706' }} />
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                Coincidencia en mensaje: <strong>"{chat._searchMatch.snippet}"</strong>
                                            </span>
                                        </div>
                                    )}

                                    {chat._searchMatch && (chat._searchMatch.matchType === 'dni' || chat._searchMatch.matchType === 'dni_en_mensaje') && (
                                        <div style={{
                                            margin: '5px 0 3px 0',
                                            padding: '4px 7px',
                                            background: ccTheme.isDark ? '#1E3A5F' : '#EFF6FF',
                                            border: `1px solid ${ccTheme.isDark ? '#1D4ED8' : '#BFDBFE'}`,
                                            borderRadius: '5px',
                                            fontSize: '0.68rem',
                                            color: ccTheme.isDark ? '#93C5FD' : '#1E40AF',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            overflow: 'hidden'
                                        }}>
                                            <FileText size={11} style={{ flexShrink: 0, color: '#2563EB' }} />
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                Coincidencia DNI: <strong>{chat._searchMatch.matchText || chat._searchMatch.snippet}</strong>
                                            </span>
                                        </div>
                                    )}

                                    {chat._searchMatch && chat._searchMatch.matchType === 'orden_medica' && (
                                        <div style={{
                                            margin: '5px 0 3px 0',
                                            padding: '4px 7px',
                                            background: ccTheme.isDark ? '#2E1065' : '#F5F3FF',
                                            border: `1px solid ${ccTheme.isDark ? '#6B21A8' : '#DDD6FE'}`,
                                            borderRadius: '5px',
                                            fontSize: '0.68rem',
                                            color: ccTheme.isDark ? '#DDD6FE' : '#6D28D9',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            overflow: 'hidden'
                                        }}>
                                            <Sparkles size={11} style={{ flexShrink: 0, color: '#7C3AED' }} />
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {chat._searchMatch.snippet}
                                            </span>
                                        </div>
                                    )}

                                    <div style={{ fontSize: '0.76rem', color: themeCardSubtext, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {chat.lastMessage}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* COLUMNA 2: VISOR DE CHAT Y COMPOSITOR                            */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                height: '100%', 
                minHeight: 0, 
                overflow: 'hidden', 
                background: ccTheme.chatBgColor || '#F8FAFC' 
            }}>
                {/* Barra Superior del Chat con Control de Asignación Exclusiva */}
                <div style={{
                    padding: '12px 20px',
                    flexShrink: 0,
                    background: ccTheme.chatHeaderBg || '#FFFFFF',
                    borderBottom: `1px solid ${ccTheme.chatHeaderBorder || '#E2E8F0'}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                        {/* Nombre del paciente y datos */}
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '1.05rem', fontWeight: 800, color: ccTheme.accentColor || '#0284C7' }}>
                                    {getCleanChatName(selectedChat)}
                                </span>

                                {/* CONDICIÓN PADRÓN */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: ccTheme.chatHeaderColor || '#64748B', opacity: 0.85 }}>CONDICIÓN PADRÓN</span>
                                    <span style={{
                                        fontSize: '0.68rem', fontWeight: 800,
                                        padding: '2px 8px', borderRadius: '4px',
                                        background: selectedChat.customFields?.esPacienteExistente ? '#ECFDF5' : '#EFF6FF',
                                        color: selectedChat.customFields?.esPacienteExistente ? '#047857' : '#1D4ED8',
                                        border: '1px solid', borderColor: selectedChat.customFields?.esPacienteExistente ? '#A7F3D0' : '#BFDBFE'
                                    }}>
                                        {selectedChat.customFields?.esPacienteExistente ? '✓ Paciente Registrado' : '+ Nuevo Paciente'}
                                    </span>
                                </div>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: ccTheme.chatHeaderColor || '#64748B', opacity: 0.9, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginTop: '3px' }}>
                                <span>Tel: {selectedChat.phone}</span>
                                <span>•</span>
                                <span>
                                    Última respuesta: <strong style={{ color: selectedChat.lastResponderRole === 'agent' ? (ccTheme.accentColor || '#1E40AF') : (ccTheme.isDark ? '#FCA5A5' : '#E11D48') }}>
                                        {selectedChat.lastResponder || 'Paciente'}
                                    </strong>
                                </span>
                                {/* Badge de Ojito si otro agente está leyendo este chat */}
                                {otherViewersForCurrentChat.length > 0 && (
                                    <>
                                        <span>•</span>
                                        <span style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            padding: '2px 8px',
                                            borderRadius: '9999px',
                                            background: '#EFF6FF',
                                            border: '1.5px solid #60A5FA',
                                            color: '#1D4ED8',
                                            fontSize: '0.71rem',
                                            fontWeight: 800,
                                            boxShadow: '0 1px 3px rgba(37, 99, 235, 0.12)'
                                        }}>
                                            <Eye size={12} color="#2563EB" />
                                            <span>
                                                {otherViewersForCurrentChat.map(v => v.agentName).join(', ')} {otherViewersForCurrentChat.length === 1 ? 'está viendo' : 'están viendo'}
                                            </span>
                                        </span>
                                    </>
                                )}
                                {!isClosedOrArchived(selectedChat.status) && (
                                    <>
                                        <span>•</span>
                                        {selectedChat.isWaitingResponse ? (
                                            <span style={{
                                                fontSize: '0.7rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px',
                                                background: selectedChat.waitingMinutes >= 30 ? '#FEF2F2' : (selectedChat.waitingMinutes >= 10 ? '#FFFBEB' : '#F0FDF4'),
                                                color: selectedChat.waitingMinutes >= 30 ? '#DC2626' : (selectedChat.waitingMinutes >= 10 ? '#D97706' : '#15803D'),
                                                border: `1px solid ${selectedChat.waitingMinutes >= 30 ? '#FECACA' : (selectedChat.waitingMinutes >= 10 ? '#FDE68A' : '#BBF7D0')}`,
                                                display: 'inline-flex', alignItems: 'center', gap: '4px'
                                            }}>
                                                <Clock size={11} />
                                                {selectedChat.waitingMinutes >= 30 ? '🚨 ' : (selectedChat.waitingMinutes >= 10 ? '⚠️ ' : '⏳ ')}
                                                {selectedChat.waitingTimeText || 'Esperando respuesta'}
                                            </span>
                                        ) : (
                                            <span style={{
                                                fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '6px',
                                                background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0',
                                                display: 'inline-flex', alignItems: 'center', gap: '3px'
                                            }}>
                                                <Check size={11} /> Respondido por agente
                                            </span>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        {/* WIDGET: CHATBOT ACTIVO (TRIAGE) */}
                        <div style={{
                            padding: '6px 12px', borderRadius: '10px',
                            background: botActive ? '#F0FDF4' : '#FFFBEB',
                            border: '1px solid', borderColor: botActive ? '#BBF7D0' : '#FDE68A',
                            display: 'flex', flexDirection: 'column', gap: '4px'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', fontWeight: 800, color: botActive ? '#15803D' : '#B45309' }}>
                                    <Bot size={14} />
                                    {botActive ? 'CHATBOT ACTIVO (TRIAGE)' : 'CHATBOT SILENCIADO'}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <button
                                        type="button"
                                        onClick={handleToggleBot}
                                        style={{
                                            padding: '4px 8px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: 700,
                                            border: 'none', cursor: 'pointer',
                                            background: botActive ? '#DC2626' : '#16A34A',
                                            color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '4px',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                        }}
                                    >
                                        <Power size={11} />
                                        {botActive ? 'Silenciar Bot' : 'Reanudar Bot'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleOpenResetBotModal}
                                        title="Reiniciar flujo del bot para que vuelva al saludo inicial de triage"
                                        style={{
                                            padding: '4px 8px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: 700,
                                            border: '1px solid #CBD5E1', cursor: 'pointer',
                                            background: '#FFFFFF', color: '#0284C7', display: 'flex', alignItems: 'center', gap: '4px'
                                        }}
                                    >
                                        <RefreshCw size={11} />
                                        Reiniciar
                                    </button>
                                    {TEST_BOT_RESET_INDICATOR_ENABLED && (
                                        <span
                                            title="Modo de prueba activo: El bot reinicia automáticamente su conversación a 'inicio' tras 3 minutos de inactividad"
                                            style={{
                                                padding: '3px 7px',
                                                borderRadius: '6px',
                                                fontSize: '0.65rem',
                                                fontWeight: 800,
                                                background: '#FEF3C7',
                                                border: '1px solid #FCD34D',
                                                color: '#B45309',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '3px'
                                            }}
                                        >
                                            ⏱️ Auto-reset 3m
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div style={{ fontSize: '0.66rem', color: botActive ? '#166534' : '#92400E', lineHeight: 1.25 }}>
                                {botActive 
                                    ? 'El bot responde preguntas de triage ahorrando mensajes. Se silencia al asignar una agente.'
                                    : 'El bot no responderá para permitir atención humana exclusiva.'}
                            </div>
                        </div>
                    </div>

                    {/* BOTONES DE ASIGNACIÓN / BLOQUEO EXCLUSIVO */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
                        {isClosedOrArchived(selectedChat.status) ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '6px 14px', borderRadius: '8px',
                                    background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#047857',
                                    fontSize: '0.74rem', fontWeight: 800
                                }}>
                                    <CheckCircle2 size={13} color="#047857" />
                                    Conversación Finalizada {selectedChat.resolutionReason ? `(${selectedChat.resolutionReason})` : ''}
                                </div>
                                <button
                                    onClick={() => onAssignChat && onAssignChat(selectedChat.id, activeAgent.id)}
                                    title="Reabrir esta conversación para continuar atendiendo al paciente"
                                    style={{
                                        padding: '6px 12px', borderRadius: '8px', border: '1px solid #0284C7',
                                        background: '#F0F9FF', color: '#0284C7', fontWeight: 700, fontSize: '0.72rem',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                                    }}
                                >
                                    <RefreshCw size={12} /> Reabrir Atención
                                </button>
                            </div>
                        ) : isBot ? (
                            <button 
                                onClick={() => onAssignChat && onAssignChat(selectedChat.id, activeAgent.id)}
                                style={{
                                    padding: '7px 14px', borderRadius: '8px', border: 'none',
                                    background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
                                    color: '#FFFFFF', fontWeight: 700, fontSize: '0.76rem',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                    boxShadow: '0 2px 6px rgba(124, 58, 237, 0.3)'
                                }}
                            >
                                <UserCheck size={14} /> Asignarme y pausar Bot
                            </button>
                        ) : isUnassigned ? (
                            <button 
                                onClick={() => onAssignChat && onAssignChat(selectedChat.id, activeAgent.id)}
                                style={{
                                    padding: '7px 14px', borderRadius: '8px', border: 'none',
                                    background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                                    color: '#FFFFFF', fontWeight: 700, fontSize: '0.76rem',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                    boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)'
                                }}
                            >
                                <UserCheck size={14} /> Asignarme esta conversación
                            </button>
                        ) : null}

                        {/* CASO 2: ASIGNADA A MÍ -> PUEDO LIBERAR O TRANSFERIR (Solo si NO está cerrado) */}
                        {!isClosedOrArchived(selectedChat.status) && isAssignedToMe && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{
                                    fontSize: '0.72rem', fontWeight: 800, padding: '5px 10px', borderRadius: '8px',
                                    background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC',
                                    display: 'flex', alignItems: 'center', gap: '4px'
                                }}>
                                    <CheckCircle2 size={13} /> Asignada a ti ({activeAgent.name})
                                </span>

                                <button
                                    onClick={() => onUnassignChat && onUnassignChat(selectedChat.id)}
                                    title="Liberar chat a la cola general"
                                    style={{
                                        padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1',
                                        background: '#FFFFFF', color: '#475569', fontWeight: 600, fontSize: '0.72rem',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                                    }}
                                >
                                    <Unlock size={12} /> Liberar
                                </button>

                                <button
                                    onClick={() => setTransferMenuOpen(!transferMenuOpen)}
                                    title="Transferir a otra agente"
                                    style={{
                                        padding: '6px 10px', borderRadius: '6px', border: '1px solid #0284C7',
                                        background: '#F0F9FF', color: '#0284C7', fontWeight: 700, fontSize: '0.72rem',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                                    }}
                                >
                                    <ArrowRightLeft size={12} /> Transferir <ChevronDown size={12} />
                                </button>

                                <button
                                    onClick={() => setCloseModalOpen(true)}
                                    title="Finalizar atención y archivar conversación"
                                    style={{
                                        padding: '6px 12px', borderRadius: '6px', border: 'none',
                                        background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                                        color: '#FFFFFF', fontWeight: 700, fontSize: '0.72rem',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                                        boxShadow: '0 2px 4px rgba(5, 150, 105, 0.25)'
                                    }}
                                >
                                    <CheckCircle2 size={12} /> Finalizar Atención
                                </button>
                            </div>
                        )}

                        {/* CASO 3: ASIGNADA A OTRA AGENTE -> BLOQUEO ESTRICTO (Solo si NO está cerrado) */}
                        {!isClosedOrArchived(selectedChat.status) && !isUnassigned && !isAssignedToMe && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '6px 12px', borderRadius: '8px',
                                    background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B',
                                    fontSize: '0.74rem', fontWeight: 800
                                }}>
                                    <Lock size={13} />
                                    Asignada a {assignedAgentObj?.name || selectedChat.assignedTo} (Bloqueada)
                                </div>

                                {/* Solo supervisor lmarinero puede forzar reasignación */}
                                {isSupervisor && (
                                    <button
                                        onClick={() => setTransferMenuOpen(!transferMenuOpen)}
                                        style={{
                                            padding: '6px 10px', borderRadius: '6px', border: '1px solid #DC2626',
                                            background: '#FFFFFF', color: '#DC2626', fontWeight: 700, fontSize: '0.72rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Supervisión: Reasignar
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Menú de Transferencia entre las 4 agentes */}
                        {transferMenuOpen && (
                            <div 
                                ref={transferMenuRef}
                                style={{
                                    position: 'absolute', top: '100%', right: 0, marginTop: '6px',
                                    background: '#FFFFFF', borderRadius: '10px', border: '1px solid #CBD5E1',
                                    boxShadow: '0 10px 25px rgba(0,0,0,0.15)', width: '250px', zIndex: 60,
                                    padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', borderBottom: '1px solid #F1F5F9' }}>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                                        Transferir conversación a:
                                    </div>
                                    <button 
                                        type="button" 
                                        onClick={() => setTransferMenuOpen(false)}
                                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94A3B8' }}
                                    >
                                        <X size={13} />
                                    </button>
                                </div>
                                {CONTACT_CENTER_AGENTS.filter(a => {
                                    const assignedId = (selectedChat.assignedTo || '').toLowerCase();
                                    const myId = (activeAgent?.id || '').toLowerCase();
                                    const myUser = (activeAgent?.username || '').toLowerCase();
                                    const aId = a.id.toLowerCase();
                                    const aUser = (a.username || '').toLowerCase();
                                    return aId !== assignedId && aUser !== assignedId && aId !== myId && aUser !== myUser;
                                }).map(targetAgent => {
                                    const isTargetViewing = otherViewersForCurrentChat.some(v => 
                                        (v.agentId && v.agentId.toLowerCase() === targetAgent.id.toLowerCase()) ||
                                        (v.agentName && targetAgent.name && v.agentName.toLowerCase().includes(targetAgent.name.toLowerCase()))
                                    );
                                    return (
                                        <button
                                            key={targetAgent.id}
                                            onClick={() => {
                                                onTransferChat && onTransferChat(selectedChat.id, targetAgent.id);
                                                setTransferMenuOpen(false);
                                            }}
                                            style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                padding: '8px 10px', borderRadius: '6px', border: 'none',
                                                background: 'transparent', cursor: 'pointer', textAlign: 'left',
                                                width: '100%', transition: 'background 0.15s'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#F8FAFC'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{
                                                    width: '24px', height: '24px', borderRadius: '50%',
                                                    background: targetAgent.color, color: '#FFF',
                                                    fontSize: '0.7rem', fontWeight: 800, display: 'flex',
                                                    alignItems: 'center', justifyContent: 'center'
                                                }}>
                                                    {targetAgent.avatar}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0F172A' }}>
                                                        {targetAgent.fullName}
                                                    </div>
                                                    <div style={{ fontSize: '0.66rem', color: '#64748B' }}>
                                                        {targetAgent.role}
                                                    </div>
                                                </div>
                                            </div>
                                            {isTargetViewing ? (
                                                <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#1D4ED8', display: 'flex', alignItems: 'center', gap: '2px', background: '#EFF6FF', padding: '2px 5px', borderRadius: '4px' }}>
                                                    <Eye size={10} /> Viendo
                                                </span>
                                            ) : (
                                                <ArrowRightLeft size={13} color="#94A3B8" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Banner de Presencia en Vivo ("El Ojito"): Si otro usuario está viendo esta conversación */}
                {otherViewersForCurrentChat.length > 0 && (
                    <div style={{
                        flexShrink: 0,
                        padding: '7px 18px',
                        background: 'linear-gradient(90deg, #EFF6FF 0%, #DBEAFE 100%)',
                        borderBottom: '1px solid #93C5FD',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.76rem',
                        color: '#1E40AF',
                        fontWeight: 700
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                                width: '24px', height: '24px', borderRadius: '50%',
                                background: '#BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <Eye size={14} color="#1D4ED8" />
                            </span>
                            <span>
                                <strong>{otherViewersForCurrentChat.map(v => v.agentName).join(', ')}</strong> {otherViewersForCurrentChat.length === 1 ? 'está leyendo esta conversación en este momento.' : 'están leyendo esta conversación en este momento.'}
                            </span>
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#2563EB', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2563EB', display: 'inline-block' }} />
                            En tiempo real
                        </div>
                    </div>
                )}

                {/* Área de Mensajes con Estilo AsisteClick + Tags de Autoría */}
                <div 
                    ref={messagesContainerRef}
                    style={{
                        flex: 1,
                        minHeight: 0,
                        overflowY: 'auto',
                        padding: '16px 20px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        background: ccTheme.chatBgColor || '#F8FAFC',
                        backgroundImage: ccTheme.chatBgImage 
                            ? `linear-gradient(rgba(15, 23, 42, ${ccTheme.chatOverlayOpacity ?? 0.70}), rgba(15, 23, 42, ${ccTheme.chatOverlayOpacity ?? 0.70})), url('${ccTheme.chatBgImage}')`
                            : 'radial-gradient(#E2E8F0 1px, transparent 1px)',
                        backgroundSize: ccTheme.chatBgImage ? 'cover' : '20px 20px',
                        backgroundPosition: 'center',
                        backgroundAttachment: 'fixed'
                    }}
                >
                    {/* Barra de Orden de Mensajes (Últimos a primeros) */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 12px',
                        background: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: '8px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        flexShrink: 0
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: '#475569' }}>
                            <Clock size={12} color="#0284C7" />
                            <span>Orden:</span>
                            <strong style={{ color: '#0284C7' }}>
                                {messageSortOrder === 'newest_first' ? 'Más recientes arriba ⬆' : 'Cronológico clásico ⬇'}
                            </strong>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setMessageSortOrder(prev => {
                                    const next = prev === 'newest_first' ? 'chronological' : 'newest_first';
                                    try { localStorage.setItem('cc_message_sort_order', next); } catch {}
                                    return next;
                                });
                            }}
                            title="Alternar entre ver mensajes más recientes arriba o cronológico clásico"
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                padding: '3px 9px', borderRadius: '6px',
                                border: '1px solid #CBD5E1', background: '#F8FAFC',
                                color: '#1E293B', fontSize: '0.69rem', fontWeight: 700,
                                cursor: 'pointer'
                            }}
                        >
                            <ArrowUpDown size={11} />
                            {messageSortOrder === 'newest_first' ? 'Ver cronológico clásico ⬇' : 'Ver más recientes arriba ⬆'}
                        </button>
                    </div>

                    {(() => {
                        const rawMsgs = selectedChat.messages || [];
                        const hasMore = rawMsgs.length > visibleMessageCount;
                        const remainingCount = rawMsgs.length - visibleMessageCount;

                        const ordered = messageSortOrder === 'newest_first'
                            ? [...rawMsgs].reverse()
                            : rawMsgs;

                        const visibleMsgs = messageSortOrder === 'newest_first'
                            ? ordered.slice(0, visibleMessageCount)
                            : ordered.slice(Math.max(0, ordered.length - visibleMessageCount));

                        return (
                            <>
                                {hasMore && messageSortOrder === 'chronological' && (
                                    <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 14px' }}>
                                        <button
                                            type="button"
                                            onClick={() => setVisibleMessageCount(c => c + 50)}
                                            style={{
                                                background: '#F8FAFC',
                                                border: '1px solid #CBD5E1',
                                                color: '#334155',
                                                borderRadius: '20px',
                                                padding: '6px 16px',
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                                            }}
                                        >
                                            <Clock size={12} color="#64748B" />
                                            Cargar mensajes anteriores ({remainingCount} más)
                                        </button>
                                    </div>
                                )}
                                {visibleMsgs.map(msg => {
                        if (msg.sender === 'system') {
                            return (
                                <div key={msg.id} style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
                                    <span style={{
                                        background: '#FFFFFF', border: '1px solid #E2E8F0',
                                        color: '#475569', fontSize: '0.72rem', fontWeight: 600, padding: '4px 14px',
                                        borderRadius: '20px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                        display: 'flex', alignItems: 'center', gap: '6px'
                                    }}>
                                        <Clock size={12} color="#94A3B8" />
                                        {msg.text}
                                    </span>
                                </div>
                            );
                        }

                        const isPatient = msg.sender === 'patient';
                        const isNote = msg.isNote;
                        const agentObj = !isPatient ? getAgentById(msg.senderAgentId || msg.senderName) : null;

                        return (
                            <div 
                                key={msg.id}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: isPatient ? 'flex-start' : 'flex-end',
                                    maxWidth: '82%',
                                    alignSelf: isPatient ? 'flex-start' : 'flex-end'
                                }}
                            >
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '8px',
                                    flexDirection: isPatient ? 'row' : 'row-reverse'
                                }}>
                                    {/* Avatar circular con color de la agente o del paciente */}
                                    <div style={{
                                        width: '28px', height: '28px', borderRadius: '50%',
                                        background: isPatient 
                                            ? (selectedChat.avatarColor || '#E11D48') 
                                            : (isNote ? '#EA580C' : (agentObj?.color || '#0284C7')),
                                        color: '#FFFFFF', fontSize: '0.72rem', fontWeight: 800,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                    }}>
                                        {isPatient ? selectedChat.contactName.charAt(0) : (isNote ? '🔒' : (agentObj?.avatar || 'A'))}
                                    </div>

                                    {/* Burbuja de Mensaje con Tag de Autoría */}
                                    <div style={{
                                        background: isNote ? '#FFF7ED' : (isPatient ? '#DCFCE7' : '#FFFFFF'),
                                        border: isNote ? '1px solid #FED7AA' : '1px solid #E2E8F0',
                                        padding: '10px 14px',
                                        borderRadius: isPatient ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
                                        color: '#1E293B',
                                        fontSize: '0.86rem',
                                        lineHeight: 1.45
                                    }}>
                                        {/* TAG DE AUTORÍA CLARO */}
                                        {!isPatient && (
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                marginBottom: '6px', paddingBottom: '4px',
                                                borderBottom: isNote ? '1px dashed #FDBA74' : '1px solid #F1F5F9'
                                            }}>
                                                <span style={{
                                                    fontSize: '0.68rem', fontWeight: 800,
                                                    color: isNote ? '#C2410C' : (agentObj?.color || '#0284C7'),
                                                    background: isNote ? '#FFEDD5' : '#F8FAFC',
                                                    padding: '1px 6px', borderRadius: '4px', border: '1px solid #E2E8F0'
                                                }}>
                                                    {isNote ? `🔒 NOTA INTERNA • ${msg.senderName}` : `👤 ${msg.senderName} (${agentObj?.role || 'Agente'})`}
                                                </span>
                                            </div>
                                        )}

                                        {(() => {
                                            const docMeta = getDocumentMeta(msg.mediaUrl, msg.type, msg.caption, msg.text);
                                            return (
                                                <>
                                                    {/* TARJETA DE AUDIO / NOTA DE VOZ CON TRANSCRIPCIÓN IA WHISPER */}
                                                    {(msg.type === 'audio' || msg.type === 'voice' || (docMeta && docMeta.fileType === 'audio') || msg.audioTranscription) && (
                                                        <div style={{
                                                            marginBottom: '10px',
                                                            maxWidth: '420px',
                                                            borderRadius: '12px',
                                                            border: '1.5px solid #DDD6FE',
                                                            backgroundColor: '#FAF5FF',
                                                            padding: '12px 14px',
                                                            boxShadow: '0 2px 8px rgba(124, 58, 237, 0.08)',
                                                            textAlign: 'left'
                                                        }}>
                                                            {/* Cabecera del Audio */}
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <div style={{
                                                                        width: '32px',
                                                                        height: '32px',
                                                                        borderRadius: '50%',
                                                                        backgroundColor: '#7C3AED',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        color: '#FFFFFF',
                                                                        flexShrink: 0,
                                                                        boxShadow: '0 2px 4px rgba(124, 58, 237, 0.25)'
                                                                    }}>
                                                                        <Volume2 size={17} />
                                                                    </div>
                                                                    <div>
                                                                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#4C1D95', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                            Mensaje de Voz
                                                                        </span>
                                                                        <span style={{ fontSize: '0.68rem', color: '#6B21A8' }}>
                                                                            Audio WhatsApp {msg.timestamp ? `• ${msg.timestamp}` : ''}
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                {/* Descarga de audio */}
                                                                {msg.mediaUrl && (
                                                                    <a
                                                                        href={msg.mediaUrl}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        download={docMeta?.filename || 'audio.ogg'}
                                                                        style={{
                                                                            padding: '4px 8px',
                                                                            borderRadius: '6px',
                                                                            backgroundColor: '#FFFFFF',
                                                                            border: '1px solid #DDD6FE',
                                                                            color: '#6D28D9',
                                                                            fontSize: '0.72rem',
                                                                            fontWeight: 600,
                                                                            textDecoration: 'none',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '4px'
                                                                        }}
                                                                        title="Descargar audio original"
                                                                    >
                                                                        <Download size={13} />
                                                                    </a>
                                                                )}
                                                            </div>

                                                            {/* Reproductor de Audio HTML5 */}
                                                            {msg.mediaUrl && (
                                                                <div style={{ marginBottom: '10px' }}>
                                                                    <audio
                                                                        controls
                                                                        preload="metadata"
                                                                        src={msg.mediaUrl}
                                                                        style={{
                                                                            width: '100%',
                                                                            height: '38px',
                                                                            borderRadius: '20px',
                                                                            outline: 'none'
                                                                        }}
                                                                    />
                                                                </div>
                                                            )}

                                                            {/* SECCIÓN DE TRANSCRIPCIÓN IA */}
                                                            {msg.audioTranscription ? (
                                                                <div style={{
                                                                    backgroundColor: '#FFFFFF',
                                                                    borderRadius: '8px',
                                                                    border: '1px solid #E9D5FF',
                                                                    padding: '10px 12px',
                                                                    marginTop: '6px'
                                                                }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', borderBottom: '1px solid #F3E8FF', paddingBottom: '5px' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.74rem', fontWeight: 800, color: '#6D28D9' }}>
                                                                            <Sparkles size={14} color="#7C3AED" />
                                                                            <span>TRANSCRIPCIÓN ASISTIDA (IA)</span>
                                                                        </div>
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                navigator.clipboard.writeText(msg.audioTranscription);
                                                                                setCopiedAudioMsgId(msg.id);
                                                                                setTimeout(() => setCopiedAudioMsgId(null), 2000);
                                                                            }}
                                                                            style={{
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '4px',
                                                                                background: copiedAudioMsgId === msg.id ? '#DCFCE7' : '#F5F3FF',
                                                                                border: `1px solid ${copiedAudioMsgId === msg.id ? '#86EFAC' : '#DDD6FE'}`,
                                                                                borderRadius: '4px',
                                                                                padding: '2px 8px',
                                                                                fontSize: '0.68rem',
                                                                                fontWeight: 700,
                                                                                color: copiedAudioMsgId === msg.id ? '#15803D' : '#6D28D9',
                                                                                cursor: 'pointer'
                                                                            }}
                                                                        >
                                                                            {copiedAudioMsgId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                                                                            {copiedAudioMsgId === msg.id ? 'Copiado' : 'Copiar'}
                                                                        </button>
                                                                    </div>

                                                                    {/* Texto de la transcripción */}
                                                                    <p style={{
                                                                        fontSize: '0.85rem',
                                                                        color: '#1E1B4B',
                                                                        lineHeight: '1.45',
                                                                        margin: '0 0 6px 0',
                                                                        fontStyle: 'normal',
                                                                        fontWeight: 500
                                                                    }}>
                                                                        "{msg.audioTranscription}"
                                                                    </p>

                                                                    {/* Comprensión Clínica Extraída */}
                                                                    {msg.audioUnderstanding && (
                                                                        <div style={{
                                                                            marginTop: '8px',
                                                                            paddingTop: '6px',
                                                                            borderTop: '1px dashed #E9D5FF',
                                                                            display: 'flex',
                                                                            flexWrap: 'wrap',
                                                                            gap: '6px',
                                                                            alignItems: 'center'
                                                                        }}>
                                                                            {msg.audioUnderstanding.intent && (
                                                                                <span style={{
                                                                                    fontSize: '0.68rem',
                                                                                    fontWeight: 700,
                                                                                    backgroundColor: '#EDE9FE',
                                                                                    color: '#5B21B6',
                                                                                    padding: '2px 7px',
                                                                                    borderRadius: '4px'
                                                                                }}>
                                                                                    🎯 {msg.audioUnderstanding.intent}
                                                                                </span>
                                                                            )}
                                                                            {msg.audioUnderstanding.doctor && (
                                                                                <span style={{
                                                                                    fontSize: '0.68rem',
                                                                                    fontWeight: 700,
                                                                                    backgroundColor: '#E0E7FF',
                                                                                    color: '#3730A3',
                                                                                    padding: '2px 7px',
                                                                                    borderRadius: '4px'
                                                                                }}>
                                                                                    👨‍⚕️ Dr/a: {msg.audioUnderstanding.doctor}
                                                                                </span>
                                                                            )}
                                                                            {msg.audioUnderstanding.healthInsurance && (
                                                                                <span style={{
                                                                                    fontSize: '0.68rem',
                                                                                    fontWeight: 700,
                                                                                    backgroundColor: '#FEF3C7',
                                                                                    color: '#92400E',
                                                                                    padding: '2px 7px',
                                                                                    borderRadius: '4px'
                                                                                }}>
                                                                                    🏥 O.S: {msg.audioUnderstanding.healthInsurance}
                                                                                </span>
                                                                            )}
                                                                            {msg.audioUnderstanding.urgency && msg.audioUnderstanding.urgency !== 'baja' && msg.audioUnderstanding.urgency !== 'normal' && (
                                                                                <span style={{
                                                                                    fontSize: '0.68rem',
                                                                                    fontWeight: 700,
                                                                                    backgroundColor: '#FEE2E2',
                                                                                    color: '#991B1B',
                                                                                    padding: '2px 7px',
                                                                                    borderRadius: '4px'
                                                                                }}>
                                                                                    ⚠️ Urgencia {msg.audioUnderstanding.urgency.toUpperCase()}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                /* Botón para solicitar Transcripción con IA a demanda */
                                                                <div style={{ marginTop: '8px' }}>
                                                                    <button
                                                                        type="button"
                                                                        disabled={transcribingMsgId === msg.id || !msg.mediaUrl}
                                                                        onClick={async (e) => {
                                                                            e.stopPropagation();
                                                                            try {
                                                                                setTranscribingMsgId(msg.id);
                                                                                const result = await transcribeAudioMessage(msg.mediaUrl, msg.realId || msg.id, selectedChat?.phone);
                                                                                if (result && result.transcription) {
                                                                                    msg.audioTranscription = result.transcription;
                                                                                    msg.audioUnderstanding = result.understanding;
                                                                                    setForceUpdate(k => k + 1);
                                                                                }
                                                                            } catch (err) {
                                                                                alert('No se pudo transcribir el audio: ' + (err.message || 'Error'));
                                                                            } finally {
                                                                                setTranscribingMsgId(null);
                                                                            }
                                                                        }}
                                                                        style={{
                                                                            width: '100%',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            gap: '6px',
                                                                            padding: '6px 12px',
                                                                            borderRadius: '6px',
                                                                            backgroundColor: '#7C3AED',
                                                                            color: '#FFFFFF',
                                                                            border: 'none',
                                                                            fontSize: '0.74rem',
                                                                            fontWeight: 700,
                                                                            cursor: transcribingMsgId === msg.id ? 'wait' : 'pointer',
                                                                            boxShadow: '0 1px 3px rgba(124,58,237,0.2)'
                                                                        }}
                                                                    >
                                                                        {transcribingMsgId === msg.id ? (
                                                                            <>
                                                                                <RefreshCw size={13} className="animate-spin" />
                                                                                <span>Transcribiendo audio con IA...</span>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <Sparkles size={13} />
                                                                                <span>Transcribir y entender audio con IA</span>
                                                                            </>
                                                                        )}
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* TARJETA DE DOCUMENTO ADJUNTO (PDF, WORD, EXCEL, ETC.) - EXCLUIR ESTRICTAMENTE AUDIOS */}
                                                    {docMeta && docMeta.fileType !== 'image' && docMeta.fileType !== 'audio' && msg.type !== 'audio' && msg.type !== 'voice' && !msg.text?.startsWith('_event_voice_note_') && msg.mediaUrl && (
                                                        <div style={{
                                                            marginBottom: '10px',
                                                            maxWidth: '380px',
                                                            borderRadius: '10px',
                                                            border: `1.5px solid ${docMeta.borderColor}`,
                                                            backgroundColor: docMeta.bgColor,
                                                            padding: '12px 14px',
                                                            boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                                                            textAlign: 'left'
                                                        }}>
                                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                                                <div style={{
                                                                    width: '40px',
                                                                    height: '40px',
                                                                    borderRadius: '8px',
                                                                    backgroundColor: '#FFFFFF',
                                                                    border: `1px solid ${docMeta.borderColor}`,
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    color: docMeta.color,
                                                                    flexShrink: 0,
                                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
                                                                }}>
                                                                    {docMeta.fileType === 'pdf' && <FileText size={22} />}
                                                                    {docMeta.fileType === 'word' && <FileText size={22} />}
                                                                    {docMeta.fileType === 'excel' && <FileSpreadsheet size={22} />}
                                                                    {docMeta.fileType === 'document' && <File size={22} />}
                                                                </div>
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{
                                                                        fontSize: '0.82rem',
                                                                        fontWeight: 700,
                                                                        color: '#0F172A',
                                                                        whiteSpace: 'nowrap',
                                                                        overflow: 'hidden',
                                                                        textOverflow: 'ellipsis'
                                                                    }} title={docMeta.filename}>
                                                                        {docMeta.filename}
                                                                    </div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                                                                        <span style={{
                                                                            fontSize: '0.68rem',
                                                                            fontWeight: 700,
                                                                            backgroundColor: docMeta.color,
                                                                            color: '#FFFFFF',
                                                                            padding: '1px 6px',
                                                                            borderRadius: '4px',
                                                                            letterSpacing: '0.5px'
                                                                        }}>
                                                                            {docMeta.ext}
                                                                        </span>
                                                                        <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                                            {docMeta.label}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* BOTONES DE ACCIÓN */}
                                                            <div style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '8px',
                                                                marginTop: '10px',
                                                                paddingTop: '8px',
                                                                borderTop: `1px solid ${docMeta.borderColor}`
                                                            }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setViewerZoom(1);
                                                                        setViewerRotation(0);
                                                                        setCopiedViewerData(false);
                                                                        setViewerImage({
                                                                            url: msg.mediaUrl,
                                                                            caption: msg.caption || docMeta.filename,
                                                                            filename: docMeta.filename,
                                                                            fileType: docMeta.fileType,
                                                                            ext: docMeta.ext,
                                                                            orderAnalysis: msg.orderAnalysis,
                                                                            senderName: selectedChat?.contactName || msg.senderName || 'Paciente',
                                                                            dni: selectedChat?.dni,
                                                                            timestamp: msg.timestamp
                                                                        });
                                                                    }}
                                                                    style={{
                                                                        flex: 1,
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        gap: '6px',
                                                                        padding: '6px 12px',
                                                                        borderRadius: '6px',
                                                                        backgroundColor: docMeta.color,
                                                                        color: '#FFFFFF',
                                                                        border: 'none',
                                                                        fontSize: '0.74rem',
                                                                        fontWeight: 700,
                                                                        cursor: 'pointer',
                                                                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                                                    }}
                                                                >
                                                                    <Eye size={14} /> Abrir en Visor Profesional
                                                                </button>
                                                                <a
                                                                    href={msg.mediaUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    download={docMeta.filename}
                                                                    style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        padding: '6px 10px',
                                                                        borderRadius: '6px',
                                                                        backgroundColor: '#FFFFFF',
                                                                        color: '#475569',
                                                                        border: `1px solid ${docMeta.borderColor}`,
                                                                        fontSize: '0.74rem',
                                                                        fontWeight: 600,
                                                                        textDecoration: 'none',
                                                                        cursor: 'pointer'
                                                                    }}
                                                                    title="Descargar o abrir en pestaña nueva"
                                                                >
                                                                    <Download size={14} />
                                                                </a>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* TARJETA DE IMAGEN MÉDICA / ORDEN */}
                                                    {(msg.type === 'image' || (docMeta && docMeta.fileType === 'image' && msg.mediaUrl)) && (
                                                        <div style={{ marginBottom: '8px', maxWidth: '340px' }}>
                                                            <div 
                                                                style={{ 
                                                                    borderRadius: '8px', 
                                                                    overflow: 'hidden', 
                                                                    border: '1px solid #CBD5E1', 
                                                                    cursor: 'pointer',
                                                                    position: 'relative',
                                                                    boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
                                                                }}
                                                                onClick={() => {
                                                                    if (!msg.mediaUrl) return;
                                                                    setViewerZoom(1);
                                                                    setViewerRotation(0);
                                                                    setCopiedViewerData(false);
                                                                    setViewerImage({
                                                                        url: msg.mediaUrl,
                                                                        caption: msg.caption,
                                                                        filename: docMeta?.filename || 'orden_medica.jpg',
                                                                        fileType: 'image',
                                                                        ext: 'IMG',
                                                                        orderAnalysis: msg.orderAnalysis,
                                                                        senderName: selectedChat?.contactName || msg.senderName || 'Paciente',
                                                                        dni: selectedChat?.dni,
                                                                        timestamp: msg.timestamp
                                                                    });
                                                                }}
                                                                title="Click para abrir en el visor profesional integrado"
                                                            >
                                                                <img src={msg.mediaUrl} alt={msg.caption || 'Foto de Orden'} style={{ width: '100%', maxHeight: '220px', objectFit: 'contain', background: '#0F172A', display: 'block' }} />
                                                                <div style={{
                                                                    position: 'absolute', bottom: msg.caption ? '36px' : '8px', right: '8px',
                                                                    background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(4px)',
                                                                    color: '#FFFFFF', padding: '3px 8px', borderRadius: '4px',
                                                                    fontSize: '0.68rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px',
                                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                                                }}>
                                                                    <Eye size={12} /> Abrir Visor
                                                                </div>
                                                                {msg.caption && (
                                                                    <div style={{ padding: '6px 10px', background: '#F8FAFC', fontSize: '0.75rem', color: '#64748B' }}>
                                                                        📄 {msg.caption}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Tarjeta de Análisis Clínico IA de la Orden Médica (Exclusivo para el Operador) */}
                                                            {msg.orderAnalysis ? (
                                                                <div style={{
                                                                    marginTop: '6px',
                                                                    padding: '10px 12px',
                                                                    background: '#F0FDF4',
                                                                    border: '1.5px solid #86EFAC',
                                                                    borderRadius: '8px',
                                                                    fontSize: '0.78rem',
                                                                    color: '#0F172A',
                                                                    lineHeight: 1.5,
                                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                                                    textAlign: 'left'
                                                                }}>
                                                                    <div style={{
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                                        marginBottom: '6px', paddingBottom: '4px', borderBottom: '1px solid #BBF7D0'
                                                                    }}>
                                                                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#166534', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                                            🩺 DATOS DE LA ORDEN (IA)
                                                                        </span>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                const textToCopy = msg.orderAnalysis.raw_summary || 
`Estudio a autorizar: ${msg.orderAnalysis.estudio || 'No especificado'}
Solicitante: ${msg.orderAnalysis.solicitante || 'No especificado'}
Matricula: ${msg.orderAnalysis.matricula || 'No especificada'}
Diagnostico: ${msg.orderAnalysis.diagnostico || 'No especificado'}
Fecha de solicitud: ${msg.orderAnalysis.fecha_solicitud || 'No especificada'}`;
                                                                                navigator.clipboard.writeText(textToCopy);
                                                                                alert('Ficha copiada al portapapeles');
                                                                            }}
                                                                            style={{
                                                                                background: 'none', border: 'none', cursor: 'pointer',
                                                                                fontSize: '0.68rem', color: '#15803D', fontWeight: 700, padding: 0
                                                                            }}
                                                                            title="Copiar datos de la orden"
                                                                        >
                                                                            📋 Copiar
                                                                        </button>
                                                                    </div>
                                                                    <div style={{ display: 'grid', gap: '3px' }}>
                                                                        <div><span style={{ fontWeight: 700, color: '#1E293B' }}>Estudio a autorizar:</span> {msg.orderAnalysis.estudio || 'No especificado'}</div>
                                                                        <div><span style={{ fontWeight: 700, color: '#1E293B' }}>Solicitante:</span> {msg.orderAnalysis.solicitante || 'No especificado'}</div>
                                                                        <div><span style={{ fontWeight: 700, color: '#1E293B' }}>Matricula:</span> {msg.orderAnalysis.matricula || 'No especificada'}</div>
                                                                        <div><span style={{ fontWeight: 700, color: '#1E293B' }}>Diagnostico:</span> {msg.orderAnalysis.diagnostico || 'No especificado'}</div>
                                                                        <div><span style={{ fontWeight: 700, color: '#1E293B' }}>Fecha de solicitud:</span> {msg.orderAnalysis.fecha_solicitud || 'No especificada'}</div>
                                                                        {/* CONTROL DE VIGENCIA DE 30 DÍAS */}
                                                                        {msg.orderAnalysis.vigencia_estado && (
                                                                            <div style={{
                                                                                marginTop: '5px',
                                                                                padding: '6px 8px',
                                                                                borderRadius: '6px',
                                                                                background: msg.orderAnalysis.vigencia_estado === 'vencida' ? '#FEF2F2' : (msg.orderAnalysis.vigencia_estado === 'vigente' ? '#ECFDF5' : '#F8FAFC'),
                                                                                border: `1px solid ${msg.orderAnalysis.vigencia_estado === 'vencida' ? '#FCA5A5' : (msg.orderAnalysis.vigencia_estado === 'vigente' ? '#86EFAC' : '#E2E8F0')}`,
                                                                                color: msg.orderAnalysis.vigencia_estado === 'vencida' ? '#B91C1C' : (msg.orderAnalysis.vigencia_estado === 'vigente' ? '#15803D' : '#64748B'),
                                                                                fontWeight: 700,
                                                                                fontSize: '0.72rem',
                                                                                display: 'flex',
                                                                                flexDirection: 'column',
                                                                                gap: '4px'
                                                                            }}>
                                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                                                                                    <span>{msg.orderAnalysis.alerta_vigencia}</span>
                                                                                    {msg.orderAnalysis.vigencia_estado === 'vencida' && (
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                const aviso = `Estimado/a paciente, verificamos su orden médica para "${msg.orderAnalysis.estudio || 'la práctica solicitada'}" pero observamos que fue emitida el ${msg.orderAnalysis.fecha_solicitud} (hace ${msg.orderAnalysis.dias_transcurridos || '>30'} días). Por normativa de las obras sociales, las órdenes médicas poseen una vigencia máxima de 30 días corridos para su autorización. Por favor solicite a su médico tratante la renovación o revalidación de la orden. ¡Muchas gracias!`;
                                                                                                navigator.clipboard.writeText(aviso);
                                                                                                alert('Aviso de orden vencida copiado al portapapeles. Podés pegarlo directamente en el chat.');
                                                                                            }}
                                                                                            style={{
                                                                                                background: '#DC2626', color: '#FFFFFF', border: 'none',
                                                                                                borderRadius: '4px', padding: '2px 6px', fontSize: '0.64rem',
                                                                                                fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap'
                                                                                            }}
                                                                                            title="Copiar respuesta modelo de orden vencida para el paciente"
                                                                                        >
                                                                                            Copiar aviso
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div style={{ marginTop: '6px', textAlign: 'left' }}>
                                                                    <button
                                                                        onClick={async (e) => {
                                                                            e.stopPropagation();
                                                                            try {
                                                                                setAnalyzingMsgId(msg.id);
                                                                                const analysis = await analyzeMedicalOrderImage(msg.mediaUrl, msg.realId, selectedChat?.phone);
                                                                                if (analysis) {
                                                                                    msg.orderAnalysis = analysis;
                                                                                    setForceUpdate(k => k + 1);
                                                                                }
                                                                            } catch (err) {
                                                                                alert('No se pudo analizar la imagen: ' + (err.message || 'Error'));
                                                                            } finally {
                                                                                setAnalyzingMsgId(null);
                                                                            }
                                                                        }}
                                                                        disabled={analyzingMsgId === msg.id}
                                                                        style={{
                                                                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                                                                            padding: '4px 10px', borderRadius: '6px',
                                                                            background: '#F1F5F9', border: '1px solid #CBD5E1',
                                                                            fontSize: '0.72rem', fontWeight: 700, color: '#334155',
                                                                            cursor: analyzingMsgId === msg.id ? 'wait' : 'pointer'
                                                                        }}
                                                                    >
                                                                        {analyzingMsgId === msg.id ? (
                                                                            <>⏳ Analizando orden con IA...</>
                                                                        ) : (
                                                                            <>🔍 Analizar orden médica con IA</>
                                                                        )}
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}

                                        {msg.text && !msg.text.startsWith('[') && !msg.text.startsWith('_event_') && msg.text !== msg.audioTranscription && (
                                            <div style={{ whiteSpace: 'pre-line' }}>
                                                {msg.text}
                                            </div>
                                        )}

                                        <div style={{
                                            fontSize: '0.68rem', color: '#94A3B8', marginTop: '6px',
                                            textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px'
                                        }}>
                                            {msg.timestamp} {!isPatient && !isNote && <Check size={12} color="#059669" />}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                                {hasMore && messageSortOrder === 'newest_first' && (
                                    <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0 8px' }}>
                                        <button
                                            type="button"
                                            onClick={() => setVisibleMessageCount(c => c + 50)}
                                            style={{
                                                background: '#F8FAFC',
                                                border: '1px solid #CBD5E1',
                                                color: '#334155',
                                                borderRadius: '20px',
                                                padding: '6px 16px',
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                                            }}
                                        >
                                            <Clock size={12} color="#64748B" />
                                            Cargar mensajes anteriores ({remainingCount} más)
                                        </button>
                                    </div>
                                )}
                            </>
                        );
                })()}
                    <div ref={messagesEndRef} />
                </div>

                {/* COMPOSITOR DE MENSAJE: CON CONTROL DE ASIGNACIÓN ESTRICTO (DOS AGENTES NO PUEDEN ESCRIBIR A LA VEZ) */}
                <div style={{ flexShrink: 0, padding: '14px 20px', background: '#FFFFFF', borderTop: '1px solid #E2E8F0' }}>
                    {/* CASO 1: CHAT CERRADO / ARCHIVADO */}
                    {isClosedOrArchived(selectedChat.status) ? (
                        <div style={{
                            padding: '12px 16px', borderRadius: '10px',
                            background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#047857',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                                <CheckCircle2 size={16} color="#047857" /> 
                                Conversación finalizada {selectedChat.resolutionReason ? `• Motivo: ${selectedChat.resolutionReason}` : ''}. Reabre para continuar la atención.
                            </div>
                            <button
                                type="button"
                                onClick={() => onAssignChat && onAssignChat(selectedChat.id, activeAgent.id)}
                                style={{
                                    padding: '6px 14px', borderRadius: '6px', border: 'none',
                                    background: '#059669', color: '#FFFFFF', fontSize: '0.74rem', fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                Reabrir y Asignarme
                            </button>
                        </div>
                    ) : isLocked ? (
                        /* CASO 2: ASIGNADA A OTRA AGENTE -> BLOQUEO ESTRICTO (MODO SOLO LECTURA) */
                        <div style={{
                            padding: '14px 18px', borderRadius: '10px',
                            background: '#FEF2F2', border: '1.5px solid #F87171', color: '#991B1B',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Lock size={20} color="#DC2626" />
                                <div>
                                    <div style={{ fontSize: '0.84rem', fontWeight: 800 }}>
                                        Conversación asignada exclusivamente a {assignedAgentObj?.name || selectedChat.assignedTo}
                                    </div>
                                    <div style={{ fontSize: '0.74rem', fontWeight: 400, color: '#B91C1C', marginTop: '2px' }}>
                                        Modo solo lectura. Para evitar colisiones y que dos agentes escriban a la vez al paciente, el teclado está bloqueado.
                                    </div>
                                </div>
                            </div>
                            {isSupervisor && (
                                <button
                                    type="button"
                                    onClick={() => onAssignChat && onAssignChat(selectedChat.id, activeAgent.id)}
                                    style={{
                                        padding: '6px 14px', borderRadius: '6px', border: '1px solid #DC2626',
                                        background: '#FFFFFF', color: '#DC2626', fontWeight: 700, fontSize: '0.74rem',
                                        cursor: 'pointer', whiteSpace: 'nowrap'
                                    }}
                                >
                                    Supervisión: Reasignar a mí
                                </button>
                            )}
                        </div>
                    ) : isBot ? (
                        /* CASO BOT: GESTIONADO POR ASISTENTE VIRTUAL */
                        <div style={{
                            padding: '12px 18px', borderRadius: '10px',
                            background: '#F5F3FF', border: '1.5px solid #DDD6FE', color: '#5B21B6',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Bot size={22} color="#7C3AED" />
                                <div>
                                    <div style={{ fontSize: '0.84rem', fontWeight: 800 }}>
                                        Conversación en Auto-gestión (Bot Activo)
                                    </div>
                                    <div style={{ fontSize: '0.74rem', color: '#6D28D9', marginTop: '2px' }}>
                                        El paciente está interactuando con el asistente o su consulta fue resuelta. Para responder como asesor humano, puedes asignártela.
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => onAssignChat && onAssignChat(selectedChat.id, activeAgent.id)}
                                style={{
                                    padding: '8px 16px', borderRadius: '8px', border: 'none',
                                    background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
                                    color: '#FFFFFF', fontSize: '0.76rem', fontWeight: 700,
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                    boxShadow: '0 2px 6px rgba(124, 58, 237, 0.3)', whiteSpace: 'nowrap'
                                }}
                            >
                                <UserCheck size={14} /> Asignarme y pausar Bot
                            </button>
                        </div>
                    ) : isUnassigned ? (
                        /* CASO 3: SIN ASIGNAR -> BLOQUEO DE TECLADO HASTA ASIGNARSE */
                        <div style={{
                            padding: '14px 18px', borderRadius: '10px',
                            background: '#FFFBEB', border: '1.5px solid #FCD34D', color: '#92400E',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <AlertCircle size={20} color="#D97706" />
                                <div>
                                    <div style={{ fontSize: '0.84rem', fontWeight: 800 }}>
                                        Conversación en cola general (Sin Asignar)
                                    </div>
                                    <div style={{ fontSize: '0.74rem', color: '#B45309', marginTop: '2px' }}>
                                        Para evitar que dos agentes respondan a la vez, debes asignártela antes de poder redactar mensajes.
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => onAssignChat && onAssignChat(selectedChat.id, activeAgent.id)}
                                style={{
                                    padding: '8px 16px', borderRadius: '8px', border: 'none',
                                    background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                                    color: '#FFFFFF', fontSize: '0.76rem', fontWeight: 700,
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                    boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)', whiteSpace: 'nowrap'
                                }}
                            >
                                <UserCheck size={14} /> Asignarme para responder
                            </button>
                        </div>
                    ) : null}

                    {/* Formulario de redacción de mensaje: Habilitado ÚNICAMENTE si está asignado a mí */}
                    {canWriteMessage && (
                        <form onSubmit={handleSend} style={{ marginTop: '0px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {/* Selector Segmentado: WhatsApp Público vs Nota Privada */}
                                <div style={{
                                    display: 'inline-flex',
                                    background: '#F1F5F9',
                                    padding: '2px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1'
                                }}>
                                    <button
                                        type="button"
                                        onClick={() => setIsPrivateNote(false)}
                                        style={{
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            fontSize: '0.72rem',
                                            fontWeight: 700,
                                            border: 'none',
                                            background: !isPrivateNote ? '#0284C7' : 'transparent',
                                            color: !isPrivateNote ? '#FFFFFF' : '#64748B',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            boxShadow: !isPrivateNote ? '0 1px 3px rgba(2,132,199,0.3)' : 'none',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        <Send size={12} />
                                        WhatsApp
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setIsPrivateNote(true)}
                                        title="Registrar una nota interna confidencial para el equipo del Sanatorio (no se envía al paciente)"
                                        style={{
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            fontSize: '0.72rem',
                                            fontWeight: 700,
                                            border: 'none',
                                            background: isPrivateNote ? '#EA580C' : 'transparent',
                                            color: isPrivateNote ? '#FFFFFF' : '#64748B',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            boxShadow: isPrivateNote ? '0 1px 3px rgba(234,88,12,0.3)' : 'none',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        <Lock size={12} />
                                        Nota Privada
                                    </button>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setQuickReplyFilter('');
                                        setQuickRepliesModalOpen(true);
                                    }}
                                    title="Abrir catálogo completo de respuestas rápidas (o tipea / en el chat)"
                                    style={{
                                        padding: '4px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                                        border: '1px solid #BAE6FD', background: '#F0F9FF', color: '#0284C7',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                                        boxShadow: '0 1px 2px rgba(2, 132, 199, 0.08)'
                                    }}
                                >
                                    <Zap size={12} /> Respuestas rápidas (/)
                                </button>
                            </div>

                            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                                Respondiendo como: <strong style={{ color: activeAgent.color }}>{activeAgent.name} ({activeAgent.role})</strong>
                            </span>
                        </div>

                        <div style={{ position: 'relative' }}>
                            {/* POPOVER FLOTANTE CONTEXTUAL DE ATAJOS RÁPIDOS CON TECLADO */}
                            {quickRepliesOpen && (
                                <div style={{
                                    position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: '8px',
                                    background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '12px',
                                    boxShadow: '0 -6px 20px rgba(0,0,0,0.12)', zIndex: 100, overflow: 'hidden'
                                }}>
                                    <div style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '8px 12px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0',
                                        fontSize: '0.7rem', fontWeight: 700, color: '#475569'
                                    }}>
                                        <span>⚡ ATAJOS RÁPIDOS (Enter: Enviar • Tab: Editar • Esc: Cerrar)</span>
                                        <span style={{ background: '#E2E8F0', padding: '1px 6px', borderRadius: '4px', fontSize: '0.65rem' }}>
                                            {filterQuickReplies(quickReplyFilter).length} resultados
                                        </span>
                                    </div>
                                    <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                                        {filterQuickReplies(quickReplyFilter).length === 0 ? (
                                            <div style={{ padding: '14px', fontSize: '0.76rem', color: '#94A3B8', textAlign: 'center' }}>
                                                No hay atajos que coincidan con "<strong>/{quickReplyFilter}</strong>".
                                            </div>
                                        ) : (
                                            filterQuickReplies(quickReplyFilter).map((qr, idx) => {
                                                const isSel = idx === selectedQuickReplyIndex;
                                                return (
                                                    <div 
                                                        key={qr.id}
                                                        onClick={() => sendDirectMessage(resolveQuickReplyText(qr.content), isPrivateNote)}
                                                        style={{
                                                            padding: '8px 12px', cursor: 'pointer',
                                                            background: isSel ? '#F0F9FF' : '#FFFFFF',
                                                            borderLeft: isSel ? '3px solid #0284C7' : '3px solid transparent',
                                                            borderBottom: '1px solid #F1F5F9',
                                                            display: 'flex', flexDirection: 'column', gap: '2px',
                                                            transition: 'background 0.1s ease'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#0284C7' }}>
                                                                /{qr.shortcut} <span style={{ color: '#0F172A', fontWeight: 700 }}>• {qr.title}</span>
                                                            </span>
                                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setMessageInput(resolveQuickReplyText(qr.content));
                                                                        setQuickRepliesOpen(false);
                                                                        inputRef.current?.focus();
                                                                    }}
                                                                    style={{
                                                                        padding: '2px 8px', fontSize: '0.65rem', fontWeight: 600,
                                                                        border: '1px solid #CBD5E1', borderRadius: '4px',
                                                                        background: '#FFFFFF', color: '#475569', cursor: 'pointer'
                                                                    }}
                                                                >
                                                                    Editar
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        sendDirectMessage(resolveQuickReplyText(qr.content), isPrivateNote);
                                                                    }}
                                                                    style={{
                                                                        padding: '2px 8px', fontSize: '0.65rem', fontWeight: 700,
                                                                        border: 'none', borderRadius: '4px',
                                                                        background: '#0284C7', color: '#FFFFFF', cursor: 'pointer'
                                                                    }}
                                                                >
                                                                    Enviar ↵
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div style={{
                                                            fontSize: '0.72rem', color: '#64748B', lineHeight: 1.3,
                                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                                                        }}>
                                                            {qr.content}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Alert de Error en subida de archivo / audio */}
                            {uploadError && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '6px 12px', marginBottom: '6px', background: '#FEF2F2',
                                    border: '1px solid #FECACA', borderRadius: '8px', color: '#B91C1C',
                                    fontSize: '0.72rem', fontWeight: 600
                                }}>
                                    <span>⚠️ {uploadError}</span>
                                    <button 
                                        type="button" 
                                        onClick={() => setUploadError(null)}
                                        style={{ background: 'none', border: 'none', color: '#B91C1C', cursor: 'pointer' }}
                                    >
                                        <X size={13} />
                                    </button>
                                </div>
                            )}

                            {/* Chip / Card de Archivo Adjunto Seleccionado */}
                            {selectedFile && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '8px 12px', marginBottom: '8px', background: '#F0F9FF',
                                    border: '1.5px solid #BAE6FD', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                        {selectedFile.type === 'image' && selectedFile.previewUrl ? (
                                            <img src={selectedFile.previewUrl} alt="Preview" style={{ width: '36px', height: '36px', borderRadius: '6px', objectFit: 'cover' }} />
                                        ) : selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls') || selectedFile.name.endsWith('.csv') ? (
                                            <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16A34A' }}>
                                                <FileSpreadsheet size={20} />
                                            </div>
                                        ) : selectedFile.name.endsWith('.docx') || selectedFile.name.endsWith('.doc') ? (
                                            <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB' }}>
                                                <FileText size={20} />
                                            </div>
                                        ) : selectedFile.name.endsWith('.pdf') ? (
                                            <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#DC2626' }}>
                                                <FileText size={20} />
                                            </div>
                                        ) : selectedFile.name.endsWith('.txt') ? (
                                            <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
                                                <FileText size={20} />
                                            </div>
                                        ) : (
                                            <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: '#E0F2FE', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284C7' }}>
                                                <File size={20} />
                                            </div>
                                        )}
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: '0.80rem', fontWeight: 800, color: '#0369A1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {selectedFile.name}
                                            </div>
                                            <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                                {selectedFile.size} • Adjunto listo (opcional: escribe un mensaje de acompañamiento)
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleRemoveSelectedFile}
                                        style={{
                                            background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px',
                                            padding: '4px', color: '#64748B', cursor: 'pointer', display: 'flex', alignItems: 'center'
                                        }}
                                        title="Quitar archivo adjunto"
                                    >
                                        <X size={15} />
                                    </button>
                                </div>
                            )}

                            {/* Contenedor Principal de Entrada (Texto / Grabador de Audio) */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                background: isPrivateNote ? '#FFF7ED' : '#F8FAFC',
                                border: isPrivateNote ? '1.5px solid #F97316' : '1px solid #CBD5E1',
                                borderRadius: '12px', padding: '6px 10px'
                            }}>
                                {isRecordingAudio ? (
                                    /* Modo Grabador de Audio Activo */
                                    <div style={{
                                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '4px 8px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{
                                                width: '10px', height: '10px', borderRadius: '50%', background: '#EF4444',
                                                display: 'inline-block'
                                            }}></span>
                                            <span style={{ fontSize: '0.80rem', fontWeight: 800, color: '#B91C1C' }}>
                                                Grabando nota de voz WhatsApp: {Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, '0')}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <button
                                                type="button"
                                                onClick={cancelAudioRecording}
                                                style={{
                                                    background: '#FFFFFF', border: '1px solid #FECACA', color: '#DC2626',
                                                    padding: '4px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                                                }}
                                            >
                                                <Trash2 size={13} /> Cancelar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={stopAudioRecording}
                                                style={{
                                                    background: '#16A34A', border: 'none', color: '#FFFFFF',
                                                    padding: '5px 12px', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 800,
                                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
                                                    boxShadow: '0 2px 4px rgba(22, 163, 74, 0.25)'
                                                }}
                                            >
                                                <Send size={13} /> Enviar Audio
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    /* Modo Redacción Normal con Adjuntos */
                                    <>
                                        {/* Input File Oculto Universal */}
                                        <input 
                                            type="file"
                                            ref={attachmentInputRef}
                                            onChange={handleFileSelected}
                                            accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                                            style={{ display: 'none' }}
                                        />

                                        {/* Botón Clip para adjuntar cualquier archivo */}
                                        <button
                                            type="button"
                                            onClick={() => !uploadingMedia && attachmentInputRef.current?.click()}
                                            disabled={isLocked || uploadingMedia}
                                            title="Adjuntar archivo (Excel, Word, PDF, TXT, Fotos, Audios)"
                                            style={{
                                                background: selectedFile ? '#E0F2FE' : '#FFFFFF',
                                                border: selectedFile ? '1.5px solid #0284C7' : '1px solid #CBD5E1',
                                                borderRadius: '8px', padding: '6px 8px',
                                                color: selectedFile ? '#0284C7' : '#64748B',
                                                cursor: (isLocked || uploadingMedia) ? 'not-allowed' : 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                boxShadow: selectedFile ? '0 1px 3px rgba(2, 132, 199, 0.2)' : 'none',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            <Paperclip size={17} />
                                        </button>

                                        {/* Input de Texto */}
                                        <input 
                                            ref={inputRef}
                                            type="text"
                                            disabled={isLocked || uploadingMedia}
                                            placeholder={isPrivateNote 
                                                ? `Escribe una nota interna que solo verá el equipo (o / para atajos)...` 
                                                : selectedFile
                                                    ? `Mensaje opcional para acompañar ${selectedFile.name}...`
                                                    : `Escribe respuesta a ${selectedChat.contactName} (o / para atajos rápidos)...`}
                                            value={messageInput}
                                            onChange={handleInputChange}
                                            onKeyDown={handleInputKeyDown}
                                            style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '0.88rem', color: '#1E293B' }}
                                        />

                                        {/* Botón Micrófono para Grabar Nota de Voz */}
                                        {!messageInput.trim() && !selectedFile && !isPrivateNote && (
                                            <button
                                                type="button"
                                                onClick={startAudioRecording}
                                                disabled={isLocked || uploadingMedia}
                                                title="Grabar y enviar nota de voz por WhatsApp"
                                                style={{
                                                    background: '#FFFFFF', border: '1px solid #CBD5E1',
                                                    borderRadius: '8px', padding: '6px 8px',
                                                    color: '#0284C7', cursor: (isLocked || uploadingMedia) ? 'not-allowed' : 'pointer',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                                }}
                                            >
                                                <Mic size={17} />
                                            </button>
                                        )}

                                        {/* Botón Enviar */}
                                        <button 
                                            type="submit"
                                            disabled={isLocked || uploadingMedia || (!messageInput.trim() && !selectedFile)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                background: isPrivateNote ? '#EA580C' : '#0284C7',
                                                color: '#FFFFFF', border: 'none', padding: '8px 16px',
                                                borderRadius: '8px', fontWeight: 700, fontSize: '0.8rem',
                                                cursor: (isLocked || uploadingMedia || (!messageInput.trim() && !selectedFile)) ? 'not-allowed' : 'pointer',
                                                opacity: (isLocked || uploadingMedia || (!messageInput.trim() && !selectedFile)) ? 0.6 : 1,
                                                boxShadow: !isLocked && (messageInput.trim() || selectedFile) ? '0 2px 6px rgba(2, 132, 199, 0.3)' : 'none'
                                            }}
                                        >
                                            {uploadingMedia ? (
                                                <>
                                                    <Loader2 size={14} className="animate-spin" />
                                                    Subiendo...
                                                </>
                                            ) : isPrivateNote ? (
                                                <>
                                                    <Lock size={14} /> Guardar Nota
                                                </>
                                            ) : selectedFile ? (
                                                <>
                                                    <Send size={14} /> Enviar con Adjunto
                                                </>
                                            ) : (
                                                <>
                                                    <Send size={14} /> Enviar WhatsApp
                                                </>
                                            )}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </form>
                )}
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* SEPARADOR RESIZABLE ENTRE CHAT Y PANEL DE INFORMACIÓN             */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div
                onMouseDown={handleMouseDownRight}
                onDoubleClick={() => {
                    setRightPanelWidth(340);
                    localStorage.setItem('cc_right_panel_width', '340');
                }}
                style={{
                    width: '6px',
                    height: '100%',
                    cursor: 'col-resize',
                    background: isDraggingRight ? '#0284C7' : '#F8FAFC',
                    borderLeft: '1px solid #E2E8F0',
                    borderRight: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    userSelect: 'none',
                    transition: 'background 0.15s ease',
                    zIndex: 10
                }}
                title="Arrastrar para ajustar el ancho de la información del paciente (260px - 550px) • Doble clic para restablecer"
            >
                <div style={{
                    width: '2px',
                    height: '32px',
                    borderRadius: '2px',
                    background: isDraggingRight ? '#FFFFFF' : '#CBD5E1'
                }} />
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* COLUMNA 3: FICHA CRM, HISTORIAL 360° Y PARÁMETROS SALUS (AJUSTABLE) */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                width: `${rightPanelWidth}px`,
                minWidth: '260px',
                maxWidth: '550px',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                minHeight: 0,
                background: ccTheme.rightSidebarBg || '#FFFFFF',
                color: ccTheme.rightSidebarText || '#0F172A',
                overflowY: 'auto'
            }}>
                <div style={{ display: 'flex', flexShrink: 0, borderBottom: `1px solid ${ccTheme.rightSidebarBorder || '#F1F5F9'}`, background: ccTheme.leftSidebarHeaderBg || (ccTheme.isDark ? '#0F172A' : '#FAFAFA') }}>
                    <button 
                        onClick={() => setActiveDetailTab('info')}
                        style={{
                            flex: 1, padding: '12px 0', border: 'none', background: 'transparent',
                            fontWeight: 700, fontSize: '0.76rem',
                            color: activeDetailTab === 'info' ? (ccTheme.accentColor || '#0284C7') : themeCardSubtext,
                            borderBottom: activeDetailTab === 'info' ? `2px solid ${ccTheme.accentColor || '#0284C7'}` : '2px solid transparent',
                            cursor: 'pointer'
                        }}
                    >
                        Ficha CRM
                    </button>
                    <button 
                        onClick={() => setActiveDetailTab('historial')}
                        style={{
                            flex: 1, padding: '12px 0', border: 'none', background: 'transparent',
                            fontWeight: 700, fontSize: '0.76rem',
                            color: activeDetailTab === 'historial' ? (ccTheme.accentColor || '#0284C7') : themeCardSubtext,
                            borderBottom: activeDetailTab === 'historial' ? `2px solid ${ccTheme.accentColor || '#0284C7'}` : '2px solid transparent',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                        }}
                    >
                        <History size={13} />
                        Historial
                    </button>
                    <button 
                        onClick={() => setActiveDetailTab('prestadores')}
                        style={{
                            flex: 1, padding: '12px 0', border: 'none', background: 'transparent',
                            fontWeight: 700, fontSize: '0.76rem',
                            color: activeDetailTab === 'prestadores' ? (ccTheme.accentColor || '#0284C7') : themeCardSubtext,
                            borderBottom: activeDetailTab === 'prestadores' ? `2px solid ${ccTheme.accentColor || '#0284C7'}` : '2px solid transparent',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                        }}
                    >
                        <Stethoscope size={13} />
                        Prestadores
                    </button>
                </div>

                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* TAB 1: FICHA CRM DEL PACIENTE */}
                    {activeDetailTab === 'info' && (
                        <>
                            {/* WIDGET PRINCIPAL: RESUMEN INTELIGENTE IA (OPENAI) & PRESTADOR DETECTADO */}
                            <div style={{
                                background: rightCardBg,
                                border: `1.5px solid ${rightCardBorder}`,
                                borderRadius: '12px',
                                padding: '14px',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 800, color: ccTheme.accentColor || '#4F46E5' }}>
                                        <Sparkles size={16} color={ccTheme.accentColor || '#6366F1'} />
                                        RESUMEN IA DE LA CONSULTA
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleRunAiSummary}
                                        disabled={isGeneratingSummary}
                                        title="Analizar historial completo de la conversación con IA"
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                            padding: '4px 8px', borderRadius: '6px',
                                            border: `1px solid ${rightCardBorder}`, 
                                            background: ccTheme.isDark ? '#312E81' : '#EEF2FF',
                                            color: ccTheme.isDark ? '#C7D2FE' : '#4338CA', 
                                            fontSize: '0.7rem', fontWeight: 700,
                                            cursor: isGeneratingSummary ? 'wait' : 'pointer'
                                        }}
                                    >
                                        <RefreshCw size={11} className={isGeneratingSummary ? 'animate-spin' : ''} />
                                        {isGeneratingSummary ? 'Analizando...' : (aiSummaryData ? 'Actualizar IA' : 'Generar')}
                                    </button>
                                </div>

                                {aiSummaryData ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {/* 1. QUÉ NECESITA EL PACIENTE */}
                                        <div style={{
                                            background: ccTheme.leftSidebarHeaderBg || (ccTheme.isDark ? '#1E293B' : '#FFFFFF'), 
                                            padding: '10px', borderRadius: '8px',
                                            border: `1px solid ${rightCardBorder}`, borderLeft: `3px solid ${ccTheme.accentColor || '#6366F1'}`
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: themeCardSubtext, textTransform: 'uppercase' }}>
                                                    ¿Qué necesita el paciente?
                                                </span>
                                                {aiSummaryData.tipo_tramite && (
                                                    <span style={{
                                                        fontSize: '0.65rem', fontWeight: 700, 
                                                        background: ccTheme.isDark ? '#312E81' : '#E0E7FF',
                                                        color: ccTheme.isDark ? '#C7D2FE' : '#3730A3', 
                                                        padding: '1px 6px', borderRadius: '4px'
                                                    }}>
                                                        {aiSummaryData.tipo_tramite}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: themeCardText, lineHeight: 1.45, fontWeight: 600 }}>
                                                {aiSummaryData.resumen_solicitud || 'El paciente no ha especificado aún su solicitud.'}
                                            </div>
                                        </div>

                                        {/* 2. DATOS DETECTADOS POR LA IA */}
                                        {aiSummaryData.datos_paciente && (
                                            <div style={{
                                                background: ccTheme.leftSidebarHeaderBg || (ccTheme.isDark ? '#1E293B' : '#FFFFFF'), 
                                                padding: '10px', borderRadius: '8px',
                                                border: `1px solid ${rightCardBorder}`
                                            }}>
                                                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: themeCardSubtext, textTransform: 'uppercase', marginBottom: '6px' }}>
                                                    Datos Aportados por el Paciente
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.74rem' }}>
                                                    <div>
                                                        <span style={{ color: themeCardSubtext, fontSize: '0.68rem', display: 'block' }}>DNI</span>
                                                        <strong style={{ color: themeCardText }}>{aiSummaryData.datos_paciente.dni || '—'}</strong>
                                                    </div>
                                                    <div>
                                                        <span style={{ color: themeCardSubtext, fontSize: '0.68rem', display: 'block' }}>Obra Social</span>
                                                        <strong style={{ color: themeCardText }}>
                                                            {aiSummaryData.datos_paciente.obra_social || '—'}
                                                            {aiSummaryData.datos_paciente.plan_obra_social && !aiSummaryData.datos_paciente.obra_social?.includes(aiSummaryData.datos_paciente.plan_obra_social) ? ` (${aiSummaryData.datos_paciente.plan_obra_social})` : ''}
                                                        </strong>
                                                    </div>
                                                    <div>
                                                        <span style={{ color: themeCardSubtext, fontSize: '0.68rem', display: 'block' }}>Nacimiento</span>
                                                        <strong style={{ color: themeCardText }}>{aiSummaryData.datos_paciente.fecha_nacimiento || '—'}</strong>
                                                    </div>
                                                    <div>
                                                        <span style={{ color: themeCardSubtext, fontSize: '0.68rem', display: 'block' }}>Dpto / Localidad</span>
                                                        <strong style={{ color: themeCardText }}>{aiSummaryData.datos_paciente.departamento || '—'}</strong>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* 3. DOCTOR DETECTADO & PARÁMETROS DE ATENCIÓN */}
                                        {(() => {
                                            // Validar si el médico proviene exclusivamente del sello/orden médica (solicitante) y no del texto del paciente
                                            const isDoctorFromOrderSolicitante = (docName) => {
                                                if (!docName || !selectedChat?.messages) return false;
                                                const cleanDoc = docName.replace(/\b(dr|dra|doctor|doctora)\b\.?/gi, '').trim().toLowerCase();
                                                const docWords = cleanDoc.split(/\s+/).filter(w => w.length >= 3);
                                                if (docWords.length === 0) return false;

                                                const orderSolicitantes = [];
                                                selectedChat.messages.forEach(m => {
                                                    const sol = m.orderAnalysis?.solicitante || m.raw_payload?.order_analysis?.solicitante || m.order_analysis?.solicitante;
                                                    if (sol && typeof sol === 'string') {
                                                        orderSolicitantes.push(sol.replace(/\b(dr|dra|doctor|doctora)\b\.?/gi, '').trim().toLowerCase());
                                                    }
                                                });

                                                if (orderSolicitantes.length === 0) return false;
                                                const matchesSol = orderSolicitantes.some(sol => docWords.some(w => sol.includes(w)));
                                                if (!matchesSol) return false;

                                                const patientText = selectedChat.messages
                                                    .filter(m => (m.sender === 'patient' || m.direction === 'incoming') && (m.text || m.content) && !(m.text || m.content).startsWith('['))
                                                    .map(m => (m.text || m.content).toLowerCase())
                                                    .join(' ');

                                                const mentionedInText = docWords.some(w => patientText.includes(w));
                                                return !mentionedInText;
                                            };

                                            const effectivePrestadorMatched = aiSummaryData.prestador_matched && !isDoctorFromOrderSolicitante(aiSummaryData.prestador_matched.profesional_nombre)
                                                ? aiSummaryData.prestador_matched
                                                : null;
                                            const effectiveDoctorDetectado = aiSummaryData.doctor_detectado?.nombre_aproximado && !isDoctorFromOrderSolicitante(aiSummaryData.doctor_detectado.nombre_aproximado)
                                                ? aiSummaryData.doctor_detectado
                                                : null;

                                            if (effectivePrestadorMatched) {
                                                return (
                                                    <div style={{
                                                        background: ccTheme.isDark ? '#064E3B' : '#F0FDF4', 
                                                        padding: '10px', borderRadius: '8px',
                                                        border: `1.5px solid ${ccTheme.isDark ? '#047857' : '#86EFAC'}`
                                                    }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                            <span style={{ fontSize: '0.68rem', fontWeight: 800, color: ccTheme.isDark ? '#6EE7B7' : '#15803D', textTransform: 'uppercase' }}>
                                                                👨‍⚕️ Prestador Detectado
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setActiveDetailTab('prestadores');
                                                                    setDoctorQuery(effectivePrestadorMatched.profesional_nombre);
                                                                }}
                                                                style={{
                                                                    background: 'none', border: 'none', 
                                                                    color: ccTheme.isDark ? '#6EE7B7' : '#166534',
                                                                    fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer', padding: 0,
                                                                    textDecoration: 'underline'
                                                                }}
                                                            >
                                                                Ver en Prestadores ↗
                                                            </button>
                                                        </div>

                                                        <div style={{ fontWeight: 800, fontSize: '0.84rem', color: ccTheme.isDark ? '#F0FDF4' : '#0F172A' }}>
                                                            {effectivePrestadorMatched.profesional_nombre}
                                                        </div>
                                                        <div style={{ fontSize: '0.72rem', color: ccTheme.accentColor || '#0284C7', fontWeight: 600 }}>
                                                            {effectivePrestadorMatched.especialidad || 'Consulta Médica'}
                                                        </div>
                                                        {effectivePrestadorMatched.consultorio_actual && (
                                                            <div style={{ fontSize: '0.72rem', color: ccTheme.isDark ? '#34D399' : '#059669', fontWeight: 700, marginTop: '2px' }}>
                                                                📍 {effectivePrestadorMatched.consultorio_actual}
                                                            </div>
                                                        )}

                                                        {effectivePrestadorMatched.condiciones_consulta && (
                                                            <div style={{
                                                                marginTop: '8px', padding: '8px', 
                                                                background: ccTheme.isDark ? '#022C22' : '#FFFFFF',
                                                                borderRadius: '6px', 
                                                                border: `1px solid ${ccTheme.isDark ? '#065F46' : '#BBF7D0'}`,
                                                                fontSize: '0.72rem', 
                                                                color: ccTheme.isDark ? '#E2E8F0' : '#334155', 
                                                                lineHeight: 1.45,
                                                                whiteSpace: 'pre-line', maxHeight: '160px', overflowY: 'auto'
                                                            }}>
                                                                <div style={{ fontWeight: 800, color: ccTheme.isDark ? '#6EE7B7' : '#166534', fontSize: '0.68rem', marginBottom: '4px' }}>
                                                                    📋 CONDICIONES Y PARÁMETROS:
                                                                </div>
                                                                {effectivePrestadorMatched.condiciones_consulta}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            }

                                            if (effectiveDoctorDetectado) {
                                                return (
                                                    <div style={{
                                                        background: ccTheme.isDark ? '#451A03' : '#FFFBEB', 
                                                        padding: '10px', borderRadius: '8px',
                                                        border: `1px solid ${ccTheme.isDark ? '#78350F' : '#FDE68A'}`, 
                                                        fontSize: '0.74rem'
                                                    }}>
                                                        <div style={{ fontWeight: 800, color: ccTheme.isDark ? '#FDE68A' : '#B45309', marginBottom: '2px' }}>
                                                            ⚠️ Doctor mencionado: {effectiveDoctorDetectado.nombre_aproximado}
                                                        </div>
                                                        <div style={{ color: ccTheme.isDark ? '#FCD34D' : '#92400E', fontSize: '0.7rem' }}>
                                                            No se encontró coincidencia exacta en SALUS. Puedes buscarlo por nombre parcial en la pestaña "Prestadores".
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div style={{
                                                    padding: '8px 10px', 
                                                    background: ccTheme.leftSidebarHeaderBg || (ccTheme.isDark ? '#1E293B' : '#FFFFFF'), 
                                                    borderRadius: '6px',
                                                    border: `1px solid ${rightCardBorder}`, 
                                                    fontSize: '0.7rem', color: themeCardSubtext
                                                }}>
                                                    ℹ️ La IA no detectó un médico específico en la conversación. Puedes consultar la cartilla en la pestaña "Prestadores".
                                                </div>
                                            );
                                        })()}
                                    </div>
                                ) : (
                                    <div style={{
                                        padding: '12px', 
                                        background: ccTheme.leftSidebarHeaderBg || (ccTheme.isDark ? '#1E293B' : '#FFFFFF'), 
                                        borderRadius: '8px',
                                        border: `1px dashed ${rightCardBorder}`, 
                                        textAlign: 'center'
                                    }}>
                                        <div style={{ fontSize: '0.76rem', color: themeCardSubtext, marginBottom: '8px' }}>
                                            Genera con IA un resumen ejecutivo de lo que necesita el paciente y detecta automáticamente los parámetros del médico consultado.
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleRunAiSummary}
                                            disabled={isGeneratingSummary}
                                            style={{
                                                padding: '6px 14px', borderRadius: '8px',
                                                background: 'linear-gradient(135deg, #4F46E5, #6366F1)',
                                                color: '#FFFFFF', border: 'none', fontWeight: 700,
                                                fontSize: '0.76rem', cursor: isGeneratingSummary ? 'wait' : 'pointer',
                                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                boxShadow: '0 2px 6px rgba(99, 102, 241, 0.3)'
                                            }}
                                        >
                                            <Sparkles size={13} />
                                            {isGeneratingSummary ? 'Analizando con IA...' : 'Generar Resumen con IA'}
                                        </button>
                                    </div>
                                )}
                            </div>


                            {/* CABECERA DE LA FICHA DEL PACIENTE */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.74rem', fontWeight: 800, color: themeCardText, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Datos del Paciente
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setIsSearchingThirdParty(prev => !prev)}
                                    title="Vincular o conmutar ficha médica por DNI si el titular gestiona para otro paciente (hijo/a, familiar)"
                                    style={{
                                        fontSize: '0.66rem',
                                        fontWeight: 700,
                                        color: isSearchingThirdParty ? '#DC2626' : (ccTheme.accentColor || '#0284C7'),
                                        background: isSearchingThirdParty ? (ccTheme.isDark ? '#450A0A' : '#FEF2F2') : themeCardBg,
                                        border: `1px solid ${isSearchingThirdParty ? '#FCA5A5' : rightCardBorder}`,
                                        padding: '3px 8px',
                                        borderRadius: '6px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <Search size={11} />
                                    {isSearchingThirdParty ? 'Cerrar búsqueda' : 'Gestionar para otro DNI'}
                                </button>
                            </div>

                            {/* BUSCADOR DE TERCEROS / OTRO PACIENTE POR DNI EN SALUS */}
                            {isSearchingThirdParty && (
                                <div style={{
                                    background: rightCardBg,
                                    border: `1.5px solid ${rightCardBorder}`,
                                    borderRadius: '8px',
                                    padding: '10px 12px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px'
                                }}>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: ccTheme.accentColor || '#0369A1', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <span>🔍 Vincular Paciente por DNI en SALUS</span>
                                    </div>
                                    <div style={{ fontSize: '0.67rem', color: themeCardSubtext }}>
                                        Ingresá el DNI del paciente que realmente se atenderá (ej: hijo/a, madre, familiar):
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                                        <input 
                                            type="text"
                                            placeholder="DNI del paciente (sin puntos)..."
                                            value={thirdPartyDniInput}
                                            onChange={(e) => setThirdPartyDniInput(e.target.value.replace(/\D/g, ''))}
                                            onKeyDown={(e) => { if (e.key === 'Enter') handleLinkThirdPartyDni(); }}
                                            style={{
                                                flex: 1, padding: '5px 8px', fontSize: '0.76rem',
                                                borderRadius: '6px', border: `1px solid ${rightCardBorder}`, outline: 'none',
                                                background: ccTheme.leftSidebarHeaderBg || (ccTheme.isDark ? '#1E293B' : '#FFFFFF'),
                                                color: themeCardText
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={handleLinkThirdPartyDni}
                                            disabled={isSearchingSalus}
                                            style={{
                                                padding: '5px 12px', background: ccTheme.accentColor || '#0284C7', color: '#FFFFFF',
                                                border: 'none', borderRadius: '6px', fontSize: '0.72rem',
                                                fontWeight: 700, cursor: isSearchingSalus ? 'wait' : 'pointer',
                                                display: 'inline-flex', alignItems: 'center', gap: '4px'
                                            }}
                                        >
                                            <Search size={11} />
                                            {isSearchingSalus ? 'Buscando...' : 'Vincular'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* SELECTOR FICHA DUAL: TITULAR VS PACIENTE (PROPUESTA 1 APROBADA) */}
                            {selectedChat.customFields?.fichaDual?.esGestionTercero && (
                                <div style={{
                                    display: 'flex',
                                    gap: '4px',
                                    background: ccTheme.isDark ? '#0F172A' : '#F1F5F9',
                                    padding: '3px',
                                    borderRadius: '8px',
                                    border: `1px solid ${rightCardBorder}`
                                }}>
                                    <button
                                        type="button"
                                        onClick={() => setActiveDualTab('paciente')}
                                        style={{
                                            flex: 1,
                                            padding: '6px 8px',
                                            borderRadius: '6px',
                                            border: 'none',
                                            background: activeDualTab === 'paciente' ? (ccTheme.accentColor || '#0284C7') : 'transparent',
                                            color: activeDualTab === 'paciente' ? '#FFFFFF' : themeCardSubtext,
                                            fontWeight: 800,
                                            fontSize: '0.68rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '4px',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <span>👤 Paciente:</span>
                                        <span style={{ maxWidth: '95px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {selectedChat.customFields.fichaDual.pacienteNombre || crmForm.pacienteNombre || 'Paciente'}
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveDualTab('titular')}
                                        style={{
                                            flex: 1,
                                            padding: '6px 8px',
                                            borderRadius: '6px',
                                            border: 'none',
                                            background: activeDualTab === 'titular' ? (ccTheme.accentColor || '#0284C7') : 'transparent',
                                            color: activeDualTab === 'titular' ? '#FFFFFF' : themeCardSubtext,
                                            fontWeight: 800,
                                            fontSize: '0.68rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '4px',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <span>📱 Titular:</span>
                                        <span style={{ maxWidth: '95px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {selectedChat.customFields.fichaDual.titularNombre || selectedChat.contactName || 'Titular'}
                                        </span>
                                    </button>
                                </div>
                            )}

                            {/* VISTA SI SE SELECCIONA FICHA TITULAR */}
                            {selectedChat.customFields?.fichaDual?.esGestionTercero && activeDualTab === 'titular' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{
                                        background: ccTheme.isDark ? '#1E293B' : '#EFF6FF',
                                        border: `1.5px solid ${ccTheme.isDark ? '#3B82F6' : '#93C5FD'}`,
                                        borderRadius: '8px',
                                        padding: '10px 12px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '6px'
                                    }}>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: ccTheme.isDark ? '#93C5FD' : '#1E40AF', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <span>📱 Titular de la Línea Telefónica</span>
                                        </div>
                                        <div style={{ fontSize: '0.68rem', color: themeCardSubtext }}>
                                            Esta persona es quien escribe desde WhatsApp gestionando en nombre del paciente.
                                        </div>
                                    </div>

                                    <div style={{ background: rightCardBg, border: `1px solid ${rightCardBorder}`, borderRadius: '8px', padding: '8px 10px' }}>
                                        <div style={{ fontSize: '0.65rem', color: themeCardSubtext, fontWeight: 600 }}>NOMBRE DEL TITULAR</div>
                                        <div style={{ fontSize: '0.84rem', fontWeight: 700, color: themeCardText }}>
                                            {selectedChat.customFields.fichaDual.titularNombre || selectedChat.contactName}
                                        </div>
                                    </div>

                                    <div style={{ background: rightCardBg, border: `1px solid ${rightCardBorder}`, borderRadius: '8px', padding: '8px 10px' }}>
                                        <div style={{ fontSize: '0.65rem', color: themeCardSubtext, fontWeight: 600 }}>NÚMERO DE WHATSAPP</div>
                                        <div style={{ fontSize: '0.84rem', fontWeight: 800, color: ccTheme.accentColor || '#0284C7' }}>
                                            +{selectedChat.phone}
                                        </div>
                                    </div>

                                    <div style={{ background: rightCardBg, border: `1px solid ${rightCardBorder}`, borderRadius: '8px', padding: '8px 10px' }}>
                                        <div style={{ fontSize: '0.65rem', color: themeCardSubtext, fontWeight: 600 }}>RELACIÓN / PARENTESCO</div>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: themeCardText }}>
                                            {selectedChat.customFields.fichaDual.parentesco || 'Familiar'}
                                        </div>
                                    </div>

                                    <div style={{ background: rightCardBg, border: `1px solid ${rightCardBorder}`, borderRadius: '8px', padding: '8px 10px' }}>
                                        <div style={{ fontSize: '0.65rem', color: themeCardSubtext, fontWeight: 600 }}>PACIENTE VINCULADO</div>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#166534' }}>
                                            👤 {selectedChat.customFields.fichaDual.pacienteNombre || crmForm.pacienteNombre} (DNI {selectedChat.customFields.fichaDual.pacienteDni || crmForm.dni})
                                        </div>
                                    </div>
                                </div>
                            ) : (
                            /* VISTA INSTITUCIONAL LIMPIA Y CLÍNICA DE LA FICHA DEL PACIENTE (SOLO LECTURA SALUS) */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {selectedChat.customFields?.fichaDual?.esGestionTercero && (
                                        <div style={{
                                            background: ccTheme.isDark ? '#064E3B22' : '#F0FDF4',
                                            border: `1px solid ${ccTheme.isDark ? '#059669' : '#86EFAC'}`,
                                            borderRadius: '6px',
                                            padding: '6px 10px',
                                            fontSize: '0.68rem',
                                            color: ccTheme.isDark ? '#86EFAC' : '#166534',
                                            fontWeight: 700,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '5px'
                                        }}>
                                            <span>👥 Gestión por tercero: Titular {selectedChat.customFields.fichaDual.titularNombre || selectedChat.contactName}</span>
                                        </div>
                                    )}

                                    {/* ALERTA ACCESO RÁPIDO: TURNOS PRÓXIMOS & ONLINE DEL PACIENTE */}
                                    {patientHistory?.turnosProximos && patientHistory.turnosProximos.length > 0 && (
                                        <div style={{
                                            background: ccTheme.isDark ? '#064E3B22' : 'linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 100%)',
                                            border: `1.5px solid ${ccTheme.isDark ? '#059669' : '#6EE7B7'}`,
                                            borderRadius: '8px',
                                            padding: '8px 10px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '5px',
                                            boxShadow: '0 2px 5px rgba(5, 150, 105, 0.08)'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: ccTheme.isDark ? '#6EE7B7' : '#065F46', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <span>📅 TIENE TURNOS PRÓXIMOS ({patientHistory.turnosProximos.length})</span>
                                                </div>
                                                <button 
                                                    onClick={() => setActiveDetailTab('historial')}
                                                    style={{
                                                        fontSize: '0.65rem', fontWeight: 700, 
                                                        color: ccTheme.isDark ? '#A7F3D0' : '#047857', 
                                                        background: ccTheme.isDark ? '#064E3B' : '#D1FAE5',
                                                        border: 'none', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer'
                                                    }}
                                                >
                                                    Ver en Historial →
                                                </button>
                                            </div>
                                            {patientHistory.turnosProximos.slice(0, 2).map((tp, i) => (
                                                <div key={i} style={{ 
                                                    background: rightCardBg, 
                                                    border: `1px solid ${rightCardBorder}`, 
                                                    borderRadius: '6px', padding: '6px 8px' 
                                                }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '0.76rem', fontWeight: 800, color: ccTheme.isDark ? '#6EE7B7' : '#047857' }}>
                                                            📅 {tp.fecha_visita} {tp.hora_visita ? `(${tp.hora_visita} hs)` : ''}
                                                        </span>
                                                        <span style={{
                                                            fontSize: '0.62rem', fontWeight: 800, padding: '1px 5px', borderRadius: '4px',
                                                            background: tp.origen === 'online' ? (ccTheme.isDark ? '#1E3A5F' : '#EFF6FF') : (ccTheme.isDark ? '#064E3B' : '#F1F5F9'),
                                                            color: tp.origen === 'online' ? (ccTheme.isDark ? '#93C5FD' : '#1D4ED8') : themeCardSubtext
                                                        }}>
                                                            {tp.origen === 'online' ? '🌐 ONLINE WEB' : '🏥 PRESENCIAL'}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: themeCardText, fontWeight: 700, marginTop: '2px' }}>
                                                        👨‍⚕️ {tp.medico || 'Profesional Asignado'}
                                                    </div>
                                                    <div style={{ fontSize: '0.67rem', color: themeCardSubtext }}>
                                                        {tp.agenda || tp.tipo_visita} {tp.cliente ? `• ${tp.cliente}` : ''}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* DNI & NHC SALUS */}
                                    <div style={{ display: 'grid', gridTemplateColumns: selectedChat.customFields?.nhc ? '1fr 1fr' : '1fr', gap: '6px' }}>
                                        <div style={{ background: rightCardBg, border: `1px solid ${rightCardBorder}`, borderRadius: '8px', padding: '8px 10px' }}>
                                            <div style={{ fontSize: '0.65rem', color: themeCardSubtext, fontWeight: 600 }}>DNI / IDENTIFICACIÓN</div>
                                            <div style={{ fontSize: '0.86rem', fontWeight: 800, color: themeCardText }}>
                                                {crmForm.dni || selectedChat.customFields?.dni || 'A verificar'}
                                            </div>
                                        </div>
                                        {selectedChat.customFields?.nhc && (
                                            <div style={{ background: ccTheme.isDark ? '#1E3A5F' : '#F0F9FF', border: `1px solid ${ccTheme.isDark ? '#0284C7' : '#BAE6FD'}`, borderRadius: '8px', padding: '8px 10px' }}>
                                                <div style={{ fontSize: '0.65rem', color: ccTheme.isDark ? '#BAE6FD' : '#0369A1', fontWeight: 700 }}>NHC (SALUS)</div>
                                                <div style={{ fontSize: '0.86rem', fontWeight: 800, color: ccTheme.isDark ? '#38BDF8' : '#0284C7' }}>
                                                    #{selectedChat.customFields?.nhc}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* NOMBRE COMPLETO */}
                                    <div style={{ background: rightCardBg, border: `1px solid ${rightCardBorder}`, borderRadius: '8px', padding: '8px 10px' }}>
                                        <div style={{ fontSize: '0.65rem', color: themeCardSubtext, fontWeight: 600 }}>NOMBRE COMPLETO</div>
                                        <div style={{ fontSize: '0.84rem', fontWeight: 700, color: themeCardText }}>
                                            {crmForm.pacienteNombre || selectedChat.customFields?.pacienteNombre || selectedChat.contactName || 'Paciente'}
                                        </div>
                                    </div>

                                    {/* OBRA SOCIAL */}
                                    <div style={{ background: rightCardBg, border: `1px solid ${rightCardBorder}`, borderRadius: '8px', padding: '8px 10px' }}>
                                        <div style={{ fontSize: '0.65rem', color: themeCardSubtext, fontWeight: 600 }}>OBRA SOCIAL / PREPAGA</div>
                                        <div style={{ fontSize: '0.84rem', fontWeight: 800, color: ccTheme.accentColor || '#0284C7' }}>
                                            {crmForm.obraSocial || selectedChat.customFields?.obraSocial || 'A consultar'}
                                        </div>
                                    </div>

                                    {/* FECHA DE NACIMIENTO */}
                                    <div style={{ background: rightCardBg, border: `1px solid ${rightCardBorder}`, borderRadius: '8px', padding: '8px 10px' }}>
                                        <div style={{ fontSize: '0.65rem', color: themeCardSubtext, fontWeight: 600 }}>FECHA DE NACIMIENTO</div>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: themeCardText }}>
                                            {crmForm.fechaNacimiento || selectedChat.customFields?.fechaNacimiento || 'No informada'}
                                        </div>
                                    </div>

                                    {/* EMAIL */}
                                    <div style={{ background: rightCardBg, border: `1px solid ${rightCardBorder}`, borderRadius: '8px', padding: '8px 10px' }}>
                                        <div style={{ fontSize: '0.65rem', color: themeCardSubtext, fontWeight: 600 }}>EMAIL</div>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: themeCardText, wordBreak: 'break-all' }}>
                                            {crmForm.email || selectedChat.customFields?.email || 'No informado'}
                                        </div>
                                    </div>

                                    {/* TELÉFONO DE CONTACTO */}
                                    <div style={{ background: rightCardBg, border: `1px solid ${rightCardBorder}`, borderRadius: '8px', padding: '8px 10px' }}>
                                        <div style={{ fontSize: '0.65rem', color: themeCardSubtext, fontWeight: 600 }}>TELÉFONO DE CONTACTO</div>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: themeCardText }}>
                                            {selectedChat.customFields?.pacienteContacto || selectedChat.phone}
                                        </div>
                                    </div>

                                    {/* DEPARTAMENTO / SEDE */}
                                    <div style={{ background: rightCardBg, border: `1px solid ${rightCardBorder}`, borderRadius: '8px', padding: '8px 10px' }}>
                                        <div style={{ fontSize: '0.65rem', color: themeCardSubtext, fontWeight: 600 }}>DEPARTAMENTO / SEDE HABITUAL</div>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: themeCardText, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <MapPin size={12} color={ccTheme.accentColor || '#0284C7'} />
                                            {crmForm.departamento || selectedChat.customFields?.departamento || 'San Juan'}
                                        </div>
                                    </div>

                                    {/* MOTIVO DE CONSULTA */}
                                    <div style={{ background: rightCardBg, border: `1px solid ${rightCardBorder}`, borderRadius: '8px', padding: '8px 10px' }}>
                                        <div style={{ fontSize: '0.65rem', color: themeCardSubtext, fontWeight: 600 }}>SOLICITUD / MOTIVO</div>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: themeCardText }}>
                                            {crmForm.motivoConsulta || selectedChat.customFields?.motivoConsulta || 'Consulta general'}
                                        </div>
                                    </div>

                                    {/* NOTAS CRM */}
                                    {crmForm.notas && (
                                        <div style={{ 
                                            background: ccTheme.isDark ? '#451A03' : '#FFFBEB', 
                                            border: `1px solid ${ccTheme.isDark ? '#78350F' : '#FDE68A'}`, 
                                            borderRadius: '8px', padding: '8px 10px' 
                                        }}>
                                            <div style={{ fontSize: '0.65rem', color: ccTheme.isDark ? '#FDE68A' : '#B45309', fontWeight: 700 }}>NOTAS CRM</div>
                                            <div style={{ fontSize: '0.78rem', color: ccTheme.isDark ? '#FEF3C7' : '#78350F', whiteSpace: 'pre-line', marginTop: '2px' }}>
                                                {crmForm.notas}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {/* TAB 2: HISTORIAL CLÍNICO 360° */}
                    {activeDetailTab === 'historial' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontSize: '0.74rem', fontWeight: 800, color: themeCardText, textTransform: 'uppercase' }}>
                                    Historial {crmForm.pacienteNombre ? `— ${crmForm.pacienteNombre}` : (selectedChat.contactName ? `— ${selectedChat.contactName}` : '')}
                                </div>
                                {(patientHistory?.nhc || selectedChat.customFields?.nhc) && (
                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: ccTheme.accentColor || '#0284C7', background: ccTheme.isDark ? '#1E3A5F' : '#F0F9FF', padding: '2px 6px', borderRadius: '4px', border: `1px solid ${ccTheme.isDark ? '#0284C7' : '#BAE6FD'}` }}>
                                        NHC: {patientHistory?.nhc || selectedChat.customFields?.nhc}
                                    </span>
                                )}
                            </div>

                            {loadingHistory ? (
                                <div style={{ fontSize: '0.76rem', color: themeCardSubtext, textAlign: 'center', padding: '20px' }}>
                                    Consultando registros en Sanatorio Argentino...
                                </div>
                            ) : patientHistory ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {/* Resumen KPI del Paciente */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        <div style={{ background: rightCardBg, padding: '8px', borderRadius: '8px', border: `1px solid ${rightCardBorder}` }}>
                                            <div style={{ fontSize: '0.65rem', color: themeCardSubtext, fontWeight: 600 }}>CONSULTAS / GUARDIA</div>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: ccTheme.accentColor || '#0284C7' }}>
                                                {patientHistory.consultas?.length || 0}
                                            </div>
                                        </div>
                                        <div style={{ background: rightCardBg, padding: '8px', borderRadius: '8px', border: `1px solid ${rightCardBorder}` }}>
                                            <div style={{ fontSize: '0.65rem', color: themeCardSubtext, fontWeight: 600 }}>CIRUGÍAS</div>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#059669' }}>
                                                {patientHistory.cirugias?.length || 0}
                                            </div>
                                        </div>
                                        <div style={{ background: rightCardBg, padding: '8px', borderRadius: '8px', border: `1px solid ${rightCardBorder}` }}>
                                            <div style={{ fontSize: '0.65rem', color: themeCardSubtext, fontWeight: 600 }}>INTERNACIONES</div>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#7C3AED' }}>
                                                {patientHistory.altas?.length || 0}
                                            </div>
                                        </div>
                                        <div style={{ background: rightCardBg, padding: '8px', borderRadius: '8px', border: `1px solid ${rightCardBorder}` }}>
                                            <div style={{ fontSize: '0.65rem', color: themeCardSubtext, fontWeight: 600 }}>LABORATORIOS</div>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#D97706' }}>
                                                {patientHistory.laboratorios?.length || 0}
                                            </div>
                                        </div>
                                    </div>

                                    {/* SECCIÓN 1: TURNOS PRÓXIMOS & CITAS ONLINE (ACCESO RÁPIDO) */}
                                    {patientHistory.turnosProximos && patientHistory.turnosProximos.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <div style={{ fontSize: '0.74rem', fontWeight: 800, color: ccTheme.isDark ? '#6EE7B7' : '#065F46', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span>📅 TURNOS PRÓXIMOS & CITAS ONLINE ({patientHistory.turnosProximos.length})</span>
                                            </div>
                                            {patientHistory.turnosProximos.map((tp, idx) => (
                                                <div key={idx} style={{
                                                    background: rightCardBg,
                                                    border: tp.origen === 'online' ? `1.5px solid ${ccTheme.isDark ? '#0284C7' : '#93C5FD'}` : `1.5px solid ${ccTheme.isDark ? '#059669' : '#6EE7B7'}`,
                                                    borderRadius: '8px',
                                                    padding: '8px 10px',
                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                                                }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: themeCardText }}>
                                                            📅 {tp.fecha_visita} {tp.hora_visita ? `• ${tp.hora_visita} hs` : ''}
                                                        </div>
                                                        <span style={{
                                                            fontSize: '0.64rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                                                            background: tp.origen === 'online' ? (ccTheme.isDark ? '#1E3A5F' : '#EFF6FF') : (ccTheme.isDark ? '#064E3B' : '#ECFDF5'),
                                                            color: tp.origen === 'online' ? (ccTheme.isDark ? '#93C5FD' : '#1D4ED8') : (ccTheme.isDark ? '#6EE7B7' : '#047857')
                                                        }}>
                                                            {tp.origen === 'online' ? '🌐 TURNO WEB ONLINE' : '🏥 PRESENCIAL'}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: ccTheme.accentColor || '#0284C7', marginTop: '3px' }}>
                                                        👨‍⚕️ {tp.medico || 'Profesional Asignado'}
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: themeCardSubtext, marginTop: '1px' }}>
                                                        Agenda: <strong style={{ color: themeCardText }}>{tp.agenda || tp.tipo_visita}</strong>
                                                    </div>
                                                    {tp.cliente && (
                                                        <div style={{ fontSize: '0.66rem', color: themeCardSubtext, marginTop: '3px', background: ccTheme.leftSidebarHeaderBg || (ccTheme.isDark ? '#1E293B' : '#F8FAFC'), padding: '2px 6px', borderRadius: '4px' }}>
                                                            Cobertura: <strong style={{ color: themeCardText }}>{tp.cliente}</strong>
                                                        </div>
                                                    )}
                                                    {tp.motivo && (
                                                        <div style={{ fontSize: '0.68rem', color: ccTheme.isDark ? '#FDE68A' : '#78350F', background: ccTheme.isDark ? '#451A03' : '#FEF3C7', padding: '3px 6px', borderRadius: '4px', marginTop: '4px' }}>
                                                            💬 Motivo: {tp.motivo}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{
                                            background: rightCardBg,
                                            border: `1px solid ${rightCardBorder}`,
                                            borderRadius: '8px',
                                            padding: '8px 10px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}>
                                            <Calendar size={13} color={themeCardSubtext} />
                                            <span style={{ fontSize: '0.72rem', color: themeCardSubtext, fontWeight: 600 }}>
                                                📅 Turnos Próximos: <strong style={{ color: themeCardText }}>Sin turnos pendientes agendados</strong>
                                            </span>
                                        </div>
                                    )}

                                    {/* SECCIÓN 2: CONSULTAS MÉDICAS, GUARDIA & EVOLUCIÓN CLÍNICA */}
                                    {patientHistory.consultas && patientHistory.consultas.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: themeCardText, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span>🩺 CONSULTAS MÉDICAS & GUARDIA ({patientHistory.consultas.length})</span>
                                            </div>
                                            {patientHistory.consultas.slice(0, 10).map((con, idx) => (
                                                <div key={idx} style={{ background: rightCardBg, border: `1px solid ${rightCardBorder}`, borderRadius: '8px', padding: '8px 10px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: themeCardText }}>
                                                            {con.visita_especialidad || con.agenda || 'Consulta Médica'}
                                                        </div>
                                                        <span style={{
                                                            fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: '4px',
                                                            background: con.asistencia === 'Presente' ? (ccTheme.isDark ? '#064E3B' : '#ECFDF5') : (ccTheme.isDark ? '#1E293B' : '#F1F5F9'),
                                                            color: con.asistencia === 'Presente' ? (ccTheme.isDark ? '#6EE7B7' : '#047857') : themeCardSubtext
                                                        }}>
                                                            {con.asistencia || 'Atendido'}
                                                        </span>
                                                    </div>
                                                    {con.medico && (
                                                        <div style={{ fontSize: '0.74rem', color: ccTheme.accentColor || '#0369A1', fontWeight: 700, marginTop: '2px' }}>
                                                            👨‍⚕️ {con.medico}
                                                        </div>
                                                    )}
                                                    <div style={{ fontSize: '0.7rem', color: themeCardSubtext, fontWeight: 600, marginTop: '1px' }}>
                                                        {con.agenda ? `${con.agenda} • ` : ''}{con.tipo_visita || 'Visita'} {con.centro ? `• ${con.centro}` : ''}
                                                    </div>
                                                    <div style={{ fontSize: '0.68rem', color: themeCardSubtext, marginTop: '3px' }}>
                                                        📅 Fecha: <strong style={{ color: themeCardText }}>{con.fecha_visita || 'S/F'}</strong> {con.hora_visita ? `(${con.hora_visita.slice(0, 5)} hs)` : ''}
                                                    </div>
                                                    {con.diagnostico && (
                                                        <div style={{
                                                            fontSize: '0.68rem', fontWeight: 700, 
                                                            color: ccTheme.isDark ? '#93C5FD' : '#1E40AF', 
                                                            background: ccTheme.isDark ? '#1E3A5F' : '#EFF6FF',
                                                            border: `1px solid ${ccTheme.isDark ? '#1D4ED8' : '#BFDBFE'}`, 
                                                            padding: '3px 6px', borderRadius: '4px', marginTop: '4px'
                                                        }}>
                                                            🏷️ Diagnóstico: {con.diagnostico}
                                                        </div>
                                                    )}
                                                    {con.motivo && (
                                                        <div style={{
                                                            marginTop: '6px', 
                                                            background: ccTheme.leftSidebarHeaderBg || (ccTheme.isDark ? '#1E293B' : '#F8FAFC'), 
                                                            border: `1px solid ${rightCardBorder}`,
                                                            borderRadius: '6px', padding: '6px 8px'
                                                        }}>
                                                            <div style={{ fontSize: '0.64rem', fontWeight: 800, color: themeCardSubtext, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <span>📋 Síntomas / Formulario Médico</span>
                                                                {con.formulario && <span style={{ color: ccTheme.accentColor || '#0284C7', fontWeight: 600 }}>({con.formulario})</span>}
                                                            </div>
                                                            <div style={{ fontSize: '0.72rem', color: themeCardText, whiteSpace: 'pre-line', marginTop: '3px', lineHeight: 1.35 }}>
                                                                {con.motivo}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {con.cliente && (
                                                        <div style={{ fontSize: '0.66rem', color: themeCardSubtext, marginTop: '4px', background: ccTheme.leftSidebarHeaderBg || (ccTheme.isDark ? '#1E293B' : '#F8FAFC'), padding: '2px 6px', borderRadius: '4px' }}>
                                                            🏥 Cobertura: <strong style={{ color: themeCardText }}>{con.cliente}</strong>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Listado de Cirugías Recientes */}
                                    {patientHistory.cirugias && patientHistory.cirugias.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: themeCardText }}>
                                                🔪 CIRUGÍAS REGISTRADAS ({patientHistory.cirugias.length})
                                            </div>
                                            {patientHistory.cirugias.slice(0, 3).map((cir, idx) => (
                                                <div key={idx} style={{ background: rightCardBg, border: `1px solid ${rightCardBorder}`, borderRadius: '8px', padding: '8px 10px' }}>
                                                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: themeCardText }}>
                                                        {cir.modulo || 'Procedimiento Quirúrgico'}
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: ccTheme.accentColor || '#0284C7', marginTop: '2px' }}>
                                                        Dr/a. {cir.medico || 'No especificado'} • {cir.fecha_cirugia || 'Fecha pendiente'}
                                                    </div>
                                                    <div style={{ fontSize: '0.68rem', color: themeCardSubtext, marginTop: '2px' }}>
                                                        Estado: <strong style={{ color: themeCardText }}>{cir.status || 'Programada'}</strong>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Listado de Admisiones */}
                                    {patientHistory.altas && patientHistory.altas.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: themeCardText }}>
                                                🛏️ ESTANCIAS / INTERNACIONES ({patientHistory.altas.length})
                                            </div>
                                            {patientHistory.altas.slice(0, 3).map((adm, idx) => (
                                                <div key={idx} style={{ background: rightCardBg, border: `1px solid ${rightCardBorder}`, borderRadius: '8px', padding: '8px 10px' }}>
                                                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: themeCardText }}>
                                                        {adm.especialidad || adm.servicio || 'Internación'}
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: themeCardSubtext, marginTop: '2px' }}>
                                                        Ingreso: {adm.fecha_ingreso ? new Date(adm.fecha_ingreso).toLocaleDateString('es-AR') : 'S/D'} 
                                                        {adm.fecha_alta ? ` • Alta: ${new Date(adm.fecha_alta).toLocaleDateString('es-AR')}` : ' (Activo)'}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div style={{ fontSize: '0.74rem', color: themeCardSubtext, background: rightCardBg, padding: '14px', borderRadius: '8px', border: `1px solid ${rightCardBorder}`, lineHeight: 1.4 }}>
                                    💡 No se encontraron antecedentes para esta persona. Asegúrate de verificar y guardar el DNI del paciente en la pestaña <strong style={{ color: themeCardText }}>Ficha CRM</strong> para consultar su historial completo en el Sanatorio.
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 3: PARÁMETROS Y HONORARIOS DE MÉDICOS SALUS */}
                    {activeDetailTab === 'prestadores' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ fontSize: '0.74rem', fontWeight: 800, color: themeCardText, textTransform: 'uppercase' }}>
                                Consultar Parámetros de Prestador
                            </div>

                            <div style={{ position: 'relative' }}>
                                <input
                                    type="text"
                                    placeholder="Buscar por médico o especialidad..."
                                    value={doctorQuery}
                                    onChange={(e) => setDoctorQuery(e.target.value)}
                                    style={{
                                        width: '100%', padding: '8px 12px 8px 30px',
                                        borderRadius: '8px', border: `1px solid ${rightCardBorder}`,
                                        fontSize: '0.8rem', outline: 'none',
                                        background: rightCardBg, color: themeCardText
                                    }}
                                />
                                <Search size={14} color={themeCardSubtext} style={{ position: 'absolute', left: '10px', top: '10px' }} />
                            </div>

                            {isSearchingDoctor && (
                                <div style={{ fontSize: '0.72rem', color: themeCardSubtext, textAlign: 'center', padding: '10px' }}>
                                    Buscando en SALUS...
                                </div>
                            )}

                            {doctorResults.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
                                    {doctorResults.map((doc) => (
                                        <div key={doc.id} style={{
                                            background: rightCardBg, border: `1px solid ${rightCardBorder}`, borderRadius: '8px', padding: '10px'
                                        }}>
                                            <div style={{ fontWeight: 800, fontSize: '0.82rem', color: themeCardText }}>
                                                {doc.profesional_nombre}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: ccTheme.accentColor || '#0284C7', fontWeight: 600 }}>
                                                {doc.especialidad || 'Consulta Médica'}
                                            </div>

                                            {doc.consultorio_actual && (
                                                <div style={{ marginTop: '4px', fontSize: '0.72rem', fontWeight: 700, color: ccTheme.isDark ? '#34D399' : '#059669' }}>
                                                    📍 {doc.consultorio_actual}
                                                </div>
                                            )}

                                            {doc.condiciones_consulta && (
                                                <div style={{
                                                    marginTop: '6px', fontSize: '0.7rem', color: themeCardSubtext,
                                                    background: ccTheme.leftSidebarHeaderBg || (ccTheme.isDark ? '#1E293B' : '#FFFFFF'), 
                                                    padding: '6px 8px', borderRadius: '6px',
                                                    border: `1px solid ${rightCardBorder}`, whiteSpace: 'pre-line'
                                                }}>
                                                    {doc.condiciones_consulta}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : doctorQuery.length >= 2 && !isSearchingDoctor ? (
                                <div style={{ fontSize: '0.72rem', color: themeCardSubtext, textAlign: 'center', padding: '14px' }}>
                                    No se encontraron prestadores con ese criterio.
                                </div>
                            ) : (
                                <div style={{ fontSize: '0.72rem', color: themeCardSubtext, background: rightCardBg, padding: '10px', borderRadius: '8px', border: `1px solid ${rightCardBorder}` }}>
                                    💡 Escribe el apellido del médico (ej: <em>Marquez</em>, <em>Gomez</em>, <em>Borrego</em>) para ver sus honorarios particulares, plus de coseguro, alias de Mercado Pago y consultorio activo.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* MODAL PARA FINALIZAR ATENCIÓN / CERRAR CONVERSACIÓN */}
            {closeModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)',
                    zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
                }}>
                    <div style={{
                        background: '#FFFFFF', borderRadius: '16px', maxWidth: '440px', width: '100%',
                        padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)', border: '1px solid #E2E8F0'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '1.05rem', color: '#0F172A' }}>
                                <CheckCircle2 size={20} color="#059669" />
                                Finalizar Atención
                            </div>
                            <button 
                                onClick={() => setCloseModalOpen(false)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <p style={{ fontSize: '0.82rem', color: '#64748B', margin: '0 0 14px 0', lineHeight: 1.45 }}>
                            Estás a punto de finalizar la conversación con <strong>{selectedChat.contactName}</strong>. 
                            Se enviará automáticamente el mensaje de despedida y encuesta de 5 estrellas al paciente, la conversación pasará a <strong>Archivadas</strong> y se reactivará el bot automático.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#334155' }}>MOTIVO DE RESOLUCIÓN</label>
                            <select
                                value={resolutionReason}
                                onChange={(e) => setResolutionReason(e.target.value)}
                                style={{
                                    padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1',
                                    fontSize: '0.84rem', outline: 'none', background: '#FFFFFF', color: '#0F172A'
                                }}
                            >
                                <option value="Turno Coordinado">✅ Turno Coordinado / Otorgado</option>
                                <option value="Consulta Informativa Resuelta">ℹ️ Consulta Informativa Resuelta</option>
                                <option value="Derivado a Guardia / Sector">🏥 Derivado a Guardia / Sector Específico</option>
                                <option value="Cancelación / Reprogramación Confirmada">🗓️ Cancelación / Reprogramación Confirmada</option>
                                <option value="Paciente No Responde">⏳ Paciente No Responde</option>
                                <option value="Otro / Aclaración en Nota">📝 Otro / Ver Notas Internas</option>
                            </select>
                        </div>

                        {/* PREVIEW DEL MENSAJE DE CIERRE OFICIAL */}
                        <div style={{
                            background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px',
                            padding: '10px 12px', marginBottom: '18px', textAlign: 'left'
                        }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#15803D', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <span>⭐ Mensaje que recibirá el paciente vía WhatsApp:</span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#166534', whiteSpace: 'pre-line', lineHeight: 1.35, fontStyle: 'italic' }}>
                                {FINAL_ATTENTION_MESSAGE}
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button
                                type="button"
                                onClick={() => setCloseModalOpen(false)}
                                style={{
                                    padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1',
                                    background: '#FFFFFF', color: '#64748B', fontSize: '0.82rem', fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                Volver
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmClose}
                                disabled={isClosingChat}
                                style={{
                                    padding: '8px 18px', borderRadius: '8px', border: 'none',
                                    background: '#059669', color: '#FFFFFF', fontSize: '0.82rem', fontWeight: 700,
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                }}
                            >
                                <CheckCircle2 size={15} /> {isClosingChat ? 'Finalizando y enviando...' : 'Finalizar y Enviar Cierre'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL PARA FINALIZACIÓN MASIVA SILENCIOSA (SIN MENSAJES DE WHATSAPP) */}
            {bulkCloseModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(3px)',
                    zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
                }}>
                    <div style={{
                        background: '#FFFFFF', borderRadius: '16px', maxWidth: '480px', width: '100%',
                        padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)', border: '1px solid #E2E8F0'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '1.05rem', color: '#0F172A' }}>
                                <CheckCircle2 size={20} color="#DC2626" />
                                Finalizar {selectedChatIds.size} {selectedChatIds.size === 1 ? 'Conversación' : 'Conversaciones'}
                            </div>
                            <button 
                                onClick={() => setBulkCloseModalOpen(false)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* AVISO IMPORTANTE: REGLA DE NO ENVÍO DE MENSAJES */}
                        <div style={{
                            background: '#FEF2F2',
                            border: '1.5px solid #FCA5A5',
                            borderRadius: '10px',
                            padding: '12px 14px',
                            marginBottom: '16px',
                            display: 'flex',
                            gap: '10px',
                            alignItems: 'flex-start'
                        }}>
                            <AlertTriangle size={20} color="#DC2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <div>
                                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#991B1B', marginBottom: '3px' }}>
                                    FINALIZACIÓN SILENCIOSA (SIN MENSAJES)
                                </div>
                                <div style={{ fontSize: '0.74rem', color: '#7F1D1D', lineHeight: 1.45 }}>
                                    Al finalizar de a muchos, <strong>NO se enviará ningún mensaje de WhatsApp a los pacientes</strong>. Las conversaciones pasarán directamente a <strong>Finalizados</strong> y el bot automático quedará reactivado para futuras consultas.
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#334155' }}>MOTIVO DE RESOLUCIÓN</label>
                            <select
                                value={bulkResolutionReason}
                                onChange={(e) => setBulkResolutionReason(e.target.value)}
                                style={{
                                    padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1',
                                    fontSize: '0.84rem', outline: 'none', background: '#FFFFFF', color: '#0F172A'
                                }}
                            >
                                <option value="Cierre masivo de cola">🧹 Cierre masivo de cola general</option>
                                <option value="Consulta Informativa Resuelta">ℹ️ Consulta Informativa Resuelta</option>
                                <option value="Paciente No Responde">⏳ Paciente No Responde</option>
                                <option value="Turno Coordinado">✅ Turno Coordinado / Otorgado</option>
                                <option value="Derivado a Guardia / Sector">🏥 Derivado a Guardia / Sector Específico</option>
                                <option value="Cancelación / Reprogramación Confirmada">🗓️ Cancelación / Reprogramación Confirmada</option>
                                <option value="Otro / Trámite Administrativo">📝 Otro / Ver Notas Internas</option>
                            </select>
                        </div>

                        {/* LISTADO DE CHATS SELECCIONADOS */}
                        <div style={{ marginBottom: '18px' }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', marginBottom: '6px' }}>
                                PACIENTES A FINALIZAR ({selectedChatIds.size}):
                            </div>
                            <div style={{
                                maxHeight: '130px',
                                overflowY: 'auto',
                                border: '1px solid #E2E8F0',
                                borderRadius: '8px',
                                padding: '6px 10px',
                                background: '#F8FAFC',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px'
                            }}>
                                {Array.from(selectedChatIds).map(id => {
                                    const c = chats.find(item => item.id === id);
                                    if (!c) return null;
                                    return (
                                        <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem' }}>
                                            <span style={{ fontWeight: 700, color: '#1E293B' }}>{getCleanChatName(c)}</span>
                                            <span style={{ color: '#64748B', fontSize: '0.7rem' }}>+{c.phone}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button
                                type="button"
                                onClick={() => setBulkCloseModalOpen(false)}
                                disabled={isBulkClosing}
                                style={{
                                    padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1',
                                    background: '#FFFFFF', color: '#64748B', fontSize: '0.82rem', fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmBulkClose}
                                disabled={isBulkClosing}
                                style={{
                                    padding: '8px 18px', borderRadius: '8px', border: 'none',
                                    background: '#DC2626', color: '#FFFFFF', fontSize: '0.82rem', fontWeight: 700,
                                    cursor: isBulkClosing ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                }}
                            >
                                <CheckCircle2 size={15} />
                                {isBulkClosing ? 'Finalizando silenciosamente...' : `Confirmar y Finalizar (${selectedChatIds.size})`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* MODAL RESPUESTAS RÁPIDAS (EXCLUSIVO CONTACT CENTER)               */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            {quickRepliesModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000,
                    background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(3px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
                }} onClick={() => setQuickRepliesModalOpen(false)}>
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: '#FFFFFF', width: '100%', maxWidth: '520px', maxHeight: '82vh',
                            borderRadius: '16px', boxShadow: '0 20px 45px rgba(0,0,0,0.2)',
                            display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #E2E8F0'
                        }}
                    >
                        {/* Cabecera idéntica a la imagen */}
                        <div style={{ padding: '24px 24px 12px 24px', textAlign: 'center', position: 'relative' }}>
                            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#334155', margin: 0 }}>
                                Respuestas rápidas
                            </h2>
                            <button
                                type="button"
                                onClick={() => setQuickRepliesModalOpen(false)}
                                style={{
                                    position: 'absolute', right: '16px', top: '16px', border: 'none',
                                    background: 'transparent', color: '#94A3B8', cursor: 'pointer', padding: '4px'
                                }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Campo de búsqueda con icono de lupa (verde azulado idéntico a imagen) */}
                        <div style={{ padding: '0 24px 16px 24px' }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                border: '1.5px solid #0D9488', borderRadius: '6px',
                                padding: '8px 12px', background: '#FFFFFF'
                            }}>
                                <Search size={16} color="#0D9488" />
                                <input 
                                    type="text"
                                    autoFocus
                                    placeholder="Escribe para filtrar"
                                    value={quickReplyFilter}
                                    onChange={(e) => setQuickReplyFilter(e.target.value)}
                                    style={{
                                        flex: 1, border: 'none', outline: 'none', fontSize: '0.86rem', color: '#1E293B'
                                    }}
                                />
                            </div>
                        </div>

                        {/* Lista scrolleable de respuestas rápidas */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                            {filterQuickReplies(quickReplyFilter).map((qr) => (
                                <div key={qr.id} style={{
                                    display: 'flex', flexDirection: 'column', gap: '6px',
                                    paddingBottom: '14px', borderBottom: '1px solid #F1F5F9'
                                }}>
                                    <div>
                                        <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#1E293B' }}>
                                            {qr.title.includes(':') ? qr.title : `${qr.title}:`}
                                        </span>
                                        <span style={{ fontSize: '0.72rem', color: '#0284C7', fontWeight: 700, marginLeft: '6px' }}>
                                            /{qr.shortcut}
                                        </span>
                                    </div>
                                    <p style={{
                                        margin: 0, fontSize: '0.82rem', color: '#475569', lineHeight: 1.45, whiteSpace: 'pre-line'
                                    }}>
                                        {qr.content}
                                    </p>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setMessageInput(resolveQuickReplyText(qr.content));
                                                setQuickRepliesModalOpen(false);
                                                inputRef.current?.focus();
                                            }}
                                            style={{
                                                padding: '6px 14px', borderRadius: '6px', border: '1px solid #CBD5E1',
                                                background: '#FFFFFF', color: '#334155', fontSize: '0.76rem', fontWeight: 600,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Editar y enviar
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => sendDirectMessage(resolveQuickReplyText(qr.content), isPrivateNote)}
                                            style={{
                                                padding: '6px 14px', borderRadius: '6px', border: 'none',
                                                background: '#0284C7', color: '#FFFFFF', fontSize: '0.76rem', fontWeight: 700,
                                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                                            }}
                                        >
                                            <Send size={12} /> Enviar directo
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL INSTITUCIONAL: REINICIAR FLUJO DEL CHATBOT (SISTEMA SANATORIO ARGENTINO) */}
            {resetBotModalOpen && selectedChat && (
                <div 
                    onClick={() => !isResettingBot && setResetBotModalOpen(false)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.55)',
                        backdropFilter: 'blur(4px)',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px'
                    }}
                >
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: '#FFFFFF',
                            borderRadius: '14px',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.05)',
                            border: '1px solid #E2E8F0',
                            width: '100%',
                            maxWidth: '460px',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column'
                        }}
                    >
                        {/* Header */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '16px 20px',
                            borderBottom: '1px solid #F1F5F9',
                            background: '#F8FAFC'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '10px',
                                    background: '#EFF6FF',
                                    border: '1px solid #BFDBFE',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#0284C7'
                                }}>
                                    <RefreshCw size={18} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F172A' }}>
                                        Reiniciar Flujo del Chatbot
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                        Sanatorio Argentino • Contact Center
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                disabled={isResettingBot}
                                onClick={() => setResetBotModalOpen(false)}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#94A3B8',
                                    cursor: isResettingBot ? 'not-allowed' : 'pointer',
                                    padding: '4px',
                                    borderRadius: '6px'
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Body */}
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {/* Tarjeta de Paciente */}
                            <div style={{
                                background: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                borderRadius: '8px',
                                padding: '10px 14px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '2px'
                            }}>
                                <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                                    Paciente Seleccionado
                                </span>
                                <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F172A' }}>
                                    {selectedChat.contactName}
                                </span>
                                <span style={{ fontSize: '0.74rem', color: '#0284C7', fontWeight: 600 }}>
                                    📞 {selectedChat.phone}
                                </span>
                            </div>

                            <p style={{ margin: 0, fontSize: '0.84rem', color: '#334155', lineHeight: 1.5 }}>
                                ¿Confirmas reiniciar el flujo automatizado? El bot volverá a responder desde el saludo inicial cuando el paciente escriba un nuevo mensaje.
                            </p>

                            {/* Callout informativo */}
                            <div style={{
                                background: '#F0F9FF',
                                border: '1px solid #BAE6FD',
                                borderRadius: '8px',
                                padding: '10px 12px',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '8px'
                            }}>
                                <Bot size={16} color="#0284C7" style={{ marginTop: '2px', flexShrink: 0 }} />
                                <div style={{ fontSize: '0.74rem', color: '#0369A1', lineHeight: 1.4 }}>
                                    La conversación pasará a atención automática por IA y se liberará de la bandeja del operador para atender intenciones desde cero.
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: '10px',
                            padding: '14px 20px',
                            borderTop: '1px solid #F1F5F9',
                            background: '#F8FAFC'
                        }}>
                            <button
                                type="button"
                                disabled={isResettingBot}
                                onClick={() => setResetBotModalOpen(false)}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    background: '#FFFFFF',
                                    color: '#475569',
                                    fontSize: '0.82rem',
                                    fontWeight: 600,
                                    cursor: isResettingBot ? 'not-allowed' : 'pointer'
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={isResettingBot}
                                onClick={handleConfirmResetBot}
                                style={{
                                    padding: '8px 18px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: '#0284C7',
                                    color: '#FFFFFF',
                                    fontSize: '0.82rem',
                                    fontWeight: 700,
                                    cursor: isResettingBot ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)'
                                }}
                            >
                                {isResettingBot ? (
                                    <>
                                        <RefreshCw size={14} className="animate-spin" />
                                        Reiniciando...
                                    </>
                                ) : (
                                    <>
                                        <RefreshCw size={14} />
                                        Reiniciar Bot
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* NOTIFICACIÓN TOAST DEL SISTEMA */}
            {systemToast && (
                <div style={{
                    position: 'fixed',
                    bottom: '24px',
                    right: '24px',
                    zIndex: 10000,
                    background: '#FFFFFF',
                    border: systemToast.type === 'error' ? '1.5px solid #FCA5A5' : '1.5px solid #6EE7B7',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    maxWidth: '420px'
                }}>
                    {systemToast.type === 'error' ? (
                        <AlertCircle size={20} color="#DC2626" style={{ flexShrink: 0 }} />
                    ) : (
                        <CheckCircle2 size={20} color="#059669" style={{ flexShrink: 0 }} />
                    )}
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0F172A', lineHeight: 1.4 }}>
                        {systemToast.message}
                    </div>
                    <button
                        type="button"
                        onClick={() => setSystemToast(null)}
                        style={{
                            border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer',
                            padding: '2px', marginLeft: 'auto'
                        }}
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* VISOR PROFESIONAL INTEGRADO DE DOCUMENTOS Y ÓRDENES MÉDICAS */}
            {viewerImage && (
                <div 
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 99999,
                        backgroundColor: 'rgba(10, 15, 29, 0.95)',
                        backdropFilter: 'blur(14px)',
                        display: 'flex',
                        flexDirection: 'column',
                        userSelect: 'none'
                    }}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setViewerImage(null);
                        }
                    }}
                >
                    {/* BARRA SUPERIOR DE HERRAMIENTAS */}
                    <div style={{
                        height: '64px',
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0 24px',
                        color: '#FFFFFF',
                        zIndex: 10
                    }}>
                        {/* Título e Información del Paciente */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                                width: '38px', height: '38px', borderRadius: '8px',
                                backgroundColor: viewerImage.fileType === 'pdf' ? 'rgba(239, 68, 68, 0.25)' :
                                    viewerImage.fileType === 'word' ? 'rgba(37, 99, 235, 0.25)' :
                                    viewerImage.fileType === 'excel' ? 'rgba(22, 163, 74, 0.25)' :
                                    'rgba(2, 132, 199, 0.25)',
                                border: `1px solid ${
                                    viewerImage.fileType === 'pdf' ? 'rgba(248, 113, 113, 0.4)' :
                                    viewerImage.fileType === 'word' ? 'rgba(96, 165, 250, 0.4)' :
                                    viewerImage.fileType === 'excel' ? 'rgba(74, 222, 128, 0.4)' :
                                    'rgba(56, 189, 248, 0.4)'
                                }`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: viewerImage.fileType === 'pdf' ? '#F87171' :
                                    viewerImage.fileType === 'word' ? '#60A5FA' :
                                    viewerImage.fileType === 'excel' ? '#4ADE80' :
                                    '#38BDF8'
                            }}>
                                {viewerImage.fileType === 'pdf' ? <FileText size={22} /> :
                                 viewerImage.fileType === 'word' ? <FileText size={22} /> :
                                 viewerImage.fileType === 'excel' ? <FileSpreadsheet size={22} /> :
                                 <FileCheck size={22} />}
                            </div>
                            <div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>{viewerImage.filename || viewerImage.senderName || 'Documento'}</span>
                                    <span style={{
                                        fontSize: '0.68rem',
                                        fontWeight: 700,
                                        backgroundColor: viewerImage.fileType === 'pdf' ? '#DC2626' :
                                            viewerImage.fileType === 'word' ? '#2563EB' :
                                            viewerImage.fileType === 'excel' ? '#16A34A' : '#0284C7',
                                        color: '#FFFFFF',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        letterSpacing: '0.5px'
                                    }}>
                                        {viewerImage.ext || 'DOC'}
                                    </span>
                                    {viewerImage.dni && (
                                        <span style={{ fontSize: '0.72rem', backgroundColor: 'rgba(255,255,255,0.14)', padding: '2px 8px', borderRadius: '4px', color: '#93C5FD' }}>
                                            DNI: {viewerImage.dni}
                                        </span>
                                    )}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                                    {viewerImage.senderName ? `Paciente: ${viewerImage.senderName}` : ''} {viewerImage.caption && viewerImage.caption !== viewerImage.filename ? `• Nota: ${viewerImage.caption}` : '• Visor Profesional Integrado — Sanatorio Argentino'}
                                </div>
                            </div>
                        </div>

                        {/* Controles de Vista: Zoom para imágenes o Enlaces directos para documentos */}
                        {viewerImage.fileType === 'image' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(30, 41, 59, 0.75)', padding: '4px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)' }}>
                                <button
                                    type="button"
                                    onClick={() => setViewerZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                                    title="Alejar imagen (-)"
                                    style={{
                                        background: 'transparent', border: 'none', color: '#E2E8F0', cursor: 'pointer',
                                        padding: '6px', borderRadius: '6px', display: 'flex', alignItems: 'center'
                                    }}
                                >
                                    <ZoomOut size={18} />
                                </button>
                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#38BDF8', minWidth: '48px', textAlign: 'center' }}>
                                    {Math.round(viewerZoom * 100)}%
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setViewerZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))}
                                    title="Acercar imagen (+)"
                                    style={{
                                        background: 'transparent', border: 'none', color: '#E2E8F0', cursor: 'pointer',
                                        padding: '6px', borderRadius: '6px', display: 'flex', alignItems: 'center'
                                    }}
                                >
                                    <ZoomIn size={18} />
                                </button>
                                <div style={{ width: '1px', height: '18px', backgroundColor: 'rgba(255,255,255,0.2)', margin: '0 4px' }} />
                                <button
                                    type="button"
                                    onClick={() => setViewerRotation(r => (r + 90) % 360)}
                                    title="Rotar 90° (R)"
                                    style={{
                                        background: 'transparent', border: 'none', color: '#E2E8F0', cursor: 'pointer',
                                        padding: '6px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '5px',
                                        fontSize: '0.74rem'
                                    }}
                                >
                                    <RotateCw size={16} />
                                    <span style={{ fontSize: '0.74rem', color: '#CBD5E1', fontWeight: 600 }}>Rotar</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setViewerZoom(1); setViewerRotation(0); }}
                                    title="Restablecer vista original"
                                    style={{
                                        background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer',
                                        padding: '6px', borderRadius: '6px', display: 'flex', alignItems: 'center'
                                    }}
                                >
                                    <RefreshCw size={15} />
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <a
                                    href={viewerImage.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        backgroundColor: 'rgba(30, 41, 59, 0.85)',
                                        color: '#38BDF8',
                                        border: '1px solid rgba(56, 189, 248, 0.3)',
                                        padding: '6px 14px', borderRadius: '8px',
                                        fontSize: '0.76rem', fontWeight: 700, textDecoration: 'none',
                                        boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
                                    }}
                                    title="Abrir archivo en pestaña nueva del navegador"
                                >
                                    <ExternalLink size={14} /> Abrir en pestaña nueva
                                </a>
                            </div>
                        )}

                        {/* Acciones: Descargar y Cerrar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <button
                                type="button"
                                onClick={handleDownloadViewerImage}
                                disabled={isDownloadingImage}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    backgroundColor: '#059669',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '9px 18px',
                                    fontSize: '0.82rem',
                                    fontWeight: 700,
                                    cursor: isDownloadingImage ? 'wait' : 'pointer',
                                    transition: 'all 0.15s',
                                    boxShadow: '0 4px 14px rgba(5, 150, 105, 0.4)'
                                }}
                                title="Descargar archivo directamente a tu equipo"
                            >
                                <Download size={17} />
                                <span>{isDownloadingImage ? 'Descargando...' : 'Descargar Archivo'}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setViewerImage(null)}
                                style={{
                                    width: '40px', height: '40px', borderRadius: '8px',
                                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                    border: '1px solid rgba(239, 68, 68, 0.35)',
                                    color: '#F87171',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', transition: 'all 0.15s'
                                }}
                                title="Cerrar visor (Esc)"
                            >
                                <X size={22} />
                            </button>
                        </div>
                    </div>

                    {/* ÁREA CENTRAL: DOCUMENTO O IMAGEN + PANEL LATERAL IA */}
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        overflow: 'hidden',
                        position: 'relative'
                    }}>
                        {/* LIENZO DEL DOCUMENTO / IMAGEN */}
                        {viewerImage.fileType === 'pdf' ? (
                            <div style={{
                                flex: 1,
                                width: '100%',
                                height: '100%',
                                padding: '16px 24px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxSizing: 'border-box'
                            }}>
                                <iframe
                                    src={`${viewerImage.url}#toolbar=1&navpanes=1`}
                                    title={viewerImage.filename || 'Visor PDF'}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        maxWidth: '1280px',
                                        border: '1px solid rgba(255, 255, 255, 0.15)',
                                        borderRadius: '8px',
                                        backgroundColor: '#FFFFFF',
                                        boxShadow: '0 25px 60px -15px rgba(0,0,0,0.85)'
                                    }}
                                />
                            </div>
                        ) : (viewerImage.fileType === 'word' || viewerImage.fileType === 'excel') ? (
                            <div style={{
                                flex: 1,
                                width: '100%',
                                height: '100%',
                                padding: '16px 24px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxSizing: 'border-box'
                            }}>
                                <iframe
                                    src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(viewerImage.url)}`}
                                    title={viewerImage.filename || 'Visor Office Online'}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        maxWidth: '1280px',
                                        border: '1px solid rgba(255, 255, 255, 0.15)',
                                        borderRadius: '8px',
                                        backgroundColor: '#FFFFFF',
                                        boxShadow: '0 25px 60px -15px rgba(0,0,0,0.85)'
                                    }}
                                />
                            </div>
                        ) : (
                            <div 
                                style={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    overflow: 'auto',
                                    padding: '32px',
                                    cursor: viewerZoom > 1 ? 'grab' : 'default'
                                }}
                                onWheel={(e) => {
                                    e.preventDefault();
                                    setViewerZoom(z => Math.max(0.5, Math.min(4, +(z - e.deltaY * 0.0015).toFixed(2))));
                                }}
                                onClick={(e) => {
                                    if (e.target === e.currentTarget) setViewerImage(null);
                                }}
                            >
                                <img
                                    src={viewerImage.url}
                                    alt={viewerImage.caption || 'Orden médica'}
                                    style={{
                                        maxWidth: '88%',
                                        maxHeight: '88%',
                                        objectFit: 'contain',
                                        borderRadius: '6px',
                                        boxShadow: '0 25px 60px -15px rgba(0,0,0,0.7)',
                                        transform: `scale(${viewerZoom}) rotate(${viewerRotation}deg)`,
                                        transformOrigin: 'center center',
                                        transition: 'transform 0.15s ease-out'
                                    }}
                                />
                            </div>
                        )}

                        {/* PANEL LATERAL: DATOS DE LA ORDEN IA (SI EXISTE ANÁLISIS) */}
                        {viewerImage.orderAnalysis && (
                            <div style={{
                                width: '360px',
                                backgroundColor: 'rgba(15, 23, 42, 0.94)',
                                borderLeft: '1px solid rgba(255, 255, 255, 0.12)',
                                padding: '24px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '18px',
                                overflowY: 'auto'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#4ADE80', fontWeight: 800, fontSize: '0.86rem' }}>
                                        <Stethoscope size={20} />
                                        DATOS DE LA ORDEN (IA)
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const textToCopy = viewerImage.orderAnalysis.raw_summary || 
`Estudio a autorizar: ${viewerImage.orderAnalysis.estudio || 'No especificado'}
Solicitante: ${viewerImage.orderAnalysis.solicitante || 'No especificado'}
Matricula: ${viewerImage.orderAnalysis.matricula || 'No especificada'}
Diagnostico: ${viewerImage.orderAnalysis.diagnostico || 'No especificado'}
Fecha de solicitud: ${viewerImage.orderAnalysis.fecha_solicitud || 'No especificada'}`;
                                            navigator.clipboard.writeText(textToCopy);
                                            setCopiedViewerData(true);
                                            setTimeout(() => setCopiedViewerData(false), 2000);
                                        }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '5px',
                                            background: copiedViewerData ? '#15803D' : 'rgba(255, 255, 255, 0.12)',
                                            border: '1px solid rgba(255, 255, 255, 0.2)',
                                            color: '#FFFFFF',
                                            padding: '5px 10px', borderRadius: '6px',
                                            fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer',
                                            transition: 'background 0.15s'
                                        }}
                                        title="Copiar datos al portapapeles"
                                    >
                                        <Copy size={13} />
                                        <span>{copiedViewerData ? '¡Copiado!' : 'Copiar'}</span>
                                    </button>
                                </div>

                                <div style={{
                                    backgroundColor: 'rgba(30, 41, 59, 0.65)',
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                    borderRadius: '10px',
                                    padding: '16px',
                                    display: 'grid',
                                    gap: '14px',
                                    fontSize: '0.82rem',
                                    lineHeight: 1.45
                                }}>
                                    <div>
                                        <div style={{ fontSize: '0.68rem', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700 }}>Estudio a autorizar</div>
                                        <div style={{ color: '#FFFFFF', fontWeight: 700, marginTop: '2px', fontSize: '0.9rem' }}>{viewerImage.orderAnalysis.estudio || 'No especificado'}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.68rem', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700 }}>Médico Solicitante</div>
                                        <div style={{ color: '#FFFFFF', fontWeight: 600, marginTop: '2px' }}>{viewerImage.orderAnalysis.solicitante || 'No especificado'}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.68rem', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700 }}>Matrícula Profesional</div>
                                        <div style={{ color: '#FFFFFF', fontWeight: 600, marginTop: '2px' }}>{viewerImage.orderAnalysis.matricula || 'No especificada'}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.68rem', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700 }}>Diagnóstico / Motivo</div>
                                        <div style={{ color: '#FFFFFF', fontWeight: 600, marginTop: '2px' }}>{viewerImage.orderAnalysis.diagnostico || 'No especificado'}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.68rem', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700 }}>Fecha de la Orden</div>
                                        <div style={{ color: '#FFFFFF', fontWeight: 600, marginTop: '2px' }}>{viewerImage.orderAnalysis.fecha_solicitud || 'No especificada'}</div>
                                    </div>
                                    {viewerImage.orderAnalysis.vigencia_estado && (
                                        <div style={{
                                            padding: '8px 10px',
                                            borderRadius: '6px',
                                            background: viewerImage.orderAnalysis.vigencia_estado === 'vencida' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                                            border: `1px solid ${viewerImage.orderAnalysis.vigencia_estado === 'vencida' ? '#EF4444' : '#22C55E'}`,
                                            color: viewerImage.orderAnalysis.vigencia_estado === 'vencida' ? '#FCA5A5' : '#86EFAC',
                                            fontSize: '0.72rem',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '6px'
                                        }}>
                                            <div style={{ fontWeight: 800 }}>{viewerImage.orderAnalysis.alerta_vigencia}</div>
                                            {viewerImage.orderAnalysis.vigencia_estado === 'vencida' && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const aviso = `Estimado/a paciente, verificamos su orden médica para "${viewerImage.orderAnalysis.estudio || 'la práctica solicitada'}" pero observamos que fue emitida el ${viewerImage.orderAnalysis.fecha_solicitud} (hace ${viewerImage.orderAnalysis.dias_transcurridos || '>30'} días). Por normativa de las obras sociales, las órdenes médicas poseen una vigencia máxima de 30 días corridos para su autorización. Por favor solicite a su médico tratante la renovación o revalidación de la orden. ¡Muchas gracias!`;
                                                        navigator.clipboard.writeText(aviso);
                                                        alert('Aviso de orden vencida copiado al portapapeles. Podés pegarlo directamente en el chat.');
                                                    }}
                                                    style={{
                                                        background: '#EF4444', color: '#FFFFFF', border: 'none',
                                                        borderRadius: '4px', padding: '4px 8px', fontSize: '0.68rem',
                                                        fontWeight: 800, cursor: 'pointer', alignSelf: 'flex-start'
                                                    }}
                                                >
                                                    📋 Copiar aviso para el paciente
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div style={{ marginTop: 'auto', padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(2, 132, 199, 0.1)', border: '1px solid rgba(2, 132, 199, 0.2)', fontSize: '0.72rem', color: '#94A3B8', lineHeight: 1.5 }}>
                                    💡 <strong style={{ color: '#38BDF8' }}>Atajos:</strong> Usá <strong style={{ color: '#FFFFFF' }}>+</strong> / <strong style={{ color: '#FFFFFF' }}>-</strong> o la rueda del ratón para hacer zoom, <strong style={{ color: '#FFFFFF' }}>R</strong> para rotar 90°, y <strong style={{ color: '#FFFFFF' }}>Esc</strong> para cerrar.
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal de Personalización Visual (Presets, Nano Banana, Opacidad y Sidebars) */}
            <ContactCenterThemeModal
                isOpen={themeModalOpen}
                onClose={() => setThemeModalOpen(false)}
                currentTheme={ccTheme}
                onThemeChange={setCcTheme}
            />
        </div>
    );
}

