import { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
    Upload, FileSpreadsheet, Search, RefreshCw, X, Download, 
    CheckCircle, AlertTriangle, AlertCircle, FileText, ChevronDown, 
    ChevronUp, ChevronLeft, ChevronRight, ListFilter, Trash2, ShieldAlert,
    DollarSign, Copy, Calendar, Info
} from 'lucide-react';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, ComposedChart, Treemap, ScatterChart, Scatter, Area
} from 'recharts';
import { hcLocalStore } from '../store/hcLocalStore';
import { processHCExcelFile } from '../utils/parseHCExcel';

// Normalizar celdas vacías, NULL de texto, etc.
const isNullOrEmpty = (val) => {
    if (val === null || val === undefined) return true;
    const str = String(val).trim();
    return str === "" || str.toLowerCase() === "null";
};

const formatExcelCell = (val, header) => {
    if (val === null || val === undefined) return '';
    
    const h = String(header).toLowerCase();
    const isDateCol = h.includes('fecha') || h.includes('date') || h.includes('fec_') || h.includes('_fec') || h === 'evolucion' || h === 'alta' || h === 'ingreso' || h.includes('evolucion');
    
    if (isDateCol) {
        if (val instanceof Date) {
            const d = String(val.getUTCDate()).padStart(2, '0');
            const m = String(val.getUTCMonth() + 1).padStart(2, '0');
            const y = val.getUTCFullYear();
            return `${d}/${m}/${y}`;
        }
        if (typeof val === 'number') {
            try {
                const jsDate = XLSX.SSF.parse_date_code(val);
                if (jsDate) {
                    const d = String(jsDate.d).padStart(2, '0');
                    const m = String(jsDate.m).padStart(2, '0');
                    const y = jsDate.y;
                    return `${d}/${m}/${y}`;
                }
            } catch (err) {
                // ignore
            }
        }
        if (typeof val === 'string' && val.trim() !== '') {
            const trimmed = val.trim();
            if (trimmed.toLowerCase() === 'null') {
                return '';
            }
            // YYYY-MM-DD
            const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (isoMatch) {
                return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
            }
            // DD/MM/YYYY
            const dmYMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
            if (dmYMatch) {
                const d = String(dmYMatch[1]).padStart(2, '0');
                const m = String(dmYMatch[2]).padStart(2, '0');
                const y = dmYMatch[3];
                return `${d}/${m}/${y}`;
            }
            return trimmed;
        }
    }
    
    return String(val).trim();
};

// Palabras clave para la detección inteligente de columnas críticas
// Actualizado para la query optimizada de 10 pasos
const COLUMN_KEYWORDS = {
    paciente: ['paciente_admi', 'paciente_admision', 'paciente', 'nombre paciente', 'nombre_paciente', 'paciente_nombre', 'nomyape', 'nombre y apellido', 'nom_ape'],
    numeroAdmision: ['id_admision', 'numero admision', 'numero admisión', 'número admisión', 'num admision', 'nro admision', 'nro_admision', 'nroadmision', 'admision', 'admisión', 'nro_adm', 'id_visita_fecha', 'id_visita_evolu', 'id_visita', 'idvisita', 'nhc', 'fq_idvisita', 'fq_idvis'],
    // PRIORIDAD: Fecha_Clinica_Evolucion es la fecha canónica de la query optimizada
    fechaEvolucion: ['fecha_clinica_evolucion', 'fecha_clinica_evoluc', 'fecha_clinica', 'fecha_evolucion', 'fecha_evolucio', 'fecha_evol', 'fecha evolucion', 'fecha evolución', 'fecha_respuesta', 'fecha respuesta', 'fq_fecha', 'fec_evolucion', 'fec_evol'],
    fechaAlta: ['fecha alta', 'fecha de alta', 'fecha_alta', 'fec_alta', 'alta_fecha', 'fecha_egreso', 'fecha_alta_hosp', 'fecha alta hosp', 'horas de alta'],
    valorRespuestaMedica: ['valor_respuesta_medica', 'valor_respuesta', 'valor_respues', 'valor respuesta medica', 'respuesta_medica', 'respuesta medica', 'valor respuesta médica', 'valor_respuesta_médica'],
    // Alta Médica separada (query optimizada trae Valor_Alta_Medica como campo propio)
    valorAlta: ['valor_alta_medica', 'valor_alta_med', 'valor_alta', 'valor alta', 'respuesta_alta', 'alta_valor'],
    especialidad: ['especialidad', 'esp', 'especial', 'proceso'],
    medico: ['medico', 'médico', 'profesional', 'doctor', 'dr', 'medico_nombre', 'nombre_medico', 'profesional_nombre', 'cirujano', 'fq_responsable'],
    habitacion: ['habitacion', 'habitación', 'hab', 'pieza', 'cama', 'habitacion_asig', 'habitacion_asignada', 'habitacion_adm'],
    serieAdmision: ['serie admision', 'serie admisión', 'serie_admision', 'serie'],
    fechaIngreso: ['fecha ingreso', 'fecha_ingreso', 'ingreso', 'fec_ingreso', 'ingreso_fecha', 'fec_ing', 'fecha_ing', 'fecha admision', 'fecha admisión', 'fecha_admision'],
    obraSocial: ['obra social', 'obra_social', 'os', 'financiador', 'cobertura', 'grupo_gasto', 'gpe_gasto'],
    // Nuevas columnas de la query optimizada
    tipoRegistroClinico: ['tipo_registro_clinico', 'tipo_registro', 'tipo_regist'],
    fechaEscrituraEvolucion: ['fecha_escritura_evolucion', 'fecha_escritura', 'fecha_escritu'],
    fuenteFechaClinica: ['fuente_fecha_clinica', 'fuente_fecha'],
    fechaAltaMedica: ['fecha_alta_medica', 'fecha_alta_med'],
    diasDesfaseAlta: ['dias_desfase_alta', 'dias_desfase'],
    motivoAlta: ['motivo de alta', 'motivo_alta', 'motivo_de_alt'],
    edad: ['edad'],
    diasEstadia: ['dias de estadia', 'dias_estadia', 'dias_de_esta']
};

const parseDateDMY = (str) => {
    if (!str) return null;
    const match = String(str).match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (match) {
        return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
    }
    const isoMatch = String(str).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}):(\d{2}))?/);
    if (isoMatch) {
        const h = parseInt(isoMatch[4] || 0);
        const m = parseInt(isoMatch[5] || 0);
        const s = parseInt(isoMatch[6] || 0);
        return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]), h, m, s);
    }
    const parsed = new Date(str);
    return isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateDMY = (date) => {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
};

const findDateGaps = (dates, startStr, endStr) => {
    const start = parseDateDMY(startStr) || (dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : null);
    const end = parseDateDMY(endStr) || (dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : null);
    
    if (!start || !end) return [];
    
    const gaps = [];
    const dateSet = new Set(dates.map(d => formatDateDMY(d)));
    const startStrFormatted = formatDateDMY(start);
    const endStrFormatted = formatDateDMY(end);
    
    // Generar secuencia de días desde el ingreso
    let curr = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const limit = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    limit.setDate(limit.getDate() + 1); // incluir día final
    
    let safetyCounter = 0;
    while (curr < limit && safetyCounter < 365) { // Límite de 1 año por seguridad
        safetyCounter++;
        const currStr = formatDateDMY(curr);
        // Si el día no tiene evolución registrada
        if (!dateSet.has(currStr)) {
            // Ni el día de ingreso ni el día de alta requieren evolución médica diaria obligatoria
            if (currStr !== startStrFormatted && currStr !== endStrFormatted) {
                gaps.push(currStr);
            }
        }
        curr.setDate(curr.getDate() + 1);
    }
    return gaps;
};

const calculateTextSimilarity = (txt1, txt2) => {
    if (!txt1 || !txt2) return 0;
    const clean = (txt) => {
        return String(txt)
            .toLowerCase()
            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .split(" ")
            .filter(w => w.length > 2); // palabras con sentido
    };
    const words1 = clean(txt1);
    const words2 = clean(txt2);
    if (words1.length === 0 || words2.length === 0) return 0;
    
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    
    let intersection = 0;
    set1.forEach(word => {
        if (set2.has(word)) intersection++;
    });
    
    const union = set1.size + set2.size - intersection;
    return intersection / union;
};

