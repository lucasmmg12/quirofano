/**
 * Parser de archivos Excel (.xlsx) para Presupuestos Quirúrgicos
 * 
 * Columnas esperadas del Excel:
 *   idPresupuesto, idPaciente, Paciente, fecha, Observaciones,
 *   idArticulo, descripcion, cantidad, ImporteUnitario, Importe Total,
 *   Linea, Importe Cobrado, Aceptado, FechaCaducidad, Presup_descripcion
 * 
 * Flujo:
 *   1. Parsea el Excel → array de filas planas
 *   2. Agrupa por idPresupuesto → cabecera + líneas de ítems
 *   3. Filtra presupuestos sin idPaciente
 *   4. Retorna estructura lista para upsert en Supabase
 */
import * as XLSX from 'xlsx';

// =============================================
// DETECCIÓN FLEXIBLE DE COLUMNAS
// =============================================

const BUDGET_FIELD_MATCHERS = {
    idPresupuesto: {
        keywords: ['idpresupuesto', 'id_presupuesto', 'id presupuesto', 'nropresupuesto', 'presupuesto_id', 'presupuesto'],
        required: true,
    },
    idPaciente: {
        keywords: ['idpaciente', 'id_paciente', 'id paciente', 'nro_paciente', 'paciente_id', 'cod_paciente'],
        required: true,
    },
    paciente: {
        keywords: ['paciente', 'nombre', 'nombre_paciente', 'nom_paciente'],
        required: false,
    },
    fecha: {
        keywords: ['fecha', 'date', 'fecha_presupuesto'],
        required: false,
    },
    observaciones: {
        keywords: ['observaciones', 'observacion', 'obs', 'notas'],
        required: false,
    },
    idArticulo: {
        keywords: ['idarticulo', 'id_articulo', 'id articulo', 'cod_articulo', 'codarticulo', 'articulo_id', 'codigo'],
        required: false,
    },
    descripcion: {
        keywords: ['descripcion', 'descripción', 'descrip', 'detalle', 'item', 'articulo'],
        required: false,
    },
    cantidad: {
        keywords: ['cantidad', 'cant', 'qty', 'unidades'],
        required: false,
    },
    importeUnitario: {
        keywords: ['importeunitario', 'importe_unitario', 'importe unitario', 'precio', 'preciounitario', 'precio_unitario', 'valor_unitario'],
        required: false,
    },
    importeTotal: {
        keywords: ['importetotal', 'importe_total', 'importe total', 'total', 'subtotal', 'monto'],
        required: false,
    },
    linea: {
        keywords: ['linea', 'línea', 'nro_linea', 'nrolinea', 'line', 'fila'],
        required: false,
    },
    importeCobrado: {
        keywords: ['importecobrado', 'importe_cobrado', 'importe cobrado', 'cobrado', 'pagado'],
        required: false,
    },
    aceptado: {
        keywords: ['aceptado', 'acepto', 'aprobado', 'confirmado', 'estado'],
        required: false,
    },
    fechaCaducidad: {
        keywords: ['fechacaducidad', 'fecha_caducidad', 'fecha caducidad', 'vencimiento', 'fecha_vencimiento', 'caduca', 'expira'],
        required: false,
    },
    presupDescripcion: {
        keywords: ['presup_descripcion', 'presupdescripcion', 'presup descripcion', 'descripcion_presupuesto', 'desc_presupuesto'],
        required: false,
    },
};


/**
 * Lee un archivo Excel de presupuestos y retorna las filas crudas
 */
export function parseBudgetExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

                // Leer como array de objetos (header = primera fila)
                const rows = XLSX.utils.sheet_to_json(firstSheet, {
                    defval: null,
                    raw: false,  // Para que las fechas vengan como strings
                });

                console.log(`[BudgetParser] ${rows.length} filas leídas del Excel`);
                resolve(rows);
            } catch (err) {
                console.error('[BudgetParser] Error parsing Excel:', err);
                reject(new Error(`Error al leer el archivo: ${err.message}`));
            }
        };

        reader.onerror = () => reject(new Error('Error al leer el archivo'));
        reader.readAsArrayBuffer(file);
    });
}


