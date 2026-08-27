/**
 * guardiaLiquidacionParser.js
 * Parser para planillas Excel de Guardia Pediátrica — Sanatorio Argentino
 * Lee siempre la primera hoja del libro Excel y aplica la retención del 30% (70% neto)
 * y el cálculo discriminado de adicionales por Obra Social (ej: 001 - PROVINCIA y 004 - DAMSU).
 */
import * as XLSX from 'xlsx';

/**
 * Convierte un número serial de fecha de Excel o string a formato DD/MM/YYYY
 */
export function formatExcelDate(serialOrStr) {
    if (!serialOrStr) return '';
    if (typeof serialOrStr === 'string') {
        const trimmed = serialOrStr.trim();
        if (trimmed.includes('/') || trimmed.includes('-')) return trimmed;
        const num = Number(trimmed);
        if (!isNaN(num) && num > 20000) serialOrStr = num;
        else return trimmed;
    }
    if (typeof serialOrStr === 'number') {
        const date = new Date(Math.round((serialOrStr - 25569) * 86400 * 1000));
        const utcDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
        const day = String(utcDate.getDate()).padStart(2, '0');
        const month = String(utcDate.getMonth() + 1).padStart(2, '0');
        const year = utcDate.getFullYear();
        return `${day}/${month}/${year}`;
    }
    return String(serialOrStr);
}

/**
 * Normaliza nombres para comparación flexible
 */
