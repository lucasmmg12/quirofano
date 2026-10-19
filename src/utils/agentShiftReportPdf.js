/**
 * agentShiftReportPdf.js — Generador oficial de PDF para el Resumen de Final de Turno
 * Contact Center · Sanatorio Argentino
 * 
 * Estética idéntica a la Constancia de Asociaciones (Navy Blue #0D3B66, Accent Blue #0284C7, Info Bar y Grid Tables):
 * - Encabezado Sanatorio Argentino (#0D3B66) con logo oficial circular
 * - Info-box de metadatos clínicos y operativos del agente y la jornada
 * - Tarjeta destacada de Diagnóstico Cualitativo de Desempeño
 * - 4 KPIs Hero (Mensajes, Finalizados, Turnos SALUS y Total Gestionados)
 * - Desglose clasificado de consultas por intención (Tabla con autoTable)
 * - Distribución horaria y franja horaria pico (07:00 a 21:00 hs)
 * - Tabla completa de Turnos Agendados en SALUS con DNI, Médico y Especialidad
 * - Tabla de Turnos Cancelados / Anulados en SALUS con Motivo y Asistencia
 * - Bloque de Firmas Institucionales (Operadora y Supervisión Contact Center)
 * - Paginación oficial y pie de página institucional
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getSanatorioLogoBase64, SANATORIO_LOGO_BASE64 } from './sanatorioLogoBase64';

// Paleta institucional (Estándar Asociaciones · Sanatorio Argentino)
const THEME = {
    navy: [13, 59, 102],       // #0D3B66 — Azul Marino Principal
    accent: [2, 132, 199],     // #0284C7 — Celeste Institucional
    darkText: [15, 23, 42],    // #0F172A — Texto principal
    bodyText: [51, 65, 85],    // #334155 — Texto regular
    mutedText: [100, 116, 139],// #64748B — Textos secundarios
    cardBg: [248, 250, 252],   // #F8FAFC — Fondos de tarjetas
    border: [226, 232, 240],   // #E2E8F0 — Bordes
    success: [22, 163, 74],    // #16A34A
    danger: [220, 38, 38],     // #DC2626
    warning: [217, 119, 6],    // #D97706
    purple: [109, 40, 217],    // #6D28D9
    white: [255, 255, 255]
};

/**
 * Sanitiza textos para evitar caracteres rotos o emojis en jsPDF
 */
