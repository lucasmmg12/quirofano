/**
 * BetoPanel.jsx — Beto IA integrado en ADM-QUI
 * Chat RAG + Documentos + Reglas + Analytics
 * Estética copiada 1:1 del Contact Center (CSS classes)
 */
import { useState, useEffect, useRef } from 'react';
import {
    Send, Upload, FileText, Trash2, MessageSquare, Plus, Loader2,
    ChevronRight, ChevronDown, Brain, BookOpen, AlertCircle, CheckCircle, X, Clock,
    Sparkles, FolderOpen, Tag, Download, FolderPlus, Home, Folder,
    Shield, RefreshCw, BarChart3, HelpCircle, Search, Zap, ArrowRight,
    ThumbsUp, ThumbsDown,
} from 'lucide-react';
import {
    sendRAGMessage, listRAGConversations, getRAGConversationMessages,
    deleteRAGConversation, uploadRAGDocument, uploadRAGBatch,
    listRAGFiles, downloadRAGFile, createRAGFolder, deleteRAGFile,
    deleteRAGFolder, checkRAGHealth, fetchSuggestions, fetchLearningStats,
    listRAGRules, createRAGRule, deleteRAGRule, fetchRAGAnalytics,
    submitRAGFeedback,
} from '../api/ragClient';

function renderMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^- (.*)/gm, '• $1')
        .replace(/\n/g, '<br/>');
}

function formatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const diff = Date.now() - d;
    if (diff < 60000) return 'Ahora';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

function formatFileSize(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
}

const FILE_ICONS = { '.pdf': '📄', '.docx': '📝', '.xlsx': '📊', '.csv': '📋', '.txt': '📃' };
const SUPPORTED_EXTS = ['.pdf', '.docx', '.xlsx', '.xls', '.csv', '.txt', '.md', '.json', '.xml', '.html', '.htm'];
const RULE_CATS = {
    obra_social: { label: 'Obra Social', color: '#3b82f6', bg: '#eff6ff' },
    precios: { label: 'Precios', color: '#10b981', bg: '#ecfdf5' },
    protocolo: { label: 'Protocolo', color: '#f59e0b', bg: '#fffbeb' },
    administrativo: { label: 'Administrativo', color: '#8b5cf6', bg: '#f5f3ff' },
    medico: { label: 'Médico', color: '#ef4444', bg: '#fef2f2' },
    general: { label: 'General', color: '#64748b', bg: '#f8fafc' },
};

