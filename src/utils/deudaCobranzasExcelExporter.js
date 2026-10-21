import ExcelJS from 'exceljs';

/**
 * Paleta de colores institucional para Sanatorio Argentino (Calidad / Auditoría)
 */
const PALETTE = {
    headerNavy: 'FF0F2744',       // Azul institucional oscuro
    headerBlue: 'FF1E40AF',       // Azul institucional
    headerGreen: 'FF15803D',      // Verde cobranzas / éxito
    headerPurple: 'FF6B21A8',     // Púrpura planes / canceladas
    zebraBg: 'FFF8FAFC',          // Gris muy suave para filas alternas
    white: 'FFFFFFFF',
    borderLight: 'FFE2E8F0',
    borderDark: 'FF94A3B8',
    textDark: 'FF0F172A',
    textMuted: 'FF475569',
    badgeGreenBg: 'FFDCFCE7',
    badgeGreenText: 'FF166534',
    badgeYellowBg: 'FFFEF3C7',
    badgeYellowText: 'FF92400E',
    badgePurpleBg: 'FFF3E8FF',
    badgePurpleText: 'FF6B21A8',
    badgeGrayBg: 'FFF1F5F9',
    badgeGrayText: 'FF475569',
};

/**
 * Aplica estilos institucionales al encabezado principal
 */
