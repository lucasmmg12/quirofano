/**
 * contactCenterMonthlyReportPdf.js — Generador Oficial del Informe Ejecutivo Mensual (PDF)
 * Contact Center · Sanatorio Argentino
 *
 * Incluye:
 * 1. Matriz Oficial de Indicadores de Gestión Mes a Mes (7 indicadores mandatorios PA-11 + KPIs ejecutivos)
 *    con semáforo de Tendencia (Mejora / Estable / Deterioro), Variación % y Comentario Ejecutivo.
 * 2. Auditoría Financiera Unificada: Gráfico de Línea Vectorial en el mismo plano comparando
 *    Gasto en Mensajes WhatsApp (Meta API) vs. Gasto en Tokens de IA (OpenAI) + Tabla Mes a Mes (USD y ARS).
 * 3. Volumen Operativo, Automatización Bot vs. Atención Humana, Franjas Horarias y Triage Clínico.
 * 4. Cruce Oficial SALUS: Turnos en Servicios Estratégicos (DxI, Chequeo, Prevenir, Kinesiología) y Asistencia.
 * 5. Rendimiento Individual por Asesora, SLA y Bolsa de Incentivos.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getSanatorioLogoBase64, SANATORIO_LOGO_BASE64 } from './sanatorioLogoBase64';

const THEME = {
    navy: [13, 59, 102],        // #0D3B66 — Azul Institucional Sanatorio Argentino
    navyDark: [15, 41, 66],     // #0F2942
    accent: [2, 132, 199],      // #0284C7 — Azul Mensajes / Meta
    purple: [139, 92, 246],     // #8B5CF6 — Violeta Tokens IA
    emerald: [5, 150, 105],     // #059669 — Verde Éxito / Total
    darkText: [15, 23, 42],     // #0F172A
    bodyText: [51, 65, 85],     // #334155
    mutedText: [100, 116, 139], // #64748B
    cardBg: [248, 250, 252],    // #F8FAFC
    border: [226, 232, 240],    // #E2E8F0
    white: [255, 255, 255],
    // Semáforos ejecutivos (idénticos a la matriz de revisión de dirección)
    mejoraBg: [217, 234, 211],      // Verde suave ejecutivo
    mejoraText: [22, 101, 52],      // #166534
    estableBg: [255, 229, 153],     // Amarillo suave ejecutivo
    estableText: [146, 64, 14],     // #92400E
    deterioroBg: [244, 204, 204],   // Rojo suave ejecutivo
    deterioroText: [153, 27, 27]    // #991B1B
};

function cleanText(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '')
        .replace(/[^\x20-\x7E\xA0-\xFF\u00C0-\u017F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Dibuja el encabezado institucional en la página actual
 */
function drawPageHeader(doc, logoBase64, periodLabel, prevPeriodLabel, subtitleRight = 'INFORME EJECUTIVO MENSUAL') {
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 12;

    doc.setFillColor(...THEME.navy);
    doc.rect(0, 0, pageW, 29, 'F');

    doc.setFillColor(...THEME.accent);
    doc.rect(0, 29, pageW, 2, 'F');

    const logoX = margin + 1;
    const logoY = 5.5;
    const logoSize = 16.5;
    if (logoBase64) {
        try {
            doc.addImage(logoBase64, 'PNG', logoX, logoY, logoSize, logoSize);
        } catch {
            // Fallback silencioso si falla la carga de imagen
        }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13.5);
    doc.setTextColor(255, 255, 255);
    doc.text('SANATORIO ARGENTINO', margin + 21, 11.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225);
    doc.text('Contact Center & Gestion de Pacientes · Auditoria Mensual de Indicadores y Costos', margin + 21, 17);
    doc.text(`Comparativa Oficial: ${cleanText(prevPeriodLabel)} vs. ${cleanText(periodLabel)}`, margin + 21, 22);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(255, 255, 255);
    doc.text(cleanText(subtitleRight), pageW - margin, 11.5, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(203, 213, 225);
    doc.text(`Periodo Auditado: ${cleanText(periodLabel)}`, pageW - margin, 17, { align: 'right' });
    const nowStr = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    doc.text(`Emision: ${nowStr}`, pageW - margin, 22, { align: 'right' });

    return 36;
}

/**
 * Dibuja un título de sección con barra lateral institucional
 */
function drawSectionTitle(doc, y, number, title, subtitle = '') {
    const margin = 12;
    const pageW = doc.internal.pageSize.getWidth();
    const colW = pageW - margin * 2;

    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, y, colW, subtitle ? 11 : 8, 1.5, 1.5, 'F');

    doc.setFillColor(...THEME.navy);
    doc.rect(margin, y, 3, subtitle ? 11 : 8, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    doc.setTextColor(...THEME.navyDark);
    doc.text(cleanText(`${number}. ${title}`), margin + 6, y + 5.3);

    if (subtitle) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.2);
        doc.setTextColor(...THEME.mutedText);
        doc.text(cleanText(subtitle), margin + 6, y + 9.2);
    }

    return y + (subtitle ? 14 : 11);
}

