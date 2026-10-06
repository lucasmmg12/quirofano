/**
 * ospTxtAuditService.js
 * Motor de Auditoría, Validación y Corrección de TXT OSP (Obra Social Provincia)
 * Contrastando contra el Listado de Facturación en Excel ("El Deber Ser").
 */
import * as XLSX from 'xlsx';

// Normaliza DNIs quitando caracteres no numéricos y ceros iniciales
export function cleanDni(val) {
    if (!val) return '';
    return String(val).replace(/\D/g, '').replace(/^0+/, '');
}

// Limpia el número o ID de internación a 6 dígitos numéricos
export function cleanIdInternacion(val) {
    if (!val) return '';
    const digits = String(val).replace(/\D/g, '');
    if (digits.length >= 6) {
        // Tomar los primeros 6 dígitos numéricos
        return digits.slice(0, 6);
    }
    return digits;
}

// Formatea montos float con 2 decimales
export function formatMoney(val) {
    const num = Number(val) || 0;
    return num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function toFloat2(val) {
    if (typeof val === 'number') return Math.round(val * 100) / 100;
    if (!val) return 0.0;
    const clean = String(val).replace(/\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0.0 : Math.round(parsed * 100) / 100;
}

/**
 * 1. Parsea el archivo Excel de Facturación
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

    // Buscar fila de cabecera (normalmente fila 0 o 1)
    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(5, rawRows.length); i++) {
        const rowStr = (rawRows[i] || []).join(' ').toLowerCase();
        if (rowStr.includes('dni') && (rowStr.includes('total') || rowStr.includes('honorarios') || rowStr.includes('admisi'))) {
            headerRowIdx = i;
            break;
        }
    }

    const headers = (rawRows[headerRowIdx] || []).map(h => String(h || '').trim());
    
    // Mapeo inteligente de columnas
    const findCol = (predicate, fallbackIdx) => {
        const idx = headers.findIndex(predicate);
        return idx !== -1 ? idx : fallbackIdx;
    };

    const colDni = findCol(h => /dni/i.test(h), 4); // Col E (idx 4)
    const colAut = findCol(h => /autoriz|admisi|internac/i.test(h), 5); // Col F (idx 5)
    const colHon = findCol(h => /honorario/i.test(h), 6); // Col G (idx 6)
    const colGas = findCol(h => /gasto/i.test(h), 7); // Col H (idx 7)
    const colTot = findCol(h => /^total/i.test(h), 8); // Col I (idx 8)
    const colTipo = findCol(h => /^tipo$/i.test(h), 9); // Col J (idx 9)
    const colPres = findCol(h => /presenta|prestaci/i.test(h), 11); // Col L (idx 11)
    const colPac = findCol(h => /paciente/i.test(h) && !/afili/i.test(h), 2); // Col C (idx 2)
    const colFolio = findCol(h => /folio|factura/i.test(h), 1); // Col B (idx 1)
    const colFecha = findCol(h => /fecha/i.test(h), 0); // Col A (idx 0)

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

        excelRows.push({
            rowNumber: r + 1,
            paciente,
            folio,
            fecha,
            dniRaw: String(rawDni).trim(),
            dni,
            autRaw: rawAut,
            idInternacionLimpio,
            honorarios: hon,
            gastos: gas,
            total: tot,
            tipo,
            prestacion,
            keyConcatenada: `${dni}${rawAut}${hon.toFixed(2)}${gas.toFixed(2)}${tot.toFixed(2)}${tipo}${prestacion}`
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
        // En la especificación oficial son 21 campos. Al tener ';' al final, split(';') genera 22 elementos.
        const lineIdx = i + 1;

        const centro = parts[0] ? parts[0].trim() : '3';
        const periodo = parts[1] ? parts[1].trim() : '';
        const matricula = parts[2] ? parts[2].trim() : '';
        const nombrePrestador = parts[3] ? parts[3].trim() : '';
        const tipoFacturacion = parts[4] ? parts[4].trim().toUpperCase() : 'F';
        const rawDni = parts[5] ? parts[5].trim() : '';
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
        const prestacion = rawPrestacion ? rawPrestacion.padStart(2, '0') : '';

        const barraAfiliado = parts[18] ? parts[18].trim() : '';
        const honorarios = toFloat2(parts[19]); // Campo 20
        const gastos = toFloat2(parts[20]); // Campo 21

        // Validaciones Intrínsecas OSP:
        // Regla 1: Campo 12 no puede estar vacío y debe ser numérico de 6 dígitos
        const errorIdInternacion = !rawInternacion || !(/^\d{6}$/.test(rawInternacion));

        // Regla 2: Cuando campo 18 es "07", campo 15 (Bono) debe tener 10 caracteres
        const errorBono07 = prestacion === '07' && (!bono || bono.length !== 10);

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
            hasOspFormatError: errorIdInternacion || errorBono07
        });
    }

    return txtRows;
}

/**
 * 3. Ejecuta la auditoría integral y genera el TXT corregido
 */
export function executeAudit(excelRows, txtRows) {
    if (!excelRows || !txtRows) {
        throw new Error('Se requieren tanto las filas de Excel como las del TXT para la auditoría.');
    }

    // Indexar TXT por combinación para cruce óptimo
    const txtByIndex = new Map();
    txtRows.forEach(t => txtByIndex.set(t.lineNumber, t));

    // Mapear TXT por (DNI + ID Internación)
    const txtByDniAndId = new Map();
    txtRows.forEach(t => {
        const key = `${t.dni}_${t.idInternacionLimpio}`;
        if (!txtByDniAndId.has(key)) txtByDniAndId.set(key, []);
        txtByDniAndId.get(key).push(t);
    });

    // Mapear TXT también solo por DNI (por si el ID vino completamente vacío en SALUS)
    const txtByDniOnly = new Map();
    txtRows.forEach(t => {
        if (!txtByDniOnly.has(t.dni)) txtByDniOnly.set(t.dni, []);
        txtByDniOnly.get(t.dni).push(t);
    });

    const usedTxtLines = new Set();
    const matchedPairs = []; // { excel, txt, status, discrepancies: [] }
    const missingInTxt = []; // En Excel pero no en TXT

    for (const exc of excelRows) {
        // 1. Intentar match por DNI + ID Internación
        const keyId = `${exc.dni}_${exc.idInternacionLimpio}`;
        const candsWithId = (txtByDniAndId.get(keyId) || []).filter(t => !usedTxtLines.has(t.lineNumber));

        let bestCand = null;

        if (candsWithId.length > 0) {
            // Si hay varios, priorizar el que coincida en prestación o montos
            bestCand = candsWithId.find(t => t.prestacion === exc.prestacion && Math.abs(t.total - exc.total) < 0.05) ||
                       candsWithId.find(t => t.prestacion === exc.prestacion) ||
                       candsWithId.find(t => Math.abs(t.total - exc.total) < 0.05) ||
                       candsWithId[0];
        } else {
            // 2. Fallback: match por DNI solo (si el ID internación en TXT está vacío o sucio)
            const candsByDni = (txtByDniOnly.get(exc.dni) || []).filter(t => !usedTxtLines.has(t.lineNumber));
            if (candsByDni.length > 0) {
                bestCand = candsByDni.find(t => t.prestacion === exc.prestacion && Math.abs(t.total - exc.total) < 0.05) ||
                           candsByDni.find(t => Math.abs(t.total - exc.total) < 0.05) ||
                           candsByDni[0];
            }
        }

        if (bestCand) {
            usedTxtLines.add(bestCand.lineNumber);

            // Analizar discrepancias campo por campo
            const discrepancies = [];

            if (exc.prestacion !== bestCand.prestacion) {
                discrepancies.push({
                    campo: 'Tipo de Prestación',
                    codigoCampo: 'Campo 18 vs Col L',
                    valorTxt: bestCand.prestacion,
                    valorExcel: exc.prestacion
                });
            }

            if (Math.abs(exc.total - bestCand.total) >= 0.01) {
                discrepancies.push({
                    campo: 'Total Reconocido',
                    codigoCampo: 'Campo 11 vs Col I',
                    valorTxt: `$${formatMoney(bestCand.total)}`,
                    valorExcel: `$${formatMoney(exc.total)}`,
                    diff: bestCand.total - exc.total
                });
            }

            if (Math.abs(exc.honorarios - bestCand.honorarios) >= 0.01) {
                discrepancies.push({
                    campo: 'Honorarios',
                    codigoCampo: 'Campo 20 vs Col G',
                    valorTxt: `$${formatMoney(bestCand.honorarios)}`,
                    valorExcel: `$${formatMoney(exc.honorarios)}`,
                    diff: bestCand.honorarios - exc.honorarios
                });
            }

            if (Math.abs(exc.gastos - bestCand.gastos) >= 0.01) {
                discrepancies.push({
                    campo: 'Gastos',
                    codigoCampo: 'Campo 21 vs Col H',
                    valorTxt: `$${formatMoney(bestCand.gastos)}`,
                    valorExcel: `$${formatMoney(exc.gastos)}`,
                    diff: bestCand.gastos - exc.gastos
                });
            }

            if (exc.tipo !== bestCand.tipoFacturacion) {
                discrepancies.push({
                    campo: 'Tipo de Facturación',
                    codigoCampo: 'Campo 5 vs Col J',
                    valorTxt: bestCand.tipoFacturacion,
                    valorExcel: exc.tipo
                });
            }

            if (bestCand.errorIdInternacion) {
                discrepancies.push({
                    campo: 'ID de Internación (Formato OSP)',
                    codigoCampo: 'Campo 12',
                    valorTxt: bestCand.idInternacionRaw || '(Vacío)',
                    valorExcel: exc.idInternacionLimpio || exc.autRaw
                });
            }

            if (bestCand.errorBono07) {
                discrepancies.push({
                    campo: 'N° de Bono en Tipo 07',
                    codigoCampo: 'Campo 15',
                    valorTxt: bestCand.bono || '(Vacío)',
                    valorExcel: 'Obligatorio 10 caracteres'
                });
            }

            const isExact = discrepancies.length === 0;

            matchedPairs.push({
                status: isExact ? 'EXACTO' : 'DISCREPANCIA',
                excel: exc,
                txt: bestCand,
                discrepancies
            });
        } else {
            // No se encontró en el TXT
            missingInTxt.push(exc);
        }
    }

    // Identificar sobrantes en TXT (líneas del TXT que nadie reclamó en el Excel)
    const extraInTxt = txtRows.filter(t => !usedTxtLines.has(t.lineNumber));

    // Cuadratura por Tipo de Prestación
    const agrupadoExcel = {};
    excelRows.forEach(e => {
        const p = e.prestacion;
        agrupadoExcel[p] = (agrupadoExcel[p] || 0) + e.total;
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
        const totTxt = Math.round((agrupadoTxtCrudo[p] || 0) * 100) / 100;
        const diff = Math.round((totTxt - totExcel) * 100) / 100;
        const cuadra = Math.abs(diff) < 0.05;

        return {
            prestacion: p,
            totalExcel: totExcel,
            totalTxt: totTxt,
            diferencia: diff,
            cuadra
        };
    });

    const sumTotalExcel = excelRows.reduce((acc, r) => acc + r.total, 0);
    const sumTotalTxtCrudo = txtRows.reduce((acc, r) => acc + r.total, 0);

    // ─── GENERACIÓN DEL TXT CORREGIDO ───
    // El TXT corregido toma la base de las líneas del TXT cruzadas con el Excel y aplica
    // estrictamente los valores del "Deber Ser":
    // 1) Corrige honorarios, gastos y total
    // 2) Corrige tipo de prestación y tipo facturación ('F')
    // 3) Sanea el Campo 12 a los 6 dígitos numéricos válidos
    // 4) Excluye automáticamente las líneas sobrantes
    const correctedLines = [];
    let sumTotalCorregido = 0;

    for (const pair of matchedPairs) {
        const { excel: e, txt: t } = pair;
        const parts = [...t.parts];

        // Asegurar que parts tenga al menos 21 elementos
        while (parts.length < 21) parts.push('');

        // Campo 5: Tipo Facturación
        parts[4] = e.tipo || 'F';

        // Campo 11: Importe Reconoce DOS (Total)
        parts[10] = e.total.toFixed(2);

        // Campo 12: ID de Internación (6 caracteres limpios)
        parts[11] = e.idInternacionLimpio || t.idInternacionLimpio || '000000';

        // Campo 18: Tipo de Prestación (2 caracteres)
        parts[17] = e.prestacion || '06';

        // Campo 20: Importe Honorarios Reconoce DOS
        parts[19] = e.honorarios.toFixed(2);

        // Campo 21: Importe Gastos Reconoce DOS
        parts[20] = e.gastos.toFixed(2);

        // Si es tipo 07 y no tiene bono, dejarlo en blanco o preservar si tenía
        if (parts[17] === '07' && (!parts[14] || parts[14].trim() === '')) {
            parts[14] = t.bono || '';
        }

        // Armar línea con delimitador ';' y punto y coma final
        const newLine = parts.slice(0, 21).join(';') + ';';
        correctedLines.push(newLine);
        sumTotalCorregido += e.total;
    }

    return {
        timestamp: new Date().toISOString(),
        totalExcelRows: excelRows.length,
        totalTxtLines: txtRows.length,
        exactCount: matchedPairs.filter(p => p.status === 'EXACTO').length,
        discrepancyCount: matchedPairs.filter(p => p.status === 'DISCREPANCIA').length,
        extraCount: extraInTxt.length,
        missingCount: missingInTxt.length,
        ospErrorCount: txtRows.filter(t => t.hasOspFormatError).length,
        sumTotalExcel,
        sumTotalTxtCrudo,
        sumTotalCorregido,
        diffTotal: sumTotalTxtCrudo - sumTotalExcel,
        cuadraturaPrestaciones,
        matchedPairs,
        missingInTxt,
        extraInTxt,
        txtRows,
        correctedTxtLines: correctedLines,
        correctedTxtContent: correctedLines.join('\r\n')
    };
}

/**
 * 4. Exporta el Informe de Auditoría a un archivo Excel (.xlsx) con 4 solapas
 */
export function exportAuditExcel(auditResult, fileName = 'INFORME_AUDITORIA_TXT_OSP.xlsx') {
    const wb = XLSX.utils.book_new();

    // ─── SOLAPA 1: Resumen y Cuadratura ───
    const resumenData = [
        ['INFORME DE AUDITORÍA Y CUADRATURA — TXT OSP vs LISTADO FACTURACIÓN'],
        ['Fecha de Proceso:', new Date().toLocaleString('es-AR')],
        [],
        ['INDICADORES CLAVE', 'VALOR'],
        ['Total Facturas en Excel (Deber Ser):', auditResult.totalExcelRows],
        ['Total Líneas en TXT SALUS (Crudo):', auditResult.totalTxtLines],
        ['Total Líneas Generadas en TXT Corregido:', auditResult.correctedTxtLines.length],
        ['Coincidencias Exactas (OK):', auditResult.exactCount],
        ['Líneas con Discrepancias de Datos:', auditResult.discrepancyCount],
        ['Facturas Faltantes en TXT (en Excel pero omitidas):', auditResult.missingCount],
        ['Líneas Sobrantes en TXT (en TXT pero no facturadas):', auditResult.extraCount],
        ['Líneas con Violaciones de Formato OSP:', auditResult.ospErrorCount],
        [],
        ['TOTALES MONETARIOS ($)', 'MONTO'],
        ['Total Facturación Excel (Deber Ser):', auditResult.sumTotalExcel],
        ['Total Archivo TXT Crudo SALUS:', auditResult.sumTotalTxtCrudo],
        ['Diferencia Global (TXT vs Excel):', auditResult.diffTotal],
        ['Total TXT Corregido Generado:', auditResult.sumTotalCorregido],
        [],
        ['CUADRATURA POR TIPO DE PRESTACIÓN'],
        ['Tipo Prestación', 'Total Excel ($)', 'Total TXT SALUS ($)', 'Diferencia ($)', 'Estado']
    ];

    auditResult.cuadraturaPrestaciones.forEach(c => {
        resumenData.push([
            `Prestación ${c.prestacion}`,
            c.totalExcel,
            c.totalTxt,
            c.diferencia,
            c.cuadra ? 'CUADRA (OK)' : 'DESCUADRE'
        ]);
    });

    const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen Cuadratura');

    // ─── SOLAPA 2: Discrepancias Línea por Línea ───
    const discHeader = [
        '# Línea TXT', '# Fila Excel', 'Paciente', 'DNI', 'ID Internación',
        'Campo con Discrepancia', 'Valor en TXT (SALUS)', 'Deber Ser (Excel)', 'Diferencia ($)'
    ];
    const discRows = [discHeader];

    auditResult.matchedPairs.filter(p => p.status === 'DISCREPANCIA').forEach(p => {
        p.discrepancies.forEach(d => {
            discRows.push([
                p.txt.lineNumber,
                p.excel.rowNumber,
                p.excel.paciente,
                p.excel.dni,
                p.excel.autRaw,
                d.campo,
                d.valorTxt,
                d.valorExcel,
                d.diff !== undefined ? d.diff : ''
            ]);
        });
    });

    const wsDisc = XLSX.utils.aoa_to_sheet(discRows);
    XLSX.utils.book_append_sheet(wb, wsDisc, 'Discrepancias');

    // ─── SOLAPA 3: Sobrantes en TXT ───
    const extraHeader = [
        '# Línea TXT', 'DNI Afiliado', 'ID Internación', 'Prestación',
        'Honorarios ($)', 'Gastos ($)', 'Total ($)', 'Prestador', 'Fecha y Hora'
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
            t.fechaHora
        ]);
    });

    const wsExtra = XLSX.utils.aoa_to_sheet(extraRows);
    XLSX.utils.book_append_sheet(wb, wsExtra, 'Sobrantes en TXT');

    // ─── SOLAPA 4: Faltantes en TXT ───
    const missingHeader = [
        '# Fila Excel', 'Folio / Factura', 'Paciente', 'DNI Afiliado',
        'ID Internación', 'Prestación', 'Honorarios ($)', 'Gastos ($)', 'Total ($)'
    ];
    const missingRows = [missingHeader];

    auditResult.missingInTxt.forEach(e => {
        missingRows.push([
            e.rowNumber,
            e.folio,
            e.paciente,
            e.dni,
            e.autRaw,
            e.prestacion,
            e.honorarios,
            e.gastos,
            e.total
        ]);
    });

    const wsMissing = XLSX.utils.aoa_to_sheet(missingRows);
    XLSX.utils.book_append_sheet(wb, wsMissing, 'Faltantes en TXT');

    // Generar archivo binario y descargar
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    downloadBlob(blob, fileName);
}

/**
 * 5. Descarga el TXT Corregido
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
