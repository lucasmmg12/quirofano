/**
 * ChatWindow — Mini CRM WhatsApp con estilo MSN Messenger moderno
 * Modal centrado tipo ventana de chat con burbujas, soporte de media y composer
 * Features: Emojis, envío de imágenes, grabación de audio, polling + realtime
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    X, Send, Paperclip, Mic, Image as ImageIcon, Play, Pause,
    Phone, MessageSquare, Clock, CheckCheck, Check, Volume2,
    Download, Smile, Square, Loader
} from 'lucide-react';
import { fetchMessages, markAsRead, saveOutgoingMessage, subscribeToMessages } from '../services/chatService';
import { sendWhatsAppMessage } from '../services/builderbotApi';
import { supabase } from '../lib/supabase';

// Emojis populares organizados
const EMOJI_LIST = [
    '😀', '😂', '🤣', '😊', '😍', '🥰', '😘', '😎', '🤩', '🥳',
    '😅', '😆', '😉', '😋', '😜', '🤪', '😝', '🤑', '🤗', '🤭',
    '👍', '👎', '👏', '🙌', '🤝', '💪', '✌️', '🤞', '🫶', '❤️',
    '🔥', '⭐', '✅', '❌', '⚠️', '🏥', '💊', '🩺', '📋', '📞',
    '🙏', '💯', '🎉', '🎊', '👋', '👌', '🤙', '📌', '⏰', '🗓️',
];

export default function ChatWindow({ open, onClose, patientName, patientPhone, addToast }) {
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
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const audioRefs = useRef({});
    const mediaRecorderRef = useRef(null);
    const recordingChunksRef = useRef([]);
    const recordingTimerRef = useRef(null);
    const fileInputRef = useRef(null);

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

        const text = inputText.trim();
        setInputText('');
        setSending(true);
        setShowEmojis(false);

        try {
            await sendWhatsAppMessage({ content: text, number: patientPhone });
            const saved = await saveOutgoingMessage({
                phone: patientPhone,
                content: text,
                mediaType: 'text',
            });
            setMessages(prev => {
                const exists = prev.find(m => m.id === saved?.id);
                if (exists) return prev;
                return [...prev, saved];
            });
        } catch (err) {
            console.error('Error sending message:', err);
            addToast?.('Error enviando mensaje', 'error');
            setInputText(text);
        } finally {
            setSending(false);
        }
    }, [inputText, sending, patientPhone, addToast]);

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
            });
            const saved = await saveOutgoingMessage({
                phone: patientPhone,
                content: inputText.trim() || '📷 Imagen',
                mediaType: 'image',
                mediaUrl,
            });
            setMessages(prev => {
                const exists = prev.find(m => m.id === saved?.id);
                if (exists) return prev;
                return [...prev, saved];
            });
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
            });
            const saved = await saveOutgoingMessage({
                phone: patientPhone,
                content: '🎤 Audio',
                mediaType: 'audio',
                mediaUrl,
            });
            setMessages(prev => {
                const exists = prev.find(m => m.id === saved?.id);
                if (exists) return prev;
                return [...prev, saved];
            });
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

    // Enter para enviar
    const handleKeyDown = (e) => {
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
                    position: 'fixed', inset: 0, zIndex: 10000,
                    background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(8px)',
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
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '3px',
                                    marginLeft: '8px', padding: '1px 8px', borderRadius: '10px',
                                    background: 'rgba(37,211,102,0.25)', fontSize: '0.68rem',
                                }}>
                                    <span style={{
                                        width: '6px', height: '6px', borderRadius: '50%',
                                        background: '#25D366', display: 'inline-block',
                                    }} />
                                    WhatsApp
                                </span>
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

                {/* ===== COMPOSER ===== */}
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

                            {/* Text input */}
                            <div style={{ flex: 1 }}>
                                <textarea
                                    ref={inputRef}
                                    value={inputText}
                                    onChange={e => setInputText(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Escribí un mensaje..."
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
                        position: 'fixed', inset: 0, zIndex: 10010,
                        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
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
        </>
    );
}
