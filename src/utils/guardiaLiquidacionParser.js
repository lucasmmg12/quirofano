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
        // Si ya tiene formato fecha DD/MM/YYYY o YYYY-MM-DD
        if (trimmed.includes('/') || trimmed.includes('-')) return trimmed;
        const num = Number(trimmed);
        if (!isNaN(num) && num > 20000) serialOrStr = num;
        else return trimmed;
    }
    if (typeof serialOrStr === 'number') {
        // Excel fecha serial
        const date = new Date(Math.round((serialOrStr - 25569) * 86400 * 1000));
        // Ajuste de zona horaria local
        const utcDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
        const day = String(utcDate.getDate()).padStart(2, '0');
        const month = String(utcDate.getMonth() + 1).padStart(2, '0');
        const year = utcDate.getFullYear();
        return `${day}/${month}/${year}`;
    }
    return String(serialOrStr);
}

/**
 * Normaliza nombres para comparación flexible (ignora tildes, comas, espacios y mayúsculas)
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
        
        // Ignorar filas de resumen o vacías
        if (!responsable || responsable.toLowerCase().includes('total') || responsable.length < 3) return;

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

        const fechaFormatted = formatExcelDate(r['Fecha Visita'] || r.Fecha || r['Fecha visita']);
        const paciente = String(r.Paciente || '').trim();
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
            // Identificar cuál OS es
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
                // Buscar Profesional, Matrícula, etc.
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

                // Si encontramos coincidencia en el mapa
                const sheetNorm = normalizeKey(sheetName);
                const profNorm = normalizeKey(profName);

                const matchKey = Object.keys(prestadoresMap).find(k => {
                    const kNorm = normalizeKey(k);
                    return (
                        kNorm === sheetNorm ||
                        kNorm.includes(sheetNorm) ||
                        sheetNorm.includes(kNorm) ||
                        (profNorm && (kNorm === profNorm || kNorm.includes(profNorm) || profNorm.includes(kNorm)))
                    );
                });

                if (matchKey && prestadoresMap[matchKey]) {
                    if (mat) prestadoresMap[matchKey].matricula = mat;
                    if (per) prestadoresMap[matchKey].periodo = per;
                    if (liq) prestadoresMap[matchKey].liquidacion = liq;
                }
            }
        }
    });

    // Calcular montos de adicionales para cada prestador
    const prestadoresList = Object.values(prestadoresMap).map(p => {
        p.totalMontoAdicional = p.totalCantidadAdicional * valorAdicional;
        p.totalGeneralConAdicional = p.totalImporte + p.totalMontoAdicional;
        return p;
    });

    // Ordenar alfabéticamente
    prestadoresList.sort((a, b) => a.nombre.localeCompare(b.nombre));

    // Totales globales
    const totalAtenciones = prestadoresList.reduce((acc, p) => acc + p.atenciones.length, 0);
    const totalFacturadoGlobal = prestadoresList.reduce((acc, p) => acc + p.totalImporte, 0);
    const totalAdicionalesGlobal = prestadoresList.reduce((acc, p) => acc + p.totalMontoAdicional, 0);
    const totalCantidadAdicionalesGlobal = prestadoresList.reduce((acc, p) => acc + p.totalCantidadAdicional, 0);

    return {
        tipo: 'guardia_pediatrica',
        periodo: periodoDefault,
        liquidacion: liquidacionDefault,
        valorAdicional,
        obrasSocialesAdicional,
        totalPrestadores: prestadoresList.length,
        totalAtenciones,
        totalFacturadoGlobal,
        totalCantidadAdicionalesGlobal,
        totalAdicionalesGlobal,
        granTotalGlobal: totalFacturadoGlobal + totalAdicionalesGlobal,
        prestadores: prestadoresList
    };
}