/**
 * Detecta columnas del Excel mapeándolas a campos conocidos
 */
function detectBudgetColumns(columnNames) {
    const mapping = {};
    const unmapped = [];
    const normalizedCols = columnNames.map(c => c.toLowerCase().trim().replace(/[\s_]+/g, ''));

    for (const [field, matcher] of Object.entries(BUDGET_FIELD_MATCHERS)) {
        let found = false;
        for (const keyword of matcher.keywords) {
            const normalizedKey = keyword.replace(/[\s_]+/g, '');
            const idx = normalizedCols.findIndex(c => c === normalizedKey || c.includes(normalizedKey));
            if (idx !== -1) {
                mapping[field] = columnNames[idx];
                found = true;
                break;
            }
        }
        if (!found && matcher.required) {
            throw new Error(`Columna requerida "${field}" no encontrada. Columnas disponibles: ${columnNames.join(', ')}`);
        }
    }

    // Detectar columnas no mapeadas
    for (const col of columnNames) {
        const isMapped = Object.values(mapping).includes(col);
        if (!isMapped) unmapped.push(col);
    }

    console.log('[BudgetParser] Mapeo detectado:', mapping);
    if (unmapped.length) console.log('[BudgetParser] Columnas ignoradas:', unmapped);

    return { mapping, unmapped };
}


/**
 * Parsea una fecha del Excel a formato ISO
 */
function parseBudgetDate(dateValue) {
    if (!dateValue) return null;

    // Si ya es un Date object
    if (dateValue instanceof Date) {
        return dateValue.toISOString().split('T')[0];
    }

    const str = String(dateValue).trim();
    if (!str) return null;

    // Formato: YYYY-MM-DD o YYYY-MM-DDTHH:mm:ss
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
        return str.split('T')[0].split(' ')[0];
    }

    // Formato: DD/MM/YYYY
    const ddmmyyyy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (ddmmyyyy) {
        const [, d, m, y] = ddmmyyyy;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // Formato: MM/DD/YYYY
    const mmddyyyy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (mmddyyyy) {
        return str; // fallback
    }

    console.warn(`[BudgetParser] Fecha no reconocida: "${str}"`);
    return null;
}


/**
 * Parsea un valor numérico limpiando separadores de miles
 */
function parseNumber(value) {
    if (value === null || value === undefined || value === '' || value === 'NULL') return 0;
    if (typeof value === 'number') return value;
    // Limpiar: quitar $, espacios, puntos de miles, comas → punto decimal
    const cleaned = String(value).replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}


/**
 * Mapea filas del Excel a estructura de presupuestos agrupados
 * 
 * @param {Array<Object>} rows - Filas crudas del Excel
 * @returns {{ 
 *   presupuestos: Array<Object>,       // Cabeceras agrupadas
 *   totalRows: number,                 // Total de filas procesadas
 *   skippedNoPatient: number,          // Descartadas por falta de idPaciente
 *   skippedNoBudgetId: number,         // Descartadas por falta de idPresupuesto
 *   columnMapping: Object, 
 *   unmappedColumns: string[] 
 * }}
 */
