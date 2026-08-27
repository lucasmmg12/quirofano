/**
 * guardiaLiquidacionParser.js
 * Parser para planillas Excel de Guardia Pediátrica — Sanatorio Argentino
 * Lee siempre la primera hoja del libro Excel y aplica la retención del 30% (70% neto)
 * y el cálculo discriminado de adicionales por Obra Social (ej: 001 - PROVINCIA y 004 - DAMSU).
 * Genera métricas analíticas completas por Médico y por Obra Social.
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
 * @returns {Object} Datos procesados de guardia con métricas analíticas
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

    // Mapa para métricas de Obras Sociales
    const obrasSocialesMap = {};

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
                conteoPorOS: {},
                totalCantidadAdicional: 0,
                totalMontoAdicional: 0,
                totalGeneralConAdicional: 0,
                obrasSocialesSet: new Set()
            };
        }

        const fechaFormatted = formatExcelDate(fechaRaw);
        const cliente = String(r.Cliente || r['Obra Social'] || '').trim() || 'Sin Especificar';
        const valor = parseExcelNumber(r.Valor || r.Importe);

        prestadoresMap[responsable].atenciones.push({
            index: idx + 1,
            fecha: fechaFormatted,
            paciente,
            obraSocial: cliente,
            importe: valor
        });

        prestadoresMap[responsable].totalImporteBruto += valor;
        prestadoresMap[responsable].obrasSocialesSet.add(cliente);

        // Agrupación para Métricas de Obra Social
        if (!obrasSocialesMap[cliente]) {
            obrasSocialesMap[cliente] = {
                obraSocial: cliente,
                atenciones: 0,
                montoBruto: 0,
                cantidadAdicional: 0,
                montoAdicional: 0,
                medicosSet: new Set()
            };
        }
        obrasSocialesMap[cliente].atenciones++;
        obrasSocialesMap[cliente].montoBruto += valor;
        obrasSocialesMap[cliente].medicosSet.add(responsable);

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

            obrasSocialesMap[cliente].cantidadAdicional++;
            obrasSocialesMap[cliente].montoAdicional += osValor;
        }
    });

    // Calcular montos de honorarios netos (-30%) y adicionales discriminados
    const prestadoresList = Object.values(prestadoresMap).map(p => {
        const montoRetencion = p.totalImporteBruto * (porcentajeRetencion / 100);
        const totalHonorariosNeto = p.totalImporteBruto - montoRetencion; // 70% neto
        const adicionalesDiscriminados = Object.values(p.conteoPorOS);
        const ticketPromedio = p.atenciones.length > 0 ? (p.totalImporteBruto / p.atenciones.length) : 0;

        return {
            ...p,
            totalImporte: p.totalImporteBruto,
            montoRetencion,
            totalHonorariosNeto,
            adicionalesDiscriminados,
            totalGeneralConAdicional: totalHonorariosNeto + p.totalMontoAdicional,
            ticketPromedio,
            cantObrasSociales: p.obrasSocialesSet.size,
            obrasSocialesSet: undefined // limpiar Set para JSON serialization
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
    const ticketPromedioGlobal = totalAtenciones > 0 ? (totalFacturadoBrutoGlobal / totalAtenciones) : 0;
    const promedioAtencionesPorMedico = prestadoresList.length > 0 ? (totalAtenciones / prestadoresList.length) : 0;

    // Métricas estructuradas de Obras Sociales
    const metricasObrasSociales = Object.values(obrasSocialesMap).map(os => {
        const pctAtenciones = totalAtenciones > 0 ? ((os.atenciones / totalAtenciones) * 100) : 0;
        const pctMonto = totalFacturadoBrutoGlobal > 0 ? ((os.montoBruto / totalFacturadoBrutoGlobal) * 100) : 0;
        const montoNeto = os.montoBruto * factorHonorarios;
        const ticketPromedioOS = os.atenciones > 0 ? (os.montoBruto / os.atenciones) : 0;

        return {
            obraSocial: os.obraSocial,
            atenciones: os.atenciones,
            pctAtenciones: Number(pctAtenciones.toFixed(2)),
            montoBruto: os.montoBruto,
            pctMonto: Number(pctMonto.toFixed(2)),
            montoNeto,
            cantidadAdicional: os.cantidadAdicional,
            montoAdicional: os.montoAdicional,
            cantMedicos: os.medicosSet.size,
            ticketPromedio: ticketPromedioOS
        };
    }).sort((a, b) => b.atenciones - a.atenciones);

    // Rankings de Médicos
    const rankingMedicosPorAtenciones = [...prestadoresList]
        .sort((a, b) => b.atenciones.length - a.atenciones.length)
        .map((p, rank) => ({
            rank: rank + 1,
            id: p.id,
            nombre: p.nombre,
            matricula: p.matricula,
            atenciones: p.atenciones.length,
            pctAtenciones: totalAtenciones > 0 ? Number(((p.atenciones.length / totalAtenciones) * 100).toFixed(2)) : 0,
            totalImporteBruto: p.totalImporteBruto,
            totalHonorariosNeto: p.totalHonorariosNeto,
            totalMontoAdicional: p.totalMontoAdicional,
            totalGeneral: p.totalGeneralConAdicional,
            ticketPromedio: p.ticketPromedio
        }));

    const rankingMedicosPorMonto = [...prestadoresList]
        .sort((a, b) => b.totalGeneralConAdicional - a.totalGeneralConAdicional)
        .map((p, rank) => ({
            rank: rank + 1,
            id: p.id,
            nombre: p.nombre,
            matricula: p.matricula,
            atenciones: p.atenciones.length,
            totalImporteBruto: p.totalImporteBruto,
            totalHonorariosNeto: p.totalHonorariosNeto,
            totalMontoAdicional: p.totalMontoAdicional,
            totalGeneral: p.totalGeneralConAdicional
        }));

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
        ticketPromedioGlobal,
        promedioAtencionesPorMedico,
        prestadores: prestadoresList,
        // Analítica estructurada para dashboard y guardado histórico
        analytics: {
            totalObrasSociales: metricasObrasSociales.length,
            metricasObrasSociales,
            rankingMedicosPorAtenciones,
            rankingMedicosPorMonto,
            topObraSocial: metricasObrasSociales[0] || null,
            topMedico: rankingMedicosPorAtenciones[0] || null
        }
    };
}
