import React, { useState, useEffect, useRef } from 'react';
import { 
    Bot, Save, RotateCcw, Copy, Check, Sparkles, Sliders, Shield, 
    AlertCircle, Info, RefreshCw, Eye, EyeOff, Terminal, CheckCircle2,
    Cpu, Activity, Zap, Users, MessageSquare, Clock, AlertTriangle
} from 'lucide-react';
import { 
    fetchChatbotConfig, 
    saveChatbotConfig, 
    DEFAULT_CHATBOT_SYSTEM_PROMPT,
    DEFAULT_HANDOFF_NORMAL,
    DEFAULT_HANDOFF_DELAY
} from '../../services/contactCenterService';

const VARIABLE_TAGS = [
    { tag: '{nombre}', label: 'Nombre Paciente', desc: 'Nombre completo o de pila detectado' },
    { tag: '{dni}', label: 'DNI Paciente', desc: 'DNI validado del paciente' },
    { tag: '{cobertura}', label: 'Obra Social / Prepaga', desc: 'Cobertura médica o Particular' },
    { tag: '{turnos}', label: 'Turnos Próximos', desc: 'Lista contextual de turnos agendados en Salus' }
];

export default function ContactCenterConfigTab({ currentUser, addToast }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showPreview, setShowPreview] = useState(false);

    // Form state - AI Bot
    const [systemPrompt, setSystemPrompt] = useState(DEFAULT_CHATBOT_SYSTEM_PROMPT);
    const [botName, setBotName] = useState('Dora');
    const [model, setModel] = useState('gpt-4o');
    const [temperature, setTemperature] = useState('0.3');
    const [lastUpdated, setLastUpdated] = useState(null);
    const [lastUser, setLastUser] = useState(null);

    // Form state - Handoff & Delays
    const [handoffNormal, setHandoffNormal] = useState(DEFAULT_HANDOFF_NORMAL);
    const [handoffDelay, setHandoffDelay] = useState(DEFAULT_HANDOFF_DELAY);
    const [delayThreshold, setDelayThreshold] = useState(5);
    const [unassignedQueueCount, setUnassignedQueueCount] = useState(0);

    const textareaRef = useRef(null);

    // Cargar configuración activa
    const loadConfig = async () => {
        setLoading(true);
        try {
            const cfg = await fetchChatbotConfig();
            setSystemPrompt(cfg.systemPrompt || DEFAULT_CHATBOT_SYSTEM_PROMPT);
            setBotName(cfg.botName || 'Dora');
            setModel(cfg.model || 'gpt-4o');
            setTemperature(cfg.temperature || '0.3');
            setHandoffNormal(cfg.handoffNormal || DEFAULT_HANDOFF_NORMAL);
            setHandoffDelay(cfg.handoffDelay || DEFAULT_HANDOFF_DELAY);
            setDelayThreshold(cfg.delayThreshold ?? 5);
            setUnassignedQueueCount(cfg.unassignedQueueCount || 0);
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

    // Guardar cambios
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
                user: userIdentifier
            });
            setLastUpdated(new Date().toISOString());
            setLastUser(userIdentifier);
            addToast?.('¡Configuración del Chatbot y Derivaciones actualizada exitosamente!', 'success');
        } catch (err) {
            console.error('Error guardando config:', err);
            addToast?.('Error al guardar la configuración en la base de datos', 'error');
        } finally {
            setSaving(false);
        }
    };

    // Restablecer al prompt de fábrica
    const handleResetDefault = () => {
        if (window.confirm('¿Estás seguro de restablecer los valores al texto predeterminado de fábrica? Perderás los cambios no guardados.')) {
            setSystemPrompt(DEFAULT_CHATBOT_SYSTEM_PROMPT);
            setModel('gpt-4o');
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

    // Vista previa interpolada
    const renderPreviewText = () => {
        let text = systemPrompt;
        text = text.replace(/\{nombre\}/g, 'María Belén Gómez');
        text = text.replace(/\{dni\}/g, '28475561');
        text = text.replace(/\{cobertura\}/g, 'OSP (Obra Social Provincia) - Plan Tradicional');
        text = text.replace(/\{turnos\}/g, '\nTURNOS PRÓXIMOS AGENDADOS DEL PACIENTE EN EL SANATORIO:\n1. Fecha: 28/09/2026 | Hora: 16:30 hs | Profesional: Dra. Gómez Carrizo | Especialidad: Ginecología | Sede: Sede San Luis (San Luis 432 Oeste)\n');
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
                                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                    Modelo OpenAI
                                </label>
                                <select
                                    value={model}
                                    onChange={(e) => setModel(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.85rem',
                                        color: '#0F2942',
                                        background: '#F8FAFC',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <option value="gpt-4o">gpt-4o (Recomendado - Máxima empatía y precisión)</option>
                                    <option value="gpt-4o-mini">gpt-4o-mini (Respuesta ultra rápida)</option>
                                    <option value="gpt-4.1">gpt-4.1</option>
                                </select>
                            </div>

                            {/* Temperatura */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <label style={{ fontSize: '0.76rem', fontWeight: 700, color: '#475569' }}>
                                        Temperatura: <strong style={{ color: '#0284C7' }}>{temperature}</strong>
                                    </label>
                                    <span style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                        {parseFloat(temperature) <= 0.3 ? 'Preciso / Clínico' : 'Conversacional / Creativo'}
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="0.0"
                                    max="1.0"
                                    step="0.05"
                                    value={temperature}
                                    onChange={(e) => setTemperature(e.target.value)}
                                    style={{ width: '100%', cursor: 'pointer' }}
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#94A3B8', marginTop: '2px' }}>
                                    <span>0.0 (Estricto)</span>
                                    <span>0.3 (Recomendado)</span>
                                    <span>1.0 (Creativo)</span>
                                </div>
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
                                onClick={() => setShowPreview(!showPreview)}
                                style={{
                                    padding: '5px 10px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    background: showPreview ? '#EFF6FF' : '#FFFFFF',
                                    color: showPreview ? '#0284C7' : '#475569',
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px'
                                }}
                            >
                                {showPreview ? <EyeOff size={13} /> : <Eye size={13} />}
                                {showPreview ? 'Ocultar Vista Previa' : 'Simular con Paciente'}
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

                    {/* Area de Texto o Vista Previa */}
                    {showPreview ? (
                        <div style={{
                            padding: '18px',
                            background: '#F8FAFC',
                            flex: 1,
                            overflowY: 'auto',
                            maxHeight: '620px'
                        }}>
                            <div style={{
                                background: '#EFF6FF',
                                border: '1px solid #BFDBFE',
                                borderRadius: '8px',
                                padding: '10px 14px',
                                marginBottom: '14px',
                                fontSize: '0.78rem',
                                color: '#1E40AF',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <Info size={16} />
                                <span>
                                    <strong>Simulación activa:</strong> Mostrando cómo la Edge Function ensambla el prompt con datos reales de prueba de un paciente antes de invocar OpenAI.
                                </span>
                            </div>
                            <pre style={{
                                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                                fontSize: '0.82rem',
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

        </div>
    );
}
