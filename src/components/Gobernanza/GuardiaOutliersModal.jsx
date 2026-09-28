import React, { useState, useEffect, useMemo } from 'react';
import { 
    X, AlertTriangle, Clock, Download, Search, Filter, 
    FileSpreadsheet, FileText, CheckCircle2, ChevronRight,
    Users, ShieldAlert, ArrowUpDown, Stethoscope, BedDouble,
    Activity, Heart, Thermometer, Droplet, FileCheck, ClipboardList,
    Bed, FileCheck2, UserCheck, AlertCircle, Scissors
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
 * 4. Análisis quirúrgico nominal de derivaciones desde Guardia Clínica a Quirófano (≤ 48 hs).
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
    const isConversionCirugia = chartType === 'conversion_cirugia';

    const [loading, setLoading] = useState(true);
    const [records, setRecords] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilter, setActiveFilter] = useState('all'); 
    const [sortBy, setSortBy] = useState(isConversionCirugia ? 'espera_asc' : isTriage || isEpicrisis ? 'fecha_desc' : 'espera_desc');
    const [visibleCount, setVisibleCount] = useState(500);

    // Cargar pacientes nominales desde Supabase
    useEffect(() => {
        if (!isOpen) return;

        let isMounted = true;
        setLoading(true);
        setActiveFilter('all');
        setVisibleCount(500);
        setSortBy(isConversionCirugia ? 'espera_asc' : isTriage || isEpicrisis ? 'fecha_desc' : 'espera_desc');

        const fetchData = async () => {
            try {
                const targetPeriodo = periodo === '2026-ANUAL' ? '2026-09' : periodo;

                // Función de paginación automática para evitar el límite de 1.000 filas por request de Supabase/PostgREST
                const fetchAllRows = async (tableName, applyFilters) => {
                    let allRows = [];
                    let page = 0;
                    const pageSize = 1000;
                    while (true) {
                        let query = supabase
                            .from(tableName)
                            .select('*')
                            .range(page * pageSize, (page + 1) * pageSize - 1);

                        query = applyFilters(query);
                        const { data, error } = await query;

                        if (error) {
                            console.error(`Error fetching ${tableName}:`, error.message);
                            break;
                        }
                        if (!data || data.length === 0) break;
                        allRows.push(...data);
                        if (data.length < pageSize) break;
                        page++;
                    }
                    return allRows;
                };

                if (isConversionCirugia) {
                    const data = await fetchAllRows('guardia_cirugias_conversion', (q) => {
                        let res = q;
                        if (periodo && periodo !== '2026-ANUAL') {
                            res = res.eq('periodo', targetPeriodo);
                        }
                        return res.order('fecha_cirugia', { ascending: false }).order('hora_cirugia', { ascending: false });
                    });
                    if (isMounted) setRecords(data || []);
                } else if (isTriage) {
                    const data = await fetchAllRows('guardia_triage_pacientes', (q) => {
                        let res = q;
                        if (periodo && periodo !== '2026-ANUAL') {
                            res = res.eq('periodo', targetPeriodo);
                        }
                        return res.order('fecha_visita', { ascending: false }).order('hora_llegada', { ascending: false });
                    });
                    if (isMounted) setRecords(data || []);
                } else if (isEpicrisis) {
                    const data = await fetchAllRows('guardia_epicrisis_altas', (q) => {
                        let res = q;
                        if (periodo && periodo !== '2026-ANUAL') {
                            res = res.eq('periodo', targetPeriodo);
                        }
                        return res.order('fecha_ingreso', { ascending: false });
                    });
                    if (isMounted) setRecords(data || []);
                } else {
                    const data = await fetchAllRows('guardia_consultas_tiempos', (q) => {
                        return q.eq('periodo', targetPeriodo).order('minutos_espera', { ascending: false, nullsFirst: false });
                    });
                    if (isMounted) setRecords(data || []);
                }
            } catch (err) {
                console.error('Error in GuardiaOutliersModal:', err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchData();
        return () => { isMounted = false; };
    }, [isOpen, periodo, isTriage, isEpicrisis, isConversionCirugia]);

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
                    title: 'Análisis Quirúrgico de Guardia — Cirugías Derivadas (≤ 48 hs)',
                    subtitle: 'Auditoría nominal y clínica de intervenciones quirúrgicas practicadas a pacientes derivados desde Guardia Clínica',
                    badge: 'Quirófano & Urgencias'
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
        if (isTriage || isEpicrisis || isConversionCirugia) return {};
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
    }, [records, isTriage, isEpicrisis, isConversionCirugia]);

    // Estadísticas de Cirugías de Guardia
    const cirugiasStats = useMemo(() => {
        if (!isConversionCirugia) return {};
        const total = records.length;
        const pacientesUnicos = new Set(records.map(r => r.nhc || r.paciente)).size;
        
        // Procedimientos
        const procMap = {};
        records.forEach(r => {
            const p = (r.cirugia_procedimiento || 'CIRUGIA GENERAL').trim();
            procMap[p] = (procMap[p] || 0) + 1;
        });
        const topProcedimientos = Object.entries(procMap)
            .map(([nombre, cantidad]) => ({ nombre, cantidad, pct: total > 0 ? ((cantidad / total) * 100).toFixed(1) : '0' }))
            .sort((a, b) => b.cantidad - a.cantidad);

        // Especialidades
        const espMap = {};
        records.forEach(r => {
            const e = (r.especialidad || 'CIRUGIA GENERAL').trim();
            espMap[e] = (espMap[e] || 0) + 1;
        });
        const topEspecialidades = Object.entries(espMap)
            .map(([nombre, cantidad]) => ({ nombre, cantidad, pct: total > 0 ? ((cantidad / total) * 100).toFixed(1) : '0' }))
            .sort((a, b) => b.cantidad - a.cantidad);

        // Cirujanos
        const cirujanoMap = {};
        records.forEach(r => {
            const c = (r.cirujano || 'Sin Asignar').trim();
            cirujanoMap[c] = (cirujanoMap[c] || 0) + 1;
        });
        const topCirujanos = Object.entries(cirujanoMap)
            .map(([nombre, cantidad]) => ({ nombre, cantidad, pct: total > 0 ? ((cantidad / total) * 100).toFixed(1) : '0' }))
            .sort((a, b) => b.cantidad - a.cantidad);

        // Tiempos de espera
        const conHoras = records.filter(r => r.horas_espera_qx != null && r.horas_espera_qx >= 0);
        const avgHoras = conHoras.length > 0 ? (conHoras.reduce((acc, r) => acc + Number(r.horas_espera_qx), 0) / conHoras.length).toFixed(1) : '0';
        const menos6h = records.filter(r => r.horas_espera_qx != null && r.horas_espera_qx <= 6).length;
        const de6a12h = records.filter(r => r.horas_espera_qx != null && r.horas_espera_qx > 6 && r.horas_espera_qx <= 12).length;
        const de12a24h = records.filter(r => r.horas_espera_qx != null && r.horas_espera_qx > 12 && r.horas_espera_qx <= 24).length;
        const de24a48h = records.filter(r => r.horas_espera_qx != null && r.horas_espera_qx > 24 && r.horas_espera_qx <= 48).length;
        const mas48h = records.filter(r => r.horas_espera_qx != null && r.horas_espera_qx > 48).length;
        const urgenciasNoProg = records.filter(r => {
            const st = (r.estado_cirugia || '').toUpperCase();
            return st.includes('URGENCIA') || st.includes('NO PROGRAMADA');
        }).length;

        return {
            total,
            pacientesUnicos,
            avgHoras,
            topProcedimientos,
            topEspecialidades,
            topCirujanos,
            menos6h,
            menos6hPct: total > 0 ? ((menos6h / total) * 100).toFixed(1) : '0',
            de6a12h,
            de6a12hPct: total > 0 ? ((de6a12h / total) * 100).toFixed(1) : '0',
            de12a24h,
            de12a24hPct: total > 0 ? ((de12a24h / total) * 100).toFixed(1) : '0',
            de24a48h,
            de24a48hPct: total > 0 ? ((de24a48h / total) * 100).toFixed(1) : '0',
            mas48h,
            urgenciasNoProg
        };
    }, [records, isConversionCirugia]);

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
                    const matchDni = (r.dni || '').toLowerCase().includes(term);
                    const matchOs = (r.obra_social || '').toLowerCase().includes(term);
                    const matchProc = (r.cirugia_procedimiento || '').toLowerCase().includes(term);
                    const matchEsp = (r.especialidad || '').toLowerCase().includes(term);
                    const matchCir = (r.cirujano || '').toLowerCase().includes(term);
                    const matchObs = (r.observacion_enfermeria || '').toLowerCase().includes(term);
                    const matchNivel = (r.nivel_triage || '').toLowerCase().includes(term);
                    const matchDoc = (r.doctor || '').toLowerCase().includes(term);
                    const matchHab = (r.habitacion || '').toLowerCase().includes(term);
                    if (!matchName && !matchNhc && !matchDni && !matchOs && !matchProc && !matchEsp && !matchCir && !matchObs && !matchNivel && !matchDoc && !matchHab) return false;
                }

                if (isConversionCirugia) {
                    if (activeFilter === 'menos_6h') {
                        return r.horas_espera_qx != null && r.horas_espera_qx <= 6;
                    }
                    if (activeFilter === '6_a_12h') {
                        return r.horas_espera_qx != null && r.horas_espera_qx > 6 && r.horas_espera_qx <= 12;
                    }
                    if (activeFilter === '12_a_24h') {
                        return r.horas_espera_qx != null && r.horas_espera_qx > 12 && r.horas_espera_qx <= 24;
                    }
                    if (activeFilter === '24_a_48h') {
                        return r.horas_espera_qx != null && r.horas_espera_qx > 24 && r.horas_espera_qx <= 48;
                    }
                    if (activeFilter === 'urgencias') {
                        const st = (r.estado_cirugia || '').toUpperCase();
                        return st.includes('URGENCIA') || st.includes('NO PROGRAMADA');
                    }
                    if (activeFilter.startsWith('proc_')) {
                        const targetProc = activeFilter.replace('proc_', '').toLowerCase();
                        return (r.cirugia_procedimiento || '').toLowerCase().includes(targetProc);
                    }
                    if (activeFilter.startsWith('esp_')) {
                        const targetEsp = activeFilter.replace('esp_', '').toLowerCase();
                        return (r.especialidad || '').toLowerCase().includes(targetEsp);
                    }
                    return true;
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
                if (isConversionCirugia) {
                    if (sortBy === 'espera_asc') return (a.horas_espera_qx || 0) - (b.horas_espera_qx || 0);
                    if (sortBy === 'espera_desc') return (b.horas_espera_qx || 0) - (a.horas_espera_qx || 0);
                    if (sortBy === 'fecha_desc') return (b.fecha_cirugia || '').localeCompare(a.fecha_cirugia || '') || (b.hora_cirugia || '').localeCompare(a.hora_cirugia || '');
                    if (sortBy === 'fecha_asc') return (a.fecha_cirugia || '').localeCompare(b.fecha_cirugia || '') || (a.hora_cirugia || '').localeCompare(b.hora_cirugia || '');
                    if (sortBy === 'paciente_asc') return (a.paciente || '').localeCompare(b.paciente || '');
                    if (sortBy === 'procedimiento_asc') return (a.cirugia_procedimiento || '').localeCompare(b.cirugia_procedimiento || '');
                    return 0;
                }

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
    }, [records, searchTerm, activeFilter, sortBy, isTriage, isEpicrisis, isConversionCirugia]);

    // ── Exportación a Excel ──
    const handleExportExcel = () => {
        const wb = XLSX.utils.book_new();

        if (isConversionCirugia) {
            // Hoja 1: Resumen Ejecutivo de Cirugías
            const summaryData = [
                ['SANATORIO ARGENTINO — AUDITORÍA DE CALIDAD & GOBERNANZA'],
                ['INFORME DE CIRUGÍAS DERIVADAS DESDE GUARDIA CLÍNICA (≤ 48 HORAS)'],
                [`Período Auditado: ${periodoNombre} (${periodo})`],
                [`Fecha de Extracción: ${new Date().toLocaleString('es-AR')}`],
                [`Filtro Activo en Reporte: ${activeFilter.toUpperCase()} | Total Registros: ${filteredRecords.length}`],
                [],
                ['MÉTRICA QUIRÚRGICA DE GUARDIA', 'CANTIDAD AUDITADA', 'DISTRIBUCIÓN %', 'ESTÁNDAR INSTITUCIONAL'],
                ['Total Cirugías Derivadas (≤ 48 hs)', cirugiasStats.total, '100.0%', 'TABLEAU_Cirugias con ingreso en Guardia'],
                ['Pacientes Únicos Operados', cirugiasStats.pacientesUnicos, `${((cirugiasStats.pacientesUnicos / (cirugiasStats.total || 1)) * 100).toFixed(1)}%`, 'Historias Clínicas distintas'],
                ['Tiempo Promedio Guardia -> Quirófano', `${cirugiasStats.avgHoras} horas`, '-', 'Desde ingreso a guardia a incisión quirúrgica'],
                ['Emergencias Inmediatas (≤ 6 hs)', cirugiasStats.menos6h, `${cirugiasStats.menos6hPct}%`, 'Resolución de máxima urgencia'],
                ['Urgencias Quirúrgicas (6 a 12 hs)', cirugiasStats.de6a12h, `${cirugiasStats.de6a12hPct}%`, 'Resolución en turno de guardia'],
                ['Resolución 12 a 24 hs', cirugiasStats.de12a24h, `${cirugiasStats.de12a24hPct}%`, 'Resolución en primer día de internación'],
                ['Ventana 24 a 48 hs', cirugiasStats.de24a48h, `${cirugiasStats.de24a48hPct}%`, 'Estabilización clínica previa'],
                ['Urgencias y No Programadas', cirugiasStats.urgenciasNoProg, `${((cirugiasStats.urgenciasNoProg / (cirugiasStats.total || 1)) * 100).toFixed(1)}%`, 'Estado formal en SALUS'],
                [],
                ['TOP PROCEDIMIENTOS QUIRÚRGICOS MÁS FRECUENTES', 'CANTIDAD', 'PARTICIPACIÓN %']
            ];

            (cirugiasStats.topProcedimientos || []).slice(0, 10).forEach(p => {
                summaryData.push([p.nombre, p.cantidad, `${p.pct}%`]);
            });

            const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
            XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen Quirúrgico');

            // Hoja 2: Detalle Nominal
            const detailRows = filteredRecords.map((r, idx) => ({
                'N°': idx + 1,
                'Paciente': r.paciente,
                'NHC': r.nhc || '-',
                'DNI': r.dni || '-',
                'Obra Social': r.obra_social || '-',
                'Llegada a Guardia (Fecha)': r.fecha_guardia || '',
                'Llegada a Guardia (Hora)': r.hora_guardia || '',
                'Cirugía / Procedimiento': r.cirugia_procedimiento || '',
                'Especialidad Quirúrgica': r.especialidad || 'CIRUGIA',
                'Cirujano': r.cirujano || 'Sin Asignar',
                'Fecha Quirófano': r.fecha_cirugia || '',
                'Hora Inicio Quirófano': r.hora_cirugia || '',
                'Horas de Espera a Qx': r.horas_espera_qx != null ? Number(r.horas_espera_qx) : '',
                'Rango de Espera': r.rango_espera || '',
                'Estado Cirugía': r.estado_cirugia || 'Programada',
                'Duración (min)': r.duracion_minutos || ''
            }));
            const wsDetail = XLSX.utils.json_to_sheet(detailRows);
            XLSX.utils.book_append_sheet(wb, wsDetail, 'Cirugías Detalladas');

            const fileName = `Guardia_Cirugias_Conversion_${periodo}_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(wb, fileName);
            return;
        }

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

        if (isConversionCirugia) {
            // Título de Cirugías de Guardia
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('AUDITORÍA QUIRÚRGICA: CIRUGÍAS DERIVADAS DE GUARDIA CLÍNICA (≤ 48 HS)', 14, 26);

            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 116, 139);
            doc.text(`Pacientes que ingresaron por Guardia y pasaron a Quirófano. Filtro: ${activeFilter.toUpperCase()} (${filteredRecords.length} cirugías).`, 14, 31);

            // Tabla Resumen KPIs Cirugías
            autoTable(doc, {
                startY: 35,
                theme: 'grid',
                head: [['Total Cirugías Derivadas', 'Pacientes Únicos', 'Promedio Espera Qx', 'Emergencias <=6hs', 'Urgencias 6-12hs', 'Resolución 12-24hs', 'Ventana 24-48hs', 'Cirugía #1 Más Frecuente']],
                body: [[
                    `${cirugiasStats.total}`,
                    `${cirugiasStats.pacientesUnicos}`,
                    `${cirugiasStats.avgHoras} hs`,
                    `${cirugiasStats.menos6h} (${cirugiasStats.menos6hPct}%)`,
                    `${cirugiasStats.de6a12h} (${cirugiasStats.de6a12hPct}%)`,
                    `${cirugiasStats.de12a24h} (${cirugiasStats.de12a24hPct}%)`,
                    `${cirugiasStats.de24a48h} (${cirugiasStats.de24a48hPct}%)`,
                    (cirugiasStats.topProcedimientos?.[0]?.nombre || '-').substring(0, 32)
                ]],
                headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7.5 },
                bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59], fontStyle: 'bold' },
                styles: { halign: 'center', cellPadding: 2 }
            });

            // Tabla Nominal Top 100 Cirugías
            const tableRows = filteredRecords.slice(0, 100).map((r, i) => [
                i + 1,
                r.paciente,
                r.nhc || '-',
                (r.obra_social || '').substring(0, 18),
                r.fecha_guardia ? `${r.fecha_guardia} ${r.hora_guardia ? r.hora_guardia.substring(0, 5) : ''}` : '-',
                (r.cirugia_procedimiento || '').substring(0, 36),
                (r.especialidad || 'CIRUGIA').substring(0, 18),
                (r.cirujano || 'Sin Asignar').substring(0, 20),
                r.fecha_cirugia ? `${r.fecha_cirugia} ${r.hora_cirugia ? r.hora_cirugia.substring(0, 5) : ''}` : '-',
                r.horas_espera_qx != null ? `${r.horas_espera_qx}h` : '-',
                (r.estado_cirugia || 'Programada').substring(0, 14)
            ]);

            autoTable(doc, {
                startY: doc.lastAutoTable.finalY + 5,
                theme: 'striped',
                head: [['N°', 'Paciente', 'NHC', 'Obra Social', 'Llegada Guardia', 'Procedimiento Quirúrgico', 'Especialidad', 'Cirujano', 'Cirugía', 'Espera', 'Estado']],
                body: tableRows,
                headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
                bodyStyles: { fontSize: 6.5, textColor: [15, 23, 42] },
                columnStyles: {
                    0: { cellWidth: 8, halign: 'center' },
                    1: { cellWidth: 42, fontStyle: 'bold' },
                    2: { cellWidth: 14, halign: 'center' },
                    3: { cellWidth: 28 },
                    4: { cellWidth: 24, halign: 'center' },
                    5: { cellWidth: 50 },
                    6: { cellWidth: 26 },
                    7: { cellWidth: 32 },
                    8: { cellWidth: 24, halign: 'center' },
                    9: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
                    10: { cellWidth: 20, halign: 'center' }
                },
                styles: { overflow: 'ellipsize', cellPadding: 1.5 }
            });

            const fileName = `Informe_Cirugias_Guardia_${periodo}_${new Date().toISOString().split('T')[0]}.pdf`;
            doc.save(fileName);
            return;
        }

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
                {isConversionCirugia ? (
                    <div style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                        {/* 5 KPI Cards Principales */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                            gap: '12px',
                            padding: '16px 24px',
                            background: '#F1F5F9',
                            borderBottom: '1px solid #E2E8F0'
                        }}>
                            {/* Card 1: Total Cirugías */}
                            <div style={{ background: '#FFFFFF', borderRadius: '10px', padding: '12px 14px', border: '1px solid #CBD5E1' }}>
                                <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                                    Cirugías Derivadas de Guardia
                                </div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                                    {(cirugiasStats.total || 0).toLocaleString()}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                    En <strong>{cirugiasStats.pacientesUnicos || 0}</strong> pacientes únicos
                                </div>
                            </div>

                            {/* Card 2: Promedio de Espera a Quirófano */}
                            <div style={{ background: '#EFF6FF', borderRadius: '10px', padding: '12px 14px', border: '1px solid #BFDBFE' }}>
                                <div style={{ fontSize: '0.7rem', color: '#1E40AF', fontWeight: 700, textTransform: 'uppercase' }}>
                                    Tiempo Promedio a Quirófano
                                </div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1D4ED8', marginTop: '4px' }}>
                                    {cirugiasStats.avgHoras || 0} hs
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#1E40AF' }}>
                                    Desde llegada a guardia a inicio cirugía
                                </div>
                            </div>

                            {/* Card 3: Emergencias Inmediatas <= 6h */}
                            <div style={{ background: '#F0FDF4', borderRadius: '10px', padding: '12px 14px', border: '1px solid #BBF7D0' }}>
                                <div style={{ fontSize: '0.7rem', color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>
                                    Emergencia Inmediata (&le; 6 hs)
                                </div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#15803D', marginTop: '4px' }}>
                                    {cirugiasStats.menos6h || 0}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#166534' }}>
                                    <strong>{cirugiasStats.menos6hPct || 0}%</strong> resuelto en &le; 6 horas
                                </div>
                            </div>

                            {/* Card 4: Urgencias Quirúrgicas 6 - 12 hs */}
                            <div style={{ background: '#FFFBEB', borderRadius: '10px', padding: '12px 14px', border: '1px solid #FDE68A' }}>
                                <div style={{ fontSize: '0.7rem', color: '#92400E', fontWeight: 700, textTransform: 'uppercase' }}>
                                    Urgencia Quirúrgica (6 - 12 hs)
                                </div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#B45309', marginTop: '4px' }}>
                                    {cirugiasStats.de6a12h || 0}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#92400E' }}>
                                    <strong>{cirugiasStats.de6a12hPct || 0}%</strong> turno de guardia
                                </div>
                            </div>

                            {/* Card 5: Cirugía Top #1 */}
                            <div style={{ background: '#FAF5FF', borderRadius: '10px', padding: '12px 14px', border: '1px solid #E9D5FF' }}>
                                <div style={{ fontSize: '0.7rem', color: '#6B21A8', fontWeight: 700, textTransform: 'uppercase' }}>
                                    Procedimiento Más Frecuente
                                </div>
                                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#7E22CE', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={cirugiasStats.topProcedimientos?.[0]?.nombre}>
                                    {cirugiasStats.topProcedimientos?.[0]?.nombre ? cirugiasStats.topProcedimientos[0].nombre.replace(/^\(CX\)\s*/i, '').substring(0, 26) + '...' : 'Sin registros'}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#6B21A8' }}>
                                    <strong>{cirugiasStats.topProcedimientos?.[0]?.cantidad || 0} cirugías</strong> ({cirugiasStats.topProcedimientos?.[0]?.pct || 0}%)
                                </div>
                            </div>
                        </div>

                        {/* Panel Visual: Ranking de Top Cirugías & Distribución de Tiempos */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                            gap: '16px',
                            padding: '16px 24px',
                            background: '#FFFFFF',
                            borderBottom: '1px solid #E2E8F0'
                        }}>
                            {/* Ranking Top Cirugías */}
                            <div style={{
                                background: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                borderRadius: '10px',
                                padding: '14px 16px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Scissors size={15} style={{ color: '#2563EB' }} />
                                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0F172A' }}>
                                            Top Procedimientos Quirúrgicos desde Guardia
                                        </span>
                                    </div>
                                    <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>
                                        {cirugiasStats.topProcedimientos?.length || 0} tipos de cirugía
                                    </span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {(cirugiasStats.topProcedimientos || []).slice(0, 5).map((p, idx) => (
                                        <div 
                                            key={idx}
                                            onClick={() => setActiveFilter(activeFilter === `proc_${p.nombre.substring(0, 15)}` ? 'all' : `proc_${p.nombre.substring(0, 15)}`)}
                                            style={{
                                                cursor: 'pointer',
                                                padding: '6px 8px',
                                                borderRadius: '6px',
                                                background: activeFilter === `proc_${p.nombre.substring(0, 15)}` ? '#EFF6FF' : '#FFFFFF',
                                                border: activeFilter === `proc_${p.nombre.substring(0, 15)}` ? '1px solid #93C5FD' : '1px solid #F1F5F9',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '3px' }}>
                                                <span style={{ fontWeight: 700, color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80%' }}>
                                                    #{idx + 1} {p.nombre.replace(/^\(CX\)\s*/i, '')}
                                                </span>
                                                <strong style={{ color: '#2563EB' }}>{p.cantidad} ({p.pct}%)</strong>
                                            </div>
                                            <div style={{ width: '100%', height: '6px', background: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                                                <div style={{ width: `${p.pct}%`, height: '100%', background: idx === 0 ? '#2563EB' : idx === 1 ? '#3B82F6' : '#60A5FA', borderRadius: '3px' }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Distribución por Tiempo de Oportunidad Guardia -> Qx */}
                            <div style={{
                                background: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                borderRadius: '10px',
                                padding: '14px 16px',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between'
                            }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Clock size={15} style={{ color: '#16A34A' }} />
                                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0F172A' }}>
                                                Distribución de Tiempos a Quirófano
                                            </span>
                                        </div>
                                        <span style={{ fontSize: '0.7rem', color: '#166534', fontWeight: 700, background: '#DCFCE7', padding: '1px 6px', borderRadius: '4px' }}>
                                            Ventana 48 hs
                                        </span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        <div 
                                            onClick={() => setActiveFilter(activeFilter === 'menos_6h' ? 'all' : 'menos_6h')}
                                            style={{
                                                cursor: 'pointer',
                                                padding: '8px 10px',
                                                borderRadius: '8px',
                                                background: activeFilter === 'menos_6h' ? '#DCFCE7' : '#FFFFFF',
                                                border: '1px solid #BBF7D0'
                                            }}
                                        >
                                            <div style={{ fontSize: '0.68rem', color: '#166534', fontWeight: 800 }}>⚡ &le; 6 hs (Emergencia Inmediata)</div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#15803D', marginTop: '2px' }}>{cirugiasStats.menos6h || 0}</div>
                                            <div style={{ fontSize: '0.7rem', color: '#166534' }}>{cirugiasStats.menos6hPct || 0}% de los casos</div>
                                        </div>

                                        <div 
                                            onClick={() => setActiveFilter(activeFilter === '6_a_12h' ? 'all' : '6_a_12h')}
                                            style={{
                                                cursor: 'pointer',
                                                padding: '8px 10px',
                                                borderRadius: '8px',
                                                background: activeFilter === '6_a_12h' ? '#DBEAFE' : '#FFFFFF',
                                                border: '1px solid #BFDBFE'
                                            }}
                                        >
                                            <div style={{ fontSize: '0.68rem', color: '#1E40AF', fontWeight: 800 }}>🕒 6 a 12 hs (Urgencia de Guardia)</div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1D4ED8', marginTop: '2px' }}>{cirugiasStats.de6a12h || 0}</div>
                                            <div style={{ fontSize: '0.7rem', color: '#1E40AF' }}>{cirugiasStats.de6a12hPct || 0}% de los casos</div>
                                        </div>

                                        <div 
                                            onClick={() => setActiveFilter(activeFilter === '12_a_24h' ? 'all' : '12_a_24h')}
                                            style={{
                                                cursor: 'pointer',
                                                padding: '8px 10px',
                                                borderRadius: '8px',
                                                background: activeFilter === '12_a_24h' ? '#FEF3C7' : '#FFFFFF',
                                                border: '1px solid #FDE68A'
                                            }}
                                        >
                                            <div style={{ fontSize: '0.68rem', color: '#92400E', fontWeight: 800 }}>📅 12 a 24 hs (Resolución 24h)</div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#B45309', marginTop: '2px' }}>{cirugiasStats.de12a24h || 0}</div>
                                            <div style={{ fontSize: '0.7rem', color: '#92400E' }}>{cirugiasStats.de12a24hPct || 0}% de los casos</div>
                                        </div>

                                        <div 
                                            onClick={() => setActiveFilter(activeFilter === '24_a_48h' ? 'all' : '24_a_48h')}
                                            style={{
                                                cursor: 'pointer',
                                                padding: '8px 10px',
                                                borderRadius: '8px',
                                                background: activeFilter === '24_a_48h' ? '#FFEDD5' : '#FFFFFF',
                                                border: '1px solid #FED7AA'
                                            }}
                                        >
                                            <div style={{ fontSize: '0.68rem', color: '#9A3412', fontWeight: 800 }}>⏱️ 24 a 48 hs (Estabilización previa)</div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#C2410C', marginTop: '2px' }}>{cirugiasStats.de24a48h || 0}</div>
                                            <div style={{ fontSize: '0.7rem', color: '#9A3412' }}>{cirugiasStats.de24a48hPct || 0}% de los casos</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Resumen Especialidades */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #E2E8F0', fontSize: '0.72rem', color: '#475569', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 700 }}>Especialidades:</span>
                                    {(cirugiasStats.topEspecialidades || []).slice(0, 4).map((e, idx) => (
                                        <span 
                                            key={idx} 
                                            onClick={() => setActiveFilter(activeFilter === `esp_${e.nombre.substring(0, 10)}` ? 'all' : `esp_${e.nombre.substring(0, 10)}`)}
                                            style={{ 
                                                cursor: 'pointer',
                                                background: activeFilter === `esp_${e.nombre.substring(0, 10)}` ? '#BFDBFE' : '#EFF6FF', 
                                                color: '#1E40AF', 
                                                padding: '1px 6px', 
                                                borderRadius: '4px', 
                                                fontWeight: 700 
                                            }}
                                        >
                                            {e.nombre}: {e.cantidad}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : isEpicrisis ? (
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
                        {isConversionCirugia ? (
                            [
                                { id: 'all', label: `Todas (${cirugiasStats.total || 0})` },
                                { id: 'menos_6h', label: `⚡ ≤ 6 hs Inmediatas (${cirugiasStats.menos6h || 0})`, color: '#15803D' },
                                { id: '6_a_12h', label: `🕒 6 - 12 hs (${cirugiasStats.de6a12h || 0})`, color: '#1D4ED8' },
                                { id: '12_a_24h', label: `📅 12 - 24 hs (${cirugiasStats.de12a24h || 0})`, color: '#B45309' },
                                { id: '24_a_48h', label: `⏱️ 24 - 48 hs (${cirugiasStats.de24a48h || 0})`, color: '#C2410C' },
                                { id: 'urgencias', label: `🚨 Urgencias / No Prog (${cirugiasStats.urgenciasNoProg || 0})`, color: '#DC2626' }
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
                        ) : isEpicrisis ? (
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
                                placeholder={isConversionCirugia ? "Buscar por paciente, cirugía, cirujano, especialidad o NHC..." : isEpicrisis ? "Buscar por paciente, NHC, médico o habitación..." : isTriage ? "Buscar por paciente, NHC, síntoma u obra social..." : "Buscar paciente, NHC u obra social..."}
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
                    ) : isConversionCirugia ? (
                        /* ── TABLA ESPECÍFICA DE CIRUGÍAS DERIVADAS DE GUARDIA ── */
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                            <thead>
                                <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', position: 'sticky', top: 0, zIndex: 10 }}>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '35px', textAlign: 'center' }}>N°</th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '220px' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }} onClick={() => setSortBy(sortBy === 'paciente_asc' ? 'fecha_desc' : 'paciente_asc')}>
                                            Paciente & DNI
                                            <ArrowUpDown size={12} />
                                        </div>
                                    </th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '75px', textAlign: 'center' }}>NHC</th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '150px' }}>Obra Social</th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '110px', textAlign: 'center' }}>Llegada Guardia</th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700 }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }} onClick={() => setSortBy(sortBy === 'procedimiento_asc' ? 'fecha_desc' : 'procedimiento_asc')}>
                                            Cirugía / Procedimiento
                                            <ArrowUpDown size={12} />
                                        </div>
                                    </th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '170px' }}>Especialidad & Cirujano</th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '120px', textAlign: 'center' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }} onClick={() => setSortBy(sortBy === 'fecha_desc' ? 'fecha_asc' : 'fecha_desc')}>
                                            Fecha & Hora Qx
                                            <ArrowUpDown size={12} />
                                        </div>
                                    </th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '130px', textAlign: 'center' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }} onClick={() => setSortBy(sortBy === 'espera_asc' ? 'espera_desc' : 'espera_asc')}>
                                            Espera a Qx
                                            <ArrowUpDown size={12} />
                                        </div>
                                    </th>
                                    <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 700, width: '110px', textAlign: 'center' }}>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRecords.slice(0, visibleCount).map((r, idx) => {
                                    const hs = r.horas_espera_qx != null ? Number(r.horas_espera_qx) : 0;
                                    const isMenos6 = hs <= 6;
                                    const is6a12 = hs > 6 && hs <= 12;
                                    const is12a24 = hs > 12 && hs <= 24;
                                    const is24a48 = hs > 24;

                                    return (
                                        <tr 
                                            key={r.id || idx}
                                            style={{
                                                borderBottom: '1px solid #E2E8F0',
                                                background: isMenos6 ? '#F0FDF4' : idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC',
                                                transition: 'background 0.15s ease'
                                            }}
                                        >
                                            <td style={{ padding: '9px 8px', textAlign: 'center', color: '#94A3B8', fontWeight: 600 }}>{idx + 1}</td>
                                            <td style={{ padding: '9px 8px' }}>
                                                <div style={{ fontWeight: 700, color: '#0F172A' }}>{r.paciente}</div>
                                                <div style={{ fontSize: '0.72rem', color: '#64748B', display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                    <span>DNI: {r.dni || '-'}</span>
                                                    {r.tipo_cirugia && (
                                                        <span style={{ background: '#F1F5F9', padding: '1px 4px', borderRadius: '3px', fontWeight: 600 }}>
                                                            {r.tipo_cirugia}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{ padding: '9px 8px', textAlign: 'center', fontFamily: 'monospace', color: '#475569', fontWeight: 600 }}>
                                                {r.nhc || '-'}
                                            </td>
                                            <td style={{ padding: '9px 8px', color: '#334155', fontSize: '0.78rem' }}>
                                                {r.obra_social || '-'}
                                            </td>
                                            <td style={{ padding: '9px 8px', textAlign: 'center', color: '#334155' }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.78rem' }}>{r.fecha_guardia}</div>
                                                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{r.hora_guardia || '-'}</div>
                                            </td>
                                            <td style={{ padding: '9px 8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#1E3A8A' }}>
                                                    <Scissors size={13} style={{ color: '#2563EB', flexShrink: 0 }} />
                                                    <span>{r.cirugia_procedimiento}</span>
                                                </div>
                                            </td>
                                            <td style={{ padding: '9px 8px' }}>
                                                <div style={{ fontWeight: 700, color: '#047857', fontSize: '0.78rem' }}>
                                                    {r.especialidad || 'CIRUGIA GENERAL'}
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                    {r.cirujano || 'Sin Asignar'}
                                                </div>
                                            </td>
                                            <td style={{ padding: '9px 8px', textAlign: 'center', color: '#334155' }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.78rem' }}>{r.fecha_cirugia}</div>
                                                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{r.hora_cirugia || '-'}</div>
                                            </td>
                                            <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                                                <span style={{
                                                    display: 'inline-flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    padding: '3px 8px',
                                                    borderRadius: '6px',
                                                    fontSize: '0.76rem',
                                                    fontWeight: 800,
                                                    background: isMenos6 ? '#DCFCE7' : is6a12 ? '#EFF6FF' : is12a24 ? '#FEF3C7' : '#FFEDD5',
                                                    color: isMenos6 ? '#15803D' : is6a12 ? '#1D4ED8' : is12a24 ? '#B45309' : '#C2410C',
                                                    border: `1px solid ${isMenos6 ? '#86EFAC' : is6a12 ? '#BFDBFE' : is12a24 ? '#FCD34D' : '#FDBA74'}`
                                                }}>
                                                    <span>{hs} hs</span>
                                                    <span style={{ fontSize: '0.65rem', fontWeight: 600 }}>
                                                        {isMenos6 ? 'Inmediata' : is6a12 ? 'Urgente' : is12a24 ? '12 - 24 hs' : '24 - 48 hs'}
                                                    </span>
                                                </span>
                                            </td>
                                            <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '3px 7px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.72rem',
                                                    fontWeight: 700,
                                                    background: r.estado_cirugia === 'Realizada' ? '#DCFCE7' : '#F1F5F9',
                                                    color: r.estado_cirugia === 'Realizada' ? '#15803D' : '#475569'
                                                }}>
                                                    {r.estado_cirugia || 'Realizada'}
                                                </span>
                                                {r.duracion_minutos && (
                                                    <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px' }}>
                                                        {r.duracion_minutos} min
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
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
                                {filteredRecords.slice(0, visibleCount).map((r, idx) => {
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
                                {filteredRecords.slice(0, visibleCount).map((r, idx) => {
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
                                {filteredRecords.slice(0, visibleCount).map((r, idx) => {
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

                    {filteredRecords.length > visibleCount && (
                        <div style={{ textAlign: 'center', padding: '16px 0', borderTop: '1px solid #E2E8F0', marginTop: '12px' }}>
                            <button
                                type="button"
                                onClick={() => setVisibleCount(prev => prev + 500)}
                                style={{
                                    background: '#FFFFFF',
                                    border: '1.5px solid #BFDBFE',
                                    color: '#1D4ED8',
                                    borderRadius: '8px',
                                    padding: '8px 20px',
                                    fontSize: '0.82rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    boxShadow: '0 1px 3px rgba(37,99,235,0.1)',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                Cargar 500 pacientes más (Mostrando {Math.min(filteredRecords.length, visibleCount)} de {filteredRecords.length.toLocaleString()})
                            </button>
                        </div>
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
                        Mostrando <strong>{Math.min(filteredRecords.length, visibleCount)}</strong> de <strong>{filteredRecords.length.toLocaleString()}</strong> pacientes filtrados ({records.length.toLocaleString()} totales del período <strong>{periodoNombre}</strong>)
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
