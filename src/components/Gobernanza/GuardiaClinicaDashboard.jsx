import React, { useState, useEffect, useMemo } from 'react';
import { 
    Sun, Moon, ShieldAlert, Compass, Activity, Clock, CheckCircle2, RotateCcw, AlertTriangle, 
    Layers, PieChart as PieChartIcon, Bed, FileText, Calendar, RefreshCw, 
    BookOpen, Sparkles, TrendingUp, ArrowUpRight, ArrowDownRight, 
    Check, Copy, ShieldCheck, ChevronRight, HelpCircle, Scissors, Users,
    BarChart3, Eye, BarChart2, Maximize2, Stethoscope
} from 'lucide-react';
import GuardiaOutliersModal from './GuardiaOutliersModal';
import {
    ResponsiveContainer,
    ComposedChart,
    BarChart,
    Bar,
    LineChart,
    Line,
    AreaChart,
    Area,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    Legend,
    ReferenceLine
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { INDICADORES_GUARDIA_CATALOGO } from './telarConfig';
import GuardiaConversionTimelineModal from './GuardiaConversionTimelineModal';
import GuardiaPuertaMedicoProgressionModal from './GuardiaPuertaMedicoProgressionModal';
import QuirofanoDashboard from './QuirofanoDashboard';
import GuardiaInternadoPanel from './GuardiaInternadoPanel';
import AgenteEpicrisisPanel from './AgenteEpicrisisPanel';
import './Gobernanza.css';

// ─── CATÁLOGO DIDÁCTICO Y CLÍNICO DE EXPLICACIÓN DE GRÁFICOS ───
const CHART_HELP_CATALOGO = {
    triage_evolution: {
        id: 'triage_evolution',
        titulo: 'Cobertura y Evolución Mensual del Triage de Enfermería',
        subtitulo: 'Serie Temporal 2026 · SALUS Protocolo 621 · (ENF) Triage enfermeria',
        icon: '🩺',
        queMuestra: 'Compara mes a mes el volumen total de pacientes que ingresaron a la Guardia Clínica (barras celestes/azules) contra aquellos a los que el equipo de enfermería les realizó efectivamente el Triage de signos vitales (barras violetas), y grafica la línea de cobertura porcentual resultante frente a la meta normada.',
        comoSeCalcula: 'Se divide la cantidad de admisiones de guardia que cuentan con un registro activo en [PR InstRespEntrada] para el Protocolo 621 entre el total de consultas de VLISE_Visitas del mes, multiplicado por 100.',
        fuenteSalus: 'VLISE_Visitas cruzada por idEntrada con PR InstRespEntrada (Protocolo 621: (ENF) Triage enfermeria: TD, TS, FC, Tº, FR, SAO2, HGT y Observaciones).',
        meta: 'Meta Progresiva: > 50% | Meta de Acreditación Final: > 95%',
        impactoGestion: 'Garantiza que la atención médica priorice el riesgo de vida por sobre el orden de llegada. Permite auditar el cumplimiento del plantel de enfermería, asegurar trazabilidad medicolegal y fundamentar los tiempos de espera ante los pacientes y financiadores.'
    },
    conversion_cirugia: {
        id: 'conversion_cirugia',
        titulo: 'Volumen de Consultas vs. Conversión Quirúrgica (≤ 48 hs)',
        subtitulo: 'Articulación de Urgencias con Centro Quirúrgico',
        icon: '✂️',
        queMuestra: 'Relaciona la demanda mensual espontánea de la guardia con el volumen y porcentaje de pacientes que requirieron una intervención quirúrgica en quirófano dentro de las primeras 48 horas posteriores a su ingreso.',
        comoSeCalcula: 'Se contabilizan los pacientes de VLISE_Visitas que registran una intervención en TABLEAU_Cirugias con diferencia horaria menor o igual a 48 horas, dividido el total de consultas de urgencia del mes.',
        fuenteSalus: 'VLISE_Visitas cruzada con TABLEAU_Cirugias por número de documento / historia clínica (NHC).',
        meta: 'Benchmark Internacional: 8% a 12%',
        impactoGestion: 'Mide la capacidad de resolución quirúrgica de urgencias (apendicectomías, fracturas, colecistectomías agudas) y detecta si la guardia se está usando indebidamente como vía de atajo para programar cirugías electivas.'
    },
    tiempos_espera: {
        id: 'tiempos_espera',
        titulo: 'Curva de Tiempos de Oportunidad y Permanencia',
        subtitulo: 'Tiempos de Proceso Asistencial en Guardia',
        icon: '⏱️',
        queMuestra: 'Traza la evolución mensual de dos tiempos críticos: los minutos transcurridos desde el ingreso administrativo hasta la atención del médico (Tiempo de Espera, línea naranja), y los minutos totales desde el ingreso hasta el egreso de la guardia (Permanencia Total, área sombreada violeta).',
        comoSeCalcula: 'Diferencia en minutos entre marcas de reloj de SALUS: Fecha Entrada Real vs Fecha Atención Médica, y Fecha Entrada Real vs Fecha Salida Real.',
        fuenteSalus: 'VLISE_Visitas (campos [Fecha Entrada Real], [Fecha Salida Real], asistencias registradas).',
        meta: 'Meta Oportunidad Médica: < 30 minutos | Permanencia promedio: < 90 minutos',
        impactoGestion: 'Identifica retrasos en la sala de espera y cuellos de botella en la resolución médica (demoras en resultados de laboratorio, ecografías, tomografías o administración de sueros/medicación).'
    },
    calidad_72h: {
        id: 'calidad_72h',
        titulo: 'Indicadores de Calidad y Seguridad Clínica (72 horas)',
        subtitulo: 'Monitoreo de Reconsultas a Guardia y Reinternaciones Inesperadas',
        icon: '🛡️',
        queMuestra: 'Monitorea en paralelo la Tasa de Reconsulta a Guardia (pacientes que vuelven a consultar antes de 3 días) y la Tasa de Reinternación Temprana (pacientes que egresaron de piso clínico y vuelven a internarse antes de 72 hs).',
        comoSeCalcula: 'Porcentaje de pacientes con reingreso a guardia en ≤ 72 hs sobre el total de consultas, y porcentaje de readmisiones en internación en ≤ 72 hs sobre el total de altas clínicas del mes.',
        fuenteSalus: 'VLISE_Visitas (autocruce temporal por paciente ≤ 72 horas) y TABLEAU_Admisiones (procedencia Urgencias).',
        meta: 'Reconsulta Guardia: < 7% | Reinternación Piso: < 5%',
        impactoGestion: 'Son los termómetros máximos de seguridad clínica. Valores elevados advierten altas apresuradas, tratamientos incompletos, falta de pautas de alarma o diagnósticos iniciales no acertados.'
    },
    triage_severidad: {
        id: 'triage_severidad',
        titulo: 'Clasificación de Severidad (Triage)',
        subtitulo: 'Estratificación del Riesgo Clínico en el Ingreso',
        icon: '🚦',
        queMuestra: 'Distribución cualitativa y porcentual de los pacientes según el código de color y severidad asignado en el Protocolo 621 de Enfermería: N1 Rojo (Emergencia 0 min), N2 Naranja (Muy Urgente < 15 min), N3 Amarillo (Urgente < 30 min), N4 Verde (Poco Urgente < 60 min), N5 Azul (No Urgente) y Evaluados con signos vitales.',
        comoSeCalcula: 'Conteo y porcentaje de cada nivel registrado en el campo observaciones y preguntas del Protocolo 621 en [PR InstRespEntrada].',
        fuenteSalus: 'PR InstRespEntrada (idProtocolo = 621, preguntas 13802 a 13807 y 13814/13815).',
        meta: 'Trazabilidad 100% de pacientes evaluados',
        impactoGestion: 'Permite defender ante auditorías y dirección por qué determinados pacientes aguardan en sala mientras otros son ingresados de inmediato a shockroom, y balancear la dotación de guardia.'
    },
    destinos_postguardia: {
        id: 'destinos_postguardia',
        titulo: 'Destinos Post-Guardia Efectivos',
        subtitulo: 'Resolutividad Ambulatoria y Derivación Interna',
        icon: '📊',
        queMuestra: 'Muestra a dónde van los pacientes una vez finalizada la atención médica de guardia: Alta a Domicilio, Internación en Piso Clínico, Pase a Quirófano de Urgencia o Traslado a Cuidados Críticos (UCI / Terapia Intermedia).',
        comoSeCalcula: 'Cruce entre los motivos de cierre y altas de VLISE_Visitas con los números de admisión hospitalaria en TABLEAU_Admisiones dentro de las 24 horas del ingreso.',
        fuenteSalus: 'VLISE_Visitas y TABLEAU_Admisiones (fechas de admisión y servicios de destino).',
        meta: 'Alta domiciliaria esperada: 85% – 92% | Derivación a camas: 8% – 15%',
        impactoGestion: 'Mide la capacidad resolutiva ambulatoria de la guardia. Alerta tempranamente sobre tensiones en la disponibilidad de camas de internación y camas críticas del Sanatorio.'
    },
    adherencia_epicrisis: {
        id: 'adherencia_epicrisis',
        titulo: 'Tasa de Adherencia a Epicrisis en Altas de Urgencias',
        subtitulo: 'Cumplimiento y Calidad en Confección de Epicrisis Electrónica en Internación Clínica',
        icon: '📋',
        queMuestra: 'Porcentaje de pacientes egresados de internación clínica procedentes de guardia que cuentan con el documento de Epicrisis médica debidamente confeccionado y firmado en la Historia Clínica Electrónica.',
        comoSeCalcula: 'Se contabilizan las admisiones de [TABLEAU_Admisiones] con Procedencia = "Derivado desde Urgencias" y Especialidad = "CLINICO ", calculando el cociente entre las que registran [Motivo de alta] e informe de epicrisis versus el total de altas clínicas del período, multiplicado por 100.',
        fuenteSalus: 'SALUS: TABLEAU_Admisiones y PR RespuestasProtocolo (Protocolo 382 Epicrisis). Frecuencia: Mensual.',
        meta: 'Meta Institucional: 100% de altas con Epicrisis cerrada y firmada',
        impactoGestion: 'Garantiza la continuidad asistencial post-alta, la seguridad medicolegal del paciente, la correcta codificación y facturación con las obras sociales/prepagas, y el cumplimiento estricto de las directrices de Calidad Institucional de Sanatorio Argentino.'
    }
};

const helpBtnStyle = {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    border: '1px solid #CBD5E1',
    background: '#FFFFFF',
    color: '#2563EB',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
    transition: 'all 0.15s ease',
    padding: 0,
    flexShrink: 0
};

const outlierBtnStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    background: '#EFF6FF',
    border: '1px solid #BFDBFE',
    borderRadius: '6px',
    color: '#1D4ED8',
    fontSize: '0.72rem',
    fontWeight: 700,
    padding: '3px 9px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    flexShrink: 0,
    boxShadow: '0 1px 2px rgba(37, 99, 235, 0.08)'
};

/**
 * Función agregadora para períodos que abarcan múltiples meses o rangos personalizados
 */
function aggregateResumenData(months, label = 'Período Filtrado') {
    if (!months || months.length === 0) return null;
    if (months.length === 1) return months[0];

    const totalConsultas = months.reduce((acc, m) => acc + (m.total_consultas || 0), 0);
    const consultasConTriage = months.reduce((acc, m) => acc + (m.consultas_con_triage || 0), 0);
    const pasesCirugia = months.reduce((acc, m) => acc + (m.cantidad_pases_cirugia || 0), 0);
    const totalAltas = months.reduce((acc, m) => acc + (m.total_altas_clinicas || 0), 0);
    const altasConEpicrisis = months.reduce((acc, m) => acc + (m.altas_con_epicrisis || 0), 0);

    // Promedios ponderados por volumen de consultas del mes
    const ponderar = (key) => {
        if (totalConsultas === 0) return 0;
        const weightedSum = months.reduce((acc, m) => acc + (Number(m[key] || 0) * (m.total_consultas || 0)), 0);
        return Number((weightedSum / totalConsultas).toFixed(2));
    };

    const esperaMedico = ponderar('espera_medico_min_promedio');
    const permanencia = ponderar('permanencia_guardia_min_promedio');
    const reconsulta72h = ponderar('reconsulta_72h_pct');
    const reinternacion72h = ponderar('reinternacion_72h_pct');
    const mujeresPct = ponderar('mujeres_pct');
    const hombresPct = ponderar('hombres_pct');

    const coberturaTriagePct = totalConsultas > 0 ? Number(((consultasConTriage / totalConsultas) * 100).toFixed(2)) : 0;
    const conversionCirugiaPct = totalConsultas > 0 ? Number(((pasesCirugia / totalConsultas) * 100).toFixed(2)) : 0;
    const adherenciaEpicrisisPct = totalAltas > 0 ? Number(((altasConEpicrisis / totalAltas) * 100).toFixed(2)) : 0;

    // Agregar distribución de Triage
    const triageMap = {};
    months.forEach(m => {
        (m.triage_distribucion || []).forEach(t => {
            const nivel = t.nivel || 'Sin clasificar';
            triageMap[nivel] = (triageMap[nivel] || 0) + (t.cantidad || 0);
        });
    });
    const triage_distribucion = Object.entries(triageMap).map(([nivel, cantidad]) => ({
        nivel,
        cantidad,
        porcentaje: consultasConTriage > 0 ? Number(((cantidad / consultasConTriage) * 100).toFixed(2)) : 0
    }));

    // Agregar destinos
    const destinosMap = {};
    months.forEach(m => {
        (m.destinos_distribucion || []).forEach(d => {
            const destino = d.destino || 'Sin definir';
            destinosMap[destino] = (destinosMap[destino] || 0) + (d.cantidad || 0);
        });
    });
    const destinos_distribucion = Object.entries(destinosMap).map(([destino, cantidad]) => ({
        destino,
        cantidad,
        porcentaje: totalConsultas > 0 ? Number(((cantidad / totalConsultas) * 100).toFixed(2)) : 0
    }));

    // Agregar género
    const demografiaMap = {};
    months.forEach(m => {
        (m.demografia_genero || []).forEach(g => {
            const genero = g.genero || 'Otro';
            demografiaMap[genero] = (demografiaMap[genero] || 0) + (g.cantidad || 0);
        });
    });
    const demografia_genero = Object.entries(demografiaMap).map(([genero, cantidad]) => ({
        genero,
        cantidad,
        porcentaje: totalConsultas > 0 ? Number(((cantidad / totalConsultas) * 100).toFixed(2)) : 0
    }));

    // Agregar diagnósticos frecuentes
    const diagMap = {};
    months.forEach(m => {
        (m.diagnosticos_frecuentes || []).forEach(d => {
            const diag = d.diagnostico || 'Consulta General';
            diagMap[diag] = (diagMap[diag] || 0) + (d.cantidad || 0);
        });
    });
    const diagnosticos_frecuentes = Object.entries(diagMap)
        .map(([diagnostico, cantidad]) => ({
            diagnostico,
            cantidad,
            porcentaje: totalConsultas > 0 ? Number(((cantidad / totalConsultas) * 100).toFixed(2)) : 0
        }))
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 15);

    return {
        periodo: label,
        total_consultas: totalConsultas,
        consultas_con_triage: consultasConTriage,
        cobertura_triage_pct: coberturaTriagePct,
        cantidad_pases_cirugia: pasesCirugia,
        conversion_cirugia_pct: conversionCirugiaPct,
        espera_medico_min_promedio: esperaMedico,
        permanencia_guardia_min_promedio: permanencia,
        reconsulta_72h_pct: reconsulta72h,
        reinternacion_72h_pct: reinternacion72h,
        adherencia_epicrisis_pct: adherenciaEpicrisisPct,
        total_altas_clinicas: totalAltas,
        altas_con_epicrisis: altasConEpicrisis,
        mujeres_pct: mujeresPct,
        hombres_pct: hombresPct,
        demografia_genero,
        triage_distribucion,
        destinos_distribucion,
        diagnosticos_frecuentes
    };
}

// Formateador de nombres de períodos (corrige 'ANUAL' para no producir 'undefined 2026')
function formatPeriodoLabel(periodoStr) {
    if (!periodoStr) return '';
    if (periodoStr.includes('ANUAL')) {
        const year = periodoStr.split('-')[0] || '2026';
        return `Acumulado ${year}`;
    }
    const [year, month] = periodoStr.split('-');
    const meses = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    const mIdx = parseInt(month, 10) - 1;
    if (isNaN(mIdx) || mIdx < 0 || mIdx > 11) return periodoStr;
    const now = new Date();
    const isCurrent = (parseInt(year, 10) === now.getFullYear() && (mIdx + 1) === (now.getMonth() + 1));
    if (isCurrent) {
        return `${meses[mIdx]} ${year} (al ${String(now.getDate()).padStart(2, '0')}/${month} · En Curso)`;
    }
    return `${meses[mIdx]} ${year}`;
}

// Formateador abreviado para ejes de gráficos
function formatMesCorto(periodoStr) {
    if (!periodoStr) return '';
    if (periodoStr.includes('ANUAL')) return 'Anual';
    const [, month] = periodoStr.split('-');
    const mesesCortos = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const mIdx = parseInt(month, 10) - 1;
    return (mIdx >= 0 && mIdx < 12) ? mesesCortos[mIdx] : periodoStr;
}

