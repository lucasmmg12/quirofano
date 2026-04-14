/**
 * AsociacionesEntregaPanel.jsx — Panel de Entrega de Documentación a Asociaciones
 *
 * 3 Pestañas:
 *   1. Cirugías Pendientes — check de docs, enviar al carrito
 *   2. Carrito de Entrega — agrupar por asociación, generar constancia
 *   3. Historial de Entregas — auditoría de constancias pasadas
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Package, CheckCircle2, ShoppingCart, History, Search,
    Filter, ChevronDown, ChevronRight, Printer, FileCheck,
    AlertCircle, RefreshCw, Loader2, X, PackageCheck,
} from 'lucide-react';
import {
    fetchAsociacionesCirugias,
    toggleDocsCompletos,
    enviarAlCarrito,
    quitarDelCarrito,
    fetchCarrito,
    generarConstancia,
    fetchConstancias,
    fetchConstanciaDetalle,
    fetchResumenAsociaciones,
    ASOCIACION_COLORS,
    ASOCIACION_LIST,
} from '../services/asociacionesService';
import PrintConstanciaEntrega from './PrintConstanciaEntrega';

// ═══════════════════════════════
// Sub-component: Dashboard Badges
// ═══════════════════════════════
function AsociacionBadges({ resumen, filtroAsociacion, onFilterChange }) {
    return (
        <div style={{
            display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px',
        }}>
            {/* "Todas" badge */}
            <button
                onClick={() => onFilterChange(null)}
                style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 14px', borderRadius: '20px',
                    border: filtroAsociacion === null ? '2px solid #374151' : '1px solid #E5E7EB',
                    background: filtroAsociacion === null ? '#F9FAFB' : '#fff',
                    fontWeight: filtroAsociacion === null ? 700 : 500,
                    fontSize: '0.78rem', cursor: 'pointer', transition: 'all 0.2s',
                    color: '#374151',
                }}
            >
                Todas
                <span style={{
                    background: '#F3F4F6', padding: '1px 8px', borderRadius: '10px',
                    fontSize: '0.7rem', fontWeight: 700, color: '#6B7280',
                }}>
                    {Object.values(resumen).reduce((s, r) => s + r.total - r.entregadas, 0)}
                </span>
            </button>

            {ASOCIACION_LIST.map(asoc => {
                const r = resumen[asoc] || { total: 0, sinDocs: 0, conDocs: 0, enCarrito: 0, entregadas: 0 };
                const pendientes = r.total - r.entregadas;
                const color = ASOCIACION_COLORS[asoc];
                const isActive = filtroAsociacion === asoc;
                const shortName = asoc.replace('Asociación de ', '').replace(' (Particular)', '');

                return (
                    <button
                        key={asoc}
                        onClick={() => onFilterChange(isActive ? null : asoc)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '6px 14px', borderRadius: '20px',
                            border: isActive ? `2px solid ${color}` : '1px solid #E5E7EB',
                            background: isActive ? `${color}10` : '#fff',
                            fontWeight: isActive ? 700 : 500,
                            fontSize: '0.78rem', cursor: 'pointer', transition: 'all 0.2s',
                            color: isActive ? color : '#6B7280',
                        }}
                    >
                        <div style={{
                            width: '8px', height: '8px', borderRadius: '50%',
                            background: color, flexShrink: 0,
                        }} />
                        {shortName}
                        <span style={{
                            background: isActive ? `${color}20` : '#F3F4F6',
                            padding: '1px 8px', borderRadius: '10px',
                            fontSize: '0.7rem', fontWeight: 700,
                            color: isActive ? color : '#9CA3AF',
                        }}>
                            {pendientes}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

// ═══════════════════════════════
// Main Panel
// ═══════════════════════════════
export default function AsociacionesEntregaPanel({ addToast, currentUser }) {
    const [activeTab, setActiveTab] = useState('pendientes');
    const [loading, setLoading] = useState(true);

    // Pendientes state
    const [cirugias, setCirugias] = useState([]);
    const [filtroAsociacion, setFiltroAsociacion] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [resumen, setResumen] = useState({});

    // Carrito state
    const [carrito, setCarrito] = useState({});
    const [carritoLoading, setCarritoLoading] = useState(false);

    // Historial state
    const [constancias, setConstancias] = useState([]);
    const [expandedConstancia, setExpandedConstancia] = useState(null);
    const [constanciaDetalle, setConstanciaDetalle] = useState({});

    // Print state
    const [printData, setPrintData] = useState(null); // { constancia, items }
    const printRef = useRef(null);

    // Modal for generating constancia
    const [showConstanciaModal, setShowConstanciaModal] = useState(null); // asociacion name

    // ─── Load Data ───
    const loadPendientes = useCallback(async () => {
        setLoading(true);
        try {
            const [data, res] = await Promise.all([
                fetchAsociacionesCirugias({
                    asociacion: filtroAsociacion,
                    search: searchTerm || undefined,
                    soloSinConstancia: true,
                }),
                fetchResumenAsociaciones(),
            ]);
            setCirugias(data);
            setResumen(res);
        } catch (err) {
            addToast?.('Error al cargar cirugías: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [filtroAsociacion, searchTerm, addToast]);

    const loadCarrito = useCallback(async () => {
        setCarritoLoading(true);
        try {
            const data = await fetchCarrito();
            setCarrito(data);
        } catch (err) {
            addToast?.('Error al cargar carrito: ' + err.message, 'error');
        } finally {
            setCarritoLoading(false);
        }
    }, [addToast]);

    const loadHistorial = useCallback(async () => {
        try {
            const data = await fetchConstancias();
            setConstancias(data);
        } catch (err) {
            addToast?.('Error al cargar historial: ' + err.message, 'error');
        }
    }, [addToast]);

    useEffect(() => {
        if (activeTab === 'pendientes') loadPendientes();
        else if (activeTab === 'carrito') loadCarrito();
        else if (activeTab === 'historial') loadHistorial();
    }, [activeTab, loadPendientes, loadCarrito, loadHistorial]);

    // ─── Handlers ───
    const handleToggleDocs = async (id) => {
        try {
            const updated = await toggleDocsCompletos(id, currentUser?.nombre || 'Sistema');
            setCirugias(prev => prev.map(c => c.id === id ? updated : c));
            // Refresh resumen
            fetchResumenAsociaciones().then(setResumen);
        } catch (err) {
            addToast?.('Error al actualizar documentación: ' + err.message, 'error');
        }
    };

    const handleEnviarAlCarrito = async () => {
        const conDocs = cirugias.filter(c => c.docs_completos && !c.en_carrito && !c.constancia_id);
        if (conDocs.length === 0) {
            addToast?.('No hay cirugías con documentación completa para enviar', 'info');
            return;
        }
        try {
            await enviarAlCarrito(conDocs.map(c => c.id));
            addToast?.(`${conDocs.length} expediente(s) enviados al carrito`, 'success');
            loadPendientes();
        } catch (err) {
            addToast?.('Error al enviar al carrito: ' + err.message, 'error');
        }
    };

    const handleQuitarDelCarrito = async (id) => {
        try {
            await quitarDelCarrito(id);
            addToast?.('Expediente removido del carrito', 'info');
            loadCarrito();
        } catch (err) {
            addToast?.('Error: ' + err.message, 'error');
        }
    };

    const handleExpandConstancia = async (constanciaId) => {
        if (expandedConstancia === constanciaId) {
            setExpandedConstancia(null);
            return;
        }
        setExpandedConstancia(constanciaId);
        if (!constanciaDetalle[constanciaId]) {
            try {
                const detalle = await fetchConstanciaDetalle(constanciaId);
                setConstanciaDetalle(prev => ({ ...prev, [constanciaId]: detalle }));
            } catch (err) {
                addToast?.('Error al cargar detalle', 'error');
            }
        }
    };

    const handlePrintConstancia = async (constancia, items) => {
        // If items not loaded, load them
        let printItems = items;
        if (!printItems) {
            printItems = await fetchConstanciaDetalle(constancia.id);
        }
        setPrintData({ constancia, items: printItems });
        setTimeout(() => window.print(), 200);
    };

    // Clear print data after printing
    useEffect(() => {
        const clear = () => setPrintData(null);
        window.addEventListener('afterprint', clear);
        return () => window.removeEventListener('afterprint', clear);
    }, []);

    // ─── Filter display data ───
    const pendientesCirugias = cirugias.filter(c => !c.en_carrito);
    const enCarritoCirugias = cirugias.filter(c => c.en_carrito);

    // Tab config
    const tabs = [
        { id: 'pendientes', label: 'Cirugías Pendientes', icon: FileCheck, count: pendientesCirugias.length },
        { id: 'carrito', label: 'Carrito de Entrega', icon: ShoppingCart, count: Object.values(carrito).flat().length },
        { id: 'historial', label: 'Historial', icon: History, count: constancias.length },
    ];

    return (
        <div className="content no-print" style={{ padding: '20px', height: '100%', overflow: 'auto' }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '20px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '42px', height: '42px', borderRadius: '12px',
                        background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <PackageCheck size={22} color="#fff" />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1F2937', margin: 0 }}>
                            Entrega Asociaciones
                        </h2>
                        <p style={{ fontSize: '0.78rem', color: '#9CA3AF', margin: 0 }}>
                            Control de documentación quirúrgica para asociaciones médicas
                        </p>
                    </div>
                </div>

                <button
                    onClick={() => {
                        if (activeTab === 'pendientes') loadPendientes();
                        else if (activeTab === 'carrito') loadCarrito();
                        else loadHistorial();
                    }}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '8px 14px', borderRadius: '8px',
                        background: '#F3F4F6', border: '1px solid #E5E7EB',
                        fontSize: '0.78rem', fontWeight: 600, color: '#6B7280',
                        cursor: 'pointer', transition: 'all 0.2s',
                    }}
                >
                    <RefreshCw size={14} /> Actualizar
                </button>
            </div>

            {/* Tabs */}
            <div style={{
                display: 'flex', gap: '4px', marginBottom: '16px',
                background: '#F3F4F6', padding: '4px', borderRadius: '12px',
            }}>
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                padding: '10px 16px', borderRadius: '8px', border: 'none',
                                background: isActive ? '#fff' : 'transparent',
                                boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                color: isActive ? '#1F2937' : '#9CA3AF',
                                fontWeight: isActive ? 700 : 500, fontSize: '0.82rem',
                                cursor: 'pointer', transition: 'all 0.2s',
                            }}
                        >
                            <Icon size={16} />
                            {tab.label}
                            {tab.count > 0 && (
                                <span style={{
                                    padding: '1px 7px', borderRadius: '10px', fontSize: '0.68rem', fontWeight: 700,
                                    background: isActive ? '#EEF2FF' : '#E5E7EB',
                                    color: isActive ? '#4F46E5' : '#9CA3AF',
                                }}>
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ════════════════════════════════════════ */}
            {/* TAB 1: Cirugías Pendientes              */}
            {/* ════════════════════════════════════════ */}
            {activeTab === 'pendientes' && (
                <div>
                    {/* Badges de asociación */}
                    <AsociacionBadges
                        resumen={resumen}
                        filtroAsociacion={filtroAsociacion}
                        onFilterChange={setFiltroAsociacion}
                    />

                    {/* Search + Actions */}
                    <div style={{
                        display: 'flex', gap: '10px', marginBottom: '14px',
                        alignItems: 'center',
                    }}>
                        <div style={{
                            flex: 1, display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '8px 14px', borderRadius: '8px',
                            border: '1px solid #E5E7EB', background: '#fff',
                        }}>
                            <Search size={15} color="#9CA3AF" />
                            <input
                                type="text"
                                placeholder="Buscar paciente, DNI, cirujano..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{
                                    border: 'none', outline: 'none', flex: 1,
                                    fontSize: '0.82rem', color: '#374151',
                                    background: 'transparent',
                                }}
                            />
                            {searchTerm && (
                                <button onClick={() => setSearchTerm('')} style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: '#9CA3AF', padding: '2px',
                                }}>
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        <button
                            onClick={handleEnviarAlCarrito}
                            disabled={!cirugias.some(c => c.docs_completos && !c.en_carrito && !c.constancia_id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '8px 16px', borderRadius: '8px',
                                background: cirugias.some(c => c.docs_completos && !c.en_carrito && !c.constancia_id)
                                    ? 'linear-gradient(135deg, #10B981, #059669)' : '#E5E7EB',
                                color: cirugias.some(c => c.docs_completos && !c.en_carrito && !c.constancia_id)
                                    ? '#fff' : '#9CA3AF',
                                border: 'none', fontWeight: 700, fontSize: '0.78rem',
                                cursor: cirugias.some(c => c.docs_completos && !c.en_carrito && !c.constancia_id)
                                    ? 'pointer' : 'not-allowed',
                                transition: 'all 0.2s',
                                boxShadow: cirugias.some(c => c.docs_completos && !c.en_carrito && !c.constancia_id)
                                    ? '0 2px 8px rgba(16, 185, 129, 0.3)' : 'none',
                            }}
                        >
                            <ShoppingCart size={14} />
                            Enviar al Carrito
                        </button>
                    </div>

                    {/* Table */}
                    {loading ? (
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '60px', color: '#9CA3AF', gap: '8px',
                        }}>
                            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                            Cargando cirugías...
                        </div>
                    ) : pendientesCirugias.length === 0 ? (
                        <div style={{
                            textAlign: 'center', padding: '60px 20px', color: '#9CA3AF',
                        }}>
                            <CheckCircle2 size={48} strokeWidth={1.2} style={{ margin: '0 auto 12px', display: 'block' }} />
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#6B7280', margin: '0 0 4px' }}>
                                No hay cirugías pendientes
                            </h3>
                            <p style={{ fontSize: '0.82rem' }}>
                                {filtroAsociacion ? `No hay cirugías pendientes para ${filtroAsociacion}` : 'Todas las cirugías han sido procesadas'}
                            </p>
                        </div>
                    ) : (
                        <div style={{
                            background: '#fff', borderRadius: '12px',
                            border: '1px solid #E5E7EB', overflow: 'hidden',
                        }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr style={{ background: '#F9FAFB' }}>
                                        <th style={thStyle}>Fecha</th>
                                        <th style={thStyle}>Paciente</th>
                                        <th style={thStyle}>DNI</th>
                                        <th style={thStyle}>OS</th>
                                        <th style={thStyle}>Cirugía</th>
                                        <th style={thStyle}>Cirujano</th>
                                        <th style={thStyle}>Asociación</th>
                                        <th style={{ ...thStyle, textAlign: 'center', width: '80px' }}>Docs ✓</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pendientesCirugias.map(c => {
                                        const color = ASOCIACION_COLORS[c.asociacion] || '#6B7280';
                                        return (
                                            <tr key={c.id} style={{
                                                borderBottom: '1px solid #F3F4F6',
                                                transition: 'background 0.15s',
                                            }}
                                                onMouseOver={e => e.currentTarget.style.background = '#FAFBFF'}
                                                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <td style={tdStyle}>
                                                    {c.fecha_realizacion ? new Date(c.fecha_realizacion + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
                                                </td>
                                                <td style={{ ...tdStyle, fontWeight: 600 }}>{c.nombre_paciente}</td>
                                                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '0.78rem' }}>{c.dni || '—'}</td>
                                                <td style={tdStyle}>{c.cliente || '—'}</td>
                                                <td style={{ ...tdStyle, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {c.nombre_cirugia || '—'}
                                                </td>
                                                <td style={tdStyle}>{c.cirujano || '—'}</td>
                                                <td style={tdStyle}>
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                        padding: '2px 10px', borderRadius: '12px',
                                                        background: `${color}15`, color: color,
                                                        fontSize: '0.72rem', fontWeight: 600,
                                                    }}>
                                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color }} />
                                                        {c.asociacion.replace('Asociación de ', '').replace(' (Particular)', '')}
                                                    </span>
                                                </td>
                                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                    <button
                                                        onClick={() => handleToggleDocs(c.id)}
                                                        style={{
                                                            width: '32px', height: '32px', borderRadius: '8px',
                                                            border: c.docs_completos ? '2px solid #10B981' : '2px solid #D1D5DB',
                                                            background: c.docs_completos ? '#ECFDF5' : '#fff',
                                                            cursor: 'pointer', display: 'flex',
                                                            alignItems: 'center', justifyContent: 'center',
                                                            transition: 'all 0.2s',
                                                            margin: '0 auto',
                                                        }}
                                                        title={c.docs_completos ? `Marcado por ${c.operador}` : 'Marcar documentación completa'}
                                                    >
                                                        {c.docs_completos && <CheckCircle2 size={18} color="#10B981" />}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* En carrito banner */}
                    {enCarritoCirugias.length > 0 && (
                        <div style={{
                            marginTop: '12px', padding: '10px 16px', borderRadius: '10px',
                            background: '#FFFBEB', border: '1px solid #FDE68A',
                            display: 'flex', alignItems: 'center', gap: '8px',
                            fontSize: '0.8rem', color: '#92400E',
                        }}>
                            <ShoppingCart size={16} />
                            <strong>{enCarritoCirugias.length}</strong> expediente(s) ya en el carrito esperando entrega
                        </div>
                    )}
                </div>
            )}

            {/* ════════════════════════════════════════ */}
            {/* TAB 2: Carrito de Entrega               */}
            {/* ════════════════════════════════════════ */}
            {activeTab === 'carrito' && (
                <div>
                    {carritoLoading ? (
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '60px', color: '#9CA3AF', gap: '8px',
                        }}>
                            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                            Cargando carrito...
                        </div>
                    ) : Object.keys(carrito).length === 0 ? (
                        <div style={{
                            textAlign: 'center', padding: '60px 20px', color: '#9CA3AF',
                        }}>
                            <ShoppingCart size={48} strokeWidth={1.2} style={{ margin: '0 auto 12px', display: 'block' }} />
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#6B7280', margin: '0 0 4px' }}>
                                Carrito vacío
                            </h3>
                            <p style={{ fontSize: '0.82rem' }}>
                                Marque la documentación como completa en la pestaña "Cirugías Pendientes" y envíe al carrito.
                            </p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {Object.entries(carrito).map(([asociacion, items]) => {
                                const color = ASOCIACION_COLORS[asociacion] || '#6B7280';
                                return (
                                    <div key={asociacion} style={{
                                        background: '#fff', borderRadius: '12px',
                                        border: '1px solid #E5E7EB', overflow: 'hidden',
                                    }}>
                                        {/* Group Header */}
                                        <div style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '14px 18px',
                                            background: `linear-gradient(135deg, ${color}08, ${color}15)`,
                                            borderBottom: `2px solid ${color}30`,
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div style={{
                                                    width: '10px', height: '10px', borderRadius: '50%',
                                                    background: color,
                                                }} />
                                                <span style={{
                                                    fontWeight: 700, fontSize: '0.9rem', color: '#1F2937',
                                                }}>
                                                    {asociacion}
                                                </span>
                                                <span style={{
                                                    padding: '2px 10px', borderRadius: '10px',
                                                    background: `${color}20`, color: color,
                                                    fontSize: '0.72rem', fontWeight: 700,
                                                }}>
                                                    {items.length} expediente{items.length !== 1 ? 's' : ''}
                                                </span>
                                            </div>

                                            <button
                                                onClick={() => setShowConstanciaModal(asociacion)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '6px',
                                                    padding: '8px 16px', borderRadius: '8px',
                                                    background: color, color: '#fff', border: 'none',
                                                    fontWeight: 700, fontSize: '0.78rem',
                                                    cursor: 'pointer', transition: 'all 0.2s',
                                                    boxShadow: `0 2px 8px ${color}40`,
                                                }}
                                            >
                                                <Printer size={14} />
                                                Generar Constancia
                                            </button>
                                        </div>

                                        {/* Items Table */}
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                            <thead>
                                                <tr style={{ background: '#F9FAFB' }}>
                                                    <th style={thStyle}>Fecha</th>
                                                    <th style={thStyle}>Paciente</th>
                                                    <th style={thStyle}>DNI</th>
                                                    <th style={thStyle}>OS</th>
                                                    <th style={thStyle}>Cirugía</th>
                                                    <th style={thStyle}>Cirujano</th>
                                                    <th style={{ ...thStyle, width: '60px', textAlign: 'center' }}></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {items.map(c => (
                                                    <tr key={c.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                                        <td style={tdStyle}>
                                                            {c.fecha_realizacion ? new Date(c.fecha_realizacion + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
                                                        </td>
                                                        <td style={{ ...tdStyle, fontWeight: 600 }}>{c.nombre_paciente}</td>
                                                        <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '0.76rem' }}>{c.dni || '—'}</td>
                                                        <td style={tdStyle}>{c.cliente || '—'}</td>
                                                        <td style={tdStyle}>{c.nombre_cirugia || '—'}</td>
                                                        <td style={tdStyle}>{c.cirujano || '—'}</td>
                                                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                            <button
                                                                onClick={() => handleQuitarDelCarrito(c.id)}
                                                                title="Quitar del carrito"
                                                                style={{
                                                                    background: 'none', border: 'none', cursor: 'pointer',
                                                                    color: '#DC2626', padding: '4px',
                                                                    borderRadius: '4px', transition: 'background 0.2s',
                                                                }}
                                                                onMouseOver={e => e.currentTarget.style.background = '#FEE2E2'}
                                                                onMouseOut={e => e.currentTarget.style.background = 'none'}
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ════════════════════════════════════════ */}
            {/* TAB 3: Historial de Entregas            */}
            {/* ════════════════════════════════════════ */}
            {activeTab === 'historial' && (
                <div>
                    {constancias.length === 0 ? (
                        <div style={{
                            textAlign: 'center', padding: '60px 20px', color: '#9CA3AF',
                        }}>
                            <History size={48} strokeWidth={1.2} style={{ margin: '0 auto 12px', display: 'block' }} />
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#6B7280', margin: '0 0 4px' }}>
                                Sin entregas registradas
                            </h3>
                            <p style={{ fontSize: '0.82rem' }}>Las constancias de entrega aparecerán aquí.</p>
                        </div>
                    ) : (
                        <div style={{
                            background: '#fff', borderRadius: '12px',
                            border: '1px solid #E5E7EB', overflow: 'hidden',
                        }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr style={{ background: '#F9FAFB' }}>
                                        <th style={{ ...thStyle, width: '36px' }}></th>
                                        <th style={thStyle}>Código</th>
                                        <th style={thStyle}>Asociación</th>
                                        <th style={thStyle}>Fecha</th>
                                        <th style={thStyle}>Responsable</th>
                                        <th style={thStyle}>Cadete</th>
                                        <th style={{ ...thStyle, textAlign: 'center' }}>Expedientes</th>
                                        <th style={{ ...thStyle, textAlign: 'center', width: '100px' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {constancias.map(cons => {
                                        const isExpanded = expandedConstancia === cons.id;
                                        const color = ASOCIACION_COLORS[cons.asociacion] || '#6B7280';
                                        const detalle = constanciaDetalle[cons.id];

                                        return (
                                            <>
                                                <tr
                                                    key={cons.id}
                                                    style={{
                                                        borderBottom: '1px solid #F3F4F6',
                                                        cursor: 'pointer',
                                                        transition: 'background 0.15s',
                                                    }}
                                                    onClick={() => handleExpandConstancia(cons.id)}
                                                    onMouseOver={e => e.currentTarget.style.background = '#FAFBFF'}
                                                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <td style={{ ...tdStyle, textAlign: 'center', padding: '0 4px' }}>
                                                        {isExpanded
                                                            ? <ChevronDown size={16} style={{ color: '#4F46E5', transition: 'transform 0.2s' }} />
                                                            : <ChevronRight size={16} style={{ color: '#9CA3AF', transition: 'transform 0.2s' }} />
                                                        }
                                                    </td>
                                                    <td style={tdStyle}>
                                                        <span style={{
                                                            fontFamily: 'monospace', fontWeight: 700,
                                                            background: '#EEF2FF', color: '#4F46E5',
                                                            padding: '2px 8px', borderRadius: '6px', fontSize: '0.78rem',
                                                        }}>
                                                            {cons.codigo}
                                                        </span>
                                                    </td>
                                                    <td style={tdStyle}>
                                                        <span style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                            padding: '2px 10px', borderRadius: '12px',
                                                            background: `${color}15`, color: color,
                                                            fontSize: '0.72rem', fontWeight: 600,
                                                        }}>
                                                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color }} />
                                                            {cons.asociacion.replace('Asociación de ', '')}
                                                        </span>
                                                    </td>
                                                    <td style={tdStyle}>
                                                        {new Date(cons.fecha_entrega).toLocaleDateString('es-AR', {
                                                            day: '2-digit', month: '2-digit', year: '2-digit',
                                                            hour: '2-digit', minute: '2-digit',
                                                        })}
                                                    </td>
                                                    <td style={tdStyle}>{cons.responsable_entrega}</td>
                                                    <td style={tdStyle}>{cons.nombre_cadete || '—'}</td>
                                                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700 }}>
                                                        {cons.cantidad_expedientes}
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handlePrintConstancia(cons, detalle);
                                                            }}
                                                            style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                padding: '4px 10px', fontSize: '0.72rem', fontWeight: 600,
                                                                borderRadius: '6px', border: '1px solid #93C5FD',
                                                                background: '#EFF6FF', color: '#2563EB',
                                                                cursor: 'pointer', transition: 'all 0.2s',
                                                            }}
                                                            onMouseOver={e => { e.currentTarget.style.background = '#DBEAFE'; }}
                                                            onMouseOut={e => { e.currentTarget.style.background = '#EFF6FF'; }}
                                                        >
                                                            <Printer size={12} /> Reimprimir
                                                        </button>
                                                    </td>
                                                </tr>

                                                {isExpanded && detalle && (
                                                    <tr key={`${cons.id}-detail`} className="animate-fade-in">
                                                        <td colSpan={8} style={{ padding: 0, border: 'none' }}>
                                                            <div style={{
                                                                background: '#F9FAFB',
                                                                borderLeft: `3px solid ${color}`,
                                                                margin: '0 8px 8px 24px',
                                                                borderRadius: '0 8px 8px 0',
                                                                padding: '8px 0',
                                                            }}>
                                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                                                    <thead>
                                                                        <tr>
                                                                            <th style={thSmall}>#</th>
                                                                            <th style={thSmall}>Fecha</th>
                                                                            <th style={thSmall}>Paciente</th>
                                                                            <th style={thSmall}>DNI</th>
                                                                            <th style={thSmall}>OS</th>
                                                                            <th style={thSmall}>Cirugía</th>
                                                                            <th style={thSmall}>Cirujano</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {detalle.map((item, idx) => (
                                                                            <tr key={item.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                                                                                <td style={{ ...tdSmall, textAlign: 'center', fontWeight: 700, color: '#9CA3AF' }}>{idx + 1}</td>
                                                                                <td style={tdSmall}>
                                                                                    {item.fecha_realizacion ? new Date(item.fecha_realizacion + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
                                                                                </td>
                                                                                <td style={{ ...tdSmall, fontWeight: 600 }}>{item.nombre_paciente}</td>
                                                                                <td style={{ ...tdSmall, fontFamily: 'monospace' }}>{item.dni || '—'}</td>
                                                                                <td style={tdSmall}>{item.cliente || '—'}</td>
                                                                                <td style={tdSmall}>{item.nombre_cirugia || '—'}</td>
                                                                                <td style={tdSmall}>{item.cirujano || '—'}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
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
            )}

            {/* ════════════════════════════════════════ */}
            {/* MODAL: Generar Constancia                */}
            {/* ════════════════════════════════════════ */}
            {showConstanciaModal && (
                <ConstanciaModal
                    asociacion={showConstanciaModal}
                    items={carrito[showConstanciaModal] || []}
                    currentUser={currentUser}
                    onClose={() => setShowConstanciaModal(null)}
                    onGenerated={async (constanciaData) => {
                        setShowConstanciaModal(null);
                        addToast?.(`✅ Constancia ${constanciaData.codigo} generada`, 'success');
                        // Print immediately
                        const detalle = await fetchConstanciaDetalle(constanciaData.id);
                        setPrintData({ constancia: constanciaData, items: detalle });
                        setTimeout(() => window.print(), 200);
                        // Refresh tabs
                        loadCarrito();
                        loadPendientes();
                    }}
                    addToast={addToast}
                />
            )}

            {/* Print Template (hidden, shows on print) */}
            {printData && (
                <PrintConstanciaEntrega
                    ref={printRef}
                    constancia={printData.constancia}
                    items={printData.items}
                />
            )}
        </div>
    );
}

// ═══════════════════════════════
// Modal: Generar Constancia
// ═══════════════════════════════
function ConstanciaModal({ asociacion, items, currentUser, onClose, onGenerated, addToast }) {
    const [responsable, setResponsable] = useState('');
    const [nombreCadete, setNombreCadete] = useState('');
    const [notas, setNotas] = useState('');
    const [generating, setGenerating] = useState(false);

    // Load default responsible from localStorage or config
    useEffect(() => {
        const saved = localStorage.getItem('asociaciones_responsable');
        setResponsable(saved || currentUser?.nombre || 'Carlos');
    }, [currentUser]);

    const handleGenerar = async () => {
        if (!responsable.trim()) {
            addToast?.('Ingrese el nombre del responsable de entrega', 'error');
            return;
        }
        setGenerating(true);
        try {
            // Save default for next time
            localStorage.setItem('asociaciones_responsable', responsable);
            const constancia = await generarConstancia({
                asociacion,
                responsable: responsable.trim(),
                nombreCadete: nombreCadete.trim(),
                notas: notas.trim(),
            });
            onGenerated(constancia);
        } catch (err) {
            addToast?.('Error al generar constancia: ' + err.message, 'error');
        } finally {
            setGenerating(false);
        }
    };

    const color = ASOCIACION_COLORS[asociacion] || '#6366F1';

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', zIndex: 999999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <div style={{
                background: '#fff', borderRadius: '16px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                padding: '28px', width: '90%', maxWidth: '500px',
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px',
                }}>
                    <div style={{
                        width: '40px', height: '40px', borderRadius: '10px',
                        background: `linear-gradient(135deg, ${color}, ${color}CC)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Printer size={20} color="#fff" />
                    </div>
                    <div>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: '#1F2937' }}>
                            Generar Constancia de Entrega
                        </h3>
                        <p style={{ fontSize: '0.78rem', margin: 0, color: '#9CA3AF' }}>
                            {asociacion} • {items.length} expediente{items.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                </div>

                {/* Form */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
                    <div>
                        <label style={labelStyle}>Responsable de entrega *</label>
                        <input
                            type="text"
                            value={responsable}
                            onChange={e => setResponsable(e.target.value)}
                            placeholder="Nombre completo"
                            style={inputStyle}
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>Nombre del cadete que retira</label>
                        <input
                            type="text"
                            value={nombreCadete}
                            onChange={e => setNombreCadete(e.target.value)}
                            placeholder="Quién retira la documentación"
                            style={inputStyle}
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>Observaciones</label>
                        <textarea
                            value={notas}
                            onChange={e => setNotas(e.target.value)}
                            placeholder="Notas opcionales..."
                            rows={2}
                            style={{ ...inputStyle, resize: 'vertical' }}
                        />
                    </div>
                </div>

                {/* Preview */}
                <div style={{
                    padding: '10px 14px', borderRadius: '8px',
                    background: '#F9FAFB', border: '1px solid #E5E7EB',
                    marginBottom: '20px', maxHeight: '150px', overflowY: 'auto',
                }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6B7280', marginBottom: '6px', textTransform: 'uppercase' }}>
                        Expedientes a incluir:
                    </div>
                    {items.map((item, idx) => (
                        <div key={item.id} style={{
                            fontSize: '0.76rem', color: '#374151', padding: '2px 0',
                            borderBottom: idx < items.length - 1 ? '1px solid #F3F4F6' : 'none',
                        }}>
                            <strong>{idx + 1}.</strong> {item.nombre_paciente} — {item.nombre_cirugia || 'Cirugía'}
                        </div>
                    ))}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button
                        onClick={onClose}
                        disabled={generating}
                        style={{
                            padding: '10px 20px', borderRadius: '8px',
                            background: '#F3F4F6', border: 'none', color: '#6B7280',
                            fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                        }}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleGenerar}
                        disabled={generating}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '10px 24px', borderRadius: '8px',
                            background: generating ? '#9CA3AF' : `linear-gradient(135deg, ${color}, ${color}DD)`,
                            border: 'none', color: '#fff',
                            fontWeight: 700, fontSize: '0.82rem',
                            cursor: generating ? 'wait' : 'pointer',
                            boxShadow: `0 2px 8px ${color}40`,
                            transition: 'all 0.2s',
                        }}
                    >
                        {generating ? (
                            <>
                                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                Generando...
                            </>
                        ) : (
                            <>
                                <Printer size={14} />
                                Imprimir y Registrar
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Styles ───
const thStyle = {
    padding: '10px 12px', textAlign: 'left',
    fontSize: '0.72rem', fontWeight: 700, color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: '0.04em',
    borderBottom: '2px solid #E5E7EB',
};

const tdStyle = {
    padding: '10px 12px', color: '#374151',
};

const thSmall = {
    padding: '4px 10px', fontSize: '0.68rem', fontWeight: 700,
    color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em',
    textAlign: 'left',
};

const tdSmall = {
    padding: '5px 10px', fontSize: '0.78rem', color: '#4B5563',
};

const labelStyle = {
    display: 'block', fontSize: '0.78rem', fontWeight: 700,
    color: '#374151', marginBottom: '4px',
};

const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: '1px solid #D1D5DB', fontSize: '0.85rem',
    color: '#374151', outline: 'none',
    transition: 'border-color 0.2s',
};
