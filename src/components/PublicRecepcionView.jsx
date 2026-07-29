/**
 * PublicRecepcionView.jsx — Portal Público de Recepción
 * 
 * Gestión de garantías y rendiciones para el sector Recepción.
 * Diseño alineado con la estética institucional del sistema ADM-QUI.
 * Paginación completa, buscador y generación de PDF con jsPDF.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Search, ShoppingCart, CheckCircle, PlusCircle, Trash2, Printer,
    Calendar, User, FileText, Shield, RefreshCw, ChevronDown,
    Package, ArrowRight, Clock, Building2, ChevronLeft, ChevronRight,
    ChevronsLeft, ChevronsRight, History, X
} from 'lucide-react';
import { supabase } from '../lib/supabase';
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

    const [generatingPDF, setGeneratingPDF] = useState(false);

    // Historial
    const [rendiciones, setRendiciones] = useState([]);
    const [historialSearch, setHistorialSearch] = useState('');
    const [expandedRendicion, setExpandedRendicion] = useState(null);
    const [rendicionDetalle, setRendicionDetalle] = useState({});
    const [loadingHistorial, setLoadingHistorial] = useState(false);

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

    // ── Generar PDF con jsPDF (mismo estilo que AsociacionesEntregaPanel) ──
    const generateRendicionPDF = async (codigo, garantias, entregaPor, recibePor, observaciones) => {
        const { default: jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');
        const doc = new jsPDF();
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const margin = 14;
        const colW = pageW - margin * 2;
        let y = 0;

        // Load logo
        let logoCircleBase64 = null;
        try {
            const logoImg = new Image();
            logoImg.crossOrigin = 'anonymous';
            logoImg.src = '/logosanatorio.png';
            await new Promise((resolve, reject) => {
                logoImg.onload = resolve;
                logoImg.onerror = reject;
            });
            const canvasSize = 200;
            const canvas = document.createElement('canvas');
            canvas.width = canvasSize; canvas.height = canvasSize;
            const ctx = canvas.getContext('2d');
            ctx.beginPath();
            ctx.arc(canvasSize / 2, canvasSize / 2, canvasSize / 2, 0, Math.PI * 2);
            ctx.closePath(); ctx.clip();
            ctx.drawImage(logoImg, 0, 0, canvasSize, canvasSize);
            logoCircleBase64 = canvas.toDataURL('image/png');
        } catch (e) { /* logo optional */ }

        // ═══ HEADER ═══
        doc.setFillColor(13, 59, 102);
        doc.rect(0, 0, pageW, 34, 'F');

        const logoX = margin + 1, logoY = 10, logoSize = 14;
        if (logoCircleBase64) {
            doc.setFillColor(255, 255, 255);
            doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 1.2, 'F');
            doc.addImage(logoCircleBase64, 'PNG', logoX, logoY, logoSize, logoSize);
        } else {
            doc.setFillColor(255, 255, 255);
            doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 'F');
            doc.setFontSize(6); doc.setTextColor(13, 59, 102);
            doc.text('SA', logoX + 3.5, logoY + logoSize / 2 + 1.5);
        }

        doc.setFontSize(16); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
        doc.text('SANATORIO ARGENTINO', margin + 18, 14);
        doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 200, 220);
        doc.text('Recepción · Rendición de Garantías', margin + 18, 21);

        doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
        doc.text('RENDICIÓN DE GARANTÍAS', pageW - margin, 14, { align: 'right' });
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 200, 220);
        doc.text('Sistema ADM-QUI', pageW - margin, 21, { align: 'right' });

        doc.setFillColor(59, 130, 246);
        doc.rect(0, 34, pageW, 2, 'F');
        y = 44;

        // ═══ INFO BAR ═══
        const fechaHora = new Date().toLocaleString('es-AR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
        });

        doc.setFillColor(241, 245, 249);
        doc.roundedRect(margin, y, colW, 18, 3, 3, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(margin, y, colW, 18, 3, 3, 'S');

        const infoItems = [
            { label: 'CÓDIGO', value: codigo },
            { label: 'FECHA Y HORA', value: fechaHora },
            { label: 'ENTREGA', value: entregaPor },
            { label: 'GARANTÍAS', value: String(garantias.length) },
        ];

        const cellW = colW / 4;
        infoItems.forEach((item, i) => {
            const x = margin + cellW * i + 6;
            doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(148, 163, 184);
            doc.text(item.label, x, y + 6);
            doc.setFontSize(i === 0 || i === 3 ? 11 : 9); doc.setFont('helvetica', 'bold'); doc.setTextColor(13, 59, 102);
            doc.text(item.value || '—', x, y + 13);
        });
        y += 26;

        // ═══ SECTION TITLE ═══
        doc.setFillColor(59, 130, 246);
        doc.rect(margin, y, 3, 7, 'F');
        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(13, 59, 102);
        doc.text('DETALLE DE GARANTÍAS ENTREGADAS', margin + 6, y + 5.5);
        y += 12;

        // ═══ TABLE ═══
        const tableBody = garantias.map((g, idx) => {
            const fecha = g.fecha_ingreso
                ? new Date(g.fecha_ingreso + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                : '—';
            return [
                String(idx + 1),
                fecha,
                g.paciente || '—',
                g.id_paciente || g.dni || '—',
                g.cliente || '—',
                (g.especialidad || '—').substring(0, 35),
            ];
        });

        autoTable(doc, {
            startY: y,
            head: [['#', 'Ingreso', 'Paciente', 'DNI', 'Obra Social', 'Especialidad']],
            body: tableBody,
            theme: 'grid',
            headStyles: { fillColor: [13, 59, 102], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: 'bold', halign: 'left', cellPadding: 3 },
            bodyStyles: { fontSize: 7.5, cellPadding: 2.5, textColor: [30, 30, 30] },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
                0: { cellWidth: 8, halign: 'center', fontStyle: 'bold', textColor: [148, 163, 184] },
                1: { cellWidth: 20 },
                2: { fontStyle: 'bold', cellWidth: 45 },
                3: { cellWidth: 25, font: 'courier' },
                4: { cellWidth: 40 },
                5: { cellWidth: 40 },
            },
            margin: { left: margin, right: margin },
            didDrawPage: () => {
                doc.setFillColor(13, 59, 102); doc.rect(0, 0, pageW, 8, 'F');
                doc.setFillColor(59, 130, 246); doc.rect(0, 8, pageW, 1, 'F');
            },
        });

        y = doc.lastAutoTable.finalY + 6;

        // ═══ OBSERVACIONES ═══
        if (observaciones) {
            doc.setFillColor(255, 251, 235); doc.setDrawColor(253, 230, 138);
            doc.roundedRect(margin, y, colW, 14, 2, 2, 'FD');
            doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(146, 64, 14);
            doc.text('OBSERVACIONES:', margin + 4, y + 5);
            doc.setFont('helvetica', 'normal');
            doc.text(observaciones.substring(0, 120), margin + 32, y + 5);
            y += 18;
        }

        // ═══ FIRMAS ═══
        if (y > pageH - 65) { doc.addPage(); y = 20; }
        y += 8;
        const sigBoxW = (colW - 20) / 2;

        // Firma Entrega
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(margin, y, sigBoxW, 42, 3, 3, 'S');
        doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(148, 163, 184);
        doc.text('ENTREGA', margin + sigBoxW / 2, y + 6, { align: 'center' });
        doc.setDrawColor(13, 59, 102); doc.setLineWidth(0.5);
        doc.line(margin + 12, y + 30, margin + sigBoxW - 12, y + 30);
        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(13, 59, 102);
        doc.text(entregaPor || '________________________', margin + sigBoxW / 2, y + 35, { align: 'center' });
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
        doc.text('Sector Recepción', margin + sigBoxW / 2, y + 40, { align: 'center' });

        // Firma Recibe
        const sig2X = margin + sigBoxW + 20;
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(sig2X, y, sigBoxW, 42, 3, 3, 'S');
        doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(148, 163, 184);
        doc.text('RECIBE', sig2X + sigBoxW / 2, y + 6, { align: 'center' });
        doc.setDrawColor(13, 59, 102);
        doc.line(sig2X + 12, y + 30, sig2X + sigBoxW - 12, y + 30);
        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(13, 59, 102);
        doc.text(recibePor || '________________________', sig2X + sigBoxW / 2, y + 35, { align: 'center' });
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
        doc.text('Sector Administración', sig2X + sigBoxW / 2, y + 40, { align: 'center' });

        // ═══ FOOTER ═══
        const totalPages = doc.internal.getNumberOfPages();
        for (let p = 1; p <= totalPages; p++) {
            doc.setPage(p);
            doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.3);
            doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
            doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(170, 170, 170);
            doc.text('Esta constancia acredita la entrega de garantías / compromisos de pago. Conserve este documento como comprobante.', margin, pageH - 8);
            doc.text(`Sistema ADM-QUI — Sanatorio Argentino · Pág. ${p}/${totalPages}`, pageW - margin, pageH - 8, { align: 'right' });
        }

        doc.save(`rendicion_${codigo}.pdf`);
    };

    const handleEmitirRendicion = async () => {
        if (!entrega || !recibe) return alert("Completá quién entrega y quién recibe");
        setGeneratingPDF(true);

        try {
            const ids = cartItems.map(c => c.id);
            const snapshotGarantias = [...cartItems];
            const data = { entrega, recibe, notas, firma_entrega: null, firma_recibe: null };
            const result = await emitirRendicion(ids, data, 'Recepción');

            // Generate PDF immediately with the snapshot
            await generateRendicionPDF(result.codigo, snapshotGarantias, entrega, recibe, notas);

            setEntrega('');
            setRecibe('');
            setNotas('');
            setShowRendicionForm(false);

            await Promise.all([loadData(currentPage, pageSize, searchTerm), loadCartItems()]);
            // Refresh historial if we're on that tab
            loadHistorial();
            alert('✅ Rendición generada exitosamente. El PDF se descargó automáticamente.');
        } catch (error) {
            console.error(error);
            alert("Error al emitir rendición: " + (error.message || error));
        } finally {
            setGeneratingPDF(false);
        }
    };

    // ── Historial de Rendiciones ──
    const loadHistorial = useCallback(async () => {
        setLoadingHistorial(true);
        try {
            let query = supabase
                .from('rendiciones_garantias')
                .select('*')
                .order('created_at', { ascending: false });

            if (historialSearch.trim()) {
                const s = historialSearch.trim();
                query = query.or(`codigo.ilike.%${s}%,responsable_entrega.ilike.%${s}%,responsable_recibe.ilike.%${s}%,observaciones.ilike.%${s}%`);
            }

            const { data, error } = await query;
            if (error) throw error;
            setRendiciones(data || []);
        } catch (e) {
            console.error('Error loading historial:', e);
        } finally {
            setLoadingHistorial(false);
        }
    }, [historialSearch]);

    useEffect(() => {
        if (activeTab === 'historial') loadHistorial();
    }, [activeTab, loadHistorial]);

    const handleExpandRendicion = async (rendicionId) => {
        if (expandedRendicion === rendicionId) {
            setExpandedRendicion(null);
            return;
        }
        setExpandedRendicion(rendicionId);
        if (!rendicionDetalle[rendicionId]) {
            const { data, error } = await supabase
                .from('altas_administrativas')
                .select('id, paciente, id_paciente, cliente, fecha_ingreso, especialidad, numero_admision')
                .eq('rendicion_garantia_id', rendicionId);
            if (!error) {
                setRendicionDetalle(prev => ({ ...prev, [rendicionId]: data || [] }));
            }
        }
    };

    const handleReprintRendicion = async (rendicion) => {
        const detalle = rendicionDetalle[rendicion.id];
        if (!detalle) {
            // Load detail first
            const { data } = await supabase
                .from('altas_administrativas')
                .select('id, paciente, id_paciente, cliente, fecha_ingreso, especialidad, numero_admision')
                .eq('rendicion_garantia_id', rendicion.id);
            if (data) {
                setRendicionDetalle(prev => ({ ...prev, [rendicion.id]: data }));
                await generateRendicionPDF(rendicion.codigo, data, rendicion.responsable_entrega, rendicion.responsable_recibe, rendicion.observaciones);
            }
        } else {
            await generateRendicionPDF(rendicion.codigo, detalle, rendicion.responsable_entrega, rendicion.responsable_recibe, rendicion.observaciones);
        }
    };

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
                        { id: 'historial', label: 'Historial', icon: <History size={15} />, badge: rendiciones.length },
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

                {activeTab === 'pendientes' && (
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
                )}

                {activeTab === 'carrito' && (
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

                {/* ═══ TAB 3: HISTORIAL ═══ */}
                {activeTab === 'historial' && (
                    <div>
                        {/* Search */}
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
                                    placeholder="🔍 Buscar por código, responsable u observaciones..."
                                    value={historialSearch}
                                    onChange={e => setHistorialSearch(e.target.value)}
                                    style={{
                                        width: '100%', padding: '10px 16px 10px 42px',
                                        borderRadius: '8px', border: '1px solid #CBD5E1',
                                        fontSize: '0.9rem', outline: 'none',
                                    }}
                                />
                                {historialSearch && (
                                    <button onClick={() => setHistorialSearch('')} style={{
                                        position: 'absolute', right: '12px', top: '10px',
                                        background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '2px',
                                    }}>
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                            <button
                                onClick={loadHistorial}
                                style={{
                                    background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '8px',
                                    padding: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#475569'
                                }}
                                title="Actualizar"
                            >
                                <RefreshCw size={16} />
                            </button>
                        </div>

                        {/* Rendiciones Table */}
                        <div style={{
                            background: 'white', borderRadius: '12px',
                            border: '1px solid #E2E8F0', overflow: 'hidden',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                        }}>
                            {loadingHistorial ? (
                                <p style={{ textAlign: 'center', color: '#64748B', padding: '40px' }}>Cargando historial...</p>
                            ) : rendiciones.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94A3B8' }}>
                                    <History size={48} strokeWidth={1.2} style={{ margin: '0 auto 12px', display: 'block' }} />
                                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#64748B', margin: '0 0 4px' }}>Sin resultados</h3>
                                    <p style={{ fontSize: '0.82rem' }}>No se encontraron rendiciones.</p>
                                </div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                                            <th style={{ ...thStyle, width: '36px' }}></th>
                                            <th style={thStyle}>Código</th>
                                            <th style={thStyle}>Fecha</th>
                                            <th style={thStyle}>Entrega</th>
                                            <th style={thStyle}>Recibe</th>
                                            <th style={{ ...thStyle, textAlign: 'center' }}>Garantías</th>
                                            <th style={{ ...thStyle, textAlign: 'center', width: '100px' }}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rendiciones.map(rend => {
                                            const isExpanded = expandedRendicion === rend.id;
                                            const detalle = rendicionDetalle[rend.id];
                                            const fechaStr = rend.created_at
                                                ? new Date(rend.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                                                : '—';

                                            return (
                                                <React.Fragment key={rend.id}>
                                                    <tr
                                                        style={{
                                                            borderBottom: '1px solid #F1F5F9',
                                                            cursor: 'pointer', transition: 'background 0.15s',
                                                        }}
                                                        onClick={() => handleExpandRendicion(rend.id)}
                                                        onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                    >
                                                        <td style={{ ...tdStyle, textAlign: 'center', padding: '0 4px' }}>
                                                            {isExpanded
                                                                ? <ChevronDown size={16} style={{ color: '#184D87', transition: 'transform 0.2s' }} />
                                                                : <ChevronRight size={16} style={{ color: '#94A3B8', transition: 'transform 0.2s' }} />
                                                            }
                                                        </td>
                                                        <td style={tdStyle}>
                                                            <span style={{
                                                                fontFamily: 'monospace', fontWeight: 700,
                                                                background: '#EBF2FA', color: '#184D87',
                                                                padding: '2px 8px', borderRadius: '6px', fontSize: '0.78rem',
                                                            }}>
                                                                {rend.codigo}
                                                            </span>
                                                        </td>
                                                        <td style={tdStyle}>{fechaStr}</td>
                                                        <td style={tdStyle}>{rend.responsable_entrega || '—'}</td>
                                                        <td style={tdStyle}>{rend.responsable_recibe || '—'}</td>
                                                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700 }}>
                                                            {rend.cantidad_garantias || '—'}
                                                        </td>
                                                        <td style={{ ...tdStyle, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                                                            <button
                                                                onClick={() => handleReprintRendicion(rend)}
                                                                style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                    padding: '4px 10px', fontSize: '0.72rem', fontWeight: 600,
                                                                    borderRadius: '6px', border: '1px solid #93C5FD',
                                                                    background: '#EFF6FF', color: '#2563EB',
                                                                    cursor: 'pointer', transition: 'all 0.2s',
                                                                }}
                                                                onMouseOver={e => e.currentTarget.style.background = '#DBEAFE'}
                                                                onMouseOut={e => e.currentTarget.style.background = '#EFF6FF'}
                                                            >
                                                                <Printer size={12} /> Descargar PDF
                                                            </button>
                                                        </td>
                                                    </tr>

                                                    {isExpanded && detalle && (
                                                        <tr key={`${rend.id}-detail`}>
                                                            <td colSpan={7} style={{ padding: 0, border: 'none' }}>
                                                                <div style={{
                                                                    background: '#F9FAFB',
                                                                    borderLeft: '3px solid #184D87',
                                                                    margin: '0 8px 8px 24px',
                                                                    borderRadius: '0 8px 8px 0',
                                                                    padding: '8px 16px',
                                                                }}>
                                                                    {rend.observaciones && (
                                                                        <div style={{
                                                                            background: '#FFFBEB', border: '1px solid #FDE68A',
                                                                            borderRadius: '6px', padding: '6px 12px', marginBottom: '8px',
                                                                            fontSize: '0.78rem', color: '#92400E'
                                                                        }}>
                                                                            <strong>Observaciones:</strong> {rend.observaciones}
                                                                        </div>
                                                                    )}
                                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                                                        <thead>
                                                                            <tr>
                                                                                <th style={thSmall}>#</th>
                                                                                <th style={thSmall}>Ingreso</th>
                                                                                <th style={thSmall}>Paciente</th>
                                                                                <th style={thSmall}>DNI</th>
                                                                                <th style={thSmall}>Obra Social</th>
                                                                                <th style={thSmall}>Especialidad</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {detalle.map((item, idx) => (
                                                                                <tr key={item.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                                                                                    <td style={{ ...tdSmall, textAlign: 'center', fontWeight: 700, color: '#9CA3AF' }}>{idx + 1}</td>
                                                                                    <td style={tdSmall}>
                                                                                        {item.fecha_ingreso ? new Date(item.fecha_ingreso + 'T12:00:00').toLocaleDateString('es-AR') : '—'}
                                                                                    </td>
                                                                                    <td style={{ ...tdSmall, fontWeight: 600 }}>{item.paciente}</td>
                                                                                    <td style={{ ...tdSmall, fontFamily: 'monospace' }}>{item.id_paciente || '—'}</td>
                                                                                    <td style={tdSmall}>{item.cliente || '—'}</td>
                                                                                    <td style={tdSmall}>{item.especialidad || '—'}</td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}

                                                    {isExpanded && !detalle && (
                                                        <tr key={`${rend.id}-loading`}>
                                                            <td colSpan={7} style={{ padding: '16px', textAlign: 'center', color: '#64748B', fontSize: '0.82rem' }}>
                                                                Cargando detalle...
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}
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

const thSmall = {
    padding: '4px 8px',
    textAlign: 'left',
    fontSize: '0.7rem',
    fontWeight: 600,
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
    borderBottom: '1px solid #E5E7EB'
};

const tdSmall = {
    padding: '5px 8px',
    fontSize: '0.78rem',
    color: '#374151',
    verticalAlign: 'middle'
};
