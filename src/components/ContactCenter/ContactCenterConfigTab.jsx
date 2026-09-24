import React, { useState, useEffect, useRef } from 'react';
import { 
    Bot, Save, RotateCcw, Copy, Check, Sparkles, Sliders, Shield, 
    AlertCircle, Info, RefreshCw, Eye, EyeOff, Terminal, CheckCircle2,
    Cpu, Activity, Zap, Users, MessageSquare, Clock, AlertTriangle,
    Send, Trash2, Search, UserCheck, UserX, CornerDownLeft, Play, ArrowRight,
    GitBranch, Layers
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { 
    fetchChatbotConfig, 
    saveChatbotConfig, 
    DEFAULT_CHATBOT_SYSTEM_PROMPT,
    DEFAULT_HANDOFF_NORMAL,
    DEFAULT_HANDOFF_DELAY
} from '../../services/contactCenterService';
import ContactCenterBotTree from './ContactCenterBotTree';
import ContactCenterTestSandbox from './ContactCenterTestSandbox';
import { DEFAULT_BOT_TREE_NODES, generatePromptDirectivesFromTree } from './botTreeData';

const VARIABLE_TAGS = [
    { tag: '{nombre}', label: 'Nombre Paciente', desc: 'Nombre completo o de pila detectado' },
    { tag: '{dni}', label: 'DNI Paciente', desc: 'DNI validado del paciente' },
    { tag: '{cobertura}', label: 'Obra Social y Plan', desc: 'Cobertura médica o Particular' },
    { tag: '{turnos}', label: 'Turnos Próximos', desc: 'Lista contextual de turnos agendados en Salus' },
    { tag: '{bot_name}', label: 'Nombre del Asistente', desc: 'Nombre asignado al bot (ej: Dora / Betina)' }
];

export default function ContactCenterConfigTab({ currentUser, addToast }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [activeSubTab, setActiveSubTab] = useState('tree'); // 'tree' | 'editor' | 'simulator'
    const [botTreeNodes, setBotTreeNodes] = useState(DEFAULT_BOT_TREE_NODES);
    const [sandboxInitialMessage, setSandboxInitialMessage] = useState('');
    const [sandboxInitialPatientType, setSandboxInitialPatientType] = useState('registrado');

    // Form state - AI Bot
    const [systemPrompt, setSystemPrompt] = useState(DEFAULT_CHATBOT_SYSTEM_PROMPT);
    const [botName, setBotName] = useState('Dora');
    const [model, setModel] = useState('gpt-5.5');
    const [temperature, setTemperature] = useState('0.3');
    const [lastUpdated, setLastUpdated] = useState(null);
    const [lastUser, setLastUser] = useState(null);

    // Form state - Handoff & Delays
    const [handoffNormal, setHandoffNormal] = useState(DEFAULT_HANDOFF_NORMAL);
    const [handoffDelay, setHandoffDelay] = useState(DEFAULT_HANDOFF_DELAY);
    const [delayThreshold, setDelayThreshold] = useState(5);
    const [unassignedQueueCount, setUnassignedQueueCount] = useState(0);

    // Simulator state
    const [simMode, setSimMode] = useState('chat'); // 'chat' | 'prompt'
    const [simPatientType, setSimPatientType] = useState('registrado'); // 'registrado' | 'nuevo' | 'custom'
    const [simPatient, setSimPatient] = useState({
        nombre: 'María Belén Gómez',
        dni: '28475561',
        obraSocial: 'OSP (Obra Social Provincia) - Plan Tradicional',
        turnos: '1. Fecha: 28/09/2026 | Hora: 16:30 hs | Profesional: Dra. Gómez Carrizo | Especialidad: Ginecología | Sede: Sede San Luis (San Luis 432 Oeste)',
        esRegistrado: true
    });
    const [simSearchQuery, setSimSearchQuery] = useState('');
    const [simSearchResults, setSimSearchResults] = useState([]);
    const [simSearching, setSimSearching] = useState(false);
    
    // Chat Simulation
    const [simMessages, setSimMessages] = useState([
        { id: 1, sender: 'bot', text: '¡Hola! 👋 Soy Dora, tu asistente virtual de Sanatorio Argentino. ¿En qué te puedo ayudar hoy?', time: '14:30' }
    ]);
    const [simInput, setSimInput] = useState('');
    const [simSending, setSimSending] = useState(false);
    const [lastSimResult, setLastSimResult] = useState(null);

    const textareaRef = useRef(null);

    // Cargar configuración activa
    // Cargar configuración activa
    const loadConfig = async () => {
        setLoading(true);
        try {
            const cfg = await fetchChatbotConfig();
            setSystemPrompt(cfg.systemPrompt || DEFAULT_CHATBOT_SYSTEM_PROMPT);
            setBotName(cfg.botName || 'Dora');
            setModel(cfg.model || 'gpt-5.5');
            setTemperature(cfg.temperature || '0.3');
            setHandoffNormal(cfg.handoffNormal || DEFAULT_HANDOFF_NORMAL);
            setHandoffDelay(cfg.handoffDelay || DEFAULT_HANDOFF_DELAY);
            setDelayThreshold(cfg.delayThreshold ?? 5);
            setUnassignedQueueCount(cfg.unassignedQueueCount || 0);
            if (cfg.botTree && Array.isArray(cfg.botTree) && cfg.botTree.length > 0) {
                setBotTreeNodes(cfg.botTree);
            }
            setLastUpdated(cfg.updatedAt);
            setLastUser(cfg.updatedBy);
        } catch (err) {
            console.error('Error cargando config:', err);
            addToast?.('Error al cargar la configuración del chatbot', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadConfig();
    }, []);

    // Insertar tag en el cursor del textarea
    const handleInsertTag = (tag) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentText = systemPrompt;
        const updatedText = currentText.substring(0, start) + tag + currentText.substring(end);
        
        setSystemPrompt(updatedText);
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + tag.length, start + tag.length);
        }, 50);
    };

    // Guardar cambios globales
    const handleSave = async () => {
        if (!systemPrompt.trim()) {
            addToast?.('El System Prompt no puede estar vacío', 'warning');
            return;
        }

        setSaving(true);
        try {
            const userIdentifier = currentUser?.usuario || currentUser?.nombre || 'supervisor';
            await saveChatbotConfig({
                systemPrompt,
                model,
                temperature,
                botName,
                handoffNormal,
                handoffDelay,
                delayThreshold: parseInt(delayThreshold, 10) || 5,
                botTree: botTreeNodes,
                user: userIdentifier
            });
            setLastUpdated(new Date().toISOString());
            setLastUser(userIdentifier);
            addToast?.('¡Configuración del Chatbot, Árbol y Derivaciones guardada exitosamente!', 'success');
        } catch (err) {
            console.error('Error guardando config:', err);
            addToast?.('Error al guardar la configuración en la base de datos', 'error');
        } finally {
            setSaving(false);
        }
    };

    // Guardar árbol conversacional específicamente
    const handleSaveTree = async (updatedNodes) => {
        setSaving(true);
        try {
            const userIdentifier = currentUser?.usuario || currentUser?.nombre || 'supervisor';
            setBotTreeNodes(updatedNodes);
            await saveChatbotConfig({
                systemPrompt,
                model,
                temperature,
                botName,
                handoffNormal,
                handoffDelay,
                delayThreshold: parseInt(delayThreshold, 10) || 5,
                botTree: updatedNodes,
                user: userIdentifier
            });
            setLastUpdated(new Date().toISOString());
            setLastUser(userIdentifier);
            addToast?.('¡Árbol conversacional y respuestas predeterminadas guardadas exitosamente!', 'success');
        } catch (err) {
            console.error('Error guardando árbol conversacional:', err);
            addToast?.('Error al guardar el árbol conversacional', 'error');
        } finally {
            setSaving(false);
        }
    };

    // Sincronizar directivas del árbol con el System Prompt
    const handleSyncPromptWithTree = (nodesToSync) => {
        const directives = generatePromptDirectivesFromTree(nodesToSync);
        const marker = '### ESTRUCTURA DEL ÁRBOL CONVERSACIONAL (FLUJOGRAMA DE DECISIÓN):';
        let newPrompt = systemPrompt;
        if (newPrompt.includes(marker)) {
            const idx = newPrompt.indexOf(marker);
            newPrompt = newPrompt.substring(0, idx).trim() + '\n\n' + directives;
        } else {
            newPrompt = newPrompt.trim() + '\n\n' + directives;
        }
        setSystemPrompt(newPrompt);
        addToast?.('System Prompt actualizado con las respuestas y bifurcaciones del árbol.', 'success');
    };

    // Probar paso del árbol directamente en el Ambiente de Test
    const handleTestNodeInSimulator = ({ message, nodeId, nodeTitle, patientType }) => {
        setSandboxInitialMessage(message);
        setSandboxInitialPatientType(patientType || 'registrado');
        setActiveSubTab('simulator');
        addToast?.(`Paso "${nodeTitle}" precargado en el Ambiente de Test`, 'info');
    };

    // Restablecer al prompt de fábrica
    const handleResetDefault = () => {
        if (window.confirm('¿Estás seguro de restablecer los valores al texto predeterminado de fábrica? Perderás los cambios no guardados.')) {
            setSystemPrompt(DEFAULT_CHATBOT_SYSTEM_PROMPT);
            setModel('gpt-5.5');
            setTemperature('0.3');
            setBotName('Dora');
            setHandoffNormal(DEFAULT_HANDOFF_NORMAL);
            setHandoffDelay(DEFAULT_HANDOFF_DELAY);
            setDelayThreshold(5);
            addToast?.('Configuración restablecida al valor predeterminado', 'info');
        }
    };

    // Copiar prompt
    const handleCopy = () => {
        navigator.clipboard.writeText(systemPrompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        addToast?.('Prompt copiado al portapapeles', 'info');
    };

    // Cambiar preset de paciente para simulación
    const setPresetPatient = (type) => {
        setSimPatientType(type);
        if (type === 'registrado') {
            setSimPatient({
                nombre: 'María Belén Gómez',
                dni: '28475561',
                obraSocial: 'OSP (Obra Social Provincia) - Plan Tradicional',
                turnos: '1. Fecha: 28/09/2026 | Hora: 16:30 hs | Profesional: Dra. Gómez Carrizo | Especialidad: Ginecología | Sede: Sede San Luis (San Luis 432 Oeste)',
                esRegistrado: true
            });
        } else if (type === 'nuevo') {
            setSimPatient({
                nombre: 'Carlos Emanuel Mendoza',
                dni: '35123987',
                obraSocial: 'A confirmar / Particular',
                turnos: 'No registra turnos previos en el Sanatorio.',
                esRegistrado: false
            });
        }
    };

    // Búsqueda de paciente real en hospital_pacientes (SALUS)
    const handleSearchPatient = async (query) => {
        setSimSearchQuery(query);
        if (!query || query.trim().length < 3) {
            setSimSearchResults([]);
            return;
        }
        setSimSearching(true);
        try {
            const clean = query.trim();
            const isNum = /^\d+$/.test(clean);
            let q = supabase.from('hospital_pacientes').select('id, nombre, dni, coseguro, fecha_nacimiento, centro').limit(6);
            if (isNum) {
                q = q.ilike('dni', `%${clean}%`);
            } else {
                q = q.ilike('nombre', `%${clean.toUpperCase()}%`);
            }
            const { data } = await q;
            setSimSearchResults(data || []);
        } catch (err) {
            console.error('Error buscando paciente en SALUS:', err);
        } finally {
            setSimSearching(false);
        }
    };

    const handleSelectDbPatient = (p) => {
        setSimPatientType('custom');
        setSimPatient({
            nombre: p.nombre,
            dni: p.dni,
            obraSocial: p.coseguro || 'Particular',
            turnos: 'Sin turnos próximos agendados.',
            esRegistrado: true
        });
        setSimSearchResults([]);
        setSimSearchQuery('');
        addToast?.(`Paciente cargado desde SALUS: ${p.nombre}`, 'info');
    };

    // Enviar mensaje de prueba al sandbox
    const handleSendSimMessage = async (textToSend) => {
        const message = (textToSend || simInput).trim();
        if (!message || simSending) return;

        const userMsg = {
            id: Date.now(),
            sender: 'user',
            text: message,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        const updatedHistory = [...simMessages, userMsg];
        setSimMessages(updatedHistory);
        setSimInput('');
        setSimSending(true);

        try {
            const { data, error } = await supabase.functions.invoke('whatsapp-webhook', {
                body: {
                    action: 'simulate',
                    message,
                    patient: simPatient,
                    overrideConfig: {
                        systemPrompt,
                        model,
                        temperature,
                        botName,
                        handoffNormal,
                        handoffDelay,
                        delayThreshold
                    },
                    history: updatedHistory.map(m => ({ sender: m.sender, text: m.text }))
                }
            });

            if (error) throw error;

            const res = data?.result;
            setLastSimResult(res);

            if (res) {
                const botReply = {
                    id: Date.now() + 1,
                    sender: 'bot',
                    text: res.replyText,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    intent: res.intent,
                    transferToAgent: res.transferToAgent,
                    handoffNotice: res.handoffNotice,
                    modelUsed: res.modelUsed
                };
                setSimMessages(prev => [...prev, botReply]);
            }
        } catch (err) {
            console.error('Error en simulación:', err);
            setSimMessages(prev => [
                ...prev,
                {
                    id: Date.now() + 1,
                    sender: 'bot',
                    text: `⚠️ Error ejecutando simulación: ${err.message || 'Error en Edge Function'}.`,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    isError: true
                }
            ]);
        } finally {
            setSimSending(false);
        }
    };

    // Limpiar chat de prueba
    const handleClearSimChat = () => {
        setSimMessages([
            { id: 1, sender: 'bot', text: `¡Hola! 👋 Soy ${botName}, tu asistente virtual de Sanatorio Argentino. ¿En qué te puedo ayudar hoy?`, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
        ]);
        setLastSimResult(null);
    };

    // Vista previa interpolada
    const renderPreviewText = () => {
        let text = systemPrompt;
        text = text.replace(/\{nombre\}/g, simPatient.nombre || 'Paciente');
        text = text.replace(/\{dni\}/g, simPatient.dni || 'Sin DNI');
        text = text.replace(/\{cobertura\}/g, simPatient.obraSocial || 'A confirmar');
        text = text.replace(/\{turnos\}/g, simPatient.turnos || 'Sin turnos');
        text = text.replace(/\{bot_name\}|\{nombre_bot\}|\{asistente\}/gi, botName || 'Dora');
        return text;
    };

    // Conteo de tokens aproximados (1 token ~ 4 caracteres)
    const approxTokens = Math.round(systemPrompt.length / 4);

    return (
        <div style={{ maxWidth: '1300px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Header Card */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                padding: '24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#FFFFFF',
                        boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)'
                    }}>
                        <Bot size={26} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0F2942' }}>
                                Configuración del Asistente Virtual (Bot WhatsApp)
                            </h2>
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
                                Edge Function Activa
                            </span>
                        </div>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.84rem', color: '#64748B' }}>
                            Ajustá en tiempo real el comportamiento, tono clínico, directivas de derivación y System Prompt de la IA sin reiniciar servicios.
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                        onClick={loadConfig}
                        disabled={loading}
                        style={{
                            padding: '8px 14px',
                            background: '#F8FAFC',
                            border: '1px solid #CBD5E1',
                            borderRadius: '8px',
                            color: '#475569',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <RefreshCw size={14} className={loading ? 'spin' : ''} />
                        Recargar
                    </button>

                    <button
                        onClick={handleResetDefault}
                        style={{
                            padding: '8px 14px',
                            background: '#FEF2F2',
                            border: '1px solid #FECACA',
                            borderRadius: '8px',
                            color: '#DC2626',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <RotateCcw size={14} />
                        Restablecer Predeterminado
                    </button>

                    <button
                        onClick={handleSave}
                        disabled={saving || loading}
                        style={{
                            padding: '8px 20px',
                            background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                            border: 'none',
                            borderRadius: '8px',
                            color: '#FFFFFF',
                            fontSize: '0.84rem',
                            fontWeight: 700,
                            cursor: saving || loading ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)',
                            opacity: saving ? 0.7 : 1
                        }}
                    >
                        <Save size={15} />
                        {saving ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                </div>
            </div>

            {/* Selector de Sub-Pestañas: Árbol Conversacional vs Parámetros & Prompt vs Simulador Sandbox */}
            <div style={{
                display: 'flex',
                gap: '8px',
                background: '#FFFFFF',
                padding: '6px',
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}>
                <button
                    type="button"
                    onClick={() => setActiveSubTab('tree')}
                    style={{
                        flex: 1,
                        padding: '10px 16px',
                        borderRadius: '10px',
                        border: 'none',
                        background: activeSubTab === 'tree' ? 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)' : 'transparent',
                        color: activeSubTab === 'tree' ? '#FFFFFF' : '#475569',
                        fontWeight: 800,
                        fontSize: '0.84rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: activeSubTab === 'tree' ? '0 2px 6px rgba(2, 132, 199, 0.25)' : 'none',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <GitBranch size={16} />
                    🌳 Flujograma Conversacional (Árbol del Bot)
                </button>

                <button
                    type="button"
                    onClick={() => {
                        setActiveSubTab('editor');
                        setShowPreview(false);
                    }}
                    style={{
                        flex: 1,
                        padding: '10px 16px',
                        borderRadius: '10px',
                        border: 'none',
                        background: activeSubTab === 'editor' ? 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)' : 'transparent',
                        color: activeSubTab === 'editor' ? '#FFFFFF' : '#475569',
                        fontWeight: 800,
                        fontSize: '0.84rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: activeSubTab === 'editor' ? '0 2px 6px rgba(2, 132, 199, 0.25)' : 'none',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <Sliders size={16} />
                    ⚙️ Parámetros & System Prompt ({model})
                </button>

                <button
                    type="button"
                    onClick={() => {
                        setActiveSubTab('simulator');
                        setShowPreview(true);
                    }}
                    style={{
                        flex: 1,
                        padding: '10px 16px',
                        borderRadius: '10px',
                        border: 'none',
                        background: activeSubTab === 'simulator' ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)' : 'transparent',
                        color: activeSubTab === 'simulator' ? '#FFFFFF' : '#475569',
                        fontWeight: 800,
                        fontSize: '0.84rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: activeSubTab === 'simulator' ? '0 2px 6px rgba(16, 185, 129, 0.25)' : 'none',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <Play size={16} />
                    🧪 Simulador Sandbox de Paciente (IA en Vivo)
                </button>
            </div>

            {/* VISTA 1: ÁRBOL CONVERSACIONAL */}
            {activeSubTab === 'tree' && (
                <ContactCenterBotTree
                    botTreeNodes={botTreeNodes}
                    onSaveTree={handleSaveTree}
                    onSyncPromptWithTree={handleSyncPromptWithTree}
                    onTestNodeInSimulator={handleTestNodeInSimulator}
                    botName={botName}
                    saving={saving}
                    addToast={addToast}
                />
            )}

            {/* VISTA 2: AMBIENTE DE TEST Y SANDBOX (IA EN VIVO) */}
            {activeSubTab === 'simulator' && (
                <ContactCenterTestSandbox
                    systemPrompt={systemPrompt}
                    model={model}
                    temperature={temperature}
                    botName={botName}
                    handoffNormal={handoffNormal}
                    handoffDelay={handoffDelay}
                    delayThreshold={delayThreshold}
                    initialMessage={sandboxInitialMessage}
                    initialPatientType={sandboxInitialPatientType}
                    addToast={addToast}
                />
            )}

            {/* VISTA 3: EDITOR DE SYSTEM PROMPT & PARÁMETROS */}
            {activeSubTab === 'editor' && (
                <>
            {/* Grid 2 Columnas: Parámetros del Modelo y System Prompt */}
            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px' }}>
                
                {/* Columna Izquierda: Parámetros y Tags */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {/* Parámetros del Motor AI */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '14px',
                        border: '1px solid #E2E8F0',
                        padding: '18px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                            <Sliders size={18} color="#0284C7" />
                            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0F2942' }}>
                                Parámetros del Motor AI
                            </h3>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {/* Nombre del Asistente */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                    Nombre del Asistente Virtual
                                </label>
                                <input
                                    type="text"
                                    value={botName}
                                    onChange={(e) => setBotName(e.target.value)}
                                    placeholder="Ej: Dora"
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.85rem',
                                        color: '#0F2942',
                                        background: '#F8FAFC'
                                    }}
                                />
                            </div>

                            {/* Modelo OpenAI */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <label style={{ fontSize: '0.76rem', fontWeight: 700, color: '#475569' }}>
                                        Modelo OpenAI
                                    </label>
                                    {model.startsWith('gpt-5') ? (
                                        <span style={{
                                            fontSize: '0.65rem',
                                            fontWeight: 800,
                                            padding: '1px 6px',
                                            borderRadius: '6px',
                                            background: '#ECFDF5',
                                            color: '#059669',
                                            border: '1px solid #A7F3D0'
                                        }}>
                                            🌟 Nueva Generación {model}
                                        </span>
                                    ) : (model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) ? (
                                        <span style={{
                                            fontSize: '0.65rem',
                                            fontWeight: 800,
                                            padding: '1px 6px',
                                            borderRadius: '6px',
                                            background: '#F3E8FF',
                                            color: '#7E22CE',
                                            border: '1px solid #E9D5FF'
                                        }}>
                                            🧠 Motor de Razonamiento
                                        </span>
                                    ) : null}
                                </div>
                                <select
                                    value={model}
                                    onChange={(e) => setModel(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.82rem',
                                        color: '#0F2942',
                                        background: '#F8FAFC',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <optgroup label="🌟 Serie GPT-5 (Última Generación de OpenAI)">
                                        <option value="gpt-5.5">gpt-5.5 (Recomendado - Nueva Generación Flagship GPT-5.5)</option>
                                        <option value="gpt-5.4">gpt-5.4 (GPT-5.4 - Alto rendimiento y precisión)</option>
                                        <option value="gpt-5.4-mini">gpt-5.4-mini (GPT-5.4 Ultra rápido)</option>
                                        <option value="gpt-5">gpt-5 (Motor Base GPT-5)</option>
                                        <option value="gpt-5-mini">gpt-5-mini (GPT-5 versión liviana)</option>
                                    </optgroup>
                                    <optgroup label="🧠 Modelos de Razonamiento Clínico">
                                        <option value="o3-mini">o3-mini (Razonamiento lógico y triage clínico ultra veloz)</option>
                                        <option value="o1">o1 (Razonamiento profundo para análisis médico)</option>
                                    </optgroup>
                                    <optgroup label="⚡ Modelos Anteriores (Serie 4)">
                                        <option value="gpt-4.5-preview">gpt-4.5-preview (Modelo transicional 4.5)</option>
                                        <option value="chatgpt-4o-latest">chatgpt-4o-latest (Versión continua GPT-4o)</option>
                                        <option value="gpt-4o">gpt-4o (Omni balanceado anterior)</option>
                                        <option value="gpt-4o-mini">gpt-4o-mini (Mini anterior ultra rápido)</option>
                                    </optgroup>
                                </select>
                            </div>

                            {/* Temperatura */}
                            <div>
                                {(() => {
                                    const isAutoTemp = model.startsWith('o1') || model.startsWith('o3') || model.includes('5.5') || model.includes('5.4');
                                    return (
                                        <>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                <label style={{ fontSize: '0.76rem', fontWeight: 700, color: '#475569' }}>
                                                    Temperatura: <strong style={{ color: isAutoTemp ? '#059669' : '#0284C7' }}>
                                                        {isAutoTemp ? 'Auto (Última Generación)' : temperature}
                                                    </strong>
                                                </label>
                                                <span style={{ fontSize: '0.68rem', color: isAutoTemp ? '#059669' : '#64748B' }}>
                                                    {isAutoTemp
                                                        ? 'Calibrada por OpenAI'
                                                        : (parseFloat(temperature) <= 0.3 ? 'Preciso / Clínico' : 'Conversacional / Creativo')}
                                                </span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0.0"
                                                max="1.0"
                                                step="0.05"
                                                value={temperature}
                                                disabled={isAutoTemp}
                                                onChange={(e) => setTemperature(e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    cursor: isAutoTemp ? 'not-allowed' : 'pointer',
                                                    opacity: isAutoTemp ? 0.35 : 1
                                                }}
                                            />
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#94A3B8', marginTop: '2px' }}>
                                                {isAutoTemp ? (
                                                    <span style={{ color: '#059669', fontStyle: 'italic' }}>
                                                        * Los modelos GPT-5.5 / GPT-5.4 y la serie 'o' calibran internamente su nivel de razonamiento sin requerir temperatura manual.
                                                    </span>
                                                ) : (
                                                    <>
                                                        <span>0.0 (Estricto)</span>
                                                        <span>0.3 (Recomendado)</span>
                                                        <span>1.0 (Creativo)</span>
                                                    </>
                                                )}
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>

                    {/* Tags y Variables Dinámicas */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '14px',
                        border: '1px solid #E2E8F0',
                        padding: '18px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <Sparkles size={16} color="#0284C7" />
                            <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#0F2942' }}>
                                Variables Dinámicas
                            </h3>
                        </div>
                        <p style={{ margin: '0 0 12px 0', fontSize: '0.74rem', color: '#64748B', lineHeight: 1.4 }}>
                            Hacé clic en cualquier etiqueta para insertarla en el System Prompt. Se reemplazarán en tiempo real por los datos de cada paciente:
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {VARIABLE_TAGS.map(v => (
                                <button
                                    key={v.tag}
                                    onClick={() => handleInsertTag(v.tag)}
                                    title={`Insertar ${v.tag}`}
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'flex-start',
                                        gap: '2px',
                                        padding: '8px 10px',
                                        borderRadius: '8px',
                                        border: '1px solid #E0F2FE',
                                        background: '#F0F9FF',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        transition: 'all 0.15s'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = '#0284C7';
                                        e.currentTarget.style.background = '#E0F2FE';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = '#E0F2FE';
                                        e.currentTarget.style.background = '#F0F9FF';
                                    }}
                                >
                                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0284C7', fontFamily: 'monospace' }}>
                                        {v.tag}
                                    </span>
                                    <span style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                        {v.desc}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Metadatos de Auditoría */}
                    <div style={{
                        background: '#F8FAFC',
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        padding: '14px',
                        fontSize: '0.74rem',
                        color: '#64748B',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#334155' }}>
                            <Shield size={14} color="#0284C7" />
                            Auditoría de Cambios
                        </div>
                        <div>
                            Última actualización:{' '}
                            <strong style={{ color: '#0F2942' }}>
                                {lastUpdated ? new Date(lastUpdated).toLocaleString('es-AR') : 'Inicial'}
                            </strong>
                        </div>
                        {lastUser && (
                            <div>
                                Modificado por:{' '}
                                <strong style={{ color: '#0F2942' }}>{lastUser}</strong>
                            </div>
                        )}
                        <div>
                            Tokens estimados: <strong style={{ color: '#0284C7' }}>~{approxTokens}</strong> ({systemPrompt.length} caracteres)
                        </div>
                    </div>
                </div>

                {/* Columna Derecha: Editor del System Prompt */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '14px',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}>
                    {/* Barra Superior del Editor */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 18px',
                        borderBottom: '1px solid #E2E8F0',
                        background: '#FAFAFA'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Terminal size={17} color="#0F2942" />
                            <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F2942' }}>
                                Editor de Directivas del Chatbot (System Prompt)
                            </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={() => setActiveSubTab('simulator')}
                                style={{
                                    padding: '5px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid #A7F3D0',
                                    background: '#ECFDF5',
                                    color: '#059669',
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px'
                                }}
                            >
                                <Play size={13} />
                                Probar en Ambiente de Test
                            </button>

                            <button
                                onClick={handleCopy}
                                style={{
                                    padding: '5px 10px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    background: '#FFFFFF',
                                    color: copied ? '#16A34A' : '#475569',
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px'
                                }}
                            >
                                {copied ? <Check size={13} /> : <Copy size={13} />}
                                {copied ? 'Copiado' : 'Copiar'}
                            </button>
                        </div>
                    </div>

                    {/* Area de Texto o Simulador de Paciente Interactivo */}
                    {showPreview ? (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            flex: 1,
                            background: '#F8FAFC',
                            overflow: 'hidden'
                        }}>
                            {/* Barra Superior del Simulador: Escenarios y Modos */}
                            <div style={{
                                padding: '14px 18px',
                                background: '#FFFFFF',
                                borderBottom: '1px solid #E2E8F0',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '12px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                    {/* Selector de Presets de Pacientes */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#475569', marginRight: '4px' }}>
                                            Escenario:
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setPresetPatient('registrado')}
                                            style={{
                                                padding: '5px 10px',
                                                borderRadius: '6px',
                                                border: simPatientType === 'registrado' ? '1px solid #16A34A' : '1px solid #CBD5E1',
                                                background: simPatientType === 'registrado' ? '#DCFCE7' : '#FFFFFF',
                                                color: simPatientType === 'registrado' ? '#15803D' : '#475569',
                                                fontSize: '0.74rem',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '5px'
                                            }}
                                        >
                                            <UserCheck size={13} />
                                            1️⃣ Paciente Registrado (SALUS)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPresetPatient('nuevo')}
                                            style={{
                                                padding: '5px 10px',
                                                borderRadius: '6px',
                                                border: simPatientType === 'nuevo' ? '1px solid #0284C7' : '1px solid #CBD5E1',
                                                background: simPatientType === 'nuevo' ? '#E0F2FE' : '#FFFFFF',
                                                color: simPatientType === 'nuevo' ? '#0369A1' : '#475569',
                                                fontSize: '0.74rem',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '5px'
                                            }}
                                        >
                                            <UserX size={13} />
                                            2️⃣ Paciente Nuevo / No Registrado
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSimPatientType('search')}
                                            style={{
                                                padding: '5px 10px',
                                                borderRadius: '6px',
                                                border: simPatientType === 'search' || simPatientType === 'custom' ? '1px solid #9333EA' : '1px solid #CBD5E1',
                                                background: simPatientType === 'search' || simPatientType === 'custom' ? '#F3E8FF' : '#FFFFFF',
                                                color: simPatientType === 'search' || simPatientType === 'custom' ? '#7E22CE' : '#475569',
                                                fontSize: '0.74rem',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '5px'
                                            }}
                                        >
                                            <Search size={13} />
                                            Buscar en SALUS
                                        </button>
                                    </div>

                                    {/* Selector de Modo: Chat Sandbox vs Prompt Compilado */}
                                    <div style={{
                                        display: 'inline-flex',
                                        background: '#F1F5F9',
                                        padding: '2px',
                                        borderRadius: '8px',
                                        border: '1px solid #E2E8F0'
                                    }}>
                                        <button
                                            type="button"
                                            onClick={() => setSimMode('chat')}
                                            style={{
                                                padding: '4px 10px',
                                                borderRadius: '6px',
                                                border: 'none',
                                                background: simMode === 'chat' ? '#FFFFFF' : 'transparent',
                                                color: simMode === 'chat' ? '#0284C7' : '#64748B',
                                                fontWeight: 700,
                                                fontSize: '0.74rem',
                                                cursor: 'pointer',
                                                boxShadow: simMode === 'chat' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            <MessageSquare size={13} />
                                            Chat Sandbox (IA)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSimMode('prompt')}
                                            style={{
                                                padding: '4px 10px',
                                                borderRadius: '6px',
                                                border: 'none',
                                                background: simMode === 'prompt' ? '#FFFFFF' : 'transparent',
                                                color: simMode === 'prompt' ? '#0284C7' : '#64748B',
                                                fontWeight: 700,
                                                fontSize: '0.74rem',
                                                cursor: 'pointer',
                                                boxShadow: simMode === 'prompt' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            <Terminal size={13} />
                                            Prompt Compilado
                                        </button>
                                    </div>
                                </div>

                                {/* Buscador rápido si está en modo search */}
                                {simPatientType === 'search' && (
                                    <div style={{
                                        background: '#FAF5FF',
                                        border: '1px solid #E9D5FF',
                                        borderRadius: '8px',
                                        padding: '10px 14px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '8px'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Search size={15} color="#7E22CE" />
                                            <input
                                                type="text"
                                                value={simSearchQuery}
                                                onChange={(e) => handleSearchPatient(e.target.value)}
                                                placeholder="Ingresá DNI o Nombre de un paciente en SALUS (ej: 28475561 o Perez)..."
                                                style={{
                                                    flex: 1,
                                                    padding: '6px 10px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #CBD5E1',
                                                    fontSize: '0.8rem',
                                                    background: '#FFFFFF'
                                                }}
                                                autoFocus
                                            />
                                            {simSearching && <span style={{ fontSize: '0.72rem', color: '#7E22CE' }}>Buscando...</span>}
                                        </div>
                                        {simSearchResults.length > 0 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '140px', overflowY: 'auto' }}>
                                                {simSearchResults.map(p => (
                                                    <div
                                                        key={p.id || p.dni}
                                                        onClick={() => handleSelectDbPatient(p)}
                                                        style={{
                                                            padding: '6px 10px',
                                                            background: '#FFFFFF',
                                                            borderRadius: '6px',
                                                            border: '1px solid #E2E8F0',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            fontSize: '0.74rem'
                                                        }}
                                                    >
                                                        <div>
                                                            <strong style={{ color: '#0F2942' }}>{p.nombre}</strong> — DNI: {p.dni}
                                                        </div>
                                                        <div style={{ color: '#0284C7', fontWeight: 600 }}>
                                                            {p.coseguro || 'Particular'}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Franja compacta con los datos activos del paciente */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                    gap: '8px',
                                    padding: '8px 12px',
                                    background: '#F8FAFC',
                                    borderRadius: '8px',
                                    border: '1px solid #E2E8F0',
                                    fontSize: '0.74rem'
                                }}>
                                    <div>
                                        <span style={{ color: '#64748B', fontWeight: 600 }}>{'{nombre}'}: </span>
                                        <input
                                            type="text"
                                            value={simPatient.nombre}
                                            onChange={(e) => setSimPatient({ ...simPatient, nombre: e.target.value })}
                                            style={{ border: 'none', background: 'transparent', fontWeight: 700, color: '#0F2942', width: '130px', outline: 'none' }}
                                        />
                                    </div>
                                    <div>
                                        <span style={{ color: '#64748B', fontWeight: 600 }}>{'{dni}'}: </span>
                                        <input
                                            type="text"
                                            value={simPatient.dni}
                                            onChange={(e) => setSimPatient({ ...simPatient, dni: e.target.value })}
                                            style={{ border: 'none', background: 'transparent', fontWeight: 700, color: '#0F2942', width: '90px', outline: 'none' }}
                                        />
                                    </div>
                                    <div>
                                        <span style={{ color: '#64748B', fontWeight: 600 }}>{'{cobertura}'}: </span>
                                        <input
                                            type="text"
                                            value={simPatient.obraSocial}
                                            onChange={(e) => setSimPatient({ ...simPatient, obraSocial: e.target.value })}
                                            style={{ border: 'none', background: 'transparent', fontWeight: 700, color: '#0F2942', width: '140px', outline: 'none' }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{
                                            padding: '2px 8px',
                                            borderRadius: '6px',
                                            fontSize: '0.68rem',
                                            fontWeight: 800,
                                            background: simPatient.esRegistrado ? '#DCFCE7' : '#FEE2E2',
                                            color: simPatient.esRegistrado ? '#166534' : '#991B1B'
                                        }}>
                                            {simPatient.esRegistrado ? '✓ Registrado en SALUS' : '✗ No registrado'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Contenido según simMode */}
                            {simMode === 'prompt' ? (
                                <div style={{ padding: '16px', overflowY: 'auto', flex: 1, maxHeight: '520px' }}>
                                    <div style={{
                                        background: '#EFF6FF',
                                        border: '1px solid #BFDBFE',
                                        borderRadius: '8px',
                                        padding: '10px 14px',
                                        marginBottom: '12px',
                                        fontSize: '0.76rem',
                                        color: '#1E40AF',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}>
                                        <Info size={15} />
                                        <span>
                                            System Prompt completamente ensamblado para <strong>{simPatient.nombre}</strong> (DNI {simPatient.dni}) con el modelo <strong>{model}</strong>.
                                        </span>
                                    </div>
                                    <pre style={{
                                        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                                        fontSize: '0.8rem',
                                        lineHeight: 1.6,
                                        color: '#1E293B',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                        margin: 0,
                                        padding: '16px',
                                        background: '#FFFFFF',
                                        borderRadius: '8px',
                                        border: '1px solid #E2E8F0'
                                    }}>
                                        {renderPreviewText()}
                                    </pre>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '520px' }}>
                                    {/* Sugerencias de Consultas Rápidas */}
                                    <div style={{
                                        padding: '8px 14px',
                                        background: '#F1F5F9',
                                        borderBottom: '1px solid #E2E8F0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        overflowX: 'auto',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748B', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                            <Sparkles size={12} color="#0284C7" /> Pruebas rápidas:
                                        </span>
                                        {[
                                            'Hola, ¿qué turnos tengo agendados?',
                                            'Quiero pedir un turno con ginecología',
                                            'Soy nuevo y no estoy registrado en el Sanatorio',
                                            'Quiero hablar con una persona por favor',
                                            '¿Cuáles son los horarios de guardia activa?'
                                        ].map((suggestion, idx) => (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => handleSendSimMessage(suggestion)}
                                                disabled={simSending}
                                                style={{
                                                    padding: '3px 8px',
                                                    borderRadius: '12px',
                                                    border: '1px solid #CBD5E1',
                                                    background: '#FFFFFF',
                                                    fontSize: '0.7rem',
                                                    color: '#334155',
                                                    cursor: simSending ? 'not-allowed' : 'pointer',
                                                    transition: 'all 0.1s'
                                                }}
                                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#0284C7'; e.currentTarget.style.color = '#0284C7'; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.color = '#334155'; }}
                                            >
                                                {suggestion}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Transcript del Chat */}
                                    <div style={{
                                        flex: 1,
                                        overflowY: 'auto',
                                        padding: '16px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '12px',
                                        background: '#F8FAFC'
                                    }}>
                                        {simMessages.map((msg) => {
                                            const isUser = msg.sender === 'user';
                                            return (
                                                <div
                                                    key={msg.id}
                                                    style={{
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: isUser ? 'flex-end' : 'flex-start',
                                                        gap: '4px'
                                                    }}
                                                >
                                                    <div style={{
                                                        maxWidth: '85%',
                                                        padding: '10px 14px',
                                                        borderRadius: isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                                                        background: isUser ? '#DCFCE7' : '#FFFFFF',
                                                        border: isUser ? '1px solid #BBF7D0' : '1px solid #E2E8F0',
                                                        color: '#0F2942',
                                                        fontSize: '0.82rem',
                                                        lineHeight: 1.5,
                                                        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                                        wordBreak: 'break-word',
                                                        whiteSpace: 'pre-wrap'
                                                    }}>
                                                        {!isUser && (
                                                            <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#0284C7', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <Bot size={12} />
                                                                {botName} (Asistente Virtual)
                                                            </div>
                                                        )}
                                                        {msg.text}
                                                        <div style={{
                                                            fontSize: '0.65rem',
                                                            color: '#94A3B8',
                                                            textAlign: 'right',
                                                            marginTop: '4px'
                                                        }}>
                                                            {msg.time}
                                                        </div>
                                                    </div>

                                                    {/* Avisos de Handoff y Badges de IA si hubo derivación */}
                                                    {!isUser && msg.transferToAgent && (
                                                        <div style={{
                                                            maxWidth: '85%',
                                                            background: '#FEF3C7',
                                                            border: '1px solid #FCD34D',
                                                            borderRadius: '8px',
                                                            padding: '8px 12px',
                                                            fontSize: '0.74rem',
                                                            color: '#92400E',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '4px'
                                                        }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800 }}>
                                                                <AlertTriangle size={14} color="#D97706" />
                                                                <span>El bot transfirió la conversación al equipo de atención (Handoff)</span>
                                                            </div>
                                                            {msg.handoffNotice && (
                                                                <div style={{
                                                                    fontSize: '0.72rem',
                                                                    color: '#78350F',
                                                                    background: '#FFFFFF',
                                                                    padding: '6px 8px',
                                                                    borderRadius: '6px',
                                                                    border: '1px solid #FDE68A',
                                                                    whiteSpace: 'pre-wrap'
                                                                }}>
                                                                    <strong>Aviso despachado al paciente:</strong><br />
                                                                    {msg.handoffNotice}
                                                                </div>
                                                            )}
                                                            <div style={{ display: 'flex', gap: '8px', fontSize: '0.68rem', color: '#B45309' }}>
                                                                <span>Intent: <strong>{msg.intent}</strong></span>
                                                                <span>Modelo: <strong>{msg.modelUsed || model}</strong></span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {simSending && (
                                            <div style={{
                                                alignSelf: 'flex-start',
                                                padding: '8px 14px',
                                                borderRadius: '12px',
                                                background: '#FFFFFF',
                                                border: '1px solid #E2E8F0',
                                                fontSize: '0.76rem',
                                                color: '#64748B',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}>
                                                <RefreshCw size={13} className="spin" color="#0284C7" />
                                                <span>{botName} está procesando tu respuesta con OpenAI ({model})...</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Input de Mensaje de Simulación */}
                                    <div style={{
                                        padding: '12px 16px',
                                        background: '#FFFFFF',
                                        borderTop: '1px solid #E2E8F0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px'
                                    }}>
                                        <button
                                            type="button"
                                            onClick={handleClearSimChat}
                                            title="Reiniciar chat de simulación"
                                            style={{
                                                padding: '8px',
                                                borderRadius: '8px',
                                                border: '1px solid #E2E8F0',
                                                background: '#F8FAFC',
                                                color: '#64748B',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                        <input
                                            type="text"
                                            value={simInput}
                                            onChange={(e) => setSimInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    handleSendSimMessage();
                                                }
                                            }}
                                            placeholder={`Escribí un mensaje simulando ser ${simPatient.nombre}...`}
                                            disabled={simSending}
                                            style={{
                                                flex: 1,
                                                padding: '10px 14px',
                                                borderRadius: '8px',
                                                border: '1px solid #CBD5E1',
                                                fontSize: '0.82rem',
                                                color: '#0F2942',
                                                background: '#FFFFFF',
                                                outline: 'none'
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => handleSendSimMessage()}
                                            disabled={simSending || !simInput.trim()}
                                            style={{
                                                padding: '10px 18px',
                                                borderRadius: '8px',
                                                border: 'none',
                                                background: simSending || !simInput.trim() ? '#94A3B8' : 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                                                color: '#FFFFFF',
                                                fontSize: '0.82rem',
                                                fontWeight: 700,
                                                cursor: simSending || !simInput.trim() ? 'not-allowed' : 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                boxShadow: '0 2px 6px rgba(2, 132, 199, 0.25)'
                                            }}
                                        >
                                            <Send size={14} />
                                            Probar
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
                            <textarea
                                ref={textareaRef}
                                value={systemPrompt}
                                onChange={(e) => setSystemPrompt(e.target.value)}
                                placeholder="Escribe aquí las directivas del chatbot..."
                                rows={24}
                                style={{
                                    width: '100%',
                                    minHeight: '560px',
                                    padding: '18px',
                                    border: 'none',
                                    outline: 'none',
                                    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                                    fontSize: '0.84rem',
                                    lineHeight: 1.65,
                                    color: '#0F172A',
                                    background: '#FFFFFF',
                                    resize: 'vertical'
                                }}
                            />
                        </div>
                    )}

                    {/* Pie del Editor con Ayuda Rápida */}
                    <div style={{
                        padding: '10px 18px',
                        borderTop: '1px solid #E2E8F0',
                        background: '#F8FAFC',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.72rem',
                        color: '#64748B'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <CheckCircle2 size={13} color="#10B981" />
                            <span>
                                La Edge Function lee esta variable en caliente. Cada mensaje entrante en WhatsApp adoptará estas instrucciones.
                            </span>
                        </div>
                        <div>
                            <span>Líneas: {systemPrompt.split('\n').length}</span>
                        </div>
                    </div>
                </div>

            </div>

            {/* Tarjeta de Avisos de Derivación y Detección de Demoras */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                padding: '24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px'
            }}>
                {/* Header de la sección */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '12px',
                            background: unassignedQueueCount >= delayThreshold ? '#FEF3C7' : '#F0F9FF',
                            color: unassignedQueueCount >= delayThreshold ? '#D97706' : '#0284C7',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: `1px solid ${unassignedQueueCount >= delayThreshold ? '#FDE68A' : '#BAE6FD'}`
                        }}>
                            {unassignedQueueCount >= delayThreshold ? <AlertTriangle size={24} /> : <MessageSquare size={24} />}
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0F2942' }}>
                                    Avisos de Derivación y Control Dinámico de Demoras
                                </h3>
                                <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    padding: '4px 10px',
                                    borderRadius: '12px',
                                    background: unassignedQueueCount >= delayThreshold ? '#FEF2F2' : '#ECFDF5',
                                    color: unassignedQueueCount >= delayThreshold ? '#DC2626' : '#059669',
                                    border: `1px solid ${unassignedQueueCount >= delayThreshold ? '#FECACA' : '#A7F3D0'}`
                                }}>
                                    <Users size={13} />
                                    Cola actual: {unassignedQueueCount} {unassignedQueueCount === 1 ? 'paciente' : 'pacientes'} sin asignar
                                </span>
                            </div>
                            <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#64748B' }}>
                                Cuando el bot se frena para pasarle el caso a un asesor humano, despacha automáticamente el mensaje de despedida correspondiente. Si hay muchos pacientes en cola, le advierte que estamos con algunas demoras.
                            </p>
                        </div>
                    </div>

                    {/* Selector de Umbral de Activación */}
                    <div style={{
                        background: '#F8FAFC',
                        border: '1px solid #CBD5E1',
                        borderRadius: '12px',
                        padding: '10px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px'
                    }}>
                        <div>
                            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569' }}>
                                Umbral para advertir demoras:
                            </div>
                            <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                (Si hay ≥ {delayThreshold} chats sin asignar)
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                                type="range"
                                min="1"
                                max="25"
                                step="1"
                                value={delayThreshold}
                                onChange={(e) => setDelayThreshold(Number(e.target.value))}
                                style={{ width: '90px', cursor: 'pointer' }}
                            />
                            <span style={{
                                minWidth: '32px',
                                textAlign: 'center',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                background: '#FFFFFF',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.84rem',
                                fontWeight: 800,
                                color: '#0F2942'
                            }}>
                                {delayThreshold}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Grid 2 Columnas de Mensajes: Normal vs Demora */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    
                    {/* Caja 1: Mensaje Normal */}
                    <div style={{
                        background: unassignedQueueCount < delayThreshold ? '#F0FDF4' : '#F8FAFC',
                        borderRadius: '12px',
                        border: `1px solid ${unassignedQueueCount < delayThreshold ? '#86EFAC' : '#E2E8F0'}`,
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '50%',
                                    background: '#16A34A'
                                }} />
                                <strong style={{ fontSize: '0.85rem', color: '#166534' }}>
                                    Mensaje Estándar (Carga Normal)
                                </strong>
                            </div>
                            {unassignedQueueCount < delayThreshold && (
                                <span style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    background: '#DCFCE7',
                                    color: '#15803D',
                                    padding: '2px 6px',
                                    borderRadius: '6px'
                                }}>
                                    ACTUALMENTE ACTIVO
                                </span>
                            )}
                        </div>
                        <p style={{ margin: 0, fontSize: '0.74rem', color: '#475569' }}>
                            Se envía cuando la cola de espera es menor a {delayThreshold} conversaciones:
                        </p>
                        <textarea
                            value={handoffNormal}
                            onChange={(e) => setHandoffNormal(e.target.value)}
                            rows={5}
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.82rem',
                                lineHeight: 1.5,
                                color: '#0F2942',
                                background: '#FFFFFF',
                                resize: 'vertical'
                            }}
                            placeholder="Mensaje de derivación habitual..."
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                onClick={() => setHandoffNormal(DEFAULT_HANDOFF_NORMAL)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#64748B',
                                    fontSize: '0.72rem',
                                    cursor: 'pointer',
                                    textDecoration: 'underline'
                                }}
                            >
                                Restaurar mensaje original
                            </button>
                        </div>
                    </div>

                    {/* Caja 2: Mensaje de Demora */}
                    <div style={{
                        background: unassignedQueueCount >= delayThreshold ? '#FFFBEB' : '#F8FAFC',
                        borderRadius: '12px',
                        border: `1px solid ${unassignedQueueCount >= delayThreshold ? '#FCD34D' : '#E2E8F0'}`,
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '50%',
                                    background: '#D97706'
                                }} />
                                <strong style={{ fontSize: '0.85rem', color: '#92400E' }}>
                                    Mensaje de Alta Demora (Cola Saturada)
                                </strong>
                            </div>
                            {unassignedQueueCount >= delayThreshold && (
                                <span style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    background: '#FEF3C7',
                                    color: '#B45309',
                                    padding: '2px 6px',
                                    borderRadius: '6px'
                                }}>
                                    ACTUALMENTE ACTIVO
                                </span>
                            )}
                        </div>
                        <p style={{ margin: 0, fontSize: '0.74rem', color: '#475569' }}>
                            Se envía automáticamente si hay {delayThreshold} o más mensajes sin responder:
                        </p>
                        <textarea
                            value={handoffDelay}
                            onChange={(e) => setHandoffDelay(e.target.value)}
                            rows={5}
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.82rem',
                                lineHeight: 1.5,
                                color: '#0F2942',
                                background: '#FFFFFF',
                                resize: 'vertical'
                            }}
                            placeholder="Mensaje de advertencia de demoras..."
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                onClick={() => setHandoffDelay(DEFAULT_HANDOFF_DELAY)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#64748B',
                                    fontSize: '0.72rem',
                                    cursor: 'pointer',
                                    textDecoration: 'underline'
                                }}
                            >
                                Restaurar mensaje original
                            </button>
                        </div>
                    </div>

                </div>
            </div>
            </>
            )}

        </div>
    );
}
