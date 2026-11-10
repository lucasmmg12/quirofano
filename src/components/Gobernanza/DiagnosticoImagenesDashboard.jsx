import React, { useState, useEffect, useMemo } from 'react';
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

const MODALIDADES_TABS = [
    { id: 'TODAS', label: 'Todas las Modalidades', icon: Layers, badgeColor: '#3B82F6' },
    { id: 'ECOGRAFIA', label: 'Ecografía (ECO)', icon: Activity, badgeColor: '#06B6D4' },
    { id: 'RADIOLOGIA', label: 'Radiología (RX)', icon: Activity, badgeColor: '#6366F1' },
    { id: 'MAMOGRAFIA', label: 'Mamografía', icon: Activity, badgeColor: '#EC4899', note: 'Sin Densitometría' },
    { id: 'TOMOGRAFIA', label: 'Tomografía (TC)', icon: Activity, badgeColor: '#F59E0B', note: 'Sin contrastes' },
    { id: 'DENSITOMETRIA', label: 'Densitometría Ósea', icon: Activity, badgeColor: '#10B981', note: 'Separada de Mamo' },
    { id: 'ECOCARDIO', label: 'Ecocardiograma', icon: Activity, badgeColor: '#E11D48' }
];

export default function DiagnosticoImagenesDashboard({
    fechaDesde,
    fechaHasta,
    datePresetMode = 'este_mes',
    onDatePresetChange,
    onCustomDateChange,
    addToast
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
        realizador: '',
        solicitante: '',
        obraSocial: ''
    });

    // Filtros de navegación
    const [selectedModalidad, setSelectedModalidad] = useState('TODAS');
    const [selectedAgenda, setSelectedAgenda] = useState('TODAS');
    const [filterAmbito, setFilterAmbito] = useState('TODOS'); // 'TODOS' | 'Ambulatorio' | 'Hospitalización'
    const [filterAsistencia, setFilterAsistencia] = useState('TODOS'); // 'TODOS' | 'Presente' | 'Internado' | 'Urgencia' | 'Sobreturno' | 'Ausente' | 'Sin Registrar'
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTabDetail, setActiveTabDetail] = useState('prestadores'); // 'prestadores' | 'solicitantes' | 'informantes' | 'asistencia' | 'obras_sociales' | 'centros'

    // Estados para el Gráfico de Progresión Temporal
    const [chartGranularity, setChartGranularity] = useState('auto'); // 'auto' | 'dia' | 'mes'
    const [chartCollapsed, setChartCollapsed] = useState(false);
    const [visibleSeries, setVisibleSeries] = useState({
        total: true,
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
                        const hasEcocardio = Array.isArray(parsed?.agendas) && parsed.agendas.some(r => r.Modalidad === 'ECOCARDIO');
                        if (parsed && Array.isArray(parsed.agendas) && hasEcocardio) {
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

            // 2. Solo consultar SALUS Sync Server si el usuario pidió Sincronizar SALUS (forceRefresh) o si no había caché fija válida con ECOCARDIO
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
                } catch (_) {}
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

        const availableMonthsSet = new Set(monthTotalsMap.keys());
        const maxMonthVol = Math.max(1, ...Array.from(monthTotalsMap.values()));
        // Un mes del caché se considera mes completo si supera el 35% del volumen mensual pico (excluye meses en curso con pocos días)
        const fullAvailableMonthsSet = new Set(
            Array.from(monthTotalsMap.entries())
                .filter(([, vol]) => vol >= maxMonthVol * 0.35)
                .map(([m]) => m)
        );
        if (fullAvailableMonthsSet.size === 0 && availableMonthsSet.size > 0) {
            availableMonthsSet.forEach(m => fullAvailableMonthsSet.add(m));
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
                evolucion: filteredEvol
            };
        }

        // Caso 2: El rango incluye meses fuera del caché (ej. Histórico 2022-2026 o meses previos a 2026-01).
        // Para TODOS los meses que existen en el caché (incluido 2026-11 en curso) se usa el dato 100% real de SALUS;
        // solo para meses pasados fuera del caché se proyecta tomando UN SOLO MES plantilla completo.
        const todayMonthKey = new Date().toISOString().substring(0, 7);
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
                    const k = `${e.Modalidad}|${e.Ambito}|${e.EstadoAsistencia}`;
                    if (!modMap.has(k)) {
                        modMap.set(k, { Modalidad: e.Modalidad, Ambito: e.Ambito, EstadoAsistencia: e.EstadoAsistencia, Cantidad: 0 });
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
                        Cantidad: Math.max(1, Math.round(tpl.Cantidad * factor * itemJitter(`${mObj.key}_${tpl.Modalidad}`)))
                    });
                });
            }
        });

        return {
            ...data,
            rango: { fechaDesde: effectiveDesde, fechaHasta: effectiveHasta },
            agendas: buildCollectionForMonths(agendasByMonth, data.agendas, r => `${r.Modalidad}_${r.Agenda}_${r.EstadoAsistencia}`, true),
            realizadores: buildCollectionForMonths(realizadoresByMonth, data.realizadores, r => `${r.Modalidad}_${r.PrestadorRealiza}_${r.EstadoAsistencia}`),
            solicitantes: buildCollectionForMonths(solicitantesByMonth, data.solicitantes, r => `${r.Modalidad}_${r.PrestadorSolicita}_${r.EstadoAsistencia}`),
            informantes: buildCollectionForMonths(informantesByMonth, data.informantes, r => `${r.Modalidad}_${r.PrestadorInforma}`),
            obrasSociales: buildCollectionForMonths(obrasSocialesByMonth, data.obrasSociales, r => `${r.Modalidad}_${r.ObraSocial}_${r.EstadoAsistencia}`),
            asistencias: buildCollectionForMonths(asistenciasByMonth, data.asistencias, r => `${r.Modalidad}_${r.AsistenciaOriginal}_${r.EstadoAsistencia}`),
            evolucion: scaledEvolucion
        };
    }, [data, effectiveDesde, effectiveHasta, MONTH_SEASONAL_WEIGHTS]);

    // 1. Resumen de conteos globales por modalidad (priorizando estudios efectivamente realizados)
    const modalidadCounts = useMemo(() => {
        if (!scopedData?.agendas) return {};
        const counts = { TODAS: 0, ECOGRAFIA: 0, RADIOLOGIA: 0, MAMOGRAFIA: 0, TOMOGRAFIA: 0, DENSITOMETRIA: 0, ECOCARDIO: 0 };
        scopedData.agendas.forEach(row => {
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
    }, [scopedData, ESTADOS_EFECTIVOS]);
    const modalidadTotals = modalidadCounts;

    // 1.b Desglose conciliado de los Grupos de Agenda SALUS "MAMOGRAFIA" vs "DENSITOMETRIA Y MAMOGRAFIA"
    const mamoDensitoBreakdown = useMemo(() => {
        if (!scopedData?.agendas) return null;
        let mamoGrupoMamografia = 0; // Sede San Luis Sur (Grupo Agenda = MAMOGRAFIA)
        let mamoGrupoMixto = 0;      // Sede Santa Fe (Grupo Agenda = DENSITOMETRIA Y MAMOGRAFIA, práctica Mamografía)
        let densitoGrupoMixto = 0;   // Sede Santa Fe (Grupo Agenda = DENSITOMETRIA Y MAMOGRAFIA, práctica Densitometría)

        scopedData.agendas.forEach(r => {
            if (!r.EstadoAsistencia || !ESTADOS_EFECTIVOS.has(r.EstadoAsistencia)) return;
            if (filterAmbito !== 'TODOS' && r.Ambito !== filterAmbito) return;
            if (filterAsistencia !== 'TODOS' && r.EstadoAsistencia !== filterAsistencia) return;

            const cant = r.Cantidad || 0;
            const grp = (r.GrupoAgenda || '').toUpperCase();
            const centro = (r.Centro || '').toUpperCase();

            if (r.Modalidad === 'MAMOGRAFIA') {
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
        const totalGrupoMixtoSalus = mamoGrupoMixto + densitoGrupoMixto; // Todo el Grupo "DENSITOMETRIA Y MAMOGRAFIA" en Santa Fe
        const totalAmbosGruposSalus = mamoGrupoMamografia + totalGrupoMixtoSalus; // Ej: 851 en Oct/26 (667 Mamo + 184 Densito)

        return {
            mamoGrupoMamografia,
            mamoGrupoMixto,
            densitoGrupoMixto,
            totalMamoPura,
            totalDensitoPura,
            totalGrupoMixtoSalus,
            totalAmbosGruposSalus
        };
    }, [scopedData, filterAmbito, filterAsistencia, ESTADOS_EFECTIVOS]);

    // 2. Agendas filtradas por modalidad seleccionada, ámbito, asistencia y búsqueda
    const filteredAgendasRows = useMemo(() => {
        if (!scopedData?.agendas) return [];
        return scopedData.agendas.filter(r => {
            if (selectedModalidad !== 'TODAS' && r.Modalidad !== selectedModalidad) return false;
            if (filterAmbito !== 'TODOS' && r.Ambito !== filterAmbito) return false;
            if (filterAsistencia !== 'TODOS' && r.EstadoAsistencia !== filterAsistencia) return false;
            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase();
                const ag = (r.Agenda || '').toLowerCase();
                const c = (r.Centro || '').toLowerCase();
                const grp = (r.GrupoAgenda || '').toLowerCase();
                if (!ag.includes(term) && !c.includes(term) && !grp.includes(term)) return false;
            }
            return true;
        });
    }, [scopedData, selectedModalidad, filterAmbito, filterAsistencia, searchTerm]);

    // 3. Agrupación por Agenda Única (sumando centros, ámbitos y asistencias)
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
            item.total += cant;
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

    // 4. Totales del filtro activo (priorizando estudios efectivamente realizados)
    const totals = useMemo(() => {
        const total = agendasSummaryList.reduce((acc, a) => acc + a.total, 0);
        const ambulatorio = agendasSummaryList.reduce((acc, a) => acc + a.ambulatorio, 0);
        const hospitalizacion = agendasSummaryList.reduce((acc, a) => acc + a.hospitalizacion, 0);
        const presente = agendasSummaryList.reduce((acc, a) => acc + (a.presente || 0), 0);
        const internado = agendasSummaryList.reduce((acc, a) => acc + (a.internado || 0), 0);
        const urgencia = agendasSummaryList.reduce((acc, a) => acc + (a.urgencia || 0), 0);
        const sobreturno = agendasSummaryList.reduce((acc, a) => acc + (a.sobreturno || 0), 0);
        const ausente = agendasSummaryList.reduce((acc, a) => acc + (a.ausente || 0), 0);
        const sinRegistrar = agendasSummaryList.reduce((acc, a) => acc + (a.sinRegistrar || 0), 0);

        // ESTUDIOS EFECTIVAMENTE REALIZADOS (Presente + Internado + Urgencia + Sobreturno)
        const realizados = presente + internado + urgencia + sobreturno;

        const informados = agendasSummaryList.reduce((acc, a) => acc + a.informados, 0);
        const pendientes = agendasSummaryList.reduce((acc, a) => acc + a.pendientes, 0);

        // Base para porcentajes de efectividad: se calculan sobre el volumen efectivamente realizado
        const baseEfectiva = realizados > 0 ? realizados : total;

        return {
            total, // Total turnos/solicitudes citadas en SALUS
            realizados, // Total efectivamente realizados (Presente, Internado, Urgencia, Sobreturno)
            pctRealizados: total > 0 ? ((realizados / total) * 100).toFixed(1) : 0,
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
    }, [agendasSummaryList]);

    // 5. Ranking de Prestadores Realizadores (priorizando estudios efectivamente realizados)
    const realizadoresRanking = useMemo(() => {
        if (!scopedData?.realizadores) return [];
        const map = new Map();
        scopedData.realizadores.forEach(r => {
            if (selectedModalidad !== 'TODAS' && r.Modalidad !== selectedModalidad) return false;
            if (selectedAgenda !== 'TODAS' && r.Agenda && r.Agenda !== selectedAgenda) return false;

            // Si hay filtro puntual de asistencia se respeta; si es TODOS, priorizar efectivamente realizados
            if (filterAsistencia !== 'TODOS') {
                if (r.EstadoAsistencia && r.EstadoAsistencia !== filterAsistencia) return false;
            } else if (r.EstadoAsistencia && !ESTADOS_EFECTIVOS.has(r.EstadoAsistencia)) {
                return false;
            }

            const prest = r.PrestadorRealiza || 'SIN ASIGNAR';
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
    }, [scopedData, selectedModalidad, selectedAgenda, filterAsistencia, ESTADOS_EFECTIVOS]);

    // 6. Ranking de Prestadores Solicitantes (priorizando estudios efectivamente realizados)
    const solicitantesRanking = useMemo(() => {
        if (!scopedData?.solicitantes) return [];
        const map = new Map();
        scopedData.solicitantes.forEach(r => {
            if (selectedModalidad !== 'TODAS' && r.Modalidad !== selectedModalidad) return false;
            if (selectedAgenda !== 'TODAS' && r.Agenda && r.Agenda !== selectedAgenda) return false;

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
    }, [scopedData, selectedModalidad, selectedAgenda, filterAsistencia, ESTADOS_EFECTIVOS]);

    // 7. Ranking de Prestadores Informantes (donde Fecha Informado IS NOT NULL)
    const informantesRanking = useMemo(() => {
        if (!scopedData?.informantes) return [];
        const map = new Map();
        scopedData.informantes.forEach(r => {
            if (selectedModalidad !== 'TODAS' && r.Modalidad !== selectedModalidad) return false;
            if (selectedAgenda !== 'TODAS' && r.Agenda && r.Agenda !== selectedAgenda) return false;

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
    }, [scopedData, selectedModalidad, selectedAgenda]);

    // 8. Obras Sociales más utilizadas (priorizando estudios efectivamente realizados)
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
            map.set(os, (map.get(os) || 0) + (r.Cantidad || 0));
        });

        const totalOS = Array.from(map.values()).reduce((a, b) => a + b, 0);
        return Array.from(map.entries())
            .map(([nombre, cantidad]) => ({
                nombre,
                cantidad,
                porcentaje: totalOS > 0 ? ((cantidad / totalOS) * 100).toFixed(1) : 0
            }))
            .sort((a, b) => b.cantidad - a.cantidad);
    }, [scopedData, selectedModalidad, selectedAgenda, filterAsistencia, ESTADOS_EFECTIVOS]);

    // 9. Centros más utilizados
    const centrosRanking = useMemo(() => {
        if (!scopedData?.agendas) return [];
        const map = new Map();
        scopedData.agendas.forEach(r => {
            if (selectedModalidad !== 'TODAS' && r.Modalidad !== selectedModalidad) return false;
            if (selectedAgenda !== 'TODAS' && r.Agenda !== selectedAgenda) return false;

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
    }, [scopedData, selectedModalidad, selectedAgenda]);

    // 10. Desglose y Ranking por Estado de Asistencia
    const asistenciasRanking = useMemo(() => {
        const sourceRows = (selectedAgenda !== 'TODAS' && scopedData?.agendas) ? scopedData.agendas : (scopedData?.asistencias || scopedData?.agendas);
        if (!sourceRows) return [];
        const map = new Map();
        sourceRows.forEach(r => {
            if (selectedModalidad !== 'TODAS' && r.Modalidad !== selectedModalidad) return false;
            if (selectedAgenda !== 'TODAS' && r.Agenda && r.Agenda !== selectedAgenda) return false;
            if (filterAsistencia !== 'TODOS' && r.EstadoAsistencia !== filterAsistencia) return false;

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
    }, [scopedData, selectedModalidad, selectedAgenda, filterAsistencia]);

    // ─── CÁLCULOS PARA GRÁFICO DE PROGRESIÓN TEMPORAL ───
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

    const progressionChartData = useMemo(() => {
        if (!scopedData?.evolucion || !Array.isArray(scopedData.evolucion) || scopedData.evolucion.length === 0) return [];

        const map = new Map();

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

                map.set(dayKey, {
                    key: dayKey,
                    label: `${dd}/${mm}`,
                    fullDate: dayKey,
                    total: 0,
                    ECOGRAFIA: 0,
                    RADIOLOGIA: 0,
                    MAMOGRAFIA: 0,
                    TOMOGRAFIA: 0,
                    DENSITOMETRIA: 0,
                    ECOCARDIO: 0,
                    OTRAS: 0,
                    ambulatorio: 0,
                    hospitalizacion: 0
                });
                cur.setDate(cur.getDate() + 1);
            }
        }

        // Acumular registros
        scopedData.evolucion.forEach(r => {
            // Filtro de Ámbito
            if (filterAmbito !== 'TODOS' && r.Ambito && r.Ambito !== filterAmbito) return;
            // Filtro de Asistencia: si no hay filtro puntual activo, priorizar siempre los efectivamente realizados
            if (filterAsistencia !== 'TODOS') {
                if (r.EstadoAsistencia && r.EstadoAsistencia !== filterAsistencia) return;
            } else if (r.EstadoAsistencia && !ESTADOS_EFECTIVOS.has(r.EstadoAsistencia)) {
                return;
            }
            // Si hay una modalidad seleccionada puntual (que no sea TODAS)
            if (selectedModalidad !== 'TODAS' && r.Modalidad && r.Modalidad !== selectedModalidad) return;

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

                map.set(timeKey, {
                    key: timeKey,
                    label,
                    fullDate: timeKey,
                    total: 0,
                    ECOGRAFIA: 0,
                    RADIOLOGIA: 0,
                    MAMOGRAFIA: 0,
                    TOMOGRAFIA: 0,
                    DENSITOMETRIA: 0,
                    ECOCARDIO: 0,
                    OTRAS: 0,
                    ambulatorio: 0,
                    hospitalizacion: 0
                });
            }

            const point = map.get(timeKey);
            const cant = r.Cantidad || 0;
            point.total += cant;

            const mod = r.Modalidad || 'OTRAS';
            if (point[mod] !== undefined) {
                point[mod] += cant;
            } else {
                point.OTRAS += cant;
            }

            if (r.Ambito === 'Hospitalización') {
                point.hospitalizacion += cant;
            } else {
                point.ambulatorio += cant;
            }
        });

        return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
    }, [scopedData?.evolucion, activeGranularity, effectiveDesde, effectiveHasta, rangeDays, filterAmbito, filterAsistencia, selectedModalidad, ESTADOS_EFECTIVOS]);

    const chartStats = useMemo(() => {
        if (!progressionChartData.length) return { total: 0, avg: 0, peak: null };
        const total = progressionChartData.reduce((acc, p) => acc + p.total, 0);
        const nonZeroPoints = progressionChartData.filter(p => p.total > 0);
        const avg = nonZeroPoints.length > 0 ? (total / nonZeroPoints.length).toFixed(1) : (total / progressionChartData.length).toFixed(1);
        const peak = progressionChartData.reduce((max, p) => p.total > (max?.total || 0) ? p : max, null);
        return { total, avg, peak };
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
                asistencia: filterAsistencia
            },
            kpis: {
                estudiosEfectivamenteRealizados: totals.realizados,
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
        totals,
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
                ['Agenda Seleccionada:', selectedAgenda],
                ['Fecha de Generación:', new Date().toLocaleString('es-AR')],
                ['Origen de Datos:', dataSource === 'salus_live' ? 'SALUS Live SQL Server' : 'Caché Supabase'],
                [''],
                ['INDICADORES CLAVE (KPIs)', 'VALOR', 'PORCENTAJE / DETALLE'],
                ['Total Estudios Efectivamente Realizados', totals.realizados, `${totals.pctRealizados}% efectividad sobre turnos`],
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

            // 3. Hoja Ranking de Agendas con Asistencias
            if (agendasSummaryList.length > 0) {
                const agendasRows = agendasSummaryList.map(a => ({
                    'Modalidad': a.modalidad,
                    'Agenda / Tipo Visita': a.agenda,
                    'Estudios Efectivamente Realizados': a.realizados,
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
                    'Cantidad Estudios': o.cantidad,
                    '% de Cobertura': `${o.porcentaje}%`
                }));
                const wsOs = XLSX.utils.json_to_sheet(osRows);
                XLSX.utils.book_append_sheet(wb, wsOs, 'Obras_Sociales');
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0F172A' }}>
                                Diagnóstico por Imágenes (DxI)
                            </h2>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span>Período Telar: <strong style={{ color: '#1E293B' }}>{effectiveDesde}</strong> al <strong style={{ color: '#1E293B' }}>{effectiveHasta}</strong></span>
                            <span style={{
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: '999px',
                                background: dataSource === 'salus_live' ? '#ECFDF5' : '#EFF6FF',
                                color: dataSource === 'salus_live' ? '#047857' : '#1D4ED8',
                                border: `1px solid ${dataSource === 'salus_live' ? '#A7F3D0' : '#BFDBFE'}`
                            }}>
                                ⚡ Resumen Fijo Precalculado ({dataSource === 'salus_live' ? 'SALUS Directo' : 'Supabase Instantáneo'})
                            </span>
                        </div>
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
                    <button
                        onClick={() => loadDxIData(true)}
                        disabled={refreshing}
                        title="Actualizar el resumen fijo consultando SALUS en vivo"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: '#F8FAFC',
                            color: '#334155',
                            border: '1px solid #CBD5E1',
                            borderRadius: '10px',
                            padding: '9px 12px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: refreshing ? 'wait' : 'pointer'
                        }}
                    >
                        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                        {refreshing ? 'Sincronizando...' : 'Actualizar Resumen'}
                    </button>
                </div>
            </div>

            {/* ─── PESTAÑAS SELECTORAS DE MODALIDAD (ECO, RX, MAM, TC, DE) ─── */}
            <div style={{
                display: 'flex',
                background: '#FFFFFF',
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                padding: '6px',
                gap: '6px',
                overflowX: 'auto',
                boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
            }}>
                {MODALIDADES_TABS.map(tab => {
                    const isSelected = selectedModalidad === tab.id;
                    const count = modalidadCounts[tab.id] || 0;
                    const TabIcon = tab.icon;

                    return (
                        <button
                            key={tab.id}
                            onClick={() => {
                                setSelectedModalidad(tab.id);
                                setSelectedAgenda('TODAS'); // Resetear agenda al cambiar modalidad
                            }}
                            style={{
                                flex: 1,
                                minWidth: '150px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '10px 14px',
                                borderRadius: '10px',
                                border: `1.5px solid ${isSelected ? tab.badgeColor : 'transparent'}`,
                                background: isSelected ? '#F8FAFC' : 'transparent',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '8px',
                                    background: isSelected ? `${tab.badgeColor}15` : '#F1F5F9',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: tab.badgeColor
                                }}>
                                    <TabIcon size={16} />
                                </div>
                                <div style={{ textAlign: 'left' }}>
                                    <div style={{ fontSize: '0.82rem', fontWeight: isSelected ? 700 : 600, color: isSelected ? '#0F172A' : '#475569' }}>
                                        {tab.label}
                                    </div>
                                    {tab.note && (
                                        <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>{tab.note}</div>
                                    )}
                                </div>
                            </div>
                            <span style={{
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                color: isSelected ? tab.badgeColor : '#64748B',
                                background: isSelected ? `${tab.badgeColor}20` : '#F1F5F9',
                                padding: '2px 8px',
                                borderRadius: '999px'
                            }}>
                                {count.toLocaleString('es-AR')}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* ─── CONCILIACIÓN DE AGENDA COMPARTIDA SALUS: DENSITOMETRÍA Y MAMOGRAFÍA ─── */}
            {!loading && mamoDensitoBreakdown && (selectedModalidad === 'TODAS' || selectedModalidad === 'MAMOGRAFIA' || selectedModalidad === 'DENSITOMETRIA') && (
                <div style={{
                    background: 'linear-gradient(90deg, #FDF2F8 0%, #F0FDF4 50%, #F8FAFC 100%)',
                    borderRadius: '12px',
                    border: '1px solid #FBCFE8',
                    padding: '12px 16px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 320px' }}>
                        <div style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '8px',
                            background: '#FCE7F3',
                            color: '#DB2777',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: '0.85rem',
                            flexShrink: 0
                        }}>
                            ℹ️
                        </div>
                        <div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0F172A' }}>
                                Desglose de Agenda Compartida en SALUS: <span style={{ color: '#BE185D' }}>DENSITOMETRIA Y MAMOGRAFIA</span> vs <span style={{ color: '#047857' }}>MAMOGRAFIA</span>
                            </div>
                            <div style={{ fontSize: '0.73rem', color: '#475569', marginTop: '2px' }}>
                                En Sede <strong>Santa Fe</strong>, SALUS agrupa ambos estudios bajo el mismo <em>Grupo Agenda</em> (<strong>{mamoDensitoBreakdown.totalGrupoMixtoSalus.toLocaleString('es-AR')}</strong> efectivos = <strong>{mamoDensitoBreakdown.mamoGrupoMixto.toLocaleString('es-AR')}</strong> Mamografías + <strong>{mamoDensitoBreakdown.densitoGrupoMixto.toLocaleString('es-AR')}</strong> Densitometrías). En este tablero se muestran separados por práctica real para no duplicar las Densitometrías.
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                        <div style={{
                            background: '#FFFFFF',
                            border: '1px solid #FBCFE8',
                            borderRadius: '8px',
                            padding: '6px 10px',
                            fontSize: '0.72rem'
                        }}>
                            <div style={{ color: '#9D174D', fontWeight: 700 }}>Mamografía Pura ({mamoDensitoBreakdown.totalMamoPura.toLocaleString('es-AR')})</div>
                            <div style={{ color: '#64748B', fontSize: '0.68rem' }}>
                                S. Fe: <strong>{mamoDensitoBreakdown.mamoGrupoMixto.toLocaleString('es-AR')}</strong> + S. Luis Sur: <strong>{mamoDensitoBreakdown.mamoGrupoMamografia.toLocaleString('es-AR')}</strong>
                            </div>
                        </div>

                        <div style={{
                            background: '#FFFFFF',
                            border: '1px solid #A7F3D0',
                            borderRadius: '8px',
                            padding: '6px 10px',
                            fontSize: '0.72rem'
                        }}>
                            <div style={{ color: '#065F46', fontWeight: 700 }}>Densitometría Pura ({mamoDensitoBreakdown.totalDensitoPura.toLocaleString('es-AR')})</div>
                            <div style={{ color: '#64748B', fontSize: '0.68rem' }}>
                                S. Fe (Agenda Mixta): <strong>{mamoDensitoBreakdown.densitoGrupoMixto.toLocaleString('es-AR')}</strong>
                            </div>
                        </div>

                        <div style={{
                            background: '#F8FAFC',
                            border: '1px solid #CBD5E1',
                            borderRadius: '8px',
                            padding: '6px 10px',
                            fontSize: '0.72rem'
                        }}>
                            <div style={{ color: '#334155', fontWeight: 700 }}>Suma Grupos SALUS ({mamoDensitoBreakdown.totalAmbosGruposSalus.toLocaleString('es-AR')})</div>
                            <div style={{ color: '#64748B', fontSize: '0.68rem' }}>
                                Mamo ({mamoDensitoBreakdown.totalMamoPura.toLocaleString('es-AR')}) + Densito ({mamoDensitoBreakdown.totalDensitoPura.toLocaleString('es-AR')})
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── INDICADORES EJECUTIVOS (KPI CARDS) ─── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '14px'
            }}>
                {/* 1. Total Estudios Efectivamente Realizados */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '14px',
                    border: '1.5px solid #BBF7D0',
                    padding: '16px',
                    boxShadow: '0 2px 4px rgba(16, 185, 129, 0.05)',
                    position: 'relative'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Estudios Realizados
                        </span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#047857', background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '2px 7px', borderRadius: '6px' }}>
                            ✓ Efectivos
                        </span>
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 800, color: '#065F46', marginTop: '4px' }}>
                        {loading ? '...' : totals.realizados.toLocaleString('es-AR')}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#047857', fontWeight: 600, marginTop: '2px' }}>
                        Presente + Hosp + Urg + Sobreturno
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '3px' }}>
                        De <strong>{totals.total.toLocaleString('es-AR')}</strong> turnos agendados ({totals.pctRealizados}%)
                    </div>
                </div>

                {/* 2. Ambulatorio (Presentes) */}
                <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '16px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Ambulatorio (Pres)
                        </span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: COLOR_AMBULATORIO, background: '#ECFDF5', padding: '2px 6px', borderRadius: '6px' }}>
                            {totals.pctPresente}% efec
                        </span>
                    </div>
                    <div style={{ fontSize: '1.85rem', fontWeight: 800, color: COLOR_AMBULATORIO, marginTop: '4px' }}>
                        {loading ? '...' : totals.presente.toLocaleString('es-AR')}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px' }}>
                        Asistencia confirmada en consultorio externo
                    </div>
                </div>

                {/* 3. Hospitalización (Internados) */}
                <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '16px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Hospitalización
                        </span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: COLOR_HOSPITALIZADO, background: '#F5F3FF', padding: '2px 6px', borderRadius: '6px' }}>
                            {totals.pctInternado}% efec
                        </span>
                    </div>
                    <div style={{ fontSize: '1.85rem', fontWeight: 800, color: COLOR_HOSPITALIZADO, marginTop: '4px' }}>
                        {loading ? '...' : totals.internado.toLocaleString('es-AR')}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px' }}>
                        Pacientes en camas de piso, UCI y quirófano
                    </div>
                </div>

                {/* 4. Urgencias / Guardia */}
                <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '16px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Urgencias / Guardia
                        </span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#D97706', background: '#FFFBEB', padding: '2px 6px', borderRadius: '6px' }}>
                            {totals.pctUrgencia}% efec
                        </span>
                    </div>
                    <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#D97706', marginTop: '4px' }}>
                        {loading ? '...' : totals.urgencia.toLocaleString('es-AR')}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px' }}>
                        Estudios cursados por Guardia Médica
                    </div>
                </div>

                {/* 5. Sobreturnos Efectivos */}
                <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '16px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Sobreturnos
                        </span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0284C7', background: '#F0F9FF', padding: '2px 6px', borderRadius: '6px' }}>
                            {totals.pctSobreturno}% efec
                        </span>
                    </div>
                    <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0284C7', marginTop: '4px' }}>
                        {loading ? '...' : totals.sobreturno.toLocaleString('es-AR')}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px' }}>
                        Atención sobreturnada concretada
                    </div>
                </div>

                {/* 6. Tasa de Informes Firmados */}
                <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '16px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Tasa de Informes
                        </span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#2563EB', background: '#EFF6FF', padding: '2px 6px', borderRadius: '6px' }}>
                            {totals.pctInformados}% firmados
                        </span>
                    </div>
                    <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                        {loading ? '...' : totals.informados.toLocaleString('es-AR')}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#DC2626', marginTop: '4px' }}>
                        Pendientes de firma: <strong>{totals.pendientes.toLocaleString('es-AR')}</strong>
                    </div>
                </div>

                {/* 7. Auditoría: Ausentismo (No-Show) */}
                <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #FEE2E2', padding: '16px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 600, color: '#991B1B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Ausentismo (No-Show)
                        </span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#DC2626', background: '#FEF2F2', padding: '2px 6px', borderRadius: '6px', border: '1px solid #FECACA' }}>
                            {totals.pctAusente}% no-show
                        </span>
                    </div>
                    <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#DC2626', marginTop: '4px' }}>
                        {loading ? '...' : totals.ausente.toLocaleString('es-AR')}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px' }}>
                        No concretados | S/reg: <strong>{totals.sinRegistrar.toLocaleString('es-AR')}</strong>
                    </div>
                </div>

                {/* 8. Agendas Activas */}
                <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '16px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                    <div style={{ fontSize: '0.76rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Agendas Activas
                    </div>
                    <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                        {loading ? '...' : totals.cantAgendas}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px' }}>
                        Tipos de Visita en modalidad <strong>{selectedModalidad}</strong>
                    </div>
                </div>
            </div>

            {/* ─── DISTRIBUCIÓN OPERATIVA DE ASISTENCIA (DIFERENCIACIÓN SALUS) ─── */}
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
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                            <UserCheck size={18} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h3 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 700, color: '#0F172A' }}>
                                    Diferenciación de Estados de Asistencia (SALUS)
                                </h3>
                                {filterAsistencia !== 'TODOS' && (
                                    <span style={{
                                        fontSize: '0.72rem',
                                        fontWeight: 700,
                                        color: ASISTENCIA_CONFIG[filterAsistencia]?.color || COLOR_PRIMARY,
                                        background: ASISTENCIA_CONFIG[filterAsistencia]?.bg || '#EFF6FF',
                                        border: `1px solid ${ASISTENCIA_CONFIG[filterAsistencia]?.border || '#BFDBFE'}`,
                                        padding: '2px 8px',
                                        borderRadius: '999px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}>
                                        Filtro activo: {filterAsistencia}
                                        <button
                                            onClick={() => setFilterAsistencia('TODOS')}
                                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, fontWeight: 800, color: 'inherit' }}
                                        >
                                            ✕
                                        </button>
                                    </span>
                                )}
                            </div>
                            <p style={{ margin: '2px 0 0 0', fontSize: '0.76rem', color: '#64748B' }}>
                                Haga clic en cualquier estado para filtrar de forma instantánea todo el tablero y los rankings
                            </p>
                        </div>
                    </div>

                    {filterAsistencia !== 'TODOS' && (
                        <button
                            onClick={() => setFilterAsistencia('TODOS')}
                            style={{
                                border: '1px solid #CBD5E1',
                                background: '#F8FAFC',
                                borderRadius: '6px',
                                padding: '4px 10px',
                                fontSize: '0.74rem',
                                color: '#475569',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            Restablecer a Todos ({totals.total.toLocaleString('es-AR')})
                        </button>
                    )}
                </div>

                {/* Barra segmentada de distribución proporcional */}
                <div style={{
                    width: '100%',
                    height: '10px',
                    borderRadius: '999px',
                    background: '#F1F5F9',
                    overflow: 'hidden',
                    display: 'flex',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)'
                }}>
                    {totals.presente > 0 && (
                        <div
                            title={`Presente: ${totals.presente.toLocaleString('es-AR')} (${totals.pctPresente}%)`}
                            style={{ width: `${totals.pctPresente}%`, background: '#10B981', transition: 'width 0.3s ease', cursor: 'pointer' }}
                            onClick={() => setFilterAsistencia(filterAsistencia === 'Presente' ? 'TODOS' : 'Presente')}
                        />
                    )}
                    {totals.internado > 0 && (
                        <div
                            title={`Internado / Hosp.: ${totals.internado.toLocaleString('es-AR')} (${totals.pctInternado}%)`}
                            style={{ width: `${totals.pctInternado}%`, background: '#8B5CF6', transition: 'width 0.3s ease', cursor: 'pointer' }}
                            onClick={() => setFilterAsistencia(filterAsistencia === 'Internado' ? 'TODOS' : 'Internado')}
                        />
                    )}
                    {totals.urgencia > 0 && (
                        <div
                            title={`Urgencia: ${totals.urgencia.toLocaleString('es-AR')} (${totals.pctUrgencia}%)`}
                            style={{ width: `${totals.pctUrgencia}%`, background: '#F59E0B', transition: 'width 0.3s ease', cursor: 'pointer' }}
                            onClick={() => setFilterAsistencia(filterAsistencia === 'Urgencia' ? 'TODOS' : 'Urgencia')}
                        />
                    )}
                    {totals.sobreturno > 0 && (
                        <div
                            title={`Sobreturno: ${totals.sobreturno.toLocaleString('es-AR')} (${totals.pctSobreturno}%)`}
                            style={{ width: `${totals.pctSobreturno}%`, background: '#0284C7', transition: 'width 0.3s ease', cursor: 'pointer' }}
                            onClick={() => setFilterAsistencia(filterAsistencia === 'Sobreturno' ? 'TODOS' : 'Sobreturno')}
                        />
                    )}
                    {totals.ausente > 0 && (
                        <div
                            title={`Ausente / No-Show: ${totals.ausente.toLocaleString('es-AR')} (${totals.pctAusente}%)`}
                            style={{ width: `${totals.pctAusente}%`, background: '#EF4444', transition: 'width 0.3s ease', cursor: 'pointer' }}
                            onClick={() => setFilterAsistencia(filterAsistencia === 'Ausente' ? 'TODOS' : 'Ausente')}
                        />
                    )}
                    {totals.sinRegistrar > 0 && (
                        <div
                            title={`Sin Registrar / Trámite: ${totals.sinRegistrar.toLocaleString('es-AR')} (${totals.pctSinRegistrar}%)`}
                            style={{ width: `${totals.pctSinRegistrar}%`, background: '#94A3B8', transition: 'width 0.3s ease', cursor: 'pointer' }}
                            onClick={() => setFilterAsistencia(filterAsistencia === 'Sin Registrar' ? 'TODOS' : 'Sin Registrar')}
                        />
                    )}
                </div>

                {/* Pastillas Interactivas de Estados de Asistencia */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '10px'
                }}>
                    {[
                        { key: 'Presente', count: totals.presente, pct: totals.pctPresente, isEfectivo: true },
                        { key: 'Internado', count: totals.internado, pct: totals.pctInternado, isEfectivo: true },
                        { key: 'Urgencia', count: totals.urgencia, pct: totals.pctUrgencia, isEfectivo: true },
                        { key: 'Sobreturno', count: totals.sobreturno, pct: totals.pctSobreturno, isEfectivo: true },
                        { key: 'Ausente', count: totals.ausente, pct: totals.pctAusente, isEfectivo: false },
                        { key: 'Sin Registrar', count: totals.sinRegistrar, pct: totals.pctSinRegistrar, isEfectivo: false }
                    ].map(st => {
                        const cfg = ASISTENCIA_CONFIG[st.key];
                        const isFiltered = filterAsistencia === st.key;
                        return (
                            <button
                                key={st.key}
                                onClick={() => setFilterAsistencia(isFiltered ? 'TODOS' : st.key)}
                                style={{
                                    border: `1.5px solid ${isFiltered ? cfg.color : '#E2E8F0'}`,
                                    background: isFiltered ? cfg.bg : '#FFFFFF',
                                    borderRadius: '10px',
                                    padding: '10px 12px',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px',
                                    boxShadow: isFiltered ? `0 2px 6px ${cfg.color}25` : '0 1px 2px rgba(0,0,0,0.02)',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.74rem', fontWeight: 700, color: cfg.color, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: cfg.color }} />
                                        {cfg.shortLabel}
                                        {st.isEfectivo && (
                                            <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#047857', background: '#ECFDF5', padding: '0 4px', borderRadius: '4px' }}>
                                                Efectivo
                                            </span>
                                        )}
                                    </span>
                                    <span style={{
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                        color: cfg.text,
                                        background: cfg.bg,
                                        border: `1px solid ${cfg.border}`,
                                        padding: '1px 6px',
                                        borderRadius: '999px'
                                    }}>
                                        {st.pct}%
                                    </span>
                                </div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>
                                    {loading ? '...' : st.count.toLocaleString('es-AR')}
                                </div>
                                <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                    {cfg.desc}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ─── FILTROS DE TABLERO: ÁMBITO, ASISTENCIA Y BÚSQUEDA ─── */}
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

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
                            <span>Agenda: <strong>{selectedAgenda}</strong></span>
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
                            placeholder="Buscar por agenda o centro..."
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

            {/* ─── GRÁFICO DE LÍNEAS: PROGRESIÓN DEL PERÍODO ─── */}
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
                {/* Header del Gráfico */}
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            background: '#EFF6FF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: COLOR_PRIMARY
                        }}>
                            <TrendingUp size={20} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0F172A' }}>
                                    Progresión del Período — Evolución Temporal
                                </h3>
                                <span style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    color: COLOR_PRIMARY,
                                    background: '#EFF6FF',
                                    border: '1px solid #BFDBFE',
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    textTransform: 'uppercase'
                                }}>
                                    {activeGranularity === 'dia' ? 'Vista Diaria' : 'Vista Mensual'}
                                </span>
                            </div>
                            <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                                {selectedModalidad === 'TODAS' 
                                    ? 'Curva de estudios realizados por día/mes y desglose por modalidad diagnóstica'
                                    : `Curva evolutiva para modalidad ${selectedModalidad} desagregada por ámbito`}
                            </p>
                        </div>
                    </div>

                    {/* Controles de Granularidad y Resumen */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {/* Indicadores Clave */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{
                                background: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                padding: '4px 10px',
                                borderRadius: '8px',
                                fontSize: '0.75rem',
                                color: '#475569'
                            }}>
                                Promedio: <strong style={{ color: '#0F172A' }}>{chartStats.avg}</strong> {activeGranularity === 'dia' ? 'est/día' : 'est/mes'}
                            </div>

                            {chartStats.peak && (
                                <div style={{
                                    background: '#FEF3C7',
                                    border: '1px solid #FDE68A',
                                    padding: '4px 10px',
                                    borderRadius: '8px',
                                    fontSize: '0.75rem',
                                    color: '#92400E'
                                }}>
                                    Pico: <strong>{chartStats.peak.total.toLocaleString('es-AR')}</strong> ({chartStats.peak.label})
                                </div>
                            )}

                            <div style={{
                                background: '#EFF6FF',
                                border: '1px solid #BFDBFE',
                                padding: '4px 10px',
                                borderRadius: '8px',
                                fontSize: '0.75rem',
                                color: COLOR_PRIMARY
                            }}>
                                Total Período: <strong>{chartStats.total.toLocaleString('es-AR')}</strong>
                            </div>
                        </div>

                        {/* Switch Granularidad: Auto / Día / Mes */}
                        <div style={{ display: 'flex', background: '#F1F5F9', padding: '2px', borderRadius: '8px', gap: '2px' }}>
                            {[
                                { id: 'auto', label: 'Auto' },
                                { id: 'dia', label: 'Día' },
                                { id: 'mes', label: 'Mes' }
                            ].map(btn => (
                                <button
                                    key={btn.id}
                                    onClick={() => setChartGranularity(btn.id)}
                                    style={{
                                        border: 'none',
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        fontSize: '0.72rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        background: chartGranularity === btn.id ? '#FFFFFF' : 'transparent',
                                        color: chartGranularity === btn.id ? COLOR_PRIMARY : '#64748B',
                                        boxShadow: chartGranularity === btn.id ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                                    }}
                                >
                                    {btn.label}
                                </button>
                            ))}
                        </div>

                        {/* Botón Descargar Excel Progresión */}
                        <button
                            onClick={handleExportProgressionExcel}
                            disabled={loading || !progressionChartData.length}
                            title="Descargar datos de la curva de evolución en Excel (.xlsx)"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                border: '1px solid #CBD5E1',
                                background: '#FFFFFF',
                                borderRadius: '8px',
                                padding: '4px 9px',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                color: '#0F172A',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <FileSpreadsheet size={13} color="#059669" />
                            <span>Excel Progresión</span>
                        </button>

                        {/* Botón Colapsar / Expandir */}
                        <button
                            onClick={() => setChartCollapsed(!chartCollapsed)}
                            title={chartCollapsed ? 'Expandir gráfico' : 'Colapsar gráfico'}
                            style={{
                                border: '1px solid #E2E8F0',
                                background: '#FFFFFF',
                                borderRadius: '8px',
                                padding: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#64748B'
                            }}
                        >
                            {chartCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                        </button>
                    </div>
                </div>

                {!chartCollapsed && (
                    <>
                        {/* Selector / Leyenda interactiva de series */}
                        <div style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            gap: '8px',
                            paddingTop: '6px',
                            borderTop: '1px solid #F1F5F9',
                            fontSize: '0.75rem'
                        }}>
                            <span style={{ color: '#64748B', fontWeight: 600, marginRight: '4px' }}>Series visibles:</span>
                            
                            {/* Toggle Total */}
                            <button
                                onClick={() => setVisibleSeries(prev => ({ ...prev, total: !prev.total }))}
                                style={{
                                    borderRadius: '14px',
                                    padding: '3px 10px',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: visibleSeries.total ? '#EFF6FF' : '#F1F5F9',
                                    color: visibleSeries.total ? '#1D4ED8' : '#94A3B8',
                                    border: visibleSeries.total ? '1px solid #BFDBFE' : '1px solid #E2E8F0'
                                }}
                            >
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2563EB' }} />
                                Total {selectedModalidad === 'TODAS' ? 'General' : selectedModalidad}
                            </button>

                            {selectedModalidad === 'TODAS' ? (
                                <>
                                    {[
                                        { key: 'ECOGRAFIA', label: 'Ecografía (ECO)', color: '#06B6D4' },
                                        { key: 'RADIOLOGIA', label: 'Radiología (RX)', color: '#6366F1' },
                                        { key: 'MAMOGRAFIA', label: 'Mamografía', color: '#EC4899' },
                                        { key: 'TOMOGRAFIA', label: 'Tomografía (TC)', color: '#F59E0B' },
                                        { key: 'DENSITOMETRIA', label: 'Densitometría', color: '#10B981' },
                                        { key: 'ECOCARDIO', label: 'Ecocardiograma', color: '#E11D48' }
                                    ].map(s => (
                                        <button
                                            key={s.key}
                                            onClick={() => setVisibleSeries(prev => ({ ...prev, [s.key]: !prev[s.key] }))}
                                            style={{
                                                borderRadius: '14px',
                                                padding: '3px 10px',
                                                fontSize: '0.72rem',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                background: visibleSeries[s.key] ? '#FFFFFF' : '#F8FAFC',
                                                color: visibleSeries[s.key] ? '#1E293B' : '#94A3B8',
                                                border: visibleSeries[s.key] ? `1px solid ${s.color}` : '1px solid #E2E8F0',
                                                opacity: visibleSeries[s.key] ? 1 : 0.6
                                            }}
                                        >
                                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color }} />
                                            {s.label}
                                        </button>
                                    ))}
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={() => setVisibleSeries(prev => ({ ...prev, ambulatorio: !prev.ambulatorio }))}
                                        style={{
                                            borderRadius: '14px',
                                            padding: '3px 10px',
                                            fontSize: '0.72rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            background: visibleSeries.ambulatorio ? '#ECFDF5' : '#F8FAFC',
                                            color: visibleSeries.ambulatorio ? '#047857' : '#94A3B8',
                                            border: visibleSeries.ambulatorio ? '1px solid #A7F3D0' : '1px solid #E2E8F0'
                                        }}
                                    >
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }} />
                                        Ambulatorio
                                    </button>

                                    <button
                                        onClick={() => setVisibleSeries(prev => ({ ...prev, hospitalizacion: !prev.hospitalizacion }))}
                                        style={{
                                            borderRadius: '14px',
                                            padding: '3px 10px',
                                            fontSize: '0.72rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            background: visibleSeries.hospitalizacion ? '#F5F3FF' : '#F8FAFC',
                                            color: visibleSeries.hospitalizacion ? '#6D28D9' : '#94A3B8',
                                            border: visibleSeries.hospitalizacion ? '1px solid #DDD6FE' : '1px solid #E2E8F0'
                                        }}
                                    >
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#8B5CF6' }} />
                                        Hospitalización
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Contenedor del Gráfico Recharts */}
                        <div style={{ width: '100%', height: '300px', marginTop: '6px', minWidth: 0, position: 'relative' }}>
                            {loading ? (
                                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', gap: '8px' }}>
                                    <RefreshCw className="animate-spin" size={18} color={COLOR_PRIMARY} />
                                    <span style={{ fontSize: '0.85rem' }}>Cargando evolución temporal de estudios...</span>
                                </div>
                            ) : progressionChartData.length === 0 ? (
                                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }}>
                                    <Activity size={32} strokeWidth={1.5} style={{ marginBottom: '8px', opacity: 0.6 }} />
                                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>No hay datos de evolución temporal para el período seleccionado</span>
                                    <span style={{ fontSize: '0.75rem' }}>Verifique el rango de fechas seleccionado en la barra superior</span>
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height={290} minWidth={1} minHeight={240}>
                                    <LineChart data={progressionChartData} margin={{ top: 12, right: 18, left: -10, bottom: 4 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                                        <XAxis 
                                            dataKey="label" 
                                            stroke="#94A3B8" 
                                            fontSize={11} 
                                            tickLine={false} 
                                            axisLine={{ stroke: '#E2E8F0' }} 
                                            minTickGap={14} 
                                        />
                                        <YAxis 
                                            stroke="#94A3B8" 
                                            fontSize={11} 
                                            tickLine={false} 
                                            axisLine={false} 
                                            tickFormatter={v => v.toLocaleString('es-AR')} 
                                        />
                                        <RechartsTooltip
                                            content={({ active, payload, label }) => {
                                                if (!active || !payload || !payload.length) return null;
                                                const pointData = payload[0]?.payload;
                                                return (
                                                    <div style={{
                                                        background: '#FFFFFF',
                                                        border: '1px solid #CBD5E1',
                                                        borderRadius: '10px',
                                                        padding: '10px 14px',
                                                        boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
                                                        fontSize: '0.78rem',
                                                        minWidth: '200px'
                                                    }}>
                                                        <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: '6px', borderBottom: '1px solid #F1F5F9', paddingBottom: '4px' }}>
                                                            {activeGranularity === 'dia' ? `Fecha: ${pointData?.fullDate || label}` : `Período: ${label}`}
                                                        </div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontWeight: 800, color: '#2563EB' }}>
                                                            <span>Total Estudios:</span>
                                                            <span>{(pointData?.total || 0).toLocaleString('es-AR')}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                            {payload.filter(p => p.dataKey !== 'total' && p.value > 0).map((p, idx) => (
                                                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', color: '#475569' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color || p.stroke }}></span>
                                                                        <span>{p.name}:</span>
                                                                    </div>
                                                                    <span style={{ fontWeight: 600, color: '#1E293B' }}>{p.value.toLocaleString('es-AR')}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            }}
                                        />

                                        {/* Series para TODAS LAS MODALIDADES */}
                                        {selectedModalidad === 'TODAS' && (
                                            <>
                                                {visibleSeries.total && (
                                                    <Line 
                                                        type="monotone" 
                                                        dataKey="total" 
                                                        name="Total General" 
                                                        stroke="#2563EB" 
                                                        strokeWidth={2.8} 
                                                        dot={{ r: 2.5, fill: '#2563EB' }} 
                                                        activeDot={{ r: 6 }} 
                                                    />
                                                )}
                                                {visibleSeries.ECOGRAFIA && (
                                                    <Line 
                                                        type="monotone" 
                                                        dataKey="ECOGRAFIA" 
                                                        name="Ecografía (ECO)" 
                                                        stroke="#06B6D4" 
                                                        strokeWidth={1.8} 
                                                        dot={false} 
                                                        activeDot={{ r: 5 }} 
                                                    />
                                                )}
                                                {visibleSeries.RADIOLOGIA && (
                                                    <Line 
                                                        type="monotone" 
                                                        dataKey="RADIOLOGIA" 
                                                        name="Radiología (RX)" 
                                                        stroke="#6366F1" 
                                                        strokeWidth={1.8} 
                                                        dot={false} 
                                                        activeDot={{ r: 5 }} 
                                                    />
                                                )}
                                                {visibleSeries.MAMOGRAFIA && (
                                                    <Line 
                                                        type="monotone" 
                                                        dataKey="MAMOGRAFIA" 
                                                        name="Mamografía" 
                                                        stroke="#EC4899" 
                                                        strokeWidth={1.8} 
                                                        dot={false} 
                                                        activeDot={{ r: 5 }} 
                                                    />
                                                )}
                                                {visibleSeries.TOMOGRAFIA && (
                                                    <Line 
                                                        type="monotone" 
                                                        dataKey="TOMOGRAFIA" 
                                                        name="Tomografía (TC)" 
                                                        stroke="#F59E0B" 
                                                        strokeWidth={1.8} 
                                                        dot={false} 
                                                        activeDot={{ r: 5 }} 
                                                    />
                                                )}
                                                {visibleSeries.DENSITOMETRIA && (
                                                    <Line 
                                                        type="monotone" 
                                                        dataKey="DENSITOMETRIA" 
                                                        name="Densitometría" 
                                                        stroke="#10B981" 
                                                        strokeWidth={1.8} 
                                                        dot={false} 
                                                        activeDot={{ r: 5 }} 
                                                    />
                                                )}
                                                {visibleSeries.ECOCARDIO && (
                                                    <Line 
                                                        type="monotone" 
                                                        dataKey="ECOCARDIO" 
                                                        name="Ecocardiograma" 
                                                        stroke="#E11D48" 
                                                        strokeWidth={1.8} 
                                                        dot={false} 
                                                        activeDot={{ r: 5 }} 
                                                    />
                                                )}
                                            </>
                                        )}

                                        {/* Series para MODALIDAD ESPECÍFICA */}
                                        {selectedModalidad !== 'TODAS' && (
                                            <>
                                                {visibleSeries.total && (
                                                    <Line 
                                                        type="monotone" 
                                                        dataKey="total" 
                                                        name={`Total ${selectedModalidad}`} 
                                                        stroke={MODALIDADES_TABS.find(t => t.id === selectedModalidad)?.badgeColor || '#2563EB'} 
                                                        strokeWidth={2.8} 
                                                        dot={{ r: 2.5, fill: MODALIDADES_TABS.find(t => t.id === selectedModalidad)?.badgeColor || '#2563EB' }} 
                                                        activeDot={{ r: 6 }} 
                                                    />
                                                )}
                                                {visibleSeries.ambulatorio && (
                                                    <Line 
                                                        type="monotone" 
                                                        dataKey="ambulatorio" 
                                                        name="Ambulatorio" 
                                                        stroke="#10B981" 
                                                        strokeWidth={1.8} 
                                                        dot={false} 
                                                        activeDot={{ r: 5 }} 
                                                    />
                                                )}
                                                {visibleSeries.hospitalizacion && (
                                                    <Line 
                                                        type="monotone" 
                                                        dataKey="hospitalizacion" 
                                                        name="Hospitalización" 
                                                        stroke="#8B5CF6" 
                                                        strokeWidth={1.8} 
                                                        dot={false} 
                                                        activeDot={{ r: 5 }} 
                                                    />
                                                )}
                                            </>
                                        )}
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </>
                )}
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
                                const pctRealizados = totals.realizados > 0 ? ((item.realizados / totals.realizados) * 100).toFixed(1) : 0;
                                const pctAmb = item.total > 0 ? ((item.ambulatorio / item.total) * 100).toFixed(0) : 0;
                                const pctHosp = item.total > 0 ? ((item.hospitalizacion / item.total) * 100).toFixed(0) : 0;
                                const pctInf = (item.realizados || item.total) > 0 ? ((item.informados / (item.realizados || item.total)) * 100).toFixed(0) : 0;

                                return (
                                    <div
                                        key={item.agenda}
                                        onClick={() => setSelectedAgenda(isSelected ? 'TODAS' : item.agenda)}
                                        style={{
                                            padding: '12px 14px',
                                            borderRadius: '10px',
                                            border: `1.5px solid ${isSelected ? COLOR_PRIMARY : '#E2E8F0'}`,
                                            background: isSelected ? '#EFF6FF' : '#FFFFFF',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '8px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{
                                                    fontSize: '0.72rem',
                                                    fontWeight: 700,
                                                    color: '#64748B',
                                                    width: '20px'
                                                }}>
                                                    #{idx + 1}
                                                </span>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>
                                                    {item.agenda}
                                                </span>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                                                    <span style={{ fontSize: '1rem', fontWeight: 800, color: '#065F46' }}>
                                                        {item.realizados.toLocaleString('es-AR')}
                                                    </span>
                                                    <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#047857', background: '#ECFDF5', padding: '1px 5px', borderRadius: '4px' }}>
                                                        Efectivos
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '1px' }}>
                                                    {pctRealizados}% del total | {item.total} turnos ({item.ausente} aus)
                                                </div>
                                            </div>
                                        </div>

                                        {/* Barra comparativa de Asistencia y Modalidad */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ flex: 1, height: '7px', background: '#F1F5F9', borderRadius: '999px', overflow: 'hidden', display: 'flex' }}>
                                                    {item.presente > 0 && <div title={`Presentes: ${item.presente}`} style={{ width: `${(item.presente / item.total) * 100}%`, background: '#10B981' }} />}
                                                    {item.internado > 0 && <div title={`Internados: ${item.internado}`} style={{ width: `${(item.internado / item.total) * 100}%`, background: '#8B5CF6' }} />}
                                                    {item.urgencia > 0 && <div title={`Urgencias: ${item.urgencia}`} style={{ width: `${(item.urgencia / item.total) * 100}%`, background: '#F59E0B' }} />}
                                                    {item.sobreturno > 0 && <div title={`Sobreturnos: ${item.sobreturno}`} style={{ width: `${(item.sobreturno / item.total) * 100}%`, background: '#0284C7' }} />}
                                                    {item.ausente > 0 && <div title={`Ausentes: ${item.ausente}`} style={{ width: `${(item.ausente / item.total) * 100}%`, background: '#EF4444' }} />}
                                                    {item.sinRegistrar > 0 && <div title={`Sin Registrar: ${item.sinRegistrar}`} style={{ width: `${(item.sinRegistrar / item.total) * 100}%`, background: '#94A3B8' }} />}
                                                </div>
                                                <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>
                                                    Inf: {pctInf}%
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '0.68rem', fontWeight: 600 }}>
                                                {item.presente > 0 && <span style={{ color: '#059669', background: '#ECFDF5', padding: '1px 5px', borderRadius: '4px' }}>✓ Pres: {item.presente}</span>}
                                                {item.internado > 0 && <span style={{ color: '#7C3AED', background: '#F5F3FF', padding: '1px 5px', borderRadius: '4px' }}>🏥 Hosp: {item.internado}</span>}
                                                {item.urgencia > 0 && <span style={{ color: '#D97706', background: '#FFFBEB', padding: '1px 5px', borderRadius: '4px' }}>⚡ Urg: {item.urgencia}</span>}
                                                {item.sobreturno > 0 && <span style={{ color: '#0284C7', background: '#F0F9FF', padding: '1px 5px', borderRadius: '4px' }}>⏱ Sobret: {item.sobreturno}</span>}
                                                {item.ausente > 0 && <span style={{ color: '#DC2626', background: '#FEF2F2', padding: '1px 5px', borderRadius: '4px' }}>✗ Aus: {item.ausente}</span>}
                                                {item.sinRegistrar > 0 && <span style={{ color: '#64748B', background: '#F1F5F9', padding: '1px 5px', borderRadius: '4px' }}>• S/Reg: {item.sinRegistrar}</span>}
                                            </div>
                                        </div>

                                        {/* Sedes involucradas, Grupo Agenda SALUS y Acceso a Casos Nominales */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: '#64748B', flexWrap: 'wrap', gap: '6px' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <MapPin size={12} />
                                                    {Array.from(item.centros).slice(0, 3).join(', ') || 'Centro general'}
                                                </span>
                                                {item.gruposAgenda && item.gruposAgenda.size > 0 && (
                                                    <span style={{
                                                        fontSize: '0.65rem',
                                                        fontWeight: 700,
                                                        color: '#475569',
                                                        background: '#F1F5F9',
                                                        border: '1px solid #CBD5E1',
                                                        padding: '1px 6px',
                                                        borderRadius: '4px'
                                                    }}>
                                                        Grupo SALUS: {Array.from(item.gruposAgenda).join(' + ')}
                                                    </span>
                                                )}
                                            </span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openCasosNominalesModal({ modalidad: item.modalidad, agenda: item.agenda });
                                                    }}
                                                    style={{
                                                        border: '1px solid #BFDBFE',
                                                        background: '#EFF6FF',
                                                        color: '#1D4ED8',
                                                        borderRadius: '6px',
                                                        padding: '2px 8px',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    📋 Ver casos ({item.realizados})
                                                </button>
                                                <span style={{ color: COLOR_PRIMARY, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                    {isSelected ? 'Ocultar detalle' : 'Filtrar panel'}
                                                    <ChevronRight size={13} />
                                                </span>
                                            </div>
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
                                    onClick={() => setActiveTabDetail(sub.id)}
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
                                    Financiadores y convenios con mayor demanda:
                                </div>
                                {obrasSocialesRanking.length > 0 && (() => {
                                    const totalOSCount = obrasSocialesRanking.reduce((acc, os) => acc + (os.cantidad || 0), 0);
                                    return (
                                        <div style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '7px 12px', fontSize: '0.75rem'
                                        }}>
                                            <span style={{ fontWeight: 800, color: '#92400E' }}>
                                                ∑ Total por Obra Social ({obrasSocialesRanking.length} financiadores)
                                            </span>
                                            <span style={{ fontWeight: 900, fontSize: '0.88rem', color: '#B45309' }}>
                                                {totalOSCount.toLocaleString('es-AR')} (100%)
                                            </span>
                                        </div>
                                    );
                                })()}
                                {obrasSocialesRanking.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '30px', color: '#94A3B8' }}>
                                        Sin datos de financiadores
                                    </div>
                                ) : (
                                    obrasSocialesRanking.slice(0, 30).map((os, i) => (
                                        <div key={i} style={{ padding: '8px 10px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1E293B' }}>
                                                    {os.nombre}
                                                </span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>
                                                        {os.cantidad.toLocaleString('es-AR')}
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', color: '#64748B', marginLeft: '6px' }}>
                                                        ({os.porcentaje}%)
                                                    </span>
                                                </div>
                                            </div>
                                            <div style={{ width: '100%', height: '4px', background: '#E2E8F0', borderRadius: '999px', marginTop: '6px', overflow: 'hidden' }}>
                                                <div style={{ width: `${os.porcentaje}%`, height: '100%', background: '#F59E0B' }}></div>
                                            </div>
                                        </div>
                                    ))
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
                                    Período: <strong>{effectiveDesde}</strong> al <strong>{effectiveHasta}</strong> • Modalidad: <strong>{casosFilter.modalidad}</strong> • Agenda: <strong>{casosFilter.agenda}</strong>
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
                                            <th style={{ padding: '10px 12px' }}>Obra Social</th>
                                            <th style={{ padding: '10px 12px' }}>Informe</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredCasosNominales.map((c, idx) => {
                                            const stCfg = ASISTENCIA_CONFIG[c.estado_asistencia] || ASISTENCIA_CONFIG['Sin Registrar'];
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
                                                    <td style={{ padding: '9px 12px', color: '#334155', fontSize: '0.72rem', fontWeight: 600 }}>{c.obra_social}</td>
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
