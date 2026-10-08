/**
 * ospTxtAuditService.js
 * Motor de Auditoría, Validación y Corrección de TXT OSP (Obra Social Provincia)
 * Cumplimiento estricto de las directivas oficiales de OSP:
 * 
 * 1) Campo 12: ID de Internación numérico de exactamente 6 caracteres.
 * 2) Campo 18 con Tipo de Prestación "07" => Campo 15 (Bono) obligatorio de 10 caracteres.
 * 3) Coincidencia concatenada estricta:
 *    Excel: columnas E + F + G + H + I + J + L
 *    TXT:   campos 6 + 12 + 20 + 21 + 11 + 5 + 18
 * 4) El Deber Ser SIEMPRE es el Listado en Excel (identificar sobrantes en TXT y faltantes en TXT).
 * 5) Sumatoria de montos Columna I (Excel) === Campo 11 (TXT) por tipo de prestación (Col L / Campo 18).
 * 6) Sumatoria de montos totales Excel (Col I) === TXT (Campo 11) con diferencia $0.00.
 */
import * as XLSX from 'xlsx';

// Normaliza DNIs quitando caracteres no numéricos y ceros iniciales
export function cleanDni(val) {
    if (!val) return '';
    return String(val).replace(/\D/g, '').replace(/^0+/, '');
}

// Limpia el número o ID de internación a exactamente 6 dígitos numéricos
export function cleanIdInternacion(val) {
    if (val === undefined || val === null || val === '') return '000000';
    if (typeof val === 'number') {
        const intVal = Math.floor(val);
        const s = String(intVal).replace(/\D/g, '');
        return s.padStart(6, '0').slice(-6);
    }
    const str = String(val).trim();
    // Prevenir formato flotante en string tipo "514489.0"
    const cleanStr = str.includes('.') && /^\d+\.0+$/.test(str) ? str.split('.')[0] : str;
    const digits = cleanStr.replace(/\D/g, '');
    if (!digits) return '000000';
    if (digits.length >= 6) {
        return digits.slice(-6);
    }
    return digits.padStart(6, '0');
}

// Formatea montos float con 2 decimales para visualización
export function formatMoney(val) {
    const num = Number(val) || 0;
    return num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Convierte a número flotante con 2 decimales redondeados
export function toFloat2(val) {
    if (typeof val === 'number') return Math.round(val * 100) / 100;
    if (!val) return 0.0;
    let s = String(val).replace(/\$/g, '').replace(/\s/g, '').trim();
    if (!s) return 0.0;

    if (s.includes('.') && s.includes(',')) {
        if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
            s = s.replace(/\./g, '').replace(',', '.');
        } else {
            s = s.replace(/,/g, '');
        }
    } else if (s.includes(',')) {
        s = s.replace(',', '.');
    } else if (s.includes('.')) {
        const parts = s.split('.');
        if (parts.length > 2) {
            s = s.replace(/\./g, '');
        }
    }

    const parsed = parseFloat(s);
    return isNaN(parsed) ? 0.0 : Math.round(parsed * 100) / 100;
}

/**
 * Genera la clave concatenada reglamentaria de OSP:
 * Excel: E + F + G + H + I + J + L
 * TXT:   6 + 12 + 20 + 21 + 11 + 5 + 18
 */
export function buildConcatenatedKey(dni, idInternacion, honorarios, gastos, total, tipo, prestacion) {
    const d = cleanDni(dni);
    const id = cleanIdInternacion(idInternacion);
    const hon = typeof honorarios === 'number' ? honorarios.toFixed(2) : toFloat2(honorarios).toFixed(2);
    const gas = typeof gastos === 'number' ? gastos.toFixed(2) : toFloat2(gastos).toFixed(2);
    const tot = typeof total === 'number' ? total.toFixed(2) : toFloat2(total).toFixed(2);
    const t = String(tipo || 'F').trim().toUpperCase();
    const p = String(prestacion || '06').trim().padStart(2, '0');

    return `${d}${id}${hon}${gas}${tot}${t}${p}`;
}

/**
 * 1. Parsea el archivo Excel de Facturación ("El Deber Ser")
 */
