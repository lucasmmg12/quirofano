import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Play, Square, ChevronRight, Mic, Loader2, ArrowLeft, BrainCircuit } from 'lucide-react';

export default function GobernanzaPanel({ currentUser }) {
    const [plantillas, setPlantillas] = useState([]);
    const [selectedPlantilla, setSelectedPlantilla] = useState(null);
    const [loading, setLoading] = useState(true);

    // Recording states
    const [isRecording, setIsRecording] = useState(false);
    const [duration, setDuration] = useState(0);
    const [audioUrl, setAudioUrl] = useState(null);
    const [processing, setProcessing] = useState(false);
    const [resultData, setResultData] = useState(null);

    // Refs for recording and canvas
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const canvasRef = useRef(null);
    const animationRef = useRef(null);
    const analyserRef = useRef(null);
    const timerRef = useRef(null);

    // Fetch Plantillas on mount
    useEffect(() => {
        const fetchPlantillas = async () => {
            try {
                const { data, error } = await supabase
                    .from('gobernanza_plantillas')
                    .select('*')
                    .order('created_at', { ascending: false });
                
                if (error) throw error;
                // Si la tabla está vacía, mostrar una de ejemplo en memoria
                if (data && data.length > 0) {
                    setPlantillas(data);
                } else {
                    setPlantillas([
                        { id: '1', nombre: 'Entrevista de Gobernanza Básica', preguntas: ["¿Cómo se aseguran los datos?", "¿Quién tiene acceso?"] }
                    ]);
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

            canvasCtx.fillStyle = '#f8fafc'; // background
            canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
            canvasCtx.lineWidth = 2;
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
            
            // Audio Context for Waveform
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
                stream.getTracks().forEach(track => track.stop());
                
                // Procesar Audio
                await handleAudioUpload(audioBlob);
            };

            mediaRecorder.start();
            setIsRecording(true);
            setDuration(0);
            
            // Start timer
            timerRef.current = setInterval(() => {
                setDuration(prev => prev + 1);
            }, 1000);

            // Start waveform drawing
            setTimeout(() => { drawWaveform(); }, 100);

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
        setProcessing(true);
        try {
            // Simulamos el proceso completo ya que Whisper requiere FormData
            // En un entorno real, subiríamos a Supabase Storage y llamaríamos a gobernanza-ai
            console.log("Simulando subida de audio y análisis...");
            
            setTimeout(() => {
                setResultData({
                    resumen: "Durante la entrevista se trataron diversos temas relacionados con la seguridad informática del sanatorio. Se hizo especial énfasis en los respaldos de datos que se realizan de forma diaria y automatizada.",
                    respuestas: [
                        { pregunta: selectedPlantilla.preguntas[0] || "¿Pregunta 1?", respuesta: "Los respaldos se realizan todos los días a las 2 AM." },
                        { pregunta: selectedPlantilla.preguntas[1] || "¿Pregunta 2?", respuesta: "Solo el equipo de infraestructura tiene acceso directo." }
                    ]
                });
                setProcessing(false);
            }, 4000);

        } catch (error) {
            console.error("Error procesando:", error);
            setProcessing(false);
        }
    };

    // VISTA 1: Lista de Plantillas
    if (!selectedPlantilla) {
        return (
            <div className="h-full bg-slate-50 flex flex-col items-center">
                <div className="w-full max-w-2xl bg-white shadow-sm border-b border-slate-200 px-6 py-12 flex flex-col items-center">
                    <div className="bg-slate-900 px-4 py-2 rounded-lg mb-4">
                        <span className="text-white font-bold text-sm tracking-wide">SANATORIO ARGENTINO</span>
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900">Gobernanza de Datos</h1>
                    <p className="text-slate-500 mt-1">Seleccione una plantilla para la entrevista</p>
                </div>

                <div className="w-full max-w-2xl px-6 py-8">
                    {loading ? (
                        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-slate-400" size={32} /></div>
                    ) : (
                        <div className="space-y-4">
                            {plantillas.map(t => (
                                <button 
                                    key={t.id} 
                                    onClick={() => setSelectedPlantilla(t)}
                                    className="w-full bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between hover:border-blue-300 hover:shadow-md transition-all text-left"
                                >
                                    <div>
                                        <h3 className="text-lg font-semibold text-slate-800">{t.nombre}</h3>
                                        <p className="text-sm text-slate-500 mt-1">{t.preguntas ? t.preguntas.length : 0} preguntas configuradas</p>
                                    </div>
                                    <div className="bg-blue-50 text-blue-600 px-4 py-2 rounded-full flex items-center font-semibold text-sm">
                                        Comenzar <ChevronRight size={16} className="ml-1" />
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // VISTA 2: Grabación o Resultados
    return (
        <div className="h-full bg-slate-50 flex flex-col items-center">
            <div className="w-full max-w-2xl bg-white shadow-sm border-b border-slate-200 px-6 py-6 flex items-center relative">
                {(!isRecording && !processing && !resultData) && (
                    <button 
                        onClick={() => setSelectedPlantilla(null)}
                        className="absolute left-6 text-slate-500 hover:text-slate-800"
                    >
                        <ArrowLeft size={24} />
                    </button>
                )}
                <div className="flex-1 text-center">
                    <h2 className="text-xl font-bold text-slate-900">{selectedPlantilla.nombre}</h2>
                    <p className="text-sm text-slate-500">{isRecording ? "Grabando Entrevista" : (resultData ? "Análisis Completado" : "Lista para grabar")}</p>
                </div>
            </div>

            <div className="w-full max-w-2xl px-6 py-12 flex flex-col items-center flex-1">
                {!resultData ? (
                    <>
                        <div className="text-6xl font-light text-slate-800 tabular-nums mb-12 tracking-tighter">
                            {formatTime(duration)}
                        </div>

                        {/* Waveform Canvas */}
                        <div className={`w-full h-32 bg-white rounded-2xl shadow-inner border border-slate-200 flex items-center justify-center mb-12 overflow-hidden ${!isRecording ? 'opacity-50' : ''}`}>
                            <canvas ref={canvasRef} width="600" height="128" className="w-full h-full" />
                            {!isRecording && duration === 0 && (
                                <div className="absolute text-slate-400 font-medium text-sm flex items-center">
                                    <Mic size={16} className="mr-2" /> El micrófono se activará al iniciar
                                </div>
                            )}
                        </div>

                        {processing ? (
                            <div className="flex flex-col items-center space-y-4">
                                <Loader2 size={48} className="animate-spin text-blue-500" />
                                <p className="text-slate-600 font-medium">Beto IA está procesando la entrevista...</p>
                                <p className="text-xs text-slate-400 text-center max-w-xs">Esto puede demorar dependiendo de la duración de la grabación.</p>
                            </div>
                        ) : (
                            <button
                                onClick={isRecording ? stopRecording : startRecording}
                                className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-all transform hover:scale-105 ${isRecording ? 'bg-red-500 shadow-red-500/40' : 'bg-blue-600 shadow-blue-600/40'}`}
                            >
                                {isRecording ? <Square color="white" size={36} fill="white" /> : <Mic color="white" size={40} />}
                            </button>
                        )}
                        
                        {!processing && (
                            <p className={`mt-6 font-medium ${isRecording ? 'text-red-500 animate-pulse' : 'text-slate-500'}`}>
                                {isRecording ? "Cuidado: No bloquee la pantalla del celular" : "Toque el micrófono para iniciar"}
                            </p>
                        )}
                    </>
                ) : (
                    <div className="w-full animate-fade-in pb-12">
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 flex items-start">
                            <BrainCircuit className="text-emerald-500 mr-3 mt-1 flex-shrink-0" />
                            <div>
                                <h3 className="font-bold text-emerald-800">Análisis Exitoso</h3>
                                <p className="text-emerald-700 text-sm mt-1">La IA ha procesado la entrevista y mapeado las respuestas.</p>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                            <h3 className="font-bold text-slate-800 mb-3 uppercase text-xs tracking-wider">Resumen Ejecutivo</h3>
                            <p className="text-slate-600 leading-relaxed">{resultData.resumen}</p>
                        </div>

                        <h3 className="font-bold text-slate-800 mb-4 px-1 uppercase text-xs tracking-wider">Cuestionario Detectado</h3>
                        <div className="space-y-4">
                            {resultData.respuestas.map((r, i) => (
                                <div key={i} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                                        <p className="font-semibold text-slate-800 text-sm">{r.pregunta}</p>
                                    </div>
                                    <div className="p-4">
                                        <p className="text-slate-600">{r.respuesta || <span className="text-slate-400 italic">No se detectó respuesta en el audio.</span>}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        <button 
                            onClick={() => { setResultData(null); setSelectedPlantilla(null); setDuration(0); }}
                            className="mt-8 w-full bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-slate-800 transition-colors"
                        >
                            Volver al Inicio
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
