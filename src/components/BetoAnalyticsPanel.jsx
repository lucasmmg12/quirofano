/**
 * BetoAnalyticsPanel — Dashboard de uso del asistente Beto IA (ADM-QUI)
 * Muestra métricas de consultas, tasa de éxito, queries frecuentes, etc.
 */
import { useState, useEffect } from 'react';
import { BarChart3, MessageSquare, CheckCircle, XCircle, Clock, TrendingUp, Loader2, RefreshCw, Brain } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SkeletonChartGrid } from './SkeletonLoader';

export default function BetoAnalyticsPanel({ addToast }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState('7d');

    useEffect(() => { loadAnalytics(); }, [period]);

    const loadAnalytics = async () => {
        setLoading(true);
        try {
            const days = period === '24h' ? 1 : period === '7d' ? 7 : 30;
            const since = new Date(Date.now() - days * 86400000).toISOString();

            const { data: interactions, error } = await supabase
                .from('beto_interactions')
                .select('*')
                .gte('created_at', since)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const total = interactions?.length || 0;
            const successful = interactions?.filter(i => i.success)?.length || 0;
            const failed = total - successful;
            const avgTime = total > 0
                ? Math.round(interactions.reduce((s, i) => s + (i.response_ms || 0), 0) / total)
                : 0;

            // Top queries (group by user_query, count)
            const queryMap = {};
            interactions?.forEach(i => {
                const q = (i.user_query || '').toLowerCase().trim().substring(0, 60);
                if (q) queryMap[q] = (queryMap[q] || 0) + 1;
            });
            const topQueries = Object.entries(queryMap)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([query, count]) => ({ query, count }));

            // Tool usage
            const toolMap = {};
            interactions?.forEach(i => {
                (i.tools_used || []).forEach(t => {
                    toolMap[t] = (toolMap[t] || 0) + 1;
                });
            });
            const topTools = Object.entries(toolMap)
                .sort((a, b) => b[1] - a[1])
                .map(([tool, count]) => ({ tool, count }));

            // Users
            const userMap = {};
            interactions?.forEach(i => {
                const u = i.user_name || 'unknown';
                userMap[u] = (userMap[u] || 0) + 1;
            });
            const topUsers = Object.entries(userMap)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([user, count]) => ({ user, count }));

            setData({ total, successful, failed, avgTime, topQueries, topTools, topUsers, interactions: interactions || [] });
        } catch (e) {
            console.error('Error loading analytics:', e);
            addToast?.('Error cargando analytics de Simon', 'error');
            setData({ total: 0, successful: 0, failed: 0, avgTime: 0, topQueries: [], topTools: [], topUsers: [], interactions: [] });
        } finally {
            setLoading(false);
        }
    };

    const successRate = data?.total > 0 ? Math.round((data.successful / data.total) * 100) : 0;

    return (
        <div className="content no-print" style={{ maxWidth: 1000, margin: '0 auto' }}>
            {/* Header */}
            <div className="animate-fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Brain size={22} style={{ color: '#fff' }} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#1E293B' }}>Simon Analytics</h2>
                        <p style={{ margin: 0, fontSize: '.78rem', color: '#64748B' }}>Métricas de uso del asistente IA</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    {['24h', '7d', '30d'].map(p => (
                        <button key={p} onClick={() => setPeriod(p)} style={{ padding: '6px 14px', borderRadius: 8, border: period === p ? 'none' : '1px solid #E2E8F0', background: period === p ? '#4F46E5' : '#fff', color: period === p ? '#fff' : '#64748B', fontSize: '.75rem', fontWeight: 600, cursor: 'pointer' }}>{p}</button>
                    ))}
                    <button onClick={loadAnalytics} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><RefreshCw size={14} /></button>
                </div>
            </div>

            {loading ? (
                <SkeletonChartGrid />
            ) : (
                <>
                    {/* KPI Cards */}
                    <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
                        {[
                            { label: 'Total Consultas', value: data.total, icon: MessageSquare, color: '#6366F1' },
                            { label: 'Tasa de Éxito', value: `${successRate}%`, icon: CheckCircle, color: '#10B981' },
                            { label: 'Errores', value: data.failed, icon: XCircle, color: '#EF4444' },
                            { label: 'Tiempo Prom.', value: `${(data.avgTime / 1000).toFixed(1)}s`, icon: Clock, color: '#F59E0B' },
                        ].map((kpi, i) => {
                            const Icon = kpi.icon;
                            return (
                                <div key={i} style={{ background: '#fff', borderRadius: 14, padding: '20px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${kpi.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Icon size={16} style={{ color: kpi.color }} />
                                        </div>
                                        <span style={{ fontSize: '.72rem', fontWeight: 600, color: '#64748B' }}>{kpi.label}</span>
                                    </div>
                                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Two-column layout */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        {/* Top Queries */}
                        <div className="animate-fade-in" style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid #E2E8F0' }}>
                            <h3 style={{ margin: '0 0 14px', fontSize: '.88rem', fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <TrendingUp size={16} style={{ color: '#6366F1' }} /> Consultas Frecuentes
                            </h3>
                            {data.topQueries.length === 0 ? (
                                <p style={{ fontSize: '.82rem', color: '#94A3B8', textAlign: 'center', padding: 20 }}>Sin datos</p>
                            ) : data.topQueries.map((q, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < data.topQueries.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                                    <span style={{ width: 22, height: 22, borderRadius: 6, background: '#EEF2FF', color: '#4338CA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.65rem', fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
                                    <span style={{ flex: 1, fontSize: '.78rem', color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.query}</span>
                                    <span style={{ fontSize: '.72rem', fontWeight: 700, color: '#6366F1', background: '#EEF2FF', padding: '2px 8px', borderRadius: 6 }}>{q.count}x</span>
                                </div>
                            ))}
                        </div>

                        {/* Users + Tools */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {/* Top Users */}
                            <div className="animate-fade-in" style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid #E2E8F0' }}>
                                <h3 style={{ margin: '0 0 14px', fontSize: '.88rem', fontWeight: 700, color: '#1E293B' }}>👤 Usuarios Activos</h3>
                                {data.topUsers.map((u, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#6366F1,#4F46E5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.6rem', fontWeight: 800 }}>
                                            {u.user.substring(0, 2).toUpperCase()}
                                        </div>
                                        <span style={{ flex: 1, fontSize: '.8rem', fontWeight: 600, color: '#334155' }}>{u.user}</span>
                                        <span style={{ fontSize: '.72rem', color: '#64748B' }}>{u.count} consultas</span>
                                    </div>
                                ))}
                            </div>

                            {/* Tool Usage */}
                            <div className="animate-fade-in" style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid #E2E8F0' }}>
                                <h3 style={{ margin: '0 0 14px', fontSize: '.88rem', fontWeight: 700, color: '#1E293B' }}>🛠️ Tools Utilizadas</h3>
                                {data.topTools.length === 0 ? (
                                    <p style={{ fontSize: '.82rem', color: '#94A3B8' }}>Sin datos</p>
                                ) : data.topTools.map((t, i) => {
                                    const maxCount = data.topTools[0]?.count || 1;
                                    return (
                                        <div key={i} style={{ marginBottom: 8 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', marginBottom: 3 }}>
                                                <span style={{ fontWeight: 600, color: '#334155' }}>{t.tool}</span>
                                                <span style={{ color: '#64748B' }}>{t.count}</span>
                                            </div>
                                            <div style={{ height: 6, borderRadius: 3, background: '#F1F5F9' }}>
                                                <div style={{ height: '100%', width: `${(t.count / maxCount) * 100}%`, borderRadius: 3, background: 'linear-gradient(90deg,#6366F1,#8B5CF6)', transition: 'width .5s' }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
