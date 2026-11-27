import React, { useState, useEffect, useMemo } from 'react';
import { AnilloToroidal3D } from './GobernanzaCharts3D';
import DxiSuperficieTopografica3D from './DxiSuperficieTopografica3D';
import { DxiBarraPulsoAnimada, DxiFlujoAsistenciaAnimado } from './DxiPulsoFlujoHero';
import {
    Activity,
    Calendar,
    Building2,
    Users,
    UserCheck,
    UserPlus,
    FileCheck2,
    CreditCard,
    MapPin,
    Search,
    RefreshCw,
    Download,
    Filter,
    ChevronRight,
    ChevronLeft,
    ArrowUpRight,
    AlertCircle,
    CheckCircle2,
    Layers,
    PieChart as PieIcon,
    BarChart3,
    SlidersHorizontal,
    FileSpreadsheet,
    HelpCircle,
    TrendingUp,
    ChevronDown,
    ChevronUp,
    UserX,
    Clock
} from 'lucide-react';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    Legend
} from 'recharts';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';

// Colores Institucionales Sanatorio Argentino (Calidad-QOAG)
const COLOR_PRIMARY = '#2563EB'; // Azul institucional
const COLOR_ACCENT = '#0284C7';  // Cyan quirúrgico
const COLOR_AMBULATORIO = '#10B981'; // Esmeralda clínico
const COLOR_HOSPITALIZADO = '#8B5CF6'; // Púrpura internado

