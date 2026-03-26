/**
 * DeudasPanel.jsx — Panel completo de gestión de deudas
 * Features: Importador Excel, tabla deudores, ficha detalle, chat WhatsApp,
 * métricas (Top 10), seguimiento, categorización
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Upload, Search, Filter, DollarSign, Phone, MessageSquare,
    ChevronRight, ChevronDown, X, AlertTriangle, FileText,
    TrendingUp, Users, PhoneOff, Send, Clock, CheckCircle,
    XCircle, Edit3, Plus, ArrowLeft, RefreshCw, BarChart3,
    Eye, Banknote, UserCheck, UserX, History, Activity, Percent,
} from 'lucide-react';
import {
    fetchDeudores, fetchFacturas, fetchSeguimiento, addSeguimiento,
    updateDeudorTelefono, updateDeudorCategoria, importarDeudas,
    fetchMetricasDeudas, fetchWhatsAppTracking, CATEGORIAS_DEUDOR,
    updateDeudor,
} from '../services/deudaService';
import { parseDeudaExcel } from '../utils/deudaExcelParser';
import { subscribeToAllIncoming } from '../services/chatService';
import ChatWindow from './ChatWindow';

const VIEWS = { LIST: 'list', DETAIL: 'detail' };

export default function DeudasPanel({ addToast, currentUser }) {
    // ─── State principal ───
    const [view, setView] = useState(VIEWS.LIST);
    const [deudores, setDeudores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [catFilter, setCatFilter] = useState(null);
    const [telFilter, setTelFilter] = useState(null); // null=todos, true=con, false=sin
    const [metricas, setMetricas] = useState(null);
    const [showMetricas, setShowMetricas] = useState(false);

    // ─── Importación ───
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const fileInputRef = useRef(null);

    // ─── Detail view ───
    const [selectedDeudor, setSelectedDeudor] = useState(null);
    const [facturas, setFacturas] = useState([]);
    const [seguimiento, setSeguimiento] = useState([]);
    const [whatsappTracking, setWhatsappTracking] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [editingPhone, setEditingPhone] = useState(false);
    const [phoneInput, setPhoneInput] = useState('');
    const [newNote, setNewNote] = useState('');
    const [noteType, setNoteType] = useState('nota');

    // ─── Chat ───
    const [chatOpen, setChatOpen] = useState(false);

    const empleadoNombre = currentUser?.nombre || 'Administrador';

    // ─── Refs para acceder a estado fresco en callbacks de realtime ───
    const deudoresRef = useRef([]);
    const selectedDeudorRef = useRef(null);
    useEffect(() => { deudoresRef.current = deudores; }, [deudores]);
    useEffect(() => { selectedDeudorRef.current = selectedDeudor; }, [selectedDeudor]);

    // ─── Load data ───
    const loadDeudores = useCallback(async () => {
        setLoading(true);
        try {
            const filters = {};
            if (catFilter) filters.categoria = catFilter;
            if (search) filters.search = search;
            if (telFilter !== null) filters.conTelefono = telFilter;
            const data = await fetchDeudores(filters);
            setDeudores(data);
            const m = await fetchMetricasDeudas();
            setMetricas(m);
        } catch (err) {
            console.error('Error loading deudores:', err);
            addToast?.('Error al cargar deudores', 'error');
        } finally {
            setLoading(false);
        }
    }, [catFilter, search, telFilter, addToast]);

    useEffect(() => { loadDeudores(); }, [loadDeudores]);

    // ─── REALTIME: Suscripción a mensajes entrantes de deudores ───
    useEffect(() => {
        const unsub = subscribeToAllIncoming(async (newMsg) => {
            if (newMsg.direction !== 'incoming') return;
            const phone = newMsg.phone;
            if (!phone) return;

            // Buscar si el teléfono pertenece a un deudor
            const matchedDeudor = deudoresRef.current.find(d => d.telefono === phone);
            if (!matchedDeudor) return;

            // ¡Un deudor respondió!
            const preview = (newMsg.content || '📎 Media').substring(0, 50);
            addToast?.(`💰 DEUDOR respondió — ${matchedDeudor.nombre}: ${preview}`, 'info');

            // Actualizar ultima_respuesta_at en la DB
            try {
                await updateDeudor(matchedDeudor.id, {
                    ultima_respuesta_at: new Date().toISOString(),
                });
            } catch (e) { console.warn('Error updating ultima_respuesta_at:', e); }

            // Si estamos viendo el detalle de este deudor, refrescar tracking
            const current = selectedDeudorRef.current;
            if (current && current.id === matchedDeudor.id) {
                try {
                    const tracking = await fetchWhatsAppTracking(phone);
                    setWhatsappTracking(tracking);
                    setSelectedDeudor(prev => ({
                        ...prev,
                        ultima_respuesta_at: new Date().toISOString(),
                    }));
                } catch (e) { console.warn('Error refreshing tracking:', e); }
            }
        });

        return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [addToast]);

    // ─── Load detail ───
    const openDetail = useCallback(async (deudor) => {
        setSelectedDeudor(deudor);
        setView(VIEWS.DETAIL);
        setDetailLoading(true);
        setEditingPhone(false);
        setPhoneInput(deudor.telefono || '');
        try {
            const [facts, segs] = await Promise.all([
                fetchFacturas(deudor.id),
                fetchSeguimiento(deudor.id),
            ]);
            setFacturas(facts);
            setSeguimiento(segs);
            if (deudor.telefono) {
                const tracking = await fetchWhatsAppTracking(deudor.telefono);
                setWhatsappTracking(tracking);
            } else {
                setWhatsappTracking(null);
            }
        } catch (err) {
            addToast?.('Error al cargar detalle', 'error');
        } finally {
            setDetailLoading(false);
        }
    }, [addToast]);

    const goBack = useCallback(() => {
        setView(VIEWS.LIST);
        setSelectedDeudor(null);
        loadDeudores();
    }, [loadDeudores]);

    // ─── Import Excel ───
    const handleFileSelect = useCallback(async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (fileInputRef.current) fileInputRef.current.value = '';

        setImporting(true);
        setImportResult(null);
        try {
            addToast?.('Procesando archivo Excel...', 'info');
            const { registros, totalFilas, filasConDeuda, filasDescartadas } = await parseDeudaExcel(file);
            addToast?.(`${filasConDeuda} registros con deuda detectados. Importando...`, 'info');

            const result = await importarDeudas(registros, empleadoNombre);
            setImportResult({
                ...result,
                totalFilas,
                filasConDeuda,
                filasDescartadasParser: filasDescartadas,
            });
            addToast?.(`Importación exitosa: ${result.pacientesNuevos} nuevos, ${result.pacientesActualizados} actualizados`, 'success');
            loadDeudores();
        } catch (err) {
            console.error('Import error:', err);
            addToast?.('Error al importar: ' + err.message, 'error');
        } finally {
            setImporting(false);
        }
    }, [empleadoNombre, addToast, loadDeudores]);

    // ─── Phone ───
    const handleSavePhone = useCallback(async () => {
        if (!selectedDeudor) return;
        const phone = phoneInput.replace(/\D/g, '');
        if (phone && (phone.length !== 13 || !phone.startsWith('549'))) {
            addToast?.('El número debe tener 13 dígitos y comenzar con 549 (ej: 5492645438114)', 'error');
            return;
        }
        try {
            await updateDeudor(selectedDeudor.id, { telefono: phone || null, telefono_invalido: false });
            setSelectedDeudor(prev => ({ ...prev, telefono: phone || null, telefono_invalido: false }));
            setEditingPhone(false);
            if (phone) {
                await addSeguimiento(selectedDeudor.id, {
                    tipo: 'nota',
                    descripcion: `Teléfono actualizado y validado: ${phone}`,
                    usuario: empleadoNombre,
                });
                const tracking = await fetchWhatsAppTracking(phone);
                setWhatsappTracking(tracking);
            }
            addToast?.('Teléfono actualizado', 'success');
        } catch (err) {
            addToast?.('Error al guardar teléfono', 'error');
        }
    }, [selectedDeudor, phoneInput, empleadoNombre, addToast]);

    // ─── Categoría ───
    const handleChangeCategoria = useCallback(async (newCat) => {
        if (!selectedDeudor) return;
        try {
            await updateDeudorCategoria(selectedDeudor.id, newCat, empleadoNombre);
            setSelectedDeudor(prev => ({ ...prev, categoria: newCat }));
            const segs = await fetchSeguimiento(selectedDeudor.id);
            setSeguimiento(segs);
            addToast?.(`Categoría: ${CATEGORIAS_DEUDOR[newCat]?.label}`, 'success');
        } catch (err) {
            addToast?.('Error al cambiar categoría', 'error');
        }
    }, [selectedDeudor, empleadoNombre, addToast]);

    // ─── Nota ───
    const handleAddNote = useCallback(async () => {
        if (!newNote.trim() || !selectedDeudor) return;
        try {
            await addSeguimiento(selectedDeudor.id, {
                tipo: noteType,
                descripcion: newNote.trim(),
                usuario: empleadoNombre,
            });
            setNewNote('');
            const segs = await fetchSeguimiento(selectedDeudor.id);
            setSeguimiento(segs);
            addToast?.('Nota agregada', 'success');
        } catch (err) {
            addToast?.('Error al agregar nota', 'error');
        }
    }, [selectedDeudor, newNote, noteType, empleadoNombre, addToast]);

    // ─── Helpers ───
    const formatMoney = (n) => {
        const num = Number(n) || 0;
        return num.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 });
    };
    const formatDate = (d) => d ? new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
    const formatDateTime = (d) => d ? new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
    const timeAgo = (d) => {
        if (!d) return null;
        const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
        if (mins < 60) return `${mins}m`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h`;
        const days = Math.floor(hrs / 24);
        return `${days}d`;
    };

    // ═══════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════

    if (view === VIEWS.DETAIL && selectedDeudor) {
        return renderDetail();
    }

    return renderList();

    // ─── VISTA: LISTADO ───
    function renderList() {
        return (
            <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
                {/* HEADER */}
                <div style={st.header}>
                    <div style={st.headerLeft}>
                        <div style={{ ...st.iconBadge, background: 'linear-gradient(135deg, #F59E0B, #D97706)' }}>
                            <DollarSign size={22} color="#fff" />
                        </div>
                        <div>
                            <h2 style={st.headerTitle}>Gestión de Deudas</h2>
                            <span style={st.headerSub}>Seguimiento de cobros · Fuente: SALUS</span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button onClick={() => setShowMetricas(p => !p)} style={st.btnSmall}>
                            <BarChart3 size={14} /> {showMetricas ? 'Ocultar' : 'Métricas'}
                        </button>
                        <button onClick={loadDeudores} style={st.btnSmall}>
                            <RefreshCw size={14} /> Actualizar
                        </button>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={importing}
                            style={{ ...st.btnSmall, background: '#16A34A', color: '#fff', border: 'none', boxShadow: '0 2px 8px rgba(22,163,106,0.25)' }}
                        >
                            {importing ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={14} />}
                            {importing ? 'Importando...' : 'Importar Excel'}
                        </button>
                        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelect} style={{ display: 'none' }} />
                    </div>
                </div>

                {/* IMPORT RESULT */}
                {importResult && (
                    <div style={st.importResult}>
                        <CheckCircle size={16} style={{ color: '#16A34A' }} />
                        <span>
                            <strong>Importación completada:</strong> {importResult.pacientesNuevos} nuevos, {importResult.pacientesActualizados} actualizados, {importResult.filasImportadas} facturas procesadas
                            {importResult.filasIgnoradas > 0 && ` · ${importResult.filasIgnoradas + importResult.filasDescartadasParser} descartadas (sin deuda o sin NHC)`}
                        </span>
                        <button onClick={() => setImportResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
                            <X size={14} />
                        </button>
                    </div>
                )}

                {/* QUICK STATS */}
                {metricas && (
                    <div style={st.quickStats}>
                        <div style={st.statCard}>
                            <Users size={18} style={{ color: '#3B82F6' }} />
                            <div><span style={st.statValue}>{metricas.total}</span><span style={st.statLabel}>Deudores</span></div>
                        </div>
                        <div style={st.statCard}>
                            <DollarSign size={18} style={{ color: '#F59E0B' }} />
                            <div><span style={st.statValue}>{formatMoney(metricas.deudaTotal)}</span><span style={st.statLabel}>Deuda Total</span></div>
                        </div>
                        <div style={st.statCard}>
                            <Phone size={18} style={{ color: '#16A34A' }} />
                            <div><span style={st.statValue}>{metricas.conTelefono}</span><span style={st.statLabel}>Con teléfono</span></div>
                        </div>
                        <div style={st.statCard}>
                            <PhoneOff size={18} style={{ color: '#EF4444' }} />
                            <div><span style={st.statValue}>{metricas.sinTelefono}</span><span style={st.statLabel}>Sin teléfono</span></div>
                        </div>
                        <div style={st.statCard}>
                            <Send size={18} style={{ color: '#8B5CF6' }} />
                            <div><span style={st.statValue}>{metricas.contactados}</span><span style={st.statLabel}>Contactados</span></div>
                        </div>
                    </div>
                )}

                {/* MÉTRICAS EXPANDIDAS — TOP 10 Y KPIs */}
                {showMetricas && metricas && (
                    <div style={st.metricasPanel}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                            {/* Top 10 */}
                            <div style={st.metricaCard}>
                                <h4 style={st.metricaTitle}><TrendingUp size={14} /> Top 10 Mayor Deuda</h4>
                                {metricas.top10.map((p, i) => (
                                    <div key={p.id} style={st.topRow}
                                        onClick={() => openDetail(p)}
                                    >
                                        <span style={{
                                            ...st.topRank,
                                            background: i < 3 ? '#FEF3C7' : '#F1F5F9',
                                            color: i < 3 ? '#D97706' : '#64748B',
                                        }}>
                                            {i + 1}
                                        </span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <span style={st.topName}>{p.nombre}</span>
                                            <span style={st.topNhc}>NHC: {p.nhc}</span>
                                        </div>
                                        <span style={st.topAmount}>{formatMoney(p.deuda_total)}</span>
                                    </div>
                                ))}
                            </div>
                            
                            {/* Por categoría */}
                            <div style={st.metricaCard}>
                                <h4 style={st.metricaTitle}><Filter size={14} /> Por Categoría</h4>
                                {Object.entries(CATEGORIAS_DEUDOR).map(([key, cfg]) => {
                                    const dato = metricas.porCategoria[key] || { count: 0, monto: 0 };
                                    return (
                                        <div key={key} style={st.catRow}>
                                            <span style={{ ...st.catDot, background: cfg.color }}>{cfg.icon}</span>
                                            <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 600, color: '#0D3B66' }}>{cfg.label}</span>
                                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569' }}>{dato.count}</span>
                                            <span style={{ fontSize: '0.78rem', color: '#94A3B8', minWidth: '100px', textAlign: 'right' }}>
                                                {formatMoney(dato.monto)}
                                            </span>
                                        </div>
                                    );
                                })}
                                <div style={{ ...st.catRow, marginTop: '8px', borderTop: '1px solid #E2E8F0', paddingTop: '8px' }}>
                                    <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 800, color: '#0D3B66' }}>Total</span>
                                    <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0D3B66' }}>{metricas.total}</span>
                                    <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0D3B66', minWidth: '100px', textAlign: 'right' }}>
                                        {formatMoney(metricas.deudaTotal)}
                                    </span>
                                </div>
                            </div>

                            {/* KPIs de Eficiencia */}
                            <div style={st.metricaCard}>
                                <h4 style={st.metricaTitle}><Activity size={14} /> KPIs de Recuperación</h4>
                                
                                <div style={st.kpiRow}>
                                    <Percent size={16} color="#3B82F6" />
                                    <div style={{ flex: 1 }}>
                                        <div style={st.kpiLabel}>Tasa de Contactabilidad</div>
                                        <div style={st.kpiSub}>Deudores con tel. vs contactados</div>
                                    </div>
                                    <div style={st.kpiValue}>{metricas.tasaContactabilidad}%</div>
                                </div>

                                <div style={st.kpiRow}>
                                    <MessageSquare size={16} color="#16A34A" />
                                    <div style={{ flex: 1 }}>
                                        <div style={st.kpiLabel}>Tasa de Respuesta</div>
                                        <div style={st.kpiSub}>Contactados vs respondieron</div>
                                    </div>
                                    <div style={st.kpiValue}>{metricas.tasaRespuesta}%</div>
                                </div>

                                <div style={st.kpiRow}>
                                    <Banknote size={16} color="#D97706" />
                                    <div style={{ flex: 1 }}>
                                        <div style={st.kpiLabel}>Ticket Promedio</div>
                                        <div style={st.kpiSub}>Deuda media x paciente</div>
                                    </div>
                                    <div style={st.kpiValue}>{formatMoney(metricas.promedioPorPaciente)}</div>
                                </div>

                                <div style={{ ...st.kpiRow, borderBottom: 'none', marginBottom: 0 }}>
                                    <UserX size={16} color="#EF4444" />
                                    <div style={{ flex: 1 }}>
                                        <div style={st.kpiLabel}>Pendientes de Gestión</div>
                                        <div style={st.kpiSub}>Con teléfono, sin contactar</div>
                                    </div>
                                    <div style={{ ...st.kpiValue, color: '#EF4444' }}>
                                        {metricas.conTelefono - metricas.contactados} pac.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* FILTROS */}
                <div style={st.filters}>
                    <div style={st.searchWrap}>
                        <Search size={16} style={{ color: '#94A3B8' }} />
                        <input
                            type="text"
                            placeholder="Buscar por nombre, NHC o teléfono..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={st.searchInput}
                        />
                        {search && <button onClick={() => setSearch('')} style={st.clearBtn}><X size={14} /></button>}
                    </div>
                    <div style={st.filterBtns}>
                        <button onClick={() => setCatFilter(null)} style={{ ...st.filterBtn, ...(catFilter === null ? st.filterBtnActive : {}) }}>Todos</button>
                        {Object.entries(CATEGORIAS_DEUDOR).map(([key, cfg]) => (
                            <button key={key} onClick={() => setCatFilter(key)}
                                style={{
                                    ...st.filterBtn,
                                    ...(catFilter === key ? { ...st.filterBtnActive, background: cfg.bg, borderColor: cfg.color + '40', color: cfg.color } : {}),
                                }}>
                                {cfg.icon} {cfg.label}
                            </button>
                        ))}
                    </div>
                    <div style={st.filterBtns}>
                        <button onClick={() => setTelFilter(null)} style={{ ...st.filterBtn, ...(telFilter === null ? st.filterBtnActive : {}) }}>📱 Todos</button>
                        <button onClick={() => setTelFilter(true)} style={{ ...st.filterBtn, ...(telFilter === true ? st.filterBtnActive : {}) }}>✅ Con teléfono</button>
                        <button onClick={() => setTelFilter(false)} style={{ ...st.filterBtn, ...(telFilter === false ? st.filterBtnActive : {}) }}>❌ Sin teléfono</button>
                    </div>
                </div>

                {/* TABLA DEUDORES */}
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: '#94A3B8' }}>
                        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
                        <p>Cargando deudores...</p>
                    </div>
                ) : deudores.length === 0 ? (
                    <div style={st.emptyState}>
                        <DollarSign size={48} strokeWidth={1.2} style={{ color: '#CBD5E1' }} />
                        <h3 style={{ margin: '12px 0 4px', color: '#475569' }}>Sin deudores registrados</h3>
                        <p style={{ color: '#94A3B8', fontSize: '0.9rem' }}>Importá el Excel de deudas desde SALUS para comenzar.</p>
                    </div>
                ) : (
                    <div style={st.tableWrap}>
                        <table style={st.table}>
                            <thead>
                                <tr>
                                    <th style={st.th}>Paciente</th>
                                    <th style={{ ...st.th, width: '90px' }}>NHC</th>
                                    <th style={{ ...st.th, width: '140px', textAlign: 'right' }}>Deuda</th>
                                    <th style={{ ...st.th, width: '50px', textAlign: 'center' }}>Fact.</th>
                                    <th style={{ ...st.th, width: '155px' }}>Categoría</th>
                                    <th style={{ ...st.th, width: '120px' }}>Teléfono</th>
                                    <th style={{ ...st.th, width: '80px', textAlign: 'center' }}>Contacto</th>
                                    <th style={{ ...st.th, width: '36px' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {deudores.map(d => {
                                    const cat = CATEGORIAS_DEUDOR[d.categoria] || CATEGORIAS_DEUDOR.sin_gestionar;
                                    return (
                                        <tr key={d.id} style={st.tr} onClick={() => openDetail(d)}
                                            onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <td style={st.td}>
                                                <span style={{ fontWeight: 700, color: '#0D3B66', fontSize: '0.85rem' }}>{d.nombre}</span>
                                            </td>
                                            <td style={{ ...st.td, fontFamily: 'monospace', fontSize: '0.78rem', color: '#64748B' }}>{d.nhc}</td>
                                            <td style={{ ...st.td, textAlign: 'right', fontWeight: 800, color: '#D97706', fontSize: '0.88rem' }}>
                                                {formatMoney(d.deuda_total)}
                                            </td>
                                            <td style={{ ...st.td, textAlign: 'center', fontSize: '0.82rem', color: '#475569' }}>{d.cantidad_facturas}</td>
                                            <td style={st.td}>
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                    padding: '4px 12px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700,
                                                    background: cat.bg, color: cat.color, border: `1px solid ${cat.color}30`,
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                    {cat.icon} {cat.label}
                                                </span>
                                            </td>
                                            <td style={{ ...st.td, fontSize: '0.78rem', color: d.telefono_invalido ? '#EF4444' : (d.telefono ? '#16A34A' : '#CBD5E1') }}>
                                                {d.telefono ? (
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        {d.telefono_invalido && <AlertTriangle size={12} />}
                                                        {d.telefono_invalido ? d.telefono : `···${d.telefono.slice(-4)}`}
                                                    </span>
                                                ) : 'Sin teléfono'}
                                            </td>
                                            <td style={{ ...st.td, fontSize: '0.75rem', textAlign: 'center' }}>
                                                {d.ultimo_contacto_at ? (
                                                    <span style={{ color: '#3B82F6', fontWeight: 600 }}>
                                                        {timeAgo(d.ultimo_contacto_at)}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#CBD5E1' }}>—</span>
                                                )}
                                            </td>
                                            <td style={st.td}>
                                                <ChevronRight size={16} style={{ color: '#94A3B8' }} />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                <style>{`
                    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
                `}</style>
            </div>
        );
    }

    // ─── VISTA: DETALLE DEL DEUDOR ───
    function renderDetail() {
        const cat = CATEGORIAS_DEUDOR[selectedDeudor.categoria] || CATEGORIAS_DEUDOR.sin_gestionar;

        return (
            <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
                {/* Back button */}
                <button onClick={goBack} style={st.backBtn}>
                    <ArrowLeft size={16} /> Volver al listado
                </button>

                {/* Patient Header */}
                <div style={{ ...st.detailHeader, borderColor: cat.color + '30' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                        <div style={{
                            ...st.iconBadge, width: '56px', height: '56px',
                            background: `linear-gradient(135deg, ${cat.color}, ${cat.color}CC)`,
                        }}>
                            <DollarSign size={26} color="#fff" />
                        </div>
                        <div style={{ flex: 1 }}>
                            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#0D3B66' }}>
                                {selectedDeudor.nombre}
                            </h2>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '4px' }}>
                                <span style={{ fontSize: '0.82rem', color: '#64748B' }}>NHC: <strong>{selectedDeudor.nhc}</strong></span>
                                <span style={{
                                    padding: '2px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700,
                                    background: cat.bg, color: cat.color, border: `1px solid ${cat.color}30`,
                                }}>
                                    {cat.icon} {cat.label}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#D97706', letterSpacing: '-1px' }}>
                            {formatMoney(selectedDeudor.deuda_total)}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>
                            {selectedDeudor.cantidad_facturas} factura{selectedDeudor.cantidad_facturas !== 1 ? 's' : ''}
                        </div>
                    </div>
                </div>

                {/* Grid: Info + Seguimiento */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                    {/* LEFT: Teléfono + Categoría + Facturas */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {/* Teléfono */}
                        <div style={st.card}>
                            <h4 style={st.cardTitle}><Phone size={14} /> Teléfono WhatsApp</h4>
                            {editingPhone ? (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input
                                        type="text"
                                        value={phoneInput}
                                        onChange={e => setPhoneInput(e.target.value.replace(/\D/g, ''))}
                                        placeholder="5492645438114"
                                        style={st.input}
                                        maxLength={15}
                                        autoFocus
                                    />
                                    <button onClick={handleSavePhone} style={{ ...st.btnSmall, background: '#16A34A', color: '#fff', border: 'none' }}>
                                        Guardar
                                    </button>
                                    <button onClick={() => { setEditingPhone(false); setPhoneInput(selectedDeudor.telefono || ''); }} style={st.btnSmall}>
                                        Cancelar
                                    </button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    {selectedDeudor.telefono ? (
                                        <>
                                            <span style={{ 
                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                fontSize: '1rem', fontWeight: 700, 
                                                color: selectedDeudor.telefono_invalido ? '#EF4444' : '#16A34A', 
                                                fontFamily: 'monospace' 
                                            }}>
                                                {selectedDeudor.telefono_invalido && <AlertTriangle size={16} title="El formato debe ser 549X (13 dígitos)" />}
                                                {selectedDeudor.telefono}
                                            </span>
                                            {!selectedDeudor.telefono_invalido && (
                                                <button onClick={() => setChatOpen(true)} style={{
                                                    ...st.btnSmall, background: '#25D366', color: '#fff', border: 'none',
                                                    boxShadow: '0 2px 8px rgba(37,211,102,0.3)',
                                                }}>
                                                    <MessageSquare size={14} /> Chat
                                                </button>
                                            )}
                                        </>
                                    ) : (
                                        <span style={{ fontSize: '0.88rem', color: '#CBD5E1' }}>Sin número registrado</span>
                                    )}
                                    <button onClick={() => setEditingPhone(true)} style={{ ...st.btnSmall, marginLeft: 'auto' }}>
                                        <Edit3 size={14} /> {selectedDeudor.telefono ? 'Cambiar' : 'Agregar'}
                                    </button>
                                </div>
                            )}
                            <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: '#94A3B8' }}>
                                ⚠️ Formato obligatorio: <strong>549</strong> + código de área + número (ej: 5492645438114)
                            </p>
                        </div>

                        {/* Categoría */}
                        <div style={st.card}>
                            <h4 style={st.cardTitle}><Filter size={14} /> Categoría del Deudor</h4>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {Object.entries(CATEGORIAS_DEUDOR).map(([key, cfg]) => (
                                    <button key={key}
                                        onClick={() => handleChangeCategoria(key)}
                                        style={{
                                            padding: '8px 14px', borderRadius: '12px',
                                            border: selectedDeudor.categoria === key ? `2px solid ${cfg.color}` : '2px solid #E2E8F0',
                                            background: selectedDeudor.categoria === key ? cfg.bg : '#FAFBFC',
                                            color: selectedDeudor.categoria === key ? cfg.color : '#64748B',
                                            fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        {cfg.icon} {cfg.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* WhatsApp Tracking */}
                        {selectedDeudor.telefono && (
                            <div style={st.card}>
                                <h4 style={st.cardTitle}><MessageSquare size={14} /> Tracking de Comunicación</h4>
                                {whatsappTracking ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        <div style={st.trackingCell}>
                                            <span style={st.trackingLabel}>Último msg enviado</span>
                                            <span style={st.trackingValue}>
                                                {whatsappTracking.ultimoEnviado
                                                    ? formatDateTime(whatsappTracking.ultimoEnviado.created_at)
                                                    : 'Nunca'}
                                            </span>
                                            {whatsappTracking.ultimoEnviado?.sender_name && (
                                                <span style={{ fontSize: '0.68rem', color: '#8B5CF6' }}>
                                                    por {whatsappTracking.ultimoEnviado.sender_name}
                                                </span>
                                            )}
                                        </div>
                                        <div style={st.trackingCell}>
                                            <span style={st.trackingLabel}>Última respuesta</span>
                                            <span style={{
                                                ...st.trackingValue,
                                                color: whatsappTracking.ultimaRespuesta ? '#16A34A' : '#EF4444',
                                            }}>
                                                {whatsappTracking.ultimaRespuesta
                                                    ? formatDateTime(whatsappTracking.ultimaRespuesta.created_at)
                                                    : 'Sin respuesta'}
                                            </span>
                                        </div>
                                        <div style={st.trackingCell}>
                                            <span style={st.trackingLabel}>Msgs enviados</span>
                                            <span style={st.trackingValue}>{whatsappTracking.totalEnviados}</span>
                                        </div>
                                        <div style={st.trackingCell}>
                                            <span style={st.trackingLabel}>Msgs recibidos</span>
                                            <span style={{ ...st.trackingValue, color: whatsappTracking.totalRecibidos > 0 ? '#16A34A' : '#CBD5E1' }}>
                                                {whatsappTracking.totalRecibidos}
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <span style={{ color: '#CBD5E1', fontSize: '0.85rem' }}>Cargando...</span>
                                )}
                            </div>
                        )}

                        {/* Facturas */}
                        <div style={st.card}>
                            <h4 style={st.cardTitle}><FileText size={14} /> Facturas Pendientes ({facturas.length})</h4>
                            {detailLoading ? (
                                <span style={{ color: '#94A3B8' }}>Cargando...</span>
                            ) : facturas.length === 0 ? (
                                <span style={{ color: '#CBD5E1' }}>Sin facturas registradas</span>
                            ) : (
                                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                    {facturas.map(f => (
                                        <div key={f.id} style={st.facturaRow}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0D3B66' }}>
                                                    Doc: {f.documento || f.codigo}
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                    {f.servicio || 'Sin servicio'} · {f.forma_pago || ''}
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#D97706' }}>
                                                    {formatMoney(f.pendiente)}
                                                </div>
                                                <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>
                                                    Total: {formatMoney(f.total)}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* RIGHT: Seguimiento / Timeline */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {/* SALUS Warning */}
                        <div style={st.salusWarning}>
                            <AlertTriangle size={16} style={{ color: '#D97706', flexShrink: 0 }} />
                            <div>
                                <strong style={{ fontSize: '0.82rem', color: '#92400E' }}>Recordá:</strong>
                                <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#92400E' }}>
                                    Las notas de cobro son solo para seguimiento. Los pagos reales deben registrarse en <strong>SALUS</strong>.
                                    Al re-importar el Excel, los montos se actualizan desde SALUS.
                                </p>
                            </div>
                        </div>

                        {/* Agregar nota */}
                        <div style={st.card}>
                            <h4 style={st.cardTitle}><Plus size={14} /> Agregar Registro</h4>
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                                {[
                                    { id: 'nota', label: '📝 Nota' },
                                    { id: 'llamada', label: '📞 Llamada' },
                                    { id: 'pago', label: '💰 Pago' },
                                    { id: 'compromiso', label: '🤝 Compromiso' },
                                ].map(t => (
                                    <button key={t.id} onClick={() => setNoteType(t.id)}
                                        style={{
                                            ...st.filterBtn,
                                            ...(noteType === t.id ? st.filterBtnActive : {}),
                                            padding: '4px 10px', fontSize: '0.72rem',
                                        }}>
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="text"
                                    value={newNote}
                                    onChange={e => setNewNote(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                                    placeholder={noteType === 'pago' ? 'Detalle del pago registrado...' : 'Descripción del seguimiento...'}
                                    style={{ ...st.input, flex: 1 }}
                                />
                                <button onClick={handleAddNote} disabled={!newNote.trim()}
                                    style={{
                                        ...st.btnSmall,
                                        background: newNote.trim() ? '#3B82F6' : '#E2E8F0',
                                        color: newNote.trim() ? '#fff' : '#94A3B8',
                                        border: 'none',
                                    }}>
                                    <Send size={14} />
                                </button>
                            </div>
                        </div>

                        {/* Timeline */}
                        <div style={st.card}>
                            <h4 style={st.cardTitle}><History size={14} /> Historial de Seguimiento</h4>
                            {seguimiento.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '24px 0', color: '#CBD5E1' }}>
                                    <Clock size={32} strokeWidth={1.2} />
                                    <p style={{ margin: '8px 0 0', fontSize: '0.85rem' }}>Sin registros de seguimiento</p>
                                </div>
                            ) : (
                                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                    {seguimiento.map(s => {
                                        const icons = {
                                            nota: '📝', llamada: '📞', whatsapp: '💬',
                                            pago: '💰', compromiso: '🤝', cambio_categoria: '🏷️',
                                        };
                                        return (
                                            <div key={s.id} style={st.timelineItem}>
                                                <span style={st.timelineIcon}>{icons[s.tipo] || '📌'}</span>
                                                <div style={{ flex: 1 }}>
                                                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#0D3B66' }}>{s.descripcion}</p>
                                                    <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
                                                        <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>{formatDateTime(s.created_at)}</span>
                                                        <span style={{ fontSize: '0.68rem', color: '#8B5CF6', fontWeight: 600 }}>{s.usuario}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Chat Window */}
                {chatOpen && selectedDeudor.telefono && (
                    <ChatWindow
                        open={chatOpen}
                        onClose={async () => {
                            setChatOpen(false);
                            // Refresh tracking when chat closes (in case user sent a message)
                            if (selectedDeudor?.telefono) {
                                try {
                                    const tracking = await fetchWhatsAppTracking(selectedDeudor.telefono);
                                    setWhatsappTracking(tracking);
                                    // Also refresh the patient list metrics/last contact
                                    loadDeudores();
                                } catch (e) {
                                    console.warn('Error refreshing tracking after chat:', e);
                                }
                            }
                        }}
                        patientName={selectedDeudor.nombre}
                        patientPhone={selectedDeudor.telefono}
                        addToast={addToast}
                    />
                )}

                <style>{`
                    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
                `}</style>
            </div>
        );
    }
}

// ─── ESTILOS ───
const st = {
    header: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 24px', marginBottom: '16px',
        background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)',
        borderRadius: '18px', border: '1px solid rgba(226,232,240,0.5)',
        boxShadow: '0 2px 16px rgba(0,0,0,0.04)',
    },
    headerLeft: { display: 'flex', alignItems: 'center', gap: '14px' },
    headerTitle: { margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0D3B66', letterSpacing: '-0.3px' },
    headerSub: { fontSize: '0.78rem', color: '#64748B', fontWeight: 500 },
    iconBadge: {
        width: '44px', height: '44px', borderRadius: '14px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    },
    btnSmall: {
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        padding: '8px 14px', borderRadius: '10px',
        border: '1px solid #E2E8F0', background: '#FAFBFC',
        fontSize: '0.78rem', fontWeight: 700, color: '#475569',
        cursor: 'pointer', transition: 'all 0.15s',
    },
    importResult: {
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '12px 16px', marginBottom: '16px',
        background: '#DCFCE7', borderRadius: '12px',
        border: '1px solid #BBF7D0', fontSize: '0.82rem', color: '#166534',
    },
    quickStats: {
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '16px',
    },
    statCard: {
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '16px', borderRadius: '14px',
        background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)',
        border: '1px solid rgba(226,232,240,0.5)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
    },
    statValue: { display: 'block', fontSize: '1.1rem', fontWeight: 800, color: '#0D3B66' },
    statLabel: { display: 'block', fontSize: '0.68rem', color: '#94A3B8', fontWeight: 500 },
    metricasPanel: {
        marginBottom: '16px', padding: '20px',
        background: 'rgba(255,255,255,0.85)', borderRadius: '16px',
        border: '1px solid rgba(226,232,240,0.5)',
        animation: 'fadeIn 0.3s ease-out',
    },
    metricaCard: {
        padding: '16px', borderRadius: '14px',
        background: '#FAFBFC', border: '1px solid #E2E8F0',
    },
    metricaTitle: {
        display: 'flex', alignItems: 'center', gap: '6px',
        margin: '0 0 12px', fontSize: '0.88rem', fontWeight: 700, color: '#0D3B66',
    },
    topRow: {
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '8px 10px', borderRadius: '10px', marginBottom: '4px',
        cursor: 'pointer', transition: 'all 0.15s',
    },
    topRank: {
        width: '26px', height: '26px', borderRadius: '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.75rem', fontWeight: 800,
    },
    topName: { display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0D3B66', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    topNhc: { display: 'block', fontSize: '0.65rem', color: '#94A3B8' },
    topAmount: { fontSize: '0.82rem', fontWeight: 800, color: '#D97706', whiteSpace: 'nowrap' },
    catRow: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0' },
    catDot: { fontSize: '0.9rem', width: '24px', textAlign: 'center' },
    filters: {
        display: 'flex', flexDirection: 'column', gap: '10px',
        padding: '16px', marginBottom: '16px',
        background: 'rgba(255,255,255,0.85)', borderRadius: '14px',
        border: '1px solid rgba(226,232,240,0.5)',
    },
    searchWrap: {
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 14px', borderRadius: '12px',
        background: '#FAFBFC', border: '1.5px solid #E2E8F0',
    },
    searchInput: {
        flex: 1, border: 'none', background: 'none', outline: 'none',
        fontSize: '0.88rem', color: '#0D3B66', fontWeight: 500,
    },
    clearBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '2px' },
    filterBtns: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
    filterBtn: {
        padding: '6px 12px', borderRadius: '20px',
        border: '1.5px solid #E2E8F0', background: '#FAFBFC',
        fontSize: '0.75rem', fontWeight: 600, color: '#64748B',
        cursor: 'pointer', transition: 'all 0.15s',
    },
    filterBtnActive: {
        background: '#EFF6FF', borderColor: '#93C5FD', color: '#2563EB',
    },
    emptyState: {
        textAlign: 'center', padding: '80px 20px',
        background: 'rgba(255,255,255,0.85)', borderRadius: '16px',
        border: '1px solid rgba(226,232,240,0.5)',
    },
    tableWrap: {
        background: 'rgba(255,255,255,0.9)', borderRadius: '16px',
        border: '1px solid rgba(226,232,240,0.5)', overflow: 'hidden',
        boxShadow: '0 2px 16px rgba(0,0,0,0.03)',
    },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: {
        padding: '12px 16px', textAlign: 'left',
        fontSize: '0.68rem', fontWeight: 700, color: '#64748B',
        textTransform: 'uppercase', letterSpacing: '0.05em',
        borderBottom: '1px solid #E2E8F0', background: '#FAFBFC',
    },
    tr: {
        cursor: 'pointer', transition: 'background 0.15s',
        borderBottom: '1px solid #F1F5F9',
    },
    td: { padding: '12px 16px', fontSize: '0.82rem' },
    // Detail styles
    backBtn: {
        display: 'inline-flex', alignItems: 'center', gap: '8px',
        padding: '10px 16px', marginBottom: '16px',
        borderRadius: '12px', border: '1.5px solid #E2E8F0', background: '#FAFBFC',
        fontSize: '0.85rem', fontWeight: 700, color: '#475569',
        cursor: 'pointer', transition: 'all 0.15s',
    },
    detailHeader: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '24px', borderRadius: '18px',
        background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)',
        border: '2px solid', boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
    },
    card: {
        padding: '16px', borderRadius: '14px',
        background: 'rgba(255,255,255,0.9)', border: '1px solid #E2E8F0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
    },
    cardTitle: {
        display: 'flex', alignItems: 'center', gap: '6px',
        margin: '0 0 12px', fontSize: '0.88rem', fontWeight: 700, color: '#0D3B66',
    },
    input: {
        padding: '10px 14px', borderRadius: '10px',
        border: '1.5px solid #E2E8F0', background: '#FAFBFC',
        fontSize: '0.88rem', fontWeight: 600, color: '#0D3B66',
        outline: 'none', transition: 'all 0.15s',
    },
    trackingCell: {
        padding: '10px', borderRadius: '10px',
        background: '#F8FAFC', border: '1px solid #E2E8F0',
    },
    trackingLabel: { display: 'block', fontSize: '0.68rem', color: '#94A3B8', fontWeight: 500, marginBottom: '2px' },
    trackingValue: { display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#0D3B66' },
    facturaRow: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px', borderRadius: '10px', marginBottom: '4px',
        background: '#FAFBFC', border: '1px solid #F1F5F9',
    },
    salusWarning: {
        display: 'flex', gap: '10px', padding: '14px 16px',
        background: '#FEF3C7', borderRadius: '12px',
        border: '1px solid #FDE68A',
    },
    timelineItem: {
        display: 'flex', gap: '10px', padding: '10px 0',
        borderBottom: '1px solid #F1F5F9',
    },
    timelineIcon: { fontSize: '1rem', width: '28px', textAlign: 'center', flexShrink: 0 },
    kpiRow: {
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '10px 0', borderBottom: '1px solid #F1F5F9',
        marginBottom: '4px',
    },
    kpiLabel: { display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0D3B66' },
    kpiSub: { display: 'block', fontSize: '0.68rem', color: '#94A3B8' },
    kpiValue: { fontSize: '0.9rem', fontWeight: 800, color: '#0D3B66' },
};
