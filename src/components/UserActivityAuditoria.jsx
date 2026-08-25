import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Activity, Calendar, Clock, Monitor, Search, Filter, ArrowLeft, ArrowRight, X
} from 'lucide-react';
import { fetchUserActivitySummary, fetchActiveSessions } from '../services/activityService';
import { fetchAuditLog } from '../services/auditService';

// --- Utils ---
function formatMinutes(mins) {
    if (!mins || mins < 1) return '< 1m';
    if (mins < 60) return `${Math.floor(mins)}m`;
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDateFull(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    const date = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `${date}, ${time}`;
}

const PRESETS = [
    { key: '24h', label: 'Últimas 24hs' },
    { key: '7d', label: 'Últimos 7 días' },
    { key: '30d', label: 'Últimos 30 días' },
    { key: 'all', label: 'Todo el tiempo' }
];

export default function UserActivityAuditoria() {
    const [datePreset, setDatePreset] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    
    // Pagination state
    const [page, setPage] = useState(1);
    const pageSize = 10;
    const [totalRecords, setTotalRecords] = useState(0);
    
    // Data state
    const [auditLogs, setAuditLogs] = useState([]);
    const [userSummary, setUserSummary] = useState([]);
    const [activeSessions, setActiveSessions] = useState([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [loadingSummary, setLoadingSummary] = useState(true);

    // Debounce search
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setPage(1); // Reset page on new search
        }, 500);
        return () => clearTimeout(handler);
    }, [searchTerm]);

    // Calculate dates based on preset
    const dateRange = useMemo(() => {
        const now = new Date();
        const hasta = now.toISOString();
        let desde = null;

        if (datePreset === '24h') {
            const d = new Date(now);
            d.setHours(d.getHours() - 24);
            desde = d.toISOString();
        } else if (datePreset === '7d') {
            const d = new Date(now);
            d.setDate(d.getDate() - 7);
            desde = d.toISOString();
        } else if (datePreset === '30d') {
            const d = new Date(now);
            d.setDate(d.getDate() - 30);
            desde = d.toISOString();
        }
        return { desde, hasta };
    }, [datePreset]);

    // Load Audit Logs
    const loadAuditLogs = useCallback(async () => {
        setLoadingLogs(true);
        const offset = (page - 1) * pageSize;
        
        const filters = {
            limit: pageSize,
            offset: offset,
            search: debouncedSearch || undefined,
            desde: dateRange.desde || undefined,
            hasta: dateRange.hasta || undefined
        };

        const { data, count } = await fetchAuditLog(filters);
        setAuditLogs(data);
        setTotalRecords(count);
        setLoadingLogs(false);
    }, [page, debouncedSearch, dateRange]);

    useEffect(() => {
        loadAuditLogs();
    }, [loadAuditLogs]);

    // Load Summary (Always last 24h for the top cards as requested)
    useEffect(() => {
        const loadSummary = async () => {
            setLoadingSummary(true);
            const now = new Date();
            const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
            
            // Fetch users with most time
            const users = await fetchUserActivitySummary(last24h, now.toISOString());
            
            // Fetch active sessions to show "online" badge
            const active = await fetchActiveSessions();
            
            // Fetch raw audit logs for the last 24h just to count clicks per user
            // We limit to 5000 just to be safe in memory, it's just for the summary cards
            const { data: recentLogs } = await fetchAuditLog({ 
                desde: last24h, 
                limit: 5000 
            });

            // Map clicks per user
            const clickCounts = {};
            (recentLogs || []).forEach(log => {
                if (log.accion === 'Clic' && log.usuario) {
                    clickCounts[log.usuario] = (clickCounts[log.usuario] || 0) + 1;
                }
            });

            // Enhance user summary with clicks
            const enhancedUsers = (users || []).map(u => ({
                ...u,
                total_clics: clickCounts[u.usuario] || 0,
                is_online: active.some(a => a.usuario === u.usuario)
            }));

            // Sort by most active (time + clicks)
            enhancedUsers.sort((a, b) => (b.total_minutes || 0) - (a.total_minutes || 0));

            setUserSummary(enhancedUsers.slice(0, 6)); // Show top 6
            setActiveSessions(active);
            setLoadingSummary(false);
        };
        loadSummary();
    }, []);


    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

    return (
        <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>
            
            {/* --- Seccion 1: Resumen de Actividad --- */}
            <div style={{ marginBottom: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <Calendar size={20} color="#475569" />
                    <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#1e293b', fontWeight: 600 }}>Resumen de Actividad (Últimas 24hs)</h2>
                </div>

                {loadingSummary ? (
                    <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '16px' }}>
                        {[1, 2, 3].map(i => (
                            <div key={i} style={{ minWidth: '320px', height: '140px', background: '#f1f5f9', borderRadius: '12px', animation: 'pulse 1.5s infinite' }} />
                        ))}
                    </div>
                ) : userSummary.length === 0 ? (
                    <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#64748b' }}>
                        No hay actividad registrada en las últimas 24 horas.
                    </div>
                ) : (
                    <div style={{ 
                        display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '16px',
                        scrollSnapType: 'x mandatory'
                    }}>
                        {userSummary.map(user => (
                            <div key={user.usuario} style={{ 
                                minWidth: '340px', background: 'white', border: '1px solid #e2e8f0', 
                                borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                scrollSnapAlign: 'start', position: 'relative'
                            }}>
                                {user.is_online && (
                                    <div style={{ position: 'absolute', top: '20px', right: '20px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', color: '#10b981', fontWeight: 600, background: '#d1fae5', padding: '4px 8px', borderRadius: '12px' }}>
                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' }} />
                                        Conectado
                                    </div>
                                )}
                                <h3 style={{ margin: '0 0 12px', fontSize: '0.95rem', color: '#0f172a', fontWeight: 700, paddingRight: '80px', wordBreak: 'break-all' }}>
                                    {user.email || user.usuario}
                                </h3>
                                
                                <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Clock size={14} color="#3b82f6" /> {formatMinutes(user.total_minutes)}
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Activity size={14} color="#10b981" /> {user.total_clics} clics
                                    </span>
                                </div>

                                {/* Mock breakdown of modules if the backend doesn't provide them yet, or render if they exist */}
                                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {(user.modules || []).slice(0,3).map(mod => (
                                        <div key={mod.modulo} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                            <span style={{ color: '#64748b' }}>{mod.modulo}</span>
                                            <span style={{ color: '#0f172a', fontWeight: 600 }}>{formatMinutes(mod.duration_secs / 60)}</span>
                                        </div>
                                    ))}
                                    {(!user.modules || user.modules.length === 0) && (
                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                            Módulos principales (calculando...)
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* --- Seccion 2: Log de Auditoría --- */}
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                
                {/* Tabla Header & Filtros */}
                <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Activity size={20} color="#475569" />
                            <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#1e293b', fontWeight: 600 }}>Log de Auditoría</h2>
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            {/* Búsqueda */}
                            <div style={{ position: 'relative', width: '260px' }}>
                                <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '10px' }} />
                                <input 
                                    type="text" 
                                    placeholder="Buscar usuario o módulo..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    style={{ 
                                        width: '100%', padding: '8px 12px 8px 36px', borderRadius: '8px', 
                                        border: '1px solid #cbd5e1', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box'
                                    }}
                                />
                                {searchTerm && (
                                    <button onClick={() => setSearchTerm('')} style={{ position: 'absolute', right: '8px', top: '10px', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}>
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                            
                            {/* Filtro Fecha */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '2px' }}>
                                <Filter size={14} color="#64748b" style={{ marginLeft: '8px' }} />
                                <select 
                                    value={datePreset} 
                                    onChange={e => { setDatePreset(e.target.value); setPage(1); }}
                                    style={{ border: 'none', background: 'transparent', padding: '6px 8px', fontSize: '0.85rem', outline: 'none', color: '#334155', fontWeight: 500, cursor: 'pointer' }}
                                >
                                    {PRESETS.map(p => (
                                        <option key={p.key} value={p.key}>{p.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tabla de Registros */}
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                                <th style={{ padding: '16px 20px', fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Fecha / Hora</th>
                                <th style={{ padding: '16px 20px', fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Usuario</th>
                                <th style={{ padding: '16px 20px', fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Módulo</th>
                                <th style={{ padding: '16px 20px', fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Acción</th>
                                <th style={{ padding: '16px 20px', fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Detalle</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loadingLogs ? (
                                <tr>
                                    <td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
                                        <div style={{ display: 'inline-block', width: '24px', height: '24px', border: '3px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                        <p style={{ margin: '8px 0 0' }}>Cargando registros...</p>
                                    </td>
                                </tr>
                            ) : auditLogs.length === 0 ? (
                                <tr>
                                    <td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
                                        No se encontraron registros para los filtros seleccionados.
                                    </td>
                                </tr>
                            ) : (
                                auditLogs.map(log => {
                                    // Determinar badge según acción
                                    let badgeColor = '#f1f5f9';
                                    let badgeText = '#475569';
                                    let badgeBorder = '#cbd5e1';
                                    
                                    if (log.accion === 'Clic') {
                                        badgeColor = '#dcfce7'; // green-100
                                        badgeText = '#166534'; // green-800
                                        badgeBorder = '#bbf7d0'; // green-200
                                    } else if (log.accion === 'Permanencia' || log.accion === 'login') {
                                        badgeColor = '#dbeafe'; // blue-100
                                        badgeText = '#1e40af'; // blue-800
                                        badgeBorder = '#bfdbfe'; // blue-200
                                    } else if (log.accion === 'logout') {
                                        badgeColor = '#fef3c7'; // yellow-100
                                        badgeText = '#92400e'; // yellow-800
                                        badgeBorder = '#fde68a';
                                    }

                                    // Extract module from detalle if exists
                                    const modulo = log.detalle?.modulo || log.detalle?.view || '-';
                                    const detalleText = log.detalle?.label || log.detalle?.mensaje || JSON.stringify(log.detalle);

                                    return (
                                        <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem', color: '#334155' }}>
                                            <td style={{ padding: '16px 20px', whiteSpace: 'nowrap' }}>{formatDateFull(log.created_at)}</td>
                                            <td style={{ padding: '16px 20px', fontWeight: 500, color: '#0f172a' }}>{log.usuario}</td>
                                            <td style={{ padding: '16px 20px' }}>{modulo}</td>
                                            <td style={{ padding: '16px 20px' }}>
                                                <span style={{ 
                                                    display: 'inline-block', padding: '4px 10px', borderRadius: '12px', 
                                                    background: badgeColor, color: badgeText, border: `1px solid ${badgeBorder}`,
                                                    fontWeight: 600, fontSize: '0.75rem' 
                                                }}>
                                                    {log.accion}
                                                </span>
                                            </td>
                                            <td style={{ padding: '16px 20px', color: '#64748b' }}>
                                                {detalleText === '{}' ? '-' : (typeof detalleText === 'object' ? 'Configuración/Datos' : detalleText)}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Paginación */}
                <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', background: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                        Mostrando <span style={{ fontWeight: 600, color: '#0f172a' }}>{totalRecords === 0 ? 0 : (page - 1) * pageSize + 1}</span> a <span style={{ fontWeight: 600, color: '#0f172a' }}>{Math.min(page * pageSize, totalRecords)}</span> de <span style={{ fontWeight: 600, color: '#0f172a' }}>{totalRecords}</span> registros
                    </div>
                    
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1 || loadingLogs}
                            style={{ 
                                display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', 
                                borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', cursor: (page === 1 || loadingLogs) ? 'not-allowed' : 'pointer',
                                opacity: (page === 1 || loadingLogs) ? 0.5 : 1, color: '#334155'
                            }}
                        >
                            <ArrowLeft size={16} />
                        </button>
                        
                        <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>
                            Página {page} de {totalPages}
                        </div>

                        <button 
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages || loadingLogs}
                            style={{ 
                                display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', 
                                borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', cursor: (page === totalPages || loadingLogs) ? 'not-allowed' : 'pointer',
                                opacity: (page === totalPages || loadingLogs) ? 0.5 : 1, color: '#334155'
                            }}
                        >
                            <ArrowRight size={16} />
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
