import React, { useState, useEffect, useRef } from 'react';
import { 
    MessageSquare, Send, Trash2, Search, UserCheck, UserX, 
    RefreshCw, Terminal, CheckCircle2, Shield, Activity, Sparkles, 
    AlertTriangle, Bot, User, Clock, ArrowRight, Play, Check, Copy,
    ChevronDown, Sliders, ExternalLink, CornerDownLeft
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

const QUICK_TEST_PROMPTS = [
    { label: '👋 Saludo inicial', text: '¡Hola! Buenas tardes, quisiera hacer una consulta.', desc: 'Triage de bienvenida y menú principal' },
    { label: '🩺 Solicitar turno', text: 'Hola, necesito sacar un turno para ginecología.', desc: 'Dispara validación de DNI en SALUS' },
    { label: '🟢 DNI registrado (Camino 1)', text: 'Mi DNI es 28475561', desc: 'Prueba camino paciente con ficha en SALUS' },
    { label: '🔵 DNI no registrado (Camino 2)', text: 'Mi DNI es 99887766', desc: 'Prueba camino paciente nuevo (Pide 5 datos)' },
    { label: '📋 Enviar 5 Datos Obligatorios', text: 'Mis datos son: Juan Carlos Pérez, DNI 35123987, Nacimiento 15/04/1992, Obra Social OSP Tradicional afiliado 458712, Tel: 2645891234, email: juan@gmail.com', desc: 'Alta de ficha en SALUS' },
    { label: '📅 Consultar mis turnos', text: '¿A qué hora tengo mi turno agendado hoy?', desc: 'Lectura de turnos próximos' },
    { label: '🔬 Resultados de laboratorio', text: 'Quiero ver los resultados de mis análisis de sangre.', desc: 'Acceso a portal Glims online' },
    { label: '🩻 Informes de imágenes', text: 'Necesito descargar el informe de mi ecografía.', desc: 'Acceso a portal ITS' },
    { label: '🚨 Consulta de guardia 24hs', text: 'Tengo a mi hijo con 39 de fiebre, ¿dónde está la guardia de urgencias?', desc: 'Verifica advertencia exclusiva Sede San Luis' },
    { label: '👤 Derivación a operador', text: 'Necesito hablar con una persona urgente por favor.', desc: 'Handoff y evaluación de cola' }
];

export default function ContactCenterTestSandbox({
    systemPrompt,
    model = 'gpt-5.5',
    temperature = '0.3',
    botName = 'Dora',
    handoffNormal,
    handoffDelay,
    delayThreshold = 5,
    initialMessage = '',
    initialPatientType = 'registrado',
    addToast
}) {
    // Escenario de Paciente
    const [patientType, setPatientType] = useState(initialPatientType);
    const [patient, setPatient] = useState({
        nombre: 'María Belén Gómez',
        dni: '28475561',
        obraSocial: 'OSP (Obra Social Provincia) - Plan Tradicional',
        turnos: '1. Fecha: 28/09/2026 | Hora: 16:30 hs | Profesional: Dra. Gómez Carrizo | Especialidad: Ginecología | Sede: Sede San Luis (San Luis 432 Oeste)',
        esRegistrado: true
    });

    // Búsqueda en SALUS
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);

    // Estado del Chat
    const [messages, setMessages] = useState([
        { 
            id: 1, 
            sender: 'bot', 
            text: `¡Hola! 👋 Soy ${botName}, tu asistente virtual de Sanatorio Argentino.\n¿En qué te puedo ayudar hoy?\n\n1️⃣ Turnos médicos y consultas\n2️⃣ Informes y resultados de estudios\n3️⃣ Guardias y urgencias 24 hs (Sede San Luis)\n4️⃣ Hablar con un asesor`, 
            time: '14:30' 
        }
    ]);
    const [inputText, setInputText] = useState(initialMessage || '');
    const [sending, setSending] = useState(false);
    const [lastResult, setLastResult] = useState(null);
    const [simulatedQueueCount, setSimulatedQueueCount] = useState(2);
    const [activeTabInspection, setActiveTabInspection] = useState('telemetry'); // 'telemetry' | 'prompt'
    const [copiedPrompt, setCopiedPrompt] = useState(false);

    const chatEndRef = useRef(null);

    // Auto scroll al final del chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, sending]);

    // Actualizar preset si initialPatientType cambia externamente
    useEffect(() => {
        if (initialPatientType) {
            handleSelectPreset(initialPatientType);
        }
    }, [initialPatientType]);

    // Seleccionar preset de paciente
    const handleSelectPreset = (type) => {
        setPatientType(type);
        if (type === 'registrado') {
            setPatient({
                nombre: 'María Belén Gómez',
                dni: '28475561',
                obraSocial: 'OSP (Obra Social Provincia) - Plan Tradicional',
                turnos: '1. Fecha: 28/09/2026 | Hora: 16:30 hs | Profesional: Dra. Gómez Carrizo | Especialidad: Ginecología | Sede: Sede San Luis (San Luis 432 Oeste)',
                esRegistrado: true
            });
        } else if (type === 'nuevo') {
            setPatient({
                nombre: 'Carlos Emanuel Mendoza',
                dni: '35123987',
                obraSocial: 'A confirmar / Particular',
                turnos: 'No registra turnos previos en el Sanatorio.',
                esRegistrado: false
            });
        }
    };

    // Búsqueda en vivo en SALUS
    const handleSearchSalus = async (query) => {
        setSearchQuery(query);
        if (!query || query.trim().length < 3) {
            setSearchResults([]);
            return;
        }
        setSearching(true);
        try {
            const clean = query.trim();
            const isNum = /^\d+$/.test(clean);
            let q = supabase.from('hospital_pacientes').select('id_paciente, nombre, dni, coseguro, fecha_nacimiento, centro').limit(6);
            if (isNum) {
                q = q.ilike('dni', `%${clean}%`);
            } else {
                q = q.ilike('nombre', `%${clean.toUpperCase()}%`);
            }
            const { data } = await q;
            setSearchResults(data || []);
        } catch (err) {
            console.error('Error buscando paciente en SALUS:', err);
        } finally {
            setSearching(false);
        }
    };

    const handleSelectSalusPatient = (p) => {
        setPatientType('custom');
        setPatient({
            nombre: p.nombre,
            dni: p.dni,
            obraSocial: p.coseguro || 'Particular',
            turnos: 'Sin turnos agendados en esta simulación.',
            esRegistrado: true
        });
        setSearchResults([]);
        setSearchQuery('');
        addToast?.(`Paciente cargado desde SALUS: ${p.nombre}`, 'info');
    };

    // Enviar mensaje de prueba
    const handleSendMessage = async (textToSend) => {
        const text = (textToSend || inputText).trim();
        if (!text || sending) return;

        const userMsg = {
            id: Date.now(),
            sender: 'user',
            text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        const updatedHistory = [...messages, userMsg];
        setMessages(updatedHistory);
        setInputText('');
        setSending(true);

        try {
            const { data, error } = await supabase.functions.invoke('whatsapp-webhook', {
                body: {
                    action: 'simulate',
                    message: text,
                    patient,
                    overrideConfig: {
                        systemPrompt,
                        model,
                        temperature,
                        botName,
                        handoffNormal,
                        handoffDelay,
                        delayThreshold: simulatedQueueCount
                    },
                    history: updatedHistory.map(m => ({ sender: m.sender, text: m.text }))
                }
            });

            if (error) throw error;

            const res = data?.result;
            setLastResult(res);

            if (res) {
                // Si el mensaje contenía un DNI y se resolvió su ficha en SALUS, sincronizar en vivo la ficha activa del paciente
                if (res.dbRecord) {
                    setPatient({
                        nombre: res.dbRecord.nombre,
                        dni: res.dbRecord.dni,
                        obraSocial: res.dbRecord.coseguro || 'Particular',
                        turnos: 'Ficha activa en SALUS',
                        esRegistrado: true
                    });
                    setPatientType('custom');
                }

                const botReply = {
                    id: Date.now() + 1,
                    sender: 'bot',
                    text: res.replyText,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    intent: res.intent,
                    transferToAgent: res.transferToAgent,
                    summary: res.summary,
                    handoffNotice: res.handoffNotice
                };

                const newHistory = [...updatedHistory, botReply];
                // Si hubo derivación, agregar el aviso de cola si corresponde
                if (res.transferToAgent && res.handoffNotice) {
                    newHistory.push({
                        id: Date.now() + 2,
                        sender: 'system',
                        text: res.handoffNotice,
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        isHandoffNotice: true
                    });
                }
                setMessages(newHistory);
            }
        } catch (err) {
            console.error('Error en simulación sandbox:', err);
            addToast?.('Error al conectar con la Edge Function del chatbot', 'error');
            setMessages(prev => [
                ...prev,
                {
                    id: Date.now() + 1,
                    sender: 'bot',
                    text: `⚠️ Error de simulación: No se pudo obtener respuesta del motor OpenAI (${model}). Verifica tu conexión.`,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    isError: true
                }
            ]);
        } finally {
            setSending(false);
        }
    };

    // Reiniciar conversación
    const handleClearChat = () => {
        setMessages([
            { 
                id: Date.now(), 
                sender: 'bot', 
                text: `¡Hola! 👋 Soy ${botName}, tu asistente virtual de Sanatorio Argentino.\n¿En qué te puedo ayudar hoy?\n\n1️⃣ Turnos médicos y consultas\n2️⃣ Informes y resultados de estudios\n3️⃣ Guardias y urgencias 24 hs (Sede San Luis)\n4️⃣ Hablar con un asesor`, 
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
            }
        ]);
        setLastResult(null);
        addToast?.('Chat de prueba reiniciado', 'info');
    };

    // Copiar System Prompt compilado
    const handleCopyCompiledPrompt = () => {
        if (!lastResult?.compiledPrompt) return;
        navigator.clipboard.writeText(lastResult.compiledPrompt);
        setCopiedPrompt(true);
        setTimeout(() => setCopiedPrompt(false), 2000);
        addToast?.('Prompt compilado copiado al portapapeles', 'info');
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            
            {/* Header del Ambiente de Test */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                padding: '20px 24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#FFFFFF',
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
                    }}>
                        <Activity size={24} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F2942' }}>
                                Ambiente de Pruebas & Sandbox Clínico (IA WhatsApp)
                            </h3>
                            <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                background: '#ECFDF5',
                                color: '#059669',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                padding: '3px 8px',
                                borderRadius: '12px',
                                border: '1px solid #A7F3D0'
                            }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }} />
                                Motor Activo: {model}
                            </span>
                        </div>
                        <p style={{ margin: '3px 0 0 0', fontSize: '0.82rem', color: '#64748B' }}>
                            Testea en vivo cómo responde {botName} ante cada mensaje del paciente, evaluando la bifurcación SALUS (Camino 1 Registrado vs Camino 2 No Registrado) y las directivas clínicas sin enviar mensajes reales.
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                        type="button"
                        onClick={handleClearChat}
                        style={{
                            padding: '8px 14px',
                            background: '#F8FAFC',
                            border: '1px solid #CBD5E1',
                            borderRadius: '8px',
                            color: '#475569',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <Trash2 size={13} />
                        Reiniciar Conversación
                    </button>
                </div>
            </div>

            {/* Layout 3 Columnas: Contexto Paciente | Teléfono WhatsApp | Telemetría IA */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '310px 1fr 340px',
                gap: '18px',
                alignItems: 'start'
            }}>
                
                {/* COLUMNA 1: CONFIGURACIÓN DEL PACIENTE Y DISPARADORES */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {/* Tarjeta de Selección de Escenario */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '14px',
                        border: '1px solid #E2E8F0',
                        padding: '16px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                    }}>
                        <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: '#334155', marginBottom: '10px' }}>
                            👤 Escenario de Paciente:
                        </label>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={() => handleSelectPreset('registrado')}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: patientType === 'registrado' ? '1px solid #10B981' : '1px solid #E2E8F0',
                                    background: patientType === 'registrado' ? '#ECFDF5' : '#F8FAFC',
                                    color: patientType === 'registrado' ? '#065F46' : '#475569',
                                    fontSize: '0.76rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    textAlign: 'left'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <UserCheck size={14} color={patientType === 'registrado' ? '#10B981' : '#64748B'} />
                                    <span>1️⃣ Registrado en SALUS</span>
                                </div>
                                {patientType === 'registrado' && <Check size={13} color="#10B981" />}
                            </button>

                            <button
                                type="button"
                                onClick={() => handleSelectPreset('nuevo')}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: patientType === 'nuevo' ? '1px solid #0284C7' : '1px solid #E2E8F0',
                                    background: patientType === 'nuevo' ? '#E0F2FE' : '#F8FAFC',
                                    color: patientType === 'nuevo' ? '#0369A1' : '#475569',
                                    fontSize: '0.76rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    textAlign: 'left'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <UserX size={14} color={patientType === 'nuevo' ? '#0284C7' : '#64748B'} />
                                    <span>2️⃣ No Registrado / Nuevo</span>
                                </div>
                                {patientType === 'nuevo' && <Check size={13} color="#0284C7" />}
                            </button>

                            <button
                                type="button"
                                onClick={() => setPatientType('search')}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: patientType === 'search' || patientType === 'custom' ? '1px solid #8B5CF6' : '1px solid #E2E8F0',
                                    background: patientType === 'search' || patientType === 'custom' ? '#F3E8FF' : '#F8FAFC',
                                    color: patientType === 'search' || patientType === 'custom' ? '#6B21A8' : '#475569',
                                    fontSize: '0.76rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    textAlign: 'left'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Search size={14} color={patientType === 'search' || patientType === 'custom' ? '#8B5CF6' : '#64748B'} />
                                    <span>🔍 Buscar en SALUS Real</span>
                                </div>
                                {(patientType === 'search' || patientType === 'custom') && <Check size={13} color="#8B5CF6" />}
                            </button>
                        </div>

                        {/* Buscador dinámico de SALUS si está activo */}
                        {(patientType === 'search' || patientType === 'custom') && (
                            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <input
                                    type="text"
                                    placeholder="Escribe DNI o Nombre..."
                                    value={searchQuery}
                                    onChange={(e) => handleSearchSalus(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '7px 10px',
                                        borderRadius: '6px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.76rem'
                                    }}
                                />
                                {searching && (
                                    <span style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                        Buscando en hospital_pacientes...
                                    </span>
                                )}
                                {searchResults.length > 0 && (
                                    <div style={{
                                        background: '#FFFFFF',
                                        border: '1px solid #E2E8F0',
                                        borderRadius: '8px',
                                        maxHeight: '140px',
                                        overflowY: 'auto'
                                    }}>
                                        {searchResults.map(p => (
                                            <div
                                                key={p.id_paciente || p.dni}
                                                onClick={() => handleSelectSalusPatient(p)}
                                                style={{
                                                    padding: '6px 10px',
                                                    borderBottom: '1px solid #F1F5F9',
                                                    cursor: 'pointer',
                                                    fontSize: '0.72rem'
                                                }}
                                            >
                                                <strong style={{ color: '#0F2942' }}>{p.nombre}</strong>
                                                <div style={{ color: '#64748B' }}>DNI: {p.dni} • {p.coseguro || 'Particular'}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Ficha Activa del Paciente */}
                        <div style={{
                            marginTop: '14px',
                            background: '#F8FAFC',
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0',
                            padding: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                            fontSize: '0.74rem'
                        }}>
                            <div>
                                <span style={{ color: '#64748B', fontWeight: 600 }}>Paciente:</span>{' '}
                                <strong style={{ color: '#0F2942' }}>{patient.nombre}</strong>
                            </div>
                            <div>
                                <span style={{ color: '#64748B', fontWeight: 600 }}>DNI:</span>{' '}
                                <strong style={{ color: '#0284C7' }}>{patient.dni}</strong>
                            </div>
                            <div>
                                <span style={{ color: '#64748B', fontWeight: 600 }}>Cobertura:</span>{' '}
                                <span style={{ color: '#334155' }}>{patient.obraSocial}</span>
                            </div>
                            <div>
                                <span style={{ color: '#64748B', fontWeight: 600 }}>Estado SALUS:</span>{' '}
                                <span style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    padding: '1px 6px',
                                    borderRadius: '6px',
                                    background: patient.esRegistrado ? '#DCFCE7' : '#FEE2E2',
                                    color: patient.esRegistrado ? '#15803D' : '#B91C1C'
                                }}>
                                    {patient.esRegistrado ? '✅ Ficha Activa' : '❌ No Registrado'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Disparadores Rápidos One-Click */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '14px',
                        border: '1px solid #E2E8F0',
                        padding: '16px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                            <Sparkles size={14} color="#0284C7" />
                            <label style={{ fontSize: '0.74rem', fontWeight: 800, color: '#334155' }}>
                                Disparadores de Prueba Rápidos:
                            </label>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {QUICK_TEST_PROMPTS.map((qp, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => handleSendMessage(qp.text)}
                                    disabled={sending}
                                    style={{
                                        padding: '7px 10px',
                                        borderRadius: '8px',
                                        background: '#F8FAFC',
                                        border: '1px solid #E2E8F0',
                                        color: '#334155',
                                        fontSize: '0.72rem',
                                        fontWeight: 600,
                                        textAlign: 'left',
                                        cursor: sending ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '2px',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    <strong style={{ color: '#0284C7' }}>{qp.label}</strong>
                                    <span style={{ fontSize: '0.66rem', color: '#64748B' }}>{qp.desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* COLUMNA 2: PANTALLA WHATSAPP EN VIVO */}
                <div style={{
                    background: '#E5DDD5', // WhatsApp classic background tone
                    borderRadius: '18px',
                    border: '1px solid #CBD5E1',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    height: '660px',
                    overflow: 'hidden'
                }}>
                    {/* Header estilo WhatsApp */}
                    <div style={{
                        background: '#075E54', // WhatsApp dark emerald
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        color: '#FFFFFF'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: '50%',
                                background: '#128C7E',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#FFFFFF',
                                fontWeight: 800,
                                fontSize: '0.9rem',
                                border: '2px solid rgba(255,255,255,0.4)'
                            }}>
                                🤖
                            </div>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <strong style={{ fontSize: '0.9rem' }}>Sanatorio Argentino</strong>
                                    <span style={{ fontSize: '0.7rem', color: '#80ED99' }}>✓ Oficial</span>
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#D1FAE5' }}>
                                    en línea • Asistente Virtual {botName}
                                </div>
                            </div>
                        </div>

                        <span style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '10px',
                            background: 'rgba(255,255,255,0.15)',
                            color: '#FFFFFF'
                        }}>
                            {model}
                        </span>
                    </div>

                    {/* Área de Mensajes */}
                    <div style={{
                        flex: 1,
                        padding: '16px',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                    }}>
                        {messages.map(msg => {
                            if (msg.sender === 'user') {
                                return (
                                    <div key={msg.id} style={{
                                        alignSelf: 'flex-end',
                                        maxWidth: '78%',
                                        background: '#DCF8C6',
                                        borderRadius: '10px 0 10px 10px',
                                        padding: '8px 12px',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
                                        fontSize: '0.8rem',
                                        color: '#111827',
                                        lineHeight: 1.45
                                    }}>
                                        <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
                                        <div style={{
                                            fontSize: '0.65rem',
                                            color: '#65676B',
                                            textAlign: 'right',
                                            marginTop: '3px'
                                        }}>
                                            {msg.time} • ✓✓
                                        </div>
                                    </div>
                                );
                            } else if (msg.isHandoffNotice) {
                                return (
                                    <div key={msg.id} style={{
                                        alignSelf: 'center',
                                        maxWidth: '90%',
                                        background: '#FEF3C7',
                                        border: '1px solid #FCD34D',
                                        borderRadius: '10px',
                                        padding: '8px 14px',
                                        fontSize: '0.74rem',
                                        color: '#92400E',
                                        textAlign: 'center',
                                        lineHeight: 1.4
                                    }}>
                                        <div style={{ fontWeight: 800, marginBottom: '2px' }}>
                                            🔀 AVISO DE DERIVACIÓN A ASESOR
                                        </div>
                                        <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
                                    </div>
                                );
                            } else {
                                return (
                                    <div key={msg.id} style={{
                                        alignSelf: 'flex-start',
                                        maxWidth: '82%',
                                        background: '#FFFFFF',
                                        borderRadius: '0 10px 10px 10px',
                                        padding: '8px 14px',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
                                        fontSize: '0.8rem',
                                        color: '#111827',
                                        lineHeight: 1.48
                                    }}>
                                        {msg.intent && (
                                            <div style={{
                                                fontSize: '0.66rem',
                                                fontWeight: 800,
                                                color: '#0284C7',
                                                marginBottom: '4px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}>
                                                <span>🎯 Intent: {msg.intent}</span>
                                                {msg.transferToAgent && (
                                                    <span style={{ color: '#DC2626' }}>• 👤 Transfiere a Operador</span>
                                                )}
                                            </div>
                                        )}
                                        <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
                                        <div style={{
                                            fontSize: '0.65rem',
                                            color: '#8696A0',
                                            textAlign: 'right',
                                            marginTop: '4px'
                                        }}>
                                            {msg.time}
                                        </div>
                                    </div>
                                );
                            }
                        })}

                        {sending && (
                            <div style={{
                                alignSelf: 'flex-start',
                                background: '#FFFFFF',
                                borderRadius: '0 10px 10px 10px',
                                padding: '10px 16px',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontSize: '0.74rem',
                                color: '#64748B'
                            }}>
                                <RefreshCw size={13} className="spin" color="#0284C7" />
                                <span>{botName} está escribiendo y evaluando con {model}...</span>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    {/* Barra de Input estilo WhatsApp */}
                    <div style={{
                        padding: '10px 14px',
                        background: '#F0F2F5',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <input
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleSendMessage();
                                }
                            }}
                            placeholder={`Escribí un mensaje simulando ser ${patient.nombre}...`}
                            disabled={sending}
                            style={{
                                flex: 1,
                                padding: '10px 14px',
                                borderRadius: '24px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.82rem',
                                outline: 'none',
                                background: '#FFFFFF'
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => handleSendMessage()}
                            disabled={sending || !inputText.trim()}
                            style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                border: 'none',
                                background: sending || !inputText.trim() ? '#94A3B8' : '#00A884',
                                color: '#FFFFFF',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: sending || !inputText.trim() ? 'not-allowed' : 'pointer',
                                boxShadow: '0 2px 5px rgba(0,0,0,0.15)'
                            }}
                        >
                            <Send size={16} />
                        </button>
                    </div>
                </div>

                {/* COLUMNA 3: TELEMETRÍA E INSPECCIÓN EN TIEMPO REAL */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {/* Tarjeta de Telemetría */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '14px',
                        border: '1px solid #E2E8F0',
                        padding: '16px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Terminal size={15} color="#0284C7" />
                                <strong style={{ fontSize: '0.82rem', color: '#0F2942' }}>
                                    Diagnóstico & Telemetría IA
                                </strong>
                            </div>

                            <div style={{ display: 'flex', background: '#F1F5F9', padding: '2px', borderRadius: '6px' }}>
                                <button
                                    type="button"
                                    onClick={() => setActiveTabInspection('telemetry')}
                                    style={{
                                        padding: '2px 8px',
                                        fontSize: '0.68rem',
                                        fontWeight: 700,
                                        borderRadius: '4px',
                                        border: 'none',
                                        background: activeTabInspection === 'telemetry' ? '#FFFFFF' : 'transparent',
                                        color: activeTabInspection === 'telemetry' ? '#0284C7' : '#64748B',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Resumen
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTabInspection('prompt')}
                                    style={{
                                        padding: '2px 8px',
                                        fontSize: '0.68rem',
                                        fontWeight: 700,
                                        borderRadius: '4px',
                                        border: 'none',
                                        background: activeTabInspection === 'prompt' ? '#FFFFFF' : 'transparent',
                                        color: activeTabInspection === 'prompt' ? '#0284C7' : '#64748B',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Prompt
                                </button>
                            </div>
                        </div>

                        {activeTabInspection === 'telemetry' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div>
                                    <span style={{ fontSize: '0.7rem', color: '#64748B', display: 'block' }}>
                                        🎯 Intención Clasificada:
                                    </span>
                                    <strong style={{ fontSize: '0.85rem', color: '#0284C7' }}>
                                        {lastResult?.intent || 'Aguardando primer mensaje...'}
                                    </strong>
                                </div>

                                <div>
                                    <span style={{ fontSize: '0.7rem', color: '#64748B', display: 'block' }}>
                                        👤 Transferencia a Humano (Handoff):
                                    </span>
                                    <span style={{
                                        fontSize: '0.74rem',
                                        fontWeight: 700,
                                        padding: '2px 8px',
                                        borderRadius: '6px',
                                        background: lastResult?.transferToAgent ? '#FEE2E2' : '#ECFDF5',
                                        color: lastResult?.transferToAgent ? '#DC2626' : '#059669',
                                        display: 'inline-block',
                                        marginTop: '2px'
                                    }}>
                                        {lastResult?.transferToAgent ? '🚨 Transferir a Asesor' : '🤖 Resolver con Bot'}
                                    </span>
                                </div>

                                <div>
                                    <span style={{ fontSize: '0.7rem', color: '#64748B', display: 'block' }}>
                                        🏥 Estado de Ficha SALUS:
                                    </span>
                                    <span style={{
                                        fontSize: '0.74rem',
                                        fontWeight: 700,
                                        padding: '2px 8px',
                                        borderRadius: '6px',
                                        background: lastResult?.isExistingInDb ? '#DCFCE7' : '#EFF6FF',
                                        color: lastResult?.isExistingInDb ? '#15803D' : '#1D4ED8',
                                        display: 'inline-block',
                                        marginTop: '2px'
                                    }}>
                                        {lastResult?.isExistingInDb ? 'Ficha Confirmada en SALUS' : 'No Encontrado (Camino 2)'}
                                    </span>
                                </div>

                                <div>
                                    <span style={{ fontSize: '0.7rem', color: '#64748B', display: 'block' }}>
                                        📝 Resumen para el Equipo:
                                    </span>
                                    <p style={{
                                        margin: '2px 0 0 0',
                                        fontSize: '0.74rem',
                                        color: '#334155',
                                        background: '#F8FAFC',
                                        padding: '8px',
                                        borderRadius: '6px',
                                        border: '1px solid #E2E8F0',
                                        lineHeight: 1.4
                                    }}>
                                        {lastResult?.summary || 'El bot generará un resumen cuando interactúes.'}
                                    </p>
                                </div>

                                <div>
                                    <span style={{ fontSize: '0.7rem', color: '#64748B', display: 'block' }}>
                                        ⚙️ Parámetros Activos:
                                    </span>
                                    <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '2px' }}>
                                        Modelo: <strong>{model}</strong> • Temp: <strong>{temperature}</strong> • Bot: <strong>{botName}</strong>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* Visor de Prompt Compilado */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                        Variables inyectadas en vivo:
                                    </span>
                                    <button
                                        type="button"
                                        onClick={handleCopyCompiledPrompt}
                                        style={{
                                            border: 'none',
                                            background: 'transparent',
                                            color: copiedPrompt ? '#16A34A' : '#0284C7',
                                            fontSize: '0.68rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '3px'
                                        }}
                                    >
                                        {copiedPrompt ? <Check size={11} /> : <Copy size={11} />}
                                        {copiedPrompt ? 'Copiado' : 'Copiar'}
                                    </button>
                                </div>
                                <div style={{
                                    maxHeight: '380px',
                                    overflowY: 'auto',
                                    background: '#0F172A',
                                    color: '#E2E8F0',
                                    padding: '10px',
                                    borderRadius: '8px',
                                    fontSize: '0.68rem',
                                    fontFamily: 'monospace',
                                    lineHeight: 1.45,
                                    whiteSpace: 'pre-wrap'
                                }}>
                                    {lastResult?.compiledPrompt || 'Envía un mensaje para ver el prompt compilado con las variables resueltas.'}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
