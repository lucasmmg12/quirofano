/**
 * guardiaLiquidacionPdf.js
 * Generador de PDFs oficiales de Liquidación de Guardia Pediátrica — Sanatorio Argentino
 * Estética idéntica a la Constancia de Asociaciones (Navy Blue #0D3B66, Accent Blue #3B82F6, Info Bar y Grid Tables).
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Formato de moneda argentina
export function formatCurrency(amount) {
    const num = Number(amount) || 0;
    return '$ ' + num.toLocaleString('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

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
 * Dibuja el Header oficial tipo Asociaciones
 */
function drawInstitutionalHeader(doc, titleRight, subtitleRight = 'Sistema ADM-QUI', logoCircleBase64) {
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;

    // ── Barra Azul Institucional (#0D3B66) ──
    doc.setFillColor(13, 59, 102);
    doc.rect(0, 0, pageW, 34, 'F');

    // ── Logo Circular con anillo blanco ──
    const logoX = margin + 1;
    const logoY = 10;
    const logoSize = 14;

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
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('SANATORIO ARGENTINO', margin + 18, 14);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 200, 220);
    doc.text('Administración · Guardia Pediátrica', margin + 18, 21);

    // ── Badge Derecho ──
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(titleRight, pageW - margin, 14, { align: 'right' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 200, 220);
    doc.text(subtitleRight, pageW - margin, 21, { align: 'right' });

    // ── Línea de Acento (#3B82F6) ──
    doc.setFillColor(59, 130, 246);
    doc.rect(0, 34, pageW, 2, 'F');
}

/**
 * Agrega el pie de página institucional en todas las páginas
 */
function applyFooters(doc) {
    const totalPages = doc.internal.getNumberOfPages();
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;

    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.line(margin, pageH - 12, pageW - margin, pageH - 12);

        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);
        doc.text('Sanatorio Argentino SRL · San Juan, Argentina · Sistema ADM-QUI', margin, pageH - 7);
        doc.text(`Página ${p} de ${totalPages}`, pageW - margin, pageH - 7, { align: 'right' });
    }
}

/**
 * Genera el PDF Individual de un Médico de Guardia Pediátrica
 */
