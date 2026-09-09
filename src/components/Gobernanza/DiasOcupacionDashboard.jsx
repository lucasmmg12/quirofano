import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { 
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, 
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { 
    BookOpen, Filter, Calendar, Bed, Activity, Users, 
    AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, RotateCcw, 
    X, FileText, Layers, PanelLeftClose, PanelLeftOpen, LayoutDashboard, 
    Sparkles, RefreshCw, Sliders, Table, Eye, Download, Clock, HeartHandshake,
    Check, Maximize2, CheckSquare, Square, GripVertical, Move
} from 'lucide-react';
import SalusSyncButton from '../SalusSyncButton';
import TelarCatalogoDrawer from './TelarCatalogoDrawer';
import TelarDataModal from './TelarDataModal';
import UciGanttChart from './UciGanttChart';
import DraggableChartCard from './DraggableChartCard';
import { SECTORES_CONFIG, INDICADORES_CATALOGO, DEFAULT_ACTIVE_INDICATOR_IDS } from './telarConfig';

const SIDEBAR_INDICATOR_GROUPS = [
    {
        id: 'kpis',
        title: 'Métricas Clave & KPIs',
        icon: '📌',
        badge: 'Scorecards',
        ids: [
            'kpi_dias_ocupados',
            'kpi_dias_disponibles',
            'kpi_porc_ocupacion',
            'kpi_alos',
            'kpi_porc_defuncion',
            'kpi_intensidad_diagnostica'
        ]
    },
    {
        id: 'gestion',
        title: 'Gráficos de Gestión Hospitalaria',
        icon: '📊',
        badge: 'Admisiones',
        ids: [
            'chart_especialidades',
            'chart_admisiones_totales',
            'chart_motivos_alta',
            'chart_rango_etario',
            'chart_estancias',
            'chart_procedencia',
            'chart_clientes'
        ]
    },
    {
        id: 'diagnostico',
        title: 'Soporte Diagnóstico (VLISE)',
        icon: '🔬',
        badge: 'Laboratorio / RX',
        ids: [
            'chart_produccion_origen',
            'chart_estudios_por_box',
            'chart_top_estudios_uci',
            'chart_solicitantes_uci'
        ]
    },
    {
        id: 'auditoria',
        title: 'Auditoría y Trazabilidad',
        icon: '📋',
        badge: 'Datos Crudos',
        ids: [
            'table_peticiones_detalle'
        ]
    }
];

const DEFAULT_CHART_ORDER = [
    'chart_especialidades',
    'chart_admisiones_totales',
    'chart_motivos_alta',
    'chart_rango_etario',
    'chart_estancias',
    'chart_procedencia',
    'chart_clientes',
    'chart_produccion_origen',
    'chart_estudios_por_box',
    'chart_top_estudios_uci',
    'chart_solicitantes_uci',
    'table_peticiones_detalle'
];

const DEFAULT_CHART_SIZES = {
    chart_especialidades: { width: 'half', height: 260 },
    chart_admisiones_totales: { width: 'half', height: 260 },
    chart_motivos_alta: { width: 'half', height: 240 },
    chart_rango_etario: { width: 'half', height: 240 },
    chart_estancias: { width: 'half', height: 250 },
    chart_procedencia: { width: 'half', height: 240 },
    chart_clientes: { width: 'half', height: 240 },
    chart_produccion_origen: { width: 'half', height: 250 },
    chart_estudios_por_box: { width: 'half', height: 250 },
    chart_top_estudios_uci: { width: 'half', height: 250 },
    chart_solicitantes_uci: { width: 'half', height: 250 },
    table_peticiones_detalle: { width: 'full', height: 320 }
};

const COLORS_ETARIO = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'];
const COLORS_MOTIVO = ['#F97316', '#EF4444', '#06B6D4', '#8B5CF6', '#10B981', '#6B7280'];
const COLORS_ESTANCIA = {
    corta: '#3B82F6',   // 1-2 días (Azul)
    media: '#F97316',   // 3-7 días (Naranja)
    larga: '#EF4444'    // >7 días (Rojo)
};

const ESPECIALIDAD_PALETTE = [
    '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', 
    '#14B8A6', '#6366F1', '#F97316', '#06B6D4', '#84CC16',
    '#A855F7', '#EAB308', '#64748B', '#D946EF', '#0EA5E9'
];

export default function DiasOcupacionDashboard({ onOpenInfografia, onMetricsUpdate, addToast }) {
    // === ESTADOS DE NAVEGACIÓN Y SECTOR ===
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [sectorId, setSectorId] = useState('UCI');
    const [uciSubNivel, setUciSubNivel] = useState('CONSOLIDADO'); // 'CONSOLIDADO' | 'INTENSIVA' | 'INTERMEDIA'
    const [viewMode, setViewMode] = useState('dashboard'); // 'dashboard' | 'gantt'
    const [selectedEspecialidades, setSelectedEspecialidades] = useState(null); // null = todas activas
    const [especDropdownOpen, setEspecDropdownOpen] = useState(false);
    const especDropdownRef = useRef(null);
    const [camasTotales, setCamasTotales] = useState(16);
    const [fechaDesde, setFechaDesde] = useState('2026-01-01');
    const [fechaHasta, setFechaHasta] = useState(() => new Date().toISOString().split('T')[0]);

    // === ESTADOS MODULARES DE INDICADORES ===
    const [activeIndicatorIds, setActiveIndicatorIds] = useState(() => {
        try {
            const saved = localStorage.getItem('telar_active_indicators_v2');
            return saved ? JSON.parse(saved) : DEFAULT_ACTIVE_INDICATOR_IDS;
        } catch {
            return DEFAULT_ACTIVE_INDICATOR_IDS;
        }
    });

    const [isCatalogoOpen, setIsCatalogoOpen] = useState(false);
    const [inspectDataIndicator, setInspectDataIndicator] = useState(null);

    // === ESTADOS DE REORDENAMIENTO Y REDIMENSIONAMIENTO DE GRÁFICOS ===
    const [chartOrder, setChartOrder] = useState(() => {
        try {
            const saved = localStorage.getItem('telar_chart_order_v2');
            if (saved) {
                const parsed = JSON.parse(saved);
                const missing = DEFAULT_CHART_ORDER.filter(id => !parsed.includes(id));
                return [...parsed, ...missing];
            }
            return DEFAULT_CHART_ORDER;
        } catch {
            return DEFAULT_CHART_ORDER;
        }
    });

    const [chartSizes, setChartSizes] = useState(() => {
        try {
            const saved = localStorage.getItem('telar_chart_sizes_v2');
            return saved ? JSON.parse(saved) : DEFAULT_CHART_SIZES;
        } catch {
            return DEFAULT_CHART_SIZES;
        }
    });

    const [draggedChartId, setDraggedChartId] = useState(null);
    const [dragOverChartId, setDragOverChartId] = useState(null);

    // Guardar indicadores activos en localStorage
    useEffect(() => {
        try {
            localStorage.setItem('telar_active_indicators_v2', JSON.stringify(activeIndicatorIds));
        } catch {}
    }, [activeIndicatorIds]);

    const handleToggleIndicator = (id) => {
        setActiveIndicatorIds(prev => {
            if (prev.includes(id)) {
                if (prev.length <= 1) {
                    addToast?.('Debe haber al menos un indicador activo en el Telar', 'info');
                    return prev;
                }
                return prev.filter(item => item !== id);
            } else {
                if (!chartOrder.includes(id)) {
                    setChartOrder(curr => [...curr, id]);
                }
                return [...prev, id];
            }
        });
    };

    const handleSelectAllIndicators = () => {
        const allIds = INDICADORES_CATALOGO.map(i => i.id);
        setActiveIndicatorIds(allIds);
        addToast?.('Todos los indicadores activados en el Telar', 'success');
    };

    const handleResetDefaults = () => {
        setActiveIndicatorIds(DEFAULT_ACTIVE_INDICATOR_IDS);
        addToast?.('Indicadores predeterminados restablecidos', 'success');
    };

    const handleChartSizeChange = (id, newSize) => {
        setChartSizes(prev => {
            const updated = { ...prev, [id]: { ...(prev[id] || {}), ...newSize } };
            try {
                localStorage.setItem('telar_chart_sizes_v2', JSON.stringify(updated));
            } catch {}
            return updated;
        });
    };

    const handleDragStartChart = (e, id) => {
        setDraggedChartId(id);
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOverChart = (e, id) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverChartId !== id) {
            setDragOverChartId(id);
        }
    };

    const handleDragLeaveChart = (e, id) => {
        if (dragOverChartId === id) {
            setDragOverChartId(null);
        }
    };

    const handleDropChart = (targetId) => {
        if (!draggedChartId || draggedChartId === targetId) {
            setDraggedChartId(null);
            setDragOverChartId(null);
            return;
        }
        setChartOrder(prev => {
            const oldIndex = prev.indexOf(draggedChartId);
            const newIndex = prev.indexOf(targetId);
            if (oldIndex === -1 || newIndex === -1) return prev;
            const updated = [...prev];
            const [removed] = updated.splice(oldIndex, 1);
            updated.splice(newIndex, 0, removed);
            try {
                localStorage.setItem('telar_chart_order_v2', JSON.stringify(updated));
            } catch {}
            return updated;
        });
        setDraggedChartId(null);
        setDragOverChartId(null);
    };

    const handleDragEndChart = () => {
        setDraggedChartId(null);
        setDragOverChartId(null);
    };

    const handleMoveChart = (id, direction) => {
        setChartOrder(prev => {
            const idx = prev.indexOf(id);
            if (idx === -1) return prev;
            const newIdx = idx + direction;
            if (newIdx < 0 || newIdx >= prev.length) return prev;
            const updated = [...prev];
            const temp = updated[idx];
            updated[idx] = updated[newIdx];
            updated[newIdx] = temp;
            try {
                localStorage.setItem('telar_chart_order_v2', JSON.stringify(updated));
            } catch {}
            return updated;
        });
    };

    const handleResetChartLayout = () => {
        setChartOrder(DEFAULT_CHART_ORDER);
        setChartSizes(DEFAULT_CHART_SIZES);
        try {
            localStorage.removeItem('telar_chart_order_v2');
            localStorage.removeItem('telar_chart_sizes_v2');
        } catch {}
        addToast?.('Disposición y tamaños de gráficos restablecidos', 'success');
    };

    // Estados de Datos de Ocupación
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState([]);
    const [especialidadesDisponibles, setEspecialidadesDisponibles] = useState([]);

    // Estados de Datos de Peticiones y Estudios Clínicos (VLISE)
    const [peticionesResumen, setPeticionesResumen] = useState([]);
    const [peticionesResumenGobernanza, setPeticionesResumenGobernanza] = useState([]);
    const [peticionesEstudios, setPeticionesEstudios] = useState([]);
    const [origenVision, setOrigenVision] = useState('gobernanza'); // 'gobernanza' | 'nominal'
    const [modalidadFiltro, setModalidadFiltro] = useState('TODAS'); // 'TODAS' | 'Laboratorio' | 'Imágenes'
    const [boxFiltro, setBoxFiltro] = useState('TODOS'); // 'TODOS' o 'BOX 1', etc.
    const [loadingPeticiones, setLoadingPeticiones] = useState(false);
    
    // Modal de Documentación Técnica
    const [showDocModal, setShowDocModal] = useState(false);

    // Manejador para cerrar el dropdown de especialidades al hacer click afuera
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (especDropdownRef.current && !especDropdownRef.current.contains(event.target)) {
                setEspecDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleToggleEspecialidad = (esp) => {
        if (selectedEspecialidades === null) {
            setSelectedEspecialidades(especialidadesDisponibles.filter(e => e !== esp));
        } else if (selectedEspecialidades.includes(esp)) {
            const next = selectedEspecialidades.filter(e => e !== esp);
            setSelectedEspecialidades(next);
        } else {
            const next = [...selectedEspecialidades, esp];
            if (next.length >= especialidadesDisponibles.length) {
                setSelectedEspecialidades(null);
            } else {
                setSelectedEspecialidades(next);
            }
        }
    };

    const handleSelectAllEspecialidades = () => {
        setSelectedEspecialidades(null);
    };

    const handleClearAllEspecialidades = () => {
        setSelectedEspecialidades([]);
    };

    const handleSelectOnlyEspecialidad = (esp) => {
        setSelectedEspecialidades([esp]);
    };

    // Configuración del sector activo
    const activeSectorConfig = useMemo(() => {
        return SECTORES_CONFIG.find(s => s.id === sectorId) || SECTORES_CONFIG[0];
    }, [sectorId]);

    // Cuando cambia el sector, actualizar camas por defecto
    const handleSelectSector = (sId) => {
        setSectorId(sId);
        setSelectedEspecialidades(null);
        setBoxFiltro('TODOS');
        const cfg = SECTORES_CONFIG.find(s => s.id === sId);
        if (cfg) {
            setCamasTotales(cfg.camasDefault);
        }
        if (sId === 'UCI') {
            setUciSubNivel('CONSOLIDADO');
        }
    };

    // Manejo de cambio de subnivel en UCI (Intensiva vs Intermedia vs Consolidado)
    const handleSelectUciSubNivel = (sub) => {
        setUciSubNivel(sub);
        setBoxFiltro('TODOS');
        if (sub === 'CONSOLIDADO') setCamasTotales(16);
        else if (sub === 'INTENSIVA') setCamasTotales(8);
        else if (sub === 'INTERMEDIA') setCamasTotales(8);
    };

    // Presets rápidos de rango de fechas
    const handleSetDatePreset = (preset) => {
        const today = new Date().toISOString().split('T')[0];
        setFechaHasta(today);
        if (preset === '30d') {
            const d = new Date();
            d.setDate(d.getDate() - 30);
            setFechaDesde(d.toISOString().split('T')[0]);
        } else if (preset === '90d') {
            const d = new Date();
            d.setDate(d.getDate() - 90);
            setFechaDesde(d.toISOString().split('T')[0]);
        } else if (preset === '2026') {
            setFechaDesde('2026-01-01');
        } else if (preset === 'historico') {
            setFechaDesde('2025-06-01');
        }
    };

    // Cargar datos desde Supabase
    useEffect(() => {
        fetchData();
    }, [sectorId, fechaDesde, fechaHasta]);

    const fetchData = async () => {
        setLoading(true);
        setLoadingPeticiones(true);
        try {
            // 1. Cargar Días Camas de Ocupación (paginado para superar límite de 1000 registros de Supabase)
            let allRows = [];
            let page = 0;
            const pageSize = 1000;
            let hasMore = true;

            while (hasMore) {
                let q = supabase
                    .from('calidad_admisiones_ocupacion')
                    .select('id, id_admision, numero_admision, fecha_ocupacion, fecha_ingreso, fecha_alta, especialidad, servicio, paciente, nhc, motivo_de_alta, cliente, procedencia, edad')
                    .gte('fecha_ocupacion', fechaDesde)
                    .lte('fecha_ocupacion', fechaHasta)
                    .range(page * pageSize, (page + 1) * pageSize - 1);

                if (sectorId === 'UCI') {
                    q = q.in('servicio', ['UCI', 'TERAPIA INTERMEDIA']);
                } else if (sectorId && sectorId !== 'TODOS') {
                    q = q.eq('servicio', sectorId);
                }

                const { data: pageData, error } = await q;
                if (error) throw error;

                if (pageData && pageData.length > 0) {
                    allRows = allRows.concat(pageData);
                    if (pageData.length < pageSize || allRows.length >= 25000) {
                        hasMore = false;
                    } else {
                        page++;
                    }
                } else {
                    hasMore = false;
                }
            }

            setRows(allRows);

            // Extraer especialidades dinámicas
            const especSet = new Set();
            allRows.forEach(r => {
                if (r.especialidad) especSet.add(r.especialidad.trim());
            });
            setEspecialidadesDisponibles(Array.from(especSet).sort());

            // 2. Cargar Resumen Global por Origen (Query 2 Nominal) y Resumen Gobernanza Reclasificado
            try {
                const [resOrigen, resGob] = await Promise.all([
                    supabase.from('calidad_peticiones_resumen_origen').select('*').order('cantidad_estudios', { ascending: false }),
                    supabase.from('calidad_peticiones_resumen_gobernanza').select('*').order('cantidad_estudios', { ascending: false })
                ]);
                if (resOrigen.data && resOrigen.data.length > 0) {
                    setPeticionesResumen(resOrigen.data);
                }
                if (resGob.data && resGob.data.length > 0) {
                    setPeticionesResumenGobernanza(resGob.data);
                }
            } catch (errRes) {
                console.warn('Advertencia cargando resúmenes de origen y gobernanza:', errRes);
            }

            // 3. Cargar Estudios Clínicos de UCI (Laboratorio, RX Tórax, etc.)
            try {
                // Consultamos estudios asociados a boxes y unidades de UCI en páginas paralelas (hasta 10.000 estudios)
                const pageSize = 1000;
                const pages = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
                const promises = pages.map(p =>
                    supabase
                        .from('calidad_peticiones_pruebas')
                        .select('id, id_peticion, fecha_solicitud, paciente, id_paciente, solicitante, paciente_edad, origen, tipo_visita, tipo_articulo, estudio, habitacion, cama, seccion, modalidad, origen_gobernanza')
                        .gte('fecha_solicitud', fechaDesde + 'T00:00:00')
                        .lte('fecha_solicitud', fechaHasta + 'T23:59:59')
                        .or('habitacion.ilike.%BOX%,habitacion.ilike.%UNIDAD%,habitacion.ilike.%222%,habitacion.ilike.%223%,habitacion.ilike.%224%,habitacion.ilike.%226%,habitacion.ilike.%227%,habitacion.ilike.%228%,habitacion.ilike.%229%')
                        .order('fecha_solicitud', { ascending: false })
                        .range(p * pageSize, (p + 1) * pageSize - 1)
                );

                const results = await Promise.all(promises);
                let allPeticiones = [];
                results.forEach(res => {
                    if (res.data && res.data.length > 0) {
                        allPeticiones = allPeticiones.concat(res.data);
                    }
                });
                setPeticionesEstudios(allPeticiones);
            } catch (errPet) {
                console.warn('Advertencia cargando estudios clínicos:', errPet);
            }

        } catch (err) {
            console.error('Error al cargar datos de gobernanza:', err);
        } finally {
            setLoading(false);
            setLoadingPeticiones(false);
        }
    };

    // Filtrar filas según Sub-Nivel de UCI y Especialidades seleccionadas (Multi-Select)
    const filteredRows = useMemo(() => {
        let list = rows;
        if (sectorId === 'UCI') {
            if (uciSubNivel === 'INTENSIVA') {
                list = list.filter(r => (r.servicio || '').trim().toUpperCase() === 'UCI');
            } else if (uciSubNivel === 'INTERMEDIA') {
                list = list.filter(r => (r.servicio || '').trim().toUpperCase() === 'TERAPIA INTERMEDIA');
            }
        }
        if (selectedEspecialidades !== null) {
            list = list.filter(r => r.especialidad && selectedEspecialidades.includes(r.especialidad.trim()));
        }
        return list;
    }, [rows, sectorId, uciSubNivel, selectedEspecialidades]);

    // === CÁLCULO DE KPIS E INDICADORES ===
    const metrics = useMemo(() => {
        const diasOcupados = filteredRows.length;

        // Calcular días del período
        const dStart = new Date(fechaDesde);
        const dEnd = new Date(fechaHasta);
        const diffMs = Math.max(0, dEnd - dStart);
        const diasPeriodo = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1);

        const camasDisponibles = Number(camasTotales || 0) * diasPeriodo;
        const porcOcupacion = camasDisponibles > 0 
            ? ((diasOcupados / camasDisponibles) * 100).toFixed(1) 
            : '0.0';

        // Admisiones únicas en el período filtrado
        const admisionesMap = new Map();
        filteredRows.forEach(r => {
            const key = r.id_admision || r.numero_admision;
            if (!admisionesMap.has(key)) {
                admisionesMap.set(key, r);
            }
        });
        const admisionesUnicas = Array.from(admisionesMap.values());
        const totalAdmisiones = admisionesUnicas.length;

        // Tasa de defunción (% defunción sobre egresos/admisiones únicas)
        const defunciones = admisionesUnicas.filter(r => {
            const m = (r.motivo_de_alta || '').toLowerCase();
            return m.includes('defunci') || m.includes('fallecid') || m.includes('obito');
        }).length;

        const porcDefuncion = totalAdmisiones > 0 
            ? ((defunciones / totalAdmisiones) * 100).toFixed(1) 
            : '0.0';

        // Promedio de Estancia (ALOS)
        let sumEstancia = 0;
        let countEstancia = 0;
        admisionesUnicas.forEach(r => {
            if (r.fecha_ingreso && r.fecha_alta) {
                const diffTime = Math.abs(new Date(r.fecha_alta) - new Date(r.fecha_ingreso));
                const days = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
                sumEstancia += days;
                countEstancia++;
            }
        });
        const alos = countEstancia > 0 ? (sumEstancia / countEstancia).toFixed(1) : '—';

        // 1. Gráfico: Admisiones por Especialidad por Mes
        const mesesSet = new Set();
        filteredRows.forEach(r => {
            if (r.fecha_ocupacion) {
                mesesSet.add(r.fecha_ocupacion.substring(0, 7));
            }
        });
        const mesesSorted = Array.from(mesesSet).sort();

        const especialidadPorMes = {};
        mesesSorted.forEach(m => {
            especialidadPorMes[m] = {};
        });

        const topEspecialidadesSet = new Set();
        filteredRows.forEach(r => {
            const m = r.fecha_ocupacion?.substring(0, 7);
            const esp = r.especialidad ? r.especialidad.trim() : 'Sin Especialidad';
            if (m && especialidadPorMes[m]) {
                especialidadPorMes[m][esp] = (especialidadPorMes[m][esp] || 0) + 1;
                topEspecialidadesSet.add(esp);
            }
        });

        const topEspecialidades = Array.from(topEspecialidadesSet).slice(0, 15);
        const dataEspecialidades = mesesSorted.map(m => {
            const dObj = new Date(m + '-01T12:00:00');
            const mesNombre = dObj.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
            const item = { mesKey: m, mes: mesNombre };
            topEspecialidades.forEach(esp => {
                item[esp] = especialidadPorMes[m][esp] || 0;
            });
            return item;
        });

        // 2. Gráfico: Admisiones Totales por Mes
        const admisionesPorMesMap = {};
        admisionesUnicas.forEach(r => {
            const m = r.fecha_ingreso ? r.fecha_ingreso.substring(0, 7) : null;
            if (m) {
                admisionesPorMesMap[m] = (admisionesPorMesMap[m] || 0) + 1;
            }
        });
        const dataAdmisionesTotales = mesesSorted.map(m => {
            const dObj = new Date(m + '-01T12:00:00');
            const mesNombre = dObj.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
            return {
                mesKey: m,
                mes: mesNombre,
                total: admisionesPorMesMap[m] || 0
            };
        });

        // 3. Gráfico: Motivos de Alta
        const motivosMap = {};
        admisionesUnicas.forEach(r => {
            let m = (r.motivo_de_alta || 'Sin Alta Registrada').trim();
            if (m.toLowerCase().includes('alta m')) m = 'Alta médica';
            else if (m.toLowerCase().includes('traslado a otro')) m = 'Traslado a otro centro';
            else if (m.toLowerCase().includes('defunci')) m = 'Defunción';
            else if (m.toLowerCase().includes('voluntari')) m = 'Alta voluntaria';
            motivosMap[m] = (motivosMap[m] || 0) + 1;
        });
        const dataMotivosAlta = Object.keys(motivosMap)
            .map((k, idx) => ({
                label: k,
                value: motivosMap[k],
                color: COLORS_MOTIVO[idx % COLORS_MOTIVO.length]
            }))
            .sort((a, b) => b.value - a.value);

        // 4. Gráfico: Rango Etario
        const etarioMap = { 'Pediátrico (0-17)': 0, 'Adulto Joven (18-45)': 0, 'Adulto (46-65)': 0, 'Mayor (>65)': 0 };
        admisionesUnicas.forEach(r => {
            const edad = Number(r.edad);
            if (isNaN(edad)) return;
            if (edad <= 17) etarioMap['Pediátrico (0-17)']++;
            else if (edad <= 45) etarioMap['Adulto Joven (18-45)']++;
            else if (edad <= 65) etarioMap['Adulto (46-65)']++;
            else etarioMap['Mayor (>65)']++;
        });
        const dataRangoEtario = Object.keys(etarioMap).map((k, idx) => ({
            label: k,
            value: etarioMap[k],
            color: COLORS_ETARIO[idx % COLORS_ETARIO.length]
        }));

        // 5. Gráfico: Categorías de Estancias
        const estanciasPorMes = {};
        mesesSorted.forEach(m => {
            estanciasPorMes[m] = { corta: 0, media: 0, larga: 0 };
        });
        admisionesUnicas.forEach(r => {
            if (r.fecha_ingreso) {
                const m = r.fecha_ingreso.substring(0, 7);
                if (estanciasPorMes[m]) {
                    let dias = 1;
                    if (r.fecha_alta) {
                        const diffTime = Math.abs(new Date(r.fecha_alta) - new Date(r.fecha_ingreso));
                        dias = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
                    }
                    if (dias <= 2) estanciasPorMes[m].corta++;
                    else if (dias <= 7) estanciasPorMes[m].media++;
                    else estanciasPorMes[m].larga++;
                }
            }
        });
        const dataEstancias = mesesSorted.map(m => {
            const dObj = new Date(m + '-01T12:00:00');
            const mesNombre = dObj.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
            return {
                mesKey: m,
                mes: mesNombre,
                corta: estanciasPorMes[m].corta,
                media: estanciasPorMes[m].media,
                larga: estanciasPorMes[m].larga
            };
        });

        // 6. Gráfico: Procedencia
        const procedenciaMap = {};
        admisionesUnicas.forEach(r => {
            const p = (r.procedencia || 'Sin Procedencia').trim();
            procedenciaMap[p] = (procedenciaMap[p] || 0) + 1;
        });
        const dataProcedencia = Object.keys(procedenciaMap)
            .map((k, idx) => ({
                label: k,
                value: procedenciaMap[k],
                color: ESPECIALIDAD_PALETTE[idx % ESPECIALIDAD_PALETTE.length]
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 6);

        // 7. Gráfico: Obras Sociales / Clientes
        const clientesMap = {};
        admisionesUnicas.forEach(r => {
            const c = (r.cliente || 'Particular').trim();
            clientesMap[c] = (clientesMap[c] || 0) + 1;
        });
        const dataClientes = Object.keys(clientesMap)
            .map((k, idx) => ({
                label: k,
                value: clientesMap[k],
                color: ESPECIALIDAD_PALETTE[idx % ESPECIALIDAD_PALETTE.length]
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8);

        // 8. Normalización de Habitaciones y Detección de Modalidad Clínica
        const normalizeHab = (hab) => {
            if (!hab) return 'Sin Asignar';
            const h = hab.trim().toUpperCase();
            const boxM = h.match(/^BOX\s*0?([1-8])$/i) || h.match(/^BOX\s*AUXILIAR\s*0?([1-8])$/i);
            if (boxM) return 'BOX ' + boxM[1];
            const uniM = h.match(/^UNIDAD\s*0?([1-5])$/i);
            if (uniM) return 'UNIDAD ' + uniM[1].padStart(2, '0');
            return h;
        };

        const getStudyModality = (p) => {
            const ta = (p.tipo_articulo || '').toLowerCase();
            const est = (p.estudio || '').toLowerCase();
            const mod = (p.modalidad || '').toLowerCase();
            if (ta.includes('radiologia') || mod.includes('imág') || est.includes('radiografia') || est.includes('ecografia') || est.includes('tac')) {
                return 'Imágenes / RX';
            }
            if (est.includes('anatomopatol')) {
                return 'Anatomía Patológica';
            }
            return 'Laboratorio & Bioquímica';
        };

        // 9. Filtrado de Estudios Base para UCI según subnivel y box seleccionado
        const baseUciPeticiones = peticionesEstudios.filter(p => {
            const normH = normalizeHab(p.habitacion);
            if (sectorId === 'UCI') {
                if (uciSubNivel === 'INTENSIVA' && !normH.startsWith('BOX')) return false;
                if (uciSubNivel === 'INTERMEDIA' && normH.startsWith('BOX')) return false;
            }
            if (boxFiltro !== 'TODOS' && normH !== boxFiltro) return false;
            return true;
        });

        const totalBaseUci = baseUciPeticiones.length;

        // Composición Diagnóstica Dinámica según filtros activos
        const modCounts = {
            'Laboratorio & Bioquímica': 0,
            'Imágenes / RX': 0,
            'Anatomía Patológica': 0
        };
        baseUciPeticiones.forEach(p => {
            const m = getStudyModality(p);
            if (modCounts[m] !== undefined) modCounts[m]++;
            else modCounts['Laboratorio & Bioquímica']++;
        });

        const MOD_COLORS = {
            'Laboratorio & Bioquímica': '#2563EB',
            'Imágenes / RX': '#F59E0B',
            'Anatomía Patológica': '#8B5CF6'
        };

        const dataModalidadesUci = [
            { name: 'Laboratorio & Bioquímica', value: modCounts['Laboratorio & Bioquímica'], pct: totalBaseUci > 0 ? ((modCounts['Laboratorio & Bioquímica'] / totalBaseUci) * 100).toFixed(1) : '0.0', color: MOD_COLORS['Laboratorio & Bioquímica'] },
            { name: 'Diagnóstico por Imágenes / RX', value: modCounts['Imágenes / RX'], pct: totalBaseUci > 0 ? ((modCounts['Imágenes / RX'] / totalBaseUci) * 100).toFixed(1) : '0.0', color: MOD_COLORS['Imágenes / RX'] },
            { name: 'Anatomía Patológica', value: modCounts['Anatomía Patológica'], pct: totalBaseUci > 0 ? ((modCounts['Anatomía Patológica'] / totalBaseUci) * 100).toFixed(1) : '0.0', color: MOD_COLORS['Anatomía Patológica'] }
        ].filter(item => item.value > 0);

        // Filtrado adicional si se selecciona una modalidad específica en la barra
        const peticionesFiltradas = baseUciPeticiones.filter(p => {
            if (modalidadFiltro === 'TODAS') return true;
            const mod = getStudyModality(p);
            if (modalidadFiltro === 'Laboratorio') return mod === 'Laboratorio & Bioquímica';
            if (modalidadFiltro === 'Imágenes') return mod === 'Imágenes / RX';
            if (modalidadFiltro === 'Patología') return mod === 'Anatomía Patológica';
            return true;
        });

        // 10. Intensidad Diagnóstica (Estudios / Días Camas Ocupados)
        const totalEstudiosSector = peticionesFiltradas.length;
        const intensidadCamaDia = diasOcupados > 0 
            ? (totalEstudiosSector / diasOcupados).toFixed(2) 
            : '0.00';
        const estudiosPorAdmision = totalAdmisiones > 0 
            ? (totalEstudiosSector / totalAdmisiones).toFixed(1) 
            : '0.0';

        // 11. Distribución de Estudios por Box / Cama
        const boxCounts = {};
        const boxesSet = new Set();
        peticionesEstudios.forEach(p => {
            if (!p.habitacion) return;
            const habNorm = normalizeHab(p.habitacion);

            if (sectorId === 'UCI') {
                if (uciSubNivel === 'INTENSIVA' && !habNorm.startsWith('BOX')) return;
                if (uciSubNivel === 'INTERMEDIA' && habNorm.startsWith('BOX')) return;
            }

            boxesSet.add(habNorm);
            boxCounts[habNorm] = (boxCounts[habNorm] || 0) + 1;
        });
        const boxesDisponibles = Array.from(boxesSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        const totalEstudiosBaseBox = Object.values(boxCounts).reduce((a, b) => a + b, 0);
        const dataEstudiosPorBox = Object.entries(boxCounts)
            .map(([box, count], idx) => ({
                box,
                count,
                porcentaje: totalEstudiosBaseBox > 0 ? ((count / totalEstudiosBaseBox) * 100).toFixed(1) : '0.0',
                color: ESPECIALIDAD_PALETTE[idx % ESPECIALIDAD_PALETTE.length]
            }))
            .sort((a, b) => a.box.localeCompare(b.box, undefined, { numeric: true, sensitivity: 'base' }));

        // 12. Gráfico: Top Pruebas y Estudios Clínicos
        const estudiosCounts = {};
        peticionesFiltradas.forEach(p => {
            let est = (p.estudio || '').replace(/<[^>]+>/g, '').trim();
            if (!est || est === 'SIN DETALLE') return;
            if (est.startsWith('*** PETICION ANAL')) est = 'Rutina Bioquímica / Analítica Completa';
            else if (est.startsWith('*** PETICION RADIOL')) est = 'Radiología en Cama / Tórax';
            estudiosCounts[est] = (estudiosCounts[est] || 0) + 1;
        });
        const dataTopEstudios = Object.entries(estudiosCounts)
            .map(([label, value], idx) => ({
                label,
                value,
                color: ESPECIALIDAD_PALETTE[idx % ESPECIALIDAD_PALETTE.length]
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);

        // 13. Gráfico: Top Médicos Solicitantes
        const solicitantesCounts = {};
        peticionesFiltradas.forEach(p => {
            let sol = p.solicitante;
            if (!sol || sol.trim() === '') return;
            sol = sol.trim();
            solicitantesCounts[sol] = (solicitantesCounts[sol] || 0) + 1;
        });
        const dataTopSolicitantes = Object.entries(solicitantesCounts)
            .map(([label, value], idx) => ({
                label,
                value,
                color: ESPECIALIDAD_PALETTE[idx % ESPECIALIDAD_PALETTE.length]
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8);

        return {
            diasOcupados,
            camasDisponibles,
            porcOcupacion,
            porcDefuncion,
            alos,
            totalAdmisiones,
            defunciones,
            dataEspecialidades,
            topEspecialidades,
            dataAdmisionesTotales,
            dataMotivosAlta,
            dataRangoEtario,
            dataEstancias,
            dataProcedencia,
            dataClientes,
            dataModalidadesUci,
            totalBaseUci,
            intensidadCamaDia,
            estudiosPorAdmision,
            dataEstudiosPorBox,
            boxesDisponibles,
            dataTopEstudios,
            dataTopSolicitantes,
            peticionesFiltradas,
            totalEstudiosPeriodo: totalEstudiosSector,
            admisionesUnicas
        };
    }, [filteredRows, camasTotales, fechaDesde, fechaHasta, activeSectorConfig, peticionesEstudios, modalidadFiltro, boxFiltro, sectorId, uciSubNivel]);

    // Generar lista de indicadores estructurados para el Centro de Exportación
    const activeIndicatorsList = useMemo(() => {
        if (!metrics) return [];
        const list = [
            {
                id: 'sector_info',
                label: 'Sector Hospitalario',
                value: `${activeSectorConfig.label} - ${uciSubNivel === 'CONSOLIDADO' ? 'UCI Consolidada (16 Camas: 8 Intensiva + 8 Intermedia)' : uciSubNivel === 'INTENSIVA' ? 'Terapia Intensiva (8 Camas: Box 1 a 8)' : 'Terapia Intermedia (8 Camas: Hab 222 a 229)'}`,
                descripcion: `Período auditado: ${fechaDesde} al ${fechaHasta}`
            },
            {
                id: 'kpi_dias_ocupados',
                label: 'Días Camas Ocupados',
                value: `${metrics.diasOcupados?.toLocaleString('es-AR') || 0} días`,
                descripcion: 'Total camas-día efectivas consumidas en el período'
            },
            {
                id: 'kpi_dias_disponibles',
                label: 'Días Camas Disponibles',
                value: `${metrics.camasDisponibles?.toLocaleString('es-AR') || 0} días`,
                descripcion: `Capacidad instalada (${camasTotales} camas × días del período)`
            },
            {
                id: 'kpi_porc_ocupacion',
                label: '% de Ocupación',
                value: `${metrics.porcOcupacion}%`,
                descripcion: `Tasa de ocupación con estándar institucional (${Number(metrics.porcOcupacion) > 85 ? 'Alta saturación' : 'Normal operativa'})`
            },
            {
                id: 'kpi_total_admisiones',
                label: 'Total de Admisiones Únicas',
                value: `${metrics.totalAdmisiones} pacientes`,
                descripcion: 'Pacientes únicos internados en el período'
            },
            {
                id: 'kpi_alos',
                label: 'Promedio de Estancia (ALOS)',
                value: `${metrics.alos} días`,
                descripcion: 'Días promedio de permanencia por paciente egresado'
            },
            {
                id: 'kpi_porc_defuncion',
                label: '% de Defunción',
                value: `${metrics.porcDefuncion}%`,
                descripcion: `${metrics.defunciones} óbitos sobre ${metrics.totalAdmisiones} admisiones únicas`
            },
            {
                id: 'kpi_intensidad_diagnostica',
                label: 'Intensidad Diagnóstica (VLISE)',
                value: `${metrics.intensidadCamaDia} estudios/cama-día (${metrics.totalEstudiosPeriodo || 0} estudios)`,
                descripcion: 'Consumo de prácticas de laboratorio e imágenes por cama ocupada'
            }
        ];

        if (metrics.topEspecialidades && metrics.topEspecialidades.length > 0) {
            list.push({
                id: 'top_especialidades',
                label: 'Top Especialidades',
                value: metrics.topEspecialidades.slice(0, 5).join(', '),
                descripcion: 'Especialidades con mayor demanda de internación'
            });
        }

        if (metrics.dataMotivosAlta && metrics.dataMotivosAlta.length > 0) {
            list.push({
                id: 'motivos_alta',
                label: 'Distribución de Egresos',
                value: metrics.dataMotivosAlta.slice(0, 4).map(m => `${m.label} (${m.value})`).join(' | '),
                descripcion: 'Desenlace clínico de las altas'
            });
        }

        return list;
    }, [metrics, activeSectorConfig, uciSubNivel, fechaDesde, fechaHasta, camasTotales]);

    // Notificar métricas al padre de forma segura fuera del render
    useEffect(() => {
        if (!onMetricsUpdate || !metrics) return;
        onMetricsUpdate({
            sector: activeSectorConfig.label,
            subNivel: sectorId === 'UCI' ? uciSubNivel : null,
            camasTotales,
            fechaDesde,
            fechaHasta,
            diasOcupados: metrics.diasOcupados,
            camasDisponibles: metrics.camasDisponibles,
            porcOcupacion: metrics.porcOcupacion,
            porcDefuncion: metrics.porcDefuncion,
            alos: metrics.alos,
            totalAdmisiones: metrics.totalAdmisiones,
            defunciones: metrics.defunciones,
            intensidadCamaDia: metrics.intensidadCamaDia,
            totalEstudiosPeriodo: metrics.totalEstudiosPeriodo,
            dataMotivosAlta: metrics.dataMotivosAlta,
            dataRangoEtario: metrics.dataRangoEtario,
            topEspecialidades: metrics.topEspecialidades,
            dataProduccionOrigen: metrics.dataProduccionOrigen,
            topEstudiosCount: metrics.dataTopEstudios?.length || 0,
            activeIndicators: activeIndicatorsList,
            filteredRows
        });
    }, [
        metrics.diasOcupados, 
        metrics.camasDisponibles, 
        metrics.porcOcupacion, 
        metrics.porcDefuncion, 
        metrics.alos, 
        metrics.totalAdmisiones, 
        metrics.intensidadCamaDia,
        camasTotales, 
        fechaDesde,
        fechaHasta,
        activeSectorConfig.label, 
        uciSubNivel, 
        sectorId,
        activeIndicatorsList,
        filteredRows,
        onMetricsUpdate
    ]);

    const isIndicatorActive = (id) => activeIndicatorIds.includes(id);

    const renderChartCard = (chartId, index) => {
        const cardSize = chartSizes[chartId] || DEFAULT_CHART_SIZES[chartId] || { width: 'half', height: 260 };
        const isFirst = index === 0;
        const isLast = index === chartOrder.length - 1;

        switch (chartId) {
            case 'chart_especialidades':
                return (
                    <DraggableChartCard
                        key={chartId}
                        id={chartId}
                        title="Cantidad de Admisiones por Especialidad"
                        subtitle="Evolución mensual segmentada por especialidad"
                        size={cardSize}
                        onSizeChange={handleChartSizeChange}
                        onDragStart={handleDragStartChart}
                        onDragOver={handleDragOverChart}
                        onDragLeave={handleDragLeaveChart}
                        onDrop={handleDropChart}
                        onDragEnd={handleDragEndChart}
                        onMoveLeft={() => handleMoveChart(chartId, -1)}
                        onMoveRight={() => handleMoveChart(chartId, 1)}
                        isFirst={isFirst}
                        isLast={isLast}
                        isDragging={draggedChartId === chartId}
                        isDropTarget={dragOverChartId === chartId}
                        actions={
                            <button 
                                onClick={() => setInspectDataIndicator({ id: 'chart_especialidades', label: 'Admisiones por Especialidad', sector: activeSectorConfig.label, chartData: metrics.dataEspecialidades, dataType: 'admisiones' })}
                                style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '3px 8px', fontSize: '0.72rem', fontWeight: 600, color: '#1E40AF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                title="Expandir gráfico y exportar a Excel"
                            >
                                <Maximize2 size={13} /> Expandir / Excel
                            </button>
                        }
                    >
                        {({ height }) => (
                            <ResponsiveContainer width="100%" height={height}>
                                <BarChart data={metrics.dataEspecialidades} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                                    <XAxis dataKey="mes" stroke="#64748B" fontSize={11} />
                                    <YAxis stroke="#64748B" fontSize={11} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }} />
                                    <Legend wrapperStyle={{ fontSize: '0.7rem', paddingTop: '8px' }} />
                                    {metrics.topEspecialidades.map((esp, i) => (
                                        <Bar key={esp} dataKey={esp} stackId="a" fill={ESPECIALIDAD_PALETTE[i % ESPECIALIDAD_PALETTE.length]} name={esp} />
                                    ))}
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </DraggableChartCard>
                );

            case 'chart_admisiones_totales':
                return (
                    <DraggableChartCard
                        key={chartId}
                        id={chartId}
                        title="Cantidad de Admisiones Totales"
                        subtitle="Evolución mensual del sector"
                        size={cardSize}
                        onSizeChange={handleChartSizeChange}
                        onDragStart={handleDragStartChart}
                        onDragOver={handleDragOverChart}
                        onDragLeave={handleDragLeaveChart}
                        onDrop={handleDropChart}
                        onDragEnd={handleDragEndChart}
                        onMoveLeft={() => handleMoveChart(chartId, -1)}
                        onMoveRight={() => handleMoveChart(chartId, 1)}
                        isFirst={isFirst}
                        isLast={isLast}
                        isDragging={draggedChartId === chartId}
                        isDropTarget={dragOverChartId === chartId}
                        actions={
                            <button 
                                onClick={() => setInspectDataIndicator({ id: 'chart_admisiones_totales', label: 'Cantidad de Admisiones Totales', sector: activeSectorConfig.label, chartData: metrics.dataAdmisionesTotales, dataType: 'admisiones' })}
                                style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '3px 8px', fontSize: '0.72rem', fontWeight: 600, color: '#1E40AF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                title="Expandir gráfico y exportar a Excel"
                            >
                                <Maximize2 size={13} /> Expandir / Excel
                            </button>
                        }
                    >
                        {({ height }) => (
                            <ResponsiveContainer width="100%" height={height}>
                                <BarChart data={metrics.dataAdmisionesTotales} margin={{ top: 15, right: 10, left: -15, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                                    <XAxis dataKey="mes" stroke="#64748B" fontSize={11} />
                                    <YAxis stroke="#64748B" fontSize={11} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }} />
                                    <Bar dataKey="total" fill="#1E40AF" radius={[4, 4, 0, 0]} name="Admisiones" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </DraggableChartCard>
                );

            case 'chart_motivos_alta':
                return (
                    <DraggableChartCard
                        key={chartId}
                        id={chartId}
                        title="Motivos de Alta / Egreso"
                        subtitle="Desenlace clínico de las altas"
                        size={cardSize}
                        onSizeChange={handleChartSizeChange}
                        onDragStart={handleDragStartChart}
                        onDragOver={handleDragOverChart}
                        onDragLeave={handleDragLeaveChart}
                        onDrop={handleDropChart}
                        onDragEnd={handleDragEndChart}
                        onMoveLeft={() => handleMoveChart(chartId, -1)}
                        onMoveRight={() => handleMoveChart(chartId, 1)}
                        isFirst={isFirst}
                        isLast={isLast}
                        isDragging={draggedChartId === chartId}
                        isDropTarget={dragOverChartId === chartId}
                        actions={
                            <button 
                                onClick={() => setInspectDataIndicator({ id: 'chart_motivos_alta', label: 'Motivos de Alta', sector: activeSectorConfig.label, chartData: metrics.dataMotivosAlta, dataType: 'admisiones' })}
                                style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '3px 8px', fontSize: '0.72rem', fontWeight: 600, color: '#1E40AF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                title="Expandir gráfico y exportar a Excel"
                            >
                                <Maximize2 size={13} /> Expandir / Excel
                            </button>
                        }
                    >
                        {({ height }) => (
                            <ResponsiveContainer width="100%" height={height}>
                                <PieChart>
                                    <Pie
                                        data={metrics.dataMotivosAlta}
                                        dataKey="value"
                                        nameKey="label"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={Math.round(height * 0.18)}
                                        outerRadius={Math.round(height * 0.34)}
                                        paddingAngle={2}
                                    >
                                        {metrics.dataMotivosAlta.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }} />
                                    <Legend wrapperStyle={{ fontSize: '0.72rem', paddingTop: '6px' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </DraggableChartCard>
                );

            case 'chart_rango_etario':
                return (
                    <DraggableChartCard
                        key={chartId}
                        id={chartId}
                        title="Distribución por Rango Etario"
                        subtitle="Proporción según grupo etario"
                        size={cardSize}
                        onSizeChange={handleChartSizeChange}
                        onDragStart={handleDragStartChart}
                        onDragOver={handleDragOverChart}
                        onDragLeave={handleDragLeaveChart}
                        onDrop={handleDropChart}
                        onDragEnd={handleDragEndChart}
                        onMoveLeft={() => handleMoveChart(chartId, -1)}
                        onMoveRight={() => handleMoveChart(chartId, 1)}
                        isFirst={isFirst}
                        isLast={isLast}
                        isDragging={draggedChartId === chartId}
                        isDropTarget={dragOverChartId === chartId}
                        actions={
                            <button 
                                onClick={() => setInspectDataIndicator({ id: 'chart_rango_etario', label: 'Rango Etario de Pacientes', sector: activeSectorConfig.label, chartData: metrics.dataRangoEtario, dataType: 'admisiones' })}
                                style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '3px 8px', fontSize: '0.72rem', fontWeight: 600, color: '#1E40AF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                title="Expandir gráfico y exportar a Excel"
                            >
                                <Maximize2 size={13} /> Expandir / Excel
                            </button>
                        }
                    >
                        {({ height }) => (
                            <ResponsiveContainer width="100%" height={height}>
                                <PieChart>
                                    <Pie
                                        data={metrics.dataRangoEtario}
                                        dataKey="value"
                                        nameKey="label"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={Math.round(height * 0.18)}
                                        outerRadius={Math.round(height * 0.34)}
                                        paddingAngle={2}
                                    >
                                        {metrics.dataRangoEtario.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }} />
                                    <Legend wrapperStyle={{ fontSize: '0.72rem', paddingTop: '6px' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </DraggableChartCard>
                );

            case 'chart_estancias':
                return (
                    <DraggableChartCard
                        key={chartId}
                        id={chartId}
                        title="Categorías de Estancias"
                        subtitle="Corta (1-2d) / Media (3-7d) / Larga (>7d)"
                        size={cardSize}
                        onSizeChange={handleChartSizeChange}
                        onDragStart={handleDragStartChart}
                        onDragOver={handleDragOverChart}
                        onDragLeave={handleDragLeaveChart}
                        onDrop={handleDropChart}
                        onDragEnd={handleDragEndChart}
                        onMoveLeft={() => handleMoveChart(chartId, -1)}
                        onMoveRight={() => handleMoveChart(chartId, 1)}
                        isFirst={isFirst}
                        isLast={isLast}
                        isDragging={draggedChartId === chartId}
                        isDropTarget={dragOverChartId === chartId}
                        actions={
                            <button 
                                onClick={() => setInspectDataIndicator({ id: 'chart_estancias', label: 'Categorías de Estancias', sector: activeSectorConfig.label, chartData: metrics.dataEstancias, dataType: 'admisiones' })}
                                style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '3px 8px', fontSize: '0.72rem', fontWeight: 600, color: '#1E40AF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                title="Expandir gráfico y exportar a Excel"
                            >
                                <Maximize2 size={13} /> Expandir / Excel
                            </button>
                        }
                    >
                        {({ height }) => (
                            <ResponsiveContainer width="100%" height={height}>
                                <BarChart data={metrics.dataEstancias} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                                    <XAxis dataKey="mes" stroke="#64748B" fontSize={10} />
                                    <YAxis stroke="#64748B" fontSize={10} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }} />
                                    <Legend wrapperStyle={{ fontSize: '0.72rem', paddingTop: '6px' }} />
                                    <Bar dataKey="corta" stackId="s" fill={COLORS_ESTANCIA.corta} name="1-2 días" />
                                    <Bar dataKey="media" stackId="s" fill={COLORS_ESTANCIA.media} name="3-7 días" />
                                    <Bar dataKey="larga" stackId="s" fill={COLORS_ESTANCIA.larga} name=">7 días" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </DraggableChartCard>
                );

            case 'chart_procedencia':
                return (
                    <DraggableChartCard
                        key={chartId}
                        id={chartId}
                        title="Canal de Procedencia del Paciente"
                        subtitle="Origen del ingreso a la institución"
                        size={cardSize}
                        onSizeChange={handleChartSizeChange}
                        onDragStart={handleDragStartChart}
                        onDragOver={handleDragOverChart}
                        onDragLeave={handleDragLeaveChart}
                        onDrop={handleDropChart}
                        onDragEnd={handleDragEndChart}
                        onMoveLeft={() => handleMoveChart(chartId, -1)}
                        onMoveRight={() => handleMoveChart(chartId, 1)}
                        isFirst={isFirst}
                        isLast={isLast}
                        isDragging={draggedChartId === chartId}
                        isDropTarget={dragOverChartId === chartId}
                        actions={
                            <button 
                                onClick={() => setInspectDataIndicator({ id: 'chart_procedencia', label: 'Procedencia de Ingreso', sector: activeSectorConfig.label, chartData: metrics.dataProcedencia, dataType: 'admisiones' })}
                                style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '3px 8px', fontSize: '0.72rem', fontWeight: 600, color: '#1E40AF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                title="Expandir gráfico y exportar a Excel"
                            >
                                <Maximize2 size={13} /> Expandir / Excel
                            </button>
                        }
                    >
                        {({ height }) => (
                            <ResponsiveContainer width="100%" height={height}>
                                <BarChart data={metrics.dataProcedencia} layout="vertical" margin={{ top: 5, right: 15, left: 40, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                                    <XAxis type="number" stroke="#64748B" fontSize={10} />
                                    <YAxis type="category" dataKey="label" stroke="#64748B" fontSize={10} width={90} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }} />
                                    <Bar dataKey="value" fill="#3B82F6" radius={[0, 4, 4, 0]} name="Pacientes" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </DraggableChartCard>
                );

            case 'chart_clientes':
                return (
                    <DraggableChartCard
                        key={chartId}
                        id={chartId}
                        title="Top Obras Sociales y Financiadores"
                        subtitle="Distribución por financiador principal"
                        size={cardSize}
                        onSizeChange={handleChartSizeChange}
                        onDragStart={handleDragStartChart}
                        onDragOver={handleDragOverChart}
                        onDragLeave={handleDragLeaveChart}
                        onDrop={handleDropChart}
                        onDragEnd={handleDragEndChart}
                        onMoveLeft={() => handleMoveChart(chartId, -1)}
                        onMoveRight={() => handleMoveChart(chartId, 1)}
                        isFirst={isFirst}
                        isLast={isLast}
                        isDragging={draggedChartId === chartId}
                        isDropTarget={dragOverChartId === chartId}
                        actions={
                            <button 
                                onClick={() => setInspectDataIndicator({ id: 'chart_clientes', label: 'Financiadores y Clientes', sector: activeSectorConfig.label, chartData: metrics.dataClientes, dataType: 'admisiones' })}
                                style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '3px 8px', fontSize: '0.72rem', fontWeight: 600, color: '#1E40AF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                title="Expandir gráfico y exportar a Excel"
                            >
                                <Maximize2 size={13} /> Expandir / Excel
                            </button>
                        }
                    >
                        {({ height }) => (
                            <ResponsiveContainer width="100%" height={height}>
                                <BarChart data={metrics.dataClientes} layout="vertical" margin={{ top: 5, right: 15, left: 40, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                                    <XAxis type="number" stroke="#64748B" fontSize={10} />
                                    <YAxis type="category" dataKey="label" stroke="#64748B" fontSize={10} width={90} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }} />
                                    <Bar dataKey="value" fill="#10B981" radius={[0, 4, 4, 0]} name="Pacientes" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </DraggableChartCard>
                );

            case 'chart_produccion_origen':
                return (
                    <DraggableChartCard
                        key={chartId}
                        id={chartId}
                        title="Composición Diagnóstica en UCI"
                        subtitle="Modalidades de estudio según período y filtros"
                        badge={`${metrics.totalBaseUci.toLocaleString('es-AR')} Estudios`}
                        size={cardSize}
                        onSizeChange={handleChartSizeChange}
                        onDragStart={handleDragStartChart}
                        onDragOver={handleDragOverChart}
                        onDragLeave={handleDragLeaveChart}
                        onDrop={handleDropChart}
                        onDragEnd={handleDragEndChart}
                        onMoveLeft={() => handleMoveChart(chartId, -1)}
                        onMoveRight={() => handleMoveChart(chartId, 1)}
                        isFirst={isFirst}
                        isLast={isLast}
                        isDragging={draggedChartId === chartId}
                        isDropTarget={dragOverChartId === chartId}
                        actions={
                            <button 
                                onClick={() => setInspectDataIndicator({
                                    id: 'chart_produccion_origen',
                                    label: 'Composición Diagnóstica en UCI',
                                    sector: activeSectorConfig.label,
                                    chartData: metrics.dataModalidadesUci,
                                    dataType: 'peticiones',
                                    rawData: metrics.peticionesFiltradas
                                })}
                                style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '3px 8px', fontSize: '0.72rem', fontWeight: 600, color: '#1E40AF', cursor: 'pointer' }}
                                title="Expandir gráfico y exportar a Excel"
                            >
                                <Maximize2 size={13} /> Expandir / Excel
                            </button>
                        }
                    >
                        {({ height }) => (
                            <div style={{ height: `${height}px`, display: 'flex', alignItems: 'center' }}>
                                {metrics.dataModalidadesUci.length === 0 ? (
                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>
                                        No hay estudios registrados para este sector o período
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ width: '48%', height: '100%' }}>
                                            <ResponsiveContainer width="100%" height={height}>
                                                <PieChart>
                                                    <Pie
                                                        data={metrics.dataModalidadesUci}
                                                        dataKey="count"
                                                        nameKey="modalidad"
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={Math.round(height * 0.18)}
                                                        outerRadius={Math.round(height * 0.34)}
                                                        paddingAngle={3}
                                                    >
                                                        {metrics.dataModalidadesUci.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip
                                                        formatter={(val, name, item) => [
                                                            `${Number(val).toLocaleString('es-AR')} estudios (${item.payload.porcentaje}%)`,
                                                            item.payload.modalidad
                                                        ]}
                                                        contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
                                                    />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <div style={{ width: '52%', display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '8px' }}>
                                            {metrics.dataModalidadesUci.map((m, idx) => (
                                                <div 
                                                    key={idx} 
                                                    onClick={() => setModalidadFiltro(m.modalidad)}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        padding: '5px 8px',
                                                        borderRadius: '6px',
                                                        background: modalidadFiltro === m.modalidad ? '#EFF6FF' : '#F8FAFC',
                                                        border: modalidadFiltro === m.modalidad ? '1px solid #2563EB' : '1px solid #E2E8F0',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: m.color }} />
                                                        <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#334155' }}>
                                                            {m.modalidad}
                                                        </span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#0F172A' }}>
                                                            {m.count.toLocaleString('es-AR')}
                                                        </span>
                                                        <span style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                                            ({m.porcentaje}%)
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </DraggableChartCard>
                );

            case 'chart_estudios_por_box':
                return (
                    <DraggableChartCard
                        key={chartId}
                        id={chartId}
                        title="Distribución de Estudios por Box / Cama"
                        subtitle="Demanda diagnóstica por unidad (clic para filtrar box)"
                        badge="VLISE"
                        size={cardSize}
                        onSizeChange={handleChartSizeChange}
                        onDragStart={handleDragStartChart}
                        onDragOver={handleDragOverChart}
                        onDragLeave={handleDragLeaveChart}
                        onDrop={handleDropChart}
                        onDragEnd={handleDragEndChart}
                        onMoveLeft={() => handleMoveChart(chartId, -1)}
                        onMoveRight={() => handleMoveChart(chartId, 1)}
                        isFirst={isFirst}
                        isLast={isLast}
                        isDragging={draggedChartId === chartId}
                        isDropTarget={dragOverChartId === chartId}
                        actions={
                            <button 
                                onClick={() => setInspectDataIndicator({
                                    id: 'chart_estudios_por_box',
                                    label: 'Distribución de Estudios por Box / Cama en UCI',
                                    sector: activeSectorConfig.label,
                                    chartData: metrics.dataEstudiosPorBox,
                                    dataType: 'peticiones',
                                    rawData: metrics.peticionesFiltradas
                                })}
                                style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '3px 8px', fontSize: '0.72rem', fontWeight: 600, color: '#1E40AF', cursor: 'pointer' }}
                                title="Expandir gráfico y exportar a Excel"
                            >
                                <Maximize2 size={13} /> Expandir / Excel
                            </button>
                        }
                    >
                        {({ height }) => (
                            metrics.dataEstudiosPorBox.length === 0 ? (
                                <div style={{ height: `${height}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>
                                    No hay desglose de boxes registrado para este sector o período
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height={height}>
                                    <BarChart
                                        data={metrics.dataEstudiosPorBox.slice(0, 10)}
                                        margin={{ top: 10, right: 10, left: -10, bottom: 20 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                                        <XAxis
                                            dataKey="box"
                                            stroke="#64748B"
                                            fontSize={9}
                                            angle={-25}
                                            textAnchor="end"
                                        />
                                        <YAxis stroke="#64748B" fontSize={10} />
                                        <Tooltip
                                            formatter={(val, name, item) => [
                                                `${Number(val).toLocaleString('es-AR')} estudios (${item.payload.porcentaje}%)`,
                                                'Demanda'
                                            ]}
                                            contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
                                        />
                                        <Bar
                                            dataKey="count"
                                            fill="#2563EB"
                                            radius={[4, 4, 0, 0]}
                                            cursor="pointer"
                                            onClick={(entry) => setBoxFiltro(entry.box)}
                                        >
                                            {metrics.dataEstudiosPorBox.slice(0, 10).map((entry, index) => (
                                                <Cell
                                                    key={`box-cell-${index}`}
                                                    fill={boxFiltro === entry.box ? '#1E40AF' : entry.color}
                                                />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )
                        )}
                    </DraggableChartCard>
                );

            case 'chart_top_estudios_uci':
                return (
                    <DraggableChartCard
                        key={chartId}
                        id={chartId}
                        title={`Top Estudios Solicitados en ${activeSectorConfig.shortLabel}`}
                        subtitle={modalidadFiltro === 'TODAS' ? 'Laboratorio, gasometría e imágenes' : `Filtro activo: ${modalidadFiltro}`}
                        badge="Top 10"
                        size={cardSize}
                        onSizeChange={handleChartSizeChange}
                        onDragStart={handleDragStartChart}
                        onDragOver={handleDragOverChart}
                        onDragLeave={handleDragLeaveChart}
                        onDrop={handleDropChart}
                        onDragEnd={handleDragEndChart}
                        onMoveLeft={() => handleMoveChart(chartId, -1)}
                        onMoveRight={() => handleMoveChart(chartId, 1)}
                        isFirst={isFirst}
                        isLast={isLast}
                        isDragging={draggedChartId === chartId}
                        isDropTarget={dragOverChartId === chartId}
                        actions={
                            <button 
                                onClick={() => setInspectDataIndicator({
                                    id: 'chart_top_estudios_uci',
                                    label: 'Top Estudios Solicitados en UCI',
                                    sector: activeSectorConfig.label,
                                    chartData: metrics.dataTopEstudios,
                                    dataType: 'peticiones',
                                    rawData: metrics.peticionesFiltradas
                                })}
                                style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '3px 8px', fontSize: '0.72rem', fontWeight: 600, color: '#1E40AF', cursor: 'pointer' }}
                                title="Expandir gráfico y exportar a Excel"
                            >
                                <Maximize2 size={13} /> Expandir / Excel
                            </button>
                        }
                    >
                        {({ height }) => (
                            metrics.dataTopEstudios.length === 0 ? (
                                <div style={{ height: `${height}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>
                                    No hay estudios registrados con los filtros seleccionados
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height={height}>
                                    <BarChart
                                        data={metrics.dataTopEstudios}
                                        layout="vertical"
                                        margin={{ top: 5, right: 20, left: 60, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                                        <XAxis type="number" stroke="#64748B" fontSize={10} />
                                        <YAxis
                                            type="category"
                                            dataKey="label"
                                            stroke="#64748B"
                                            fontSize={9}
                                            width={130}
                                            tickFormatter={(v) => v.length > 20 ? v.substring(0, 20) + '...' : v}
                                        />
                                        <Tooltip
                                            formatter={(val) => [Number(val).toLocaleString('es-AR') + ' solicitudes', 'Cantidad']}
                                            contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
                                        />
                                        <Bar dataKey="value" fill="#2563EB" radius={[0, 4, 4, 0]} name="Solicitudes" />
                                    </BarChart>
                                </ResponsiveContainer>
                            )
                        )}
                    </DraggableChartCard>
                );

            case 'chart_solicitantes_uci':
                return (
                    <DraggableChartCard
                        key={chartId}
                        id={chartId}
                        title="Médicos Solicitantes Más Activos"
                        subtitle="Prescriptores con mayor volumen de estudios"
                        badge="VLISE"
                        size={cardSize}
                        onSizeChange={handleChartSizeChange}
                        onDragStart={handleDragStartChart}
                        onDragOver={handleDragOverChart}
                        onDragLeave={handleDragLeaveChart}
                        onDrop={handleDropChart}
                        onDragEnd={handleDragEndChart}
                        onMoveLeft={() => handleMoveChart(chartId, -1)}
                        onMoveRight={() => handleMoveChart(chartId, 1)}
                        isFirst={isFirst}
                        isLast={isLast}
                        isDragging={draggedChartId === chartId}
                        isDropTarget={dragOverChartId === chartId}
                        actions={
                            <button 
                                onClick={() => setInspectDataIndicator({
                                    id: 'chart_solicitantes_uci',
                                    label: 'Médicos Solicitantes Más Activos en UCI',
                                    sector: activeSectorConfig.label,
                                    chartData: metrics.dataTopSolicitantes,
                                    dataType: 'peticiones',
                                    rawData: metrics.peticionesFiltradas
                                })}
                                style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '3px 8px', fontSize: '0.72rem', fontWeight: 600, color: '#1E40AF', cursor: 'pointer' }}
                                title="Expandir gráfico y exportar a Excel"
                            >
                                <Maximize2 size={13} /> Expandir / Excel
                            </button>
                        }
                    >
                        {({ height }) => (
                            metrics.dataTopSolicitantes.length === 0 ? (
                                <div style={{ height: `${height}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>
                                    No hay solicitantes registrados con los filtros seleccionados
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height={height}>
                                    <BarChart
                                        data={metrics.dataTopSolicitantes}
                                        layout="vertical"
                                        margin={{ top: 5, right: 20, left: 60, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                                        <XAxis type="number" stroke="#64748B" fontSize={10} />
                                        <YAxis
                                            type="category"
                                            dataKey="label"
                                            stroke="#64748B"
                                            fontSize={9}
                                            width={120}
                                            tickFormatter={(v) => v.length > 18 ? v.substring(0, 18) + '...' : v}
                                        />
                                        <Tooltip
                                            formatter={(val) => [val, 'Solicitudes']}
                                            contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
                                        />
                                        <Bar dataKey="value" fill="#8B5CF6" radius={[0, 4, 4, 0]} name="Solicitudes" />
                                    </BarChart>
                                </ResponsiveContainer>
                            )
                        )}
                    </DraggableChartCard>
                );

            case 'table_peticiones_detalle':
                return (
                    <DraggableChartCard
                        key={chartId}
                        id={chartId}
                        title="Auditoría y Trazabilidad de Peticiones y Pruebas"
                        subtitle="Estudios solicitados con paciente, modalidad diagnóstica y origen clasificado"
                        badge={`${metrics.peticionesFiltradas.length.toLocaleString('es-AR')} registros`}
                        size={cardSize}
                        onSizeChange={handleChartSizeChange}
                        onDragStart={handleDragStartChart}
                        onDragOver={handleDragOverChart}
                        onDragLeave={handleDragLeaveChart}
                        onDrop={handleDropChart}
                        onDragEnd={handleDragEndChart}
                        onMoveLeft={() => handleMoveChart(chartId, -1)}
                        onMoveRight={() => handleMoveChart(chartId, 1)}
                        isFirst={isFirst}
                        isLast={isLast}
                        isDragging={draggedChartId === chartId}
                        isDropTarget={dragOverChartId === chartId}
                        actions={
                            <button 
                                onClick={() => setInspectDataIndicator({
                                    id: 'table_peticiones_detalle',
                                    label: 'Auditoría Completa de Peticiones y Pruebas en UCI',
                                    sector: activeSectorConfig.label,
                                    dataType: 'peticiones',
                                    rawData: metrics.peticionesFiltradas
                                })}
                                style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#EFF6FF', border: '1px solid #93C5FD', borderRadius: '6px', padding: '4px 10px', fontSize: '0.74rem', fontWeight: 700, color: '#1E40AF', cursor: 'pointer' }}
                                title="Expandir tabla completa y exportar a Excel"
                            >
                                <Maximize2 size={13} /> Expandir / Excel
                            </button>
                        }
                    >
                        {({ height }) => (
                            <div style={{ overflowX: 'auto', maxHeight: `${height}px`, fontSize: '0.78rem' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #CBD5E1', color: '#475569', position: 'sticky', top: 0, zIndex: 1 }}>
                                            <th style={{ padding: '8px 10px' }}>Fecha</th>
                                            <th style={{ padding: '8px 10px' }}>Paciente</th>
                                            <th style={{ padding: '8px 10px' }}>Estudio / Prueba</th>
                                            <th style={{ padding: '8px 10px' }}>Modalidad</th>
                                            <th style={{ padding: '8px 10px' }}>Hab./Box</th>
                                            <th style={{ padding: '8px 10px' }}>Origen Clasificado</th>
                                            <th style={{ padding: '8px 10px' }}>Solicitante</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {metrics.peticionesFiltradas.slice(0, 30).map((p, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: '#64748B' }}>
                                                    {p.fecha_solicitud ? new Date(p.fecha_solicitud).toLocaleDateString('es-AR') : '-'}
                                                </td>
                                                <td style={{ padding: '8px 10px', fontWeight: 600, color: '#0F172A' }}>
                                                    {p.paciente || `ID ${p.id_paciente || '-'}`}
                                                </td>
                                                <td style={{ padding: '8px 10px', fontWeight: 600, color: '#1E293B' }}>
                                                    {(p.estudio || '').replace(/<[^>]+>/g, '')}
                                                </td>
                                                <td style={{ padding: '8px 10px' }}>
                                                    <span style={{
                                                        padding: '2px 8px',
                                                        borderRadius: '12px',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 700,
                                                        background: p.modalidad === 'Imágenes' ? '#FAF5FF' : '#EFF6FF',
                                                        color: p.modalidad === 'Imágenes' ? '#7E22CE' : '#1D4ED8',
                                                        border: p.modalidad === 'Imágenes' ? '1px solid #E9D5FF' : '1px solid #BFDBFE'
                                                    }}>
                                                        {p.modalidad || 'Laboratorio'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '8px 10px', color: '#2563EB', fontWeight: 700 }}>
                                                    {p.habitacion || (p.cama ? `Cama ${p.cama}` : 'Piso')}
                                                </td>
                                                <td style={{ padding: '8px 10px', color: '#475569', fontSize: '0.72rem' }}>
                                                    <span style={{
                                                        background: '#F1F5F9',
                                                        padding: '2px 6px',
                                                        borderRadius: '4px',
                                                        fontWeight: 600
                                                    }}>
                                                        {p.origen_gobernanza || p.origen || 'Hospitalización'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '8px 10px', color: '#475569', fontSize: '0.72rem' }}>
                                                    {p.solicitante || '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </DraggableChartCard>
                );

            default:
                return null;
        }
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: '#F8FAFC',
            fontFamily: "'Inter', sans-serif"
        }}>
            
            {/* ─── BARRA SUPERIOR UNIFICADA ─── */}
            <div style={{
                background: '#FFFFFF',
                borderBottom: '1px solid #E2E8F0',
                padding: '12px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                flexWrap: 'wrap',
                zIndex: 10
            }}>
                {/* Lado Izquierdo: Toggle Sidebar + Título del Sector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                        onClick={() => setSidebarOpen(prev => !prev)}
                        title={sidebarOpen ? "Ocultar panel de sectores" : "Mostrar panel de sectores"}
                        style={{
                            background: '#F1F5F9',
                            border: '1px solid #CBD5E1',
                            borderRadius: '8px',
                            padding: '7px',
                            cursor: 'pointer',
                            color: '#475569',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
                    </button>

                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '1.2rem' }}>{activeSectorConfig.icon}</span>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>
                                {activeSectorConfig.label}
                            </h2>
                            <span style={{
                                fontSize: '0.72rem',
                                background: '#EFF6FF',
                                color: '#1E40AF',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontWeight: 700,
                                border: '1px solid #BFDBFE'
                            }}>
                                {activeIndicatorIds.length} Indicadores
                            </span>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                            {activeSectorConfig.descripcion}
                        </span>
                    </div>

                    {/* Sub-Selector Tripartito Exclusivo para UCI (Cuidados Críticos) */}
                    {sectorId === 'UCI' && (
                        <div style={{
                            display: 'flex',
                            background: '#F1F5F9',
                            padding: '3px',
                            borderRadius: '10px',
                            border: '1px solid #CBD5E1',
                            gap: '3px',
                            marginLeft: '8px'
                        }}>
                            <button
                                onClick={() => handleSelectUciSubNivel('CONSOLIDADO')}
                                style={{
                                    background: uciSubNivel === 'CONSOLIDADO' ? '#2563EB' : 'transparent',
                                    color: uciSubNivel === 'CONSOLIDADO' ? '#FFFFFF' : '#475569',
                                    border: 'none',
                                    borderRadius: '7px',
                                    padding: '5px 10px',
                                    fontSize: '0.76rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <span>⚡</span>
                                <span>UCI Total (16 camas)</span>
                            </button>
                            <button
                                onClick={() => handleSelectUciSubNivel('INTENSIVA')}
                                style={{
                                    background: uciSubNivel === 'INTENSIVA' ? '#1E40AF' : 'transparent',
                                    color: uciSubNivel === 'INTENSIVA' ? '#FFFFFF' : '#475569',
                                    border: 'none',
                                    borderRadius: '7px',
                                    padding: '5px 10px',
                                    fontSize: '0.76rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <span>🔴</span>
                                <span>Terapia Intensiva (8)</span>
                            </button>
                            <button
                                onClick={() => handleSelectUciSubNivel('INTERMEDIA')}
                                style={{
                                    background: uciSubNivel === 'INTERMEDIA' ? '#D97706' : 'transparent',
                                    color: uciSubNivel === 'INTERMEDIA' ? '#FFFFFF' : '#475569',
                                    border: 'none',
                                    borderRadius: '7px',
                                    padding: '5px 10px',
                                    fontSize: '0.76rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <span>🟡</span>
                                <span>Terapia Intermedia (8)</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Filtros Paramétricos Centrales */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    
                    {/* Botón Catálogo de Indicadores */}
                    <button
                        onClick={() => setIsCatalogoOpen(true)}
                        style={{
                            background: '#FFFFFF',
                            border: '1px solid #2563EB',
                            color: '#1E40AF',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer'
                        }}
                    >
                        <Sliders size={15} />
                        Catálogo ({activeIndicatorIds.length})
                    </button>

                    {/* Botón Documentación Técnica */}
                    <button
                        onClick={() => setShowDocModal(true)}
                        style={{
                            background: '#F1F5F9',
                            border: '1px solid #CBD5E1',
                            color: '#334155',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer'
                        }}
                    >
                        <BookOpen size={15} color="#1E40AF" />
                        Fórmulas & SQL
                    </button>

                    {/* Selector de Modo: Indicadores vs Gantt de Camas */}
                    {sectorId === 'UCI' && (
                        <div style={{
                            display: 'flex',
                            background: '#F1F5F9',
                            padding: '3px',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1',
                            gap: '3px'
                        }}>
                            <button
                                type="button"
                                onClick={() => setViewMode('dashboard')}
                                style={{
                                    background: viewMode === 'dashboard' ? '#1E40AF' : 'transparent',
                                    color: viewMode === 'dashboard' ? '#FFFFFF' : '#475569',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '5px 10px',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <LayoutDashboard size={14} />
                                <span>Indicadores</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('gantt')}
                                style={{
                                    background: viewMode === 'gantt' ? '#1E40AF' : 'transparent',
                                    color: viewMode === 'gantt' ? '#FFFFFF' : '#475569',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '5px 10px',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <Bed size={14} />
                                <span>Gantt Camas UCI</span>
                                <span style={{
                                    background: viewMode === 'gantt' ? '#3B82F6' : '#DBEAFE',
                                    color: viewMode === 'gantt' ? '#FFFFFF' : '#1E40AF',
                                    fontSize: '0.65rem',
                                    padding: '1px 5px',
                                    borderRadius: '6px',
                                    fontWeight: 800
                                }}>
                                    16 Camas
                                </span>
                            </button>
                        </div>
                    )}

                    <div style={{ height: '24px', width: '1px', background: '#E2E8F0' }} />

                    {/* Filtro Multi-Especialidad con Casillas de Verificación */}
                    <div ref={especDropdownRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>Especialidad:</span>
                        <button
                            type="button"
                            onClick={() => setEspecDropdownOpen(prev => !prev)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '6px',
                                padding: '5px 10px',
                                borderRadius: '6px',
                                border: especDropdownOpen ? '1px solid #2563EB' : '1px solid #CBD5E1',
                                fontSize: '0.8rem',
                                color: '#1E293B',
                                background: '#FFFFFF',
                                minWidth: '130px',
                                maxWidth: '190px',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>
                                {selectedEspecialidades === null 
                                    ? '(Todas)' 
                                    : selectedEspecialidades.length === 0 
                                        ? 'Ninguna' 
                                        : selectedEspecialidades.length === 1 
                                            ? selectedEspecialidades[0] 
                                            : `${selectedEspecialidades.length} seleccionadas`}
                            </span>
                            <ChevronDown size={14} color="#64748B" style={{ transform: especDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
                        </button>

                        {/* Menú Desplegable con Casillas de Verificación */}
                        {especDropdownOpen && (
                            <div style={{
                                position: 'absolute',
                                top: 'calc(100% + 5px)',
                                left: '75px',
                                background: '#FFFFFF',
                                border: '1px solid #CBD5E1',
                                borderRadius: '8px',
                                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
                                zIndex: 9999,
                                width: '230px',
                                padding: '6px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px'
                            }}>
                                {/* Acciones Rápidas: Seleccionar Todas / Limpiar */}
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '4px 6px 6px 6px',
                                    borderBottom: '1px solid #F1F5F9'
                                }}>
                                    <button
                                        type="button"
                                        onClick={handleSelectAllEspecialidades}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#2563EB',
                                            fontSize: '0.72rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            padding: '2px 4px'
                                        }}
                                    >
                                        Seleccionar todas
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleClearAllEspecialidades}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#64748B',
                                            fontSize: '0.72rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            padding: '2px 4px'
                                        }}
                                    >
                                        Deseleccionar todas
                                    </button>
                                </div>

                                {/* Casillas de Verificación por Especialidad */}
                                <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    {especialidadesDisponibles.map(esp => {
                                        const isChecked = selectedEspecialidades === null || selectedEspecialidades.includes(esp);
                                        return (
                                            <div
                                                key={esp}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    padding: '5px 6px',
                                                    borderRadius: '6px',
                                                    background: isChecked ? '#EFF6FF' : 'transparent',
                                                    cursor: 'pointer',
                                                    fontSize: '0.75rem',
                                                    transition: 'background 0.1s ease'
                                                }}
                                                onClick={() => handleToggleEspecialidad(esp)}
                                            >
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', width: '100%' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => {}}
                                                        style={{ accentColor: '#2563EB', cursor: 'pointer' }}
                                                    />
                                                    <span style={{
                                                        color: isChecked ? '#1E40AF' : '#334155',
                                                        fontWeight: isChecked ? 700 : 500
                                                    }}>
                                                        {esp}
                                                    </span>
                                                </label>
                                                <button
                                                    type="button"
                                                    title={`Filtrar únicamente ${esp}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleSelectOnlyEspecialidad(esp);
                                                    }}
                                                    style={{
                                                        background: 'transparent',
                                                        border: 'none',
                                                        color: '#94A3B8',
                                                        fontSize: '0.68rem',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                        padding: '1px 5px',
                                                        borderRadius: '3px'
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.color = '#2563EB'}
                                                    onMouseLeave={(e) => e.currentTarget.style.color = '#94A3B8'}
                                                >
                                                    solo
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Camas Totales */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>Camas:</span>
                        <input
                            type="number"
                            min="1"
                            max="300"
                            value={camasTotales}
                            onChange={(e) => setCamasTotales(Number(e.target.value))}
                            style={{
                                width: '55px',
                                padding: '5px 6px',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                color: '#1E40AF',
                                textAlign: 'center'
                            }}
                        />
                    </div>

                    {/* Fechas con Presets Rápidos */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={14} color="#64748B" />
                        <input
                            type="date"
                            value={fechaDesde}
                            onChange={(e) => setFechaDesde(e.target.value)}
                            style={{
                                padding: '4px 6px',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.75rem',
                                color: '#1E293B'
                            }}
                        />
                        <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>a</span>
                        <input
                            type="date"
                            value={fechaHasta}
                            onChange={(e) => setFechaHasta(e.target.value)}
                            style={{
                                padding: '4px 6px',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.75rem',
                                color: '#1E293B'
                            }}
                        />
                        {/* Botoncitos de Rango Rápido */}
                        <div style={{ display: 'flex', gap: '2px', marginLeft: '4px' }}>
                            {[
                                { id: '30d', label: '30d' },
                                { id: '90d', label: '90d' },
                                { id: '2026', label: '2026' },
                                { id: 'historico', label: 'Hist' }
                            ].map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => handleSetDatePreset(p.id)}
                                    style={{
                                        background: '#F1F5F9',
                                        border: '1px solid #CBD5E1',
                                        borderRadius: '4px',
                                        padding: '2px 5px',
                                        fontSize: '0.68rem',
                                        fontWeight: 600,
                                        color: '#475569',
                                        cursor: 'pointer'
                                    }}
                                    title={`Filtrar rango ${p.label}`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                </div>

                {/* Sincronización y Exportación IA */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <SalusSyncButton />
                    
                    {onOpenInfografia && (
                        <button
                            onClick={() => onOpenInfografia(activeIndicatorsList, metrics, filteredRows)}
                            style={{
                                background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '7px 12px',
                                fontWeight: 600,
                                fontSize: '0.8rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                cursor: 'pointer',
                                boxShadow: '0 2px 4px rgba(79, 70, 229, 0.2)'
                            }}
                            title="Exportar a PowerPoint PPTX, Excel, PDF, Infografía y Más"
                        >
                            <Sparkles size={14} />
                            Centro de Exportación
                        </button>
                    )}
                </div>
            </div>

            {/* ─── CUERPO UNIFICADO: SIDEBAR DE SECTORES + LIENZO MODULAR DEL TELAR ─── */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                
                {/* SIDEBAR LATERAL: SECTOR > UCI > LISTA DE INDICADORES CON CHECKLIST */}
                {sidebarOpen && (
                    <div style={{
                        width: '300px',
                        minWidth: '300px',
                        background: '#FFFFFF',
                        borderRight: '1px solid #E2E8F0',
                        display: 'flex',
                        flexDirection: 'column',
                        overflowY: 'auto'
                    }}>
                        {/* Nivel 1: Sector */}
                        <div style={{
                            padding: '12px 16px',
                            borderBottom: '1px solid #F1F5F9',
                            background: '#F8FAFC',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Sector
                                </span>
                            </div>
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#1E40AF', background: '#DBEAFE', padding: '2px 7px', borderRadius: '6px' }}>
                                Sanatorio Argentino
                            </span>
                        </div>

                        {/* Nivel 2: UCI */}
                        <div style={{ padding: '12px', borderBottom: '1px solid #F1F5F9' }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '10px 12px',
                                borderRadius: '8px',
                                background: '#EFF6FF',
                                border: '1px solid #BFDBFE',
                                color: '#1E40AF'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '1.2rem' }}>🏥</span>
                                    <div>
                                        <div style={{ fontWeight: 800, fontSize: '0.88rem' }}>UCI</div>
                                        <div style={{ fontSize: '0.68rem', color: '#3B82F6' }}>16 camas operativas</div>
                                    </div>
                                </div>
                                <span style={{
                                    fontSize: '0.7rem',
                                    background: '#2563EB',
                                    color: '#FFFFFF',
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                    fontWeight: 800
                                }}>
                                    {activeIndicatorIds.length} activos
                                </span>
                            </div>

                            {/* Sub-selector de UCI (Consolidado vs Intensiva vs Intermedia) */}
                            <div style={{
                                marginTop: '10px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px',
                                paddingLeft: '8px',
                                borderLeft: '2px solid #DBEAFE'
                            }}>
                                <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                                    Nivel Asistencial:
                                </span>
                                <div style={{ display: 'flex', gap: '3px' }}>
                                    {[
                                        { id: 'CONSOLIDADO', label: 'Total 16', color: '#2563EB' },
                                        { id: 'INTENSIVA', label: 'UTI (8)', color: '#DC2626' },
                                        { id: 'INTERMEDIA', label: 'UTIN (8)', color: '#D97706' }
                                    ].map(sub => {
                                        const isSel = uciSubNivel === sub.id;
                                        return (
                                            <button
                                                key={sub.id}
                                                type="button"
                                                onClick={() => handleSelectUciSubNivel(sub.id)}
                                                style={{
                                                    flex: 1,
                                                    padding: '5px 2px',
                                                    borderRadius: '6px',
                                                    border: isSel ? `1px solid ${sub.color}` : '1px solid #CBD5E1',
                                                    background: isSel ? '#FFFFFF' : '#F8FAFC',
                                                    color: isSel ? sub.color : '#64748B',
                                                    fontWeight: isSel ? 800 : 500,
                                                    fontSize: '0.68rem',
                                                    cursor: 'pointer',
                                                    boxShadow: isSel ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                {sub.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Nivel 3: Lista de Indicadores con botoncito de checklist */}
                        <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                    Indicadores UCI ({activeIndicatorIds.length})
                                </span>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                        type="button"
                                        onClick={handleSelectAllIndicators}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#2563EB',
                                            fontSize: '0.68rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            padding: '1px 4px'
                                        }}
                                    >
                                        Todos
                                    </button>
                                    <span style={{ color: '#CBD5E1' }}>|</span>
                                    <button
                                        type="button"
                                        onClick={handleResetDefaults}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#64748B',
                                            fontSize: '0.68rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            padding: '1px 4px'
                                        }}
                                    >
                                        Predeterminados
                                    </button>
                                </div>
                            </div>

                            {/* Grupos de Indicadores */}
                            {SIDEBAR_INDICATOR_GROUPS.map(group => {
                                const groupIndicators = INDICADORES_CATALOGO.filter(i => group.ids.includes(i.id));
                                if (groupIndicators.length === 0) return null;

                                const activeCountInGroup = groupIndicators.filter(i => activeIndicatorIds.includes(i.id)).length;

                                return (
                                    <div key={group.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '2px 4px',
                                            borderBottom: '1px solid #F1F5F9',
                                            marginBottom: '2px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                <span>{group.icon}</span>
                                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#334155' }}>
                                                    {group.title}
                                                </span>
                                            </div>
                                            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#64748B' }}>
                                                {activeCountInGroup}/{groupIndicators.length}
                                            </span>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            {groupIndicators.map(ind => {
                                                const isChecked = activeIndicatorIds.includes(ind.id);
                                                return (
                                                    <div
                                                        key={ind.id}
                                                        onClick={() => handleToggleIndicator(ind.id)}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            padding: '6px 8px',
                                                            borderRadius: '6px',
                                                            cursor: 'pointer',
                                                            background: isChecked ? '#EFF6FF' : 'transparent',
                                                            border: isChecked ? '1px solid #BFDBFE' : '1px solid transparent',
                                                            transition: 'all 0.12s ease'
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            if (!isChecked) e.currentTarget.style.background = '#F8FAFC';
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            if (!isChecked) e.currentTarget.style.background = 'transparent';
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleToggleIndicator(ind.id);
                                                                }}
                                                                style={{
                                                                    background: 'transparent',
                                                                    border: 'none',
                                                                    padding: 0,
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    color: isChecked ? '#1E40AF' : '#94A3B8'
                                                                }}
                                                                title={isChecked ? "Desactivar del dashboard" : "Enviar al dashboard"}
                                                            >
                                                                {isChecked ? (
                                                                    <CheckSquare size={16} color="#1E40AF" />
                                                                ) : (
                                                                    <Square size={16} color="#94A3B8" />
                                                                )}
                                                            </button>

                                                            <span style={{
                                                                fontSize: '0.74rem',
                                                                fontWeight: isChecked ? 700 : 500,
                                                                color: isChecked ? '#1E293B' : '#475569',
                                                                whiteSpace: 'nowrap',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis'
                                                            }}
                                                            title={ind.descripcion}
                                                            >
                                                                {ind.label}
                                                            </span>
                                                        </div>

                                                        <span style={{
                                                            fontSize: '0.6rem',
                                                            fontWeight: 700,
                                                            padding: '1px 4px',
                                                            borderRadius: '4px',
                                                            background: ind.tipo === 'kpi' ? '#DBEAFE' : ind.tipo === 'table' ? '#D1FAE5' : '#F1F5F9',
                                                            color: ind.tipo === 'kpi' ? '#1E40AF' : ind.tipo === 'table' ? '#065F46' : '#475569',
                                                            flexShrink: 0
                                                        }}>
                                                            {ind.tipo === 'kpi' ? 'KPI' : ind.tipo === 'table' ? 'Tabla' : 'Gráfico'}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* LIENZO PRINCIPAL DEL TELAR (MODULAR) */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                    {loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '350px', flexDirection: 'column', gap: '12px' }}>
                            <RefreshCw className="animate-spin" size={36} color="#2563EB" />
                            <span style={{ color: '#64748B', fontSize: '0.9rem', fontWeight: 600 }}>
                                Cargando indicadores del sector {activeSectorConfig.label}...
                            </span>
                        </div>
                    ) : viewMode === 'gantt' && sectorId === 'UCI' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <UciGanttChart 
                                rawData={rows}
                                initialDate={fechaDesde}
                            />
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            
                            {/* Banner de acceso rápido al Gantt de Camas */}
                            {sectorId === 'UCI' && (
                                <div style={{
                                    background: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%)',
                                    borderRadius: '12px',
                                    padding: '14px 20px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    color: '#FFFFFF',
                                    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.1)',
                                    flexWrap: 'wrap',
                                    gap: '12px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ background: '#2563EB', padding: '8px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Bed size={20} color="#FFFFFF" />
                                        </div>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '0.95rem', fontWeight: 800 }}>
                                                    Cronograma Gantt de Ocupación por Cama
                                                </span>
                                                <span style={{ background: '#3B82F6', fontSize: '0.68rem', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
                                                    16 Camas en Tiempo Real
                                                </span>
                                            </div>
                                            <span style={{ fontSize: '0.74rem', opacity: 0.85 }}>
                                                Línea de tiempo longitudinal con las 16 camas en el eje Y y desplazamiento horizontal de pacientes.
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setViewMode('gantt')}
                                        style={{
                                            background: '#FFFFFF',
                                            color: '#1E40AF',
                                            border: 'none',
                                            borderRadius: '8px',
                                            padding: '8px 16px',
                                            fontSize: '0.8rem',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                                        }}
                                    >
                                        <span>Abrir Diagrama de Gantt</span>
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            )}

                            {/* ─── BLOQUE 1: SCORECARDS EJECUTIVOS ─── */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                                
                                {/* 1. Días Camas Ocupados */}
                                {isIndicatorActive('kpi_dias_ocupados') && (
                                    <div style={{
                                        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                                        padding: '18px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)', position: 'relative'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                                                Días Camas Ocupados
                                            </span>
                                            <button 
                                                onClick={() => setInspectDataIndicator({ id: 'kpi_dias_ocupados', label: 'Días Camas Ocupados', sector: activeSectorConfig.label })}
                                                title="Ver datos tabulados"
                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
                                            >
                                                <Eye size={15} />
                                            </button>
                                        </div>
                                        <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#1E293B', margin: '8px 0' }}>
                                            {metrics.diasOcupados.toLocaleString('es-AR')}
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: '#10B981', fontWeight: 600 }}>
                                            ✓ Total pernoctadas / camas consumidas
                                        </span>
                                    </div>
                                )}

                                {/* 2. Días Camas Disponibles */}
                                {isIndicatorActive('kpi_dias_disponibles') && (
                                    <div style={{
                                        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                                        padding: '18px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                                                Días Camas Disponibles
                                            </span>
                                            <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{camasTotales} camas</span>
                                        </div>
                                        <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#1E293B', margin: '8px 0' }}>
                                            {metrics.camasDisponibles.toLocaleString('es-AR')}
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                            Capacidad instalada del sector
                                        </span>
                                    </div>
                                )}

                                {/* 3. % de Ocupación */}
                                {isIndicatorActive('kpi_porc_ocupacion') && (
                                    <div style={{
                                        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                                        padding: '18px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                                                % de Ocupación
                                            </span>
                                            <span style={{
                                                width: '10px', height: '10px', borderRadius: '50%',
                                                background: Number(metrics.porcOcupacion) > 95 ? '#EF4444' : Number(metrics.porcOcupacion) > 85 ? '#F59E0B' : '#10B981'
                                            }} />
                                        </div>
                                        <div style={{
                                            fontSize: '2.2rem', fontWeight: 800, margin: '8px 0',
                                            color: Number(metrics.porcOcupacion) > 95 ? '#EF4444' : Number(metrics.porcOcupacion) > 85 ? '#D97706' : '#10B981'
                                        }}>
                                            {metrics.porcOcupacion}%
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                            {Number(metrics.porcOcupacion) > 95 ? '⚠️ Alta Saturación' : 'Normal operativa'}
                                        </span>
                                    </div>
                                )}

                                {/* 4. % de Defunción */}
                                {isIndicatorActive('kpi_porc_defuncion') && (
                                    <div style={{
                                        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                                        padding: '18px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                                                % de Defunción
                                            </span>
                                            <button 
                                                onClick={() => setInspectDataIndicator({ id: 'kpi_porc_defuncion', label: 'Mortalidad y Egresos', sector: activeSectorConfig.label })}
                                                title="Ver datos tabulados"
                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
                                            >
                                                <Eye size={15} />
                                            </button>
                                        </div>
                                        <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#EF4444', margin: '8px 0' }}>
                                            {metrics.porcDefuncion}%
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                            {metrics.defunciones} de {metrics.totalAdmisiones} admisiones únicas
                                        </span>
                                    </div>
                                )}

                                {/* 5. Promedio de Estancia (ALOS) - Activado o desde catálogo */}
                                {isIndicatorActive('kpi_alos') && (
                                    <div style={{
                                        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                                        padding: '18px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                                                Promedio de Estancia
                                            </span>
                                            <Clock size={16} color="#2563EB" />
                                        </div>
                                        <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#2563EB', margin: '8px 0' }}>
                                            {metrics.alos} <span style={{ fontSize: '1rem', fontWeight: 600 }}>días</span>
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                            Rotación media por paciente
                                        </span>
                                    </div>
                                )}

                                {/* 6. Intensidad Diagnóstica (Estudios / Cama-Día) */}
                                {isIndicatorActive('kpi_intensidad_diagnostica') && (
                                    <div style={{
                                        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                                        padding: '18px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                                                Intensidad Diagnóstica
                                            </span>
                                            <span style={{
                                                fontSize: '0.7rem', fontWeight: 700, color: '#1E40AF', background: '#EFF6FF',
                                                padding: '2px 6px', borderRadius: '6px'
                                            }}>
                                                VLISE
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#0F172A', margin: '8px 0' }}>
                                            {metrics.intensidadCamaDia} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748B' }}>estudios/cama-día</span>
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                            {metrics.totalEstudiosPeriodo.toLocaleString('es-AR')} estudios en {activeSectorConfig.shortLabel} (~{metrics.estudiosPorAdmision}/paciente)
                                        </span>
                                    </div>
                                )}

                            </div>

                            {/* ─── BARRA DE CONTROL DEL LIENZO DE GRÁFICOS (REORDENABLES Y REDIMENSIONABLES) ─── */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '10px 16px',
                                background: '#FFFFFF',
                                border: '1px solid #E2E8F0',
                                borderRadius: '10px',
                                flexWrap: 'wrap',
                                gap: '10px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ background: '#EFF6FF', color: '#1E40AF', padding: '6px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Move size={15} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#1E293B' }}>
                                            Lienzo Dinámico de Gráficos & Auditoría
                                        </div>
                                        <span style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                            Arrastra los gráficos desde el tirador ⠿ para reordenar libremente · Redimensiona alto y ancho desde la esquina ⤡ o con botones 50%/100%.
                                        </span>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    {/* Filtro Rápido de Modalidad Diagnóstica (VLISE) */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#F8FAFC', padding: '3px 6px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B' }}>VLISE:</span>
                                        {[
                                            { id: 'TODAS', label: 'Todas' },
                                            { id: 'Laboratorio', label: '🔬 Lab' },
                                            { id: 'Imágenes', label: '🩻 RX' }
                                        ].map(m => (
                                            <button
                                                key={m.id}
                                                type="button"
                                                onClick={() => setModalidadFiltro(m.id)}
                                                style={{
                                                    background: modalidadFiltro === m.id ? '#EFF6FF' : 'transparent',
                                                    border: modalidadFiltro === m.id ? '1px solid #2563EB' : '1px solid transparent',
                                                    color: modalidadFiltro === m.id ? '#1E40AF' : '#475569',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.68rem',
                                                    fontWeight: modalidadFiltro === m.id ? 800 : 500,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {m.label}
                                            </button>
                                        ))}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handleResetChartLayout}
                                        title="Restablecer orden y tamaños predeterminados"
                                        style={{
                                            background: '#F8FAFC',
                                            border: '1px solid #CBD5E1',
                                            borderRadius: '6px',
                                            padding: '4px 10px',
                                            fontSize: '0.72rem',
                                            fontWeight: 600,
                                            color: '#475569',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '5px'
                                        }}
                                    >
                                        <RotateCcw size={13} />
                                        <span>Restablecer Lienzo</span>
                                    </button>
                                </div>
                            </div>

                            {/* ─── CONTENEDOR FLEXIBLE DE GRÁFICOS REORDENABLES Y REDIMENSIONABLES ─── */}
                            <div style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '20px',
                                alignItems: 'stretch'
                            }}>
                                {chartOrder.map((chartId, index) => {
                                    if (!isIndicatorActive(chartId)) return null;
                                    return renderChartCard(chartId, index);
                                })}
                            </div>

                        </div>
                    )}
                </div>

            </div>

            {/* ─── MODAL DE AUDITORÍA TABULAR DE DATOS ─── */}
            {inspectDataIndicator && (
                <TelarDataModal
                    indicator={inspectDataIndicator}
                    rawData={inspectDataIndicator.dataType === 'peticiones' ? (inspectDataIndicator.rawData || metrics.peticionesFiltradas) : filteredRows}
                    onClose={() => setInspectDataIndicator(null)}
                />
            )}

            {/* ─── DRAWER DEL CATÁLOGO MODULAR DE INDICADORES ─── */}
            <TelarCatalogoDrawer
                isOpen={isCatalogoOpen}
                onClose={() => setIsCatalogoOpen(false)}
                activeIds={activeIndicatorIds}
                onToggleIndicator={handleToggleIndicator}
                onResetDefaults={handleResetDefaults}
                sectorLabel={activeSectorConfig.label}
            />

            {/* ─── MODAL DE DOCUMENTACIÓN TÉCNICA ─── */}
            {showDocModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(3px)',
                    zIndex: 12000, display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{
                        background: '#FFFFFF', borderRadius: '16px', width: '90%', maxWidth: '800px',
                        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #E2E8F0',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            padding: '18px 24px', borderBottom: '1px solid #E2E8F0',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            background: '#F8FAFC'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <BookOpen size={20} color="#1E40AF" />
                                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0F172A' }}>
                                    Documentación Técnica y Metodología de Ocupación
                                </h3>
                            </div>
                            <button
                                onClick={() => setShowDocModal(false)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748B' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ padding: '24px', overflowY: 'auto', fontSize: '0.88rem', color: '#334155', lineHeight: 1.6 }}>
                            <h4 style={{ color: '#1E40AF', marginTop: 0 }}>1. Query Canónica de Extracción (SALUS SQL Server)</h4>
                            <pre style={{
                                background: '#F1F5F9', padding: '12px', borderRadius: '8px',
                                fontSize: '0.78rem', overflowX: 'auto', border: '1px solid #CBD5E1',
                                fontFamily: 'Consolas, monospace'
                            }}>
{`SELECT 
    b.[Número admisión],
    DATEADD(DAY, v.number, CAST(b.[Fecha ingreso] AS DATE)) AS [Fecha Ocupacion],
    b.Especialidad,
    b.idAdmision,
    b.[Fecha ingreso],
    b.[Fecha alta],
    b.Procedencia,
    b.NHC,
    b.Paciente,
    b.[Motivo de alta],
    b.Cliente,
    b.[Estado Conceptos],
    b.Servicio,
    b.Proceso,
    b.Edad,
    b.[Motivo Alta],
    b.[Control ADM finalizado]
FROM TABLEAU_Admisiones b
JOIN master.dbo.spt_values v
  ON v.type = 'P' 
  AND v.number <= DATEDIFF(DAY, CAST(b.[Fecha ingreso] AS DATE), CAST(ISNULL(b.[Fecha alta], GETDATE()) AS DATE))
WHERE (b.[Fecha alta] >= '2025-06-01' OR b.[Fecha alta] IS NULL)`}
                            </pre>

                            <h4 style={{ color: '#1E40AF', marginTop: '20px' }}>2. Queries de Peticiones y Estudios Clínicos (VLISE_PeticionesPruebas)</h4>
                            <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '4px 0 8px 0' }}>
                                Utilizadas para entender los estudios clínicos y analíticas en UCI, internación y producción global:
                            </p>
                            
                            <strong style={{ fontSize: '0.82rem', color: '#1E293B' }}>A. Detalle de Peticiones y Pruebas</strong>
                            <pre style={{
                                background: '#F1F5F9', padding: '12px', borderRadius: '8px',
                                fontSize: '0.76rem', overflowX: 'auto', border: '1px solid #CBD5E1',
                                fontFamily: 'Consolas, monospace', marginTop: '4px'
                            }}>
{`SELECT 
    CAST(IdPeticionDePrueba AS VARCHAR(50)) AS IdPeticion,
    [Fecha Solicitud],
    IdPaciente,
    Paciente,
    Solicitante,
    CAST([Paciente Edad] AS INT) AS PacienteEdad,
    Origen, -- Fundamental dejarlo abierto
    [Tipo Visita] AS TipoVisita,
    [Tipo Articulo] AS TipoArticulo,
    YEAR([Fecha Solicitud]) AS AnioSolicitud,
    MONTH([Fecha Solicitud]) AS MesSolicitud
FROM VLISE_PeticionesPruebas
WHERE [Fecha Solicitud] >= '2025-06-01'
  AND [Fecha Solicitud] IS NOT NULL`}
                            </pre>

                            <strong style={{ fontSize: '0.82rem', color: '#1E293B', marginTop: '10px', display: 'inline-block' }}>B. Producción Global por Origen</strong>
                            <pre style={{
                                background: '#F1F5F9', padding: '12px', borderRadius: '8px',
                                fontSize: '0.76rem', overflowX: 'auto', border: '1px solid #CBD5E1',
                                fontFamily: 'Consolas, monospace', marginTop: '4px'
                            }}>
{`SELECT 
    Origen,
    COUNT(*) AS CantidadEstudios,
    CAST(
        COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() 
    AS DECIMAL(10, 2)) AS PorcentajeProduccion
FROM VLISE_PeticionesPruebas
WHERE [Fecha Solicitud] >= '2025-06-01'
  AND [Fecha Solicitud] IS NOT NULL
GROUP BY Origen`}
                            </pre>

                            <h4 style={{ color: '#1E40AF', marginTop: '20px' }}>3. Fórmulas de Indicadores y Metodología</h4>
                            <ul>
                                <li><strong>Cantidad de Días Camas Ocupados:</strong> Conteo de pernoctadas naturales efectivas en el período (join con <code>spt_values</code>).</li>
                                <li><strong>Cantidad de Días Camas Disponibles:</strong> <code>Camas Operativas × Días del Período</code>.</li>
                                <li><strong>% de Ocupación:</strong> <code>(Días Camas Ocupados / Días Camas Disponibles) × 100</code>.</li>
                                <li><strong>% de Defunción (Mortalidad Cruda):</strong> <code>(Pacientes únicos fallecidos / Total de egresos) × 100</code>.</li>
                                <li><strong>Promedio de Estancia (ALOS):</strong> <code>Sumatoria de días de estancia / Total de altas efectivas</code>.</li>
                                <li><strong>Intensidad Diagnóstica:</strong> <code>Total Estudios Clínicos en la Unidad / Días Camas Ocupados</code> (mide la densidad diagnóstica y soporte de laboratorio/gases por paciente-día).</li>
                                <li><strong>Reclasificación Forense de Asistencia (Gobernanza):</strong> En SALUS, el 95.6% de los internados tienen <code>Asistencia IS NULL</code> (no pasan por mostrador ambulatorio). Aquellas peticiones de radiología/imágenes clasificadas como "Ambulatorio" pero con <code>Asistencia IS NULL</code>, <code>INTERNADO</code> o <code>URGENCIA</code> (30.743 estudios) son restituidas a internación y guardia, corrigiendo la distorsión del 24.3% nominal al 28.3% real.</li>
                            </ul>
                        </div>

                        <div style={{ padding: '12px 24px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setShowDocModal(false)}
                                style={{
                                    padding: '8px 16px', borderRadius: '6px', border: '1px solid #CBD5E1',
                                    background: '#FFFFFF', color: '#334155', fontWeight: 600, cursor: 'pointer'
                                }}
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
