import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { installSafePdfText } from './gobernanzaServiceProjectPdf';

const COLORS = {
    primary: [30, 95, 166],        // #1E5FA6 Azul Institucional Sanatorio Argentino
    primaryDark: [15, 23, 42],     // #0F172A
    primaryLight: [239, 246, 255], // #EFF6FF
    dark: [30, 41, 59],            // #1E293B
    gray: [100, 116, 139],         // #64748B
    lightGray: [248, 250, 252],    // #F8FAFC
    white: [255, 255, 255],
    red: [225, 29, 72],            // #E11D48
    amber: [217, 119, 6],          // #D97706
    green: [5, 150, 105],          // #059669
    blue: [37, 99, 235]            // #2563EB
};

/**
 * Genera y descarga un reporte clínico en PDF con el detalle nominal de pacientes
 * con cirugías suspendidas en Sanatorio Argentino.
 */
export function exportSuspensionesPdf({
    patients = [],
    categoriaKey = 'TODOS',
    categoriaLabel = 'Todas las Causales',
    causalesDesc = 'Catálogo Oficial de Motivos (1 al 13)',
    periodoLabel = 'Período Auditado',
    totalProgramadas = 0,
    totalSuspendidas = 0,
    tasaSuspension = '0.00'
}) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    installSafePdfText(doc);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    let y = margin;

    // --- ENCABEZADO INSTITUCIONAL ---
    doc.setFillColor(...COLORS.primary);
    doc.rect(0, 0, pageWidth, 24, 'F');

    doc.setTextColor(...COLORS.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('SANATORIO ARGENTINO', margin, 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('Dirección Médica • Gobernanza y Auditoría de Quirófano — Reporte Nominal de Suspensiones', margin, 17);

    // Fecha de generación a la derecha
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
    doc.setFontSize(8);
    doc.text(`Fecha de Emisión: ${dateStr}`, pageWidth - margin, 10, { align: 'right' });
    doc.text(`Período: ${periodoLabel}`, pageWidth - margin, 17, { align: 'right' });

    y = 30;

    // --- BANNER DE CATEGORÍA AUDITADA ---
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 18, 3, 3, 'FD');

    doc.setTextColor(...COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(`AUDITORÍA NOMINAL: ${categoriaLabel.toUpperCase()}`, margin + 6, y + 7);

    doc.setTextColor(...COLORS.gray);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`${causalesDesc} • Total casos identificados: ${patients.length}`, margin + 6, y + 13);

    // --- CUADRO DE INDICADORES (KPIs) ---
    const kpiX = pageWidth - margin - 120;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.dark);
    doc.text(`Cx Programadas: ${totalProgramadas || '—'}`, kpiX, y + 7);
    doc.text(`Susp. Totales: ${totalSuspendidas || '—'} (${tasaSuspension}%)`, kpiX, y + 13);
    doc.text(`En este grupo: ${patients.length} pacientes`, kpiX + 60, y + 7);

    y += 24;

    // --- TABLA DE PACIENTES (autoTable) ---
    const tableHeaders = [
        'N°',
        'Fecha Cx',
        'Paciente / Contacto',
        'NHC',
        'Cirujano / Especialista',
        'Sala',
        'Procedimiento / Módulo Quirúrgico',
        'Obra Social',
        'Causal Oficial & Motivo'
    ];

    const tableRows = patients.map((p, idx) => {
        const telStr = p.telefono ? `\nTel: ${p.telefono}` : '';
        const dniStr = p.dni ? ` (DNI: ${p.dni})` : '';
        const pacienteCell = `${p.nombre || 'PACIENTE'}${dniStr}${telStr}`;
        const motivoFull = p.causalMotivo || p.motivo || 'Sin causal especificado en SALUS';

        return [
            (idx + 1).toString(),
            p.fecha_cirugia || '—',
            pacienteCell,
            p.id_paciente || '—',
            p.medico || 'SIN CIRUJANO ASIGNADO',
            p.salaEstimada || 'Qx Central',
            p.modulo || p.descripcion || '—',
            p.obra_social || 'PARTICULAR',
            motivoFull
        ];
    });

    autoTable(doc, {
        startY: y,
        head: [tableHeaders],
        body: tableRows,
        margin: { left: margin, right: margin, bottom: 16 },
        styles: {
            fontSize: 7.5,
            cellPadding: 2.5,
            lineColor: [226, 232, 240],
            lineWidth: 0.15,
            textColor: COLORS.dark,
            font: 'helvetica',
            overflow: 'linebreak'
        },
        headStyles: {
            fillColor: COLORS.primary,
            textColor: COLORS.white,
            fontStyle: 'bold',
            fontSize: 7.5,
            halign: 'left'
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252]
        },
        columnStyles: {
            0: { cellWidth: 10, halign: 'center', fontStyle: 'bold' },
            1: { cellWidth: 18, halign: 'center' },
            2: { cellWidth: 46, fontStyle: 'bold' },
            3: { cellWidth: 16, halign: 'center' },
            4: { cellWidth: 40 },
            5: { cellWidth: 20, halign: 'center' },
            6: { cellWidth: 46 },
            7: { cellWidth: 32 },
            8: { cellWidth: 41, fontStyle: 'bold', textColor: COLORS.red }
        },
        didDrawPage: (data) => {
            // Pie de página en cada hoja
            const pageNum = doc.internal.getNumberOfPages();
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(...COLORS.gray);
            doc.text(
                'Sanatorio Argentino — Documento Confidencial para Uso de Auditoría Médica y Gestión Quirúrgica',
                margin,
                pageHeight - 8
            );
            doc.text(
                `Página ${data.pageNumber} de ${pageNum}`,
                pageWidth - margin,
                pageHeight - 8,
                { align: 'right' }
            );
        }
    });

    // Guardar archivo
    const cleanPeriod = (periodoLabel || 'Periodo').replace(/[^a-zA-Z0-9]/g, '_');
    const cleanCat = (categoriaKey || 'General').replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `Suspensiones_${cleanCat}_${cleanPeriod}.pdf`;
    doc.save(fileName);
}