function cleanText(text) {
    if (!text) return '';
    return String(text)
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '')
        .replace(/[^\x20-\x7E\xA0-\xFF\u00C0-\u017F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Genera y descarga el PDF profesional del Resumen de Final de Turno
 */
export async function generateAgentShiftPdf(metrics, options = {}) {
    if (!metrics) throw new Error('No se proporcionaron métricas para generar el PDF');

    const {
        fecha = new Date().toISOString().substring(0, 10),
        agente = {},
        kpis = {},
        turnosSalusDetalle = [],
        canceladosSalusDetalle = [],
        categorias = {},
        hourlyDistribution = {},
        score = {},
        insights = []
    } = metrics;

    const agentName = cleanText(agente.fullName || agente.name || 'Operadora');
    const agentFirstName = cleanText(agente.firstName || agentName.split(' ')[0]);

    // Crear documento A4 Vertical
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

    // ─── 1. Logo Sanatorio Argentino (Circular) ───
    let logoBase64 = null;
    try {
        logoBase64 = await getSanatorioLogoBase64();
    } catch {
        logoBase64 = SANATORIO_LOGO_BASE64;
    }

    // ─── 2. Header Institucional (Barra Azul Navy) ───
    doc.setFillColor(...THEME.navy);
    doc.rect(0, 0, pageW, 32, 'F');

    // Línea de acento cyan / celeste Sanatorio
    doc.setFillColor(...THEME.accent);
    doc.rect(0, 32, pageW, 2.2, 'F');

    // Logo circular
    const logoX = margin + 1;
    const logoY = 6;
    const logoSize = 18;
    if (logoBase64) {
        try {
            doc.setFillColor(255, 255, 255);
            doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 1.2, 'F');
            doc.addImage(logoBase64, 'PNG', logoX, logoY, logoSize, logoSize);
        } catch {
            doc.setFillColor(255, 255, 255);
            doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 'F');
            doc.setFontSize(8);
            doc.setTextColor(...THEME.navy);
            doc.text('SA', logoX + 5, logoY + logoSize / 2 + 2);
        }
    }

    // Título y Subtítulo
    doc.setFontSize(14.5);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('SANATORIO ARGENTINO', margin + 22, 13);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(203, 213, 225); // Slate 300
    doc.text('Contact Center · Auditoria de Productividad y Cierre de Jornada', margin + 22, 19);
    doc.text('Métricas asistenciales y cruce de turnos en vivo con SALUS', margin + 22, 24);

    // Titular derecho
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('RESUMEN DE FINAL DE TURNO', pageW - margin, 13, { align: 'right' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(203, 213, 225);
    doc.text('Sistema ADM-QUI · Contact Center', pageW - margin, 19, { align: 'right' });
    const formattedEmision = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    doc.text(`Corte: ${formattedEmision} hs`, pageW - margin, 24, { align: 'right' });

    y = 42;

    // ─── 3. INFO BAR DE METADATOS (Estilo Asociaciones) ───
    doc.setFillColor(...THEME.cardBg);
    doc.roundedRect(margin, y, colW, 16, 2.5, 2.5, 'F');
    doc.setDrawColor(...THEME.border);
    doc.roundedRect(margin, y, colW, 16, 2.5, 2.5, 'S');

    const [yyyy, mm, dd] = (fecha || '').split('-');
    const fechaFormat = dd && mm && yyyy ? `${dd}/${mm}/${yyyy}` : fecha;

    const infoCells = [
        { label: 'OPERADORA DE TURNO', value: agentName || 'No especificada' },
        { label: 'FECHA AUDITADA', value: fechaFormat },
        { label: 'CALIFICACION', value: cleanText(score.nivel || 'Estable') },
        { label: 'TURNOS SALUS', value: `${kpis.turnosSalus || 0} dados (${kpis.turnosCancelados || 0} canc.)` }
    ];

    const cellW = colW / infoCells.length;
    infoCells.forEach((c, idx) => {
        const cx = margin + cellW * idx + 4;
        doc.setFontSize(6.2);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...THEME.mutedText);
        doc.text(c.label, cx, y + 5.5);

        doc.setFontSize(idx === 0 ? 8.5 : 8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...THEME.navy);
        doc.text(doc.splitTextToSize(c.value, cellW - 6)[0] || '—', cx, y + 11.5);
    });

    y += 22;

    // ─── 4. DIAGNÓSTICO DESTACADO DEL TURNO ───
    const diagText = cleanText(score.diagnostico || 'Jornada asistencial registrada.');
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...THEME.border);
    doc.roundedRect(margin, y, colW, 16, 2, 2, 'FD');

    // Borde izquierdo coloreado
    doc.setFillColor(...THEME.accent);
    doc.rect(margin, y, 3.5, 16, 'F');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...THEME.accent);
    doc.text('DIAGNOSTICO CUALITATIVO DE IA Y RENDIMIENTO', margin + 6, y + 5.2);

    doc.setFontSize(7.6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...THEME.bodyText);
    const diagLines = doc.splitTextToSize(diagText, colW - 12);
    doc.text(diagLines.slice(0, 2), margin + 6, y + 10.5);

    y += 21;

    // ─── 5. 5 KPIS HERO (Bloques con elevación / cajas) ───
    const kpiCards = [
        {
            title: 'INGRESADOS HOY',
            val: String(kpis.conversacionesIngresadas || 0),
            sub: `${kpis.ingresadosHoyAtendidos || 0} atend. (${kpis.tasaAtencion || 0}%)`,
            color: THEME.accent
        },
        {
            title: 'ATENDIDOS JORNADA',
            val: String(kpis.totalAtendidasJornada || kpis.conversacionesAtendidas || 0),
            sub: `${kpis.arrastreAnteriorAtendido || 0} arrastre previo`,
            color: THEME.success
        },
        {
            title: 'CASOS FINALIZADOS',
            val: String(kpis.conversacionesFinalizadas || 0),
            sub: `${kpis.tasaResolucion || 0}% tasa resolutiva`,
            color: [5, 150, 105]
        },
        {
            title: 'TURNOS EN SALUS',
            val: String(kpis.turnosSalus || 0),
            sub: `${kpis.turnosCancelados || 0} cancelaciones`,
            color: THEME.purple
        },
        {
            title: 'MENSAJES ENVIADOS',
            val: String(kpis.mensajesEnviados || 0),
            sub: `~${kpis.promMensajesPorChat || 0} msgs/conv`,
            color: THEME.navy
        }
    ];

    const kpiCardW = (colW - 12) / 5;
    const kpiCardH = 21;

    kpiCards.forEach((kpi, i) => {
        const kx = margin + (kpiCardW + 3) * i;
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(...THEME.border);
        doc.roundedRect(kx, y, kpiCardW, kpiCardH, 2, 2, 'FD');

        // Etiqueta superior
        doc.setFontSize(5.8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...THEME.mutedText);
        doc.text(kpi.title, kx + 3, y + 5);

        // Valor numérico hero
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...THEME.darkText);
        doc.text(kpi.val, kx + 3, y + 12.5);

        // Subtexto
        doc.setFontSize(5.8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...kpi.color);
        doc.text(kpi.sub, kx + 3, y + 17.5);
    });

    y += kpiCardH + 6;

    // ─── 6. TABLA: TIPOS DE CONSULTAS GESTIONADAS ───
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...THEME.navy);
    doc.text('TIPOLOGIAS DE CONSULTA GESTIONADAS EN LA JORNADA', margin, y + 4);

    y += 6;

    const catRows = [
        ['Turnos Nuevos y Citas Médicas', categorias.turnosNuevos?.count || 0, 'Citas para consultorio y especialistas'],
        ['Estudios y Autorizaciones', categorias.estudiosAutorizaciones?.count || 0, 'Ecografías, radiografías, lab y órdenes'],
        ['Reprogramación y Cancelación', categorias.reprogramacionesCancelaciones?.count || 0, 'Modificaciones de turnos agendados'],
        ['Consultas Generales y Asesoría', categorias.consultasInformativas?.count || 0, 'Horarios, coberturas y orientación'],
        ['Guardia y Urgencias', categorias.guardiaUrgencias?.count || 0, 'Derivación rápida a servicio de guardia'],
        ['Otras Gestiones Administrativas', categorias.otros?.count || 0, 'Reclamos y solicitudes varias']
    ];

    const totalCats = catRows.reduce((acc, r) => acc + r[1], 0) || 1;

    const tableCatBody = catRows.map(r => {
        const pct = Math.round((r[1] / totalCats) * 100);
        return [
            cleanText(r[0]),
            String(r[1]),
            `${pct}%`,
            cleanText(r[2])
        ];
    });

    autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['Tipo de Consulta', 'Casos', '% Total', 'Alcance y Foco']],
        body: tableCatBody,
        theme: 'grid',
        styles: {
            fontSize: 7.2,
            cellPadding: 2,
            textColor: THEME.bodyText,
            lineColor: THEME.border,
            lineWidth: 0.2
        },
        headStyles: {
            fillColor: THEME.navy,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 7.2,
            halign: 'left'
        },
        columnStyles: {
            0: { cellWidth: 55, fontStyle: 'bold' },
            1: { cellWidth: 18, halign: 'center' },
            2: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
            3: { cellWidth: 'auto' }
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252]
        }
    });

    y = doc.lastAutoTable.finalY + 6;

    // ─── 7. TABLA DE TURNOS AGENDADOS EN SALUS CON DNI ───
    if (turnosSalusDetalle && turnosSalusDetalle.length > 0) {
        // Verificar si queda espacio en la página
        if (y > pageH - 55) {
            doc.addPage();
            y = 18;
        }

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...THEME.navy);
        doc.text(`DETALLE DE CITAS AGENDADAS EN SALUS (${turnosSalusDetalle.length} TURNOS CREADOS)`, margin, y + 4);

        y += 6;

        const turnosTableBody = turnosSalusDetalle.map((t, i) => [
            String(i + 1),
            cleanText(t.paciente || 'Paciente'),
            cleanText(t.dni || 'Sin DNI'),
            cleanText(t.especialidad || 'Consulta'),
            cleanText(t.medico || 'Médico asignado'),
            cleanText(t.fechaVisita ? `${t.fechaVisita} ${t.horaVisita || ''}` : 'Fecha no especificada'),
            cleanText(t.obraSocial || 'Particular'),
            cleanText(t.horaCreacion || 'Hoy')
        ]);

        autoTable(doc, {
            startY: y,
            margin: { left: margin, right: margin },
            head: [['#', 'Paciente', 'DNI', 'Especialidad', 'Médico', 'Fecha/Hora Cita', 'Obra Social', 'Hora Creación']],
            body: turnosTableBody,
            theme: 'grid',
            styles: {
                fontSize: 6.8,
                cellPadding: 2,
                textColor: THEME.bodyText,
                lineColor: THEME.border,
                lineWidth: 0.2
            },
            headStyles: {
                fillColor: THEME.navy,
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 7,
                halign: 'left'
            },
            columnStyles: {
                0: { cellWidth: 8, halign: 'center' },
                1: { cellWidth: 38, fontStyle: 'bold' },
                2: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
                3: { cellWidth: 25 },
                4: { cellWidth: 32 },
                5: { cellWidth: 25, halign: 'center' },
                6: { cellWidth: 20 },
                7: { cellWidth: 14, halign: 'center' }
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252]
            },
            didDrawPage: (data) => {
                if (data.pageNumber > 1) {
                    drawContinuedHeader(doc, pageW, margin, agentName, fechaFormat);
                }
            }
        });

        y = doc.lastAutoTable.finalY + 6;
    }

    // ─── 8. TABLA DE TURNOS CANCELADOS EN SALUS (SI HUBIESE) ───
    if (canceladosSalusDetalle && canceladosSalusDetalle.length > 0) {
        if (y > pageH - 50) {
            doc.addPage();
            y = 18;
        }

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...THEME.danger);
        doc.text(`REGISTRO DE CANCELACIONES Y ANULACIONES EN SALUS (${canceladosSalusDetalle.length})`, margin, y + 4);

        y += 6;

        const cancTableBody = canceladosSalusDetalle.map((c, i) => [
            String(i + 1),
            cleanText(c.paciente || 'Paciente'),
            cleanText(c.dni || 'Sin DNI'),
            cleanText(c.medico || 'Médico'),
            cleanText(c.especialidad || 'Especialidad'),
            cleanText(c.fechaVisita ? `${c.fechaVisita} ${c.horaVisita || ''}` : 'Cita'),
            cleanText(c.asistencia || 'Cancelado'),
            cleanText(c.motivoAusencia || 'Sin motivo'),
            cleanText(c.agenteCancelacion || agentName)
        ]);

        autoTable(doc, {
            startY: y,
            margin: { left: margin, right: margin },
            head: [['#', 'Paciente', 'DNI', 'Médico', 'Especialidad', 'Fecha Cita', 'Estado', 'Motivo Ausencia', 'Operadora']],
            body: cancTableBody,
            theme: 'grid',
            styles: {
                fontSize: 6.6,
                cellPadding: 2,
                textColor: THEME.bodyText,
                lineColor: THEME.border,
                lineWidth: 0.2
            },
            headStyles: {
                fillColor: [185, 28, 28], // Red 700
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 6.8,
                halign: 'left'
            },
            columnStyles: {
                0: { cellWidth: 7, halign: 'center' },
                1: { cellWidth: 32, fontStyle: 'bold' },
                2: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
                3: { cellWidth: 26 },
                4: { cellWidth: 22 },
                5: { cellWidth: 22, halign: 'center' },
                6: { cellWidth: 18 },
                7: { cellWidth: 20 },
                8: { cellWidth: 17 }
            },
            alternateRowStyles: {
                fillColor: [254, 242, 242] // Red 50
            },
            didDrawPage: (data) => {
                if (data.pageNumber > 1) {
                    drawContinuedHeader(doc, pageW, margin, agentName, fechaFormat);
                }
            }
        });

        y = doc.lastAutoTable.finalY + 6;
    }

    // ─── 9. RITMO DEL TURNO & DISTRIBUCIÓN HORARIA ───
    if (hourlyDistribution && Object.keys(hourlyDistribution).length > 0) {
        if (y > pageH - 45) {
            doc.addPage();
            y = 18;
        }

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...THEME.navy);
        doc.text('CURVA DE RESPUESTAS POR HORA (RITMO DEL TURNO)', margin, y + 4);

        y += 6;

        // Horas clave de 07:00 a 21:00
        const hourKeys = [];
        for (let h = 7; h <= 21; h++) {
            hourKeys.push(`${String(h).padStart(2, '0')}:00`);
        }

        const headHours = hourKeys.map(h => h.substring(0, 2) + 'h');
        const countHours = hourKeys.map(h => String(hourlyDistribution[h] || 0));

        autoTable(doc, {
            startY: y,
            margin: { left: margin, right: margin },
            head: [headHours],
            body: [countHours],
            theme: 'grid',
            styles: {
                fontSize: 6.8,
                cellPadding: 2,
                halign: 'center',
                textColor: THEME.bodyText,
                lineColor: THEME.border,
                lineWidth: 0.2
            },
            headStyles: {
                fillColor: THEME.navy,
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 6.8,
                halign: 'center'
            }
        });

        y = doc.lastAutoTable.finalY + 6;
    }

    // ─── 10. BLOQUE DE FIRMAS INSTITUCIONALES (Igual que Asociaciones) ───
    if (y > pageH - 36) {
        doc.addPage();
        y = 20;
    } else {
        y += 4;
    }

    const sigBoxW = (colW - 12) / 2;
    const sigBoxH = 26;

    // Caja Firma Operadora
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...THEME.border);
    doc.roundedRect(margin, y, sigBoxW, sigBoxH, 2, 2, 'FD');
    doc.setFontSize(6.8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...THEME.navy);
    doc.text('OPERADORA DE TURNO', margin + 4, y + 4.5);
    doc.setFontSize(7.2);
    doc.setTextColor(...THEME.darkText);
    doc.text(agentName, margin + 4, y + 9);
    doc.setDrawColor(203, 213, 225);
    doc.line(margin + 6, y + sigBoxH - 6, margin + sigBoxW - 6, y + sigBoxH - 6);
    doc.setFontSize(5.8);
    doc.setTextColor(...THEME.mutedText);
    doc.setFont('helvetica', 'normal');
    doc.text('Firma y Aclaración Operadora', margin + sigBoxW / 2, y + sigBoxH - 2.5, { align: 'center' });

    // Caja Firma Supervisión / Coordinación
    const supX = margin + sigBoxW + 12;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...THEME.border);
    doc.roundedRect(supX, y, sigBoxW, sigBoxH, 2, 2, 'FD');
    doc.setFontSize(6.8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...THEME.navy);
    doc.text('SUPERVISION / COORDINACION', supX + 4, y + 4.5);
    doc.setFontSize(7.2);
    doc.setTextColor(...THEME.darkText);
    doc.text('Contact Center · Sanatorio Argentino', supX + 4, y + 9);
    doc.setDrawColor(203, 213, 225);
    doc.line(supX + 6, y + sigBoxH - 6, supX + sigBoxW - 6, y + sigBoxH - 6);
    doc.setFontSize(5.8);
    doc.setTextColor(...THEME.mutedText);
    doc.setFont('helvetica', 'normal');
    doc.text('Control y Validación de Auditoría', supX + sigBoxW / 2, y + sigBoxH - 2.5, { align: 'center' });

    // ─── 11. PIE DE PÁGINA EN TODAS LAS HOJAS ───
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setDrawColor(...THEME.border);
        doc.line(margin, pageH - 8, pageW - margin, pageH - 8);

        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...THEME.mutedText);
        doc.text(
            'Documento Oficial · Sanatorio Argentino · ADM-QUI Contact Center Analytics',
            margin,
            pageH - 4.5
        );
        doc.text(
            `Página ${p} de ${totalPages}`,
            pageW - margin,
            pageH - 4.5,
            { align: 'right' }
        );
    }

    // ─── 12. Descarga del Documento ───
    const cleanAgentFile = agentName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    const filename = `Resumen_Turno_${cleanAgentFile}_${fecha}.pdf`;
    doc.save(filename);

    return { filename, totalPages };
}

/**
 * Cabecera compacta para páginas adicionales (2, 3, etc.)
 */
function drawContinuedHeader(doc, pageW, margin, agentName, fechaFormat) {
    doc.setFillColor(...THEME.navy);
    doc.rect(0, 0, pageW, 10, 'F');
    doc.setFillColor(...THEME.accent);
    doc.rect(0, 10, pageW, 1.2, 'F');

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(`SANATORIO ARGENTINO · RESUMEN DE FINAL DE TURNO (Cont.)`, margin, 6.8);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(203, 213, 225);
    doc.text(`Operadora: ${agentName} · Fecha: ${fechaFormat}`, pageW - margin, 6.8, { align: 'right' });
}