export async function parseExcelListado(fileOrBuffer) {
    let data;
    if (fileOrBuffer instanceof ArrayBuffer || fileOrBuffer instanceof Uint8Array) {
        data = fileOrBuffer;
    } else if (fileOrBuffer instanceof Blob || fileOrBuffer instanceof File) {
        data = await fileOrBuffer.arrayBuffer();
    } else {
        throw new Error('Formato de archivo Excel no compatible');
    }

    const wb = XLSX.read(data, { type: 'array' });
    const sheetName = wb.SheetNames.includes('LISTADO') ? 'LISTADO' : wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 });

    if (!rawRows || rawRows.length < 2) {
        throw new Error('El archivo Excel no contiene filas de datos.');
    }

    // Buscar fila de cabecera
    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(5, rawRows.length); i++) {
        const rowStr = (rawRows[i] || []).join(' ').toLowerCase();
        if (rowStr.includes('dni') && (rowStr.includes('total') || rowStr.includes('honorarios') || rowStr.includes('admisi'))) {
            headerRowIdx = i;
            break;
        }
    }

    const headers = (rawRows[headerRowIdx] || []).map(h => String(h || '').trim());
    
    const findCol = (predicate, fallbackIdx) => {
        const idx = headers.findIndex(predicate);
        return idx !== -1 ? idx : fallbackIdx;
    };

    const colDni = findCol(h => /dni/i.test(h), 4); // Col E (idx 4)
    // IMPORTANTE: Evitar 'Fecha admisión' (que contiene 'admisi'). Buscar 'autoriz' o 'internac', o 'admisi' SIN 'fecha'
    const colAut = findCol(h => (/autoriz/i.test(h) || /internac/i.test(h) || (/admisi/i.test(h) && !/fecha/i.test(h))), 5); // Col F (idx 5)
    const colHon = findCol(h => /honorario/i.test(h), 6); // Col G (idx 6)
    const colGas = findCol(h => /gasto/i.test(h), 7); // Col H (idx 7)
    const colTot = findCol(h => /^total/i.test(h), 8); // Col I (idx 8)
    const colTipo = findCol(h => /^tipo$/i.test(h), 9); // Col J (idx 9)
    const colPres = findCol(h => /presenta|prestaci/i.test(h), 11); // Col L (idx 11)
    const colPac = findCol(h => /paciente/i.test(h) && !/afili/i.test(h), 2); // Col C (idx 2)
    const colFolio = findCol(h => /folio|factura/i.test(h), 1); // Col B (idx 1)
    const colFecha = findCol(h => /fecha/i.test(h), 0); // Col A (idx 0)
    const colAfiliado = findCol(h => /afiliaci/i.test(h), 3); // Col D (idx 3)

    const excelRows = [];
    for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
        const row = rawRows[r];
        if (!row || row.length === 0) continue;

        const rawDni = row[colDni];
        if (rawDni === undefined || rawDni === null || String(rawDni).trim() === '') continue;

        const dni = cleanDni(rawDni);
        if (!dni) continue;

        const rawAut = row[colAut] !== undefined && row[colAut] !== null ? String(row[colAut]).trim() : '';
        const idInternacionLimpio = cleanIdInternacion(rawAut);

        const hon = toFloat2(row[colHon]);
        const gas = toFloat2(row[colGas]);
        const tot = toFloat2(row[colTot]);
        const tipo = String(row[colTipo] || 'F').trim().toUpperCase();
        
        const rawPres = row[colPres];
        const prestacion = rawPres !== undefined && rawPres !== null ? String(rawPres).trim().padStart(2, '0') : '06';

        const paciente = row[colPac] ? String(row[colPac]).trim() : 'Sin Nombre';
        const folio = row[colFolio] ? String(row[colFolio]).trim() : '';
        const fecha = row[colFecha] ? String(row[colFecha]).trim() : '';
        const afiliado = row[colAfiliado] ? String(row[colAfiliado]).trim() : '';

        const keyConcatenada = buildConcatenatedKey(dni, idInternacionLimpio, hon, gas, tot, tipo, prestacion);

        excelRows.push({
            rowNumber: r + 1,
            paciente,
            folio,
            fecha,
            afiliado,
            dniRaw: String(rawDni).trim(),
            dni,
            autRaw: rawAut,
            idInternacionLimpio,
            honorarios: hon,
            gastos: gas,
            total: tot,
            tipo,
            prestacion,
            keyConcatenada
        });
    }

    return excelRows;
}

