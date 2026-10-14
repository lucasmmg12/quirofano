import ExcelJS from 'exceljs';

/**
 * Paleta de colores institucional para exportación de Excel (Sanatorio Argentino)
 */
const PALETTE = {
    headerNavy: 'FF0F2744',       // Azul institucional oscuro
    headerBlue: 'FF1E40AF',       // Azul zafiro gobernanza
    headerGreen: 'FF065F46',      // Verde esmeralda salas
    headerPurple: 'FF4338CA',     // Violeta cirujanos
    headerCyan: 'FF0369A1',        // Cian especialidades
    headerTeal: 'FF0F766E',        // Teal financiadores
    headerRed: 'FF991B1B',         // Rojo causales de suspensión
    periodBannerBg: 'FFFEF3C7',    // Amarillo cálido advertencia/período
    periodBannerText: 'FF92400E',  // Texto ámbar oscuro
    periodBannerBorder: 'FFF59E0B',// Borde dorado
    white: 'FFFFFFFF',
    textMain: 'FF0F172A',
    textMuted: 'FF64748B',
    zebraBg: 'FFF8FAFC',
    borderLight: 'FFE2E8F0',
    borderMedium: 'FFCBD5E1',
    // Estados
    statusSuccessBg: 'FFDCFCE7',
    statusSuccessText: 'FF166534',
    statusWarningBg: 'FFFEF3C7',
    statusWarningText: 'FFB45309',
    statusDangerBg: 'FFFEE2E2',
    statusDangerText: 'FF991B1B',
    statusInfoBg: 'FFEFF6FF',
    statusInfoText: 'FF1E40AF',
};

/**
 * Aplica el banner institucional superior en cada hoja
 */
function applyInstitutionalHeader(ws, {
    sheetTitle,
    headerColor,
    numCols,
    activePeriodLabel,
    rangoLegible,
    totalCirugias,
    ambitoFilter
}) {
    // 1. Título de la Institución
    const row1 = ws.addRow(['SANATORIO ARGENTINO · DIRECCIÓN MÉDICA & GOBERNANZA CLÍNICA']);
    row1.height = 28;
    ws.mergeCells(1, 1, 1, numCols);
    const cell1 = ws.getCell(1, 1);
    cell1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.headerNavy } };
    cell1.font = { name: 'Calibri', size: 13, bold: true, color: { argb: PALETTE.white } };
    cell1.alignment = { vertical: 'middle', horizontal: 'center' };

    // 2. Subtítulo del Módulo y Tipo de Reporte
    const row2 = ws.addRow([`TABLERO QUIRÚRGICO OFICIAL — ${sheetTitle.toUpperCase()}`]);
    row2.height = 22;
    ws.mergeCells(2, 1, 2, numCols);
    const cell2 = ws.getCell(2, 1);
    cell2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerColor } };
    cell2.font = { name: 'Calibri', size: 10, bold: true, color: { argb: PALETTE.white } };
    cell2.alignment = { vertical: 'middle', horizontal: 'center' };

    // 3. BANNER DESTACADO DEL PERÍODO ANALIZADO (MÁXIMA VISIBILIDAD)
    const periodoTexto = `🗓️ PERÍODO ANALIZADO: ${(activePeriodLabel || 'HISTÓRICO').toUpperCase()}    |    RANGO: ${rangoLegible || 'SIN LIMITAR'}    |    CIRUGÍAS TOTALES: ${totalCirugias.toLocaleString()} PACIENTES    |    ÁMBITO: ${ambitoFilter.toUpperCase()}`;
    const row3 = ws.addRow([periodoTexto]);
    row3.height = 26;
    ws.mergeCells(3, 1, 3, numCols);
    const cell3 = ws.getCell(3, 1);
    cell3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.periodBannerBg } };
    cell3.font = { name: 'Calibri', size: 11, bold: true, color: { argb: PALETTE.periodBannerText } };
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
 * Aplica estilos a los encabezados de columnas (Fila 6)
 */
