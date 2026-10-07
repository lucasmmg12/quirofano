import React, { useState, useEffect, useMemo } from 'react';
import { 
    Sparkles, DollarSign, TrendingUp, TrendingDown, Cpu, Activity,
    Calendar, RefreshCw, AlertTriangle, CheckCircle2, ArrowRight,
    Layers, ShieldAlert, BarChart3, PieChart, Clock, Zap, Info,
    ExternalLink, Search, Filter, HelpCircle, ChevronRight, Sliders
} from 'lucide-react';
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    BarChart,
    Bar,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    Cell
} from 'recharts';
import { supabase } from '../../lib/supabase';

// Tarifas de referencia de OpenAI por 1 Millón de tokens (USD)
const PRICING_TABLE = {
    'gpt-4o-mini': { promptPerM: 0.15, completionPerM: 0.60, name: 'GPT-4o Mini (Recomendado)', tag: 'Máxima Eficiencia', color: '#059669' },
    'gpt-5.4-mini': { promptPerM: 0.25, completionPerM: 1.00, name: 'GPT-5.4 Mini', tag: 'Equilibrado', color: '#0284C7' },
    'gpt-4o': { promptPerM: 2.50, completionPerM: 10.00, name: 'GPT-4o Omni', tag: 'Flagship Anterior', color: '#D97706' },
    'gpt-5.5': { promptPerM: 5.00, completionPerM: 15.00, name: 'GPT-5.5 Flagship', tag: 'Frontier Alta Capacidad', color: '#DC2626' }
};

const SERVICE_LABELS = {
    conversational_bot: { label: 'Bot WhatsApp Conversacional', color: '#0284C7', bg: '#EFF6FF' },
    intent_detector: { label: 'Clasificador de Intenciones', color: '#7C3AED', bg: '#F5F3FF' },
    extract_patient_data: { label: 'Extracción de Datos de Paciente', color: '#059669', bg: '#ECFDF5' },
    chat_summary: { label: 'Resumen Clínico de Chat', color: '#D97706', bg: '#FFFBEB' },
    transcribe_audio_whisper: { label: 'Transcripción Audio (Whisper)', color: '#DB2777', bg: '#FDF2F8' },
    transcribe_audio_triage: { label: 'Triage de Audio (GPT-4o-mini)', color: '#4F46E5', bg: '#EEF2FF' },
    bot_simulation: { label: 'Simulador / Pruebas Sandbox', color: '#64748B', bg: '#F8FAFC' }
};

