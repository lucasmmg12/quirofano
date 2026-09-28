import React, { useState, useEffect, useMemo } from 'react';
import { 
    X, AlertTriangle, Clock, Download, Search, Filter, 
    FileSpreadsheet, FileText, CheckCircle2, ChevronRight,
    Users, ShieldAlert, ArrowUpDown, Stethoscope, BedDouble,
    Activity, Heart, Thermometer, Droplet, FileCheck, ClipboardList,
    Bed, FileCheck2, UserCheck, AlertCircle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx';

/**
 * GuardiaOutliersModal
 * Modal clínico interactivo para analizar valores extremos (outliers) y distribución
 * nominal de pacientes en cualquier gráfico del panel de Guardia Clínica.
 * Admite:
 * 1. Auditoría de demoras (outliers de tiempo y permanencia).
 * 2. Auditoría nominal completa de Triage (Protocolo 621, signos vitales y observaciones).
 * 3. Auditoría de Adherencia a Epicrisis en Altas Clínicas de Urgencias (Protocolo 382).
 */
export default function GuardiaOutliersModal({
    isOpen,
    onClose,
    chartType = 'tiempos_espera',
    periodo = '2026-09',
    periodoNombre = 'Septiembre 2026'
}) {
    const isTriage = chartType === 'triage_severidad' || chartType === 'triage_evolution';
    const isEpicrisis = chartType === 'adherencia_epicrisis';

    const [loading, setLoading] = useState(true);
    const [records, setRecords] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilter, setActiveFilter] = useState('all'); 
    const [sortBy, setSortBy] = useState(isTriage || isEpicrisis ? 'fecha_desc' : 'espera_desc');

    // Cargar pacientes nominales desde Supabase
    useEffect(() => {
        if (!isOpen) return;

        let isMounted = true;
        setLoading(true);
        setActiveFilter('all');
        setSortBy(isTriage || isEpicrisis ? 'fecha_desc' : 'espera_desc');

        const fetchData = async () => {
            try {
                const targetPeriodo = periodo === '2026-ANUAL' ? '2026-09' : periodo;

                if (isTriage) {
                    let query = supabase
                        .from('guardia_triage_pacientes')
                        .select('*');

                    if (periodo && periodo !== '2026-ANUAL') {
                        query = query.eq('periodo', targetPeriodo);
                    }

                    const { data, error } = await query
                        .order('fecha_visita', { ascending: false })
                        .order('hora_llegada', { ascending: false });

                    if (error) {
                        console.error('Error fetching guardia_triage_pacientes:', error.message);
                    } else if (isMounted) {
                        setRecords(data || []);
                    }
                } else if (isEpicrisis) {
                    let query = supabase
                        .from('guardia_epicrisis_altas')
                        .select('*');

                    if (periodo && periodo !== '2026-ANUAL') {
                        query = query.eq('periodo', targetPeriodo);
                    }

                    const { data, error } = await query
                        .order('fecha_ingreso', { ascending: false });

                    if (error) {
                        console.error('Error fetching guardia_epicrisis_altas:', error.message);
                    } else if (isMounted) {
                        setRecords(data || []);
                    }
                } else {
                    const { data, error } = await supabase
                        .from('guardia_consultas_tiempos')
                        .select('*')
                        .eq('periodo', targetPeriodo)
                        .order('minutos_espera', { ascending: false, nullsFirst: false });

                    if (error) {
                        console.error('Error fetching guardia_consultas_tiempos:', error.message);
                    } else if (isMounted) {
                        setRecords(data || []);
                    }
                }
            } catch (err) {
                console.error('Error in GuardiaOutliersModal:', err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchData();
        return () => { isMounted = false; };
    }, [isOpen, periodo, isTriage, isEpicrisis]);

    const chartConfig = useMemo(() => {
        switch(chartType) {
            case 'adherencia_epicrisis':
                return {
                    title: 'Auditoría Nominal de Altas Clínicas y Epicrisis (Protocolo 382)',
                    subtitle: 'Pacientes derivados de urgencias a internación clínica con estado de confección y firma de epicrisis médica',
                    badge: 'Auditoría Protocolo 382'
                };
            case 'triage_evolution':
            case 'triage_severidad':
                return {
                    title: 'Auditoría Nominal de Pacientes con Triage — Clasificación y Signos',
                    subtitle: 'Desglose caso por caso con nivel de severidad asignado, valores clínicos de signos y motivo registrado en enfermería',
                    badge: 'Auditoría Protocolo 621'
                };
            case 'conversion_cirugia':
                return {
                    title: 'Volumen de Consultas vs. Conversión Quirúrgica — Casos de Guardia',
                    subtitle: 'Auditoría nominal de pacientes y derivaciones de urgencia a quirófano',
                    badge: 'Conversión Quirúrgica'
                };
            case 'calidad_72h':
                return {
                    title: 'Indicadores de Calidad y Seguridad Clínica — Reconsultas & Reinternaciones',
                    subtitle: 'Seguimiento de seguridad de los pacientes asistidos en el circuito de urgencias',
                    badge: 'Calidad & Seguridad'
                };
            case 'destinos_postguardia':
                return {
                    title: 'Destinos Post-Guardia Efectivos — Casos y Derivaciones',
                    subtitle: 'Auditoría de egresos, pases a Quirófano, internación en Piso Clínico y UCI',
                    badge: 'Derivación Post-Guardia'
                };
            case 'tiempos_espera':
            default:
                return {
                    title: 'Curva de Tiempos de Oportunidad y Permanencia — Casos Extremos (Outliers)',
                    subtitle: 'Espera al médico (> 60m / > 90m) y permanencias prolongadas en guardia (> 3hs)',
                    badge: 'Detalle Extendido & Outliers'
                };
        }
    }, [chartType]);

    // Estadísticas de Outliers de Tiempo
    const stats = useMemo(() => {
        if (isTriage || isEpicrisis) return {};
        const total = records.length;
        const conEspera = records.filter(r => r.minutos_espera != null);
        const meta30 = conEspera.filter(r => r.minutos_espera <= 30).length;
        const demora30a60 = conEspera.filter(r => r.minutos_espera > 30 && r.minutos_espera <= 60).length;
        const demora60a90 = conEspera.filter(r => r.minutos_espera > 60 && r.minutos_espera <= 90).length;
        const critico90 = conEspera.filter(r => r.minutos_espera > 90).length;
        const outliersEsperaTotal = demora60a90 + critico90;
        const permMas3h = records.filter(r => r.minutos_permanencia != null && r.minutos_permanencia > 180).length;
        const maxEspera = conEspera.length > 0 ? Math.max(...conEspera.map(r => r.minutos_espera)) : 0;
        const avgEspera = conEspera.length > 0 ? Math.round(conEspera.reduce((acc, r) => acc + r.minutos_espera, 0) / conEspera.length) : 0;

        return {
            total,
            conEspera: conEspera.length,
            meta30,
            meta30Pct: total > 0 ? ((meta30 / total) * 100).toFixed(1) : '0',
            demora30a60,
            demora60a90,
            critico90,
            critico90Pct: total > 0 ? ((critico90 / total) * 100).toFixed(1) : '0',
            outliersEsperaTotal,
            outliersEsperaPct: total > 0 ? ((outliersEsperaTotal / total) * 100).toFixed(1) : '0',
            permMas3h,
            maxEspera,
            avgEspera
        };
    }, [records, isTriage, isEpicrisis]);

    // Estadísticas de Triage
    const triageStats = useMemo(() => {
        if (!isTriage) return {};
        const total = records.length;
        const n1Rojo = records.filter(r => (r.nivel_triage || '').toLowerCase().includes('rojo') || (r.nivel_triage || '').includes('N1')).length;
        const n2Naranja = records.filter(r => (r.nivel_triage || '').toLowerCase().includes('naranja') || (r.nivel_triage || '').includes('N2')).length;
        const n3Amarillo = records.filter(r => (r.nivel_triage || '').toLowerCase().includes('amarillo') || (r.nivel_triage || '').includes('N3')).length;
        const n4Verde = records.filter(r => (r.nivel_triage || '').toLowerCase().includes('verde') || (r.nivel_triage || '').includes('N4')).length;
        const n5Azul = records.filter(r => (r.nivel_triage || '').toLowerCase().includes('azul') || (r.nivel_triage || '').includes('N5')).length;
        const evaluados = records.filter(r => (r.nivel_triage || '').toLowerCase().includes('evaluado') || (r.nivel_triage || '').includes('Signos')).length;
        const conObs = records.filter(r => r.observacion_enfermeria && r.observacion_enfermeria.trim().length > 0).length;
        const conSignos = records.filter(r => r.ta_sistolica != null || r.fc != null || r.temperatura != null || r.sato2 != null).length;

        return {
            total,
            n1Rojo,
            n2Naranja,
            n3Amarillo,
            n4Verde,
            n5Azul,
            evaluados,
            conObs,
            conSignos
        };
    }, [records, isTriage]);

    // Estadísticas de Epicrisis
    const epicrisisStats = useMemo(() => {
        if (!isEpicrisis) return {};
        const total = records.length;
        const cerradas = records.filter(r => r.tiene_epicrisis).length;
        const pendientes = records.filter(r => !r.tiene_epicrisis).length;
        const adherenciaPct = total > 0 ? ((cerradas / total) * 100).toFixed(1) : '100.0';
        const avgEstada = total > 0 ? (records.reduce((acc, r) => acc + (r.dias_estada || 0), 0) / total).toFixed(1) : '0';

        return {
            total,
            cerradas,
            pendientes,
            adherenciaPct,
            avgEstada
        };
    }, [records, isEpicrisis]);

    // Filtrar y ordenar registros
    const filteredRecords = useMemo(() => {
        return records
            .filter(r => {
                // Filtro de búsqueda textual
                if (searchTerm.trim()) {
                    const term = searchTerm.toLowerCase();
                    const matchName = (r.paciente || '').toLowerCase().includes(term);
                    const matchNhc = (r.nhc || '').toLowerCase().includes(term);
                    const matchOs = (r.obra_social || '').toLowerCase().includes(term);
                    const matchObs = (r.observacion_enfermeria || '').toLowerCase().includes(term);
                    const matchNivel = (r.nivel_triage || '').toLowerCase().includes(term);
                    const matchDoc = (r.doctor || '').toLowerCase().includes(term);
                    const matchHab = (r.habitacion || '').toLowerCase().includes(term);
                    if (!matchName && !matchNhc && !matchOs && !matchObs && !matchNivel && !matchDoc && !matchHab) return false;
                }

                if (isTriage) {
                    if (activeFilter === 'n3_amarillo') {
                        return (r.nivel_triage || '').toLowerCase().includes('amarillo') || (r.nivel_triage || '').includes('N3');
                    }
                    if (activeFilter === 'n4_verde') {
                        return (r.nivel_triage || '').toLowerCase().includes('verde') || (r.nivel_triage || '').includes('N4');
                    }
                    if (activeFilter === 'evaluados') {
                        return (r.nivel_triage || '').toLowerCase().includes('evaluado') || (r.nivel_triage || '').includes('Signos');
                    }
                    if (activeFilter === 'con_obs') {
                        return r.observacion_enfermeria && r.observacion_enfermeria.trim().length > 0;
                    }
                    if (activeFilter === 'con_signos') {
                        return r.ta_sistolica != null || r.fc != null || r.temperatura != null || r.sato2 != null;
                    }
                    return true;
                }

                if (isEpicrisis) {
                    if (activeFilter === 'cerradas') {
                        return r.tiene_epicrisis === true;
                    }
                    if (activeFilter === 'pendientes') {
                        return r.tiene_epicrisis === false;
                    }
                    return true;
                }

                // Filtro por categoría de outlier de tiempo
                if (activeFilter === 'outliers_all') {
                    return (r.minutos_espera != null && r.minutos_espera > 60) || (r.minutos_permanencia != null && r.minutos_permanencia > 180);
                }
                if (activeFilter === 'criticos_90') {
                    return r.minutos_espera != null && r.minutos_espera > 90;
                }
                if (activeFilter === 'demoras_60') {
                    return r.minutos_espera != null && r.minutos_espera > 60 && r.minutos_espera <= 90;
                }
                if (activeFilter === 'perm_3h') {
                    return r.minutos_permanencia != null && r.minutos_permanencia > 180;
                }
                if (activeFilter === 'meta_30') {
                    return r.minutos_espera != null && r.minutos_espera <= 30;
                }
                return true;
            })
            .sort((a, b) => {
                if (isTriage) {
                    if (sortBy === 'fecha_desc') {
                        return (b.fecha_visita || '').localeCompare(a.fecha_visita || '') || (b.hora_llegada || '').localeCompare(a.hora_llegada || '');
                    }
                    if (sortBy === 'fecha_asc') {
                        return (a.fecha_visita || '').localeCompare(b.fecha_visita || '') || (a.hora_llegada || '').localeCompare(b.hora_llegada || '');
                    }
                    if (sortBy === 'paciente_asc') {
                        return (a.paciente || '').localeCompare(b.paciente || '');
                    }
                    if (sortBy === 'severidad_desc') {
                        const score = (r) => {
                            const niv = (r.nivel_triage || '').toLowerCase();
                            if (niv.includes('rojo')) return 5;
                            if (niv.includes('naranja')) return 4;
                            if (niv.includes('amarillo')) return 3;
                            if (niv.includes('verde')) return 2;
                            if (niv.includes('azul')) return 1;
                            return 0;
                        };
                        return score(b) - score(a);
                    }
                    return 0;
                }

                if (isEpicrisis) {
                    if (sortBy === 'fecha_desc') {
                        return (b.fecha_ingreso || '').localeCompare(a.fecha_ingreso || '');
                    }
                    if (sortBy === 'fecha_asc') {
                        return (a.fecha_ingreso || '').localeCompare(b.fecha_ingreso || '');
                    }
                    if (sortBy === 'paciente_asc') {
                        return (a.paciente || '').localeCompare(b.paciente || '');
                    }
                    if (sortBy === 'estada_desc') {
                        return (b.dias_estada || 0) - (a.dias_estada || 0);
                    }
                    return 0;
                }

                if (sortBy === 'espera_desc') return (b.minutos_espera || 0) - (a.minutos_espera || 0);
                if (sortBy === 'perm_desc') return (b.minutos_permanencia || 0) - (a.minutos_permanencia || 0);
                if (sortBy === 'fecha_asc') return (a.fecha_visita || '').localeCompare(b.fecha_visita || '') || (a.hora_llegada || '').localeCompare(b.hora_llegada || '');
                if (sortBy === 'paciente_asc') return (a.paciente || '').localeCompare(b.paciente || '');
                return 0;
            });
    }, [records, searchTerm, activeFilter, sortBy, isTriage, isEpicrisis]);

    // ── Exportación a Excel ──
    const handleExportExcel = () => {
        const wb = XLSX.utils.book_new();

        if (isEpicrisis) {
            // Hoja 1: Resumen Epicrisis
            const summaryData = [
                ['SANATORIO ARGENTINO — AUDITORÍA DE CALIDAD & GOBERNANZA'],
                ['INFORME NOMINAL DE ALTAS CLÍNICAS Y ADHERENCIA A EPICRISIS (PROTOCOLO 382)'],
                [`Período Auditado: ${periodoNombre} (${periodo})`],
                [`Fecha de Extracción: ${new Date().toLocaleString('es-AR')}`],
                [`Filtro Activo en Reporte: ${activeFilter.toUpperCase()} | Total Registros: ${filteredRecords.length}`],
                [],
                ['MÉTRICA DE EPICRISIS', 'CANTIDAD AUDITADA', 'DISTRIBUCIÓN %', 'ESTÁNDAR INSTITUCIONAL'],
                ['Total Altas Clínicas (desde Guardia)', epicrisisStats.total, '100.0%', 'TABLEAU_Admisiones procedencia Urgencias'],
                ['Altas con Epicrisis Cerrada', epicrisisStats.cerradas, `${epicrisisStats.adherenciaPct}%`, 'Meta: 100% Obligatorio'],
                ['Altas Pendientes / Sin Epicrisis', epicrisisStats.pendientes, `${((epicrisisStats.pendientes / (epicrisisStats.total || 1)) * 100).toFixed(1)}%`, 'Desvío / Paciente aún en curso'],
                ['Estada Promedio en Piso Clínico', `${epicrisisStats.avgEstada} días`, '-', 'Benchmark: 1.5 - 2.5 días']
            ];
            const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
            XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen Epicrisis');

            // Hoja 2: Detalle Nominal
            const detailRows = filteredRecords.map((r, idx) => ({
                'N°': idx + 1,
                'Paciente': r.paciente,
                'NHC': r.nhc,
                'Obra Social': r.obra_social,
                'Fecha Ingreso': r.fecha_ingreso ? r.fecha_ingreso.replace('T', ' ').substring(0, 16) : '',
                'Fecha Alta': r.fecha_alta ? r.fecha_alta.replace('T', ' ').substring(0, 16) : 'Pendiente / Internado',
                'Días Estada': r.dias_estada ?? '',
                'Habitación': r.habitacion ?? '',
                'Médico a Cargo (Doctor)': r.doctor ?? '',
                'Usuario Alta': r.usuario_alta ?? '',
                'Proceso Clínico': r.proceso ?? '',
                'Motivo Alta': r.motivo_alta ?? 'Sin alta definitiva',
                'Estado Epicrisis': r.tiene_epicrisis ? 'Confeccionada / Cerrada' : 'Pendiente / Sin Epicrisis'
            }));
            const wsDetail = XLSX.utils.json_to_sheet(detailRows);
            XLSX.utils.book_append_sheet(wb, wsDetail, 'Altas Clínicas Detalladas');

            const fileName = `Guardia_Epicrisis_Altas_${periodo}_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(wb, fileName);
            return;
        }

        if (isTriage) {
            // Hoja 1: Resumen de Auditoría Triage
            const summaryData = [
                ['SANATORIO ARGENTINO — AUDITORÍA DE CALIDAD & GOBERNANZA'],
                ['INFORME NOMINAL DE PACIENTES CON TRIAGE DE ENFERMERÍA (PROTOCOLO 621)'],
                [`Período Auditado: ${periodoNombre} (${periodo})`],
                [`Fecha de Extracción: ${new Date().toLocaleString('es-AR')}`],
                [`Filtro Activo en Reporte: ${activeFilter.toUpperCase()} | Total Registros Exportados: ${filteredRecords.length}`],
                [],
                ['CATEGORÍA DE TRIAGE / EVALUACIÓN', 'CANTIDAD AUDITADA', 'DISTRIBUCIÓN %', 'CRITERIO INSTITUCIONAL'],
                ['Total Pacientes con Triage Registrado', triageStats.total, '100.0%', 'Protocolo 621 Salus'],
                ['N3 Amarillo (Urgente)', triageStats.n3Amarillo, `${((triageStats.n3Amarillo / (triageStats.total || 1)) * 100).toFixed(1)}%`, 'Atención en < 30 min'],
                ['N4 Verde (Poco Urgente)', triageStats.n4Verde, `${((triageStats.n4Verde / (triageStats.total || 1)) * 100).toFixed(1)}%`, 'Demanda ambulatoria'],
                ['Evaluado Clínico / Signos Vitales', triageStats.evaluados, `${((triageStats.evaluados / (triageStats.total || 1)) * 100).toFixed(1)}%`, 'Control de Signos Vitales sin código de color explícito'],
                ['Con Motivo / Síntoma Registrado en Observación', triageStats.conObs, `${((triageStats.conObs / (triageStats.total || 1)) * 100).toFixed(1)}%`, 'Texto de Enfermería registrado'],
                ['Con Signos Vitales Completos', triageStats.conSignos, `${((triageStats.conSignos / (triageStats.total || 1)) * 100).toFixed(1)}%`, 'Parámetros vitales registrados']
            ];
            const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
            XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen Triage');

            // Hoja 2: Detalle Nominal
            const detailRows = filteredRecords.map((r, idx) => ({
                'N°': idx + 1,
                'Paciente': r.paciente,
                'NHC': r.nhc,
                'Obra Social': r.obra_social,
                'Fecha Visita': r.fecha_visita,
                'Hora Llegada': r.hora_llegada,
                'Clasificación Triage': r.nivel_triage,
                'TA Sistólica (TS)': r.ta_sistolica ?? '',
                'TA Diastólica (TD)': r.ta_diastolica ?? '',
                'Tensión Arterial': (r.ta_sistolica && r.ta_diastolica) ? `${r.ta_sistolica}/${r.ta_diastolica} mmHg` : '',
                'Frecuencia Cardíaca (FC)': r.fc ? `${r.fc} bpm` : '',
                'Temperatura (Tº)': r.temperatura ? `${r.temperatura} ºC` : '',
                'Saturación O2 (SatO2)': r.sato2 ? `${r.sato2}%` : '',
                'Observación / Motivo Enfermería': r.observacion_enfermeria ?? '',
                'Agenda': r.agenda ?? 'GUARDIA CLINICA',
                'Tipo Visita': r.tipo_visita ?? ''
            }));
            const wsDetail = XLSX.utils.json_to_sheet(detailRows);
            XLSX.utils.book_append_sheet(wb, wsDetail, 'Pacientes Triageados');

            const fileName = `Guardia_Triage_Pacientes_${periodo}_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(wb, fileName);
            return;
        }

        // Hoja 1: Resumen de Auditoría Tiempos
        const summaryData = [
            ['SANATORIO ARGENTINO — AUDITORÍA DE CALIDAD & GOBERNANZA'],
            ['INFORME DE VALORES EXTREMOS (OUTLIERS) Y TIEMPOS DE ATENCIÓN EN GUARDIA'],
            [`Período Auditado: ${periodoNombre} (${periodo})`],
            [`Fecha de Extracción: ${new Date().toLocaleString('es-AR')}`],
            [`Filtro Activo en Reporte: ${activeFilter.toUpperCase()} | Total Registros Exportados: ${filteredRecords.length}`],
            [],
            ['MÉTRICA CLÍNICA DE OPORTUNIDAD', 'VALOR AUDITADO', 'DISTRIBUCIÓN %', 'ESTÁNDAR INSTITUCIONAL'],
            ['Total Consultas Analizadas', stats.total, '100.0%', 'Censo Completo de Urgencias'],
            ['Atención Inmediata / Dentro de Meta (<= 30 min)', stats.meta30, `${stats.meta30Pct}%`, 'Meta: >= 85.0%'],
            ['Demora Leve a Moderada (31 - 60 min)', stats.demora30a60, `${((stats.demora30a60 / stats.total) * 100).toFixed(1)}%`, 'Zona de Alerta Operativa'],
            ['Outliers - Demora Moderada (61 - 90 min)', stats.demora60a90, `${((stats.demora60a90 / stats.total) * 100).toFixed(1)}%`, 'Desvío de Oportunidad'],
            ['Outliers Críticos - Demora Extrema (> 90 min)', stats.critico90, `${stats.critico90Pct}%`, 'Desvío Crítico / Incidente'],
            ['Total Outliers de Espera al Médico (> 60 min)', stats.outliersEsperaTotal, `${stats.outliersEsperaPct}%`, 'Meta: <= 10.0%'],
            ['Estadía / Permanencia Prolongada (> 3 horas)', stats.permMas3h, `${((stats.permMas3h / stats.total) * 100).toFixed(1)}%`, 'Shockroom / Reevaluación'],
            ['Tiempo Máximo de Espera Registrado', `${stats.maxEspera} minutos`, '-', 'Causa Raíz Requerida'],
            ['Promedio Ponderado de Espera', `${stats.avgEspera} minutos`, '-', 'Meta: < 30 min']
        ];
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen Outliers');

        // Hoja 2: Detalle Nominal
        const detailRows = filteredRecords.map((r, idx) => ({
            'N°': idx + 1,
            'Paciente': r.paciente,
            'NHC': r.nhc,
            'Obra Social': r.obra_social,
            'Fecha Visita': r.fecha_visita,
            'Hora Llegada': r.hora_llegada,
            'Hora Atención Médico': r.hora_atencion || 'Sin registro',
            'Hora Egreso': r.hora_egreso || 'Sin registro',
            'Espera Médico (min)': r.minutos_espera != null ? r.minutos_espera : 'N/D',
            'Permanencia Total (min)': r.minutos_permanencia != null ? r.minutos_permanencia : 'N/D',
            'Clasificación Espera': r.minutos_espera == null ? 'Sin Dato' : r.minutos_espera <= 30 ? 'Dentro de Meta' : r.minutos_espera <= 60 ? 'Demora Leve' : r.minutos_espera <= 90 ? 'Outlier Moderado' : 'Outlier Crítico (>90m)',
            'Triage Real': r.nivel_triage,
            'Destino': r.destino
        }));
        const wsDetail = XLSX.utils.json_to_sheet(detailRows);
        XLSX.utils.book_append_sheet(wb, wsDetail, 'Pacientes Detallados');

        const fileName = `Guardia_Outliers_Tiempos_${periodo}_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    // ── Exportación a PDF ──
    const handleExportPdf = async () => {
        const { default: jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');

        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        // Membrete Institucional
        doc.setFillColor(37, 99, 235); // #2563EB Azul Institucional
        doc.rect(0, 0, 297, 18, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(255, 255, 255);
        doc.text('SANATORIO ARGENTINO — AUDITORÍA DE CALIDAD & GOBERNANZA CLÍNICA', 14, 11);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Período Auditado: ${periodoNombre} (${periodo}) | Emitido: ${new Date().toLocaleDateString('es-AR')}`, 297 - 14, 11, { align: 'right' });

        if (isEpicrisis) {
            // Título de Epicrisis
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('AUDITORÍA NOMINAL DE ADHERENCIA A EPICRISIS (PROTOCOLO 382)', 14, 26);

            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 116, 139);
            doc.text(`Altas de internación procedentes de urgencias. Filtro: ${activeFilter.toUpperCase()} (${filteredRecords.length} pacientes). Meta: 100%.`, 14, 31);

            // Tabla Resumen KPIs Epicrisis
            autoTable(doc, {
                startY: 35,
                theme: 'grid',
                head: [['Total Altas Clínicas', 'Con Epicrisis Cerrada', 'Pendientes / Sin Epicrisis', 'Tasa de Adherencia', 'Estada Promedio']],
                body: [[
                    `${epicrisisStats.total}`,
                    `${epicrisisStats.cerradas}`,
                    `${epicrisisStats.pendientes}`,
                    `${epicrisisStats.adherenciaPct}%`,
                    `${epicrisisStats.avgEstada} días`
                ]],
                headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 8 },
                bodyStyles: { fontSize: 8, textColor: [30, 41, 59], fontStyle: 'bold' },
                styles: { halign: 'center', cellPadding: 2 }
            });

            // Tabla Nominal Top 100 Epicrisis
            const tableRows = filteredRecords.slice(0, 100).map((r, i) => [
                i + 1,
                r.paciente,
                r.nhc,
                (r.obra_social || '').substring(0, 22),
                r.fecha_ingreso ? r.fecha_ingreso.substring(0, 10) : '-',
                r.fecha_alta ? r.fecha_alta.substring(0, 10) : 'Pendiente',
                r.dias_estada ? `${r.dias_estada}d` : '-',
                (r.doctor || '-').substring(0, 24),
                r.habitacion || '-',
                r.tiene_epicrisis ? 'CERRADA' : 'PENDIENTE'
            ]);

            autoTable(doc, {
                startY: doc.lastAutoTable.finalY + 5,
                theme: 'striped',
                head: [['N°', 'Paciente', 'NHC', 'Obra Social', 'Ingreso', 'Alta', 'Estada', 'Médico a Cargo', 'Hab.', 'Epicrisis']],
                body: tableRows,
                headStyles: { fillColor: [22, 163, 74], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
                bodyStyles: { fontSize: 7, textColor: [15, 23, 42] },
                columnStyles: {
                    0: { cellWidth: 8, halign: 'center' },
                    1: { cellWidth: 48, fontStyle: 'bold' },
                    2: { cellWidth: 16, halign: 'center' },
                    3: { cellWidth: 38 },
                    4: { cellWidth: 18, halign: 'center' },
                    5: { cellWidth: 18, halign: 'center' },
                    6: { cellWidth: 14, halign: 'center' },
                    7: { cellWidth: 44 },
                    8: { cellWidth: 20, halign: 'center' },
                    9: { cellWidth: 24, halign: 'center', fontStyle: 'bold' }
                },
                styles: { overflow: 'ellipsize', cellPadding: 1.5 }
            });

            const fileName = `Informe_Epicrisis_Guardia_${periodo}_${new Date().toISOString().split('T')[0]}.pdf`;
            doc.save(fileName);
            return;
        }

        if (isTriage) {
            // Título de Triage
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('AUDITORÍA NOMINAL DE PACIENTES CON TRIAGE DE ENFERMERÍA (PROTOCOLO 621)', 14, 26);

            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 116, 139);
            doc.text(`Desglose de clasificación, signos vitales y observaciones. Filtro: ${activeFilter.toUpperCase()} (${filteredRecords.length} pacientes).`, 14, 31);

            // Tabla Resumen KPIs Triage
            autoTable(doc, {
                startY: 35,
                theme: 'grid',
                head: [['Total Triageados', 'N3 Amarillo (Urgente)', 'N4 Verde (Ambulatorio)', 'Evaluado Clínico / Signos', 'Con Síntoma / Obs Registrado', 'Con Signos Vitales']],
                body: [[
                    `${triageStats.total}`,
                    `${triageStats.n3Amarillo}`,
                    `${triageStats.n4Verde}`,
                    `${triageStats.evaluados}`,
                    `${triageStats.conObs}`,
                    `${triageStats.conSignos}`
                ]],
                headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 8 },
                bodyStyles: { fontSize: 8, textColor: [30, 41, 59], fontStyle: 'bold' },
                styles: { halign: 'center', cellPadding: 2 }
            });

            // Tabla Nominal Top 100 Triage
            const tableRows = filteredRecords.slice(0, 100).map((r, i) => [
                i + 1,
                r.paciente,
                r.nhc,
                (r.obra_social || '').substring(0, 22),
                r.fecha_visita,
                r.hora_llegada,
                r.nivel_triage,
                (r.ta_sistolica && r.ta_diastolica) ? `${r.ta_sistolica}/${r.ta_diastolica}` : '-',
                r.fc ? `${r.fc} bpm` : '-',
                r.temperatura ? `${r.temperatura} ºC` : '-',
                r.sato2 ? `${r.sato2}%` : '-',
                (r.observacion_enfermeria || '-').substring(0, 45)
            ]);

            autoTable(doc, {
                startY: doc.lastAutoTable.finalY + 5,
                theme: 'striped',
                head: [['N°', 'Paciente', 'NHC', 'Obra Social', 'Fecha', 'Hora', 'Clasificación', 'TA', 'FC', 'Temp', 'SatO2', 'Observación / Motivo']],
                body: tableRows,
                headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
                bodyStyles: { fontSize: 7, textColor: [15, 23, 42] },
                columnStyles: {
                    0: { cellWidth: 8, halign: 'center' },
                    1: { cellWidth: 44, fontStyle: 'bold' },
                    2: { cellWidth: 15, halign: 'center' },
                    3: { cellWidth: 36 },
                    4: { cellWidth: 17, halign: 'center' },
                    5: { cellWidth: 14, halign: 'center' },
                    6: { cellWidth: 32, halign: 'center', fontStyle: 'bold' },
                    7: { cellWidth: 16, halign: 'center' },
                    8: { cellWidth: 14, halign: 'center' },
                    9: { cellWidth: 14, halign: 'center' },
                    10: { cellWidth: 14, halign: 'center' },
                    11: { cellWidth: 46 }
                },
                styles: { overflow: 'ellipsize', cellPadding: 1.5 }
            });

            const fileName = `Informe_Triage_Guardia_${periodo}_${new Date().toISOString().split('T')[0]}.pdf`;
            doc.save(fileName);
            return;
        }

        // Título del Reporte Outliers de Tiempo
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('AUDITORÍA DE VALORES EXTREMOS (OUTLIERS) Y OPORTUNIDAD EN GUARDIA CLÍNICA', 14, 26);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`Criterio de Outlier: Demora médica > 60 minutos o permanencia > 180 minutos. Filtro actual: ${activeFilter.toUpperCase()} (${filteredRecords.length} pacientes).`, 14, 31);

        // Tabla Resumen de KPIs
        autoTable(doc, {
            startY: 35,
            theme: 'grid',
            head: [['Total Consultas', 'Dentro de Meta (<=30m)', 'Demora 31-60m', 'Outliers 61-90m', 'Outliers Críticos (>90m)', 'Permanencia >3hs', 'Espera Máxima']],
            body: [[
                `${stats.total}`,
                `${stats.meta30} (${stats.meta30Pct}%)`,
                `${stats.demora30a60}`,
                `${stats.demora60a90}`,
                `${stats.critico90} (${stats.critico90Pct}%)`,
                `${stats.permMas3h}`,
                `${stats.maxEspera} min`
            ]],
            headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 8 },
            bodyStyles: { fontSize: 8, textColor: [30, 41, 59], fontStyle: 'bold' },
            styles: { halign: 'center', cellPadding: 2 }
        });

        // Tabla Nominal de Pacientes (Top 100 para PDF)
        const tableRows = filteredRecords.slice(0, 100).map((r, i) => [
            i + 1,
            r.paciente,
            r.nhc,
            (r.obra_social || '').substring(0, 25),
            r.fecha_visita,
            r.hora_llegada,
            r.hora_atencion || '-',
            r.minutos_espera != null ? `${r.minutos_espera}m` : '-',
            r.minutos_permanencia != null ? `${r.minutos_permanencia}m` : '-',
            r.minutos_espera == null ? '-' : r.minutos_espera > 90 ? 'CRÍTICO (>90m)' : r.minutos_espera > 60 ? 'OUTLIER (>60m)' : r.minutos_espera <= 30 ? 'EN META' : 'LEVE',
            (r.destino || 'Alta').substring(0, 20)
        ]);

        autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 5,
            theme: 'striped',
            head: [['N°', 'Paciente', 'NHC', 'Obra Social', 'Fecha', 'Llegada', 'Atención', 'Espera', 'Estadía', 'Clasificación', 'Destino']],
            body: tableRows,
            headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
            bodyStyles: { fontSize: 7, textColor: [15, 23, 42] },
            columnStyles: {
                0: { cellWidth: 8, halign: 'center' },
                1: { cellWidth: 48, fontStyle: 'bold' },
                2: { cellWidth: 16, halign: 'center' },
                3: { cellWidth: 42 },
                4: { cellWidth: 18, halign: 'center' },
                5: { cellWidth: 16, halign: 'center' },
                6: { cellWidth: 16, halign: 'center' },
                7: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
                8: { cellWidth: 16, halign: 'center' },
                9: { cellWidth: 26, halign: 'center' },
                10: { cellWidth: 32 }
            },
            styles: { overflow: 'ellipsize', cellPadding: 1.5 }
        });

        const fileName = `Informe_Outliers_Guardia_${periodo}_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(fileName);
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(5px)'
        }}>
            <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '1320px',
                maxHeight: '92vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '1px solid #E2E8F0',
                overflow: 'hidden'
            }}>
                {/* ── Header ── */}
                <div style={{
                    padding: '18px 24px',
                    borderBottom: '1px solid #E2E8F0',
                    background: '#F8FAFC',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '10px',
                            background: isEpicrisis ? '#F0FDF4' : '#EFF6FF',
                            border: `1px solid ${isEpicrisis ? '#BBF7D0' : '#BFDBFE'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: isEpicrisis ? '#16A34A' : '#2563EB'
                        }}>
                            {isEpicrisis ? <FileCheck2 size={22} /> : isTriage ? <ClipboardList size={22} /> : <Clock size={22} />}
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 800,
                                    color: isEpicrisis ? '#166534' : '#1E40AF',
                                    background: isEpicrisis ? '#DCFCE7' : '#DBEAFE',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px'
                                }}>
                                    {chartConfig.badge}
                                </span>
                                <span style={{
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    color: '#0F172A',
                                    background: '#E2E8F0',
                                    padding: '2px 8px',
                                    borderRadius: '4px'
                                }}>
                                    Período: {periodoNombre}
                                </span>
                            </div>
                            <h2 style={{ margin: '4px 0 0 0', fontSize: '1.2rem', fontWeight: 800, color: '#0F172A' }}>
                                {chartConfig.title}
                            </h2>
                            <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px' }}>
                                {chartConfig.subtitle}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                            onClick={handleExportExcel}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: '#16A34A',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '8px 14px',
                                fontSize: '0.82rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                            title="Descargar Excel con todas las filas del período"
                        >
                            <FileSpreadsheet size={16} />
                            Descargar Excel
                        </button>
                        <button
                            onClick={handleExportPdf}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: '#2563EB',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '8px 14px',
                                fontSize: '0.82rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                            title="Descargar informe formal en PDF"
                        >
                            <FileText size={16} />
                            Descargar PDF
                        </button>
                        <button
                            onClick={onClose}
                            style={{
                                background: '#FFFFFF',
                                border: '1px solid #CBD5E1',
                                borderRadius: '8px',
                                color: '#64748B',
                                width: '36px',
                                height: '36px',
                                display: 'flex',
                                alignItems: 'center',
                                justifySelf: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer'
                            }}
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* ── KPI Cards Superiores ── */}
                {isEpicrisis ? (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: '12px',
                        padding: '16px 24px',
                        background: '#F1F5F9',
                        borderBottom: '1px solid #E2E8F0'
                    }}>
                        {/* Total Altas Clínicas */}
                        <div style={{ background: '#FFFFFF', borderRadius: '10px', padding: '12px 14px', border: '1px solid #CBD5E1' }}>
                            <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                                Total Altas Clínicas (Guardia)
                            </div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                                {(epicrisisStats.total || 0).toLocaleString()}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                Procedencia Urgencias
                            </div>
                        </div>

                        {/* Con Epicrisis Cerrada */}
                        <div style={{ background: '#F0FDF4', borderRadius: '10px', padding: '12px 14px', border: '1px solid #BBF7D0' }}>
                            <div style={{ fontSize: '0.7rem', color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>
                                Con Epicrisis Cerrada
                            </div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#15803D', marginTop: '4px' }}>
                                {(epicrisisStats.cerradas || 0).toLocaleString()}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#166534' }}>
                                Informe formalizado y firmado
                            </div>
                        </div>

                        {/* Pendientes */}
                        <div style={{ background: '#FFFBEB', borderRadius: '10px', padding: '12px 14px', border: '1px solid #FDE68A' }}>
                            <div style={{ fontSize: '0.7rem', color: '#92400E', fontWeight: 700, textTransform: 'uppercase' }}>
                                Pendientes / Sin Epicrisis
                            </div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#B45309', marginTop: '4px' }}>
                                {(epicrisisStats.pendientes || 0).toLocaleString()}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#92400E' }}>
                                En curso / Sin alta definitiva
                            </div>
                        </div>

                        {/* Tasa Adherencia % */}
                        <div style={{ background: '#EFF6FF', borderRadius: '10px', padding: '12px 14px', border: '1px solid #BFDBFE' }}>
                            <div style={{ fontSize: '0.7rem', color: '#1E40AF', fontWeight: 700, textTransform: 'uppercase' }}>
                                Tasa de Adherencia a Epicrisis
                            </div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1D4ED8', marginTop: '4px' }}>
                                {epicrisisStats.adherenciaPct}%
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#1E40AF' }}>
                                Meta: 100% Obligatorio
                            </div>
                        </div>

                        {/* Estada Promedio */}
                        <div style={{ background: '#FAF5FF', borderRadius: '10px', padding: '12px 14px', border: '1px solid #E9D5FF' }}>
                            <div style={{ fontSize: '0.7rem', color: '#6B21A8', fontWeight: 700, textTransform: 'uppercase' }}>
                                Estada Promedio en Piso
                            </div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#7E22CE', marginTop: '4px' }}>
                                {epicrisisStats.avgEstada} d
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#6B21A8' }}>
                                Días de internación clínica
                            </div>
                        </div>
                    </div>
                ) : isTriage ? (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: '12px',
                        padding: '16px 24px',
                        background: '#F1F5F9',
                        borderBottom: '1px solid #E2E8F0'
                    }}>
                        {/* Total Triage */}
                        <div style={{ background: '#FFFFFF', borderRadius: '10px', padding: '12px 14px', border: '1px solid #CBD5E1' }}>
                            <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                                Total Pacientes Triageados
                            </div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                                {(triageStats.total || 0).toLocaleString()}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                Protocolo 621 en SALUS
                            </div>
                        </div>

                        {/* N3 Amarillo */}
                        <div style={{ background: '#FFFBEB', borderRadius: '10px', padding: '12px 14px', border: '1px solid #FDE68A' }}>
                            <div style={{ fontSize: '0.7rem', color: '#92400E', fontWeight: 700, textTransform: 'uppercase' }}>
                                N3 Amarillo (Urgente)
                            </div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#B45309', marginTop: '4px' }}>
                                {(triageStats.n3Amarillo || 0).toLocaleString()}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#92400E' }}>
                                Atención en &lt; 30 min
                            </div>
                        </div>

                        {/* N4 Verde */}
                        <div style={{ background: '#F0FDF4', borderRadius: '10px', padding: '12px 14px', border: '1px solid #BBF7D0' }}>
                            <div style={{ fontSize: '0.7rem', color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>
                                N4 Verde (Poco Urgente)
                            </div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#15803D', marginTop: '4px' }}>
                                {(triageStats.n4Verde || 0).toLocaleString()}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#166534' }}>
                                Consulta ambulatoria estándar
                            </div>
                        </div>

                        {/* Evaluados Clínicos / Signos */}
                        <div style={{ background: '#EFF6FF', borderRadius: '10px', padding: '12px 14px', border: '1px solid #BFDBFE' }}>
                            <div style={{ fontSize: '0.7rem', color: '#1E40AF', fontWeight: 700, textTransform: 'uppercase' }}>
                                Evaluado Clínico / Signos
                            </div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1D4ED8', marginTop: '4px' }}>
                                {(triageStats.evaluados || 0).toLocaleString()}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#1E40AF' }}>
                                Control de Signos Vitales
                            </div>
                        </div>

                        {/* Con Motivo / Síntoma */}
                        <div style={{ background: '#FAF5FF', borderRadius: '10px', padding: '12px 14px', border: '1px solid #E9D5FF' }}>
                            <div style={{ fontSize: '0.7rem', color: '#6B21A8', fontWeight: 700, textTransform: 'uppercase' }}>
                                Con Síntoma / Obs Registrada
                            </div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#7E22CE', marginTop: '4px' }}>
                                {(triageStats.conObs || 0).toLocaleString()}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#6B21A8' }}>
                                Detalle de enfermería asentado
                            </div>
                        </div>
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: '12px',
                        padding: '16px 24px',
                        background: '#F1F5F9',
                        borderBottom: '1px solid #E2E8F0'
                    }}>
                        {/* Total Pacientes */}
                        <div style={{ background: '#FFFFFF', borderRadius: '10px', padding: '12px 14px', border: '1px solid #CBD5E1' }}>
                            <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                                Total Pacientes Período
                            </div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                                {(stats.total || 0).toLocaleString()}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                Promedio espera: <strong>{stats.avgEspera} min</strong>
                            </div>
                        </div>

                        {/* En Meta <= 30m */}
                        <div style={{ background: '#F0FDF4', borderRadius: '10px', padding: '12px 14px', border: '1px solid #BBF7D0' }}>
                            <div style={{ fontSize: '0.7rem', color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>
                                En Meta (&le; 30 min)
                            </div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#15803D', marginTop: '4px' }}>
                                {(stats.meta30 || 0).toLocaleString()}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#166534' }}>
                                <strong>{stats.meta30Pct}%</strong> de oportunidad
                            </div>
                        </div>

                        {/* Demora Leve 30-60m */}
                        <div style={{ background: '#EFF6FF', borderRadius: '10px', padding: '12px 14px', border: '1px solid #BFDBFE' }}>
                            <div style={{ fontSize: '0.7rem', color: '#1E40AF', fontWeight: 700, textTransform: 'uppercase' }}>
                                Demora Leve (31 - 60 min)
                            </div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1D4ED8', marginTop: '4px' }}>
                                {(stats.demora30a60 || 0).toLocaleString()}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#1E40AF' }}>
                                Zona de alerta preventiva
                            </div>
                        </div>

                        {/* Outliers 60-90m */}
                        <div style={{ background: '#FFFBEB', borderRadius: '10px', padding: '12px 14px', border: '1px solid #FDE68A' }}>
                            <div style={{ fontSize: '0.7rem', color: '#92400E', fontWeight: 700, textTransform: 'uppercase' }}>
                                Outliers (61 - 90 min)
                            </div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#B45309', marginTop: '4px' }}>
                                {(stats.demora60a90 || 0).toLocaleString()}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#92400E' }}>
                                Demora operativa moderada
                            </div>
                        </div>

                        {/* Outliers Críticos > 90m */}
                        <div style={{ background: '#FEF2F2', borderRadius: '10px', padding: '12px 14px', border: '1px solid #FECACA' }}>
                            <div style={{ fontSize: '0.7rem', color: '#991B1B', fontWeight: 700, textTransform: 'uppercase' }}>
                                Outliers Críticos (&gt; 90 min)
                            </div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#DC2626', marginTop: '4px' }}>
                                {(stats.critico90 || 0).toLocaleString()}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#991B1B' }}>
                                Máx espera: <strong>{stats.maxEspera} min</strong>
                            </div>
                        </div>

                        {/* Permanencia Prolongada > 3h */}
                        <div style={{ background: '#FAF5FF', borderRadius: '10px', padding: '12px 14px', border: '1px solid #E9D5FF' }}>
                            <div style={{ fontSize: '0.7rem', color: '#6B21A8', fontWeight: 700, textTransform: 'uppercase' }}>
                                Permanencia &gt; 3 hs
                            </div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#7E22CE', marginTop: '4px' }}>
                                {(stats.permMas3h || 0).toLocaleString()}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#6B21A8' }}>
                                Estadía prolongada en guardia
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Barra de Filtros y Búsqueda ── */}
                <div style={{
                    padding: '12px 24px',
                    borderBottom: '1px solid #E2E8F0',
                    background: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap'
                }}>
                    {/* Botones de Filtro Rápido */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#64748B', marginRight: '4px', textTransform: 'uppercase' }}>
                            Filtrar:
                        </span>
                        {isEpicrisis ? (
                            [
                                { id: 'all', label: `Todas las Altas (${epicrisisStats.total || 0})` },
                                { id: 'cerradas', label: `✅ Con Epicrisis Cerrada (${epicrisisStats.cerradas || 0})`, color: '#166534' },
                                { id: 'pendientes', label: `⚠️ Pendientes / Sin Epicrisis (${epicrisisStats.pendientes || 0})`, color: '#B45309' }
                            ].map(f => {
                                const active = activeFilter === f.id;
                                return (
                                    <button
                                        key={f.id}
                                        onClick={() => setActiveFilter(f.id)}
                                        style={{
                                            padding: '5px 12px',
                                            borderRadius: '6px',
                                            fontSize: '0.78rem',
                                            fontWeight: 700,
                                            border: active ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
                                            background: active ? '#EFF6FF' : '#FFFFFF',
                                            color: active ? '#1D4ED8' : (f.color || '#475569'),
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        {f.label}
                                    </button>
                                );
                            })
                        ) : isTriage ? (
                            [
                                { id: 'all', label: `Todos (${triageStats.total || 0})` },
                                { id: 'n3_amarillo', label: `🟡 N3 Amarillo (${triageStats.n3Amarillo || 0})`, color: '#B45309' },
                                { id: 'n4_verde', label: `🟢 N4 Verde (${triageStats.n4Verde || 0})`, color: '#15803D' },
                                { id: 'evaluados', label: `🩺 Evaluado Clínico (${triageStats.evaluados || 0})`, color: '#1D4ED8' },
                                { id: 'con_obs', label: `📝 Con Síntoma/Obs (${triageStats.conObs || 0})`, color: '#7E22CE' },
                                { id: 'con_signos', label: `❤️ Con Signos Vitales (${triageStats.conSignos || 0})`, color: '#0F766E' }
                            ].map(f => {
                                const active = activeFilter === f.id;
                                return (
                                    <button
                                        key={f.id}
                                        onClick={() => setActiveFilter(f.id)}
                                        style={{
                                            padding: '5px 12px',
                                            borderRadius: '6px',
                                            fontSize: '0.78rem',
                                            fontWeight: 700,
                                            border: active ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
                                            background: active ? '#EFF6FF' : '#FFFFFF',
                                            color: active ? '#1D4ED8' : (f.color || '#475569'),
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        {f.label}
                                    </button>
                                );
                            })
                        ) : (
                            [
                                { id: 'all', label: `Todos (${stats.total || 0})` },
                                { id: 'criticos_90', label: `🚨 Críticos > 90m (${stats.critico90 || 0})`, color: '#DC2626' },
                                { id: 'demoras_60', label: `⚠️ Demoras 61-90m (${stats.demora60a90 || 0})`, color: '#B45309' },
                                { id: 'outliers_all', label: `Todos los Outliers (${stats.outliersEsperaTotal || 0})`, color: '#991B1B' },
                                { id: 'perm_3h', label: `⏳ Permanencia > 3h (${stats.permMas3h || 0})`, color: '#7E22CE' },
                                { id: 'meta_30', label: `✅ En Meta (${stats.meta30 || 0})`, color: '#166534' }
                            ].map(f => {
                                const active = activeFilter === f.id;
                                return (
                                    <button
                                        key={f.id}
                                        onClick={() => setActiveFilter(f.id)}
                                        style={{
                                            padding: '5px 12px',
                                            borderRadius: '6px',
                                            fontSize: '0.78rem',
                                            fontWeight: 700,
                                            border: active ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
                                            background: active ? '#EFF6FF' : '#FFFFFF',
                                            color: active ? '#1D4ED8' : (f.color || '#475569'),
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        {f.label}
                                    </button>
                                );
                            })
                        )}
                    </div>

                    {/* Buscador */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '280px' }}>
                        <div style={{ position: 'relative', width: '100%' }}>
                            <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                            <input
                                type="text"
                                placeholder={isEpicrisis ? "Buscar por paciente, NHC, médico o habitación..." : isTriage ? "Buscar por paciente, NHC, síntoma u obra social..." : "Buscar paciente, NHC u obra social..."}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '7px 10px 7px 32px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8rem',
                                    outline: 'none'
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* ── Tabla de Casos ── */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 16px 24px' }}>
                    {loading ? (
                        <div style={{ padding: '60px', textAlign: 'center', color: '#64748B' }}>
                            <Clock size={32} style={{ animation: 'spin 1s linear infinite', marginBottom: '10px' }} />
                            <div>Cargando casos del período {periodoNombre}...</div>
                        </div>
                    ) : filteredRecords.length === 0 ? (
                        <div style={{ padding: '60px', textAlign: 'center', color: '#64748B' }}>
                            <CheckCircle2 size={36} style={{ color: '#16A34A', marginBottom: '8px' }} />
                            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>No se encontraron registros para este filtro.</div>
                            <div style={{ fontSize: '0.8rem' }}>Intente con otro filtro o limpie la búsqueda.</div>
                        </div>
                    ) : isEpicrisis ? (
                        /* ── TABLA ESPECÍFICA DE EPICRISIS ── */
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                            <thead>
                                <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', position: 'sticky', top: 0, zIndex: 10 }}>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '35px', textAlign: 'center' }}>N°</th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '220px' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }} onClick={() => setSortBy(sortBy === 'paciente_asc' ? 'fecha_desc' : 'paciente_asc')}>
                                            Paciente
                                            <ArrowUpDown size={12} />
                                        </div>
                                    </th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '75px', textAlign: 'center' }}>NHC</th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '160px' }}>Obra Social</th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '120px', textAlign: 'center' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }} onClick={() => setSortBy(sortBy === 'fecha_desc' ? 'fecha_asc' : 'fecha_desc')}>
                                            Fecha Ingreso
                                            <ArrowUpDown size={12} />
                                        </div>
                                    </th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '120px', textAlign: 'center' }}>Fecha Alta</th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '80px', textAlign: 'center' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }} onClick={() => setSortBy(sortBy === 'estada_desc' ? 'fecha_desc' : 'estada_desc')}>
                                            Estada
                                            <ArrowUpDown size={12} />
                                        </div>
                                    </th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '180px' }}>Médico a Cargo</th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '90px', textAlign: 'center' }}>Hab.</th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '140px', textAlign: 'center' }}>Estado Epicrisis</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRecords.slice(0, 300).map((r, idx) => {
                                    const tieneEpicrisis = r.tiene_epicrisis;

                                    return (
                                        <tr 
                                            key={r.id || idx}
                                            style={{
                                                borderBottom: '1px solid #E2E8F0',
                                                background: !tieneEpicrisis ? '#FFFBEB' : idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC',
                                                transition: 'background 0.15s ease'
                                            }}
                                        >
                                            <td style={{ padding: '9px 8px', textAlign: 'center', color: '#94A3B8', fontWeight: 600 }}>{idx + 1}</td>
                                            <td style={{ padding: '9px 8px', fontWeight: 700, color: !tieneEpicrisis ? '#B45309' : '#0F172A' }}>
                                                {r.paciente}
                                            </td>
                                            <td style={{ padding: '9px 8px', textAlign: 'center', fontFamily: 'monospace', color: '#475569', fontWeight: 600 }}>
                                                {r.nhc || '-'}
                                            </td>
                                            <td style={{ padding: '9px 8px', color: '#475569', fontSize: '0.74rem', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {r.obra_social || '-'}
                                            </td>
                                            <td style={{ padding: '9px 8px', textAlign: 'center', color: '#334155' }}>
                                                {r.fecha_ingreso ? r.fecha_ingreso.substring(0, 10) : '-'}
                                                <div style={{ fontSize: '0.7rem', color: '#64748B' }}>{r.fecha_ingreso ? r.fecha_ingreso.substring(11, 16) : ''}</div>
                                            </td>
                                            <td style={{ padding: '9px 8px', textAlign: 'center', color: '#334155' }}>
                                                {r.fecha_alta ? (
                                                    <>
                                                        <div>{r.fecha_alta.substring(0, 10)}</div>
                                                        <div style={{ fontSize: '0.7rem', color: '#64748B' }}>{r.fecha_alta.substring(11, 16)}</div>
                                                    </>
                                                ) : (
                                                    <span style={{ fontSize: '0.72rem', color: '#D97706', fontWeight: 700, background: '#FEF3C7', padding: '1px 6px', borderRadius: '4px' }}>
                                                        Internado
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '9px 8px', textAlign: 'center', fontWeight: 700, color: '#334155' }}>
                                                {r.dias_estada != null ? `${r.dias_estada} d` : '-'}
                                            </td>
                                            <td style={{ padding: '9px 8px', color: '#334155', fontSize: '0.76rem', fontWeight: 600 }}>
                                                {r.doctor || '-'}
                                            </td>
                                            <td style={{ padding: '9px 8px', textAlign: 'center', color: '#475569', fontSize: '0.76rem', fontFamily: 'monospace' }}>
                                                {r.habitacion || '-'}
                                            </td>
                                            <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    padding: '3px 8px',
                                                    borderRadius: '6px',
                                                    fontSize: '0.74rem',
                                                    fontWeight: 800,
                                                    background: tieneEpicrisis ? '#DCFCE7' : '#FEF3C7',
                                                    color: tieneEpicrisis ? '#15803D' : '#B45309',
                                                    border: `1px solid ${tieneEpicrisis ? '#86EFAC' : '#FCD34D'}`
                                                }}>
                                                    {tieneEpicrisis ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                                                    {tieneEpicrisis ? 'Cerrada' : 'Pendiente'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    ) : isTriage ? (
                        /* ── TABLA ESPECÍFICA DE TRIAGE ── */
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                            <thead>
                                <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', position: 'sticky', top: 0, zIndex: 10 }}>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '35px', textAlign: 'center' }}>N°</th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '190px' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }} onClick={() => setSortBy(sortBy === 'paciente_asc' ? 'fecha_desc' : 'paciente_asc')}>
                                            Paciente
                                            <ArrowUpDown size={12} />
                                        </div>
                                    </th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '75px', textAlign: 'center' }}>NHC</th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '110px', textAlign: 'center' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }} onClick={() => setSortBy(sortBy === 'fecha_desc' ? 'fecha_asc' : 'fecha_desc')}>
                                            Fecha & Hora
                                            <ArrowUpDown size={12} />
                                        </div>
                                    </th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '150px', textAlign: 'center' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }} onClick={() => setSortBy(sortBy === 'severidad_desc' ? 'fecha_desc' : 'severidad_desc')}>
                                            Clasificación Triage
                                            <ArrowUpDown size={12} />
                                        </div>
                                    </th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '230px', textAlign: 'center' }}>Signos Vitales</th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700 }}>Motivo de Consulta / Observación de Enfermería</th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '140px' }}>Obra Social</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRecords.slice(0, 350).map((r, idx) => {
                                    const nivel = r.nivel_triage || '';
                                    const isAmarillo = nivel.toLowerCase().includes('amarillo') || nivel.includes('N3');
                                    const isVerde = nivel.toLowerCase().includes('verde') || nivel.includes('N4');
                                    const isRojo = nivel.toLowerCase().includes('rojo') || nivel.includes('N1');

                                    return (
                                        <tr 
                                            key={r.id || idx}
                                            style={{
                                                borderBottom: '1px solid #E2E8F0',
                                                background: isRojo ? '#FEF2F2' : isAmarillo ? '#FFFBEB' : idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC',
                                                transition: 'background 0.15s ease'
                                            }}
                                        >
                                            <td style={{ padding: '9px 8px', textAlign: 'center', color: '#94A3B8', fontWeight: 600 }}>{idx + 1}</td>
                                            <td style={{ padding: '9px 8px', fontWeight: 700, color: isAmarillo ? '#92400E' : isRojo ? '#991B1B' : '#0F172A' }}>
                                                {r.paciente}
                                            </td>
                                            <td style={{ padding: '9px 8px', textAlign: 'center', fontFamily: 'monospace', color: '#475569', fontWeight: 600 }}>
                                                {r.nhc || '-'}
                                            </td>
                                            <td style={{ padding: '9px 8px', textAlign: 'center', color: '#334155' }}>
                                                <div style={{ fontWeight: 600 }}>{r.fecha_visita}</div>
                                                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{r.hora_llegada || '-'}</div>
                                            </td>
                                            <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '3px 8px',
                                                    borderRadius: '6px',
                                                    fontSize: '0.76rem',
                                                    fontWeight: 800,
                                                    background: isRojo ? '#FEE2E2' : isAmarillo ? '#FEF3C7' : isVerde ? '#DCFCE7' : '#EFF6FF',
                                                    color: isRojo ? '#DC2626' : isAmarillo ? '#B45309' : isVerde ? '#15803D' : '#1D4ED8',
                                                    border: `1px solid ${isRojo ? '#FCA5A5' : isAmarillo ? '#FCD34D' : isVerde ? '#86EFAC' : '#BFDBFE'}`
                                                }}>
                                                    {r.nivel_triage}
                                                </span>
                                            </td>
                                            <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                                    {(r.ta_sistolica && r.ta_diastolica) && (
                                                        <span style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', padding: '1px 6px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, color: '#334155' }} title="Tensión Arterial">
                                                            TA {r.ta_sistolica}/{r.ta_diastolica}
                                                        </span>
                                                    )}
                                                    {r.fc && (
                                                        <span style={{ background: '#FEF2F2', border: '1px solid #FECACA', padding: '1px 6px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, color: '#DC2626' }} title="Frecuencia Cardíaca">
                                                            FC {r.fc}
                                                        </span>
                                                    )}
                                                    {r.temperatura && (
                                                        <span style={{ background: '#FFF7ED', border: '1px solid #FFEDD5', padding: '1px 6px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, color: '#EA580C' }} title="Temperatura Corporal">
                                                            {r.temperatura} ºC
                                                        </span>
                                                    )}
                                                    {r.sato2 && (
                                                        <span style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '1px 6px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, color: '#2563EB' }} title="Saturación de Oxígeno">
                                                            Sat {r.sato2}%
                                                        </span>
                                                    )}
                                                    {!r.ta_sistolica && !r.fc && !r.temperatura && !r.sato2 && (
                                                        <span style={{ color: '#94A3B8', fontSize: '0.74rem' }}>Sin signos</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{ padding: '9px 8px', color: '#1E293B', fontSize: '0.78rem' }}>
                                                {r.observacion_enfermeria ? (
                                                    <div style={{
                                                        background: '#F8FAFC',
                                                        padding: '4px 8px',
                                                        borderRadius: '6px',
                                                        border: '1px solid #E2E8F0',
                                                        fontStyle: 'italic',
                                                        color: '#334155',
                                                        maxWidth: '380px',
                                                        wordBreak: 'break-word'
                                                    }}>
                                                        "{r.observacion_enfermeria}"
                                                    </div>
                                                ) : (
                                                    <span style={{ color: '#94A3B8', fontSize: '0.74rem' }}>Sin observación</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '9px 8px', color: '#475569', fontSize: '0.74rem', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {r.obra_social || '-'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    ) : (
                        /* ── TABLA DE OUTLIERS DE TIEMPO (ORIGINAL) ── */
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                            <thead>
                                <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', position: 'sticky', top: 0, zIndex: 10 }}>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '40px', textAlign: 'center' }}>N°</th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700 }}>Paciente</th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '80px', textAlign: 'center' }}>NHC</th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700 }}>Obra Social</th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, textAlign: 'center' }}>Fecha & Llegada</th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, textAlign: 'center' }}>Atención</th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, textAlign: 'center' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }} onClick={() => setSortBy(sortBy === 'espera_desc' ? 'fecha_asc' : 'espera_desc')}>
                                            Espera al Médico
                                            <ArrowUpDown size={13} />
                                        </div>
                                    </th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, textAlign: 'center' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }} onClick={() => setSortBy(sortBy === 'perm_desc' ? 'espera_desc' : 'perm_desc')}>
                                            Permanencia Total
                                            <ArrowUpDown size={13} />
                                        </div>
                                    </th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700 }}>Triage</th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700 }}>Destino</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRecords.slice(0, 300).map((r, idx) => {
                                    const esCritico = r.minutos_espera != null && r.minutos_espera > 90;
                                    const esModerado = r.minutos_espera != null && r.minutos_espera > 60 && r.minutos_espera <= 90;
                                    const esMeta = r.minutos_espera != null && r.minutos_espera <= 30;

                                    return (
                                        <tr 
                                            key={r.id || idx}
                                            style={{
                                                borderBottom: '1px solid #E2E8F0',
                                                background: esCritico ? '#FEF2F2' : esModerado ? '#FFFBEB' : idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC',
                                                transition: 'background 0.15s ease'
                                            }}
                                        >
                                            <td style={{ padding: '9px 8px', textAlign: 'center', color: '#94A3B8', fontWeight: 600 }}>{idx + 1}</td>
                                            <td style={{ padding: '9px 8px', fontWeight: 700, color: esCritico ? '#991B1B' : '#0F172A' }}>
                                                {r.paciente}
                                            </td>
                                            <td style={{ padding: '9px 8px', textAlign: 'center', fontFamily: 'monospace', color: '#475569', fontWeight: 600 }}>
                                                {r.nhc || '-'}
                                            </td>
                                            <td style={{ padding: '9px 8px', color: '#475569', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {r.obra_social || '-'}
                                            </td>
                                            <td style={{ padding: '9px 8px', textAlign: 'center', color: '#334155' }}>
                                                <div>{r.fecha_visita}</div>
                                                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{r.hora_llegada || '-'}</div>
                                            </td>
                                            <td style={{ padding: '9px 8px', textAlign: 'center', color: '#334155' }}>
                                                {r.hora_atencion || '-'}
                                            </td>
                                            <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                                                {r.minutos_espera != null ? (
                                                    <span style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        padding: '3px 8px',
                                                        borderRadius: '6px',
                                                        fontWeight: 800,
                                                        fontSize: '0.78rem',
                                                        background: esCritico ? '#FEE2E2' : esModerado ? '#FEF3C7' : esMeta ? '#DCFCE7' : '#DBEAFE',
                                                        color: esCritico ? '#B91C1C' : esModerado ? '#B45309' : esMeta ? '#15803D' : '#1D4ED8',
                                                        border: `1px solid ${esCritico ? '#FCA5A5' : esModerado ? '#FCD34D' : esMeta ? '#86EFAC' : '#93C5FD'}`
                                                    }}>
                                                        {esCritico && <AlertTriangle size={12} />}
                                                        {r.minutos_espera} min
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#94A3B8' }}>-</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                                                {r.minutos_permanencia != null ? (
                                                    <span style={{
                                                        padding: '3px 8px',
                                                        borderRadius: '6px',
                                                        fontWeight: 700,
                                                        fontSize: '0.76rem',
                                                        background: r.minutos_permanencia > 180 ? '#F3E8FF' : '#F1F5F9',
                                                        color: r.minutos_permanencia > 180 ? '#7E22CE' : '#475569'
                                                    }}>
                                                        {r.minutos_permanencia} min ({Math.round(r.minutos_permanencia / 60)}h)
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#94A3B8' }}>-</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '9px 8px', fontSize: '0.76rem' }}>
                                                <span style={{
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    background: (r.nivel_triage || '').includes('N1') ? '#FEE2E2' : (r.nivel_triage || '').includes('N2') ? '#FFEDD5' : '#F1F5F9',
                                                    color: (r.nivel_triage || '').includes('N1') ? '#DC2626' : (r.nivel_triage || '').includes('N2') ? '#C2410C' : '#334155',
                                                    fontWeight: 600
                                                }}>
                                                    {r.nivel_triage || 'Sin Triage'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '9px 8px', fontSize: '0.76rem', color: '#475569' }}>
                                                {r.destino || 'Alta a Domicilio'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* ── Footer ── */}
                <div style={{
                    padding: '12px 24px',
                    borderTop: '1px solid #E2E8F0',
                    background: '#F8FAFC',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                        Mostrando <strong>{filteredRecords.length}</strong> de <strong>{records.length}</strong> registros del período <strong>{periodoNombre}</strong>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                            onClick={handleExportExcel}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: '#16A34A',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '8px 16px',
                                fontSize: '0.82rem',
                                fontWeight: 700,
                                cursor: 'pointer'
                            }}
                        >
                            <FileSpreadsheet size={15} />
                            Exportar Excel ({filteredRecords.length})
                        </button>
                        <button
                            onClick={handleExportPdf}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: '#2563EB',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '8px 16px',
                                fontSize: '0.82rem',
                                fontWeight: 700,
                                cursor: 'pointer'
                            }}
                        >
                            <FileText size={15} />
                            Exportar PDF
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
