/**
 * SimonAnalytics — Dashboard de Analytics para Simon IA
 * Muestra métricas de uso, calidad, pipeline, y tendencias
 */
import { useState, useEffect } from 'react'
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    AreaChart, Area
} from 'recharts'
import {
    TrendingUp, MessageSquare, CheckCircle, AlertCircle,
    FileText, Brain, Clock, Loader2, RefreshCw, BarChart3,
    Search, Sparkles, HelpCircle, BookOpen, Shield, Zap,
    Target, Activity, ThumbsUp, ThumbsDown, AlertTriangle,
    Plus, Trash2, Pencil, Save
} from 'lucide-react'

import { getFeedbackHistory } from '../../api/ragClient'
import '../../simon-redesign.css'

const RAG_API_BASE = import.meta.env.VITE_RAG_API_URL || '/rag-api'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899']

const QUALITY_COLORS = {
    successful: '#10b981',
    no_info: '#ef4444',
    clarification: '#f59e0b',
}

export default function SimonAnalytics() {
    const [data, setData] = useState(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState(null)
    const [period, setPeriod] = useState(30)
    const [feedbackData, setFeedbackData] = useState(null)
    const [showOnlyIncorrect, setShowOnlyIncorrect] = useState(true)
    const [expandedFeedbackId, setExpandedFeedbackId] = useState(null)

    // Quick Rule Creator State
    const [quickRuleText, setQuickRuleText] = useState('')
    const [quickRuleCategory, setQuickRuleCategory] = useState('obra_social')
    const [isSubmittingQuickRule, setIsSubmittingQuickRule] = useState(false)
    const [quickRuleSuccess, setQuickRuleSuccess] = useState(null)

    // Pending User Proposals & Pagination State
    const [pendingRules, setPendingRules] = useState([])
    const [isLoadingPendingRules, setIsLoadingPendingRules] = useState(false)
    const [feedbackPage, setFeedbackPage] = useState(1)
    const [auditPage, setAuditPage] = useState(1)
    const [truthInputs, setTruthInputs] = useState({})
    const [truthCategories, setTruthCategories] = useState({})
    const [savingTruthId, setSavingTruthId] = useState(null)

    const ITEMS_PER_PAGE = 5

    useEffect(() => {
        loadAnalytics()
        loadPendingRules()
    }, [period])

    async function handleSaveTruthAsRule(questionText, itemId) {
        const truthText = (truthInputs[itemId] || '').trim()
        if (!truthText || truthText.length < 5) {
            alert('Por favor ingresá la respuesta o regla verdadera antes de guardar.')
            return
        }
        const category = truthCategories[itemId] || 'general'
        setSavingTruthId(itemId)
        try {
            const rulePayload = {
                text: `[Regla Oficial - Corrección de Feedback]\nPregunta original: "${questionText || 'Consulta'}"\nRespuesta Oficial / Verdad:\n${truthText}`,
                title: `Regla: ${(questionText || 'Corrección').slice(0, 45)}...`,
                category: category,
                is_active: true,
                status: 'active',
                author: 'Administrador Sanatorio'
            }
            const resp = await fetch(`${RAG_API_BASE}/rules`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rulePayload)
            })
            if (!resp.ok) throw new Error('Error al guardar la regla oficial')
            alert('✅ ¡Respuesta verdadera guardada e incorporada como Regla Activa en Simon!')
            setTruthInputs(prev => ({ ...prev, [itemId]: '' }))
            // If item has a rule id, dismiss it
            handleDeletePendingRule(itemId)
            loadPendingRules()
        } catch (e) {
            alert(e.message || 'Error al guardar regla')
        }
        setSavingTruthId(null)
    }

    async function loadPendingRules() {
        setIsLoadingPendingRules(true)
        try {
            const resp = await fetch(`${RAG_API_BASE}/rules`)
            if (resp.ok) {
                const result = await resp.json()
                const rulesList = result.rules || []
                const filtered = rulesList.filter(r => r.status === 'pending_validation' || r.is_active === false || (r.original_text && r.original_text.includes('Propuesta')))
                setPendingRules(filtered)
            }
        } catch (e) {
            console.error('Error loading pending rules:', e)
        }
        setIsLoadingPendingRules(false)
    }

    async function handleCreateQuickRule() {
        if (!quickRuleText.trim() || quickRuleText.trim().length < 5) return
        setIsSubmittingQuickRule(true)
        setQuickRuleSuccess(null)
        try {
            const resp = await fetch(`${RAG_API_BASE}/rules`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: quickRuleText.trim(),
                    category: quickRuleCategory,
                    is_active: true
                })
            })
            if (!resp.ok) throw new Error('Error al guardar regla instantánea')
            const result = await resp.json()
            setQuickRuleSuccess(`✅ Regla instantánea guardada y activa: "${result.title}"`)
            setQuickRuleText('')
            setTimeout(() => setQuickRuleSuccess(null), 4000)
        } catch (e) {
            alert(e.message)
        }
        setIsSubmittingQuickRule(false)
    }

    async function handleApproveUserRule(ruleId) {
        try {
            const resp = await fetch(`${RAG_API_BASE}/rules/${ruleId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: true, status: 'active' })
            })
            if (resp.ok) {
                alert('✅ Propuesta validada y activada exitosamente como regla oficial de Simon')
                loadPendingRules()
            }
        } catch (e) {
            alert('Error al activar regla')
        }
    }

    async function handleDeletePendingRule(ruleId) {
        try {
            const resp = await fetch(`${RAG_API_BASE}/rules/${ruleId}`, { method: 'DELETE' })
            if (resp.ok) {
                loadPendingRules()
            }
        } catch (e) {
            console.error('Error al descartar regla:', e)
        }
    }

    async function handleDeleteFeedback(feedbackId) {
        if (!confirm('¿Estás seguro de que querés eliminar este registro de calificación?')) return
        try {
            const resp = await fetch(`${RAG_API_BASE}/feedback/${feedbackId}`, { method: 'DELETE' })
            if (resp.ok) {
                alert('✅ Registro eliminado correctamente')
                loadAnalytics()
            } else {
                throw new Error('Error al eliminar registro')
            }
        } catch (e) {
            console.error('Error al eliminar feedback:', e)
            alert('Hubo un error al eliminar el registro.')
        }
    }

    async function loadAnalytics() {
        setIsLoading(true)
        setError(null)
        try {
            const [resp, fbResp] = await Promise.all([
                fetch(`${RAG_API_BASE}/analytics?days=${period}`),
                getFeedbackHistory(period),
            ])
            if (!resp.ok) throw new Error('Error al cargar analytics')
            const result = await resp.json()
            setData(result)
            setFeedbackData(fbResp)
        } catch (e) {
            setError(e.message)
        }
        setIsLoading(false)
    }

    if (isLoading) {
        return (
            <div className="simon-analytics">
                <div className="simon-analytics-loading">
                    <Loader2 size={24} className="rag-spin" />
                    <p>Cargando analytics de Simon...</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="simon-analytics">
                <div className="simon-analytics-error">
                    <AlertCircle size={24} />
                    <p>{error}</p>
                    <button onClick={loadAnalytics}>Reintentar</button>
                </div>
            </div>
        )
    }

    if (!data) return null

    const { overview, daily_usage, top_topics, response_quality, pipeline_performance, top_sources, knowledge_base, disambiguation, hourly_distribution } = data

    // Prepare pie chart data
    const qualityPie = [
        { name: 'Exitosas', value: response_quality.successful, color: QUALITY_COLORS.successful },
        { name: 'Sin info', value: response_quality.no_info, color: QUALITY_COLORS.no_info },
        { name: 'Clarificación', value: response_quality.clarification, color: QUALITY_COLORS.clarification },
    ].filter(d => d.value > 0)

    return (
        <div className="simon-analytics">
            {/* Header */}
            <div className="sa-header">
                <div className="sa-header-left">
                    <BarChart3 size={20} />
                    <div>
                        <h2>Analytics de Simon</h2>
                        <p>Métricas de uso y rendimiento</p>
                    </div>
                </div>
                <div className="sa-header-actions">
                    <select
                        className="sa-period-select"
                        value={period}
                        onChange={e => setPeriod(Number(e.target.value))}
                    >
                        <option value={7}>Últimos 7 días</option>
                        <option value={30}>Últimos 30 días</option>
                        <option value={90}>Últimos 90 días</option>
                    </select>
                    <button className="sa-refresh-btn" onClick={() => { loadAnalytics(); loadPendingRules(); }} title="Actualizar">
                        <RefreshCw size={14} />
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="sa-kpi-grid">
                <div className="sa-kpi-card">
                    <div className="sa-kpi-icon" style={{ background: '#eff6ff', color: '#3b82f6' }}>
                        <MessageSquare size={18} />
                    </div>
                    <div className="sa-kpi-value">{overview.total_questions}</div>
                    <div className="sa-kpi-label">Consultas</div>
                </div>
                <div className="sa-kpi-card">
                    <div className="sa-kpi-icon" style={{ background: '#ecfdf5', color: '#10b981' }}>
                        <CheckCircle size={18} />
                    </div>
                    <div className="sa-kpi-value">{response_quality.satisfaction_score}%</div>
                    <div className="sa-kpi-label">Satisfacción</div>
                </div>
                <div className="sa-kpi-card">
                    <div className="sa-kpi-icon" style={{ background: '#f5f3ff', color: '#8b5cf6' }}>
                        <Brain size={18} />
                    </div>
                    <div className="sa-kpi-value">{overview.total_conversations}</div>
                    <div className="sa-kpi-label">Conversaciones</div>
                </div>
                <div className="sa-kpi-card">
                    <div className="sa-kpi-icon" style={{ background: '#fff7ed', color: '#f97316' }}>
                        <FileText size={18} />
                    </div>
                    <div className="sa-kpi-value">{knowledge_base.total_chunks}</div>
                    <div className="sa-kpi-label">Docs indexados</div>
                </div>
            </div>

            {/* Charts Row 1: Daily Usage + Response Quality */}
            <div className="sa-charts-row">
                <div className="sa-chart-card sa-chart-wide">
                    <div className="sa-chart-title">
                        <TrendingUp size={14} />
                        Consultas por día
                    </div>
                    <div className="sa-chart-body">
                        {daily_usage.length > 0 ? (
                            <ResponsiveContainer width="100%" height={200}>
                                <AreaChart data={daily_usage}>
                                    <defs>
                                        <linearGradient id="colorQueries" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis
                                        dataKey="date"
                                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                                        tickFormatter={d => d.slice(5)}
                                    />
                                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                    <Tooltip
                                        contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                        labelFormatter={d => `Fecha: ${d}`}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="queries"
                                        stroke="#3b82f6"
                                        strokeWidth={2}
                                        fill="url(#colorQueries)"
                                        name="Consultas"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="sa-chart-empty">Sin datos en este período</div>
                        )}
                    </div>
                </div>

                <div className="sa-chart-card">
                    <div className="sa-chart-title">
                        <Target size={14} />
                        Calidad de respuestas
                    </div>
                    <div className="sa-chart-body">
                        {qualityPie.length > 0 ? (
                            <div className="sa-quality-section">
                                <ResponsiveContainer width="100%" height={140}>
                                    <PieChart>
                                        <Pie
                                            data={qualityPie}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={35}
                                            outerRadius={60}
                                            paddingAngle={3}
                                            dataKey="value"
                                        >
                                            {qualityPie.map((entry, i) => (
                                                <Cell key={i} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="sa-quality-legend">
                                    {qualityPie.map((item, i) => (
                                        <div key={i} className="sa-quality-item">
                                            <span className="sa-quality-dot" style={{ background: item.color }} />
                                            <span>{item.name}</span>
                                            <strong>{item.value}</strong>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="sa-chart-empty">Sin datos</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Charts Row 2: Top Keywords + Top Sources */}
            <div className="sa-charts-row">
                <div className="sa-chart-card">
                    <div className="sa-chart-title">
                        <Search size={14} />
                        Temas más consultados
                    </div>
                    <div className="sa-chart-body">
                        {top_topics?.keywords?.length > 0 ? (
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart
                                    data={top_topics.keywords.slice(0, 8)}
                                    layout="vertical"
                                    margin={{ left: 60 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                    <YAxis
                                        dataKey="keyword"
                                        type="category"
                                        tick={{ fontSize: 10, fill: '#64748b' }}
                                        width={55}
                                    />
                                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                                    <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} name="Menciones" />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="sa-chart-empty">Sin datos suficientes</div>
                        )}
                    </div>
                </div>

                <div className="sa-chart-card">
                    <div className="sa-chart-title">
                        <BookOpen size={14} />
                        Documentos más citados
                    </div>
                    <div className="sa-chart-body">
                        {top_sources?.length > 0 ? (
                            <div className="sa-source-list">
                                {top_sources.slice(0, 8).map((src, i) => (
                                    <div key={i} className="sa-source-item">
                                        <span className="sa-source-rank">#{i + 1}</span>
                                        <span className="sa-source-name" title={src.filename}>
                                            {src.filename.length > 25 ? src.filename.slice(0, 25) + '...' : src.filename}
                                        </span>
                                        <span className="sa-source-count">{src.citations} citas</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="sa-chart-empty">Sin datos</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Row 3: Pipeline Performance + Hourly Distribution */}
            <div className="sa-charts-row">
                <div className="sa-chart-card">
                    <div className="sa-chart-title">
                        <Zap size={14} />
                        Pipeline IA — Rendimiento
                    </div>
                    <div className="sa-chart-body">
                        <div className="sa-pipeline-stats">
                            <div className="sa-pipeline-stat">
                                <span className="sa-pipeline-stat-label">Docs buscados (prom)</span>
                                <span className="sa-pipeline-stat-value">{pipeline_performance.avg_total_searched}</span>
                            </div>
                            <div className="sa-pipeline-stat">
                                <span className="sa-pipeline-stat-label">Resultados únicos (prom)</span>
                                <span className="sa-pipeline-stat-value">{pipeline_performance.avg_unique_results}</span>
                            </div>
                            <div className="sa-pipeline-stat">
                                <span className="sa-pipeline-stat-label">Re-rankeados (prom)</span>
                                <span className="sa-pipeline-stat-value">{pipeline_performance.avg_reranked_kept}</span>
                            </div>
                            <div className="sa-pipeline-stat">
                                <span className="sa-pipeline-stat-label">Multi-queries (prom)</span>
                                <span className="sa-pipeline-stat-value">{pipeline_performance.avg_multi_queries}</span>
                            </div>
                            <div className="sa-pipeline-stat highlight">
                                <span className="sa-pipeline-stat-label">Uso de HyDE</span>
                                <span className="sa-pipeline-stat-value">{pipeline_performance.hyde_usage_rate}%</span>
                            </div>
                            <div className="sa-pipeline-stat highlight">
                                <span className="sa-pipeline-stat-label">Tasa de aprendizaje</span>
                                <span className="sa-pipeline-stat-value">{pipeline_performance.learning_rate}%</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="sa-chart-card">
                    <div className="sa-chart-title">
                        <Clock size={14} />
                        Distribución horaria
                    </div>
                    <div className="sa-chart-body">
                        {hourly_distribution.some(h => h.queries > 0) ? (
                            <ResponsiveContainer width="100%" height={200}>
                                <BarChart data={hourly_distribution}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis
                                        dataKey="hour"
                                        tick={{ fontSize: 9, fill: '#94a3b8' }}
                                        tickFormatter={h => `${h}h`}
                                    />
                                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                    <Tooltip
                                        contentStyle={{ fontSize: 11, borderRadius: 8 }}
                                        labelFormatter={h => `${h}:00 hs`}
                                    />
                                    <Bar dataKey="queries" fill="#06b6d4" radius={[3, 3, 0, 0]} name="Consultas" />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="sa-chart-empty">Sin datos</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Row 4: Knowledge Base + Disambiguation + Frequent Questions */}
            <div className="sa-charts-row sa-charts-triple">
                <div className="sa-chart-card sa-card-compact">
                    <div className="sa-chart-title">
                        <Shield size={14} />
                        Base de conocimiento
                    </div>
                    <div className="sa-chart-body">
                        <div className="sa-kb-stats">
                            <div className="sa-kb-stat">
                                <FileText size={14} />
                                <div>
                                    <strong>{knowledge_base.total_chunks}</strong>
                                    <span>Chunks de documentos</span>
                                </div>
                            </div>
                            <div className="sa-kb-stat">
                                <Shield size={14} />
                                <div>
                                    <strong>{knowledge_base.total_rules}</strong>
                                    <span>Reglas manuales</span>
                                </div>
                            </div>
                            <div className="sa-kb-stat">
                                <Brain size={14} />
                                <div>
                                    <strong>{knowledge_base.total_learned}</strong>
                                    <span>Chunks aprendidos</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="sa-chart-card sa-card-compact">
                    <div className="sa-chart-title">
                        <HelpCircle size={14} />
                        Desambiguación
                    </div>
                    <div className="sa-chart-body">
                        <div className="sa-disambig">
                            <div className="sa-disambig-value">
                                {disambiguation.total_disambiguations}
                            </div>
                            <div className="sa-disambig-rate">
                                {disambiguation.rate}% de consultas
                            </div>
                            <div className={`sa-disambig-badge ${disambiguation.rate < 10 ? 'good' : disambiguation.rate < 25 ? 'warn' : 'bad'}`}>
                                {disambiguation.interpretation}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="sa-chart-card sa-card-compact">
                    <div className="sa-chart-title">
                        <Activity size={14} />
                        Promedio por conversación
                    </div>
                    <div className="sa-chart-body">
                        <div className="sa-disambig">
                            <div className="sa-disambig-value">{overview.avg_messages_per_conversation}</div>
                            <div className="sa-disambig-rate">mensajes promedio</div>
                            <div className="sa-disambig-badge good">
                                {overview.avg_messages_per_conversation > 4
                                    ? 'Buena profundidad de conversación'
                                    : 'Consultas puntuales'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Frequent Questions */}
            {top_topics?.frequent_questions?.length > 0 && (
                <div className="sa-chart-card sa-full-width">
                    <div className="sa-chart-title">
                        <MessageSquare size={14} />
                        Preguntas más frecuentes
                    </div>
                    <div className="sa-chart-body">
                        <div className="sa-faq-list">
                            {top_topics.frequent_questions.slice(0, 8).map((faq, i) => (
                                <div key={i} className="sa-faq-item">
                                    <span className="sa-faq-rank">#{i + 1}</span>
                                    <span className="sa-faq-text">{faq.question}</span>
                                    <span className="sa-faq-count">{faq.count}x</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ===== FEEDBACK METRICS SECTION ===== */}
            {feedbackData && (
                <>
                    <div className="sa-section-divider">
                        <ThumbsUp size={16} />
                        <span>Feedback de Usuarios</span>
                    </div>

                    {/* Feedback KPIs */}
                    <div className="sa-kpi-grid">
                        <div className="sa-kpi-card">
                            <div className="sa-kpi-icon" style={{ background: '#ecfdf5', color: '#10b981' }}>
                                <ThumbsUp size={18} />
                            </div>
                            <div className="sa-kpi-value">
                                {feedbackData.stats?.accuracy || 0}%
                            </div>
                            <div className="sa-kpi-label">Precisión</div>
                        </div>
                        <div className="sa-kpi-card">
                            <div className="sa-kpi-icon" style={{ background: '#eff6ff', color: '#3b82f6' }}>
                                <Target size={18} />
                            </div>
                            <div className="sa-kpi-value">
                                {feedbackData.stats?.total || 0}
                            </div>
                            <div className="sa-kpi-label">Total Calificadas</div>
                        </div>
                        <div className="sa-kpi-card">
                            <div className="sa-kpi-icon" style={{ background: '#f0fdf4', color: '#22c55e' }}>
                                <CheckCircle size={18} />
                            </div>
                            <div className="sa-kpi-value" style={{ color: '#10b981' }}>
                                {feedbackData.stats?.correct || 0}
                            </div>
                            <div className="sa-kpi-label">Correctas</div>
                        </div>
                        <div className="sa-kpi-card">
                            <div className="sa-kpi-icon" style={{ background: '#fef2f2', color: '#ef4444' }}>
                                <ThumbsDown size={18} />
                            </div>
                            <div className="sa-kpi-value" style={{ color: '#ef4444' }}>
                                {feedbackData.stats?.incorrect || 0}
                            </div>
                            <div className="sa-kpi-label">Incorrectas</div>
                        </div>
                    </div>

                    {/* Feedback Quality Chart + Incorrect Responses Table */}
                    <div className="sa-charts-row">
                        {/* Accuracy Pie */}
                        <div className="sa-chart-card">
                            <div className="sa-chart-title">
                                <Target size={14} />
                                Distribución de Feedback
                            </div>
                            <div className="sa-chart-body">
                                {feedbackData.stats?.total > 0 ? (
                                    <div className="sa-quality-section">
                                        <ResponsiveContainer width="100%" height={140}>
                                            <PieChart>
                                                <Pie
                                                    data={[
                                                        { name: 'Correctas', value: feedbackData.stats.correct, color: '#10b981' },
                                                        { name: 'Incorrectas', value: feedbackData.stats.incorrect, color: '#ef4444' },
                                                    ].filter(d => d.value > 0)}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={35}
                                                    outerRadius={60}
                                                    paddingAngle={3}
                                                    dataKey="value"
                                                >
                                                    {[
                                                        { name: 'Correctas', value: feedbackData.stats.correct, color: '#10b981' },
                                                        { name: 'Incorrectas', value: feedbackData.stats.incorrect, color: '#ef4444' },
                                                    ].filter(d => d.value > 0).map((entry, i) => (
                                                        <Cell key={i} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div className="sa-quality-legend">
                                            <div className="sa-quality-item">
                                                <span className="sa-quality-dot" style={{ background: '#10b981' }} />
                                                <span>Correctas</span>
                                                <strong>{feedbackData.stats.correct}</strong>
                                            </div>
                                            <div className="sa-quality-item">
                                                <span className="sa-quality-dot" style={{ background: '#ef4444' }} />
                                                <span>Incorrectas</span>
                                                <strong>{feedbackData.stats.incorrect}</strong>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="sa-chart-empty">Sin calificaciones aún</div>
                                )}
                            </div>
                        </div>

                        {/* Accuracy Indicator */}
                        <div className="sa-chart-card">
                            <div className="sa-chart-title">
                                <Zap size={14} />
                                Indicador de Precisión
                            </div>
                            <div className="sa-chart-body">
                                <div className="sa-accuracy-gauge">
                                    <div className="sa-accuracy-ring">
                                        <svg viewBox="0 0 100 100" width="120" height="120">
                                            <circle cx="50" cy="50" r="42" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                                            <circle
                                                cx="50" cy="50" r="42" fill="none"
                                                stroke={feedbackData.stats?.accuracy >= 80 ? '#10b981' : feedbackData.stats?.accuracy >= 50 ? '#f59e0b' : '#ef4444'}
                                                strokeWidth="8"
                                                strokeLinecap="round"
                                                strokeDasharray={`${(feedbackData.stats?.accuracy || 0) * 2.64} 264`}
                                                transform="rotate(-90 50 50)"
                                                style={{ transition: 'stroke-dasharray 0.8s ease' }}
                                            />
                                        </svg>
                                        <div className="sa-accuracy-value">
                                            <strong>{feedbackData.stats?.accuracy || 0}%</strong>
                                            <span>Precisión</span>
                                        </div>
                                    </div>
                                    <div className={`sa-disambig-badge ${feedbackData.stats?.accuracy >= 80 ? 'good' : feedbackData.stats?.accuracy >= 50 ? 'warn' : 'bad'}`}>
                                        {feedbackData.stats?.accuracy >= 80
                                            ? 'Excelente rendimiento'
                                            : feedbackData.stats?.accuracy >= 50
                                            ? 'Necesita mejoras'
                                            : 'Requiere atención urgente'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Incorrect Responses Audit Table with Pagination of 5 */}
                    {feedbackData.items?.length > 0 && (() => {
                        const filteredList = feedbackData.items.filter(item => !showOnlyIncorrect || !item.is_correct);
                        const totalFbPages = Math.max(1, Math.ceil(filteredList.length / ITEMS_PER_PAGE));
                        const currentFbPage = Math.min(feedbackPage, totalFbPages);
                        const pagedItems = filteredList.slice((currentFbPage - 1) * ITEMS_PER_PAGE, currentFbPage * ITEMS_PER_PAGE);

                        return (
                            <div className="sa-chart-card sa-full-width" style={{ marginBottom: '24px' }}>
                                <div className="sa-chart-title" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <AlertTriangle size={16} color="#ef4444" />
                                        <span>Historial de Calificaciones y Correcciones</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        <label className="sa-toggle-label">
                                            <input
                                                type="checkbox"
                                                checked={showOnlyIncorrect}
                                                onChange={e => { setShowOnlyIncorrect(e.target.checked); setFeedbackPage(1); }}
                                            />
                                            Solo incorrectas
                                        </label>

                                        {/* Pagination Controls */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#64748b' }}>
                                            <button
                                                disabled={currentFbPage <= 1}
                                                onClick={() => setFeedbackPage(prev => Math.max(1, prev - 1))}
                                                style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: currentFbPage <= 1 ? '#f1f5f9' : 'white', cursor: currentFbPage <= 1 ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 600 }}
                                            >
                                                ⬅️ Anterior
                                            </button>
                                            <span>Pág. <strong>{currentFbPage}</strong> de <strong>{totalFbPages}</strong></span>
                                            <button
                                                disabled={currentFbPage >= totalFbPages}
                                                onClick={() => setFeedbackPage(prev => Math.min(totalFbPages, prev + 1))}
                                                style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: currentFbPage >= totalFbPages ? '#f1f5f9' : 'white', cursor: currentFbPage >= totalFbPages ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 600 }}
                                            >
                                                Siguiente ➡️
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="sa-chart-body">
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        {pagedItems.map((item, idx) => {
                                            const itemId = item.id || `fb-${(currentFbPage - 1) * ITEMS_PER_PAGE + idx}`;
                                            return (
                                                <div key={itemId} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                                        <span className={`sa-fb-badge ${item.is_correct ? 'correct' : 'incorrect'}`} style={{ padding: '4px 12px', fontSize: '12px' }}>
                                                            {item.is_correct ? <><ThumbsUp size={12} /> OK - Respuesta Correcta</> : <><ThumbsDown size={12} /> Mal - Respuesta Incorrecta</>}
                                                        </span>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                                                {item.created_at ? new Date(item.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Reciente'}
                                                            </span>
                                                            <button 
                                                                onClick={() => handleDeleteFeedback(item.id)}
                                                                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: 0 }}
                                                                title="Eliminar este registro"
                                                            >
                                                                <Trash2 size={12} /> Borrar
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Full Question Text */}
                                                    <div style={{ background: '#ffffff', border: '1.5px solid #cbd5e1', borderRadius: '10px', padding: '12px 14px' }}>
                                                        <strong style={{ fontSize: '11px', textTransform: 'uppercase', color: '#2563eb', letterSpacing: '0.5px' }}>Pregunta Completa del Usuario:</strong>
                                                        <p style={{ margin: '4px 0 0', fontSize: '13px', fontWeight: 600, color: '#0f172a', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                                            {item.question || 'Consulta sin texto registrado'}
                                                        </p>
                                                    </div>

                                                    {/* Full Simon Answer Text */}
                                                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px' }}>
                                                        <strong style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.5px' }}>Respuesta Completa Brindada por Simon:</strong>
                                                        <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#334155', lineHeight: '1.6', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                                            {item.answer_preview || item.answer || 'Sin respuesta detallada'}
                                                        </p>
                                                    </div>

                                                    {/* Responder con la Verdad & Crear Regla */}
                                                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px 14px', marginTop: '4px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#1d4ed8', marginBottom: '8px' }}>
                                                            <Pencil size={14} />
                                                            <span>Responder con la Verdad / Crear Regla Oficial</span>
                                                        </div>
                                                        <textarea
                                                            value={truthInputs[itemId] || ''}
                                                            onChange={e => setTruthInputs(prev => ({ ...prev, [itemId]: e.target.value }))}
                                                            placeholder="Ingresá la respuesta correcta o normativa real para que Simon aprenda esta verdad como una Regla Activa..."
                                                            rows={2}
                                                            style={{ width: '100%', border: '1px solid #93c5fd', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                                                        />
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap', gap: '8px' }}>
                                                            <select
                                                                value={truthCategories[itemId] || 'obra_social'}
                                                                onChange={e => setTruthCategories(prev => ({ ...prev, [itemId]: e.target.value }))}
                                                                style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white' }}
                                                            >
                                                                <option value="obra_social">Obra Social</option>
                                                                <option value="precios">Precios</option>
                                                                <option value="protocolo">Protocolo</option>
                                                                <option value="administrativo">Administrativo</option>
                                                                <option value="medico">Médico</option>
                                                                <option value="general">General</option>
                                                            </select>
                                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                                <button
                                                                    onClick={() => handleSaveTruthAsRule(item.question, itemId)}
                                                                    disabled={savingTruthId === itemId || !(truthInputs[itemId] || '').trim()}
                                                                    style={{ background: '#2563eb', color: 'white', border: 'none', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: !(truthInputs[itemId] || '').trim() ? 0.6 : 1 }}
                                                                >
                                                                    {savingTruthId === itemId ? <Loader2 size={13} className="rag-spin" /> : <Save size={13} />}
                                                                    Guardar como Regla Oficial
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {filteredList.length === 0 && (
                                            <div className="sa-chart-empty" style={{ padding: '20px 0' }}>
                                                {showOnlyIncorrect ? '🎉 No hay respuestas marcadas como incorrectas' : 'Sin calificaciones en este período'}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Pending User Proposals Audit Section with Pagination of 5 */}
                    <div className="sa-chart-card sa-full-width" style={{ marginTop: '24px', borderLeft: '4px solid #f59e0b', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                        <div className="sa-chart-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap', gap: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a', fontWeight: 700, fontSize: '0.95rem' }}>
                                <AlertTriangle size={18} color="#d97706" />
                                <span>Auditoría de Propuestas de Usuarios</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ background: pendingRules.length > 0 ? '#fef3c7' : '#ecfdf5', color: pendingRules.length > 0 ? '#b45309' : '#047857', padding: '4px 12px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
                                    {pendingRules.length} propuesta(s) pendiente(s)
                                </span>
                                {pendingRules.length > 0 && (() => {
                                    const totalAuditPages = Math.max(1, Math.ceil(pendingRules.length / ITEMS_PER_PAGE));
                                    const currentAuditPage = Math.min(auditPage, totalAuditPages);
                                    return (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#64748b' }}>
                                            <button
                                                disabled={currentAuditPage <= 1}
                                                onClick={() => setAuditPage(prev => Math.max(1, prev - 1))}
                                                style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: currentAuditPage <= 1 ? '#f1f5f9' : 'white', cursor: currentAuditPage <= 1 ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 600 }}
                                            >
                                                ⬅️ Anterior
                                            </button>
                                            <span>Pág. <strong>{currentAuditPage}</strong> de <strong>{totalAuditPages}</strong></span>
                                            <button
                                                disabled={currentAuditPage >= totalAuditPages}
                                                onClick={() => setAuditPage(prev => Math.min(totalAuditPages, prev + 1))}
                                                style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: currentAuditPage >= totalAuditPages ? '#f1f5f9' : 'white', cursor: currentAuditPage >= totalAuditPages ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 600 }}
                                            >
                                                Siguiente ➡️
                                            </button>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                        <div className="sa-chart-body" style={{ padding: '20px' }}>
                            {isLoadingPendingRules ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '13px', padding: '12px 0' }}>
                                    <Loader2 size={16} className="rag-spin" /> Cargando propuestas...
                                </div>
                            ) : pendingRules.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b', fontSize: '13px' }}>
                                    🎉 No hay propuestas de usuario pendientes de validación.
                                </div>
                            ) : (() => {
                                const totalAuditPages = Math.max(1, Math.ceil(pendingRules.length / ITEMS_PER_PAGE));
                                const currentAuditPage = Math.min(auditPage, totalAuditPages);
                                const pagedAuditRules = pendingRules.slice((currentAuditPage - 1) * ITEMS_PER_PAGE, currentAuditPage * ITEMS_PER_PAGE);

                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        {pagedAuditRules.map(rule => (
                                            <div key={rule.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#b45309', background: '#fef3c7', padding: '3px 10px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                        📌 Propuesta ingresada por usuario ({rule.author || 'Usuario'})
                                                    </span>
                                                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                                        {rule.created_at ? new Date(rule.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Reciente'}
                                                    </span>
                                                </div>

                                                <div style={{ fontSize: '13px', color: '#0f172a', fontWeight: 600 }}>
                                                    Título / Referencia: <span style={{ color: '#2563eb' }}>"{rule.title || 'Propuesta de corrección'}"</span>
                                                </div>

                                                {/* Full Rule Text */}
                                                <div style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '12px 14px', fontSize: '13px', color: '#334155', lineHeight: 1.6 }}>
                                                    <strong style={{ color: '#0f172a' }}>Regla / Respuesta Correcta Propuesta (Completa):</strong>
                                                    <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit' }}>{rule.text || rule.processed_text || rule.original_text}</p>
                                                </div>

                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                                                    <button
                                                        onClick={() => handleApproveUserRule(rule.id)}
                                                        style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
                                                    >
                                                        <CheckCircle size={14} /> Validar y Convertir en Regla Activa
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeletePendingRule(rule.id)}
                                                        style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}
                                                    >
                                                        <Trash2 size={14} /> Descartar
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
