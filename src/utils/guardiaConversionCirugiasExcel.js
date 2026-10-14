/**
 * guardiaConversionCirugiasExcel.js
 * Generador de informe oficial en Excel para Cirugías Derivadas de Guardia Clínica (≤ 48 hs).
 * Cumple estrictamente con la estética del programa (ExcelJS):
 * - Banner institucional superior Sanatorio Argentino (Navy Blue FF0D3B66 y Sapphire FF1E40AF)
 * - Banner destacado de período analizado (cálido FFFEF3C7 con bordes dorados e indicación clara de período)
 * - Trazabilidad y metadatos de emisión institucional
 * - Hoja 1: Resumen Ejecutivo (KPIs de oportunidad quirúrgica, top cirugías y especialidades)
 * - Hoja 2: Detalle Nominal Paciente por Paciente (con autofiltro, fila congelada, zebra styling y anchos automáticos)
 */
import ExcelJS from 'exceljs';

const PALETTE = {
    headerNavy: 'FF0D3B66',       // Azul institucional oscuro
    headerBlue: 'FF1E40AF',       // Azul zafiro gobernanza
    headerGreen: 'FF065F46',      // Verde esmeralda tiempos rápidos
    headerAmber: 'FFD97706',      // Ámbar estabilización
    periodBannerBg: 'FFFEF3C7',    // Amarillo cálido advertencia/período
    periodBannerText: 'FF92400E',  // Texto ámbar oscuro
    periodBannerBorder: 'FFF59E0B',// Borde dorado
    white: 'FFFFFFFF',
    textMain: 'FF0F172A',
    textMuted: 'FF64748B',
    zebraBg: 'FFF8FAFC',
    borderLight: 'FFE2E8F0',
    borderMedium: 'FFCBD5E1'
};

/**
 * Formatea de forma descriptiva y explícita el período analizado
 */
function formatPeriodoDescriptivo(periodo, periodoNombre) {
    if (!periodo) return periodoNombre || 'Período en Curso';
    if (periodo === '2026-ANUAL') return 'Año 2026 Completo (Acumulado Anual)';
    
    // Si coincide con mes actual (ej. 2026-10)
    const hoy = new Date();
    const currentYearMonth = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    if (periodo === currentYearMonth) {
        const dia = String(hoy.getDate()).padStart(2, '0');
        const mes = String(hoy.getMonth() + 1).padStart(2, '0');
        return `${periodoNombre} (01 al ${dia}/${mes} · Período en Curso)`;
    }

    return `${periodoNombre} (Mes Completo Cerrado)`;
}

/**
 * Aplica el banner superior institucional en una hoja de Excel
 */
