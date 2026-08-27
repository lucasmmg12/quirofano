/**
 * instrumentadoresPdf.js
 * Generador de PDFs oficiales de Liquidación de Instrumentadores Quirúrgicos — Sanatorio Argentino
 * Estética idéntica a la Constancia de Asociaciones (Navy Blue #0D3B66, Accent Blue #3B82F6, Info Bar y Grid Tables).
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from './guardiaLiquidacionPdf.js';

/**
 * Carga el logo y lo recorta de forma circular con un canvas
 */
async function loadCircularLogoBase64() {
    try {
        const logoImg = new Image();
        logoImg.crossOrigin = 'anonymous';
        logoImg.src = '/logosanatorio.png';
        await new Promise((resolve, reject) => {
            logoImg.onload = resolve;
            logoImg.onerror = reject;
        });

        const canvasSize = 200;
        const canvas = document.createElement('canvas');
        canvas.width = canvasSize;
        canvas.height = canvasSize;
        const ctx = canvas.getContext('2d');
        ctx.beginPath();
        ctx.arc(canvasSize / 2, canvasSize / 2, canvasSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(logoImg, 0, 0, canvasSize, canvasSize);
        return canvas.toDataURL('image/png');
    } catch {
        return null;
    }
}

/**
 * Dibuja el Header oficial tipo Asociaciones (Landscape)
 */
function drawInstitutionalHeaderLandscape(doc, titleRight, subtitleRight = 'Sistema ADM-QUI', logoCircleBase64) {
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;

    // ── Barra Azul Institucional (#0D3B66) ──
    doc.setFillColor(13, 59, 102);
    doc.rect(0, 0, pageW, 30, 'F');

    // ── Logo Circular con anillo blanco ──
    const logoX = margin + 1;
    const logoY = 8;
    const logoSize = 13;

    if (logoCircleBase64) {
        doc.setFillColor(255, 255, 255);
        doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 1.2, 'F');
        doc.addImage(logoCircleBase64, 'PNG', logoX, logoY, logoSize, logoSize);
    } else {
        doc.setFillColor(255, 255, 255);
        doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 'F');
        doc.setFontSize(6);
        doc.setTextColor(13, 59, 102);
        doc.text('SA', logoX + 3.5, logoY + logoSize / 2 + 1.5);
    }

    // ── Título y Subtítulo Izquierdo ──
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('SANATORIO ARGENTINO', margin + 17, 13);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 200, 220);
    doc.text('Administración Quirófano · Instrumentadores Quirúrgicos', margin + 17, 19.5);

    // ── Badge Derecho ──
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(titleRight, pageW - margin, 13, { align: 'right' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 200, 220);
    doc.text(subtitleRight, pageW - margin, 19.5, { align: 'right' });

    // ── Línea de Acento (#3B82F6) ──
    doc.setFillColor(59, 130, 246);
    doc.rect(0, 30, pageW, 2, 'F');
}

/**
 * Agrega el pie de página institucional en todas las páginas (Landscape)
 */
function applyFootersLandscape(doc) {
    const totalPages = doc.internal.getNumberOfPages();
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;

    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        // Línea divisoria
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.line(margin, pageH - 10, pageW - margin, pageH - 10);

        // Texto pie
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);
        doc.text('Sanatorio Argentino SRL · Quirófano Central · Sistema ADM-QUI', margin, pageH - 5.5);
        doc.text(`Página ${p} de ${totalPages}`, pageW - margin, pageH - 5.5, { align: 'right' });
    }
}

/**
 * Genera el PDF Individual de un Instrumentador Quirúrgico (Landscape)
 */
export async function generateInstrumentadorIndividualPdf(inst) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;
    const colW = pageW - margin * 2;

    const logoCircle = await loadCircularLogoBase64();

    // 1. Header institucional
    drawInstitutionalHeaderLandscape(doc, 'LIQUIDACIÓN DE INSTRUMENTACIÓN', `Período: ${inst.periodo || 'Mayo 2026'}`, logoCircle);

    let y = 38;

    // 2. Info Bar (Metadata del profesional)
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, y, colW, 16, 3, 3, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, colW, 16, 3, 3, 'S');

    const infoItems = [
        { label: 'INSTRUMENTADOR/A', value: inst.nombre },
        { label: 'MATRÍCULA', value: inst.matricula || '—' },
        { label: 'PERÍODO', value: inst.periodo || 'Mayo 2026' },
        { label: 'LIQUIDACIÓN', value: `N° ${inst.liquidacion || '410'}` },
    ];

    const cellW = colW / 4;
    infoItems.forEach((item, i) => {
        const x = margin + cellW * i + 6;
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);
        doc.text(item.label, x, y + 5);
        doc.setFontSize(i === 0 ? 8.5 : 9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(13, 59, 102);
        const valText = i === 0 && item.value.length > 25 ? item.value.substring(0, 25) + '...' : (item.value || '—');
        doc.text(valText, x, y + 11.5);
    });

    y += 22;

    // 3. Título de sección con acento vertical azul
    doc.setFillColor(59, 130, 246);
    doc.rect(margin, y, 3, 7, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(13, 59, 102);
    doc.text('DETALLE DE PROCEDIMIENTOS QUIRÚRGICOS LIQUIDADOS', margin + 6, y + 5.5);
    y += 10;

    // 4. Tabla de procedimientos
    const tableBody = inst.procedimientos.map((p, idx) => [
        String(idx + 1),
        p.fecha,
        p.paciente,
        p.procedimiento,
        p.observacion || '—',
        formatCurrency(p.valor),
        p.cirujano
    ]);

    autoTable(doc, {
        startY: y,
        head: [['#', 'Fecha', 'Paciente', 'Procedimiento Quirúrgico', 'Observación', 'Valor', 'Cirujano']],
        body: tableBody,
        foot: [
            ['', '', '', '', 'Total Liquidado:', formatCurrency(inst.totalValor), '']
        ],
        theme: 'grid',
        headStyles: {
            fillColor: [13, 59, 102],
            textColor: [255, 255, 255],
            fontSize: 7.5,
            fontStyle: 'bold',
            halign: 'left',
            cellPadding: 2.8,
        },
        bodyStyles: {
            fontSize: 7,
            cellPadding: 2.2,
            textColor: [30, 30, 30],
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252],
        },
        footStyles: {
            fillColor: [220, 238, 255],
            textColor: [13, 59, 102],
            fontSize: 8.5,
            fontStyle: 'bold',
            halign: 'right'
        },
        columnStyles: {
            0: { cellWidth: 8, halign: 'center', fontStyle: 'bold', textColor: [148, 163, 184] },
            1: { cellWidth: 20, halign: 'left' },
            2: { cellWidth: 54, halign: 'left', fontStyle: 'bold' },
            3: { cellWidth: 84, halign: 'left' },
            4: { cellWidth: 32, halign: 'left', textColor: [124, 58, 237] },
            5: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
            6: { cellWidth: 45, halign: 'left' }
        },
        margin: { left: margin, right: margin },
        didDrawPage: (data) => {
            if (data.pageNumber > 1) {
                doc.setFillColor(13, 59, 102);
                doc.rect(0, 0, pageW, 7, 'F');
                doc.setFillColor(59, 130, 246);
                doc.rect(0, 7, pageW, 1, 'F');
            }
        }
    });

    applyFootersLandscape(doc);
    return doc;
}