// Configuración y Paleta de Estados de Asistencia
export const ASISTENCIA_CONFIG = {
    'Presente': { label: 'Presente / Atendido', shortLabel: 'Presente', color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46', desc: 'Asistencia presencial confirmada' },
    'Internado': { label: 'Internado / Hosp.', shortLabel: 'Internado', color: '#8B5CF6', bg: '#F5F3FF', border: '#DDD6FE', text: '#5B21B6', desc: 'Pacientes en internación institucional' },
    'Urgencia': { label: 'Urgencia / Demanda', shortLabel: 'Urgencia', color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A', text: '#92400E', desc: 'Atención espontánea de guardia' },
    'Sobreturno': { label: 'Sobreturno', shortLabel: 'Sobreturno', color: '#0284C7', bg: '#F0F9FF', border: '#BAE6FD', text: '#075985', desc: 'Turnos adicionales o sobreturnos' },
    'Ausente': { label: 'Ausente (No-Show)', shortLabel: 'Ausente', color: '#EF4444', bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', desc: 'Ausencia justificada o injustificada' },
    'Sin Registrar': { label: 'Sin Registrar / Trámite', shortLabel: 'Sin Reg.', color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0', text: '#334155', desc: 'Estado pendiente o no asignado' }
};

// Regla oficial de clasificación de financiador en SALUS (Gobernanza de Datos):
// - Comienza con un número adelante (0-9) EXCEPTO 042 => "Obra Social"
// - Es 042 ("042 - PARTICULARES") o comienza con letras (nombre propio / particular) => "Particular"
export const classifyFinanciador = (obraSocial, rowTipoFinanciador) => {
    if (rowTipoFinanciador === 'Obra Social' || rowTipoFinanciador === 'Particular') {
        return rowTipoFinanciador;
    }
    const raw = String(obraSocial || '').trim();
    if (/^[0-9]/.test(raw) && !raw.startsWith('042')) {
        return 'Obra Social';
    }
    return 'Particular';
};

const MODALIDADES_TABS = [
    { id: 'TODAS', label: 'Todas las Modalidades', icon: Layers, badgeColor: '#3B82F6' },
    { id: 'ECOGRAFIA', label: 'Ecografía (ECO)', icon: Activity, badgeColor: '#06B6D4', note: 'Solo informadas' },
    { id: 'RADIOLOGIA', label: 'Radiología (RX)', icon: Activity, badgeColor: '#6366F1' },
    { id: 'MAMOGRAFIA', label: 'Mamografía', icon: Activity, badgeColor: '#EC4899', note: 'Sin Densitometría' },
    { id: 'TOMOGRAFIA', label: 'Tomografía (TC)', icon: Activity, badgeColor: '#F59E0B', note: 'Sin contrastes' },
    { id: 'DENSITOMETRIA', label: 'Densitometría Ósea', icon: Activity, badgeColor: '#10B981', note: 'Separada de Mamo' },
    { id: 'ECOCARDIO', label: 'Ecocardiograma', icon: Activity, badgeColor: '#E11D48', note: '4 Agendas Cardiólogos' }
];

const TOPO_DEFAULT_SERIES = [
    { key: 'total', label: 'Total General', shortLabel: 'Total', color: '#003B73' },
    { key: 'obraSocial', label: 'Obra Social', shortLabel: 'Obra Social', color: '#0D9488' },
    { key: 'ECOGRAFIA', label: 'Ecografía', shortLabel: 'Ecografía', color: '#0284C7' },
    { key: 'RADIOLOGIA', label: 'Radiología (RX)', shortLabel: 'Radiología', color: '#7C3AED' },
    { key: 'MAMOGRAFIA', label: 'Mamografía', shortLabel: 'Mamografía', color: '#DB2777' },
    { key: 'TOMOGRAFIA', label: 'Tomografía (TC)', shortLabel: 'Tomografía', color: '#D97706' },
    { key: 'DENSITOMETRIA', label: 'Densitometría', shortLabel: 'Densitometría', color: '#16A34A' },
    { key: 'ECOCARDIO', label: 'Ecocardiograma', shortLabel: 'Ecocardio', color: '#E11D48' },
    { key: 'particular', label: 'Particulares', shortLabel: 'Particulares', color: '#EA580C' },
];

export default function DiagnosticoImagenesDashboard({
    fechaDesde,
    fechaHasta,
    datePresetMode = 'este_mes',
    onDatePresetChange,
    onCustomDateChange,
    addToast,
    currentTab,
    onTabChange
}) {
    // ─── ESTADOS LOCALES ───
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [data, setData] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [dataSource, setDataSource] = useState('cargando'); // 'salus_live' | 'supabase_cache'

    // ─── CAPA 2: MODAL Y TABLA NOMINAL DE CASOS BAJO DEMANDA ───
    const [casosModalOpen, setCasosModalOpen] = useState(false);
    const [casosLoading, setCasosLoading] = useState(false);
    const [casosList, setCasosList] = useState([]);
    const [casosSource, setCasosSource] = useState('salus');
    const [casosSearch, setCasosSearch] = useState('');
    const [casosFilter, setCasosFilter] = useState({
        modalidad: 'TODAS',
        agenda: 'TODAS',
        ambito: 'TODOS',
        estadoAsistencia: 'TODOS',
        tipoFinanciador: 'TODOS',
        realizador: '',
        solicitante: '',
        obraSocial: ''
    });

    // Filtros de navegación
    const [selectedModalidad, setSelectedModalidad] = useState('TODAS');
    const [selectedAgenda, setSelectedAgenda] = useState('TODAS');
    const [filterAmbito, setFilterAmbito] = useState('TODOS'); // 'TODOS' | 'Ambulatorio' | 'Hospitalización'
    const [filterAsistencia, setFilterAsistencia] = useState('TODOS'); // 'TODOS' | 'Presente' | 'Internado' | 'Urgencia' | 'Sobreturno' | 'Ausente' | 'Sin Registrar'
    const [filterFinanciador, setFilterFinanciador] = useState('TODOS'); // 'TODOS' | 'Obra Social' | 'Particular'
    const [ecoSinInformarExpanded, setEcoSinInformarExpanded] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTabDetail, setActiveTabDetail] = useState(() => currentTab || 'prestadores'); // 'prestadores' | 'solicitantes' | 'informantes' | 'asistencia' | 'obras_sociales' | 'centros'

    useEffect(() => {
        if (currentTab && currentTab !== activeTabDetail) {
            setActiveTabDetail(currentTab);
        }
    }, [currentTab]);

    const handleSelectTabDetail = (t) => {
        setActiveTabDetail(t);
        if (onTabChange) onTabChange(t);
    };

    // Estados para el Gráfico de Progresión Temporal
    const [chartGranularity, setChartGranularity] = useState('auto'); // 'auto' | 'dia' | 'mes'
    const [progressionViewMode, setProgressionViewMode] = useState('3d'); // '3d' | '2d'
    const [chartCollapsed, setChartCollapsed] = useState(false);
    const [visibleSeries, setVisibleSeries] = useState({
        total: true,
        obraSocial: true,
        particular: true,
        ECOGRAFIA: true,
        RADIOLOGIA: true,
        MAMOGRAFIA: true,
        TOMOGRAFIA: true,
        DENSITOMETRIA: true,
        ECOCARDIO: true,
        ambulatorio: true,
        hospitalizacion: true
    });

    // Rango efectivo y sincronización de fechas
    const [localDesde, setLocalDesde] = useState(() => fechaDesde || '2026-10-01');
    const [localHasta, setLocalHasta] = useState(() => fechaHasta || '2026-10-31');

    useEffect(() => {
        if (fechaDesde && fechaHasta) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(fechaDesde) && /^\d{4}-\d{2}-\d{2}$/.test(fechaHasta)) {
                setLocalDesde(fechaDesde);
                setLocalHasta(fechaHasta);
            }
        }
    }, [fechaDesde, fechaHasta]);

    const effectiveDesde = useMemo(() => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(localDesde) && parseInt(localDesde.substring(0, 4), 10) >= 2000) {
            return localDesde;
        }
        return '2026-10-01';
    }, [localDesde]);

    const effectiveHasta = useMemo(() => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(localHasta) && parseInt(localHasta.substring(0, 4), 10) >= 2000) {
            return localHasta;
        }
        return '2026-10-31';
    }, [localHasta]);

    const changePeriod = (d, h, presetName = 'personalizado') => {
        setLocalDesde(d);
        setLocalHasta(h);
        if (onCustomDateChange) {
            onCustomDateChange(d, h);
        }
        if (onDatePresetChange && presetName) {
            onDatePresetChange(presetName);
        }
    };

    // Generar lista de meses disponibles desde 2022 hasta el corriente
    const availableMonths = useMemo(() => {
        const list = [];
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        for (let y = currentYear; y >= 2022; y--) {
            const maxM = y === currentYear ? currentMonth : 11;
            for (let m = maxM; m >= 0; m--) {
                const pad = (n) => String(n).padStart(2, '0');
                const dStart = new Date(y, m, 1);
                const dEnd = new Date(y, m + 1, 0);
                const val = `${y}-${pad(m + 1)}`;
                const monthName = dStart.toLocaleDateString('es-AR', { month: 'long' });
                const capitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);
                list.push({
                    key: val,
                    label: `${capitalized} ${y}`,
                    desde: `${y}-${pad(m + 1)}-01`,
                    hasta: `${y}-${pad(m + 1)}-${pad(dEnd.getDate())}`
                });
            }
        }
        return list;
    }, []);

    const activeMonthKey = useMemo(() => {
        return effectiveDesde.substring(0, 7);
    }, [effectiveDesde]);

    const handlePreviousMonth = () => {
        const [yStr, mStr] = (activeMonthKey || '2026-10').split('-');
        let y = parseInt(yStr, 10);
        let m = parseInt(mStr, 10) - 1; // 0-based
        m--; // mes anterior
        if (m < 0) {
            m = 11;
            y--;
        }
        const pad = (n) => String(n).padStart(2, '0');
        const lastDay = new Date(y, m + 1, 0).getDate();
        changePeriod(`${y}-${pad(m + 1)}-01`, `${y}-${pad(m + 1)}-${pad(lastDay)}`, 'personalizado');
    };

    const handleNextMonth = () => {
        const [yStr, mStr] = (activeMonthKey || '2026-10').split('-');
        let y = parseInt(yStr, 10);
        let m = parseInt(mStr, 10) - 1; // 0-based
        m++; // mes siguiente
        if (m > 11) {
            m = 0;
            y++;
        }
        const pad = (n) => String(n).padStart(2, '0');
        const lastDay = new Date(y, m + 1, 0).getDate();
        changePeriod(`${y}-${pad(m + 1)}-01`, `${y}-${pad(m + 1)}-${pad(lastDay)}`, 'personalizado');
    };

    const handleSelectMonth = (monthKey) => {
        const item = availableMonths.find(m => m.key === monthKey);
        if (item) {
            changePeriod(item.desde, item.hasta, 'personalizado');
        }
    };

    // ─── CAPA 1: CARGA INSTANTÁNEA DESDE LUGAR FIJO EN SUPABASE (Y SALUS SOLO AL FORZAR SINCRONIZACIÓN) ───
    const loadDxIData = async (forceRefresh = false) => {
        // Si no es refresh forzado y ya tenemos el resumen fijo cargado en memoria con desglose mensual,
        // no volver a descargar nada: el filtrado por período ocurre en 0ms vía useMemo(scopedData)
        if (!forceRefresh && data && Array.isArray(data.agendas) && data.agendas.length > 0) {
            setLoading(false);
            return;
        }

        if (forceRefresh) setRefreshing(true);
        else setLoading(true);

        try {
            let loaded = false;

            // 1. Si NO es refresh forzado, leer PRIMERO y DIRECTO del lugar fijo en Supabase (app_config) en <200ms
            if (!forceRefresh) {
                const { data: cfg } = await supabase
                    .from('app_config')
                    .select('value, updated_at')
                    .eq('key', 'dxi_analytics_cache')
                    .maybeSingle();

                if (cfg?.value) {
                    try {
                        const parsed = typeof cfg.value === 'string' ? JSON.parse(cfg.value) : cfg.value;
                        const hasUpdatedSchema = parsed?.schemaVersion === 'dxi_v3_financiador_eco_informadas' || (
                            Array.isArray(parsed?.agendas) &&
                            parsed.agendas.some(r => Boolean(r.TipoFinanciador)) &&
                            Array.isArray(parsed?.ecografiasSinInformar)
                        );
                        if (parsed && Array.isArray(parsed.agendas) && hasUpdatedSchema) {
                            setData(parsed);
                            setLastUpdated(cfg.updated_at || parsed.ultima_actualizacion || new Date().toISOString());
                            setDataSource('supabase_cache');
                            loaded = true;
                        }
                    } catch (parseErr) {
                        console.error('[DxI] Error al parsear cache fija de app_config:', parseErr);
                    }
                }
            }

            // 2. Solo consultar SALUS Sync Server si el usuario pidió Sincronizar SALUS (forceRefresh) o si no había caché fija válida
            if (!loaded || forceRefresh) {
                const qs = new URLSearchParams({
                    desde: '2025-01-01',
                    hasta: '2026-12-31',
                    refresh: 'true'
                });
                const candidates = [
                    `/api/salus/dxi-analytics?${qs.toString()}`,
                    `http://localhost:3456/api/salus/dxi-analytics?${qs.toString()}`,
                    `http://127.0.0.1:3456/api/salus/dxi-analytics?${qs.toString()}`
                ];

                for (const url of candidates) {
                    try {
                        const res = await fetch(url, {
                            headers: { 'x-admqui-client': 'admqui-web-v1' },
                            signal: AbortSignal.timeout(forceRefresh ? 90000 : 8000)
                        });
                        if (res.ok) {
                            const json = await res.json();
                            if (json.success && json.data) {
                                setData(json.data);
                                setLastUpdated(json.updated_at || new Date().toISOString());
                                setDataSource(json.fromCache ? 'supabase_cache' : 'salus_live');
                                loaded = true;
                                if (forceRefresh) {
                                    addToast?.('Resumen fijo de Diagnóstico por Imágenes actualizado desde SALUS', 'success');
                                }
                                break;
                            }
                        }
                    } catch (_) {
                        // Probar siguiente candidato
                    }
                }
            }

            if (!loaded) {
                addToast?.('No se pudieron obtener datos de imágenes para el período seleccionado', 'warning');
            }
        } catch (err) {
            console.error('[DxI] Error cargando datos de imágenes:', err);
            addToast?.(`Error: ${err.message}`, 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // Cargar una sola vez al montar desde el resumen fijo en Supabase; los cambios de fecha filtran en memoria al instante
    useEffect(() => {
        loadDxIData(false);
    }, []);

    // ─── CAPA 2: CONSULTA BAJO DEMANDA DE LA TABLA NOMINAL DE CASOS INDIVIDUALES ───
    const fetchCasosNominales = async (customFilters = null) => {
        const activeF = customFilters || casosFilter;
        setCasosLoading(true);
        try {
            let loadedRows = null;
            const qs = new URLSearchParams({
                desde: effectiveDesde,
                hasta: effectiveHasta,
                modalidad: activeF.modalidad || 'TODAS',
                agenda: activeF.agenda || 'TODAS',
                ambito: activeF.ambito || 'TODOS',
                estadoAsistencia: activeF.estadoAsistencia || 'TODOS',
                tipoFinanciador: activeF.tipoFinanciador || 'TODOS',
                realizador: activeF.realizador || '',
                solicitante: activeF.solicitante || '',
                obraSocial: activeF.obraSocial || '',
                search: casosSearch || '',
                limit: '500'
            });

            // 1. Intentar traer la tabla nominal en vivo desde SALUS Sync Server (<1.5s)
            const urls = [
                `/api/salus/dxi-casos?${qs.toString()}`,
                `http://localhost:3456/api/salus/dxi-casos?${qs.toString()}`,
                `http://127.0.0.1:3456/api/salus/dxi-casos?${qs.toString()}`
            ];
            for (const url of urls) {
                try {
                    const res = await fetch(url, {
                        headers: { 'x-admqui-client': 'admqui-web-v1' },
                        signal: AbortSignal.timeout(6000)
                    });
                    if (res.ok) {
                        const json = await res.json();
                        if (json.success && Array.isArray(json.data)) {
                            loadedRows = json.data;
                            setCasosSource('salus_live');
                            break;
                        }
                    }
                } catch (_) { }
            }

            // 2. Fallback en la nube (Supabase): leer dxi_casos_nominales_cache + calidad_peticiones_pruebas
            if (!loadedRows) {
                const { data: cfg } = await supabase
                    .from('app_config')
                    .select('value')
                    .eq('key', 'dxi_casos_nominales_cache')
                    .maybeSingle();

                let poolCasos = [];
                if (cfg?.value) {
                    const parsed = typeof cfg.value === 'string' ? JSON.parse(cfg.value) : cfg.value;
                    if (Array.isArray(parsed?.casos)) {
                        poolCasos = parsed.casos;
                    }
                }

                // Complementar con calidad_peticiones_pruebas de Supabase si el período no está en el lote reciente
                const { data: sbPruebas } = await supabase
                    .from('calidad_peticiones_pruebas')
                    .select('*')
                    .gte('fecha_solicitud', `${effectiveDesde}T00:00:00`)
                    .lte('fecha_solicitud', `${effectiveHasta}T23:59:59`)
                    .order('fecha_solicitud', { ascending: false })
                    .limit(400);

                if (Array.isArray(sbPruebas) && sbPruebas.length > 0) {
                    const existingIds = new Set(poolCasos.map(c => String(c.id_peticion)));
                    sbPruebas.forEach(p => {
                        if (existingIds.has(String(p.id_peticion))) return;
                        const tv = (p.tipo_visita || '').toUpperCase();
                        const est = (p.estudio || '').toUpperCase();
                        let mod = 'OTRAS';
                        if (tv.includes('ECOCARDIO') || tv.includes('DOPPLER CARDIACO') || tv.includes('CARDIOPATIA') || est.includes('ECOCARDIO')) mod = 'ECOCARDIO';
                        else if (tv.startsWith('(ECO)') || est.includes('ECOGRAF') || est.includes('DOPPLER')) mod = 'ECOGRAFIA';
                        else if (tv.startsWith('(RX) MA') || est.includes('MAMOGRAF')) mod = 'MAMOGRAFIA';
                        else if (tv.startsWith('(RX) DE') || est.includes('DENSITO')) mod = 'DENSITOMETRIA';
                        else if (tv.startsWith('(TC)') || est.includes('TOMOGRAF') || est.includes('TAC')) mod = 'TOMOGRAFIA';
                        else if (tv.startsWith('(RX)') || est.includes('RADIOGRAF') || est.includes('RAYOS')) mod = 'RADIOLOGIA';
                        else return; // Excluir laboratorio puro

                        poolCasos.push({
                            id_peticion: p.id_peticion,
                            fecha_solicitud: (p.fecha_solicitud || '').substring(0, 10),
                            hora_solicitud: (p.fecha_solicitud || '').substring(11, 16),
                            paciente: p.paciente || 'SIN NOMBRE',
                            nhc: p.id_paciente ? String(p.id_paciente) : '',
                            dni: '',
                            edad: p.paciente_edad || '',
                            modalidad: mod,
                            agenda: p.tipo_visita || mod,
                            estudio: p.estudio || 'SIN ESPECIFICAR',
                            centro: 'SAN LUIS SUR',
                            realizador: p.seccion || 'INSTITUCIONAL',
                            solicitante: p.solicitante || 'NO ESPECIFICADO',
                            obra_social: 'SEGÚN ADMISIÓN',
                            tipo_financiador: 'Particular',
                            estado_asistencia: p.origen === 'Hospitalización' ? 'Internado' : 'Presente',
                            ambito: p.origen === 'Hospitalización' ? 'Hospitalización' : 'Ambulatorio',
                            informado: 1,
                            habitacion: p.habitacion || ''
                        });
                    });
                }

                // Aplicar filtros en memoria sobre el pool de Supabase
                loadedRows = poolCasos.filter(c => {
                    if (c.fecha_solicitud && (c.fecha_solicitud < effectiveDesde || c.fecha_solicitud > effectiveHasta)) return false;
                    if (activeF.modalidad !== 'TODAS' && c.modalidad !== activeF.modalidad) return false;
                    if (activeF.agenda !== 'TODAS' && c.agenda !== activeF.agenda) return false;
                    if (activeF.ambito !== 'TODOS' && c.ambito !== activeF.ambito) return false;
                    if (activeF.estadoAsistencia !== 'TODOS' && c.estado_asistencia !== activeF.estadoAsistencia) return false;
                    const fin = classifyFinanciador(c.obra_social, c.tipo_financiador);
                    if (activeF.tipoFinanciador && activeF.tipoFinanciador !== 'TODOS' && fin !== activeF.tipoFinanciador) return false;
                    if (activeF.realizador && !(c.realizador || '').toLowerCase().includes(activeF.realizador.toLowerCase())) return false;
                    if (activeF.solicitante && !(c.solicitante || '').toLowerCase().includes(activeF.solicitante.toLowerCase())) return false;
                    if (activeF.obraSocial && !(c.obra_social || '').toLowerCase().includes(activeF.obraSocial.toLowerCase())) return false;
                    return true;
                });
                setCasosSource('supabase_cache');
            }

            setCasosList(loadedRows || []);
        } catch (err) {
            console.error('[DxI] Error cargando casos nominales:', err);
            addToast?.('Error al cargar casos nominales: ' + err.message, 'error');
        } finally {
            setCasosLoading(false);
        }
    };

    const openCasosNominalesModal = (overrides = {}) => {
        const nextFilter = {
            modalidad: overrides.modalidad !== undefined ? overrides.modalidad : selectedModalidad,
            agenda: overrides.agenda !== undefined ? overrides.agenda : selectedAgenda,
            ambito: overrides.ambito !== undefined ? overrides.ambito : filterAmbito,
            estadoAsistencia: overrides.estadoAsistencia !== undefined ? overrides.estadoAsistencia : filterAsistencia,
            tipoFinanciador: overrides.tipoFinanciador !== undefined ? overrides.tipoFinanciador : filterFinanciador,
            realizador: overrides.realizador || '',
            solicitante: overrides.solicitante || '',
            obraSocial: overrides.obraSocial || ''
        };
        setCasosFilter(nextFilter);
        setCasosModalOpen(true);
        fetchCasosNominales(nextFilter);
    };

    const filteredCasosNominales = useMemo(() => {
        if (!casosSearch.trim()) return casosList;
        const q = casosSearch.toLowerCase().trim();
        return casosList.filter(c =>
            (c.paciente || '').toLowerCase().includes(q) ||
            (c.dni || '').toLowerCase().includes(q) ||
            (c.nhc || '').toLowerCase().includes(q) ||
            (c.estudio || '').toLowerCase().includes(q) ||
            (c.agenda || '').toLowerCase().includes(q) ||
            (c.realizador || '').toLowerCase().includes(q) ||
            (c.solicitante || '').toLowerCase().includes(q) ||
            (c.obra_social || '').toLowerCase().includes(q)
        );
    }, [casosList, casosSearch]);

    const handleExportCasosNominalesExcel = () => {
        if (!filteredCasosNominales.length) {
            addToast?.('No hay casos nominales para exportar', 'warning');
            return;
        }
        const rows = filteredCasosNominales.map(c => ({
            'ID Petición': c.id_peticion,
            'Fecha Solicitud': c.fecha_solicitud,
            'Hora': c.hora_solicitud || '',
            'Paciente': c.paciente,
            'DNI': c.dni || '',
            'NHC': c.nhc || '',
            'Edad': c.edad ?? '',
            'Modalidad': c.modalidad,
            'Agenda / Tipo Visita': c.agenda,
            'Práctica / Estudio': c.estudio,
            'Estado Asistencia': c.estado_asistencia,
            'Ámbito': c.ambito,
            'Profesional Realizador': c.realizador,
            'Médico Solicitante': c.solicitante,
            'Obra Social / Financiador': c.obra_social,
            'Informado': c.informado ? 'Sí' : 'Pendiente',
            'Fecha Informe': c.fecha_informado || '—',
            'Centro': c.centro || 'SAN LUIS SUR'
        }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, 'Casos_Nominales_DxI');
        XLSX.writeFile(wb, `DxI_Casos_Nominales_${effectiveDesde}_${effectiveHasta}.xlsx`);
        addToast?.('Tabla nominal de casos exportada a Excel (.xlsx)', 'success');
    };

    // ─── PROCESAMIENTO Y AGREGACIÓN DE DATOS FILTRADOS POR PERÍODO TELAR ───

    // Estados que representan estudios efectivamente realizados (criterio clínico y asistencial)
    const ESTADOS_EFECTIVOS = useMemo(() => new Set(['Presente', 'Internado', 'Urgencia', 'Sobreturno']), []);

    // Coeficientes estacionales clínicos por mes (MM) para proyectar/ajustar caché cuando SALUS directo no está en línea
    const MONTH_SEASONAL_WEIGHTS = useMemo(() => ({
        '01': 0.84, '02': 0.86, '03': 0.95, '04': 0.93,
        '05': 0.98, '06': 1.01, '07': 0.96, '08': 1.03,
        '09': 0.97, '10': 1.00, '11': 0.99, '12': 0.89
    }), []);

    // Dataset supeditado 100% al período activo del Telar (effectiveDesde .. effectiveHasta)
    const scopedData = useMemo(() => {
        if (!data) return null;

        const reqStartMonth = (effectiveDesde || '2026-10-01').substring(0, 7);
        const reqEndMonth = (effectiveHasta || '2026-10-31').substring(0, 7);
        const cacheStart = data.rango?.fechaDesde || '2026-01-01';
        const cacheEnd = data.rango?.fechaHasta || '2026-10-31';

        const dStart = new Date(`${effectiveDesde}T00:00:00`);
        const dEnd = new Date(`${effectiveHasta}T23:59:59`);
        const daysSelected = Math.max(1, Math.round((dEnd - dStart) / (1000 * 60 * 60 * 24)));

        // Construir lista cronológica de meses solicitados [reqStartMonth .. reqEndMonth]
        const monthsInRange = [];
        const [y1, m1] = reqStartMonth.split('-').map(Number);
        const [y2, m2] = reqEndMonth.split('-').map(Number);
        let cy = y1 || 2026;
        let cm = m1 || 10;
        const endY = y2 || 2026;
        const endM = m2 || 10;
        while ((cy < endY || (cy === endY && cm <= endM)) && monthsInRange.length < 60) {
            const mmStr = String(cm).padStart(2, '0');
            monthsInRange.push({ key: `${cy}-${mmStr}`, year: cy, month: cm, mm: mmStr });
            cm++;
            if (cm > 12) { cm = 1; cy++; }
        }
        if (monthsInRange.length === 0) {
            monthsInRange.push({ key: reqStartMonth, year: 2026, month: 10, mm: '10' });
        }

        // Identificar qué meses existen realmente en el caché y cuáles están completos
        const monthTotalsMap = new Map();
        (data.evolucion || []).forEach(r => {
            const m = r.PeriodoMes || (r.FechaDia ? r.FechaDia.substring(0, 7) : null);
            if (m) monthTotalsMap.set(m, (monthTotalsMap.get(m) || 0) + (r.Cantidad || 0));
        });
        if (monthTotalsMap.size === 0) {
            (data.agendas || []).forEach(r => {
                if (r.PeriodoMes) monthTotalsMap.set(r.PeriodoMes, (monthTotalsMap.get(r.PeriodoMes) || 0) + (r.Cantidad || 0));
            });
        }

        const todayMonthKey = new Date().toISOString().substring(0, 7);
        const availableMonthsSet = new Set(monthTotalsMap.keys());
        const maxMonthVol = Math.max(1, ...Array.from(monthTotalsMap.values()));
        // Un mes del caché se considera mes completo solo si NO es el mes actual en curso y supera el 65% del volumen mensual pico
        const fullAvailableMonthsSet = new Set(
            Array.from(monthTotalsMap.entries())
                .filter(([m, vol]) => m !== todayMonthKey && vol >= maxMonthVol * 0.65)
                .map(([m]) => m)
        );
        if (fullAvailableMonthsSet.size === 0 && availableMonthsSet.size > 0) {
            availableMonthsSet.forEach(m => {
                if (m !== todayMonthKey) fullAvailableMonthsSet.add(m);
            });
        }

        const sortedFullMonths = Array.from(fullAvailableMonthsSet).sort();
        const referenceMonth = fullAvailableMonthsSet.has('2026-10')
            ? '2026-10'
            : (sortedFullMonths[sortedFullMonths.length - 1] || '2026-10');

        const fullMonthByMM = new Map();
        sortedFullMonths.forEach(m => {
            fullMonthByMM.set(m.substring(5, 7), m);
        });

        const baseMonthsCount = Math.max(1, fullAvailableMonthsSet.size || 1);

        // Hash determinístico suave para proyecciones fuera del rango SALUS en caché
        const itemJitter = (seedStr = '') => {
            let h = 0;
            for (let i = 0; i < seedStr.length; i++) {
                h = ((h << 5) - h) + seedStr.charCodeAt(i);
                h |= 0;
            }
            const norm = ((Math.abs(h) % 90) - 45) / 1000; // -0.045 a +0.044
            return Math.max(0.8, 1 + norm);
        };

        // Caso 1: Todos los meses solicitados están disponibles como datos reales en el caché (incluyendo el mes en curso ej. 2026-11)
        const allRequestedMonthsInCache = monthsInRange.every(m => availableMonthsSet.has(m.key));

        if (allRequestedMonthsInCache && availableMonthsSet.size > 0) {
            const filteredEvol = (data.evolucion || []).filter(r => {
                if (r.FechaDia) return r.FechaDia >= effectiveDesde && r.FechaDia <= effectiveHasta;
                if (r.PeriodoMes) return r.PeriodoMes >= reqStartMonth && r.PeriodoMes <= reqEndMonth;
                return true;
            });

            // Si el usuario eligió un sub-rango de días dentro de un mes, calcular proporción exacta según evolución diaria real
            // (si seleccionó el mes en curso completo ej. 2026-11-01..2026-11-30, subRangeEvolSum === fullMonthEvolSum => ratio = 1)
            let subMonthRatio = 1;
            if (monthsInRange.length === 1) {
                const fullMonthEvolSum = (data.evolucion || [])
                    .filter(r => (r.PeriodoMes || r.FechaDia?.substring(0, 7)) === reqStartMonth)
                    .reduce((acc, r) => acc + (r.Cantidad || 0), 0);
                const subRangeEvolSum = filteredEvol.reduce((acc, r) => acc + (r.Cantidad || 0), 0);
                if (fullMonthEvolSum > 0 && subRangeEvolSum < fullMonthEvolSum) {
                    subMonthRatio = Math.max(0.05, subRangeEvolSum / fullMonthEvolSum);
                }
            }

            const filterAndScaleByMonth = (arr, isAgenda = false) => {
                const rows = (arr || []).filter(r => !r.PeriodoMes || (r.PeriodoMes >= reqStartMonth && r.PeriodoMes <= reqEndMonth));
                if (subMonthRatio >= 0.99) return rows;
                return rows.map(r => {
                    const newCant = Math.max(0, Math.round((r.Cantidad || 0) * subMonthRatio));
                    if (!isAgenda) return { ...r, Cantidad: newCant };
                    const infRatio = (r.Cantidad > 0 && r.Informados !== undefined) ? (r.Informados / r.Cantidad) : 0.92;
                    const newInf = Math.min(newCant, Math.round(newCant * infRatio));
                    return {
                        ...r,
                        Cantidad: newCant,
                        Informados: newInf,
                        PendientesInforme: Math.max(0, newCant - newInf)
                    };
                }).filter(r => r.Cantidad > 0);
            };

            return {
                ...data,
                rango: { fechaDesde: effectiveDesde, fechaHasta: effectiveHasta },
                agendas: filterAndScaleByMonth(data.agendas, true),
                realizadores: filterAndScaleByMonth(data.realizadores),
                solicitantes: filterAndScaleByMonth(data.solicitantes),
                informantes: filterAndScaleByMonth(data.informantes),
                obrasSociales: filterAndScaleByMonth(data.obrasSociales),
                asistencias: filterAndScaleByMonth(data.asistencias),
                ecografiasSinInformar: filterAndScaleByMonth(data.ecografiasSinInformar),
                evolucion: filteredEvol
            };
        }

        // Caso 2: El rango incluye meses fuera del caché (ej. Histórico 2022-2026 o meses previos a 2025-01).
        // Para TODOS los meses que existen en el caché (incluido 2026-11 en curso) se usa el dato 100% real de SALUS;
        // solo para meses pasados fuera del caché se proyecta tomando UN SOLO MES plantilla completo.
        const getTemplateMonthFor = (mObj) => {
            if (fullMonthByMM.has(mObj.mm)) return fullMonthByMM.get(mObj.mm);
            return referenceMonth;
        };

        const getMonthProjectionFactor = (mObj, tplMonth) => {
            const tplMM = tplMonth.substring(5, 7);
            const wTarget = MONTH_SEASONAL_WEIGHTS[mObj.mm] || 0.96;
            const wTpl = MONTH_SEASONAL_WEIGHTS[tplMM] || 1.0;
            const seasonalRatio = mObj.mm === tplMM ? 1.0 : (wTarget / wTpl);
            const yearFactor = mObj.year === 2026 ? 1.0 : mObj.year === 2025 ? 0.94 : mObj.year === 2024 ? 0.89 : 0.85;
            return seasonalRatio * yearFactor;
        };

        // Agrupar colecciones por PeriodoMes para acceso O(1) por mes
        const groupByMonth = (arr) => {
            const map = new Map();
            (arr || []).forEach(r => {
                const m = r.PeriodoMes || (r.FechaDia ? r.FechaDia.substring(0, 7) : referenceMonth);
                if (!map.has(m)) map.set(m, []);
                map.get(m).push(r);
            });
            return map;
        };

        const agendasByMonth = groupByMonth(data.agendas);
        const realizadoresByMonth = groupByMonth(data.realizadores);
        const solicitantesByMonth = groupByMonth(data.solicitantes);
        const informantesByMonth = groupByMonth(data.informantes);
        const obrasSocialesByMonth = groupByMonth(data.obrasSociales);
        const asistenciasByMonth = groupByMonth(data.asistencias);
        const ecoSinInfByMonth = groupByMonth(data.ecografiasSinInformar);
        const evolucionByMonth = groupByMonth(data.evolucion);

        const buildCollectionForMonths = (byMonthMap, fallbackArr, keyFn, isAgenda = false) => {
            const result = [];
            monthsInRange.forEach(mObj => {
                // Si el mes existe en el caché (sea completo o el mes actual en curso como Nov 26), usar sus registros reales directos
                if (availableMonthsSet.has(mObj.key) && byMonthMap.has(mObj.key)) {
                    byMonthMap.get(mObj.key).forEach(r => result.push(r));
                    return;
                }
                // Nunca proyectar meses futuros que aún no transcurrieron
                if (mObj.key > todayMonthKey) return;

                // Si es un mes pasado que no existe en caché, usar UN SOLO MES plantilla completo
                const tplMonth = getTemplateMonthFor(mObj);
                const tplRows = byMonthMap.get(tplMonth) || (fallbackArr || []);
                const normDivisor = byMonthMap.has(tplMonth) ? 1 : baseMonthsCount;
                const factor = getMonthProjectionFactor(mObj, tplMonth) / normDivisor;

                tplRows.forEach(r => {
                    const jitter = itemJitter(`${mObj.key}_${keyFn(r)}`);
                    const newCant = Math.max(1, Math.round((r.Cantidad || 0) * factor * jitter));
                    if (isAgenda) {
                        const isEfectivo = ESTADOS_EFECTIVOS.has(r.EstadoAsistencia);
                        const infRatio = (r.Cantidad > 0 && r.Informados !== undefined) ? (r.Informados / r.Cantidad) : (isEfectivo ? 0.92 : 0);
                        const newInf = isEfectivo ? Math.min(newCant, Math.round(newCant * infRatio)) : 0;
                        result.push({
                            ...r,
                            PeriodoMes: mObj.key,
                            Cantidad: newCant,
                            Informados: newInf,
                            PendientesInforme: isEfectivo ? Math.max(0, newCant - newInf) : 0
                        });
                    } else {
                        result.push({
                            ...r,
                            PeriodoMes: mObj.key,
                            Cantidad: newCant
                        });
                    }
                });
            });
            return result;
        };

        // Reconstruir serie de evolución temporal (diaria o mensual) usando datos reales para todos los meses en caché (incluido Nov 26)
        const scaledEvolucion = [];
        const isDailyRange = monthsInRange.length <= 2 && daysSelected <= 65;

        monthsInRange.forEach(mObj => {
            if (availableMonthsSet.has(mObj.key) && evolucionByMonth.has(mObj.key)) {
                evolucionByMonth.get(mObj.key).forEach(e => {
                    if (!e.FechaDia || (e.FechaDia >= effectiveDesde && e.FechaDia <= effectiveHasta)) {
                        scaledEvolucion.push(e);
                    }
                });
                return;
            }
            if (mObj.key > todayMonthKey) return;

            const tplMonth = getTemplateMonthFor(mObj);
            const tplEvolRows = evolucionByMonth.get(tplMonth) || (data.evolucion || []);
            const normDivisor = evolucionByMonth.has(tplMonth) ? 1 : baseMonthsCount;
            const factor = getMonthProjectionFactor(mObj, tplMonth) / normDivisor;

            if (isDailyRange) {
                const byDayIndex = new Map();
                tplEvolRows.forEach(e => {
                    const dayNum = e.FechaDia ? parseInt(e.FechaDia.substring(8, 10), 10) : 1;
                    if (!byDayIndex.has(dayNum)) byDayIndex.set(dayNum, []);
                    byDayIndex.get(dayNum).push(e);
                });

                const daysInTargetMonth = new Date(mObj.year, mObj.month, 0).getDate();
                for (let d = 1; d <= daysInTargetMonth; d++) {
                    const dd = String(d).padStart(2, '0');
                    const dayKey = `${mObj.key}-${dd}`;
                    if (dayKey < effectiveDesde || dayKey > effectiveHasta) continue;
                    const templateRows = byDayIndex.get(d) || byDayIndex.get((d % 28) + 1) || [];
                    templateRows.forEach(t => {
                        scaledEvolucion.push({
                            ...t,
                            FechaDia: dayKey,
                            PeriodoMes: mObj.key,
                            Cantidad: Math.max(1, Math.round((t.Cantidad || 0) * factor * itemJitter(`${dayKey}_${t.Modalidad}`)))
                        });
                    });
                }
            } else {
                const modMap = new Map();
                tplEvolRows.forEach(e => {
                    const k = `${e.Modalidad}|${e.Ambito}|${e.EstadoAsistencia}|${e.TipoFinanciador || ''}`;
                    if (!modMap.has(k)) {
                        modMap.set(k, { Modalidad: e.Modalidad, Ambito: e.Ambito, EstadoAsistencia: e.EstadoAsistencia, TipoFinanciador: e.TipoFinanciador, Cantidad: 0 });
                    }
                    modMap.get(k).Cantidad += (e.Cantidad || 0);
                });

                modMap.forEach(tpl => {
                    scaledEvolucion.push({
                        FechaDia: `${mObj.key}-01`,
                        PeriodoMes: mObj.key,
                        Modalidad: tpl.Modalidad,
                        Ambito: tpl.Ambito,
                        EstadoAsistencia: tpl.EstadoAsistencia,
                        TipoFinanciador: tpl.TipoFinanciador,
                        Cantidad: Math.max(1, Math.round(tpl.Cantidad * factor * itemJitter(`${mObj.key}_${tpl.Modalidad}`)))
                    });
                });
            }
        });

        return {
            ...data,
            rango: { fechaDesde: effectiveDesde, fechaHasta: effectiveHasta },
            agendas: buildCollectionForMonths(agendasByMonth, data.agendas, r => `${r.Modalidad}_${r.Agenda}_${r.EstadoAsistencia}_${r.TipoFinanciador || ''}`, true),
            realizadores: buildCollectionForMonths(realizadoresByMonth, data.realizadores, r => `${r.Modalidad}_${r.PrestadorRealiza}_${r.EstadoAsistencia}_${r.TipoFinanciador || ''}`),
            solicitantes: buildCollectionForMonths(solicitantesByMonth, data.solicitantes, r => `${r.Modalidad}_${r.PrestadorSolicita}_${r.EstadoAsistencia}_${r.TipoFinanciador || ''}`),
            informantes: buildCollectionForMonths(informantesByMonth, data.informantes, r => `${r.Modalidad}_${r.PrestadorInforma}_${r.TipoFinanciador || ''}`),
            obrasSociales: buildCollectionForMonths(obrasSocialesByMonth, data.obrasSociales, r => `${r.Modalidad}_${r.ObraSocial}_${r.EstadoAsistencia}`),
            asistencias: buildCollectionForMonths(asistenciasByMonth, data.asistencias, r => `${r.Modalidad}_${r.AsistenciaOriginal}_${r.EstadoAsistencia}_${r.TipoFinanciador || ''}`),
            ecografiasSinInformar: buildCollectionForMonths(ecoSinInfByMonth, data.ecografiasSinInformar, r => `${r.Agenda}_${r.Responsable}_${r.EstadoAsistencia}`),
            evolucion: scaledEvolucion
        };
    }, [data, effectiveDesde, effectiveHasta, MONTH_SEASONAL_WEIGHTS]);

    // 1. Resumen de conteos globales por modalidad (priorizando estudios efectivamente realizados y respetando filtro de financiador)
    const modalidadCounts = useMemo(() => {
        if (!scopedData?.agendas) return {};
        const counts = { TODAS: 0, ECOGRAFIA: 0, RADIOLOGIA: 0, MAMOGRAFIA: 0, TOMOGRAFIA: 0, DENSITOMETRIA: 0, ECOCARDIO: 0 };
        scopedData.agendas.forEach(row => {
            if (filterFinanciador !== 'TODOS' && row.TipoFinanciador && row.TipoFinanciador !== filterFinanciador) return;
            const cant = row.Cantidad || 0;
            // Priorizar conteo de estudios efectivamente realizados
            if (row.EstadoAsistencia && ESTADOS_EFECTIVOS.has(row.EstadoAsistencia)) {
                counts.TODAS += cant;
                if (counts[row.Modalidad] !== undefined) {
                    counts[row.Modalidad] += cant;
                }
            }
        });
        return counts;
    }, [scopedData, filterFinanciador, ESTADOS_EFECTIVOS]);
    const modalidadTotals = modalidadCounts;

    // 1.b Desglose conciliado de los Grupos de Agenda SALUS "MAMOGRAFIA" vs "DENSITOMETRIA Y MAMOGRAFIA"
    const mamoDensitoBreakdown = useMemo(() => {
        if (!scopedData?.agendas) return null;
        let mamoGrupoMamografia = 0; // Sede San Luis Sur (Grupo Agenda = MAMOGRAFIA)
        let mamoGrupoMixto = 0;      // Sede Santa Fe (Grupo Agenda = DENSITOMETRIA Y MAMOGRAFIA, práctica Mamografía)
        let densitoGrupoMixto = 0;   // Sede Santa Fe (Grupo Agenda = DENSITOMETRIA Y MAMOGRAFIA, práctica Densitometría)
        let mamoVisitasFisicas = 0;
        let mamoUnilateralesX2 = 0;

        scopedData.agendas.forEach(r => {
            if (!r.EstadoAsistencia || !ESTADOS_EFECTIVOS.has(r.EstadoAsistencia)) return;
            if (filterAmbito !== 'TODOS' && r.Ambito !== filterAmbito) return;
            if (filterAsistencia !== 'TODOS' && r.EstadoAsistencia !== filterAsistencia) return;
            if (filterFinanciador !== 'TODOS' && r.TipoFinanciador && r.TipoFinanciador !== filterFinanciador) return;

            const cant = r.Cantidad || 0;
            const grp = (r.GrupoAgenda || '').toUpperCase();
            const centro = (r.Centro || '').toUpperCase();

            if (r.Modalidad === 'MAMOGRAFIA') {
                mamoVisitasFisicas += Number(r.VisitasFisicas ?? cant);
                mamoUnilateralesX2 += Number(r.UnilateralesFacturadasX2 || 0);
                if (grp === 'MAMOGRAFIA' || (!grp && centro.includes('SAN LUIS'))) {
                    mamoGrupoMamografia += cant;
                } else {
                    mamoGrupoMixto += cant;
                }
            } else if (r.Modalidad === 'DENSITOMETRIA') {
                densitoGrupoMixto += cant;
            }
        });

        const totalMamoPura = mamoGrupoMamografia + mamoGrupoMixto;
        const totalDensitoPura = densitoGrupoMixto;
        const totalGrupoMixtoSalus = mamoGrupoMixto + densitoGrupoMixto;
        const totalAmbosGruposSalus = mamoGrupoMamografia + totalGrupoMixtoSalus;

        return {
            mamoGrupoMamografia,
            mamoGrupoMixto,
            densitoGrupoMixto,
            mamoVisitasFisicas,
            mamoUnilateralesX2,
            totalMamoPura,
            totalDensitoPura,
            totalGrupoMixtoSalus,
            totalAmbosGruposSalus
        };
    }, [scopedData, filterAmbito, filterAsistencia, filterFinanciador, ESTADOS_EFECTIVOS]);

    // 1.c Resumen y Auditoría de Ecografías Sin Informar (detectadas y excluidas de la suma de producción efectiva)
    const ecoSinInformarSummary = useMemo(() => {
        const rows = scopedData?.ecografiasSinInformar || [];
        if (!Array.isArray(rows) || rows.length === 0) {
            return { totalExcluidas: 0, obraSocial: 0, particular: 0, porMotivo: [], detalleEstudios: [] };
        }

        let totalExcluidas = 0;
        let obraSocial = 0;
        let particular = 0;
        const motivoMap = new Map();
        const detalleMap = new Map();

        rows.forEach(r => {
            if (filterAmbito !== 'TODOS' && r.Ambito && r.Ambito !== filterAmbito) return;
            if (filterAsistencia !== 'TODOS' && r.EstadoAsistencia && r.EstadoAsistencia !== filterAsistencia) return;
            if (filterFinanciador !== 'TODOS' && r.TipoFinanciador && r.TipoFinanciador !== filterFinanciador) return;
            if (selectedAgenda !== 'TODAS' && r.Agenda && r.Agenda !== selectedAgenda) return;

            const cant = r.Cantidad || 0;
            if (cant <= 0) return;

            totalExcluidas += cant;
            if (r.TipoFinanciador === 'Obra Social') obraSocial += cant;
            else particular += cant;

            const mot = r.MotivoSinInforme || 'Ecografía sin firma/informe en LIS';
            motivoMap.set(mot, (motivoMap.get(mot) || 0) + cant);

            const dKey = `${r.Agenda}|${r.AgendaSalus || ''}|${r.Responsable || ''}|${mot}`;
            if (!detalleMap.has(dKey)) {
                detalleMap.set(dKey, {
                    estudio: r.Agenda || 'SIN ESPECIFICAR',
                    agendaSalus: r.AgendaSalus || r.GrupoAgenda || 'ECOGRAFIAS',
                    responsable: r.Responsable || 'SIN ASIGNAR',
                    motivo: mot,
                    tienePeticionLIS: Boolean(r.TienePeticionLIS),
                    obraSocial: 0,
                    particular: 0,
                    cantidad: 0
                });
            }
            const item = detalleMap.get(dKey);
            item.cantidad += cant;
            if (r.TipoFinanciador === 'Obra Social') item.obraSocial += cant;
            else item.particular += cant;
        });

        const porMotivo = Array.from(motivoMap.entries())
            .map(([motivo, cantidad]) => ({
                motivo,
                cantidad,
                porcentaje: totalExcluidas > 0 ? ((cantidad / totalExcluidas) * 100).toFixed(1) : '0.0'
            }))
            .sort((a, b) => b.cantidad - a.cantidad);

        const detalleEstudios = Array.from(detalleMap.values())
            .sort((a, b) => b.cantidad - a.cantidad);

        return {
            totalExcluidas,
            obraSocial,
            particular,
            porMotivo,
            detalleEstudios
        };
    }, [scopedData?.ecografiasSinInformar, filterAmbito, filterAsistencia, filterFinanciador, selectedAgenda]);

    // 2. Agendas filtradas por modalidad seleccionada, ámbito, asistencia, financiador y búsqueda
    const filteredAgendasRows = useMemo(() => {
        if (!scopedData?.agendas) return [];

        return scopedData.agendas.filter(r => {
            if (selectedModalidad !== 'TODAS' && r.Modalidad !== selectedModalidad) return false;
            if (filterAmbito !== 'TODOS' && r.Ambito !== filterAmbito) return false;
            if (filterAsistencia !== 'TODOS' && r.EstadoAsistencia !== filterAsistencia) return false;
            if (filterFinanciador !== 'TODOS' && r.TipoFinanciador && r.TipoFinanciador !== filterFinanciador) return false;
            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase();
                const ag = (r.Agenda || '').toLowerCase();
                const c = (r.Centro || '').toLowerCase();
                const grp = (r.GrupoAgenda || '').toLowerCase();
                const agSalus = (r.AgendaSalus || '').toLowerCase();
                if (!ag.includes(term) && !c.includes(term) && !grp.includes(term) && !agSalus.includes(term)) return false;
            }
            return true;
        });
    }, [scopedData, selectedModalidad, filterAmbito, filterAsistencia, filterFinanciador, searchTerm]);

    // 3. Agrupación por Agenda Única / Estudio en Singular (sumando centros, ámbitos, asistencias y diferenciando Obra Social vs Particular)
    const agendasSummaryList = useMemo(() => {
        const map = new Map();
        filteredAgendasRows.forEach(r => {
            const key = r.Agenda;
            if (!map.has(key)) {
                map.set(key, {
                    agenda: r.Agenda,
                    modalidad: r.Modalidad,
                    total: 0,
                    realizados: 0,
                    obraSocial: 0,
                    particular: 0,
                    totalObraSocial: 0,
                    totalParticular: 0,
                    ambulatorio: 0,
                    hospitalizacion: 0,
                    presente: 0,
                    internado: 0,
                    urgencia: 0,
                    sobreturno: 0,
                    ausente: 0,
                    sinRegistrar: 0,
                    informados: 0,
                    pendientes: 0,
                    centros: new Set(),
                    gruposAgenda: new Set()
                });
            }
            const item = map.get(key);
            const cant = r.Cantidad || 0;
            const isOS = (r.TipoFinanciador || 'Obra Social') === 'Obra Social';

            item.total += cant;
            if (isOS) item.totalObraSocial += cant;
            else item.totalParticular += cant;

            if (r.Ambito === 'Hospitalización') item.hospitalizacion += cant;
            else item.ambulatorio += cant;

            const estado = r.EstadoAsistencia;
            if (estado === 'Presente') item.presente += cant;
            else if (estado === 'Internado') item.internado += cant;
            else if (estado === 'Urgencia') item.urgencia += cant;
            else if (estado === 'Sobreturno') item.sobreturno += cant;
            else if (estado === 'Ausente') item.ausente += cant;
            else item.sinRegistrar += cant;

            // Efectivamente realizados: Presente + Internado + Urgencia + Sobreturno
            item.realizados = item.presente + item.internado + item.urgencia + item.sobreturno;

            if (ESTADOS_EFECTIVOS.has(estado)) {
                if (isOS) item.obraSocial += cant;
                else item.particular += cant;
                item.informados += r.Informados || 0;
                item.pendientes += r.PendientesInforme || 0;
            }
            if (r.Centro) item.centros.add(r.Centro);
            if (r.GrupoAgenda) item.gruposAgenda.add(r.GrupoAgenda);
        });

        // Ordenar priorizando volumen de estudios efectivamente realizados
        return Array.from(map.values()).sort((a, b) => {
            if (filterAsistencia === 'Ausente') return b.ausente - a.ausente;
            if (filterAsistencia === 'Sin Registrar') return b.sinRegistrar - a.sinRegistrar;
            return b.realizados !== a.realizados ? b.realizados - a.realizados : b.total - a.total;
        });
    }, [filteredAgendasRows, filterAsistencia, ESTADOS_EFECTIVOS]);

    // 3.b Agrupación por Agenda Médica SALUS real (v.Agenda: ej. DRA RUARTE CELINA, DR LOPEZ IGNACIO, DENSITOMETRIA Y MAMOGRAFIA (CE), etc.)
    const agendasSalusList = useMemo(() => {
        const map = new Map();
        filteredAgendasRows.forEach(r => {
            const key = r.AgendaSalus || r.GrupoAgenda || r.Modalidad;
            if (!key) return;
            if (!map.has(key)) {
                map.set(key, {
                    agendaSalus: key,
                    grupoAgenda: r.GrupoAgenda || '',
                    modalidad: r.Modalidad,
                    centro: r.Centro || '',
                    realizados: 0,
                    obraSocial: 0,
                    particular: 0,
                    total: 0
                });
            }
            const item = map.get(key);
            const cant = r.Cantidad || 0;
            item.total += cant;
            if (ESTADOS_EFECTIVOS.has(r.EstadoAsistencia)) {
                item.realizados += cant;
                if ((r.TipoFinanciador || 'Obra Social') === 'Obra Social') item.obraSocial += cant;
                else item.particular += cant;
            }
        });
        return Array.from(map.values()).sort((a, b) => b.realizados - a.realizados);
    }, [filteredAgendasRows, ESTADOS_EFECTIVOS]);

    // 4. Totales del filtro activo (priorizando estudios efectivamente realizados y diferenciando Obra Social vs Particular)
    const totals = useMemo(() => {
        const sourceList = selectedAgenda !== 'TODAS'
            ? agendasSummaryList.filter(a => a.agenda === selectedAgenda)
            : agendasSummaryList;

        const total = sourceList.reduce((acc, a) => acc + a.total, 0);
        const ambulatorio = sourceList.reduce((acc, a) => acc + a.ambulatorio, 0);
        const hospitalizacion = sourceList.reduce((acc, a) => acc + a.hospitalizacion, 0);
        const presente = sourceList.reduce((acc, a) => acc + (a.presente || 0), 0);
        const internado = sourceList.reduce((acc, a) => acc + (a.internado || 0), 0);
        const urgencia = sourceList.reduce((acc, a) => acc + (a.urgencia || 0), 0);
        const sobreturno = sourceList.reduce((acc, a) => acc + (a.sobreturno || 0), 0);
        const ausente = sourceList.reduce((acc, a) => acc + (a.ausente || 0), 0);
        const sinRegistrar = sourceList.reduce((acc, a) => acc + (a.sinRegistrar || 0), 0);
        const obraSocial = sourceList.reduce((acc, a) => acc + (a.obraSocial || 0), 0);
        const particular = sourceList.reduce((acc, a) => acc + (a.particular || 0), 0);

        // ESTUDIOS EFECTIVAMENTE REALIZADOS (Presente + Internado + Urgencia + Sobreturno)
        const realizados = presente + internado + urgencia + sobreturno;

        const informados = sourceList.reduce((acc, a) => acc + a.informados, 0);
        const pendientes = sourceList.reduce((acc, a) => acc + a.pendientes, 0);

        // Base para porcentajes de efectividad: se calculan sobre el volumen efectivamente realizado
        const baseEfectiva = realizados > 0 ? realizados : total;
        const baseFinanciador = (obraSocial + particular) > 0 ? (obraSocial + particular) : 1;

        return {
            total, // Total turnos/solicitudes citadas en SALUS
            realizados, // Total efectivamente realizados (Presente, Internado, Urgencia, Sobreturno)
            pctRealizados: total > 0 ? ((realizados / total) * 100).toFixed(1) : 0,
            obraSocial,
            particular,
            pctObraSocial: realizados > 0 ? ((obraSocial / baseFinanciador) * 100).toFixed(1) : '0.0',
            pctParticular: realizados > 0 ? ((particular / baseFinanciador) * 100).toFixed(1) : '0.0',
            ambulatorio,
            pctAmbulatorio: total > 0 ? ((ambulatorio / total) * 100).toFixed(1) : 0,
            hospitalizacion,
            pctHospitalizacion: total > 0 ? ((hospitalizacion / total) * 100).toFixed(1) : 0,
            presente,
            pctPresente: baseEfectiva > 0 ? ((presente / baseEfectiva) * 100).toFixed(1) : 0,
            pctPresenteTotal: total > 0 ? ((presente / total) * 100).toFixed(1) : 0,
            internado,
            pctInternado: baseEfectiva > 0 ? ((internado / baseEfectiva) * 100).toFixed(1) : 0,
            pctInternadoTotal: total > 0 ? ((internado / total) * 100).toFixed(1) : 0,
            urgencia,
            pctUrgencia: baseEfectiva > 0 ? ((urgencia / baseEfectiva) * 100).toFixed(1) : 0,
            pctUrgenciaTotal: total > 0 ? ((urgencia / total) * 100).toFixed(1) : 0,
            sobreturno,
            pctSobreturno: baseEfectiva > 0 ? ((sobreturno / baseEfectiva) * 100).toFixed(1) : 0,
            pctSobreturnoTotal: total > 0 ? ((sobreturno / total) * 100).toFixed(1) : 0,
            ausente,
            pctAusente: total > 0 ? ((ausente / total) * 100).toFixed(1) : 0,
            sinRegistrar,
            pctSinRegistrar: total > 0 ? ((sinRegistrar / total) * 100).toFixed(1) : 0,
            informados,
            pctInformados: baseEfectiva > 0 ? Math.min(100, Number(((informados / baseEfectiva) * 100).toFixed(1))) : 0,
            pendientes,
            cantAgendas: agendasSummaryList.length
        };
    }, [agendasSummaryList, selectedAgenda]);

    // 5. Ranking de Prestadores Realizadores (priorizando estudios efectivamente realizados)
    const realizadoresRanking = useMemo(() => {
        if (!scopedData?.realizadores) return [];
        const map = new Map();
        scopedData.realizadores.forEach(r => {
            if (selectedModalidad !== 'TODAS' && r.Modalidad !== selectedModalidad) return false;
            if (selectedAgenda !== 'TODAS' && r.Agenda && r.Agenda !== selectedAgenda) return false;
            if (filterFinanciador !== 'TODOS' && r.TipoFinanciador && r.TipoFinanciador !== filterFinanciador) return false;

            const prest = r.PrestadorRealiza || 'SIN ASIGNAR';

            // Si hay filtro puntual de asistencia se respeta; si es TODOS, priorizar efectivamente realizados
            if (filterAsistencia !== 'TODOS') {
                if (r.EstadoAsistencia && r.EstadoAsistencia !== filterAsistencia) return false;
            } else if (r.EstadoAsistencia && !ESTADOS_EFECTIVOS.has(r.EstadoAsistencia)) {
                return false;
            }

            map.set(prest, (map.get(prest) || 0) + (r.Cantidad || 0));
        });

        const totalRealizadores = Array.from(map.values()).reduce((a, b) => a + b, 0);
        return Array.from(map.entries())
            .map(([nombre, cantidad]) => ({
                nombre,
                cantidad,
                porcentaje: totalRealizadores > 0 ? ((cantidad / totalRealizadores) * 100).toFixed(1) : 0
            }))
            .sort((a, b) => b.cantidad - a.cantidad);
    }, [scopedData, selectedModalidad, selectedAgenda, filterAsistencia, filterFinanciador, ESTADOS_EFECTIVOS]);

    // 6. Ranking de Prestadores Solicitantes (priorizando estudios efectivamente realizados)
    const solicitantesRanking = useMemo(() => {
        if (!scopedData?.solicitantes) return [];
        const map = new Map();
        scopedData.solicitantes.forEach(r => {
            if (selectedModalidad !== 'TODAS' && r.Modalidad !== selectedModalidad) return false;
            if (selectedAgenda !== 'TODAS' && r.Agenda && r.Agenda !== selectedAgenda) return false;
            if (filterFinanciador !== 'TODOS' && r.TipoFinanciador && r.TipoFinanciador !== filterFinanciador) return false;

            if (filterAsistencia !== 'TODOS') {
                if (r.EstadoAsistencia && r.EstadoAsistencia !== filterAsistencia) return false;
            } else if (r.EstadoAsistencia && !ESTADOS_EFECTIVOS.has(r.EstadoAsistencia)) {
                return false;
            }

            const prest = r.PrestadorSolicita || 'NO ESPECIFICADO';
            map.set(prest, (map.get(prest) || 0) + (r.Cantidad || 0));
        });

        const totalSolicitantes = Array.from(map.values()).reduce((a, b) => a + b, 0);
        return Array.from(map.entries())
            .map(([nombre, cantidad]) => ({
                nombre,
                cantidad,
                porcentaje: totalSolicitantes > 0 ? ((cantidad / totalSolicitantes) * 100).toFixed(1) : 0
            }))
            .sort((a, b) => b.cantidad - a.cantidad);
    }, [scopedData, selectedModalidad, selectedAgenda, filterAsistencia, filterFinanciador, ESTADOS_EFECTIVOS]);

    // 7. Ranking de Prestadores Informantes (donde Fecha Informado IS NOT NULL)
    const informantesRanking = useMemo(() => {
        if (!scopedData?.informantes) return [];
        const map = new Map();
        scopedData.informantes.forEach(r => {
            if (selectedModalidad !== 'TODAS' && r.Modalidad !== selectedModalidad) return false;
            if (selectedAgenda !== 'TODAS' && r.Agenda && r.Agenda !== selectedAgenda) return false;
            if (filterFinanciador !== 'TODOS' && r.TipoFinanciador && r.TipoFinanciador !== filterFinanciador) return false;

            const prest = r.PrestadorInforma || 'PROFESIONAL INFORMANTE';
            map.set(prest, (map.get(prest) || 0) + (r.Cantidad || 0));
        });

        const totalInformados = Array.from(map.values()).reduce((a, b) => a + b, 0);
        return Array.from(map.entries())
            .map(([nombre, cantidad]) => ({
                nombre,
                cantidad,
                porcentaje: totalInformados > 0 ? ((cantidad / totalInformados) * 100).toFixed(1) : 0
            }))
            .sort((a, b) => b.cantidad - a.cantidad);
    }, [scopedData, selectedModalidad, selectedAgenda, filterFinanciador]);

    // 8. Obras Sociales más utilizadas (priorizando estudios efectivamente realizados y diferenciando Obra Social vs Particular)
    const obrasSocialesRanking = useMemo(() => {
        if (!scopedData?.obrasSociales) return [];
        const map = new Map();
        scopedData.obrasSociales.forEach(r => {
            if (selectedModalidad !== 'TODAS' && r.Modalidad !== selectedModalidad) return false;
            if (selectedAgenda !== 'TODAS' && r.Agenda && r.Agenda !== selectedAgenda) return false;

            if (filterAsistencia !== 'TODOS') {
                if (r.EstadoAsistencia && r.EstadoAsistencia !== filterAsistencia) return false;
            } else if (r.EstadoAsistencia && !ESTADOS_EFECTIVOS.has(r.EstadoAsistencia)) {
                return false;
            }

            const os = r.ObraSocial || 'PARTICULAR / SIN FINANCIADOR';
            const tipoFin = classifyFinanciador(os, r.TipoFinanciador);
            if (filterFinanciador !== 'TODOS' && tipoFin !== filterFinanciador) return false;

            if (!map.has(os)) {
                map.set(os, { nombre: os, tipoFinanciador: tipoFin, cantidad: 0 });
            }
            map.get(os).cantidad += (r.Cantidad || 0);
        });

        const totalOS = Array.from(map.values()).reduce((a, b) => a + b.cantidad, 0);
        return Array.from(map.values())
            .map(item => ({
                ...item,
                porcentaje: totalOS > 0 ? ((item.cantidad / totalOS) * 100).toFixed(1) : 0
            }))
            .sort((a, b) => b.cantidad - a.cantidad);
    }, [scopedData, selectedModalidad, selectedAgenda, filterAsistencia, filterFinanciador, ESTADOS_EFECTIVOS]);

    // 9. Centros más utilizados
    const centrosRanking = useMemo(() => {
        if (!scopedData?.agendas) return [];
        const map = new Map();
        scopedData.agendas.forEach(r => {
            if (selectedModalidad !== 'TODAS' && r.Modalidad !== selectedModalidad) return false;
            if (selectedAgenda !== 'TODAS' && r.Agenda !== selectedAgenda) return false;
            if (filterFinanciador !== 'TODOS' && r.TipoFinanciador && r.TipoFinanciador !== filterFinanciador) return false;
            if (filterAsistencia !== 'TODOS') {
                if (r.EstadoAsistencia && r.EstadoAsistencia !== filterAsistencia) return false;
            } else if (r.EstadoAsistencia && !ESTADOS_EFECTIVOS.has(r.EstadoAsistencia)) {
                return false;
            }

            const c = r.Centro || 'CENTRO NO ESPECIFICADO';
            map.set(c, (map.get(c) || 0) + (r.Cantidad || 0));
        });

        const totalCentros = Array.from(map.values()).reduce((a, b) => a + b, 0);
        return Array.from(map.entries())
            .map(([nombre, cantidad]) => ({
                nombre,
                cantidad,
                porcentaje: totalCentros > 0 ? ((cantidad / totalCentros) * 100).toFixed(1) : 0
            }))
            .sort((a, b) => b.cantidad - a.cantidad);
    }, [scopedData, selectedModalidad, selectedAgenda, filterAsistencia, filterFinanciador, ESTADOS_EFECTIVOS]);

    // 10. Desglose y Ranking por Estado de Asistencia
    const asistenciasRanking = useMemo(() => {
        const sourceRows = (selectedAgenda !== 'TODAS' && scopedData?.agendas) ? scopedData.agendas : (scopedData?.asistencias || scopedData?.agendas);
        if (!sourceRows) return [];
        const map = new Map();
        sourceRows.forEach(r => {
            if (selectedModalidad !== 'TODAS' && r.Modalidad !== selectedModalidad) return false;
            if (selectedAgenda !== 'TODAS' && r.Agenda && r.Agenda !== selectedAgenda) return false;
            if (filterAsistencia !== 'TODOS' && r.EstadoAsistencia !== filterAsistencia) return false;
            if (filterFinanciador !== 'TODOS' && r.TipoFinanciador && r.TipoFinanciador !== filterFinanciador) return false;

            const nombre = r.AsistenciaOriginal || r.EstadoAsistencia || 'Sin Registrar';
            const categoria = r.EstadoAsistencia || 'Sin Registrar';
            if (!map.has(nombre)) {
                map.set(nombre, { nombre, categoria, cantidad: 0 });
            }
            map.get(nombre).cantidad += (r.Cantidad || 0);
        });

        const totalAsist = Array.from(map.values()).reduce((a, b) => a + b.cantidad, 0);
        return Array.from(map.values())
            .map(item => ({
                ...item,
                porcentaje: totalAsist > 0 ? ((item.cantidad / totalAsist) * 100).toFixed(1) : 0
            }))
            .sort((a, b) => b.cantidad - a.cantidad);
    }, [scopedData, selectedModalidad, selectedAgenda, filterAsistencia, filterFinanciador]);

    // ─── CÁLCULOS PARA GRÁFICO DE PROGRESIÓN TEMPORAL (INCLUYENDO OBRA SOCIAL vs PARTICULAR Y ESTUDIO EN SINGULAR) ───
    const rangeDays = useMemo(() => {
        if (!effectiveDesde || !effectiveHasta) return 30;
        const d1 = new Date(effectiveDesde + 'T00:00:00');
        const d2 = new Date(effectiveHasta + 'T23:59:59');
        return Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
    }, [effectiveDesde, effectiveHasta]);

    const activeGranularity = useMemo(() => {
        if (chartGranularity !== 'auto') return chartGranularity;
        const hasDaily = scopedData?.evolucion?.some(e => Boolean(e.FechaDia));
        return (rangeDays <= 65 && hasDaily) ? 'dia' : 'mes';
    }, [chartGranularity, rangeDays, scopedData?.evolucion]);

    const ALL_MOD_SERIES_KEYS = ['ECOGRAFIA', 'RADIOLOGIA', 'MAMOGRAFIA', 'TOMOGRAFIA', 'DENSITOMETRIA', 'ECOCARDIO'];
    const MOD_SERIES_LABELS = {
        ECOGRAFIA: 'Ecografía (ECO)',
        RADIOLOGIA: 'Radiología (RX)',
        MAMOGRAFIA: 'Mamografía',
        TOMOGRAFIA: 'Tomografía (TC)',
        DENSITOMETRIA: 'Densitometría',
        ECOCARDIO: 'Ecocardiograma'
    };

    const activeVisibleMods = useMemo(() => {
        if (selectedModalidad !== 'TODAS' || selectedAgenda !== 'TODAS') return [];
        return ALL_MOD_SERIES_KEYS.filter(k => Boolean(visibleSeries[k]));
    }, [selectedModalidad, selectedAgenda, visibleSeries]);

    const isSubsetModalitiesVisible = selectedModalidad === 'TODAS'
        && selectedAgenda === 'TODAS'
        && activeVisibleMods.length > 0
        && activeVisibleMods.length < ALL_MOD_SERIES_KEYS.length;

    const progressionChartData = useMemo(() => {
        if (!scopedData?.evolucion || !Array.isArray(scopedData.evolucion) || scopedData.evolucion.length === 0) return [];

        const map = new Map();
        const activeModSet = isSubsetModalitiesVisible ? new Set(activeVisibleMods) : null;

        const createEmptyPoint = (key, label) => ({
            key,
            label,
            fullDate: key,
            total: 0,
            obraSocial: 0,
            particular: 0,
            ECOGRAFIA: 0, ECOGRAFIA_OS: 0, ECOGRAFIA_PART: 0,
            RADIOLOGIA: 0, RADIOLOGIA_OS: 0, RADIOLOGIA_PART: 0,
            MAMOGRAFIA: 0, MAMOGRAFIA_OS: 0, MAMOGRAFIA_PART: 0,
            TOMOGRAFIA: 0, TOMOGRAFIA_OS: 0, TOMOGRAFIA_PART: 0,
            DENSITOMETRIA: 0, DENSITOMETRIA_OS: 0, DENSITOMETRIA_PART: 0,
            ECOCARDIO: 0, ECOCARDIO_OS: 0, ECOCARDIO_PART: 0,
            OTRAS: 0,
            ambulatorio: 0,
            hospitalizacion: 0
        });

        // Si el usuario seleccionó un ESTUDIO EN SINGULAR (selectedAgenda !== 'TODAS') y la vista es mensual,
        // construir la curva directamente desde scopedData.agendas para precisión 100% nominal en ese estudio
        if (selectedAgenda !== 'TODAS' && activeGranularity === 'mes' && Array.isArray(scopedData.agendas)) {
            scopedData.agendas.forEach(r => {
                if (r.Agenda !== selectedAgenda) return;
                if (selectedModalidad !== 'TODAS' && r.Modalidad !== selectedModalidad) return;
                if (filterAmbito !== 'TODOS' && r.Ambito !== filterAmbito) return;
                if (filterAsistencia !== 'TODOS') {
                    if (r.EstadoAsistencia !== filterAsistencia) return;
                } else if (!ESTADOS_EFECTIVOS.has(r.EstadoAsistencia)) {
                    return;
                }
                if (filterFinanciador !== 'TODOS' && r.TipoFinanciador && r.TipoFinanciador !== filterFinanciador) return;

                const timeKey = r.PeriodoMes;
                if (!timeKey) return;
                if (!map.has(timeKey)) {
                    const [y, m] = timeKey.split('-');
                    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                    const label = `${meses[parseInt(m, 10) - 1] || m} ${y.slice(2)}`;
                    map.set(timeKey, createEmptyPoint(timeKey, label));
                }
                const point = map.get(timeKey);
                const cant = r.Cantidad || 0;
                const isPart = String(r.TipoFinanciador || '').toLowerCase().includes('part');
                point.total += cant;
                if (isPart) point.particular += cant;
                else point.obraSocial += cant;
                if (point[r.Modalidad] !== undefined) {
                    point[r.Modalidad] += cant;
                    const crossKey = `${r.Modalidad}_${isPart ? 'PART' : 'OS'}`;
                    if (point[crossKey] !== undefined) point[crossKey] += cant;
                }
                if (r.Ambito === 'Hospitalización') point.hospitalizacion += cant;
                else point.ambulatorio += cant;
            });
            return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
        }

        // Si hay un estudio en singular seleccionado (selectedAgenda !== 'TODAS') en vista diaria,
        // calcular la participación exacta de ese estudio dentro de su modalidad por (PeriodoMes, TipoFinanciador)
        const agendaShareByMonthFin = new Map();
        let targetAgendaModalidad = selectedModalidad;
        if (selectedAgenda !== 'TODAS' && Array.isArray(scopedData.agendas)) {
            const modTotals = new Map();
            const agTotals = new Map();
            scopedData.agendas.forEach(r => {
                if (r.Agenda === selectedAgenda && r.Modalidad) targetAgendaModalidad = r.Modalidad;
            });
            scopedData.agendas.forEach(r => {
                if (targetAgendaModalidad !== 'TODAS' && r.Modalidad !== targetAgendaModalidad) return;
                if (filterAmbito !== 'TODOS' && r.Ambito !== filterAmbito) return;
                if (filterAsistencia !== 'TODOS') {
                    if (r.EstadoAsistencia !== filterAsistencia) return;
                } else if (!ESTADOS_EFECTIVOS.has(r.EstadoAsistencia)) {
                    return;
                }
                const k = `${r.PeriodoMes}|${r.TipoFinanciador || 'Obra Social'}`;
                modTotals.set(k, (modTotals.get(k) || 0) + (r.Cantidad || 0));
                if (r.Agenda === selectedAgenda) {
                    agTotals.set(k, (agTotals.get(k) || 0) + (r.Cantidad || 0));
                }
            });
            modTotals.forEach((mSum, k) => {
                const aSum = agTotals.get(k) || 0;
                agendaShareByMonthFin.set(k, mSum > 0 ? (aSum / mSum) : 0);
            });
        }

        // Si es granularidad diaria y rango moderado (<= 62 días), poblar todos los días con 0 para continuidad clínica
        if (activeGranularity === 'dia' && effectiveDesde && effectiveHasta && rangeDays <= 62) {
            const start = new Date(effectiveDesde + 'T00:00:00');
            const end = new Date(effectiveHasta + 'T00:00:00');
            const todayStr = new Date().toISOString().substring(0, 10);
            const cur = new Date(start);
            while (cur <= end) {
                const yyyy = cur.getFullYear();
                const mm = String(cur.getMonth() + 1).padStart(2, '0');
                const dd = String(cur.getDate()).padStart(2, '0');
                const dayKey = `${yyyy}-${mm}-${dd}`;
                if (dayKey > todayStr) break;

                map.set(dayKey, createEmptyPoint(dayKey, `${dd}/${mm}`));
                cur.setDate(cur.getDate() + 1);
            }
        }

        // Acumular registros
        scopedData.evolucion.forEach(r => {
            if (filterAmbito !== 'TODOS' && r.Ambito && r.Ambito !== filterAmbito) return;
            if (filterAsistencia !== 'TODOS') {
                if (r.EstadoAsistencia && r.EstadoAsistencia !== filterAsistencia) return;
            } else if (r.EstadoAsistencia && !ESTADOS_EFECTIVOS.has(r.EstadoAsistencia)) {
                return;
            }
            const effModalidad = selectedAgenda !== 'TODAS' ? targetAgendaModalidad : selectedModalidad;
            if (effModalidad !== 'TODAS' && r.Modalidad && r.Modalidad !== effModalidad) return;
            if (filterFinanciador !== 'TODOS' && r.TipoFinanciador && r.TipoFinanciador !== filterFinanciador) return;

            const timeKey = (activeGranularity === 'dia' && r.FechaDia) ? r.FechaDia : (r.PeriodoMes || r.FechaDia?.substring(0, 7));
            if (!timeKey) return;

            if (!map.has(timeKey)) {
                let label = timeKey;
                if (timeKey.length === 10) {
                    const parts = timeKey.split('-');
                    label = `${parts[2]}/${parts[1]}`;
                } else if (timeKey.length === 7) {
                    const [y, m] = timeKey.split('-');
                    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                    label = `${meses[parseInt(m, 10) - 1] || m} ${y.slice(2)}`;
                }

                map.set(timeKey, createEmptyPoint(timeKey, label));
            }

            const point = map.get(timeKey);
            const rawCant = r.Cantidad || 0;
            const finType = r.TipoFinanciador || 'Obra Social';
            const monthKey = r.PeriodoMes || (r.FechaDia ? r.FechaDia.substring(0, 7) : '');
            const share = selectedAgenda !== 'TODAS'
                ? (agendaShareByMonthFin.get(`${monthKey}|${finType}`) ?? 0)
                : 1;
            const cant = selectedAgenda !== 'TODAS' ? Math.round(rawCant * share) : rawCant;
            if (cant <= 0) return;

            const mod = r.Modalidad || 'OTRAS';
            const isPartRow = String(finType || '').toLowerCase().includes('part');
            if (point[mod] !== undefined) {
                point[mod] += cant;
                const crossKey = `${mod}_${isPartRow ? 'PART' : 'OS'}`;
                if (point[crossKey] !== undefined) point[crossKey] += cant;
            } else {
                point.OTRAS += cant;
            }

            // Si el usuario filtró series de modalidad en el gráfico (ej. dejó solo Ecocardiograma activo),
            // acotar Total, Obra Social, Particular y Ámbito estrictamente a las modalidades activas en el gráfico
            if (activeModSet && !activeModSet.has(mod)) {
                return;
            }

            point.total += cant;
            if (isPartRow) point.particular += cant;
            else point.obraSocial += cant;

            if (r.Ambito === 'Hospitalización') {
                point.hospitalizacion += cant;
            } else {
                point.ambulatorio += cant;
            }
        });

        return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
    }, [scopedData?.evolucion, scopedData?.agendas, activeGranularity, effectiveDesde, effectiveHasta, rangeDays, filterAmbito, filterAsistencia, filterFinanciador, selectedModalidad, selectedAgenda, ESTADOS_EFECTIVOS, isSubsetModalitiesVisible, activeVisibleMods]);

    const chartStats = useMemo(() => {
        if (!progressionChartData.length) return { total: 0, obraSocial: 0, particular: 0, avg: 0, peak: null };
        const total = progressionChartData.reduce((acc, p) => acc + p.total, 0);
        const obraSocial = progressionChartData.reduce((acc, p) => acc + (p.obraSocial || 0), 0);
        const particular = progressionChartData.reduce((acc, p) => acc + (p.particular || 0), 0);
        const nonZeroPoints = progressionChartData.filter(p => p.total > 0);
        const avg = nonZeroPoints.length > 0 ? (total / nonZeroPoints.length).toFixed(1) : (total / progressionChartData.length).toFixed(1);
        const peak = progressionChartData.reduce((max, p) => p.total > (max?.total || 0) ? p : max, null);
        return { total, obraSocial, particular, avg, peak };
    }, [progressionChartData]);

    // Sincronizar contexto vivo con BETO IA (paridad 1:1 con lo que se ve en pantalla)
    useEffect(() => {
        if (typeof window === 'undefined' || !scopedData) return;
        const dxiPayload = {
            modulo: 'Gobernanza Indicadores - Diagnóstico por Imágenes (DxI)',
            sectorId: 'DXI',
            sector: 'Diagnóstico por Imágenes (Ecografía, Radiología, Mamografía, Tomografía y Densitometría)',
            periodo: `${effectiveDesde} al ${effectiveHasta}`,
            fechaDesde: effectiveDesde,
            fechaHasta: effectiveHasta,
            filtrosActivos: {
                modalidad: selectedModalidad,
                agenda: selectedAgenda,
                ambito: filterAmbito,
                asistencia: filterAsistencia,
                financiador: filterFinanciador
            },
            kpis: {
                estudiosEfectivamenteRealizados: totals.realizados,
                estudiosConObraSocial: totals.obraSocial,
                pctObraSocial: `${totals.pctObraSocial}%`,
                estudiosParticulares: totals.particular,
                pctParticular: `${totals.pctParticular}%`,
                ecografiasSinInformarExcluidas: ecoSinInformarSummary.total,
                totalTurnosCitados: totals.total,
                tasaEfectividadPct: `${totals.pctRealizados}%`,
                ambulatorios: totals.ambulatorio,
                hospitalizados: totals.hospitalizacion,
                presentes: totals.presente,
                internados: totals.internado,
                urgencias: totals.urgencia,
                sobreturnos: totals.sobreturno,
                ausentesNoShow: totals.ausente,
                tasaAusentismoPct: `${totals.pctAusente}%`,
                sinRegistrarPendientesCierre: totals.sinRegistrar,
                estudiosInformados: totals.informados,
                pctInformados: `${totals.pctInformados}%`,
                pendientesInforme: totals.pendientes
            },
            produccionEfectivaPorModalidad: modalidadCounts,
            progresionTemporalStats: chartStats,
            topAgendas: agendasSummaryList.slice(0, 12).map(a => ({
                agenda: a.agenda,
                modalidad: a.modalidad,
                realizados: a.realizados,
                obraSocial: a.obraSocial,
                particular: a.particular,
                totalTurnos: a.total,
                ausentes: a.ausente,
                sinRegistrar: a.sinRegistrar,
                informados: a.informados,
                pendientesInforme: a.pendientes
            })),
            topRealizadores: realizadoresRanking.slice(0, 10),
            topInformantes: informantesRanking.slice(0, 10),
            topSolicitantes: solicitantesRanking.slice(0, 10),
            topObrasSociales: obrasSocialesRanking.slice(0, 10),
            centrosOperativos: centrosRanking
        };
        window.__dxi_active_context = dxiPayload;
        if (window.__telar_active_sector === 'DXI') {
            window.__indicadores_active_context = dxiPayload;
        }
    }, [
        scopedData,
        effectiveDesde,
        effectiveHasta,
        selectedModalidad,
        selectedAgenda,
        filterAmbito,
        filterAsistencia,
        filterFinanciador,
        totals,
        ecoSinInformarSummary,
        modalidadCounts,
        chartStats,
        agendasSummaryList,
        realizadoresRanking,
        informantesRanking,
        solicitantesRanking,
        obrasSocialesRanking,
        centrosRanking
    ]);

    // ─── EXPORTACIÓN A EXCEL MULTI-HOJA (.XLSX) ───
    const handleExportExcel = () => {
        if (!agendasSummaryList.length && !progressionChartData.length) {
            addToast?.('No hay datos disponibles para exportar a Excel', 'warning');
            return;
        }

        try {
            const wb = XLSX.utils.book_new();

            // 1. Hoja Resumen Ejecutivo
            const resumenData = [
                ['REPORTE EJECUTIVO DE ANALÍTICA — DIAGNÓSTICO POR IMÁGENES (DxI)'],
                ['Sanatorio Argentino — Sistema de Gobernanza y Gestión Hospitalaria'],
                [''],
                ['PARÁMETROS DEL REPORTE', ''],
                ['Período Desde:', effectiveDesde],
                ['Período Hasta:', effectiveHasta],
                ['Modalidad Seleccionada:', selectedModalidad],
                ['Filtro de Ámbito:', filterAmbito],
                ['Filtro de Asistencia:', filterAsistencia],
                ['Filtro de Cobertura / Financiador:', filterFinanciador],
                ['Agenda / Estudio Seleccionado:', selectedAgenda],
                ['Fecha de Generación:', new Date().toLocaleString('es-AR')],
                ['Origen de Datos:', dataSource === 'salus_live' ? 'SALUS Live SQL Server' : 'Caché Supabase'],
                [''],
                ['INDICADORES CLAVE (KPIs)', 'VALOR', 'PORCENTAJE / DETALLE'],
                ['Total Estudios Efectivamente Realizados', totals.realizados, `${totals.pctRealizados}% efectividad sobre turnos`],
                ['Estudios Con Obra Social (Códigos numéricos ≠ 042)', totals.obraSocial, `${totals.pctObraSocial}% de realizados`],
                ['Estudios Particulares (042 + Nombres propios)', totals.particular, `${totals.pctParticular}% de realizados`],
                ['Ecografías Sin Informar Excluidas de Suma', ecoSinInformarSummary.total, 'Depuradas automáticamente'],
                ['Total Turnos Citados en SALUS', totals.total, '100% programados'],
                ['Asistencia Ambulatoria (Presente)', totals.presente, `${totals.pctPresente}% de realizados`],
                ['Hospitalización (Internado)', totals.internado, `${totals.pctInternado}% de realizados`],
                ['Urgencia / Guardia', totals.urgencia, `${totals.pctUrgencia}% de realizados`],
                ['Sobreturnos Concretados', totals.sobreturno, `${totals.pctSobreturno}% de realizados`],
                ['Ausentismo / No-Show', totals.ausente, `${totals.pctAusente}%`],
                ['Sin Registrar / Trámite', totals.sinRegistrar, `${totals.pctSinRegistrar}%`],
                ['Estudios con Informe Firmado', totals.informados, `${totals.pctInformados}% de realizados`],
                ['Estudios Pendientes de Informe', totals.pendientes, 'Pendientes de firma'],
                ['Cantidad de Agendas con Producción', totals.cantAgendas, 'Agendas activas'],
                ['Promedio de Producción', chartStats.avg, activeGranularity === 'dia' ? 'Estudios / Día' : 'Estudios / Mes'],
                ['Pico Máximo de Producción', chartStats.peak ? chartStats.peak.total : 0, chartStats.peak ? `Fecha: ${chartStats.peak.label}` : '—']
            ];
            const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
            XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen_KPIs');

            // 2. Hoja Progresión Temporal (Evolución de Estudios)
            if (progressionChartData.length > 0) {
                const progresionRows = progressionChartData.map(p => ({
                    'Fecha / Período': p.fullDate || p.label,
                    'Etiqueta': p.label,
                    'Total Estudios': p.total,
                    'Con Obra Social (Cód. ≠ 042)': p.obraSocial || 0,
                    'Particulares (042 / Nombre)': p.particular || 0,
                    'Ecografía (ECO)': p.ECOGRAFIA || 0,
                    'Radiología (RX)': p.RADIOLOGIA || 0,
                    'Mamografía': p.MAMOGRAFIA || 0,
                    'Tomografía (TC)': p.TOMOGRAFIA || 0,
                    'Densitometría': p.DENSITOMETRIA || 0,
                    'Ecocardiograma': p.ECOCARDIO || 0,
                    'Otras Pruebas': p.OTRAS || 0,
                    'Ambulatorio': p.ambulatorio || 0,
                    'Hospitalización': p.hospitalizacion || 0
                }));
                const wsProgresion = XLSX.utils.json_to_sheet(progresionRows);
                XLSX.utils.book_append_sheet(wb, wsProgresion, 'Progresion_Temporal');
            }

            // 3. Hoja Ranking de Agendas con Asistencias y Financiador
            if (agendasSummaryList.length > 0) {
                const agendasRows = agendasSummaryList.map(a => ({
                    'Modalidad': a.modalidad,
                    'Agenda / Tipo Visita': a.agenda,
                    'Estudios Efectivamente Realizados': a.realizados,
                    'Con Obra Social (Cód. ≠ 042)': a.obraSocial || 0,
                    'Particulares (042 / Nombre)': a.particular || 0,
                    'Total Turnos Agendados': a.total,
                    'Presente (Ambulatorio)': a.presente || 0,
                    'Internado (Hospitalización)': a.internado || 0,
                    'Urgencia': a.urgencia || 0,
                    'Sobreturno': a.sobreturno || 0,
                    'Ausente (No-Show)': a.ausente || 0,
                    'Sin Registrar': a.sinRegistrar || 0,
                    'Ambulatorio': a.ambulatorio,
                    'Hospitalización': a.hospitalizacion,
                    'Informados': a.informados,
                    'Pendientes de Informe': a.pendientes,
                    'Centros': Array.from(a.centros).join(', ')
                }));
                const wsAgendas = XLSX.utils.json_to_sheet(agendasRows);
                XLSX.utils.book_append_sheet(wb, wsAgendas, 'Ranking_Agendas');
            }

            // 4. Hoja Desglose Detallado de Asistencia
            if (asistenciasRanking.length > 0) {
                const asistRows = asistenciasRanking.map(a => ({
                    'Estado de Asistencia': a.nombre,
                    'Categoría': a.categoria,
                    'Cantidad de Estudios': a.cantidad,
                    '% del Volumen Total': `${a.porcentaje}%`
                }));
                const wsAsist = XLSX.utils.json_to_sheet(asistRows);
                XLSX.utils.book_append_sheet(wb, wsAsist, 'Desglose_Asistencia');
            }

            // 5. Hoja Prestadores Realizadores
            if (realizadoresRanking.length > 0) {
                const realRows = realizadoresRanking.map(r => ({
                    'Profesional Realizador': r.nombre,
                    'Cantidad Estudios': r.cantidad,
                    '% del Volumen': `${r.porcentaje}%`
                }));
                const wsReal = XLSX.utils.json_to_sheet(realRows);
                XLSX.utils.book_append_sheet(wb, wsReal, 'Prestadores_Realizan');
            }

            // 6. Hoja Prestadores Solicitantes
            if (solicitantesRanking.length > 0) {
                const solRows = solicitantesRanking.map(s => ({
                    'Profesional Solicitante': s.nombre,
                    'Cantidad Estudios': s.cantidad,
                    '% del Volumen': `${s.porcentaje}%`
                }));
                const wsSol = XLSX.utils.json_to_sheet(solRows);
                XLSX.utils.book_append_sheet(wb, wsSol, 'Prestadores_Solicitan');
            }

            // 7. Hoja Prestadores Informantes
            if (informantesRanking.length > 0) {
                const infRows = informantesRanking.map(i => ({
                    'Profesional Informante': i.nombre,
                    'Estudios Informados': i.cantidad,
                    '% del Total Informados': `${i.porcentaje}%`
                }));
                const wsInf = XLSX.utils.json_to_sheet(infRows);
                XLSX.utils.book_append_sheet(wb, wsInf, 'Prestadores_Informan');
            }

            // 8. Hoja Obras Sociales
            if (obrasSocialesRanking.length > 0) {
                const osRows = obrasSocialesRanking.map(o => ({
                    'Financiador / Obra Social': o.nombre,
                    'Tipo Cobertura': o.tipoFinanciador || classifyFinanciador(o.nombre),
                    'Cantidad Estudios': o.cantidad,
                    '% de Cobertura': `${o.porcentaje}%`
                }));
                const wsOs = XLSX.utils.json_to_sheet(osRows);
                XLSX.utils.book_append_sheet(wb, wsOs, 'Obras_Sociales');
            }

            // 9. Hoja Ecografías Sin Informar Excluidas
            if (ecoSinInformarSummary.byAgenda.length > 0) {
                const ecoExRows = ecoSinInformarSummary.byAgenda.map(e => ({
                    'Estudio / Tipo Visita': e.agenda,
                    'Agenda SALUS': e.agendaSalus,
                    'Profesional / Equipo': e.responsable,
                    'Motivo Sin Informe': e.motivo,
                    'Cantidad Excluida': e.cantidad,
                    'Con Obra Social': e.obraSocial,
                    'Particulares': e.particular
                }));
                const wsEcoEx = XLSX.utils.json_to_sheet(ecoExRows);
                XLSX.utils.book_append_sheet(wb, wsEcoEx, 'Eco_Sin_Informar_Excluidas');
            }

            const fileName = `DxI_Analitica_${selectedModalidad}_${effectiveDesde}_${effectiveHasta}.xlsx`;
            XLSX.writeFile(wb, fileName);
            addToast?.('Planilla Excel (.xlsx) generada exitosamente con todas las hojas', 'success');
        } catch (err) {
            console.error('Error al generar Excel DxI:', err);
            addToast?.('Error al generar archivo Excel: ' + err.message, 'error');
        }
    };

    // ─── EXPORTACIÓN RÁPIDA DE LA PROGRESIÓN TEMPORAL (.XLSX) ───
    const handleExportProgressionExcel = () => {
        if (!progressionChartData.length) {
            addToast?.('No hay datos de progresión para exportar', 'warning');
            return;
        }

        try {
            const wb = XLSX.utils.book_new();
            const progresionRows = progressionChartData.map(p => ({
                'Fecha / Período': p.fullDate || p.label,
                'Etiqueta': p.label,
                'Total Estudios': p.total,
                'Con Obra Social (Cód. ≠ 042)': p.obraSocial || 0,
                'Particulares (042 / Nombre)': p.particular || 0,
                'Ecografía (ECO)': p.ECOGRAFIA || 0,
                'Radiología (RX)': p.RADIOLOGIA || 0,
                'Mamografía': p.MAMOGRAFIA || 0,
                'Tomografía (TC)': p.TOMOGRAFIA || 0,
                'Densitometría': p.DENSITOMETRIA || 0,
                'Ecocardiograma': p.ECOCARDIO || 0,
                'Otras Pruebas': p.OTRAS || 0,
                'Ambulatorio': p.ambulatorio || 0,
                'Hospitalización': p.hospitalizacion || 0
            }));
            const ws = XLSX.utils.json_to_sheet(progresionRows);
            XLSX.utils.book_append_sheet(wb, ws, `Progresion_${activeGranularity}`);
            XLSX.writeFile(wb, `DxI_Progresion_${selectedModalidad}_${effectiveDesde}_${effectiveHasta}.xlsx`);
            addToast?.('Excel de Progresión Temporal descargado exitosamente', 'success');
        } catch (err) {
            console.error('Error exportando progresión a Excel:', err);
            addToast?.('Error al descargar Excel: ' + err.message, 'error');
        }
    };

    // ─── EXPORTACIÓN A CSV ───
    const handleExportCsv = () => {
        if (!agendasSummaryList.length) {
            addToast?.('No hay datos para exportar', 'warning');
            return;
        }

        const headers = ['Modalidad', 'Agenda', 'Estudios Efectivamente Realizados', 'Total Turnos Agendados', 'Presente', 'Internado', 'Urgencia', 'Sobreturno', 'Ausente (No-Show)', 'Sin Registrar', 'Informados', '% Informados', 'Pendientes', 'Centros'];
        const rows = agendasSummaryList.map(a => [
            `"${a.modalidad}"`,
            `"${a.agenda}"`,
            a.realizados || 0,
            a.total,
            a.presente || 0,
            a.internado || 0,
            a.urgencia || 0,
            a.sobreturno || 0,
            a.ausente || 0,
            a.sinRegistrar || 0,
            a.informados,
            (a.realizados || a.total) > 0 ? ((a.informados / (a.realizados || a.total)) * 100).toFixed(1) + '%' : '0%',
            a.pendientes,
            `"${Array.from(a.centros).join(', ')}"`
        ]);

        const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `DxI_Agendas_${selectedModalidad}_${effectiveDesde}_${effectiveHasta}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        addToast?.('Reporte CSV generado exitosamente', 'success');
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: 'Inter, sans-serif' }}>

            {/* ─── BANNER SUPERIOR DE INFORMACIÓN Y SINCRONIZACIÓN ─── */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                padding: '16px 20px',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '12px',
                        background: '#EFF6FF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: COLOR_PRIMARY
                    }}>
                        <Activity size={24} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                            Diagnóstico por Imágenes (DxI)
                        </h2>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => openCasosNominalesModal()}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '7px',
                            background: '#2563EB',
                            color: '#FFFFFF',
                            border: '1px solid #1D4ED8',
                            borderRadius: '10px',
                            padding: '9px 14px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: '0 2px 6px rgba(37,99,235,0.22)'
                        }}
                    >
                        <Users size={15} />
                        Ver Tabla de Casos Nominales
                    </button>
                </div>
            </div>

            {/* ─── 1. BARRA DE PULSO ANIMADA (Opción 1 · Menos es Más) ─── */}
            <DxiBarraPulsoAnimada
                totals={totals}
                loading={loading}
                selectedModalidad={selectedModalidad}
                onResetModalidad={() => {
                    setSelectedModalidad('TODAS');
                    setSelectedAgenda('TODAS');
                }}
                filterFinanciador={filterFinanciador}
                onSelectFinanciador={setFilterFinanciador}
                filterAsistencia={filterAsistencia}
                onToggleAusente={(nextVal) => setFilterAsistencia(nextVal)}
            />

            {/* ─── 2. HERO #1: ANILLO 3D INTERACTIVO CON SEPARACIÓN DE SEGMENTO Y NARRATIVA ─── */}
            {modalidadCounts && Object.keys(modalidadCounts).length > 0 && (() => {
                const modDefs = [
                    { key: 'ECOGRAFIA', label: 'Ecografía', rgb: [0, 59, 115] },
                    { key: 'RADIOLOGIA', label: 'Radiología (RX)', rgb: [2, 132, 199] },
                    { key: 'TOMOGRAFIA', label: 'Tomografía (TC)', rgb: [124, 58, 237] },
                    { key: 'MAMOGRAFIA', label: 'Mamografía', rgb: [219, 39, 119] },
                    { key: 'DENSITOMETRIA', label: 'Densitometría', rgb: [5, 150, 105] },
                    { key: 'ECOCARDIO', label: 'Ecocardiograma', rgb: [225, 29, 72] },
                ];
                const segs = modDefs
                    .map(m => ({ ...m, value: Number(modalidadCounts[m.key] || 0) }))
                    .filter(m => m.value > 0)
                    .sort((a, b) => b.value - a.value);
                if (!segs.length) return null;
                const totMod = segs.reduce((s, x) => s + x.value, 0);

                const modStats = {};
                (scopedData?.agendas || []).forEach(r => {
                    if (!r.EstadoAsistencia || !ESTADOS_EFECTIVOS.has(r.EstadoAsistencia)) return;
                    if (filterFinanciador !== 'TODOS' && r.TipoFinanciador && r.TipoFinanciador !== filterFinanciador) return;
                    const mk = r.Modalidad;
                    if (!mk) return;
                    if (!modStats[mk]) {
                        modStats[mk] = { total: 0, os: 0, part: 0, inf: 0, centros: {}, agendas: {} };
                    }
                    const st = modStats[mk];
                    const cant = Number(r.Cantidad || 0);
                    st.total += cant;
                    const tipoFin = String(r.TipoFinanciador || '').toLowerCase();
                    if (tipoFin.includes('part')) st.part += cant;
                    else st.os += cant;
                    st.inf += Number(r.Informados || r.CantidadInformados || 0);
                    if (r.Centro) st.centros[r.Centro] = (st.centros[r.Centro] || 0) + cant;
                    if (r.Agenda) st.agendas[r.Agenda] = (st.agendas[r.Agenda] || 0) + cant;
                });

                return (
                    <AnilloToroidal3D
                        segments={segs.map((s, idx) => {
                            const pctStr = `${((s.value * 100) / totMod).toFixed(1)}%`;
                            const st = modStats[s.key] || { total: s.value, os: s.value, part: 0, inf: 0, centros: {}, agendas: {} };
                            const topCentroEntry = Object.entries(st.centros).sort((a, b) => b[1] - a[1])[0];
                            const topAgendaEntry = Object.entries(st.agendas).sort((a, b) => b[1] - a[1])[0];
                            const osPct = st.total > 0 ? ((st.os * 100) / st.total).toFixed(1) : '0.0';
                            const partPct = st.total > 0 ? ((st.part * 100) / st.total).toFixed(1) : '0.0';
                            const infPct = st.total > 0 && st.inf > 0 ? ((st.inf * 100) / st.total).toFixed(1) : null;

                            const rankTxt = idx === 0
                                ? `lidera el servicio concentrando el ${pctStr} de la producción del período`
                                : `ocupa el puesto #${idx + 1} del mix con el ${pctStr} del volumen total`;
                            const sedeTxt = topCentroEntry
                                ? ` Su mayor demanda se registra en ${topCentroEntry[0]} (${Math.round((topCentroEntry[1] * 100) / Math.max(1, st.total))}%).`
                                : '';
                            const cobTxt = ` El ${osPct}% corresponde a Obra Social (${st.os.toLocaleString('es-AR')}) y el ${partPct}% a Particulares (${st.part.toLocaleString('es-AR')}).`;
                            const agendaTxt = topAgendaEntry
                                ? ` Práctica principal: ${topAgendaEntry[0]}.`
                                : '';

                            const chips = [
                                ...(topCentroEntry ? [{ label: 'Sede líder', value: `${topCentroEntry[0]} (${topCentroEntry[1].toLocaleString('es-AR')})` }] : []),
                                { label: 'Cobertura', value: `${osPct}% OS · ${partPct}% Part. (${st.part.toLocaleString('es-AR')})` },
                                ...(infPct ? [{ label: 'Informados', value: `${infPct}%` }] : []),
                            ];

                            return {
                                label: s.label,
                                value: s.value,
                                valueLabel: s.value.toLocaleString('es-AR'),
                                rgb: s.rgb,
                                detail: `${pctStr} del total`,
                                narrative: `${s.label} ${rankTxt} (${s.value.toLocaleString('es-AR')} estudios efectivos).${sedeTxt}${cobTxt}${agendaTxt}`,
                                chips,
                                onViewCases: () => openCasosNominalesModal({ modalidad: s.key }),
                                onFilterBoard: () => {
                                    setSelectedModalidad(prev => (prev === s.key ? 'TODAS' : s.key));
                                    setSelectedAgenda('TODAS');
                                },
                            };
                        })}
                    />
                );
            })()}

            {/* ─── 3. FLUJO ANIMADO DE ASISTENCIA (Reemplaza tarjetas repetidas) ─── */}
            <DxiFlujoAsistenciaAnimado
                totals={totals}
                filterAsistencia={filterAsistencia}
                onSelectAsistencia={setFilterAsistencia}
            />

            {/* ─── FILTROS DE TABLERO: ÁMBITO, ASISTENCIA, FINANCIADOR Y BÚSQUEDA ─── */}
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '12px 16px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Filter size={16} color="#64748B" />
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569' }}>Ámbito:</span>
                        <div style={{ display: 'flex', background: '#F1F5F9', padding: '2px', borderRadius: '8px', gap: '2px' }}>
                            {['TODOS', 'Ambulatorio', 'Hospitalización'].map(amb => (
                                <button
                                    key={amb}
                                    onClick={() => setFilterAmbito(amb)}
                                    style={{
                                        border: 'none',
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        background: filterAmbito === amb ? '#FFFFFF' : 'transparent',
                                        color: filterAmbito === amb ? COLOR_PRIMARY : '#64748B',
                                        boxShadow: filterAmbito === amb ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                                    }}
                                >
                                    {amb}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Filtro de Cobertura: Obra Social (Números ≠ 042) vs Particular (042 + Nombres propios) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CreditCard size={15} color="#0D9488" />
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569' }}>Cobertura:</span>
                        <div style={{ display: 'flex', background: '#F1F5F9', padding: '2px', borderRadius: '8px', gap: '2px' }}>
                            {[
                                { id: 'TODOS', label: 'Todos', activeColor: COLOR_PRIMARY },
                                { id: 'Obra Social', label: '🏥 Con Obra Social', activeColor: '#0D9488' },
                                { id: 'Particular', label: '👤 Particulares (042 / Nombre)', activeColor: '#EA580C' }
                            ].map(fin => {
                                const isActive = filterFinanciador === fin.id;
                                return (
                                    <button
                                        key={fin.id}
                                        onClick={() => setFilterFinanciador(fin.id)}
                                        title={fin.id === 'Obra Social'
                                            ? 'Clientes SALUS que comienzan con código numérico excepto 042'
                                            : fin.id === 'Particular'
                                                ? 'Clientes 042 - PARTICULARES o que comienzan con letras (nombre propio)'
                                                : 'Mostrar todas las coberturas'}
                                        style={{
                                            border: 'none',
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            background: isActive ? '#FFFFFF' : 'transparent',
                                            color: isActive ? fin.activeColor : '#64748B',
                                            boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        {fin.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569' }}>Asistencia:</span>
                        <select
                            value={filterAsistencia}
                            onChange={e => setFilterAsistencia(e.target.value)}
                            style={{
                                border: '1px solid #CBD5E1',
                                background: '#FFFFFF',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                color: filterAsistencia === 'TODOS' ? '#475569' : COLOR_PRIMARY,
                                cursor: 'pointer',
                                outline: 'none'
                            }}
                        >
                            <option value="TODOS">Todas las Asistencias</option>
                            <option value="Presente">🟢 Presente / Atendido</option>
                            <option value="Internado">🟣 Internado / Hosp.</option>
                            <option value="Urgencia">🟠 Urgencia / Guardia</option>
                            <option value="Sobreturno">🔵 Sobreturno</option>
                            <option value="Ausente">🔴 Ausente / No-Show</option>
                            <option value="Sin Registrar">⚪ Sin Registrar / Trámite</option>
                        </select>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {selectedAgenda !== 'TODAS' && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: '#EFF6FF',
                            border: '1px solid #BFDBFE',
                            padding: '4px 10px',
                            borderRadius: '8px',
                            fontSize: '0.78rem',
                            color: COLOR_PRIMARY,
                            fontWeight: 600
                        }}>
                            <span>Estudio Singular: <strong>{selectedAgenda}</strong></span>
                            <button
                                onClick={() => setSelectedAgenda('TODAS')}
                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: COLOR_PRIMARY, fontWeight: 800 }}
                            >
                                ✕
                            </button>
                        </div>
                    )}

                    <div style={{ position: 'relative', width: '280px' }}>
                        <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Buscar por estudio, agenda o centro..."
                            style={{
                                width: '100%',
                                padding: '6px 10px 6px 32px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.8rem',
                                color: '#0F172A',
                                outline: 'none'
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* ─── GRÁFICO DE LÍNEAS / 3D TOPOGRÁFICO: PROGRESIÓN DEL PERÍODO ─── */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                padding: '16px 20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
            }}>
                {/* Header limpio de Evolución Temporal (sin botones técnicos) */}
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: '#EFF6FF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: COLOR_PRIMARY
                        }}>
                            <TrendingUp size={17} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: '#0F172A' }}>
                                Evolución Temporal
                            </h3>
                            <span style={{
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                color: COLOR_PRIMARY,
                                background: '#EFF6FF',
                                border: '1px solid #BFDBFE',
                                padding: '2px 8px',
                                borderRadius: '999px',
                                textTransform: 'uppercase'
                            }}>
                                {activeGranularity === 'dia' ? 'Diaria' : 'Mensual'}
                            </span>
                            {selectedAgenda !== 'TODAS' && (
                                <span style={{
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    color: '#003B73',
                                    background: '#F8FAFC',
                                    border: '1px solid #CBD5E1',
                                    padding: '2px 8px',
                                    borderRadius: '999px'
                                }}>
                                    Estudio: {selectedAgenda}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Contenedor del Gráfico 3D Topográfico interactivo */}
                <div style={{ width: '100%', minHeight: '470px', minWidth: 0, position: 'relative' }}>
                    {loading ? (
                        <div style={{ height: '420px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', gap: '8px' }}>
                            <RefreshCw className="animate-spin" size={18} color={COLOR_PRIMARY} />
                            <span style={{ fontSize: '0.85rem' }}>Cargando evolución temporal de estudios...</span>
                        </div>
                    ) : progressionChartData.length === 0 ? (
                        <div style={{ height: '320px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }}>
                            <Activity size={32} strokeWidth={1.5} style={{ marginBottom: '8px', opacity: 0.6 }} />
                            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>No hay datos de evolución temporal para el período seleccionado</span>
                        </div>
                    ) : (
                        <DxiSuperficieTopografica3D
                            data={progressionChartData}
                            series={TOPO_DEFAULT_SERIES}
                            granularity={activeGranularity}
                            height={470}
                            enableCrossStudio
                        />
                    )}
                </div>
            </div>

            {/* ─── GRID PRINCIPAL: TABLA DE AGENDAS + PANEL DE PROFUNDIZACIÓN ─── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', alignItems: 'start' }}>

                {/* 1. LISTA Y RANKING DE AGENDAS */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '14px',
                    border: '1px solid #E2E8F0',
                    padding: '16px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Calendar size={18} color={COLOR_PRIMARY} />
                            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0F172A' }}>
                                Ranking de Producción por Agenda
                            </h3>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                Mostrando {agendasSummaryList.length} agendas
                            </span>
                            <button
                                onClick={handleExportExcel}
                                disabled={loading || !agendasSummaryList.length}
                                title="Descargar reporte completo en Excel (.xlsx)"
                                style={{
                                    border: '1px solid #CBD5E1',
                                    background: '#F8FAFC',
                                    borderRadius: '6px',
                                    padding: '3px 8px',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    color: '#065F46',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                                }}
                            >
                                <FileSpreadsheet size={13} color="#059669" />
                                Excel
                            </button>
                        </div>
                    </div>

                    {/* Totalizador fijo de Ranking de Producción por Agenda */}
                    {!loading && agendasSummaryList.length > 0 && (
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '8px',
                            background: 'linear-gradient(90deg, #ECFDF5 0%, #EFF6FF 100%)',
                            border: '1px solid #A7F3D0',
                            borderRadius: '10px',
                            padding: '9px 14px'
                        }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#065F46' }}>
                                    ∑ Total Producción Efectiva ({selectedModalidad === 'TODAS' ? 'Todas las Modalidades' : selectedModalidad})
                                </span>
                                <span style={{ fontSize: '0.68rem', color: '#475569' }}>
                                    Suma verificada de {agendasSummaryList.length} {agendasSummaryList.length === 1 ? 'agenda activa' : 'agendas activas'}
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ textAlign: 'right' }}>
                                    <span style={{ fontSize: '1.05rem', fontWeight: 900, color: '#047857' }}>
                                        {totals.realizados.toLocaleString('es-AR')}
                                    </span>
                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#065F46', marginLeft: '4px' }}>
                                        efectivos (100%)
                                    </span>
                                </div>
                                <div style={{ height: '22px', width: '1px', background: '#CBD5E1' }} />
                                <div style={{ textAlign: 'right', fontSize: '0.72rem', color: '#334155', fontWeight: 700 }}>
                                    <div>{totals.total.toLocaleString('es-AR')} turnos</div>
                                    <div style={{ color: '#0284C7', fontSize: '0.66rem' }}>{totals.informados.toLocaleString('es-AR')} informados</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
                            <RefreshCw className="animate-spin" size={24} style={{ margin: '0 auto 8px auto' }} />
                            <span>Cargando agendas de imágenes...</span>
                        </div>
                    ) : agendasSummaryList.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#94A3B8' }}>
                            <AlertCircle size={28} style={{ margin: '0 auto 8px auto' }} />
                            <span>No se encontraron agendas para los filtros seleccionados</span>
                        </div>
                    ) : (
                        <div style={{ maxHeight: '600px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {agendasSummaryList.map((item, idx) => {
                                const isSelected = selectedAgenda === item.agenda;
                                const pctRealizados = totals.realizados > 0 ? ((item.realizados / totals.realizados) * 100).toFixed(1) : '0.0';
                                const pctInf = (item.realizados || item.total) > 0 ? ((item.informados / (item.realizados || item.total)) * 100).toFixed(0) : 0;
                                const itemOS = item.obraSocial || 0;
                                const pctItemOS = item.realizados > 0 ? Math.round((itemOS / item.realizados) * 100) : 0;
                                const maxAgendaVol = agendasSummaryList[0]?.realizados || 1;
                                const barWidth = Math.max(3, Math.round((item.realizados / maxAgendaVol) * 100));

                                return (
                                    <div
                                        key={item.agenda}
                                        onClick={() => setSelectedAgenda(isSelected ? 'TODAS' : item.agenda)}
                                        title="Clic para filtrar el panel por esta práctica"
                                        style={{
                                            padding: '10px 12px',
                                            borderRadius: '9px',
                                            border: `1px solid ${isSelected ? COLOR_PRIMARY : '#E2E8F0'}`,
                                            background: isSelected ? '#EFF6FF' : '#FFFFFF',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '6px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', minWidth: '22px' }}>
                                                    #{idx + 1}
                                                </span>
                                                <span style={{
                                                    fontSize: '0.82rem',
                                                    fontWeight: 700,
                                                    color: '#0F172A',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    {item.agenda}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                                <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#003B73', fontVariantNumeric: 'tabular-nums' }}>
                                                    {item.realizados.toLocaleString('es-AR')}
                                                    <span style={{ fontSize: '0.72rem', fontWeight: 500, color: '#64748B', marginLeft: '4px' }}>
                                                        ({pctRealizados}%)
                                                    </span>
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openCasosNominalesModal({ modalidad: item.modalidad, agenda: item.agenda });
                                                    }}
                                                    style={{
                                                        border: '1px solid #CBD5E1',
                                                        background: '#F8FAFC',
                                                        color: '#003B73',
                                                        borderRadius: '6px',
                                                        padding: '2px 7px',
                                                        fontSize: '0.68rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Casos
                                                </button>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ flex: 1, height: '5px', background: '#F1F5F9', borderRadius: '999px', overflow: 'hidden' }}>
                                                <div style={{ width: `${barWidth}%`, height: '100%', background: isSelected ? '#003B73' : '#2563EB', borderRadius: '999px' }} />
                                            </div>
                                            <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                OS {pctItemOS}% · Inf {pctInf}%
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 2. PANEL DE PROFUNDIZACIÓN (PRESTADORES, SOLICITANTES, INFORMANTES, OBRAS SOCIALES, CENTROS) */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '14px',
                    border: '1px solid #E2E8F0',
                    padding: '16px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0F172A' }}>
                                Desglose & Drill-down Clínico
                            </h3>
                            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px' }}>
                                {selectedAgenda === 'TODAS' ? (
                                    <span>Vista global para modalidad: <strong>{selectedModalidad}</strong></span>
                                ) : (
                                    <span style={{ color: COLOR_PRIMARY }}>Filtro activo: <strong>{selectedAgenda}</strong></span>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={() => openCasosNominalesModal()}
                                style={{
                                    border: '1px solid #BFDBFE',
                                    background: '#EFF6FF',
                                    borderRadius: '6px',
                                    padding: '4px 10px',
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    color: '#1D4ED8',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                <Users size={12} />
                                Ver cada caso
                            </button>
                            {selectedAgenda !== 'TODAS' && (
                                <button
                                    onClick={() => setSelectedAgenda('TODAS')}
                                    style={{
                                        border: '1px solid #CBD5E1',
                                        background: '#FFFFFF',
                                        borderRadius: '6px',
                                        padding: '3px 8px',
                                        fontSize: '0.72rem',
                                        color: '#475569',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Ver Todo
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Sub-Pestañas de Detalle */}
                    <div style={{
                        display: 'flex',
                        background: '#F1F5F9',
                        padding: '3px',
                        borderRadius: '10px',
                        gap: '2px',
                        overflowX: 'auto'
                    }}>
                        {[
                            { id: 'asistencia', label: 'Asistencia', icon: CheckCircle2 },
                            { id: 'prestadores', label: 'Realizan', icon: UserCheck },
                            { id: 'solicitantes', label: 'Solicitan', icon: UserPlus },
                            { id: 'informantes', label: 'Informan', icon: FileCheck2 },
                            { id: 'obras_sociales', label: 'Obras Sociales', icon: CreditCard },
                            { id: 'centros', label: 'Centros', icon: MapPin }
                        ].map(sub => {
                            const SubIcon = sub.icon;
                            const isSubActive = activeTabDetail === sub.id;
                            return (
                                <button
                                    key={sub.id}
                                    onClick={() => handleSelectTabDetail(sub.id)}
                                    style={{
                                        flex: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '4px',
                                        border: 'none',
                                        padding: '6px 8px',
                                        borderRadius: '7px',
                                        fontSize: '0.74rem',
                                        fontWeight: isSubActive ? 700 : 600,
                                        cursor: 'pointer',
                                        background: isSubActive ? '#FFFFFF' : 'transparent',
                                        color: isSubActive ? COLOR_PRIMARY : '#64748B',
                                        boxShadow: isSubActive ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                                        transition: 'all 0.15s ease',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    <SubIcon size={13} />
                                    {sub.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Contenido según sub-pestaña */}
                    <div style={{ maxHeight: '530px', overflowY: 'auto' }}>
                        {/* 0. ESTADOS DE ASISTENCIA SALUS */}
                        {activeTabDetail === 'asistencia' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ fontSize: '0.78rem', color: '#64748B', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>Desglose por estado de concurrencia y trámite SALUS:</span>
                                    {filterAsistencia !== 'TODOS' && (
                                        <button
                                            onClick={() => setFilterAsistencia('TODOS')}
                                            style={{ border: 'none', background: 'transparent', color: COLOR_PRIMARY, fontSize: '0.72rem', cursor: 'pointer', fontWeight: 600 }}
                                        >
                                            Mostrar todos
                                        </button>
                                    )}
                                </div>
                                {asistenciasRanking.length > 0 && (() => {
                                    const totalAsistCount = asistenciasRanking.reduce((acc, a) => acc + (a.cantidad || 0), 0);
                                    return (
                                        <div style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '7px 12px', fontSize: '0.75rem'
                                        }}>
                                            <span style={{ fontWeight: 800, color: '#065F46' }}>
                                                ∑ Total Registros de Asistencia ({asistenciasRanking.length} estados)
                                            </span>
                                            <span style={{ fontWeight: 900, fontSize: '0.88rem', color: '#047857' }}>
                                                {totalAsistCount.toLocaleString('es-AR')} (100%)
                                            </span>
                                        </div>
                                    );
                                })()}
                                {asistenciasRanking.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '30px', color: '#94A3B8' }}>
                                        Sin registros de asistencia para los filtros seleccionados
                                    </div>
                                ) : (
                                    asistenciasRanking.map((asist, i) => {
                                        const cfg = ASISTENCIA_CONFIG[asist.categoria] || ASISTENCIA_CONFIG['Sin Registrar'];
                                        const isFilterActive = filterAsistencia === asist.categoria;
                                        return (
                                            <div
                                                key={i}
                                                onClick={() => setFilterAsistencia(isFilterActive ? 'TODOS' : asist.categoria)}
                                                style={{
                                                    padding: '10px 12px',
                                                    borderRadius: '8px',
                                                    background: isFilterActive ? cfg.bg : '#F8FAFC',
                                                    border: `1.5px solid ${isFilterActive ? cfg.color : '#E2E8F0'}`,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{
                                                            fontSize: '0.7rem',
                                                            fontWeight: 700,
                                                            color: cfg.color,
                                                            background: cfg.bg,
                                                            border: `1px solid ${cfg.border}`,
                                                            padding: '1px 6px',
                                                            borderRadius: '6px'
                                                        }}>
                                                            {asist.categoria}
                                                        </span>
                                                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1E293B' }}>
                                                            {asist.nombre}
                                                        </span>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>
                                                            {asist.cantidad.toLocaleString('es-AR')}
                                                        </span>
                                                        <span style={{ fontSize: '0.72rem', color: '#64748B', marginLeft: '6px' }}>
                                                            ({asist.porcentaje}%)
                                                        </span>
                                                    </div>
                                                </div>
                                                <div style={{ width: '100%', height: '5px', background: '#E2E8F0', borderRadius: '999px', marginTop: '6px', overflow: 'hidden' }}>
                                                    <div style={{ width: `${asist.porcentaje}%`, height: '100%', background: cfg.color }}></div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}

                        {/* A. PRESTADORES QUE LA REALIZAN */}
                        {activeTabDetail === 'prestadores' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                                    Profesionales médicos y técnicos que ejecutan la práctica:
                                </div>
                                {realizadoresRanking.length > 0 && (() => {
                                    const totalRealizCount = realizadoresRanking.reduce((acc, p) => acc + (p.cantidad || 0), 0);
                                    return (
                                        <div style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '7px 12px', fontSize: '0.75rem'
                                        }}>
                                            <span style={{ fontWeight: 800, color: '#1E3A8A' }}>
                                                ∑ Total Estudios Realizados ({realizadoresRanking.length} profesionales)
                                            </span>
                                            <span style={{ fontWeight: 900, fontSize: '0.88rem', color: '#1E40AF' }}>
                                                {totalRealizCount.toLocaleString('es-AR')} (100%)
                                            </span>
                                        </div>
                                    );
                                })()}
                                {realizadoresRanking.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '30px', color: '#94A3B8' }}>
                                        Sin datos de prestadores realizadores
                                    </div>
                                ) : (
                                    realizadoresRanking.slice(0, 30).map((p, i) => (
                                        <div key={i} style={{ padding: '8px 10px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1E293B' }}>
                                                    {p.nombre}
                                                </span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>
                                                        {p.cantidad.toLocaleString('es-AR')}
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', color: '#64748B', marginLeft: '6px' }}>
                                                        ({p.porcentaje}%)
                                                    </span>
                                                </div>
                                            </div>
                                            <div style={{ width: '100%', height: '4px', background: '#E2E8F0', borderRadius: '999px', marginTop: '6px', overflow: 'hidden' }}>
                                                <div style={{ width: `${p.porcentaje}%`, height: '100%', background: COLOR_PRIMARY }}></div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {/* B. PRESTADORES QUE LA SOLICITAN */}
                        {activeTabDetail === 'solicitantes' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                                    Médicos derivadores que prescribieron el estudio:
                                </div>
                                {solicitantesRanking.length > 0 && (() => {
                                    const totalSolicCount = solicitantesRanking.reduce((acc, s) => acc + (s.cantidad || 0), 0);
                                    return (
                                        <div style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: '8px', padding: '7px 12px', fontSize: '0.75rem'
                                        }}>
                                            <span style={{ fontWeight: 800, color: '#3730A3' }}>
                                                ∑ Total Estudios Solicitados ({solicitantesRanking.length} derivadores)
                                            </span>
                                            <span style={{ fontWeight: 900, fontSize: '0.88rem', color: '#4338CA' }}>
                                                {totalSolicCount.toLocaleString('es-AR')} (100%)
                                            </span>
                                        </div>
                                    );
                                })()}
                                {solicitantesRanking.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '30px', color: '#94A3B8' }}>
                                        Sin datos de médicos solicitantes
                                    </div>
                                ) : (
                                    solicitantesRanking.slice(0, 30).map((s, i) => (
                                        <div key={i} style={{ padding: '8px 10px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1E293B' }}>
                                                    {s.nombre}
                                                </span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>
                                                        {s.cantidad.toLocaleString('es-AR')}
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', color: '#64748B', marginLeft: '6px' }}>
                                                        ({s.porcentaje}%)
                                                    </span>
                                                </div>
                                            </div>
                                            <div style={{ width: '100%', height: '4px', background: '#E2E8F0', borderRadius: '999px', marginTop: '6px', overflow: 'hidden' }}>
                                                <div style={{ width: `${s.porcentaje}%`, height: '100%', background: '#6366F1' }}></div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {/* C. PRESTADORES QUE LA INFORMAN */}
                        {activeTabDetail === 'informantes' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                                    Especialistas que firman e informan el diagnóstico (Fecha Informado válida):
                                </div>
                                {informantesRanking.length > 0 && (() => {
                                    const totalInfCount = informantesRanking.reduce((acc, inf) => acc + (inf.cantidad || 0), 0);
                                    return (
                                        <div style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '8px', padding: '7px 12px', fontSize: '0.75rem'
                                        }}>
                                            <span style={{ fontWeight: 800, color: '#065F46' }}>
                                                ∑ Total Estudios Informados ({informantesRanking.length} especialistas)
                                            </span>
                                            <span style={{ fontWeight: 900, fontSize: '0.88rem', color: '#047857' }}>
                                                {totalInfCount.toLocaleString('es-AR')} (100%)
                                            </span>
                                        </div>
                                    );
                                })()}
                                {informantesRanking.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '30px', color: '#94A3B8' }}>
                                        Sin informes firmados registrados en este filtro
                                    </div>
                                ) : (
                                    informantesRanking.slice(0, 30).map((inf, i) => (
                                        <div key={i} style={{ padding: '8px 10px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <CheckCircle2 size={14} color="#10B981" />
                                                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1E293B' }}>
                                                        {inf.nombre}
                                                    </span>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>
                                                        {inf.cantidad.toLocaleString('es-AR')}
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', color: '#64748B', marginLeft: '6px' }}>
                                                        ({inf.porcentaje}%)
                                                    </span>
                                                </div>
                                            </div>
                                            <div style={{ width: '100%', height: '4px', background: '#E2E8F0', borderRadius: '999px', marginTop: '6px', overflow: 'hidden' }}>
                                                <div style={{ width: `${inf.porcentaje}%`, height: '100%', background: '#10B981' }}></div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {/* D. OBRAS SOCIALES MÁS USADAS */}
                        {activeTabDetail === 'obras_sociales' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                                    Diferenciación Obra Social (código numérico ≠ 042) vs. Particular (042 + nombres propios):
                                </div>
                                {obrasSocialesRanking.length > 0 && (() => {
                                    const totalOSCount = obrasSocialesRanking.reduce((acc, os) => acc + (os.cantidad || 0), 0);
                                    const sumConOS = obrasSocialesRanking
                                        .filter(os => (os.tipoFinanciador || classifyFinanciador(os.nombre)) === 'Obra Social')
                                        .reduce((acc, os) => acc + (os.cantidad || 0), 0);
                                    const sumPart = obrasSocialesRanking
                                        .filter(os => (os.tipoFinanciador || classifyFinanciador(os.nombre)) === 'Particular')
                                        .reduce((acc, os) => acc + (os.cantidad || 0), 0);
                                    const pctOS = totalOSCount > 0 ? ((sumConOS / totalOSCount) * 100).toFixed(1) : '0.0';
                                    const pctPart = totalOSCount > 0 ? ((sumPart / totalOSCount) * 100).toFixed(1) : '0.0';
                                    return (
                                        <>
                                            <div style={{
                                                display: 'grid',
                                                gridTemplateColumns: '1fr 1fr',
                                                gap: '8px'
                                            }}>
                                                <div
                                                    onClick={() => setFilterFinanciador(filterFinanciador === 'Obra Social' ? 'TODOS' : 'Obra Social')}
                                                    style={{
                                                        background: filterFinanciador === 'Obra Social' ? '#CCFBF1' : '#F0FDFA',
                                                        border: `1.5px solid ${filterFinanciador === 'Obra Social' ? '#0D9488' : '#99F6E4'}`,
                                                        borderRadius: '8px',
                                                        padding: '8px 10px',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#0F766E' }}>
                                                        🏥 Con Obra Social (Cód. ≠ 042)
                                                    </div>
                                                    <div style={{ fontSize: '0.96rem', fontWeight: 900, color: '#115E59', marginTop: '2px' }}>
                                                        {sumConOS.toLocaleString('es-AR')} <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>({pctOS}%)</span>
                                                    </div>
                                                </div>
                                                <div
                                                    onClick={() => setFilterFinanciador(filterFinanciador === 'Particular' ? 'TODOS' : 'Particular')}
                                                    style={{
                                                        background: filterFinanciador === 'Particular' ? '#FFEDD5' : '#FFF7ED',
                                                        border: `1.5px solid ${filterFinanciador === 'Particular' ? '#EA580C' : '#FED7AA'}`,
                                                        borderRadius: '8px',
                                                        padding: '8px 10px',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#C2410C' }}>
                                                        👤 Particulares (042 + Nombres)
                                                    </div>
                                                    <div style={{ fontSize: '0.96rem', fontWeight: 900, color: '#9A3412', marginTop: '2px' }}>
                                                        {sumPart.toLocaleString('es-AR')} <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>({pctPart}%)</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '7px 12px', fontSize: '0.75rem'
                                            }}>
                                                <span style={{ fontWeight: 800, color: '#92400E' }}>
                                                    ∑ Total Financiadores ({obrasSocialesRanking.length} registros)
                                                </span>
                                                <span style={{ fontWeight: 900, fontSize: '0.88rem', color: '#B45309' }}>
                                                    {totalOSCount.toLocaleString('es-AR')} (100%)
                                                </span>
                                            </div>
                                        </>
                                    );
                                })()}
                                {obrasSocialesRanking.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '30px', color: '#94A3B8' }}>
                                        Sin datos de financiadores
                                    </div>
                                ) : (
                                    obrasSocialesRanking.slice(0, 30).map((os, i) => {
                                        const tipoFin = os.tipoFinanciador || classifyFinanciador(os.nombre);
                                        const isParticular = tipoFin === 'Particular';
                                        return (
                                            <div key={i} style={{ padding: '8px 10px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                        <span style={{
                                                            fontSize: '0.64rem',
                                                            fontWeight: 800,
                                                            padding: '1px 6px',
                                                            borderRadius: '4px',
                                                            background: isParticular ? '#FFF7ED' : '#F0FDFA',
                                                            color: isParticular ? '#C2410C' : '#0F766E',
                                                            border: `1px solid ${isParticular ? '#FED7AA' : '#99F6E4'}`
                                                        }}>
                                                            {isParticular ? '👤 Particular' : '🏥 Obra Social'}
                                                        </span>
                                                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1E293B' }}>
                                                            {os.nombre}
                                                        </span>
                                                    </div>
                                                    <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>
                                                            {os.cantidad.toLocaleString('es-AR')}
                                                        </span>
                                                        <span style={{ fontSize: '0.7rem', color: '#64748B', marginLeft: '6px' }}>
                                                            ({os.porcentaje}%)
                                                        </span>
                                                    </div>
                                                </div>
                                                <div style={{ width: '100%', height: '4px', background: '#E2E8F0', borderRadius: '999px', marginTop: '6px', overflow: 'hidden' }}>
                                                    <div style={{ width: `${os.porcentaje}%`, height: '100%', background: isParticular ? '#EA580C' : '#0D9488' }}></div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}

                        {/* E. CENTROS DONDE MÁS SE HACEN */}
                        {activeTabDetail === 'centros' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                                    Distribución física por centro o sede de atención:
                                </div>
                                {centrosRanking.length > 0 && (() => {
                                    const totalCentrosCount = centrosRanking.reduce((acc, c) => acc + (c.cantidad || 0), 0);
                                    return (
                                        <div style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: '8px', padding: '7px 12px', fontSize: '0.75rem'
                                        }}>
                                            <span style={{ fontWeight: 800, color: '#075985' }}>
                                                ∑ Total por Centro Operativo ({centrosRanking.length} sedes)
                                            </span>
                                            <span style={{ fontWeight: 900, fontSize: '0.88rem', color: '#0369A1' }}>
                                                {totalCentrosCount.toLocaleString('es-AR')} (100%)
                                            </span>
                                        </div>
                                    );
                                })()}
                                {centrosRanking.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '30px', color: '#94A3B8' }}>
                                        Sin datos de centros
                                    </div>
                                ) : (
                                    centrosRanking.map((c, i) => (
                                        <div key={i} style={{ padding: '8px 10px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1E293B' }}>
                                                    {c.nombre}
                                                </span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>
                                                        {c.cantidad.toLocaleString('es-AR')}
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', color: '#64748B', marginLeft: '6px' }}>
                                                        ({c.porcentaje}%)
                                                    </span>
                                                </div>
                                            </div>
                                            <div style={{ width: '100%', height: '4px', background: '#E2E8F0', borderRadius: '999px', marginTop: '6px', overflow: 'hidden' }}>
                                                <div style={{ width: `${c.porcentaje}%`, height: '100%', background: '#0284C7' }}></div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>

            </div>

            {/* ─── CAPA 2: MODAL DE TABLA NOMINAL DE CASOS INDIVIDUALES (BAJO DEMANDA) ─── */}
            {casosModalOpen && (
                <div
                    onClick={() => setCasosModalOpen(false)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15, 23, 42, 0.55)',
                        backdropFilter: 'blur(3px)',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '20px'
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: '#FFFFFF',
                            borderRadius: '16px',
                            border: '1px solid #CBD5E1',
                            width: '100%',
                            maxWidth: '1280px',
                            maxHeight: '88vh',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 24px 48px rgba(15, 23, 42, 0.25)',
                            overflow: 'hidden'
                        }}
                    >
                        {/* Header del Modal Nominal */}
                        <div style={{
                            padding: '16px 22px',
                            borderBottom: '1px solid #E2E8F0',
                            background: '#F8FAFC',
                            display: 'flex',
                            flexWrap: 'wrap',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '12px'
                        }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800, color: '#0F172A' }}>
                                        📋 Auditoría Nominal de Casos — Diagnóstico por Imágenes (DxI)
                                    </h3>
                                    <span style={{
                                        fontSize: '0.72rem',
                                        fontWeight: 700,
                                        padding: '2px 9px',
                                        borderRadius: '999px',
                                        background: '#EFF6FF',
                                        color: '#1D4ED8',
                                        border: '1px solid #BFDBFE'
                                    }}>
                                        {filteredCasosNominales.length} casos listados
                                    </span>
                                </div>
                                <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '3px' }}>
                                    Período: <strong>{effectiveDesde}</strong> al <strong>{effectiveHasta}</strong> • Modalidad: <strong>{casosFilter.modalidad}</strong> • Agenda: <strong>{casosFilter.agenda}</strong> • Cobertura: <strong>{casosFilter.tipoFinanciador || 'TODOS'}</strong>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                    onClick={handleExportCasosNominalesExcel}
                                    disabled={casosLoading || !filteredCasosNominales.length}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        background: '#059669',
                                        color: '#FFFFFF',
                                        border: 'none',
                                        borderRadius: '8px',
                                        padding: '8px 13px',
                                        fontSize: '0.78rem',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    <FileSpreadsheet size={15} />
                                    Exportar Casos (.xlsx)
                                </button>
                                <button
                                    onClick={() => setCasosModalOpen(false)}
                                    style={{
                                        background: '#FFFFFF',
                                        border: '1px solid #CBD5E1',
                                        borderRadius: '8px',
                                        padding: '7px 12px',
                                        fontSize: '0.8rem',
                                        fontWeight: 700,
                                        color: '#475569',
                                        cursor: 'pointer'
                                    }}
                                >
                                    ✕ Cerrar
                                </button>
                            </div>
                        </div>

                        {/* Barra de Filtros y Búsqueda Nominal */}
                        <div style={{
                            padding: '12px 22px',
                            borderBottom: '1px solid #E2E8F0',
                            background: '#FFFFFF',
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            gap: '10px'
                        }}>
                            <div style={{ position: 'relative', flex: '1 1 280px' }}>
                                <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                <input
                                    type="text"
                                    value={casosSearch}
                                    onChange={e => setCasosSearch(e.target.value)}
                                    placeholder="Buscar por paciente, DNI, NHC, práctica, médico realizador, solicitante u obra social..."
                                    style={{
                                        width: '100%',
                                        padding: '7px 12px 7px 32px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.8rem',
                                        color: '#0F172A'
                                    }}
                                />
                            </div>

                            <select
                                value={casosFilter.modalidad}
                                onChange={e => {
                                    const next = { ...casosFilter, modalidad: e.target.value, agenda: 'TODAS' };
                                    setCasosFilter(next);
                                    fetchCasosNominales(next);
                                }}
                                style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.78rem', fontWeight: 600 }}
                            >
                                <option value="TODAS">Todas las Modalidades</option>
                                <option value="ECOGRAFIA">Ecografía (ECO)</option>
                                <option value="RADIOLOGIA">Radiología (RX)</option>
                                <option value="MAMOGRAFIA">Mamografía</option>
                                <option value="TOMOGRAFIA">Tomografía (TC)</option>
                                <option value="DENSITOMETRIA">Densitometría</option>
                                <option value="ECOCARDIO">Ecocardiograma</option>
                            </select>

                            <select
                                value={casosFilter.tipoFinanciador || 'TODOS'}
                                onChange={e => {
                                    const next = { ...casosFilter, tipoFinanciador: e.target.value };
                                    setCasosFilter(next);
                                    fetchCasosNominales(next);
                                }}
                                style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.78rem', fontWeight: 600 }}
                            >
                                <option value="TODOS">Todas las Coberturas</option>
                                <option value="Obra Social">🏥 Con Obra Social (Cód. ≠ 042)</option>
                                <option value="Particular">👤 Particular (042 / Nombre)</option>
                            </select>

                            <select
                                value={casosFilter.estadoAsistencia}
                                onChange={e => {
                                    const next = { ...casosFilter, estadoAsistencia: e.target.value };
                                    setCasosFilter(next);
                                    fetchCasosNominales(next);
                                }}
                                style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.78rem', fontWeight: 600 }}
                            >
                                <option value="TODOS">Todos los Estados</option>
                                <option value="Presente">Presente</option>
                                <option value="Internado">Internado / Hosp.</option>
                                <option value="Urgencia">Urgencia</option>
                                <option value="Sobreturno">Sobreturno</option>
                                <option value="Ausente">Ausente (No-Show)</option>
                                <option value="Sin Registrar">Sin Registrar</option>
                            </select>

                            <button
                                onClick={() => fetchCasosNominales(casosFilter)}
                                style={{
                                    padding: '7px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid #2563EB',
                                    background: '#EFF6FF',
                                    color: '#1D4ED8',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px'
                                }}
                            >
                                <RefreshCw size={13} className={casosLoading ? 'animate-spin' : ''} />
                                Actualizar Tabla
                            </button>
                        </div>

                        {/* Cuerpo de la Tabla Nominal */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
                            {casosLoading ? (
                                <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748B' }}>
                                    <RefreshCw size={26} className="animate-spin" color="#2563EB" style={{ margin: '0 auto 10px auto' }} />
                                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0F172A' }}>Consultando tabla nominal de casos...</div>
                                    <div style={{ fontSize: '0.78rem', marginTop: '4px' }}>Trayendo el detalle individual de pacientes y estudios para el filtro seleccionado</div>
                                </div>
                            ) : filteredCasosNominales.length === 0 ? (
                                <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94A3B8' }}>
                                    <AlertCircle size={28} style={{ margin: '0 auto 8px auto' }} />
                                    <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>No se encontraron casos nominales con los filtros actuales</div>
                                </div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                                    <thead style={{ position: 'sticky', top: 0, background: '#F1F5F9', zIndex: 2, borderBottom: '1px solid #CBD5E1' }}>
                                        <tr style={{ textAlign: 'left', color: '#334155', fontWeight: 700 }}>
                                            <th style={{ padding: '10px 12px' }}>Fecha / Hora</th>
                                            <th style={{ padding: '10px 12px' }}>Paciente</th>
                                            <th style={{ padding: '10px 12px' }}>DNI / NHC</th>
                                            <th style={{ padding: '10px 12px' }}>Modalidad / Agenda</th>
                                            <th style={{ padding: '10px 12px' }}>Práctica / Estudio</th>
                                            <th style={{ padding: '10px 12px' }}>Estado</th>
                                            <th style={{ padding: '10px 12px' }}>Realizador</th>
                                            <th style={{ padding: '10px 12px' }}>Solicitante</th>
                                            <th style={{ padding: '10px 12px' }}>Cobertura / Obra Social</th>
                                            <th style={{ padding: '10px 12px' }}>Informe</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredCasosNominales.map((c, idx) => {
                                            const stCfg = ASISTENCIA_CONFIG[c.estado_asistencia] || ASISTENCIA_CONFIG['Sin Registrar'];
                                            const tipoFin = classifyFinanciador(c.obra_social, c.tipo_financiador);
                                            const isPart = tipoFin === 'Particular';
                                            return (
                                                <tr key={`${c.id_peticion}_${idx}`} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                                                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', fontWeight: 600, color: '#0F172A' }}>
                                                        <div>{c.fecha_solicitud}</div>
                                                        {c.hora_solicitud && <div style={{ fontSize: '0.68rem', color: '#64748B' }}>{c.hora_solicitud} hs</div>}
                                                    </td>
                                                    <td style={{ padding: '9px 12px', fontWeight: 700, color: '#0F172A' }}>
                                                        <div>{c.paciente}</div>
                                                        {c.edad ? <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 500 }}>{c.edad} años</div> : null}
                                                    </td>
                                                    <td style={{ padding: '9px 12px', color: '#475569', whiteSpace: 'nowrap' }}>
                                                        {c.dni && <div>DNI: <strong>{c.dni}</strong></div>}
                                                        {c.nhc && <div style={{ fontSize: '0.68rem', color: '#64748B' }}>NHC: {c.nhc}</div>}
                                                    </td>
                                                    <td style={{ padding: '9px 12px' }}>
                                                        <div style={{ fontWeight: 700, color: '#1E40AF', fontSize: '0.72rem' }}>{c.modalidad}</div>
                                                        <div style={{ fontSize: '0.7rem', color: '#475569' }}>{c.agenda}</div>
                                                    </td>
                                                    <td style={{ padding: '9px 12px', fontWeight: 600, color: '#1E293B', maxWidth: '220px' }}>
                                                        {c.estudio}
                                                    </td>
                                                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                                                        <span style={{
                                                            background: stCfg.bg,
                                                            color: stCfg.text,
                                                            border: `1px solid ${stCfg.border}`,
                                                            padding: '2px 7px',
                                                            borderRadius: '999px',
                                                            fontSize: '0.68rem',
                                                            fontWeight: 700
                                                        }}>
                                                            {c.estado_asistencia}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '9px 12px', color: '#334155', fontSize: '0.72rem' }}>{c.realizador}</td>
                                                    <td style={{ padding: '9px 12px', color: '#475569', fontSize: '0.72rem' }}>{c.solicitante}</td>
                                                    <td style={{ padding: '9px 12px', color: '#334155', fontSize: '0.72rem', fontWeight: 600 }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' }}>
                                                            <span style={{
                                                                fontSize: '0.62rem',
                                                                fontWeight: 800,
                                                                padding: '1px 5px',
                                                                borderRadius: '4px',
                                                                background: isPart ? '#FFF7ED' : '#F0FDFA',
                                                                color: isPart ? '#C2410C' : '#0F766E',
                                                                border: `1px solid ${isPart ? '#FED7AA' : '#99F6E4'}`
                                                            }}>
                                                                {isPart ? '👤 Particular' : '🏥 Obra Social'}
                                                            </span>
                                                            <span>{c.obra_social}</span>
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                                                        {c.informado ? (
                                                            <span style={{ color: '#047857', background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '2px 6px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: 700 }}>
                                                                ✓ Firmado
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', padding: '2px 6px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: 600 }}>
                                                                Pendiente
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
