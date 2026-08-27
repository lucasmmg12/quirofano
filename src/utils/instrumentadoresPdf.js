/**
 * instrumentadoresPdf.js
 * Generador de PDFs oficiales de Liquidación de Instrumentadores Quirúrgicos — Sanatorio Argentino
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from './guardiaLiquidacionPdf.js';

/**
 * Carga el logo institucional en Base64 o fallback
 */
async function loadLogoBase64() {
    try {
        const response = await fetch('/logosanatorio.png');
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

/**
 * Dibuja el encabezado institucional para la liquidación individual de instrumentador
 */
function drawHeaderInstrumentador(doc, inst, logoBase64) {
    const W = doc.internal.pageSize.getWidth();
    const ML = 14;
    const MR = W - 14;

    if (logoBase64) {
        try {
            doc.addImage(logoBase64, 'PNG', ML, 8, 24, 24);
        } catch {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(30, 87, 153);
            doc.text('SANATORIO ARGENTINO', ML, 16);
        }
    } else {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(30, 87, 153);
        doc.text('SANATORIO ARGENTINO', ML, 16);
    }

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);

    const rightX = MR;
    let y = 11;

    doc.text(`Profesional: ${inst.nombre}`, rightX, y, { align: 'right' });
    y += 4.5;
    doc.text(`Número de matrícula: ${inst.matricula || '—'}`, rightX, y, { align: 'right' });
    y += 4.5;
    doc.text(`Periodo de liquidación: ${inst.periodo || 'Mayo 2026'}`, rightX, y, { align: 'right' });
    y += 4.5;
    doc.text(`Liquidación: ${inst.liquidacion || '410'}`, rightX, y, { align: 'right' });
}

/**
 * Genera el PDF Individual de un Instrumentador Quirúrgico (Landscape)
 * @param {Object} inst - Objeto con datos y procedimientos del instrumentador
 * @returns {jsPDF} Documento jsPDF generado
 */
export async function generateInstrumentadorIndividualPdf(inst) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const logoBase64 = await loadLogoBase64();

    drawHeaderInstrumentador(doc, inst, logoBase64);

    const tableBody = inst.procedimientos.map(p => [
        p.fecha,
        p.paciente,
        p.procedimiento,
        p.observacion || '',
        formatCurrency(p.valor),
        p.cirujano
    ]);

    autoTable(doc, {
        startY: 32,
        margin: { left: 14, right: 14, bottom: 15 },
        head: [['Fecha visita', 'Paciente', 'Procedimiento quirúrgico', 'Observación', 'Valor', 'Cirujano']],
        body: tableBody,
        foot: [
            ['', '', '', 'Total', formatCurrency(inst.totalValor), '']
        ],
        theme: 'plain',
        headStyles: {
            fontSize: 8,
            fontStyle: 'bold',
            textColor: [0, 0, 0],
            fillColor: false,
            lineWidth: { bottom: 0.5 },
            lineColor: [0, 0, 0]
        },
        bodyStyles: {
            fontSize: 7.2,
            textColor: [0, 0, 0],
            cellPadding: 1.2
        },
        footStyles: {
            fontSize: 8,
            fontStyle: 'bold',
            textColor: [0, 0, 0],
            fillColor: false,
            lineWidth: { top: 0.5 },
            lineColor: [0, 0, 0]
        },
        columnStyles: {
            0: { cellWidth: 22, halign: 'left' },
            1: { cellWidth: 56, halign: 'left' },
            2: { cellWidth: 88, halign: 'left' },
            3: { cellWidth: 32, halign: 'left' },
            4: { cellWidth: 26, halign: 'right' },
            5: { cellWidth: 45, halign: 'left' }
        },
        didDrawPage: (data) => {
            const pageCount = doc.internal.getNumberOfPages();
            if (data.pageNumber > 1) {
                doc.setFontSize(7.5);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(100, 116, 139);
                doc.text(`Sanatorio Argentino · Liquidación Instrumentación Quirúrgica · ${inst.nombre}`, 14, 8);
                doc.text(`Página ${data.pageNumber} de ${pageCount}`, doc.internal.pageSize.getWidth() - 14, 8, { align: 'right' });
            }
        }
    });

    return doc;
}

/**
 * Genera el PDF General Consolidado de Instrumentadores Quirúrgicos (Landscape)
 */
export async function generateInstrumentadoresGeneralPdf(data) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const logoBase64 = await loadLogoBase64();
    const W = doc.internal.pageSize.getWidth();

    if (logoBase64) {
        try {
            doc.addImage(logoBase64, 'PNG', 14, 8, 22, 22);
        } catch {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(30, 87, 153);
            doc.text('SANATORIO ARGENTINO', 14, 16);
        }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(30, 87, 153);
    doc.text('LIQUIDACIÓN GENERAL — INSTRUMENTADORES QUIRÚRGICOS', W / 2, 14, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(`Período de Liquidación: ${data.periodo || 'Mayo 2026'} · N° Liquidación: ${data.liquidacion || '410'}`, W / 2, 19, { align: 'center' });
    doc.text(`Fecha de Emisión: ${new Date().toLocaleDateString('es-AR')} · Total Instrumentadores: ${data.totalInstrumentadores}`, W / 2, 23.5, { align: 'center' });

    const tableBody = data.instrumentadores.map((inst, i) => [
        String(i + 1),
        inst.nombre,
        inst.matricula || '—',
        String(inst.procedimientos.length),
        formatCurrency(inst.totalValor)
    ]);

    autoTable(doc, {
        startY: 28,
        margin: { left: 18, right: 18, bottom: 15 },
        head: [
            ['N°', 'Instrumentador / Profesional', 'Matrícula', 'Cant. Procedimientos', 'Total Liquidado']
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
        theme: 'striped',
        headStyles: {
            fontSize: 8,
            fontStyle: 'bold',
            fillColor: [30, 87, 153],
            textColor: [255, 255, 255],
            halign: 'center'
        },
        bodyStyles: {
            fontSize: 7.5,
            textColor: [0, 0, 0],
            cellPadding: 1.5
        },
        footStyles: {
            fontSize: 8,
            fontStyle: 'bold',
            fillColor: [235, 243, 252],
            textColor: [30, 87, 153]
        },
        columnStyles: {
            0: { cellWidth: 12, halign: 'center' },
            1: { cellWidth: 100, halign: 'left' },
            2: { cellWidth: 35, halign: 'center' },
            3: { cellWidth: 45, halign: 'center' },
            4: { cellWidth: 65, halign: 'right', fontStyle: 'bold' }
        },
        didDrawPage: (data) => {
            const pageCount = doc.internal.getNumberOfPages();
            doc.setFontSize(7);
            doc.setTextColor(120, 120, 120);
            doc.text(`Página ${data.pageNumber} de ${pageCount}`, W - 18, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
            doc.text('Sanatorio Argentino SRL — Sistema ADM-QUI', 18, doc.internal.pageSize.getHeight() - 8);
        }
    });

    return doc;
}