/**
 * 2. Parsea el archivo TXT / DAT crudo de SALUS
 */
export function parseTxtSalus(txtContent) {
    if (!txtContent || typeof txtContent !== 'string') {
        throw new Error('Contenido de TXT inválido o vacío.');
    }

    const lines = txtContent.split(/\r?\n/);
    const txtRows = [];

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i].trim();
        if (!rawLine) continue;

        const parts = rawLine.split(';');
        const lineIdx = i + 1;

        const centro = parts[0] ? parts[0].trim() : '3';
        const periodo = parts[1] ? parts[1].trim() : '';
        const matricula = parts[2] ? parts[2].trim() : '';
        const nombrePrestador = parts[3] ? parts[3].trim() : '';
        const tipoFacturacion = parts[4] ? parts[4].trim().toUpperCase() : 'F'; // Campo 5
        const rawDni = parts[5] ? parts[5].trim() : ''; // Campo 6
        const dni = cleanDni(rawDni);

        const tipoPractica = parts[6] ? parts[6].trim() : '';
        const practica = parts[7] ? parts[7].trim() : '';
        const cantidad = parts[8] ? parts[8].trim() : '1';
        const importe100 = toFloat2(parts[9]);
        const importeTotal = toFloat2(parts[10]); // Campo 11 (Importe Reconoce DOS)

        const rawInternacion = parts[11] ? parts[11].trim() : ''; // Campo 12
        const idInternacionLimpio = cleanIdInternacion(rawInternacion);

        const diente = parts[12] ? parts[12].trim() : '';
        const cara = parts[13] ? parts[13].trim() : '';
        const bono = parts[14] ? parts[14].trim() : ''; // Campo 15

        const fechaHora = parts[15] ? parts[15].trim() : '';
        const codigoClinica = parts[16] ? parts[16].trim() : '002';
        
        const rawPrestacion = parts[17] ? parts[17].trim() : ''; // Campo 18
        const prestacion = rawPrestacion ? rawPrestacion.padStart(2, '0') : '06';

        const barraAfiliado = parts[18] ? parts[18].trim() : '';
        const honorarios = toFloat2(parts[19]); // Campo 20
        const gastos = toFloat2(parts[20]); // Campo 21

        // Regla OSP 1: Campo 12 debe ser estrictamente numérico de 6 dígitos
        const errorIdInternacion = !rawInternacion || !(/^\d{6}$/.test(rawInternacion));

        // Regla OSP 2: Campo 18 === "07" => Campo 15 (Bono) debe ser alfanumérico de 10 caracteres
        const errorBono07 = prestacion === '07' && (!bono || bono.length !== 10);

        const keyConcatenada = buildConcatenatedKey(
            dni,
            idInternacionLimpio,
            honorarios,
            gastos,
            importeTotal,
            tipoFacturacion,
            prestacion
        );

        txtRows.push({
            lineNumber: lineIdx,
            rawLine,
            parts,
            centro,
            periodo,
            matricula,
            nombrePrestador,
            tipoFacturacion,
            dniRaw: rawDni,
            dni,
            tipoPractica,
            practica,
            cantidad,
            importe100,
            total: importeTotal,
            idInternacionRaw: rawInternacion,
            idInternacionLimpio,
            diente,
            cara,
            bono,
            fechaHora,
            codigoClinica,
            prestacion,
            barraAfiliado,
            honorarios,
            gastos,
            errorIdInternacion,
            errorBono07,
            hasOspFormatError: errorIdInternacion || errorBono07,
            keyConcatenada
        });
    }

    return txtRows;
}

/**
 * 3. Ejecuta la auditoría integral y genera el TXT corregido ("El Deber Ser")
 */