function applyColumnHeaders(ws, headers, headerColor) {
    const row6 = ws.addRow(headers);
    row6.height = 26;
    row6.eachCell((cell) => {
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

    // Inmovilizar encabezados arriba de los datos (Fila 6)
    ws.views = [{ state: 'frozen', ySplit: 6 }];

    // AutoFilter
    ws.autoFilter = {
        from: { row: 6, column: 1 },
        to: { row: 6, column: headers.length }
    };

    return row6;
}

/**
 * Función principal para generar y descargar el libro Excel completo con estilos y colores
 */
export async function exportQuirofanoExcelStyled({
    rowsToExport,
    activeSalasData = [],
    activeEspecialidadesData = [],
    activeObrasSocialesData = [],
    activeMotivosSuspension = [],
    cirujanosSource = [],
    activePeriodLabel = 'Período Activo',
    effectiveDesde = '',
    effectiveHasta = '',
    ambitoFilter = 'TODOS',
    customFilename = null,
    getSalaEstimada = () => 'Quirófano General'
}) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Sanatorio Argentino — Auditoría Quirúrgica';
    wb.lastModifiedBy = 'Sistema ADM-QUI Gobernanza';
    wb.created = new Date();
    wb.modified = new Date();

    const rangoLegible = effectiveDesde && effectiveHasta
        ? `${effectiveDesde.split('-').reverse().join('/')} al ${effectiveHasta.split('-').reverse().join('/')}`
        : 'Histórico';

    // ─────────────────────────────────────────────────────────────
    // HOJA 1: CIRUGÍAS Y PACIENTES (NOMINAL PACIENTE POR PACIENTE)
    // ─────────────────────────────────────────────────────────────
    const ws1 = wb.addWorksheet('Cirugías Nominales', {
        properties: { tabColor: { argb: PALETTE.headerBlue } }
    });

    const headers1 = [
        'N°',
        'Fecha Cirugía',
        'Paciente',
        'NHC / Historia',
        'DNI',
        'Teléfono',
        'Cirujano / Especialista',
        'Módulo / Código',
        'Procedimiento Quirúrgico Detallado',
        'Ámbito Quirúrgico',
        'Sala Estimada',
        'Obra Social / Financiador',
        'Estado del Turno',
        'Motivo de Suspensión',
        'Instrucciones / Observaciones'
    ];

    applyInstitutionalHeader(ws1, {
        sheetTitle: 'Auditoría Nominal Paciente por Paciente (Cirugía por Cirugía)',
        headerColor: PALETTE.headerBlue,
        numCols: headers1.length,
        activePeriodLabel,
        rangoLegible,
        totalCirugias: rowsToExport.length,
        ambitoFilter
    });

    applyColumnHeaders(ws1, headers1, PALETTE.headerBlue);

    // Agregar filas de datos nominales
    rowsToExport.forEach((s, idx) => {
        const estadoLimpio = s.status === 'azul' ? 'Confirmada / Realizada'
            : s.status === 'verde' ? 'Autorizada'
            : s.status === 'amarillo' ? 'En Revisión'
            : s.status === 'rojo' || s.status === 'suspendida' ? 'Suspendida / Con Problema'
            : (s.status || 'Registrada').toUpperCase();

        const salaEstimada = getSalaEstimada(s, idx);

        const fechaFormateada = s.fecha_cirugia 
            ? s.fecha_cirugia.split('-').reverse().join('/') 
            : '—';

        const row = ws1.addRow([
            idx + 1,
            fechaFormateada,
            (s.nombre || 'PACIENTE NO ESPECIFICADO').trim(),
            s.id_paciente || '—',
            s.dni || '—',
            s.telefono || '—',
            (s.medico || 'SIN CIRUJANO ASIGNADO').trim(),
            s.modulo || '—',
            s.descripcion || s.modulo || '—',
            s.grupo_agendas || 'QUIRÓFANOS CENTRALES',
            salaEstimada,
            s.obra_social || 'PARTICULAR',
            estadoLimpio,
            s.motivo || '—',
            s.instrucciones || '—'
        ]);

        row.height = 20;
        const isZebra = idx % 2 === 1;

        row.eachCell((cell, colNumber) => {
            // Fondo cebra por defecto
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: isZebra ? PALETTE.zebraBg : PALETTE.white }
            };
            cell.font = { name: 'Calibri', size: 9, color: { argb: PALETTE.textMain } };
            cell.border = {
                top: { style: 'thin', color: { argb: PALETTE.borderLight } },
                bottom: { style: 'thin', color: { argb: PALETTE.borderLight } },
                left: { style: 'thin', color: { argb: PALETTE.borderLight } },
                right: { style: 'thin', color: { argb: PALETTE.borderLight } }
            };

            // Alineaciones
            if ([1, 2, 4, 5, 6].includes(colNumber)) {
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            } else if ([11, 13].includes(colNumber)) {
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            } else {
                cell.alignment = { vertical: 'middle', horizontal: 'left' };
            }

            // Formato de Estado (Columna 13)
            if (colNumber === 13) {
                if (estadoLimpio.includes('Confirmada') || estadoLimpio.includes('Realizada')) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.statusSuccessBg } };
                    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: PALETTE.statusSuccessText } };
                } else if (estadoLimpio.includes('Autorizada')) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
                    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF047857' } };
                } else if (estadoLimpio.includes('Revisión')) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.statusWarningBg } };
                    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: PALETTE.statusWarningText } };
                } else if (estadoLimpio.includes('Suspendida') || estadoLimpio.includes('Problema')) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.statusDangerBg } };
                    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: PALETTE.statusDangerText } };
                }
            }
        });
    });

    // Ancho de columnas Hoja 1
    ws1.columns = [
        { width: 6 },   // N°
        { width: 14 },  // Fecha
        { width: 34 },  // Paciente
        { width: 16 },  // NHC
        { width: 14 },  // DNI
        { width: 16 },  // Teléfono
        { width: 32 },  // Cirujano
        { width: 24 },  // Módulo
        { width: 38 },  // Descripción
        { width: 24 },  // Ámbito
        { width: 20 },  // Sala
        { width: 26 },  // Obra Social
        { width: 24 },  // Estado
        { width: 26 },  // Motivo Suspensión
        { width: 32 }   // Instrucciones
    ];

    // ─────────────────────────────────────────────────────────────
    // HOJA 2: OCUPACIÓN POR SALA
    // ─────────────────────────────────────────────────────────────
    const ws2 = wb.addWorksheet('Ocupación por Sala', {
        properties: { tabColor: { argb: PALETTE.headerGreen } }
    });

    const headers2 = [
        'Sala Quirúrgica',
        'Denominación Institucional',
        'Ámbito Operativo',
        'Cirugías Asignadas',
        'Horas Efectivas de Qx',
        '% Ocupación Efectiva',
        'Nivel de Ocupación'
    ];

    applyInstitutionalHeader(ws2, {
        sheetTitle: 'Rendimiento y Ocupación Efectiva por Sala de Quirófano',
        headerColor: PALETTE.headerGreen,
        numCols: headers2.length,
        activePeriodLabel,
        rangoLegible,
        totalCirugias: rowsToExport.length,
        ambitoFilter
    });

    applyColumnHeaders(ws2, headers2, PALETTE.headerGreen);

    let totalCirugiasSalas = 0;
    let totalHorasSalas = 0;

    activeSalasData.forEach((s, idx) => {
        totalCirugiasSalas += s.cirugias || 0;
        totalHorasSalas += s.horas || 0;

        const nivel = s.ocupacionPct >= 80 ? 'Óptimo (Meta Cumplida)'
            : s.ocupacionPct >= 65 ? 'Estándar Adecuado'
            : 'Capacidad Ociosa / Alerta';

        const row = ws2.addRow([
            s.sala,
            s.nombre,
            s.tipo || (s.sala.includes('HdD') ? 'Hospital de Día' : 'Centrales'),
            s.cirugias,
            s.horas,
            `${s.ocupacionPct}%`,
            nivel
        ]);

        row.height = 22;
        const isZebra = idx % 2 === 1;

        row.eachCell((cell, colNumber) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: isZebra ? PALETTE.zebraBg : PALETTE.white }
            };
            cell.font = { name: 'Calibri', size: 9.5, color: { argb: PALETTE.textMain } };
            cell.border = {
                top: { style: 'thin', color: { argb: PALETTE.borderLight } },
                bottom: { style: 'thin', color: { argb: PALETTE.borderLight } },
                left: { style: 'thin', color: { argb: PALETTE.borderLight } },
                right: { style: 'thin', color: { argb: PALETTE.borderLight } }
            };

            if ([1, 3].includes(colNumber)) cell.alignment = { vertical: 'middle', horizontal: 'center' };
            else if ([4, 5, 6].includes(colNumber)) cell.alignment = { vertical: 'middle', horizontal: 'right' };
            else cell.alignment = { vertical: 'middle', horizontal: 'left' };

            // % Ocupación
            if (colNumber === 6) {
                if (s.ocupacionPct >= 80) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.statusSuccessBg } };
                    cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: PALETTE.statusSuccessText } };
                } else if (s.ocupacionPct < 65) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.statusWarningBg } };
                    cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: PALETTE.statusWarningText } };
                }
            }
        });
    });

    // Fila Totalizadora
    const rowTotalSalas = ws2.addRow([
        'TOTAL / CONSOLIDADO',
        'Centro Quirúrgico Completo',
        'Institucional',
        totalCirugiasSalas,
        Number(totalHorasSalas.toFixed(1)),
        '—',
        'Consolidado Período'
    ]);
    rowTotalSalas.height = 24;
    rowTotalSalas.eachCell((cell, colNumber) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: PALETTE.headerNavy } };
        cell.border = {
            top: { style: 'double', color: { argb: PALETTE.headerNavy } },
            bottom: { style: 'medium', color: { argb: PALETTE.headerNavy } }
        };
        if ([4, 5, 6].includes(colNumber)) cell.alignment = { vertical: 'middle', horizontal: 'right' };
        else cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });

    ws2.columns = [
        { width: 18 },  // Sala
        { width: 36 },  // Denominación
        { width: 22 },  // Ámbito
        { width: 20 },  // Cirugías
        { width: 22 },  // Horas
        { width: 22 },  // % Ocupación
        { width: 26 }   // Nivel
    ];

    // ─────────────────────────────────────────────────────────────
    // HOJA 3: RANKING DE CIRUJANOS
    // ─────────────────────────────────────────────────────────────
    const ws3 = wb.addWorksheet('Ranking de Cirujanos', {
        properties: { tabColor: { argb: PALETTE.headerPurple } }
    });

    const headers3 = [
        'Cirujano / Especialista',
        'Especialidad Médica',
        'Cirugías Programadas',
        'Cirugías Realizadas',
        'Cirugías Suspendidas',
        '% Tasa de Suspensión',
        '% Participación en Quirofano',
        'Estado de Auditoría'
    ];

    applyInstitutionalHeader(ws3, {
        sheetTitle: 'Rendimiento Quirúrgico Individual y Tasa de Suspensión por Cirujano',
        headerColor: PALETTE.headerPurple,
        numCols: headers3.length,
        activePeriodLabel,
        rangoLegible,
        totalCirugias: rowsToExport.length,
        ambitoFilter
    });

    applyColumnHeaders(ws3, headers3, PALETTE.headerPurple);

    cirujanosSource.forEach((c, idx) => {
        const estadoAuditoria = c.pctSuspension > 10 ? 'Atención: Suspensión Alta'
            : c.pctSuspension <= 4 ? 'Excelente Cumplimiento'
            : 'Rango Aceptable';

        const row = ws3.addRow([
            c.nombre,
            c.especialidad,
            c.programadas,
            c.realizadas,
            c.suspendidas,
            `${c.pctSuspension}%`,
            `${c.pctTotal}%`,
            estadoAuditoria
        ]);

        row.height = 20;
        const isZebra = idx % 2 === 1;

        row.eachCell((cell, colNumber) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: isZebra ? PALETTE.zebraBg : PALETTE.white }
            };
            cell.font = { name: 'Calibri', size: 9, color: { argb: PALETTE.textMain } };
            cell.border = {
                top: { style: 'thin', color: { argb: PALETTE.borderLight } },
                bottom: { style: 'thin', color: { argb: PALETTE.borderLight } },
                left: { style: 'thin', color: { argb: PALETTE.borderLight } },
                right: { style: 'thin', color: { argb: PALETTE.borderLight } }
            };

            if ([3, 4, 5, 6, 7].includes(colNumber)) cell.alignment = { vertical: 'middle', horizontal: 'right' };
            else if (colNumber === 8) cell.alignment = { vertical: 'middle', horizontal: 'center' };
            else cell.alignment = { vertical: 'middle', horizontal: 'left' };

            // Tasa de suspensión en rojo si > 10%
            if (colNumber === 6 && c.pctSuspension > 10) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.statusDangerBg } };
                cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: PALETTE.statusDangerText } };
            }
        });
    });

    ws3.columns = [
        { width: 36 },  // Cirujano
        { width: 30 },  // Especialidad
        { width: 22 },  // Programadas
        { width: 20 },  // Realizadas
        { width: 20 },  // Suspendidas
        { width: 22 },  // % Suspensión
        { width: 24 },  // % Participación
        { width: 26 }   // Estado
    ];

    // ─────────────────────────────────────────────────────────────
    // HOJA 4: ESPECIALIDADES QUIRÚRGICAS
    // ─────────────────────────────────────────────────────────────
    const ws4 = wb.addWorksheet('Especialidades', {
        properties: { tabColor: { argb: PALETTE.headerCyan } }
    });

    const headers4 = [
        'Especialidad Quirúrgica',
        'Volumen de Cirugías',
        '% Participación Relativa'
    ];

    applyInstitutionalHeader(ws4, {
        sheetTitle: 'Distribución por Especialidades Quirúrgicas',
        headerColor: PALETTE.headerCyan,
        numCols: headers4.length,
        activePeriodLabel,
        rangoLegible,
        totalCirugias: rowsToExport.length,
        ambitoFilter
    });

    applyColumnHeaders(ws4, headers4, PALETTE.headerCyan);

    activeEspecialidadesData.forEach((e, idx) => {
        const row = ws4.addRow([
            e.nombre,
            e.cant,
            `${e.pct}%`
        ]);
        row.height = 20;
        const isZebra = idx % 2 === 1;
        row.eachCell((cell, colNumber) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isZebra ? PALETTE.zebraBg : PALETTE.white } };
            cell.font = { name: 'Calibri', size: 9.5, color: { argb: PALETTE.textMain } };
            cell.border = {
                top: { style: 'thin', color: { argb: PALETTE.borderLight } },
                bottom: { style: 'thin', color: { argb: PALETTE.borderLight } },
                left: { style: 'thin', color: { argb: PALETTE.borderLight } },
                right: { style: 'thin', color: { argb: PALETTE.borderLight } }
            };
            if ([2, 3].includes(colNumber)) cell.alignment = { vertical: 'middle', horizontal: 'right' };
            else cell.alignment = { vertical: 'middle', horizontal: 'left' };
        });
    });

    ws4.columns = [{ width: 34 }, { width: 22 }, { width: 22 }];

    // ─────────────────────────────────────────────────────────────
    // HOJA 5: OBRAS SOCIALES Y FINANCIADORES
    // ─────────────────────────────────────────────────────────────
    const ws5 = wb.addWorksheet('Obras Sociales', {
        properties: { tabColor: { argb: PALETTE.headerTeal } }
    });

    const headers5 = [
        'Financiador / Obra Social',
        'Cirugías Autorizadas y Realizadas',
        '% Cuota de Participación'
    ];

    applyInstitutionalHeader(ws5, {
        sheetTitle: 'Distribución por Financiador y Obra Social',
        headerColor: PALETTE.headerTeal,
        numCols: headers5.length,
        activePeriodLabel,
        rangoLegible,
        totalCirugias: rowsToExport.length,
        ambitoFilter
    });

    applyColumnHeaders(ws5, headers5, PALETTE.headerTeal);

    activeObrasSocialesData.forEach((o, idx) => {
        const row = ws5.addRow([
            o.nombre,
            o.cant,
            `${o.pct}%`
        ]);
        row.height = 20;
        const isZebra = idx % 2 === 1;
        row.eachCell((cell, colNumber) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isZebra ? PALETTE.zebraBg : PALETTE.white } };
            cell.font = { name: 'Calibri', size: 9.5, color: { argb: PALETTE.textMain } };
            cell.border = {
                top: { style: 'thin', color: { argb: PALETTE.borderLight } },
                bottom: { style: 'thin', color: { argb: PALETTE.borderLight } },
                left: { style: 'thin', color: { argb: PALETTE.borderLight } },
                right: { style: 'thin', color: { argb: PALETTE.borderLight } }
            };
            if ([2, 3].includes(colNumber)) cell.alignment = { vertical: 'middle', horizontal: 'right' };
            else cell.alignment = { vertical: 'middle', horizontal: 'left' };
        });
    });

    ws5.columns = [{ width: 38 }, { width: 24 }, { width: 24 }];

    // ─────────────────────────────────────────────────────────────
    // HOJA 6: CAUSALES DE SUSPENSIÓN QUIRÚRGICA
    // ─────────────────────────────────────────────────────────────
    const ws6 = wb.addWorksheet('Causales de Suspensión', {
        properties: { tabColor: { argb: PALETTE.headerRed } }
    });

    const headers6 = [
        'Código Causal',
        'Motivo Oficial de Suspensión',
        'Tipo de Responsabilidad',
        'Cantidad de Cancelaciones',
        '% del Total de Suspensiones'
    ];

    applyInstitutionalHeader(ws6, {
        sheetTitle: 'Análisis Causal de Cirugías Suspendidas y No Realizadas',
        headerColor: PALETTE.headerRed,
        numCols: headers6.length,
        activePeriodLabel,
        rangoLegible,
        totalCirugias: rowsToExport.length,
        ambitoFilter
    });

    applyColumnHeaders(ws6, headers6, PALETTE.headerRed);

    activeMotivosSuspension.forEach((m, idx) => {
        const row = ws6.addRow([
            m.codigo,
            m.motivo,
            m.tipo,
            m.cantidad,
            `${m.pct}%`
        ]);
        row.height = 20;
        const isZebra = idx % 2 === 1;
        row.eachCell((cell, colNumber) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isZebra ? PALETTE.zebraBg : PALETTE.white } };
            cell.font = { name: 'Calibri', size: 9.5, color: { argb: PALETTE.textMain } };
            cell.border = {
                top: { style: 'thin', color: { argb: PALETTE.borderLight } },
                bottom: { style: 'thin', color: { argb: PALETTE.borderLight } },
                left: { style: 'thin', color: { argb: PALETTE.borderLight } },
                right: { style: 'thin', color: { argb: PALETTE.borderLight } }
            };
            if ([1, 3].includes(colNumber)) cell.alignment = { vertical: 'middle', horizontal: 'center' };
            else if ([4, 5].includes(colNumber)) cell.alignment = { vertical: 'middle', horizontal: 'right' };
            else cell.alignment = { vertical: 'middle', horizontal: 'left' };
        });
    });

    ws6.columns = [{ width: 14 }, { width: 38 }, { width: 24 }, { width: 24 }, { width: 26 }];

    // ─────────────────────────────────────────────────────────────
    // ESCRITURA Y DESCARGA DIRECTA EN EL NAVEGADOR
    // ─────────────────────────────────────────────────────────────
    const cleanPeriod = (activePeriodLabel || 'Periodo')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/_+/g, '_');
    const fileName = customFilename || `Quirofano_Sanatorio_Argentino_${cleanPeriod}.xlsx`;

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
