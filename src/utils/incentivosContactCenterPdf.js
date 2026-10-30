import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { installSafePdfText, sanitizePdfText } from './gobernanzaServiceProjectPdf';
import { SANATORIO_LOGO_BASE64 } from './sanatorioLogoBase64';
import { BASE_GARANTIZADA_HISTORICA, TECHO_MAXIMO_TOTAL } from '../services/incentivoContactCenterService';

const formatCurrency = (val) => {
    return '$ ' + Math.round(Number(val || 0)).toLocaleString('es-AR');
};

/**
 * Genera y descarga el PDF Oficial de Liquidación de Incentivos y Productividad del Contact Center
 * incluyendo la tabla nominal para RRHH y los gráficos comparativos de cada agente con su demanda y objetivos.
 */
export function exportIncentivosContactCenterPdf({
    periodo = '2026-10',
    periodLabel = 'Octubre 2026',
    liquidacion,
    isCurrentMonth = false,
    currentDay = 30,
    totalDaysInMonth = 31,
    modoProyeccion = false
}) {
    if (!liquidacion) return;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    installSafePdfText(doc);

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;
    const contentWidth = pageWidth - margin * 2;
    let y = 10;

    // 1. ENCABEZADO INSTITUCIONAL
    doc.setFillColor(0, 59, 113); // #003B71
    doc.rect(0, 0, pageWidth, 26, 'F');

    try {
        if (SANATORIO_LOGO_BASE64) {
            doc.addImage(SANATORIO_LOGO_BASE64, 'PNG', margin, 4, 18, 18);
        }
    } catch (_) {}

    const titleX = SANATORIO_LOGO_BASE64 ? margin + 22 : margin;
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('SANATORIO ARGENTINO', titleX, 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('Innovacion, Transformacion Digital & Recursos Humanos - Esquema Oficial v13', titleX, 15.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('CERTIFICACION DE PRODUCTIVIDAD Y LIQUIDACION DE INCENTIVOS - CONTACT CENTER', titleX, 21);

    const nowStr = new Date().toLocaleDateString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(`Periodo: ${periodLabel} (${periodo})`, pageWidth - margin, 10, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(
        isCurrentMonth
            ? (modoProyeccion ? `Proyeccion al cierre (${totalDaysInMonth} dias)` : `Corte acumulado al dia ${currentDay} de ${totalDaysInMonth}`)
            : 'Periodo Cerrado y Auditado',
        pageWidth - margin,
        15.5,
        { align: 'right' }
    );
    doc.text(`Emitido: ${nowStr}`, pageWidth - margin, 21, { align: 'right' });

    y = 31;

    // 2. INTRODUCCIÓN Y RESUMEN EJECUTIVO DE BOLSAS
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(margin, y, contentWidth, 15, 2, 2, 'FD');

    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    const introText = `Se eleva a la Direccion de Recursos Humanos (Carolina Balaguer / Lic. Sergio Femenia) la certificacion de productividad del Contact Center para ${periodLabel} (${periodo}). Todas las operadoras activas perciben el 100% del Piso Historico Garantizado (${formatCurrency(BASE_GARANTIZADA_HISTORICA)}) y el 100% del valor de cada escalon alcanzado (Techo: ${formatCurrency(TECHO_MAXIMO_TOTAL)}). En el caso de Erica Leal (Curva de Aprendizaje), cobra el 100% de todas las bolsas con una demanda exigida del 50% respecto al objetivo individual del resto del equipo.`;
    const splitIntro = doc.splitTextToSize(introText, contentWidth - 6);
    doc.text(splitIntro, margin + 3, y + 4.5);

    y += 18;

    // 3 TARJETAS KPI RESUMEN
    const kpiW = (contentWidth - 6) / 3;
    const kpis = [
        {
            title: 'BOLSA 1: CONVERSACIONES (50%)',
            value: `${Number(liquidacion.bolsaMensajes?.total || 0).toLocaleString('es-AR')} convs`,
            sub: `Escalon ${liquidacion.bolsaMensajes?.escalon || 0}/10 (+${formatCurrency(liquidacion.bolsaMensajes?.montoPorFte || 0)}/ag.) | Meta: 7.500`,
            bg: [240, 249, 255],
            border: [186, 230, 253],
            color: [2, 132, 199]
        },
        {
            title: 'BOLSA 2: TURNOS SALUS (25%)',
            value: `${Number(liquidacion.bolsaTurnos?.total || 0).toLocaleString('es-AR')} turnos eq.`,
            sub: `Meta Indiv. 100%: 922 (Piso 763) | Exig. 50%: 461 (Piso 382)`,
            bg: [250, 245, 255],
            border: [233, 213, 255],
            color: [124, 58, 237]
        },
        {
            title: 'LIQUIDACION TOTAL EQUIPO',
            value: formatCurrency(liquidacion.totalesEquipo?.liquidacionTotal || 0),
            sub: `Base: ${formatCurrency(liquidacion.totalesEquipo?.baseTotal || 0)} | Variable: +${formatCurrency(liquidacion.totalesEquipo?.variableTotal || 0)}`,
            bg: [236, 253, 245],
            border: [167, 243, 208],
            color: [5, 150, 105]
        }
    ];

    kpis.forEach((k, idx) => {
        const kx = margin + idx * (kpiW + 3);
        doc.setFillColor(...k.bg);
        doc.setDrawColor(...k.border);
        doc.roundedRect(kx, y, kpiW, 14, 2, 2, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(...k.color);
        doc.text(k.title, kx + 3, y + 4);

        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text(k.value, kx + 3, y + 9);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.2);
        doc.setTextColor(71, 85, 105);
        doc.text(k.sub, kx + 3, y + 12.6);
    });

    y += 17;

    // 3. TABLA OFICIAL DE LIQUIDACIÓN NOMINAL
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 41, 66);
    doc.text('1. Tabla de Liquidacion Nominal y Cumplimiento por Colaboradora', margin, y);
    y += 2;

    const agentes = liquidacion.agentes || [];
    const tableBody = agentes.map((ag) => {
        const fDemanda = ag.factorDemanda || 1.0;
        const pisoIndiv = Math.round(763 * fDemanda);
        const metaIndiv = Math.round(922 * fDemanda);
        const topeIndiv = Math.round(1081 * fDemanda);
        const cobroPct = `${Math.round((ag.fte || 1) * 100)}%`;
        const demandaPct = `${Math.round(fDemanda * 100)}%`;

        return [
            ag.name,
            `Cobro ${cobroPct}\nDemanda ${demandaPct}`,
            formatCurrency(ag.baseGarantizadaLiquidada),
            `+${formatCurrency(ag.montoMensajes)}\n(Esc. ${liquidacion.bolsaMensajes?.escalon || 0}/10)`,
            `${Number(ag.turnos || 0).toLocaleString('es-AR')} turnos\nMeta: ${metaIndiv} (Tope ${topeIndiv})`,
            `+${formatCurrency(ag.montoTurnos)}\n(Esc. ${ag.escalonTurnos ?? 0}/10)`,
            `${ag.asistenciaPct}%\n(${ag.asistidas || 0}/${ag.evaluables || 0} citas)`,
            `+${formatCurrency(ag.montoAsistencia)}\n(Esc. ${ag.escalonAsistencia ?? 10}/10)`,
            formatCurrency(ag.totalALiquidar)
        ];
    });

    tableBody.push([
        'TOTAL EQUIPO',
        `${agentes.length} operadoras`,
        formatCurrency(liquidacion.totalesEquipo?.baseTotal || 0),
        '',
        `${Number(liquidacion.bolsaTurnos?.total || 0).toLocaleString('es-AR')} turnos`,
        '',
        'Meta >= 55%',
        `Var. Total: +${formatCurrency(liquidacion.totalesEquipo?.variableTotal || 0)}`,
        formatCurrency(liquidacion.totalesEquipo?.liquidacionTotal || 0)
    ]);

    autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [[
            'Colaboradora',
            'Escala / Exigencia',
            'Piso Garant.',
            '+ Bolsa Msjs (50%)',
            'Turnos vs Demanda',
            '+ Bolsa Turnos (25%)',
            'Asistencia %',
            '+ Bolsa Asist. (25%)',
            'Total a Transferir'
        ]],
        body: tableBody.map(row => row.map(sanitizePdfText)),
        theme: 'grid',
        styles: {
            font: 'helvetica',
            fontSize: 7.0,
            cellPadding: 2.0,
            textColor: [30, 41, 59],
            lineColor: [226, 232, 240],
            lineWidth: 0.2,
            valign: 'middle'
        },
        headStyles: {
            fillColor: [0, 59, 113],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 7.0,
            halign: 'center'
        },
        columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 27 },
            1: { halign: 'center', cellWidth: 22 },
            2: { halign: 'right', cellWidth: 19 },
            3: { halign: 'right', cellWidth: 21 },
            4: { halign: 'center', cellWidth: 25 },
            5: { halign: 'right', cellWidth: 21 },
            6: { halign: 'center', cellWidth: 18 },
            7: { halign: 'right', cellWidth: 20 },
            8: { halign: 'right', fontStyle: 'bold', textColor: [0, 59, 113], cellWidth: 23 }
        },
        didParseCell: (data) => {
            if (data.section === 'body' && data.row.index === tableBody.length - 1) {
                data.cell.styles.fillColor = [241, 245, 249];
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.textColor = [15, 23, 42];
            }
        }
    });

    y = (doc.lastAutoTable?.finalY || y + 45) + 6;

    // 4. GRÁFICO VISUAL 1: TURNOS OTORGADOS POR AGENTE VS. SU DEMANDA Y OBJETIVOS (PISO / META / TOPE)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 41, 66);
    doc.text('2. Grafico de Cumplimiento de Turnos por Agente vs. Demanda Exigida (Piso / Meta / Tope)', margin, y);
    y += 3.5;

    const chart1RowH = 14.5;
    const chart1H = agentes.length * chart1RowH + 10;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(margin, y, contentWidth, chart1H, 2, 2, 'FD');

    // Leyenda de referencias del Gráfico 1
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
        'Cada barra compara los Turnos Reales de la operadora contra su Piso (Esc. 1), su Meta (Esc. 5) y su Tope (Esc. 10) segun su % de Demanda Exigida.',
        margin + 3,
        y + 4.5
    );

    const barAreaX = margin + 48;
    const barAreaW = contentWidth - 88;

    agentes.forEach((ag, idx) => {
        const rowY = y + 8 + idx * chart1RowH;
        const fDemanda = ag.factorDemanda || 1.0;
        const pisoIndiv = Math.round(763 * fDemanda);
        const metaIndiv = Math.round(922 * fDemanda);
        const topeIndiv = Math.round(1081 * fDemanda);
        const turnosVal = Number(ag.turnos || 0);
        const maxScale = Math.max(topeIndiv * 1.25, turnosVal * 1.08, 1);

        // Nombre y demanda
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(15, 23, 42);
        doc.text(ag.name, margin + 3, rowY + 3.5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.2);
        doc.setTextColor(100, 116, 139);
        doc.text(`Demanda ${Math.round(fDemanda * 100)}% | Cobro ${Math.round((ag.fte || 1) * 100)}%`, margin + 3, rowY + 7.2);
        doc.text(`Piso ${pisoIndiv} | Meta ${metaIndiv} | Tope ${topeIndiv}`, margin + 3, rowY + 10.5);

        // Fondo de pista de la barra
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(barAreaX, rowY + 2, barAreaW, 5.5, 1.5, 1.5, 'F');

        // Ancho de la barra real
        const fillW = Math.min(barAreaW, Math.max(2, (turnosVal / maxScale) * barAreaW));
        if (turnosVal >= topeIndiv) {
            doc.setFillColor(5, 150, 105); // Verde Tope alcanzado
        } else if (turnosVal >= metaIndiv) {
            doc.setFillColor(2, 132, 199); // Azul Meta superada
        } else if (turnosVal >= pisoIndiv) {
            doc.setFillColor(124, 58, 237); // Violeta sobre piso
        } else {
            doc.setFillColor(217, 119, 6); // Ámbar en curso
        }
        doc.roundedRect(barAreaX, rowY + 2, fillW, 5.5, 1.5, 1.5, 'F');

        // Marcadores verticales de Piso, Meta y Tope específicos de la agente
        const xPiso = barAreaX + (pisoIndiv / maxScale) * barAreaW;
        const xMeta = barAreaX + (metaIndiv / maxScale) * barAreaW;
        const xTope = barAreaX + (topeIndiv / maxScale) * barAreaW;

        // Línea Piso (Ámbar)
        doc.setDrawColor(217, 119, 6);
        doc.setLineWidth(0.35);
        doc.line(xPiso, rowY + 1, xPiso, rowY + 8.5);

        // Línea Meta (Azul)
        doc.setDrawColor(2, 132, 199);
        doc.setLineWidth(0.45);
        doc.line(xMeta, rowY + 1, xMeta, rowY + 8.5);

        // Línea Tope (Verde oscuro)
        doc.setDrawColor(5, 150, 105);
        doc.setLineWidth(0.45);
        doc.line(xTope, rowY + 1, xTope, rowY + 8.5);

        // Etiquetas diminutas debajo de los marcadores
        doc.setFontSize(5.5);
        doc.setTextColor(180, 83, 9);
        doc.text(`P:${pisoIndiv}`, xPiso, rowY + 11.2, { align: 'center' });
        doc.setTextColor(3, 105, 161);
        doc.text(`M:${metaIndiv}`, xMeta, rowY + 11.2, { align: 'center' });
        doc.setTextColor(4, 120, 87);
        doc.text(`T:${topeIndiv}`, xTope, rowY + 11.2, { align: 'center' });

        // Valor a la derecha de la barra
        const pctMeta = Math.round((turnosVal / metaIndiv) * 100);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(15, 23, 42);
        doc.text(`${turnosVal.toLocaleString('es-AR')} turnos (${pctMeta}% s/Meta)`, barAreaX + barAreaW + 3, rowY + 4.5);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(turnosVal >= topeIndiv ? 5 : 124, turnosVal >= topeIndiv ? 150 : 58, turnosVal >= topeIndiv ? 105 : 237);
        doc.text(`Escalon ${ag.escalonTurnos ?? 0}/10 -> +${formatCurrency(ag.montoTurnos)}`, barAreaX + barAreaW + 3, rowY + 8.5);
    });

    y += chart1H + 5;

    // 5. GRÁFICO VISUAL 2: ASISTENCIA EFECTIVA (%) Y COMPOSICIÓN DE HABERES POR AGENTE
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 41, 66);
    doc.text('3. Grafico de Asistencia Efectiva a Citas (%) y Composicion Salarial por Agente', margin, y);
    y += 3.5;

    const chart2RowH = 11.5;
    const chart2H = agentes.length * chart2RowH + 8;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(margin, y, contentWidth, chart2H, 2, 2, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.3);
    doc.setTextColor(100, 116, 139);
    doc.text(
        'Izquierda: Tasa de Asistencia Efectiva frente a Piso (50%), Meta (55%) y Tope (>=60%). Derecha: Composicion del Total Liquidado (Base + 3 Bolsas).',
        margin + 3,
        y + 4.2
    );

    const halfW = (contentWidth - 10) / 2;
    const asistBarX = margin + 34;
    const asistBarW = halfW - 56;
    const compBarX = margin + halfW + 8;
    const compBarW = halfW - 44;

    agentes.forEach((ag, idx) => {
        const rowY = y + 7 + idx * chart2RowH;
        const asistPct = Number(ag.asistenciaPct || 0);

        // Columna izquierda: Asistencia %
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(15, 23, 42);
        doc.text(ag.name.split(' ')[0], margin + 3, rowY + 4);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(100, 116, 139);
        doc.text(`${ag.asistidas || 0}/${ag.evaluables || 0} citas`, margin + 3, rowY + 7.2);

        // Barra Asistencia (escala 0 a 100%)
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(asistBarX, rowY + 2, asistBarW, 4.5, 1, 1, 'F');
        const fillAsist = Math.min(asistBarW, Math.max(1, (asistPct / 100) * asistBarW));
        doc.setFillColor(5, 150, 105);
        doc.roundedRect(asistBarX, rowY + 2, fillAsist, 4.5, 1, 1, 'F');

        // Marcas 50%, 55%, 60%
        [50, 55, 60].forEach((mPct) => {
            const mx = asistBarX + (mPct / 100) * asistBarW;
            doc.setDrawColor(15, 23, 42);
            doc.setLineWidth(0.25);
            doc.line(mx, rowY + 1.3, mx, rowY + 7.2);
        });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(5, 150, 105);
        doc.text(`${asistPct}% (Tope)`, asistBarX + asistBarW + 2, rowY + 5);

        // Columna derecha: Barra apilada de Composición Salarial (Piso + Msjs + Turnos + Asistencia)
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(compBarX, rowY + 2, compBarW, 4.5, 1, 1, 'F');

        const wBase = (ag.baseGarantizadaLiquidada / TECHO_MAXIMO_TOTAL) * compBarW;
        const wMsjs = (ag.montoMensajes / TECHO_MAXIMO_TOTAL) * compBarW;
        const wTurnos = (ag.montoTurnos / TECHO_MAXIMO_TOTAL) * compBarW;
        const wAsist = (ag.montoAsistencia / TECHO_MAXIMO_TOTAL) * compBarW;

        let curX = compBarX;
        // Segmento Piso (Gris Azulado)
        doc.setFillColor(100, 116, 139);
        doc.rect(curX, rowY + 2, wBase, 4.5, 'F');
        curX += wBase;
        // Segmento Mensajes (Azul)
        if (wMsjs > 0) {
            doc.setFillColor(2, 132, 199);
            doc.rect(curX, rowY + 2, wMsjs, 4.5, 'F');
            curX += wMsjs;
        }
        // Segmento Turnos (Violeta)
        if (wTurnos > 0) {
            doc.setFillColor(124, 58, 237);
            doc.rect(curX, rowY + 2, wTurnos, 4.5, 'F');
            curX += wTurnos;
        }
        // Segmento Asistencia (Verde)
        if (wAsist > 0) {
            doc.setFillColor(5, 150, 105);
            doc.rect(curX, rowY + 2, wAsist, 4.5, 'F');
        }

        const pctTecho = Math.round((ag.totalALiquidar / TECHO_MAXIMO_TOTAL) * 100);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(0, 59, 113);
        doc.text(`${formatCurrency(ag.totalALiquidar)} (${pctTecho}%)`, compBarX + compBarW + 2, rowY + 5);
    });

    y += chart2H + 10;

    // 6. FIRMAS DE VALIDACIÓN
    if (y + 18 > pageHeight - 10) {
        doc.addPage();
        y = 25;
    }

    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.3);
    const sig1X = margin + 42;
    const sig2X = pageWidth - margin - 42;

    doc.line(sig1X - 30, y + 8, sig1X + 30, y + 8);
    doc.line(sig2X - 30, y + 8, sig2X + 30, y + 8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 41, 66);
    doc.text('Lucas Marinero', sig1X, y + 12.5, { align: 'center' });
    doc.text('Carolina Balaguer / Lic. Sergio Femenia', sig2X, y + 12.5, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text('Innovacion y Transformacion Digital', sig1X, y + 16, { align: 'center' });
    doc.text('Recursos Humanos & Liquidacion de Haberes', sig2X, y + 16, { align: 'center' });

    const safePeriod = String(periodo || 'periodo').replace(/[^a-zA-Z0-9_-]/g, '_');
    doc.save(`Reporte_RRHH_Incentivos_ContactCenter_${safePeriod}.pdf`);
}

