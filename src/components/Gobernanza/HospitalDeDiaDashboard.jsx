import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
    LineChart, Line, PieChart, Pie, Cell, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
    Sun, Activity, Syringe, FileSpreadsheet, TrendingUp,
    Calendar, Users, CheckCircle2, AlertCircle, Filter, Search,
    Download, RefreshCw, Layers, ShieldCheck, ArrowUpRight,
    Scissors, Stethoscope, ChevronLeft, ChevronRight, HelpCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';

// Paleta clínica Sanatorio Argentino (Innovación y Transformación Digital)
const COLORS = {
    quirurgico: '#2563EB',      // Azul Quirófano Sanatorio
    quirurgicoHover: '#1D4ED8',
    hierro: '#8B5CF6',          // Púrpura Infusión Hemoterapia
    hierroHover: '#7C3AED',
    ferinject: '#EC4899',       // Rosa Ferinject
    sacarato: '#A855F7',        // Violeta Sacarato
    otroHierro: '#F59E0B',      // Ámbar Otra infusión
    total: '#64748B',           // Gris Guía Imputación SALUS
    atendido: '#10B981',        // Verde Efectivo
    suspendido: '#EF4444'       // Rojo Suspendido
};

export default function HospitalDeDiaDashboard({
    fechaDesde,
    fechaHasta,
    addToast
}) {
    // ── Fechas por defecto sincronizadas con el Telar Superior ──
    const defaultDesde = useMemo(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    }, []);

    const defaultHasta = useMemo(() => {
        const d = new Date();
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }, []);

    const effectiveDesde = fechaDesde || defaultDesde;
    const effectiveHasta = fechaHasta || defaultHasta;

    // ── Estados Locales ──
    const [loading, setLoading] = useState(true);
    const [records, setRecords] = useState([]);
    const [error, setError] = useState(null);

    // Filtros de navegación interactiva
    const [filterTipo, setFilterTipo] = useState('TODOS'); // 'TODOS' | 'QUIRURGICO' | 'HIERRO'
    const [filterAsistencia, setFilterAsistencia] = useState('TODOS'); // 'TODOS' | 'EFECTIVOS' | 'SUSPENDIDOS'
    const [filterAgenda, setFilterAgenda] = useState('TODOS'); // 'TODOS' | agenda específica
    const [searchTerm, setSearchTerm] = useState('');
    const [timeGrouping, setTimeGrouping] = useState('auto'); // 'auto' | 'dia' | 'semana' | 'mes'
    const [page, setPage] = useState(1);
    const pageSize = 12;

    // ── Carga Dinámica desde Supabase (hospital_de_dia_actividad) ──
    const fetchHospitalData = useCallback(async () => {
        if (!effectiveDesde || !effectiveHasta) return;
        setLoading(true);
        setError(null);
        try {
            let allRows = [];
            let pageIdx = 0;
            const size = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data, error: err } = await supabase
                    .from('hospital_de_dia_actividad')
                    .select('*')
                    .gte('fecha', effectiveDesde)
                    .lte('fecha', effectiveHasta)
                    .order('fecha', { ascending: true })
                    .order('hora', { ascending: true })
                    .range(pageIdx * size, (pageIdx + 1) * size - 1);

                if (err) throw err;
                if (data && data.length > 0) {
                    allRows = allRows.concat(data);
                    if (data.length < size || allRows.length >= 10000) {
                        hasMore = false;
                    } else {
                        pageIdx++;
                    }
                } else {
                    hasMore = false;
                }
            }

            setRecords(allRows);
            setPage(1);
        } catch (e) {
            console.error('[HospitalDeDiaDashboard] Error al cargar actividad:', e);
            setError(e.message || 'Error al conectar con la base de datos');
            if (addToast) addToast('Error al cargar datos de Hospital de Día', 'error');
        } finally {
            setLoading(false);
        }
    }, [effectiveDesde, effectiveHasta, addToast]);

    useEffect(() => {
        fetchHospitalData();
    }, [fetchHospitalData]);

    // ── Métricas y Agregaciones Ejecutivas ──
    const analytics = useMemo(() => {
        const total = records.length;
        if (total === 0) {
            return {
                total: 0,
                quirurgicoCount: 0,
                quirurgicoPct: 0,
                hierroCount: 0,
                hierroPct: 0,
                efectivosCount: 0,
                suspendidosCount: 0,
                desvioPct: 0,
                pieTipoData: [],
                pieFarmacosData: [],
                lineChartData: [],
                agendasData: [],
                topMedicosData: []
            };
        }

        let qCount = 0;
        let hCount = 0;
        let efCount = 0;
        let suspCount = 0;

        const farmacosMap = {
            'HIERRO SACARATO': 0,
            'FERINJECT (Carboximaltosa)': 0,
            'HIERRO ENDOVENOSO / INFUSIÓN': 0
        };

        const agendasMap = {};
        const medicosMap = {
            quirurgicos: {},
            hierro: {}
        };

        const dateMap = {};

        records.forEach(r => {
            const isQ = r.tipo_actividad === 'PROCEDIMIENTO_QUIRURGICO';
            const isH = r.tipo_actividad === 'INFUSION_HIERRO';
            const isEf = (r.asistencia || '').toUpperCase() === 'PRESENTE' || (r.asistencia || '').toUpperCase() === 'URGENCIA';

            if (isQ) qCount++;
            if (isH) hCount++;
            if (isEf) efCount++;
            else suspCount++;

            // Agendas
            const agKey = (r.agenda || 'Sin Agenda').trim();
            agendasMap[agKey] = (agendasMap[agKey] || 0) + 1;

            // Fármacos de hierro
            if (isH) {
                const f = r.farmaco_hierro || 'HIERRO ENDOVENOSO / INFUSIÓN';
                farmacosMap[f] = (farmacosMap[f] || 0) + 1;
            }

            // Médicos
            const med = (r.medico_responsable || 'Sin Médico').trim();
            if (isQ) {
                medicosMap.quirurgicos[med] = (medicosMap.quirurgicos[med] || 0) + 1;
            } else if (isH) {
                medicosMap.hierro[med] = (medicosMap.hierro[med] || 0) + 1;
            }

            // Evolución temporal
            const fKey = r.fecha; // YYYY-MM-DD
            if (!dateMap[fKey]) {
                dateMap[fKey] = { fecha: fKey, quirurgico: 0, hierro: 0, total: 0 };
            }
            if (isQ) dateMap[fKey].quirurgico++;
            if (isH) dateMap[fKey].hierro++;
            dateMap[fKey].total++;
        });

        const qPct = total > 0 ? Number(((qCount / total) * 100).toFixed(1)) : 0;
        const hPct = total > 0 ? Number(((hCount / total) * 100).toFixed(1)) : 0;
        const desvioPct = hPct; // El desvío son las infusiones que inflan las cirugías de HdD

        // Data para Gráfico de Torta 1: Procedimientos Quirúrgicos vs Pases de Hierro
        const pieTipoData = [
            { name: 'Procedimientos Quirúrgicos HdD', value: qCount, pct: qPct, color: COLORS.quirurgico },
            { name: 'Pases de Hierro (Hemoterapia)', value: hCount, pct: hPct, color: COLORS.hierro }
        ].filter(d => d.value > 0);

        // Data para Gráfico de Torta 2: Fármacos de Hierro
        const pieFarmacosData = [
            { name: 'Hierro Sacarato', value: farmacosMap['HIERRO SACARATO'] || 0, color: COLORS.sacarato },
            { name: 'Ferinject (Carboximaltosa)', value: farmacosMap['FERINJECT (Carboximaltosa)'] || 0, color: COLORS.ferinject },
            { name: 'Otras Infusiones EV', value: farmacosMap['HIERRO ENDOVENOSO / INFUSIÓN'] || 0, color: COLORS.otroHierro }
        ].filter(d => d.value > 0).map(d => ({
            ...d,
            pct: hCount > 0 ? Number(((d.value / hCount) * 100).toFixed(1)) : 0
        }));

        // Data para Gráfico de Líneas Temporal
        const sortedDates = Object.keys(dateMap).sort();
        const lineChartData = sortedDates.map(f => {
            const parts = f.split('-');
            const displayDate = parts.length === 3 ? `${parts[2]}/${parts[1]}` : f;
            return {
                fecha: f,
                displayDate,
                quirurgico: dateMap[f].quirurgico,
                hierro: dateMap[f].hierro,
                total: dateMap[f].total
            };
        });

        // Data de Agendas para BarChart
        const agendasData = Object.entries(agendasMap).map(([agenda, count]) => {
            const isHierroAg = agenda.toUpperCase().includes('HEMOTERAPIA');
            return {
                agenda,
                count,
                color: isHierroAg ? COLORS.hierro : COLORS.quirurgico,
                tipo: isHierroAg ? 'Infusiones Ambulatorias' : 'Quirúrgico HdD'
            };
        }).sort((a, b) => b.count - a.count);

        // Top médicos quirúrgicos
        const topMedicosQx = Object.entries(medicosMap.quirurgicos)
            .map(([medico, count]) => ({ medico, count, tipo: 'Quirúrgico' }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        // Top médicos hierro
        const topMedicosHierro = Object.entries(medicosMap.hierro)
            .map(([medico, count]) => ({ medico, count, tipo: 'Hierro' }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        return {
            total,
            quirurgicoCount: qCount,
            quirurgicoPct: qPct,
            hierroCount: hCount,
            hierroPct: hPct,
            efectivosCount: efCount,
            suspendidosCount: suspCount,
            desvioPct,
            pieTipoData,
            pieFarmacosData,
            lineChartData,
            agendasData,
            topMedicosQx,
            topMedicosHierro
        };
    }, [records]);

    // ── Filtrado Nominal de Registros para la Tabla de Auditoría ──
    const filteredRecords = useMemo(() => {
        return records.filter(r => {
            // Filtro Tipo
            if (filterTipo === 'QUIRURGICO' && r.tipo_actividad !== 'PROCEDIMIENTO_QUIRURGICO') return false;
            if (filterTipo === 'HIERRO' && r.tipo_actividad !== 'INFUSION_HIERRO') return false;

            // Filtro Asistencia
            const isPresente = (r.asistencia || '').toUpperCase() === 'PRESENTE' || (r.asistencia || '').toUpperCase() === 'URGENCIA';
            if (filterAsistencia === 'EFECTIVOS' && !isPresente) return false;
            if (filterAsistencia === 'SUSPENDIDOS' && isPresente) return false;

            // Filtro Agenda
            if (filterAgenda !== 'TODOS' && r.agenda !== filterAgenda) return false;

            // Búsqueda libre
            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase();
                const pac = (r.paciente_nombre || '').toLowerCase();
                const dni = (r.paciente_dni || '').toLowerCase();
                const med = (r.medico_responsable || '').toLowerCase();
                const desc = (r.descripcion_practica || '').toLowerCase();
                const farm = (r.farmaco_hierro || '').toLowerCase();
                const os = (r.obra_social || '').toLowerCase();
                return pac.includes(term) || dni.includes(term) || med.includes(term) || desc.includes(term) || farm.includes(term) || os.includes(term);
            }

            return true;
        });
    }, [records, filterTipo, filterAsistencia, filterAgenda, searchTerm]);

    // Paginación
    const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
    const paginatedRecords = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredRecords.slice(start, start + pageSize);
    }, [filteredRecords, page, pageSize]);

    // ── Exportación a Excel Profesional (.xlsx) ──
    const handleExportExcel = () => {
        if (!records || records.length === 0) {
            if (addToast) addToast('No hay registros en el período para exportar', 'warning');
            return;
        }

        try {
            const wb = XLSX.utils.book_new();

            const filtroNom = filterTipo === 'HIERRO' ? 'Solo Hierro' : filterTipo === 'QUIRURGICO' ? 'Solo Quirúrgicos' : 'Todos';
            const asistenciaNom = filterAsistencia === 'EFECTIVOS' ? 'Solo Atendidos' : filterAsistencia === 'SUSPENDIDOS' ? 'Solo Suspendidos' : 'Todos';

            // ── Solapa 1: Detalle Nominal Filtrado (Prioridad de visualización) ──
            const detalleRows = filteredRecords.map((r, idx) => ({
                'N°': idx + 1,
                'Fecha': r.fecha,
                'Hora': r.hora || '--:--',
                'Paciente': r.paciente_nombre,
                'DNI': r.paciente_dni || 'S/D',
                'NHC': r.paciente_nhc || 'S/D',
                'Obra Social / Prepaga': r.obra_social,
                'Agenda SALUS': r.agenda,
                'Tipo de Actividad': r.tipo_actividad === 'PROCEDIMIENTO_QUIRURGICO' ? 'PROCEDIMIENTO QUIRÚRGICO' : 'INFUSIÓN DE HIERRO',
                'Práctica / Cirugía': r.descripcion_practica || r.agenda,
                'Fármaco Administrado': r.farmaco_hierro || (r.tipo_actividad === 'PROCEDIMIENTO_QUIRURGICO' ? 'No aplica' : 'Hierro EV'),
                'Médico / Responsable': r.medico_responsable,
                'Asistencia / Estado': r.asistencia,
                'ID Visita SALUS': r.id_visita,
                'Motivo Ausencia / Comentarios': r.motivo_ausencia || r.motivo_o_comentarios || ''
            }));

            const wsDetalle = XLSX.utils.json_to_sheet(detalleRows);
            wsDetalle['!cols'] = [
                { wch: 5 },
                { wch: 12 },
                { wch: 8 },
                { wch: 32 },
                { wch: 12 },
                { wch: 10 },
                { wch: 26 },
                { wch: 18 },
                { wch: 26 },
                { wch: 38 },
                { wch: 24 },
                { wch: 28 },
                { wch: 16 },
                { wch: 14 },
                { wch: 32 }
            ];
            const sheetTitle = filterTipo === 'HIERRO' ? 'Solo Hierro' : filterTipo === 'QUIRURGICO' ? 'Solo Quirúrgicos' : 'Trazabilidad Nominal';
            XLSX.utils.book_append_sheet(wb, wsDetalle, sheetTitle);

            // ── Solapa 2: Resumen Ejecutivo Gerencial ──
            const resumenAOA = [
                ['SANATORIO ARGENTINO — GOBERNANZA DE DATOS & AUDITORÍA QUIRÚRGICA'],
                ['INFORME GERENCIAL: HOSPITAL DE DÍA (PROCEDIMIENTOS VS INFUSIONES DE HIERRO)'],
                [''],
                ['Período Auditado (Filtro Telar):', `Desde ${effectiveDesde} hasta ${effectiveHasta}`],
                ['Filtros Aplicados en Trazabilidad:', `Tipo: ${filtroNom} | Asistencia: ${asistenciaNom} | Búsqueda: "${searchTerm || 'Sin filtro'}"`],
                ['Registros Filtrados / Exportados:', `${filteredRecords.length} de ${records.length} totales del período`],
                ['Fecha de Emisión del Reporte:', new Date().toLocaleString('es-AR')],
                ['Fuente de Datos SALUS:', "VLISE_Visitas filtrado por [Grupo Agenda] = 'QUIRÓFANOS HdD'"],
                [''],
                ['MÉTRICA / INDICADOR AUDITADO', 'CANTIDAD (VISITAS)', 'PARTICIPACIÓN (%)', 'IMPACTO ASISTENCIAL'],
                ['Total Imputado en SALUS a HdD', analytics.total, '100.0%', 'Base total reportada por agenda SALUS'],
                ['1. Procedimientos Quirúrgicos HdD', analytics.quirurgicoCount, `${analytics.quirurgicoPct}%`, 'Cirugías ambulatorias y endoscopías (Qx 5 / Qx 6)'],
                ['2. Pases de Hierro (Hemoterapia)', analytics.hierroCount, `${analytics.hierroPct}%`, 'Infusiones EV ambulatorias sin uso de quirófano'],
                ['Tasa de Desvío / Actividad Ambulatoria', analytics.hierroCount, `${analytics.desvioPct}%`, 'Volumen no quirúrgico imputado al bloque quirúrgico'],
                [''],
                ['DESGLOSE DE FÁRMACOS DE HIERRO ADMINISTRADOS', 'CANTIDAD', 'PARTICIPACIÓN (%)', 'OBSERVACIÓN'],
                ...analytics.pieFarmacosData.map(f => [f.name, f.value, `${f.pct}%`, 'Infusión en sillón ambulatorio']),
                [''],
                ['ESTADO DE ASISTENCIA Y RESOLUTIVIDAD', 'CANTIDAD', 'PARTICIPACIÓN (%)', 'ESTADO'],
                ['Pacientes Efectivamente Atendidos', analytics.efectivosCount, `${((analytics.efectivosCount / (analytics.total || 1)) * 100).toFixed(1)}%`, 'Presente / Urgencia realizada'],
                ['Turnos Suspendidos o Ausencias', analytics.suspendidosCount, `${((analytics.suspendidosCount / (analytics.total || 1)) * 100).toFixed(1)}%`, 'Cancelaciones anticipadas o en el día'],
                [''],
                ['NOTA TÉCNICA DE AUDITORÍA Y GOBERNANZA:'],
                ['En la configuración histórica de SALUS, la agenda HEMOTERAPIA está asignada al Grupo Agenda QUIRÓFANOS HdD.'],
                ['Esto provocaba que en los tableros generales los pases de hierro se contabilizaran como cirugías ambulatorias.'],
                ['Este informe corrige y transparenta la separación asistencial para una correcta toma de decisiones gerenciales.']
            ];

            const wsResumen = XLSX.utils.aoa_to_sheet(resumenAOA);
            wsResumen['!cols'] = [
                { wch: 42 },
                { wch: 20 },
                { wch: 18 },
                { wch: 48 }
            ];
            XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen Gerencial');

            const tagTipo = filterTipo === 'HIERRO' ? '_Solo_Hierro' : filterTipo === 'QUIRURGICO' ? '_Solo_Quirurgicos' : '';
            const tagAsistencia = filterAsistencia === 'EFECTIVOS' ? '_Atendidos' : filterAsistencia === 'SUSPENDIDOS' ? '_Suspendidos' : '';
            const fileName = `Trazabilidad_Hospital_de_Dia${tagTipo}${tagAsistencia}_${effectiveDesde}_a_${effectiveHasta}.xlsx`;
            XLSX.writeFile(wb, fileName);

            if (addToast) {
                addToast(`Informe exportado exitosamente (${filteredRecords.length} registros con filtros aplicados)`, 'success');
            }
        } catch (err) {
            console.error('[HospitalDeDiaDashboard] Error al exportar Excel:', err);
            if (addToast) addToast('Error al generar archivo Excel', 'error');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '32px' }}>
            
            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* CABECERA PRINCIPAL & COMANDOS DE AUDITORÍA */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div style={{
                background: 'linear-gradient(135deg, #1E3A8A 0%, #1E40AF 60%, #2563EB 100%)',
                color: '#FFFFFF',
                borderRadius: '16px',
                padding: '24px 28px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: '0 10px 25px -5px rgba(30, 58, 138, 0.25)',
                position: 'relative',
                overflow: 'hidden'
            }}>
                <div style={{ zIndex: 1, maxWidth: '75%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <span style={{
                            background: 'rgba(255, 255, 255, 0.18)',
                            padding: '4px 10px',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            letterSpacing: '0.5px',
                            textTransform: 'uppercase',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}>
                            <Sun size={14} color="#FBBF24" />
                            Hospital de Día
                        </span>
                        <span style={{
                            background: 'rgba(59, 130, 246, 0.35)',
                            padding: '4px 10px',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            fontWeight: 600
                        }}>
                            Filtro Superior Activo: {effectiveDesde} al {effectiveHasta}
                        </span>
                        <span style={{
                            background: 'rgba(16, 185, 129, 0.25)',
                            color: '#A7F3D0',
                            padding: '4px 10px',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            fontWeight: 700
                        }}>
                            SALUS Sincronizado
                        </span>
                    </div>

                    <h2 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 800, letterSpacing: '-0.5px' }}>
                        Procedimientos Quirúrgicos vs Pases de Hierro
                    </h2>
                    <p style={{ margin: '6px 0 0 0', fontSize: '0.88rem', color: '#DBEAFE', lineHeight: '1.4' }}>
                        Discriminación y auditoría nominal de la actividad asistencial en el <strong>Grupo Agenda QUIRÓFANOS HdD</strong>.
                        Segrega con precisión las cirugías ambulatorias en quirófanos de las infusiones parenterales de enfermería.
                    </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 1 }}>
                    <button
                        onClick={handleExportExcel}
                        disabled={loading || records.length === 0}
                        style={{
                            background: '#FFFFFF',
                            color: '#1E3A8A',
                            border: 'none',
                            borderRadius: '10px',
                            padding: '10px 18px',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={e => { if (!loading) e.currentTarget.style.transform = 'translateY(-1px)'; }}
                        onMouseLeave={e => { if (!loading) e.currentTarget.style.transform = 'translateY(0)'; }}
                    >
                        <FileSpreadsheet size={17} color="#059669" />
                        Exportar Informe Excel (.xlsx)
                    </button>

                    <button
                        onClick={fetchHospitalData}
                        disabled={loading}
                        style={{
                            background: 'rgba(255, 255, 255, 0.15)',
                            color: '#FFFFFF',
                            border: '1px solid rgba(255, 255, 255, 0.25)',
                            borderRadius: '10px',
                            padding: '8px 14px',
                            fontWeight: 600,
                            fontSize: '0.78rem',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px'
                        }}
                    >
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                        Actualizar Vista
                    </button>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* CALLOUT ACLARATORIO PARA GERENCIA */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderLeft: '4px solid #8B5CF6',
                borderRadius: '12px',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px'
            }}>
                <div style={{
                    background: '#EDE9FE',
                    color: '#7C3AED',
                    borderRadius: '8px',
                    padding: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                }}>
                    <HelpCircle size={20} />
                </div>
                <div style={{ flex: 1, fontSize: '0.84rem', color: '#334155', lineHeight: '1.5' }}>
                    <div style={{ fontWeight: 800, color: '#1E293B', marginBottom: '2px' }}>
                        ¿Por qué es crítica esta discriminación en Gobernanza de Datos?
                    </div>
                    En el reporte gerencial clásico de SALUS (<em>Listado de Cantidad de Pacientes por Grupo Agenda</em>), el total de turnos de 
                    <strong> QUIRÓFANOS HdD</strong> sumaba indiscriminadamente las cirugías ambulatorias (Qx 5 y Qx 6) y los <strong>pases de hierro</strong> de la agenda 
                    <strong> HEMOTERAPIA</strong>. Las infusiones se realizan en sillón de enfermería con colocación de vía periférica y <strong>no utilizan sala de quirófano</strong>. 
                    Este tablero segrega ambos flujos para que el análisis de ocupación y productividad quirúrgica no sufra desvíos.
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* SCORECARDS EJECUTIVOS (KPIS PRINCIPALES) */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px'
            }}>
                {/* KPI 1: Total SALUS Imputado */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '14px',
                    padding: '18px 20px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                            Total Turnos SALUS (HdD)
                        </span>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
                            <Layers size={17} />
                        </div>
                    </div>
                    <div style={{ marginTop: '12px' }}>
                        <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>
                            {analytics.total}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '6px' }}>
                            Imputados a 'QUIRÓFANOS HdD' en el período
                        </div>
                    </div>
                </div>

                {/* KPI 2: Procedimientos Quirúrgicos HdD */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '14px',
                    padding: '18px 20px',
                    border: '1.5px solid #BFDBFE',
                    boxShadow: '0 4px 12px -2px rgba(37, 99, 235, 0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: COLORS.quirurgico }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#1E40AF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                            Procedimientos Quirúrgicos
                        </span>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB' }}>
                            <Scissors size={17} />
                        </div>
                    </div>
                    <div style={{ marginTop: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <span style={{ fontSize: '2rem', fontWeight: 800, color: '#1E3A8A', lineHeight: 1 }}>
                                {analytics.quirurgicoCount}
                            </span>
                            <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#2563EB' }}>
                                ({analytics.quirurgicoPct}%)
                            </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '6px' }}>
                            Cirugías ambulatorias y endoscopías (Qx 5 / Qx 6)
                        </div>
                    </div>
                </div>

                {/* KPI 3: Pases de Hierro (Hemoterapia) */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '14px',
                    padding: '18px 20px',
                    border: '1.5px solid #DDD6FE',
                    boxShadow: '0 4px 12px -2px rgba(139, 92, 246, 0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: COLORS.hierro }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#6D28D9', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                            Pases de Hierro (Infusiones)
                        </span>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B5CF6' }}>
                            <Syringe size={17} />
                        </div>
                    </div>
                    <div style={{ marginTop: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <span style={{ fontSize: '2rem', fontWeight: 800, color: '#5B21B6', lineHeight: 1 }}>
                                {analytics.hierroCount}
                            </span>
                            <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#8B5CF6' }}>
                                ({analytics.hierroPct}%)
                            </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '6px' }}>
                            Colocación de medicación parenteral en Hemoterapia
                        </div>
                    </div>
                </div>

                {/* KPI 4: Tasa de Desvío Asistencial */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '14px',
                    padding: '18px 20px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                            Tasa Desvío / Ambulatorio
                        </span>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D97706' }}>
                            <TrendingUp size={17} />
                        </div>
                    </div>
                    <div style={{ marginTop: '12px' }}>
                        <div style={{ fontSize: '2rem', fontWeight: 800, color: '#B45309', lineHeight: 1 }}>
                            {analytics.desvioPct}%
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#78350F', marginTop: '6px' }}>
                            Sobreestimación sobre volumen quirúrgico de HdD
                        </div>
                    </div>
                </div>

                {/* KPI 5: Efectividad / Realización */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '14px',
                    padding: '18px 20px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                            Efectividad Asistencial
                        </span>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
                            <CheckCircle2 size={17} />
                        </div>
                    </div>
                    <div style={{ marginTop: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <span style={{ fontSize: '2rem', fontWeight: 800, color: '#065F46', lineHeight: 1 }}>
                                {analytics.efectivosCount}
                            </span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748B' }}>
                                / {analytics.suspendidosCount} susp.
                            </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#047857', marginTop: '6px' }}>
                            {analytics.total > 0 ? ((analytics.efectivosCount / analytics.total) * 100).toFixed(1) : 0}% de asistencia confirmada
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* GRÁFICOS: EVOLUCIÓN EN LÍNEA & DISTRIBUCIÓN EN TORTA */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '20px' }}>
                
                {/* 1. GRÁFICO DE LÍNEA: EVOLUCIÓN TEMPORAL DÍA A DÍA */}
                <div style={{
                    gridColumn: 'span 8',
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '22px 24px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS.quirurgico }} />
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                                    Evolución Temporal de la Actividad en HdD
                                </h3>
                            </div>
                            <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                                Curva comparativa de Procedimientos Quirúrgicos vs Pases de Hierro en el rango seleccionado
                            </p>
                        </div>

                        {/* Leyenda rápida */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.76rem', fontWeight: 600 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ width: 12, height: 3, background: COLORS.quirurgico, borderRadius: 2 }} />
                                <span style={{ color: '#1E3A8A' }}>Procedimientos Quirúrgicos</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ width: 12, height: 3, background: COLORS.hierro, borderRadius: 2 }} />
                                <span style={{ color: '#5B21B6' }}>Pases de Hierro</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ width: 12, height: 2, background: COLORS.total, borderRadius: 2, borderTop: '1px dashed #64748B' }} />
                                <span style={{ color: '#64748B' }}>Total SALUS</span>
                            </div>
                        </div>
                    </div>

                    <div style={{ height: '310px', width: '100%' }}>
                        {analytics.lineChartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={analytics.lineChartData} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                                    <XAxis 
                                        dataKey="displayDate" 
                                        tick={{ fill: '#64748B', fontSize: 11 }}
                                        tickLine={false}
                                        axisLine={{ stroke: '#CBD5E1' }}
                                    />
                                    <YAxis 
                                        tick={{ fill: '#64748B', fontSize: 11 }}
                                        tickLine={false}
                                        axisLine={false}
                                        allowDecimals={false}
                                    />
                                    <Tooltip 
                                        contentStyle={{
                                            background: '#FFFFFF',
                                            borderRadius: '10px',
                                            border: '1px solid #E2E8F0',
                                            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                                            fontSize: '0.8rem'
                                        }}
                                        formatter={(val, name) => {
                                            if (name === 'quirurgico') return [`${val} turnos`, 'Procedimientos Quirúrgicos'];
                                            if (name === 'hierro') return [`${val} pacientes`, 'Pases de Hierro'];
                                            if (name === 'total') return [`${val} turnos`, 'Total SALUS'];
                                            return [val, name];
                                        }}
                                        labelFormatter={(label) => `Fecha: ${label}`}
                                    />
                                    <Line 
                                        type="monotone" 
                                        dataKey="quirurgico" 
                                        name="quirurgico" 
                                        stroke={COLORS.quirurgico} 
                                        strokeWidth={2.8}
                                        dot={{ r: 3, fill: COLORS.quirurgico }}
                                        activeDot={{ r: 6, stroke: '#FFFFFF', strokeWidth: 2 }}
                                    />
                                    <Line 
                                        type="monotone" 
                                        dataKey="hierro" 
                                        name="hierro" 
                                        stroke={COLORS.hierro} 
                                        strokeWidth={2.8}
                                        dot={{ r: 3, fill: COLORS.hierro }}
                                        activeDot={{ r: 6, stroke: '#FFFFFF', strokeWidth: 2 }}
                                    />
                                    <Line 
                                        type="monotone" 
                                        dataKey="total" 
                                        name="total" 
                                        stroke={COLORS.total} 
                                        strokeWidth={1.5}
                                        strokeDasharray="4 4"
                                        dot={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94A3B8', fontSize: '0.88rem' }}>
                                No se encontraron registros en el período
                            </div>
                        )}
                    </div>
                </div>

                {/* 2. GRÁFICO DE TORTA: PARTICIPACIÓN ASISTENCIAL (QUIRÚRGICO VS HIERRO) */}
                <div style={{
                    gridColumn: 'span 4',
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '22px 24px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <div style={{ marginBottom: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS.hierro }} />
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                                Composición Asistencial HdD
                            </h3>
                        </div>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                            Proporción real entre cirugía ambulatoria e infusiones
                        </p>
                    </div>

                    <div style={{ height: '220px', width: '100%', position: 'relative' }}>
                        {analytics.pieTipoData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={analytics.pieTipoData}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={55}
                                        outerRadius={85}
                                        paddingAngle={4}
                                    >
                                        {analytics.pieTipoData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip 
                                        formatter={(val, name, item) => [
                                            `${val} (${item.payload.pct}%)`, 
                                            name
                                        ]}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : null}

                        {/* Texto Central */}
                        <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            textAlign: 'center',
                            pointerEvents: 'none'
                        }}>
                            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0F172A' }}>
                                {analytics.total}
                            </div>
                            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                                Total Visitas
                            </div>
                        </div>
                    </div>

                    {/* Leyenda y Desglose Nominal */}
                    <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 10px',
                            background: '#EFF6FF',
                            borderRadius: '8px',
                            border: '1px solid #BFDBFE'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS.quirurgico }} />
                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1E3A8A' }}>
                                    Quirúrgico (Qx 5 / 6)
                                </span>
                            </div>
                            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#1E40AF' }}>
                                {analytics.quirurgicoCount} ({analytics.quirurgicoPct}%)
                            </span>
                        </div>

                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 10px',
                            background: '#F5F3FF',
                            borderRadius: '8px',
                            border: '1px solid #DDD6FE'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS.hierro }} />
                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#5B21B6' }}>
                                    Pases de Hierro
                                </span>
                            </div>
                            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#6D28D9' }}>
                                {analytics.hierroCount} ({analytics.hierroPct}%)
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* SEGUNDA FILA: DESGLOSE DE FÁRMACOS & AGENDAS SALUS */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '20px' }}>
                
                {/* 3. GRÁFICO DE TORTA / DONA: FÁRMACOS DE HIERRO */}
                <div style={{
                    gridColumn: 'span 4',
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '22px 24px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <div style={{ marginBottom: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS.ferinject }} />
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                                Fármacos de Hierro en Infusión
                            </h3>
                        </div>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                            Distribución de moléculas administradas en sillón
                        </p>
                    </div>

                    <div style={{ height: '190px', width: '100%', position: 'relative' }}>
                        {analytics.pieFarmacosData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={analytics.pieFarmacosData}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={48}
                                        outerRadius={75}
                                        paddingAngle={4}
                                    >
                                        {analytics.pieFarmacosData.map((entry, index) => (
                                            <Cell key={`cell-f-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip 
                                        formatter={(val, name, item) => [
                                            `${val} infusiones (${item.payload.pct}%)`, 
                                            name
                                        ]}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94A3B8', fontSize: '0.85rem' }}>
                                Sin infusiones de hierro en el período
                            </div>
                        )}

                        <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            textAlign: 'center',
                            pointerEvents: 'none'
                        }}>
                            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#5B21B6' }}>
                                {analytics.hierroCount}
                            </div>
                            <div style={{ fontSize: '0.64rem', fontWeight: 700, color: '#7C3AED', textTransform: 'uppercase' }}>
                                Infusiones
                            </div>
                        </div>
                    </div>

                    <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {analytics.pieFarmacosData.map((f, i) => (
                            <div key={i} style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '6px 8px',
                                background: '#F8FAFC',
                                borderRadius: '6px',
                                fontSize: '0.76rem'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.color }} />
                                    <span style={{ fontWeight: 600, color: '#334155' }}>{f.name}</span>
                                </div>
                                <span style={{ fontWeight: 800, color: '#0F172A' }}>
                                    {f.value} ({f.pct}%)
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 4. GRÁFICO DE BARRAS: AGENDAS SALUS */}
                <div style={{
                    gridColumn: 'span 4',
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '22px 24px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <div style={{ marginBottom: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#0284C7' }} />
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                                Distribución por Agenda SALUS
                            </h3>
                        </div>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                            Volumen desagregado según nomenclador de turnos
                        </p>
                    </div>

                    <div style={{ height: '240px', width: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={analytics.agendasData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                                <XAxis type="number" tick={{ fill: '#64748B', fontSize: 11 }} />
                                <YAxis 
                                    type="category" 
                                    dataKey="agenda" 
                                    tick={{ fill: '#334155', fontSize: 11, fontWeight: 600 }} 
                                    width={95}
                                />
                                <Tooltip 
                                    formatter={(val, name, item) => [
                                        `${val} turnos (${item.payload.tipo})`, 
                                        'Actividad'
                                    ]}
                                />
                                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                                    {analytics.agendasData.map((entry, index) => (
                                        <Cell key={`bar-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div style={{ marginTop: 'auto', fontSize: '0.72rem', color: '#64748B', textAlign: 'center' }}>
                        Azul: Quirófano HdD (Qx 5 / 6) | Púrpura: Hemoterapia / Enfermería
                    </div>
                </div>

                {/* 5. TOP MÉDICOS / CIRUJANOS AUDITADOS */}
                <div style={{
                    gridColumn: 'span 4',
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '22px 24px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <div style={{ marginBottom: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#059669' }} />
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                                Profesionales Más Activos
                            </h3>
                        </div>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                            Cirujanos principales vs indicación de hierro
                        </p>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, overflowY: 'auto' }}>
                        {/* Top Quirúrgicos */}
                        <div>
                            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#1E40AF', textTransform: 'uppercase', marginBottom: '6px' }}>
                                Top Cirujanos en Quirófanos HdD
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {analytics.topMedicosQx && analytics.topMedicosQx.length > 0 ? (
                                    analytics.topMedicosQx.map((m, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', padding: '3px 6px', background: '#F8FAFC', borderRadius: '4px' }}>
                                            <span style={{ color: '#1E293B', fontWeight: 600 }}>{m.medico}</span>
                                            <span style={{ fontWeight: 800, color: '#2563EB' }}>{m.count} cx</span>
                                        </div>
                                    ))
                                ) : (
                                    <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Sin datos quirúrgicos</span>
                                )}
                            </div>
                        </div>

                        {/* Top Hemoterapia / Hierro */}
                        <div>
                            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#6D28D9', textTransform: 'uppercase', marginBottom: '6px' }}>
                                Responsables de Pases de Hierro
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {analytics.topMedicosHierro && analytics.topMedicosHierro.length > 0 ? (
                                    analytics.topMedicosHierro.map((m, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', padding: '3px 6px', background: '#FAF5FF', borderRadius: '4px' }}>
                                            <span style={{ color: '#1E293B', fontWeight: 600 }}>{m.medico}</span>
                                            <span style={{ fontWeight: 800, color: '#8B5CF6' }}>{m.count} infus.</span>
                                        </div>
                                    ))
                                ) : (
                                    <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Sin datos de infusiones</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* AUDITORÍA TABULADA & FILTROS NOMINALES */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                padding: '24px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
            }}>
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '16px',
                    marginBottom: '20px'
                }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                            Trazabilidad Nominal de Pacientes y Procedimientos
                        </h3>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                            Mostrando {filteredRecords.length} de {records.length} turnos registrados en el período
                        </p>
                    </div>

                    {/* Filtros rápidos & Buscador */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
                        {/* Selector Tipo */}
                        <div style={{
                            display: 'flex',
                            background: '#F1F5F9',
                            padding: '3px',
                            borderRadius: '8px',
                            border: '1px solid #E2E8F0'
                        }}>
                            {[
                                { id: 'TODOS', label: 'Todos' },
                                { id: 'QUIRURGICO', label: 'Solo Quirúrgicos' },
                                { id: 'HIERRO', label: 'Solo Hierro' }
                            ].map(btn => (
                                <button
                                    key={btn.id}
                                    onClick={() => { setFilterTipo(btn.id); setPage(1); }}
                                    style={{
                                        border: 'none',
                                        background: filterTipo === btn.id ? '#FFFFFF' : 'transparent',
                                        color: filterTipo === btn.id ? '#0F172A' : '#64748B',
                                        fontWeight: filterTipo === btn.id ? 800 : 500,
                                        fontSize: '0.76rem',
                                        padding: '5px 12px',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        boxShadow: filterTipo === btn.id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    {btn.label}
                                </button>
                            ))}
                        </div>

                        {/* Selector Asistencia */}
                        <select
                            value={filterAsistencia}
                            onChange={e => { setFilterAsistencia(e.target.value); setPage(1); }}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                background: '#FFFFFF',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                color: '#334155',
                                cursor: 'pointer'
                            }}
                        >
                            <option value="TODOS">Estado: Todos</option>
                            <option value="EFECTIVOS">Solo Atendidos / Presentes</option>
                            <option value="SUSPENDIDOS">Solo Suspendidos / Ausentes</option>
                        </select>

                        {/* Buscador de texto */}
                        <div style={{
                            position: 'relative',
                            display: 'flex',
                            alignItems: 'center'
                        }}>
                            <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: '10px' }} />
                            <input
                                type="text"
                                placeholder="Buscar paciente, DNI, médico..."
                                value={searchTerm}
                                onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
                                style={{
                                    padding: '6px 12px 6px 32px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.78rem',
                                    outline: 'none',
                                    width: '240px',
                                    background: '#FFFFFF'
                                }}
                            />
                        </div>

                        {/* Botón Exportar a Excel con filtros colocados */}
                        <button
                            type="button"
                            onClick={handleExportExcel}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 14px',
                                borderRadius: '8px',
                                border: '1.5px solid #10B981',
                                background: '#ECFDF5',
                                color: '#047857',
                                fontSize: '0.78rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                boxShadow: '0 1px 2px rgba(16, 185, 129, 0.08)'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#D1FAE5'; e.currentTarget.style.borderColor = '#059669'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#ECFDF5'; e.currentTarget.style.borderColor = '#10B981'; }}
                            title={`Exportar a Excel los ${filteredRecords.length} turnos filtrados actualmente`}
                        >
                            <FileSpreadsheet size={15} color="#059669" />
                            <span>Exportar Excel ({filteredRecords.length})</span>
                        </button>
                    </div>
                </div>

                {/* TABLA DE AUDITORÍA */}
                <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                <th style={{ padding: '10px 14px' }}>Fecha & Hora</th>
                                <th style={{ padding: '10px 14px' }}>Paciente / DNI</th>
                                <th style={{ padding: '10px 14px' }}>Agenda</th>
                                <th style={{ padding: '10px 14px' }}>Tipo Actividad</th>
                                <th style={{ padding: '10px 14px' }}>Práctica / Cirugía</th>
                                <th style={{ padding: '10px 14px' }}>Fármaco</th>
                                <th style={{ padding: '10px 14px' }}>Médico Responsable</th>
                                <th style={{ padding: '10px 14px' }}>Asistencia</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedRecords.length > 0 ? (
                                paginatedRecords.map((r) => {
                                    const isQ = r.tipo_actividad === 'PROCEDIMIENTO_QUIRURGICO';
                                    const isPresente = (r.asistencia || '').toUpperCase() === 'PRESENTE' || (r.asistencia || '').toUpperCase() === 'URGENCIA';

                                    return (
                                        <tr 
                                            key={r.id_visita}
                                            style={{
                                                borderBottom: '1px solid #F1F5F9',
                                                transition: 'background 0.12s ease'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                                                <div style={{ fontWeight: 700, color: '#1E293B' }}>{r.fecha}</div>
                                                <div style={{ fontSize: '0.7rem', color: '#64748B' }}>{r.hora || '--:--'}</div>
                                            </td>
                                            <td style={{ padding: '10px 14px' }}>
                                                <div style={{ fontWeight: 700, color: '#0F172A' }}>{r.paciente_nombre}</div>
                                                <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                                    DNI: {r.paciente_dni || 'S/D'} · {r.obra_social || 'Particular'}
                                                </div>
                                            </td>
                                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                                                <span style={{
                                                    fontSize: '0.72rem',
                                                    fontWeight: 600,
                                                    color: '#334155',
                                                    background: '#F1F5F9',
                                                    padding: '2px 7px',
                                                    borderRadius: '4px'
                                                }}>
                                                    {r.agenda}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    fontWeight: 800,
                                                    padding: '3px 8px',
                                                    borderRadius: '6px',
                                                    background: isQ ? '#EFF6FF' : '#FAF5FF',
                                                    color: isQ ? '#1E40AF' : '#6D28D9',
                                                    border: `1px solid ${isQ ? '#BFDBFE' : '#DDD6FE'}`
                                                }}>
                                                    {isQ ? 'PROCEDIMIENTO QUIRÚRGICO' : 'INFUSIÓN DE HIERRO'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px 14px', maxWidth: '280px' }}>
                                                <div style={{
                                                    fontSize: '0.76rem',
                                                    fontWeight: 600,
                                                    color: '#1E293B',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis'
                                                }}
                                                title={r.descripcion_practica}
                                                >
                                                    {r.descripcion_practica || r.agenda}
                                                </div>
                                            </td>
                                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                                                {r.farmaco_hierro ? (
                                                    <span style={{
                                                        fontSize: '0.72rem',
                                                        fontWeight: 700,
                                                        color: r.farmaco_hierro.includes('FERINJECT') ? '#BE185D' : '#7E22CE',
                                                        background: r.farmaco_hierro.includes('FERINJECT') ? '#FCE7F3' : '#F3E8FF',
                                                        padding: '2px 7px',
                                                        borderRadius: '4px'
                                                    }}>
                                                        {r.farmaco_hierro}
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>--</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                                                <div style={{ fontSize: '0.76rem', fontWeight: 600, color: '#334155' }}>
                                                    {r.medico_responsable}
                                                </div>
                                            </td>
                                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                                                <span style={{
                                                    fontSize: '0.72rem',
                                                    fontWeight: 700,
                                                    padding: '2px 8px',
                                                    borderRadius: '6px',
                                                    background: isPresente ? '#D1FAE5' : '#FEE2E2',
                                                    color: isPresente ? '#065F46' : '#991B1B'
                                                }}>
                                                    {r.asistencia}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={8} style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                                        {loading ? (
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                                <RefreshCw className="animate-spin" size={18} color="#2563EB" />
                                                <span>Cargando datos desde SALUS...</span>
                                            </div>
                                        ) : (
                                            <span>No se encontraron registros que coincidan con los filtros aplicados.</span>
                                        )}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* PAGINACIÓN */}
                {totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                            Página {page} de {totalPages} ({filteredRecords.length} turnos)
                        </span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                style={{
                                    border: '1px solid #CBD5E1',
                                    background: '#FFFFFF',
                                    borderRadius: '6px',
                                    padding: '4px 8px',
                                    cursor: page === 1 ? 'not-allowed' : 'pointer',
                                    color: page === 1 ? '#CBD5E1' : '#334155',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}
                            >
                                <ChevronLeft size={16} />
                            </button>

                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                style={{
                                    border: '1px solid #CBD5E1',
                                    background: '#FFFFFF',
                                    borderRadius: '6px',
                                    padding: '4px 8px',
                                    cursor: page === totalPages ? 'not-allowed' : 'pointer',
                                    color: page === totalPages ? '#CBD5E1' : '#334155',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

        </div>
    );
}
