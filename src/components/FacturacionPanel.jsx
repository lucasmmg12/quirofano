/**
 * FacturacionPanel.jsx — Control de Facturación Internada
 * 
 * Vista para el equipo de Facturación que muestra altas traspasadas.
 * Columnas editables: Responsable FAC, Estado FAC.
 * Muestra indicador de facturación automática (PDV 21/31).
 * Expandible con líneas de concepto de facturacion_internada.
 * 
 * Incluye:
 * - Carrito de devolución (Facturación → Control de Altas)
 * - PDF con firma digital
 * - Historial de devoluciones
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    Search, RefreshCw, ChevronRight, ChevronDown, Clock, Calendar,
    Filter, X, Loader2, FileText, User, Building2,
    Stethoscope, Download, AlertTriangle, CheckCircle2, Receipt,
    ListFilter, ChevronUp, ShoppingCart, Trash2, Printer, PackageCheck, Undo2,
} from 'lucide-react';
import {
    fetchAltasFacturacion, updateEstadoFac, updateResponsableFac,
    fetchFacturacionDetalle, FACTURACION_ESTADOS,
    marcarParaDevolucion, quitarDeCarritoDevolucion, fetchCarritoDevolucion,
    generarDevolucion, fetchDevoluciones, fetchDevolucionDetalle,
} from '../services/altasService';
import SalusSyncButton from './SalusSyncButton';
import SignaturePad from './SignaturePad';
import { SkeletonTablePanel } from './SkeletonLoader';

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

    // ── Tabs ──
    const [activeTab, setActiveTab] = useState('tabla'); // 'tabla' | 'carrito_devolucion' | 'historial_devoluciones'

    // ── Carrito de devolución ──
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [carritoDevItems, setCarritoDevItems] = useState([]);
    const [carritoDevLoading, setCarritoDevLoading] = useState(false);
    const [showDevolucionModal, setShowDevolucionModal] = useState(false);
    const [devolucionForm, setDevolucionForm] = useState({ devuelve: '', recibe: '', motivo: '' });
    const [firmaDevuelve, setFirmaDevuelve] = useState(null);
    const [firmaRecibe, setFirmaRecibe] = useState(null);
    const [generando, setGenerando] = useState(false);

    // ── Historial de devoluciones ──
    const [devoluciones, setDevoluciones] = useState([]);
    const [devolucionesLoading, setDevolucionesLoading] = useState(false);
    const [expandedDevolucion, setExpandedDevolucion] = useState(null);
    const [devolucionDetalle, setDevolucionDetalle] = useState({});

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

    // ── Carga carrito devolución ──
    const loadCarritoDevolucion = useCallback(async () => {
        setCarritoDevLoading(true);
        try {
            const data = await fetchCarritoDevolucion();
            setCarritoDevItems(data);
        } catch (err) {
            addToast?.('Error al cargar carrito: ' + err.message, 'error');
        } finally {
            setCarritoDevLoading(false);
        }
    }, [addToast]);

    const loadDevoluciones = useCallback(async () => {
        setDevolucionesLoading(true);
        try {
            const data = await fetchDevoluciones();
            setDevoluciones(data);
        } catch (err) {
            addToast?.('Error al cargar historial: ' + err.message, 'error');
        } finally {
            setDevolucionesLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        if (activeTab === 'carrito_devolucion') loadCarritoDevolucion();
        else if (activeTab === 'historial_devoluciones') loadDevoluciones();
    }, [activeTab, loadCarritoDevolucion, loadDevoluciones]);

    // ── Carrito de devolución handlers ──
    const handleToggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleEnviarAlCarritoDevolucion = async () => {
        if (selectedIds.size === 0) {
            addToast?.('Seleccioná fichas para devolver', 'info');
            return;
        }
        try {
            await marcarParaDevolucion([...selectedIds]);
            addToast?.(`${selectedIds.size} ficha(s) enviadas al carrito de devolución`, 'success');
            setSelectedIds(new Set());
            loadData();
            loadCarritoDevolucion();
        } catch (err) {
            addToast?.('Error: ' + err.message, 'error');
        }
    };

    const handleQuitarDelCarritoDevolucion = async (id) => {
        try {
            await quitarDeCarritoDevolucion(id);
            addToast?.('Ficha removida del carrito', 'info');
            loadCarritoDevolucion();
            loadData();
        } catch (err) {
            addToast?.('Error: ' + err.message, 'error');
        }
    };

    const handleGenerarDevolucion = async () => {
        if (!devolucionForm.devuelve) {
            addToast?.('Ingresá el nombre de quien devuelve', 'error');
            return;
        }
        setGenerando(true);
        try {
            const devolucion = await generarDevolucion({
                responsableDevuelve: devolucionForm.devuelve,
                responsableRecibe: devolucionForm.recibe || null,
                motivo: devolucionForm.motivo || null,
                firmaDevuelve: firmaDevuelve || null,
                firmaRecibe: firmaRecibe || null,
            });
            addToast?.(`✅ Devolución ${devolucion.codigo} generada — ${devolucion.cantidad_fichas} fichas`, 'success');
            setShowDevolucionModal(false);
            setDevolucionForm({ devuelve: '', recibe: '', motivo: '' });
            setFirmaDevuelve(null);
            setFirmaRecibe(null);
            loadCarritoDevolucion();
            loadData();
            // Auto-print
            handlePrintDevolucion(devolucion);
        } catch (err) {
            addToast?.('Error: ' + err.message, 'error');
        } finally {
            setGenerando(false);
        }
    };

    const handlePrintDevolucion = async (devolucion) => {
        try {
            const items = await fetchDevolucionDetalle(devolucion.id);
            const todayStr = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            const rows = items.map(a => `<tr>
                <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:11px;font-family:monospace;font-weight:600">${a.numero_admision || '—'}</td>
                <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:11px;font-weight:600">${a.paciente || '—'}</td>
                <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:11px">${a.cliente || '—'}</td>
                <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:11px">${a.doctor || '—'}</td>
                <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:11px;font-family:monospace">${formatDate(a.fecha_ingreso)}</td>
                <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:11px;font-family:monospace">${formatDate(a.fecha_alta)}</td>
            </tr>`).join('');

            const firmaDevHtml = devolucion.firma_devuelve
                ? `<img src="${devolucion.firma_devuelve}" style="height:60px;display:block;margin:4px auto 0" />`
                : '';
            const firmaRecHtml = devolucion.firma_recibe
                ? `<img src="${devolucion.firma_recibe}" style="height:60px;display:block;margin:4px auto 0" />`
                : '';

            const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Devolución ${devolucion.codigo}</title>
            <style>
                @page { margin: 15mm; }
                body { font-family: -apple-system, 'Segoe UI', sans-serif; color: #1f2937; }
                table { border-collapse: collapse; width: 100%; }
                th { padding: 6px 8px; background: #FEF2F2; border: 1px solid #e2e8f0; font-size: 11px; font-weight: 700; text-align: left; color: #DC2626; }
                tr:nth-child(even) td { background: #f9fafb; }
            </style></head><body>
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
                    <div style="font-size:20px;font-weight:800;color:#DC2626">🔙 Constancia de Devolución</div>
                    <div style="margin-left:auto;font-size:12px;color:#6b7280">${todayStr}</div>
                </div>
                <div style="padding:8px 12px;background:#FEF2F2;border-radius:8px;border:1px solid #FECACA;margin-bottom:14px;font-size:12px;color:#991B1B">
                    <strong>Facturación → Control de Altas Administrativas</strong>
                </div>
                <div style="display:flex;gap:20px;margin-bottom:14px;font-size:12px">
                    <div><strong>Código:</strong> ${devolucion.codigo}</div>
                    <div><strong>Fichas:</strong> ${devolucion.cantidad_fichas}</div>
                    <div><strong>Devuelve:</strong> ${devolucion.responsable_devuelve}</div>
                    <div><strong>Recibe:</strong> ${devolucion.responsable_recibe || '________________________'}</div>
                </div>
                ${devolucion.motivo ? '<div style="margin-bottom:12px;font-size:11px;color:#6b7280"><strong>Motivo:</strong> ' + devolucion.motivo + '</div>' : ''}
                <table><thead><tr>
                    <th>N° Adm</th><th>Paciente</th><th>Obra Social</th><th>Médico</th><th>Ingreso</th><th>Alta</th>
                </tr></thead><tbody>${rows}</tbody></table>
                <div style="display:flex;justify-content:space-between;margin-top:40px">
                    <div style="text-align:center;width:220px">
                        ${firmaDevHtml}
                        <div style="border-top:1px solid #1f2937;padding-top:6px;font-size:11px;font-weight:600">${devolucion.responsable_devuelve}</div>
                        <div style="font-size:9px;color:#9ca3af">Devuelve — Facturación</div>
                    </div>
                    <div style="text-align:center;width:220px">
                        ${firmaRecHtml}
                        <div style="border-top:1px solid #1f2937;padding-top:6px;font-size:11px;font-weight:600">${devolucion.responsable_recibe || '________________________'}</div>
                        <div style="font-size:9px;color:#9ca3af">Recibe — Control de Altas</div>
                    </div>
                </div>
                <div style="margin-top:30px;font-size:9px;color:#9ca3af;text-align:center">Sanatorio Argentino — Sistema ADM-QUI — ${todayStr}</div>
            </body></html>`;

            const printWin = window.open('', '_blank', 'width=900,height=700');
            printWin.document.write(html);
            printWin.document.close();
            setTimeout(() => printWin.print(), 400);
        } catch (err) {
            addToast?.('Error al imprimir: ' + err.message, 'error');
        }
    };

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
                        Control de facturación internada — PDV 21/31
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

            {/* ── Tab Toggle ── */}
            <div style={{
                display: 'flex', gap: '4px', padding: '4px',
                background: '#F3F4F6', borderRadius: '12px', width: 'fit-content', marginBottom: '16px',
            }}>
                {[
                    { key: 'tabla', label: '📋 Fichas' },
                    { key: 'carrito_devolucion', label: '🔙 Carrito Devolución', badge: carritoDevItems.length },
                    { key: 'historial_devoluciones', label: '📄 Historial Dev.' },
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
                        {tab.badge > 0 && (
                            <span style={{
                                background: '#EF4444', color: '#fff', padding: '1px 7px',
                                borderRadius: '10px', fontSize: '0.65rem', fontWeight: 800,
                            }}>{tab.badge}</span>
                        )}
                    </button>
                ))}
            </div>

            {activeTab === 'carrito_devolucion' ? (
                /* ══════ CARRITO DEVOLUCIÓN TAB ══════ */
                <div className="animate-fade-in">
                    {carritoDevLoading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                            <Loader2 size={28} className="spin" style={{ color: '#EF4444' }} />
                        </div>
                    ) : carritoDevItems.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--neutral-400)' }}>
                            <Undo2 size={48} strokeWidth={1.2} />
                            <h3 style={{ margin: '12px 0 4px' }}>Carrito de devolución vacío</h3>
                            <p style={{ fontSize: '0.85rem' }}>Seleccioná fichas en la pestaña "Fichas" y envialas al carrito de devolución.</p>
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--neutral-600)' }}>
                                    <Undo2 size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                                    {carritoDevItems.length} ficha{carritoDevItems.length !== 1 ? 's' : ''} para devolver
                                </div>
                                <button onClick={() => setShowDevolucionModal(true)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        padding: '10px 20px', borderRadius: '10px',
                                        background: 'linear-gradient(135deg, #DC2626, #B91C1C)',
                                        color: '#fff', border: 'none', cursor: 'pointer',
                                        fontSize: '0.82rem', fontWeight: 700,
                                        boxShadow: '0 2px 8px rgba(220,38,38,0.3)',
                                    }}>
                                    <Printer size={16} /> Generar Constancia de Devolución
                                </button>
                            </div>
                            <div style={{ borderRadius: '12px', border: '1px solid var(--neutral-200)', overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                    <thead>
                                        <tr style={{ background: '#FEF2F2' }}>
                                            <th style={{ ...thStyle, color: '#DC2626' }}>N° Adm</th>
                                            <th style={{ ...thStyle, color: '#DC2626' }}>Paciente</th>
                                            <th style={{ ...thStyle, color: '#DC2626' }}>Obra Social</th>
                                            <th style={{ ...thStyle, color: '#DC2626' }}>Médico</th>
                                            <th style={{ ...thStyle, color: '#DC2626' }}>Ingreso</th>
                                            <th style={{ ...thStyle, color: '#DC2626' }}>Alta</th>
                                            <th style={{ ...thStyle, width: '40px' }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {carritoDevItems.map(a => (
                                            <tr key={a.id} style={{ borderBottom: '1px solid var(--neutral-100)' }}>
                                                <td style={{ padding: '8px 10px' }}>
                                                    <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', background: '#FEF2F2', color: '#DC2626' }}>{a.numero_admision}</span>
                                                </td>
                                                <td style={{ padding: '8px 10px', fontWeight: 600 }}>{a.paciente}</td>
                                                <td style={{ padding: '8px 10px', color: 'var(--neutral-500)' }}>{a.cliente || '—'}</td>
                                                <td style={{ padding: '8px 10px', color: 'var(--neutral-500)' }}>{a.doctor || '—'}</td>
                                                <td style={{ padding: '8px 10px' }}>{formatDate(a.fecha_ingreso)}</td>
                                                <td style={{ padding: '8px 10px' }}>{formatDate(a.fecha_alta)}</td>
                                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                    <button onClick={() => handleQuitarDelCarritoDevolucion(a.id)}
                                                        title="Quitar del carrito"
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: '4px' }}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {/* Modal Generar Devolución */}
                    {showDevolucionModal && (
                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={() => setShowDevolucionModal(false)}>
                            <div onClick={e => e.stopPropagation()} style={{
                                background: '#fff', borderRadius: '16px', padding: '28px', width: '520px', maxWidth: '90vw',
                                boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto',
                            }}>
                                <h3 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: 800, color: '#DC2626' }}>
                                    🔙 Generar Constancia de Devolución
                                </h3>
                                <div style={{ fontSize: '0.82rem', color: 'var(--neutral-500)', marginBottom: '16px' }}>
                                    {carritoDevItems.length} ficha{carritoDevItems.length !== 1 ? 's' : ''} serán devueltas a Control de Altas.
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--neutral-500)', textTransform: 'uppercase' }}>Devuelve *</label>
                                        <input value={devolucionForm.devuelve} onChange={e => setDevolucionForm(p => ({ ...p, devuelve: e.target.value }))}
                                            placeholder="Nombre de quien devuelve" style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--neutral-200)', fontSize: '0.85rem', marginTop: '4px' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--neutral-500)', textTransform: 'uppercase' }}>Recibe</label>
                                        <input value={devolucionForm.recibe} onChange={e => setDevolucionForm(p => ({ ...p, recibe: e.target.value }))}
                                            placeholder="Nombre de quien recibe (opcional)" style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--neutral-200)', fontSize: '0.85rem', marginTop: '4px' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--neutral-500)', textTransform: 'uppercase' }}>Motivo de devolución</label>
                                        <textarea value={devolucionForm.motivo} onChange={e => setDevolucionForm(p => ({ ...p, motivo: e.target.value }))}
                                            placeholder="Motivo por el que se devuelven las fichas" rows={2}
                                            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--neutral-200)', fontSize: '0.85rem', marginTop: '4px', resize: 'vertical' }} />
                                    </div>

                                    {/* Firmas digitales */}
                                    <div style={{ borderTop: '1px solid var(--neutral-100)', paddingTop: '12px', marginTop: '4px' }}>
                                        <SignaturePad
                                            label="Firma de quien devuelve"
                                            onSignatureChange={setFirmaDevuelve}
                                            height={120}
                                        />
                                    </div>
                                    <div>
                                        <SignaturePad
                                            label="Firma de quien recibe (opcional)"
                                            onSignatureChange={setFirmaRecibe}
                                            height={120}
                                        />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                                    <button onClick={() => setShowDevolucionModal(false)}
                                        style={{ padding: '8px 18px', borderRadius: '8px', border: '1px solid var(--neutral-200)', background: '#fff', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>Cancelar</button>
                                    <button onClick={handleGenerarDevolucion} disabled={generando}
                                        style={{
                                            padding: '8px 24px', borderRadius: '8px', border: 'none',
                                            background: 'linear-gradient(135deg, #DC2626, #B91C1C)', color: '#fff',
                                            cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700,
                                            opacity: generando ? 0.6 : 1,
                                        }}>
                                        {generando ? 'Generando...' : '🔙 Generar e Imprimir'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : activeTab === 'historial_devoluciones' ? (
                /* ══════ HISTORIAL DEVOLUCIONES TAB ══════ */
                <div className="animate-fade-in">
                    {devolucionesLoading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                            <Loader2 size={28} className="spin" style={{ color: '#EF4444' }} />
                        </div>
                    ) : devoluciones.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--neutral-400)' }}>
                            <PackageCheck size={48} strokeWidth={1.2} />
                            <h3 style={{ margin: '12px 0 4px' }}>Sin devoluciones</h3>
                            <p style={{ fontSize: '0.85rem' }}>Aún no se generaron constancias de devolución.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {devoluciones.map(d => (
                                <div key={d.id} style={{
                                    borderRadius: '10px', border: '1px solid #FECACA',
                                    overflow: 'hidden', background: '#fff',
                                }}>
                                    <div onClick={async () => {
                                        if (expandedDevolucion === d.id) { setExpandedDevolucion(null); return; }
                                        setExpandedDevolucion(d.id);
                                        if (!devolucionDetalle[d.id]) {
                                            const items = await fetchDevolucionDetalle(d.id);
                                            setDevolucionDetalle(prev => ({ ...prev, [d.id]: items }));
                                        }
                                    }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '12px',
                                            padding: '12px 16px', cursor: 'pointer',
                                            background: expandedDevolucion === d.id ? '#FEF2F2' : '#fff',
                                        }}>
                                        {expandedDevolucion === d.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.82rem', color: '#DC2626' }}>{d.codigo}</span>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--neutral-500)' }}>{formatDateTime(d.fecha_devolucion)}</span>
                                        <span style={{ padding: '2px 8px', borderRadius: '10px', background: '#FEF2F2', color: '#DC2626', fontSize: '0.72rem', fontWeight: 700 }}>{d.cantidad_fichas} fichas</span>
                                        <span style={{ fontSize: '0.78rem', color: 'var(--neutral-500)' }}>Devuelve: {d.responsable_devuelve}</span>
                                        {d.firmado_sistema && (
                                            <span style={{ padding: '2px 6px', borderRadius: '4px', background: '#ECFDF5', color: '#059669', fontSize: '0.65rem', fontWeight: 700 }}>✍ Firmado</span>
                                        )}
                                        <button onClick={(e) => { e.stopPropagation(); handlePrintDevolucion(d); }}
                                            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: '4px' }}
                                            title="Reimprimir">
                                            <Printer size={16} />
                                        </button>
                                    </div>
                                    {expandedDevolucion === d.id && devolucionDetalle[d.id] && (
                                        <div style={{ borderTop: '1px solid #FECACA', padding: '12px 16px 12px 40px' }}>
                                            {d.motivo && (
                                                <div style={{ marginBottom: '10px', padding: '6px 10px', borderRadius: '6px', background: '#FEF2F2', fontSize: '0.78rem', color: '#991B1B' }}>
                                                    <strong>Motivo:</strong> {d.motivo}
                                                </div>
                                            )}
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                                <thead>
                                                    <tr style={{ background: '#FEF2F2' }}>
                                                        <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, fontSize: '0.68rem', color: '#DC2626' }}>N° ADM</th>
                                                        <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, fontSize: '0.68rem', color: '#DC2626' }}>PACIENTE</th>
                                                        <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, fontSize: '0.68rem', color: '#DC2626' }}>O.S.</th>
                                                        <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, fontSize: '0.68rem', color: '#DC2626' }}>MÉDICO</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {devolucionDetalle[d.id].map(a => (
                                                        <tr key={a.id} style={{ borderTop: '1px solid var(--neutral-100)' }}>
                                                            <td style={{ padding: '4px 8px', fontFamily: 'monospace', fontWeight: 600 }}>{a.numero_admision}</td>
                                                            <td style={{ padding: '4px 8px', fontWeight: 600 }}>{a.paciente}</td>
                                                            <td style={{ padding: '4px 8px', color: 'var(--neutral-500)' }}>{a.cliente || '—'}</td>
                                                            <td style={{ padding: '4px 8px', color: 'var(--neutral-500)' }}>{a.doctor || '—'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                /* ══════ TABLA PRINCIPAL ══════ */
                <>
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
                        <SkeletonTablePanel kpis={0} cols={8} rows={8} showFilters={false} />
                    ) : filteredAltas.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--neutral-400)' }}>
                            <Receipt size={48} strokeWidth={1.2} />
                            <h3 style={{ margin: '12px 0 4px' }}>Sin fichas</h3>
                            <p style={{ fontSize: '0.85rem' }}>No hay altas traspasadas en el rango seleccionado.</p>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid var(--neutral-200)', background: 'var(--card-bg, #fff)' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr style={{ background: 'var(--neutral-50)' }}>
                                        <th style={{ ...thStyle, width: '30px', textAlign: 'center' }}>
                                            <input type="checkbox"
                                                checked={selectedIds.size > 0 && filteredAltas.filter(a => !a.en_carrito_devolucion && !a.devolucion_id).every(a => selectedIds.has(a.id))}
                                                onChange={e => {
                                                    if (e.target.checked) {
                                                        const ids = filteredAltas.filter(a => !a.en_carrito_devolucion && !a.devolucion_id).map(a => a.id);
                                                        setSelectedIds(new Set(ids));
                                                    } else {
                                                        setSelectedIds(new Set());
                                                    }
                                                }}
                                                title="Seleccionar todas"
                                                style={{ cursor: 'pointer', accentColor: '#EF4444' }}
                                            />
                                        </th>
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
                                        const canSelect = !alta.en_carrito_devolucion && !alta.devolucion_id;

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
                                                    {/* Checkbox */}
                                                    <td style={{ ...tdStyle, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                                        {canSelect ? (
                                                            <input type="checkbox"
                                                                checked={selectedIds.has(alta.id)}
                                                                onChange={() => handleToggleSelect(alta.id)}
                                                                style={{ cursor: 'pointer', accentColor: '#EF4444' }}
                                                            />
                                                        ) : alta.en_carrito_devolucion ? (
                                                            <Undo2 size={12} style={{ color: '#EF4444', opacity: 0.5 }} title="En carrito de devolución" />
                                                        ) : null}
                                                    </td>
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
                                                        <td colSpan={11} style={{ padding: 0, border: 'none' }}>
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
                                                                    {alta.devuelta_at && (
                                                                        <div>
                                                                            <div style={labelStyle}>Devuelta</div>
                                                                            <div style={{ ...valueStyle, color: '#DC2626', fontWeight: 700 }}>🔙 {formatDateTime(alta.devuelta_at)} por {alta.devuelta_por || '—'}</div>
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

                    {/* ── Floating action bar (selección para devolución) ── */}
                    {selectedIds.size > 0 && (
                        <div className="animate-fade-in" style={{
                            position: 'sticky', bottom: '16px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
                            padding: '12px 24px', borderRadius: '14px',
                            background: 'linear-gradient(135deg, #7F1D1D, #DC2626)',
                            color: '#fff', boxShadow: '0 8px 30px rgba(220,38,38,0.4)',
                            zIndex: 100, marginTop: '16px',
                        }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                                {selectedIds.size} ficha{selectedIds.size !== 1 ? 's' : ''} seleccionada{selectedIds.size !== 1 ? 's' : ''}
                            </span>
                            <button onClick={handleEnviarAlCarritoDevolucion}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '8px 20px', borderRadius: '8px',
                                    background: '#fff', color: '#DC2626',
                                    border: 'none', cursor: 'pointer',
                                    fontSize: '0.82rem', fontWeight: 700,
                                }}>
                                <Undo2 size={16} /> Enviar al Carrito de Devolución
                            </button>
                            <button onClick={() => setSelectedIds(new Set())}
                                style={{
                                    background: 'transparent', border: '1px solid rgba(255,255,255,0.3)',
                                    color: '#fff', padding: '6px 12px', borderRadius: '8px',
                                    fontSize: '0.78rem', cursor: 'pointer',
                                }}>
                                Cancelar
                            </button>
                        </div>
                    )}
                </>
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
