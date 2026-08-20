/**
 * RAGRules.jsx — Submódulo Exclusivo de Reglas y Normativas para Simon IA
 * Asocia reglas con precisión por Obra Social, Médico/Especialidad y Categorías.
 * Permite agrupar, crear, editar, eliminar y aprobar propuestas de reglas.
 */
import { useState, useEffect, useRef } from 'react'
import {
    Mic, MicOff, Send, Trash2, Loader2, BookOpen,
    Tag, Clock, AlertCircle, CheckCircle, Plus,
    Shield, Sparkles, Volume2, X, Pencil, Save, RotateCcw,
    Building2, UserCheck, Layers, Filter, Check, Eye, ToggleLeft, ToggleRight, Mail
} from 'lucide-react'
import { listRAGFiles } from '../../api/ragClient'

const RAG_API_BASE = import.meta.env.VITE_RAG_API_URL || '/rag-api'

const CATEGORY_LABELS = {
    obra_social: { label: 'Obra Social', color: '#2563eb', bg: '#eff6ff' },
    precios: { label: 'Precios y Cobros', color: '#059669', bg: '#ecfdf5' },
    protocolo: { label: 'Protocolo Médico', color: '#d97706', bg: '#fffbeb' },
    administrativo: { label: 'Administrativo', color: '#7c3aed', bg: '#f5f3ff' },
    medico: { label: 'Médico / Especialidad', color: '#dc2626', bg: '#fef2f2' },
    general: { label: 'General', color: '#475569', bg: '#f8fafc' },
}

const DEFAULT_DOCTORS = [
    'General / Todos los Médicos',
    'Guardia Médica',
    'Traumatología',
    'Cirugía General',
    'Bioquímica',
    'Pediatría',
    'Ginecología & Obstetricia',
    'Cardiología'
]

