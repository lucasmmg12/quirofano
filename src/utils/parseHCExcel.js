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

                // Índices conocidos
                const idxAdmision = headers.findIndex(h => h && h.toString().trim() === 'Número admisión');
                const idxFechaEvolucion = headers.findIndex(h => h === 'Fecha_Evolucion');
                const idxValorRespuesta = headers.findIndex(h => h === 'Valor_Respuesta_Medica');
                const idxFqId = headers.findIndex(h => h === 'FQ_idvisita');
                const idxFqFechaCirugia = headers.findIndex(h => h === 'FQ_Fecha_Cirugia');
                const idxFqComienzo = headers.findIndex(h => h === 'Hora de comienzo');
                const idxFqFinal = headers.findIndex(h => h === 'Hora Finalización');
                const idxCirujano = headers.findIndex(h => h === 'Cirujano');
                const idxProcedimiento = headers.findIndex(h => h === 'Procedimiento quirúrgico');
                const idxDiagnostico = headers.findIndex(h => h === 'Diagnostico 1');

                if (idxAdmision === -1) throw new Error("No se encontró la columna 'Número admisión'");

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
                    
                    if (fechaEvol && textoEvol) {
                        record.evoluciones.push({
                            fecha: parseExcelDate(fechaEvol),
                            texto: textoEvol
                        });
                    }

                    // Extraer Foja Quirúrgica
                    const fqId = row[idxFqId];
                    if (fqId) {
                        const fqIdStr = fqId.toString();
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
