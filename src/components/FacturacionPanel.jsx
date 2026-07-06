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
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    Search, RefreshCw, ChevronRight, ChevronLeft, ChevronDown, Clock, Calendar,
    Filter, X, Loader2, FileText, User, Building2,
    Stethoscope, Download, AlertTriangle, CheckCircle2, Receipt,
    ListFilter, ChevronUp, ShoppingCart, Trash2, Printer, PackageCheck, Undo2,
} from 'lucide-react';
import {
    fetchAltasFacturacion, updateEstadoFac, updateResponsableFac,
    fetchFacturacionDetalle, FACTURACION_ESTADOS,
    marcarParaDevolucion, quitarDeCarritoDevolucion, fetchCarritoDevolucion,
    generarDevolucion, fetchDevoluciones, fetchDevolucionDetalle,
    cerrarPeriodoFacturacion, reabrirPeriodoFacturacion,
} from '../services/altasService';
import { fetchAsignaciones, matchAsignacion } from '../services/asignacionService';
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

    // ── Criterios de asignación (para columna Resp. ADM) ──
    const [criterios, setCriterios] = useState([]);

    // Dropdowns
    const [estadoDropdownId, setEstadoDropdownId] = useState(null);
    const [responsableDropdownId, setResponsableDropdownId] = useState(null);
    const [dropdownAnchor, setDropdownAnchor] = useState(null);

    // ── Selector de Mes (reemplaza inputs de fecha manuales) ──
    const nowRef = useRef(new Date());
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const monthScrollRef = useRef(null);

    // Derivar fromDate/toDate del mes seleccionado
    const fromDate = useMemo(() => `${selectedMonth}-01`, [selectedMonth]);
    const toDate = useMemo(() => {
        const [y, m] = selectedMonth.split('-').map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        return `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
    }, [selectedMonth]);

    // Generar lista de meses (desde Abril 2026 hasta mes actual)
    const monthOptions = useMemo(() => {
        const months = [];
        const now = nowRef.current;
        const start = new Date(2026, 3, 1); // Abril 2026
        const end = new Date(now.getFullYear(), now.getMonth(), 1);
        const d = new Date(start);
        while (d <= end) {
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '');
            const fullLabel = `${label.charAt(0).toUpperCase() + label.slice(1)} ${d.getFullYear()}`;
            const isCurrent = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
            months.push({ key, fullLabel, isCurrent });
            d.setMonth(d.getMonth() + 1);
        }
        return months;
    }, []);

    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [filterEstado, setFilterEstado] = useState('all');
    const [filterResponsable, setFilterResponsable] = useState('all');

    // ── Paginación ──
    const PAGE_SIZE = 100;
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setDebouncedHistorialSearch(historialSearch);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm, historialSearch]);


    const [columnFilters, setColumnFilters] = useState({});
    const [activeFilterCol, setActiveFilterCol] = useState(null);
    const [filterSearch, setFilterSearch] = useState('');

    // Reset página al cambiar filtros
    useEffect(() => {
        setCurrentPage(1);
    }, [selectedMonth, debouncedSearch, filterEstado, filterResponsable, columnFilters]);

    const toggleColumnFilter = (col) => {
        setActiveFilterCol(prev => prev === col ? null : col);
        setFilterSearch('');
    };

    const setFilterValues = (col, values) => {
        setColumnFilters(prev => {
            const next = { ...prev };
            if (!values || values.size === 0) delete next[col];
            else next[col] = values;
            return next;
        });
    };

    const toggleFilterValue = (col, value) => {
        setColumnFilters(prev => {
            const current = prev[col] ? new Set(prev[col]) : new Set();
            if (current.has(value)) current.delete(value);
            else current.add(value);
            const next = { ...prev };
            if (current.size === 0) delete next[col];
            else next[col] = current;
            return next;
        });
    };

    const clearColumnFilter = (col) => {
        setColumnFilters(prev => {
            const next = { ...prev };
            delete next[col];
            return next;
        });
        setActiveFilterCol(null);
    };

    const clearAllColumnFilters = () => {
        setColumnFilters({});
        setActiveFilterCol(null);
    };

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
    const [carritoSearch, setCarritoSearch] = useState('');
    const [historialSearch, setHistorialSearch] = useState('');
    const [debouncedHistorialSearch, setDebouncedHistorialSearch] = useState('');

    const filteredCarritoDev = useMemo(() => {
        if (!carritoSearch) return carritoDevItems;
        const lower = carritoSearch.toLowerCase();
        return carritoDevItems.filter(i => 
            (i.paciente || '').toLowerCase().includes(lower) ||
            (i.doctor || '').toLowerCase().includes(lower) ||
            (i.cliente || '').toLowerCase().includes(lower)
        );
    }, [carritoDevItems, carritoSearch]);

    const filteredDevolucionDetalle = useMemo(() => {
        const items = devolucionDetalle[expandedDevolucion] || [];
        if (!debouncedHistorialSearch) return items;
        const lower = debouncedHistorialSearch.toLowerCase();
        return items.filter(i => 
            (i.paciente || '').toLowerCase().includes(lower) ||
            (i.doctor || '').toLowerCase().includes(lower) ||
            (i.cliente || '').toLowerCase().includes(lower)
        );
    }, [devolucionDetalle, expandedDevolucion, debouncedHistorialSearch]);

    // ── Carga criterios de asignación (para Resp. ADM) ──
    useEffect(() => {
        fetchAsignaciones()
            .then(data => setCriterios(data))
            .catch(err => console.warn('[FacturacionPanel] Error cargando criterios:', err));
    }, []);

    // ── Carga de datos ──
    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const data = await fetchAltasFacturacion({
                fromDate,
                toDate: toDate || undefined,
                search: searchTerm,
            });
            // Normalizar: mapear usuario_facturo de SALUS al responsable y estado
            const normalized = data.map(a => {
                let updates = {};
                // Si SALUS tiene usuario_facturo y no hay responsable_fac manual, usarlo
                if (a.usuario_facturo && !a.responsable_fac) {
                    updates.responsable_fac = a.usuario_facturo;
                }
                // Si SALUS marcó facturada=true y estado aún es Pendiente, actualizar
                if (a.facturada && (!a.estado_fac || a.estado_fac === 'Pendiente')) {
                    updates.estado_fac = 'Facturada';
                }
                return Object.keys(updates).length > 0 ? { ...a, ...updates } : a;
            });
            setAltas(normalized);
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
            const data = await fetchCarritoDevolucion(currentUser?.usuario);
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
            const data = await fetchDevoluciones({ search: debouncedHistorialSearch || undefined });
            setDevoluciones(data);
        } catch (err) {
            addToast?.('Error al cargar historial: ' + err.message, 'error');
        } finally {
            setDevolucionesLoading(false);
        }
    }, [debouncedHistorialSearch, addToast]);

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
            await marcarParaDevolucion([...selectedIds], currentUser?.usuario);
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

    // ── Filtrado con chequeo filter + enriquecimiento ──
    const { preFilteredAltas, chequeosExcluidos, duplicatePatients } = useMemo(() => {
        // 1) Excluir chequeos (misma lógica que AltasPanel)
        let chequeosCount = 0;
        let result = altas.filter(alta => {
            const doc = (alta.doctor || '').toLowerCase().trim();
            if (doc.includes('qsoft') || (doc.includes('profesional') && doc.includes('chequeo'))) {
                chequeosCount++;
                return false;
            }
            return true;
        });

        // 2) Detectar duplicados: pacientes con múltiples admisiones en el rango
        //    Agrupamos por paciente + fecha_ingreso:
        //    - Mismo paciente, MISMA fecha_ingreso → fusión
        //    - Mismo paciente, DIFERENTE fecha_ingreso → filas separadas, resaltadas
        const patientMap = new Map();
        for (const alta of result) {
            const key = (alta.paciente || '').trim().toUpperCase();
            if (!key) continue;
            if (!patientMap.has(key)) patientMap.set(key, []);
            patientMap.get(key).push(alta);
        }

        const dupPatients = new Map();
        const siblingPatients = new Set();

        for (const [name, entries] of patientMap) {
            const byDate = new Map();
            for (const e of entries) {
                const dateKey = e.fecha_ingreso || 'sin-fecha';
                if (!byDate.has(dateKey)) byDate.set(dateKey, []);
                byDate.get(dateKey).push(e);
            }
            if (byDate.size > 1) {
                siblingPatients.add(name);
            }
            for (const [dateKey, dateEntries] of byDate) {
                if (dateEntries.length > 1) {
                    const sorted = [...dateEntries].sort((a, b) => {
                        const dateA = a.fecha_ingreso ? new Date(a.fecha_ingreso) : new Date(0);
                        const dateB = b.fecha_ingreso ? new Date(b.fecha_ingreso) : new Date(0);
                        return dateB - dateA;
                    });
                    const latestId = sorted[0].id;
                    const fusionKey = `${name}||${dateKey}`;
                    dupPatients.set(fusionKey, {
                        admissions: sorted.map(e => e.numero_admision),
                        latestId,
                        count: dateEntries.length,
                        firstAdmission: sorted[sorted.length - 1],
                    });
                }
            }
        }

        // 3) Enriquecer con responsable ADM y flags
        result = result.map(alta => {
            const asignacion = matchAsignacion(criterios, alta.cliente, alta.especialidad, alta.proceso);
            const respAdm = alta.responsable_override || asignacion?.responsable || null;
            const isSuspendida = alta.estado === 'Suspendida' && !alta.traspaso_id;
            const pacKey = (alta.paciente || '').trim().toUpperCase();
            const dateKey = alta.fecha_ingreso || 'sin-fecha';
            const fusionKey = `${pacKey}||${dateKey}`;
            const dupInfo = dupPatients.get(fusionKey);
            const isDuplicate = !!dupInfo;
            const duplicateAdmissions = isDuplicate ? dupInfo.admissions : null;
            const isLatestAdmission = isDuplicate ? dupInfo.latestId === alta.id : true;
            const isObsoleteAdmission = isDuplicate && !isLatestAdmission;
            const hasSiblingInternaciones = siblingPatients.has(pacKey);

            // FUSIÓN AUTOMÁTICA (solo entre misma fecha_ingreso)
            let doctor = alta.doctor;
            let proceso = alta.proceso;
            let cliente = alta.cliente;
            let mergedAdmissions = null;
            
            if (isDuplicate && isLatestAdmission) {
                const first = dupInfo.firstAdmission;
                if (first && first.id !== alta.id) {
                    doctor = alta.doctor || first.doctor;
                    proceso = alta.proceso || first.proceso;
                    cliente = alta.cliente || first.cliente;
                }
                mergedAdmissions = duplicateAdmissions;
            }

            const siblingAdmissions = hasSiblingInternaciones
                ? (patientMap.get(pacKey) || [])
                    .filter(a => a.id !== alta.id && a.fecha_ingreso !== alta.fecha_ingreso)
                : null;
            const siblingAdmissionNumbers = siblingAdmissions ? siblingAdmissions.map(a => a.numero_admision) : null;

            // Detectar "Cruza Mes": internación que trasciende el mes seleccionado
            const [selY, selM] = selectedMonth.split('-').map(Number);
            const mesStart = `${selectedMonth}-01`;
            const cruzaMes = alta.fecha_ingreso && alta.fecha_ingreso < mesStart && (!alta.fecha_alta || alta.fecha_alta >= mesStart);
            const prevMonth = selM === 1 ? 12 : selM - 1;
            const prevYear = selM === 1 ? selY - 1 : selY;
            const lastDayPrevMonth = new Date(prevYear, prevMonth, 0).getDate();
            const fechaCierreSugerida = cruzaMes ? `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDayPrevMonth).padStart(2, '0')}` : null;

            return {
                ...alta, _responsableAdm: respAdm, _isSuspendida: isSuspendida,
                _isDuplicate: isDuplicate, _duplicateAdmissions: duplicateAdmissions,
                _isLatestAdmission: isLatestAdmission, _isObsoleteAdmission: isObsoleteAdmission,
                _duplicateCount: isDuplicate ? dupInfo.count : 0,
                _mergedAdmissions: mergedAdmissions,
                _hasSiblingInternaciones: hasSiblingInternaciones,
                _siblingAdmissions: siblingAdmissions,
                _siblingAdmissionNumbers: siblingAdmissionNumbers,
                _cruzaMes: cruzaMes,
                _fechaCierreSugerida: fechaCierreSugerida,
                doctor, proceso, cliente
            };
        });

        // 4) Filtros de usuario
        if (filterEstado !== 'all') {
            result = result.filter(a => (a.estado_fac || 'Pendiente') === filterEstado);
        }
        if (filterResponsable !== 'all') {
            result = result.filter(a => a.responsable_fac === filterResponsable);
        }
        
        // 5) Ocultar solo admisiones obsoletas de MISMA fecha (fusionadas)
        result = result.filter(a => !a._isObsoleteAdmission);

        return { preFilteredAltas: result, chequeosExcluidos: chequeosCount, duplicatePatients: dupPatients };
    }, [altas, filterEstado, filterResponsable, criterios, selectedMonth]);

    const uniqueValues = useMemo(() => {
        const cols = {
            cliente: new Set(),
            _responsableAdm: new Set(),
            proceso: new Set(),
            doctor: new Set(),
            responsable_fac: new Set(),
            estado_fac: new Set(),
        };
        preFilteredAltas.forEach(a => {
            if (a.cliente) cols.cliente.add(a.cliente);
            if (a._responsableAdm) cols._responsableAdm.add(a._responsableAdm);
            if (a.proceso) cols.proceso.add(a.proceso);
            if (a.doctor) cols.doctor.add(a.doctor);
            if (a.responsable_fac) cols.responsable_fac.add(a.responsable_fac);
            
            const est = a.estado_fac || 'Pendiente';
            cols.estado_fac.add(est);
        });
        return Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, [...v].sort()]));
    }, [preFilteredAltas]);

    const filteredAltas = useMemo(() => {
        if (Object.keys(columnFilters).length === 0) return preFilteredAltas;
        return preFilteredAltas.filter(a => {
            if (columnFilters.cliente && !columnFilters.cliente.has(a.cliente)) return false;
            if (columnFilters._responsableAdm && !columnFilters._responsableAdm.has(a._responsableAdm)) return false;
            if (columnFilters.proceso && !columnFilters.proceso.has(a.proceso)) return false;
            if (columnFilters.doctor && !columnFilters.doctor.has(a.doctor)) return false;
            if (columnFilters.responsable_fac && !columnFilters.responsable_fac.has(a.responsable_fac)) return false;
            
            const est = a.estado_fac || 'Pendiente';
            if (columnFilters.estado_fac && !columnFilters.estado_fac.has(est)) return false;
            return true;
        });
    }, [preFilteredAltas, columnFilters]);

    // ── Paginación: solo renderizar PAGE_SIZE filas ──
    const totalPages = Math.max(1, Math.ceil(filteredAltas.length / PAGE_SIZE));
    const paginatedAltas = useMemo(() => {
        if (debouncedSearch || filterSearch) return filteredAltas;
        const start = (currentPage - 1) * PAGE_SIZE;
        return filteredAltas.slice(start, start + PAGE_SIZE);
    }, [filteredAltas, currentPage, PAGE_SIZE, debouncedSearch, filterSearch]);
    const paginationStart = (currentPage - 1) * PAGE_SIZE + 1;
    const paginationEnd = Math.min(currentPage * PAGE_SIZE, filteredAltas.length);

    // Generar números de página para la barra
    const getPageNumbers = () => {
        const pages = [];
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            pages.push(1);
            if (currentPage > 3) pages.push('...');
            const start = Math.max(2, currentPage - 1);
            const end = Math.min(totalPages - 1, currentPage + 1);
            for (let i = start; i <= end; i++) pages.push(i);
            if (currentPage < totalPages - 2) pages.push('...');
            pages.push(totalPages);
        }
        return pages;
    };

    // ── KPIs ──
    const kpis = useMemo(() => {
        // Base: altas sin chequeos
        const base = altas.filter(a => {
            const doc = (a.doctor || '').toLowerCase().trim();
            return !(doc.includes('qsoft') || (doc.includes('profesional') && doc.includes('chequeo')));
        });
        const total = base.length;
        const pendientes = base.filter(a => !a.estado_fac || a.estado_fac === 'Pendiente').length;
        const enProceso = base.filter(a => a.estado_fac === 'En proceso').length;
        const facturadas = base.filter(a => a.estado_fac === 'Facturada' || a.facturada).length;
        const devueltas = base.filter(a => a.estado_fac === 'Devuelta').length;
        const autoFacturadas = base.filter(a => a.facturada).length;
        const suspendidas = base.filter(a => a.estado === 'Suspendida' && !a.traspaso_id).length;
        return { total, pendientes, enProceso, facturadas, devueltas, autoFacturadas, suspendidas };
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
    // Auto-scroll al mes seleccionado
    useEffect(() => {
        if (monthScrollRef.current) {
            const activeBtn = monthScrollRef.current.querySelector('.month-pill--active');
            if (activeBtn) {
                activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }
    }, [selectedMonth]);

    // ── FilterHeader Component ──
    const FilterHeader = ({ label, col, width }) => {
        const isActive = !!columnFilters[col];
        const isOpen = activeFilterCol === col;
        const values = uniqueValues[col] || [];
        const filtered = filterSearch
            ? values.filter(v => v.toLowerCase().includes(filterSearch.toLowerCase()))
            : values;

        return (
            <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--neutral-600)', borderBottom: '1px solid var(--neutral-200)', width, position: 'relative', userSelect: 'none' }}>
                <div
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                    onClick={() => toggleColumnFilter(col)}
                >
                    {label}
                    <ListFilter size={12} style={{
                        color: isActive ? '#4F46E5' : 'var(--neutral-300)',
                        transition: 'color 0.15s',
                        flexShrink: 0,
                    }} />
                    {isActive && (
                        <span style={{
                            width: '6px', height: '6px', borderRadius: '50%',
                            background: '#4F46E5', flexShrink: 0,
                        }} />
                    )}
                </div>

                {isOpen && (
                    <>
                        <div
                            onClick={() => setActiveFilterCol(null)}
                            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }}
                        />
                        <div style={{
                            position: 'absolute', top: '100%', left: 0, zIndex: 999,
                            marginTop: '2px', minWidth: '200px', maxWidth: '280px',
                            background: '#fff', borderRadius: '10px',
                            boxShadow: '0 8px 30px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
                            padding: '8px', animation: 'fadeIn 0.15s ease-out',
                        }}>
                            {/* Search dentro del filtro */}
                            <div style={{ position: 'relative', marginBottom: '6px' }}>
                                <Search size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--neutral-400)' }} />
                                <input
                                    type="text"
                                    placeholder="Buscar..."
                                    value={filterSearch}
                                    onChange={e => setFilterSearch(e.target.value)}
                                    onClick={e => e.stopPropagation()}
                                    style={{
                                        width: '100%', padding: '5px 8px 5px 26px',
                                        border: '1px solid var(--neutral-200)', borderRadius: '6px',
                                        fontSize: '0.72rem', outline: 'none',
                                    }}
                                    autoFocus
                                />
                            </div>
                            {/* Botones rápidos */}
                            <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                                <button
                                    onClick={e => { e.stopPropagation(); setFilterValues(col, new Set(filtered)); }}
                                    style={{
                                        flex: 1, padding: '3px', borderRadius: '4px',
                                        border: '1px solid var(--neutral-200)', background: '#F9FAFB',
                                        fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer',
                                        color: 'var(--neutral-600)',
                                    }}
                                >Todos</button>
                                <button
                                    onClick={e => { e.stopPropagation(); clearColumnFilter(col); }}
                                    style={{
                                        flex: 1, padding: '3px', borderRadius: '4px',
                                        border: '1px solid var(--neutral-200)', background: '#F9FAFB',
                                        fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer',
                                        color: '#DC2626',
                                    }}
                                >Limpiar</button>
                            </div>
                            {/* Lista de valores */}
                            <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                                {filtered.length === 0 ? (
                                    <div style={{ padding: '10px', textAlign: 'center', fontSize: '0.72rem', color: 'var(--neutral-400)' }}>Sin valores</div>
                                ) : filtered.map(val => {
                                    const checked = columnFilters[col] ? columnFilters[col].has(val) : false;
                                    return (
                                        <label
                                            key={val}
                                            onClick={e => e.stopPropagation()}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                padding: '4px 6px', borderRadius: '4px',
                                                cursor: 'pointer', fontSize: '0.73rem', fontWeight: 500,
                                                color: 'var(--neutral-700)', transition: 'background 0.1s',
                                            }}
                                            onMouseOver={e => e.currentTarget.style.background = '#F3F4F6'}
                                            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleFilterValue(col, val)}
                                                style={{ width: '14px', height: '14px', accentColor: '#4F46E5', cursor: 'pointer' }}
                                            />
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}
            </th>
        );
    };

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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                {[
                    { label: 'Total', value: kpis.total, color: '#6366F1', bg: '#EEF2FF' },
                    { label: 'Pendientes', value: kpis.pendientes, color: '#94A3B8', bg: '#F8FAFC' },
                    { label: 'En proceso', value: kpis.enProceso, color: '#F59E0B', bg: '#FFFBEB' },
                    { label: 'Facturadas', value: kpis.facturadas, color: '#10B981', bg: '#ECFDF5' },
                    { label: 'Suspendidas', value: kpis.suspendidas, color: '#EF4444', bg: '#FEF2F2' },
                    { label: 'Devueltas', value: kpis.devueltas, color: '#DC2626', bg: '#FEF2F2' },
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
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--neutral-600)' }}>
                                        <Undo2 size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                                        {carritoDevItems.length} ficha{carritoDevItems.length !== 1 ? 's' : ''} para devolver
                                    </div>
                                    <input 
                                        type="text"
                                        placeholder="🔍 Buscar paciente, doctor u OS..."
                                        value={carritoSearch}
                                        onChange={e => setCarritoSearch(e.target.value)}
                                        style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--neutral-300)', fontSize: '0.8rem', width: '250px' }}
                                    />
                                </div>
                                <button onClick={() => { setDevolucionForm({ devuelve: currentUser?.nombre || '', recibe: '', motivo: '' }); setShowDevolucionModal(true); }}
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
                                            <th style={{ ...thStyle, color: '#DC2626' }}>Enviado por</th>
                                            <th style={{ ...thStyle, color: '#DC2626' }}>Ingreso</th>
                                            <th style={{ ...thStyle, color: '#DC2626' }}>Alta</th>
                                            <th style={{ ...thStyle, width: '40px' }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredCarritoDev.map(a => (
                                            <tr key={a.id} style={{ borderBottom: '1px solid var(--neutral-100)' }}>
                                                <td style={{ padding: '8px 10px' }}>
                                                    <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', background: '#FEF2F2', color: '#DC2626' }}>{a.numero_admision}</span>
                                                </td>
                                                <td style={{ padding: '8px 10px', fontWeight: 600 }}>{a.paciente}</td>
                                                <td style={{ padding: '8px 10px', color: 'var(--neutral-500)' }}>{a.cliente || '—'}</td>
                                                <td style={{ padding: '8px 10px', color: 'var(--neutral-500)' }}>{a.doctor || '—'}</td>
                                                <td style={{ padding: '8px 10px' }}>
                                                    {a.carrito_devolucion_por ? (
                                                        <div style={{ fontSize: '0.7rem', color: '#6B7280', whiteSpace: 'nowrap' }}>
                                                            🛒 {a.carrito_devolucion_por}
                                                            {a.carrito_devolucion_at && <><br/>{formatDateTime(a.carrito_devolucion_at)}</>}
                                                        </div>
                                                    ) : <span style={{ color: '#D1D5DB' }}>—</span>}
                                                </td>
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
                    {/* Búsqueda Global en Historial */}
                    <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center' }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '8px 14px', borderRadius: '8px',
                            border: '1px solid #E5E7EB', background: '#fff', flex: 1,
                            maxWidth: '400px'
                        }}>
                            <Search size={15} color="#9CA3AF" />
                            <input 
                                type="text"
                                placeholder="🔍 Búsqueda global de pacientes, médicos u OS..."
                                value={historialSearch}
                                onChange={e => setHistorialSearch(e.target.value)}
                                style={{
                                    border: 'none', outline: 'none', flex: 1,
                                    fontSize: '0.82rem', color: '#374151',
                                    background: 'transparent',
                                }}
                            />
                            {historialSearch && (
                                <button onClick={() => setHistorialSearch('')} style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: '#9CA3AF', padding: '2px',
                                }}>
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    {devolucionesLoading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                            <Loader2 size={28} className="spin" style={{ color: '#EF4444' }} />
                        </div>
                    ) : devoluciones.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--neutral-400)' }}>
                            <PackageCheck size={48} strokeWidth={1.2} />
                            <h3 style={{ margin: '12px 0 4px' }}>Sin resultados</h3>
                            <p style={{ fontSize: '0.85rem' }}>No se encontraron devoluciones que coincidan con la búsqueda.</p>
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
                                                        <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, fontSize: '0.68rem', color: '#DC2626' }}>ENVIADO POR</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredDevolucionDetalle.map(a => (
                                                        <tr key={a.id} style={{ borderTop: '1px solid var(--neutral-100)' }}>
                                                            <td style={{ padding: '4px 8px', fontFamily: 'monospace', fontWeight: 600 }}>{a.numero_admision}</td>
                                                            <td style={{ padding: '4px 8px', fontWeight: 600 }}>{a.paciente}</td>
                                                            <td style={{ padding: '4px 8px', color: 'var(--neutral-500)' }}>{a.cliente || '—'}</td>
                                                            <td style={{ padding: '4px 8px', color: 'var(--neutral-500)' }}>{a.doctor || '—'}</td>
                                                            <td style={{ padding: '4px 8px' }}>
                                                                {a.carrito_devolucion_por ? (
                                                                    <div style={{ fontSize: '0.65rem', color: '#6B7280', whiteSpace: 'nowrap' }}>
                                                                        🛒 {a.carrito_devolucion_por}
                                                                        {a.carrito_devolucion_at && <><br/>{formatDateTime(a.carrito_devolucion_at)}</>}
                                                                    </div>
                                                                ) : <span style={{ color: '#D1D5DB' }}>—</span>}
                                                            </td>
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
                    {/* ── Selector de Mes ── */}
                    <div className="month-selector" style={{ marginBottom: '16px' }}>
                        <button
                            className="month-selector__arrow"
                            onClick={() => {
                                const idx = monthOptions.findIndex(m => m.key === selectedMonth);
                                if (idx > 0) setSelectedMonth(monthOptions[idx - 1].key);
                            }}
                            disabled={monthOptions.findIndex(m => m.key === selectedMonth) === 0}
                            title="Mes anterior"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <div className="month-selector__scroll" ref={monthScrollRef}>
                            {monthOptions.map(m => (
                                <button
                                    key={m.key}
                                    className={`month-pill${m.key === selectedMonth ? ' month-pill--active' : ''}${m.isCurrent ? ' month-pill--current' : ''}`}
                                    onClick={() => setSelectedMonth(m.key)}
                                >
                                    {m.fullLabel}
                                </button>
                            ))}
                        </div>
                        <button
                            className="month-selector__arrow"
                            onClick={() => {
                                const idx = monthOptions.findIndex(m => m.key === selectedMonth);
                                if (idx < monthOptions.length - 1) setSelectedMonth(monthOptions[idx + 1].key);
                            }}
                            disabled={monthOptions.findIndex(m => m.key === selectedMonth) === monthOptions.length - 1}
                            title="Mes siguiente"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    {/* ── Filtros ── */}
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
                        <div style={{ flex: 1, position: 'relative', minWidth: '200px' }}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--neutral-400)' }} />
                            <input
                                type="text"
                                placeholder="Buscar paciente, médico, OS, N° admisión..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                style={{
                                    width: '100%', padding: '8px 10px 8px 32px',
                                    borderRadius: '8px', border: '1px solid var(--neutral-200)',
                                    fontSize: '0.82rem', outline: 'none',
                                }}
                            />
                            {searchTerm && (
                                <X size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: 'var(--neutral-400)' }} onClick={() => setSearchTerm('')} />
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
                        {chequeosExcluidos > 0 && (
                            <span style={{ fontSize: '0.72rem', color: '#9CA3AF', fontStyle: 'italic' }}
                                title="Admisiones de tipo Chequeo (Dr. QSoft/Profesional) excluidas automáticamente">
                                ({chequeosExcluidos} chequeo{chequeosExcluidos !== 1 ? 's' : ''} excluido{chequeosExcluidos !== 1 ? 's' : ''})
                            </span>
                        )}
                        {duplicatePatients.size > 0 && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#D97706', fontWeight: 600, padding: '2px 8px', borderRadius: '10px', background: '#FFFBEB', border: '1px solid #FDE68A' }}
                                title="Pacientes con múltiples admisiones en el rango — revisar manualmente">
                                <AlertTriangle size={12} /> {duplicatePatients.size} paciente{duplicatePatients.size !== 1 ? 's' : ''} con múltiples adm.
                            </span>
                        )}
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
                        <>
                            <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid var(--neutral-200)', background: 'var(--card-bg, #fff)' }}>
                            <table style={{ width: '100%', minWidth: '1500px', borderCollapse: 'collapse', fontSize: '0.82rem', tableLayout: 'fixed' }}>
                                <thead>
                                    <tr style={{ background: 'var(--neutral-50)' }}>
                                        <th style={{ ...thStyle, width: '30px', textAlign: 'center' }}>
                                            <input type="checkbox"
                                                checked={selectedIds.size > 0 && filteredAltas.filter(a => (!a.en_carrito_devolucion || a.carrito_devolucion_por === currentUser?.usuario) && !a.devolucion_id).every(a => selectedIds.has(a.id))}
                                                onChange={e => {
                                                    if (e.target.checked) {
                                                        const ids = filteredAltas.filter(a => (!a.en_carrito_devolucion || a.carrito_devolucion_por === currentUser?.usuario) && !a.devolucion_id).map(a => a.id);
                                                        setSelectedIds(new Set(ids));
                                                    } else {
                                                        setSelectedIds(new Set());
                                                    }
                                                }}
                                                title="Seleccionar todas"
                                                style={{ cursor: 'pointer', accentColor: '#EF4444' }}
                                            />
                                        </th>
                                        <th style={{ ...thStyle, width: '28px' }}></th>
                                        <th style={{ ...thStyle, width: '90px' }}>Admisión</th>
                                        <th style={thStyle}>Paciente</th>
                                        <FilterHeader label="Cliente" col="cliente" />
                                        <FilterHeader label="Resp. ADM" col="_responsableAdm" width="120px" />
                                        <FilterHeader label="Proceso" col="proceso" width="100px" />
                                        <FilterHeader label="Médico" col="doctor" width="120px" />
                                        <th style={{ ...thStyle, width: '80px' }}>Ingreso</th>
                                        <th style={{ ...thStyle, width: '80px' }}>Alta</th>
                                        <th style={{ ...thStyle, width: '45px', textAlign: 'center' }}>Días</th>
                                        <th style={{ ...thStyle, width: '70px', textAlign: 'center' }}>Triage</th>
                                        <th style={{ ...thStyle, width: '80px', textAlign: 'center' }}>Facturada</th>
                                        <FilterHeader label="Resp. FAC" col="responsable_fac" width="160px" />
                                        <FilterHeader label="Estado FAC" col="estado_fac" width="120px" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedAltas.map(alta => {
                                        const isExpanded = expandedId === alta.id;
                                        const estadoFac = alta.estado_fac || 'Pendiente';
                                        const estadoConfig = FACTURACION_ESTADOS[estadoFac] || FACTURACION_ESTADOS['Pendiente'];
                                        const isDevuelta = estadoFac === 'Devuelta';
                                        const dias = daysBetween(alta.fecha_ingreso, alta.fecha_alta);
                                        const canSelect = (!alta.en_carrito_devolucion || alta.carrito_devolucion_por === currentUser?.usuario) && !alta.devolucion_id && !alta._isSuspendida;
                                        // Read-only: fichas facturadas, devueltas, o suspendidas no se pueden editar
                                        const isReadOnly = estadoFac === 'Facturada' || estadoFac === 'Devuelta' || alta._isSuspendida;
                                        const rowBg = alta._isSuspendida ? '#FEF2F2'
                                            : alta._isObsoleteAdmission ? '#FFFBEB'
                                            : isDevuelta ? '#FEF2F2'
                                            : isExpanded ? 'var(--neutral-50)' : 'transparent';

                                        return (
                                            <>
                                                <tr key={alta.id}
                                                    onClick={() => handleToggleExpand(alta)}
                                                    style={{
                                                        cursor: 'pointer',
                                                        borderBottom: '1px solid var(--neutral-100)',
                                                        background: rowBg,
                                                        transition: 'background 0.15s',
                                                        opacity: alta._isObsoleteAdmission ? 0.55 : alta._isSuspendida ? 0.85 : 1,
                                                    }}
                                                    onMouseOver={e => { if (!isDevuelta && !alta._isSuspendida) e.currentTarget.style.background = 'var(--neutral-50)'; }}
                                                    onMouseOut={e => { if (!isDevuelta && !isExpanded && !alta._isSuspendida && !alta._isDuplicate) e.currentTarget.style.background = 'transparent'; }}
                                                >
                                                    {/* Checkbox */}
                                                    <td style={{ ...tdStyle, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                                        {canSelect ? (
                                                            <input type="checkbox"
                                                                checked={selectedIds.has(alta.id) || (alta.en_carrito_devolucion && alta.carrito_devolucion_por === currentUser?.usuario)}
                                                                disabled={alta.en_carrito_devolucion && alta.carrito_devolucion_por === currentUser?.usuario}
                                                                onChange={() => handleToggleSelect(alta.id)}
                                                                title={alta.en_carrito_devolucion ? 'En tu carrito' : 'Seleccionar'}
                                                                style={{ cursor: alta.en_carrito_devolucion ? 'not-allowed' : 'pointer', accentColor: '#EF4444' }}
                                                            />
                                                        ) : alta.en_carrito_devolucion ? (
                                                            <Undo2 size={14} style={{ color: '#9CA3AF', opacity: 0.8 }} title={`En carrito de ${alta.carrito_devolucion_por}`} />
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
                                                            background: alta._isSuspendida ? '#FEF2F2' : alta._hasSiblingInternaciones ? '#FFFBEB' : alta._mergedAdmissions ? '#F0FDF4' : '#EEF2FF',
                                                            color: alta._isSuspendida ? '#DC2626' : alta._hasSiblingInternaciones ? '#B45309' : alta._mergedAdmissions ? '#166534' : '#4338CA',
                                                            border: alta._hasSiblingInternaciones ? '1px solid #FDE68A' : 'none',
                                                        }}
                                                            title={alta._hasSiblingInternaciones 
                                                                ? `Internación separada — Otras admisiones: ${(alta._siblingAdmissionNumbers || []).join(', ')}` 
                                                                : alta._mergedAdmissions 
                                                                    ? `Fusión automática (misma fecha): ${alta._mergedAdmissions.join(', ')}` 
                                                                    : undefined}
                                                        >
                                                            {alta._mergedAdmissions ? (
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                    🔗 {alta.numero_admision}
                                                                    {alta._mergedAdmissions.length > 1 && (
                                                                        <span style={{ fontSize: '0.65rem', padding: '1px 4px', borderRadius: '4px', background: 'rgba(0,0,0,0.1)' }}>
                                                                            +{alta._mergedAdmissions.length - 1}
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            ) : (
                                                                alta.numero_admision || '—'
                                                            )}
                                                        </span>
                                                    </td>
                                                    <td style={{ ...tdStyle, fontWeight: 600, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        <span>{alta.paciente}</span>
                                                        {alta._isSuspendida && (
                                                            <span style={{ marginLeft: '6px', padding: '1px 6px', borderRadius: '4px', background: '#FEF2F2', color: '#DC2626', fontSize: '0.65rem', fontWeight: 700, verticalAlign: 'middle' }}>⛔ SUSP.</span>
                                                        )}
                                                        {alta._hasSiblingInternaciones && (
                                                            <span title={`Internaciones separadas — Otras admisiones: ${(alta._siblingAdmissionNumbers || []).join(', ')}`}
                                                                style={{ marginLeft: '4px', padding: '1px 6px', borderRadius: '4px', background: '#FFFBEB', color: '#B45309', fontSize: '0.62rem', fontWeight: 700, verticalAlign: 'middle', cursor: 'help', border: '1px solid #FDE68A' }}>
                                                                🔀 Múltiple
                                                            </span>
                                                        )}
                                                        {alta._mergedAdmissions && !alta._hasSiblingInternaciones && (
                                                            <span title={`Fusionada (misma fecha) — Admisiones: ${alta._mergedAdmissions.join(', ')}`}
                                                                style={{ marginLeft: '4px', padding: '1px 6px', borderRadius: '4px', background: '#ECFDF5', color: '#059669', fontSize: '0.62rem', fontWeight: 700, verticalAlign: 'middle', cursor: 'help' }}>
                                                                🔗 Fusionada
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{ ...tdStyle, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--neutral-500)' }}>
                                                        {alta.cliente || '—'}
                                                    </td>
                                                    {/* Resp. ADM */}
                                                    <td style={{ ...tdStyle, fontSize: '0.75rem', color: alta._responsableAdm ? '#6366F1' : 'var(--neutral-400)' }}
                                                        title={alta._responsableAdm || 'Sin asignación'}>
                                                        {alta._responsableAdm ? shortName(alta._responsableAdm) : '—'}
                                                    </td>
                                                    {/* Proceso */}
                                                    <td style={{ ...tdStyle, fontSize: '0.75rem', color: 'var(--neutral-500)', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                        title={alta.proceso || ''}>
                                                        {alta.proceso || '—'}
                                                    </td>
                                                    {/* Médico */}
                                                    <td style={{ ...tdStyle, fontSize: '0.75rem', color: 'var(--neutral-500)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                        title={alta.doctor || ''}>
                                                        {alta.doctor ? shortName(alta.doctor) : '—'}
                                                    </td>
                                                    <td style={{ ...tdStyle, fontSize: '0.75rem' }}>
                                                        {formatDate(alta.fecha_ingreso)}
                                                        {alta._cruzaMes && (
                                                            <span title={`Internación cruza mes — Ingreso: ${formatDate(alta.fecha_ingreso)}${alta.facturacion_cerrada_hasta ? ` | Cerrado hasta: ${formatDate(alta.facturacion_cerrada_hasta)}` : ' | Sin cierre previo'}`}
                                                                style={{ 
                                                                    marginLeft: '3px', padding: '1px 4px', borderRadius: '4px', 
                                                                    background: alta.facturacion_cerrada_hasta ? '#ECFDF5' : '#FEF2F2', 
                                                                    color: alta.facturacion_cerrada_hasta ? '#059669' : '#DC2626', 
                                                                    fontSize: '0.55rem', fontWeight: 700, fontFamily: 'system-ui', verticalAlign: 'middle', cursor: 'help',
                                                                    border: alta.facturacion_cerrada_hasta ? '1px solid #A7F3D0' : '1px solid #FECACA',
                                                                }}>
                                                                {alta.facturacion_cerrada_hasta ? '✅' : '⚠️'}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{ ...tdStyle, fontSize: '0.75rem' }}>{formatDate(alta.fecha_alta)}</td>
                                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                        {dias !== null ? (
                                                            <span style={{
                                                                padding: '2px 6px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 700,
                                                                background: dias > 15 ? '#FEF2F2' : dias > 7 ? '#FFFBEB' : '#ECFDF5',
                                                                color: dias > 15 ? '#DC2626' : dias > 7 ? '#D97706' : '#059669',
                                                            }}>
                                                                {dias}d
                                                            </span>
                                                        ) : '—'}
                                                    </td>
                                                    {/* Triage Facturación */}
                                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                        {alta.triage_facturacion ? (
                                                            <span
                                                                title={alta.procedimientos_detalle?.join(' | ') || ''}
                                                                style={{
                                                                    padding: '2px 6px', borderRadius: '10px', fontSize: '0.68rem', fontWeight: 700,
                                                                    cursor: 'help',
                                                                    background: ['Rojo', 'Difícil'].includes(alta.triage_facturacion) ? '#FEF2F2'
                                                                        : ['Amarillo', 'Media'].includes(alta.triage_facturacion) ? '#FFFBEB' : '#ECFDF5',
                                                                    color: ['Rojo', 'Difícil'].includes(alta.triage_facturacion) ? '#DC2626'
                                                                        : ['Amarillo', 'Media'].includes(alta.triage_facturacion) ? '#D97706' : '#059669',
                                                                }}>
                                                                {['Rojo', 'Difícil'].includes(alta.triage_facturacion) ? '🔴' : ['Amarillo', 'Media'].includes(alta.triage_facturacion) ? '🟡' : '🟢'} {alta.cantidad_procedimientos || 0}
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: 'var(--neutral-300)', fontSize: '0.72rem' }}>—</span>
                                                        )}
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

                                                    {/* Responsable FAC — dropdown (read-only if locked) */}
                                                    <td style={{ ...tdStyle, opacity: isReadOnly ? 0.6 : 1 }} onClick={e => e.stopPropagation()}>
                                                        <div style={{ position: 'relative' }}>
                                                            <button onClick={(e) => !isReadOnly && openDropdown(e, alta.id, 'responsable')}
                                                                disabled={isReadOnly}
                                                                style={{
                                                                    display: 'flex', alignItems: 'center', gap: '4px',
                                                                    padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem',
                                                                    border: '1px solid var(--neutral-200)', background: 'var(--neutral-50)',
                                                                    cursor: isReadOnly ? 'not-allowed' : 'pointer',
                                                                    color: alta.responsable_fac ? 'var(--neutral-700)' : 'var(--neutral-400)',
                                                                    fontWeight: alta.responsable_fac ? 600 : 400,
                                                                    width: '100%', justifyContent: 'space-between',
                                                                }}>
                                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                    {alta.responsable_fac ? shortName(alta.responsable_fac) : 'Asignar'}
                                                                </span>
                                                                {!isReadOnly && <ChevronDown size={12} />}
                                                            </button>
                                                            {!isReadOnly && responsableDropdownId === alta.id && (
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

                                                    {/* Estado FAC — dropdown (read-only if locked) */}
                                                    <td style={{ ...tdStyle, opacity: isReadOnly ? 0.6 : 1 }} onClick={e => e.stopPropagation()}>
                                                        <div style={{ position: 'relative' }}>
                                                            {alta._isSuspendida ? (
                                                                <span style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                    padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem',
                                                                    border: '1px solid #EF444444', background: '#FEF2F2', color: '#EF4444',
                                                                    fontWeight: 700, whiteSpace: 'nowrap',
                                                                }}>⛔ Suspendida</span>
                                                            ) : (
                                                                <>
                                                                    <button onClick={(e) => !isReadOnly && openDropdown(e, alta.id, 'estado')}
                                                                        disabled={isReadOnly}
                                                                        style={{
                                                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                            padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem',
                                                                            border: `1px solid ${estadoConfig.color}44`,
                                                                            background: estadoConfig.bg, color: estadoConfig.color,
                                                                            fontWeight: 700, cursor: isReadOnly ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
                                                                        }}>
                                                                        {estadoConfig.icon} {estadoConfig.label}
                                                                        {!isReadOnly && <ChevronDown size={11} />}
                                                                    </button>
                                                                    {!isReadOnly && estadoDropdownId === alta.id && (
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
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>

                                                {/* ── Detalle expandido ── */}
                                                {isExpanded && (
                                                    <tr key={`${alta.id}-detail`} className="animate-fade-in">
                                                        <td colSpan={15} style={{ padding: 0, border: 'none' }}>
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

                                                                {/* Otras Internaciones del mismo paciente */}
                                                                {alta._hasSiblingInternaciones && alta._siblingAdmissions && alta._siblingAdmissions.length > 0 && (
                                                                    <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                                                                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#B45309', marginBottom: '8px', textTransform: 'uppercase' }}>
                                                                            🔀 Otras Internaciones ({alta._siblingAdmissions.length})
                                                                        </div>
                                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                                                            <thead>
                                                                                <tr style={{ background: '#FEF3C7' }}>
                                                                                    {['Admisión', 'Ingreso', 'Alta', 'Estado', 'OS', 'Doctor'].map(h => (
                                                                                        <th key={h} style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 700, color: '#92400E', fontSize: '0.68rem', textTransform: 'uppercase', borderBottom: '1px solid #FDE68A' }}>{h}</th>
                                                                                    ))}
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {alta._siblingAdmissions.map(sib => {
                                                                                    const sibEstados = {
                                                                                        'Pendiente': { label: 'Pendiente', color: '#F59E0B', bg: '#FFFBEB', icon: '⏳' },
                                                                                        'En Proceso': { label: 'En Proceso', color: '#3B82F6', bg: '#EFF6FF', icon: '🔄' },
                                                                                        'Facturada': { label: 'Facturada', color: '#10B981', bg: '#ECFDF5', icon: '✅' },
                                                                                        'Devuelta': { label: 'Devuelta', color: '#EF4444', bg: '#FEF2F2', icon: '🔙' },
                                                                                    };
                                                                                    const sibCfg = sib.estado_fac ? (sibEstados[sib.estado_fac] || sibEstados['Pendiente']) : (sib.estado ? { label: sib.estado, color: '#6B7280', bg: '#F3F4F6', icon: '📋' } : null);
                                                                                    return (
                                                                                        <tr key={sib.id} style={{ borderBottom: '1px solid #FDE68A' }}>
                                                                                            <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontWeight: 600, color: '#B45309' }}>{sib.numero_admision || '—'}</td>
                                                                                            <td style={{ padding: '5px 8px', color: '#78350F' }}>{formatDate(sib.fecha_ingreso)}</td>
                                                                                            <td style={{ padding: '5px 8px', color: '#78350F' }}>{formatDate(sib.fecha_alta)}</td>
                                                                                            <td style={{ padding: '5px 8px' }}>
                                                                                                {sibCfg ? (
                                                                                                    <span style={{ padding: '1px 8px', borderRadius: '4px', background: sibCfg.bg, color: sibCfg.color, fontSize: '0.68rem', fontWeight: 600 }}>
                                                                                                        {sibCfg.icon} {sibCfg.label}
                                                                                                    </span>
                                                                                                ) : <span style={{ color: '#94A3B8' }}>—</span>}
                                                                                            </td>
                                                                                            <td style={{ padding: '5px 8px', color: '#78350F', fontSize: '0.72rem' }}>{sib.cliente || '—'}</td>
                                                                                            <td style={{ padding: '5px 8px', color: '#78350F', fontSize: '0.72rem' }}>{sib.doctor || '—'}</td>
                                                                                        </tr>
                                                                                    );
                                                                                })}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                )}

                                                                {/* Cerrar Período (para internaciones que cruzan mes) */}
                                                                {alta._cruzaMes && (
                                                                    <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', background: alta.facturacion_cerrada_hasta ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${alta.facturacion_cerrada_hasta ? '#A7F3D0' : '#FECACA'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                        <div>
                                                                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: alta.facturacion_cerrada_hasta ? '#059669' : '#DC2626', textTransform: 'uppercase' }}>
                                                                                {alta.facturacion_cerrada_hasta ? '✅ Período Cerrado' : '⚠️ Internación Cruza Mes'}
                                                                            </div>
                                                                            <div style={{ fontSize: '0.78rem', color: alta.facturacion_cerrada_hasta ? '#065F46' : '#7F1D1D', marginTop: '2px' }}>
                                                                                {alta.facturacion_cerrada_hasta 
                                                                                    ? <>Facturación cerrada hasta: <strong>{formatDate(alta.facturacion_cerrada_hasta)}</strong></>
                                                                                    : <>Facturar hasta: <strong>{formatDate(alta._fechaCierreSugerida)}</strong> y cerrar período</>
                                                                                }
                                                                            </div>
                                                                        </div>
                                                                        {alta.facturacion_cerrada_hasta ? (
                                                                            <button 
                                                                                onClick={async (e) => {
                                                                                    e.stopPropagation();
                                                                                    try {
                                                                                        await reabrirPeriodoFacturacion(alta.id);
                                                                                        addToast?.('Período reabierto correctamente', 'success');
                                                                                        loadData();
                                                                                    } catch (err) {
                                                                                        addToast?.('Error: ' + err.message, 'error');
                                                                                    }
                                                                                }}
                                                                                style={{ padding: '5px 14px', borderRadius: '6px', border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                                                            >
                                                                                🔓 Reabrir
                                                                            </button>
                                                                        ) : (
                                                                            <button 
                                                                                onClick={async (e) => {
                                                                                    e.stopPropagation();
                                                                                    try {
                                                                                        await cerrarPeriodoFacturacion(alta.id, alta._fechaCierreSugerida);
                                                                                        addToast?.(`✅ Período cerrado hasta ${formatDate(alta._fechaCierreSugerida)}`, 'success');
                                                                                        loadData();
                                                                                    } catch (err) {
                                                                                        addToast?.('Error: ' + err.message, 'error');
                                                                                    }
                                                                                }}
                                                                                style={{ padding: '5px 14px', borderRadius: '6px', border: 'none', background: '#DC2626', color: '#fff', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                                                            >
                                                                                🔒 Cerrar hasta {formatDate(alta._fechaCierreSugerida)}
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                )}
                                                                {/* Procedimientos Quirúrgicos (de Foja Quirúrgica) */}
                                                                {alta.procedimientos_detalle && alta.procedimientos_detalle.length > 0 && (
                                                                    <div style={{ marginBottom: '16px' }}>
                                                                        <div style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                            🔪 Procedimientos Quirúrgicos
                                                                            <span style={{
                                                                                padding: '2px 8px', borderRadius: '10px', fontSize: '0.68rem', fontWeight: 700,
                                                                                background: ['Rojo', 'Difícil'].includes(alta.triage_facturacion) ? '#FEF2F2'
                                                                                    : ['Amarillo', 'Media'].includes(alta.triage_facturacion) ? '#FFFBEB' : '#ECFDF5',
                                                                                color: ['Rojo', 'Difícil'].includes(alta.triage_facturacion) ? '#DC2626'
                                                                                    : ['Amarillo', 'Media'].includes(alta.triage_facturacion) ? '#D97706' : '#059669',
                                                                            }}>
                                                                                {alta.triage_facturacion} ({alta.cantidad_procedimientos})
                                                                            </span>
                                                                        </div>
                                                                        <div style={{
                                                                            background: '#fff', borderRadius: '8px', border: '1px solid var(--neutral-200)',
                                                                            padding: '10px 14px', marginTop: '6px',
                                                                        }}>
                                                                            {alta.procedimientos_detalle.map((proc, idx) => (
                                                                                <div key={idx} style={{
                                                                                    display: 'flex', alignItems: 'center', gap: '8px',
                                                                                    padding: '4px 0',
                                                                                    borderBottom: idx < alta.procedimientos_detalle.length - 1 ? '1px solid var(--neutral-100)' : 'none',
                                                                                }}>
                                                                                    <span style={{
                                                                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                                                        width: '20px', height: '20px', borderRadius: '50%',
                                                                                        background: '#EEF2FF', color: '#6366F1',
                                                                                        fontSize: '0.65rem', fontWeight: 800, flexShrink: 0,
                                                                                    }}>{idx + 1}</span>
                                                                                    <span style={{ fontSize: '0.82rem', color: 'var(--neutral-700)' }}>{proc}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}

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
                        
                        {/* ── Paginación Inferior ── */}
                        {totalPages > 1 && !debouncedSearch && !filterSearch && (
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '16px 20px', background: '#fff', border: '1px solid var(--neutral-200)',
                                borderTop: 'none', borderRadius: '0 0 12px 12px'
                            }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--neutral-500)' }}>
                                    Mostrando <span style={{ fontWeight: 600, color: 'var(--neutral-800)' }}>{paginationStart}</span> a <span style={{ fontWeight: 600, color: 'var(--neutral-800)' }}>{paginationEnd}</span> de <span style={{ fontWeight: 600, color: 'var(--neutral-800)' }}>{filteredAltas.length}</span> fichas
                                </div>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    <button
                                        className="pagination-btn pagination-btn--nav"
                                        disabled={currentPage === 1}
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    >
                                        <ChevronLeft size={14} /> Anterior
                                    </button>
                                    {getPageNumbers().map((page, idx) =>
                                        page === '...' ? (
                                            <span key={`dots-${idx}`} style={{ padding: '0 8px', color: 'var(--neutral-400)', alignSelf: 'center' }}>...</span>
                                        ) : (
                                            <button
                                                key={page}
                                                className={`pagination-btn${page === currentPage ? ' pagination-btn--active' : ''}`}
                                                onClick={() => setCurrentPage(page)}
                                            >
                                                {page}
                                            </button>
                                        )
                                    )}
                                    <button
                                        className="pagination-btn pagination-btn--nav"
                                        disabled={currentPage === totalPages}
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    >
                                        Siguiente <ChevronRight size={14} />
                                    </button>
                                </div>
                            </div>
                        )}
                        </>
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
