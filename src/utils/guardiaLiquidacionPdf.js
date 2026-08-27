/**
 * guardiaLiquidacionPdf.js
 * Generador de PDFs oficiales de Liquidación de Guardia Pediátrica — Sanatorio Argentino
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
 * Dibuja el encabezado institucional para la liquidación individual de guardia
 */
function drawHeaderIndividual(doc, prestador, logoBase64) {
    const W = doc.internal.pageSize.getWidth();
    const ML = 14;
    const MR = W - 14;

    // Logo o Isotipo
    if (logoBase64) {
        try {
            doc.addImage(logoBase64, 'PNG', ML, 10, 28, 28);
        } catch {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor(30, 87, 153);
            doc.text('SANATORIO ARGENTINO', ML, 20);
        }
    } else {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(30, 87, 153);
        doc.text('SANATORIO ARGENTINO', ML, 20);
    }

    // Bloque derecho: Datos del profesional
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);

    const rightX = MR;
    let y = 14;

    doc.text(`Profesional: ${prestador.nombre}`, rightX, y, { align: 'right' });
    y += 5;
    doc.text(`Número de matrícula: ${prestador.matricula || '—'}`, rightX, y, { align: 'right' });
    y += 5;
    doc.text(`Periodo de liquidación: ${prestador.periodo || 'Mayo 2026'}`, rightX, y, { align: 'right' });
    y += 5;
    doc.text(`Liquidación: ${prestador.liquidacion || '410'}`, rightX, y, { align: 'right' });
}

/**
 * Genera el PDF Individual de un Médico de Guardia Pediátrica
 * @param {Object} prestador - Objeto con datos y atenciones del médico
 * @param {Object} options - Parámetros globales
 * @returns {jsPDF} Documento jsPDF generado
 */
export async function generateGuardiaIndividualPdf(prestador, options = {}) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const logoBase64 = await loadLogoBase64();

    // Dibujar encabezado en página 1
    drawHeaderIndividual(doc, prestador, logoBase64);

    const tableBody = prestador.atenciones.map(a => [
        a.fecha,
        a.paciente,
        a.obraSocial,
        formatCurrency(a.importe)
    ]);

    // Tabla de atenciones
    autoTable(doc, {
        startY: 38,
        margin: { left: 14, right: 14, bottom: 20 },
        head: [['Fecha', 'Paciente', 'Obra Social', 'Importe']],
        body: tableBody,
        foot: [
            ['', '', 'Total', formatCurrency(prestador.totalImporte)]
        ],
        theme: 'plain',
        headStyles: {
            fontSize: 8.5,
            fontStyle: 'bold',
            textColor: [0, 0, 0],
            fillColor: false,
            lineWidth: { bottom: 0.5 },
            lineColor: [0, 0, 0]
        },
        bodyStyles: {
            fontSize: 7.5,
            textColor: [0, 0, 0],
            cellPadding: 1.2
        },
        footStyles: {
            fontSize: 8.5,
            fontStyle: 'bold',
            textColor: [0, 0, 0],
            fillColor: false,
            lineWidth: { top: 0.5 },
            lineColor: [0, 0, 0]
        },
        columnStyles: {
            0: { cellWidth: 24, halign: 'left' },
            1: { cellWidth: 70, halign: 'left' },
            2: { cellWidth: 62, halign: 'left' },
            3: { cellWidth: 26, halign: 'right' }
        },
        didDrawPage: (data) => {
            // Si hay más páginas, dibujar encabezado sutil en páginas subsiguientes
            if (data.pageNumber > 1) {
                doc.setFontSize(7.5);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(100, 116, 139);
                doc.text(`Sanatorio Argentino · Liquidación Guardia Pediátrica · ${prestador.nombre}`, 14, 10);
                doc.text(`Página ${data.pageNumber}`, doc.internal.pageSize.getWidth() - 14, 10, { align: 'right' });
            }
        }
    });

    let finalY = doc.lastAutoTable.finalY + 6;

    // Verificar si queda espacio para el cuadro de adicionales o añadir página
    if (finalY + 45 > 280) {
        doc.addPage();
        finalY = 20;
    }

    // ─── Cuadro de Adicionales por Guardia Pediátrica ───
    const valorAdicional = options.valorAdicional !== undefined ? options.valorAdicional : (prestador.valorAdicional || 8000);
    const obrasSociales = options.obrasSocialesAdicional || ['001 - PROVINCIA', '004 - DAMSU'];

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text('Adicional por atención en servicio de guardia pediátrica', 14, finalY);

    // Mini tabla resumen de adicionales
    autoTable(doc, {
        startY: finalY + 2,
        margin: { left: 14, right: 14 },
        head: [['Cantidad', 'Total']],
        body: [
            [
                String(prestador.totalCantidadAdicional || 0),
                formatCurrency(prestador.totalMontoAdicional || 0)
            ]
        ],
        theme: 'plain',
        headStyles: { fontSize: 8, fontStyle: 'bold', textColor: [0, 0, 0], lineWidth: 0.3, lineColor: [0, 0, 0] },
        bodyStyles: { fontSize: 8, textColor: [0, 0, 0], lineWidth: 0.3, lineColor: [0, 0, 0] },
        columnStyles: {
            0: { cellWidth: 25, halign: 'center' },
            1: { cellWidth: 35, halign: 'right' }
        },
        styles: { cellPadding: 1.5 }
    });

    const table2Y = doc.lastAutoTable.finalY + 4;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Obras sociales que aplican cobro de adicional:', 14, table2Y);

    // Lista de obras sociales
    autoTable(doc, {
        startY: table2Y + 2,
        margin: { left: 14, right: 14 },
        body: obrasSociales.map(os => [os, formatCurrency(valorAdicional)]),
        theme: 'plain',
        bodyStyles: { fontSize: 7.5, textColor: [0, 0, 0], lineWidth: 0.2, lineColor: [200, 200, 200] },
        columnStyles: {
            0: { cellWidth: 45, halign: 'left' },
            1: { cellWidth: 25, halign: 'right' }
        },
        styles: { cellPadding: 1.2 }
    });

    return doc;
}