export async function generateGuardiaIndividualPdf(prestador, options = {}) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;
    const colW = pageW - margin * 2;

    const logoCircle = await loadCircularLogoBase64();

    // 1. Header institucional
    drawInstitutionalHeader(doc, 'LIQUIDACIÓN DE GUARDIA', `Período: ${prestador.periodo || 'Mayo 2026'}`, logoCircle);

    let y = 44;

    // 2. Info Bar (Metadata del profesional)
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, y, colW, 18, 3, 3, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, colW, 18, 3, 3, 'S');

    const infoItems = [
        { label: 'PROFESIONAL', value: prestador.nombre },
        { label: 'MATRÍCULA', value: prestador.matricula || '—' },
        { label: 'PERÍODO', value: prestador.periodo || 'Mayo 2026' },
        { label: 'LIQUIDACIÓN', value: `N° ${prestador.liquidacion || '410'}` },
    ];

    const cellW = colW / 4;
    infoItems.forEach((item, i) => {
        const x = margin + cellW * i + 5;
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);
        doc.text(item.label, x, y + 6);
        
        doc.setFontSize(i === 0 ? 8 : 9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(13, 59, 102);
        const valText = i === 0 && item.value.length > 22 ? item.value.substring(0, 22) + '...' : (item.value || '—');
        doc.text(valText, x, y + 13);
    });

    y += 26;

    // 3. Título de sección con acento vertical azul
    doc.setFillColor(59, 130, 246);
    doc.rect(margin, y, 3, 7, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(13, 59, 102);
    doc.text('DETALLE DE ATENCIONES DE GUARDIA PEDIÁTRICA', margin + 6, y + 5.5);
    y += 11;

    // 4. Tabla de atenciones con estilo Grid
    const tableBody = prestador.atenciones.map((a, idx) => [
        String(idx + 1),
        a.fecha,
        a.paciente,
        a.obraSocial,
        formatCurrency(a.importe)
    ]);

    const pct = prestador.porcentajeHonorarios || 70;
    const subtotalBruto = prestador.totalImporteBruto || prestador.totalImporte || 0;
    const honorariosNeto = prestador.totalHonorariosNeto || (subtotalBruto * (pct / 100));

    autoTable(doc, {
        startY: y,
        head: [['#', 'Fecha', 'Paciente', 'Obra Social', 'Importe']],
        body: tableBody,
        foot: [
            ['', '', '', `Subtotal Facturado (100%):`, formatCurrency(subtotalBruto)]
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
            fontSize: 7.2,
            cellPadding: 2.2,
            textColor: [30, 30, 30],
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252],
        },
        footStyles: {
            fillColor: [235, 243, 252],
            textColor: [13, 59, 102],
            fontSize: 8,
            fontStyle: 'bold',
            halign: 'right'
        },
        columnStyles: {
            0: { cellWidth: 8, halign: 'center', fontStyle: 'bold', textColor: [148, 163, 184] },
            1: { cellWidth: 22, halign: 'left' },
            2: { cellWidth: 68, halign: 'left', fontStyle: 'bold' },
            3: { cellWidth: 56, halign: 'left' },
            4: { cellWidth: 28, halign: 'right' }
        },
        margin: { left: margin, right: margin },
        didDrawPage: (data) => {
            if (data.pageNumber > 1) {
                doc.setFillColor(13, 59, 102);
                doc.rect(0, 0, pageW, 8, 'F');
                doc.setFillColor(59, 130, 246);
                doc.rect(0, 8, pageW, 1, 'F');
            }
        }
    });

    let finalY = doc.lastAutoTable.finalY + 6;

    // Verificar salto de página para bloque de adicionales y totales
    if (finalY + 65 > pageH - 20) {
        doc.addPage();
        finalY = 20;
    }

    // 5. Cuadro de Liquidación Final y Adicionales
    const valorAdicional = options.valorAdicional !== undefined ? options.valorAdicional : (prestador.valorAdicional || 8000);
    const obrasSociales = options.obrasSocialesAdicional || prestador.obrasSocialesAdicional || ['001 - PROVINCIA', '004 - DAMSU'];
    const cantAdic = prestador.totalCantidadAdicional || 0;
    const montoAdic = prestador.totalMontoAdicional !== undefined ? prestador.totalMontoAdicional : (cantAdic * valorAdicional);
    const granTotal = honorariosNeto + montoAdic;

    doc.setFillColor(59, 130, 246);
    doc.rect(margin, finalY, 3, 7, 'F');
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(13, 59, 102);
    doc.text('RESUMEN DE LIQUIDACIÓN Y ADICIONAL DE GUARDIA PEDIÁTRICA', margin + 6, finalY + 5.5);
    finalY += 10;

    autoTable(doc, {
        startY: finalY,
        margin: { left: margin, right: margin },
        head: [['Concepto Liquidado', 'Detalle / Obras Sociales', 'Base / Unitario', 'Cantidad / %', 'Total Liquidado']],
        body: [
            [
                'Honorarios Médicos de Guardia',
                `Subtotal Consultas (${prestador.atenciones.length} atenciones)`,
                formatCurrency(subtotalBruto),
                `${pct}%`,
                formatCurrency(honorariosNeto)
            ],
            [
                'Adicional Guardia Pediátrica',
                obrasSociales.join(' · '),
                formatCurrency(valorAdicional),
                String(cantAdic),
                formatCurrency(montoAdic)
            ]
        ],
        foot: [
            ['', '', '', 'TOTAL GENERAL A LIQUIDAR:', formatCurrency(granTotal)]
        ],
        theme: 'grid',
        headStyles: {
            fillColor: [13, 59, 102],
            textColor: [255, 255, 255],
            fontSize: 7.5,
            fontStyle: 'bold',
            cellPadding: 2.8
        },
        bodyStyles: {
            fontSize: 7.5,
            cellPadding: 2.5,
            textColor: [30, 30, 30]
        },
        footStyles: {
            fillColor: [220, 238, 255],
            textColor: [13, 59, 102],
            fontSize: 8.5,
            fontStyle: 'bold',
            halign: 'right'
        },
        columnStyles: {
            0: { cellWidth: 46, fontStyle: 'bold' },
            1: { cellWidth: 50 },
            2: { cellWidth: 28, halign: 'right' },
            3: { cellWidth: 20, halign: 'center', fontStyle: 'bold', textColor: [124, 58, 237] },
            4: { cellWidth: 38, halign: 'right', fontStyle: 'bold' }
        }
    });

    applyFooters(doc);
    return doc;
}

/**
 * Genera el PDF General Consolidado de Guardia Pediátrica
 */
