/**
 * PublicRecepcionView.jsx — Portal Público de Recepción
 * 
 * Gestión de garantías y rendiciones para el sector Recepción.
 * Diseño alineado con la estética institucional del sistema ADM-QUI.
 * Paginación completa, buscador y generación de PDF.
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
    Search, ShoppingCart, CheckCircle, PlusCircle, Trash2, Printer,
    Calendar, User, FileText, Shield, RefreshCw, ChevronDown,
    Package, ArrowRight, Clock, Building2, ChevronLeft, ChevronRight,
    ChevronsLeft, ChevronsRight
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useReactToPrint } from 'react-to-print';
import PrintGarantias from './PrintGarantias';
import { toggleCarritoRendicion, emitirRendicion } from '../services/garantiasService';

export default function PublicRecepcionView() {
    const [admisiones, setAdmisiones] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [activeTab, setActiveTab] = useState('pendientes');
    const [pageSize, setPageSize] = useState(50);
    const [currentPage, setCurrentPage] = useState(0);

    // Rendición
    const [entrega, setEntrega] = useState('');
    const [recibe, setRecibe] = useState('');
    const [notas, setNotas] = useState('');
    const [showRendicionForm, setShowRendicionForm] = useState(false);

    // Print
    const printRef = useRef();
    const [rendicionData, setRendicionData] = useState(null);
    const [readyToPrint, setReadyToPrint] = useState(false);

    // ── Cargar datos con paginación ──
    const loadData = useCallback(async (page = currentPage, size = pageSize, search = searchTerm) => {
        setLoading(true);
        try {
            const from = page * size;
            const to = from + size - 1;

            let query = supabase
                .from('altas_administrativas')
                .select(`
                    id, paciente, id_paciente, cliente, fecha_ingreso, especialidad, numero_admision,
                    garantia_estado, garantia_ubicacion, en_carrito_rendicion
                `, { count: 'exact' })
                .order('fecha_ingreso', { ascending: false })
                .range(from, to);

            // Aplicar búsqueda server-side
            if (search && search.trim()) {
                const s = search.trim();
                query = query.or(`paciente.ilike.%${s}%,id_paciente.ilike.%${s}%,cliente.ilike.%${s}%,numero_admision.ilike.%${s}%`);
            }

            const { data, error, count } = await query;

            if (error) throw error;
            setAdmisiones((data || []).map(a => ({ ...a, dni: a.id_paciente })));
            setTotalCount(count || 0);
        } catch (error) {
            console.error("Error al cargar admisiones:", error);
        } finally {
            setLoading(false);
        }
    }, [currentPage, pageSize, searchTerm]);

    useEffect(() => { loadData(currentPage, pageSize, searchTerm); }, [currentPage, pageSize, searchTerm]);

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    // Buscar con debounce al presionar Enter o el botón
    const handleSearch = () => {
        setSearchTerm(searchInput);
        setCurrentPage(0);
    };

    const handleSearchKeyDown = (e) => {
        if (e.key === 'Enter') handleSearch();
    };

    const handlePageSizeChange = (newSize) => {
        setPageSize(newSize);
        setCurrentPage(0);
    };

    // Cart items (loaded separately since they may not be in current page)
    const [cartItems, setCartItems] = useState([]);
    const loadCartItems = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('altas_administrativas')
                .select('id, paciente, id_paciente, cliente, fecha_ingreso, especialidad, numero_admision')
                .eq('en_carrito_rendicion', true)
                .order('carrito_rendicion_at', { ascending: true });
            if (error) throw error;
            setCartItems((data || []).map(a => ({ ...a, dni: a.id_paciente })));
        } catch (e) {
            console.error('Error loading cart:', e);
        }
    }, []);

    useEffect(() => { loadCartItems(); }, []);

    const handleRegistrarGarantia = async (id) => {
        try {
            const { error } = await supabase
                .from('altas_administrativas')
                .update({
                    garantia_estado: 'Pendiente',
                    garantia_ubicacion: 'Recepción'
                })
                .eq('id', id);

            if (error) throw error;
            setAdmisiones(prev => prev.map(a => a.id === id ? { ...a, garantia_estado: 'Pendiente', garantia_ubicacion: 'Recepción' } : a));
        } catch (error) {
            console.error("Error:", error);
            alert("No se pudo registrar la garantía");
        }
    };

    const handleToggleCart = async (id, inCart) => {
        try {
            await toggleCarritoRendicion(id, inCart, 'Recepción');
            setAdmisiones(prev => prev.map(a => a.id === id ? { ...a, en_carrito_rendicion: inCart } : a));
            await loadCartItems();
        } catch (error) {
            console.error(error);
            alert("Error al actualizar carrito");
        }
    };

    const handleEmitirRendicion = async () => {
        if (!entrega || !recibe) return alert("Completá quién entrega y quién recibe");

        try {
            const ids = cartItems.map(c => c.id);
            const snapshotGarantias = [...cartItems]; // Snapshot BEFORE anything changes
            const data = { entrega, recibe, notas, firma_entrega: null, firma_recibe: null };
            const result = await emitirRendicion(ids, data, 'Recepción');

            // Set print data with the snapshot
            setRendicionData({
                codigo: result.codigo,
                fecha: new Date(),
                entrega, recibe, notas,
                garantias: snapshotGarantias
            });

            setEntrega('');
            setRecibe('');
            setNotas('');
            setShowRendicionForm(false);

            // Reload everything
            await Promise.all([loadData(currentPage, pageSize, searchTerm), loadCartItems()]);

            // Trigger print after state settles
            setReadyToPrint(true);
        } catch (error) {
            console.error(error);
            alert("Error al emitir rendición: " + (error.message || error));
        }
    };

    const handlePrint = useReactToPrint({
        content: () => printRef.current,
        documentTitle: 'Rendicion_Garantias',
    });

    // Effect: trigger print when ready
    useEffect(() => {
        if (readyToPrint && rendicionData && rendicionData.garantias?.length > 0) {
            const timer = setTimeout(() => {
                if (printRef.current) {
                    handlePrint();
                }
                setReadyToPrint(false);
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [readyToPrint, rendicionData]);

    // Stats
    const stats = useMemo(() => {
        return {
            totalVisible: totalCount,
            enCarrito: cartItems.length,
        };
    }, [totalCount, cartItems]);

    return (
        <div style={{ minHeight: '100vh', background: '#F1F5F9', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
            {/* ═══ HEADER INSTITUCIONAL ═══ */}
            <div style={{
                background: 'linear-gradient(135deg, #184D87 0%, #1E5FA6 50%, #2563EB 100%)',
                padding: '0', borderBottom: '3px solid #123B68',
            }}>
                {/* Top Bar */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 32px',
                    borderBottom: '1px solid rgba(255,255,255,0.15)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <img
                            src="/logosanatorio.png"
                            alt="Sanatorio Argentino"
                            style={{ width: '40px', height: '40px', objectFit: 'contain', borderRadius: '8px', background: 'rgba(255,255,255,0.15)', padding: '4px' }}
                        />
                        <div>
                            <div style={{ color: 'white', fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.3px' }}>
                                Administración Sanatorio Argentino
                            </div>
                            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.78rem' }}>
                                Sistema de Gestión Integral
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{
                            color: 'rgba(255,255,255,0.8)', fontSize: '0.82rem', fontWeight: 500,
                            display: 'flex', alignItems: 'center', gap: '6px'
                        }}>
                            <Clock size={14} />
                            {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                    </div>
                </div>

                {/* Module Title */}
                <div style={{ padding: '16px 32px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <div style={{
                            background: 'rgba(255,255,255,0.2)', borderRadius: '10px', padding: '8px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Shield size={22} color="white" />
                        </div>
                        <div>
                            <h1 style={{ margin: 0, color: 'white', fontSize: '1.35rem', fontWeight: 700, letterSpacing: '-0.3px' }}>
                                Gestión de Garantías — Recepción
                            </h1>
                            <p style={{ margin: '2px 0 0', color: 'rgba(255,255,255,0.65)', fontSize: '0.82rem' }}>
                                Registro y rendición de garantías / compromisos de pago — {totalCount} registros
                            </p>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ padding: '0 32px', display: 'flex', gap: '4px' }}>
                    {[
                        { id: 'pendientes', label: 'Tabla', icon: <FileText size={15} /> },
                        { id: 'carrito', label: 'Carrito', icon: <ShoppingCart size={15} />, badge: cartItems.length },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                background: activeTab === tab.id ? 'white' : 'rgba(255,255,255,0.1)',
                                color: activeTab === tab.id ? '#184D87' : 'rgba(255,255,255,0.8)',
                                border: 'none', padding: '10px 20px',
                                borderRadius: '8px 8px 0 0', fontWeight: 600,
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                                fontSize: '0.88rem', transition: 'all 0.2s'
                            }}
                        >
                            {tab.icon} {tab.label}
                            {tab.badge > 0 && (
                                <span style={{
                                    background: activeTab === tab.id ? '#EF4444' : 'rgba(255,255,255,0.3)',
                                    color: 'white',
                                    padding: '1px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 700
                                }}>
                                    {tab.badge}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* ═══ CONTENT ═══ */}
            <div style={{ padding: '24px 32px', maxWidth: '1400px', margin: '0 auto' }}>

                {activeTab === 'pendientes' ? (
                    <div>
                        {/* Search + Page Size + Refresh */}
                        <div style={{
                            background: 'white', borderRadius: '12px', padding: '12px 16px',
                            border: '1px solid #E2E8F0', marginBottom: '16px',
                            display: 'flex', gap: '12px', alignItems: 'center',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                        }}>
                            <div style={{ flex: 1, position: 'relative' }}>
                                <Search size={18} style={{ position: 'absolute', left: '14px', top: '11px', color: '#94A3B8' }} />
                                <input
                                    type="text"
                                    placeholder="Buscar por nombre, DNI u Obra Social..."
                                    value={searchInput}
                                    onChange={e => setSearchInput(e.target.value)}
                                    onKeyDown={handleSearchKeyDown}
                                    style={{
                                        width: '100%', padding: '10px 16px 10px 42px',
                                        borderRadius: '8px', border: '1px solid #CBD5E1',
                                        fontSize: '0.9rem', outline: 'none',
                                        transition: 'border-color 0.2s'
                                    }}
                                    onFocus={e => e.target.style.borderColor = '#3B82F6'}
                                    onBlur={e => e.target.style.borderColor = '#CBD5E1'}
                                />
                            </div>
                            <button
                                onClick={handleSearch}
                                style={{
                                    background: '#184D87', color: 'white', border: 'none', borderRadius: '8px',
                                    padding: '10px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                    gap: '6px', fontWeight: 600, fontSize: '0.85rem'
                                }}
                            >
                                <Search size={16} /> Buscar
                            </button>

                            {/* Page Size Selector */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: '#64748B' }}>
                                <span>Mostrar:</span>
                                {[10, 50, 100].map(size => (
                                    <button
                                        key={size}
                                        onClick={() => handlePageSizeChange(size)}
                                        style={{
                                            background: pageSize === size ? '#184D87' : '#F1F5F9',
                                            color: pageSize === size ? 'white' : '#475569',
                                            border: '1px solid ' + (pageSize === size ? '#184D87' : '#CBD5E1'),
                                            borderRadius: '6px', padding: '5px 10px',
                                            cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        {size}
                                    </button>
                                ))}
                            </div>

                            <button
                                onClick={() => loadData(currentPage, pageSize, searchTerm)}
                                style={{
                                    background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '8px',
                                    padding: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                    color: '#475569'
                                }}
                                title="Actualizar"
                            >
                                <RefreshCw size={16} />
                            </button>
                        </div>

                        {/* Table */}
                        <div style={{
                            background: 'white', borderRadius: '12px',
                            border: '1px solid #E2E8F0', overflow: 'hidden',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                        }}>
                            {loading ? (
                                <p style={{ textAlign: 'center', color: '#64748B', padding: '40px' }}>
                                    Cargando admisiones...
                                </p>
                            ) : admisiones.length === 0 ? (
                                <p style={{ textAlign: 'center', color: '#64748B', padding: '40px' }}>
                                    No hay admisiones que coincidan con la búsqueda.
                                </p>
                            ) : (
                                <>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                                                <th style={thStyle}>Paciente / Internación</th>
                                                <th style={thStyle}>Obra Social</th>
                                                <th style={thStyle}>Ubicación</th>
                                                <th style={thStyle}>Estado</th>
                                                <th style={{ ...thStyle, textAlign: 'right' }}>Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {admisiones.map(adm => (
                                                <tr key={adm.id} style={{
                                                    borderBottom: '1px solid #F1F5F9',
                                                    transition: 'background 0.15s',
                                                    background: adm.en_carrito_rendicion ? '#F0FDF4' : 'transparent'
                                                }}
                                                    onMouseEnter={e => e.currentTarget.style.background = adm.en_carrito_rendicion ? '#DCFCE7' : '#F8FAFC'}
                                                    onMouseLeave={e => e.currentTarget.style.background = adm.en_carrito_rendicion ? '#F0FDF4' : 'transparent'}
                                                >
                                                    <td style={tdStyle}>
                                                        <div style={{ fontWeight: 600, color: '#1E293B', fontSize: '0.92rem' }}>
                                                            {adm.paciente}
                                                        </div>
                                                        <div style={{ fontSize: '0.78rem', color: '#94A3B8', display: 'flex', gap: '12px', marginTop: '2px' }}>
                                                            <span>DNI: {adm.dni || '-'}</span>
                                                            <span>|</span>
                                                            <span>Ingreso: {adm.fecha_ingreso ? new Date(adm.fecha_ingreso + 'T12:00:00').toLocaleDateString('es-AR') : '-'}</span>
                                                        </div>
                                                    </td>
                                                    <td style={tdStyle}>
                                                        <span style={{ color: '#334155', fontSize: '0.88rem' }}>{adm.cliente || '-'}</span>
                                                    </td>
                                                    <td style={tdStyle}>
                                                        {ubicacionBadge(adm.garantia_ubicacion)}
                                                    </td>
                                                    <td style={tdStyle}>
                                                        {estadoBadge(adm.garantia_estado)}
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                                                        {adm.garantia_ubicacion === 'Administración' ? (
                                                            <span style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: '5px',
                                                                padding: '5px 12px', borderRadius: '8px',
                                                                background: '#D1FAE5', color: '#065F46',
                                                                fontSize: '0.8rem', fontWeight: 600
                                                            }}>
                                                                <CheckCircle size={14} /> Enviado a Adm.
                                                            </span>
                                                        ) : !adm.garantia_estado ? (
                                                            <button onClick={() => handleRegistrarGarantia(adm.id)} style={btnOutline}>
                                                                <PlusCircle size={14} /> Garantía
                                                            </button>
                                                        ) : adm.en_carrito_rendicion ? (
                                                            <button onClick={() => handleToggleCart(adm.id, false)} style={btnSuccess}>
                                                                <CheckCircle size={14} /> En Carrito
                                                            </button>
                                                        ) : (
                                                            <button onClick={() => handleToggleCart(adm.id, true)} style={btnPrimary}>
                                                                <ShoppingCart size={14} /> Al Carrito
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>

                                    {/* ── Pagination ── */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '12px 16px', borderTop: '1px solid #E2E8F0',
                                        background: '#F8FAFC', fontSize: '0.82rem', color: '#64748B'
                                    }}>
                                        <span>
                                            Mostrando {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, totalCount)} de <strong>{totalCount}</strong> registros
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <button onClick={() => setCurrentPage(0)} disabled={currentPage === 0} style={pgBtn(currentPage === 0)}>
                                                <ChevronsLeft size={16} />
                                            </button>
                                            <button onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0} style={pgBtn(currentPage === 0)}>
                                                <ChevronLeft size={16} />
                                            </button>
                                            <span style={{ padding: '0 12px', fontWeight: 600, color: '#1E293B' }}>
                                                Página {currentPage + 1} de {totalPages}
                                            </span>
                                            <button onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1} style={pgBtn(currentPage >= totalPages - 1)}>
                                                <ChevronRight size={16} />
                                            </button>
                                            <button onClick={() => setCurrentPage(totalPages - 1)} disabled={currentPage >= totalPages - 1} style={pgBtn(currentPage >= totalPages - 1)}>
                                                <ChevronsRight size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                ) : (
                    /* ═══ CARRITO DE RENDICIÓN ═══ */
                    <div>
                        <div style={{
                            background: 'white', borderRadius: '12px', padding: '24px',
                            border: '1px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                        }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #F1F5F9'
                            }}>
                                <div style={{
                                    background: '#EBF2FA', borderRadius: '10px', padding: '8px',
                                    display: 'flex', color: '#184D87'
                                }}>
                                    <ShoppingCart size={20} />
                                </div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#1E293B', fontWeight: 700 }}>
                                        Carrito de Rendición
                                    </h2>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B' }}>
                                        Garantías seleccionadas para entregar a Administración
                                    </p>
                                </div>
                            </div>

                            {cartItems.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '48px 0' }}>
                                    <ShoppingCart size={40} color="#CBD5E1" style={{ marginBottom: '12px' }} />
                                    <p style={{ color: '#64748B', margin: 0 }}>
                                        El carrito está vacío. Buscá admisiones y envialas al carrito para generar la rendición.
                                    </p>
                                </div>
                            ) : (
                                <div>
                                    <div style={{
                                        borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden',
                                        marginBottom: '24px'
                                    }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                                                    <th style={thStyle}>Paciente</th>
                                                    <th style={thStyle}>Obra Social</th>
                                                    <th style={thStyle}>Fecha Ingreso</th>
                                                    <th style={{ ...thStyle, textAlign: 'center', width: '60px' }}>Quitar</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {cartItems.map(c => (
                                                    <tr key={c.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                        <td style={tdStyle}>
                                                            <span style={{ fontWeight: 600, color: '#1E293B' }}>{c.paciente}</span>
                                                        </td>
                                                        <td style={{ ...tdStyle, color: '#475569' }}>{c.cliente || '-'}</td>
                                                        <td style={{ ...tdStyle, color: '#475569' }}>
                                                            {c.fecha_ingreso ? new Date(c.fecha_ingreso + 'T12:00:00').toLocaleDateString('es-AR') : '-'}
                                                        </td>
                                                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                            <button
                                                                onClick={() => handleToggleCart(c.id, false)}
                                                                style={{
                                                                    background: 'none', border: 'none', cursor: 'pointer',
                                                                    color: '#EF4444', padding: '4px'
                                                                }}
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {!showRendicionForm ? (
                                        <button
                                            onClick={() => setShowRendicionForm(true)}
                                            style={{
                                                background: 'linear-gradient(135deg, #184D87, #1E5FA6)',
                                                color: 'white', border: 'none',
                                                padding: '14px 28px', borderRadius: '10px', fontWeight: 700,
                                                width: '100%', cursor: 'pointer', fontSize: '1rem',
                                                boxShadow: '0 2px 8px rgba(24,77,135,0.25)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                                            }}
                                        >
                                            <Printer size={20} /> Generar Hoja de Rendición ({cartItems.length} garantías)
                                        </button>
                                    ) : (
                                        <div style={{
                                            display: 'grid', gap: '14px',
                                            background: '#EBF2FA', padding: '20px', borderRadius: '12px',
                                            border: '1px solid #D0E1F3'
                                        }}>
                                            <h4 style={{ margin: 0, color: '#184D87', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <ArrowRight size={18} /> Datos de Entrega
                                            </h4>
                                            <input
                                                type="text" placeholder="Entregado por (tu nombre)"
                                                value={entrega} onChange={e => setEntrega(e.target.value)}
                                                style={inputStyle}
                                            />
                                            <input
                                                type="text" placeholder="Recibido por (nombre en Administración)"
                                                value={recibe} onChange={e => setRecibe(e.target.value)}
                                                style={inputStyle}
                                            />
                                            <textarea
                                                placeholder="Notas u observaciones (opcional)"
                                                value={notas} onChange={e => setNotas(e.target.value)}
                                                style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' }}
                                            />
                                            <div style={{ display: 'flex', gap: '12px' }}>
                                                <button
                                                    onClick={() => setShowRendicionForm(false)}
                                                    style={{
                                                        flex: 1, background: 'white', color: '#475569',
                                                        border: '1px solid #CBD5E1', padding: '12px', borderRadius: '8px',
                                                        fontWeight: 600, cursor: 'pointer'
                                                    }}
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    onClick={handleEmitirRendicion}
                                                    style={{
                                                        flex: 2, background: 'linear-gradient(135deg, #184D87, #1E5FA6)',
                                                        color: 'white', border: 'none', padding: '12px', borderRadius: '8px',
                                                        fontWeight: 700, cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                                        boxShadow: '0 2px 8px rgba(24,77,135,0.25)'
                                                    }}
                                                >
                                                    <Printer size={18} /> Confirmar e Imprimir Rendición
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ═══ HIDDEN PRINT TEMPLATE ═══ */}
            <div style={{ position: 'absolute', left: '-9999px', top: 0, width: '210mm' }}>
                <PrintGarantias ref={printRef} data={rendicionData} />
            </div>
        </div>
    );
}

// ── Helpers de badges ──
function ubicacionBadge(ub) {
    const map = {
        'Recepción': { bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
        'Administración': { bg: '#D1FAE5', color: '#065F46', border: '#A7F3D0' },
    };
    const s = map[ub] || { bg: '#F1F5F9', color: '#475569', border: '#E2E8F0' };
    return (
        <span style={{
            padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem',
            fontWeight: 600, background: s.bg, color: s.color, border: `1px solid ${s.border}`,
            whiteSpace: 'nowrap'
        }}>
            {ub || '-'}
        </span>
    );
}

function estadoBadge(estado) {
    const map = {
        'Activa': { bg: '#DBEAFE', color: '#1E40AF', border: '#BFDBFE' },
        'Pendiente': { bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
    };
    const s = map[estado] || { bg: '#F1F5F9', color: '#475569', border: '#E2E8F0' };
    return (
        <span style={{
            padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem',
            fontWeight: 600, background: s.bg, color: s.color, border: `1px solid ${s.border}`,
            whiteSpace: 'nowrap'
        }}>
            {estado || '-'}
        </span>
    );
}

// ── Estilos reutilizables ──
const thStyle = {
    padding: '10px 16px',
    textAlign: 'left',
    fontSize: '0.78rem',
    fontWeight: 600,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: '0.3px'
};

const tdStyle = {
    padding: '12px 16px',
    fontSize: '0.88rem',
    verticalAlign: 'middle'
};

const btnOutline = {
    background: 'white', color: '#184D87', border: '1px solid #A1C3E7',
    padding: '6px 14px', borderRadius: '8px', fontWeight: 600,
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px',
    fontSize: '0.82rem', transition: 'all 0.15s'
};

const btnPrimary = {
    background: '#184D87', color: 'white', border: 'none',
    padding: '6px 14px', borderRadius: '8px', fontWeight: 600,
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px',
    fontSize: '0.82rem', transition: 'all 0.15s'
};

const btnSuccess = {
    background: '#D1FAE5', color: '#065F46', border: '1px solid #A7F3D0',
    padding: '6px 14px', borderRadius: '8px', fontWeight: 600,
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px',
    fontSize: '0.82rem', transition: 'all 0.15s'
};

const inputStyle = {
    padding: '11px 14px', borderRadius: '8px',
    border: '1px solid #CBD5E1', outline: 'none', fontSize: '0.9rem',
    background: 'white'
};

const pgBtn = (disabled) => ({
    background: disabled ? '#F1F5F9' : 'white',
    border: '1px solid #CBD5E1',
    borderRadius: '6px', padding: '6px 8px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    color: disabled ? '#CBD5E1' : '#475569',
    display: 'flex', alignItems: 'center',
    opacity: disabled ? 0.5 : 1,
    transition: 'all 0.15s'
});
