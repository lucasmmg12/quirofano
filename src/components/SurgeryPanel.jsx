/**
 * Panel de Gestión de Cirugías (CRM) — Redesign v2
 * Dashboard Clínico con Urgencia Visual
 * 
 * Features:
 *   - Countdown (horas restantes) con semáforo de urgencia
 *   - KPIs compactos por estado
 *   - Tabla agrupada por fecha, ordenada por urgencia
 *   - Zona de carga Excel colapsable
 *   - Modal de preview mejorado con columnas detectadas
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Upload, Search, Send, CheckCircle, AlertTriangle, XCircle,
    FileText, Eye, ArrowRight, RefreshCw, User, Calendar, Building2, Phone,
    X, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Clock,
    ChevronDown, ChevronUp, Timer, Activity, Zap, Pencil, Trash2,
    MessageSquare, ChevronRight
} from 'lucide-react';
import {
    fetchSurgeries, createSurgery, updateSurgery, deleteSurgery, getSurgeryStats,
    sendInitialNotification, markDocumentReceived,
    authorizeSurgery, confirmAttendance, flagProblem, manualOverride,
    processScheduledNotifications, bulkUpsertSurgeries, updateAusenteStatus
} from '../services/surgeryService';
import { parseExcelFile, mapExcelToSurgeries, validateMappedRecords } from '../utils/excelParser';
import { bulkNormalizePhones } from '../utils/phoneUtils';
import { sendWhatsAppMessage, normalizeArgentinePhone } from '../services/builderbotApi';
import { fetchUnreadCounts, saveOutgoingMessage, subscribeToAllIncoming } from '../services/chatService';
import ChatWindow from './ChatWindow';

// ============================================================
// CONSTANTS & CONFIG
// ============================================================

const STATUS_CONFIG = {
    lila: { label: 'Pendiente', color: '#A855F7', bg: '#FAF5FF', icon: '🟣' },
    amarillo: { label: 'En Revisión', color: '#EAB308', bg: '#FEFCE8', icon: '🟡' },
    verde: { label: 'Autorizado', color: '#22C55E', bg: '#F0FDF4', icon: '🟢' },
    azul: { label: 'Confirmado', color: '#3B82F6', bg: '#EFF6FF', icon: '🔵' },
    rojo: { label: 'Problema', color: '#EF4444', bg: '#FEF2F2', icon: '🔴' },
    realizada: { label: 'Realizada', color: '#059669', bg: '#ECFDF5', icon: '✅' },
    suspendida: { label: 'Suspendida', color: '#6B7280', bg: '#F3F4F6', icon: '⛔' },
};

/** Devuelve el status efectivo considerando la columna ausente */
function getEffectiveStatus(surgery) {
    if (surgery.ausente === '0') return 'realizada';
    if (surgery.ausente === '1') return 'suspendida';
    return surgery.status || 'lila';
}

