import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { 
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, 
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList 
} from 'recharts';
import { 
    BookOpen, Filter, Calendar, Bed, Activity, Users, 
    AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, ChevronRight, RotateCcw, 
    X, FileText, Layers, PanelLeftClose, PanelLeftOpen, LayoutDashboard, 
    Sparkles, RefreshCw, Sliders, Table, Eye, Download, Clock, HeartHandshake,
    Check, Maximize2, CheckSquare, Square, GripVertical, Move
} from 'lucide-react';
import SalusSyncButton from '../SalusSyncButton';
import TelarCatalogoDrawer from './TelarCatalogoDrawer';
import TelarDataModal from './TelarDataModal';
import UciMortalidadAuditModal from './UciMortalidadAuditModal';
import SqlDocumentationModal from './SqlDocumentationModal';
import UciGanttChart from './UciGanttChart';
import DraggableChartCard from './DraggableChartCard';
import { 
    SECTORES_CONFIG, 
    INDICADORES_CATALOGO, 
    DEFAULT_ACTIVE_INDICATOR_IDS,
    INDICADORES_GUARDIA_CATALOGO,
    DEFAULT_ACTIVE_GUARDIA_IDS
} from './telarConfig';
import GuardiaClinicaDashboard from './GuardiaClinicaDashboard';

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
            'chart_sexo_demografia',
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
    'chart_sexo_demografia',
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
    chart_sexo_demografia: { width: 'half', height: 260 },
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

// ── Helpers de Fechas (Este Mes / Mes Anterior / Personalizado) ──
const getPrimerDiaMes = (d = new Date()) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
};

const getUltimoDiaMes = (d = new Date()) => {
    const y = d.getFullYear();
    const m = d.getMonth();
    const lastDay = new Date(y, m + 1, 0).getDate();
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
};

const getRangoMesAnterior = () => {
    const now = new Date();
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return {
        desde: getPrimerDiaMes(prevMonthDate),
        hasta: getUltimoDiaMes(prevMonthDate)
    };
};

/**
 * REGLA CLÍNICA MANDATORIA:
 * Determina si la defunción ocurrió dentro del período auditado evaluando exclusivamente su fecha de alta (deceso).
 */
export const isFechaAltaEnRango = (fechaAlta, desde, hasta) => {
    if (!fechaAlta || !desde || !hasta) return false;
    const dAlt = new Date(fechaAlta);
    if (isNaN(dAlt.getTime())) return false;
    const y = dAlt.getFullYear();
    const mo = String(dAlt.getMonth() + 1).padStart(2, '0');
    const d = String(dAlt.getDate()).padStart(2, '0');
    const altaDateStr = `${y}-${mo}-${d}`;
    return altaDateStr >= desde && altaDateStr <= hasta;
};

/**
 * REGLA DE DÍAS CAMA Y ESTANCIA HOSPITALARIA (CENSO NACIONAL / ESTÁNDAR SANATORIO ARGENTINO):
 * - Si ingresó 15/09 y egresó 16/09 = 1 día de estadía.
 * - Si ingresó 15/09 y egresó el mismo día = 1 día de estadía.
 * - En estancias grandes (multi-día), siempre el día de alta NO se cuenta como día de ocupación.
 */
export function calcularDiasEstancia(fechaIngreso, fechaAlta) {
    if (!fechaIngreso) return 1;
    const dIng = new Date(fechaIngreso);
    const dAlt = fechaAlta ? new Date(fechaAlta) : new Date();
    if (isNaN(dIng.getTime()) || isNaN(dAlt.getTime())) return 1;

    const ingStr = `${dIng.getFullYear()}-${String(dIng.getMonth() + 1).padStart(2, '0')}-${String(dIng.getDate()).padStart(2, '0')}`;
    const altStr = `${dAlt.getFullYear()}-${String(dAlt.getMonth() + 1).padStart(2, '0')}-${String(dAlt.getDate()).padStart(2, '0')}`;

    if (ingStr === altStr) {
        return 1;
    }

    const diffDays = Math.round((new Date(altStr) - new Date(ingStr)) / (1000 * 60 * 60 * 24));
    return Math.max(1, diffDays);
}

/**
 * Filtra si un registro diario de ocupación es computable según la regla censal:
 * En estancias de más de 1 día, la fecha de ocupación igual a la fecha de alta queda excluida.
 */
export function esDiaOcupadoValido(fechaOcupacion, fechaIngreso, fechaAlta) {
    if (!fechaOcupacion || !fechaIngreso || !fechaAlta) return true;
    const dOcup = String(fechaOcupacion).substring(0, 10);
    
    const dIng = new Date(fechaIngreso);
    const ingStr = `${dIng.getFullYear()}-${String(dIng.getMonth() + 1).padStart(2, '0')}-${String(dIng.getDate()).padStart(2, '0')}`;
    
    const dAlt = new Date(fechaAlta);
    const altStr = `${dAlt.getFullYear()}-${String(dAlt.getMonth() + 1).padStart(2, '0')}-${String(dAlt.getDate()).padStart(2, '0')}`;

    // Si ingresó y egresó el mismo día, ese único registro es válido (1 día)
    if (ingStr === altStr) {
        return dOcup === ingStr;
    }

    // En estancias grandes, el día de alta NO se cuenta
    return dOcup !== altStr;
}