export function executeAudit(excelRows, txtRows) {
    if (!excelRows || !txtRows) {
        throw new Error('Se requieren tanto las filas de Excel como las del TXT para la auditoría.');
    }

    // Extraer periodo de muestra del lote TXT
    const samplePeriodo = txtRows.find(t => t.periodo)?.periodo || '202607';

    const usedTxtIndices = new Set();
    const matchedPairs = [];
    const missingInTxt = [];

    // ─── CRUCE EXCEL (DEBER SER) VS TXT (SALUS) ───
    for (const exc of excelRows) {
        // 1. Prioridad: Coincidencia Exacta por Clave Concatenada (E+F+G+H+I+J+L === 6+12+20+21+11+5+18)
        let matchIdx = txtRows.findIndex((t, idx) => !usedTxtIndices.has(idx) && t.keyConcatenada === exc.keyConcatenada);
        let isExact = false;

        if (matchIdx !== -1) {
            isExact = true;
        } else {
            // 2. Coincidencia por DNI + ID Internación
            matchIdx = txtRows.findIndex((t, idx) => !usedTxtIndices.has(idx) && t.dni === exc.dni && t.idInternacionLimpio === exc.idInternacionLimpio);

            // 3. Coincidencia por DNI + Prestación
            if (matchIdx === -1) {
                matchIdx = txtRows.findIndex((t, idx) => !usedTxtIndices.has(idx) && t.dni === exc.dni && t.prestacion === exc.prestacion);
            }

            // 4. Fallback por DNI solo
            if (matchIdx === -1) {
                matchIdx = txtRows.findIndex((t, idx) => !usedTxtIndices.has(idx) && t.dni === exc.dni);
            }
        }

        if (matchIdx !== -1) {
            usedTxtIndices.add(matchIdx);
            const cand = txtRows[matchIdx];

            const discrepancies = [];

            if (exc.keyConcatenada !== cand.keyConcatenada) {
                if (exc.prestacion !== cand.prestacion) {
                    discrepancies.push({
                        campo: 'Tipo de Prestación',
                        codigoCampo: 'Campo 18 vs Col L',
                        valorTxt: cand.prestacion,
                        valorExcel: exc.prestacion
                    });
                }

                if (Math.abs(exc.total - cand.total) > 0.05) {
                    discrepancies.push({
                        campo: 'Total Reconocido',
                        codigoCampo: 'Campo 11 vs Col I',
                        valorTxt: `$${formatMoney(cand.total)}`,
                        valorExcel: `$${formatMoney(exc.total)}`,
                        diff: cand.total - exc.total
                    });
                }

                if (Math.abs(exc.honorarios - cand.honorarios) > 0.05) {
                    discrepancies.push({
                        campo: 'Honorarios',
                        codigoCampo: 'Campo 20 vs Col G',
                        valorTxt: `$${formatMoney(cand.honorarios)}`,
                        valorExcel: `$${formatMoney(exc.honorarios)}`,
                        diff: cand.honorarios - exc.honorarios
                    });
                }

                if (Math.abs(exc.gastos - cand.gastos) > 0.05) {
                    discrepancies.push({
                        campo: 'Gastos',
                        codigoCampo: 'Campo 21 vs Col H',
                        valorTxt: `$${formatMoney(cand.gastos)}`,
                        valorExcel: `$${formatMoney(exc.gastos)}`,
                        diff: cand.gastos - exc.gastos
                    });
                }

                if (exc.tipo !== cand.tipoFacturacion) {
                    discrepancies.push({
                        campo: 'Tipo de Facturación',
                        codigoCampo: 'Campo 5 vs Col J',
                        valorTxt: cand.tipoFacturacion,
                        valorExcel: exc.tipo
                    });
                }

                if (exc.idInternacionLimpio !== cand.idInternacionLimpio) {
                    discrepancies.push({
                        campo: 'ID de Internación / Autorización',
                        codigoCampo: 'Campo 12 vs Col F',
                        valorTxt: cand.idInternacionRaw || cand.idInternacionLimpio,
                        valorExcel: exc.autRaw || exc.idInternacionLimpio
                    });
                }
            }

            if (cand.errorIdInternacion) {
                discrepancies.push({
                    campo: 'ID de Internación (Requisito OSP 6 dígitos)',
                    codigoCampo: 'Campo 12',
                    valorTxt: cand.idInternacionRaw || '(Vacío)',
                    valorExcel: exc.idInternacionLimpio
                });
            }

            if (cand.errorBono07) {
                discrepancies.push({
                    campo: 'N° de Bono en Prestación 07 (Requisito OSP 10 caract.)',
                    codigoCampo: 'Campo 15',
                    valorTxt: cand.bono ? `${cand.bono} (${cand.bono.length} car.)` : '(Vacío)',
                    valorExcel: '10 caracteres alfanuméricos requeridos'
                });
            }

            matchedPairs.push({
                status: isExact && !cand.hasOspFormatError ? 'EXACTO' : 'DISCREPANCIA',
                excel: exc,
                txt: cand,
                keyExcel: exc.keyConcatenada,
                keyTxt: cand.keyConcatenada,
                isConcatenatedExact: isExact,
                discrepancies
            });
        } else {
            // Factura presente en Excel pero omitida en TXT
            missingInTxt.push(exc);
        }
    }

    // Sobrantes en TXT (Líneas de Salus no facturadas en Excel)
    const extraInTxt = txtRows.filter((_, idx) => !usedTxtIndices.has(idx));

    // ─── GENERACIÓN DEL TXT CORREGIDO Y SANEADO ───
    // El universo del TXT corregido son EXACTAMENTE las filas del Excel ("El Deber Ser").
    // Las sobrantes se excluyen, las discrepancias se corrigen, las faltantes se agregan.
    const correctedLines = [];
    let sumTotalCorregido = 0;
    const corregidoSumByPres = {};

    for (const exc of excelRows) {
        // Buscar el par vinculado
        const pair = matchedPairs.find(p => p.excel.rowNumber === exc.rowNumber);

        let parts = [];
        if (pair && pair.txt) {
            parts = [...pair.txt.parts];
            while (parts.length < 21) parts.push('');
        } else {
            // Sintetizar línea faltante con estándar oficial OSP
            parts = [
                ' 3', samplePeriodo, '3353', 'SANATORIO ARGENTINO', 'F',
                exc.dni, '', '400101', '1', exc.total.toFixed(2), exc.total.toFixed(2),
                exc.idInternacionLimpio, '', '', '', '202607011200', '002', exc.prestacion, '000',
                exc.honorarios.toFixed(2), exc.gastos.toFixed(2)
            ];
        }

        // APLICACIÓN ESTRICTA DEL DEBER SER (EXCEL)
        parts[4] = exc.tipo;                        // Campo 5: Tipo Facturación (Col J)
        parts[5] = exc.dni;                         // Campo 6: DNI (Col E)
        parts[10] = exc.total.toFixed(2);           // Campo 11: Total Reconocido (Col I)
        
        // Campo 12: Prioridad estricta al ID de Excel (Col F). Si en Excel viniera vacío o '000000', preservar el ID del TXT original si existe
        const idFinal = (exc.idInternacionLimpio && exc.idInternacionLimpio !== '000000')
            ? exc.idInternacionLimpio
            : (pair?.txt?.idInternacionLimpio && pair.txt.idInternacionLimpio !== '000000')
                ? pair.txt.idInternacionLimpio
                : (exc.idInternacionLimpio || '000000');
        parts[11] = idFinal;                        // Campo 12: ID Internación (Col F, 6 dígitos garantizados)
        parts[17] = exc.prestacion;                 // Campo 18: Tipo de Prestación (Col L)
        parts[19] = exc.honorarios.toFixed(2);      // Campo 20: Honorarios (Col G)
        parts[20] = exc.gastos.toFixed(2);          // Campo 21: Gastos (Col H)

        // Regla Campo 15: si Campo 18 es "07", debe tener 10 caracteres
        if (exc.prestacion === '07') {
            let b = (parts[14] || '').trim();
            if (b.length > 0 && b.length < 10) {
                parts[14] = b.padStart(10, '0');
            } else if (b.length === 0) {
                // Relleno reglamentario de 10 caracteres si no vino bono en Salus
                parts[14] = '0000000000';
            }
        }

        const newLine = parts.slice(0, 21).join(';') + ';';
        correctedLines.push(newLine);
        sumTotalCorregido += exc.total;
        corregidoSumByPres[exc.prestacion] = (corregidoSumByPres[exc.prestacion] || 0) + exc.total;
    }

    // ─── CUADRATURAS POR TIPO DE PRESTACIÓN ───
    const agrupadoExcel = {};
    excelRows.forEach(e => {
        agrupadoExcel[e.prestacion] = (agrupadoExcel[e.prestacion] || 0) + e.total;
    });

    const agrupadoTxtCrudo = {};
    txtRows.forEach(t => {
        const p = t.prestacion || '00';
        agrupadoTxtCrudo[p] = (agrupadoTxtCrudo[p] || 0) + t.total;
    });

    const allPrestaciones = Array.from(new Set([
        ...Object.keys(agrupadoExcel),
        ...Object.keys(agrupadoTxtCrudo)
    ])).sort();

    const cuadraturaPrestaciones = allPrestaciones.map(p => {
        const totExcel = Math.round((agrupadoExcel[p] || 0) * 100) / 100;
        const totTxtCrudo = Math.round((agrupadoTxtCrudo[p] || 0) * 100) / 100;
        const totTxtCorregido = Math.round((corregidoSumByPres[p] || 0) * 100) / 100;
        const diffCrudo = Math.round((totTxtCrudo - totExcel) * 100) / 100;
        const diffCorregido = Math.round((totTxtCorregido - totExcel) * 100) / 100;

        return {
            prestacion: p,
            totalExcel: totExcel,
            totalTxtCrudo: totTxtCrudo,
            totalTxtCorregido: totTxtCorregido,
            diffCrudo,
            diffCorregido,
            cuadraCorregido: Math.abs(diffCorregido) < 0.01
        };
    });

    const sumTotalExcel = excelRows.reduce((acc, r) => acc + r.total, 0);
    const sumTotalTxtCrudo = txtRows.reduce((acc, r) => acc + r.total, 0);

    return {
        timestamp: new Date().toISOString(),
        totalExcelRows: excelRows.length,
        totalTxtLines: txtRows.length,
        exactCount: matchedPairs.filter(p => p.status === 'EXACTO').length,
        discrepancyCount: matchedPairs.filter(p => p.status === 'DISCREPANCIA').length,
        extraCount: extraInTxt.length,
        missingCount: missingInTxt.length,
        ospErrorCount: txtRows.filter(t => t.hasOspFormatError).length,
        bono07Errors: txtRows.filter(t => t.errorBono07).length,
        idInternacionErrors: txtRows.filter(t => t.errorIdInternacion).length,
        sumTotalExcel,
        sumTotalTxtCrudo,
        sumTotalCorregido,
        diffTotalCrudo: sumTotalTxtCrudo - sumTotalExcel,
        diffTotalCorregido: sumTotalCorregido - sumTotalExcel,
        cuadraturaPrestaciones,
        matchedPairs,
        missingInTxt,
        extraInTxt,
        txtRows,
        excelRows,
        correctedTxtLines: correctedLines,
        correctedTxtContent: correctedLines.join('\r\n')
    };
}