const URGENCY_THRESHOLDS = {
    critical: 24,   // < 24hs → ROJO
    warning: 72,    // 24-72hs → AMARILLO
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/** Calcula horas restantes y nivel de urgencia */
function getCountdown(fechaCirugia) {
    if (!fechaCirugia) return { hours: null, label: 'Sin fecha', color: '#94A3B8', bg: '#F1F5F9', urgency: 'none', icon: '—' };

    const now = new Date();
    const surgeryDate = new Date(fechaCirugia + 'T08:00:00');
    const diffMs = surgeryDate - now;
    const hours = Math.round(diffMs / (1000 * 60 * 60));

    if (hours < 0) {
        const absH = Math.abs(hours);
        const days = Math.floor(absH / 24);
        return {
            hours, urgency: 'past',
            label: days > 0 ? `Hace ${days}d ${absH % 24}hs` : `Hace ${absH}hs`,
            color: '#64748B', bg: '#F1F5F9', icon: '⏪',
        };
    }
    if (hours < URGENCY_THRESHOLDS.critical) {
        return { hours, urgency: 'critical', label: `${hours}hs`, color: '#DC2626', bg: '#FEF2F2', icon: '🔴' };
    }
    if (hours < URGENCY_THRESHOLDS.warning) {
        const days = Math.floor(hours / 24);
        const remH = hours % 24;
        return { hours, urgency: 'warning', label: days > 0 ? `${days}d ${remH}hs` : `${hours}hs`, color: '#D97706', bg: '#FFFBEB', icon: '🟡' };
    }
    const days = Math.floor(hours / 24);
    const remH = hours % 24;
    return { hours, urgency: 'ok', label: days > 0 ? `${days}d ${remH}hs` : `${hours}hs`, color: '#16A34A', bg: '#F0FDF4', icon: '🟢' };
}

/** Formatea fecha completa: Mié 19/02/2026 */
function formatFullDate(d) {
    if (!d) return '—';
    const date = new Date(d + 'T12:00:00');
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const dayName = dayNames[date.getDay()];
    return `${dayName} ${date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
}

/** Formatea fecha corta para group headers */
function formatGroupDate(d) {
    if (!d) return 'Sin Fecha';
    const date = new Date(d + 'T12:00:00');
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${dayNames[date.getDay()]} ${date.getDate()} de ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}

/** Agrupa y ordena cirugías por fecha (más urgente primero) */
function groupSurgeriesByDate(surgeries) {
    const groups = {};
    surgeries.forEach(s => {
        const key = s.fecha_cirugia || '_sin_fecha';
        if (!groups[key]) groups[key] = [];
        groups[key].push(s);
    });
    // Ordenar grupos: fechas más próximas primero
    return Object.entries(groups)
        .sort(([a], [b]) => {
            if (a === '_sin_fecha') return 1;
            if (b === '_sin_fecha') return -1;
            return a.localeCompare(b);
        })
        .map(([date, items]) => ({ date, items, countdown: getCountdown(date === '_sin_fecha' ? null : date) }));
}

// ============================================================
// COMPONENT
// ============================================================

export default function SurgeryPanel({ addToast }) {
    const [surgeries, setSurgeries] = useState([]);
    const [stats, setStats] = useState({});
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [showUpload, setShowUpload] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [showExcelZone, setShowExcelZone] = useState(false);
    const [viewMode, setViewMode] = useState('upcoming'); // 'upcoming' | 'history'

    // Excel upload state
    const [excelPreview, setExcelPreview] = useState(null);
    const [areaCode, setAreaCode] = useState('264');
    const [uploading, setUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(null); // { current, total, results }
    const [dragOver, setDragOver] = useState(false);

    // New surgery form
    const [newSurgery, setNewSurgery] = useState({
        nombre: '', dni: '', telefono: '', obraSocial: '',
        fechaCirugia: '', medico: '', modulo: '',
    });

    // Edit surgery modal
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editSurgery, setEditSurgery] = useState(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);

    // Expandable row
    const [expandedRowId, setExpandedRowId] = useState(null);
    const [customMessage, setCustomMessage] = useState('');
    const [sendingMessage, setSendingMessage] = useState(false);

    // Chat window
    const [chatOpen, setChatOpen] = useState(false);
    const [chatPatient, setChatPatient] = useState({ name: '', phone: '' });
    const [unreadCounts, setUnreadCounts] = useState({});

    // ============================================================
    // DATA LOADING
    // ============================================================

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const ausenteFilter = viewMode === 'history' ? 'history' : 'pending';
            // Solo filtrar status a nivel DB si es un status real (no virtual)
            const dbStatusValues = ['lila', 'amarillo', 'verde', 'azul', 'rojo'];
            const dbStatus = dbStatusValues.includes(filter) ? filter : undefined;

            // En "Próximas" solo traer desde hoy en adelante
            const today = new Date().toISOString().split('T')[0];

            const [surgeriesData, statsData] = await Promise.all([
                fetchSurgeries({
                    ...(dbStatus && { status: dbStatus }),
                    ausenteFilter,
                    ...(viewMode === 'upcoming' && { fromDate: today }),
                }),
                getSurgeryStats(),
            ]);
            setSurgeries(surgeriesData || []);
            setStats(statsData);
        } catch (e) {
            console.error(e);
            addToast?.('Error al cargar cirugías', 'error');
        } finally {
            setLoading(false);
        }
    }, [filter, viewMode, addToast]);

    useEffect(() => { loadData(); }, [loadData]);

    // Cargar unread counts y suscribirse a nuevos mensajes entrantes
    useEffect(() => {
        const loadUnreads = async () => {
            try {
                const counts = await fetchUnreadCounts();
                setUnreadCounts(counts);
            } catch (e) { console.error('Error loading unread counts:', e); }
        };
        loadUnreads();

        // Suscripción en tiempo real a mensajes entrantes
        const unsub = subscribeToAllIncoming((newMsg) => {
            if (newMsg.direction === 'incoming') {
                setUnreadCounts(prev => ({
                    ...prev,
                    [newMsg.phone]: (prev[newMsg.phone] || 0) + 1
                }));
            }
        });
        return () => unsub();
    }, []);

    // Abrir chat de un paciente
    const openChat = (surgery) => {
        setChatPatient({ name: surgery.nombre, phone: surgery.telefono });
        setChatOpen(true);
        // Limpiar unread del teléfono
        const normalized = normalizeArgentinePhone(surgery.telefono);
        if (normalized) {
            setUnreadCounts(prev => { const n = { ...prev }; delete n[normalized]; return n; });
        }
    };

    // ============================================================
    // FILTERED & COMPUTED DATA
    // ============================================================

    const filtered = useMemo(() => {
        let list = surgeries;

        // Text search
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            list = list.filter(s =>
                s.nombre?.toLowerCase().includes(term) ||
                s.dni?.includes(term) ||
                s.telefono?.includes(term) ||
                s.medico?.toLowerCase().includes(term) ||
                s.obra_social?.toLowerCase().includes(term)
            );
        }

        // Status filter (supports virtual statuses from ausente column)
        if (filter !== 'all') {
            if (filter === 'realizada') {
                list = list.filter(s => s.ausente === '0');
            } else if (filter === 'suspendida') {
                list = list.filter(s => s.ausente === '1');
            } else {
                // Filtro por status real, solo si ausente no aplica
                list = list.filter(s => s.status === filter && s.ausente !== '0' && s.ausente !== '1');
            }
        }

        return list;
    }, [surgeries, searchTerm, filter]);

    // Count for tabs (based on ausente from raw data, not filtered)
    const historySurgeries = useMemo(() => {
        return surgeries.filter(s => s.ausente === '0' || s.ausente === '1' || (s.fecha_cirugia && s.fecha_cirugia < new Date().toISOString().split('T')[0]));
    }, [surgeries]);

    const groups = useMemo(() => groupSurgeriesByDate(filtered), [filtered]);

    // Urgency summary
    const urgencySummary = useMemo(() => {
        const critical = surgeries.filter(s => {
            const cd = getCountdown(s.fecha_cirugia);
            return cd.urgency === 'critical';
        }).length;
        const warning = surgeries.filter(s => {
            const cd = getCountdown(s.fecha_cirugia);
            return cd.urgency === 'warning';
        }).length;
        return { critical, warning };
    }, [surgeries]);

    // ============================================================
    // HANDLERS — Surgery Actions
    // ============================================================

    const handleNotify = async (id) => {
        try {
            setProcessing(true);
            await sendInitialNotification(id);
            addToast?.('Notificación enviada', 'success');
            loadData();
        } catch (e) { addToast?.('Error: ' + e.message, 'error'); }
        finally { setProcessing(false); }
    };

    const handleAuthorize = async (id) => {
        try {
            setProcessing(true);
            await authorizeSurgery(id, 'operador');
            addToast?.('Cirugía autorizada — mensaje enviado', 'success');
            loadData();
        } catch (e) { addToast?.('Error: ' + e.message, 'error'); }
        finally { setProcessing(false); }
    };

    const handleDocReceived = async (id) => {
        try {
            setProcessing(true);
            await markDocumentReceived(id, 'operador');
            addToast?.('Documentación recibida', 'success');
            loadData();
        } catch (e) { addToast?.('Error: ' + e.message, 'error'); }
        finally { setProcessing(false); }
    };

    const handleConfirm = async (id) => {
        try {
            setProcessing(true);
            await confirmAttendance(id, 'operador');
            addToast?.('Asistencia confirmada', 'success');
            loadData();
        } catch (e) { addToast?.('Error: ' + e.message, 'error'); }
        finally { setProcessing(false); }
    };

    const handleFlag = async (id) => {
        try {
            setProcessing(true);
            await flagProblem(id, 'Marcado manualmente', 'operador');
            addToast?.('Marcado como problema', 'success');
            loadData();
        } catch (e) { addToast?.('Error: ' + e.message, 'error'); }
        finally { setProcessing(false); }
    };

    const handleManualChange = async (id, newStatus) => {
        try {
            setProcessing(true);
            await manualOverride(id, newStatus, 'operador');
            addToast?.(`Estado → ${STATUS_CONFIG[newStatus]?.label}`, 'success');
            loadData();
        } catch (e) { addToast?.('Error: ' + e.message, 'error'); }
        finally { setProcessing(false); }
    };

    const handleAusenteChange = async (id, value) => {
        const labels = { '0': 'Realizada', '1': 'Suspendida', null: 'Pendiente' };
        try {
            setProcessing(true);
            await updateAusenteStatus(id, value);
            addToast?.(`Cirugía marcada como ${labels[value]}`, 'success');
            loadData();
        } catch (e) { addToast?.('Error: ' + e.message, 'error'); }
        finally { setProcessing(false); }
    };

    const handleBatchNotify = async () => {
        try {
            setProcessing(true);
            const result = await processScheduledNotifications();
            addToast?.(`${result.sent || 0} notificaciones enviadas`, 'success');
            loadData();
        } catch (e) { addToast?.('Error: ' + e.message, 'error'); }
        finally { setProcessing(false); }
    };

    const handleAddSurgery = async () => {
        try {
            await createSurgery({
                nombre: newSurgery.nombre, dni: newSurgery.dni,
                telefono: newSurgery.telefono, obra_social: newSurgery.obraSocial,
                fecha_cirugia: newSurgery.fechaCirugia, medico: newSurgery.medico,
                modulo: newSurgery.modulo,
            });
            addToast?.('Cirugía creada', 'success');
            setNewSurgery({ nombre: '', dni: '', telefono: '', obraSocial: '', fechaCirugia: '', medico: '', modulo: '' });
            setShowAddForm(false);
            loadData();
        } catch (e) { addToast?.('Error: ' + e.message, 'error'); }
    };

    // ============================================================
    // HANDLERS — Edit & Delete
    // ============================================================

    const handleOpenEdit = (surgery) => {
        setEditSurgery({
            id: surgery.id,
            nombre: surgery.nombre || '',
            dni: surgery.dni || '',
            telefono: surgery.telefono || '',
            obra_social: surgery.obra_social || '',
            fecha_cirugia: surgery.fecha_cirugia || '',
            medico: surgery.medico || '',
            modulo: surgery.modulo || '',
        });
        setEditModalOpen(true);
    };

    const handleSaveEdit = async () => {
        if (!editSurgery) return;
        try {
            setProcessing(true);
            await updateSurgery(editSurgery.id, {
                nombre: editSurgery.nombre,
                dni: editSurgery.dni,
                telefono: editSurgery.telefono,
                obra_social: editSurgery.obra_social,
                fecha_cirugia: editSurgery.fecha_cirugia,
                medico: editSurgery.medico,
                modulo: editSurgery.modulo,
            });
            addToast?.('Cirugía actualizada', 'success');
            setEditModalOpen(false);
            setEditSurgery(null);
            loadData();
        } catch (e) { addToast?.('Error al editar: ' + e.message, 'error'); }
        finally { setProcessing(false); }
    };

    const handleDeleteSurgery = async (id) => {
        try {
            setProcessing(true);
            await deleteSurgery(id);
            addToast?.('Cirugía eliminada', 'success');
            setDeleteConfirmId(null);
            loadData();
        } catch (e) { addToast?.('Error al eliminar: ' + e.message, 'error'); }
        finally { setProcessing(false); }
    };

    // ============================================================
    // HANDLERS — Custom WhatsApp Message
    // ============================================================

    const handleSendCustomMessage = async (surgery) => {
        if (!customMessage.trim() || !surgery.telefono) return;
        try {
            setSendingMessage(true);
            await sendWhatsAppMessage({
                content: customMessage.trim(),
                number: surgery.telefono,
            });
            // Guardar en historial de chat
            try {
                await saveOutgoingMessage({
                    phone: surgery.telefono,
                    content: customMessage.trim(),
                    mediaType: 'text',
                });
            } catch (_) { /* el webhook outgoing también lo guarda */ }
            addToast?.(`Mensaje enviado a ${surgery.nombre}`, 'success');
            setCustomMessage('');
        } catch (e) { addToast?.('Error al enviar mensaje: ' + e.message, 'error'); }
        finally { setSendingMessage(false); }
    };

    // ============================================================
    // HANDLERS — Excel Upload
    // ============================================================

    const handleExcelFile = async (file) => {
        if (!file) return;
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext !== 'xlsx' && ext !== 'xls') {
            addToast?.('Solo se aceptan archivos .xlsx o .xls', 'error');
            return;
        }
        try {
            setUploading(true);
            setUploadResult(null);

            const rawRows = await parseExcelFile(file);
            if (!rawRows || rawRows.length === 0) {
                addToast?.('El archivo Excel está vacío', 'error');
                setUploading(false);
                return;
            }

            const { records: mapped, columnMapping, unmappedColumns } = mapExcelToSurgeries(rawRows);
            const validation = validateMappedRecords(mapped);
            const phoneResults = bulkNormalizePhones(validation.valid, 'telefono_raw', areaCode);

            setExcelPreview({
                fileName: file.name,
                totalRows: rawRows.length,
                records: phoneResults.records,
                phoneSummary: phoneResults.summary,
                validation,
                columnMapping,
                unmappedColumns,
            });

            setShowUpload(true);
        } catch (e) {
            addToast?.('Error al leer Excel: ' + e.message, 'error');
        } finally {
            setUploading(false);
        }
    };

    const handleExcelSelect = (e) => {
        handleExcelFile(e.target.files[0]);
        e.target.value = '';
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer?.files?.[0];
        if (file) handleExcelFile(file);
    };

    const handleConfirmUpload = async () => {
        if (!excelPreview) return;
        try {
            setUploading(true);
            setUploadProgress({ current: 0, total: excelPreview.validation.valid.length, results: null });
            const phoneResults = bulkNormalizePhones(excelPreview.validation.valid, 'telefono_raw', areaCode);
            const result = await bulkUpsertSurgeries(phoneResults.records, areaCode, (current, total, partialResults) => {
                setUploadProgress({ current, total, results: partialResults });
            });
            setUploadResult(result);
            setUploadProgress(null);
            addToast?.(
                `✅ Carga completada: ${result.inserted} nuevos, ${result.updated} actualizados` +
                (result.skippedByName > 0 ? `, ${result.skippedByName} descartados (BLOQUE)` : '') +
                (result.skipped > 0 ? `, ${result.skipped} con errores` : ''),
                result.skipped > 0 ? 'info' : 'success'
            );
            loadData();
        } catch (e) {
            addToast?.('Error en la carga: ' + e.message, 'error');
            setUploadProgress(null);
        } finally {
            setUploading(false);
        }
    };

    const handleCloseUpload = () => {
        setShowUpload(false);
        setExcelPreview(null);
        setUploadResult(null);
    };

    const handleAreaCodeChange = (newCode) => {
        setAreaCode(newCode);
        if (excelPreview) {
            const phoneResults = bulkNormalizePhones(excelPreview.validation.valid, 'telefono_raw', newCode);
            setExcelPreview(prev => ({
                ...prev,
                records: phoneResults.records,
                phoneSummary: phoneResults.summary,
            }));
        }
    };

    // ============================================================
    // ACTION HELPERS FOR EXPANDED ROW
    // ============================================================

    const getStatusActions = (surgery) => {
        const actions = [];
        switch (surgery.status) {
            case 'lila':
                actions.push({ label: 'Notificar', icon: Send, action: () => handleNotify(surgery.id), color: '#A855F7' });
                actions.push({ label: 'Doc recibida', icon: FileText, action: () => handleDocReceived(surgery.id), color: '#3B82F6' });
                break;
            case 'amarillo':
                actions.push({ label: 'Autorizar', icon: CheckCircle, action: () => handleAuthorize(surgery.id), color: '#22C55E' });
                break;
            case 'verde':
                actions.push({ label: 'Confirmar', icon: CheckCircle, action: () => handleConfirm(surgery.id), color: '#3B82F6' });
                break;
            case 'rojo':
                actions.push({ label: '→ Pendiente', icon: ArrowRight, action: () => handleManualChange(surgery.id, 'lila'), color: '#A855F7' });
                break;
            default: break;
        }
        actions.push({ label: 'Problema', icon: AlertTriangle, action: () => handleFlag(surgery.id), color: '#EF4444' });
        return actions;
    };

    const getResultActions = (surgery) => {
        const actions = [];
        if (surgery.ausente !== '0') actions.push({ label: 'Realizada', icon: CheckCircle, action: () => handleAusenteChange(surgery.id, '0'), color: '#16A34A' });
        if (surgery.ausente !== '1') actions.push({ label: 'Suspendida', icon: XCircle, action: () => handleAusenteChange(surgery.id, '1'), color: '#DC2626' });
        return actions;
    };

    // ============================================================
    // RENDER
    // ============================================================

    return (
        <div className="content no-print" style={{
            gap: 'var(--space-4)',
            position: 'relative',
            maxWidth: '100%',
        }}>
            {/* ==================== URGENCY ALERT BAR ==================== */}
            {urgencySummary.critical > 0 && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                    padding: 'var(--space-3) var(--space-5)',
                    background: 'linear-gradient(135deg, #FEF2F2 0%, #FFF1F2 100%)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid #FECACA',
                    animation: 'fadeIn 0.3s ease-out',
                }}>
                    <div style={{
                        width: '36px', height: '36px', borderRadius: '50%',
                        background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        animation: 'pulse 2s ease-in-out infinite',
                    }}>
                        <Zap size={18} style={{ color: '#DC2626' }} />
                    </div>
                    <div>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#991B1B' }}>
                            ⚡ {urgencySummary.critical} cirugía{urgencySummary.critical > 1 ? 's' : ''} en menos de 24 horas
                        </span>
                        {urgencySummary.warning > 0 && (
                            <span style={{ fontSize: '0.78rem', color: '#92400E', marginLeft: '12px' }}>
                                • {urgencySummary.warning} entre 24-72hs
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* ==================== KPI STATS BAR ==================== */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap',
            }}>
                {/* All filter */}
                <button
                    onClick={() => setFilter('all')}
                    style={{
                        padding: '6px 14px', borderRadius: 'var(--radius-full)', cursor: 'pointer',
                        fontSize: '0.78rem', fontWeight: 600, border: '1.5px solid',
                        borderColor: filter === 'all' ? 'var(--primary-500)' : 'var(--neutral-200)',
                        background: filter === 'all' ? 'var(--primary-500)' : 'transparent',
                        color: filter === 'all' ? '#fff' : 'var(--neutral-600)',
                        transition: 'all 0.2s',
                    }}
                >
                    Todos <span style={{ opacity: 0.8 }}>({surgeries.length})</span>
                </button>

                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <button
                        key={key}
                        onClick={() => setFilter(filter === key ? 'all' : key)}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                            padding: '6px 12px', borderRadius: 'var(--radius-full)', cursor: 'pointer',
                            fontSize: '0.76rem', fontWeight: 600,
                            border: `1.5px solid ${filter === key ? cfg.color : 'transparent'}`,
                            background: filter === key ? cfg.color : cfg.bg,
                            color: filter === key ? '#fff' : cfg.color,
                            transition: 'all 0.2s',
                        }}
                    >
                        <span style={{ fontSize: '0.65rem' }}>{cfg.icon}</span>
                        {cfg.label}
                        <span style={{
                            background: filter === key ? 'rgba(255,255,255,0.25)' : cfg.color + '18',
                            padding: '1px 7px', borderRadius: '10px', fontSize: '0.7rem',
                        }}>
                            {stats[key] || 0}
                        </span>
                    </button>
                ))}
            </div>

            {/* ==================== ACTION BAR ==================== */}
            <div className="patient-header" style={{ padding: 'var(--space-3) var(--space-5)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    {/* Search */}
                    <div className="practice-search__input-wrapper" style={{ flex: 1, minWidth: '180px' }}>
                        <Search size={15} className="practice-search__input-icon" />
                        <input
                            className="practice-search__input"
                            placeholder="Buscar paciente, DNI, médico..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{ fontSize: '0.82rem', padding: '8px 8px 8px 34px' }}
                        />
                    </div>

                    {/* Buttons */}
                    <button className="btn btn--primary" onClick={() => setShowAddForm(!showAddForm)}
                        style={{ fontSize: '0.78rem', padding: '8px 14px' }}>
                        + Cirugía
                    </button>

                    <button className="btn btn--ghost" onClick={() => setShowExcelZone(!showExcelZone)}
                        style={{ fontSize: '0.78rem', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <FileSpreadsheet size={15} />
                        Excel
                        {showExcelZone ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>

                    <button className="btn btn--whatsapp" onClick={handleBatchNotify} disabled={processing}
                        style={{ fontSize: '0.78rem', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Send size={14} /> Notificar
                    </button>

                    <button className="btn btn--ghost" onClick={loadData} title="Refrescar"
                        style={{ padding: '8px', borderRadius: 'var(--radius-md)' }}>
                        <RefreshCw size={15} style={{ transition: 'transform 0.3s' }} />
                    </button>
                </div>

                {/* Collapsible Excel Drop Zone */}
                {showExcelZone && (
                    <div
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        style={{
                            marginTop: 'var(--space-3)',
                            padding: dragOver ? 'var(--space-5)' : 'var(--space-3)',
                            background: dragOver ? 'rgba(34,197,94,0.06)' : 'var(--neutral-50)',
                            borderRadius: 'var(--radius-md)',
                            border: `2px dashed ${dragOver ? '#22C55E' : 'var(--neutral-300)'}`,
                            textAlign: 'center', transition: 'all 0.2s',
                            animation: 'fadeIn 0.2s ease-out',
                        }}
                    >
                        {uploading ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary-500)' }} />
                                <span style={{ fontSize: '0.82rem', color: 'var(--neutral-600)' }}>Procesando archivo...</span>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)' }}>
                                <FileSpreadsheet size={22} style={{ color: 'var(--neutral-400)' }} />
                                <div style={{ textAlign: 'left' }}>
                                    <p style={{ fontSize: '0.82rem', color: 'var(--neutral-600)', margin: 0 }}>
                                        Arrastrá un <strong>.xlsx</strong> aquí o{' '}
                                        <label style={{ color: 'var(--primary-500)', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}>
                                            seleccioná un archivo
                                            <input type="file" accept=".xlsx,.xls" onChange={handleExcelSelect} style={{ display: 'none' }} />
                                        </label>
                                    </p>
                                    <p style={{ fontSize: '0.7rem', color: 'var(--neutral-400)', margin: '2px 0 0' }}>
                                        Detección automática de columnas — soporta variaciones de nombres
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Add Form */}
                {showAddForm && (
                    <div style={{ marginTop: 'var(--space-3)', animation: 'fadeIn 0.2s ease-out' }}>
                        <div className="patient-header__fields">
                            {[
                                { key: 'nombre', label: 'Nombre', icon: User, placeholder: 'PÉREZ JUAN' },
                                { key: 'id_paciente', label: 'ID Paciente', icon: FileText, placeholder: '12345' },
                                { key: 'telefono', label: 'Teléfono', icon: Phone, placeholder: '2645551234' },
                                { key: 'obraSocial', label: 'Obra Social', icon: Building2, placeholder: 'OSDE' },
                                { key: 'fechaCirugia', label: 'Fecha Cirugía', icon: Calendar, type: 'date' },
                                { key: 'medico', label: 'Médico', icon: User, placeholder: 'Dr. González' },
                            ].map(field => (
                                <div key={field.key} className="field-group">
                                    <label className="field-label"><field.icon size={14} />{field.label}</label>
                                    <input
                                        type={field.type || 'text'} className="field-input"
                                        placeholder={field.placeholder || ''}
                                        value={newSurgery[field.key]}
                                        onChange={e => setNewSurgery(prev => ({ ...prev, [field.key]: e.target.value }))}
                                    />
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
                            <button className="btn btn--primary" onClick={handleAddSurgery}>Guardar Cirugía</button>
                            <button className="btn btn--ghost" onClick={() => setShowAddForm(false)}>Cancelar</button>
                        </div>
                    </div>
                )}
            </div>

            {/* ==================== SURGERY TABLE — GROUPED BY DATE ==================== */}
            <div className="cart" style={{ overflow: 'hidden' }}>
                <div className="cart__header" style={{ flexDirection: 'column', gap: 'var(--space-3)' }}>
                    <div className="cart__title-group">
                        <div className="cart__icon-badge"><Calendar size={18} /></div>
                        <h3 className="cart__title">
                            {viewMode === 'upcoming' ? 'Cirugías Programadas' : 'Historial de Cirugías'}
                        </h3>
                        <span className="cart__badge">{filtered.length} registro{filtered.length !== 1 ? 's' : ''}</span>
                    </div>

                    {/* View Mode Tabs */}
                    <div style={{ display: 'flex', gap: '2px', background: 'var(--neutral-100)', borderRadius: 'var(--radius-md)', padding: '3px', width: 'fit-content' }}>
                        <button
                            onClick={() => setViewMode('upcoming')}
                            style={{
                                padding: '6px 16px', borderRadius: 'var(--radius-sm)',
                                fontSize: '0.78rem', fontWeight: 600, border: 'none', cursor: 'pointer',
                                background: viewMode === 'upcoming' ? '#fff' : 'transparent',
                                color: viewMode === 'upcoming' ? 'var(--primary-500)' : 'var(--neutral-500)',
                                boxShadow: viewMode === 'upcoming' ? 'var(--shadow-sm)' : 'none',
                                transition: 'all 0.2s',
                                display: 'flex', alignItems: 'center', gap: '5px',
                            }}
                        >
                            <Zap size={13} /> Próximas
                            <span style={{
                                background: viewMode === 'upcoming' ? 'var(--primary-500)' : 'var(--neutral-300)',
                                color: '#fff', padding: '1px 7px', borderRadius: '8px', fontSize: '0.7rem',
                            }}>{viewMode === 'upcoming' ? filtered.length : '⚡'}</span>
                        </button>
                        <button
                            onClick={() => setViewMode('history')}
                            style={{
                                padding: '6px 16px', borderRadius: 'var(--radius-sm)',
                                fontSize: '0.78rem', fontWeight: 600, border: 'none', cursor: 'pointer',
                                background: viewMode === 'history' ? '#fff' : 'transparent',
                                color: viewMode === 'history' ? 'var(--neutral-700)' : 'var(--neutral-500)',
                                boxShadow: viewMode === 'history' ? 'var(--shadow-sm)' : 'none',
                                transition: 'all 0.2s',
                                display: 'flex', alignItems: 'center', gap: '5px',
                            }}
                        >
                            <Clock size={13} /> Historial
                            <span style={{
                                background: viewMode === 'history' ? 'var(--neutral-600)' : 'var(--neutral-300)',
                                color: '#fff', padding: '1px 7px', borderRadius: '8px', fontSize: '0.7rem',
                            }}>{viewMode === 'history' ? filtered.length : '📋'}</span>
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="cart__empty-state">
                        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary-400)' }} />
                        <p style={{ marginTop: '12px' }}>Cargando cirugías...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="cart__empty-state">
                        <Calendar size={48} strokeWidth={1.2} />
                        <h3>Sin cirugías</h3>
                        <p>No hay cirugías que coincidan con el filtro actual.</p>
                    </div>
                ) : (
                    <div className="cart__table-wrapper">
                        <table className="cart__table">
                            <thead>
                                <tr>
                                    <th className="cart__th" style={{ width: '36px' }}></th>
                                    <th className="cart__th" style={{ width: '46px' }}>⏱️</th>
                                    <th className="cart__th">Estado</th>
                                    <th className="cart__th">Paciente</th>
                                    <th className="cart__th">Obra Social</th>
                                    <th className="cart__th">Fecha Cirugía</th>
                                    <th className="cart__th">Faltan</th>
                                    <th className="cart__th">Médico</th>
                                    <th className="cart__th">Teléfono</th>
                                </tr>
                            </thead>
                            <tbody>
                                {groups.map(group => {
                                    const gcd = group.countdown;
                                    return [
                                        /* Date Group Header */
                                        <tr key={`group-${group.date}`}>
                                            <td colSpan={9} style={{
                                                padding: '10px 16px', background: gcd.bg,
                                                borderLeft: `4px solid ${gcd.color}`,
                                                fontWeight: 700, fontSize: '0.82rem', color: gcd.color,
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <Timer size={15} />
                                                        {group.date === '_sin_fecha' ? '📭 Sin fecha asignada' : formatGroupDate(group.date)}
                                                    </span>
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                                                        padding: '3px 10px', borderRadius: 'var(--radius-full)',
                                                        background: gcd.color + '15', fontSize: '0.75rem',
                                                    }}>
                                                        {gcd.icon} {gcd.label} — {group.items.length} cx
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>,
                                        /* Rows */
                                        ...group.items.flatMap(surgery => {
                                            const effectiveStatus = getEffectiveStatus(surgery);
                                            const cfg = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.lila;
                                            const cd = getCountdown(surgery.fecha_cirugia);
                                            const isExpanded = expandedRowId === surgery.id;
                                            const rows = [
                                                <tr key={surgery.id} className="cart__row"
                                                    onClick={() => { setExpandedRowId(isExpanded ? null : surgery.id); setCustomMessage(''); }}
                                                    style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                                                    onMouseOver={e => { if (!isExpanded) e.currentTarget.style.background = 'var(--neutral-50)'; }}
                                                    onMouseOut={e => { if (!isExpanded) e.currentTarget.style.background = ''; }}
                                                >
                                                    {/* Expand Chevron */}
                                                    <td className="cart__td" style={{ textAlign: 'center', padding: '4px' }}>
                                                        <ChevronRight size={14} style={{
                                                            color: 'var(--neutral-400)',
                                                            transition: 'transform 0.2s ease',
                                                            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                                        }} />
                                                    </td>
                                                    {/* Urgency Indicator */}
                                                    <td className="cart__td" style={{ textAlign: 'center', padding: '6px' }}>
                                                        <div style={{
                                                            width: '10px', height: '10px', borderRadius: '50%',
                                                            background: cd.color, margin: '0 auto',
                                                            boxShadow: cd.urgency === 'critical' ? `0 0 8px ${cd.color}80` : 'none',
                                                            animation: cd.urgency === 'critical' ? 'pulse 1.5s ease-in-out infinite' : 'none',
                                                        }} title={cd.label} />
                                                    </td>
                                                    {/* Status */}
                                                    <td className="cart__td">
                                                        <span style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                            padding: '3px 10px', borderRadius: 'var(--radius-full)',
                                                            fontSize: '0.72rem', fontWeight: 600,
                                                            background: cfg.bg, color: cfg.color,
                                                            border: `1px solid ${cfg.color}25`,
                                                        }}>
                                                            {cfg.icon} {cfg.label}
                                                        </span>
                                                    </td>
                                                    {/* Patient */}
                                                    <td className="cart__td" style={{ fontWeight: 600, fontSize: '0.82rem' }}>
                                                        {surgery.nombre}
                                                    </td>
                                                    {/* Obra Social */}
                                                    <td className="cart__td" style={{ fontSize: '0.78rem', color: 'var(--neutral-500)' }}>
                                                        {surgery.obra_social || '—'}
                                                    </td>
                                                    {/* Fecha */}
                                                    <td className="cart__td" style={{ fontWeight: 500, fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                                                        {formatFullDate(surgery.fecha_cirugia)}
                                                    </td>
                                                    {/* Countdown */}
                                                    <td className="cart__td">
                                                        <span style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                            padding: '3px 10px', borderRadius: 'var(--radius-full)',
                                                            fontSize: '0.75rem', fontWeight: 700,
                                                            background: cd.bg, color: cd.color,
                                                            fontFamily: 'monospace', letterSpacing: '-0.3px',
                                                        }}>
                                                            <Clock size={12} /> {cd.label}
                                                        </span>
                                                    </td>
                                                    {/* Médico */}
                                                    <td className="cart__td" style={{ fontSize: '0.78rem' }}>
                                                        {surgery.medico || '—'}
                                                    </td>
                                                    {/* Teléfono + badge chat */}
                                                    <td className="cart__td" style={{ fontSize: '0.78rem' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            {surgery.telefono ? (
                                                                surgery.telefono.startsWith('549') ? (
                                                                    <span style={{ fontFamily: 'monospace', color: 'var(--neutral-700)' }}>
                                                                        {surgery.telefono}
                                                                    </span>
                                                                ) : (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                        <span style={{ fontFamily: 'monospace', color: '#DC2626' }}>
                                                                            {surgery.telefono}
                                                                        </span>
                                                                        <span style={{
                                                                            display: 'inline-flex', alignItems: 'center', gap: '3px',
                                                                            padding: '1px 6px', borderRadius: '4px',
                                                                            background: '#FEE2E2', color: '#DC2626',
                                                                            fontSize: '0.6rem', fontWeight: 700,
                                                                            border: '1px solid #FECACA',
                                                                        }}>
                                                                            ⚠️ TEL INVÁLIDO
                                                                        </span>
                                                                    </div>
                                                                )
                                                            ) : (
                                                                <span style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: '3px',
                                                                    padding: '1px 6px', borderRadius: '4px',
                                                                    background: '#FEF3C7', color: '#92400E',
                                                                    fontSize: '0.65rem', fontWeight: 600,
                                                                }}>
                                                                    📵 SIN TELÉFONO
                                                                </span>
                                                            )}
                                                            {/* Badge de mensajes no leídos */}
                                                            {(() => {
                                                                const norm = surgery.telefono ? normalizeArgentinePhone(surgery.telefono) : '';
                                                                const count = norm ? (unreadCounts[norm] || 0) : 0;
                                                                return count > 0 ? (
                                                                    <span style={{
                                                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                                        minWidth: '20px', height: '20px', padding: '0 5px',
                                                                        borderRadius: '10px', background: '#EF4444', color: '#fff',
                                                                        fontSize: '0.65rem', fontWeight: 800,
                                                                        animation: 'pulse 2s infinite',
                                                                        boxShadow: '0 0 6px rgba(239,68,68,0.4)',
                                                                    }}>
                                                                        {count}
                                                                    </span>
                                                                ) : null;
                                                            })()}
                                                        </div>
                                                    </td>
                                                </tr>,
                                            ];
                                            /* ===== EXPANDED DETAIL ROW ===== */
                                            if (isExpanded) {
                                                const statusActions = getStatusActions(surgery);
                                                const resultActions = getResultActions(surgery);
                                                rows.push(
                                                    <tr key={`${surgery.id}-detail`}>
                                                        <td colSpan={9} style={{
                                                            padding: 0, background: 'var(--neutral-50)',
                                                            borderLeft: `4px solid ${cfg.color}`,
                                                            animation: 'fadeIn 0.2s ease-out',
                                                        }}>
                                                            <div style={{
                                                                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                                                                gap: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)',
                                                            }}>
                                                                {/* COL 1: Info + Status Actions */}
                                                                <div>
                                                                    <h4 style={{ margin: '0 0 10px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-400)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                                        📋 Estado del Proceso
                                                                    </h4>
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                        {statusActions.map((act, i) => (
                                                                            <button key={i} onClick={(e) => { e.stopPropagation(); act.action(); }} disabled={processing}
                                                                                style={{
                                                                                    display: 'flex', alignItems: 'center', gap: '8px',
                                                                                    padding: '8px 14px', borderRadius: 'var(--radius-md)',
                                                                                    background: '#fff', color: act.color,
                                                                                    fontSize: '0.78rem', fontWeight: 600,
                                                                                    border: `1.5px solid ${act.color}30`, cursor: 'pointer',
                                                                                    transition: 'all 0.15s', textAlign: 'left',
                                                                                }}
                                                                                onMouseOver={e => { e.currentTarget.style.background = act.color + '10'; e.currentTarget.style.borderColor = act.color; }}
                                                                                onMouseOut={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = act.color + '30'; }}
                                                                            >
                                                                                <act.icon size={15} /> {act.label}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                    {/* Resultado */}
                                                                    <h4 style={{ margin: '14px 0 8px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-400)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                                        ✅ Resultado
                                                                    </h4>
                                                                    <div style={{ display: 'flex', gap: '6px' }}>
                                                                        {resultActions.map((act, i) => (
                                                                            <button key={i} onClick={(e) => { e.stopPropagation(); act.action(); }} disabled={processing}
                                                                                style={{
                                                                                    display: 'flex', alignItems: 'center', gap: '6px',
                                                                                    padding: '7px 14px', borderRadius: 'var(--radius-md)',
                                                                                    background: '#fff', color: act.color,
                                                                                    fontSize: '0.78rem', fontWeight: 600,
                                                                                    border: `1.5px solid ${act.color}30`, cursor: 'pointer',
                                                                                    transition: 'all 0.15s',
                                                                                }}
                                                                                onMouseOver={e => { e.currentTarget.style.background = act.color + '10'; e.currentTarget.style.borderColor = act.color; }}
                                                                                onMouseOut={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = act.color + '30'; }}
                                                                            >
                                                                                <act.icon size={14} /> {act.label}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                    {/* Gestión */}
                                                                    <h4 style={{ margin: '14px 0 8px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-400)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                                        ⚙️ Gestión
                                                                    </h4>
                                                                    <div style={{ display: 'flex', gap: '6px' }}>
                                                                        <button onClick={(e) => { e.stopPropagation(); handleOpenEdit(surgery); }} disabled={processing}
                                                                            style={{
                                                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                                                padding: '7px 14px', borderRadius: 'var(--radius-md)',
                                                                                background: '#fff', color: '#6366F1',
                                                                                fontSize: '0.78rem', fontWeight: 600,
                                                                                border: '1.5px solid #6366F130', cursor: 'pointer',
                                                                                transition: 'all 0.15s',
                                                                            }}
                                                                            onMouseOver={e => { e.currentTarget.style.background = '#6366F110'; e.currentTarget.style.borderColor = '#6366F1'; }}
                                                                            onMouseOut={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#6366F130'; }}
                                                                        >
                                                                            <Pencil size={14} /> Editar
                                                                        </button>
                                                                        <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(surgery.id); }} disabled={processing}
                                                                            style={{
                                                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                                                padding: '7px 14px', borderRadius: 'var(--radius-md)',
                                                                                background: '#fff', color: '#EF4444',
                                                                                fontSize: '0.78rem', fontWeight: 600,
                                                                                border: '1.5px solid #EF444430', cursor: 'pointer',
                                                                                transition: 'all 0.15s',
                                                                            }}
                                                                            onMouseOver={e => { e.currentTarget.style.background = '#EF444410'; e.currentTarget.style.borderColor = '#EF4444'; }}
                                                                            onMouseOut={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#EF444430'; }}
                                                                        >
                                                                            <Trash2 size={14} /> Borrar
                                                                        </button>
                                                                    </div>
                                                                </div>

                                                                {/* COL 2: Datos adicionales */}
                                                                <div>
                                                                    <h4 style={{ margin: '0 0 10px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-400)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                                        📄 Datos Adicionales
                                                                    </h4>
                                                                    <div style={{
                                                                        background: '#fff', borderRadius: 'var(--radius-md)',
                                                                        border: '1px solid var(--neutral-200)', padding: 'var(--space-3)',
                                                                        fontSize: '0.78rem',
                                                                    }}>
                                                                        {[
                                                                            { label: 'ID Paciente', value: surgery.id_paciente },
                                                                            { label: 'Módulo', value: surgery.modulo },
                                                                            { label: 'Notas', value: surgery.notas },
                                                                            { label: 'Operador', value: surgery.operador },
                                                                            { label: 'Creado', value: surgery.created_at ? new Date(surgery.created_at).toLocaleDateString('es-AR') : null },
                                                                        ].map(({ label, value }) => (
                                                                            <div key={label} style={{
                                                                                display: 'flex', justifyContent: 'space-between',
                                                                                padding: '5px 0', borderBottom: '1px solid var(--neutral-100)',
                                                                            }}>
                                                                                <span style={{ color: 'var(--neutral-400)', fontWeight: 500 }}>{label}</span>
                                                                                <span style={{ fontWeight: 600, color: 'var(--neutral-700)' }}>{value || '—'}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                    {/* Event history */}
                                                                    {surgery.surgery_events?.length > 0 && (
                                                                        <>
                                                                            <h4 style={{ margin: '14px 0 8px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-400)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                                                📜 Historial
                                                                            </h4>
                                                                            <div style={{ maxHeight: '120px', overflow: 'auto', background: '#fff', borderRadius: 'var(--radius-md)', border: '1px solid var(--neutral-200)', padding: '6px' }}>
                                                                                {surgery.surgery_events.slice().reverse().map((evt, i) => (
                                                                                    <div key={i} style={{ padding: '4px 6px', fontSize: '0.7rem', borderBottom: '1px solid var(--neutral-50)' }}>
                                                                                        <span style={{ color: 'var(--neutral-400)', fontFamily: 'monospace', marginRight: '6px' }}>
                                                                                            {new Date(evt.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                                                        </span>
                                                                                        <span style={{ color: 'var(--neutral-600)' }}>{evt.details}</span>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </>
                                                                    )}
                                                                </div>

                                                                {/* COL 3: Mensaje + Chat */}
                                                                <div>
                                                                    <h4 style={{ margin: '0 0 10px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-400)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                        <MessageSquare size={13} /> Comunicación
                                                                    </h4>

                                                                    {/* Botón Ir al Chat */}
                                                                    {surgery.telefono && (
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); openChat(surgery); }}
                                                                            style={{
                                                                                width: '100%', padding: '12px 16px',
                                                                                borderRadius: 'var(--radius-md)',
                                                                                background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                                                                                color: '#fff', fontSize: '0.85rem', fontWeight: 700,
                                                                                border: 'none', cursor: 'pointer',
                                                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                                                                                transition: 'all 0.2s', position: 'relative',
                                                                                boxShadow: '0 3px 12px rgba(37,211,102,0.3)',
                                                                            }}
                                                                            onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(37,211,102,0.4)'; }}
                                                                            onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 3px 12px rgba(37,211,102,0.3)'; }}
                                                                        >
                                                                            <MessageSquare size={18} />
                                                                            💬 Ir al Chat
                                                                            {(() => {
                                                                                const norm = normalizeArgentinePhone(surgery.telefono);
                                                                                const count = norm ? (unreadCounts[norm] || 0) : 0;
                                                                                return count > 0 ? (
                                                                                    <span style={{
                                                                                        position: 'absolute', top: '-6px', right: '-6px',
                                                                                        minWidth: '22px', height: '22px', padding: '0 6px',
                                                                                        borderRadius: '11px', background: '#EF4444', color: '#fff',
                                                                                        fontSize: '0.7rem', fontWeight: 800,
                                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                                        animation: 'pulse 2s infinite',
                                                                                        boxShadow: '0 0 8px rgba(239,68,68,0.5)',
                                                                                        border: '2px solid #fff',
                                                                                    }}>
                                                                                        {count}
                                                                                    </span>
                                                                                ) : null;
                                                                            })()}
                                                                        </button>
                                                                    )}

                                                                    {/* Envío rápido */}
                                                                    <div style={{
                                                                        background: '#fff', borderRadius: 'var(--radius-md)',
                                                                        border: '1px solid var(--neutral-200)', padding: 'var(--space-3)',
                                                                        marginTop: '10px',
                                                                    }}>
                                                                        <div style={{ fontSize: '0.72rem', color: 'var(--neutral-400)', marginBottom: '8px' }}>
                                                                            Envío rápido a <strong style={{ color: 'var(--neutral-700)' }}>{surgery.nombre}</strong>
                                                                        </div>
                                                                        <textarea
                                                                            value={customMessage}
                                                                            onChange={e => setCustomMessage(e.target.value)}
                                                                            onClick={e => e.stopPropagation()}
                                                                            placeholder="Mensaje rápido..."
                                                                            style={{
                                                                                width: '100%', minHeight: '60px', padding: '10px',
                                                                                borderRadius: 'var(--radius-md)',
                                                                                border: '1.5px solid var(--neutral-200)',
                                                                                fontSize: '0.82rem', fontFamily: 'inherit',
                                                                                resize: 'vertical', outline: 'none',
                                                                                transition: 'border-color 0.2s',
                                                                            }}
                                                                            onFocus={e => e.target.style.borderColor = '#22C55E'}
                                                                            onBlur={e => e.target.style.borderColor = 'var(--neutral-200)'}
                                                                        />
                                                                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                                                                            <button
                                                                                onClick={(e) => { e.stopPropagation(); handleSendCustomMessage(surgery); }}
                                                                                disabled={!customMessage.trim() || !surgery.telefono || sendingMessage}
                                                                                style={{
                                                                                    display: 'flex', alignItems: 'center', gap: '6px',
                                                                                    padding: '8px 16px', borderRadius: 'var(--radius-md)',
                                                                                    background: (!customMessage.trim() || !surgery.telefono) ? 'var(--neutral-200)' : '#25D366',
                                                                                    color: (!customMessage.trim() || !surgery.telefono) ? 'var(--neutral-400)' : '#fff',
                                                                                    fontSize: '0.78rem', fontWeight: 700,
                                                                                    border: 'none', cursor: (!customMessage.trim() || !surgery.telefono) ? 'not-allowed' : 'pointer',
                                                                                    transition: 'all 0.15s',
                                                                                }}
                                                                            >
                                                                                {sendingMessage ? (
                                                                                    <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Enviando...</>
                                                                                ) : (
                                                                                    <><Send size={14} /> Enviar</>
                                                                                )}
                                                                            </button>
                                                                        </div>
                                                                        {!surgery.telefono && (
                                                                            <p style={{ margin: '6px 0 0', fontSize: '0.7rem', color: '#DC2626', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                <AlertCircle size={11} /> Sin teléfono — no se puede enviar
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            }
                                            return rows;
                                        }),
                                    ];
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ==================== DELETE CONFIRMATION ==================== */}
            {deleteConfirmId && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 10000,
                    background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 'var(--space-4)', animation: 'fadeIn 0.15s ease-out',
                }} onClick={() => setDeleteConfirmId(null)}>
                    <div onClick={e => e.stopPropagation()} style={{
                        background: '#fff', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)',
                        maxWidth: '420px', width: '100%', textAlign: 'center',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)',
                        animation: 'scaleIn 0.2s ease-out',
                    }}>
                        <div style={{
                            width: '56px', height: '56px', borderRadius: '50%',
                            background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto var(--space-4)',
                        }}>
                            <Trash2 size={24} style={{ color: '#DC2626' }} />
                        </div>
                        <h3 style={{ margin: '0 0 8px', fontSize: '1.05rem', fontWeight: 700 }}>¿Eliminar cirugía?</h3>
                        <p style={{ margin: '0 0 var(--space-5)', fontSize: '0.85rem', color: 'var(--neutral-500)' }}>
                            Esta acción es irreversible. Se eliminarán también todos los eventos asociados.
                        </p>
                        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' }}>
                            <button className="btn btn--ghost" onClick={() => setDeleteConfirmId(null)}>Cancelar</button>
                            <button
                                className="btn" onClick={() => handleDeleteSurgery(deleteConfirmId)} disabled={processing}
                                style={{
                                    background: '#DC2626', color: '#fff', border: 'none',
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                }}
                            >
                                <Trash2 size={14} /> Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ==================== EDIT SURGERY MODAL ==================== */}
            {editModalOpen && editSurgery && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 10000,
                    background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 'var(--space-4)', animation: 'fadeIn 0.2s ease-out',
                }} onClick={() => { setEditModalOpen(false); setEditSurgery(null); }}>
                    <div onClick={e => e.stopPropagation()} style={{
                        background: '#fff', borderRadius: 'var(--radius-xl)',
                        width: '100%', maxWidth: '640px', overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)',
                        animation: 'scaleIn 0.2s ease-out',
                    }}>
                        {/* Header */}
                        <div style={{
                            padding: 'var(--space-4) var(--space-6)',
                            borderBottom: '1px solid var(--neutral-200)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Pencil size={18} style={{ color: '#6366F1' }} />
                                Editar Cirugía
                            </h3>
                            <button onClick={() => { setEditModalOpen(false); setEditSurgery(null); }} style={{
                                background: 'var(--neutral-100)', border: 'none', cursor: 'pointer',
                                padding: '8px', borderRadius: 'var(--radius-md)', color: 'var(--neutral-500)',
                            }}>
                                <X size={18} />
                            </button>
                        </div>
                        {/* Fields */}
                        <div style={{ padding: 'var(--space-5) var(--space-6)' }}>
                            <div className="patient-header__fields">
                                {[
                                    { key: 'nombre', label: 'Nombre', icon: User, placeholder: 'PÉREZ JUAN' },
                                    { key: 'id_paciente', label: 'ID Paciente', icon: FileText, placeholder: '12345' },
                                    { key: 'telefono', label: 'Teléfono', icon: Phone, placeholder: '2645551234' },
                                    { key: 'obra_social', label: 'Obra Social', icon: Building2, placeholder: 'OSDE' },
                                    { key: 'fecha_cirugia', label: 'Fecha Cirugía', icon: Calendar, type: 'date' },
                                    { key: 'medico', label: 'Médico', icon: User, placeholder: 'Dr. González' },
                                    { key: 'modulo', label: 'Módulo', icon: FileText, placeholder: 'Cirugía General' },
                                ].map(field => (
                                    <div key={field.key} className="field-group">
                                        <label className="field-label"><field.icon size={14} />{field.label}</label>
                                        <input
                                            type={field.type || 'text'} className="field-input"
                                            placeholder={field.placeholder || ''}
                                            value={editSurgery[field.key]}
                                            onChange={e => setEditSurgery(prev => ({ ...prev, [field.key]: e.target.value }))}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                        {/* Footer */}
                        <div style={{
                            padding: 'var(--space-3) var(--space-6)',
                            borderTop: '1px solid var(--neutral-200)',
                            display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)',
                            background: 'var(--neutral-50)',
                        }}>
                            <button className="btn btn--ghost" onClick={() => { setEditModalOpen(false); setEditSurgery(null); }}>Cancelar</button>
                            <button className="btn btn--primary" onClick={handleSaveEdit} disabled={processing}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                {processing ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={15} />}
                                Guardar Cambios
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ==================== EXCEL PREVIEW MODAL ==================== */}
            {showUpload && excelPreview && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 'var(--space-4)', animation: 'fadeIn 0.2s ease-out',
                }} onClick={handleCloseUpload}>
                    <div onClick={e => e.stopPropagation()} style={{
                        background: '#fff', borderRadius: 'var(--radius-xl)',
                        width: '100%', maxWidth: '960px', maxHeight: '88vh',
                        display: 'flex', flexDirection: 'column', overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)',
                        animation: 'scaleIn 0.2s ease-out',
                    }}>
                        {/* Modal Header */}
                        <div style={{
                            padding: 'var(--space-4) var(--space-6)',
                            borderBottom: '1px solid var(--neutral-200)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <FileSpreadsheet size={20} style={{ color: '#22C55E' }} />
                                    Preview de Carga Excel
                                </h3>
                                <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: 'var(--neutral-500)' }}>
                                    {excelPreview.fileName} — {excelPreview.totalRows} filas leídas
                                </p>
                            </div>
                            <button onClick={handleCloseUpload} style={{
                                background: 'var(--neutral-100)', border: 'none', cursor: 'pointer',
                                padding: '8px', borderRadius: 'var(--radius-md)', color: 'var(--neutral-500)',
                                transition: 'all 0.15s',
                            }} onMouseOver={e => e.currentTarget.style.background = 'var(--neutral-200)'}
                                onMouseOut={e => e.currentTarget.style.background = 'var(--neutral-100)'}>
                                <X size={18} />
                            </button>
                        </div>

                        {/* Column Mapping */}
                        {excelPreview.columnMapping && (
                            <div style={{
                                padding: 'var(--space-2) var(--space-6)',
                                borderBottom: '1px solid var(--neutral-100)',
                                background: 'var(--neutral-50)',
                                display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center',
                            }}>
                                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--neutral-400)', marginRight: '4px' }}>
                                    🔗 Mapeo:
                                </span>
                                {Object.entries(excelPreview.columnMapping).map(([field, col]) => (
                                    <span key={field} style={{
                                        fontSize: '0.67rem', padding: '2px 7px', borderRadius: '8px',
                                        background: '#DBEAFE', color: '#1E40AF', fontWeight: 500,
                                    }}>
                                        {field}→<strong>{col}</strong>
                                    </span>
                                ))}
                                {excelPreview.unmappedColumns?.length > 0 && (
                                    <span style={{
                                        fontSize: '0.67rem', padding: '2px 7px', borderRadius: '8px',
                                        background: '#FEF3C7', color: '#92400E',
                                    }}>
                                        ⚠ Sin mapear: {excelPreview.unmappedColumns.join(', ')}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Stats Summary */}
                        <div style={{
                            padding: 'var(--space-3) var(--space-6)',
                            display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap',
                            borderBottom: '1px solid var(--neutral-100)',
                        }}>
                            {[
                                { label: 'VÁLIDOS', value: excelPreview.validation.valid.length, bg: '#F0FDF4', border: '#BBF7D0', color: '#166534' },
                                { label: 'CON ERRORES', value: excelPreview.validation.invalid.length, bg: '#FEF2F2', border: '#FECACA', color: '#991B1B' },
                                { label: 'TEL ✓', value: excelPreview.phoneSummary?.valid || 0, bg: '#EFF6FF', border: '#BFDBFE', color: '#1E40AF' },
                                { label: 'TEL ✗', value: excelPreview.phoneSummary?.invalid || 0, bg: '#FFFBEB', border: '#FDE68A', color: '#92400E' },
                            ].map(stat => (
                                <div key={stat.label} style={{
                                    flex: 1, minWidth: '100px', padding: 'var(--space-2) var(--space-3)',
                                    background: stat.bg, borderRadius: 'var(--radius-md)',
                                    border: `1px solid ${stat.border}`, textAlign: 'center',
                                }}>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: stat.color, letterSpacing: '0.5px' }}>
                                        {stat.label}
                                    </div>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: stat.color }}>
                                        {stat.value}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Area Code */}
                        <div style={{
                            padding: 'var(--space-2) var(--space-6)',
                            display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                            borderBottom: '1px solid var(--neutral-100)',
                            background: '#FAFBFF',
                        }}>
                            <Phone size={14} style={{ color: 'var(--primary-500)' }} />
                            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--neutral-600)' }}>
                                Código de área:
                            </span>
                            <input
                                type="text" value={areaCode}
                                onChange={e => handleAreaCodeChange(e.target.value.replace(/\D/g, ''))}
                                style={{
                                    width: '70px', padding: '4px 10px', borderRadius: 'var(--radius-md)',
                                    border: '1.5px solid var(--neutral-300)', fontSize: '0.85rem',
                                    fontWeight: 700, fontFamily: 'monospace', textAlign: 'center',
                                }}
                                maxLength={4} placeholder="264"
                            />
                            <span style={{ fontSize: '0.72rem', color: 'var(--neutral-400)' }}>
                                Para números con 15 sin código
                            </span>
                        </div>

                        {/* Preview Table */}
                        <div style={{ flex: 1, overflow: 'auto', padding: '0 var(--space-6)' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                                <thead>
                                    <tr style={{ background: 'var(--neutral-50)', position: 'sticky', top: 0, zIndex: 1 }}>
                                        {['#', 'Paciente', 'Fecha Cx', 'OS', 'Tel. Original', 'Tel. Normalizado', 'Estado'].map(h => (
                                            <th key={h} style={{
                                                padding: '8px 10px', textAlign: 'left', fontWeight: 700,
                                                color: 'var(--neutral-500)', borderBottom: '2px solid var(--neutral-200)',
                                                fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.3px',
                                            }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {excelPreview.records.map((rec, idx) => (
                                        <tr key={idx} style={{
                                            borderBottom: '1px solid var(--neutral-100)',
                                            background: !rec._telefono_valido ? '#FEF2F2' : idx % 2 ? 'var(--neutral-50)' : '#fff',
                                        }}>
                                            <td style={{ padding: '6px 10px', color: 'var(--neutral-400)', fontFamily: 'monospace', fontSize: '0.72rem' }}>{rec._rowIndex}</td>
                                            <td style={{ padding: '6px 10px', fontWeight: 600 }}>{rec.nombre}</td>
                                            <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: '0.74rem' }}>{rec.fecha_cirugia}</td>
                                            <td style={{ padding: '6px 10px', fontSize: '0.74rem', color: 'var(--neutral-500)' }}>{rec.obra_social || '—'}</td>
                                            <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: 'var(--neutral-500)', fontSize: '0.74rem' }}>{rec._telefono_original}</td>
                                            <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 600, fontSize: '0.74rem' }}>
                                                {rec._telefono_valido ? (
                                                    <span style={{ color: '#15803D' }}>{rec._telefono_normalizado}</span>
                                                ) : (
                                                    <span style={{ color: '#DC2626' }}>—</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '6px 10px' }}>
                                                {rec._telefono_valido ? (
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '3px',
                                                        padding: '2px 7px', borderRadius: '10px', fontSize: '0.65rem',
                                                        background: '#DCFCE7', color: '#166534', fontWeight: 600,
                                                    }}>
                                                        <CheckCircle2 size={10} /> OK
                                                    </span>
                                                ) : (
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '3px',
                                                        padding: '2px 7px', borderRadius: '10px', fontSize: '0.65rem',
                                                        background: '#FEE2E2', color: '#991B1B', fontWeight: 600,
                                                    }}>
                                                        <AlertCircle size={10} /> {rec._telefono_nota}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* Validation Errors */}
                            {excelPreview.validation.invalid.length > 0 && (
                                <div style={{
                                    margin: 'var(--space-3) 0', padding: 'var(--space-3)',
                                    background: '#FEF2F2', borderRadius: 'var(--radius-md)',
                                    border: '1px solid #FECACA',
                                }}>
                                    <h4 style={{ margin: '0 0 6px', fontSize: '0.82rem', color: '#991B1B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <AlertCircle size={14} /> Filas con errores (no se cargarán):
                                    </h4>
                                    <div style={{ maxHeight: '120px', overflow: 'auto' }}>
                                        <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.74rem', color: '#B91C1C' }}>
                                            {excelPreview.validation.errors.slice(0, 20).map((err, i) => (
                                                <li key={i}>{err}</li>
                                            ))}
                                            {excelPreview.validation.errors.length > 20 && (
                                                <li style={{ fontStyle: 'italic' }}>...y {excelPreview.validation.errors.length - 20} más</li>
                                            )}
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Upload Result */}
                        {uploadResult && (
                            <div style={{
                                padding: 'var(--space-3) var(--space-6)',
                                borderTop: '1px solid var(--neutral-200)',
                                background: '#F0FDF4',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontWeight: 600, color: '#166534' }}>
                                    <CheckCircle2 size={16} />
                                    Carga completada:
                                    <span style={{ background: '#DCFCE7', padding: '2px 10px', borderRadius: '10px' }}>
                                        {uploadResult.inserted} nuevos
                                    </span>
                                    <span style={{ background: '#DBEAFE', padding: '2px 10px', borderRadius: '10px', color: '#1D4ED8' }}>
                                        {uploadResult.updated} actualizados
                                    </span>
                                    {uploadResult.skipped > 0 && (
                                        <span style={{ background: '#FEE2E2', padding: '2px 10px', borderRadius: '10px', color: '#991B1B' }}>
                                            {uploadResult.skipped} omitidos
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Modal Footer */}
                        <div style={{
                            padding: 'var(--space-3) var(--space-6)',
                            borderTop: '1px solid var(--neutral-200)',
                            display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)',
                            background: 'var(--neutral-50)',
                        }}>
                            <button className="btn btn--ghost" onClick={handleCloseUpload}>
                                {uploadResult ? 'Cerrar' : 'Cancelar'}
                            </button>
                            {!uploadResult && (
                                <>
                                    {/* Progress bar during upload */}
                                    {uploadProgress && (
                                        <div style={{ flex: 1, minWidth: '200px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--neutral-700)' }}>
                                                    {uploadProgress.current} / {uploadProgress.total} registros
                                                </span>
                                                <span style={{ fontSize: '0.7rem', color: 'var(--neutral-500)' }}>
                                                    {Math.round((uploadProgress.current / uploadProgress.total) * 100)}%
                                                </span>
                                            </div>
                                            <div style={{ width: '100%', height: '8px', background: 'var(--neutral-200)', borderRadius: '4px', overflow: 'hidden' }}>
                                                <div style={{
                                                    width: `${(uploadProgress.current / uploadProgress.total) * 100}%`,
                                                    height: '100%', borderRadius: '4px',
                                                    background: 'linear-gradient(90deg, #3B82F6, #22C55E)',
                                                    transition: 'width 0.15s ease',
                                                }} />
                                            </div>
                                            {uploadProgress.results && (
                                                <div style={{ fontSize: '0.7rem', color: 'var(--neutral-500)', marginTop: '3px', display: 'flex', gap: '10px' }}>
                                                    <span>✅ {uploadProgress.results.inserted} nuevos</span>
                                                    <span>🔄 {uploadProgress.results.updated} actualizados</span>
                                                    {uploadProgress.results.skipped > 0 && <span>⚠️ {uploadProgress.results.skipped} omitidos</span>}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <button
                                        className="btn btn--primary"
                                        onClick={handleConfirmUpload}
                                        disabled={uploading || excelPreview.validation.valid.length === 0}
                                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                                    >
                                        {uploading ? (
                                            <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Cargando...</>
                                        ) : (
                                            <><Upload size={15} /> Cargar {excelPreview.validation.valid.length} registros</>
                                        )}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {/* ==================== CHAT WINDOW ==================== */}
            <ChatWindow
                open={chatOpen}
                onClose={() => setChatOpen(false)}
                patientName={chatPatient.name}
                patientPhone={chatPatient.phone}
                addToast={addToast}
            />
        </div>
    );
}