export default function RAGRules() {
    const [rules, setRules] = useState([])
    const [activeTab, setActiveTab] = useState('rules')
    const [ruleText, setRuleText] = useState('')
    const [selectedOS, setSelectedOS] = useState('General / Sin Obra Social Especifica')
    const [selectedMedico, setSelectedMedico] = useState('General / Todos los Médicos')
    const [selectedCategory, setSelectedCategory] = useState('obra_social')

    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isListening, setIsListening] = useState(false)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)
    const [isLoading, setIsLoading] = useState(true)

    // Obras Sociales dynamic list from document manager
    const [osList, setOsList] = useState([
        'General / Sin Obra Social Especifica',
        '647 - ROISA',
        '200 - SANCOR',
        '639 - OSDEPYM',
        '233 - PREVENCION SALUD',
        '655 - OSSEG'
    ])

    // Grouping & Filtering State
    const [groupBy, setGroupBy] = useState('obra_social') // 'obra_social' | 'medico' | 'category' | 'status'
    const [searchFilter, setSearchFilter] = useState('')
    const [collapsedGroups, setCollapsedGroups] = useState({})

    // Edit state
    const [editingRuleId, setEditingRuleId] = useState(null)
    const [editText, setEditText] = useState('')
    const [editOS, setEditOS] = useState('')
    const [editMedico, setEditMedico] = useState('')
    const [editCategory, setEditCategory] = useState('obra_social')
    const [isSavingEdit, setIsSavingEdit] = useState(false)

    // Delete confirmation
    const [deletingRuleId, setDeletingRuleId] = useState(null)

    // Current user identification
    const currentUser = sessionStorage.getItem('username') || localStorage.getItem('username') || 'Administrador'

    const recognitionRef = useRef(null)
    const textareaRef = useRef(null)
    const editTextareaRef = useRef(null)

    useEffect(() => {
        loadRules()
        fetchObrasSociales()
    }, [])

    useEffect(() => {
        if (editingRuleId && editTextareaRef.current) {
            editTextareaRef.current.focus()
            const len = editTextareaRef.current.value.length
            editTextareaRef.current.setSelectionRange(len, len)
        }
    }, [editingRuleId])

    async function fetchObrasSociales() {
        try {
            const data = await listRAGFiles('')
            const rawItems = data.items || []
            const extractedOS = new Set([
                'General / Sin Obra Social Especifica',
                '647 - ROISA',
                '200 - SANCOR',
                '639 - OSDEPYM',
                '233 - PREVENCION SALUD',
                '655 - OSSEG'
            ])

            rawItems.forEach(item => {
                const match = (item.name || '').match(/^(\d{3,4})\s*-\s*([A-Za-z0-9_ -]+?)(?=\s*-|\.|$)/)
                if (match) {
                    extractedOS.add(`${match[1]} - ${match[2].trim()}`)
                }
            })
            setOsList(Array.from(extractedOS))
        } catch (e) {
            console.error('Error extracting Obras Sociales:', e)
        }
    }

    async function loadRules() {
        setIsLoading(true)
        try {
            const resp = await fetch(`${RAG_API_BASE}/rules`)
            if (resp.ok) {
                const data = await resp.json()
                setRules(data.rules || [])
            }
        } catch (e) {
            console.error('Error loading rules:', e)
        }
        setIsLoading(false)
    }

    async function handleSubmitRule() {
        if (!ruleText.trim() || ruleText.trim().length < 5) {
            setError('Escribí una regla más completa (mínimo 5 caracteres)')
            return
        }

        setIsSubmitting(true)
        setError(null)
        setSuccess(null)

        try {
            const payload = {
                text: ruleText.trim(),
                category: selectedCategory,
                obra_social: selectedOS,
                medico: selectedMedico,
                author: currentUser,
                is_active: true,
                status: 'active'
            }

            const resp = await fetch(`${RAG_API_BASE}/rules`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}))
                throw new Error(err.detail || 'Error al guardar la regla')
            }

            const result = await resp.json()
            setSuccess(`✅ Regla guardada y activa: "${result.title}"`)
            setRuleText('')
            loadRules()
            setTimeout(() => setSuccess(null), 5000)
        } catch (e) {
            setError(e.message)
        }
        setIsSubmitting(false)
    }

    async function handleDeleteRule(ruleId) {
        setDeletingRuleId(null)
        try {
            const resp = await fetch(`${RAG_API_BASE}/rules/${ruleId}`, { method: 'DELETE' })
            if (resp.ok) {
                setSuccess('✅ Regla eliminada correctamente')
                setTimeout(() => setSuccess(null), 3000)
            }
            loadRules()
        } catch (e) {
            setError('Error al eliminar la regla')
        }
    }

    async function handleApproveRule(ruleId) {
        try {
            const resp = await fetch(`${RAG_API_BASE}/rules/${ruleId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: true, status: 'active' })
            })
            if (resp.ok) {
                setSuccess('✅ Regla aprobada e integrada a Simon IA')
                setTimeout(() => setSuccess(null), 3500)
                loadRules()
            }
        } catch (e) {
            setError('Error al aprobar la regla')
        }
    }

    async function handleToggleRuleStatus(rule) {
        const nextState = !rule.is_active
        try {
            const resp = await fetch(`${RAG_API_BASE}/rules/${rule.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: nextState })
            })
            if (resp.ok) {
                setSuccess(`✅ Regla ${nextState ? 'activada' : 'desactivada'} correctamente`)
                setTimeout(() => setSuccess(null), 3000)
                loadRules()
            }
        } catch (e) {
            setError('Error al cambiar estado de la regla')
        }
    }

    function startEditing(rule) {
        setEditingRuleId(rule.id)
        setEditText(rule.original_text || rule.processed_text || rule.text || '')
        setEditOS(rule.obra_social || 'General / Sin Obra Social Especifica')
        setEditMedico(rule.medico || 'General / Todos los Médicos')
        setEditCategory(rule.category || 'obra_social')
        setError(null)
    }

    function cancelEditing() {
        setEditingRuleId(null)
        setEditText('')
    }

    async function handleSaveEdit(ruleId) {
        if (!editText.trim() || editText.trim().length < 5) {
            setError('El texto de la regla debe tener al menos 5 caracteres')
            return
        }

        setIsSavingEdit(true)
        setError(null)

        try {
            const resp = await fetch(`${RAG_API_BASE}/rules/${ruleId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: editText.trim(),
                    obra_social: editOS,
                    medico: editMedico,
                    category: editCategory
                })
            })

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}))
                throw new Error(err.detail || 'Error al actualizar la regla')
            }

            const result = await resp.json()
            setSuccess(`✅ Regla actualizada: "${result.title}"`)
            setEditingRuleId(null)
            setEditText('')
            loadRules()
            setTimeout(() => setSuccess(null), 5000)
        } catch (e) {
            setError(e.message)
        }
        setIsSavingEdit(false)
    }

    // Speech-to-Text
    function toggleListening() {
        if (isListening) {
            stopListening()
        } else {
            startListening()
        }
    }

    function startListening() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
        if (!SpeechRecognition) {
            setError('Tu navegador no soporta reconocimiento de voz. Usá Chrome.')
            return
        }

        const recognition = new SpeechRecognition()
        recognition.lang = 'es-AR'
        recognition.continuous = true
        recognition.interimResults = true

        recognition.onresult = (event) => {
            let finalTranscript = ''
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript
                if (event.results[i].isFinal) {
                    finalTranscript += transcript
                }
            }
            if (finalTranscript) {
                setRuleText(prev => prev + (prev ? ' ' : '') + finalTranscript)
            }
        }

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error)
            setIsListening(false)
        }

        recognition.onend = () => {
            setIsListening(false)
        }

        recognition.start()
        recognitionRef.current = recognition
        setIsListening(true)
        setError(null)
    }

    function stopListening() {
        if (recognitionRef.current) {
            recognitionRef.current.stop()
            recognitionRef.current = null
        }
        setIsListening(false)
    }

    function getCategoryStyle(category) {
        return CATEGORY_LABELS[category] || CATEGORY_LABELS.general
    }

    function formatDate(dateStr) {
        if (!dateStr) return 'Reciente'
        try {
            const d = new Date(dateStr)
            return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        } catch { return dateStr }
    }

    // Filter & Group Rules
    const inboxRules = rules.filter(r => (r.author || '').includes('Ingestión Automática') && r.status === 'pending_validation');
    const generalRules = rules.filter(r => !((r.author || '').includes('Ingestión Automática') && r.status === 'pending_validation'));

    const filteredRules = generalRules.filter(r => {
        if (!searchFilter.trim()) return true;
        const q = searchFilter.toLowerCase();
        return (
            (r.title || '').toLowerCase().includes(q) ||
            (r.processed_text || '').toLowerCase().includes(q) ||
            (r.original_text || '').toLowerCase().includes(q) ||
            (r.text || '').toLowerCase().includes(q) ||
            (r.obra_social || '').toLowerCase().includes(q) ||
            (r.medico || '').toLowerCase().includes(q)
        );
    });

    const groupedRules = {};
    filteredRules.forEach(rule => {
        let groupKey = 'General / Sin Agrupar';

        if (groupBy === 'obra_social') {
            groupKey = rule.obra_social || 'General / Sin Obra Social Especifica';
        } else if (groupBy === 'medico') {
            groupKey = rule.medico || 'General / Todos los Médicos';
        } else if (groupBy === 'category') {
            const cat = CATEGORY_LABELS[rule.category] || CATEGORY_LABELS.general;
            groupKey = cat.label;
        } else if (groupBy === 'status') {
            if (rule.status === 'pending_validation' || rule.is_active === false || rule.original_text?.includes('Propuesta')) {
                groupKey = '📌 Pendientes de Aprobación';
            } else if (rule.is_active !== false) {
                groupKey = '✅ Reglas Activas';
            } else {
                groupKey = '⏸️ Reglas Inactivas';
            }
        }

        if (!groupedRules[groupKey]) groupedRules[groupKey] = [];
        groupedRules[groupKey].push(rule);
    });

    return (
        <div className="rag-rules-panel" style={{ padding: '24px 32px', background: '#f8fafc', minHeight: '100vh', boxSizing: 'border-box' }}>
            {/* Header */}
            <div className="rag-rules-header" style={{ background: 'white', padding: '20px 24px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                <div className="rag-rules-header-info" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Shield size={22} color="#2563eb" />
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>Submódulo de Reglas y Normativas</h3>
                        <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#64748b' }}>Conocimiento preciso asociado a Obras Sociales, Médicos y Protocolos</p>
                    </div>
                </div>
                <span className="badge info" style={{ background: '#dbeafe', color: '#1d4ed8', padding: '6px 14px', borderRadius: '12px', fontWeight: 700, fontSize: '12px' }}>
                    {rules.length} regla{rules.length !== 1 ? 's' : ''} cargada{rules.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', borderBottom: '2px solid #e2e8f0', paddingBottom: '0' }}>
                <button
                    onClick={() => setActiveTab('rules')}
                    style={{
                        background: 'none', border: 'none', padding: '12px 20px', cursor: 'pointer',
                        fontSize: '14px', fontWeight: 600, color: activeTab === 'rules' ? '#2563eb' : '#64748b',
                        borderBottom: activeTab === 'rules' ? '2px solid #2563eb' : '2px solid transparent',
                        marginBottom: '-2px', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s'
                    }}
                >
                    <BookOpen size={16} /> Gestión General de Reglas
                </button>
                <button
                    onClick={() => setActiveTab('inbox')}
                    style={{
                        background: 'none', border: 'none', padding: '12px 20px', cursor: 'pointer',
                        fontSize: '14px', fontWeight: 600, color: activeTab === 'inbox' ? '#2563eb' : '#64748b',
                        borderBottom: activeTab === 'inbox' ? '2px solid #2563eb' : '2px solid transparent',
                        marginBottom: '-2px', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s'
                    }}
                >
                    <Mail size={16} /> Bandeja de Entrada (Correos)
                    {inboxRules.length > 0 && (
                        <span style={{ background: '#ef4444', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', marginLeft: '4px', boxShadow: '0 2px 4px rgba(239, 68, 68, 0.3)' }}>
                            {inboxRules.length} Nuevos
                        </span>
                    )}
                </button>
            </div>

            {activeTab === 'rules' && (
                <>
            {/* Input & Form Area */}
            <div className="rag-rules-input-area" style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Plus size={18} color="#2563eb" />
                    <span>Agregar Nueva Regla o Protocolo a Simon IA</span>
                </div>

                <div className="rag-rules-input-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <textarea
                        ref={textareaRef}
                        className="rag-rules-textarea"
                        value={ruleText}
                        onChange={(e) => setRuleText(e.target.value)}
                        placeholder='Ej: "Para la Obra Social 647 - ROISA es obligatorio solicitar la orden médica autorizada y fotocopia de DNI para la práctica 042..."'
                        rows={3}
                        disabled={isSubmitting}
                        style={{ border: '1.5px solid #cbd5e1', borderRadius: '10px', padding: '12px 16px', fontSize: '13.5px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                    />

                    {/* Precision Associations: Obra Social, Médico & Categoría */}
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '220px' }}>
                            <Building2 size={15} color="#2563eb" />
                            <select
                                value={selectedOS}
                                onChange={(e) => setSelectedOS(e.target.value)}
                                style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', background: 'white', cursor: 'pointer', fontWeight: 500 }}
                            >
                                {osList.map((os, i) => (
                                    <option key={i} value={os}>{os}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '200px' }}>
                            <UserCheck size={15} color="#059669" />
                            <select
                                value={selectedMedico}
                                onChange={(e) => setSelectedMedico(e.target.value)}
                                style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', background: 'white', cursor: 'pointer', fontWeight: 500 }}
                            >
                                {DEFAULT_DOCTORS.map((doc, i) => (
                                    <option key={i} value={doc}>{doc}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '180px' }}>
                            <Tag size={15} color="#d97706" />
                            <select
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', background: 'white', cursor: 'pointer', fontWeight: 500 }}
                            >
                                <option value="obra_social">Obra Social</option>
                                <option value="precios">Precios y Cobros</option>
                                <option value="protocolo">Protocolo Médico</option>
                                <option value="administrativo">Administrativo</option>
                                <option value="medico">Médico / Especialidad</option>
                                <option value="general">General</option>
                            </select>
                        </div>

                        <div className="rag-rules-input-actions" style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                            <button
                                className={`rag-rules-mic-btn ${isListening ? 'listening' : ''}`}
                                onClick={toggleListening}
                                title={isListening ? 'Detener grabación' : 'Dictar regla por voz'}
                                disabled={isSubmitting}
                                style={{ background: isListening ? '#ef4444' : '#f1f5f9', color: isListening ? 'white' : '#475569', border: '1px solid #cbd5e1', padding: '9px 14px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                            </button>
                            <button
                                className="rag-rules-submit-btn"
                                onClick={handleSubmitRule}
                                disabled={isSubmitting || !ruleText.trim()}
                                style={{ background: '#2563eb', color: 'white', border: 'none', padding: '9px 20px', borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: !ruleText.trim() ? 0.6 : 1 }}
                            >
                                {isSubmitting ? <Loader2 size={16} className="rag-spin" /> : <Send size={16} />}
                                Guardar Regla
                            </button>
                        </div>
                    </div>
                </div>

                {isListening && (
                    <div className="rag-rules-listening-indicator" style={{ marginTop: '12px', color: '#dc2626', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Volume2 size={14} /> Escuchando... hablá claro y pausado
                    </div>
                )}

                {error && (
                    <div className="rag-rules-alert error" style={{ marginTop: '12px', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <AlertCircle size={15} /> {error}
                        </div>
                        <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}><X size={13} /></button>
                    </div>
                )}

                {success && (
                    <div className="rag-rules-alert success" style={{ marginTop: '12px', color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                        <CheckCircle size={15} /> {success}
                    </div>
                )}
            </div>

            {/* View Grouping Controls & Search Bar */}
            <div style={{ background: 'white', padding: '16px 24px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Layers size={15} /> Agrupar por:
                    </span>
                    <button
                        onClick={() => setGroupBy('obra_social')}
                        style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: groupBy === 'obra_social' ? '#2563eb' : 'white', color: groupBy === 'obra_social' ? 'white' : '#475569', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                    >
                        🏢 Obra Social
                    </button>
                    <button
                        onClick={() => setGroupBy('medico')}
                        style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: groupBy === 'medico' ? '#2563eb' : 'white', color: groupBy === 'medico' ? 'white' : '#475569', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                    >
                        🩺 Médico / Especialidad
                    </button>
                    <button
                        onClick={() => setGroupBy('category')}
                        style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: groupBy === 'category' ? '#2563eb' : 'white', color: groupBy === 'category' ? 'white' : '#475569', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                    >
                        🏷️ Categoría
                    </button>
                    <button
                        onClick={() => setGroupBy('status')}
                        style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: groupBy === 'status' ? '#2563eb' : 'white', color: groupBy === 'status' ? 'white' : '#475569', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                    >
                        📌 Estado
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '8px', padding: '6px 14px', width: '280px' }}>
                    <Filter size={15} color="#64748b" />
                    <input
                        type="text"
                        placeholder="Filtrar por texto, OS o médico..."
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '13px', width: '100%' }}
                    />
                </div>
            </div>

            {/* Rules Grouped Accordions */}
            <div className="rag-rules-list" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {isLoading ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#64748b', fontSize: '14px' }}>
                        <Loader2 size={20} className="rag-spin" /> Cargando reglas de Simon IA...
                    </div>
                ) : Object.keys(groupedRules).length === 0 ? (
                    <div style={{ background: 'white', borderRadius: '16px', padding: '40px', textAlign: 'center', border: '1px solid #e2e8f0', color: '#64748b' }}>
                        <BookOpen size={32} style={{ color: '#cbd5e1', marginBottom: '12px' }} />
                        <p style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#334155' }}>No se encontraron reglas</p>
                        <span style={{ fontSize: '13px' }}>Ingresá una regla nueva o modifica el filtro de búsqueda</span>
                    </div>
                ) : (
                    Object.entries(groupedRules).map(([groupName, groupItems]) => {
                        const isCollapsed = collapsedGroups[groupName] !== false;

                        return (
                            <div key={groupName} style={{ background: 'white', borderRadius: '14px', border: '1px solid #cbd5e1', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                                <div
                                    onClick={() => setCollapsedGroups(prev => ({ ...prev, [groupName]: prev[groupName] === false ? true : false }))}
                                    style={{ padding: '14px 20px', background: '#f8fafc', borderBottom: isCollapsed ? 'none' : '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <Building2 size={18} color="#2563eb" />
                                        <strong style={{ fontSize: '14px', color: '#0f172a' }}>{groupName}</strong>
                                        <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '2px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
                                            {groupItems.length} regla{groupItems.length !== 1 ? 's' : ''}
                                        </span>
                                    </div>
                                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                                        {isCollapsed ? 'Desplegar ⬇️' : 'Colapsar ⬆️'}
                                    </span>
                                </div>

                                {!isCollapsed && (
                                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        {groupItems.map(rule => {
                                            const catStyle = getCategoryStyle(rule.category)
                                            const isEditing = editingRuleId === rule.id
                                            const isPending = rule.status === 'pending_validation' || rule.is_active === false || rule.original_text?.includes('Propuesta')

                                            return (
                                                <div key={rule.id} style={{ background: '#f8fafc', border: isPending ? '1.5px solid #f59e0b' : '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                    {/* Rule Header Badges */}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                            <span style={{ color: catStyle.color, background: catStyle.bg, padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                                                                {catStyle.label}
                                                            </span>

                                                            {rule.obra_social && (
                                                                <span style={{ color: '#1d4ed8', background: '#dbeafe', padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600 }}>
                                                                    🏢 {rule.obra_social}
                                                                </span>
                                                            )}

                                                            {rule.medico && (
                                                                <span style={{ color: '#047857', background: '#ecfdf5', padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600 }}>
                                                                    🩺 {rule.medico}
                                                                </span>
                                                            )}

                                                            {isPending && (
                                                                <span style={{ color: '#b45309', background: '#fef3c7', padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                    <AlertCircle size={11} /> 📌 Pendiente de Aprobación
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: '#94a3b8' }}>
                                                            <span>👤 Autor: <strong>{rule.author || 'Administrador'}</strong></span>
                                                            <span><Clock size={11} /> {formatDate(rule.created_at)}</span>
                                                        </div>
                                                    </div>

                                                    {/* Edit Mode vs View Mode */}
                                                    {isEditing ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'white', padding: '14px', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
                                                            <textarea
                                                                ref={editTextareaRef}
                                                                value={editText}
                                                                onChange={(e) => setEditText(e.target.value)}
                                                                rows={3}
                                                                style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px', fontSize: '13px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                                                            />
                                                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                                                <select value={editOS} onChange={e => setEditOS(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}>
                                                                    {osList.map((os, i) => <option key={i} value={os}>{os}</option>)}
                                                                </select>
                                                                <select value={editMedico} onChange={e => setEditMedico(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}>
                                                                    {DEFAULT_DOCTORS.map((doc, i) => <option key={i} value={doc}>{doc}</option>)}
                                                                </select>
                                                                <select value={editCategory} onChange={e => setEditCategory(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}>
                                                                    <option value="obra_social">Obra Social</option>
                                                                    <option value="precios">Precios y Cobros</option>
                                                                    <option value="protocolo">Protocolo Médico</option>
                                                                    <option value="administrativo">Administrativo</option>
                                                                    <option value="medico">Médico / Especialidad</option>
                                                                    <option value="general">General</option>
                                                                </select>
                                                            </div>
                                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                                                <button onClick={() => handleSaveEdit(rule.id)} disabled={isSavingEdit} style={{ background: '#2563eb', color: 'white', border: 'none', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                                                                    <Save size={13} /> Guardar
                                                                </button>
                                                                <button onClick={cancelEditing} style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                                                                    Cancelar
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div>
                                                            <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{rule.title || 'Instrucción de Regla'}</h4>
                                                            <p style={{ margin: 0, fontSize: '13px', color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                                                {rule.processed_text || rule.text || rule.original_text}
                                                            </p>
                                                        </div>
                                                    )}

                                                    {/* Card Actions */}
                                                    {!isEditing && (
                                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
                                                            {isPending && (
                                                                <button
                                                                    onClick={() => handleApproveRule(rule.id)}
                                                                    style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                                                                >
                                                                    <CheckCircle size={13} /> Aprobar Regla
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => handleToggleRuleStatus(rule)}
                                                                style={{ background: rule.is_active !== false ? '#f1f5f9' : '#fef3c7', color: rule.is_active !== false ? '#475569' : '#b45309', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}
                                                            >
                                                                {rule.is_active !== false ? <ToggleRight size={14} color="#059669" /> : <ToggleLeft size={14} color="#94a3b8" />}
                                                                {rule.is_active !== false ? 'Activa' : 'Inactiva'}
                                                            </button>
                                                            <button
                                                                onClick={() => startEditing(rule)}
                                                                style={{ background: 'white', color: '#2563eb', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                                                            >
                                                                <Pencil size={13} /> Editar
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteRule(rule.id)}
                                                                style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}
                                                            >
                                                                <Trash2 size={13} /> Borrar
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
            </>
            )}

            {activeTab === 'inbox' && (
                <div className="rag-rules-inbox" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {inboxRules.length === 0 ? (
                        <div style={{ padding: '60px 40px', textAlign: 'center', color: '#64748b', background: 'white', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
                            <CheckCircle size={48} color="#10b981" style={{ marginBottom: '16px', opacity: 0.8 }} />
                            <h3 style={{ margin: '0 0 8px 0', color: '#0f172a', fontSize: '18px' }}>Bandeja al día</h3>
                            <p style={{ margin: 0, fontSize: '14px' }}>No hay correos pendientes de revisión en este momento.</p>
                        </div>
                    ) : (
                        inboxRules.map(rule => (
                            <div key={rule.id} style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ background: '#eff6ff', padding: '10px', borderRadius: '50%', color: '#2563eb' }}>
                                            <Mail size={22} />
                                        </div>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '16px', color: '#0f172a', fontWeight: 700 }}>{rule.title || 'Correo sin asunto'}</h4>
                                            <span style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                                                <Clock size={12} /> Recibido: {formatDate(rule.created_at)}
                                            </span>
                                        </div>
                                    </div>
                                    <span className="badge" style={{ background: '#fef3c7', color: '#d97706', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 700 }}>
                                        Pendiente
                                    </span>
                                </div>

                                {editingRuleId === rule.id ? (
                                    <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '10px', border: '1px solid #cbd5e1', marginTop: '20px' }}>
                                        <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '8px', display: 'block' }}>Contenido de la regla (editable)</label>
                                        <textarea
                                            ref={editTextareaRef}
                                            value={editText}
                                            onChange={(e) => setEditText(e.target.value)}
                                            rows={6}
                                            style={{ width: '100%', padding: '14px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', marginBottom: '20px', lineHeight: 1.5 }}
                                        />
                                        
                                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
                                            <div style={{ flex: 1, minWidth: '200px' }}>
                                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Building2 size={14} color="#2563eb" /> Obra Social
                                                </label>
                                                <select value={editOS} onChange={(e) => setEditOS(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', fontWeight: 500 }}>
                                                    {osList.map((os, i) => <option key={i} value={os}>{os}</option>)}
                                                </select>
                                            </div>
                                            <div style={{ flex: 1, minWidth: '200px' }}>
                                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <UserCheck size={14} color="#059669" /> Médico / Especialidad
                                                </label>
                                                <select value={editMedico} onChange={(e) => setEditMedico(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', fontWeight: 500 }}>
                                                    {DEFAULT_DOCTORS.map((doc, i) => <option key={i} value={doc}>{doc}</option>)}
                                                </select>
                                            </div>
                                            <div style={{ flex: 1, minWidth: '180px' }}>
                                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Tag size={14} color="#d97706" /> Categoría
                                                </label>
                                                <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', fontWeight: 500 }}>
                                                    <option value="obra_social">Obra Social</option>
                                                    <option value="precios">Precios y Cobros</option>
                                                    <option value="protocolo">Protocolo Médico</option>
                                                    <option value="administrativo">Administrativo</option>
                                                    <option value="medico">Médico / Especialidad</option>
                                                    <option value="general">General</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                            <button onClick={() => { handleSaveEdit(rule.id); setTimeout(() => handleApproveRule(rule.id), 500); }} disabled={isSavingEdit} style={{ background: '#10b981', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 4px rgba(16,185,129,0.3)' }}>
                                                {isSavingEdit ? <Loader2 size={16} className="rag-spin" /> : <CheckCircle size={16} />} 
                                                Aprobar e Integrar
                                            </button>
                                            <button onClick={cancelEditing} style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                                                Cancelar
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ marginTop: '16px' }}>
                                        <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', color: '#334155', fontSize: '14px', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: '300px', overflowY: 'auto' }}>
                                            {rule.processed_text || rule.text || rule.original_text}
                                        </div>
                                        
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e2e8f0' }}>
                                            <button onClick={() => startEditing(rule)} style={{ background: '#2563eb', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Pencil size={15} /> Revisar y Aprobar
                                            </button>
                                            <button onClick={() => handleDeleteRule(rule.id)} style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Trash2 size={15} /> Descartar Correo
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}

        </div>
    )
}
