import ExcelJS from 'exceljs';

/**
 * Paleta cromática corporativa Premium - Sanatorio Argentino
 * Desarrollado para el Sector de Innovación y Transformación Digital
 */
const PALETTE = {
    navyDark: 'FF0A192F',        // Azul noche institucional profundo
    navyHeader: 'FF0F2744',      // Azul marino Sanatorio Argentino
    blueBrand: 'FF1D4ED8',       // Azul zafiro corporativo
    blueAccent: 'FF2563EB',     // Azul brillante
    blueLight: 'FFEFF6FF',       // Azul cielo pastel
    tealBrand: 'FF0D9488',       // Teal / Aguamarina tecnológico (Innovación)
    tealLight: 'FFF0FDFA',
    greenEmerald: 'FF059669',    // Verde esmeralda cobranzas / éxito
    greenLight: 'FFECFDF5',      // Verde menta suave para badges y KPIs
    greenText: 'FF065F46',
    purpleIndigo: 'FF6366F1',    // Índigo planes de pago
    purpleLight: 'FFEEF2FF',
    purpleText: 'FF4338CA',
    amberGold: 'FFD97706',       // Ámbar alertas y pendientes
    amberLight: 'FFFFFBEB',
    zebraBg: 'FFF8FAFC',         // Gris azulado muy suave para filas alternas
    cardBg: 'FFF1F5F9',
    white: 'FFFFFFFF',
    borderLight: 'FFE2E8F0',
    borderDark: 'FF94A3B8',
    borderBrand: 'FF60A5FA',
    textDark: 'FF0F172A',
    textMuted: 'FF475569',
};

/**
 * Aplica el encabezado institucional oficial con el sello de Innovación y Transformación Digital
 */
function applyHeader(ws, title, subtitle, periodLabel, totalCols) {
    // Fila 1: Banner Principal - Sanatorio Argentino & Innovación y Transformación Digital
    ws.mergeCells(1, 1, 1, totalCols);
    const r1 = ws.getCell(1, 1);
    r1.value = 'SANATORIO ARGENTINO   •   INNOVACIÓN Y TRANSFORMACIÓN DIGITAL';
    r1.font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: PALETTE.white } };
    r1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.navyDark } };
    r1.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(1).height = 30;

    // Fila 2: Subtítulo del Módulo / Reporte
    ws.mergeCells(2, 1, 2, totalCols);
    const r2 = ws.getCell(2, 1);
    r2.value = title.toUpperCase();
    r2.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: PALETTE.white } };
    r2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.blueBrand } };
    r2.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(2).height = 24;

    // Fila 3: Metadatos de Emisión, Auditoría y Sector
    ws.mergeCells(3, 1, 3, totalCols);
    const r3 = ws.getCell(3, 1);
    const hoyStr = new Date().toLocaleDateString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
    r3.value = `Período Analizado: ${periodLabel}   |   Emitido: ${hoyStr}   |   Área: Innovación y Transformación Digital   |   ${subtitle || ''}`;
    r3.font = { name: 'Segoe UI', size: 9, italic: true, color: { argb: 'FF1E293B' } };
    r3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    r3.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(3).height = 20;

    // Fila 4: Línea de Acento Tecnológico (Teal Innovación)
    ws.mergeCells(4, 1, 4, totalCols);
    const r4 = ws.getCell(4, 1);
    r4.value = '';
    r4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.tealBrand } };
    ws.getRow(4).height = 4;

    // Fila 5: Espaciador
    ws.getRow(5).height = 8;
}

/**
 * Genera el libro Excel de Auditoría de Cobranzas y lo descarga directamente en el navegador
 */
