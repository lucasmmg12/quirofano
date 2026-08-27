/**
 * instrumentadoresParser.js
 * Parser para planillas Excel de Instrumentadores Quirúrgicos — Sanatorio Argentino
 */
import * as XLSX from 'xlsx';
import { formatExcelDate, parseExcelNumber, normalizeKey } from './guardiaLiquidacionParser.js';

/**
 * Procesa el archivo Excel de Instrumentadores Quirúrgicos
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {Object} options - Parámetros configurables
 * @returns {Object} Datos procesados de instrumentadores
 */
export function parseInstrumentadoresExcel(buffer, options = {}) {
    const periodoDefault = options.periodo || 'Mayo 2026';
    const liquidacionDefault = options.liquidacion || '410';

    const wb = XLSX.read(buffer, { type: 'array' });
    const sheetNames = wb.SheetNames;

    // Buscar hoja detalle resumido o usar la primera
    const detalleSheetName = sheetNames.find(n => n.toLowerCase().includes('detalle')) || sheetNames[0];
    const wsDetalle = wb.Sheets[detalleSheetName];
    const rawRows = XLSX.utils.sheet_to_json(wsDetalle);

    const instrumentadoresMap = {};

    rawRows.forEach((r, idx) => {
        const instRaw = r['Instrumentador/a'] || r.Instrumentador || r.Instrumentadora || r.Profesional || '';
        const instrumentador = String(instRaw).trim();

        if (!instrumentador || instrumentador.toLowerCase().includes('total') || instrumentador.length < 3) return;

        if (!instrumentadoresMap[instrumentador]) {
            instrumentadoresMap[instrumentador] = {
                id: instrumentador.toLowerCase().replace(/[^a-z0-9]/g, '_'),
                nombre: instrumentador,
                matricula: '',
                periodo: periodoDefault,
                liquidacion: liquidacionDefault,
                procedimientos: [],
                totalValor: 0,
            };
        }

        const fechaFormatted = formatExcelDate(r['Fecha visita'] || r['Fecha Visita'] || r.Fecha);
        const paciente = String(r.Paciente || '').trim();
        const procedimiento = String(r['Procedimiento quirúrgico'] || r.Procedimiento || '').trim();
        const observacion = String(r['Observacion procedimiento'] || r['Observación'] || r.Observacion || '').trim();
        const valor = parseExcelNumber(r.Valor || r.Importe);
        const cirujano = String(r.Cirujano || '').trim();
        const horaComienzo = r['Hora de comienzo'] || '';
        const horaFin = r['Hora Finalización'] || '';
        const observacionFecha = r['Observacion fecha'] || '';

        instrumentadoresMap[instrumentador].procedimientos.push({
            index: idx + 1,
            horaComienzo,
            horaFin,
            fecha: fechaFormatted,
            paciente,
            procedimiento,
            observacion,
            valor,
            cirujano,
            observacionFecha
        });

        instrumentadoresMap[instrumentador].totalValor += valor;
    });

    // Leer metadatos de hojas individuales si existen
    sheetNames.forEach(sheetName => {
        if (sheetName !== detalleSheetName) {
            const ws = wb.Sheets[sheetName];
            const raw = XLSX.utils.sheet_to_json(ws, { header: 1 });
            if (raw.length > 3) {
                let profName = '';
                let mat = '';
                let per = '';
                let liq = '';

                raw.slice(0, 5).forEach(row => {
                    if (Array.isArray(row)) {
                        const line = row.filter(Boolean).join(' ');
                        if (line.includes('Profesional:')) profName = line.split('Profesional:')[1].trim();
                        if (line.includes('matrícula:') || line.includes('matricula:')) {
                            mat = line.split(/matr[ií]cula:/i)[1].trim();
                        }
                        if (line.includes('Periodo de liquidación:') || line.includes('Periodo:')) {
                            per = line.split(/Periodo[^:]*:/i)[1].trim();
                        }
                        if (line.includes('Liquidación:') || line.includes('Liquidacion:')) {
                            liq = line.split(/Liquidaci[oó]n:/i)[1].trim();
                        }
                    }
                });

                const sheetNorm = normalizeKey(sheetName);
                const profNorm = normalizeKey(profName);

                const matchKey = Object.keys(instrumentadoresMap).find(k => {
                    const kNorm = normalizeKey(k);
                    return (
                        kNorm === sheetNorm ||
                        kNorm.includes(sheetNorm) ||
                        sheetNorm.includes(kNorm) ||
                        (profNorm && (kNorm === profNorm || kNorm.includes(profNorm) || profNorm.includes(kNorm)))
                    );
                });

                if (matchKey && instrumentadoresMap[matchKey]) {
                    if (mat) instrumentadoresMap[matchKey].matricula = mat;
                    if (per) instrumentadoresMap[matchKey].periodo = per;
                    if (liq) instrumentadoresMap[matchKey].liquidacion = liq;
                }
            }
        }
    });

    const instrumentadoresList = Object.values(instrumentadoresMap);
    instrumentadoresList.sort((a, b) => a.nombre.localeCompare(b.nombre));

    const totalProcedimientosGlobal = instrumentadoresList.reduce((acc, p) => acc + p.procedimientos.length, 0);
    const totalFacturadoGlobal = instrumentadoresList.reduce((acc, p) => acc + p.totalValor, 0);

    return {
        tipo: 'instrumentadores',
        periodo: periodoDefault,
        liquidacion: liquidacionDefault,
        totalInstrumentadores: instrumentadoresList.length,
        totalProcedimientosGlobal,
        totalFacturadoGlobal,
        instrumentadores: instrumentadoresList
    };
}
