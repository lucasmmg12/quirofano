/**
 * ChatWindow — Mini CRM WhatsApp con estilo MSN Messenger moderno
 * Modal centrado tipo ventana de chat con burbujas, soporte de media y composer
 * Features: Emojis, envío de imágenes, grabación de audio, polling + realtime
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    X, Send, Paperclip, Mic, Image as ImageIcon, Play, Pause,
    Phone, MessageSquare, Clock, CheckCheck, Check, Volume2,
    Download, Smile, Square, Loader, Zap, Settings,
    Shield, AlertTriangle, FileText, RefreshCw,
} from 'lucide-react';
import { fetchMessages, markAsRead, saveOutgoingMessage, subscribeToMessages, upsertCrmContact, fetchWhatsAppLines, getAssignedLine, assignLine } from '../services/chatService';
import { sendWhatsAppMessage } from '../services/builderbotApi';
import { fetchShortcuts } from '../services/shortcutService';
import { fetchMetaTemplates, sendMetaTemplate } from '../services/metaTemplateService';
import { supabase } from '../lib/supabase';
import ShortcutManager from './ShortcutManager';

// Emojis populares organizados
const EMOJI_LIST = [
    '😀', '😂', '🤣', '😊', '😍', '🥰', '😘', '😎', '🤩', '🥳',
    '😅', '😆', '😉', '😋', '😜', '🤪', '😝', '🤑', '🤗', '🤭',
    '👍', '👎', '👏', '🙌', '🤝', '💪', '✌️', '🤞', '🫶', '❤️',
    '🔥', '⭐', '✅', '❌', '⚠️', '🏥', '💊', '🩺', '📋', '📞',
    '🙏', '💯', '🎉', '🎊', '👋', '👌', '🤙', '📌', '⏰', '🗓️',
];

export default function ChatWindow({ open, onClose, patientName, patientPhone, patientContext = {}, addToast }) {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [inputText, setInputText] = useState('');
    const [sending, setSending] = useState(false);
    const [lightboxUrl, setLightboxUrl] = useState(null);
    const [playingAudio, setPlayingAudio] = useState(null);
    const [showEmojis, setShowEmojis] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [uploadingMedia, setUploadingMedia] = useState(false);
    // Shortcuts state
    const [shortcuts, setShortcuts] = useState([]);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [shortcutFilter, setShortcutFilter] = useState('');
    const [shortcutIndex, setShortcutIndex] = useState(0);
    const [showShortcutManager, setShowShortcutManager] = useState(false);
    // Dual WhatsApp line state
    const [whatsappLines, setWhatsappLines] = useState([]);
    const [assignedLineId, setAssignedLineId] = useState(null);
    const [showLineSelector, setShowLineSelector] = useState(false);
    const [showChangeLineModal, setShowChangeLineModal] = useState(false);
    // Meta WhatsApp 24h window state
    const [metaTemplates, setMetaTemplates] = useState([]);
    const [showMetaTemplatePicker, setShowMetaTemplatePicker] = useState(false);
    const [pendingMetaTemplate, setPendingMetaTemplate] = useState(null);
    const [sendingMetaTemplate, setSendingMetaTemplate] = useState(false);

    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const audioRefs = useRef({});
    const mediaRecorderRef = useRef(null);
    const recordingChunksRef = useRef([]);
    const recordingTimerRef = useRef(null);
    const fileInputRef = useRef(null);
    const shortcutPopupRef = useRef(null);

    // ==========================================
    // CARGAR MENSAJES + REALTIME + POLLING
    // ==========================================
    useEffect(() => {
        if (!open || !patientPhone) return;

        let unsubscribe = () => { };
        let pollInterval = null;

        const loadMessages = async () => {
            setLoading(true);
            try {
                const msgs = await fetchMessages(patientPhone);
                setMessages(msgs);
                await markAsRead(patientPhone);
            } catch (err) {
                console.error('Error loading chat:', err);
                addToast?.('Error cargando chat', 'error');
            } finally {
                setLoading(false);
            }
        };

        loadMessages();

        // Auto-persist CRM contact for this patient (survives daily Excel updates)
        if (patientName && patientPhone) {
            upsertCrmContact({
                phone: patientPhone,
                nombre: patientName,
                id_paciente: patientContext?.idPaciente || null,
                dni: patientContext?.dni || null,
            }).catch(err => console.warn('[ChatWindow] CRM contact upsert error:', err));
        }

        // Suscribir a nuevos mensajes en tiempo real
        console.log('[ChatWindow] Subscribing to realtime for:', patientPhone);
        unsubscribe = subscribeToMessages(patientPhone, (newMsg) => {
            console.log('[ChatWindow] Realtime message received:', newMsg);
            setMessages(prev => {
                const exists = prev.find(m => m.id === newMsg.id);
                if (exists) return prev;
                return [...prev, newMsg];
            });
            if (newMsg.direction === 'incoming') {
                markAsRead(patientPhone);
            }
        });

        // Polling fallback cada 5s
        pollInterval = setInterval(async () => {
            try {
                const msgs = await fetchMessages(patientPhone);
                setMessages(prev => {
                    if (msgs.length !== prev.length) {
                        markAsRead(patientPhone);
                        return msgs;
                    }
                    return prev;
                });
            } catch (err) {
                console.error('[ChatWindow] Poll error:', err);
            }
        }, 5000);

        return () => {
            unsubscribe();
            if (pollInterval) clearInterval(pollInterval);
        };
    }, [open, patientPhone]);

    // Load WhatsApp lines + assigned line
    useEffect(() => {
        if (!open) return;
        fetchWhatsAppLines().then(setWhatsappLines).catch(console.error);
    }, [open]);

    useEffect(() => {
        if (!open || !patientPhone) return;
        getAssignedLine(patientPhone).then(lineId => {
            setAssignedLineId(lineId);
            if (!lineId) setShowLineSelector(true);
        }).catch(console.error);
    }, [open, patientPhone]);

    // Get current line info
    const currentLine = whatsappLines.find(l => l.id === assignedLineId) || null;

    // === META 24H WINDOW LOGIC ===
    const isMetaLine = currentLine?.is_meta === true;
    const isWindowExpired = useMemo(() => {
        if (!isMetaLine || messages.length === 0) return false;
        const lastIncoming = [...messages].reverse().find(m => m.direction === 'incoming');
        if (!lastIncoming) return true; // No incoming messages = window never opened
        const diff = Date.now() - new Date(lastIncoming.created_at).getTime();
        return diff > 24 * 60 * 60 * 1000; // > 24 hours
    }, [isMetaLine, messages]);

    // Fetch Meta templates when line is Meta
    useEffect(() => {
        if (!isMetaLine || !open) return;
        fetchMetaTemplates('line_meta').then(setMetaTemplates).catch(err => {
            console.warn('[ChatWindow] Error fetching Meta templates:', err);
        });
    }, [isMetaLine, open]);

    // Handle line selection
    const handleSelectLine = async (lineId) => {
        setAssignedLineId(lineId);
        setShowLineSelector(false);
        setShowChangeLineModal(false);
        try {
            await assignLine(patientPhone, lineId);
        } catch (err) {
            console.error('Error assigning line:', err);
            addToast?.('Error asignando línea', 'error');
        }
    };

    // === SEND META TEMPLATE ===
    const handleSelectMetaTemplate = (tpl) => {
        setPendingMetaTemplate(tpl);
        setShowMetaTemplatePicker(false);
    };

    const confirmSendMetaTemplate = async () => {
        if (!pendingMetaTemplate || !patientPhone || sendingMetaTemplate) return;
        setSendingMetaTemplate(true);
        try {
            const normalizedPhone = patientPhone.startsWith('549') ? patientPhone : `549${patientPhone}`;
            await sendMetaTemplate({
                to: normalizedPhone,
                templateName: pendingMetaTemplate.name || pendingMetaTemplate.templateName,
                languageCode: pendingMetaTemplate.language || 'es',
                lineId: 'line_meta',
            });
            // Save to message history
            const templateBody = pendingMetaTemplate.components?.find(c => c.type === 'BODY')?.text || pendingMetaTemplate.name;
            await saveOutgoingMessage({
                phone: patientPhone,
                content: `📋 [Plantilla Meta] ${templateBody}`,
                mediaType: 'text',
                lineId: 'line_meta',
            });
            addToast?.('Plantilla enviada exitosamente ✅', 'success');
            setPendingMetaTemplate(null);
        } catch (err) {
            console.error('Error sending Meta template:', err);
            addToast?.('Error enviando plantilla: ' + err.message, 'error');
        } finally {
            setSendingMetaTemplate(false);
        }
    };

    // Auto-scroll al final
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Focus en el input al abrir
    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [open]);

    // ==========================================
    // CARGAR SHORTCUTS
    // ==========================================
    const loadShortcutsData = useCallback(() => {
        fetchShortcuts(true).then(setShortcuts).catch(err => {
            console.warn('Could not load shortcuts:', err);
        });
    }, []);

    useEffect(() => {
        if (!open) return;
        loadShortcutsData();
    }, [open, loadShortcutsData]);

    // ==========================================
    // UPLOAD MEDIA A SUPABASE STORAGE
    // ==========================================
    const uploadMedia = async (file, folder = 'chat-media') => {
        const ext = file.name?.split('.').pop() || 'bin';
        const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

        const { data, error } = await supabase.storage
            .from('whatsapp-media')
            .upload(fileName, file, {
                contentType: file.type,
                upsert: false,
            });

        if (error) throw error;

        const { data: urlData } = supabase.storage
            .from('whatsapp-media')
            .getPublicUrl(data.path);

        return urlData.publicUrl;
    };

    // ==========================================
    // ENVIAR MENSAJE DE TEXTO
    // ==========================================
    const handleSend = useCallback(async () => {
        if (!inputText.trim() || sending || !patientPhone) return;
        // Block free-text sending when Meta line window expired
        if (isMetaLine && isWindowExpired) {
            addToast?.('⚠️ Ventana de 24hs expirada. Usá una plantilla oficial.', 'error');
            return;
        }

        const text = inputText.trim();
        setInputText('');
        setSending(true);
        setShowEmojis(false);

        try {
            await sendWhatsAppMessage({ content: text, number: patientPhone, lineId: assignedLineId });
            await saveOutgoingMessage({
                phone: patientPhone,
                content: text,
                mediaType: 'text',
                lineId: assignedLineId,
            });
            // No agregamos al state manualmente — el realtime subscription se encarga
            // Esto evita la race condition que causaba mensajes duplicados
        } catch (err) {
            console.error('Error sending message:', err);
            addToast?.('Error enviando mensaje', 'error');
            setInputText(text);
        } finally {
            setSending(false);
        }
    }, [inputText, sending, patientPhone, addToast, assignedLineId, isMetaLine, isWindowExpired]);

    // ==========================================
    // ENVIAR IMAGEN
    // ==========================================
    const handleImageSelect = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !patientPhone) return;

        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = '';

        // Validar tipo y tamaño
        if (!file.type.startsWith('image/')) {
            addToast?.('Solo se aceptan imágenes', 'error');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            addToast?.('La imagen no puede superar 10MB', 'error');
            return;
        }

        setUploadingMedia(true);
        try {
            const mediaUrl = await uploadMedia(file, 'images');
            await sendWhatsAppMessage({
                content: inputText.trim() || '📷 Imagen',
                number: patientPhone,
                mediaUrl,
                lineId: assignedLineId,
            });
            await saveOutgoingMessage({
                phone: patientPhone,
                content: inputText.trim() || '📷 Imagen',
                mediaType: 'image',
                mediaUrl,
                lineId: assignedLineId,
            });
            // Realtime se encarga de agregar al state
            setInputText('');
            addToast?.('Imagen enviada', 'success');
        } catch (err) {
            console.error('Error sending image:', err);
            addToast?.('Error enviando imagen', 'error');
        } finally {
            setUploadingMedia(false);
        }
    };

    // ==========================================
    // GRABAR Y ENVIAR AUDIO
    // ==========================================
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                    ? 'audio/webm;codecs=opus'
                    : 'audio/webm',
            });
            mediaRecorderRef.current = mediaRecorder;
            recordingChunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    recordingChunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                const blob = new Blob(recordingChunksRef.current, { type: 'audio/webm' });
                if (blob.size < 1000) {
                    addToast?.('Audio muy corto', 'error');
                    return;
                }
                await sendAudioBlob(blob);
            };

            mediaRecorder.start(250);
            setIsRecording(true);
            setRecordingTime(0);
            recordingTimerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);
        } catch (err) {
            console.error('Error accessing microphone:', err);
            addToast?.('No se pudo acceder al micrófono', 'error');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
                recordingTimerRef.current = null;
            }
        }
    };

    const cancelRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
            mediaRecorderRef.current.stop();
            recordingChunksRef.current = [];
            setIsRecording(false);
            setRecordingTime(0);
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
                recordingTimerRef.current = null;
            }
        }
    };

    const sendAudioBlob = async (blob) => {
        setUploadingMedia(true);
        try {
            const file = new File([blob], `audio_${Date.now()}.webm`, { type: 'audio/webm' });
            const mediaUrl = await uploadMedia(file, 'audios');
            await sendWhatsAppMessage({
                content: '🎤 Audio',
                number: patientPhone,
                mediaUrl,
                lineId: assignedLineId,
            });
            await saveOutgoingMessage({
                phone: patientPhone,
                content: '🎤 Audio',
                mediaType: 'audio',
                mediaUrl,
                lineId: assignedLineId,
            });
            // Realtime se encarga de agregar al state
            addToast?.('Audio enviado', 'success');
        } catch (err) {
            console.error('Error sending audio:', err);
            addToast?.('Error enviando audio', 'error');
        } finally {
            setUploadingMedia(false);
        }
    };

    // ==========================================
    // EMOJI PICKER
    // ==========================================
    const insertEmoji = (emoji) => {
        setInputText(prev => prev + emoji);
        inputRef.current?.focus();
    };

    // ==========================================
    // SHORTCUTS — Lógica de detección y selección
    // ==========================================
    const filteredShortcuts = shortcuts.filter(s => {
        if (!shortcutFilter) return true;
        const q = shortcutFilter.toLowerCase();
        return s.shortcut.toLowerCase().includes(q) ||
            s.label.toLowerCase().includes(q) ||
            s.category?.toLowerCase().includes(q);
    });

    const handleInputChange = (e) => {
        const val = e.target.value;
        setInputText(val);

        // Detectar si el input comienza con "/" para activar shortcuts
        if (val.startsWith('/')) {
            setShowShortcuts(true);
            setShortcutFilter(val.slice(1)); // quitar el "/" para filtrar
            setShortcutIndex(0);
        } else {
            setShowShortcuts(false);
            setShortcutFilter('');
        }
    };

    // Personaliza el mensaje reemplazando variables dinámicas con datos del contexto
    const personalizeMessage = useCallback((message, name) => {
        if (!message) return message;

        // Formatear fecha de cirugía si existe
        const formatFechaCirugia = (fecha) => {
            if (!fecha) return '';
            try {
                const d = new Date(fecha + 'T12:00:00');
                return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            } catch { return fecha; }
        };

        const fechaHoy = new Date().toLocaleDateString('es-AR', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });

        let result = message;

        // Legacy: Reemplazar "Estimado/a" por nombre del paciente
        // SOLO si no hay variable {nombre} (evita duplicación de nombre)
        if (name && !message.includes('{nombre}') && !message.includes('{paciente}')) {
            result = result.replace(/Estimado\/a[,:.]?\s*/gi, `Estimada ${name} `);
        }

        // Variables de Paciente
        result = result.replace(/\{nombre\}/gi, name || '');
        result = result.replace(/\{paciente\}/gi, name || '');

        // Variables de Obra Social
        result = result.replace(/\{obra_social\}/gi, patientContext.obraSocial || '');
        result = result.replace(/\{afiliado\}/gi, patientContext.afiliado || '');

        // Variables Clínicas
        result = result.replace(/\{medico\}/gi, patientContext.medico || '');
        result = result.replace(/\{diagnostico\}/gi, patientContext.diagnostico || '');
        result = result.replace(/\{tratamiento\}/gi, patientContext.tratamiento || '');

        // Variables de Fechas
        result = result.replace(/\{fecha_cirugia\}/gi, formatFechaCirugia(patientContext.fechaCirugia));
        result = result.replace(/\{fecha_hoy\}/gi, fechaHoy);

        // Variables de Presupuesto
        result = result.replace(/\{presupuesto_total\}/gi, patientContext.presupuestoTotal || '');

        // Variables de Deuda
        result = result.replace(/\{deuda_total\}/gi, patientContext.deudaTotal || ''); // backward compatibility
        result = result.replace(/\{factura_pendiente\}/gi, patientContext.deudaTotal || '');
        result = result.replace(/\{cantidad_facturas\}/gi, patientContext.cantidadFacturas || ''); // backward compatibility
        result = result.replace(/\{fecha_ultima_factura\}/gi, formatFechaCirugia(patientContext.fechaUltimaFactura)); // backward compatibility
        result = result.replace(/\{fecha_factura_pendiente\}/gi, formatFechaCirugia(patientContext.fechaUltimaFactura));
        result = result.replace(/\{nhc\}/gi, patientContext.nhc || ''); // backward compatibility

        return result;
    }, [patientContext]);

    const selectShortcut = useCallback((shortcut) => {
        const personalized = personalizeMessage(shortcut.message, patientName);
        setInputText(personalized);
        setShowShortcuts(false);
        setShortcutFilter('');
        setShortcutIndex(0);
        inputRef.current?.focus();
    }, [patientName, personalizeMessage]);

    // Enter para enviar o seleccionar shortcut
    const handleKeyDown = (e) => {
        // Navegación en shortcuts popup
        if (showShortcuts && filteredShortcuts.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setShortcutIndex(prev => (prev + 1) % filteredShortcuts.length);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setShortcutIndex(prev => (prev - 1 + filteredShortcuts.length) % filteredShortcuts.length);
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                selectShortcut(filteredShortcuts[shortcutIndex]);
                return;
            }
            if (e.key === 'Tab') {
                e.preventDefault();
                selectShortcut(filteredShortcuts[shortcutIndex]);
                return;
            }
        }

        if (e.key === 'Escape' && showShortcuts) {
            e.preventDefault();
            setShowShortcuts(false);
            setInputText('');
            return;
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // ==========================================
    // AUDIO PLAYER (para mensajes recibidos)
    // ==========================================
    const toggleAudio = (msgId, url) => {
        const audio = audioRefs.current[msgId];
        if (!audio) {
            const newAudio = new Audio(url);
            audioRefs.current[msgId] = newAudio;
            newAudio.onended = () => setPlayingAudio(null);
            newAudio.play();
            setPlayingAudio(msgId);
        } else if (playingAudio === msgId) {
            audio.pause();
            setPlayingAudio(null);
        } else {
            Object.values(audioRefs.current).forEach(a => a.pause());
            audio.currentTime = 0;
            audio.play();
            setPlayingAudio(msgId);
        }
    };

    const formatRecordingTime = (s) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    // ==========================================
    // RENDER HELPERS
    // ==========================================

    if (!open) return null;

    const formatTime = (dateStr) => {
        const d = new Date(dateStr);
        return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (dateStr) => {
        const d = new Date(dateStr);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (d.toDateString() === today.toDateString()) return 'Hoy';
        if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
        return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    // Agrupar mensajes por fecha
    const groupedMessages = [];
    let lastDate = '';
    messages.forEach(msg => {
        const msgDate = new Date(msg.created_at).toDateString();
        if (msgDate !== lastDate) {
            groupedMessages.push({ type: 'date', date: msg.created_at });
            lastDate = msgDate;
        }
        groupedMessages.push({ type: 'message', ...msg });
    });

    const renderMessageContent = (msg) => {
        switch (msg.media_type) {
            case 'image':
            case 'sticker':
                return (
                    <div>
                        <img
                            src={msg.media_url}
                            alt="Imagen"
                            onClick={() => setLightboxUrl(msg.media_url)}
                            style={{
                                maxWidth: '240px', maxHeight: '240px',
                                borderRadius: '8px', cursor: 'pointer',
                                objectFit: 'cover', display: 'block',
                            }}
                            onError={(e) => { e.target.style.display = 'none'; }}
                        />
                        {msg.content && msg.content !== '[image]' && msg.content !== '[sticker]' && msg.content !== '📷 Imagen' && (
                            <p style={{ margin: '6px 0 0', fontSize: '0.85rem' }}>{msg.content}</p>
                        )}
                    </div>
                );
            case 'audio':
                return (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '8px 12px', borderRadius: '20px',
                        background: msg.direction === 'outgoing' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.04)',
                        minWidth: '200px',
                    }}>
                        <button
                            onClick={() => toggleAudio(msg.id, msg.media_url)}
                            style={{
                                width: '36px', height: '36px', borderRadius: '50%',
                                background: msg.direction === 'outgoing' ? 'rgba(255,255,255,0.25)' : '#25D366',
                                color: '#fff', border: 'none', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            {playingAudio === msg.id ? <Pause size={16} /> : <Play size={16} />}
                        </button>
                        <div style={{ flex: 1 }}>
                            <div style={{
                                height: '4px', borderRadius: '2px',
                                background: msg.direction === 'outgoing' ? 'rgba(255,255,255,0.3)' : '#ddd',
                                position: 'relative',
                            }}>
                                <div style={{
                                    width: playingAudio === msg.id ? '60%' : '0%',
                                    height: '100%', borderRadius: '2px',
                                    background: msg.direction === 'outgoing' ? '#fff' : '#25D366',
                                    transition: 'width 0.3s',
                                }} />
                            </div>
                        </div>
                        <Volume2 size={14} style={{ opacity: 0.5 }} />
                    </div>
                );
            case 'video':
                return (
                    <div>
                        <video
                            src={msg.media_url}
                            controls
                            style={{ maxWidth: '280px', borderRadius: '8px', display: 'block' }}
                        />
                        {msg.content && msg.content !== '[video]' && (
                            <p style={{ margin: '6px 0 0', fontSize: '0.85rem' }}>{msg.content}</p>
                        )}
                    </div>
                );
            case 'document':
                return (
                    <a
                        href={msg.media_url} target="_blank" rel="noopener noreferrer"
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '10px 14px', borderRadius: '8px',
                            background: msg.direction === 'outgoing' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.04)',
                            color: 'inherit', textDecoration: 'none',
                        }}
                    >
                        <Download size={18} />
                        <span style={{ fontSize: '0.83rem', fontWeight: 500 }}>
                            {msg.content || 'Documento adjunto'}
                        </span>
                    </a>
                );
            default: // text
                return <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{msg.content}</p>;
        }
    };

    return (
        <>
            {/* OVERLAY */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 10000,
                    background: 'rgba(15,23,42,0.55)', WebkitBackdropFilter: 'blur(8px)', backdropFilter: 'blur(8px)',
                    animation: 'fadeIn 0.2s ease-out',
                }}
            />

            {/* ========== VENTANA DE CHAT ========== */}
            <div style={{
                position: 'fixed', zIndex: 10001,
                top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                width: 'min(520px, 95vw)', height: 'min(700px, 90vh)',
                display: 'flex', flexDirection: 'column',
                borderRadius: '16px', overflow: 'hidden',
                boxShadow: '0 32px 64px -12px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.08)',
                animation: 'scaleIn 0.25s ease-out',
            }}>

                {/* ===== HEADER ===== */}
                <div style={{
                    background: 'linear-gradient(135deg, #1E3A5F 0%, #2563EB 50%, #3B82F6 100%)',
                    padding: '16px 20px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    color: '#fff', position: 'relative',
                    borderBottom: '3px solid #1D4ED8',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '44px', height: '44px', borderRadius: '12px',
                            background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 2px 8px rgba(37,211,102,0.3)',
                            border: '2px solid rgba(255,255,255,0.3)',
                        }}>
                            <MessageSquare size={20} color="#fff" />
                        </div>
                        <div>
                            <h3 style={{
                                margin: 0, fontSize: '0.95rem', fontWeight: 700,
                                textShadow: '0 1px 2px rgba(0,0,0,0.2)',
                                maxWidth: '280px', overflow: 'hidden',
                                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                {patientName || 'Paciente'}
                            </h3>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                fontSize: '0.75rem', opacity: 0.85, marginTop: '2px',
                            }}>
                                <Phone size={11} />
                                <span>{patientPhone}</span>
                                {currentLine ? (
                                    <span
                                        onClick={() => setShowChangeLineModal(true)}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '3px',
                                            marginLeft: '8px', padding: '1px 8px', borderRadius: '10px',
                                            background: `${currentLine.color}40`, fontSize: '0.68rem',
                                            cursor: 'pointer', transition: 'all 0.15s',
                                        }}
                                        title="Cambiar línea"
                                    >
                                        <span style={{
                                            width: '6px', height: '6px', borderRadius: '50%',
                                            background: currentLine.color, display: 'inline-block',
                                        }} />
                                        {currentLine.label} ···{currentLine.phone.slice(-4)}
                                    </span>
                                ) : (
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '3px',
                                        marginLeft: '8px', padding: '1px 8px', borderRadius: '10px',
                                        background: 'rgba(234,179,8,0.25)', fontSize: '0.68rem',
                                    }}>
                                        ⚠️ Sin línea asignada
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        style={{
                            width: '34px', height: '34px', borderRadius: '10px',
                            background: 'rgba(255,255,255,0.15)', border: 'none',
                            color: '#fff', cursor: 'pointer', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.15s',
                        }}
                        onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                        onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* ===== MESSAGES AREA ===== */}
                <div style={{
                    flex: 1, overflowY: 'auto',
                    background: '#ECE5DD',
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c8bfb6' fill-opacity='0.12'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                    padding: '16px',
                    display: 'flex', flexDirection: 'column', gap: '4px',
                }}>
                    {loading ? (
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            height: '100%', color: '#8696A0', gap: '8px',
                        }}>
                            <div style={{
                                width: '20px', height: '20px', border: '2px solid #00A884',
                                borderTopColor: 'transparent', borderRadius: '50%',
                                animation: 'spin 0.8s linear infinite',
                            }} />
                            <span style={{ fontSize: '0.85rem' }}>Cargando mensajes...</span>
                        </div>
                    ) : messages.length === 0 ? (
                        <div style={{
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            height: '100%', color: '#8696A0', gap: '8px',
                        }}>
                            <MessageSquare size={40} style={{ opacity: 0.3 }} />
                            <p style={{ fontSize: '0.9rem', fontWeight: 500, margin: 0 }}>
                                Sin mensajes
                            </p>
                            <p style={{ fontSize: '0.78rem', opacity: 0.7, margin: 0 }}>
                                Enviá el primer mensaje al paciente
                            </p>
                        </div>
                    ) : (
                        groupedMessages.map((item, idx) => {
                            if (item.type === 'date') {
                                return (
                                    <div key={`date-${idx}`} style={{
                                        textAlign: 'center', margin: '12px 0 4px',
                                    }}>
                                        <span style={{
                                            display: 'inline-block',
                                            padding: '4px 14px', borderRadius: '8px',
                                            background: 'rgba(225,218,208,0.9)',
                                            fontSize: '0.72rem', fontWeight: 600,
                                            color: '#54656F',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                                        }}>
                                            {formatDate(item.date)}
                                        </span>
                                    </div>
                                );
                            }

                            const isOut = item.direction === 'outgoing';

                            return (
                                <div key={item.id || idx} style={{
                                    display: 'flex',
                                    justifyContent: isOut ? 'flex-end' : 'flex-start',
                                    marginBottom: '3px',
                                }}>
                                    <div style={{
                                        maxWidth: '78%', padding: '8px 12px',
                                        borderRadius: isOut ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                                        background: isOut
                                            ? 'linear-gradient(135deg, #D9FDD3 0%, #C8F5C0 100%)'
                                            : '#FFFFFF',
                                        color: '#111B21',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                                        position: 'relative',
                                    }}>
                                        {!isOut && item.sender_name && (
                                            <p style={{
                                                margin: '0 0 4px', fontSize: '0.72rem',
                                                fontWeight: 700, color: '#1FA855',
                                            }}>
                                                {item.sender_name}
                                            </p>
                                        )}

                                        {renderMessageContent(item)}

                                        <div style={{
                                            display: 'flex', alignItems: 'center',
                                            justifyContent: 'flex-end', gap: '4px',
                                            marginTop: '4px',
                                        }}>
                                            <span style={{ fontSize: '0.65rem', color: '#667781' }}>
                                                {formatTime(item.created_at)}
                                            </span>
                                            {isOut && (
                                                <CheckCheck size={14} style={{ color: '#53BDEB' }} />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* ===== EMOJI PICKER ===== */}
                {showEmojis && (
                    <div style={{
                        background: '#F0F2F5',
                        borderTop: '1px solid #E9EDEF',
                        padding: '10px 14px',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(10, 1fr)',
                        gap: '2px',
                        maxHeight: '140px',
                        overflowY: 'auto',
                    }}>
                        {EMOJI_LIST.map((emoji, i) => (
                            <button
                                key={i}
                                onClick={() => insertEmoji(emoji)}
                                style={{
                                    border: 'none', background: 'none',
                                    fontSize: '1.3rem', cursor: 'pointer',
                                    padding: '4px', borderRadius: '6px',
                                    transition: 'background 0.15s',
                                }}
                                onMouseOver={e => e.currentTarget.style.background = 'rgba(0,0,0,0.08)'}
                                onMouseOut={e => e.currentTarget.style.background = 'none'}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                )}

                {/* ===== META 24H EXPIRED BANNER ===== */}
                {isMetaLine && isWindowExpired && (
                    <div style={{
                        background: 'linear-gradient(135deg, #FEF3C7, #FFFBEB)',
                        borderTop: '1px solid #FDE68A',
                        padding: '10px 16px',
                        display: 'flex', alignItems: 'center', gap: '10px',
                    }}>
                        <AlertTriangle size={16} style={{ color: '#D97706', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                            <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: '#92400E' }}>
                                Ventana de 24hs expirada — Línea Meta Business
                            </p>
                            <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#A16207' }}>
                                Solo podés iniciar conversación con una plantilla oficial aprobada.
                            </p>
                        </div>
                        <button
                            onClick={() => setShowMetaTemplatePicker(true)}
                            style={{
                                padding: '6px 14px', borderRadius: '8px',
                                background: 'linear-gradient(135deg, #25D366, #128C7E)',
                                color: '#fff', border: 'none', cursor: 'pointer',
                                fontSize: '0.75rem', fontWeight: 700,
                                display: 'flex', alignItems: 'center', gap: '6px',
                                boxShadow: '0 2px 6px rgba(37,211,102,0.3)',
                                transition: 'all 0.15s',
                            }}
                        >
                            <FileText size={14} /> Usar Plantilla
                        </button>
                    </div>
                )}

                {/* ===== COMPOSER ===== */}
                <div style={{
                    background: '#F0F2F5',
                    padding: '10px 16px',
                    display: 'flex', alignItems: 'flex-end', gap: '8px',
                    borderTop: '1px solid #E9EDEF',
                    ...(isMetaLine && isWindowExpired ? { opacity: 0.5, pointerEvents: 'none' } : {}),
                }}>
                    {/* Hidden file input */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageSelect}
                        style={{ display: 'none' }}
                    />

                    {isRecording ? (
                        /* Recording UI */
                        <div style={{
                            flex: 1, display: 'flex', alignItems: 'center',
                            gap: '12px', padding: '8px 16px',
                            background: '#fff', borderRadius: '20px',
                        }}>
                            <div style={{
                                width: '10px', height: '10px', borderRadius: '50%',
                                background: '#EF4444', animation: 'pulse 1s ease-in-out infinite',
                            }} />
                            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#EF4444', flex: 1 }}>
                                Grabando {formatRecordingTime(recordingTime)}
                            </span>
                            <button
                                onClick={cancelRecording}
                                title="Cancelar"
                                style={{
                                    width: '32px', height: '32px', borderRadius: '50%',
                                    background: '#FEE2E2', border: 'none', color: '#EF4444',
                                    cursor: 'pointer', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center',
                                }}
                            >
                                <X size={16} />
                            </button>
                            <button
                                onClick={stopRecording}
                                title="Enviar audio"
                                style={{
                                    width: '42px', height: '42px', borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                                    border: 'none', color: '#fff', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 2px 8px rgba(37,211,102,0.35)',
                                }}
                            >
                                <Send size={18} />
                            </button>
                        </div>
                    ) : uploadingMedia ? (
                        /* Upload indicator */
                        <div style={{
                            flex: 1, display: 'flex', alignItems: 'center',
                            justifyContent: 'center', gap: '8px', padding: '12px',
                            background: '#fff', borderRadius: '20px',
                        }}>
                            <Loader size={18} style={{ animation: 'spin 1s linear infinite', color: '#25D366' }} />
                            <span style={{ fontSize: '0.85rem', color: '#667781' }}>Enviando...</span>
                        </div>
                    ) : (
                        /* Normal composer */
                        <>
                            {/* Emoji toggle */}
                            <button
                                onClick={() => setShowEmojis(!showEmojis)}
                                style={{
                                    width: '36px', height: '36px', borderRadius: '50%',
                                    background: showEmojis ? 'rgba(37,211,102,0.15)' : 'none',
                                    border: 'none',
                                    color: showEmojis ? '#25D366' : '#54656F',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', flexShrink: 0,
                                    transition: 'all 0.15s',
                                }}
                            >
                                <Smile size={22} />
                            </button>

                            {/* Image button */}
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                style={{
                                    width: '36px', height: '36px', borderRadius: '50%',
                                    background: 'none', border: 'none', color: '#54656F',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', flexShrink: 0,
                                }}
                                title="Enviar imagen"
                            >
                                <ImageIcon size={20} />
                            </button>

                            {/* Text input + Shortcuts popup */}
                            <div style={{ flex: 1, position: 'relative' }}>

                                {/* ===== SHORTCUTS POPUP ===== */}
                                {showShortcuts && filteredShortcuts.length > 0 && (
                                    <div
                                        ref={shortcutPopupRef}
                                        style={{
                                            position: 'absolute',
                                            bottom: 'calc(100% + 8px)',
                                            left: 0, right: 0,
                                            background: '#fff',
                                            borderRadius: '12px',
                                            boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.05)',
                                            maxHeight: '260px',
                                            overflowY: 'auto',
                                            zIndex: 100,
                                            animation: 'scaleIn 0.15s ease-out',
                                        }}
                                    >
                                        {/* Header */}
                                        <div style={{
                                            padding: '10px 14px 6px',
                                            borderBottom: '1px solid #f0f0f0',
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                        }}>
                                            <Zap size={14} style={{ color: '#F59E0B' }} />
                                            <span style={{
                                                fontSize: '0.72rem', fontWeight: 700,
                                                color: '#8696A0', textTransform: 'uppercase',
                                                letterSpacing: '0.05em',
                                            }}>
                                                Atajos rápidos
                                            </span>
                                            <span style={{
                                                fontSize: '0.65rem', color: '#aaa', marginLeft: 'auto',
                                            }}>
                                                ↑↓ navegar · Enter seleccionar
                                            </span>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setShowShortcutManager(true); setShowShortcuts(false); }}
                                                title="Administrar atajos"
                                                style={{
                                                    width: '24px', height: '24px', borderRadius: '6px',
                                                    background: 'none', border: '1px solid #E2E8F0',
                                                    color: '#8696A0', cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    transition: 'all 0.15s',
                                                }}
                                                onMouseOver={e => { e.currentTarget.style.background = '#F0F2F5'; e.currentTarget.style.color = '#25D366'; }}
                                                onMouseOut={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#8696A0'; }}
                                            >
                                                <Settings size={12} />
                                            </button>
                                        </div>

                                        {/* Shortcut items */}
                                        {filteredShortcuts.map((sc, idx) => (
                                            <div
                                                key={sc.id}
                                                onClick={() => selectShortcut(sc)}
                                                style={{
                                                    padding: '10px 14px',
                                                    cursor: 'pointer',
                                                    borderBottom: idx < filteredShortcuts.length - 1 ? '1px solid #f5f5f5' : 'none',
                                                    background: idx === shortcutIndex ? '#F0FFF4' : 'transparent',
                                                    transition: 'background 0.1s',
                                                    display: 'flex', flexDirection: 'column', gap: '3px',
                                                }}
                                                onMouseEnter={() => setShortcutIndex(idx)}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{
                                                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                                        fontSize: '0.78rem', fontWeight: 700,
                                                        color: '#25D366',
                                                        background: 'rgba(37,211,102,0.1)',
                                                        padding: '2px 8px', borderRadius: '6px',
                                                    }}>
                                                        {sc.shortcut}
                                                    </span>
                                                    <span style={{
                                                        fontSize: '0.82rem', fontWeight: 600,
                                                        color: '#111B21',
                                                    }}>
                                                        {sc.label}
                                                    </span>
                                                    {sc.category && (
                                                        <span style={{
                                                            fontSize: '0.65rem', color: '#8696A0',
                                                            background: '#F0F2F5', padding: '1px 6px',
                                                            borderRadius: '4px', marginLeft: 'auto',
                                                        }}>
                                                            {sc.category}
                                                        </span>
                                                    )}
                                                </div>
                                                <p style={{
                                                    margin: 0, fontSize: '0.75rem', color: '#667781',
                                                    lineHeight: 1.3,
                                                    overflow: 'hidden', textOverflow: 'ellipsis',
                                                    display: '-webkit-box', WebkitLineClamp: 2,
                                                    WebkitBoxOrient: 'vertical',
                                                }}>
                                                    {sc.message}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* No results for shortcut filter */}
                                {showShortcuts && filteredShortcuts.length === 0 && shortcutFilter && (
                                    <div style={{
                                        position: 'absolute',
                                        bottom: 'calc(100% + 8px)',
                                        left: 0, right: 0,
                                        background: '#fff',
                                        borderRadius: '12px',
                                        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                                        padding: '16px',
                                        textAlign: 'center',
                                        zIndex: 100,
                                    }}>
                                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#8696A0' }}>
                                            No se encontraron atajos para <strong>/{shortcutFilter}</strong>
                                        </p>
                                    </div>
                                )}

                                <textarea
                                    ref={inputRef}
                                    value={inputText}
                                    onChange={handleInputChange}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Escribí un mensaje... (/ para atajos)"
                                    rows={1}
                                    style={{
                                        width: '100%', resize: 'none',
                                        padding: '10px 14px',
                                        borderRadius: '20px', border: 'none',
                                        fontSize: '0.88rem', outline: 'none',
                                        background: '#fff',
                                        maxHeight: '100px', minHeight: '40px',
                                        lineHeight: 1.4,
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                                    }}
                                />
                            </div>

                            {/* Send or Mic button */}
                            {inputText.trim() ? (
                                <button
                                    onClick={handleSend}
                                    disabled={sending}
                                    style={{
                                        width: '42px', height: '42px', borderRadius: '50%',
                                        background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                                        border: 'none', color: '#fff', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        flexShrink: 0, transition: 'all 0.2s',
                                        boxShadow: '0 2px 8px rgba(37,211,102,0.35)',
                                    }}
                                >
                                    <Send size={18} style={{ marginLeft: '2px' }} />
                                </button>
                            ) : (
                                <button
                                    onClick={startRecording}
                                    style={{
                                        width: '42px', height: '42px', borderRadius: '50%',
                                        background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                                        border: 'none', color: '#fff', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        flexShrink: 0, transition: 'all 0.2s',
                                        boxShadow: '0 2px 8px rgba(37,211,102,0.35)',
                                    }}
                                    title="Grabar audio"
                                >
                                    <Mic size={18} />
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ===== IMAGE LIGHTBOX ===== */}
            {lightboxUrl && (
                <div
                    onClick={() => setLightboxUrl(null)}
                    style={{
                        position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 10010,
                        background: 'rgba(0,0,0,0.85)', WebkitBackdropFilter: 'blur(12px)', backdropFilter: 'blur(12px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'zoom-out', padding: '20px',
                    }}
                >
                    <img
                        src={lightboxUrl}
                        alt="Preview"
                        style={{
                            maxWidth: '90vw', maxHeight: '85vh',
                            borderRadius: '8px',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                        }}
                    />
                    <button
                        onClick={() => setLightboxUrl(null)}
                        style={{
                            position: 'absolute', top: '20px', right: '20px',
                            width: '40px', height: '40px', borderRadius: '50%',
                            background: 'rgba(255,255,255,0.15)', border: 'none',
                            color: '#fff', cursor: 'pointer', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>
            )}

            {/* Shortcut Manager Modal */}
            <ShortcutManager
                isOpen={showShortcutManager}
                onClose={() => { setShowShortcutManager(false); loadShortcutsData(); }}
                addToast={addToast}
            />

            {/* ===== LINE SELECTOR (first time) ===== */}
            {showLineSelector && whatsappLines.length > 0 && (
                <div style={{
                    position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 10020,
                    background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{
                        background: '#fff', borderRadius: '16px', padding: '28px 32px',
                        width: 'min(400px, 90vw)', boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
                        animation: 'scaleIn 0.2s ease-out',
                    }}>
                        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                            <div style={{
                                width: '48px', height: '48px', borderRadius: '12px',
                                background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 12px',
                            }}>
                                <Phone size={22} color="#fff" />
                            </div>
                            <h3 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 700, color: '#1E293B' }}>
                                Seleccioná la línea
                            </h3>
                            <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748B' }}>
                                Esta línea se usará siempre para este paciente
                            </p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {whatsappLines.map(line => (
                                <button
                                    key={line.id}
                                    onClick={() => handleSelectLine(line.id)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '12px',
                                        padding: '14px 16px', borderRadius: '12px',
                                        border: `2px solid ${line.color}30`,
                                        background: `${line.color}08`, cursor: 'pointer',
                                        transition: 'all 0.15s', textAlign: 'left',
                                    }}
                                    onMouseOver={e => {
                                        e.currentTarget.style.background = `${line.color}15`;
                                        e.currentTarget.style.borderColor = line.color;
                                        e.currentTarget.style.transform = 'scale(1.02)';
                                    }}
                                    onMouseOut={e => {
                                        e.currentTarget.style.background = `${line.color}08`;
                                        e.currentTarget.style.borderColor = `${line.color}30`;
                                        e.currentTarget.style.transform = 'scale(1)';
                                    }}
                                >
                                    <div style={{
                                        width: '40px', height: '40px', borderRadius: '10px',
                                        background: `${line.color}20`, display: 'flex',
                                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                    }}>
                                        <Phone size={18} color={line.color} />
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1E293B' }}>
                                            {line.label}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748B', fontFamily: 'monospace' }}>
                                            +{line.phone}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => setShowLineSelector(false)}
                            style={{
                                marginTop: '16px', width: '100%', padding: '8px',
                                background: 'none', border: 'none', cursor: 'pointer',
                                fontSize: '0.78rem', color: '#94A3B8', fontWeight: 600,
                            }}
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* ===== CHANGE LINE MODAL ===== */}
            {showChangeLineModal && whatsappLines.length > 0 && (
                <div style={{
                    position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 10020,
                    background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{
                        background: '#fff', borderRadius: '16px', padding: '28px 32px',
                        width: 'min(400px, 90vw)', boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
                        animation: 'scaleIn 0.2s ease-out',
                    }}>
                        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                            <div style={{
                                width: '48px', height: '48px', borderRadius: '12px',
                                background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 12px',
                            }}>
                                <Phone size={22} color="#fff" />
                            </div>
                            <h3 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 700, color: '#1E293B' }}>
                                ¿Cambiar línea?
                            </h3>
                            <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748B' }}>
                                El paciente pasará a recibir mensajes desde otro número
                            </p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {whatsappLines.map(line => (
                                <button
                                    key={line.id}
                                    onClick={() => handleSelectLine(line.id)}
                                    disabled={line.id === assignedLineId}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '12px',
                                        padding: '14px 16px', borderRadius: '12px',
                                        border: line.id === assignedLineId
                                            ? `2px solid ${line.color}`
                                            : `2px solid ${line.color}30`,
                                        background: line.id === assignedLineId
                                            ? `${line.color}15`
                                            : `${line.color}08`,
                                        cursor: line.id === assignedLineId ? 'default' : 'pointer',
                                        transition: 'all 0.15s', textAlign: 'left',
                                        opacity: line.id === assignedLineId ? 0.7 : 1,
                                    }}
                                >
                                    <div style={{
                                        width: '40px', height: '40px', borderRadius: '10px',
                                        background: `${line.color}20`, display: 'flex',
                                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                    }}>
                                        <Phone size={18} color={line.color} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1E293B' }}>
                                            {line.label}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748B', fontFamily: 'monospace' }}>
                                            +{line.phone}
                                        </div>
                                    </div>
                                    {line.id === assignedLineId && (
                                        <span style={{
                                            padding: '2px 10px', borderRadius: '10px',
                                            background: `${line.color}20`, fontSize: '0.68rem',
                                            fontWeight: 700, color: line.color,
                                        }}>
                                            Actual
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => setShowChangeLineModal(false)}
                            style={{
                                marginTop: '16px', width: '100%', padding: '10px',
                                background: 'var(--neutral-100)', border: '1px solid var(--neutral-200)',
                                borderRadius: '10px', cursor: 'pointer',
                                fontSize: '0.82rem', color: '#64748B', fontWeight: 600,
                            }}
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* ===== META TEMPLATE PICKER ===== */}
            {showMetaTemplatePicker && (
                <div
                    onClick={() => setShowMetaTemplatePicker(false)}
                    style={{
                        position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 10020,
                        background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: '#fff', borderRadius: '16px',
                            width: 'min(460px, 92vw)', maxHeight: '70vh',
                            boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
                            animation: 'scaleIn 0.2s ease-out',
                            display: 'flex', flexDirection: 'column', overflow: 'hidden',
                        }}
                    >
                        {/* Header */}
                        <div style={{
                            padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '10px',
                            borderBottom: '1px solid #E2E8F0',
                            background: 'linear-gradient(135deg, #25D366, #128C7E)',
                        }}>
                            <Shield size={20} color="#fff" />
                            <div style={{ flex: 1 }}>
                                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                                    Plantillas Meta Oficiales
                                </h3>
                                <p style={{ margin: 0, fontSize: '0.72rem', color: 'rgba(255,255,255,0.8)' }}>
                                    Seleccioná una plantilla para iniciar la conversación
                                </p>
                            </div>
                            <button
                                onClick={() => setShowMetaTemplatePicker(false)}
                                style={{
                                    width: '30px', height: '30px', borderRadius: '8px',
                                    background: 'rgba(255,255,255,0.2)', border: 'none',
                                    color: '#fff', cursor: 'pointer', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center',
                                }}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Template list */}
                        <div style={{ overflowY: 'auto', flex: 1, padding: '12px' }}>
                            {metaTemplates.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '30px', color: '#8696A0' }}>
                                    <FileText size={32} style={{ opacity: 0.3, marginBottom: '10px' }} />
                                    <p style={{ margin: 0, fontSize: '0.85rem' }}>No se encontraron plantillas</p>
                                    <p style={{ margin: '4px 0 0', fontSize: '0.75rem', opacity: 0.7 }}>
                                        Verificá las credenciales de la línea Meta
                                    </p>
                                </div>
                            ) : (
                                metaTemplates.map((tpl, idx) => (
                                    <button
                                        key={tpl.id || tpl.name || idx}
                                        onClick={() => handleSelectMetaTemplate(tpl)}
                                        style={{
                                            width: '100%', textAlign: 'left',
                                            padding: '12px 14px', marginBottom: '8px',
                                            borderRadius: '12px', border: '1px solid #E2E8F0',
                                            background: '#FAFBFC', cursor: 'pointer',
                                            transition: 'all 0.15s',
                                        }}
                                        onMouseOver={e => { e.currentTarget.style.background = '#F0FFF4'; e.currentTarget.style.borderColor = '#25D366'; }}
                                        onMouseOut={e => { e.currentTarget.style.background = '#FAFBFC'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                            <FileText size={14} style={{ color: '#25D366' }} />
                                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1E293B' }}>
                                                {tpl.name || tpl.templateName}
                                            </span>
                                            <span style={{
                                                fontSize: '0.62rem', padding: '1px 6px', borderRadius: '4px',
                                                background: '#E2E8F0', color: '#64748B', fontWeight: 600,
                                                textTransform: 'uppercase', marginLeft: 'auto',
                                            }}>
                                                {tpl.language || 'es'}
                                            </span>
                                        </div>
                                        <p style={{
                                            margin: 0, fontSize: '0.75rem', color: '#667781',
                                            lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis',
                                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                        }}>
                                            {tpl.components?.find(c => c.type === 'BODY')?.text || 'Sin preview'}
                                        </p>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ===== META TEMPLATE COST CONFIRMATION MODAL ===== */}
            {pendingMetaTemplate && (
                <div
                    onClick={() => setPendingMetaTemplate(null)}
                    style={{
                        position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 10030,
                        background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: '#fff', borderRadius: '16px',
                            width: 'min(440px, 90vw)',
                            boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
                            animation: 'scaleIn 0.2s ease-out',
                            overflow: 'hidden',
                        }}
                    >
                        {/* Header */}
                        <div style={{
                            background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                            padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '10px',
                        }}>
                            <AlertTriangle size={20} color="#fff" />
                            <div>
                                <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: '#fff' }}>
                                    Confirmar Envío de Plantilla
                                </h3>
                                <p style={{ margin: 0, fontSize: '0.68rem', color: 'rgba(255,255,255,0.85)' }}>
                                    WhatsApp Business API — Con Costo
                                </p>
                            </div>
                        </div>

                        {/* Body */}
                        <div style={{ padding: '16px 20px' }}>
                            {/* Template preview */}
                            <div style={{
                                background: '#F0FFF4', border: '1px solid #BBF7D0',
                                borderRadius: '10px', padding: '12px 14px', marginBottom: '12px',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                    <FileText size={14} style={{ color: '#25D366' }} />
                                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#166534' }}>
                                        {pendingMetaTemplate.name || pendingMetaTemplate.templateName}
                                    </span>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.78rem', color: '#15803D', lineHeight: 1.4 }}>
                                    {pendingMetaTemplate.components?.find(c => c.type === 'BODY')?.text || 'Sin preview'}
                                </p>
                            </div>

                            {/* Cost warning */}
                            <div style={{
                                background: '#FFFBEB', border: '1px solid #FDE68A',
                                borderRadius: '10px', padding: '12px 14px', marginBottom: '12px',
                                display: 'flex', alignItems: 'flex-start', gap: '10px',
                            }}>
                                <AlertTriangle size={14} style={{ color: '#D97706', marginTop: '2px', flexShrink: 0 }} />
                                <p style={{ margin: 0, fontSize: '0.75rem', color: '#92400E', lineHeight: 1.4 }}>
                                    Esta plantilla tiene un <strong>costo por conversación</strong>.
                                    Enviala <strong>una sola vez</strong> — cuando el paciente responda,
                                    la ventana de 24hs se reabre y los mensajes son gratuitos.
                                </p>
                            </div>

                            {/* Destination */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '8px 12px', background: '#F8FAFC', borderRadius: '8px',
                                border: '1px solid #E2E8F0', fontSize: '0.78rem', color: '#64748B',
                            }}>
                                <Phone size={14} />
                                <span>Destinatario: <strong style={{ color: '#1E293B' }}>{patientName || patientPhone}</strong></span>
                            </div>
                        </div>

                        {/* Actions */}
                        <div style={{
                            padding: '12px 20px 16px', display: 'flex',
                            justifyContent: 'flex-end', gap: '10px',
                            borderTop: '1px solid #F1F5F9',
                        }}>
                            <button
                                onClick={() => setPendingMetaTemplate(null)}
                                style={{
                                    padding: '8px 18px', borderRadius: '10px',
                                    background: 'none', border: '1px solid #E2E8F0',
                                    cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                                    color: '#64748B', transition: 'all 0.15s',
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmSendMetaTemplate}
                                disabled={sendingMetaTemplate}
                                style={{
                                    padding: '8px 20px', borderRadius: '10px',
                                    background: sendingMetaTemplate
                                        ? '#94A3B8'
                                        : 'linear-gradient(135deg, #25D366, #128C7E)',
                                    color: '#fff', border: 'none', cursor: sendingMetaTemplate ? 'not-allowed' : 'pointer',
                                    fontSize: '0.82rem', fontWeight: 700,
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    boxShadow: '0 2px 6px rgba(37,211,102,0.3)',
                                    transition: 'all 0.15s',
                                }}
                            >
                                {sendingMetaTemplate ? (
                                    <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Enviando...</>
                                ) : (
                                    <><Send size={14} /> Sí, enviar plantilla</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