/**
 * Genera el PDF General Consolidado de Guardia Pediátrica
 */
export async function generateGuardiaGeneralPdf(data, options = {}) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const logoBase64 = await loadLogoBase64();
    const W = doc.internal.pageSize.getWidth();

    // Logo
    if (logoBase64) {
        try {
            doc.addImage(logoBase64, 'PNG', 14, 10, 26, 26);
        } catch {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(30, 87, 153);
            doc.text('SANATORIO ARGENTINO', 14, 20);
        }
    }

    // Título Central
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(30, 87, 153);
    doc.text('LIQUIDACIÓN GENERAL — SERVICIO DE GUARDIA PEDIÁTRICA', W / 2, 18, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(80, 80, 80);
    doc.text(`Período de Liquidación: ${data.periodo || 'Mayo 2026'} · N° Liquidación: ${data.liquidacion || '410'}`, W / 2, 23, { align: 'center' });
    doc.text(`Fecha de Emisión: ${new Date().toLocaleDateString('es-AR')} · Total Profesionales: ${data.totalPrestadores}`, W / 2, 27.5, { align: 'center' });

    // Tabla Resumen Consolidada
    const tableBody = data.prestadores.map((p, i) => [
        String(i + 1),
        p.nombre,
        p.matricula || '—',
        String(p.atenciones.length),
        formatCurrency(p.totalImporte),
        String(p.totalCantidadAdicional || 0),
        formatCurrency(p.totalMontoAdicional || 0),
        formatCurrency(p.totalGeneralConAdicional || (p.totalImporte + p.totalMontoAdicional))
    ]);

    autoTable(doc, {
        startY: 34,
        margin: { left: 12, right: 12, bottom: 15 },
        head: [
            ['N°', 'Profesional / Responsable', 'Matrícula', 'Atenc.', 'Subtotal Consultas', 'Adic. (Cant)', 'Monto Adicional', 'Total General']
        ],
        body: tableBody,
        foot: [
            [
                '',
                'TOTAL GENERAL CONSOLIDADO',
                '',
                String(data.totalAtenciones),
                formatCurrency(data.totalFacturadoGlobal),
                String(data.totalCantidadAdicionalesGlobal),
                formatCurrency(data.totalAdicionalesGlobal),
                formatCurrency(data.granTotalGlobal)
            ]
        ],
        theme: 'striped',
        headStyles: {
            fontSize: 7.5,
            fontStyle: 'bold',
            fillColor: [30, 87, 153],
            textColor: [255, 255, 255],
            halign: 'center'
        },
        bodyStyles: {
            fontSize: 7,
            textColor: [0, 0, 0],
            cellPadding: 1.4
        },
        footStyles: {
            fontSize: 7.5,
            fontStyle: 'bold',
            fillColor: [235, 243, 252],
            textColor: [30, 87, 153]
        },
        columnStyles: {
            0: { cellWidth: 8, halign: 'center' },
            1: { cellWidth: 50, halign: 'left' },
            2: { cellWidth: 16, halign: 'center' },
            3: { cellWidth: 14, halign: 'center' },
            4: { cellWidth: 28, halign: 'right' },
            5: { cellWidth: 18, halign: 'center' },
            6: { cellWidth: 26, halign: 'right' },
            7: { cellWidth: 26, halign: 'right', fontStyle: 'bold' }
        },
        didDrawPage: (data) => {
            const pageCount = doc.internal.getNumberOfPages();
            doc.setFontSize(7);
            doc.setTextColor(120, 120, 120);
            doc.text(`Página ${data.pageNumber} de ${pageCount}`, W - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
            doc.text('Sanatorio Argentino SRL — Sistema ADM-QUI', 14, doc.internal.pageSize.getHeight() - 8);
        }
    });

    return doc;
}