export default function BetoPanel({ addToast }) {
    const [bootPhase, setBootPhase] = useState('idle');
    const [bootTimer, setBootTimer] = useState(0);
    const bootTimerRef = useRef(null);
    const [activeTab, setActiveTab] = useState('chat');
    const [showGuide, setShowGuide] = useState(false);

    // Chat
    const [conversations, setConversations] = useState([]);
    const [activeConversation, setActiveConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [learningStats, setLearningStats] = useState(null);
    const [suggestions, setSuggestions] = useState({ categories: [], top_queries: [] });
    const messagesEndRef = useRef(null);

    // Files
    const [fileItems, setFileItems] = useState([]);
    const [currentFolder, setCurrentFolder] = useState('');
    const [totalFiles, setTotalFiles] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState('');
    const [uploadTag, setUploadTag] = useState('');
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const fileInputRef = useRef(null);

    // Rules
    const [rules, setRules] = useState([]);
    const [ruleText, setRuleText] = useState('');
    const [isSubmittingRule, setIsSubmittingRule] = useState(false);
    const [rulesLoading, setRulesLoading] = useState(true);

    // Analytics
    const [analyticsData, setAnalyticsData] = useState(null);
    const [analyticsLoading, setAnalyticsLoading] = useState(false);

    // Feedback
    const [feedbackMap, setFeedbackMap] = useState({});  // { [msgIndex]: 'correct' | 'incorrect' }

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    // ═══ BOOT ═══
    async function startBeto() {
        setBootPhase('waking');
        setBootTimer(0);
        const start = Date.now();
        bootTimerRef.current = setInterval(() => setBootTimer(Math.floor((Date.now() - start) / 1000)), 1000);

        for (let i = 0; i < 30; i++) {
            if (await checkRAGHealth()) break;
            if (i === 29) { setBootPhase('error'); clearInterval(bootTimerRef.current); return; }
            await new Promise(r => setTimeout(r, 2000));
        }

        setBootPhase('connecting');
        await new Promise(r => setTimeout(r, 800));
        setBootPhase('loading');
        try {
            await Promise.all([loadConversations(), loadFiles(), loadLearningStats()]);
            fetchSuggestions().then(d => setSuggestions(d)).catch(() => {});
        } catch (e) {
            console.error('Beto boot: error cargando datos', e);
            setBootPhase('error');
            clearInterval(bootTimerRef.current);
            return;
        }
        setBootPhase('ready');
        clearInterval(bootTimerRef.current);
        await new Promise(r => setTimeout(r, 1200));
        setBootPhase('done');
    }

    async function loadConversations() {
        try { const d = await listRAGConversations(); setConversations(d.conversations || []); } catch(e) { console.error(e); }
    }
    async function loadFiles(folder) {
        try { const d = await listRAGFiles(folder !== undefined ? folder : currentFolder); setFileItems(d.items || []); setTotalFiles(d.total_files || 0); } catch(e) { console.error(e); }
    }
    async function loadLearningStats() { const d = await fetchLearningStats(); if (d) setLearningStats(d); }
    async function loadRules() { setRulesLoading(true); try { const d = await listRAGRules(); setRules(d.rules || []); } catch(e){} setRulesLoading(false); }
    async function loadAnalytics() { setAnalyticsLoading(true); try { const d = await fetchRAGAnalytics(30); setAnalyticsData(d); } catch(e){ setError('Error cargando analytics'); } setAnalyticsLoading(false); }

    useEffect(() => {
        if (activeTab === 'rules' && rules.length === 0) loadRules();
        if (activeTab === 'analytics' && !analyticsData) loadAnalytics();
    }, [activeTab]);

    // ═══ CHAT ═══
    async function selectConversation(conv) {
        setActiveConversation(conv.id); setError(null);
        try { const d = await getRAGConversationMessages(conv.id); setMessages(d.messages || []); } catch(e) { setError('Error al cargar mensajes'); }
    }
    function startNewConversation() { setActiveConversation(null); setMessages([]); setError(null); setInputValue(''); }

    async function handleSend() {
        if (!inputValue.trim() || isLoading) return;
        const q = inputValue.trim(); setInputValue(''); setError(null);
        setMessages(prev => [...prev, { role: 'user', content: q, created_at: new Date().toISOString() }]);
        setIsLoading(true);
        try {
            const r = await sendRAGMessage(q, activeConversation);
            if (!activeConversation && r.conversation_id) { setActiveConversation(r.conversation_id); loadConversations(); }
            setMessages(prev => [...prev, { role: 'assistant', content: r.answer, sources: r.sources, type: r.type, suggestions: r.suggestions || [], created_at: new Date().toISOString() }]);
            loadLearningStats();
        } catch(e) { setError(e.message); } finally { setIsLoading(false); }
    }

    async function handleDeleteConv(id, e) {
        e.stopPropagation();
        try { await deleteRAGConversation(id); if (activeConversation === id) startNewConversation(); loadConversations(); } catch(err) { setError(err.message); }
    }

    // ═══ FEEDBACK ═══
    async function handleFeedback(msgIndex, isCorrect) {
        const key = `${activeConversation || 'new'}_${msgIndex}`;
        if (feedbackMap[key]) return; // Already voted
        const vote = isCorrect ? 'correct' : 'incorrect';
        setFeedbackMap(prev => ({ ...prev, [key]: vote }));
        try {
            await submitRAGFeedback(activeConversation, msgIndex, isCorrect);
            addToast?.(isCorrect ? '✅ Marcada como correcta' : '❌ Marcada como incorrecta', 'info');
        } catch (e) {
            console.error('Feedback error:', e);
            // Keep the local state even if API fails
        }
    }

    // ═══ FILES ═══
    function navigateToFolder(p) { setCurrentFolder(p); loadFiles(p); }
    async function handleFileSelect(event) {
        const files = Array.from(event.target.files || []).filter(f => {
            const ext = '.' + f.name.split('.').pop().toLowerCase();
            return SUPPORTED_EXTS.includes(ext) && !f.name.startsWith('~$');
        });
        if (!files.length) return;
        setIsUploading(true); setError(null);
        if (files.length === 1) {
            setUploadProgress(`Procesando "${files[0].name}"...`);
            try { const r = await uploadRAGDocument(files[0], currentFolder, uploadTag); loadFiles(); setUploadProgress(`✅ "${files[0].name}" — ${r.total_chunks} chunks`); setTimeout(() => setUploadProgress(''), 4000); } catch(e) { setError(e.message); setUploadProgress(''); }
        } else {
            try { const r = await uploadRAGBatch(files, currentFolder, uploadTag, p => setUploadProgress(`Subiendo ${p.current}/${p.total}: "${p.filename}"`)); loadFiles(); setUploadProgress(`✅ ${r.processed} procesados, ${r.total_chunks} chunks`); setTimeout(() => setUploadProgress(''), 6000); } catch(e) { setError(e.message); setUploadProgress(''); }
        }
        setIsUploading(false); setUploadTag(''); if (fileInputRef.current) fileInputRef.current.value = '';
    }
    async function handleCreateFolder() { if (!newFolderName.trim()) return; try { await createRAGFolder(newFolderName.trim(), currentFolder); setNewFolderName(''); setShowNewFolder(false); loadFiles(); } catch(e) { setError(e.message); } }

    // ═══ RULES ═══
    async function handleSubmitRule() {
        if (!ruleText.trim() || ruleText.trim().length < 5) return;
        setIsSubmittingRule(true);
        try { await createRAGRule(ruleText.trim()); setRuleText(''); addToast?.('Regla guardada', 'success'); loadRules(); } catch(e) { setError(e.message); }
        setIsSubmittingRule(false);
    }

    // ════════════════════════════════════
    // BOOT SCREEN (CSS classes)
    // ════════════════════════════════════
    if (bootPhase !== 'done') {
        const phases = [
            { key: 'waking', label: 'Despertando servidor...' },
            { key: 'connecting', label: 'Conectando IA...' },
            { key: 'loading', label: 'Cargando documentos...' },
            { key: 'ready', label: '¡Beto está listo!' },
        ];
        const order = ['waking', 'connecting', 'loading', 'ready'];
        const idx = order.indexOf(bootPhase);

        return (
            <div className="beto-welcome">
                <div className="beto-welcome-card">
                    <div className="beto-avatar-container">
                        <div className="beto-avatar-glow" />
                        <img src="/logosanatorio.png" alt="Beto" className="beto-avatar" />
                    </div>
                    <h2 className="beto-name">Beto</h2>
                    <p className="beto-subtitle">Asistente IA Documental</p>

                    {bootPhase === 'idle' && (
                        <>
                            <p className="beto-desc">
                                Consultá documentos del Sanatorio Argentino con inteligencia artificial. Respuestas precisas con citación de fuentes.
                            </p>
                            <button className="beto-start-btn" onClick={startBeto}>
                                <Brain size={18} /> Iniciar charla con Beto
                            </button>
                            <div className="beto-sleep-info">
                                <Clock size={14} />
                                <span>Beto se apaga tras <strong>15 min</strong> de inactividad y demora entre <strong>30–60 seg</strong> en volver a encenderse.</span>
                            </div>
                        </>
                    )}

                    {bootPhase === 'error' && (
                        <div className="beto-boot-error">
                            <AlertCircle size={24} />
                            <strong>No se pudo conectar con Beto</strong>
                            <p>El servidor no respondió. Intentá de nuevo.</p>
                            <button className="beto-retry-btn" onClick={() => setBootPhase('idle')}>Reintentar</button>
                        </div>
                    )}

                    {bootPhase !== 'idle' && bootPhase !== 'error' && (
                        <div className="beto-boot">
                            <div className="beto-boot-phases">
                                {phases.map((p, i) => {
                                    const isDone = idx > i || bootPhase === 'ready';
                                    const isActive = order[i] === bootPhase && bootPhase !== 'ready';
                                    return (
                                        <div key={p.key} className={`beto-boot-phase ${isDone ? 'done' : isActive ? 'active' : ''}`}>
                                            {isDone ? <CheckCircle size={16} /> : isActive ? <Loader2 size={16} className="rag-spin" /> : <div className="beto-boot-dot" />}
                                            <span>{p.label}</span>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="beto-boot-timer"><Clock size={12} /> {bootTimer}s</div>
                        </div>
                    )}
                </div>
                <div className="beto-welcome-footer">Sanatorio Argentino · Powered by GPT-4o + RAG Pipeline V3.2</div>
            </div>
        );
    }

    // ════════════════════════════════════
    // MAIN RENDER (CSS classes)
    // ════════════════════════════════════
    const breadcrumbs = currentFolder ? currentFolder.split('/').filter(Boolean) : [];

    return (
        <div className="rag-container">
            {/* ── Sidebar ── */}
            <div className="rag-sidebar">
                <div className="rag-sidebar-header">
                    <button className="rag-new-chat-btn" onClick={startNewConversation}>
                        <Plus size={14} /> Nueva Consulta
                    </button>
                </div>

                <div className="rag-tabs">
                    {[
                        { id: 'chat', icon: MessageSquare, label: 'Chat' },
                        { id: 'docs', icon: FileText, label: 'Docs' },
                        { id: 'rules', icon: Shield, label: 'Reglas' },
                        { id: 'analytics', icon: BarChart3, label: 'Stats' },
                    ].map(t => (
                        <button key={t.id} className={`rag-tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
                            <t.icon size={13} /> {t.label}
                        </button>
                    ))}
                </div>

                <div className="rag-conv-list">
                    {activeTab === 'chat' && (conversations.length === 0 ? (
                        <div className="rag-empty-state" style={{ padding: '40px 20px' }}>
                            <Brain size={32} style={{ marginBottom: '8px', opacity: 0.4 }} />
                            <p style={{ fontSize: '0.78rem', fontWeight: 600, margin: '0 0 4px' }}>Sin conversaciones</p>
                            <p style={{ fontSize: '0.7rem', margin: 0 }}>Hacé una pregunta para empezar</p>
                        </div>
                    ) : conversations.map(conv => (
                        <div key={conv.id} className={`rag-conv-item ${activeConversation === conv.id ? 'active' : ''}`} onClick={() => selectConversation(conv)}>
                            <div className="rag-conv-item-content">
                                <span className="rag-conv-title">{conv.title || 'Sin título'}</span>
                                <span className="rag-conv-time"><Clock size={10} />{formatTime(conv.updated_at)}</span>
                            </div>
                            <button className="rag-conv-delete" onClick={e => handleDeleteConv(conv.id, e)}><Trash2 size={11} /></button>
                        </div>
                    )))}

                    {activeTab === 'docs' && renderDocsSidebar()}
                    {activeTab === 'rules' && renderRulesSidebar()}
                    {activeTab === 'analytics' && renderAnalyticsSidebar()}
                </div>
            </div>

            {/* ── Chat Area ── */}
            <div className="rag-chat-area">
                <div className="rag-status-bar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div className="rag-status-dot" /> Beto IA — En línea
                    </div>
                    {learningStats && <span>🧠 {learningStats.total_learned || 0} respuestas aprendidas</span>}
                </div>

                <div className="rag-messages">
                    {messages.length === 0 && !isLoading && (
                        <div className="rag-empty-state" style={{ maxWidth: '620px', width: '100%', padding: '40px 28px' }}>
                            <Brain size={48} style={{ marginBottom: '12px', opacity: 0.3 }} />
                            <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 700, color: 'var(--neutral-500)' }}>¿En qué puedo ayudarte?</h3>
                            <p style={{ margin: '0 0 24px', fontSize: '0.8rem' }}>Consultá documentos del Sanatorio con IA</p>

                            {/* ── Banner colaborativo ── */}
                            <div style={{
                                background: 'linear-gradient(135deg, #EFF6FF 0%, #F0F9FF 50%, #F5F3FF 100%)',
                                borderRadius: '14px',
                                padding: '20px',
                                border: '1px solid rgba(59, 130, 246, 0.12)',
                                textAlign: 'left',
                                width: '100%',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                    <Sparkles size={16} color="#3B82F6" />
                                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--neutral-700)' }}>
                                        Mejoremos a Beto juntos
                                    </span>
                                </div>
                                <p style={{ fontSize: '0.75rem', color: 'var(--neutral-500)', lineHeight: 1.5, margin: '0 0 14px' }}>
                                    Beto aprende de los documentos y reglas que vos le enseñás. Cuanta más información le des, mejores van a ser sus respuestas.
                                </p>

                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={() => setActiveTab('docs')}
                                        style={{
                                            flex: 1, display: 'flex', alignItems: 'center', gap: '8px',
                                            padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(59,130,246,0.15)',
                                            background: '#fff', cursor: 'pointer', transition: 'all 0.2s',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(59,130,246,0.12)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.15)'; e.currentTarget.style.boxShadow = 'none'; }}
                                    >
                                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Upload size={15} color="#3B82F6" />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-700)' }}>Subí documentos</div>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--neutral-400)' }}>PDF, Word, Excel...</div>
                                        </div>
                                    </button>

                                    <button
                                        onClick={() => setActiveTab('rules')}
                                        style={{
                                            flex: 1, display: 'flex', alignItems: 'center', gap: '8px',
                                            padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(139,92,246,0.15)',
                                            background: '#fff', cursor: 'pointer', transition: 'all 0.2s',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#8B5CF6'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(139,92,246,0.12)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.15)'; e.currentTarget.style.boxShadow = 'none'; }}
                                    >
                                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Shield size={15} color="#8B5CF6" />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-700)' }}>Agregá reglas</div>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--neutral-400)' }}>Conocimiento extra</div>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* ── Guía: ¿Cómo funciona Beto? ── */}
                            <button
                                onClick={() => setShowGuide(prev => !prev)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                                    padding: '12px 16px', marginTop: '12px', borderRadius: '12px',
                                    border: '1px solid var(--neutral-200)', background: 'white',
                                    cursor: 'pointer', transition: 'all 0.2s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.background = '#FAFCFF'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--neutral-200)'; e.currentTarget.style.background = 'white'; }}
                            >
                                <HelpCircle size={16} color="#3B82F6" />
                                <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: 700, color: 'var(--neutral-600)', textAlign: 'left' }}>
                                    ¿Cómo funciona Beto?
                                </span>
                                <ChevronDown size={14} style={{
                                    transition: 'transform 0.25s ease',
                                    transform: showGuide ? 'rotate(180deg)' : 'rotate(0deg)',
                                    color: 'var(--neutral-400)',
                                }} />
                            </button>

                            {showGuide && (
                                <div className="animate-fade-in" style={{
                                    width: '100%', textAlign: 'left', marginTop: '4px',
                                    border: '1px solid var(--neutral-200)', borderRadius: '14px',
                                    overflow: 'hidden', background: 'white',
                                }}>
                                    {/* Header */}
                                    <div style={{
                                        padding: '20px 24px 16px',
                                        background: 'linear-gradient(135deg, #EFF6FF, #F5F3FF)',
                                        borderBottom: '1px solid var(--neutral-100)',
                                    }}>
                                        <h4 style={{ margin: '0 0 6px', fontSize: '0.95rem', fontWeight: 800, color: 'var(--neutral-800)' }}>
                                            🧠 Guía completa de Beto IA
                                        </h4>
                                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--neutral-500)', lineHeight: 1.5 }}>
                                            Beto es un asistente de inteligencia artificial que responde preguntas basándose en los documentos y reglas que vos le cargás. Así funciona:
                                        </p>
                                    </div>

                                    {/* Pipeline visual */}
                                    <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--neutral-100)' }}>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--neutral-500)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
                                            Flujo de procesamiento
                                        </div>
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: '0', padding: '12px',
                                            background: 'var(--neutral-50)', borderRadius: '10px',
                                            overflowX: 'auto',
                                        }}>
                                            {[
                                                { icon: MessageSquare, label: 'Tu pregunta', color: '#3B82F6', bg: '#EFF6FF' },
                                                { icon: Search, label: 'Busca en docs', color: '#8B5CF6', bg: '#F5F3FF' },
                                                { icon: Zap, label: 'IA procesa', color: '#F59E0B', bg: '#FFFBEB' },
                                                { icon: CheckCircle, label: 'Respuesta + fuentes', color: '#10B981', bg: '#ECFDF5' },
                                            ].map((step, i) => (
                                                <div key={i} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flex: 1 }}>
                                                        <div style={{
                                                            width: '36px', height: '36px', borderRadius: '10px',
                                                            background: step.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            border: `1px solid ${step.color}20`,
                                                        }}>
                                                            <step.icon size={16} color={step.color} />
                                                        </div>
                                                        <span style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--neutral-600)', textAlign: 'center', lineHeight: 1.3 }}>
                                                            {step.label}
                                                        </span>
                                                    </div>
                                                    {i < 3 && <ArrowRight size={12} color="var(--neutral-300)" style={{ flexShrink: 0, margin: '0 2px' }} />}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Paso 1: Documentos */}
                                    <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--neutral-100)' }}>
                                        <div style={{ display: 'flex', gap: '14px' }}>
                                            <div style={{
                                                width: '40px', height: '40px', borderRadius: '12px',
                                                background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                flexShrink: 0, border: '1px solid #BFDBFE',
                                            }}>
                                                <Upload size={18} color="#3B82F6" />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                                    <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#3B82F6', background: '#EFF6FF', padding: '1px 8px', borderRadius: '10px' }}>PASO 1</span>
                                                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--neutral-800)' }}>Subí tus documentos</span>
                                                </div>
                                                <p style={{ margin: '0 0 8px', fontSize: '0.73rem', color: 'var(--neutral-500)', lineHeight: 1.6 }}>
                                                    Andá a la pestaña <strong>"Docs"</strong> en la barra lateral y subí los archivos que quieras que Beto conozca. 
                                                    Beto los procesa, los divide en fragmentos y los almacena para poder buscar en ellos.
                                                </p>
                                                <div style={{
                                                    display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px',
                                                }}>
                                                    {['PDF', 'Word (.docx)', 'Excel (.xlsx)', 'CSV', 'TXT', 'Markdown'].map(f => (
                                                        <span key={f} style={{
                                                            padding: '2px 8px', borderRadius: '6px', fontSize: '0.62rem',
                                                            fontWeight: 600, background: '#EFF6FF', color: '#3B82F6',
                                                        }}>{f}</span>
                                                    ))}
                                                </div>
                                                <img src="/beto_step_docs.png" alt="Subir documentos" style={{
                                                    width: '100%', maxHeight: '140px', objectFit: 'cover',
                                                    borderRadius: '8px', border: '1px solid var(--neutral-100)',
                                                }} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Paso 2: Reglas */}
                                    <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--neutral-100)' }}>
                                        <div style={{ display: 'flex', gap: '14px' }}>
                                            <div style={{
                                                width: '40px', height: '40px', borderRadius: '12px',
                                                background: '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                flexShrink: 0, border: '1px solid #DDD6FE',
                                            }}>
                                                <Shield size={18} color="#8B5CF6" />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                                    <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#8B5CF6', background: '#F5F3FF', padding: '1px 8px', borderRadius: '10px' }}>PASO 2</span>
                                                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--neutral-800)' }}>Agregá reglas de conocimiento</span>
                                                </div>
                                                <p style={{ margin: '0 0 8px', fontSize: '0.73rem', color: 'var(--neutral-500)', lineHeight: 1.6 }}>
                                                    ¿Hay información que NO está en ningún documento pero es importante? Andá a <strong>"Reglas"</strong> y escribila en texto libre. 
                                                    Beto la clasifica automáticamente y la usa para responder.
                                                </p>
                                                <div style={{
                                                    padding: '10px 12px', background: '#FAFAFE', borderRadius: '8px',
                                                    border: '1px dashed #DDD6FE', fontSize: '0.7rem', color: 'var(--neutral-500)',
                                                    fontStyle: 'italic', lineHeight: 1.5, marginBottom: '8px',
                                                }}>
                                                    💡 <strong>Ejemplo:</strong> "El plus de OSDE al día de hoy es $2.000" o "Para cirugías de Medisalud se necesita autorización previa del auditor"
                                                </div>
                                                <img src="/beto_step_rules.png" alt="Agregar reglas" style={{
                                                    width: '100%', maxHeight: '140px', objectFit: 'cover',
                                                    borderRadius: '8px', border: '1px solid var(--neutral-100)',
                                                }} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Paso 3: Preguntar */}
                                    <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--neutral-100)' }}>
                                        <div style={{ display: 'flex', gap: '14px' }}>
                                            <div style={{
                                                width: '40px', height: '40px', borderRadius: '12px',
                                                background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                flexShrink: 0, border: '1px solid #A7F3D0',
                                            }}>
                                                <MessageSquare size={18} color="#10B981" />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                                    <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#10B981', background: '#ECFDF5', padding: '1px 8px', borderRadius: '10px' }}>PASO 3</span>
                                                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--neutral-800)' }}>Hacé tu pregunta</span>
                                                </div>
                                                <p style={{ margin: '0 0 8px', fontSize: '0.73rem', color: 'var(--neutral-500)', lineHeight: 1.6 }}>
                                                    Escribí tu consulta en el chat. Beto busca en todos tus documentos y reglas, encuentra los fragmentos más relevantes, 
                                                    y genera una respuesta precisa <strong>citando las fuentes</strong> de donde sacó la información.
                                                </p>
                                                <img src="/beto_step_chat.png" alt="Chatear con Beto" style={{
                                                    width: '100%', maxHeight: '140px', objectFit: 'cover',
                                                    borderRadius: '8px', border: '1px solid var(--neutral-100)',
                                                }} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Tips */}
                                    <div style={{ padding: '16px 24px' }}>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--neutral-500)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                                            💡 Tips para mejores resultados
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {[
                                                { text: 'Subí los convenios de obras sociales completos para preguntas de cobertura', color: '#3B82F6' },
                                                { text: 'Agregá reglas con datos que cambian seguido: precios, plus, requisitos actuales', color: '#8B5CF6' },
                                                { text: 'Sé específico en tus preguntas — "¿OSDE cubre ecografía doppler?" es mejor que "ecografía"', color: '#10B981' },
                                                { text: 'Beto aprende de cada conversación y mejora sus respuestas con el tiempo', color: '#F59E0B' },
                                                { text: 'Podés organizar documentos en carpetas desde la pestaña Docs', color: '#EF4444' },
                                            ].map((tip, i) => (
                                                <div key={i} style={{
                                                    display: 'flex', alignItems: 'flex-start', gap: '8px',
                                                    padding: '8px 10px', borderRadius: '8px', background: 'var(--neutral-50)',
                                                }}>
                                                    <div style={{
                                                        width: '6px', height: '6px', borderRadius: '50%',
                                                        background: tip.color, flexShrink: 0, marginTop: '5px',
                                                    }} />
                                                    <span style={{ fontSize: '0.72rem', color: 'var(--neutral-600)', lineHeight: 1.5 }}>
                                                        {tip.text}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {messages.map((msg, i) => {
                        const feedbackKey = `${activeConversation || 'new'}_${i}`;
                        const currentFeedback = feedbackMap[feedbackKey];
                        return (
                            <div key={i} className={msg.role === 'user' ? 'rag-msg-user' : 'rag-msg-assistant'}>
                                {msg.role === 'assistant' ? (
                                    <>
                                        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                                        {msg.sources?.length > 0 && (
                                            <div className="rag-msg-sources">
                                                {msg.sources.map((src, j) => (
                                                    <span key={j} className="rag-source-chip">
                                                        <FileText size={10} /> {(src.filename || src).slice(0, 30)}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {msg.type === 'clarification' && msg.suggestions?.length > 0 && (
                                            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                {msg.suggestions.map((s, j) => (
                                                    <button key={j} className="rag-suggestion-btn" style={{ textAlign: 'left' }} onClick={() => setInputValue(s)}>{s}</button>
                                                ))}
                                            </div>
                                        )}
                                        {/* ── Feedback Buttons ── */}
                                        <div className={`beto-feedback ${currentFeedback ? 'voted' : ''}`}>
                                            {currentFeedback ? (
                                                <div className={`beto-feedback-result ${currentFeedback}`}>
                                                    {currentFeedback === 'correct'
                                                        ? <><ThumbsUp size={12} /> Correcta</>
                                                        : <><ThumbsDown size={12} /> Incorrecta</>}
                                                </div>
                                            ) : (
                                                <>
                                                    <span className="beto-feedback-label">¿Fue útil?</span>
                                                    <button
                                                        className="beto-feedback-btn correct"
                                                        onClick={() => handleFeedback(i, true)}
                                                        title="Respuesta correcta"
                                                    >
                                                        <ThumbsUp size={13} /> Correcta
                                                    </button>
                                                    <button
                                                        className="beto-feedback-btn incorrect"
                                                        onClick={() => handleFeedback(i, false)}
                                                        title="Respuesta incorrecta"
                                                    >
                                                        <ThumbsDown size={13} /> Incorrecta
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </>
                                ) : msg.content}
                            </div>
                        );
                    })}

                    {isLoading && (
                        <div className="rag-msg-assistant" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--neutral-500)' }}>
                            <Loader2 size={16} className="rag-spin" /> Beto está pensando...
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {error && (
                    <div className="rag-error-bar">
                        <AlertCircle size={14} /> {error}
                        <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}><X size={14} /></button>
                    </div>
                )}

                <div className="rag-input-area">
                    <textarea className="rag-input" value={inputValue} onChange={e => setInputValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        placeholder="Preguntale algo a Beto..." rows={1} />
                    <button className="rag-send-btn" onClick={handleSend} disabled={!inputValue.trim() || isLoading}>
                        {isLoading ? <Loader2 size={18} className="rag-spin" /> : <Send size={18} />}
                    </button>
                </div>
            </div>
        </div>
    );

    // ═══ DOCS SIDEBAR ═══
    function renderDocsSidebar() {
        return (
            <div>
                <div className="rag-fm-toolbar">
                    <input ref={fileInputRef} type="file" onChange={handleFileSelect} accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,.json" style={{ display: 'none' }} multiple />
                    <button className="rag-fm-upload-btn" onClick={() => fileInputRef.current?.click()}><Upload size={12} /> Subir</button>
                    <button className="rag-fm-upload-btn" style={{ flex: 'none', padding: '6px 8px' }} onClick={() => setShowNewFolder(!showNewFolder)}><FolderPlus size={12} /></button>
                </div>
                {showNewFolder && (
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                        <input type="text" placeholder="Nombre carpeta" value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                            style={{ flex: 1, padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--neutral-200)', fontSize: '0.75rem' }} autoFocus />
                        <button className="rag-fm-upload-btn" style={{ flex: 'none' }} onClick={handleCreateFolder}><CheckCircle size={12} /></button>
                    </div>
                )}
                {uploadProgress && <div style={{ padding: '6px 10px', background: 'var(--primary-50)', borderRadius: '6px', fontSize: '0.7rem', color: 'var(--primary-600)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}><Loader2 size={12} className="rag-spin" /> {uploadProgress}</div>}

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px', fontSize: '0.68rem' }}>
                    <button onClick={() => navigateToFolder('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--neutral-500)', padding: '2px' }}><Home size={12} /></button>
                    {breadcrumbs.map((part, i) => (
                        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '2px', color: 'var(--neutral-400)' }}>
                            <ChevronRight size={10} />
                            <button onClick={() => navigateToFolder(breadcrumbs.slice(0, i + 1).join('/'))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-500)', fontSize: '0.68rem', fontWeight: 600 }}>{part}</button>
                        </span>
                    ))}
                </div>

                <div style={{ fontSize: '0.68rem', color: 'var(--neutral-400)', marginBottom: '6px' }}>{totalFiles} archivos totales</div>
                {fileItems.length === 0 ? (
                    <div className="rag-empty-state" style={{ padding: '30px 10px' }}>
                        <BookOpen size={28} style={{ marginBottom: '8px', opacity: 0.4 }} />
                        <p style={{ fontSize: '0.75rem', margin: 0 }}>{currentFolder ? 'Carpeta vacía' : 'Sin archivos'}</p>
                    </div>
                ) : fileItems.map(item => item.type === 'folder' ? (
                    <div key={item.path} className="rag-conv-item" onClick={() => navigateToFolder(item.path)}>
                        <Folder size={16} color="#3B82F6" />
                        <span className="rag-conv-title" style={{ flex: 1 }}>{item.name}</span>
                        <button className="rag-conv-delete" style={{ opacity: 1 }} onClick={e => { e.stopPropagation(); deleteRAGFolder(item.path).then(() => loadFiles()); }}><Trash2 size={11} /></button>
                    </div>
                ) : (
                    <div key={item.name} className="rag-conv-item" style={{ cursor: 'default' }}>
                        <span>{FILE_ICONS[item.file_type] || '📄'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--neutral-400)' }}>{item.total_chunks} chunks · {formatFileSize(item.file_size)}</div>
                        </div>
                        <button className="rag-conv-delete" style={{ opacity: 1 }} onClick={() => downloadRAGFile(item.storage_path || `${item.folder}/${item.name}`.replace(/^\//, ''))}><Download size={11} /></button>
                        <button className="rag-conv-delete" style={{ opacity: 1 }} onClick={() => { deleteRAGFile(item.storage_path || `${item.folder}/${item.name}`.replace(/^\//, '')).then(() => loadFiles()); }}><Trash2 size={11} /></button>
                    </div>
                ))}
            </div>
        );
    }

    // ═══ RULES SIDEBAR ═══
    function renderRulesSidebar() {
        return (
            <div>
                <div style={{ marginBottom: '10px' }}>
                    <textarea value={ruleText} onChange={e => setRuleText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitRule(); } }}
                        placeholder='Ej: "El plus de OSDE al día de hoy es $2000"' rows={3}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--neutral-200)', fontSize: '0.78rem', resize: 'vertical', fontFamily: 'inherit' }} />
                    <button className="rag-new-chat-btn" style={{ marginTop: '6px' }} onClick={handleSubmitRule} disabled={isSubmittingRule || !ruleText.trim()}>
                        {isSubmittingRule ? <Loader2 size={13} className="rag-spin" /> : <Send size={13} />} Guardar regla
                    </button>
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--neutral-400)', marginBottom: '6px' }}>{rules.length} regla{rules.length !== 1 ? 's' : ''}</div>
                {rulesLoading ? <div className="rag-empty-state"><Loader2 size={20} className="rag-spin" /></div>
                : rules.length === 0 ? <div className="rag-empty-state" style={{ padding: '30px 10px' }}><Shield size={28} style={{ opacity: 0.4 }} /><p style={{ fontSize: '0.75rem', margin: '8px 0 0' }}>Sin reglas</p></div>
                : rules.map(rule => {
                    const cat = RULE_CATS[rule.category] || RULE_CATS.general;
                    return (
                        <div key={rule.id} className="rag-rule-card">
                            <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: '10px', background: cat.bg, color: cat.color, fontSize: '0.62rem', fontWeight: 700, marginBottom: '4px' }}>{cat.label}</span>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--neutral-800)', marginBottom: '2px' }}>{rule.title}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--neutral-500)', lineHeight: 1.4 }}>{rule.processed_text}</div>
                            <button className="rag-conv-delete" style={{ position: 'absolute', top: '8px', right: '8px', opacity: 1 }} onClick={() => deleteRAGRule(rule.id).then(() => loadRules())}><Trash2 size={11} /></button>
                        </div>
                    );
                })}
            </div>
        );
    }

    // ═══ ANALYTICS SIDEBAR ═══
    function renderAnalyticsSidebar() {
        if (analyticsLoading) return <div className="rag-empty-state"><Loader2 size={24} className="rag-spin" /><p style={{ fontSize: '0.78rem' }}>Cargando...</p></div>;
        if (!analyticsData) return <div className="rag-empty-state"><BarChart3 size={28} style={{ opacity: 0.4 }} /><p style={{ fontSize: '0.78rem' }}>Sin datos</p></div>;

        const { overview, response_quality, knowledge_base, pipeline_performance } = analyticsData;
        // Feedback stats: prefer backend stats (from rag_feedback table), fallback to local
        const backendFb = learningStats?.feedback || {};
        const feedbackCorrect = backendFb.correct || response_quality?.feedback_correct || 0;
        const feedbackIncorrect = backendFb.incorrect || response_quality?.feedback_incorrect || 0;
        const feedbackTotal = feedbackCorrect + feedbackIncorrect;
        const feedbackAccuracy = feedbackTotal > 0 ? Math.round((feedbackCorrect / feedbackTotal) * 100) : 0;
        const verifiedChunks = learningStats?.verified_chunks || 0;

        const kpis = [
            { label: 'Consultas', value: overview?.total_questions || 0, icon: '💬', color: '#3B82F6' },
            { label: 'Precisión', value: feedbackTotal > 0 ? `${feedbackAccuracy}%` : '—', icon: '🎯', color: '#10B981' },
            { label: 'Conversaciones', value: overview?.total_conversations || 0, icon: '🧠', color: '#8B5CF6' },
            { label: 'Docs indexados', value: knowledge_base?.total_chunks || 0, icon: '📄', color: '#F97316' },
            { label: 'Aprendidos', value: learningStats?.learned_chunks || knowledge_base?.learned_qa || 0, icon: '📚', color: '#6366F1' },
            { label: 'Verificados', value: verifiedChunks || '—', icon: '✅', color: '#059669' },
            { label: 'Feedback', value: feedbackTotal > 0 ? `${feedbackCorrect}/${feedbackTotal}` : '—', icon: '👍', color: '#EC4899' },
        ];

        return (
            <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--neutral-500)', textTransform: 'uppercase' }}>Analytics</span>
                    <button onClick={loadAnalytics} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--neutral-500)' }}><RefreshCw size={12} /></button>
                </div>
                <div className="rag-analytics-grid">
                    {kpis.map((kpi, i) => (
                        <div key={i} className="rag-kpi-card">
                            <div style={{ fontSize: '1.1rem' }}>{kpi.icon}</div>
                            <div style={{ fontSize: '1rem', fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                            <div style={{ fontSize: '0.62rem', color: 'var(--neutral-400)', fontWeight: 600 }}>{kpi.label}</div>
                        </div>
                    ))}
                </div>
                {pipeline_performance && (
                    <div style={{ marginTop: '12px' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--neutral-500)', marginBottom: '6px', textTransform: 'uppercase' }}>Pipeline IA</div>
                        {[
                            { label: 'Docs buscados (prom)', value: pipeline_performance.avg_total_searched },
                            { label: 'Re-rankeados (prom)', value: pipeline_performance.avg_reranked_kept },
                            { label: 'Uso de HyDE', value: `${pipeline_performance.hyde_usage_rate}%` },
                            { label: 'Tasa aprendizaje', value: `${pipeline_performance.learning_rate}%` },
                        ].map((item, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '0.72rem', color: 'var(--neutral-500)', borderBottom: '1px solid var(--neutral-50)' }}>
                                <span>{item.label}</span>
                                <span style={{ fontWeight: 700, color: 'var(--neutral-800)' }}>{item.value}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }
}
