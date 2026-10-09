import React, { useState, useEffect, useRef } from 'react';
import { 
    Bot, Save, RotateCcw, Copy, Check, Sparkles, Sliders, Shield, 
    AlertCircle, Info, RefreshCw, Eye, EyeOff, Terminal, CheckCircle2,
    Cpu, Activity, Zap, Users, MessageSquare, Clock, AlertTriangle,
    Send, Trash2, Search, UserCheck, UserX, CornerDownLeft, Play, ArrowRight,
    GitBranch, Layers, User, Globe, Plus, Edit3, RotateCw, Loader2
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
import { 
    getContactCenterQuickReplies, 
    filterQuickReplies, 
    saveQuickReply, 
    deleteOrResetQuickReply, 
    syncQuickRepliesFromDb 
} from '../../data/contactCenterQuickReplies';

const VARIABLE_TAGS = [
    { tag: '{nombre}', label: 'Nombre Paciente', desc: 'Nombre completo o de pila detectado' },
    { tag: '{dni}', label: 'DNI Paciente', desc: 'DNI validado del paciente' },
    { tag: '{cobertura}', label: 'Obra Social y Plan', desc: 'Cobertura médica o Particular' },
    { tag: '{turnos}', label: 'Turnos Próximos', desc: 'Lista contextual de turnos agendados en Salus' },
    { tag: '{bot_name}', label: 'Nombre del Asistente', desc: 'Nombre asignado al bot (ej: Dora / Betina)' }
];

export default function ContactCenterConfigTab({ currentUser, activeAgent, addToast }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);
    const [activeSubTab, setActiveSubTab] = useState('tree'); // 'tree' | 'quick_replies' | 'editor' | 'simulator'
    const [botTreeNodes, setBotTreeNodes] = useState(DEFAULT_BOT_TREE_NODES);
    const [sandboxInitialMessage, setSandboxInitialMessage] = useState('');
    const [sandboxInitialPatientType, setSandboxInitialPatientType] = useState('registrado');

    // Estados Respuestas Rápidas (Mapeo por Usuario / Institucional)
    const currentAgentId = activeAgent?.id || currentUser?.usuario || 'daguilera';
    const [quickRepliesList, setQuickRepliesList] = useState(() => getContactCenterQuickReplies(currentAgentId));
    const [qrFilter, setQrFilter] = useState('');
    const [qrScopeFilter, setQrScopeFilter] = useState('all'); // 'all' | 'me' | 'institutional'
    const [qrCategoryFilter, setQrCategoryFilter] = useState('all');
    const [editingQuickReply, setEditingQuickReply] = useState(null);
    const [isSavingQuickReply, setIsSavingQuickReply] = useState(false);

    useEffect(() => {
        syncQuickRepliesFromDb(currentAgentId).then(list => {
            if (list && list.length > 0) setQuickRepliesList(list);
        }).catch(() => {});
    }, [currentAgentId]);

    const handleOpenEditQuickReply = (qr) => {
        setEditingQuickReply({
            id: qr.id || null,
            dbId: qr.dbId || null,
            shortcut: qr.shortcut || '',
            originalShortcut: qr.shortcut || '',
            title: qr.title || '',
            content: qr.content || '',
            category: qr.category || 'general',
            isPersonal: Boolean(qr.isPersonal),
            isNew: false
        });
    };

    const handleOpenNewQuickReply = () => {
        setEditingQuickReply({
            id: null,
            dbId: null,
            shortcut: '',
            originalShortcut: '',
            title: '',
            content: '',
            category: 'general',
            isPersonal: true,
            isNew: true
        });
    };

    const handleSaveQuickReplyAction = async (scope) => {
        if (!editingQuickReply) return;
        const cleanShortcut = editingQuickReply.shortcut.replace(/^\//, '').trim();
        if (!cleanShortcut) {
            addToast?.('Indica un comando o atajo (ej: rx o saludo)', 'error');
            return;
        }
        if (!editingQuickReply.content.trim()) {
            addToast?.('El contenido del mensaje no puede estar vacío', 'error');
            return;
        }

        setIsSavingQuickReply(true);
        try {
            const updatedList = await saveQuickReply({
                id: editingQuickReply.dbId || editingQuickReply.id,
                shortcut: cleanShortcut,
                originalShortcut: editingQuickReply.originalShortcut,
                title: editingQuickReply.title.trim() || cleanShortcut,
                content: editingQuickReply.content.trim(),
                category: editingQuickReply.category || 'general',
                scope,
                agentId: currentAgentId
            });

            setQuickRepliesList(updatedList);
            setEditingQuickReply(null);
            if (scope === 'me') {
                addToast?.(`Atajo "/${cleanShortcut}" guardado solo para tu usuario (${activeAgent?.name || currentAgentId})`, 'success');
            } else {
                addToast?.(`Atajo "/${cleanShortcut}" guardado como plantilla oficial para todo el equipo`, 'success');
            }
        } catch (err) {
            console.error('Error guardando atajo:', err);
            addToast?.(`Error al guardar: ${err.message || 'Intente nuevamente'}`, 'error');
        } finally {
            setIsSavingQuickReply(false);
        }
    };

    const handleResetQuickReplyAction = async (qr) => {
        if (!window.confirm(`¿Deseas restablecer el atajo "/${qr.shortcut}" a la versión institucional oficial? Perderás tu personalización.`)) {
            return;
        }

        setIsSavingQuickReply(true);
        try {
            const updatedList = await deleteOrResetQuickReply(qr, currentAgentId);
            setQuickRepliesList(updatedList);
            addToast?.(`Atajo "/${qr.shortcut}" restablecido a la versión oficial`, 'info');
        } catch (err) {
            console.error('Error restableciendo respuesta rápida:', err);
            addToast?.('Error al restablecer la respuesta rápida', 'error');
        } finally {
            setIsSavingQuickReply(false);
        }
    };

    const handleDeleteQuickReplyAction = async (qr) => {
        if (!window.confirm(`¿Seguro que deseas eliminar el atajo "/${qr.shortcut}"?`)) {
            return;
        }

        setIsSavingQuickReply(true);
        try {
            const updatedList = await deleteOrResetQuickReply(qr, currentAgentId);
            setQuickRepliesList(updatedList);
            addToast?.(`Atajo "/${qr.shortcut}" eliminado`, 'info');
        } catch (err) {
            console.error('Error eliminando respuesta rápida:', err);
            addToast?.('Error al eliminar la respuesta rápida', 'error');
        } finally {
            setIsSavingQuickReply(false);
        }
    };

    // Form state - AI Bot
    const [systemPrompt, setSystemPrompt] = useState(DEFAULT_CHATBOT_SYSTEM_PROMPT);
    const [botName, setBotName] = useState('Dora');
    const [model, setModel] = useState('gpt-5.4-mini');
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
            setModel(cfg.model || 'gpt-5.4-mini');
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
            setModel('gpt-5.4-mini');
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

            {/* Selector de Sub-Pestañas: Árbol Conversacional vs Respuestas Rápidas vs Parámetros & Prompt vs Simulador Sandbox */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
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
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: 'none',
                        background: activeSubTab === 'tree' ? 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)' : 'transparent',
                        color: activeSubTab === 'tree' ? '#FFFFFF' : '#475569',
                        fontWeight: 800,
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        boxShadow: activeSubTab === 'tree' ? '0 2px 6px rgba(2, 132, 199, 0.25)' : 'none',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <GitBranch size={15} />
                    🌳 Flujograma del Bot
                </button>

                <button
                    type="button"
                    onClick={() => setActiveSubTab('quick_replies')}
                    style={{
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: 'none',
                        background: activeSubTab === 'quick_replies' ? 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)' : 'transparent',
                        color: activeSubTab === 'quick_replies' ? '#FFFFFF' : '#475569',
                        fontWeight: 800,
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        boxShadow: activeSubTab === 'quick_replies' ? '0 2px 6px rgba(2, 132, 199, 0.25)' : 'none',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <Zap size={15} />
                    ⚡ Respuestas Rápidas (Atajos)
                </button>

                <button
                    type="button"
                    onClick={() => setActiveSubTab('editor')}
                    style={{
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: 'none',
                        background: activeSubTab === 'editor' ? 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)' : 'transparent',
                        color: activeSubTab === 'editor' ? '#FFFFFF' : '#475569',
                        fontWeight: 800,
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        boxShadow: activeSubTab === 'editor' ? '0 2px 6px rgba(2, 132, 199, 0.25)' : 'none',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <Sliders size={15} />
                    ⚙️ Prompt & Parámetros
                </button>

                <button
                    type="button"
                    onClick={() => setActiveSubTab('simulator')}
                    style={{
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: 'none',
                        background: activeSubTab === 'simulator' ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)' : 'transparent',
                        color: activeSubTab === 'simulator' ? '#FFFFFF' : '#475569',
                        fontWeight: 800,
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        boxShadow: activeSubTab === 'simulator' ? '0 2px 6px rgba(16, 185, 129, 0.25)' : 'none',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <Play size={15} />
                    🧪 Simulador Sandbox
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
                                    <optgroup label="⭐ Modelos de Alta Eficiencia (Recomendados para Producción - 97% Ahorro)">
                                        <option value="gpt-4o-mini">gpt-4o-mini (⭐ Recomendado - $0.15/1M - Máximo Ahorro y Rapidez)</option>
                                        <option value="gpt-5.4-mini">gpt-5.4-mini (Próxima Generación Mini - $0.25/1M)</option>
                                        <option value="gpt-5-mini">gpt-5-mini (GPT-5 versión liviana - $0.25/1M)</option>
                                        <option value="o3-mini">o3-mini (Razonamiento clínico y triage rápido - $1.10/1M)</option>
                                    </optgroup>
                                    <optgroup label="⚡ Modelos Flagship / Frontier (Mayor Capacidad - Alto Costo de Tokens)">
                                        <option value="gpt-4o">gpt-4o ($2.50/1M - Omni balanceado)</option>
                                        <option value="gpt-5.5">gpt-5.5 ($5.00/1M - Flagship Última Generación)</option>
                                        <option value="gpt-5.4">gpt-5.4 ($3.50/1M - Alto rendimiento)</option>
                                        <option value="gpt-5">gpt-5 ($3.00/1M - Motor Base GPT-5)</option>
                                        <option value="o1">o1 ($15.00/1M - Razonamiento profundo)</option>
                                        <option value="chatgpt-4o-latest">chatgpt-4o-latest (Versión continua GPT-4o)</option>
                                    </optgroup>
                                </select>
                                {model === 'gpt-4o-mini' ? (
                                    <div style={{ marginTop: '6px', fontSize: '0.72rem', color: '#059669', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <CheckCircle2 size={13} />
                                        <span>Modelo óptimo seleccionado. Costo estimado por 10.000 mensajes: <strong>~$4 USD</strong>.</span>
                                    </div>
                                ) : (
                                    <div style={{ marginTop: '6px', fontSize: '0.72rem', color: '#D97706', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <AlertTriangle size={13} />
                                        <span>Modelo de alto consumo. Con <strong>gpt-4o-mini</strong> ahorras hasta un 96.8% en tokens.</span>
                                    </div>
                                )}
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

                    {/* Area de Texto del System Prompt */}
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

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* VISTA 4: GESTIÓN DE RESPUESTAS RÁPIDAS Y ATAJOS (CONFIGURACIÓN)   */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            {activeSubTab === 'quick_replies' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Tarjeta Informativa Superior */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '16px',
                        border: '1px solid #E2E8F0',
                        padding: '20px 24px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '16px'
                    }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                    width: '36px', height: '36px', borderRadius: '10px',
                                    background: '#E0F2FE', color: '#0284C7',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <Zap size={20} />
                                </div>
                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F2942' }}>
                                    Catálogo de Respuestas Rápidas y Atajos
                                </h3>
                            </div>
                            <p style={{ margin: '6px 0 0 0', fontSize: '0.8rem', color: '#64748B', maxWidth: '780px', lineHeight: 1.45 }}>
                                Las operadoras invocan estos atajos escribiendo <strong style={{ color: '#0284C7' }}>/atajo</strong> en el chat o desde el botón contextual. Podés personalizar atajos <strong style={{ color: '#7C3AED' }}>solo para tu usuario</strong> sin alterar a tus compañeras, o publicar plantillas institucionales <strong style={{ color: '#0369A1' }}>para todo el equipo</strong>.
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', fontSize: '0.74rem' }}>
                                <span style={{ color: '#475569', fontWeight: 600 }}>👤 Sesión activa:</span>
                                <span style={{
                                    background: '#F1F5F9', color: '#0284C7', fontWeight: 700, padding: '2px 8px', borderRadius: '6px'
                                }}>
                                    {activeAgent?.name || currentAgentId} (@{currentAgentId})
                                </span>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleOpenNewQuickReply}
                            style={{
                                padding: '10px 18px',
                                borderRadius: '10px',
                                border: 'none',
                                background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                                color: '#FFFFFF',
                                fontSize: '0.82rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)'
                            }}
                        >
                            <Plus size={16} />
                            Nueva Respuesta Rápida
                        </button>
                    </div>

                    {/* Barra de Filtros, Ámbito y Búsqueda */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '14px',
                        border: '1px solid #E2E8F0',
                        padding: '16px 20px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                    }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '12px'
                        }}>
                            {/* Tabs de Ámbito */}
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                    type="button"
                                    onClick={() => setQrScopeFilter('all')}
                                    style={{
                                        padding: '7px 14px', borderRadius: '8px', fontSize: '0.76rem', fontWeight: 700,
                                        border: qrScopeFilter === 'all' ? '1px solid #0284C7' : '1px solid #E2E8F0',
                                        background: qrScopeFilter === 'all' ? '#F0F9FF' : '#FFFFFF',
                                        color: qrScopeFilter === 'all' ? '#0284C7' : '#64748B',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Todas ({filterQuickReplies('', currentAgentId, 'all').length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setQrScopeFilter('me')}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '5px',
                                        padding: '7px 14px', borderRadius: '8px', fontSize: '0.76rem', fontWeight: 700,
                                        border: qrScopeFilter === 'me' ? '1px solid #7C3AED' : '1px solid #E2E8F0',
                                        background: qrScopeFilter === 'me' ? '#FAF5FF' : '#FFFFFF',
                                        color: qrScopeFilter === 'me' ? '#7C3AED' : '#64748B',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <User size={13} /> Solo para mí ({filterQuickReplies('', currentAgentId, 'me').length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setQrScopeFilter('institutional')}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '5px',
                                        padding: '7px 14px', borderRadius: '8px', fontSize: '0.76rem', fontWeight: 700,
                                        border: qrScopeFilter === 'institutional' ? '1px solid #0D9488' : '1px solid #E2E8F0',
                                        background: qrScopeFilter === 'institutional' ? '#F0FDFA' : '#FFFFFF',
                                        color: qrScopeFilter === 'institutional' ? '#0D9488' : '#64748B',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <Globe size={13} /> Para todos / Institucionales ({filterQuickReplies('', currentAgentId, 'institutional').length})
                                </button>
                            </div>

                            {/* Dropdown de Categoría */}
                            <select
                                value={qrCategoryFilter}
                                onChange={(e) => setQrCategoryFilter(e.target.value)}
                                style={{
                                    padding: '7px 12px', borderRadius: '8px', border: '1px solid #CBD5E1',
                                    fontSize: '0.76rem', fontWeight: 600, color: '#334155', background: '#FFFFFF', outline: 'none'
                                }}
                            >
                                <option value="all">Todas las categorías</option>
                                <option value="general">General</option>
                                <option value="saludo">Saludos de Agente</option>
                                <option value="medicos">Médicos / Especialistas</option>
                                <option value="estudios">Estudios y Radiología</option>
                                <option value="laboratorio">Laboratorio / Extracciones</option>
                                <option value="chequeo">Chequeo Preventivo</option>
                                <option value="cierre">Cierre y Despedida</option>
                            </select>
                        </div>

                        {/* Buscador de texto */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            border: '1.5px solid #CBD5E1', borderRadius: '8px',
                            padding: '8px 12px', background: '#FFFFFF'
                        }}>
                            <Search size={16} color="#64748B" />
                            <input 
                                type="text"
                                placeholder="Buscar por comando (/rx, /dan, /bosi), título descriptivo o texto del mensaje..."
                                value={qrFilter}
                                onChange={(e) => setQrFilter(e.target.value)}
                                style={{ flex: 1, border: 'none', outline: 'none', fontSize: '0.84rem', color: '#1E293B' }}
                            />
                            {qrFilter && (
                                <button
                                    type="button"
                                    onClick={() => setQrFilter('')}
                                    style={{ border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer', padding: '2px' }}
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Grilla de Atajos y Respuestas */}
                    {(() => {
                        let displayed = filterQuickReplies(qrFilter, currentAgentId, qrScopeFilter);
                        if (qrCategoryFilter !== 'all') {
                            displayed = displayed.filter(r => r.category === qrCategoryFilter);
                        }

                        if (displayed.length === 0) {
                            return (
                                <div style={{
                                    background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0',
                                    padding: '40px', textAlign: 'center', color: '#94A3B8', fontSize: '0.86rem'
                                }}>
                                    No se encontraron respuestas rápidas con los filtros seleccionados.
                                </div>
                            );
                        }

                        return (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
                                gap: '14px'
                            }}>
                                {displayed.map(qr => (
                                    <div
                                        key={qr.id || qr.shortcut}
                                        style={{
                                            background: qr.isPersonal ? '#FAF5FF' : '#FFFFFF',
                                            borderRadius: '14px',
                                            border: qr.isPersonal ? '1.5px solid #DDD6FE' : '1px solid #E2E8F0',
                                            padding: '16px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'space-between',
                                            gap: '12px',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                                            transition: 'transform 0.1s ease, box-shadow 0.1s ease'
                                        }}
                                    >
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                                                    <span style={{
                                                        background: '#E0F2FE', color: '#0284C7', fontWeight: 800,
                                                        fontSize: '0.82rem', padding: '3px 8px', borderRadius: '6px'
                                                    }}>
                                                        /{qr.shortcut}
                                                    </span>
                                                    <strong style={{ fontSize: '0.86rem', color: '#1E293B' }}>
                                                        {qr.title}
                                                    </strong>
                                                </div>

                                                {/* Scope Badge */}
                                                {qr.isPersonal ? (
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '3px',
                                                        fontSize: '0.64rem', fontWeight: 700, padding: '2px 7px',
                                                        borderRadius: '6px', background: '#EDE9FE', color: '#6D28D9'
                                                    }}>
                                                        <User size={10} /> Solo para mí
                                                    </span>
                                                ) : (
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '3px',
                                                        fontSize: '0.64rem', fontWeight: 700, padding: '2px 7px',
                                                        borderRadius: '6px', background: '#F1F5F9', color: '#475569'
                                                    }}>
                                                        <Globe size={10} /> Para todos
                                                    </span>
                                                )}
                                            </div>

                                            {qr.isPersonal && qr.hasGlobalFallback && (
                                                <div style={{ fontSize: '0.66rem', color: '#7C3AED', fontWeight: 600, marginTop: '4px' }}>
                                                    (Sobrescribe versión institucional para tu sesión)
                                                </div>
                                            )}

                                            <div style={{
                                                margin: '10px 0 0 0',
                                                fontSize: '0.78rem',
                                                color: '#475569',
                                                lineHeight: 1.45,
                                                whiteSpace: 'pre-line',
                                                maxHeight: '120px',
                                                overflowY: 'auto',
                                                paddingRight: '4px'
                                            }}>
                                                {qr.content}
                                            </div>
                                        </div>

                                        {/* Card Footer Actions */}
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            paddingTop: '10px',
                                            borderTop: '1px solid #F1F5F9'
                                        }}>
                                            <span style={{
                                                fontSize: '0.66rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase'
                                            }}>
                                                {qr.category || 'general'}
                                            </span>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenEditQuickReply(qr)}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: '4px',
                                                        padding: '4px 10px', borderRadius: '6px', border: '1px solid #CBD5E1',
                                                        background: '#FFFFFF', color: '#334155', fontSize: '0.72rem', fontWeight: 600,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <Edit3 size={12} /> Editar
                                                </button>

                                                {qr.isPersonal && qr.hasGlobalFallback && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleResetQuickReplyAction(qr)}
                                                        title="Volver a la versión institucional oficial"
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: '4px',
                                                            padding: '4px 10px', borderRadius: '6px', border: '1px solid #DDD6FE',
                                                            background: '#FFFFFF', color: '#7C3AED', fontSize: '0.72rem', fontWeight: 600,
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        <RotateCw size={12} /> Restablecer
                                                    </button>
                                                )}

                                                {qr.isPersonal && !qr.hasGlobalFallback && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteQuickReplyAction(qr)}
                                                        title="Eliminar este atajo personal"
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: '4px',
                                                            padding: '4px 10px', borderRadius: '6px', border: '1px solid #FCA5A5',
                                                            background: '#FEF2F2', color: '#DC2626', fontSize: '0.72rem', fontWeight: 600,
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        <Trash2 size={12} /> Eliminar
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* SUBMODAL EDITOR: CAMBIAR SOLO PARA MÍ vs CAMBIAR PARA TODOS       */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            {editingQuickReply && (
                <div 
                    style={{
                        position: 'fixed', inset: 0, zIndex: 10050,
                        background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
                    }} 
                    onClick={() => !isSavingQuickReply && setEditingQuickReply(null)}
                >
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: '#FFFFFF', width: '100%', maxWidth: '580px',
                            borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #E2E8F0'
                        }}
                    >
                        {/* Cabecera del Editor */}
                        <div style={{
                            padding: '16px 20px', borderBottom: '1px solid #E2E8F0',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            background: '#F8FAFC'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                    width: '34px', height: '34px', borderRadius: '8px',
                                    background: '#E0F2FE', color: '#0284C7',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <Zap size={18} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0F172A' }}>
                                        {editingQuickReply.isNew ? 'Nueva Respuesta Rápida' : `Editar Atajo /${editingQuickReply.shortcut}`}
                                    </h3>
                                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748B' }}>
                                        Operadora activa: <strong style={{ color: '#0284C7' }}>{activeAgent?.name || currentAgentId}</strong>
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => !isSavingQuickReply && setEditingQuickReply(null)}
                                style={{ border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer', padding: '4px' }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Formulario */}
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '68vh', overflowY: 'auto' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                        Comando / Atajo (sin espacios) *
                                    </label>
                                    <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid #CBD5E1', borderRadius: '8px', overflow: 'hidden', background: '#F8FAFC' }}>
                                        <span style={{ padding: '0 8px', color: '#0284C7', fontWeight: 800, fontSize: '0.86rem' }}>/</span>
                                        <input 
                                            type="text"
                                            placeholder="ej: rx, saludo, lab"
                                            value={editingQuickReply.shortcut}
                                            onChange={(e) => setEditingQuickReply(prev => ({ ...prev, shortcut: e.target.value.replace(/^\//, '').toLowerCase().replace(/\s+/g, '') }))}
                                            style={{ flex: 1, border: 'none', background: '#FFFFFF', padding: '8px 10px', fontSize: '0.84rem', outline: 'none' }}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                        Título identificador *
                                    </label>
                                    <input 
                                        type="text"
                                        placeholder="ej: Rayos X / Guardia Pasiva"
                                        value={editingQuickReply.title}
                                        onChange={(e) => setEditingQuickReply(prev => ({ ...prev, title: e.target.value }))}
                                        style={{ width: '100%', border: '1.5px solid #CBD5E1', borderRadius: '8px', padding: '8px 10px', fontSize: '0.84rem', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                    Categoría
                                </label>
                                <select
                                    value={editingQuickReply.category || 'general'}
                                    onChange={(e) => setEditingQuickReply(prev => ({ ...prev, category: e.target.value }))}
                                    style={{ width: '100%', border: '1.5px solid #CBD5E1', borderRadius: '8px', padding: '8px 10px', fontSize: '0.84rem', outline: 'none', background: '#FFFFFF' }}
                                >
                                    <option value="general">General</option>
                                    <option value="saludo">Saludos de Agente</option>
                                    <option value="medicos">Médicos / Especialistas</option>
                                    <option value="estudios">Estudios y Radiología</option>
                                    <option value="laboratorio">Laboratorio / Extracciones</option>
                                    <option value="chequeo">Chequeo Preventivo</option>
                                    <option value="cierre">Cierre y Despedida</option>
                                </select>
                            </div>

                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <label style={{ fontSize: '0.74rem', fontWeight: 700, color: '#334155' }}>
                                        Texto del mensaje *
                                    </label>
                                    <span style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                        Variables automáticas (clic para insertar):
                                    </span>
                                </div>

                                {/* Chips de variables dinámicas */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                                    {[
                                        { code: '{{name}}', label: '👤 Paciente' },
                                        { code: '{{agent_name}}', label: '👩‍💼 Mi Nombre' },
                                        { code: '{{tipo_consulta}}', label: '📋 Consulta' },
                                        { code: '{{medico}}', label: '🩺 Médico' },
                                        { code: '{{sede}}', label: '🏥 Sede 1' }
                                    ].map(variable => (
                                        <button
                                            key={variable.code}
                                            type="button"
                                            onClick={() => {
                                                setEditingQuickReply(prev => ({
                                                    ...prev,
                                                    content: (prev.content ? prev.content + ' ' : '') + variable.code
                                                }));
                                            }}
                                            style={{
                                                border: '1px dashed #93C5FD', background: '#EFF6FF', color: '#1E40AF',
                                                borderRadius: '6px', padding: '3px 8px', fontSize: '0.7rem', fontWeight: 600,
                                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px'
                                            }}
                                        >
                                            <Plus size={10} /> {variable.label}
                                        </button>
                                    ))}
                                </div>

                                <textarea
                                    rows={5}
                                    placeholder="Escribe el texto de la respuesta rápida..."
                                    value={editingQuickReply.content}
                                    onChange={(e) => setEditingQuickReply(prev => ({ ...prev, content: e.target.value }))}
                                    style={{
                                        width: '100%', border: '1.5px solid #CBD5E1', borderRadius: '8px',
                                        padding: '10px', fontSize: '0.84rem', lineHeight: 1.45, outline: 'none',
                                        fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            {/* Banner explicativo del mapeo por usuario */}
                            <div style={{
                                padding: '10px 14px', borderRadius: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0',
                                fontSize: '0.73rem', color: '#475569', lineHeight: 1.4
                            }}>
                                <strong style={{ color: '#0F172A' }}>💡 ¿Cómo deseas guardar este atajo?</strong>
                                <ul style={{ margin: '4px 0 0 0', paddingLeft: '18px' }}>
                                    <li><strong>"Cambiar solo para mí":</strong> Quedará registrado únicamente en tu sesión ({activeAgent?.name || currentAgentId}). Las otras operadoras conservarán la versión institucional.</li>
                                    <li><strong>"Cambiar para todos":</strong> Se actualizará como respuesta oficial compartida para todo el equipo del Contact Center.</li>
                                </ul>
                            </div>
                        </div>

                        {/* Botones de acción principales solicitados por el usuario */}
                        <div style={{
                            padding: '14px 20px', borderTop: '1px solid #E2E8F0', background: '#F8FAFC',
                            display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '10px'
                        }}>
                            <button
                                type="button"
                                disabled={isSavingQuickReply}
                                onClick={() => setEditingQuickReply(null)}
                                style={{
                                    padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1',
                                    background: '#FFFFFF', color: '#475569', fontSize: '0.78rem', fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                Cancelar
                            </button>

                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {/* Botón: Cambiar solo para mí */}
                                <button
                                    type="button"
                                    disabled={isSavingQuickReply}
                                    onClick={() => handleSaveQuickReplyAction('me')}
                                    title="Guarda esta versión únicamente para tu usuario. No altera a las demás operadoras."
                                    style={{
                                        padding: '8px 16px', borderRadius: '8px', border: 'none',
                                        background: '#7C3AED', color: '#FFFFFF', fontSize: '0.8rem', fontWeight: 700,
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                        boxShadow: '0 2px 6px rgba(124, 58, 237, 0.25)'
                                    }}
                                >
                                    {isSavingQuickReply ? <Loader2 size={14} className="animate-spin" /> : <User size={14} />}
                                    Cambiar solo para mí
                                </button>

                                {/* Botón: Cambiar para todos */}
                                <button
                                    type="button"
                                    disabled={isSavingQuickReply}
                                    onClick={() => handleSaveQuickReplyAction('all')}
                                    title="Actualiza la plantilla oficial para todas las operadoras del Contact Center."
                                    style={{
                                        padding: '8px 16px', borderRadius: '8px', border: 'none',
                                        background: '#0284C7', color: '#FFFFFF', fontSize: '0.8rem', fontWeight: 700,
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                        boxShadow: '0 2px 6px rgba(2, 132, 199, 0.25)'
                                    }}
                                >
                                    {isSavingQuickReply ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
                                    Cambiar para todos
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