export default function ContactCenterAiCostTab({
    timeRange = 'this_month',
    setTimeRange,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    arsRate = 1380,
    setArsRate,
    onNavigateToConfig,
    addToast
}) {
    const [loading, setLoading] = useState(true);
    const [logs, setLogs] = useState([]);
    const [allMonthLogs, setAllMonthLogs] = useState([]);
    const [volumeMultiplier, setVolumeMultiplier] = useState(1); // 1x, 1.5x, 2x, 3x
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedServiceFilter, setSelectedServiceFilter] = useState('all');

    // Carga de telemetría de tokens desde contact_center_ai_usage_logs
    const loadAiUsageData = async () => {
        setLoading(true);
        try {
            const now = new Date();
            let filterStart = null;
            let filterEnd = null;

            if (timeRange === 'this_month') {
                filterStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
                filterEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            } else if (timeRange === 'last_month') {
                filterStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
                filterEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
            } else if (timeRange === 'today') {
                filterStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
                filterEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
            } else if (timeRange === 'week') {
                filterStart = new Date(now);
                filterStart.setDate(filterStart.getDate() - 7);
                filterStart.setHours(0, 0, 0, 0);
                filterEnd = new Date(now);
            } else if (timeRange === 'custom') {
                if (customStartDate) filterStart = new Date(customStartDate + 'T00:00:00');
                if (customEndDate) filterEnd = new Date(customEndDate + 'T23:59:59');
            }

            let query = supabase
                .from('contact_center_ai_usage_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(4000);

            if (filterStart) query = query.gte('created_at', filterStart.toISOString());
            if (filterEnd) query = query.lte('created_at', filterEnd.toISOString());

            // Mes actual completo para run-rate mensual preciso
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
            const monthQuery = supabase
                .from('contact_center_ai_usage_logs')
                .select('prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, created_at, model')
                .gte('created_at', monthStart.toISOString())
                .limit(10000);

            const [{ data: periodData, error: periodErr }, { data: monthData, error: monthErr }] = await Promise.all([
                query,
                monthQuery
            ]);

            if (periodErr) throw periodErr;
            if (monthErr) throw monthErr;

            setLogs(periodData || []);
            setAllMonthLogs(monthData || []);
        } catch (err) {
            console.error('[ai-cost] Error cargando logs de IA:', err);
            if (addToast) addToast('Error consultando telemetría de tokens de IA', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAiUsageData();
    }, [timeRange, customStartDate, customEndDate]);

    // Métricas del período filtrado
    const stats = useMemo(() => {
        let totalPrompt = 0;
        let totalCompletion = 0;
        let totalTokens = 0;
        let totalCostUsd = 0;
        let totalLatencyMs = 0;
        const serviceMap = {};
        const modelMap = {};
        const dailyMap = {};
        const uniquePhones = new Set();

        const todayStr = new Date().toISOString().split('T')[0];
        let todayTokens = 0;
        let todayCostUsd = 0;
        let todayCalls = 0;

        logs.forEach(l => {
            const p = l.prompt_tokens || 0;
            const c = l.completion_tokens || 0;
            const t = l.total_tokens || (p + c);
            const cost = Number(l.estimated_cost_usd) || 0;
            const sName = l.service_name || 'conversational_bot';
            const mName = l.model || 'gpt-5.5';

            totalPrompt += p;
            totalCompletion += c;
            totalTokens += t;
            totalCostUsd += cost;
            totalLatencyMs += (l.execution_ms || 0);

            if (l.phone) uniquePhones.add(l.phone);

            // Hoy
            const dayKey = (l.created_at || '').substring(0, 10);
            if (dayKey === todayStr) {
                todayTokens += t;
                todayCostUsd += cost;
                todayCalls++;
            }

            // Agrupación por Servicio
            if (!serviceMap[sName]) {
                serviceMap[sName] = { service: sName, calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 };
            }
            serviceMap[sName].calls++;
            serviceMap[sName].promptTokens += p;
            serviceMap[sName].completionTokens += c;
            serviceMap[sName].totalTokens += t;
            serviceMap[sName].costUsd += cost;

            // Agrupación por Modelo
            if (!modelMap[mName]) {
                modelMap[mName] = { model: mName, calls: 0, totalTokens: 0, costUsd: 0 };
            }
            modelMap[mName].calls++;
            modelMap[mName].totalTokens += t;
            modelMap[mName].costUsd += cost;

            // Agrupación Diaria
            if (dayKey) {
                if (!dailyMap[dayKey]) {
                    dailyMap[dayKey] = { date: dayKey, prompt: 0, completion: 0, total: 0, costUsd: 0, calls: 0 };
                }
                dailyMap[dayKey].prompt += p;
                dailyMap[dayKey].completion += c;
                dailyMap[dayKey].total += t;
                dailyMap[dayKey].costUsd += cost;
                dailyMap[dayKey].calls++;
            }
        });

        // Curva diaria ordenada cronológicamente
        const dailyTrend = Object.values(dailyMap)
            .sort((a, b) => a.date.localeCompare(b.date))
            .map(d => {
                const parts = d.date.split('-');
                return {
                    ...d,
                    displayDate: `${parts[2]}/${parts[1]}`,
                    costArs: Math.round(d.costUsd * arsRate)
                };
            });

        // Desglose por servicio ordenado por costo descendente
        const serviceBreakdown = Object.values(serviceMap)
            .sort((a, b) => b.costUsd - a.costUsd)
            .map(s => ({
                ...s,
                pct: totalCostUsd > 0 ? ((s.costUsd / totalCostUsd) * 100).toFixed(1) : 0,
                costArs: Math.round(s.costUsd * arsRate)
            }));

        // Desglose por modelo
        const modelBreakdown = Object.values(modelMap)
            .sort((a, b) => b.costUsd - a.costUsd)
            .map(m => ({
                ...m,
                pct: totalCostUsd > 0 ? ((m.costUsd / totalCostUsd) * 100).toFixed(1) : 0,
                costArs: Math.round(m.costUsd * arsRate)
            }));

        const totalCalls = logs.length;
        const avgLatencyMs = totalCalls > 0 ? Math.round(totalLatencyMs / totalCalls) : 0;
        const avgCostPerCall = totalCalls > 0 ? totalCostUsd / totalCalls : 0;
        const avgCostPerPatient = uniquePhones.size > 0 ? totalCostUsd / uniquePhones.size : 0;

        return {
            totalCalls,
            totalPrompt,
            totalCompletion,
            totalTokens,
            totalCostUsd,
            totalCostArs: Math.round(totalCostUsd * arsRate),
            avgLatencyMs,
            avgCostPerCall,
            avgCostPerPatient,
            uniquePatients: uniquePhones.size,
            todayTokens,
            todayCostUsd,
            todayCostArs: Math.round(todayCostUsd * arsRate),
            todayCalls,
            dailyTrend,
            serviceBreakdown,
            modelBreakdown
        };
    }, [logs, arsRate]);

    // Proyecciones a Fin de Mes
    const projections = useMemo(() => {
        const now = new Date();
        const daysElapsed = Math.max(1, now.getDate());
        const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const daysRemaining = Math.max(0, totalDaysInMonth - daysElapsed);

        let monthTotalTokens = 0;
        let monthTotalCostUsd = 0;

        allMonthLogs.forEach(l => {
            monthTotalTokens += (l.total_tokens || 0);
            monthTotalCostUsd += (Number(l.estimated_cost_usd) || 0);
        });

        const dailyAvgTokens = monthTotalTokens / daysElapsed;
        const dailyAvgCostUsd = monthTotalCostUsd / daysElapsed;

        const projectedMonthTokens = Math.round(dailyAvgTokens * totalDaysInMonth);
        const projectedMonthCostUsd = Number((dailyAvgCostUsd * totalDaysInMonth).toFixed(2));
        const projectedMonthCostArs = Math.round(projectedMonthCostUsd * arsRate);

        // Simulación: ¿Cuánto costaría ese mismo volumen mensual con GPT-4o-mini?
        // Prompt tokens es ~95% del total, Completion es ~5%
        const simulatedPromptTokens = projectedMonthTokens * 0.95;
        const simulatedCompTokens = projectedMonthTokens * 0.05;
        const miniProjectedCostUsd = Number((
            ((simulatedPromptTokens * PRICING_TABLE['gpt-4o-mini'].promptPerM) +
             (simulatedCompTokens * PRICING_TABLE['gpt-4o-mini'].completionPerM)) / 1_000_000
        ).toFixed(2));
        const miniProjectedCostArs = Math.round(miniProjectedCostUsd * arsRate);

        const netSavingsUsd = Math.max(0, projectedMonthCostUsd - miniProjectedCostUsd);
        const netSavingsArs = Math.max(0, projectedMonthCostArs - miniProjectedCostArs);
        const savingsPct = projectedMonthCostUsd > 0 ? Math.round((netSavingsUsd / projectedMonthCostUsd) * 100) : 0;

        return {
            daysElapsed,
            totalDaysInMonth,
            daysRemaining,
            monthTotalTokens,
            monthTotalCostUsd,
            dailyAvgCostUsd,
            dailyAvgTokens,
            projectedMonthTokens,
            projectedMonthCostUsd,
            projectedMonthCostArs,
            miniProjectedCostUsd,
            miniProjectedCostArs,
            netSavingsUsd,
            netSavingsArs,
            savingsPct
        };
    }, [allMonthLogs, arsRate]);

    // Filtrar tabla de auditoría
    const filteredAuditLogs = useMemo(() => {
        return logs.filter(l => {
            const matchesService = selectedServiceFilter === 'all' || l.service_name === selectedServiceFilter;
            const matchesSearch = !searchTerm || 
                (l.phone && l.phone.includes(searchTerm)) || 
                (l.model && l.model.toLowerCase().includes(searchTerm.toLowerCase()));
            return matchesService && matchesSearch;
        }).slice(0, 50);
    }, [logs, selectedServiceFilter, searchTerm]);

    const formatTokens = (num) => {
        if (!num) return '0';
        if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
        if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
        return num.toLocaleString();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* BARRA SUPERIOR DE CONTROL, COTIZACIÓN Y ESTADO EN VIVO           */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '16px 20px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '14px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '40px', height: '40px', borderRadius: '10px',
                        background: 'linear-gradient(135deg, #0F2942 0%, #0284C7 100%)',
                        color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 10px rgba(2, 132, 199, 0.25)'
                    }}>
                        <Cpu size={22} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F2942' }}>
                                Auditoría de Tokens & Proyecciones de Costos IA
                            </h3>
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0',
                                padding: '2px 8px', borderRadius: '12px', fontSize: '0.68rem', fontWeight: 700
                            }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#059669' }} />
                                Telemetría Activa en Producción
                            </span>
                        </div>
                        <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#64748B' }}>
                            Monitoreo en tiempo real de consumo de tokens OpenAI, costos estimados en USD/ARS y cálculo de ahorro
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    {/* Cotización Dólar editable */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        background: '#F8FAFC', padding: '6px 12px', borderRadius: '8px',
                        border: '1px solid #CBD5E1'
                    }}>
                        <DollarSign size={15} color="#059669" />
                        <span style={{ fontSize: '0.72rem', color: '#475569', fontWeight: 700 }}>Dólar Ref:</span>
                        <span style={{ fontSize: '0.72rem', color: '#64748B' }}>$</span>
                        <input
                            type="number"
                            value={arsRate}
                            onChange={(e) => setArsRate(Number(e.target.value) || 1)}
                            style={{
                                width: '70px', border: 'none', background: 'transparent',
                                fontSize: '0.78rem', fontWeight: 800, color: '#0F2942',
                                outline: 'none'
                            }}
                            title="Cotización ARS editable por dólar"
                        />
                        <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>ARS</span>
                    </div>

                    {/* Botón Refrescar */}
                    <button
                        type="button"
                        onClick={loadAiUsageData}
                        disabled={loading}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            background: '#FFFFFF', border: '1px solid #CBD5E1', color: '#0F2942',
                            padding: '7px 14px', borderRadius: '8px', fontSize: '0.75rem',
                            fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s'
                        }}
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        Actualizar
                    </button>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* BANNER ESTRATÉGICO: ANÁLISIS DE AHORRO INMEDIATO CON GPT-4o-MINI */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                background: 'linear-gradient(135deg, #0F2942 0%, #1E3A8A 60%, #0284C7 100%)',
                borderRadius: '12px',
                padding: '20px 24px',
                color: '#FFFFFF',
                boxShadow: '0 4px 16px rgba(15, 41, 66, 0.15)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px'
            }}>
                <div style={{ maxWidth: '680px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{
                            background: '#FEF08A', color: '#854D0E', padding: '2px 8px',
                            borderRadius: '12px', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase'
                        }}>
                            Diagnóstico de Eficiencia Grow Labs
                        </span>
                        <span style={{ fontSize: '0.74rem', color: '#93C5FD' }}>
                            Potencial de reducción de gasto: <strong>{projections.savingsPct}%</strong>
                        </span>
                    </div>
                    <h3 style={{ margin: '0 0 6px', fontSize: '1.2rem', fontWeight: 800, color: '#FFFFFF' }}>
                        Proyección actual de gasto mensual: ${projections.projectedMonthCostUsd.toLocaleString()} USD ({projections.projectedMonthCostArs.toLocaleString()} ARS)
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#E0F2FE', lineHeight: 1.45 }}>
                        El bot conversacional procesa aproximadamente <strong>{formatTokens(projections.dailyAvgTokens)} tokens diarios</strong>.
                        Cambiando el motor a <strong style={{ color: '#86EFAC' }}>gpt-4o-mini</strong> se mantiene la misma precisión médica con un costo mensual proyectado de solo <strong style={{ color: '#86EFAC' }}>${projections.miniProjectedCostUsd.toLocaleString()} USD (${projections.miniProjectedCostArs.toLocaleString()} ARS)</strong>, generando un ahorro neto de <strong>${projections.netSavingsUsd.toLocaleString()} USD (~${projections.netSavingsArs.toLocaleString()} ARS)</strong> al mes.
                    </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                    <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '0.7rem', color: '#93C5FD', textTransform: 'uppercase', fontWeight: 700 }}>Ahorro Neto Proyectado</span>
                        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#4ADE80' }}>
                            -${projections.netSavingsUsd.toLocaleString()} USD
                        </div>
                        <span style={{ fontSize: '0.72rem', color: '#E0F2FE' }}>
                            ≈ ${projections.netSavingsArs.toLocaleString()} ARS / mes
                        </span>
                    </div>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* GRID DE KPIS DE CONSUMO Y PROYECCIONES                            */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                gap: '14px'
            }}>
                {/* KPI 1: GASTO HOY */}
                <div style={{
                    background: '#FFFFFF', padding: '18px 20px', borderRadius: '12px',
                    border: '1px solid #E2E8F0', boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                            Consumo de Hoy
                        </span>
                        <span style={{ padding: '3px 8px', borderRadius: '6px', background: '#F0F9FF', color: '#0284C7', fontSize: '0.68rem', fontWeight: 700 }}>
                            {stats.todayCalls.toLocaleString()} llamadas
                        </span>
                    </div>
                    <div style={{ fontSize: '1.7rem', fontWeight: 900, color: '#0F2942', letterSpacing: '-0.5px' }}>
                        ${stats.todayCostUsd.toFixed(3)} <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600 }}>USD</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                        <span style={{ fontSize: '0.74rem', color: '#059669', fontWeight: 700 }}>
                            ≈ ${stats.todayCostArs.toLocaleString()} ARS
                        </span>
                        <span style={{ fontSize: '0.7rem', color: '#64748B' }}>
                            {formatTokens(stats.todayTokens)} tokens
                        </span>
                    </div>
                </div>

                {/* KPI 2: TOTAL DEL PERÍODO */}
                <div style={{
                    background: '#FFFFFF', padding: '18px 20px', borderRadius: '12px',
                    border: '1px solid #E2E8F0', boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                            Total del Período
                        </span>
                        <span style={{ padding: '3px 8px', borderRadius: '6px', background: '#F8FAFC', color: '#475569', fontSize: '0.68rem', fontWeight: 700 }}>
                            {stats.totalCalls.toLocaleString()} eventos
                        </span>
                    </div>
                    <div style={{ fontSize: '1.7rem', fontWeight: 900, color: '#0F2942', letterSpacing: '-0.5px' }}>
                        ${stats.totalCostUsd.toFixed(2)} <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600 }}>USD</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                        <span style={{ fontSize: '0.74rem', color: '#059669', fontWeight: 700 }}>
                            ≈ ${stats.totalCostArs.toLocaleString()} ARS
                        </span>
                        <span style={{ fontSize: '0.7rem', color: '#64748B' }}>
                            {formatTokens(stats.totalTokens)} tokens
                        </span>
                    </div>
                </div>

                {/* KPI 3: PROYECCIÓN FIN DE MES */}
                <div style={{
                    background: '#FFFFFF', padding: '18px 20px', borderRadius: '12px',
                    border: '1px solid #E2E8F0', boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                            Proyección Fin de Mes
                        </span>
                        <span style={{ padding: '3px 8px', borderRadius: '6px', background: '#FEF3C7', color: '#D97706', fontSize: '0.68rem', fontWeight: 700 }}>
                            Día {projections.daysElapsed}/{projections.totalDaysInMonth}
                        </span>
                    </div>
                    <div style={{ fontSize: '1.7rem', fontWeight: 900, color: '#D97706', letterSpacing: '-0.5px' }}>
                        ${projections.projectedMonthCostUsd.toLocaleString()} <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600 }}>USD</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                        <span style={{ fontSize: '0.74rem', color: '#475569', fontWeight: 700 }}>
                            ≈ ${projections.projectedMonthCostArs.toLocaleString()} ARS
                        </span>
                        <span style={{ fontSize: '0.7rem', color: '#64748B' }}>
                            ≈ {formatTokens(projections.projectedMonthTokens)} tokens
                        </span>
                    </div>
                </div>

                {/* KPI 4: COSTO UNITARIO POR PACIENTE */}
                <div style={{
                    background: '#FFFFFF', padding: '18px 20px', borderRadius: '12px',
                    border: '1px solid #E2E8F0', boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                            Costo por Paciente
                        </span>
                        <span style={{ padding: '3px 8px', borderRadius: '6px', background: '#ECFDF5', color: '#059669', fontSize: '0.68rem', fontWeight: 700 }}>
                            {stats.uniquePatients.toLocaleString()} pacientes
                        </span>
                    </div>
                    <div style={{ fontSize: '1.7rem', fontWeight: 900, color: '#0F2942', letterSpacing: '-0.5px' }}>
                        ${stats.avgCostPerPatient.toFixed(4)} <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600 }}>USD</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                        <span style={{ fontSize: '0.74rem', color: '#059669', fontWeight: 700 }}>
                            ≈ ${(stats.avgCostPerPatient * arsRate).toFixed(2)} ARS / paciente
                        </span>
                        <span style={{ fontSize: '0.7rem', color: '#64748B' }}>
                            Latencia: {stats.avgLatencyMs} ms
                        </span>
                    </div>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* SIMULADOR INTERACTIVO DE MODELOS Y VOLUMEN DE ATENCIÓN           */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '20px 24px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Sliders size={18} color="#0284C7" />
                            <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: '#0F2942' }}>
                                Simulador de Modelos OpenAI & Multiplicador de Demanda
                            </h4>
                        </div>
                        <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#64748B' }}>
                            Compara el impacto económico real en la factura mensual de Sanatorio Argentino según el modelo elegido y volumen de pacientes
                        </p>
                    </div>

                    {/* Selector de volumen */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#F1F5F9', padding: '3px', borderRadius: '8px' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569', padding: '0 6px' }}>Demanda:</span>
                        {[1, 1.5, 2, 3].map(mult => (
                            <button
                                key={mult}
                                type="button"
                                onClick={() => setVolumeMultiplier(mult)}
                                style={{
                                    border: 'none',
                                    background: volumeMultiplier === mult ? '#0F2942' : 'transparent',
                                    color: volumeMultiplier === mult ? '#FFFFFF' : '#475569',
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s'
                                }}
                            >
                                {mult}x {mult === 1 ? '(Actual)' : ''}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Tarjetas comparativas de Modelos */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: '14px'
                }}>
                    {Object.entries(PRICING_TABLE).map(([mKey, mInfo]) => {
                        const baseTokens = projections.projectedMonthTokens * volumeMultiplier;
                        const pTokens = baseTokens * 0.95;
                        const cTokens = baseTokens * 0.05;
                        const simCostUsd = ((pTokens * mInfo.promptPerM) + (cTokens * mInfo.completionPerM)) / 1_000_000;
                        const simCostArs = Math.round(simCostUsd * arsRate);
                        const isRecommended = mKey === 'gpt-4o-mini';
                        const isCurrentActive = mKey === 'gpt-5.5';

                        return (
                            <div 
                                key={mKey}
                                style={{
                                    background: isRecommended ? '#F0FDF4' : '#F8FAFC',
                                    border: `1.5px solid ${isRecommended ? '#86EFAC' : (isCurrentActive ? '#FCA5A5' : '#E2E8F0')}`,
                                    borderRadius: '10px',
                                    padding: '16px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    position: 'relative',
                                    gap: '12px'
                                }}
                            >
                                {isRecommended && (
                                    <span style={{
                                        position: 'absolute', top: '-10px', right: '12px',
                                        background: '#059669', color: '#FFFFFF', padding: '2px 8px',
                                        borderRadius: '10px', fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase'
                                    }}>
                                        ⭐ Recomendado Grow Labs
                                    </span>
                                )}
                                {isCurrentActive && (
                                    <span style={{
                                        position: 'absolute', top: '-10px', right: '12px',
                                        background: '#DC2626', color: '#FFFFFF', padding: '2px 8px',
                                        borderRadius: '10px', fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase'
                                    }}>
                                        ⚠️ Modelo Configurado
                                    </span>
                                )}

                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F2942' }}>
                                                {mInfo.name}
                                            </div>
                                            <span style={{ fontSize: '0.66rem', color: mInfo.color, fontWeight: 700 }}>
                                                {mInfo.tag}
                                            </span>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: '10px', fontSize: '0.68rem', color: '#64748B', lineHeight: 1.4 }}>
                                        Entrada: <strong>${mInfo.promptPerM}/1M</strong> · Salida: <strong>${mInfo.completionPerM}/1M</strong>
                                    </div>
                                </div>

                                <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '10px' }}>
                                    <span style={{ fontSize: '0.68rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>
                                        Gasto Mensual Estimado:
                                    </span>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: isRecommended ? '#059669' : '#0F2942', marginTop: '2px' }}>
                                        ${simCostUsd.toFixed(2)} <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600 }}>USD</span>
                                    </div>
                                    <div style={{ fontSize: '0.74rem', color: '#475569', fontWeight: 700 }}>
                                        ≈ ${simCostArs.toLocaleString()} ARS / mes
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* GRÁFICOS: EVOLUCIÓN DIARIA DE TOKENS & COSTOS EN USD             */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
                gap: '16px'
            }}>
                {/* GRÁFICO 1: EVOLUCIÓN DIARIA DE TOKENS */}
                <div style={{
                    background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0',
                    padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                        <div>
                            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#0F2942' }}>
                                Curva Diaria de Consumo de Tokens
                            </h4>
                            <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#64748B' }}>
                                Desglose de Tokens de Entrada (Prompt) vs Tokens Generados (Completion)
                            </p>
                        </div>
                    </div>

                    <div style={{ width: '100%', height: '240px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={stats.dailyTrend}>
                                <defs>
                                    <linearGradient id="promptGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#0284C7" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#0284C7" stopOpacity={0.0} />
                                    </linearGradient>
                                    <linearGradient id="compGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                                <XAxis dataKey="displayDate" tick={{ fontSize: 10, fill: '#64748B' }} />
                                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} tickFormatter={(val) => formatTokens(val)} />
                                <Tooltip
                                    formatter={(val, name) => [
                                        formatTokens(val),
                                        name === 'prompt' ? 'Tokens Prompt (Entrada)' : 'Tokens Completion (Salida)'
                                    ]}
                                    contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.75rem' }}
                                />
                                <Area type="monotone" dataKey="prompt" name="prompt" stroke="#0284C7" fill="url(#promptGradient)" strokeWidth={2} />
                                <Area type="monotone" dataKey="completion" name="completion" stroke="#10B981" fill="url(#compGradient)" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* GRÁFICO 2: EVOLUCIÓN DEL GASTO EN USD */}
                <div style={{
                    background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0',
                    padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                        <div>
                            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#0F2942' }}>
                                Gasto Diario en Dólares (USD)
                            </h4>
                            <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#64748B' }}>
                                Inversión estimada por día en OpenAI en base a volumen real
                            </p>
                        </div>
                    </div>

                    <div style={{ width: '100%', height: '240px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.dailyTrend}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                                <XAxis dataKey="displayDate" tick={{ fontSize: 10, fill: '#64748B' }} />
                                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} tickFormatter={(val) => `$${val}`} />
                                <Tooltip
                                    formatter={(val, name, item) => [
                                        `$${Number(val).toFixed(2)} USD (≈ $${item.payload.costArs.toLocaleString()} ARS)`,
                                        'Gasto del Día'
                                    ]}
                                    contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.75rem' }}
                                />
                                <Bar dataKey="costUsd" fill="#0F2942" radius={[4, 4, 0, 0]}>
                                    {stats.dailyTrend.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={index === stats.dailyTrend.length - 1 ? '#0284C7' : '#0F2942'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* DESGLOSE POR SERVICIO Y POR MODELO                               */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                gap: '16px'
            }}>
                {/* DESGLOSE POR SERVICIO */}
                <div style={{
                    background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0',
                    padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 800, color: '#0F2942' }}>
                        Distribución del Gasto por Módulo Clínico
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {stats.serviceBreakdown.map(s => {
                            const info = SERVICE_LABELS[s.service] || { label: s.service, color: '#475569', bg: '#F1F5F9' };
                            return (
                                <div key={s.service} style={{ background: '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: info.color }} />
                                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0F2942' }}>
                                                {info.label}
                                            </span>
                                        </div>
                                        <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0F2942' }}>
                                            ${s.costUsd.toFixed(2)} USD <span style={{ fontSize: '0.68rem', color: '#64748B' }}>({s.pct}%)</span>
                                        </span>
                                    </div>
                                    <div style={{ width: '100%', height: '5px', background: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                                        <div style={{ width: `${s.pct}%`, height: '100%', background: info.color }} />
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '0.68rem', color: '#64748B' }}>
                                        <span>{s.calls.toLocaleString()} llamadas</span>
                                        <span>{formatTokens(s.totalTokens)} tokens</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* DESGLOSE POR MODELO */}
                <div style={{
                    background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0',
                    padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 800, color: '#0F2942' }}>
                        Distribución por Modelo de OpenAI
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {stats.modelBreakdown.map(m => (
                            <div key={m.model} style={{ background: '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{
                                            padding: '2px 6px', borderRadius: '4px',
                                            background: m.model.includes('mini') ? '#ECFDF5' : '#FEF2F2',
                                            color: m.model.includes('mini') ? '#059669' : '#DC2626',
                                            fontSize: '0.7rem', fontWeight: 700
                                        }}>
                                            {m.model}
                                        </span>
                                    </div>
                                    <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0F2942' }}>
                                        ${m.costUsd.toFixed(2)} USD <span style={{ fontSize: '0.68rem', color: '#64748B' }}>({m.pct}%)</span>
                                    </span>
                                </div>
                                <div style={{ width: '100%', height: '5px', background: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{ width: `${m.pct}%`, height: '100%', background: m.model.includes('mini') ? '#059669' : '#DC2626' }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '0.68rem', color: '#64748B' }}>
                                    <span>{m.calls.toLocaleString()} llamadas</span>
                                    <span>{formatTokens(m.totalTokens)} tokens</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* TABLA DE AUDITORÍA DETALLADA DE LLAMADAS A LA IA                  */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0',
                padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
                    <div>
                        <h4 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 800, color: '#0F2942' }}>
                            Registro de Auditoría de Llamadas Recientes (Últimos 50 Eventos)
                        </h4>
                        <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#64748B' }}>
                            Traza detallada de cada invocación a los modelos LLM con tokens consumidos, costo unitario y latencia
                        </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {/* Filtro por servicio */}
                        <select
                            value={selectedServiceFilter}
                            onChange={(e) => setSelectedServiceFilter(e.target.value)}
                            style={{
                                padding: '5px 10px', borderRadius: '6px', border: '1px solid #CBD5E1',
                                fontSize: '0.74rem', background: '#F8FAFC', color: '#0F2942'
                            }}
                        >
                            <option value="all">Todos los Módulos</option>
                            <option value="conversational_bot">Bot Conversacional</option>
                            <option value="intent_detector">Clasificador Intenciones</option>
                            <option value="extract_patient_data">Extractor de Datos</option>
                            <option value="chat_summary">Resumen de Chat</option>
                            <option value="transcribe_audio_whisper">Whisper (Audio)</option>
                            <option value="bot_simulation">Simulador</option>
                        </select>

                        {/* Buscador teléfono */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            background: '#F8FAFC', padding: '5px 10px', borderRadius: '6px',
                            border: '1px solid #CBD5E1'
                        }}>
                            <Search size={14} color="#94A3B8" />
                            <input
                                type="text"
                                placeholder="Filtrar por teléfono..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.74rem', width: '130px' }}
                            />
                        </div>
                    </div>
                </div>

                {/* Tabla */}
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                                <th style={{ padding: '10px 12px', fontWeight: 700 }}>Fecha / Hora</th>
                                <th style={{ padding: '10px 12px', fontWeight: 700 }}>Teléfono</th>
                                <th style={{ padding: '10px 12px', fontWeight: 700 }}>Módulo Clínico</th>
                                <th style={{ padding: '10px 12px', fontWeight: 700 }}>Modelo</th>
                                <th style={{ padding: '10px 12px', fontWeight: 700, textAlign: 'right' }}>Prompt</th>
                                <th style={{ padding: '10px 12px', fontWeight: 700, textAlign: 'right' }}>Completion</th>
                                <th style={{ padding: '10px 12px', fontWeight: 700, textAlign: 'right' }}>Total Tokens</th>
                                <th style={{ padding: '10px 12px', fontWeight: 700, textAlign: 'right' }}>Costo (USD)</th>
                                <th style={{ padding: '10px 12px', fontWeight: 700, textAlign: 'right' }}>Latencia</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAuditLogs.map(l => {
                                const sInfo = SERVICE_LABELS[l.service_name] || { label: l.service_name, color: '#475569', bg: '#F1F5F9' };
                                const d = new Date(l.created_at);
                                const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                                const dateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;

                                return (
                                    <tr key={l.id} style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.15s' }}>
                                        <td style={{ padding: '9px 12px', color: '#64748B' }}>
                                            {dateStr} {timeStr}
                                        </td>
                                        <td style={{ padding: '9px 12px', fontWeight: 600, color: '#0F2942' }}>
                                            {l.phone ? `+${l.phone}` : '—'}
                                        </td>
                                        <td style={{ padding: '9px 12px' }}>
                                            <span style={{
                                                padding: '2px 8px', borderRadius: '4px',
                                                background: sInfo.bg, color: sInfo.color,
                                                fontSize: '0.68rem', fontWeight: 700
                                            }}>
                                                {sInfo.label}
                                            </span>
                                        </td>
                                        <td style={{ padding: '9px 12px' }}>
                                            <span style={{
                                                padding: '2px 6px', borderRadius: '4px',
                                                background: (l.model || '').includes('mini') ? '#ECFDF5' : '#FEF2F2',
                                                color: (l.model || '').includes('mini') ? '#059669' : '#DC2626',
                                                fontSize: '0.68rem', fontWeight: 700
                                            }}>
                                                {l.model}
                                            </span>
                                        </td>
                                        <td style={{ padding: '9px 12px', textAlign: 'right', color: '#64748B' }}>
                                            {(l.prompt_tokens || 0).toLocaleString()}
                                        </td>
                                        <td style={{ padding: '9px 12px', textAlign: 'right', color: '#64748B' }}>
                                            {(l.completion_tokens || 0).toLocaleString()}
                                        </td>
                                        <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#0F2942' }}>
                                            {(l.total_tokens || 0).toLocaleString()}
                                        </td>
                                        <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 800, color: '#059669' }}>
                                            ${Number(l.estimated_cost_usd || 0).toFixed(5)}
                                        </td>
                                        <td style={{ padding: '9px 12px', textAlign: 'right', color: '#64748B' }}>
                                            {l.execution_ms ? `${l.execution_ms} ms` : '—'}
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredAuditLogs.length === 0 && (
                                <tr>
                                    <td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: '#94A3B8' }}>
                                        No se encontraron registros de telemetría para los filtros seleccionados.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* DIRECTIVAS DE OPTIMIZACIÓN Y GOBERNANZA DE TOKENS (GROW LABS)    */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div style={{
                background: '#F8FAFC',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '20px 24px'
            }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 800, color: '#0F2942', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Zap size={16} color="#0284C7" />
                    3 Medidas de Alta Eficiencia para Reducir Gasto de Tokens
                </h4>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '12px'
                }}>
                    <div style={{ background: '#FFFFFF', padding: '14px 16px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.8rem', color: '#059669', marginBottom: '4px' }}>
                            1. Utilizar gpt-4o-mini en el Bot
                        </div>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748B', lineHeight: 1.4 }}>
                            El modelo <strong>gpt-4o-mini</strong> reduce el costo de entrada de $5.00 a $0.15 por millón de tokens (ahorro del <strong>97%</strong>) con excelente calidad de redacción y comprensión médica en español argentino.
                        </p>
                    </div>

                    <div style={{ background: '#FFFFFF', padding: '14px 16px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.8rem', color: '#0284C7', marginBottom: '4px' }}>
                            2. Triage Determinista Previo
                        </div>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748B', lineHeight: 1.4 }}>
                            Los mensajes de navegación directa como <em>"1"</em>, <em>"2"</em>, <em>"Menú"</em> o <em>"Atrás"</em> se resuelven por reglas fijas en el webhook sin consumir tokens de OpenAI.
                        </p>
                    </div>

                    <div style={{ background: '#FFFFFF', padding: '14px 16px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.8rem', color: '#7C3AED', marginBottom: '4px' }}>
                            3. Prompt Caching Automático
                        </div>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748B', lineHeight: 1.4 }}>
                            OpenAI aplica un descuento del 50% en prompts de más de 1.024 tokens repetidos. Mantener estable el System Prompt principal aprovecha automáticamente esta bonificación de red.
                        </p>
                    </div>
                </div>
            </div>

        </div>
    );
}