function applyInstitutionalHeader(ws, {
    sheetSubtitle,
    numCols,
    periodoFullTexto,
    totalCirugias,
    pacientesUnicos,
    avgHoras,
    activeFilter
}) {
    // 1. Título institucional
    const row1 = ws.addRow(['SANATORIO ARGENTINO · DIRECCIÓN MÉDICA & GOBERNANZA CLÍNICA']);
    row1.height = 28;
    ws.mergeCells(1, 1, 1, numCols);
    const cell1 = ws.getCell(1, 1);
    cell1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.headerNavy } };
    cell1.font = { name: 'Calibri', size: 13, bold: true, color: { argb: PALETTE.white } };
    cell1.alignment = { vertical: 'middle', horizontal: 'center' };

    // 2. Subtítulo del reporte
    const row2 = ws.addRow([`AUDITORÍA QUIRÚRGICA OFICIAL — ${sheetSubtitle.toUpperCase()}`]);
    row2.height = 22;
    ws.mergeCells(2, 1, 2, numCols);
    const cell2 = ws.getCell(2, 1);
    cell2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.headerBlue } };
    cell2.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: PALETTE.white } };
    cell2.alignment = { vertical: 'middle', horizontal: 'center' };

    // 3. BANNER DESTACADO DEL PERÍODO ANALIZADO (MÁXIMA VISIBILIDAD)
    const periodoBannerTexto = `🗓️ PERÍODO ANALIZADO: ${periodoFullTexto.toUpperCase()}    |    CIRUGÍAS TOTALES: ${totalCirugias} CASOS    |    PACIENTES ÚNICOS: ${pacientesUnicos}    |    PROMEDIO ESPERA: ${avgHoras} HS    |    FILTRO: ${activeFilter.toUpperCase()}`;
    const row3 = ws.addRow([periodoBannerTexto]);
    row3.height = 26;
    ws.mergeCells(3, 1, 3, numCols);
    const cell3 = ws.getCell(3, 1);
    cell3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.periodBannerBg } };
    cell3.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: PALETTE.periodBannerText } };
    cell3.alignment = { vertical: 'middle', horizontal: 'center' };
    cell3.border = {
        top: { style: 'medium', color: { argb: PALETTE.periodBannerBorder } },
        bottom: { style: 'medium', color: { argb: PALETTE.periodBannerBorder } },
        left: { style: 'thin', color: { argb: PALETTE.periodBannerBorder } },
        right: { style: 'thin', color: { argb: PALETTE.periodBannerBorder } }
    };

    // 4. Metadata de trazabilidad
    const fechaEmision = new Date().toLocaleString('es-AR');
    const row4 = ws.addRow([`Generado el: ${fechaEmision}  ·  Sistema de Gestión Quirúrgica ADM-QUI  ·  Base de Datos SALUS  ·  Auditoría Institucional`]);
    row4.height = 18;
    ws.mergeCells(4, 1, 4, numCols);
    const cell4 = ws.getCell(4, 1);
    cell4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    cell4.font = { name: 'Calibri', size: 8.5, italic: true, color: { argb: PALETTE.textMuted } };
    cell4.alignment = { vertical: 'middle', horizontal: 'center' };

    // 5. Espaciador
    const row5 = ws.addRow([]);
    row5.height = 8;
}

/**
 * Aplica estilos a los encabezados de columnas
 */
function applyColumnHeaders(ws, headers, headerColor = PALETTE.headerBlue) {
    const row = ws.addRow(headers);
    row.height = 26;
    row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerColor } };
        cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: PALETTE.white } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
            top: { style: 'thin', color: { argb: PALETTE.borderMedium } },
            bottom: { style: 'medium', color: { argb: PALETTE.white } },
            left: { style: 'thin', color: { argb: PALETTE.borderMedium } },
            right: { style: 'thin', color: { argb: PALETTE.borderMedium } }
        };
    });
    return row;
}

/**
 * Exporta a Excel oficial con la estética del programa (ExcelJS)
 */
