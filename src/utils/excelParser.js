/**
 * Parser de archivos Excel (.xlsx) para el módulo de Cirugías
 * Usa la librería SheetJS (xlsx) para leer archivos Excel
 * 
 * Columnas esperadas del Excel:
 *   Date_Fecha, idPaciente, nombre, telefono1, Descrip, motivo, Ausente, GrupoAgendas
 * 
 * Mapeo a campos de la tabla surgeries:
 *   Date_Fecha    → fecha_cirugia
 *   idPaciente    → id_paciente
 *   nombre        → nombre
 *   telefono1     → telefono (normalizado)
 *   Descrip       → descripcion / modulo
 *   motivo        → motivo
 *   Ausente       → ausente
 *   GrupoAgendas  → grupo_agendas / medico
 */
import * as XLSX from 'xlsx';

/**
 * Lee un archivo Excel y retorna un array de objetos
 * @param {File} file - Archivo .xlsx del input file
 * @returns {Promise<Array<Object>>} Array de filas como objetos
 */
export async function parseExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: false });

                // Tomar la primera hoja
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];

                // Convertir a JSON — raw: true para obtener serial numbers de fechas
                const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                    raw: true,
                    defval: '',
                });

                resolve(jsonData);
            } catch (err) {
                reject(new Error('Error al leer el archivo Excel: ' + err.message));
            }
        };

        reader.onerror = () => reject(new Error('Error al leer el archivo'));
        reader.readAsArrayBuffer(file);
    });
}

// =============================================
// DETECCIÓN FLEXIBLE DE COLUMNAS
// =============================================

/**
 * Definición de campos con múltiples palabras clave para matchear
 * La detección busca estas keywords en los nombres de columna (case insensitive)
 */
const FIELD_MATCHERS = {
    fecha: {
        // Prioridad: las primeras tienen más peso
        keywords: ['date_fecha', 'date fecha', 'fecha_cirugia', 'fecha cirugia', 'fechacirugia', 'fecha', 'date', 'fec'],
        required: true,
    },
    idPaciente: {
        keywords: ['idpaciente', 'id_paciente', 'id paciente', 'nro_paciente', 'paciente_id', 'cod_paciente', 'codpaciente', 'nropaciente', 'hc', 'historia'],
        required: true,
    },
    nombre: {
        keywords: ['nombre', 'paciente', 'name', 'apellido', 'nomyape', 'nom_ape'],
        required: true,
    },
    telefono: {
        keywords: ['telefono1', 'telefono', 'tel1', 'tel', 'celular', 'cel', 'phone', 'whatsapp', 'movil', 'fono'],
        required: false,
    },
    descripcion: {
        keywords: ['descrip', 'descripcion', 'description', 'procedimiento', 'practica', 'cirugia', 'intervencion', 'detalle'],
        required: false,
    },
    motivo: {
        keywords: ['motivo', 'razon', 'reason', 'diagnostico', 'diag'],
        required: false,
    },
    ausente: {
        keywords: ['ausente', 'absent', 'asistencia', 'presente', 'estado_asist'],
        required: false,
    },
    grupoAgendas: {
        keywords: ['grupoagendas', 'grupo_agendas', 'grupo agendas', 'agenda', 'grupo', 'medico', 'doctor', 'profesional', 'cirujano', 'dr'],
        required: false,
    },
    obraSocial: {
        keywords: ['mutua', 'obra_social', 'obrasocial', 'obra social', 'os', 'cobertura', 'prepaga', 'mutual'],
        required: false,
    },
    dni: {
        keywords: ['dni', 'documento', 'doc', 'nro_doc', 'nrodoc'],
        required: false,
    },
};

/**
 * Detecta qué columna del Excel corresponde a cada campo
 * Retorna un mapa: { fecha: 'Date_Fecha', nombre: 'Nombre Paciente', ... }
 */
export function detectColumns(columnNames) {
    const mapping = {};
    const usedColumns = new Set();

    // Normalizar nombres de columna para comparación
    const normalizedCols = columnNames.map(col => ({
        original: col,
        normalized: col.toLowerCase().replace(/[\s_\-\.]/g, ''),
    }));

    // Para cada campo, buscar la mejor columna
    for (const [fieldName, matcher] of Object.entries(FIELD_MATCHERS)) {
        let bestMatch = null;
        let bestPriority = Infinity;

        for (const keyword of matcher.keywords) {
            const normalizedKeyword = keyword.toLowerCase().replace(/[\s_\-\.]/g, '');

            for (const col of normalizedCols) {
                if (usedColumns.has(col.original)) continue;

                // Match exacto (normalizado)
                if (col.normalized === normalizedKeyword) {
                    if (matcher.keywords.indexOf(keyword) < bestPriority) {
                        bestMatch = col.original;
                        bestPriority = matcher.keywords.indexOf(keyword);
                    }
                }
                // Match parcial: la columna contiene el keyword
                else if (col.normalized.includes(normalizedKeyword) || normalizedKeyword.includes(col.normalized)) {
                    const priority = matcher.keywords.indexOf(keyword) + 100; // Menor prioridad que exacto
                    if (priority < bestPriority) {
                        bestMatch = col.original;
                        bestPriority = priority;
                    }
                }
            }
        }

        if (bestMatch) {
            mapping[fieldName] = bestMatch;
            usedColumns.add(bestMatch);
        }
    }

    console.log('📊 Columnas del Excel:', columnNames);
    console.log('🔗 Mapeo detectado:', mapping);

    return mapping;
}

