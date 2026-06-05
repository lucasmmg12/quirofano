/**
 * FacturacionPanel.jsx — Control de Facturación Internada
 * 
 * Vista para el equipo de Facturación que muestra altas traspasadas.
 * Columnas editables: Responsable FAC, Estado FAC.
 * Muestra indicador de facturación automática (PDV 21/31).
 * Expandible con líneas de concepto de facturacion_internada.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    Search, RefreshCw, ChevronRight, ChevronDown, Clock, Calendar,
    Filter, X, Loader2, FileText, User, Building2,
    Stethoscope, Download, AlertTriangle, CheckCircle2, Receipt,
    ListFilter, ChevronUp,
} from 'lucide-react';
import {
    fetchAltasFacturacion, updateEstadoFac, updateResponsableFac,
    fetchFacturacionDetalle, FACTURACION_ESTADOS,
} from '../services/altasService';
import SalusSyncButton from './SalusSyncButton';

// ── Analistas de Facturación (extraídos de SALUS) ──
const ANALISTAS_FAC = [
    'ILLANES, PAOLA GISELLE',
    'DONA, MARIA INES',
    'PALMA JUAREZ, MONICA PATRICIA',
    'CASTILLA AMOR, LORENA PAOLA',
    'CARRIZO ALVARADO, ROMINA LUCILA',
    'GIMENEZ PEÑALOZA, VICTORIA AGUSTINA',
    'LEOZ, FEDERICO ANIBAL',
    'PAREDES, FLORENCIA',
    'OROPEL, SANDRA VIVIANA',
    'ESCAÑUELA, ROSANA CARINA',
];

// ── Helpers ──
function formatDate(d) {
    if (!d) return '—';
    const dt = new Date(d + 'T12:00:00');
    return dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(d) {
    if (!d) return '—';
    const dt = new Date(d);
    return dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function daysBetween(from, to) {
    if (!from || !to) return null;
    const a = new Date(from + 'T12:00:00');
    const b = new Date(to + 'T12:00:00');
    return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

// Apellido corto para mostrar en tabla
function shortName(fullName) {
    if (!fullName) return '—';
    const parts = fullName.split(',');
    return parts[0]?.trim() || fullName;
}

export default function FacturacionPanel({ addToast, currentUser }) {
    const [altas, setAltas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState(null);
    const [expandedDetalle, setExpandedDetalle] = useState(null); // líneas de concepto
    const [detalleLoading, setDetalleLoading] = useState(false);
    const [processing, setProcessing] = useState(false);

    // Dropdowns
    const [estadoDropdownId, setEstadoDropdownId] = useState(null);
    const [responsableDropdownId, setResponsableDropdownId] = useState(null);
    const [dropdownAnchor, setDropdownAnchor] = useState(null);

    // Filtros
    const today = new Date();
    const firstDayOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    const [fromDate, setFromDate] = useState(firstDayOfMonth);
    const [toDate, setToDate] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterEstado, setFilterEstado] = useState('all');
    const [filterResponsable, setFilterResponsable] = useState('all');

    // ── Carga de datos ──
    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const data = await fetchAltasFacturacion({
                fromDate,
                toDate: toDate || undefined,
                search: searchTerm,
            });
            setAltas(data);
        } catch (err) {
            addToast?.('Error al cargar facturación: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [fromDate, toDate, searchTerm, addToast]);

    useEffect(() => { loadData(); }, [loadData]);

    // ── Filtrado ──
    const filteredAltas = useMemo(() => {
        let result = altas;

        if (filterEstado !== 'all') {
            result = result.filter(a => (a.estado_fac || 'Pendiente') === filterEstado);
        }
        if (filterResponsable !== 'all') {
            result = result.filter(a => a.responsable_fac === filterResponsable);
        }

        return result;
    }, [altas, filterEstado, filterResponsable]);

    // ── KPIs ──
    const kpis = useMemo(() => {
        const total = altas.length;
        const pendientes = altas.filter(a => !a.estado_fac || a.estado_fac === 'Pendiente').length;
        const enProceso = altas.filter(a => a.estado_fac === 'En proceso').length;
        const facturadas = altas.filter(a => a.estado_fac === 'Facturada' || a.facturada).length;
        const devueltas = altas.filter(a => a.estado_fac === 'Devuelta').length;
        const autoFacturadas = altas.filter(a => a.facturada).length;
        return { total, pendientes, enProceso, facturadas, devueltas, autoFacturadas };
    }, [altas]);

    // ── Responsables únicos ──
    const uniqueResponsables = useMemo(() => {
        const set = new Set(altas.map(a => a.responsable_fac).filter(Boolean));
        return [...set].sort();
    }, [altas]);

    // ── Handlers ──
    const handleEstadoChange = async (id, newEstado) => {
        setProcessing(true);
        try {
            const updated = await updateEstadoFac(id, newEstado, currentUser?.nombre || 'operador');
            setAltas(prev => prev.map(a => a.id === id ? { ...a, ...updated } : a));
            addToast?.(`Estado actualizado: ${newEstado}`, 'success');
        } catch (err) {
            addToast?.('Error: ' + err.message, 'error');
        } finally {
            setProcessing(false);
            setEstadoDropdownId(null);
            setDropdownAnchor(null);
        }
    };

    const handleResponsableChange = async (id, responsable) => {
        setProcessing(true);
        try {
            const updated = await updateResponsableFac(id, responsable);
            setAltas(prev => prev.map(a => a.id === id ? { ...a, ...updated } : a));
            addToast?.(`Responsable asignado: ${shortName(responsable)}`, 'success');
        } catch (err) {
            addToast?.('Error: ' + err.message, 'error');
        } finally {
            setProcessing(false);
            setResponsableDropdownId(null);
            setDropdownAnchor(null);
        }
    };

    // ── Expandir detalle de facturación ──
    const handleToggleExpand = async (alta) => {
        if (expandedId === alta.id) {
            setExpandedId(null);
            setExpandedDetalle(null);
            return;
        }
        setExpandedId(alta.id);
        setDetalleLoading(true);
        try {
            const detalle = await fetchFacturacionDetalle(alta.numero_admision);
            setExpandedDetalle(detalle);
        } catch (err) {
            setExpandedDetalle([]);
        } finally {
            setDetalleLoading(false);
        }
    };

    // ── Abrir dropdown con posición ──
    const openDropdown = (e, id, type) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        setDropdownAnchor({ id, type, rect });
        if (type === 'estado') {
            setEstadoDropdownId(id);
            setResponsableDropdownId(null);
        } else {
            setResponsableDropdownId(id);
            setEstadoDropdownId(null);
        }
    };

    // Close dropdowns on outside click
    useEffect(() => {
        const handler = () => { setEstadoDropdownId(null); setResponsableDropdownId(null); setDropdownAnchor(null); };
        window.addEventListener('click', handler);
        return () => window.removeEventListener('click', handler);
    }, []);

    return (
        <div className="content no-print animate-fade-in" style={{ padding: '20px 24px' }}>
            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: 'var(--neutral-800)' }}>
                        <Receipt size={22} style={{ verticalAlign: 'middle', marginRight: '8px', color: '#6366F1' }} />
                        Control de Facturación Internada
                    </h2>
                    <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--neutral-500)' }}>
                        Fichas traspasadas desde Administración — PDV 21/31
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <SalusSyncButton />
                    <button onClick={loadData} disabled={loading}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '8px 14px', borderRadius: '8px',
                            background: '#EEF2FF', border: '1px solid #C7D2FE',
                            color: '#4F46E5', fontSize: '0.82rem', fontWeight: 600,
                            cursor: 'pointer',
                        }}>
                        <RefreshCw size={14} className={loading ? 'spin' : ''} />
                        Actualizar
                    </button>
                </div>
            </div>

            {/* ── KPIs ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                {[
                    { label: 'Total', value: kpis.total, color: '#6366F1', bg: '#EEF2FF' },
                    { label: 'Pendientes', value: kpis.pendientes, color: '#94A3B8', bg: '#F8FAFC' },
                    { label: 'En proceso', value: kpis.enProceso, color: '#F59E0B', bg: '#FFFBEB' },
                    { label: 'Facturadas', value: kpis.facturadas, color: '#10B981', bg: '#ECFDF5' },
                    { label: 'Devueltas', value: kpis.devueltas, color: '#EF4444', bg: '#FEF2F2' },
                    { label: 'Auto (SALUS)', value: kpis.autoFacturadas, color: '#8B5CF6', bg: '#F5F3FF' },
                ].map(k => (
                    <div key={k.label} style={{
                        padding: '14px 16px', borderRadius: '12px',
                        background: k.bg, border: `1px solid ${k.color}22`,
                    }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: k.color }}>{k.value}</div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: k.color, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
                    </div>
                ))}
            </div>

            {/* ── Filtros ── */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', background: 'var(--neutral-50)', border: '1px solid var(--neutral-200)' }}>
                    <Calendar size={14} style={{ color: 'var(--neutral-400)' }} />
                    <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                        style={{ border: 'none', background: 'transparent', fontSize: '0.82rem', color: 'var(--neutral-700)', outline: 'none' }} />
                    <span style={{ color: 'var(--neutral-400)', fontSize: '0.75rem' }}>a</span>
                    <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                        style={{ border: 'none', background: 'transparent', fontSize: '0.82rem', color: 'var(--neutral-700)', outline: 'none' }} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', background: 'var(--neutral-50)', border: '1px solid var(--neutral-200)', flex: '1 1 200px', maxWidth: '320px' }}>
                    <Search size={14} style={{ color: 'var(--neutral-400)' }} />
                    <input type="text" placeholder="Buscar paciente, admisión..."
                        value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                        style={{ border: 'none', background: 'transparent', fontSize: '0.82rem', color: 'var(--neutral-700)', outline: 'none', width: '100%' }} />
                    {searchTerm && (
                        <X size={14} style={{ cursor: 'pointer', color: 'var(--neutral-400)' }} onClick={() => setSearchTerm('')} />
                    )}
                </div>

                <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--neutral-200)', fontSize: '0.82rem', background: 'var(--neutral-50)', color: 'var(--neutral-700)' }}>
                    <option value="all">Todos los estados</option>
                    {Object.entries(FACTURACION_ESTADOS).map(([k, v]) => (
                        <option key={k} value={k}>{v.icon} {v.label}</option>
                    ))}
                </select>

                <select value={filterResponsable} onChange={e => setFilterResponsable(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--neutral-200)', fontSize: '0.82rem', background: 'var(--neutral-50)', color: 'var(--neutral-700)' }}>
                    <option value="all">Todos los analistas</option>
                    {uniqueResponsables.map(r => (
                        <option key={r} value={r}>{shortName(r)}</option>
                    ))}
                </select>

                <span style={{ fontSize: '0.78rem', color: 'var(--neutral-500)', fontWeight: 600 }}>
                    {filteredAltas.length} ficha{filteredAltas.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* ── Tabla ── */}
            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
                    <Loader2 size={32} className="spin" style={{ color: '#6366F1' }} />
                </div>
            ) : filteredAltas.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--neutral-400)' }}>
                    <Receipt size={48} strokeWidth={1.2} />
                    <h3 style={{ margin: '12px 0 4px' }}>Sin fichas</h3>
                    <p style={{ fontSize: '0.85rem' }}>No hay fichas traspasadas en el rango seleccionado.</p>
                </div>
            ) : (
                <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid var(--neutral-200)', background: 'var(--card-bg, #fff)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <thead>
                            <tr style={{ background: 'var(--neutral-50)' }}>
                                <th style={thStyle}></th>
                                <th style={thStyle}>Admisión</th>
                                <th style={thStyle}>Paciente</th>
                                <th style={thStyle}>Cliente</th>
                                <th style={thStyle}>Ingreso</th>
                                <th style={thStyle}>Alta</th>
                                <th style={thStyle}>Días</th>
                                <th style={{ ...thStyle, textAlign: 'center' }}>Facturada</th>
                                <th style={{ ...thStyle, minWidth: '130px' }}>Responsable FAC</th>
                                <th style={{ ...thStyle, minWidth: '120px' }}>Estado FAC</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAltas.map(alta => {
                                const isExpanded = expandedId === alta.id;
                                const estadoFac = alta.estado_fac || 'Pendiente';
                                const estadoConfig = FACTURACION_ESTADOS[estadoFac] || FACTURACION_ESTADOS['Pendiente'];
                                const isDevuelta = estadoFac === 'Devuelta';
                                const dias = daysBetween(alta.fecha_ingreso, alta.fecha_alta);

                                return (
                                    <>
                                        <tr key={alta.id}
                                            onClick={() => handleToggleExpand(alta)}
                                            style={{
                                                cursor: 'pointer',
                                                borderBottom: '1px solid var(--neutral-100)',
                                                background: isDevuelta ? '#FEF2F2' : isExpanded ? 'var(--neutral-50)' : 'transparent',
                                                transition: 'background 0.15s',
                                            }}
                                            onMouseOver={e => { if (!isDevuelta) e.currentTarget.style.background = 'var(--neutral-50)'; }}
                                            onMouseOut={e => { if (!isDevuelta && !isExpanded) e.currentTarget.style.background = 'transparent'; }}
                                        >
                                            <td style={tdStyle}>
                                                {isExpanded
                                                    ? <ChevronDown size={14} style={{ color: '#6366F1' }} />
                                                    : <ChevronRight size={14} style={{ color: 'var(--neutral-400)' }} />}
                                            </td>
                                            <td style={tdStyle}>
                                                <span style={{
                                                    fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 600,
                                                    padding: '2px 6px', borderRadius: '4px',
                                                    background: '#EEF2FF', color: '#4338CA',
                                                }}>
                                                    {alta.numero_admision || '—'}
                                                </span>
                                            </td>
                                            <td style={{ ...tdStyle, fontWeight: 600, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {alta.paciente}
                                            </td>
                                            <td style={{ ...tdStyle, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--neutral-500)' }}>
                                                {alta.cliente || '—'}
                                            </td>
                                            <td style={tdStyle}>{formatDate(alta.fecha_ingreso)}</td>
                                            <td style={tdStyle}>{formatDate(alta.fecha_alta)}</td>
                                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                {dias !== null ? (
                                                    <span style={{
                                                        padding: '2px 6px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 700,
                                                        background: dias > 15 ? '#FEF2F2' : dias > 7 ? '#FFFBEB' : '#ECFDF5',
                                                        color: dias > 15 ? '#DC2626' : dias > 7 ? '#D97706' : '#059669',
                                                    }}>
                                                        {dias}d
                                                    </span>
                                                ) : '—'}
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                {alta.facturada ? (
                                                    <span title={`Facturada por ${alta.usuario_facturo || '?'} — ${alta.cantidad_facturas || 0} factura(s)`}
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                            padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 700,
                                                            background: '#ECFDF5', color: '#059669',
                                                        }}>
                                                        <CheckCircle2 size={12} /> Sí ({alta.cantidad_facturas || 0})
                                                    </span>
                                                ) : (
                                                    <span style={{ color: 'var(--neutral-400)', fontSize: '0.75rem' }}>—</span>
                                                )}
                                            </td>

                                            {/* Responsable FAC — dropdown */}
                                            <td style={tdStyle} onClick={e => e.stopPropagation()}>
                                                <div style={{ position: 'relative' }}>
                                                    <button onClick={(e) => openDropdown(e, alta.id, 'responsable')}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: '4px',
                                                            padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem',
                                                            border: '1px solid var(--neutral-200)', background: 'var(--neutral-50)',
                                                            cursor: 'pointer', color: alta.responsable_fac ? 'var(--neutral-700)' : 'var(--neutral-400)',
                                                            fontWeight: alta.responsable_fac ? 600 : 400,
                                                            width: '100%', justifyContent: 'space-between',
                                                        }}>
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {alta.responsable_fac ? shortName(alta.responsable_fac) : 'Asignar'}
                                                        </span>
                                                        <ChevronDown size={12} />
                                                    </button>
                                                    {responsableDropdownId === alta.id && (
                                                        <div style={{
                                                            position: 'absolute', top: '100%', left: 0, zIndex: 50,
                                                            background: '#fff', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                                            border: '1px solid var(--neutral-200)', minWidth: '220px', maxHeight: '280px', overflow: 'auto',
                                                        }}>
                                                            <div onClick={() => handleResponsableChange(alta.id, null)}
                                                                style={{ ...dropdownItemStyle, color: 'var(--neutral-400)', fontStyle: 'italic' }}>
                                                                Sin asignar
                                                            </div>
                                                            {ANALISTAS_FAC.map(a => (
                                                                <div key={a} onClick={() => handleResponsableChange(alta.id, a)}
                                                                    style={{
                                                                        ...dropdownItemStyle,
                                                                        fontWeight: alta.responsable_fac === a ? 700 : 400,
                                                                        background: alta.responsable_fac === a ? '#EEF2FF' : 'transparent',
                                                                    }}>
                                                                    {a}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Estado FAC — dropdown */}
                                            <td style={tdStyle} onClick={e => e.stopPropagation()}>
                                                <div style={{ position: 'relative' }}>
                                                    <button onClick={(e) => openDropdown(e, alta.id, 'estado')}
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                            padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem',
                                                            border: `1px solid ${estadoConfig.color}44`,
                                                            background: estadoConfig.bg, color: estadoConfig.color,
                                                            fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                                                        }}>
                                                        {estadoConfig.icon} {estadoConfig.label}
                                                        <ChevronDown size={11} />
                                                    </button>
                                                    {estadoDropdownId === alta.id && (
                                                        <div style={{
                                                            position: 'absolute', top: '100%', right: 0, zIndex: 50,
                                                            background: '#fff', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                                            border: '1px solid var(--neutral-200)', minWidth: '160px', overflow: 'hidden',
                                                        }}>
                                                            {Object.entries(FACTURACION_ESTADOS).map(([k, v]) => (
                                                                <div key={k} onClick={() => handleEstadoChange(alta.id, k)}
                                                                    style={{
                                                                        ...dropdownItemStyle,
                                                                        fontWeight: estadoFac === k ? 700 : 400,
                                                                        background: estadoFac === k ? v.bg : 'transparent',
                                                                        color: estadoFac === k ? v.color : 'var(--neutral-700)',
                                                                    }}>
                                                                    <span>{v.icon}</span> {v.label}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>

                                        {/* ── Detalle expandido ── */}
                                        {isExpanded && (
                                            <tr key={`${alta.id}-detail`} className="animate-fade-in">
                                                <td colSpan={10} style={{ padding: 0, border: 'none' }}>
                                                    <div style={{
                                                        background: 'var(--neutral-50)',
                                                        borderLeft: '3px solid #6366F1',
                                                        margin: '0 8px 8px 24px',
                                                        borderRadius: '0 8px 8px 0',
                                                        padding: '16px',
                                                    }}>
                                                        {/* Info de la alta */}
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                                                            <div>
                                                                <div style={labelStyle}>Doctor</div>
                                                                <div style={valueStyle}>{alta.doctor || '—'}</div>
                                                            </div>
                                                            <div>
                                                                <div style={labelStyle}>Especialidad</div>
                                                                <div style={valueStyle}>{alta.especialidad || '—'}</div>
                                                            </div>
                                                            <div>
                                                                <div style={labelStyle}>Proceso</div>
                                                                <div style={valueStyle}>{alta.proceso || '—'}</div>
                                                            </div>
                                                            <div>
                                                                <div style={labelStyle}>Motivo alta</div>
                                                                <div style={valueStyle}>{alta.motivo_alta || '—'}</div>
                                                            </div>
                                                            <div>
                                                                <div style={labelStyle}>Traspasada</div>
                                                                <div style={valueStyle}>{formatDateTime(alta.traspasada_at)} por {alta.traspasada_por || '—'}</div>
                                                            </div>
                                                            {alta.facturada && (
                                                                <div>
                                                                    <div style={labelStyle}>Facturada en SALUS</div>
                                                                    <div style={valueStyle}>✅ {formatDateTime(alta.facturada_at)} — {alta.usuario_facturo || '—'}</div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Observaciones */}
                                                        {alta.observaciones && (
                                                            <div style={{ marginBottom: '16px' }}>
                                                                <div style={labelStyle}>Observaciones</div>
                                                                <div style={{
                                                                    padding: '10px 12px', borderRadius: '8px',
                                                                    background: '#fff', border: '1px solid var(--neutral-200)',
                                                                    fontSize: '0.8rem', color: 'var(--neutral-600)',
                                                                    whiteSpace: 'pre-wrap', maxHeight: '120px', overflow: 'auto',
                                                                }}>
                                                                    {alta.observaciones}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Líneas de facturación */}
                                                        <div>
                                                            <div style={{ ...labelStyle, marginBottom: '8px' }}>
                                                                <Receipt size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                                                                Conceptos Facturados
                                                            </div>
                                                            {detalleLoading ? (
                                                                <div style={{ padding: '12px', textAlign: 'center' }}>
                                                                    <Loader2 size={16} className="spin" /> Cargando...
                                                                </div>
                                                            ) : (!expandedDetalle || expandedDetalle.length === 0) ? (
                                                                <div style={{ padding: '12px', textAlign: 'center', color: 'var(--neutral-400)', fontSize: '0.8rem' }}>
                                                                    Sin líneas de facturación registradas en SALUS
                                                                </div>
                                                            ) : (
                                                                <div style={{ borderRadius: '8px', border: '1px solid var(--neutral-200)', overflow: 'hidden' }}>
                                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                                                        <thead>
                                                                            <tr style={{ background: '#F8FAFC' }}>
                                                                                <th style={{ ...thDetailStyle }}>Nº Factura</th>
                                                                                <th style={{ ...thDetailStyle }}>PDV</th>
                                                                                <th style={{ ...thDetailStyle }}>Fecha</th>
                                                                                <th style={{ ...thDetailStyle, textAlign: 'left' }}>Concepto</th>
                                                                                <th style={{ ...thDetailStyle }}>Usuario</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {expandedDetalle.map((d, i) => (
                                                                                <tr key={d.id || i} style={{ borderTop: '1px solid var(--neutral-100)' }}>
                                                                                    <td style={tdDetailStyle}>
                                                                                        <span style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>{d.numero_factura}</span>
                                                                                    </td>
                                                                                    <td style={{ ...tdDetailStyle, textAlign: 'center' }}>
                                                                                        <span style={{
                                                                                            padding: '1px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700,
                                                                                            background: d.pdv === '21' ? '#DBEAFE' : '#E0E7FF',
                                                                                            color: d.pdv === '21' ? '#1D4ED8' : '#4338CA',
                                                                                        }}>
                                                                                            PDV {d.pdv}
                                                                                        </span>
                                                                                    </td>
                                                                                    <td style={tdDetailStyle}>{formatDate(d.fecha_factura)}</td>
                                                                                    <td style={{ ...tdDetailStyle, textAlign: 'left', color: 'var(--neutral-700)' }}>{d.concepto}</td>
                                                                                    <td style={{ ...tdDetailStyle, color: 'var(--neutral-500)' }}>{shortName(d.usuario_factura)}</td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ── Styles ──
const thStyle = {
    padding: '10px 12px', textAlign: 'left', fontWeight: 700, fontSize: '0.72rem',
    textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--neutral-500)',
    borderBottom: '2px solid var(--neutral-200)', whiteSpace: 'nowrap',
};

const tdStyle = {
    padding: '8px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap',
};

const thDetailStyle = {
    padding: '6px 10px', textAlign: 'center', fontWeight: 600, fontSize: '0.68rem',
    textTransform: 'uppercase', color: 'var(--neutral-500)',
};

const tdDetailStyle = {
    padding: '6px 10px', textAlign: 'center', verticalAlign: 'middle',
};

const dropdownItemStyle = {
    padding: '8px 12px', fontSize: '0.8rem', cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: '6px',
    transition: 'background 0.1s',
};

const labelStyle = {
    fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.05em', color: 'var(--neutral-400)', marginBottom: '4px',
};

const valueStyle = {
    fontSize: '0.82rem', color: 'var(--neutral-700)', fontWeight: 500,
};