export async function exportGuardiaConversionCirugiasExcel({
    records = [],
    cirugiasStats = {},
    periodo = '2026-10',
    periodoNombre = 'Octubre 2026',
    activeFilter = 'all'
}) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Sanatorio Argentino — Auditoría Quirúrgica';
    wb.lastModifiedBy = 'Sistema ADM-QUI Gobernanza';
    wb.created = new Date();
    wb.modified = new Date();

    const periodoFullTexto = formatPeriodoDescriptivo(periodo, periodoNombre);
    const totalCirugias = cirugiasStats.total || records.length;
    const pacientesUnicos = cirugiasStats.pacientesUnicos || new Set(records.map(r => r.nhc || r.paciente)).size;
    const avgHoras = cirugiasStats.avgHoras || '0';

    // ─────────────────────────────────────────────────────────────
    // HOJA 1: RESUMEN EJECUTIVO (TABLERO DE CONTROL Y KPIS)
    // ─────────────────────────────────────────────────────────────
    const ws1 = wb.addWorksheet('Resumen Ejecutivo', {
        properties: { tabColor: { argb: PALETTE.headerNavy } }
    });

    applyInstitutionalHeader(ws1, {
        sheetSubtitle: 'CIRUGÍAS DERIVADAS DE GUARDIA CLÍNICA (≤ 48 HS) — TABLERO EJECUTIVO',
        numCols: 5,
        periodoFullTexto,
        totalCirugias,
        pacientesUnicos,
        avgHoras,
        activeFilter
    });

    // ── Tabla 1: Indicadores Clave de Oportunidad Quirúrgica ──
    const rowTitleKpi = ws1.addRow(['DISTRIBUCIÓN DE TIEMPOS DE RESOLUCIÓN A QUIRÓFANO', '', '', '', '']);
    ws1.mergeCells(rowTitleKpi.number, 1, rowTitleKpi.number, 5);
    rowTitleKpi.height = 22;
    const cellTitleKpi = ws1.getCell(rowTitleKpi.number, 1);
    cellTitleKpi.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cellTitleKpi.font = { name: 'Calibri', size: 10, bold: true, color: { argb: PALETTE.headerNavy } };
    cellTitleKpi.alignment = { vertical: 'middle', horizontal: 'left' };

    applyColumnHeaders(ws1, ['MÉTRICA QUIRÚRGICA DE GUARDIA', 'CANTIDAD AUDITADA', 'DISTRIBUCIÓN %', 'ESTÁNDAR CLÍNICO', 'DESCRIPCIÓN OPERATIVA'], PALETTE.headerNavy);

    const kpiRows = [
        ['Total Cirugías Derivadas (≤ 48 hs)', totalCirugias, '100.0%', 'Tableau Quirófano', 'Pacientes ingresados por guardia con cirugía dentro de las 48 hs'],
        ['Pacientes Únicos Operados', pacientesUnicos, `${((pacientesUnicos / (totalCirugias || 1)) * 100).toFixed(1)}%`, 'Historias Clínicas distintas', 'Personas físicas intervenidas'],
        ['Tiempo Promedio a Quirófano', `${avgHoras} horas`, '—', 'Benchmark: < 24 hs', 'Desde registro de ingreso en guardia a inicio de cirugía'],
        ['Emergencias Inmediatas (≤ 6 hs)', cirugiasStats.menos6h || 0, `${cirugiasStats.menos6hPct || 0}%`, 'Resolución Inmediata', 'Máxima urgencia clínica o quirúrgica'],
        ['Urgencias Quirúrgicas (6 a 12 hs)', cirugiasStats.de6a12h || 0, `${cirugiasStats.de6a12hPct || 0}%`, 'Turno de Guardia', 'Resolución en el turno médico de guardia'],
        ['Resolución 12 a 24 hs', cirugiasStats.de12a24h || 0, `${cirugiasStats.de12a24hPct || 0}%`, 'Primer día Internación', 'Preparación prequirúrgica y ventana de seguridad'],
        ['Estabilización previa (24 a 48 hs)', cirugiasStats.de24a48h || 0, `${cirugiasStats.de24a48hPct || 0}%`, 'Estabilización Clínica', 'Compensación hemodinámica o estudios complementarios'],
        ['Urgencias / No Programadas (SALUS)', cirugiasStats.urgenciasNoProg || 0, `${(((cirugiasStats.urgenciasNoProg || 0) / (totalCirugias || 1)) * 100).toFixed(1)}%`, 'Carácter SALUS', 'Estado formal registrado en agenda de quirófano']
    ];

    kpiRows.forEach((r, idx) => {
        const row = ws1.addRow(r);
        row.height = 20;
        const isZebra = idx % 2 === 1;
        row.eachCell((cell, colNum) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isZebra ? PALETTE.zebraBg : PALETTE.white } };
            cell.font = { name: 'Calibri', size: 9.5, color: { argb: PALETTE.textMain } };
            cell.border = {
                top: { style: 'thin', color: { argb: PALETTE.borderLight } },
                bottom: { style: 'thin', color: { argb: PALETTE.borderLight } },
                left: { style: 'thin', color: { argb: PALETTE.borderLight } },
                right: { style: 'thin', color: { argb: PALETTE.borderLight } }
            };
            if (colNum === 1) cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: PALETTE.textMain } };
            if ([2, 3].includes(colNum)) cell.alignment = { vertical: 'middle', horizontal: 'center' };
            else cell.alignment = { vertical: 'middle', horizontal: 'left' };
        });
    });

    ws1.addRow([]); // Espacio

    // ── Tabla 2: Top Procedimientos Quirúrgicos más frecuentes ──
    const rowTitleProc = ws1.addRow(['TOP PROCEDIMIENTOS QUIRÚRGICOS PROCEDENTES DE GUARDIA', '', '', '', '']);
    ws1.mergeCells(rowTitleProc.number, 1, rowTitleProc.number, 5);
    rowTitleProc.height = 22;
    const cellTitleProc = ws1.getCell(rowTitleProc.number, 1);
    cellTitleProc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cellTitleProc.font = { name: 'Calibri', size: 10, bold: true, color: { argb: PALETTE.headerNavy } };
    cellTitleProc.alignment = { vertical: 'middle', horizontal: 'left' };

    applyColumnHeaders(ws1, ['RANKING', 'PROCEDIMIENTO QUIRÚRGICO DERIVADO', 'CIRUGÍAS REALIZADAS', 'PARTICIPACIÓN %', 'OBSERVACIÓN'], PALETTE.headerBlue);

    (cirugiasStats.topProcedimientos || []).slice(0, 10).forEach((p, idx) => {
        const row = ws1.addRow([
            `#${idx + 1}`,
            p.nombre,
            p.cantidad,
            `${p.pct}%`,
            idx === 0 ? 'Procedimiento más demandado en urgencias' : 'Frecuente en guardia'
        ]);
        row.height = 20;
        const isZebra = idx % 2 === 1;
        row.eachCell((cell, colNum) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isZebra ? PALETTE.zebraBg : PALETTE.white } };
            cell.font = { name: 'Calibri', size: 9.5, color: { argb: PALETTE.textMain } };
            cell.border = {
                top: { style: 'thin', color: { argb: PALETTE.borderLight } },
                bottom: { style: 'thin', color: { argb: PALETTE.borderLight } },
                left: { style: 'thin', color: { argb: PALETTE.borderLight } },
                right: { style: 'thin', color: { argb: PALETTE.borderLight } }
            };
            if (colNum === 1 || colNum === 3 || colNum === 4) cell.alignment = { vertical: 'middle', horizontal: 'center' };
            if (colNum === 1) cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: PALETTE.headerBlue } };
        });
    });

    ws1.columns = [
        { width: 34 },
        { width: 44 },
        { width: 22 },
        { width: 26 },
        { width: 48 }
    ];

    // ─────────────────────────────────────────────────────────────
    // HOJA 2: DETALLE NOMINAL (PACIENTE POR PACIENTE)
    // ─────────────────────────────────────────────────────────────
    const ws2 = wb.addWorksheet('Cirugías Detalladas', {
        properties: { tabColor: { argb: PALETTE.headerBlue } }
    });

    const numColsDetail = 16;
    applyInstitutionalHeader(ws2, {
        sheetSubtitle: 'CIRUGÍAS DERIVADAS DE GUARDIA (≤ 48 HS) — DETALLE NOMINAL AUDITADO',
        numCols: numColsDetail,
        periodoFullTexto,
        totalCirugias,
        pacientesUnicos,
        avgHoras,
        activeFilter
    });

    const headersDetail = [
        'N°',
        'Paciente',
        'DNI',
        'NHC',
        'Obra Social / Financiador',
        'Llegada Guardia (Fecha)',
        'Llegada Guardia (Hora)',
        'Cirugía / Procedimiento Derivado',
        'Especialidad Quirúrgica',
        'Cirujano Asignado',
        'Fecha Quirófano',
        'Hora Inicio Quirófano',
        'Horas de Espera a Qx',
        'Rango de Espera',
        'Estado Cirugía',
        'Duración Estimada (min)'
    ];

    applyColumnHeaders(ws2, headersDetail, PALETTE.headerBlue);

    // Inmovilizar encabezado en Fila 6
    ws2.views = [{ state: 'frozen', ySplit: 6 }];

    // AutoFilter en Fila 6
    ws2.autoFilter = {
        from: { row: 6, column: 1 },
        to: { row: 6, column: headersDetail.length }
    };

    records.forEach((r, idx) => {
        const hs = r.horas_espera_qx != null ? Number(r.horas_espera_qx) : null;
        let rangoCalc = r.rango_espera || '';
        if (!rangoCalc && hs != null) {
            rangoCalc = hs <= 6 ? '≤ 6 hs (Inmediata)' : hs <= 12 ? '6 a 12 hs (Guardia)' : hs <= 24 ? '12 a 24 hs (24h)' : '24 a 48 hs (Estabilización)';
        }

        const row = ws2.addRow([
            idx + 1,
            r.paciente || 'PACIENTE',
            r.dni || '-',
            r.nhc || '-',
            r.obra_social || 'PARTICULAR',
            r.fecha_guardia || '',
            r.hora_guardia || '',
            r.cirugia_procedimiento || '',
            r.especialidad || 'CIRUGIA GENERAL',
            r.cirujano || 'Sin Asignar',
            r.fecha_cirugia || '',
            r.hora_cirugia || '',
            hs != null ? hs : '',
            rangoCalc,
            r.estado_cirugia || 'Realizada',
            r.duracion_minutos || ''
        ]);

        row.height = 20;
        const isZebra = idx % 2 === 1;

        row.eachCell((cell, colNum) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isZebra ? PALETTE.zebraBg : PALETTE.white } };
            cell.font = { name: 'Calibri', size: 9.5, color: { argb: PALETTE.textMain } };
            cell.border = {
                top: { style: 'thin', color: { argb: PALETTE.borderLight } },
                bottom: { style: 'thin', color: { argb: PALETTE.borderLight } },
                left: { style: 'thin', color: { argb: PALETTE.borderLight } },
                right: { style: 'thin', color: { argb: PALETTE.borderLight } }
            };

            // Alineaciones
            if ([1, 3, 4, 6, 7, 11, 12, 14, 15, 16].includes(colNum)) {
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            } else if (colNum === 13) {
                cell.alignment = { vertical: 'middle', horizontal: 'right' };
                if (typeof cell.value === 'number') {
                    cell.numFmt = '0.0';
                }
            } else {
                cell.alignment = { vertical: 'middle', horizontal: 'left' };
            }

            // Negritas en Paciente y Procedimiento
            if (colNum === 2) cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: PALETTE.textMain } };
            if (colNum === 8) cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF1E3A8A' } };
            if (colNum === 9) cell.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF047857' } };
        });
    });

    ws2.columns = [
        { width: 7 },   // 1. N°
        { width: 34 },  // 2. Paciente
        { width: 14 },  // 3. DNI
        { width: 12 },  // 4. NHC
        { width: 28 },  // 5. Obra Social
        { width: 15 },  // 6. Fecha Guardia
        { width: 13 },  // 7. Hora Guardia
        { width: 44 },  // 8. Procedimiento
        { width: 26 },  // 9. Especialidad
        { width: 28 },  // 10. Cirujano
        { width: 15 },  // 11. Fecha Qx
        { width: 13 },  // 12. Hora Qx
        { width: 16 },  // 13. Horas Espera
        { width: 22 },  // 14. Rango Espera
        { width: 16 },  // 15. Estado
        { width: 16 }   // 16. Duración
    ];

    // ─────────────────────────────────────────────────────────────
    // ESCRITURA Y DESCARGA DIRECTA EN EL NAVEGADOR
    // ─────────────────────────────────────────────────────────────
    const cleanPeriodo = (periodo || '2026').replace(/[^a-zA-Z0-9]/g, '_');
    const fechaHoy = new Date().toISOString().split('T')[0];
    const fileName = `Guardia_Cirugias_Conversion_${cleanPeriodo}_${fechaHoy}.xlsx`;

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
