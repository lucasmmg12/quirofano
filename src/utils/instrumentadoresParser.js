/**
 * instrumentadoresParser.js
 * Parser para planillas Excel de Instrumentadores Quirúrgicos — Sanatorio Argentino
 * Lee siempre la primera hoja del libro Excel y genera analítica de cirujanos y procedimientos.
 */
import * as XLSX from 'xlsx';
import { formatExcelDate, parseExcelNumber, normalizeKey } from './guardiaLiquidacionParser.js';

/**
 * Procesa el archivo Excel de Instrumentadores Quirúrgicos
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {Object} options - Parámetros configurables
 * @returns {Object} Datos procesados de instrumentadores con analítica
 */
export function parseInstrumentadoresExcel(buffer, options = {}) {
    const periodoDefault = options.periodo || 'Mayo 2026';
    const liquidacionDefault = options.liquidacion || '410';

    const wb = XLSX.read(buffer, { type: 'array' });
    
    // REGLA: Usar SIEMPRE la primera hoja
    const wsDetalle = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(wsDetalle);

    const instrumentadoresMap = {};
    const cirujanosMap = {};
    const procedimientosMap = {};

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
        const procedimiento = String(r['Procedimiento quirúrgico'] || r.Procedimiento || '').trim() || 'No Especificado';
        const observacion = String(r['Observacion procedimiento'] || r['Observación'] || r.Observacion || '').trim();
        const valor = parseExcelNumber(r.Valor || r.Importe);
        const cirujano = String(r.Cirujano || '').trim() || 'Sin Especificar';
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

        // Métricas de Cirujanos
        if (!cirujanosMap[cirujano]) {
            cirujanosMap[cirujano] = { cirujano, cirugias: 0, montoTotal: 0 };
        }
        cirujanosMap[cirujano].cirugias++;
        cirujanosMap[cirujano].montoTotal += valor;

        // Métricas de Procedimientos
        if (!procedimientosMap[procedimiento]) {
            procedimientosMap[procedimiento] = { procedimiento, cantidad: 0, montoTotal: 0 };
        }
        procedimientosMap[procedimiento].cantidad++;
        procedimientosMap[procedimiento].montoTotal += valor;
    });

    const instrumentadoresList = Object.values(instrumentadoresMap);
    instrumentadoresList.sort((a, b) => a.nombre.localeCompare(b.nombre));

    const totalProcedimientosGlobal = instrumentadoresList.reduce((acc, p) => acc + p.procedimientos.length, 0);
    const totalFacturadoGlobal = instrumentadoresList.reduce((acc, p) => acc + p.totalValor, 0);
    const ticketPromedioGlobal = totalProcedimientosGlobal > 0 ? (totalFacturadoGlobal / totalProcedimientosGlobal) : 0;
    const promedioPorInstrumentador = instrumentadoresList.length > 0 ? (totalProcedimientosGlobal / instrumentadoresList.length) : 0;

    const rankingCirujanos = Object.values(cirujanosMap).sort((a, b) => b.cirugias - a.cirugias);
    const rankingProcedimientos = Object.values(procedimientosMap).sort((a, b) => b.cantidad - a.cantidad);

    return {
        tipo: 'instrumentadores',
        periodo: periodoDefault,
        liquidacion: liquidacionDefault,
        totalInstrumentadores: instrumentadoresList.length,
        totalPrestadores: instrumentadoresList.length,
        totalAtenciones: totalProcedimientosGlobal,
        totalProcedimientosGlobal,
        totalFacturadoGlobal,
        totalFacturadoBrutoGlobal: totalFacturadoGlobal,
        granTotalGlobal: totalFacturadoGlobal,
        ticketPromedioGlobal,
        promedioAtencionesPorMedico: promedioPorInstrumentador,
        instrumentadores: instrumentadoresList,
        prestadores: instrumentadoresList,
        analytics: {
            totalCirujanos: rankingCirujanos.length,
            totalProcedimientosUnicos: rankingProcedimientos.length,
            rankingCirujanos,
            rankingProcedimientos,
            metricasObrasSociales: rankingProcedimientos.map(p => ({
                obraSocial: p.procedimiento,
                atenciones: p.cantidad,
                pctAtenciones: totalProcedimientosGlobal > 0 ? Number(((p.cantidad / totalProcedimientosGlobal) * 100).toFixed(2)) : 0,
                montoBruto: p.montoTotal,
                pctMonto: totalFacturadoGlobal > 0 ? Number(((p.montoTotal / totalFacturadoGlobal) * 100).toFixed(2)) : 0,
                montoNeto: p.montoTotal,
                cantMedicos: 1
            }))
        }
    };
}