/**
 * Dibuja un gráfico de línea doble vectorial en jsPDF:
 * Línea 1 (Azul #0284C7): Gasto en Mensajes WhatsApp (USD)
 * Línea 2 (Violeta #8B5CF6): Gasto en Tokens de IA (USD)
 */
function drawDualCostLineChart(doc, x, y, w, h, seriesData = [], title = 'Evolucion de Gasto: Mensajes WhatsApp vs. Tokens de IA (USD)') {
    // Contenedor
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, w, h, 2, 2, 'F');
    doc.setDrawColor(...THEME.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, 2, 2, 'S');

    // Título del gráfico y leyenda
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(...THEME.navyDark);
    doc.text(cleanText(title), x + 4, y + 5.5);

    // Leyenda a la derecha
    const legRight = x + w - 4;
    // Leyenda IA
    doc.setFillColor(...THEME.purple);
    doc.circle(legRight - 72, y + 4.5, 1.4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(...THEME.purple);
    doc.text('Gasto Tokens IA (USD)', legRight - 69, y + 5.2);

    // Leyenda Mensajes
    doc.setFillColor(...THEME.accent);
    doc.circle(legRight - 34, y + 4.5, 1.4, 'F');
    doc.setTextColor(...THEME.accent);
    doc.text('Gasto Mensajes WA (USD)', legRight - 31, y + 5.2);

    const padLeft = 14;
    const padRight = 6;
    const padTop = 10;
    const padBottom = 9;
    const plotX = x + padLeft;
    const plotY = y + padTop;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    if (!Array.isArray(seriesData) || seriesData.length === 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...THEME.mutedText);
        doc.text('Sin datos diarios registrados en este periodo', x + w / 2, y + h / 2, { align: 'center' });
        return;
    }

    // Encontrar máximo para escalar eje Y
    let maxVal = 0;
    seriesData.forEach(d => {
        const mCost = Number(d.msgCostUsd) || 0;
        const aCost = Number(d.aiCostUsd) || 0;
        if (mCost > maxVal) maxVal = mCost;
        if (aCost > maxVal) maxVal = aCost;
    });
    if (maxVal <= 0) maxVal = 10;
    else maxVal = Math.ceil(maxVal * 1.15);

    // Líneas de grilla horizontales (4 niveles)
    const steps = 4;
    doc.setLineWidth(0.15);
    for (let i = 0; i <= steps; i++) {
        const ratio = i / steps;
        const gy = plotY + plotH - ratio * plotH;
        const valLabel = (maxVal * ratio).toFixed(maxVal < 10 ? 1 : 0);

        doc.setDrawColor(226, 232, 240);
        doc.line(plotX, gy, plotX + plotW, gy);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(...THEME.mutedText);
        doc.text(`$${valLabel}`, plotX - 1.5, gy + 1, { align: 'right' });
    }

    const n = seriesData.length;
    const getPtX = (idx) => (n === 1 ? plotX + plotW / 2 : plotX + (idx / (n - 1)) * plotW);
    const getPtY = (val) => plotY + plotH - Math.min(1, Math.max(0, (Number(val) || 0) / maxVal)) * plotH;

    // Dibujar etiquetas eje X
    const labelStep = Math.max(1, Math.ceil(n / 10));
    seriesData.forEach((d, idx) => {
        if (idx % labelStep === 0 || idx === n - 1) {
            const px = getPtX(idx);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(5.8);
            doc.setTextColor(...THEME.mutedText);
            doc.text(cleanText(d.label || d.fecha || ''), px, plotY + plotH + 4.5, { align: 'center' });
        }
    });

    // Línea 1: Gasto Mensajes WhatsApp (Azul #0284C7)
    doc.setDrawColor(...THEME.accent);
    doc.setLineWidth(0.75);
    for (let i = 0; i < n - 1; i++) {
        const x1 = getPtX(i);
        const y1 = getPtY(seriesData[i].msgCostUsd);
        const x2 = getPtX(i + 1);
        const y2 = getPtY(seriesData[i + 1].msgCostUsd);
        doc.line(x1, y1, x2, y2);
    }

    // Línea 2: Gasto Tokens IA (Violeta #8B5CF6)
    doc.setDrawColor(...THEME.purple);
    doc.setLineWidth(0.75);
    for (let i = 0; i < n - 1; i++) {
        const x1 = getPtX(i);
        const y1 = getPtY(seriesData[i].aiCostUsd);
        const x2 = getPtX(i + 1);
        const y2 = getPtY(seriesData[i + 1].aiCostUsd);
        doc.line(x1, y1, x2, y2);
    }

    // Puntos sobre cada serie
    for (let i = 0; i < n; i++) {
        const px = getPtX(i);
        const pyMsg = getPtY(seriesData[i].msgCostUsd);
        const pyAi = getPtY(seriesData[i].aiCostUsd);

        doc.setFillColor(...THEME.accent);
        doc.circle(px, pyMsg, 0.9, 'F');

        doc.setFillColor(...THEME.purple);
        doc.circle(px, pyAi, 0.9, 'F');
    }
}