export async function generateGuardiaGeneralPdf(data, options = {}) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;
    const colW = pageW - margin * 2;

    const logoCircle = await loadCircularLogoBase64();

    // 1. Header institucional
    drawInstitutionalHeader(doc, 'INFORME CONSOLIDADO', 'Liquidación General de Guardia', logoCircle);

    let y = 44;

    // 2. Info Bar Resumen General
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, y, colW, 18, 3, 3, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, colW, 18, 3, 3, 'S');

    const pct = data.porcentajeHonorarios || 70;

    const infoItems = [
        { label: 'PERÍODO', value: data.periodo || 'Mayo 2026' },
        { label: 'N° LIQUIDACIÓN', value: `N° ${data.liquidacion || '410'}` },
        { label: 'TOTAL PROFESIONALES', value: String(data.totalPrestadores) },
        { label: 'TOTAL ATENCIONES', value: String(data.totalAtenciones) },
    ];

    const cellW = colW / 4;
    infoItems.forEach((item, i) => {
        const x = margin + cellW * i + 6;
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);
        doc.text(item.label, x, y + 6);
        doc.setFontSize(i === 2 || i === 3 ? 11 : 9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(13, 59, 102);
        doc.text(item.value || '—', x, y + 13);
    });

    y += 26;

    // 3. Título con acento
    doc.setFillColor(59, 130, 246);
    doc.rect(margin, y, 3, 7, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(13, 59, 102);
    doc.text('RESUMEN DE LIQUIDACIÓN POR PROFESIONAL MÉDICO (70% HONORARIOS + ADICIONAL)', margin + 6, y + 5.5);
    y += 11;

    // 4. Tabla Consolidada
    const tableBody = data.prestadores.map((p, i) => [
        String(i + 1),
        p.nombre,
        p.matricula || '—',
        String(p.atenciones.length),
        formatCurrency(p.totalImporteBruto || p.totalImporte),
        formatCurrency(p.totalHonorariosNeto || (p.totalImporte * (pct / 100))),
        formatCurrency(p.totalMontoAdicional || 0),
        formatCurrency(p.totalGeneralConAdicional)
    ]);

    autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [
            ['#', 'Profesional / Médico', 'Matr.', 'Atenc.', 'Fact. Bruta (100%)', `Honorarios (${pct}%)`, 'Adicional ($)', 'Total Liquidado']
        ],
        body: tableBody,
        foot: [
            [
                '',
                'TOTAL GENERAL CONSOLIDADO',
                '',
                String(data.totalAtenciones),
                formatCurrency(data.totalFacturadoBrutoGlobal || data.totalFacturadoGlobal),
                formatCurrency(data.totalHonorariosNetoGlobal),
                formatCurrency(data.totalAdicionalesGlobal),
                formatCurrency(data.granTotalGlobal)
            ]
        ],
        theme: 'grid',
        headStyles: {
            fontSize: 7,
            fontStyle: 'bold',
            fillColor: [13, 59, 102],
            textColor: [255, 255, 255],
            halign: 'center',
            cellPadding: 2.5
        },
        bodyStyles: {
            fontSize: 6.8,
            textColor: [30, 30, 30],
            cellPadding: 2.2
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252]
        },
        footStyles: {
            fontSize: 7.5,
            fontStyle: 'bold',
            fillColor: [220, 238, 255],
            textColor: [13, 59, 102]
        },
        columnStyles: {
            0: { cellWidth: 7, halign: 'center', fontStyle: 'bold', textColor: [148, 163, 184] },
            1: { cellWidth: 46, halign: 'left', fontStyle: 'bold' },
            2: { cellWidth: 14, halign: 'center' },
            3: { cellWidth: 13, halign: 'center', fontStyle: 'bold' },
            4: { cellWidth: 26, halign: 'right' },
            5: { cellWidth: 26, halign: 'right', fontStyle: 'bold', textColor: [13, 59, 102] },
            6: { cellWidth: 24, halign: 'right', textColor: [124, 58, 237] },
            7: { cellWidth: 26, halign: 'right', fontStyle: 'bold' }
        },
        didDrawPage: (data) => {
            if (data.pageNumber > 1) {
                doc.setFillColor(13, 59, 102);
                doc.rect(0, 0, pageW, 8, 'F');
                doc.setFillColor(59, 130, 246);
                doc.rect(0, 8, pageW, 1, 'F');
            }
        }
    });

    applyFooters(doc);
    return doc;
}