export async function generarExcelCobranzas({
    periodoLabel = 'Este Mes',
    pacientesCobrados = [],
    movimientosCaja = [],
    resumen = {}
}) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Innovación y Transformación Digital - Sanatorio Argentino';
    wb.lastModifiedBy = 'Sector Innovación y Transformación Digital';
    wb.created = new Date();
    wb.modified = new Date();

    // ─────────────────────────────────────────────────────────────
    // HOJA 1: 📊 DASHBOARD EJECUTIVO & KPIS (Pestaña inicial de impacto visual)
    // ─────────────────────────────────────────────────────────────
    const wsDashboard = wb.addWorksheet('📊 Dashboard Ejecutivo', {
        views: [{ showGridLines: true }]
    });

    applyHeader(
        wsDashboard,
        'Tablero Ejecutivo de Cobranzas, Cancelaciones y Planes',
        'Modelo Analítico de Gestión Integral de Deudas y Recuperación Financiera',
        periodoLabel,
        8
    );

    wsDashboard.getColumn(1).width = 4;   // Margen izquierdo
    wsDashboard.getColumn(2).width = 24;
    wsDashboard.getColumn(3).width = 22;
    wsDashboard.getColumn(4).width = 4;   // Separador
    wsDashboard.getColumn(5).width = 24;
    wsDashboard.getColumn(6).width = 22;
    wsDashboard.getColumn(7).width = 4;   // Separador
    wsDashboard.getColumn(8).width = 26;

    // Helper para crear tarjetas KPI estilizadas
    const createKpiCard = (ws, startRow, startCol, title, valueStr, subText, theme = 'green') => {
        const bgHeader = theme === 'green' ? PALETTE.greenEmerald
            : theme === 'blue' ? PALETTE.blueBrand
            : theme === 'purple' ? PALETTE.purpleIndigo
            : PALETTE.navyHeader;

        const bgBody = theme === 'green' ? PALETTE.greenLight
            : theme === 'blue' ? PALETTE.blueLight
            : theme === 'purple' ? PALETTE.purpleLight
            : PALETTE.cardBg;

        const textValColor = theme === 'green' ? PALETTE.greenText
            : theme === 'blue' ? PALETTE.blueBrand
            : theme === 'purple' ? PALETTE.purpleText
            : PALETTE.navyDark;

        // Fila Título de Tarjeta (merge 2 columnas)
        ws.mergeCells(startRow, startCol, startRow, startCol + 1);
        const cellHeader = ws.getCell(startRow, startCol);
        cellHeader.value = title.toUpperCase();
        cellHeader.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: PALETTE.white } };
        cellHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgHeader } };
        cellHeader.alignment = { vertical: 'middle', horizontal: 'center' };
        ws.getRow(startRow).height = 22;

        // Fila Valor KPI (merge 2 columnas)
        ws.mergeCells(startRow + 1, startCol, startRow + 1, startCol + 1);
        const cellVal = ws.getCell(startRow + 1, startCol);
        cellVal.value = valueStr;
        cellVal.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: textValColor } };
        cellVal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgBody } };
        cellVal.alignment = { vertical: 'middle', horizontal: 'center' };
        ws.getRow(startRow + 1).height = 34;

        // Fila Subtítulo explicativo (merge 2 columnas)
        ws.mergeCells(startRow + 2, startCol, startRow + 2, startCol + 1);
        const cellSub = ws.getCell(startRow + 2, startCol);
        cellSub.value = subText;
        cellSub.font = { name: 'Segoe UI', size: 8.5, italic: true, color: { argb: PALETTE.textMuted } };
        cellSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgBody } };
        cellSub.alignment = { vertical: 'middle', horizontal: 'center' };
        ws.getRow(startRow + 2).height = 18;

        // Bordes de la tarjeta
        for (let r = startRow; r <= startRow + 2; r++) {
            for (let c = startCol; c <= startCol + 1; c++) {
                const cell = ws.getCell(r, c);
                cell.border = {
                    top: r === startRow ? { style: 'medium', color: { argb: bgHeader } } : undefined,
                    bottom: r === startRow + 2 ? { style: 'medium', color: { argb: bgHeader } } : undefined,
                    left: c === startCol ? { style: 'medium', color: { argb: bgHeader } } : undefined,
                    right: c === startCol + 1 ? { style: 'medium', color: { argb: bgHeader } } : undefined,
                };
            }
        }
    };

    // Fila 7 a 9: TARJETAS KPI (Fila 1)
    const fmtMoneda = (val) => '$ ' + Number(val || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    createKpiCard(
        wsDashboard, 7, 2,
        'Recaudación en Período',
        fmtMoneda(resumen.totalCobradoPeriodo),
        'Ingresos efectivos percibidos en caja / transferencias',
        'green'
    );

    createKpiCard(
        wsDashboard, 7, 5,
        'Cancelaciones Totales (100%)',
        fmtMoneda(resumen.montoCanceladas),
        `${resumen.cantCanceladas || 0} pacientes con deuda completamente saldada`,
        'purple'
    );

    // Fila 11 a 13: TARJETAS KPI (Fila 2)
    createKpiCard(
        wsDashboard, 11, 2,
        'Cuotas y Pagos Parciales',
        fmtMoneda(resumen.montoCuotas),
        `${resumen.cantConPlan || 0} pacientes con cuotas de plan activo al día`,
        'blue'
    );

    createKpiCard(
        wsDashboard, 11, 5,
        'Histórico Sanatorio Recuperado',
        fmtMoneda(resumen.totalHistoricoCobrado),
        `Acumulado total histórico (${resumen.totalHistoricoCanceladasCount || 0} cuentas saldadas)`,
        'navy'
    );

    // Fila 15: Separador y Sección de Desglose
    wsDashboard.getRow(14).height = 14;

    const rowSecHeader = wsDashboard.addRow(['', 'SÍNTESIS METODOLÓGICA Y AUDITORÍA DE CARTERA', '', '', '', '', '', '']);
    wsDashboard.mergeCells(15, 2, 15, 6);
    rowSecHeader.getCell(2).font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: PALETTE.white } };
    rowSecHeader.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.navyHeader } };
    rowSecHeader.getCell(2).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    wsDashboard.getRow(15).height = 24;

    const addSummaryLine = (label, val, isMoney = false, note = '') => {
        const row = wsDashboard.addRow(['', label, '', '', val, note, '', '']);
        const rIdx = row.number;
        wsDashboard.mergeCells(rIdx, 2, rIdx, 4);
        wsDashboard.mergeCells(rIdx, 5, rIdx, 5);
        wsDashboard.mergeCells(rIdx, 6, rIdx, 6);

        row.getCell(2).font = { name: 'Segoe UI', size: 9.5, color: { argb: PALETTE.textDark } };
        row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };

        row.getCell(5).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: PALETTE.navyDark } };
        row.getCell(5).alignment = { vertical: 'middle', horizontal: 'right' };
        if (isMoney) {
            row.getCell(5).numFmt = '$ #,##0.00;($ #,##0.00);"-"';
        }

        row.getCell(6).font = { name: 'Segoe UI', size: 8.5, italic: true, color: { argb: PALETTE.textMuted } };
        row.getCell(6).alignment = { vertical: 'middle', horizontal: 'left' };

        row.height = 20;

        // Bordes suaves
        [2, 3, 4, 5, 6].forEach(col => {
            row.getCell(col).border = {
                bottom: { style: 'thin', color: { argb: PALETTE.borderLight } }
            };
        });
        return row;
    };

    addSummaryLine('Pacientes con movimientos de cobro en el período seleccionado:', `${pacientesCobrados.length} pacientes`);
    addSummaryLine('Monto cobrado sobre Deuda Exigible (≥ 30 días post-alta):', resumen.totalCobradoExigible ?? resumen.totalCobradoPeriodo ?? 0, true, 'Recupero real de mora exigible');
    addSummaryLine('Monto cobrado en Período de Gracia (< 30 días post-alta):', resumen.totalCobradoEnGracia || 0, true, 'Gestión administrativa dentro de los 30d');
    addSummaryLine('Pacientes que cancelaron el 100% de su pasivo institucional:', `${resumen.cantCanceladas || 0} pacientes`, false, 'Libre deuda otorgado');
    addSummaryLine('Monto total recuperado en cancelaciones totales 100%:', resumen.montoCanceladas || 0, true);
    addSummaryLine('Monto cobrado por cuotas de planes y entregas parciales:', resumen.montoCuotas || 0, true);
    addSummaryLine('Deuda viva remanente de los pacientes cobrados en período:', resumen.saldoDeudaPendiente || 0, true, 'Saldo pendiente de cobro');
    addSummaryLine('Total histórico cobrado registrado en la historia del Sanatorio:', resumen.totalHistoricoCobrado || 0, true);

    // Bloque de Firma y Validación de Innovación y Transformación Digital
    const signatureRow = wsDashboard.rowCount + 2;
    wsDashboard.mergeCells(signatureRow, 2, signatureRow + 2, 6);
    const sigCell = wsDashboard.getCell(signatureRow, 2);
    sigCell.value = 'SANATORIO ARGENTINO  •  INNOVACIÓN Y TRANSFORMACIÓN DIGITAL\n' +
        'Documento emitido y auditado automáticamente mediante algoritmos de trazabilidad institucional.\n' +
        'Gobernanza de Datos Médicos y Financieros — San Juan, Argentina.';
    sigCell.font = { name: 'Segoe UI', size: 8.5, italic: true, bold: false, color: { argb: PALETTE.tealBrand } };
    sigCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.tealLight } };
    sigCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    for (let r = signatureRow; r <= signatureRow + 2; r++) {
        for (let c = 2; c <= 6; c++) {
            wsDashboard.getCell(r, c).border = {
                top: { style: 'thin', color: { argb: PALETTE.tealBrand } },
                bottom: { style: 'thin', color: { argb: PALETTE.tealBrand } },
                left: { style: 'thin', color: { argb: PALETTE.tealBrand } },
                right: { style: 'thin', color: { argb: PALETTE.tealBrand } }
            };
        }
    }

    // ─────────────────────────────────────────────────────────────
    // HOJA 2: 👥 PACIENTES COBRADOS Y PLANES VIGENTES
    // ─────────────────────────────────────────────────────────────
    const wsPacientes = wb.addWorksheet('👥 Pacientes Cobrados', {
        views: [{ showGridLines: true, state: 'frozen', ySplit: 6 }]
    });

    const colsHojaPacientes = [
        { header: 'N°', key: 'idx', width: 6 },
        { header: 'Paciente', key: 'paciente', width: 32 },
        { header: 'DNI / NHC', key: 'nhc', width: 14 },
        { header: 'Teléfono', key: 'telefono', width: 15 },
        { header: 'Obra Social / Financiador', key: 'obraSocial', width: 22 },
        { header: 'Cobrado en Período ($)', key: 'cobradoPeriodo', width: 20 },
        { header: 'Cobrado Exigible ≥30d ($)', key: 'cobradoExigiblePeriodo', width: 20 },
        { header: 'Cobrado en Gracia <30d ($)', key: 'cobradoEnGraciaPeriodo', width: 20 },
        { header: 'Total Cobrado Histórico ($)', key: 'cobradoHistorico', width: 20 },
        { header: 'Modalidad de Cobro', key: 'tipoCobro', width: 24 },
        { header: 'Estado Cartera', key: 'categoria', width: 18 },
        { header: 'Deuda Original ($)', key: 'deudaOriginal', width: 18 },
        { header: 'Deuda Vigente Pendiente ($)', key: 'deudaVigente', width: 20 },
        { header: 'Plan Vigente', key: 'tienePlan', width: 13 },
        { header: 'Detalle del Plan de Cuotas', key: 'detallePlan', width: 34 },
        { header: 'Saldo Remanente Plan ($)', key: 'saldoPlan', width: 20 },
        { header: 'Gestionado / Cobrado por', key: 'gestionadoPor', width: 22 },
        { header: 'Fecha Alta / Origen (DD/MM/AAAA)', key: 'fechaAlta', width: 17 },
        { header: 'Fecha Desde Cuando es Exigible +30d (DD/MM/AAAA)', key: 'fechaExigible', width: 20 },
        { header: 'Fecha Último Cobro (DD/MM/AAAA)', key: 'fechaCobro', width: 17 },
        { header: 'Inicio Gestión (DD/MM/AAAA)', key: 'fechaInicioGestion', width: 17 },
        { header: 'Condición del Cobro', key: 'condicionCobro', width: 22 },
        { header: 'Comprobante / Observaciones', key: 'observaciones', width: 36 }
    ];

    applyHeader(
        wsPacientes,
        'Nómina de Pacientes Cobrados, Cancelaciones y Planes de Facilidades',
        'Auditoría nominal con fechas de alta, exigibilidad (+30d), saldos y gestores (Formato DD/MM/AAAA)',
        periodoLabel,
        colsHojaPacientes.length
    );

    // Fila 6: Encabezado de columnas
    const headerRowPac = wsPacientes.addRow(colsHojaPacientes.map(c => c.header));
    headerRowPac.height = 30;
    headerRowPac.eachCell((cell) => {
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: PALETTE.white } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.navyHeader } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
            top: { style: 'thin', color: { argb: PALETTE.borderDark } },
            left: { style: 'thin', color: { argb: PALETTE.borderDark } },
            bottom: { style: 'medium', color: { argb: PALETTE.borderDark } },
            right: { style: 'thin', color: { argb: PALETTE.borderDark } },
        };
    });

    colsHojaPacientes.forEach((col, i) => {
        wsPacientes.getColumn(i + 1).width = col.width;
    });

    // Filas de datos
    pacientesCobrados.forEach((item, index) => {
        const row = wsPacientes.addRow([
            index + 1,
            item.nombre || 'Sin Nombre',
            item.nhc || 'S/D',
            item.telefono || 'Sin registrar',
            item.obraSocial || 'Particular / S.D.',
            item.cobradoPeriodo || 0,
            item.cobradoExigiblePeriodo ?? item.cobradoPeriodo ?? 0,
            item.cobradoEnGraciaPeriodo || 0,
            item.cobradoHistorico || 0,
            item.tipoCobro || 'Pago en curso',
            item.categoriaLabel || item.categoria || 'En Gestión',
            item.deudaOriginal || 0,
            item.deudaVigente || 0,
            item.tienePlan ? 'SÍ' : 'NO',
            item.detallePlan || 'Sin plan activo',
            item.saldoPlan || 0,
            item.gestionadoPor || 'Sistema / Sin asignar',
            item.fechaAlta || '-',
            item.fechaExigible || '-',
            item.fechaCobro || '-',
            item.fechaInicioGestion || '-',
            item.condicionCobro || 'Exigible (≥30d post-alta)',
            item.observaciones || '-'
        ]);

        row.height = 22;
        const isEven = index % 2 === 0;

        row.eachCell((cell, colNumber) => {
            cell.font = { name: 'Segoe UI', size: 9, color: { argb: PALETTE.textDark } };
            cell.border = {
                top: { style: 'thin', color: { argb: PALETTE.borderLight } },
                left: { style: 'thin', color: { argb: PALETTE.borderLight } },
                bottom: { style: 'thin', color: { argb: PALETTE.borderLight } },
                right: { style: 'thin', color: { argb: PALETTE.borderLight } },
            };

            // Fondo alternado zebra
            if (isEven) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.zebraBg } };
            }

            // Moneda y formato numérico (cols 6, 7, 8, 9, 12, 13, 16)
            if ([6, 7, 8, 9, 12, 13, 16].includes(colNumber)) {
                cell.numFmt = '$ #,##0.00;($ #,##0.00);"-"';
                cell.alignment = { vertical: 'middle', horizontal: 'right' };
            } else if ([1, 3, 4, 14, 18, 19, 20, 21, 22].includes(colNumber)) {
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            } else {
                cell.alignment = { vertical: 'middle', horizontal: 'left' };
            }

            // Resaltado de Cobrado en Período (Columna 6)
            if (colNumber === 6 && (item.cobradoPeriodo || 0) > 0) {
                cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: PALETTE.greenText } };
            }

            // Resaltado de Cancelación 100% (Columna 10)
            if (colNumber === 10 && (item.tipoCobro || '').includes('Cancelación')) {
                cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: PALETTE.greenText } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.greenLight } };
            }

            // Paciente con Deuda 0 (Saldada) (Columna 13)
            if (colNumber === 13 && (item.deudaVigente === 0)) {
                cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: PALETTE.greenText } };
            }

            // Resaltado de Plan Vigente (Columna 14)
            if (colNumber === 14 && item.tienePlan) {
                cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: PALETTE.purpleText } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.purpleLight } };
            }

            // Resaltado de Condición del Cobro (Columna 22)
            if (colNumber === 22) {
                if (item.esExigible === false) {
                    cell.font = { name: 'Segoe UI', size: 8.5, bold: true, color: { argb: PALETTE.amberGold } };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.amberLight } };
                } else {
                    cell.font = { name: 'Segoe UI', size: 8.5, bold: true, color: { argb: PALETTE.greenText } };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.greenLight } };
                }
            }
        });
    });

    // Fila de Totales Hoja Pacientes
    const totalRowIndex = wsPacientes.rowCount + 1;
    const lastDataRow = Math.max(7, totalRowIndex - 1);
    const totalRowPac = wsPacientes.addRow([
        'TOTALES',
        `${pacientesCobrados.length} PACIENTES AUDITADOS`,
        '', '', '',
        { formula: `SUM(F7:F${lastDataRow})` },
        { formula: `SUM(G7:G${lastDataRow})` },
        { formula: `SUM(H7:H${lastDataRow})` },
        { formula: `SUM(I7:I${lastDataRow})` },
        '', '',
        { formula: `SUM(L7:L${lastDataRow})` },
        { formula: `SUM(M7:M${lastDataRow})` },
        '', '',
        { formula: `SUM(P7:P${lastDataRow})` },
        '', '', '', '', '', '', ''
    ]);
    totalRowPac.height = 26;
    totalRowPac.eachCell((cell, colNumber) => {
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: PALETTE.white } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.navyDark } };
        cell.border = {
            top: { style: 'medium', color: { argb: PALETTE.borderDark } },
            bottom: { style: 'double', color: { argb: PALETTE.borderDark } }
        };
        if ([6, 7, 8, 9, 12, 13, 16].includes(colNumber)) {
            cell.numFmt = '$ #,##0.00;($ #,##0.00);"-"';
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
        } else {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
    });

    // ─────────────────────────────────────────────────────────────
    // HOJA 3: 💳 MOVIMIENTOS INDIVIDUALES DE COBRO (TRANSACCIONES DE CAJA)
    // ─────────────────────────────────────────────────────────────
    const wsCaja = wb.addWorksheet('💳 Detalle de Cobros', {
        views: [{ showGridLines: true, state: 'frozen', ySplit: 6 }]
    });

    const colsHojaCaja = [
        { header: 'N°', key: 'idx', width: 6 },
        { header: 'Fecha y Hora Cobro (DD/MM/AAAA)', key: 'fecha', width: 20 },
        { header: 'Paciente', key: 'paciente', width: 32 },
        { header: 'DNI / NHC', key: 'nhc', width: 14 },
        { header: 'Fecha Alta (DD/MM/AAAA)', key: 'fechaAlta', width: 16 },
        { header: 'Fecha Exigible +30d (DD/MM/AAAA)', key: 'fechaExigible', width: 16 },
        { header: 'Condición del Cobro', key: 'condicionCobro', width: 22 },
        { header: 'Monto Percibido ($)', key: 'monto', width: 20 },
        { header: 'Concepto / Tipo Movimiento', key: 'concepto', width: 26 },
        { header: 'Canal / Medio de Pago', key: 'medio', width: 24 },
        { header: 'N° Comprobante / Ref.', key: 'comprobante', width: 22 },
        { header: 'Operador / Gestionado por', key: 'usuario', width: 24 },
        { header: 'Observaciones / Detalle', key: 'detalle', width: 42 }
    ];

    applyHeader(
        wsCaja,
        'Registro Detallado de Cobros, Cuotas y Cancelaciones Percibidas',
        'Libro cronológico de movimientos de caja con trazabilidad de exigibilidad (+30d post-alta)',
        periodoLabel,
        colsHojaCaja.length
    );

    const headerRowCaja = wsCaja.addRow(colsHojaCaja.map(c => c.header));
    headerRowCaja.height = 30;
    headerRowCaja.eachCell((cell) => {
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: PALETTE.white } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.greenEmerald } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
            top: { style: 'thin', color: { argb: PALETTE.borderDark } },
            left: { style: 'thin', color: { argb: PALETTE.borderDark } },
            bottom: { style: 'medium', color: { argb: PALETTE.borderDark } },
            right: { style: 'thin', color: { argb: PALETTE.borderDark } },
        };
    });

    colsHojaCaja.forEach((col, i) => {
        wsCaja.getColumn(i + 1).width = col.width;
    });

    movimientosCaja.forEach((mov, index) => {
        const row = wsCaja.addRow([
            index + 1,
            mov.fecha || '-',
            mov.paciente || 'S/D',
            mov.nhc || 'S/D',
            mov.fechaAlta || '-',
            mov.fechaExigible || '-',
            mov.condicionCobro || 'Exigible (≥30d post-alta)',
            mov.monto || 0,
            mov.concepto || 'Cobranza',
            mov.medio || 'No especificado',
            mov.comprobante || '-',
            mov.usuario || 'Sistema',
            mov.detalle || '-'
        ]);

        row.height = 20;
        const isEven = index % 2 === 0;

        row.eachCell((cell, colNumber) => {
            cell.font = { name: 'Segoe UI', size: 9, color: { argb: PALETTE.textDark } };
            cell.border = {
                top: { style: 'thin', color: { argb: PALETTE.borderLight } },
                left: { style: 'thin', color: { argb: PALETTE.borderLight } },
                bottom: { style: 'thin', color: { argb: PALETTE.borderLight } },
                right: { style: 'thin', color: { argb: PALETTE.borderLight } },
            };

            if (isEven) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.zebraBg } };
            }

            if (colNumber === 8) {
                cell.numFmt = '$ #,##0.00;($ #,##0.00);"-"';
                cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: PALETTE.greenText } };
                cell.alignment = { vertical: 'middle', horizontal: 'right' };
            } else if ([1, 2, 4, 5, 6, 7, 11].includes(colNumber)) {
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            } else {
                cell.alignment = { vertical: 'middle', horizontal: 'left' };
            }
        });
    });

    // Fila Totales Hoja Caja
    const totalRow2Index = wsCaja.rowCount + 1;
    const lastCajaRow = Math.max(7, totalRow2Index - 1);
    const totalRowCaja = wsCaja.addRow([
        'TOTALES',
        `${movimientosCaja.length} MOVIMIENTOS`,
        '', '', '', '', '',
        { formula: `SUM(H7:H${lastCajaRow})` },
        '', '', '', '', ''
    ]);
    totalRowCaja.height = 26;
    totalRowCaja.eachCell((cell, colNumber) => {
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: PALETTE.white } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.navyDark } };
        cell.border = {
            top: { style: 'medium', color: { argb: PALETTE.borderDark } },
            bottom: { style: 'double', color: { argb: PALETTE.borderDark } }
        };
        if (colNumber === 8) {
            cell.numFmt = '$ #,##0.00;($ #,##0.00);"-"';
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
        } else {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
    });

    // ─────────────────────────────────────────────────────────────
    // DESCARGA EN NAVEGADOR
    // ─────────────────────────────────────────────────────────────
    const cleanPeriod = (periodoLabel || 'Periodo')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/_+/g, '_');
    const fechaHoy = new Date().toISOString().split('T')[0];
    const fileName = `Informe_Cobranzas_Innovacion_Sanatorio_Argentino_${cleanPeriod}_${fechaHoy}.xlsx`;

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);

    return fileName;
}
