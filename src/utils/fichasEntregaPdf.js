/**
 * fichasEntregaPdf.js — Generador oficial de PDF A4 para Entrega de Fichas de Admisión
 * Sistema ADM-QUI · Sanatorio Argentino
 * 
 * Estética institucional de alta fidelidad:
 * - Encabezado Sanatorio Argentino (#0D3B66) con logo oficial
 * - Info-box de metadatos clínicos/administrativos del lote
 * - Tabla estructurada con autoTable (multiusuario, cortes de página limpios)
 * - Badges visuales de Documentación Completa / Incompleta con motivo
 * - Bloque de Firmas digitales / aclaraciones (Entrega y Recepción)
 * - Paginación y pie de página institucional
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getSanatorioLogoBase64, SANATORIO_LOGO_BASE64 } from './sanatorioLogoBase64';

export async function generarPdfConstanciaFichas(data, options = {}) {
    if (!data) throw new Error('No se proporcionaron datos para generar la constancia');

    const {
        codigo = 'ENT-FICHA-S/N',
        fecha = new Date().toISOString(),
        responsableEntrega = 'Francisco (Recepción)',
        responsableRecibe = 'Administración',
        firmaEntrega = null,
        firmaRecibe = null,
        observaciones = '',
        items = []
    } = data;

    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;
    const colW = pageW - margin * 2;
    let y = 0;

    // ─── 1. Logo Sanatorio Argentino ───
    let logoBase64 = null;
    try {
        logoBase64 = await getSanatorioLogoBase64();
    } catch {
        logoBase64 = SANATORIO_LOGO_BASE64;
    }

    // ─── 2. Header Institucional (Barra Azul Navy) ───
    doc.setFillColor(13, 59, 102); // #0D3B66 Azul Institucional
    doc.rect(0, 0, pageW, 32, 'F');

    // Línea de acento cyan / celeste Sanatorio
    doc.setFillColor(2, 132, 199); // #0284C7
    doc.rect(0, 32, pageW, 2.5, 'F');

    // Logo circular
    const logoX = margin + 1;
    const logoY = 5.5;
    const logoSize = 19;
    if (logoBase64) {
        try {
            doc.setFillColor(255, 255, 255);
            doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 1.2, 'F');
            doc.addImage(logoBase64, 'PNG', logoX, logoY, logoSize, logoSize);
        } catch {
            // fallback
            doc.setFillColor(255, 255, 255);
            doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 'F');
            doc.setFontSize(8);
            doc.setTextColor(13, 59, 102);
            doc.text('SA', logoX + 6, logoY + logoSize / 2 + 2);
        }
    }

    // Título y Subtítulo
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('SANATORIO ARGENTINO', margin + 24, 13);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(203, 213, 225); // Slate 300
    doc.text('Mesa de Entradas · Recepción & Control de Admisiones', margin + 24, 19);
    doc.text('Transferencia Oficial de Documentación y Fichas Físicas', margin + 24, 24);

    // Titular derecho
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('CONSTANCIA DE ENTREGA', pageW - margin, 13, { align: 'right' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(203, 213, 225);
    doc.text('Circuito Administrativo ADM-QUI', pageW - margin, 19, { align: 'right' });
    doc.text(`Ref: ${codigo}`, pageW - margin, 24, { align: 'right' });

    y = 41;

    // ─── 3. Resumen y Metadatos del Lote (Card) ───
    const fechaHora = new Date(fecha).toLocaleString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    const completasCount = items.filter(i => {
        const est = (i.estado_documentacion || i.docEstado || i.ficha_doc_estado || '').toLowerCase();
        return est !== 'incompleta';
    }).length;
    const incompletasCount = items.length - completasCount;

    doc.setFillColor(248, 250, 252); // #F8FAFC
    doc.roundedRect(margin, y, colW, 18, 2.5, 2.5, 'F');
    doc.setDrawColor(226, 232, 240); // #E2E8F0
    doc.roundedRect(margin, y, colW, 18, 2.5, 2.5, 'S');

    const metaColumns = [
        { label: 'CÓDIGO REMITO', value: codigo },
        { label: 'FECHA Y HORA', value: fechaHora },
        { label: 'ENTREGA (RECEPCIÓN)', value: (responsableEntrega || 'Recepción').substring(0, 20) },
        { label: 'RECIBE (ADMINISTRACIÓN)', value: (responsableRecibe || 'Administración').substring(0, 20) },
        { 
            label: 'TOTAL ADMISIONES', 
            value: `${items.length} fichas ${incompletasCount > 0 ? `(${incompletasCount} inc.)` : '(100% comp.)'}` 
        }
    ];

    const colStep = colW / metaColumns.length;
    metaColumns.forEach((col, idx) => {
        const cX = margin + colStep * idx + 3;
        doc.setFontSize(5.8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 116, 139); // Slate 500
        doc.text(col.label, cX, y + 5.5);

        doc.setFontSize(idx === 0 ? 8.5 : (idx === 4 ? 8 : 7.8));
        doc.setFont('helvetica', 'bold');
        if (idx === 0) {
            doc.setTextColor(13, 59, 102);
            doc.setFont('courier', 'bold');
        } else if (idx === 4 && incompletasCount > 0) {
            doc.setTextColor(180, 83, 9); // Amber 700
            doc.setFont('helvetica', 'bold');
        } else {
            doc.setTextColor(15, 23, 42);
        }
        doc.text(col.value, cX, y + 12);
    });

    y += 24;

    // ─── 4. Título de Sección ───
    doc.setFillColor(13, 59, 102);
    doc.rect(margin, y, 3, 6, 'F');

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(13, 59, 102);
    doc.text('DETALLE DE FICHAS DE ADMISIÓN ENTREGADAS', margin + 5, y + 4.8);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Total registros: ${items.length} admisiones físicas`, pageW - margin, y + 4.8, { align: 'right' });

    y += 9;

    // ─── 5. Tabla de Fichas (autoTable) ───
    const tableBody = items.map((item, idx) => {
        const fIngreso = item.fecha_ingreso
            ? new Date(item.fecha_ingreso + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
            : '—';

        const est = (item.estado_documentacion || item.docEstado || item.ficha_doc_estado || '').toLowerCase();
        const isIncompleta = est === 'incompleta';
        const motivo = item.motivo_incompleta || item.motivoIncompleta || item.ficha_doc_incompleta_motivo || '';

        const estadoTxt = isIncompleta
            ? `⚠️ INCOMPLETA${motivo ? `\n(${motivo})` : ''}`
            : '✓ COMPLETA';

        const dniNhc = [
            item.dni || item.id_paciente || '—',
            item.nhc && item.nhc !== '—' ? `NHC: ${item.nhc}` : null
        ].filter(Boolean).join('\n');

        return [
            String(idx + 1),
            fIngreso,
            item.numero_admision || '—',
            item.paciente || '—',
            dniNhc,
            (item.cliente || 'Particular').substring(0, 24),
            (item.especialidad || '—').substring(0, 24),
            (item.responsable_recepcion || item.responsableRecepcion || item.operador || 'Recepción').substring(0, 18),
            estadoTxt
        ];
    });

    autoTable(doc, {
        startY: y,
        head: [['#', 'Ingreso', 'N° Adm.', 'Paciente', 'DNI / NHC', 'Obra Social / Prepaga', 'Especialidad', 'Recepcionó', 'Estado Docs']],
        body: tableBody,
        theme: 'grid',
        headStyles: {
            fillColor: [13, 59, 102], // #0D3B66
            textColor: [255, 255, 255],
            fontSize: 7,
            fontStyle: 'bold',
            halign: 'left',
            cellPadding: 2.5
        },
        bodyStyles: {
            fontSize: 6.8,
            cellPadding: 2,
            textColor: [15, 23, 42],
            valign: 'middle'
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252] // #F8FAFC
        },
        columnStyles: {
            0: { cellWidth: 7, halign: 'center', fontStyle: 'bold', textColor: [100, 116, 139] },
            1: { cellWidth: 14, halign: 'center' },
            2: { cellWidth: 17, fontStyle: 'bold', font: 'courier' },
            3: { cellWidth: 36, fontStyle: 'bold' },
            4: { cellWidth: 20, font: 'courier', fontSize: 6.2 },
            5: { cellWidth: 26 },
            6: { cellWidth: 24 },
            7: { cellWidth: 20, textColor: [71, 85, 105] },
            8: { cellWidth: 18, halign: 'center', fontStyle: 'bold', fontSize: 6 }
        },
        margin: { left: margin, right: margin, bottom: 25 },
        didParseCell: (data) => {
            // Colorear badge de estado
            if (data.section === 'body' && data.column.index === 8) {
                const cellText = String(data.cell.raw || '');
                if (cellText.includes('INCOMPLETA')) {
                    data.cell.styles.textColor = [180, 83, 9]; // Amber
                    data.cell.styles.fillColor = [254, 243, 199]; // Light amber
                } else {
                    data.cell.styles.textColor = [22, 101, 52]; // Green
                    data.cell.styles.fillColor = [220, 252, 231]; // Light green
                }
            }
        },
        didDrawPage: (data) => {
            // Re-dibujar header simplificado en páginas siguientes
            if (data.pageNumber > 1) {
                doc.setFillColor(13, 59, 102);
                doc.rect(0, 0, pageW, 10, 'F');
                doc.setFillColor(2, 132, 199);
                doc.rect(0, 10, pageW, 1.2, 'F');

                doc.setFontSize(7.5);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(255, 255, 255);
                doc.text(`SANATORIO ARGENTINO · CONSTANCIA ${codigo} (Cont.)`, margin, 7);

                doc.setFontSize(7);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(203, 213, 225);
                doc.text(`Lote: ${items.length} fichas`, pageW - margin, 7, { align: 'right' });
            }
        }
    });

    y = doc.lastAutoTable.finalY + 6;

    // ─── 6. Observaciones del Lote ───
    if (observaciones && observaciones.trim()) {
        if (y > pageH - 50) {
            doc.addPage();
            y = 18;
        }

        doc.setFillColor(255, 251, 235); // #FFFBEB
        doc.setDrawColor(253, 230, 138); // #FDE68A
        doc.roundedRect(margin, y, colW, 11, 2, 2, 'FD');

        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(146, 64, 14);
        doc.text('OBSERVACIONES GENERALES:', margin + 4, y + 4.5);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(69, 26, 3);
        const obsSplit = doc.splitTextToSize(observaciones.trim(), colW - 48);
        doc.text(obsSplit, margin + 44, y + 4.5);

        y += 15;
    }

    // ─── 7. Bloque de Firmas Digitales e Institucionales ───
    if (y > pageH - 46) {
        doc.addPage();
        y = 20;
    } else {
        y += 2;
    }

    const sigBoxW = (colW - 12) / 2;
    const sigBoxH = 34;

    // Recuadro Firma Entrega
    const sig1X = margin;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(sig1X, y, sigBoxW, sigBoxH, 2.5, 2.5, 'FD');

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('ENTREGADO POR (RECEPCIÓN / CADETERÍA)', sig1X + sigBoxW / 2, y + 5, { align: 'center' });

    if (firmaEntrega) {
        try {
            doc.addImage(firmaEntrega, 'PNG', sig1X + sigBoxW / 2 - 20, y + 7, 40, 15);
        } catch {
            doc.setDrawColor(203, 213, 225);
            doc.line(sig1X + 12, y + 22, sig1X + sigBoxW - 12, y + 22);
        }
    } else {
        doc.setDrawColor(203, 213, 225);
        doc.line(sig1X + 12, y + 22, sig1X + sigBoxW - 12, y + 22);
    }

    doc.setDrawColor(13, 59, 102);
    doc.setLineWidth(0.4);
    doc.line(sig1X + 10, y + 24, sig1X + sigBoxW - 10, y + 24);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(13, 59, 102);
    doc.text(responsableEntrega || 'Francisco', sig1X + sigBoxW / 2, y + 28.5, { align: 'center' });

    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Firma y Aclaración de quien entrega', sig1X + sigBoxW / 2, y + 32, { align: 'center' });

    // Recuadro Firma Recibe
    const sig2X = margin + sigBoxW + 12;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(sig2X, y, sigBoxW, sigBoxH, 2.5, 2.5, 'FD');

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('RECIBIDO POR (ADMINISTRACIÓN)', sig2X + sigBoxW / 2, y + 5, { align: 'center' });

    if (firmaRecibe) {
        try {
            doc.addImage(firmaRecibe, 'PNG', sig2X + sigBoxW / 2 - 20, y + 7, 40, 15);
        } catch {
            doc.setDrawColor(203, 213, 225);
            doc.line(sig2X + 12, y + 22, sig2X + sigBoxW - 12, y + 22);
        }
    } else {
        doc.setDrawColor(203, 213, 225);
        doc.line(sig2X + 12, y + 22, sig2X + sigBoxW - 12, y + 22);
    }

    doc.setDrawColor(13, 59, 102);
    doc.setLineWidth(0.4);
    doc.line(sig2X + 10, y + 24, sig2X + sigBoxW - 10, y + 24);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(13, 59, 102);
    doc.text(responsableRecibe || 'Administración', sig2X + sigBoxW / 2, y + 28.5, { align: 'center' });

    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Firma y Aclaración de quien recibe', sig2X + sigBoxW / 2, y + 32, { align: 'center' });

    // ─── 8. Pie de Página en Todas las Hojas ───
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);

        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.line(margin, pageH - 10, pageW - margin, pageH - 10);

        doc.setFontSize(6.2);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184); // Slate 400
        doc.text(
            'Sanatorio Argentino · Constancia Oficial de Transferencia de Admisiones Físicas · Sistema ADM-QUI',
            margin, pageH - 6.5
        );
        doc.text(
            `Pág. ${p} de ${totalPages}`,
            pageW - margin, pageH - 6.5,
            { align: 'right' }
        );
    }

    if (options.action === 'print') {
        doc.autoPrint();
    }

    const fileName = `Constancia_Entrega_${codigo.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
    const blob = doc.output('blob');
    const blobUrl = URL.createObjectURL(blob);

    if (options.action === 'print') {
        const printWin = window.open(blobUrl, '_blank');
        if (!printWin) {
            // Si el bloqueador de popups lo retiene, fallback a descarga
            doc.save(fileName);
        }
        return { success: true, fileName, blobUrl };
    }

    if (options.action === 'preview' || options.action === 'open') {
        window.open(blobUrl, '_blank');
        return { success: true, fileName, blobUrl };
    }

    if (options.action === 'blob') {
        return blob;
    }

    // Por defecto: descarga directa del PDF
    doc.save(fileName);
    return { success: true, fileName, blobUrl };
}

