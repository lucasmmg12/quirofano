/**
 * FichasAdmisionesPanel.jsx — Panel de Entrega de Fichas de Admisiones Físicas
 * 
 * Circuito operativo diario:
 * - Selección de admisiones pendientes y envío al carrito
 * - Control de documentación completa / incompleta
 * - Registro de responsables de entrega (ej: Francisco) y recepción (Administración)
 * - Captura de firmas digitales interactivas
 * - Generación de remito de constancia PDF con estética oficial
 * - Historial y devolución de fichas a Recepción con motivo
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    FileText, ShoppingCart, History, Search, CheckCircle2,
    AlertCircle, RotateCcw, Printer, Trash2, Check, X,
    Copy, UserCheck, ShieldCheck, ArrowRight, CornerDownLeft,
    RefreshCw, Filter, ChevronDown, ChevronRight, AlertTriangle,
    Clock, Building2, Send, Download, Eye
} from 'lucide-react';
import {
    fetchAdmisionesFichas,
    fetchResumenFichas,
    toggleCarritoFicha,
    toggleMultipleCarritoFichas,
    fetchCarritoFichas,
    vaciarCarritoFichas,
    emitirEntregaFichas,
    fetchHistorialEntregas,
    fetchEntregaConDetalle,
    devolverFichaARecepcion,
    subsanarFichaDevuelta
} from '../services/fichasAdmisionesService';
import DigitalSignaturePad from './common/DigitalSignaturePad';
import PrintConstanciaFichas from './PrintConstanciaFichas';
import CircuitoFichasBanner from './common/CircuitoFichasBanner';
import { generarPdfConstanciaFichas } from '../utils/fichasEntregaPdf';

export default function FichasAdmisionesPanel({ isPublic = false, currentUser = null }) {
    // Pestañas
    const [activeTab, setActiveTab] = useState('pendientes'); // 'pendientes' | 'carrito' | 'historial'
    const [loading, setLoading] = useState(true);

    // Estado Pestaña 1: Pendientes
    const [admisiones, setAdmisiones] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [filtroEstado, setFiltroEstado] = useState('pendientes');
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [resumen, setResumen] = useState({ pendientes: 0, enCarrito: 0, devueltas: 0, entregadas: 0 });
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(50);
    const [sortBy, setSortBy] = useState('paciente'); // Orden alfabético por defecto
    const [sortAsc, setSortAsc] = useState(true);

    const handleToggleSort = (field) => {
        if (sortBy === field) {
            setSortAsc(prev => !prev);
        } else {
            setSortBy(field);
            setSortAsc(true);
        }
        setPage(0);
    };

    // Estado Pestaña 2: Carrito
    const [cartItems, setCartItems] = useState([]);
    const [loadingCart, setLoadingCart] = useState(false);
    const [responsableEntrega, setResponsableEntrega] = useState('Francisco');
    const [responsableRecibe, setResponsableRecibe] = useState('Administración');
    const [observacionesLote, setObservacionesLote] = useState('');
    const [firmaEntrega, setFirmaEntrega] = useState(null);
    const [firmaRecibe, setFirmaRecibe] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    // Estado Pestaña 3: Historial
    const [historial, setHistorial] = useState([]);
    const [historialSearch, setHistorialSearch] = useState('');
    const [loadingHistorial, setLoadingHistorial] = useState(false);
    const [expandedEntregaId, setExpandedEntregaId] = useState(null);
    const [entregaDetalles, setEntregaDetalles] = useState({});

    // Modal de Devolución
    const [devolucionModal, setDevolucionModal] = useState(null); // { item, entregaId }
    const [devolucionMotivo, setDevolucionMotivo] = useState('');
    const [devolucionSubmitting, setDevolucionSubmitting] = useState(false);

    // Toasts
    const [toast, setToast] = useState(null);
    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    // Impresión
    const printRef = useRef(null);
    const [printData, setPrintData] = useState(null);

    // ─── Carga de Datos ───
    const loadPendientes = useCallback(async () => {
        setLoading(true);
        try {
            const [resData, resResumen] = await Promise.all([
                fetchAdmisionesFichas({
                    search: searchTerm,
                    filtroEstado,
                    page,
                    pageSize,
                    orderBy: sortBy,
                    orderAsc: sortAsc
                }),
                fetchResumenFichas()
            ]);
            setAdmisiones(resData.data);
            setTotalCount(resData.totalCount);
            setResumen(resResumen);
        } catch (err) {
            console.error('[FichasAdmisiones] Error loading pendientes:', err);
            showToast('Error cargando admisiones', 'error');
        } finally {
            setLoading(false);
        }
    }, [searchTerm, filtroEstado, page, pageSize, sortBy, sortAsc]);

    const loadCarrito = useCallback(async () => {
        setLoadingCart(true);
        try {
            const data = await fetchCarritoFichas();
            setCartItems(data);
        } catch (err) {
            console.error('[FichasAdmisiones] Error loading cart:', err);
        } finally {
            setLoadingCart(false);
        }
    }, []);

    const loadHistorial = useCallback(async () => {
        setLoadingHistorial(true);
        try {
            const res = await fetchHistorialEntregas({ search: historialSearch });
            setHistorial(res.data);
            if (historialSearch.trim() && res.data.length > 0 && res.data.length <= 3) {
                const firstId = res.data[0].id;
                setExpandedEntregaId(firstId);
                fetchEntregaConDetalle(firstId).then(det => {
                    setEntregaDetalles(prev => ({ ...prev, [firstId]: det }));
                });
            }
        } catch (err) {
            console.error('[FichasAdmisiones] Error loading historial:', err);
        } finally {
            setLoadingHistorial(false);
        }
    }, [historialSearch]);

    useEffect(() => {
        if (activeTab === 'pendientes') {
            loadPendientes();
        } else if (activeTab === 'carrito') {
            loadCarrito();
        } else if (activeTab === 'historial') {
            loadHistorial();
        }
    }, [activeTab, loadPendientes, loadCarrito, loadHistorial]);

    // Impresión manejada directamente vía generador oficial PDF Sanatorio Argentino (fichasEntregaPdf)

    // ─── Búsqueda con Enter o Botón ───
    const handleSearchSubmit = (e) => {
        if (e) e.preventDefault();
        setSearchTerm(searchInput);
        setPage(0);
    };

    // ─── Manejo de Selección Múltiple ───
    const handleToggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSelectAllCurrentPage = () => {
        if (selectedIds.size === admisiones.length && admisiones.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(admisiones.map(a => a.id)));
        }
    };

    // ─── Enviar al Carrito ───
    const handleEnviarSeleccionadasAlCarrito = async () => {
        if (selectedIds.size === 0) return;
        try {
            const ids = Array.from(selectedIds);
            await toggleMultipleCarritoFichas(ids, true, currentUser?.nombre || 'Recepción');
            setSelectedIds(new Set());
            showToast(`${ids.length} fichas agregadas al carrito`);
            loadPendientes();
        } catch (err) {
            showToast('Error al agregar al carrito', 'error');
        }
    };

    const handleToggleSingleCarrito = async (item, inCart) => {
        try {
            await toggleCarritoFicha(item.id, inCart, currentUser?.nombre || 'Recepción');
            showToast(inCart ? 'Ficha enviada al carrito' : 'Ficha quitada del carrito');
            loadPendientes();
        } catch (err) {
            showToast('Error al actualizar carrito', 'error');
        }
    };

    // ─── Modificar Estado Documental de una Ficha en Carrito ───
    const handleUpdateItemDocEstado = (itemId, docEstado, motivoIncompleta = '') => {
        setCartItems(prev => prev.map(item => {
            if (item.id === itemId) {
                return { ...item, docEstado, motivoIncompleta };
            }
            return item;
        }));
    };

    // ─── Quitar del Carrito ───
    const handleQuitarDelCarrito = async (itemId) => {
        try {
            await toggleCarritoFicha(itemId, false);
            setCartItems(prev => prev.filter(i => i.id !== itemId));
            showToast('Ficha devuelta a pendientes');
            fetchResumenFichas().then(setResumen);
        } catch (err) {
            showToast('Error quitando del carrito', 'error');
        }
    };

    const handleVaciarCarrito = async () => {
        if (!window.confirm('¿Desea vaciar todo el carrito de entrega?')) return;
        try {
            await vaciarCarritoFichas();
            setCartItems([]);
            showToast('Carrito vaciado');
            fetchResumenFichas().then(setResumen);
        } catch (err) {
            showToast('Error vaciando carrito', 'error');
        }
    };

    // ─── Emitir Entrega y Generar PDF ───
    const handleEmitirEntrega = async () => {
        if (cartItems.length === 0) {
            showToast('El carrito está vacío', 'error');
            return;
        }
        if (!responsableEntrega.trim()) {
            showToast('Indique el nombre del responsable que entrega', 'error');
            return;
        }
        if (!responsableRecibe.trim()) {
            showToast('Indique el nombre del responsable que recibe', 'error');
            return;
        }

        setSubmitting(true);
        try {
            const entregaCreada = await emitirEntregaFichas({
                items: cartItems,
                responsableEntrega,
                firmaEntrega,
                responsableRecibe,
                firmaRecibe,
                observaciones: observacionesLote
            });

            // Preparar datos para imprimir inmediatamente
            const printPayload = {
                codigo: entregaCreada.codigo,
                fecha: entregaCreada.fecha_entrega,
                responsableEntrega: entregaCreada.responsable_entrega,
                responsableRecibe: entregaCreada.responsable_recibe,
                firmaEntrega: entregaCreada.firma_entrega,
                firmaRecibe: entregaCreada.firma_recibe,
                observaciones: entregaCreada.observaciones,
                items: entregaCreada.detalles || cartItems
            };

            setCartItems([]);
            showToast(`Entrega ${entregaCreada.codigo} emitida exitosamente`);
            setActiveTab('historial');
            loadHistorial();

            // Imprimir de inmediato el PDF oficial con membrete del Sanatorio
            try {
                showToast('Generando remito oficial Sanatorio Argentino...', 'info');
                await generarPdfConstanciaFichas(printPayload, { action: 'print' });
            } catch (errPdf) {
                console.error('[FichasAdmisiones] Error imprimiendo remito oficial:', errPdf);
            }
        } catch (err) {
            console.error('[FichasAdmisiones] Error emitiendo entrega:', err);
            showToast('Error emitiendo entrega de fichas', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // ─── Expandir Detalle en Historial ───
    const handleToggleExpandEntrega = async (entregaId) => {
        if (expandedEntregaId === entregaId) {
            setExpandedEntregaId(null);
            return;
        }
        setExpandedEntregaId(entregaId);
        if (!entregaDetalles[entregaId]) {
            try {
                const conDetalle = await fetchEntregaConDetalle(entregaId);
                setEntregaDetalles(prev => ({ ...prev, [entregaId]: conDetalle }));
            } catch (err) {
                console.error('[FichasAdmisiones] Error loading detalle:', err);
            }
        }
    };

    // ─── Reimprimir Remito Histórico (PDF Oficial Sanatorio Argentino) ───
    const handleReimprimirEntrega = async (entrega) => {
        try {
            showToast('Preparando impresión de remito oficial...', 'info');
            let detalleCompleto = entregaDetalles[entrega.id];
            if (!detalleCompleto) {
                const res = await fetchEntregaConDetalle(entrega.id);
                detalleCompleto = res;
                setEntregaDetalles(prev => ({ ...prev, [entrega.id]: res }));
            }

            const items = detalleCompleto?.detalles || [];
            if (items.length === 0) {
                showToast('No hay fichas asociadas a este lote', 'error');
                return;
            }

            await generarPdfConstanciaFichas({
                codigo: entrega.codigo,
                fecha: entrega.fecha_entrega,
                responsableEntrega: entrega.responsable_entrega,
                responsableRecibe: entrega.responsable_recibe,
                firmaEntrega: entrega.firma_entrega,
                firmaRecibe: entrega.firma_recibe,
                observaciones: entrega.observaciones,
                items
            }, { action: 'print' });

            showToast(`Remito ${entrega.codigo} enviado a impresión`);
        } catch (err) {
            console.error('[FichasAdmisiones] Error preparando remito:', err);
            showToast('Error al preparar impresión: ' + err.message, 'error');
        }
    };

    // ─── Ver Remito PDF en Pantalla (Nueva Pestaña) ───
    const handleVerPdf = async (entrega) => {
        try {
            showToast('Abriendo PDF oficial...', 'info');
            let detalleCompleto = entregaDetalles[entrega.id];
            if (!detalleCompleto) {
                const res = await fetchEntregaConDetalle(entrega.id);
                detalleCompleto = res;
                setEntregaDetalles(prev => ({ ...prev, [entrega.id]: res }));
            }

            const items = detalleCompleto?.detalles || [];
            if (items.length === 0) {
                showToast('No hay fichas asociadas a este lote', 'error');
                return;
            }

            await generarPdfConstanciaFichas({
                codigo: entrega.codigo,
                fecha: entrega.fecha_entrega,
                responsableEntrega: entrega.responsable_entrega,
                responsableRecibe: entrega.responsable_recibe,
                firmaEntrega: entrega.firma_entrega,
                firmaRecibe: entrega.firma_recibe,
                observaciones: entrega.observaciones,
                items
            }, { action: 'preview' });
        } catch (err) {
            console.error('[FichasAdmisiones] Error abriendo PDF:', err);
            showToast('Error abriendo PDF: ' + err.message, 'error');
        }
    };

    // ─── Descargar PDF Oficial con Membrete Sanatorio Argentino ───
    const handleDescargarPdf = async (entrega) => {
        try {
            showToast('Generando PDF oficial...', 'info');
            let detalleCompleto = entregaDetalles[entrega.id];
            if (!detalleCompleto) {
                const res = await fetchEntregaConDetalle(entrega.id);
                detalleCompleto = res;
                setEntregaDetalles(prev => ({ ...prev, [entrega.id]: res }));
            }

            const items = detalleCompleto?.detalles || [];
            if (items.length === 0) {
                showToast('No hay fichas asociadas a este lote', 'error');
                return;
            }

            await generarPdfConstanciaFichas({
                codigo: entrega.codigo,
                fecha: entrega.fecha_entrega,
                responsableEntrega: entrega.responsable_entrega,
                responsableRecibe: entrega.responsable_recibe,
                firmaEntrega: entrega.firma_entrega,
                firmaRecibe: entrega.firma_recibe,
                observaciones: entrega.observaciones,
                items
            }, { action: 'download' });

            showToast(`PDF oficial ${entrega.codigo} descargado con éxito`);
        } catch (err) {
            console.error('[FichasAdmisiones] Error generando PDF:', err);
            showToast('Error generando PDF: ' + err.message, 'error');
        }
    };

    // ─── Devolver Ficha a Recepción ───
    const handleConfirmarDevolucion = async () => {
        if (!devolucionModal || !devolucionMotivo.trim()) {
            showToast('Debe ingresar el motivo de devolución', 'error');
            return;
        }

        setDevolucionSubmitting(true);
        try {
            await devolverFichaARecepcion({
                detalleId: devolucionModal.item.id,
                admisionId: devolucionModal.item.admision_id,
                entregaId: devolucionModal.entregaId,
                motivo: devolucionMotivo,
                responsable: currentUser?.nombre || 'Administración'
            });

            showToast('Ficha devuelta a Recepción para completar');
            setDevolucionModal(null);
            setDevolucionMotivo('');

            // Recargar detalle de la entrega
            const res = await fetchEntregaConDetalle(devolucionModal.entregaId);
            setEntregaDetalles(prev => ({ ...prev, [devolucionModal.entregaId]: res }));
            loadHistorial();
        } catch (err) {
            showToast('Error procesando devolución', 'error');
        } finally {
            setDevolucionSubmitting(false);
        }
    };

    // ─── Subsanar Ficha Devuelta en Recepción ───
    const handleSubsanarFicha = async (item) => {
        try {
            await subsanarFichaDevuelta(item.id);
            showToast('Ficha subsanada: lista para nueva entrega');
            loadPendientes();
        } catch (err) {
            showToast('Error subsanando ficha', 'error');
        }
    };

    // ─── Copiar Link Público ───
    const handleCopiarLinkPublico = () => {
        const publicUrl = `${window.location.origin}/#/entrega-fichas-publico`;
        navigator.clipboard.writeText(publicUrl);
        showToast('Link público copiado al portapapeles');
    };

    return (
        <div style={{
            padding: isPublic ? '20px 24px' : '24px 32px',
            maxWidth: '1440px', margin: '0 auto',
            fontFamily: "'Inter', -apple-system, sans-serif"
        }}>
            {/* Circuito de fichas: paso 1 */}
            <CircuitoFichasBanner step={1} interactive={!isPublic} />

            {/* Header del Panel */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexWrap: 'wrap', gap: '16px', marginBottom: '20px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                        width: '46px', height: '46px', borderRadius: '12px',
                        background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)'
                    }}>
                        <FileText size={24} color="#ffffff" />
                    </div>
                    <div>
                        <h1 style={{
                            fontSize: '1.45rem', fontWeight: 900, color: '#0f172a',
                            letterSpacing: '-0.4px', margin: 0
                        }}>
                            1. Entrega de Fichas de Admisiones
                        </h1>
                        <p style={{ fontSize: '0.84rem', color: '#64748b', margin: '2px 0 0 0' }}>
                            Trazabilidad y remitos de entrega física de fichas de Recepción a Administración (7:00 hs)
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {!isPublic && (
                        <button
                            type="button"
                            onClick={handleCopiarLinkPublico}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '8px 14px', borderRadius: '8px',
                                background: '#f8fafc', border: '1px solid #cbd5e1',
                                color: '#0284c7', fontSize: '0.82rem', fontWeight: 700,
                                cursor: 'pointer', transition: 'all 0.2s'
                            }}
                        >
                            <Copy size={15} />
                            Copiar Link para Recepción
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() => {
                            if (activeTab === 'pendientes') loadPendientes();
                            else if (activeTab === 'carrito') loadCarrito();
                            else loadHistorial();
                        }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '8px 14px', borderRadius: '8px',
                            background: '#ffffff', border: '1px solid #cbd5e1',
                            color: '#475569', fontSize: '0.82rem', fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        <RefreshCw size={15} />
                        Actualizar
                    </button>
                </div>
            </div>

            {/* Badges de Resumen (Estilo Asociaciones) */}
            <div style={{
                display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px'
            }}>
                <button
                    onClick={() => { setFiltroEstado('pendientes'); setActiveTab('pendientes'); }}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '6px 14px', borderRadius: '20px',
                        border: filtroEstado === 'pendientes' && activeTab === 'pendientes' ? '2px solid #0284c7' : '1px solid #e2e8f0',
                        background: filtroEstado === 'pendientes' && activeTab === 'pendientes' ? '#f0f9ff' : '#ffffff',
                        fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer',
                        color: filtroEstado === 'pendientes' && activeTab === 'pendientes' ? '#0284c7' : '#475569'
                    }}
                >
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0284c7' }} />
                    Pendientes de Entrega
                    <span style={{
                        background: '#e0f2fe', color: '#0369a1', padding: '1px 8px',
                        borderRadius: '10px', fontSize: '0.72rem', fontWeight: 800
                    }}>
                        {resumen.pendientes}
                    </span>
                </button>

                <button
                    onClick={() => { setActiveTab('carrito'); }}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '6px 14px', borderRadius: '20px',
                        border: activeTab === 'carrito' ? '2px solid #2563eb' : '1px solid #e2e8f0',
                        background: activeTab === 'carrito' ? '#eff6ff' : '#ffffff',
                        fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer',
                        color: activeTab === 'carrito' ? '#2563eb' : '#475569'
                    }}
                >
                    <ShoppingCart size={14} color="#2563eb" />
                    En Carrito de Entrega
                    <span style={{
                        background: '#dbeafe', color: '#1d4ed8', padding: '1px 8px',
                        borderRadius: '10px', fontSize: '0.72rem', fontWeight: 800
                    }}>
                        {cartItems.length > 0 ? cartItems.length : resumen.enCarrito}
                    </span>
                </button>

                <button
                    onClick={() => { setFiltroEstado('devueltas'); setActiveTab('pendientes'); }}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '6px 14px', borderRadius: '20px',
                        border: filtroEstado === 'devueltas' && activeTab === 'pendientes' ? '2px solid #dc2626' : '1px solid #e2e8f0',
                        background: filtroEstado === 'devueltas' && activeTab === 'pendientes' ? '#fef2f2' : '#ffffff',
                        fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer',
                        color: filtroEstado === 'devueltas' && activeTab === 'pendientes' ? '#dc2626' : '#475569'
                    }}
                >
                    <AlertTriangle size={14} color="#dc2626" />
                    Devueltas por Administración
                    <span style={{
                        background: '#fee2e2', color: '#b91c1c', padding: '1px 8px',
                        borderRadius: '10px', fontSize: '0.72rem', fontWeight: 800
                    }}>
                        {resumen.devueltas}
                    </span>
                </button>

                <button
                    onClick={() => { setActiveTab('historial'); }}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '6px 14px', borderRadius: '20px',
                        border: activeTab === 'historial' ? '2px solid #0f172a' : '1px solid #e2e8f0',
                        background: activeTab === 'historial' ? '#f8fafc' : '#ffffff',
                        fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer',
                        color: activeTab === 'historial' ? '#0f172a' : '#475569'
                    }}
                >
                    <History size={14} />
                    Historial de Remitos
                </button>
            </div>

            {/* Pestañas de Navegación Principal */}
            <div style={{
                display: 'flex', gap: '6px', borderBottom: '2px solid #e2e8f0',
                marginBottom: '20px'
            }}>
                <button
                    type="button"
                    onClick={() => setActiveTab('pendientes')}
                    style={{
                        padding: '10px 18px', border: 'none', background: 'transparent',
                        fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer',
                        color: activeTab === 'pendientes' ? '#0284c7' : '#64748b',
                        borderBottom: activeTab === 'pendientes' ? '3px solid #0284c7' : '3px solid transparent',
                        marginBottom: '-2px', display: 'flex', alignItems: 'center', gap: '8px'
                    }}
                >
                    <FileText size={17} />
                    Admisiones para Entrega
                    <span style={{
                        background: '#f1f5f9', color: '#475569', padding: '1px 7px',
                        borderRadius: '8px', fontSize: '0.74rem'
                    }}>
                        {totalCount}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('carrito')}
                    style={{
                        padding: '10px 18px', border: 'none', background: 'transparent',
                        fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer',
                        color: activeTab === 'carrito' ? '#0284c7' : '#64748b',
                        borderBottom: activeTab === 'carrito' ? '3px solid #0284c7' : '3px solid transparent',
                        marginBottom: '-2px', display: 'flex', alignItems: 'center', gap: '8px'
                    }}
                >
                    <ShoppingCart size={17} />
                    Carrito de Entrega
                    {(cartItems.length > 0 || resumen.enCarrito > 0) && (
                        <span style={{
                            background: '#0284c7', color: '#ffffff', padding: '1px 7px',
                            borderRadius: '8px', fontSize: '0.74rem', fontWeight: 900
                        }}>
                            {cartItems.length || resumen.enCarrito}
                        </span>
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('historial')}
                    style={{
                        padding: '10px 18px', border: 'none', background: 'transparent',
                        fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer',
                        color: activeTab === 'historial' ? '#0284c7' : '#64748b',
                        borderBottom: activeTab === 'historial' ? '3px solid #0284c7' : '3px solid transparent',
                        marginBottom: '-2px', display: 'flex', alignItems: 'center', gap: '8px'
                    }}
                >
                    <History size={17} />
                    Historial de Entregas
                </button>
            </div>

            {/* ══════════════════════════════════════════
                PESTAÑA 1: ADMISIONES PENDIENTES
               ══════════════════════════════════════════ */}
            {activeTab === 'pendientes' && (
                <div>
                    {/* Barra de Filtros y Búsqueda */}
                    <div style={{
                        background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0',
                        padding: '14px 18px', marginBottom: '16px', display: 'flex',
                        alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap'
                    }}>
                        <form
                            onSubmit={handleSearchSubmit}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 340px' }}
                        >
                            <div style={{ position: 'relative', width: '100%' }}>
                                <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    type="text"
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                    placeholder="Buscar por NHC, DNI, Paciente, N° Admisión o Cobertura..."
                                    style={{
                                        width: '100%', padding: '9px 12px 9px 36px',
                                        borderRadius: '8px', border: '1.5px solid #cbd5e1',
                                        fontSize: '0.84rem', outline: 'none', boxSizing: 'border-box'
                                    }}
                                />
                            </div>
                            <button
                                type="submit"
                                style={{
                                    padding: '9px 16px', borderRadius: '8px', background: '#0284c7',
                                    color: '#ffffff', fontWeight: 700, fontSize: '0.82rem',
                                    border: 'none', cursor: 'pointer', whiteSpace: 'nowrap'
                                }}
                            >
                                Buscar
                            </button>
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={() => { setSearchInput(''); setSearchTerm(''); }}
                                    style={{
                                        padding: '9px 12px', borderRadius: '8px', background: '#f1f5f9',
                                        color: '#475569', fontWeight: 600, fontSize: '0.82rem',
                                        border: '1px solid #cbd5e1', cursor: 'pointer'
                                    }}
                                >
                                    Limpiar
                                </button>
                            )}
                        </form>

                        {/* Botón de Enviar Seleccionadas al Carrito */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {selectedIds.size > 0 && (
                                <button
                                    type="button"
                                    onClick={handleEnviarSeleccionadasAlCarrito}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        padding: '9px 18px', borderRadius: '8px',
                                        background: '#2563eb', color: '#ffffff',
                                        fontWeight: 800, fontSize: '0.82rem', border: 'none',
                                        cursor: 'pointer', boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)'
                                    }}
                                >
                                    <ShoppingCart size={15} />
                                    Enviar {selectedIds.size} seleccionada(s) al Carrito
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={() => setActiveTab('carrito')}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '9px 16px', borderRadius: '8px',
                                    background: '#f8fafc', border: '1.5px solid #cbd5e1',
                                    color: '#0f172a', fontWeight: 800, fontSize: '0.82rem',
                                    cursor: 'pointer'
                                }}
                            >
                                <ShoppingCart size={15} color="#0284c7" />
                                Ver Carrito ({resumen.enCarrito})
                                <ArrowRight size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Tabla de Admisiones */}
                    <div style={{
                        background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0',
                        overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 800 }}>
                                    <th style={{ padding: '12px 14px', width: '38px', textAlign: 'center' }}>
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.size > 0 && selectedIds.size === admisiones.length}
                                            onChange={handleSelectAllCurrentPage}
                                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                        />
                                    </th>
                                    <th 
                                        style={{ padding: '12px 14px', cursor: 'pointer', userSelect: 'none' }}
                                        onClick={() => handleToggleSort('fecha_ingreso')}
                                        title="Ordenar por fecha de ingreso"
                                    >
                                        Fecha Ingreso {sortBy === 'fecha_ingreso' ? (sortAsc ? '▲' : '▼') : '↕'}
                                    </th>
                                    <th style={{ padding: '12px 14px' }}>N° Admisión</th>
                                    <th 
                                        style={{ padding: '12px 14px', cursor: 'pointer', userSelect: 'none', color: '#0284c7' }}
                                        onClick={() => handleToggleSort('paciente')}
                                        title="Ordenar alfabéticamente por paciente"
                                    >
                                        Paciente {sortBy === 'paciente' ? (sortAsc ? '▲ A-Z' : '▼ Z-A') : '↕'}
                                    </th>
                                    <th style={{ padding: '12px 14px' }}>DNI / NHC</th>
                                    <th style={{ padding: '12px 14px' }}>Obra Social / Prepaga</th>
                                    <th style={{ padding: '12px 14px' }}>Especialidad</th>
                                    <th style={{ padding: '12px 14px' }}>Recepcionó</th>
                                    <th style={{ padding: '12px 14px', textAlign: 'center' }}>Estado Ficha</th>
                                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={10} style={{ padding: '36px', textAlign: 'center', color: '#64748b' }}>
                                            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
                                            Cargando admisiones...
                                        </td>
                                    </tr>
                                ) : admisiones.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
                                            <FileText size={32} color="#cbd5e1" style={{ margin: '0 auto 8px auto' }} />
                                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#334155' }}>No se encontraron admisiones</div>
                                            <div style={{ fontSize: '0.78rem' }}>Intente ajustando el filtro o término de búsqueda.</div>
                                        </td>
                                    </tr>
                                ) : (
                                    admisiones.map((adm) => {
                                        const isSelected = selectedIds.has(adm.id);
                                        const isDevuelta = adm.ficha_estado === 'devuelta_a_recepcion';
                                        const isEnCarrito = adm.ficha_en_carrito || adm.ficha_estado === 'en_carrito';

                                        return (
                                            <tr
                                                key={adm.id}
                                                style={{
                                                    borderBottom: '1px solid #f1f5f9',
                                                    background: isDevuelta ? '#fffbeb' : (isSelected ? '#f0f9ff' : '#ffffff'),
                                                    transition: 'background 0.15s'
                                                }}
                                            >
                                                <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => handleToggleSelect(adm.id)}
                                                        disabled={isEnCarrito}
                                                        style={{ cursor: isEnCarrito ? 'not-allowed' : 'pointer', width: '16px', height: '16px' }}
                                                    />
                                                </td>
                                                <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 600, color: '#334155' }}>
                                                    {adm.fecha_ingreso ? new Date(adm.fecha_ingreso + 'T12:00:00').toLocaleDateString('es-AR') : '—'}
                                                </td>
                                                <td style={{ padding: '10px 14px', fontWeight: 800, fontFamily: 'monospace', color: '#0284c7' }}>
                                                    {adm.numero_admision || '—'}
                                                </td>
                                                <td style={{ padding: '10px 14px', fontWeight: 800, color: '#0f172a' }}>
                                                    {adm.paciente}
                                                </td>
                                                <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#475569' }}>
                                                    <div>{adm.dni}</div>
                                                    {adm.nhc && adm.nhc !== '—' && (
                                                        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>HC: {adm.nhc}</div>
                                                    )}
                                                </td>
                                                <td style={{ padding: '10px 14px', color: '#334155' }}>
                                                    {adm.cliente || 'Particular'}
                                                </td>
                                                <td style={{ padding: '10px 14px', color: '#475569', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {adm.especialidad || '—'}
                                                </td>
                                                <td style={{ padding: '10px 14px', color: '#64748b' }}>
                                                    {adm.responsableRecepcion}
                                                </td>
                                                <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                    {isDevuelta ? (
                                                        <div style={{
                                                            background: '#fef2f2', border: '1px solid #fecaca',
                                                            borderRadius: '6px', padding: '4px 8px', color: '#b91c1c',
                                                            fontSize: '0.72rem', fontWeight: 800, textAlign: 'left'
                                                        }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <AlertTriangle size={13} color="#dc2626" />
                                                                DEVUELTA A RECEPCIÓN
                                                            </div>
                                                            {adm.ficha_devolucion_motivo && (
                                                                <div style={{ fontWeight: 600, fontSize: '0.68rem', marginTop: '2px', color: '#7f1d1d' }}>
                                                                    Motivo: {adm.ficha_devolucion_motivo}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : isEnCarrito ? (
                                                        <span style={{
                                                            background: '#e0f2fe', color: '#0369a1', padding: '3px 8px',
                                                            borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800
                                                        }}>
                                                            🛒 En Carrito
                                                        </span>
                                                    ) : (
                                                        <span style={{
                                                            background: '#f1f5f9', color: '#475569', padding: '3px 8px',
                                                            borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700
                                                        }}>
                                                            Pendiente Entrega
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    {isDevuelta ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSubsanarFicha(adm)}
                                                            style={{
                                                                padding: '6px 12px', borderRadius: '6px',
                                                                background: '#16a34a', color: '#ffffff',
                                                                fontSize: '0.74rem', fontWeight: 800, border: 'none',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            ✓ Marcar Subsanada
                                                        </button>
                                                    ) : isEnCarrito ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleToggleSingleCarrito(adm, false)}
                                                            style={{
                                                                padding: '5px 10px', borderRadius: '6px',
                                                                background: '#f1f5f9', color: '#dc2626',
                                                                fontSize: '0.72rem', fontWeight: 700, border: '1px solid #fca5a5',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            Quitar
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleToggleSingleCarrito(adm, true)}
                                                            style={{
                                                                padding: '6px 12px', borderRadius: '6px',
                                                                background: '#0284c7', color: '#ffffff',
                                                                fontSize: '0.74rem', fontWeight: 700, border: 'none',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            + Al Carrito
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════
                PESTAÑA 2: CARRITO DE ENTREGA (CONSOLIDACIÓN)
               ══════════════════════════════════════════ */}
            {activeTab === 'carrito' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px', alignItems: 'start' }}>
                    {/* Columna Izquierda: Listado de Fichas en Carrito */}
                    <div>
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            marginBottom: '14px'
                        }}>
                            <div>
                                <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                                    Fichas Seleccionadas para Entrega ({cartItems.length})
                                </h2>
                                <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '2px 0 0 0' }}>
                                    Fichas preparadas para entrega en lote a Administración. La auditoría y devolución documental se realiza en Control de Altas.
                                </p>
                            </div>

                            {cartItems.length > 0 && (
                                <button
                                    type="button"
                                    onClick={handleVaciarCarrito}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '4px',
                                        padding: '6px 12px', borderRadius: '6px',
                                        background: '#fee2e2', border: '1px solid #fecaca',
                                        color: '#dc2626', fontSize: '0.74rem', fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    <Trash2 size={13} />
                                    Vaciar Carrito
                                </button>
                            )}
                        </div>

                        {loadingCart ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
                                Cargando carrito...
                            </div>
                        ) : cartItems.length === 0 ? (
                            <div style={{
                                background: '#ffffff', borderRadius: '12px', border: '2px dashed #cbd5e1',
                                padding: '48px 24px', textAlign: 'center'
                            }}>
                                <ShoppingCart size={38} color="#cbd5e1" style={{ margin: '0 auto 12px auto' }} />
                                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b' }}>El carrito de entrega está vacío</div>
                                <p style={{ fontSize: '0.82rem', color: '#64748b', maxWidth: '360px', margin: '6px auto 16px auto' }}>
                                    Vaya a la pestaña de Admisiones para seleccionar las fichas que se entregarán hoy a las 7am a Administración.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('pendientes')}
                                    style={{
                                        padding: '9px 18px', borderRadius: '8px', background: '#0284c7',
                                        color: '#ffffff', fontWeight: 800, fontSize: '0.82rem', border: 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Ir a Seleccionar Admisiones
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {[...cartItems].sort((a, b) => (a.paciente || '').localeCompare(b.paciente || '', 'es', { sensitivity: 'base' })).map((item, idx) => (
                                    <div
                                        key={item.id}
                                        style={{
                                            background: '#ffffff', borderRadius: '10px',
                                            border: '1px solid #e2e8f0',
                                            padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <span style={{
                                                background: '#f1f5f9', color: '#475569', width: '26px', height: '26px',
                                                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '0.75rem', fontWeight: 800
                                            }}>
                                                {idx + 1}
                                            </span>
                                            <div>
                                                <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#0f172a' }}>
                                                    {item.paciente}
                                                </div>
                                                <div style={{ fontSize: '0.76rem', color: '#64748b', display: 'flex', gap: '12px', marginTop: '2px' }}>
                                                    <span>Adm: <strong style={{ color: '#0284c7' }}>{item.numero_admision}</strong></span>
                                                    <span>DNI: {item.dni}</span>
                                                    {item.nhc && item.nhc !== '—' && <span>HC: {item.nhc}</span>}
                                                    <span>OS: {item.cliente}</span>
                                                    {item.responsableRecepcion && item.responsableRecepcion !== 'Recepción General' && (
                                                        <span>Recepcionó: <strong style={{ color: '#475569' }}>{item.responsableRecepcion}</strong></span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => handleQuitarDelCarrito(item.id)}
                                            title="Quitar del carrito"
                                            style={{
                                                background: 'transparent', border: 'none', color: '#94a3b8',
                                                cursor: 'pointer', padding: '6px', borderRadius: '4px',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Columna Derecha: Formulario de Emisión y Firmas Digitales */}
                    <div style={{
                        background: '#ffffff', borderRadius: '12px', border: '1px solid #cbd5e1',
                        padding: '18px 20px', boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                        position: 'sticky', top: '20px'
                    }}>
                        <h3 style={{
                            fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: '0 0 14px 0',
                            borderBottom: '2px solid #f1f5f9', paddingBottom: '10px'
                        }}>
                            Emisión de Remito de Entrega
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {/* Responsable Entrega */}
                            <div>
                                <label style={{ fontSize: '0.74rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '4px' }}>
                                    RESPONSABLE DE ENTREGA (RECEPCIÓN) *
                                </label>
                                <input
                                    type="text"
                                    value={responsableEntrega}
                                    onChange={(e) => setResponsableEntrega(e.target.value)}
                                    placeholder="Nombre de quien entrega (ej: Francisco)"
                                    style={{
                                        width: '100%', padding: '8px 12px', borderRadius: '6px',
                                        border: '1.5px solid #cbd5e1', fontSize: '0.84rem', fontWeight: 700,
                                        boxSizing: 'border-box', outline: 'none'
                                    }}
                                />
                            </div>

                            {/* Pad Firma Entrega */}
                            <DigitalSignaturePad
                                label="Firma de quien Entrega"
                                sublabel="Francisco / Personal de Recepción"
                                onSave={(b64) => setFirmaEntrega(b64)}
                                height={110}
                            />

                            {/* Responsable Recibe */}
                            <div>
                                <label style={{ fontSize: '0.74rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '4px' }}>
                                    RESPONSABLE DE RECEPCIÓN (ADMINISTRACIÓN) *
                                </label>
                                <input
                                    type="text"
                                    value={responsableRecibe}
                                    onChange={(e) => setResponsableRecibe(e.target.value)}
                                    placeholder="Nombre de quien recibe en Administración"
                                    style={{
                                        width: '100%', padding: '8px 12px', borderRadius: '6px',
                                        border: '1.5px solid #cbd5e1', fontSize: '0.84rem', fontWeight: 700,
                                        boxSizing: 'border-box', outline: 'none'
                                    }}
                                />
                            </div>

                            {/* Pad Firma Recibe */}
                            <DigitalSignaturePad
                                label="Firma de quien Recibe"
                                sublabel="Personal de Administración"
                                onSave={(b64) => setFirmaRecibe(b64)}
                                height={110}
                            />

                            {/* Observaciones generales */}
                            <div>
                                <label style={{ fontSize: '0.74rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '4px' }}>
                                    OBSERVACIONES GENERALES
                                </label>
                                <textarea
                                    value={observacionesLote}
                                    onChange={(e) => setObservacionesLote(e.target.value)}
                                    placeholder="Notas del lote o aclaraciones especiales..."
                                    rows={2}
                                    style={{
                                        width: '100%', padding: '8px 10px', borderRadius: '6px',
                                        border: '1.5px solid #cbd5e1', fontSize: '0.78rem',
                                        boxSizing: 'border-box', outline: 'none', resize: 'vertical'
                                    }}
                                />
                            </div>

                            {/* Botón de Emisión */}
                            <button
                                type="button"
                                onClick={handleEmitirEntrega}
                                disabled={submitting || cartItems.length === 0}
                                style={{
                                    width: '100%', padding: '12px 18px', borderRadius: '8px',
                                    background: cartItems.length === 0 ? '#94a3b8' : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                                    color: '#ffffff', fontWeight: 800, fontSize: '0.88rem', border: 'none',
                                    cursor: cartItems.length === 0 || submitting ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                    boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)', marginTop: '6px'
                                }}
                            >
                                <Printer size={18} />
                                {submitting ? 'Emitiendo constancia...' : `Emitir Constancia (${cartItems.length} Fichas) e Imprimir PDF`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════
                PESTAÑA 3: HISTORIAL DE ENTREGAS
               ══════════════════════════════════════════ */}
            {activeTab === 'historial' && (
                <div>
                    {/* Buscador de Historial */}
                    <div style={{
                        background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0',
                        padding: '14px 18px', marginBottom: '16px', display: 'flex',
                        alignItems: 'center', gap: '12px'
                    }}>
                        <div style={{ position: 'relative', width: '100%', maxWidth: '420px' }}>
                            <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                            <input
                                type="text"
                                value={historialSearch}
                                onChange={(e) => setHistorialSearch(e.target.value)}
                                placeholder="Buscar por paciente, N° admisión, DNI, remito o responsable..."
                                style={{
                                    width: '100%', padding: '9px 12px 9px 36px',
                                    borderRadius: '8px', border: '1.5px solid #cbd5e1',
                                    fontSize: '0.84rem', outline: 'none'
                                }}
                            />
                        </div>
                    </div>

                    {loadingHistorial ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
                            Cargando historial de entregas...
                        </div>
                    ) : historial.length === 0 ? (
                        <div style={{
                            background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0',
                            padding: '48px 20px', textAlign: 'center', color: '#64748b'
                        }}>
                            <History size={32} color="#cbd5e1" style={{ margin: '0 auto 8px auto' }} />
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#334155' }}>No hay remitos de entrega emitidos aún</div>
                            <div style={{ fontSize: '0.78rem' }}>Las entregas que realice aparecerán registradas aquí con su respectiva constancia.</div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {historial.map((entrega) => {
                                const isExpanded = expandedEntregaId === entrega.id;
                                const detalle = entregaDetalles[entrega.id];
                                const hasDevoluciones = entrega.estado === 'con_devoluciones';

                                return (
                                    <div
                                        key={entrega.id}
                                        style={{
                                            background: '#ffffff', borderRadius: '12px',
                                            border: hasDevoluciones ? '1.5px solid #fecaca' : '1px solid #e2e8f0',
                                            overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                                        }}
                                    >
                                        {/* Cabecera del Remito */}
                                        <div style={{
                                            padding: '14px 18px', background: hasDevoluciones ? '#fff5f5' : '#f8fafc',
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            flexWrap: 'wrap', gap: '14px', borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleExpandEntrega(entrega.id)}
                                                    style={{
                                                        background: 'transparent', border: 'none', cursor: 'pointer',
                                                        color: '#64748b', display: 'flex', alignItems: 'center'
                                                    }}
                                                >
                                                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                                                </button>

                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <span style={{
                                                            fontFamily: 'monospace', fontWeight: 900, fontSize: '0.96rem',
                                                            color: '#0f172a'
                                                        }}>
                                                            {entrega.codigo}
                                                        </span>

                                                        {hasDevoluciones ? (
                                                            <span style={{
                                                                background: '#fee2e2', color: '#b91c1c', padding: '2px 8px',
                                                                borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800
                                                            }}>
                                                                ⚠️ Con Devoluciones a Recepción
                                                            </span>
                                                        ) : (
                                                            <span style={{
                                                                background: '#dcfce7', color: '#166534', padding: '2px 8px',
                                                                borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800
                                                            }}>
                                                                ✓ Entregado Completo
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div style={{ fontSize: '0.76rem', color: '#64748b', display: 'flex', gap: '14px', marginTop: '3px' }}>
                                                        <span>Fecha: <strong>{new Date(entrega.fecha_entrega).toLocaleString('es-AR')}</strong></span>
                                                        <span>Entrega: <strong style={{ color: '#0284c7' }}>{entrega.responsable_entrega}</strong></span>
                                                        <span>Recibe: <strong>{entrega.responsable_recibe}</strong></span>
                                                        <span>Total: <strong>{entrega.cantidad_fichas} fichas</strong> ({entrega.fichas_incompletas > 0 ? `${entrega.fichas_incompletas} inc.` : '100% comp.'})</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleVerPdf(entrega)}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: '6px',
                                                        padding: '7px 12px', borderRadius: '6px',
                                                        background: '#f0f9ff', border: '1px solid #bae6fd',
                                                        color: '#0284c7', fontWeight: 700, fontSize: '0.78rem',
                                                        cursor: 'pointer'
                                                    }}
                                                    title="Ver PDF oficial con membrete en pantalla completa"
                                                >
                                                    <Eye size={15} />
                                                    Ver PDF
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => handleDescargarPdf(entrega)}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: '6px',
                                                        padding: '7px 14px', borderRadius: '6px',
                                                        background: '#0D3B66', border: 'none',
                                                        color: '#ffffff', fontWeight: 700, fontSize: '0.78rem',
                                                        cursor: 'pointer'
                                                    }}
                                                    title="Descargar PDF A4 oficial con membrete del Sanatorio"
                                                >
                                                    <Download size={15} />
                                                    Descargar PDF
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => handleReimprimirEntrega(entrega)}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: '6px',
                                                        padding: '7px 14px', borderRadius: '6px',
                                                        background: '#ffffff', border: '1px solid #cbd5e1',
                                                        color: '#0f172a', fontWeight: 700, fontSize: '0.78rem',
                                                        cursor: 'pointer'
                                                    }}
                                                    title="Imprimir remito oficial con membrete del Sanatorio"
                                                >
                                                    <Printer size={15} />
                                                    Imprimir Remito
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleExpandEntrega(entrega.id)}
                                                    style={{
                                                        padding: '7px 14px', borderRadius: '6px',
                                                        background: '#f1f5f9', border: 'none',
                                                        color: '#475569', fontWeight: 700, fontSize: '0.78rem',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    {isExpanded ? 'Ocultar Detalle' : 'Ver Fichas'}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Detalle Expandido */}
                                        {isExpanded && (
                                            <div style={{ padding: '16px 20px' }}>
                                                {!detalle ? (
                                                    <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                                                        Cargando detalle de fichas...
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                                            <thead>
                                                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 800 }}>
                                                                    <th style={{ padding: '8px 10px', textAlign: 'center', width: '28px' }}>#</th>
                                                                    <th style={{ padding: '8px 10px' }}>N° Adm.</th>
                                                                    <th style={{ padding: '8px 10px' }}>Paciente</th>
                                                                    <th style={{ padding: '8px 10px' }}>DNI / NHC</th>
                                                                    <th style={{ padding: '8px 10px' }}>Obra Social</th>
                                                                    <th style={{ padding: '8px 10px' }}>Recepcionó</th>
                                                                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Docs</th>
                                                                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Estado</th>
                                                                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Gestión</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {[...(detalle.detalles || [])].sort((a, b) => (a.paciente || '').localeCompare(b.paciente || '', 'es', { sensitivity: 'base' })).map((d, dIdx) => {
                                                                    const isFichaDevuelta = d.estado_ficha === 'devuelta_a_recepcion';
                                                                    const isIncompleta = d.estado_documentacion === 'incompleta';

                                                                    return (
                                                                        <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                            <td style={{ padding: '8px 10px', textAlign: 'center', color: '#94a3b8' }}>{dIdx + 1}</td>
                                                                            <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 700, color: '#0284c7' }}>{d.numero_admision}</td>
                                                                            <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0f172a' }}>{d.paciente}</td>
                                                                            <td style={{ padding: '8px 10px', fontFamily: 'monospace' }}>{d.dni} {d.nhc && d.nhc !== '—' && `(${d.nhc})`}</td>
                                                                            <td style={{ padding: '8px 10px' }}>{d.cliente}</td>
                                                                            <td style={{ padding: '8px 10px', color: '#64748b' }}>{d.responsable_recepcion}</td>
                                                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                                                {isIncompleta ? (
                                                                                    <span style={{ background: '#fef3c7', color: '#b45309', padding: '3px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                                        ⚠️ {d.motivo_incompleta || 'Incompleta'}
                                                                                    </span>
                                                                                ) : (
                                                                                    <span style={{ background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                                        ✓ Completa
                                                                                    </span>
                                                                                )}
                                                                            </td>
                                                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                                                {isFichaDevuelta ? (
                                                                                    <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800 }}>
                                                                                        Devuelta a Recepción
                                                                                    </span>
                                                                                ) : (
                                                                                    <span style={{ color: '#16a34a', fontWeight: 700 }}>
                                                                                        Aceptada
                                                                                    </span>
                                                                                )}
                                                                            </td>
                                                                            <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                                                                {!isFichaDevuelta ? (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setDevolucionModal({ item: d, entregaId: entrega.id })}
                                                                                        style={{
                                                                                            padding: '4px 8px', borderRadius: '4px',
                                                                                            background: '#fff1f2', border: '1px solid #fecdd3',
                                                                                            color: '#e11d48', fontSize: '0.7rem', fontWeight: 700,
                                                                                            cursor: 'pointer'
                                                                                        }}
                                                                                    >
                                                                                        Devolver a Recepción
                                                                                    </button>
                                                                                ) : (
                                                                                    <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                                                                                        {d.devolucion_motivo}
                                                                                    </span>
                                                                                )}
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>

                                                        {/* Vista de firmas digitales plasmadas */}
                                                        <div style={{
                                                            display: 'flex', gap: '20px', marginTop: '16px',
                                                            paddingTop: '14px', borderTop: '1px dashed #e2e8f0'
                                                        }}>
                                                            <div style={{ flex: 1, background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                                                                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b' }}>FIRMA ENTREGA: {entrega.responsable_entrega}</div>
                                                                {entrega.firma_entrega ? (
                                                                    <img src={entrega.firma_entrega} alt="Firma Entrega" style={{ maxHeight: '45px', marginTop: '6px' }} />
                                                                ) : (
                                                                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '6px' }}>Sin trazo digital</div>
                                                                )}
                                                            </div>

                                                            <div style={{ flex: 1, background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                                                                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b' }}>FIRMA RECIBE: {entrega.responsable_recibe}</div>
                                                                {entrega.firma_recibe ? (
                                                                    <img src={entrega.firma_recibe} alt="Firma Recibe" style={{ maxHeight: '45px', marginTop: '6px' }} />
                                                                ) : (
                                                                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '6px' }}>Sin trazo digital</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Modal de Devolución de Ficha a Recepción */}
            {devolucionModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 23, 42, 0.6)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', zIndex: 99999
                }}>
                    <div style={{
                        background: '#ffffff', borderRadius: '14px', width: '100%',
                        maxWidth: '460px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                            <div style={{
                                width: '38px', height: '38px', borderRadius: '10px',
                                background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <AlertTriangle size={20} color="#dc2626" />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                                    Devolver Ficha a Recepción
                                </h3>
                                <p style={{ margin: '2px 0 0 0', fontSize: '0.76rem', color: '#64748b' }}>
                                    Paciente: {devolucionModal.item.paciente} (Adm: {devolucionModal.item.numero_admision})
                                </p>
                            </div>
                        </div>

                        <p style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.4 }}>
                            Indique con precisión qué información o documentación falta para que el personal de Recepción complete la ficha:
                        </p>

                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '10px 0' }}>
                            {['Falta autorización', 'Falta pagaré de garantía', 'Falta firma del paciente', 'Falta orden médica física', 'Error en datos de cobertura'].map(m => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => setDevolucionMotivo(m)}
                                    style={{
                                        padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1',
                                        background: devolucionMotivo === m ? '#e0f2fe' : '#f8fafc',
                                        color: devolucionMotivo === m ? '#0369a1' : '#475569',
                                        fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer'
                                    }}
                                >
                                    + {m}
                                </button>
                            ))}
                        </div>

                        <textarea
                            value={devolucionMotivo}
                            onChange={(e) => setDevolucionMotivo(e.target.value)}
                            placeholder="Detalle el motivo del rechazo/devolución..."
                            rows={3}
                            style={{
                                width: '100%', padding: '10px', borderRadius: '8px',
                                border: '1.5px solid #cbd5e1', fontSize: '0.82rem',
                                boxSizing: 'border-box', outline: 'none', resize: 'vertical'
                            }}
                        />

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
                            <button
                                type="button"
                                onClick={() => setDevolucionModal(null)}
                                style={{
                                    padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1',
                                    background: '#ffffff', color: '#475569', fontWeight: 700, fontSize: '0.82rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmarDevolucion}
                                disabled={devolucionSubmitting || !devolucionMotivo.trim()}
                                style={{
                                    padding: '8px 18px', borderRadius: '8px', border: 'none',
                                    background: '#dc2626', color: '#ffffff', fontWeight: 800, fontSize: '0.82rem',
                                    cursor: devolucionSubmitting || !devolucionMotivo.trim() ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {devolucionSubmitting ? 'Procesando...' : 'Confirmar Devolución'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Componente Oculto de Impresión A4 */}
            <PrintConstanciaFichas ref={printRef} data={printData} />

            {/* Toast Flotante */}
            {toast && (
                <div style={{
                    position: 'fixed', bottom: '24px', right: '24px', zIndex: 999999,
                    background: toast.type === 'error' ? '#dc2626' : '#0f172a',
                    color: '#ffffff', padding: '12px 20px', borderRadius: '10px',
                    fontSize: '0.84rem', fontWeight: 700, boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                    display: 'flex', alignItems: 'center', gap: '10px'
                }}>
                    {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} color="#22c55e" />}
                    {toast.message}
                </div>
            )}
        </div>
    );
}
