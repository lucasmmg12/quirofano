import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Play, Square, ChevronRight, Mic, Loader2, ArrowLeft, ShieldCheck, CheckCircle2, FileText, UploadCloud, BrainCircuit } from 'lucide-react';

// ==========================================
// OpenAI Services
// ==========================================
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

async function transcribeAudio(audioBlob) {
    const formData = new FormData();
    // Use .webm as the file extension since MediaRecorder usually produces webm in modern browsers
    formData.append('file', audioBlob, 'recording.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', 'es');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: formData
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error en transcripción: ${errText}`);
    }
    const data = await res.json();
    return data.text;
}

async function analyzeTranscription(transcription, preguntas) {
    const systemPrompt = `
Eres un asistente experto en auditoría y gobernanza de datos para el Sanatorio Argentino.
Te proveeré la transcripción literal de una entrevista y la lista de preguntas que se debían responder.
Tu tarea es:
1. Extraer las respuestas específicas que dio el usuario para cada una de las preguntas de la plantilla, basándote SOLO en la transcripción.
2. Si una pregunta no fue respondida, indícalo claramente (ej: "No especificado en el audio").
3. Redactar un 'resumen' gerencial (1 párrafo) de los hallazgos principales.

Responde estrictamente en este formato JSON:
{
  "resumen": "Resumen general...",
  "respuestas": [
    { "pregunta": "Pregunta 1", "respuesta": "Lo que dijo el usuario..." },
    { "pregunta": "Pregunta 2", "respuesta": "Lo que dijo..." }
  ]
}
`;

    const userPrompt = `
PREGUNTAS DE LA PLANTILLA:
${JSON.stringify(preguntas)}

TRANSCRIPCIÓN DEL AUDIO:
"${transcription}"
`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0.2
        })
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error en análisis: ${errText}`);
    }
    const data = await res.json();
    return JSON.parse(data.choices[0].message.content);
}


