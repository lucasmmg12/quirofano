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
    Shield, AlertTriangle, FileText, RefreshCw, Copy, CheckCircle,
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

// Heurística para pre-completar variables de Meta templates
const guessMetaVariableValue = (index, templateText, context, patientName) => {
    if (!templateText) return '';
    const placeholder = `{{${index}}}`;
    const placeholderPos = templateText.indexOf(placeholder);
    if (placeholderPos === -1) return '';
    
    const start = Math.max(0, placeholderPos - 40);
    const end = Math.min(templateText.length, placeholderPos + 40);
    const contextText = templateText.substring(start, end).toLowerCase();
    
    // Extraer propiedades según el tipo de context (ChatWindow usa camelCase, MessagingPanel usa snake_case o anidado)
    const obraSocial = context?.obraSocial || context?.surgery?.obra_social || '';
    const medico = context?.medico || context?.surgery?.medico || '';
    const fechaCirugia = context?.fechaCirugia || context?.surgery?.fecha_cirugia || '';
    const totalPresupuesto = context?.presupuestoTotal || context?.budget?.importe_total || '';
    const deudaTotal = context?.deudaTotal || context?.debt?.deuda_total || '';
    
    // 1. Patient Name (generalmente después de "hola", "estimado", "paciente", "bienvenido")
    if (contextText.includes('hola') || contextText.includes('estimado') || contextText.includes('estimada') || contextText.includes('paciente') || contextText.includes('querido')) {
        return patientName || '';
    }
    
    // 2. Fecha de Cirugía (cerca de "cirugía", "cirugia", "fecha", "turno", "día", "dia")
    if (contextText.includes('cirugía') || contextText.includes('cirugia') || contextText.includes('fecha') || contextText.includes('turno') || contextText.includes('día') || contextText.includes('dia') || contextText.includes('programada para el')) {
        if (fechaCirugia) {
            try {
                const d = new Date(fechaCirugia + 'T12:00:00');
                return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            } catch {
                return fechaCirugia;
            }
        }
        return '';
    }
    
    // 3. Médico (cerca de "médico", "medico", "dr.", "dra.", "dr ", "dra ", "doctor", "doctora")
    if (contextText.includes('médico') || contextText.includes('medico') || contextText.includes('dr.') || contextText.includes('dra.') || contextText.includes('doctor') || contextText.includes('doctora')) {
        return medico || '';
    }
    
    // 4. Obra Social / Cobertura (cerca de "obra social", "prepaga", "cobertura", "mutual", "osde")
    if (contextText.includes('obra social') || contextText.includes('prepaga') || contextText.includes('cobertura') || contextText.includes('mutual') || contextText.includes('osde')) {
        return obraSocial || '';
    }
    
    // 5. Presupuesto o Deuda (cerca de "importe", "total", "$", "presupuesto", "deuda", "monto", "factura")
    if (contextText.includes('importe') || contextText.includes('total') || contextText.includes('$') || contextText.includes('presupuesto') || contextText.includes('deuda') || contextText.includes('monto') || contextText.includes('factura')) {
        if (totalPresupuesto) return typeof totalPresupuesto === 'number' ? `$${totalPresupuesto.toLocaleString('es-AR')}` : totalPresupuesto;
        if (deudaTotal) return typeof deudaTotal === 'number' ? `$${deudaTotal.toLocaleString('es-AR')}` : deudaTotal;
        return '';
    }
    
    // Fallbacks
    if (index === 1) return patientName || '';
    if (index === 2 && fechaCirugia) {
        try {
            const d = new Date(fechaCirugia + 'T12:00:00');
            return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch {
            return fechaCirugia;
        }
    }
    
    return '';
};

// Parser para extraer variables únicas del template
const getMetaTemplateVariables = (tpl, context, patientName) => {
    const bodyComponent = tpl.components?.find(c => c.type === 'BODY');
    const text = bodyComponent?.text || '';
    const matches = text.match(/\{\{(\d+)\}\}/g);
    if (!matches) return [];
    
    const indices = [];
    matches.forEach(m => {
        const idx = Number(m.replace(/\{\{|\}\}/g, ''));
        if (!indices.includes(idx)) {
            indices.push(idx);
        }
    });
    
    indices.sort((a, b) => a - b);
    
    return indices.map(idx => {
        const val = guessMetaVariableValue(idx, text, context, patientName);
        return { index: idx, value: val };
    });
};

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
    const [linesLoading, setLinesLoading] = useState(true);
    // Meta WhatsApp 24h window state
    const [metaTemplates, setMetaTemplates] = useState([]);
    const [showMetaTemplatePicker, setShowMetaTemplatePicker] = useState(false);
    const [pendingMetaTemplate, setPendingMetaTemplate] = useState(null);
    const [sendingMetaTemplate, setSendingMetaTemplate] = useState(false);
    const [templateJustSent, setTemplateJustSent] = useState(false);
    // Meta WhatsApp template variables states
    const [metaTemplateForVars, setMetaTemplateForVars] = useState(null);
    const [metaTemplateVars, setMetaTemplateVars] = useState([]);


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

    // Load WhatsApp lines + assigned line (sequential to avoid race condition)
    useEffect(() => {
        if (!open || !patientPhone) return;
        let cancelled = false;

        const loadLinesAndAssignment = async () => {
            setLinesLoading(true);
            try {
                // 0. Ensure CRM contact exists BEFORE checking assignment
                // This prevents the race condition where upsertCrmContact (fire-and-forget
                // in the other useEffect) hasn't completed yet
                if (patientName) {
                    await upsertCrmContact({
                        phone: patientPhone,
                        nombre: patientName,
                        id_paciente: patientContext?.idPaciente || null,
                        dni: patientContext?.dni || null,
                    }).catch(err => console.warn('[ChatWindow] Pre-load CRM upsert error:', err));
                }
                if (cancelled) return;

                // 1. Cargar líneas disponibles primero
                const lines = await fetchWhatsAppLines();
                if (cancelled) return;
                setWhatsappLines(lines);

                // 2. Verificar asignación actual
                const lineId = await getAssignedLine(patientPhone);
                if (cancelled) return;

                const available = lines.filter(l => l.id !== 'line_recepciones');

                if (lineId) {
                    // Ya tiene línea asignada
                    setAssignedLineId(lineId);
                } else if (available.length === 1) {
                    // Auto-asignar si solo hay una línea disponible
                    const autoLine = available[0];
                    setAssignedLineId(autoLine.id);
                    assignLine(patientPhone, autoLine.id).catch(err =>
                        console.warn('[ChatWindow] Auto-assign line error:', err)
                    );
                    addToast?.(`Línea ${autoLine.label} asignada automáticamente`, 'success');
                } else if (available.length > 1) {
                    // Múltiples líneas: mostrar selector
                    setShowLineSelector(true);
                } else {
                    console.warn('[ChatWindow] No WhatsApp lines available');
                }
            } catch (err) {
                console.error('[ChatWindow] Error loading lines:', err);
                if (!cancelled) {
                    addToast?.('Error cargando líneas WhatsApp', 'error');
                }
            } finally {
                if (!cancelled) setLinesLoading(false);
            }
        };

        loadLinesAndAssignment();
        return () => { cancelled = true; };
    }, [open, patientPhone]);

    // Get current line info
    const currentLine = whatsappLines.find(l => l.id === assignedLineId) || null;

    // === META 24H WINDOW LOGIC ===
    const isMetaLine = currentLine?.is_meta === true;
    const isWindowExpired = useMemo(() => {
        if (!isMetaLine) return false;
        // Sin mensajes en línea Meta = nunca hubo conversación = ventana expirada
        if (messages.length === 0) return true;
        const lastIncoming = [...messages].reverse().find(m => m.direction === 'incoming');
        if (!lastIncoming) return true; // No incoming messages = window never opened
        const diff = Date.now() - new Date(lastIncoming.created_at).getTime();
        return diff > 24 * 60 * 60 * 1000; // > 24 hours
    }, [isMetaLine, messages]);

    // Fetch Meta templates when line is Meta
    useEffect(() => {
        if (!isMetaLine || !open) return;
        fetchMetaTemplates(assignedLineId).then(setMetaTemplates).catch(err => {
            console.warn('[ChatWindow] Error fetching Meta templates:', err);
        });
    }, [isMetaLine, open, assignedLineId]);

    // Lines available for this system (exclude recepciones)
    const availableLines = whatsappLines.filter(l => l.id !== 'line_recepciones');

    // Whether the composer should be blocked (no line assigned)
    const composerBlocked = !assignedLineId && !linesLoading;

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
                lineId: assignedLineId,
            });
            // Save to message history
            const templateBody = pendingMetaTemplate.components?.find(c => c.type === 'BODY')?.text || pendingMetaTemplate.name;
            await saveOutgoingMessage({
                phone: patientPhone,
                content: `📋 [Plantilla Meta] ${templateBody}`,
                mediaType: 'text',
                lineId: assignedLineId,
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

    // === QUICK SEND META TEMPLATE (inline, skip confirmation) ===
    const quickSendMetaTemplate = async (tpl) => {
        if (!patientPhone || sendingMetaTemplate) return;

        // Verificar si la plantilla tiene variables
        const parsedVars = getMetaTemplateVariables(tpl, patientContext, patientName);
        if (parsedVars.length > 0) {
            setMetaTemplateForVars(tpl);
            setMetaTemplateVars(parsedVars);
            return;
        }

        setSendingMetaTemplate(true);
        try {
            const normalizedPhone = patientPhone.startsWith('549') ? patientPhone : `549${patientPhone}`;
            await sendMetaTemplate({
                to: normalizedPhone,
                templateName: tpl.name || tpl.templateName,
                languageCode: tpl.language || 'es',
                lineId: assignedLineId,
            });
            const templateBody = tpl.components?.find(c => c.type === 'BODY')?.text || tpl.name;
            await saveOutgoingMessage({
                phone: patientPhone,
                content: `📋 [Plantilla Meta] ${templateBody}`,
                mediaType: 'text',
                lineId: assignedLineId,
            });
            setTemplateJustSent(true);
            addToast?.('Plantilla enviada ✅ — Esperando respuesta del paciente', 'success');
        } catch (err) {
            console.error('Error sending Meta template:', err);
            addToast?.('Error enviando plantilla: ' + err.message, 'error');
        } finally {
            setSendingMetaTemplate(false);
        }
    };

    // === SEND META TEMPLATE WITH VARIABLES ===
    const sendMetaTemplateWithVars = async () => {
        if (!metaTemplateForVars || !patientPhone || sendingMetaTemplate) return;
        setSendingMetaTemplate(true);
        try {
            const normalizedPhone = patientPhone.startsWith('549') ? patientPhone : `549${patientPhone}`;
            
            // Construir el parámetro components con la estructura de Meta (type: 'body' en minúsculas)
            const components = [
                {
                    type: 'body',
                    parameters: metaTemplateVars.map(v => ({
                        type: 'text',
                        text: String(v.value || '').trim()
                    }))
                }
            ];

            await sendMetaTemplate({
                to: normalizedPhone,
                templateName: metaTemplateForVars.name || metaTemplateForVars.templateName,
                languageCode: metaTemplateForVars.language || 'es',
                components,
                lineId: assignedLineId,
            });

            // Reemplazar las variables localmente para guardarlo con los valores reales en la BD
            const templateBody = metaTemplateForVars.components?.find(c => c.type === 'BODY')?.text || metaTemplateForVars.name;
            let resolvedText = templateBody;
            metaTemplateVars.forEach(v => {
                resolvedText = resolvedText.replace(`{{${v.index}}}`, v.value || '');
            });

            await saveOutgoingMessage({
                phone: patientPhone,
                content: `📋 [Plantilla Meta] ${resolvedText}`,
                mediaType: 'text',
                lineId: assignedLineId,
            });

            setTemplateJustSent(true);
            addToast?.('Plantilla enviada con variables ✅', 'success');
            setMetaTemplateForVars(null);
            setMetaTemplateVars([]);
        } catch (err) {
            console.error('Error sending Meta template with vars:', err);
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
        // Block sending without assigned line
        if (!assignedLineId) {
            addToast?.('⚠️ Seleccioná una línea WhatsApp primero', 'error');
            setShowLineSelector(true);
            return;
        }
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
                                <span style={{ userSelect: 'text', cursor: 'text' }}>{patientPhone}</span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(patientPhone).then(() => addToast?.('📋 Número copiado', 'success')).catch(() => {}); }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', padding: '1px', display: 'inline-flex', alignItems: 'center', transition: 'color 0.15s' }}
                                    onMouseOver={e => e.currentTarget.style.color = '#fff'}
                                    onMouseOut={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
                                    title="Copiar número"
                                >
                                    <Copy size={11} />
                                </button>
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
                                    <span
                                        onClick={() => setShowLineSelector(true)}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '3px',
                                            marginLeft: '8px', padding: '1px 8px', borderRadius: '10px',
                                            background: 'rgba(234,179,8,0.25)', fontSize: '0.68rem',
                                            cursor: 'pointer', transition: 'all 0.15s',
                                        }}
                                        onMouseOver={e => e.currentTarget.style.background = 'rgba(234,179,8,0.45)'}
                                        onMouseOut={e => e.currentTarget.style.background = 'rgba(234,179,8,0.25)'}
                                        title="Click para seleccionar línea"
                                    >
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

                {/* ===== META 24H EXPIRED — INLINE TEMPLATE PICKER (1-click) ===== */}
                {isMetaLine && isWindowExpired ? (
                    <div style={{
                        borderTop: '2px solid #FDE68A',
                        background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
                        padding: '10px 16px',
                        display: 'flex', flexDirection: 'column', gap: '8px',
                    }}>
                        {templateJustSent ? (
                            /* === TEMPLATE SENT — WAITING FOR RESPONSE === */
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '6px 0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <CheckCircle size={16} style={{ color: '#16A34A' }} />
                                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#166534' }}>
                                        Plantilla enviada exitosamente
                                    </span>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.72rem', color: '#92400E', textAlign: 'center', lineHeight: 1.4 }}>
                                    Cuando el paciente responda, se abrirá la ventana de 24hs y podrás escribir libremente.
                                </p>
                                <button
                                    onClick={() => setTemplateJustSent(false)}
                                    style={{
                                        padding: '4px 14px', borderRadius: '8px', border: '1px solid #E2E8F0',
                                        background: 'transparent', cursor: 'pointer', fontSize: '0.68rem',
                                        color: '#64748B', fontWeight: 600, marginTop: '2px',
                                    }}
                                >
                                    Enviar otra plantilla
                                </button>
                            </div>
                        ) : (
                            /* === TEMPLATE PICKER === */
                            <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <AlertTriangle size={14} style={{ color: '#D97706', flexShrink: 0 }} />
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400E', flex: 1 }}>
                                        Ventana 24hs expirada — Seleccioná una plantilla para reanudar
                                    </span>
                                </div>
                                {sendingMetaTemplate ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', padding: '8px 0' }}>
                                        <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite', color: '#25D366' }} />
                                        <span style={{ fontSize: '0.78rem', color: '#166534', fontWeight: 600 }}>Enviando plantilla...</span>
                                    </div>
                                ) : metaTemplates.filter(t => t.status === 'APPROVED').length === 0 ? (
                                    <span style={{ fontSize: '0.72rem', color: '#A16207', fontStyle: 'italic', textAlign: 'center', padding: '6px 0' }}>
                                        No hay plantillas aprobadas disponibles
                                    </span>
                                ) : (
                                    <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', padding: '2px 0', flexWrap: 'nowrap' }}>
                                        {metaTemplates.filter(t => t.status === 'APPROVED').map((tpl, idx) => (
                                            <button
                                                key={tpl.id || tpl.name || idx}
                                                onClick={() => quickSendMetaTemplate(tpl)}
                                                style={{
                                                    flexShrink: 0, padding: '8px 14px',
                                                    borderRadius: '10px', border: '1px solid #BBF7D0',
                                                    background: '#F0FDF4', cursor: 'pointer',
                                                    fontSize: '0.75rem', fontWeight: 600,
                                                    color: '#166534', transition: 'all 0.15s',
                                                    display: 'flex', alignItems: 'center', gap: '6px',
                                                    maxWidth: '280px',
                                                }}
                                                onMouseOver={e => { e.currentTarget.style.background = '#DCFCE7'; e.currentTarget.style.borderColor = '#25D366'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                                                onMouseOut={e => { e.currentTarget.style.background = '#F0FDF4'; e.currentTarget.style.borderColor = '#BBF7D0'; e.currentTarget.style.transform = 'translateY(0)'; }}
                                                title={tpl.components?.find(c => c.type === 'BODY')?.text || tpl.name}
                                            >
                                                <FileText size={13} style={{ flexShrink: 0 }} />
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {tpl.name || tpl.templateName}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                ) : composerBlocked ? (
                /* ===== BLOCKED COMPOSER — NO LINE ASSIGNED ===== */
                <div style={{
                    borderTop: '2px solid #FDE68A',
                    background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
                    padding: '14px 16px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertTriangle size={16} style={{ color: '#D97706' }} />
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#92400E' }}>
                            Seleccioná una línea WhatsApp para enviar mensajes
                        </span>
                    </div>
                    <button
                        onClick={() => setShowLineSelector(true)}
                        style={{
                            padding: '8px 20px', borderRadius: '10px',
                            border: '1px solid #25D366', background: '#F0FDF4',
                            color: '#166534', fontWeight: 700, fontSize: '0.82rem',
                            cursor: 'pointer', transition: 'all 0.15s',
                            display: 'flex', alignItems: 'center', gap: '6px',
                        }}
                        onMouseOver={e => { e.currentTarget.style.background = '#DCFCE7'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                        onMouseOut={e => { e.currentTarget.style.background = '#F0FDF4'; e.currentTarget.style.transform = 'translateY(0)'; }}
                    >
                        <Phone size={14} />
                        Elegir línea
                    </button>
                </div>
                ) : (
                /* ===== NORMAL COMPOSER ===== */
                <div style={{
                    background: '#F0F2F5',
                    padding: '10px 16px',
                    display: 'flex', alignItems: 'flex-end', gap: '8px',
                    borderTop: '1px solid #E9EDEF',
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
                )}
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
            {showLineSelector && availableLines.length > 0 && (
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
                            {availableLines.map(line => (
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
            {showChangeLineModal && availableLines.length > 0 && (
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
                            {availableLines.map(line => (
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

            {/* Modal de Variables de Plantilla Meta */}
            {metaTemplateForVars && (
                <div className="modal-overlay" onClick={() => setMetaTemplateForVars(null)} style={{ zIndex: 1100 }}>
                    <div className="modal animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
                        <div className="modal__header" style={{ borderBottom: '1px solid #E2E8F0', padding: '16px 20px' }}>
                            <div className="modal__header-title" style={{ gap: '8px' }}>
                                <FileText size={20} style={{ color: '#166534' }} />
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#166534' }}>
                                        Configurar Variables de Plantilla
                                    </h3>
                                    <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                        Plantilla: {metaTemplateForVars.name || metaTemplateForVars.templateName}
                                    </span>
                                </div>
                            </div>
                            <button className="modal__close" onClick={() => setMetaTemplateForVars(null)} aria-label="Cerrar">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="modal__body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Live Preview Panel */}
                            <div>
                                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                                    Vista Previa del Mensaje
                                </label>
                                <div style={{
                                    padding: '12px 16px', borderRadius: '10px',
                                    background: '#D9FDD3', fontSize: '0.85rem',
                                    lineHeight: 1.5, color: '#111B21',
                                    whiteSpace: 'pre-wrap', border: '1px solid #BBF7D0',
                                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.05)'
                                }}>
                                    {(() => {
                                        const bodyText = metaTemplateForVars.components?.find(c => c.type === 'BODY')?.text || '';
                                        let resolved = bodyText;
                                        metaTemplateVars.forEach(v => {
                                            const valText = v.value ? `**${v.value}**` : `[Variable ${v.index}]`;
                                            resolved = resolved.replace(`{{${v.index}}}`, valText);
                                        });
                                        // Simple bold rendering for preview
                                        return resolved.split('**').map((part, i) => 
                                            i % 2 === 1 ? <strong key={i} style={{ color: '#166534', background: 'rgba(22,101,52,0.08)', padding: '0 2px', borderRadius: '3px' }}>{part}</strong> : part
                                        );
                                    })()}
                                </div>
                            </div>

                            {/* Variable Fields */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', display: 'block', textTransform: 'uppercase' }}>
                                    Valores de las Variables
                                </label>
                                <div style={{ display: 'grid', gap: '10px' }}>
                                    {metaTemplateVars.map((v, i) => (
                                        <div key={v.index} className="field-group" style={{ margin: 0 }}>
                                            <label className="field-label" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span>Variable {v.index}</span>
                                                <span style={{ fontSize: '0.65rem', fontWeight: 400, color: '#94A3B8' }}>
                                                    ({i === 0 ? 'Nombre' : i === 1 ? 'Fecha/Detalle' : 'Información'})
                                                </span>
                                            </label>
                                            <input
                                                type="text"
                                                className="field-input"
                                                placeholder={`Ej: Valor para variable ${v.index}`}
                                                value={v.value}
                                                onChange={e => {
                                                    const updated = [...metaTemplateVars];
                                                    updated[i] = { ...v, value: e.target.value };
                                                    setMetaTemplateVars(updated);
                                                }}
                                                style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
                                                autoFocus={i === 0}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="modal__footer" style={{ borderTop: '1px solid #E2E8F0', padding: '14px 20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button className="btn btn--ghost" onClick={() => setMetaTemplateForVars(null)}>
                                Cancelar
                            </button>
                            <button
                                className="btn btn--success"
                                onClick={sendMetaTemplateWithVars}
                                disabled={sendingMetaTemplate || metaTemplateVars.some(v => !v.value.trim())}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    background: '#166534', color: '#fff', border: 'none',
                                    padding: '8px 18px', borderRadius: '8px', cursor: 'pointer',
                                    fontWeight: 700, fontSize: '0.82rem',
                                    boxShadow: '0 2px 8px rgba(22,101,52,0.3)',
                                }}
                            >
                                {sendingMetaTemplate ? (
                                    <>
                                        <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                        Enviando...
                                    </>
                                ) : (
                                    <>
                                        <Send size={14} />
                                        Enviar Plantilla
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}


