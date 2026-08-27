/**
 * guardiaLiquidacionParser.js
 * Parser para planillas Excel de Guardia Pediátrica — Sanatorio Argentino
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
 * y descarta anotaciones de cuentas, fórmulas, códigos matemáticos o estadísticas.
 */
export function isValidDoctorName(name) {
    if (!name || typeof name !== 'string') return false;
    const clean = name.trim();
    if (clean.length < 3) return false;
    // Excluir anotaciones de fórmulas, cálculos, divisiones o barras (ej: '420006 = 232 /// 420009 = 1605')
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
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {Object} options - Parámetros configurables
 * @returns {Object} Datos procesados de guardia
 */
export function parseGuardiaExcel(buffer, options = {}) {
    const valorAdicional = options.valorAdicional !== undefined ? options.valorAdicional : 8000;
    const obrasSocialesAdicional = options.obrasSocialesAdicional || ['001 - PROVINCIA', '004 - DAMSU'];
    const periodoDefault = options.periodo || 'Mayo 2026';
    const liquidacionDefault = options.liquidacion || '410';

    const wb = XLSX.read(buffer, { type: 'array' });
    const sheetNames = wb.SheetNames;

    // Buscar hoja detalle o usar la primera
    const detalleSheetName = sheetNames.find(n => n.toLowerCase().includes('detalle')) || sheetNames[0];
    const wsDetalle = wb.Sheets[detalleSheetName];
    const rawRows = XLSX.utils.sheet_to_json(wsDetalle);

    // Agrupación por profesional
    const prestadoresMap = {};

    rawRows.forEach((r, idx) => {
        const responsableRaw = r.Responsable || r.Profesional || r.Medico || r['Médico'] || '';
        const responsable = String(responsableRaw).trim();
        
        // Validar nombre legítimo de médico
        if (!isValidDoctorName(responsable)) return;

        // Validar también que la fila no sea un pie estadístico o de totales
        const fechaRaw = r['Fecha Visita'] || r.Fecha || r['Fecha visita'];
        const fechaStr = String(fechaRaw || '').trim().toLowerCase();
        if (fechaStr.includes('cantidad') || fechaStr.includes('total') || fechaStr.includes('neto')) return;

        const paciente = String(r.Paciente || '').trim();
        if (!paciente || paciente.toLowerCase().includes('total') || paciente.toLowerCase().includes('consultas')) return;

        // Si paciente es solo un número y no hay fecha serial válida, es fila estadística
        if (/^\d+$/.test(paciente) && (!fechaRaw || isNaN(Number(fechaRaw)))) return;

        if (!prestadoresMap[responsable]) {
            prestadoresMap[responsable] = {
                id: responsable.toLowerCase().replace(/[^a-z0-9]/g, '_'),
                nombre: responsable,
                matricula: '',
                periodo: periodoDefault,
                liquidacion: liquidacionDefault,
                atenciones: [],
                totalImporte: 0,
                adicionalesPorOS: {},
                totalCantidadAdicional: 0,
                totalMontoAdicional: 0
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

        prestadoresMap[responsable].totalImporte += valor;

        // Verificar si aplica adicional
        const aplicaAdicional = obrasSocialesAdicional.some(os => cliente.toLowerCase().includes(os.toLowerCase()));
        if (aplicaAdicional) {
            const osMatch = obrasSocialesAdicional.find(os => cliente.toLowerCase().includes(os.toLowerCase())) || cliente;
            prestadoresMap[responsable].adicionalesPorOS[osMatch] = (prestadoresMap[responsable].adicionalesPorOS[osMatch] || 0) + 1;
            prestadoresMap[responsable].totalCantidadAdicional++;
        }
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
                        if (line.includes('Liquidación Nº:') || line.includes('Liquidacion:')) {
                            liq = line.split(/Liquidaci[oó]n[^:]*:/i)[1].trim();
                        }
                    }
                });

                if (profName) {
                    const normProf = normalizeKey(profName);
                    const matchingKey = Object.keys(prestadoresMap).find(k => normalizeKey(k) === normProf);
                    if (matchingKey) {
                        if (mat) prestadoresMap[matchingKey].matricula = mat;
                        if (per) prestadoresMap[matchingKey].periodo = per;
                        if (liq) prestadoresMap[matchingKey].liquidacion = liq;
                    }
                }
            }
        }
    });

    // Calcular montos de adicionales y totales
    const prestadoresList = Object.values(prestadoresMap).map(p => {
        const totalMontoAdicional = p.totalCantidadAdicional * valorAdicional;
        return {
            ...p,
            totalMontoAdicional,
            totalGeneralConAdicional: p.totalImporte + totalMontoAdicional
        };
    });

    // Ordenar alfabéticamente
    prestadoresList.sort((a, b) => a.nombre.localeCompare(b.nombre));

    // Métricas globales
    const totalFacturadoGlobal = prestadoresList.reduce((acc, p) => acc + p.totalImporte, 0);
    const totalCantidadAdicionalesGlobal = prestadoresList.reduce((acc, p) => acc + p.totalCantidadAdicional, 0);
    const totalAdicionalesGlobal = prestadoresList.reduce((acc, p) => acc + p.totalMontoAdicional, 0);
    const granTotalGlobal = totalFacturadoGlobal + totalAdicionalesGlobal;
    const totalAtenciones = prestadoresList.reduce((acc, p) => acc + p.atenciones.length, 0);

    return {
        tipo: 'guardia_pediatrica',
        periodo: periodoDefault,
        numeroLiquidacion: liquidacionDefault,
        valorAdicional,
        obrasSocialesAdicional,
        totalPrestadores: prestadoresList.length,
        totalAtenciones,
        totalFacturadoGlobal,
        totalCantidadAdicionalesGlobal,
        totalAdicionalesGlobal,
        granTotalGlobal,
        prestadores: prestadoresList
    };
}