// ==========================================
// Component: GobernanzaPanel
// ==========================================
export default function GobernanzaPanel({ currentUser }) {
    const [plantillas, setPlantillas] = useState([]);
    const [selectedPlantilla, setSelectedPlantilla] = useState(null);
    const [loading, setLoading] = useState(true);

    // Recording states
    const [isRecording, setIsRecording] = useState(false);
    const [duration, setDuration] = useState(0);
    const [audioUrl, setAudioUrl] = useState(null);
    const [processingState, setProcessingState] = useState(null); // 'transcribing', 'analyzing', null
    const [resultData, setResultData] = useState(null);
    const [transcriptionText, setTranscriptionText] = useState("");

    // Refs
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const canvasRef = useRef(null);
    const animationRef = useRef(null);
    const analyserRef = useRef(null);
    const timerRef = useRef(null);
    const streamRef = useRef(null);

    // Initial Fetch
    useEffect(() => {
        const fetchPlantillas = async () => {
            try {
                const { data, error } = await supabase
                    .from('gobernanza_plantillas')
                    .select('*')
                    .order('created_at', { ascending: false });
                
                if (error) throw error;
                
                if (data && data.length > 0) {
                    setPlantillas(data);
                } else {
                    setPlantillas([]); // If SQL wasn't run, it stays empty
                }
            } catch (err) {
                console.error("Error fetching plantillas:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchPlantillas();
    }, []);

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
            if (!isRecording) return;
            animationRef.current = requestAnimationFrame(draw);
            analyser.getByteTimeDomainData(dataArray);

            canvasCtx.fillStyle = '#ffffff';
            canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
            canvasCtx.lineWidth = 2.5;
            canvasCtx.strokeStyle = '#3b82f6'; // Sanatorio Blue
            canvasCtx.beginPath();

            const sliceWidth = canvas.width * 1.0 / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * (canvas.height / 2);
                if (i === 0) {
                    canvasCtx.moveTo(x, y);
                } else {
                    canvasCtx.lineTo(x, y);
                }
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
            const analyser = audioCtx.createAnalyser();
            const source = audioCtx.createMediaStreamSource(stream);
            source.connect(analyser);
            analyser.fftSize = 2048;
            analyserRef.current = analyser;

            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const url = URL.createObjectURL(audioBlob);
                setAudioUrl(url);
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach(track => track.stop());
                }
                
                await handleAudioUpload(audioBlob);
            };

            mediaRecorder.start();
            setIsRecording(true);
            setDuration(0);
            
            timerRef.current = setInterval(() => {
                setDuration(prev => prev + 1);
            }, 1000);

            // Give canvas a tiny delay to mount if needed
            setTimeout(() => { drawWaveform(); }, 50);

        } catch (err) {
            console.error("Error accessing mic:", err);
            alert("No se pudo acceder al micrófono. Revise los permisos de su navegador.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            clearInterval(timerRef.current);
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        }
    };

    const handleAudioUpload = async (blob) => {
        if (!OPENAI_API_KEY) {
            alert("Error: No se encontró la clave de OpenAI (VITE_OPENAI_API_KEY) en el entorno.");
            return;
        }

        try {
            // 1. Transcribir
            setProcessingState('transcribing');
            const transcription = await transcribeAudio(blob);
            setTranscriptionText(transcription);

            // 2. Analizar
            setProcessingState('analyzing');
            const analisis = await analyzeTranscription(transcription, selectedPlantilla.preguntas);
            setResultData(analisis);
            
            setProcessingState(null);
            
            // TODO: Guardar en Supabase (gobernanza_entrevistas y storage)

        } catch (error) {
            console.error("Error en flujo de IA:", error);
            alert("Error al procesar la entrevista con IA: " + error.message);
            setProcessingState(null);
        }
    };

    const resetView = () => {
        setSelectedPlantilla(null);
        setResultData(null);
        setAudioUrl(null);
        setTranscriptionText("");
        setDuration(0);
    };

    // VISTA 1: Lista de Plantillas (Estética Sanatorio)
    if (!selectedPlantilla) {
        return (
            <div style={{ padding: '32px', maxWidth: '1000px', margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <div style={{ background: '#eff6ff', padding: '10px', borderRadius: '12px', color: '#3b82f6' }}>
                        <ShieldCheck size={28} />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.6rem', color: '#0f172a', fontWeight: 700 }}>Gobernanza de Datos</h1>
                        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.95rem' }}>Seleccione una plantilla institucional para iniciar la auditoría/entrevista.</p>
                    </div>
                </div>

                <div style={{ marginTop: '40px' }}>
                    {loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                            <Loader2 className="animate-spin" size={36} color="#94a3b8" />
                        </div>
                    ) : plantillas.length === 0 ? (
                        <div style={{ 
                            background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', 
                            padding: '40px', textAlign: 'center', color: '#64748b' 
                        }}>
                            <ShieldCheck size={48} color="#cbd5e1" style={{ margin: '0 auto 16px' }} />
                            <h3 style={{ margin: '0 0 8px', color: '#334155', fontSize: '1.1rem' }}>No hay plantillas disponibles</h3>
                            <p style={{ margin: 0, fontSize: '0.9rem' }}>Debe ejecutar el script de migración SQL en Supabase para cargar las plantillas de Gobernanza.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
                            {plantillas.map(t => (
                                <div 
                                    key={t.id} 
                                    onClick={() => setSelectedPlantilla(t)}
                                    style={{
                                        background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px',
                                        padding: '24px', cursor: 'pointer', transition: 'all 0.2s',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                        display: 'flex', flexDirection: 'column', gap: '16px'
                                    }}
                                    onMouseOver={e => { e.currentTarget.style.borderColor = '#93c5fd'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.08)'; }}
                                    onMouseOut={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)'; }}
                                >
                                    <div>
                                        <h3 style={{ margin: '0 0 8px', color: '#1e293b', fontSize: '1.1rem', fontWeight: 600 }}>{t.nombre}</h3>
                                        <span style={{ 
                                            display: 'inline-block', padding: '4px 10px', background: '#f1f5f9', 
                                            color: '#475569', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 
                                        }}>
                                            {t.preguntas ? t.preguntas.length : 0} Preguntas
                                        </span>
                                    </div>
                                    <div style={{ marginTop: 'auto', alignSelf: 'flex-start', color: '#3b82f6', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        Comenzar Auditoría <ChevronRight size={16} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // VISTA 2: Grabación o Resultados
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc', fontFamily: "'Inter', sans-serif" }}>
            
            {/* Header Toolbar */}
            <div style={{ 
                background: 'white', borderBottom: '1px solid #e2e8f0', padding: '16px 24px',
                display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0
            }}>
                {(!isRecording && !processingState) && (
                    <button 
                        onClick={resetView}
                        style={{ background: 'none', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'}
                        onMouseOut={e => e.currentTarget.style.background = 'none'}
                    >
                        <ArrowLeft size={20} />
                    </button>
                )}
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontWeight: 700 }}>{selectedPlantilla.nombre}</h2>
                    <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>
                        {isRecording ? '● Grabando audio...' : processingState ? 'Procesando con IA...' : resultData ? 'Entrevista completada' : 'Lista para iniciar'}
                    </span>
                </div>
            </div>

            {/* Content Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                
                {!resultData ? (
                    <div style={{ width: '100%', maxWidth: '700px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        
                        {/* Temporizador */}
                        <div style={{ 
                            fontSize: '4.5rem', fontWeight: 300, color: isRecording ? '#ef4444' : '#334155', 
                            fontVariantNumeric: 'tabular-nums', letterSpacing: '-2px', marginBottom: '32px',
                            transition: 'color 0.3s'
                        }}>
                            {formatTime(duration)}
                        </div>

                        {/* Waveform Canvas */}
                        <div style={{ 
                            width: '100%', height: '140px', background: 'white', borderRadius: '16px', 
                            border: '1px solid #e2e8f0', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)',
                            position: 'relative', overflow: 'hidden', marginBottom: '40px',
                            opacity: (!isRecording && duration === 0) ? 0.6 : 1
                        }}>
                            <canvas ref={canvasRef} width="700" height="140" style={{ width: '100%', height: '100%', display: 'block' }} />
                            {(!isRecording && duration === 0) && (
                                <div style={{ 
                                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', 
                                    justifyContent: 'center', color: '#94a3b8', fontSize: '0.9rem', fontWeight: 500 
                                }}>
                                    <Mic size={18} style={{ marginRight: '8px' }} /> El espectro de audio aparecerá al grabar
                                </div>
                            )}
                        </div>

                        {/* Controles Principales */}
                        {processingState ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#3b82f6', gap: '16px' }}>
                                <Loader2 size={48} className="animate-spin" />
                                <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                                    {processingState === 'transcribing' ? '1/2: Transcribiendo audio con Whisper...' : '2/2: Analizando respuestas con GPT-4...'}
                                </span>
                            </div>
                        ) : !isRecording ? (
                            <button 
                                onClick={startRecording}
                                style={{ 
                                    background: '#3b82f6', color: 'white', border: 'none', borderRadius: '30px',
                                    padding: '16px 40px', fontSize: '1.1rem', fontWeight: 600, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                                    transition: 'transform 0.2s, background 0.2s'
                                }}
                                onMouseOver={e => e.currentTarget.style.background = '#2563eb'}
                                onMouseOut={e => e.currentTarget.style.background = '#3b82f6'}
                                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
                                onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                <Play size={22} fill="white" /> Iniciar Entrevista
                            </button>
                        ) : (
                            <button 
                                onClick={stopRecording}
                                style={{ 
                                    background: '#ef4444', color: 'white', border: 'none', borderRadius: '30px',
                                    padding: '16px 40px', fontSize: '1.1rem', fontWeight: 600, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
                                    animation: 'pulse 2s infinite'
                                }}
                            >
                                <Square size={22} fill="white" /> Detener y Analizar
                            </button>
                        )}
                        
                        {/* Preguntas de referencia */}
                        <div style={{ width: '100%', marginTop: '60px', borderTop: '1px solid #e2e8f0', paddingTop: '24px' }}>
                            <h4 style={{ color: '#64748b', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>Preguntas a realizar</h4>
                            <ul style={{ margin: 0, padding: '0 0 0 20px', color: '#475569', fontSize: '0.95rem', lineHeight: 1.6 }}>
                                {(selectedPlantilla.preguntas || []).map((q, i) => (
                                    <li key={i} style={{ marginBottom: '8px' }}>{q}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                ) : (
                    /* ====== RESULTADOS ====== */
                    <div style={{ width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        
                        {/* Tarjeta de Resumen */}
                        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', color: '#10b981' }}>
                                <CheckCircle2 size={24} />
                                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>Análisis Completado</h3>
                            </div>
                            <p style={{ margin: 0, color: '#475569', fontSize: '1rem', lineHeight: 1.6 }}>
                                {resultData.resumen}
                            </p>
                        </div>

                        {/* Mapeo de Respuestas */}
                        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                            <h4 style={{ margin: '0 0 20px', fontSize: '1.1rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <BrainCircuit size={20} color="#3b82f6" />
                                Mapeo de Respuestas
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {(resultData.respuestas || []).map((item, idx) => (
                                    <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                                        <div style={{ fontWeight: 600, color: '#334155', marginBottom: '8px', fontSize: '0.95rem' }}>
                                            Q: {item.pregunta}
                                        </div>
                                        <div style={{ color: '#0f172a', fontSize: '0.95rem', lineHeight: 1.5 }}>
                                            A: {item.respuesta}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Transcripción Original */}
                        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                            <h4 style={{ margin: '0 0 20px', fontSize: '1.1rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FileText size={20} color="#64748b" />
                                Transcripción Original (Whisper)
                            </h4>
                            <div style={{ background: '#f1f5f9', padding: '16px', borderRadius: '8px', color: '#475569', fontSize: '0.9rem', fontStyle: 'italic', lineHeight: 1.6 }}>
                                "{transcriptionText}"
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
                            <button 
                                onClick={resetView}
                                style={{ 
                                    background: 'white', color: '#3b82f6', border: '1px solid #bfdbfe', borderRadius: '8px',
                                    padding: '12px 24px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer',
                                }}
                            >
                                Volver a Plantillas
                            </button>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