export default function DiasOcupacionDashboard({ onOpenInfografia, onMetricsUpdate, addToast }) {
    // === ESTADOS DE NAVEGACIÓN Y SECTOR ===
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [sectorId, setSectorId] = useState('UCI');
    const [uciSubNivel, setUciSubNivel] = useState('CONSOLIDADO'); // 'CONSOLIDADO' | 'INTENSIVA' | 'INTERMEDIA'
    const [isUciOpen, setIsUciOpen] = useState(() => {
        return localStorage.getItem('telar_uci_expanded') === 'true';
    });

    const handleToggleUci = () => {
        setIsUciOpen(prev => {
            const next = !prev;
            try { localStorage.setItem('telar_uci_expanded', String(next)); } catch {}
            return next;
        });
    };

    const [isGuardiaOpen, setIsGuardiaOpen] = useState(() => {
        return localStorage.getItem('telar_guardia_expanded') === 'true';
    });

    const handleToggleGuardia = () => {
        setIsGuardiaOpen(prev => {
            const next = !prev;
            try { localStorage.setItem('telar_guardia_expanded', String(next)); } catch {}
            return next;
        });
    };

    const [activeGuardiaIds, setActiveGuardiaIds] = useState(() => {
        try {
            const saved = localStorage.getItem('telar_active_guardia_indicators');
            return saved ? JSON.parse(saved) : DEFAULT_ACTIVE_GUARDIA_IDS;
        } catch {
            return DEFAULT_ACTIVE_GUARDIA_IDS;
        }
    });

    const handleToggleGuardiaIndicator = (id) => {
        setActiveGuardiaIds(prev => {
            const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
            try { localStorage.setItem('telar_active_guardia_indicators', JSON.stringify(next)); } catch {}
            return next;
        });
    };

    const handleSelectAllGuardiaIndicators = () => {
        setActiveGuardiaIds(DEFAULT_ACTIVE_GUARDIA_IDS);
        try { localStorage.setItem('telar_active_guardia_indicators', JSON.stringify(DEFAULT_ACTIVE_GUARDIA_IDS)); } catch {}
        addToast?.('Todos los indicadores de Guardia activados', 'success');
    };
    const [viewMode, setViewMode] = useState('dashboard'); // 'dashboard' | 'gantt'
    const [selectedEspecialidades, setSelectedEspecialidades] = useState(null); // null = todas activas
    const [especDropdownOpen, setEspecDropdownOpen] = useState(false);
    const especDropdownRef = useRef(null);
    const [camasTotales, setCamasTotales] = useState(16);
    const [datePresetMode, setDatePresetMode] = useState('este_mes'); // 'este_mes' | 'mes_anterior' | 'personalizado'
    const [fechaDesde, setFechaDesde] = useState(() => getPrimerDiaMes());
    const [fechaHasta, setFechaHasta] = useState(() => getUltimoDiaMes());

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
    const [isMortalidadAuditOpen, setIsMortalidadAuditOpen] = useState(false);
    const [mortalidadAuditTargetPatient, setMortalidadAuditTargetPatient] = useState(null);

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
    const [camasHistorialRows, setCamasHistorialRows] = useState([]);
    const [especialidadesDisponibles, setEspecialidadesDisponibles] = useState([]);

    // Estados de Datos de Peticiones y Estudios Clínicos (VLISE)
    const [peticionesResumen, setPeticionesResumen] = useState([]);
    const [peticionesResumenGobernanza, setPeticionesResumenGobernanza] = useState([]);
    const [peticionesEstudios, setPeticionesEstudios] = useState([]);
    const [origenVision, setOrigenVision] = useState('gobernanza'); // 'gobernanza' | 'nominal'
    const [modalidadFiltro, setModalidadFiltro] = useState('TODAS'); // 'TODAS' | 'Laboratorio' | 'Imágenes'
    const [boxFiltro, setBoxFiltro] = useState('TODOS'); // 'TODOS' o 'BOX 1', etc.
    const [loadingPeticiones, setLoadingPeticiones] = useState(false);
    
    // Estado de Última Actualización SALUS
    const [ultimaActualizacion, setUltimaActualizacion] = useState(null);
    const [loadingActualizacion, setLoadingActualizacion] = useState(false);

    const fetchUltimaActualizacion = async () => {
        try {
            setLoadingActualizacion(true);
            const [rCenso, rOcup] = await Promise.all([
                supabase
                    .from('calidad_censo_camas_uci')
                    .select('updated_at')
                    .order('updated_at', { ascending: false, nullsFirst: false })
                    .limit(1),
                supabase
                    .from('calidad_admisiones_ocupacion')
                    .select('updated_at')
                    .order('updated_at', { ascending: false, nullsFirst: false })
                    .limit(1)
            ]);

            const t1 = rCenso.data?.[0]?.updated_at;
            const t2 = rOcup.data?.[0]?.updated_at;

            const valid = [t1, t2].filter(Boolean).map(t => new Date(t).getTime());
            if (valid.length > 0) {
                setUltimaActualizacion(new Date(Math.max(...valid)));
            }
        } catch (err) {
            console.warn('Error al obtener última actualización de SALUS:', err);
        } finally {
            setLoadingActualizacion(false);
        }
    };

    useEffect(() => {
        fetchUltimaActualizacion();
        const interval = setInterval(fetchUltimaActualizacion, 60000);
        return () => clearInterval(interval);
    }, []);

    const actualizacionInfo = useMemo(() => {
        if (!ultimaActualizacion) {
            return {
                fechaTexto: 'Consultando SALUS...',
                tiempoRelativo: '',
                isLive: false
            };
        }
        const d = new Date(ultimaActualizacion);
        if (isNaN(d.getTime())) {
            return {
                fechaTexto: 'Fecha no disponible',
                tiempoRelativo: '',
                isLive: false
            };
        }

        const meses = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];
        const dia = d.getDate();
        const mes = meses[d.getMonth()];
        const anio = d.getFullYear();
        const horas = String(d.getHours()).padStart(2, '0');
        const minutos = String(d.getMinutes()).padStart(2, '0');

        const fechaTexto = `${dia} de ${mes} de ${anio} · ${horas}:${minutos} hs`;

        const diffMs = Date.now() - d.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHoras = Math.floor(diffMins / 60);
        const diffDias = Math.floor(diffHoras / 24);

        let tiempoRelativo = '';
        if (diffMins < 2) tiempoRelativo = 'Recién sincronizado';
        else if (diffMins < 60) tiempoRelativo = `Hace ${diffMins} min`;
        else if (diffHoras < 24) tiempoRelativo = `Hace ${diffHoras} h`;
        else if (diffDias === 1) tiempoRelativo = 'Ayer';
        else tiempoRelativo = `Hace ${diffDias} días`;

        return {
            fechaTexto,
            tiempoRelativo,
            isLive: diffHoras < 24
        };
    }, [ultimaActualizacion]);

    // Modal de Documentación Técnica
    const [showDocModal, setShowDocModal] = useState(false);
    const [docModalTab, setDocModalTab] = useState('UCI');

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
        setDatePresetMode(preset);
        if (preset === 'este_mes') {
            setFechaDesde(getPrimerDiaMes());
            setFechaHasta(getUltimoDiaMes());
        } else if (preset === 'mes_anterior') {
            const { desde, hasta } = getRangoMesAnterior();
            setFechaDesde(desde);
            setFechaHasta(hasta);
        } else if (preset === 'personalizado') {
            // Modo manual: mantiene fechas para ajuste libre
        }
    };

    // Cargar datos desde Supabase
    useEffect(() => {
        fetchData();
    }, [sectorId, fechaDesde, fechaHasta]);

    const fetchData = async () => {
        if (sectorId === 'GUARDIA') {
            setLoading(false);
            setLoadingPeticiones(false);
            return;
        }
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
                    .select('id, id_admision, numero_admision, fecha_ocupacion, fecha_ingreso, fecha_alta, especialidad, servicio, paciente, nhc, motivo_de_alta, cliente, procedencia, edad, habitacion, sexo')
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

            // Complementario: Garantizar que cualquier defunción cuya fecha_alta caiga en el período esté incluida
            // aunque su pernoctada censal haya iniciado en un mes anterior
            try {
                let qDefs = supabase
                    .from('calidad_admisiones_ocupacion')
                    .select('id, id_admision, numero_admision, fecha_ocupacion, fecha_ingreso, fecha_alta, especialidad, servicio, paciente, nhc, motivo_de_alta, cliente, procedencia, edad, habitacion, sexo')
                    .gte('fecha_alta', `${fechaDesde}T00:00:00`)
                    .lte('fecha_alta', `${fechaHasta}T23:59:59`)
                    .or('motivo_de_alta.ilike.%defunc%,motivo_de_alta.ilike.%fallec%,motivo_de_alta.ilike.%obito%');

                if (sectorId === 'UCI') {
                    qDefs = qDefs.in('servicio', ['UCI', 'TERAPIA INTERMEDIA']);
                } else if (sectorId && sectorId !== 'TODOS') {
                    qDefs = qDefs.eq('servicio', sectorId);
                }

                const { data: extraDefs } = await qDefs;
                if (extraDefs && extraDefs.length > 0) {
                    const existingKeys = new Set(allRows.map(r => `${r.id_admision || r.numero_admision}_${r.fecha_ocupacion}`));
                    extraDefs.forEach(ed => {
                        const k = `${ed.id_admision || ed.numero_admision}_${ed.fecha_ocupacion}`;
                        if (!existingKeys.has(k)) {
                            allRows.push(ed);
                            existingKeys.add(k);
                        }
                    });
                }
            } catch (errDef) {
                console.warn('Advertencia cargando defunciones por fecha_alta:', errDef);
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
                        .or('habitacion.ilike.%BOX%,habitacion.ilike.%222%,habitacion.ilike.%223%,habitacion.ilike.%224%,habitacion.ilike.%226%,habitacion.ilike.%227%,habitacion.ilike.%228%,habitacion.ilike.%229%')
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

            // 4. Cargar Historial Granular de Camas y Traslados de UCI
            try {
                const { data: histData, error: histErr } = await supabase
                    .from('calidad_admisiones_camas_historial')
                    .select('*')
                    .in('servicio', ['UCI', 'TERAPIA INTERMEDIA'])
                    .or(`fecha_fin.gte.${fechaDesde}T00:00:00,fecha_fin.is.null`)
                    .lte('fecha_inicio', `${fechaHasta}T23:59:59`)
                    .order('fecha_inicio', { ascending: true });

                if (!histErr && histData) {
                    setCamasHistorialRows(histData);
                }
            } catch (errHist) {
                console.warn('Advertencia cargando historial de camas:', errHist);
            }

        } catch (err) {
            console.error('Error al cargar datos de gobernanza:', err);
        } finally {
            setLoading(false);
            setLoadingPeticiones(false);
        }
    };

    // Filtrar filas según Sub-Nivel de UCI, Especialidades y Regla Censal de Días Cama:
    // "Si ingresó 15/09 y salió 16/09 equivale a 1 día. Si ingresó 15/09 y salió el mismo día también equivale a 1 día.
    // En estancias grandes, el día de alta no se cuenta como día de ocupación."
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
        // Aplicar regla censal hospitalaria: excluir la fila censal del día de alta en estancias multi-día
        list = list.filter(r => esDiaOcupadoValido(r.fecha_ocupacion, r.fecha_ingreso, r.fecha_alta));
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
        // REGLA CLÍNICA MANDATORIA: Las defunciones se computan por FECHA DE ALTA (momento exacto del deceso),
        // no por fecha de ingreso ni fecha censal. Si ingresó en julio y falleció en agosto, se imputa a agosto.
        const defuncionesRows = admisionesUnicas.filter(r => {
            const m = (r.motivo_de_alta || '').toLowerCase();
            const esObito = m.includes('defunci') || m.includes('fallecid') || m.includes('óbito') || m.includes('obito');
            if (!esObito) return false;
            return isFechaAltaEnRango(r.fecha_alta, fechaDesde, fechaHasta);
        });
        const defunciones = defuncionesRows.length;

        const porcDefuncion = totalAdmisiones > 0 
            ? ((defunciones / totalAdmisiones) * 100).toFixed(1) 
            : '0.0';

        // Promedio de Estancia (ALOS) según estándar censal hospitalario
        let sumEstancia = 0;
        let countEstancia = 0;
        admisionesUnicas.forEach(r => {
            if (r.fecha_ingreso && r.fecha_alta) {
                const days = calcularDiasEstancia(r.fecha_ingreso, r.fecha_alta);
                sumEstancia += days;
                countEstancia++;
            }
        });
        const alos = countEstancia > 0 ? (sumEstancia / countEstancia).toFixed(1) : '—';

        // 1. Gráfico: Admisiones por Especialidad por Mes (Admisiones Únicas por Mes)
        const mesesSet = new Set();
        filteredRows.forEach(r => {
            if (r.fecha_ocupacion) {
                mesesSet.add(r.fecha_ocupacion.substring(0, 7));
            }
        });
        const mesesSorted = Array.from(mesesSet).sort();

        // Agrupar admisiones únicas por mes para evitar duplicar pacientes con múltiples días de internación
        const admisionesPorMesMap = new Map(); // mes -> Map(idAdmision -> record)
        mesesSorted.forEach(m => {
            admisionesPorMesMap.set(m, new Map());
        });

        filteredRows.forEach(r => {
            const m = r.fecha_ocupacion?.substring(0, 7);
            if (!m || !admisionesPorMesMap.has(m)) return;
            const key = r.id_admision || r.numero_admision;
            if (!admisionesPorMesMap.get(m).has(key)) {
                admisionesPorMesMap.get(m).set(key, r);
            }
        });

        const especialidadPorMes = {};
        mesesSorted.forEach(m => {
            especialidadPorMes[m] = {};
        });

        const topEspecialidadesSet = new Set();
        mesesSorted.forEach(m => {
            const admMap = admisionesPorMesMap.get(m);
            if (admMap) {
                admMap.forEach(r => {
                    const esp = r.especialidad ? r.especialidad.trim() : 'Sin Especialidad';
                    especialidadPorMes[m][esp] = (especialidadPorMes[m][esp] || 0) + 1;
                    topEspecialidadesSet.add(esp);
                });
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

        // 2. Gráfico: Admisiones Totales por Mes (Consistente con Admisiones Únicas)
        const dataAdmisionesTotales = mesesSorted.map(m => {
            const dObj = new Date(m + '-01T12:00:00');
            const mesNombre = dObj.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
            return {
                mesKey: m,
                mes: mesNombre,
                total: admisionesPorMesMap.get(m)?.size || 0
            };
        });

        // 3. Gráfico: Motivos de Alta
        const motivosMap = {};
        admisionesUnicas.forEach(r => {
            let m = (r.motivo_de_alta || 'Sin Alta Registrada').trim();
            const esDef = m.toLowerCase().includes('defunci') || m.toLowerCase().includes('fallecid') || m.toLowerCase().includes('obito');

            if (esDef) {
                // REGLA CLÍNICA: Solo computar Defunción si el deceso (fecha_alta) ocurrió en el período
                if (isFechaAltaEnRango(r.fecha_alta, fechaDesde, fechaHasta)) {
                    m = 'Defunción';
                } else {
                    m = 'Internado / Sin Alta en Período';
                }
            } else if (m.toLowerCase().includes('alta m')) {
                m = 'Alta médica';
            } else if (m.toLowerCase().includes('traslado a otro')) {
                m = 'Traslado a otro centro';
            } else if (m.toLowerCase().includes('voluntari')) {
                m = 'Alta voluntaria';
            }
            motivosMap[m] = (motivosMap[m] || 0) + 1;
        });
        const totalMotivos = Object.values(motivosMap).reduce((a, b) => a + b, 0);
        const dataMotivosAlta = Object.keys(motivosMap)
            .map((k, idx) => ({
                label: k,
                value: motivosMap[k],
                pct: totalMotivos > 0 ? ((motivosMap[k] / totalMotivos) * 100).toFixed(1) : '0.0',
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
        const totalEtario = Object.values(etarioMap).reduce((a, b) => a + b, 0);
        const dataRangoEtario = Object.keys(etarioMap).map((k, idx) => ({
            label: k,
            value: etarioMap[k],
            pct: totalEtario > 0 ? ((etarioMap[k] / totalEtario) * 100).toFixed(1) : '0.0',
            color: COLORS_ETARIO[idx % COLORS_ETARIO.length]
        }));

        // 4b. Gráfico: Distribución Demográfica por Sexo (% Mujer vs % Hombre)
        const sexoMap = { 'Mujer': 0, 'Hombre': 0, 'Sin especificar': 0 };
        admisionesUnicas.forEach(r => {
            const s = (r.sexo || '').trim().toUpperCase();
            if (s === 'F') sexoMap['Mujer']++;
            else if (s === 'M') sexoMap['Hombre']++;
            else sexoMap['Sin especificar']++;
        });
        const totalSexoValido = sexoMap['Mujer'] + sexoMap['Hombre'] + (sexoMap['Sin especificar'] || 0);
        const dataSexoDemografia = [
            {
                name: 'Mujer',
                label: 'Mujer',
                value: sexoMap['Mujer'],
                pct: totalSexoValido > 0 ? Math.round((sexoMap['Mujer'] / totalSexoValido) * 100) : 0,
                color: '#EAB308' // Amarillo Institucional (54% en UCI)
            },
            {
                name: 'Hombre',
                label: 'Hombre',
                value: sexoMap['Hombre'],
                pct: totalSexoValido > 0 ? Math.round((sexoMap['Hombre'] / totalSexoValido) * 100) : 0,
                color: '#2563EB' // Azul Institucional (46% en UCI)
            }
        ];
        if (sexoMap['Sin especificar'] > 0) {
            dataSexoDemografia.push({
                name: 'Sin especificar',
                label: 'Sin especificar',
                value: sexoMap['Sin especificar'],
                pct: totalSexoValido > 0 ? Math.round((sexoMap['Sin especificar'] / totalSexoValido) * 100) : 0,
                color: '#94A3B8'
            });
        }

        // 5. Gráfico: Categorías de Estancias
        const estanciasPorMes = {};
        mesesSorted.forEach(m => {
            estanciasPorMes[m] = { corta: 0, media: 0, larga: 0 };
        });
        admisionesUnicas.forEach(r => {
            if (r.fecha_ingreso) {
                const m = r.fecha_ingreso.substring(0, 7);
                if (estanciasPorMes[m]) {
                    const dias = calcularDiasEstancia(r.fecha_ingreso, r.fecha_alta);
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
        const totalProcedencia = Object.values(procedenciaMap).reduce((a, b) => a + b, 0);
        const dataProcedencia = Object.keys(procedenciaMap)
            .map((k, idx) => ({
                label: k,
                value: procedenciaMap[k],
                pct: totalProcedencia > 0 ? ((procedenciaMap[k] / totalProcedencia) * 100).toFixed(1) : '0.0',
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
        const totalClientes = Object.values(clientesMap).reduce((a, b) => a + b, 0);
        const dataClientes = Object.keys(clientesMap)
            .map((k, idx) => ({
                label: k,
                value: clientesMap[k],
                pct: totalClientes > 0 ? ((clientesMap[k] / totalClientes) * 100).toFixed(1) : '0.0',
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
            const habIntM = h.match(/^HABITACI[OÓ]N\s*(22[2-9])$/i) || h.match(/^(22[2-9])$/);
            if (habIntM) return 'HAB ' + habIntM[1];
            return h;
        };

        const isUciBed = (normH) => {
            return /^BOX\s*[1-8]$/.test(normH) || /^HAB\s*22[2-9]$/.test(normH) || /^22[2-9]$/.test(normH);
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
                if (!isUciBed(normH)) return false;
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
            { 
                name: 'Laboratorio & Bioquímica', 
                modalidad: 'Laboratorio & Bioquímica',
                value: modCounts['Laboratorio & Bioquímica'] || 0, 
                count: modCounts['Laboratorio & Bioquímica'] || 0,
                pct: totalBaseUci > 0 ? ((modCounts['Laboratorio & Bioquímica'] / totalBaseUci) * 100).toFixed(1) : '0.0', 
                porcentaje: totalBaseUci > 0 ? ((modCounts['Laboratorio & Bioquímica'] / totalBaseUci) * 100).toFixed(1) : '0.0',
                color: MOD_COLORS['Laboratorio & Bioquímica'] 
            },
            { 
                name: 'Diagnóstico por Imágenes / RX', 
                modalidad: 'Diagnóstico por Imágenes / RX',
                value: modCounts['Imágenes / RX'] || 0, 
                count: modCounts['Imágenes / RX'] || 0,
                pct: totalBaseUci > 0 ? ((modCounts['Imágenes / RX'] / totalBaseUci) * 100).toFixed(1) : '0.0', 
                porcentaje: totalBaseUci > 0 ? ((modCounts['Imágenes / RX'] / totalBaseUci) * 100).toFixed(1) : '0.0',
                color: MOD_COLORS['Imágenes / RX'] 
            },
            { 
                name: 'Anatomía Patológica', 
                modalidad: 'Anatomía Patológica',
                value: modCounts['Anatomía Patológica'] || 0, 
                count: modCounts['Anatomía Patológica'] || 0,
                pct: totalBaseUci > 0 ? ((modCounts['Anatomía Patológica'] / totalBaseUci) * 100).toFixed(1) : '0.0', 
                porcentaje: totalBaseUci > 0 ? ((modCounts['Anatomía Patológica'] / totalBaseUci) * 100).toFixed(1) : '0.0',
                color: MOD_COLORS['Anatomía Patológica'] 
            }
        ].filter(item => (item.value || 0) > 0);

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
                if (!isUciBed(habNorm)) return;
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
                pct: totalEstudiosBaseBox > 0 ? ((count / totalEstudiosBaseBox) * 100).toFixed(1) : '0.0',
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
        const totalTopEstudios = Object.values(estudiosCounts).reduce((a, b) => a + b, 0);
        const dataTopEstudios = Object.entries(estudiosCounts)
            .map(([label, value], idx) => ({
                label,
                value,
                pct: totalTopEstudios > 0 ? ((value / totalTopEstudios) * 100).toFixed(1) : '0.0',
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
        const totalTopSolicitantes = Object.values(solicitantesCounts).reduce((a, b) => a + b, 0);
        const dataTopSolicitantes = Object.entries(solicitantesCounts)
            .map(([label, value], idx) => ({
                label,
                value,
                pct: totalTopSolicitantes > 0 ? ((value / totalTopSolicitantes) * 100).toFixed(1) : '0.0',
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
            dataSexoDemografia,
            sexoMap,
            pctMujeres: dataSexoDemografia[0]?.pct || 0,
            pctHombres: dataSexoDemografia[1]?.pct || 0,
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
                                    <Tooltip 
                                        formatter={(val, name, entry) => {
                                            const sumMes = (metrics.topEspecialidades || []).reduce((acc, k) => acc + (Number(entry?.payload?.[k]) || 0), 0);
                                            const pct = sumMes > 0 ? ((val / sumMes) * 100).toFixed(0) : 0;
                                            return [`${val} (${pct}%)`, name];
                                        }}
                                        contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }} 
                                    />
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
                                <BarChart data={metrics.dataAdmisionesTotales} margin={{ top: 20, right: 10, left: -15, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                                    <XAxis dataKey="mes" stroke="#64748B" fontSize={11} />
                                    <YAxis stroke="#64748B" fontSize={11} />
                                    <Tooltip 
                                        formatter={(val) => {
                                            const totalPeriodo = (metrics.dataAdmisionesTotales || []).reduce((acc, d) => acc + (Number(d.total) || 0), 0);
                                            const pct = totalPeriodo > 0 ? ((val / totalPeriodo) * 100).toFixed(1) : 0;
                                            return [`${val} admisiones (${pct}% del período)`, 'Admisiones'];
                                        }}
                                        contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }} 
                                    />
                                    <Bar dataKey="total" fill="#1E40AF" radius={[4, 4, 0, 0]} name="Admisiones">
                                        <LabelList 
                                            dataKey="total" 
                                            position="top" 
                                            formatter={(val) => {
                                                const totalPeriodo = (metrics.dataAdmisionesTotales || []).reduce((acc, d) => acc + (Number(d.total) || 0), 0);
                                                return totalPeriodo > 0 ? `${((val / totalPeriodo) * 100).toFixed(0)}%` : '';
                                            }}
                                            style={{ fill: '#1E40AF', fontSize: '0.72rem', fontWeight: 700 }} 
                                        />
                                    </Bar>
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
                                        label={({ percent }) => percent > 0.04 ? `${(percent * 100).toFixed(0)}%` : ''}
                                        labelLine={false}
                                    >
                                        {metrics.dataMotivosAlta.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip 
                                        formatter={(val, name, entry) => [`${val} admisiones (${entry?.payload?.pct || 0}%)`, name]}
                                        contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }} 
                                    />
                                    <Legend 
                                        formatter={(value, entry) => `${value} (${entry?.payload?.pct || 0}%)`}
                                        wrapperStyle={{ fontSize: '0.72rem', paddingTop: '6px' }} 
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </DraggableChartCard>
                );

            case 'chart_sexo_demografia':
                return (
                    <DraggableChartCard
                        key={chartId}
                        id={chartId}
                        title={`Distribución de Pacientes ${sectorId === 'UCI' ? 'UCI ' : ''}por Sexo`}
                        subtitle="Proporción demográfica poblacional (% Mujer vs % Hombre)"
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
                                    id: 'chart_sexo_demografia', 
                                    label: `Distribución de Pacientes ${sectorId === 'UCI' ? 'UCI ' : ''}por Sexo`, 
                                    sector: activeSectorConfig.label, 
                                    chartData: metrics.dataSexoDemografia, 
                                    dataType: 'admisiones' 
                                })}
                                style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '3px 8px', fontSize: '0.72rem', fontWeight: 600, color: '#1E40AF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                title="Expandir gráfico y exportar a Excel"
                            >
                                <Maximize2 size={13} /> Expandir / Excel
                            </button>
                        }
                    >
                        {({ height }) => (
                            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ flex: 1, minHeight: 0 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={metrics.dataSexoDemografia}
                                                dataKey="value"
                                                nameKey="label"
                                                cx="50%"
                                                cy="50%"
                                                outerRadius={Math.min(Math.round(height * 0.38), 95)}
                                                label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
                                                    const RADIAN = Math.PI / 180;
                                                    const radius = innerRadius + (outerRadius - innerRadius) * 0.52;
                                                    const x = cx + radius * Math.cos(-midAngle * RADIAN);
                                                    const y = cy + radius * Math.sin(-midAngle * RADIAN);
                                                    const pctVal = Math.round(percent * 100);
                                                    return (
                                                        <text
                                                            x={x}
                                                            y={y}
                                                            fill="#FFFFFF"
                                                            textAnchor="middle"
                                                            dominantBaseline="central"
                                                            style={{
                                                                fontWeight: 800,
                                                                fontSize: '0.85rem',
                                                                filter: 'drop-shadow(0px 1px 2px rgba(0,0,0,0.6))'
                                                            }}
                                                        >
                                                            <tspan x={x} dy="-0.5em">{name}</tspan>
                                                            <tspan x={x} dy="1.2em">{pctVal}%</tspan>
                                                        </text>
                                                    );
                                                }}
                                                labelLine={false}
                                            >
                                                {metrics.dataSexoDemografia.map((entry, index) => (
                                                    <Cell key={`cell-sexo-${index}`} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip 
                                                formatter={(val, name, entry) => [`${val} pacientes (${entry.payload.pct}%)`, name]}
                                                contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }} 
                                            />
                                            <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '4px' }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div style={{ 
                                    background: '#F8FAFC', 
                                    border: '1px solid #E2E8F0', 
                                    borderRadius: '8px', 
                                    padding: '6px 10px', 
                                    margin: '0 8px 6px 8px',
                                    fontSize: '0.72rem',
                                    color: '#475569',
                                    lineHeight: '1.3'
                                }}>
                                    <strong style={{ color: '#1E293B' }}>Evolución Demográfica: </strong>
                                    Mujeres: <strong style={{ color: '#D97706' }}>{metrics.pctMujeres}%</strong> ({metrics.sexoMap?.Mujer || 0}) · Hombres: <strong style={{ color: '#2563EB' }}>{metrics.pctHombres}%</strong> ({metrics.sexoMap?.Hombre || 0}). Monitoreo demográfico continuo para balancear la transición hacia cuidados críticos polivalentes.
                                </div>
                            </div>
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
                                        label={({ percent }) => percent > 0.04 ? `${(percent * 100).toFixed(0)}%` : ''}
                                        labelLine={false}
                                    >
                                        {metrics.dataRangoEtario.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip 
                                        formatter={(val, name, entry) => [`${val} pacientes (${entry?.payload?.pct || 0}%)`, name]}
                                        contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }} 
                                    />
                                    <Legend 
                                        formatter={(value, entry) => `${value} (${entry?.payload?.pct || 0}%)`}
                                        wrapperStyle={{ fontSize: '0.72rem', paddingTop: '6px' }} 
                                    />
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
                                    <Tooltip 
                                        formatter={(val, name, entry) => {
                                            const total = (Number(entry?.payload?.corta) || 0) + (Number(entry?.payload?.media) || 0) + (Number(entry?.payload?.larga) || 0);
                                            const pct = total > 0 ? ((val / total) * 100).toFixed(0) : 0;
                                            return [`${val} pacientes (${pct}%)`, name];
                                        }}
                                        contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }} 
                                    />
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
                                <BarChart data={metrics.dataProcedencia} layout="vertical" margin={{ top: 5, right: 35, left: 40, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                                    <XAxis type="number" stroke="#64748B" fontSize={10} />
                                    <YAxis type="category" dataKey="label" stroke="#64748B" fontSize={10} width={90} />
                                    <Tooltip 
                                        formatter={(val, name, entry) => [`${val} pacientes (${entry?.payload?.pct || 0}%)`, name]}
                                        contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }} 
                                    />
                                    <Bar dataKey="value" fill="#3B82F6" radius={[0, 4, 4, 0]} name="Pacientes">
                                        <LabelList 
                                            dataKey="pct" 
                                            position="right" 
                                            formatter={(val) => val && Number(val) > 0 ? `${val}%` : ''} 
                                            style={{ fill: '#334155', fontSize: '0.72rem', fontWeight: 700 }} 
                                        />
                                    </Bar>
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
                                <BarChart data={metrics.dataClientes} layout="vertical" margin={{ top: 5, right: 35, left: 40, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                                    <XAxis type="number" stroke="#64748B" fontSize={10} />
                                    <YAxis type="category" dataKey="label" stroke="#64748B" fontSize={10} width={90} />
                                    <Tooltip 
                                        formatter={(val, name, entry) => [`${val} pacientes (${entry?.payload?.pct || 0}%)`, name]}
                                        contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }} 
                                    />
                                    <Bar dataKey="value" fill="#10B981" radius={[0, 4, 4, 0]} name="Pacientes">
                                        <LabelList 
                                            dataKey="pct" 
                                            position="right" 
                                            formatter={(val) => val && Number(val) > 0 ? `${val}%` : ''} 
                                            style={{ fill: '#334155', fontSize: '0.72rem', fontWeight: 700 }} 
                                        />
                                    </Bar>
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
                        badge={`${(metrics.totalBaseUci || 0).toLocaleString('es-AR')} Estudios`}
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
                                {(metrics.dataModalidadesUci || []).length === 0 ? (
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
                                                        dataKey="value"
                                                        nameKey="name"
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
                                                            `${Number(val || 0).toLocaleString('es-AR')} estudios (${item?.payload?.porcentaje || item?.payload?.pct || 0}%)`,
                                                            item?.payload?.modalidad || item?.payload?.name || name
                                                        ]}
                                                        contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
                                                    />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <div style={{ width: '52%', display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '8px' }}>
                                            {metrics.dataModalidadesUci.map((m, idx) => {
                                                const modName = m.modalidad || m.name || 'Estudio';
                                                const modCount = Number(m.count ?? m.value ?? 0);
                                                const modPct = m.porcentaje ?? m.pct ?? '0.0';
                                                return (
                                                    <div 
                                                        key={idx} 
                                                        onClick={() => setModalidadFiltro(modName)}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            padding: '5px 8px',
                                                            borderRadius: '6px',
                                                            background: modalidadFiltro === modName ? '#EFF6FF' : '#F8FAFC',
                                                            border: modalidadFiltro === modName ? '1px solid #2563EB' : '1px solid #E2E8F0',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: m.color }} />
                                                            <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#334155' }}>
                                                                {modName}
                                                            </span>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#0F172A' }}>
                                                                {modCount.toLocaleString('es-AR')}
                                                            </span>
                                                            <span style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                                                ({modPct}%)
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
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
                                        margin={{ top: 20, right: 10, left: -10, bottom: 20 }}
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
                                                `${Number(val || 0).toLocaleString('es-AR')} estudios (${item?.payload?.porcentaje || item?.payload?.pct || 0}%)`,
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
                                            <LabelList 
                                                dataKey="porcentaje" 
                                                position="top" 
                                                formatter={(val) => val && Number(val) > 0 ? `${val}%` : ''} 
                                                style={{ fill: '#1E40AF', fontSize: '0.72rem', fontWeight: 700 }} 
                                            />
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
                                        margin={{ top: 5, right: 40, left: 60, bottom: 5 }}
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
                                            formatter={(val, name, entry) => [
                                                `${Number(val || 0).toLocaleString('es-AR')} solicitudes (${entry?.payload?.pct || 0}%)`,
                                                'Cantidad'
                                            ]}
                                            contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
                                        />
                                        <Bar dataKey="value" fill="#2563EB" radius={[0, 4, 4, 0]} name="Solicitudes">
                                            <LabelList 
                                                dataKey="pct" 
                                                position="right" 
                                                formatter={(val) => val && Number(val) > 0 ? `${val}%` : ''} 
                                                style={{ fill: '#334155', fontSize: '0.72rem', fontWeight: 700 }} 
                                            />
                                        </Bar>
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
                                        margin={{ top: 5, right: 40, left: 60, bottom: 5 }}
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
                                            formatter={(val, name, entry) => [
                                                `${Number(val || 0).toLocaleString('es-AR')} solicitudes (${entry?.payload?.pct || 0}%)`,
                                                'Solicitudes'
                                            ]}
                                            contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
                                        />
                                        <Bar dataKey="value" fill="#8B5CF6" radius={[0, 4, 4, 0]} name="Solicitudes">
                                            <LabelList 
                                                dataKey="pct" 
                                                position="right" 
                                                formatter={(val) => val && Number(val) > 0 ? `${val}%` : ''} 
                                                style={{ fill: '#334155', fontSize: '0.72rem', fontWeight: 700 }} 
                                            />
                                        </Bar>
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
                        badge={`${(metrics.peticionesFiltradas?.length || 0).toLocaleString('es-AR')} registros`}
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
                flexDirection: 'column',
                gap: '10px',
                zIndex: 10
            }}>
                {/* FILA SUPERIOR 1: TÍTULO DEL SECTOR, SUB-SELECTORES Y TARJETA DESTACADA DE ÚLTIMA ACTUALIZACIÓN */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    flexWrap: 'wrap',
                    paddingBottom: '8px',
                    borderBottom: '1px solid #F1F5F9'
                }}>
                    {/* Lado Izquierdo: Toggle Sidebar + Título del Sector */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
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
                                    {sectorId === 'GUARDIA' ? `${activeGuardiaIds.length} Indicadores` : `${activeIndicatorIds.length} Indicadores`}
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

                    {/* Lado Derecho: TARJETA DESTACADA EN GRANDE - ÚLTIMA ACTUALIZACIÓN SALUS */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        background: '#FFFFFF',
                        border: '1.5px solid #CBD5E1',
                        borderRadius: '10px',
                        padding: '6px 16px',
                        boxShadow: '0 2px 5px rgba(0, 0, 0, 0.04)',
                        marginLeft: 'auto'
                    }}>
                        <div style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '8px',
                            background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
                            border: '1px solid #BFDBFE',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#1E40AF',
                            flexShrink: 0
                        }}>
                            <Clock size={20} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    background: actualizacionInfo.isLive ? '#10B981' : '#F59E0B',
                                    boxShadow: actualizacionInfo.isLive ? '0 0 0 2px rgba(16, 185, 129, 0.25)' : 'none',
                                    display: 'inline-block'
                                }} />
                                <span style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 800,
                                    color: '#475569',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.6px'
                                }}>
                                    Última Actualización SALUS
                                </span>
                                {actualizacionInfo.tiempoRelativo && (
                                    <span style={{
                                        fontSize: '0.68rem',
                                        fontWeight: 700,
                                        color: actualizacionInfo.isLive ? '#047857' : '#B45309',
                                        background: actualizacionInfo.isLive ? '#ECFDF5' : '#FFFBEB',
                                        padding: '1px 6px',
                                        borderRadius: '4px',
                                        border: actualizacionInfo.isLive ? '1px solid #A7F3D0' : '1px solid #FDE68A'
                                    }}>
                                        {actualizacionInfo.tiempoRelativo}
                                    </span>
                                )}
                                <button
                                    onClick={fetchUltimaActualizacion}
                                    title="Consultar última actualización"
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#94A3B8',
                                        cursor: 'pointer',
                                        padding: '1px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        marginLeft: '2px'
                                    }}
                                >
                                    <RefreshCw size={12} className={loadingActualizacion ? 'animate-spin' : ''} />
                                </button>
                            </div>
                            <div style={{
                                fontSize: '1.08rem',
                                fontWeight: 800,
                                color: '#0F172A',
                                letterSpacing: '-0.3px',
                                lineHeight: 1.2
                            }}>
                                {actualizacionInfo.fechaTexto}
                            </div>
                        </div>
                    </div>
                </div>

                {/* FILA INFERIOR 2: FILTROS PARAMÉTRICOS + SYNC + CENTRO DE EXPORTACIÓN */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap'
                }}>
                    {/* Filtros Paramétricos Centrales */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        
                        {/* Botón Catálogo de Indicadores */}
                        {sectorId === 'UCI' && (
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
                        )}

                        {/* Botón de Documentación Técnica */}
                        <button
                            onClick={() => {
                                setDocModalTab(sectorId);
                                setShowDocModal(true);
                            }}
                            style={{
                                background: '#F8FAFC',
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
                            <BookOpen size={15} color="#2563EB" />
                            Fórmulas & SQL
                        </button>

                        {/* Botón Tablero de Indicadores */}
                        <button
                            onClick={() => {}}
                            style={{
                                background: '#1E40AF',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '6px 12px',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                cursor: 'default'
                            }}
                        >
                            <LayoutDashboard size={15} />
                            Indicadores
                        </button>

                        {/* Botón Gantt Camas UCI */}
                        {sectorId === 'UCI' && (
                            <button
                                onClick={() => setIsGanttModalOpen(true)}
                                style={{
                                    background: '#F8FAFC',
                                    border: '1px solid #CBD5E1',
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
                                title="Abrir cronograma Gantt de ocupación por cama"
                            >
                                <Bed size={15} />
                                Gantt Camas UCI
                                <span style={{
                                    fontSize: '0.65rem',
                                    background: '#DBEAFE',
                                    color: '#1E40AF',
                                    padding: '1px 5px',
                                    borderRadius: '4px',
                                    fontWeight: 700
                                }}>
                                    16 Camas
                                </span>
                            </button>
                        )}

                        {/* Selector Especialidad Multi-Select para UCI */}
                        {sectorId === 'UCI' && (
                            <>
                                <div ref={especDropdownRef} style={{ position: 'relative' }}>
                                    <button
                                        type="button"
                                        onClick={() => setEspecDropdownOpen(prev => !prev)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '6px 10px',
                                            borderRadius: '8px',
                                            border: '1px solid #CBD5E1',
                                            background: selectedEspecialidades === null ? '#FFFFFF' : '#EFF6FF',
                                            fontSize: '0.78rem',
                                            fontWeight: 600,
                                            color: selectedEspecialidades === null ? '#334155' : '#1E40AF',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <Filter size={13} color={selectedEspecialidades === null ? '#64748B' : '#1E40AF'} />
                                        <span>Especialidad:</span>
                                        <strong style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {selectedEspecialidades === null 
                                                ? '(Todas)' 
                                                : selectedEspecialidades.length === 0 
                                                    ? 'Ninguna' 
                                                    : selectedEspecialidades.length === 1 
                                                        ? selectedEspecialidades[0] 
                                                        : `${selectedEspecialidades.length} selecc.`}
                                        </strong>
                                        <ChevronDown size={14} color="#64748B" />
                                    </button>

                                    {/* Dropdown Flotante con Checkboxes */}
                                    {especDropdownOpen && (
                                        <div style={{
                                            position: 'absolute',
                                            top: 'calc(100% + 4px)',
                                            left: 0,
                                            zIndex: 100,
                                            background: '#FFFFFF',
                                            border: '1px solid #CBD5E1',
                                            borderRadius: '8px',
                                            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
                                            width: '280px',
                                            maxHeight: '320px',
                                            padding: '8px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '6px'
                                        }}>
                                            {/* Cabecera del Dropdown: Acciones Rápidas */}
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                paddingBottom: '6px',
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
                            </>
                        )}

                        {/* Selector de Período Clínico: Este Mes, Mes Anterior y Personalizado */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {/* Botones de Presets: Este Mes | Mes Anterior | Personalizado */}
                            <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                background: '#F1F5F9',
                                padding: '2px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                gap: '2px'
                            }}>
                                <button
                                    type="button"
                                    onClick={() => handleSetDatePreset('este_mes')}
                                    style={{
                                        background: datePresetMode === 'este_mes' ? '#1E40AF' : 'transparent',
                                        color: datePresetMode === 'este_mes' ? '#FFFFFF' : '#475569',
                                        border: 'none',
                                        borderRadius: '6px',
                                        padding: '4px 9px',
                                        fontSize: '0.74rem',
                                        fontWeight: datePresetMode === 'este_mes' ? 700 : 500,
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                        boxShadow: datePresetMode === 'este_mes' ? '0 1px 2px rgba(30, 64, 175, 0.2)' : 'none'
                                    }}
                                    title="Filtrar datos del mes en curso"
                                >
                                    Este Mes
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSetDatePreset('mes_anterior')}
                                    style={{
                                        background: datePresetMode === 'mes_anterior' ? '#1E40AF' : 'transparent',
                                        color: datePresetMode === 'mes_anterior' ? '#FFFFFF' : '#475569',
                                        border: 'none',
                                        borderRadius: '6px',
                                        padding: '4px 9px',
                                        fontSize: '0.74rem',
                                        fontWeight: datePresetMode === 'mes_anterior' ? 700 : 500,
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                        boxShadow: datePresetMode === 'mes_anterior' ? '0 1px 2px rgba(30, 64, 175, 0.2)' : 'none'
                                    }}
                                    title="Filtrar datos del mes cerrado anterior"
                                >
                                    Mes Anterior
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSetDatePreset('personalizado')}
                                    style={{
                                        background: datePresetMode === 'personalizado' ? '#1E40AF' : 'transparent',
                                        color: datePresetMode === 'personalizado' ? '#FFFFFF' : '#475569',
                                        border: 'none',
                                        borderRadius: '6px',
                                        padding: '4px 9px',
                                        fontSize: '0.74rem',
                                        fontWeight: datePresetMode === 'personalizado' ? 700 : 500,
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                        boxShadow: datePresetMode === 'personalizado' ? '0 1px 2px rgba(30, 64, 175, 0.2)' : 'none'
                                    }}
                                    title="Seleccionar rango de fechas manual"
                                >
                                    Personalizado
                                </button>
                            </div>

                            {/* Rango de Fechas Interactivo (Desde - Hasta) */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                background: '#FFFFFF',
                                border: '1px solid #CBD5E1',
                                borderRadius: '8px',
                                padding: '3px 8px',
                                gap: '6px'
                            }}>
                                <Calendar size={13} color="#2563EB" />
                                <input
                                    type="date"
                                    value={fechaDesde}
                                    onChange={(e) => {
                                        setFechaDesde(e.target.value);
                                        setDatePresetMode('personalizado');
                                    }}
                                    style={{
                                        border: 'none',
                                        outline: 'none',
                                        fontSize: '0.75rem',
                                        color: '#1E293B',
                                        background: '#FFFFFF',
                                        fontWeight: 600
                                    }}
                                    title="Fecha Desde"
                                />
                                <span style={{ color: '#94A3B8', fontSize: '0.72rem' }}>a</span>
                                <input
                                    type="date"
                                    value={fechaHasta}
                                    onChange={(e) => {
                                        setFechaHasta(e.target.value);
                                        setDatePresetMode('personalizado');
                                    }}
                                    style={{
                                        border: 'none',
                                        outline: 'none',
                                        fontSize: '0.75rem',
                                        color: '#1E293B',
                                        background: '#FFFFFF',
                                        fontWeight: 600
                                    }}
                                    title="Fecha Hasta"
                                />
                            </div>
                        </div>

                    </div>

                    {/* Sincronización y Exportación IA */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <SalusSyncButton onComplete={() => { fetchData(); fetchUltimaActualizacion(); }} />
                        
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

                        {/* CONTENEDOR DE SERVICIOS (ACORDEÓN MODULAR) */}
                        <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
                            
                            {/* 🏥 SERVICIO: UCI (EXPANDIBLE AL TOCARLO) */}
                            <div style={{
                                borderRadius: '8px',
                                border: `1.5px solid ${isUciOpen ? '#93C5FD' : '#E2E8F0'}`,
                                background: '#FFFFFF',
                                boxShadow: isUciOpen ? '0 4px 12px -2px rgba(37, 99, 235, 0.08)' : '0 1px 2px rgba(0,0,0,0.03)',
                                overflow: 'hidden',
                                transition: 'all 0.2s ease'
                            }}>
                                {/* Botón Cabecera UCI */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        handleToggleUci();
                                        if (sectorId !== 'UCI') handleSelectSector('UCI');
                                    }}
                                    style={{
                                        width: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '11px 12px',
                                        background: isUciOpen ? '#EFF6FF' : '#F8FAFC',
                                        border: 'none',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        transition: 'background 0.15s ease'
                                    }}
                                    onMouseEnter={e => { if (!isUciOpen) e.currentTarget.style.background = '#F1F5F9'; }}
                                    onMouseLeave={e => { if (!isUciOpen) e.currentTarget.style.background = isUciOpen ? '#EFF6FF' : '#F8FAFC'; }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '1.25rem' }}>🏥</span>
                                        <div>
                                            <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#1E40AF' }}>UCI</div>
                                            <div style={{ fontSize: '0.68rem', color: '#3B82F6' }}>16 camas operativas</div>
                                        </div>
                                    </div>
                                    
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{
                                            fontSize: '0.68rem',
                                            background: isUciOpen ? '#2563EB' : '#DBEAFE',
                                            color: isUciOpen ? '#FFFFFF' : '#1E40AF',
                                            padding: '2px 8px',
                                            borderRadius: '10px',
                                            fontWeight: 800
                                        }}>
                                            {activeIndicatorIds.length} activos
                                        </span>
                                        <span style={{ color: isUciOpen ? '#2563EB' : '#94A3B8', display: 'flex', alignItems: 'center' }}>
                                            {isUciOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </span>
                                    </div>
                                </button>

                                {/* CONTENIDO DESPLEGABLE DE UCI ("TODO LO DE ABAJO") */}
                                {isUciOpen && (
                                    <div style={{
                                        borderTop: '1px solid #DBEAFE',
                                        background: '#FFFFFF',
                                        animation: 'fadeIn 0.2s ease-out'
                                    }}>
                                        {/* Sub-selector de UCI (Consolidado vs Intensiva vs Intermedia) */}
                                        <div style={{
                                            padding: '10px 12px',
                                            background: '#F8FAFC',
                                            borderBottom: '1px solid #F1F5F9',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '4px'
                                        }}>
                                            <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                                                Nivel Asistencial:
                                            </span>
                                            <div style={{ display: 'flex', gap: '3px' }}>
                                                {[
                                                    { id: 'CONSOLIDADO', label: 'Total 16', color: '#2563EB' },
                                                    { id: 'INTENSIVA', label: 'Intensiva (8)', color: '#DC2626' },
                                                    { id: 'INTERMEDIA', label: 'Intermedia (8)', color: '#D97706' }
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

                                        {/* Nivel 3: Lista de Indicadores con checklist */}
                                        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
                            </div>

                            {/* 🚑 SERVICIO: GUARDIA CLÍNICA (EXPANDIBLE AL TOCARLO) */}
                            <div style={{
                                borderRadius: '8px',
                                border: `1.5px solid ${isGuardiaOpen || sectorId === 'GUARDIA' ? '#93C5FD' : '#E2E8F0'}`,
                                background: '#FFFFFF',
                                boxShadow: isGuardiaOpen || sectorId === 'GUARDIA' ? '0 4px 12px -2px rgba(37, 99, 235, 0.08)' : '0 1px 2px rgba(0,0,0,0.03)',
                                overflow: 'hidden',
                                transition: 'all 0.2s ease'
                            }}>
                                {/* Botón Cabecera Guardia */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        handleToggleGuardia();
                                        if (sectorId !== 'GUARDIA') handleSelectSector('GUARDIA');
                                    }}
                                    style={{
                                        width: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '11px 12px',
                                        background: sectorId === 'GUARDIA' ? '#EFF6FF' : '#F8FAFC',
                                        border: 'none',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        transition: 'background 0.15s ease'
                                    }}
                                    onMouseEnter={e => { if (sectorId !== 'GUARDIA') e.currentTarget.style.background = '#F1F5F9'; }}
                                    onMouseLeave={e => { if (sectorId !== 'GUARDIA') e.currentTarget.style.background = '#F8FAFC'; }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '1.25rem' }}>🚑</span>
                                        <div>
                                            <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#1E40AF' }}>
                                                Guardia Clínica
                                            </div>
                                            <div style={{ fontSize: '0.68rem', color: '#3B82F6' }}>
                                                Urgencias & Shockroom
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{
                                            fontSize: '0.68rem',
                                            background: sectorId === 'GUARDIA' ? '#2563EB' : '#DBEAFE',
                                            color: sectorId === 'GUARDIA' ? '#FFFFFF' : '#1E40AF',
                                            padding: '2px 8px',
                                            borderRadius: '10px',
                                            fontWeight: 800
                                        }}>
                                            {activeGuardiaIds.length} activos
                                        </span>
                                        <span style={{ color: sectorId === 'GUARDIA' ? '#2563EB' : '#94A3B8', display: 'flex', alignItems: 'center' }}>
                                            {isGuardiaOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </span>
                                    </div>
                                </button>

                                {/* CONTENIDO DESPLEGABLE DE GUARDIA */}
                                {isGuardiaOpen && (
                                    <div style={{
                                        borderTop: '1px solid #DBEAFE',
                                        background: '#FFFFFF',
                                        animation: 'fadeIn 0.2s ease-out'
                                    }}>
                                        <div style={{ padding: '10px 12px', background: '#F8FAFC', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                                                Indicadores Guardia ({activeGuardiaIds.length})
                                            </span>
                                            <button
                                                type="button"
                                                onClick={handleSelectAllGuardiaIndicators}
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
                                        </div>

                                        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '320px', overflowY: 'auto' }}>
                                            {INDICADORES_GUARDIA_CATALOGO.map(ind => {
                                                const isChecked = activeGuardiaIds.includes(ind.id);
                                                return (
                                                    <div
                                                        key={ind.id}
                                                        onClick={() => {
                                                            if (sectorId !== 'GUARDIA') handleSelectSector('GUARDIA');
                                                            handleToggleGuardiaIndicator(ind.id);
                                                        }}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            padding: '6px 8px',
                                                            borderRadius: '6px',
                                                            cursor: 'pointer',
                                                            background: isChecked && sectorId === 'GUARDIA' ? '#EFF6FF' : 'transparent',
                                                            border: isChecked && sectorId === 'GUARDIA' ? '1px solid #BFDBFE' : '1px solid transparent',
                                                            transition: 'all 0.12s ease'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                                            {isChecked ? (
                                                                <CheckSquare size={15} color="#1E40AF" />
                                                            ) : (
                                                                <Square size={15} color="#94A3B8" />
                                                            )}
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
                                                            background: ind.tipo === 'kpi' ? '#DBEAFE' : '#D1FAE5',
                                                            color: ind.tipo === 'kpi' ? '#1E40AF' : '#065F46',
                                                            flexShrink: 0
                                                        }}>
                                                            {ind.tipo === 'kpi' ? 'KPI' : 'Donut'}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* LIENZO PRINCIPAL DEL TELAR (MODULAR) */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                    {sectorId === 'GUARDIA' ? (
                        <GuardiaClinicaDashboard 
                            onOpenDocModal={() => setShowDocModal(true)}
                            activeIndicatorIds={activeGuardiaIds}
                            onToggleIndicator={handleToggleGuardiaIndicator}
                            addToast={addToast}
                        />
                    ) : loading ? (
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
                                historialCamas={camasHistorialRows}
                                fechaDesde={fechaDesde}
                                fechaHasta={fechaHasta}
                                datePresetMode={datePresetMode}
                                onDatePresetChange={handleSetDatePreset}
                                onCustomDateChange={(d, h) => {
                                    setFechaDesde(d);
                                    setFechaHasta(h);
                                    setDatePresetMode('personalizado');
                                }}
                                onOpenMortalidadAudit={(patient) => {
                                    setMortalidadAuditTargetPatient(patient);
                                    setIsMortalidadAuditOpen(true);
                                }}
                                onClose={() => setViewMode('dashboard')}
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
                                            {Number(metrics.diasOcupados || 0).toLocaleString('es-AR')}
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
                                            {Number(metrics.camasDisponibles || 0).toLocaleString('es-AR')}
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
                                    <div 
                                        onClick={() => setIsMortalidadAuditOpen(true)}
                                        title="Ver Auditoría Clínica de Mortalidad y Motivos de Defunción"
                                        style={{
                                            background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                                            padding: '18px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.02)', cursor: 'pointer', transition: 'border-color 0.15s'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                                                % de Defunción
                                            </span>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); setIsMortalidadAuditOpen(true); }}
                                                title="Auditoría Clínica de Mortalidad"
                                                style={{ 
                                                    background: '#FEE2E2', border: 'none', cursor: 'pointer', color: '#DC2626', 
                                                    padding: '4px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', 
                                                    gap: '4px', fontSize: '0.72rem', fontWeight: 700 
                                                }}
                                            >
                                                <Eye size={13} />
                                                Auditar
                                            </button>
                                        </div>
                                        <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#EF4444', margin: '8px 0' }}>
                                            {metrics.porcDefuncion}%
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                                {metrics.defunciones} de {metrics.totalAdmisiones} admisiones
                                            </span>
                                            <span style={{ fontSize: '0.7rem', color: '#DC2626', fontWeight: 700 }}>
                                                Ver motivos →
                                            </span>
                                        </div>
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
                                            {Number(metrics.totalEstudiosPeriodo || 0).toLocaleString('es-AR')} estudios en {activeSectorConfig.shortLabel} (~{metrics.estudiosPorAdmision || 0}/paciente)
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
                    rawData={
                        inspectDataIndicator.dataType === 'peticiones' 
                            ? (inspectDataIndicator.rawData || metrics.peticionesFiltradas) 
                            : inspectDataIndicator.id === 'kpi_dias_ocupados'
                                ? filteredRows
                                : (metrics.admisionesUnicas || filteredRows)
                    }
                    onClose={() => setInspectDataIndicator(null)}
                />
            )}

            {/* ─── MODAL DE AUDITORÍA CLÍNICA DE MORTALIDAD UCI ─── */}
            <UciMortalidadAuditModal
                isOpen={isMortalidadAuditOpen}
                onClose={() => {
                    setIsMortalidadAuditOpen(false);
                    setMortalidadAuditTargetPatient(null);
                }}
                targetPatient={mortalidadAuditTargetPatient}
                rawData={filteredRows}
                totalAdmisionesCount={metrics.totalAdmisiones}
                sectorLabel={activeSectorConfig.label}
                dateFilter={{ fechaDesde, fechaHasta }}
            />

            {/* ─── DRAWER DEL CATÁLOGO MODULAR DE INDICADORES ─── */}
            <TelarCatalogoDrawer
                isOpen={isCatalogoOpen}
                onClose={() => setIsCatalogoOpen(false)}
                activeIds={activeIndicatorIds}
                onToggleIndicator={handleToggleIndicator}
                onResetDefaults={handleResetDefaults}
                sectorLabel={activeSectorConfig.label}
            />

            {/* ─── MODAL DE DOCUMENTACIÓN TÉCNICA & REPOSITORIO SQL (MANUAL COMPLETO) ─── */}
            <SqlDocumentationModal
                isOpen={showDocModal}
                onClose={() => setShowDocModal(false)}
                initialTab={docModalTab}
            />

        </div>
    );
}
