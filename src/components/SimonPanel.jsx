/**
 * SimonPanel.jsx — Simon IA integrado en ADM-QUI
 * Chat RAG + Documentos + Reglas + Analytics
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Send, Upload, FileText, Trash2, MessageSquare, Plus, Loader2,
    ChevronRight, Brain, BookOpen, AlertCircle, CheckCircle, X, Clock,
    Search, Sparkles, FolderOpen, Tag, Download, FolderPlus, Home, Folder,
    Shield, Mic, MicOff, Volume2, RefreshCw, BarChart3,
} from 'lucide-react';
import {
    sendRAGMessage, listRAGConversations, getRAGConversationMessages,
    deleteRAGConversation, uploadRAGDocument, uploadRAGBatch,
    listRAGFiles, downloadRAGFile, createRAGFolder, deleteRAGFile,
    deleteRAGFolder, checkRAGHealth, fetchSuggestions, fetchLearningStats,
    listRAGRules, createRAGRule, deleteRAGRule, fetchRAGAnalytics,
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

const FILE_ICONS = {
    '.pdf': '📄', '.docx': '📝', '.xlsx': '📊', '.xls': '📊',
    '.csv': '📋', '.txt': '📃', '.md': '📃', '.json': '🔧',
};

const SUPPORTED_EXTS = ['.pdf', '.docx', '.xlsx', '.xls', '.csv', '.txt', '.md', '.json', '.xml', '.html', '.htm'];

const RULE_CATS = {
    obra_social: { label: 'Obra Social', color: '#3b82f6', bg: '#eff6ff' },
    precios: { label: 'Precios', color: '#10b981', bg: '#ecfdf5' },
    protocolo: { label: 'Protocolo', color: '#f59e0b', bg: '#fffbeb' },
    administrativo: { label: 'Administrativo', color: '#8b5cf6', bg: '#f5f3ff' },
    medico: { label: 'Médico', color: '#ef4444', bg: '#fef2f2' },
    general: { label: 'General', color: '#64748b', bg: '#f8fafc' },
};

// ════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════
export default function SimonPanel({ addToast }) {
    // Boot state
    const [bootPhase, setBootPhase] = useState('idle');
    const [bootTimer, setBootTimer] = useState(0);
    const bootTimerRef = useRef(null);

    // View: 'chat' | 'docs' | 'rules' | 'analytics'
    const [activeTab, setActiveTab] = useState('chat');

    // Chat state
    const [conversations, setConversations] = useState([]);
    const [activeConversation, setActiveConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [learningStats, setLearningStats] = useState(null);
    const [suggestions, setSuggestions] = useState({ categories: [], top_queries: [] });
    const messagesEndRef = useRef(null);

    // File state
    const [fileItems, setFileItems] = useState([]);
    const [currentFolder, setCurrentFolder] = useState('');
    const [totalFiles, setTotalFiles] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState('');
    const [uploadTag, setUploadTag] = useState('');
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const fileInputRef = useRef(null);
    const folderInputRef = useRef(null);

    // Rules state
    const [rules, setRules] = useState([]);
    const [ruleText, setRuleText] = useState('');
    const [isSubmittingRule, setIsSubmittingRule] = useState(false);
    const [rulesLoading, setRulesLoading] = useState(true);

    // Analytics state
    const [analyticsData, setAnalyticsData] = useState(null);
    const [analyticsPeriod, setAnalyticsPeriod] = useState(30);
    const [analyticsLoading, setAnalyticsLoading] = useState(false);

    // ── Scroll ──
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ═══════════════════════════════════
    // BOOT SEQUENCE
    // ═══════════════════════════════════
    async function startSimon() {
        setBootPhase('waking');
        setBootTimer(0);
        const startTime = Date.now();
        bootTimerRef.current = setInterval(() => {
            setBootTimer(Math.floor((Date.now() - startTime) / 1000));
        }, 1000);

        const maxAttempts = 30;
        let online = false;
        for (let i = 0; i < maxAttempts; i++) {
            online = await checkRAGHealth();
            if (online) break;
            await new Promise(r => setTimeout(r, 2000));
        }

        if (!online) {
            setBootPhase('error');
            clearInterval(bootTimerRef.current);
            return;
        }

        setBootPhase('connecting');
        await new Promise(r => setTimeout(r, 800));

        setBootPhase('loading');
        await Promise.all([loadConversations(), loadFiles(), loadLearningStats()]);
        fetchSuggestions().then(d => setSuggestions(d)).catch(() => {});

        setBootPhase('ready');
        clearInterval(bootTimerRef.current);
        await new Promise(r => setTimeout(r, 1200));
        setBootPhase('done');
    }

    // ═══════════════════════════════════
    // DATA LOADERS
    // ═══════════════════════════════════
    async function loadConversations() {
        try {
            const data = await listRAGConversations();
            setConversations(data.conversations || []);
        } catch (e) { console.error(e); }
    }

    async function loadFiles(folder) {
        const f = folder !== undefined ? folder : currentFolder;
        try {
            const data = await listRAGFiles(f);
            setFileItems(data.items || []);
            setTotalFiles(data.total_files || 0);
        } catch (e) { console.error(e); }
    }

    async function loadLearningStats() {
        const data = await fetchLearningStats();
        if (data) setLearningStats(data);
    }

    async function loadRules() {
        setRulesLoading(true);
        try {
            const data = await listRAGRules();
            setRules(data.rules || []);
        } catch (e) { console.error(e); }
        setRulesLoading(false);
    }

    async function loadAnalytics() {
        setAnalyticsLoading(true);
        try {
            const data = await fetchRAGAnalytics(analyticsPeriod);
            setAnalyticsData(data);
        } catch (e) {
            setError('Error cargando analytics');
        }
        setAnalyticsLoading(false);
    }

    // Load tab-specific data
    useEffect(() => {
        if (activeTab === 'rules' && rules.length === 0) loadRules();
        if (activeTab === 'analytics' && !analyticsData) loadAnalytics();
    }, [activeTab]);

    // ═══════════════════════════════════
    // CHAT HANDLERS
    // ═══════════════════════════════════
    async function selectConversation(conv) {
        setActiveConversation(conv.id);
        setError(null);
        try {
            const data = await getRAGConversationMessages(conv.id);
            setMessages(data.messages || []);
        } catch (e) { setError('Error al cargar mensajes'); }
    }

    function startNewConversation() {
        setActiveConversation(null);
        setMessages([]);
        setError(null);
        setInputValue('');
    }

    async function handleSend() {
        if (!inputValue.trim() || isLoading) return;
        const question = inputValue.trim();
        setInputValue('');
        setError(null);
        const userMsg = { role: 'user', content: question, created_at: new Date().toISOString() };
        setMessages(prev => [...prev, userMsg]);
        setIsLoading(true);

        try {
            const result = await sendRAGMessage(question, activeConversation);
            if (!activeConversation && result.conversation_id) {
                setActiveConversation(result.conversation_id);
                loadConversations();
            }
            const assistantMsg = {
                role: 'assistant',
                content: result.answer,
                sources: result.sources,
                type: result.type,
                suggestions: result.suggestions || [],
                pipeline_info: result.pipeline,
                created_at: new Date().toISOString(),
            };
            setMessages(prev => [...prev, assistantMsg]);
            loadLearningStats();
        } catch (e) {
            setError(e.message || 'Error al procesar la pregunta');
        } finally { setIsLoading(false); }
    }

    function handleSuggestionClick(text) {
        setInputValue(text);
    }

    async function handleDeleteConversation(convId, e) {
        e.stopPropagation();
        try {
            await deleteRAGConversation(convId);
            if (activeConversation === convId) startNewConversation();
            loadConversations();
        } catch (err) { setError(err.message); }
    }

    // ═══════════════════════════════════
    // FILE HANDLERS
    // ═══════════════════════════════════
    function navigateToFolder(folderPath) {
        setCurrentFolder(folderPath);
        loadFiles(folderPath);
    }

    async function handleFileSelect(event) {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;
        setIsUploading(true);
        setError(null);

        const supported = files.filter(f => {
            const ext = '.' + f.name.split('.').pop().toLowerCase();
            return SUPPORTED_EXTS.includes(ext) && !f.name.startsWith('~$');
        });

        if (!supported.length) {
            setError('Ningún archivo soportado');
            setIsUploading(false);
            return;
        }

        if (supported.length === 1) {
            setUploadProgress(`Procesando "${supported[0].name}"...`);
            try {
                const result = await uploadRAGDocument(supported[0], currentFolder, uploadTag);
                loadFiles();
                setUploadProgress(`✅ "${supported[0].name}" — ${result.total_chunks} chunks`);
                setTimeout(() => setUploadProgress(''), 4000);
            } catch (e) { setError(e.message); setUploadProgress(''); }
        } else {
            try {
                const result = await uploadRAGBatch(supported, currentFolder, uploadTag, (p) => {
                    setUploadProgress(`Subiendo ${p.current}/${p.total}: "${p.filename}"${p.retrying ? ' 🔄' : ''}`);
                });
                loadFiles();
                setUploadProgress(`✅ ${result.processed} procesados, ${result.total_chunks} chunks`);
                setTimeout(() => setUploadProgress(''), 6000);
            } catch (e) { setError(e.message); setUploadProgress(''); }
        }

        setIsUploading(false);
        setUploadTag('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (folderInputRef.current) folderInputRef.current.value = '';
    }

    async function handleCreateFolder() {
        if (!newFolderName.trim()) return;
        try {
            await createRAGFolder(newFolderName.trim(), currentFolder);
            setNewFolderName('');
            setShowNewFolder(false);
            loadFiles();
        } catch (e) { setError(e.message); }
    }

    // ═══════════════════════════════════
    // RULES HANDLERS
    // ═══════════════════════════════════
    async function handleSubmitRule() {
        if (!ruleText.trim() || ruleText.trim().length < 5) return;
        setIsSubmittingRule(true);
        try {
            await createRAGRule(ruleText.trim());
            setRuleText('');
            addToast?.('Regla guardada', 'success');
            loadRules();
        } catch (e) { setError(e.message); }
        setIsSubmittingRule(false);
    }

    async function handleDeleteRule(ruleId) {
        try {
            await deleteRAGRule(ruleId);
            loadRules();
        } catch (e) { setError(e.message); }
    }

    // ════════════════════════════════════════════
    // STYLES
    // ════════════════════════════════════════════
    const S = {
        container: { display: 'flex', height: 'calc(100vh - 60px)', background: '#fff', overflow: 'hidden' },
        sidebar: { width: '260px', borderRight: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', background: '#FAFBFC', flexShrink: 0 },
        sidebarHeader: { padding: '12px', borderBottom: '1px solid #E5E7EB' },
        newChatBtn: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px 12px', borderRadius: '10px', background: 'linear-gradient(135deg, #6366F1, #4F46E5)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 },
        tabs: { display: 'flex', borderBottom: '1px solid #E5E7EB' },
        tab: (active) => ({ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '8px 4px', border: 'none', background: active ? '#fff' : 'transparent', color: active ? '#4F46E5' : '#6B7280', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, borderBottom: active ? '2px solid #4F46E5' : '2px solid transparent', transition: 'all 0.15s' }),
        convList: { flex: 1, overflowY: 'auto', padding: '8px' },
        convItem: (active) => ({ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', background: active ? '#EEF2FF' : 'transparent', marginBottom: '2px', transition: 'background 0.1s' }),
        convTitle: { flex: 1, fontSize: '0.78rem', fontWeight: 500, color: '#1F2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
        convTime: { fontSize: '0.65rem', color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: '3px' },
        convDelete: { background: 'none', border: 'none', cursor: 'pointer', color: '#D1D5DB', padding: '2px', borderRadius: '4px' },
        chatArea: { flex: 1, display: 'flex', flexDirection: 'column' },
        statusBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '1px solid #F3F4F6', fontSize: '0.72rem', color: '#6B7280' },
        messagesArea: { flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' },
        userMsg: { alignSelf: 'flex-end', maxWidth: '70%', padding: '10px 14px', borderRadius: '14px 14px 4px 14px', background: '#4F46E5', color: '#fff', fontSize: '0.85rem', lineHeight: 1.5 },
        assistantMsg: { alignSelf: 'flex-start', maxWidth: '80%', padding: '12px 16px', borderRadius: '14px 14px 14px 4px', background: '#F3F4F6', color: '#1F2937', fontSize: '0.85rem', lineHeight: 1.6 },
        sources: { marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #E5E7EB', display: 'flex', flexWrap: 'wrap', gap: '4px' },
        sourceChip: { display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 8px', borderRadius: '12px', background: '#EEF2FF', color: '#4F46E5', fontSize: '0.65rem', fontWeight: 600 },
        inputArea: { padding: '12px 16px', borderTop: '1px solid #E5E7EB', display: 'flex', gap: '8px', alignItems: 'flex-end' },
        input: { flex: 1, padding: '10px 14px', borderRadius: '12px', border: '1px solid #E5E7EB', fontSize: '0.85rem', resize: 'none', fontFamily: 'inherit', minHeight: '42px', maxHeight: '120px', lineHeight: 1.4 },
        sendBtn: { width: '42px', height: '42px', borderRadius: '12px', background: '#4F46E5', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    };

    // ════════════════════════════════════════════
    // BOOT SCREEN
    // ════════════════════════════════════════════
    if (bootPhase !== 'done') {
        const phases = [
            { key: 'waking', label: 'Despertando servidor...' },
            { key: 'connecting', label: 'Conectando IA...' },
            { key: 'loading', label: 'Cargando documentos...' },
            { key: 'ready', label: '¡Simon está listo!' },
        ];
        const phaseOrder = ['waking', 'connecting', 'loading', 'ready'];
        const currentIdx = phaseOrder.indexOf(bootPhase);

        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 60px)', background: 'linear-gradient(135deg, #F8FAFF 0%, #EEF2FF 100%)' }}>
                <div style={{ textAlign: 'center', maxWidth: '380px', padding: '40px' }}>
                    <div style={{ width: '80px', height: '80px', borderRadius: '24px', background: 'linear-gradient(135deg, #6366F1, #4F46E5)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 8px 32px rgba(99,102,241,0.3)' }}>
                        <Brain size={36} color="#fff" />
                    </div>
                    <h2 style={{ margin: '0 0 4px', fontSize: '1.5rem', fontWeight: 800, color: '#1F2937' }}>Simon</h2>
                    <p style={{ margin: '0 0 24px', fontSize: '0.82rem', color: '#6B7280' }}>Asistente IA Documental</p>

                    {bootPhase === 'idle' && (
                        <>
                            <button onClick={startSimon} style={{ ...S.newChatBtn, width: 'auto', padding: '12px 28px', fontSize: '0.85rem', borderRadius: '14px' }}>
                                <Brain size={18} /> Iniciar sesión con Simon
                            </button>
                            <p style={{ marginTop: '16px', fontSize: '0.72rem', color: '#9CA3AF', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                <Clock size={12} /> Se apaga tras 15 min. Demora 30–60 seg en encender.
                            </p>
                        </>
                    )}

                    {bootPhase === 'error' && (
                        <div style={{ padding: '16px', borderRadius: '12px', background: '#FEF2F2', color: '#DC2626', fontSize: '0.82rem' }}>
                            <AlertCircle size={18} style={{ marginBottom: '8px' }} />
                            <p style={{ margin: '0 0 12px', fontWeight: 600 }}>No se pudo conectar con Simon</p>
                            <button onClick={() => setBootPhase('idle')} style={{ padding: '6px 16px', borderRadius: '8px', background: '#fff', color: '#DC2626', border: '1px solid #FECACA', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>Reintentar</button>
                        </div>
                    )}

                    {bootPhase !== 'idle' && bootPhase !== 'error' && (
                        <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {phases.map((p, i) => {
                                const isDone = currentIdx > i || bootPhase === 'ready';
                                const isActive = phaseOrder[i] === bootPhase && bootPhase !== 'ready';
                                return (
                                    <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.8rem', color: isDone ? '#10B981' : isActive ? '#4F46E5' : '#D1D5DB', fontWeight: isActive ? 600 : 400 }}>
                                        {isDone ? <CheckCircle size={16} /> : isActive ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #E5E7EB' }} />}
                                        {p.label}
                                    </div>
                                );
                            })}
                            <p style={{ fontSize: '0.68rem', color: '#9CA3AF', textAlign: 'center', marginTop: '8px' }}>
                                <Clock size={11} /> {bootTimer}s
                            </p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ════════════════════════════════════════════
    // MAIN RENDER
    // ════════════════════════════════════════════
    return (
        <div style={S.container}>
            {/* ── Sidebar ── */}
            <div style={S.sidebar}>
                <div style={S.sidebarHeader}>
                    <button style={S.newChatBtn} onClick={startNewConversation}>
                        <Plus size={14} /> Nueva Consulta
                    </button>
                </div>

                {/* Tabs */}
                <div style={S.tabs}>
                    {[
                        { id: 'chat', icon: MessageSquare, label: 'Chat' },
                        { id: 'docs', icon: FileText, label: 'Docs' },
                        { id: 'rules', icon: Shield, label: 'Reglas' },
                        { id: 'analytics', icon: BarChart3, label: 'Stats' },
                    ].map(t => (
                        <button key={t.id} style={S.tab(activeTab === t.id)} onClick={() => setActiveTab(t.id)}>
                            <t.icon size={13} /> {t.label}
                        </button>
                    ))}
                </div>

                {/* Sidebar content by tab */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                    {activeTab === 'chat' && (
                        conversations.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9CA3AF' }}>
                                <Brain size={32} style={{ marginBottom: '8px', opacity: 0.4 }} />
                                <p style={{ fontSize: '0.78rem', margin: '0 0 4px', fontWeight: 600 }}>Sin conversaciones</p>
                                <p style={{ fontSize: '0.7rem', margin: 0 }}>Hacé una pregunta para empezar</p>
                            </div>
                        ) : conversations.map(conv => (
                            <div key={conv.id} style={S.convItem(activeConversation === conv.id)} onClick={() => selectConversation(conv)}
                                onMouseOver={e => { if (activeConversation !== conv.id) e.currentTarget.style.background = '#F3F4F6'; }}
                                onMouseOut={e => { if (activeConversation !== conv.id) e.currentTarget.style.background = 'transparent'; }}
                            >
                                <span style={S.convTitle}>{conv.title || 'Sin título'}</span>
                                <span style={S.convTime}><Clock size={10} />{formatTime(conv.updated_at)}</span>
                                <button style={S.convDelete} onClick={e => handleDeleteConversation(conv.id, e)}><Trash2 size={11} /></button>
                            </div>
                        ))
                    )}

                    {activeTab === 'docs' && renderDocsSidebar()}
                    {activeTab === 'rules' && renderRulesSidebar()}
                    {activeTab === 'analytics' && renderAnalyticsSidebar()}
                </div>
            </div>

            {/* ── Chat Area ── */}
            <div style={S.chatArea}>
                <div style={S.statusBar}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10B981' }} />
                        Simon IA — En línea
                    </div>
                    {learningStats && <span>🧠 {learningStats.total_learned || 0} respuestas aprendidas</span>}
                </div>

                {/* Messages */}
                <div style={S.messagesArea}>
                    {messages.length === 0 && !isLoading && (
                        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9CA3AF' }}>
                            <Brain size={48} style={{ marginBottom: '12px', opacity: 0.3 }} />
                            <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 700, color: '#6B7280' }}>¿En qué puedo ayudarte?</h3>
                            <p style={{ margin: '0 0 20px', fontSize: '0.8rem' }}>Consultá documentos del Sanatorio con IA</p>
                            {suggestions.top_queries?.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center' }}>
                                    {suggestions.top_queries.slice(0, 4).map((q, i) => (
                                        <button key={i} onClick={() => handleSuggestionClick(q.query || q)}
                                            style={{ padding: '6px 12px', borderRadius: '20px', background: '#EEF2FF', color: '#4F46E5', border: '1px solid #C7D2FE', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 500 }}
                                        >💡 {typeof q === 'string' ? q : q.query}</button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {messages.map((msg, i) => (
                        <div key={i} style={msg.role === 'user' ? S.userMsg : S.assistantMsg}>
                            {msg.role === 'assistant' ? (
                                <>
                                    <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                                    {msg.sources?.length > 0 && (
                                        <div style={S.sources}>
                                            {msg.sources.map((src, j) => (
                                                <span key={j} style={S.sourceChip}>
                                                    <FileText size={10} />
                                                    {(src.filename || src).length > 25 ? (src.filename || src).slice(0, 25) + '...' : (src.filename || src)}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {msg.type === 'clarification' && msg.suggestions?.length > 0 && (
                                        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {msg.suggestions.map((s, j) => (
                                                <button key={j} onClick={() => handleSuggestionClick(s)}
                                                    style={{ textAlign: 'left', padding: '6px 12px', borderRadius: '8px', background: '#EEF2FF', color: '#4F46E5', border: '1px solid #C7D2FE', cursor: 'pointer', fontSize: '0.78rem' }}
                                                >{s}</button>
                                            ))}
                                        </div>
                                    )}
                                </>
                            ) : msg.content}
                        </div>
                    ))}

                    {isLoading && (
                        <div style={{ ...S.assistantMsg, display: 'flex', alignItems: 'center', gap: '8px', color: '#6B7280' }}>
                            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                            Simon está pensando...
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Error */}
                {error && (
                    <div style={{ padding: '8px 16px', background: '#FEF2F2', color: '#DC2626', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <AlertCircle size={14} /> {error}
                        <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626' }}><X size={14} /></button>
                    </div>
                )}

                {/* Input */}
                <div style={S.inputArea}>
                    <textarea
                        style={S.input}
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        placeholder="Preguntale algo a Simon..."
                        rows={1}
                        onFocus={e => e.currentTarget.style.borderColor = '#6366F1'}
                        onBlur={e => e.currentTarget.style.borderColor = '#E5E7EB'}
                    />
                    <button style={{ ...S.sendBtn, opacity: !inputValue.trim() || isLoading ? 0.5 : 1 }} onClick={handleSend} disabled={!inputValue.trim() || isLoading}>
                        {isLoading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={18} />}
                    </button>
                </div>
            </div>
        </div>
    );

    // ═══════════════════════════════════
    // DOCS SIDEBAR RENDER
    // ═══════════════════════════════════
    function renderDocsSidebar() {
        const breadcrumbs = currentFolder ? currentFolder.split('/').filter(Boolean) : [];
        return (
            <div>
                {/* Toolbar */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                    <input ref={fileInputRef} type="file" onChange={handleFileSelect} accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,.json" style={{ display: 'none' }} multiple />
                    <input ref={folderInputRef} type="file" onChange={handleFileSelect} style={{ display: 'none' }} multiple />
                    <button onClick={() => fileInputRef.current?.click()} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '6px', borderRadius: '6px', background: '#EEF2FF', color: '#4F46E5', border: 'none', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600 }}>
                        <Upload size={12} /> Subir
                    </button>
                    <button onClick={() => setShowNewFolder(!showNewFolder)} style={{ padding: '6px 8px', borderRadius: '6px', background: '#F3F4F6', color: '#6B7280', border: 'none', cursor: 'pointer' }}>
                        <FolderPlus size={12} />
                    </button>
                </div>

                {showNewFolder && (
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                        <input type="text" placeholder="Nombre carpeta" value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                            style={{ flex: 1, padding: '5px 8px', borderRadius: '6px', border: '1px solid #E5E7EB', fontSize: '0.75rem' }} autoFocus />
                        <button onClick={handleCreateFolder} style={{ padding: '5px 8px', borderRadius: '6px', background: '#10B981', color: '#fff', border: 'none', cursor: 'pointer' }}><CheckCircle size={12} /></button>
                    </div>
                )}

                {uploadProgress && (
                    <div style={{ padding: '6px 10px', background: '#EFF6FF', borderRadius: '6px', fontSize: '0.7rem', color: '#1E40AF', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> {uploadProgress}
                    </div>
                )}

                {/* Breadcrumbs */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px', fontSize: '0.68rem' }}>
                    <button onClick={() => navigateToFolder('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: '2px' }}><Home size={12} /></button>
                    {breadcrumbs.map((part, i) => (
                        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '2px', color: '#6B7280' }}>
                            <ChevronRight size={10} />
                            <button onClick={() => navigateToFolder(breadcrumbs.slice(0, i + 1).join('/'))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4F46E5', fontSize: '0.68rem', fontWeight: 600 }}>{part}</button>
                        </span>
                    ))}
                </div>

                {/* Files */}
                <div style={{ fontSize: '0.68rem', color: '#9CA3AF', marginBottom: '6px' }}>{totalFiles} archivos totales</div>
                {fileItems.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px 10px', color: '#9CA3AF' }}>
                        <BookOpen size={28} style={{ marginBottom: '8px', opacity: 0.4 }} />
                        <p style={{ fontSize: '0.75rem', margin: 0 }}>{currentFolder ? 'Carpeta vacía' : 'Sin archivos'}</p>
                    </div>
                ) : fileItems.map(item => (
                    item.type === 'folder' ? (
                        <div key={item.path} onClick={() => navigateToFolder(item.path)}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 8px', borderRadius: '6px', cursor: 'pointer', marginBottom: '2px' }}
                            onMouseOver={e => e.currentTarget.style.background = '#F3F4F6'}
                            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                        >
                            <Folder size={16} color="#3B82F6" />
                            <span style={{ flex: 1, fontSize: '0.78rem', fontWeight: 500 }}>{item.name}</span>
                            <button onClick={e => { e.stopPropagation(); deleteRAGFolder(item.path).then(() => loadFiles()); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D1D5DB', padding: '2px' }}><Trash2 size={11} /></button>
                        </div>
                    ) : (
                        <div key={item.name}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 8px', borderRadius: '6px', marginBottom: '2px' }}
                        >
                            <span>{FILE_ICONS[item.file_type] || '📄'}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                                <div style={{ fontSize: '0.65rem', color: '#9CA3AF' }}>{item.total_chunks} chunks · {formatFileSize(item.file_size)}</div>
                            </div>
                            <button onClick={() => { const path = item.storage_path || `${item.folder}/${item.name}`.replace(/^\//, ''); downloadRAGFile(path); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: '2px' }}><Download size={11} /></button>
                            <button onClick={() => { const path = item.storage_path || `${item.folder}/${item.name}`.replace(/^\//, ''); deleteRAGFile(path).then(() => loadFiles()); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D1D5DB', padding: '2px' }}><Trash2 size={11} /></button>
                        </div>
                    )
                ))}
            </div>
        );
    }

    // ═══════════════════════════════════
    // RULES SIDEBAR RENDER
    // ═══════════════════════════════════
    function renderRulesSidebar() {
        return (
            <div>
                <div style={{ marginBottom: '10px' }}>
                    <textarea value={ruleText} onChange={e => setRuleText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitRule(); } }}
                        placeholder='Ej: "El plus de OSDE al día de hoy es $2000"'
                        rows={3}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E5E7EB', fontSize: '0.78rem', resize: 'vertical', fontFamily: 'inherit' }}
                    />
                    <button onClick={handleSubmitRule} disabled={isSubmittingRule || !ruleText.trim()}
                        style={{ marginTop: '6px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '7px', borderRadius: '8px', background: '#4F46E5', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, opacity: !ruleText.trim() ? 0.5 : 1 }}
                    >
                        {isSubmittingRule ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={13} />} Guardar regla
                    </button>
                </div>

                <div style={{ fontSize: '0.68rem', color: '#9CA3AF', marginBottom: '6px' }}>{rules.length} regla{rules.length !== 1 ? 's' : ''}</div>

                {rulesLoading ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#9CA3AF' }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /></div>
                ) : rules.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px 10px', color: '#9CA3AF' }}>
                        <Shield size={28} style={{ marginBottom: '8px', opacity: 0.4 }} />
                        <p style={{ fontSize: '0.75rem', margin: 0 }}>Sin reglas</p>
                    </div>
                ) : rules.map(rule => {
                    const cat = RULE_CATS[rule.category] || RULE_CATS.general;
                    return (
                        <div key={rule.id} style={{ padding: '8px 10px', borderRadius: '8px', background: '#fff', border: '1px solid #F3F4F6', marginBottom: '6px', position: 'relative' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                <span style={{ padding: '1px 8px', borderRadius: '10px', background: cat.bg, color: cat.color, fontSize: '0.62rem', fontWeight: 700 }}>{cat.label}</span>
                            </div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#1F2937', marginBottom: '2px' }}>{rule.title}</div>
                            <div style={{ fontSize: '0.72rem', color: '#6B7280', lineHeight: 1.4 }}>{rule.processed_text}</div>
                            <button onClick={() => handleDeleteRule(rule.id)} style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', cursor: 'pointer', color: '#D1D5DB' }}><Trash2 size={11} /></button>
                        </div>
                    );
                })}
            </div>
        );
    }

    // ═══════════════════════════════════
    // ANALYTICS SIDEBAR RENDER
    // ═══════════════════════════════════
    function renderAnalyticsSidebar() {
        if (analyticsLoading) {
            return <div style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /><p style={{ fontSize: '0.78rem' }}>Cargando...</p></div>;
        }
        if (!analyticsData) {
            return <div style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}><BarChart3 size={28} style={{ opacity: 0.4 }} /><p style={{ fontSize: '0.78rem' }}>Sin datos</p></div>;
        }

        const { overview, response_quality, knowledge_base, pipeline_performance } = analyticsData;

        const kpis = [
            { label: 'Consultas', value: overview?.total_questions || 0, icon: '💬', color: '#3B82F6' },
            { label: 'Satisfacción', value: `${response_quality?.satisfaction_score || 0}%`, icon: '✅', color: '#10B981' },
            { label: 'Conversaciones', value: overview?.total_conversations || 0, icon: '🧠', color: '#8B5CF6' },
            { label: 'Docs indexados', value: knowledge_base?.total_chunks || 0, icon: '📄', color: '#F97316' },
            { label: 'Reglas', value: knowledge_base?.total_rules || 0, icon: '🛡️', color: '#6366F1' },
            { label: 'Aprendidos', value: knowledge_base?.total_learned || 0, icon: '🎓', color: '#EC4899' },
        ];

        return (
            <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase' }}>Analytics</span>
                    <button onClick={loadAnalytics} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280' }}><RefreshCw size={12} /></button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    {kpis.map((kpi, i) => (
                        <div key={i} style={{ padding: '10px', borderRadius: '10px', background: '#fff', border: '1px solid #F3F4F6', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.1rem' }}>{kpi.icon}</div>
                            <div style={{ fontSize: '1rem', fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                            <div style={{ fontSize: '0.62rem', color: '#9CA3AF', fontWeight: 600 }}>{kpi.label}</div>
                        </div>
                    ))}
                </div>

                {pipeline_performance && (
                    <div style={{ marginTop: '12px' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#6B7280', marginBottom: '6px', textTransform: 'uppercase' }}>Pipeline IA</div>
                        {[
                            { label: 'Docs buscados (prom)', value: pipeline_performance.avg_total_searched },
                            { label: 'Re-rankeados (prom)', value: pipeline_performance.avg_reranked_kept },
                            { label: 'Uso de HyDE', value: `${pipeline_performance.hyde_usage_rate}%` },
                            { label: 'Tasa aprendizaje', value: `${pipeline_performance.learning_rate}%` },
                        ].map((item, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '0.72rem', color: '#6B7280', borderBottom: '1px solid #F9FAFB' }}>
                                <span>{item.label}</span>
                                <span style={{ fontWeight: 700, color: '#1F2937' }}>{item.value}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }
}
