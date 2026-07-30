import { read, utils } from 'xlsx';
import { hcLocalStore } from '../store/hcLocalStore';

// Utilidad para parsear fechas de Excel
function parseExcelDate(excelDate) {
    if (!excelDate) return null;
    if (typeof excelDate === 'number') {
        const date = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
        // Ajustar zona horaria local simple
        date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
        return date.toISOString();
    }
    // Si ya viene como texto fecha
    const parsed = new Date(excelDate);
    return isNaN(parsed.getTime()) ? excelDate : parsed.toISOString();
}

function parseTimeStr(timeStr, dateStr) {
    if (!timeStr) return null;
    // Si es un número (formato decimal de excel para horas)
    if (typeof timeStr === 'number') {
        const totalSeconds = Math.round(timeStr * 86400);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const sec = totalSeconds % 60;
        const timePart = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        if (dateStr) {
            // Combinar con la fecha
            try {
                const dateObj = new Date(dateStr);
                dateObj.setHours(hours, minutes, sec, 0);
                return dateObj.toISOString();
            } catch (e) {
                return `${dateStr}T${timePart}`;
            }
        }
        return timePart;
    }
    
    // Si es string de tipo "10:30:00"
    if (typeof timeStr === 'string' && dateStr) {
        try {
            const dateObj = new Date(dateStr);
            const [h, m, s] = timeStr.split(':').map(Number);
            if (!isNaN(h)) {
                dateObj.setHours(h || 0, m || 0, s || 0, 0);
                return dateObj.toISOString();
            }
        } catch (e) {}
    }
    return timeStr;
}

