import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { SkeletonChartGrid } from './SkeletonLoader';
import {
    BarChart3, Calendar, Users, Stethoscope, Upload, RefreshCw,
    TrendingUp, Building2, ChevronDown, FileSpreadsheet, Filter,
    ChevronLeft, ChevronRight, Search, Table2, Check, Save, Loader,
    GraduationCap, Clock,
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

const OS_CATEGORIES = {
    OSP: { label: 'OSP', color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
    Prepagas: { label: 'Prepagas', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
    Particulares: { label: 'Particular', color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA' },
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
    // Registros (server-side paginated)
    const [regPage, setRegPage] = useState(0);
    const [regSize, setRegSize] = useState(50);
    const [regRows, setRegRows] = useState([]);
    const [regTotal, setRegTotal] = useState(0);
    const [regLoading, setRegLoading] = useState(false);
    const [regSearch, setRegSearch] = useState('');
    const [regColFilter, setRegColFilter] = useState('todos'); // todos | paciente | cliente | especialidad | agenda | tipo_visita
    const searchTimer = useRef(null);
    // OS category filter for registros view
    const [filtroOS, setFiltroOS] = useState('todas'); // todas | OSP | Prepagas | Particulares
    // Editable "traído" notes per row
    const [traidoEdits, setTraidoEdits] = useState({}); // { id_visita: 'texto...' }
    const [traidoSaving, setTraidoSaving] = useState({}); // { id_visita: true/false }
    const [traidoSaved, setTraidoSaved] = useState({}); // { id_visita: true } — flash check icon
    const traidoTimers = useRef({}); // debounce timers per row
    // Excel-style per-column filters
    const [colFilters, setColFilters] = useState({});      // { especialidad: Set(['PEDIATRIA']), agenda: Set([...]) }
    const [colFilterOpen, setColFilterOpen] = useState(null);  // which column dropdown is open
    const [colFilterSearch, setColFilterSearch] = useState(''); // search within filter dropdown
    const [colFilterOptions, setColFilterOptions] = useState({}); // cached unique values per column
    const colFilterRef = useRef(null);

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (colFilterRef.current && !colFilterRef.current.contains(e.target)) {
                setColFilterOpen(null);
                setColFilterSearch('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch ALL data (paginated to bypass 1000-row limit)
    const fetchData = useCallback(async () => {
        setLoading(true);
        let allRows = [];
        let from = 0;
        const PAGE = 1000;
        while (true) {
            const { data: rows, error } = await supabase
                .from('consultas_guardia')
                .select('fecha_visita,hora_visita,visita_especialidad,cliente,grupo_agenda,tipo_visita,agenda')
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

    // Fetch unique column values for filter dropdowns
    const fetchColFilterOptions = useCallback(async (colKey) => {
        if (colFilterOptions[colKey]) return; // Already cached
        const dbCol = { especialidad: 'visita_especialidad', agenda: 'agenda', tipo_visita: 'tipo_visita', cliente: 'cliente' }[colKey];
        if (!dbCol) return;
        const { data: rows } = await supabase
            .from('consultas_guardia')
            .select(dbCol)
            .eq('mes_periodo', mes)
            .order(dbCol, { ascending: true })
            .limit(5000);
        const unique = [...new Set((rows || []).map(r => r[dbCol]?.trim()).filter(Boolean))].sort();
        setColFilterOptions(prev => ({ ...prev, [colKey]: unique }));
    }, [mes, colFilterOptions]);

    // Reset column filter options when month changes
    useEffect(() => { setColFilterOptions({}); setColFilters({}); }, [mes]);

    // Fetch registros (server-side paginated)
    const fetchRegistros = useCallback(async () => {
        setRegLoading(true);
        const from = regPage * regSize;
        const to = from + regSize - 1;
        let q = supabase
            .from('consultas_guardia')
            .select('id_visita,paciente,cliente,nif,fecha_visita,hora_visita,visita_especialidad,agenda,tipo_visita,grupo_agenda,nhc,notas_traido', { count: 'exact' })
            .eq('mes_periodo', mes)
            .order('fecha_visita', { ascending: false })
            .order('paciente', { ascending: true })
            .range(from, to);
        if (regSearch.trim()) {
            const s = `%${regSearch.trim()}%`;
            if (regColFilter === 'paciente') q = q.ilike('paciente', s);
            else if (regColFilter === 'cliente') q = q.ilike('cliente', s);
            else if (regColFilter === 'especialidad') q = q.ilike('visita_especialidad', s);
            else if (regColFilter === 'agenda') q = q.ilike('agenda', s);
            else if (regColFilter === 'tipo_visita') q = q.ilike('tipo_visita', s);
            else q = q.or(`paciente.ilike.${s},cliente.ilike.${s},visita_especialidad.ilike.${s},agenda.ilike.${s},tipo_visita.ilike.${s}`);
        }
        // Apply OS category filter (server-side via cliente patterns)
        if (filtroOS === 'OSP') {
            q = q.eq('cliente', '001 - PROVINCIA');
        } else if (filtroOS === 'Prepagas') {
            q = q.neq('cliente', '001 - PROVINCIA').like('cliente', '[0-9]%');
        } else if (filtroOS === 'Particulares') {
            q = q.not('cliente', 'like', '[0-9]%');
        }
        // Apply per-column filters
        const colDbMap = { especialidad: 'visita_especialidad', agenda: 'agenda', tipo_visita: 'tipo_visita', cliente: 'cliente' };
        Object.entries(colFilters).forEach(([colKey, selectedSet]) => {
            if (selectedSet.size > 0 && colDbMap[colKey]) {
                q = q.in(colDbMap[colKey], [...selectedSet]);
            }
        });
        const { data: rows, count, error } = await q;
        if (!error) {
            setRegRows(rows || []);
            setRegTotal(count || 0);
            // Initialize traido edits from loaded data
            const edits = {};
            (rows || []).forEach(r => { if (r.notas_traido) edits[r.id_visita] = r.notas_traido; });
            setTraidoEdits(prev => ({ ...prev, ...edits }));
        }
        setRegLoading(false);
    }, [mes, regPage, regSize, regSearch, regColFilter, colFilters, filtroOS]);

    useEffect(() => { if (vista === 'registros') fetchRegistros(); }, [vista, fetchRegistros]);

    // Save "traído" notes with debounce
    const saveTraido = useCallback(async (idVisita, value) => {
        setTraidoSaving(prev => ({ ...prev, [idVisita]: true }));
        try {
            await supabase
                .from('consultas_guardia')
                .update({ notas_traido: value || null })
                .eq('id_visita', idVisita);
            setTraidoSaved(prev => ({ ...prev, [idVisita]: true }));
            setTimeout(() => setTraidoSaved(prev => ({ ...prev, [idVisita]: false })), 1500);
        } catch (err) {
            console.error('Error saving notas_traido:', err);
        } finally {
            setTraidoSaving(prev => ({ ...prev, [idVisita]: false }));
        }
    }, []);

    const handleTraidoChange = useCallback((idVisita, value) => {
        setTraidoEdits(prev => ({ ...prev, [idVisita]: value }));
        // Debounced save (1.2s after last keystroke)
        if (traidoTimers.current[idVisita]) clearTimeout(traidoTimers.current[idVisita]);
        traidoTimers.current[idVisita] = setTimeout(() => saveTraido(idVisita, value), 1200);
    }, [saveTraido]);

    // Debounced search
    const handleRegSearch = (val) => {
        setRegSearch(val);
        setRegPage(0);
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => fetchRegistros(), 400);
    };

    // Helper: normalizar especialidad agrupando (NEO) como NEONATOLOGIA
    const normalizeEsp = (r) => {
        if (r.agenda?.trim().startsWith('(NEO)')) return 'NEONATOLOGIA';
        return r.visita_especialidad?.trim() || 'OTRO';
    };

    // Helper: normalizar obra social en 3 categorías
    const normalizeOS = (cliente) => {
        if (!cliente) return 'Particulares';
        const trimmed = cliente.trim();
        if (trimmed === '001 - PROVINCIA') return 'OSP';
        if (/^\d/.test(trimmed)) return 'Prepagas';
        return 'Particulares';
    };

    // Helper: detectar si es consulta de residencia ginecología (7:00 - 14:00)
    const isResidencia = (r) => {
        if (r.visita_especialidad?.trim() !== 'GINECOLOGIA') return false;
        if (!r.hora_visita) return false;
        const h = parseInt(r.hora_visita.split(':')[0], 10);
        return h >= 7 && h < 14;
    };

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
        const residencia = filtered.filter(r => isResidencia(r)).length;
        return { total, especialidades: especialidades.length, obrasSociales: obrasSociales.length, promDiario, dias: diasUnicos.length, residencia };
    }, [filtered]);

    // Group by date
    const porDia = useMemo(() => {
        const map = {};
        filtered.forEach(r => {
            const key = r.fecha_visita;
            if (!map[key]) map[key] = { fecha: key, total: 0, byEsp: {}, byOS: {} };
            map[key].total++;
            const esp = normalizeEsp(r);
            map[key].byEsp[esp] = (map[key].byEsp[esp] || 0) + 1;
            const os = normalizeOS(r.cliente);
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
            if (!map[key]) map[key] = { semana: key, total: 0, byEsp: {}, byOS: {} };
            map[key].total++;
            const esp = normalizeEsp(r);
            map[key].byEsp[esp] = (map[key].byEsp[esp] || 0) + 1;
            const os = normalizeOS(r.cliente);
            map[key].byOS[os] = (map[key].byOS[os] || 0) + 1;
        });
        return Object.values(map).sort((a, b) => a.semana.localeCompare(b.semana));
    }, [filtered]);

    // Top OS (agrupado en 3 categorías)
    const topOS = useMemo(() => {
        const map = {};
        filtered.forEach(r => { const os = normalizeOS(r.cliente); map[os] = (map[os] || 0) + 1; });
        return Object.entries(map).sort((a, b) => b[1] - a[1]);
    }, [filtered]);

    // Especialidades list (NEO agrupado)
    const especialidades = useMemo(() => {
        const map = {};
        data.forEach(r => { const e = normalizeEsp(r); if (e) map[e] = (map[e] || 0) + 1; });
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
            // Extract time from Excel serial (fractional part = time of day)
            const excelToTime = (s) => {
                if (!s || typeof s !== 'number') return null;
                const frac = s - Math.floor(s); // fractional part = time
                if (frac === 0) return null; // no time component
                const totalMinutes = Math.round(frac * 24 * 60);
                const hours = Math.floor(totalMinutes / 60);
                const mins = totalMinutes % 60;
                return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`;
            };
            const sampleDate = excelToISO(firstDate);
            const mesPeriodo = sampleDate?.substring(0, 7) || mes;

            // Create import record
            const { data: imp } = await supabase.from('consultas_imports').insert({
                mes: mesPeriodo, archivo: file.name, total_registros: rows.length,
            }).select().single();

            // Transform
            const records = rows.map(r => {
                const fecha = excelToISO(r['Fecha Visita']);
                const hora = excelToTime(r['Fecha Visita']);
                return {
                    import_id: imp?.id, id_visita: r.idVisita, id_paciente: r.IdPaciente,
                    cliente: (r.Cliente || '').trim(), asistencia: (r.Asistencia || '').trim(),
                    paciente: (r.Paciente || '').trim(), nhc: r.NHC, nif: r.NIF ? String(r.NIF) : null,
                    agenda: (r.Agenda || '').trim(), agrupacion_agenda: (r.Agrupacion_Agenda || '').trim(),
                    grupo_agenda: (r['Grupo Agenda'] || '').trim(), tipo_visita: (r['Tipo Visita'] || '').trim(),
                    tiempo_pred: r.TiempoPred, fecha_visita: fecha, hora_visita: hora,
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
                <SkeletonChartGrid kpis={6} charts={2} />
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
                            { label: 'Residencia Gine', value: kpis.residencia, icon: GraduationCap, color: '#7C3AED', bg: '#F5F3FF' },
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
                        {[{ id: 'matriz', label: '📋 Matriz' }, { id: 'dia', label: 'Por Día' }, { id: 'semana', label: 'Por Semana' }, { id: 'registros', label: '🗂️ Registros' }, { id: 'resumen', label: 'Resumen' }].map(v => (
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

                    {/* Weekly view — tabla estilo Excel */}
                    {vista === 'semana' && (() => {
                        const allEsps = [...new Set(porSemana.flatMap(s => Object.keys(s.byEsp)))];
                        const espTotals = {};
                        porSemana.forEach(s => { Object.entries(s.byEsp).forEach(([e, c]) => { espTotals[e] = (espTotals[e] || 0) + c; }); });
                        const sortedEsps = allEsps.sort((a, b) => (espTotals[b] || 0) - (espTotals[a] || 0));
                        const OS_CATS = ['OSP', 'Prepagas', 'Particulares'];
                        const osTotals = {};
                        porSemana.forEach(s => { Object.entries(s.byOS || {}).forEach(([o, c]) => { osTotals[o] = (osTotals[o] || 0) + c; }); });
                        return (
                            <div style={{ background: '#fff', border: '1px solid #F1F5F9', borderRadius: '16px', padding: '20px', marginBottom: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: '#1E293B' }}>📅 Consultas por Semana</h3>
                                    <span style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600 }}>{porSemana.length} semanas · {filtered.length.toLocaleString()} consultas</span>
                                </div>
                                <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
                                        <thead>
                                            <tr style={{ background: 'linear-gradient(135deg, #312E81, #4F46E5)' }}>
                                                <th style={{ padding: '8px 10px', color: '#fff', fontWeight: 700, textAlign: 'left', minWidth: '100px', position: 'sticky', left: 0, background: '#3730A3', zIndex: 2 }}>Semana</th>
                                                {sortedEsps.map(esp => (
                                                    <th key={esp} style={{ padding: '8px 6px', color: '#fff', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap', fontSize: '0.65rem' }}>
                                                        {esp.length > 12 ? esp.substring(0, 10) + '…' : esp}
                                                    </th>
                                                ))}
                                                <th style={{ padding: '8px 10px', color: '#FDE68A', fontWeight: 800, textAlign: 'center', borderLeft: '2px solid rgba(255,255,255,0.2)' }}>TOTAL</th>
                                                {OS_CATS.map(os => (
                                                    <th key={os} style={{ padding: '8px 6px', color: '#A5F3FC', fontWeight: 600, textAlign: 'center', fontSize: '0.65rem', borderLeft: os === 'OSP' ? '2px solid rgba(255,255,255,0.2)' : 'none' }}>{os}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {porSemana.map((s, idx) => (
                                                <tr key={s.semana} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                                                    <td style={{ padding: '6px 10px', fontWeight: 700, color: '#4F46E5', borderRight: '2px solid #E2E8F0', position: 'sticky', left: 0, background: idx % 2 === 0 ? '#fff' : '#FAFAFA', zIndex: 1 }}>
                                                        {formatWeek(s.semana)}
                                                    </td>
                                                    {sortedEsps.map(esp => {
                                                        const val = s.byEsp[esp] || 0;
                                                        const maxInCol = Math.max(...porSemana.map(r => r.byEsp[esp] || 0), 1);
                                                        return (
                                                            <td key={esp} style={{ padding: '6px 6px', textAlign: 'center', fontWeight: val > 0 ? 700 : 400, color: val > 0 ? '#1E293B' : '#D1D5DB', background: val > 0 ? `rgba(79,70,229,${(val / maxInCol) * 0.15})` : 'transparent' }}>
                                                                {val || '—'}
                                                            </td>
                                                        );
                                                    })}
                                                    <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 800, color: '#1E293B', background: '#F8FAFC', borderLeft: '2px solid #E2E8F0', borderRight: '2px solid #E2E8F0' }}>{s.total}</td>
                                                    {OS_CATS.map(os => {
                                                        const val = s.byOS?.[os] || 0;
                                                        return (
                                                            <td key={os} style={{ padding: '6px 6px', textAlign: 'center', fontWeight: val > 0 ? 700 : 400, color: val > 0 ? '#0E7490' : '#D1D5DB', borderLeft: os === 'OSP' ? '2px solid #E2E8F0' : 'none' }}>
                                                                {val || '—'}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr style={{ background: 'linear-gradient(135deg, #F1F5F9, #E2E8F0)' }}>
                                                <td style={{ padding: '8px 10px', fontWeight: 800, color: '#1E293B', borderRight: '2px solid #CBD5E1', position: 'sticky', left: 0, background: '#E2E8F0', zIndex: 1 }}>TOTAL</td>
                                                {sortedEsps.map(esp => (
                                                    <td key={esp} style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 800, color: '#4F46E5' }}>{espTotals[esp] || 0}</td>
                                                ))}
                                                <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 900, color: '#1E293B', fontSize: '0.82rem', borderLeft: '2px solid #CBD5E1', borderRight: '2px solid #CBD5E1' }}>
                                                    {porSemana.reduce((sum, w) => sum + w.total, 0).toLocaleString()}
                                                </td>
                                                {OS_CATS.map(os => (
                                                    <td key={os} style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 800, color: '#0E7490', borderLeft: os === 'OSP' ? '2px solid #CBD5E1' : 'none' }}>{osTotals[os] || 0}</td>
                                                ))}
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        );
                    })()}

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
                            if (colField === 'especialidad') return normalizeEsp(r);
                            if (colField === 'agenda') return r.agenda?.trim() || 'OTRO';
                            if (colField === 'tipo_visita') return r.tipo_visita?.trim() || 'OTRO';
                            return r.grupo_agenda?.trim() || 'OTRO';
                        };

                        // Get all unique column values sorted by frequency
                        const colCounts = {};
                        filtered.forEach(r => { const v = getColVal(r); colCounts[v] = (colCounts[v] || 0) + 1; });
                        const allCols = Object.entries(colCounts).sort((a, b) => b[1] - a[1]).map(([k]) => k);
                        const visibleCols = allCols.filter(c => !colsOcultas.has(c));

                        // Build pivot: dateKey -> OS -> col -> count
                        const pivot = {};
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
                            const os = normalizeOS(r.cliente);
                            const col = getColVal(r);

                            if (!pivot[key]) pivot[key] = {};
                            if (!pivot[key][os]) pivot[key][os] = { total: 0, cols: {} };
                            pivot[key][os].total++;
                            pivot[key][os].cols[col] = (pivot[key][os].cols[col] || 0) + 1;
                        });

                        const OS_ORDER = ['OSP', 'Prepagas', 'Particulares'];
                        const OS_STYLES = {
                            OSP: { label: 'OSP', color: '#0369A1', bg: '#E0F2FE', headerBg: '#0284C7' },
                            Prepagas: { label: 'PREPAGAS', color: '#7C3AED', bg: '#F3E8FF', headerBg: '#7C3AED' },
                            Particulares: { label: 'PARTICULAR', color: '#EA580C', bg: '#FFF7ED', headerBg: '#EA580C' },
                        };

                        const dateKeys = Object.keys(pivot).sort();

                        // Build flat rows for rendering
                        const flatRows = [];
                        dateKeys.forEach(dateKey => {
                            OS_ORDER.forEach((os, osIdx) => {
                                const data = pivot[dateKey]?.[os] || { total: 0, cols: {} };
                                flatRows.push({ dateKey, os, isFirst: osIdx === 0, total: data.total, cols: data.cols });
                            });
                        });

                        // Grand totals per OS
                        const osTotals = {};
                        let grandTotal = 0;
                        OS_ORDER.forEach(os => {
                            osTotals[os] = { total: 0, cols: {} };
                            dateKeys.forEach(dateKey => {
                                const data = pivot[dateKey]?.[os];
                                if (data) {
                                    osTotals[os].total += data.total;
                                    grandTotal += data.total;
                                    visibleCols.forEach(c => { osTotals[os].cols[c] = (osTotals[os].cols[c] || 0) + (data.cols[c] || 0); });
                                }
                            });
                        });

                        // Column totals (all OS combined)
                        const colTotals = {};
                        visibleCols.forEach(c => {
                            colTotals[c] = OS_ORDER.reduce((sum, os) => sum + (osTotals[os].cols[c] || 0), 0);
                        });

                        const formatRowLabel = (key) => {
                            if (matrizAgrupar === 'semana') {
                                const s = new Date(key + 'T12:00:00');
                                const e = new Date(s); e.setDate(e.getDate() + 6);
                                return `${s.getDate()}/${s.getMonth() + 1} - ${e.getDate()}/${e.getMonth() + 1}`;
                            }
                            return formatDate(key);
                        };

                        // Date totals for the rowSpan cell
                        const dateTotals = {};
                        dateKeys.forEach(dk => {
                            dateTotals[dk] = OS_ORDER.reduce((sum, os) => sum + (pivot[dk]?.[os]?.total || 0), 0);
                        });

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
                                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: '#1E293B' }}>📋 Matriz de Consultas por Obra Social</h3>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
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
                                                <th style={{ padding: '8px 8px', color: '#fff', fontWeight: 700, textAlign: 'left', minWidth: '80px' }}>
                                                    OS
                                                </th>
                                                {visibleCols.map(col => (
                                                    <th key={col} style={{ padding: '8px 6px', color: '#fff', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap', fontSize: '0.65rem' }}>
                                                        {col.length > 14 ? col.substring(0, 12) + '…' : col}
                                                    </th>
                                                ))}
                                                <th style={{ padding: '8px 10px', color: '#FDE68A', fontWeight: 800, textAlign: 'center', minWidth: '50px', borderLeft: '2px solid rgba(255,255,255,0.2)' }}>TOTAL</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {flatRows.map((row, idx) => {
                                                const isWeekend = matrizAgrupar === 'dia' && [0, 6].includes(new Date(row.dateKey + 'T12:00:00').getDay());
                                                const osS = OS_STYLES[row.os];
                                                const groupBg = isWeekend ? '#EEF2FF' : '#fff';
                                                const borderTop = row.isFirst && idx > 0 ? '2px solid #E2E8F0' : 'none';
                                                return (
                                                    <tr key={`${row.dateKey}_${row.os}`} style={{ background: groupBg, borderTop }}>
                                                        {row.isFirst && (
                                                            <td rowSpan={OS_ORDER.length} style={{
                                                                padding: '6px 10px', fontWeight: isWeekend ? 700 : 600,
                                                                color: isWeekend ? '#4F46E5' : '#334155',
                                                                position: 'sticky', left: 0, zIndex: 1,
                                                                background: groupBg,
                                                                borderRight: '2px solid #E2E8F0',
                                                                verticalAlign: 'middle',
                                                                borderTop,
                                                            }}>
                                                                {formatRowLabel(row.dateKey)}
                                                            </td>
                                                        )}
                                                        <td style={{
                                                            padding: '3px 8px', fontWeight: 700, fontSize: '0.62rem',
                                                            color: osS.color, background: osS.bg,
                                                            borderRight: '1px solid #E2E8F0',
                                                            whiteSpace: 'nowrap', letterSpacing: '0.3px',
                                                        }}>
                                                            {osS.label}
                                                        </td>
                                                        {visibleCols.map(col => {
                                                            const val = row.cols[col] || 0;
                                                            return (
                                                                <td key={col} style={{
                                                                    padding: '3px 6px', textAlign: 'center',
                                                                    fontWeight: val > 0 ? 600 : 400,
                                                                    color: val > 0 ? '#1E293B' : '#E2E8F0',
                                                                    fontSize: '0.72rem',
                                                                }}>
                                                                    {val || ''}
                                                                </td>
                                                            );
                                                        })}
                                                        <td style={{
                                                            padding: '3px 10px', textAlign: 'center', fontWeight: 700,
                                                            color: row.total > 0 ? osS.color : '#E2E8F0',
                                                            background: '#F8FAFC', borderLeft: '2px solid #E2E8F0',
                                                        }}>
                                                            {row.total || ''}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            {OS_ORDER.map((os, osIdx) => {
                                                const osS = OS_STYLES[os];
                                                const t = osTotals[os];
                                                return (
                                                    <tr key={os} style={{ background: osS.bg, borderTop: osIdx === 0 ? '3px solid #4F46E5' : '1px solid #E2E8F0' }}>
                                                        {osIdx === 0 && (
                                                            <td rowSpan={OS_ORDER.length} style={{
                                                                padding: '8px 10px', fontWeight: 900, color: '#1E293B',
                                                                position: 'sticky', left: 0, background: '#E2E8F0',
                                                                borderRight: '2px solid #CBD5E1', zIndex: 1,
                                                                verticalAlign: 'middle', fontSize: '0.78rem',
                                                            }}>TOTAL</td>
                                                        )}
                                                        <td style={{
                                                            padding: '5px 8px', fontWeight: 800, fontSize: '0.65rem',
                                                            color: '#fff', background: osS.headerBg,
                                                            whiteSpace: 'nowrap', letterSpacing: '0.3px',
                                                        }}>
                                                            {osS.label}
                                                        </td>
                                                        {visibleCols.map(col => (
                                                            <td key={col} style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 800, color: osS.color }}>
                                                                {t.cols[col] || ''}
                                                            </td>
                                                        ))}
                                                        <td style={{ padding: '5px 10px', textAlign: 'center', fontWeight: 900, color: osS.color, fontSize: '0.78rem', borderLeft: '2px solid #CBD5E1' }}>
                                                            {t.total}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        );
                    })()}

                    {/* ═══════ REGISTROS (paginated table) ═══════ */}
                    {vista === 'registros' && (
                        <div style={{ background: '#fff', border: '1px solid #F1F5F9', borderRadius: '16px', padding: '20px', marginBottom: '20px' }}>
                            {/* Header + search */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                                <div>
                                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: '#1E293B' }}>🗂️ Registros Individuales</h3>
                                    <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>{regTotal.toLocaleString()} registros encontrados</span>
                                </div>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                        <Search size={14} style={{ position: 'absolute', left: '10px', color: '#94A3B8' }} />
                                        <input
                                            type="text" placeholder="Buscar..." value={regSearch}
                                            onChange={e => handleRegSearch(e.target.value)}
                                            style={{ padding: '7px 10px 7px 30px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '0.75rem', width: '200px', outline: 'none' }}
                                        />
                                    </div>
                                    <select value={regColFilter} onChange={e => { setRegColFilter(e.target.value); setRegPage(0); }} style={{
                                        padding: '7px 8px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '0.7rem', fontWeight: 600, background: '#fff', cursor: 'pointer',
                                    }}>
                                        <option value="todos">Todas las columnas</option>
                                        <option value="paciente">Paciente</option>
                                        <option value="cliente">Obra Social</option>
                                        <option value="especialidad">Especialidad</option>
                                        <option value="agenda">Agenda</option>
                                        <option value="tipo_visita">Tipo Visita</option>
                                    </select>
                                    <select value={regSize} onChange={e => { setRegSize(Number(e.target.value)); setRegPage(0); }} style={{
                                        padding: '7px 8px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '0.7rem', fontWeight: 600, background: '#fff', cursor: 'pointer',
                                    }}>
                                        <option value={10}>10 por pág</option>
                                        <option value={50}>50 por pág</option>
                                        <option value={100}>100 por pág</option>
                                    </select>
                                </div>
                            </div>

                            {/* OS Category filter buttons */}
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <Building2 size={13} style={{ color: '#94A3B8' }} />
                                <button onClick={() => { setFiltroOS('todas'); setRegPage(0); }} style={{
                                    padding: '4px 10px', borderRadius: '8px', border: '1px solid',
                                    fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer',
                                    background: filtroOS === 'todas' ? '#1E293B' : '#fff',
                                    color: filtroOS === 'todas' ? '#fff' : '#64748B',
                                    borderColor: filtroOS === 'todas' ? '#1E293B' : '#E2E8F0',
                                }}>Todas</button>
                                {Object.entries(OS_CATEGORIES).map(([key, cfg]) => (
                                    <button key={key} onClick={() => { setFiltroOS(filtroOS === key ? 'todas' : key); setRegPage(0); }} style={{
                                        padding: '4px 10px', borderRadius: '8px', border: '1px solid',
                                        fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer',
                                        background: filtroOS === key ? cfg.color : cfg.bg,
                                        color: filtroOS === key ? '#fff' : cfg.color,
                                        borderColor: filtroOS === key ? cfg.color : cfg.border,
                                    }}>{cfg.label}</button>
                                ))}
                            </div>

                            {/* Active column filters display */}
                            {Object.entries(colFilters).some(([, s]) => s.size > 0) && (
                                <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <Filter size={12} style={{ color: '#4F46E5' }} />
                                    <span style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 600 }}>Filtros activos:</span>
                                    {Object.entries(colFilters).map(([colKey, selectedSet]) => {
                                        if (selectedSet.size === 0) return null;
                                        const labels = { especialidad: 'Especialidad', agenda: 'Agenda', tipo_visita: 'Tipo Visita', cliente: 'Obra Social' };
                                        return (
                                            <div key={colKey} style={{
                                                display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px',
                                                borderRadius: '6px', background: '#EEF2FF', border: '1px solid #C7D2FE',
                                                fontSize: '0.65rem', fontWeight: 600, color: '#4F46E5',
                                            }}>
                                                {labels[colKey]}: {selectedSet.size} sel.
                                                <button onClick={() => { setColFilters(prev => { const next = { ...prev }; delete next[colKey]; return next; }); setRegPage(0); }}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4F46E5', fontWeight: 800, fontSize: '0.7rem', padding: '0 2px' }}>×</button>
                                            </div>
                                        );
                                    })}
                                    <button onClick={() => { setColFilters({}); setRegPage(0); }}
                                        style={{ padding: '3px 8px', borderRadius: '6px', border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer' }}>
                                        Limpiar todos
                                    </button>
                                </div>
                            )}

                            {/* Table */}
                            <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #E2E8F0', overflow: 'visible' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
                                    <thead>
                                        <tr style={{ background: '#F8FAFC' }}>
                                            {[
                                                { key: 'fecha', label: 'Fecha', filterable: false },
                                                { key: 'hora', label: 'Hora', filterable: false },
                                                { key: 'paciente', label: 'Paciente', filterable: false },
                                                { key: 'dni', label: 'DNI', filterable: false },
                                                { key: 'cliente', label: 'Obra Social', filterable: true },
                                                { key: 'categoria_os', label: 'Cat.', filterable: false },
                                                { key: 'traido', label: 'Traído', filterable: false },
                                                { key: 'especialidad', label: 'Especialidad', filterable: true },
                                                { key: 'agenda', label: 'Agenda', filterable: true },
                                                { key: 'tipo_visita', label: 'Tipo Visita', filterable: true },
                                                { key: 'nhc', label: 'NHC', filterable: false },
                                            ].map(col => {
                                                const isActive = colFilters[col.key]?.size > 0;
                                                return (
                                                    <th key={col.key} style={{
                                                        padding: '8px 8px', textAlign: 'left', fontWeight: 700, color: '#475569',
                                                        borderBottom: '2px solid #E2E8F0', whiteSpace: 'nowrap',
                                                        fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.03em',
                                                        position: 'relative',
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            {col.label}
                                                            {col.filterable && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (colFilterOpen === col.key) { setColFilterOpen(null); setColFilterSearch(''); }
                                                                        else { setColFilterOpen(col.key); setColFilterSearch(''); fetchColFilterOptions(col.key); }
                                                                    }}
                                                                    style={{
                                                                        background: isActive ? '#4F46E5' : 'transparent', border: 'none', cursor: 'pointer',
                                                                        padding: '2px', borderRadius: '4px', display: 'flex', alignItems: 'center',
                                                                        color: isActive ? '#fff' : '#94A3B8',
                                                                    }}
                                                                >
                                                                    <ChevronDown size={12} />
                                                                </button>
                                                            )}
                                                            {isActive && (
                                                                <span style={{
                                                                    fontSize: '0.55rem', fontWeight: 800, color: '#fff', background: '#4F46E5',
                                                                    borderRadius: '50%', width: '14px', height: '14px', display: 'flex',
                                                                    alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                                                                }}>
                                                                    {colFilters[col.key].size}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {/* Dropdown */}
                                                        {col.filterable && colFilterOpen === col.key && (
                                                            <div ref={colFilterRef} style={{
                                                                position: 'absolute', top: '100%', left: 0, zIndex: 50,
                                                                background: '#fff', borderRadius: '10px', border: '1px solid #E2E8F0',
                                                                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', width: '220px',
                                                                maxHeight: '320px', display: 'flex', flexDirection: 'column',
                                                            }} onClick={e => e.stopPropagation()}>
                                                                {/* Search in dropdown */}
                                                                <div style={{ padding: '8px', borderBottom: '1px solid #F1F5F9' }}>
                                                                    <input
                                                                        type="text" placeholder="Buscar..." value={colFilterSearch}
                                                                        onChange={e => setColFilterSearch(e.target.value)}
                                                                        autoFocus
                                                                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '0.72rem', outline: 'none' }}
                                                                    />
                                                                </div>
                                                                {/* Select all / Clear */}
                                                                <div style={{ display: 'flex', gap: '4px', padding: '6px 8px', borderBottom: '1px solid #F1F5F9' }}>
                                                                    <button onClick={() => {
                                                                        const all = new Set(colFilterOptions[col.key] || []);
                                                                        setColFilters(prev => ({ ...prev, [col.key]: all }));
                                                                        setRegPage(0);
                                                                    }} style={{ flex: 1, padding: '4px', borderRadius: '4px', border: '1px solid #E2E8F0', background: '#F8FAFC', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 600, color: '#4F46E5' }}>
                                                                        Todos
                                                                    </button>
                                                                    <button onClick={() => {
                                                                        setColFilters(prev => { const next = { ...prev }; delete next[col.key]; return next; });
                                                                        setRegPage(0);
                                                                    }} style={{ flex: 1, padding: '4px', borderRadius: '4px', border: '1px solid #E2E8F0', background: '#F8FAFC', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 600, color: '#DC2626' }}>
                                                                        Limpiar
                                                                    </button>
                                                                </div>
                                                                {/* Options list */}
                                                                <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
                                                                    {(colFilterOptions[col.key] || [])
                                                                        .filter(v => !colFilterSearch || v.toLowerCase().includes(colFilterSearch.toLowerCase()))
                                                                        .map(val => {
                                                                            const isChecked = colFilters[col.key]?.has(val);
                                                                            return (
                                                                                <label key={val} style={{
                                                                                    display: 'flex', alignItems: 'center', gap: '8px',
                                                                                    padding: '5px 10px', cursor: 'pointer', fontSize: '0.72rem',
                                                                                    color: '#334155', fontWeight: isChecked ? 700 : 400,
                                                                                    background: isChecked ? '#EEF2FF' : 'transparent',
                                                                                }} onMouseOver={e => e.currentTarget.style.background = '#F8FAFC'}
                                                                                   onMouseOut={e => e.currentTarget.style.background = isChecked ? '#EEF2FF' : 'transparent'}>
                                                                                    <input
                                                                                        type="checkbox" checked={!!isChecked}
                                                                                        onChange={() => {
                                                                                            setColFilters(prev => {
                                                                                                const set = new Set(prev[col.key] || []);
                                                                                                if (set.has(val)) set.delete(val); else set.add(val);
                                                                                                const next = { ...prev };
                                                                                                if (set.size === 0) delete next[col.key]; else next[col.key] = set;
                                                                                                return next;
                                                                                            });
                                                                                            setRegPage(0);
                                                                                        }}
                                                                                        style={{ width: '14px', height: '14px', accentColor: '#4F46E5', cursor: 'pointer' }}
                                                                                    />
                                                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
                                                                                </label>
                                                                            );
                                                                        })}
                                                                    {(colFilterOptions[col.key] || []).filter(v => !colFilterSearch || v.toLowerCase().includes(colFilterSearch.toLowerCase())).length === 0 && (
                                                                        <div style={{ padding: '12px', textAlign: 'center', color: '#94A3B8', fontSize: '0.7rem' }}>Sin resultados</div>
                                                                    )}
                                                                </div>
                                                                {/* Apply button */}
                                                                <div style={{ padding: '8px', borderTop: '1px solid #F1F5F9' }}>
                                                                    <button onClick={() => { setColFilterOpen(null); setColFilterSearch(''); }}
                                                                        style={{ width: '100%', padding: '6px', borderRadius: '6px', border: 'none', background: '#4F46E5', color: '#fff', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>
                                                                        Aplicar
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </th>
                                                );
                                            })}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {regLoading ? (
                                            <tr><td colSpan={11} style={{ padding: '30px', textAlign: 'center', color: '#94A3B8' }}><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Cargando...</td></tr>
                                        ) : regRows.length === 0 ? (
                                            <tr><td colSpan={11} style={{ padding: '30px', textAlign: 'center', color: '#94A3B8' }}>Sin resultados</td></tr>
                                        ) : regRows.map((r, i) => {
                                            const osCat = normalizeOS(r.cliente);
                                            const osCfg = OS_CATEGORIES[osCat] || OS_CATEGORIES.Particulares;
                                            const isRes = isResidencia(r);
                                            return (
                                            <tr key={r.id_visita || i} style={{ background: isRes ? '#F5F3FF' : (i % 2 === 0 ? '#fff' : '#FAFAFA'), borderBottom: '1px solid #F1F5F9' }}>
                                                <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', color: '#64748B', fontWeight: 600 }}>{r.fecha_visita ? (() => { const [y,m,d] = r.fecha_visita.split('-'); return `${d}/${m}`; })() : '—'}</td>
                                                <td style={{ padding: '6px 6px', whiteSpace: 'nowrap', color: '#64748B', fontSize: '0.66rem' }}>
                                                    {r.hora_visita ? r.hora_visita.substring(0, 5) : '—'}
                                                    {isRes && (
                                                        <span style={{
                                                            marginLeft: '4px', padding: '1px 5px', borderRadius: '4px',
                                                            fontSize: '0.55rem', fontWeight: 800, background: '#7C3AED',
                                                            color: '#fff', verticalAlign: 'middle',
                                                        }}>RES</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '6px 8px', fontWeight: 600, color: '#1E293B', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.paciente || '—'}</td>
                                                <td style={{ padding: '6px 8px', color: '#64748B' }}>{r.nif || '—'}</td>
                                                <td style={{ padding: '6px 8px', color: '#334155', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.cliente}>{r.cliente || '—'}</td>
                                                <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                                                    <span style={{
                                                        padding: '2px 8px', borderRadius: '6px', fontSize: '0.6rem', fontWeight: 700,
                                                        background: osCfg.bg, color: osCfg.color, border: `1px solid ${osCfg.border}`,
                                                        whiteSpace: 'nowrap',
                                                    }}>{osCfg.label}</span>
                                                </td>
                                                <td style={{ padding: '4px 4px', minWidth: '120px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <input
                                                            type="text"
                                                            value={traidoEdits[r.id_visita] ?? r.notas_traido ?? ''}
                                                            onChange={e => handleTraidoChange(r.id_visita, e.target.value)}
                                                            onBlur={() => {
                                                                const val = traidoEdits[r.id_visita];
                                                                if (val !== undefined && val !== (r.notas_traido || '')) {
                                                                    if (traidoTimers.current[r.id_visita]) clearTimeout(traidoTimers.current[r.id_visita]);
                                                                    saveTraido(r.id_visita, val);
                                                                }
                                                            }}
                                                            placeholder="—"
                                                            style={{
                                                                width: '100%', padding: '4px 6px', borderRadius: '6px',
                                                                border: '1px solid #E2E8F0', fontSize: '0.68rem',
                                                                background: '#FAFAFA', outline: 'none',
                                                                transition: 'border-color 0.15s, background 0.15s',
                                                            }}
                                                            onFocus={e => { e.target.style.borderColor = '#4F46E5'; e.target.style.background = '#fff'; }}
                                                            onBlurCapture={e => { e.target.style.borderColor = '#E2E8F0'; e.target.style.background = '#FAFAFA'; }}
                                                        />
                                                        {traidoSaving[r.id_visita] && <Loader size={11} style={{ color: '#94A3B8', animation: 'spin 1s linear infinite', flexShrink: 0 }} />}
                                                        {traidoSaved[r.id_visita] && <Check size={11} style={{ color: '#16A34A', flexShrink: 0 }} />}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '6px 8px' }}>
                                                    <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '0.62rem', fontWeight: 700, background: (ESP_COLORS[r.visita_especialidad?.trim()] || '#94A3B8') + '18', color: ESP_COLORS[r.visita_especialidad?.trim()] || '#64748B' }}>{r.visita_especialidad || '—'}</span>
                                                </td>
                                                <td style={{ padding: '6px 8px', color: '#64748B', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.agenda || '—'}</td>
                                                <td style={{ padding: '6px 8px', color: '#64748B', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.tipo_visita || '—'}</td>
                                                <td style={{ padding: '6px 8px', color: '#94A3B8', textAlign: 'center' }}>{r.nhc || '—'}</td>
                                            </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap', gap: '8px' }}>
                                <span style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 600 }}>
                                    Mostrando {regTotal === 0 ? 0 : regPage * regSize + 1}–{Math.min((regPage + 1) * regSize, regTotal)} de {regTotal.toLocaleString()}
                                </span>
                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                    <button disabled={regPage === 0} onClick={() => setRegPage(p => p - 1)} style={{
                                        width: '30px', height: '30px', borderRadius: '8px', border: '1px solid #E2E8F0',
                                        background: regPage === 0 ? '#F8FAFC' : '#fff', cursor: regPage === 0 ? 'default' : 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: regPage === 0 ? '#D1D5DB' : '#4F46E5',
                                    }}><ChevronLeft size={14} /></button>
                                    {(() => {
                                        const totalPages = Math.ceil(regTotal / regSize);
                                        const pages = [];
                                        for (let p = Math.max(0, regPage - 2); p < Math.min(totalPages, regPage + 3); p++) pages.push(p);
                                        return pages.map(p => (
                                            <button key={p} onClick={() => setRegPage(p)} style={{
                                                width: '30px', height: '30px', borderRadius: '8px', border: '1px solid',
                                                fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
                                                background: p === regPage ? '#4F46E5' : '#fff',
                                                color: p === regPage ? '#fff' : '#64748B',
                                                borderColor: p === regPage ? '#4F46E5' : '#E2E8F0',
                                            }}>{p + 1}</button>
                                        ));
                                    })()}
                                    <button disabled={regPage >= Math.ceil(regTotal / regSize) - 1} onClick={() => setRegPage(p => p + 1)} style={{
                                        width: '30px', height: '30px', borderRadius: '8px', border: '1px solid #E2E8F0',
                                        background: regPage >= Math.ceil(regTotal / regSize) - 1 ? '#F8FAFC' : '#fff',
                                        cursor: regPage >= Math.ceil(regTotal / regSize) - 1 ? 'default' : 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: regPage >= Math.ceil(regTotal / regSize) - 1 ? '#D1D5DB' : '#4F46E5',
                                    }}><ChevronRight size={14} /></button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