/**
 * Genera el PDF General Consolidado de Instrumentadores Quirúrgicos (Landscape)
 */
export async function generateInstrumentadoresGeneralPdf(data) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;
    const colW = pageW - margin * 2;

    const logoCircle = await loadCircularLogoBase64();

    // 1. Header institucional
    drawInstitutionalHeaderLandscape(doc, 'INFORME CONSOLIDADO', 'Liquidación General Instrumentación', logoCircle);

    let y = 38;

    // 2. Info Bar Resumen
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, y, colW, 16, 3, 3, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, colW, 16, 3, 3, 'S');

    const infoItems = [
        { label: 'PERÍODO', value: data.periodo || 'Mayo 2026' },
        { label: 'N° LIQUIDACIÓN', value: `N° ${data.liquidacion || '410'}` },
        { label: 'TOTAL INSTRUMENTADORES', value: String(data.totalInstrumentadores) },
        { label: 'TOTAL CIRUGÍAS / PROCED.', value: String(data.totalProcedimientosGlobal) },
    ];

    const cellW = colW / 4;
    infoItems.forEach((item, i) => {
        const x = margin + cellW * i + 6;
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);
        doc.text(item.label, x, y + 5);
        doc.setFontSize(i >= 2 ? 11 : 9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(13, 59, 102);
        doc.text(item.value || '—', x, y + 11.5);
    });

    y += 22;

    // 3. Título de sección con acento
    doc.setFillColor(59, 130, 246);
    doc.rect(margin, y, 3, 7, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(13, 59, 102);
    doc.text('RESUMEN DE LIQUIDACIÓN POR INSTRUMENTADOR/A', margin + 6, y + 5.5);
    y += 10;

    // 4. Tabla Consolidada
    const tableBody = data.instrumentadores.map((inst, i) => [
        String(i + 1),
        inst.nombre,
        inst.matricula || '—',
        String(inst.procedimientos.length),
        formatCurrency(inst.totalValor)
    ]);

    autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [
            ['#', 'Instrumentador / Profesional', 'Matrícula', 'Cant. Procedimientos', 'Total Liquidado']
        ],
        body: tableBody,
        foot: [
            [
                '',
                'TOTAL GENERAL CONSOLIDADO',
                '',
                String(data.totalProcedimientosGlobal),
                formatCurrency(data.totalFacturadoGlobal)
            ]
        ],
        theme: 'grid',
        headStyles: {
            fontSize: 7.8,
            fontStyle: 'bold',
            fillColor: [13, 59, 102],
            textColor: [255, 255, 255],
            halign: 'center',
            cellPadding: 3
        },
        bodyStyles: {
            fontSize: 7.5,
            textColor: [30, 30, 30],
            cellPadding: 2.5
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252]
        },
        footStyles: {
            fontSize: 8.5,
            fontStyle: 'bold',
            fillColor: [220, 238, 255],
            textColor: [13, 59, 102]
        },
        columnStyles: {
            0: { cellWidth: 10, halign: 'center', fontStyle: 'bold', textColor: [148, 163, 184] },
            1: { cellWidth: 110, halign: 'left', fontStyle: 'bold' },
            2: { cellWidth: 35, halign: 'center' },
            3: { cellWidth: 44, halign: 'center', fontStyle: 'bold' },
            4: { cellWidth: 70, halign: 'right', fontStyle: 'bold' }
        },
        didDrawPage: (data) => {
            if (data.pageNumber > 1) {
                doc.setFillColor(13, 59, 102);
                doc.rect(0, 0, pageW, 7, 'F');
                doc.setFillColor(59, 130, 246);
                doc.rect(0, 7, pageW, 1, 'F');
            }
        }
    });

    applyFootersLandscape(doc);
    return doc;
}