export async function processHCExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                
                // Obtener datos crudos como array de arrays
                const rawData = utils.sheet_to_json(worksheet, { header: 1 });
                if (rawData.length < 2) throw new Error("El archivo está vacío o no tiene formato correcto");

                const headers = rawData[0];
                const rows = rawData.slice(1);

                // Función auxiliar para buscar índices con coincidencia flexible de palabras clave (incluso encabezados truncados)
                const findIdx = (keywords) => headers.findIndex(h => {
                    if (!h) return false;
                    const str = h.toString().trim().toLowerCase().replace(/[\s_\-\.]/g, '');
                    return keywords.some(kw => {
                        const normKw = kw.toLowerCase().replace(/[\s_\-\.]/g, '');
                        return str === normKw || str.startsWith(normKw) || normKw.startsWith(str) || (str.length >= 4 && normKw.includes(str));
                    });
                });

                // Índices conocidos con soporte flexible para nuevos encabezados de SALUS (incluyendo truncados de Excel)
                const idxAdmision = findIdx(['id_admision', 'numero admision', 'número admisión', 'num admision', 'nro admision', 'id_visita_fecha', 'id_visita', 'nhc', 'fq_idvisita', 'fq_idvis']);
                
                // NUEVA: Fecha_Clinica_Evolucion es la fecha canónica (prioridad máxima)
                const idxFechaClinica = findIdx(['fecha_clinica_evolucion', 'fecha_clinica_evoluc', 'fecha_clinica']);
                const idxFechaEvolucion = findIdx(['fecha_evolucion', 'fecha_evolucio', 'fecha_respuesta', 'fecha_alta_hosp', 'fq_fecha']);
                // Usar fecha clínica si está disponible, sino caer a la anterior
                const idxFechaEfectiva = idxFechaClinica !== -1 ? idxFechaClinica : idxFechaEvolucion;
                
                const idxValorRespuesta = findIdx(['valor_respuesta_medica', 'valor_respuesta', 'valor_respues', 'valor_alta', 'observac']);
                
                // NUEVA: Tipo de registro clínico (EVOLUCION DIARIA vs RESUMEN-PRONOSTICO-EVOLUCION-CONSIGNAS)
                const idxTipoRegistro = findIdx(['tipo_registro_clinico', 'tipo_registro', 'tipo_regist']);
                
                // NUEVA: Fecha de escritura (para auditoría de trazabilidad)
                const idxFechaEscritura = findIdx(['fecha_escritura_evolucion', 'fecha_escritura', 'fecha_escritu']);
                
                // NUEVA: Fuente de la fecha clínica
                const idxFuenteFecha = findIdx(['fuente_fecha_clinica', 'fuente_fecha']);
                
                // NUEVA: Alta Médica como concepto separado
                const idxValorAltaMedica = findIdx(['valor_alta_medica', 'valor_alta_med']);
                const idxFechaAltaMedica = findIdx(['fecha_alta_medica', 'fecha_alta_med']);
                const idxDiasDesfaseAlta = findIdx(['dias_desfase_alta', 'dias_desfase']);
                
                // NUEVA: Motivo de alta
                const idxMotivoAlta = findIdx(['motivo de alta', 'motivo_alta', 'motivo_de_alt']);
                
                // NUEVA: Edad y Días de estadía
                const idxEdad = findIdx(['edad']);
                const idxDiasEstadia = findIdx(['dias de estadia', 'dias_estadia', 'dias_de_esta']);

                // Foja Quirúrgica (mejorada con nuevas columnas de la query)
                const idxFqId = findIdx(['fq_idvisita', 'fq_idvis', 'fq_id']);
                const idxFqFechaCirugia = findIdx(['fq_fecha_cirugia', 'fq_fecha_ciru', 'fq_fecha']);
                const idxFqComienzo = findIdx(['hora de comienzo', 'hora inic', 'hora_inicio']);
                const idxFqFinal = findIdx(['hora finalización', 'hora fina', 'hora_fin']);
                const idxCirujano = findIdx(['cirujano', 'doctor', 'medico']);
                const idxProcedimiento = findIdx(['procedimiento quirúrgico', 'procedimiento quir', 'procedim', 'operacio']);
                const idxDiagnostico = findIdx(['diagnostico 1', 'diagnost', 'diagnos1']);
                // NUEVAS columnas de FQ desde la query optimizada
                const idxDiagPostOp = findIdx(['diagnóstico post-operatorio', 'diagnostico post', 'diag_postop']);
                const idxOperacionHallazgos = findIdx(['operacion y hallazgos', 'operacion_hall']);
                const idxProcedimiento2 = findIdx(['procedimiento quirúrgico 2', 'procedimiento quir 2']);
                const idxProcedimiento3 = findIdx(['procedimiento quirúrgico 3', 'procedimiento quir 3']);
                const idxProcedimiento4 = findIdx(['procedimiento quirúrgico 4', 'procedimiento quir 4']);
                const idxFqObservaciones = findIdx(['observaciones']);

                if (idxAdmision === -1) throw new Error("No se encontró la columna de admisión o N° de Visita ('ID_Admision', 'ID_Visita_Fecha', 'NHC', 'Número admisión', 'FQ_idvisita')");

                const admissionsMap = new Map();

                rows.forEach(row => {
                    let nroAdmision = row[idxAdmision];
                    if (!nroAdmision) return;
                    nroAdmision = nroAdmision.toString().trim();

                    if (!admissionsMap.has(nroAdmision)) {
                        admissionsMap.set(nroAdmision, {
                            numero_admision: nroAdmision,
                            evoluciones: [],
                            fojas: new Map(), // Map para evitar fojas duplicadas
                            // Nuevos campos de la query optimizada
                            altaMedica: null,
                            motivoAlta: null,
                            edad: null,
                            diasEstadia: null
                        });
                    }

                    const record = admissionsMap.get(nroAdmision);

                    // Extraer datos de admisión enriquecidos (solo la primera vez)
                    if (idxMotivoAlta !== -1 && !record.motivoAlta) {
                        const motivo = row[idxMotivoAlta];
                        if (motivo && String(motivo).trim().toLowerCase() !== 'null') {
                            record.motivoAlta = String(motivo).trim();
                        }
                    }
                    if (idxEdad !== -1 && record.edad === null) {
                        const edad = row[idxEdad];
                        if (edad !== null && edad !== undefined && String(edad).trim().toLowerCase() !== 'null') {
                            record.edad = edad;
                        }
                    }
                    if (idxDiasEstadia !== -1 && record.diasEstadia === null) {
                        const dias = row[idxDiasEstadia];
                        if (dias !== null && dias !== undefined && String(dias).trim().toLowerCase() !== 'null') {
                            record.diasEstadia = dias;
                        }
                    }

                    // Extraer Alta Médica (nueva sección separada de la query)
                    if (idxValorAltaMedica !== -1 && !record.altaMedica) {
                        const textoAlta = row[idxValorAltaMedica];
                        if (textoAlta && String(textoAlta).trim().toLowerCase() !== 'null' && String(textoAlta).trim() !== '') {
                            record.altaMedica = {
                                texto: String(textoAlta).trim(),
                                fecha: idxFechaAltaMedica !== -1 ? parseExcelDate(row[idxFechaAltaMedica]) : null,
                                diasDesfase: idxDiasDesfaseAlta !== -1 ? row[idxDiasDesfaseAlta] : null
                            };
                        }
                    }

                    // Extraer evolución
                    const fechaEvol = idxFechaEfectiva !== -1 ? row[idxFechaEfectiva] : null;
                    const textoEvol = row[idxValorRespuesta];
                    
                    // Detectar tipo UCI: primero por columna Tipo_Registro_Clinico, sino por heurística
                    const tipoRegistro = idxTipoRegistro !== -1 ? String(row[idxTipoRegistro] || '').trim() : '';
                    
                    const isUCIFormat = (txt, r) => {
                        // Prioridad 1: Si la columna Tipo_Registro_Clinico dice "RESUMEN - PRONOSTICO..."
                        if (tipoRegistro.toUpperCase().includes('RESUMEN') && tipoRegistro.toUpperCase().includes('PRONOSTICO')) {
                            return true;
                        }
                        // Prioridad 2: Heurística de texto (fallback para datos sin la columna)
                        let fullStr = String(txt || '');
                        if (r && Array.isArray(r)) {
                            fullStr += ' ' + r.join(' ');
                        }
                        const upper = fullStr.toUpperCase();
                        const hasResumen = upper.includes('RESUMEN');
                        const hasPronostico = upper.includes('PRONOSTICO') || upper.includes('PRONÓSTICO');
                        const hasEvolucion = upper.includes('EVOLUCION') || upper.includes('EVOLUCIÓN');
                        const hasConsignas = upper.includes('CONSIGNAS');
                        return (hasResumen && hasPronostico && hasEvolucion && hasConsignas) || upper.includes('TERAPIA INTENSIVA') || upper.includes('UCI');
                    };
                    
                    if (fechaEvol || textoEvol) {
                        const isUCI = isUCIFormat(textoEvol, row);
                        const evolucion = {
                            fecha: parseExcelDate(fechaEvol),
                            texto: textoEvol,
                            isUCI: isUCI,
                            tipo: isUCI ? 'Evolución UCI (Resumen - Pronóstico - Evolución - Consignas)' : 'Evolución Clínica',
                            // Nuevos campos de trazabilidad
                            tipoRegistro: tipoRegistro || null,
                            fechaEscritura: idxFechaEscritura !== -1 ? parseExcelDate(row[idxFechaEscritura]) : null,
                            fuenteFecha: idxFuenteFecha !== -1 ? String(row[idxFuenteFecha] || '').trim() : null
                        };
                        record.evoluciones.push(evolucion);
                        if (isUCI) {
                            record.hasUCI = true;
                        }
                    }

                    // Extraer Foja Quirúrgica (solo si fq_idvisita NO es null ni vacío)
                    const fqId = row[idxFqId];
                    if (fqId !== null && fqId !== undefined) {
                        const fqIdStr = fqId.toString().trim();
                        if (fqIdStr && fqIdStr.toLowerCase() !== 'null' && fqIdStr !== '0' && fqIdStr.toLowerCase() !== 'undefined') {
                            if (!record.fojas.has(fqIdStr)) {
                                const fechaCirugiaStr = parseExcelDate(row[idxFqFechaCirugia]);
                                record.fojas.set(fqIdStr, {
                                    id: fqIdStr,
                                    fecha_cirugia: fechaCirugiaStr,
                                    hora_comienzo: parseTimeStr(row[idxFqComienzo], fechaCirugiaStr),
                                    hora_finalizacion: parseTimeStr(row[idxFqFinal], fechaCirugiaStr),
                                    cirujano: row[idxCirujano],
                                    procedimiento: row[idxProcedimiento],
                                    diagnostico: row[idxDiagnostico],
                                    // Nuevos campos de la query optimizada
                                    diagnostico_postop: idxDiagPostOp !== -1 ? row[idxDiagPostOp] : null,
                                    operacion_hallazgos: idxOperacionHallazgos !== -1 ? row[idxOperacionHallazgos] : null,
                                    procedimiento2: idxProcedimiento2 !== -1 ? row[idxProcedimiento2] : null,
                                    procedimiento3: idxProcedimiento3 !== -1 ? row[idxProcedimiento3] : null,
                                    procedimiento4: idxProcedimiento4 !== -1 ? row[idxProcedimiento4] : null,
                                    observaciones: idxFqObservaciones !== -1 ? row[idxFqObservaciones] : null
                                });
                            }
                        }
                    }
                });

                // Convertir fojas Map a Array
                admissionsMap.forEach(record => {
                    record.fojas = Array.from(record.fojas.values());
                    // Ordenar evoluciones por fecha
                    record.evoluciones.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
                });

                hcLocalStore.setData(admissionsMap);
                resolve(admissionsMap.size);

            } catch (err) {
                console.error(err);
                reject(err);
            }
        };
        reader.onerror = (e) => reject(new Error("Error leyendo el archivo"));
        reader.readAsArrayBuffer(file);
    });
}
