import React, { useState, useEffect, useMemo } from 'react';
import { 
    X, AlertTriangle, Clock, ShieldAlert, HeartPulse, Stethoscope, 
    FlaskConical, FileSpreadsheet, FileText, Search, ChevronDown, ChevronUp, 
    Activity, Filter, User, Bed, Calendar, ArrowRight, CheckCircle2, Download,
    ArrowLeft, Building2, Check, FileCheck, Layers
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
    dateFilter = {},
    targetPatient = null 
}) {
    const [selectedCase, setSelectedCase] = useState(targetPatient);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStay, setFilterStay] = useState('all'); // 'all', 'under_24h', 'under_48h', 'over_48h', 'urgencias'
    const [expandedNhc, setExpandedNhc] = useState(null);
    const [activeSubTab, setActiveSubTab] = useState('diagnosticos'); // 'diagnosticos', 'peticiones', 'traslados', 'criterio'

    // Datos clínicos cruzados
    const [loadingClinical, setLoadingClinical] = useState(false);
    const [diagnosticosMap, setDiagnosticosMap] = useState({});
    const [peticionesMap, setPeticionesMap] = useState({});

    // Sincronizar foco en targetPatient si se abrió desde el Gantt o si cambia
    useEffect(() => {
        if (isOpen) {
            setSelectedCase(targetPatient);
            if (targetPatient?.nhc) {
                setExpandedNhc(String(targetPatient.nhc).trim());
            }
            setSearchTerm('');
            setFilterStay('all');
            setActiveSubTab('diagnosticos');
        }
    }, [targetPatient, isOpen]);

    // 1. Filtrar y deduplicar admisiones con motivo de egreso Defunción
    const defunciones = useMemo(() => {
        const defMap = new Map();
        (rawData || []).forEach(r => {
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

        // Asegurar que si viene targetPatient desde el Gantt, esté presente en el mapa
        if (targetPatient) {
            const tKey = targetPatient.numero_admision || targetPatient.id || `${targetPatient.nhc}_${targetPatient.fechaIngreso}`;
            if (!defMap.has(tKey)) {
                let horasEstancia = null;
                let diasEstancia = targetPatient.totalDays || 1;
                const dIng = targetPatient.fechaIngreso ? new Date(targetPatient.fechaIngreso) : null;
                const dAlt = targetPatient.fechaAlta ? new Date(targetPatient.fechaAlta) : null;
                if (dIng && dAlt) {
                    const diffMs = Math.max(0, dAlt - dIng);
                    horasEstancia = Math.round(diffMs / (1000 * 60 * 60));
                    diasEstancia = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
                }

                let clasificacion = 'evolutiva';
                let clasifLabel = 'Evolutiva (> 48 hs)';
                let clasifColor = '#2563EB';
                let clasifBg = '#EFF6FF';
                if (horasEstancia !== null && horasEstancia < 24) {
                    clasificacion = 'ultra_precoz';
                    clasifLabel = '< 24 hs (Cuadro Agónico / Reanimación)';
                    clasifColor = '#DC2626';
                    clasifBg = '#FEF2F2';
                } else if (horasEstancia !== null && horasEstancia <= 48) {
                    clasificacion = 'precoz';
                    clasifLabel = '24 - 48 hs (Ingreso Crítico Inicial)';
                    clasifColor = '#D97706';
                    clasifBg = '#FFFBEB';
                } else if (diasEstancia > 7) {
                    clasificacion = 'prolongada';
                    clasifLabel = '> 7 días (Estancia Prolongada)';
                    clasifColor = '#475569';
                    clasifBg = '#F1F5F9';
                }

                let fIngVal = null;
                if (targetPatient.fechaIngreso instanceof Date) {
                    fIngVal = targetPatient.fechaIngreso.toISOString();
                } else if (targetPatient.fechaIngreso) {
                    fIngVal = String(targetPatient.fechaIngreso);
                } else if (targetPatient.fecha_ingreso) {
                    fIngVal = String(targetPatient.fecha_ingreso);
                }

                let fAltVal = null;
                if (targetPatient.fechaAlta instanceof Date) {
                    fAltVal = targetPatient.fechaAlta.toISOString();
                } else if (targetPatient.fechaAlta) {
                    fAltVal = String(targetPatient.fechaAlta);
                } else if (targetPatient.fecha_alta) {
                    fAltVal = String(targetPatient.fecha_alta);
                }

                defMap.set(tKey, {
                    numero_admision: targetPatient.numero_admision || targetPatient.id,
                    id_admision: targetPatient.idAdmision,
                    nhc: targetPatient.nhc,
                    paciente: targetPatient.paciente,
                    edad: targetPatient.edad,
                    procedencia: targetPatient.procedencia || 'Derivado desde Urgencias',
                    fecha_ingreso: fIngVal,
                    fecha_alta: fAltVal,
                    cliente: targetPatient.cliente,
                    especialidad: targetPatient.especialidad || 'UCI',
                    habitacion: targetPatient.habitacion,
                    motivo_de_alta: targetPatient.motivoAlta || targetPatient.motivo_de_alta || 'Defunción',
                    horasEstancia,
                    diasEstancia,
                    clasificacion,
                    clasifLabel,
                    clasifColor,
                    clasifBg,
                    esUrgencias: (targetPatient.procedencia || '').toLowerCase().includes('urgencia') || (targetPatient.procedencia || '').toLowerCase().includes('guardia')
                });
            }
        }

        // Ordenar por fecha de alta (defunción) descendente
        return Array.from(defMap.values()).sort((a, b) => {
            const dateA = new Date(a.fecha_alta || a.fecha_ingreso || 0);
            const dateB = new Date(b.fecha_alta || b.fecha_ingreso || 0);
            return dateB - dateA;
        });
    }, [rawData, targetPatient]);

    // Registro consolidado del paciente individual seleccionado
    const currentPatientRecord = useMemo(() => {
        if (!selectedCase) return null;
        const sAdm = selectedCase.numero_admision || selectedCase.idAdmision || selectedCase.id;
        const sNhc = selectedCase.nhc ? String(selectedCase.nhc).trim() : null;

        const match = defunciones.find(d => {
            const dAdm = d.numero_admision || d.id_admision;
            if (sAdm && dAdm && String(sAdm) === String(dAdm)) return true;
            if (sNhc && d.nhc && String(d.nhc).trim() === sNhc) return true;
            return false;
        });

        return match || selectedCase;
    }, [selectedCase, defunciones]);

    const isSinglePatient = Boolean(currentPatientRecord);

    // Trazabilidad de camas / traslados del paciente
    const relatedTransfers = useMemo(() => {
        if (!currentPatientRecord) return [];
        const admId = currentPatientRecord.id_admision || currentPatientRecord.numero_admision || currentPatientRecord.idAdmision || currentPatientRecord.id;
        const nhc = currentPatientRecord.nhc ? String(currentPatientRecord.nhc).trim() : null;

        const matches = (rawData || []).filter(r => {
            const rAdm = r.id_admision || r.numero_admision;
            if (admId && rAdm && String(rAdm) === String(admId)) return true;
            if (nhc && r.nhc && String(r.nhc).trim() === nhc) return true;
            return false;
        });

        const unique = [];
        const seen = new Set();
        matches.forEach(m => {
            const key = `${m.habitacion}_${m.fecha_inicio || m.fecha_ingreso}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(m);
            }
        });

        return unique.sort((a, b) => new Date(a.fecha_inicio || a.fecha_ingreso || 0) - new Date(b.fecha_inicio || b.fecha_ingreso || 0));
    }, [currentPatientRecord, rawData]);

    const singleNhcKey = currentPatientRecord?.nhc ? String(currentPatientRecord.nhc).trim() : null;
    const singleDiags = singleNhcKey ? (diagnosticosMap[singleNhcKey] || []) : [];
    const singlePeticiones = singleNhcKey ? (peticionesMap[singleNhcKey] || []) : [];

    // 2. Cargar Diagnósticos y Peticiones asociadas a los pacientes fallecidos
    useEffect(() => {
        if (!isOpen) return;

        const nhcsSet = new Set(defunciones.map(d => d.nhc).filter(Boolean));
        if (targetPatient?.nhc) nhcsSet.add(targetPatient.nhc);
        if (selectedCase?.nhc) nhcsSet.add(selectedCase.nhc);

        const nhcs = Array.from(nhcsSet);
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

        if (isSinglePatient && currentPatientRecord) {
            // Hoja 1: Ficha Clínica del Caso
            const fIng = currentPatientRecord.fecha_ingreso ? new Date(currentPatientRecord.fecha_ingreso).toLocaleString('es-AR') : '-';
            const fAlt = currentPatientRecord.fecha_alta ? new Date(currentPatientRecord.fecha_alta).toLocaleString('es-AR') : '-';

            const fichaData = [
                { 'Campo': 'Paciente', 'Detalle': currentPatientRecord.paciente || '-' },
                { 'Campo': 'NHC', 'Detalle': currentPatientRecord.nhc || '-' },
                { 'Campo': 'N° Admisión', 'Detalle': currentPatientRecord.numero_admision || currentPatientRecord.idAdmision || '-' },
                { 'Campo': 'Edad', 'Detalle': currentPatientRecord.edad ? `${currentPatientRecord.edad} años` : '-' },
                { 'Campo': 'Financiador / Obra Social', 'Detalle': currentPatientRecord.cliente || 'Particular' },
                { 'Campo': 'Habitación / Box', 'Detalle': currentPatientRecord.habitacion || 'UCI' },
                { 'Campo': 'Procedencia', 'Detalle': currentPatientRecord.procedencia || '-' },
                { 'Campo': 'Fecha y Hora de Ingreso', 'Detalle': fIng },
                { 'Campo': 'Fecha y Hora de Defunción', 'Detalle': fAlt },
                { 'Campo': 'Tiempo en Cuidados Críticos', 'Detalle': currentPatientRecord.horasEstancia !== null ? `${currentPatientRecord.horasEstancia} hs (${currentPatientRecord.diasEstancia} días)` : `${currentPatientRecord.diasEstancia} días` },
                { 'Campo': 'Estratificación Clínica', 'Detalle': currentPatientRecord.clasifLabel || '-' },
                { 'Campo': 'Motivo de Egreso', 'Detalle': currentPatientRecord.motivo_de_alta || 'Defunción' }
            ];
            const wsFicha = XLSX.utils.json_to_sheet(fichaData);
            wsFicha['!cols'] = [{ wch: 30 }, { wch: 50 }];
            XLSX.utils.book_append_sheet(wb, wsFicha, "Ficha_Caso");

            // Hoja 2: Diagnósticos
            const diagData = singleDiags.map(d => ({
                'Formulario': d.formulario || 'Formulario Clínico',
                'Fecha': d.fecha_visita ? new Date(d.fecha_visita).toLocaleDateString('es-AR') : '-',
                'Diagnóstico': d.diagnostico || '-',
                'Motivo': d.motivo || '-'
            }));
            const wsDiag = XLSX.utils.json_to_sheet(diagData.length > 0 ? diagData : [{ 'Aviso': 'Sin diagnósticos codificados en SALUS' }]);
            wsDiag['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 45 }, { wch: 40 }];
            XLSX.utils.book_append_sheet(wb, wsDiag, "Diagnosticos_CIE");

            // Hoja 3: Peticiones
            const petData = singlePeticiones.map(p => ({
                'Fecha': p.fecha_solicitud ? new Date(p.fecha_solicitud).toLocaleString('es-AR') : '-',
                'Estudio / Práctica': p.estudio || '-',
                'Modalidad': p.modalidad || 'Laboratorio',
                'Prioridad': p.prioridad || 'Normal',
                'Solicitante': p.solicitante || '-',
                'Ubicación': p.habitacion || 'UCI'
            }));
            const wsPet = XLSX.utils.json_to_sheet(petData.length > 0 ? petData : [{ 'Aviso': 'Sin peticiones en el período' }]);
            wsPet['!cols'] = [{ wch: 20 }, { wch: 35 }, { wch: 15 }, { wch: 12 }, { wch: 30 }, { wch: 15 }];
            XLSX.utils.book_append_sheet(wb, wsPet, "Estudios_Peticiones");

            // Hoja 4: Historial de Traslados
            const trasladosData = relatedTransfers.map((t, idx) => ({
                'Paso': idx + 1,
                'Habitación / Box': t.habitacion || '-',
                'Fecha Inicio': t.fecha_inicio ? new Date(t.fecha_inicio).toLocaleString('es-AR') : (t.fecha_ingreso ? new Date(t.fecha_ingreso).toLocaleString('es-AR') : '-'),
                'Fecha Fin': t.fecha_fin ? new Date(t.fecha_fin).toLocaleString('es-AR') : (t.fecha_alta ? new Date(t.fecha_alta).toLocaleString('es-AR') : '-'),
                'Motivo Alta / Pase': t.motivo_de_alta || t.motivoAlta || '-'
            }));
            const wsTraslados = XLSX.utils.json_to_sheet(trasladosData.length > 0 ? trasladosData : [{ 'Aviso': 'Sin traslados intermedios registrados' }]);
            wsTraslados['!cols'] = [{ wch: 8 }, { wch: 20 }, { wch: 22 }, { wch: 22 }, { wch: 30 }];
            XLSX.utils.book_append_sheet(wb, wsTraslados, "Historial_Camas");

            const dateStr = new Date().toISOString().split('T')[0];
            XLSX.writeFile(wb, `Auditoria_Caso_${currentPatientRecord.nhc || 'UCI'}_${dateStr}.xlsx`);
            return;
        }

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

    // Exportar caso individual a PDF Clínico Oficial
    const handleExportSinglePatientPDF = async (record) => {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const margin = 14;
        const colW = pageW - margin * 2;

        let logoCircle = null;
        try {
            const logoImg = new Image();
            logoImg.crossOrigin = 'anonymous';
            logoImg.src = '/logosanatorio.png';
            await new Promise((resolve, reject) => {
                logoImg.onload = resolve;
                logoImg.onerror = reject;
            });
            const canvasSize = 200;
            const canvas = document.createElement('canvas');
            canvas.width = canvasSize;
            canvas.height = canvasSize;
            const ctx = canvas.getContext('2d');
            ctx.beginPath();
            ctx.arc(canvasSize / 2, canvasSize / 2, canvasSize / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(logoImg, 0, 0, canvasSize, canvasSize);
            logoCircle = canvas.toDataURL('image/png');
        } catch {
            logoCircle = null;
        }

        // Header oficial #0D3B66
        doc.setFillColor(13, 59, 102);
        doc.rect(0, 0, pageW, 26, 'F');

        const logoX = margin;
        const logoY = 6;
        const logoSize = 14;

        if (logoCircle) {
            doc.setFillColor(255, 255, 255);
            doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 1, 'F');
            doc.addImage(logoCircle, 'PNG', logoX, logoY, logoSize, logoSize);
        }

        doc.setFontSize(13);
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.text('SANATORIO ARGENTINO', margin + 18, 12);

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(191, 219, 254);
        doc.text('AUDITORÍA CLÍNICA DE DEFUNCIÓN · CASO INDIVIDUAL EN CUIDADOS CRÍTICOS', margin + 18, 17);
        doc.text(`Sector: ${sectorLabel}   |   Fecha de Emisión: ${new Date().toLocaleDateString('es-AR')}`, margin + 18, 21.5);

        let y = 32;

        // Ficha del Paciente
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(margin, y, colW, 26, 3, 3, 'F');
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(margin, y, colW, 26, 3, 3, 'S');

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(record.paciente || 'PACIENTE', margin + 6, y + 7.5);

        doc.setFillColor(254, 242, 242);
        doc.roundedRect(margin + colW - 38, y + 3.5, 32, 6, 1.5, 1.5, 'F');
        doc.setFontSize(6.8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(220, 38, 38);
        doc.text('ÓBITO EN UCI', margin + colW - 22, y + 7.7, { align: 'center' });

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.text(`NHC: ${record.nhc || '-'}    |    Admisión: ${record.numero_admision || record.idAdmision || '-'}    |    Edad: ${record.edad ? `${record.edad} años` : '-'}`, margin + 6, y + 14);
        doc.text(`Financiador: ${record.cliente || 'Particular'}    |    Habitación/Box: ${record.habitacion || 'UCI'}    |    Procedencia: ${record.procedencia || '-'}`, margin + 6, y + 20);

        y += 31;

        // Strip de 4 tarjetas temporales
        const cardW = (colW - 9) / 4;
        const cardH = 18;
        const fIng = record.fecha_ingreso ? new Date(record.fecha_ingreso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
        const fAlt = record.fecha_alta ? new Date(record.fecha_alta).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';

        const timeCards = [
            { label: 'INGRESO UCI', val: fIng, sub: record.procedencia ? record.procedencia.substring(0, 20) : 'Ingreso', col: [30, 64, 175] },
            { label: 'FECHA ÓBITO', val: fAlt, sub: record.habitacion || 'UCI', col: [220, 38, 38] },
            { label: 'PERMANENCIA', val: record.horasEstancia !== null ? `${record.horasEstancia} hs` : `${record.diasEstancia} d`, sub: `${record.diasEstancia} días estancia`, col: [217, 119, 6] },
            { label: 'ESTRATIFICACIÓN', val: record.clasifLabel ? record.clasifLabel.split('(')[0].trim() : 'Evolutiva', sub: record.clasificacion === 'ultra_precoz' ? '< 24 hs Agónico' : record.clasificacion === 'precoz' ? '< 48 hs Precoz' : '> 48 hs Evolutiva', col: [15, 23, 42] }
        ];

        timeCards.forEach((tc, idx) => {
            const tX = margin + idx * (cardW + 3);
            doc.setFillColor(248, 250, 252);
            doc.roundedRect(tX, y, cardW, cardH, 2, 2, 'F');
            doc.setDrawColor(226, 232, 240);
            doc.roundedRect(tX, y, cardW, cardH, 2, 2, 'S');

            doc.setFontSize(6.2);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...tc.col);
            doc.text(tc.label, tX + 4, y + 4.5);

            doc.setFontSize(8.2);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text(tc.val, tX + 4, y + 10.5);

            doc.setFontSize(6);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 116, 139);
            doc.text(tc.sub.substring(0, 24), tX + 4, y + 15);
        });

        y += cardH + 7;

        // Sección 1: Diagnósticos
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(13, 59, 102);
        doc.text('1. Diagnósticos Nosológicos y Motivos al Ingreso (SALUS / CIE)', margin, y);
        y += 3;

        const diagRows = singleDiags.map(d => [
            d.formulario || 'Formulario Clínico',
            d.fecha_visita ? new Date(d.fecha_visita).toLocaleDateString('es-AR') : '-',
            d.diagnostico || 'Sin codificación',
            d.motivo || '-'
        ]);

        if (diagRows.length === 0) {
            diagRows.push(['Admisión UCI', '-', 'Sin codificación CIE formal en SALUS para este paciente', 'Cuadro clínico asistido en cuidados críticos']);
        }

        autoTable(doc, {
            startY: y,
            head: [['Formulario Clínico', 'Fecha', 'Diagnóstico Codificado', 'Motivo Clínico Registrado']],
            body: diagRows,
            styles: { fontSize: 7, cellPadding: 2.2 },
            headStyles: { fillColor: [13, 59, 102], textColor: 255, fontStyle: 'bold', fontSize: 7.2 },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            margin: { left: margin, right: margin }
        });

        y = doc.lastAutoTable.finalY + 7;

        // Sección 2: Estudios Complementarios
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(13, 59, 102);
        doc.text(`2. Estudios y Prácticas Complementarias Solicitadas (${singlePeticiones.length})`, margin, y);
        y += 3;

        const petRows = singlePeticiones.slice(0, 12).map(p => [
            p.fecha_solicitud ? new Date(p.fecha_solicitud).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-',
            p.estudio || '-',
            p.modalidad || 'Laboratorio',
            p.prioridad || 'Normal',
            p.solicitante || '-'
        ]);

        if (petRows.length === 0) {
            petRows.push(['-', 'Sin peticiones complementarias registradas en este período', '-', '-', '-']);
        }

        autoTable(doc, {
            startY: y,
            head: [['Fecha y Hora', 'Estudio Solicitado', 'Modalidad', 'Prioridad', 'Médico / Solicitante']],
            body: petRows,
            styles: { fontSize: 7, cellPadding: 2.2 },
            headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', fontSize: 7.2 },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            margin: { left: margin, right: margin }
        });

        y = doc.lastAutoTable.finalY + 7;

        // Sección 3: Dictamen de Auditoría Médica
        if (y + 35 > pageH - 15) {
            doc.addPage();
            y = 20;
        }

        doc.setFillColor(248, 250, 252);
        doc.roundedRect(margin, y, colW, 25, 2.5, 2.5, 'F');
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(margin, y, colW, 25, 2.5, 2.5, 'S');

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('Dictamen de Auditoría Médica y Juicio de Imputabilidad:', margin + 4, y + 6);

        doc.setFontSize(7.2);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        const conclusionText = record.horasEstancia !== null && record.horasEstancia < 48
            ? `Paciente con estancia crítica inferior a 48 hs (${record.horasEstancia} hs), tipificada como Mortalidad Precoz al Ingreso. Indicador centinela de extrema gravedad basal y refractariedad a medidas inmediatas de reanimación. No atribuible a fallo de proceso intra-UCI.`
            : `Paciente con estancia en cuidados críticos de ${record.diasEstancia} días (${record.horasEstancia !== null ? `${record.horasEstancia} hs` : ''}), tipificada como Mortalidad Evolutiva. Refleja la severidad intrínseca de la patología de base y fallo multiorgánico progresivo a pesar del soporte intensivo instaurado.`;
        
        const splitConclusion = doc.splitTextToSize(conclusionText, colW - 8);
        doc.text(splitConclusion, margin + 4, y + 12);

        // Footers institucionales
        const totalPages = doc.internal.getNumberOfPages();
        for (let p = 1; p <= totalPages; p++) {
            doc.setPage(p);
            doc.setDrawColor(226, 232, 240);
            doc.line(margin, pageH - 9, pageW - margin, pageH - 9);
            doc.setFontSize(6.5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(148, 163, 184);
            doc.text('Sanatorio Argentino SRL · Auditoría Médica de Cuidados Críticos · Sistema ADM-QUI', margin, pageH - 5);
            doc.text(`Página ${p} de ${totalPages} · Documento Confidencial Reservado`, pageW - margin, pageH - 5, { align: 'right' });
        }

        const dateStr = new Date().toISOString().split('T')[0];
        doc.save(`Auditoria_Defuncion_${record.nhc || 'UCI'}_${dateStr}.pdf`);
    };

    // 6. Exportar a PDF Institucional (Estilo Asociaciones con Logo, KPIs, Gráficos y Tabla)
    const handleExportPDF = async () => {
        if (isSinglePatient && currentPatientRecord) {
            await handleExportSinglePatientPDF(currentPatientRecord);
            return;
        }

        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const margin = 14;
        const colW = pageW - margin * 2;

        // A. Cargar logo circular
        let logoCircle = null;
        try {
            const logoImg = new Image();
            logoImg.crossOrigin = 'anonymous';
            logoImg.src = '/logosanatorio.png';
            await new Promise((resolve, reject) => {
                logoImg.onload = resolve;
                logoImg.onerror = reject;
            });
            const canvasSize = 200;
            const canvas = document.createElement('canvas');
            canvas.width = canvasSize;
            canvas.height = canvasSize;
            const ctx = canvas.getContext('2d');
            ctx.beginPath();
            ctx.arc(canvasSize / 2, canvasSize / 2, canvasSize / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(logoImg, 0, 0, canvasSize, canvasSize);
            logoCircle = canvas.toDataURL('image/png');
        } catch {
            logoCircle = null;
        }

        // B. Función interna para dibujar el Header oficial de Asociaciones
        const drawHeader = (titleRight, subtitleRight) => {
            // Barra Azul Institucional (#0D3B66)
            doc.setFillColor(13, 59, 102);
            doc.rect(0, 0, pageW, 28, 'F');

            // Logo Circular con anillo blanco
            const logoX = margin + 1;
            const logoY = 7;
            const logoSize = 14;

            if (logoCircle) {
                doc.setFillColor(255, 255, 255);
                doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 1.2, 'F');
                doc.addImage(logoCircle, 'PNG', logoX, logoY, logoSize, logoSize);
            } else {
                doc.setFillColor(255, 255, 255);
                doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 'F');
                doc.setFontSize(6.5);
                doc.setTextColor(13, 59, 102);
                doc.text('SA', logoX + 3.5, logoY + logoSize / 2 + 1.5);
            }

            // Título Izquierdo
            doc.setFontSize(14);
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.text('SANATORIO ARGENTINO', margin + 18, 12.5);

            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(191, 219, 254);
            doc.text('Gobernanza Clínica & Auditoría Médica · Cuidados Críticos (UCI)', margin + 18, 18.5);

            // Badge Derecho
            doc.setFontSize(10.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(255, 255, 255);
            doc.text(titleRight, pageW - margin, 12.5, { align: 'right' });

            doc.setFontSize(7.8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(191, 219, 254);
            doc.text(subtitleRight, pageW - margin, 18.5, { align: 'right' });

            // Línea de Acento (#3B82F6)
            doc.setFillColor(59, 130, 246);
            doc.rect(0, 28, pageW, 2, 'F');
        };

        // ══════════════════════════════════════════
        // PÁGINA 1: DASHBOARD EJECUTIVO Y GRÁFICOS
        // ══════════════════════════════════════════
        const fDesdeStr = dateFilter?.fechaDesde || '2026-01-01';
        const fHastaStr = dateFilter?.fechaHasta || 'Actualidad';
        drawHeader('AUDITORÍA CLÍNICA DE MORTALIDAD', `Período: ${fDesdeStr} al ${fHastaStr}`);

        let y = 35;

        // 1. INFO BAR / 5 KPI SCORECARDS (Estilo Asociaciones)
        const kpiBoxW = (colW - 16) / 5;
        const kpiBoxH = 17;
        const kpis = [
            { label: 'DEFUNCIONES TOTALES', val: `${metrics.total}`, sub: `Tasa cruda: ${metrics.porcDefuncion}%`, color: [220, 38, 38], bg: [254, 242, 242] },
            { label: 'PRECOZ (< 48 HS)', val: `${metrics.totalPrecoz48h} (${metrics.porcTotalPrecoz48h}%)`, sub: 'Ingreso crítico irreversible', color: [217, 119, 6], bg: [255, 251, 235] },
            { label: 'ULTRA-PRECOZ (< 24 HS)', val: `${metrics.ultraPrecoz} (${metrics.porcUltraPrecoz}%)`, sub: 'Reanimación sin respuesta', color: [239, 68, 68], bg: [255, 255, 255] },
            { label: 'PUERTA URGENCIAS', val: `${metrics.urgenciasCount} (${metrics.porcUrgencias}%)`, sub: 'Canal de guardia hiperagudo', color: [37, 99, 235], bg: [239, 246, 255] },
            { label: 'EVOLUTIVA (> 48 HS)', val: `${metrics.evolutiva} (${metrics.porcEvolutiva}%)`, sub: `Edad media: ${metrics.edadPromedio} años`, color: [71, 85, 105], bg: [248, 250, 252] }
        ];

        kpis.forEach((kpi, idx) => {
            const bx = margin + idx * (kpiBoxW + 4);
            doc.setFillColor(...kpi.bg);
            doc.roundedRect(bx, y, kpiBoxW, kpiBoxH, 2.5, 2.5, 'F');
            doc.setDrawColor(226, 232, 240);
            doc.roundedRect(bx, y, kpiBoxW, kpiBoxH, 2.5, 2.5, 'S');

            doc.setFontSize(6.2);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...kpi.color);
            doc.text(kpi.label, bx + 4, y + 4.5);

            doc.setFontSize(10.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...kpi.color);
            doc.text(kpi.val, bx + 4, y + 10.5);

            doc.setFontSize(6);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 116, 139);
            doc.text(kpi.sub, bx + 4, y + 14.5);
        });

        y += kpiBoxH + 7;

        // 2. TÍTULO DE SECCIÓN GRÁFICA
        doc.setFillColor(13, 59, 102);
        doc.rect(margin, y, 3, 7, 'F');
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(13, 59, 102);
        doc.text('ANÁLISIS GRÁFICO DE CAUSALIDAD Y PERMANENCIA AL ÓBITO', margin + 6, y + 5.2);

        y += 10;

        // 3. DOS TARJETAS GRÁFICAS PARALELAS (Gráficos Vectoriales Proporcionales)
        const cardW = (colW - 8) / 2;
        const cardH = 68;

        // ── GRÁFICO 1: DISTRIBUCIÓN POR TIEMPO HASTA EL ÓBITO ──
        const g1X = margin;
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(g1X, y, cardW, cardH, 3, 3, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(g1X, y, cardW, cardH, 3, 3, 'S');

        // Header Card 1
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(g1X, y, cardW, 11, 3, 3, 'F');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('1. Estratificación Temporal (Precoz vs Evolutiva)', g1X + 6, y + 5.5);
        doc.setFontSize(6.2);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text('Proxy APACHE II: Separa ingresos agónicos fútiles de complicaciones intra-UCI', g1X + 6, y + 9);

        // Barras temporales
        const totalDef = Math.max(1, metrics.total);
        let stayOver7d = 0;
        let stay3to7d = 0;
        defunciones.forEach(d => {
            if (d.diasEstancia > 7) stayOver7d++;
            else if (d.horasEstancia !== null && d.horasEstancia > 48) stay3to7d++;
        });

        const timeBars = [
            { label: '< 24 hs (Ultra-Precoz / Cuadro Agónico)', count: metrics.ultraPrecoz, color: [220, 38, 38], tag: 'Irreversible' },
            { label: '24 a 48 hs (Precoz / Falla Precoz)', count: metrics.precoz, color: [217, 119, 6], tag: 'Crítico al ingreso' },
            { label: '3 a 7 días (Estancia Intermedia)', count: stay3to7d, color: [37, 99, 235], tag: 'Evolución intra-UCI' },
            { label: '> 7 días (Estancia Prolongada / Multiorgánica)', count: stayOver7d, color: [71, 85, 105], tag: 'Complicaciones' }
        ];

        let bY = y + 16;
        const maxBarTrackW = cardW - 65;

        timeBars.forEach(b => {
            const pctVal = ((b.count / totalDef) * 100).toFixed(1);
            const barFillW = Math.max(2, (b.count / totalDef) * maxBarTrackW);

            doc.setFontSize(6.8);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 41, 59);
            doc.text(b.label, g1X + 6, bY + 3.2);

            // Barra de fondo gris
            doc.setFillColor(241, 245, 249);
            doc.roundedRect(g1X + 6, bY + 4.5, maxBarTrackW, 4, 1.5, 1.5, 'F');

            // Barra rellena proporcional
            doc.setFillColor(...b.color);
            doc.roundedRect(g1X + 6, bY + 4.5, barFillW, 4, 1.5, 1.5, 'F');

            // Valor y porcentaje a la derecha
            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...b.color);
            doc.text(`${b.count} (${pctVal}%)`, g1X + 10 + maxBarTrackW, bY + 8);

            bY += 12;
        });

        // ── GRÁFICO 2: PUERTA DE ENTRADA Y PROCEDENCIA ──
        const g2X = margin + cardW + 8;
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(g2X, y, cardW, cardH, 3, 3, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(g2X, y, cardW, cardH, 3, 3, 'S');

        // Header Card 2
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(g2X, y, cardW, 11, 3, 3, 'F');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('2. Procedencia de Ingreso & Vía de Entrada', g2X + 6, y + 5.5);
        doc.setFontSize(6.2);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text('Identifica el canal por donde arribaron los pacientes más graves', g2X + 6, y + 9);

        // Conteo de procedencias dinámico
        const procCounts = {};
        defunciones.forEach(d => {
            const p = d.procedencia || 'Sin dato';
            procCounts[p] = (procCounts[p] || 0) + 1;
        });
        const sortedProc = Object.entries(procCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4);

        let pY = y + 16;
        const procColors = [
            [13, 59, 102], // Navy
            [2, 132, 199], // Sky
            [124, 58, 237], // Purple
            [5, 150, 105]   // Green
        ];

        sortedProc.forEach(([procName, pCount], pIdx) => {
            const pctVal = ((pCount / totalDef) * 100).toFixed(1);
            const barFillW = Math.max(2, (pCount / totalDef) * maxBarTrackW);
            const pCol = procColors[pIdx % procColors.length];

            doc.setFontSize(6.8);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 41, 59);
            const cleanProcName = procName.length > 38 ? procName.substring(0, 38) + '...' : procName;
            doc.text(cleanProcName, g2X + 6, pY + 3.2);

            // Barra de fondo gris
            doc.setFillColor(241, 245, 249);
            doc.roundedRect(g2X + 6, pY + 4.5, maxBarTrackW, 4, 1.5, 1.5, 'F');

            // Barra rellena proporcional
            doc.setFillColor(...pCol);
            doc.roundedRect(g2X + 6, pY + 4.5, barFillW, 4, 1.5, 1.5, 'F');

            // Valor y porcentaje a la derecha
            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...pCol);
            doc.text(`${pCount} (${pctVal}%)`, g2X + 10 + maxBarTrackW, pY + 8);

            pY += 12;
        });

        y += cardH + 7;

        // 4. BLOQUE INFERIOR: CLUSTER DE DIAGNÓSTICOS PREVALENTES
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(margin, y, colW, 42, 3, 3, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(margin, y, colW, 42, 3, 3, 'S');

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(13, 59, 102);
        doc.text('3. Cuadros Nosológicos y Diagnósticos Críticos Prevalentes al Ingreso (CIE-9 / SALUS)', margin + 6, y + 6);

        // Obtener top diagnósticos
        const diagFreq = {};
        Object.values(diagnosticosMap).forEach(list => {
            list.forEach(d => {
                if (d.diagnostico) {
                    const c = d.diagnostico.trim();
                    diagFreq[c] = (diagFreq[c] || 0) + 1;
                }
            });
        });
        const topDiags = Object.entries(diagFreq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6);

        let dX = margin + 6;
        let dY = y + 12;
        const pillW = (colW - 20) / 2;

        if (topDiags.length === 0) {
            doc.setFontSize(7);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(100, 116, 139);
            doc.text('Consultando diagnósticos codificados en SALUS...', margin + 6, y + 16);
        } else {
            topDiags.forEach(([diagName, cnt], idx) => {
                const posX = idx % 2 === 0 ? margin + 6 : margin + 10 + pillW;
                const posY = y + 12 + Math.floor(idx / 2) * 9;

                doc.setFillColor(255, 255, 255);
                doc.roundedRect(posX, posY, pillW, 7, 1.5, 1.5, 'F');
                doc.setDrawColor(203, 213, 225);
                doc.roundedRect(posX, posY, pillW, 7, 1.5, 1.5, 'S');

                doc.setFontSize(6.8);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(15, 23, 42);
                const shortDiag = diagName.length > 55 ? diagName.substring(0, 55) + '...' : diagName;
                doc.text(shortDiag, posX + 3, posY + 4.8);

                doc.setFontSize(6.5);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(37, 99, 235);
                doc.text(`${cnt} caso${cnt > 1 ? 's' : ''}`, posX + pillW - 14, posY + 4.8, { align: 'right' });
            });
        }

        // ══════════════════════════════════════════
        // PÁGINA 2: LISTADO NOMINAL DETALLADO
        // ══════════════════════════════════════════
        doc.addPage();
        drawHeader('LISTADO NOMINAL DE PACIENTES AUDITADOS', `Total Casos: ${filteredRows.length} | Sector: ${sectorLabel}`);

        const tableBody = filteredRows.map(r => {
            const nhcKey = String(r.nhc).trim();
            const diags = (diagnosticosMap[nhcKey] || []).map(d => d.diagnostico).filter(Boolean);
            const pets = (peticionesMap[nhcKey] || []).map(p => p.estudio).filter(Boolean);

            const fIng = r.fecha_ingreso ? new Date(r.fecha_ingreso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
            const fAlt = r.fecha_alta ? new Date(r.fecha_alta).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
            const tiempo = r.horasEstancia !== null ? `${r.horasEstancia} hs (${r.diasEstancia} d)` : `${r.diasEstancia} días`;

            const diagStr = diags.slice(0, 2).join('\n') || 'Sin codificación CIE';
            const petStr = pets.length > 0 ? `${pets.slice(0, 2).join('\n')}${pets.length > 2 ? `\n(+${pets.length - 2} más)` : ''}` : 'Sin estudios';

            return [
                r.nhc || '-',
                r.paciente || '-',
                r.edad ? `${r.edad} a` : '-',
                r.procedencia || '-',
                `${fIng}\n${fAlt}`,
                tiempo,
                r.clasifLabel.split('(')[0].trim(),
                diagStr,
                petStr
            ];
        });

        autoTable(doc, {
            startY: 34,
            head: [['NHC', 'Paciente', 'Edad', 'Procedencia', 'Ingreso / Defunción', 'Permanencia', 'Estratificación', 'Diagnósticos de Ingreso', 'Estudios Realizados']],
            body: tableBody,
            styles: { fontSize: 6.8, cellPadding: 2.2, overflow: 'linebreak' },
            headStyles: { fillColor: [13, 59, 102], textColor: 255, fontStyle: 'bold', fontSize: 7.2 },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
                0: { cellWidth: 14 },
                1: { cellWidth: 42, fontStyle: 'bold' },
                2: { cellWidth: 11 },
                3: { cellWidth: 32 },
                4: { cellWidth: 30 },
                5: { cellWidth: 20 },
                6: { cellWidth: 30 },
                7: { cellWidth: 50 },
                8: { cellWidth: 40 }
            }
        });

        // ══════════════════════════════════════════
        // FOOTERS INSTITUCIONALES EN TODAS LAS PÁGINAS
        // ══════════════════════════════════════════
        const totalPages = doc.internal.getNumberOfPages();
        for (let p = 1; p <= totalPages; p++) {
            doc.setPage(p);
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.3);
            doc.line(margin, pageH - 9, pageW - margin, pageH - 9);

            doc.setFontSize(6.5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(148, 163, 184);
            doc.text('Sanatorio Argentino SRL · Dirección Médica & Auditoría UCI · Sistema ADM-QUI', margin, pageH - 5);
            doc.text(`Página ${p} de ${totalPages} · Documento Oficial Reservado`, pageW - margin, pageH - 5, { align: 'right' });
        }

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
                    padding: '16px 24px',
                    borderBottom: '1px solid #E2E8F0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#F8FAFC'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '40px', height: '40px', borderRadius: '10px',
                            background: isSinglePatient ? '#EFF6FF' : '#FEE2E2',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: isSinglePatient ? '#1D4ED8' : '#DC2626'
                        }}>
                            {isSinglePatient ? <User size={22} /> : <ShieldAlert size={22} />}
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0F172A' }}>
                                    {isSinglePatient ? 'Auditoría Clínica de Defunción — Caso Individual' : 'Auditoría Clínica de Mortalidad y Motivos de Defunción'}
                                </h3>
                                <span style={{
                                    fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '12px',
                                    background: '#1E40AF', color: '#FFFFFF'
                                }}>
                                    {sectorLabel}
                                </span>
                            </div>
                            <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                                {isSinglePatient 
                                    ? 'Expediente nosológico, cronología crítica, trazabilidad de estudios y criterio de imputabilidad clínica'
                                    : 'Estratificación precoz vs evolutiva, cruce nosológico al ingreso y trazabilidad de estudios complementarios'}
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {isSinglePatient && defunciones.length > 1 && (
                            <button
                                onClick={() => setSelectedCase(null)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '7px 12px', borderRadius: '8px',
                                    border: '1px solid #CBD5E1', background: '#FFFFFF',
                                    color: '#1E293B', fontSize: '0.78rem', fontWeight: 600,
                                    cursor: 'pointer', transition: 'all 0.15s'
                                }}
                                title="Volver a la vista colectiva con todas las defunciones"
                            >
                                <ArrowLeft size={14} />
                                Ver todas las defunciones ({defunciones.length})
                            </button>
                        )}

                        <button
                            onClick={handleExportExcel}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '7px 14px', borderRadius: '8px',
                                border: '1px solid #10B981', background: '#ECFDF5',
                                color: '#047857', fontSize: '0.8rem', fontWeight: 600,
                                cursor: 'pointer', transition: 'all 0.15s'
                            }}
                            title={isSinglePatient ? "Descargar dossier del paciente en Excel" : "Descargar auditoría completa en Excel"}
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
                            title={isSinglePatient ? "Descargar dossier del paciente en PDF" : "Descargar reporte en PDF institucional"}
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

                {/* ─── CUERPO PRINCIPAL DEL MODAL ─── */}
                {isSinglePatient && currentPatientRecord ? (
                    /* ═══════════════════════════════════════════════════════════ */
                    /* MODO PACIENTE INDIVIDUAL: DOSSIER CLÍNICO PROFUNDO (SIN KPIS) */
                    /* ═══════════════════════════════════════════════════════════ */
                    <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {/* 1. Tarjeta Principal del Paciente */}
                        <div style={{
                            background: '#FFFFFF',
                            border: '1px solid #E2E8F0',
                            borderRadius: '12px',
                            padding: '16px 20px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '12px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                <div style={{
                                    width: '46px', height: '46px', borderRadius: '50%',
                                    background: '#EFF6FF', border: '2px solid #BFDBFE',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#1D4ED8'
                                }}>
                                    <User size={24} />
                                </div>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>
                                            {currentPatientRecord.paciente || 'PACIENTE'}
                                        </h2>
                                        <span style={{
                                            fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: '8px',
                                            background: currentPatientRecord.clasifBg, color: currentPatientRecord.clasifColor,
                                            border: `1px solid ${currentPatientRecord.clasifColor}40`
                                        }}>
                                            {currentPatientRecord.clasifLabel}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                                        <span style={{ fontSize: '0.75rem', color: '#475569', background: '#F1F5F9', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                                            NHC: <strong style={{ color: '#0F172A' }}>{currentPatientRecord.nhc || '-'}</strong>
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: '#475569', background: '#F1F5F9', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                                            Admisión: <strong style={{ color: '#0F172A' }}>{currentPatientRecord.numero_admision || currentPatientRecord.idAdmision || currentPatientRecord.id || '-'}</strong>
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: '#475569', background: '#F1F5F9', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                                            Financiador: <strong style={{ color: '#0F172A' }}>{currentPatientRecord.cliente || 'Particular'}</strong>
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: '#475569', background: '#F1F5F9', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                                            Box/Cama: <strong style={{ color: '#0F172A' }}>{currentPatientRecord.habitacion || 'UCI'}</strong>
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: '#475569', background: '#F1F5F9', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                                            Edad: <strong style={{ color: '#0F172A' }}>{currentPatientRecord.edad ? `${currentPatientRecord.edad} años` : '-'}</strong>
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 2. Cronología y Tiempos Críticos del Caso */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(4, 1fr)',
                            gap: '12px'
                        }}>
                            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1E40AF', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>
                                    <Calendar size={14} /> Fecha y Hora Ingreso
                                </div>
                                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', marginTop: '6px' }}>
                                    {currentPatientRecord.fecha_ingreso ? new Date(currentPatientRecord.fecha_ingreso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                </div>
                                <div style={{ fontSize: '0.73rem', color: '#64748B', marginTop: '3px' }}>
                                    Vía: <strong style={{ color: '#334155' }}>{currentPatientRecord.procedencia || 'Derivado'}</strong>
                                </div>
                            </div>

                            <div style={{ background: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: '10px', padding: '12px 14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#DC2626', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>
                                    <ShieldAlert size={14} /> Fecha y Hora Defunción
                                </div>
                                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#DC2626', marginTop: '6px' }}>
                                    {currentPatientRecord.fecha_alta ? new Date(currentPatientRecord.fecha_alta).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                </div>
                                <div style={{ fontSize: '0.73rem', color: '#991B1B', marginTop: '3px' }}>
                                    Egreso: <strong>{currentPatientRecord.motivo_de_alta || 'Defunción'}</strong>
                                </div>
                            </div>

                            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#475569', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>
                                    <Clock size={14} /> Tiempo en Cuidados Críticos
                                </div>
                                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: currentPatientRecord.clasifColor, marginTop: '4px' }}>
                                    {currentPatientRecord.horasEstancia !== null ? `${currentPatientRecord.horasEstancia} hs` : `${currentPatientRecord.diasEstancia} d`}
                                </div>
                                <div style={{ fontSize: '0.73rem', color: '#64748B', marginTop: '2px' }}>
                                    Permanencia: <strong>{currentPatientRecord.diasEstancia} día{currentPatientRecord.diasEstancia > 1 ? 's' : ''}</strong>
                                </div>
                            </div>

                            <div style={{ background: currentPatientRecord.clasifBg, border: `1px solid ${currentPatientRecord.clasifColor}40`, borderRadius: '10px', padding: '12px 14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: currentPatientRecord.clasifColor, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>
                                    <Activity size={14} /> Estratificación Basal
                                </div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: currentPatientRecord.clasifColor, marginTop: '6px' }}>
                                    {currentPatientRecord.clasifLabel}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: currentPatientRecord.clasifColor, marginTop: '3px' }}>
                                    {currentPatientRecord.horasEstancia !== null && currentPatientRecord.horasEstancia <= 48 ? 'Mortalidad Precoz (Proxy APACHE II)' : 'Mortalidad Evolutiva Intra-UCI'}
                                </div>
                            </div>
                        </div>

                        {/* 3. Pestañas de Navegación del Dossier */}
                        <div style={{
                            background: '#FFFFFF',
                            border: '1px solid #E2E8F0',
                            borderRadius: '12px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '10px 16px',
                                borderBottom: '1px solid #E2E8F0',
                                background: '#F8FAFC'
                            }}>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={() => setActiveSubTab('diagnosticos')}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                            padding: '8px 14px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 700,
                                            border: 'none', cursor: 'pointer',
                                            background: activeSubTab === 'diagnosticos' ? '#1E40AF' : 'transparent',
                                            color: activeSubTab === 'diagnosticos' ? '#FFFFFF' : '#475569'
                                        }}
                                    >
                                        <Stethoscope size={15} />
                                        Diagnósticos y Motivos ({singleDiags.length})
                                    </button>

                                    <button
                                        onClick={() => setActiveSubTab('peticiones')}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                            padding: '8px 14px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 700,
                                            border: 'none', cursor: 'pointer',
                                            background: activeSubTab === 'peticiones' ? '#1E40AF' : 'transparent',
                                            color: activeSubTab === 'peticiones' ? '#FFFFFF' : '#475569'
                                        }}
                                    >
                                        <FlaskConical size={15} />
                                        Estudios y Peticiones ({singlePeticiones.length})
                                    </button>

                                    <button
                                        onClick={() => setActiveSubTab('traslados')}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                            padding: '8px 14px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 700,
                                            border: 'none', cursor: 'pointer',
                                            background: activeSubTab === 'traslados' ? '#1E40AF' : 'transparent',
                                            color: activeSubTab === 'traslados' ? '#FFFFFF' : '#475569'
                                        }}
                                    >
                                        <Bed size={15} />
                                        Trazabilidad de Cama ({relatedTransfers.length})
                                    </button>

                                    <button
                                        onClick={() => setActiveSubTab('criterio')}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                            padding: '8px 14px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 700,
                                            border: 'none', cursor: 'pointer',
                                            background: activeSubTab === 'criterio' ? '#1E40AF' : 'transparent',
                                            color: activeSubTab === 'criterio' ? '#FFFFFF' : '#475569'
                                        }}
                                    >
                                        <FileCheck size={15} />
                                        Dictamen de Auditoría
                                    </button>
                                </div>

                                {loadingClinical && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.73rem', color: '#166534', background: '#F0FDF4', padding: '4px 10px', borderRadius: '6px' }}>
                                        <Activity size={13} className="animate-spin" />
                                        Sincronizando con SALUS...
                                    </div>
                                )}
                            </div>

                            {/* Contenido de la pestaña */}
                            <div style={{ padding: '20px' }}>
                                {/* SUBTAB 1: DIAGNÓSTICOS */}
                                {activeSubTab === 'diagnosticos' && (
                                    <div>
                                        {singleDiags.length === 0 ? (
                                            <div style={{ padding: '32px', textAlign: 'center', color: '#64748B', background: '#F8FAFC', borderRadius: '8px', border: '1px dashed #CBD5E1' }}>
                                                <Stethoscope size={32} style={{ margin: '0 auto 8px auto', opacity: 0.4 }} />
                                                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.88rem' }}>Sin diagnósticos codificados en SALUS</p>
                                                <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem' }}>No se encontraron registros de formularios clínicos con CIE-10 para el NHC {currentPatientRecord.nhc} en este período.</p>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '14px' }}>
                                                {singleDiags.map((d, i) => (
                                                    <div key={i} style={{
                                                        background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px',
                                                        padding: '14px 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                                                    }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px', marginBottom: '8px' }}>
                                                            <span style={{ fontSize: '0.7rem', color: '#1E40AF', fontWeight: 700, background: '#EFF6FF', padding: '2px 8px', borderRadius: '6px' }}>
                                                                {d.formulario || 'Formulario Clínico'}
                                                            </span>
                                                            <span style={{ fontSize: '0.73rem', color: '#64748B' }}>
                                                                {d.fecha_visita ? new Date(d.fecha_visita).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}
                                                            </span>
                                                        </div>
                                                        <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0F172A', lineHeight: '1.35' }}>
                                                            {d.diagnostico}
                                                        </div>
                                                        {d.motivo && (
                                                            <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '8px', background: '#FFFFFF', padding: '8px 10px', borderRadius: '6px', border: '1px solid #F1F5F9', fontStyle: 'italic' }}>
                                                                "{d.motivo}"
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* SUBTAB 2: ESTUDIOS Y PETICIONES */}
                                {activeSubTab === 'peticiones' && (
                                    <div>
                                        {singlePeticiones.length === 0 ? (
                                            <div style={{ padding: '32px', textAlign: 'center', color: '#64748B', background: '#F8FAFC', borderRadius: '8px', border: '1px dashed #CBD5E1' }}>
                                                <FlaskConical size={32} style={{ margin: '0 auto 8px auto', opacity: 0.4 }} />
                                                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.88rem' }}>Sin estudios o peticiones registradas</p>
                                                <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem' }}>No se encontraron órdenes de laboratorio o imágenes emitidas para el NHC {currentPatientRecord.nhc} en este rango.</p>
                                            </div>
                                        ) : (
                                            <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                                    <thead>
                                                        <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#475569', textAlign: 'left' }}>
                                                            <th style={{ padding: '8px 12px' }}>Fecha y Hora Solicitud</th>
                                                            <th style={{ padding: '8px 12px' }}>Estudio / Práctica</th>
                                                            <th style={{ padding: '8px 12px' }}>Modalidad</th>
                                                            <th style={{ padding: '8px 12px' }}>Médico Solicitante</th>
                                                            <th style={{ padding: '8px 12px' }}>Ubicación</th>
                                                            <th style={{ padding: '8px 12px' }}>Prioridad</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {singlePeticiones.map((p, pi) => (
                                                            <tr key={pi} style={{ borderBottom: '1px solid #F1F5F9', background: pi % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}>
                                                                <td style={{ padding: '8px 12px', color: '#334155' }}>
                                                                    {p.fecha_solicitud ? new Date(p.fecha_solicitud).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                                                </td>
                                                                <td style={{ padding: '8px 12px', fontWeight: 600, color: '#0F172A' }}>
                                                                    {p.estudio}
                                                                </td>
                                                                <td style={{ padding: '8px 12px' }}>
                                                                    <span style={{
                                                                        fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', fontWeight: 600,
                                                                        background: p.modalidad === 'Imágenes' ? '#FEF3C7' : '#EFF6FF',
                                                                        color: p.modalidad === 'Imágenes' ? '#92400E' : '#1E40AF'
                                                                    }}>
                                                                        {p.modalidad || 'Laboratorio'}
                                                                    </span>
                                                                </td>
                                                                <td style={{ padding: '8px 12px', color: '#475569' }}>
                                                                    {p.solicitante || '-'}
                                                                </td>
                                                                <td style={{ padding: '8px 12px', color: '#64748B' }}>
                                                                    {p.habitacion || currentPatientRecord.habitacion || 'UCI'}
                                                                </td>
                                                                <td style={{ padding: '8px 12px' }}>
                                                                    <span style={{
                                                                        fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', fontWeight: 700,
                                                                        background: p.prioridad === 'Urgente' ? '#FEE2E2' : '#F1F5F9',
                                                                        color: p.prioridad === 'Urgente' ? '#DC2626' : '#64748B'
                                                                    }}>
                                                                        {p.prioridad || 'Normal'}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* SUBTAB 3: TRAZABILIDAD DE CAMAS */}
                                {activeSubTab === 'traslados' && (
                                    <div>
                                        {relatedTransfers.length === 0 ? (
                                            <div style={{ padding: '32px', textAlign: 'center', color: '#64748B', background: '#F8FAFC', borderRadius: '8px', border: '1px dashed #CBD5E1' }}>
                                                <Bed size={32} style={{ margin: '0 auto 8px auto', opacity: 0.4 }} />
                                                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.88rem' }}>Sin historial de traslados registrado</p>
                                                <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem' }}>El paciente permaneció en su ubicación asignada: {currentPatientRecord.habitacion || 'UCI'}.</p>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                {relatedTransfers.map((t, ti) => {
                                                    const tInicio = t.fecha_inicio || t.fecha_ingreso ? new Date(t.fecha_inicio || t.fecha_ingreso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
                                                    const tFin = t.fecha_fin || t.fecha_alta ? new Date(t.fecha_fin || t.fecha_alta).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Activo / Egreso';
                                                    return (
                                                        <div key={ti} style={{
                                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                            padding: '12px 16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px'
                                                        }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                <div style={{
                                                                    width: '32px', height: '32px', borderRadius: '8px',
                                                                    background: '#EFF6FF', color: '#1E40AF',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.78rem'
                                                                }}>
                                                                    #{ti + 1}
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.85rem' }}>
                                                                        {t.habitacion || 'UCI'}
                                                                    </div>
                                                                    <div style={{ fontSize: '0.73rem', color: '#64748B' }}>
                                                                        Especialidad / Sector: <strong>{t.especialidad || 'UCI'}</strong>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#334155' }}>
                                                                <div>Desde: <strong>{tInicio}</strong></div>
                                                                <div style={{ color: tFin.includes('Egreso') ? '#DC2626' : '#64748B' }}>Hasta: <strong>{tFin}</strong></div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* SUBTAB 4: DICTAMEN DE AUDITORÍA */}
                                {activeSubTab === 'criterio' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        <div style={{
                                            padding: '16px', borderRadius: '10px',
                                            background: currentPatientRecord.horasEstancia !== null && currentPatientRecord.horasEstancia <= 48 ? '#FFFBEB' : '#EFF6FF',
                                            border: `1px solid ${currentPatientRecord.horasEstancia !== null && currentPatientRecord.horasEstancia <= 48 ? '#FDE68A' : '#BFDBFE'}`
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <ShieldAlert size={18} color={currentPatientRecord.horasEstancia !== null && currentPatientRecord.horasEstancia <= 48 ? '#D97706' : '#1D4ED8'} />
                                                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: currentPatientRecord.horasEstancia !== null && currentPatientRecord.horasEstancia <= 48 ? '#92400E' : '#1E40AF' }}>
                                                    {currentPatientRecord.horasEstancia !== null && currentPatientRecord.horasEstancia <= 48 
                                                        ? 'CASO CENTINELA — SEVERIDAD AL INGRESO (Mortalidad Precoz < 48 hs)'
                                                        : 'CASO EVOLUTIVO — AUDITORÍA DE COMPLICACIÓN Y FALLO MULTIORGÁNICO (> 48 hs)'}
                                                </h4>
                                            </div>
                                            <p style={{ margin: '8px 0 0 0', fontSize: '0.8rem', color: '#334155', lineHeight: '1.5' }}>
                                                {currentPatientRecord.horasEstancia !== null && currentPatientRecord.horasEstancia <= 48 ? (
                                                    <>
                                                        El paciente registró una permanencia de <strong>{currentPatientRecord.horasEstancia} horas</strong> en Cuidados Críticos.
                                                        De acuerdo con el estándar de auditoría de calidad médica de Sanatorio Argentino, la mortalidad acontecida dentro de las primeras 48 horas se considera un <strong>evento centinela atribuible a la gravedad basal extrema al ingreso (proxy score APACHE II / SOFA agudo)</strong> o cuadros agónicos terminales derivados desde Urgencias/Guardia, <em>no resultando imputable a fallo asistencial intra-UCI</em>.
                                                    </>
                                                ) : (
                                                    <>
                                                        El paciente registró una permanencia de <strong>{currentPatientRecord.horasEstancia !== null ? `${currentPatientRecord.horasEstancia} horas` : `${currentPatientRecord.diasEstancia} días`}</strong> en Cuidados Críticos.
                                                        Al tratarse de una defunción evolutiva (&gt; 48 hs), el caso califica para la auditoría de procesos asistenciales intra-UCI: respuesta a ventilación mecánica, cobertura antibiótica según antibiogramas, profilaxis de eventos trombóticos y evolución de falla multiorgánica.
                                                    </>
                                                )}
                                            </p>
                                        </div>

                                        <div style={{
                                            padding: '14px 16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px'
                                        }}>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                                                Parámetros Clave para el Comité de Mortalidad
                                            </span>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '8px' }}>
                                                <div style={{ background: '#FFFFFF', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                    <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Diagnóstico Primario</div>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                                                        {singleDiags[0]?.diagnostico || 'Sin codificar'}
                                                    </div>
                                                </div>
                                                <div style={{ background: '#FFFFFF', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                    <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Estudios Realizados</div>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                                                        {singlePeticiones.length} peticiones registradas
                                                    </div>
                                                </div>
                                                <div style={{ background: '#FFFFFF', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                    <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Estancia Total</div>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: currentPatientRecord.clasifColor, marginTop: '2px' }}>
                                                        {currentPatientRecord.diasEstancia} día{currentPatientRecord.diasEstancia > 1 ? 's' : ''} ({currentPatientRecord.horasEstancia !== null ? `${currentPatientRecord.horasEstancia} hs` : '-'})
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    /* ═══════════════════════════════════════════════════════════ */
                    /* MODO COLECTIVO: SCORECARDS + FILTROS + TABLA CON AUDITAR */
                    /* ═══════════════════════════════════════════════════════════ */
                    <>
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
                                            <th style={{ padding: '10px 8px', textAlign: 'center' }}>Acción</th>
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
                                                        <td style={{ padding: '10px 8px', maxWidth: '280px' }}>
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
                                                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedCase(row);
                                                                    setActiveSubTab('diagnosticos');
                                                                }}
                                                                style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                    padding: '5px 10px', borderRadius: '6px',
                                                                    border: '1px solid #BFDBFE', background: '#EFF6FF',
                                                                    color: '#1D4ED8', fontSize: '0.72rem', fontWeight: 700,
                                                                    cursor: 'pointer', transition: 'all 0.15s'
                                                                }}
                                                                title="Auditar este caso individual a fondo"
                                                            >
                                                                Auditar <ArrowRight size={12} />
                                                            </button>
                                                        </td>
                                                    </tr>

                                                    {/* ─── FILA EXPANDIBLE: VISTA RÁPIDA ─── */}
                                                    {isExpanded && (
                                                        <tr style={{ background: '#F8FAFC' }}>
                                                            <td colSpan={9} style={{ padding: '16px 20px', borderBottom: '2px solid #CBD5E1' }}>
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

                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                            <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                                                Box: <strong>{row.habitacion || 'UCI'}</strong> | Financiador: <strong>{row.cliente || 'Particular'}</strong>
                                                                            </span>
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setSelectedCase(row);
                                                                                    setActiveSubTab('diagnosticos');
                                                                                }}
                                                                                style={{
                                                                                    display: 'flex', alignItems: 'center', gap: '4px',
                                                                                    padding: '4px 10px', borderRadius: '6px',
                                                                                    border: '1px solid #1E40AF', background: '#1E40AF',
                                                                                    color: '#FFFFFF', fontSize: '0.72rem', fontWeight: 700,
                                                                                    cursor: 'pointer'
                                                                                }}
                                                                            >
                                                                                Dossier Completo <ArrowRight size={12} />
                                                                            </button>
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
                    </>
                )}

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
