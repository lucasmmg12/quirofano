import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
    BarChart3, Calendar, Users, Stethoscope, Upload, RefreshCw,
    TrendingUp, Building2, ChevronDown, FileSpreadsheet, Filter,
} from 'lucide-react';

const MESES = [
    { value: '2026-04', label: 'Abril 2026' },
    { value: '2026-05', label: 'Mayo 2026' },
    { value: '2026-06', label: 'Junio 2026' },
];

const ESP_COLORS = {
    PEDIATRIA: '#3B82F6',
    'CLINICO': '#10B981',
    'CLINICO ': '#10B981',
    GINECOLOGIA: '#EC4899',
    CARDIOLOGIA: '#EF4444',
    PREPARTO: '#F59E0B',
    NEONATOLOGIA: '#8B5CF6',
};

export default function ConsultasPanel() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [mes, setMes] = useState('2026-04');
    const [filtroEsp, setFiltroEsp] = useState('todas');
    const [vista, setVista] = useState('matriz'); // matriz | dia | semana | resumen
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const [matrizAgrupar, setMatrizAgrupar] = useState('dia'); // dia | semana
    const [matrizColumnas, setMatrizColumnas] = useState('especialidad'); // especialidad | agenda | tipo_visita
    const [colsOcultas, setColsOcultas] = useState(new Set());

    // Fetch ALL data (paginated to bypass 1000-row limit)
    const fetchData = useCallback(async () => {
        setLoading(true);
        let allRows = [];
        let from = 0;
        const PAGE = 1000;
        while (true) {
            const { data: rows, error } = await supabase
                .from('consultas_guardia')
                .select('fecha_visita,visita_especialidad,cliente,grupo_agenda,tipo_visita,agenda')
                .eq('mes_periodo', mes)
                .order('fecha_visita', { ascending: true })
                .range(from, from + PAGE - 1);
            if (error || !rows) break;
            allRows = allRows.concat(rows);
            if (rows.length < PAGE) break;
            from += PAGE;
        }
        setData(allRows);
        setLoading(false);
    }, [mes]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Filtered data
    const filtered = useMemo(() => {
        if (filtroEsp === 'todas') return data;
        return data.filter(r => r.visita_especialidad?.trim() === filtroEsp);
    }, [data, filtroEsp]);

    // KPIs
    const kpis = useMemo(() => {
        const total = filtered.length;
        const especialidades = [...new Set(filtered.map(r => r.visita_especialidad?.trim()))];
        const obrasSociales = [...new Set(filtered.map(r => r.cliente))];
        const diasUnicos = [...new Set(filtered.map(r => r.fecha_visita))];
        const promDiario = diasUnicos.length ? Math.round(total / diasUnicos.length) : 0;
        return { total, especialidades: especialidades.length, obrasSociales: obrasSociales.length, promDiario, dias: diasUnicos.length };
    }, [filtered]);

    // Group by date
    const porDia = useMemo(() => {
        const map = {};
        filtered.forEach(r => {
            const key = r.fecha_visita;
            if (!map[key]) map[key] = { fecha: key, total: 0, byEsp: {}, byOS: {} };
            map[key].total++;
            const esp = r.visita_especialidad?.trim() || 'OTRO';
            map[key].byEsp[esp] = (map[key].byEsp[esp] || 0) + 1;
            const os = r.cliente || 'SIN OS';
            map[key].byOS[os] = (map[key].byOS[os] || 0) + 1;
        });
        return Object.values(map).sort((a, b) => a.fecha.localeCompare(b.fecha));
    }, [filtered]);

    // Group by week
    const porSemana = useMemo(() => {
        const map = {};
        filtered.forEach(r => {
            const d = new Date(r.fecha_visita + 'T12:00:00');
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(d.setDate(diff));
            const key = monday.toISOString().split('T')[0];
            if (!map[key]) map[key] = { semana: key, total: 0, byEsp: {} };
            map[key].total++;
            const esp = r.visita_especialidad?.trim() || 'OTRO';
            map[key].byEsp[esp] = (map[key].byEsp[esp] || 0) + 1;
        });
        return Object.values(map).sort((a, b) => a.semana.localeCompare(b.semana));
    }, [filtered]);

    // Top OS
    const topOS = useMemo(() => {
        const map = {};
        filtered.forEach(r => { map[r.cliente] = (map[r.cliente] || 0) + 1; });
        return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
    }, [filtered]);

    // Especialidades list
    const especialidades = useMemo(() => {
        const map = {};
        data.forEach(r => { const e = r.visita_especialidad?.trim(); if (e) map[e] = (map[e] || 0) + 1; });
        return Object.entries(map).sort((a, b) => b[1] - a[1]);
    }, [data]);

    // Max for bar chart
    const maxDia = useMemo(() => Math.max(...porDia.map(d => d.total), 1), [porDia]);

    // Import handler
    const handleImport = useCallback(async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImporting(true);
        setImportResult(null);
        try {
            const XLSX = await import('xlsx');
            const wb = XLSX.read(await file.arrayBuffer());
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

            // Detect month from first row
            const firstDate = rows[0]?.['Fecha Visita'];
            const excelToISO = (s) => { if (!s || typeof s !== 'number') return null; return new Date((s - 25569) * 86400000).toISOString().split('T')[0]; };
            const sampleDate = excelToISO(firstDate);
            const mesPeriodo = sampleDate?.substring(0, 7) || mes;

            // Create import record
            const { data: imp } = await supabase.from('consultas_imports').insert({
                mes: mesPeriodo, archivo: file.name, total_registros: rows.length,
            }).select().single();

            // Transform
            const records = rows.map(r => {
                const fecha = excelToISO(r['Fecha Visita']);
                return {
                    import_id: imp?.id, id_visita: r.idVisita, id_paciente: r.IdPaciente,
                    cliente: (r.Cliente || '').trim(), asistencia: (r.Asistencia || '').trim(),
                    paciente: (r.Paciente || '').trim(), nhc: r.NHC, nif: r.NIF ? String(r.NIF) : null,
                    agenda: (r.Agenda || '').trim(), agrupacion_agenda: (r.Agrupacion_Agenda || '').trim(),
                    grupo_agenda: (r['Grupo Agenda'] || '').trim(), tipo_visita: (r['Tipo Visita'] || '').trim(),
                    tiempo_pred: r.TiempoPred, fecha_visita: fecha,
                    visita_especialidad: (r.Visita_Especialidad || '').trim(), mes_periodo: mesPeriodo,
                };
            });

            // Batch upsert
            let ok = 0;
            for (let i = 0; i < records.length; i += 500) {
                const { error } = await supabase.from('consultas_guardia').upsert(records.slice(i, i + 500), { onConflict: 'id_visita' });
                if (!error) ok += Math.min(500, records.length - i);
            }

            setImportResult({ success: true, total: ok, mes: mesPeriodo });
            setMes(mesPeriodo);
            fetchData();
        } catch (err) {
            setImportResult({ success: false, error: err.message });
        }
        setImporting(false);
    }, [mes, fetchData]);

    const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const formatDate = (d) => {
        if (!d) return '';
        const [y, m, dd] = d.split('-');
        const dow = DIAS_SEMANA[new Date(d + 'T12:00:00').getDay()];
        return `${dow} ${dd}`;
    };

    const formatWeek = (d) => {
        const start = new Date(d + 'T12:00:00');
        const end = new Date(start); end.setDate(end.getDate() + 6);
        return `${start.getDate()}/${start.getMonth() + 1} - ${end.getDate()}/${end.getMonth() + 1}`;
    };

    // ─── RENDER ───
    return (
        <div className="content no-print" style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '40px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '14px', background: 'linear-gradient(135deg, #4F46E5, #818CF8)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Stethoscope size={22} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#1E293B' }}>Consultas de Guardia</h1>
                        <p style={{ fontSize: '0.75rem', color: '#94A3B8', margin: 0 }}>Dashboard de consultas ambulatorias por guardia</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Month selector */}
                    <select value={mes} onChange={e => setMes(e.target.value)} style={{
                        padding: '8px 12px', borderRadius: '10px', border: '1px solid #E2E8F0',
                        fontSize: '0.8rem', fontWeight: 600, background: '#fff', cursor: 'pointer',
                    }}>
                        {MESES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    {/* Import button */}
                    <label style={{
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
                        borderRadius: '10px', border: '1px solid #BBF7D0', background: '#F0FDF4',
                        color: '#16A34A', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                    }}>
                        <Upload size={14} />
                        {importing ? 'Importando...' : 'Importar Excel'}
                        <input type="file" accept=".xlsx,.xls" onChange={handleImport} hidden disabled={importing} />
                    </label>
                    <button onClick={fetchData} style={{
                        width: '36px', height: '36px', borderRadius: '10px', border: '1px solid #E2E8F0',
                        background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}><RefreshCw size={14} /></button>
                </div>
            </div>

            {/* Import result toast */}
            {importResult && (
                <div style={{
                    padding: '12px 16px', borderRadius: '12px', marginBottom: '16px',
                    background: importResult.success ? '#F0FDF4' : '#FEF2F2',
                    border: `1px solid ${importResult.success ? '#BBF7D0' : '#FECACA'}`,
                    color: importResult.success ? '#16A34A' : '#DC2626',
                    fontSize: '0.82rem', fontWeight: 600,
                }}>
                    {importResult.success
                        ? `✅ ${importResult.total} registros importados para ${importResult.mes}`
                        : `❌ Error: ${importResult.error}`}
                </div>
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#94A3B8' }}>
                    <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
                    <p>Cargando datos...</p>
                </div>
            ) : data.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#94A3B8' }}>
                    <FileSpreadsheet size={48} strokeWidth={1} />
                    <h3 style={{ color: '#64748B' }}>Sin datos para {MESES.find(m => m.value === mes)?.label}</h3>
                    <p>Importá un Excel con las consultas del mes.</p>
                </div>
            ) : (
                <>
                    {/* KPIs */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                        {[
                            { label: 'Total Consultas', value: kpis.total.toLocaleString(), icon: BarChart3, color: '#4F46E5', bg: '#EEF2FF' },
                            { label: 'Promedio/Día', value: kpis.promDiario, icon: TrendingUp, color: '#10B981', bg: '#ECFDF5' },
                            { label: 'Especialidades', value: kpis.especialidades, icon: Stethoscope, color: '#EC4899', bg: '#FDF2F8' },
                            { label: 'Obras Sociales', value: kpis.obrasSociales, icon: Building2, color: '#F59E0B', bg: '#FFFBEB' },
                            { label: 'Días con datos', value: kpis.dias, icon: Calendar, color: '#06B6D4', bg: '#ECFEFF' },
                        ].map((k, i) => (
                            <div key={i} style={{ background: '#fff', border: '1px solid #F1F5F9', borderRadius: '16px', padding: '16px', display: 'flex', gap: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: k.bg, color: k.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <k.icon size={18} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#1E293B' }}>{k.value}</div>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>{k.label}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Filters row */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <Filter size={14} style={{ color: '#94A3B8' }} />
                        <button onClick={() => setFiltroEsp('todas')} style={{
                            padding: '5px 12px', borderRadius: '8px', border: '1px solid', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                            background: filtroEsp === 'todas' ? '#4F46E5' : '#fff', color: filtroEsp === 'todas' ? '#fff' : '#64748B',
                            borderColor: filtroEsp === 'todas' ? '#4F46E5' : '#E2E8F0',
                        }}>Todas</button>
                        {especialidades.map(([esp, count]) => (
                            <button key={esp} onClick={() => setFiltroEsp(esp)} style={{
                                padding: '5px 12px', borderRadius: '8px', border: '1px solid', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                                background: filtroEsp === esp ? (ESP_COLORS[esp] || '#4F46E5') : '#fff',
                                color: filtroEsp === esp ? '#fff' : '#64748B',
                                borderColor: filtroEsp === esp ? (ESP_COLORS[esp] || '#4F46E5') : '#E2E8F0',
                            }}>{esp} ({count})</button>
                        ))}
                    </div>

                    {/* View toggle */}
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', background: '#F1F5F9', borderRadius: '10px', padding: '3px', width: 'fit-content' }}>
                        {[{ id: 'dia', label: 'Por Día' }, { id: 'semana', label: 'Por Semana' }, { id: 'matriz', label: '📋 Matriz' }, { id: 'resumen', label: 'Resumen' }].map(v => (
                            <button key={v.id} onClick={() => setVista(v.id)} style={{
                                padding: '6px 14px', borderRadius: '8px', border: 'none', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                                background: vista === v.id ? '#fff' : 'transparent', color: vista === v.id ? '#4F46E5' : '#64748B',
                                boxShadow: vista === v.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                            }}>{v.label}</button>
                        ))}
                    </div>

                    {/* Daily chart */}
                    {vista === 'dia' && (
                        <div style={{ background: '#fff', border: '1px solid #F1F5F9', borderRadius: '16px', padding: '20px', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: '#1E293B' }}>📊 Consultas por Día</h3>
                                <span style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600 }}>{porDia.length} días · {filtered.length.toLocaleString()} consultas</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                {porDia.map((d, idx) => {
                                    const isWeekend = [0, 6].includes(new Date(d.fecha + 'T12:00:00').getDay());
                                    return (
                                    <div key={d.fecha} style={{
                                        display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0',
                                        background: isWeekend ? '#F8FAFC' : 'transparent', borderRadius: '4px',
                                    }}>
                                        <span style={{ fontSize: '0.68rem', fontWeight: isWeekend ? 700 : 600, color: isWeekend ? '#4F46E5' : '#94A3B8', width: '48px', flexShrink: 0, textAlign: 'right' }}>{formatDate(d.fecha)}</span>
                                        <div style={{ flex: 1, height: '18px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                                            {Object.entries(d.byEsp).map(([esp, cnt], i) => {
                                                const prevWidth = Object.entries(d.byEsp).slice(0, i).reduce((s, [, v]) => s + (v / maxDia) * 100, 0);
                                                return (
                                                    <div key={esp} title={`${esp}: ${cnt}`} style={{
                                                        position: 'absolute', top: 0, bottom: 0,
                                                        left: `${prevWidth}%`, width: `${(cnt / maxDia) * 100}%`,
                                                        background: ESP_COLORS[esp] || '#94A3B8', opacity: 0.85,
                                                    }} />
                                                );
                                            })}
                                        </div>
                                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#1E293B', width: '30px', textAlign: 'right', flexShrink: 0 }}>{d.total}</span>
                                    </div>
                                    );
                                })}
                            </div>
                            {/* Legend */}
                            <div style={{ display: 'flex', gap: '12px', marginTop: '12px', flexWrap: 'wrap' }}>
                                {Object.entries(ESP_COLORS).filter(([k]) => !k.endsWith(' ')).map(([esp, color]) => (
                                    <div key={esp} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', color: '#64748B' }}>
                                        <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: color }} />
                                        {esp}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Weekly view */}
                    {vista === 'semana' && (
                        <div style={{ background: '#fff', border: '1px solid #F1F5F9', borderRadius: '16px', padding: '20px', marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 16px', color: '#1E293B' }}>📅 Consultas por Semana</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                                {porSemana.map(s => (
                                    <div key={s.semana} style={{ background: '#F8FAFC', borderRadius: '12px', padding: '14px', border: '1px solid #E2E8F0' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4F46E5', marginBottom: '6px' }}>Sem. {formatWeek(s.semana)}</div>
                                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1E293B' }}>{s.total}</div>
                                        <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>consultas</div>
                                        <div style={{ marginTop: '8px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                            {Object.entries(s.byEsp).sort((a, b) => b[1] - a[1]).map(([esp, cnt]) => (
                                                <span key={esp} style={{
                                                    padding: '2px 6px', borderRadius: '4px', fontSize: '0.62rem', fontWeight: 600,
                                                    background: (ESP_COLORS[esp] || '#94A3B8') + '18', color: ESP_COLORS[esp] || '#64748B',
                                                }}>{esp.substring(0, 4)} {cnt}</span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Summary view */}
                    {vista === 'resumen' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                            {/* By specialty */}
                            <div style={{ background: '#fff', border: '1px solid #F1F5F9', borderRadius: '16px', padding: '20px' }}>
                                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 16px', color: '#1E293B' }}>🩺 Por Especialidad</h3>
                                {especialidades.map(([esp, cnt]) => {
                                    const pct = ((cnt / data.length) * 100).toFixed(1);
                                    return (
                                        <div key={esp} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', width: '100px' }}>{esp}</span>
                                            <div style={{ flex: 1, height: '8px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                                                <div style={{ width: `${pct}%`, height: '100%', background: ESP_COLORS[esp] || '#94A3B8', borderRadius: '4px' }} />
                                            </div>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1E293B', width: '60px', textAlign: 'right' }}>{cnt} ({pct}%)</span>
                                        </div>
                                    );
                                })}
                            </div>
                            {/* Top OS */}
                            <div style={{ background: '#fff', border: '1px solid #F1F5F9', borderRadius: '16px', padding: '20px' }}>
                                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 16px', color: '#1E293B' }}>🏥 Top Obras Sociales</h3>
                                {topOS.map(([os, cnt], i) => (
                                    <div key={os} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#94A3B8', width: '18px' }}>{i + 1}</span>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 500, color: '#334155', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{os}</span>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#4F46E5' }}>{cnt}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ═══════ MATRIZ (pivot table) ═══════ */}
                    {vista === 'matriz' && (() => {
                        // Build column values dynamically
                        const colField = matrizColumnas;
                        const getColVal = (r) => {
                            if (colField === 'especialidad') return r.visita_especialidad?.trim() || 'OTRO';
                            if (colField === 'agenda') return r.agenda?.trim() || 'OTRO';
                            if (colField === 'tipo_visita') return r.tipo_visita?.trim() || 'OTRO';
                            return r.grupo_agenda?.trim() || 'OTRO';
                        };

                        // Get all unique column values sorted by frequency
                        const colCounts = {};
                        filtered.forEach(r => { const v = getColVal(r); colCounts[v] = (colCounts[v] || 0) + 1; });
                        const allCols = Object.entries(colCounts).sort((a, b) => b[1] - a[1]).map(([k]) => k);
                        const visibleCols = allCols.filter(c => !colsOcultas.has(c));

                        // Build rows
                        const rowMap = {};
                        filtered.forEach(r => {
                            let key;
                            if (matrizAgrupar === 'semana') {
                                const d = new Date(r.fecha_visita + 'T12:00:00');
                                const day = d.getDay();
                                const diff = d.getDate() - day + (day === 0 ? -6 : 1);
                                const monday = new Date(d);
                                monday.setDate(diff);
                                key = monday.toISOString().split('T')[0];
                            } else {
                                key = r.fecha_visita;
                            }
                            if (!rowMap[key]) rowMap[key] = { key, total: 0, cols: {} };
                            rowMap[key].total++;
                            const col = getColVal(r);
                            rowMap[key].cols[col] = (rowMap[key].cols[col] || 0) + 1;
                        });
                        const rows = Object.values(rowMap).sort((a, b) => a.key.localeCompare(b.key));

                        // Totals
                        const totals = {};
                        let grandTotal = 0;
                        rows.forEach(r => {
                            grandTotal += r.total;
                            visibleCols.forEach(c => { totals[c] = (totals[c] || 0) + (r.cols[c] || 0); });
                        });

                        const formatRowLabel = (key) => {
                            if (matrizAgrupar === 'semana') {
                                const s = new Date(key + 'T12:00:00');
                                const e = new Date(s); e.setDate(e.getDate() + 6);
                                return `${s.getDate()}/${s.getMonth() + 1} - ${e.getDate()}/${e.getMonth() + 1}`;
                            }
                            return formatDate(key);
                        };

                        const toggleCol = (col) => {
                            setColsOcultas(prev => {
                                const next = new Set(prev);
                                if (next.has(col)) next.delete(col); else next.add(col);
                                return next;
                            });
                        };

                        return (
                            <div style={{ background: '#fff', border: '1px solid #F1F5F9', borderRadius: '16px', padding: '20px', marginBottom: '20px' }}>
                                {/* Controls */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: '#1E293B' }}>📋 Matriz de Consultas</h3>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                        {/* Group by toggle */}
                                        <span style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 600 }}>Agrupar:</span>
                                        {[{ id: 'dia', label: 'Día' }, { id: 'semana', label: 'Semana' }].map(g => (
                                            <button key={g.id} onClick={() => setMatrizAgrupar(g.id)} style={{
                                                padding: '4px 10px', borderRadius: '6px', border: '1px solid',
                                                fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer',
                                                background: matrizAgrupar === g.id ? '#4F46E5' : '#fff',
                                                color: matrizAgrupar === g.id ? '#fff' : '#64748B',
                                                borderColor: matrizAgrupar === g.id ? '#4F46E5' : '#E2E8F0',
                                            }}>{g.label}</button>
                                        ))}
                                        <span style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 600, marginLeft: '8px' }}>Columnas:</span>
                                        {[{ id: 'especialidad', label: 'Especialidad' }, { id: 'agenda', label: 'Agenda' }, { id: 'tipo_visita', label: 'Tipo Visita' }].map(c => (
                                            <button key={c.id} onClick={() => { setMatrizColumnas(c.id); setColsOcultas(new Set()); }} style={{
                                                padding: '4px 10px', borderRadius: '6px', border: '1px solid',
                                                fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer',
                                                background: matrizColumnas === c.id ? '#10B981' : '#fff',
                                                color: matrizColumnas === c.id ? '#fff' : '#64748B',
                                                borderColor: matrizColumnas === c.id ? '#10B981' : '#E2E8F0',
                                            }}>{c.label}</button>
                                        ))}
                                    </div>
                                </div>

                                {/* Column toggles */}
                                <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', flexWrap: 'wrap' }}>
                                    <button onClick={() => setColsOcultas(new Set())} style={{
                                        padding: '3px 8px', borderRadius: '4px', border: '1px solid #E2E8F0',
                                        fontSize: '0.62rem', fontWeight: 600, cursor: 'pointer',
                                        background: colsOcultas.size === 0 ? '#EEF2FF' : '#fff',
                                        color: colsOcultas.size === 0 ? '#4F46E5' : '#94A3B8',
                                    }}>✓ Todas</button>
                                    {allCols.map(col => (
                                        <button key={col} onClick={() => toggleCol(col)} style={{
                                            padding: '3px 8px', borderRadius: '4px', border: '1px solid',
                                            fontSize: '0.62rem', fontWeight: 600, cursor: 'pointer',
                                            background: colsOcultas.has(col) ? '#FEF2F2' : '#F0FDF4',
                                            color: colsOcultas.has(col) ? '#DC2626' : '#16A34A',
                                            borderColor: colsOcultas.has(col) ? '#FECACA' : '#BBF7D0',
                                            textDecoration: colsOcultas.has(col) ? 'line-through' : 'none',
                                        }}>{col} ({colCounts[col]})</button>
                                    ))}
                                </div>

                                {/* Table */}
                                <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
                                        <thead>
                                            <tr style={{ background: 'linear-gradient(135deg, #312E81, #4F46E5)' }}>
                                                <th style={{ padding: '8px 10px', color: '#fff', fontWeight: 700, textAlign: 'left', position: 'sticky', left: 0, background: '#3730A3', zIndex: 2, minWidth: '70px' }}>
                                                    {matrizAgrupar === 'semana' ? 'Semana' : 'Fecha'}
                                                </th>
                                                {visibleCols.map(col => (
                                                    <th key={col} style={{ padding: '8px 6px', color: '#fff', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap', fontSize: '0.65rem' }}>
                                                        {col.length > 14 ? col.substring(0, 12) + '…' : col}
                                                    </th>
                                                ))}
                                                <th style={{ padding: '8px 10px', color: '#FDE68A', fontWeight: 800, textAlign: 'center', minWidth: '50px' }}>TOTAL</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map((row, idx) => {
                                                const isWeekend = matrizAgrupar === 'dia' && [0, 6].includes(new Date(row.key + 'T12:00:00').getDay());
                                                return (
                                                    <tr key={row.key} style={{ background: isWeekend ? '#EEF2FF' : idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                                                        <td style={{
                                                            padding: '6px 10px', fontWeight: isWeekend ? 700 : 600,
                                                            color: isWeekend ? '#4F46E5' : '#334155',
                                                            position: 'sticky', left: 0, zIndex: 1,
                                                            background: isWeekend ? '#EEF2FF' : idx % 2 === 0 ? '#fff' : '#FAFAFA',
                                                            borderRight: '2px solid #E2E8F0',
                                                        }}>
                                                            {formatRowLabel(row.key)}
                                                        </td>
                                                        {visibleCols.map(col => {
                                                            const val = row.cols[col] || 0;
                                                            const maxInCol = Math.max(...rows.map(r => r.cols[col] || 0), 1);
                                                            const intensity = val / maxInCol;
                                                            return (
                                                                <td key={col} style={{
                                                                    padding: '6px 6px', textAlign: 'center', fontWeight: val > 0 ? 700 : 400,
                                                                    color: val > 0 ? '#1E293B' : '#D1D5DB',
                                                                    background: val > 0 ? `rgba(79,70,229,${intensity * 0.15})` : 'transparent',
                                                                }}>
                                                                    {val || '—'}
                                                                </td>
                                                            );
                                                        })}
                                                        <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 800, color: '#1E293B', background: '#F8FAFC', borderLeft: '2px solid #E2E8F0' }}>
                                                            {row.total}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr style={{ background: 'linear-gradient(135deg, #F1F5F9, #E2E8F0)' }}>
                                                <td style={{ padding: '8px 10px', fontWeight: 800, color: '#1E293B', position: 'sticky', left: 0, background: '#E2E8F0', borderRight: '2px solid #CBD5E1', zIndex: 1 }}>TOTAL</td>
                                                {visibleCols.map(col => (
                                                    <td key={col} style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 800, color: '#4F46E5' }}>
                                                        {totals[col] || 0}
                                                    </td>
                                                ))}
                                                <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 900, color: '#1E293B', fontSize: '0.82rem', borderLeft: '2px solid #CBD5E1' }}>
                                                    {grandTotal.toLocaleString()}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        );
                    })()}
                </>
            )}
        </div>
    );
}