/**
 * Mapea las filas del Excel al formato de la tabla surgeries
 * Usa detección flexible de columnas
 * @param {Array<Object>} rows - Filas del Excel como objetos
 * @returns {{ records: Array<Object>, columnMapping: Object, unmappedColumns: string[] }}
 */
export function mapExcelToSurgeries(rows) {
    if (!rows || rows.length === 0) return { records: [], columnMapping: {}, unmappedColumns: [] };

    // Detectar columnas de la primera fila
    const columnNames = Object.keys(rows[0]);
    const mapping = detectColumns(columnNames);

    // Columnas no mapeadas (para info del usuario)
    const mappedCols = new Set(Object.values(mapping));
    const unmappedColumns = columnNames.filter(c => !mappedCols.has(c));

    const records = rows.map((row, index) => {
        // Extraer valor usando el mapeo detectado
        const getValue = (field) => {
            const colName = mapping[field];
            if (!colName) return '';
            const val = row[colName];
            if (val === null || val === undefined) return '';
            return String(val).trim();
        };

        // Normalizar fecha
        let fechaCirugia = '';
        const rawDate = mapping.fecha ? row[mapping.fecha] : '';

        if (rawDate instanceof Date) {
            // Evitar problemas de timezone con toISOString
            const y = rawDate.getFullYear();
            const m = String(rawDate.getMonth() + 1).padStart(2, '0');
            const d = String(rawDate.getDate()).padStart(2, '0');
            fechaCirugia = `${y}-${m}-${d}`;
        } else if (typeof rawDate === 'string' && rawDate) {
            fechaCirugia = parseDate(rawDate);
        } else if (typeof rawDate === 'number') {
            const excelDate = XLSX.SSF.parse_date_code(rawDate);
            if (excelDate) {
                fechaCirugia = `${excelDate.y}-${String(excelDate.m).padStart(2, '0')}-${String(excelDate.d).padStart(2, '0')}`;
            }
        }

        // Debug: log first record's date
        if (index === 0) {
            console.log('📅 Fecha debug:', { rawDate, tipo: typeof rawDate, fechaCirugia });
        }

        const nombre = getValue('nombre');
        const idPaciente = getValue('idPaciente');
        const telefono = getValue('telefono');
        const descripcion = getValue('descripcion');
        const motivo = getValue('motivo');
        const ausente = getValue('ausente');
        const grupoAgendas = getValue('grupoAgendas');
        const obraSocial = getValue('obraSocial');
        const dni = getValue('dni');

        return {
            _rowIndex: index + 2, // +2: fila 1 = header, index 0-based
            id_paciente: idPaciente,
            nombre,
            telefono_raw: telefono,
            fecha_cirugia: fechaCirugia,
            descripcion,
            motivo,
            ausente,
            grupo_agendas: grupoAgendas,
            obra_social: obraSocial,
            dni,
            medico: grupoAgendas || '',
            modulo: descripcion || '',
        };
    });

    return { records, columnMapping: mapping, unmappedColumns };
}

/**
 * Parsea un string de fecha en varios formatos al formato YYYY-MM-DD
 */
function parseDate(dateStr) {
    if (!dateStr) return '';

    // Limpiar espacios
    dateStr = dateStr.trim();

    // Ya está en formato YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

    // DD/MM/YYYY o DD-MM-YYYY o DD.MM.YYYY
    const dmyMatch = dateStr.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    if (dmyMatch) {
        return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
    }

    // DD/MM/YY (2 dígitos de año)
    const dmyShort = dateStr.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})$/);
    if (dmyShort) {
        const year = parseInt(dmyShort[3]) > 50 ? '19' + dmyShort[3] : '20' + dmyShort[3];
        return `${year}-${dmyShort[2].padStart(2, '0')}-${dmyShort[1].padStart(2, '0')}`;
    }

    // YYYY/MM/DD
    const ymdMatch = dateStr.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
    if (ymdMatch) {
        return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
    }

    // Formatos con texto: "19 feb 2026", "Feb 19, 2026", etc.
    const textDate = new Date(dateStr);
    if (!isNaN(textDate.getTime()) && textDate.getFullYear() > 2000) {
        return textDate.toISOString().split('T')[0];
    }

    // Último intento: quitar hora si viene con timestamp "19/02/2026 08:00:00"
    const withTime = dateStr.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\s/);
    if (withTime) {
        return `${withTime[3]}-${withTime[2].padStart(2, '0')}-${withTime[1].padStart(2, '0')}`;
    }

    return ''; // No se pudo parsear
}

/**
 * Valida los registros mapeados y retorna errores
 * @param {Array<Object>} records - Registros mapeados
 * @returns {{ valid: Array, invalid: Array, errors: Array<string> }}
 */
export function validateMappedRecords(records) {
    const valid = [];
    const invalid = [];
    const errors = [];

    records.forEach((record) => {
        const rowErrors = [];

        if (!record.nombre) {
            rowErrors.push('Nombre vacío');
        }
        if (!record.fecha_cirugia) {
            rowErrors.push('Fecha de cirugía inválida o vacía');
        }
        if (!record.id_paciente) {
            rowErrors.push('ID de paciente vacío');
        }
        // Teléfono se valida después de normalizar

        if (rowErrors.length > 0) {
            invalid.push({ ...record, _errors: rowErrors });
            errors.push(`Fila ${record._rowIndex}: ${rowErrors.join(', ')}`);
        } else {
            valid.push(record);
        }
    });

    return { valid, invalid, errors };
}