export function mapExcelToBudgets(rows) {
    if (!rows || rows.length === 0) {
        return { presupuestos: [], totalRows: 0, skippedNoPatient: 0, skippedNoBudgetId: 0, columnMapping: {}, unmappedColumns: [] };
    }

    const columnNames = Object.keys(rows[0]);
    const { mapping, unmapped } = detectBudgetColumns(columnNames);

    // Helper para extraer valor
    const getValue = (row, field) => {
        const colName = mapping[field];
        if (!colName) return null;
        const val = row[colName];
        return val !== undefined && val !== null && val !== 'NULL' ? val : null;
    };

    // Agrupar filas por idPresupuesto
    const grouped = {};
    let skippedNoPatient = 0;
    let skippedNoBudgetId = 0;

    let globalRowIdx = 0;

    for (const row of rows) {
        globalRowIdx++;
        const idPresupuesto = getValue(row, 'idPresupuesto');
        const idPaciente = getValue(row, 'idPaciente');

        // --- FILTRO CRÍTICO: descartar filas sin idPaciente ---
        if (!idPaciente) {
            skippedNoPatient++;
            continue;
        }

        if (!idPresupuesto) {
            skippedNoBudgetId++;
            continue;
        }

        const budgetKey = String(idPresupuesto);

        if (!grouped[budgetKey]) {
            // Crear cabecera del presupuesto (datos de la primera fila)
            grouped[budgetKey] = {
                header: {
                    id_presupuesto: parseInt(budgetKey, 10),
                    id_paciente: String(idPaciente).trim(),
                    paciente: getValue(row, 'paciente') ? String(getValue(row, 'paciente')).trim() : null,
                    fecha: parseBudgetDate(getValue(row, 'fecha')),
                    observaciones: getValue(row, 'observaciones') ? String(getValue(row, 'observaciones')).trim() : null,
                    aceptado: getValue(row, 'aceptado') ? String(getValue(row, 'aceptado')).trim().toLowerCase() : null,
                    fecha_caducidad: parseBudgetDate(getValue(row, 'fechaCaducidad')),
                    presup_descripcion: getValue(row, 'presupDescripcion') ? String(getValue(row, 'presupDescripcion')).trim() : null,
                },
                items: [],
                lineCounter: 0,
            };
        }

        // Agregar línea de ítem — usar lineCounter propio del presupuesto para garantizar unicidad
        grouped[budgetKey].lineCounter++;
        const lineNum = getValue(row, 'linea');
        grouped[budgetKey].items.push({
            id_presupuesto: parseInt(budgetKey, 10),
            linea: lineNum ? parseInt(lineNum, 10) : grouped[budgetKey].lineCounter,
            id_articulo: getValue(row, 'idArticulo') ? String(getValue(row, 'idArticulo')).trim() : `ITEM_${grouped[budgetKey].lineCounter}`,
            descripcion: getValue(row, 'descripcion') ? String(getValue(row, 'descripcion')).trim() : null,
            cantidad: parseNumber(getValue(row, 'cantidad')) || 1,
            importe_unitario: parseNumber(getValue(row, 'importeUnitario')),
            importe_total: parseNumber(getValue(row, 'importeTotal')),
            importe_cobrado: parseNumber(getValue(row, 'importeCobrado')),
        });
    }

    // Calcular totales por presupuesto
    const presupuestos = Object.values(grouped).map(({ header, items }) => ({
        ...header,
        total_items: items.length,
        importe_total: items.reduce((sum, it) => sum + it.importe_total, 0),
        importe_cobrado: items.reduce((sum, it) => sum + it.importe_cobrado, 0),
        _items: items,  // Para el upsert de ítems
    }));

    console.log(`[BudgetParser] ${presupuestos.length} presupuestos agrupados de ${rows.length} filas`);
    console.log(`[BudgetParser] Descartados: ${skippedNoPatient} sin idPaciente, ${skippedNoBudgetId} sin idPresupuesto`);

    return {
        presupuestos,
        totalRows: rows.length,
        skippedNoPatient,
        skippedNoBudgetId,
        columnMapping: mapping,
        unmappedColumns: unmapped,
    };
}


/**
 * Valida los presupuestos mapeados
 */
export function validateBudgets(presupuestos) {
    const valid = [];
    const invalid = [];
    const warnings = [];

    for (const p of presupuestos) {
        const errors = [];

        if (!p.id_presupuesto) errors.push('Falta id_presupuesto');
        if (!p.id_paciente) errors.push('Falta id_paciente');
        if (!p._items || p._items.length === 0) errors.push('Sin ítems');

        if (errors.length > 0) {
            invalid.push({ ...p, _errors: errors });
        } else {
            // Warning si no tiene fecha de caducidad
            if (!p.fecha_caducidad) {
                warnings.push(`Presupuesto ${p.id_presupuesto}: sin fecha de caducidad`);
            }
            valid.push(p);
        }
    }

    return { valid, invalid, warnings };
}
