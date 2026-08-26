import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Play, Square, ChevronRight, Mic, Loader2, ArrowLeft, ShieldCheck, CheckCircle2, FileText, BrainCircuit, List, UploadCloud, Type, Network, Plus, Trash2, Save } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import mermaid from 'mermaid';

export default function GobernanzaPanel({ currentUser }) {
    const [plantillas, setPlantillas] = useState([]);
    const [selectedPlantilla, setSelectedPlantilla] = useState(null);
    const [loading, setLoading] = useState(true);

    // Template Creator States
    const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState("");
    const [newTemplateQuestions, setNewTemplateQuestions] = useState([""]);
    const [isSavingTemplate, setIsSavingTemplate] = useState(false);

    // Modes: 'record', 'upload', 'text'
    const [inputMode, setInputMode] = useState('record');

    // Recording states
    const [isRecording, setIsRecording] = useState(false);
    const [duration, setDuration] = useState(0);
    const [audioUrl, setAudioUrl] = useState(null);
    
    // Upload / Text states
    const [selectedFile, setSelectedFile] = useState(null);
    const [manualText, setManualText] = useState('');

    const [processingState, setProcessingState] = useState(null); // 'uploading', 'analyzing', null
    const [resultData, setResultData] = useState(null);
    const [transcriptionText, setTranscriptionText] = useState("");
    const [pollIntervalId, setPollIntervalId] = useState(null);

    // Refs
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const canvasRef = useRef(null);
    const animationRef = useRef(null);
    const analyserRef = useRef(null);
    const timerRef = useRef(null);
    const streamRef = useRef(null);
    const mermaidRef = useRef(null);
    const wsRef = useRef(null);
    const liveTranscriptRef = useRef("");

    // Fetch Plantillas on mount
    useEffect(() => {
        const fetchPlantillas = async () => {
            try {
                const { data, error } = await supabase
                    .from('gobernanza_plantillas')
                    .select('*')
                    .order('created_at', { ascending: false });
                
                if (error) throw error;
                if (data && data.length > 0) setPlantillas(data);
            } catch (err) {
                console.error("Error fetching plantillas:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchPlantillas();
    }, []);

    // Function to refetch templates
    const refreshPlantillas = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('gobernanza_plantillas')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            if (data) setPlantillas(data);
        } catch (err) {
            console.error("Error fetching plantillas:", err);
        } finally {
            setLoading(false);
        }
    };

    // Initialize mermaid when results are shown
    useEffect(() => {
        if (resultData?.mapa_conceptual_mermaid && mermaidRef.current) {
            try {
                mermaid.initialize({ startOnLoad: false, theme: 'default' });
                mermaid.run({
                    nodes: [mermaidRef.current]
                });
            } catch (err) {
                console.error("Error renderizando mermaid:", err);
            }
        }
    }, [resultData]);

    const formatTime = (secs) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const drawWaveform = () => {
        if (!canvasRef.current || !analyserRef.current) return;
        const canvas = canvasRef.current;
        const canvasCtx = canvas.getContext('2d');
        const analyser = analyserRef.current;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            // Se usa requestAnimationFrame para el loop. Al detener, se llama a cancelAnimationFrame.
            animationRef.current = requestAnimationFrame(draw);
            analyser.getByteTimeDomainData(dataArray);

            canvasCtx.fillStyle = '#ffffff';
            canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
            canvasCtx.lineWidth = 2.5;
            canvasCtx.strokeStyle = '#3b82f6';
            canvasCtx.beginPath();

            const sliceWidth = canvas.width * 1.0 / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * (canvas.height / 2);
                if (i === 0) canvasCtx.moveTo(x, y);
                else canvasCtx.lineTo(x, y);
                x += sliceWidth;
            }
            canvasCtx.lineTo(canvas.width, canvas.height / 2);
            canvasCtx.stroke();
        };
        draw();
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') await audioCtx.resume();
            
            const analyser = audioCtx.createAnalyser();
            const source = audioCtx.createMediaStreamSource(stream);
            source.connect(analyser);
            analyser.fftSize = 2048;
            analyserRef.current = analyser;

            liveTranscriptRef.current = "";
            setTranscriptionText("");

            // Apuntamos al backend de Simon en Render (usando wss para conexión segura)
            const wsUrl = import.meta.env.VITE_WS_URL || 'wss://contactcenter-1.onrender.com/api/ws/transcribe';
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => console.log("WS conectado");
            ws.onerror = (e) => console.error("WS Error:", e);
            ws.onclose = () => console.log("WS cerrado");

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                console.log("WS recibe:", data);
                if (data.type === 'transcript' && data.text) {
                    liveTranscriptRef.current += " " + data.text;
                    setTranscriptionText(liveTranscriptRef.current);
                } else if (data.type === 'error') {
                    console.error("Error desde el servidor WS:", data.message);
                }
            };

            audioChunksRef.current = [];
            setIsRecording(true);
            setDuration(0);
            
            const startDiscreteChunk = () => {
                // If stopped globally, don't start a new one
                if (!streamRef.current || streamRef.current.getTracks()[0].readyState === 'ended') return;

                const recorder = new MediaRecorder(streamRef.current);
                const chunks = [];
                
                recorder.ondataavailable = (event) => {
                    if (event.data.size > 0) chunks.push(event.data);
                };

                recorder.onstop = () => {
                    const blob = new Blob(chunks, { type: 'audio/webm' });
                    audioChunksRef.current.push(blob);
                    
                    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                        wsRef.current.send(blob);
                    }
                };

                recorder.start();
                mediaRecorderRef.current = recorder;

                setTimeout(() => {
                    if (recorder.state === 'recording') {
                        recorder.stop();
                        // start next chunk only if we are still recording globally
                        // (we'll check a ref or state inside startDiscreteChunk next tick)
                        setTimeout(startDiscreteChunk, 10);
                    }
                }, 5000);
            };

            startDiscreteChunk();
            
            timerRef.current = setInterval(() => setDuration(prev => prev + 1), 1000);
            setTimeout(() => drawWaveform(), 50);

        } catch (err) {
            console.error("Error accessing mic:", err);
            alert("No se pudo acceder al micrófono. Revise los permisos.");
        }
    };

    const stopRecording = () => {
        if (isRecording) {
            setIsRecording(false); // Flags startDiscreteChunk to stop looping next time
            
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
            
            clearInterval(timerRef.current);
            if (animationRef.current) cancelAnimationFrame(animationRef.current);

            // Esperamos 3 segundos para asegurar que el backend de Python tenga tiempo 
            // de procesar con Whisper el último pedacito de audio antes de cerrar el WebSocket.
            setTimeout(async () => {
                const finalAudioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
                if (wsRef.current) wsRef.current.close();
                
                await processAudioBlob(finalAudioBlob, 'webm', liveTranscriptRef.current);
            }, 3000);
        }
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const processAudioBlob = async (blob, customExt = 'webm', liveTranscript = null) => {
        try {
            const entrevistaId = uuidv4();
            const fileName = `${entrevistaId}.${customExt}`;
            const durationSecs = duration;

            // 1. Upload to Storage
            setProcessingState('uploading');
            const { error: uploadError } = await supabase.storage
                .from('gobernanza_audios')
                .upload(fileName, blob, {
                    contentType: blob.type || 'audio/webm'
                });
            
            if (uploadError) throw new Error(`Error subiendo audio: ${uploadError.message}`);

            // 2. Create Database Record
            const { error: dbError } = await supabase
                .from('gobernanza_entrevistas')
                .insert({
                    id: entrevistaId,
                    usuario_id: currentUser?.id,
                    plantilla_id: selectedPlantilla.id,
                    audio_url: fileName,
                    duracion_segundos: durationSecs,
                    estado: 'procesando'
                });

            if (dbError) throw new Error(`Error creando registro en DB: ${dbError.message}`);

            // 3. Invoke Edge Function (Backend Processing)
            setProcessingState('analyzing');
            
            if (liveTranscript && liveTranscript.trim().length > 0) {
                // Ya tenemos la transcripción en vivo por WebSockets, pasamos directo al análisis
                const { data: edgeData, error: edgeError } = await supabase.functions.invoke('gobernanza-ai', {
                    body: { 
                        action: 'analyze_text', 
                        payload: {
                            entrevista_id: entrevistaId,
                            plantilla_id: selectedPlantilla.id,
                            transcript_text: liveTranscript
                        }
                    }
                });

                if (edgeError) throw new Error(`Error en IA: ${edgeError.message}`);
                if (edgeData?.error) throw new Error(edgeData.error);
                
                const url = URL.createObjectURL(blob);
                setAudioUrl(url);
                setResultData(edgeData.aiResponse);
                setProcessingState(null);
            } else {
                // Fallback (ej: subida manual o WS falló)
                const pollId = setInterval(async () => {
                    const { data: checkData } = await supabase
                        .from('gobernanza_entrevistas')
                        .select('estado, transcripcion, resumen, respuestas_cuestionario, mapa_conceptual_mermaid, minutas')
                        .eq('id', entrevistaId)
                        .single();

                    if (checkData && checkData.estado === 'completado') {
                        clearInterval(pollId);
                        
                        const url = URL.createObjectURL(blob);
                        setAudioUrl(url);
                        setTranscriptionText(checkData.transcripcion || "");
                        setResultData({
                            resumen: checkData.resumen,
                            respuestas: checkData.respuestas_cuestionario,
                            mapa_conceptual_mermaid: checkData.mapa_conceptual_mermaid,
                            minutas: checkData.minutas
                        });
                        setProcessingState(null);
                    }
                }, 5000);
                
                setPollIntervalId(pollId);

                try {
                    await supabase.functions.invoke('gobernanza-ai', {
                        body: { 
                            action: 'transcribe_and_analyze', 
                            payload: {
                                entrevista_id: entrevistaId,
                                plantilla_id: selectedPlantilla.id,
                                audio_path: fileName
                            }
                        }
                    });
                } catch (err) {
                    console.warn("La llamada directa a la función dio timeout o error, confiando en el polling...", err);
                }
            }
        } catch (error) {
            console.error("Error general:", error);
            alert("Error al procesar: " + error.message + "\n\nEl backend podría continuar en 2do plano.");
            setProcessingState(null);
            setDuration(0); 
        }
    };

    const handleUploadAudio = async () => {
        if (!selectedFile) return;
        const ext = selectedFile.name.split('.').pop() || 'mp3';
        await processAudioBlob(selectedFile, ext);
    };

    const handleTextSubmit = async () => {
        if (!manualText.trim()) return;
        try {
            setProcessingState('analyzing');
            const entrevistaId = uuidv4();
            
            // Invoke Edge Function for text analysis directly
            const { data: edgeData, error: edgeError } = await supabase.functions.invoke('gobernanza-ai', {
                body: { 
                    action: 'analyze_text', 
                    payload: {
                        entrevista_id: entrevistaId,
                        plantilla_id: selectedPlantilla.id,
                        transcript_text: manualText
                    }
                }
            });

            if (edgeError) throw new Error(`Timeout o error en IA: ${edgeError.message}`);
            if (edgeData?.error) throw new Error(edgeData.error);

            setTranscriptionText(edgeData.transcript);
            setResultData(edgeData.aiResponse);
            setProcessingState(null);

        } catch (error) {
            console.error("Error en análisis de texto:", error);
            alert("Error al analizar el texto: " + error.message);
            setProcessingState(null);
        }
    };

    const resetView = () => {
        if (pollIntervalId) clearInterval(pollIntervalId);
        setSelectedPlantilla(null);
        setResultData(null);
        setTranscriptionText("");
        setDuration(0);
        setSelectedFile(null);
        setManualText('');
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
        setPollIntervalId(null);
    };

    // --- TEMPLATE MANAGER FUNCTIONS ---
    const handleAddQuestion = () => {
        setNewTemplateQuestions([...newTemplateQuestions, ""]);
    };

    const handleRemoveQuestion = (index) => {
        const updated = newTemplateQuestions.filter((_, i) => i !== index);
        setNewTemplateQuestions(updated);
    };

    const handleQuestionChange = (index, value) => {
        const updated = [...newTemplateQuestions];
        updated[index] = value;
        setNewTemplateQuestions(updated);
    };

    const handleSaveTemplate = async () => {
        if (!newTemplateName.trim()) return alert("El nombre de la plantilla es obligatorio.");
        const validQuestions = newTemplateQuestions.filter(q => q.trim() !== "");
        if (validQuestions.length === 0) return alert("Debes añadir al menos una pregunta.");

        setIsSavingTemplate(true);
        try {
            const { error } = await supabase
                .from('gobernanza_plantillas')
                .insert({
                    id: uuidv4(),
                    nombre: newTemplateName.trim(),
                    preguntas: validQuestions,
                    created_by: currentUser?.id
                });
            
            if (error) throw error;
            
            setIsCreatingTemplate(false);
            setNewTemplateName("");
            setNewTemplateQuestions([""]);
            await refreshPlantillas();
        } catch (error) {
            console.error("Error saving template:", error);
            alert("Error al guardar la plantilla: " + error.message);
        } finally {
            setIsSavingTemplate(false);
        }
    };

    // VISTA: CREADOR DE PLANTILLAS
    if (isCreatingTemplate) {
        return (
            <div style={{ padding: '32px', maxWidth: '800px', margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
                    <button onClick={() => setIsCreatingTemplate(false)} style={{ background: 'none', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }}>
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#0f172a', fontWeight: 700 }}>Crear Nueva Plantilla</h2>
                        <span style={{ fontSize: '0.9rem', color: '#64748b' }}>Añade y numera las preguntas que el auditor deberá hacer.</span>
                    </div>
                </div>

                <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '32px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', fontSize: '0.95rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>Nombre de la Plantilla</label>
                        <input 
                            type="text" 
                            value={newTemplateName}
                            onChange={(e) => setNewTemplateName(e.target.value)}
                            placeholder="Ej: Auditoría de Acceso a Servidores"
                            style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '1rem', outline: 'none' }}
                        />
                    </div>

                    <div style={{ marginBottom: '32px' }}>
                        <label style={{ display: 'block', fontSize: '0.95rem', fontWeight: 600, color: '#334155', marginBottom: '16px' }}>Preguntas a evaluar</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {newTemplateQuestions.map((q, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <span style={{ fontWeight: 700, color: '#94a3b8', width: '24px', textAlign: 'right' }}>{i + 1}.</span>
                                    <input 
                                        type="text"
                                        value={q}
                                        onChange={(e) => handleQuestionChange(i, e.target.value)}
                                        placeholder={`Pregunta número ${i + 1}`}
                                        style={{ flex: 1, padding: '10px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem', outline: 'none' }}
                                    />
                                    {newTemplateQuestions.length > 1 && (
                                        <button onClick={() => handleRemoveQuestion(i)} style={{ background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '8px', padding: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                            <Trash2 size={18} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        
                        <button onClick={handleAddQuestion} style={{ marginTop: '16px', background: 'transparent', color: '#3b82f6', border: '1px dashed #bfdbfe', borderRadius: '8px', padding: '10px 16px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'center' }}>
                            <Plus size={18} /> Añadir otra pregunta
                        </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '24px' }}>
                        <button disabled={isSavingTemplate} onClick={handleSaveTemplate} style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', padding: '12px 24px', fontWeight: 600, cursor: isSavingTemplate ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: isSavingTemplate ? 0.7 : 1 }}>
                            {isSavingTemplate ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                            {isSavingTemplate ? "Guardando..." : "Guardar Plantilla"}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // VISTA 1: Lista de Plantillas
    if (!selectedPlantilla) {
        return (
            <div style={{ padding: '32px', width: '100%', fontFamily: "'Inter', sans-serif" }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <div style={{ background: '#eff6ff', padding: '10px', borderRadius: '12px', color: '#3b82f6' }}>
                        <ShieldCheck size={28} />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.8rem', color: '#0f172a', fontWeight: 700 }}>Gobernanza de Datos</h1>
                        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '1rem' }}>Seleccione una plantilla institucional para iniciar la auditoría/entrevista.</p>
                    </div>
                </div>

                <div style={{ marginTop: '40px' }}>
                    {loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Loader2 className="animate-spin" size={36} color="#94a3b8" /></div>
                    ) : plantillas.length === 0 ? (
                        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '40px', textAlign: 'center', color: '#64748b' }}>
                            <ShieldCheck size={48} color="#cbd5e1" style={{ margin: '0 auto 16px' }} />
                            <h3 style={{ margin: '0 0 8px', color: '#334155', fontSize: '1.1rem' }}>No hay plantillas disponibles</h3>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
                            
                            {/* Card: Crear Nueva Plantilla */}
                            <div onClick={() => setIsCreatingTemplate(true)} style={{ background: '#f8fafc', border: '2px dashed #cbd5e1', borderRadius: '12px', padding: '32px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', transition: 'all 0.2s', minHeight: '180px' }} onMouseOver={e => { e.currentTarget.style.borderColor = '#93c5fd'; e.currentTarget.style.background = '#eff6ff'; }} onMouseOut={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#f8fafc'; }}>
                                <div style={{ background: 'white', padding: '12px', borderRadius: '50%', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                                    <Plus size={24} color="#3b82f6" />
                                </div>
                                <h3 style={{ margin: 0, color: '#3b82f6', fontSize: '1.1rem', fontWeight: 600 }}>Crear Nueva Plantilla</h3>
                            </div>

                            {plantillas.map(t => (
                                <div key={t.id} onClick={() => setSelectedPlantilla(t)} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '32px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: '20px' }} onMouseOver={e => { e.currentTarget.style.borderColor = '#93c5fd'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.1)'; }} onMouseOut={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.03)'; }}>
                                    <div>
                                        <h3 style={{ margin: '0 0 12px', color: '#1e293b', fontSize: '1.25rem', fontWeight: 700 }}>{t.nombre}</h3>
                                        <span style={{ display: 'inline-block', padding: '6px 12px', background: '#f1f5f9', color: '#475569', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600 }}>{t.preguntas ? t.preguntas.length : 0} Preguntas a evaluar</span>
                                    </div>
                                    <div style={{ marginTop: 'auto', alignSelf: 'flex-start', color: '#3b82f6', fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>Comenzar Auditoría <ChevronRight size={18} /></div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // VISTA 2: Grabación / Resultados
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc', fontFamily: "'Inter', sans-serif" }}>
            <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                {(!isRecording && !processingState) && (
                    <button onClick={resetView} style={{ background: 'none', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'} onMouseOut={e => e.currentTarget.style.background = 'none'}>
                        <ArrowLeft size={20} />
                    </button>
                )}
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontWeight: 700 }}>{selectedPlantilla.nombre}</h2>
                    <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>
                        {isRecording ? '● Grabando audio...' : processingState ? 'Trabajando en el Backend...' : resultData ? 'Análisis completado' : 'Lista para iniciar'}
                    </span>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {!resultData ? (
                    <div style={{ width: '100%', maxWidth: '700px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        
                        {processingState ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#3b82f6', gap: '16px', textAlign: 'center', marginTop: '60px' }}>
                                <Loader2 size={48} className="animate-spin" />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                                        {processingState === 'uploading' ? 'Subiendo datos seguros a Supabase...' : 'Analizando charla con Inteligencia Artificial...'}
                                    </span>
                                    {processingState === 'analyzing' && <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Generando minutas, mapa conceptual y respuestas...</span>}
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Modo Selector */}
                                <div style={{ display: 'flex', gap: '8px', background: '#e2e8f0', padding: '4px', borderRadius: '12px', marginBottom: '40px' }}>
                                    <button onClick={() => setInputMode('record')} style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, background: inputMode === 'record' ? 'white' : 'transparent', color: inputMode === 'record' ? '#0f172a' : '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}><Mic size={16}/> Grabar</button>
                                    <button onClick={() => setInputMode('upload')} style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, background: inputMode === 'upload' ? 'white' : 'transparent', color: inputMode === 'upload' ? '#0f172a' : '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}><UploadCloud size={16}/> Subir Audio</button>
                                    <button onClick={() => setInputMode('text')} style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, background: inputMode === 'text' ? 'white' : 'transparent', color: inputMode === 'text' ? '#0f172a' : '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}><Type size={16}/> Pegar Texto</button>
                                </div>

                                {/* Modo: Grabar */}
                                {inputMode === 'record' && (
                                    <>
                                        <div style={{ fontSize: '4.5rem', fontWeight: 300, color: duration > 1680 ? '#f59e0b' : isRecording ? '#ef4444' : '#334155', fontVariantNumeric: 'tabular-nums', letterSpacing: '-2px', marginBottom: '8px', transition: 'color 0.3s' }}>
                                            {formatTime(duration)}
                                        </div>
                                        <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '24px', fontWeight: 500 }}>
                                            Tiempo máximo recomendado: 30 minutos
                                        </div>

                                        <div style={{ width: '100%', height: '140px', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)', position: 'relative', overflow: 'hidden', marginBottom: '40px', opacity: (!isRecording && duration === 0) ? 0.6 : 1 }}>
                                            <canvas ref={canvasRef} width="700" height="140" style={{ width: '100%', height: '100%', display: 'block' }} />
                                            {(!isRecording && duration === 0) && (
                                                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.9rem', fontWeight: 500 }}>
                                                    <Mic size={18} style={{ marginRight: '8px' }} /> El espectro de audio aparecerá al grabar
                                                </div>
                                            )}
                                        </div>

                                        {!isRecording ? (
                                            <button onClick={startRecording} style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '30px', padding: '16px 40px', fontSize: '1.1rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)', transition: 'transform 0.2s, background 0.2s' }} onMouseOver={e => e.currentTarget.style.background = '#2563eb'} onMouseOut={e => e.currentTarget.style.background = '#3b82f6'} onMouseDown={e => e.currentTarget.style.transform = 'scale(0.96)'} onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}>
                                                <Play size={22} fill="white" /> Iniciar Entrevista
                                            </button>
                                        ) : (
                                            <button onClick={stopRecording} style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '30px', padding: '16px 40px', fontSize: '1.1rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)', animation: 'pulse 2s infinite' }}>
                                                <Square size={22} fill="white" /> Detener y Analizar
                                            </button>
                                        )}
                                    </>
                                )}

                                {/* Modo: Subir Archivo */}
                                {inputMode === 'upload' && (
                                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'white', padding: '40px', borderRadius: '16px', border: '2px dashed #cbd5e1' }}>
                                        <UploadCloud size={48} color="#94a3b8" style={{ marginBottom: '16px' }} />
                                        <input type="file" accept="audio/mp3, audio/wav, audio/webm" onChange={handleFileChange} style={{ marginBottom: '24px' }} />
                                        <button disabled={!selectedFile} onClick={handleUploadAudio} style={{ background: selectedFile ? '#3b82f6' : '#cbd5e1', color: 'white', border: 'none', borderRadius: '8px', padding: '12px 24px', fontWeight: 600, cursor: selectedFile ? 'pointer' : 'not-allowed' }}>
                                            Analizar Audio
                                        </button>
                                    </div>
                                )}

                                {/* Modo: Pegar Texto */}
                                {inputMode === 'text' && (
                                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
                                        <textarea 
                                            value={manualText}
                                            onChange={e => setManualText(e.target.value)}
                                            placeholder="Pega aquí la transcripción de la entrevista..."
                                            style={{ width: '100%', height: '200px', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '0.95rem', fontFamily: "'Inter', sans-serif", resize: 'vertical', marginBottom: '16px' }}
                                        />
                                        <button disabled={!manualText.trim()} onClick={handleTextSubmit} style={{ background: manualText.trim() ? '#3b82f6' : '#cbd5e1', color: 'white', border: 'none', borderRadius: '8px', padding: '12px 24px', fontWeight: 600, cursor: manualText.trim() ? 'pointer' : 'not-allowed', alignSelf: 'flex-end' }}>
                                            Analizar Texto
                                        </button>
                                    </div>
                                )}
                                
                                <div style={{ width: '100%', marginTop: '60px', borderTop: '1px solid #e2e8f0', paddingTop: '24px' }}>
                                    <h4 style={{ color: '#64748b', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>Transcripción en Vivo</h4>
                                    <div style={{ background: '#f1f5f9', padding: '16px', borderRadius: '12px', minHeight: '100px', color: transcriptionText ? '#0f172a' : '#94a3b8', fontSize: '0.95rem', fontStyle: transcriptionText ? 'normal' : 'italic', lineHeight: 1.6, border: '1px solid #e2e8f0' }}>
                                        {transcriptionText || "La transcripción aparecerá aquí en tiempo real a medida que hables..."}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    <div style={{ width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        
                        {/* Resumen */}
                        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', color: '#10b981' }}>
                                <CheckCircle2 size={24} />
                                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>Análisis y Resumen</h3>
                            </div>
                            <p style={{ margin: 0, color: '#475569', fontSize: '1rem', lineHeight: 1.6 }}>{resultData.resumen}</p>
                        </div>

                        {/* Minutas */}
                        {(resultData.minutas && resultData.minutas.length > 0) && (
                            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                <h4 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}><List size={20} color="#f59e0b" /> Puntos Clave (Minutas)</h4>
                                <ul style={{ margin: 0, paddingLeft: '20px', color: '#334155', lineHeight: 1.6 }}>
                                    {resultData.minutas.map((m, i) => <li key={i} style={{ marginBottom: '8px' }}>{m}</li>)}
                                </ul>
                            </div>
                        )}

                        {/* Mapa Conceptual Mermaid */}
                        {resultData.mapa_conceptual_mermaid && (
                            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                <h4 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}><Network size={20} color="#8b5cf6" /> Mapa Conceptual</h4>
                                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', overflowX: 'auto', display: 'flex', justifyContent: 'center' }}>
                                    <div className="mermaid" ref={mermaidRef}>
                                        {resultData.mapa_conceptual_mermaid}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Cuestionario */}
                        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                            <h4 style={{ margin: '0 0 20px', fontSize: '1.1rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}><BrainCircuit size={20} color="#3b82f6" /> Mapeo de Respuestas</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {(resultData.respuestas || []).map((item, idx) => (
                                    <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                                        <div style={{ fontWeight: 600, color: '#334155', marginBottom: '8px', fontSize: '0.95rem' }}>Q: {item.pregunta}</div>
                                        <div style={{ color: '#0f172a', fontSize: '0.95rem', lineHeight: 1.5 }}>A: {item.respuesta}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Transcripción */}
                        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                            <h4 style={{ margin: '0 0 20px', fontSize: '1.1rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}><FileText size={20} color="#64748b" /> Transcripción Original</h4>
                            
                            {audioUrl && (
                                <div style={{ marginBottom: '16px' }}>
                                    <audio controls src={audioUrl} style={{ width: '100%', height: '40px' }} />
                                </div>
                            )}

                            <div style={{ background: '#f1f5f9', padding: '16px', borderRadius: '8px', color: '#475569', fontSize: '0.9rem', fontStyle: 'italic', lineHeight: 1.6 }}>"{transcriptionText}"</div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
                            <button onClick={resetView} style={{ background: 'white', color: '#3b82f6', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px 24px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}>Realizar Nueva Auditoría</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
