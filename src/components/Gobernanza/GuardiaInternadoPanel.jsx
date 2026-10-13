import React, { useState, useEffect, useMemo } from 'react';
import { 
    Bed, Search, Filter, RefreshCw, Calendar, CheckCircle2, 
    AlertCircle, Download, UserCheck, ShieldCheck, Activity,
    ChevronDown, ChevronUp, Clock, FileSpreadsheet, Eye, Sparkles
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function GuardiaInternadoPanel({ addToast }) {
    const [subTab, setSubTab] = useState('traumatologia'); // 'traumatologia' | 'interconsultas'
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [data, setData] = useState({ traumatologia: [], interconsultas: [], stats: null });
    const [lastUpdated, setLastUpdated] = useState(null);

    // Filtros de Traumatología
    const [traumaFilter, setTraumaFilter] = useState('activos'); // 'activos' | 'todos'
    const [traumaSearch, setTraumaSearch] = useState('');

    // Filtros de Interconsultas
    const [interClinicoFilter, setInterClinicoFilter] = useState('todos'); // 'todos' | 'solo_clinicos' | 'otras_especialidades'
    const [interServicioFilter, setInterServicioFilter] = useState('todos'); // 'todos' | 'internado' | 'uci'
    const [interSearch, setInterSearch] = useState('');

    // Cargar datos al montar
    useEffect(() => {
        loadData(false);
    }, []);

    const loadData = async (forceRefresh = false) => {
        if (forceRefresh) setRefreshing(true);
        else setLoading(true);

        try {
            // 1. Intentar primero con el endpoint local de sync-server (http://localhost:3456)
            let loaded = false;
            try {
                const res = await fetch(`http://localhost:3456/api/salus/guardia-internado${forceRefresh ? '?refresh=true' : ''}`);
                if (res.ok) {
                    const json = await res.json();
                    if (json.success && json.data) {
                        setData(json.data);
                        setLastUpdated(json.data.stats?.ultima_actualizacion || new Date().toISOString());
                        loaded = true;
                        if (forceRefresh) {
                            addToast?.('Datos sincronizados directamente desde SALUS', 'success');
                        }
                    }
                }
            } catch (errLocal) {
                // Sync-server local no accesible, caeremos a Supabase
            }

            // 2. Fallback: Leer de Supabase app_config
            if (!loaded) {
                const { data: cfg, error } = await supabase
                    .from('app_config')
                    .select('value, updated_at')
                    .eq('key', 'guardia_internado_cache')
                    .maybeSingle();

                if (error) throw error;
                if (cfg?.value) {
                    const parsed = typeof cfg.value === 'string' ? JSON.parse(cfg.value) : cfg.value;
                    setData(parsed);
                    setLastUpdated(cfg.updated_at || parsed.stats?.ultima_actualizacion);
                    loaded = true;
                }
            }

            if (!loaded) {
                addToast?.('No se pudieron obtener datos del internado', 'warning');
            }
        } catch (err) {
            console.error('Error cargando datos de Guardia Internado:', err);
            addToast?.('Error al cargar datos del internado', 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // ── FILTRADO DE CASOS DE TRAUMATOLOGÍA ──
    const filteredTrauma = useMemo(() => {
        if (!data.traumatologia) return [];
        return data.traumatologia.filter(item => {
            if (traumaFilter === 'activos' && item.estado_internacion !== 'Activo en Piso') {
                return false;
            }
            if (traumaSearch.trim()) {
                const q = traumaSearch.toLowerCase();
                const matchName = item.paciente?.toLowerCase().includes(q);
                const matchDni = item.dni?.includes(q);
                const matchHab = item.habitacion?.toLowerCase().includes(q);
                const matchDoc = item.cirujano_traumatologo?.toLowerCase().includes(q) || item.medico_cabecera?.toLowerCase().includes(q);
                const matchCir = item.cirugia?.toLowerCase().includes(q);
                if (!matchName && !matchDni && !matchHab && !matchDoc && !matchCir) {
                    return false;
                }
            }
            return true;
        });
    }, [data.traumatologia, traumaFilter, traumaSearch]);

    // ── FILTRADO DE INTERCONSULTAS ──
    const filteredInter = useMemo(() => {
        if (!data.interconsultas) return [];
        return data.interconsultas.filter(item => {
            // Filtro Clínico
            if (interClinicoFilter === 'solo_clinicos' && item.es_medico_clinico !== 1) return false;
            if (interClinicoFilter === 'otras_especialidades' && item.es_medico_clinico === 1) return false;

            // Filtro Servicio
            if (interServicioFilter === 'uci') {
                const isUci = item.servicio_internacion?.toLowerCase().includes('uci') || item.tipo_visita?.includes('(UCI)');
                if (!isUci) return false;
            }
            if (interServicioFilter === 'internado') {
                const isUci = item.servicio_internacion?.toLowerCase().includes('uci') || item.tipo_visita?.includes('(UCI)');
                if (isUci) return false;
            }

            // Búsqueda de texto
            if (interSearch.trim()) {
                const q = interSearch.toLowerCase();
                const matchName = item.paciente?.toLowerCase().includes(q);
                const matchDni = item.dni?.includes(q);
                const matchDoc = item.medico_actuante?.toLowerCase().includes(q);
                const matchEsp = item.especialidad_medico?.toLowerCase().includes(q);
                const matchHab = item.habitacion?.toLowerCase().includes(q);
                if (!matchName && !matchDni && !matchDoc && !matchEsp && !matchHab) {
                    return false;
                }
            }
            return true;
        });
    }, [data.interconsultas, interClinicoFilter, interServicioFilter, interSearch]);

    // Exportar CSV
    const exportCSV = (type) => {
        const rows = type === 'traumatologia' ? filteredTrauma : filteredInter;
        if (!rows.length) {
            addToast?.('No hay registros para exportar', 'warning');
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        if (type === 'traumatologia') {
            csvContent += "Habitación,Paciente,DNI,Estado Internación,Cirugía,Cirujano Traumatólogo,Médico Cabecera / Clínico,Fecha Ingreso,Fecha Cirugía,Obra Social\n";
            rows.forEach(r => {
                csvContent += `"${r.habitacion || ''}","${r.paciente || ''}","${r.dni || ''}","${r.estado_internacion || ''}","${(r.cirugia || '').replace(/"/g, '""')}","${r.cirujano_traumatologo || ''}","${r.medico_cabecera || ''}","${r.fecha_ingreso || ''}","${r.fecha_cirugia || ''}","${r.obra_social || ''}"\n`;
            });
        } else {
            csvContent += "Fecha,Hora,Tipo Visita,Paciente,DNI,Habitación,Servicio,Médico Actuante,Especialidad,Es Médico Clínico,Obra Social\n";
            rows.forEach(r => {
                csvContent += `"${r.fecha_visita || ''}","${r.hora_creacion || ''}","${r.tipo_visita || ''}","${r.paciente || ''}","${r.dni || ''}","${r.habitacion || ''}","${r.servicio_internacion || ''}","${r.medico_actuante || ''}","${r.especialidad_medico || ''}","${r.es_medico_clinico ? 'SI' : 'NO'}","${r.obra_social || ''}"\n`;
            });
        }

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `guardia_internado_${type}_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        addToast?.('Archivo CSV descargado con éxito', 'success');
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* ─── BARRA DE CONTROL & SUB-PESTAÑAS ─── */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        background: '#EFF6FF',
                        border: '1px solid #BFDBFE',
                        borderRadius: '8px',
                        padding: '3px',
                        display: 'flex',
                        gap: '4px'
                    }}>
                        <button
                            type="button"
                            onClick={() => setSubTab('traumatologia')}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '6px',
                                border: 'none',
                                background: subTab === 'traumatologia' ? '#1E40AF' : 'transparent',
                                color: subTab === 'traumatologia' ? '#FFFFFF' : '#1E40AF',
                                fontWeight: subTab === 'traumatologia' ? 700 : 500,
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <span>🦴</span> Cirugías Traumatológicas en Internado
                            <span style={{
                                background: subTab === 'traumatologia' ? 'rgba(255,255,255,0.25)' : '#DBEAFE',
                                color: subTab === 'traumatologia' ? '#FFFFFF' : '#1E40AF',
                                fontSize: '0.72rem',
                                padding: '1px 6px',
                                borderRadius: '10px',
                                fontWeight: 700
                            }}>
                                {data.stats?.activos_piso_trauma || 0} activos
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setSubTab('interconsultas')}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '6px',
                                border: 'none',
                                background: subTab === 'interconsultas' ? '#1E40AF' : 'transparent',
                                color: subTab === 'interconsultas' ? '#FFFFFF' : '#1E40AF',
                                fontWeight: subTab === 'interconsultas' ? 700 : 500,
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <span>🩺</span> Interconsultas (Internado & UCI)
                            <span style={{
                                background: subTab === 'interconsultas' ? 'rgba(255,255,255,0.25)' : '#DCFCE7',
                                color: subTab === 'interconsultas' ? '#FFFFFF' : '#15803D',
                                fontSize: '0.72rem',
                                padding: '1px 6px',
                                borderRadius: '10px',
                                fontWeight: 700
                            }}>
                                {data.stats?.interconsultas_clinicas || 0} clínicas
                            </span>
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {lastUpdated && (
                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                            Actualizado: {new Date(lastUpdated).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs
                        </span>
                    )}

                    <button
                        type="button"
                        onClick={() => exportCSV(subTab)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '7px 12px',
                            background: '#F8FAFC',
                            border: '1px solid #CBD5E1',
                            borderRadius: '8px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: '#334155',
                            cursor: 'pointer'
                        }}
                    >
                        <Download size={14} /> Exportar CSV
                    </button>

                    <button
                        type="button"
                        onClick={() => loadData(true)}
                        disabled={refreshing}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '7px 14px',
                            background: '#1E40AF',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            color: '#FFFFFF',
                            cursor: refreshing ? 'not-allowed' : 'pointer',
                            opacity: refreshing ? 0.7 : 1
                        }}
                    >
                        <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
                        {refreshing ? 'Sincronizando SALUS...' : 'Actualizar Live'}
                    </button>
                </div>
            </div>

            {/* ─── TAB 1: TRAUMATOLOGÍA EN INTERNADO (CONTROL CLÍNICO) ─── */}
            {subTab === 'traumatologia' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {/* KPI Cards de Traumatología */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '14px'
                    }}>
                        <div style={{
                            background: '#FFFFFF',
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0',
                            padding: '16px',
                            borderLeft: '4px solid #2563EB',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}>
                            <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                                Activos en Piso (Control Clínico)
                            </span>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#1E40AF', marginTop: '4px' }}>
                                {data.stats?.activos_piso_trauma || 0}
                            </div>
                            <span style={{ fontSize: '0.75rem', color: '#059669', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                                <CheckCircle2 size={13} /> Con cama asignada en piso actualmente
                            </span>
                        </div>

                        <div style={{
                            background: '#FFFFFF',
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0',
                            padding: '16px',
                            borderLeft: '4px solid #0D9488',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}>
                            <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                                Total Cirugías Traumatológicas Internadas
                            </span>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0F766E', marginTop: '4px' }}>
                                {data.stats?.total_traumatologia || 0}
                            </div>
                            <span style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px', display: 'block' }}>
                                Últimos 60 días acumulados (SALUS)
                            </span>
                        </div>

                        <div style={{
                            background: '#FFFFFF',
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0',
                            padding: '16px',
                            borderLeft: '4px solid #7C3AED',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}>
                            <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                                Norma de Protocolo Institucional
                            </span>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#4C1D95', marginTop: '6px', lineHeight: '1.4' }}>
                                100% controladas por Guardia Clínica al ingresar a piso
                            </div>
                            <span style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px', display: 'block' }}>
                                Evolución diaria y control hemodinámico
                            </span>
                        </div>
                    </div>

                    {/* Filtros locales de la tabla */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>Mostrar:</span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                    type="button"
                                    onClick={() => setTraumaFilter('activos')}
                                    style={{
                                        padding: '5px 12px',
                                        borderRadius: '6px',
                                        border: '1px solid',
                                        borderColor: traumaFilter === 'activos' ? '#2563EB' : '#CBD5E1',
                                        background: traumaFilter === 'activos' ? '#EFF6FF' : '#FFFFFF',
                                        color: traumaFilter === 'activos' ? '#1D4ED8' : '#64748B',
                                        fontSize: '0.78rem',
                                        fontWeight: traumaFilter === 'activos' ? 700 : 500,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Solo Activos en Piso ({data.stats?.activos_piso_trauma || 0})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTraumaFilter('todos')}
                                    style={{
                                        padding: '5px 12px',
                                        borderRadius: '6px',
                                        border: '1px solid',
                                        borderColor: traumaFilter === 'todos' ? '#2563EB' : '#CBD5E1',
                                        background: traumaFilter === 'todos' ? '#EFF6FF' : '#FFFFFF',
                                        color: traumaFilter === 'todos' ? '#1D4ED8' : '#64748B',
                                        fontSize: '0.78rem',
                                        fontWeight: traumaFilter === 'todos' ? 700 : 500,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Histórico Completo ({data.traumatologia?.length || 0})
                                </button>
                            </div>
                        </div>

                        <div style={{ position: 'relative', width: '280px' }}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94A3B8' }} />
                            <input
                                type="text"
                                value={traumaSearch}
                                onChange={(e) => setTraumaSearch(e.target.value)}
                                placeholder="Buscar por paciente, DNI, cama, cirujano..."
                                style={{
                                    width: '100%',
                                    padding: '7px 10px 7px 32px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8rem',
                                    outline: 'none'
                                }}
                            />
                        </div>
                    </div>

                    {/* Tabla de Cirugías Traumatológicas */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        overflow: 'hidden',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                    }}>
                        <div style={{ overflowX: 'auto', maxHeight: '550px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                                <thead style={{
                                    position: 'sticky',
                                    top: 0,
                                    background: '#F8FAFC',
                                    borderBottom: '2px solid #E2E8F0',
                                    zIndex: 2
                                }}>
                                    <tr>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Habitación</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Estado</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Paciente</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Cirugía Realizada</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Cirujano Traumatólogo</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Médico Cabecera</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Fecha Ingreso</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Fecha Cx</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Obra Social</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan="9" style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                                    <RefreshCw size={18} className="spin" /> Cargando internados traumatológicos...
                                                </div>
                                            </td>
                                        </tr>
                                    ) : filteredTrauma.length === 0 ? (
                                        <tr>
                                            <td colSpan="9" style={{ padding: '36px', textAlign: 'center', color: '#94A3B8' }}>
                                                No se encontraron pacientes con los filtros seleccionados
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredTrauma.map((r, idx) => {
                                            const isActivo = r.estado_internacion === 'Activo en Piso';
                                            return (
                                                <tr 
                                                    key={`${r.numero_admision}-${r.dni}-${idx}`}
                                                    style={{
                                                        borderBottom: '1px solid #F1F5F9',
                                                        background: isActivo ? '#F0FDF4' : idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA'
                                                    }}
                                                >
                                                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>
                                                        <span style={{
                                                            background: isActivo ? '#DCFCE7' : '#F1F5F9',
                                                            color: isActivo ? '#166534' : '#475569',
                                                            padding: '3px 8px',
                                                            borderRadius: '6px',
                                                            border: isActivo ? '1px solid #86EFAC' : '1px solid #CBD5E1',
                                                            fontWeight: 800,
                                                            fontSize: '0.8rem'
                                                        }}>
                                                            🛏️ {r.habitacion || 'S/D'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px 14px' }}>
                                                        <span style={{
                                                            padding: '2px 8px',
                                                            borderRadius: '12px',
                                                            fontSize: '0.72rem',
                                                            fontWeight: 700,
                                                            background: isActivo ? '#10B981' : '#E2E8F0',
                                                            color: isActivo ? '#FFFFFF' : '#64748B'
                                                        }}>
                                                            {r.estado_internacion}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px 14px' }}>
                                                        <div style={{ fontWeight: 700, color: '#1E293B' }}>{r.paciente}</div>
                                                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                            DNI: {r.dni || 'S/D'} {r.nhc ? `· NHC: ${r.nhc}` : ''}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '10px 14px', color: '#1E293B', maxWidth: '240px' }}>
                                                        <div style={{ fontWeight: 600, fontSize: '0.78rem' }}>{r.cirugia}</div>
                                                        <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>{r.especialidad_cirugia}</span>
                                                    </td>
                                                    <td style={{ padding: '10px 14px', color: '#0F172A', fontWeight: 600 }}>
                                                        {r.cirujano_traumatologo || 'Sin registrar'}
                                                    </td>
                                                    <td style={{ padding: '10px 14px', color: '#2563EB', fontWeight: 600 }}>
                                                        {r.medico_cabecera || 'Guardia Clínica'}
                                                    </td>
                                                    <td style={{ padding: '10px 14px', color: '#64748B', whiteSpace: 'nowrap' }}>
                                                        {r.fecha_ingreso || '—'}
                                                    </td>
                                                    <td style={{ padding: '10px 14px', color: '#64748B', whiteSpace: 'nowrap' }}>
                                                        {r.fecha_cirugia || '—'}
                                                        {r.hora_cirugia ? ` ${r.hora_cirugia.slice(0, 5)}` : ''}
                                                    </td>
                                                    <td style={{ padding: '10px 14px', color: '#475569', fontSize: '0.76rem', maxWidth: '140px' }}>
                                                        {r.obra_social || 'Particular'}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── TAB 2: INTERCONSULTAS (INTERNADO & UCI) ─── */}
            {subTab === 'interconsultas' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {/* KPI Cards de Interconsultas */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '14px'
                    }}>
                        <div style={{
                            background: '#FFFFFF',
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0',
                            padding: '16px',
                            borderLeft: '4px solid #10B981',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}>
                            <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                                Interconsultas Médicos Clínicos
                            </span>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#047857', marginTop: '4px' }}>
                                {data.stats?.interconsultas_clinicas || 0}
                            </div>
                            <span style={{ fontSize: '0.75rem', color: '#059669', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                                <UserCheck size={13} /> Realizadas por médicos con especialidad clínica
                            </span>
                        </div>

                        <div style={{
                            background: '#FFFFFF',
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0',
                            padding: '16px',
                            borderLeft: '4px solid #6366F1',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}>
                            <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                                Interconsultas Otras Especialidades
                            </span>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#4338CA', marginTop: '4px' }}>
                                {data.stats?.interconsultas_otras || 0}
                            </div>
                            <span style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px', display: 'block' }}>
                                Cardiología, Hematología, Cirugías, etc.
                            </span>
                        </div>

                        <div style={{
                            background: '#FFFFFF',
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0',
                            padding: '16px',
                            borderLeft: '4px solid #F59E0B',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}>
                            <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                                Tasa de Participación Clínica
                            </span>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#B45309', marginTop: '4px' }}>
                                {data.stats?.total_interconsultas 
                                    ? Math.round((data.stats.interconsultas_clinicas / data.stats.total_interconsultas) * 100) 
                                    : 0}%
                            </div>
                            <span style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px', display: 'block' }}>
                                Sobre {data.stats?.total_interconsultas || 0} interconsultas recientes
                            </span>
                        </div>
                    </div>

                    {/* Barra de Filtros de Interconsultas */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                            {/* Filtro Clínico */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>Filtro:</span>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setInterClinicoFilter('todos')}
                                        style={{
                                            padding: '5px 10px',
                                            borderRadius: '6px',
                                            border: '1px solid',
                                            borderColor: interClinicoFilter === 'todos' ? '#2563EB' : '#CBD5E1',
                                            background: interClinicoFilter === 'todos' ? '#EFF6FF' : '#FFFFFF',
                                            color: interClinicoFilter === 'todos' ? '#1D4ED8' : '#64748B',
                                            fontSize: '0.78rem',
                                            fontWeight: interClinicoFilter === 'todos' ? 700 : 500,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Todas ({data.interconsultas?.length || 0})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setInterClinicoFilter('solo_clinicos')}
                                        style={{
                                            padding: '5px 10px',
                                            borderRadius: '6px',
                                            border: '1px solid',
                                            borderColor: interClinicoFilter === 'solo_clinicos' ? '#10B981' : '#CBD5E1',
                                            background: interClinicoFilter === 'solo_clinicos' ? '#ECFDF5' : '#FFFFFF',
                                            color: interClinicoFilter === 'solo_clinicos' ? '#047857' : '#64748B',
                                            fontSize: '0.78rem',
                                            fontWeight: interClinicoFilter === 'solo_clinicos' ? 700 : 500,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        🩺 Solo Clínicos ({data.stats?.interconsultas_clinicas || 0})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setInterClinicoFilter('otras_especialidades')}
                                        style={{
                                            padding: '5px 10px',
                                            borderRadius: '6px',
                                            border: '1px solid',
                                            borderColor: interClinicoFilter === 'otras_especialidades' ? '#6366F1' : '#CBD5E1',
                                            background: interClinicoFilter === 'otras_especialidades' ? '#EEF2FF' : '#FFFFFF',
                                            color: interClinicoFilter === 'otras_especialidades' ? '#4338CA' : '#64748B',
                                            fontSize: '0.78rem',
                                            fontWeight: interClinicoFilter === 'otras_especialidades' ? 700 : 500,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Otras Especialidades ({data.stats?.interconsultas_otras || 0})
                                    </button>
                                </div>
                            </div>

                            {/* Filtro Servicio */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>Sector:</span>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setInterServicioFilter('todos')}
                                        style={{
                                            padding: '4px 8px',
                                            borderRadius: '6px',
                                            border: '1px solid',
                                            borderColor: interServicioFilter === 'todos' ? '#475569' : '#CBD5E1',
                                            background: interServicioFilter === 'todos' ? '#F1F5F9' : '#FFFFFF',
                                            color: interServicioFilter === 'todos' ? '#0F172A' : '#64748B',
                                            fontSize: '0.75rem',
                                            fontWeight: interServicioFilter === 'todos' ? 700 : 500,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Ambos
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setInterServicioFilter('internado')}
                                        style={{
                                            padding: '4px 8px',
                                            borderRadius: '6px',
                                            border: '1px solid',
                                            borderColor: interServicioFilter === 'internado' ? '#475569' : '#CBD5E1',
                                            background: interServicioFilter === 'internado' ? '#F1F5F9' : '#FFFFFF',
                                            color: interServicioFilter === 'internado' ? '#0F172A' : '#64748B',
                                            fontSize: '0.75rem',
                                            fontWeight: interServicioFilter === 'internado' ? 700 : 500,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Internado (Piso)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setInterServicioFilter('uci')}
                                        style={{
                                            padding: '4px 8px',
                                            borderRadius: '6px',
                                            border: '1px solid',
                                            borderColor: interServicioFilter === 'uci' ? '#475569' : '#CBD5E1',
                                            background: interServicioFilter === 'uci' ? '#F1F5F9' : '#FFFFFF',
                                            color: interServicioFilter === 'uci' ? '#0F172A' : '#64748B',
                                            fontSize: '0.75rem',
                                            fontWeight: interServicioFilter === 'uci' ? 700 : 500,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        UCI (Terapia)
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div style={{ position: 'relative', width: '280px' }}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94A3B8' }} />
                            <input
                                type="text"
                                value={interSearch}
                                onChange={(e) => setInterSearch(e.target.value)}
                                placeholder="Buscar por paciente, médico, especialidad..."
                                style={{
                                    width: '100%',
                                    padding: '7px 10px 7px 32px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8rem',
                                    outline: 'none'
                                }}
                            />
                        </div>
                    </div>

                    {/* Tabla de Interconsultas */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        overflow: 'hidden',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                    }}>
                        <div style={{ overflowX: 'auto', maxHeight: '550px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                                <thead style={{
                                    position: 'sticky',
                                    top: 0,
                                    background: '#F8FAFC',
                                    borderBottom: '2px solid #E2E8F0',
                                    zIndex: 2
                                }}>
                                    <tr>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Perfil Profesional</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Médico Actuante</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Especialidad</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Paciente</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Ubicación / Cama</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Sector</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Tipo Visita</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Fecha / Hora</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Obra Social</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan="9" style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                                    <RefreshCw size={18} className="spin" /> Cargando interconsultas...
                                                </div>
                                            </td>
                                        </tr>
                                    ) : filteredInter.length === 0 ? (
                                        <tr>
                                            <td colSpan="9" style={{ padding: '36px', textAlign: 'center', color: '#94A3B8' }}>
                                                No se encontraron interconsultas con los filtros seleccionados
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredInter.map((r, idx) => {
                                            const esClinico = r.es_medico_clinico === 1;
                                            return (
                                                <tr 
                                                    key={`${r.id_visita}-${idx}`}
                                                    style={{
                                                        borderBottom: '1px solid #F1F5F9',
                                                        background: esClinico ? '#F0FDF4' : idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA'
                                                    }}
                                                >
                                                    <td style={{ padding: '10px 14px' }}>
                                                        <span style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '5px',
                                                            padding: '3px 9px',
                                                            borderRadius: '12px',
                                                            fontSize: '0.72rem',
                                                            fontWeight: 800,
                                                            background: esClinico ? '#DCFCE7' : '#F1F5F9',
                                                            color: esClinico ? '#15803D' : '#475569',
                                                            border: esClinico ? '1px solid #86EFAC' : '1px solid #CBD5E1'
                                                        }}>
                                                            {esClinico ? '🩺 Médico Clínico' : '👨‍⚕️ Especialista'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>
                                                        {r.medico_actuante || 'Sin asignar'}
                                                    </td>
                                                    <td style={{ padding: '10px 14px' }}>
                                                        <span style={{
                                                            background: esClinico ? '#EFF6FF' : '#F8FAFC',
                                                            color: esClinico ? '#1E40AF' : '#475569',
                                                            padding: '2px 8px',
                                                            borderRadius: '6px',
                                                            fontSize: '0.74rem',
                                                            fontWeight: 600,
                                                            border: '1px solid #E2E8F0'
                                                        }}>
                                                            {r.especialidad_medico}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px 14px' }}>
                                                        <div style={{ fontWeight: 700, color: '#1E293B' }}>{r.paciente}</div>
                                                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                            DNI: {r.dni || 'S/D'} {r.nhc ? `· NHC: ${r.nhc}` : ''}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>
                                                        <span style={{
                                                            background: '#F1F5F9',
                                                            color: '#334155',
                                                            padding: '2px 7px',
                                                            borderRadius: '4px',
                                                            fontSize: '0.78rem'
                                                        }}>
                                                            🛏️ {r.habitacion}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px 14px' }}>
                                                        <span style={{
                                                            padding: '2px 7px',
                                                            borderRadius: '4px',
                                                            fontSize: '0.72rem',
                                                            fontWeight: 700,
                                                            background: r.servicio_internacion?.includes('UCI') ? '#FEE2E2' : '#E0E7FF',
                                                            color: r.servicio_internacion?.includes('UCI') ? '#991B1B' : '#3730A3'
                                                        }}>
                                                            {r.servicio_internacion || 'PISO'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px 14px', color: '#475569', fontSize: '0.76rem' }}>
                                                        {r.tipo_visita}
                                                    </td>
                                                    <td style={{ padding: '10px 14px', color: '#64748B', whiteSpace: 'nowrap', fontSize: '0.76rem' }}>
                                                        {r.fecha_visita} {r.hora_creacion ? `· ${r.hora_creacion}` : ''}
                                                    </td>
                                                    <td style={{ padding: '10px 14px', color: '#64748B', fontSize: '0.74rem', maxWidth: '140px' }}>
                                                        {r.obra_social || 'Particular'}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
