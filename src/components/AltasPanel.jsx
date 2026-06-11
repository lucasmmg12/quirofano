/**
 * AltasPanel.jsx — Control de Altas Administrativas
 * 
 * Vista tabular con estados coloreados, detalle expandible con observaciones,
 * filtros por fecha/estado/búsqueda, y KPIs resumidos.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    Search, RefreshCw, ChevronRight, ChevronLeft, Clock, Calendar,
    Filter, X, Loader2, FileText, User, Building2,
    Stethoscope, ChevronDown, ChevronUp, StickyNote, Save,
    ListFilter, Download, FileDown, ShoppingCart, Printer, Trash2, PackageCheck, Receipt,
} from 'lucide-react';
import {
    fetchAltas, updateAltaEstado, updateAltaNotas, updateAltaResponsable, ALTA_ESTADOS,
    fetchCarritoTraspaso, marcarParaTraspaso, quitarDeCarritoTraspaso,
    generarTraspaso, fetchTraspasos, fetchTraspasoDetalle, firmarTraspaso,
} from '../services/altasService';
import { fetchAsignaciones, matchAsignacion } from '../services/asignacionService';
import SalusSyncButton from './SalusSyncButton';
import AltasMetricsPanel from './AltasMetricsPanel';
import SignaturePad from './SignaturePad';
import { SkeletonTablePanel } from './SkeletonLoader';

// ── Helpers ──
function formatDate(d) {
    if (!d) return '—';
    const dt = new Date(d + 'T12:00:00');
    return dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function daysBetween(from, to) {
    if (!from || !to) return null;
    const a = new Date(from + 'T12:00:00');
    const b = new Date(to + 'T12:00:00');
    return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

export default function AltasPanel({ addToast, currentUser }) {
    // ── State ──
    const [altas, setAltas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState(null);
    const [statusDropdownId, setStatusDropdownId] = useState(null);
    const [responsableDropdownId, setResponsableDropdownId] = useState(null);
    const [dropdownAnchor, setDropdownAnchor] = useState(null); // { id, type, rect }
    const [dropdownDir, setDropdownDir] = useState('down'); // 'down' | 'up'
    const [processing, setProcessing] = useState(false);

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

    // Generar lista de meses (últimos 12 + mes actual)
    const monthOptions = useMemo(() => {
        const months = [];
        const now = nowRef.current;
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleDateString('es-AR', { month: 'long' });
            const year = d.getFullYear();
            const isCurrent = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
            months.push({ key, label, year, isCurrent });
        }
        return months;
    }, []);

    const [filterEstado, setFilterEstado] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // ── Paginación ──
    const PAGE_SIZE = 50;
    const [currentPage, setCurrentPage] = useState(1);
    
    // Debounce search term (500ms)
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Reset página al cambiar filtros
    useEffect(() => {
        setCurrentPage(1);
    }, [selectedMonth, debouncedSearch, filterEstado, columnFilters]);

    // Auto-scroll al mes seleccionado en el selector
    useEffect(() => {
        if (monthScrollRef.current) {
            const activeBtn = monthScrollRef.current.querySelector('.month-pill--active');
            if (activeBtn) {
                activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }
    }, [selectedMonth]);
    
    // Notas internas
    const [editingNotas, setEditingNotas] = useState(null);
    const [notasText, setNotasText] = useState('');
    const [criterios, setCriterios] = useState([]);

    // ── Carrito de traspaso ──
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [carritoItems, setCarritoItems] = useState([]);
    const [carritoLoading, setCarritoLoading] = useState(false);
    const [traspasos, setTraspasos] = useState([]);
    const [traspasosLoading, setTraspasosLoading] = useState(false);
    const [expandedTraspaso, setExpandedTraspaso] = useState(null);
    const [traspasoDetalle, setTraspasoDetalle] = useState({});
    const [showTraspasoModal, setShowTraspasoModal] = useState(false);
    const [traspasoForm, setTraspasoForm] = useState({ entrega: '', recibe: '', notas: '' });
    const [generando, setGenerando] = useState(false);
    const [firmaEntrega, setFirmaEntrega] = useState(null);
    const [firmaRecibe, setFirmaRecibe] = useState(null);

    // ── Filtros por columna (tipo Excel) ──
    const [columnFilters, setColumnFilters] = useState({});
    const [activeFilterCol, setActiveFilterCol] = useState(null);
    const [filterSearch, setFilterSearch] = useState('');

    // ── Ordenamiento fecha ingreso ──
    const [ingresoSort, setIngresoSort] = useState('desc');

    // ── Tab activo ──
    const [activeTab, setActiveTab] = useState('tabla'); // 'tabla' | 'metricas' | 'carrito' | 'historial'

    // ── Carga de datos ──
    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const [data, criteriosData] = await Promise.all([
                fetchAltas({ fromDate, toDate, search: debouncedSearch }),
                fetchAsignaciones().catch(() => []),
            ]);
            setAltas(data);
            setCriterios(criteriosData);
        } catch (err) {
            addToast?.('Error al cargar altas: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [fromDate, toDate, debouncedSearch, addToast]);

    useEffect(() => { loadData(); }, [loadData]);

    // ── Carga carrito ──
    const loadCarrito = useCallback(async () => {
        setCarritoLoading(true);
        try {
            const data = await fetchCarritoTraspaso();
            setCarritoItems(data);
        } catch (err) {
            addToast?.('Error al cargar carrito: ' + err.message, 'error');
        } finally {
            setCarritoLoading(false);
        }
    }, [addToast]);

    const loadTraspasos = useCallback(async () => {
        setTraspasosLoading(true);
        try {
            const data = await fetchTraspasos();
            setTraspasos(data);
        } catch (err) {
            addToast?.('Error al cargar historial: ' + err.message, 'error');
        } finally {
            setTraspasosLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        if (activeTab === 'carrito') loadCarrito();
        else if (activeTab === 'historial') loadTraspasos();
    }, [activeTab, loadCarrito, loadTraspasos]);

    // ── Carrito handlers ──
    const handleToggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSelectAllSelectable = () => {
        const selectableIds = sortedAltas
            .filter(a => !a.en_carrito_traspaso)
            .map(a => a.id);
        setSelectedIds(new Set(selectableIds));
    };

    const handleEnviarAlCarrito = async () => {
        if (selectedIds.size === 0) {
            addToast?.('Seleccioná fichas para enviar al carrito', 'info');
            return;
        }
        try {
            await marcarParaTraspaso([...selectedIds]);
            addToast?.(`${selectedIds.size} ficha(s) enviadas al carrito`, 'success');
            setSelectedIds(new Set());
            loadData();
            loadCarrito();
        } catch (err) {
            addToast?.('Error: ' + err.message, 'error');
        }
    };

    const handleQuitarDelCarrito = async (id) => {
        try {
            await quitarDeCarritoTraspaso(id);
            addToast?.('Ficha removida del carrito', 'info');
            loadCarrito();
            loadData();
        } catch (err) {
            addToast?.('Error: ' + err.message, 'error');
        }
    };

    const handleGenerarTraspaso = async () => {
        const entregaNombre = currentUser?.nombre || currentUser?.usuario || 'Operador';
        if (!traspasoForm.recibe.trim()) {
            addToast?.('Ingresá el nombre de quien recibe', 'error');
            return;
        }
        setGenerando(true);
        try {
            const traspaso = await generarTraspaso({
                responsableEntrega: entregaNombre,
                responsableRecibe: traspasoForm.recibe.trim(),
                notas: traspasoForm.notas || null,
            });
            addToast?.(`✅ Traspaso ${traspaso.codigo} generado — ${traspaso.cantidad_fichas} fichas`, 'success');
            setShowTraspasoModal(false);
            setTraspasoForm({ entrega: '', recibe: '', notas: '' });
            loadCarrito();
            loadData();
            // Auto-print
            handlePrintTraspaso(traspaso);
        } catch (err) {
            addToast?.('Error: ' + err.message, 'error');
        } finally {
            setGenerando(false);
        }
    };

    const handlePrintTraspaso = async (traspaso) => {
        try {
            const items = await fetchTraspasoDetalle(traspaso.id);
            const now = new Date();
            const today = now.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const hora = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
            const logoUrl = window.location.origin + '/logosanatorio.png';

            const rows = items.map((a, i) => `<tr style="background:${i % 2 === 0 ? '#fff' : '#F8FAFC'}">
                <td style="padding:7px 10px;border-bottom:1px solid #E2E8F0;font-size:11px;font-family:'Courier New',monospace;font-weight:700;color:#1E5799">${a.numero_admision || '—'}</td>
                <td style="padding:7px 10px;border-bottom:1px solid #E2E8F0;font-size:11px;font-weight:600;color:#1E293B">${a.paciente || '—'}</td>
                <td style="padding:7px 10px;border-bottom:1px solid #E2E8F0;font-size:10px;color:#475569">${a.cliente || '—'}</td>
                <td style="padding:7px 10px;border-bottom:1px solid #E2E8F0;font-size:10px;color:#475569">${a.doctor || '—'}</td>
                <td style="padding:7px 10px;border-bottom:1px solid #E2E8F0;font-size:10px;font-family:'Courier New',monospace;color:#475569;text-align:center">${formatDate(a.fecha_ingreso)}</td>
                <td style="padding:7px 10px;border-bottom:1px solid #E2E8F0;font-size:10px;font-family:'Courier New',monospace;color:#475569;text-align:center">${formatDate(a.fecha_alta)}</td>
            </tr>`).join('');

            const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Traspaso ${traspaso.codigo}</title>
            <style>
                @page { margin: 12mm 15mm; }
                * { box-sizing: border-box; }
                body { font-family: 'Segoe UI', -apple-system, Arial, sans-serif; color: #1E293B; margin: 0; padding: 0; }
                table { border-collapse: collapse; width: 100%; }
            </style></head><body>
                <!-- HEADER INSTITUCIONAL -->
                <div style="display:flex;align-items:center;border-bottom:3px solid #1E5799;padding-bottom:14px;margin-bottom:18px">
                    <img src="${logoUrl}" style="height:50px;margin-right:16px" alt="Logo" />
                    <div style="flex:1">
                        <div style="font-size:16px;font-weight:800;color:#1E5799;letter-spacing:-0.3px">SANATORIO ARGENTINO</div>
                        <div style="font-size:9px;color:#64748B;margin-top:1px">Departamento de Admisión Quirúrgica</div>
                    </div>
                    <div style="text-align:right">
                        <div style="font-size:10px;font-weight:700;color:#1E5799;background:#EFF6FF;padding:4px 12px;border-radius:6px;border:1px solid #BFDBFE;display:inline-block">${traspaso.codigo}</div>
                        <div style="font-size:9px;color:#94A3B8;margin-top:4px">${today} — ${hora}</div>
                    </div>
                </div>

                <!-- TITULO -->
                <div style="text-align:center;margin-bottom:18px">
                    <div style="font-size:15px;font-weight:800;color:#1E293B;text-transform:uppercase;letter-spacing:1px">Constancia de Traspaso a Facturación</div>
                    <div style="width:60px;height:3px;background:#1E5799;margin:6px auto 0;border-radius:2px"></div>
                </div>

                <!-- DATOS DEL TRASPASO -->
                <div style="display:flex;gap:0;margin-bottom:16px;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden">
                    <div style="flex:1;padding:10px 14px;border-right:1px solid #E2E8F0;background:#F8FAFC">
                        <div style="font-size:8px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.5px">Entrega</div>
                        <div style="font-size:12px;font-weight:700;color:#1E293B;margin-top:2px">${traspaso.responsable_entrega}</div>
                        <div style="font-size:8px;color:#94A3B8">Admisión Quirúrgica</div>
                    </div>
                    <div style="flex:1;padding:10px 14px;border-right:1px solid #E2E8F0;background:#F8FAFC">
                        <div style="font-size:8px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.5px">Recibe</div>
                        <div style="font-size:12px;font-weight:700;color:#1E293B;margin-top:2px">${traspaso.responsable_recibe || '—'}</div>
                        <div style="font-size:8px;color:#94A3B8">Facturación</div>
                    </div>
                    <div style="padding:10px 14px;background:#EFF6FF;min-width:100px;text-align:center">
                        <div style="font-size:8px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.5px">Fichas</div>
                        <div style="font-size:22px;font-weight:800;color:#1E5799;margin-top:0">${traspaso.cantidad_fichas}</div>
                    </div>
                </div>

                ${traspaso.notas ? '<div style="margin-bottom:14px;padding:8px 12px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;font-size:10px;color:#92400E"><strong>Observaciones:</strong> ' + traspaso.notas + '</div>' : ''}

                <!-- TABLA DE FICHAS -->
                <table style="border:1px solid #E2E8F0;border-radius:8px;overflow:hidden">
                    <thead>
                        <tr style="background:#1E5799">
                            <th style="padding:8px 10px;font-size:9px;font-weight:700;color:#fff;text-align:left;text-transform:uppercase;letter-spacing:0.5px">N° Adm</th>
                            <th style="padding:8px 10px;font-size:9px;font-weight:700;color:#fff;text-align:left;text-transform:uppercase;letter-spacing:0.5px">Paciente</th>
                            <th style="padding:8px 10px;font-size:9px;font-weight:700;color:#fff;text-align:left;text-transform:uppercase;letter-spacing:0.5px">Obra Social</th>
                            <th style="padding:8px 10px;font-size:9px;font-weight:700;color:#fff;text-align:left;text-transform:uppercase;letter-spacing:0.5px">Médico</th>
                            <th style="padding:8px 10px;font-size:9px;font-weight:700;color:#fff;text-align:center;text-transform:uppercase;letter-spacing:0.5px">Ingreso</th>
                            <th style="padding:8px 10px;font-size:9px;font-weight:700;color:#fff;text-align:center;text-transform:uppercase;letter-spacing:0.5px">Alta</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>

                <!-- FIRMAS -->
                <div style="display:flex;justify-content:space-between;margin-top:50px;padding:0 20px">
                    <div style="text-align:center;width:220px">
                        <div style="border-top:2px solid #1E293B;padding-top:8px;font-size:11px;font-weight:700;color:#1E293B">${traspaso.responsable_entrega}</div>
                        <div style="font-size:9px;color:#94A3B8;margin-top:2px">Entrega — Admisión Quirúrgica</div>
                    </div>
                    <div style="text-align:center;width:220px">
                        <div style="border-top:2px solid #1E293B;padding-top:8px;font-size:11px;font-weight:700;color:#1E293B">${traspaso.responsable_recibe || '________________________'}</div>
                        <div style="font-size:9px;color:#94A3B8;margin-top:2px">Recibe — Facturación</div>
                    </div>
                </div>

                <!-- FOOTER -->
                <div style="margin-top:40px;padding-top:10px;border-top:1px solid #E2E8F0;display:flex;justify-content:space-between;align-items:center">
                    <div style="font-size:8px;color:#94A3B8">Documento generado por Sistema ADM-QUI — ${today} ${hora}</div>
                    <div style="font-size:8px;color:#94A3B8">${traspaso.codigo} · Sanatorio Argentino</div>
                </div>
            </body></html>`;

            const printWin = window.open('', '_blank', 'width=900,height=700');
            printWin.document.write(html);
            printWin.document.close();
            setTimeout(() => printWin.print(), 500);
        } catch (err) {
            addToast?.('Error al imprimir: ' + err.message, 'error');
        }
    };

    // ── Handlers ──
    const handleEstadoChange = async (id, nuevoEstado) => {
        try {
            setProcessing(true);
            await updateAltaEstado(id, nuevoEstado, currentUser?.nombre || 'operador');
            addToast?.(`Estado → ${ALTA_ESTADOS[nuevoEstado]?.label || nuevoEstado}`, 'success');
            setStatusDropdownId(null);
            setDropdownAnchor(null);
            loadData();
        } catch (err) {
            addToast?.('Error: ' + err.message, 'error');
        } finally {
            setProcessing(false);
        }
    };

    const handleSaveNotas = async (id) => {
        try {
            setProcessing(true);
            await updateAltaNotas(id, notasText);
            addToast?.('Notas guardadas', 'success');
            setEditingNotas(null);
            loadData();
        } catch (err) {
            addToast?.('Error: ' + err.message, 'error');
        } finally {
            setProcessing(false);
        }
    };

    // ── Filtros por columna helpers ──
    const toggleColumnFilter = (col) => {
        setActiveFilterCol(prev => prev === col ? null : col);
        setFilterSearch('');
    };

    const setFilterValues = (col, values) => {
        setColumnFilters(prev => {
            const next = { ...prev };
            if (!values || values.size === 0) {
                delete next[col];
            } else {
                next[col] = values;
            }
            return next;
        });
    };

    const toggleFilterValue = (col, value) => {
        setColumnFilters(prev => {
            const current = prev[col] ? new Set(prev[col]) : new Set();
            if (current.has(value)) {
                current.delete(value);
            } else {
                current.add(value);
            }
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

    // Obtener datos procesados con effectiveEstado (sin filtro de pill, para KPIs)
    const allProcessedAltas = useMemo(() => {
        return altas.filter(alta => {
            const doc = (alta.doctor || '').toLowerCase().trim();
            if (doc.includes('qsoft') || (doc.includes('profesional') && doc.includes('chequeo'))) return false;
            // Particulares: si paciente = obra social, no nos interesa
            const pac = (alta.paciente || '').trim().toUpperCase();
            const os = (alta.cliente || '').trim().toUpperCase();
            if (pac && os && pac === os) return false;
            return true;
        }).map(alta => {
            const asignacion = matchAsignacion(criterios, alta.cliente, alta.especialidad, alta.proceso);
            const ctrlAdm = (alta.control_adm_finalizado || '').trim().toLowerCase();
            const isCtrlAdmSi = ctrlAdm === 'sí' || ctrlAdm === 'si' || ctrlAdm === 's' 
                || ctrlAdm === 'true' || ctrlAdm === '1' || ctrlAdm === 'yes';
            const obsHasAltaAdm = (alta.observaciones || '').toLowerCase().includes('alta adm');
            // Alta Adm se detecta de 3 fuentes:
            // 1) SALUS control_adm_finalizado = 'Si'
            // 2) Observaciones contienen 'alta adm' (escrito por el personal)
            // 3) Estado manual = 'Alta Adm' (puesto por operador)
            // Facturada: si existe factura en PDV 21/31 (cruce automático SALUS)
            // Devuelta FAC: si tiene devolucion_id y estado_fac === 'Devuelta'
            const isFacturada = !!(alta.facturada || alta.estado_fac === 'Facturada');
            const isDevueltaFac = !!(alta.devolucion_id && alta.estado_fac === 'Devuelta' && !isFacturada);
            const effectiveEstado = (isCtrlAdmSi || obsHasAltaAdm || alta.estado === 'Alta Adm')
                ? 'Alta Adm'
                : (alta.estado || 'Vacío');
            // Responsable: manual override tiene prioridad sobre auto-match
            const autoResp = asignacion?.responsable || '';
            const finalResp = alta.responsable_override || autoResp;
            return { ...alta, _effectiveEstado: effectiveEstado, _responsable: finalResp, _autoResponsable: autoResp, _isDevueltaFac: isDevueltaFac, _isFacturada: isFacturada };
        });
    }, [altas, criterios]);

    // ── Check if current user is jcorrea (can edit responsable) ──
    const isJcorrea = useMemo(() => {
        const email = (currentUser?.usuario || currentUser?.email || '').toLowerCase();
        return email === 'jcorrea@sanatorioargentino.com.ar' || email.split('@')[0] === 'jcorrea';
    }, [currentUser]);

    // ── Lista única de responsables (de criterios de asignación) ──
    const allResponsables = useMemo(() => {
        const set = new Set();
        criterios.forEach(c => {
            if (c.responsable) set.add(c.responsable.trim().toUpperCase());
        });
        return [...set].sort();
    }, [criterios]);

    // ── KPIs (calculados ANTES del filtro de pill para mostrar conteos globales) ──
    const localStats = useMemo(() => {
        const s = {};
        for (const key of Object.keys(ALTA_ESTADOS)) s[key] = 0;
        allProcessedAltas.forEach(a => {
            if (a._effectiveEstado && s[a._effectiveEstado] !== undefined) s[a._effectiveEstado]++;
        });
        s._total = allProcessedAltas.length;
        return s;
    }, [allProcessedAltas]);
    const total = localStats._total || 0;

    // Aplicar filtro de pill (estado) — frontend
    const preFilteredAltas = useMemo(() => {
        if (!filterEstado || filterEstado === 'all') return allProcessedAltas;
        return allProcessedAltas.filter(a => a._effectiveEstado === filterEstado);
    }, [allProcessedAltas, filterEstado]);

    // Extraer valores únicos por columna — desde preFilteredAltas (SIN filtros de columna)
    // para que los dropdowns no se reduzcan al aplicar filtros
    const uniqueValues = useMemo(() => {
        const cols = {
            estado: new Set(),
            cliente: new Set(),
            especialidad: new Set(),
            doctor: new Set(),
            responsable: new Set(),
        };
        preFilteredAltas.forEach(a => {
            const ecfg = ALTA_ESTADOS[a._effectiveEstado];
            if (ecfg) cols.estado.add(ecfg.label);
            else cols.estado.add('Vacío');
            if (a.cliente) cols.cliente.add(a.cliente);
            if (a.especialidad) cols.especialidad.add(a.especialidad);
            if (a.doctor) cols.doctor.add(a.doctor);
            if (a._responsable) cols.responsable.add(a._responsable);
        });
        return Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, [...v].sort()]));
    }, [preFilteredAltas]);

    // Aplicar filtros de columna
    const filteredAltas = useMemo(() => {
        return preFilteredAltas.filter(a => {
            if (columnFilters.estado) {
                const ecfg = ALTA_ESTADOS[a._effectiveEstado];
                const label = ecfg ? ecfg.label : 'Vacío';
                if (!columnFilters.estado.has(label)) return false;
            }
            if (columnFilters.cliente && !columnFilters.cliente.has(a.cliente)) return false;
            if (columnFilters.especialidad && !columnFilters.especialidad.has(a.especialidad)) return false;
            if (columnFilters.doctor && !columnFilters.doctor.has(a.doctor)) return false;
            if (columnFilters.responsable && !columnFilters.responsable.has(a._responsable)) return false;
            return true;
        });
    }, [preFilteredAltas, columnFilters]);

    // ── Ordenamiento por fecha ingreso ──
    const sortedAltas = useMemo(() => {
        const sorted = [...filteredAltas];
        sorted.sort((a, b) => {
            const dateA = a.fecha_ingreso || '';
            const dateB = b.fecha_ingreso || '';
            return ingresoSort === 'asc'
                ? dateA.localeCompare(dateB)
                : dateB.localeCompare(dateA);
        });
        return sorted;
    }, [filteredAltas, ingresoSort]);

    const activeFilterCount = Object.keys(columnFilters).length;

    // ── Paginación: solo renderizar PAGE_SIZE filas ──
    const totalPages = Math.max(1, Math.ceil(sortedAltas.length / PAGE_SIZE));
    const paginatedAltas = useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE;
        return sortedAltas.slice(start, start + PAGE_SIZE);
    }, [sortedAltas, currentPage, PAGE_SIZE]);
    const paginationStart = (currentPage - 1) * PAGE_SIZE + 1;
    const paginationEnd = Math.min(currentPage * PAGE_SIZE, sortedAltas.length);

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

    // ── Exportar a Excel (CSV con BOM para UTF-8) ──
    const exportToExcel = () => {
        const headers = ['Estado', 'Paciente', 'N° Admisión', 'Obra Social', 'Especialidad', 'Médico', 'Ingreso', 'Alta', 'Responsable', 'Proceso', 'Notas'];
        const rows = sortedAltas.map(a => {
            const ecfg = ALTA_ESTADOS[a._effectiveEstado];
            return [
                ecfg?.label || '—',
                a.paciente || '',
                a.numero_admision || '',
                a.cliente || '',
                a.especialidad || '',
                a.doctor || '',
                a.fecha_ingreso || '',
                a.fecha_alta || '',
                a._responsable || '',
                a.proceso || '',
                (a.notas_internas || '').replace(/[\n\r]+/g, ' '),
            ];
        });

        const csvContent = [headers, ...rows]
            .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
            .join('\n');

        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const today = new Date().toISOString().split('T')[0];
        link.href = url;
        link.download = `altas_administrativas_${today}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        addToast?.(`📊 Excel exportado: ${sortedAltas.length} registros`, 'success');
    };

    // ── Exportar a PDF (abre diálogo de impresión del navegador) ──
    const exportToPDF = () => {
        const today = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const rows = sortedAltas.map(a => {
            const ecfg = ALTA_ESTADOS[a._effectiveEstado];
            return `<tr>
                <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:11px;font-weight:600;color:${ecfg?.color || '#666'}">${ecfg?.label || '—'}</td>
                <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:11px;font-weight:600">${a.paciente || '—'}</td>
                <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:11px">${a.cliente || '—'}</td>
                <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:11px">${a.especialidad || '—'}</td>
                <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:11px">${a.doctor || '—'}</td>
                <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:11px;font-family:monospace">${formatDate(a.fecha_ingreso)}</td>
                <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:11px;font-family:monospace;font-weight:600">${a.fecha_alta ? formatDate(a.fecha_alta) : 'Internado'}</td>
                <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:11px;font-weight:600;color:#1E40AF">${a._responsable || '—'}</td>
            </tr>`;
        }).join('');

        // KPI summary for PDF
        const kpiHtml = Object.entries(ALTA_ESTADOS).map(([key, cfg]) => {
            const count = localStats[key] || 0;
            return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;background:${cfg.bg};color:${cfg.color};font-size:11px;font-weight:700;border:1px solid ${cfg.color}25">${cfg.icon} ${cfg.label}: ${count}</span>`;
        }).join(' ');

        const html = `<!DOCTYPE html>
        <html><head><meta charset="utf-8"><title>Altas Administrativas — ${today}</title>
        <style>
            @page { size: landscape; margin: 12mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1f2937; }
            table { border-collapse: collapse; width: 100%; }
            th { padding: 6px 8px; background: #f1f5f9; border: 1px solid #e2e8f0; font-size: 11px; font-weight: 700; text-align: left; color: #374151; }
            tr:nth-child(even) td { background: #f9fafb; }
        </style></head><body>
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
                <div style="font-size:20px;font-weight:800;color:#1f2937">📋 Control de Altas Administrativas</div>
                <div style="margin-left:auto;font-size:12px;color:#6b7280">${today} — ${sortedAltas.length} registros</div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
                <span style="padding:3px 10px;border-radius:20px;background:#1F2937;color:#fff;font-size:11px;font-weight:700">Total: ${total}</span>
                ${kpiHtml}
            </div>
            <table>
                <thead><tr>
                    <th>Estado</th><th>Paciente</th><th>Obra Social</th><th>Especialidad</th><th>Médico</th><th>Ingreso</th><th>Alta</th><th>Responsable</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <div style="margin-top:20px;font-size:10px;color:#9ca3af;text-align:center;">Sanatorio Argentino — Sistema ADM-QUI — Generado el ${today}</div>
        </body></html>`;

        const printWin = window.open('', '_blank', 'width=1200,height=800');
        printWin.document.write(html);
        printWin.document.close();
        setTimeout(() => printWin.print(), 400);
    };

    // ── FilterHeader Component ──
    const FilterHeader = ({ label, col, width }) => {
        const isActive = !!columnFilters[col];
        const isOpen = activeFilterCol === col;
        const values = uniqueValues[col] || [];
        const filtered = filterSearch
            ? values.filter(v => v.toLowerCase().includes(filterSearch.toLowerCase()))
            : values;

        return (
            <th className="cart__th" style={{ width, position: 'relative', userSelect: 'none' }}>
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

    // ════════════════════════════════════════════════
    // RENDER
    // ════════════════════════════════════════════════
    return (
        <div className="content no-print" style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', overflow: 'auto' }}>
            
            {/* ── Header ── */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexWrap: 'wrap', gap: '12px',
            }}>
                <div>
                    <h2 style={{ 
                        margin: 0, fontSize: '1.35rem', fontWeight: 800,
                        color: 'var(--neutral-800)', letterSpacing: '-0.3px',
                        display: 'flex', alignItems: 'center', gap: '10px',
                    }}>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '10px',
                            background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontSize: '1rem',
                        }}>📋</div>
                        Control de Altas Administrativas
                    </h2>
                    <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--neutral-400)' }}>
                        Gestión del proceso de alta hospitalaria — {total} registros
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <SalusSyncButton onComplete={loadData} addToast={addToast} />
                    {/* Export buttons */}
                    <button
                        onClick={exportToExcel}
                        disabled={loading || sortedAltas.length === 0}
                        title="Exportar a Excel (.csv)"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                            padding: '8px 12px', borderRadius: '10px',
                            background: '#fff', color: '#059669',
                            border: '1px solid #05966930',
                            fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer',
                            transition: 'all 0.2s',
                            opacity: sortedAltas.length === 0 ? 0.4 : 1,
                        }}
                        onMouseOver={e => { e.currentTarget.style.background = '#ECFDF5'; e.currentTarget.style.borderColor = '#059669'; }}
                        onMouseOut={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#05966930'; }}
                    >
                        <FileDown size={14} />
                        Excel
                    </button>
                    <button
                        onClick={exportToPDF}
                        disabled={loading || sortedAltas.length === 0}
                        title="Exportar a PDF"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                            padding: '8px 12px', borderRadius: '10px',
                            background: '#fff', color: '#DC2626',
                            border: '1px solid #DC262630',
                            fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer',
                            transition: 'all 0.2s',
                            opacity: sortedAltas.length === 0 ? 0.4 : 1,
                        }}
                        onMouseOver={e => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.borderColor = '#DC2626'; }}
                        onMouseOut={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#DC262630'; }}
                    >
                        <Download size={14} />
                        PDF
                    </button>
                    <button
                        onClick={loadData}
                        disabled={loading}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            padding: '8px 14px', borderRadius: '10px',
                            background: '#fff', color: 'var(--neutral-600)',
                            border: '1px solid var(--neutral-200)',
                            fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                        onMouseOver={e => { e.currentTarget.style.borderColor = '#6366F1'; e.currentTarget.style.color = '#6366F1'; }}
                        onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--neutral-200)'; e.currentTarget.style.color = 'var(--neutral-600)'; }}
                    >
                        <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                        Actualizar
                    </button>
                </div>
            </div>

            {/* ── Tab Toggle ── */}
            <div style={{
                display: 'flex', gap: '4px', padding: '4px',
                background: '#F3F4F6', borderRadius: '12px', width: 'fit-content',
            }}>
                {[
                    { key: 'tabla', label: '📋 Tabla', icon: null },
                    { key: 'carrito', label: '📦 Carrito', icon: null, badge: carritoItems.length },
                    { key: 'historial', label: '📄 Historial', icon: null },
                    { key: 'metricas', label: '📊 Métricas BI', icon: null },
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
                                background: '#6366F1', color: '#fff', padding: '1px 7px',
                                borderRadius: '10px', fontSize: '0.65rem', fontWeight: 800,
                            }}>{tab.badge}</span>
                        )}
                    </button>
                ))}
            </div>

            {activeTab === 'metricas' ? (
                <AltasMetricsPanel altas={preFilteredAltas} />
            ) : activeTab === 'carrito' ? (
                /* ══════ CARRITO TAB ══════ */
                <div className="animate-fade-in">
                    {carritoLoading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                            <Loader2 size={28} className="spin" style={{ color: '#6366F1' }} />
                        </div>
                    ) : carritoItems.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--neutral-400)' }}>
                            <ShoppingCart size={48} strokeWidth={1.2} />
                            <h3 style={{ margin: '12px 0 4px' }}>Carrito vacío</h3>
                            <p style={{ fontSize: '0.85rem' }}>Seleccioná fichas con estado "Alta Adm" en la pestaña Tabla y envialas al carrito.</p>
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--neutral-600)' }}>
                                    <ShoppingCart size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                                    {carritoItems.length} ficha{carritoItems.length !== 1 ? 's' : ''} en el carrito
                                </div>
                                <button onClick={() => setShowTraspasoModal(true)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        padding: '10px 20px', borderRadius: '10px',
                                        background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                                        color: '#fff', border: 'none', cursor: 'pointer',
                                        fontSize: '0.82rem', fontWeight: 700,
                                        boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
                                    }}>
                                    <Printer size={16} /> Generar Constancia de Traspaso
                                </button>
                            </div>
                            <div style={{ borderRadius: '12px', border: '1px solid var(--neutral-200)', overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--neutral-50)' }}>
                                            <th className="cart__th">N° Adm</th>
                                            <th className="cart__th">Paciente</th>
                                            <th className="cart__th">Obra Social</th>
                                            <th className="cart__th">Médico</th>
                                            <th className="cart__th">Ingreso</th>
                                            <th className="cart__th">Alta</th>
                                            <th className="cart__th" style={{ width: '40px' }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {carritoItems.map(a => (
                                            <tr key={a.id} style={{ borderBottom: '1px solid var(--neutral-100)' }}>
                                                <td style={{ padding: '8px 10px' }}>
                                                    <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', background: '#EEF2FF', color: '#4338CA' }}>{a.numero_admision}</span>
                                                </td>
                                                <td style={{ padding: '8px 10px', fontWeight: 600 }}>{a.paciente}</td>
                                                <td style={{ padding: '8px 10px', color: 'var(--neutral-500)' }}>{a.cliente || '—'}</td>
                                                <td style={{ padding: '8px 10px', color: 'var(--neutral-500)' }}>{a.doctor || '—'}</td>
                                                <td style={{ padding: '8px 10px' }}>{formatDate(a.fecha_ingreso)}</td>
                                                <td style={{ padding: '8px 10px' }}>{formatDate(a.fecha_alta)}</td>
                                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                    <button onClick={() => handleQuitarDelCarrito(a.id)}
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

                    {/* Modal Generar Traspaso */}
                    {showTraspasoModal && (
                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={() => setShowTraspasoModal(false)}>
                            <div onClick={e => e.stopPropagation()} style={{
                                background: '#fff', borderRadius: '16px', padding: '28px', width: '520px', maxWidth: '90vw',
                                boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto',
                            }}>
                                <h3 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: 800 }}>
                                    📦 Generar Constancia de Traspaso
                                </h3>
                                <div style={{ fontSize: '0.82rem', color: 'var(--neutral-500)', marginBottom: '16px' }}>
                                    {carritoItems.length} ficha{carritoItems.length !== 1 ? 's' : ''} serán traspasadas a Facturación.
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {/* Entrega: usuario logueado (solo lectura) */}
                                    <div>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--neutral-500)', textTransform: 'uppercase' }}>Entrega</label>
                                        <div style={{
                                            width: '100%', padding: '8px 12px', borderRadius: '8px',
                                            border: '1px solid var(--neutral-200)', fontSize: '0.85rem',
                                            marginTop: '4px', background: 'var(--neutral-50)', color: 'var(--neutral-700)',
                                            fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px',
                                        }}>
                                            <User size={14} style={{ color: 'var(--neutral-400)' }} />
                                            {currentUser?.nombre || currentUser?.usuario || 'Usuario actual'}
                                        </div>
                                    </div>
                                    {/* Recibe: dropdown de responsables + opción de escribir */}
                                    <div>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--neutral-500)', textTransform: 'uppercase' }}>Recibe *</label>
                                        <div style={{ position: 'relative', marginTop: '4px' }}>
                                            <input
                                                list="recibe-options"
                                                value={traspasoForm.recibe}
                                                onChange={e => setTraspasoForm(p => ({ ...p, recibe: e.target.value }))}
                                                placeholder="Seleccionar o escribir nombre..."
                                                style={{
                                                    width: '100%', padding: '8px 12px', borderRadius: '8px',
                                                    border: '1px solid var(--neutral-200)', fontSize: '0.85rem',
                                                }}
                                            />
                                            <datalist id="recibe-options">
                                                {allResponsables.map(r => (
                                                    <option key={r} value={r} />
                                                ))}
                                            </datalist>
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--neutral-500)', textTransform: 'uppercase' }}>Observaciones</label>
                                        <textarea value={traspasoForm.notas} onChange={e => setTraspasoForm(p => ({ ...p, notas: e.target.value }))}
                                            placeholder="Notas adicionales (opcional)" rows={2}
                                            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--neutral-200)', fontSize: '0.85rem', marginTop: '4px', resize: 'vertical' }} />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                                    <button onClick={() => setShowTraspasoModal(false)}
                                        style={{ padding: '8px 18px', borderRadius: '8px', border: '1px solid var(--neutral-200)', background: '#fff', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>Cancelar</button>
                                    <button onClick={handleGenerarTraspaso} disabled={generando || !traspasoForm.recibe.trim()}
                                        style={{
                                            padding: '8px 24px', borderRadius: '8px', border: 'none',
                                            background: 'linear-gradient(135deg, #6366F1, #4F46E5)', color: '#fff',
                                            cursor: (generando || !traspasoForm.recibe.trim()) ? 'not-allowed' : 'pointer',
                                            fontSize: '0.82rem', fontWeight: 700,
                                            opacity: (generando || !traspasoForm.recibe.trim()) ? 0.5 : 1,
                                        }}>
                                        {generando ? 'Generando...' : '📦 Generar e Imprimir'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : activeTab === 'historial' ? (
                /* ══════ HISTORIAL TAB ══════ */
                <div className="animate-fade-in">
                    {traspasosLoading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                            <Loader2 size={28} className="spin" style={{ color: '#6366F1' }} />
                        </div>
                    ) : traspasos.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--neutral-400)' }}>
                            <PackageCheck size={48} strokeWidth={1.2} />
                            <h3 style={{ margin: '12px 0 4px' }}>Sin traspasos</h3>
                            <p style={{ fontSize: '0.85rem' }}>Aún no se generaron constancias de traspaso.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {traspasos.map(t => (
                                <div key={t.id} style={{
                                    borderRadius: '10px', border: '1px solid var(--neutral-200)',
                                    overflow: 'hidden', background: '#fff',
                                }}>
                                    <div onClick={async () => {
                                        if (expandedTraspaso === t.id) { setExpandedTraspaso(null); return; }
                                        setExpandedTraspaso(t.id);
                                        if (!traspasoDetalle[t.id]) {
                                            const items = await fetchTraspasoDetalle(t.id);
                                            setTraspasoDetalle(prev => ({ ...prev, [t.id]: items }));
                                        }
                                    }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '12px',
                                            padding: '12px 16px', cursor: 'pointer',
                                            background: expandedTraspaso === t.id ? 'var(--neutral-50)' : '#fff',
                                        }}>
                                        {expandedTraspaso === t.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.82rem', color: '#4338CA' }}>{t.codigo}</span>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--neutral-500)' }}>{new Date(t.fecha_traspaso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                        <span style={{ padding: '2px 8px', borderRadius: '10px', background: '#EEF2FF', color: '#4338CA', fontSize: '0.72rem', fontWeight: 700 }}>{t.cantidad_fichas} fichas</span>
                                        <span style={{ fontSize: '0.78rem', color: 'var(--neutral-500)' }}>Entrega: {t.responsable_entrega}</span>
                                        <button onClick={(e) => { e.stopPropagation(); handlePrintTraspaso(t); }}
                                            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#6366F1', padding: '4px' }}
                                            title="Reimprimir">
                                            <Printer size={16} />
                                        </button>
                                    </div>
                                    {expandedTraspaso === t.id && traspasoDetalle[t.id] && (
                                        <div style={{ borderTop: '1px solid var(--neutral-100)', padding: '12px 16px 12px 40px' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                                <thead>
                                                    <tr style={{ background: '#F8FAFC' }}>
                                                        <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, fontSize: '0.68rem', color: 'var(--neutral-500)' }}>N° ADM</th>
                                                        <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, fontSize: '0.68rem', color: 'var(--neutral-500)' }}>PACIENTE</th>
                                                        <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, fontSize: '0.68rem', color: 'var(--neutral-500)' }}>O.S.</th>
                                                        <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, fontSize: '0.68rem', color: 'var(--neutral-500)' }}>MÉDICO</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {traspasoDetalle[t.id].map(a => (
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
            <>

            {/* ── KPI Pills ── */}
            <div style={{
                display: 'flex', gap: '8px', flexWrap: 'wrap',
            }}>
                {/* Total */}
                <button
                    onClick={() => setFilterEstado('all')}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '6px 14px', borderRadius: '20px',
                        background: filterEstado === 'all' ? '#1F2937' : '#F3F4F6',
                        color: filterEstado === 'all' ? '#fff' : '#6B7280',
                        border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700,
                        transition: 'all 0.15s',
                    }}
                >
                    Todos <span style={{ 
                        background: filterEstado === 'all' ? 'rgba(255,255,255,0.2)' : '#E5E7EB',
                        padding: '1px 8px', borderRadius: '10px', 
                    }}>{total}</span>
                </button>
                {Object.entries(ALTA_ESTADOS).map(([key, cfg]) => {
                    const count = localStats[key] || 0;
                    const isActive = filterEstado === key;
                    return (
                        <button
                            key={key}
                            onClick={() => setFilterEstado(isActive ? 'all' : key)}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '5px',
                                padding: '6px 12px', borderRadius: '20px',
                                background: isActive ? cfg.color : cfg.bg,
                                color: isActive ? '#fff' : cfg.color,
                                border: `1px solid ${isActive ? cfg.color : cfg.color + '25'}`,
                                cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700,
                                transition: 'all 0.15s',
                                opacity: count === 0 ? 0.5 : 1,
                            }}
                        >
                            {cfg.icon} {cfg.label}
                            <span style={{
                                background: isActive ? 'rgba(255,255,255,0.25)' : cfg.color + '15',
                                padding: '1px 7px', borderRadius: '10px',
                                fontSize: '0.68rem',
                            }}>{count}</span>
                        </button>
                    );
                })}
            </div>

            {/* ── Selector de Mes ── */}
            <div className="month-selector">
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
                            <span className="month-pill__month">{m.label}</span>
                            <span className="month-pill__year">{m.year}</span>
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

            {/* ── Barra de búsqueda ── */}
            <div style={{
                display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap',
                padding: '10px 14px', borderRadius: '12px',
                background: '#FAFAFA', border: '1px solid var(--neutral-100)',
            }}>
                <div style={{ flex: 1, position: 'relative', minWidth: '200px' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--neutral-400)' }} />
                    <input
                        type="text"
                        placeholder="Buscar paciente, médico, OS, N° admisión..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{
                            width: '100%', padding: '7px 10px 7px 32px',
                            borderRadius: '8px', border: '1px solid var(--neutral-200)',
                            fontSize: '0.8rem', color: 'var(--neutral-700)',
                            transition: 'border-color 0.2s',
                        }}
                        onFocus={e => e.currentTarget.style.borderColor = '#6366F1'}
                        onBlur={e => e.currentTarget.style.borderColor = 'var(--neutral-200)'}
                    />
                </div>
                {(searchTerm || filterEstado !== 'all') && (
                    <button
                        onClick={() => { setSearchTerm(''); setFilterEstado('all'); }}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            padding: '5px 10px', borderRadius: '6px',
                            background: '#FEE2E2', color: '#DC2626',
                            border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600,
                        }}
                    >
                        <X size={12} /> Limpiar
                    </button>
                )}
            </div>

            {/* ── Tabla ── */}
            <div className="cart animate-fade-in" style={{ overflow: 'visible', minHeight: 0, flex: '1 1 auto' }}>
                {loading ? (
                    <SkeletonTablePanel kpis={0} cols={9} rows={8} />
                ) : altas.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '10px', color: 'var(--neutral-400)' }}>
                        <FileText size={48} strokeWidth={1.2} />
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--neutral-500)' }}>Sin resultados</h3>
                        <p style={{ margin: 0, fontSize: '0.82rem' }}>No hay altas que coincidan con los filtros.</p>
                    </div>
                ) : (
                    <>
                    <div className="cart__table-wrapper" style={{ overflowX: 'auto', width: '100%' }}>
                        {/* Hint: carrito de traspaso */}
                        {selectedIds.size === 0 && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '8px 14px', marginBottom: '8px', borderRadius: '8px',
                                background: 'linear-gradient(135deg, #EEF2FF, #F5F3FF)',
                                border: '1px solid #C7D2FE',
                                fontSize: '0.78rem', color: '#4338CA',
                            }}>
                                <ShoppingCart size={14} style={{ flexShrink: 0 }} />
                                <span><strong>Tip:</strong> Seleccioná fichas con los <strong>☑ checks</strong> de la izquierda para enviarlas al <strong>Carrito de Traspaso</strong>.</span>
                            </div>
                        )}
                        <table className="cart__table" style={{ width: '100%', tableLayout: 'auto' }}>
                            <thead>
                                <tr>
                                    <th className="cart__th" style={{ width: '30px', textAlign: 'center' }} title="Seleccioná fichas para enviar al Carrito de Traspaso">
                                        <input type="checkbox"
                                            checked={selectedIds.size > 0 && sortedAltas.filter(a => !a.en_carrito_traspaso).every(a => selectedIds.has(a.id))}
                                            onChange={e => {
                                                if (e.target.checked) handleSelectAllSelectable();
                                                else setSelectedIds(new Set());
                                            }}
                                            title="Seleccionar todas las fichas para el carrito"
                                            style={{ cursor: 'pointer', accentColor: '#6366F1' }}
                                        />
                                    </th>
                                    <th className="cart__th" style={{ width: '30px' }}></th>
                                    <FilterHeader label="Estado" col="estado" width="120px" />
                                    <th className="cart__th">Paciente</th>
                                    <th className="cart__th" style={{ width: '85px' }}>N° Adm</th>
                                    <FilterHeader label="Obra Social" col="cliente" />
                                    <FilterHeader label="Especialidad" col="especialidad" />
                                    <FilterHeader label="Médico" col="doctor" />
                                    <th className="cart__th" style={{ width: '100px', userSelect: 'none' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                            Ingreso
                                            <button
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    setIngresoSort(prev => prev === 'desc' ? 'asc' : 'desc');
                                                }}
                                                title={ingresoSort === 'desc' ? 'Ordenar: más antiguas primero' : 'Ordenar: más recientes primero'}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                    width: '20px', height: '20px', borderRadius: '4px',
                                                    border: 'none', background: 'transparent',
                                                    cursor: 'pointer', transition: 'all 0.15s',
                                                    color: '#4F46E5', padding: 0, flexShrink: 0,
                                                }}
                                                onMouseOver={e => e.currentTarget.style.background = '#EEF2FF'}
                                                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                {ingresoSort === 'desc' ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                            </button>
                                        </div>
                                    </th>
                                    <th className="cart__th" style={{ width: '110px' }}>Alta</th>
                                    <FilterHeader label="Responsable" col="responsable" width="90px" />
                                    <th className="cart__th" style={{ width: '120px' }}>Facturación</th>
                                </tr>
                                {activeFilterCount > 0 && (
                                    <tr>
                                        <td colSpan={12} style={{ padding: '4px 10px', background: '#EFF6FF', borderBottom: '1px solid #DBEAFE' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                <ListFilter size={12} color="#4F46E5" />
                                                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#4F46E5' }}>
                                                    {activeFilterCount} filtro{activeFilterCount > 1 ? 's' : ''} activo{activeFilterCount > 1 ? 's' : ''}
                                                </span>
                                                <span style={{ fontSize: '0.68rem', color: 'var(--neutral-400)' }}>—</span>
                                                <span style={{ fontSize: '0.68rem', color: 'var(--neutral-500)' }}>
                                                    {filteredAltas.length} de {preFilteredAltas.length} registros
                                                </span>
                                                <button
                                                    onClick={clearAllColumnFilters}
                                                    style={{
                                                        marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '3px',
                                                        padding: '2px 8px', borderRadius: '4px',
                                                        background: '#FEE2E2', color: '#DC2626',
                                                        border: 'none', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 600,
                                                    }}
                                                >
                                                    <X size={10} /> Quitar filtros
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </thead>
                            <tbody>
                                {paginatedAltas.map(alta => {
                                    const effectiveEstado = alta._effectiveEstado;
                                    const cfg = effectiveEstado ? (ALTA_ESTADOS[effectiveEstado] || ALTA_ESTADOS['Procesada']) : null;
                                    const isExpanded = expandedId === alta.id;
                                    const asignacion = { responsable: alta._responsable, tutor: alta._tutor };

                                    return [
                                        // ── Row ──
                                        <tr
                                            key={alta.id}
                                            className="cart__row"
                                            onClick={() => {
                                                setExpandedId(isExpanded ? null : alta.id);
                                                if (!isExpanded) {
                                                    setEditingNotas(null);
                                                }
                                            }}
                                            style={{
                                                cursor: 'pointer', transition: 'background 0.15s',
                                                background: alta._isDevueltaFac ? '#FEF2F2' : undefined,
                                                borderLeft: alta._isDevueltaFac ? '3px solid #DC2626' : undefined,
                                            }}
                                            onMouseOver={e => { if (!isExpanded && !alta._isDevueltaFac) e.currentTarget.style.background = 'var(--neutral-50)'; }}
                                            onMouseOut={e => { if (!isExpanded && !alta._isDevueltaFac) e.currentTarget.style.background = alta._isDevueltaFac ? '#FEF2F2' : ''; }}
                                        >
                                            {/* Checkbox */}
                                            <td className="cart__td" style={{ textAlign: 'center', padding: '4px' }} onClick={e => e.stopPropagation()}>
                                                {!alta.en_carrito_traspaso ? (
                                                    <input type="checkbox"
                                                        checked={selectedIds.has(alta.id)}
                                                        onChange={() => handleToggleSelect(alta.id)}
                                                        style={{ cursor: 'pointer', accentColor: '#6366F1' }}
                                                    />
                                                ) : (
                                                    <ShoppingCart size={12} style={{ color: '#6366F1', opacity: 0.5 }} title="En carrito" />
                                                )}
                                            </td>
                                            {/* Chevron */}
                                            <td className="cart__td" style={{ textAlign: 'center', padding: '4px' }}>
                                                <ChevronRight size={14} style={{
                                                    color: 'var(--neutral-400)',
                                                    transition: 'transform 0.2s ease',
                                                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                                }} />
                                            </td>
                                            {/* Estado */}
                                            <td className="cart__td" style={{ position: 'relative' }}>
                                                <div style={{ position: 'relative', display: 'inline-block' }}>
                                                    <button
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            if (statusDropdownId === alta.id) {
                                                                setStatusDropdownId(null);
                                                                setDropdownAnchor(null);
                                                            } else {
                                                                const rect = e.currentTarget.getBoundingClientRect();
                                                                const spaceBelow = window.innerHeight - rect.bottom;
                                                                setDropdownDir(spaceBelow < 280 ? 'up' : 'down');
                                                                setStatusDropdownId(alta.id);
                                                                setDropdownAnchor({ id: alta.id, type: 'status', rect });
                                                            }
                                                        }}
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                            padding: !cfg ? '4px 6px' : '4px 10px',
                                                            borderRadius: 'var(--radius-full)',
                                                            fontSize: '0.72rem', fontWeight: 700,
                                                            background: !cfg ? 'transparent' : cfg.bg,
                                                            color: !cfg ? 'transparent' : cfg.color,
                                                            border: !cfg ? '1px dashed transparent' : `1px solid ${cfg.color}25`,
                                                            cursor: 'pointer', transition: 'all 0.15s',
                                                            whiteSpace: 'nowrap',
                                                            minWidth: !cfg ? '70px' : 'auto',
                                                        }}
                                                        onMouseOver={e => {
                                                            if (!cfg) {
                                                                e.currentTarget.style.borderColor = 'var(--neutral-250, #C5CCD6)';
                                                                e.currentTarget.style.color = 'var(--neutral-400)';
                                                            } else {
                                                                e.currentTarget.style.boxShadow = `0 0 0 2px ${cfg.color}30`;
                                                            }
                                                        }}
                                                        onMouseOut={e => {
                                                            if (!cfg) {
                                                                e.currentTarget.style.borderColor = 'transparent';
                                                                e.currentTarget.style.color = 'transparent';
                                                            } else {
                                                                e.currentTarget.style.boxShadow = 'none';
                                                            }
                                                        }}
                                                        title="Cambiar estado"
                                                    >
                                                        {!cfg ? '—' : <>{cfg.icon} {cfg.label}</>}
                                                    </button>
                                                </div>
                                            </td>
                                            {/* Paciente */}
                                            <td className="cart__td" style={{ fontWeight: 600, fontSize: '0.82rem' }}>
                                                {alta.paciente || '—'}
                                            </td>
                                            {/* N° Admisión */}
                                            <td className="cart__td" style={{ whiteSpace: 'nowrap' }}>
                                                <span style={{
                                                    background: alta.numero_admision ? '#EFF6FF' : 'transparent',
                                                    color: alta.numero_admision ? '#1E40AF' : '#94A3B8',
                                                    padding: alta.numero_admision ? '2px 8px' : '0',
                                                    borderRadius: '6px',
                                                    fontSize: '0.73rem',
                                                    fontWeight: 600,
                                                    fontFamily: 'monospace',
                                                    border: alta.numero_admision ? '1px solid #BFDBFE' : 'none',
                                                }}>
                                                    {alta.numero_admision || '—'}
                                                </span>
                                            </td>
                                            {/* OS */}
                                            <td className="cart__td" style={{ fontSize: '0.78rem', color: 'var(--neutral-500)' }}>
                                                {alta.cliente || '—'}
                                            </td>
                                            {/* Especialidad */}
                                            <td className="cart__td" style={{ fontSize: '0.78rem', color: 'var(--neutral-500)' }}>
                                                {alta.especialidad || '—'}
                                            </td>
                                            {/* Médico */}
                                            <td className="cart__td" style={{ fontSize: '0.78rem' }}>
                                                {alta.doctor || '—'}
                                            </td>
                                            {/* Fecha Ingreso */}
                                            <td className="cart__td" style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--neutral-500)' }}>
                                                {formatDate(alta.fecha_ingreso)}
                                            </td>
                                            {/* Fecha Alta */}
                                            <td className="cart__td" style={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 600 }}>
                                                {alta.fecha_alta ? formatDate(alta.fecha_alta) : <span style={{ color: '#4F46E5', fontWeight: 700, fontSize: '0.7rem', padding: '2px 6px', background: '#EEF2FF', borderRadius: '4px' }}>Paciente internado</span>}
                                            </td>
                                            {/* Responsable (auto-matched or override) */}
                                            <td className="cart__td" style={{ position: 'relative' }}>
                                                {isJcorrea ? (
                                                    <div style={{ position: 'relative', display: 'inline-block' }}>
                                                        <button
                                                            onClick={e => {
                                                                e.stopPropagation();
                                                                if (responsableDropdownId === alta.id) {
                                                                    setResponsableDropdownId(null);
                                                                    setDropdownAnchor(null);
                                                                } else {
                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                    const spaceBelow = window.innerHeight - rect.bottom;
                                                                    setDropdownDir(spaceBelow < 280 ? 'up' : 'down');
                                                                    setResponsableDropdownId(alta.id);
                                                                    setDropdownAnchor({ id: alta.id, type: 'responsable', rect });
                                                                }
                                                            }}
                                                            style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                padding: '2px 8px', borderRadius: 'var(--radius-full)',
                                                                background: alta._responsable ? (alta.responsable_override ? '#ECFDF5' : '#EFF6FF') : '#F9FAFB',
                                                                color: alta._responsable ? (alta.responsable_override ? '#059669' : '#1E40AF') : '#94A3B8',
                                                                border: `1px solid ${alta.responsable_override ? '#A7F3D0' : alta._responsable ? '#BFDBFE' : '#E5E7EB'}`,
                                                                fontSize: '0.7rem', fontWeight: 700,
                                                                cursor: 'pointer', transition: 'all 0.15s',
                                                                whiteSpace: 'nowrap',
                                                            }}
                                                            onMouseOver={e => e.currentTarget.style.boxShadow = '0 0 0 2px #6366F130'}
                                                            onMouseOut={e => e.currentTarget.style.boxShadow = 'none'}
                                                            title={alta.responsable_override ? `Override manual (auto: ${alta._autoResponsable || '—'})` : 'Click para asignar responsable'}
                                                        >
                                                            {alta._responsable || '—'}
                                                            <ChevronDown size={10} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    alta._responsable ? (
                                                        <span style={{
                                                            display: 'inline-block', padding: '2px 8px', borderRadius: 'var(--radius-full)',
                                                            background: alta.responsable_override ? '#ECFDF5' : '#EFF6FF',
                                                            color: alta.responsable_override ? '#059669' : '#1E40AF',
                                                            fontSize: '0.7rem', fontWeight: 700,
                                                        }}>{alta._responsable}</span>
                                                    ) : <span style={{ color: 'var(--neutral-300)', fontSize: '0.75rem' }}>—</span>
                                                )}
                                            </td>
                                            {/* Facturación */}
                                            <td className="cart__td">
                                                {alta._isFacturada ? (
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                        padding: '2px 8px', borderRadius: 'var(--radius-full)',
                                                        background: '#ECFDF5', color: '#059669',
                                                        border: '1px solid #A7F3D0',
                                                        fontSize: '0.7rem', fontWeight: 700,
                                                        whiteSpace: 'nowrap',
                                                    }}>
                                                        <Receipt size={10} />
                                                        {alta.usuario_facturo || 'Facturada'}
                                                    </span>
                                                ) : alta._isDevueltaFac ? (
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                        padding: '2px 8px', borderRadius: 'var(--radius-full)',
                                                        background: '#FEF2F2', color: '#DC2626',
                                                        border: '1px solid #FECACA',
                                                        fontSize: '0.7rem', fontWeight: 700,
                                                        whiteSpace: 'nowrap',
                                                    }}>
                                                        🔙 Devuelta
                                                    </span>
                                                ) : (
                                                    <span style={{ color: 'var(--neutral-300)', fontSize: '0.75rem' }}>—</span>
                                                )}
                                            </td>
                                        </tr>,

                                        // ── Expanded Detail ──
                                        isExpanded && (
                                            <tr key={`${alta.id}-detail`}>
                                                <td colSpan={12} style={{
                                                    padding: 0, background: 'var(--neutral-50)',
                                                    borderLeft: `4px solid ${cfg?.color || '#CBD5E1'}`,
                                                    animation: 'fadeIn 0.2s ease-out',
                                                }}>
                                                    <div style={{
                                                        display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr',
                                                        gap: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)',
                                                    }}>
                                                        {/* COL 1: Datos Adicionales */}
                                                        <div>
                                                            <h4 style={{
                                                                margin: '0 0 10px', fontSize: '0.75rem', fontWeight: 700,
                                                                color: 'var(--neutral-400)', textTransform: 'uppercase', letterSpacing: '0.5px',
                                                            }}>
                                                                📋 Datos Adicionales
                                                            </h4>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                {[
                                                                    { label: 'N° Admisión', value: alta.numero_admision, icon: '🔢' },
                                                                    { label: 'Proceso', value: alta.proceso, icon: '📂' },
                                                                    { label: 'Motivo Alta', value: alta.motivo_alta, icon: '📝' },
                                                                ].map((item, i) => (
                                                                    <div key={i} style={{ display: 'flex', gap: '8px', fontSize: '0.8rem' }}>
                                                                        <span style={{ width: '22px', textAlign: 'center' }}>{item.icon}</span>
                                                                        <div>
                                                                            <div style={{ fontSize: '0.68rem', color: 'var(--neutral-400)', fontWeight: 600, textTransform: 'uppercase' }}>
                                                                                {item.label}
                                                                            </div>
                                                                            <div style={{ color: 'var(--neutral-700)', fontWeight: 500 }}>
                                                                                {item.value || '—'}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* COL 2: Observaciones (campo extenso) */}
                                                        <div>
                                                            <h4 style={{
                                                                margin: '0 0 10px', fontSize: '0.75rem', fontWeight: 700,
                                                                color: 'var(--neutral-400)', textTransform: 'uppercase', letterSpacing: '0.5px',
                                                            }}>
                                                                💬 Observaciones
                                                            </h4>
                                                            <div style={{
                                                                padding: '12px 14px', borderRadius: '10px',
                                                                background: '#fff', border: '1px solid var(--neutral-150, #E8ECF0)',
                                                                maxHeight: '200px', overflowY: 'auto',
                                                                fontSize: '0.82rem', lineHeight: 1.6,
                                                                color: alta.observaciones ? 'var(--neutral-700)' : 'var(--neutral-400)',
                                                                whiteSpace: 'pre-wrap',
                                                                wordBreak: 'break-word',
                                                            }}>
                                                                {alta.observaciones || 'Sin observaciones registradas.'}
                                                            </div>
                                                        </div>

                                                        {/* COL 3: Notas Internas */}
                                                        <div>
                                                            <h4 style={{
                                                                margin: '0 0 10px', fontSize: '0.75rem', fontWeight: 700,
                                                                color: 'var(--neutral-400)', textTransform: 'uppercase', letterSpacing: '0.5px',
                                                            }}>
                                                                📝 Notas Internas
                                                            </h4>
                                                            {editingNotas === alta.id ? (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                    <textarea
                                                                        value={notasText}
                                                                        onChange={e => setNotasText(e.target.value)}
                                                                        onClick={e => e.stopPropagation()}
                                                                        placeholder="Escribir nota interna..."
                                                                        style={{
                                                                            width: '100%', minHeight: '100px', padding: '10px 12px',
                                                                            borderRadius: '8px', border: '1px solid #6366F150',
                                                                            fontSize: '0.82rem', resize: 'vertical',
                                                                            fontFamily: 'inherit', lineHeight: 1.5,
                                                                        }}
                                                                        autoFocus
                                                                    />
                                                                    <div style={{ display: 'flex', gap: '6px' }}>
                                                                        <button
                                                                            onClick={e => { e.stopPropagation(); handleSaveNotas(alta.id); }}
                                                                            disabled={processing}
                                                                            style={{
                                                                                display: 'flex', alignItems: 'center', gap: '5px',
                                                                                padding: '6px 12px', borderRadius: '6px',
                                                                                background: '#6366F1', color: '#fff',
                                                                                border: 'none', cursor: 'pointer',
                                                                                fontSize: '0.75rem', fontWeight: 600,
                                                                            }}
                                                                        >
                                                                            <Save size={13} /> Guardar
                                                                        </button>
                                                                        <button
                                                                            onClick={e => { e.stopPropagation(); setEditingNotas(null); }}
                                                                            style={{
                                                                                padding: '6px 12px', borderRadius: '6px',
                                                                                background: '#F3F4F6', color: '#6B7280',
                                                                                border: 'none', cursor: 'pointer',
                                                                                fontSize: '0.75rem', fontWeight: 600,
                                                                            }}
                                                                        >
                                                                            Cancelar
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div
                                                                    onClick={e => {
                                                                        e.stopPropagation();
                                                                        setEditingNotas(alta.id);
                                                                        setNotasText(alta.notas_internas || '');
                                                                    }}
                                                                    style={{
                                                                        padding: '12px 14px', borderRadius: '10px',
                                                                        background: '#fff', border: '1px dashed var(--neutral-200)',
                                                                        minHeight: '80px', cursor: 'text',
                                                                        fontSize: '0.82rem', lineHeight: 1.6,
                                                                        color: alta.notas_internas ? 'var(--neutral-700)' : 'var(--neutral-400)',
                                                                        whiteSpace: 'pre-wrap',
                                                                        transition: 'border-color 0.2s',
                                                                    }}
                                                                    onMouseOver={e => e.currentTarget.style.borderColor = '#6366F150'}
                                                                    onMouseOut={e => e.currentTarget.style.borderColor = 'var(--neutral-200)'}
                                                                >
                                                                    {alta.notas_internas || 'Clic para agregar nota interna...'}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        ),
                                    ];
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* ── Barra de Paginación ── */}
                    {sortedAltas.length > PAGE_SIZE && (
                        <div className="pagination-bar">
                            <div className="pagination-bar__info">
                                Mostrando <strong>{paginationStart}–{paginationEnd}</strong> de <strong>{sortedAltas.length}</strong> registros
                            </div>
                            <div className="pagination-bar__controls">
                                <button
                                    className="pagination-btn pagination-btn--nav"
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                >
                                    <ChevronLeft size={14} /> Anterior
                                </button>
                                {getPageNumbers().map((page, idx) =>
                                    page === '...' ? (
                                        <span key={`dots-${idx}`} className="pagination-dots">…</span>
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
            </div>

            {/* ── Floating action bar (selección) ── */}
            {selectedIds.size > 0 && (
                <div className="animate-fade-in" style={{
                    position: 'sticky', bottom: '16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
                    padding: '12px 24px', borderRadius: '14px',
                    background: 'linear-gradient(135deg, #312E81, #4338CA)',
                    color: '#fff', boxShadow: '0 8px 30px rgba(67,56,202,0.4)',
                    zIndex: 100,
                }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                        {selectedIds.size} ficha{selectedIds.size !== 1 ? 's' : ''} seleccionada{selectedIds.size !== 1 ? 's' : ''}
                    </span>
                    <button onClick={handleEnviarAlCarrito}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '8px 20px', borderRadius: '8px',
                            background: '#fff', color: '#4338CA',
                            border: 'none', cursor: 'pointer',
                            fontSize: '0.82rem', fontWeight: 700,
                        }}>
                        <ShoppingCart size={16} /> Enviar al Carrito
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
            {/* ── Dropdown Portals ── */}
            {dropdownAnchor && (
                createPortal(
                    <>
                        <div
                            onClick={e => { e.stopPropagation(); setStatusDropdownId(null); setResponsableDropdownId(null); setDropdownAnchor(null); }}
                            style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 9998 }}
                        />
                        <div style={{
                            position: 'fixed',
                            [dropdownDir === 'up' ? 'bottom' : 'top']: dropdownDir === 'up' ? (window.innerHeight - dropdownAnchor.rect.top + 4) : (dropdownAnchor.rect.bottom + 4),
                            left: dropdownAnchor.rect.left,
                            zIndex: 9999,
                            background: '#fff',
                            borderRadius: '10px',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
                            padding: '4px',
                            minWidth: dropdownAnchor.type === 'status' ? '165px' : '150px',
                            animation: dropdownDir === 'up' ? 'fadeInUp 0.15s ease-out' : 'fadeIn 0.15s ease-out',
                        }}>
                            {dropdownAnchor.type === 'status' && (
                                Object.entries(ALTA_ESTADOS).map(([key, scfg]) => {
                                    const alta = sortedAltas.find(a => a.id === dropdownAnchor.id);
                                    if (!alta || key === 'Procesada') return null;
                                    return (
                                        <button
                                            key={key}
                                            onClick={e => {
                                                e.stopPropagation();
                                                handleEstadoChange(dropdownAnchor.id, key);
                                            }}
                                            disabled={processing}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '8px',
                                                width: '100%', padding: '7px 12px',
                                                border: 'none', borderRadius: '6px',
                                                background: alta.estado === key ? scfg.bg : 'transparent',
                                                color: scfg.color, cursor: 'pointer',
                                                fontSize: '0.76rem', fontWeight: 600,
                                                transition: 'background 0.1s',
                                                textAlign: 'left',
                                            }}
                                            onMouseOver={e => e.currentTarget.style.background = scfg.bg}
                                            onMouseOut={e => e.currentTarget.style.background = alta.estado === key ? scfg.bg : 'transparent'}
                                        >
                                            <span>{scfg.icon}</span>
                                            <span>{scfg.label}</span>
                                            {alta.estado === key && <span style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>✓</span>}
                                        </button>
                                    );
                                })
                            )}
                            {dropdownAnchor.type === 'responsable' && (
                                <>
                                    <div style={{ padding: '6px 10px', fontSize: '0.65rem', fontWeight: 700, color: 'var(--neutral-400)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #F3F4F6', marginBottom: '4px' }}>Asignar Responsable</div>
                                    {/* Opción: quitar override */}
                                    {(() => {
                                        const alta = sortedAltas.find(a => a.id === dropdownAnchor.id);
                                        if (alta?.responsable_override) {
                                            return (
                                                <button
                                                    onClick={async e => {
                                                        e.stopPropagation();
                                                        try {
                                                            await updateAltaResponsable(alta.id, null);
                                                            addToast?.('Responsable vuelto a automático', 'success');
                                                            setResponsableDropdownId(null);
                                                            setDropdownAnchor(null);
                                                            loadData();
                                                        } catch (err) {
                                                            addToast?.('Error: ' + err.message, 'error');
                                                        }
                                                    }}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: '6px',
                                                        width: '100%', padding: '7px 12px',
                                                        border: 'none', borderRadius: '6px',
                                                        background: 'transparent', color: '#DC2626',
                                                        cursor: 'pointer', fontSize: '0.74rem', fontWeight: 600,
                                                        textAlign: 'left',
                                                    }}
                                                    onMouseOver={e => e.currentTarget.style.background = '#FEF2F2'}
                                                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <X size={13} /> Automático
                                                </button>
                                            );
                                        }
                                        return null;
                                    })()}
                                    {allResponsables.map(resp => {
                                        const alta = sortedAltas.find(a => a.id === dropdownAnchor.id);
                                        if (!alta) return null;
                                        return (
                                            <button
                                                key={resp}
                                                onClick={async e => {
                                                    e.stopPropagation();
                                                    try {
                                                        await updateAltaResponsable(dropdownAnchor.id, resp);
                                                        addToast?.(`Responsable → ${resp}`, 'success');
                                                        setResponsableDropdownId(null);
                                                        setDropdownAnchor(null);
                                                        loadData();
                                                    } catch (err) {
                                                        addToast?.('Error: ' + err.message, 'error');
                                                    }
                                                }}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '8px',
                                                    width: '100%', padding: '7px 12px',
                                                    border: 'none', borderRadius: '6px',
                                                    background: alta._responsable === resp ? '#EFF6FF' : 'transparent',
                                                    color: '#1E40AF', cursor: 'pointer',
                                                    fontSize: '0.74rem', fontWeight: 600,
                                                    transition: 'all 0.1s', textAlign: 'left',
                                                }}
                                                onMouseOver={e => e.currentTarget.style.background = '#EFF6FF'}
                                                onMouseOut={e => e.currentTarget.style.background = alta._responsable === resp ? '#EFF6FF' : 'transparent'}
                                            >
                                                <span>{resp}</span>
                                                {alta._responsable === resp && <span style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>✓</span>}
                                            </button>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    </>,
                    document.body
                )
            )}
</div>
    );
}