const processAuditData = (processedRows, mapping) => {
    const patientsMap = {};

    processedRows.forEach(row => {
        const numAdm = mapping.numeroAdmision ? String(row[mapping.numeroAdmision] || '').trim() : '';
        const fechaIng = mapping.fechaIngreso ? String(row[mapping.fechaIngreso] || '').trim() : '';
        
        let mesStr = '';
        let mesNombre = '';
        let fechaObjIngreso = null;
        if (fechaIng) {
            const dateObj = parseDateDMY(fechaIng);
            if (dateObj) {
                fechaObjIngreso = dateObj;
                mesStr = `-${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
                // Obtener nombre del mes en español
                const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                mesNombre = `${meses[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
            }
        }
        
        const groupKey = (numAdm ? numAdm + mesStr : '') || String(row[mapping.paciente] || '').trim() || `fila-${row._origIndex}`;

        if (!patientsMap[groupKey]) {
            patientsMap[groupKey] = {
                id: groupKey,
                numeroAdmision: numAdm || 'Sin N°',
                mesAdmision: mesNombre,
                fechaObjIngreso: fechaObjIngreso,
                paciente: mapping.paciente ? String(row[mapping.paciente] || '').trim() : 'Paciente Desconocido',
                especialidad: mapping.especialidad ? String(row[mapping.especialidad] || '').trim() : 'Sin Especialidad',
                medico: mapping.medico ? String(row[mapping.medico] || '').trim() : 'Sin Profesional',
                habitacion: mapping.habitacion ? String(row[mapping.habitacion] || '').trim() : 'Sin Habitación',
                obraSocial: mapping.obraSocial ? String(row[mapping.obraSocial] || '').trim() : 'Sin Obra Social',
                fechaIngreso: mapping.fechaIngreso ? String(row[mapping.fechaIngreso] || '').trim() : '',
                fechaAlta: mapping.fechaAlta ? String(row[mapping.fechaAlta] || '').trim() : '',
                evoluciones: [],
                rows: [],
                // Nuevos campos de la query optimizada
                edad: mapping.edad ? String(row[mapping.edad] || '').trim() : '',
                diasEstadia: mapping.diasEstadia ? String(row[mapping.diasEstadia] || '').trim() : '',
                motivoAlta: mapping.motivoAlta ? String(row[mapping.motivoAlta] || '').trim() : '',
                fechaAltaMedica: mapping.fechaAltaMedica ? String(row[mapping.fechaAltaMedica] || '').trim() : '',
                diasDesfaseAlta: mapping.diasDesfaseAlta ? String(row[mapping.diasDesfaseAlta] || '').trim() : ''
            };
        }

        const patient = patientsMap[groupKey];
        patient.rows.push(row);

        // Fecha canónica: Fecha_Clinica_Evolucion (ya resuelta por la query con cascada de 3 fuentes)
        const fechaEv = mapping.fechaEvolucion ? String(row[mapping.fechaEvolucion] || '').trim() : '';
        const textoEv = mapping.valorRespuestaMedica ? String(row[mapping.valorRespuestaMedica] || '').trim() : '';
        const valAlta = mapping.valorAlta ? String(row[mapping.valorAlta] || '').trim() : (row['Valor_Alta'] || row['Valor Alta'] || '');

        if (valAlta && !isNullOrEmpty(valAlta) && !patient.valorAlta) {
            patient.valorAlta = valAlta;
        }

        // Tipo de registro clínico (nuevo desde la query optimizada)
        const tipoRegistro = mapping.tipoRegistroClinico ? String(row[mapping.tipoRegistroClinico] || '').trim().toUpperCase() : '';

        const isUCIFormat = (txt, r) => {
            // Prioridad 1: Columna Tipo_Registro_Clinico de la query
            if (tipoRegistro.includes('RESUMEN') && tipoRegistro.includes('PRONOSTICO')) {
                return true;
            }
            // Prioridad 2: Heurística de texto (fallback para datos sin columna)
            let fullStr = String(txt || '');
            if (r && typeof r === 'object') {
                Object.values(r).forEach(v => {
                    if (v) fullStr += ' ' + String(v);
                });
            }
            const upper = fullStr.toUpperCase();
            const hasResumen = upper.includes('RESUMEN');
            const hasPronostico = upper.includes('PRONOSTICO') || upper.includes('PRONÓSTICO');
            const hasEvolucion = upper.includes('EVOLUCION') || upper.includes('EVOLUCIÓN');
            const hasConsignas = upper.includes('CONSIGNAS');
            return (hasResumen && hasPronostico && hasEvolucion && hasConsignas) || upper.includes('TERAPIA INTENSIVA') || upper.includes('UCI');
        };

        if (fechaEv || textoEv) {
            const isUCI = isUCIFormat(textoEv, row);
            patient.evoluciones.push({
                fechaStr: fechaEv,
                fechaObj: parseDateDMY(fechaEv),
                texto: textoEv,
                isUCI: isUCI,
                filaExcel: row._origIndex,
                rowRef: row,
                // Trazabilidad de la query optimizada
                tipoRegistro: tipoRegistro || null,
                fechaEscritura: mapping.fechaEscrituraEvolucion ? String(row[mapping.fechaEscrituraEvolucion] || '').trim() : null,
                fuenteFecha: mapping.fuenteFechaClinica ? String(row[mapping.fuenteFechaClinica] || '').trim() : null
            });
            if (isUCI) {
                patient.hasUCI = true;
                patient.isUCI = true;
            }
        }
    });

    const specialtyKeywordsQuir = ['cirugia', 'cirugía', 'quirurg', 'quirúrg', 'traumato', 'gineco', 'obstetr', 'cardio', 'urolog', 'quir', 'qx'];


    const result = Object.values(patientsMap).map(pat => {
        // Ordenar evoluciones cronológicamente por timestamp original
        pat.evoluciones.sort((a, b) => {
            if (!a.fechaObj) return 1;
            if (!b.fechaObj) return -1;
            return a.fechaObj - b.fechaObj;
        });

        // Reasignación Inteligente de Guardia Nocturna (00:00 a 05:59 AM)
        pat.evoluciones.forEach(ev => {
            if (ev.fechaObj) {
                const hours = ev.fechaObj.getHours();
                if (hours >= 0 && hours < 6) {
                    const prevDay = new Date(ev.fechaObj);
                    prevDay.setDate(prevDay.getDate() - 1);
                    ev.fechaObjEfectiva = prevDay;
                    ev.fechaStrEfectiva = formatDateDMY(prevDay);
                    ev.isMadrugada = true;
                    ev.horaCargaStr = `${String(ev.fechaObj.getHours()).padStart(2, '0')}:${String(ev.fechaObj.getMinutes()).padStart(2, '0')} hs`;
                } else {
                    ev.fechaObjEfectiva = ev.fechaObj;
                    ev.fechaStrEfectiva = formatDateDMY(ev.fechaObj);
                }
            } else {
                ev.fechaObjEfectiva = null;
                ev.fechaStrEfectiva = ev.fechaStr;
            }
        });

        const validDates = pat.evoluciones
            .filter(ev => ev.fechaObjEfectiva)
            .map(ev => ev.fechaObjEfectiva);

        const fechaIngresoStr = pat.fechaIngreso || (pat.evoluciones[0] ? pat.evoluciones[0].fechaStrEfectiva : '');
        const fechaAltaStr = pat.fechaAlta || (pat.evoluciones[pat.evoluciones.length - 1] ? pat.evoluciones[pat.evoluciones.length - 1].fechaStrEfectiva : '');

        const gaps = findDateGaps(validDates, fechaIngresoStr, fechaAltaStr);

        pat.evoluciones.forEach((ev, idx) => {
            let isDuplicated = false;
            let similarity = 0;

            if (idx > 0 && ev.texto && pat.evoluciones[idx - 1].texto) {
                similarity = calculateTextSimilarity(ev.texto, pat.evoluciones[idx - 1].texto);
                if (similarity > 0.85) {
                    isDuplicated = true;
                }
            }

            ev.isDuplicated = isDuplicated;
            ev.similarity = similarity;

            const rowRef = ev.rowRef;
            if (rowRef) {
                if (isDuplicated) {
                    rowRef._auditStatus = 'RIESGO_DUPLICADO';
                    rowRef._auditDetail = `Evolución clínica duplicada con el día anterior (${Math.round(similarity * 100)}% similitud)`;
                }
            }
        });

        const alertas = [];
        if (gaps.length > 0) {
            alertas.push({
                tipo: 'CRITICO',
                codigo: 'RIESGO_VACIO',
                mensaje: `Faltan ${gaps.length} evoluciones médicas (Gaps: ${gaps.join(', ')})`
            });
        }

        const duplicados = pat.evoluciones.filter(ev => ev.isDuplicated);
        const duplicadosCount = duplicados.length;
        if (duplicadosCount > 0) {
            const diasDuplicadosStr = duplicados.map(ev => ev.fechaStrEfectiva || ev.fechaStr).join(', ');
            const detallesTextos = duplicados.map(ev => `${ev.fechaStrEfectiva || ev.fechaStr}: "${ev.texto.substring(0, 100)}${ev.texto.length > 100 ? '...' : ''}"`);
            alertas.push({
                tipo: 'MEDIO',
                codigo: 'RIESGO_DUPLICADO',
                mensaje: `${duplicadosCount} evolución/es duplicada/s (Copy-paste). Días afectados: ${diasDuplicadosStr}`,
                detalles: detallesTextos
            });
        }

        return {
            ...pat,
            gaps,
            alertas,

            hasCriticalIssues: gaps.length > 0 || duplicadosCount > 0
        };
    });

    result.sort((a, b) => {
        if (a.fechaObjIngreso && b.fechaObjIngreso) {
            return b.fechaObjIngreso - a.fechaObjIngreso;
        }
        if (a.fechaObjIngreso) return -1;
        if (b.fechaObjIngreso) return 1;
        return String(b.numeroAdmision).localeCompare(String(a.numeroAdmision));
    });

    return result;
};

const isSurgicalDay = (day) => {
    // Prioridad 1: Si el día fue marcado por cruce con Foja Quirúrgica real
    if (day.hasFojaQuirurgica) return true;
    // Prioridad 2: Heurística de texto (fallback para datos sin Foja)
    if (!day.valRespuesta) return false;
    const txt = day.valRespuesta.toLowerCase();
    return ['cirugia', 'cirugía', 'quirurg', 'quirúrg', 'quirofano', 'quirófano', 'operacion', 'operación'].some(kw => txt.includes(kw));
};

const getPatientTimelineDays = (pat) => {
    const start = parseDateDMY(pat.fechaIngreso) || (pat.evoluciones[0] ? pat.evoluciones[0].fechaObjEfectiva : null);
    const end = parseDateDMY(pat.fechaAlta) || (pat.evoluciones[pat.evoluciones.length - 1] ? pat.evoluciones[pat.evoluciones.length - 1].fechaObjEfectiva : null);
    
    if (!start || !end) return [];
    
    const days = [];
    let curr = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const limit = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    limit.setDate(limit.getDate() + 1); // incluir día final
    
    const evolutionMap = {};
    pat.evoluciones.forEach(ev => {
        const key = ev.fechaStrEfectiva || ev.fechaStr;
        if (key) {
            evolutionMap[key] = ev;
        }
    });
    
    const gapSet = new Set(pat.gaps);
    
    // Construir set de fechas de cirugía desde la Foja Quirúrgica real
    const fojaDateSet = new Set();
    const adData = hcLocalStore.getAdmissionData(pat.numeroAdmision);
    if (adData && adData.fojas) {
        adData.fojas.forEach(fq => {
            if (fq.fecha_cirugia && String(fq.fecha_cirugia).toLowerCase() !== 'null') {
                // Convertir ISO a DD/MM/YYYY para comparar con dateStr
                const fqDate = new Date(fq.fecha_cirugia);
                if (!isNaN(fqDate.getTime())) {
                    fojaDateSet.add(formatDateDMY(fqDate));
                }
            }
        });
    }
    
    let safety = 0;
    while (curr < limit && safety < 365) {
        safety++;
        const dateStr = formatDateDMY(curr);
        
        // Determine status
        let status = 'OK'; // Default
        let detail = '';
        let similarity = 0;
        let valRespuesta = '';
        let hasFojaQuirurgica = fojaDateSet.has(dateStr);
        
        let isUCI = false;
        if (gapSet.has(dateStr)) {
            status = 'GAP';
            detail = 'Día sin evolución médica (Pérdida de cobro OSP)';
        } else if (evolutionMap[dateStr]) {
            const ev = evolutionMap[dateStr];
            valRespuesta = ev.texto;
            // Usar Tipo_Registro_Clinico si está disponible, sino heurística
            isUCI = ev.isUCI || (ev.tipoRegistro && ev.tipoRegistro.includes('RESUMEN') && ev.tipoRegistro.includes('PRONOSTICO')) || (ev.texto && String(ev.texto).toUpperCase().includes('RESUMEN') && String(ev.texto).toUpperCase().includes('PRONOSTICO') && String(ev.texto).toUpperCase().includes('EVOLUCION') && String(ev.texto).toUpperCase().includes('CONSIGNAS'));
            if (ev.isDuplicated) {
                status = 'DUPLICADO';
                similarity = ev.similarity;
                detail = `Texto repetitivo (${Math.round(similarity * 100)}% similitud con día anterior)`;
            } else {
                status = 'OK';
                if (ev.isMadrugada) {
                    detail = `🌙 Guardia Nocturna (Cargada a las ${ev.horaCargaStr} del día siguiente)`;
                } else if (isUCI) {
                    detail = 'Evolución UCI (Resumen - Pronóstico - Evolución - Consignas)';
                } else {
                    detail = 'Evolución registrada correctamente';
                }
            }
        } else {
            // El día de ingreso y el día de alta están exentos si no tienen evolución médica
            if (dateStr === pat.fechaIngreso || dateStr === pat.fechaAlta) {
                status = 'OK';
                detail = dateStr === pat.fechaIngreso ? 'Día de Ingreso (Exento de evolución)' : 'Día de Alta (Exento de evolución)';
            } else {
                status = 'GAP';
                detail = 'Sin evolución registrada';
            }
        }

        // Enriquecer con información de Foja Quirúrgica
        if (hasFojaQuirurgica) {
            detail += detail ? ' | 🔵 Día con Foja Quirúrgica' : '🔵 Día con Foja Quirúrgica';
        }
        
        days.push({
            dateStr,
            status,
            detail,
            similarity,
            valRespuesta,
            isUCI,
            hasFojaQuirurgica
        });
        
        curr.setDate(curr.getDate() + 1);
    }
    return days;
};

export default function AuditoriaHistoriasPanel({ addToast, currentUser }) {
    // Archivo y Datos
    const [fileName, setFileName] = useState('');
    const [hcLoadedCount, setHcLoadedCount] = useState(0);
    const [originalRows, setOriginalRows] = useState([]);
    const [groupedPatients, setGroupedPatients] = useState([]);
    const [viewMode, setViewMode] = useState('pacientes'); // 'planilla' | 'pacientes'
    const [headers, setHeaders] = useState([]);
    const [columnMapping, setColumnMapping] = useState({});
    const [dragOver, setDragOver] = useState(false);
    const [loading, setLoading] = useState(false);

    // Búsqueda y paginación
    const [searchTerm, setSearchTerm] = useState('');
    const [pageSize, setPageSize] = useState(50);
    const [currentPage, setCurrentPage] = useState(1);

    // Búsqueda y paginación de pacientes (Timeline)
    const [patientRiskFilter, setPatientRiskFilter] = useState('all');
    const [patientSearch, setPatientSearch] = useState('');
    const [patientPage, setPatientPage] = useState(1);
    const [expandedPatients, setExpandedPatients] = useState(new Set());

    const togglePatientExpansion = (id) => {
        setExpandedPatients(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Filtros por Columna (estilo Excel)
    const [columnFilters, setColumnFilters] = useState({}); // { [header]: Set(selectedValues) }
    const [activeFilterCol, setActiveFilterCol] = useState(null);
    const [filterSearch, setFilterSearch] = useState('');

    // Ordenamiento
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' }); // { key, direction: 'asc'|'desc' }
    const [kpiFilter, setKpiFilter] = useState('all');
    const [selectedMonthFilter, setSelectedMonthFilter] = useState('all');
    const [showStats, setShowStats] = useState(false);
    const [activeTab, setActiveTab] = useState('resumen'); // 'resumen' | 'distribucion' | 'tendencias' | 'avanzado'

    const fileInputRef = useRef(null);

    // =============================================
    // PARSEO Y PROCESAMIENTO
    // =============================================

    const handleFile = (file) => {
        if (!file) return;
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext !== 'xlsx' && ext !== 'xls' && ext !== 'csv') {
            addToast?.('Solo se aceptan archivos .xlsx, .xls o .csv', 'error');
            return;
        }

        setLoading(true);
        setFileName(file.name);

        // Permitir que React renderice inmediatamente la pantalla de carga antes de bloquear el hilo principal
        setTimeout(() => {
            // Procesar la data del timeline 3D de HC
            processHCExcelFile(file)
                .then(count => {
                    setHcLoadedCount(count);
                    if (count > 0) addToast?.(`Timeline 3D: ${count} historias cargadas a memoria`, 'success');
                })
                .catch(e => console.error("Error timeline:", e));

            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

                    if (jsonData.length === 0) {
                        addToast?.('El archivo Excel está vacío', 'error');
                        setLoading(false);
                        return;
                    }

                    // Obtener cabeceras y filtrar las vacías generadas por SheetJS
                    const sheetHeaders = Object.keys(jsonData[0]).filter(header => header && !header.startsWith('__EMPTY'));
                    setHeaders(sheetHeaders);

                    // Detección automática de columnas críticas
                    const mapping = {};
                    sheetHeaders.forEach(header => {
                        const normalizedHeader = header.toLowerCase().replace(/[\s_\-\.]/g, '');
                        for (const [field, keywords] of Object.entries(COLUMN_KEYWORDS)) {
                            if (mapping[field]) continue; // Ya mapeado
                            
                            // Match exacto, parcial o truncado
                            const matches = keywords.some(keyword => {
                                const normalizedKeyword = keyword.toLowerCase().replace(/[\s_\-\.]/g, '');
                                return normalizedHeader === normalizedKeyword || 
                                       normalizedHeader.includes(normalizedKeyword) ||
                                       (normalizedHeader.length >= 4 && normalizedKeyword.includes(normalizedHeader));
                            });

                            if (matches) {
                                mapping[field] = header;
                            }
                        }
                    });

                    setColumnMapping(mapping);

                    // Guardar filas con sus índices de Excel y auditoría calculada
                    const processed = jsonData.map((row, idx) => {
                        const formattedRow = {};
                        sheetHeaders.forEach(header => {
                            formattedRow[header] = formatExcelCell(row[header], header);
                        });

                        const mappedFecha = mapping.fechaEvolucion ? formattedRow[mapping.fechaEvolucion] : null;
                        const mappedRespuesta = mapping.valorRespuestaMedica ? formattedRow[mapping.valorRespuestaMedica] : null;
                        const mappedAlta = mapping.fechaAlta ? formattedRow[mapping.fechaAlta] : null;

                        const emptyFecha = isNullOrEmpty(mappedFecha);
                        const emptyRespuesta = isNullOrEmpty(mappedRespuesta);
                        const emptyAlta = isNullOrEmpty(mappedAlta);

                        let status = 'OK';
                        let detail = 'Auditoría correcta';

                        if (emptyFecha && emptyRespuesta) {
                            status = 'SIN_AMBOS';
                            detail = 'Falta Fecha Evolución y Respuesta Médica';
                        } else if (emptyFecha) {
                            status = 'SIN_FECHA';
                            detail = 'Falta Fecha de Evolución';
                        } else if (emptyRespuesta) {
                            status = 'SIN_RESPUESTA';
                            detail = 'Falta Valor de Respuesta Médica';
                        }

                        return {
                            ...formattedRow,
                            _origIndex: idx + 2, // Fila 1 es cabecera, index base 0
                            _auditStatus: status,
                            _auditDetail: detail,
                            _hasFecha: !emptyFecha,
                            _hasRespuesta: !emptyRespuesta,
                            _hasAlta: !emptyAlta
                        };
                    });

                    const auditedGrouped = processAuditData(processed, mapping);
                    setGroupedPatients(auditedGrouped);
                    setOriginalRows(processed);
                    setCurrentPage(1);
                    setColumnFilters({});
                    setKpiFilter('all');
                    setSortConfig({ key: null, direction: 'asc' });

                    addToast?.(`Importado: ${processed.length} registros cargados`, 'success');
                } catch (err) {
                    console.error(err);
                    addToast?.('Error al procesar el archivo: ' + err.message, 'error');
                } finally {
                    setLoading(false);
                }
            };

            reader.onerror = () => {
                addToast?.('Error de lectura del archivo', 'error');
                setLoading(false);
            };

            reader.readAsArrayBuffer(file);
        }, 50);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer?.files?.[0];
        handleFile(file);
    };

    const handleExcelSelect = (e) => {
        const file = e.target.files?.[0];
        handleFile(file);
    };

    const handleClearData = () => {
        if (window.confirm('¿Seguro que deseas limpiar la planilla actual?')) {
            setFileName('');
            setOriginalRows([]);
            setGroupedPatients([]);
            setViewMode('planilla');
            setHeaders([]);
            setColumnMapping({});
            setColumnFilters({});
            setKpiFilter('all');
            setSelectedMonthFilter('all');
            setSortConfig({ key: null, direction: 'asc' });
            setPatientRiskFilter('all');
            setPatientSearch('');
            setPatientPage(1);
        }
    };

    // =============================================
    // LÓGICA DE FILTRADO GLOBAL POR MES
    // =============================================
    const availableMonths = useMemo(() => {
        const unique = [];
        groupedPatients.forEach(pat => {
            if (pat.mesAdmision && !unique.includes(pat.mesAdmision)) {
                unique.push(pat.mesAdmision);
            }
        });
        return unique;
    }, [groupedPatients]);

    const { filteredOriginalRows, filteredGroupedPatientsByMonth } = useMemo(() => {
        if (selectedMonthFilter === 'all') {
            return { filteredOriginalRows: originalRows, filteredGroupedPatientsByMonth: groupedPatients };
        }
        
        const filteredGroups = groupedPatients.filter(pat => pat.mesAdmision === selectedMonthFilter);
        const filteredRows = [];
        filteredGroups.forEach(pat => {
            filteredRows.push(...pat.rows);
        });
        
        return { filteredOriginalRows: filteredRows, filteredGroupedPatientsByMonth: filteredGroups };
    }, [originalRows, groupedPatients, selectedMonthFilter]);

    // =============================================
    // LÓGICA DE FILTRADO Y MÉTRIQUES
    // =============================================

    // KPIs globales (sobre el total de filas importadas)
    const kpis = useMemo(() => {
        let ok = 0;
        let sinFecha = 0;
        let sinRespuesta = 0;
        let sinAmbos = 0;
        let sinAlta = 0;
        let totalGaps = 0;
        let totalDuplicados = 0;

        const altaCol = columnMapping.fechaAlta;

        filteredOriginalRows.forEach(row => {
            const status = row._auditStatus;
            if (status === 'OK') ok++;
            else if (status === 'SIN_AMBOS') {
                sinAmbos++;
                sinFecha++;
                sinRespuesta++;
            } else if (status === 'SIN_FECHA') {
                sinFecha++;
            } else if (status === 'SIN_RESPUESTA') {
                sinRespuesta++;
            }

            if (altaCol) {
                const val = row[altaCol];
                if (val === null || val === undefined || String(val).trim() === '' || String(val).toLowerCase() === 'null') {
                    sinAlta++;
                }
            }
        });

        filteredGroupedPatientsByMonth.forEach(pat => {
            totalGaps += pat.gaps.length;
            totalDuplicados += pat.evoluciones.filter(ev => ev.isDuplicated).length;

        });

        return {
            total: filteredOriginalRows.length,
            totalAdmisiones: filteredGroupedPatientsByMonth.length,
            ok,
            sinFecha,
            sinRespuesta,
            sinAmbos,
            sinAlta,
            totalGaps,
            totalDuplicados
        };
    }, [filteredOriginalRows, columnMapping, filteredGroupedPatientsByMonth]);

    // Estadísticas de Omisiones avanzadas para los 10 gráficos
    const statsData = useMemo(() => {
        const obsRows = filteredOriginalRows.filter(row => row._auditStatus !== 'OK');
        const espCol = columnMapping.especialidad;
        const serieCol = columnMapping.serieAdmision;
        const roomCol = columnMapping.habitacion;
        const fecCol = columnMapping.fechaEvolucion;
        const pacCol = columnMapping.paciente;

        // 1. Score de Calidad
        const total = filteredOriginalRows.length;
        const okCount = filteredOriginalRows.filter(r => r._auditStatus === 'OK').length;
        const qualityScore = total > 0 ? Math.round((okCount / total) * 100) : 0;

        // 2. Gráfico de Dona: Distribución
        const onlyFecha = kpis.sinFecha - kpis.sinAmbos;
        const onlyRespuesta = kpis.sinRespuesta - kpis.sinAmbos;
        const pieData = [
            { name: 'Historias OK', value: okCount, color: '#10b981' },
            { name: 'Sin Fecha', value: onlyFecha, color: '#f59e0b' },
            { name: 'Sin Respuesta', value: onlyRespuesta, color: '#3b82f6' },
            { name: 'Faltan Ambos', value: kpis.sinAmbos, color: '#ef4444' }
        ].filter(item => item.value > 0);

        // 3. Embudo de Calidad (Funnel)
        const conFecha = filteredOriginalRows.filter(r => r._hasFecha).length;
        const conRespuesta = filteredOriginalRows.filter(r => r._hasRespuesta).length;
        const funnelData = [
            { stage: '1. Procesados', valor: total, fill: '#1e5fa6' },
            { stage: '2. Con Fecha', valor: conFecha, fill: '#3b82f6' },
            { stage: '3. Con Respuesta', valor: conRespuesta, fill: '#60a5fa' },
            { stage: '4. Correctos', valor: okCount, fill: '#10b981' }
        ];

        // 4, 5, 6. Distribuciones (Especialidad, Serie, Habitación)
        const espCounts = {};
        const serieCounts = {};
        const roomCounts = {};

        obsRows.forEach(row => {
            if (espCol) {
                const val = row[espCol] ? String(row[espCol]).trim() : '(Sin Especialidad)';
                espCounts[val] = (espCounts[val] || 0) + 1;
            }
            if (serieCol) {
                const val = row[serieCol] ? String(row[serieCol]).trim() : '(Sin Serie)';
                serieCounts[val] = (serieCounts[val] || 0) + 1;
            }
            if (roomCol) {
                const val = row[roomCol] ? String(row[roomCol]).trim() : '(Sin Habitación)';
                roomCounts[val] = (roomCounts[val] || 0) + 1;
            }
        });

        const bySpecialty = Object.entries(espCounts)
            .map(([name, omisiones]) => ({ name: name.length > 16 ? name.slice(0, 14) + '…' : name, omisiones }))
            .sort((a, b) => b.omisiones - a.omisiones)
            .slice(0, 5);

        const bySerie = Object.entries(serieCounts)
            .map(([name, omisiones]) => ({ name: name.length > 16 ? name.slice(0, 14) + '…' : name, omisiones }))
            .sort((a, b) => b.omisiones - a.omisiones)
            .slice(0, 5);

        const byRoom = Object.entries(roomCounts)
            .map(([name, omisiones]) => ({ name: name.length > 16 ? name.slice(0, 14) + '…' : name, omisiones }))
            .sort((a, b) => b.omisiones - a.omisiones)
            .slice(0, 5);

        // 7, 8. Tendencia Temporal (Por fecha de evolución)
        const dateCounts = {}; // { [dateStr]: { total: 0, omisiones: 0 } }
        originalRows.forEach(row => {
            const dateVal = row[fecCol];
            const dateStr = (dateVal && dateVal !== '—') ? String(dateVal).trim().slice(0, 10) : '(Sin Fecha)';
            if (!dateCounts[dateStr]) {
                dateCounts[dateStr] = { total: 0, omisiones: 0 };
            }
            dateCounts[dateStr].total += 1;
            if (row._auditStatus !== 'OK') {
                dateCounts[dateStr].omisiones += 1;
            }
        });

        const parseDateStr = (str) => {
            if (!str || str === '(Sin Fecha)') return 0;
            const parts = str.split('/');
            if (parts.length === 3) {
                return new Date(parts[2], parts[1] - 1, parts[0]).getTime();
            }
            return new Date(str).getTime() || 0;
        };

        const temporalData = Object.entries(dateCounts)
            .map(([date, counts]) => ({
                date,
                total: counts.total,
                omisiones: counts.omisiones,
                t: parseDateStr(date)
            }))
            .sort((a, b) => a.t - b.t)
            .map(({ date, total, omisiones }) => ({ date, total, omisiones }));

        // 9. Treemap
        const treemapData = Object.entries(espCounts)
            .map(([name, size]) => ({ name, size }))
            .filter(item => item.size > 0);

        // 10. Dispersión
        const scatterData = originalRows.map(row => {
            const statusVal = row._auditStatus === 'OK' ? 3 
                            : row._auditStatus === 'SIN_RESPUESTA' ? 2 
                            : row._auditStatus === 'SIN_FECHA' ? 1 
                            : 0;
            return {
                fila: row._origIndex,
                estado: statusVal,
                paciente: row[pacCol] || `Paciente Fila ${row._origIndex}`
            };
        });

        return { 
            qualityScore, pieData, funnelData, 
            bySpecialty, bySerie, byRoom, 
            temporalData, treemapData, scatterData 
        };
    }, [filteredOriginalRows, columnMapping, kpis]);

    // 1. Filtrar por KPI pill activo
    const rowsFilteredByKpi = useMemo(() => {
        if (kpiFilter === 'all') return filteredOriginalRows;
        const altaCol = columnMapping.fechaAlta;
        return filteredOriginalRows.filter(row => {
            if (kpiFilter === 'ok') return row._auditStatus === 'OK';
            if (kpiFilter === 'sin_ambos') return row._auditStatus === 'SIN_AMBOS';
            if (kpiFilter === 'sin_fecha') return !row._hasFecha; // incluye sin ambos
            if (kpiFilter === 'sin_respuesta') return !row._hasRespuesta; // incluye sin ambos
            if (kpiFilter === 'sin_alta') {
                if (!altaCol) return false;
                const val = row[altaCol];
                return val === null || val === undefined || String(val).trim() === '' || String(val).toLowerCase() === 'null';
            }
            return true;
        });
    }, [filteredOriginalRows, kpiFilter, columnMapping]);

    // Valores únicos para menús de filtros por columna (se basan en las filas filtradas por KPI para no sugerir valores inexistentes)
    const uniqueColumnValues = useMemo(() => {
        const cols = {};
        headers.forEach(h => {
            cols[h] = new Set();
        });
        rowsFilteredByKpi.forEach(row => {
            headers.forEach(h => {
                const val = row[h] === undefined || row[h] === null ? '' : String(row[h]).trim();
                cols[h].add(val === '' ? '(Vacío)' : val);
            });
        });
        return Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, [...v].sort((a,b) => a.localeCompare(b, undefined, {numeric: true}))]));
    }, [rowsFilteredByKpi, headers]);

    // 2. Aplicar filtros individuales por columna
    const rowsFilteredByColumns = useMemo(() => {
        return rowsFilteredByKpi.filter(row => {
            // Verificar cada filtro activo
            for (const [colHeader, selectedVals] of Object.entries(columnFilters)) {
                const cellValRaw = row[colHeader];
                const cellVal = cellValRaw === undefined || cellValRaw === null ? '' : String(cellValRaw).trim();
                const displayVal = cellVal === '' ? '(Vacío)' : cellVal;
                if (!selectedVals.has(displayVal)) {
                    return false;
                }
            }
            return true;
        });
    }, [rowsFilteredByKpi, columnFilters]);

    // 3. Aplicar buscador global
    const rowsSearched = useMemo(() => {
        if (!searchTerm) return rowsFilteredByColumns;
        const term = searchTerm.toLowerCase();
        return rowsFilteredByColumns.filter(row => {
            return headers.some(h => {
                const val = row[h];
                if (val === null || val === undefined) return false;
                return String(val).toLowerCase().includes(term);
            });
        });
    }, [rowsFilteredByColumns, searchTerm, headers]);

    // 4. Aplicar ordenamiento
    const sortedRows = useMemo(() => {
        if (!sortConfig.key) return rowsSearched;
        const sorted = [...rowsSearched];
        const { key, direction } = sortConfig;
        
        sorted.sort((a, b) => {
            let valA = a[key] === undefined || a[key] === null ? '' : String(a[key]);
            let valB = b[key] === undefined || b[key] === null ? '' : String(b[key]);

            // Tratar números
            const numA = Number(valA);
            const numB = Number(valB);
            if (!isNaN(numA) && !isNaN(numB) && valA !== '' && valB !== '') {
                return direction === 'asc' ? numA - numB : numB - numA;
            }

            // Tratar strings
            return direction === 'asc'
                ? valA.localeCompare(valB, undefined, { sensitivity: 'base' })
                : valB.localeCompare(valA, undefined, { sensitivity: 'base' });
        });

        return sorted;
    }, [rowsSearched, sortConfig]);

    // Paginación
    const totalFiltered = sortedRows.length;
    const totalPages = Math.ceil(totalFiltered / pageSize) || 1;
    const paginatedRows = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        if (pageSize === -1) return sortedRows; // -1 significa todo
        return sortedRows.slice(start, start + pageSize);
    }, [sortedRows, currentPage, pageSize]);

    // Filtrado de pacientes (Ciclos de Internación)
    const filteredGroupedPatients = useMemo(() => {
        let result = filteredGroupedPatientsByMonth;

        if (patientSearch) {
            const q = patientSearch.toLowerCase();
            result = result.filter(p => 
                p.paciente.toLowerCase().includes(q) || 
                p.numeroAdmision.toLowerCase().includes(q) ||
                p.medico.toLowerCase().includes(q) ||
                p.especialidad.toLowerCase().includes(q)
            );
        }

        if (patientRiskFilter !== 'all') {
            result = result.filter(p => {
                const hasCritical = p.gaps.length > 0;
                const hasMedium = p.evoluciones.some(ev => ev.isDuplicated);

                if (patientRiskFilter === 'high') return hasCritical;
                if (patientRiskFilter === 'medium') return !hasCritical && hasMedium;
                if (patientRiskFilter === 'low') return !hasCritical && !hasMedium;
                return true;
            });
        }

        return result;
    }, [filteredGroupedPatientsByMonth, patientSearch, patientRiskFilter]);

    const patientPageSize = 10;
    const totalPatientPages = Math.ceil(filteredGroupedPatients.length / patientPageSize) || 1;
    const paginatedPatients = useMemo(() => {
        const start = (patientPage - 1) * patientPageSize;
        return filteredGroupedPatients.slice(start, start + patientPageSize);
    }, [filteredGroupedPatients, patientPage]);

    // Contadores activos de filtros de columna
    const activeFiltersCount = Object.keys(columnFilters).length;

    // Handlers filtros por columna
    const toggleColumnFilterMenu = (col) => {
        setActiveFilterCol(prev => prev === col ? null : col);
        setFilterSearch('');
    };

    const handleSelectColumnFilterValue = (col, value) => {
        setColumnFilters(prev => {
            const current = prev[col] ? new Set(prev[col]) : new Set();
            if (current.has(value)) {
                current.delete(value);
            } else {
                current.add(value);
            }

            const next = { ...prev };
            if (current.size === 0) {
                delete next[col];
            } else {
                next[col] = current;
            }
            return next;
        });
        setCurrentPage(1);
    };

    const handleClearColumnFilter = (col) => {
        setColumnFilters(prev => {
            const next = { ...prev };
            delete next[col];
            return next;
        });
        setActiveFilterCol(null);
        setCurrentPage(1);
    };

    const handleSelectAllColumnFilter = (col, vals) => {
        setColumnFilters(prev => {
            const next = { ...prev };
            next[col] = new Set(vals);
            return next;
        });
        setCurrentPage(1);
    };

    const handleClearAllFilters = () => {
        setColumnFilters({});
        setSearchTerm('');
        setKpiFilter('all');
        setSortConfig({ key: null, direction: 'asc' });
        setCurrentPage(1);
    };

    // Ordenar cabecera click
    const handleHeaderClick = (header) => {
        setSortConfig(prev => {
            if (prev.key === header) {
                return {
                    key: header,
                    direction: prev.direction === 'asc' ? 'desc' : 'asc'
                };
            }
            return { key: header, direction: 'asc' };
        });
    };

    // =============================================
    // EXPORTACIÓN A EXCEL
    // =============================================

    const exportAuditedExcel = () => {
        if (sortedRows.length === 0) {
            addToast?.('No hay registros para exportar', 'error');
            return;
        }

        try {
            // Generar planilla agregando columnas de auditoría al inicio
            const dataToExport = sortedRows.map(row => {
                const newRow = {};
                
                // Columnas de auditoría al inicio
                newRow['Fila Excel Original'] = row._origIndex;
                newRow['Estado Auditoría'] = row._auditStatus;
                newRow['Detalle Omisión'] = row._auditDetail;

                // Copiar el resto de columnas originales
                headers.forEach(h => {
                    newRow[h] = row[h];
                });

                return newRow;
            });

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(dataToExport);

            // Estilos básicos y auto-ancho para las celdas
            const wscols = [
                { wch: 18 }, // Fila Excel Original
                { wch: 15 }, // Estado Auditoría
                { wch: 40 }, // Detalle Omisión
                ...headers.map(h => ({ wch: Math.max(String(h).length, 12) }))
            ];
            ws['!cols'] = wscols;

            XLSX.utils.book_append_sheet(wb, ws, 'Auditoría Historias');
            
            const timeStr = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(wb, `Auditoria_Historias_Clinicas_${timeStr}.xlsx`);
            addToast?.(`Planilla exportada con ${sortedRows.length} registros`, 'success');
        } catch (err) {
            console.error(err);
            addToast?.('Error al exportar: ' + err.message, 'error');
        }
    };

    const handleExportPdf = async () => {
        if (originalRows.length === 0) {
            addToast?.('No hay registros para generar el PDF', 'error');
            return;
        }
        try {
            const { exportAuditorReportPdf } = await import('../utils/auditoriaReportPdf');
            exportAuditorReportPdf(originalRows, kpis, columnMapping, groupedPatients);
            addToast?.('Reporte PDF Clínico generado correctamente', 'success');
        } catch (err) {
            console.error(err);
            addToast?.('Error al generar PDF: ' + err.message, 'error');
        }
    };

    // =============================================
    // COMPONENTE CABECERA FILTRABLE
    // =============================================

    const TableHeaderCell = ({ header }) => {
        const isCritical = header === columnMapping.fechaEvolucion || header === columnMapping.valorRespuestaMedica;
        const isMappedFecha = header === columnMapping.fechaEvolucion;
        const isMappedResp = header === columnMapping.valorRespuestaMedica;

        const isFiltered = !!columnFilters[header];
        const isOpen = activeFilterCol === header;
        
        const allVals = uniqueColumnValues[header] || [];
        const filteredVals = filterSearch 
            ? allVals.filter(v => v.toLowerCase().includes(filterSearch.toLowerCase()))
            : allVals;

        const isSorted = sortConfig.key === header;
        const sortDir = sortConfig.direction;

        return (
            <th 
                className={`cart__th ${isCritical ? 'header-critical' : ''}`}
                style={{ 
                    position: 'relative', 
                    whiteSpace: 'nowrap',
                    paddingRight: '32px',
                    userSelect: 'none'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {/* Botón de ordenamiento */}
                    <span 
                        onClick={() => handleHeaderClick(header)}
                        style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                        {header}
                        {isSorted && (
                            sortDir === 'asc' ? <ChevronUp size={13} style={{ color: 'var(--primary-600)' }} /> : <ChevronDown size={13} style={{ color: 'var(--primary-600)' }} />
                        )}
                    </span>

                    {/* Badge de tipo para columnas clave */}
                    {isMappedFecha && (
                        <span style={{ fontSize: '0.62rem', background: '#FEF3C7', color: '#B45309', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>Fecha Evol.</span>
                    )}
                    {isMappedResp && (
                        <span style={{ fontSize: '0.62rem', background: '#DBEAFE', color: '#1D4ED8', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>Respuesta M.</span>
                    )}

                    {/* Icono de Filtro */}
                    <button 
                        onClick={() => toggleColumnFilterMenu(header)}
                        style={{
                            position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                            background: isOpen || isFiltered ? 'var(--primary-50)' : 'transparent',
                            color: isFiltered ? 'var(--primary-600)' : 'var(--neutral-400)',
                            padding: '3px', borderRadius: '4px',
                            border: isFiltered ? '1px solid var(--primary-200)' : 'none',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                    >
                        <ListFilter size={12} />
                    </button>
                </div>

                {isOpen && (
                    <>
                        <div 
                            onClick={() => setActiveFilterCol(null)}
                            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }}
                        />
                        <div style={{
                            position: 'absolute', top: '100%', left: 0, zIndex: 999,
                            marginTop: '4px', minWidth: '220px', maxWidth: '300px',
                            background: '#fff', borderRadius: '10px',
                            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0,0,0,0.05)',
                            padding: '10px', animation: 'fadeIn 0.15s ease-out',
                            textAlign: 'left'
                        }}>
                            {/* Buscar dentro del filtro */}
                            <div style={{ position: 'relative', marginBottom: '8px' }}>
                                <Search size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--neutral-400)' }} />
                                <input
                                    type="text"
                                    placeholder="Filtrar valores..."
                                    value={filterSearch}
                                    onChange={e => setFilterSearch(e.target.value)}
                                    style={{
                                        width: '100%', padding: '6px 8px 6px 26px',
                                        border: '1px solid var(--neutral-200)', borderRadius: '6px',
                                        fontSize: '0.75rem', outline: 'none',
                                    }}
                                    autoFocus
                                />
                            </div>

                            {/* Acciones Rápidas */}
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                                <button
                                    onClick={() => handleSelectAllColumnFilter(header, allVals)}
                                    style={{
                                        flex: 1, padding: '4px', borderRadius: '4px',
                                        border: '1px solid var(--neutral-200)', background: '#F9FAFB',
                                        fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer',
                                        color: 'var(--neutral-600)',
                                    }}
                                >Todos</button>
                                <button
                                    onClick={() => handleClearColumnFilter(header)}
                                    style={{
                                        flex: 1, padding: '4px', borderRadius: '4px',
                                        border: '1px solid var(--neutral-200)', background: '#F9FAFB',
                                        fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer',
                                        color: '#DC2626',
                                    }}
                                >Limpiar</button>
                            </div>

                            {/* Lista de Valores */}
                            <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--neutral-100)', borderRadius: '6px', padding: '4px' }}>
                                {filteredVals.length === 0 ? (
                                    <div style={{ padding: '8px', textAlign: 'center', fontSize: '0.72rem', color: 'var(--neutral-400)' }}>Sin coincidencias</div>
                                ) : filteredVals.map(val => {
                                    const checked = columnFilters[header] ? columnFilters[header].has(val) : false;
                                    return (
                                        <label
                                            key={val}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '8px',
                                                padding: '5px 6px', borderRadius: '4px',
                                                cursor: 'pointer', fontSize: '0.75rem', fontWeight: 500,
                                                color: 'var(--neutral-700)', transition: 'background 0.1s',
                                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                                            }}
                                            onMouseOver={e => e.currentTarget.style.background = '#F3F4F6'}
                                            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => handleSelectColumnFilterValue(header, val)}
                                                style={{ width: '14px', height: '14px', accentColor: 'var(--primary-500)', cursor: 'pointer' }}
                                            />
                                            <span>{val}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}
            </th>
        );
    };
    const totalObservados = kpis.total - kpis.ok;
    const onlyFecha = kpis.sinFecha - kpis.sinAmbos;
    const onlyRespuesta = kpis.sinRespuesta - kpis.sinAmbos;
    const pctFecha = totalObservados > 0 ? (onlyFecha / totalObservados) * 100 : 0;
    const pctRespuesta = totalObservados > 0 ? (onlyRespuesta / totalObservados) * 100 : 0;
    const pctAmbos = totalObservados > 0 ? (kpis.sinAmbos / totalObservados) * 100 : 0;

    const handleSubFilterClick = (e, targetFilter) => {
        e.stopPropagation();
        setKpiFilter(prev => prev === targetFilter ? 'observados' : targetFilter);
    };

    // Renderizado condicional del componente principal
    return (
        <div className="content no-print" style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', overflow: 'auto', height: '100%' }}>
            
            {/* ESTILOS INTERNOS LOCALES PARA HOVER, ANIMACIÓN Y RESALTADO */}
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes hcSpin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                @keyframes hcProgress {
                    0% { left: -35%; width: 35%; }
                    50% { left: 35%; width: 60%; }
                    100% { left: 100%; width: 35%; }
                }
                .auditoria-drag-zone {
                    border: 2px dashed rgba(30, 95, 166, 0.3);
                    border-radius: 16px;
                    background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
                    padding: 28px 24px;
                    text-align: center;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    cursor: pointer;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.02);
                    position: relative;
                    overflow: hidden;
                }
                .auditoria-drag-zone:hover {
                    border-color: #1e5fa6;
                    background: #f8fafc;
                    transform: translateY(-2px);
                    box-shadow: 0 10px 25px rgba(30, 95, 166, 0.06);
                }
                .auditoria-drag-zone--active {
                    border-color: var(--success-500);
                    background: var(--success-50);
                }
                
                /* KPI Cards style */
                .kpi-card {
                    flex: 1;
                    min-width: 190px;
                    padding: 18px;
                    border-radius: 16px;
                    background: #ffffff;
                    border: 1px solid rgba(0, 0, 0, 0.06);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    min-height: 125px;
                    position: relative;
                    overflow: hidden;
                }
                .kpi-card:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.06);
                }
                .kpi-card--active {
                    background: #ffffff;
                    box-shadow: 0 12px 24px rgba(30, 95, 166, 0.08) !important;
                }
                .kpi-card__title {
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: #64748b;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .kpi-card__main {
                    display: flex;
                    align-items: flex-end;
                    justify-content: space-between;
                    margin-top: 10px;
                }
                .kpi-card__value {
                    font-size: 2rem;
                    font-weight: 800;
                    color: #0f172a;
                    line-height: 1;
                }
                .kpi-card__icon-wrap {
                    width: 44px;
                    height: 44px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: transform 0.2s;
                }
                .kpi-card:hover .kpi-card__icon-wrap {
                    transform: scale(1.08);
                }
                .kpi-card__desc {
                    font-size: 0.72rem;
                    color: #94a3b8;
                    margin-top: 6px;
                }
                
                .kpi-card--all.kpi-card--active { border-bottom: 4px solid #1e5fa6; }
                .kpi-card--ok.kpi-card--active { border-bottom: 4px solid #10b981; }
                .kpi-card--observados {
                    flex: 1.6;
                    min-width: 320px;
                }
                .kpi-card--observados.kpi-card--active { border-bottom: 4px solid #ef4444; }
                .kpi-card--alta.kpi-card--active { border-bottom: 4px solid #f59e0b; }
                
                /* Segmented bar and legends for Observados */
                .observaciones-bar-container {
                    margin-top: 12px;
                    width: 100%;
                }
                .observaciones-bar {
                    height: 8px;
                    border-radius: 4px;
                    background: #f1f5f9;
                    display: flex;
                    overflow: hidden;
                    width: 100%;
                }
                .observaciones-segment {
                    height: 100%;
                    transition: all 0.3s ease;
                    cursor: pointer;
                }
                .observaciones-segment:hover {
                    opacity: 0.85;
                    transform: scaleY(1.2);
                }
                .observaciones-segment--fecha {
                    background-color: #f59e0b; /* Amber */
                }
                .observaciones-segment--respuesta {
                    background-color: #3b82f6; /* Blue */
                }
                .observaciones-segment--ambos {
                    background-color: #ef4444; /* Red */
                }
                
                .observaciones-legend {
                    display: flex;
                    gap: 12px;
                    margin-top: 10px;
                    flex-wrap: wrap;
                }
                .observaciones-legend-item {
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                    font-size: 0.68rem;
                    font-weight: 700;
                    color: #64748b;
                    cursor: pointer;
                    padding: 3px 8px;
                    border-radius: 6px;
                    transition: all 0.2s;
                    border: 1px solid transparent;
                }
                .observaciones-legend-item:hover {
                    background: #f1f5f9;
                    color: #0f172a;
                }
                
                .observaciones-legend-item--active-fecha {
                    background: #fef3c7 !important;
                    color: #b45309 !important;
                    border: 1px solid #fde68a;
                }
                .observaciones-legend-item--active-resp {
                    background: #e7f5ff !important;
                    color: #1c7ed6 !important;
                    border: 1px solid #d0ebff;
                }
                .observaciones-legend-item--active-ambos {
                    background: #fff5f5 !important;
                    color: #fa5252 !important;
                    border: 1px solid #ffe3e3;
                }
                
                .dot {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    display: inline-block;
                }
                .dot--fecha { background-color: #f59e0b; }
                .dot--respuesta { background-color: #3b82f6; }
                .dot--ambos { background-color: #ef4444; }

                /* Table styles */
                .table-cell-warning {
                    background-color: #fffbeb !important;
                    color: #d97706;
                }
                .table-cell-danger {
                    background-color: #fef2f2 !important;
                    color: #dc2626;
                }
                .table-cell-alta-warning {
                    background-color: #fff4e6 !important;
                    color: #d9480f;
                }
                .table-cell-empty-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 3px 8px;
                    border-radius: 6px;
                    font-size: 0.72rem;
                    font-weight: 700;
                    white-space: nowrap;
                }
                .table-cell-empty-badge--warning {
                    background: #fef3c7;
                    color: #b45309;
                }
                .table-cell-empty-badge--danger {
                    background: #fee2e2;
                    color: #b91c1c;
                }
                .table-cell-empty-badge--alta {
                    background: #ffe8cc;
                    color: #d9480f;
                }
                
                .cart__th.header-critical {
                    background-color: #F8FAFC;
                    border-bottom: 2px solid var(--primary-200);
                }
                
                /* Badges */
                .badge-status {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 4px 10px;
                    border-radius: 8px;
                    font-size: 0.72rem;
                    font-weight: 700;
                    letter-spacing: -0.1px;
                }
                .badge-status--ok {
                    background: #e6fcf5;
                    color: #0ca678;
                    border: 1px solid #c3fae8;
                }
                .badge-status--sin-fecha {
                    background: #fff9db;
                    color: #f59f00;
                    border: 1px solid #fff3bf;
                }
                .badge-status--sin-respuesta {
                    background: #e7f5ff;
                    color: #1c7ed6;
                    border: 1px solid #d0ebff;
                }
                .badge-status--sin-ambos {
                    background: #fff5f5;
                    color: #fa5252;
                    border: 1px solid #ffe3e3;
                }

                /* Estilos para el panel colapsable de estadísticas de omisiones */
                .stats-toggle-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 16px;
                    background: #ffffff;
                    border: 1px solid rgba(30, 95, 166, 0.15);
                    border-radius: 12px;
                    font-size: 0.78rem;
                    font-weight: 700;
                    color: #1e5fa6;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.01);
                }
                .stats-toggle-btn:hover {
                    background: #f1f7fc;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 8px rgba(30, 95, 166, 0.06);
                }
                .stats-section-container {
                    animation: slideDown 0.3s ease-out;
                    background: #ffffff;
                    border-radius: 16px;
                    border: 1px solid rgba(0, 0, 0, 0.06);
                    padding: 20px;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.02);
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .stats-charts-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
                    gap: 20px;
                }
                .stats-chart-card {
                    background: #f8fafc;
                    border-radius: 12px;
                    padding: 16px;
                    border: 1px solid rgba(0, 0, 0, 0.03);
                    min-height: 250px;
                }
                .stats-chart-title {
                    font-size: 0.8rem;
                    font-weight: 700;
                    color: #334155;
                    margin-bottom: 12px;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}} />

            {/* ── TITULO Y CABECERA ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h2 style={{ 
                        margin: 0, fontSize: '1.35rem', fontWeight: 800,
                        color: 'var(--neutral-800)', letterSpacing: '-0.3px',
                        display: 'flex', alignItems: 'center', gap: '10px',
                    }}>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '10px',
                            background: 'linear-gradient(135deg, #1E5FA6, #184D87)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontSize: '1rem',
                        }}><FileSpreadsheet size={18} /></div>
                        Auditoría de Historias Clínicas
                    </h2>
                    <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--neutral-400)' }}>
                        Control de Fecha de Evolución y Respuestas Médicas en admisiones hospitalarias
                    </p>
                </div>

                {fileName && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {availableMonths.length > 0 && (
                            <select
                                value={selectedMonthFilter}
                                onChange={(e) => {
                                    setSelectedMonthFilter(e.target.value);
                                    setPatientPage(1);
                                    setCurrentPage(1);
                                }}
                                style={{
                                    padding: '8px 14px', borderRadius: '10px',
                                    background: '#fff', color: 'var(--primary-700)',
                                    border: '1px solid rgba(30, 95, 166, 0.25)',
                                    fontSize: '0.85rem', fontWeight: 700,
                                    cursor: 'pointer', outline: 'none',
                                    appearance: 'none',
                                    minWidth: '150px'
                                }}
                                onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                                onMouseOut={e => e.currentTarget.style.background = '#fff'}
                            >
                                <option value="all">📅 Todos los Meses</option>
                                {availableMonths.map(m => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </select>
                        )}
                        <button
                            onClick={() => setShowStats(prev => !prev)}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                padding: '8px 14px', borderRadius: '10px',
                                background: showStats ? '#EBF2FA' : '#fff', color: '#1e5fa6',
                                border: '1px solid rgba(30, 95, 166, 0.25)',
                                fontSize: '0.78rem', fontWeight: 600,
                                cursor: 'pointer', transition: 'all 0.2s',
                            }}
                            onMouseOver={e => e.currentTarget.style.background = '#f1f7fc'}
                            onMouseOut={e => e.currentTarget.style.background = showStats ? '#EBF2FA' : '#fff'}
                        >
                            <FileText size={14} />
                            {showStats ? 'Ocultar Analíticas' : 'Ver Estadísticas'}
                        </button>
                        <button
                            onClick={handleExportPdf}
                            disabled={sortedRows.length === 0}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                padding: '8px 14px', borderRadius: '10px',
                                background: '#1e5fa6', color: '#fff',
                                border: 'none', fontSize: '0.78rem', fontWeight: 600,
                                cursor: 'pointer', transition: 'all 0.2s',
                                boxShadow: '0 2px 8px rgba(30, 95, 166, 0.25)',
                                opacity: sortedRows.length === 0 ? 0.6 : 1
                            }}
                            onMouseOver={e => { if (sortedRows.length > 0) e.currentTarget.style.background = '#184d87'; }}
                            onMouseOut={e => { if (sortedRows.length > 0) e.currentTarget.style.background = '#1e5fa6'; }}
                        >
                            <FileText size={14} />
                            Imprimir PDF Clínico
                        </button>
                        <button
                            onClick={exportAuditedExcel}
                            disabled={sortedRows.length === 0}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                padding: '8px 14px', borderRadius: '10px',
                                background: '#10B981', color: '#fff',
                                border: 'none', fontSize: '0.78rem', fontWeight: 600,
                                cursor: 'pointer', transition: 'all 0.2s',
                                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)',
                                opacity: sortedRows.length === 0 ? 0.6 : 1
                            }}
                            onMouseOver={e => { if (sortedRows.length > 0) e.currentTarget.style.background = '#059669'; }}
                            onMouseOut={e => { if (sortedRows.length > 0) e.currentTarget.style.background = '#10B981'; }}
                        >
                            <Download size={14} />
                            Exportar Reporte
                        </button>
                        <button
                            onClick={handleClearData}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                padding: '8px 14px', borderRadius: '10px',
                                background: '#fff', color: '#DC2626',
                                border: '1px solid #DC262630',
                                fontSize: '0.78rem', fontWeight: 600,
                                cursor: 'pointer', transition: 'all 0.2s',
                            }}
                            onMouseOver={e => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.borderColor = '#DC2626'; }}
                            onMouseOut={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#DC262630'; }}
                        >
                            <Trash2 size={14} />
                            Limpiar
                        </button>
                    </div>
                )}
            </div>

            {/* ── CARGA DE ARCHIVO (VISTA VACÍA) ── */}
            {!fileName && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '650px', margin: '40px auto', width: '100%' }}>
                    <div 
                        className={`auditoria-drag-zone ${dragOver ? 'auditoria-drag-zone--active' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input 
                            ref={fileInputRef}
                            type="file" 
                            accept=".xlsx,.xls,.csv" 
                            onChange={handleExcelSelect} 
                            style={{ display: 'none' }} 
                        />
                        {loading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                                <RefreshCw size={36} className="animate-spin" style={{ color: 'var(--primary-500)', animation: 'spin 1.5s linear infinite' }} />
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--neutral-700)' }}>Procesando archivo...</h3>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--neutral-400)' }}>Leyendo hojas y analizando registros</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                                <div style={{ 
                                    width: '56px', height: '56px', borderRadius: '50%',
                                    background: 'var(--primary-50)', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', color: 'var(--primary-500)',
                                    marginBottom: '8px'
                                }}>
                                    <Upload size={24} />
                                </div>
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--neutral-700)' }}>
                                    Cargar Planilla de Historias Clínicas
                                </h3>
                                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--neutral-400)', maxWidth: '380px', lineHeight: 1.5 }}>
                                    Arrastrá tu archivo Excel <strong style={{ color: 'var(--neutral-600)' }}>.xlsx, .xls</strong> o <strong style={{ color: 'var(--neutral-600)' }}>.csv</strong> aquí, o haz clic para buscar en tu computadora.
                                </p>
                            </div>
                        )}
                    </div>

                    <div style={{
                        padding: '16px', borderRadius: 'var(--radius-lg)',
                        background: 'rgba(235, 242, 250, 0.4)', border: '1px solid var(--primary-100)',
                        display: 'flex', gap: '12px', alignItems: 'flex-start'
                    }}>
                        <ShieldAlert size={18} style={{ color: 'var(--primary-600)', flexShrink: 0, marginTop: '2px' }} />
                        <div style={{ fontSize: '0.78rem', color: 'var(--primary-800)', lineHeight: 1.5 }}>
                            <strong>Privacidad y Seguridad Local:</strong> La planilla se lee de manera local directamente en tu navegador. Tus datos no se suben a ningún servidor externo de internet, cumpliendo con los estándares de confidencialidad de Sanatorio Argentino.
                        </div>
                    </div>
                </div>
            )}

            {/* ── MÓDULO ACTIVO CON PLANILLA CARGADA ── */}
            {fileName && (
                <>
                    {/* BARRA DE ARCHIVO CARGADO INFO */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '12px 18px', borderRadius: '12px',
                        background: 'var(--neutral-0)', border: '1px solid var(--neutral-200)',
                        boxShadow: 'var(--shadow-sm)'
                    }}>
                        <FileSpreadsheet size={20} style={{ color: '#10B981', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--neutral-700)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                {fileName}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--neutral-400)', display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '2px' }}>
                                <span>Filas totales: <strong>{originalRows.length}</strong></span>
                                <span>•</span>
                                <span>Evolución mapeada en: <strong style={{ color: 'var(--neutral-600)' }}>{columnMapping.fechaEvolucion || 'No detectada'}</strong></span>
                                <span>•</span>
                                <span>Respuesta mapeada en: <strong style={{ color: 'var(--neutral-600)' }}>{columnMapping.valorRespuestaMedica || 'No detectada'}</strong></span>
                            </div>
                        </div>
                    </div>

                    {/* TARJETAS KPI DE ACCESO RÁPIDO / FILTROS */}
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', width: '100%' }}>
                        {/* 1. Todos */}
                        <div 
                            className={`kpi-card kpi-card--all ${kpiFilter === 'all' ? 'kpi-card--active' : ''}`}
                            onClick={() => setKpiFilter('all')}
                        >
                            <div>
                                <span className="kpi-card__title">Total Admisiones</span>
                                <div className="kpi-card__main">
                                    <span className="kpi-card__value">{kpis.totalAdmisiones}</span>
                                    <div className="kpi-card__icon-wrap" style={{ background: 'rgba(30, 95, 166, 0.08)', color: '#1e5fa6' }}>
                                        <FileSpreadsheet size={20} />
                                    </div>
                                </div>
                            </div>
                            <span className="kpi-card__desc">Ciclos de internación (de {kpis.total} filas)</span>
                        </div>

                        {/* 2. OK */}
                        <div 
                            className={`kpi-card kpi-card--ok ${kpiFilter === 'ok' ? 'kpi-card--active' : ''}`}
                            onClick={() => setKpiFilter('ok')}
                        >
                            <div>
                                <span className="kpi-card__title">Auditoría OK</span>
                                <div className="kpi-card__main">
                                    <span className="kpi-card__value" style={{ color: '#0ca678' }}>{kpis.ok}</span>
                                    <div className="kpi-card__icon-wrap" style={{ background: '#e6fcf5', color: '#0ca678' }}>
                                        <CheckCircle size={20} />
                                    </div>
                                </div>
                            </div>
                            <span className="kpi-card__desc">Evolución y respuesta válidas</span>
                        </div>

                        {/* 3. Casos Observados */}
                        <div 
                            className={`kpi-card kpi-card--observados ${['observados', 'sin_fecha', 'sin_respuesta', 'sin_ambos'].includes(kpiFilter) ? 'kpi-card--active' : ''}`}
                            onClick={() => setKpiFilter(kpiFilter === 'observados' ? 'all' : 'observados')}
                        >
                            <div>
                                <span className="kpi-card__title">Casos Observados</span>
                                <div className="kpi-card__main" style={{ marginTop: '4px' }}>
                                    <span className="kpi-card__value" style={{ color: '#ef4444' }}>{totalObservados}</span>
                                    <div className="kpi-card__icon-wrap" style={{ background: '#fef2f2', color: '#ef4444' }}>
                                        <ShieldAlert size={20} />
                                    </div>
                                </div>
                                
                                {/* Tricolor Segmented Progress Bar */}
                                <div className="observaciones-bar-container" onClick={(e) => e.stopPropagation()}>
                                    <div className="observaciones-bar">
                                        {onlyFecha > 0 && (
                                            <div 
                                                className="observaciones-segment observaciones-segment--fecha" 
                                                style={{ width: `${pctFecha}%` }} 
                                                title={`Falta Fecha: ${onlyFecha}`}
                                                onClick={(e) => handleSubFilterClick(e, 'sin_fecha')}
                                            />
                                        )}
                                        {onlyRespuesta > 0 && (
                                            <div 
                                                className="observaciones-segment observaciones-segment--respuesta" 
                                                style={{ width: `${pctRespuesta}%` }} 
                                                title={`Falta Respuesta: ${onlyRespuesta}`}
                                                onClick={(e) => handleSubFilterClick(e, 'sin_respuesta')}
                                            />
                                        )}
                                        {kpis.sinAmbos > 0 && (
                                            <div 
                                                className="observaciones-segment observaciones-segment--ambos" 
                                                style={{ width: `${pctAmbos}%` }} 
                                                title={`Faltan Ambos: ${kpis.sinAmbos}`}
                                                onClick={(e) => handleSubFilterClick(e, 'sin_ambos')}
                                            />
                                        )}
                                        {totalObservados === 0 && (
                                            <div 
                                                className="observaciones-segment" 
                                                style={{ width: '100%', backgroundColor: '#10b981' }} 
                                                title="Sin observaciones"
                                            />
                                        )}
                                    </div>
                                </div>

                                {/* Tricolor Legend */}
                                {totalObservados > 0 && (
                                    <div className="observaciones-legend">
                                        <div 
                                            className={`observaciones-legend-item ${kpiFilter === 'sin_fecha' ? 'observaciones-legend-item--active-fecha' : ''}`}
                                            onClick={(e) => handleSubFilterClick(e, 'sin_fecha')}
                                        >
                                            <span className="dot dot--fecha" /> Sin Fecha ({onlyFecha})
                                        </div>
                                        <div 
                                            className={`observaciones-legend-item ${kpiFilter === 'sin_respuesta' ? 'observaciones-legend-item--active-resp' : ''}`}
                                            onClick={(e) => handleSubFilterClick(e, 'sin_respuesta')}
                                        >
                                            <span className="dot dot--respuesta" /> Sin Resp. ({onlyRespuesta})
                                        </div>
                                        <div 
                                            className={`observaciones-legend-item ${kpiFilter === 'sin_ambos' ? 'observaciones-legend-item--active-ambos' : ''}`}
                                            onClick={(e) => handleSubFilterClick(e, 'sin_ambos')}
                                        >
                                            <span className="dot dot--ambos" /> Ambos ({kpis.sinAmbos})
                                        </div>
                                    </div>
                                )}
                            </div>
                            {totalObservados === 0 && (
                                <span className="kpi-card__desc" style={{ color: '#10b981', fontWeight: 600 }}>Planilla 100% Correcta</span>
                            )}
                        </div>

                        {/* 4. Sin Fecha de Alta */}
                        <div 
                            className={`kpi-card kpi-card--alta ${kpiFilter === 'sin_alta' ? 'kpi-card--active' : ''}`}
                            onClick={() => {
                                if (columnMapping.fechaAlta) {
                                    setKpiFilter(kpiFilter === 'sin_alta' ? 'all' : 'sin_alta');
                                }
                            }}
                            style={{
                                opacity: columnMapping.fechaAlta ? 1 : 0.6,
                                cursor: columnMapping.fechaAlta ? 'pointer' : 'not-allowed'
                            }}
                            title={columnMapping.fechaAlta ? 'Filtrar por pacientes sin fecha de alta' : 'Columna Fecha de Alta no detectada'}
                        >
                            <div>
                                <span className="kpi-card__title">Sin Fecha de Alta</span>
                                <div className="kpi-card__main">
                                    <span className="kpi-card__value" style={{ color: '#d97706' }}>
                                        {columnMapping.fechaAlta ? kpis.sinAlta : '—'}
                                    </span>
                                    <div className="kpi-card__icon-wrap" style={{ background: '#fef3c7', color: '#d97706' }}>
                                        <AlertTriangle size={20} />
                                    </div>
                                </div>
                            </div>
                            <span className="kpi-card__desc">
                                {columnMapping.fechaAlta ? 'Pacientes activos/sin alta' : 'Columna no detectada'}
                            </span>
                        </div>
                    </div>

                    {/* TARJETAS KPI DE IMPACTO FINANCIERO OSP */}
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', width: '100%', marginTop: '16px' }}>
                        {/* 1. Gaps */}
                        <div 
                            className="kpi-card"
                            style={{ borderLeft: '4px solid #F59E0B' }}
                        >
                            <div>
                                <span className="kpi-card__title">Días sin Evolución (Gaps)</span>
                                <div className="kpi-card__main">
                                    <span className="kpi-card__value">{kpis.totalGaps}</span>
                                    <div className="kpi-card__icon-wrap" style={{ background: '#FEF3C7', color: '#D97706' }}>
                                        <Calendar size={20} />
                                    </div>
                                </div>
                            </div>
                            <span className="kpi-card__desc">Días de internación sin evolución registrada. Riesgo de glosa.</span>
                        </div>

                        {/* 2. Duplicados */}
                        <div 
                            className="kpi-card"
                            style={{ borderLeft: '4px solid #3B82F6' }}
                        >
                            <div>
                                <span className="kpi-card__title">Evoluciones Repetitivas</span>
                                <div className="kpi-card__main">
                                    <span className="kpi-card__value">{kpis.totalDuplicados}</span>
                                    <div className="kpi-card__icon-wrap" style={{ background: '#DBEAFE', color: '#1D4ED8' }}>
                                        <Copy size={20} />
                                    </div>
                                </div>
                            </div>
                            <span className="kpi-card__desc">Días consecutivos con textos idénticos o muy similares.</span>
                        </div>
                    </div>

                    {/* CONMUTADOR DE VISTAS */}
                    <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        borderBottom: '1px solid var(--neutral-200)',
                        paddingBottom: '10px',
                        marginTop: '16px'
                    }}>
                        <div style={{ display: 'flex', gap: '8px', background: '#F1F5F9', padding: '4px', borderRadius: '10px' }}>
                            <button
                                onClick={() => setViewMode('planilla')}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: viewMode === 'planilla' ? '#fff' : 'transparent',
                                    color: viewMode === 'planilla' ? '#1e5fa6' : 'var(--neutral-500)',
                                    boxShadow: viewMode === 'planilla' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <FileSpreadsheet size={16} />
                                Planilla General (Tabla)
                            </button>
                            <button
                                onClick={() => setViewMode('pacientes')}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: viewMode === 'pacientes' ? '#fff' : 'transparent',
                                    color: viewMode === 'pacientes' ? '#1e5fa6' : 'var(--neutral-500)',
                                    boxShadow: viewMode === 'pacientes' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <Calendar size={16} />
                                Auditoría por Paciente (Ciclos)
                            </button>
                        </div>

                        {viewMode === 'pacientes' && (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--neutral-500)', fontWeight: 600 }}>Filtrar Riesgo:</span>
                                <div style={{ display: 'flex', gap: '4px', background: '#F1F5F9', padding: '3px', borderRadius: '8px' }}>
                                    {[
                                        { id: 'all', label: 'Todos' },
                                        { id: 'high', label: 'Crítico', color: '#EF4444' },
                                        { id: 'medium', label: 'Medio', color: '#F59E0B' },
                                        { id: 'low', label: 'Sin Riesgo', color: '#10B981' }
                                    ].map(filter => (
                                        <button
                                            key={filter.id}
                                            onClick={() => { setPatientRiskFilter(filter.id); setPatientPage(1); }}
                                            style={{
                                                padding: '4px 10px',
                                                borderRadius: '6px',
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                border: 'none',
                                                cursor: 'pointer',
                                                background: patientRiskFilter === filter.id ? '#fff' : 'transparent',
                                                color: patientRiskFilter === filter.id 
                                                    ? (filter.color || '#1e5fa6') 
                                                    : 'var(--neutral-500)',
                                                boxShadow: patientRiskFilter === filter.id ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {filter.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* PANEL DE ANÁLISIS ESTADÍSTICO DE OMISIONES (Recharts) */}
                    {showStats && (
                        <div className="stats-section-container">
                            {/* CABECERA Y SELECCIÓN DE PESTAÑAS */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--neutral-200)', paddingBottom: '12px', marginBottom: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <AlertCircle size={16} style={{ color: '#1e5fa6' }} />
                                    <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: '#1e5fa6' }}>
                                        Centro de Mando Analítico
                                    </h3>
                                </div>

                                {/* Botones de Pestañas */}
                                <div style={{ display: 'flex', gap: '4px', background: '#F1F5F9', padding: '3px', borderRadius: '8px' }}>
                                    {[
                                        { id: 'resumen', label: 'Calidad & Resumen' },
                                        { id: 'distribucion', label: 'Distribución' },
                                        { id: 'tendencias', label: 'Tendencias' },
                                        { id: 'avanzado', label: 'Avanzado' }
                                    ].map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: '6px',
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                border: 'none',
                                                cursor: 'pointer',
                                                background: activeTab === tab.id ? '#fff' : 'transparent',
                                                color: activeTab === tab.id ? '#1e5fa6' : 'var(--neutral-500)',
                                                boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* CONTENIDO DE PESTAÑAS */}
                            {activeTab === 'resumen' && (
                                <div className="stats-charts-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                                    {/* Gráfico 1: Score de Calidad */}
                                    <div className="stats-chart-card">
                                        <div className="stats-chart-title">Indicador de Completitud General</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '180px', position: 'relative' }}>
                                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <PieChart>
                                                        <Pie
                                                            data={[
                                                                { value: statsData.qualityScore, fill: '#10b981' },
                                                                { value: 100 - statsData.qualityScore, fill: '#E2E8F0' }
                                                            ]}
                                                            cx="50%"
                                                            cy="70%"
                                                            startAngle={180}
                                                            endAngle={0}
                                                            innerRadius={55}
                                                            outerRadius={75}
                                                            dataKey="value"
                                                        />
                                                    </PieChart>
                                                </ResponsiveContainer>
                                                <div style={{ position: 'absolute', bottom: '25%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1e5fa6' }}>{statsData.qualityScore}%</span>
                                                    <span style={{ fontSize: '0.62rem', color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 700 }}>Historias OK</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Gráfico 2: Distribución (Donut) */}
                                    <div className="stats-chart-card">
                                        <div className="stats-chart-title">Distribución de Auditoría</div>
                                        <div style={{ width: '100%', height: '180px' }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={statsData.pieData}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={40}
                                                        outerRadius={60}
                                                        paddingAngle={3}
                                                        dataKey="value"
                                                    >
                                                        {statsData.pieData.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip contentStyle={{ fontSize: '0.7rem', borderRadius: '6px' }} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* Gráfico 3: Embudo de Calidad */}
                                    <div className="stats-chart-card">
                                        <div className="stats-chart-title">Embudo de Pérdida de Calidad</div>
                                        <div style={{ width: '100%', height: '180px' }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={statsData.funnelData} layout="vertical" margin={{ top: 5, right: 15, bottom: 5, left: 10 }}>
                                                    <XAxis type="number" fontSize={9} stroke="#94a3b8" />
                                                    <YAxis type="category" dataKey="stage" fontSize={9} stroke="#94a3b8" width={80} />
                                                    <Tooltip contentStyle={{ fontSize: '0.7rem', borderRadius: '6px' }} />
                                                    <Bar dataKey="valor" radius={[0, 4, 4, 0]} barSize={12}>
                                                        {statsData.funnelData.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'distribucion' && (
                                <div className="stats-charts-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                                    {/* Gráfico 4: Especialidad */}
                                    <div className="stats-chart-card">
                                        <div className="stats-chart-title">Omisiones por Especialidad</div>
                                        {columnMapping.especialidad && statsData.bySpecialty.length > 0 ? (
                                            <div style={{ width: '100%', height: '180px' }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={statsData.bySpecialty} layout="vertical" margin={{ top: 5, right: 15, bottom: 5, left: 10 }}>
                                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.04)" />
                                                        <XAxis type="number" fontSize={10} stroke="#94a3b8" />
                                                        <YAxis type="category" dataKey="name" fontSize={9} stroke="#94a3b8" width={85} />
                                                        <Tooltip contentStyle={{ fontSize: '0.7rem', borderRadius: '6px' }} />
                                                        <Bar dataKey="omisiones" name="Omisiones" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={10} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '180px', fontSize: '0.75rem', color: 'var(--neutral-400)' }}>
                                                Sin datos o columna no mapeada
                                            </div>
                                        )}
                                    </div>

                                    {/* Gráfico 5: Serie de Admisión */}
                                    <div className="stats-chart-card">
                                        <div className="stats-chart-title">Omisiones por Serie de Admisión</div>
                                        {columnMapping.serieAdmision && statsData.bySerie.length > 0 ? (
                                            <div style={{ width: '100%', height: '180px' }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={statsData.bySerie} layout="vertical" margin={{ top: 5, right: 15, bottom: 5, left: 10 }}>
                                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.04)" />
                                                        <XAxis type="number" fontSize={10} stroke="#94a3b8" />
                                                        <YAxis type="category" dataKey="name" fontSize={9} stroke="#94a3b8" width={85} />
                                                        <Tooltip contentStyle={{ fontSize: '0.7rem', borderRadius: '6px' }} />
                                                        <Bar dataKey="omisiones" name="Omisiones" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={10} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '180px', fontSize: '0.75rem', color: 'var(--neutral-400)' }}>
                                                Sin datos o columna no mapeada
                                            </div>
                                        )}
                                    </div>

                                    {/* Gráfico 6: Habitación */}
                                    <div className="stats-chart-card">
                                        <div className="stats-chart-title">Omisiones por Habitación / Sector</div>
                                        {columnMapping.habitacion && statsData.byRoom.length > 0 ? (
                                            <div style={{ width: '100%', height: '180px' }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={statsData.byRoom} layout="vertical" margin={{ top: 5, right: 15, bottom: 5, left: 10 }}>
                                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.04)" />
                                                        <XAxis type="number" fontSize={10} stroke="#94a3b8" />
                                                        <YAxis type="category" dataKey="name" fontSize={9} stroke="#94a3b8" width={85} />
                                                        <Tooltip contentStyle={{ fontSize: '0.7rem', borderRadius: '6px' }} />
                                                        <Bar dataKey="omisiones" name="Omisiones" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={10} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '180px', fontSize: '0.75rem', color: 'var(--neutral-400)' }}>
                                                Sin datos o columna no mapeada
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'tendencias' && (
                                <div className="stats-charts-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                                    {/* Gráfico 7: Evolución Temporal */}
                                    <div className="stats-chart-card">
                                        <div className="stats-chart-title">Evolución de Omisiones por Fecha</div>
                                        <div style={{ width: '100%', height: '180px' }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={statsData.temporalData} margin={{ top: 10, right: 15, bottom: 5, left: 5 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.04)" />
                                                    <XAxis dataKey="date" fontSize={9} stroke="#94a3b8" />
                                                    <YAxis fontSize={9} stroke="#94a3b8" />
                                                    <Tooltip contentStyle={{ fontSize: '0.7rem', borderRadius: '6px' }} />
                                                    <Line type="monotone" dataKey="omisiones" name="Omisiones" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* Gráfico 8: Carga vs Omisiones (Composed) */}
                                    <div className="stats-chart-card">
                                        <div className="stats-chart-title">Carga de Admisiones vs Tasa de Omisión</div>
                                        <div style={{ width: '100%', height: '180px' }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <ComposedChart data={statsData.temporalData} margin={{ top: 10, right: 15, bottom: 5, left: 5 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.04)" />
                                                    <XAxis dataKey="date" fontSize={9} stroke="#94a3b8" />
                                                    <YAxis fontSize={9} stroke="#94a3b8" />
                                                    <Tooltip contentStyle={{ fontSize: '0.7rem', borderRadius: '6px' }} />
                                                    <Bar dataKey="total" name="Total Admisiones" fill="rgba(30, 95, 166, 0.2)" radius={[3, 3, 0, 0]} barSize={15} />
                                                    <Line type="monotone" dataKey="omisiones" name="Omisiones" stroke="#eab308" strokeWidth={2} dot={{ r: 2 }} />
                                                </ComposedChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'avanzado' && (
                                <div className="stats-charts-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                                    {/* Gráfico 9: Treemap Especialidad */}
                                    <div className="stats-chart-card">
                                        <div className="stats-chart-title">Densidad de Omisiones por Especialidad</div>
                                        <div style={{ width: '100%', height: '180px', overflow: 'hidden' }}>
                                            {statsData.treemapData.length > 0 ? (
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <Treemap
                                                        data={statsData.treemapData}
                                                        dataKey="size"
                                                        aspectRatio={4/3}
                                                        stroke="#fff"
                                                        fill="#1e5fa6"
                                                    />
                                                </ResponsiveContainer>
                                            ) : (
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '0.75rem', color: 'var(--neutral-400)' }}>
                                                    Sin datos de omisión para graficar
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Gráfico 10: Scatter de Distribución */}
                                    <div className="stats-chart-card">
                                        <div className="stats-chart-title">Distribución de Calidad por Fila Original</div>
                                        <div style={{ width: '100%', height: '180px' }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <ScatterChart margin={{ top: 10, right: 15, bottom: 5, left: 5 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                                                    <XAxis type="number" dataKey="fila" name="Fila" fontSize={9} stroke="#94a3b8" />
                                                    <YAxis 
                                                        type="number" 
                                                        dataKey="estado" 
                                                        name="Estado" 
                                                        domain={[0, 3]} 
                                                        ticks={[0, 1, 2, 3]}
                                                        tickFormatter={(v) => v === 3 ? 'OK' : v === 2 ? 'S.Resp' : v === 1 ? 'S.Fec' : 'S.Ambos'}
                                                        fontSize={9} 
                                                        stroke="#94a3b8" 
                                                    />
                                                    <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ fontSize: '0.7rem' }} />
                                                    <Scatter name="Casos" data={statsData.scatterData} fill="#1e5fa6" />
                                                </ScatterChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {viewMode === 'planilla' ? (
                        <>
                            {/* BARRA DE FILTRADO ADICIONAL */}
                            <div style={{
                                display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap',
                                padding: '10px 14px', borderRadius: '12px',
                                background: '#FAFAFA', border: '1px solid var(--neutral-200)',
                            }}>
                                {/* Buscador general */}
                                <div style={{ flex: 1, position: 'relative', minWidth: '220px' }}>
                                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--neutral-400)' }} />
                                    <input
                                        type="text"
                                        placeholder="Buscar en todas las celdas..."
                                        value={searchTerm}
                                        onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                                        style={{
                                            width: '100%', padding: '8px 10px 8px 32px',
                                            borderRadius: '8px', border: '1px solid var(--neutral-200)',
                                            fontSize: '0.8rem', color: 'var(--neutral-700)',
                                            outline: 'none', transition: 'border-color 0.2s',
                                            background: '#fff'
                                        }}
                                        onFocus={e => e.currentTarget.style.borderColor = 'var(--primary-400)'}
                                        onBlur={e => e.currentTarget.style.borderColor = 'var(--neutral-200)'}
                                    />
                                </div>

                                {/* Indicador de filtros de columna activos */}
                                {(activeFiltersCount > 0 || searchTerm || kpiFilter !== 'all') && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--neutral-500)', fontWeight: 600 }}>
                                            Filtrado activo ({totalFiltered} registros de {originalRows.length})
                                        </span>
                                        <button
                                            onClick={handleClearAllFilters}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                padding: '6px 12px', borderRadius: '8px',
                                                background: '#FEE2E2', color: '#DC2626',
                                                border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700,
                                                transition: 'all 0.15s'
                                            }}
                                            onMouseOver={e => e.currentTarget.style.background = '#FCA5A5'}
                                            onMouseOut={e => e.currentTarget.style.background = '#FEE2E2'}
                                        >
                                            <X size={12} /> Limpiar Filtros
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Mensaje descriptivo Planilla General */}
                            <div style={{ marginBottom: '16px', fontSize: '0.8rem', color: 'var(--neutral-600)', background: 'var(--primary-50)', padding: '10px 14px', borderRadius: '8px', borderLeft: '4px solid var(--primary-400)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Info size={16} style={{ color: 'var(--primary-600)' }} />
                                Esta vista te muestra de forma detallada, fila por fila, el contenido original del Excel importado. Ideal para usar los filtros avanzados por columna y auditar datos crudos.
                            </div>

                            {/* CONTENEDOR DE TABLA ESTILO EXCEL */}
                            <div className="cart" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: '800px' }}>
                                <div className="cart__table-wrapper" style={{ overflow: 'auto', flex: 1 }}>
                                    <table className="cart__table" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                                        <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                                            <tr>
                                                <th className="cart__th" style={{ width: '60px', textAlign: 'center', background: '#F8FAFC' }}>Fila Excel</th>
                                                <th className="cart__th" style={{ width: '130px', background: '#F8FAFC' }}>Estado Auditoría</th>
                                                {headers.map(header => (
                                                    <TableHeaderCell key={header} header={header} />
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paginatedRows.length === 0 ? (
                                                <tr>
                                                    <td colSpan={headers.length + 2} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--neutral-400)' }}>
                                                        <AlertTriangle size={36} strokeWidth={1.2} style={{ color: 'var(--neutral-300)', marginBottom: '8px' }} />
                                                        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700 }}>Sin resultados</h3>
                                                        <p style={{ margin: 0, fontSize: '0.78rem' }}>Ajusta la búsqueda o los filtros para mostrar registros.</p>
                                                    </td>
                                                </tr>
                                            ) : (
                                                paginatedRows.map((row) => {
                                                    const status = row._auditStatus;
                                                    let badgeClass = 'badge-status--ok';
                                                    let badgeLabel = 'Completo OK';
                                                    if (status === 'SIN_AMBOS') {
                                                        badgeClass = 'badge-status--sin-ambos';
                                                        badgeLabel = 'Falta Ambos';
                                                    } else if (status === 'SIN_FECHA') {
                                                        badgeClass = 'badge-status--sin-fecha';
                                                        badgeLabel = 'Falta Fecha';
                                                    } else if (status === 'SIN_RESPUESTA') {
                                                        badgeClass = 'badge-status--sin-respuesta';
                                                        badgeLabel = 'Falta Respuesta';
                                                    } else if (status === 'RIESGO_DUPLICADO') {
                                                        badgeClass = 'badge-status--sin-fecha';
                                                        badgeLabel = 'Repetido';
                                                    }

                                                    return (
                                                        <tr key={row._origIndex} className="cart__row">
                                                            <td className="cart__td" style={{ textAlign: 'center', fontWeight: 700, color: 'var(--neutral-400)', background: 'var(--neutral-50)' }}>
                                                                {row._origIndex}
                                                            </td>
                                                            <td className="cart__td" style={{ background: 'var(--neutral-50)' }}>
                                                                <span className={`badge-status ${badgeClass}`}>
                                                                    {badgeLabel}
                                                                </span>
                                                            </td>
                                                            {headers.map(header => {
                                                                const isFechaCol = header === columnMapping.fechaEvolucion;
                                                                const isRespCol = header === columnMapping.valorRespuestaMedica;
                                                                const isAltaCol = header === columnMapping.fechaAlta;
                                                                const valRaw = row[header];
                                                                const isEmpty = isNullOrEmpty(valRaw);
                                                                let cellClass = '';
                                                                if (isFechaCol && isEmpty) {
                                                                    cellClass = 'table-cell-warning';
                                                                } else if (isRespCol && isEmpty) {
                                                                    cellClass = 'table-cell-danger';
                                                                } else if (isAltaCol && isEmpty) {
                                                                    cellClass = 'table-cell-alta-warning';
                                                                }
                                                                const displayVal = String(valRaw || '');
                                                                return (
                                                                    <td 
                                                                        key={header} 
                                                                        className={`cart__td ${cellClass}`}
                                                                        style={{ 
                                                                            maxWidth: '240px', 
                                                                            overflow: 'hidden', 
                                                                            textOverflow: 'ellipsis', 
                                                                            whiteSpace: 'nowrap',
                                                                            padding: isEmpty ? '6px 12px' : '10px 12px',
                                                                        }}
                                                                        title={isEmpty ? 'Sin registrar' : displayVal}
                                                                    >
                                                                        {isEmpty ? (
                                                                            isFechaCol ? (
                                                                                <span className="table-cell-empty-badge table-cell-empty-badge--warning">
                                                                                    <AlertTriangle size={11} /> Sin Fecha
                                                                                </span>
                                                                            ) : isRespCol ? (
                                                                                <span className="table-cell-empty-badge table-cell-empty-badge--danger">
                                                                                    <AlertCircle size={11} /> Sin Respuesta
                                                                                </span>
                                                                            ) : isAltaCol ? (
                                                                                <span className="table-cell-empty-badge table-cell-empty-badge--alta">
                                                                                    <AlertTriangle size={11} /> Sin Alta
                                                                                </span>
                                                                            ) : (
                                                                                <span style={{ color: 'var(--neutral-300)', fontStyle: 'italic', fontSize: '0.75rem' }}>Vacío</span>
                                                                            )
                                                                        ) : (
                                                                            displayVal
                                                                        )}
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* PIE DE TABLA / PAGINACIÓN */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '10px 18px', borderTop: '1px solid var(--neutral-200)',
                                    background: '#F8FAFC', flexWrap: 'wrap', gap: '10px', fontSize: '0.8rem'
                                }}>
                                    <div>
                                        Mostrando <strong>{totalFiltered === 0 ? 0 : (currentPage - 1) * pageSize + 1}</strong> a <strong>{pageSize === -1 ? totalFiltered : Math.min(currentPage * pageSize, totalFiltered)}</strong> de <strong>{totalFiltered}</strong> registros
                                        {(activeFiltersCount > 0 || kpiFilter !== 'all' || searchTerm) && (
                                            <span style={{ color: 'var(--neutral-400)', marginLeft: '6px' }}>(filtrado de {originalRows.length} en total)</span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ color: 'var(--neutral-500)' }}>Filas:</span>
                                            <select
                                                value={pageSize}
                                                onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                                                style={{
                                                    padding: '4px 8px', borderRadius: '6px',
                                                    border: '1px solid var(--neutral-200)', background: '#fff',
                                                    fontWeight: 600, outline: 'none', cursor: 'pointer'
                                                }}
                                            >
                                                <option value={20}>20</option>
                                                <option value={50}>50</option>
                                                <option value={100}>100</option>
                                                <option value={-1}>Todo</option>
                                            </select>
                                        </div>
                                        {pageSize !== -1 && totalPages > 1 && (
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                <button
                                                    disabled={currentPage === 1}
                                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                                    style={{
                                                        width: '28px', height: '28px', borderRadius: '6px',
                                                        border: '1px solid var(--neutral-200)', background: '#fff',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                                                        opacity: currentPage === 1 ? 0.4 : 1,
                                                        color: 'var(--neutral-600)', transition: 'all 0.15s'
                                                    }}
                                                >
                                                    <ChevronLeft size={16} />
                                                </button>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', justify: 'center', padding: '0 8px', fontWeight: 700, color: 'var(--neutral-700)' }}>
                                                    Pág. {currentPage} de {totalPages}
                                                </span>
                                                <button
                                                    disabled={currentPage === totalPages}
                                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                                    style={{
                                                        width: '28px', height: '28px', borderRadius: '6px',
                                                        border: '1px solid var(--neutral-200)', background: '#fff',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                                                        opacity: currentPage === totalPages ? 0.4 : 1,
                                                        color: 'var(--neutral-600)', transition: 'all 0.15s'
                                                    }}
                                                >
                                                    <ChevronRight size={16} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Mensaje descriptivo Auditoria Pacientes */}
                            <div style={{ marginBottom: '16px', width: '100%', fontSize: '0.8rem', color: 'var(--neutral-600)', background: '#F8FAFC', padding: '10px 14px', borderRadius: '8px', borderLeft: '4px solid #10B981', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Info size={16} style={{ color: '#10B981' }} />
                                Esta vista agrupa las filas del Excel por Número de Admisión, reconstruyendo el "ciclo de internación" de cada paciente para facilitar el seguimiento cronológico y detectar los días puntuales (Gaps) donde falta información.
                            </div>

                            {/* BARRA DE BÚSQUEDA PACIENTES */}
                            <div style={{
                                display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap',
                                padding: '10px 14px', borderRadius: '12px',
                                background: '#FAFAFA', border: '1px solid var(--neutral-200)',
                            }}>
                                <div style={{ flex: 1, position: 'relative', minWidth: '220px' }}>
                                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--neutral-400)' }} />
                                    <input
                                        type="text"
                                        placeholder="Buscar por paciente, admisión, médico o especialidad..."
                                        value={patientSearch}
                                        onChange={e => { setPatientSearch(e.target.value); setPatientPage(1); }}
                                        style={{
                                            width: '100%', padding: '8px 10px 8px 32px',
                                            borderRadius: '8px', border: '1px solid var(--neutral-200)',
                                            fontSize: '0.8rem', color: 'var(--neutral-700)',
                                            outline: 'none', transition: 'border-color 0.2s',
                                            background: '#fff'
                                        }}
                                        onFocus={e => e.currentTarget.style.borderColor = 'var(--primary-400)'}
                                        onBlur={e => e.currentTarget.style.borderColor = 'var(--neutral-200)'}
                                    />
                                </div>
                                <span style={{ fontSize: '0.72rem', color: 'var(--neutral-500)', fontWeight: 600 }}>
                                    Ciclos: <strong>{filteredGroupedPatients.length}</strong> de {groupedPatients.length}
                                </span>
                            </div>

                            {/* LISTA DE CICLOS DE PACIENTES */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', flex: 1, minHeight: '800px', paddingRight: '4px' }}>
                                {paginatedPatients.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '40px', background: '#fff', borderRadius: '12px', border: '1px solid var(--neutral-200)' }}>
                                        <AlertTriangle size={36} strokeWidth={1.2} style={{ color: 'var(--neutral-300)', marginBottom: '8px' }} />
                                        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700 }}>Sin pacientes</h3>
                                        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--neutral-400)' }}>Ajusta los filtros o la búsqueda.</p>
                                    </div>
                                ) : (
                                    paginatedPatients.map((pat, idx) => {
                                        const timelineDays = getPatientTimelineDays(pat);
                                        const hasAlertaCritica = pat.gaps.length > 0;
                                        
                                        const prevPat = idx > 0 ? paginatedPatients[idx - 1] : null;
                                        const showMonthHeader = pat.mesAdmision && (!prevPat || prevPat.mesAdmision !== pat.mesAdmision);
                                        
                                        let riskColor = '#10B981';
                                        let riskBg = '#E6FCF5';
                                        let riskBorder = '#C3FAE8';
                                        let riskText = 'Riesgo Bajo';
                                        
                                        if (hasAlertaCritica) {
                                            riskColor = '#EF4444';
                                            riskBg = '#FEF2F2';
                                            riskBorder = '#FEE2E2';
                                            riskText = 'Riesgo Crítico';
                                        } else if (pat.evoluciones.some(ev => ev.isDuplicated)) {
                                            riskColor = '#F59E0B';
                                            riskBg = '#FEF3C7';
                                            riskBorder = '#FDE68A';
                                            riskText = 'Riesgo Medio';
                                        }

                                        return (
                                            <div key={pat.id} style={{ display: 'contents' }}>
                                                {showMonthHeader && (
                                                    <div style={{ marginTop: idx === 0 ? '0' : '8px', paddingBottom: '8px', borderBottom: '2px solid var(--primary-100)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <Calendar size={18} style={{ color: 'var(--primary-600)' }} />
                                                        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--primary-800)', textTransform: 'capitalize' }}>
                                                            {pat.mesAdmision}
                                                        </h2>
                                                    </div>
                                                )}
                                                <div 
                                                    style={{
                                                        background: '#ffffff',
                                                        borderRadius: '12px',
                                                        border: `1px solid ${hasAlertaCritica ? '#FEE2E2' : 'rgba(0, 0, 0, 0.06)'}`,
                                                        padding: '16px',
                                                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '12px'
                                                }}
                                            >
                                                {/* Header del Paciente */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                                                    <div>
                                                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--neutral-800)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            {pat.paciente}
                                                            <span style={{ 
                                                                fontSize: '0.7rem', 
                                                                padding: '2px 8px', 
                                                                borderRadius: '6px', 
                                                                fontWeight: 700,
                                                                color: riskColor,
                                                                background: riskBg,
                                                                border: `1px solid ${riskBorder}`
                                                            }}>
                                                                {riskText}
                                                            </span>
                                                            {(() => {
                                                                const adData = hcLocalStore.getAdmissionData(pat.numeroAdmision);
                                                                const hasFoja = adData && adData.fojas && adData.fojas.length > 0;
                                                                return (
                                                                    <span style={{ 
                                                                        fontSize: '0.7rem', 
                                                                        padding: '2px 8px', 
                                                                        borderRadius: '6px', 
                                                                        fontWeight: 700,
                                                                        color: hasFoja ? '#1E40AF' : '#94A3B8',
                                                                        background: hasFoja ? '#DBEAFE' : '#F1F5F9',
                                                                        border: `1px solid ${hasFoja ? '#BFDBFE' : '#E2E8F0'}`
                                                                    }}>
                                                                        {hasFoja ? 'Con Foja Quirúrgica' : 'Sin Foja Quirúrgica'}
                                                                    </span>
                                                                );
                                                            })()}
                                                        </h3>
                                                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '4px', fontSize: '0.75rem', color: 'var(--neutral-500)' }}>
                                                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                Admisión: <strong style={{ color: 'var(--neutral-700)' }}>{pat.numeroAdmision}</strong>
                                                                {pat.mesAdmision && (
                                                                    <span style={{ fontSize: '0.65rem', background: '#E2E8F0', color: '#475569', padding: '2px 6px', borderRadius: '4px', textTransform: 'capitalize' }}>
                                                                        {pat.mesAdmision}
                                                                    </span>
                                                                )}
                                                            </span>
                                                            <span>•</span>
                                                            <span>Obra Social: <strong style={{ color: 'var(--neutral-700)' }}>{pat.obraSocial || '—'}</strong></span>
                                                            <span>•</span>
                                                            <span>Habitación: <strong style={{ color: 'var(--neutral-700)' }}>{pat.habitacion || '—'}</strong></span>
                                                            <span>•</span>
                                                            <span>Especialidad: <strong style={{ color: 'var(--neutral-700)' }}>{pat.especialidad || '—'}</strong></span>
                                                            <span>•</span>
                                                            <span>Profesional: <strong style={{ color: 'var(--neutral-700)' }}>{pat.medico || '—'}</strong></span>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); togglePatientExpansion(pat.id); }}
                                                            style={{
                                                                background: 'var(--primary-50)', color: 'var(--primary-600)', border: 'none',
                                                                padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600,
                                                                cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '4px'
                                                            }}
                                                            onMouseOver={e => e.currentTarget.style.background = 'var(--primary-100)'}
                                                            onMouseOut={e => e.currentTarget.style.background = 'var(--primary-50)'}
                                                        >
                                                            {expandedPatients.has(pat.id) ? (
                                                                <>Ocultar Detalles <ChevronUp size={14} /></>
                                                            ) : (
                                                                <>Ver Detalles <ChevronDown size={14} /></>
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>

                                                {expandedPatients.has(pat.id) && (
                                                    <>
                                                        {/* Fechas de Ingreso y Alta, Datos enriquecidos */}
                                                        <div style={{ 
                                                            background: '#F8FAFC', 
                                                            borderRadius: '8px', 
                                                            padding: '10px 14px', 
                                                            fontSize: '0.75rem', 
                                                            color: 'var(--neutral-600)',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '6px'
                                                        }}>
                                                            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                                                                <span>Fecha Ingreso: <strong>{pat.fechaIngreso || '—'}</strong></span>
                                                                <span>Fecha Alta: <strong>{pat.fechaAlta || 'Activo / Sin Alta'}</strong></span>
                                                                <span>Días de Internación: <strong>{pat.diasEstadia || timelineDays.length} días</strong></span>
                                                                {pat.edad && !isNullOrEmpty(pat.edad) && (
                                                                    <span>Edad: <strong>{pat.edad}</strong></span>
                                                                )}
                                                                {pat.motivoAlta && !isNullOrEmpty(pat.motivoAlta) && (
                                                                    <span>Motivo Alta: <strong style={{ color: '#7C3AED' }}>{pat.motivoAlta}</strong></span>
                                                                )}
                                                            </div>
                                                            {pat.valorAlta && (
                                                                <div style={{ marginTop: '4px', paddingTop: '6px', borderTop: '1px solid #E2E8F0', color: '#B45309', fontWeight: 600 }}>
                                                                    📋 Valor / Protocolo de Alta: <span style={{ color: '#0F172A', fontWeight: 500 }}>{pat.valorAlta}</span>
                                                                </div>
                                                            )}
                                                            {pat.fechaAltaMedica && !isNullOrEmpty(pat.fechaAltaMedica) && (
                                                                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '2px', paddingTop: '6px', borderTop: '1px solid #E2E8F0' }}>
                                                                    <span style={{ color: '#0369A1', fontWeight: 600 }}>🏥 Alta Médica: <strong>{pat.fechaAltaMedica}</strong></span>
                                                                    {pat.diasDesfaseAlta && !isNullOrEmpty(pat.diasDesfaseAlta) && pat.diasDesfaseAlta !== '0' && (
                                                                        <span style={{ 
                                                                            fontSize: '0.68rem', 
                                                                            padding: '2px 6px', 
                                                                            borderRadius: '4px', 
                                                                            background: Number(pat.diasDesfaseAlta) > 0 ? '#FEF3C7' : '#DBEAFE',
                                                                            color: Number(pat.diasDesfaseAlta) > 0 ? '#92400E' : '#1E40AF',
                                                                            fontWeight: 600
                                                                        }}>
                                                                            Desfase: {pat.diasDesfaseAlta} día(s)
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>

                                                {/* Timeline Visual (Grid de días) */}
                                                <div>
                                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-600)', marginBottom: '8px' }}>
                                                        Línea de Tiempo del Ciclo:
                                                    </div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                        {timelineDays.map((day, dIdx) => {
                                                            const surgical = isSurgicalDay(day);
                                                            
                                                            let dayBg = '#10B981';
                                                            let dayText = 'Evolución OK';
                                                            let dayColor = '#FFF';
                                                            
                                                            if (day.status === 'GAP') {
                                                                dayBg = '#EF4444';
                                                                dayText = 'Día sin evolución (Gap)';
                                                            } else if (day.status === 'DUPLICADO') {
                                                                dayBg = '#F59E0B';
                                                                dayText = `Texto repetido (${Math.round(day.similarity * 100)}% similitud)`;
                                                            } else if (surgical) {
                                                                dayBg = '#3B82F6';
                                                                dayText = 'Día Quirúrgico (Evolución de Cirugía)';
                                                            }

                                                            return (
                                                                <div 
                                                                    key={dIdx}
                                                                    style={{
                                                                        width: '32px',
                                                                        height: '32px',
                                                                        borderRadius: '6px',
                                                                        background: dayBg,
                                                                        color: dayColor,
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        fontSize: '0.7rem',
                                                                        fontWeight: 700,
                                                                        cursor: 'help',
                                                                        position: 'relative'
                                                                    }}
                                                                    title={`Fecha: ${day.dateStr}\nEstado: ${dayText}\n\n${day.valRespuesta ? 'Texto: ' + day.valRespuesta.substring(0, 100) + '...' : 'Sin registros'}`}
                                                                >
                                                                    {dIdx + 1}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                    
                                                    {/* Leyenda de la Línea de Tiempo */}
                                                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '8px', fontSize: '0.68rem', color: 'var(--neutral-500)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#10B981', display: 'inline-block' }} />
                                                            <span>Evolución Médica OK</span>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#F59E0B', display: 'inline-block' }} />
                                                            <span>Evolución Repetida</span>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#EF4444', display: 'inline-block' }} />
                                                            <span>Día sin Evolución</span>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#3B82F6', display: 'inline-block' }} />
                                                            <span>Evolución Quirúrgica</span>
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Detalle de Fojas Quirúrgicas */}
                                                    {(() => {
                                                        const adData = hcLocalStore.getAdmissionData(pat.numeroAdmision);
                                                        if (!adData || adData.fojas.length === 0) return null;

                                                        const isNullFoja = (fq) => {
                                                            return (!fq.id || fq.id === 'NULL') &&
                                                                   (!fq.cirujano || fq.cirujano === 'NULL') &&
                                                                   (!fq.procedimiento || fq.procedimiento === 'NULL') &&
                                                                   (!fq.diagnostico || fq.diagnostico === 'NULL');
                                                        };
                                                        
                                                        const allNull = adData.fojas.every(isNullFoja);

                                                        return (
                                                            <div style={{ marginTop: '16px', background: '#F8FAFC', borderRadius: '8px', padding: '12px', border: '1px solid #E2E8F0' }}>
                                                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary-700)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3B82F6' }}></div>
                                                                    Fojas Quirúrgicas Detectadas
                                                                </div>
                                                                {allNull ? (
                                                                    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '8px 12px', fontSize: '0.75rem', color: '#64748B', fontStyle: 'italic' }}>
                                                                        No hay foja quirúrgica
                                                                    </div>
                                                                ) : (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                        {adData.fojas.filter(fq => !isNullFoja(fq)).map((fq, i) => (
                                                                            <div key={`fq-${i}`} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '8px 12px', fontSize: '0.75rem' }}>
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                                                    <strong style={{ color: '#0F172A' }}>Foja: {fq.id || 'N/A'}</strong>
                                                                                    <span style={{ color: '#64748B', fontWeight: 500 }}>
                                                                                        {fq.fecha_cirugia && fq.fecha_cirugia !== 'NULL' ? new Date(fq.fecha_cirugia).toLocaleDateString('es-AR') : 'Sin fecha'} • {fq.hora_comienzo && fq.hora_comienzo !== 'NULL' ? new Date(fq.hora_comienzo).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '--:--'} a {fq.hora_finalizacion && fq.hora_finalizacion !== 'NULL' ? new Date(fq.hora_finalizacion).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                                                                    </span>
                                                                                </div>
                                                                                <div style={{ color: '#334155', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                                                                                    <div><span style={{ color: '#94A3B8' }}>Cirujano:</span> {fq.cirujano || '-'}</div>
                                                                                    <div><span style={{ color: '#94A3B8' }}>Procedimiento:</span> {fq.procedimiento || '-'}</div>
                                                                                    <div style={{ gridColumn: 'span 2' }}><span style={{ color: '#94A3B8' }}>Diagnóstico:</span> {fq.diagnostico || '-'}</div>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>

                                                {/* Detalle de Alertas del Paciente */}
                                                {pat.alertas.length > 0 && (
                                                    <div style={{ 
                                                        borderTop: '1px solid var(--neutral-100)', 
                                                        paddingTop: '10px', 
                                                        display: 'flex', 
                                                        flexDirection: 'column', 
                                                        gap: '6px' 
                                                    }}>
                                                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--neutral-400)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Observaciones Críticas de Auditoría:</div>
                                                        {pat.alertas.map((al, alIdx) => (
                                                            <div 
                                                                key={alIdx} 
                                                                style={{ 
                                                                    display: 'flex', 
                                                                    flexDirection: 'column',
                                                                    gap: '4px',
                                                                    fontSize: '0.75rem', 
                                                                    color: al.tipo === 'CRITICO' ? '#B91C1C' : '#D97706',
                                                                    background: al.tipo === 'CRITICO' ? '#FEF2F2' : '#FEF3C7',
                                                                    padding: '8px 12px',
                                                                    borderRadius: '6px',
                                                                    fontWeight: 500
                                                                }}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    {al.tipo === 'CRITICO' ? <AlertCircle size={14} style={{ flexShrink: 0 }} /> : <AlertTriangle size={14} style={{ flexShrink: 0 }} />}
                                                                    <span>{al.mensaje}</span>
                                                                </div>
                                                                {al.detalles && al.detalles.length > 0 && (
                                                                    <div style={{ marginTop: '4px', paddingLeft: '22px', fontSize: '0.7rem', color: al.tipo === 'CRITICO' ? '#991B1B' : '#B45309', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                                        {al.detalles.map((det, idx) => (
                                                                            <span key={idx} style={{ fontStyle: 'italic', background: 'rgba(255,255,255,0.4)', padding: '2px 6px', borderRadius: '4px' }}>{det}</span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                </>
                                                )}
                                            </div>
                                        </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* PIE DE VISTA PACIENTES / PAGINACIÓN */}
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '10px 18px', borderTop: '1px solid var(--neutral-200)',
                                background: '#F8FAFC', flexWrap: 'wrap', gap: '10px', fontSize: '0.8rem',
                                borderRadius: '0 0 12px 12px'
                            }}>
                                <div>
                                    Mostrando <strong>{filteredGroupedPatients.length === 0 ? 0 : (patientPage - 1) * patientPageSize + 1}</strong> a <strong>{Math.min(patientPage * patientPageSize, filteredGroupedPatients.length)}</strong> de <strong>{filteredGroupedPatients.length}</strong> pacientes
                                </div>

                                {totalPatientPages > 1 && (
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        <button
                                            disabled={patientPage === 1}
                                            onClick={() => setPatientPage(prev => Math.max(prev - 1, 1))}
                                            style={{
                                                width: '28px', height: '28px', borderRadius: '6px',
                                                border: '1px solid var(--neutral-200)', background: '#fff',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: patientPage === 1 ? 'not-allowed' : 'pointer',
                                                opacity: patientPage === 1 ? 0.4 : 1,
                                                color: 'var(--neutral-600)', transition: 'all 0.15s'
                                            }}
                                        >
                                            <ChevronLeft size={16} />
                                        </button>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', justify: 'center', padding: '0 8px', fontWeight: 700, color: 'var(--neutral-700)' }}>
                                            Pág. {patientPage} de {totalPatientPages}
                                        </span>
                                        <button
                                            disabled={patientPage === totalPatientPages}
                                            onClick={() => setPatientPage(prev => Math.min(prev + 1, totalPatientPages))}
                                            style={{
                                                width: '28px', height: '28px', borderRadius: '6px',
                                                border: '1px solid var(--neutral-200)', background: '#fff',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: patientPage === totalPatientPages ? 'not-allowed' : 'pointer',
                                                opacity: patientPage === totalPatientPages ? 0.4 : 1,
                                                color: 'var(--neutral-600)', transition: 'all 0.15s'
                                            }}
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    );
}