function applyHeader(ws, title, subtitle, periodLabel, totalCols) {
    // Fila 1: Título Sanatorio Argentino
    ws.mergeCells(1, 1, 1, totalCols);
    const r1 = ws.getCell(1, 1);
    r1.value = 'SANATORIO ARGENTINO — DEPARTAMENTO DE AUDITORÍA Y COBRANZAS';
    r1.font = { name: 'Calibri', size: 13, bold: true, color: { argb: PALETTE.white } };
    r1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.headerNavy } };
    r1.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(1).height = 26;

    // Fila 2: Subtítulo del Reporte
    ws.mergeCells(2, 1, 2, totalCols);
    const r2 = ws.getCell(2, 1);
    r2.value = title.toUpperCase();
    r2.font = { name: 'Calibri', size: 11, bold: true, color: { argb: PALETTE.white } };
    r2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.headerBlue } };
    r2.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(2).height = 22;

    // Fila 3: Período y Fecha de Emisión
    ws.mergeCells(3, 1, 3, totalCols);
    const r3 = ws.getCell(3, 1);
    const hoyStr = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    r3.value = `Período Analizado: ${periodLabel} | Generado el: ${hoyStr} | ${subtitle || ''}`;
    r3.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF1E293B' } };
    r3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    r3.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(3).height = 20;

    // Fila 4: Espaciador
    ws.getRow(4).height = 8;
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
    wb.creator = 'Sanatorio Argentino - Sistema ADM-QUI';
    wb.created = new Date();

    // ─────────────────────────────────────────────────────────────
    // HOJA 1: DETALLE DE PACIENTES COBRADOS Y PLANES
    // ─────────────────────────────────────────────────────────────
    const ws1 = wb.addWorksheet('Pacientes Cobrados', {
        views: [{ showGridLines: true, state: 'frozen', ySplit: 5 }]
    });

    const colsHoja1 = [
        { header: 'N°', key: 'idx', width: 6 },
        { header: 'Paciente', key: 'paciente', width: 32 },
        { header: 'DNI / NHC', key: 'nhc', width: 14 },
        { header: 'Teléfono', key: 'telefono', width: 16 },
        { header: 'Obra Social', key: 'obraSocial', width: 24 },
        { header: 'Cobrado en Período ($)', key: 'cobradoPeriodo', width: 22 },
        { header: 'Total Cobrado Histórico ($)', key: 'cobradoHistorico', width: 22 },
        { header: 'Tipo de Cobro', key: 'tipoCobro', width: 22 },
        { header: 'Estado / Categoría', key: 'categoria', width: 20 },
        { header: 'Deuda Original ($)', key: 'deudaOriginal', width: 18 },
        { header: 'Deuda Vigente Pendiente ($)', key: 'deudaVigente', width: 22 },
        { header: 'Plan Vigente', key: 'tienePlan', width: 14 },
        { header: 'Detalle del Plan de Pago', key: 'detallePlan', width: 34 },
        { header: 'Saldo Pendiente Plan ($)', key: 'saldoPlan', width: 20 },
        { header: 'Gestionado / Cobrado por', key: 'gestionadoPor', width: 24 },
        { header: 'Fecha Último Cobro', key: 'fechaCobro', width: 16 },
        { header: 'Fecha Inicio Gestión', key: 'fechaInicioGestion', width: 16 },
        { header: 'Detalle / Comprobante', key: 'observaciones', width: 36 }
    ];

    applyHeader(ws1, 'Informe de Cobranzas Efectivas, Planes de Pago y Deuda Vigente', 'Auditoría detallada por paciente', periodoLabel, colsHoja1.length);

    // Fila 5: Cabecera de columnas
    const headerRow1 = ws1.addRow(colsHoja1.map(c => c.header));
    headerRow1.height = 28;
    headerRow1.eachCell((cell) => {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: PALETTE.white } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.headerBlue } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
            top: { style: 'thin', color: { argb: PALETTE.borderDark } },
            left: { style: 'thin', color: { argb: PALETTE.borderDark } },
            bottom: { style: 'medium', color: { argb: PALETTE.borderDark } },
            right: { style: 'thin', color: { argb: PALETTE.borderDark } },
        };
    });

    colsHoja1.forEach((col, i) => {
        ws1.getColumn(i + 1).width = col.width;
    });

    // Filas de datos
    pacientesCobrados.forEach((item, index) => {
        const row = ws1.addRow([
            index + 1,
            item.nombre || 'Sin Nombre',
            item.nhc || 'S/D',
            item.telefono || 'Sin registrar',
            item.obraSocial || 'Particular / S.D.',
            item.cobradoPeriodo || 0,
            item.cobradoHistorico || 0,
            item.tipoCobro || 'Pago en curso',
            item.categoriaLabel || item.categoria || 'En Gestión',
            item.deudaOriginal || 0,
            item.deudaVigente || 0,
            item.tienePlan ? 'SÍ' : 'NO',
            item.detallePlan || 'Sin plan activo',
            item.saldoPlan || 0,
            item.gestionadoPor || 'Sistema / Sin asignar',
            item.fechaCobro || '-',
            item.fechaInicioGestion || '-',
            item.observaciones || '-'
        ]);

        row.height = 22;
        const isEven = index % 2 === 0;

        row.eachCell((cell, colNumber) => {
            cell.font = { name: 'Calibri', size: 9.5, color: { argb: PALETTE.textDark } };
            cell.border = {
                top: { style: 'thin', color: { argb: PALETTE.borderLight } },
                left: { style: 'thin', color: { argb: PALETTE.borderLight } },
                bottom: { style: 'thin', color: { argb: PALETTE.borderLight } },
                right: { style: 'thin', color: { argb: PALETTE.borderLight } },
            };

            // Zebra
            if (isEven) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.zebraBg } };
            }

            // Alineaciones y formatos
            // Números y Moneda
            if ([6, 7, 10, 11, 14].includes(colNumber)) {
                cell.numFmt = '$ #,##0.00;($ #,##0.00);"-"';
                cell.alignment = { vertical: 'middle', horizontal: 'right' };
            } else if ([1, 3, 4, 12, 16, 17].includes(colNumber)) {
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            } else {
                cell.alignment = { vertical: 'middle', horizontal: 'left' };
            }

            // Resaltar si tiene Plan
            if (colNumber === 12) {
                if (item.tienePlan) {
                    cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: PALETTE.badgePurpleText } };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.badgePurpleBg } };
                }
            }

            // Resaltar Cobrado en Período
            if (colNumber === 6 && (item.cobradoPeriodo || 0) > 0) {
                cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: PALETTE.badgeGreenText } };
            }
        });
    });

    // Fila de Totales Hoja 1
    const totalRowIndex = ws1.rowCount + 1;
    const totalRow = ws1.addRow([
        'TOTALES',
        `${pacientesCobrados.length} PACIENTES`,
        '', '', '',
        { formula: `SUM(F6:F${totalRowIndex - 1})` },
        { formula: `SUM(G6:G${totalRowIndex - 1})` },
        '', '',
        { formula: `SUM(J6:J${totalRowIndex - 1})` },
        { formula: `SUM(K6:K${totalRowIndex - 1})` },
        '', '',
        { formula: `SUM(N6:N${totalRowIndex - 1})` },
        '', '', '', ''
    ]);
    totalRow.height = 24;
    totalRow.eachCell((cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: PALETTE.white } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.headerNavy } };
        cell.border = {
            top: { style: 'medium', color: { argb: PALETTE.borderDark } },
            bottom: { style: 'double', color: { argb: PALETTE.borderDark } }
        };
        if ([6, 7, 10, 11, 14].includes(colNumber)) {
            cell.numFmt = '$ #,##0.00;($ #,##0.00);"-"';
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
        } else {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
    });

    // ─────────────────────────────────────────────────────────────
    // HOJA 2: MOVIMIENTOS INDIVIDUALES DE CAJA (TRANSACCIONES)
    // ─────────────────────────────────────────────────────────────
    const ws2 = wb.addWorksheet('Movimientos de Cobro', {
        views: [{ showGridLines: true, state: 'frozen', ySplit: 5 }]
    });

    const colsHoja2 = [
        { header: 'N°', key: 'idx', width: 6 },
        { header: 'Fecha y Hora', key: 'fecha', width: 18 },
        { header: 'Paciente', key: 'paciente', width: 32 },
        { header: 'DNI / NHC', key: 'nhc', width: 14 },
        { header: 'Monto Percibido ($)', key: 'monto', width: 22 },
        { header: 'Concepto / Tipo', key: 'concepto', width: 24 },
        { header: 'Medio / Referencia', key: 'medio', width: 22 },
        { header: 'Comprobante', key: 'comprobante', width: 20 },
        { header: 'Operador / Gestionado por', key: 'usuario', width: 24 },
        { header: 'Observaciones / Detalle', key: 'detalle', width: 40 }
    ];

    applyHeader(ws2, 'Detalle de Movimientos de Caja y Cobranza Percibida', 'Registro cronológico de transacciones', periodoLabel, colsHoja2.length);

    const headerRow2 = ws2.addRow(colsHoja2.map(c => c.header));
    headerRow2.height = 28;
    headerRow2.eachCell((cell) => {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: PALETTE.white } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.headerGreen } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
            top: { style: 'thin', color: { argb: PALETTE.borderDark } },
            left: { style: 'thin', color: { argb: PALETTE.borderDark } },
            bottom: { style: 'medium', color: { argb: PALETTE.borderDark } },
            right: { style: 'thin', color: { argb: PALETTE.borderDark } },
        };
    });

    colsHoja2.forEach((col, i) => {
        ws2.getColumn(i + 1).width = col.width;
    });

    movimientosCaja.forEach((mov, index) => {
        const row = ws2.addRow([
            index + 1,
            mov.fecha || '-',
            mov.paciente || 'S/D',
            mov.nhc || 'S/D',
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
            cell.font = { name: 'Calibri', size: 9.5, color: { argb: PALETTE.textDark } };
            cell.border = {
                top: { style: 'thin', color: { argb: PALETTE.borderLight } },
                left: { style: 'thin', color: { argb: PALETTE.borderLight } },
                bottom: { style: 'thin', color: { argb: PALETTE.borderLight } },
                right: { style: 'thin', color: { argb: PALETTE.borderLight } },
            };
            if (isEven) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.zebraBg } };
            }
            if (colNumber === 5) {
                cell.numFmt = '$ #,##0.00;($ #,##0.00);"-"';
                cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: PALETTE.badgeGreenText } };
                cell.alignment = { vertical: 'middle', horizontal: 'right' };
            } else if ([1, 2, 4, 8].includes(colNumber)) {
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            } else {
                cell.alignment = { vertical: 'middle', horizontal: 'left' };
            }
        });
    });

    const totalRow2Index = ws2.rowCount + 1;
    const totalRow2 = ws2.addRow([
        'TOTALES',
        `${movimientosCaja.length} MOVIMIENTOS`,
        '', '',
        { formula: `SUM(E6:E${totalRow2Index - 1})` },
        '', '', '', '', ''
    ]);
    totalRow2.height = 24;
    totalRow2.eachCell((cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: PALETTE.white } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.headerNavy } };
        if (colNumber === 5) {
            cell.numFmt = '$ #,##0.00;($ #,##0.00);"-"';
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
        } else {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
    });

    // ─────────────────────────────────────────────────────────────
    // HOJA 3: RESUMEN EJECUTIVO Y TOTALES
    // ─────────────────────────────────────────────────────────────
    const ws3 = wb.addWorksheet('Resumen Ejecutivo', {
        views: [{ showGridLines: true }]
    });

    applyHeader(ws3, 'Cuadro de Mando Ejecutivo de Cobranzas y Planes', 'Síntesis consolidada para Dirección y Auditoría', periodoLabel, 6);

    ws3.getColumn(1).width = 8;
    ws3.getColumn(2).width = 38;
    ws3.getColumn(3).width = 24;
    ws3.getColumn(4).width = 38;
    ws3.getColumn(5).width = 24;
    ws3.getColumn(6).width = 8;

    const addKpiRow = (ws, title, val1, val2 = '') => {
        const row = ws.addRow(['', title, val1, val2, '', '']);
        row.height = 22;
        row.getCell(2).font = { name: 'Calibri', size: 10, bold: true, color: { argb: PALETTE.textDark } };
        row.getCell(3).font = { name: 'Calibri', size: 11, bold: true, color: { argb: PALETTE.headerNavy } };
        row.getCell(3).alignment = { horizontal: 'right' };
        row.getCell(2).border = { top: { style: 'thin', color: { argb: PALETTE.borderLight } }, bottom: { style: 'thin', color: { argb: PALETTE.borderLight } } };
        row.getCell(3).border = { top: { style: 'thin', color: { argb: PALETTE.borderLight } }, bottom: { style: 'thin', color: { argb: PALETTE.borderLight } } };
        return row;
    };

    ws3.addRow(['', '', '', '', '', '']); // Espacio
    const sec1 = ws3.addRow(['', '1. COBRANZAS EN EL PERÍODO SELECCIONADO', '', '', '', '']);
    sec1.getCell(2).font = { name: 'Calibri', size: 11, bold: true, color: { argb: PALETTE.headerBlue } };

    const rCobrado = addKpiRow(ws3, 'Total Efectivo Cobrado en Período:', resumen.totalCobradoPeriodo || 0);
    rCobrado.getCell(3).numFmt = '$ #,##0.00';
    rCobrado.getCell(3).font = { name: 'Calibri', size: 12, bold: true, color: { argb: PALETTE.badgeGreenText } };

    const rCanc = addKpiRow(ws3, '• Deudas Canceladas al 100% (Saldadas):', resumen.montoCanceladas || 0);
    rCanc.getCell(3).numFmt = '$ #,##0.00';
    rCanc.getCell(4).value = `(${resumen.cantCanceladas || 0} pacientes saldados en período)`;

    const rCuotas = addKpiRow(ws3, '• Cuotas de Planes y Entregas en Curso:', resumen.montoCuotas || 0);
    rCuotas.getCell(3).numFmt = '$ #,##0.00';

    ws3.addRow(['', '', '', '', '', '']);
    const sec2 = ws3.addRow(['', '2. SITUACIÓN DE PLANES Y DEUDA RESIDUAL', '', '', '', '']);
    sec2.getCell(2).font = { name: 'Calibri', size: 11, bold: true, color: { argb: PALETTE.headerPurple } };

    addKpiRow(ws3, 'Total Pacientes con Cobros en el Período:', `${pacientesCobrados.length} pacientes`);
    addKpiRow(ws3, 'Pacientes Cobrados con Plan Activo Vigente:', `${resumen.cantConPlan || 0} pacientes`);
    
    const rSaldo = addKpiRow(ws3, 'Deuda Vigente Remanente de estos Pacientes:', resumen.saldoDeudaPendiente || 0);
    rSaldo.getCell(3).numFmt = '$ #,##0.00';

    ws3.addRow(['', '', '', '', '', '']);
    const sec3 = ws3.addRow(['', '3. HISTÓRICO GLOBAL DEL SANATORIO', '', '', '', '']);
    sec3.getCell(2).font = { name: 'Calibri', size: 11, bold: true, color: { argb: PALETTE.headerNavy } };

    const rHistTotal = addKpiRow(ws3, 'Total Histórico Recuperado (Toda la historia):', resumen.totalHistoricoCobrado || 0);
    rHistTotal.getCell(3).numFmt = '$ #,##0.00';

    const rHistCanc = addKpiRow(ws3, '• Total Histórico en Cancelaciones 100%:', resumen.totalHistoricoCanceladasMonto || 0);
    rHistCanc.getCell(3).numFmt = '$ #,##0.00';
    rHistCanc.getCell(4).value = `(${resumen.totalHistoricoCanceladasCount || 0} cuentas saldadas en total)`;

    // ─────────────────────────────────────────────────────────────
    // DESCARGA EN NAVEGADOR
    // ─────────────────────────────────────────────────────────────
    const cleanPeriod = (periodoLabel || 'Periodo')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/_+/g, '_');
    const fechaHoy = new Date().toISOString().split('T')[0];
    const fileName = `Informe_Cobranzas_Sanatorio_Argentino_${cleanPeriod}_${fechaHoy}.xlsx`;

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
