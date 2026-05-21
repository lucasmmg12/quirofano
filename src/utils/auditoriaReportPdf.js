import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const COLORS = {
    primary: [30, 95, 166],        // #1E5FA6 Azul Sanatorio Argentino
    primaryLight: [235, 242, 250],  // Soft blue background
    dark: [30, 41, 59],            // #1E293B
    gray: [100, 116, 139],         // #64748B
    lightGray: [248, 250, 252],    // #F8FAFC
    white: [255, 255, 255],
    green: [12, 166, 120],         // #0ca678 (OK)
    amber: [245, 158, 11],         // #F59E0B (Warn/Fecha)
    red: [239, 68, 68],            // #EF4444 (Error/Ambos)
    blue: [28, 126, 214]           // #1C7ED6 (Respuesta)
};

export function exportAuditorReportPdf(originalRows, kpis, columnMapping, groupedPatients = []) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    // --- CABECERA PRINCIPAL ---
    doc.setFillColor(...COLORS.primary);
    doc.rect(0, 0, pageWidth, 26, 'F');

    doc.setTextColor(...COLORS.white);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Sanatorio Argentino', margin, 11);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Sistema ADM-QUI — Reporte de Auditoría de Historias Clínicas (OSP)', margin, 18);

    // Fecha a la derecha
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
    doc.setFontSize(8.5);
    doc.text(`Fecha de Auditoría: ${dateStr}`, pageWidth - margin, 15, { align: 'right' });

    y = 35;

    // --- RESUMEN DE INDICADORES (KPIs) ---
    doc.setTextColor(...COLORS.dark);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumen General de Completitud', margin, y);
    
    // Tabla 1: KPIs de Completitud
    const kpiHeaders = ['Total Registros', 'Completos OK', 'Observados', 'Falta Fecha', 'Falta Respuesta', 'Falta Ambos'];
    const totalObservados = kpis.total - kpis.ok;
    const onlyFecha = kpis.sinFecha - kpis.sinAmbos;
    const onlyRespuesta = kpis.sinRespuesta - kpis.sinAmbos;

    const kpiRows = [[
        kpis.total.toString(),
        kpis.ok.toString(),
        totalObservados.toString(),
        onlyFecha.toString(),
        onlyRespuesta.toString(),
        kpis.sinAmbos.toString()
    ]];

    autoTable(doc, {
        startY: y + 3,
        head: [kpiHeaders],
        body: kpiRows,
        margin: { left: margin, right: margin },
        styles: {
            fontSize: 8.5,
            cellPadding: 3,
            lineColor: [226, 232, 240],
            lineWidth: 0.2,
            textColor: COLORS.dark,
            font: 'helvetica',
            halign: 'center'
        },
        headStyles: {
            fillColor: COLORS.primaryLight,
            textColor: COLORS.primary,
            fontStyle: 'bold',
        },
        columnStyles: {
            0: { fontStyle: 'bold' },
            1: { textColor: COLORS.green, fontStyle: 'bold' },
            2: { textColor: COLORS.red, fontStyle: 'bold' }
        }
    });

    y = doc.lastAutoTable.finalY + 8;

    // --- IMPACTO FINANCIERO DE DÉBITOS (OSP) ---
    doc.setTextColor(...COLORS.dark);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Impacto Financiero OSP San Juan (Estimación de Débitos)', margin, y);

    const debitHeaders = ['Días sin Evolución (Gaps)', 'Evoluciones Duplicadas', 'Falta Foja Quirúrgica', 'Riesgo Total de Débito ($)'];
    const debitRows = [[
        kpis.totalGaps ? kpis.totalGaps.toString() : '0',
        kpis.totalDuplicados ? kpis.totalDuplicados.toString() : '0',
        kpis.totalFaltaFoja ? kpis.totalFaltaFoja.toString() : '0',
        `$ ${(kpis.riesgoFinancieroTotal || 0).toLocaleString('es-AR')}`
    ]];

    autoTable(doc, {
        startY: y + 3,
        head: [debitHeaders],
        body: debitRows,
        margin: { left: margin, right: margin },
        styles: {
            fontSize: 8.5,
            cellPadding: 3,
            lineColor: [226, 232, 240],
            lineWidth: 0.2,
            textColor: COLORS.dark,
            font: 'helvetica',
            halign: 'center'
        },
        headStyles: {
            fillColor: [254, 242, 242], // soft red
            textColor: [185, 28, 28], // dark red
            fontStyle: 'bold',
        },
        columnStyles: {
            3: { textColor: [185, 28, 28], fontStyle: 'bold' }
        }
    });

    y = doc.lastAutoTable.finalY + 10;

    // --- DETALLE DE CASOS CON OBSERVACIONES POR PACIENTE ---
    doc.setTextColor(...COLORS.dark);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Detalle de Auditoría por Ciclo de Internación (Pacientes con Alertas)', margin, y);
    y += 4;

    const auditedPatients = (groupedPatients || []).filter(p => p.hasCriticalIssues);

    if (auditedPatients.length === 0) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.green);
        doc.text('No se detectaron riesgos de débitos en los ciclos de internación de los pacientes. Auditoría 100% Correcta.', margin, y);
        y += 10;
    } else {
        const tableHeaders = ['Paciente', 'N° Admisión', 'Habitación', 'Especialidad', 'Gaps Detectados', 'Evol. Duplicadas', 'Falta Foja', 'Débito Est.'];
        const tableRows = auditedPatients.map(pat => {
            const gapsStr = pat.gaps.length > 0 ? `${pat.gaps.length} (${pat.gaps.join(', ')})` : '0';
            const dupCount = pat.evoluciones.filter(ev => ev.isDuplicated).length;
            const dupStr = dupCount > 0 ? `${dupCount} días` : 'No';
            const fojaStr = pat.faltaFoja ? 'Sí' : 'No';
            const debitoStr = `$ ${pat.riesgoDebito.toLocaleString('es-AR')}`;

            return [
                pat.paciente,
                pat.numeroAdmision,
                pat.habitacion || '—',
                pat.especialidad || '—',
                gapsStr,
                dupStr,
                fojaStr,
                debitoStr
            ];
        });

        autoTable(doc, {
            startY: y,
            head: [tableHeaders],
            body: tableRows,
            margin: { left: margin, right: margin },
            styles: {
                fontSize: 7.5,
                cellPadding: 2.5,
                lineColor: [226, 232, 240],
                lineWidth: 0.2,
                textColor: COLORS.dark,
                font: 'helvetica'
            },
            headStyles: {
                fillColor: COLORS.primary,
                textColor: COLORS.white,
                fontStyle: 'bold'
            },
            alternateRowStyles: {
                fillColor: COLORS.lightGray
            },
            columnStyles: {
                1: { cellWidth: 20, halign: 'center' },
                2: { cellWidth: 20, halign: 'center' },
                4: { cellWidth: 45 },
                5: { cellWidth: 22, halign: 'center' },
                6: { cellWidth: 18, halign: 'center' },
                7: { cellWidth: 25, fontStyle: 'bold', halign: 'right' }
            },
            didParseCell: (data) => {
                if (data.section === 'body') {
                    if (data.column.index === 4 && data.cell.text[0] !== '0') {
                        data.cell.styles.textColor = COLORS.red;
                        data.cell.styles.fontStyle = 'bold';
                    }
                    if (data.column.index === 6 && data.cell.text[0] === 'Sí') {
                        data.cell.styles.textColor = COLORS.red;
                        data.cell.styles.fontStyle = 'bold';
                    }
                    if (data.column.index === 7) {
                        data.cell.styles.textColor = [185, 28, 28];
                    }
                }
            }
        });

        y = doc.lastAutoTable.finalY + 12;
    }

    // --- BLOQUE DE FIRMAS ---
    // Verificar si queda suficiente espacio en la página actual para el bloque de firmas (necesitamos al menos 30mm)
    if (y > pageHeight - 35) {
        addFooter(doc, pageWidth, pageHeight, margin);
        doc.addPage();
        y = margin + 15;
    }

    const signatureY = pageHeight - 28;
    doc.setDrawColor(...COLORS.gray);
    doc.setLineWidth(0.3);

    // Firma 1: Auditor
    doc.line(margin + 15, signatureY, margin + 85, signatureY);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.dark);
    doc.text('Firma Auditor de Calidad', margin + 50, signatureY + 4, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.gray);
    doc.text('Departamento de Calidad y Procesos', margin + 50, signatureY + 8, { align: 'center' });

    // Firma 2: Dirección Médica
    doc.line(pageWidth - margin - 85, signatureY, pageWidth - margin - 15, signatureY);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.dark);
    doc.text('Firma Dirección Médica', pageWidth - margin - 50, signatureY + 4, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.gray);
    doc.text('Dirección Médica - Sanatorio Argentino', pageWidth - margin - 50, signatureY + 8, { align: 'center' });

    // Footer de todas las páginas
    addFooter(doc, pageWidth, pageHeight, margin);

    // Descarga del archivo
    const safeDate = now.toISOString().slice(0, 10);
    doc.save(`reporte-auditoria-hc_${safeDate}.pdf`);
}

function addFooter(doc, pageWidth, pageHeight, margin) {
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setDrawColor(...COLORS.primaryLight);
        doc.setLineWidth(0.3);
        doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);

        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.gray);
        doc.text('Documento de carácter confidencial e institucional — Sanatorio Argentino', margin, pageHeight - 6);
        doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
    }
}