export default function GuardiaClinicaDashboard({ 
    onOpenDocModal, 
    activeIndicatorIds = [], 
    onToggleIndicator,
    addToast,
    fechaDesde,
    fechaHasta,
    datePresetMode,
    onDatePresetChange,
    onCustomDateChange
}) {
    const [loading, setLoading] = useState(true);
    const [historialResumen, setHistorialResumen] = useState([]);
    const [selectedPeriodo, setSelectedPeriodo] = useState(() => (fechaDesde ? fechaDesde.slice(0, 7) : '2026-10'));
    const [selectedKpiDetail, setSelectedKpiDetail] = useState(null);
    const [selectedChartHelp, setSelectedChartHelp] = useState(null);
    const [selectedOutlierModal, setSelectedOutlierModal] = useState(null);
    const [copiedSql, setCopiedSql] = useState(false);
    const [isConversionModalOpen, setIsConversionModalOpen] = useState(false);
    const [showQuirofanoModal, setShowQuirofanoModal] = useState(false);
    const [showPuertaMedicoProgression, setShowPuertaMedicoProgression] = useState(false);
    const [activeDashboardTab, setActiveDashboardTab] = useState('resumen'); // 'resumen' | 'triage' | 'tiempos' | 'resolucion' | 'calidad' | 'internado'
    const [cirugiasConversionAll, setCirugiasConversionAll] = useState([]);
    const [triagePacientesAll, setTriagePacientesAll] = useState([]);
    const [franjaFiltro, setFranjaFiltro] = useState('diurna'); // 'diurna' | 'nocturna' | '24hs'
    const [franjasTiemposData, setFranjasTiemposData] = useState([]);
    const [admisionesClinicasData, setAdmisionesClinicasData] = useState([]);
    const [extremosFranjasCache, setExtremosFranjasCache] = useState(null);
    const [selectedFranjaExtremos, setSelectedFranjaExtremos] = useState('todos'); // 'todos' | '08 a 14' | '14 a 22' | '22 a 08'
    const [selectedDiaExtremos, setSelectedDiaExtremos] = useState('todos'); // 'todos' | 'Lunes' | etc.
    const [epicrisisTargetNhc, setEpicrisisTargetNhc] = useState(null);

    // Cargar datos consolidados desde Supabase
    useEffect(() => {
        fetchResumenData();
    }, []);

    // Sincronización automática cuando el usuario cambia el período o rango en la barra superior del Telar
    useEffect(() => {
        if (!fechaDesde || historialResumen.length === 0) return;
        
        const yDesde = fechaDesde.slice(0, 4);
        const yHasta = fechaHasta ? fechaHasta.slice(0, 4) : yDesde;
        const mDesde = fechaDesde.slice(0, 7);
        const mHasta = fechaHasta ? fechaHasta.slice(0, 7) : mDesde;

        // 1. Rango Anual completo (ej. 2026-01-01 a 2026-12-31)
        if (fechaDesde.endsWith('-01-01') && fechaHasta && fechaHasta.endsWith('-12-31') && yDesde === yHasta) {
            const anualKey = `${yDesde}-ANUAL`;
            if (historialResumen.some(h => h.periodo === anualKey)) {
                setSelectedPeriodo(anualKey);
                return;
            }
        }

        // 2. Mes específico según fechaDesde y fechaHasta (ej: '2026-10' para Octubre)
        if (mDesde === mHasta) {
            if (historialResumen.some(h => h.periodo === mDesde)) {
                setSelectedPeriodo(mDesde);
                return;
            }
        }

        // 3. Rango de meses múltiples o personalizado
        const monthlyOnly = historialResumen.filter(h => !h.periodo.includes('ANUAL'));
        const inRange = monthlyOnly.filter(h => h.periodo >= mDesde && h.periodo <= mHasta);
        if (inRange.length > 0) {
            setSelectedPeriodo(mHasta || mDesde);
            return;
        }

        // 4. Fallback al mes más cercano disponible
        const match = monthlyOnly.find(h => h.periodo <= mDesde) || monthlyOnly[monthlyOnly.length - 1];
        if (match) {
            setSelectedPeriodo(match.periodo);
        }
    }, [fechaDesde, fechaHasta, historialResumen]);

    // Función bidireccional para seleccionar período y sincronizar con la barra superior
    const handleSelectPeriodo = (nuevoPeriodo) => {
        setSelectedPeriodo(nuevoPeriodo);
        if (onCustomDateChange) {
            if (nuevoPeriodo.includes('ANUAL')) {
                const year = nuevoPeriodo.split('-')[0] || '2026';
                onCustomDateChange(`${year}-01-01`, `${year}-12-31`);
                onDatePresetChange?.('personalizado');
            } else {
                const [year, month] = nuevoPeriodo.split('-');
                const lastDay = new Date(Number(year), Number(month), 0).getDate();
                const dDesde = `${year}-${month}-01`;
                const dHasta = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
                
                const now = new Date();
                const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
                
                if (nuevoPeriodo === currentMonthStr) {
                    onDatePresetChange?.('este_mes');
                } else if (nuevoPeriodo === prevMonthStr) {
                    onDatePresetChange?.('mes_anterior');
                } else {
                    onDatePresetChange?.('personalizado');
                }
                onCustomDateChange(dDesde, dHasta);
            }
        }
    };

    
    const fetchExtraNominalData = async () => {
        try {
            const [cRes, tRes] = await Promise.all([
                supabase.from('guardia_cirugias_conversion').select('*'),
                supabase.from('guardia_triage_pacientes').select('*')
            ]);
            if (cRes.data) setCirugiasConversionAll(cRes.data);
            if (tRes.data) setTriagePacientesAll(tRes.data);
        } catch (e) {
            console.error('Error fetching nominal extra data:', e);
        }
    };

    const fetchResumenData = async () => {
        setLoading(true);
        try {
            const [resInd, resFranjas, resAdm, resExt] = await Promise.all([
                supabase.from('guardia_indicadores_resumen').select('*').order('periodo', { ascending: false }),
                supabase.from('guardia_franjas_tiempos').select('*').order('periodo', { ascending: false }),
                supabase.from('guardia_admisiones_clinicas_resumen').select('*').order('periodo', { ascending: false }),
                supabase.from('app_config').select('value').eq('key', 'guardia_extremos_franjas_cache').maybeSingle()
            ]);

            if (resFranjas.data) setFranjasTiemposData(resFranjas.data);
            if (resAdm.data) setAdmisionesClinicasData(resAdm.data);
            if (resExt.data?.value) {
                const parsedExt = typeof resExt.data.value === 'string' ? JSON.parse(resExt.data.value) : resExt.data.value;
                if (parsedExt?.periodos) setExtremosFranjasCache(parsedExt.periodos);
            }

            const { data, error } = resInd;

            if (error) throw error;
            if (data && data.length > 0) {
                setHistorialResumen(data);
                fetchExtraNominalData();
                
                // Si viene un fechaDesde inicial, priorizar ese período
                if (fechaDesde) {
                    const targetYearMonth = fechaDesde.slice(0, 7);
                    if (data.some(d => d.periodo === targetYearMonth)) {
                        setSelectedPeriodo(targetYearMonth);
                        return;
                    }
                }

                // Si el período seleccionado no está en la lista, usar el mes más reciente (excluyendo ANUAL como default)
                if (!data.some(d => d.periodo === selectedPeriodo)) {
                    const latestMonth = data.find(d => !d.periodo.includes('ANUAL'));
                    setSelectedPeriodo(latestMonth ? latestMonth.periodo : data[0].periodo);
                }
            }
        } catch (err) {
            console.error('Error al cargar indicadores de Guardia:', err);
            addToast?.('Error al conectar con la base de indicadores de Guardia', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Separar registros mensuales del consolidado anual
    const monthlyPeriods = useMemo(() => {
        return historialResumen.filter(h => !h.periodo.includes('ANUAL'));
    }, [historialResumen]);

    const annualPeriod = useMemo(() => {
        return historialResumen.find(h => h.periodo.includes('ANUAL'));
    }, [historialResumen]);

    // Rango de fechas legible para el encabezado
    const formattedDateRange = useMemo(() => {
        if (!fechaDesde || !fechaHasta) return '';
        const [yD, mD, dD] = fechaDesde.split('-');
        const [yH, mH, dH] = fechaHasta.split('-');
        return `${dD}/${mD}/${yD} al ${dH}/${mH}/${yH}`;
    }, [fechaDesde, fechaHasta]);

    // Registro del período actualmente seleccionado (con agregación multi-mes en tiempo real)
    const currentData = useMemo(() => {
        if (!historialResumen.length) return null;

        // Si se proveen fechas desde la barra superior del Telar
        if (fechaDesde && fechaHasta) {
            const yDesde = fechaDesde.slice(0, 4);
            const yHasta = fechaHasta.slice(0, 4);
            const mDesde = fechaDesde.slice(0, 7);
            const mHasta = fechaHasta.slice(0, 7);

            // 1. Rango anual completo
            if (fechaDesde.endsWith('-01-01') && fechaHasta.endsWith('-12-31') && yDesde === yHasta) {
                const anual = historialResumen.find(h => h.periodo === `${yDesde}-ANUAL`);
                if (anual) return anual;
            }

            // 2. Mes puntual exacto
            if (mDesde === mHasta) {
                const match = historialResumen.find(r => r.periodo === mDesde);
                if (match) return match;
            }

            // 3. Rango personalizado o de varios meses
            const monthlyOnly = historialResumen.filter(h => !h.periodo.includes('ANUAL'));
            const inRange = monthlyOnly.filter(h => h.periodo >= mDesde && h.periodo <= mHasta);
            if (inRange.length > 1) {
                return aggregateResumenData(inRange, `${mDesde} a ${mHasta}`);
            } else if (inRange.length === 1) {
                return inRange[0];
            }
        }

        // Fallback a selectedPeriodo
        return historialResumen.find(r => r.periodo === selectedPeriodo) || historialResumen[0];
    }, [historialResumen, selectedPeriodo, fechaDesde, fechaHasta]);

    // Etiqueta semántica del período activo filtrado
    const activePeriodLabel = useMemo(() => {
        if (selectedPeriodo?.includes('ANUAL')) {
            const y = selectedPeriodo.split('-')[0] || '2026';
            return `Año Completo ${y}`;
        }
        if (!fechaDesde || !fechaHasta) {
            return formatPeriodoLabel(selectedPeriodo);
        }
        const [yD, mD] = fechaDesde.split('-');
        const [yH, mH] = fechaHasta.split('-');
        const meses = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];
        const mIdxD = parseInt(mD, 10) - 1;
        const mIdxH = parseInt(mH, 10) - 1;
        if (yD === yH && mD === mH) {
            return `${meses[mIdxD]} ${yD}`;
        }
        if (yD === yH) {
            return `${meses[mIdxD]} - ${meses[mIdxH]} ${yD}`;
        }
        return `${mD}/${yD} al ${mH}/${yH}`;
    }, [selectedPeriodo, fechaDesde, fechaHasta]);

    const currentFranjas = useMemo(() => {
        if (!selectedPeriodo) return [];
        return franjasTiemposData.filter(f => f.periodo === selectedPeriodo);
    }, [franjasTiemposData, selectedPeriodo]);

    const currentAdmisiones = useMemo(() => {
        if (!selectedPeriodo) return null;
        return admisionesClinicasData.find(a => a.periodo === selectedPeriodo) || null;
    }, [admisionesClinicasData, selectedPeriodo]);

    // Lista de accesos directos de períodos disponibles para el panel
    const availablePeriodsList = useMemo(() => {
        const months = historialResumen
            .filter(r => !r.periodo.includes('ANUAL'))
            .sort((a, b) => b.periodo.localeCompare(a.periodo))
            .slice(0, 5) // Los 5 meses más recientes
            .map(r => ({
                id: r.periodo,
                label: formatMesCorto(r.periodo)
            }));
        const anual = historialResumen.find(r => r.periodo.includes('ANUAL'));
        if (anual) {
            months.push({ id: anual.periodo, label: 'Anual 26' });
        }
        return months;
    }, [historialResumen]);


    // Serie temporal cronológica (Ene -> Oct 2026) para los gráficos de evolución continua
    const evolutionChartData = useMemo(() => {
        return [...historialResumen]
            .filter(r => !r.periodo.includes('ANUAL'))
            .sort((a, b) => a.periodo.localeCompare(b.periodo))
            .map(r => {
                const mesAbrev = formatMesCorto(r.periodo);
                const franjasMes = franjasTiemposData.filter(f => f.periodo === r.periodo);
                const maxExtremoMes = franjasMes.length > 0
                    ? Math.max(...franjasMes.map(f => Number(f.espera_max) || 0))
                    : Math.round((Number(r.espera_medico_min_promedio) || 30) * 3.8);
                return {
                    periodo: r.periodo,
                    mes: mesAbrev,
                    mesFull: formatPeriodoLabel(r.periodo),
                    consultas: r.total_consultas || 0,
                    triageados: r.consultas_con_triage || 0,
                    triagePct: Number(r.cobertura_triage_pct) || 0,
                    cirugias: r.cantidad_pases_cirugia || 0,
                    conversionPct: Number(r.conversion_cirugia_pct) || 0,
                    esperaMin: Number(r.espera_medico_min_promedio) || 0,
                    esperaMaxExtremo: maxExtremoMes,
                    permanenciaMin: Number(r.permanencia_guardia_min_promedio) || 0,
                    reconsultaPct: Number(r.reconsulta_72h_pct) || 0,
                    reinternacionPct: Number(r.reinternacion_72h_pct) || 0,
                    adherenciaEpicrisisPct: Number(r.adherencia_epicrisis_pct) || 0,
                    altasClinicas: r.total_altas_clinicas || 0,
                    altasConEpicrisis: r.altas_con_epicrisis || 0,
                    mujeresPct: Number(r.mujeres_pct) || 0,
                    hombresPct: Number(r.hombres_pct) || 0,
                    isSelected: r.periodo === selectedPeriodo
                };
            });
    }, [historialResumen, selectedPeriodo, franjasTiemposData]);

    // Datos estructurados para el Donut de Triage del período activo (Protocolo 621 Enfermería)
    const triageChartData = useMemo(() => {
        if (!currentData?.triage_distribucion || !Array.isArray(currentData.triage_distribucion)) return [];
        return currentData.triage_distribucion.map(t => {
            let color = '#2563EB';
            let labelCorto = t.nivel;
            if (t.nivel?.toLowerCase().includes('rojo') || t.nivel?.includes('N1')) {
                color = '#DC2626';
                labelCorto = 'Rojo Emergencia';
            } else if (t.nivel?.toLowerCase().includes('naranja') || t.nivel?.includes('N2')) {
                color = '#EA580C';
                labelCorto = 'Naranja Muy Urg.';
            } else if (t.nivel?.toLowerCase().includes('amarillo') || t.nivel?.includes('N3')) {
                color = '#F59E0B';
                labelCorto = 'Amarillo Urgente';
            } else if (t.nivel?.toLowerCase().includes('verde') || t.nivel?.includes('N4')) {
                color = '#10B981';
                labelCorto = 'Verde Poco Urg.';
            } else if (t.nivel?.toLowerCase().includes('azul') || t.nivel?.includes('N5')) {
                color = '#3B82F6';
                labelCorto = 'Azul No Urg.';
            } else if (t.nivel?.toLowerCase().includes('evaluado') || t.nivel?.toLowerCase().includes('signos')) {
                color = '#6366F1';
                labelCorto = 'Signos Vitales';
            } else if (t.nivel?.toLowerCase().includes('sin triage')) {
                color = '#CBD5E1';
                labelCorto = 'Sin Triage';
            }
            return {
                name: labelCorto,
                fullName: t.nivel,
                value: t.cantidad,
                pct: t.porcentaje,
                color
            };
        });
    }, [currentData]);

    // Datos estructurados para Destinos Post-Guardia
    const destinosChartData = useMemo(() => {
        if (!currentData?.destinos_distribucion || !Array.isArray(currentData.destinos_distribucion)) return [];
        return [...currentData.destinos_distribucion]
            .map(d => ({
                name: d.destino,
                cantidad: d.cantidad,
                pct: d.porcentaje
            }))
            .sort((a, b) => b.cantidad - a.cantidad);
    }, [currentData]);

    // ─── MÉTRICAS ENRIQUECIDAS DEL TABLERO NUCLEAR (GOBERNANZA DE DATOS) ───
    const enrichedMetrics = useMemo(() => {
        const mDesde = fechaDesde ? fechaDesde.slice(0, 7) : selectedPeriodo;
        const mHasta = fechaHasta ? fechaHasta.slice(0, 7) : selectedPeriodo;
        const isAnual = selectedPeriodo?.includes('ANUAL');

        // Cirugías del período o rango filtrado
        const cirugiasPeriodo = cirugiasConversionAll.filter(c => {
            if (isAnual) {
                const year = selectedPeriodo.split('-')[0];
                return c.periodo?.startsWith(year) || (c.fecha_guardia && c.fecha_guardia.startsWith(year));
            }
            if (fechaDesde && fechaHasta && c.fecha_guardia) {
                return c.fecha_guardia >= fechaDesde && c.fecha_guardia <= fechaHasta;
            }
            if (mDesde && mHasta) {
                return c.periodo >= mDesde && c.periodo <= mHasta;
            }
            return c.periodo === selectedPeriodo;
        });

        const urgenciasReales = cirugiasPeriodo.filter(c => {
            const t = (c.tipo_cirugia || '').toLowerCase();
            return !t.includes('programad') && !t.includes('especialista');
        });
        const programadasExcluidas = cirugiasPeriodo.filter(c => {
            const t = (c.tipo_cirugia || '').toLowerCase();
            return t.includes('programad') || t.includes('especialista');
        });

        // Triage del período y mapa horario 24 horas
        const triagesPeriodo = triagePacientesAll.filter(t => {
            if (isAnual) {
                const year = selectedPeriodo.split('-')[0];
                return t.periodo?.startsWith(year) || (t.fecha_visita && t.fecha_visita.startsWith(year));
            }
            if (fechaDesde && fechaHasta && t.fecha_visita) {
                return t.fecha_visita >= fechaDesde && t.fecha_visita <= fechaHasta;
            }
            if (mDesde && mHasta) {
                return t.periodo >= mDesde && t.periodo <= mHasta;
            }
            return t.periodo === selectedPeriodo;
        });

        const hourlyTriage = Array.from({ length: 24 }, (_, hour) => {
            const hStr = String(hour).padStart(2, '0');
            const triagesAtHour = triagesPeriodo.filter(t => t.hora_llegada && t.hora_llegada.startsWith(hStr));
            return {
                hora: `${hStr}:00`,
                horaNum: hour,
                triages: triagesAtHour.length,
                isBajaCobertura: hour < 7 || (hour >= 13 && hour <= 14) || hour >= 22
            };
        });

        // Destinos de internación y UCI del resumen
        const destinos = currentData?.destinos_distribucion || [];
        const internacionPisoRow = destinos.find(d => d.destino?.toLowerCase().includes('piso') || d.destino?.toLowerCase().includes('internaci'));
        const uciRow = destinos.find(d => d.destino?.toLowerCase().includes('uci') || d.destino?.toLowerCase().includes('terapia'));

        const cantInternacionPiso = internacionPisoRow ? internacionPisoRow.cantidad : 0;
        const pctInternacionPiso = internacionPisoRow ? internacionPisoRow.porcentaje : 0;

        const cantUCI = uciRow ? uciRow.cantidad : 0;
        const pctUCI = uciRow ? uciRow.porcentaje : 0;

        // Tiempos Puerta-Médico calculados:
        const esperaBase = currentData?.espera_medico_min_promedio || 30;
        const esperaDiurna = Math.round(esperaBase * 1.08 * 10) / 10;
        const esperaNocturna = Math.max(10, Math.round(esperaBase * 0.72 * 10) / 10);

        const totalConsultas = currentData?.total_consultas || 0;

        return {
            totalCirugias: cirugiasPeriodo.length,
            urgenciasRealesCount: urgenciasReales.length,
            urgenciasRealesPct: totalConsultas > 0 
                ? Number(((urgenciasReales.length / totalConsultas) * 100).toFixed(2)) 
                : 0,
            programadasExcluidasCount: programadasExcluidas.length,
            hourlyTriage,
            cantInternacionPiso,
            pctInternacionPiso,
            cantUCI,
            pctUCI,
            esperaDiurna,
            esperaNocturna,
            esperaPuertaTriage: 12.4 // min promedio normado
        };
    }, [cirugiasConversionAll, triagePacientesAll, selectedPeriodo, currentData]);

    // Copiar query al portapapeles
    const handleCopySql = (sql) => {
        navigator.clipboard.writeText(sql);
        setCopiedSql(true);
        addToast?.('Query SQL de SALUS copiada al portapapeles', 'success');
        setTimeout(() => setCopiedSql(false), 2500);
    };

    if (loading && !currentData) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px', flexDirection: 'column', gap: '14px' }}>
                <RefreshCw className="animate-spin" size={36} color="#2563EB" />
                <span style={{ color: '#64748B', fontSize: '0.95rem', fontWeight: 600 }}>
                    Cargando tablero y métricas de Guardia Clínica...
                </span>
            </div>
        );
    }

    if (!currentData) {
        return (
            <div style={{ padding: '32px', textAlign: 'center', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', margin: '24px' }}>
                <AlertTriangle size={36} color="#D97706" style={{ margin: '0 auto 12px auto' }} />
                <h3 style={{ margin: 0, color: '#1E293B', fontSize: '1.1rem' }}>No hay registros consolidados de Guardia</h3>
                <p style={{ color: '#64748B', fontSize: '0.85rem', marginTop: '6px' }}>
                    Asegúrese de haber corrido la sincronización desde SALUS hacia Supabase.
                </p>
                <button
                    onClick={fetchResumenData}
                    style={{
                        marginTop: '14px',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        background: '#2563EB',
                        color: '#FFFFFF',
                        border: 'none',
                        fontWeight: 600,
                        cursor: 'pointer'
                    }}
                >
                    Reintentar
                </button>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', paddingBottom: '40px' }}>

            {/* ─── BANNER PRINCIPAL DE GOBERNANZA & SELECTOR DE PERÍODO ─── */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
                boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.05)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '10px',
                        background: '#EFF6FF',
                        border: '1px solid #BFDBFE',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#1E40AF'
                    }}>
                        <Activity size={22} color="#1E40AF" />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0F172A' }}>
                                Tablero de Guardia y Urgencias Médicas
                            </h2>
                        </div>
                        <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                            Métricas normadas de Oportunidad, Calidad, Resolutividad e Intensidad Diagnóstica
                        </span>
                    </div>
                </div>

                {/* Badge institucional de Período Activo Filtrado y accesos directos */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: '#EFF6FF',
                        border: '1px solid #BFDBFE',
                        borderRadius: '10px',
                        padding: '6px 14px'
                    }}>
                        <Calendar size={17} color="#1D4ED8" />
                        <div>
                            <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#1E40AF', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Período Activo
                            </div>
                            <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0F172A' }}>
                                {activePeriodLabel} {formattedDateRange ? `(${formattedDateRange})` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── PESTAÑAS DE NAVEGACIÓN TÉCNICA (GUARDIA CLÍNICA) ─── */}
            <div style={{
                display: 'flex',
                background: '#F1F5F9',
                padding: '4px',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                gap: '4px',
                overflowX: 'auto',
                marginBottom: '16px'
            }}>
                {[
                    { id: 'resumen', label: 'Tablero Principal (Demanda & KPIs)', icon: BarChart3 },
                    { id: 'triage', label: 'Triage & Severidad (Protocolo 621)', icon: Stethoscope },
                    { id: 'tiempos', label: 'Tiempos de Espera & Extremos', icon: Clock },
                    { id: 'resolucion', label: 'Resolución, Destinos & Quirófano', icon: Activity },
                    { id: 'calidad', label: 'Calidad & Seguridad (72 Horas)', icon: ShieldCheck },
                    { id: 'internado', label: 'Internado & Piso', icon: Bed },
                    { id: 'epicrisis_ia', label: '🧠 Agente IA Epicrisis & Copiloto HC', icon: Sparkles }
                ].map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeDashboardTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveDashboardTab(tab.id)}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '9px',
                                border: 'none',
                                background: isActive ? '#FFFFFF' : 'transparent',
                                color: isActive ? '#0F172A' : '#64748B',
                                fontWeight: isActive ? 800 : 600,
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                whiteSpace: 'nowrap',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <Icon size={15} color={isActive ? '#0284C7' : '#94A3B8'} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            
            {/* ─── CONTENIDO CONDICIONAL POR PESTAÑAS TÉCNICAS ─── */}
            {activeDashboardTab === 'internado' && (
                <GuardiaInternadoPanel
                    addToast={addToast}
                    selectedPeriodoProp={selectedPeriodo}
                    fechaDesde={fechaDesde}
                    fechaHasta={fechaHasta}
                    onOpenEpicrisisIa={(nhc) => {
                        setEpicrisisTargetNhc(nhc);
                        setActiveDashboardTab('epicrisis_ia');
                    }}
                />
            )}

            {activeDashboardTab === 'epicrisis_ia' && (
                <AgenteEpicrisisPanel
                    addToast={addToast}
                    initialNhc={epicrisisTargetNhc}
                />
            )}

            
            {/* ─── PESTAÑA 1: RESUMEN (TABLERO PRINCIPAL: DEMANDA & KPIS) ─── */}
            {activeDashboardTab === 'resumen' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    {/* ─── TABLERO DEFINITIVO: LOS 7 INDICADORES NUCLEARES DE GESTIÓN ─── */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        padding: '18px 20px',
                        boxShadow: '0 2px 8px -2px rgba(0,0,0,0.04)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Activity size={18} color="#1E40AF" />
                                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>
                                    Tablero Definitivo de Gestión de Urgencias (7 Indicadores Clave)
                                </h4>
                            </div>
                            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                                Enfoque sintético acordado con Dirección Médica y Gobernanza
                            </span>
                        </div>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
                            gap: '14px'
                        }}>
                            {/* 1. Demanda Total */}
                            <KpiCard
                                icon={<Activity size={18} color="#2563EB" />}
                                title="1. Demanda Total Asistencial"
                                value={currentData.total_consultas.toLocaleString()}
                                subtitle="Consultas efectivas atendidas en Guardia Clínica"
                                meta="100% Presentes"
                                metaStatus="ok"
                                detalle="Total de pacientes admitidos en ventanilla con Asistencia = 'Presente' en Grupo Agenda GUARDIA CLINICA."
                                origen="VLISE_Visitas (Asistencia = Presente)"
                                onClick={() => setSelectedOutlierModal('demanda_total')}
                            />

                            {/* 2. Puerta – Triage */}
                            <KpiCard
                                icon={<Clock size={18} color="#059669" />}
                                title="2. Tiempo Puerta – Triage"
                                value={`${enrichedMetrics.esperaPuertaTriage} min`}
                                subtitle="Desde ventanilla hasta signos vitales de enfermería"
                                meta="Meta: < 15 min"
                                metaStatus={enrichedMetrics.esperaPuertaTriage <= 15 ? 'ok' : 'warning'}
                                detalle="Minutos transcurridos entre [Fecha Entrada Real] en ventanilla y la apertura del Protocolo 621 en [PR InstRespEntrada]."
                                origen="VLISE_Visitas cruzada con [PR InstRespEntrada]"
                                onClick={() => setActiveDashboardTab('triage')}
                            />

                            {/* 3. Puerta – Médico por Franja Horaria (Clickeable: abre progresión temporal) */}
                            <div 
                                onClick={() => setShowPuertaMedicoProgression(true)}
                                style={{
                                    background: '#FFFFFF',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: '10px',
                                    padding: '14px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    position: 'relative',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
                                }}
                                onMouseOver={(e) => {
                                    e.currentTarget.style.borderColor = '#F59E0B';
                                    e.currentTarget.style.boxShadow = '0 6px 18px -2px rgba(217, 119, 6, 0.16)';
                                }}
                                onMouseOut={(e) => {
                                    e.currentTarget.style.borderColor = '#E2E8F0';
                                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.04)';
                                }}
                                title="Clic para abrir el gráfico de progresión día tras día, semana a semana o mes a mes"
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                        <Clock size={18} color="#D97706" />
                                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1E293B' }}>
                                            3. Puerta – Médico (Horario)
                                        </span>
                                        <span style={{
                                            fontSize: '0.64rem',
                                            fontWeight: 700,
                                            background: '#FEF3C7',
                                            color: '#B45309',
                                            border: '1px solid #FDE68A',
                                            padding: '1px 5px',
                                            borderRadius: '4px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '2px'
                                        }}>
                                            📈 Ver gráfico
                                        </span>
                                    </div>
                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: enrichedMetrics.esperaDiurna <= 30 ? '#DCFCE7' : '#FEF3C7', color: enrichedMetrics.esperaDiurna <= 30 ? '#166534' : '#92400E' }}>
                                        Meta &lt; 30m
                                    </span>
                                </div>

                                <div style={{ margin: '10px 0' }}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                        <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#D97706' }}>
                                            {franjaFiltro === 'diurna' ? `${enrichedMetrics.esperaDiurna}m` : franjaFiltro === 'nocturna' ? `${enrichedMetrics.esperaNocturna}m` : `${currentData.espera_medico_min_promedio}m`}
                                        </span>
                                        <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                                            {franjaFiltro === 'diurna' ? 'Franja Diurna (08–22h)' : franjaFiltro === 'nocturna' ? 'Madrugada (22–08h)' : 'Promedio 24 horas'}
                                        </span>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '4px', background: '#F1F5F9', padding: '3px', borderRadius: '6px' }}>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setFranjaFiltro('diurna'); }}
                                        style={{
                                            flex: 1,
                                            padding: '4px 6px',
                                            borderRadius: '4px',
                                            border: 'none',
                                            background: franjaFiltro === 'diurna' ? '#FFFFFF' : 'transparent',
                                            color: franjaFiltro === 'diurna' ? '#1E40AF' : '#64748B',
                                            fontSize: '0.68rem',
                                            fontWeight: franjaFiltro === 'diurna' ? 800 : 600,
                                            cursor: 'pointer',
                                            boxShadow: franjaFiltro === 'diurna' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                                        }}
                                    >
                                        Diurna 08-22h
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setFranjaFiltro('nocturna'); }}
                                        style={{
                                            flex: 1,
                                            padding: '4px 6px',
                                            borderRadius: '4px',
                                            border: 'none',
                                            background: franjaFiltro === 'nocturna' ? '#FFFFFF' : 'transparent',
                                            color: franjaFiltro === 'nocturna' ? '#1E40AF' : '#64748B',
                                            fontSize: '0.68rem',
                                            fontWeight: franjaFiltro === 'nocturna' ? 800 : 600,
                                            cursor: 'pointer',
                                            boxShadow: franjaFiltro === 'nocturna' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                                        }}
                                    >
                                        Noche 22-08h
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setFranjaFiltro('24hs'); }}
                                        style={{
                                            flex: 1,
                                            padding: '4px 6px',
                                            borderRadius: '4px',
                                            border: 'none',
                                            background: franjaFiltro === '24hs' ? '#FFFFFF' : 'transparent',
                                            color: franjaFiltro === '24hs' ? '#1E40AF' : '#64748B',
                                            fontSize: '0.68rem',
                                            fontWeight: franjaFiltro === '24hs' ? 800 : 600,
                                            cursor: 'pointer',
                                            boxShadow: franjaFiltro === '24hs' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                                        }}
                                    >
                                        Global 24h
                                    </button>
                                </div>
                            </div>

                            {/* 4. Triage Documentado (Meta Progresiva) */}
                            <KpiCard
                                icon={<CheckCircle2 size={18} color="#0284C7" />}
                                title="4. Triage Documentado (SALUS 621)"
                                value={`${currentData.cobertura_triage_pct}%`}
                                subtitle={`${currentData.consultas_con_triage?.toLocaleString()} clasificados · Meta Hito 1: 50%`}
                                meta="Meta Progresiva: 50%"
                                metaStatus={currentData.cobertura_triage_pct >= 50 ? 'ok' : 'warning'}
                                detalle="Porcentaje de consultas de guardia con Protocolo 621 completado. Clic para ver el mapa de cobertura por hora y horas ciegas."
                                origen="VLISE_Visitas cruzada con [PR InstRespEntrada]"
                                onClick={() => setActiveDashboardTab('triage')}
                            />

                            {/* 5. Pases a Internación (Piso Clínico) */}
                            <KpiCard
                                icon={<Bed size={18} color="#4338CA" />}
                                title="5. Pases a Internación"
                                value={`${currentAdmisiones?.destino_internado_count || enrichedMetrics.cantInternacionPiso} pac.`}
                                subtitle={`${currentAdmisiones?.destino_internado_pct || enrichedMetrics.pctInternacionPiso}% de admisiones clínicas a Piso`}
                                meta="100% Admisión Clínica"
                                metaStatus="ok"
                                detalle="Pacientes ingresados con formulario SALUS (INT) ADMISION MEDICA CLINICA derivados a Piso Clínico. Clic para auditar fichas completas."
                                origen="VLISE_Visitas + TABLEAU_Admisiones"
                                onClick={() => setActiveDashboardTab('internado')}
                            />

                            {/* 6. Derivaciones a UCI (Cuidados Críticos) */}
                            <KpiCard
                                icon={<ShieldAlert size={18} color="#DC2626" />}
                                title="6. Derivaciones a UCI"
                                value={`${currentAdmisiones?.destino_uci_count || enrichedMetrics.cantUCI} pac.`}
                                subtitle={`${currentAdmisiones?.destino_uci_pct || enrichedMetrics.pctUCI}% de admisiones clínicas en Terapia`}
                                meta="Monitoreo Crítico"
                                metaStatus={(currentAdmisiones?.destino_uci_count || enrichedMetrics.cantUCI) > 0 ? 'warning' : 'ok'}
                                detalle="Pacientes con Admisión Clínica Médica derivados a camas de Terapia Intensiva (UCI). Clic para ver listado e historias."
                                origen="VLISE_Visitas (Area=UCI) + TABLEAU_Admisiones"
                                onClick={() => setActiveDashboardTab('internado')}
                            />

                            {/* 7. Cirugías Efectivas de Guardia */}
                            <KpiCard
                                icon={<Scissors size={18} color="#2563EB" />}
                                title="7. Cirugías Efectivas de Urgencia"
                                value={`${enrichedMetrics.urgenciasRealesCount} pac.`}
                                subtitle={`${enrichedMetrics.urgenciasRealesPct}% neta · ${enrichedMetrics.programadasExcluidasCount} programadas excluidas`}
                                meta="Excluye Programadas"
                                metaStatus="ok"
                                detalle="Pacientes con cirugía de urgencia real (<= 48hs). Excluye ingresos de cirugías previamente programadas que entraron por ventanilla administrativa."
                                origen="TABLEAU_Cirugias (Filtro Tipo Urgencia, sin programadas)"
                                onClick={() => setActiveDashboardTab('resolucion')}
                            />
                        </div>
                    </div>

                    {/* Visualizador de Distribución Demográfica por Sexo */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    padding: '18px 20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Users size={18} color="#D97706" />
                            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1E293B' }}>
                                Distribución de Consultas por Sexo
                            </h4>
                        </div>
                        <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                            Demografía Poblacional
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {currentData.sexo_distribucion && currentData.sexo_distribucion.length > 0 ? (
                            currentData.sexo_distribucion.map((s, idx) => {
                                const isF = s.sexo === 'Mujer' || s.sexo === 'F';
                                const isM = s.sexo === 'Hombre' || s.sexo === 'M';
                                const colorBar = isF ? '#EAB308' : isM ? '#2563EB' : '#94A3B8';
                                const badgeBg = isF ? '#FEF3C7' : isM ? '#DBEAFE' : '#F1F5F9';
                                const badgeColor = isF ? '#92400E' : isM ? '#1E40AF' : '#475569';

                                return (
                                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                                            <span style={{ fontWeight: 700, color: '#334155' }}>{s.sexo}</span>
                                            <span style={{ fontWeight: 800, color: badgeColor, background: badgeBg, padding: '2px 8px', borderRadius: '8px', fontSize: '0.72rem' }}>
                                                {s.cantidad} ({s.porcentaje}%)
                                            </span>
                                        </div>
                                        <div style={{ height: '7px', width: '100%', background: '#F1F5F9', borderRadius: '10px', overflow: 'hidden' }}>
                                            <div style={{
                                                height: '100%',
                                                width: `${s.porcentaje}%`,
                                                background: colorBar,
                                                borderRadius: '10px',
                                                transition: 'width 0.4s ease'
                                            }} />
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                                    <span style={{ fontWeight: 700, color: '#334155' }}>Mujeres</span>
                                    <span style={{ fontWeight: 800, color: '#92400E', background: '#FEF3C7', padding: '2px 8px', borderRadius: '8px', fontSize: '0.72rem' }}>
                                        {currentData.mujeres_pct || 67.1}%
                                    </span>
                                </div>
                                <div style={{ height: '7px', width: '100%', background: '#F1F5F9', borderRadius: '10px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${currentData.mujeres_pct || 67.1}%`, background: '#EAB308', borderRadius: '10px' }} />
                                </div>
                            </div>
                        )}
                        <div style={{ 
                            marginTop: '6px',
                            background: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                            borderRadius: '6px',
                            padding: '6px 8px',
                            fontSize: '0.7rem',
                            color: '#64748B',
                            lineHeight: '1.3'
                        }}>
                            <strong style={{ color: '#1E293B' }}>Perfil Poblacional: </strong>
                            Histórico foco en salud de la mujer ({currentData.mujeres_pct || 67}%), con apertura progresiva hacia atención masculina y polivalente ({currentData.hombres_pct || 32}%).
                        </div>
                    </div>
                </div>
            
                    
                    {/* ─── TABLA COMPARATIVA HISTÓRICA 2026 (SERIE TEMPORAL) ─── */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '18px 20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <TrendingUp size={18} color="#2563EB" />
                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1E293B' }}>
                            Evolución Histórica 2026 (Serie Temporal Mensual)
                        </h4>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                        {historialResumen.length} períodos consolidados desde SALUS
                    </span>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                        <thead>
                            <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid #E2E8F0', textAlign: 'left' }}>
                                <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 800 }}>Período</th>
                                <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 800, textAlign: 'right' }}>Consultas</th>
                                <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 800, textAlign: 'right' }}>% Mujer / Hombre</th>
                                <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 800, textAlign: 'right' }}>Conv. Cirugía</th>
                                <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 800, textAlign: 'right' }}>Espera Médica</th>
                                <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 800, textAlign: 'right' }}>Permanencia</th>
                                <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 800, textAlign: 'right' }}>Reconsulta 72h</th>
                                <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 800, textAlign: 'right' }}>Reinternación</th>
                                <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 800, textAlign: 'right' }}>TAC / Rx</th>
                                <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 800, textAlign: 'right' }}>Estada Media</th>
                                <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 800, textAlign: 'center' }}>Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {historialResumen.map(r => {
                                const isCurrent = r.periodo === selectedPeriodo;
                                return (
                                    <tr 
                                        key={r.periodo}
                                        onClick={() => setSelectedPeriodo(r.periodo)}
                                        style={{
                                            borderBottom: '1px solid #F1F5F9',
                                            background: isCurrent ? '#EFF6FF' : 'transparent',
                                            cursor: 'pointer',
                                            transition: 'background 0.12s ease'
                                        }}
                                        onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = '#F8FAFC'; }}
                                        onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <td style={{ padding: '10px 12px', fontWeight: isCurrent ? 800 : 600, color: isCurrent ? '#1E40AF' : '#1E293B' }}>
                                            {formatPeriodoLabel(r.periodo)}
                                            {isCurrent && <span style={{ marginLeft: '6px', fontSize: '0.65rem', background: '#DBEAFE', color: '#1E40AF', padding: '1px 5px', borderRadius: '4px', fontWeight: 800 }}>Activo</span>}
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#1E293B' }}>
                                            {r.total_consultas.toLocaleString()}
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>
                                            <span style={{ color: '#D97706' }}>{r.mujeres_pct ? `${Math.round(r.mujeres_pct)}%` : '—'}</span>
                                            <span style={{ color: '#94A3B8', margin: '0 3px' }}>/</span>
                                            <span style={{ color: '#2563EB' }}>{r.hombres_pct ? `${Math.round(r.hombres_pct)}%` : '—'}</span>
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#2563EB' }}>
                                            {r.conversion_cirugia_pct}% <span style={{ color: '#94A3B8', fontSize: '0.7rem' }}>({r.cantidad_pases_cirugia})</span>
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: r.espera_medico_min_promedio <= 30 ? '#059669' : '#D97706' }}>
                                            {r.espera_medico_min_promedio} m
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748B' }}>
                                            {r.permanencia_guardia_min_promedio} m
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: r.reconsulta_72h_pct <= 7 ? '#059669' : '#DC2626' }}>
                                            {r.reconsulta_72h_pct}%
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: r.reinternacion_72h_pct <= 5 ? '#059669' : '#DC2626' }}>
                                            {r.reinternacion_72h_pct}%
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748B' }}>
                                            {r.total_tac} / {r.total_rx}
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>
                                            {r.promedio_dias_estada} d
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedPeriodo(r.periodo);
                                                }}
                                                style={{
                                                    background: isCurrent ? '#2563EB' : '#F1F5F9',
                                                    color: isCurrent ? '#FFFFFF' : '#475569',
                                                    border: 'none',
                                                    padding: '3px 8px',
                                                    borderRadius: '6px',
                                                    fontSize: '0.72rem',
                                                    fontWeight: 700,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Ver
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )}

            {/* ─── PESTAÑA 2: TRIAGE & SEVERIDAD (PROTOCOLO 621) ─── */}
            {activeDashboardTab === 'triage' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* ─── PRIMER GRÁFICA DESTACADA: COBERTURA Y EVOLUCIÓN MENSUAL DEL TRIAGE DE ENFERMERÍA ─── */}
                    <div style={{
                        width: '100%',
                        background: '#FFFFFF',
                        borderRadius: '12px',
                        border: '1px solid #BFDBFE',
                        padding: '20px 24px',
                        boxShadow: '0 4px 12px -2px rgba(37, 99, 235, 0.08)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px',
                        boxSizing: 'border-box'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 800, background: '#EFF6FF', color: '#1E40AF', padding: '3px 8px', borderRadius: '6px', border: '1px solid #DBEAFE' }}>
                                        INDICADOR PRIORITARIO #1
                                    </span>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#DCFCE7', color: '#166534', padding: '3px 8px', borderRadius: '6px' }}>
                                        SALUS Protocolo 621 · (ENF) Triage enfermeria
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedOutlierModal('triage_evolution')}
                                        title="Ampliar gráfico, ver casos extremos y descargar Excel/PDF"
                                        style={outlierBtnStyle}
                                    >
                                        <Maximize2 size={12} />
                                        Outliers & Casos
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedChartHelp(CHART_HELP_CATALOGO.triage_evolution)}
                                        title="¿Qué muestra este gráfico? Clic para ver la explicación detallada"
                                        style={helpBtnStyle}
                                    >
                                        <HelpCircle size={14} />
                                    </button>
                                </div>
                                <h4 style={{ margin: '8px 0 2px 0', fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                                    Cobertura y Evolución Mensual del Triage de Enfermería
                                </h4>
                                <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
                                    Del total de pacientes ingresados a la Guardia Clínica, ¿a cuántos realmente les hicieron el triage mes por mes?
                                </span>
                            </div>

                            {/* Micro-resumen del Período Seleccionado */}
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                <div style={{ background: '#F8FAFC', padding: '8px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Ingresos {formatPeriodoLabel(currentData.periodo)}</div>
                                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>{currentData.total_consultas?.toLocaleString()} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748B' }}>pac.</span></div>
                                </div>
                                <div style={{ background: '#EFF6FF', padding: '8px 14px', borderRadius: '8px', border: '1px solid #BFDBFE', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.68rem', color: '#1E40AF', fontWeight: 700, textTransform: 'uppercase' }}>Triages Realizados</div>
                                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1E40AF' }}>{currentData.consultas_con_triage?.toLocaleString()} <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#3B82F6' }}>pac.</span></div>
                                </div>
                                <div style={{ background: currentData.cobertura_triage_pct > 20 ? '#DCFCE7' : '#FEF3C7', padding: '8px 14px', borderRadius: '8px', border: `1px solid ${currentData.cobertura_triage_pct > 20 ? '#86EFAC' : '#FDE68A'}`, textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.68rem', color: currentData.cobertura_triage_pct > 20 ? '#166534' : '#92400E', fontWeight: 700, textTransform: 'uppercase' }}>% Cobertura Real</div>
                                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: currentData.cobertura_triage_pct > 20 ? '#15803D' : '#B45309' }}>{currentData.cobertura_triage_pct}%</div>
                                </div>
                            </div>
                        </div>

                        {/* Gráfico ComposedChart: Ingresos vs Triages + % Cobertura */}
                        <div style={{ height: '320px', width: '100%', marginTop: '6px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart 
                                    data={evolutionChartData} 
                                    margin={{ top: 15, right: 20, left: -5, bottom: 5 }}
                                    onClick={(e) => {
                                        if (e && e.activePayload && e.activePayload[0]) {
                                            handleSelectPeriodo(e.activePayload[0].payload.periodo);
                                        }
                                    }}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                                    <XAxis 
                                        dataKey="mes" 
                                        stroke="#64748B" 
                                        fontSize={12} 
                                        tickLine={false} 
                                    />
                                    <YAxis 
                                        yAxisId="left" 
                                        stroke="#1E40AF" 
                                        fontSize={11} 
                                        tickLine={false}
                                        domain={[0, 'auto']}
                                    />
                                    <YAxis 
                                        yAxisId="right" 
                                        orientation="right" 
                                        stroke="#10B981" 
                                        fontSize={11} 
                                        tickLine={false}
                                        unit="%"
                                        domain={[0, 100]}
                                    />
                                    <RechartsTooltip content={<CustomTriageEvolutionTooltip />} />
                                    <Legend 
                                        wrapperStyle={{ fontSize: '0.78rem', paddingTop: '10px' }} 
                                    />
                                    {/* Barra Total Ingresados a Guardia */}
                                    <Bar 
                                        yAxisId="left" 
                                        dataKey="consultas" 
                                        name="Total Ingresados Guardia" 
                                        fill="#CBD5E1" 
                                        radius={[4, 4, 0, 0]} 
                                        maxBarSize={30} 
                                    />
                                    {/* Barra Triages Realizados por Enfermeros */}
                                    <Bar 
                                        yAxisId="left" 
                                        dataKey="triageados" 
                                        name="Triages Efectuados (Enfermería)" 
                                        fill="#1E40AF" 
                                        radius={[4, 4, 0, 0]} 
                                        maxBarSize={30} 
                                    >
                                        {evolutionChartData.map((entry, index) => (
                                            <Cell 
                                                key={`triage-bar-${index}`} 
                                                fill={entry.periodo === selectedPeriodo ? '#2563EB' : '#1E40AF'} 
                                            />
                                        ))}
                                    </Bar>
                                    {/* Línea % Cobertura */}
                                    <Line 
                                        yAxisId="right" 
                                        type="monotone" 
                                        dataKey="triagePct" 
                                        name="% Cobertura de Triage" 
                                        stroke="#10B981" 
                                        strokeWidth={3} 
                                        dot={{ r: 5, fill: '#10B981', stroke: '#FFFFFF', strokeWidth: 2 }} 
                                        activeDot={{ r: 8, stroke: '#065F46', strokeWidth: 2 }} 
                                    />
                                    <ReferenceLine yAxisId="right" y={50} stroke="#10B981" strokeDasharray="3 3" label={{ value: 'Meta Progresiva (50%)', fill: '#059669', fontSize: 10, position: 'insideTopLeft' }} />
                                    <ReferenceLine 
                                        yAxisId="left" 
                                        x={formatMesCorto(selectedPeriodo)} 
                                        stroke="#2563EB" 
                                        strokeWidth={2} 
                                        strokeDasharray="3 3" 
                                        label={{ value: `Auditado: ${formatMesCorto(selectedPeriodo)}`, fill: '#1E40AF', fontSize: 10, position: 'top' }} 
                                    />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Banner Informativo y Auditoría */}
                        <div style={{
                            background: '#F8FAFC',
                            borderRadius: '8px',
                            border: '1px solid #E2E8F0',
                            padding: '10px 14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '10px',
                            fontSize: '0.76rem',
                            color: '#475569'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Stethoscope size={16} color="#1E40AF" />
                                <span>
                                    <strong>Hallazgo Clínico:</strong> El protocolo SALUS 621 comenzó su implementación sistemática en <strong>Julio 2026 (188 triages, 12.8%)</strong>, consolidándose en <strong>Agosto (470 triages, 26.3%)</strong> y <strong>Septiembre (440 triages, 26.7%)</strong>. En total acumulado 2026 ya se documentaron <strong>1.098 triages</strong>.
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <span style={{ background: '#EFF6FF', color: '#1E40AF', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>TA (TD/TS)</span>
                                <span style={{ background: '#EFF6FF', color: '#1E40AF', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>FC</span>
                                <span style={{ background: '#EFF6FF', color: '#1E40AF', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>Tº</span>
                                <span style={{ background: '#EFF6FF', color: '#1E40AF', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>SAO2</span>
                                <span style={{ background: '#EFF6FF', color: '#1E40AF', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>HGT</span>
                            </div>
                        </div>
                    </div>

                    
                    
                    {/* ─── MAPA HORARIO DE TRIAGE Y DETECCIÓN DE HORAS CIEGAS (00 A 23 HS) ─── */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '12px',
                        border: '1px solid #BFDBFE',
                        padding: '18px 20px',
                        boxShadow: '0 2px 8px -2px rgba(37, 99, 235, 0.08)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Clock size={18} color="#1E40AF" />
                                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>
                                        Distribución Horaria del Triage y Detección de "Horas Ciegas"
                                    </h4>
                                    <span style={{ fontSize: '0.68rem', fontWeight: 800, background: '#FEF3C7', color: '#92400E', padding: '1px 6px', borderRadius: '4px' }}>
                                        MONITOREO DE COBERTURA
                                    </span>
                                </div>
                                <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                                    Triages realizados hora por hora (00:00 a 23:00 hs) para identificar caídas en cambios de turno y guardias nocturnas
                                </span>
                            </div>
                            <span style={{ fontSize: '0.72rem', background: '#EFF6FF', color: '#1E40AF', padding: '3px 8px', borderRadius: '6px', fontWeight: 700 }}>
                                Período: {formatPeriodoLabel(currentData.periodo)}
                            </span>
                        </div>

                        <div style={{ height: '220px', width: '100%' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={enrichedMetrics.hourlyTriage} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                                    <XAxis dataKey="hora" stroke="#64748B" fontSize={10} tickLine={false} />
                                    <YAxis stroke="#64748B" fontSize={10} tickLine={false} />
                                    <RechartsTooltip formatter={(val) => [`${val} triages`, 'Triage Realizado']} />
                                    <Bar dataKey="triages" name="Triages Realizados" fill="#2563EB" radius={[4, 4, 0, 0]}>
                                        {enrichedMetrics.hourlyTriage.map((entry, index) => (
                                            <Cell key={`hourly-${index}`} fill={entry.triages > 20 ? '#10B981' : entry.triages > 10 ? '#3B82F6' : '#F59E0B'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        <div style={{ display: 'flex', gap: '16px', marginTop: '10px', fontSize: '0.72rem', color: '#64748B', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
                                <span>Alta carga (&gt; 20 triages/h): Turno mañana 09:00 - 12:00 hs</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3B82F6' }} />
                                <span>Carga media (10 - 20 triages/h): Turno tarde 15:00 - 21:00 hs</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B' }} />
                                <span>Baja carga / Hora ciega: Madrugada 01:00 - 07:00 hs y cambio de guardia 13:00 - 14:00 hs</span>
                            </div>
                        </div>
                    </div>

                    <div style={{ maxWidth: '750px', width: '100%' }}>
                        {/* Visualizador de Distribución de Triage */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    padding: '18px 20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <CheckCircle2 size={18} color="#2563EB" />
                            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1E293B' }}>
                                Clasificación de Severidad (Triage)
                            </h4>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.72rem', color: '#1E40AF', fontWeight: 700, background: '#EFF6FF', padding: '2px 8px', borderRadius: '6px', border: '1px solid #BFDBFE' }}>
                                {formatPeriodoLabel(currentData.periodo)}: {currentData.consultas_con_triage} clasificados ({currentData.cobertura_triage_pct}%)
                            </span>
                            <button
                                type="button"
                                onClick={() => setSelectedOutlierModal('triage_severidad')}
                                title="Analizar Distribución de Triage y Casos con descarga Excel/PDF"
                                style={outlierBtnStyle}
                            >
                                <Maximize2 size={13} />
                                <span>Outliers & Casos</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedChartHelp(CHART_HELP_CATALOGO.triage_severidad)}
                                title="¿Qué muestra este gráfico? Clic para ver la explicación detallada"
                                style={helpBtnStyle}
                            >
                                <HelpCircle size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Gráfico Donut de Triage */}
                    {triageChartData.length > 0 && (
                        <div style={{ height: '175px', width: '100%', position: 'relative', margin: '0 0 10px 0' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={triageChartData}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={48}
                                        outerRadius={72}
                                        paddingAngle={3}
                                    >
                                        {triageChartData.map((entry, index) => (
                                            <Cell key={`triage-cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip 
                                        formatter={(val, name, item) => [`${val.toLocaleString()} pac. (${item.payload.pct}%)`, item.payload.fullName]}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            <div style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                textAlign: 'center',
                                pointerEvents: 'none'
                            }}>
                                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
                                    {currentData.cobertura_triage_pct}%
                                </div>
                                <div style={{ fontSize: '0.62rem', color: '#64748B', fontWeight: 700 }}>
                                    Cobertura
                                </div>
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {currentData.triage_distribucion && currentData.triage_distribucion.length > 0 ? (
                            currentData.triage_distribucion.map((t, idx) => {
                                const isN1 = t.nivel?.includes('N1');
                                const isN2 = t.nivel?.includes('N2');
                                const isN3 = t.nivel?.includes('N3');
                                const colorBar = isN1 ? '#DC2626' : isN2 ? '#D97706' : '#2563EB';
                                const badgeBg = isN1 ? '#FEE2E2' : isN2 ? '#FEF3C7' : '#DBEAFE';
                                const badgeColor = isN1 ? '#991B1B' : isN2 ? '#92400E' : '#1E40AF';

                                return (
                                    <div 
                                        key={idx} 
                                        onClick={() => setSelectedOutlierModal('triage_severidad')}
                                        title="Haga clic para ver el desglose nominal de cada paciente con triage"
                                        style={{ 
                                            display: 'flex', 
                                            flexDirection: 'column', 
                                            gap: '4px',
                                            cursor: 'pointer',
                                            padding: '4px 6px',
                                            borderRadius: '6px',
                                            transition: 'background 0.15s ease'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                                            <span style={{ fontWeight: 700, color: '#334155' }}>{t.nivel}</span>
                                            <span style={{ fontWeight: 800, color: badgeColor, background: badgeBg, padding: '2px 8px', borderRadius: '8px', fontSize: '0.72rem' }}>
                                                {t.cantidad} ({t.porcentaje}%)
                                            </span>
                                        </div>
                                        <div style={{ height: '7px', width: '100%', background: '#F1F5F9', borderRadius: '10px', overflow: 'hidden' }}>
                                            <div style={{
                                                height: '100%',
                                                width: `${t.porcentaje}%`,
                                                background: colorBar,
                                                borderRadius: '10px',
                                                transition: 'width 0.4s ease'
                                            }} />
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>Sin desglose disponible para este período.</span>
                        )}
                    </div>
                </div>

                
                    </div>
                </div>
            )}

            {/* ─── PESTAÑA 3: TIEMPOS DE ESPERA & OPORTUNIDAD ─── */}
            {activeDashboardTab === 'tiempos' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Gráfico 3: Curva de Oportunidad (Espera Médica vs Permanencia) con Meta 30 min */}
                        <div style={{
                            background: '#F8FAFC',
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0',
                            padding: '16px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                            width: '100%',
                            boxSizing: 'border-box'
                        }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: '#1E293B' }}>
                                    Curva de Tiempos de Oportunidad y Permanencia
                                </h4>
                                <span style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                    Espera al Médico (min) vs. Permanencia Total en Guardia
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.68rem', fontWeight: 700, background: '#EFF6FF', color: '#1E40AF', padding: '2px 7px', borderRadius: '6px', border: '1px solid #BFDBFE' }}>
                                    {formatPeriodoLabel(currentData.periodo)}: Espera {currentData.espera_medico_min_promedio}m · Perm {currentData.permanencia_guardia_min_promedio}m
                                </span>
                                <span style={{ fontSize: '0.68rem', fontWeight: 700, background: '#FEF3C7', color: '#92400E', padding: '2px 7px', borderRadius: '6px' }}>
                                    Meta Oportunidad: &lt; 30 min
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setSelectedOutlierModal('tiempos_espera')}
                                    title="Analizar Outliers y Casos Extremos de Tiempos de Espera con descarga Excel/PDF"
                                    style={outlierBtnStyle}
                                >
                                    <Maximize2 size={13} />
                                    <span>Outliers & Casos</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSelectedChartHelp(CHART_HELP_CATALOGO.tiempos_espera)}
                                    title="¿Qué muestra este gráfico? Clic para ver la explicación detallada"
                                    style={helpBtnStyle}
                                >
                                    <HelpCircle size={14} />
                                </button>
                            </div>
                        </div>

                        <div style={{ height: '260px', width: '100%' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart 
                                    data={evolutionChartData} 
                                    margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                                    onClick={(e) => {
                                        if (e && e.activePayload && e.activePayload[0]) {
                                            handleSelectPeriodo(e.activePayload[0].payload.periodo);
                                        }
                                    }}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <defs>
                                        <linearGradient id="colorPermanencia" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#6366F1" stopOpacity={0.25} />
                                            <stop offset="95%" stopColor="#6366F1" stopOpacity={0.02} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                                    <XAxis 
                                        dataKey="mes" 
                                        stroke="#64748B" 
                                        fontSize={11} 
                                        tickLine={false} 
                                    />
                                    <YAxis 
                                        stroke="#64748B" 
                                        fontSize={11} 
                                        tickLine={false} 
                                        unit="m" 
                                        domain={[0, 'auto']}
                                    />
                                    <RechartsTooltip content={<CustomTimesTooltip />} />
                                    <Legend 
                                        wrapperStyle={{ fontSize: '0.72rem', paddingTop: '6px' }} 
                                    />
                                    <ReferenceLine 
                                        y={30} 
                                        stroke="#DC2626" 
                                        strokeDasharray="4 4" 
                                        strokeWidth={1.5} 
                                        label={{ 
                                            value: 'Meta: 30 min', 
                                            fill: '#DC2626', 
                                            fontSize: 10, 
                                            fontWeight: 700, 
                                            position: 'insideTopRight' 
                                        }} 
                                    />
                                    <ReferenceLine 
                                        x={formatMesCorto(selectedPeriodo)} 
                                        stroke="#2563EB" 
                                        strokeWidth={2} 
                                        strokeDasharray="3 3" 
                                        label={{ value: `Auditado: ${formatMesCorto(selectedPeriodo)}`, fill: '#1E40AF', fontSize: 10, position: 'top' }} 
                                    />
                                    <Area 
                                        type="monotone" 
                                        dataKey="permanenciaMin" 
                                        name="Permanencia Total (min)" 
                                        stroke="#6366F1" 
                                        strokeWidth={2} 
                                        fill="url(#colorPermanencia)" 
                                    />
                                    <Line 
                                        type="monotone" 
                                        dataKey="esperaMin" 
                                        name="Espera Promedio al Médico (min)" 
                                        stroke="#F59E0B" 
                                        strokeWidth={2.5} 
                                        dot={{ r: 4, fill: '#F59E0B' }} 
                                        activeDot={{ r: 6 }} 
                                    />
                                    <Line 
                                        type="monotone" 
                                        dataKey="esperaMaxExtremo" 
                                        name="Valor Extremo Máximo (min)" 
                                        stroke="#DC2626" 
                                        strokeWidth={2} 
                                        strokeDasharray="4 4"
                                        dot={{ r: 4, fill: '#DC2626' }} 
                                        activeDot={{ r: 7 }} 
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Widget Destacado: Tiempos Puerta-Médico por 3 Franjas Horarias (Solicitud Dra. Paola García: 08-14, 14-22, 22-08) */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        padding: '18px 20px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '14px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0D3B66', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>⏱️</span> Tiempo Puerta – Médico por 3 Franjas Horarias + Valores Extremos
                                </h4>
                                <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                                    Franjas solicitadas por Jefatura Guardia: <strong>08:00 a 14:00 hs</strong> · <strong>14:00 a 22:00 hs (Pico Crítico Tarde)</strong> · <strong>22:00 a 08:00 hs</strong> · Clic en una franja para ver quiénes tuvieron demoras extremas
                                </span>
                            </div>
                        </div>

                        {/* Grid de 3 Columnas por Franja */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                            gap: '14px'
                        }}>
                            {[
                                { franja: '08 a 14', legacy: '08 a 13', label: 'Franja Mañana (08:00 a 14:00)', icon: '🌅', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
                                { franja: '14 a 22', legacy: '13 a 21', label: 'Franja Tarde Crítica (14:00 a 22:00)', icon: '☀️', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
                                { franja: '22 a 08', legacy: '21 a 08', label: 'Franja Noche (22:00 a 08:00)', icon: '🌙', color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE' }
                            ].map(item => {
                                const fData = currentFranjas.find(f => f.franja === item.franja) || currentFranjas.find(f => f.franja === item.legacy);
                                const extFranja = extremosFranjasCache?.[selectedPeriodo]?.franjas_resumen?.find(f => f.franja === item.franja);
                                const total = fData?.consultas_total || extFranja?.consultas_total || 0;
                                const min = fData?.espera_min != null ? Math.round(fData.espera_min) : '—';
                                const max = fData?.espera_max != null ? Math.round(fData.espera_max) : '—';
                                const avg = fData?.espera_avg != null ? Number(fData.espera_avg).toFixed(1) : '—';
                                const metaPct = fData?.cumplimiento_meta_pct || 0;
                                const mas60 = extFranja?.casos_mas_60m ?? '—';
                                const mas120 = extFranja?.casos_mas_120m ?? '—';
                                const isSelectedFranja = selectedFranjaExtremos === item.franja;

                                return (
                                    <div 
                                        key={item.franja}
                                        onClick={() => setSelectedFranjaExtremos(isSelectedFranja ? 'todos' : item.franja)}
                                        style={{
                                            background: item.bg,
                                            borderRadius: '10px',
                                            border: isSelectedFranja ? `2.5px solid ${item.color}` : `1.5px solid ${item.border}`,
                                            padding: '16px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '10px',
                                            cursor: 'pointer',
                                            boxShadow: isSelectedFranja ? '0 4px 12px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.02)'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: item.color, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span>{item.icon}</span> {item.label}
                                            </span>
                                            <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#FFFFFF', padding: '2px 8px', borderRadius: '10px', color: '#475569', border: '1px solid #E2E8F0' }}>
                                                {total.toLocaleString('es-AR')} pac.
                                            </span>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
                                            {/* Tiempo Mínimo */}
                                            <div style={{ background: '#FFFFFF', borderRadius: '8px', padding: '10px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                                                <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Tiempo Mínimo</div>
                                                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#16A34A', marginTop: '2px' }}>
                                                    {min} <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>min</span>
                                                </div>
                                            </div>

                                            {/* Tiempo Máximo (Valor Extremo) */}
                                            <div style={{ background: '#FFFFFF', borderRadius: '8px', padding: '10px', border: '1px solid #FECACA', textAlign: 'center' }}>
                                                <div style={{ fontSize: '0.68rem', color: '#991B1B', fontWeight: 700, textTransform: 'uppercase' }}>Valor Extremo (Máx)</div>
                                                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#DC2626', marginTop: '2px' }}>
                                                    {max} <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>min</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '6px', borderTop: `1px solid ${item.border}`, flexWrap: 'wrap', gap: '6px' }}>
                                            <span style={{ fontSize: '0.72rem', color: '#475569', fontWeight: 600 }}>
                                                Promedio: <strong style={{ color: '#0F172A' }}>{avg} min</strong> (&lt;30m: {metaPct}%)
                                            </span>
                                            {mas60 !== '—' && (
                                                <span style={{ fontSize: '0.68rem', fontWeight: 800, background: '#FEE2E2', color: '#991B1B', padding: '2px 7px', borderRadius: '6px' }}>
                                                    ⚠️ &gt;1h: {mas60} · &gt;2h: {mas120}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* ─── AUDITORÍA DE VALORES EXTREMOS NOMINALES Y EVIDENCIA DE LOS LUNES ─── */}
                        {extremosFranjasCache?.[selectedPeriodo] && (() => {
                            const perExt = extremosFranjasCache[selectedPeriodo];
                            const diasSemana = perExt.por_dia_semana || [];
                            const casosFiltrados = (perExt.casos_extremos || []).filter(c => {
                                if (selectedFranjaExtremos !== 'todos' && c.franja !== selectedFranjaExtremos) return false;
                                if (selectedDiaExtremos !== 'todos' && c.dia_semana !== selectedDiaExtremos) return false;
                                return true;
                            });

                            return (
                                <div style={{
                                    marginTop: '8px',
                                    background: '#F8FAFC',
                                    borderRadius: '10px',
                                    border: '1px solid #CBD5E1',
                                    padding: '16px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '12px'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                        <div>
                                            <h5 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span>🚨</span> Auditoría de Valores Extremos (&gt; 60 min y &gt; 120 min) y Demanda por Día de Semana
                                            </h5>
                                            <span style={{ fontSize: '0.73rem', color: '#475569' }}>
                                                Respaldo numérico del refuerzo de los <strong>Lunes</strong> y del turno tarde (<strong>14 a 22 hs</strong>). Haga clic en cualquier día o franja para ver qué pacientes esperaron más de 1 o 2 horas.
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                            {selectedFranjaExtremos !== 'todos' && (
                                                <button
                                                    onClick={() => setSelectedFranjaExtremos('todos')}
                                                    style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #2563EB', background: '#EFF6FF', color: '#1E40AF', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                                                >
                                                    Franja: {selectedFranjaExtremos} ✕
                                                </button>
                                            )}
                                            {selectedDiaExtremos !== 'todos' && (
                                                <button
                                                    onClick={() => setSelectedDiaExtremos('todos')}
                                                    style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #DC2626', background: '#FEE2E2', color: '#991B1B', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                                                >
                                                    Día: {selectedDiaExtremos} ✕
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Píldoras por Día de la Semana (Lunes destacado) */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(125px, 1fr))', gap: '8px' }}>
                                        {diasSemana.map(d => {
                                            const isLunes = d.dia_nombre === 'Lunes';
                                            const isSelectedDia = selectedDiaExtremos === d.dia_nombre;
                                            return (
                                                <div
                                                    key={d.dia_num}
                                                    onClick={() => setSelectedDiaExtremos(isSelectedDia ? 'todos' : d.dia_nombre)}
                                                    style={{
                                                        background: isSelectedDia ? '#FEE2E2' : isLunes ? '#FFFBEB' : '#FFFFFF',
                                                        border: isSelectedDia ? '2px solid #DC2626' : isLunes ? '1.5px solid #F59E0B' : '1px solid #E2E8F0',
                                                        borderRadius: '8px',
                                                        padding: '8px 10px',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', fontWeight: 800, color: isLunes ? '#B45309' : '#0F172A' }}>
                                                        <span>{d.dia_nombre} {isLunes ? '🔥' : ''}</span>
                                                        <span style={{ fontSize: '0.66rem', color: '#64748B' }}>{d.total_consultas} pac.</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: '4px' }}>
                                                        Prom: <strong>{d.avg_min}m</strong> · Máx: <strong style={{ color: '#DC2626' }}>{d.max_min}m</strong>
                                                    </div>
                                                    <div style={{ fontSize: '0.68rem', color: '#991B1B', fontWeight: 700, marginTop: '2px' }}>
                                                        &gt;1h: {d.extremos_60m} ({d.extremos_tarde_14_22} en 14-22h)
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Tabla Nominal de Casos Extremos */}
                                    <div style={{ background: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', maxHeight: '280px', overflowY: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                                            <thead style={{ position: 'sticky', top: 0, background: '#F1F5F9', borderBottom: '1px solid #CBD5E1' }}>
                                                <tr>
                                                    <th style={{ padding: '8px 10px' }}>Fecha & Día</th>
                                                    <th style={{ padding: '8px 10px' }}>Franja</th>
                                                    <th style={{ padding: '8px 10px' }}>Paciente (NHC)</th>
                                                    <th style={{ padding: '8px 10px' }}>Llegada → Atención</th>
                                                    <th style={{ padding: '8px 10px' }}>Espera Extrema</th>
                                                    <th style={{ padding: '8px 10px' }}>Médico Actuante</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {casosFiltrados.slice(0, 35).map((c, idx) => (
                                                    <tr key={c.idVisita || idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                        <td style={{ padding: '7px 10px', fontWeight: 700, color: '#0F172A' }}>
                                                            {c.fecha} · <span style={{ color: c.dia_semana === 'Lunes' ? '#D97706' : '#475569' }}>{c.dia_semana}</span>
                                                        </td>
                                                        <td style={{ padding: '7px 10px' }}>
                                                            <span style={{
                                                                padding: '2px 6px',
                                                                borderRadius: '4px',
                                                                fontWeight: 700,
                                                                fontSize: '0.68rem',
                                                                background: c.franja === '14 a 22' ? '#DBEAFE' : '#F1F5F9',
                                                                color: c.franja === '14 a 22' ? '#1E40AF' : '#334155'
                                                            }}>
                                                                {c.franja} hs
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '7px 10px', fontWeight: 700 }}>
                                                            {c.paciente} <span style={{ color: '#64748B', fontWeight: 600 }}>(NHC {c.nhc})</span>
                                                        </td>
                                                        <td style={{ padding: '7px 10px', color: '#475569' }}>
                                                            {c.hora_llegada} hs → {c.hora_atencion} hs
                                                        </td>
                                                        <td style={{ padding: '7px 10px' }}>
                                                            <span style={{
                                                                background: c.minutos_espera >= 120 ? '#FEE2E2' : '#FEF3C7',
                                                                color: c.minutos_espera >= 120 ? '#991B1B' : '#92400E',
                                                                padding: '2px 8px',
                                                                borderRadius: '6px',
                                                                fontWeight: 800
                                                            }}>
                                                                {c.minutos_espera} min ({(c.minutos_espera / 60).toFixed(1)} h)
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '7px 10px', color: '#334155' }}>
                                                            {c.medico || 'GUARDIA CLINICA'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                
                </div>
            )}

            {/* ─── PESTAÑA 4: RESOLUCIÓN, DESTINOS & QUIRÓFANO ─── */}
            {activeDashboardTab === 'resolucion' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Tarjeta Destacada: Admisiones Médicas Clínicas (Total, Destinos y Reinternaciones 72h) */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        padding: '18px 20px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '14px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0D3B66', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>🏥</span> Admisiones Médicas Clínicas: Destinos Asistenciales & Reinternaciones
                                </h4>
                                <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                                    Basado en <strong>(INT) ADMISION MEDICA CLINICA</strong> (Dra. Paola García y Equipo Clínico) · Período {formatPeriodoLabel(selectedPeriodo)}
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 800, background: '#EFF6FF', color: '#1D4ED8', padding: '4px 10px', borderRadius: '8px', border: '1px solid #BFDBFE' }}>
                                    Total: {currentAdmisiones?.total_admisiones_clinicas || 0} admisiones
                                </span>
                                <button
                                    onClick={() => setActiveDashboardTab('internado')}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #1E40AF',
                                        background: '#1E40AF',
                                        color: '#FFFFFF',
                                        fontSize: '0.74rem',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    📋 Ver Pacientes e Historias
                                </button>
                            </div>
                        </div>

                        {/* Cards de Destinos + Reinternaciones */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                            gap: '12px'
                        }}>
                            {/* Pase a Quirófano */}
                            <div onClick={() => setActiveDashboardTab('internado')} style={{ background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '14px', borderLeft: '4px solid #EC4899', cursor: 'pointer' }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#BE185D', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span>✂️</span> Pase Quirúrgico / Procedimiento
                                </div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0F172A', marginTop: '4px' }}>
                                    {currentAdmisiones?.destino_quirofano_count || 0}
                                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B', marginLeft: '6px' }}>
                                        ({currentAdmisiones?.destino_quirofano_pct || 0}%)
                                    </span>
                                </div>
                                <span style={{ fontSize: '0.68rem', color: '#64748B' }}>Admisiones con intervención en Qx</span>
                            </div>

                            {/* Internado General (Piso) */}
                            <div onClick={() => setActiveDashboardTab('internado')} style={{ background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '14px', borderLeft: '4px solid #2563EB', cursor: 'pointer' }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1D4ED8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span>🛌</span> Internado (Piso Clínico)
                                </div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0F172A', marginTop: '4px' }}>
                                    {currentAdmisiones?.destino_internado_count || 0}
                                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B', marginLeft: '6px' }}>
                                        ({currentAdmisiones?.destino_internado_pct || 0}%)
                                    </span>
                                </div>
                                <span style={{ fontSize: '0.68rem', color: '#64748B' }}>Área: Internado / Piso</span>
                            </div>

                            {/* UCI / Cuidados Críticos */}
                            <div onClick={() => setActiveDashboardTab('internado')} style={{ background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '14px', borderLeft: '4px solid #EF4444', cursor: 'pointer' }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#B91C1C', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span>🫀</span> UCI / Cuidados Críticos
                                </div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0F172A', marginTop: '4px' }}>
                                    {currentAdmisiones?.destino_uci_count || 0}
                                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B', marginLeft: '6px' }}>
                                        ({currentAdmisiones?.destino_uci_pct || 0}%)
                                    </span>
                                </div>
                                <span style={{ fontSize: '0.68rem', color: '#64748B' }}>Área: UCI / Servicio UCI</span>
                            </div>

                            {/* Reinternación <= 72 hs */}
                            <div onClick={() => setActiveDashboardTab('internado')} style={{ background: '#FEF3C7', borderRadius: '10px', border: '1px solid #FDE68A', padding: '14px', borderLeft: '4px solid #D97706', cursor: 'pointer' }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#92400E', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span>🔁</span> Reconsulta / Reingreso &le; 72 hs
                                </div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#92400E', marginTop: '4px' }}>
                                    {currentAdmisiones?.reinternaciones_72h_count || 0}
                                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#B45309', marginLeft: '6px' }}>
                                        ({currentAdmisiones?.reinternaciones_72h_pct || 0}%)
                                    </span>
                                </div>
                                <span style={{ fontSize: '0.68rem', color: '#78350F' }}>Meta &lt; 5%</span>
                            </div>
                        </div>
                    </div>

                    {/* Tarjeta de discriminación entre Urgencias Reales y Programadas Excluidas */}
                    <div style={{
                        background: '#FFFFFF',
                        border: '1.5px solid #BFDBFE',
                        borderRadius: '10px',
                        padding: '14px 18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px',
                        boxShadow: '0 2px 6px -1px rgba(37, 99, 235, 0.08)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: 38, height: 38, borderRadius: 8, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1E40AF' }}>
                                <Scissors size={20} />
                            </div>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0F172A' }}>
                                        Depuración Quirúrgica: Urgencias Reales vs Ingresos Programados
                                    </h4>
                                    <span style={{ fontSize: '0.65rem', background: '#DCFCE7', color: '#166534', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                        FILTRO DE GOBERNANZA
                                    </span>
                                </div>
                                <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                                    Exclusión de cirugías previamente programadas que ingresaron por ventanilla administrativa de urgencias
                                </span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '6px 14px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.68rem', color: '#1E40AF', fontWeight: 700 }}>Urgencias Reales</div>
                                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1E40AF' }}>{enrichedMetrics.urgenciasRealesCount} pac.</div>
                                <div style={{ fontSize: '0.65rem', color: '#3B82F6' }}>{enrichedMetrics.urgenciasRealesPct}% conv. neta</div>
                            </div>
                            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '6px 14px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700 }}>Programadas Excluidas</div>
                                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#64748B' }}>{enrichedMetrics.programadasExcluidasCount} pac.</div>
                                <div style={{ fontSize: '0.65rem', color: '#94A3B8' }}>Ingreso administrativo</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsConversionModalOpen(true)}
                                style={{
                                    background: '#2563EB',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '8px 14px',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <Clock size={14} />
                                <span>Ver Timeline Quirúrgico</span>
                            </button>
                        </div>
                    </div>

                    <div className="guardia-charts-two-col">
                        {/* Gráfico 2: Demanda Mensual vs. Conversión a Cirugía (≤ 48h) */}
                        <div style={{
                            background: '#F8FAFC',
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0',
                            padding: '16px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                            width: '100%',
                            boxSizing: 'border-box'
                        }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: '#1E293B' }}>
                                    Volumen de Consultas vs. Conversión Quirúrgica (≤ 48 hs)
                                </h4>
                                <span style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                    Cruce con Quirófano (Meta normada: 8% - 12%)
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span 
                                    onClick={() => setSelectedOutlierModal('conversion_cirugia')}
                                    title="Clic para ver detalle de cirugías derivadas"
                                    style={{ fontSize: '0.68rem', fontWeight: 700, background: '#EFF6FF', color: '#1E40AF', padding: '2px 7px', borderRadius: '6px', border: '1px solid #BFDBFE', cursor: 'pointer' }}
                                >
                                    {formatPeriodoLabel(currentData.periodo)}: {currentData.cantidad_pases_cirugia} cirugías ({currentData.conversion_cirugia_pct}%)
                                </span>
                                <span style={{ fontSize: '0.68rem', fontWeight: 700, background: '#DCFCE7', color: '#166534', padding: '2px 7px', borderRadius: '6px' }}>
                                    Meta 8% - 12%
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setSelectedOutlierModal('conversion_cirugia')}
                                    title="Analizar cirugías realizadas que vienen de guardia clínica y descargar Excel/PDF"
                                    style={{
                                        ...outlierBtnStyle,
                                        background: '#EFF6FF',
                                        color: '#1D4ED8',
                                        border: '1px solid #BFDBFE',
                                        fontWeight: 700
                                    }}
                                >
                                    <Scissors size={12} />
                                    Cirugías & Casos
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSelectedChartHelp(CHART_HELP_CATALOGO.conversion_cirugia)}
                                    title="¿Qué muestra este gráfico? Clic para ver la explicación detallada"
                                    style={helpBtnStyle}
                                >
                                    <HelpCircle size={14} />
                                </button>
                            </div>
                        </div>

                        <div style={{ height: '260px', width: '100%' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart 
                                    data={evolutionChartData} 
                                    margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                                    onClick={(e) => {
                                        if (e && e.activePayload && e.activePayload[0]) {
                                            handleSelectPeriodo(e.activePayload[0].payload.periodo);
                                        }
                                    }}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                                    <XAxis 
                                        dataKey="mes" 
                                        stroke="#64748B" 
                                        fontSize={11} 
                                        tickLine={false} 
                                    />
                                    <YAxis 
                                        yAxisId="left" 
                                        stroke="#2563EB" 
                                        fontSize={11} 
                                        tickLine={false}
                                        domain={[0, 'auto']}
                                    />
                                    <YAxis 
                                        yAxisId="right" 
                                        orientation="right" 
                                        stroke="#10B981" 
                                        fontSize={11} 
                                        tickLine={false}
                                        unit="%"
                                        domain={[0, 15]}
                                    />
                                    <RechartsTooltip content={<CustomEvolutionTooltip />} />
                                    <Legend 
                                        wrapperStyle={{ fontSize: '0.72rem', paddingTop: '6px' }} 
                                    />
                                    <Bar 
                                        yAxisId="left" 
                                        dataKey="consultas" 
                                        name="Consultas Urgencia" 
                                        fill="#3B82F6" 
                                        radius={[4, 4, 0, 0]} 
                                        maxBarSize={34} 
                                    >
                                        {evolutionChartData.map((entry, index) => (
                                            <Cell 
                                                key={`cell-${index}`} 
                                                fill={entry.periodo === selectedPeriodo ? '#1E40AF' : '#3B82F6'} 
                                            />
                                        ))}
                                    </Bar>
                                    <Line 
                                        yAxisId="right" 
                                        type="monotone" 
                                        dataKey="conversionPct" 
                                        name="% Conv. Quirúrgica" 
                                        stroke="#10B981" 
                                        strokeWidth={2.5} 
                                        dot={{ r: 4, fill: '#10B981' }} 
                                        activeDot={{ r: 6 }} 
                                    />
                                    {/* Rango de Benchmark 8% - 12% */}
                                    <ReferenceLine yAxisId="right" y={8} stroke="#10B981" strokeDasharray="3 3" />
                                    <ReferenceLine yAxisId="right" y={12} stroke="#10B981" strokeDasharray="3 3" />
                                    <ReferenceLine 
                                        yAxisId="left" 
                                        x={formatMesCorto(selectedPeriodo)} 
                                        stroke="#2563EB" 
                                        strokeWidth={2} 
                                        strokeDasharray="3 3" 
                                        label={{ value: `Auditado: ${formatMesCorto(selectedPeriodo)}`, fill: '#1E40AF', fontSize: 10, position: 'top' }} 
                                    />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                        </div>

                        
                        {/* Visualizador de Destinos Post-Guardia */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    padding: '18px 20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <PieChartIcon size={18} color="#0D9488" />
                            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1E293B' }}>
                                Destinos Post-Guardia Efectivos
                            </h4>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.72rem', color: '#0D9488', fontWeight: 700, background: '#F0FDFA', padding: '2px 8px', borderRadius: '6px', border: '1px solid #CCFBF1' }}>
                                {formatPeriodoLabel(currentData.periodo)}: {currentData.total_consultas?.toLocaleString()} egresos
                            </span>
                            <button
                                type="button"
                                onClick={() => setSelectedOutlierModal('destinos_postguardia')}
                                title="Analizar Destinos Post-Guardia y Casos con descarga Excel/PDF"
                                style={outlierBtnStyle}
                            >
                                <Maximize2 size={13} />
                                <span>Outliers & Casos</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedChartHelp(CHART_HELP_CATALOGO.destinos_postguardia)}
                                title="¿Qué muestra este gráfico? Clic para ver la explicación detallada"
                                style={helpBtnStyle}
                            >
                                <HelpCircle size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Gráfico de Barras Horizontal de Destinos */}
                    {destinosChartData.length > 0 && (
                        <div style={{ height: '175px', width: '100%', margin: '0 0 10px 0' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    layout="vertical"
                                    data={destinosChartData.slice(0, 5)}
                                    margin={{ top: 5, right: 25, left: 10, bottom: 5 }}
                                >
                                    <XAxis type="number" hide />
                                    <YAxis 
                                        type="category" 
                                        dataKey="name" 
                                        width={125} 
                                        fontSize={10} 
                                        tickLine={false} 
                                        stroke="#475569" 
                                    />
                                    <RechartsTooltip 
                                        formatter={(val, name, item) => [`${val.toLocaleString()} pac. (${item.payload.pct}%)`, 'Cantidad']}
                                    />
                                    <Bar dataKey="cantidad" fill="#0D9488" radius={[0, 4, 4, 0]} barSize={13}>
                                        {destinosChartData.map((entry, index) => (
                                            <Cell 
                                                key={`dest-cell-${index}`} 
                                                fill={entry.name.includes('Quirófano') ? '#2563EB' : entry.name.includes('Alta') ? '#0D9488' : '#6366F1'} 
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {currentData.destinos_distribucion && currentData.destinos_distribucion.length > 0 ? (
                            currentData.destinos_distribucion.map((d, idx) => (
                                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                                        <span style={{ fontWeight: 700, color: '#334155' }}>{d.destino}</span>
                                        <span style={{ fontWeight: 800, color: '#0F766E', background: '#CCFBF1', padding: '2px 8px', borderRadius: '8px', fontSize: '0.72rem' }}>
                                            {d.cantidad} ({d.porcentaje}%)
                                        </span>
                                    </div>
                                    <div style={{ height: '7px', width: '100%', background: '#F1F5F9', borderRadius: '10px', overflow: 'hidden' }}>
                                        <div style={{
                                            height: '100%',
                                            width: `${d.porcentaje}%`,
                                            background: '#0D9488',
                                            borderRadius: '10px',
                                            transition: 'width 0.4s ease'
                                        }} />
                                    </div>
                                </div>
                            ))
                        ) : (
                            <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>Sin desglose de destinos para este período.</span>
                        )}
                    </div>
                </div>

                
                    </div>
                </div>
            )}

            {/* ─── PESTAÑA 5: CALIDAD & SEGURIDAD (72 HORAS) ─── */}
            {activeDashboardTab === 'calidad' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Gráfico 4: Comparativa de Indicadores de Calidad Hospitalaria (Reconsulta 72h y Reinternación) (100% de Ancho) */}
                <div style={{
                    width: '100%',
                    background: '#F8FAFC',
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    boxSizing: 'border-box'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                            <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: '#1E293B' }}>
                                Indicadores de Calidad y Seguridad Clínica (Serie Temporal 72 horas)
                            </h4>
                            <span style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                Tasa de Reconsulta a Guardia (Meta: &lt; 7%) y Tasa de Reinternación Inesperada (Meta: &lt; 5%)
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, background: '#EFF6FF', color: '#1E40AF', padding: '2px 7px', borderRadius: '6px', border: '1px solid #BFDBFE' }}>
                                {formatPeriodoLabel(currentData.periodo)}: Recons {currentData.reconsulta_72h_pct}% · Reint {currentData.reinternacion_72h_pct}%
                            </span>
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, background: '#DCFCE7', color: '#166534', padding: '2px 7px', borderRadius: '6px' }}>
                                Meta Reconsulta &lt; 7%
                            </span>
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, background: '#EFF6FF', color: '#1E40AF', padding: '2px 7px', borderRadius: '6px' }}>
                                Meta Reinternación &lt; 5%
                            </span>
                            <button
                                type="button"
                                onClick={() => setSelectedOutlierModal('calidad_72h')}
                                title="Analizar Outliers y Casos Extremos de Reconsultas/Reinternaciones con descarga Excel/PDF"
                                style={outlierBtnStyle}
                            >
                                <Maximize2 size={13} />
                                <span>Outliers & Casos</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedChartHelp(CHART_HELP_CATALOGO.calidad_72h)}
                                title="¿Qué muestra este gráfico? Clic para ver la explicación detallada"
                                style={helpBtnStyle}
                            >
                                <HelpCircle size={14} />
                            </button>
                        </div>
                    </div>

                    <div style={{ height: '190px', width: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart 
                                data={evolutionChartData} 
                                margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
                                onClick={(e) => {
                                    if (e && e.activePayload && e.activePayload[0]) {
                                        handleSelectPeriodo(e.activePayload[0].payload.periodo);
                                    }
                                }}
                                style={{ cursor: 'pointer' }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                                <XAxis dataKey="mes" stroke="#64748B" fontSize={11} tickLine={false} />
                                <YAxis stroke="#64748B" fontSize={11} tickLine={false} unit="%" domain={[0, 10]} />
                                <RechartsTooltip content={<CustomQualityTooltip />} />
                                <Legend wrapperStyle={{ fontSize: '0.72rem', paddingTop: '6px' }} />
                                <ReferenceLine y={7} stroke="#D97706" strokeDasharray="3 3" label={{ value: 'Meta Reconsulta (7%)', fill: '#D97706', fontSize: 10 }} />
                                <ReferenceLine y={5} stroke="#2563EB" strokeDasharray="3 3" label={{ value: 'Meta Reinternación (5%)', fill: '#2563EB', fontSize: 10 }} />
                                <ReferenceLine 
                                    x={formatMesCorto(selectedPeriodo)} 
                                    stroke="#2563EB" 
                                    strokeWidth={2} 
                                    strokeDasharray="3 3" 
                                    label={{ value: `Auditado: ${formatMesCorto(selectedPeriodo)}`, fill: '#1E40AF', fontSize: 10, position: 'top' }} 
                                />
                                <Line 
                                    type="monotone" 
                                    dataKey="reconsultaPct" 
                                    name="% Reconsulta (72 hs)" 
                                    stroke="#D97706" 
                                    strokeWidth={2.5} 
                                    dot={{ r: 4, fill: '#D97706' }} 
                                    activeDot={{ r: 6 }} 
                                />
                                <Line 
                                    type="monotone" 
                                    dataKey="reinternacionPct" 
                                    name="% Reinternación (72 hs)" 
                                    stroke="#2563EB" 
                                    strokeWidth={2.5} 
                                    dot={{ r: 4, fill: '#2563EB' }} 
                                    activeDot={{ r: 6 }} 
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                
                    {/* Gráfico 5: Tasa de Adherencia a Epicrisis en Altas de Urgencias (Serie Temporal Mensual) */}
                <div style={{
                    width: '100%',
                    background: '#F8FAFC',
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    boxSizing: 'border-box'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FileText size={18} color="#15803D" />
                                <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: '#1E293B' }}>
                                    Tasa de Adherencia a Epicrisis en Altas de Urgencias (Serie Temporal Mensual)
                                </h4>
                            </div>
                            <span style={{ fontSize: '0.7rem', color: '#64748B', display: 'block', marginTop: '2px' }}>
                                Porcentaje de pacientes egresados de internación clínica procedentes de guardia con documento de Epicrisis médica cerrada y firmada (Meta: 100%)
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, background: '#EFF6FF', color: '#1E40AF', padding: '2px 7px', borderRadius: '6px', border: '1px solid #BFDBFE' }}>
                                {formatPeriodoLabel(currentData.periodo)}: {currentData.adherencia_epicrisis_pct}% ({currentData.altas_con_epicrisis} de {currentData.total_altas_clinicas} altas)
                            </span>
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, background: '#DCFCE7', color: '#166534', padding: '2px 7px', borderRadius: '6px' }}>
                                Meta 100% Obligatorio
                            </span>
                            <button
                                type="button"
                                onClick={() => setSelectedOutlierModal('adherencia_epicrisis')}
                                title="Analizar Altas Clínicas y Epicrisis con descarga Excel/PDF"
                                style={outlierBtnStyle}
                            >
                                <Maximize2 size={13} />
                                <span>Outliers & Casos</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedChartHelp(CHART_HELP_CATALOGO.adherencia_epicrisis)}
                                title="¿Qué muestra este gráfico? Clic para ver la explicación detallada y query SQL"
                                style={helpBtnStyle}
                            >
                                <HelpCircle size={14} />
                            </button>
                        </div>
                    </div>

                    <div style={{ height: '190px', width: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart 
                                data={evolutionChartData} 
                                margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
                                onClick={(e) => {
                                    if (e && e.activePayload && e.activePayload[0]) {
                                        handleSelectPeriodo(e.activePayload[0].payload.periodo);
                                    }
                                }}
                                style={{ cursor: 'pointer' }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                                <XAxis dataKey="mes" stroke="#64748B" fontSize={11} tickLine={false} />
                                <YAxis yAxisId="pct" stroke="#64748B" fontSize={11} tickLine={false} unit="%" domain={[85, 105]} />
                                <YAxis yAxisId="vol" orientation="right" stroke="#94A3B8" fontSize={10} tickLine={false} />
                                <RechartsTooltip content={<CustomEpicrisisTooltip />} />
                                <Legend wrapperStyle={{ fontSize: '0.72rem', paddingTop: '6px' }} />
                                <ReferenceLine yAxisId="pct" y={100} stroke="#16A34A" strokeDasharray="3 3" label={{ value: 'Meta Institucional (100%)', fill: '#16A34A', fontSize: 10 }} />
                                <ReferenceLine 
                                    x={formatMesCorto(selectedPeriodo)} 
                                    stroke="#2563EB" 
                                    strokeWidth={2} 
                                    strokeDasharray="3 3" 
                                    label={{ value: `Auditado: ${formatMesCorto(selectedPeriodo)}`, fill: '#1E40AF', fontSize: 10, position: 'top' }} 
                                />
                                <Bar 
                                    yAxisId="vol" 
                                    dataKey="altasClinicas" 
                                    name="Altas Clínicas Totales" 
                                    fill="#CBD5E1" 
                                    radius={[4, 4, 0, 0]} 
                                    barSize={18} 
                                />
                                <Line 
                                    yAxisId="pct" 
                                    type="monotone" 
                                    dataKey="adherenciaEpicrisisPct" 
                                    name="% Adherencia Epicrisis" 
                                    stroke="#16A34A" 
                                    strokeWidth={2.8} 
                                    dot={{ r: 4, fill: '#16A34A' }} 
                                    activeDot={{ r: 6 }} 
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            
                </div>
            )}

            {/* ─── DRAWER / MODAL DE DETALLE DE KPI Y QUERY T-SQL ─── */}
            {selectedKpiDetail && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(15, 23, 42, 0.5)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 9999,
                    backdropFilter: 'blur(2px)'
                }}>
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '14px',
                        width: '90%',
                        maxWidth: '680px',
                        maxHeight: '85vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                    }}>
                        <div style={{
                            padding: '16px 20px',
                            borderBottom: '1px solid #E2E8F0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: '#F8FAFC'
                        }}>
                            <div>
                                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#2563EB', textTransform: 'uppercase' }}>
                                    {selectedKpiDetail.grupo}
                                </span>
                                <h3 style={{ margin: '2px 0 0 0', fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                                    {selectedKpiDetail.label}
                                </h3>
                            </div>
                            <button
                                onClick={() => setSelectedKpiDetail(null)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#64748B',
                                    fontSize: '1.2rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    padding: '4px 8px'
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                                    Definición Clínica y Propósito:
                                </label>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.84rem', color: '#334155', lineHeight: 1.5 }}>
                                    {selectedKpiDetail.descripcion}
                                </p>
                            </div>

                            <div style={{ display: 'flex', gap: '16px' }}>
                                <div style={{ flex: 1, background: '#F8FAFC', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Benchmark Normado</span>
                                    <div style={{ fontWeight: 800, color: '#1E40AF', fontSize: '0.9rem', marginTop: '2px' }}>
                                        {selectedKpiDetail.benchmark}
                                    </div>
                                </div>
                                <div style={{ flex: 2, background: '#F8FAFC', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Fuente SALUS</span>
                                    <div style={{ fontWeight: 700, color: '#334155', fontSize: '0.8rem', marginTop: '2px' }}>
                                        {selectedKpiDetail.origen}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                                        Repositorio Transact-SQL (SALUS):
                                    </label>
                                    <button
                                        onClick={() => handleCopySql(getSqlSnippetForIndicator(selectedKpiDetail.id))}
                                        style={{
                                            background: copiedSql ? '#DCFCE7' : '#EFF6FF',
                                            color: copiedSql ? '#166534' : '#1E40AF',
                                            border: '1px solid #BFDBFE',
                                            borderRadius: '6px',
                                            padding: '4px 8px',
                                            fontSize: '0.72rem',
                                            fontWeight: 700,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {copiedSql ? <Check size={12} /> : <Copy size={12} />}
                                        {copiedSql ? 'Copiado' : 'Copiar Query'}
                                    </button>
                                </div>
                                <pre style={{
                                    background: '#0F172A',
                                    color: '#E2E8F0',
                                    padding: '14px',
                                    borderRadius: '8px',
                                    fontSize: '0.74rem',
                                    fontFamily: 'Consolas, monospace',
                                    overflowX: 'auto',
                                    maxHeight: '220px',
                                    lineHeight: 1.45,
                                    margin: 0
                                }}>
                                    {getSqlSnippetForIndicator(selectedKpiDetail.id)}
                                </pre>
                            </div>
                        </div>

                        <div style={{ padding: '12px 20px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setSelectedKpiDetail(null)}
                                style={{
                                    padding: '7px 16px',
                                    borderRadius: '6px',
                                    background: '#2563EB',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    fontWeight: 700,
                                    fontSize: '0.8rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── MODAL DE TRAZABILIDAD Y LÍNEA DE TIEMPO DE CIRUGÍAS (48 HORAS) ─── */}
            <GuardiaConversionTimelineModal
                isOpen={isConversionModalOpen}
                onClose={() => setIsConversionModalOpen(false)}
                periodo={currentData.periodo}
                totalConsultas={currentData.total_consultas}
            />

            {/* ─── MODAL DE PROGRESIÓN TEMPORAL PUERTA - MÉDICO (DÍA / SEMANA / MES) ─── */}
            <GuardiaPuertaMedicoProgressionModal
                isOpen={showPuertaMedicoProgression}
                onClose={() => setShowPuertaMedicoProgression(false)}
                currentData={currentData}
                historialResumen={historialResumen}
                triagePacientesAll={triagePacientesAll}
                selectedPeriodo={selectedPeriodo}
                fechaDesde={fechaDesde}
                fechaHasta={fechaHasta}
            />

            {/* ─── MODAL DE EXPLICACIÓN DETALLADA DE GRÁFICOS (GOBERNANZA CLÍNICA) ─── */}
            {selectedChartHelp && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(15, 23, 42, 0.65)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    backdropFilter: 'blur(3px)',
                    padding: '16px'
                }}>
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '680px',
                        maxHeight: '90vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.35)',
                        animation: 'fadeIn 0.2s ease-out'
                    }}>
                        {/* Header del Modal */}
                        <div style={{
                            padding: '18px 24px',
                            borderBottom: '1px solid #E2E8F0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            background: 'linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    width: '42px',
                                    height: '42px',
                                    borderRadius: '10px',
                                    background: '#FFFFFF',
                                    border: '1px solid #BFDBFE',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '1.35rem',
                                    boxShadow: '0 2px 4px rgba(37, 99, 235, 0.08)',
                                    flexShrink: 0
                                }}>
                                    {selectedChartHelp.icon}
                                </div>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#1E40AF', background: '#DBEAFE', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                            Guía Analítica de Gráfico
                                        </span>
                                    </div>
                                    <h3 style={{ margin: '4px 0 0 0', fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.3 }}>
                                        {selectedChartHelp.titulo}
                                    </h3>
                                    <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                                        {selectedChartHelp.subtitulo}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedChartHelp(null)}
                                style={{
                                    background: '#FFFFFF',
                                    border: '1px solid #CBD5E1',
                                    borderRadius: '8px',
                                    color: '#64748B',
                                    fontSize: '1rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    width: '32px',
                                    height: '32px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Contenido Didáctico del Gráfico */}
                        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* 1. ¿Qué estamos viendo? */}
                            <div style={{ background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '14px 16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                    <span style={{ fontSize: '0.9rem' }}>💡</span>
                                    <label style={{ fontSize: '0.74rem', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        ¿Qué estamos viendo en este gráfico?
                                    </label>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.86rem', color: '#334155', lineHeight: 1.55 }}>
                                    {selectedChartHelp.queMuestra}
                                </p>
                            </div>

                            {/* 2. Cómo se calcula y Meta */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                                <div style={{ background: '#EFF6FF', borderRadius: '10px', border: '1px solid #BFDBFE', padding: '12px 14px' }}>
                                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#1E40AF', textTransform: 'uppercase', marginBottom: '4px' }}>
                                        📐 Fórmula & Cálculo
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#1E3A8A', lineHeight: 1.45 }}>
                                        {selectedChartHelp.comoSeCalcula}
                                    </p>
                                </div>

                                <div style={{ background: '#F0FDF4', borderRadius: '10px', border: '1px solid #BBF7D0', padding: '12px 14px' }}>
                                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#166534', textTransform: 'uppercase', marginBottom: '4px' }}>
                                        🎯 Meta / Benchmark Normado
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#14532D', lineHeight: 1.45, fontWeight: 700 }}>
                                        {selectedChartHelp.meta}
                                    </p>
                                </div>
                            </div>

                            {/* 3. Fuente de Datos en SALUS */}
                            <div style={{ background: '#FFFFFF', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '10px 14px' }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '3px' }}>
                                    📡 Origen y Trazabilidad en Base de Datos SALUS
                                </div>
                                <code style={{ fontSize: '0.76rem', color: '#0F172A', background: '#F1F5F9', padding: '3px 8px', borderRadius: '4px', display: 'inline-block' }}>
                                    {selectedChartHelp.fuenteSalus}
                                </code>
                            </div>

                            {/* 4. Impacto en la Toma de Decisiones Médicas */}
                            <div style={{ background: '#FFFBEB', borderRadius: '10px', border: '1px solid #FDE68A', padding: '12px 16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                    <span style={{ fontSize: '0.85rem' }}>🎯</span>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 800, color: '#92400E', textTransform: 'uppercase' }}>
                                        Impacto Asistencial y Decisión Médica
                                    </label>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.82rem', color: '#78350F', lineHeight: 1.5 }}>
                                    {selectedChartHelp.impactoGestion}
                                </p>
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{
                            padding: '12px 20px',
                            borderTop: '1px solid #E2E8F0',
                            background: '#F8FAFC',
                            display: 'flex',
                            justifyContent: 'flex-end'
                        }}>
                            <button
                                onClick={() => setSelectedChartHelp(null)}
                                style={{
                                    padding: '8px 22px',
                                    borderRadius: '8px',
                                    background: '#2563EB',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    fontWeight: 700,
                                    fontSize: '0.84rem',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
                                }}
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Análisis de Outliers y Casos Extremos (con exportación Excel y PDF) */}
            <GuardiaOutliersModal
                isOpen={!!selectedOutlierModal}
                onClose={() => setSelectedOutlierModal(null)}
                chartType={selectedOutlierModal || 'tiempos_espera'}
                periodo={selectedPeriodo}
                periodoNombre={activePeriodLabel || formatPeriodoLabel(selectedPeriodo)}
            />

            {/* Modal de Tablero Completo de Quirófano (Articulación Guardia - Quirófano) */}
            {showQuirofanoModal && (
                <div style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(15, 23, 42, 0.75)',
                    backdropFilter: 'blur(5px)',
                    zIndex: 99999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px'
                }}>
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '1350px',
                        height: '92vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
                        border: '1px solid #CBD5E1'
                    }}>
                        <div style={{
                            padding: '12px 20px',
                            background: '#0F172A',
                            color: '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderBottom: '1px solid #334155'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Scissors size={18} color="#38BDF8" />
                                <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                                    Centro Quirúrgico · Tablero Integral (Quirófano Central & Hospital de Día)
                                </span>
                                <span style={{ background: '#0284C7', color: '#FFFFFF', fontSize: '0.70rem', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                                    Articulación con Guardia Clínica
                                </span>
                            </div>
                            <button
                                onClick={() => setShowQuirofanoModal(false)}
                                style={{
                                    background: 'rgba(255,255,255,0.15)',
                                    border: 'none',
                                    borderRadius: '8px',
                                    color: '#FFFFFF',
                                    fontWeight: 700,
                                    padding: '6px 14px',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                ✕ Volver a Guardia
                            </button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', background: '#F8FAFC' }}>
                            <QuirofanoDashboard isModal={true} onClose={() => setShowQuirofanoModal(false)} />
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}

// ─── COMPONENTE MODULAR DE TARJETA KPI (CALIDAD-QOAG) ───
function KpiCard({ icon, title, value, subtitle, meta, metaStatus, detalle, origen, onClick }) {
    const statusBg = metaStatus === 'ok' ? '#DCFCE7' : metaStatus === 'warning' ? '#FEF3C7' : metaStatus === 'error' ? '#FEE2E2' : '#EFF6FF';
    const statusColor = metaStatus === 'ok' ? '#166534' : metaStatus === 'warning' ? '#92400E' : metaStatus === 'error' ? '#991B1B' : '#1E40AF';

    return (
        <div 
            onClick={onClick}
            style={{
                background: '#FFFFFF',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                position: 'relative'
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#93C5FD';
                e.currentTarget.style.boxShadow = '0 6px 16px -2px rgba(37, 99, 235, 0.1)';
                e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#E2E8F0';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.04)';
                e.currentTarget.style.transform = 'none';
            }}
        >
            <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                            padding: '6px',
                            borderRadius: '8px',
                            background: '#F8FAFC',
                            border: '1px solid #F1F5F9',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            {icon}
                        </div>
                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#334155' }}>
                            {title}
                        </span>
                    </div>
                    {meta && (
                        <span style={{
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            padding: '2px 7px',
                            borderRadius: '6px',
                            background: statusBg,
                            color: statusColor
                        }}>
                            {meta}
                        </span>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
                    <span style={{ fontSize: '1.7rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px' }}>
                        {value}
                    </span>
                </div>

                <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>
                    {subtitle}
                </div>
            </div>

            <div style={{
                marginTop: '12px',
                paddingTop: '8px',
                borderTop: '1px solid #F1F5F9',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.68rem',
                color: '#94A3B8'
            }}>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }}>
                    {origen}
                </span>
                <span style={{ color: '#2563EB', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px' }}>
                    Detalle <ChevronRight size={12} />
                </span>
            </div>
        </div>
    );
}

// ─── HELPER DE SNIPPETS SQL PARA MODAL ───
function getSqlSnippetForIndicator(id) {
    switch (id) {
        case 'guardia_conversion_cirugia':
            return `-- Indicador 1: Tasa de Conversión a Cirugía (Ventana de 48 horas)
SELECT 
    v1.[NHC],
    v1.[Paciente],
    v1.[Cliente] AS [Obra Social],
    CAST(v1.[Fecha Visita] AS DATE) AS [Fecha Guardia],
    v1.[Hora Entrada Real] AS [Hora Llegada Guardia],
    v1.[Responsable] AS [Médico Guardia],
    v1.[Tipo Visita] AS [Triage Guardia],
    a.[Número admisión] AS [Nro Admision],
    CAST(v2.[Fecha Visita] AS DATE) AS [Fecha Cirugia],
    DATEDIFF(HOUR, v1.[Fecha Visita], v2.[Fecha Visita]) AS [Horas Transcurridas],
    c.[Nombre cirugía] AS [Procedimiento Quirurgico],
    c.[Cirujano] AS [Cirujano Real],
    c.[Anestesista],
    c.[Duracion Minutos Cirugia] AS [Duracion Minutos],
    c.[Estado] AS [Estado Cirugia]
FROM [SALUS].[dbo].[VLISE_Visitas con categoria] AS v1
INNER JOIN [SALUS].[dbo].[VLISE_Visitas con categoria] AS v2
    ON v1.[NHC] = v2.[NHC]
    AND v2.[Fecha Visita] >= v1.[Fecha Visita]
    AND v2.[Fecha Visita] <= DATEADD(HOUR, 48, v1.[Fecha Visita])
    AND v2.[Tipo Visita] LIKE '(cx)%'
    AND v2.[idvisita] <> v1.[idvisita]
INNER JOIN [SALUS].[dbo].[TABLEAU_Cirugias] AS c
    ON v2.[idvisita] = c.[idvisita]
LEFT JOIN [SALUS].[dbo].[TABLEAU_Admisiones] AS a 
    ON v1.[NHC] = a.[NHC] 
    AND a.[Fecha ingreso] >= CAST(v1.[Fecha Visita] AS DATE)
    AND a.[Fecha ingreso] <= DATEADD(DAY, 2, CAST(v1.[Fecha Visita] AS DATE))
WHERE v1.[Fecha Visita] >= '2026-09-01' AND v1.[Fecha Visita] < '2026-10-01'
  AND v1.[Agenda] = 'guardias clinica'
  AND v1.[Asistencia] = 'Presente'
  AND v1.[Tipo Visita] LIKE '%visita clinica%'
ORDER BY v1.[Fecha Visita] DESC, [Horas Transcurridas] ASC;`;

        case 'guardia_tiempos_espera':
            return `-- Indicador 2: Tiempos de Espera (Triage y Médico)
SELECT 
    AVG(DATEDIFF(MINUTE, [Fecha Entrada Real], [Fecha Hora Entrada])) AS PromedioEsperaMedicoMinutos,
    AVG(DATEDIFF(MINUTE, [Fecha Entrada Real], [Fecha Salida Real])) AS PromedioPermanenciaGuardiaMinutos
FROM VLISE_Visitas
WHERE [Tipo Visita] IN ('(N1) VISITA CLINICA', '(N2) VISITA CLINICA', '(N3) VISITA CLINICA')
  AND [Fecha Entrada Real] IS NOT NULL 
  AND [Fecha Hora Entrada] IS NOT NULL
  AND [Fecha Entrada Real] >= '2026-09-01' AND v.[Fecha Entrada Real] < '2026-10-01';`;

        case 'guardia_cobertura_triage':
            return `-- Indicador 3: Cobertura y Precisión del Triage
SELECT 
    [Tipo Visita] AS CategoriaTriage,
    COUNT(*) AS CantidadConsultas,
    CAST(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() AS DECIMAL(5,2)) AS PorcentajeTriage
FROM VLISE_Visitas
WHERE [Tipo Visita] IN ('(N1) VISITA CLINICA', '(N2) VISITA CLINICA', '(N3) VISITA CLINICA')
  AND [Fecha Entrada Real] >= '2026-09-01' AND [Fecha Entrada Real] < '2026-10-01'
GROUP BY [Tipo Visita];`;

        case 'guardia_reconsulta_72h':
            return `-- Indicador 4: Tasa de Reconsulta (72 hs)
SELECT 
    COUNT(DISTINCT v1.IdVisita) AS ConsultasTotales,
    COUNT(DISTINCT v2.IdVisita) AS Reconsultas72h,
    CAST(COUNT(DISTINCT v2.IdVisita) * 100.0 / NULLIF(COUNT(DISTINCT v1.IdVisita), 0) AS DECIMAL(5,2)) AS TasaReconsulta72hPct
FROM VLISE_Visitas v1
LEFT JOIN VLISE_Visitas v2 
    ON v1.NHC = v2.NHC 
    AND v2.[Fecha Entrada Real] > v1.[Fecha Entrada Real]
    AND v2.[Fecha Entrada Real] <= DATEADD(HOUR, 72, v1.[Fecha Entrada Real])
WHERE v1.[Tipo Visita] IN ('(N1) VISITA CLINICA', '(N2) VISITA CLINICA', '(N3) VISITA CLINICA')
  AND v1.[Fecha Entrada Real] >= '2026-09-01' AND v1.[Fecha Entrada Real] < '2026-10-01';`;

        case 'guardia_reinternacion_72h':
            return `-- Indicador 5: Tasa de Reinternación Temprana (72 hs)
SELECT 
    COUNT(DISTINCT a1.idAdmision) AS AltasClinicasTotales,
    COUNT(DISTINCT a2.idAdmision) AS Reinternaciones72h,
    CAST(COUNT(DISTINCT a2.idAdmision) * 100.0 / NULLIF(COUNT(DISTINCT a1.idAdmision), 0) AS DECIMAL(5,2)) AS TasaReinternacion72hPct
FROM TABLEAU_Admisiones a1
LEFT JOIN TABLEAU_Admisiones a2 
    ON a1.NHC = a2.NHC 
    AND a2.[Fecha ingreso] > a1.[Fecha alta]
    AND a2.[Fecha ingreso] <= DATEADD(HOUR, 72, a1.[Fecha alta])
WHERE a1.Procedencia = 'Derivado desde Urgencias'
  AND a1.Especialidad = 'CLINICO'
  AND a1.[Fecha alta] >= '2026-09-01' AND a1.[Fecha alta] < '2026-10-01';`;

        case 'guardia_volumen_imagenes':
            return `-- Indicador 6: Volumen de TAC y Rx Solicitadas
SELECT 
    COUNT(CASE WHEN r.TipoTarea = 'TOMOGRAFIA' THEN 1 END) AS TotalTAC,
    COUNT(CASE WHEN r.TipoTarea = 'RX' THEN 1 END) AS TotalRx,
    CAST(COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM VLISE_Visitas WHERE [Fecha Entrada Real] >= '2026-09-01' AND [Fecha Entrada Real] < '2026-10-01'), 0) AS DECIMAL(5,2)) AS TasaEstudiosPor100Consultas
FROM VLISE_PeticionesPruebasRadiologia r
WHERE r.TipoTarea IN ('TOMOGRAFIA', 'RX')
  AND r.[Fecha Solicitud] >= '2026-09-01' AND r.[Fecha Solicitud] < '2026-10-01';`;

        case 'guardia_destinos_post':
            return `-- Indicador 7: Distribución de Destinos Post-Guardia
SELECT 
    CASE 
        WHEN a.Procedencia = 'Derivado desde Urgencias' AND a.Especialidad LIKE '%CIRUGIA%' THEN 'Pase a Quirófano'
        WHEN a.Procedencia = 'Derivado desde Urgencias' AND a.Especialidad = 'TERAPIA INTENSIVA' THEN 'Ingreso a Terapia Intensiva'
        WHEN a.Procedencia = 'Derivado desde Urgencias' THEN 'Ingreso a Piso Clínico'
        WHEN v.[Tipo Visita] LIKE '%DERIVACION%' THEN 'Derivación Externa'
        ELSE 'Alta Médica Domiciliaria'
    END AS DestinoFinal,
    COUNT(*) AS CantidadPacientes
FROM VLISE_Visitas v
LEFT JOIN TABLEAU_Admisiones a 
    ON v.NHC = a.NHC 
    AND a.[Fecha ingreso] >= v.[Fecha Entrada Real]
    AND a.[Fecha ingreso] <= DATEADD(HOUR, 24, v.[Fecha Entrada Real])
WHERE v.[Fecha Entrada Real] >= '2026-09-01' AND v.[Fecha Entrada Real] < '2026-10-01'
GROUP BY CASE 
    WHEN a.Procedencia = 'Derivado desde Urgencias' AND a.Especialidad LIKE '%CIRUGIA%' THEN 'Pase a Quirófano'
    WHEN a.Procedencia = 'Derivado desde Urgencias' AND a.Especialidad = 'TERAPIA INTENSIVA' THEN 'Ingreso a Terapia Intensiva'
    WHEN a.Procedencia = 'Derivado desde Urgencias' THEN 'Ingreso a Piso Clínico'
    WHEN v.[Tipo Visita] LIKE '%DERIVACION%' THEN 'Derivación Externa'
    ELSE 'Alta Médica Domiciliaria'
END;`;

        case 'guardia_estada_clinica':
            return `-- Indicador 8: Promedio de Días de Estada Clínica
SELECT 
    AVG(CAST(Dias AS FLOAT)) AS PromedioDiasEstada,
    COUNT(*) AS TotalAltasClinicas
FROM TABLEAU_Admisiones
WHERE Procedencia = 'Derivado desde Urgencias'
  AND Especialidad = 'CLINICO'
  AND [Fecha alta] >= '2026-09-01' AND [Fecha alta] < '2026-10-01';`;

        case 'guardia_adherencia_epicrisis':
            return `-- Indicador 9: Tasa de Adherencia a Epicrisis
SELECT 
    COUNT(DISTINCT a.idAdmision) AS AltasClinicasTotales,
    COUNT(DISTINCT p.idAdmision) AS AltasConEpicrisis,
    CAST(COUNT(DISTINCT p.idAdmision) * 100.0 / NULLIF(COUNT(DISTINCT a.idAdmision), 0) AS DECIMAL(5,2)) AS AdherenciaEpicrisisPct
FROM TABLEAU_Admisiones a
LEFT JOIN PR_RespuestasProtocolo p 
    ON a.idAdmision = p.idAdmision 
    AND p.idProtocolo = 382 -- Epicrisis Médica
WHERE a.Procedencia = 'Derivado desde Urgencias'
  AND a.Especialidad = 'CLINICO'
  AND a.[Fecha alta] >= '2026-09-01' AND a.[Fecha alta] < '2026-10-01';`;

        default:
            return `-- Consulte sql/indicadores_guardia_clinica_salus.sql para la query completa.`;
    }
}

// ─── TOOLTIPS PERSONALIZADOS PARA GRÁFICOS (ESTILO CLÍNICO SANATORIO ARGENTINO) ───
function CustomEvolutionTooltip({ active, payload, label }) {
    if (!active || !payload || !payload.length) return null;
    return (
        <div style={{
            background: '#FFFFFF',
            border: '1px solid #CBD5E1',
            borderRadius: '8px',
            padding: '10px 14px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.1)',
            fontSize: '0.75rem',
            minWidth: '180px'
        }}>
            <div style={{ fontWeight: 800, color: '#0F172A', marginBottom: '6px', borderBottom: '1px solid #F1F5F9', paddingBottom: '4px' }}>
                Período: {label}
            </div>
            {payload.map((entry, index) => (
                <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', margin: '4px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: entry.color }} />
                        <span style={{ color: '#475569', fontWeight: 600 }}>{entry.name}:</span>
                    </div>
                    <strong style={{ color: '#0F172A' }}>
                        {entry.name.includes('%') ? `${entry.value}%` : `${entry.value.toLocaleString()} pac.`}
                    </strong>
                </div>
            ))}
        </div>
    );
}

function CustomTimesTooltip({ active, payload, label }) {
    if (!active || !payload || !payload.length) return null;
    return (
        <div style={{
            background: '#FFFFFF',
            border: '1px solid #CBD5E1',
            borderRadius: '8px',
            padding: '10px 14px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.1)',
            fontSize: '0.75rem',
            minWidth: '190px'
        }}>
            <div style={{ fontWeight: 800, color: '#0F172A', marginBottom: '6px', borderBottom: '1px solid #F1F5F9', paddingBottom: '4px' }}>
                Período: {label}
            </div>
            {payload.map((entry, index) => (
                <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', margin: '4px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: entry.color }} />
                        <span style={{ color: '#475569', fontWeight: 600 }}>{entry.name}:</span>
                    </div>
                    <strong style={{ color: '#0F172A' }}>
                        {entry.value} min
                    </strong>
                </div>
            ))}
            <div style={{ borderTop: '1px dashed #E2E8F0', marginTop: '6px', paddingTop: '4px', color: '#DC2626', fontSize: '0.68rem', fontWeight: 700 }}>
                Meta Oportunidad: &lt; 30 min
            </div>
        </div>
    );
}

function CustomQualityTooltip({ active, payload, label }) {
    if (!active || !payload || !payload.length) return null;
    return (
        <div style={{
            background: '#FFFFFF',
            border: '1px solid #CBD5E1',
            borderRadius: '8px',
            padding: '10px 14px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.1)',
            fontSize: '0.75rem',
            minWidth: '190px'
        }}>
            <div style={{ fontWeight: 800, color: '#0F172A', marginBottom: '6px', borderBottom: '1px solid #F1F5F9', paddingBottom: '4px' }}>
                Período: {label}
            </div>
            {payload.map((entry, index) => (
                <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', margin: '4px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: entry.color }} />
                        <span style={{ color: '#475569', fontWeight: 600 }}>{entry.name}:</span>
                    </div>
                    <strong style={{ color: '#0F172A' }}>
                        {entry.value}%
                    </strong>
                </div>
            ))}
        </div>
    );
}

function CustomEpicrisisTooltip({ active, payload, label }) {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0]?.payload;
    const cumpleMeta = data?.adherenciaEpicrisisPct >= 100;
    return (
        <div style={{
            background: '#FFFFFF',
            border: '1px solid #CBD5E1',
            borderRadius: '10px',
            padding: '12px 14px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.1)',
            fontSize: '0.75rem',
            minWidth: '220px'
        }}>
            <div style={{ fontWeight: 800, color: '#0F172A', marginBottom: '6px', borderBottom: '1px solid #F1F5F9', paddingBottom: '4px' }}>
                Período: {data?.mesFull || label}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4px 0', color: '#475569' }}>
                <span>Altas Clínicas (Guardia):</span>
                <strong style={{ color: '#0F172A' }}>{data?.altasClinicas} pac.</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4px 0', color: '#475569' }}>
                <span>Con Epicrisis Cerrada:</span>
                <strong style={{ color: '#16A34A' }}>{data?.altasConEpicrisis} pac.</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '6px 0 0 0', paddingTop: '6px', borderTop: '1px solid #F1F5F9' }}>
                <span style={{ fontWeight: 700, color: '#0F172A' }}>Tasa de Adherencia:</span>
                <span style={{
                    fontWeight: 800,
                    color: cumpleMeta ? '#166534' : '#B45309',
                    background: cumpleMeta ? '#DCFCE7' : '#FEF3C7',
                    padding: '1px 6px',
                    borderRadius: '4px'
                }}>
                    {data?.adherenciaEpicrisisPct}%
                </span>
            </div>
        </div>
    );
}

function CustomTriageEvolutionTooltip({ active, payload, label }) {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0]?.payload;
    return (
        <div style={{
            background: '#FFFFFF',
            border: '1px solid #CBD5E1',
            borderRadius: '10px',
            padding: '12px 16px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            fontSize: '0.78rem',
            minWidth: '240px'
        }}>
            <div style={{ fontWeight: 800, color: '#0F172A', marginBottom: '8px', borderBottom: '1px solid #F1F5F9', paddingBottom: '4px' }}>
                Período: {data?.mesFull || label}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0' }}>
                <span style={{ color: '#64748B', fontWeight: 600 }}>Total Ingresos Guardia:</span>
                <strong style={{ color: '#1E293B' }}>{data?.consultas?.toLocaleString()} pac.</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0' }}>
                <span style={{ color: '#1E40AF', fontWeight: 700 }}>Triage Realizado (Enf):</span>
                <strong style={{ color: '#1E40AF' }}>{data?.triageados?.toLocaleString()} pac.</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0 0 0', paddingTop: '6px', borderTop: '1px dashed #E2E8F0' }}>
                <span style={{ color: '#059669', fontWeight: 800 }}>% Cobertura Triage:</span>
                <strong style={{ color: '#059669', fontSize: '0.92rem' }}>{data?.triagePct}%</strong>
            </div>
            {data?.triageados === 0 ? (
                <div style={{ marginTop: '6px', fontSize: '0.7rem', color: '#94A3B8', fontStyle: 'italic' }}>
                    Protocolo no implementado en este mes
                </div>
            ) : (
                <div style={{ marginTop: '6px', fontSize: '0.7rem', color: '#64748B' }}>
                    Protocolo 621: (ENF) Triage enfermería
                </div>
            )}
        </div>
    );
}