export function normalizeKey(str) {
    if (!str) return '';
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

/**
 * Valida si un string corresponde a un nombre legítimo de profesional médico
 */
export function isValidDoctorName(name) {
    if (!name || typeof name !== 'string') return false;
    const clean = name.trim();
    if (clean.length < 3) return false;
    // Excluir anotaciones de fórmulas, cálculos, divisiones o barras
    if (clean.includes('=') || clean.includes('///') || clean.includes('+') || clean.includes('%')) return false;
    // Excluir si es puramente numérico
    if (/^\d+$/.test(clean.replace(/[\s\-\.\/]/g, ''))) return false;
    const lower = clean.toLowerCase();
    if (
        lower.includes('total') ||
        lower.includes('subtotal') ||
        lower.includes('cantidad') ||
        lower.includes('neto') ||
        lower.includes('consultas') ||
        lower.includes('porcentaje')
    ) {
        return false;
    }
    return true;
}

/**
 * Normaliza montos monetarios
 */
export function parseExcelNumber(val) {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const str = String(val)
        .replace(/[$]/g, '')
        .replace(/\s/g, '')
        .replace(/\./g, '')
        .replace(',', '.');
    const num = Number(str);
    return isNaN(num) ? 0 : num;
}

/**
 * Procesa el archivo Excel de Guardia Pediátrica
 * SIEMPRE toma la primera hoja del libro Excel
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {Object} options - Parámetros configurables
 * @returns {Object} Datos procesados de guardia
 */
export function parseGuardiaExcel(buffer, options = {}) {
    // Porcentaje de retención sanatorial (por defecto 30% retención = 70% neto)
    const porcentajeRetencion = options.porcentajeRetencion !== undefined ? options.porcentajeRetencion : 30;
    const porcentajeHonorarios = 100 - porcentajeRetencion; // 70%
    const factorHonorarios = porcentajeHonorarios / 100;

    // Configuración de adicionales por Obra Social (soporta array de objetos [{ obraSocial, valor }])
    const adicionalesConfig = options.adicionalesConfig || [
        { obraSocial: '001 - PROVINCIA', valor: 8000 },
        { obraSocial: '004 - DAMSU', valor: 8000 }
    ];

    const periodoDefault = options.periodo || 'Mayo 2026';
    const liquidacionDefault = options.liquidacion || '410';

    const wb = XLSX.read(buffer, { type: 'array' });
    
    // REGLA: Usar SIEMPRE la primera hoja del archivo Excel (index 0)
    const primeraHojaNombre = wb.SheetNames[0];
    const ws = wb.Sheets[primeraHojaNombre];
    const rawRows = XLSX.utils.sheet_to_json(ws);

    // Agrupación por profesional médico
    const prestadoresMap = {};

    rawRows.forEach((r, idx) => {
        const responsableRaw = r.Responsable || r.Profesional || r.Medico || r['Médico'] || '';
        const responsable = String(responsableRaw).trim();
        
        if (!isValidDoctorName(responsable)) return;

        // Validar que la fila no sea un pie estadístico o de totales
        const fechaRaw = r['Fecha Visita'] || r.Fecha || r['Fecha visita'];
        const fechaStr = String(fechaRaw || '').trim().toLowerCase();
        if (fechaStr.includes('cantidad') || fechaStr.includes('total') || fechaStr.includes('neto')) return;

        const paciente = String(r.Paciente || '').trim();
        if (!paciente || paciente.toLowerCase().includes('total') || paciente.toLowerCase().includes('consultas')) return;

        if (/^\d+$/.test(paciente) && (!fechaRaw || isNaN(Number(fechaRaw)))) return;

        if (!prestadoresMap[responsable]) {
            prestadoresMap[responsable] = {
                id: responsable.toLowerCase().replace(/[^a-z0-9]/g, '_'),
                nombre: responsable,
                matricula: '',
                periodo: periodoDefault,
                liquidacion: liquidacionDefault,
                porcentajeRetencion,
                porcentajeHonorarios,
                atenciones: [],
                totalImporteBruto: 0,
                montoRetencion: 0,
                totalHonorariosNeto: 0,
                // Conteo por cada Obra Social con adicional
                conteoPorOS: {},
                totalCantidadAdicional: 0,
                totalMontoAdicional: 0,
                totalGeneralConAdicional: 0
            };
        }

        const fechaFormatted = formatExcelDate(fechaRaw);
        const cliente = String(r.Cliente || r['Obra Social'] || '').trim();
        const valor = parseExcelNumber(r.Valor || r.Importe);

        prestadoresMap[responsable].atenciones.push({
            index: idx + 1,
            fecha: fechaFormatted,
            paciente,
            obraSocial: cliente,
            importe: valor
        });

        prestadoresMap[responsable].totalImporteBruto += valor;

        // Buscar si la obra social de la atención coincide con las configuradas para adicional
        const matchAdicional = adicionalesConfig.find(item => {
            const osKey = typeof item === 'string' ? item : item.obraSocial;
            return cliente.toLowerCase().includes(osKey.toLowerCase());
        });

        if (matchAdicional) {
            const osNombre = typeof matchAdicional === 'string' ? matchAdicional : matchAdicional.obraSocial;
            const osValor = typeof matchAdicional === 'string' ? 8000 : (matchAdicional.valor || 8000);
            
            if (!prestadoresMap[responsable].conteoPorOS[osNombre]) {
                prestadoresMap[responsable].conteoPorOS[osNombre] = {
                    obraSocial: osNombre,
                    valorUnitario: osValor,
                    cantidad: 0,
                    subtotal: 0
                };
            }
            prestadoresMap[responsable].conteoPorOS[osNombre].cantidad++;
            prestadoresMap[responsable].conteoPorOS[osNombre].subtotal += osValor;
            prestadoresMap[responsable].totalCantidadAdicional++;
            prestadoresMap[responsable].totalMontoAdicional += osValor;
        }
    });

    // Calcular montos de honorarios netos (-30%) y adicionales discriminados
    const prestadoresList = Object.values(prestadoresMap).map(p => {
        const montoRetencion = p.totalImporteBruto * (porcentajeRetencion / 100);
        const totalHonorariosNeto = p.totalImporteBruto - montoRetencion; // 70% neto

        // Array discriminado de adicionales por Obra Social
        const adicionalesDiscriminados = Object.values(p.conteoPorOS);

        return {
            ...p,
            totalImporte: p.totalImporteBruto,
            montoRetencion,
            totalHonorariosNeto,
            adicionalesDiscriminados,
            totalGeneralConAdicional: totalHonorariosNeto + p.totalMontoAdicional
        };
    });

    // Ordenar alfabéticamente
    prestadoresList.sort((a, b) => a.nombre.localeCompare(b.nombre));

    // Métricas globales consolidadas
    const totalFacturadoBrutoGlobal = prestadoresList.reduce((acc, p) => acc + p.totalImporteBruto, 0);
    const totalRetencionGlobal = totalFacturadoBrutoGlobal * (porcentajeRetencion / 100);
    const totalHonorariosNetoGlobal = totalFacturadoBrutoGlobal - totalRetencionGlobal;
    const totalCantidadAdicionalesGlobal = prestadoresList.reduce((acc, p) => acc + p.totalCantidadAdicional, 0);
    const totalAdicionalesGlobal = prestadoresList.reduce((acc, p) => acc + p.totalMontoAdicional, 0);
    const granTotalGlobal = totalHonorariosNetoGlobal + totalAdicionalesGlobal;
    const totalAtenciones = prestadoresList.reduce((acc, p) => acc + p.atenciones.length, 0);

    return {
        tipo: 'guardia_pediatrica',
        periodo: periodoDefault,
        numeroLiquidacion: liquidacionDefault,
        porcentajeRetencion,
        porcentajeHonorarios,
        adicionalesConfig,
        totalPrestadores: prestadoresList.length,
        totalAtenciones,
        totalFacturadoBrutoGlobal,
        totalFacturadoGlobal: totalFacturadoBrutoGlobal,
        totalRetencionGlobal,
        totalHonorariosNetoGlobal,
        totalCantidadAdicionalesGlobal,
        totalAdicionalesGlobal,
        granTotalGlobal,
        prestadores: prestadoresList
    };
}