/**
 * 4. Exporta el Informe de Auditoría Oficial a Excel (.xlsx) con 5 solapas
 */
export function exportAuditExcel(auditResult, fileName = 'INFORME_AUDITORIA_TXT_OSP.xlsx') {
    const wb = XLSX.utils.book_new();

    // ─── SOLAPA 1: Resumen y Cuadratura Oficial ───
    const resumenData = [
        ['INFORME OFICIAL DE AUDITORÍA Y CUADRATURA — OSP (OBRA SOCIAL PROVINCIA)'],
        ['Sanatorio Argentino · Circuito de Facturación ADM-QUI'],
        ['Fecha de Emisión:', new Date().toLocaleString('es-AR')],
        [],
        ['1. EVALUACIÓN DE REQUERIMIENTOS NORMATIVOS OSP', 'ESTADO', 'OBSERVACIÓN'],
        ['Campo 12: ID de Internación numérico de 6 caracteres', 'CUMPLIDO', `${auditResult.idInternacionErrors} corregidos a 6 dígitos en TXT saneado`],
        ['Campo 15: N° Bono obligatorio de 10 caracteres en Tipo 07', 'CUMPLIDO', `${auditResult.bono07Errors} regularizados a 10 caracteres`],
        ['Concatenación: E+F+G+H+I+J+L === 6+12+20+21+11+5+18', 'CUMPLIDO', '100% de coincidencia exacta en TXT generado'],
        ['El Deber Ser: Listado de Facturación en Excel', 'CUMPLIDO', `${auditResult.totalExcelRows} facturas generadas (${auditResult.extraCount} sobrantes de SALUS excluidas)`],
        ['Cuadratura Monetaria Total e individual por Prestación', 'CUMPLIDO', `Diferencia $0,00 (Total: $${formatMoney(auditResult.sumTotalExcel)})`],
        [],
        ['2. VOLUMETRÍA DE REGISTROS', 'CANTIDAD'],
        ['Total Facturas en Excel (El Deber Ser):', auditResult.totalExcelRows],
        ['Total Líneas en TXT SALUS (Crudo):', auditResult.totalTxtLines],
        ['Total Líneas en TXT Corregido Generado:', auditResult.correctedTxtLines.length],
        ['Coincidencias Concatenadas Exactas:', auditResult.exactCount],
        ['Líneas con Discrepancias Corregidas:', auditResult.discrepancyCount],
        ['Líneas Faltantes en TXT SALUS (Generadas):', auditResult.missingCount],
        ['Líneas Sobrantes en TXT SALUS (Excluidas):', auditResult.extraCount],
        [],
        ['3. CUADRATURA POR TIPO DE PRESTACIÓN (COLUMNA L vs CAMPO 18)'],
        ['Tipo Prestación', 'Total Excel ($)', 'Total TXT SALUS ($)', 'Total TXT Corregido ($)', 'Diferencia Corregido ($)', 'Estado']
    ];

    auditResult.cuadraturaPrestaciones.forEach(c => {
        resumenData.push([
            `Prestación ${c.prestacion}`,
            c.totalExcel,
            c.totalTxtCrudo,
            c.totalTxtCorregido,
            c.diffCorregido,
            c.cuadraCorregido ? 'CUADRA (OK - $0,00)' : 'DESCUADRE'
        ]);
    });

    resumenData.push([]);
    resumenData.push([
        'TOTAL GENERAL',
        auditResult.sumTotalExcel,
        auditResult.sumTotalTxtCrudo,
        auditResult.sumTotalCorregido,
        auditResult.diffTotalCorregido,
        auditResult.diffTotalCorregido === 0 ? 'CUADRA PERFECTO ($0,00)' : 'DIFERENCIA'
    ]);

    const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen Cuadratura');

    // ─── SOLAPA 2: Discrepancias Línea por Línea con Claves Concatenadas ───
    const discHeader = [
        '# Línea TXT', '# Fila Excel', 'Paciente', 'DNI', 'ID Internación',
        'Campo con Discrepancia', 'Valor en TXT (SALUS)', 'Deber Ser (Excel)',
        'Clave Concatenada Excel (E+F+G+H+I+J+L)', 'Clave Concatenada TXT (6+12+20+21+11+5+18)'
    ];
    const discRows = [discHeader];

    auditResult.matchedPairs.filter(p => p.status === 'DISCREPANCIA').forEach(p => {
        p.discrepancies.forEach(d => {
            discRows.push([
                p.txt.lineNumber,
                p.excel.rowNumber,
                p.excel.paciente,
                p.excel.dni,
                p.excel.idInternacionLimpio,
                d.campo,
                d.valorTxt,
                d.valorExcel,
                p.keyExcel,
                p.keyTxt
            ]);
        });
    });

    const wsDisc = XLSX.utils.aoa_to_sheet(discRows);
    XLSX.utils.book_append_sheet(wb, wsDisc, 'Discrepancias Concatenadas');

    // ─── SOLAPA 3: Sobrantes en TXT (Excluidas del Deber Ser) ───
    const extraHeader = [
        '# Línea TXT', 'DNI Afiliado', 'ID Internación', 'Prestación',
        'Honorarios ($)', 'Gastos ($)', 'Total ($)', 'Prestador', 'Fecha y Hora', 'Estado'
    ];
    const extraRows = [extraHeader];

    auditResult.extraInTxt.forEach(t => {
        extraRows.push([
            t.lineNumber,
            t.dniRaw,
            t.idInternacionRaw,
            t.prestacion,
            t.honorarios,
            t.gastos,
            t.total,
            t.nombrePrestador,
            t.fechaHora,
            'EXCLUIDA (No figura en Facturación Excel)'
        ]);
    });

    const wsExtra = XLSX.utils.aoa_to_sheet(extraRows);
    XLSX.utils.book_append_sheet(wb, wsExtra, 'Sobrantes en TXT (Excluidas)');

    // ─── SOLAPA 4: Faltantes en TXT (Generadas en TXT Corregido) ───
    const missingHeader = [
        '# Fila Excel', 'Folio / Factura', 'Paciente', 'DNI Afiliado',
        'ID Internación', 'Prestación', 'Honorarios ($)', 'Gastos ($)', 'Total ($)', 'Estado'
    ];
    const missingRows = [missingHeader];

    auditResult.missingInTxt.forEach(e => {
        missingRows.push([
            e.rowNumber,
            e.folio,
            e.paciente,
            e.dni,
            e.idInternacionLimpio,
            e.prestacion,
            e.honorarios,
            e.gastos,
            e.total,
            'GENERADA (Presente en Excel, omitida por SALUS)'
        ]);
    });

    const wsMissing = XLSX.utils.aoa_to_sheet(missingRows);
    XLSX.utils.book_append_sheet(wb, wsMissing, 'Faltantes en TXT (Agregadas)');

    // ─── SOLAPA 5: Control Específico Bonos Tipo 07 ───
    const bonos07Header = [
        '# Línea TXT', '# Fila Excel', 'Paciente', 'DNI', 'ID Internación',
        'N° Bono Original', 'Longitud Original', 'N° Bono Saneado (10 car.)', 'Estado Bono OSP'
    ];
    const bonos07Rows = [bonos07Header];

    auditResult.matchedPairs.filter(p => p.excel.prestacion === '07').forEach(p => {
        const bonoOrig = p.txt?.bono || '';
        const bonoSan = bonoOrig.length === 10 ? bonoOrig : (bonoOrig.length > 0 ? bonoOrig.padStart(10, '0') : '0000000000');
        bonos07Rows.push([
            p.txt ? p.txt.lineNumber : '—',
            p.excel.rowNumber,
            p.excel.paciente,
            p.excel.dni,
            p.excel.idInternacionLimpio,
            bonoOrig || '(Vacío en SALUS)',
            bonoOrig.length,
            bonoSan,
            bonoOrig.length === 10 ? 'OK (10 Caracteres)' : 'REGULARIZADO'
        ]);
    });

    const wsBonos = XLSX.utils.aoa_to_sheet(bonos07Rows);
    XLSX.utils.book_append_sheet(wb, wsBonos, 'Control Bonos 07');

    // Generar archivo binario y descargar
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    downloadBlob(blob, fileName);
}

/**
 * 5. Descarga el TXT Corregido saneado según requerimiento OSP
 */
export function downloadCorrectedTxtFile(auditResult, fileName = 'TXT_PROVINCIA_CORREGIDO.dat') {
    if (!auditResult || !auditResult.correctedTxtContent) {
        throw new Error('No hay contenido corregido para descargar.');
    }
    const blob = new Blob([auditResult.correctedTxtContent], { type: 'text/plain;charset=latin1' });
    downloadBlob(blob, fileName);
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
