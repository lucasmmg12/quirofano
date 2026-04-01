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
} from 'lucide-react';
import { fetchAltas, updateAltaEstado, updateAltaNotas, getAltasStats, ALTA_ESTADOS } from '../services/altasService';
import { fetchAsignaciones, matchAsignacion } from '../services/asignacionService';
import SalusSyncButton from './SalusSyncButton';

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
    const [stats, setStats] = useState({});
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

    // ── Carga de datos ──
    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const [data, statsData, criteriosData] = await Promise.all([
                fetchAltas({ fromDate, toDate: toDate || undefined, estado: filterEstado, search: searchTerm }),
                getAltasStats(fromDate, toDate || undefined),
                fetchAsignaciones().catch(() => []),
            ]);
            setAltas(data);
            setStats(statsData);
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

    // ── KPIs ──
    const total = stats._total || 0;

    // ════════════════════════════════════════════════
    // RENDER
    // ════════════════════════════════════════════════
    return (
        <div className="content no-print" style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            
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
                    const count = stats[key] || 0;
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
            <div className="cart animate-fade-in" style={{ overflow: 'visible' }}>
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
                                    <th className="cart__th" style={{ width: '120px' }}>Estado</th>
                                    <th className="cart__th">Paciente</th>
                                    <th className="cart__th">Obra Social</th>
                                    <th className="cart__th">Especialidad</th>
                                    <th className="cart__th">Médico</th>
                                    <th className="cart__th" style={{ width: '90px' }}>Ingreso</th>
                                    <th className="cart__th" style={{ width: '90px' }}>Alta</th>
                                    <th className="cart__th" style={{ width: '90px' }}>Responsable</th>
                                    <th className="cart__th" style={{ width: '80px' }}>Tutor</th>
                                </tr>
                            </thead>
                            <tbody>
                                {altas.filter(alta => {
                                    // Filtrar médicos qsoft / profesional,chequeo
                                    const doc = (alta.doctor || '').toLowerCase().trim();
                                    if (doc === 'qsoft' || doc === 'profesional,chequeo' || doc === 'profesional, chequeo') return false;
                                    return true;
                                }).map(alta => {
                                    // Si control_adm = 'Sí', forzar estado visual verde (Alta ADM)
                                    const effectiveEstado = alta.control_adm_finalizado === 'Sí' ? 'Alta Adm' : alta.estado;
                                    const cfg = ALTA_ESTADOS[effectiveEstado] || ALTA_ESTADOS['Procesada'];
                                    const isExpanded = expandedId === alta.id;
                                    const asignacion = matchAsignacion(criterios, alta.cliente, alta.especialidad, alta.proceso);

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
                                                            padding: '4px 10px', borderRadius: 'var(--radius-full)',
                                                            fontSize: '0.72rem', fontWeight: 700,
                                                            background: cfg.bg, color: cfg.color,
                                                            border: `1px solid ${cfg.color}25`,
                                                            cursor: 'pointer', transition: 'all 0.15s',
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                        onMouseOver={e => { e.currentTarget.style.boxShadow = `0 0 0 2px ${cfg.color}30`; }}
                                                        onMouseOut={e => { e.currentTarget.style.boxShadow = 'none'; }}
                                                        title="Cambiar estado"
                                                    >
                                                        {cfg.icon} {cfg.label}
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
                                                                {Object.entries(ALTA_ESTADOS).map(([key, scfg]) => (
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
                                                                ))}
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
                                                {formatDate(alta.fecha_alta)}
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
                                            {/* Tutor (auto-matched) */}
                                            <td className="cart__td">
                                                {asignacion?.tutor ? (
                                                    <span style={{
                                                        display: 'inline-block', padding: '2px 8px', borderRadius: 'var(--radius-full)',
                                                        background: '#F5F3FF', color: '#6D28D9',
                                                        fontSize: '0.68rem', fontWeight: 600,
                                                    }}>{asignacion.tutor}</span>
                                                ) : <span style={{ color: 'var(--neutral-300)', fontSize: '0.75rem' }}>—</span>}
                                            </td>

                                        </tr>,

                                        // ── Expanded Detail ──
                                        isExpanded && (
                                            <tr key={`${alta.id}-detail`}>
                                                <td colSpan={10} style={{
                                                    padding: 0, background: 'var(--neutral-50)',
                                                    borderLeft: `4px solid ${cfg.color}`,
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
                                                                    { label: 'Control ADM', value: alta.control_adm_finalizado, icon: '✅' },
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
        </div>
    );
}
