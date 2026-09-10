import React, { useState, useEffect, useMemo } from 'react';
import { 
    X, AlertTriangle, Clock, ShieldAlert, HeartPulse, Stethoscope, 
    FlaskConical, FileSpreadsheet, FileText, Search, ChevronDown, ChevronUp, 
    Activity, Filter, User, Bed, Calendar, ArrowRight, CheckCircle2, Download
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function UciMortalidadAuditModal({ 
    isOpen, 
    onClose, 
    rawData = [], 
    totalAdmisionesCount = 0,
    sectorLabel = 'Cuidados Críticos (UCI)',
    dateFilter = {} 
}) {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStay, setFilterStay] = useState('all'); // 'all', 'under_24h', 'under_48h', 'over_48h', 'urgencias'
    const [expandedNhc, setExpandedNhc] = useState(null);
    const [activeSubTab, setActiveSubTab] = useState('diagnosticos'); // 'diagnosticos', 'peticiones'

    // Datos clínicos cruzados
    const [loadingClinical, setLoadingClinical] = useState(false);
    const [diagnosticosMap, setDiagnosticosMap] = useState({});
    const [peticionesMap, setPeticionesMap] = useState({});

    // 1. Filtrar y deduplicar admisiones con motivo de egreso Defunción
    const defunciones = useMemo(() => {
        if (!rawData || rawData.length === 0) return [];

        const defMap = new Map();
        rawData.forEach(r => {
            const motivo = (r.motivo_de_alta || '').toLowerCase();
            if (motivo.includes('defunc') || motivo.includes('fallec') || motivo.includes('óbito') || motivo.includes('obito')) {
                const key = r.numero_admision || r.id_admision || `${r.nhc}_${r.fecha_ingreso}`;
                if (!defMap.has(key)) {
                    // Calcular horas y días de estancia hasta el óbito
                    let horasEstancia = null;
                    let diasEstancia = 1;
                    if (r.fecha_ingreso && r.fecha_alta) {
                        const dIng = new Date(r.fecha_ingreso);
                        const dAlt = new Date(r.fecha_alta);
                        const diffMs = Math.max(0, dAlt - dIng);
                        horasEstancia = Math.round(diffMs / (1000 * 60 * 60));
                        diasEstancia = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
                    } else if (r.fecha_ingreso) {
                        const dIng = new Date(r.fecha_ingreso);
                        const diffMs = Math.max(0, new Date() - dIng);
                        horasEstancia = Math.round(diffMs / (1000 * 60 * 60));
                        diasEstancia = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
                    }

                    // Clasificación clínica temporal
                    let clasificacion = 'evolutiva';
                    let clasifLabel = 'Evolutiva (> 48 hs)';
                    let clasifColor = '#2563EB'; // Azul
                    let clasifBg = '#EFF6FF';

                    if (horasEstancia !== null && horasEstancia < 24) {
                        clasificacion = 'ultra_precoz';
                        clasifLabel = '< 24 hs (Cuadro Agónico / Reanimación)';
                        clasifColor = '#DC2626'; // Rojo intenso
                        clasifBg = '#FEF2F2';
                    } else if (horasEstancia !== null && horasEstancia <= 48) {
                        clasificacion = 'precoz';
                        clasifLabel = '24 - 48 hs (Ingreso Crítico Inicial)';
                        clasifColor = '#D97706'; // Ámbar/Naranja
                        clasifBg = '#FFFBEB';
                    } else if (diasEstancia > 7) {
                        clasificacion = 'prolongada';
                        clasifLabel = '> 7 días (Estancia Prolongada)';
                        clasifColor = '#475569'; // Pizarra
                        clasifBg = '#F1F5F9';
                    }

                    defMap.set(key, {
                        ...r,
                        horasEstancia,
                        diasEstancia,
                        clasificacion,
                        clasifLabel,
                        clasifColor,
                        clasifBg,
                        esUrgencias: (r.procedencia || '').toLowerCase().includes('urgencia') || (r.procedencia || '').toLowerCase().includes('guardia')
                    });
                }
            }
        });

        // Ordenar por fecha de alta (defunción) descendente
        return Array.from(defMap.values()).sort((a, b) => {
            const dateA = new Date(a.fecha_alta || a.fecha_ingreso || 0);
            const dateB = new Date(b.fecha_alta || b.fecha_ingreso || 0);
            return dateB - dateA;
        });
    }, [rawData]);

    // 2. Cargar Diagnósticos y Peticiones asociadas a los pacientes fallecidos
    useEffect(() => {
        if (!isOpen || defunciones.length === 0) return;

        const nhcs = Array.from(new Set(defunciones.map(d => d.nhc).filter(Boolean)));
        if (nhcs.length === 0) return;

        let isMounted = true;
        setLoadingClinical(true);

        const fetchClinicalDetails = async () => {
            try {
                // A. Diagnósticos de SALUS
                const { data: diagData, error: diagError } = await supabase
                    .from('calidad_pacientes_diagnosticos')
                    .select('nhc, paciente, diagnostico, motivo, formulario, fecha_visita')
                    .in('nhc', nhcs)
                    .order('fecha_visita', { ascending: false });

                if (diagError) console.error('Error fetching diag:', diagError);

                // B. Peticiones y Estudios de SALUS
                const { data: petData, error: petError } = await supabase
                    .from('calidad_peticiones_pruebas')
                    .select('id_paciente, paciente, fecha_solicitud, estudio, tipo_articulo, modalidad, solicitante, habitacion, prioridad')
                    .in('id_paciente', nhcs)
                    .order('fecha_solicitud', { ascending: false });

                if (petError) console.error('Error fetching peticiones:', petError);

                if (isMounted) {
                    // Mapear diagnósticos por NHC
                    const dMap = {};
                    (diagData || []).forEach(d => {
                        const nhcKey = String(d.nhc).trim();
                        if (!dMap[nhcKey]) dMap[nhcKey] = [];
                        dMap[nhcKey].push(d);
                    });
                    setDiagnosticosMap(dMap);

                    // Mapear peticiones por NHC
                    const pMap = {};
                    (petData || []).forEach(p => {
                        const nhcKey = String(p.id_paciente).trim();
                        if (!pMap[nhcKey]) pMap[nhcKey] = [];
                        pMap[nhcKey].push(p);
                    });
                    setPeticionesMap(pMap);
                }
            } catch (err) {
                console.error('Error in fetchClinicalDetails:', err);
            } finally {
                if (isMounted) setLoadingClinical(false);
            }
        };

        fetchClinicalDetails();

        return () => {
            isMounted = false;
        };
    }, [isOpen, defunciones]);

    // 3. Métricas de Severidad y KPIs
    const metrics = useMemo(() => {
        const total = defunciones.length;
        if (total === 0) {
            return {
                total: 0,
                porcDefuncion: '0.0',
                ultraPrecoz: 0,
                porcUltraPrecoz: '0.0',
                precoz: 0,
                porcPrecoz: '0.0',
                totalPrecoz48h: 0,
                porcTotalPrecoz48h: '0.0',
                evolutiva: 0,
                porcEvolutiva: '0.0',
                urgenciasCount: 0,
                porcUrgencias: '0.0',
                edadPromedio: 0
            };
        }

        let ultraPrecoz = 0; // < 24h
        let precoz24a48h = 0; // 24 a 48h
        let evolutiva = 0; // > 48h
        let urgenciasCount = 0;
        let sumEdad = 0;
        let edadCount = 0;

        defunciones.forEach(d => {
            if (d.horasEstancia !== null && d.horasEstancia < 24) {
                ultraPrecoz++;
            } else if (d.horasEstancia !== null && d.horasEstancia <= 48) {
                precoz24a48h++;
            } else {
                evolutiva++;
            }

            if (d.esUrgencias) urgenciasCount++;

            if (d.edad && Number(d.edad) > 0) {
                sumEdad += Number(d.edad);
                edadCount++;
            }
        });

        const totalPrecoz48h = ultraPrecoz + precoz24a48h;
        const totalBase = totalAdmisionesCount > 0 ? totalAdmisionesCount : total;
        const porcDefuncion = ((total / totalBase) * 100).toFixed(1);

        return {
            total,
            porcDefuncion,
            ultraPrecoz,
            porcUltraPrecoz: ((ultraPrecoz / total) * 100).toFixed(1),
            precoz: precoz24a48h,
            porcPrecoz: ((precoz24a48h / total) * 100).toFixed(1),
            totalPrecoz48h,
            porcTotalPrecoz48h: ((totalPrecoz48h / total) * 100).toFixed(1),
            evolutiva,
            porcEvolutiva: ((evolutiva / total) * 100).toFixed(1),
            urgenciasCount,
            porcUrgencias: ((urgenciasCount / total) * 100).toFixed(1),
            edadPromedio: edadCount > 0 ? Math.round(sumEdad / edadCount) : 72
        };
    }, [defunciones, totalAdmisionesCount]);

    // 4. Filtrado interactivo de la tabla
    const filteredRows = useMemo(() => {
        return defunciones.filter(row => {
            // Filtro por pestaña de permanencia
            if (filterStay === 'under_24h' && (row.horasEstancia === null || row.horasEstancia >= 24)) return false;
            if (filterStay === 'under_48h' && (row.horasEstancia === null || row.horasEstancia > 48)) return false;
            if (filterStay === 'over_48h' && (row.horasEstancia !== null && row.horasEstancia <= 48)) return false;
            if (filterStay === 'urgencias' && !row.esUrgencias) return false;

            // Filtro por texto de búsqueda
            if (searchTerm.trim()) {
                const q = searchTerm.toLowerCase().trim();
                const diags = (diagnosticosMap[String(row.nhc).trim()] || []).map(d => `${d.diagnostico} ${d.motivo}`).join(' ').toLowerCase();
                const matchesText = 
                    String(row.paciente || '').toLowerCase().includes(q) ||
                    String(row.nhc || '').toLowerCase().includes(q) ||
                    String(row.numero_admision || '').toLowerCase().includes(q) ||
                    String(row.procedencia || '').toLowerCase().includes(q) ||
                    String(row.especialidad || '').toLowerCase().includes(q) ||
                    diags.includes(q);

                if (!matchesText) return false;
            }

            return true;
        });
    }, [defunciones, filterStay, searchTerm, diagnosticosMap]);

    // 5. Exportar a Excel con Auditoría Tabular Completa
    const handleExportExcel = () => {
        const wb = XLSX.utils.book_new();

        // Hoja 1: Resumen de Indicadores Clínicos
        const resumenKPIs = [
            { 'Indicador Clínico': 'Total Defunciones en el Período', 'Valor': metrics.total, 'Porcentaje': '100%' },
            { 'Indicador Clínico': 'Tasa Cruda de Mortalidad', 'Valor': `${metrics.porcDefuncion}%`, 'Porcentaje': `Sobre ${totalAdmisionesCount} admisiones` },
            { 'Indicador Clínico': 'Mortalidad Ultra-Precoz (< 24 hs)', 'Valor': metrics.ultraPrecoz, 'Porcentaje': `${metrics.porcUltraPrecoz}% (Cuadros agónicos / Irreversibles)` },
            { 'Indicador Clínico': 'Mortalidad Precoz Total (< 48 hs)', 'Valor': metrics.totalPrecoz48h, 'Porcentaje': `${metrics.porcTotalPrecoz48h}% (Ingresos críticos iniciales)` },
            { 'Indicador Clínico': 'Mortalidad Evolutiva (> 48 hs)', 'Valor': metrics.evolutiva, 'Porcentaje': `${metrics.porcEvolutiva}% (Evolución intra-UCI)` },
            { 'Indicador Clínico': 'Derivados desde Urgencias / Guardia', 'Valor': metrics.urgenciasCount, 'Porcentaje': `${metrics.porcUrgencias}% (Canal predominante)` },
            { 'Indicador Clínico': 'Edad Promedio de Pacientes', 'Valor': `${metrics.edadPromedio} años`, 'Porcentaje': 'Vulnerabilidad basal' }
        ];
        const wsResumen = XLSX.utils.json_to_sheet(resumenKPIs);
        wsResumen['!cols'] = [{ wch: 38 }, { wch: 15 }, { wch: 40 }];
        XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen_Mortalidad_UCI");

        // Hoja 2: Listado Nominal Detallado
        const detallePacientes = filteredRows.map(r => {
            const nhcKey = String(r.nhc).trim();
            const diags = diagnosticosMap[nhcKey] || [];
            const pets = peticionesMap[nhcKey] || [];

            const diagTexto = diags.map(d => d.diagnostico).filter(Boolean).join(' | ') || 'Sin codificación CIE';
            const petTexto = pets.map(p => p.estudio).filter(Boolean).slice(0, 3).join(' | ') || 'Sin estudios en registro';

            return {
                'N° Admisión': r.numero_admision || '-',
                'NHC': r.nhc || '-',
                'Paciente': r.paciente || '-',
                'Edad': r.edad || '-',
                'Procedencia': r.procedencia || '-',
                'Fecha Ingreso': r.fecha_ingreso ? new Date(r.fecha_ingreso).toLocaleString('es-AR') : '-',
                'Fecha Defunción': r.fecha_alta ? new Date(r.fecha_alta).toLocaleString('es-AR') : '-',
                'Horas en UCI': r.horasEstancia !== null ? `${r.horasEstancia} hs` : '-',
                'Días de Estancia': r.diasEstancia,
                'Estratificación': r.clasifLabel,
                'Especialidad': r.especialidad || '-',
                'Financiador': r.cliente || '-',
                'Diagnósticos de Ingreso': diagTexto,
                'Estudios Solicitados': petTexto
            };
        });

        const wsDetalle = XLSX.utils.json_to_sheet(detallePacientes);
        wsDetalle['!cols'] = [
            { wch: 14 }, { wch: 10 }, { wch: 30 }, { wch: 8 }, { wch: 25 },
            { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 15 }, { wch: 35 },
            { wch: 22 }, { wch: 20 }, { wch: 45 }, { wch: 45 }
        ];
        XLSX.utils.book_append_sheet(wb, wsDetalle, "Pacientes_Fallecidos");

        const dateStr = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `Auditoria_Mortalidad_UCI_${dateStr}.xlsx`);
    };

    // 6. Exportar a PDF Institucional
    const handleExportPDF = () => {
        const doc = new jsPDF('landscape');
        const primaryBlue = [30, 64, 175]; // #1E40AF

        // Encabezado institucional
        doc.setFillColor(...primaryBlue);
        doc.rect(0, 0, 297, 18, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('SANATORIO ARGENTINO — AUDITORÍA CLÍNICA DE MORTALIDAD UCI', 14, 12);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(`Fecha: ${new Date().toLocaleDateString('es-AR')}`, 280, 12, { align: 'right' });

        // Resumen clínico superior
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`Informe de Defunciones y Severidad al Ingreso — Sector: ${sectorLabel}`, 14, 26);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(
            `Total Fallecidos: ${metrics.total} (${metrics.porcDefuncion}% cruda) | Mortalidad Precoz <48h: ${metrics.totalPrecoz48h} (${metrics.porcTotalPrecoz48h}%) | <24h: ${metrics.ultraPrecoz} (${metrics.porcUltraPrecoz}%) | Urgencias: ${metrics.urgenciasCount} (${metrics.porcUrgencias}%)`, 
            14, 32
        );

        // Tabla PDF
        const tableBody = filteredRows.map(r => {
            const nhcKey = String(r.nhc).trim();
            const diags = (diagnosticosMap[nhcKey] || []).map(d => d.diagnostico).filter(Boolean).slice(0, 2).join('\n') || '-';
            const fIng = r.fecha_ingreso ? new Date(r.fecha_ingreso).toLocaleDateString('es-AR') : '-';
            const fAlt = r.fecha_alta ? new Date(r.fecha_alta).toLocaleDateString('es-AR') : '-';
            const tiempo = r.horasEstancia !== null ? `${r.horasEstancia} hs` : `${r.diasEstancia} d`;

            return [
                r.nhc || '-',
                r.paciente || '-',
                r.edad ?? '-',
                r.procedencia || '-',
                `${fIng} a ${fAlt}`,
                tiempo,
                r.clasifLabel.split('(')[0].trim(),
                diags
            ];
        });

        autoTable(doc, {
            startY: 36,
            head: [['NHC', 'Paciente', 'Edad', 'Procedencia', 'Período', 'Tiempo', 'Estratificación', 'Diagnóstico de Ingreso']],
            body: tableBody,
            styles: { fontSize: 7, cellPadding: 2 },
            headStyles: { fillColor: primaryBlue, textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
                0: { cellWidth: 16 },
                1: { cellWidth: 50 },
                2: { cellWidth: 12 },
                3: { cellWidth: 35 },
                4: { cellWidth: 30 },
                5: { cellWidth: 18 },
                6: { cellWidth: 40 },
                7: { cellWidth: 70 }
            }
        });

        const dateStr = new Date().toISOString().split('T')[0];
        doc.save(`Auditoria_Mortalidad_UCI_${dateStr}.pdf`);
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px'
        }}>
            <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '1240px',
                maxHeight: '94vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                overflow: 'hidden',
                border: '1px solid #E2E8F0',
                fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
            }}>
                {/* ─── ENCABEZADO ─── */}
                <div style={{
                    padding: '18px 24px',
                    borderBottom: '1px solid #E2E8F0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#F8FAFC'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '40px', height: '40px', borderRadius: '10px',
                            background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#DC2626'
                        }}>
                            <ShieldAlert size={22} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0F172A' }}>
                                    Auditoría Clínica de Mortalidad y Motivos de Defunción
                                </h3>
                                <span style={{
                                    fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '12px',
                                    background: '#1E40AF', color: '#FFFFFF'
                                }}>
                                    {sectorLabel}
                                </span>
                            </div>
                            <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                                Estratificación precoz vs evolutiva, cruce nosológico al ingreso y trazabilidad de estudios complementarios
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                            onClick={handleExportExcel}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '7px 14px', borderRadius: '8px',
                                border: '1px solid #10B981', background: '#ECFDF5',
                                color: '#047857', fontSize: '0.8rem', fontWeight: 600,
                                cursor: 'pointer', transition: 'all 0.15s'
                            }}
                            title="Descargar auditoría completa en Excel (.xlsx)"
                        >
                            <FileSpreadsheet size={15} />
                            Excel Tabulado
                        </button>

                        <button
                            onClick={handleExportPDF}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '7px 14px', borderRadius: '8px',
                                border: '1px solid #E2E8F0', background: '#FFFFFF',
                                color: '#334155', fontSize: '0.8rem', fontWeight: 600,
                                cursor: 'pointer', transition: 'all 0.15s'
                            }}
                            title="Descargar reporte en PDF institucional"
                        >
                            <FileText size={15} color="#DC2626" />
                            PDF Ejecutivo
                        </button>

                        <button
                            onClick={onClose}
                            style={{
                                background: 'transparent', border: 'none', cursor: 'pointer',
                                padding: '6px', borderRadius: '8px', color: '#64748B'
                            }}
                            title="Cerrar modal"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* ─── SCORECARDS DE SEVERIDAD CLÍNICA ─── */}
                <div style={{
                    padding: '16px 24px',
                    background: '#FFFFFF',
                    borderBottom: '1px solid #E2E8F0',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, 1fr)',
                    gap: '12px'
                }}>
                    {/* KPI 1: Defunciones Totales */}
                    <div style={{
                        background: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: '10px',
                        padding: '12px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                    }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#991B1B', textTransform: 'uppercase' }}>
                            Defunciones Totales
                        </span>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#DC2626', margin: '4px 0' }}>
                            {metrics.total}
                        </div>
                        <span style={{ fontSize: '0.73rem', color: '#7F1D1D' }}>
                            Tasa cruda: <strong>{metrics.porcDefuncion}%</strong>
                        </span>
                    </div>

                    {/* KPI 2: Mortalidad Precoz < 48 hs (CRÍTICO AL INGRESO) */}
                    <div style={{
                        background: '#FFFBEB', border: '1px solid #FEF3C7', borderRadius: '10px',
                        padding: '12px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#92400E', textTransform: 'uppercase' }}>
                                Precoz (&lt; 48 hs)
                            </span>
                            <span style={{ fontSize: '0.68rem', background: '#FDE68A', color: '#78350F', padding: '1px 6px', borderRadius: '6px', fontWeight: 700 }}>
                                Irreversible
                            </span>
                        </div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#D97706', margin: '4px 0' }}>
                            {metrics.totalPrecoz48h} <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>({metrics.porcTotalPrecoz48h}%)</span>
                        </div>
                        <span style={{ fontSize: '0.73rem', color: '#B45309' }}>
                            Ingreso agónico terminal
                        </span>
                    </div>

                    {/* KPI 3: Ultra-Precoz < 24 hs */}
                    <div style={{
                        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px',
                        padding: '12px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                    }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                            Ultra-Precoz (&lt; 24 hs)
                        </span>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#EF4444', margin: '4px 0' }}>
                            {metrics.ultraPrecoz} <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>({metrics.porcUltraPrecoz}%)</span>
                        </div>
                        <span style={{ fontSize: '0.73rem', color: '#64748B' }}>
                            Reanimación sin respuesta
                        </span>
                    </div>

                    {/* KPI 4: Desde Urgencias / Guardia */}
                    <div style={{
                        background: '#EFF6FF', border: '1px solid #DBEAFE', borderRadius: '10px',
                        padding: '12px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                    }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1E40AF', textTransform: 'uppercase' }}>
                            Puerta Urgencias
                        </span>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#2563EB', margin: '4px 0' }}>
                            {metrics.urgenciasCount} <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>({metrics.porcUrgencias}%)</span>
                        </div>
                        <span style={{ fontSize: '0.73rem', color: '#1E40AF' }}>
                            Canal hiperagudo masivo
                        </span>
                    </div>

                    {/* KPI 5: Evolutiva > 48 hs */}
                    <div style={{
                        background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px',
                        padding: '12px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                    }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                            Evolutiva (&gt; 48 hs)
                        </span>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#334155', margin: '4px 0' }}>
                            {metrics.evolutiva} <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>({metrics.porcEvolutiva}%)</span>
                        </div>
                        <span style={{ fontSize: '0.73rem', color: '#64748B' }}>
                            Edad promedio: <strong>{metrics.edadPromedio} años</strong>
                        </span>
                    </div>
                </div>

                {/* ─── FILTROS Y BÚSQUEDA ─── */}
                <div style={{
                    padding: '12px 24px',
                    borderBottom: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    background: '#FFFFFF'
                }}>
                    {/* Pestañas de filtrado temporal */}
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                            onClick={() => setFilterStay('all')}
                            style={{
                                padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600,
                                border: 'none', cursor: 'pointer',
                                background: filterStay === 'all' ? '#1E40AF' : '#F1F5F9',
                                color: filterStay === 'all' ? '#FFFFFF' : '#475569'
                            }}
                        >
                            Todas las Defunciones ({defunciones.length})
                        </button>
                        <button
                            onClick={() => setFilterStay('under_24h')}
                            style={{
                                padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600,
                                border: 'none', cursor: 'pointer',
                                background: filterStay === 'under_24h' ? '#DC2626' : '#FEE2E2',
                                color: filterStay === 'under_24h' ? '#FFFFFF' : '#991B1B'
                            }}
                        >
                            &lt; 24 hs ({metrics.ultraPrecoz})
                        </button>
                        <button
                            onClick={() => setFilterStay('under_48h')}
                            style={{
                                padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600,
                                border: 'none', cursor: 'pointer',
                                background: filterStay === 'under_48h' ? '#D97706' : '#FEF3C7',
                                color: filterStay === 'under_48h' ? '#FFFFFF' : '#92400E'
                            }}
                        >
                            &lt; 48 hs Precoz ({metrics.totalPrecoz48h})
                        </button>
                        <button
                            onClick={() => setFilterStay('over_48h')}
                            style={{
                                padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600,
                                border: 'none', cursor: 'pointer',
                                background: filterStay === 'over_48h' ? '#2563EB' : '#EFF6FF',
                                color: filterStay === 'over_48h' ? '#FFFFFF' : '#1E40AF'
                            }}
                        >
                            &gt; 48 hs Evolutiva ({metrics.evolutiva})
                        </button>
                        <button
                            onClick={() => setFilterStay('urgencias')}
                            style={{
                                padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600,
                                border: 'none', cursor: 'pointer',
                                background: filterStay === 'urgencias' ? '#0F172A' : '#F1F5F9',
                                color: filterStay === 'urgencias' ? '#FFFFFF' : '#334155'
                            }}
                        >
                            Desde Urgencias ({metrics.urgenciasCount})
                        </button>
                    </div>

                    {/* Buscador */}
                    <div style={{
                        position: 'relative', width: '280px', display: 'flex', alignItems: 'center'
                    }}>
                        <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: '10px' }} />
                        <input
                            type="text"
                            placeholder="Buscar paciente, NHC o diagnóstico..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%', padding: '6px 12px 6px 32px', borderRadius: '8px',
                                border: '1px solid #CBD5E1', fontSize: '0.8rem', color: '#1E293B',
                                outline: 'none'
                            }}
                        />
                    </div>
                </div>

                {/* ─── TABLA DE PACIENTES FALLECIDOS ─── */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 20px 24px' }}>
                    {loadingClinical && (
                        <div style={{ padding: '8px 12px', background: '#F0FDF4', color: '#166534', fontSize: '0.75rem', borderRadius: '6px', margin: '12px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Activity size={14} className="animate-spin" />
                            Cargando diagnósticos y estudios de SALUS para los pacientes fallecidos...
                        </div>
                    )}

                    {filteredRows.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748B' }}>
                            <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>No se encontraron defunciones para los filtros seleccionados</p>
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #E2E8F0', color: '#475569', textAlign: 'left', background: '#F8FAFC' }}>
                                    <th style={{ padding: '10px 8px', width: '32px' }}></th>
                                    <th style={{ padding: '10px 8px' }}>Paciente / NHC</th>
                                    <th style={{ padding: '10px 8px' }}>Edad</th>
                                    <th style={{ padding: '10px 8px' }}>Procedencia</th>
                                    <th style={{ padding: '10px 8px' }}>Ingreso → Defunción</th>
                                    <th style={{ padding: '10px 8px' }}>Permanencia</th>
                                    <th style={{ padding: '10px 8px' }}>Estratificación</th>
                                    <th style={{ padding: '10px 8px' }}>Diagnósticos de Ingreso</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRows.map((row, idx) => {
                                    const nhcKey = String(row.nhc).trim();
                                    const diags = diagnosticosMap[nhcKey] || [];
                                    const peticiones = peticionesMap[nhcKey] || [];
                                    const isExpanded = expandedNhc === nhcKey;

                                    const fIng = row.fecha_ingreso ? new Date(row.fecha_ingreso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
                                    const fAlt = row.fecha_alta ? new Date(row.fecha_alta).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';

                                    return (
                                        <React.Fragment key={row.numero_admision || row.nhc || idx}>
                                            <tr 
                                                onClick={() => setExpandedNhc(isExpanded ? null : nhcKey)}
                                                style={{
                                                    borderBottom: '1px solid #E2E8F0',
                                                    cursor: 'pointer',
                                                    background: isExpanded ? '#F8FAFC' : (idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA'),
                                                    transition: 'background 0.15s'
                                                }}
                                            >
                                                <td style={{ padding: '10px 8px', textAlign: 'center', color: '#94A3B8' }}>
                                                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                </td>
                                                <td style={{ padding: '10px 8px' }}>
                                                    <strong style={{ color: '#0F172A', display: 'block' }}>{row.paciente}</strong>
                                                    <span style={{ color: '#64748B', fontSize: '0.72rem' }}>NHC: {row.nhc} | Adm: {row.numero_admision}</span>
                                                </td>
                                                <td style={{ padding: '10px 8px', color: '#334155' }}>
                                                    {row.edad ?? '-'} años
                                                </td>
                                                <td style={{ padding: '10px 8px' }}>
                                                    <span style={{
                                                        fontSize: '0.72rem', padding: '2px 8px', borderRadius: '6px', fontWeight: 600,
                                                        background: row.esUrgencias ? '#EFF6FF' : '#F1F5F9',
                                                        color: row.esUrgencias ? '#1E40AF' : '#475569'
                                                    }}>
                                                        {row.procedencia || 'Sin dato'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px 8px', fontSize: '0.75rem', color: '#334155' }}>
                                                    <div>{fIng}</div>
                                                    <div style={{ color: '#DC2626', fontWeight: 600 }}>{fAlt}</div>
                                                </td>
                                                <td style={{ padding: '10px 8px' }}>
                                                    <strong style={{ color: row.clasifColor, fontSize: '0.85rem' }}>
                                                        {row.horasEstancia !== null ? `${row.horasEstancia} hs` : `${row.diasEstancia} d`}
                                                    </strong>
                                                    <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                                        ({row.diasEstancia} día{row.diasEstancia > 1 ? 's' : ''})
                                                    </div>
                                                </td>
                                                <td style={{ padding: '10px 8px' }}>
                                                    <span style={{
                                                        fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: '8px',
                                                        background: row.clasifBg, color: row.clasifColor, display: 'inline-block'
                                                    }}>
                                                        {row.clasifLabel}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px 8px', maxWidth: '300px' }}>
                                                    {diags.length > 0 ? (
                                                        <div style={{ fontSize: '0.73rem', color: '#1E293B', lineHeight: '1.3' }}>
                                                            <strong>{diags[0].diagnostico}</strong>
                                                            {diags.length > 1 && (
                                                                <span style={{ color: '#2563EB', marginLeft: '4px', fontWeight: 600 }}>
                                                                    (+{diags.length - 1} más)
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span style={{ fontSize: '0.72rem', color: '#94A3B8', fontStyle: 'italic' }}>
                                                            {loadingClinical ? 'Consultando...' : 'Sin diagnóstico codificado'}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>

                                            {/* ─── FILA EXPANDIBLE: DETALLE CLÍNICO Y ESTUDIOS ─── */}
                                            {isExpanded && (
                                                <tr style={{ background: '#F8FAFC' }}>
                                                    <td colSpan={8} style={{ padding: '16px 20px', borderBottom: '2px solid #CBD5E1' }}>
                                                        <div style={{
                                                            background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0',
                                                            padding: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                                        }}>
                                                            {/* Barra de pestañas internas */}
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '10px', marginBottom: '14px' }}>
                                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); setActiveSubTab('diagnosticos'); }}
                                                                        style={{
                                                                            display: 'flex', alignItems: 'center', gap: '6px',
                                                                            padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600,
                                                                            border: 'none', cursor: 'pointer',
                                                                            background: activeSubTab === 'diagnosticos' ? '#1E40AF' : '#F1F5F9',
                                                                            color: activeSubTab === 'diagnosticos' ? '#FFFFFF' : '#475569'
                                                                        }}
                                                                    >
                                                                        <Stethoscope size={14} />
                                                                        Diagnósticos y Motivos ({diags.length})
                                                                    </button>

                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); setActiveSubTab('peticiones'); }}
                                                                        style={{
                                                                            display: 'flex', alignItems: 'center', gap: '6px',
                                                                            padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600,
                                                                            border: 'none', cursor: 'pointer',
                                                                            background: activeSubTab === 'peticiones' ? '#1E40AF' : '#F1F5F9',
                                                                            color: activeSubTab === 'peticiones' ? '#FFFFFF' : '#475569'
                                                                        }}
                                                                    >
                                                                        <FlaskConical size={14} />
                                                                        Estudios y Peticiones Solicitadas ({peticiones.length})
                                                                    </button>
                                                                </div>

                                                                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                                    Habitación/Box: <strong>{row.habitacion || 'UCI'}</strong> | Financiador: <strong>{row.cliente || 'Particular'}</strong>
                                                                </div>
                                                            </div>

                                                            {/* Contenido Pestaña 1: Diagnósticos */}
                                                            {activeSubTab === 'diagnosticos' && (
                                                                <div>
                                                                    {diags.length === 0 ? (
                                                                        <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748B', fontStyle: 'italic' }}>
                                                                            No se encontraron diagnósticos codificados en SALUS para este paciente.
                                                                        </p>
                                                                    ) : (
                                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '10px' }}>
                                                                            {diags.map((d, i) => (
                                                                                <div key={i} style={{
                                                                                    background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px',
                                                                                    padding: '10px 12px'
                                                                                }}>
                                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                                        <span style={{ fontSize: '0.68rem', color: '#2563EB', fontWeight: 700 }}>
                                                                                            {d.formulario || 'Formulario Clínico'}
                                                                                        </span>
                                                                                        <span style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                                                                            {d.fecha_visita ? new Date(d.fecha_visita).toLocaleDateString('es-AR') : '-'}
                                                                                        </span>
                                                                                    </div>
                                                                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F172A', marginTop: '4px' }}>
                                                                                        {d.diagnostico}
                                                                                    </div>
                                                                                    {d.motivo && (
                                                                                        <div style={{ fontSize: '0.73rem', color: '#475569', marginTop: '4px', fontStyle: 'italic' }}>
                                                                                            "{d.motivo}"
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {/* Contenido Pestaña 2: Estudios y Peticiones */}
                                                            {activeSubTab === 'peticiones' && (
                                                                <div>
                                                                    {peticiones.length === 0 ? (
                                                                        <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748B', fontStyle: 'italic' }}>
                                                                            No se registraron estudios de laboratorio o imágenes para este paciente en el período.
                                                                        </p>
                                                                    ) : (
                                                                        <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                                                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                                                                <thead>
                                                                                    <tr style={{ borderBottom: '1px solid #CBD5E1', color: '#64748B', textAlign: 'left' }}>
                                                                                        <th style={{ padding: '6px 8px' }}>Fecha y Hora</th>
                                                                                        <th style={{ padding: '6px 8px' }}>Estudio / Práctica</th>
                                                                                        <th style={{ padding: '6px 8px' }}>Modalidad</th>
                                                                                        <th style={{ padding: '6px 8px' }}>Solicitante</th>
                                                                                        <th style={{ padding: '6px 8px' }}>Ubicación</th>
                                                                                        <th style={{ padding: '6px 8px' }}>Prioridad</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {peticiones.map((p, pi) => (
                                                                                        <tr key={pi} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                                                            <td style={{ padding: '6px 8px', color: '#334155' }}>
                                                                                                {p.fecha_solicitud ? new Date(p.fecha_solicitud).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                                                                                            </td>
                                                                                            <td style={{ padding: '6px 8px', fontWeight: 600, color: '#0F172A' }}>
                                                                                                {p.estudio}
                                                                                            </td>
                                                                                            <td style={{ padding: '6px 8px' }}>
                                                                                                <span style={{
                                                                                                    fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 600,
                                                                                                    background: p.modalidad === 'Imágenes' ? '#FEF3C7' : '#EFF6FF',
                                                                                                    color: p.modalidad === 'Imágenes' ? '#92400E' : '#1E40AF'
                                                                                                }}>
                                                                                                    {p.modalidad || 'Laboratorio'}
                                                                                                </span>
                                                                                            </td>
                                                                                            <td style={{ padding: '6px 8px', color: '#475569' }}>
                                                                                                {p.solicitante || '-'}
                                                                                            </td>
                                                                                            <td style={{ padding: '6px 8px', color: '#64748B' }}>
                                                                                                {p.habitacion || 'UCI'}
                                                                                            </td>
                                                                                            <td style={{ padding: '6px 8px', color: p.prioridad === 'Urgente' ? '#DC2626' : '#64748B', fontWeight: p.prioridad === 'Urgente' ? 700 : 400 }}>
                                                                                                {p.prioridad || 'Normal'}
                                                                                            </td>
                                                                                        </tr>
                                                                                    ))}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* ─── FOOTER METODOLÓGICO ─── */}
                <div style={{
                    padding: '12px 24px',
                    background: '#F8FAFC',
                    borderTop: '1px solid #E2E8F0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.75rem',
                    color: '#64748B'
                }}>
                    <div>
                        <strong>Criterio de Auditoría Médica:</strong> La mortalidad &lt; 48 hs es un indicador centinela de severidad al ingreso (proxy APACHE II). No imputable a fallo terapéutico intra-UCI cuando se trata de shock irreversible o cuadros agónicos.
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '6px 16px', borderRadius: '6px', border: '1px solid #CBD5E1',
                            background: '#FFFFFF', color: '#334155', fontWeight: 600, cursor: 'pointer'
                        }}
                    >
                        Cerrar Auditoría
                    </button>
                </div>
            </div>
        </div>
    );
}
