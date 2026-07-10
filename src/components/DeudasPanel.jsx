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
    Download, CreditCard, Calendar,
} from 'lucide-react';
import {
    fetchDeudores, fetchFacturas, fetchSeguimiento, addSeguimiento,
    updateDeudorTelefono, updateDeudorCategoria, importarDeudas,
    fetchMetricasDeudas, fetchWhatsAppTracking, CATEGORIAS_DEUDOR,
    updateDeudor, fetchPresupuestosPorNhc, MIN_DEUDA,
    fetchAltasPorAdmisiones, fetchPlanesPago, createPlanPago,
    marcarCuotaPagada, cancelarPlan, fetchResponsablesPorNombres,
    fetchCobros, fetchNotasCredito, fetchDeudaCanceladaInfo,
    fetchDeudasCanceladasEnPeriodo,
} from '../services/deudaService';
import { parseDeudaExcel } from '../utils/deudaExcelParser';
import { subscribeToAllIncoming } from '../services/chatService';
import ChatWindow from './ChatWindow';
import * as XLSX from 'xlsx';
import { SkeletonTablePanel } from './SkeletonLoader';

const VIEWS = { LIST: 'list', DETAIL: 'detail' };

export default function DeudasPanel({ addToast, currentUser }) {
    // ─── State principal ───
    const [view, setView] = useState(VIEWS.LIST);
    const [deudores, setDeudores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [catFilter, setCatFilter] = useState(null);
    const [telFilter, setTelFilter] = useState(null); // null=todos, true=con, false=sin
    const [sortBy, setSortBy] = useState('deuda_total');
    const [sortDir, setSortDir] = useState('desc');
    const [metricas, setMetricas] = useState(null);
    const [showMetricas, setShowMetricas] = useState(false);
    const [canceladasPeriodo, setCanceladasPeriodo] = useState(null); // { canceladas: [], totalCanceladas, montoTotalIngresado }
    const [helpTooltip, setHelpTooltip] = useState(null); // index of open tooltip

    // ─── Filtros de tiempo ───
    const [datePreset, setDatePreset] = useState('todos'); // 'todos' | 'este_mes' | 'mes_pasado' | 'custom'
    const [customDateFrom, setCustomDateFrom] = useState('');
    const [customDateTo, setCustomDateTo] = useState('');
    const [dateFilterField, setDateFilterField] = useState('fecha_ultima_factura'); // 'fecha_ultima_factura' | 'deuda_cancelada_at'

    // ─── Importación ───
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const fileInputRef = useRef(null);

    // ─── Detail view ───
    const [selectedDeudor, setSelectedDeudor] = useState(null);
    const [facturas, setFacturas] = useState([]);
    const [cobros, setCobros] = useState([]);
    const [notasCredito, setNotasCredito] = useState([]);
    const [financialTab, setFinancialTab] = useState('facturas');
    const [seguimiento, setSeguimiento] = useState([]);
    const [whatsappTracking, setWhatsappTracking] = useState(null);
    const [presupuestos, setPresupuestos] = useState([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [editingPhone, setEditingPhone] = useState(false);
    const [phoneInput, setPhoneInput] = useState('');
    const [newNote, setNewNote] = useState('');
    const [noteType, setNoteType] = useState('nota');
    const [montoPago, setMontoPago] = useState('');

    // ─── Altas vinculadas ───
    const [altasVinculadas, setAltasVinculadas] = useState([]);

    // ─── Planes de pago ───
    const [planes, setPlanes] = useState([]);
    const [showPlanForm, setShowPlanForm] = useState(false);
    const [planForm, setPlanForm] = useState({
        montoOriginal: '', tipoInteres: 'porcentaje', tasaInteres: '',
        cantidadCuotas: '', fechaInicio: new Date().toISOString().split('T')[0],
        notas: '',
    });

    // ─── Chat ───
    const [chatOpen, setChatOpen] = useState(false);

    const empleadoNombre = currentUser?.nombre || 'Administrador';

    // ─── Refs para acceder a estado fresco en callbacks de realtime ───
    const deudoresRef = useRef([]);
    const selectedDeudorRef = useRef(null);
    useEffect(() => { deudoresRef.current = deudores; }, [deudores]);
    useEffect(() => { selectedDeudorRef.current = selectedDeudor; }, [selectedDeudor]);

    // ─── Responsables map ───
    const [responsablesMap, setResponsablesMap] = useState({});

    // ─── Load data ───
    // Computed date range based on preset
    const dateFilters = useMemo(() => {
        const now = new Date();
        switch (datePreset) {
            case 'este_mes': {
                const from = new Date(now.getFullYear(), now.getMonth(), 1);
                const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                return { fechaDesde: from.toISOString(), fechaHasta: to.toISOString() };
            }
            case 'mes_pasado': {
                const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
                return { fechaDesde: from.toISOString(), fechaHasta: to.toISOString() };
            }
            case 'custom': {
                const result = {};
                if (customDateFrom) result.fechaDesde = new Date(customDateFrom).toISOString();
                if (customDateTo) result.fechaHasta = new Date(customDateTo + 'T23:59:59').toISOString();
                return result;
            }
            default: // 'todos'
                return {};
        }
    }, [datePreset, customDateFrom, customDateTo]);

    // Merge dateFilterField into the filters passed downstream
    const dateFiltersWithField = useMemo(() => {
        if (!dateFilters.fechaDesde && !dateFilters.fechaHasta) return dateFilters;
        return { ...dateFilters, dateField: dateFilterField };
    }, [dateFilters, dateFilterField]);

    const loadDeudores = useCallback(async () => {
        setLoading(true);
        try {
            const filters = {};
            if (catFilter) filters.categoria = catFilter;
            if (search) filters.search = search;
            if (telFilter !== null) filters.conTelefono = telFilter;
            filters.sortBy = sortBy;
            filters.sortDir = sortDir;
            // Filtros de fecha (con campo dinámico)
            if (dateFiltersWithField.fechaDesde) filters.fechaDesde = dateFiltersWithField.fechaDesde;
            if (dateFiltersWithField.fechaHasta) filters.fechaHasta = dateFiltersWithField.fechaHasta;
            if (dateFiltersWithField.dateField) filters.dateField = dateFiltersWithField.dateField;
            const data = await fetchDeudores(filters);
            setDeudores(data);
            const m = await fetchMetricasDeudas(dateFiltersWithField);
            setMetricas(m);

            // Fetch deudas canceladas filtradas por fecha de CANCELACIÓN (no de factura)
            try {
                const cp = await fetchDeudasCanceladasEnPeriodo(dateFiltersWithField);
                setCanceladasPeriodo(cp);
            } catch (e) {
                console.warn('Error cargando canceladas del período:', e);
                setCanceladasPeriodo(null);
            }

            // Fetch responsables from altas by patient name (batch, non-blocking)
            const nombres = data.map(d => d.nombre).filter(Boolean);
            if (nombres.length > 0) {
                try {
                    const rMap = await fetchResponsablesPorNombres(nombres);
                    setResponsablesMap(rMap);
                } catch (e) {
                    console.warn('Error cargando responsables:', e);
                }
            }
        } catch (err) {
            console.error('Error loading deudores:', err);
            addToast?.('Error al cargar deudores', 'error');
        } finally {
            setLoading(false);
        }
    }, [catFilter, search, telFilter, sortBy, sortDir, dateFiltersWithField, addToast]);

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
        setShowPlanForm(false);
        setFinancialTab('facturas');
        setPlanForm(p => ({ ...p, montoOriginal: deudor.deuda_total || '' }));
        try {
            const [facts, segs, planesData, cobrosData, ncData, cancelInfo] = await Promise.all([
                fetchFacturas(deudor.id),
                fetchSeguimiento(deudor.id),
                fetchPlanesPago(deudor.id),
                fetchCobros(deudor.id),
                fetchNotasCredito(deudor.id),
                deudor.categoria === 'deuda_cancelada'
                    ? fetchDeudaCanceladaInfo(deudor.id)
                    : Promise.resolve(null),
            ]);
            // Enriquecer deudor con info de cancelación si existe
            if (cancelInfo?.deuda_cancelada_at) {
                setSelectedDeudor(prev => ({
                    ...prev,
                    deuda_cancelada_at: cancelInfo.deuda_cancelada_at,
                    deuda_cancelada_por: cancelInfo.deuda_cancelada_por,
                }));
            }
            setFacturas(facts);
            setCobros(cobrosData);
            setNotasCredito(ncData);
            setSeguimiento(segs);
            setPlanes(planesData);

            // Cruzar con altas administrativas vía n_admision
            const admisiones = [...new Set(facts.map(f => f.n_admision).filter(Boolean))];
            if (admisiones.length > 0) {
                try {
                    const altas = await fetchAltasPorAdmisiones(admisiones);
                    setAltasVinculadas(altas);
                } catch (e) {
                    console.warn('Error cargando altas vinculadas:', e);
                    setAltasVinculadas([]);
                }
            } else {
                setAltasVinculadas([]);
            }

            // Buscar presupuestos vinculados por NHC
            if (deudor.nhc) {
                try {
                    const presups = await fetchPresupuestosPorNhc(deudor.nhc);
                    setPresupuestos(presups);
                } catch (e) {
                    console.warn('Error cargando presupuestos:', e);
                    setPresupuestos([]);
                }
            } else {
                setPresupuestos([]);
            }
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
    const [importProgress, setImportProgress] = useState(null); // { current, total, nombre }

    const handleFileSelect = useCallback(async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (fileInputRef.current) fileInputRef.current.value = '';

        setImporting(true);
        setImportResult(null);
        setImportProgress(null);
        try {
            addToast?.('Procesando archivo Excel...', 'info');
            const { registros, totalFilas, filasConDeuda, filasDescartadas } = await parseDeudaExcel(file);
            addToast?.(`${filasConDeuda} registros con deuda detectados. Importando...`, 'info');

            const result = await importarDeudas(registros, empleadoNombre, (progress) => {
                setImportProgress(progress);
            });
            setImportResult({
                ...result,
                totalFilas,
                filasConDeuda,
                filasDescartadasParser: filasDescartadas,
            });
            addToast?.(`Importación exitosa: ${result.pacientesNuevos} nuevos, ${result.pacientesActualizados} actualizados, ${result.pacientesConciliados || 0} conciliados a "Sin deuda"`, 'success');
            loadDeudores();
        } catch (err) {
            console.error('Import error:', err);
            addToast?.('Error al importar: ' + err.message, 'error');
        } finally {
            setImporting(false);
            setImportProgress(null);
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

        // ─── Protección: Deuda ya cancelada no puede re-cancelarse ───
        if (newCat === 'deuda_cancelada' && selectedDeudor.categoria === 'deuda_cancelada') {
            addToast?.('⛔ Esta deuda ya fue cancelada. No se puede volver a cancelar.', 'warning');
            return;
        }

        // ─── Confirmación al cancelar deuda (genera ingreso) ───
        if (newCat === 'deuda_cancelada') {
            const ok = confirm(
                `¿Confirmás que la deuda de ${selectedDeudor.nombre} fue CANCELADA?\n\n` +
                `• Monto: $${Number(selectedDeudor.deuda_total).toLocaleString('es-AR')}\n` +
                `• Esto indica que el paciente pagó y se generó un ingreso al sanatorio.\n` +
                `• Esta acción NO se puede revertir.`
            );
            if (!ok) return;
        }

        try {
            await updateDeudorCategoria(selectedDeudor.id, newCat, empleadoNombre);
            setSelectedDeudor(prev => ({
                ...prev,
                categoria: newCat,
                ...(newCat === 'deuda_cancelada' ? {
                    deuda_cancelada_at: new Date().toISOString(),
                    deuda_cancelada_por: empleadoNombre,
                } : {}),
            }));
            const segs = await fetchSeguimiento(selectedDeudor.id);
            setSeguimiento(segs);
            addToast?.(
                newCat === 'deuda_cancelada'
                    ? `✅ Deuda cancelada — Ingreso registrado`
                    : `Categoría: ${CATEGORIAS_DEUDOR[newCat]?.label}`,
                'success'
            );
        } catch (err) {
            addToast?.(err.message || 'Error al cambiar categoría', 'error');
        }
    }, [selectedDeudor, empleadoNombre, addToast]);

    // ─── Nota ───
    const handleAddNote = useCallback(async () => {
        if (!newNote.trim() || !selectedDeudor) return;
        if (noteType === 'pago' && (!montoPago || isNaN(montoPago))) {
            addToast?.('Debe ingresar un monto válido para el pago', 'warning');
            return;
        }

        try {
            await addSeguimiento(selectedDeudor.id, {
                tipo: noteType,
                descripcion: newNote.trim(),
                monto: noteType === 'pago' ? Number(montoPago) : undefined,
                usuario: empleadoNombre,
            });
            setNewNote('');
            setMontoPago('');
            const segs = await fetchSeguimiento(selectedDeudor.id);
            setSeguimiento(segs);
            addToast?.('Registro agregado', 'success');
        } catch (err) {
            addToast?.('Error al agregar nota', 'error');
        }
    }, [selectedDeudor, newNote, noteType, montoPago, empleadoNombre, addToast]);

    // ─── Plan de Pago ───
    const handleCreatePlan = useCallback(async () => {
        if (!selectedDeudor) return;
        const { montoOriginal, tipoInteres, tasaInteres, cantidadCuotas, fechaInicio, notas } = planForm;
        if (!montoOriginal || !cantidadCuotas || Number(cantidadCuotas) < 1) {
            addToast?.('Complete monto y cantidad de cuotas', 'warning');
            return;
        }
        try {
            await createPlanPago(selectedDeudor.id, {
                montoOriginal: Number(montoOriginal),
                tipoInteres,
                tasaInteres: Number(tasaInteres) || 0,
                cantidadCuotas: Number(cantidadCuotas),
                fechaInicio,
                notas,
                usuario: empleadoNombre,
            });
            const planesData = await fetchPlanesPago(selectedDeudor.id);
            setPlanes(planesData);
            setShowPlanForm(false);
            addToast?.('Plan de pago creado', 'success');
        } catch (err) {
            addToast?.('Error al crear plan: ' + err.message, 'error');
        }
    }, [selectedDeudor, planForm, empleadoNombre, addToast]);

    const handleMarcarCuota = useCallback(async (cuotaId) => {
        try {
            await marcarCuotaPagada(cuotaId, { fechaPago: null, comprobante: null });
            const planesData = await fetchPlanesPago(selectedDeudor.id);
            setPlanes(planesData);
            addToast?.('Cuota marcada como pagada', 'success');
        } catch (err) {
            addToast?.('Error al marcar cuota', 'error');
        }
    }, [selectedDeudor, addToast]);

    const handleCancelarPlan = useCallback(async (planId) => {
        if (!confirm('¿Cancelar este plan de pago?')) return;
        try {
            await cancelarPlan(planId);
            const planesData = await fetchPlanesPago(selectedDeudor.id);
            setPlanes(planesData);
            addToast?.('Plan cancelado', 'success');
        } catch (err) {
            addToast?.('Error al cancelar plan', 'error');
        }
    }, [selectedDeudor, addToast]);

    // ─── Exportación ───
    const exportToExcel = useCallback(() => {
        if (!deudores.length) return;
        const headers = ['Paciente', 'NHC', 'Teléfono', 'Deuda Total', 'Cobros', 'Notas Crédito', 'Facturas', 'Categoría', 'Cobertura', 'Última Factura', 'Último Contacto'];
        const rows = deudores.map(d => {
            const cat = CATEGORIAS_DEUDOR[d.categoria] || CATEGORIAS_DEUDOR.sin_gestionar;
            return [
                d.nombre, 
                d.nhc, 
                d.telefono || '', 
                Number(d.deuda_total),
                Number(d.total_cobros) || 0,
                Number(d.total_notas_credito) || 0,
                d.cantidad_facturas, 
                cat.label, 
                d.obra_social || 'Sin datos',
                d.fecha_ultima_factura ? new Date(d.fecha_ultima_factura).toLocaleDateString('es-AR') : '',
                d.ultimo_contacto_at ? new Date(d.ultimo_contacto_at).toLocaleDateString('es-AR') : '',
            ];
        });

        const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Deudores");
        
        XLSX.writeFile(workbook, `deudas_pacientes_${new Date().toISOString().split('T')[0]}.xlsx`);
        addToast?.(`${deudores.length} registros exportados a Excel (XLSX)`, 'success');
    }, [deudores, addToast]);

    const exportToPDF = useCallback(() => {
        if (!deudores.length) return;
        const w = window.open('', '_blank');
        const rows = deudores.map(d => {
            const cat = CATEGORIAS_DEUDOR[d.categoria] || CATEGORIAS_DEUDOR.sin_gestionar;
            return `<tr>
                <td>${d.nombre}</td><td>${d.nhc}</td>
                <td style="text-align:right;font-weight:700">$${Number(d.deuda_total).toLocaleString('es-AR')}</td>
                <td>${d.cantidad_facturas}</td><td>${cat.label}</td>
                <td>${d.obra_social || '—'}</td>
                <td>${d.fecha_ultima_factura ? new Date(d.fecha_ultima_factura).toLocaleDateString('es-AR') : '—'}</td>
            </tr>`;
        }).join('');
        w.document.write(`<!DOCTYPE html><html><head><title>Deudas Pacientes</title>
            <style>body{font-family:Arial;padding:20px}table{width:100%;border-collapse:collapse;margin-top:16px}
            th,td{border:1px solid #ddd;padding:8px;font-size:12px}th{background:#f5f5f5;font-weight:700}
            h1{font-size:18px;color:#0D3B66}h2{font-size:14px;color:#64748B;font-weight:400}</style></head>
            <body><h1>Gestión de Deudas — Sanatorio Argentino</h1>
            <h2>Exportado: ${new Date().toLocaleDateString('es-AR')} · ${deudores.length} pacientes · Deudas ≥ $${MIN_DEUDA.toLocaleString('es-AR')}</h2>
            <table><thead><tr><th>Paciente</th><th>NHC</th><th>Deuda</th><th>Fact.</th><th>Categoría</th><th>Cobertura</th><th>Últ. Factura</th></tr></thead>
            <tbody>${rows}</tbody></table></body></html>`);
        w.document.close();
        w.print();
    }, [deudores]);

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
            <div style={{ padding: '20px 28px' }}>
                {/* HEADER */}
                <div style={st.header}>
                    <div style={st.headerLeft}>
                        <div style={{ ...st.iconBadge, background: 'linear-gradient(135deg, #F59E0B, #D97706)' }}>
                            <img src="/logosanatorio.png" alt="SA" style={{ width: 22, height: 22, objectFit: 'contain' }} />
                        </div>
                        <div>
                            <h2 style={st.headerTitle}>Gestión de Deudas</h2>
                            <span style={st.headerSub}>Seguimiento de cobros · Deudas ≥ ${MIN_DEUDA.toLocaleString('es-AR')} · Fuente: SALUS</span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button onClick={exportToExcel} style={{ ...st.btnSmall, background: '#16A34A', color: '#fff', border: 'none' }} disabled={!deudores.length}>
                            <Download size={14} /> Excel
                        </button>
                        <button onClick={exportToPDF} style={{ ...st.btnSmall, background: '#DC2626', color: '#fff', border: 'none' }} disabled={!deudores.length}>
                            <Download size={14} /> PDF
                        </button>
                        <button onClick={() => setShowMetricas(p => !p)} style={st.btnSmall}>
                            <BarChart3 size={14} /> {showMetricas ? 'Ocultar' : 'Métricas'}
                        </button>
                    </div>
                </div>

                {/* PROGRESS BAR */}
                {importing && importProgress && (
                    <div style={{
                        background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: '12px',
                        padding: '14px 18px', marginBottom: '12px',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0369A1' }}>
                                <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite', marginRight: '6px', verticalAlign: 'middle' }} />
                                Importando pacientes...
                            </span>
                            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0369A1' }}>
                                {importProgress.current} / {importProgress.total} ({Math.round((importProgress.current / importProgress.total) * 100)}%)
                            </span>
                        </div>
                        <div style={{ background: '#E0F2FE', borderRadius: '6px', height: '8px', overflow: 'hidden' }}>
                            <div style={{
                                width: `${(importProgress.current / importProgress.total) * 100}%`,
                                height: '100%', borderRadius: '6px',
                                background: 'linear-gradient(90deg, #3B82F6, #0EA5E9)',
                                transition: 'width 0.3s ease',
                            }} />
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            Procesando: {importProgress.nombre}
                        </div>
                    </div>
                )}

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
                        {[
                            {
                                icon: <Users size={18} style={{ color: '#3B82F6' }} />,
                                value: metricas.deudoresActivos,
                                label: 'Deudores Activos',
                                help: 'Cantidad de pacientes con deuda activa (no cancelada ni descuento) mayor o igual a $50.000. Excluye deudas canceladas y descuentos por liquidación.',
                                style: {},
                            },
                            {
                                icon: <DollarSign size={18} style={{ color: '#F59E0B' }} />,
                                value: formatMoney(metricas.deudaTotal),
                                label: 'Deuda Activa',
                                help: 'Suma total del monto adeudado por todos los deudores activos actualmente. Incluye todas las categorías excepto canceladas y descuentos.',
                                style: {},
                            },
                            metricas.deudaDescontada > 0 ? {
                                icon: <CheckCircle size={18} style={{ color: '#0D9488' }} />,
                                value: `-${formatMoney(metricas.deudaDescontada)}`,
                                label: 'Descontada',
                                help: 'Monto total de deudas que fueron descontadas por liquidación o marcadas como "Sin Deuda en SALUS". Es dinero que ya no se gestiona activamente.',
                                style: { borderColor: '#0D948820' },
                                valueStyle: { color: '#0D9488' },
                            } : null,
                            {
                                icon: <Banknote size={18} style={{ color: '#6366F1' }} />,
                                value: canceladasPeriodo?.totalCanceladas || 0,
                                label: 'Deudas Canceladas',
                                sub: canceladasPeriodo?.montoTotalIngresado > 0 ? `${formatMoney(canceladasPeriodo.montoTotalIngresado)} ingresado` : null,
                                help: 'Pacientes que pagaron su deuda y fueron marcados como "Deuda Cancelada". El monto muestra el dinero efectivamente cobrado. Se filtra según el período seleccionado usando la fecha en que se cambió el estado.',
                                style: { borderColor: '#6366F120', background: 'linear-gradient(135deg, rgba(255,255,255,0.9), rgba(224,231,255,0.4))' },
                                valueStyle: { color: '#6366F1' },
                                subStyle: { display: 'block', fontSize: '0.62rem', color: '#6366F1', fontWeight: 700 },
                            },
                            {
                                icon: <Send size={18} style={{ color: '#8B5CF6' }} />,
                                value: metricas.contactados,
                                label: 'Contactados',
                                help: 'Cantidad de deudores a los que se les envió al menos un mensaje de WhatsApp desde el sistema. Indica el avance de la gestión de cobro.',
                                style: {},
                            },
                        ].filter(Boolean).map((card, idx) => (
                            <div key={idx} style={{ ...st.statCard, ...card.style, position: 'relative' }}>
                                {card.icon}
                                <div style={{ flex: 1 }}>
                                    <span style={{ ...st.statValue, ...(card.valueStyle || {}) }}>{card.value}</span>
                                    <span style={st.statLabel}>{card.label}</span>
                                    {card.sub && <span style={card.subStyle}>{card.sub}</span>}
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setHelpTooltip(helpTooltip === idx ? null : idx);
                                    }}
                                    style={{
                                        position: 'absolute', top: '6px', right: '6px',
                                        width: '18px', height: '18px', borderRadius: '50%',
                                        border: '1.5px solid #CBD5E1', background: helpTooltip === idx ? '#EFF6FF' : '#fff',
                                        fontSize: '0.6rem', fontWeight: 800, color: helpTooltip === idx ? '#3B82F6' : '#94A3B8',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        transition: 'all 0.2s', lineHeight: 1,
                                    }}
                                >?</button>
                                {helpTooltip === idx && (
                                    <div style={{
                                        position: 'absolute', top: '28px', right: '0', zIndex: 50,
                                        width: '240px', padding: '10px 12px',
                                        background: '#fff', borderRadius: '10px',
                                        border: '1px solid #E2E8F0',
                                        boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                                        fontSize: '0.72rem', lineHeight: 1.5, color: '#475569',
                                        fontWeight: 500,
                                    }}>
                                        {card.help}
                                    </div>
                                )}
                            </div>
                        ))}
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

                                <div style={st.kpiRow}>
                                    <UserX size={16} color="#EF4444" />
                                    <div style={{ flex: 1 }}>
                                        <div style={st.kpiLabel}>Pendientes de Gestión</div>
                                        <div style={st.kpiSub}>Con teléfono, sin contactar</div>
                                    </div>
                                    <div style={{ ...st.kpiValue, color: '#EF4444' }}>
                                        {metricas.conTelefono - metricas.contactados} pac.
                                    </div>
                                </div>

                                <div style={{ ...st.kpiRow, borderBottom: 'none', marginBottom: 0, background: metricas.totalCanceladas > 0 ? '#E0E7FF40' : 'transparent', borderRadius: '8px', padding: '10px 8px' }}>
                                    <Banknote size={16} color="#6366F1" />
                                    <div style={{ flex: 1 }}>
                                        <div style={st.kpiLabel}>Tasa de Recuperación</div>
                                        <div style={st.kpiSub}>Deudas canceladas / total</div>
                                    </div>
                                    <div style={{ ...st.kpiValue, color: '#6366F1' }}>
                                        {metricas.tasaRecuperacion}%
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ─── PANEL DETALLADO: Ingresos por Deuda Cancelada ─── */}
                        {canceladasPeriodo && canceladasPeriodo.totalCanceladas > 0 && (
                            <div style={{
                                marginTop: '16px', padding: '20px',
                                background: 'linear-gradient(135deg, #E0E7FF 0%, #EDE9FE 50%, #E0E7FF 100%)',
                                borderRadius: '16px', border: '1px solid #A5B4FC',
                            }}>
                                {/* Header */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{
                                            width: '36px', height: '36px', borderRadius: '10px',
                                            background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            boxShadow: '0 3px 10px rgba(99,102,241,0.3)',
                                        }}>
                                            <Banknote size={18} style={{ color: '#fff' }} />
                                        </div>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#312E81' }}>
                                                💰 Ingresos por Deuda Cancelada
                                            </h4>
                                            <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: '#6366F1', fontWeight: 500 }}>
                                                {datePreset === 'todos'
                                                    ? 'Todos los períodos — Mostrando todas las deudas que fueron pagadas por pacientes'
                                                    : datePreset === 'este_mes'
                                                        ? `Junio ${new Date().getFullYear()} — Deudas que fueron pagadas ESTE MES (independientemente de cuándo se originó la deuda)`
                                                        : datePreset === 'mes_pasado'
                                                            ? 'Mes pasado — Deudas que fueron pagadas el mes anterior'
                                                            : 'Período personalizado — Deudas pagadas en el rango seleccionado'
                                                }
                                            </p>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#312E81', letterSpacing: '-0.5px' }}>
                                            {formatMoney(canceladasPeriodo.montoTotalIngresado)}
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: '#6366F1', fontWeight: 600 }}>
                                            {canceladasPeriodo.totalCanceladas} deuda{canceladasPeriodo.totalCanceladas !== 1 ? 's' : ''} cancelada{canceladasPeriodo.totalCanceladas !== 1 ? 's' : ''}
                                        </div>
                                    </div>
                                </div>

                                {/* Explicación para el usuario */}
                                <div style={{
                                    padding: '10px 14px', borderRadius: '10px',
                                    background: 'rgba(255,255,255,0.7)', border: '1px solid #C7D2FE',
                                    marginBottom: '14px', fontSize: '0.72rem', color: '#4338CA',
                                    lineHeight: '1.5',
                                }}>
                                    <strong>¿Qué estás viendo?</strong> Esta sección muestra los pacientes que <strong>efectivamente pagaron</strong> su deuda
                                    en el período seleccionado. La fecha que importa es <strong>cuándo se registró el pago</strong> (no cuándo se originó la deuda).
                                    Por ejemplo: una deuda de abril que se pagó en junio aparece en el reporte de junio como ingreso.
                                    Cada fila representa un ingreso real al sanatorio.
                                </div>

                                {/* Tabla de canceladas */}
                                <div style={{
                                    background: 'rgba(255,255,255,0.85)', borderRadius: '12px',
                                    border: '1px solid #C7D2FE', overflow: 'hidden',
                                }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ ...st.th, background: '#EEF2FF', color: '#4338CA', borderColor: '#C7D2FE' }}>Paciente</th>
                                                <th style={{ ...st.th, background: '#EEF2FF', color: '#4338CA', borderColor: '#C7D2FE', width: '80px' }}>NHC</th>
                                                <th style={{ ...st.th, background: '#EEF2FF', color: '#4338CA', borderColor: '#C7D2FE', width: '130px', textAlign: 'right' }}>Monto Pagado</th>
                                                <th style={{ ...st.th, background: '#EEF2FF', color: '#4338CA', borderColor: '#C7D2FE', width: '130px' }}>Fecha Pago</th>
                                                <th style={{ ...st.th, background: '#EEF2FF', color: '#4338CA', borderColor: '#C7D2FE', width: '100px' }}>Deuda Original</th>
                                                <th style={{ ...st.th, background: '#EEF2FF', color: '#4338CA', borderColor: '#C7D2FE', width: '120px' }}>Registrado por</th>
                                                <th style={{ ...st.th, background: '#EEF2FF', color: '#4338CA', borderColor: '#C7D2FE', width: '36px' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {canceladasPeriodo.canceladas.map(c => (
                                                <tr key={c.id}
                                                    style={{ ...st.tr, borderColor: '#E0E7FF' }}
                                                    onClick={() => openDetail(c)}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#F5F3FF'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <td style={st.td}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span style={{
                                                                width: '24px', height: '24px', borderRadius: '6px',
                                                                background: '#6366F1', color: '#fff',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                fontSize: '0.65rem', fontWeight: 800, flexShrink: 0,
                                                            }}>✓</span>
                                                            <span style={{ fontWeight: 700, color: '#0D3B66', fontSize: '0.85rem' }}>{c.nombre}</span>
                                                        </div>
                                                    </td>
                                                    <td style={{ ...st.td, fontFamily: 'monospace', fontSize: '0.78rem', color: '#64748B' }}>{c.nhc}</td>
                                                    <td style={{ ...st.td, textAlign: 'right', fontWeight: 800, color: '#16A34A', fontSize: '0.9rem' }}>
                                                        {formatMoney(c.deuda_total)}
                                                    </td>
                                                    <td style={st.td}>
                                                        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#4338CA' }}>
                                                            {new Date(c.deuda_cancelada_at || c.updated_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                        </div>
                                                        <div style={{ fontSize: '0.65rem', color: '#94A3B8' }}>
                                                            {new Date(c.deuda_cancelada_at || c.updated_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                    </td>
                                                    <td style={st.td}>
                                                        <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                                                            {c.fecha_ultima_factura
                                                                ? new Date(c.fecha_ultima_factura).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' })
                                                                : '—'}
                                                        </span>
                                                    </td>
                                                    <td style={st.td}>
                                                        <span style={{
                                                            padding: '3px 10px', borderRadius: '12px',
                                                            background: '#EEF2FF', color: '#4338CA',
                                                            fontSize: '0.68rem', fontWeight: 600,
                                                            whiteSpace: 'nowrap',
                                                        }}>
                                                            {c.deuda_cancelada_por || '—'}
                                                        </span>
                                                    </td>
                                                    <td style={st.td}>
                                                        <ChevronRight size={14} style={{ color: '#A5B4FC' }} />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {/* Footer resumen */}
                                    <div style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '12px 16px', background: '#EEF2FF', borderTop: '1px solid #C7D2FE',
                                    }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4338CA' }}>
                                            Total ingresado en el período
                                        </span>
                                        <span style={{ fontSize: '1rem', fontWeight: 900, color: '#312E81' }}>
                                            {formatMoney(canceladasPeriodo.montoTotalIngresado)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══ FILTROS — REDISEÑO UX ═══ */}
                <div style={{
                    display: 'flex', flexDirection: 'column', gap: '0',
                    marginBottom: '16px', borderRadius: '16px',
                    background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(226,232,240,0.6)',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                    overflow: 'hidden',
                }}>
                    {/* ─── ROW 1: Búsqueda + Teléfono ─── */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '12px 16px',
                        borderBottom: '1px solid #F1F5F9',
                    }}>
                        <div style={{
                            flex: 1, display: 'flex', alignItems: 'center', gap: '10px',
                            padding: '8px 14px', borderRadius: '10px',
                            background: '#F8FAFC', border: '1.5px solid #E2E8F0',
                            transition: 'border-color 0.2s',
                        }}>
                            <Search size={15} style={{ color: '#94A3B8', flexShrink: 0 }} />
                            <input
                                type="text"
                                placeholder="Buscar por nombre, NHC o teléfono..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                style={{
                                    flex: 1, border: 'none', background: 'none', outline: 'none',
                                    fontSize: '0.85rem', color: '#0D3B66', fontWeight: 500,
                                }}
                            />
                            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '2px', display: 'flex' }}><X size={14} /></button>}
                        </div>
                        {/* Teléfono inline */}
                        <div style={{
                            display: 'flex', gap: '2px', padding: '3px',
                            background: '#F1F5F9', borderRadius: '10px', flexShrink: 0,
                        }}>
                            {[
                                { val: null, label: '📱 Todos' },
                                { val: true, label: '✅ Tel.' },
                                { val: false, label: '❌ Tel.' },
                            ].map(opt => (
                                <button
                                    key={String(opt.val)}
                                    onClick={() => setTelFilter(opt.val)}
                                    style={{
                                        padding: '5px 10px', borderRadius: '8px', border: 'none',
                                        fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        background: telFilter === opt.val ? '#fff' : 'transparent',
                                        color: telFilter === opt.val ? '#0D3B66' : '#94A3B8',
                                        boxShadow: telFilter === opt.val ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                                    }}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ─── ROW 2: Categorías ─── */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '10px 16px',
                        borderBottom: '1px solid #F1F5F9',
                        overflowX: 'auto',
                    }}>
                        <span style={{
                            fontSize: '0.62rem', fontWeight: 700, color: '#94A3B8',
                            textTransform: 'uppercase', letterSpacing: '0.06em',
                            marginRight: '4px', flexShrink: 0, whiteSpace: 'nowrap',
                        }}>Estado</span>
                        <button
                            onClick={() => setCatFilter(null)}
                            style={{
                                padding: '5px 12px', borderRadius: '8px',
                                border: catFilter === null ? '1.5px solid #93C5FD' : '1.5px solid transparent',
                                background: catFilter === null ? '#EFF6FF' : 'transparent',
                                fontSize: '0.72rem', fontWeight: catFilter === null ? 700 : 600,
                                color: catFilter === null ? '#2563EB' : '#64748B',
                                cursor: 'pointer', transition: 'all 0.15s',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            Todos
                        </button>
                        {Object.entries(CATEGORIAS_DEUDOR).map(([key, cfg]) => {
                            const isActive = catFilter === key;
                            return (
                                <button
                                    key={key}
                                    onClick={() => setCatFilter(key)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '5px',
                                        padding: '5px 10px', borderRadius: '8px',
                                        border: isActive ? `1.5px solid ${cfg.color}40` : '1.5px solid transparent',
                                        background: isActive ? cfg.bg : 'transparent',
                                        fontSize: '0.72rem', fontWeight: isActive ? 700 : 500,
                                        color: isActive ? cfg.color : '#64748B',
                                        cursor: 'pointer', transition: 'all 0.15s',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    <span style={{
                                        width: '7px', height: '7px', borderRadius: '50%',
                                        background: cfg.color, flexShrink: 0,
                                        opacity: isActive ? 1 : 0.5,
                                    }} />
                                    {cfg.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* ─── ROW 3: Filtro temporal ─── */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '10px 16px',
                        background: '#FAFBFE',
                    }}>
                        <Calendar size={14} style={{ color: '#94A3B8', flexShrink: 0 }} />

                        {/* Segmented control: campo de fecha */}
                        <div style={{
                            display: 'flex', gap: '2px', padding: '3px',
                            background: '#EEF2FF', borderRadius: '8px', flexShrink: 0,
                        }}>
                            {[
                                { id: 'fecha_ultima_factura', label: 'Fecha Factura', icon: '📄' },
                                { id: 'deuda_cancelada_at', label: 'Cambio Estado', icon: '🔄' },
                            ].map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => setDateFilterField(f.id)}
                                    style={{
                                        padding: '5px 10px', borderRadius: '6px', border: 'none',
                                        fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        background: dateFilterField === f.id ? '#fff' : 'transparent',
                                        color: dateFilterField === f.id ? '#4F46E5' : '#94A3B8',
                                        boxShadow: dateFilterField === f.id ? '0 1px 4px rgba(79,70,229,0.12)' : 'none',
                                    }}
                                >
                                    {f.icon} {f.label}
                                </button>
                            ))}
                        </div>

                        <div style={{ width: '1px', height: '20px', background: '#E2E8F0', flexShrink: 0 }} />

                        {/* Period pills */}
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', flex: 1 }}>
                            {[
                                { id: 'todos', label: 'Todo el historial' },
                                { id: 'este_mes', label: 'Este mes' },
                                { id: 'mes_pasado', label: 'Mes pasado' },
                                { id: 'custom', label: 'Personalizado' },
                            ].map(p => {
                                const isActive = datePreset === p.id;
                                return (
                                    <button
                                        key={p.id}
                                        onClick={() => setDatePreset(p.id)}
                                        style={{
                                            padding: '5px 12px', borderRadius: '8px',
                                            border: isActive ? '1.5px solid #86EFAC' : '1.5px solid transparent',
                                            background: isActive ? '#F0FDF4' : 'transparent',
                                            fontSize: '0.72rem', fontWeight: isActive ? 700 : 500,
                                            color: isActive ? '#16A34A' : '#64748B',
                                            cursor: 'pointer', transition: 'all 0.15s',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {p.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Custom date inputs */}
                        {datePreset === 'custom' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                <input
                                    type="date"
                                    value={customDateFrom}
                                    onChange={e => setCustomDateFrom(e.target.value)}
                                    style={{
                                        padding: '5px 8px', borderRadius: '8px',
                                        border: `1.5px solid ${customDateFrom ? '#93C5FD' : '#E2E8F0'}`,
                                        background: customDateFrom ? '#EFF6FF' : '#fff',
                                        fontSize: '0.75rem', fontWeight: 600, color: '#0D3B66',
                                        outline: 'none', cursor: 'text',
                                    }}
                                />
                                <span style={{ fontSize: '0.75rem', color: '#CBD5E1', fontWeight: 600 }}>→</span>
                                <input
                                    type="date"
                                    value={customDateTo}
                                    onChange={e => setCustomDateTo(e.target.value)}
                                    style={{
                                        padding: '5px 8px', borderRadius: '8px',
                                        border: `1.5px solid ${customDateTo ? '#93C5FD' : '#E2E8F0'}`,
                                        background: customDateTo ? '#EFF6FF' : '#fff',
                                        fontSize: '0.75rem', fontWeight: 600, color: '#0D3B66',
                                        outline: 'none', cursor: 'text',
                                    }}
                                />
                            </div>
                        )}

                        {datePreset !== 'todos' && (
                            <button
                                onClick={() => { setDatePreset('todos'); setCustomDateFrom(''); setCustomDateTo(''); }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '3px',
                                    padding: '5px 8px', borderRadius: '8px', border: 'none',
                                    background: '#FEE2E2', color: '#DC2626',
                                    fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer',
                                    transition: 'all 0.15s', flexShrink: 0,
                                }}
                                title="Limpiar filtro de fecha"
                            >
                                <X size={11} /> Limpiar
                            </button>
                        )}
                    </div>
                </div>

                {/* TABLA DEUDORES */}
                {loading ? (
                    <SkeletonTablePanel kpis={5} cols={8} rows={8} />
                ) : deudores.length === 0 ? (
                    <div style={st.emptyState}>
                        <img src="/logosanatorio.png" alt="Sanatorio Argentino" style={{ width: 56, height: 56, objectFit: 'contain', opacity: 0.35 }} />
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
                                    <th style={{ ...st.th, width: '110px', cursor: 'pointer', userSelect: 'none' }}
                                        onClick={() => {
                                            if (sortBy === 'fecha_ultima_factura') setSortDir(p => p === 'desc' ? 'asc' : 'desc');
                                            else { setSortBy('fecha_ultima_factura'); setSortDir('desc'); }
                                        }}
                                    >
                                        Fecha {sortBy === 'fecha_ultima_factura' ? (sortDir === 'desc' ? '▼' : '▲') : ''}
                                    </th>
                                    <th style={{ ...st.th, width: '130px', textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}
                                        onClick={() => {
                                            if (sortBy === 'deuda_total') setSortDir(p => p === 'desc' ? 'asc' : 'desc');
                                            else { setSortBy('deuda_total'); setSortDir('desc'); }
                                        }}
                                    >
                                        Deuda {sortBy === 'deuda_total' ? (sortDir === 'desc' ? '▼' : '▲') : ''}
                                    </th>
                                    <th style={{ ...st.th, width: '50px', textAlign: 'center' }}>Fact.</th>
                                    <th style={{ ...st.th, width: '120px' }}>Cobertura</th>
                                    <th style={{ ...st.th, width: '155px' }}>Categoría</th>
                                    <th style={{ ...st.th, width: '120px' }}>Responsable</th>
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
                                            <td style={{ ...st.td, fontSize: '0.75rem', color: '#475569' }}>
                                                {d.fecha_ultima_factura ? new Date(d.fecha_ultima_factura).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                                            </td>
                                            <td style={{ ...st.td, textAlign: 'right', fontWeight: 800, color: '#D97706', fontSize: '0.88rem' }}>
                                                {formatMoney(d.deuda_total)}
                                            </td>
                                            <td style={{ ...st.td, textAlign: 'center', fontSize: '0.82rem', color: '#475569' }}>{d.cantidad_facturas}</td>
                                            <td style={{ ...st.td, fontSize: '0.72rem', color: '#64748B' }}>
                                                {d.obra_social ? (
                                                    <span style={{ padding: '2px 8px', borderRadius: '10px', background: '#EFF6FF', color: '#2563EB', fontSize: '0.68rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                        {d.obra_social}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#CBD5E1', fontSize: '0.72rem' }}>—</span>
                                                )}
                                            </td>
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
                                            <td style={st.td}>
                                                {(() => {
                                                    const rInfo = responsablesMap[d.nombre];
                                                    if (!rInfo) return <span style={{ color: '#CBD5E1', fontSize: '0.72rem' }}>—</span>;
                                                    return (
                                                        <span style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                            padding: '3px 10px', borderRadius: '16px', fontSize: '0.7rem', fontWeight: 600,
                                                            background: rInfo.isOverride ? '#DCFCE7' : '#DBEAFE',
                                                            color: rInfo.isOverride ? '#15803D' : '#1D4ED8',
                                                            border: `1px solid ${rInfo.isOverride ? '#BBF7D0' : '#BFDBFE'}`,
                                                            whiteSpace: 'nowrap', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis',
                                                        }}>
                                                            <UserCheck size={11} />
                                                            {rInfo.responsable}
                                                        </span>
                                                    );
                                                })()}
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
            <div style={{ padding: '20px 28px' }}>
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
                            <img src="/logosanatorio.png" alt="SA" style={{ width: 28, height: 28, objectFit: 'contain' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#0D3B66' }}>
                                {selectedDeudor.nombre}
                            </h2>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.82rem', color: '#64748B' }}>NHC: <strong>{selectedDeudor.nhc}</strong></span>
                                <span style={{
                                    padding: '2px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700,
                                    background: cat.bg, color: cat.color, border: `1px solid ${cat.color}30`,
                                }}>
                                    {cat.icon} {cat.label}
                                </span>
                                {selectedDeudor.obra_social && (
                                    <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 600, background: '#EFF6FF', color: '#2563EB', border: '1px solid #93C5FD40' }}>
                                        🏥 {selectedDeudor.obra_social}
                                    </span>
                                )}
                                {altasVinculadas.length > 0 && (() => {
                                    const ultima = altasVinculadas[0];
                                    return (<>
                                        {ultima.fecha_alta && (
                                            <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 600, background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D040' }}>
                                                📅 Alta: {new Date(ultima.fecha_alta).toLocaleDateString('es-AR')}
                                            </span>
                                        )}
                                        {ultima.operador && (
                                            <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 600, background: '#FDF2F8', color: '#EC4899', border: '1px solid #F9A8D440' }}>
                                                👤 {ultima.operador}
                                            </span>
                                        )}
                                    </>);
                                })()}
                            </div>
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#D97706', letterSpacing: '-1px' }}>
                            {formatMoney(selectedDeudor.deuda_total)}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                            Deuda Total
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
                                {Object.entries(CATEGORIAS_DEUDOR).map(([key, cfg]) => {
                                    const isCancelada = selectedDeudor.categoria === 'deuda_cancelada';
                                    const isThisCancelada = key === 'deuda_cancelada';
                                    // Bloquear botón de cancelar si ya está cancelada
                                    const isDisabled = isCancelada && isThisCancelada;
                                    return (
                                        <button key={key}
                                            onClick={() => !isDisabled && handleChangeCategoria(key)}
                                            title={isDisabled ? 'Esta deuda ya fue cancelada — no se puede volver a cancelar' : cfg.label}
                                            style={{
                                                padding: '8px 14px', borderRadius: '12px',
                                                border: selectedDeudor.categoria === key ? `2px solid ${cfg.color}` : '2px solid #E2E8F0',
                                                background: selectedDeudor.categoria === key ? cfg.bg : '#FAFBFC',
                                                color: selectedDeudor.categoria === key ? cfg.color : '#64748B',
                                                fontSize: '0.8rem', fontWeight: 700,
                                                cursor: isDisabled ? 'not-allowed' : 'pointer',
                                                opacity: isDisabled ? 0.6 : 1,
                                                transition: 'all 0.15s',
                                            }}
                                        >
                                            {cfg.icon} {cfg.label}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* ─── Banner de Deuda Cancelada ─── */}
                            {selectedDeudor.categoria === 'deuda_cancelada' && (
                                <div style={{
                                    marginTop: '12px', padding: '14px 18px',
                                    background: 'linear-gradient(135deg, #E0E7FF 0%, #EDE9FE 100%)',
                                    borderRadius: '12px', border: '1px solid #A5B4FC',
                                    display: 'flex', alignItems: 'center', gap: '12px',
                                }}>
                                    <div style={{
                                        width: '36px', height: '36px', borderRadius: '10px',
                                        background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        boxShadow: '0 3px 10px rgba(99,102,241,0.3)',
                                        flexShrink: 0,
                                    }}>
                                        <CheckCircle size={18} style={{ color: '#fff' }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#4338CA' }}>
                                            ✅ Deuda Cancelada — Ingreso Registrado
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: '#6366F1', marginTop: '2px' }}>
                                            {selectedDeudor.deuda_cancelada_at ? (
                                                <>
                                                    Pagada el {new Date(selectedDeudor.deuda_cancelada_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}
                                                    {' a las '}{new Date(selectedDeudor.deuda_cancelada_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                                    {selectedDeudor.deuda_cancelada_por && (
                                                        <> · Registrado por <strong>{selectedDeudor.deuda_cancelada_por}</strong></>
                                                    )}
                                                </>
                                            ) : (
                                                'Deuda marcada como cancelada.'
                                            )}
                                        </div>
                                    </div>
                                    <div style={{
                                        padding: '4px 12px', borderRadius: '8px',
                                        background: '#6366F1', color: '#fff',
                                        fontSize: '0.68rem', fontWeight: 800,
                                        letterSpacing: '0.02em', whiteSpace: 'nowrap',
                                    }}>
                                        PAGADA
                                    </div>
                                </div>
                            )}
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

                        {/* Resumen Financiero */}
                        <div style={{ ...st.card, background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)' }}>
                            <h4 style={st.cardTitle}><DollarSign size={14} /> Resumen Financiero</h4>
                            <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginBottom: '10px', lineHeight: '1.5' }}>
                                Datos basados en las facturas, cobros y notas de crédito registradas en SALUS para este paciente.
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                                {(() => {
                                    const totalCobrosCalc = cobros.reduce((s, c) => s + (Number(c.importe) || 0), 0);
                                    const totalNCCalc = notasCredito.reduce((s, n) => s + (Number(n.importe_total) || 0), 0);
                                    const deudaTotal = Number(selectedDeudor.deuda_total) || 0;
                                    return [
                                        { label: 'Deuda Total', desc: 'Total facturado pendiente', value: deudaTotal, color: '#EF4444', bg: '#FEF2F2', icon: '🔴' },
                                        { label: 'Cobros', desc: 'Pagos realizados', value: totalCobrosCalc, color: '#16A34A', bg: '#F0FDF4', icon: '🟢' },
                                        { label: 'Notas Crédito', desc: 'Ajustes a favor', value: totalNCCalc, color: '#3B82F6', bg: '#EFF6FF', icon: '🔵' },
                                    ];
                                })().map((item, idx) => (
                                    <div key={idx} style={{
                                        padding: '10px', borderRadius: '10px', background: item.bg,
                                        border: `1px solid ${item.color}20`, textAlign: 'center',
                                    }}>
                                        <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600, marginBottom: '2px' }}>
                                            {item.icon} {item.label}
                                        </div>
                                        <div style={{ fontSize: '1rem', fontWeight: 800, color: item.color }}>
                                            {formatMoney(item.value)}
                                        </div>
                                        <div style={{ fontSize: '0.58rem', color: '#94A3B8', marginTop: '2px', fontStyle: 'italic' }}>
                                            {item.desc}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Tabs Financieros */}
                        <div style={st.card}>
                            <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', background: '#F1F5F9', borderRadius: '10px', padding: '3px' }}>
                                {[
                                    { key: 'facturas', label: `📄 Facturas (${facturas.length})`, color: '#D97706' },
                                    { key: 'cobros', label: `💰 Cobros (${cobros.length})`, color: '#16A34A' },
                                    { key: 'nc', label: `📝 NC (${notasCredito.length})`, color: '#3B82F6' },
                                ].map(tab => (
                                    <button key={tab.key} onClick={() => setFinancialTab(tab.key)} style={{
                                        flex: 1, padding: '8px 12px', borderRadius: '8px', border: 'none',
                                        cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700,
                                        background: financialTab === tab.key ? '#fff' : 'transparent',
                                        color: financialTab === tab.key ? tab.color : '#94A3B8',
                                        boxShadow: financialTab === tab.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                        transition: 'all 0.2s',
                                    }}>
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Tab: Facturas */}
                            {financialTab === 'facturas' && (
                                <>
                            <h4 style={st.cardTitle}><FileText size={14} /> Facturas Pendientes ({facturas.length} ítems)</h4>
                            {detailLoading ? (
                                <span style={{ color: '#94A3B8' }}>Cargando...</span>
                            ) : facturas.length === 0 ? (
                                <span style={{ color: '#CBD5E1' }}>Sin facturas registradas</span>
                            ) : (() => {
                                // Agrupar líneas por folio para visualización
                                const byFolio = {};
                                facturas.forEach(f => {
                                    const folio = f.folio || f.documento || f.codigo;
                                    if (!byFolio[folio]) byFolio[folio] = [];
                                    byFolio[folio].push(f);
                                });
                                return (
                                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                        {Object.entries(byFolio).map(([folio, items]) => {
                                            const totalFolio = items.reduce((s, i) => s + (Number(i.pendiente) || 0), 0);
                                            return (
                                                <div key={folio} style={{
                                                    marginBottom: '12px', borderRadius: '12px',
                                                    border: '1px solid #E2E8F0', overflow: 'hidden',
                                                }}>
                                                    {/* Header de factura */}
                                                    <div style={{
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                        padding: '10px 14px', background: '#F1F5F9',
                                                        borderBottom: '1px solid #E2E8F0',
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                            <FileText size={14} style={{ color: '#3B82F6' }} />
                                                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0D3B66' }}>
                                                                {folio}
                                                            </span>
                                                            <span style={{
                                                                padding: '2px 8px', borderRadius: '10px',
                                                                background: '#DBEAFE', color: '#2563EB',
                                                                fontSize: '0.65rem', fontWeight: 700,
                                                            }}>
                                                                {items.length} ítem{items.length !== 1 ? 's' : ''}
                                                            </span>
                                                            {items[0]?.fecha_hospitalizacion && (
                                                                <span style={{
                                                                    padding: '2px 8px', borderRadius: '10px',
                                                                    background: '#F0FDF4', color: '#16A34A',
                                                                    fontSize: '0.65rem', fontWeight: 600,
                                                                }}>
                                                                    📅 {(() => {
                                                                        const d = new Date(items[0].fecha_hospitalizacion);
                                                                        return isNaN(d.getTime()) ? items[0].fecha_hospitalizacion : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                                                                    })()}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#D97706' }}>
                                                            {formatMoney(totalFolio)}
                                                        </span>
                                                    </div>
                                                    {/* Líneas individuales */}
                                                    {items.map((item, idx) => (
                                                        <div key={item.id || idx} style={{
                                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                            padding: '8px 14px 8px 28px',
                                                            borderBottom: idx < items.length - 1 ? '1px solid #F1F5F9' : 'none',
                                                            background: '#fff',
                                                        }}>
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                    {item.responsable || item.servicio || 'Sin descripción'}
                                                                </div>
                                                                <div style={{ fontSize: '0.68rem', color: '#94A3B8', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                                    {item.servicio && item.responsable && <span>📋 {item.servicio}</span>}
                                                                    {item.tipo_hospitalizacion && <span>🏥 {item.tipo_hospitalizacion}</span>}
                                                                    {item.n_admision && <span>🔖 {item.n_admision}</span>}
                                                                </div>
                                                            </div>
                                                            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                                                                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#D97706' }}>
                                                                    {formatMoney(item.pendiente)}
                                                                </div>
                                                                {Number(item.cobrado) > 0 && (
                                                                    <div style={{ fontSize: '0.65rem', color: '#16A34A' }}>
                                                                        Cobrado: {formatMoney(item.cobrado)}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                                </>
                            )}

                            {/* Tab: Cobros */}
                            {financialTab === 'cobros' && (
                                <>
                                    <h4 style={st.cardTitle}><Banknote size={14} /> Cobros Registrados ({cobros.length})</h4>
                                    {cobros.length === 0 ? (
                                        <span style={{ color: '#CBD5E1' }}>Sin cobros registrados</span>
                                    ) : (
                                        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                            {cobros.map((c, idx) => (
                                                <div key={c.id || idx} style={{
                                                    marginBottom: '8px', borderRadius: '10px',
                                                    border: '1px solid #D1FAE5', overflow: 'hidden',
                                                }}>
                                                    <div style={{
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                        padding: '10px 14px', background: '#F0FDF4',
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#065F46' }}>
                                                                💰 {c.forma_pago || 'Sin forma de pago'}
                                                            </span>
                                                            {c.fecha && (
                                                                <span style={{
                                                                    padding: '2px 8px', borderRadius: '10px',
                                                                    background: '#DCFCE7', color: '#16A34A',
                                                                    fontSize: '0.65rem', fontWeight: 600,
                                                                }}>
                                                                    📅 {(() => {
                                                                        const d = new Date(c.fecha + 'T12:00:00');
                                                                        return isNaN(d.getTime()) ? c.fecha : d.toLocaleDateString('es-AR');
                                                                    })()}
                                                                </span>
                                                            )}
                                                            {c.caja && (
                                                                <span style={{
                                                                    padding: '2px 8px', borderRadius: '10px',
                                                                    background: '#E0E7FF', color: '#4F46E5',
                                                                    fontSize: '0.65rem', fontWeight: 600,
                                                                }}>
                                                                    🏦 {c.caja}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#16A34A' }}>
                                                            {formatMoney(c.importe)}
                                                        </span>
                                                    </div>
                                                    <div style={{ padding: '8px 14px', background: '#fff' }}>
                                                        <div style={{ fontSize: '0.78rem', color: '#334155' }}>
                                                            {c.descripcion || 'Sin descripción'}
                                                        </div>
                                                        <div style={{ fontSize: '0.68rem', color: '#94A3B8', display: 'flex', gap: '12px', marginTop: '4px', flexWrap: 'wrap' }}>
                                                            {c.usuario_cobro && <span>👤 {c.usuario_cobro}</span>}
                                                            {c.clasificacion && <span>📋 {c.clasificacion}</span>}
                                                            {c.comentario && <span>💬 {c.comentario}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Tab: Notas de Crédito */}
                            {financialTab === 'nc' && (
                                <>
                                    <h4 style={st.cardTitle}><CreditCard size={14} /> Notas de Crédito ({notasCredito.length})</h4>
                                    {notasCredito.length === 0 ? (
                                        <span style={{ color: '#CBD5E1' }}>Sin notas de crédito registradas</span>
                                    ) : (
                                        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                            {notasCredito.map((nc, idx) => (
                                                <div key={nc.id || idx} style={{
                                                    marginBottom: '8px', borderRadius: '10px',
                                                    border: '1px solid #BFDBFE', overflow: 'hidden',
                                                }}>
                                                    <div style={{
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                        padding: '10px 14px', background: '#EFF6FF',
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1E40AF' }}>
                                                                📝 {nc.nombre_serie || 'Nota Crédito'}
                                                            </span>
                                                            {nc.fecha && (
                                                                <span style={{
                                                                    padding: '2px 8px', borderRadius: '10px',
                                                                    background: '#DBEAFE', color: '#2563EB',
                                                                    fontSize: '0.65rem', fontWeight: 600,
                                                                }}>
                                                                    📅 {(() => {
                                                                        const d = new Date(nc.fecha + 'T12:00:00');
                                                                        return isNaN(d.getTime()) ? nc.fecha : d.toLocaleDateString('es-AR');
                                                                    })()}
                                                                </span>
                                                            )}
                                                            {nc.centro && (
                                                                <span style={{
                                                                    padding: '2px 8px', borderRadius: '10px',
                                                                    background: '#F3E8FF', color: '#7C3AED',
                                                                    fontSize: '0.65rem', fontWeight: 600,
                                                                }}>
                                                                    🏥 {nc.centro}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#2563EB' }}>
                                                            {formatMoney(nc.importe_total)}
                                                        </span>
                                                    </div>
                                                    <div style={{ padding: '8px 14px', background: '#fff' }}>
                                                        <div style={{ fontSize: '0.78rem', color: '#334155' }}>
                                                            {nc.descripcion || 'Sin descripción'}
                                                        </div>
                                                        {nc.nif && (
                                                            <div style={{ fontSize: '0.68rem', color: '#94A3B8', marginTop: '4px' }}>
                                                                🪪 NIF: {nc.nif}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Presupuestos Vinculados */}
                        <div style={st.card}>
                            <h4 style={st.cardTitle}>
                                <Banknote size={14} /> Presupuestos Vinculados
                                {presupuestos.length > 0 && (
                                    <span style={{
                                        marginLeft: '8px', padding: '2px 8px', borderRadius: '10px',
                                        background: '#DBEAFE', color: '#2563EB',
                                        fontSize: '0.65rem', fontWeight: 700,
                                    }}>
                                        {presupuestos.length}
                                    </span>
                                )}
                            </h4>
                            {detailLoading ? (
                                <span style={{ color: '#94A3B8' }}>Cargando...</span>
                            ) : !selectedDeudor.nhc ? (
                                <div style={{ padding: '12px', background: '#FEF3C7', borderRadius: '10px', fontSize: '0.78rem', color: '#92400E' }}>
                                    ⚠️ Este deudor no tiene <strong>NHC</strong> vinculado.
                                </div>
                            ) : presupuestos.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '20px', color: '#CBD5E1' }}>
                                    <Banknote size={28} strokeWidth={1.2} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.4 }} />
                                    <span style={{ fontSize: '0.82rem' }}>Sin presupuestos encontrados</span>
                                </div>
                            ) : (
                                <div style={{ maxHeight: '380px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {presupuestos.map(p => {
                                        const isAceptado = p.aceptado === 'true' || p.aceptado === 'si';
                                        const total = Number(p.importe_total) || 0;
                                        const cobrado = Number(p.importe_cobrado) || 0;
                                        const pendiente = total - cobrado;
                                        const pctCobrado = total > 0 ? Math.min((cobrado / total) * 100, 100) : 0;
                                        const accentColor = isAceptado ? '#10B981' : (p.aceptado === 'no' ? '#EF4444' : '#F59E0B');

                                        return (
                                            <div key={p.id_presupuesto} style={{
                                                borderRadius: '12px', border: '1px solid #E2E8F0',
                                                overflow: 'hidden', background: '#fff',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                                transition: 'box-shadow 0.2s',
                                            }}
                                                onMouseOver={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'}
                                                onMouseOut={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'}
                                            >
                                                {/* Header con accent bar */}
                                                <div style={{
                                                    display: 'flex', alignItems: 'stretch',
                                                    borderBottom: '1px solid #F1F5F9',
                                                }}>
                                                    {/* Accent bar lateral */}
                                                    <div style={{
                                                        width: '4px', background: accentColor,
                                                        borderRadius: '12px 0 0 0', flexShrink: 0,
                                                    }} />
                                                    <div style={{
                                                        flex: 1, padding: '12px 14px',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                        gap: '12px',
                                                    }}>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{
                                                                fontSize: '0.82rem', fontWeight: 700, color: '#0F172A',
                                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                            }}>
                                                                <span style={{
                                                                    padding: '2px 6px', borderRadius: '6px',
                                                                    background: '#F1F5F9', color: '#64748B',
                                                                    fontSize: '0.68rem', fontWeight: 600, flexShrink: 0,
                                                                    fontFamily: 'monospace',
                                                                }}>
                                                                    #{p.id_presupuesto}
                                                                </span>
                                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                    {p.presup_descripcion || 'Sin descripción'}
                                                                </span>
                                                            </div>
                                                            <div style={{
                                                                display: 'flex', gap: '12px', marginTop: '6px',
                                                                fontSize: '0.7rem', color: '#94A3B8', fontWeight: 500,
                                                            }}>
                                                                <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                                    <Calendar size={11} /> {formatDate(p.fecha)}
                                                                </span>
                                                                <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                                    📦 {p.total_items} ítem{p.total_items !== 1 ? 's' : ''}
                                                                </span>
                                                                <span style={{
                                                                    padding: '1px 8px', borderRadius: '10px', fontWeight: 700,
                                                                    fontSize: '0.62rem',
                                                                    background: isAceptado ? '#D1FAE5' : (p.aceptado === 'no' ? '#FEE2E2' : '#FEF3C7'),
                                                                    color: isAceptado ? '#059669' : (p.aceptado === 'no' ? '#DC2626' : '#D97706'),
                                                                }}>
                                                                    {isAceptado ? '✓ Aceptado' : (p.aceptado === 'no' ? '✕ no' : (p.aceptado || '—'))}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        {/* Monto total */}
                                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                            <div style={{
                                                                fontSize: '1rem', fontWeight: 800, color: '#0F172A',
                                                                letterSpacing: '-0.02em',
                                                            }}>
                                                                {formatMoney(total)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Barra de progreso cobrado/pendiente */}
                                                {total > 0 && (
                                                    <div style={{ padding: '8px 14px 10px', background: '#FAFBFC' }}>
                                                        <div style={{
                                                            display: 'flex', justifyContent: 'space-between',
                                                            fontSize: '0.65rem', fontWeight: 600, marginBottom: '4px',
                                                        }}>
                                                            <span style={{ color: '#10B981' }}>
                                                                Cobrado: {formatMoney(cobrado)}
                                                            </span>
                                                            <span style={{ color: pendiente > 0 ? '#EF4444' : '#10B981' }}>
                                                                {pendiente > 0 ? `Pendiente: ${formatMoney(pendiente)}` : '✓ Pagado'}
                                                            </span>
                                                        </div>
                                                        <div style={{
                                                            height: '6px', borderRadius: '3px',
                                                            background: '#E2E8F0', overflow: 'hidden',
                                                        }}>
                                                            <div style={{
                                                                height: '100%', borderRadius: '3px',
                                                                width: `${pctCobrado}%`,
                                                                background: pctCobrado >= 100
                                                                    ? 'linear-gradient(90deg, #10B981, #059669)'
                                                                    : pctCobrado > 0
                                                                        ? 'linear-gradient(90deg, #3B82F6, #2563EB)'
                                                                        : 'transparent',
                                                                transition: 'width 0.5s ease',
                                                            }} />
                                                        </div>
                                                        <div style={{
                                                            textAlign: 'right', fontSize: '0.6rem',
                                                            color: '#94A3B8', marginTop: '2px', fontWeight: 600,
                                                        }}>
                                                            {pctCobrado.toFixed(0)}% cobrado
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Observaciones */}
                                                {p.observaciones && (
                                                    <div style={{
                                                        padding: '8px 14px',
                                                        fontSize: '0.72rem', color: '#64748B',
                                                        background: '#F8FAFC',
                                                        borderTop: '1px solid #F1F5F9',
                                                        display: 'flex', gap: '6px', alignItems: 'flex-start',
                                                    }}>
                                                        <span style={{ flexShrink: 0, opacity: 0.6 }}>💬</span>
                                                        <span style={{ lineHeight: '1.4', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                                            {p.observaciones}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Plan de Pago */}
                        <div style={st.card}>
                            <h4 style={st.cardTitle}>
                                <CreditCard size={14} /> Plan de Pago
                                {planes.filter(p => p.estado === 'activo').length > 0 && (
                                    <span style={{ marginLeft: '8px', padding: '2px 8px', borderRadius: '10px', background: '#DCFCE7', color: '#16A34A', fontSize: '0.65rem', fontWeight: 700 }}>
                                        {planes.filter(p => p.estado === 'activo').length} activo{planes.filter(p => p.estado === 'activo').length !== 1 ? 's' : ''}
                                    </span>
                                )}
                                <button onClick={() => setShowPlanForm(p => !p)} style={{ ...st.btnSmall, marginLeft: 'auto', padding: '4px 10px', fontSize: '0.72rem' }}>
                                    <Plus size={12} /> {showPlanForm ? 'Cerrar' : 'Nuevo Plan'}
                                </button>
                            </h4>

                            {/* Formulario nuevo plan */}
                            {showPlanForm && (
                                <div style={{ padding: '14px', background: '#F8FAFC', borderRadius: '12px', marginBottom: '12px', border: '1px solid #E2E8F0' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                                        <div>
                                            <label style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600, display: 'block', marginBottom: '2px' }}>Monto original</label>
                                            <input type="number" value={planForm.montoOriginal}
                                                onChange={e => setPlanForm(p => ({ ...p, montoOriginal: e.target.value }))}
                                                style={{ ...st.input, width: '100%', boxSizing: 'border-box' }} placeholder="$" />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600, display: 'block', marginBottom: '2px' }}>Cuotas</label>
                                            <input type="number" value={planForm.cantidadCuotas}
                                                onChange={e => setPlanForm(p => ({ ...p, cantidadCuotas: e.target.value }))}
                                                style={{ ...st.input, width: '100%', boxSizing: 'border-box' }} placeholder="Ej: 6" min="1" />
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                                        <div>
                                            <label style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600, display: 'block', marginBottom: '2px' }}>Tipo de interés</label>
                                            <select value={planForm.tipoInteres}
                                                onChange={e => setPlanForm(p => ({ ...p, tipoInteres: e.target.value }))}
                                                style={{ ...st.input, width: '100%', boxSizing: 'border-box' }}>
                                                <option value="porcentaje">% Mensual</option>
                                                <option value="fijo">Monto fijo por cuota</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600, display: 'block', marginBottom: '2px' }}>
                                                {planForm.tipoInteres === 'porcentaje' ? 'Tasa % mensual' : 'Recargo fijo $'}
                                            </label>
                                            <input type="number" value={planForm.tasaInteres}
                                                onChange={e => setPlanForm(p => ({ ...p, tasaInteres: e.target.value }))}
                                                style={{ ...st.input, width: '100%', boxSizing: 'border-box' }}
                                                placeholder={planForm.tipoInteres === 'porcentaje' ? 'Ej: 5' : 'Ej: 2000'} step="0.01" />
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '8px' }}>
                                        <label style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600, display: 'block', marginBottom: '2px' }}>Fecha inicio</label>
                                        <input type="date" value={planForm.fechaInicio}
                                            onChange={e => setPlanForm(p => ({ ...p, fechaInicio: e.target.value }))}
                                            style={{ ...st.input, width: '100%', boxSizing: 'border-box' }} />
                                    </div>

                                    {/* Preview */}
                                    {planForm.montoOriginal && planForm.cantidadCuotas && Number(planForm.cantidadCuotas) > 0 && (() => {
                                        const monto = Number(planForm.montoOriginal);
                                        const cuotas = Number(planForm.cantidadCuotas);
                                        const tasa = Number(planForm.tasaInteres) || 0;
                                        let montoCuota, total;
                                        if (planForm.tipoInteres === 'fijo') {
                                            montoCuota = (monto / cuotas) + tasa;
                                            total = montoCuota * cuotas;
                                        } else {
                                            const r = tasa / 100;
                                            montoCuota = r > 0
                                                ? monto * (r * Math.pow(1 + r, cuotas)) / (Math.pow(1 + r, cuotas) - 1)
                                                : monto / cuotas;
                                            total = montoCuota * cuotas;
                                        }
                                        return (
                                            <div style={{ padding: '10px 14px', background: '#F0F9FF', borderRadius: '10px', border: '1px solid #BAE6FD', marginBottom: '8px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                                    <span style={{ color: '#0369A1', fontWeight: 700 }}>Cuota: {formatMoney(montoCuota)}</span>
                                                    <span style={{ color: '#64748B' }}>Total: {formatMoney(total)}</span>
                                                </div>
                                                {tasa > 0 && (
                                                    <div style={{ fontSize: '0.68rem', color: '#94A3B8', marginTop: '2px' }}>
                                                        Recargo: {formatMoney(total - monto)} ({planForm.tipoInteres === 'porcentaje' ? `${tasa}% mensual` : `$${tasa} por cuota`})
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input type="text" value={planForm.notas}
                                            onChange={e => setPlanForm(p => ({ ...p, notas: e.target.value }))}
                                            placeholder="Notas del plan..."
                                            style={{ ...st.input, flex: 1 }} />
                                        <button onClick={handleCreatePlan}
                                            style={{ ...st.btnSmall, background: '#8B5CF6', color: '#fff', border: 'none' }}>
                                            <CheckCircle size={14} /> Crear
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Planes existentes */}
                            {planes.length === 0 && !showPlanForm ? (
                                <span style={{ color: '#CBD5E1', fontSize: '0.85rem' }}>Sin planes de pago</span>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto' }}>
                                    {planes.map(plan => {
                                        const pagadas = plan.cuotas?.filter(c => c.pagada).length || 0;
                                        const totalCuotas = plan.cuotas?.length || plan.cantidad_cuotas;
                                        const progreso = totalCuotas > 0 ? (pagadas / totalCuotas) * 100 : 0;
                                        const isActive = plan.estado === 'activo';
                                        return (
                                            <div key={plan.id} style={{
                                                borderRadius: '12px', border: `1px solid ${isActive ? '#E2E8F0' : '#FEE2E2'}`,
                                                overflow: 'hidden', opacity: isActive ? 1 : 0.6,
                                            }}>
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    padding: '10px 14px', background: isActive ? '#F8FAFC' : '#FEF2F2',
                                                }}>
                                                    <div>
                                                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0D3B66' }}>
                                                            {plan.cantidad_cuotas} cuotas de {formatMoney(plan.monto_cuota)}
                                                        </div>
                                                        <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>
                                                            Total: {formatMoney(plan.monto_total_financiado)} ·
                                                            {plan.tipo_interes === 'porcentaje' ? ` ${plan.tasa_interes}% mensual` : ` +$${plan.tasa_interes}/cuota`}
                                                            {plan.notas && ` · ${plan.notas}`}
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{
                                                            padding: '2px 8px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 700,
                                                            background: isActive ? '#DCFCE7' : '#FEE2E2',
                                                            color: isActive ? '#16A34A' : '#EF4444',
                                                        }}>
                                                            {plan.estado === 'activo' ? '✅ Activo' : plan.estado === 'finalizado' ? '🏁 Finalizado' : '❌ Cancelado'}
                                                        </span>
                                                        {isActive && (
                                                            <button onClick={() => handleCancelarPlan(plan.id)}
                                                                style={{ ...st.btnSmall, padding: '2px 8px', fontSize: '0.65rem', color: '#EF4444' }}>
                                                                <XCircle size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                {/* Barra de progreso */}
                                                <div style={{ padding: '0 14px 6px', background: isActive ? '#F8FAFC' : '#FEF2F2' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                                        <span style={{ fontSize: '0.65rem', color: '#64748B' }}>{pagadas}/{totalCuotas} pagadas</span>
                                                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#16A34A' }}>{Math.round(progreso)}%</span>
                                                    </div>
                                                    <div style={{ background: '#E2E8F0', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                                                        <div style={{ width: `${progreso}%`, height: '100%', borderRadius: '4px', background: 'linear-gradient(90deg, #16A34A, #22C55E)', transition: 'width 0.3s' }} />
                                                    </div>
                                                </div>
                                                {/* Cuotas */}
                                                {isActive && plan.cuotas?.length > 0 && (
                                                    <div style={{ padding: '0 14px 10px' }}>
                                                        {plan.cuotas.map(c => {
                                                            const vencida = !c.pagada && new Date(c.fecha_vencimiento) < new Date();
                                                            return (
                                                                <div key={c.id} style={{
                                                                    display: 'flex', alignItems: 'center', gap: '8px',
                                                                    padding: '6px 0', borderBottom: '1px solid #F1F5F9',
                                                                    fontSize: '0.78rem',
                                                                }}>
                                                                    <input type="checkbox" checked={c.pagada} disabled={c.pagada}
                                                                        onChange={() => !c.pagada && handleMarcarCuota(c.id)}
                                                                        style={{ cursor: c.pagada ? 'default' : 'pointer' }} />
                                                                    <span style={{
                                                                        fontWeight: 600, color: c.pagada ? '#16A34A' : (vencida ? '#EF4444' : '#0D3B66'),
                                                                        textDecoration: c.pagada ? 'line-through' : 'none',
                                                                    }}>
                                                                        Cuota {c.numero_cuota}
                                                                    </span>
                                                                    <span style={{ color: '#64748B', flex: 1 }}>
                                                                        {formatMoney(c.monto)}
                                                                    </span>
                                                                    <span style={{
                                                                        fontSize: '0.68rem',
                                                                        color: c.pagada ? '#16A34A' : (vencida ? '#EF4444' : '#94A3B8'),
                                                                        fontWeight: vencida ? 700 : 400,
                                                                    }}>
                                                                        {c.pagada
                                                                            ? `✅ ${c.fecha_pago ? new Date(c.fecha_pago).toLocaleDateString('es-AR') : 'Pagada'}`
                                                                            : `Vence: ${new Date(c.fecha_vencimiento).toLocaleDateString('es-AR')}${vencida ? ' ⚠️' : ''}`}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
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
                                {noteType === 'pago' && (
                                    <input
                                        type="number"
                                        value={montoPago}
                                        onChange={e => setMontoPago(e.target.value)}
                                        placeholder="Monto $"
                                        style={{ ...st.input, width: '110px', color: '#16A34A', fontWeight: 800 }}
                                    />
                                )}
                                <input
                                    type="text"
                                    value={newNote}
                                    onChange={e => setNewNote(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                                    placeholder={noteType === 'pago' ? 'Nro de comprobante o detalle...' : 'Descripción del seguimiento...'}
                                    style={{ ...st.input, flex: 1 }}
                                />
                                <button onClick={handleAddNote} disabled={!newNote.trim() || (noteType === 'pago' && !montoPago)}
                                    style={{
                                        ...st.btnSmall,
                                        background: (newNote.trim() && (noteType !== 'pago' || montoPago)) ? '#3B82F6' : '#E2E8F0',
                                        color: (newNote.trim() && (noteType !== 'pago' || montoPago)) ? '#fff' : '#94A3B8',
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
                                                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#0D3B66' }}>
                                                        {s.tipo === 'pago' && s.monto && (
                                                            <strong style={{ color: '#16A34A', display: 'block', marginBottom: '2px' }}>
                                                                Pago cobrado: {formatMoney(s.monto)}
                                                            </strong>
                                                        )}
                                                        {s.descripcion}
                                                    </p>
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
                        patientContext={{
                            deudaTotal: formatMoney(selectedDeudor.deuda_total),
                            cantidadFacturas: selectedDeudor.cantidad_facturas,
                            fechaUltimaFactura: selectedDeudor.fecha_ultima_factura,
                            nhc: selectedDeudor.nhc
                        }}
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