/**
 * Genera y descarga el Informe Ejecutivo Mensual del Contact Center en formato PDF A4
 */
export async function generateContactCenterMonthlyReportPdf(reportPayload) {
    if (!reportPayload) throw new Error('No se proporcionaron datos para generar el reporte mensual');

    const {
        periodLabel = 'Octubre 2026',
        prevPeriodLabel = 'Septiembre 2026',
        selectedMonth = '2026-10',
        arsRate = 1380,
        executiveIndicators = [],
        financialSummary = {},
        dailyCostSeries = [],
        monthlyCostComparison = [],
        metrics = {},
        salusServicios = null,
        salusHistoryMap = {},
        inquiryBreakdown = [],
        motivosCatalogo = [],
        incentivoBolsa1 = { escalon: 0, monto: 0 }
    } = reportPayload;

    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 12;
    const colW = pageW - margin * 2;

    let logoBase64 = null;
    try {
        logoBase64 = await getSanatorioLogoBase64();
    } catch {
        logoBase64 = SANATORIO_LOGO_BASE64;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PÁGINA 1: MATRIZ EJECUTIVA DE INDICADORES OFICIALES + COSTOS (LINE CHART)
    // ═══════════════════════════════════════════════════════════════════════
    let y = drawPageHeader(doc, logoBase64, periodLabel, prevPeriodLabel, 'REPORTE EJECUTIVO MENSUAL');

    // 1. MATRIZ OFICIAL DE INDICADORES (LOS 7 INDICADORES SOLICITADOS POR DIRECCIÓN)
    y = drawSectionTitle(
        doc,
        y,
        '1',
        'Tablero de Indicadores de Gestion del Contact Center (Comparativa Mes a Mes)',
        `Evaluacion de desempeno asistencial, tiempos de respuesta, resolucion, turnos y asistencia (${prevPeriodLabel} vs. ${periodLabel})`
    );

    const indicatorRows = executiveIndicators.map(ind => [
        cleanText(ind.indicador),
        cleanText(ind.unidad),
        cleanText(ind.meta),
        cleanText(ind.prevFormatted),
        cleanText(ind.currFormatted),
        cleanText(ind.variacionFormatted),
        cleanText(ind.tendencia),
        cleanText(ind.comentario)
    ]);

    autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [[
            'Indicador',
            'Unidad',
            'Meta',
            'Resultado mes anterior',
            'Resultado actual',
            'Variacion',
            'Tendencia',
            'Comentario ejecutivo'
        ]],
        body: indicatorRows,
        theme: 'grid',
        styles: {
            font: 'helvetica',
            fontSize: 7.1,
            cellPadding: 2.3,
            textColor: THEME.darkText,
            lineColor: [203, 213, 225],
            lineWidth: 0.2,
            valign: 'middle'
        },
        headStyles: {
            fillColor: [11, 53, 102], // Azul oscuro institucional idéntico a la planilla ejecutiva
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center',
            fontSize: 7.2
        },
        columnStyles: {
            0: { cellWidth: 35, fontStyle: 'bold' },
            1: { cellWidth: 16, halign: 'center' },
            2: { cellWidth: 23, halign: 'left' },
            3: { cellWidth: 19, halign: 'right' },
            4: { cellWidth: 19, halign: 'right', fontStyle: 'bold' },
            5: { cellWidth: 17, halign: 'right', fontStyle: 'bold' },
            6: { cellWidth: 17, halign: 'left', fontStyle: 'bold' },
            7: { cellWidth: 40, halign: 'left', fontSize: 6.7 }
        },
        didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 6) {
                const raw = String(data.cell.raw || '').toLowerCase();
                if (raw.includes('mejora')) {
                    data.cell.styles.fillColor = THEME.mejoraBg;
                    data.cell.styles.textColor = THEME.mejoraText;
                } else if (raw.includes('deterioro')) {
                    data.cell.styles.fillColor = THEME.deterioroBg;
                    data.cell.styles.textColor = THEME.deterioroText;
                } else if (raw.includes('estable')) {
                    data.cell.styles.fillColor = THEME.estableBg;
                    data.cell.styles.textColor = THEME.estableText;
                }
            }
        }
    });

    y = doc.lastAutoTable.finalY + 6;

    // 2. AUDITORÍA FINANCIERA UNIFICADA: MENSAJES WHATSAPP VS TOKENS DE IA
    y = drawSectionTitle(
        doc,
        y,
        '2',
        'Control Financiero Unificado: Gasto en Mensajes WhatsApp vs. Gasto en Tokens de IA',
        `Auditoria combinada de costos operativos digitales (Cotizacion de referencia: $${Number(arsRate || 1380).toLocaleString('es-AR')} ARS / USD)`
    );

    // 4 Tarjetas KPI Financieras
    const kpiW = (colW - 9) / 4;
    const kpiH = 19;
    const finCards = [
        {
            label: 'GASTO MENSAJES WA',
            usd: `$${Number(financialSummary.msgCostUsd || 0).toFixed(2)} USD`,
            ars: `~ $${Math.round(Number(financialSummary.msgCostArs || 0)).toLocaleString('es-AR')} ARS`,
            sub: `${Number(financialSummary.totalOutgoing || 0).toLocaleString('es-AR')} env. (${Number(financialSummary.billableMessages || 0).toLocaleString('es-AR')} fact.)`,
            color: THEME.accent,
            bg: [240, 249, 255]
        },
        {
            label: 'GASTO TOKENS IA (OPENAI)',
            usd: `$${Number(financialSummary.aiCostUsd || 0).toFixed(2)} USD`,
            ars: `~ $${Math.round(Number(financialSummary.aiCostArs || 0)).toLocaleString('es-AR')} ARS`,
            sub: `${cleanText(financialSummary.formattedTokens || '0')} tokens (${Number(financialSummary.aiCalls || 0).toLocaleString('es-AR')} llamadas)`,
            color: THEME.purple,
            bg: [245, 243, 255]
        },
        {
            label: 'GASTO TOTAL COMBINADO',
            usd: `$${Number(financialSummary.totalCombinedUsd || 0).toFixed(2)} USD`,
            ars: `~ $${Math.round(Number(financialSummary.totalCombinedArs || 0)).toLocaleString('es-AR')} ARS`,
            sub: `Mensajes (${financialSummary.msgSharePct || 0}%) + IA (${financialSummary.aiSharePct || 0}%)`,
            color: THEME.navyDark,
            bg: [241, 245, 249]
        },
        {
            label: 'COSTO UNITARIO / PACIENTE',
            usd: `$${Number(financialSummary.costPerPatientUsd || 0).toFixed(3)} USD`,
            ars: `~ $${Math.round(Number(financialSummary.costPerPatientArs || 0)).toLocaleString('es-AR')} ARS / pac.`,
            sub: `Sobre ${Number(financialSummary.uniquePatients || 0).toLocaleString('es-AR')} pacientes unicos`,
            color: THEME.emerald,
            bg: [236, 253, 245]
        }
    ];

    finCards.forEach((c, idx) => {
        const cx = margin + idx * (kpiW + 3);
        doc.setFillColor(...c.bg);
        doc.roundedRect(cx, y, kpiW, kpiH, 2, 2, 'F');
        doc.setDrawColor(...THEME.border);
        doc.roundedRect(cx, y, kpiW, kpiH, 2, 2, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.2);
        doc.setTextColor(...c.color);
        doc.text(cleanText(c.label), cx + 3, y + 4.5);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.8);
        doc.setTextColor(...THEME.darkText);
        doc.text(cleanText(c.usd), cx + 3, y + 10.2);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(...THEME.emerald);
        doc.text(cleanText(c.ars), cx + 3, y + 14.2);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.8);
        doc.setTextColor(...THEME.mutedText);
        doc.text(cleanText(c.sub), cx + 3, y + 17.6);
    });

    y += kpiH + 4;

    // Gráfico de Línea Doble Vectorial (Mensajes WhatsApp vs Tokens IA en el mismo gráfico)
    const chartH = 52;
    drawDualCostLineChart(
        doc,
        margin,
        y,
        colW,
        chartH,
        dailyCostSeries,
        `Curva Diaria Comparativa de Gasto (${periodLabel}): Mensajes WhatsApp ($0.026/msg) vs. Tokens IA (USD)`
    );

    y += chartH + 4;

    // Tabla Comparativa Financiera Mes a Mes (Mensajes + Tokens IA)
    if (Array.isArray(monthlyCostComparison) && monthlyCostComparison.length > 0) {
        autoTable(doc, {
            startY: y,
            margin: { left: margin, right: margin },
            head: [[
                'Mes',
                'Msgs Salientes',
                'Msgs Facturables',
                'Gasto Mensajes (USD)',
                'Tokens IA',
                'Gasto Tokens IA (USD)',
                'Total Combinado (USD)',
                'Total Combinado (ARS)'
            ]],
            body: monthlyCostComparison.map(m => [
                cleanText(m.mes),
                Number(m.enviados || 0).toLocaleString('es-AR'),
                Number(m.facturables || 0).toLocaleString('es-AR'),
                `$${Number(m.msgCostUsd || 0).toFixed(2)} USD`,
                cleanText(m.tokensFormatted || '0'),
                `$${Number(m.aiCostUsd || 0).toFixed(2)} USD`,
                `$${Number(m.totalUsd || 0).toFixed(2)} USD`,
                `$${Math.round(Number(m.totalArs || 0)).toLocaleString('es-AR')} ARS`
            ]),
            theme: 'grid',
            styles: {
                font: 'helvetica',
                fontSize: 6.9,
                cellPadding: 2,
                textColor: THEME.darkText,
                lineColor: THEME.border,
                lineWidth: 0.2
            },
            headStyles: {
                fillColor: THEME.navyDark,
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                halign: 'center',
                fontSize: 6.9
            },
            columnStyles: {
                0: { fontStyle: 'bold', halign: 'left' },
                1: { halign: 'right' },
                2: { halign: 'right' },
                3: { halign: 'right', textColor: THEME.accent, fontStyle: 'bold' },
                4: { halign: 'right' },
                5: { halign: 'right', textColor: THEME.purple, fontStyle: 'bold' },
                6: { halign: 'right', fontStyle: 'bold' },
                7: { halign: 'right', textColor: THEME.emerald, fontStyle: 'bold' }
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PÁGINA 2: VOLUMEN OPERATIVO, FRANJAS HORARIAS, SERVICIOS SALUS Y ASESORAS
    // ═══════════════════════════════════════════════════════════════════════
    doc.addPage();
    y = drawPageHeader(doc, logoBase64, periodLabel, prevPeriodLabel, 'DETALLE OPERATIVO Y SALUS');

    // 3. VOLUMEN OPERATIVO, CANALES Y FRANJAS HORARIAS
    y = drawSectionTitle(
        doc,
        y,
        '3',
        'Volumen Operativo, Distribucion por Franja Horaria y Triage Clinico',
        'Desglose de demanda entrante, automatizacion del Bot Dora y derivacion al equipo de asesoras'
    );

    const franjas = metrics?.patientQuality?.incomingHeatmap?.franjas || {
        manana: { count: 0, pct: 0 },
        siesta: { count: 0, pct: 0 },
        tarde: { count: 0, pct: 0 },
        noche: { count: 0, pct: 0 }
    };

    autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [[
            'Metrica de Volumen y Capacidad',
            'Valor del Mes',
            'Participacion / Detalle',
            'Franja Horaria de Ingreso',
            'Casos / Contactos',
            '% Demanda'
        ]],
        body: [
            [
                'Mensajes Entrantes (Pacientes)',
                Number(metrics.totalIncoming || 0).toLocaleString('es-AR'),
                '100% gratuitos en Meta API',
                'Manana (07:00 a 12:59 hs)',
                Number(franjas.manana?.count || 0).toLocaleString('es-AR'),
                `${franjas.manana?.pct || 0}%`
            ],
            [
                'Mensajes Salientes Totales',
                Number(metrics.totalOutgoing || 0).toLocaleString('es-AR'),
                `Bot: ${Number(metrics.botMessages || 0).toLocaleString('es-AR')} | Asesoras: ${Number(metrics.agentMessages || 0).toLocaleString('es-AR')}`,
                'Siesta (13:00 a 15:59 hs)',
                Number(franjas.siesta?.count || 0).toLocaleString('es-AR'),
                `${franjas.siesta?.pct || 0}%`
            ],
            [
                'Conversaciones Ingresadas',
                Number(metrics.totalConversations || 0).toLocaleString('es-AR'),
                `~${metrics.avgMessagesPerConversation || 0} msgs por conversacion`,
                'Tarde (16:00 a 20:59 hs)',
                Number(franjas.tarde?.count || 0).toLocaleString('es-AR'),
                `${franjas.tarde?.pct || 0}%`
            ],
            [
                'Pacientes Unicos Atendidos',
                Number(metrics.uniquePatientsCount || 0).toLocaleString('es-AR'),
                `~${metrics.avgConversationsPerPatient || 1} sesiones por paciente`,
                'Noche / Fuera de Horario (21 a 06 hs)',
                Number(franjas.noche?.count || 0).toLocaleString('es-AR'),
                `${franjas.noche?.pct || 0}%`
            ],
            [
                'Resolucion 1er Contacto (FCR 24h)',
                `${metrics.patientQuality?.fcrPct || 100}%`,
                `SLA <= 15 min: ${metrics.slaStats?.cumplimientoPct || 100}% (${metrics.slaStats?.optimo || 0} casos)`,
                'Hora Pico de Demanda',
                cleanText(metrics.peakHourInfo?.hora || '10:00 hs'),
                `${Number(metrics.peakHourInfo?.cantidad || 0).toLocaleString('es-AR')} msgs`
            ]
        ],
        theme: 'grid',
        styles: {
            font: 'helvetica',
            fontSize: 7,
            cellPadding: 2.1,
            textColor: THEME.darkText,
            lineColor: THEME.border,
            lineWidth: 0.2
        },
        headStyles: {
            fillColor: THEME.navy,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 7
        },
        columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 42 },
            1: { halign: 'right', fontStyle: 'bold', cellWidth: 22 },
            2: { cellWidth: 44 },
            3: { fontStyle: 'bold', cellWidth: 42 },
            4: { halign: 'right', fontStyle: 'bold', cellWidth: 20 },
            5: { halign: 'right', cellWidth: 16 }
        }
    });

    y = doc.lastAutoTable.finalY + 5;

    // 4. SERVICIOS ESTRATÉGICOS SALUS MES A MES
    y = drawSectionTitle(
        doc,
        y,
        '4',
        'Evolucion Mes a Mes de Turnos Otorgados en SALUS por Servicio Estrategico',
        'Cruce oficial con agenda medica hospitalaria SALUS: Diagnostico por Imagenes, Chequeo, Prevenir y Kinesiologia'
    );

    const salusPeriods = ['2026-08', '2026-09', '2026-10'].filter(k => Boolean(salusHistoryMap?.[k]));
    if (salusPeriods.length > 0) {
        autoTable(doc, {
            startY: y,
            margin: { left: margin, right: margin },
            head: [[
                'Periodo',
                'Dx. por Imagenes',
                'Chequeo Preventivo',
                'Programa Prevenir',
                'Kinesiologia',
                'Subtotal 4 Areas',
                'Consultorios Rest.',
                'Total Turnos CC'
            ]],
            body: salusPeriods.map(pKey => {
                const row = salusHistoryMap[pKey] || {};
                const label = pKey === '2026-08' ? 'Agosto 2026' : pKey === '2026-09' ? 'Septiembre 2026' : 'Octubre 2026';
                return [
                    label,
                    `${Number(row.diagnostico_imagenes?.total || 0).toLocaleString('es-AR')} (${row.diagnostico_imagenes?.pctSobreTotal || 0}%)`,
                    `${Number(row.chequeo?.total || 0).toLocaleString('es-AR')} (${row.chequeo?.pctSobreTotal || 0}%)`,
                    `${Number(row.prevenir?.total || 0).toLocaleString('es-AR')} (${row.prevenir?.pctSobreTotal || 0}%)`,
                    `${Number(row.kinesiologia?.total || 0).toLocaleString('es-AR')} (${row.kinesiologia?.pctSobreTotal || 0}%)`,
                    `${Number(row.totalEstrategicos || 0).toLocaleString('es-AR')} (${row.pctEstrategicos || 0}%)`,
                    `${Number(row.otras_especialidades?.total || 0).toLocaleString('es-AR')} (${row.otras_especialidades?.pctSobreTotal || 0}%)`,
                    Number(row.totalTurnosAnalizados || 0).toLocaleString('es-AR')
                ];
            }),
            theme: 'grid',
            styles: {
                font: 'helvetica',
                fontSize: 7,
                cellPadding: 2.1,
                textColor: THEME.darkText,
                lineColor: THEME.border,
                lineWidth: 0.2
            },
            headStyles: {
                fillColor: THEME.navyDark,
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                halign: 'center',
                fontSize: 7
            },
            columnStyles: {
                0: { fontStyle: 'bold' },
                1: { halign: 'right' },
                2: { halign: 'right' },
                3: { halign: 'right' },
                4: { halign: 'right' },
                5: { halign: 'right', fontStyle: 'bold', fillColor: [240, 249, 255] },
                6: { halign: 'right' },
                7: { halign: 'right', fontStyle: 'bold' }
            }
        });
        y = doc.lastAutoTable.finalY + 5;
    }

    // 5. RENDIMIENTO INDIVIDUAL POR ASESORA
    y = drawSectionTitle(
        doc,
        y,
        '5',
        'Rendimiento Individual por Asesora (Productividad, Turnos SALUS, Asistencia y SLA)',
        `Desempeno del equipo operativo en ${periodLabel} · Bolsa 1 lograda: Escalon ${incentivoBolsa1?.escalon || 0}/10 ($${Number(incentivoBolsa1?.monto || 0).toLocaleString('es-AR')} ARS)`
    );

    const agentRows = (metrics.byAgentList || []).map(ag => [
        cleanText(ag.name),
        Number(ag.count || 0).toLocaleString('es-AR'),
        Number(ag.conversationsCount || 0).toLocaleString('es-AR'),
        Number(ag.resolvedCount || 0).toLocaleString('es-AR'),
        Number(ag.turnosSalus || 0).toLocaleString('es-AR'),
        ag.asistenciaPctSalus ? `${Number(ag.asistenciaPctSalus).toFixed(1)}%` : '—',
        `${ag.avgResponseTimeMin || 0} min`,
        `${ag.slaCumplimientoPct || 100}%`
    ]);

    autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [[
            'Asesora',
            'Mensajes Env.',
            'Conversaciones',
            'Casos Cerrados',
            'Turnos SALUS',
            'Asistencia SALUS',
            '1ra Resp. Prom.',
            'SLA (<=15m)'
        ]],
        body: agentRows,
        theme: 'grid',
        styles: {
            font: 'helvetica',
            fontSize: 7.2,
            cellPadding: 2.2,
            textColor: THEME.darkText,
            lineColor: THEME.border,
            lineWidth: 0.2
        },
        headStyles: {
            fillColor: THEME.navy,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center',
            fontSize: 7.2
        },
        columnStyles: {
            0: { fontStyle: 'bold' },
            1: { halign: 'right', fontStyle: 'bold', textColor: THEME.accent },
            2: { halign: 'right' },
            3: { halign: 'right', fontStyle: 'bold', textColor: THEME.emerald },
            4: { halign: 'right', fontStyle: 'bold' },
            5: { halign: 'right' },
            6: { halign: 'right' },
            7: { halign: 'right', fontStyle: 'bold' }
        }
    });

    y = doc.lastAutoTable.finalY + 5;

    // 6. TRIAGE CLÍNICO Y MOTIVOS DE CIERRE (Lado a lado en tabla compacta)
    y = drawSectionTitle(
        doc,
        y,
        '6',
        'Tipologia de Consultas (Triage Clinico) y Motivos de Finalizacion',
        'Distribucion porcentual de requerimientos medicos y resoluciones operativas del periodo'
    );

    const maxRows = Math.max((inquiryBreakdown || []).length, (motivosCatalogo || []).length);
    const combinedTriageRows = [];
    const totalClosed = Math.max(metrics.closedConversationsCount || 1, 1);

    for (let i = 0; i < maxRows; i++) {
        const inq = inquiryBreakdown[i];
        const mot = motivosCatalogo[i];
        const motCount = mot ? (metrics.byResolutionReason?.[mot.key] || 0) : 0;
        const motPct = mot && metrics.closedConversationsCount > 0 ? Math.round((motCount / totalClosed) * 100) : 0;

        combinedTriageRows.push([
            inq ? cleanText(inq.label) : '—',
            inq ? `${Number(inq.count || 0).toLocaleString('es-AR')} (${inq.pct || 0}%)` : '—',
            mot ? cleanText(mot.label) : '—',
            mot ? `${Number(motCount).toLocaleString('es-AR')} (${motPct}%)` : '—'
        ]);
    }

    autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [[
            'Tipo de Consulta (Triage Clinico)',
            'Volumen (%)',
            'Motivo de Finalizacion de Conversacion',
            'Casos (%)'
        ]],
        body: combinedTriageRows,
        theme: 'grid',
        styles: {
            font: 'helvetica',
            fontSize: 6.9,
            cellPadding: 1.9,
            textColor: THEME.darkText,
            lineColor: THEME.border,
            lineWidth: 0.2
        },
        headStyles: {
            fillColor: THEME.navyDark,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 7
        },
        columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 58 },
            1: { halign: 'right', cellWidth: 28 },
            2: { fontStyle: 'bold', cellWidth: 72 },
            3: { halign: 'right', cellWidth: 28 }
        }
    });

    // ─── PIE DE PÁGINA EN TODAS LAS HOJAS ───
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setDrawColor(...THEME.border);
        doc.setLineWidth(0.3);
        doc.line(margin, pageH - 11, pageW - margin, pageH - 11);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(...THEME.mutedText);
        doc.text(
            cleanText(`Sanatorio Argentino · Sistema ADM-QUI · Reporte Mensual Ejecutivo Contact Center (${periodLabel})`),
            margin,
            pageH - 6.8
        );
        doc.setFont('helvetica', 'bold');
        doc.text(`Pagina ${p} de ${totalPages}`, pageW - margin, pageH - 6.8, { align: 'right' });
    }

    const safeMonth = cleanText(selectedMonth || periodLabel).replace(/\s+/g, '_');
    doc.save(`Reporte_Mensual_Contact_Center_${safeMonth}.pdf`);
}

