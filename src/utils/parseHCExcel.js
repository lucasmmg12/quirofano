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

                // Función auxiliar para buscar índices con coincidencia flexible de palabras clave
                const findIdx = (keywords) => headers.findIndex(h => {
                    if (!h) return false;
                    const str = h.toString().trim().toLowerCase().replace(/[\s_\-\.]/g, '');
                    return keywords.some(kw => {
                        const normKw = kw.toLowerCase().replace(/[\s_\-\.]/g, '');
                        return str === normKw || str.startsWith(normKw) || normKw.startsWith(str);
                    });
                });

                // Índices conocidos con soporte flexible para nuevos encabezados de SALUS
                const idxAdmision = findIdx(['numero admision', 'número admisión', 'num admision', 'nro admision', 'id_visita_fecha', 'id_visita', 'nhc', 'fq_idvisita', 'fq_idvis']);
                const idxFechaEvolucion = findIdx(['fecha_evolucion', 'fecha_respuesta', 'fecha_alta_hosp', 'fq_fecha']);
                const idxValorRespuesta = findIdx(['valor_respuesta_medica', 'valor_respuesta', 'valor_alta', 'observac']);
                const idxFqId = findIdx(['fq_idvisita', 'fq_idvis', 'fq_id']);
                const idxFqFechaCirugia = findIdx(['fq_fecha_cirugia', 'fq_fecha', 'fecha admision']);
                const idxFqComienzo = findIdx(['hora de comienzo', 'hora inic', 'hora_inicio']);
                const idxFqFinal = findIdx(['hora finalización', 'hora fina', 'hora_fin']);
                const idxCirujano = findIdx(['cirujano', 'doctor', 'medico']);
                const idxProcedimiento = findIdx(['procedimiento quirúrgico', 'procedim', 'operacio']);
                const idxDiagnostico = findIdx(['diagnostico 1', 'diagnost', 'diagnos1']);

                if (idxAdmision === -1) throw new Error("No se encontró la columna de admisión o N° de Visita ('ID_Visita_Fecha', 'NHC', 'Número admisión', 'FQ_idvisita')");

                const admissionsMap = new Map();

                rows.forEach(row => {
                    let nroAdmision = row[idxAdmision];
                    if (!nroAdmision) return;
                    nroAdmision = nroAdmision.toString().trim();

                    if (!admissionsMap.has(nroAdmision)) {
                        admissionsMap.set(nroAdmision, {
                            numero_admision: nroAdmision,
                            evoluciones: [],
                            fojas: new Map() // Map para evitar fojas duplicadas
                        });
                    }

                    const record = admissionsMap.get(nroAdmision);

                    // Extraer evolución
                    const fechaEvol = row[idxFechaEvolucion];
                    const textoEvol = row[idxValorRespuesta];
                    
                    const isUCIFormat = (txt) => {
                        if (!txt) return false;
                        const upper = String(txt).toUpperCase();
                        const hasResumen = upper.includes('RESUMEN');
                        const hasPronostico = upper.includes('PRONOSTICO') || upper.includes('PRONÓSTICO');
                        const hasEvolucion = upper.includes('EVOLUCION') || upper.includes('EVOLUCIÓN');
                        const hasConsignas = upper.includes('CONSIGNAS');
                        return (hasResumen && hasPronostico && hasEvolucion && hasConsignas) || upper.includes('TERAPIA INTENSIVA') || upper.includes('UCI');
                    };
                    
                    if (fechaEvol || textoEvol) {
                        const isUCI = isUCIFormat(textoEvol);
                        record.evoluciones.push({
                            fecha: parseExcelDate(fechaEvol),
                            texto: textoEvol,
                            isUCI: isUCI,
                            tipo: isUCI ? 'Evolución UCI (Resumen - Pronóstico - Evolución - Consignas)' : 'Evolución Clínica'
                        });
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
                                    diagnostico: row[idxDiagnostico]
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
