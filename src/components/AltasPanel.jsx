/**
 * AltasPanel.jsx — Control de Altas Administrativas
 * 
 * Vista tabular con estados coloreados, detalle expandible con observaciones,
 * filtros por fecha/estado/búsqueda, y KPIs resumidos.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Search, RefreshCw, ChevronRight, Clock, Calendar,
    Filter, X, Loader2, FileText, User, Building2,
    Stethoscope, ChevronDown, ChevronUp, StickyNote, Save,
    ListFilter,
} from 'lucide-react';
import { fetchAltas, updateAltaEstado, updateAltaNotas, ALTA_ESTADOS } from '../services/altasService';
import { fetchAsignaciones, matchAsignacion } from '../services/asignacionService';
import SalusSyncButton from './SalusSyncButton';
import AltasMetricsPanel from './AltasMetricsPanel';

// ── Helpers ──
function formatDate(d) {
    if (!d) return '—';
    const dt = new Date(d + 'T12:00:00');
    return dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function daysBetween(from, to) {
    if (!from || !to) return null;
    const a = new Date(from + 'T12:00:00');
    const b = new Date(to + 'T12:00:00');
    return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

export default function AltasPanel({ addToast, currentUser }) {
    // ── State ──
    const [altas, setAltas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState(null);
    const [statusDropdownId, setStatusDropdownId] = useState(null);
    const [processing, setProcessing] = useState(false);

    // Filtros
    const today = new Date();
    const firstDayOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    const [fromDate, setFromDate] = useState(firstDayOfMonth);
    const [toDate, setToDate] = useState('');
    const [filterEstado, setFilterEstado] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    
    // Notas internas
    const [editingNotas, setEditingNotas] = useState(null);
    const [notasText, setNotasText] = useState('');
    const [criterios, setCriterios] = useState([]);

    // ── Filtros por columna (tipo Excel) ──
    const [columnFilters, setColumnFilters] = useState({});
    const [activeFilterCol, setActiveFilterCol] = useState(null);
    const [filterSearch, setFilterSearch] = useState('');

    // ── Ordenamiento fecha ingreso ──
    const [ingresoSort, setIngresoSort] = useState('desc'); // 'desc' = recientes primero | 'asc' = antiguas primero

    // ── Tab activo ──
    const [activeTab, setActiveTab] = useState('tabla'); // 'tabla' | 'metricas'

    // ── Carga de datos ──
    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const [data, criteriosData] = await Promise.all([
                fetchAltas({ fromDate, toDate: toDate || undefined, estado: filterEstado, search: searchTerm }),
                fetchAsignaciones().catch(() => []),
            ]);
            setAltas(data);
            setCriterios(criteriosData);
        } catch (err) {
            addToast?.('Error al cargar altas: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [fromDate, toDate, filterEstado, searchTerm, addToast]);

    useEffect(() => { loadData(); }, [loadData]);

    // ── Handlers ──
    const handleEstadoChange = async (id, nuevoEstado) => {
        try {
            setProcessing(true);
            await updateAltaEstado(id, nuevoEstado, currentUser?.nombre || 'operador');
            addToast?.(`Estado → ${ALTA_ESTADOS[nuevoEstado]?.label || nuevoEstado}`, 'success');
            setStatusDropdownId(null);
            loadData();
        } catch (err) {
            addToast?.('Error: ' + err.message, 'error');
        } finally {
            setProcessing(false);
        }
    };

    const handleSaveNotas = async (id) => {
        try {
            setProcessing(true);
            await updateAltaNotas(id, notasText);
            addToast?.('Notas guardadas', 'success');
            setEditingNotas(null);
            loadData();
        } catch (err) {
            addToast?.('Error: ' + err.message, 'error');
        } finally {
            setProcessing(false);
        }
    };

    // ── KPIs (calculados desde effectiveEstado del frontend, no del campo crudo de la DB) ──
    const localStats = useMemo(() => {
        const s = {};
        for (const key of Object.keys(ALTA_ESTADOS)) s[key] = 0;
        preFilteredAltas.forEach(a => {
            if (a._effectiveEstado && s[a._effectiveEstado] !== undefined) s[a._effectiveEstado]++;
        });
        s._total = preFilteredAltas.length;
        return s;
    }, [preFilteredAltas]);
    const total = localStats._total || 0;

    // ── Filtros por columna helpers ──
    const toggleColumnFilter = (col) => {
        setActiveFilterCol(prev => prev === col ? null : col);
        setFilterSearch('');
    };

    const setFilterValues = (col, values) => {
        setColumnFilters(prev => {
            const next = { ...prev };
            if (!values || values.size === 0) {
                delete next[col];
            } else {
                next[col] = values;
            }
            return next;
        });
    };

    const toggleFilterValue = (col, value) => {
        setColumnFilters(prev => {
            const current = prev[col] ? new Set(prev[col]) : new Set();
            if (current.has(value)) {
                current.delete(value);
            } else {
                current.add(value);
            }
            const next = { ...prev };
            if (current.size === 0) delete next[col];
            else next[col] = current;
            return next;
        });
    };

    const clearColumnFilter = (col) => {
        setColumnFilters(prev => {
            const next = { ...prev };
            delete next[col];
            return next;
        });
        setActiveFilterCol(null);
    };

    const clearAllColumnFilters = () => {
        setColumnFilters({});
        setActiveFilterCol(null);
    };

    // Obtener datos pre-filtrados (sin filtro de columna, para extraer valores únicos)
    const preFilteredAltas = useMemo(() => {
        return altas.filter(alta => {
            const doc = (alta.doctor || '').toLowerCase().trim();
            if (doc.includes('qsoft') || doc.includes('profesional') && doc.includes('chequeo')) return false;
            // Particulares: si paciente = obra social, no nos interesa
            const pac = (alta.paciente || '').trim().toUpperCase();
            const os = (alta.cliente || '').trim().toUpperCase();
            if (pac && os && pac === os) return false;
            return true;
        }).map(alta => {
            const asignacion = matchAsignacion(criterios, alta.cliente, alta.especialidad, alta.proceso);
            const ctrlAdm = (alta.control_adm_finalizado || '').trim().toLowerCase();
            const isAltaAdm = ctrlAdm === 'sí' || ctrlAdm === 'si';
            // Alta Adm es EXCLUSIVO de SALUS: solo verde si control_adm = Sí
            // Si estado='Alta Adm' pero control_adm='No' → dato obsoleto, limpiar
            const effectiveEstado = isAltaAdm
                ? 'Alta Adm'
                : (alta.estado === 'Alta Adm' ? null : (alta.estado || null));
            return { ...alta, _effectiveEstado: effectiveEstado, _responsable: asignacion?.responsable || '' };
        });
    }, [altas, criterios]);

    // Extraer valores únicos por columna
    const uniqueValues = useMemo(() => {
        const cols = {
            estado: new Set(),
            cliente: new Set(),
            especialidad: new Set(),
            doctor: new Set(),
            responsable: new Set(),
        };
        preFilteredAltas.forEach(a => {
            const ecfg = ALTA_ESTADOS[a._effectiveEstado];
            if (ecfg) cols.estado.add(ecfg.label);
            if (a.cliente) cols.cliente.add(a.cliente);
            if (a.especialidad) cols.especialidad.add(a.especialidad);
            if (a.doctor) cols.doctor.add(a.doctor);
            if (a._responsable) cols.responsable.add(a._responsable);
        });
        return Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, [...v].sort()]));
    }, [preFilteredAltas]);

    // Aplicar filtros de columna
    const filteredAltas = useMemo(() => {
        return preFilteredAltas.filter(a => {
            if (columnFilters.estado) {
                const ecfg = ALTA_ESTADOS[a._effectiveEstado];
                if (!ecfg || !columnFilters.estado.has(ecfg.label)) return false;
            }
            if (columnFilters.cliente && !columnFilters.cliente.has(a.cliente)) return false;
            if (columnFilters.especialidad && !columnFilters.especialidad.has(a.especialidad)) return false;
            if (columnFilters.doctor && !columnFilters.doctor.has(a.doctor)) return false;
            if (columnFilters.responsable && !columnFilters.responsable.has(a._responsable)) return false;
            return true;
        });
    }, [preFilteredAltas, columnFilters]);

    // ── Ordenamiento por fecha ingreso ──
    const sortedAltas = useMemo(() => {
        const sorted = [...filteredAltas];
        sorted.sort((a, b) => {
            const dateA = a.fecha_ingreso || '';
            const dateB = b.fecha_ingreso || '';
            return ingresoSort === 'asc'
                ? dateA.localeCompare(dateB)
                : dateB.localeCompare(dateA);
        });
        return sorted;
    }, [filteredAltas, ingresoSort]);

    const activeFilterCount = Object.keys(columnFilters).length;

    // ── FilterHeader Component ──
    const FilterHeader = ({ label, col, width }) => {
        const isActive = !!columnFilters[col];
        const isOpen = activeFilterCol === col;
        const values = uniqueValues[col] || [];
        const filtered = filterSearch
            ? values.filter(v => v.toLowerCase().includes(filterSearch.toLowerCase()))
            : values;

        return (
            <th className="cart__th" style={{ width, position: 'relative', userSelect: 'none' }}>
                <div
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                    onClick={() => toggleColumnFilter(col)}
                >
                    {label}
                    <ListFilter size={12} style={{
                        color: isActive ? '#4F46E5' : 'var(--neutral-300)',
                        transition: 'color 0.15s',
                        flexShrink: 0,
                    }} />
                    {isActive && (
                        <span style={{
                            width: '6px', height: '6px', borderRadius: '50%',
                            background: '#4F46E5', flexShrink: 0,
                        }} />
                    )}
                </div>

                {isOpen && (
                    <>
                        <div
                            onClick={() => setActiveFilterCol(null)}
                            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }}
                        />
                        <div style={{
                            position: 'absolute', top: '100%', left: 0, zIndex: 999,
                            marginTop: '2px', minWidth: '200px', maxWidth: '280px',
                            background: '#fff', borderRadius: '10px',
                            boxShadow: '0 8px 30px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
                            padding: '8px', animation: 'fadeIn 0.15s ease-out',
                        }}>
                            {/* Search dentro del filtro */}
                            <div style={{ position: 'relative', marginBottom: '6px' }}>
                                <Search size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--neutral-400)' }} />
                                <input
                                    type="text"
                                    placeholder="Buscar..."
                                    value={filterSearch}
                                    onChange={e => setFilterSearch(e.target.value)}
                                    onClick={e => e.stopPropagation()}
                                    style={{
                                        width: '100%', padding: '5px 8px 5px 26px',
                                        border: '1px solid var(--neutral-200)', borderRadius: '6px',
                                        fontSize: '0.72rem', outline: 'none',
                                    }}
                                    autoFocus
                                />
                            </div>
                            {/* Botones rápidos */}
                            <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                                <button
                                    onClick={e => { e.stopPropagation(); setFilterValues(col, new Set(filtered)); }}
                                    style={{
                                        flex: 1, padding: '3px', borderRadius: '4px',
                                        border: '1px solid var(--neutral-200)', background: '#F9FAFB',
                                        fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer',
                                        color: 'var(--neutral-600)',
                                    }}
                                >Todos</button>
                                <button
                                    onClick={e => { e.stopPropagation(); clearColumnFilter(col); }}
                                    style={{
                                        flex: 1, padding: '3px', borderRadius: '4px',
                                        border: '1px solid var(--neutral-200)', background: '#F9FAFB',
                                        fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer',
                                        color: '#DC2626',
                                    }}
                                >Limpiar</button>
                            </div>
                            {/* Lista de valores */}
                            <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                                {filtered.length === 0 ? (
                                    <div style={{ padding: '10px', textAlign: 'center', fontSize: '0.72rem', color: 'var(--neutral-400)' }}>Sin valores</div>
                                ) : filtered.map(val => {
                                    const checked = columnFilters[col] ? columnFilters[col].has(val) : false;
                                    return (
                                        <label
                                            key={val}
                                            onClick={e => e.stopPropagation()}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                padding: '4px 6px', borderRadius: '4px',
                                                cursor: 'pointer', fontSize: '0.73rem', fontWeight: 500,
                                                color: 'var(--neutral-700)', transition: 'background 0.1s',
                                            }}
                                            onMouseOver={e => e.currentTarget.style.background = '#F3F4F6'}
                                            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleFilterValue(col, val)}
                                                style={{ width: '14px', height: '14px', accentColor: '#4F46E5', cursor: 'pointer' }}
                                            />
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}
            </th>
        );
    };

    // ════════════════════════════════════════════════
    // RENDER
    // ════════════════════════════════════════════════
    return (
        <div className="content no-print" style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', overflow: 'auto' }}>
            
            {/* ── Header ── */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexWrap: 'wrap', gap: '12px',
            }}>
                <div>
                    <h2 style={{ 
                        margin: 0, fontSize: '1.35rem', fontWeight: 800,
                        color: 'var(--neutral-800)', letterSpacing: '-0.3px',
                        display: 'flex', alignItems: 'center', gap: '10px',
                    }}>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '10px',
                            background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontSize: '1rem',
                        }}>📋</div>
                        Control de Altas Administrativas
                    </h2>
                    <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--neutral-400)' }}>
                        Gestión del proceso de alta hospitalaria — {total} registros
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <SalusSyncButton onComplete={loadData} addToast={addToast} />
                    <button
                        onClick={loadData}
                        disabled={loading}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            padding: '8px 14px', borderRadius: '10px',
                            background: '#fff', color: 'var(--neutral-600)',
                            border: '1px solid var(--neutral-200)',
                            fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                        onMouseOver={e => { e.currentTarget.style.borderColor = '#6366F1'; e.currentTarget.style.color = '#6366F1'; }}
                        onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--neutral-200)'; e.currentTarget.style.color = 'var(--neutral-600)'; }}
                    >
                        <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                        Actualizar
                    </button>
                </div>
            </div>

            {/* ── Tab Toggle ── */}
            <div style={{
                display: 'flex', gap: '4px', padding: '4px',
                background: '#F3F4F6', borderRadius: '12px', width: 'fit-content',
            }}>
                {[
                    { key: 'tabla', label: '📋 Tabla', icon: null },
                    { key: 'metricas', label: '📊 Métricas BI', icon: null },
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '8px 18px', borderRadius: '8px',
                            background: activeTab === tab.key ? '#fff' : 'transparent',
                            color: activeTab === tab.key ? '#1F2937' : '#6B7280',
                            border: 'none', cursor: 'pointer',
                            fontSize: '0.8rem', fontWeight: activeTab === tab.key ? 700 : 500,
                            boxShadow: activeTab === tab.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                            transition: 'all 0.2s',
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'metricas' ? (
                <AltasMetricsPanel altas={preFilteredAltas} />
            ) : (
            <>

            {/* ── KPI Pills ── */}
            <div style={{
                display: 'flex', gap: '8px', flexWrap: 'wrap',
            }}>
                {/* Total */}
                <button
                    onClick={() => setFilterEstado('all')}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '6px 14px', borderRadius: '20px',
                        background: filterEstado === 'all' ? '#1F2937' : '#F3F4F6',
                        color: filterEstado === 'all' ? '#fff' : '#6B7280',
                        border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700,
                        transition: 'all 0.15s',
                    }}
                >
                    Todos <span style={{ 
                        background: filterEstado === 'all' ? 'rgba(255,255,255,0.2)' : '#E5E7EB',
                        padding: '1px 8px', borderRadius: '10px', 
                    }}>{total}</span>
                </button>
                {Object.entries(ALTA_ESTADOS).map(([key, cfg]) => {
                    const count = localStats[key] || 0;
                    const isActive = filterEstado === key;
                    return (
                        <button
                            key={key}
                            onClick={() => setFilterEstado(isActive ? 'all' : key)}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '5px',
                                padding: '6px 12px', borderRadius: '20px',
                                background: isActive ? cfg.color : cfg.bg,
                                color: isActive ? '#fff' : cfg.color,
                                border: `1px solid ${isActive ? cfg.color : cfg.color + '25'}`,
                                cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700,
                                transition: 'all 0.15s',
                                opacity: count === 0 ? 0.5 : 1,
                            }}
                        >
                            {cfg.icon} {cfg.label}
                            <span style={{
                                background: isActive ? 'rgba(255,255,255,0.25)' : cfg.color + '15',
                                padding: '1px 7px', borderRadius: '10px',
                                fontSize: '0.68rem',
                            }}>{count}</span>
                        </button>
                    );
                })}
            </div>

            {/* ── Filtros ── */}
            <div style={{
                display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap',
                padding: '10px 14px', borderRadius: '12px',
                background: '#FAFAFA', border: '1px solid var(--neutral-100)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Calendar size={14} color="var(--neutral-400)" />
                    <span style={{ fontSize: '0.75rem', color: 'var(--neutral-500)', fontWeight: 600 }}>F. Ingreso:</span>
                    <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                        style={{
                            padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--neutral-200)',
                            fontSize: '0.78rem', color: 'var(--neutral-700)',
                        }}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--neutral-400)' }}>a</span>
                    <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                        style={{
                            padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--neutral-200)',
                            fontSize: '0.78rem', color: 'var(--neutral-700)',
                        }}
                    />
                </div>
                <div style={{ flex: 1, position: 'relative', minWidth: '200px' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--neutral-400)' }} />
                    <input
                        type="text"
                        placeholder="Buscar paciente, médico, OS, N° admisión..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{
                            width: '100%', padding: '7px 10px 7px 32px',
                            borderRadius: '8px', border: '1px solid var(--neutral-200)',
                            fontSize: '0.8rem', color: 'var(--neutral-700)',
                            transition: 'border-color 0.2s',
                        }}
                        onFocus={e => e.currentTarget.style.borderColor = '#6366F1'}
                        onBlur={e => e.currentTarget.style.borderColor = 'var(--neutral-200)'}
                    />
                </div>
                {(searchTerm || toDate || filterEstado !== 'all') && (
                    <button
                        onClick={() => { setSearchTerm(''); setToDate(''); setFilterEstado('all'); }}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            padding: '5px 10px', borderRadius: '6px',
                            background: '#FEE2E2', color: '#DC2626',
                            border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600,
                        }}
                    >
                        <X size={12} /> Limpiar
                    </button>
                )}
            </div>

            {/* ── Tabla ── */}
            <div className="cart animate-fade-in" style={{ overflow: 'visible', minHeight: 0, flex: '1 1 auto' }}>
                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '10px', color: 'var(--neutral-400)' }}>
                        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Cargando altas...</span>
                    </div>
                ) : altas.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '10px', color: 'var(--neutral-400)' }}>
                        <FileText size={48} strokeWidth={1.2} />
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--neutral-500)' }}>Sin resultados</h3>
                        <p style={{ margin: 0, fontSize: '0.82rem' }}>No hay altas que coincidan con los filtros.</p>
                    </div>
                ) : (
                    <div className="cart__table-wrapper" style={{ overflowX: 'auto' }}>
                        <table className="cart__table" style={{ minWidth: '950px' }}>
                            <thead>
                                <tr>
                                    <th className="cart__th" style={{ width: '30px' }}></th>
                                    <FilterHeader label="Estado" col="estado" width="120px" />
                                    <th className="cart__th">Paciente</th>
                                    <FilterHeader label="Obra Social" col="cliente" />
                                    <FilterHeader label="Especialidad" col="especialidad" />
                                    <FilterHeader label="Médico" col="doctor" />
                                    <th className="cart__th" style={{ width: '100px', userSelect: 'none' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                            Ingreso
                                            <button
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    setIngresoSort(prev => prev === 'desc' ? 'asc' : 'desc');
                                                }}
                                                title={ingresoSort === 'desc' ? 'Ordenar: más antiguas primero' : 'Ordenar: más recientes primero'}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                    width: '20px', height: '20px', borderRadius: '4px',
                                                    border: 'none', background: 'transparent',
                                                    cursor: 'pointer', transition: 'all 0.15s',
                                                    color: '#4F46E5', padding: 0, flexShrink: 0,
                                                }}
                                                onMouseOver={e => e.currentTarget.style.background = '#EEF2FF'}
                                                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                {ingresoSort === 'desc' ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                            </button>
                                        </div>
                                    </th>
                                    <th className="cart__th" style={{ width: '110px' }}>Alta</th>
                                    <FilterHeader label="Responsable" col="responsable" width="90px" />
                                </tr>
                                {activeFilterCount > 0 && (
                                    <tr>
                                        <td colSpan={9} style={{ padding: '4px 10px', background: '#EFF6FF', borderBottom: '1px solid #DBEAFE' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                <ListFilter size={12} color="#4F46E5" />
                                                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#4F46E5' }}>
                                                    {activeFilterCount} filtro{activeFilterCount > 1 ? 's' : ''} activo{activeFilterCount > 1 ? 's' : ''}
                                                </span>
                                                <span style={{ fontSize: '0.68rem', color: 'var(--neutral-400)' }}>—</span>
                                                <span style={{ fontSize: '0.68rem', color: 'var(--neutral-500)' }}>
                                                    {filteredAltas.length} de {preFilteredAltas.length} registros
                                                </span>
                                                <button
                                                    onClick={clearAllColumnFilters}
                                                    style={{
                                                        marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '3px',
                                                        padding: '2px 8px', borderRadius: '4px',
                                                        background: '#FEE2E2', color: '#DC2626',
                                                        border: 'none', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 600,
                                                    }}
                                                >
                                                    <X size={10} /> Quitar filtros
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </thead>
                            <tbody>
                                {sortedAltas.map(alta => {
                                    const effectiveEstado = alta._effectiveEstado;
                                    const cfg = effectiveEstado ? (ALTA_ESTADOS[effectiveEstado] || ALTA_ESTADOS['Procesada']) : null;
                                    const isExpanded = expandedId === alta.id;
                                    const asignacion = { responsable: alta._responsable, tutor: alta._tutor };

                                    return [
                                        // ── Row ──
                                        <tr
                                            key={alta.id}
                                            className="cart__row"
                                            onClick={() => {
                                                setExpandedId(isExpanded ? null : alta.id);
                                                if (!isExpanded) {
                                                    setEditingNotas(null);
                                                }
                                            }}
                                            style={{
                                                cursor: 'pointer', transition: 'background 0.15s',
                                            }}
                                            onMouseOver={e => { if (!isExpanded) e.currentTarget.style.background = 'var(--neutral-50)'; }}
                                            onMouseOut={e => { if (!isExpanded) e.currentTarget.style.background = ''; }}
                                        >
                                            {/* Chevron */}
                                            <td className="cart__td" style={{ textAlign: 'center', padding: '4px' }}>
                                                <ChevronRight size={14} style={{
                                                    color: 'var(--neutral-400)',
                                                    transition: 'transform 0.2s ease',
                                                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                                }} />
                                            </td>
                                            {/* Estado */}
                                            <td className="cart__td" style={{ position: 'relative' }}>
                                                <div style={{ position: 'relative', display: 'inline-block' }}>
                                                    <button
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            setStatusDropdownId(prev => prev === alta.id ? null : alta.id);
                                                        }}
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                            padding: !cfg ? '4px 6px' : '4px 10px',
                                                            borderRadius: 'var(--radius-full)',
                                                            fontSize: '0.72rem', fontWeight: 700,
                                                            background: !cfg ? 'transparent' : cfg.bg,
                                                            color: !cfg ? 'transparent' : cfg.color,
                                                            border: !cfg ? '1px dashed transparent' : `1px solid ${cfg.color}25`,
                                                            cursor: 'pointer', transition: 'all 0.15s',
                                                            whiteSpace: 'nowrap',
                                                            minWidth: !cfg ? '70px' : 'auto',
                                                        }}
                                                        onMouseOver={e => {
                                                            if (!cfg) {
                                                                e.currentTarget.style.borderColor = 'var(--neutral-250, #C5CCD6)';
                                                                e.currentTarget.style.color = 'var(--neutral-400)';
                                                            } else {
                                                                e.currentTarget.style.boxShadow = `0 0 0 2px ${cfg.color}30`;
                                                            }
                                                        }}
                                                        onMouseOut={e => {
                                                            if (!cfg) {
                                                                e.currentTarget.style.borderColor = 'transparent';
                                                                e.currentTarget.style.color = 'transparent';
                                                            } else {
                                                                e.currentTarget.style.boxShadow = 'none';
                                                            }
                                                        }}
                                                        title="Cambiar estado"
                                                    >
                                                        {!cfg ? '—' : <>{cfg.icon} {cfg.label}</>}
                                                    </button>
                                                    {/* Dropdown */}
                                                    {statusDropdownId === alta.id && (
                                                        <>
                                                            <div
                                                                onClick={e => { e.stopPropagation(); setStatusDropdownId(null); }}
                                                                style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 999 }}
                                                            />
                                                            <div style={{
                                                                position: 'absolute', top: '100%', left: 0,
                                                                marginTop: '4px', zIndex: 1000,
                                                                background: '#fff', borderRadius: '10px',
                                                                boxShadow: '0 8px 24px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
                                                                padding: '4px', minWidth: '165px',
                                                                animation: 'fadeIn 0.15s ease-out',
                                                            }}>
                                                                {Object.entries(ALTA_ESTADOS).map(([key, scfg]) => {
                                                                    // Procesada y Alta Adm no son seleccionables manualmente
                                                                    // Alta Adm viene automáticamente de SALUS (control_adm = Sí)
                                                                    if (key === 'Procesada' || key === 'Alta Adm') return null;
                                                                    return (
                                                                        <button
                                                                            key={key}
                                                                            onClick={e => {
                                                                                e.stopPropagation();
                                                                                handleEstadoChange(alta.id, key);
                                                                            }}
                                                                            disabled={processing}
                                                                            style={{
                                                                                display: 'flex', alignItems: 'center', gap: '8px',
                                                                                width: '100%', padding: '7px 12px',
                                                                                border: 'none', borderRadius: '6px',
                                                                                background: alta.estado === key ? scfg.bg : 'transparent',
                                                                                color: scfg.color, cursor: 'pointer',
                                                                                fontSize: '0.76rem', fontWeight: 600,
                                                                                transition: 'background 0.1s',
                                                                                textAlign: 'left',
                                                                            }}
                                                                            onMouseOver={e => e.currentTarget.style.background = scfg.bg}
                                                                            onMouseOut={e => e.currentTarget.style.background = alta.estado === key ? scfg.bg : 'transparent'}
                                                                        >
                                                                            <span>{scfg.icon}</span>
                                                                            <span>{scfg.label}</span>
                                                                            {alta.estado === key && <span style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>✓</span>}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                            {/* Paciente */}
                                            <td className="cart__td" style={{ fontWeight: 600, fontSize: '0.82rem' }}>
                                                {alta.paciente || '—'}
                                            </td>
                                            {/* OS */}
                                            <td className="cart__td" style={{ fontSize: '0.78rem', color: 'var(--neutral-500)' }}>
                                                {alta.cliente || '—'}
                                            </td>
                                            {/* Especialidad */}
                                            <td className="cart__td" style={{ fontSize: '0.78rem', color: 'var(--neutral-500)' }}>
                                                {alta.especialidad || '—'}
                                            </td>
                                            {/* Médico */}
                                            <td className="cart__td" style={{ fontSize: '0.78rem' }}>
                                                {alta.doctor || '—'}
                                            </td>
                                            {/* Fecha Ingreso */}
                                            <td className="cart__td" style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--neutral-500)' }}>
                                                {formatDate(alta.fecha_ingreso)}
                                            </td>
                                            {/* Fecha Alta */}
                                            <td className="cart__td" style={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 600 }}>
                                                {alta.fecha_alta ? formatDate(alta.fecha_alta) : <span style={{ color: '#4F46E5', fontWeight: 700, fontSize: '0.7rem', padding: '2px 6px', background: '#EEF2FF', borderRadius: '4px' }}>Paciente internado</span>}
                                            </td>
                                            {/* Responsable (auto-matched) */}
                                            <td className="cart__td">
                                                {asignacion?.responsable ? (
                                                    <span style={{
                                                        display: 'inline-block', padding: '2px 8px', borderRadius: 'var(--radius-full)',
                                                        background: '#EFF6FF', color: '#1E40AF',
                                                        fontSize: '0.7rem', fontWeight: 700,
                                                    }}>{asignacion.responsable}</span>
                                                ) : <span style={{ color: 'var(--neutral-300)', fontSize: '0.75rem' }}>—</span>}
                                            </td>
                                        </tr>,

                                        // ── Expanded Detail ──
                                        isExpanded && (
                                            <tr key={`${alta.id}-detail`}>
                                                <td colSpan={9} style={{
                                                    padding: 0, background: 'var(--neutral-50)',
                                                    borderLeft: `4px solid ${cfg?.color || '#CBD5E1'}`,
                                                    animation: 'fadeIn 0.2s ease-out',
                                                }}>
                                                    <div style={{
                                                        display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr',
                                                        gap: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)',
                                                    }}>
                                                        {/* COL 1: Datos Adicionales */}
                                                        <div>
                                                            <h4 style={{
                                                                margin: '0 0 10px', fontSize: '0.75rem', fontWeight: 700,
                                                                color: 'var(--neutral-400)', textTransform: 'uppercase', letterSpacing: '0.5px',
                                                            }}>
                                                                📋 Datos Adicionales
                                                            </h4>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                {[
                                                                    { label: 'N° Admisión', value: alta.numero_admision, icon: '🔢' },
                                                                    { label: 'Proceso', value: alta.proceso, icon: '📂' },
                                                                    { label: 'Motivo Alta', value: alta.motivo_alta, icon: '📝' },
                                                                    { label: 'Control ADM', value: alta.control_adm_finalizado === 'Sí' ? 'Sí' : 'No', icon: alta.control_adm_finalizado === 'Sí' ? '✅' : '❌' },
                                                                ].map((item, i) => (
                                                                    <div key={i} style={{ display: 'flex', gap: '8px', fontSize: '0.8rem' }}>
                                                                        <span style={{ width: '22px', textAlign: 'center' }}>{item.icon}</span>
                                                                        <div>
                                                                            <div style={{ fontSize: '0.68rem', color: 'var(--neutral-400)', fontWeight: 600, textTransform: 'uppercase' }}>
                                                                                {item.label}
                                                                            </div>
                                                                            <div style={{ color: 'var(--neutral-700)', fontWeight: 500 }}>
                                                                                {item.value || '—'}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* COL 2: Observaciones (campo extenso) */}
                                                        <div>
                                                            <h4 style={{
                                                                margin: '0 0 10px', fontSize: '0.75rem', fontWeight: 700,
                                                                color: 'var(--neutral-400)', textTransform: 'uppercase', letterSpacing: '0.5px',
                                                            }}>
                                                                💬 Observaciones
                                                            </h4>
                                                            <div style={{
                                                                padding: '12px 14px', borderRadius: '10px',
                                                                background: '#fff', border: '1px solid var(--neutral-150, #E8ECF0)',
                                                                maxHeight: '200px', overflowY: 'auto',
                                                                fontSize: '0.82rem', lineHeight: 1.6,
                                                                color: alta.observaciones ? 'var(--neutral-700)' : 'var(--neutral-400)',
                                                                whiteSpace: 'pre-wrap',
                                                                wordBreak: 'break-word',
                                                            }}>
                                                                {alta.observaciones || 'Sin observaciones registradas.'}
                                                            </div>
                                                        </div>

                                                        {/* COL 3: Notas Internas */}
                                                        <div>
                                                            <h4 style={{
                                                                margin: '0 0 10px', fontSize: '0.75rem', fontWeight: 700,
                                                                color: 'var(--neutral-400)', textTransform: 'uppercase', letterSpacing: '0.5px',
                                                            }}>
                                                                📝 Notas Internas
                                                            </h4>
                                                            {editingNotas === alta.id ? (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                    <textarea
                                                                        value={notasText}
                                                                        onChange={e => setNotasText(e.target.value)}
                                                                        onClick={e => e.stopPropagation()}
                                                                        placeholder="Escribir nota interna..."
                                                                        style={{
                                                                            width: '100%', minHeight: '100px', padding: '10px 12px',
                                                                            borderRadius: '8px', border: '1px solid #6366F150',
                                                                            fontSize: '0.82rem', resize: 'vertical',
                                                                            fontFamily: 'inherit', lineHeight: 1.5,
                                                                        }}
                                                                        autoFocus
                                                                    />
                                                                    <div style={{ display: 'flex', gap: '6px' }}>
                                                                        <button
                                                                            onClick={e => { e.stopPropagation(); handleSaveNotas(alta.id); }}
                                                                            disabled={processing}
                                                                            style={{
                                                                                display: 'flex', alignItems: 'center', gap: '5px',
                                                                                padding: '6px 12px', borderRadius: '6px',
                                                                                background: '#6366F1', color: '#fff',
                                                                                border: 'none', cursor: 'pointer',
                                                                                fontSize: '0.75rem', fontWeight: 600,
                                                                            }}
                                                                        >
                                                                            <Save size={13} /> Guardar
                                                                        </button>
                                                                        <button
                                                                            onClick={e => { e.stopPropagation(); setEditingNotas(null); }}
                                                                            style={{
                                                                                padding: '6px 12px', borderRadius: '6px',
                                                                                background: '#F3F4F6', color: '#6B7280',
                                                                                border: 'none', cursor: 'pointer',
                                                                                fontSize: '0.75rem', fontWeight: 600,
                                                                            }}
                                                                        >
                                                                            Cancelar
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div
                                                                    onClick={e => {
                                                                        e.stopPropagation();
                                                                        setEditingNotas(alta.id);
                                                                        setNotasText(alta.notas_internas || '');
                                                                    }}
                                                                    style={{
                                                                        padding: '12px 14px', borderRadius: '10px',
                                                                        background: '#fff', border: '1px dashed var(--neutral-200)',
                                                                        minHeight: '80px', cursor: 'text',
                                                                        fontSize: '0.82rem', lineHeight: 1.6,
                                                                        color: alta.notas_internas ? 'var(--neutral-700)' : 'var(--neutral-400)',
                                                                        whiteSpace: 'pre-wrap',
                                                                        transition: 'border-color 0.2s',
                                                                    }}
                                                                    onMouseOver={e => e.currentTarget.style.borderColor = '#6366F150'}
                                                                    onMouseOut={e => e.currentTarget.style.borderColor = 'var(--neutral-200)'}
                                                                >
                                                                    {alta.notas_internas || 'Clic para agregar nota interna...'}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        ),
                                    ];
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
            )}
        </div>
    );
}
